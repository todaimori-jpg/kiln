/* Kiln TD — network.js : UI primitives + network editor
   Nodes, wires, flags, search, colour overrides, OP Create, selection, clipboard. */
(function () {
  'use strict';
  const K = window.K, U = K.util, P = K.project;
  const $ = (s, r) => (r || document).querySelector(s);
  const h = (tag, attrs, ...kids) => {
    const el = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') { for (const sk in v) { if (sk.startsWith('--')) el.style.setProperty(sk, v[sk]); else el.style[sk] = v[sk]; } }
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
    }
    kids.flat().forEach((c) => { if (c != null && c !== false) el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c); });
    return el;
  };
  const UI = (K.ui = { h, $ });
  const famColor = (f) => (K.FAMILIES[f] || {}).color || '#888';
  UI.famColor = famColor;

  /* ---------------- popovers / menus / dialogs / toasts ---------------- */
  const popRoot = () => $('#popRoot');
  UI.closePops = function () {
    popRoot().innerHTML = '';
    popRoot().style.pointerEvents = 'none';
    document.querySelectorAll('.menu > button.open').forEach((b) => b.classList.remove('open'));
  };
  function place(el, x, y) {
    popRoot().appendChild(el);
    const r = el.getBoundingClientRect(), W = window.innerWidth, H = window.innerHeight;
    el.style.left = Math.max(6, Math.min(x, W - r.width - 6)) + 'px';
    el.style.top = Math.max(6, Math.min(y, H - r.height - 6)) + 'px';
  }
  UI.menu = function (items, x, y) {
    UI.closePops();
    const back = h('div', { style: { position: 'absolute', inset: 0, pointerEvents: 'all' }, onpointerdown: (e) => { if (e.target === back) UI.closePops(); }, oncontextmenu: (e) => { e.preventDefault(); UI.closePops(); } });
    popRoot().appendChild(back);
    const m = h('div', { class: 'pop ctx', role: 'menu' });
    items.forEach((it) => {
      if (!it) return;
      if (it === '-') return m.appendChild(h('hr'));
      if (it.head) return m.appendChild(h('div', { class: 'ctx-head' }, it.head));
      m.appendChild(h('button', { role: 'menuitem', disabled: it.disabled || false, onclick: () => { UI.closePops(); it.fn && it.fn(); } },
        it.swatch ? h('span', { class: 'sw', style: { width: '10px', height: '10px', borderRadius: '3px', background: it.swatch, flex: 'none', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.25)' } }) : null,
        it.label, it.key ? h('small', null, it.key) : null));
    });
    back.appendChild(m);
    place(m, x, y);
    popRoot().style.pointerEvents = 'none';
    return m;
  };
  UI.dialog = function (build, opts) {
    UI.closePops();
    const back = h('div', { class: 'dialog-back', onpointerdown: (e) => { if (e.target === back && !(opts && opts.modal)) UI.closePops(); } });
    const d = h('div', { class: 'dialog' + (opts && opts.wide ? ' wide' : ''), role: 'dialog' });
    back.appendChild(d);
    popRoot().appendChild(back);
    build(d, () => UI.closePops());
    return d;
  };
  K.bus.on('toast', (msg) => {
    const t = h('div', { class: 'toast' }, msg);
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), 3200);
  });

  /* ---------------- network editor ---------------- */
  const NW = 184, HEAD = 26, VIEW = 104, FOOT = 18, NH = HEAD + VIEW + FOOT;
  const N = (K.net = { zoom: 1, panX: 60, panY: 60, els: new Map(), selWire: null, views: {}, query: '' });
  UI.NODE = { NW, HEAD, VIEW, FOOT, NH };

  let canvasEl, innerEl, nodesEl, wiresEl;
  const nIn = (op) => (op.def.inputs === 'multi' ? Math.max(1, op.inputs.length) : op.def.inputs);
  const inPos = (op, i) => { const n = nIn(op); return [op.x, op.y + HEAD + (VIEW * (i + 1)) / (n + 1)]; };
  const outPos = (op) => [op.x + NW, op.y + HEAD + VIEW / 2];
  N.toWorld = (cx, cy) => { const r = canvasEl.getBoundingClientRect(); return [(cx - r.left - N.panX) / N.zoom, (cy - r.top - N.panY) / N.zoom]; };
  N.applyView = function () {
    innerEl.style.transform = `translate(${N.panX}px, ${N.panY}px) scale(${N.zoom})`;
    canvasEl.style.backgroundSize = `${24 * N.zoom}px ${24 * N.zoom}px`;
    canvasEl.style.backgroundPosition = `${N.panX}px ${N.panY}px`;
    const z = $('#zoomLabel');
    if (z) z.textContent = Math.round(N.zoom * 100) + '%';
    N.views[P.network] = { zoom: N.zoom, panX: N.panX, panY: N.panY };
  };

  const NODE_COLORS = ['#ff6a3d', '#ffb35c', '#f2c14e', '#5ab56b', '#58d6c4', '#4f8fd6', '#8c6bd8', '#d66fa6', '#e8e5df', '#9aa0a8'];

  N.render = function () {
    nodesEl.innerHTML = '';
    N.els.clear();
    const ops = K.opsIn(P.network);
    const empty = $('#netEmpty');
    if (empty) empty.style.display = ops.length ? 'none' : '';
    ops.forEach((op) => {
      const fam = op.family, def = op.def;
      const isFilter = def.inputs !== 0 && !def.gen;
      const color = op.color || famColor(fam);
      const canvas = h('canvas', { width: NW * 2, height: VIEW * 2 });
      const el = h('div', {
        class: 'node' + (isFilter ? ' filter' : ' gen') + (op.color ? ' has-color' : ''),
        'data-id': op.id,
        style: { left: op.x + 'px', top: op.y + 'px', '--fam': color },
      },
        h('div', { class: 'node-head' },
          h('span', { class: 'fam-mark' }, fam),
          h('span', { class: 'name' }, op.name),
          h('span', { class: 'type' }, def.label)),
        h('div', { class: 'node-view', 'data-family': fam }, canvas, h('div', { class: 'badge' })),
        h('div', { class: 'node-foot' },
          h('span', { class: 'cook' }),
          h('div', { class: 'flags' },
            def.inputs !== 0 ? h('button', { class: 'flag b' + (op.flags.bypass ? ' on' : ''), 'data-flag': 'bypass', title: 'Bypass — pass input through unchanged (B)' }, 'B') : null,
            (fam === 'TOP') ? h('button', { class: 'flag d' + (op.flags.display ? ' on' : ''), 'data-flag': 'display', title: 'Display — send to Output / Perform (D)' }, 'D') : null,
            def.inputs !== 0 ? h('button', { class: 'flag l' + (op.flags.lock ? ' on' : ''), 'data-flag': 'lock', title: 'Lock — freeze the current output (L)' }, 'L') : null)));
      if (def.container) el.appendChild(h('div', { class: 'comp-enter' }, K.opsIn(op.id).length + ' ops · dbl-click'));
      if (op.comment) el.appendChild(h('div', { class: 'comment' }, op.comment));
      const n = nIn(op);
      for (let i = 0; i < n; i++) {
        const y = HEAD + (VIEW * (i + 1)) / (n + 1) - 6;
        const src = op.inputs[i] && K.getOp(op.inputs[i]);
        el.appendChild(h('span', { class: 'port in' + (src ? ' filled' : ''), 'data-in': i, style: { top: y + 'px' }, title: src ? 'Input ' + i + ' ← ' + src.name + (src.parent !== op.parent ? ' (' + K.path(src) + ')' : '') : 'Input ' + i }));
      }
      if (fam === 'TOP' || fam === 'CHOP' || fam === 'SOP') el.appendChild(h('span', { class: 'port out', style: { top: HEAD + VIEW / 2 - 6 + 'px' }, title: 'Output — drag to an input' }));
      if (op.flags.bypass) el.classList.add('bypass');
      if (op.flags.display) el.classList.add('flag-d');
      if (op.flags.lock) el.classList.add('locked');
      el.title = K.path(op) + (op.comment ? '\n' + op.comment : '');
      nodesEl.appendChild(el);
      N.els.set(op.id, { el, canvas, ctx: canvas.getContext('2d'), badge: el.querySelector('.badge'), cook: el.querySelector('.cook') });
    });
    N.updateSelection();
    N.applySearch();
    N.drawWires(null, true);
    renderCrumbs();
    updateStatus();
  };

  N.updateSelection = function () {
    N.els.forEach((v, id) => {
      v.el.classList.toggle('sel', P.selection.has(id));
      v.el.classList.toggle('current', P.current === id);
    });
    updateStatus();
  };

  function updateStatus() {
    const s = $('#netStatus');
    if (!s) return;
    const total = K.opsIn(P.network).length;
    s.innerHTML = '<b>' + total + '</b> op' + (total === 1 ? '' : 's') + ' · <b>' + P.selection.size + '</b> selected';
  }
  N.updateStatus = updateStatus;

  /* ---------------- node search ---------------- */
  N.setSearch = function (q) {
    N.query = String(q || '').trim().toLowerCase();
    N.applySearch();
  };
  N.applySearch = function () {
    const q = N.query;
    let first = null;
    N.els.forEach((v, id) => {
      const op = K.getOp(id);
      let hit = false;
      if (op && q) {
        hit = (op.name + ' ' + op.type + ' ' + op.def.label + ' ' + op.family + ' ' + (op.comment || '')).toLowerCase().includes(q);
      }
      v.el.classList.toggle('dim', !!q && !hit);
      v.el.classList.toggle('hit', !!q && hit);
      if (hit && !first) first = op;
    });
    N._firstName = first;
    return first;
  };
  N.searchFirst = function () {
    const op = N._firstName || N.applySearch();
    if (op) N.focusOp(op);
    return op;
  };
  N.focusOp = function (op) {
    if (!op) return;
    if (op.parent !== P.network) { N.enter(op.parent); }
    N.select(op.id);
    const r = canvasEl.getBoundingClientRect();
    N.zoom = U.clamp(Math.max(N.zoom, 0.7), 0.2, 1.4);
    N.panX = r.width / 2 - (op.x + NW / 2) * N.zoom;
    N.panY = r.height / 2 - (op.y + NH / 2) * N.zoom;
    N.applyView();
    N.drawWires(null, true);
  };

  function bez(a, b) {
    const dx = Math.max(40, Math.abs(b[0] - a[0]) * 0.5);
    return `M${a[0]},${a[1]} C${a[0] + dx},${a[1]} ${b[0] - dx},${b[1]} ${b[0]},${b[1]}`;
  }
  const REF_RE = /(?:op|ch)\(\s*['"]([A-Za-z0-9_\/]+)['"]/g;

  // Non-temporary wire redraws are coalesced into one animation frame so that
  // dragging many nodes and streaming parameter edits stay cheap.
  let wireQueued = false;
  N.drawWires = function (temp, immediate) {
    if (temp || immediate) { drawWiresNow(temp); return; }
    if (wireQueued) return;
    wireQueued = true;
    requestAnimationFrame(() => { wireQueued = false; drawWiresNow(); });
  };
  function drawWiresNow(temp) {
    const ops = K.opsIn(P.network);
    const parts = [];
    const showFlow = K.time.playing && !K.viewer.recording;
    ops.forEach((op) => {
      op.inputs.forEach((id, i) => {
        if (!id) return;
        const src = K.getOp(id);
        if (!src || src.parent !== P.network) return;
        const d = bez(outPos(src), inPos(op, i));
        const sel = N.selWire && N.selWire.to === op.id && N.selWire.i === i;
        parts.push(`<path class="wire${sel ? ' sel' : ''}" d="${d}" stroke="${src.color || famColor(op.family)}" opacity="0.9"/>`);
        if (showFlow) parts.push(`<path class="wire flow" d="${d}" stroke="#fff" opacity="0.3" style="pointer-events:none"/>`);
        parts.push(`<path class="wire-hit" d="${d}" data-to="${op.id}" data-i="${i}"/>`);
        if (sel) {
          const a = outPos(src), b = inPos(op, i), mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
          parts.push(`<g class="wire-x" data-to="${op.id}" data-i="${i}" transform="translate(${mx},${my})"><circle r="10" fill="var(--err)"/><path d="M-4,-4L4,4M4,-4L-4,4" stroke="#fff" stroke-width="2"/></g>`);
        }
      });
      // dashed reference links from op parameters and expressions
      const seen = new Set();
      op.def.params.forEach((pd) => {
        if (pd.type === 'op' && op.p[pd.name] && !op.e[pd.name]) {
          const r = K.findOp(op.p[pd.name]);
          if (r && r.parent === P.network && r !== op && !seen.has(r.id)) { seen.add(r.id); parts.push(refPath(r, op, false)); }
        }
      });
      const exprSrc = Object.values(op.e).join(' ') + (op.type === 'scriptDAT' ? ' ' + op.p.code : '') + (op.type === 'textTOP' ? ' ' + op.p.text : '');
      let m;
      REF_RE.lastIndex = 0;
      while ((m = REF_RE.exec(exprSrc))) {
        const r = K.findOp(m[1]);
        if (r && r.parent === P.network && r !== op && !seen.has(r.id)) { seen.add(r.id); parts.push(refPath(r, op, true)); }
      }
    });
    if (temp) parts.push(`<path class="temp" d="${temp}"/>`);
    wiresEl.innerHTML = parts.join('');
  }
  function refPath(a, b, expr) {
    const p0 = [a.x + NW / 2, a.y + NH], p1 = [b.x + NW / 2, b.y + NH];
    const up = [a.x + NW / 2, a.y], down = [b.x + NW / 2, b.y];
    let s = p0, e = down;
    if (a.y > b.y + NH) { s = up; e = p1; }
    else if (Math.abs(a.y - b.y) < NH) {
      s = [a.x + NW / 2, a.y + NH]; e = [b.x + NW / 2, b.y + NH];
      const my = Math.max(s[1], e[1]) + 40;
      return `<path class="ref${expr ? ' expr' : ''}" d="M${s[0]},${s[1]} C${s[0]},${my} ${e[0]},${my} ${e[0]},${e[1]}"/>`;
    }
    const dy = (e[1] - s[1]) * 0.5;
    return `<path class="ref${expr ? ' expr' : ''}" d="M${s[0]},${s[1]} C${s[0]},${s[1] + dy} ${e[0]},${e[1] - dy} ${e[0]},${e[1]}"/>`;
  }

  function renderCrumbs() {
    const c = $('#crumbs');
    if (!c) return;
    c.innerHTML = '';
    K.networkPath(P.network).forEach((p, i, arr) => {
      if (i) c.appendChild(h('span', { class: 'sep' }, '/'));
      c.appendChild(h('button', { onclick: () => N.enter(p.id) }, p.name));
    });
  }
  N.enter = function (netId) {
    N.views[P.network] = { zoom: N.zoom, panX: N.panX, panY: N.panY };
    P.network = netId;
    P.selection.clear();
    P.current = null;
    const v = N.views[netId];
    if (v) Object.assign(N, v);
    N.render();
    if (!v) N.fit(); else N.applyView();
    K.bus.emit('select');
  };
  N.up = function () {
    if (P.network === 'root') return;
    const c = K.getOp(P.network);
    N.enter(c ? c.parent : 'root');
    if (c) N.select(c.id);
  };

  N.fit = function () {
    const ops = K.opsIn(P.network);
    const r = canvasEl.getBoundingClientRect();
    if (!ops.length) { N.zoom = 1; N.panX = 60; N.panY = 60; N.applyView(); return; }
    const x0 = Math.min(...ops.map((o) => o.x)) - 40, y0 = Math.min(...ops.map((o) => o.y)) - 56;
    const x1 = Math.max(...ops.map((o) => o.x + NW)) + 40, y1 = Math.max(...ops.map((o) => o.y + NH)) + 50;
    N.zoom = U.clamp(Math.min(r.width / (x1 - x0), r.height / (y1 - y0)), 0.2, 1.25);
    N.panX = (r.width - (x1 - x0) * N.zoom) / 2 - x0 * N.zoom;
    N.panY = (r.height - (y1 - y0) * N.zoom) / 2 - y0 * N.zoom;
    N.applyView();
  };

  N.select = function (id, additive) {
    if (!additive) P.selection.clear();
    if (id) { P.selection.add(id); P.current = id; }
    N.selWire = null;
    N.updateSelection();
    K.bus.emit('select');
  };

  /* ---------------- OP Create dialog ---------------- */
  const FAM_ORDER = ['COMP', 'TOP', 'CHOP', 'SOP', 'MAT', 'DAT'];
  N.lastFam = 'TOP';
  N.opCreate = function (clientX, clientY, opts) {
    opts = opts || {};
    UI.closePops();
    const world = opts.world || N.toWorld(clientX, clientY);
    let fam = opts.family || N.lastFam;
    const back = h('div', { style: { position: 'absolute', inset: 0, pointerEvents: 'all' }, onpointerdown: (e) => { if (e.target === back) { UI.closePops(); opts.onCancel && opts.onCancel(); } } });
    popRoot().appendChild(back);
    const search = h('input', { class: 'field', placeholder: 'Type to search all operators…', spellcheck: 'false' });
    const famBar = h('div', { class: 'opc-fams' });
    const grid = h('div', { class: 'opc-grid' });
    const box = h('div', { class: 'pop opc' }, h('div', { class: 'opc-top' }, search, h('button', { class: 'btn small ghost', onclick: () => UI.closePops() }, 'Esc')), famBar, grid);
    back.appendChild(box);
    let hl = 0, flat = [];
    function pick(type) {
      UI.closePops();
      const op = N.addOp(type, world[0] - NW / 2, world[1] - NH / 2, opts);
      opts.onCreate && opts.onCreate(op);
    }
    function draw() {
      famBar.innerHTML = '';
      FAM_ORDER.forEach((f) => famBar.appendChild(h('button', { class: f === fam && !search.value ? 'on' : '', style: f === fam && !search.value ? { background: famColor(f) } : { color: famColor(f) }, onclick: () => { fam = f; N.lastFam = f; search.value = ''; hl = 0; draw(); search.focus(); } }, f)));
      grid.innerHTML = '';
      const q = search.value.trim().toLowerCase();
      const all = Object.values(K.types).filter((d) => !d.hidden);
      const list = q ? all.filter((d) => (d.label + ' ' + d.type + ' ' + d.family + ' ' + (d.help || '')).toLowerCase().includes(q))
        .sort((a, b) => (a.label.toLowerCase().startsWith(q) ? 0 : 1) - (b.label.toLowerCase().startsWith(q) ? 0 : 1))
        : all.filter((d) => d.family === fam);
      const gens = list.filter((d) => d.inputs === 0 || d.gen), filters = list.filter((d) => !(d.inputs === 0 || d.gen));
      flat = q ? list : gens.concat(filters);
      const item = (d) => {
        const i = flat.indexOf(d);
        return h('button', { class: 'opc-item' + (i === hl ? ' hl' : ''), onclick: () => pick(d.type), title: d.help || '' },
          h('span', { class: 'sw', style: { background: famColor(d.family), opacity: d.inputs === 0 || d.gen ? 1 : 0.5 } }),
          h('span', null, d.label + (q ? ' ' + d.family : '')), h('span', { class: 'd' }, (d.help || '').split(/[.—]/)[0]));
      };
      if (q) {
        grid.style.gridTemplateColumns = '1fr';
        const col = h('div', { class: 'opc-col' }, h('h4', null, list.length + ' matches'));
        list.slice(0, 60).forEach((d) => col.appendChild(item(d)));
        if (!list.length) col.appendChild(h('div', { style: { color: 'var(--faint)', padding: '10px', fontSize: '12px' } }, 'No operators match.'));
        grid.appendChild(col);
      } else {
        grid.style.gridTemplateColumns = '';
        const c1 = h('div', { class: 'opc-col' }, h('h4', null, fam === 'COMP' ? 'Objects & Panels' : fam === 'MAT' ? 'Materials' : fam === 'DAT' ? 'Data' : 'Generators'));
        const c2 = h('div', { class: 'opc-col' }, h('h4', null, fam === 'MAT' || fam === 'COMP' || fam === 'DAT' ? '' : 'Operators'));
        gens.forEach((d) => c1.appendChild(item(d)));
        filters.forEach((d) => c2.appendChild(item(d)));
        grid.appendChild(c1); grid.appendChild(c2);
        if (K.FAMILIES[fam]) grid.appendChild(h('div', { style: { gridColumn: '1/-1', color: 'var(--faint)', fontSize: '11.5px', padding: '8px 4px 0' } }, K.FAMILIES[fam].label + ' — ' + K.FAMILIES[fam].desc));
      }
    }
    search.addEventListener('input', () => { hl = 0; draw(); });
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { UI.closePops(); opts.onCancel && opts.onCancel(); }
      else if (e.key === 'ArrowDown') { hl = Math.min(flat.length - 1, hl + 1); draw(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { hl = Math.max(0, hl - 1); draw(); e.preventDefault(); }
      else if (e.key === 'Enter' && flat[hl]) { e.preventDefault(); pick(flat[hl].type); }
      else if (e.key === 'Tab') {
        e.preventDefault();
        const i = FAM_ORDER.indexOf(fam);
        fam = FAM_ORDER[(i + (e.shiftKey ? FAM_ORDER.length - 1 : 1)) % FAM_ORDER.length];
        N.lastFam = fam; search.value = ''; hl = 0; draw();
      }
    });
    draw();
    place(box, clientX - 40, clientY - 30);
    setTimeout(() => search.focus(), 10);
  };

  // create op and auto-wire / auto-link
  N.addOp = function (type, x, y, opts) {
    opts = opts || {};
    const def = K.types[type];
    if (!def) return null;
    const op = K.createOp(type, { x: Math.round(x / 8) * 8, y: Math.round(y / 8) * 8, parent: P.network, color: opts.color || null });
    if (!op) return null;
    if (opts.from) {
      const src = K.getOp(opts.from);
      if (src) {
        if (src.family === op.family && def.inputs !== 0) K.connect(src.id, op.id, 0);
        else {
          const ref = def.params.find((p) => p.type === 'op' && p.family === src.family && (!p.filter || p.filter === src.type));
          if (ref) op.p[ref.name] = src.name;
        }
      }
    }
    if (opts.to != null && opts.toOp) {
      const dst = K.getOp(opts.toOp);
      if (dst && dst.family === op.family) K.connect(op.id, dst.id, opts.to);
    }
    // sensible defaults: link render chain automatically
    if (type === 'renderTOP') {
      const cam = K.opsOfFamily('COMP').find((o) => o.type === 'cameraCOMP');
      if (cam) op.p.camera = cam.name;
    }
    if (type === 'geometryCOMP') {
      const sel = K.getOp(P.current);
      if (sel && sel.family === 'SOP' && !op.p.sop) op.p.sop = sel.name;
    }
    if (type === 'outTOP' && !K.opsOfFamily('TOP').some((o) => o.flags.display && o !== op)) op.flags.display = true;
    N.render();
    N.select(op.id);
    K.commit(true);
    return op;
  };

  /* ---------------- clipboard ---------------- */
  let clip = null;
  N.copy = function () {
    const ids = Array.from(P.selection);
    if (!ids.length) return;
    clip = ids.map((id) => K.serializeOp(K.getOp(id)));
    K.toast(ids.length + ' operator' + (ids.length > 1 ? 's' : '') + ' copied');
  };
  N.paste = function (offset) {
    if (!clip) return;
    const map = {};
    const created = [];
    clip.forEach((o) => {
      const op = K.createOp(o.type, Object.assign({}, o, { id: null, name: o.name, x: o.x + (offset || 32), y: o.y + (offset || 32), parent: P.network, inputs: [] }));
      if (!op) return;
      map[o.id] = op.id; created.push([o, op]);
    });
    created.forEach(([o, op]) => {
      op.inputs = o.inputs.map((id) => (id ? map[id] || id : null));
      while (op.inputs.length < (op.def.inputs === 'multi' ? 2 : op.def.inputs)) op.inputs.push(null);
    });
    P.selection.clear();
    created.forEach(([, op]) => P.selection.add(op.id));
    P.current = created.length ? created[created.length - 1][1].id : null;
    clip = created.map(([, op]) => K.serializeOp(op));
    N.render(); K.bus.emit('select'); K.commit(true);
  };
  N.duplicate = function () { N.copy(); N.paste(24); };
  N.deleteSelection = function () {
    if (N.selWire) { K.disconnect(N.selWire.to, N.selWire.i); N.selWire = null; N.render(); K.commit(true); return; }
    const ids = Array.from(P.selection);
    if (!ids.length) return;
    ids.forEach((id) => K.deleteOp(id));
    P.selection.clear(); P.current = null;
    N.render(); K.bus.emit('select'); K.commit(true);
  };
  N.collapse = function () {
    const ids = Array.from(P.selection).filter((id) => K.getOp(id));
    if (!ids.length) return;
    const ops = ids.map(K.getOp);
    const cx = ops.reduce((s, o) => s + o.x, 0) / ops.length, cy = ops.reduce((s, o) => s + o.y, 0) / ops.length;
    const base = K.createOp('baseCOMP', { x: Math.round(cx / 8) * 8, y: Math.round(cy / 8) * 8, parent: P.network });
    ops.forEach((o) => { o.parent = base.id; });
    K.invalidateOpsIn();
    N.select(base.id);
    N.render(); K.commit(true);
    K.toast('Collapsed ' + ops.length + ' operators into ' + base.name + ' — double-click to enter');
  };
  N.rename = function (id) {
    const op = K.getOp(id);
    if (!op) return;
    const v = prompt('Rename operator', op.name);
    if (v != null) {
      if (K.renameOp(op, v)) {
        N.render(); K.bus.emit('select'); K.commit(true);
      }
    }
  };

  function customColorDialog(op) {
    UI.dialog((d, close) => {
      const input = h('input', { type: 'color', value: op.color || famColor(op.family), style: { width: '100%', height: '44px', border: '1px solid var(--line)', borderRadius: '7px', background: 'var(--panel-2)', padding: '3px' } });
      d.append(
        h('h2', null, 'Node colour'),
        h('p', { class: 'sub' }, 'Colour overrides the family tint for ' + op.name + ' and all selected operators.'),
        input,
        h('div', { class: 'actions' },
          h('button', { class: 'btn', onclick: close }, 'Cancel'),
          h('button', { class: 'btn', onclick: () => { N.setColor(null); close(); } }, 'Family colour'),
          h('button', { class: 'btn primary', onclick: () => { N.setColor(input.value); close(); } }, 'Apply'))
      );
    });
  }
  N.setColor = function (color) {
    const ids = Array.from(P.selection);
    ids.forEach((id) => { const op = K.getOp(id); if (op) op.color = color || null; });
    if (!ids.length && P.current) { const op = K.getOp(P.current); if (op) op.color = color || null; }
    N.render(); K.bus.emit('params'); K.commit(true);
  };

  N.nodeMenu = function (op, x, y) {
    if (!P.selection.has(op.id)) N.select(op.id);
    const colorItems = NODE_COLORS.map((c) => ({ label: '   ' + c, swatch: c, fn: () => N.setColor(c) }));
    UI.menu([
      { head: op.def.label + ' ' + op.family },
      { label: 'Rename…', key: 'F2', fn: () => N.rename(op.id) },
      op.def.container ? { label: 'Enter network', key: 'I', fn: () => N.enter(op.id) } : null,
      { label: 'Reveal in params', key: 'Enter', fn: () => { N.select(op.id); K.bus.emit('focusParams', op); } },
      '-',
      op.def.inputs !== 0 ? { label: op.flags.bypass ? 'Clear Bypass' : 'Bypass', key: 'B', fn: () => N.toggleFlag('bypass') } : null,
      op.family === 'TOP' ? { label: op.flags.display ? 'Clear Display flag' : 'Set Display flag (Output)', key: 'D', fn: () => N.toggleFlag('display') } : null,
      op.def.inputs !== 0 ? { label: op.flags.lock ? 'Unlock output' : 'Lock output', key: 'L', fn: () => N.toggleFlag('lock') } : null,
      { label: 'Comment…', fn: () => { const c = prompt('Comment', op.comment || ''); if (c != null) { op.comment = c; N.render(); K.commit(true); } } },
      '-',
      { head: 'Colour' },
      ...colorItems,
      { label: '   Custom colour…', fn: () => customColorDialog(op) },
      { label: '   Family colour', fn: () => N.setColor(null) },
      '-',
      { label: 'Copy', key: '⌘C', fn: N.copy },
      { label: 'Duplicate', key: '⌘D', fn: N.duplicate },
      { label: 'Collapse selected into Base COMP', key: '⇧C', fn: N.collapse },
      '-',
      { label: 'Delete', key: 'Del', fn: N.deleteSelection },
    ], x, y);
  };
  N.bgMenu = function (x, y) {
    UI.menu([
      { label: 'Add operator…', key: 'Tab', fn: () => N.opCreate(x, y) },
      { label: 'Paste', key: '⌘V', disabled: !clip, fn: () => N.paste() },
      '-',
      { label: 'Frame all', key: 'H', fn: N.fit },
      P.network !== 'root' ? { label: 'Go up a level', key: 'U', fn: N.up } : null,
      { label: 'Select all', key: '⌘A', fn: () => { K.opsIn(P.network).forEach((o) => P.selection.add(o.id)); N.updateSelection(); K.bus.emit('select'); } },
      { label: 'Tidy layout', fn: N.tidy },
    ], x, y);
  };
  N.toggleFlag = function (flag) {
    const ids = Array.from(P.selection);
    if (!ids.length) return;
    const first = K.getOp(ids[0]);
    if (!first) return;
    const val = !first.flags[flag];
    ids.forEach((id) => {
      const o = K.getOp(id);
      if (!o) return;
      if (flag === 'display') {
        if (o.family !== 'TOP') return;
        if (val) K.opsOfFamily('TOP').forEach((t) => { t.flags.display = false; });
      }
      if (flag === 'bypass' && o.def.inputs === 0) return;
      if (flag === 'lock' && o.def.inputs === 0) return;
      o.flags[flag] = val;
    });
    N.render(); K.commit(true); K.bus.emit('select');
    if (flag === 'lock') K.toast(val ? 'Locked ' + ids.length + ' operator' + (ids.length > 1 ? 's' : '') + ' — output frozen' : 'Unlocked');
  };
  // simple layered layout left→right by dependency depth
  N.tidy = function () {
    const ops = K.opsIn(P.network);
    if (!ops.length) return;
    const depth = new Map();
    const d = (op, seen) => {
      if (depth.has(op.id)) return depth.get(op.id);
      if (seen.has(op.id)) return 0;
      seen.add(op.id);
      let m = 0;
      op.inputs.forEach((id) => { const s = id && K.getOp(id); if (s && s.parent === op.parent) m = Math.max(m, d(s, seen) + 1); });
      depth.set(op.id, m);
      return m;
    };
    ops.forEach((o) => d(o, new Set()));
    const cols = {};
    ops.sort((a, b) => FAM_ORDER.indexOf(a.family) - FAM_ORDER.indexOf(b.family) || a.y - b.y).forEach((o) => {
      const c = depth.get(o.id); cols[c] = cols[c] || []; cols[c].push(o);
    });
    Object.keys(cols).forEach((c) => cols[c].forEach((o, i) => { o.x = c * (NW + 64); o.y = i * (NH + 56); }));
    N.render(); N.fit(); K.commit(true);
  };

  /* ---------------- pointer interaction ---------------- */
  function init() {
    canvasEl = $('#netCanvas'); innerEl = $('#netInner'); nodesEl = $('#nodes'); wiresEl = $('#wires');
    const pointers = new Map();
    let drag = null, lastTap = { t: 0, x: 0, y: 0 }, longTimer = null;

    canvasEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const nodeEl = e.target.closest('.node');
      if (nodeEl) N.nodeMenu(K.getOp(nodeEl.dataset.id), e.clientX, e.clientY);
      else N.bgMenu(e.clientX, e.clientY);
    });

    canvasEl.addEventListener('pointerdown', (e) => {
      $('#network').focus({ preventScroll: true });
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) { // pinch start
        const [a, b] = Array.from(pointers.values());
        drag = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), z0: N.zoom, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, px: N.panX, py: N.panY };
        clearTimeout(longTimer);
        return;
      }
      if (e.button === 2) return;
      const t = e.target;
      const nodeEl = t.closest('.node');
      const op = nodeEl && K.getOp(nodeEl.dataset.id);
      canvasEl.setPointerCapture(e.pointerId);
      // long press → context menu (touch)
      if (e.pointerType === 'touch') {
        clearTimeout(longTimer);
        longTimer = setTimeout(() => {
          if (drag && !drag.moved) {
            const cx = drag.sx, cy = drag.sy;
            drag = null;
            op ? N.nodeMenu(op, cx, cy) : N.bgMenu(cx, cy);
          }
        }, 550);
      }
      if (t.classList.contains('flag')) {
        N.select(op.id);
        N.toggleFlag(t.dataset.flag);
        drag = null; return;
      }
      if (t.classList.contains('port')) {
        if (t.classList.contains('out')) { drag = { type: 'wire', from: op.id, sx: e.clientX, sy: e.clientY }; return; }
        const i = +t.dataset.in;
        if (op.inputs[i]) { // detach & rewire
          const from = op.inputs[i];
          K.disconnect(op.id, i);
          N.render();
          drag = { type: 'wire', from, sx: e.clientX, sy: e.clientY, detached: true };
        } else drag = { type: 'wireRev', to: op.id, i, sx: e.clientX, sy: e.clientY };
        return;
      }
      if (t.closest('.wire-x')) {
        const g = t.closest('.wire-x');
        K.disconnect(g.dataset.to, +g.dataset.i); N.selWire = null; N.render(); K.commit(true); drag = null; return;
      }
      if (t.classList.contains('wire-hit')) {
        N.selWire = { to: t.dataset.to, i: +t.dataset.i };
        P.selection.clear(); N.updateSelection(); N.drawWires(null, true); drag = null; return;
      }
      if (op) {
        const additive = e.shiftKey || e.metaKey || e.ctrlKey;
        if (additive && P.selection.has(op.id)) { P.selection.delete(op.id); N.updateSelection(); K.bus.emit('select'); }
        else if (!P.selection.has(op.id) || additive) N.select(op.id, additive);
        else { P.current = op.id; N.updateSelection(); K.bus.emit('select'); }
        const ids = Array.from(P.selection);
        drag = { type: 'move', ids, start: ids.map((id) => [K.getOp(id).x, K.getOp(id).y]), sx: e.clientX, sy: e.clientY, op };
        // double-click/tap detection on node
        const now = performance.now();
        if (now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 12 && lastTap.id === op.id) {
          lastTap.t = 0; drag = null;
          if (op.def.container) N.enter(op.id);
          else if (op.type === 'outTOP') { N.select(op.id); K.viewer.maximize(true, 'output'); }
          else K.bus.emit('focusParams', op);
          return;
        }
        lastTap = { t: now, x: e.clientX, y: e.clientY, id: op.id };
        return;
      }
      // background
      N.selWire = null;
      const now = performance.now();
      if (now - lastTap.t < 320 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 14 && !lastTap.id) {
        lastTap.t = 0; drag = null;
        N.opCreate(e.clientX, e.clientY);
        return;
      }
      lastTap = { t: now, x: e.clientX, y: e.clientY, id: null };
      if (e.shiftKey) drag = { type: 'box', sx: e.clientX, sy: e.clientY };
      else drag = { type: 'pan', sx: e.clientX, sy: e.clientY, px: N.panX, py: N.panY, clear: !e.shiftKey };
    });

    canvasEl.addEventListener('pointermove', (e) => {
      if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!drag) return;
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (Math.hypot(dx, dy) > 4) { drag.moved = true; clearTimeout(longTimer); }
      if (drag.type === 'pinch') {
        const pts = Array.from(pointers.values());
        if (pts.length < 2) return;
        const [a, b] = pts, d = Math.hypot(a.x - b.x, a.y - b.y);
        const z = U.clamp(drag.z0 * (d / drag.d0), 0.15, 2.5);
        const r = canvasEl.getBoundingClientRect(), cx = (a.x + b.x) / 2 - r.left, cy = (a.y + b.y) / 2 - r.top;
        const wx = (drag.cx - r.left - drag.px) / drag.z0, wy = (drag.cy - r.top - drag.py) / drag.z0;
        N.zoom = z; N.panX = cx - wx * z; N.panY = cy - wy * z; N.applyView();
      } else if (drag.type === 'pan') {
        if (!drag.moved) return;
        canvasEl.classList.add('panning');
        N.panX = drag.px + dx; N.panY = drag.py + dy; N.applyView();
      } else if (drag.type === 'move') {
        if (!drag.moved) return;
        drag.ids.forEach((id, k) => {
          const o = K.getOp(id);
          if (!o) return;
          o.x = Math.round((drag.start[k][0] + dx / N.zoom) / 8) * 8;
          o.y = Math.round((drag.start[k][1] + dy / N.zoom) / 8) * 8;
          const v = N.els.get(id);
          if (v) { v.el.style.left = o.x + 'px'; v.el.style.top = o.y + 'px'; }
        });
        N.drawWires();
      } else if (drag.type === 'wire' || drag.type === 'wireRev') {
        const w = N.toWorld(e.clientX, e.clientY);
        const d = drag.type === 'wire' ? bez(outPos(K.getOp(drag.from)), w) : bez(w, inPos(K.getOp(drag.to), drag.i));
        N.drawWires(d, true);
        document.querySelectorAll('.port.hot').forEach((p) => p.classList.remove('hot'));
        const t = document.elementFromPoint(e.clientX, e.clientY);
        if (t && t.classList.contains('port')) t.classList.add('hot');
      } else if (drag.type === 'box') {
        const b = $('#boxSelect'), r = canvasEl.getBoundingClientRect();
        const x0 = Math.min(drag.sx, e.clientX) - r.left, y0 = Math.min(drag.sy, e.clientY) - r.top;
        Object.assign(b.style, { display: 'block', left: x0 + 'px', top: y0 + 'px', width: Math.abs(dx) + 'px', height: Math.abs(dy) + 'px' });
      }
    });

    const end = (e) => {
      pointers.delete(e.pointerId);
      clearTimeout(longTimer);
      canvasEl.classList.remove('panning');
      if (!drag) return;
      const d = drag; drag = null;
      if (d.type === 'pinch') return;
      if (d.type === 'pan' && !d.moved) {
        if (P.selection.size || P.current) {
          P.selection.clear(); P.current = null;
          N.updateSelection(); K.bus.emit('select');
        }
        N.drawWires(null, true);
      }
      if (d.type === 'move' && d.moved) K.commit(true);
      if (d.type === 'box') {
        $('#boxSelect').style.display = 'none';
        const a = N.toWorld(d.sx, d.sy), b = N.toWorld(e.clientX, e.clientY);
        const x0 = Math.min(a[0], b[0]), x1 = Math.max(a[0], b[0]), y0 = Math.min(a[1], b[1]), y1 = Math.max(a[1], b[1]);
        if (!e.shiftKey) P.selection.clear();
        K.opsIn(P.network).forEach((o) => { if (o.x + NW > x0 && o.x < x1 && o.y + NH > y0 && o.y < y1) P.selection.add(o.id); });
        N.updateSelection(); K.bus.emit('select');
      }
      if (d.type === 'wire' || d.type === 'wireRev') {
        document.querySelectorAll('.port.hot').forEach((p) => p.classList.remove('hot'));
        const t = document.elementFromPoint(e.clientX, e.clientY);
        const nodeEl = t && t.closest && t.closest('.node');
        const target = nodeEl && K.getOp(nodeEl.dataset.id);
        let ok = false;
        if (d.type === 'wire') {
          if (target && target.id !== d.from) {
            const idx = t.classList.contains('port') && t.classList.contains('in') ? +t.dataset.in : null;
            ok = K.connect(d.from, target.id, idx);
            if (!ok && target.family !== K.getOp(d.from).family) {
              // cross-family drop: create a reference link if target has a matching op parameter
              const src = K.getOp(d.from);
              const ref = target.def.params.find((p) => p.type === 'op' && p.family === src.family);
              if (ref) { target.p[ref.name] = src.name; ok = true; K.toast('Linked ' + src.name + ' → ' + target.name + '.' + ref.label); }
            }
          } else if (!target && d.moved && !d.detached) {
            // dropped on empty space: open OP Create and auto-connect
            const src = K.getOp(d.from);
            N.opCreate(e.clientX, e.clientY, { from: d.from, family: src.family, world: N.toWorld(e.clientX + NW / 2, e.clientY) });
          }
        } else if (target && target.id !== d.to) {
          ok = K.connect(target.id, d.to, d.i);
        } else if (!target && d.moved) {
          const dst = K.getOp(d.to);
          N.opCreate(e.clientX, e.clientY, { to: d.i, toOp: d.to, family: dst.family, world: N.toWorld(e.clientX - NW / 2, e.clientY) });
        }
        N.render();
        if (ok || d.detached) K.commit(true);
      }
    };
    canvasEl.addEventListener('pointerup', end);
    canvasEl.addEventListener('pointercancel', end);

    canvasEl.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = canvasEl.getBoundingClientRect();
      const isMouseWheel = (!e.ctrlKey && e.deltaMode === 1) || (!e.ctrlKey && Math.abs(e.deltaY) >= 50 && e.deltaX === 0 && Number.isInteger(e.deltaY));
      if (e.ctrlKey || isMouseWheel) {
        const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
        const z = U.clamp(N.zoom * f, 0.15, 2.5);
        const mx = e.clientX - r.left, my = e.clientY - r.top;
        const wx = (mx - N.panX) / N.zoom, wy = (my - N.panY) / N.zoom;
        N.zoom = z; N.panX = mx - wx * z; N.panY = my - wy * z;
      } else { N.panX -= e.deltaX; N.panY -= e.deltaY; }
      N.applyView();
    }, { passive: false });

    N.applyView();
  }
  N.init = init;
})();
