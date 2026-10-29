/* Kiln TD — params.js : parameter panel
   Constant / expression / link modes, filtering, node colour & output lock. */
(function () {
  'use strict';
  const K = window.K, U = K.util, P = K.project, UI = K.ui, h = UI.h;
  const PP = (K.paramsUI = { page: {}, live: [], filter: '' });
  let root, curId = null;

  const fmt = (v, isInt) => {
    if (typeof v !== 'number' || !isFinite(v)) return String(v);
    if (isInt) return String(Math.round(v));
    const a = Math.abs(v);
    return a >= 1000 ? v.toFixed(0) : a >= 100 ? v.toFixed(1) : a >= 10 ? v.toFixed(2) : v.toFixed(3);
  };
  const changed = (op, pd) => {
    K.commit();
    if (pd && (pd.type === 'op')) K.net.drawWires();
    if (pd && op.def.params.some((x) => x.showIf)) { clearTimeout(PP.rt); PP.rt = setTimeout(() => PP.render(true), 10); }
  };

  PP.render = function (keepScroll) {
    root = root || document.getElementById('params');
    const scroll = root.scrollTop;
    root.innerHTML = '';
    PP.live = [];
    const op = K.getOp(P.current);
    curId = op ? op.id : null;
    if (!op) {
      root.appendChild(h('div', { class: 'params-empty' },
        h('h3', null, 'No operator selected'),
        h('p', null, 'Select a node to edit its parameters. Click a parameter label to switch it to an expression — e.g. ', h('code', { class: 'mono' }, "sin(t)*0.5"), ' or ', h('code', { class: 'mono' }, "op('lfo1')[0]"), '.'),
        h('p', null, 'Right-click (long-press) any number for Link, Animate and Reset. Press ', h('kbd', null, 'F2'), ' to rename.'),
        h('p', { class: 'params-tip' }, 'Tip: ', h('kbd', null, '⌘K'), ' opens the command palette. Drag a wire onto empty space to add and connect an operator in one move.')));
      return;
    }
    const def = op.def, fam = K.FAMILIES[op.family];
    const nameIn = h('input', { class: 'p-name', value: op.name, spellcheck: 'false', 'aria-label': 'Operator name' });
    nameIn.addEventListener('change', () => { if (!K.renameOp(op, nameIn.value)) nameIn.value = op.name; });
    nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') nameIn.blur(); e.stopPropagation(); });
    const lockBtn = h('button', {
      class: 'p-lock' + (op.flags.lock ? ' on' : ''),
      title: 'Lock output — freeze the last cooked result (L)',
      onclick: () => {
        op.flags.lock = !op.flags.lock;
        lockBtn.classList.toggle('on', op.flags.lock);
        K.net.render(); K.commit(true);
        K.toast(op.flags.lock ? op.name + ' output locked' : op.name + ' unlocked');
      },
    }, 'L');
    const colorInput = h('input', {
      type: 'color', class: 'p-col',
      value: /^#[0-9a-f]{6}$/i.test(op.color || '') ? op.color : fam.color,
      title: 'Node colour — right-click to return to the family colour',
      'aria-label': 'Node colour',
    });
    const applyColor = () => {
      op.color = colorInput.value;
      const v = K.net.els.get(op.id);
      if (v) v.el.style.setProperty('--fam', op.color);
      K.net.drawWires();
    };
    colorInput.addEventListener('input', applyColor);
    colorInput.addEventListener('change', () => { applyColor(); K.commit(); });
    colorInput.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      op.color = null;
      colorInput.value = fam.color;
      const v = K.net.els.get(op.id);
      if (v) v.el.style.setProperty('--fam', fam.color);
      K.net.drawWires(); K.commit();
    });
    const msg = h('div');
    const pages = [];
    def.params.forEach((pd) => { const pg = pd.page || 'Main'; if (!pages.includes(pg)) pages.push(pg); });
    if (pages.includes('Common')) { pages.splice(pages.indexOf('Common'), 1); pages.push('Common'); }
    let page = PP.page[op.type] && pages.includes(PP.page[op.type]) ? PP.page[op.type] : pages[0];
    const tabs = h('div', { class: 'p-pages' });

    root.appendChild(h('div', { class: 'p-head' },
      h('div', { class: 'p-title' },
        h('span', { class: 'fam-chip', style: { background: fam.color } }, op.family),
        nameIn,
        h('span', { class: 'p-type' }, def.label),
        lockBtn,
        colorInput,
        h('button', { class: 'p-bible', title: 'Look up ' + def.label + ' ' + op.family + ' in the Kiln Bible', 'aria-label': 'Open in Bible', onclick: () => K.bible.open(op.type) }, '?')),
      def.help ? h('div', { class: 'p-help' }, def.help) : null,
      msg, tabs));

    PP.live.push(() => {
      const err = op.error || (op.rt.exprErr && Object.keys(op.rt.exprErr).length ? 'Expression: ' + Object.values(op.rt.exprErr)[0] : null);
      const txt = err || op.warn || '';
      const cls = err ? 'p-msg err' : op.warn ? 'p-msg warn' : '';
      if (msg.dataset.t !== txt) { msg.dataset.t = txt; msg.className = cls; msg.textContent = txt; }
      lockBtn.classList.toggle('on', !!op.flags.lock);
    });

    // parameter search — filters the current operator across every page
    const clearBtn = h('button', { class: 'p-search-clear', title: 'Clear filter', 'aria-label': 'Clear parameter filter' }, '×');
    const search = h('input', { placeholder: 'Filter parameters…', spellcheck: 'false', 'aria-label': 'Filter parameters' });
    search.value = PP.filter || '';
    const searchWrap = h('div', { class: 'p-search-wrap' },
      h('span', { html: '<svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="7" cy="7" r="4.5"/><path d="M10.4 10.4 14 14"/></svg>' }),
      search, PP.filter ? clearBtn : null);
    root.appendChild(searchWrap);

    const rerenderSearch = () => {
      const pos = search.selectionStart == null ? search.value.length : search.selectionStart;
      PP.render(true);
      const s2 = root.querySelector('.p-search-wrap input');
      if (s2) { s2.focus(); try { s2.setSelectionRange(pos, pos); } catch (e) {} }
    };
    search.addEventListener('input', () => { PP.filter = search.value; rerenderSearch(); });
    search.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { PP.filter = ''; PP.render(true); }
      if (e.key === 'Enter') search.blur();
    });
    if (PP.filter) clearBtn.addEventListener('click', () => { PP.filter = ''; PP.render(true); });

    const body = h('div', { class: 'p-body' });
    root.appendChild(body);

    const q = (PP.filter || '').trim().toLowerCase();
    if (!q && pages.length > 1) {
      pages.forEach((pg) => tabs.appendChild(h('button', {
        class: pg === page ? 'on' : '',
        onclick: () => { PP.page[op.type] = pg; PP.render(); },
      }, pg)));
    }
    tabs.style.display = q ? 'none' : '';

    const list = q
      ? def.params.filter((pd) => (!pd.showIf || pd.showIf(op.p)) && (pd.label + ' ' + pd.name + ' ' + (pd.page || '') + ' ' + (pd.help || '')).toLowerCase().includes(q))
      : def.params.filter((pd) => (pd.page || 'Main') === page && (!pd.showIf || pd.showIf(op.p)));
    if (q) body.appendChild(h('div', { class: 'p-help' }, list.length + ' parameter' + (list.length === 1 ? '' : 's') + ' match “' + PP.filter + '” across all pages.'));

    const done = new Set();
    list.forEach((pd) => {
      if (done.has(pd.name)) return;
      if (pd.row) {
        const group = list.filter((x) => x.row === pd.row);
        if (group.length > 1) { group.forEach((g) => done.add(g.name)); body.appendChild(groupRow(op, group)); return; }
      }
      done.add(pd.name);
      body.appendChild(paramRow(op, pd, q ? (pd.page || 'Main') : null));
    });
    if (!def.params.length) body.appendChild(h('div', { class: 'p-help' }, 'This operator has no parameters.'));
    else if (q && !list.length) body.appendChild(h('div', { class: 'p-help' }, 'No parameters match. Clear the filter to see everything.'));

    // info footer
    const info = h('div', { class: 'p-info' });
    root.appendChild(info);
    PP.live.push(() => { info.textContent = infoText(op); });
    PP.tick(true);
    if (keepScroll) root.scrollTop = scroll;
  };

  function infoText(op) {
    const o = op.out, parts = [K.path(op), 'cook ' + op.cookMs.toFixed(2) + ' ms'];
    if (op.flags.lock) parts.push('LOCKED');
    if (o && o.w && o.h) parts.push(o.w + '×' + o.h);
    if (o && o.chans) parts.push(o.chans.length + ' chan' + (o.chans.length === 1 ? '' : 's') + (o.chans[0] ? ' × ' + o.chans[0].data.length : ''));
    if (o && o.pos) parts.push((o.pos.length / 3).toLocaleString() + ' points' + (o.idx && o.prim === 'tris' ? ' · ' + (o.idx.length / 3).toLocaleString() + ' tris' : ''));
    if (o && o.table) parts.push(o.table.length + ' rows');
    return parts.join('  ·  ');
  }

  PP.tick = function (force) {
    if (!root) return;
    if (P.current !== curId) { PP.render(); return; }
    PP.live.forEach((fn) => { try { fn(force); } catch (e) {} });
  };

  /* ---------------- rows ---------------- */
  function labelEl(op, pd, text) {
    const l = h('div', { class: 'plabel' + (op.e[pd.name] ? ' has-expr' : ''), title: (pd.label || pd.name) + ' (' + pd.name + ')' + (pd.help ? ' — ' + pd.help : '') + ' — click to toggle expression' }, text || pd.label);
    if (isExprable(pd)) l.addEventListener('click', () => toggleExpr(op, pd));
    l.addEventListener('contextmenu', (e) => { e.preventDefault(); paramMenu(op, pd, e.clientX, e.clientY); });
    return l;
  }
  const isExprable = (pd) => ['float', 'int', 'toggle', 'menu', 'font', 'string', 'color', 'op'].includes(pd.type);
  function toggleExpr(op, pd) {
    if (op.e[pd.name]) { const v = K.par(op, pd.name); delete op.e[pd.name]; if (pd.type === 'float' || pd.type === 'int') op.p[pd.name] = +v || 0; }
    else op.e[pd.name] = pd.type === 'float' || pd.type === 'int' ? String(+(+op.p[pd.name]).toFixed(4)) : JSON.stringify(op.p[pd.name]);
    PP.render(true); changed(op, pd); K.net.drawWires();
  }

  function paramRow(op, pd, pageHint) {
    const t = pd.type;
    if (t === 'code' || t === 'table') {
      return h('div', { class: 'prow wide' }, h('div', { class: 'plabel' }, pd.label, pageHint ? h('span', { class: 'p-page-hint' }, ' · ' + pageHint) : null), control(op, pd));
    }
    if (t === 'text') return h('div', { class: 'prow wide' }, labelEl(op, pd), control(op, pd));
    const btns = h('div', { class: 'pbtns' });
    if (isExprable(pd)) {
      btns.appendChild(h('button', { class: 'pbtn' + (op.e[pd.name] ? ' on' : ''), title: 'Expression mode', onclick: () => toggleExpr(op, pd) }, '='));
      if (pd.type === 'float' || pd.type === 'int' || pd.type === 'toggle') btns.appendChild(h('button', { class: 'pbtn', title: 'Link / animate', onclick: (e) => paramMenu(op, pd, e.clientX, e.clientY) }, '⋯'));
    }
    return h('div', { class: 'prow' }, labelEl(op, pd), h('div', { class: 'pctl' }, control(op, pd)), btns);
  }
  function groupRow(op, group) {
    const base = group[0].label.replace(/\s+[XYZ]$|\s+(Low|High|Width|Height)$/i, '').replace(/^(Bottom|Top) (Left|Right) [XY]$/, '$1 $2');
    const ctl = h('div', { class: 'pctl' });
    group.forEach((pd) => {
      const short = (pd.label.match(/\b([XYZ]|Low|High|Width|Height|Min|Max|Name \d|Value \d|DAT Row|DAT Col)$/i) || [null, pd.name])[1];
      ctl.appendChild(control(op, pd, short.length > 6 ? pd.name : short));
    });
    return h('div', { class: 'prow multi' }, h('div', { class: 'plabel', title: group.map((g) => g.name).join(', ') }, base), ctl);
  }

  function control(op, pd, inner) {
    if (op.e[pd.name] != null && isExprable(pd)) return exprControl(op, pd, inner);
    switch (pd.type) {
      case 'float': case 'int': return numControl(op, pd, inner);
      case 'toggle': {
        const s = h('button', { class: 'switch' + (op.p[pd.name] ? ' on' : ''), role: 'switch', 'aria-checked': String(!!op.p[pd.name]), 'aria-label': pd.label });
        s.addEventListener('click', () => { op.p[pd.name] = !op.p[pd.name]; s.classList.toggle('on', !!op.p[pd.name]); changed(op, pd); });
        PP.live.push(() => s.classList.toggle('on', !!op.p[pd.name]));
        return s;
      }
      case 'menu': {
        const s = h('select', { class: 'sel-in', 'aria-label': pd.label }, pd.options.map((o) => h('option', { value: o, selected: o === op.p[pd.name] }, o)));
        s.addEventListener('change', () => { op.p[pd.name] = s.value; changed(op, pd); if (op.def.params.some((x) => x.showIf)) PP.render(true); });
        return s;
      }
      case 'font': {
        const opts = K.FONTS ? K.FONTS.slice() : (pd.options || []);
        if (op.p[pd.name] && !opts.includes(op.p[pd.name])) opts.push(op.p[pd.name]);
        const s = h('select', { class: 'sel-in', 'aria-label': pd.label }, opts.map((o) => {
          const isCustom = K.customFonts && K.customFonts.has(o);
          return h('option', { value: o, selected: o === op.p[pd.name] }, isCustom ? o + ' (custom)' : o);
        }));
        s.addEventListener('change', () => { op.p[pd.name] = s.value; changed(op, pd); });
        const up = h('button', {
          class: 'pulse-btn',
          title: 'Upload a custom font file (.ttf, .otf, .woff, .woff2) — e.g. downloaded from Google Fonts',
          onclick: async () => {
            const f = await U.pickFile('.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2,application/x-font-ttf,application/x-font-opentype,application/font-woff,application/font-woff2');
            if (!f) return;
            try {
              const fam = await K.loadFontFile(f);
              op.p[pd.name] = fam;
              PP.render(true);
              changed(op, pd);
              K.toast('Loaded font "' + fam + '"');
            } catch (e) {
              K.toast('Could not load font: ' + (e.message || e));
            }
          },
        }, 'Upload Font…');
        return h('div', { class: 'font-ctl' },
          h('div', { class: 'font-row' }, s, up),
          h('div', { class: 'file-hint' }, 'Supports .ttf, .otf, .woff2 (unzip Google Fonts first, or drag a font onto the network)'));
      }
      case 'color': {
        const c = h('input', { type: 'color', value: op.p[pd.name], 'aria-label': pd.label });
        const t = h('input', { class: 'str-in', value: op.p[pd.name], spellcheck: 'false' });
        c.addEventListener('input', () => { op.p[pd.name] = c.value; t.value = c.value; changed(op, pd); });
        t.addEventListener('change', () => { if (/^#?[0-9a-f]{3,6}$/i.test(t.value)) { op.p[pd.name] = t.value[0] === '#' ? t.value : '#' + t.value; c.value = op.p[pd.name]; changed(op, pd); } });
        t.addEventListener('keydown', (e) => e.stopPropagation());
        return h('div', { class: 'color-ctl' }, c, t);
      }
      case 'string': {
        const t = h('input', { class: 'str-in', value: op.p[pd.name], spellcheck: 'false', 'aria-label': pd.label });
        t.addEventListener('input', () => { op.p[pd.name] = t.value; changed(op, pd); });
        t.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') t.blur(); });
        return t;
      }
      case 'text': {
        const a = h('textarea', { class: 'area', spellcheck: 'false', rows: 3, placeholder: 'Type multiple lines here (press Return for a new line, or use \\n)' });
        a.value = op.p[pd.name];
        a.addEventListener('input', () => { op.p[pd.name] = a.value; changed(op, pd); });
        a.addEventListener('keydown', (e) => e.stopPropagation());
        return a;
      }
      case 'code': return codeControl(op, pd);
      case 'table': return tableControl(op, pd);
      case 'pulse': return h('button', { class: 'pulse-btn', onclick: () => { op.def.pulse && op.def.pulse(op, pd.name); } }, pd.label);
      case 'file': {
        const m = K.media.get(op.p[pd.name]);
        const name = h('span', null, m ? m.name : 'No file');
        return h('div', { class: 'file-ctl' }, h('button', { class: 'pulse-btn', onclick: async () => {
          const f = await U.pickFile(pd.accept);
          if (!f) return;
          const id = K.addMedia(f);
          op.p[pd.name] = id; name.textContent = f.name; changed(op, pd);
        } }, 'Choose…'), name, h('div', { class: 'file-hint' }, 'or drag a file onto the network'));
      }
      case 'op': {
        const opts = K.opsOfFamily(pd.family).filter((o) => o !== op && (!pd.filter || o.type === pd.filter));
        const s = h('select', { class: 'sel-in', 'aria-label': pd.label }, h('option', { value: '' }, '— none —'), opts.map((o) => h('option', { value: o.name, selected: o.name === op.p[pd.name] }, o.name + (o.parent !== P.network ? '  (' + K.path(o) + ')' : ''))));
        if (op.p[pd.name] && !opts.some((o) => o.name === op.p[pd.name])) s.appendChild(h('option', { value: op.p[pd.name], selected: true }, op.p[pd.name] + ' (missing)'));
        s.addEventListener('change', () => { op.p[pd.name] = s.value; changed(op, pd); });
        const go = h('button', { class: 'pbtn', title: 'Select referenced operator', onclick: () => { const r = K.findOp(op.p[pd.name]); if (r) { if (r.parent !== P.network) K.net.enter(r.parent); K.net.select(r.id); } } }, '→');
        return h('div', { class: 'op-ctl' }, s, go);
      }
    }
    return h('span', null, String(op.p[pd.name]));
  }

  function numControl(op, pd, inner) {
    const isInt = pd.type === 'int';
    const fill = h('div', { class: 'fill' }), val = h('div', { class: 'val' });
    const el = h('div', { class: 'num', tabindex: '0', role: 'slider', 'aria-label': pd.label }, fill, inner ? h('div', { class: 'lbl-in' }, inner) : null, val);
    const lo = pd.min == null ? 0 : pd.min, hi = pd.max == null ? 1 : pd.max;
    let shown = null, editing = false;
    const show = () => {
      const v = +op.p[pd.name];
      if (v === shown) return;
      shown = v;
      val.textContent = fmt(v, isInt);
      fill.style.width = U.clamp((v - lo) / (hi - lo || 1), 0, 1) * 100 + '%';
    };
    show();
    PP.live.push(() => { if (!editing) show(); });
    let sx = 0, sv = 0, moved = false, pid = null;
    el.addEventListener('pointerdown', (e) => {
      if (editing || e.button === 2) return;
      e.preventDefault();
      el.setPointerCapture(e.pointerId); pid = e.pointerId;
      sx = e.clientX; sv = +op.p[pd.name]; moved = false;
    });
    el.addEventListener('pointermove', (e) => {
      if (pid !== e.pointerId) return;
      const dx = e.clientX - sx;
      if (Math.abs(dx) > 3) moved = true;
      if (!moved) return;
      const w = el.getBoundingClientRect().width || 100;
      const range = hi - lo || 1;
      let v = sv + (dx / w) * range * (e.shiftKey ? 0.1 : 1) * (e.altKey ? 0.01 : 1);
      if (isInt) v = Math.round(v);
      op.p[pd.name] = v; show(); changed(op);
    });
    el.addEventListener('pointerup', (e) => {
      if (pid !== e.pointerId) return;
      pid = null;
      if (!moved) startEdit();
    });
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); paramMenu(op, pd, e.clientX, e.clientY); });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { startEdit(); e.preventDefault(); }
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        const step = isInt ? 1 : (hi - lo) / 100 * (e.shiftKey ? 0.1 : 1);
        op.p[pd.name] = +op.p[pd.name] + (e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step : -step);
        show(); changed(op); e.preventDefault(); e.stopPropagation();
      }
    });
    function startEdit() {
      editing = true;
      const inp = h('input', { value: fmt(+op.p[pd.name], isInt), inputmode: 'decimal' });
      el.appendChild(inp); inp.focus(); inp.select();
      const finish = (commit) => {
        if (!editing) return;
        editing = false;
        if (commit) {
          const s = inp.value.trim();
          if (/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) op.p[pd.name] = isInt ? Math.round(+s) : +s;
          else if (s) { op.e[pd.name] = s; inp.remove(); PP.render(true); changed(op, pd); K.net.drawWires(); return; }
          changed(op);
        }
        inp.remove(); shown = null; show();
      };
      inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
      inp.addEventListener('blur', () => finish(true));
    }
    return el;
  }

  function exprControl(op, pd, inner) {
    const inp = h('input', { class: 'expr-in', value: op.e[pd.name], spellcheck: 'false', title: 'Expression — JavaScript. Variables: t, frame, beat, bpm, me, op(name), ch(name, chan), noise(), sin()…' });
    const v = h('span', { class: 'expr-val' });
    const wrap = h('div', { class: 'expr-wrap' }, inp, v);
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') inp.blur(); });
    inp.addEventListener('change', () => {
      if (!inp.value.trim()) { delete op.e[pd.name]; PP.render(true); }
      else op.e[pd.name] = inp.value.trim();
      changed(op, pd); K.net.drawWires();
    });
    inp.addEventListener('contextmenu', (e) => { e.preventDefault(); paramMenu(op, pd, e.clientX, e.clientY); });
    PP.live.push(() => {
      const r = K.par(op, pd.name);
      const s = (inner ? inner + ' ' : '') + (typeof r === 'number' ? fmt(r, pd.type === 'int') : String(r).slice(0, 14));
      if (v.textContent !== s) v.textContent = s;
      const bad = op.rt.exprErr && op.rt.exprErr[pd.name];
      inp.style.borderColor = bad ? 'var(--err)' : '';
      inp.title = bad ? 'Error: ' + bad : inp.title;
    });
    return wrap;
  }

  function codeControl(op, pd) {
    const a = h('textarea', { class: 'area code', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off' });
    a.value = op.p[pd.name];
    const status = h('span', null, pd.lang === 'glsl' ? 'GLSL · auto-compiles' : pd.lang === 'js' ? 'JavaScript · applies as you type' : 'Text');
    let tmr;
    const apply = () => { op.p[pd.name] = a.value; changed(op, pd); };
    a.addEventListener('input', () => { clearTimeout(tmr); tmr = setTimeout(apply, 450); });
    a.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Tab') { e.preventDefault(); const s = a.selectionStart; a.setRangeText('  ', s, a.selectionEnd, 'end'); }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); clearTimeout(tmr); apply(); }
    });
    const rows = Math.min(28, Math.max(8, String(a.value).split('\n').length + 1));
    a.style.height = rows * 17 + 16 + 'px';
    return h('div', null, a, h('div', { class: 'code-bar' }, status, h('span', null, '⌘/Ctrl+Enter to apply')));
  }

  function tableControl(op, pd) {
    const wrap = h('div');
    const draw = () => {
      wrap.innerHTML = '';
      const t = op.p[pd.name];
      const tbl = h('table');
      t.forEach((row, r) => {
        const tr = h('tr');
        row.forEach((cell, c) => {
          const d = h('div', { contenteditable: 'true', spellcheck: 'false' }, String(cell));
          d.addEventListener('input', () => { t[r][c] = d.textContent; changed(op); });
          d.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); d.blur(); } });
          tr.appendChild(h('td', null, d));
        });
        tbl.appendChild(tr);
      });
      const tools = h('div', { class: 'table-tools' },
        h('button', { class: 'btn small', onclick: () => { t.push(new Array(t[0] ? t[0].length : 1).fill('')); draw(); changed(op); } }, '+ Row'),
        h('button', { class: 'btn small', onclick: () => { if (t.length > 1) t.pop(); draw(); changed(op); } }, '− Row'),
        h('button', { class: 'btn small', onclick: () => { t.forEach((r) => r.push('')); draw(); changed(op); } }, '+ Col'),
        h('button', { class: 'btn small', onclick: () => { if (t[0] && t[0].length > 1) t.forEach((r) => r.pop()); draw(); changed(op); } }, '− Col'),
        h('button', { class: 'btn small', onclick: () => editAsText() }, 'Edit as text'));
      wrap.appendChild(h('div', { class: 'table-ed' }, tbl));
      wrap.appendChild(tools);
    };
    const editAsText = () => {
      UI.dialog((d, close) => {
        const a = h('textarea', { class: 'area code', style: { minHeight: '260px' } });
        a.value = op.p[pd.name].map((r) => r.join('\t')).join('\n');
        a.addEventListener('keydown', (e) => e.stopPropagation());
        d.append(h('h2', null, 'Edit table as text'), h('p', { class: 'sub' }, 'One row per line. Separate cells with tabs or commas. Paste straight from a spreadsheet.'), a,
          h('div', { class: 'actions' }, h('button', { class: 'btn', onclick: close }, 'Cancel'), h('button', { class: 'btn primary', onclick: () => {
            const lines = a.value.replace(/\r/g, '').split('\n').filter((l, i, arr) => l.length || i < arr.length - 1);
            const sep = a.value.includes('\t') ? '\t' : ',';
            const rows = lines.map((l) => l.split(sep));
            const w = Math.max(1, ...rows.map((r) => r.length));
            op.p[pd.name] = rows.length ? rows.map((r) => { while (r.length < w) r.push(''); return r; }) : [['']];
            close(); PP.render(true); changed(op);
          } }, 'Apply')));
      });
    };
    draw();
    return wrap;
  }

  /* ---------------- param menu: link / animate / reset ---------------- */
  function paramMenu(op, pd, x, y) {
    const items = [{ head: pd.label + '  ·  ' + op.name + '.par.' + pd.name }];
    if (isExprable(pd)) items.push({ label: op.e[pd.name] ? 'Switch to constant' : 'Switch to expression', key: '=', fn: () => toggleExpr(op, pd) });
    items.push({ label: 'Reset to default', fn: () => { delete op.e[pd.name]; op.p[pd.name] = JSON.parse(JSON.stringify(pd.default == null ? 0 : pd.default)); PP.render(true); changed(op, pd); K.net.drawWires(); } });
    if (pd.type === 'float' || pd.type === 'int' || pd.type === 'toggle') {
      const lo = pd.min == null ? 0 : pd.min, hi = pd.max == null ? 1 : pd.max;
      const remap = (src) => (lo === 0 && hi === 1 ? src : `fit(${src}, 0, 1, ${lo}, ${hi})`);
      const setE = (e) => { op.e[pd.name] = e; PP.render(true); changed(op, pd); K.net.drawWires(); };
      items.push('-', { head: 'Animate' },
        { label: 'with sine over time', fn: () => setE(`${+(+op.p[pd.name]).toFixed(3)} + sin(t) * ${+((hi - lo) * 0.25).toFixed(3)}`) },
        { label: 'with new LFO CHOP', fn: () => { const l = spawn('lfoCHOP', op, -1); l.p.amp = 0.5; l.p.offset = 0.5; setE(remap(`op('${l.name}')[0]`)); } },
        { label: 'with new Noise CHOP', fn: () => { const l = spawn('noiseCHOP', op, -1); l.p.chans = 1; l.p.amp = 0.5; l.p.offset = 0.5; setE(remap(`op('${l.name}')[0]`)); } },
        { label: 'from beat (pulse each beat)', fn: () => setE(remap(`pulse(beat, 0.15)`)) },
        { label: 'with new Slider (control panel)', fn: () => { const s = spawn('sliderCOMP', op, 1); s.p.label = pd.label; s.p.min = lo; s.p.max = hi; s.p.value = +op.p[pd.name] || 0; setE(`op('${s.name}')[0]`); } });
      const chops = K.opsOfFamily('CHOP').filter((c) => c.out && c.out.chans && c.out.chans.length);
      const panels = K.opsOfFamily('COMP').filter((c) => c.def.panel);
      if (chops.length || panels.length) {
        items.push('-', { head: 'Link to channel' });
        chops.slice(0, 12).forEach((c) => c.out.chans.slice(0, 6).forEach((ch) => items.push({ label: c.name + ' : ' + ch.name, swatch: UI.famColor('CHOP'), fn: () => setE(remap(`op('${c.name}')['${ch.name}']`)) })));
        panels.forEach((c) => items.push({ label: c.name + ' (' + c.def.label + ')', swatch: UI.famColor('COMP'), fn: () => setE(`op('${c.name}')[0]`) }));
      }
    }
    items.push('-', { label: 'Copy reference', fn: () => { const s = `op('${op.name}').par.${pd.name}`; navigator.clipboard && navigator.clipboard.writeText(s); K.toast('Copied ' + s); } });
    UI.menu(items, x, y);
  }
  function spawn(type, near, dir) {
    const o = K.createOp(type, { x: near.x, y: near.y + (dir < 0 ? -160 : 160), parent: near.parent });
    K.net.render();
    return o;
  }

  K.addMedia = function (file) {
    const id = U.uid('media');
    K.media.set(id, { name: file.name, type: file.type, url: URL.createObjectURL(file), blob: file });
    return id;
  };

  K.bus.on('select', () => PP.render());
  K.bus.on('focusParams', () => {
    const r = document.getElementById('params');
    if (!r) return;
    const target = r.querySelector('.num') || r.querySelector('.p-body textarea') || r.querySelector('.p-body .str-in') || r.querySelector('.p-body .sel-in') || r.querySelector('.p-search-wrap input');
    target && target.focus();
  });
  // A colour or flag change from the network should refresh the header controls.
  K.bus.on('project', () => PP.render());
})();
