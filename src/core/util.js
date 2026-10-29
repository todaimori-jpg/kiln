/* Kiln — util.js : namespace, math, noise, helpers */
(function () {
  'use strict';
  const K = (window.K = window.K || {});
  K.version = '1.0.0';

  const U = (K.util = {});
  U.clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.fract = (v) => v - Math.floor(v);
  U.uid = (() => { let n = 0; return (p = 'id') => p + '_' + Date.now().toString(36) + '_' + (n++).toString(36); })();

  U.hexToRgb = function (hex) {
    if (Array.isArray(hex)) return hex;
    let h = String(hex || '#000000').replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16) || 0;
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };
  U.rgbToHex = function (r, g, b) {
    const f = (x) => ('0' + Math.round(U.clamp(x, 0, 1) * 255).toString(16)).slice(-2);
    return '#' + f(r) + f(g) + f(b);
  };
  U.hashStr = function (s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  };
  U.mulberry = function (seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  /* Delimited text (CSV/TSV) -> rows of cells. Handles "quoted, fields" and "" escapes.
     opt: 'auto' (detect) | 'none' (one cell per line) | 'comma' | 'semicolon' | 'tab' | 'pipe' */
  U.DELIMITERS = { comma: ',', semicolon: ';', tab: '\t', pipe: '|' };
  // Strips a leading BOM so detection and parsing see the same first line.
  const stripBom = (s) => (String(s == null ? '' : s).charCodeAt(0) === 0xFEFF ? String(s).slice(1) : String(s == null ? '' : s));
  U.detectDelimiter = function (text) {
    // Count candidates on the first line *outside* quotes, so a quoted field
    // containing a newline doesn't hide the delimiter from the leading line.
    const src = stripBom(text).slice(0, 65536).replace(/\r\n?/g, '\n');
    let bare = '', quoted = false;
    for (let i = 0; i < src.length && bare.length < 4096; i++) {
      const c = src[i];
      if (quoted) { if (c === '"') { if (src[i + 1] === '"') i++; else quoted = false; } }
      else if (c === '"') quoted = true;
      else bare += c;
    }
    const line = bare.split('\n').find((l) => l.trim() !== '');
    if (!line) return null;
    let best = null, hits = 0;
    Object.keys(U.DELIMITERS).forEach((k) => {
      const n = line.split(U.DELIMITERS[k]).length - 1;
      if (n > hits) { hits = n; best = U.DELIMITERS[k]; }
    });
    return best;
  };
  U.parseDelimited = function (text, opt) {
    const s = stripBom(text).replace(/\r\n?/g, '\n');
    const d = opt === 'none' ? null
      : opt && opt !== 'auto' ? (U.DELIMITERS[opt] || null)
      : (U.detectDelimiter(s) || (/^\s*"/.test(s) ? '\u0000' : null));
    if (!d) {
      const rows = s.split('\n');
      if (rows.length > 1 && rows[rows.length - 1] === '') rows.pop();
      return rows.map((l) => [l]);
    }
    const rows = [];
    let row = [], cell = '', quoted = false;
    for (let i = 0; i < s.length; i++) {
      const c = s[i];
      if (quoted) {
        if (c === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else quoted = false; }
        else cell += c;
      } else if (c === '"') quoted = true;
      else if (c === d) { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else cell += c;
    }
    row.push(cell); rows.push(row);
    if (rows.length > 1 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') rows.pop();
    return rows;
  };

  U.download = function (filename, blobOrText, type) {
    const blob = blobOrText instanceof Blob ? blobOrText : new Blob([blobOrText], { type: type || 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  };
  // File picker. The input is attached to the page (iOS Safari can drop the
  // selection from a detached input) and cleaned up afterwards.
  U.pickFile = function (accept) {
    return new Promise((res) => {
      const i = document.createElement('input');
      i.type = 'file';
      if (accept) i.accept = accept;
      i.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;';
      document.body.appendChild(i);
      let done = false;
      const finish = (f) => { if (done) return; done = true; res(f || null); setTimeout(() => i.remove(), 0); };
      i.addEventListener('change', () => finish(i.files && i.files[0]));
      i.addEventListener('cancel', () => finish(null));
      i.click();
    });
  };
  // What kind of media is this? Uses the MIME type, falling back to the file
  // extension (iOS often reports an empty type for .mov / .m4v / .heic).
  U.mediaKind = function (type, name) {
    type = String(type || '').toLowerCase(); name = String(name || '').toLowerCase().split('?')[0];
    if (/^video\//.test(type)) return 'video';
    if (/^audio\//.test(type)) return 'audio';
    if (/^image\//.test(type)) return 'image';
    if (/\.(mp4|m4v|mov|webm|ogv|mkv|avi|3gp|hevc)$/.test(name)) return 'video';
    if (/\.(mp3|wav|m4a|aac|ogg|oga|flac|aif|aiff|caf|opus)$/.test(name)) return 'audio';
    if (/^data:video/.test(name)) return 'video';
    if (/^data:audio/.test(name)) return 'audio';
    return 'image';
  };
  // Media elements that want to play. Browsers (iOS especially) only allow
  // play() during a tap/click, so on every gesture we retry pending ones.
  U.pendingPlay = new Set();
  U.tryPlay = function (el) {
    const p = el.play();
    if (p && p.then) p.then(() => U.pendingPlay.delete(el)).catch(() => U.pendingPlay.add(el));
    return p;
  };
  ['pointerdown', 'touchend', 'keydown', 'click'].forEach((ev) => window.addEventListener(ev, () => {
    U.pendingPlay.forEach((el) => { if (el._wantPlay) U.tryPlay(el); else U.pendingPlay.delete(el); });
  }, { capture: true }));
  // Hidden holder so video elements are part of the document (Safari decodes
  // frames more reliably for attached elements).
  U.mediaHolder = function () {
    let d = document.getElementById('kilnMedia');
    if (!d) {
      d = document.createElement('div'); d.id = 'kilnMedia'; d.setAttribute('aria-hidden', 'true');
      d.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;overflow:hidden;opacity:0.01;pointer-events:none;z-index:-1;';
      document.body.appendChild(d);
    }
    return d;
  };
  // One browser origin can host many Kilns: <user>.github.io serves every Pages project of
  // that account, so the autosave and settings keys are stamped with the top folder of the
  // path there. Custom domains, localhost and file:// keep the original unsuffixed keys.
  U.SCOPE = (function () {
    try {
      const l = window.location;
      if (!/^https?:$/.test(l.protocol)) return '';
      const host = (l.hostname || '').toLowerCase();
      const shared = ['github.io', 'netlify.app', 'vercel.app', 'pages.dev'];
      if (!shared.some((d) => host === d || host.endsWith('.' + d))) return '';
      const seg = decodeURIComponent((l.pathname || '').split('/').filter(Boolean)[0] || '');
      return seg ? '-' + seg.replace(/[^A-Za-z0-9._-]/g, '-').slice(0, 40) : '';
    } catch (e) { return ''; }
  })();
  U.store = {
    get(k) {
      if (!K.platform) return null;
      if (!U.SCOPE) return K.platform.storeGet(k);
      const v = K.platform.storeGet(k + U.SCOPE);
      return v === null ? K.platform.storeGet(k) : v;
    },
    set(k, v) { return K.platform ? K.platform.storeSet(k + U.SCOPE, v) : false; },
  };
  U.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- Simplex noise (2D/3D), Stefan Gustavson, public domain ---------- */
  const grad3 = new Float32Array([1,1,0,-1,1,0,1,-1,0,-1,-1,0,1,0,1,-1,0,1,1,0,-1,-1,0,-1,0,1,1,0,-1,1,0,1,-1,0,-1,-1]);
  const perm = new Uint8Array(512), permMod12 = new Uint8Array(512);
  (function () {
    const r = U.mulberry(1337), p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    for (let i = 0; i < 512; i++) { perm[i] = p[i & 255]; permMod12[i] = perm[i] % 12; }
  })();
  const F3 = 1 / 3, G3 = 1 / 6, F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
  U.noise2 = function (xin, yin) {
    let n0 = 0, n1 = 0, n2 = 0;
    const s = (xin + yin) * F2, i = Math.floor(xin + s), j = Math.floor(yin + s);
    const t = (i + j) * G2, x0 = xin - (i - t), y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0, j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2, x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;
    const ii = i & 255, jj = j & 255;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) { const g = permMod12[ii + perm[jj]] * 3; t0 *= t0; n0 = t0 * t0 * (grad3[g] * x0 + grad3[g + 1] * y0); }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) { const g = permMod12[ii + i1 + perm[jj + j1]] * 3; t1 *= t1; n1 = t1 * t1 * (grad3[g] * x1 + grad3[g + 1] * y1); }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) { const g = permMod12[ii + 1 + perm[jj + 1]] * 3; t2 *= t2; n2 = t2 * t2 * (grad3[g] * x2 + grad3[g + 1] * y2); }
    return 70 * (n0 + n1 + n2);
  };
  U.noise3 = function (xin, yin, zin) {
    let n0, n1, n2, n3;
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s), j = Math.floor(yin + s), k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t), y0 = yin - (j - t), z0 = zin - (k - t);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
      else if (x0 >= z0) { i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1; }
      else { i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1; }
    } else {
      if (y0 < z0) { i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1; }
      else if (x0 < z0) { i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1; }
      else { i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0; }
    }
    const x1 = x0 - i1 + G3, y1 = y0 - j1 + G3, z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3, y2 = y0 - j2 + 2 * G3, z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3, y3 = y0 - 1 + 3 * G3, z3 = z0 - 1 + 3 * G3;
    const ii = i & 255, jj = j & 255, kk = k & 255;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 < 0) n0 = 0; else { const g = permMod12[ii + perm[jj + perm[kk]]] * 3; t0 *= t0; n0 = t0 * t0 * (grad3[g] * x0 + grad3[g + 1] * y0 + grad3[g + 2] * z0); }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 < 0) n1 = 0; else { const g = permMod12[ii + i1 + perm[jj + j1 + perm[kk + k1]]] * 3; t1 *= t1; n1 = t1 * t1 * (grad3[g] * x1 + grad3[g + 1] * y1 + grad3[g + 2] * z1); }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 < 0) n2 = 0; else { const g = permMod12[ii + i2 + perm[jj + j2 + perm[kk + k2]]] * 3; t2 *= t2; n2 = t2 * t2 * (grad3[g] * x2 + grad3[g + 1] * y2 + grad3[g + 2] * z2); }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 < 0) n3 = 0; else { const g = permMod12[ii + 1 + perm[jj + 1 + perm[kk + 1]]] * 3; t3 *= t3; n3 = t3 * t3 * (grad3[g] * x3 + grad3[g + 1] * y3 + grad3[g + 2] * z3); }
    return 32 * (n0 + n1 + n2 + n3);
  };
  U.fbm3 = function (x, y, z, oct, rough) {
    let a = 1, f = 1, s = 0, n = 0;
    for (let i = 0; i < oct; i++) { s += a * U.noise3(x * f, y * f, z * f); n += a; a *= rough; f *= 2; }
    return s / n;
  };

  /* ---------- mat4 (column-major, like GL) ---------- */
  const M = (U.m4 = {});
  M.ident = () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);
  M.mul = function (a, b) {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  };
  M.persp = function (fovDeg, aspect, near, far) {
    const f = 1 / Math.tan((fovDeg * Math.PI) / 360), nf = 1 / (near - far);
    return new Float32Array([f / aspect,0,0,0, 0,f,0,0, 0,0,(far + near) * nf,-1, 0,0,2 * far * near * nf,0]);
  };
  M.ortho = function (w, h, near, far) {
    return new Float32Array([2 / w,0,0,0, 0,2 / h,0,0, 0,0,-2 / (far - near),0, 0,0,-(far + near) / (far - near),1]);
  };
  M.lookAt = function (e, c, up) {
    let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2];
    let l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return new Float32Array([xx,yx,zx,0, xy,yy,zy,0, xz,yz,zz,0,
      -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]);
  };
  M.trs = function (t, rDeg, s) {
    const d = Math.PI / 180;
    const cx = Math.cos(rDeg[0] * d), sx = Math.sin(rDeg[0] * d);
    const cy = Math.cos(rDeg[1] * d), sy = Math.sin(rDeg[1] * d);
    const cz = Math.cos(rDeg[2] * d), sz = Math.sin(rDeg[2] * d);
    // R = Rz * Ry * Rx
    const r00 = cz * cy, r01 = cz * sy * sx - sz * cx, r02 = cz * sy * cx + sz * sx;
    const r10 = sz * cy, r11 = sz * sy * sx + cz * cx, r12 = sz * sy * cx - cz * sx;
    const r20 = -sy, r21 = cy * sx, r22 = cy * cx;
    return new Float32Array([r00 * s[0], r10 * s[0], r20 * s[0], 0, r01 * s[1], r11 * s[1], r21 * s[1], 0,
      r02 * s[2], r12 * s[2], r22 * s[2], 0, t[0], t[1], t[2], 1]);
  };
  M.normalMat = function (m) {
    // inverse-transpose of upper 3x3
    const a = m[0], b = m[1], c = m[2], d = m[4], e = m[5], f = m[6], g = m[8], h = m[9], i = m[10];
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C || 1e-9, id = 1 / det;
    return new Float32Array([A * id, B * id, C * id, -(b * i - c * h) * id, (a * i - c * g) * id, -(a * h - b * g) * id,
      (b * f - c * e) * id, -(a * f - c * d) * id, (a * e - b * d) * id]);
  };
  M.xformPoint = function (m, x, y, z) {
    return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];
  };
})();
