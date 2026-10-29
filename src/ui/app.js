/* Kiln TD — app.js : boot, main loop, menus, command palette, timeline, keyboard, files, dialogs */
(function () {
  'use strict';
  const K = window.K, U = K.util, P = K.project, T = K.time;
  let UI, N, V, h;
  const $ = (s) => document.querySelector(s);
  const KEYS = {
    autosave: 'kiln.td.autosave',
    theme: 'kiln.td.theme',
    previews: 'kiln.td.previews',
    cook: 'kiln.td.cook',
    quality: 'kiln.td.quality',
    perf: 'kiln.td.perf',
  };
  const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

  /* ---------------- transport API ---------------- */
  K.seek = function (t) { T.seconds = Math.max(0, +t || 0); T.jumped = true; T.frame = Math.floor(T.seconds * P.fps); };
  K.api = K.api || {};
  Object.assign(K.api, {
    play() { T.playing = true; syncPlay(); },
    pause() { T.playing = false; syncPlay(); },
    toggle() { T.playing = !T.playing; syncPlay(); },
    seek: (t) => K.seek(t),
    op: (n) => K.findOp(n),
    toast: (m) => K.toast(m),
    perform: () => V.enterPerform(),
    record: (o) => V.startRecording(Object.assign({ fps: 60, mbps: 16 }, o || {})),
    stop: () => V.stopRecording(),
    load: (id) => K.loadExample(id),
    palette: () => openCommandPalette(),
    previews: (on) => applyPreviews(on !== false, true),
    quality: (q) => applyQuality(q, true),
  });

  function syncPlay() {
    const b = $('#tlPlay');
    if (b) b.classList.toggle('paused', !T.playing);
    const live = $('#netLive');
    if (live) {
      live.classList.toggle('paused', !T.playing);
      const s = live.querySelector('span');
      if (s) { const txt = T.playing ? 'LIVE' : 'PAUSED'; if (s.textContent !== txt) s.textContent = txt; }
    }
    if (N) N.drawWires();
  }

  /* ---------------- boot ---------------- */
  function boot() {
    UI = K.ui; N = K.net; V = K.viewer; h = UI.h;
    K.finalizeTypes();
    const ok = (() => { try { return K.gl.init(document.getElementById('glCanvas')) !== false; } catch (e) { console.error(e); return false; } })();
    if (!ok || !K.gl.gl) {
      document.body.innerHTML = '<div style="font:15px/1.6 system-ui;color:#ddd;background:#111;height:100vh;display:grid;place-items:center;padding:24px;text-align:center"><div><h2 style="margin:0 0 8px">WebGL 2 is not available</h2><p>Kiln renders on the GPU with WebGL 2. Try a current Safari, Chrome, Edge or Firefox, and make sure hardware acceleration is on.</p></div></div>';
      return;
    }
    N.init();
    V.init();
    K.paramsUI.render();
    buildPalette();
    wireTopbar();
    wireTimeline();
    wireKeyboard();
    wireSplitter();
    wireDrop();
    wirePerf();

    // restore workspace preferences
    applyPreviews(U.store.get(KEYS.previews) !== '0', false);
    applyCook(U.store.get(KEYS.cook) !== '0', false);
    applyQuality(parseFloat(U.store.get(KEYS.quality)) || 1, false);
    setPerfPanel(U.store.get(KEYS.perf) === '1', false);

    // fonts → redraw Text TOPs & restore any custom fonts saved on device
    if (document.fonts) {
      document.fonts.ready.then(() => { K.fontEpoch = (K.fontEpoch || 0) + 1; });
      document.fonts.addEventListener && document.fonts.addEventListener('loadingdone', () => { K.fontEpoch = (K.fontEpoch || 0) + 1; });
    }
    if (K.files && K.files.restoreFonts) K.files.restoreFonts();

    // initial project: autosave, else welcome
    let loaded = false;
    const saved = U.store.get(KEYS.autosave);
    if (saved) {
      try { K.load(JSON.parse(saved)); loaded = P.ops.size > 0; } catch (e) { loaded = false; }
    }
    if (!loaded) K.loadExample('welcome');
    else { N.render(); requestAnimationFrame(() => N.fit()); }
    syncProject();
    syncPlay();

    K.bus.on('graph', () => { clearTimeout(graphT); graphT = setTimeout(() => N.render(), 16); });
    K.bus.on('project', () => { syncProject(); applyPreviews(K.previewAll, false); });
    K.bus.on('select', () => { if (P.current && !V.performing && !loadingEx) V.setMode('selected'); });
    K.bus.on('dirty', () => { dirty = true; });
    K.bus.on('rec', syncRec);
    setInterval(autosave, 5000);
    window.addEventListener('beforeunload', autosave);
    window.addEventListener('resize', () => { V.layoutOverlay(); N.drawWires(); });

    last = performance.now();
    requestAnimationFrame(loop);
  }
  let graphT, dirty = false, loadingEx = false;
  const _le = K.loadExample;
  K.loadExample = function (id) {
    loadingEx = true;
    try { _le(id); } finally { loadingEx = false; }
  };
  function autosave() {
    if (!dirty) return;
    dirty = false;
    try { U.store.set(KEYS.autosave, JSON.stringify(K.serialize())); } catch (e) {}
  }

  /* ---------------- main loop ---------------- */
  let last = 0, frameN = 0, fpsAcc = 0, fpsN = 0, cookAcc = 0, wasPlaying = true, lastFps = 0, lastCook = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    T.dt = dt; T.absSeconds += dt;
    if (T.playing) {
      T.seconds += dt * T.rate;
      if (T.seconds >= P.length) {
        if (T.loop && !V.recording) { T.seconds = T.seconds % P.length; T.jumped = true; }
        else if (!V.recording) { T.seconds = P.length; T.playing = false; syncPlay(); }
      }
    }
    T.frame = Math.floor(T.seconds * P.fps);
    const t0 = performance.now();
    try { K.cookAll(); } catch (e) { console.error(e); }
    try { V.draw(); } catch (e) { console.error(e); }
    T.jumped = false;
    if (K.keyTaps) K.keyTaps.clear();
    cookAcc += performance.now() - t0;
    frameN++;
    if (frameN % 6 === 0) K.paramsUI.tick();
    if (frameN % 60 === 0 && K.r3d && K.r3d.sweep) K.r3d.sweep();
    if (T.playing !== wasPlaying) { wasPlaying = T.playing; syncPlay(); }

    // stats (twice a second is plenty for the HUD)
    fpsAcc += dt; fpsN++;
    if (fpsAcc >= 0.5) {
      lastFps = Math.round(fpsN / fpsAcc);
      lastCook = cookAcc / Math.max(1, fpsN);
      const st = K.cookStats;
      const fpsEl = $('#fps');
      if (fpsEl) fpsEl.textContent = lastFps + ' fps · ' + lastCook.toFixed(1) + ' ms';
      const tc = $('#tlCook');
      if (tc) { const txt = st.ops + ' / ' + st.total + ' cooked'; if (tc.textContent !== txt) tc.textContent = txt; }
      updatePerf();
      fpsAcc = 0; fpsN = 0; cookAcc = 0;
    }
    updateTimeline();

    // recording
    if (V.recording) {
      const el = (performance.now() - V.recording.t0) / 1000;
      if (V.recording.dur && el >= V.recording.dur) V.stopRecording();
      const lbl = $('#recBtn .lbl'), s = 'REC ' + fmtTime(el, true);
      if (lbl && lbl.textContent !== s) lbl.textContent = s;
    }
  }

  function fmtTime(s, short) {
    const m = Math.floor(s / 60), sec = Math.floor(s % 60), ff = Math.floor((s % 1) * 100);
    return String(m).padStart(2, '0') + ':' + String(sec).padStart(2, '0') + (short ? '' : '.' + String(ff).padStart(2, '0'));
  }
  let tlKey = '', tlTimeEl, tlFillEl, tlHeadEl;
  function updateTimeline() {
    const t = T.seconds, pct = U.clamp(t / P.length, 0, 1) * 100;
    tlTimeEl = tlTimeEl || $('#tlTime');
    if (!tlTimeEl._main) {
      tlTimeEl.innerHTML = '<span></span> <small></small>';
      tlTimeEl._main = tlTimeEl.firstChild;
      tlTimeEl._small = tlTimeEl.querySelector('small');
    }
    const txt = fmtTime(t);
    if (tlTimeEl._main.textContent !== txt) tlTimeEl._main.textContent = txt;
    const fTxt = String(T.frame);
    if (tlTimeEl._small.textContent !== fTxt) tlTimeEl._small.textContent = fTxt;
    tlFillEl = tlFillEl || $('#tlFill');
    tlHeadEl = tlHeadEl || $('#tlHead');
    tlFillEl.style.width = pct + '%';
    tlHeadEl.style.left = pct + '%';
    const key = P.length + '|' + P.bpm;
    if (key !== tlKey) {
      tlKey = key;
      const ticks = $('#tlTicks');
      ticks.innerHTML = '';
      const step = P.length <= 12 ? 1 : P.length <= 40 ? 5 : P.length <= 120 ? 10 : P.length <= 600 ? 60 : 300;
      for (let s = 0; s < P.length; s += step) {
        const sp = document.createElement('span');
        sp.style.left = (s / P.length) * 100 + '%';
        sp.textContent = s >= 60 ? Math.floor(s / 60) + 'm' + (s % 60 ? s % 60 : '') : s + 's';
        ticks.appendChild(sp);
      }
    }
  }

  /* ---------------- project sync ---------------- */
  function syncProject() {
    const title = $('#projTitle');
    if (title) title.value = P.title || 'Untitled';
    document.title = (P.title || 'Untitled') + ' — Kiln';
    const v = P.res.w + 'x' + P.res.h, sel = $('#resSelect');
    if (sel) {
      if (!Array.from(sel.options).some((o) => o.value === v)) {
        const o = document.createElement('option');
        o.value = v; o.textContent = P.res.w + ' × ' + P.res.h + ' · custom';
        sel.insertBefore(o, sel.lastElementChild);
      }
      sel.value = v;
    }
    const len = $('#tlLen'), bpm = $('#tlBpm'), loop = $('#tlLoop');
    if (len) len.value = P.length;
    if (bpm) bpm.value = P.bpm;
    if (loop) loop.checked = T.loop;
    V.resize();
    const pr = $('#pfRes');
    if (pr) pr.textContent = P.res.w + ' × ' + P.res.h;
    tlKey = '';
  }

  /* ---------------- palette ---------------- */
  const FAMS = ['TOP', 'CHOP', 'SOP', 'MAT', 'DAT', 'COMP'];
  let palFam = 'TOP';
  function buildPalette() {
    const tabs = $('#paletteTabs'), list = $('#paletteList'), search = $('#paletteSearch'), count = $('#paletteCount');
    const draw = () => {
      tabs.innerHTML = '';
      FAMS.forEach((f) => {
        const on = f === palFam && !search.value;
        tabs.appendChild(h('button', { class: 'ptab' + (on ? ' on' : ''), style: on ? { background: UI.famColor(f) } : { color: UI.famColor(f) }, onclick: () => { palFam = f; search.value = ''; draw(); } }, f));
      });
      list.innerHTML = '';
      const q = search.value.trim().toLowerCase();
      const all = Object.values(K.types).filter((d) => !d.hidden);
      const defs = all.filter((d) => (q ? (d.label + ' ' + d.family + ' ' + d.type + ' ' + (d.help || '')).toLowerCase().includes(q) : d.family === palFam));
      if (count) count.textContent = q ? defs.length + ' found' : defs.length + ' operators';
      const gens = defs.filter((d) => d.inputs === 0 || d.gen), filt = defs.filter((d) => !(d.inputs === 0 || d.gen));
      let kind = '';
      gens.concat(filt).forEach((d) => {
        const k = d.inputs === 0 || d.gen ? 'gen' : 'filter';
        if (k !== kind && !q) { kind = k; list.appendChild(h('div', { class: 'pgroup' }, k === 'gen' ? 'Generators' : 'Operators')); }
        const it = h('button', { class: 'pitem', title: d.help || d.label, 'data-type': d.type },
          h('span', { class: 'sw' + (d.inputs === 0 || d.gen ? '' : ' filter'), style: { background: UI.famColor(d.family) } }),
          h('span', null, d.label), h('small', null, q ? d.family : d.inputs === 0 || d.gen ? 'gen' : ''));
        attachDrag(it, d.type);
        list.appendChild(it);
      });
      if (!defs.length) list.appendChild(h('div', { style: { color: 'var(--faint)', padding: '10px', fontSize: '12px' } }, 'No operators match.'));
    };
    search.addEventListener('input', draw);
    search.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { search.value = ''; draw(); search.blur(); }
      if (e.key === 'Enter') {
        const first = list.querySelector('.pitem');
        if (first) {
          const [x, y] = centerWorld();
          N.addOp(first.dataset.type, x - UI.NODE.NW / 2 + (Math.random() - 0.5) * 40, y - UI.NODE.NH / 2 + (Math.random() - 0.5) * 40);
        }
      }
    });
    draw();
  }
  function attachDrag(el, type) {
    let ghost = null, sx = 0, sy = 0, moved = false, pid = null;
    el.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      pid = e.pointerId; sx = e.clientX; sy = e.clientY; moved = false;
      el.setPointerCapture(pid);
    });
    el.addEventListener('pointermove', (e) => {
      if (pid !== e.pointerId) return;
      if (!moved && Math.hypot(e.clientX - sx, e.clientY - sy) > 6) {
        moved = true;
        ghost = el.cloneNode(true);
        Object.assign(ghost.style, { position: 'fixed', pointerEvents: 'none', zIndex: 90, width: el.offsetWidth + 'px', background: 'var(--raised)', boxShadow: 'var(--shadow)', opacity: 0.92 });
        document.body.appendChild(ghost);
      }
      if (ghost) { ghost.style.left = e.clientX - 20 + 'px'; ghost.style.top = e.clientY - 14 + 'px'; }
    });
    const end = (e) => {
      if (pid !== e.pointerId) return;
      pid = null;
      if (ghost) { ghost.remove(); ghost = null; }
      if (moved) {
        const r = $('#netCanvas').getBoundingClientRect();
        if (e.clientX > r.left && e.clientX < r.right && e.clientY > r.top && e.clientY < r.bottom) {
          const [x, y] = N.toWorld(e.clientX, e.clientY);
          N.addOp(type, x - UI.NODE.NW / 2, y - UI.NODE.NH / 2);
        }
      } else {
        const [x, y] = centerWorld();
        N.addOp(type, x - UI.NODE.NW / 2 + (Math.random() - 0.5) * 60, y - UI.NODE.NH / 2 + (Math.random() - 0.5) * 60);
      }
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', () => { if (ghost) ghost.remove(); ghost = null; pid = null; });
  }
  function centerWorld() { const r = $('#netCanvas').getBoundingClientRect(); return N.toWorld(r.left + r.width / 2, r.top + r.height / 2); }
  function centerClient() { const r = $('#netCanvas').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 3]; }

  /* ---------------- view / cook / quality toggles ---------------- */
  function applyPreviews(on, announce) {
    V.setPreviews(on);
    const b = $('#previewBtn');
    if (b) { b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
    const o = $('#optPreview');
    if (o) o.checked = on;
    U.store.set(KEYS.previews, on ? '1' : '0');
    if (announce) K.toast(on ? 'Live node previews on' : 'Node previews off — only the viewer cooks');
  }
  function applyCook(on, announce) {
    K.optimizeCooking = on;
    const o = $('#optCook');
    if (o) o.checked = on;
    U.store.set(KEYS.cook, on ? '1' : '0');
    if (announce) K.toast(on ? 'Cook only what is needed — on' : 'Selective cooking off — every operator cooks');
  }
  function applyQuality(q, announce) {
    q = [1, 0.5, 0.25].includes(q) ? q : 1;
    const sel = $('#qualitySel');
    if (sel) sel.value = String(q);
    V.setQuality(q);
    U.store.set(KEYS.quality, String(q));
    if (announce) K.toast('Viewer preview at ' + (q === 1 ? 'full resolution' : q === 0.5 ? 'half resolution' : 'quarter resolution') + ' — output and snapshots stay full quality');
  }

  /* ---------------- topbar & menus ---------------- */
  function wireTopbar() {
    $('#projTitle').addEventListener('change', (e) => { P.title = e.target.value.trim() || 'Untitled'; document.title = P.title + ' — Kiln'; K.commit(); });
    $('#projTitle').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') e.target.blur(); });
    $('#resSelect').addEventListener('change', (e) => {
      let v = e.target.value;
      if (v === 'custom') {
        const s = window.prompt('Resolution (width x height)', P.res.w + 'x' + P.res.h);
        const m = s && s.match(/(\d+)\s*[x×,* ]\s*(\d+)/);
        if (!m) { e.target.value = P.res.w + 'x' + P.res.h; return; }
        v = U.clamp(+m[1], 16, 8192) + 'x' + U.clamp(+m[2], 16, 8192);
      }
      const [w, hh] = v.split('x').map(Number);
      P.res = { w, h: hh };
      syncProject();
      K.commit(true);
      K.toast('Resolution ' + w + ' × ' + hh);
    });
    $('#themeBtn').addEventListener('click', () => {
      const r = document.documentElement;
      r.dataset.theme = r.dataset.theme === 'light' ? 'dark' : 'light';
      U.store.set(KEYS.theme, r.dataset.theme);
      N.drawWires();
    });
    const th = U.store.get(KEYS.theme); if (th) document.documentElement.dataset.theme = th;
    $('#performBtn').addEventListener('click', () => V.enterPerform());
    $('#filesBtn').addEventListener('click', () => K.files.openLibrary());
    $('#recBtn').addEventListener('click', () => (V.recording ? V.stopRecording() : recordDialog()));
    $('#paletteToggle').addEventListener('click', () => {
      const ws = $('#workspace');
      if (window.innerWidth < 1100) ws.classList.toggle('show-palette'); else ws.classList.toggle('no-palette');
      setTimeout(() => N.drawWires(), 50);
    });
    $('#addBtn').addEventListener('click', () => { const [cx, cy] = centerClient(); N.opCreate(cx, cy); });
    $('#fitBtn').addEventListener('click', () => N.fit());
    $('#tidyBtn').addEventListener('click', () => N.tidy());
    $('#previewBtn').addEventListener('click', () => applyPreviews(!K.previewAll, true));
    $('#qualitySel').addEventListener('change', (e) => applyQuality(parseFloat(e.target.value) || 1, true));

    const ns = $('#netSearch');
    if (ns) {
      ns.addEventListener('input', () => N.setSearch(ns.value));
      ns.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') { ns.value = ''; N.setSearch(''); ns.blur(); }
        if (e.key === 'Enter') { if (!N.searchFirst()) K.toast('No node matches “' + ns.value + '”'); }
      });
    }

    document.querySelectorAll('#menu > button').forEach((b) => b.addEventListener('click', () => openMenu(b)));
    document.getElementById('perform').addEventListener('dblclick', () => V.exitPerform());
  }

  function openMenu(btn) {
    const r = btn.getBoundingClientRect(), x = r.left, y = r.bottom + 4;
    const kind = btn.dataset.menu, mod = MOD === '⌘' ? '⌘' : 'Ctrl+';
    let items = [];
    if (kind === 'file') items = [
      { label: 'New project', key: '', fn: newProject },
      { label: 'Open…', key: mod + 'O', fn: openProject },
      { label: 'Save', key: mod + 'S', fn: () => saveProject(false) },
      { label: 'Save with media embedded', fn: () => saveProject(true) },
      { label: 'Kiln Files (recordings, exports, saves)…', key: '⇧F', fn: () => K.files.openLibrary() },
      '-',
      { label: 'Export PNG (full resolution)', fn: () => { V.snapRequested = true; } },
      { label: 'Record video…', key: 'R', fn: recordDialog },
      { label: 'Perform mode', key: 'P', fn: () => V.enterPerform() },
      { label: 'VR headset output', fn: () => K.xr.toggle(), disabled: !K.xr.supported },
    ];
    else if (kind === 'edit') items = [
      { label: 'Undo', key: mod + 'Z', fn: () => K.history.undo(), disabled: K.history.index <= 0 },
      { label: 'Redo', key: mod + '⇧Z', fn: () => K.history.redo(), disabled: K.history.index >= K.history.stack.length - 1 },
      '-',
      { label: 'Copy', key: mod + 'C', fn: () => N.copy() },
      { label: 'Paste', key: mod + 'V', fn: () => N.paste() },
      { label: 'Duplicate', key: mod + 'D', fn: () => N.duplicate() },
      { label: 'Delete', key: '⌫', fn: () => N.deleteSelection() },
      '-',
      { label: 'Select all', key: mod + 'A', fn: selectAll },
      { label: 'Collapse into Base COMP', key: '⇧C', fn: () => N.collapse() },
      { label: 'Tidy layout', fn: () => N.tidy() },
      { label: 'Rename', key: 'F2', fn: () => P.current && N.rename(P.current) },
      '-',
      { label: 'Command palette…', key: mod + 'K', fn: openCommandPalette },
      { label: 'Clear autosave', fn: () => { U.store.set(KEYS.autosave, ''); K.toast('Autosave cleared'); } },
    ];
    else if (kind === 'add') {
      items = [{ head: 'Add operator' }];
      FAMS.forEach((f) => items.push({ label: K.FAMILIES[f].label + ' — ' + K.FAMILIES[f].name, swatch: UI.famColor(f), fn: () => { const [cx, cy] = centerClient(); N.opCreate(cx, cy, { family: f }); } }));
      items.push('-', { label: 'Search all…', key: 'Tab', fn: () => { const [cx, cy] = centerClient(); N.opCreate(cx, cy); } });
    }
    else if (kind === 'network') {
      const cur = K.getOp(P.current);
      items = [
        { label: 'Add operator…', key: 'Tab', fn: () => { const [cx, cy] = centerClient(); N.opCreate(cx, cy); } },
        { label: 'Frame all', key: 'H', fn: () => N.fit() },
        { label: 'Tidy layout', fn: () => N.tidy() },
        P.network !== 'root' ? { label: 'Go up a level', key: 'U', fn: () => N.up() } : null,
        { label: 'Enter selected COMP', key: 'I', disabled: !cur || !cur.def.container, fn: () => cur && N.enter(cur.id) },
        '-',
        { label: (K.previewAll ? '✓  ' : '    ') + 'Live node previews', key: '⇧P', fn: () => applyPreviews(!K.previewAll, true) },
        { label: (K.optimizeCooking ? '✓  ' : '    ') + 'Cook only what is needed', fn: () => applyCook(!K.optimizeCooking, true) },
        { head: 'Viewer preview quality' },
        { label: (V.quality === 1 ? '✓  ' : '    ') + 'Full resolution', fn: () => applyQuality(1, true) },
        { label: (V.quality === 0.5 ? '✓  ' : '    ') + 'Half resolution', fn: () => applyQuality(0.5, true) },
        { label: (V.quality === 0.25 ? '✓  ' : '    ') + 'Quarter resolution', fn: () => applyQuality(0.25, true) },
        '-',
        { label: 'Performance monitor', key: '⇧M', fn: () => setPerfPanel($('#perfPanel').hidden, true) },
        { label: 'Select all', key: mod + 'A', fn: selectAll },
        { label: 'Collapse selected into Base COMP', key: '⇧C', fn: () => N.collapse() },
      ];
    }
    else if (kind === 'examples') { examplesDialog(); return; }
    else if (kind === 'help') { helpDialog(); return; }
    else if (kind === 'bible') { K.bible.open(); return; }
    UI.menu(items, x, y);
    btn.classList.add('open');
  }

  function selectAll() {
    P.selection.clear();
    K.opsIn(P.network).forEach((o) => P.selection.add(o.id));
    if (N.updateSelection) N.updateSelection();
    K.bus.emit('select');
  }

  /* ---------------- command palette ---------------- */
  function openCommandPalette() {
    if (document.querySelector('#popRoot .cmdk')) return;
    UI.closePops();
    const back = h('div', {
      style: { position: 'absolute', inset: 0, pointerEvents: 'all', background: 'rgba(0,0,0,.32)', backdropFilter: 'blur(2px)' },
      onpointerdown: (e) => { if (e.target === back) UI.closePops(); },
    });
    popRoot().appendChild(back);
    const search = h('input', { class: 'cmdk-input', placeholder: 'Search commands, operators, examples…', spellcheck: 'false', 'aria-label': 'Command palette' });
    const list = h('div', { class: 'cmdk-list' });
    const box = h('div', { class: 'pop cmdk' },
      h('div', { class: 'cmdk-input-wrap' },
        h('span', { html: '<svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="7" cy="7" r="4.5"/><path d="M10.4 10.4 14 14"/></svg>' }),
        search, h('span', { class: 'cmdk-hint' }, 'Esc')),
      list);
    back.appendChild(box);
    box.style.left = Math.max(10, Math.round((innerWidth - 620) / 2)) + 'px';
    box.style.top = Math.max(46, Math.round(innerHeight * 0.1)) + 'px';

    const cmds = [];
    const add = (group, label, fn, opts) => cmds.push(Object.assign({ group, label, fn }, opts || {}));
    const A = 'Actions';
    add(A, 'Add operator…', () => { const [cx, cy] = centerClient(); N.opCreate(cx, cy); }, { key: 'Tab' });
    add(A, 'Frame all nodes', () => N.fit(), { key: 'H' });
    add(A, 'Tidy layout', () => N.tidy());
    add(A, (K.previewAll ? 'Hide' : 'Show') + ' live node previews', () => applyPreviews(!K.previewAll, true), { key: '⇧P' });
    add(A, (K.optimizeCooking ? 'Disable' : 'Enable') + ' selective cooking', () => applyCook(!K.optimizeCooking, true));
    add(A, 'Preview quality: full resolution', () => applyQuality(1, true));
    add(A, 'Preview quality: half resolution', () => applyQuality(0.5, true));
    add(A, 'Preview quality: quarter resolution', () => applyQuality(0.25, true));
    add(A, 'Performance monitor', () => setPerfPanel($('#perfPanel').hidden, true), { key: '⇧M' });
    add(A, 'Perform mode', () => V.enterPerform(), { key: 'P' });
    add(A, 'VR headset output', () => K.xr.toggle());
    add(A, 'Record video…', recordDialog, { key: 'R' });
    add(A, 'Export PNG (full resolution)', () => { V.snapRequested = true; });
    add(A, 'Save project', () => saveProject(false), { key: modKey() + 'S' });
    add(A, 'Save with media embedded', () => saveProject(true));
    add(A, 'Open project…', openProject, { key: modKey() + 'O' });
    add(A, 'New project', newProject);
    add(A, 'Open Kiln Files', () => K.files.openLibrary(), { key: '⇧F' });
    add(A, 'Select all operators', selectAll, { key: modKey() + 'A' });
    add(A, 'Collapse selection into Base COMP', () => N.collapse(), { key: '⇧C' });
    add(A, 'Delete selection', () => N.deleteSelection(), { key: 'Del' });
    add(A, 'Lock / unlock selected output', () => N.toggleFlag('lock'), { key: 'L' });
    add(A, 'Enter selected COMP', () => { const o = K.getOp(P.current); if (o && o.def.container) N.enter(o.id); });
    add(A, 'Go up a level', () => N.up());
    add(A, 'Toggle light / dark theme', () => $('#themeBtn').click());
    add(A, 'Open the Kiln Bible', () => K.bible.open(), { key: '?' });
    add(A, 'Help & shortcuts', helpDialog);
    add(A, 'Browse examples…', examplesDialog);

    K.EXAMPLES.forEach((ex) => add('Examples', ex.title, () => { K.loadExample(ex.id); K.seek(0); T.playing = true; syncPlay(); syncProject(); dirty = true; }, { small: ex.tags.join(' · '), swatch: UI.famColor(ex.tags[0]) }));
    Object.values(K.types).filter((d) => !d.hidden).sort((a, b) => a.label.localeCompare(b.label)).forEach((d) => {
      add('Operators', d.label, () => {
        const [x, y] = centerWorld();
        N.addOp(d.type, x - UI.NODE.NW / 2, y - UI.NODE.NH / 2);
      }, { small: d.family, swatch: UI.famColor(d.family), keywords: d.type + ' ' + (d.help || '') });
    });

    let flat = cmds, hl = 0;
    const draw = () => {
      const q = search.value.trim().toLowerCase();
      flat = q ? cmds.filter((c) => (c.label + ' ' + (c.group || '') + ' ' + (c.keywords || '') + ' ' + (c.small || '')).toLowerCase().includes(q)) : cmds;
      hl = Math.min(hl, Math.max(0, flat.length - 1));
      list.innerHTML = '';
      if (!flat.length) { list.appendChild(h('div', { class: 'cmdk-empty' }, 'Nothing matches “' + search.value + '”')); return; }
      let group = '';
      flat.forEach((c, i) => {
        if (c.group !== group) { group = c.group; list.appendChild(h('div', { class: 'cmdk-group' }, group)); }
        list.appendChild(h('button', {
          class: 'cmdk-item' + (i === hl ? ' hl' : ''),
          onclick: () => { UI.closePops(); c.fn(); },
        }, c.swatch ? h('span', { class: 'sw', style: { background: c.swatch } }) : h('span', { class: 'sw', style: { background: 'transparent', boxShadow: 'inset 0 0 0 1px var(--line-2)' } }),
          c.label, c.key || c.small ? h('small', null, c.key || c.small) : null));
      });
      const el = list.querySelector('.hl');
      if (el) el.scrollIntoView({ block: 'nearest' });
    };
    search.addEventListener('input', () => { hl = 0; draw(); });
    search.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { UI.closePops(); }
      else if (e.key === 'ArrowDown') { hl = Math.min(flat.length - 1, hl + 1); draw(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { hl = Math.max(0, hl - 1); draw(); e.preventDefault(); }
      else if (e.key === 'Enter' && flat[hl]) { e.preventDefault(); UI.closePops(); flat[hl].fn(); }
    });
    draw();
    setTimeout(() => search.focus(), 10);
  }
  function modKey() { return MOD === '⌘' ? '⌘' : 'Ctrl+'; }
  function popRoot() { return $('#popRoot'); }

  /* ---------------- performance panel ---------------- */
  function wirePerf() {
    $('#perfToggle').addEventListener('click', () => setPerfPanel($('#perfPanel').hidden, true));
    $('#perfClose').addEventListener('click', () => setPerfPanel(false, true));
    $('#optCook').addEventListener('change', (e) => applyCook(e.target.checked, true));
    $('#optPreview').addEventListener('change', (e) => applyPreviews(e.target.checked, true));
  }
  function setPerfPanel(on, announce) {
    const p = $('#perfPanel'), b = $('#perfToggle');
    if (p) p.hidden = !on;
    if (b) b.classList.toggle('on', on), b.setAttribute('aria-pressed', String(on));
    U.store.set(KEYS.perf, on ? '1' : '0');
    updatePerf();
    if (announce) K.toast(on ? 'Performance monitor on' : 'Performance monitor off');
  }
  function updatePerf() {
    const p = $('#perfPanel');
    if (!p || p.hidden) return;
    const st = K.cookStats;
    $('#pfFps').textContent = lastFps || '--';
    $('#pfCook').textContent = (lastCook || 0).toFixed(1) + ' ms';
    $('#pfOps').textContent = st.ops + ' / ' + st.total;
    $('#pfRes').textContent = P.res.w + ' × ' + P.res.h;
    $('#pfFrame').textContent = String(T.frame) + ' · ' + fmtTime(T.seconds);
  }

  /* ---------------- files ---------------- */
  function newProject() {
    if (P.ops.size && !window.confirm('Start a new empty project? Unsaved changes will be lost.')) return;
    K.clearProject();
    P.title = 'Untitled'; P.res = { w: 1920, h: 1080 }; P.fps = 60; P.length = 30; P.bpm = 120;
    K.seek(0);
    K.history.reset();
    K.bus.emit('project'); K.bus.emit('graph'); K.bus.emit('select');
    N.render();
    V.setMode('selected');
    dirty = true;
  }
  async function openProject() {
    const f = await U.pickFile('.kiln,.json,application/json');
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data.ops) throw new Error('not a Kiln project');
      K.openProjectData(data, f.name);
    } catch (e) { K.toast('Could not open: ' + e.message); }
  }
  K.openProjectData = function (data, name) {
    K.load(data);
    K.seek(0);
    N.render(); requestAnimationFrame(() => N.fit());
    K.bus.emit('select');
    syncProject && syncProject();
    dirty = true;
    K.toast('Opened ' + (name || 'project'));
  };
  async function saveProject(embed) {
    const data = K.serialize();
    if (embed) {
      const used = new Set();
      P.ops.forEach((op) => op.def.params.forEach((pd) => { if (pd.type === 'file' && op.p[pd.name]) used.add(op.p[pd.name]); }));
      data.media = {};
      for (const id of used) {
        const m = K.media.get(id);
        if (!m) continue;
        try {
          const blob = m.blob || (await (await fetch(m.url)).blob());
          const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
          data.media[id] = { name: m.name, type: m.type, url };
        } catch (e) { K.toast('Could not embed ' + m.name); }
      }
      if (K.files && K.customFonts && K.customFonts.size) {
        const allFiles = await K.files.list();
        data.fonts = {};
        for (const [fam, info] of K.customFonts.entries()) {
          const item = allFiles.find((x) => x.kind === 'font' && ((x.meta && x.meta.family === fam) || x.name === info.fileName));
          if (item && item.blob) {
            try {
              const url = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(item.blob); });
              data.fonts[fam] = { family: fam, fileName: item.name, url };
            } catch (e) {}
          }
        }
      }
    }
    await K.saveOut((P.title || 'untitled').replace(/[^\w-]+/g, '_') + (embed ? '_media' : '') + '.kiln', new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }), { kind: 'project', replace: true });
  }

  /* ---------------- dialogs ---------------- */
  function examplesDialog() {
    UI.dialog((d, close) => {
      const grid = h('div', { class: 'ex-grid' });
      K.EXAMPLES.forEach((ex) => grid.appendChild(h('button', { class: 'ex-card', onclick: () => {
        if (P.ops.size > 3 && dirty && !window.confirm('Load "' + ex.title + '"? Your current network will be replaced (save first if you want to keep it).')) return;
        close(); K.loadExample(ex.id); K.seek(0); T.playing = true; syncPlay(); syncProject(); dirty = true;
      } }, h('b', null, ex.title), h('span', null, ex.desc), h('div', { class: 'tags' }, ex.tags.map((t) => h('i', { style: { background: UI.famColor(t) } }, t))))));
      d.append(h('h2', null, 'Examples'), h('p', { class: 'sub' }, 'Working networks to learn from and remix. Loading one replaces the current project.'), grid,
        h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: close }, 'Close')));
    }, { wide: true });
  }

  function helpDialog() {
    const mod = MOD === '⌘' ? '⌘' : 'Ctrl';
    const keys = [
      ['Command palette', mod + ' K'], ['Find node', '/'], ['Add operator (OP Create)', 'Tab · double-click'],
      ['Wire', 'drag output → input'], ['Delete', 'Del / ⌫'], ['Copy / Paste / Duplicate', mod + ' C / V / D'],
      ['Undo / Redo', mod + ' Z / ⇧Z'], ['Save / Open', mod + ' S / O'],
      ['Frame all', 'H / Home'], ['Display / Bypass / Lock flag', 'D / B / L'],
      ['Live node previews', '⇧P'], ['Performance monitor', '⇧M'],
      ['Play / pause', 'Space'], ['Perform mode', 'P / F1'],
      ['Record video', 'R'], ['Enter COMP / go up', 'I / U'],
      ['Collapse to Base COMP', '⇧C'], ['Rename', 'F2'],
      ['Enlarge viewer', 'F'], ['Pan / zoom', 'drag empty · wheel / pinch'], ['Box select', '⇧ drag'],
    ];
    const exprs = [
      ['t', 'timeline seconds'], ['frame', 'timeline frame'], ['beat, bar, bpm', 'tempo clock'], ['progress', '0→1 over timeline'],
      ['absTime', 'seconds since launch'], ['me', 'this operator'], ["op('lfo1')[0]", 'first channel value'], ["op('noise1')['tx']", 'named channel'],
      ["op('table1').cell(r, c)", 'DAT cell'], ["ch('lfo1', 'chan1')", 'shortcut for channel'], ['noise(x, y, z)', 'simplex noise −1…1'],
      ['fit(v, a, b, c, d)', 'remap range'], ['pulse(beat, w)', '1 at start of each beat'], ['tri(x), saw(x), sq(x)', 'periodic waves 0…1'],
      ['smoothstep, mix, clamp, mod, rand(seed)', 'GLSL-style helpers'], ['sin, cos, abs, floor, PI…', 'all of Math'],
    ];
    UI.dialog((d, close) => {
      d.append(
        h('h2', null, 'Kiln TD — quick reference'),
        h('button', { class: 'btn primary', style: { margin: '0 0 12px' }, onclick: () => { close(); K.bible.open(); } }, 'Open the Kiln Bible — every term, operator and recipe, searchable'),
        h('p', { class: 'sub' }, 'A TouchDesigner-style operator environment in the browser. Everything is a node; nodes cook every frame; parameters can be constants, expressions or links.'),
        h('h3', null, 'Operator families'),
        h('div', { class: 'fam-legend' }, FAMS.map((f) => h('div', null, h('b', { style: { background: UI.famColor(f) } }, f), h('span', null, K.FAMILIES[f].name + ' — ' + K.FAMILIES[f].desc)))),
        h('h3', null, 'Shortcuts'),
        h('div', { class: 'help-grid' }, keys.map(([a, b]) => h('div', null, h('span', null, a), h('code', null, b)))),
        h('h3', null, 'Expressions'),
        h('p', { class: 'sub', style: { margin: '0 0 8px' } }, 'Click a parameter label (or press =) to type an expression. Text TOPs also accept {expressions} inside braces.'),
        h('div', { class: 'help-grid' }, exprs.map(([a, b]) => h('div', null, h('code', null, a), h('span', null, b)))),
        h('h3', null, 'TouchDesigner-style workflow'),
        h('p', { class: 'sub', style: { margin: 0 } }, 'Coloured operator headers, B/D/L flags, live thumbnails, node colour overrides and the performance monitor are built in. Press ' + mod + 'K to run any command, or / to find a node by name.'),
        h('h3', null, 'Hardware & networking'),
        h('p', { class: 'sub', style: { margin: 0 } }, 'Browser-native: webcam, mic, screen capture, MIDI (Web MIDI), gamepads, serial/Arduino (Web Serial), WebSocket and HTTP. For DMX/Art-Net, OSC, NDI, Kinect and lasers, run a small relay that speaks WebSocket — see docs/HARDWARE.md.'),
        h('div', { class: 'actions' }, h('button', { class: 'btn primary', onclick: close }, 'Got it')));
    }, { wide: true });
  }

  function recordDialog() {
    if (V.recording) return;
    const mime = V.pickMime();
    UI.dialog((d, close) => {
      const sel = (opts, val) => h('select', { class: 'field' }, opts.map(([v, l]) => h('option', { value: v, selected: String(v) === String(val) }, l)));
      const fps = sel([[30, '30 fps'], [60, '60 fps']], 30);
      const dur = sel([['timeline', 'Whole timeline from start (' + P.length + 's)'], ['manual', 'Until I press stop'], ['custom', 'Custom length…']], 'timeline');
      const secs = h('input', { class: 'field', type: 'number', value: 10, min: 1, max: 3600 });
      const secRow = h('div', { class: 'row', style: { display: 'none' } }, h('label', null, 'Seconds'), secs);
      dur.addEventListener('change', () => { secRow.style.display = dur.value === 'custom' ? '' : 'none'; });
      const mbps = sel([[8, '8 Mbps'], [16, '16 Mbps'], [25, '25 Mbps'], [40, '40 Mbps']], 16);
      const audio = h('input', { type: 'checkbox', checked: true });
      secs.addEventListener('keydown', (e) => e.stopPropagation());
      d.append(
        h('h2', null, 'Movie File Out'),
        h('p', { class: 'sub' }, 'Records the output TOP at full project resolution (' + P.res.w + ' × ' + P.res.h + '). Preview quality is temporarily set to full while recording.'),
        h('div', { class: 'row' }, h('label', null, 'Frame rate'), fps),
        h('div', { class: 'row' }, h('label', null, 'Duration'), dur), secRow,
        h('div', { class: 'row' }, h('label', null, 'Quality'), mbps),
        h('div', { class: 'row' }, h('label', null, 'Include audio'), h('label', null, audio, ' Audio CHOP output')),
        h('div', { class: 'note' }, 'When recording stops, a window opens with Save Video / Share and Download. Every recording is also kept in File → Kiln Files.'),
        h('div', { class: 'note' }, mime ? 'Format: ' + mime.split(';')[0].replace('video/', '').toUpperCase() + ' (' + mime + '). Safari records MP4; Chrome records MP4 or WebM depending on version — convert WebM to MP4 with any free converter if needed.' : 'This browser cannot record video (MediaRecorder unavailable).'),
        h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', disabled: !mime && mime !== '', onclick: () => {
          const o = { fps: +fps.value, mbps: +mbps.value, audio: audio.checked, mime };
          if (dur.value === 'timeline') { o.duration = P.length; o.fromStart = true; }
          else if (dur.value === 'custom') o.duration = U.clamp(+secs.value || 10, 1, 3600);
          close();
          V.startRecording(o);
        } }, 'Start recording')));
    });
  }
  function syncRec() {
    const b = $('#recBtn');
    b.classList.toggle('on', !!V.recording);
    if (!V.recording) b.querySelector('.lbl').textContent = 'Record';
  }

  /* ---------------- timeline ---------------- */
  function wireTimeline() {
    $('#tlStart').addEventListener('click', () => K.seek(0));
    $('#tlPlay').addEventListener('click', () => { T.playing = !T.playing; syncPlay(); });
    $('#tlStep').addEventListener('click', () => { T.playing = false; syncPlay(); K.seek(T.seconds + 1 / P.fps); });
    const scrub = $('#tlScrub');
    let pid = null;
    const at = (e) => { const r = scrub.getBoundingClientRect(); K.seek(U.clamp((e.clientX - r.left) / r.width, 0, 1) * P.length); };
    scrub.addEventListener('pointerdown', (e) => { pid = e.pointerId; scrub.setPointerCapture(pid); at(e); });
    scrub.addEventListener('pointermove', (e) => { if (pid === e.pointerId) at(e); });
    scrub.addEventListener('pointerup', () => { pid = null; });
    const num = (el, fn) => { el.addEventListener('change', () => fn(+el.value)); el.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') el.blur(); }); };
    num($('#tlLen'), (v) => { P.length = U.clamp(v || 30, 1, 3600); tlKey = ''; K.commit(); });
    num($('#tlBpm'), (v) => { P.bpm = U.clamp(v || 120, 20, 300); K.commit(); });
    $('#tlLoop').addEventListener('change', (e) => { T.loop = e.target.checked; });
    let taps = [];
    $('#tapBtn').addEventListener('click', () => {
      const now = performance.now();
      taps = taps.filter((t) => now - t < 2500); taps.push(now);
      if (taps.length >= 2) {
        const iv = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
        P.bpm = Math.round(U.clamp(60000 / iv, 20, 300));
        $('#tlBpm').value = P.bpm; K.commit();
      }
    });
  }

  /* ---------------- drag and drop media ---------------- */
  // Drop image/video/audio/OBJ files onto the network (new operator) or onto
  // an existing Movie File In / Audio File In / File In node (replace its file).
  function wireDrop() {
    const net = $('#netCanvas');
    const fileParam = { moviefileinTOP: 'file', audiofileinCHOP: 'file', fileinSOP: 'file', gwstraininCHOP: 'file' };
    ['dragenter', 'dragover'].forEach((ev) => net.addEventListener(ev, (e) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files')) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; net.classList.add('drop-hot'); }
    }));
    net.addEventListener('dragleave', (e) => { if (e.target === net) net.classList.remove('drop-hot'); });
    net.addEventListener('drop', (e) => {
      net.classList.remove('drop-hot');
      const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
      if (!files.length) return;
      e.preventDefault();
      const nodeEl = e.target.closest && e.target.closest('.node');
      const target = nodeEl && K.getOp(nodeEl.dataset.id);
      let [x, y] = N.toWorld(e.clientX, e.clientY);
      const fontFiles = files.filter((f) => /\.(ttf|otf|woff2?)$/i.test(f.name));
      const otherFiles = files.filter((f) => !/\.(ttf|otf|woff2?)$/i.test(f.name));
      if (fontFiles.length) {
        (async () => {
          const fams = [];
          for (let i = 0; i < fontFiles.length; i++) {
            try {
              const fam = await K.loadFontFile(fontFiles[i]);
              fams.push(fam);
              let op = i === 0 && target && (target.type === 'textTOP' || target.type === 'datareadoutTOP') ? target : null;
              if (!op) op = N.addOp('textTOP', x - UI.NODE.NW / 2 + i * 24, y - UI.NODE.NH / 2 + i * (UI.NODE.NH + 42));
              if (op) { op.p.font = fam; N.select(op.id); }
            } catch (err) { K.toast('Could not load font ' + fontFiles[i].name + ': ' + (err.message || err)); }
          }
          K.paramsUI.render();
          K.commit(true);
          if (fams.length) K.toast('Loaded font ' + fams.join(', '));
        })();
      }
      if (!otherFiles.length) return;
      otherFiles.forEach((f, i) => {
        const kind = /\.(obj|ply|xyz)$/i.test(f.name) ? 'geo' : /\.(gz|txt|dat|csv)$/i.test(f.name) ? 'gw' : U.mediaKind(f.type, f.name);
        const type = kind === 'audio' ? 'audiofileinCHOP' : kind === 'geo' ? 'fileinSOP' : kind === 'gw' ? 'gwstraininCHOP' : 'moviefileinTOP';
        const id = K.addMedia(f);
        let op = i === 0 && target && fileParam[target.type] && target.type === type ? target : null;
        if (!op) op = N.addOp(type, x - UI.NODE.NW / 2 + i * 24, y - UI.NODE.NH / 2 + i * (UI.NODE.NH + 42));
        if (!op) return;
        op.p.file = id;
        N.select(op.id);
      });
      K.paramsUI.render();
      K.commit(true);
      K.toast('Loaded ' + otherFiles.map((f) => f.name).join(', '));
    });
    // prevent the browser from navigating away when a file misses the drop zone
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => e.preventDefault());
  }

  /* ---------------- splitter ---------------- */
  function wireSplitter() {
    const sp = $('#splitter'), ws = $('#workspace');
    let pid = null;
    sp.addEventListener('pointerdown', (e) => { pid = e.pointerId; sp.setPointerCapture(pid); });
    sp.addEventListener('pointermove', (e) => {
      if (pid !== e.pointerId) return;
      const w = U.clamp(window.innerWidth - e.clientX, 260, window.innerWidth * 0.7);
      ws.style.setProperty('--side-w', w + 'px');
      V.layoutOverlay();
    });
    sp.addEventListener('pointerup', () => { pid = null; N.drawWires(); });
  }

  /* ---------------- keyboard ---------------- */
  let mouse = [innerWidth / 2, innerHeight / 2];
  window.addEventListener('pointermove', (e) => { mouse = [e.clientX, e.clientY]; }, { passive: true });
  function typing(e) {
    const t = e.target;
    return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  }
  function wireKeyboard() {
    window.addEventListener('keydown', (e) => {
      const k = e.key, mod = e.metaKey || e.ctrlKey;
      if (k === 'Escape') {
        if (V.performing) { V.exitPerform(); e.preventDefault(); return; }
        if (K.bible.isOpen) { K.bible.close(); return; }
        if (document.querySelector('#popRoot > *')) { UI.closePops(); return; }
        if (V.maximized) { V.maximize(false); return; }
        UI.closePops(); return;
      }
      if (K.bible.isOpen) return;
      if (V.performing) {
        if (k === 'c' || k === 'C') V.togglePerformPanel();
        else if (k === ' ') { T.playing = !T.playing; syncPlay(); e.preventDefault(); }
        else if (k === 'F1' || k === 'p') V.exitPerform();
        return;
      }
      if (mod && k.toLowerCase() === 'k') { e.preventDefault(); openCommandPalette(); return; }
      if (typing(e)) return;
      if (document.querySelector('#popRoot .dialog, #popRoot .opc, #popRoot .cmdk')) return;
      if (mod) {
        const lk = k.toLowerCase();
        if (lk === 'z' && e.shiftKey) { K.history.redo(); e.preventDefault(); }
        else if (lk === 'z') { K.history.undo(); e.preventDefault(); }
        else if (lk === 'y') { K.history.redo(); e.preventDefault(); }
        else if (lk === 'c') { N.copy(); }
        else if (lk === 'v') { N.paste(); e.preventDefault(); }
        else if (lk === 'd') { N.duplicate(); e.preventDefault(); }
        else if (lk === 's') { saveProject(false); e.preventDefault(); }
        else if (lk === 'o') { openProject(); e.preventDefault(); }
        else if (lk === 'a') { selectAll(); e.preventDefault(); }
        return;
      }
      if (e.shiftKey) {
        if (k === 'P') { applyPreviews(!K.previewAll, true); return; }
        if (k === 'M') { setPerfPanel($('#perfPanel').hidden, true); return; }
        if (k === 'C') { N.collapse(); return; }
        if (k === 'F') { K.files.openLibrary(); return; }
      }
      switch (k) {
        case 'Tab': e.preventDefault(); { const r = $('#netCanvas').getBoundingClientRect(); const inside = mouse[0] > r.left && mouse[0] < r.right && mouse[1] > r.top && mouse[1] < r.bottom; const [cx, cy] = inside ? mouse : centerClient(); N.opCreate(cx, cy); } break;
        case 'Delete': case 'Backspace': N.deleteSelection(); e.preventDefault(); break;
        case 'h': case 'Home': N.fit(); break;
        case 'b': N.toggleFlag('bypass'); break;
        case 'd': N.toggleFlag('display'); break;
        case 'l': N.toggleFlag('lock'); break;
        case ' ': T.playing = !T.playing; syncPlay(); e.preventDefault(); break;
        case 'p': case 'F1': V.enterPerform(); e.preventDefault(); break;
        case 'r': recordDialog(); break;
        case 'f': V.maximize(); break;
        case '?': K.bible.open(); e.preventDefault(); break;
        case 'u': N.up(); break;
        case '/': { const ns = $('#netSearch'); if (ns) { ns.focus(); ns.select(); e.preventDefault(); } break; }
        case 'i': case 'Enter': {
          const op = K.getOp(P.current);
          if (op && op.def.container) N.enter(op.id);
          else K.bus.emit('focusParams', op);
          break;
        }
        case 'F2': if (P.current) N.rename(P.current); e.preventDefault(); break;
        case '1': V.setMode('selected'); break;
        case '2': V.setMode('output'); break;
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
