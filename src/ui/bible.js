/* Kiln — ui/bible.js : the searchable Kiln Bible (reference manual) + recipe builder */
(function () {
  'use strict';
  const K = window.K, U = K.util, P = K.project;
  const BB = (K.bible = { isOpen: false });
  let root, main, nav, search, countEl, built = false, entries = [];

  const BOOK = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H5.5A1.5 1.5 0 0 0 4 19.5z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H19v-3"/><path d="M9 7h6M9 10.5h4"/></svg>';
  BB.BOOK = BOOK;
  const FAMS = ['TOP', 'CHOP', 'SOP', 'MAT', 'COMP', 'DAT'];
  const h = (...a) => K.ui.h(...a);
  const famColor = (f) => K.ui.famColor(f);
  const opLabel = (type) => { const d = K.types[type]; return d ? d.label + ' ' + d.family : type; };

  /* ---------------- chain parsing ---------------- */
  // "a > b ~> c.par ; d > e"  →  [[{op:'a'}, {link:'>'}, {op:'b'}, ...], ...]
  BB.parse = function (chain) {
    return String(chain).split(';').map((seg) => {
      const toks = seg.trim().split(/\s+/).filter(Boolean), out = [];
      toks.forEach((t) => {
        if (t === '>' || t === '~>') out.push({ link: t });
        else { const m = t.match(/^([a-zA-Z]+)(?:#(\w+))?(?:\.(\w+))?$/); if (m) out.push({ type: m[1], key: m[1] + (m[2] ? '#' + m[2] : ''), par: m[3] || null }); }
      });
      return out;
    }).filter((s) => s.length);
  };

  function chainView(chain) {
    const wrap = h('div', { class: 'b-chain' });
    BB.parse(chain).forEach((seg) => {
      const row = h('div', { class: 'b-chain-row' });
      seg.forEach((t, i) => {
        if (t.link) {
          const next = seg[i + 1];
          row.appendChild(t.link === '>'
            ? h('span', { class: 'b-arrow', title: 'Wire: output → input' }, '→')
            : h('span', { class: 'b-arrow ref', title: 'Reference: drives a parameter (no wire)' }, '⇢', next && next.par ? h('small', null, next.par) : null));
          return;
        }
        const d = K.types[t.type];
        if (!d) { row.appendChild(h('span', { class: 'b-chip' }, t.type)); return; }
        row.appendChild(h('button', { class: 'b-chip', style: { '--fam': famColor(d.family) }, title: 'Jump to ' + opLabel(t.type), onclick: () => BB.goto('op-' + t.type) },
          h('i', null, d.family), d.label));
      });
      wrap.appendChild(row);
    });
    return wrap;
  }

  /* ---------------- build a chain into the network ---------------- */
  BB.build = function (chain) {
    const segs = BB.parse(chain);
    const existing = K.opsIn(P.network);
    const baseY = existing.length ? Math.max(...existing.map((o) => o.y)) + 260 : 0;
    const baseX = existing.length ? Math.min(...existing.map((o) => o.x)) : 0;
    const made = new Map(), created = [];
    const get = (t, col, row) => {
      if (made.has(t.key)) return made.get(t.key);
      if (!K.types[t.type]) return null;
      const op = K.createOp(t.type, { x: baseX + col * 216, y: baseY + row * 172, parent: P.network });
      made.set(t.key, op); created.push(op);
      return op;
    };
    segs.forEach((seg, row) => {
      let col = 0, prev = null, link = null;
      seg.forEach((t) => {
        if (t.link) { link = t.link; return; }
        const op = get(t, col, row);
        col++;
        if (!op) { prev = null; return; }
        if (prev && link === '>') wire(prev, op);
        else if (prev && link === '~>') reference(prev, op, t.par);
        prev = op; link = null;
      });
    });
    // sensible defaults so the result shows something right away
    created.forEach((op) => {
      if (op.type === 'outTOP') op.flags.display = true;
      if (op.type === 'renderTOP' && !op.p.camera) { const cam = created.find((o) => o.type === 'cameraCOMP'); if (cam) op.p.camera = cam.name; }
    });
    K.commit(true);
    K.bus.emit('graph');
    K.net.render();
    if (created.length) {
      P.selection.clear(); created.forEach((o) => P.selection.add(o.id));
      P.current = created[created.length - 1].id;
      K.net.updateSelection && K.net.updateSelection();
      K.bus.emit('select');
      requestAnimationFrame(() => K.net.fit());
    }
    return created;
  };
  function wire(a, b) {
    if (a.family !== b.family || b.def.inputs === 0) return false;
    const n = b.def.inputs === 'multi' ? 99 : b.def.inputs;
    let i = 0;
    while (i < n && b.inputs[i]) i++;
    if (i >= n) return false;
    return K.connect(a.id, b.id, i);
  }
  function reference(src, tgt, par) {
    if (!par) return;
    const pd = tgt.def.paramMap[par];
    if (!pd) return;
    if (pd.type === 'op' || pd.type === 'string') {
      if (par === 'lights' && tgt.p.lights && tgt.p.lights !== '*') tgt.p.lights += ' ' + src.name;
      else tgt.p[par] = src.name;
      return;
    }
    if (pd.type === 'float' || pd.type === 'int' || pd.type === 'toggle') {
      const lo = pd.min == null ? 0 : pd.min, hi = pd.max == null ? 1 : pd.max;
      const ref = src.def.panel ? `op('${src.name}')[0]` : `op('${src.name}')[0]`;
      tgt.e[par] = lo === 0 && hi === 1 ? ref : `fit(${ref}, 0, 1, ${lo}, ${hi})`;
    }
  }

  /* ---------------- markdown export ---------------- */
  BB.toMarkdown = function () {
    const B = K.BIBLE, L = [];
    const chainMd = (c) => BB.parse(c).map((seg) => seg.map((t) => (t.link ? (t.link === '>' ? '→' : '⇢') : (K.types[t.type] ? opLabel(t.type) : t.type) + (t.par ? '.' + t.par : ''))).join(' ')).join('  ·  ');
    L.push('# The Kiln Bible', '', 'Terms, operators, connections and expressions for Kiln, a node-based audiovisual studio.', '');
    L.push('## Start here', ''); B.intro.forEach((p) => L.push(p, ''));
    L.push('### The six families', '', '| Family | What it is | Data | Example |', '|---|---|---|---|');
    B.families.forEach((f) => L.push(`| **${f.id}**: ${f.name} | ${f.what} | ${f.data} | ${chainMd(f.example)} |`));
    L.push('', '## Glossary', '');
    B.terms.forEach(([t, d, tip]) => L.push(`**${t}**: ${d}${tip ? ' ' + tip : ''}`, ''));
    FAMS.forEach((fam) => {
      const f = B.families.find((x) => x.id === fam);
      L.push(`## ${fam}: ${f.name}`, '', f.what, '');
      Object.values(K.types).filter((d) => d.family === fam && !d.hidden).forEach((d) => {
        const e = B.ops[d.type] || {};
        L.push(`### ${d.label} ${fam}`, '', e.what || d.help || '', '');
        L.push(`Inputs: ${inputsText(d)}`, '');
        if (e.use && e.use.length) L.push('Use it for: ' + e.use.join(' · '), '');
        if (e.chain) L.push('Example: ' + chainMd(e.chain), '');
        const ps = d.params.filter((p) => p.page !== 'Common');
        if (ps.length) L.push('Parameters: ' + ps.map((p) => p.label).join(', '), '');
        if (e.tip) L.push('Tip: ' + e.tip, '');
      });
    });
    L.push('## Connection recipes', '');
    B.recipes.forEach((r) => { L.push(`### ${r.title}`, '', chainMd(r.chain), ''); r.steps.forEach((s, i) => L.push(`${i + 1}. ${s}`)); L.push(''); });
    L.push('## Expressions', '', '| Expression | Meaning | Example |', '|---|---|---|');
    B.expressions.forEach(([a, b, c]) => L.push(`| \`${a}\` | ${b} | \`${c}\` |`));
    L.push('', '## Shortcuts', '', '| Action | Keys |', '|---|---|');
    B.shortcuts.forEach(([a, b]) => L.push(`| ${a} | ${b} |`));
    L.push('', 'Legend: → wire (output into input) · ⇢ reference (drives a parameter, no wire)', '');
    return L.join('\n');
  };
  function inputsText(d) {
    if (d.inputs === 0) return 'none (generator)';
    if (d.inputs === 'multi') return 'any number of ' + d.family + 's';
    return d.inputs + ' ' + d.family + (d.inputs > 1 ? 's' : '') + (d.minInputs != null && d.minInputs < d.inputs ? ' (' + d.minInputs + ' required)' : '');
  }
  function paramText(p) {
    if (p.type === 'menu') return p.options.join(' · ');
    if (p.type === 'float' || p.type === 'int') return (p.min != null && p.max != null ? p.min + ' – ' + p.max : '') + (p.default != null ? '  (default ' + p.default + ')' : '');
    if (p.type === 'toggle') return 'on / off';
    if (p.type === 'color') return 'color' + (p.default ? ' ' + p.default : '');
    if (p.type === 'op') return 'reference to a ' + (p.filter ? K.types[p.filter] ? K.types[p.filter].label + ' ' : '' : '') + p.family;
    if (p.type === 'pulse') return 'button';
    if (p.type === 'file') return 'file';
    if (p.type === 'code') return (p.lang || 'code').toUpperCase() + ' code';
    if (p.type === 'table') return 'table';
    return p.type;
  }

  /* ---------------- UI ---------------- */
  function buildUI() {
    const B = K.BIBLE;
    root = h('div', { class: 'bible', id: 'bible', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Kiln Bible', hidden: true });
    search = h('input', { class: 'b-search', type: 'search', placeholder: 'Search terms, operators, recipes… (try "audio", "fade", "slides")', 'aria-label': 'Search the Bible', spellcheck: 'false', autocomplete: 'off' });
    countEl = h('span', { class: 'b-count' });
    const head = h('header', { class: 'b-head' },
      h('div', { class: 'b-title' },
        h('span', { class: 'b-logo', html: BOOK }),
        h('span', null, 'Kiln Bible')),
      h('div', { class: 'b-search-wrap' }, search, countEl),
      h('button', { class: 'btn small', title: 'Download the Bible as Markdown', onclick: () => K.saveOut('Kiln-Bible.md', new Blob([BB.toMarkdown()], { type: 'text/markdown' }), { kind: 'doc', replace: true }) }, 'Download .md'),
      h('button', { class: 'icon-btn b-close', title: 'Close (Esc)', 'aria-label': 'Close', onclick: BB.close }, '×'));
    nav = h('nav', { class: 'b-nav', 'aria-label': 'Bible sections' });
    main = h('div', { class: 'b-main' });
    root.append(head, h('div', { class: 'b-body' }, nav, main));
    document.body.appendChild(root);

    const section = (id, title, sub) => {
      const s = h('section', { class: 'b-sec', id: 'b-' + id, 'data-sec': id }, h('h2', null, title), sub ? h('p', { class: 'b-sub' }, sub) : null);
      const list = h('div', { class: 'b-list' });
      s.appendChild(list); main.appendChild(s);
      nav.appendChild(h('button', { 'data-sec': id, onclick: () => BB.goto(id) }, h('span', null, title), h('em', { class: 'b-nc' })));
      return list;
    };
    const add = (list, el, title, text) => {
      el.dataset.search = (title + ' ' + text).toLowerCase();
      el.dataset.title = title.toLowerCase();
      list.appendChild(el);
      entries.push(el);
      return el;
    };

    // Start here
    let L = section('start', 'Start here', 'How Kiln thinks: operators, families and the flow from left to right.');
    add(L, h('article', { class: 'b-entry b-intro' }, B.intro.map((p) => h('p', null, p)),
      h('div', { class: 'b-legend' }, h('span', null, h('b', { class: 'b-arrow' }, '→'), ' wire: output into input (same family)'), h('span', null, h('b', { class: 'b-arrow ref' }, '⇢'), ' reference: one operator drives another\'s parameter'))), 'introduction overview how it works', B.intro.join(' '));
    B.families.forEach((f) => add(L, h('article', { class: 'b-entry b-fam', id: 'b-fam-' + f.id, style: { '--fam': famColor(f.id) } },
      h('div', { class: 'b-entry-head' }, h('span', { class: 'fam-chip', style: { background: famColor(f.id) } }, f.id), h('h3', null, f.name), h('span', { class: 'b-kind' }, f.short)),
      h('p', null, f.what), h('p', { class: 'b-meta' }, h('b', null, 'Carries: '), f.data),
      h('div', { class: 'b-label' }, 'Example'), chainView(f.example),
      h('button', { class: 'b-link', onclick: () => BB.goto('fam-' + f.id + '-ops') }, 'See all ' + f.id + ' operators →')),
    f.id + ' ' + f.name, f.what + ' ' + f.data + ' family'));

    // Glossary
    L = section('glossary', 'Glossary', 'The words you will see across Kiln, in plain language.');
    B.terms.forEach(([t, d, tip]) => add(L, h('article', { class: 'b-entry b-term' }, h('h3', null, t), h('p', null, d), tip ? h('p', { class: 'b-tip' }, tip) : null), t, d + ' ' + tip + ' glossary term definition'));

    // Operators by family
    FAMS.forEach((fam) => {
      const f = B.families.find((x) => x.id === fam);
      const defs = Object.values(K.types).filter((d) => d.family === fam && !d.hidden);
      L = section('fam-' + fam + '-ops', fam + ' · ' + f.name, f.what + ' ' + defs.length + ' operators.');
      nav.lastChild.style.setProperty('--fam', famColor(fam));
      nav.lastChild.classList.add('fam');
      defs.forEach((d) => {
        const e = B.ops[d.type] || {};
        const ps = d.params.filter((p) => p.page !== 'Common');
        const el = h('article', { class: 'b-entry b-op', id: 'b-op-' + d.type, style: { '--fam': famColor(fam) } },
          h('div', { class: 'b-entry-head' },
            h('span', { class: 'fam-chip', style: { background: famColor(fam) } }, fam),
            h('h3', null, d.label + ' ' + fam),
            h('span', { class: 'b-kind' }, d.inputs === 0 || d.gen ? 'generator' : 'filter')),
          h('p', null, e.what || d.help || ''),
          h('p', { class: 'b-meta' }, h('b', null, 'Inputs: '), inputsText(d), h('b', null, '   Output: '), fam === 'COMP' ? (d.panel ? 'a control value' : d.container ? 'a sub-network' : 'an object') : 'a ' + fam),
          e.use && e.use.length ? h('div', null, h('div', { class: 'b-label' }, 'Use it for'), h('ul', { class: 'b-use' }, e.use.map((u) => h('li', null, u)))) : null,
          e.chain ? h('div', null, h('div', { class: 'b-label' }, 'Example connection'), chainView(e.chain)) : null,
          ps.length ? h('details', { class: 'b-params' }, h('summary', null, 'Parameters (' + ps.length + ')'),
            h('dl', null, ps.map((p) => [h('dt', null, p.label), h('dd', null, paramText(p))]).flat())) : null,
          e.tip ? h('p', { class: 'b-tip' }, e.tip) : null,
          h('div', { class: 'b-actions' },
            h('button', { class: 'btn small', onclick: () => { const [x, y] = centerWorld(); K.net.addOp(d.type, x - 84, y - 47); BB.close(); } }, '+ Add to network'),
            e.chain && e.chain.includes('>') ? h('button', { class: 'btn small', onclick: () => { BB.build(e.chain); BB.close(); K.toast('Built: ' + d.label + ' ' + fam + ' example'); } }, 'Build example') : null));
        add(L, el, d.label + ' ' + fam + ' ' + d.type, [e.what, d.help, (e.use || []).join(' '), e.tip, ps.map((p) => p.label + ' ' + (p.options || []).join(' ')).join(' '), (e.chain || '').replace(/[A-Z]+\b/g, ' $&'), 'operator', d.short].join(' '));
      });
    });

    // Recipes
    L = section('recipes', 'Connection recipes', 'Tested ways to wire operators together. Press Build to drop the chain into your network.');
    B.recipes.forEach((r) => add(L, h('article', { class: 'b-entry b-recipe' },
      h('div', { class: 'b-entry-head' }, h('h3', null, r.title), h('span', { class: 'b-tags' }, r.tags.map((t) => h('i', { style: { background: famColor(t) } }, t)))),
      chainView(r.chain),
      h('ol', { class: 'b-steps' }, r.steps.map((s) => h('li', null, s))),
      h('div', { class: 'b-actions' }, h('button', { class: 'btn small primary', onclick: () => { BB.build(r.chain); BB.close(); K.toast('Built recipe: ' + r.title); } }, 'Build this'))),
    r.title, r.steps.join(' ') + ' ' + r.tags.join(' ') + ' recipe example connection ' + BB.parse(r.chain).flat().filter((t) => t.type).map((t) => opLabel(t.type)).join(' ')));

    // Expressions
    L = section('expressions', 'Expressions', 'Click a parameter label (or its = button) and type any of these. They are evaluated every frame.');
    B.expressions.forEach(([a, b, c]) => add(L, h('article', { class: 'b-entry b-expr' }, h('code', { class: 'b-code' }, a), h('p', null, b), h('code', { class: 'b-ex' }, c)), a, b + ' ' + c + ' expression'));

    // Shortcuts
    L = section('shortcuts', 'Shortcuts', 'Keyboard and touch.');
    B.shortcuts.forEach(([a, b]) => add(L, h('article', { class: 'b-entry b-key' }, h('span', null, a), h('code', null, b)), a, b + ' shortcut key'));

    // empty state
    main.appendChild(h('div', { class: 'b-empty', hidden: true }, h('h3', null, 'Nothing found'), h('p', null, 'Try a broader word like "color", "audio", "3D" or "text".')));

    search.addEventListener('input', () => filter(search.value));
    search.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { if (search.value) { search.value = ''; filter(''); } else BB.close(); }
      if (e.key === 'Enter') { const first = entries.find((x) => !x.hidden); if (first) first.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
    });
    root.addEventListener('keydown', (e) => {
      if (e.target === search) return;
      if (e.key === 'Escape') { BB.close(); e.stopPropagation(); }
      if (e.key === '/') { e.preventDefault(); search.focus(); search.select(); }
      e.stopPropagation();
    });
    main.addEventListener('scroll', spy, { passive: true });
    built = true;
    filter('');
  }
  function centerWorld() { const r = document.getElementById('netCanvas').getBoundingClientRect(); return K.net.toWorld(r.left + r.width / 2, r.top + r.height / 2); }

  function filter(q) {
    const toks = q.toLowerCase().trim().split(/\s+/).filter(Boolean);
    let n = 0;
    entries.forEach((el) => {
      const hit = !toks.length || toks.every((t) => el.dataset.search.includes(t));
      el.hidden = !hit;
      el.style.order = toks.length && toks.every((t) => el.dataset.title.includes(t)) ? '-1' : '';
      if (hit) n++;
    });
    main.querySelectorAll('.b-sec').forEach((s) => {
      const c = s.querySelectorAll('.b-entry:not([hidden])').length;
      s.hidden = c === 0;
      s.style.order = toks.length && s.querySelector('.b-entry:not([hidden])[style*="order: -1"]') ? '-1' : '';
      const nb = nav.querySelector('[data-sec="' + s.dataset.sec + '"]');
      if (nb) { nb.querySelector('.b-nc').textContent = toks.length ? c : ''; nb.classList.toggle('dim', c === 0); }
    });
    main.querySelector('.b-empty').hidden = n > 0;
    countEl.textContent = toks.length ? n + (n === 1 ? ' result' : ' results') : '';
    highlight(toks);
    if (toks.length) main.scrollTop = 0;
  }
  function highlight(toks) {
    if (!window.CSS || !CSS.highlights || typeof Highlight === 'undefined') return;
    CSS.highlights.delete('bible');
    if (!toks.length) return;
    const ranges = [];
    entries.forEach((el) => {
      if (el.hidden) return;
      const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = tw.nextNode())) {
        const txt = node.nodeValue.toLowerCase();
        toks.forEach((t) => {
          let i = txt.indexOf(t);
          while (i !== -1 && ranges.length < 1500) { const r = new Range(); r.setStart(node, i); r.setEnd(node, i + t.length); ranges.push(r); i = txt.indexOf(t, i + t.length); }
        });
      }
    });
    CSS.highlights.set('bible', new Highlight(...ranges));
  }
  function spy() {
    const top = main.getBoundingClientRect().top + 40;
    let cur = null;
    main.querySelectorAll('.b-sec:not([hidden])').forEach((s) => { if (s.getBoundingClientRect().top <= top) cur = s.dataset.sec; });
    if (!cur) { const f = main.querySelector('.b-sec:not([hidden])'); cur = f && f.dataset.sec; }
    nav.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.sec === cur));
  }

  BB.goto = function (id) {
    const el = document.getElementById('b-' + id);
    if (!el) return;
    if (el.hidden || (el.closest('.b-sec') && el.closest('.b-sec').hidden)) { search.value = ''; filter(''); }
    el.scrollIntoView({ block: 'start', behavior: 'smooth' });
    if (el.classList.contains('b-entry')) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
  };
  BB.open = function (target, query) {
    if (!built) buildUI();
    K.ui.closePops();
    root.hidden = false; BB.isOpen = true;
    document.body.classList.add('bible-open');
    if (query != null) { search.value = query; filter(query); }
    if (target) requestAnimationFrame(() => BB.goto(K.types[target] ? 'op-' + target : target));
    else setTimeout(() => search.focus(), 30);
    spy();
  };
  BB.close = function () {
    if (!root) return;
    root.hidden = true; BB.isOpen = false;
    document.body.classList.remove('bible-open');
  };
  BB.toggle = () => (BB.isOpen ? BB.close() : BB.open());
})();
