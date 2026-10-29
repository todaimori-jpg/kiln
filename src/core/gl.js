/* Kiln — gl.js : WebGL2 engine (render targets, shader cache, fullscreen passes) */
(function () {
  'use strict';
  const K = window.K;

  const VS_QUAD = `#version 300 es
in vec2 aPos; out vec2 vUV;
void main(){ vUV = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`;

  // Common GLSL helpers prepended to every TOP fragment shader
  const FS_HEADER = `#version 300 es
precision highp float;
precision highp int;
in vec2 vUV; out vec4 fragColor;
uniform vec2 uRes; uniform float uTime;
uniform sampler2D sIn0; uniform sampler2D sIn1; uniform sampler2D sIn2; uniform sampler2D sIn3;
uniform vec2 uIn0Res; uniform vec2 uIn1Res;
#define PI 3.14159265359
#define TAU 6.28318530718
vec3 hsv2rgb(vec3 c){ vec4 K=vec4(1.,2./3.,1./3.,3.); vec3 p=abs(fract(c.xxx+K.xyz)*6.-K.www); return c.z*mix(K.xxx,clamp(p-K.xxx,0.,1.),c.y);}
vec3 rgb2hsv(vec3 c){ vec4 K=vec4(0.,-1./3.,2./3.,-1.); vec4 p=mix(vec4(c.bg,K.wz),vec4(c.gb,K.xy),step(c.b,c.g)); vec4 q=mix(vec4(p.xyw,c.r),vec4(c.r,p.yzx),step(p.x,c.r)); float d=q.x-min(q.w,q.y); float e=1.0e-10; return vec3(abs(q.z+(q.w-q.y)/(6.*d+e)),d/(q.x+e),q.x);}
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x,289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+2.0*C.xxx; vec3 x3=x0-1.0+3.0*C.xxx;
  i=mod(i,289.0);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=1.0/7.0; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
// fit input texture into output, preserving aspect ("fill" mode controls)
vec2 fitUV(vec2 uv, vec2 inRes, vec2 outRes, int mode){
  if(mode==0) return uv; // stretch
  float ai=inRes.x/max(inRes.y,1.0), ao=outRes.x/max(outRes.y,1.0);
  vec2 s=vec2(1.0);
  if(mode==1){ if(ai>ao) s.y=ai/ao; else s.x=ao/ai; } // fit (contain)
  else { if(ai>ao) s.x=ao/ai; else s.y=ai/ao; } // fill (cover)
  return (uv-0.5)*s+0.5;
}
`;

  const E = (K.gl = {
    gl: null, canvas: null, float: false, halfFloat: false,
    programs: new Map(), errors: new Map(),
  });

  E.init = function (canvas) {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: true, premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available in this browser.');
    E.gl = gl; E.canvas = canvas;
    E.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048;
    E.float = !!gl.getExtension('EXT_color_buffer_float');
    E.halfFloat = E.float || !!gl.getExtension('EXT_color_buffer_half_float');
    gl.getExtension('OES_texture_float_linear');
    E.vao = gl.createVertexArray();
    gl.bindVertexArray(E.vao);
    E.quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, E.quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    E.black = E.texFromPixels(1, 1, new Uint8Array([0, 0, 0, 0]));
    E.header = FS_HEADER;
    E.VS_QUAD = VS_QUAD;
    E.copyProg = E.program('__copy', `uniform int uMode; uniform vec4 uBg; uniform int uChecker;
void main(){ vec2 uv=fitUV(vUV,uIn0Res,uRes,uMode); vec4 c=texture(sIn0,uv);
 if(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.) c=vec4(0.);
 vec3 bg=uBg.rgb; if(uChecker==1){ vec2 g=floor(gl_FragCoord.xy/10.); bg=mix(vec3(.16),vec3(.22),mod(g.x+g.y,2.)); }
 fragColor=vec4(mix(bg,c.rgb,clamp(c.a,0.,1.)),1.0);}`);
    return gl;
  };

  E.compile = function (type, src) {
    const gl = E.gl, s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s); gl.deleteShader(s);
      throw new Error(log);
    }
    return s;
  };

  // Build (or fetch cached) program. key identifies cache entry; fsBody gets header prepended unless raw.
  E.program = function (key, fsBody, opts) {
    opts = opts || {};
    const fullFs = opts.raw ? fsBody : FS_HEADER + fsBody;
    const cacheKey = key + '::' + K.util.hashStr(fullFs + (opts.vs || ''));
    if (E.programs.has(cacheKey)) return E.programs.get(cacheKey);
    if (E.errors.has(cacheKey)) throw E.errors.get(cacheKey);
    const gl = E.gl;
    try {
      const vs = E.compile(gl.VERTEX_SHADER, opts.vs || VS_QUAD);
      const fs = E.compile(gl.FRAGMENT_SHADER, fullFs);
      const p = gl.createProgram();
      gl.attachShader(p, vs); gl.attachShader(p, fs);
      if (!opts.vs) gl.bindAttribLocation(p, 0, 'aPos');
      if (opts.attribs) opts.attribs.forEach((a, i) => gl.bindAttribLocation(p, i, a));
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
      const prog = { p, u: new Map() };
      const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) {
        const info = gl.getActiveUniform(p, i);
        prog.u.set(info.name.replace(/\[0\]$/, ''), { loc: gl.getUniformLocation(p, info.name), type: info.type, size: info.size });
      }
      E.programs.set(cacheKey, prog);
      return prog;
    } catch (err) {
      const e = new Error(cleanGlslError(String(err.message || err), opts.raw ? 0 : FS_HEADER.split('\n').length - 1, opts.lineOffset || 0));
      E.errors.set(cacheKey, e);
      throw e;
    }
  };
  function cleanGlslError(msg, headerLines, extraOffset) {
    return msg.replace(/ERROR:\s*0:(\d+):/g, (m, l) => 'Line ' + Math.max(1, parseInt(l, 10) - headerLines - extraOffset) + ':').trim();
  }

  E.makeTex = function (w, h, fmt) {
    const gl = E.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (fmt === 'float' && E.halfFloat) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  E.texFromPixels = function (w, h, px) {
    const gl = E.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    return { tex: t, w, h };
  };

  // Render target: texture + framebuffer (optionally with depth)
  E.target = function (w, h, opts) {
    opts = opts || {};
    const gl = E.gl;
    const fmt = opts.fmt || (E.halfFloat ? 'float' : 'byte');
    const tex = E.makeTex(w, h, fmt);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    let depth = null;
    if (opts.depth) {
      depth = gl.createRenderbuffer();
      gl.bindRenderbuffer(gl.RENDERBUFFER, depth);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, w, h);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fbo, depth, w, h, fmt };
  };
  E.freeTarget = function (t) {
    if (!t) return;
    const gl = E.gl;
    gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo);
    if (t.depth) gl.deleteRenderbuffer(t.depth);
    if (t.msFbo) { gl.deleteFramebuffer(t.msFbo); gl.deleteRenderbuffer(t.msColor); gl.deleteRenderbuffer(t.msDepth); }
  };
  // Sizes are capped to the device's texture limit. Above it the driver accepts the
  // allocation but the framebuffer is incomplete, which shows up as silent black output.
  E.capSize = function (w, h) {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    return [Math.min(w, E.maxTex), Math.min(h, E.maxTex)];
  };
  // Ensure target exists at size; reuse when possible.
  E.ensure = function (cur, w, h, opts) {
    [w, h] = E.capSize(w, h);
    if (cur && cur.w === w && cur.h === h && (!opts || !!opts.depth === !!cur.depth)) return cur;
    E.freeTarget(cur);
    return E.target(w, h, opts);
  };
  // Multisampled 3D target (MSAA renderbuffers + resolve texture)
  E.ensureMS = function (cur, w, h, samples) {
    [w, h] = E.capSize(w, h);
    if (cur && cur.w === w && cur.h === h && cur.samples === samples) return cur;
    E.freeTarget(cur);
    const gl = E.gl;
    const t = E.target(w, h, { fmt: 'byte' });
    const max = gl.getParameter(gl.MAX_SAMPLES) || 4;
    t.samples = Math.min(samples, max);
    t.msFbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.msFbo);
    t.msColor = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, t.msColor);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, t.samples, gl.RGBA8, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, t.msColor);
    t.msDepth = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, t.msDepth);
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, t.samples, gl.DEPTH_COMPONENT24, w, h);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, t.msDepth);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return t;
  };
  E.resolveMS = function (t) {
    const gl = E.gl;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, t.msFbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, t.fbo);
    gl.blitFramebuffer(0, 0, t.w, t.h, 0, 0, t.w, t.h, gl.COLOR_BUFFER_BIT, gl.LINEAR);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
  };

  // Upload an HTML source (canvas, image, video) into a texture object {tex,w,h}
  E.upload = function (holder, src, w, h) {
    const gl = E.gl;
    if (!holder) {
      holder = { tex: gl.createTexture(), w: 0, h: 0 };
      gl.bindTexture(gl.TEXTURE_2D, holder.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    gl.bindTexture(gl.TEXTURE_2D, holder.tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, src); } catch (e) { /* not ready */ }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    holder.w = w || src.videoWidth || src.naturalWidth || src.width || 1;
    holder.h = h || src.videoHeight || src.naturalHeight || src.height || 1;
    return holder;
  };
  // Upload float data as a 1-row texture (for CHOP to TOP / spectrum lookups)
  E.uploadFloatRow = function (holder, data, rows) {
    const gl = E.gl;
    rows = rows || 1;
    const w = Math.max(1, Math.floor(data.length / rows));
    if (!holder) {
      holder = { tex: gl.createTexture(), w: 0, h: 0 };
      gl.bindTexture(gl.TEXTURE_2D, holder.tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    }
    // pack to RGBA8 in R (0..1 clamp) — portable across devices
    const px = new Uint8Array(w * rows * 4);
    for (let i = 0; i < w * rows; i++) {
      const v = Math.max(0, Math.min(1, data[i] || 0)) * 255;
      px[i * 4] = v; px[i * 4 + 1] = v; px[i * 4 + 2] = v; px[i * 4 + 3] = 255;
    }
    gl.bindTexture(gl.TEXTURE_2D, holder.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
    holder.w = w; holder.h = rows;
    return holder;
  };

  // Set uniforms by JS value type
  E.setUniforms = function (prog, uniforms, texUnitStart) {
    const gl = E.gl;
    let unit = texUnitStart || 0;
    for (const name in uniforms) {
      const info = prog.u.get(name);
      if (!info) continue;
      const v = uniforms[name];
      const t = info.type;
      if (t === gl.SAMPLER_2D_ARRAY) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, (v && v.tex) || E.blackArray().tex);
        gl.uniform1i(info.loc, unit); unit++;
      } else if (t === gl.SAMPLER_2D) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, (v && v.tex) || E.black.tex);
        gl.uniform1i(info.loc, unit); unit++;
      } else if (t === gl.FLOAT) gl.uniform1f(info.loc, +v || 0);
      else if (t === gl.INT || t === gl.BOOL) gl.uniform1i(info.loc, v | 0);
      else if (t === gl.FLOAT_VEC2) gl.uniform2fv(info.loc, v);
      else if (t === gl.FLOAT_VEC3) gl.uniform3fv(info.loc, v);
      else if (t === gl.FLOAT_VEC4) gl.uniform4fv(info.loc, v);
      else if (t === gl.FLOAT_MAT4) gl.uniformMatrix4fv(info.loc, false, v);
      else if (t === gl.FLOAT_MAT3) gl.uniformMatrix3fv(info.loc, false, v);
    }
    // bind black to all unbound samplers to avoid feedback-loop warnings
    prog.u.forEach((info, name) => {
      if (info.type === gl.SAMPLER_2D && !(name in uniforms)) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, E.black.tex);
        gl.uniform1i(info.loc, unit); unit++;
      } else if (info.type === gl.SAMPLER_2D_ARRAY && !(name in uniforms)) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, E.blackArray().tex);
        gl.uniform1i(info.loc, unit); unit++;
      }
    });
    return unit;
  };

  /* ---------- frame history ring (one TEXTURE_2D_ARRAY, written layer by layer) ---------- */
  E.blackArray = function () {
    if (E._blackArr) return E._blackArr;
    const gl = E.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, t);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, 1, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    return (E._blackArr = { tex: t, w: 1, h: 1 });
  };
  E.ensureRing = function (cur, w, h, n) {
    [w, h] = E.capSize(w, h); n = Math.max(1, Math.round(n));
    if (cur && cur.w === w && cur.h === h && cur.n === n) return cur;
    E.freeTarget(cur);
    const gl = E.gl, tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, w, h, n);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return { tex, fbo: gl.createFramebuffer(), w, h, n, head: -1, count: 0, ring: true };
  };
  E.ringWrite = function (r, src) {
    const gl = E.gl;
    r.head = (r.head + 1) % r.n;
    gl.bindFramebuffer(gl.FRAMEBUFFER, r.fbo);
    gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, r.tex, 0, r.head);
    E.pass(E.program('__ringcopy', 'void main(){ fragColor=texture(sIn0,vUV); }'), { sIn0: src }, { fbo: r.fbo, w: r.w, h: r.h });
    r.count = Math.min(r.count + 1, r.n);
  };
  E.ringUniforms = (r) => ({ sHist: r, uHead: r.head < 0 ? 0 : r.head, uN: r.n, uCount: Math.max(1, r.count) });
  // GLSL: sample k frames back (fractional k blends neighbours)
  E.RING_GLSL = `uniform highp sampler2DArray sHist; uniform float uHead; uniform float uN; uniform float uCount;
vec4 histAt(vec2 uv, float k){ float l=mod(uHead-k+uN*4.0,uN); return texture(sHist,vec3(uv,l)); }
vec4 hist(vec2 uv, float k, float interp){ k=clamp(k,0.,uCount-1.); float k0=floor(k); float k1=min(k0+1.,uCount-1.);
 vec4 a=histAt(uv,k0); return interp>0.5 ? mix(a,histAt(uv,k1),k-k0) : a; }
`;

  // Fullscreen pass into target (null = screen with given viewport)
  E.pass = function (prog, uniforms, target, viewport) {
    const gl = E.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fbo : null);
    if (viewport) gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
    else gl.viewport(0, 0, target.w, target.h);
    gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    gl.useProgram(prog.p);
    if (target && uniforms.uRes === undefined) uniforms.uRes = [target.w, target.h];
    if (uniforms.uTime === undefined) uniforms.uTime = K.time ? K.time.seconds : 0;
    E.setUniforms(prog, uniforms);
    gl.bindVertexArray(E.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, E.quad);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  };

  // Draw a texture to the screen in a viewport rect (bottom-left origin), fit mode
  E.present = function (texObj, vp, mode, checker) {
    E.pass(E.copyProg, { sIn0: texObj, uIn0Res: [texObj ? texObj.w : 1, texObj ? texObj.h : 1], uRes: [vp[2], vp[3]], uMode: mode == null ? 1 : mode, uBg: [0.07, 0.07, 0.08, 1], uChecker: checker ? 1 : 0 }, null, vp);
  };
})();
