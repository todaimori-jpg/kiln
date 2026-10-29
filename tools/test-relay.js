// Checks the relay's DMX packet builders against ANSI E1.31-2018 Table 4-1 offsets,
// and the HTTP proxy against a throwaway local server.
// Requiring relay.js does not open any ports; the server only starts via `node relay.js`.
const { sacn, artnet, sacnHost, encodeOSC, decodeOSC, checkHttp, originAllowed, tokenAllowed, cleanHeaders, httpFetch } = require('./relay.js');

const u16 = (b, o) => b.readUInt16BE(o);
const u32 = (b, o) => b.readUInt32BE(o);
let fails = 0;
const eq = (label, got, want) => {
  const ok = got === want;
  if (!ok) { fails++; console.log(`FAIL ${label}: got ${got}, want ${want}`); }
};

const data = [255, 128, 0, 1, 2];
const p = sacn(1, data, 100);

eq('packet length', p.length, 638);
eq('preamble size', u16(p, 0), 0x0010);
eq('post-amble size', u16(p, 2), 0x0000);
eq('ACN identifier', p.slice(4, 16).toString('latin1'), 'ASC-E1.17\0\0\0');
eq('root flags+length', u16(p, 16), 0x7000 | (638 - 16));
eq('root vector (Data)', u32(p, 18), 0x00000004);
eq('CID manufacturer hi', p[22], 0x73);
eq('CID manufacturer lo', p[23], 0x88);
eq('framing flags+length', u16(p, 38), 0x7000 | (638 - 38));
eq('framing vector', u32(p, 40), 0x00000002);
eq('source name', p.slice(44, 48).toString('utf8'), 'Kiln');
eq('source name NUL padded', p[48], 0);
eq('priority', p[108], 100);
eq('sync address', u16(p, 109), 0);
eq('sequence (first frame)', p[111], 0);
eq('options flags', p[112], 0);
eq('universe', u16(p, 113), 1);
eq('dmp flags+length', u16(p, 115), 0x7000 | (638 - 115));
eq('dmp vector', p[117], 0x02);
eq('dmp set property', p[118], 0xa1);
eq('first property address', u16(p, 119), 0x0000);
eq('address increment', u16(p, 121), 0x0001);
eq('property value count', u16(p, 123), 513);
eq('dmx start code', p[125], 0x00);
eq('channel 1', p[126], 255);
eq('channel 2', p[127], 128);
eq('channel 5', p[130], 2);
eq('channel 6 (unset)', p[131], 0);
eq('tail zeroed', p[637], 0);
eq('sum of layer sizes', 38 + 77 + 523, 638);

// sequence increments per universe, and universes are independent
const p2 = sacn(1, [10]);
eq('sequence (second frame, universe 1)', p2[111], 1);
sacn(2, [10]);
const p3 = sacn(1, [10]);
eq('sequence independent per universe', p3[111], 2);
eq('universe 2 encoded', u16(sacn(2, [1]), 113), 2);

// high universe crossing the multicast byte boundary
eq('multicast for universe 1', sacnHost(1), '239.255.0.1');
eq('multicast for universe 300', sacnHost(300), '239.255.1.44');
eq('multicast for universe 63999', sacnHost(63999), '239.255.249.255');

// priority is clamped to the spec range 0-200
eq('priority clamped high', sacn(1, [1], 999)[108], 200);
eq('priority clamped low', sacn(1, [1], -5)[108], 0);
eq('priority default', sacn(1, [1])[108], 100);

// values are clamped to a byte, matching the Art-Net path
eq('oversized channel clamped', sacn(1, [1000])[126], 255);
eq('513th channel dropped', sacn(1, Array.from({ length: 600 }, (_, i) => i)).length, 638);

// regression check on the existing Art-Net builder: opcode 0x5000 = ArtDmx, length at 16-17
const a = artnet(0, [255, 0, 128]);
eq('artnet length', a.length, 8 + 10 + 512);
eq('artnet id', a.slice(0, 8).toString('latin1'), 'Art-Net\0');
eq('artnet opcode (ArtDmx)', a.readUInt16LE(8), 0x5000);
eq('artnet protver', a.readUInt16BE(10), 14);
eq('artnet universe', a.readUInt16LE(14), 0);
eq('artnet length field', a.readUInt16BE(16), 512);
eq('artnet channel 1', a[18], 255);

// OSC encode/decode round-trip, including the 4-byte padding the spec requires
const oscBuf = encodeOSC('/kiln/level', [0.25, 'hi', 3]);
eq('osc word-aligned', oscBuf.length % 4, 0);
const oscBack = decodeOSC(oscBuf);
eq('osc address round-trip', oscBack.address, '/kiln/level');
eq('osc float round-trip', oscBack.args[0], 0.25);
eq('osc string round-trip', oscBack.args[1], 'hi');
eq('osc int round-trip', oscBack.args[2], 3);
eq('osc arg count', oscBack.args.length, 3);

// ---------- HTTP proxy: request validation ----------
eq('http needs an id', checkHttp({ url: 'https://a.test/x' }), 'http: missing id');
eq('http needs a url', checkHttp({ id: 'a', url: 'not a url' }), 'http: bad or missing url');
eq('http rejects file urls', checkHttp({ id: 'a', url: 'file:///c:/secrets.csv' }), 'http: only http(s) urls are allowed');
eq('http rejects javascript:', checkHttp({ id: 'a', url: 'javascript:alert(1)' }), 'http: only http(s) urls are allowed');
eq('http rejects bogus method', checkHttp({ id: 'a', url: 'https://a.test/x', method: 'TRACE' }), 'http: method not allowed: TRACE');
eq('http rejects bad headers', checkHttp({ id: 'a', url: 'https://a.test/x', headers: ['x'] }), 'http: headers must be an object');
eq('http accepts a get', checkHttp({ id: 'a', url: 'https://a.test/x' }), null);
eq('http accepts a post', checkHttp({ id: 'a', url: 'http://a.test/x', method: 'POST', body: '{}' }), null);

// ---------- HTTP proxy: who may ask ----------
const cfgO = { allowOrigin: ['https://studio.example'], token: '' };
eq('file origin allowed', originAllowed(undefined, cfgO), true);
eq('null origin allowed', originAllowed('null', cfgO), true);
eq('loopback origin allowed', originAllowed('http://localhost:5173', cfgO), true);
eq('127.0.0.1 origin allowed', originAllowed('http://127.0.0.1:8080', cfgO), true);
eq('github pages origin refused', originAllowed('https://someone.github.io', cfgO), false);
eq('github pages allowed once listed', originAllowed('https://studio.example', cfgO), true);
eq('evil origin refused', originAllowed('https://evil.example', cfgO), false);
eq('no token configured accepts all', tokenAllowed('/x', { token: '' }), true);
eq('token matched', tokenAllowed('/x?token=s3cret', { token: 's3cret' }), true);
eq('token missing refused', tokenAllowed('/x', { token: 's3cret' }), false);
eq('wrong token refused', tokenAllowed('/x?token=nope', { token: 's3cret' }), false);

// ---------- HTTP proxy: header filtering ----------
const ch = cleanHeaders({ host: 'evil.example', Origin: 'https://evil.example', 'content-length': 9, Referer: 'x', authorization: 'Bearer k', 'x-api-key': 'k2' });
eq('host stripped', ch.host, undefined);
eq('origin stripped', ch.Origin, undefined);
eq('content-length stripped', ch['content-length'], undefined);
eq('referer stripped', ch.Referer, undefined);
eq('authorization kept', ch.authorization, 'Bearer k');
eq('api key kept', ch['x-api-key'], 'k2');
eq('no headers is an empty object', Object.keys(cleanHeaders(undefined)).length, 0);

// ---------- HTTP proxy: end to end against a local server ----------
const http = require('http');
const CSV = 'station,temp_c\nalc7,4.5\nmine01,-2.1\n';
const srv = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    if (req.url === '/feed.csv') { res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8' }); res.end(CSV); }
    else if (req.url === '/missing') { res.writeHead(404); res.end('no such feed'); }
    else if (req.url === '/big') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('x'.repeat(5000)); }
    else if (req.url === '/hang') { /* never responds */ }
    else if (req.url === '/echo') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ method: req.method, host: req.headers.host, auth: req.headers.authorization || null, cookie: req.headers.cookie || null, body }));
    } else { res.writeHead(404); res.end(''); }
  });
});

(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + srv.address().port;
  const cfg = { timeoutMs: 4000, maxBytes: 1024 };

  const got = await httpFetch({ id: 'a', url: base + '/feed.csv' }, cfg);
  eq('proxies a 200', got.status, 200);
  eq('proxies the exact body', got.body, CSV);
  eq('proxies content-type', got.headers['content-type'], 'text/csv; charset=utf-8');
  eq('not truncated', got.truncated, false);

  const nf = await httpFetch({ id: 'b', url: base + '/missing' }, cfg);
  eq('http error is returned, not thrown', nf.status, 404);
  eq('error body still arrives', nf.body, 'no such feed');

  const big = await httpFetch({ id: 'c', url: base + '/big' }, cfg);
  eq('caps at maxBytes', big.body.length, 1024);
  eq('flags truncation', big.truncated, true);

  const echo = JSON.parse((await httpFetch({ id: 'd', method: 'POST', url: base + '/echo', body: '{"q":"protest"}', headers: { host: 'evil.example', authorization: 'Bearer k', cookie: 'sessionid=stolen' } }, cfg)).body);
  eq('forwards the method', echo.method, 'POST');
  eq('forwards the body', echo.body, '{"q":"protest"}');
  eq('forwards authorization', echo.auth, 'Bearer k');
  eq('caller cannot override host', echo.host, '127.0.0.1:' + srv.address().port);
  eq('cookie still reaches the target', echo.cookie, 'sessionid=stolen');

  let timedOut = null;
  try { await httpFetch({ id: 'e', url: base + '/hang' }, { timeoutMs: 300, maxBytes: 1024 }); }
  catch (e) { timedOut = e.name; }
  eq('a hung server aborts', timedOut, 'AbortError');

  let refused = false;
  try { await httpFetch({ id: 'f', url: 'http://127.0.0.1:1/nope' }, cfg); } catch (e) { refused = true; }
  eq('a dead port rejects', refused, true);

  srv.closeAllConnections && srv.closeAllConnections();
  srv.close();
  console.log(fails ? `\n${fails} ASSERTION(S) FAILED` : '\nAll relay assertions pass (sACN, Art-Net, OSC, HTTP proxy validation + end-to-end).');
  process.exit(fails ? 1 : 0);
})();
