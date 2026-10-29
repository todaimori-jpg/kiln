/* Kiln — sops.js : Surface Operators (geometry, point clouds, particles) */
(function () {
  'use strict';
  const K = window.K, U = K.util;
  let GEO_VER = 1;

  // geometry container
  function geo(pos, nrm, uv, idx, prim, col) {
    return { pos, nrm: nrm || new Float32Array(pos.length), uv: uv || new Float32Array((pos.length / 3) * 2), idx: idx || null, prim: prim || 'tris', col: col || null, ver: GEO_VER++ };
  }
  K.geo = geo;
  K.geoBounds = function (g) {
    if (g._b) return g._b;
    const mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < g.pos.length; i += 3) for (let k = 0; k < 3; k++) { const v = g.pos[i + k]; if (v < mn[k]) mn[k] = v; if (v > mx[k]) mx[k] = v; }
    if (!isFinite(mn[0])) { mn.fill(-1); mx.fill(1); }
    const c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
    const r = Math.max(0.001, Math.hypot(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2);
    return (g._b = { mn, mx, c, r });
  };
  function computeNormals(g) {
    const p = g.pos, n = new Float32Array(p.length), ix = g.idx;
    if (!ix) { g.nrm = n; return g; }
    for (let i = 0; i < ix.length; i += 3) {
      const a = ix[i] * 3, b = ix[i + 1] * 3, c = ix[i + 2] * 3;
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const j of [a, b, c]) { n[j] += nx; n[j + 1] += ny; n[j + 2] += nz; }
    }
    for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
    g.nrm = n;
    return g;
  }
  K.computeNormals = computeNormals;

  // parametric surface helper (u in [0,1] cols, v in [0,1] rows)
  function surface(cols, rows, fn) {
    const nv = (cols + 1) * (rows + 1);
    const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
    let k = 0;
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
      const u = c / cols, v = r / rows, o = fn(u, v);
      pos.set(o.p, k * 3); nrm.set(o.n, k * 3); uv[k * 2] = u; uv[k * 2 + 1] = v; k++;
    }
    const idx = new Uint32Array(cols * rows * 6);
    k = 0;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c, b = a + 1, d = a + cols + 1, e = d + 1;
      idx[k++] = a; idx[k++] = d; idx[k++] = b; idx[k++] = b; idx[k++] = d; idx[k++] = e;
    }
    return geo(pos, nrm, uv, idx);
  }

  // cache SOP output when its parameter signature + input versions are unchanged
  function cached(op, extraKey, build) {
    const pk = op.def.params.map((p) => JSON.stringify(K.par(op, p.name))).join('|');
    const ik = op.inputs.map((id) => { const o = id && K.getOp(id); return o && o.out ? o.out.ver : 0; }).join(',');
    const key = pk + '#' + ik + '#' + (extraKey || '');
    if (op.rt.key === key && op.out) return op.out;
    op.rt.key = key;
    return build();
  }
  K.sopCached = cached;

  const XFORM = (pg) => [
    { name: 'tx', label: 'Translate X', type: 'float', default: 0, min: -10, max: 10, row: 't', page: pg },
    { name: 'ty', label: 'Translate Y', type: 'float', default: 0, min: -10, max: 10, row: 't', page: pg },
    { name: 'tz', label: 'Translate Z', type: 'float', default: 0, min: -10, max: 10, row: 't', page: pg },
    { name: 'rx', label: 'Rotate X', type: 'float', default: 0, min: -360, max: 360, row: 'r', page: pg },
    { name: 'ry', label: 'Rotate Y', type: 'float', default: 0, min: -360, max: 360, row: 'r', page: pg },
    { name: 'rz', label: 'Rotate Z', type: 'float', default: 0, min: -360, max: 360, row: 'r', page: pg },
    { name: 'sx', label: 'Scale X', type: 'float', default: 1, min: 0, max: 10, row: 's', page: pg },
    { name: 'sy', label: 'Scale Y', type: 'float', default: 1, min: 0, max: 10, row: 's', page: pg },
    { name: 'sz', label: 'Scale Z', type: 'float', default: 1, min: 0, max: 10, row: 's', page: pg },
    { name: 'scale', label: 'Uniform Scale', type: 'float', default: 1, min: 0, max: 10, page: pg },
  ];
  K.XFORM = XFORM;
  K.xformMatrix = function (op) {
    const s = K.parNum(op, 'scale');
    return U.m4.trs([K.parNum(op, 'tx'), K.parNum(op, 'ty'), K.parNum(op, 'tz')], [K.parNum(op, 'rx'), K.parNum(op, 'ry'), K.parNum(op, 'rz')], [K.parNum(op, 'sx') * s, K.parNum(op, 'sy') * s, K.parNum(op, 'sz') * s]);
  };

  /* ---------------- generators ---------------- */
  K.defineOp({
    type: 'sphereSOP', label: 'Sphere', short: 'sphere', family: 'SOP', gen: true, help: 'UV sphere.',
    params: [
      { name: 'radius', label: 'Radius', type: 'float', default: 1, min: 0, max: 10 },
      { name: 'rows', label: 'Rows', type: 'int', default: 32, min: 3, max: 256 },
      { name: 'cols', label: 'Columns', type: 'int', default: 48, min: 3, max: 256 },
    ],
    cook: (op) => cached(op, '', () => {
      const R = K.parNum(op, 'radius');
      return surface(K.parNum(op, 'cols'), K.parNum(op, 'rows'), (u, v) => {
        const th = u * Math.PI * 2, ph = v * Math.PI;
        const n = [-Math.sin(ph) * Math.cos(th), -Math.cos(ph), Math.sin(ph) * Math.sin(th)];
        return { p: [n[0] * R, n[1] * R, n[2] * R], n };
      });
    }),
  });

  K.defineOp({
    type: 'boxSOP', label: 'Box', short: 'box', family: 'SOP', gen: true, help: 'Box with per-face normals.',
    params: [
      { name: 'sx', label: 'Size X', type: 'float', default: 1, min: 0, max: 10, row: 's' },
      { name: 'sy', label: 'Size Y', type: 'float', default: 1, min: 0, max: 10, row: 's' },
      { name: 'sz', label: 'Size Z', type: 'float', default: 1, min: 0, max: 10, row: 's' },
    ],
    cook: (op) => cached(op, '', () => {
      const hx = K.parNum(op, 'sx') / 2, hy = K.parNum(op, 'sy') / 2, hz = K.parNum(op, 'sz') / 2;
      const faces = [
        [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
        [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
        [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
      ];
      const pos = [], nrm = [], uv = [], idx = [];
      faces.forEach(([n, u, v], f) => {
        const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
        corners.forEach(([a, b]) => {
          pos.push((n[0] + u[0] * a + v[0] * b) * hx, (n[1] + u[1] * a + v[1] * b) * hy, (n[2] + u[2] * a + v[2] * b) * hz);
          nrm.push(...n); uv.push((a + 1) / 2, (b + 1) / 2);
        });
        const o = f * 4; idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
      });
      return geo(new Float32Array(pos), new Float32Array(nrm), new Float32Array(uv), new Uint32Array(idx));
    }),
  });

  K.defineOp({
    type: 'torusSOP', label: 'Torus', short: 'torus', family: 'SOP', gen: true, help: 'Torus / donut.',
    params: [
      { name: 'r1', label: 'Radius', type: 'float', default: 1, min: 0, max: 10 },
      { name: 'r2', label: 'Tube Radius', type: 'float', default: 0.35, min: 0, max: 5 },
      { name: 'rows', label: 'Rows', type: 'int', default: 32, min: 3, max: 256 },
      { name: 'cols', label: 'Columns', type: 'int', default: 64, min: 3, max: 512 },
    ],
    cook: (op) => cached(op, '', () => {
      const R = K.parNum(op, 'r1'), r = K.parNum(op, 'r2');
      return surface(K.parNum(op, 'cols'), K.parNum(op, 'rows'), (u, v) => {
        const a = u * Math.PI * 2, b = v * Math.PI * 2;
        const n = [Math.cos(a) * Math.cos(b), Math.sin(b), Math.sin(a) * Math.cos(b) * -1];
        return { p: [Math.cos(a) * (R + r * Math.cos(b)), r * Math.sin(b), -Math.sin(a) * (R + r * Math.cos(b))], n };
      });
    }),
  });

  K.defineOp({
    type: 'gridSOP', label: 'Grid', short: 'grid', family: 'SOP', gen: true, help: 'Subdivided plane — terrain, cloth, displacement.',
    params: [
      { name: 'w', label: 'Size X', type: 'float', default: 4, min: 0, max: 50, row: 's' },
      { name: 'h', label: 'Size Y', type: 'float', default: 4, min: 0, max: 50, row: 's' },
      { name: 'rows', label: 'Rows', type: 'int', default: 64, min: 1, max: 512 },
      { name: 'cols', label: 'Columns', type: 'int', default: 64, min: 1, max: 512 },
      { name: 'orient', label: 'Orientation', type: 'menu', options: ['XZ (floor)', 'XY (wall)'], default: 'XZ (floor)' },
    ],
    cook: (op) => cached(op, '', () => {
      const W = K.parNum(op, 'w'), H = K.parNum(op, 'h'), xy = K.par(op, 'orient') !== 'XZ (floor)';
      return surface(K.parNum(op, 'cols'), K.parNum(op, 'rows'), (u, v) => xy
        ? { p: [(u - 0.5) * W, (v - 0.5) * H, 0], n: [0, 0, 1] }
        : { p: [(u - 0.5) * W, 0, (0.5 - v) * H], n: [0, 1, 0] });
    }),
  });

  K.defineOp({
    type: 'tubeSOP', label: 'Tube', short: 'tube', family: 'SOP', gen: true, help: 'Cylinder or cone.',
    params: [
      { name: 'rtop', label: 'Top Radius', type: 'float', default: 0.5, min: 0, max: 10 },
      { name: 'rbot', label: 'Bottom Radius', type: 'float', default: 0.5, min: 0, max: 10 },
      { name: 'height', label: 'Height', type: 'float', default: 2, min: 0, max: 20 },
      { name: 'cols', label: 'Columns', type: 'int', default: 48, min: 3, max: 256 },
      { name: 'rows', label: 'Rows', type: 'int', default: 8, min: 1, max: 256 },
    ],
    cook: (op) => cached(op, '', () => {
      const rt = K.parNum(op, 'rtop'), rb = K.parNum(op, 'rbot'), h = K.parNum(op, 'height');
      const slope = (rb - rt) / (h || 1);
      return surface(K.parNum(op, 'cols'), K.parNum(op, 'rows'), (u, v) => {
        const a = u * Math.PI * 2, r = U.lerp(rb, rt, v);
        const n = [Math.cos(a), slope, -Math.sin(a)], l = Math.hypot(...n);
        return { p: [Math.cos(a) * r, (v - 0.5) * h, -Math.sin(a) * r], n: n.map((x) => x / l) };
      });
    }),
  });

  K.defineOp({
    type: 'pointcloudSOP', label: 'Point Cloud', short: 'points', family: 'SOP', gen: true,
    help: 'Procedural point cloud: box, sphere volume, sphere shell, galaxy spiral, or ring.',
    params: [
      { name: 'count', label: 'Points', type: 'int', default: 20000, min: 1, max: 1000000 },
      { name: 'dist', label: 'Distribution', type: 'menu', options: ['box', 'sphere', 'shell', 'galaxy', 'ring'], default: 'galaxy' },
      { name: 'size', label: 'Size', type: 'float', default: 2, min: 0, max: 20 },
      { name: 'seed', label: 'Seed', type: 'int', default: 1, min: 0, max: 9999 },
      { name: 'arms', label: 'Galaxy Arms', type: 'int', default: 3, min: 1, max: 12 },
      { name: 'colorize', label: 'Color by Position', type: 'toggle', default: true },
    ],
    cook: (op) => cached(op, '', () => {
      const n = K.parNum(op, 'count'), s = K.parNum(op, 'size'), r = U.mulberry(K.parNum(op, 'seed') + 1), d = K.par(op, 'dist'), arms = K.parNum(op, 'arms');
      const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        let x, y, z;
        if (d === 'box') { x = r() - 0.5; y = r() - 0.5; z = r() - 0.5; }
        else if (d === 'sphere' || d === 'shell') {
          const u = r() * 2 - 1, th = r() * Math.PI * 2, rad = d === 'shell' ? 0.5 : 0.5 * Math.cbrt(r());
          const q = Math.sqrt(1 - u * u); x = q * Math.cos(th) * rad; y = u * rad; z = q * Math.sin(th) * rad;
        } else if (d === 'galaxy') {
          const rad = Math.pow(r(), 1.6) * 0.5, arm = Math.floor(r() * arms), a = (arm / arms) * Math.PI * 2 + rad * 9;
          const sp = (r() - 0.5) * 0.12 * (1 - rad);
          x = Math.cos(a) * rad + sp; z = Math.sin(a) * rad + (r() - 0.5) * 0.12 * (1 - rad); y = (r() - 0.5) * 0.04 * (1 - rad * 1.5);
        } else { const a = r() * Math.PI * 2, rad = 0.4 + (r() - 0.5) * 0.08; x = Math.cos(a) * rad; z = Math.sin(a) * rad; y = (r() - 0.5) * 0.03; }
        pos[i * 3] = x * s; pos[i * 3 + 1] = y * s; pos[i * 3 + 2] = z * s;
        if (K.par(op, 'colorize')) { const t = Math.min(1, Math.hypot(x, y, z) * 2); col[i * 3] = 1 - t * 0.3; col[i * 3 + 1] = 0.55 + 0.35 * (1 - t); col[i * 3 + 2] = 0.4 + t * 0.6; }
        else col.fill(1, i * 3, i * 3 + 3);
      }
      return geo(pos, null, null, null, 'points', col);
    }),
  });

  /* ---------- File In SOP (OBJ, PLY, XYZ/CSV point clouds) ---------- */
  function parseOBJ(txt) {
    const v = [], vn = [], vt = [], pos = [], nrm = [], uv = [];
    let hasN = false;
    txt.split('\n').forEach((line) => {
      const p = line.trim().split(/\s+/);
      if (p[0] === 'v') v.push([+p[1], +p[2], +p[3]]);
      else if (p[0] === 'vn') vn.push([+p[1], +p[2], +p[3]]);
      else if (p[0] === 'vt') vt.push([+p[1], +p[2]]);
      else if (p[0] === 'f') {
        const vs = p.slice(1).map((s) => s.split('/').map((x) => parseInt(x, 10)));
        for (let i = 1; i < vs.length - 1; i++) [vs[0], vs[i], vs[i + 1]].forEach((f) => {
          const vi = f[0] < 0 ? v.length + f[0] : f[0] - 1;
          pos.push(...(v[vi] || [0, 0, 0]));
          const ti = f[1] ? (f[1] < 0 ? vt.length + f[1] : f[1] - 1) : -1; uv.push(...(vt[ti] || [0, 0]));
          const ni = f[2] ? (f[2] < 0 ? vn.length + f[2] : f[2] - 1) : -1; if (vn[ni]) { hasN = true; nrm.push(...vn[ni]); } else nrm.push(0, 0, 0);
        });
      }
    });
    if (!pos.length) return geo(new Float32Array(v.flat()), null, null, null, 'points');
    const idx = new Uint32Array(pos.length / 3).map((_, i) => i);
    const g = geo(new Float32Array(pos), new Float32Array(nrm), new Float32Array(uv), idx);
    if (!hasN) computeNormals(g);
    return g;
  }
  function parsePLY(buf) {
    const bytes = new Uint8Array(buf);
    let hdrEnd = 0; const dec = new TextDecoder();
    const head = dec.decode(bytes.slice(0, Math.min(bytes.length, 4096)));
    const ei = head.indexOf('end_header');
    if (ei < 0) throw new Error('Invalid PLY');
    hdrEnd = head.indexOf('\n', ei) + 1;
    const lines = head.slice(0, ei).split('\n');
    const fmt = (lines.find((l) => l.startsWith('format')) || '').split(' ')[1];
    let nv = 0, nf = 0, cur = null; const props = [];
    lines.forEach((l) => {
      const p = l.trim().split(/\s+/);
      if (p[0] === 'element') { cur = p[1]; if (cur === 'vertex') nv = +p[2]; if (cur === 'face') nf = +p[2]; }
      else if (p[0] === 'property' && cur === 'vertex') props.push({ type: p[1], name: p[2] });
    });
    const pos = new Float32Array(nv * 3), col = new Float32Array(nv * 3).fill(1);
    const ix = props.findIndex((p) => p.name === 'x'), ir = props.findIndex((p) => p.name === 'red' || p.name === 'r');
    const sizes = { float: 4, float32: 4, double: 8, uchar: 1, uint8: 1, char: 1, int: 4, uint: 4, short: 2, ushort: 2, int32: 4, uint32: 4 };
    if (fmt === 'ascii') {
      const body = dec.decode(bytes.slice(hdrEnd)).split('\n');
      for (let i = 0; i < nv; i++) {
        const p = body[i].trim().split(/\s+/).map(Number);
        pos[i * 3] = p[ix]; pos[i * 3 + 1] = p[ix + 1]; pos[i * 3 + 2] = p[ix + 2];
        if (ir >= 0) { col[i * 3] = p[ir] / 255; col[i * 3 + 1] = p[ir + 1] / 255; col[i * 3 + 2] = p[ir + 2] / 255; }
      }
    } else {
      const dv = new DataView(buf, hdrEnd), le = fmt === 'binary_little_endian';
      let o = 0;
      const rd = (t) => { let v; switch (t) { case 'float': case 'float32': v = dv.getFloat32(o, le); break; case 'double': v = dv.getFloat64(o, le); break; case 'uchar': case 'uint8': v = dv.getUint8(o); break; case 'char': v = dv.getInt8(o); break; case 'short': v = dv.getInt16(o, le); break; case 'ushort': v = dv.getUint16(o, le); break; case 'int': case 'int32': v = dv.getInt32(o, le); break; default: v = dv.getUint32(o, le); } o += sizes[t] || 4; return v; };
      for (let i = 0; i < nv; i++) {
        const vals = props.map((p) => rd(p.type));
        pos[i * 3] = vals[ix]; pos[i * 3 + 1] = vals[ix + 1]; pos[i * 3 + 2] = vals[ix + 2];
        if (ir >= 0) { col[i * 3] = vals[ir] / 255; col[i * 3 + 1] = vals[ir + 1] / 255; col[i * 3 + 2] = vals[ir + 2] / 255; }
      }
    }
    return geo(pos, null, null, null, 'points', col);
  }
  function parseXYZ(txt) {
    const pts = [], cols = [];
    txt.split('\n').forEach((l) => {
      const p = l.trim().split(/[\s,;]+/).map(Number);
      if (p.length >= 3 && p.slice(0, 3).every(isFinite)) {
        pts.push(p[0], p[1], p[2]);
        if (p.length >= 6) { const m = p[3] > 1 || p[4] > 1 || p[5] > 1 ? 255 : 1; cols.push(p[3] / m, p[4] / m, p[5] / m); } else cols.push(1, 1, 1);
      }
    });
    return geo(new Float32Array(pts), null, null, null, 'points', new Float32Array(cols));
  }
  K.defineOp({
    type: 'fileinSOP', label: 'File In', short: 'filein', family: 'SOP', gen: true,
    help: 'Import geometry: .obj meshes, .ply point clouds (ascii/binary), .xyz/.csv/.txt points.',
    params: [
      { name: 'file', label: 'File', type: 'file', accept: '.obj,.ply,.xyz,.csv,.txt,.pts', default: '' },
      { name: 'center', label: 'Center & Normalize', type: 'toggle', default: true },
      { name: 'size', label: 'Normalized Size', type: 'float', default: 2, min: 0.01, max: 50 },
    ],
    cook(op) {
      const m = K.media.get(K.par(op, 'file'));
      if (!m) { op.warn = 'Choose a .obj / .ply / .xyz file'; return null; }
      if (op.rt.src !== m.url) {
        op.rt.src = m.url; op.rt.raw = null;
        fetch(m.url).then((r) => r.arrayBuffer()).then((buf) => {
          const name = (m.name || '').toLowerCase();
          try {
            if (name.endsWith('.ply')) op.rt.raw = parsePLY(buf);
            else { const t = new TextDecoder().decode(buf); op.rt.raw = name.endsWith('.obj') ? parseOBJ(t) : parseXYZ(t); }
            op.rt.key = null;
          } catch (e) { op.rt.err = e.message; }
        });
      }
      if (op.rt.err) throw new Error(op.rt.err);
      if (!op.rt.raw) { op.warn = 'Loading…'; return null; }
      return cached(op, op.rt.raw.ver, () => {
        const g = op.rt.raw;
        if (!K.par(op, 'center')) return g;
        const b = K.geoBounds(g), s = K.parNum(op, 'size') / (b.r * 2);
        const p = new Float32Array(g.pos.length);
        for (let i = 0; i < p.length; i += 3) { p[i] = (g.pos[i] - b.c[0]) * s; p[i + 1] = (g.pos[i + 1] - b.c[1]) * s; p[i + 2] = (g.pos[i + 2] - b.c[2]) * s; }
        return geo(p, g.nrm, g.uv, g.idx, g.prim, g.col);
      });
    },
  });

  K.defineOp({
    type: 'choptoSOP', label: 'CHOP to SOP', short: 'chopto', family: 'SOP', gen: true,
    help: 'Turn channel samples (waveforms, spectra) into a line or ring of points.',
    params: [
      { name: 'chop', label: 'CHOP', type: 'op', family: 'CHOP', default: '' },
      { name: 'shape', label: 'Shape', type: 'menu', options: ['line', 'circle', 'spiral'], default: 'circle' },
      { name: 'width', label: 'Width / Radius', type: 'float', default: 1.5, min: 0, max: 20 },
      { name: 'amp', label: 'Amplitude', type: 'float', default: 0.8, min: 0, max: 20 },
    ],
    cook(op, ctx) {
      const o = ctx.refOut(op, 'chop', 'CHOP');
      let d = [0];
      if (o && o.chans && o.chans.length) d = o.chans[0].data.length > 1 ? o.chans[0].data : o.chans.map((c) => c.data[0]);
      else op.warn = 'Pick a CHOP';
      const n = d.length, w = K.parNum(op, 'width'), a = K.parNum(op, 'amp'), sh = K.par(op, 'shape');
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const t = n > 1 ? i / (n - 1) : 0, v = d[i] * a;
        if (sh === 'line') { pos[i * 3] = (t - 0.5) * w * 2; pos[i * 3 + 1] = v; }
        else { const ang = t * Math.PI * 2 * (sh === 'spiral' ? 4 : 1), r = (sh === 'spiral' ? w * t : w) + v; pos[i * 3] = Math.cos(ang) * r; pos[i * 3 + 1] = Math.sin(ang) * r; }
      }
      const idx = new Uint32Array(Math.max(0, (n - 1) * 2 + (sh === 'circle' ? 2 : 0)));
      for (let i = 0; i < n - 1; i++) { idx[i * 2] = i; idx[i * 2 + 1] = i + 1; }
      if (sh === 'circle' && n > 1) { idx[idx.length - 2] = n - 1; idx[idx.length - 1] = 0; }
      return geo(pos, null, null, idx, 'lines');
    },
  });

  /* ---------- Particle SOP ---------- */
  K.defineOp({
    type: 'particleSOP', label: 'Particle', short: 'particle', family: 'SOP', minInputs: 0, allowMissing: true,
    help: 'CPU particle system. Emits from input SOP points (or the origin) with gravity, drag, wind and turbulence.',
    params: [
      { name: 'rate', label: 'Birth Rate (/s)', type: 'float', default: 800, min: 0, max: 20000 },
      { name: 'life', label: 'Life (s)', type: 'float', default: 3, min: 0.1, max: 30 },
      { name: 'max', label: 'Max Particles', type: 'int', default: 20000, min: 10, max: 200000 },
      { name: 'speed', label: 'Initial Speed', type: 'float', default: 1.2, min: 0, max: 20 },
      { name: 'spread', label: 'Spread', type: 'float', default: 1, min: 0, max: 1 },
      { name: 'gravity', label: 'Gravity', type: 'float', default: -0.6, min: -10, max: 10, page: 'Forces' },
      { name: 'drag', label: 'Drag', type: 'float', default: 0.4, min: 0, max: 5, page: 'Forces' },
      { name: 'turb', label: 'Turbulence', type: 'float', default: 1.5, min: 0, max: 20, page: 'Forces' },
      { name: 'turbscale', label: 'Turbulence Scale', type: 'float', default: 1.2, min: 0.01, max: 10, page: 'Forces' },
      { name: 'windx', label: 'Wind X', type: 'float', default: 0, min: -10, max: 10, page: 'Forces', row: 'w' },
      { name: 'windy', label: 'Wind Y', type: 'float', default: 0, min: -10, max: 10, page: 'Forces', row: 'w' },
      { name: 'windz', label: 'Wind Z', type: 'float', default: 0, min: -10, max: 10, page: 'Forces', row: 'w' },
      { name: 'c1', label: 'Birth Color', type: 'color', default: '#fff2c9', page: 'Color' },
      { name: 'c2', label: 'Death Color', type: 'color', default: '#ff3d6e', page: 'Color' },
      { name: 'reset', label: 'Reset', type: 'pulse' },
    ],
    pulse(op, n) { if (n === 'reset') op.rt.ps = null; },
    cook(op, ctx) {
      const max = K.parNum(op, 'max');
      let ps = op.rt.ps;
      if (!ps || ps.max !== max) ps = op.rt.ps = { max, n: 0, p: new Float32Array(max * 3), v: new Float32Array(max * 3), age: new Float32Array(max), life: new Float32Array(max), acc: 0, r: U.mulberry(7) };
      const dt = K.time.playing ? Math.min(K.time.dt, 0.05) : 0;
      const src = ctx.input(op, 0);
      const life = K.parNum(op, 'life'), sp = K.parNum(op, 'speed'), spread = K.parNum(op, 'spread');
      ps.acc += K.parNum(op, 'rate') * dt;
      const r = ps.r;
      while (ps.acc >= 1 && ps.n < max) {
        ps.acc -= 1;
        const i = ps.n++;
        let ox = 0, oy = 0, oz = 0, nx = 0, ny = 1, nz = 0;
        if (src && src.pos.length) {
          const k = Math.floor(r() * (src.pos.length / 3)) * 3;
          ox = src.pos[k]; oy = src.pos[k + 1]; oz = src.pos[k + 2];
          if (src.nrm && (src.nrm[k] || src.nrm[k + 1] || src.nrm[k + 2])) { nx = src.nrm[k]; ny = src.nrm[k + 1]; nz = src.nrm[k + 2]; }
        }
        const u = r() * 2 - 1, th = r() * Math.PI * 2, q = Math.sqrt(1 - u * u);
        const rx = q * Math.cos(th), ry = u, rz = q * Math.sin(th);
        ps.p[i * 3] = ox; ps.p[i * 3 + 1] = oy; ps.p[i * 3 + 2] = oz;
        ps.v[i * 3] = U.lerp(nx, rx, spread) * sp; ps.v[i * 3 + 1] = U.lerp(ny, ry, spread) * sp; ps.v[i * 3 + 2] = U.lerp(nz, rz, spread) * sp;
        ps.age[i] = 0; ps.life[i] = life * (0.6 + r() * 0.8);
      }
      if (ps.acc > 1) ps.acc = 1;
      const g = K.parNum(op, 'gravity'), drag = K.parNum(op, 'drag'), tb = K.parNum(op, 'turb'), ts = K.parNum(op, 'turbscale');
      const wx = K.parNum(op, 'windx'), wy = K.parNum(op, 'windy'), wz = K.parNum(op, 'windz');
      const T = K.time.seconds * 0.3;
      for (let i = 0; i < ps.n; i++) {
        ps.age[i] += dt;
        if (ps.age[i] > ps.life[i]) { // kill: swap with last
          const j = --ps.n;
          ps.p.copyWithin(i * 3, j * 3, j * 3 + 3); ps.v.copyWithin(i * 3, j * 3, j * 3 + 3); ps.age[i] = ps.age[j]; ps.life[i] = ps.life[j];
          i--; continue;
        }
        const k = i * 3, x = ps.p[k], y = ps.p[k + 1], z = ps.p[k + 2];
        let fx = wx, fy = wy + g, fz = wz;
        if (tb > 0) { fx += U.noise3(x * ts, y * ts, T) * tb; fy += U.noise3(y * ts + 31, z * ts, T) * tb; fz += U.noise3(z * ts + 57, x * ts, T) * tb; }
        const dr = Math.max(0, 1 - drag * dt);
        ps.v[k] = (ps.v[k] + fx * dt) * dr; ps.v[k + 1] = (ps.v[k + 1] + fy * dt) * dr; ps.v[k + 2] = (ps.v[k + 2] + fz * dt) * dr;
        ps.p[k] += ps.v[k] * dt; ps.p[k + 1] += ps.v[k + 1] * dt; ps.p[k + 2] += ps.v[k + 2] * dt;
      }
      const c1 = U.hexToRgb(K.par(op, 'c1')), c2 = U.hexToRgb(K.par(op, 'c2'));
      const col = new Float32Array(ps.n * 3);
      for (let i = 0; i < ps.n; i++) { const t = ps.age[i] / ps.life[i], f = 1 - t * t; col[i * 3] = U.lerp(c1[0], c2[0], t) * f; col[i * 3 + 1] = U.lerp(c1[1], c2[1], t) * f; col[i * 3 + 2] = U.lerp(c1[2], c2[2], t) * f; }
      return geo(ps.p.slice(0, ps.n * 3), null, null, null, 'points', col);
    },
  });

  /* ---------------- filters ---------------- */
  K.defineOp({
    type: 'transformSOP', label: 'Transform', short: 'transform', family: 'SOP',
    help: 'Translate / rotate / scale geometry.',
    params: XFORM(),
    cook(op, ctx) {
      const g = ctx.input(op, 0);
      if (!g) return null;
      return cached(op, '', () => {
        const m = K.xformMatrix(op), nm = U.m4.normalMat(m);
        const p = new Float32Array(g.pos.length), n = new Float32Array(g.nrm.length);
        for (let i = 0; i < p.length; i += 3) {
          const x = g.pos[i], y = g.pos[i + 1], z = g.pos[i + 2];
          p[i] = m[0] * x + m[4] * y + m[8] * z + m[12]; p[i + 1] = m[1] * x + m[5] * y + m[9] * z + m[13]; p[i + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
          const a = g.nrm[i], b = g.nrm[i + 1], c = g.nrm[i + 2];
          let nx = nm[0] * a + nm[3] * b + nm[6] * c, ny = nm[1] * a + nm[4] * b + nm[7] * c, nz = nm[2] * a + nm[5] * b + nm[8] * c;
          const l = Math.hypot(nx, ny, nz) || 1; n[i] = nx / l; n[i + 1] = ny / l; n[i + 2] = nz / l;
        }
        return geo(p, n, g.uv, g.idx, g.prim, g.col);
      });
    },
  });

  K.defineOp({
    type: 'noiseSOP', label: 'Noise', short: 'noise', family: 'SOP',
    help: 'Displace points with 3D simplex noise — along normals or freely. Animate with Speed.',
    params: [
      { name: 'amp', label: 'Amplitude', type: 'float', default: 0.3, min: 0, max: 5 },
      { name: 'freq', label: 'Frequency', type: 'float', default: 1.5, min: 0, max: 20 },
      { name: 'speed', label: 'Speed', type: 'float', default: 0.3, min: -5, max: 5 },
      { name: 'oct', label: 'Harmonics', type: 'int', default: 2, min: 1, max: 6 },
      { name: 'normal', label: 'Along Normals', type: 'toggle', default: true },
      { name: 'renorm', label: 'Recompute Normals', type: 'toggle', default: true },
    ],
    cook(op, ctx) {
      const g = ctx.input(op, 0);
      if (!g) return null;
      const amp = K.parNum(op, 'amp'), f = K.parNum(op, 'freq'), oct = K.parNum(op, 'oct'), alongN = K.par(op, 'normal');
      const T = K.time.seconds * K.parNum(op, 'speed');
      return cached(op, T, () => {
        const p = new Float32Array(g.pos.length);
        for (let i = 0; i < p.length; i += 3) {
          const x = g.pos[i], y = g.pos[i + 1], z = g.pos[i + 2];
          if (alongN) {
            const d = U.fbm3(x * f + T, y * f, z * f - T * 0.5, oct, 0.5) * amp;
            p[i] = x + g.nrm[i] * d; p[i + 1] = y + g.nrm[i + 1] * d; p[i + 2] = z + g.nrm[i + 2] * d;
          } else {
            p[i] = x + U.fbm3(x * f + T, y * f, z * f, oct, 0.5) * amp;
            p[i + 1] = y + U.fbm3(x * f, y * f + T + 13, z * f, oct, 0.5) * amp;
            p[i + 2] = z + U.fbm3(x * f, y * f, z * f + T + 29, oct, 0.5) * amp;
          }
        }
        const out = geo(p, g.nrm, g.uv, g.idx, g.prim, g.col);
        if (K.par(op, 'renorm') && g.idx && g.prim === 'tris') computeNormals(out);
        return out;
      });
    },
  });

  K.defineOp({
    type: 'twistSOP', label: 'Twist', short: 'twist', family: 'SOP',
    help: 'Twist and taper geometry along Y.',
    params: [
      { name: 'twist', label: 'Twist (deg/unit)', type: 'float', default: 90, min: -1440, max: 1440 },
      { name: 'taper', label: 'Taper', type: 'float', default: 0, min: -2, max: 2 },
    ],
    cook(op, ctx) {
      const g = ctx.input(op, 0);
      if (!g) return null;
      return cached(op, '', () => {
        const tw = (K.parNum(op, 'twist') * Math.PI) / 180, tp = K.parNum(op, 'taper');
        const p = new Float32Array(g.pos.length);
        for (let i = 0; i < p.length; i += 3) {
          const x = g.pos[i], y = g.pos[i + 1], z = g.pos[i + 2], a = y * tw, s = 1 + y * tp, c = Math.cos(a), sn = Math.sin(a);
          p[i] = (x * c - z * sn) * s; p[i + 1] = y; p[i + 2] = (x * sn + z * c) * s;
        }
        const out = geo(p, g.nrm, g.uv, g.idx, g.prim, g.col);
        if (g.idx && g.prim === 'tris') computeNormals(out);
        return out;
      });
    },
  });

  K.defineOp({
    type: 'mergeSOP', label: 'Merge', short: 'merge', family: 'SOP', inputs: 'multi',
    help: 'Combine geometry from many SOPs (same primitive type).',
    params: [],
    cook(op) {
      const gs = op.inputs.filter(Boolean).map((id) => K.cook(K.getOp(id))).filter(Boolean);
      if (!gs.length) return null;
      if (gs.length === 1) return gs[0];
      return cached(op, gs.map((g) => g.ver).join(','), () => {
        const nv = gs.reduce((s, g) => s + g.pos.length / 3, 0);
        const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Float32Array(nv * 3).fill(1);
        const hasIdx = gs.every((g) => g.idx);
        const idx = hasIdx ? new Uint32Array(gs.reduce((s, g) => s + g.idx.length, 0)) : null;
        let vo = 0, io = 0;
        gs.forEach((g) => {
          pos.set(g.pos, vo * 3); nrm.set(g.nrm, vo * 3); uv.set(g.uv, vo * 2); if (g.col) col.set(g.col, vo * 3);
          if (hasIdx) { for (let i = 0; i < g.idx.length; i++) idx[io + i] = g.idx[i] + vo; io += g.idx.length; }
          vo += g.pos.length / 3;
        });
        return geo(pos, nrm, uv, idx, gs[0].prim, col);
      });
    },
  });

  K.defineOp({
    type: 'nullSOP', label: 'Null', short: 'null', family: 'SOP', help: 'Pass-through.', params: [],
    cook: (op, ctx) => ctx.input(op, 0),
  });
})();
