/* Kiln TD — viewer.js : node thumbnails, main viewer, overlays, perform mode, snapshot, Movie File Out */
(function () {
  'use strict';
  const K = window.K, U = K.util, P = K.project, E = K.gl, UI = K.ui, h = UI.h;
  const V = (K.viewer = { mode: 'selected', hist: new Map(), performing: false, recording: null, frame: 0, quality: 1, maximized: false });
  let glCanvas, overlay, octx, stage, htmlEl, pinEl;
  const TW = 368, TH = 208; // 2× node view (184 × 104)

  V.init = function () {
    glCanvas = document.getElementById('glCanvas');
    overlay = document.getElementById('overlayCanvas'); octx = overlay.getContext('2d');
    stage = document.getElementById('viewerStage'); htmlEl = document.getElementById('viewerHtml'); pinEl = document.getElementById('pinHandles');
    const qs = document.getElementById('qualitySel');
    if (qs) {
      V.quality = parseFloat(qs.value) || 1;
      qs.addEventListener('change', () => V.setQuality(parseFloat(qs.value) || 1));
    }
    V.resize();
    // mouse tracking for Mouse In CHOP / GLSL iMouse
    const track = (e) => {
      const r = V.imageRect();
      K.mouse.x = U.clamp((e.clientX - r.left) / r.width, 0, 1);
      K.mouse.y = U.clamp(1 - (e.clientY - r.top) / r.height, 0, 1);
    };
    [stage, document.getElementById('performStage')].forEach((el) => {
      el.addEventListener('pointermove', track);
      el.addEventListener('pointerdown', (e) => { track(e); K.mouse.down = 1; });
      el.addEventListener('wheel', (e) => { K.mouse.wheel += -e.deltaY * 0.001; }, { passive: true });
    });
    window.addEventListener('pointerup', () => { K.mouse.down = 0; });
    document.querySelectorAll('#viewerMode button').forEach((b) => b.addEventListener('click', () => V.setMode(b.dataset.mode)));
    document.getElementById('snapBtn').addEventListener('click', () => { V.snapRequested = true; });
    document.getElementById('maxBtn').addEventListener('click', () => V.maximize());
    stage.addEventListener('dblclick', (e) => { if (!e.target.closest('.pin-handle, .gadget, .viewer-html.on')) V.maximize(); });
    new ResizeObserver(() => V.layoutOverlay()).observe(stage);
  };

  V.setQuality = function (q) {
    V.quality = U.clamp(q || 1, 0.1, 1);
    K.previewScale = V.quality;
    V.resize();
    V.draw();
  };

  /* ---------------- full view (enlarge viewer inside the app) ---------------- */
  let hintT;
  V.maximize = function (on, mode) {
    on = on == null ? !V.maximized : !!on;
    V.maximized = on;
    if (on && mode) V.setMode(mode);
    document.body.classList.toggle('viewer-max', on);
    const b = document.getElementById('maxBtn');
    if (b) { b.setAttribute('aria-pressed', String(on)); b.title = on ? 'Shrink back (F or Esc)' : 'Full view — enlarge the viewer (F)'; }
    const hint = document.getElementById('maxHint');
    if (hint) { hint.classList.toggle('show', on); clearTimeout(hintT); if (on) hintT = setTimeout(() => hint.classList.remove('show'), 2400); }
    requestAnimationFrame(() => { V.layoutOverlay(); K.net && K.net.drawWires(); });
  };
  V.setMode = function (m) {
    V.mode = m;
    document.querySelectorAll('#viewerMode button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  };

  V.fullSize = function () {
    let w = P.res.w, hgt = P.res.h;
    const max = 3840;
    if (Math.max(w, hgt) > max) { const s = max / Math.max(w, hgt); w = Math.round(w * s); hgt = Math.round(hgt * s); }
    return { w, h: hgt };
  };
  V.renderSize = function () {
    const f = V.fullSize();
    const q = (V.performing || V.recording || V.forceFull) ? 1 : V.quality;
    return { w: Math.max(2, Math.round(f.w * q)), h: Math.max(2, Math.round(f.h * q)), q };
  };
  V.resize = function () {
    const r = V.renderSize();
    if (glCanvas.width !== r.w || glCanvas.height !== r.h) {
      glCanvas.width = r.w; glCanvas.height = r.h;
      V._blank = true;
    }
    stage.style.aspectRatio = P.res.w + ' / ' + P.res.h;
    stage.style.maxHeight = '46vh';
    const vr = document.getElementById('viewerRes');
    if (vr) {
      const qlabel = r.q === 1 ? '' : r.q === 0.5 ? ' · ½' : r.q === 0.25 ? ' · ¼' : ' · ' + r.q;
      vr.textContent = P.res.w + '×' + P.res.h + qlabel;
    }
    V.layoutOverlay();
  };
  V.imageRect = function () {
    const r = glCanvas.getBoundingClientRect();
    const a = glCanvas.width / glCanvas.height, ra = r.width / r.height;
    let w = r.width, hh = r.height;
    if (ra > a) w = hh * a; else hh = w / a;
    return { left: r.left + (r.width - w) / 2, top: r.top + (r.height - hh) / 2, width: w, height: hh };
  };
  V.layoutOverlay = function () {
    if (!overlay) return;
    const r = stage.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    overlay.width = Math.max(1, r.width * dpr); overlay.height = Math.max(1, r.height * dpr);
  };

  /* ---------------- which op to show ---------------- */
  V.outputOp = function () {
    const tops = K.opsOfFamily('TOP');
    return tops.find((o) => o.flags.display && o.type === 'outTOP') || tops.find((o) => o.flags.display) || tops.find((o) => o.type === 'outTOP') || null;
  };
  V.targetOp = function () {
    if (V.performing || V.recording || V.mode === 'output') return V.outputOp();
    return K.getOp(P.current) || V.outputOp();
  };

  /* ---------------- CHOP history ---------------- */
  function recordHist(op) {
    const o = op.out;
    if (!o || !o.chans) return;
    let hs = V.hist.get(op.id);
    if (!hs) { hs = { n: 0, ch: {} }; V.hist.set(op.id, hs); }
    o.chans.slice(0, 8).forEach((c) => {
      if (c.data.length !== 1) return;
      let a = hs.ch[c.name];
      if (!a) a = hs.ch[c.name] = new Float32Array(180);
      a.copyWithin(0, 1); a[a.length - 1] = c.data[0];
    });
  }
  const CH_COLORS = ['#ff6a3d', '#5ab56b', '#7cc4ff', '#f2c14e', '#d66fa6', '#b39dff', '#58d6c4', '#ffffff'];
  function drawChop(g, op, w, hh, big) {
    g.fillStyle = '#0b0b0d'; g.fillRect(0, 0, w, hh);
    const o = op.out;
    if (!o || !o.chans || !o.chans.length) { g.fillStyle = '#555'; g.font = (big ? 14 : 20) + 'px Geist, sans-serif'; g.fillText('no channels', 12, hh / 2); return; }
    const pad = big ? 16 : 10;
    g.strokeStyle = 'rgba(255,255,255,0.07)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, hh / 2); g.lineTo(w, hh / 2); g.stroke();
    const series = [];
    if (o.chans[0].data.length > 1) o.chans.slice(0, 4).forEach((c) => series.push({ name: c.name, data: c.data, last: c.data[c.data.length - 1] }));
    else { const hs = V.hist.get(op.id); o.chans.slice(0, 8).forEach((c) => series.push({ name: c.name, data: hs && hs.ch[c.name] ? hs.ch[c.name] : c.data, last: c.data[0] })); }
    let mn = Infinity, mx = -Infinity;
    series.forEach((s) => { for (let i = 0; i < s.data.length; i++) { const v = s.data[i]; if (v < mn) mn = v; if (v > mx) mx = v; } });
    if (mx - mn < 1e-6) { mx += 0.5; mn -= 0.5; }
    const span = mx - mn;
    mn -= span * 0.08; mx += span * 0.08;
    series.forEach((s, si) => {
      g.strokeStyle = CH_COLORS[si % CH_COLORS.length]; g.lineWidth = big ? 2 : 3;
      g.beginPath();
      const n = s.data.length;
      for (let i = 0; i < n; i++) {
        const x = (i / Math.max(1, n - 1)) * w, y = hh - pad - ((s.data[i] - mn) / (mx - mn)) * (hh - pad * 2);
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
    });
    g.font = (big ? 12 : 19) + 'px "Geist Mono", monospace';
    series.slice(0, big ? 8 : 3).forEach((s, si) => {
      const txt = s.name + ' ' + (Math.abs(s.last) >= 100 ? s.last.toFixed(0) : s.last.toFixed(3));
      g.fillStyle = 'rgba(0,0,0,0.6)';
      const tw = g.measureText(txt).width;
      const y = (big ? 18 : 26) + si * (big ? 18 : 26);
      g.fillRect(6, y - (big ? 13 : 19), tw + 8, big ? 17 : 24);
      g.fillStyle = CH_COLORS[si % CH_COLORS.length];
      g.fillText(txt, 10, y);
    });
    if (o.chans.length > series.length && !big) { g.fillStyle = '#888'; g.fillText('+' + (o.chans.length - series.length), w - 50, hh - 12); }
  }
  function drawDat(g, op, w, hh) {
    const o = op.out;
    const key = o ? (o.table ? JSON.stringify(o.table).slice(0, 2000) : String(o.text).slice(0, 2000)) + (op.error || '') : '';
    if (g.canvas._k === key) return;
    g.canvas._k = key;
    g.fillStyle = '#121014'; g.fillRect(0, 0, w, hh);
    g.font = '17px "Geist Mono", monospace'; g.fillStyle = '#d9d4cc';
    if (o && o.table && op.type === 'tableDAT') {
      const rows = o.table.slice(0, 7), cw = w / Math.max(1, Math.min(4, (rows[0] || []).length));
      rows.forEach((r, ri) => r.slice(0, 4).forEach((c, ci) => {
        g.fillStyle = ri === 0 ? '#ff9b7a' : '#d9d4cc';
        g.fillText(String(c).slice(0, Math.floor(cw / 11)), ci * cw + 8, 24 + ri * 24);
        g.strokeStyle = 'rgba(255,255,255,0.08)'; g.strokeRect(ci * cw, 6 + ri * 24, cw, 24);
      }));
    } else {
      const src = op.type === 'scriptDAT' ? (o && o.text ? o.text : String(op.p.code)) : o ? String(o.text || '') : '';
      String(src).split('\n').slice(-7).forEach((l, i) => g.fillText(l.slice(0, 34), 10, 26 + i * 24));
    }
  }
  function drawCompIcon(g, op, w, hh) {
    g.fillStyle = '#121216'; g.fillRect(0, 0, w, hh);
    g.save(); g.translate(w / 2, hh / 2);
    g.strokeStyle = '#9aa0a8'; g.fillStyle = '#9aa0a8'; g.lineWidth = 3;
    if (op.type === 'cameraCOMP') {
      g.strokeRect(-40, -22, 56, 44); g.beginPath(); g.moveTo(16, -8); g.lineTo(44, -24); g.lineTo(44, 24); g.lineTo(16, 8); g.closePath(); g.stroke();
      const o = op.out; if (o) { g.font = '16px "Geist Mono", monospace'; g.fillText('fov ' + Math.round(o.fov), -40, 50); }
    } else if (op.type === 'lightCOMP') {
      const c = op.p.color || '#fff';
      g.fillStyle = c; g.beginPath(); g.arc(0, -6, 22, 0, Math.PI * 2); g.fill();
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.beginPath(); g.moveTo(Math.cos(a) * 30, Math.sin(a) * 30 - 6); g.lineTo(Math.cos(a) * 42, Math.sin(a) * 42 - 6); g.strokeStyle = c; g.stroke(); }
    } else if (op.def.container) {
      for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) g.strokeRect(-60 + i * 44, -34 + j * 40, 32, 26);
    } else if (op.def.panel) {
      drawGadgetThumb(g, op, w, hh);
    }
    g.restore();
  }
  function drawGadgetThumb(g, op, w, hh) {
    g.font = '18px Geist, sans-serif'; g.fillStyle = '#ddd';
    const v = K.handle(op).chan(0);
    if (op.type === 'sliderCOMP') {
      const lo = K.parNum(op, 'min'), hi = K.parNum(op, 'max'), t = U.clamp((v - lo) / (hi - lo || 1), 0, 1);
      g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(-140, -14, 280, 28);
      g.fillStyle = '#ff6a3d'; g.fillRect(-140, -14, 280 * t, 28);
      g.fillStyle = '#ddd'; g.fillText(String(op.p.label).slice(0, 18) + '  ' + v.toFixed(2), -140, -26);
    } else if (op.type === 'buttonCOMP') {
      g.fillStyle = v > 0.5 ? '#ff6a3d' : 'rgba(255,255,255,0.12)'; g.fillRect(-90, -24, 180, 48);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(String(op.p.label).slice(0, 14), 0, 6); g.textAlign = 'left';
    } else {
      g.strokeStyle = 'rgba(255,255,255,0.3)'; g.strokeRect(-70, -42, 140, 84);
      g.fillStyle = '#ff6a3d'; g.beginPath(); g.arc(-70 + K.parNum(op, 'x') * 140, 42 - K.parNum(op, 'y') * 84, 8, 0, Math.PI * 2); g.fill();
    }
  }

  // texture to show for an op (null = handled with 2D/HTML)
  function texFor(op, w, hh, key) {
    const o = op.out;
    if (op.family === 'TOP') return o && o.tex ? o : null;
    try {
      if (op.family === 'SOP' && o && o.pos && o.pos.length) return K.r3d.preview(op, o, null, w, hh, key);
      if (op.family === 'MAT' && o) { V.sphere = V.sphere || K.cook(V.ensureSphere()); return K.r3d.preview(op, V.sphere, o, w, hh, key); }
      if (op.type === 'geometryCOMP' && o && o.geo && o.geo.pos && o.geo.pos.length) return K.r3d.preview(op, o.geo, o.mat, w, hh, key);
    } catch (e) { op.error = e.message; }
    return null;
  }
  // hidden sphere for MAT previews (not part of project)
  V.ensureSphere = function () {
    if (V._sph) return V._sph;
    const def = K.types.sphereSOP;
    const op = { id: '__sphere', type: 'sphereSOP', family: 'SOP', def, p: { radius: 1, rows: 32, cols: 48 }, e: {}, inputs: [], rt: {}, flags: {}, cookedFrame: -1, cookMs: 0, name: '__sphere', parent: '__hidden' };
    V._sph = op;
    return op;
  };

  /* ---------------- per-frame draw ---------------- */
  V.draw = function () {
    V.frame++;
    const gl = E.gl, cw = glCanvas.width, ch = glCanvas.height;
    const thumbEvery = V.recording ? 12 : K.time.playing ? 4 : 3;
    // history for CHOPs (only ones whose preview is alive)
    P.ops.forEach((op) => {
      if (op.family !== 'CHOP') return;
      if (K.previewAll || P.selection.has(op.id) || P.current === op.id) recordHist(op);
    });

    // ---- thumbnails (visible nodes only, round-robin so a huge patch stays smooth) ----
    if (V.frame % thumbEvery === 0 && !V.performing && K.previewAll) {
      const netRect = document.getElementById('netCanvas').getBoundingClientRect();
      const cols = Math.max(1, Math.floor(cw / TW)), rows = Math.max(1, Math.floor(ch / TH)), cap = Math.max(1, cols * rows);
      const tw = Math.min(TW, cw), th = Math.min(TH, ch);
      const visible = [];
      K.net.els.forEach((v, id) => {
        if (!v) return;
        const r = v.el.getBoundingClientRect();
        if (r.right < netRect.left || r.left > netRect.right || r.bottom < netRect.top || r.top > netRect.bottom) return;
        if (K.net.query && v.el.classList.contains('dim')) return;
        visible.push([id, v]);
      });
      if (!V._thumbCursor || V._thumbCursor >= visible.length) V._thumbCursor = 0;
      const batch = visible.length > cap ? visible.slice(V._thumbCursor).concat(visible.slice(0, V._thumbCursor)).slice(0, cap) : visible;
      V._thumbCursor = visible.length > cap ? (V._thumbCursor + cap) % visible.length : 0;
      let pending = [], slot = 0;
      const flush = () => { pending.forEach((p) => { try { p.v.ctx.drawImage(glCanvas, p.x, p.y, tw, th, 0, 0, TW, TH); } catch (e) {} }); pending = []; slot = 0; };
      batch.forEach(([id, v]) => {
        const op = K.getOp(id);
        if (!op) return;
        const msg = op.error || op.warn || '';
        if (v.msg !== msg) { v.msg = msg; v.badge.textContent = msg; v.el.classList.toggle('has-err', !!op.error); v.el.classList.toggle('has-warn', !op.error && !!op.warn); v.el.title = K.path(op) + '\n' + msg; }
        if (P.selection.has(id)) { const t = op.cookMs.toFixed(2) + ' ms'; if (v.cook.textContent !== t) v.cook.textContent = t; }
        else if (v.cook.textContent) v.cook.textContent = '';
        if (op.family === 'CHOP') { drawChop(v.ctx, op, TW, TH, false); return; }
        if (op.family === 'DAT') { drawDat(v.ctx, op, TW, TH); return; }
        if (op.family === 'COMP' && op.type !== 'geometryCOMP') { drawCompIcon(v.ctx, op, TW, TH); return; }
        if (op.family !== 'TOP') return;
        const tex = texFor(op, TW, TH, 'thumb');
        if (!tex) { v.ctx.fillStyle = '#0b0b0d'; v.ctx.fillRect(0, 0, TW, TH); return; }
        if (slot >= cap) flush();
        const x = (slot % cols) * tw, y = Math.floor(slot / cols) * th;
        E.present(tex, [x, ch - y - th, tw, th], 1, true);
        pending.push({ v, x, y });
        slot++;
      });
      flush();
    }

    // ---- main viewer ----
    const op = V.targetOp();
    renderMain(op);
    if (V.snapRequested) { V.snapRequested = false; snapshot(op); }

    const label = document.getElementById('viewerLabel');
    const t = op ? op.name + (op.out && op.out.w ? '  ' + op.out.w + '×' + op.out.h : '') + (V.mode === 'output' ? '  · output' : '') : 'No output — add an Out TOP';
    if (label && label.textContent !== t) label.textContent = t;

    // overlays
    octx.clearRect(0, 0, overlay.width, overlay.height);
    const canText = op && (op.family === 'CHOP' || op.family === 'DAT' || op.family === 'COMP');
    if (op && op.family === 'CHOP' && !V.performing) drawChop(octx, op, overlay.width, overlay.height, true);
    updateHtml(op);
    updatePins(op);
    if (V.performing) V.updatePerformPanel();
  };

  // Render the target operator into the main viewer canvas only.
  function renderMain(op) {
    const gl = E.gl, cw = glCanvas.width, ch = glCanvas.height;
    let tex = null;
    if (op) {
      if (op.family === 'TOP') tex = texFor(op, cw, ch, 'big');
      else if (op.family === 'SOP' || op.family === 'MAT' || op.type === 'geometryCOMP') {
        const bw = Math.min(cw, 1280), bh = Math.round(bw * (ch / cw));
        tex = texFor(op, bw, bh, 'big');
      }
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, cw, ch);
    gl.clearColor(0.04, 0.04, 0.05, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    if (tex) E.present(tex, [0, 0, cw, ch], 1, !V.performing && !V.recording && op.family === 'TOP' && V.mode !== 'output');
    V._blank = false;
  }

  let htmlFor = null, htmlKey = '';
  function updateHtml(op) {
    if (!op || V.performing || op.family === 'TOP' || op.family === 'SOP' || op.family === 'MAT' || op.type === 'geometryCOMP') {
      if (htmlFor) { htmlEl.classList.remove('on'); htmlEl.innerHTML = ''; htmlFor = null; }
      return;
    }
    // CHOP has the canvas overlay; other non-visual families show text/HTML
    if (op.family === 'CHOP') { if (htmlFor) { htmlEl.classList.remove('on'); htmlEl.innerHTML = ''; htmlFor = null; } return; }
    htmlEl.classList.add('on');
    if (op.def.panel) {
      if (htmlFor !== op) { htmlEl.innerHTML = ''; const pv = h('div', { class: 'panel-view' }, gadget(op)); htmlEl.appendChild(pv); htmlFor = op; }
      htmlEl.querySelectorAll('[data-upd]').forEach((el) => el._upd && el._upd());
      return;
    }
    const o = op.out;
    let key = op.id + (o ? (o.table ? JSON.stringify(o.table).slice(0, 4000) : String(o.text || '')).slice(0, 4000) : '') + (op.error || '');
    if (op.family === 'COMP' && !op.def.container) key += JSON.stringify(op.out || {}).slice(0, 300);
    if (htmlFor === op && key === htmlKey) return;
    htmlFor = op; htmlKey = key;
    htmlEl.innerHTML = '';
    if (op.family === 'DAT') {
      if (o && o.table && op.type === 'tableDAT') {
        const tb = h('table');
        o.table.forEach((r) => tb.appendChild(h('tr', null, r.map((c) => h('td', null, String(c))))));
        htmlEl.appendChild(tb);
      } else {
        htmlEl.appendChild(h('pre', null, (o && o.json !== undefined && op.type !== 'textDAT' ? JSON.stringify(o.json, null, 2) : o ? String(o.text || '') : '') || '(empty)'));
      }
    } else if (op.def.container) {
      const kids = K.opsIn(op.id);
      htmlEl.appendChild(h('pre', null, op.name + ' — ' + kids.length + ' operators\n\n' + kids.map((k) => '  ' + k.family.padEnd(5) + k.name).join('\n') + '\n\nDouble-click the node to enter.'));
    } else {
      htmlEl.appendChild(h('pre', null, op.def.label + ' ' + op.family + '\n\n' + JSON.stringify(op.out, (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v), 2)));
    }
  }

  // corner pin handles
  let pinFor = null;
  function updatePins(op) {
    const show = op && op.type === 'cornerpinTOP' && !V.performing && V.mode === 'selected';
    if (!show) { if (pinFor) { pinEl.innerHTML = ''; pinFor = null; } return; }
    const sr = stage.getBoundingClientRect(), ir = V.imageRect();
    if (pinFor !== op) {
      pinEl.innerHTML = ''; pinFor = op;
      for (let i = 0; i < 4; i++) {
        const hd = h('div', { class: 'pin-handle', title: ['bottom-left', 'bottom-right', 'top-right', 'top-left'][i] });
        hd.addEventListener('pointerdown', (e) => {
          e.preventDefault(); hd.setPointerCapture(e.pointerId);
          const move = (ev) => {
            const r = V.imageRect();
            op.p['x' + i] = +(((ev.clientX - r.left) / r.width)).toFixed(4);
            op.p['y' + i] = +((1 - (ev.clientY - r.top) / r.height)).toFixed(4);
            delete op.e['x' + i]; delete op.e['y' + i];
          };
          const up = () => { hd.removeEventListener('pointermove', move); hd.removeEventListener('pointerup', up); K.commit(true); };
          hd.addEventListener('pointermove', move); hd.addEventListener('pointerup', up);
        });
        pinEl.appendChild(hd);
      }
    }
    Array.from(pinEl.children).forEach((hd, i) => {
      hd.style.left = ir.left - sr.left + K.parNum(op, 'x' + i) * ir.width + 'px';
      hd.style.top = ir.top - sr.top + (1 - K.parNum(op, 'y' + i)) * ir.height + 'px';
    });
  }

  /* ---------------- panel gadgets (viewer + perform) ---------------- */
  function gadget(op) {
    const wrap = h('div', { class: 'gadget' });
    if (op.type === 'sliderCOMP') {
      const val = h('b'), f = h('div', { class: 'f' });
      const s = h('div', { class: 'g-slider', 'data-upd': '' }, f);
      s._upd = () => {
        const lo = K.parNum(op, 'min'), hi = K.parNum(op, 'max'), v = K.parNum(op, 'value');
        f.style.width = U.clamp((v - lo) / (hi - lo || 1), 0, 1) * 100 + '%'; val.textContent = v.toFixed(3);
      };
      const set = (e) => { const r = s.getBoundingClientRect(), lo = K.parNum(op, 'min'), hi = K.parNum(op, 'max'); op.p.value = lo + U.clamp((e.clientX - r.left) / r.width, 0, 1) * (hi - lo); delete op.e.value; s._upd(); };
      s.addEventListener('pointerdown', (e) => { s.setPointerCapture(e.pointerId); set(e); const mv = (ev) => set(ev); s.addEventListener('pointermove', mv); s.addEventListener('pointerup', () => { s.removeEventListener('pointermove', mv); K.commit(); }, { once: true }); });
      wrap.append(h('div', { class: 'g-label' }, h('span', null, op.p.label || op.name), val), s);
      s._upd();
    } else if (op.type === 'buttonCOMP') {
      const b = h('button', { class: 'g-button', 'data-upd': '' }, op.p.label || op.name);
      b._upd = () => b.classList.toggle('on', K.handle(op).chan(0) > 0.5);
      const tog = K.par(op, 'btype') === 'toggle';
      b.addEventListener('pointerdown', () => { if (tog) op.p.value = op.p.value ? 0 : 1; else op.p.value = 1; b._upd(); });
      b.addEventListener('pointerup', () => { if (!tog) { op.p.value = 0; op.rt.flash = performance.now() + 120; } b._upd(); });
      b.addEventListener('pointerleave', () => { if (!tog && op.p.value) { op.p.value = 0; } });
      wrap.append(b);
    } else if (op.type === 'xypadCOMP') {
      const pt = h('div', { class: 'pt' }), pad = h('div', { class: 'g-xy', 'data-upd': '' }, pt), val = h('b');
      pad._upd = () => { pt.style.left = K.parNum(op, 'x') * 100 + '%'; pt.style.top = (1 - K.parNum(op, 'y')) * 100 + '%'; val.textContent = K.parNum(op, 'x').toFixed(2) + ', ' + K.parNum(op, 'y').toFixed(2); };
      const set = (e) => { const r = pad.getBoundingClientRect(); op.p.x = U.clamp((e.clientX - r.left) / r.width, 0, 1); op.p.y = U.clamp(1 - (e.clientY - r.top) / r.height, 0, 1); delete op.e.x; delete op.e.y; pad._upd(); };
      pad.addEventListener('pointerdown', (e) => { pad.setPointerCapture(e.pointerId); set(e); const mv = (ev) => set(ev); pad.addEventListener('pointermove', mv); pad.addEventListener('pointerup', () => { pad.removeEventListener('pointermove', mv); K.commit(); }, { once: true }); });
      wrap.append(h('div', { class: 'g-label' }, h('span', null, op.p.label || op.name), val), pad);
      pad._upd();
    }
    return wrap;
  }
  V.gadget = gadget;

  /* ---------------- perform mode ---------------- */
  let performPanelKey = '', hintTimer, cursorTimer;
  V.enterPerform = function () {
    if (V.performing) return;
    if (!V.outputOp()) K.toast('Set the Display flag (D) on a TOP — or add an Out TOP — to choose what Perform mode shows.');
    V.performing = true;
    const pf = document.getElementById('perform');
    pf.hidden = false;
    document.getElementById('performStage').appendChild(glCanvas);
    V.resize();
    const hint = document.getElementById('performHint');
    hint.classList.remove('fade'); clearTimeout(hintTimer); hintTimer = setTimeout(() => hint.classList.add('fade'), 2600);
    K.platform.enterFullscreen(pf);
    pf.onpointermove = () => { pf.classList.remove('hide-cursor'); clearTimeout(cursorTimer); cursorTimer = setTimeout(() => pf.classList.add('hide-cursor'), 1800); };
    performPanelKey = '';
  };
  V.exitPerform = function () {
    if (!V.performing) return;
    V.performing = false;
    document.getElementById('perform').hidden = true;
    stage.insertBefore(glCanvas, stage.firstChild);
    V.resize();
    K.platform.exitFullscreen();
  };
  V.togglePerformPanel = function () { document.getElementById('performPanel').classList.toggle('on'); };
  V.updatePerformPanel = function () {
    const panel = document.getElementById('performPanel');
    const gadgets = K.opsOfFamily('COMP').filter((o) => o.def.panel);
    const key = gadgets.map((g) => g.id).join(',');
    if (key !== performPanelKey) {
      performPanelKey = key;
      panel.innerHTML = '';
      panel.appendChild(h('div', { style: { fontSize: '10px', letterSpacing: '.12em', textTransform: 'uppercase', color: '#999', marginBottom: '8px' } }, 'Controls'));
      if (!gadgets.length) panel.appendChild(h('div', { style: { color: '#aaa', fontSize: '12px', lineHeight: 1.5 } }, 'Add Slider / Button / XY Pad COMPs to build a live control panel.'));
      gadgets.forEach((g) => panel.appendChild(gadget(g)));
    }
    panel.querySelectorAll('[data-upd]').forEach((el) => el._upd && el._upd());
  };

  /* ---------------- snapshot (always full resolution) ---------------- */
  function snapshot(op) {
    try {
      const full = V.fullSize();
      const cw = glCanvas.width, ch = glCanvas.height;
      if (cw !== full.w || ch !== full.h) { glCanvas.width = full.w; glCanvas.height = full.h; renderMain(V.targetOp()); }
      const tmp = document.createElement('canvas');
      tmp.width = glCanvas.width; tmp.height = glCanvas.height;
      tmp.getContext('2d').drawImage(glCanvas, 0, 0);
      if (cw !== full.w || ch !== full.h) { glCanvas.width = cw; glCanvas.height = ch; renderMain(V.targetOp()); }
      tmp.toBlob((b) => {
        if (b) K.saveOut((op ? op.name : 'kiln') + '_' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.png', b, { kind: 'image' });
      }, 'image/png');
    } catch (e) { K.toast('Snapshot failed: ' + e.message); }
  }

  /* ---------------- Movie File Out ---------------- */
  V.pickMime = function () {
    const c = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=h264,aac', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    if (!window.MediaRecorder) return null;
    return c.find((m) => { try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; } }) || '';
  };
  V.startRecording = function (opts) {
    if (V.recording) return;
    if (!window.MediaRecorder || !glCanvas.captureStream) { K.toast('Video recording is not supported in this browser.'); return; }
    const out = V.outputOp();
    if (!out) { K.toast('Nothing to record — add an Out TOP or set a Display flag on a TOP.'); return; }
    V.forceFull = true;
    V.resize();
    V.draw();
    const stream = glCanvas.captureStream(opts.fps || 60);
    if (opts.audio && K.audio.recDest) K.audio.recDest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    const mime = opts.mime || V.pickMime();
    let rec;
    try { rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: (opts.mbps || 16) * 1e6 }); }
    catch (e) { rec = new MediaRecorder(stream); }
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      const type = rec.mimeType || mime || 'video/webm';
      const ext = /mp4/.test(type) ? 'mp4' : 'webm';
      const blob = new Blob(chunks, { type });
      V.recording = null;
      V.forceFull = false;
      V.resize();
      if (!blob.size) K.toast('The recording came out empty. Try again, and let it run for at least a second.');
      else K.saveOut((P.title || 'kiln').replace(/[^\w-]+/g, '_') + '_' + P.res.w + 'x' + P.res.h + '_' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.' + ext, blob, { kind: 'video' });
      K.bus.emit('rec');
    };
    if (opts.fromStart) { K.seek(0); K.time.playing = true; }
    rec.start(250);
    V.recording = { rec, t0: performance.now(), dur: opts.duration || 0, mime: rec.mimeType || mime };
    K.bus.emit('rec');
  };
  V.stopRecording = function () { if (V.recording && V.recording.rec.state !== 'inactive') V.recording.rec.stop(); };

  /* ---------------- preview toggles ---------------- */
  V.setPreviews = function (on) {
    K.previewAll = !!on;
    const net = document.getElementById('network');
    if (net) net.classList.toggle('no-previews', !on);
    K.invalidateOpsIn && K.invalidateOpsIn();
  };
})();
