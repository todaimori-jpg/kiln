/* Kiln — render.js : 3D renderer, MATs, COMPs (geometry/camera/light/panels/base), Render TOP */
(function () {
  'use strict';
  const K = window.K, U = K.util, E = K.gl, M = U.m4;

  /* ---------------- shaders ---------------- */
  const VS3 = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec2 aUV;
layout(location=3) in vec4 aInst; layout(location=4) in vec3 aCol; layout(location=5) in vec3 aInstCol;
uniform mat4 uModel; uniform mat4 uView; uniform mat4 uProj; uniform mat3 uNrmM; uniform float uPointSize; uniform float uViewH; uniform float uInstScale;
out vec3 vWPos; out vec3 vN; out vec2 vUV; out vec3 vCol;
void main(){ vec3 p=aPos*(aInst.w*uInstScale)+aInst.xyz; vec4 w=uModel*vec4(p,1.0); vWPos=w.xyz; vN=normalize(uNrmM*aNrm); vUV=aUV; vCol=aCol*aInstCol;
 gl_Position=uProj*uView*w; gl_PointSize=clamp(uPointSize*uViewH/(gl_Position.w*120.0),1.0,128.0); }`;

  const FS3_HEAD = `#version 300 es
precision highp float;
in vec3 vWPos; in vec3 vN; in vec2 vUV; in vec3 vCol; out vec4 fragColor;
uniform vec3 uCamPos; uniform int uNumLights; uniform vec4 uLightPos[4]; uniform vec3 uLightCol[4]; uniform vec3 uAmbient;
uniform int uPrim; uniform float uTime; uniform sampler2D sMap; uniform int uHasMap;
#define PI 3.14159265359
vec3 N_(){ vec3 n=normalize(vN); if(!gl_FrontFacing) n=-n; return n; }
vec3 L_(int i){ return uLightPos[i].w>0.5 ? normalize(-uLightPos[i].xyz) : normalize(uLightPos[i].xyz-vWPos); }
float att_(int i){ if(uLightPos[i].w>0.5) return 1.0; float d=length(uLightPos[i].xyz-vWPos); return 1.0/(1.0+0.02*d*d); }
void pointDiscard(){ if(uPrim==2){ vec2 c=gl_PointCoord-0.5; if(dot(c,c)>0.25) discard; } }
vec4 mapC(){ return uHasMap==1 ? texture(sMap,vUV) : vec4(1.0); }
`;
  const MAT_FS = {
    constant: `uniform vec4 uColor; uniform int uSoftPts;
void main(){ pointDiscard(); vec4 c=uColor*mapC()*vec4(vCol,1.0);
 if(uPrim==2&&uSoftPts==1){ vec2 q=gl_PointCoord-0.5; c.a*=smoothstep(0.25,0.0,dot(q,q)); }
 fragColor=c; }`,
    phong: `uniform vec3 uDiff; uniform vec3 uSpec; uniform float uShine; uniform vec3 uEmit; uniform float uAlpha;
void main(){ pointDiscard(); vec3 n=N_(); vec3 v=normalize(uCamPos-vWPos); vec4 m=mapC(); vec3 base=uDiff*m.rgb*vCol; vec3 c=uAmbient*base+uEmit;
 for(int i=0;i<4;i++){ if(i>=uNumLights) break; vec3 l=L_(i); float a=att_(i); float d=max(dot(n,l),0.0); vec3 h=normalize(l+v); float s=pow(max(dot(n,h),0.0),uShine)*step(0.0,d);
  c+=(base*d+uSpec*s)*uLightCol[i]*a; }
 fragColor=vec4(c,uAlpha*m.a); }`,
    pbr: `uniform vec3 uBase; uniform float uMetal; uniform float uRough; uniform vec3 uEmit; uniform vec3 uSky; uniform vec3 uGround; uniform float uAlpha;
float D_GGX(float nh,float r){ float a=r*r; float a2=a*a; float d=nh*nh*(a2-1.0)+1.0; return a2/(PI*d*d); }
float G_S(float nv,float nl,float r){ float k=(r+1.0)*(r+1.0)/8.0; return (nv/(nv*(1.0-k)+k))*(nl/(nl*(1.0-k)+k)); }
vec3 F_S(float c,vec3 f0){ return f0+(1.0-f0)*pow(1.0-c,5.0); }
void main(){ pointDiscard(); vec3 n=N_(); vec3 v=normalize(uCamPos-vWPos); vec4 m=mapC(); vec3 alb=uBase*m.rgb*vCol; float r=clamp(uRough,0.04,1.0);
 vec3 f0=mix(vec3(0.04),alb,uMetal); vec3 Lo=vec3(0.0); float nv=max(dot(n,v),1e-4);
 for(int i=0;i<4;i++){ if(i>=uNumLights) break; vec3 l=L_(i); vec3 h=normalize(v+l); float nl=max(dot(n,l),0.0); float nh=max(dot(n,h),0.0);
  vec3 F=F_S(max(dot(h,v),0.0),f0); vec3 spec=D_GGX(nh,r)*G_S(nv,nl,r)*F/(4.0*nv*nl+1e-4); vec3 kd=(1.0-F)*(1.0-uMetal);
  Lo+=(kd*alb/PI+spec)*uLightCol[i]*att_(i)*nl*PI; }
 vec3 env=mix(uGround,uSky,n.y*0.5+0.5); vec3 Fa=F_S(nv,f0); vec3 refl=mix(uGround,uSky,reflect(-v,n).y*0.5+0.5);
 vec3 amb=(1.0-Fa)*(1.0-uMetal)*alb*env*uAmbient*2.0 + Fa*refl*(1.0-r*0.7)*uAmbient*2.0;
 vec3 c=Lo+amb+uEmit; c=c/(1.0+c*0.15); fragColor=vec4(c,uAlpha*m.a); }`,
    normal: `void main(){ pointDiscard(); fragColor=vec4(N_()*0.5+0.5,1.0); }`,
  };

  const progs = {};
  function matProgram(kind, customBody) {
    const key = kind + (customBody ? K.util.hashStr(customBody) : '');
    if (progs[key]) return progs[key];
    const fs = FS3_HEAD + (customBody || MAT_FS[kind]);
    const p = E.program('mat_' + key, fs, { raw: true, vs: VS3, lineOffset: FS3_HEAD.split('\n').length - 1 });
    progs[key] = p;
    return p;
  }

  /* ---------------- GPU geometry ---------------- */
  let R_sweep = null;
  const gpuCache = new WeakMap();
  function gpuGeo(g) {
    let c = gpuCache.get(g);
    if (c) return c;
    const gl = E.gl;
    c = { vao: gl.createVertexArray(), bufs: [] };
    gl.bindVertexArray(c.vao);
    const attr = (loc, data, size) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); c.bufs.push(b); };
    attr(0, g.pos, 3); attr(1, g.nrm, 3); attr(2, g.uv, 2);
    if (g.col) attr(4, g.col, 3);
    c.count = g.pos.length / 3;
    if (g.idx) {
      const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, g.idx, gl.STATIC_DRAW);
      c.ib = ib; c.icount = g.idx.length; c.bufs.push(ib);
    }
    gl.bindVertexArray(null);
    c.hasCol = !!g.col;
    gpuCache.set(g, c);
    track(g, gpuCache, c.bufs, [c.vao]);
    return c;
  }
  // GPU resource sweep: free buffers for geometry not drawn in the last ~2 seconds
  const live = new Map(); // geo -> [{map,bufs,vaos}]
  const lastUse = new Map();
  function track(g, map, bufs, vaos) { if (!live.has(g)) live.set(g, []); live.get(g).push({ map, bufs, vaos: vaos || [] }); lastUse.set(g, K.frameId); }
  function touch(g) { if (live.has(g)) lastUse.set(g, K.frameId); }
  R_sweep = function () {
    const gl = E.gl, cutoff = K.frameId - 120;
    live.forEach((list, g) => {
      if ((lastUse.get(g) || 0) < cutoff) {
        list.forEach((e) => { e.bufs.forEach((b) => gl.deleteBuffer(b)); e.vaos.forEach((v) => gl.deleteVertexArray(v)); e.map.delete(g); });
        live.delete(g); lastUse.delete(g);
      }
    });
  };
  // wireframe line indices from triangles
  const wireCache = new WeakMap();
  function wireIdx(g) {
    if (wireCache.has(g)) return wireCache.get(g);
    const gl = E.gl;
    let lines;
    if (g.idx && g.prim === 'tris') {
      const set = new Set(), arr = [];
      for (let i = 0; i < g.idx.length; i += 3) for (let k = 0; k < 3; k++) {
        const a = g.idx[i + k], b = g.idx[i + ((k + 1) % 3)], key = a < b ? a * 4194304 + b : b * 4194304 + a;
        if (!set.has(key)) { set.add(key); arr.push(a, b); }
      }
      lines = new Uint32Array(arr);
    } else lines = g.idx || new Uint32Array(0);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, lines, gl.STATIC_DRAW);
    const w = { ib: b, count: lines.length };
    wireCache.set(g, w);
    track(g, wireCache, [b]);
    return w;
  }
  // instance buffer from a SOP
  const instCache = new WeakMap();
  function instBuf(g, scaleAttr) {
    if (instCache.has(g)) return instCache.get(g);
    const gl = E.gl, n = g.pos.length / 3, d = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) { d[i * 4] = g.pos[i * 3]; d[i * 4 + 1] = g.pos[i * 3 + 1]; d[i * 4 + 2] = g.pos[i * 3 + 2]; d[i * 4 + 3] = 1; }
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, d, gl.STATIC_DRAW);
    let cb = null;
    if (g.col) { cb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, cb); gl.bufferData(gl.ARRAY_BUFFER, g.col, gl.STATIC_DRAW); }
    const o = { b, cb, n };
    instCache.set(g, o);
    track(g, instCache, cb ? [b, cb] : [b]);
    return o;
  }

  /* ---------------- scene rendering ---------------- */
  const R = (K.r3d = {});
  R.sweep = () => R_sweep && R_sweep();
  // scene: {view, proj, camPos, items:[{geo, model, mat, inst, prim, pointSize, blend, instScale}], lights:[{pos:[x,y,z,w], col}], ambient, bg:[r,g,b,a], target}
  R.render = function (scene, target, ms) {
    const gl = E.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, ms ? target.msFbo : target.fbo);
    gl.viewport(0, 0, target.w, target.h);
    gl.clearColor(scene.bg[0], scene.bg[1], scene.bg[2], scene.bg[3]);
    gl.clearDepth(1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    const lights = scene.lights.length ? scene.lights : [{ pos: [-0.4, -0.7, -0.6, 1], col: [1, 1, 1] }];
    const lp = new Float32Array(16), lc = new Float32Array(12);
    lights.slice(0, 4).forEach((l, i) => { lp.set(l.pos, i * 4); lc.set(l.col, i * 3); });
    // sort: opaque first, then blended
    const items = scene.items.slice().sort((a, b) => (a.blend === 'opaque' ? 0 : 1) - (b.blend === 'opaque' ? 0 : 1));
    items.forEach((it) => {
      if (!it.geo || !it.geo.pos || !it.geo.pos.length) return;
      const mat = it.mat || { kind: 'phong', u: { uDiff: [0.8, 0.8, 0.82], uSpec: [0.4, 0.4, 0.4], uShine: 40, uEmit: [0, 0, 0], uAlpha: 1 }, map: null };
      let prog;
      try { prog = matProgram(mat.kind, mat.custom); } catch (e) { if (mat.op) mat.op.error = e.message; return; }
      gl.useProgram(prog.p);
      const prim = it.prim === 'auto' ? (it.geo.prim === 'points' ? 'points' : it.geo.prim === 'lines' ? 'lines' : mat.wire ? 'lines' : 'tris') : it.prim;
      const u = Object.assign({
        uModel: it.model, uView: scene.view, uProj: scene.proj, uNrmM: M.normalMat(it.model), uPointSize: it.pointSize || 2, uViewH: target.h,
        uCamPos: scene.camPos, uNumLights: Math.min(4, lights.length), uLightPos: lp, uLightCol: lc, uAmbient: scene.ambient,
        uPrim: prim === 'points' ? 2 : prim === 'lines' ? 1 : 0, uTime: K.time.seconds, uHasMap: mat.map ? 1 : 0, sMap: mat.map, uInstScale: it.inst ? it.instScale : 1,
      }, mat.u);
      setU(prog, u);
      // blending
      if (it.blend === 'add') { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE); gl.depthMask(false); }
      else if (it.blend === 'alpha') { gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); }
      else { gl.disable(gl.BLEND); gl.depthMask(true); }
      if (it.cull) { gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); } else gl.disable(gl.CULL_FACE);
      const g = gpuGeo(it.geo);
      touch(it.geo); if (it.inst) touch(it.inst);
      gl.bindVertexArray(g.vao);
      if (!g.hasCol) { gl.disableVertexAttribArray(4); gl.vertexAttrib3f(4, 1, 1, 1); }
      let instN = 0;
      if (it.inst && it.inst.pos && it.inst.pos.length) {
        const ib = instBuf(it.inst);
        gl.bindBuffer(gl.ARRAY_BUFFER, ib.b); gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(3, 1);
        if (ib.cb) { gl.bindBuffer(gl.ARRAY_BUFFER, ib.cb); gl.enableVertexAttribArray(5); gl.vertexAttribPointer(5, 3, gl.FLOAT, false, 0, 0); gl.vertexAttribDivisor(5, 1); }
        else { gl.disableVertexAttribArray(5); gl.vertexAttrib3f(5, 1, 1, 1); }
        instN = ib.n;
      } else {
        gl.disableVertexAttribArray(3); gl.vertexAttrib4f(3, 0, 0, 0, 1);
        gl.disableVertexAttribArray(5); gl.vertexAttrib3f(5, 1, 1, 1);
      }
      const mode = prim === 'points' ? gl.POINTS : prim === 'lines' ? gl.LINES : gl.TRIANGLES;
      if (prim === 'points') {
        instN ? gl.drawArraysInstanced(mode, 0, g.count, instN) : gl.drawArrays(mode, 0, g.count);
      } else if (prim === 'lines' && it.geo.prim === 'tris') {
        const w = wireIdx(it.geo);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, w.ib);
        instN ? gl.drawElementsInstanced(mode, w.count, gl.UNSIGNED_INT, 0, instN) : gl.drawElements(mode, w.count, gl.UNSIGNED_INT, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.ib || null);
      } else if (g.ib) {
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, g.ib);
        instN ? gl.drawElementsInstanced(mode, g.icount, gl.UNSIGNED_INT, 0, instN) : gl.drawElements(mode, g.icount, gl.UNSIGNED_INT, 0);
      } else {
        instN ? gl.drawArraysInstanced(mode, 0, g.count, instN) : gl.drawArrays(mode, 0, g.count);
      }
      if (instN) { gl.vertexAttribDivisor(3, 0); gl.vertexAttribDivisor(5, 0); gl.disableVertexAttribArray(3); gl.disableVertexAttribArray(5); }
      gl.bindVertexArray(null);
    });
    gl.disable(gl.BLEND); gl.depthMask(true); gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
    if (ms) E.resolveMS(target);
  };
  function setU(prog, u) {
    const gl = E.gl;
    let unit = 0;
    prog.u.forEach((info, name) => {
      const v = u[name];
      if (info.type === gl.SAMPLER_2D) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, (v && v.tex) || E.black.tex); gl.uniform1i(info.loc, unit); unit++; return; }
      if (v === undefined) return;
      if (info.type === gl.FLOAT_VEC4) gl.uniform4fv(info.loc, v);
      else if (info.type === gl.FLOAT_VEC3) gl.uniform3fv(info.loc, v);
      else if (info.type === gl.FLOAT_VEC2) gl.uniform2fv(info.loc, v);
      else if (info.type === gl.FLOAT_MAT4) gl.uniformMatrix4fv(info.loc, false, v);
      else if (info.type === gl.FLOAT_MAT3) gl.uniformMatrix3fv(info.loc, false, v);
      else if (info.type === gl.FLOAT) gl.uniform1f(info.loc, v);
      else gl.uniform1i(info.loc, v | 0);
    });
  }

  // Preview (thumbnail) of geometry with auto-framing camera
  R.preview = function (op, g, mat, w, h, key) {
    key = key || 'thumb';
    op.rt[key] = E.ensureMS(op.rt[key], w, h, 4);
    const b = K.geoBounds(g);
    const a = K.time.absSeconds * 0.4, d = b.r * 2.6;
    const eye = [b.c[0] + Math.sin(a) * d, b.c[1] + b.r * 0.8, b.c[2] + Math.cos(a) * d];
    const scene = {
      view: M.lookAt(eye, b.c, [0, 1, 0]), proj: M.persp(40, w / h, d * 0.05, d * 10), camPos: eye,
      items: [{ geo: g, model: M.ident(), mat, prim: 'auto', pointSize: 2.5, blend: g.prim === 'points' ? 'add' : 'opaque' }],
      lights: [{ pos: [eye[0] + b.r, eye[1] + b.r * 2, eye[2], 0], col: [1, 1, 1] }], ambient: [0.22, 0.22, 0.25], bg: [0.08, 0.08, 0.1, 1],
    };
    scene.lights[0].pos = [-(eye[0] - b.c[0]) - b.r, -(eye[1] - b.c[1]) - b.r, -(eye[2] - b.c[2]), 1];
    R.render(scene, op.rt[key], true);
    return op.rt[key];
  };

  /* ================= MATs ================= */
  const MAPPARAM = { name: 'map', label: 'Color Map (TOP)', type: 'op', family: 'TOP', default: '' };
  function matDef(def) {
    def.family = 'MAT'; def.gen = true;
    const cookFn = def.build;
    def.cook = function (op, ctx) {
      const m = cookFn(op, ctx);
      m.op = op;
      const mapOp = ctx.ref(op, 'map', 'TOP');
      m.map = mapOp ? K.cook(mapOp) : null;
      return m;
    };
    return K.defineOp(def);
  }
  matDef({
    type: 'constantMAT', label: 'Constant', short: 'constant', help: 'Unlit flat color — great for points, lines, glowing shapes.',
    params: [
      { name: 'color', label: 'Color', type: 'color', default: '#ffffff' },
      { name: 'alpha', label: 'Alpha', type: 'float', default: 1, min: 0, max: 1 },
      { name: 'softpts', label: 'Soft Points', type: 'toggle', default: true },
      MAPPARAM,
    ],
    build: (op) => { const c = U.hexToRgb(K.par(op, 'color')); return { kind: 'constant', u: { uColor: [c[0], c[1], c[2], K.parNum(op, 'alpha')], uSoftPts: K.par(op, 'softpts') ? 1 : 0 } }; },
  });
  matDef({
    type: 'wireframeMAT', label: 'Wireframe', short: 'wireframe', help: 'Draws mesh edges as lines.',
    params: [{ name: 'color', label: 'Color', type: 'color', default: '#9fe8ff' }, { name: 'alpha', label: 'Alpha', type: 'float', default: 1, min: 0, max: 1 }, MAPPARAM],
    build: (op) => { const c = U.hexToRgb(K.par(op, 'color')); return { kind: 'constant', wire: true, u: { uColor: [c[0], c[1], c[2], K.parNum(op, 'alpha')], uSoftPts: 0 } }; },
  });
  matDef({
    type: 'phongMAT', label: 'Phong', short: 'phong', help: 'Classic diffuse + specular shading.',
    params: [
      { name: 'diff', label: 'Diffuse', type: 'color', default: '#c9c4bb' },
      { name: 'spec', label: 'Specular', type: 'color', default: '#ffffff' },
      { name: 'shine', label: 'Shininess', type: 'float', default: 40, min: 1, max: 256 },
      { name: 'emit', label: 'Emit', type: 'color', default: '#000000' },
      { name: 'alpha', label: 'Alpha', type: 'float', default: 1, min: 0, max: 1 },
      MAPPARAM,
    ],
    build: (op) => ({ kind: 'phong', u: { uDiff: U.hexToRgb(K.par(op, 'diff')), uSpec: U.hexToRgb(K.par(op, 'spec')), uShine: K.parNum(op, 'shine'), uEmit: U.hexToRgb(K.par(op, 'emit')), uAlpha: K.parNum(op, 'alpha') } }),
  });
  matDef({
    type: 'pbrMAT', label: 'PBR', short: 'pbr', help: 'Physically based: base color, metallic, roughness, with sky/ground environment light.',
    params: [
      { name: 'base', label: 'Base Color', type: 'color', default: '#d8d2c6' },
      { name: 'metal', label: 'Metallic', type: 'float', default: 0.0, min: 0, max: 1 },
      { name: 'rough', label: 'Roughness', type: 'float', default: 0.35, min: 0, max: 1 },
      { name: 'emit', label: 'Emit', type: 'color', default: '#000000' },
      { name: 'sky', label: 'Env Sky', type: 'color', default: '#9db4d8', page: 'Environment' },
      { name: 'ground', label: 'Env Ground', type: 'color', default: '#2a2522', page: 'Environment' },
      { name: 'alpha', label: 'Alpha', type: 'float', default: 1, min: 0, max: 1 },
      MAPPARAM,
    ],
    build: (op) => ({ kind: 'pbr', u: { uBase: U.hexToRgb(K.par(op, 'base')), uMetal: K.parNum(op, 'metal'), uRough: K.parNum(op, 'rough'), uEmit: U.hexToRgb(K.par(op, 'emit')), uSky: U.hexToRgb(K.par(op, 'sky')), uGround: U.hexToRgb(K.par(op, 'ground')), uAlpha: K.parNum(op, 'alpha') } }),
  });
  matDef({
    type: 'normalMAT', label: 'Normal', short: 'normal', help: 'Visualize surface normals as color.',
    params: [], build: () => ({ kind: 'normal', u: {} }),
  });
  const DEFAULT_GLSLMAT = `// Custom surface shader. Available: vWPos, vN, vUV, vCol, uTime, uCamPos, N_(), mapC(), u0..u1, uC0
uniform float u0; uniform float u1; uniform vec3 uC0;
void main(){
  pointDiscard();
  vec3 n = N_();
  vec3 v = normalize(uCamPos - vWPos);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 2.0 + u1*4.0);
  vec3 iri = 0.5 + 0.5*cos(6.2831*(vec3(0.0,0.33,0.67) + dot(n, v)*1.5 + uTime*0.1 + u0));
  fragColor = vec4(mix(uC0*0.15, iri, fres) + fres*0.4, 1.0);
}`;
  matDef({
    type: 'glslMAT', label: 'GLSL', short: 'glslmat', help: 'Write your own surface fragment shader.',
    params: [
      { name: 'code', label: 'Fragment Shader', type: 'code', lang: 'glsl', default: DEFAULT_GLSLMAT },
      { name: 'u0', label: 'u0', type: 'float', default: 0, min: 0, max: 1, page: 'Uniforms' },
      { name: 'u1', label: 'u1', type: 'float', default: 0.5, min: 0, max: 1, page: 'Uniforms' },
      { name: 'c0', label: 'uC0', type: 'color', default: '#1b3a6b', page: 'Uniforms' },
      MAPPARAM,
    ],
    build: (op) => {
      const code = String(K.par(op, 'code'));
      matProgram('glsl', code); // throws -> op error
      return { kind: 'glsl', custom: code, u: { u0: K.parNum(op, 'u0'), u1: K.parNum(op, 'u1'), uC0: U.hexToRgb(K.par(op, 'c0')) } };
    },
  });

  /* ================= COMPs ================= */
  K.defineOp({
    type: 'geometryCOMP', label: 'Geometry', short: 'geo', family: 'COMP', gen: true, inputs: 0,
    help: 'A renderable 3D object: links a SOP + MAT with a transform. Set Instance SOP to copy it onto every point (GPU instancing).',
    params: [
      { name: 'sop', label: 'SOP', type: 'op', family: 'SOP', default: '' },
      { name: 'mat', label: 'Material', type: 'op', family: 'MAT', default: '' },
      { name: 'render', label: 'Render', type: 'toggle', default: true },
      { name: 'prim', label: 'Draw As', type: 'menu', options: ['auto', 'tris', 'lines', 'points'], default: 'auto' },
      { name: 'psize', label: 'Point Size', type: 'float', default: 2, min: 0.1, max: 40 },
      { name: 'blend', label: 'Blending', type: 'menu', options: ['opaque', 'alpha', 'add'], default: 'opaque' },
      { name: 'cull', label: 'Cull Back Faces', type: 'toggle', default: false },
      { name: 'inst', label: 'Instance SOP', type: 'op', family: 'SOP', default: '', page: 'Instance' },
      { name: 'iscale', label: 'Instance Scale', type: 'float', default: 0.05, min: 0, max: 5, page: 'Instance' },
    ].concat(K.XFORM('Xform')),
    cook(op, ctx) {
      const g = ctx.refOut(op, 'sop', 'SOP');
      const matOp = ctx.ref(op, 'mat', 'MAT');
      const mat = matOp ? K.cook(matOp) : null;
      const inst = ctx.refOut(op, 'inst', 'SOP');
      if (!g) op.warn = 'Pick a SOP';
      return { geo: g, mat, inst, model: K.xformMatrix(op), prim: K.par(op, 'prim'), pointSize: K.parNum(op, 'psize'), blend: K.par(op, 'blend'), cull: K.par(op, 'cull'), instScale: K.parNum(op, 'iscale'), render: K.par(op, 'render') };
    },
  });

  K.defineOp({
    type: 'cameraCOMP', label: 'Camera', short: 'cam', family: 'COMP', gen: true, inputs: 0,
    help: 'Viewpoint for a Render TOP. Orbit mode is the easiest to animate.',
    params: [
      { name: 'mode', label: 'Mode', type: 'menu', options: ['orbit', 'position'], default: 'orbit' },
      { name: 'az', label: 'Orbit Azimuth', type: 'float', default: 30, min: -360, max: 360, showIf: (p) => p.mode === 'orbit' },
      { name: 'el', label: 'Orbit Elevation', type: 'float', default: 18, min: -89, max: 89, showIf: (p) => p.mode === 'orbit' },
      { name: 'dist', label: 'Orbit Distance', type: 'float', default: 6, min: 0.1, max: 100, showIf: (p) => p.mode === 'orbit' },
      { name: 'tx', label: 'Position X', type: 'float', default: 0, min: -50, max: 50, row: 't', showIf: (p) => p.mode === 'position' },
      { name: 'ty', label: 'Position Y', type: 'float', default: 1, min: -50, max: 50, row: 't', showIf: (p) => p.mode === 'position' },
      { name: 'tz', label: 'Position Z', type: 'float', default: 6, min: -50, max: 50, row: 't', showIf: (p) => p.mode === 'position' },
      { name: 'lx', label: 'Look At X', type: 'float', default: 0, min: -50, max: 50, row: 'l' },
      { name: 'ly', label: 'Look At Y', type: 'float', default: 0, min: -50, max: 50, row: 'l' },
      { name: 'lz', label: 'Look At Z', type: 'float', default: 0, min: -50, max: 50, row: 'l' },
      { name: 'proj', label: 'Projection', type: 'menu', options: ['perspective', 'orthographic'], default: 'perspective' },
      { name: 'fov', label: 'Field of View', type: 'float', default: 45, min: 5, max: 160 },
      { name: 'owidth', label: 'Ortho Width', type: 'float', default: 6, min: 0.1, max: 100 },
      { name: 'roll', label: 'Roll', type: 'float', default: 0, min: -180, max: 180 },
    ],
    cook(op) {
      const look = [K.parNum(op, 'lx'), K.parNum(op, 'ly'), K.parNum(op, 'lz')];
      let eye;
      if (K.par(op, 'mode') === 'orbit') {
        const az = (K.parNum(op, 'az') * Math.PI) / 180, el = (K.parNum(op, 'el') * Math.PI) / 180, d = K.parNum(op, 'dist');
        eye = [look[0] + Math.sin(az) * Math.cos(el) * d, look[1] + Math.sin(el) * d, look[2] + Math.cos(az) * Math.cos(el) * d];
      } else eye = [K.parNum(op, 'tx'), K.parNum(op, 'ty'), K.parNum(op, 'tz')];
      const r = (K.parNum(op, 'roll') * Math.PI) / 180;
      return { eye, look, up: [Math.sin(r), Math.cos(r), 0], fov: K.parNum(op, 'fov'), ortho: K.par(op, 'proj') === 'orthographic', owidth: K.parNum(op, 'owidth') };
    },
  });

  K.defineOp({
    type: 'lightCOMP', label: 'Light', short: 'light', family: 'COMP', gen: true, inputs: 0,
    help: 'Point or directional light for Phong / PBR materials (up to 4 per render).',
    params: [
      { name: 'ltype', label: 'Type', type: 'menu', options: ['point', 'directional'], default: 'point' },
      { name: 'tx', label: 'Position X', type: 'float', default: 3, min: -50, max: 50, row: 't' },
      { name: 'ty', label: 'Position Y', type: 'float', default: 4, min: -50, max: 50, row: 't' },
      { name: 'tz', label: 'Position Z', type: 'float', default: 3, min: -50, max: 50, row: 't' },
      { name: 'color', label: 'Color', type: 'color', default: '#fff4e6' },
      { name: 'dimmer', label: 'Dimmer', type: 'float', default: 1.2, min: 0, max: 10 },
    ],
    cook(op) {
      const c = U.hexToRgb(K.par(op, 'color')), d = K.parNum(op, 'dimmer');
      const p = [K.parNum(op, 'tx'), K.parNum(op, 'ty'), K.parNum(op, 'tz')];
      if (K.par(op, 'ltype') === 'directional') { const l = Math.hypot(...p) || 1; return { pos: [-p[0] / l, -p[1] / l, -p[2] / l, 1], col: [c[0] * d, c[1] * d, c[2] * d] }; }
      return { pos: [p[0], p[1], p[2], 0], col: [c[0] * d, c[1] * d, c[2] * d] };
    },
  });

  // Panel COMPs — UI gadgets whose value can drive any parameter: op('slider1')[0]
  function panelDef(def) {
    def.family = 'COMP'; def.gen = true; def.inputs = 0; def.panel = true;
    def.cook = def.cook || ((op) => ({ chans: [{ name: 'v', data: new Float32Array([+K.par(op, 'value') || 0]) }] }));
    return K.defineOp(def);
  }
  panelDef({
    type: 'sliderCOMP', label: 'Slider', short: 'slider', help: 'A slider gadget for control panels and Perform mode. Read with op(\'slider1\')[0].',
    params: [
      { name: 'label', label: 'Label', type: 'string', default: 'Intensity' },
      { name: 'value', label: 'Value', type: 'float', default: 0.5, min: 0, max: 1 },
      { name: 'min', label: 'Min', type: 'float', default: 0, min: -100, max: 100, row: 'r' },
      { name: 'max', label: 'Max', type: 'float', default: 1, min: -100, max: 100, row: 'r' },
    ],
  });
  panelDef({
    type: 'buttonCOMP', label: 'Button', short: 'button', help: 'Momentary or toggle button. Pair with a Count CHOP to step through slides.',
    params: [
      { name: 'label', label: 'Label', type: 'string', default: 'Next' },
      { name: 'btype', label: 'Type', type: 'menu', options: ['momentary', 'toggle'], default: 'momentary' },
      { name: 'value', label: 'Value', type: 'float', default: 0, min: 0, max: 1 },
      { name: 'key', label: 'Hotkey (optional)', type: 'string', default: '' },
    ],
    cook(op) {
      let v = +K.par(op, 'value') || 0;
      const key = String(K.par(op, 'key') || '').toLowerCase();
      if (key && K.keys.has(key)) v = 1;
      if (op.rt.flash && performance.now() < op.rt.flash) v = 1;
      return { chans: [{ name: 'v', data: new Float32Array([v]) }] };
    },
    click(op) { if (K.par(op, 'btype') === 'toggle') op.p.value = op.p.value ? 0 : 1; else op.rt.flash = performance.now() + 120; },
  });
  panelDef({
    type: 'xypadCOMP', label: 'XY Pad', short: 'xypad', help: 'Two-axis pad. op(\'xypad1\')[0] = x, op(\'xypad1\')[1] = y.',
    params: [
      { name: 'label', label: 'Label', type: 'string', default: 'XY' },
      { name: 'x', label: 'X', type: 'float', default: 0.5, min: 0, max: 1, row: 'v' },
      { name: 'y', label: 'Y', type: 'float', default: 0.5, min: 0, max: 1, row: 'v' },
    ],
    cook: (op) => ({ chans: [{ name: 'x', data: new Float32Array([K.parNum(op, 'x')]) }, { name: 'y', data: new Float32Array([K.parNum(op, 'y')]) }] }),
  });

  K.defineOp({
    type: 'baseCOMP', label: 'Base', short: 'base', family: 'COMP', gen: true, inputs: 0, container: true,
    help: 'A component that contains its own network. Double-click (or press I) to dive in, U to go up. Select nodes and press Shift+C to collapse them into a Base.',
    params: [{ name: 'notes', label: 'Notes', type: 'text', default: '' }],
    cook: () => ({}),
  });

  /* ================= Render TOP ================= */
  K.defineOp({
    type: 'renderTOP', label: 'Render', short: 'render', family: 'TOP', gen: true,
    help: 'Renders Geometry COMPs through a Camera with Lights. Geometry/Lights accept names separated by spaces, or * for all.',
    params: [
      { name: 'camera', label: 'Camera', type: 'op', family: 'COMP', filter: 'cameraCOMP', default: '' },
      { name: 'geometry', label: 'Geometry', type: 'string', default: '*' },
      { name: 'lights', label: 'Lights', type: 'string', default: '*' },
      { name: 'bg', label: 'Background', type: 'color', default: '#000000' },
      { name: 'bga', label: 'Background Alpha', type: 'float', default: 0, min: 0, max: 1 },
      { name: 'ambient', label: 'Ambient', type: 'color', default: '#2a2a33' },
      { name: 'msaa', label: 'Antialias (4x MSAA)', type: 'toggle', default: true },
    ],
    cook(op, ctx) {
      const size = ctx.size(op, null);
      const ms = !!K.par(op, 'msaa');
      if (ms) op.rt.target = E.ensureMS(op.rt.target && op.rt.target.msFbo ? op.rt.target : (E.freeTarget(op.rt.target), null), size[0], size[1], 4);
      else op.rt.target = E.ensure(op.rt.target && !op.rt.target.msFbo ? op.rt.target : (E.freeTarget(op.rt.target), null), size[0], size[1], { depth: true });
      const camOp = ctx.ref(op, 'camera', 'COMP') || K.opsOfFamily('COMP').find((o) => o.type === 'cameraCOMP');
      const cam = camOp && camOp.type === 'cameraCOMP' ? K.cook(camOp) : { eye: [0, 1, 6], look: [0, 0, 0], up: [0, 1, 0], fov: 45 };
      const pick = (str, type) => {
        const s = String(str || '*').trim();
        const all = K.opsOfFamily('COMP').filter((o) => o.type === type);
        if (s === '*' || !s) return all;
        const names = s.split(/[\s,]+/);
        return all.filter((o) => names.some((n) => new RegExp('^' + n.replace(/\*/g, '.*') + '$').test(o.name)));
      };
      const geos = pick(K.par(op, 'geometry'), 'geometryCOMP').map((o) => K.cook(o)).filter((g) => g && g.render && g.geo);
      const lights = pick(K.par(op, 'lights'), 'lightCOMP').map((o) => K.cook(o)).filter(Boolean);
      const w = op.rt.target.w, h = op.rt.target.h, asp = w / h;
      const proj = cam.ortho ? M.ortho(cam.owidth, cam.owidth / asp, -100, 100) : M.persp(cam.fov, asp, 0.05, 500);
      const bg = U.hexToRgb(K.par(op, 'bg'));
      R.render({
        view: M.lookAt(cam.eye, cam.look, cam.up), proj, camPos: cam.eye, items: geos, lights,
        ambient: U.hexToRgb(K.par(op, 'ambient')), bg: [bg[0], bg[1], bg[2], K.parNum(op, 'bga')],
      }, op.rt.target, ms);
      return op.rt.target;
    },
  });
})();
