/* Kiln — tops.js : Texture Operators (GPU fragment-shader passes) */
(function () {
  'use strict';
  const K = window.K, U = K.util, E = K.gl;

  const FIT = { name: 'fit', label: 'Input Fit', type: 'menu', options: ['stretch', 'fit', 'fill'], default: 'fill', page: 'Common' };
  const fitIdx = (v) => ({ stretch: 0, fit: 1, fill: 2 }[v] || 0);
  const col = (op, n, a) => { const c = U.hexToRgb(K.par(op, n)); return [c[0], c[1], c[2], a == null ? 1 : a]; };

  // Generic shader TOP
  function shaderTOP(def) {
    const fs = def.fs;
    def.family = 'TOP';
    def.cook = def.cook || function (op, ctx) {
      const nIn = def.inputs === 'multi' ? op.inputs.length : def.inputs;
      const ins = [];
      for (let i = 0; i < Math.min(nIn, 4); i++) ins.push(ctx.input(op, i));
      const size = ctx.size(op, ins[0]);
      op.rt.target = E.ensure(op.rt.target, size[0], size[1]);
      const prog = E.program(def.type, typeof fs === 'function' ? fs(op) : fs);
      const u = { uRes: [op.rt.target.w, op.rt.target.h], uTime: K.time.seconds };
      ins.forEach((t, i) => { u['sIn' + i] = t; if (i < 2) u['uIn' + i + 'Res'] = [t ? t.w : 1, t ? t.h : 1]; });
      if (def.uniforms) Object.assign(u, def.uniforms(op, ctx, ins));
      E.pass(prog, u, op.rt.target);
      return op.rt.target;
    };
    return K.defineOp(def);
  }
  K.shaderTOP = shaderTOP;

  /* ================= GENERATORS ================= */
  shaderTOP({
    type: 'constantTOP', label: 'Constant', short: 'constant', gen: true,
    help: 'Solid color fill.',
    params: [
      { name: 'color', label: 'Color', type: 'color', default: '#1a1a24' },
      { name: 'alpha', label: 'Alpha', type: 'float', default: 1, min: 0, max: 1 },
    ],
    fs: `uniform vec4 uColor; void main(){ fragColor=uColor; }`,
    uniforms: (op) => ({ uColor: col(op, 'color', K.parNum(op, 'alpha')) }),
  });

  shaderTOP({
    type: 'noiseTOP', label: 'Noise', short: 'noise', gen: true,
    help: 'GPU simplex / fractal / ridged / cellular noise. Animate with Speed or Z.',
    params: [
      { name: 'ntype', label: 'Type', type: 'menu', options: ['simplex', 'fbm', 'ridged', 'cellular', 'turbulence'], default: 'fbm' },
      { name: 'period', label: 'Period', type: 'float', default: 2.5, min: 0.05, max: 20 },
      { name: 'harmonics', label: 'Harmonics', type: 'int', default: 4, min: 1, max: 8 },
      { name: 'rough', label: 'Roughness', type: 'float', default: 0.5, min: 0, max: 1 },
      { name: 'speed', label: 'Speed', type: 'float', default: 0.15, min: -4, max: 4 },
      { name: 'z', label: 'Z Offset', type: 'float', default: 0, min: -10, max: 10 },
      { name: 'tx', label: 'Translate X', type: 'float', default: 0, min: -5, max: 5, row: 't' },
      { name: 'ty', label: 'Translate Y', type: 'float', default: 0, min: -5, max: 5, row: 't' },
      { name: 'amp', label: 'Amplitude', type: 'float', default: 1, min: 0, max: 4 },
      { name: 'offset', label: 'Offset', type: 'float', default: 0, min: -1, max: 1 },
      { name: 'color1', label: 'Low Color', type: 'color', default: '#05050a', page: 'Color' },
      { name: 'color2', label: 'High Color', type: 'color', default: '#f2efe9', page: 'Color' },
      { name: 'rgb', label: 'RGB Noise', type: 'toggle', default: false, page: 'Color' },
    ],
    fs: `uniform int uType; uniform float uPeriod; uniform int uHarm; uniform float uRough; uniform float uZ;
uniform vec2 uT; uniform float uAmp; uniform float uOff; uniform vec3 uC1; uniform vec3 uC2; uniform int uRGB;
float cell(vec3 p){ vec3 i=floor(p), f=fract(p); float d=1.0;
 for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)for(int z=-1;z<=1;z++){ vec3 g=vec3(x,y,z); vec3 o=fract(sin(vec3(dot(i+g,vec3(127.1,311.7,74.7)),dot(i+g,vec3(269.5,183.3,246.1)),dot(i+g,vec3(113.5,271.9,124.6))))*43758.5453);
 d=min(d,length(g+o-f)); } return d; }
float field(vec3 p){
 float s=0., a=1., n=0., f=1.;
 for(int i=0;i<8;i++){ if(i>=uHarm) break;
   float v;
   if(uType==2) v=1.0-abs(snoise(p*f));
   else if(uType==3) v=1.0-cell(p*f)*1.5;
   else if(uType==4) v=abs(snoise(p*f));
   else v=snoise(p*f);
   s+=v*a; n+=a; a*=uRough; f*=2.0; if(uType==0) break; }
 s/=n; if(uType==0||uType==1) s=s*0.5+0.5; if(uType==2) s=s*s;
 return s; }
void main(){ vec2 p=(vUV-0.5)*vec2(uRes.x/uRes.y,1.0)*uPeriod+uT;
 if(uRGB==1){ vec3 c=vec3(field(vec3(p,uZ)),field(vec3(p+7.3,uZ+1.7)),field(vec3(p-3.1,uZ+4.2))); fragColor=vec4(clamp(c*uAmp+uOff,0.,1.),1.); return; }
 float v=clamp(field(vec3(p,uZ))*uAmp+uOff,0.,1.); fragColor=vec4(mix(uC1,uC2,v),1.0); }`,
    uniforms: (op) => {
      const t = { simplex: 0, fbm: 1, ridged: 2, cellular: 3, turbulence: 4 }[K.par(op, 'ntype')] || 0;
      return {
        uType: t, uPeriod: K.parNum(op, 'period'), uHarm: K.parNum(op, 'harmonics'), uRough: K.parNum(op, 'rough'),
        uZ: K.parNum(op, 'z') + K.time.seconds * K.parNum(op, 'speed'), uT: [K.parNum(op, 'tx'), K.parNum(op, 'ty')],
        uAmp: K.parNum(op, 'amp'), uOff: K.parNum(op, 'offset'), uC1: U.hexToRgb(K.par(op, 'color1')), uC2: U.hexToRgb(K.par(op, 'color2')), uRGB: K.par(op, 'rgb') ? 1 : 0,
      };
    },
  });

  shaderTOP({
    type: 'rampTOP', label: 'Ramp', short: 'ramp', gen: true,
    help: 'Three-stop gradient: linear, radial, angular or diamond.',
    params: [
      { name: 'rtype', label: 'Type', type: 'menu', options: ['linear', 'radial', 'angular', 'diamond'], default: 'linear' },
      { name: 'angle', label: 'Angle', type: 'float', default: 90, min: -360, max: 360 },
      { name: 'phase', label: 'Phase', type: 'float', default: 0, min: -1, max: 1 },
      { name: 'repeat', label: 'Repeat', type: 'float', default: 1, min: 0.1, max: 20 },
      { name: 'mirror', label: 'Mirror', type: 'toggle', default: false },
      { name: 'cx', label: 'Center X', type: 'float', default: 0, min: -1, max: 1, row: 'c' },
      { name: 'cy', label: 'Center Y', type: 'float', default: 0, min: -1, max: 1, row: 'c' },
      { name: 'c1', label: 'Color 1', type: 'color', default: '#0b0a1a', page: 'Color' },
      { name: 'c2', label: 'Color 2', type: 'color', default: '#5b2a86', page: 'Color' },
      { name: 'c3', label: 'Color 3', type: 'color', default: '#f6a04d', page: 'Color' },
      { name: 'mid', label: 'Middle Stop', type: 'float', default: 0.5, min: 0.01, max: 0.99, page: 'Color' },
    ],
    fs: `uniform int uType; uniform float uAng; uniform float uPhase; uniform float uRep; uniform int uMir; uniform vec2 uC;
uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform float uMid;
void main(){ vec2 p=(vUV-0.5)*vec2(uRes.x/uRes.y,1.0)-uC*0.5; float v;
 if(uType==0){ float a=radians(uAng); v=dot(p,vec2(cos(a),sin(a)))+0.5; }
 else if(uType==1){ v=length(p)*1.6; }
 else if(uType==2){ v=atan(p.y,p.x)/TAU+0.5+uAng/360.; }
 else { v=(abs(p.x)+abs(p.y))*1.4; }
 v=v*uRep+uPhase; v=uMir==1?1.0-abs(fract(v*0.5)*2.0-1.0):fract(clamp(v,0.,0.99999)+(uRep>1.0||uPhase!=0.0?floor(v):0.0));
 if(uRep<=1.0&&uPhase==0.0&&uMir==0) v=clamp(v,0.,1.);
 vec3 c=v<uMid?mix(uC1,uC2,v/uMid):mix(uC2,uC3,(v-uMid)/(1.0-uMid));
 fragColor=vec4(c,1.0); }`,
    uniforms: (op) => ({
      uType: ['linear', 'radial', 'angular', 'diamond'].indexOf(K.par(op, 'rtype')), uAng: K.parNum(op, 'angle'), uPhase: K.parNum(op, 'phase'),
      uRep: K.parNum(op, 'repeat'), uMir: K.par(op, 'mirror') ? 1 : 0, uC: [K.parNum(op, 'cx'), K.parNum(op, 'cy')],
      uC1: U.hexToRgb(K.par(op, 'c1')), uC2: U.hexToRgb(K.par(op, 'c2')), uC3: U.hexToRgb(K.par(op, 'c3')), uMid: K.parNum(op, 'mid'),
    }),
  });

  shaderTOP({
    type: 'circleTOP', label: 'Circle', short: 'circle', gen: true,
    help: 'Anti-aliased circle, ring or polygon.',
    params: [
      { name: 'radius', label: 'Radius', type: 'float', default: 0.3, min: 0, max: 2 },
      { name: 'sides', label: 'Sides (0 = round)', type: 'int', default: 0, min: 0, max: 12 },
      { name: 'ring', label: 'Ring Width', type: 'float', default: 0, min: 0, max: 1 },
      { name: 'soft', label: 'Softness', type: 'float', default: 0.004, min: 0, max: 1 },
      { name: 'rotate', label: 'Rotate', type: 'float', default: 0, min: -360, max: 360 },
      { name: 'cx', label: 'Center X', type: 'float', default: 0, min: -1, max: 1, row: 'c' },
      { name: 'cy', label: 'Center Y', type: 'float', default: 0, min: -1, max: 1, row: 'c' },
      { name: 'color', label: 'Fill Color', type: 'color', default: '#f4f0e8' },
      { name: 'bg', label: 'Background', type: 'color', default: '#000000' },
      { name: 'bga', label: 'Background Alpha', type: 'float', default: 0, min: 0, max: 1 },
    ],
    fs: `uniform float uR; uniform int uSides; uniform float uRing; uniform float uSoft; uniform float uRot; uniform vec2 uC; uniform vec3 uCol; uniform vec4 uBg;
void main(){ vec2 p=(vUV-0.5)*vec2(uRes.x/uRes.y,1.0)-uC*0.5; float a=radians(uRot); p=mat2(cos(a),-sin(a),sin(a),cos(a))*p;
 float d;
 if(uSides>=3){ float n=float(uSides); float an=atan(p.x,p.y)+PI; float r=TAU/n; d=cos(floor(.5+an/r)*r-an)*length(p)-uR*cos(PI/n); }
 else d=length(p)-uR;
 if(uRing>0.0) d=abs(d+uRing*0.5)-uRing*0.5;
 float aa=max(uSoft,1.5/uRes.y); float m=1.0-smoothstep(-aa,aa,d);
 fragColor=mix(uBg,vec4(uCol,1.0),m); }`,
    uniforms: (op) => ({
      uR: K.parNum(op, 'radius'), uSides: K.parNum(op, 'sides'), uRing: K.parNum(op, 'ring'), uSoft: K.parNum(op, 'soft'), uRot: K.parNum(op, 'rotate'),
      uC: [K.parNum(op, 'cx'), K.parNum(op, 'cy')], uCol: U.hexToRgb(K.par(op, 'color')), uBg: col(op, 'bg', K.parNum(op, 'bga')),
    }),
  });

  shaderTOP({
    type: 'rectangleTOP', label: 'Rectangle', short: 'rect', gen: true,
    help: 'Rounded rectangle with soft edges — handy for cards, frames, lower thirds.',
    params: [
      { name: 'w', label: 'Width', type: 'float', default: 0.8, min: 0, max: 4, row: 's' },
      { name: 'h', label: 'Height', type: 'float', default: 0.5, min: 0, max: 4, row: 's' },
      { name: 'cx', label: 'Center X', type: 'float', default: 0, min: -1, max: 1, row: 'c' },
      { name: 'cy', label: 'Center Y', type: 'float', default: 0, min: -1, max: 1, row: 'c' },
      { name: 'corner', label: 'Corner Radius', type: 'float', default: 0.04, min: 0, max: 1 },
      { name: 'border', label: 'Border Width', type: 'float', default: 0, min: 0, max: 0.5 },
      { name: 'rotate', label: 'Rotate', type: 'float', default: 0, min: -360, max: 360 },
      { name: 'soft', label: 'Softness', type: 'float', default: 0.002, min: 0, max: 1 },
      { name: 'color', label: 'Fill Color', type: 'color', default: '#f4f0e8' },
      { name: 'alpha', label: 'Fill Alpha', type: 'float', default: 1, min: 0, max: 1 },
      { name: 'bg', label: 'Background', type: 'color', default: '#000000' },
      { name: 'bga', label: 'Background Alpha', type: 'float', default: 0, min: 0, max: 1 },
    ],
    fs: `uniform vec2 uS; uniform vec2 uC; uniform float uCorner; uniform float uBorder; uniform float uRot; uniform float uSoft; uniform vec4 uCol; uniform vec4 uBg;
void main(){ vec2 p=(vUV-0.5)*vec2(uRes.x/uRes.y,1.0)-uC*0.5; float a=radians(uRot); p=mat2(cos(a),-sin(a),sin(a),cos(a))*p;
 vec2 b=uS*0.5; float r=min(uCorner,min(b.x,b.y)); vec2 q=abs(p)-b+r; float d=length(max(q,0.))+min(max(q.x,q.y),0.)-r;
 if(uBorder>0.0) d=abs(d+uBorder*0.5)-uBorder*0.5;
 float aa=max(uSoft,1.5/uRes.y); float m=1.0-smoothstep(-aa,aa,d);
 fragColor=mix(uBg,uCol,m*uCol.a)+vec4(0.,0.,0.,0.); fragColor.a=mix(uBg.a,1.0,m*uCol.a); }`,
    uniforms: (op) => ({
      uS: [K.parNum(op, 'w'), K.parNum(op, 'h')], uC: [K.parNum(op, 'cx'), K.parNum(op, 'cy')], uCorner: K.parNum(op, 'corner'),
      uBorder: K.parNum(op, 'border'), uRot: K.parNum(op, 'rotate'), uSoft: K.parNum(op, 'soft'), uCol: col(op, 'color', K.parNum(op, 'alpha')), uBg: col(op, 'bg', K.parNum(op, 'bga')),
    }),
  });

  shaderTOP({
    type: 'patternTOP', label: 'Pattern', short: 'pattern', gen: true,
    help: 'Checker, stripes, grid, dots and hex tiles.',
    params: [
      { name: 'ptype', label: 'Type', type: 'menu', options: ['checker', 'stripes', 'grid', 'dots', 'hex', 'waves'], default: 'stripes' },
      { name: 'scale', label: 'Scale', type: 'float', default: 12, min: 1, max: 200 },
      { name: 'width', label: 'Line Width', type: 'float', default: 0.5, min: 0, max: 1 },
      { name: 'rotate', label: 'Rotate', type: 'float', default: 0, min: -360, max: 360 },
      { name: 'speed', label: 'Scroll Speed', type: 'float', default: 0, min: -10, max: 10 },
      { name: 'c1', label: 'Color 1', type: 'color', default: '#0e0e12' },
      { name: 'c2', label: 'Color 2', type: 'color', default: '#e9e4d8' },
    ],
    fs: `uniform int uType; uniform float uScale; uniform float uW; uniform float uRot; uniform float uOff; uniform vec3 uC1; uniform vec3 uC2;
void main(){ vec2 p=(vUV-0.5)*vec2(uRes.x/uRes.y,1.0); float a=radians(uRot); p=mat2(cos(a),-sin(a),sin(a),cos(a))*p*uScale; p.x+=uOff;
 float m=0.; float aa=uScale*1.5/uRes.y;
 if(uType==0){ vec2 g=floor(p); m=mod(g.x+g.y,2.0); }
 else if(uType==1){ m=smoothstep(uW-aa,uW+aa,fract(p.x)); }
 else if(uType==2){ vec2 f=abs(fract(p)-0.5); m=1.0-smoothstep(uW*0.5-aa,uW*0.5+aa,min(f.x,f.y)); m=1.0-m; m=1.0-m; m=step(0.5-uW*0.5,max(f.x,f.y)); }
 else if(uType==3){ float d=length(fract(p)-0.5); m=1.0-smoothstep(uW*0.5-aa,uW*0.5+aa,d); }
 else if(uType==4){ vec2 r=vec2(1.,1.732); vec2 h=r*0.5; vec2 A=mod(p,r)-h; vec2 B=mod(p-h,r)-h; vec2 g=dot(A,A)<dot(B,B)?A:B; float d=max(abs(g.x),dot(abs(g),normalize(vec2(1.,1.732)))); m=smoothstep(0.5*(1.-uW)-aa,0.5*(1.-uW)+aa,0.5-d); }
 else { m=smoothstep(-aa,aa,sin(p.x*TAU+sin(p.y*2.0)*1.5)-(uW*2.-1.)); }
 fragColor=vec4(mix(uC1,uC2,m),1.0); }`,
    uniforms: (op) => ({
      uType: ['checker', 'stripes', 'grid', 'dots', 'hex', 'waves'].indexOf(K.par(op, 'ptype')), uScale: K.parNum(op, 'scale'), uW: K.parNum(op, 'width'),
      uRot: K.parNum(op, 'rotate'), uOff: K.time.seconds * K.parNum(op, 'speed'), uC1: U.hexToRgb(K.par(op, 'c1')), uC2: U.hexToRgb(K.par(op, 'c2')),
    }),
  });

  /* ---------- Text TOP (Canvas2D -> texture) ---------- */
  const TEXT_ENTRANCES = ['typewriter', 'fade', 'slide up', 'slide down', 'slide left', 'slide right', 'pop', 'blur in', 'scramble', 'rain'];
  const TEXT_MOTIONS = ['none', 'wave', 'bounce', 'float', 'pulse', 'shake', 'rotate', 'flip', 'tracking', 'orbit', 'glitch'];
  const TEXT_ANIMS = ['none', 'typewriter', 'fade', 'slide up', 'slide down', 'slide left', 'slide right', 'pop', 'wave', 'bounce', 'float', 'pulse', 'shake', 'rotate', 'flip', 'tracking', 'blur in', 'scramble', 'rain', 'orbit', 'glitch'];
  K.TEXT_ANIMS = TEXT_ANIMS; K.TEXT_MOTIONS = TEXT_MOTIONS;
  K.BUILTIN_FONTS = ['Geist', 'Instrument Serif', 'JetBrains Mono', 'Bebas Neue', 'Playfair Display', 'Archivo Black', 'DM Serif Display', 'Space Mono', 'Fraunces'];
  K.FONTS = K.BUILTIN_FONTS.slice();
  K.customFonts = new Map(); // family -> { family, fileName, weight, style, varAxis }

  // Parse OpenType/TrueType 'name' table for clean family name if possible, else clean filename
  function cleanFontName(fileName) {
    let base = String(fileName || 'Custom Font').replace(/\.(ttf|otf|woff2?|ttc)$/i, '');
    base = base.replace(/[-_](VariableFont_[a-zA-Z,]+|Regular|Bold|Italic|Light|Medium|SemiBold|ExtraBold|Black|Thin|ExtraLight|BoldItalic|MediumItalic|LightItalic)$/i, '');
    base = base.replace(/[-_]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim();
    return base || 'Custom Font';
  }

  K.registerFontBuffer = async function (buf, fileName, preferredFamily) {
    const family = (preferredFamily && String(preferredFamily).trim()) || cleanFontName(fileName);
    if (typeof FontFace === 'undefined' || !document.fonts) throw new Error('FontFace API not supported in this browser');
    // Register across common weight range (100 900) so static and variable fonts work seamlessly with Weight menu
    const face = new FontFace(family, buf, { weight: '100 900', style: 'normal' });
    const loaded = await face.load();
    document.fonts.add(loaded);
    // Also register italic slot if filename hints italic, or so canvas italic synthesis/lookup works cleanly
    if (!K.FONTS.includes(family)) K.FONTS.push(family);
    K.customFonts.set(family, { family, fileName: fileName || (family + '.ttf') });
    K.fontEpoch = (K.fontEpoch || 0) + 1;
    K.bus && K.bus.emit && K.bus.emit('fonts');
    return family;
  };

  K.loadFontFile = async function (file, opts) {
    opts = opts || {};
    const buf = await file.arrayBuffer();
    const family = await K.registerFontBuffer(buf, file.name, opts.family);
    if (opts.persist !== false && K.files && K.files.put) {
      const id = 'font_' + family.toLowerCase().replace(/[^a-z0-9]+/g, '_');
      try {
        await K.files.put({
          id, name: file.name, type: file.type || 'font/ttf', kind: 'font',
          size: file.size || buf.byteLength, t: Date.now(),
          blob: file instanceof Blob ? file : new Blob([buf], { type: 'font/ttf' }),
          meta: { family },
        });
        K.bus && K.bus.emit && K.bus.emit('files');
      } catch (e) {}
    }
    return family;
  };
  K.defineOp({
    type: 'textTOP', label: 'Text', short: 'text', family: 'TOP', gen: true,
    help: 'Typography with custom font uploads (.ttf, .otf, .woff2) and 20 animation modes (Animate page). Use {expressions} inside text for live values, or pull lines from a Table/Text DAT.',
    params: [
      { name: 'text', label: 'Text', type: 'text', default: 'KILN' },
      { name: 'dat', label: 'DAT Source', type: 'op', family: 'DAT', default: '' },
      { name: 'allrows', label: 'All DAT Rows', type: 'toggle', default: false },
      { name: 'row', label: 'DAT Row', type: 'int', default: 0, min: 0, max: 100, row: 'rc', showIf: (p) => !p.allrows },
      { name: 'colI', label: 'DAT Col', type: 'int', default: 0, min: 0, max: 20, row: 'rc' },
      { name: 'font', label: 'Font', type: 'font', options: K.FONTS, default: 'Geist', page: 'Font' },
      { name: 'size', label: 'Size (% height)', type: 'float', default: 14, min: 1, max: 100, page: 'Font' },
      { name: 'weight', label: 'Weight', type: 'menu', options: ['300', '400', '500', '600', '700', '800', '900'], default: '600', page: 'Font' },
      { name: 'italic', label: 'Italic', type: 'toggle', default: false, page: 'Font' },
      { name: 'upper', label: 'Uppercase', type: 'toggle', default: false, page: 'Font' },
      { name: 'tracking', label: 'Letter Spacing (em)', type: 'float', default: 0, min: -0.2, max: 1, page: 'Font' },
      { name: 'leading', label: 'Line Height', type: 'float', default: 1.1, min: 0.6, max: 3, page: 'Font' },
      { name: 'alignx', label: 'Align X', type: 'menu', options: ['left', 'center', 'right'], default: 'center', page: 'Layout' },
      { name: 'aligny', label: 'Align Y', type: 'menu', options: ['top', 'center', 'bottom'], default: 'center', page: 'Layout' },
      { name: 'px', label: 'Position X', type: 'float', default: 0, min: -1, max: 1, page: 'Layout', row: 'p' },
      { name: 'py', label: 'Position Y', type: 'float', default: 0, min: -1, max: 1, page: 'Layout', row: 'p' },
      { name: 'wrap', label: 'Wrap Width (%)', type: 'float', default: 90, min: 5, max: 100, page: 'Layout' },
      { name: 'color', label: 'Font Color', type: 'color', default: '#f4f0e8', page: 'Color' },
      { name: 'alpha', label: 'Font Alpha', type: 'float', default: 1, min: 0, max: 1, page: 'Color' },
      { name: 'bg', label: 'Background', type: 'color', default: '#000000', page: 'Color' },
      { name: 'bga', label: 'Background Alpha', type: 'float', default: 0, min: 0, max: 1, page: 'Color' },
      { name: 'reveal', label: 'Reveal (0-1)', type: 'float', default: 1, min: 0, max: 1, page: 'Animate' },
      { name: 'anim', label: 'Animation', type: 'menu', options: TEXT_ANIMS, default: 'none', page: 'Animate' },
      { name: 'motion', label: 'Add Motion', type: 'menu', options: TEXT_MOTIONS, default: 'none', page: 'Animate' },
      { name: 'unit', label: 'Animate By', type: 'menu', options: ['character', 'word', 'line'], default: 'character', page: 'Animate' },
      { name: 'order', label: 'Order', type: 'menu', options: ['forward', 'reverse', 'center out', 'edges in', 'random'], default: 'forward', page: 'Animate' },
      { name: 'clock', label: 'Clock', type: 'menu', options: ['timeline', 'progress'], default: 'timeline', page: 'Animate' },
      { name: 'progress', label: 'Progress (0-1)', type: 'float', default: 1, min: 0, max: 1, page: 'Animate' },
      { name: 'astart', label: 'Start (s)', type: 'float', default: 0, min: 0, max: 600, page: 'Animate', row: 'at' },
      { name: 'stagger', label: 'Stagger (s)', type: 'float', default: 0.05, min: 0, max: 2, page: 'Animate', row: 'at' },
      { name: 'adur', label: 'Unit Duration (s)', type: 'float', default: 0.5, min: 0.01, max: 10, page: 'Animate' },
      { name: 'ease', label: 'Easing', type: 'menu', options: ['out', 'smooth', 'linear', 'back', 'elastic'], default: 'out', page: 'Animate' },
      { name: 'aloop', label: 'Loop Entrance', type: 'toggle', default: false, page: 'Animate', row: 'al' },
      { name: 'hold', label: 'Hold (s)', type: 'float', default: 1.5, min: 0, max: 60, page: 'Animate', row: 'al' },
      { name: 'amount', label: 'Amount', type: 'float', default: 1, min: 0, max: 4, page: 'Animate' },
      { name: 'aspeed', label: 'Motion Speed (Hz)', type: 'float', default: 1, min: 0, max: 10, page: 'Animate' },
      { name: 'spread', label: 'Phase Spread', type: 'float', default: 0.1, min: 0, max: 1, page: 'Animate' },
      { name: 'cursor', label: 'Typewriter Cursor', type: 'toggle', default: false, page: 'Animate', row: 'cs' },
      { name: 'aseed', label: 'Seed', type: 'int', default: 1, min: 0, max: 999, page: 'Animate', row: 'cs' },
    ],
    create(op) { op.rt.canvas = document.createElement('canvas'); op.rt.ctx2d = op.rt.canvas.getContext('2d'); },
    destroy(op) { if (op.rt.tex) K.gl.gl.deleteTexture(op.rt.tex.tex); },
    cook(op, ctx) {
      const size = ctx.size(op, null);
      const w = Math.round(size[0]), h = Math.round(size[1]);
      let txt = String(K.par(op, 'text')).replace(/\\n/g, '\n');
      const dat = ctx.ref(op, 'dat', 'DAT');
      if (dat) {
        const out = K.cook(dat);
        if (dat.type === 'textDAT' && out && out.text != null && (K.par(op, 'allrows') || (!op.e.row && K.parNum(op, 'row') === 0))) {
          txt = String(out.text).replace(/\\n/g, '\n');
        } else if (out && out.table && out.table.length) {
          const c = U.clamp(K.parNum(op, 'colI'), 0, Math.max(0, (out.table[0] || []).length - 1));
          if (K.par(op, 'allrows')) {
            txt = out.table.map((row) => String((row && row[c]) || '').replace(/\\n/g, '\n')).join('\n');
          } else {
            const r = U.clamp(K.parNum(op, 'row'), 0, out.table.length - 1);
            const row = out.table[r] || [];
            txt = String(row[c] || '').replace(/\\n/g, '\n');
          }
        } else if (out && out.text != null) txt = out.text;
      }
      txt = txt.replace(/\{([^{}]+)\}/g, (m, ex) => {
        try { const v = K.evalExpr(ex, op); return typeof v === 'number' ? (Math.abs(v) >= 100 || Number.isInteger(v) ? String(Math.round(v * 100) / 100) : v.toFixed(2)) : String(v); }
        catch (e) { return '?'; }
      });
      if (K.par(op, 'upper')) txt = txt.toUpperCase();
      const keys = ['font', 'size', 'weight', 'italic', 'tracking', 'leading', 'alignx', 'aligny', 'px', 'py', 'wrap', 'color', 'alpha', 'bg', 'bga', 'reveal', 'allrows'];
      const base = [w, h, txt, K.fontEpoch || 0].concat(keys.map((k) => K.par(op, k))).join('|');
      const anim = K.par(op, 'anim'), motion = K.par(op, 'motion');
      let key = base, A = null;
      if (anim !== 'none' || motion !== 'none') {
        A = textAnimState(op, txt);
        key = base + '|' + TEXT_ANIM_KEYS.map((k) => K.par(op, k)).join('|') + '|' + A.stamp;
      }
      if (key !== op.rt.key || !op.rt.tex) {
        op.rt.key = key;
        if (A) drawTextAnimated(op, w, h, txt, A); else drawText(op, w, h, txt);
        op.rt.tex = E.upload(op.rt.tex, op.rt.canvas, w, h);
      }
      return op.rt.tex;
    },
  });
  function drawText(op, w, h, txt) {
    const c = op.rt.canvas, g = op.rt.ctx2d;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    g.clearRect(0, 0, w, h);
    const bga = K.parNum(op, 'bga');
    if (bga > 0) { g.globalAlpha = bga; g.fillStyle = K.par(op, 'bg'); g.fillRect(0, 0, w, h); g.globalAlpha = 1; }
    const px = (K.parNum(op, 'size') / 100) * h;
    const fam = K.par(op, 'font');
    g.font = (K.par(op, 'italic') ? 'italic ' : '') + K.par(op, 'weight') + ' ' + px + 'px "' + fam + '", system-ui, sans-serif';
    const tracking = K.parNum(op, 'tracking') * px;
    try { g.letterSpacing = tracking + 'px'; } catch (e) {}
    const maxW = (K.parNum(op, 'wrap') / 100) * w;
    const lines = [];
    String(txt).split('\n').forEach((para) => {
      const words = para.split(' ');
      let line = '';
      words.forEach((wd) => {
        const test = line ? line + ' ' + wd : wd;
        if (g.measureText(test).width > maxW && line) { lines.push(line); line = wd; } else line = test;
      });
      lines.push(line);
    });
    const lh = px * K.parNum(op, 'leading');
    const total = lh * lines.length;
    const ax = K.par(op, 'alignx'), ay = K.par(op, 'aligny');
    const ox = K.parNum(op, 'px') * w * 0.5, oy = -K.parNum(op, 'py') * h * 0.5;
    let x = ax === 'left' ? (w - maxW) / 2 : ax === 'right' ? w - (w - maxW) / 2 : w / 2;
    let y0 = ay === 'top' ? h * 0.06 : ay === 'bottom' ? h * 0.94 - total : (h - total) / 2;
    g.textAlign = ax; g.textBaseline = 'middle';
    g.fillStyle = K.par(op, 'color');
    g.globalAlpha = K.parNum(op, 'alpha');
    const reveal = U.clamp(K.parNum(op, 'reveal'), 0, 1);
    const totalChars = lines.reduce((s, l) => s + l.length, 0);
    let budget = Math.round(totalChars * reveal);
    lines.forEach((l, i) => {
      const part = budget >= l.length ? l : l.slice(0, Math.max(0, budget));
      budget -= l.length;
      if (part) g.fillText(part, x + ox, y0 + lh * (i + 0.5) + oy);
    });
    g.globalAlpha = 1;
  }

  /* ---------- Text animation (per-character) ---------- */
  const TEXT_ANIM_KEYS = ['anim', 'motion', 'unit', 'order', 'clock', 'progress', 'astart', 'stagger', 'adur', 'ease', 'aloop', 'hold', 'amount', 'aspeed', 'spread', 'cursor', 'aseed'];
  const SCRAMBLE = '!<>-_\\/[]{}=+*^?#%&@$ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  const hash = (a, b) => { const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return x - Math.floor(x); };
  const EASE = {
    linear: (p) => p,
    out: (p) => 1 - Math.pow(1 - p, 3),
    smooth: (p) => p * p * (3 - 2 * p),
    back: (p) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); },
    elastic: (p) => (p <= 0 ? 0 : p >= 1 ? 1 : Math.pow(2, -10 * p) * Math.sin((p * 10 - 0.75) * (2 * Math.PI / 3)) + 1),
  };
  const bounceOut = (p) => { const n = 7.5625, d = 2.75;
    if (p < 1 / d) return n * p * p; if (p < 2 / d) return n * (p -= 1.5 / d) * p + 0.75;
    if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + 0.9375; return n * (p -= 2.625 / d) * p + 0.984375; };

  // Timing state: decides the entrance clock and whether we need to redraw this frame.
  function textAnimState(op, txt) {
    const anim = K.par(op, 'anim'), motion = K.par(op, 'motion');
    const entrance = TEXT_ENTRANCES.includes(anim);
    const cont = (anim !== 'none' && !entrance) || motion !== 'none';
    const units = Math.max(1, op.rt.unitCount || txt.length || 1);
    const stagger = Math.max(0, K.parNum(op, 'stagger')), dur = Math.max(0.01, K.parNum(op, 'adur'));
    const total = dur + (units - 1) * stagger;
    let T;
    if (K.par(op, 'clock') === 'progress') T = U.clamp(K.parNum(op, 'progress'), 0, 1) * total;
    else {
      T = K.time.seconds - K.parNum(op, 'astart');
      if (K.par(op, 'aloop') && T > 0) T = T % (total + Math.max(0, K.parNum(op, 'hold')));
    }
    const t = K.time.seconds;
    const cursorBlink = entrance && anim === 'typewriter' && K.par(op, 'cursor');
    let stamp;
    if (cont) stamp = t.toFixed(4);
    else if (entrance && (T > 0 && T < total || anim === 'scramble' && T > 0 && T < total + 0.05)) stamp = 'e' + T.toFixed(4);
    else stamp = T <= 0 ? 'pre' : 'done';
    if (cursorBlink) stamp += '|c' + (Math.floor(t * 2) % 2);
    return { anim, motion, entrance, T, t, total, stagger, dur, stamp };
  }

  function textLayout(op, g, w, h, txt) {
    const lkey = [w, h, txt, g.font, K.parNum(op, 'tracking'), K.par(op, 'leading'), K.par(op, 'alignx'), K.par(op, 'aligny'), K.par(op, 'px'), K.par(op, 'py'), K.par(op, 'wrap'), K.par(op, 'unit'), K.par(op, 'order'), K.par(op, 'aseed'), K.fontEpoch || 0].join('|');
    if (op.rt.layout && op.rt.layoutKey === lkey) return op.rt.layout;
    const px = (K.parNum(op, 'size') / 100) * h;
    const track = K.parNum(op, 'tracking') * px;
    const meas = (str) => g.measureText(str).width + str.length * track;
    const maxW = (K.parNum(op, 'wrap') / 100) * w;
    const lines = [];
    String(txt).split('\n').forEach((para) => {
      let line = '';
      para.split(' ').forEach((wd) => { const test = line ? line + ' ' + wd : wd; if (meas(test) > maxW && line) { lines.push(line); line = wd; } else line = test; });
      lines.push(line);
    });
    const lh = px * K.parNum(op, 'leading'), total = lh * lines.length;
    const ax = K.par(op, 'alignx'), ay = K.par(op, 'aligny');
    const ox = K.parNum(op, 'px') * w * 0.5, oy = -K.parNum(op, 'py') * h * 0.5;
    const x = ax === 'left' ? (w - maxW) / 2 : ax === 'right' ? w - (w - maxW) / 2 : w / 2;
    const y0 = ay === 'top' ? h * 0.06 : ay === 'bottom' ? h * 0.94 - total : (h - total) / 2;
    const unit = K.par(op, 'unit');
    const chars = []; let word = 0, ci = 0;
    lines.forEach((l, li) => {
      const lw = meas(l);
      const lx = (ax === 'left' ? x : ax === 'right' ? x - lw : x - lw / 2) + ox;
      const cy = y0 + lh * (li + 0.5) + oy;
      let inWord = false;
      for (let i = 0; i < l.length; i++) {
        const ch = l[i];
        if (ch === ' ') { if (inWord) word++; inWord = false; }
        else inWord = true;
        const cw = g.measureText(ch).width;
        const cx = lx + g.measureText(l.slice(0, i)).width + i * track + cw / 2;
        chars.push({ ch, cx, cy, cw, line: li, word, idx: ci++, lineLen: l.length, pos: i, lineW: lw, lineX: lx });
      }
      if (inWord) word++;
    });
    // unit index used for staggering
    chars.forEach((c) => { c.u = unit === 'word' ? c.word : unit === 'line' ? c.line : c.idx; });
    const n = chars.length ? Math.max(...chars.map((c) => c.u)) + 1 : 1;
    const order = K.par(op, 'order'), seed = K.parNum(op, 'aseed');
    const perm = [...Array(n).keys()];
    if (order === 'random') { for (let i = n - 1; i > 0; i--) { const j = Math.floor(hash(i, seed) * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; } }
    const mid = (n - 1) / 2;
    chars.forEach((c) => {
      c.o = order === 'reverse' ? n - 1 - c.u : order === 'center out' ? Math.abs(c.u - mid) : order === 'edges in' ? mid - Math.abs(c.u - mid) : order === 'random' ? perm[c.u] : c.u;
    });
    const span = order === 'center out' || order === 'edges in' ? Math.ceil(mid) + 1 : n;
    op.rt.unitCount = span;
    op.rt.layout = { chars, px, track, lh, ax };
    op.rt.layoutKey = lkey;
    return op.rt.layout;
  }

  // Applies a mode to a glyph state s = {dx, dy, rot, sx, sy, alpha, blur, ch, extra}
  function applyMotion(mode, s, c, A, px, amt, speed, spread, seed, L) {
    const ph = (A.t * speed - c.o * spread) * Math.PI * 2;
    switch (mode) {
      case 'wave': s.dy += Math.sin(ph) * 0.22 * px * amt; break;
      case 'bounce': s.dy -= Math.abs(Math.sin(ph * 0.5)) * 0.35 * px * amt; break;
      case 'float': s.dy += Math.sin(ph * 0.6) * 0.12 * px * amt; s.dx += Math.cos(ph * 0.45 + c.idx) * 0.05 * px * amt; s.rot += Math.sin(ph * 0.5 + c.idx * 0.7) * 0.14 * amt; break;
      case 'pulse': { const k = 1 + Math.sin(ph) * 0.18 * amt; s.sx *= k; s.sy *= k; break; }
      case 'shake': { const f = Math.floor(A.t * 30 * Math.max(0.1, speed)); s.dx += (hash(c.idx + 1, f + seed) - 0.5) * 0.14 * px * amt; s.dy += (hash(c.idx + 7, f * 1.3 + seed) - 0.5) * 0.14 * px * amt; break; }
      case 'rotate': s.rot += Math.sin(ph) * 0.35 * amt; break;
      case 'flip': s.sx *= Math.cos(ph * 0.5); break;
      case 'tracking': {
        const e = (Math.sin(A.t * speed * Math.PI * 2) * 0.5 + 0.5) * 0.35 * px * amt;
        const rel = L.ax === 'left' ? c.pos : L.ax === 'right' ? c.pos - (c.lineLen - 1) : c.pos - (c.lineLen - 1) / 2;
        s.dx += rel * e; break;
      }
      case 'orbit': s.dx += Math.cos(ph) * 0.16 * px * amt; s.dy += Math.sin(ph) * 0.09 * px * amt; break;
      case 'glitch': {
        const f = Math.floor(A.t * 12 * Math.max(0.1, speed));
        const r = hash(c.u + 3.1, f + seed);
        if (r < 0.12 * Math.min(amt, 4) + 0.02) {
          s.dx += (hash(c.u, f * 2.7) - 0.5) * 0.6 * px * amt; s.dy += (hash(c.u * 1.7, f) - 0.5) * 0.12 * px * amt;
          s.alpha *= 0.35 + 0.4 * hash(c.idx, f); s.glitch = true;
          if (hash(c.idx, f + 9) < 0.35) s.ch = SCRAMBLE[Math.floor(hash(c.idx, f + 5) * SCRAMBLE.length)];
        }
        break;
      }
    }
  }

  function drawTextAnimated(op, w, h, txt, A) {
    const c2 = op.rt.canvas, g = op.rt.ctx2d;
    if (c2.width !== w || c2.height !== h) { c2.width = w; c2.height = h; }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, w, h);
    const bga = K.parNum(op, 'bga');
    if (bga > 0) { g.globalAlpha = bga; g.fillStyle = K.par(op, 'bg'); g.fillRect(0, 0, w, h); g.globalAlpha = 1; }
    const px = (K.parNum(op, 'size') / 100) * h;
    g.font = (K.par(op, 'italic') ? 'italic ' : '') + K.par(op, 'weight') + ' ' + px + 'px "' + K.par(op, 'font') + '", system-ui, sans-serif';
    try { g.letterSpacing = '0px'; } catch (e) {}
    const L = textLayout(op, g, w, h, txt);
    // re-evaluate timing now that the unit count is known
    if (op.rt.unitCount && A.entrance) Object.assign(A, textAnimState(op, txt));
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const color = K.par(op, 'color'), baseA = K.parNum(op, 'alpha');
    const amt = K.parNum(op, 'amount'), speed = K.parNum(op, 'aspeed'), spread = K.parNum(op, 'spread'), seed = K.parNum(op, 'aseed');
    const ease = EASE[K.par(op, 'ease')] || EASE.out;
    const capN = Math.round(L.chars.length * U.clamp(K.parNum(op, 'reveal'), 0, 1));
    let lastVisible = null;
    for (const c of L.chars) {
      if (c.idx >= capN) break;
      if (c.ch === ' ') continue;
      const s = { dx: 0, dy: 0, rot: 0, sx: 1, sy: 1, alpha: 1, blur: 0, ch: c.ch };
      if (A.entrance) {
        const p = U.clamp((A.T - c.o * A.stagger) / A.dur, 0, 1), e = ease(p), inv = 1 - e;
        const off = px * 1.1 * amt;
        switch (A.anim) {
          case 'typewriter': if (A.T < c.o * A.stagger) s.alpha = 0; break;
          case 'fade': s.alpha = e; break;
          case 'slide up': s.dy = inv * off; s.alpha = Math.min(1, p * 2.5); break;
          case 'slide down': s.dy = -inv * off; s.alpha = Math.min(1, p * 2.5); break;
          case 'slide left': s.dx = inv * off; s.alpha = Math.min(1, p * 2.5); break;
          case 'slide right': s.dx = -inv * off; s.alpha = Math.min(1, p * 2.5); break;
          case 'pop': { const k = Math.max(0, EASE.back(p)); s.sx = s.sy = k; s.alpha = Math.min(1, p * 3); break; }
          case 'blur in': s.blur = inv * px * 0.35 * amt; s.alpha = e; break;
          case 'scramble':
            if (p <= 0) s.alpha = 0;
            else if (p < 1) s.ch = SCRAMBLE[Math.floor(hash(c.idx + seed, Math.floor(A.T * 24)) * SCRAMBLE.length)];
            break;
          case 'rain': if (p <= 0) s.alpha = 0; else s.dy = -(1 - bounceOut(p)) * (c.cy + px) * Math.min(1, amt); break;
        }
      } else if (A.anim !== 'none') applyMotion(A.anim, s, c, A, px, amt, speed, spread, seed, L);
      if (A.motion !== 'none') applyMotion(A.motion, s, c, A, px, amt, speed, spread, seed, L);
      if (s.alpha <= 0.002) continue;
      lastVisible = c;
      g.setTransform(1, 0, 0, 1, c.cx + s.dx, c.cy + s.dy);
      if (s.rot) g.rotate(s.rot);
      if (s.sx !== 1 || s.sy !== 1) g.scale(s.sx || 0.0001, s.sy || 0.0001);
      g.fillStyle = color;
      if (s.blur > 0.5) {
        // portable blur (canvas filter is missing on Safari): ring of faint copies
        const taps = 8, r = s.blur;
        g.globalAlpha = baseA * s.alpha * 0.22;
        for (let k = 0; k < taps; k++) { const a = (k / taps) * Math.PI * 2; g.fillText(s.ch, Math.cos(a) * r, Math.sin(a) * r * 0.6); }
        g.globalAlpha = baseA * s.alpha * 0.5 * Math.max(0, 1 - r / (px * 0.35));
        g.fillText(s.ch, 0, 0);
      } else {
        if (s.glitch) { g.globalAlpha = baseA * s.alpha * 0.7; g.fillStyle = '#ff2a5f'; g.fillText(s.ch, -px * 0.04, 0); g.fillStyle = '#29e3ff'; g.fillText(s.ch, px * 0.04, 0); g.fillStyle = color; }
        g.globalAlpha = baseA * s.alpha;
        g.fillText(s.ch, 0, 0);
      }
    }
    // typewriter cursor
    if (A.entrance && A.anim === 'typewriter' && K.par(op, 'cursor') && (Math.floor(A.t * 2) % 2 === 0 || (A.T > 0 && A.T < A.total))) {
      let cx, cy;
      if (lastVisible) { cx = lastVisible.cx + lastVisible.cw / 2 + px * 0.06; cy = lastVisible.cy; }
      else if (L.chars.length) { cx = L.chars[0].lineX; cy = L.chars[0].cy; }
      if (cx != null) { g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = baseA; g.fillStyle = color; g.fillRect(cx, cy - px * 0.42, Math.max(2, px * 0.07), px * 0.84); }
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
  }

  /* ---------- Movie File In ---------- */
  K.defineOp({
    type: 'moviefileinTOP', label: 'Movie File In', short: 'moviefilein', family: 'TOP', gen: true,
    help: 'Load an image or video file (mp4, webm, mov, png, jpg, gif). Files stay local to your device.',
    params: [
      { name: 'file', label: 'File', type: 'file', accept: 'image/*,video/*,.mp4,.m4v,.mov,.webm,.png,.jpg,.jpeg,.gif,.webp,.heic', default: '' },
      { name: 'url', label: 'or URL', type: 'string', default: '' },
      { name: 'play', label: 'Play', type: 'toggle', default: true },
      { name: 'loop', label: 'Loop', type: 'toggle', default: true },
      { name: 'speed', label: 'Speed', type: 'float', default: 1, min: 0, max: 4 },
      { name: 'audio', label: 'Play Audio', type: 'toggle', default: false },
      { name: 'cue', label: 'Cue (restart)', type: 'pulse' },
    ],
    create(op) {},
    destroy(op) { dropVideo(op); },
    pulse(op, name) { if (name === 'cue' && op.rt.video) op.rt.video.currentTime = 0; },
    cook(op, ctx) {
      const fid = K.par(op, 'file');
      const m = fid && K.media.get(fid);
      const src = m ? m.url : String(K.par(op, 'url') || '').trim();
      if (src !== op.rt.src) {
        op.rt.src = src; op.rt.ready = false; op.rt.loadErr = null; op.rt.primed = false;
        dropVideo(op);
        op.rt.img = null;
        if (src) {
          const kind = U.mediaKind(m && m.type, m ? m.name : src);
          if (kind === 'video') {
            const v = document.createElement('video');
            // blob:/data: URLs are same-origin; only ask for CORS on remote URLs
            if (/^https?:/i.test(src)) v.crossOrigin = 'anonymous';
            v.muted = true; v.defaultMuted = true; v.playsInline = true; v.loop = true; v.preload = 'auto';
            v.setAttribute('playsinline', ''); v.setAttribute('webkit-playsinline', ''); v.setAttribute('muted', '');
            const ok = () => { op.rt.ready = true; op.rt.loadErr = null; };
            v.addEventListener('loadeddata', ok);
            v.addEventListener('canplay', ok);
            v.addEventListener('error', () => {
              const code = v.error && v.error.code;
              op.rt.loadErr = code === 4
                ? 'This browser can\'t play this video format' + (m ? ' (' + m.name + ')' : '') + '. Export it as H.264 MP4 and try again.'
                : 'Could not load video' + (code ? ' (error ' + code + ')' : '');
            });
            U.mediaHolder().appendChild(v);
            v.src = src;
            try { v.load(); } catch (e) {}
            // iOS will not fetch any frames until play() is called, so start it
            // muted right away (allowed without a tap) and pause later if needed.
            v._wantPlay = true; U.tryPlay(v);
            op.rt.video = v;
          } else {
            const im = new Image();
            if (/^https?:/i.test(src)) im.crossOrigin = 'anonymous';
            im.onload = () => { op.rt.ready = true; op.rt.dirty = true; op.rt.loadErr = null; };
            im.onerror = () => { op.rt.loadErr = 'Could not load this image' + (m ? ' (' + m.name + ')' : '') + '. Try PNG or JPG.'; };
            im.src = src; op.rt.img = im;
          }
        }
      }
      if (!src) { op.warn = 'Choose a file'; return E.black; }
      if (op.rt.loadErr) { op.warn = op.rt.loadErr; return op.rt.tex || E.black; }
      const v = op.rt.video;
      if (v && v.readyState >= 2) op.rt.ready = true;
      if (!op.rt.ready) { op.warn = 'Loading…'; return op.rt.tex || E.black; }
      if (v) {
        v.loop = !!K.par(op, 'loop');
        v.playbackRate = Math.max(0.0625, K.parNum(op, 'speed'));
        const wantAudio = !!K.par(op, 'audio');
        v.muted = !wantAudio;
        const shouldPlay = K.par(op, 'play') && K.time.playing && K.parNum(op, 'speed') > 0;
        v._wantPlay = shouldPlay;
        if (shouldPlay && v.paused) U.tryPlay(v);
        if (!shouldPlay && !v.paused && op.rt.tex) v.pause();
        if (shouldPlay && v.paused && wantAudio) op.warn = 'Tap anywhere to start video sound';
        op.rt.tex = E.upload(op.rt.tex, v);
      } else if (op.rt.img && (op.rt.dirty || !op.rt.tex)) {
        op.rt.tex = E.upload(op.rt.tex, op.rt.img); op.rt.dirty = false;
      }
      return op.rt.tex || E.black;
    },
  });
  function dropVideo(op) {
    const v = op.rt.video;
    if (!v) return;
    v._wantPlay = false; U.pendingPlay.delete(v);
    try { v.pause(); v.removeAttribute('src'); v.load(); } catch (e) {}
    v.remove();
    op.rt.video = null;
  }

  /* ---------- Video Device In / Screen Grab ---------- */
  function streamTOP(type, label, short, help, getStream, extraParams) {
    K.defineOp({
      type, label, short, family: 'TOP', gen: true, help,
      params: [{ name: 'start', label: 'Start Device', type: 'pulse' }, { name: 'stop', label: 'Stop', type: 'pulse' }].concat(extraParams || []).concat([
        { name: 'mirror', label: 'Mirror', type: 'toggle', default: type === 'videodeviceinTOP' },
      ]),
      destroy(op) { stop(op); },
      pulse(op, name) {
        if (name === 'stop') return stop(op);
        if (name !== 'start') return;
        stop(op);
        getStream(op).then((s) => {
          const v = document.createElement('video');
          v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.srcObject = s;
          v.play().catch(() => {});
          op.rt.stream = s; op.rt.video = v;
        }).catch((e) => { op.rt.err = 'Permission denied or unavailable: ' + e.message; K.toast(op.rt.err); });
      },
      cook(op, ctx) {
        const v = op.rt.video;
        if (!v) { op.warn = op.rt.err || 'Press Start Device (needs permission)'; return E.black; }
        if (v.readyState >= 2) op.rt.raw = E.upload(op.rt.raw, v);
        if (!op.rt.raw) return E.black;
        if (!K.par(op, 'mirror')) return op.rt.raw;
        op.rt.target = E.ensure(op.rt.target, op.rt.raw.w, op.rt.raw.h);
        E.pass(E.program('__mirror', 'void main(){ fragColor=texture(sIn0,vec2(1.0-vUV.x,vUV.y)); }'), { sIn0: op.rt.raw }, op.rt.target);
        return op.rt.target;
      },
    });
    function stop(op) { if (op.rt.stream) op.rt.stream.getTracks().forEach((t) => t.stop()); op.rt.stream = null; op.rt.video = null; }
  }
  streamTOP('videodeviceinTOP', 'Video Device In', 'videodevin', 'Webcam / iPad camera input. Press Start Device and allow camera access.',
    (op) => navigator.mediaDevices.getUserMedia({ video: { facingMode: K.par(op, 'facing'), width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }),
    [{ name: 'facing', label: 'Camera', type: 'menu', options: ['user', 'environment'], default: 'user' }]);
  streamTOP('screengrabTOP', 'Screen Grab', 'screengrab', 'Capture a screen, window or browser tab (e.g. your slide deck) as a live texture. Desktop browsers only.',
    () => navigator.mediaDevices.getDisplayMedia({ video: true, audio: false }));

  /* ---------- GLSL TOP (Shadertoy compatible) ---------- */
  K.DEFAULT_GLSL = `// Shadertoy-style. Inputs: iChannel0..3, iTime, iResolution, u0..u3 (params)
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 uv = (fragCoord - 0.5*iResolution.xy) / iResolution.y;
  float d = length(uv);
  vec3 col = 0.5 + 0.5*cos(iTime*0.6 + d*8.0*(1.0+u0) + vec3(0.0,2.0,4.0));
  col *= smoothstep(0.9, 0.2, d);
  vec4 tex = texture(iChannel0, fragCoord/iResolution.xy);
  fragColor = vec4(mix(col, tex.rgb, tex.a*u1), 1.0);
}`;
  K.defineOp({
    type: 'glslTOP', label: 'GLSL', short: 'glsl', family: 'TOP', inputs: 4, minInputs: 0,
    help: 'Write your own pixel shader. Paste Shadertoy code directly. Up to 4 inputs; u0–u3 accept expressions.',
    params: [
      { name: 'code', label: 'Pixel Shader', type: 'code', lang: 'glsl', default: K.DEFAULT_GLSL },
      { name: 'dat', label: 'Shader DAT (optional)', type: 'op', family: 'DAT', default: '' },
      { name: 'u0', label: 'u0', type: 'float', default: 0.0, min: 0, max: 1, page: 'Uniforms' },
      { name: 'u1', label: 'u1', type: 'float', default: 1.0, min: 0, max: 1, page: 'Uniforms' },
      { name: 'u2', label: 'u2', type: 'float', default: 0.0, min: 0, max: 1, page: 'Uniforms' },
      { name: 'u3', label: 'u3', type: 'float', default: 0.0, min: 0, max: 1, page: 'Uniforms' },
      { name: 'c0', label: 'Color c0', type: 'color', default: '#ff5a36', page: 'Uniforms' },
    ],
    cook(op, ctx) {
      const ins = [0, 1, 2, 3].map((i) => ctx.input(op, i));
      const size = ctx.size(op, ins[0]);
      op.rt.target = E.ensure(op.rt.target, size[0], size[1]);
      let code = String(K.par(op, 'code') || '');
      const dat = ctx.ref(op, 'dat', 'DAT');
      if (dat) { const o = K.cook(dat); if (o && o.text) code = o.text; }
      const wrap = `uniform float iTime; uniform vec3 iResolution; uniform vec4 iMouse; uniform float iFrame;
uniform float u0; uniform float u1; uniform float u2; uniform float u3; uniform vec3 c0;
#define iChannel0 sIn0
#define iChannel1 sIn1
#define iChannel2 sIn2
#define iChannel3 sIn3
`;
      const body = wrap + code + `
void main(){ vec4 c=vec4(0.0); mainImage(c, gl_FragCoord.xy); fragColor=c; }`;
      const prog = E.program('glsl_' + op.id, body, { lineOffset: wrap.split('\n').length - 1 });
      const m = K.mouse || { x: 0, y: 0, down: 0 };
      const u = {
        uRes: [op.rt.target.w, op.rt.target.h], uTime: K.time.seconds, iTime: K.time.seconds, iFrame: K.time.frame,
        iResolution: [op.rt.target.w, op.rt.target.h, 1], iMouse: [m.x * op.rt.target.w, m.y * op.rt.target.h, m.down, 0],
        u0: K.parNum(op, 'u0'), u1: K.parNum(op, 'u1'), u2: K.parNum(op, 'u2'), u3: K.parNum(op, 'u3'), c0: U.hexToRgb(K.par(op, 'c0')),
      };
      ins.forEach((t, i) => { u['sIn' + i] = t; if (i < 2) u['uIn' + i + 'Res'] = [t ? t.w : 1, t ? t.h : 1]; });
      E.pass(prog, u, op.rt.target);
      return op.rt.target;
    },
  });

  /* ---------- CHOP to TOP ---------- */
  K.defineOp({
    type: 'choptoTOP', label: 'CHOP to TOP', short: 'chopto', family: 'TOP', gen: true,
    help: 'Draw CHOP channels as a waveform, bar spectrum, circular scope, or raw data texture.',
    params: [
      { name: 'chop', label: 'CHOP', type: 'op', family: 'CHOP', default: '' },
      { name: 'mode', label: 'Draw Mode', type: 'menu', options: ['waveform', 'bars', 'radial', 'data'], default: 'bars' },
      { name: 'gain', label: 'Gain', type: 'float', default: 1, min: 0, max: 8 },
      { name: 'thick', label: 'Thickness', type: 'float', default: 0.006, min: 0.001, max: 0.1 },
      { name: 'color', label: 'Color', type: 'color', default: '#f4f0e8' },
      { name: 'color2', label: 'Peak Color', type: 'color', default: '#ff5a36' },
      { name: 'bga', label: 'Background Alpha', type: 'float', default: 0, min: 0, max: 1 },
    ],
    cook(op, ctx) {
      const out = ctx.refOut(op, 'chop', 'CHOP');
      let data = new Float32Array([0]);
      if (out && out.chans && out.chans.length) {
        const ch0 = out.chans[0];
        if (ch0.data.length > 1) data = ch0.data;
        else data = new Float32Array(out.chans.map((c) => c.data[0]));
      } else op.warn = 'Pick a CHOP';
      const g = K.parNum(op, 'gain');
      const mode = K.par(op, 'mode');
      const scaled = new Float32Array(data.length);
      for (let i = 0; i < data.length; i++) scaled[i] = mode === 'waveform' ? data[i] * g * 0.5 + 0.5 : data[i] * g;
      op.rt.data = E.uploadFloatRow(op.rt.data, scaled);
      const size = ctx.size(op, null);
      op.rt.target = E.ensure(op.rt.target, size[0], size[1]);
      const prog = E.program('choptoTOP', `uniform int uMode; uniform float uThick; uniform vec3 uC; uniform vec3 uC2; uniform float uBga; uniform float uN;
void main(){ vec2 uv=vUV; vec4 bg=vec4(0.,0.,0.,uBga); float m=0.; float v;
 if(uMode==0){ v=texture(sIn0,vec2(uv.x,0.5)).r; float d=abs(uv.y-v); float aa=1.5/uRes.y; m=1.-smoothstep(uThick-aa,uThick+aa,d); }
 else if(uMode==1){ float n=max(uN,1.); float i=floor(uv.x*n); float fx=fract(uv.x*n); v=texture(sIn0,vec2((i+.5)/n,.5)).r; m=step(uv.y,v)*step(0.12,fx)*step(fx,0.88); }
 else if(uMode==2){ vec2 p=(uv-.5)*vec2(uRes.x/uRes.y,1.); float a=atan(p.y,p.x)/TAU+.5; v=texture(sIn0,vec2(a,.5)).r; float r=.22+v*.22; float d=abs(length(p)-r); m=1.-smoothstep(uThick,uThick+2./uRes.y,d); }
 else { v=texture(sIn0,vec2(uv.x,.5)).r; fragColor=vec4(vec3(v),1.); return; }
 vec3 c=mix(uC,uC2,clamp(v,0.,1.)); fragColor=mix(bg,vec4(c,1.),m); }`);
      E.pass(prog, { sIn0: op.rt.data, uMode: ['waveform', 'bars', 'radial', 'data'].indexOf(mode), uThick: K.parNum(op, 'thick'), uC: U.hexToRgb(K.par(op, 'color')), uC2: U.hexToRgb(K.par(op, 'color2')), uBga: K.parNum(op, 'bga'), uN: Math.min(data.length, 256), uRes: [op.rt.target.w, op.rt.target.h] }, op.rt.target);
      return op.rt.target;
    },
  });

  /* ================= FILTERS ================= */
  shaderTOP({
    type: 'levelTOP', label: 'Level', short: 'level',
    help: 'Brightness, contrast, gamma, opacity, invert.',
    params: [
      { name: 'bright', label: 'Brightness', type: 'float', default: 1, min: 0, max: 4 },
      { name: 'contrast', label: 'Contrast', type: 'float', default: 1, min: 0, max: 4 },
      { name: 'gamma', label: 'Gamma', type: 'float', default: 1, min: 0.1, max: 4 },
      { name: 'black', label: 'Black Level', type: 'float', default: 0, min: 0, max: 1 },
      { name: 'opacity', label: 'Opacity', type: 'float', default: 1, min: 0, max: 1 },
      { name: 'invert', label: 'Invert', type: 'float', default: 0, min: 0, max: 1 },
    ],
    fs: `uniform float uB; uniform float uC; uniform float uG; uniform float uBl; uniform float uO; uniform float uI;
void main(){ vec4 c=texture(sIn0,vUV); vec3 r=c.rgb; r=mix(r,1.0-r,uI); r=(r-uBl)/max(1.0-uBl,0.001); r=(r-0.5)*uC+0.5; r*=uB; r=pow(max(r,0.),vec3(1.0/uG)); fragColor=vec4(r,c.a)*uO; }`,
    uniforms: (op) => ({ uB: K.parNum(op, 'bright'), uC: K.parNum(op, 'contrast'), uG: K.parNum(op, 'gamma'), uBl: K.parNum(op, 'black'), uO: K.parNum(op, 'opacity'), uI: K.parNum(op, 'invert') }),
  });

  shaderTOP({
    type: 'hsvadjustTOP', label: 'HSV Adjust', short: 'hsvadjust',
    help: 'Rotate hue, scale saturation and value.',
    params: [
      { name: 'hue', label: 'Hue Offset', type: 'float', default: 0, min: -1, max: 1 },
      { name: 'sat', label: 'Saturation', type: 'float', default: 1, min: 0, max: 4 },
      { name: 'val', label: 'Value', type: 'float', default: 1, min: 0, max: 4 },
    ],
    fs: `uniform float uH; uniform float uS; uniform float uV;
void main(){ vec4 c=texture(sIn0,vUV); vec3 h=rgb2hsv(c.rgb); h.x=fract(h.x+uH); h.y=clamp(h.y*uS,0.,1.); h.z*=uV; fragColor=vec4(hsv2rgb(h),c.a); }`,
    uniforms: (op) => ({ uH: K.parNum(op, 'hue'), uS: K.parNum(op, 'sat'), uV: K.parNum(op, 'val') }),
  });

  // Blur — separable gaussian, multi-pass
  const BLUR_FS = `uniform vec2 uDir;
void main(){ vec2 px=uDir/uRes; vec4 s=texture(sIn0,vUV)*0.227027;
 s+=texture(sIn0,vUV+px*1.3846)*0.316216; s+=texture(sIn0,vUV-px*1.3846)*0.316216;
 s+=texture(sIn0,vUV+px*3.2308)*0.070270; s+=texture(sIn0,vUV-px*3.2308)*0.070270; fragColor=s; }`;
  function blurInto(op, src, size, passes, key) {
    const w = src.w, h = src.h;
    op.rt[key + 'A'] = E.ensure(op.rt[key + 'A'], w, h);
    op.rt[key + 'B'] = E.ensure(op.rt[key + 'B'], w, h);
    const prog = E.program('__blur', BLUR_FS);
    let cur = src;
    for (let i = 0; i < passes; i++) {
      const s = size * (1 + i * 0.6);
      E.pass(prog, { sIn0: cur, uDir: [s, 0], uRes: [w, h] }, op.rt[key + 'A']);
      E.pass(prog, { sIn0: op.rt[key + 'A'], uDir: [0, s], uRes: [w, h] }, op.rt[key + 'B']);
      cur = op.rt[key + 'B'];
    }
    return cur;
  }
  K.blurInto = blurInto;
  K.defineOp({
    type: 'blurTOP', label: 'Blur', short: 'blur', family: 'TOP',
    help: 'Gaussian blur (multi-pass, GPU).',
    params: [
      { name: 'size', label: 'Size', type: 'float', default: 4, min: 0, max: 60 },
      { name: 'passes', label: 'Passes', type: 'int', default: 2, min: 1, max: 6 },
    ],
    cook(op, ctx) {
      const src = ctx.input(op, 0);
      const s = K.parNum(op, 'size');
      if (!src || s <= 0) return src;
      const size = ctx.size(op, src);
      let base = src;
      if (size[0] !== src.w || size[1] !== src.h) {
        op.rt.rs = E.ensure(op.rt.rs, size[0], size[1]);
        E.pass(E.program('__copyin', 'void main(){ fragColor=texture(sIn0,vUV); }'), { sIn0: src }, op.rt.rs);
        base = op.rt.rs;
      }
      return blurInto(op, base, s, K.parNum(op, 'passes'), 'b');
    },
  });

  shaderTOP({
    type: 'transformTOP', label: 'Transform', short: 'transform',
    help: 'Translate, scale, rotate with extend modes (hold, zero, repeat, mirror).',
    params: [
      { name: 'tx', label: 'Translate X', type: 'float', default: 0, min: -1, max: 1, row: 't' },
      { name: 'ty', label: 'Translate Y', type: 'float', default: 0, min: -1, max: 1, row: 't' },
      { name: 'sx', label: 'Scale X', type: 'float', default: 1, min: 0, max: 8, row: 's' },
      { name: 'sy', label: 'Scale Y', type: 'float', default: 1, min: 0, max: 8, row: 's' },
      { name: 'uniform', label: 'Uniform Scale', type: 'float', default: 1, min: 0, max: 8 },
      { name: 'rotate', label: 'Rotate', type: 'float', default: 0, min: -360, max: 360 },
      { name: 'extend', label: 'Extend', type: 'menu', options: ['zero', 'hold', 'repeat', 'mirror'], default: 'zero' },
      FIT,
    ],
    fs: `uniform vec2 uT; uniform vec2 uS; uniform float uRot; uniform int uExt; uniform int uFit;
void main(){ vec2 a=vec2(uRes.x/uRes.y,1.0); vec2 p=(vUV-0.5)*a; p-=uT*a*0.5; float r=radians(-uRot); p=mat2(cos(r),-sin(r),sin(r),cos(r))*p; p/=max(abs(uS),vec2(1e-4))*sign(uS+1e-6); vec2 uv=p/a+0.5;
 uv=fitUV(uv,uIn0Res,uRes,uFit);
 if(uExt==2) uv=fract(uv); else if(uExt==3) uv=1.0-abs(mod(uv,2.0)-1.0); else if(uExt==1) uv=clamp(uv,0.,1.);
 vec4 c=texture(sIn0,uv); if(uExt==0&&(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.)) c=vec4(0.); fragColor=c; }`,
    uniforms: (op) => {
      const us = K.parNum(op, 'uniform');
      return { uT: [K.parNum(op, 'tx'), K.parNum(op, 'ty')], uS: [K.parNum(op, 'sx') * us, K.parNum(op, 'sy') * us], uRot: K.parNum(op, 'rotate'), uExt: ['zero', 'hold', 'repeat', 'mirror'].indexOf(K.par(op, 'extend')), uFit: fitIdx(K.par(op, 'fit')) };
    },
  });

  shaderTOP({
    type: 'kaleidoTOP', label: 'Kaleido', short: 'kaleido',
    help: 'Kaleidoscope and mirror symmetry.',
    params: [
      { name: 'mode', label: 'Mode', type: 'menu', options: ['kaleido', 'mirror x', 'mirror y', 'quad'], default: 'kaleido' },
      { name: 'segments', label: 'Segments', type: 'int', default: 6, min: 2, max: 32 },
      { name: 'rotate', label: 'Rotate', type: 'float', default: 0, min: -360, max: 360 },
      { name: 'zoom', label: 'Zoom', type: 'float', default: 1, min: 0.1, max: 8 },
      { name: 'ox', label: 'Offset X', type: 'float', default: 0, min: -1, max: 1, row: 'o' },
      { name: 'oy', label: 'Offset Y', type: 'float', default: 0, min: -1, max: 1, row: 'o' },
    ],
    fs: `uniform int uMode; uniform float uSeg; uniform float uRot; uniform float uZoom; uniform vec2 uO;
void main(){ vec2 uv=vUV;
 if(uMode==1){ uv.x=0.5-abs(uv.x-0.5); }
 else if(uMode==2){ uv.y=0.5-abs(uv.y-0.5); }
 else if(uMode==3){ uv=0.5-abs(uv-0.5); }
 else { vec2 p=(uv-0.5)*vec2(uRes.x/uRes.y,1.0); float r=length(p)/uZoom; float a=atan(p.y,p.x)+radians(uRot); float s=TAU/uSeg; a=mod(a,s); a=abs(a-s*0.5); p=vec2(cos(a),sin(a))*r; uv=p+0.5+uO*0.5; uv=1.0-abs(mod(uv,2.0)-1.0); }
 fragColor=texture(sIn0,uv); }`,
    uniforms: (op) => ({ uMode: ['kaleido', 'mirror x', 'mirror y', 'quad'].indexOf(K.par(op, 'mode')), uSeg: K.parNum(op, 'segments'), uRot: K.parNum(op, 'rotate'), uZoom: K.parNum(op, 'zoom'), uO: [K.parNum(op, 'ox'), K.parNum(op, 'oy')] }),
  });

  // Composite — multi-input fold
  const BLENDS = ['over', 'under', 'add', 'subtract', 'multiply', 'screen', 'difference', 'lighten', 'darken', 'overlay', 'average', 'maximum'];
  const COMP_FS = `uniform int uOp; uniform float uMix; uniform int uFitA; uniform int uFitB;
vec3 ov(vec3 a, vec3 b){ return mix(2.0*a*b, 1.0-2.0*(1.0-a)*(1.0-b), step(0.5,a)); }
void main(){ vec2 ua=fitUV(vUV,uIn0Res,uRes,uFitA); vec2 ub=fitUV(vUV,uIn1Res,uRes,uFitB);
 vec4 A=texture(sIn0,ua); if(ua.x<0.||ua.y<0.||ua.x>1.||ua.y>1.) A=vec4(0.);
 vec4 B=texture(sIn1,ub); if(ub.x<0.||ub.y<0.||ub.x>1.||ub.y>1.) B=vec4(0.);
 vec4 r;
 if(uOp==0) r=vec4(B.rgb*B.a+A.rgb*(1.0-B.a), B.a+A.a*(1.0-B.a));
 else if(uOp==1) r=vec4(A.rgb*A.a+B.rgb*(1.0-A.a), A.a+B.a*(1.0-A.a));
 else if(uOp==2) r=A+B;
 else if(uOp==3) r=vec4(A.rgb-B.rgb, max(A.a,B.a));
 else if(uOp==4) r=A*B;
 else if(uOp==5) r=1.0-(1.0-A)*(1.0-B);
 else if(uOp==6) r=vec4(abs(A.rgb-B.rgb), max(A.a,B.a));
 else if(uOp==7) r=max(A,B);
 else if(uOp==8) r=min(A,B);
 else if(uOp==9) r=vec4(ov(A.rgb,B.rgb), max(A.a,B.a));
 else if(uOp==10) r=(A+B)*0.5;
 else r=max(A,B);
 fragColor=mix(A,r,uMix); }`;
  K.defineOp({
    type: 'compositeTOP', label: 'Composite', short: 'comp', family: 'TOP', inputs: 'multi',
    help: 'Layer any number of inputs with a blend mode. Input 0 is the bottom layer.',
    params: [
      { name: 'operation', label: 'Operation', type: 'menu', options: BLENDS, default: 'over' },
      { name: 'mix', label: 'Layer Mix', type: 'float', default: 1, min: 0, max: 1 },
      FIT,
    ],
    cook(op, ctx) {
      const ins = op.inputs.filter(Boolean).map((id) => K.cook(K.getOp(id))).filter(Boolean);
      if (!ins.length) return null;
      const size = ctx.size(op, ins[0]);
      op.rt.a = E.ensure(op.rt.a, size[0], size[1]);
      op.rt.b = E.ensure(op.rt.b, size[0], size[1]);
      const prog = E.program('compositeTOP', COMP_FS);
      const opi = BLENDS.indexOf(K.par(op, 'operation')), fit = fitIdx(K.par(op, 'fit')), mix = K.parNum(op, 'mix');
      let cur = ins[0], tgt = op.rt.a;
      if (ins.length === 1) {
        E.pass(prog, { sIn0: cur, sIn1: E.black, uIn0Res: [cur.w, cur.h], uIn1Res: [1, 1], uRes: [tgt.w, tgt.h], uOp: 0, uMix: 1, uFitA: fit, uFitB: 0 }, tgt);
        return tgt;
      }
      for (let i = 1; i < ins.length; i++) {
        E.pass(prog, { sIn0: cur, sIn1: ins[i], uIn0Res: [cur.w, cur.h], uIn1Res: [ins[i].w, ins[i].h], uRes: [tgt.w, tgt.h], uOp: opi, uMix: mix, uFitA: i === 1 ? fit : 0, uFitB: fit }, tgt);
        cur = tgt; tgt = tgt === op.rt.a ? op.rt.b : op.rt.a;
      }
      return cur;
    },
  });

  shaderTOP({
    type: 'crossTOP', label: 'Cross', short: 'cross', inputs: 2, minInputs: 2,
    help: 'Crossfade between two inputs.',
    params: [{ name: 'cross', label: 'Cross', type: 'float', default: 0.5, min: 0, max: 1 }, FIT],
    fs: `uniform float uX; uniform int uFit; void main(){ vec4 a=texture(sIn0,fitUV(vUV,uIn0Res,uRes,uFit)); vec4 b=texture(sIn1,fitUV(vUV,uIn1Res,uRes,uFit)); fragColor=mix(a,b,uX); }`,
    uniforms: (op) => ({ uX: K.parNum(op, 'cross'), uFit: fitIdx(K.par(op, 'fit')) }),
  });

  K.defineOp({
    type: 'switchTOP', label: 'Switch', short: 'switch', family: 'TOP', inputs: 'multi',
    help: 'Choose one of many inputs by index. Fractional index crossfades when Blend is on — perfect for slide decks.',
    params: [
      { name: 'index', label: 'Index', type: 'float', default: 0, min: 0, max: 10 },
      { name: 'blend', label: 'Blend Between Inputs', type: 'toggle', default: true },
      FIT,
    ],
    cook(op, ctx) {
      const ins = op.inputs.filter(Boolean).map((id) => K.cook(K.getOp(id)));
      if (!ins.length) return null;
      const idx = U.clamp(K.parNum(op, 'index'), 0, ins.length - 1);
      const i0 = Math.floor(idx), i1 = Math.min(ins.length - 1, i0 + 1), f = K.par(op, 'blend') ? idx - i0 : 0;
      const a = ins[i0] || E.black, b = ins[i1] || E.black;
      if (f === 0 && K.par(op, 'res') === 'auto' && K.par(op, 'fit') !== 'fit') return a;
      const size = ctx.size(op, a);
      op.rt.target = E.ensure(op.rt.target, size[0], size[1]);
      const fit = fitIdx(K.par(op, 'fit'));
      E.pass(E.program('crossTOP', `uniform float uX; uniform int uFit; void main(){ vec4 a=texture(sIn0,fitUV(vUV,uIn0Res,uRes,uFit)); vec4 b=texture(sIn1,fitUV(vUV,uIn1Res,uRes,uFit)); fragColor=mix(a,b,uX); }`),
        { sIn0: a, sIn1: b, uIn0Res: [a.w, a.h], uIn1Res: [b.w, b.h], uRes: [op.rt.target.w, op.rt.target.h], uX: f, uFit: fit }, op.rt.target);
      return op.rt.target;
    },
  });

  shaderTOP({
    type: 'displaceTOP', label: 'Displace', short: 'displace', inputs: 2, minInputs: 2,
    help: 'Warp input 0 using the red/green (or luminance) of input 1.',
    params: [
      { name: 'amount', label: 'Amount', type: 'float', default: 0.05, min: -1, max: 1 },
      { name: 'source', label: 'Source', type: 'menu', options: ['red/green', 'luminance'], default: 'red/green' },
      { name: 'angle', label: 'Luma Angle', type: 'float', default: 45, min: -360, max: 360 },
    ],
    fs: `uniform float uAmt; uniform int uSrc; uniform float uAng;
void main(){ vec4 d=texture(sIn1,vUV); vec2 o; if(uSrc==0) o=d.rg-0.5; else { float l=dot(d.rgb,vec3(.299,.587,.114))-0.5; float a=radians(uAng); o=vec2(cos(a),sin(a))*l; }
 fragColor=texture(sIn0,vUV+o*uAmt); }`,
    uniforms: (op) => ({ uAmt: K.parNum(op, 'amount'), uSrc: K.par(op, 'source') === 'luminance' ? 1 : 0, uAng: K.parNum(op, 'angle') }),
  });

  shaderTOP({
    type: 'edgeTOP', label: 'Edge', short: 'edge',
    help: 'Sobel edge detection.',
    params: [
      { name: 'strength', label: 'Strength', type: 'float', default: 2, min: 0, max: 10 },
      { name: 'color', label: 'Edge Color', type: 'color', default: '#ffffff' },
      { name: 'over', label: 'Composite Over Input', type: 'float', default: 0, min: 0, max: 1 },
    ],
    fs: `uniform float uS; uniform vec3 uC; uniform float uOver;
float L(vec2 o){ return dot(texture(sIn0,vUV+o/uRes).rgb,vec3(.299,.587,.114)); }
void main(){ float gx=-L(vec2(-1,-1))-2.*L(vec2(-1,0))-L(vec2(-1,1))+L(vec2(1,-1))+2.*L(vec2(1,0))+L(vec2(1,1));
 float gy=-L(vec2(-1,-1))-2.*L(vec2(0,-1))-L(vec2(1,-1))+L(vec2(-1,1))+2.*L(vec2(0,1))+L(vec2(1,1));
 float e=clamp(length(vec2(gx,gy))*uS,0.,1.); vec4 src=texture(sIn0,vUV);
 fragColor=vec4(mix(uC*e, mix(src.rgb,uC,e), uOver), max(e,src.a*uOver)); }`,
    uniforms: (op) => ({ uS: K.parNum(op, 'strength'), uC: U.hexToRgb(K.par(op, 'color')), uOver: K.parNum(op, 'over') }),
  });

  shaderTOP({
    type: 'thresholdTOP', label: 'Threshold', short: 'thresh',
    help: 'Two-tone threshold on luminance.',
    params: [
      { name: 'thresh', label: 'Threshold', type: 'float', default: 0.5, min: 0, max: 1 },
      { name: 'soft', label: 'Softness', type: 'float', default: 0.02, min: 0, max: 0.5 },
      { name: 'c1', label: 'Below', type: 'color', default: '#000000' },
      { name: 'c2', label: 'Above', type: 'color', default: '#ffffff' },
    ],
    fs: `uniform float uT; uniform float uSoft; uniform vec3 uC1; uniform vec3 uC2;
void main(){ vec4 c=texture(sIn0,vUV); float l=dot(c.rgb,vec3(.299,.587,.114)); float m=smoothstep(uT-uSoft,uT+uSoft,l); fragColor=vec4(mix(uC1,uC2,m),c.a); }`,
    uniforms: (op) => ({ uT: K.parNum(op, 'thresh'), uSoft: K.parNum(op, 'soft'), uC1: U.hexToRgb(K.par(op, 'c1')), uC2: U.hexToRgb(K.par(op, 'c2')) }),
  });

  const PALETTES = {
    custom: null,
    ember: ['#0d0716', '#3b1240', '#b8324f', '#ff7a3d', '#ffd8a8'],
    fire: ['#000000', '#4a0800', '#d8401a', '#ffae42', '#fff6dc'],
    ocean: ['#020b18', '#06324f', '#16798f', '#8fdccf', '#f1fbf7'],
    neon: ['#07001a', '#3d0a91', '#e0249a', '#ff8a00', '#fff36b'],
    dusk: ['#0b0f24', '#27305e', '#7a4e8c', '#e58a7a', '#ffe3b8'],
    forest: ['#050d08', '#123521', '#2f6b3a', '#a7c46a', '#f3eccb'],
    ink: ['#0a0a0a', '#262626', '#6b6b6b', '#c9c5bd', '#f7f4ee'],
    rainbow: ['#ff3b3b', '#ffd23b', '#3bff7a', '#3bb8ff', '#b53bff'],
  };
  K.PALETTES = PALETTES;
  shaderTOP({
    type: 'lookupTOP', label: 'Lookup', short: 'lookup', inputs: 2, minInputs: 1,
    help: 'Gradient-map luminance through input 1 (a Ramp) or a built-in palette.',
    params: [
      { name: 'palette', label: 'Palette (no input 1)', type: 'menu', options: Object.keys(PALETTES), default: 'ember' },
      { name: 'c1', label: 'Custom Dark', type: 'color', default: '#0b1020', showIf: (p) => p.palette === 'custom' },
      { name: 'c2', label: 'Custom Mid', type: 'color', default: '#d6336c', showIf: (p) => p.palette === 'custom' },
      { name: 'c3', label: 'Custom Light', type: 'color', default: '#ffe8a3', showIf: (p) => p.palette === 'custom' },
      { name: 'shift', label: 'Shift', type: 'float', default: 0, min: -1, max: 1 },
      { name: 'cycles', label: 'Cycles', type: 'float', default: 1, min: 0.1, max: 8 },
    ],
    fs: `uniform int uHasLut; uniform vec3 uS[5]; uniform float uShift; uniform float uCyc;
void main(){ vec4 c=texture(sIn0,vUV); float l=dot(c.rgb,vec3(.299,.587,.114))*uCyc+uShift; float t=1.0-abs(fract(l*0.5)*2.0-1.0); vec3 r;
 if(uHasLut==1) r=texture(sIn1,vec2(clamp(t,0.001,0.999),0.5)).rgb;
 else { float x=t*4.0; int i=int(min(floor(x),3.0)); float f=x-float(i); vec3 a=uS[0], b=uS[1];
   if(i==1){a=uS[1];b=uS[2];} else if(i==2){a=uS[2];b=uS[3];} else if(i==3){a=uS[3];b=uS[4];}
   r=mix(a,b,smoothstep(0.0,1.0,f)); }
 fragColor=vec4(r,c.a); }`,
    uniforms: (op, ctx, ins) => {
      let stops = PALETTES[K.par(op, 'palette')];
      if (!stops) {
        const c1 = U.hexToRgb(K.par(op, 'c1')), c2 = U.hexToRgb(K.par(op, 'c2')), c3 = U.hexToRgb(K.par(op, 'c3'));
        const m = (a, b) => a.map((v, i) => (v + b[i]) / 2);
        stops = [c1, m(c1, c2), c2, m(c2, c3), c3];
      } else stops = stops.map(U.hexToRgb);
      return { uHasLut: ins[1] ? 1 : 0, uS: [].concat(...stops), uShift: K.parNum(op, 'shift'), uCyc: K.parNum(op, 'cycles') };
    },
  });

  shaderTOP({
    type: 'rgbshiftTOP', label: 'RGB Shift', short: 'rgbshift',
    help: 'Chromatic aberration — linear or radial.',
    params: [
      { name: 'amount', label: 'Amount', type: 'float', default: 0.006, min: 0, max: 0.1 },
      { name: 'angle', label: 'Angle', type: 'float', default: 0, min: -360, max: 360 },
      { name: 'radial', label: 'Radial', type: 'toggle', default: true },
    ],
    fs: `uniform float uA; uniform float uAng; uniform int uRad;
void main(){ vec2 d; if(uRad==1) d=(vUV-0.5)*uA*4.0; else { float a=radians(uAng); d=vec2(cos(a),sin(a))*uA; }
 vec4 c=texture(sIn0,vUV); fragColor=vec4(texture(sIn0,vUV+d).r,c.g,texture(sIn0,vUV-d).b,c.a); }`,
    uniforms: (op) => ({ uA: K.parNum(op, 'amount'), uAng: K.parNum(op, 'angle'), uRad: K.par(op, 'radial') ? 1 : 0 }),
  });

  shaderTOP({
    type: 'pixelateTOP', label: 'Pixelate', short: 'pixelate',
    help: 'Mosaic cells and color posterization.',
    params: [
      { name: 'cells', label: 'Cells (vertical)', type: 'float', default: 90, min: 1, max: 1080 },
      { name: 'levels', label: 'Posterize Levels (0 = off)', type: 'int', default: 0, min: 0, max: 64 },
      { name: 'shape', label: 'Shape', type: 'menu', options: ['square', 'dot'], default: 'square' },
    ],
    fs: `uniform float uCells; uniform float uLev; uniform int uDot;
void main(){ vec2 a=vec2(uRes.x/uRes.y,1.0); vec2 g=vUV*a*uCells; vec2 cell=(floor(g)+0.5)/(a*uCells); vec4 c=texture(sIn0,cell);
 if(uLev>0.5) c.rgb=floor(c.rgb*uLev+0.5)/uLev;
 if(uDot==1){ float d=length(fract(g)-0.5); float l=dot(c.rgb,vec3(.333)); c.rgb*=1.0-smoothstep(0.42*sqrt(l)+0.08-0.05,0.42*sqrt(l)+0.08,d); }
 fragColor=c; }`,
    uniforms: (op) => ({ uCells: K.parNum(op, 'cells'), uLev: K.parNum(op, 'levels'), uDot: K.par(op, 'shape') === 'dot' ? 1 : 0 }),
  });

  shaderTOP({
    type: 'filmTOP', label: 'Film', short: 'film',
    help: 'Grain, vignette, scanlines — finishing touches.',
    params: [
      { name: 'grain', label: 'Grain', type: 'float', default: 0.06, min: 0, max: 1 },
      { name: 'vignette', label: 'Vignette', type: 'float', default: 0.35, min: 0, max: 2 },
      { name: 'scan', label: 'Scanlines', type: 'float', default: 0, min: 0, max: 1 },
      { name: 'scancount', label: 'Scanline Count', type: 'float', default: 400, min: 10, max: 2000 },
    ],
    fs: `uniform float uG; uniform float uV; uniform float uS; uniform float uSc;
void main(){ vec4 c=texture(sIn0,vUV); float n=hash12(vUV*uRes+fract(uTime*13.17)*vec2(91.7,47.3))-0.5; c.rgb+=n*uG;
 vec2 p=vUV-0.5; c.rgb*=1.0-dot(p,p)*uV*2.0; c.rgb*=1.0-uS*0.5*(0.5+0.5*sin(vUV.y*uSc*PI)); fragColor=c; }`,
    uniforms: (op) => ({ uG: K.parNum(op, 'grain'), uV: K.parNum(op, 'vignette'), uS: K.parNum(op, 'scan'), uSc: K.parNum(op, 'scancount') }),
  });

  // Feedback — recursive trails with transform
  K.defineOp({
    type: 'feedbackTOP', label: 'Feedback', short: 'feedback', family: 'TOP',
    help: 'Blends the input with its own previous frame, transformed — trails, tunnels, smears.',
    params: [
      { name: 'decay', label: 'Feedback', type: 'float', default: 0.92, min: 0, max: 1 },
      { name: 'zoom', label: 'Zoom', type: 'float', default: 1.01, min: 0.8, max: 1.2 },
      { name: 'rotate', label: 'Rotate (deg/frame)', type: 'float', default: 0.3, min: -10, max: 10 },
      { name: 'tx', label: 'Drift X', type: 'float', default: 0, min: -0.05, max: 0.05, row: 't' },
      { name: 'ty', label: 'Drift Y', type: 'float', default: 0, min: -0.05, max: 0.05, row: 't' },
      { name: 'hue', label: 'Hue Drift', type: 'float', default: 0, min: -0.1, max: 0.1 },
      { name: 'mode', label: 'Blend', type: 'menu', options: ['over', 'add', 'max', 'screen'], default: 'max' },
      { name: 'reset', label: 'Reset', type: 'pulse' },
    ],
    pulse(op, n) { if (n === 'reset') op.rt.clear = true; },
    cook(op, ctx) {
      const src = ctx.input(op, 0);
      if (!src) return null;
      const size = ctx.size(op, src);
      op.rt.a = E.ensure(op.rt.a, size[0], size[1]);
      op.rt.b = E.ensure(op.rt.b, size[0], size[1]);
      if (op.rt.clear) {
        const gl = E.gl;
        [op.rt.a, op.rt.b].forEach((t) => { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); });
        op.rt.clear = false;
      }
      const prev = op.rt.flip ? op.rt.b : op.rt.a, next = op.rt.flip ? op.rt.a : op.rt.b;
      op.rt.flip = !op.rt.flip;
      const prog = E.program('feedbackTOP', `uniform float uDecay; uniform float uZoom; uniform float uRot; uniform vec2 uT; uniform float uHue; uniform int uMode;
void main(){ vec2 a=vec2(uRes.x/uRes.y,1.0); vec2 p=(vUV-0.5)*a; float r=radians(uRot); p=mat2(cos(r),-sin(r),sin(r),cos(r))*p/uZoom; vec2 uv=p/a+0.5-uT;
 vec4 f=texture(sIn1,uv)*uDecay; if(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.) f=vec4(0.);
 if(uHue!=0.0){ vec3 h=rgb2hsv(f.rgb); h.x=fract(h.x+uHue); f.rgb=hsv2rgb(h); }
 vec4 s=texture(sIn0,fitUV(vUV,uIn0Res,uRes,2));
 vec4 o; if(uMode==0) o=vec4(s.rgb*s.a+f.rgb*(1.0-s.a),max(s.a,f.a)); else if(uMode==1) o=s+f; else if(uMode==2) o=max(s,f); else o=1.0-(1.0-s)*(1.0-f);
 fragColor=clamp(o,0.,4.); }`);
      E.pass(prog, { sIn0: src, sIn1: prev, uIn0Res: [src.w, src.h], uRes: [next.w, next.h], uDecay: K.parNum(op, 'decay'), uZoom: K.parNum(op, 'zoom'), uRot: K.parNum(op, 'rotate'),
        uT: [K.parNum(op, 'tx'), K.parNum(op, 'ty')], uHue: K.parNum(op, 'hue'), uMode: ['over', 'add', 'max', 'screen'].indexOf(K.par(op, 'mode')) }, next);
      return next;
    },
  });

  // Bloom / Glow
  K.defineOp({
    type: 'bloomTOP', label: 'Bloom', short: 'bloom', family: 'TOP',
    help: 'Glow highlights above a threshold.',
    params: [
      { name: 'thresh', label: 'Threshold', type: 'float', default: 0.6, min: 0, max: 1 },
      { name: 'intensity', label: 'Intensity', type: 'float', default: 1.2, min: 0, max: 5 },
      { name: 'radius', label: 'Radius', type: 'float', default: 6, min: 0.5, max: 30 },
      { name: 'tint', label: 'Tint', type: 'color', default: '#ffffff' },
    ],
    cook(op, ctx) {
      const src = ctx.input(op, 0);
      if (!src) return null;
      const size = ctx.size(op, src);
      const dw = Math.max(1, size[0] / 4), dh = Math.max(1, size[1] / 4);
      op.rt.bright = E.ensure(op.rt.bright, dw, dh);
      E.pass(E.program('__bright', `uniform float uT; void main(){ vec2 px=1.0/uRes; vec4 c=(texture(sIn0,vUV+px*vec2(-.5,-.5))+texture(sIn0,vUV+px*vec2(.5,-.5))+texture(sIn0,vUV+px*vec2(-.5,.5))+texture(sIn0,vUV+px*vec2(.5,.5)))*0.25; float l=max(c.r,max(c.g,c.b)); fragColor=vec4(c.rgb*smoothstep(uT,uT+0.15,l),1.0); }`),
        { sIn0: src, uT: K.parNum(op, 'thresh'), uRes: [dw, dh] }, op.rt.bright);
      const blurred = blurInto(op, op.rt.bright, K.parNum(op, 'radius') / 2, 3, 'bl');
      op.rt.target = E.ensure(op.rt.target, size[0], size[1]);
      E.pass(E.program('__bloomadd', `uniform float uI; uniform vec3 uTint; void main(){ vec4 c=texture(sIn0,vUV); vec3 b=texture(sIn1,vUV).rgb; fragColor=vec4(c.rgb+b*uI*uTint, max(c.a, dot(b,vec3(.33))*uI)); }`),
        { sIn0: src, sIn1: blurred, uI: K.parNum(op, 'intensity'), uTint: U.hexToRgb(K.par(op, 'tint')) }, op.rt.target);
      return op.rt.target;
    },
  });

  // Corner Pin (projection mapping)
  function homography(q) {
    // unit square -> quad (q = [x0,y0, x1,y1, x2,y2, x3,y3] for (0,0),(1,0),(1,1),(0,1))
    const [x0, y0, x1, y1, x2, y2, x3, y3] = q;
    const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
    const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
    let g = 0, h = 0;
    const den = dx1 * dy2 - dx2 * dy1 || 1e-9;
    if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) { g = (sx * dy2 - dx2 * sy) / den; h = (dx1 * sy - sx * dy1) / den; }
    const a = x1 - x0 + g * x1, b = x3 - x0 + h * x3, c = x0, d = y1 - y0 + g * y1, e = y3 - y0 + h * y3, f = y0;
    return [a, b, c, d, e, f, g, h, 1];
  }
  function inv3(m) {
    const [a, b, c, d, e, f, g, h, i] = m;
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
    const det = a * A + b * B + c * C || 1e-9;
    return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
  }
  shaderTOP({
    type: 'cornerpinTOP', label: 'Corner Pin', short: 'cornerpin',
    help: 'Projection mapping: pin the 4 corners of the image onto a surface. Drag corners in the viewer while this OP is selected.',
    params: [
      { name: 'x0', label: 'Bottom Left X', type: 'float', default: 0, min: -0.5, max: 1.5, row: 'p0' },
      { name: 'y0', label: 'Bottom Left Y', type: 'float', default: 0, min: -0.5, max: 1.5, row: 'p0' },
      { name: 'x1', label: 'Bottom Right X', type: 'float', default: 1, min: -0.5, max: 1.5, row: 'p1' },
      { name: 'y1', label: 'Bottom Right Y', type: 'float', default: 0, min: -0.5, max: 1.5, row: 'p1' },
      { name: 'x2', label: 'Top Right X', type: 'float', default: 1, min: -0.5, max: 1.5, row: 'p2' },
      { name: 'y2', label: 'Top Right Y', type: 'float', default: 1, min: -0.5, max: 1.5, row: 'p2' },
      { name: 'x3', label: 'Top Left X', type: 'float', default: 0, min: -0.5, max: 1.5, row: 'p3' },
      { name: 'y3', label: 'Top Left Y', type: 'float', default: 1, min: -0.5, max: 1.5, row: 'p3' },
      { name: 'grid', label: 'Show Grid', type: 'toggle', default: false },
    ],
    fs: `uniform mat3 uH; uniform int uGrid;
void main(){ vec3 p=uH*vec3(vUV,1.0); vec2 uv=p.xy/p.z; vec4 c=texture(sIn0,uv);
 if(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.) c=vec4(0.);
 else if(uGrid==1){ vec2 g=abs(fract(uv*8.0)-0.5); if(min(g.x,g.y)<0.02) c=vec4(1.,.35,.2,1.); }
 fragColor=c; }`,
    uniforms: (op) => {
      const q = [0, 1, 2, 3].flatMap((i) => [K.parNum(op, 'x' + i), K.parNum(op, 'y' + i)]);
      const H = inv3(homography(q));
      // to column-major mat3
      return { uH: new Float32Array([H[0], H[3], H[6], H[1], H[4], H[7], H[2], H[5], H[8]]), uGrid: K.par(op, 'grid') ? 1 : 0 };
    },
  });

  // Null / Out
  K.defineOp({
    type: 'nullTOP', label: 'Null', short: 'null', family: 'TOP', noCommon: true,
    help: 'Pass-through. Use as a clean reference point in your network.',
    params: [], cook: (op, ctx) => ctx.input(op, 0),
  });
  K.defineOp({
    type: 'outTOP', label: 'Out', short: 'out', family: 'TOP', noCommon: true,
    help: 'Final output. The Out TOP with the Display flag is what Perform mode and Movie File Out show.',
    params: [{ name: 'fullview', label: 'Open Full View', type: 'pulse' }],
    pulse(op, name) { if (name === 'fullview' && K.viewer) { K.net.select(op.id); K.viewer.maximize(true, 'output'); } },
    cook: (op, ctx) => ctx.input(op, 0),
  });
})();
