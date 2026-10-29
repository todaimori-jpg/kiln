/* Kiln — special.js : TouchLab special operators, rebuilt for Kiln.
   Looks (Dither, Night Vision, CRT, Receipt, Depth, Datamosh, Luma Blur),
   color routing (Channel Mix, Reorder, Select), frame history (Cache, Time Machine,
   Time Displace), tracking (Blob Track), data display (Data Readout) and the
   gravitational-wave family (GW Strain In, GW Signal Analysis, GW Chirp Analysis,
   GW Sine Modulator, GW Film Sync). */
(function () {
  'use strict';
  const K = window.K, U = K.util, E = K.gl;
  const shaderTOP = K.shaderTOP;
  const rgb = (op, n) => U.hexToRgb(K.par(op, n));
  const one = (name, v) => ({ name, data: new Float32Array([v]) });
  const LUMA = 'float luma(vec3 c){ return dot(c,vec3(.2126,.7152,.0722)); }\n';
  const COPY = () => E.program('__sp_copy', 'void main(){ fragColor=texture(sIn0,vUV); }');
  const FIT = { name: 'fit', label: 'Input Fit', type: 'menu', options: ['stretch', 'fit', 'fill'], default: 'fill', page: 'Common' };
  const HISTRES = { name: 'histres', label: 'History Resolution', type: 'menu', options: ['full', 'half', 'quarter'], default: 'full', page: 'History' };
  const histScale = (op) => ({ full: 1, half: 0.5, quarter: 0.25 }[K.par(op, 'histres')] || 1);
  const RING_BUDGET = 384 * 1024 * 1024; // bytes; keeps iPad memory safe

  /* =====================================================================
     LOOKS
     ===================================================================== */
  shaderTOP({
    type: 'ditherTOP', label: 'Dither', short: 'dither',
    help: 'Ordered (Bayer) or noise dithering with posterized levels — 1-bit Mac, Game Boy and zine looks.',
    params: [
      { name: 'pattern', label: 'Pattern', type: 'menu', options: ['bayer 4×4', 'bayer 8×8', 'noise'], default: 'bayer 4×4' },
      { name: 'pixel', label: 'Pixel Size', type: 'float', default: 2, min: 1, max: 16 },
      { name: 'levels', label: 'Levels', type: 'int', default: 2, min: 2, max: 16 },
      { name: 'exposure', label: 'Exposure', type: 'float', default: 0, min: -3, max: 3 },
      { name: 'amount', label: 'Mix', type: 'float', default: 1, min: 0, max: 1 },
      { name: 'mono', label: 'Two-Tone', type: 'toggle', default: true, page: 'Color' },
      { name: 'dark', label: 'Dark Color', type: 'color', default: '#101018', page: 'Color' },
      { name: 'light', label: 'Light Color', type: 'color', default: '#ece7da', page: 'Color' },
    ],
    fs: LUMA + `uniform int uPat; uniform float uPx; uniform float uLev; uniform float uExp; uniform float uAmt; uniform int uMono; uniform vec3 uDark; uniform vec3 uLight;
float b2(vec2 a){ a=floor(a); return fract(a.x*.5+a.y*a.y*.75); }
float b4(vec2 a){ return b2(.5*a)*.25+b2(a); }
float b8(vec2 a){ return b4(.5*a)*.25+b2(a); }
void main(){ vec2 cell=floor(gl_FragCoord.xy/uPx); vec2 uv=(cell+.5)*uPx/uRes; vec4 c=texture(sIn0,uv);
 vec3 v=c.rgb*exp2(uExp); if(uMono==1) v=vec3(luma(v));
 float th = uPat==0 ? b4(cell) : uPat==1 ? b8(cell) : hash12(cell+floor(uTime*24.)*0.0);
 float L=uLev-1.; vec3 q=clamp(floor(v*L+th)/L,0.,1.);
 vec3 o = uMono==1 ? mix(uDark,uLight,q.r) : q;
 fragColor=vec4(mix(c.rgb,o,uAmt),c.a); }`,
    uniforms: (op) => ({ uPat: ['bayer 4×4', 'bayer 8×8', 'noise'].indexOf(K.par(op, 'pattern')), uPx: Math.max(1, K.parNum(op, 'pixel')), uLev: K.parNum(op, 'levels'), uExp: K.parNum(op, 'exposure'), uAmt: K.parNum(op, 'amount'), uMono: K.par(op, 'mono') ? 1 : 0, uDark: rgb(op, 'dark'), uLight: rgb(op, 'light') }),
  });

  shaderTOP({
    type: 'nightvisionTOP', label: 'Night Vision', short: 'nightvision',
    help: 'Image-intensifier look: gain, phosphor tint, grain, flicker, scanlines and a round or binocular mask.',
    params: [
      { name: 'gain', label: 'Gain', type: 'float', default: 2.2, min: 0.1, max: 8 },
      { name: 'gamma', label: 'Gamma', type: 'float', default: 0.7, min: 0.1, max: 3 },
      { name: 'grain', label: 'Grain', type: 'float', default: 0.12, min: 0, max: 0.7 },
      { name: 'flicker', label: 'Flicker', type: 'float', default: 0.04, min: 0, max: 0.4 },
      { name: 'scan', label: 'Scanlines', type: 'float', default: 0.12, min: 0, max: 1 },
      { name: 'bloom', label: 'Highlight Bloom', type: 'float', default: 0.35, min: 0, max: 1 },
      { name: 'mask', label: 'Mask', type: 'menu', options: ['vignette', 'round', 'binocular', 'none'], default: 'vignette' },
      { name: 'vignette', label: 'Mask Strength', type: 'float', default: 0.6, min: 0, max: 1 },
      { name: 'color', label: 'Phosphor Color', type: 'color', default: '#67ff83', page: 'Color' },
    ],
    fs: LUMA + `uniform float uGain; uniform float uGam; uniform float uGrain; uniform float uFlk; uniform float uScan; uniform float uBloom; uniform int uMask; uniform float uVig; uniform vec3 uCol;
void main(){ vec2 px=1.5/uRes; float l=luma(texture(sIn0,vUV).rgb);
 float b=0.; for(int i=0;i<8;i++){ float a=float(i)*0.785398; b+=luma(texture(sIn0,vUV+vec2(cos(a),sin(a))*px*4.).rgb); } b/=8.;
 l=pow(max(l*uGain,0.),uGam); b=pow(max(b*uGain,0.),uGam); l+=max(b-0.7,0.)*uBloom*2.;
 float fr=floor(uTime*30.); l+=(hash12(gl_FragCoord.xy+fr*vec2(17.1,31.7))-.5)*uGrain*2.;
 l*=1.-uFlk*hash12(vec2(fr,3.1));
 l*=1.-uScan*0.5*(0.5+0.5*sin(gl_FragCoord.y*PI*0.5));
 vec3 c=uCol*l + vec3(max(l-1.,0.))*0.6;
 vec2 p=(vUV-.5)*vec2(uRes.x/uRes.y,1.); float m=1.;
 if(uMask==0) m=1.-dot(p,p)*uVig*1.6;
 else if(uMask==1) m=1.-smoothstep(.46-uVig*.1,.5,length(p));
 else if(uMask==2){ float d=min(length(p-vec2(-.23,0.)),length(p+vec2(-.23,0.))); m=1.-smoothstep(.36-uVig*.08,.38,d); }
 fragColor=vec4(c*clamp(m,0.,1.),1.); }`,
    uniforms: (op) => ({ uGain: K.parNum(op, 'gain'), uGam: K.parNum(op, 'gamma'), uGrain: K.parNum(op, 'grain'), uFlk: K.parNum(op, 'flicker'), uScan: K.parNum(op, 'scan'), uBloom: K.parNum(op, 'bloom'), uMask: ['vignette', 'round', 'binocular', 'none'].indexOf(K.par(op, 'mask')), uVig: K.parNum(op, 'vignette'), uCol: rgb(op, 'color') }),
  });

  shaderTOP({
    type: 'crtTOP', label: 'CRT Monitor', short: 'crt',
    help: 'Curved glass, scanlines, RGB phosphor mask, chromatic aberration, glow and flicker.',
    params: [
      { name: 'curvature', label: 'Curvature', type: 'float', default: 0.12, min: 0, max: 0.5 },
      { name: 'scan', label: 'Scanlines', type: 'float', default: 0.35, min: 0, max: 1 },
      { name: 'lines', label: 'Line Count (0 = auto)', type: 'float', default: 0, min: 0, max: 1200 },
      { name: 'mask', label: 'Phosphor Mask', type: 'float', default: 0.25, min: 0, max: 1 },
      { name: 'masktype', label: 'Mask Type', type: 'menu', options: ['aperture grille', 'shadow mask', 'slot mask'], default: 'aperture grille' },
      { name: 'aberration', label: 'Aberration (px)', type: 'float', default: 1.5, min: 0, max: 12 },
      { name: 'glow', label: 'Glow', type: 'float', default: 0.15, min: 0, max: 1 },
      { name: 'flicker', label: 'Flicker', type: 'float', default: 0.04, min: 0, max: 0.5 },
      { name: 'vignette', label: 'Vignette', type: 'float', default: 0.3, min: 0, max: 1 },
      { name: 'corner', label: 'Corner Radius', type: 'float', default: 0.04, min: 0, max: 0.2 },
    ],
    fs: `uniform float uCurv; uniform float uScan; uniform float uLines; uniform float uMask; uniform int uMT; uniform float uAb; uniform float uGlow; uniform float uFlk; uniform float uVig; uniform float uCorner;
void main(){ vec2 p=vUV*2.-1.; p+=p*(p.yx*p.yx)*uCurv; vec2 uv=p*.5+.5;
 vec2 q=abs(p)-(1.-uCorner*2.); float rr=length(max(q,0.))-uCorner*2.; float inside=1.-smoothstep(-0.004,0.004,rr);
 if(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.) inside=0.;
 vec2 ab=vec2(uAb/uRes.x,0.)*p.x;
 vec3 c=vec3(texture(sIn0,uv+ab).r,texture(sIn0,uv).g,texture(sIn0,uv-ab).b);
 vec3 g=vec3(0.); vec2 px=2.5/uRes; for(int i=0;i<8;i++){ float a=float(i)*0.785398; g+=texture(sIn0,uv+vec2(cos(a),sin(a))*px*3.).rgb; } c+=g/8.*uGlow;
 float lines=uLines>0.5?uLines:uRes.y/3.; float s=0.5+0.5*cos(uv.y*lines*TAU); c*=mix(1.,0.35+0.65*s,uScan)*(1.+uScan*0.25);
 vec2 fc=gl_FragCoord.xy; vec3 m=vec3(1.);
 if(uMT==0){ float k=mod(fc.x,3.); m=vec3(k<1.?1.:.3,(k>=1.&&k<2.)?1.:.3,k>=2.?1.:.3); }
 else if(uMT==1){ float k=mod(fc.x+mod(floor(fc.y/2.),2.)*1.5,3.); m=vec3(k<1.?1.:.35,(k>=1.&&k<2.)?1.:.35,k>=2.?1.:.35); }
 else { float k=mod(fc.x,3.); float row=step(0.5,mod(fc.y+floor(fc.x/3.)*2.,4.)); m=vec3(k<1.?1.:.3,(k>=1.&&k<2.)?1.:.3,k>=2.?1.:.3)*mix(.6,1.,row); }
 c*=mix(vec3(1.),m*1.35,uMask);
 c*=1.-uFlk*(0.5+0.5*sin(uTime*110.))*0.5;
 c*=1.-dot(p,p)*uVig*0.45;
 fragColor=vec4(c*inside,1.); }`,
    uniforms: (op) => ({ uCurv: K.parNum(op, 'curvature'), uScan: K.parNum(op, 'scan'), uLines: K.parNum(op, 'lines'), uMask: K.parNum(op, 'mask'), uMT: ['aperture grille', 'shadow mask', 'slot mask'].indexOf(K.par(op, 'masktype')), uAb: K.parNum(op, 'aberration'), uGlow: K.parNum(op, 'glow'), uFlk: K.parNum(op, 'flicker'), uVig: K.parNum(op, 'vignette'), uCorner: K.parNum(op, 'corner') }),
  });

  shaderTOP({
    type: 'receiptTOP', label: 'Receipt Paper', short: 'receipt',
    help: 'Thermal-printer look: dithered dots on worn paper with fading print-head streaks, margins and torn edges.',
    params: [
      { name: 'pixel', label: 'Dot Size', type: 'float', default: 2, min: 1, max: 10 },
      { name: 'contrast', label: 'Contrast', type: 'float', default: 1.4, min: 0.2, max: 4 },
      { name: 'bright', label: 'Brightness', type: 'float', default: 0, min: -0.8, max: 0.8 },
      { name: 'ink', label: 'Ink Density', type: 'float', default: 0.9, min: 0, max: 1 },
      { name: 'fade', label: 'Print-Head Fade', type: 'float', default: 0.15, min: 0, max: 1 },
      { name: 'grain', label: 'Paper Grain', type: 'float', default: 0.12, min: 0, max: 0.6 },
      { name: 'margin', label: 'Side Margin', type: 'float', default: 0.035, min: 0, max: 0.2 },
      { name: 'tear', label: 'Torn Edge', type: 'float', default: 0.012, min: 0, max: 0.08 },
      { name: 'paper', label: 'Paper Color', type: 'color', default: '#ece5cf', page: 'Color' },
      { name: 'inkcolor', label: 'Ink Color', type: 'color', default: '#1d1b24', page: 'Color' },
      { name: 'bg', label: 'Background', type: 'color', default: '#0c0c0e', page: 'Color' },
    ],
    fs: LUMA + `uniform float uPx; uniform float uCon; uniform float uBr; uniform float uInk; uniform float uFade; uniform float uGrain; uniform float uMar; uniform float uTear; uniform vec3 uPaper; uniform vec3 uInkC; uniform vec3 uBg;
float b2(vec2 a){ a=floor(a); return fract(a.x*.5+a.y*a.y*.75); }
float b4(vec2 a){ return b2(.5*a)*.25+b2(a); }
float vn(float x){ float i=floor(x), f=fract(x); return mix(hash12(vec2(i,7.)),hash12(vec2(i+1.,7.)),f*f*(3.-2.*f)); }
void main(){ vec2 cell=floor(gl_FragCoord.xy/uPx); vec2 uv=(cell+.5)*uPx/uRes;
 float l=luma(texture(sIn0,uv).rgb); l=(l-.5)*uCon+.5+uBr;
 float dotOn=step(l,b4(cell)); // 1 = ink
 float head=1.-uFade*(0.6*vn(vUV.x*40.)+0.4*vn(vUV.x*170.+vUV.y*2.));
 float ink=dotOn*uInk*clamp(head,0.,1.);
 float g=(hash12(gl_FragCoord.xy*0.7)-.5)*uGrain + (vn(vUV.y*300.+vUV.x*9.)-.5)*uGrain*0.5;
 vec3 paper=uPaper*(1.+g);
 float inMargin=step(vUV.x,uMar)+step(1.-uMar,vUV.x); ink*=1.-clamp(inMargin,0.,1.);
 vec3 c=mix(paper,uInkC,ink);
 float edge=uTear*(0.55+0.45*vn(vUV.x*90.)+0.3*hash12(vec2(floor(vUV.x*uRes.x/2.),1.)));
 float cut=step(vUV.y,1.-edge)*step(edge,vUV.y);
 fragColor=vec4(mix(uBg,c,cut),1.); }`,
    uniforms: (op) => ({ uPx: Math.max(1, K.parNum(op, 'pixel')), uCon: K.parNum(op, 'contrast'), uBr: K.parNum(op, 'bright'), uInk: K.parNum(op, 'ink'), uFade: K.parNum(op, 'fade'), uGrain: K.parNum(op, 'grain'), uMar: K.parNum(op, 'margin'), uTear: K.parNum(op, 'tear'), uPaper: rgb(op, 'paper'), uInkC: rgb(op, 'inkcolor'), uBg: rgb(op, 'bg') }),
  });

  // Depth Map (Luma)
  K.defineOp({
    type: 'depthmapTOP', label: 'Depth Map (Luma)', short: 'depth', family: 'TOP',
    help: 'Pseudo-depth from brightness (bright = near). Not real geometric depth — great for Displace, fog and parallax.',
    params: [
      { name: 'near', label: 'Near Level', type: 'float', default: 0.9, min: 0, max: 1 },
      { name: 'far', label: 'Far Level', type: 'float', default: 0.1, min: 0, max: 1 },
      { name: 'gamma', label: 'Gamma', type: 'float', default: 1, min: 0.1, max: 4 },
      { name: 'smooth', label: 'Smooth', type: 'float', default: 2, min: 0, max: 24 },
      { name: 'invert', label: 'Invert', type: 'toggle', default: false },
      { name: 'false', label: 'False Color', type: 'float', default: 0, min: 0, max: 1 },
    ],
    cook(op, ctx) {
      const src = ctx.input(op, 0);
      if (!src) return null;
      const size = ctx.size(op, src);
      let base = src;
      const s = K.parNum(op, 'smooth');
      if (s > 0) base = K.blurInto(op, src, s, 2, 'dm');
      op.rt.target = E.ensure(op.rt.target, size[0], size[1]);
      E.pass(E.program('depthmapTOP', LUMA + `uniform float uNear; uniform float uFar; uniform float uGam; uniform int uInv; uniform float uFalse;
vec3 turbo(float x){ x=clamp(x,0.,1.); vec4 v4=vec4(1.,x,x*x,x*x*x); vec2 v2=v4.zw*v4.z;
 return vec3(dot(v4,vec4(0.13572138,4.6153926,-42.66032258,132.13108234))+dot(v2,vec2(-152.94239396,59.28637943)),
  dot(v4,vec4(0.09140261,2.19418839,4.84296658,-14.18503333))+dot(v2,vec2(4.27729857,2.82956604)),
  dot(v4,vec4(0.1066733,12.64194608,-60.58204836,110.36276771))+dot(v2,vec2(-89.90310912,27.34824973))); }
void main(){ vec4 c=texture(sIn0,vUV); float d=clamp((luma(c.rgb)-uFar)/(uNear-uFar+1e-4),0.,1.); d=pow(d,uGam); if(uInv==1) d=1.-d;
 fragColor=vec4(mix(vec3(d),turbo(d),uFalse),1.); }`), { sIn0: base, uNear: K.parNum(op, 'near'), uFar: K.parNum(op, 'far'), uGam: K.parNum(op, 'gamma'), uInv: K.par(op, 'invert') ? 1 : 0, uFalse: K.parNum(op, 'false') }, op.rt.target);
      return op.rt.target;
    },
  });

  // Luma Blur — per-pixel blur radius from a map, using 3 precomputed blur levels (constant cost)
  K.defineOp({
    type: 'lumablurTOP', label: 'Luma Blur', short: 'lumablur', family: 'TOP', inputs: 2, minInputs: 1,
    help: 'Variable blur. Brightness of input 1 (or of the image itself) sets the blur radius per pixel — tilt-shift, focus pulls, depth of field.',
    params: [
      { name: 'radius', label: 'Max Radius', type: 'float', default: 10, min: 0, max: 40 },
      { name: 'invert', label: 'Invert Map', type: 'toggle', default: false },
      { name: 'map', label: 'Map Source', type: 'menu', options: ['input 1', 'own luma', 'vertical (tilt-shift)', 'radial (vignette)'], default: 'input 1' },
      { name: 'focus', label: 'Focus Position', type: 'float', default: 0.5, min: 0, max: 1 },
      { name: 'width', label: 'Focus Width', type: 'float', default: 0.2, min: 0, max: 1 },
    ],
    cook(op, ctx) {
      const src = ctx.input(op, 0);
      if (!src) return null;
      const r = K.parNum(op, 'radius');
      if (r <= 0) return src;
      const map = ctx.input(op, 1);
      const l1 = K.blurInto(op, src, r / 4, 2, 'lb1');
      const l2 = K.blurInto(op, l1, r / 2, 3, 'lb2');
      const size = ctx.size(op, src);
      op.rt.target = E.ensure(op.rt.target, size[0], size[1]);
      let mode = ['input 1', 'own luma', 'vertical (tilt-shift)', 'radial (vignette)'].indexOf(K.par(op, 'map'));
      if (mode === 0 && !map) mode = 1;
      E.pass(E.program('lumablurTOP', LUMA + `uniform sampler2D sL1; uniform sampler2D sL2; uniform int uMode; uniform int uInv; uniform float uFoc; uniform float uW;
void main(){ float m;
 if(uMode==0) m=luma(texture(sIn1,vUV).rgb); else if(uMode==1) m=luma(texture(sIn0,vUV).rgb);
 else if(uMode==2) m=smoothstep(uW*.5,uW*.5+.25,abs(vUV.y-uFoc));
 else m=smoothstep(uW*.5,uW*.5+.45,length((vUV-vec2(.5,uFoc))*vec2(uRes.x/uRes.y,1.)));
 if(uInv==1) m=1.-m; m=clamp(m,0.,1.);
 vec4 a=texture(sIn0,vUV), b=texture(sL1,vUV), c=texture(sL2,vUV);
 fragColor = m<.5 ? mix(a,b,m*2.) : mix(b,c,m*2.-1.); }`), { sIn0: src, sIn1: map || E.black, sL1: l1, sL2: l2, uMode: mode, uInv: K.par(op, 'invert') ? 1 : 0, uFoc: K.parNum(op, 'focus'), uW: K.parNum(op, 'width') }, op.rt.target);
      return op.rt.target;
    },
  });

  // Datamosh — compression-artifact simulation with frame-difference flow
  K.defineOp({
    type: 'datamoshTOP', label: 'Datamosh', short: 'datamosh', family: 'TOP',
    help: 'Simulated codec glitch: moving blocks drag old pixels along the motion, still areas hold the previous frame until refreshed.',
    params: [
      { name: 'persist', label: 'Persistence', type: 'float', default: 0.94, min: 0, max: 0.995 },
      { name: 'block', label: 'Block Size (px)', type: 'float', default: 24, min: 4, max: 96 },
      { name: 'drift', label: 'Drift', type: 'float', default: 0.055, min: 0, max: 0.3 },
      { name: 'thresh', label: 'Motion Threshold', type: 'float', default: 0.06, min: 0, max: 0.5 },
      { name: 'refresh', label: 'Refresh', type: 'float', default: 0.025, min: 0, max: 1 },
      { name: 'chroma', label: 'Chroma Bleed', type: 'float', default: 0.004, min: 0, max: 0.05 },
      { name: 'freeze', label: 'Freeze (P-frames only)', type: 'toggle', default: false },
      { name: 'iframe', label: 'I-Frame (clean)', type: 'pulse' },
    ],
    pulse(op, n) { if (n === 'iframe') op.rt.clean = true; },
    cook(op, ctx) {
      const src = ctx.input(op, 0);
      if (!src) return null;
      const size = ctx.size(op, src);
      ['a', 'b', 'prev'].forEach((k) => { op.rt[k] = E.ensure(op.rt[k], size[0], size[1]); });
      const prevOut = op.rt.flip ? op.rt.b : op.rt.a, next = op.rt.flip ? op.rt.a : op.rt.b;
      op.rt.flip = !op.rt.flip;
      const first = !op.rt.primed || op.rt.clean;
      E.pass(E.program('datamoshTOP', LUMA + `uniform float uP; uniform float uBlk; uniform float uDrift; uniform float uTh; uniform float uRef; uniform float uChr; uniform int uFreeze; uniform int uFirst;
void main(){ vec2 uv=vUV; vec4 cur=texture(sIn0,uv);
 if(uFirst==1){ fragColor=cur; return; }
 vec2 bc=(floor(gl_FragCoord.xy/uBlk)+.5)*uBlk/uRes; vec2 px=uBlk*.35/uRes;
 float d=0.; vec2 g=vec2(0.);
 for(int i=0;i<4;i++){ vec2 o=vec2(i==0?-1.:i==1?1.:0., i==2?-1.:i==3?1.:0.)*px;
   float a=luma(texture(sIn0,bc+o).rgb), b=luma(texture(sIn1,bc+o).rgb); d+=abs(a-b); }
 d/=4.;
 float lc=luma(texture(sIn0,bc).rgb), lp=luma(texture(sIn1,bc).rgb);
 g=vec2(luma(texture(sIn0,bc+vec2(px.x,0.)).rgb)-luma(texture(sIn0,bc-vec2(px.x,0.)).rgb), luma(texture(sIn0,bc+vec2(0.,px.y)).rgb)-luma(texture(sIn0,bc-vec2(0.,px.y)).rgb));
 vec2 flow=-(lc-lp)*g/(dot(g,g)+0.002); flow=clamp(flow,-1.,1.);
 float moving=step(uTh,d);
 vec2 off=flow*uDrift*moving + (hash12(bc*91.7+floor(uTime*8.))-.5)*uDrift*0.15*moving;
 vec4 old=texture(sIn2,uv-off);
 old.r=texture(sIn2,uv-off+vec2(uChr,0.)).r; old.b=texture(sIn2,uv-off-vec2(uChr,0.)).b;
 float keep = uFreeze==1 ? 1. : uP*(1.-uRef);
 keep = mix(keep*0.6, keep, moving);
 fragColor=mix(cur,old,clamp(keep,0.,1.)); }`), { sIn0: src, sIn1: op.rt.prev, sIn2: prevOut, uIn0Res: [src.w, src.h], uP: K.parNum(op, 'persist'), uBlk: Math.max(2, K.parNum(op, 'block')), uDrift: K.parNum(op, 'drift'), uTh: K.parNum(op, 'thresh'), uRef: K.parNum(op, 'refresh'), uChr: K.parNum(op, 'chroma'), uFreeze: K.par(op, 'freeze') ? 1 : 0, uFirst: first ? 1 : 0 }, next);
      E.pass(COPY(), { sIn0: src }, op.rt.prev);
      op.rt.primed = true; op.rt.clean = false;
      return next;
    },
  });

  /* =====================================================================
     COLOR ROUTING
     ===================================================================== */
  const CM = [['r', 'Red'], ['g', 'Green'], ['b', 'Blue']];
  shaderTOP({
    type: 'channelmixTOP', label: 'Channel Mix', short: 'chanmix',
    help: '3 × 3 RGB matrix plus offsets: each output channel is a weighted mix of the input red, green and blue.',
    params: CM.flatMap(([k, n], oi) => [
      { name: k + 'r', label: n + ' ← R', type: 'float', default: oi === 0 ? 1 : 0, min: -2, max: 2, row: k },
      { name: k + 'g', label: n + ' ← G', type: 'float', default: oi === 1 ? 1 : 0, min: -2, max: 2, row: k },
      { name: k + 'b', label: n + ' ← B', type: 'float', default: oi === 2 ? 1 : 0, min: -2, max: 2, row: k },
    ]).concat(CM.map(([k, n]) => ({ name: k + 'o', label: n + ' Offset', type: 'float', default: 0, min: -1, max: 1, row: 'o' })),
      [{ name: 'amount', label: 'Mix', type: 'float', default: 1, min: 0, max: 1 }]),
    fs: `uniform mat3 uM; uniform vec3 uO; uniform float uAmt; void main(){ vec4 c=texture(sIn0,vUV); fragColor=vec4(mix(c.rgb,uM*c.rgb+uO,uAmt),c.a); }`,
    uniforms: (op) => {
      const v = (n) => K.parNum(op, n);
      // column-major: columns are input r,g,b
      return { uM: new Float32Array([v('rr'), v('gr'), v('br'), v('rg'), v('gg'), v('bg'), v('rb'), v('gb'), v('bb')]), uO: [v('ro'), v('go'), v('bo')], uAmt: v('amount') };
    },
  });

  const SRC = ['red', 'green', 'blue', 'alpha', 'luma', 'zero', 'one', 'inv red', 'inv green', 'inv blue', 'inv alpha', 'in1 red', 'in1 green', 'in1 blue', 'in1 alpha', 'in1 luma'];
  shaderTOP({
    type: 'reorderTOP', label: 'Reorder', short: 'reorder', inputs: 2, minInputs: 1,
    help: 'Rebuild RGBA from any channel of input 0 or input 1, constants, luma or inverted channels.',
    params: [['red', 'red'], ['green', 'green'], ['blue', 'blue'], ['alpha', 'alpha']].map(([n, d]) => ({ name: n, label: n[0].toUpperCase() + n.slice(1) + ' From', type: 'menu', options: SRC, default: d })),
    fs: LUMA + `uniform int uS0; uniform int uS1; uniform int uS2; uniform int uS3;
float pick(int s, vec4 a, vec4 b){ if(s<4) return a[s]; if(s==4) return luma(a.rgb); if(s==5) return 0.; if(s==6) return 1.; if(s<11) return 1.-a[s-7]; if(s<15) return b[s-11]; return luma(b.rgb); }
void main(){ vec4 a=texture(sIn0,vUV), b=texture(sIn1,vUV); fragColor=vec4(pick(uS0,a,b),pick(uS1,a,b),pick(uS2,a,b),pick(uS3,a,b)); }`,
    uniforms: (op) => { const u = {}; ['red', 'green', 'blue', 'alpha'].forEach((n, i) => { u['uS' + i] = Math.max(0, SRC.indexOf(K.par(op, n))); }); return u; },
  });

  K.defineOp({
    type: 'selectTOP', label: 'Select', short: 'select', family: 'TOP', gen: true,
    help: 'Pull in any TOP by name without a wire — reuse a look across a big network, or reach into a COMP.',
    params: [{ name: 'top', label: 'TOP', type: 'op', family: 'TOP', default: '' }, FIT],
    cook(op, ctx) {
      const r = ctx.ref(op, 'top', 'TOP');
      if (!r) { op.warn = 'Pick a TOP'; return null; }
      if (r === op) { op.warn = 'A Select TOP cannot select itself'; return null; }
      const t = K.cook(r);
      if (!t || K.par(op, 'res') === 'auto') return t; // zero-copy pass-through
      const size = ctx.size(op, t);
      op.rt.target = E.ensure(op.rt.target, size[0], size[1]);
      E.pass(E.program('__sel_fit', 'uniform int uFit; void main(){ vec2 uv=fitUV(vUV,uIn0Res,uRes,uFit); fragColor=(uv.x<0.||uv.y<0.||uv.x>1.||uv.y>1.)?vec4(0.):texture(sIn0,uv); }'),
        { sIn0: t, uIn0Res: [t.w, t.h], uFit: { stretch: 0, fit: 1, fill: 2 }[K.par(op, 'fit')] || 0 }, op.rt.target);
      return op.rt.target;
    },
  });

  /* =====================================================================
     FRAME HISTORY — one shared ring-buffer engine (TEXTURE_2D_ARRAY)
     ===================================================================== */
  function ringFor(op, src, frames) {
    const s = histScale(op);
    let w = Math.max(1, Math.round(src.w * s)), h = Math.max(1, Math.round(src.h * s)), n = Math.max(1, Math.round(frames));
    const bytes = w * h * 4 * n;
    if (bytes > RING_BUDGET) { const k = Math.sqrt(RING_BUDGET / bytes); w = Math.max(1, Math.floor(w * k)); h = Math.max(1, Math.floor(h * k)); op.warn = 'History reduced to ' + w + '×' + h + ' to save memory'; }
    op.rt.ring = E.ensureRing(op.rt.ring, w, h, n);
    return op.rt.ring;
  }
  function capture(op, ring, src) {
    if (!K.par(op, 'active')) return;
    const step = Math.max(1, K.parNum(op, 'step') | 0);
    op.rt.tick = (op.rt.tick || 0) + 1;
    if (ring.count === 0 || op.rt.tick % step === 0) E.ringWrite(ring, src);
  }
  const HIST_COMMON = [
    { name: 'active', label: 'Record', type: 'toggle', default: true, page: 'History' },
    { name: 'step', label: 'Capture Every N Frames', type: 'int', default: 1, min: 1, max: 12, page: 'History' },
    HISTRES,
    { name: 'clear', label: 'Clear History', type: 'pulse', page: 'History' },
  ];
  const clearPulse = (op, n) => { if (n === 'clear' && op.rt.ring) { op.rt.ring.count = 0; op.rt.ring.head = -1; } };

  K.defineOp({
    type: 'cacheTOP', label: 'Cache', short: 'cache', family: 'TOP',
    help: 'Stores the last N frames on the GPU. Index 0 is now, −1 the previous frame… Turn Record off to freeze and scrub a moment.',
    params: [
      { name: 'frames', label: 'Cache Size (frames)', type: 'int', default: 16, min: 1, max: 64 },
      { name: 'index', label: 'Output Index', type: 'float', default: 0, min: -63, max: 0 },
      { name: 'interp', label: 'Interpolate', type: 'toggle', default: true },
    ].concat(HIST_COMMON),
    pulse: clearPulse,
    cook(op, ctx) {
      const src = ctx.input(op, 0);
      if (!src) return null;
      const ring = ringFor(op, src, K.parNum(op, 'frames'));
      capture(op, ring, src);
      const size = ctx.size(op, src);
      op.rt.target = E.ensure(op.rt.target, size[0], size[1]);
      E.pass(E.program('cacheTOP', E.RING_GLSL + 'uniform float uK; uniform float uI; void main(){ fragColor=hist(vUV,uK,uI); }'),
        Object.assign(E.ringUniforms(ring), { uK: -Math.min(0, K.parNum(op, 'index')), uI: K.par(op, 'interp') ? 1 : 0 }), op.rt.target);
      return op.rt.target;
    },
  });

  K.defineOp({
    type: 'timemachineTOP', label: 'Time Machine', short: 'timemachine', family: 'TOP', inputs: 2, minInputs: 1,
    help: 'Every pixel shows a different moment: a map (input 1 or a built-in ramp) picks how far back in time each pixel looks. Slit-scan, time smears.',
    params: [
      { name: 'frames', label: 'History (frames)', type: 'int', default: 24, min: 2, max: 64 },
      { name: 'map', label: 'Time Map', type: 'menu', options: ['input 1', 'vertical ramp', 'horizontal ramp', 'radial', 'own luma'], default: 'input 1' },
      { name: 'black', label: 'Black Offset (frames)', type: 'float', default: -23, min: -63, max: 0 },
      { name: 'white', label: 'White Offset (frames)', type: 'float', default: 0, min: -63, max: 0 },
      { name: 'interp', label: 'Interpolate', type: 'toggle', default: true },
    ].concat(HIST_COMMON.map((p) => (p === HISTRES ? Object.assign({}, HISTRES, { default: 'half' }) : p))),
    pulse: clearPulse,
    cook(op, ctx) {
      const src = ctx.input(op, 0);
      if (!src) return null;
      const map = ctx.input(op, 1);
      const ring = ringFor(op, src, K.parNum(op, 'frames'));
      capture(op, ring, src);
      const size = ctx.size(op, src);
      op.rt.target = E.ensure(op.rt.target, size[0], size[1]);
      let mode = ['input 1', 'vertical ramp', 'horizontal ramp', 'radial', 'own luma'].indexOf(K.par(op, 'map'));
      if (mode === 0 && !map) mode = 1;
      E.pass(E.program('timemachineTOP', LUMA + E.RING_GLSL + `uniform int uMode; uniform float uB; uniform float uW; uniform float uI;
void main(){ float m;
 if(uMode==0) m=luma(texture(sIn1,vUV).rgb); else if(uMode==1) m=vUV.y; else if(uMode==2) m=vUV.x;
 else if(uMode==3) m=1.-clamp(length((vUV-.5)*vec2(uRes.x/uRes.y,1.))*1.6,0.,1.); else m=luma(texture(sIn0,vUV).rgb);
 float off=mix(uB,uW,m); fragColor=hist(vUV,-off,uI); }`),
        Object.assign(E.ringUniforms(ring), { sIn0: src, sIn1: map || E.black, uMode: mode, uB: K.parNum(op, 'black'), uW: K.parNum(op, 'white'), uI: K.par(op, 'interp') ? 1 : 0 }), op.rt.target);
      return op.rt.target;
    },
  });

  K.defineOp({
    type: 'timedisplaceTOP', label: 'Time Displace', short: 'timedisplace', family: 'TOP',
    help: 'Frame delay with smooth fractional delay, echoes and mix. Drive Delay from a CHOP (audio, GW strain) for elastic time.',
    params: [
      { name: 'delay', label: 'Delay', type: 'float', default: 6, min: 0, max: 63 },
      { name: 'units', label: 'Delay Units', type: 'menu', options: ['frames', 'seconds'], default: 'frames' },
      { name: 'echoes', label: 'Echoes', type: 'int', default: 1, min: 1, max: 6 },
      { name: 'decay', label: 'Echo Decay', type: 'float', default: 0.6, min: 0, max: 1 },
      { name: 'mix', label: 'Mix', type: 'float', default: 1, min: 0, max: 1 },
      { name: 'frames', label: 'Buffer (frames)', type: 'int', default: 32, min: 2, max: 64 },
    ].concat(HIST_COMMON),
    pulse: clearPulse,
    cook(op, ctx) {
      const src = ctx.input(op, 0);
      if (!src) return null;
      const ring = ringFor(op, src, K.parNum(op, 'frames'));
      capture(op, ring, src);
      let d = K.parNum(op, 'delay');
      if (K.par(op, 'units') === 'seconds') d = (d * K.project.fps) / Math.max(1, K.parNum(op, 'step'));
      const size = ctx.size(op, src);
      op.rt.target = E.ensure(op.rt.target, size[0], size[1]);
      E.pass(E.program('timedisplaceTOP', E.RING_GLSL + `uniform float uD; uniform int uE; uniform float uDec; uniform float uMix;
void main(){ vec4 cur=texture(sIn0,vUV); vec4 acc=vec4(0.); float wsum=0., w=1.;
 for(int i=1;i<=6;i++){ if(i>uE) break; acc+=hist(vUV,uD*float(i),1.)*w; wsum+=w; w*=uDec; }
 fragColor=mix(cur,acc/max(wsum,1e-4),uMix); }`),
        Object.assign(E.ringUniforms(ring), { sIn0: src, uD: Math.max(0, d), uE: K.parNum(op, 'echoes'), uDec: K.parNum(op, 'decay'), uMix: K.parNum(op, 'mix') }), op.rt.target);
      return op.rt.target;
    },
  });

  /* =====================================================================
     BLOB TRACK — GPU threshold → small readback → connected components → tracking
     ===================================================================== */
  const MAXB = 24;
  K.defineOp({
    type: 'blobtrackTOP', label: 'Blob Track', short: 'blobtrack', family: 'TOP',
    help: 'Finds bright (or dark) regions, gives each a persistent ID and outputs its position and size as channels: op(\'blobtrack1\')[\'b1u\'], [\'count\'] …',
    params: [
      { name: 'thresh', label: 'Threshold', type: 'float', default: 0.65, min: 0, max: 1 },
      { name: 'invert', label: 'Track Dark Regions', type: 'toggle', default: false },
      { name: 'minsize', label: 'Min Size (% of frame)', type: 'float', default: 0.15, min: 0, max: 20 },
      { name: 'maxblobs', label: 'Max Blobs', type: 'int', default: 8, min: 1, max: MAXB },
      { name: 'match', label: 'Match Distance', type: 'float', default: 0.15, min: 0.01, max: 0.7 },
      { name: 'smooth', label: 'Smoothing', type: 'float', default: 0.35, min: 0, max: 0.95 },
      { name: 'hold', label: 'Hold Lost Blobs (frames)', type: 'int', default: 5, min: 0, max: 30 },
      { name: 'analysis', label: 'Analysis Width (px)', type: 'menu', options: ['96', '160', '240', '320'], default: '160' },
      { name: 'view', label: 'View', type: 'menu', options: ['image + boxes', 'mask + boxes', 'boxes only', 'image'], default: 'image + boxes', page: 'Display' },
      { name: 'color', label: 'Box Color', type: 'color', default: '#aff5cb', page: 'Display' },
    ],
    cook(op, ctx) {
      const src = ctx.input(op, 0);
      if (!src) return null;
      const aw = +K.par(op, 'analysis') || 160, ah = Math.max(8, Math.round((aw * src.h) / src.w));
      op.rt.small = E.ensure(op.rt.small, aw, ah, { fmt: 'byte' });
      const th = K.parNum(op, 'thresh'), inv = K.par(op, 'invert') ? 1 : 0;
      E.pass(E.program('__blobmask', LUMA + 'uniform float uT; uniform int uInv; void main(){ vec2 px=0.5/uRes; float l=0.; for(int i=0;i<4;i++){ l+=luma(texture(sIn0,vUV+px*vec2(i==0||i==2?-1.:1.,i<2?-1.:1.)).rgb); } l*=.25; if(uInv==1) l=1.-l; fragColor=vec4(step(uT,l),l,0.,1.); }'),
        { sIn0: src, uT: th, uInv: inv }, op.rt.small);
      const gl = E.gl, px = op.rt.px && op.rt.px.length === aw * ah * 4 ? op.rt.px : (op.rt.px = new Uint8Array(aw * ah * 4));
      gl.bindFramebuffer(gl.FRAMEBUFFER, op.rt.small.fbo);
      gl.readPixels(0, 0, aw, ah, gl.RGBA, gl.UNSIGNED_BYTE, px);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const found = components(op, px, aw, ah, (K.parNum(op, 'minsize') / 100) * aw * ah, K.parNum(op, 'maxblobs'));
      const tracks = track(op, found, src.w / src.h);
      // channels
      const chans = [one('count', tracks.length)];
      tracks.forEach((t, i) => {
        const p = 'b' + (i + 1);
        chans.push(one(p + 'id', t.id), one(p + 'u', t.u), one(p + 'v', t.v), one(p + 'w', t.w), one(p + 'h', t.h), one(p + 'area', t.area));
      });
      // overlay
      const size = ctx.size(op, src);
      op.rt.target = E.ensure(op.rt.target, size[0], size[1]);
      const boxes = new Float32Array(MAXB * 4);
      tracks.forEach((t, i) => { boxes.set([t.u, t.v, t.w, t.h], i * 4); });
      const view = ['image + boxes', 'mask + boxes', 'boxes only', 'image'].indexOf(K.par(op, 'view'));
      E.pass(E.program('blobtrackTOP', `uniform vec4 uBox[${MAXB}]; uniform int uN; uniform int uView; uniform vec3 uCol; uniform sampler2D sMask;
void main(){ vec4 c = uView==1 ? vec4(vec3(texture(sMask,vUV).r),1.) : uView==2 ? vec4(0.) : texture(sIn0,vUV);
 if(uView==3){ fragColor=c; return; }
 vec2 lw=vec2(2.)/uRes; float m=0.;
 for(int i=0;i<${MAXB};i++){ if(i>=uN) break; vec4 b=uBox[i]; vec2 d=abs(vUV-b.xy)-b.zw*.5;
   float edge=step(max(d.x,d.y),0.)*(1.-step(max(d.x+lw.x,d.y+lw.y),0.)); m=max(m,edge);
   vec2 q=abs(vUV-b.xy); float cr=(step(q.x,lw.x*.75)*step(q.y,lw.y*6.))+(step(q.y,lw.y*.75)*step(q.x,lw.x*6.)); m=max(m,min(cr,1.)); }
 fragColor=mix(c,vec4(uCol,1.),m); }`), { sIn0: src, sMask: op.rt.small, uBox: boxes, uN: tracks.length, uView: view, uCol: rgb(op, 'color') }, op.rt.target);
      op.rt.target.chans = chans;
      return op.rt.target;
    },
  });
  // two-pass connected-component labelling (4-connected, union-find)
  function components(op, px, w, h, minArea, maxBlobs) {
    const n = w * h;
    const lab = op.rt.lab && op.rt.lab.length === n ? op.rt.lab : (op.rt.lab = new Int32Array(n));
    const parent = op.rt.par && op.rt.par.length >= n / 2 + 2 ? op.rt.par : (op.rt.par = new Int32Array((n >> 1) + 2));
    const find = (x) => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    let next = 1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (px[i * 4] < 128) { lab[i] = 0; continue; }
      const l = x > 0 ? lab[i - 1] : 0, u = y > 0 ? lab[i - w] : 0;
      if (!l && !u) { if (next >= parent.length) { lab[i] = 0; continue; } parent[next] = next; lab[i] = next++; }
      else if (l && u) { const a = find(l), b = find(u); lab[i] = Math.min(a, b); if (a !== b) parent[Math.max(a, b)] = Math.min(a, b); }
      else lab[i] = l || u;
    }
    const st = new Map();
    for (let i = 0; i < n; i++) {
      if (!lab[i]) continue;
      const r = find(lab[i]), x = i % w, y = (i / w) | 0;
      let s = st.get(r);
      if (!s) st.set(r, (s = { a: 0, sx: 0, sy: 0, x0: x, x1: x, y0: y, y1: y }));
      s.a++; s.sx += x; s.sy += y;
      if (x < s.x0) s.x0 = x; if (x > s.x1) s.x1 = x; if (y < s.y0) s.y0 = y; if (y > s.y1) s.y1 = y;
    }
    return Array.from(st.values()).filter((s) => s.a >= Math.max(1, minArea)).sort((a, b) => b.a - a.a).slice(0, maxBlobs)
      .map((s) => ({ u: (s.sx / s.a + 0.5) / w, v: (s.sy / s.a + 0.5) / h, w: (s.x1 - s.x0 + 1) / w, h: (s.y1 - s.y0 + 1) / h, area: s.a / n }));
  }
  function track(op, found, aspect) {
    const prev = op.rt.tracks || [], md = K.parNum(op, 'match'), sm = K.parNum(op, 'smooth'), hold = K.parNum(op, 'hold');
    op.rt.nextId = op.rt.nextId || 1;
    const used = new Set(), out = [];
    found.forEach((f) => {
      let best = null, bd = md;
      prev.forEach((t) => { if (used.has(t)) return; const d = Math.hypot((t.u - f.u) * aspect, t.v - f.v); if (d < bd) { bd = d; best = t; } });
      if (best) {
        used.add(best);
        out.push({ id: best.id, miss: 0, u: U.lerp(f.u, best.u, sm), v: U.lerp(f.v, best.v, sm), w: U.lerp(f.w, best.w, sm), h: U.lerp(f.h, best.h, sm), area: f.area });
      } else out.push(Object.assign({ id: op.rt.nextId++, miss: 0 }, f));
    });
    prev.forEach((t) => { if (!used.has(t) && t.miss < hold) out.push(Object.assign({}, t, { miss: t.miss + 1 })); });
    out.sort((a, b) => a.id - b.id);
    op.rt.tracks = out.slice(0, MAXB);
    return op.rt.tracks;
  }

  /* =====================================================================
     DATA READOUT — big number + label + sparkline from any CHOP or expression
     ===================================================================== */
  K.defineOp({
    type: 'datareadoutTOP', label: 'Data Readout', short: 'readout', family: 'TOP', gen: true,
    help: 'Shows a live value as a styled number with a label and an optional history graph. Transparent, ready to composite.',
    params: [
      { name: 'chop', label: 'CHOP', type: 'op', family: 'CHOP', default: '' },
      { name: 'chan', label: 'Channel (blank = first)', type: 'string', default: '' },
      { name: 'value', label: 'Value (if no CHOP)', type: 'float', default: 0, min: -1, max: 1 },
      { name: 'label', label: 'Label', type: 'string', default: 'SIGNAL' },
      { name: 'units', label: 'Units', type: 'string', default: '' },
      { name: 'decimals', label: 'Decimals', type: 'int', default: 2, min: 0, max: 8 },
      { name: 'sci', label: 'Scientific Notation', type: 'toggle', default: false },
      { name: 'history', label: 'History Graph', type: 'toggle', default: true },
      { name: 'histlen', label: 'History Length (frames)', type: 'int', default: 180, min: 10, max: 600 },
      { name: 'font', label: 'Font', type: 'font', options: K.FONTS, default: 'JetBrains Mono', page: 'Style' },
      { name: 'size', label: 'Size (% height)', type: 'float', default: 12, min: 2, max: 50, page: 'Style' },
      { name: 'px', label: 'Position X', type: 'float', default: 0.06, min: 0, max: 1, page: 'Style', row: 'p' },
      { name: 'py', label: 'Position Y', type: 'float', default: 0.82, min: 0, max: 1, page: 'Style', row: 'p' },
      { name: 'align', label: 'Align', type: 'menu', options: ['left', 'center', 'right'], default: 'left', page: 'Style' },
      { name: 'color', label: 'Color', type: 'color', default: '#ffffff', page: 'Style' },
      { name: 'accent', label: 'Graph Color', type: 'color', default: '#ff6a3d', page: 'Style' },
      { name: 'panel', label: 'Panel Alpha', type: 'float', default: 0.45, min: 0, max: 1, page: 'Style' },
    ],
    create(op) { op.rt.canvas = document.createElement('canvas'); op.rt.g = op.rt.canvas.getContext('2d'); op.rt.hist = []; },
    cook(op, ctx) {
      let v = K.parNum(op, 'value');
      const r = ctx.ref(op, 'chop', 'CHOP');
      if (r) {
        const out = K.cook(r), cn = String(K.par(op, 'chan') || '').trim();
        if (out && out.chans && out.chans.length) {
          const ch = cn ? out.chans.find((c) => c.name === cn) || out.chans[+cn] : out.chans[0];
          if (ch) v = ch.data[ch.data.length - 1]; else op.warn = 'No channel "' + cn + '"';
        }
      }
      const hist = op.rt.hist, hl = K.parNum(op, 'histlen');
      if (op.rt.lastFrame !== K.time.frame || K.time.playing) { hist.push(v); while (hist.length > hl) hist.shift(); op.rt.lastFrame = K.time.frame; }
      const size = ctx.size(op, null), w = Math.round(size[0]), h = Math.round(size[1]);
      const dec = K.parNum(op, 'decimals');
      const txt = (K.par(op, 'sci') ? v.toExponential(dec) : v.toFixed(dec)) + (K.par(op, 'units') ? ' ' + K.par(op, 'units') : '');
      draw(op, w, h, txt, hist);
      op.rt.tex = E.upload(op.rt.tex, op.rt.canvas, w, h);
      return op.rt.tex;
    },
  });
  function draw(op, w, h, txt, hist) {
    const c = op.rt.canvas, g = op.rt.g;
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    g.clearRect(0, 0, w, h);
    const px = (K.parNum(op, 'size') / 100) * h, font = K.par(op, 'font'), al = K.par(op, 'align');
    g.font = '600 ' + px + 'px "' + font + '", ui-monospace, monospace';
    const tw = g.measureText(txt).width;
    const label = String(K.par(op, 'label') || '');
    const lpx = px * 0.28;
    const showH = K.par(op, 'history') && hist.length > 1;
    const bw = Math.max(tw, showH ? px * 4 : 0) + px * 0.6, bh = px * 1.15 + (label ? lpx * 1.6 : 0) + (showH ? px * 0.9 : 0);
    let x = K.parNum(op, 'px') * w, y = (1 - K.parNum(op, 'py')) * h;
    let bx = al === 'left' ? x : al === 'right' ? x - bw : x - bw / 2;
    bx = U.clamp(bx, 0, Math.max(0, w - bw)); y = U.clamp(y, 0, Math.max(0, h - bh));
    const pa = K.parNum(op, 'panel');
    if (pa > 0) { g.globalAlpha = pa; g.fillStyle = '#000'; roundRect(g, bx, y, bw, bh, px * 0.18); g.fill(); g.globalAlpha = 1; }
    const pad = px * 0.3;
    let cy = y + pad;
    g.fillStyle = K.par(op, 'color'); g.textBaseline = 'top';
    if (label) { g.globalAlpha = 0.7; g.font = '500 ' + lpx + 'px "' + font + '", ui-monospace, monospace'; try { g.letterSpacing = lpx * 0.18 + 'px'; } catch (e) {} g.fillText(label.toUpperCase(), bx + pad, cy); g.globalAlpha = 1; cy += lpx * 1.6; try { g.letterSpacing = '0px'; } catch (e) {} }
    g.font = '600 ' + px + 'px "' + font + '", ui-monospace, monospace';
    g.fillText(txt, bx + pad, cy); cy += px * 1.05;
    if (showH) {
      let lo = Infinity, hi = -Infinity; hist.forEach((v) => { if (v < lo) lo = v; if (v > hi) hi = v; });
      if (hi - lo < 1e-12) { hi += 0.5; lo -= 0.5; }
      const gw = bw - pad * 2, gh = px * 0.62, gx = bx + pad, gy = cy;
      g.strokeStyle = K.par(op, 'accent'); g.lineWidth = Math.max(1.5, px * 0.04); g.lineJoin = 'round';
      g.beginPath();
      hist.forEach((v, i) => { const xx = gx + (i / (hist.length - 1)) * gw, yy = gy + gh - ((v - lo) / (hi - lo)) * gh; i ? g.lineTo(xx, yy) : g.moveTo(xx, yy); });
      g.stroke();
    }
  }
  function roundRect(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

  /* =====================================================================
     GRAVITATIONAL-WAVE FAMILY
     ===================================================================== */
  const GW = (K.gw = { cache: new Map(), seq: 0 });

  GW.gunzip = async function (buf) {
    const b = new Uint8Array(buf);
    if (!(b.length > 2 && b[0] === 0x1f && b[1] === 0x8b)) return new TextDecoder().decode(b);
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot open .gz files. Update Safari/Chrome, or unzip it to .txt first.');
    const stream = new Blob([buf]).stream().pipeThrough(new DecompressionStream('gzip'));
    return await new Response(stream).text();
  };
  GW.parse = function (text) {
    const vals = [];
    let rate = 0, dur = 0, gps = 0;
    const lines = text.split(/\r?\n/);
    for (let k = 0; k < lines.length; k++) {
      const line = lines[k].trim();
      if (!line) continue;
      if (line[0] === '#' || line[0] === '%') {
        const m1 = line.match(/(\d+(?:\.\d+)?)\s*samples\s*per\s*second/i) || line.match(/(\d+(?:\.\d+)?)\s*Hz/i);
        if (m1) rate = +m1[1];
        const m2 = line.match(/duration\s+(\d+(?:\.\d+)?)/i); if (m2) dur = +m2[1];
        const m3 = line.match(/GPS\s+(\d+(?:\.\d+)?)/i); if (m3) gps = +m3[1];
        continue;
      }
      const parts = line.split(/[\s,;]+/);
      const v = Number(parts[parts.length - 1]);
      if (Number.isFinite(v)) vals.push(v);
      if (vals.length > 2000000) throw new Error('More than 2,000,000 samples. Use a 32-second or 4096-second GWOSC file at 4 kHz.');
    }
    if (vals.length < 64) throw new Error('No strain samples found in this file.');
    if (!rate && dur) rate = vals.length / dur;
    return { raw: Float32Array.from(vals), rate: rate || 4096, gps };
  };
  // Physically-shaped demo signal so the GW tools work offline with no download
  GW.synthetic = function (rate, seconds, mergerAt) {
    const n = Math.round(rate * seconds), out = new Float32Array(n);
    const rnd = U.mulberry(150914);
    const gauss = () => { let u = 0, v = 0; while (!u) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
    let red = 0, phase = 0;
    for (let i = 0; i < n; i++) {
      const t = i / rate, tau = mergerAt - t;
      red = red * 0.995 + gauss() * 0.06;
      let s = gauss() * 0.35 + red * 0.9;
      if (tau > 0.0005) {
        const f = Math.min(300, 35 * Math.pow(Math.max(tau, 1e-4) / 0.2, -3 / 8));
        phase += (2 * Math.PI * f) / rate;
        const amp = 0.45 * Math.pow(f / 35, 2 / 3) * (tau < 3 ? 1 : Math.max(0, 1 - (tau - 3) / 3));
        s += amp * Math.sin(phase);
      } else {
        const td = -tau;
        s += 1.6 * Math.exp(-td / 0.004) * Math.sin(phase + 2 * Math.PI * 250 * td);
      }
      out[i] = s * 1e-21;
    }
    return out;
  };
  // zero-phase biquad band-pass (forward + backward)
  function biquad(x, type, f, rate, q) {
    const w = (2 * Math.PI * f) / rate, cs = Math.cos(w), al = Math.sin(w) / (2 * q);
    let b0, b1, b2;
    if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = (1 + cs) / 2; } else { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = (1 - cs) / 2; }
    const a0 = 1 + al, a1 = -2 * cs, a2 = 1 - al;
    const B0 = b0 / a0, B1 = b1 / a0, B2 = b2 / a0, A1 = a1 / a0, A2 = a2 / a0;
    const run = (src, dst, rev) => {
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0; const n = src.length;
      for (let k = 0; k < n; k++) { const i = rev ? n - 1 - k : k, xi = src[i]; const y = B0 * xi + B1 * x1 + B2 * x2 - A1 * y1 - A2 * y2; x2 = x1; x1 = xi; y2 = y1; y1 = y; dst[i] = y; }
    };
    const tmp = new Float32Array(x.length); run(x, tmp, false); run(tmp, tmp, true); return tmp;
  }
  GW.bandpass = function (x, rate, lo, hi) {
    // normalise first so float32 keeps precision on ~1e-21 strain
    let mean = 0; for (let i = 0; i < x.length; i++) mean += x[i]; mean /= x.length;
    let sd = 0; for (let i = 0; i < x.length; i++) sd += (x[i] - mean) * (x[i] - mean); sd = Math.sqrt(sd / x.length) || 1;
    let y = new Float32Array(x.length); for (let i = 0; i < x.length; i++) y[i] = (x[i] - mean) / sd;
    const ny = rate / 2 - 1;
    y = biquad(biquad(y, 'hp', U.clamp(lo, 1, ny), rate, 0.707), 'hp', U.clamp(lo, 1, ny), rate, 0.707);
    if (hi < ny) y = biquad(biquad(y, 'lp', hi, rate, 0.707), 'lp', hi, rate, 0.707);
    return y;
  };
  GW.prepare = function (raw, rate, opts) {
    const s = opts.bandpass ? GW.bandpass(raw, rate, opts.lo, opts.hi) : (() => { let m = 0; for (let i = 0; i < raw.length; i++) m += raw[i]; m /= raw.length; let sd = 0; for (let i = 0; i < raw.length; i++) sd += (raw[i] - m) ** 2; sd = Math.sqrt(sd / raw.length) || 1; const y = new Float32Array(raw.length); for (let i = 0; i < raw.length; i++) y[i] = (raw[i] - m) / sd; return y; })();
    // stats + RMS envelope at 10 ms hops (for merger detection and normalisation)
    let peak = 0, ss = 0; for (let i = 0; i < s.length; i++) { const a = Math.abs(s[i]); if (a > peak) peak = a; ss += s[i] * s[i]; }
    const hop = Math.max(1, Math.round(rate * 0.01)), win = Math.max(hop, Math.round(rate * 0.05));
    const env = new Float32Array(Math.ceil(s.length / hop));
    let envMax = 0, envArg = 0;
    for (let k = 0; k < env.length; k++) {
      const c = k * hop, a = Math.max(0, c - (win >> 1)), b = Math.min(s.length, c + (win >> 1));
      let e = 0; for (let i = a; i < b; i++) e += s[i] * s[i];
      env[k] = Math.sqrt(e / Math.max(1, b - a));
      if (env[k] > envMax) { envMax = env[k]; envArg = k; }
    }
    return { id: ++GW.seq, s, raw, rate, n: s.length, dur: s.length / rate, peak: peak || 1, rms: Math.sqrt(ss / s.length) || 1, env, envHop: hop, envMax: envMax || 1, merger: (envArg * hop) / rate };
  };
  GW.sampleAt = (g, t) => { const x = t * g.rate, i = Math.floor(x), f = x - i; const a = g.s[U.clamp(i, 0, g.n - 1)], b = g.s[U.clamp(i + 1, 0, g.n - 1)]; return a + (b - a) * f; };
  GW.envAt = (g, t) => g.env[U.clamp(Math.round((t * g.rate) / g.envHop), 0, g.env.length - 1)];
  GW.strainOf = (opOrName) => { const o = typeof opOrName === 'string' ? K.findOp(opOrName) : opOrName; return o && o.rt && o.rt.gw ? o : null; };
  // find the GW Strain In feeding an op (directly or through Null/Select-style CHOPs)
  GW.upstream = function (op, depth) {
    depth = depth || 0;
    if (!op || depth > 6) return null;
    if (op.rt && op.rt.gw) return op;
    for (const id of op.inputs) { const r = GW.upstream(K.getOp(id), depth + 1); if (r) return r; }
    return null;
  };

  // radix-2 FFT (in place)
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const ar = re[i + k], ai = im[i + k], br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
          re[i + k] = ar + br; im[i + k] = ai + bi; re[i + k + len / 2] = ar - br; im[i + k + len / 2] = ai - bi;
          const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
        }
      }
    }
  }
  GW.fft = fft;

  // ---------- GW Strain In ----------
  K.defineOp({
    type: 'gwstraininCHOP', label: 'GW Strain In', short: 'gwstrain', family: 'CHOP', gen: true, inputs: 1, minInputs: 0,
    help: 'Plays gravitational-wave strain (GWOSC .txt or .gz) as a control signal. Works offline with a built-in synthetic chirp. Wire a GW Film Sync CHOP in to drive the playhead.',
    params: [
      { name: 'source', label: 'Source', type: 'menu', options: ['auto', 'synthetic chirp', 'file', 'url'], default: 'auto' },
      { name: 'file', label: 'Strain File (.txt / .gz)', type: 'file', accept: '.gz,.txt,.dat,.csv,text/plain,application/gzip,application/x-gzip', default: '' },
      { name: 'url', label: 'or URL', type: 'string', default: '' },
      { name: 'rate', label: 'Sample Rate (0 = from file)', type: 'float', default: 0, min: 0, max: 16384 },
      { name: 'reload', label: 'Reload', type: 'pulse' },
      { name: 'playback', label: 'Playback', type: 'menu', options: ['timeline', 'free run'], default: 'timeline', page: 'Play' },
      { name: 'speed', label: 'Speed', type: 'float', default: 1, min: 0, max: 8, page: 'Play' },
      { name: 'start', label: 'Start (s into strain)', type: 'float', default: 0, min: 0, max: 4096, page: 'Play' },
      { name: 'loop', label: 'Loop', type: 'toggle', default: true, page: 'Play' },
      { name: 'merger', label: 'Merger At (s, 0 = auto)', type: 'float', default: 0, min: 0, max: 4096, page: 'Play' },
      { name: 'bandpass', label: 'Band-Pass Clean', type: 'toggle', default: true, page: 'Signal' },
      { name: 'lo', label: 'Low Cut (Hz)', type: 'float', default: 30, min: 5, max: 500, page: 'Signal', row: 'bp' },
      { name: 'hi', label: 'High Cut (Hz)', type: 'float', default: 350, min: 50, max: 2000, page: 'Signal', row: 'bp' },
      { name: 'normalize', label: 'Normalize (−1 to 1, off = noise σ)', type: 'toggle', default: true, page: 'Signal' },
      { name: 'gain', label: 'Gain', type: 'float', default: 1, min: 0, max: 20, page: 'Signal' },
    ],
    pulse(op, n) { if (n === 'reload') op.rt.key = null; },
    cook(op, ctx) {
      const srcMode = K.par(op, 'source');
      const fid = K.par(op, 'file'), m = fid && K.media.get(fid), url = String(K.par(op, 'url') || '').trim();
      const mode = srcMode === 'auto' ? (m ? 'file' : url ? 'url' : 'synthetic chirp') : srcMode;
      const opts = { bandpass: !!K.par(op, 'bandpass'), lo: K.parNum(op, 'lo'), hi: K.parNum(op, 'hi') };
      const rateOverride = K.parNum(op, 'rate');
      const key = [mode, mode === 'file' ? fid : mode === 'url' ? url : '', rateOverride, opts.bandpass, opts.lo, opts.hi].join('|');
      if (key !== op.rt.key) {
        op.rt.key = key; op.rt.err = null;
        const job = (op.rt.job = {});
        const finish = (raw, rate) => { if (op.rt.job !== job) return; try { op.rt.gw = GW.prepare(raw, rateOverride || rate, opts); op.rt.loading = false; } catch (e) { op.rt.err = e.message; op.rt.loading = false; } };
        if (mode === 'synthetic chirp') finish(GW.synthetic(4096, 32, 16), 4096);
        else {
          const href = mode === 'file' ? m && m.url : url;
          if (!href) { op.rt.gw = null; op.rt.err = mode === 'file' ? 'Choose a strain file (.txt or .gz from gwosc.org)' : 'Paste a strain file URL'; }
          else {
            op.rt.loading = true;
            fetch(href).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
              .then(GW.gunzip).then((txt) => { const p = GW.parse(txt); finish(p.raw, p.rate); })
              .catch((e) => { if (op.rt.job !== job) return; op.rt.loading = false; op.rt.err = /Failed to fetch|NetworkError|Load failed/i.test(e.message) ? 'Could not download (the server may block browser access). Download the file and choose it instead.' : e.message; });
          }
        }
      }
      const g = op.rt.gw;
      if (op.rt.loading) op.warn = 'Loading strain…';
      else if (op.rt.err) op.warn = op.rt.err;
      if (!g) return { chans: [one('strain', 0), one('env', 0), one('time', 0), one('progress', 0), one('tomerger', 0)] };
      // playhead
      let t;
      const drive = ctx.input(op, 0);
      if (drive && drive.chans && drive.chans.length) {
        const c = drive.chans.find((x) => x.name === 'gwtime') || drive.chans[0];
        t = c.data[c.data.length - 1];
      } else if (K.par(op, 'playback') === 'free run') {
        op.rt.free = (op.rt.free || 0) + (K.time.playing ? K.time.dt * K.parNum(op, 'speed') : 0);
        t = K.parNum(op, 'start') + op.rt.free;
      } else t = K.parNum(op, 'start') + K.time.seconds * K.parNum(op, 'speed');
      t = K.par(op, 'loop') ? ((t % g.dur) + g.dur) % g.dur : U.clamp(t, 0, g.dur);
      op.rt.t = t;
      const merger = K.parNum(op, 'merger') > 0 ? K.parNum(op, 'merger') : g.merger;
      g.mergerUsed = merger;
      const norm = K.par(op, 'normalize') ? 1 / g.peak : 1; // off = units of noise σ
      const gain = K.parNum(op, 'gain');
      return { chans: [one('strain', GW.sampleAt(g, t) * norm * gain), one('env', (GW.envAt(g, t) / g.envMax) * gain), one('time', t), one('progress', t / g.dur), one('tomerger', merger - t)] };
    },
  });

  // ---------- GW Signal Analysis ----------
  K.defineOp({
    type: 'gwanalysisCHOP', label: 'GW Signal Analysis', short: 'gwanalysis', family: 'CHOP',
    help: 'Turns strain into usable 0–1 controls: absolute amplitude, RMS envelope and peak envelope (relative to the loudest moment). Also works on any CHOP.',
    params: [
      { name: 'window', label: 'Window (ms)', type: 'float', default: 80, min: 5, max: 1000 },
      { name: 'release', label: 'Peak Release (s)', type: 'float', default: 0.4, min: 0, max: 5 },
      { name: 'gain', label: 'Gain', type: 'float', default: 1, min: 0.1, max: 20 },
      { name: 'clamp', label: 'Clamp 0–1', type: 'toggle', default: true },
    ],
    cook(op, ctx) {
      const inp = ctx.input(op, 0);
      const src = GW.upstream(ctx.inputOp(op, 0));
      const gain = K.parNum(op, 'gain'), cl = K.par(op, 'clamp');
      const fin = (v) => (cl ? U.clamp(v * gain, 0, 1) : v * gain);
      let abs = 0, rms = 0, pk = 0;
      if (src && src.rt.gw) {
        const g = src.rt.gw, t = src.rt.t || 0, half = (K.parNum(op, 'window') / 1000) * g.rate * 0.5;
        const a = Math.max(0, Math.floor(t * g.rate - half)), b = Math.min(g.n, Math.ceil(t * g.rate + half));
        let ss = 0, mx = 0; for (let i = a; i < b; i++) { const v = g.s[i]; ss += v * v; const av = Math.abs(v); if (av > mx) mx = av; }
        const scale = g.envMax * 3; // envelope max ≈ loudest 50 ms; peaks sit ~3× above RMS
        abs = Math.abs(GW.sampleAt(g, t)) / scale; rms = Math.sqrt(ss / Math.max(1, b - a)) / g.envMax; pk = mx / scale;
      } else if (inp && inp.chans && inp.chans.length) {
        // generic: running envelope of channel 0 over time
        const v = inp.chans[0].data[inp.chans[0].data.length - 1];
        const n = Math.max(1, Math.round((K.parNum(op, 'window') / 1000) * K.project.fps));
        const h = (op.rt.h = op.rt.h || []); h.push(v); while (h.length > n) h.shift();
        abs = Math.abs(v); rms = Math.sqrt(h.reduce((s, x) => s + x * x, 0) / h.length); pk = h.reduce((s, x) => Math.max(s, Math.abs(x)), 0);
      } else { op.warn = 'Wire a GW Strain In (or any CHOP)'; }
      const rel = K.parNum(op, 'release');
      const prev = op.rt.pk || 0, k = rel <= 0 ? 1 : 1 - Math.exp(-K.time.dt / rel);
      op.rt.pk = pk > prev ? pk : prev + (pk - prev) * k;
      return { chans: [one('abs', fin(abs)), one('rms', fin(rms)), one('peak', fin(op.rt.pk))] };
    },
  });

  // ---------- GW Chirp Analysis ----------
  K.defineOp({
    type: 'gwchirpCHOP', label: 'GW Chirp Analysis', short: 'gwchirp', family: 'CHOP',
    help: 'Tracks the rising chirp: frequency of the strongest excess over the noise baseline, its progress through the band, and how far it stands out.',
    params: [
      { name: 'lo', label: 'Low (Hz)', type: 'float', default: 30, min: 10, max: 500, row: 'band' },
      { name: 'hi', label: 'High (Hz)', type: 'float', default: 350, min: 20, max: 1000, row: 'band' },
      { name: 'window', label: 'Window (ms)', type: 'float', default: 125, min: 32, max: 500 },
      { name: 'bands', label: 'Bands', type: 'int', default: 48, min: 16, max: 96 },
      { name: 'thresh', label: 'Detect Threshold (× noise)', type: 'float', default: 2, min: 1, max: 20 },
      { name: 'smooth', label: 'Smoothing', type: 'float', default: 0.65, min: 0, max: 0.98 },
      { name: 'gain', label: 'Gain', type: 'float', default: 1, min: 0.1, max: 8 },
    ],
    cook(op, ctx) {
      ctx.input(op, 0);
      const src = GW.upstream(ctx.inputOp(op, 0));
      const zero = () => ({ chans: ['freq', 'progress', 'strength', 'active', 'ratio', 'composite'].map((n) => one(n, 0)) });
      if (!src || !src.rt.gw) { op.warn = 'Wire a GW Strain In'; return zero(); }
      const g = src.rt.gw, t = src.rt.t || 0;
      const lo = Math.max(1, K.parNum(op, 'lo')), hi = Math.max(lo + 5, Math.min(K.parNum(op, 'hi'), g.rate / 2 - 1));
      const nb = K.parNum(op, 'bands') | 0;
      let N = 32; while (N < (K.parNum(op, 'window') / 1000) * g.rate && N < 8192) N <<= 1;
      const cfg = [g.id, lo, hi, nb, N].join('|');
      if (op.rt.cfg !== cfg) {
        op.rt.cfg = cfg;
        op.rt.re = new Float32Array(N); op.rt.im = new Float32Array(N);
        op.rt.win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
        // log-spaced band edges in FFT bins
        op.rt.edges = []; op.rt.cent = [];
        for (let b = 0; b <= nb; b++) op.rt.edges.push(Math.max(1, Math.round((lo * Math.pow(hi / lo, b / nb) * N) / g.rate)));
        for (let b = 0; b < nb; b++) op.rt.cent.push(lo * Math.pow(hi / lo, (b + 0.5) / nb));
        // noise baseline: median band power across ~96 windows spread through the file
        const samples = [];
        const M = Math.min(96, Math.max(8, Math.floor(g.n / N)));
        for (let k = 0; k < M; k++) samples.push(bandPowers(op, g, ((k + 0.5) / M) * g.dur, N, nb).slice());
        op.rt.base = new Float32Array(nb);
        for (let b = 0; b < nb; b++) { const col = samples.map((s) => s[b]).sort((x, y) => x - y); op.rt.base[b] = col[col.length >> 1] || 1e-12; }
        op.rt.sm = null;
      }
      const P = bandPowers(op, g, t, N, nb);
      let best = 0, bi = 0, wsum = 0, fsum = 0;
      const th = K.parNum(op, 'thresh');
      for (let b = 0; b < nb; b++) {
        const r = P[b] / op.rt.base[b];
        if (r > best) { best = r; bi = b; }
        if (r > th) { const w = r - th; wsum += w; fsum += w * Math.log(op.rt.cent[b]); }
      }
      const active = best > th ? 1 : 0;
      const freq = wsum > 0 ? Math.exp(fsum / wsum) : op.rt.cent[bi];
      const prog = Math.log(freq / lo) / Math.log(hi / lo);
      const strength = U.clamp(Math.log(best / th + 1e-9) / Math.log(8) + 0.5 * active, 0, 1) * active;
      const sm = K.parNum(op, 'smooth'), gain = K.parNum(op, 'gain');
      const cur = { freq: active ? freq : (op.rt.sm ? op.rt.sm.freq : lo), progress: active ? prog : (op.rt.sm ? op.rt.sm.progress * 0.97 : 0), strength, ratio: best };
      if (!op.rt.sm) op.rt.sm = cur;
      Object.keys(cur).forEach((k) => { op.rt.sm[k] = op.rt.sm[k] * sm + cur[k] * (1 - sm); });
      const S = op.rt.sm;
      return { chans: [one('freq', S.freq), one('progress', U.clamp(S.progress * gain, 0, 1)), one('strength', U.clamp(S.strength * gain, 0, 1)), one('active', active), one('ratio', S.ratio), one('composite', U.clamp(S.progress * S.strength * gain, 0, 1))] };
    },
  });
  function bandPowers(op, g, t, N, nb) {
    const re = op.rt.re, im = op.rt.im, w = op.rt.win;
    const c = Math.round(t * g.rate) - (N >> 1);
    for (let i = 0; i < N; i++) { const k = U.clamp(c + i, 0, g.n - 1); re[i] = g.s[k] * w[i]; im[i] = 0; }
    fft(re, im);
    const out = op.rt.pw && op.rt.pw.length === nb ? op.rt.pw : (op.rt.pw = new Float32Array(nb));
    const e = op.rt.edges;
    for (let b = 0; b < nb; b++) {
      let s = 0, cnt = 0; const a = e[b], z = Math.max(a + 1, e[b + 1]);
      for (let k = a; k < z && k < N / 2; k++) { s += re[k] * re[k] + im[k] * im[k]; cnt++; }
      out[b] = s / Math.max(1, cnt);
    }
    return out;
  }

  // ---------- GW Sine Modulator ----------
  K.defineOp({
    type: 'gwsineCHOP', label: 'GW Sine Modulator', short: 'gwsine', family: 'CHOP',
    help: 'An oscillator whose speed and size follow the input: quiet input = slow, small swing; loud input = fast, wide swing. Turns jittery data into smooth motion.',
    params: [
      { name: 'wave', label: 'Wave', type: 'menu', options: ['sine', 'triangle', 'square', 'saw'], default: 'sine' },
      { name: 'base', label: 'Base Frequency (Hz)', type: 'float', default: 0.12, min: 0, max: 10 },
      { name: 'depth', label: 'Frequency Depth (Hz)', type: 'float', default: 1.5, min: 0, max: 20 },
      { name: 'amp', label: 'Amplitude', type: 'float', default: 1, min: 0, max: 4 },
      { name: 'floor', label: 'Amplitude Floor', type: 'float', default: 0.18, min: 0, max: 1 },
      { name: 'offset', label: 'Offset', type: 'float', default: 0, min: -4, max: 4 },
      { name: 'ingain', label: 'Input Gain', type: 'float', default: 1, min: 0, max: 20 },
      { name: 'lag', label: 'Input Smoothing (s)', type: 'float', default: 0.25, min: 0, max: 5 },
      { name: 'unipolar', label: 'Output 0–1', type: 'toggle', default: false },
    ],
    cook(op, ctx) {
      const inp = ctx.input(op, 0);
      let d = 0;
      if (inp && inp.chans && inp.chans.length) d = Math.abs(inp.chans[0].data[inp.chans[0].data.length - 1]) * K.parNum(op, 'ingain');
      d = U.clamp(d, 0, 1);
      const lag = K.parNum(op, 'lag'), k = lag <= 0 ? 1 : 1 - Math.exp(-K.time.dt / lag);
      op.rt.d = (op.rt.d == null ? d : op.rt.d) + (d - (op.rt.d == null ? d : op.rt.d)) * k;
      const D = op.rt.d;
      const f = K.parNum(op, 'base') + K.parNum(op, 'depth') * D;
      if (K.time.playing) op.rt.ph = ((op.rt.ph || 0) + f * K.time.dt) % 1e6;
      const fl = K.parNum(op, 'floor');
      const amp = K.parNum(op, 'amp') * (fl + (1 - fl) * D);
      let w = K.wave(K.par(op, 'wave'), op.rt.ph || 0);
      if (K.par(op, 'unipolar')) w = w * 0.5 + 0.5;
      return { chans: [one('sine', K.parNum(op, 'offset') + amp * w), one('freq', f), one('drive', D), one('phase', ((op.rt.ph || 0) % 1 + 1) % 1)] };
    },
  });

  // ---------- GW Film Sync ----------
  K.defineOp({
    type: 'gwfilmsyncCHOP', label: 'GW Film Sync', short: 'gwfilmsync', family: 'CHOP', gen: true,
    help: 'Lands the merger on a film beat: stretches the inspiral to end exactly at Film Merger Time, and the ringdown to fill the rest. Wire it into a GW Strain In.',
    params: [
      { name: 'strain', label: 'GW Strain In', type: 'op', family: 'CHOP', filter: 'gwstraininCHOP', default: '' },
      { name: 'clock', label: 'Film Clock', type: 'menu', options: ['timeline', 'movie'], default: 'timeline' },
      { name: 'movie', label: 'Movie File In', type: 'op', family: 'TOP', filter: 'moviefileinTOP', default: '' },
      { name: 'filmstart', label: 'Film Start (s)', type: 'float', default: 0, min: 0, max: 3600, page: 'Timing' },
      { name: 'filmmerger', label: 'Film Merger Time (s)', type: 'float', default: 20, min: 0, max: 3600, page: 'Timing' },
      { name: 'filmend', label: 'Film End (s, 0 = auto)', type: 'float', default: 0, min: 0, max: 3600, page: 'Timing' },
      { name: 'gwstart', label: 'Strain Start (s)', type: 'float', default: 0, min: 0, max: 4096, page: 'Strain' },
      { name: 'gwmerger', label: 'Strain Merger (s, 0 = auto)', type: 'float', default: 0, min: 0, max: 4096, page: 'Strain' },
      { name: 'gwend', label: 'Strain End (s, 0 = file end)', type: 'float', default: 0, min: 0, max: 4096, page: 'Strain' },
      { name: 'ease', label: 'Ease Into Merger', type: 'float', default: 0, min: 0, max: 1, page: 'Strain' },
    ],
    cook(op, ctx) {
      const s = ctx.ref(op, 'strain', 'CHOP');
      const g = s && s.rt.gw;
      let film = K.time.seconds, filmDur = K.project.length;
      if (K.par(op, 'clock') === 'movie') {
        const mv = ctx.ref(op, 'movie', 'TOP'), v = mv && mv.rt.video;
        if (v) { film = v.currentTime || 0; if (isFinite(v.duration) && v.duration > 0) filmDur = v.duration; } else op.warn = 'Pick a Movie File In (or use the timeline clock)';
      }
      if (!g) { if (!op.warn) op.warn = 'Pick a GW Strain In'; return { chans: [one('gwtime', 0), one('phase', 0), one('tomerger', 0), one('prerate', 1), one('postrate', 1)] }; }
      const fs = K.parNum(op, 'filmstart'), fm = Math.max(fs + 0.01, K.parNum(op, 'filmmerger'));
      const fe = Math.max(fm + 0.01, K.parNum(op, 'filmend') > 0 ? K.parNum(op, 'filmend') : filmDur);
      const gs = K.parNum(op, 'gwstart'), gm = K.parNum(op, 'gwmerger') > 0 ? K.parNum(op, 'gwmerger') : g.mergerUsed || g.merger;
      const ge = K.parNum(op, 'gwend') > 0 ? K.parNum(op, 'gwend') : g.dur;
      let gt, phase;
      if (film < fm) {
        let u = U.clamp((film - fs) / (fm - fs), 0, 1);
        const e = K.parNum(op, 'ease'); if (e > 0) u = U.lerp(u, 1 - Math.pow(1 - u, 2), e);
        gt = U.lerp(gs, gm, u); phase = 0;
      } else { gt = U.lerp(gm, ge, U.clamp((film - fm) / (fe - fm), 0, 1)); phase = 1; }
      return { chans: [one('gwtime', gt), one('phase', phase), one('tomerger', fm - film), one('prerate', (gm - gs) / (fm - fs)), one('postrate', (ge - gm) / (fe - fm))] };
    },
  });
})();
