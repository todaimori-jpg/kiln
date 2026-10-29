/* Kiln — dats.js : Data Operators (text, tables, scripts, web/serial I/O) */
(function () {
  'use strict';
  const K = window.K, U = K.util;

  function tryJSON(t) { try { const s = String(t).trim(); if (s[0] === '{' || s[0] === '[') return JSON.parse(s); } catch (e) {} return undefined; }

  K.defineOp({
    type: 'textDAT', label: 'Text', short: 'text', family: 'DAT', gen: true,
    help: 'Free-form text: notes, copy, GLSL code, JSON. JSON is parsed automatically (op(\'text1\').json).',
    params: [{ name: 'text', label: 'Text', type: 'code', lang: 'text', default: 'Hello from a Text DAT' }],
    cook(op) { const t = String(K.par(op, 'text')); return { text: t, json: tryJSON(t), table: t.split('\n').map((l) => [l]) }; },
  });

  K.defineOp({
    type: 'tableDAT', label: 'Table', short: 'table', family: 'DAT', gen: true,
    help: 'Editable table of cells. Drive Text TOPs with op(\'table1\').cell(row, col) — ideal for slide copy.',
    params: [{ name: 'table', label: 'Table', type: 'table', default: [['title', 'subtitle'], ['Hello', 'World']] }],
    cook(op) {
      const t = op.p.table || [[]];
      return { table: t, text: t.map((r) => r.join('\t')).join('\n') };
    },
  });

  /* ---------- Script DAT (JavaScript — the Python equivalent) ---------- */
  K.DEFAULT_SCRIPT = `// Runs inside Kiln every frame (like an Execute DAT).
// op('name').par.x = value  sets parameters
// op('lfo1')[0]             reads CHOP channels
// t = seconds, frame = frame number
function onStart() {
  log('script started');
}
function onFrame(t, frame) {
  // const n = op('noise1');
  // if (n) n.par.period = 2 + Math.sin(t) * 0.5;
}
`;
  K.defineOp({
    type: 'scriptDAT', label: 'Script', short: 'script', family: 'DAT', gen: true,
    help: 'JavaScript that runs every frame to drive parameters, logic, sequencing. Exposes op(), log(), kiln (play/pause/seek), t, frame.',
    params: [
      { name: 'code', label: 'Script', type: 'code', lang: 'js', default: K.DEFAULT_SCRIPT },
      { name: 'active', label: 'Active', type: 'toggle', default: true },
      { name: 'restart', label: 'Re-run onStart', type: 'pulse' },
    ],
    pulse(op, n) { if (n === 'restart') op.rt.started = false; },
    preCook(op) {
      if (!K.par(op, 'active')) return;
      const code = String(op.p.code);
      if (code !== op.rt.code) {
        op.rt.code = code; op.rt.started = false; op.rt.err = null;
        try {
          // eslint-disable-next-line no-new-func
          const f = new Function('op', 'log', 'kiln', 'me', 'S', code + '\n;return { onStart: typeof onStart==="function"?onStart:null, onFrame: typeof onFrame==="function"?onFrame:null };');
          op.rt.fns = f(K.scope.op, (...a) => logLine(op, a), K.api, K.handle(op), K.scope);
        } catch (e) { op.rt.err = e.message; op.rt.fns = null; }
      }
      const fns = op.rt.fns;
      if (!fns) return;
      try {
        if (!op.rt.started) { op.rt.started = true; fns.onStart && fns.onStart(); }
        fns.onFrame && fns.onFrame(K.time.seconds, K.time.frame);
        op.rt.err = null;
      } catch (e) { op.rt.err = e.message; }
    },
    cook(op) {
      if (op.rt.err) op.error = op.rt.err;
      const log = op.rt.log || [];
      return { text: log.join('\n'), table: log.map((l) => [l]) };
    },
  });
  function logLine(op, args) {
    op.rt.log = op.rt.log || [];
    op.rt.log.push(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' '));
    if (op.rt.log.length > 60) op.rt.log.shift();
  }

  /* ---------- Web Client DAT ---------- */
  K.defineOp({
    type: 'webclientDAT', label: 'Web Client', short: 'webclient', family: 'DAT', gen: true,
    help: 'HTTP GET/POST to an API. JSON is parsed into .json; delimited text (CSV/TSV) is split into columns by the Delimiter parameter, so DAT to CHOP gets numbers either way. APIs that send no CORS headers are refused by the browser — set "Via Relay" to a connected WebSocket DAT running tools/relay.js instead.',
    params: [
      { name: 'url', label: 'URL', type: 'string', default: 'https://api.open-meteo.com/v1/forecast?latitude=44.98&longitude=-93.27&current=temperature_2m,wind_speed_10m' },
      { name: 'method', label: 'Method', type: 'menu', options: ['GET', 'POST'], default: 'GET' },
      { name: 'body', label: 'Body (POST)', type: 'text', default: '' },
      { name: 'interval', label: 'Auto Refresh (s, 0 = off)', type: 'float', default: 0, min: 0, max: 3600 },
      { name: 'via', label: 'Via Relay (WebSocket DAT)', type: 'op', family: 'DAT', filter: 'websocketDAT', default: '' },
      { name: 'delimiter', label: 'Delimiter', type: 'menu', options: ['auto', 'none', 'comma', 'semicolon', 'tab', 'pipe'], default: 'auto' },
      { name: 'request', label: 'Request', type: 'pulse' },
    ],
    pulse(op, n) { if (n === 'request') doFetch(op); },
    cook(op) {
      const iv = K.parNum(op, 'interval');
      if (iv > 0 && (!op.rt.lastReq || K.time.absSeconds - op.rt.lastReq > iv)) doFetch(op);
      if (op.rt.pending) op.warn = 'Relay request pending…';
      else if (op.rt.err) op.warn = op.rt.err;
      const text = op.rt.text || '';
      return {
        text, json: op.rt.json, status: op.rt.status, via: op.rt.via || 'direct',
        table: U.parseDelimited(text, K.par(op, 'delimiter')).slice(0, 200),
      };
    },
  });
  function doFetch(op) {
    op.rt.lastReq = K.time.absSeconds;
    const m = K.par(op, 'method'), url = K.par(op, 'url'), relay = K.par(op, 'via');
    const fail = (e) => { op.rt.pending = false; op.rt.err = 'Request failed: ' + ((e && e.message) || e); };
    if (relay) {
      const sock = K.findOp(relay);
      if (!sock || !sock.rt.ws || sock.rt.ws.readyState !== 1) { op.rt.err = 'Relay: press Connect on WebSocket DAT "' + relay + '" first'; return; }
      op.rt.pending = true; op.rt.via = 'relay';
      K.api.request(relay, { type: 'http', method: m, url, body: m === 'POST' ? K.par(op, 'body') : undefined })
        .then((r) => {
          op.rt.pending = false;
          op.rt.status = r.status;
          op.rt.text = r.body == null ? '' : String(r.body);
          op.rt.json = tryJSON(op.rt.text);
          op.rt.err = r.truncated ? 'Response truncated by the relay (HTTP_MAX_BYTES)' : null;
        })
        .catch(fail);
      return;
    }
    op.rt.via = 'direct';
    fetch(url, m === 'POST' ? { method: 'POST', body: K.par(op, 'body'), headers: { 'Content-Type': 'application/json' } } : undefined)
      .then((r) => { op.rt.status = r.status; return r.text(); })
      .then((t) => { op.rt.text = t; op.rt.json = tryJSON(t); op.rt.err = null; })
      .catch(fail);
  }

  /* ---------- WebSocket DAT ---------- */
  K.defineOp({
    type: 'websocketDAT', label: 'WebSocket', short: 'websocket', family: 'DAT', gen: true,
    help: 'Bidirectional WebSocket client. Bridge OSC, DMX/Art-Net, Ableton or sensors through a small local relay (see docs/HARDWARE.md).',
    params: [
      { name: 'url', label: 'URL', type: 'string', default: 'ws://localhost:8080' },
      { name: 'connect', label: 'Connect', type: 'pulse' },
      { name: 'disconnect', label: 'Disconnect', type: 'pulse' },
      { name: 'msg', label: 'Message', type: 'string', default: '{"hello":"kiln"}' },
      { name: 'send', label: 'Send', type: 'pulse' },
      { name: 'keep', label: 'Keep Last N', type: 'int', default: 30, min: 1, max: 500 },
    ],
    destroy(op) { try { op.rt.ws && op.rt.ws.close(); } catch (e) {} },
    pulse(op, n) {
      if (n === 'connect') {
        try { op.rt.ws && op.rt.ws.close(); } catch (e) {}
        try {
          const ws = new WebSocket(K.par(op, 'url'));
          op.rt.state = 'connecting';
          ws.onopen = () => { op.rt.state = 'open'; };
          ws.onclose = () => { op.rt.state = 'closed'; };
          ws.onerror = () => { op.rt.state = 'error'; };
          ws.onmessage = (e) => {
            op.rt.msgs = op.rt.msgs || [];
            op.rt.msgs.push(String(e.data));
            while (op.rt.msgs.length > K.parNum(op, 'keep')) op.rt.msgs.shift();
            const j = tryJSON(e.data); if (j !== undefined) { op.rt.json = j; K.resolveRelay(j); }
          };
          op.rt.ws = ws;
        } catch (e) { op.rt.state = 'error: ' + e.message; }
      }
      if (n === 'disconnect' && op.rt.ws) op.rt.ws.close();
      if (n === 'send' && op.rt.ws && op.rt.ws.readyState === 1) op.rt.ws.send(K.par(op, 'msg'));
    },
    cook(op) {
      if (op.rt.state !== 'open') op.warn = 'Socket: ' + (op.rt.state || 'not connected');
      const msgs = op.rt.msgs || [];
      return { text: msgs.join('\n'), json: op.rt.json, table: msgs.map((m) => [m]) };
    },
  });
  K.api = K.api || {};
  K.api.send = function (name, data) { const o = K.findOp(name); if (o && o.rt.ws && o.rt.ws.readyState === 1) o.rt.ws.send(typeof data === 'string' ? data : JSON.stringify(data)); };

  /* kiln.request(wsDatName, message) — sends and returns a Promise resolved by the reply
     that carries the same id. Used by Web Client DAT's "Via Relay" and by scripts that
     need the relay's http proxy: kiln.request('websocket1', { type:'http', url:… }) */
  const pendingReq = new Map(); let reqSeq = 0;
  K.api.request = function (name, data) {
    const o = K.findOp(name);
    if (!o || !o.rt.ws || o.rt.ws.readyState !== 1) return Promise.reject(new Error('WebSocket "' + name + '" is not connected'));
    const id = 'k' + (++reqSeq);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { if (pendingReq.delete(id)) reject(new Error('Relay: no reply to ' + ((data && data.type) || 'request'))); }, +(data && data.timeoutMs) || 20000);
      pendingReq.set(id, { resolve, reject, timer });
      try { o.rt.ws.send(JSON.stringify(Object.assign({ id }, data))); }
      catch (e) { clearTimeout(timer); pendingReq.delete(id); reject(e); }
    });
  };
  // Called by the WebSocket DAT for every JSON message; true when it was an answer we were waiting for.
  K.resolveRelay = function (j) {
    if (!j || typeof j !== 'object' || typeof j.id !== 'string') return false;
    const p = pendingReq.get(j.id);
    if (!p) return false;
    pendingReq.delete(j.id); clearTimeout(p.timer);
    if (j.error) p.reject(new Error(j.error)); else p.resolve(j);
    return true;
  };

  /* ---------- Serial DAT (Arduino, microcontrollers) ---------- */
  K.defineOp({
    type: 'serialDAT', label: 'Serial', short: 'serial', family: 'DAT', gen: true,
    help: 'Web Serial link to Arduino / Raspberry Pi Pico etc. (Chrome/Edge desktop). Incoming lines like "512,300,1" become a table → DAT to CHOP.',
    params: [
      { name: 'baud', label: 'Baud Rate', type: 'menu', options: ['9600', '19200', '38400', '57600', '115200'], default: '115200' },
      { name: 'connect', label: 'Connect Port', type: 'pulse' },
      { name: 'msg', label: 'Send Line', type: 'string', default: '' },
      { name: 'send', label: 'Send', type: 'pulse' },
    ],
    pulse(op, n) {
      if (n === 'connect') {
        if (!navigator.serial) { K.toast('Web Serial is not supported here (use desktop Chrome or Edge).'); return; }
        navigator.serial.requestPort().then(async (port) => {
          await port.open({ baudRate: parseInt(K.par(op, 'baud'), 10) });
          op.rt.port = port; op.rt.state = 'open';
          const dec = new TextDecoderStream(); port.readable.pipeTo(dec.writable);
          const reader = dec.readable.getReader(); let buf = '';
          op.rt.writer = port.writable.getWriter();
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += value;
            const lines = buf.split(/\r?\n/); buf = lines.pop();
            lines.forEach((l) => { op.rt.lines = op.rt.lines || []; op.rt.lines.push(l); if (op.rt.lines.length > 50) op.rt.lines.shift(); });
          }
        }).catch((e) => { op.rt.state = 'error: ' + e.message; });
      }
      if (n === 'send' && op.rt.writer) op.rt.writer.write(new TextEncoder().encode(K.par(op, 'msg') + '\n'));
    },
    cook(op) {
      if (op.rt.state !== 'open') op.warn = 'Press Connect Port';
      const lines = op.rt.lines || [];
      const last = (lines[lines.length - 1] || '').split(/[\s,;]+/).filter(Boolean);
      return { text: lines.join('\n'), table: [last.map((_, i) => 'v' + i), last] };
    },
  });
})();
