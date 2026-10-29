#!/usr/bin/env node
/*
  Kiln relay — bridges the browser to things browsers can't reach directly
  (UDP: OSC, Art-Net/DMX and sACN/E1.31 · plus an HTTP proxy for APIs without CORS).
  Run:  cd tools && npm install && node relay.js
  Test without a browser: cd tools && node test-relay.js
  In Kiln: add a WebSocket DAT with URL ws://localhost:9980, then from a Script DAT (onFrame):
    kiln.send('websocket1', { type: 'osc', host: '127.0.0.1', port: 7000, address: '/kiln/level', args: [0.5] })
    kiln.send('websocket1', { type: 'artnet', host: '2.255.255.255', universe: 0, data: [255, 0, 128] })
    kiln.send('websocket1', { type: 'sacn', universe: 1, data: [255, 0, 128] })
  sACN universe N multicasts to 239.255.(N >> 8).(N & 255) on port 5568, unless you set host for unicast.
  Art-Net universes are 0-based; sACN universes are 1-based (1–63999).
  Incoming OSC on UDP 9000 is forwarded to Kiln as JSON: { type:'osc', address, args }

  HTTP proxy (needs Node 18+ for global fetch) — for feeds that send no CORS headers,
  which is most government and institutional data. Set it as the "Via Relay" parameter on a
  Web Client DAT, or call it from a Script DAT and get a promise back:
    kiln.request('websocket1', { type: 'http', method: 'GET', url: 'https://example.org/feed.csv' })
      .then((r) => log(r.status + ' ' + r.body.slice(0, 60)));
  The relay replies only to the socket that asked, as { type:'http', id, status, headers, body }.
  Text responses only (UTF-8 decoded); a binary body arrives mangled.

  Security: this is an open proxy for anything that can reach the port, so by default it
  binds 127.0.0.1 and only proxies http(s) for origins that are file://, null or loopback.
  A random website connecting to ws://localhost:9980 can still send OSC/DMX as before, but
  cannot make the proxy fetch. Options, all via environment variables:
    RELAY_HOST=0.0.0.0        listen on another interface (e.g. to reach it from a phone)
    RELAY_TOKEN=s3cret        require ws://localhost:9980/?token=s3cret on every connection
    ALLOW_ORIGIN=https://you.github.io   extra origins for http mode, comma-separated
    HTTP_TIMEOUT=15000 · HTTP_MAX_BYTES=4194304
*/
const dgram = require('dgram');
const WS_PORT = +process.env.WS_PORT || 9980, OSC_IN = +process.env.OSC_IN || 9000;
const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];
const httpCfg = {
  host: process.env.RELAY_HOST || '127.0.0.1',
  token: process.env.RELAY_TOKEN || '',
  allowOrigin: (process.env.ALLOW_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean),
  timeoutMs: +process.env.HTTP_TIMEOUT || 15000,
  maxBytes: +process.env.HTTP_MAX_BYTES || 4 * 1024 * 1024,
};

// Origins allowed to use http mode without further configuration.
function originAllowed(origin, cfg) {
  if (!origin || origin === 'null' || origin === 'file://') return true;
  if (cfg.allowOrigin.indexOf(origin) >= 0) return true;
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);
}
function tokenAllowed(reqUrl, cfg) {
  if (!cfg.token) return true;
  try { return new URL(reqUrl, 'http://' + cfg.host).searchParams.get('token') === cfg.token; } catch (e) { return false; }
}
// Validation for one proxied request. Returns null when it may go out, else a reason.
function checkHttp(m) {
  if (typeof m.id !== 'string' || !m.id) return 'http: missing id';
  let u; try { u = new URL(m.url); } catch (e) { return 'http: bad or missing url'; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'http: only http(s) urls are allowed';
  const method = String(m.method || 'GET').toUpperCase();
  if (HTTP_METHODS.indexOf(method) < 0) return 'http: method not allowed: ' + method;
  if (m.headers !== undefined && (typeof m.headers !== 'object' || m.headers === null || Array.isArray(m.headers))) return 'http: headers must be an object';
  return null;
}
// Hop-by-hop and host-level headers are the fetch layer's business, not the caller's.
const BAD_HEADERS = ['host', 'content-length', 'connection', 'upgrade', 'sec-fetch-mode', 'sec-fetch-site', 'origin', 'referer'];
function cleanHeaders(h) {
  const out = {};
  Object.keys(h || {}).forEach((k) => { if (BAD_HEADERS.indexOf(String(k).toLowerCase()) < 0) out[k] = h[k]; });
  return out;
}
async function readCapped(res, maxBytes) {
  if (!res.body) return { body: '', truncated: false };
  const dec = new TextDecoder('utf-8');
  const chunks = []; let size = 0, truncated = false;
  for await (const c of res.body) {
    chunks.push(c); size += c.length;
    if (maxBytes && size > maxBytes) { truncated = true; break; }
  }
  const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  return { body: dec.decode(truncated ? buf.subarray(0, maxBytes) : buf), truncated };
}
async function httpFetch(m, cfg) {
  const method = String(m.method || 'GET').toUpperCase();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  try {
    const res = await fetch(m.url, {
      method, redirect: 'follow', signal: ctrl.signal, headers: cleanHeaders(m.headers),
      body: method === 'GET' || method === 'HEAD' ? undefined : m.body,
    });
    const r = await readCapped(res, cfg.maxBytes);
    return {
      status: res.status, statusText: res.statusText,
      headers: { 'content-type': res.headers.get('content-type') || '', 'content-length': res.headers.get('content-length') || '' },
      body: r.body, truncated: r.truncated,
    };
  } finally { clearTimeout(timer); }
}


const pad4 = (b) => Buffer.concat([b, Buffer.alloc((4 - (b.length % 4)) || 4)]);
const oscStr = (s) => pad4(Buffer.from(String(s) + '', 'utf8'));
function encodeOSC(address, args) {
  args = [].concat(args || []);
  let tags = ',', parts = [];
  for (const a of args) {
    if (typeof a === 'string') { tags += 's'; parts.push(oscStr(a)); }
    else if (Number.isInteger(a)) { tags += 'i'; const b = Buffer.alloc(4); b.writeInt32BE(a); parts.push(b); }
    else { tags += 'f'; const b = Buffer.alloc(4); b.writeFloatBE(+a || 0); parts.push(b); }
  }
  return Buffer.concat([oscStr(address), oscStr(tags), ...parts]);
}
function readStr(buf, o) { let e = o; while (buf[e]) e++; return [buf.toString('utf8', o, e), (e + 4) & ~3]; }
function decodeOSC(buf) {
  let [address, o] = readStr(buf, 0); let tags; [tags, o] = readStr(buf, o);
  const args = [];
  for (const t of tags.slice(1)) {
    if (t === 'f') { args.push(buf.readFloatBE(o)); o += 4; }
    else if (t === 'i') { args.push(buf.readInt32BE(o)); o += 4; }
    else if (t === 's') { let s; [s, o] = readStr(buf, o); args.push(s); }
  }
  return { address, args };
}
function artnet(universe, data) {
  const d = Buffer.alloc(512); (data || []).slice(0, 512).forEach((v, i) => { d[i] = Math.max(0, Math.min(255, v | 0)); });
  const h = Buffer.from('Art-Net\0', 'ascii');
  const b = Buffer.alloc(10);
  b.writeUInt16LE(0x5000, 0); b.writeUInt16BE(14, 2); b[4] = 0; b[5] = 0; b.writeUInt16LE(universe | 0, 6); b.writeUInt16BE(512, 8);
  return Buffer.concat([h, b, d]);
}

// ANSI E1.31-2018 Table 4-1: root(38) + framing(77) + DMP(523) = 638 bytes.
// Universe is 1-based for sACN, unlike Art-Net's 0-based universe.
const SACN_PORT = +process.env.SACN_PORT || 5568;
const SACN_NAME = String(process.env.SACN_NAME || 'Kiln').slice(0, 63);
const sacnSeq = new Map();
const sacnCid = (() => { const c = Buffer.alloc(16); c[0] = 0x73; c[1] = 0x88; require('crypto').randomBytes(14).copy(c, 2); return c; })();
function sacn(universe, data, priority) {
  const p = Buffer.alloc(638), len = 638;
  p.writeUInt16BE(0x0010, 0);            // preamble size
  p.writeUInt16BE(0x0000, 2);            // post-amble size
  p.write('ASC-E1.17\0\0\0', 4, 'ascii'); // ACN packet identifier
  p.writeUInt16BE(0x7000 | (len - 16), 16);
  p.writeUInt32BE(0x00000004, 18);       // root layer vector: E1.31 Data
  sacnCid.copy(p, 22);                   // source CID
  p.writeUInt16BE(0x7000 | (len - 38), 38);
  p.writeUInt32BE(0x00000002, 40);       // framing vector
  p.write(SACN_NAME, 44, 'utf8');        // source name (64-byte field, NUL padded)
  p[108] = priority == null ? 100 : Math.max(0, Math.min(200, priority | 0));
  p.writeUInt16BE(0, 109);               // sync address
  const seq = (sacnSeq.get(universe) || 0) & 0xff;
  sacnSeq.set(universe, seq + 1);
  p[111] = seq;                          // sequence number
  p[112] = 0;                            // options flags
  p.writeUInt16BE(universe, 113);        // universe
  p.writeUInt16BE(0x7000 | (len - 115), 115);
  p[117] = 0x02;                         // DMP vector
  p[118] = 0xa1;                         // DMP Set Property message type
  p.writeUInt16BE(0x0000, 119);          // first property address
  p.writeUInt16BE(0x0001, 121);          // address increment
  p.writeUInt16BE(513, 123);             // property value count: 512 slots + start code
  p[125] = 0;                            // DMX start code
  (data || []).slice(0, 512).forEach((v, i) => { p[126 + i] = Math.max(0, Math.min(255, v | 0)); });
  return p;
}
const sacnHost = (u) => '239.255.' + ((u >> 8) & 0xff) + '.' + (u & 0xff);

function start() {
  const { WebSocketServer } = require('ws');
  const udp = dgram.createSocket('udp4');
  udp.bind(() => udp.setBroadcast(true));
  const wss = new WebSocketServer({ port: WS_PORT, host: httpCfg.host });
  wss.on('connection', (ws, req) => {
    if (!tokenAllowed(req.url, httpCfg)) { ws.close(1008, 'bad token'); return; }
    const origin = req.headers.origin;
    const reply = (obj) => { try { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); } catch (e) {} };
    ws.on('message', (raw) => {
      let m; try { m = JSON.parse(raw); } catch (e) { return; }
      if (m.type === 'osc') udp.send(encodeOSC(m.address, m.args), m.port || 7000, m.host || '127.0.0.1');
      else if (m.type === 'artnet') udp.send(artnet(m.universe, m.data), 6454, m.host || '2.255.255.255');
      else if (m.type === 'sacn') { const u = m.universe | 0; if (u >= 1 && u <= 63999) udp.send(sacn(u, m.data, m.priority), SACN_PORT, m.host || sacnHost(u)); }
      else if (m.type === 'http') {
        if (!originAllowed(origin, httpCfg)) return reply({ type: 'http', id: m.id, error: 'http: origin refused: ' + (origin || 'none') + ' (add it to ALLOW_ORIGIN)' });
        const why = checkHttp(m);
        if (why) return reply({ type: 'http', id: m.id, error: why });
        httpFetch(m, httpCfg)
          .then((r) => reply(Object.assign({ type: 'http', id: m.id }, r)))
          .catch((e) => reply({ type: 'http', id: m.id, error: e && e.name === 'AbortError' ? 'http: timed out after ' + httpCfg.timeoutMs + 'ms' : 'http: ' + ((e && e.message) || e) }));
      }
    });
  });
  const oscIn = dgram.createSocket('udp4');
  oscIn.on('message', (buf) => {
    try { const msg = JSON.stringify(Object.assign({ type: 'osc' }, decodeOSC(buf))); wss.clients.forEach((c) => c.readyState === 1 && c.send(msg)); } catch (e) {}
  });
  oscIn.bind(OSC_IN);
  console.log(`Kiln relay: ws://${httpCfg.host}:${WS_PORT}  ·  OSC in udp:${OSC_IN}  ·  OSC/Art-Net/sACN out via JSON`);
  console.log(`HTTP proxy: ${httpCfg.token ? 'token required' : 'no token'}  ·  origins allowed: ${httpCfg.allowOrigin.length ? httpCfg.allowOrigin.join(' ') : 'file://, null, loopback'}  ·  timeout ${httpCfg.timeoutMs}ms  ·  max ${Math.round(httpCfg.maxBytes / 1024)}KB`);
  if (httpCfg.host !== '127.0.0.1' && !httpCfg.token) console.log('  WARNING: listening on ' + httpCfg.host + ' without RELAY_TOKEN — anyone on the network can drive this relay.');
}

if (require.main === module) start();

module.exports = { encodeOSC, decodeOSC, artnet, sacn, sacnHost, checkHttp, originAllowed, tokenAllowed, cleanHeaders, httpFetch, httpCfg, start };
