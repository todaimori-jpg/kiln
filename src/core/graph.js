/* Kiln — graph.js : operator registry, project model, expressions, cooking, history */
(function () {
  'use strict';
  const K = window.K, U = K.util;

  /* ---------------- event bus ---------------- */
  const handlers = {};
  K.bus = {
    on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); },
    emit(ev, a, b) { (handlers[ev] || []).forEach((fn) => { try { fn(a, b); } catch (e) { console.error(e); } }); },
  };

  /* ---------------- families ---------------- */
  K.FAMILIES = {
    TOP: { label: 'TOP', name: 'Texture', color: '#8c6bd8', desc: 'GPU image generation, compositing and effects' },
    CHOP: { label: 'CHOP', name: 'Channel', color: '#5ab56b', desc: 'Motion, audio, LFOs, controllers and signals' },
    SOP: { label: 'SOP', name: 'Surface', color: '#4f8fd6', desc: '3D geometry, point clouds and particles' },
    MAT: { label: 'MAT', name: 'Material', color: '#d9b44a', desc: 'Surface shading: constant, phong, PBR' },
    DAT: { label: 'DAT', name: 'Data', color: '#d66fa6', desc: 'Text, tables, scripts, shaders, web & serial I/O' },
    COMP: { label: 'COMP', name: 'Component', color: '#9aa0a8', desc: '3D objects, cameras, lights, UI panels, networks' },
  };

  /* ---------------- registry ---------------- */
  K.types = {};
  K.defineOp = function (def) {
    def.params = def.params || [];
    def.inputs = def.inputs == null ? (def.gen ? 0 : 1) : def.inputs;
    def.minInputs = def.minInputs == null ? (def.gen ? 0 : 1) : def.minInputs;
    // Common TOP page: resolution & format
    if (def.family === 'TOP' && !def.noCommon) {
      def.params = def.params.concat([
        { name: 'res', label: 'Resolution', type: 'menu', options: ['auto', 'project', 'half', 'quarter', 'double', 'custom'], default: 'auto', page: 'Common' },
        { name: 'resw', label: 'Width', type: 'int', default: 1280, min: 1, max: 8192, page: 'Common', row: 'res', showIf: (p) => p.res === 'custom' },
        { name: 'resh', label: 'Height', type: 'int', default: 720, min: 1, max: 8192, page: 'Common', row: 'res', showIf: (p) => p.res === 'custom' },
      ]);
    }
    K.types[def.type] = def;
    return def;
  };

  /* ---------------- project ---------------- */
  const P = (K.project = {
    ops: new Map(), res: { w: 1920, h: 1080 }, fps: 60, bpm: 120, length: 30,
    title: 'Untitled', network: 'root', selection: new Set(), current: null,
  });
  K.media = new Map(); // id -> {name, url, blob, type}

  K.time = { seconds: 0, frame: 0, playing: true, rate: 1, dt: 1 / 60, last: 0, absSeconds: 0, loop: true };

  // Fast name lookup (TD-style operator paths). Rebuilt lazily when names change.
  K.nameIndex = new Map();
  K.indexOp = function (op) {
    if (!op) return;
    if (op._oldName) K.nameIndex.delete(op._oldName);
    K.nameIndex.set(op.name, op);
    op._oldName = op.name;
  };
  K.reindex = function () {
    K.nameIndex.clear();
    P.ops.forEach((o) => { K.nameIndex.set(o.name, o); o._oldName = o.name; });
  };
  K.getOp = (id) => P.ops.get(id);
  K.findOp = function (name) {
    if (!name) return null;
    name = String(name).replace(/^.*\//, '');
    return K.nameIndex.get(name) || null;
  };
  // Ops are grouped per network; this small cache avoids repeated full scans in UI code.
  let inCache = { parent: null, stamp: -1, list: [] };
  K.opsIn = function (parent) {
    if (inCache.parent === parent && inCache.stamp === P.ops.size) return inCache.list.slice();
    const list = [];
    P.ops.forEach((o) => { if (o.parent === parent) list.push(o); });
    inCache = { parent, stamp: P.ops.size, list };
    return list.slice();
  };
  K.invalidateOpsIn = function () { inCache.stamp = -1; };
  K.opsOfFamily = (fam) => { const a = []; P.ops.forEach((o) => { if (o.family === fam) a.push(o); }); return a; };
  K.uniqueName = function (base) {
    base = String(base).replace(/[^a-zA-Z0-9_]/g, '') || 'op';
    const stem = base.replace(/\d+$/, '');
    let i = 1, name;
    if (!K.nameIndex.has(base) && /\d$/.test(base)) return base;
    do { name = stem + i++; } while (K.nameIndex.has(name));
    return name;
  };
  K.renameOp = function (op, v) {
    if (!op) return false;
    v = String(v || '').replace(/[^a-zA-Z0-9_]/g, '');
    if (!v || v === op.name) return false;
    if (K.findOp(v) && K.findOp(v) !== op) { K.toast('Name "' + v + '" is already used'); return false; }
    const old = op.name;
    K.nameIndex.delete(old);
    op.name = v;
    op._oldName = v;
    K.nameIndex.set(v, op);
    // Update references in op parameters and expressions to keep patches intact.
    P.ops.forEach((o) => {
      o.def.params.forEach((pd) => { if (pd.type === 'op' && o.p[pd.name] === old) o.p[pd.name] = v; });
      Object.keys(o.e).forEach((k) => { o.e[k] = o.e[k].replace(new RegExp("(op|ch)\\(\\s*(['\"])" + old + '\\2', 'g'), '$1($2' + v + '$2'); });
    });
    K.bus.emit('graph');
    return true;
  };
  K.path = function (op) {
    const parts = [];
    let cur = op;
    while (cur) { parts.unshift(cur.name); cur = cur.parent !== 'root' ? K.getOp(cur.parent) : null; }
    return '/' + parts.join('/');
  };
  K.networkPath = function (netId) {
    if (netId === 'root') return [{ id: 'root', name: 'project' }];
    const op = K.getOp(netId);
    if (!op) return [{ id: 'root', name: 'project' }];
    return K.networkPath(op.parent).concat([{ id: op.id, name: op.name }]);
  };

  K.createOp = function (type, opts) {
    opts = opts || {};
    const def = K.types[type];
    if (!def) { console.warn('Unknown op type', type); return null; }
    const op = {
      id: opts.id || U.uid('op'), type, family: def.family, def,
      name: opts.name && (opts.forceName || !K.findOp(opts.name)) ? opts.name : K.uniqueName(opts.name || def.short || type),
      x: opts.x || 0, y: opts.y || 0, parent: opts.parent || P.network || 'root',
      inputs: (opts.inputs || []).slice(), p: {}, e: {}, flags: Object.assign({ bypass: false, display: false, lock: false }, opts.flags || {}),
      comment: opts.comment || '', color: opts.color || null, rt: {}, out: null, cookedFrame: -1, error: null, warn: null, version: 0, cookMs: 0,
    };
    def.params.forEach((pd) => { op.p[pd.name] = clone(pd.default); });
    if (opts.p) Object.keys(opts.p).forEach((k) => { op.p[k] = clone(opts.p[k]); });
    if (opts.e) Object.keys(opts.e).forEach((k) => { if (opts.e[k]) op.e[k] = opts.e[k]; });
    const nIn = def.inputs === 'multi' ? Math.max(op.inputs.length, 2) : def.inputs;
    while (op.inputs.length < nIn) op.inputs.push(null);
    P.ops.set(op.id, op);
    K.indexOp(op);
    try { def.create && def.create(op); } catch (e) { op.error = String(e.message || e); }
    K.bus.emit('graph');
    return op;
  };
  function clone(v) { return v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v; }

  K.deleteOp = function (id) {
    const op = K.getOp(id);
    if (!op) return;
    // delete children of COMPs
    K.opsIn(id).forEach((c) => K.deleteOp(c.id));
    try { op.def.destroy && op.def.destroy(op); } catch (e) {}
    freeRt(op);
    P.ops.delete(id);
    if (K.nameIndex.get(op.name) === op) K.nameIndex.delete(op.name);
    P.ops.forEach((o) => { o.inputs = o.inputs.map((i) => (i === id ? null : i)); });
    P.selection.delete(id);
    if (P.current === id) P.current = null;
    K.bus.emit('graph');
  };

  function freeRt(op) {
    Object.keys(op.rt).forEach((k) => {
      const v = op.rt[k];
      if (v && v.fbo) K.gl.freeTarget(v);
      else if (v && v.tex && v !== K.gl.black && !v.fbo) { try { K.gl.gl.deleteTexture(v.tex); } catch (e) {} }
    });
  }

  K.connect = function (fromId, toId, index) {
    const a = K.getOp(fromId), b = K.getOp(toId);
    if (!a || !b || a === b) return false;
    if (a.family !== b.family) { K.toast('Only operators of the same family can be wired. Use a reference parameter to link families.'); return false; }
    if (b.def.inputs === 0) return false;
    if (wouldCycle(fromId, toId)) { K.toast('That wire would create a loop. Use a Feedback TOP for recursion.'); return false; }
    if (b.def.inputs === 'multi') {
      if (index == null || index >= b.inputs.length) index = b.inputs.indexOf(null) >= 0 ? b.inputs.indexOf(null) : b.inputs.length;
      b.inputs[index] = fromId;
      if (b.inputs[b.inputs.length - 1] !== null) b.inputs.push(null);
    } else {
      if (index == null) index = b.inputs.indexOf(null) >= 0 ? b.inputs.indexOf(null) : 0;
      if (index >= b.def.inputs) index = b.def.inputs - 1;
      b.inputs[index] = fromId;
    }
    K.bus.emit('graph');
    return true;
  };
  K.disconnect = function (toId, index) {
    const b = K.getOp(toId);
    if (!b) return;
    b.inputs[index] = null;
    if (b.def.inputs === 'multi') {
      while (b.inputs.length > 2 && b.inputs[b.inputs.length - 1] === null && b.inputs[b.inputs.length - 2] === null) b.inputs.pop();
    }
    K.bus.emit('graph');
  };
  function wouldCycle(fromId, toId) {
    const seen = new Set();
    const walk = (id) => {
      if (id === toId) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      const o = K.getOp(id);
      return !!o && o.inputs.some((i) => i && walk(i));
    };
    return walk(fromId);
  }

  /* ---------------- expressions ---------------- */
  const exprCache = new Map();
  const S = {}; // shared scope
  Object.getOwnPropertyNames(Math).forEach((k) => { S[k] = Math[k]; });
  Object.assign(S, {
    TAU: Math.PI * 2,
    fract: U.fract, clamp: U.clamp, mix: U.lerp, lerp: U.lerp,
    mod: (a, b) => ((a % b) + b) % b,
    noise: (x, y, z) => U.noise3(x || 0, y || 0, z || 0),
    rand: (s) => U.mulberry(Math.floor((s || 0) * 1000) + 7)(),
    smoothstep: (a, b, x) => { const t = U.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); },
    fit: (v, a, b, c, d) => c + ((v - a) / (b - a || 1)) * (d - c),
    pulse: (x, w) => (U.fract(x) < (w == null ? 0.1 : w) ? 1 : 0),
    tri: (x) => 1 - Math.abs(U.fract(x) * 2 - 1),
    saw: (x) => U.fract(x),
    sq: (x) => (U.fract(x) < 0.5 ? 1 : 0),
    op: (n) => K.handle(K.findOp(n)),
    ch: (n, c) => { const h = K.handle(K.findOp(n)); return h ? h.chan(c == null ? 0 : c) : 0; },
  });
  K.scope = S;
  function updateScope() {
    S.t = S.time = K.time.seconds;
    S.absTime = K.time.absSeconds;
    S.frame = K.time.frame;
    S.fps = P.fps;
    S.bpm = P.bpm;
    S.beat = (K.time.seconds * P.bpm) / 60;
    S.bar = S.beat / 4;
    S.length = P.length;
    S.progress = P.length ? K.time.seconds / P.length : 0;
    S.resx = P.res.w; S.resy = P.res.h; S.aspect = P.res.w / P.res.h;
  }
  K.updateScope = updateScope;
  K.compileExpr = function (src) {
    if (exprCache.has(src)) return exprCache.get(src);
    let fn;
    try {
      // non-strict so `with` exposes scope names
      // eslint-disable-next-line no-new-func
      fn = new Function('S', 'with(S){ return (' + src + '\n); }');
    } catch (e) { fn = { error: e.message }; }
    exprCache.set(src, fn);
    return fn;
  };
  K.evalExpr = function (src, me) {
    const fn = K.compileExpr(src);
    if (fn.error) throw new Error(fn.error);
    S.me = me ? K.handle(me) : null;
    return fn(S);
  };

  // Resolve a parameter value (expression aware)
  K.par = function (op, name) {
    const ex = op.e[name];
    if (ex) {
      try {
        const v = K.evalExpr(ex, op);
        if (op.rt.exprErr) delete op.rt.exprErr[name];
        const pd = op.def.paramMap[name];
        if (pd && (pd.type === 'float' || pd.type === 'int')) {
          const n = +v;
          return isFinite(n) ? (pd.type === 'int' ? Math.round(n) : n) : 0;
        }
        if (pd && pd.type === 'toggle') return !!v;
        return v;
      } catch (e) {
        op.rt.exprErr = op.rt.exprErr || {};
        op.rt.exprErr[name] = String(e.message || e);
        return op.p[name];
      }
    }
    return op.p[name];
  };
  K.parNum = (op, name) => +K.par(op, name) || 0;

  /* ---------------- handles (for expressions & scripts) ---------------- */
  const handleCache = new WeakMap();
  K.handle = function (op) {
    if (!op) return null;
    if (handleCache.has(op)) return handleCache.get(op);
    const base = {
      get name() { return op.name; },
      get type() { return op.type; },
      get family() { return op.family; },
      get path() { return K.path(op); },
      get id() { return op.id; },
      get bypass() { return op.flags.bypass; }, set bypass(v) { op.flags.bypass = !!v; },
      par: new Proxy({}, {
        get: (_, k) => (k in op.p ? K.par(op, k) : undefined),
        set: (_, k, v) => { if (k in op.p) { op.p[k] = v; delete op.e[k]; K.bus.emit('params', op); } return true; },
      }),
      cook() { return cookOp(op); },
      chan(c) {
        const out = cookOp(op);
        if (op.family === 'COMP' && op.def.panel) return out && out.chans && out.chans[0] ? out.chans[0].data[0] : 0;
        if (!out || !out.chans) return 0;
        let ch = typeof c === 'number' ? out.chans[c] : out.chans.find((x) => x.name === c);
        if (!ch && typeof c === 'string' && /[*?]/.test(c)) {
          const rx = new RegExp('^' + c.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
          ch = out.chans.find((x) => rx.test(x.name));
        }
        if (!ch) return 0;
        return ch.data[ch.data.length - 1] || 0;
      },
      sample(c, i) {
        const out = cookOp(op);
        if (!out || !out.chans) return 0;
        const ch = typeof c === 'number' ? out.chans[c] : out.chans.find((x) => x.name === c);
        if (!ch) return 0;
        return ch.data[U.clamp(i | 0, 0, ch.data.length - 1)] || 0;
      },
      get numChans() { const o = cookOp(op); return o && o.chans ? o.chans.length : 0; },
      get chanNames() { const o = cookOp(op); return o && o.chans ? o.chans.map((c) => c.name) : []; },
      get v() { return this.chan(0); },
      // DAT access
      get text() { const o = cookOp(op); return o && o.text != null ? o.text : ''; },
      get json() { const o = cookOp(op); return o ? o.json : undefined; },
      get numRows() { const o = cookOp(op); return o && o.table ? o.table.length : 0; },
      get numCols() { const o = cookOp(op); return o && o.table && o.table[0] ? o.table[0].length : 0; },
      cell(r, c) {
        const o = cookOp(op);
        if (!o || !o.table) return '';
        if (typeof r === 'number') r = U.clamp(Math.floor(r), 0, o.table.length - 1);
        else r = Math.max(0, o.table.findIndex((row) => row[0] === r));
        const row = o.table[r] || [];
        if (typeof c === 'string') { const ci = (o.table[0] || []).indexOf(c); c = ci < 0 ? 0 : ci; }
        return row[c | 0] == null ? '' : row[c | 0];
      },
      row(r) { const o = cookOp(op); return o && o.table ? o.table[U.clamp(r | 0, 0, o.table.length - 1)] || [] : []; },
      // Panel COMP
      click() { op.def.click && op.def.click(op); },
      set value(v) { op.p.value = v; delete op.e.value; K.bus.emit('params', op); },
      get value() { return this.chan(0); },
    };
    const h = new Proxy(base, {
      get(tgt, k) {
        if (typeof k === 'string' && /^\d+$/.test(k)) return tgt.chan(parseInt(k, 10));
        if (k in tgt) return tgt[k];
        if (typeof k === 'string' && (op.family === 'CHOP' || (op.out && op.out.chans))) return tgt.chan(k);
        return undefined;
      },
      set(tgt, k, v) { tgt[k] = v; return true; },
    });
    handleCache.set(op, h);
    return h;
  };

  /* ---------------- cooking ---------------- */
  K.frameId = 0;
  // Per-frame cook telemetry (used by the performance monitor).
  K.cookStats = { ops: 0, total: 0, ms: 0, targets: 0 };
  // TouchDesigner-style selective cooking: only operators needed for the current
  // display, selection and visible thumbnails cook. References and expressions
  // still cook their source operators on demand.
  K.optimizeCooking = true;
  K.previewAll = true;
  K.previewScale = 1;

  function cookOp(op) {
    if (!op) return null;
    if (op.cookedFrame === K.frameId) return op.out;
    if (op.cooking) return op.out; // cycle through reference: use last frame
    op.cooking = true;
    const t0 = performance.now();
    K.cookStats.ops++;
    try {
      op.error = null;
      const def = op.def;
      if (op.flags.lock && op.out) {
        // Locked operators freeze their last output, like a TD Lock flag.
        op.cookedFrame = K.frameId;
        op.cooking = false;
        return op.out;
      }
      if (op.flags.bypass && def.inputs !== 0) {
        const src = op.inputs.find((i) => i);
        op.out = src ? cookOp(K.getOp(src)) : null;
      } else {
        const missing = def.minInputs > 0 && op.inputs.slice(0, def.minInputs).some((i) => !i || !K.getOp(i));
        if (missing && !def.allowMissing) {
          op.out = def.emptyOut ? def.emptyOut(op) : null;
          op.warn = 'Needs ' + def.minInputs + ' input' + (def.minInputs > 1 ? 's' : '');
        } else {
          op.warn = null;
          const r = def.cook(op, ctx);
          if (r !== undefined) op.out = r;
        }
      }
    } catch (e) {
      op.error = String((e && e.message) || e);
    }
    op.cookMs = op.cookMs * 0.9 + (performance.now() - t0) * 0.1;
    op.cookedFrame = K.frameId;
    op.cooking = false;
    return op.out;
  }
  K.cook = cookOp;

  // ctx helpers passed into cook()
  const ctx = {
    par: (op, n) => K.par(op, n),
    num: (op, n) => K.parNum(op, n),
    input(op, i) { const id = op.inputs[i]; return id ? cookOp(K.getOp(id)) : null; },
    inputOp(op, i) { const id = op.inputs[i]; return id ? K.getOp(id) : null; },
    ref(op, n, fam) {
      const name = K.par(op, n);
      const r = K.findOp(name);
      if (!r) return null;
      if (fam && r.family !== fam) return null;
      return r;
    },
    refOut(op, n, fam) { const r = ctx.ref(op, n, fam); return r ? cookOp(r) : null; },
    // compute TOP output size from res param & first input
    size(op, inTex) {
      const mode = op.p.res;
      const base = P.res;
      if (mode === 'custom') return [K.parNum(op, 'resw'), K.parNum(op, 'resh')];
      if (mode === 'auto' && inTex && inTex.w) return [inTex.w, inTex.h];
      if (mode === 'half') return [base.w / 2, base.h / 2];
      if (mode === 'quarter') return [base.w / 4, base.h / 4];
      if (mode === 'double') return [base.w * 2, base.h * 2];
      return [base.w, base.h];
    },
  };
  K.ctx = ctx;

  K.cookAll = function () {
    K.frameId++;
    updateScope();
    const st = K.cookStats;
    st.ops = 0; st.total = P.ops.size; st.targets = 0;
    const t0 = performance.now();
    // Scripts and other pre-cook work always run: they may update parameters,
    // fetch data or drive logic even when their output is not on screen.
    P.ops.forEach((op) => { if (op.def.preCook) { try { op.def.preCook(op, ctx); } catch (e) { op.error = String(e.message || e); } } });
    if (!K.optimizeCooking || P.ops.size < 12) {
      P.ops.forEach((op) => cookOp(op));
    } else {
      const roots = new Set();
      P.ops.forEach((op) => {
        if (op.flags.display || op.flags.lock || op.type === 'outTOP') roots.add(op);
      });
      if (P.current) { const cur = K.getOp(P.current); if (cur) roots.add(cur); }
      if (K.previewAll) K.opsIn(P.network).forEach((op) => roots.add(op));
      st.targets = roots.size;
      roots.forEach((op) => cookOp(op));
    }
    st.ms = st.ms * 0.85 + (performance.now() - t0) * 0.15;
  };

  /* ---------------- param map ---------------- */
  K.finalizeTypes = function () {
    Object.values(K.types).forEach((def) => {
      def.paramMap = {};
      def.params.forEach((p) => { def.paramMap[p.name] = p; });
    });
  };

  /* ---------------- serialization ---------------- */
  K.serializeOp = (op) => ({ id: op.id, type: op.type, name: op.name, x: Math.round(op.x), y: Math.round(op.y), parent: op.parent, inputs: op.inputs.slice(), p: clone(op.p), e: clone(op.e), flags: clone(op.flags), color: op.color || null, comment: op.comment });
  K.serialize = function (opts) {
    opts = opts || {};
    const data = {
      kiln: K.version, title: P.title, res: P.res, fps: P.fps, bpm: P.bpm, length: P.length,
      network: P.network, ops: Array.from(P.ops.values()).map(K.serializeOp),
    };
    return data;
  };
  K.clearProject = function () {
    Array.from(P.ops.keys()).forEach((id) => {
      const op = P.ops.get(id);
      if (!op) return;
      try { op.def.destroy && op.def.destroy(op); } catch (e) {}
      freeRt(op);
    });
    P.ops.clear(); P.selection.clear(); P.current = null; P.network = 'root';
    K.nameIndex.clear();
  };
  K.load = function (data, keepHistory) {
    K.clearProject();
    P.title = data.title || 'Untitled';
    P.res = data.res || { w: 1920, h: 1080 };
    P.fps = data.fps || 60; P.bpm = data.bpm || 120; P.length = data.length || 30;
    if (data.media) {
      Object.keys(data.media).forEach((id) => {
        const m = data.media[id];
        if (!K.media.has(id)) K.media.set(id, { name: m.name, url: m.url, type: m.type });
      });
    }
    if (data.fonts && K.registerFontBuffer) {
      Object.keys(data.fonts).forEach((fam) => {
        const fd = data.fonts[fam];
        if (fd && fd.url && (!K.customFonts || !K.customFonts.has(fam))) {
          fetch(fd.url).then((r) => r.arrayBuffer()).then((buf) => K.registerFontBuffer(buf, fd.fileName || fam, fam)).catch(() => {});
        }
      });
    }
    (data.ops || []).forEach((o) => {
      if (!K.types[o.type]) return;
      const op = K.createOp(o.type, Object.assign({}, o, { name: o.name, forceName: true, flags: Object.assign({ lock: false }, o.flags || {}) }));
      if (op && op.name !== o.name) { K.nameIndex.delete(op.name); op.name = o.name; K.nameIndex.set(o.name, op); }
    });
    // restore inputs exactly
    (data.ops || []).forEach((o) => { const op = K.getOp(o.id); if (op) op.inputs = o.inputs.slice(); });
    P.network = data.network && (data.network === 'root' || K.getOp(data.network)) ? data.network : 'root';
    K.reindex();
    if (!keepHistory) K.history.reset();
    K.bus.emit('graph'); K.bus.emit('project');
  };

  /* ---------------- history (snapshot undo) ---------------- */
  K.history = {
    stack: [], index: -1, max: 80, lock: false,
    reset() { this.stack = [JSON.stringify(K.serialize())]; this.index = 0; },
    push() {
      if (this.lock) return;
      const s = JSON.stringify(K.serialize());
      if (this.stack[this.index] === s) return;
      this.stack = this.stack.slice(0, this.index + 1);
      this.stack.push(s);
      if (this.stack.length > this.max) this.stack.shift();
      this.index = this.stack.length - 1;
      K.bus.emit('dirty');
    },
    restore(i) {
      const sel = Array.from(P.selection), cur = P.current;
      this.lock = true;
      K.load(JSON.parse(this.stack[i]), true);
      sel.forEach((id) => { if (K.getOp(id)) P.selection.add(id); });
      P.current = K.getOp(cur) ? cur : null;
      this.lock = false;
      this.index = i;
      K.bus.emit('select');
    },
    undo() { if (this.index > 0) this.restore(this.index - 1); },
    redo() { if (this.index < this.stack.length - 1) this.restore(this.index + 1); },
  };
  let commitTimer = null;
  K.commit = function (immediate) {
    clearTimeout(commitTimer);
    if (immediate) K.history.push();
    else commitTimer = setTimeout(() => K.history.push(), 350);
  };

  K.toast = function (msg) { K.bus.emit('toast', msg); };
})();
