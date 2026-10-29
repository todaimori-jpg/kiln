/* Kiln — test-storage.js : runs src/core/util.js against stubbed browser locations and
   checks that storage keys are namespaced per deployment on shared hosts only.
   Run: node tools/test-storage.js — no dependencies, no browser. */
const fs = require('fs'), path = require('path'), assert = require('assert');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'util.js'), 'utf8');

function run(url) {
  const u = new URL(url);
  const mem = new Map();
  const win = {
    location: { protocol: u.protocol, hostname: u.hostname, pathname: u.pathname },
    localStorage: {
      getItem: (k) => (mem.has(k) ? mem.get(k) : null),
      setItem: (k, v) => mem.set(k, String(v)),
    },
    document: { getElementById: () => null, createElement: () => ({ style: {} }), body: { appendChild() {} } },
    navigator: { userAgent: 'node' },
    addEventListener() {},
  };
  global.window = win;
  global.document = win.document;
  global.navigator = win.navigator;
  global.localStorage = win.localStorage;
  const K = { platform: { storeGet: (k) => win.localStorage.getItem(k), storeSet: (k, v) => { win.localStorage.setItem(k, v); return true; } } };
  win.K = K;
  global.K = K;
  new Function('window', 'document', 'navigator', 'K', src)(win, win.document, win.navigator, K);
  return { U: K.util, mem };
}

const cases = [
  ['https://bijoux.github.io/kiln-td/', '-kiln-td'],
  ['https://bijoux.github.io/kiln-td-fork/index.html', '-kiln-td-fork'],
  ['https://bijoux.github.io/', ''],
  ['https://kiln.earth/', ''],
  ['http://localhost:3000/kiln-td/', ''],
  ['file:///C/Users/kiln-td/index.html', ''],
  ['https://app.netlify.app/sites/kiln', '-sites'],
];
for (const [url, want] of cases) {
  const { U } = run(url);
  assert.strictEqual(U.SCOPE, want, url + ' -> ' + JSON.stringify(U.SCOPE) + ' want ' + JSON.stringify(want));
}

// Namespaced deployment: writes go to the scoped key, legacy reads still work.
{
  const { U, mem } = run('https://bijoux.github.io/kiln-td/');
  U.store.set('kiln.td.autosave', 'NEW');
  assert.strictEqual(mem.get('kiln.td.autosave-kiln-td'), 'NEW');
  assert.strictEqual(mem.get('kiln.td.autosave'), undefined);
  mem.set('kiln.td.theme', 'light'); // an old unscoped value left by a previous deploy
  assert.strictEqual(U.store.get('kiln.td.theme'), 'light', 'falls back to the legacy key');
  U.store.set('kiln.td.theme', 'dark');
  assert.strictEqual(U.store.get('kiln.td.theme'), 'dark');
  assert.strictEqual(mem.get('kiln.td.theme'), 'light', 'the legacy key is left alone');
  U.store.set('kiln.td.autosave', ''); // File → Clear autosave must really clear
  assert.strictEqual(U.store.get('kiln.td.autosave'), '', 'empty beats legacy fallback');
}

// Root / custom domain: behaves exactly as before.
{
  const { U, mem } = run('https://kiln.earth/');
  U.store.set('kiln.td.autosave', 'X');
  assert.strictEqual(mem.get('kiln.td.autosave'), 'X');
  assert.strictEqual(U.store.get('kiln.td.autosave'), 'X');
}

console.log('util.js storage scoping: all assertions pass');
