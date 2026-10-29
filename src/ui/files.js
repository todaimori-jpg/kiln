/* Kiln — files.js : the Kiln Files library.
   Every recording, snapshot and project save is kept on-device (via K.platform.fileDB), and
   offered through the system Share sheet (Save Video / Save to Files on iPad),
   a regular download, or opening it in a new tab. This matters on iPad because
   embedded web views (Koder and similar) silently ignore <a download>. */
(function () {
  'use strict';
  const K = window.K, U = K.util, UI = K.ui, h = UI.h;

  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // WKWebView-based apps (Koder, etc.) report no "Safari/" token in the user agent.
  const inAppWebView = isIOS && !/Safari\//.test(ua);
  K.env = Object.assign(K.env || {}, { isIOS, inAppWebView });

  /* ---------------- storage (IndexedDB, falling back to memory) ---------------- */
  const DB = 'kiln-files' + U.SCOPE, STORE = 'files';
  let dbp = null, mem = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((res) => {
      try {
        const idb = K.platform.fileDB();
        if (!idb) throw new Error('no on-device storage');
        const r = idb.open(DB, 1);
        r.onupgradeneeded = () => { const s = r.result.createObjectStore(STORE, { keyPath: 'id' }); s.createIndex('t', 't'); };
        r.onsuccess = () => res(r.result);
        r.onerror = () => res(null);
        r.onblocked = () => res(null);
        setTimeout(() => res(null), 3000);
      } catch (e) { res(null); }
    }).then((d) => { if (!d) mem = mem || new Map(); return d; });
    return dbp;
  }
  function tx(d, mode, fn) {
    return new Promise((res, rej) => {
      const t = d.transaction(STORE, mode); const s = t.objectStore(STORE);
      const r = fn(s);
      t.oncomplete = () => res(r && r.result);
      t.onerror = () => rej(t.error || new Error('storage error'));
      t.onabort = () => rej(t.error || new Error('storage full'));
    });
  }
  const F = (K.files = {
    persistent: null,
    async put(item) {
      const d = await db();
      if (!d) { mem.set(item.id, item); F.persistent = false; return true; }
      await tx(d, 'readwrite', (s) => s.put(item));
      F.persistent = true;
      return true;
    },
    async list() {
      const d = await db();
      let all;
      if (!d) all = [...mem.values()];
      else all = await new Promise((res) => { const out = []; const t = d.transaction(STORE, 'readonly'); const c = t.objectStore(STORE).openCursor();
        c.onsuccess = () => { const cur = c.result; if (cur) { out.push(cur.value); cur.continue(); } else res(out); }; c.onerror = () => res(out); });
      return all.sort((a, b) => b.t - a.t);
    },
    async get(id) { const d = await db(); if (!d) return mem.get(id) || null; return tx(d, 'readonly', (s) => s.get(id)); },
    async remove(id) { revoke(id); const d = await db(); if (!d) { mem.delete(id); return; } await tx(d, 'readwrite', (s) => s.delete(id)); },
    async clear() { urls.forEach((u) => URL.revokeObjectURL(u)); urls.clear(); const d = await db(); if (!d) { mem.clear(); return; } await tx(d, 'readwrite', (s) => s.clear()); },
    async usage() { try { const e = await navigator.storage.estimate(); return e; } catch (e) { return null; } },
  });
  // Ask the browser not to evict our files under storage pressure (best effort).
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {}

  const urls = new Map();
  function urlFor(item) { if (!urls.has(item.id)) urls.set(item.id, URL.createObjectURL(item.blob)); return urls.get(item.id); }
  function revoke(id) { const u = urls.get(id); if (u) { URL.revokeObjectURL(u); urls.delete(id); } }

  const kindOf = (name, type) => /^video\//.test(type) || /\.(mp4|webm|mov)$/i.test(name) ? 'video'
    : /^image\//.test(type) ? 'image' : /\.(ttf|otf|woff2?)$/i.test(name) || /^font\//.test(type) ? 'font' : /\.kiln$/i.test(name) ? 'project' : 'doc';
  const fmtSize = (b) => (b >= 1e6 ? (b / 1e6).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1e3)) + ' KB');
  const fmtDate = (t) => { const d = new Date(t); return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); };

  /* ---------------- the three ways out ---------------- */
  function fileObj(item) { try { return new File([item.blob], item.name, { type: item.type || item.blob.type || 'application/octet-stream' }); } catch (e) { return null; } }
  F.canShare = function (item) {
    const f = fileObj(item);
    try { return !!(f && navigator.canShare && navigator.share && navigator.canShare({ files: [f] })); } catch (e) { return false; }
  };
  F.share = async function (item) {
    const f = fileObj(item);
    try { await navigator.share({ files: [f], title: item.name }); return true; }
    catch (e) { if (e && e.name === 'AbortError') return false; K.toast('Share failed: ' + (e.message || e)); return false; }
  };
  F.download = function (item) {
    const a = document.createElement('a');
    a.href = urlFor(item); a.download = item.name; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); setTimeout(() => a.remove(), 1000);
  };
  F.openTab = function (item) {
    const w = window.open(urlFor(item), '_blank');
    if (!w) K.toast('This app blocked opening a new tab. Use Save / Share instead.');
  };

  /* ---------------- main entry: save something ---------------- */
  // K.saveOut(name, blobOrText, { type, kind, replace }) → stores it, then offers it.
  K.saveOut = async function (name, data, opts) {
    opts = opts || {};
    const blob = data instanceof Blob ? data : new Blob([data], { type: opts.type || 'application/json' });
    const type = blob.type || opts.type || '';
    const kind = opts.kind || kindOf(name, type);
    const item = { id: 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, type, kind, size: blob.size, t: Date.now(), blob, meta: opts.meta || null };
    let stored = true, err = '';
    try {
      if (opts.replace) { const old = (await F.list()).filter((x) => x.kind === kind && x.name === name); for (const o of old) await F.remove(o.id); }
      await F.put(item);
    } catch (e) { stored = false; err = e && e.message ? e.message : String(e); }
    K.bus.emit('files');
    // Recordings always get the ready screen (it is the only reliable way to hand a
    // file to iOS: Share must come from a tap). Other files: a quiet download on
    // desktop, the ready screen on iPad / iPhone.
    if (kind === 'video' || isIOS || opts.dialog) readyDialog(item, { stored, err, fresh: true });
    else {
      F.download(item);
      // Private-browsing and blocked-storage pages keep the library in memory only; say so
      // instead of implying the file survives a reload.
      const where = !stored ? ' · not kept in Kiln Files' : F.persistent === false ? ' · kept in Kiln Files until this page reloads' : ' · also in File → Kiln Files';
      K.toast('Saved ' + name + where);
    }
    return item;
  };

  /* ---------------- ready / preview dialog ---------------- */
  function preview(item) {
    if (item.kind === 'video') { const v = h('video', { class: 'kf-preview', src: urlFor(item), controls: true, playsinline: true, 'webkit-playsinline': true, muted: true, autoplay: true, loop: true }); v.muted = true; v.playsInline = true; return v; }
    if (item.kind === 'image') return h('img', { class: 'kf-preview', src: urlFor(item), alt: item.name });
    if (item.kind === 'font') {
      const fam = (item.meta && item.meta.family) || item.name;
      return h('div', { class: 'kf-preview kf-icon', style: { fontFamily: '"' + fam + '", system-ui, sans-serif', fontSize: '26px', letterSpacing: '0.02em', color: '#f4f0e8' } }, fam + ' — Aa Bb Cc 123');
    }
    return h('div', { class: 'kf-preview kf-icon' }, item.kind === 'project' ? 'KILN PROJECT' : (item.name.split('.').pop() || 'FILE').toUpperCase());
  }
  function readyDialog(item, st) {
    st = st || {};
    UI.dialog((d, close) => {
      const share = F.canShare(item);
      const label = item.kind === 'video' ? 'Save Video / Share…' : item.kind === 'image' ? 'Save Image / Share…' : 'Save to Files / Share…';
      const status = st.fresh
        ? (st.stored ? (F.persistent === false ? 'Kept in Kiln Files for this session only. This page cannot store files permanently, so save it now.' : 'Kept in File → Kiln Files on this device, so it will not get lost. Saving it below puts it in Photos or the Files app.')
          : 'Could not keep a copy in Kiln Files (' + (st.err || 'storage full') + '). Save it now before closing this window.')
        : 'Stored in Kiln Files · ' + fmtDate(item.t);
      const tips = [];
      if (!share && isIOS) tips.push('The Share sheet is not available here. Try Download, or open Kiln in Safari, where Share and Download both work.');
      if (inAppWebView) tips.push('Inside apps such as Koder, Download usually does nothing. Use Save / Share, then pick Save Video or Save to Files.');
      if (item.kind === 'video' && /webm/i.test(item.type) && isIOS) tips.push('This is a WebM file, which Photos cannot import. Save it to Files instead.');
      d.append(...[
        h('h2', null, st.fresh ? (item.kind === 'video' ? 'Your recording is ready' : item.kind === 'project' ? 'Project saved' : 'Ready to save') : item.name),
        h('p', { class: 'sub' }, h('b', null, item.name), ' · ' + fmtSize(item.size)),
        preview(item),
        h('div', { class: 'note' }, status),
        tips.length ? h('div', { class: 'note kf-tip' }, tips.join(' ')) : null,
        h('div', { class: 'kf-actions' },
          share ? h('button', { class: 'btn primary', onclick: () => F.share(item) }, label) : null,
          h('button', { class: 'btn' + (share ? '' : ' primary'), onclick: () => F.download(item) }, 'Download'),
          item.kind !== 'project' ? h('button', { class: 'btn', onclick: () => F.openTab(item) }, 'Open in new tab') : h('button', { class: 'btn', onclick: () => { close(); F.openProject(item); } }, 'Open project'),
        ),
        h('div', { class: 'actions' },
          h('button', { class: 'btn ghost', onclick: () => { close(); F.openLibrary(); } }, 'All Kiln Files'),
          h('button', { class: 'btn', onclick: close }, 'Done'))].filter(Boolean));
    });
  }
  F.show = readyDialog;

  F.openProject = async function (item) {
    try {
      const data = JSON.parse(await item.blob.text());
      if (!data.ops) throw new Error('not a Kiln project');
      K.openProjectData(data, item.name);
    } catch (e) { K.toast('Could not open: ' + e.message); }
  };

  /* ---------------- library ---------------- */
  F.openLibrary = function () {
    UI.dialog((d, close) => {
      const list = h('div', { class: 'kf-list' }, h('div', { class: 'note' }, 'Loading…'));
      const foot = h('div', { class: 'note' });
      const filt = { v: 'all' };
      const tabs = h('div', { class: 'kf-tabs' });
      const TABS = [['all', 'All'], ['video', 'Videos'], ['image', 'Images'], ['project', 'Projects'], ['font', 'Fonts'], ['doc', 'Other']];
      async function render() {
        const items = await F.list();
        tabs.innerHTML = '';
        TABS.forEach(([k, l]) => { const n = k === 'all' ? items.length : items.filter((i) => i.kind === k).length;
          tabs.appendChild(h('button', { class: 'btn small' + (filt.v === k ? ' primary' : ''), onclick: () => { filt.v = k; render(); } }, l + ' ' + n)); });
        const shown = items.filter((i) => filt.v === 'all' || i.kind === filt.v);
        list.innerHTML = '';
        if (!shown.length) list.appendChild(h('div', { class: 'kf-empty' }, items.length ? 'Nothing in this category yet.' : 'No files yet. Recordings (Record), PNG exports and project saves (File → Save) will appear here.'));
        shown.forEach((it) => {
          const thumb = it.kind === 'video' ? (() => { const v = h('video', { src: urlFor(it) + '#t=0.1', muted: true, playsinline: true, preload: 'metadata' }); v.muted = true; return v; })()
            : it.kind === 'image' ? h('img', { src: urlFor(it), alt: '' }) : it.kind === 'font' ? h('span', { style: { fontFamily: '"' + ((it.meta && it.meta.family) || '') + '", sans-serif', fontSize: '15px', color: '#f4f0e8' } }, 'Aa') : h('span', null, it.kind === 'project' ? 'KILN' : (it.name.split('.').pop() || '').toUpperCase());
          const share = F.canShare(it);
          list.appendChild(h('div', { class: 'kf-row' },
            h('button', { class: 'kf-thumb', title: 'Preview', onclick: () => readyDialog(it) }, thumb),
            h('div', { class: 'kf-meta' }, h('b', null, it.name), h('small', null, fmtSize(it.size) + ' · ' + fmtDate(it.t))),
            h('div', { class: 'kf-btns' },
              it.kind === 'project' ? h('button', { class: 'btn small primary', onclick: () => { close(); F.openProject(it); } }, 'Open') : null,
              share ? h('button', { class: 'btn small' + (it.kind === 'project' ? '' : ' primary'), onclick: () => F.share(it) }, 'Save / Share') : null,
              h('button', { class: 'btn small', onclick: () => F.download(it) }, 'Download'),
              h('button', { class: 'btn small danger', title: 'Delete', onclick: async () => { if (window.confirm('Delete ' + it.name + ' from Kiln Files?')) { await F.remove(it.id); render(); } } }, 'Delete'))));
        });
        const total = items.reduce((s, i) => s + (i.size || 0), 0);
        const est = await F.usage();
        foot.textContent = items.length + ' file' + (items.length === 1 ? '' : 's') + ' · ' + fmtSize(total)
          + (est && est.quota ? ' · about ' + fmtSize(Math.max(0, est.quota - est.usage)) + ' free for Kiln' : '')
          + (F.persistent === false || (await db()) === null ? ' · this page can only keep files until it reloads' : '');
      }
      d.append(
        h('h2', null, 'Kiln Files'),
        h('p', { class: 'sub' }, 'Everything you record, export or save is kept here on this device. Use Save / Share to put a file in Photos or the Files app (on iPad: Save Video or Save to Files).'),
        tabs, list, foot,
        h('div', { class: 'actions' },
          h('button', { class: 'btn', onclick: async () => {
            const f = await U.pickFile('.ttf,.otf,.woff,.woff2,font/ttf,font/otf,font/woff,font/woff2');
            if (!f) return;
            try {
              const fam = await K.loadFontFile(f);
              K.toast('Loaded font "' + fam + '"');
              render();
              if (K.paramsUI) K.paramsUI.render(true);
            } catch (e) { K.toast('Could not load font: ' + (e.message || e)); }
          } }, 'Upload Font…'),
          h('button', { class: 'btn ghost danger', onclick: async () => { if (window.confirm('Delete every file in Kiln Files? This cannot be undone.')) { await F.clear(); render(); } } }, 'Delete all'),
          h('button', { class: 'btn', onclick: close }, 'Close')));
      render();
    }, { wide: true });
  };

  F.restoreFonts = async function () {
    try {
      const items = await F.list();
      for (const it of items) {
        if (it.kind === 'font' && it.blob && K.registerFontBuffer) {
          try {
            const buf = await it.blob.arrayBuffer();
            await K.registerFontBuffer(buf, it.name, it.meta && it.meta.family);
          } catch (e) {}
        }
      }
      if (K.paramsUI) K.paramsUI.render(true);
    } catch (e) {}
  };
})();
