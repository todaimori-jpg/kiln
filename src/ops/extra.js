/* Kiln — extra.js : additional TD-style operators (image, channel, geometry, data) */
(function () {
  'use strict';
  const K = window.K, U = K.util;

  /* ================================================================== */
  /*  TOP — extra image operations                                      */
  /* ================================================================== */
  const FIT = { name: 'fit', label: 'Input Fit', type: 'menu', options: ['stretch', 'fit', 'fill'], default: 'fill', page: 'Common' };
  const fitIdx = (v) => ({ stretch: 0, fit: 1, fill: 2 }[v] || 0);
  const rgb = (op, n) => U.hexToRgb(K.par(op, n));

  /* ---------- Chroma Key ---------- */
  K.shaderTOP({
    type: 'chromakeyTOP', label: 'Chroma Key', short: 'chromakey',
    help: 'Removes a background color (green/blue screen). Tolerance and softness refine the matte; Spill Suppress removes colored fringes. Show: matte lets you inspect the alpha.',
    params: [
      { name: 'key', label: 'Key Color', type: 'color', default: '#00ff00' },
      { name: 'space', label: 'Distance', type: 'menu', options: ['chroma', 'rgb'], default: 'chroma' },
      { name: 'tol', label: 'Tolerance', type: 'float', default: 0.10, min: 0, max: 1 },
      { name: 'soft', label: 'Softness', type: 'float', default: 0.08, min: 0, max: 1 },
      { name: 'spill', label: 'Spill Suppress', type: 'float', default: 0.7, min: 0, max: 1 },
      { name: 'despill', label: 'Remove Spill', type: 'toggle', default: true },
      { name: 'show', label: 'Show', type: 'menu', options: ['result', 'matte'], default: 'result' },
      FIT,
    ],
    fs: `uniform vec3 uKey; uniform int uSpace; uniform float uTol; uniform float uSoft; uniform float uSpill; uniform int uSpillOn; uniform int uShow; uniform int uFit; uniform int uChan;
void main(){
  vec2 uv=fitUV(vUV,uIn0Res,uRes,uFit);
  vec4 c=texture(sIn0,uv);
  vec3 k=uKey;
  float d;
  if(uSpace==0){
    float lc=dot(c.rgb,vec3(.299,.587,.114));
    float lk=dot(k,vec3(.299,.587,.114));
    d=distance(c.rgb-lc,k-lk);
  } else d=distance(c.rgb,k);
  float a=smoothstep(uTol,uTol+max(uSoft,1e-4),d);
  vec3 col=c.rgb;
  if(uSpillOn==1){
    if(uChan==0){ float s=col.r-max(col.g,col.b); if(s>0.0) col.r-=s*uSpill; }
    else if(uChan==1){ float s=col.g-max(col.r,col.b); if(s>0.0) col.g-=s*uSpill; }
    else { float s=col.b-max(col.r,col.g); if(s>0.0) col.b-=s*uSpill; }
  }
  if(uShow==1){ fragColor=vec4(vec3(a),1.0); return; }
  fragColor=vec4(col,a*c.a);
}`,
    uniforms: (op) => {
      const k = rgb(op, 'key');
      const ch = (k[1] >= k[0] && k[1] >= k[2]) ? 1 : (k[0] >= k[2] ? 0 : 2);
      return {
        uKey: k, uChan: ch, uSpace: K.par(op, 'space') === 'rgb' ? 1 : 0,
        uTol: K.parNum(op, 'tol'), uSoft: K.parNum(op, 'soft'), uSpill: K.parNum(op, 'spill'),
        uSpillOn: K.par(op, 'despill') ? 1 : 0, uShow: K.par(op, 'show') === 'matte' ? 1 : 0,
        uFit: fitIdx(K.par(op, 'fit')),
      };
    },
  });

  /* ---------- Vignette ---------- */
  K.shaderTOP({
    type: 'vignetteTOP', label: 'Vignette', short: 'vignette',
    help: 'Darkens (or colors) the edges with a soft radial falloff. Offset the center for off-axis light and animate the radius for pulses.',
    params: [
      { name: 'amount', label: 'Amount', type: 'float', default: 0.7, min: 0, max: 1 },
      { name: 'radius', label: 'Radius', type: 'float', default: 0.75, min: 0.05, max: 3 },
      { name: 'soft', label: 'Softness', type: 'float', default: 0.45, min: 0.01, max: 1.5 },
      { name: 'color', label: 'Edge Color', type: 'color', default: '#000000' },
      { name: 'ox', label: 'Center X', type: 'float', default: 0, min: -1, max: 1, row: 'o' },
      { name: 'oy', label: 'Center Y', type: 'float', default: 0, min: -1, max: 1, row: 'o' },
      { name: 'round', label: 'Roundness', type: 'float', default: 1, min: 0, max: 4 },
      FIT,
    ],
    fs: `uniform float uAmt; uniform float uRadius; uniform float uSoft; uniform vec3 uColor; uniform vec2 uO; uniform float uRound; uniform int uFit;
void main(){ vec2 uv=fitUV(vUV,uIn0Res,uRes,uFit); vec4 c=texture(sIn0,uv);
 vec2 p=(vUV-0.5-uO*0.5)*vec2(pow(uRes.x/max(uRes.y,1.0),uRound),1.0);
 float d=length(p)/max(uRadius,1e-4);
 float v=1.0-smoothstep(max(0.0,1.0-uSoft),1.0,d);
 fragColor=vec4(mix(c.rgb,uColor,uAmt*v),c.a); }`,
    uniforms: (op) => ({
      uAmt: K.parNum(op, 'amount'), uRadius: K.parNum(op, 'radius'), uSoft: K.parNum(op, 'soft'),
      uColor: rgb(op, 'color'), uO: [K.parNum(op, 'ox'), K.parNum(op, 'oy')],
      uRound: K.parNum(op, 'round'), uFit: fitIdx(K.par(op, 'fit')),
    }),
  });

  /* ---------- Sharpen (unsharp mask) ---------- */
  K.shaderTOP({
    type: 'sharpenTOP', label: 'Sharpen', short: 'sharpen',
    help: 'Unsharp mask: adds the difference between the image and a blurred copy. Radius in pixels; Threshold protects smooth areas from noise.',
    params: [
      { name: 'amount', label: 'Amount', type: 'float', default: 1, min: 0, max: 5 },
      { name: 'radius', label: 'Radius (px)', type: 'float', default: 1.2, min: 0.25, max: 12 },
      { name: 'threshold', label: 'Threshold', type: 'float', default: 0, min: 0, max: 1 },
      FIT,
    ],
    fs: `uniform float uAmt; uniform float uRadius; uniform float uThresh; uniform int uFit;
vec4 tap(vec2 uv){ return texture(sIn0,uv); }
void main(){ vec2 uv=fitUV(vUV,uIn0Res,uRes,uFit); vec2 px=vec2(uRadius)/max(uRes,vec2(1.0));
 vec4 c=tap(uv);
 vec4 b=tap(uv+px*vec2(1.0,0.0))+tap(uv-px*vec2(1.0,0.0))
       +tap(uv+px*vec2(0.0,1.0))+tap(uv-px*vec2(0.0,1.0))
       +tap(uv+px*vec2(.707,.707))*0.5+tap(uv-px*vec2(.707,.707))*0.5
       +tap(uv+px*vec2(.707,-.707))*0.5+tap(uv-px*vec2(.707,-.707))*0.5;
 b*=0.125;
 vec3 d=c.rgb-b.rgb;
 float m=max(max(abs(d.r),abs(d.g)),abs(d.b));
 fragColor=vec4(c.rgb+d*uAmt*step(uThresh,m),c.a); }`,
    uniforms: (op) => ({ uAmt: K.parNum(op, 'amount'), uRadius: K.parNum(op, 'radius'), uThresh: K.parNum(op, 'threshold'), uFit: fitIdx(K.par(op, 'fit')) }),
  });

  /* ---------- Gradient Map ---------- */
  K.shaderTOP({
    type: 'gradientmapTOP', label: 'Gradient Map', short: 'gradientmap',
    help: 'Maps brightness to a four-stop color gradient. Choose which channel controls the mapping, adjust gamma and blend back over the original.',
    params: [
      { name: 'source', label: 'Map From', type: 'menu', options: ['luminance', 'red', 'green', 'blue', 'average', 'alpha'], default: 'luminance' },
      { name: 'c0', label: 'Shadow', type: 'color', default: '#05050a', row: 'c0' },
      { name: 'c1', label: 'Low Mid', type: 'color', default: '#2a1a4a', row: 'c1' },
      { name: 'c2', label: 'High Mid', type: 'color', default: '#ff5b4a', row: 'c2' },
      { name: 'c3', label: 'Highlight', type: 'color', default: '#fff3d6', row: 'c3' },
      { name: 'p1', label: 'Stop 1', type: 'float', default: 0.33, min: 0.01, max: 0.99 },
      { name: 'p2', label: 'Stop 2', type: 'float', default: 0.66, min: 0.01, max: 0.99 },
      { name: 'gamma', label: 'Gamma', type: 'float', default: 1, min: 0.1, max: 4 },
      { name: 'invert', label: 'Invert', type: 'toggle', default: false },
      { name: 'mix', label: 'Blend', type: 'float', default: 1, min: 0, max: 1 },
      FIT,
    ],
    fs: `uniform int uSrc; uniform vec3 uC0,uC1,uC2,uC3; uniform float uP1,uP2,uGamma,uMix; uniform int uInv; uniform int uFit;
void main(){ vec2 uv=fitUV(vUV,uIn0Res,uRes,uFit); vec4 c=texture(sIn0,uv);
 float t;
 if(uSrc==0) t=dot(c.rgb,vec3(.299,.587,.114));
 else if(uSrc==1) t=c.r;
 else if(uSrc==2) t=c.g;
 else if(uSrc==3) t=c.b;
 else if(uSrc==4) t=(c.r+c.g+c.b)/3.0;
 else t=c.a;
 t=clamp(t,0.,1.); if(uInv==1) t=1.0-t; t=pow(t,max(uGamma,1e-3));
 float p1=clamp(uP1,0.001,0.999), p2=clamp(uP2,p1+0.001,0.999);
 vec3 g;
 if(t<=p1) g=mix(uC0,uC1,t/max(p1,1e-4));
 else if(t<=p2) g=mix(uC1,uC2,(t-p1)/max(p2-p1,1e-4));
 else g=mix(uC2,uC3,(t-p2)/max(1.0-p2,1e-4));
 fragColor=vec4(mix(c.rgb,g,uMix),c.a); }`,
    uniforms: (op) => ({
      uSrc: ['luminance', 'red', 'green', 'blue', 'average', 'alpha'].indexOf(K.par(op, 'source')),
      uC0: rgb(op, 'c0'), uC1: rgb(op, 'c1'), uC2: rgb(op, 'c2'), uC3: rgb(op, 'c3'),
      uP1: K.parNum(op, 'p1'), uP2: K.parNum(op, 'p2'), uGamma: K.parNum(op, 'gamma'),
      uInv: K.par(op, 'invert') ? 1 : 0, uMix: K.parNum(op, 'mix'), uFit: fitIdx(K.par(op, 'fit')),
    }),
  });

  /* ---------- Directional / Radial / Spin Blur ---------- */
  K.shaderTOP({
    type: 'directionalblurTOP', label: 'Directional Blur', short: 'dirblur',
    help: 'Streaks the image in one direction, outward from the center, or spinning around it. Great for speed lines, dreamy glow and radial hits.',
    params: [
      { name: 'mode', label: 'Mode', type: 'menu', options: ['linear', 'radial', 'spin'], default: 'linear' },
      { name: 'angle', label: 'Angle', type: 'float', default: 0, min: -180, max: 180 },
      { name: 'length', label: 'Length', type: 'float', default: 0.12, min: 0, max: 1 },
      { name: 'samples', label: 'Samples', type: 'int', default: 12, min: 2, max: 32 },
      { name: 'cx', label: 'Center X', type: 'float', default: 0, min: -1, max: 1, row: 'c' },
      { name: 'cy', label: 'Center Y', type: 'float', default: 0, min: -1, max: 1, row: 'c' },
      FIT,
    ],
    fs: `uniform int uMode; uniform float uAngle; uniform float uLen; uniform int uSamples; uniform vec2 uC; uniform int uFit;
void main(){ vec2 base=fitUV(vUV,uIn0Res,uRes,uFit); vec4 sum=vec4(0.0);
 float n=max(float(uSamples),2.0); vec2 c=uC*0.5+0.5;
 for(int i=0;i<32;i++){
   if(i>=uSamples) break;
   float f=float(i)/(n-1.0)-0.5;
   vec2 uv=base;
   if(uMode==0){ uv+=vec2(cos(radians(uAngle)),sin(radians(uAngle)))*uLen*f; }
   else if(uMode==1){ uv=base+(base-c)*uLen*f*2.0; }
   else { float a=uLen*TAU*f*2.0; vec2 q=base-c; uv=c+mat2(cos(a),-sin(a),sin(a),cos(a))*q; }
   sum+=texture(sIn0,uv);
 }
 fragColor=sum/n; }`,
    uniforms: (op) => ({
      uMode: ['linear', 'radial', 'spin'].indexOf(K.par(op, 'mode')), uAngle: K.parNum(op, 'angle'),
      uLen: K.parNum(op, 'length'), uSamples: Math.max(2, Math.round(K.parNum(op, 'samples'))),
      uC: [K.parNum(op, 'cx'), K.parNum(op, 'cy')], uFit: fitIdx(K.par(op, 'fit')),
    }),
  });

  /* ================================================================== */
  /*  CHOP — new analysis and sequencing tools                          */
  /* ================================================================== */
  const one = (name, v) => ({ name, data: new Float32Array([v]) });
  const outOf = (chans, src) => { const o = { chans }; if (src && src.analyser) o.analyser = src.analyser; return o; };
  const pattern = (s) => new RegExp('^' + String(s).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');

  /* ---------- Envelope Follower ---------- */
  K.defineOp({
    type: 'envelopeCHOP', label: 'Envelope', short: 'envelope', family: 'CHOP',
    help: 'Tracks the outline of a signal with separate attack and release times. Absolute mode rectifies audio first. Good for audio-reactive brightness, scale and feedback.',
    params: [
      { name: 'attack', label: 'Attack (s)', type: 'float', default: 0.02, min: 0, max: 5 },
      { name: 'release', label: 'Release (s)', type: 'float', default: 0.3, min: 0, max: 10 },
      { name: 'gain', label: 'Gain', type: 'float', default: 1, min: 0, max: 20 },
      { name: 'absolute', label: 'Absolute Input', type: 'toggle', default: true },
      { name: 'reset', label: 'Reset', type: 'pulse' },
    ],
    pulse(op, n) { if (n === 'reset') op.rt.env = {}; },
    cook(op, ctx) {
      const src = ctx.input(op, 0);
      if (!src || !src.chans) return outOf([]);
      op.rt.env = op.rt.env || {};
      const dt = K.time.dt, atk = K.parNum(op, 'attack'), rel = K.parNum(op, 'release');
      const gain = K.parNum(op, 'gain'), abs = !!K.par(op, 'absolute');
      const chans = src.chans.map((c, ci) => {
        const d = new Float32Array(c.data.length);
        for (let i = 0; i < d.length; i++) {
          const x = abs ? Math.abs(c.data[i]) : c.data[i];
          const k = ci + ':' + i;
          const prev = op.rt.env[k] == null ? 0 : op.rt.env[k];
          const tau = x > prev ? atk : rel;
          const a = tau <= 0 ? 1 : 1 - Math.exp(-dt / tau);
          const v = prev + (x - prev) * a;
          op.rt.env[k] = v;
          d[i] = v * gain;
        }
        return { name: c.name, data: d };
      });
      return outOf(chans, src);
    },
  });

  /* ---------- Smooth (spatial or temporal average) ---------- */
  K.defineOp({
    type: 'smoothCHOP', label: 'Smooth', short: 'smooth', family: 'CHOP',
    help: 'Averages each channel with a box or gaussian window. Multi-sample channels (spectra, waveforms) smooth across samples; single-value controls smooth across frames.',
    params: [
      { name: 'window', label: 'Window', type: 'int', default: 8, min: 2, max: 64 },
      { name: 'mode', label: 'Weighting', type: 'menu', options: ['gaussian', 'box'], default: 'gaussian' },
      { name: 'reset', label: 'Reset History', type: 'pulse' },
    ],
    pulse(op, n) { if (n === 'reset') op.rt.hist = {}; },
    cook(op, ctx) {
      const src = ctx.input(op, 0);
      if (!src || !src.chans) return outOf([]);
      const w = U.clamp(Math.round(K.parNum(op, 'window')), 2, 64);
      const gauss = K.par(op, 'mode') !== 'box';
      const half = Math.floor(w / 2);
      const weights = [];
      let wsum = 0;
      for (let i = -half; i <= half; i++) { const wt = gauss ? Math.exp(-(i * i) / (2 * Math.max(1, half * half) * 0.35)) : 1; weights.push(wt); wsum += wt; }
      op.rt.hist = op.rt.hist || {};
      const chans = src.chans.map((c, ci) => {
        const d = new Float32Array(c.data.length);
        if (c.data.length <= 1) {
          const key = ci + ':' + c.name;
          let st = op.rt.hist[key];
          if (!st || st.w !== w) st = op.rt.hist[key] = { w, a: [] };
          st.a.push(c.data[0]);
          while (st.a.length > w) st.a.shift();
          let s = 0, n = 0;
          for (let i = 0; i < st.a.length; i++) { const wt = weights[half - Math.min(half, st.a.length - 1 - i)]; s += st.a[i] * wt; n += wt; }
          d[0] = s / (n || 1);
        } else {
          for (let i = 0; i < d.length; i++) {
            let s = 0, n = 0;
            for (let k = -half; k <= half; k++) {
              const j = U.clamp(i + k, 0, d.length - 1);
              const wt = weights[k + half];
              s += c.data[j] * wt; n += wt;
            }
            d[i] = s / (n || 1);
          }
        }
        return { name: c.name, data: d };
      });
      return outOf(chans, src);
    },
  });

  /* ---------- Quantize ---------- */
  K.defineOp({
    type: 'quantizeCHOP', label: 'Quantize', short: 'quantize', family: 'CHOP',
    help: 'Snaps values to a fixed number of steps. Lower Steps for chunky, digital motion; use floor or ceil for stepped ramps.',
    params: [
      { name: 'steps', label: 'Steps per Unit', type: 'int', default: 8, min: 1, max: 256 },
      { name: 'offset', label: 'Offset', type: 'float', default: 0, min: -2, max: 2 },
      { name: 'mode', label: 'Mode', type: 'menu', options: ['round', 'floor', 'ceil'], default: 'round' },
    ],
    cook(op, ctx) {
      const src = ctx.input(op, 0);
      if (!src || !src.chans) return outOf([]);
      const st = Math.max(1, Math.round(K.parNum(op, 'steps')));
      const off = K.parNum(op, 'offset'), mode = K.par(op, 'mode');
      const q = (v) => {
        const x = v * st;
        const n = mode === 'floor' ? Math.floor(x) : mode === 'ceil' ? Math.ceil(x) : Math.round(x);
        return n / st + off;
      };
      return outOf(src.chans.map((c) => {
        const d = new Float32Array(c.data.length);
        for (let i = 0; i < d.length; i++) d[i] = q(c.data[i]);
        return { name: c.name, data: d };
      }), src);
    },
  });

  /* ---------- Sample & Hold ---------- */
  K.defineOp({
    type: 'sampleholdCHOP', label: 'Sample & Hold', short: 'samplehold', family: 'CHOP',
    help: 'Freezes the input and updates it at a fixed rate, on rising edges of a trigger, or when a named channel crosses a threshold. Great for stepped, robotic motion and random gates.',
    params: [
      { name: 'mode', label: 'Update On', type: 'menu', options: ['time', 'trigger', 'channel'], default: 'time' },
      { name: 'interval', label: 'Interval (s)', type: 'float', default: 0.25, min: 0.01, max: 10 },
      { name: 'threshold', label: 'Threshold', type: 'float', default: 0.5, min: 0, max: 1 },
      { name: 'channel', label: 'Trigger Channel', type: 'string', default: 'gate' },
      { name: 'chop', label: 'CHOP (optional)', type: 'op', family: 'CHOP', default: '' },
      { name: 'reset', label: 'Reset', type: 'pulse' },
    ],
    pulse(op, n) { if (n === 'reset') { op.rt.held = {}; op.rt.on = false; op.rt.last = K.time.absSeconds; } },
    cook(op, ctx) {
      const src = ctx.refOut(op, 'chop', 'CHOP') || ctx.input(op, 0);
      if (!src || !src.chans) return outOf([]);
      op.rt.held = op.rt.held || {};
      const mode = K.par(op, 'mode');
      let fire = false;
      if (mode === 'time') {
        if (op.rt.last == null) op.rt.last = K.time.absSeconds;
        if (K.time.absSeconds - op.rt.last >= K.parNum(op, 'interval')) { fire = true; op.rt.last = K.time.absSeconds; }
      } else {
        let gate = 0;
        if (mode === 'trigger') {
          const gc = src.chans.length > 1 ? src.chans[src.chans.length - 1] : src.chans[0];
          gate = gc ? gc.data[gc.data.length - 1] : 0;
        } else {
          const nm = String(K.par(op, 'channel') || '').trim();
          const gc = nm ? src.chans.find((c) => c.name === nm) : null;
          gate = gc ? gc.data[gc.data.length - 1] : 0;
        }
        const on = gate >= K.parNum(op, 'threshold');
        if (on && !op.rt.on) fire = true;
        op.rt.on = on;
      }
      const chans = src.chans.map((c, ci) => {
        const d = new Float32Array(c.data.length);
        for (let i = 0; i < d.length; i++) {
          const key = ci + ':' + i;
          if (op.rt.held[key] == null || fire) op.rt.held[key] = c.data[i];
          d[i] = op.rt.held[key];
        }
        return { name: c.name, data: d };
      });
      return outOf(chans, src);
    },
    minInputs: 0, allowMissing: true,
  });

  /* ---------- Step Sequencer ---------- */
  K.defineOp({
    type: 'stepseqCHOP', label: 'Step Sequencer', short: 'stepseq', family: 'CHOP', gen: true,
    help: 'A tempo-synced step sequencer. Type a list of values; it outputs the current value, index, phase and gate. Drive any parameter for rhythmic patterns.',
    params: [
      { name: 'pattern', label: 'Values', type: 'string', default: '0 0.25 0.5 0.75 1 0.75 0.5 0.25' },
      { name: 'sync', label: 'Clock', type: 'menu', options: ['bpm', 'free'], default: 'bpm' },
      { name: 'rate', label: 'Steps / Second', type: 'float', default: 4, min: 0.01, max: 40 },
      { name: 'perbeat', label: 'Steps / Beat', type: 'float', default: 4, min: 0.25, max: 16 },
      { name: 'offset', label: 'Step Offset', type: 'int', default: 0, min: -64, max: 64 },
      { name: 'glide', label: 'Glide (s)', type: 'float', default: 0.02, min: 0, max: 2 },
      { name: 'gate', label: 'Gate Width', type: 'float', default: 0.7, min: 0.01, max: 1 },
    ],
    cook(op) {
      const vals = String(K.par(op, 'pattern') || '').split(/[\s,]+/).map(Number).filter((x) => isFinite(x));
      if (!vals.length) vals.push(0);
      const sps = K.par(op, 'sync') === 'bpm' ? (K.project.bpm / 60) * Math.max(0.01, K.parNum(op, 'perbeat')) : Math.max(0.001, K.parNum(op, 'rate'));
      const raw = K.time.seconds * sps + K.parNum(op, 'offset');
      const n = vals.length;
      let idx = Math.floor(raw) % n; if (idx < 0) idx += n;
      const phase = U.fract(raw);
      const target = vals[idx];
      const glide = K.parNum(op, 'glide');
      if (op.rt.v == null) op.rt.v = target;
      op.rt.v = glide <= 0 ? target : op.rt.v + (target - op.rt.v) * (1 - Math.exp(-K.time.dt / glide));
      return outOf([
        one('value', op.rt.v),
        one('index', idx),
        one('phase', phase),
        one('gate', phase < K.parNum(op, 'gate') ? 1 : 0),
      ]);
    },
  });

  /* ================================================================== */
  /*  SOP — line based geometry                                         */
  /* ================================================================== */
  const AXES = ['x', 'y', 'z'];
  const axis = (op) => Math.max(0, AXES.indexOf(K.par(op, 'axis')));

  /* ---------- Line ---------- */
  K.defineOp({
    type: 'lineSOP', label: 'Line', short: 'line', family: 'SOP', gen: true,
    help: 'A straight line of evenly spaced points, centered on the origin. Use with Polyline, particles or instancing.',
    params: [
      { name: 'points', label: 'Points', type: 'int', default: 20, min: 2, max: 1000 },
      { name: 'length', label: 'Length', type: 'float', default: 2, min: 0, max: 100 },
      { name: 'axis', label: 'Axis', type: 'menu', options: ['x', 'y', 'z'], default: 'x' },
      { name: 'closed', label: 'Close Loop', type: 'toggle', default: false },
    ],
    cook(op) {
      const n = U.clamp(Math.round(K.parNum(op, 'points')), 2, 1000);
      const L = K.parNum(op, 'length'), ax = axis(op), closed = !!K.par(op, 'closed');
      const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        pos[i * 3 + ax] = (t - 0.5) * L;
        nrm[i * 3 + (ax + 1) % 3] = 1;
        uv[i * 2] = t;
      }
      const idx = new Uint32Array((n - 1) * 2 + (closed ? 2 : 0));
      let k = 0;
      for (let i = 0; i < n - 1; i++) { idx[k++] = i; idx[k++] = i + 1; }
      if (closed) { idx[k++] = n - 1; idx[k++] = 0; }
      return K.geo(pos, nrm, uv, idx, 'lines');
    },
  });

  /* ---------- Spiral / Helix ---------- */
  K.defineOp({
    type: 'spiralSOP', label: 'Spiral', short: 'spiral', family: 'SOP', gen: true,
    help: 'A spiral or helix line. Height 0 gives a flat spiral; raise it for a coil. Taper narrows the radius toward the end.',
    params: [
      { name: 'points', label: 'Points', type: 'int', default: 240, min: 4, max: 5000 },
      { name: 'radius', label: 'Radius', type: 'float', default: 1, min: 0, max: 50 },
      { name: 'height', label: 'Height', type: 'float', default: 1.5, min: -50, max: 50 },
      { name: 'turns', label: 'Turns', type: 'float', default: 3, min: 0.1, max: 100 },
      { name: 'taper', label: 'Taper', type: 'float', default: 0, min: -1, max: 1 },
    ],
    cook(op) {
      const n = U.clamp(Math.round(K.parNum(op, 'points')), 4, 5000);
      const R = K.parNum(op, 'radius'), H = K.parNum(op, 'height'), turns = K.parNum(op, 'turns'), taper = K.parNum(op, 'taper');
      const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1), a = t * Math.PI * 2 * turns, r = R * (1 - taper * t);
        pos[i * 3] = Math.cos(a) * r;
        pos[i * 3 + 1] = (t - 0.5) * H;
        pos[i * 3 + 2] = Math.sin(a) * r;
        uv[i * 2] = t; uv[i * 2 + 1] = t;
      }
      const idx = new Uint32Array((n - 1) * 2);
      for (let i = 0; i < n - 1; i++) { idx[i * 2] = i; idx[i * 2 + 1] = i + 1; }
      return K.geo(pos, null, uv, idx, 'lines');
    },
  });

  /* ---------- Polyline (connect points from input) ---------- */
  K.defineOp({
    type: 'polylineSOP', label: 'Polyline', short: 'polyline', family: 'SOP',
    help: 'Connects the points of the input geometry in order with line segments. Close Loop joins the ends; Stride skips points for a dotted or simplified path.',
    params: [
      { name: 'close', label: 'Close Loop', type: 'toggle', default: false },
      { name: 'stride', label: 'Point Stride', type: 'int', default: 1, min: 1, max: 100 },
    ],
    cook(op, ctx) {
      const src = ctx.input(op, 0);
      if (!src || !src.pos || src.pos.length < 6) return src;
      const stride = Math.max(1, Math.round(K.parNum(op, 'stride'))), closed = !!K.par(op, 'close');
      const total = src.pos.length / 3, keep = [];
      for (let i = 0; i < total; i += stride) keep.push(i);
      if (closed && keep.length > 1) keep.push(keep[0]);
      const n = keep.length;
      const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        const s = keep[i];
        pos[i * 3] = src.pos[s * 3]; pos[i * 3 + 1] = src.pos[s * 3 + 1]; pos[i * 3 + 2] = src.pos[s * 3 + 2];
        if (src.nrm && src.nrm.length >= (s + 1) * 3) { nrm[i * 3] = src.nrm[s * 3]; nrm[i * 3 + 1] = src.nrm[s * 3 + 1]; nrm[i * 3 + 2] = src.nrm[s * 3 + 2]; }
        if (src.uv && src.uv.length >= (s + 1) * 2) { uv[i * 2] = src.uv[s * 2]; uv[i * 2 + 1] = src.uv[s * 2 + 1]; }
      }
      const idx = new Uint32Array(Math.max(0, (n - 1) * 2));
      for (let i = 0; i < n - 1; i++) { idx[i * 2] = i; idx[i * 2 + 1] = i + 1; }
      return K.geo(pos, nrm, uv, idx, 'lines', src.col);
    },
  });

  /* ---------- Torus Knot (tube surface) ---------- */
  K.defineOp({
    type: 'torusknotSOP', label: 'Torus Knot', short: 'torusknot', family: 'SOP', gen: true,
    help: 'A (p, q) torus knot swept with a round tube. p and q set the knot pattern; co-prime values (2,3), (3,4), (5,2) look best.',
    params: [
      { name: 'radius', label: 'Radius', type: 'float', default: 1, min: 0.1, max: 20 },
      { name: 'coil', label: 'Coil Radius', type: 'float', default: 0.3, min: 0, max: 10 },
      { name: 'tube', label: 'Tube Radius', type: 'float', default: 0.09, min: 0.005, max: 5 },
      { name: 'p', label: 'P', type: 'int', default: 2, min: 1, max: 20, row: 'pq' },
      { name: 'q', label: 'Q', type: 'int', default: 3, min: 1, max: 20, row: 'pq' },
      { name: 'segments', label: 'Segments', type: 'int', default: 220, min: 8, max: 800 },
      { name: 'sides', label: 'Sides', type: 'int', default: 12, min: 3, max: 64 },
    ],
    cook(op) {
      const R = K.parNum(op, 'radius'), coil = K.parNum(op, 'coil'), tube = K.parNum(op, 'tube');
      const p = Math.max(1, Math.round(K.parNum(op, 'p'))), q = Math.max(1, Math.round(K.parNum(op, 'q')));
      const segs = Math.max(8, Math.round(K.parNum(op, 'segments'))), sides = Math.max(3, Math.round(K.parNum(op, 'sides')));
      const curve = (t) => { const rr = R + coil * Math.cos(q * t); return [rr * Math.cos(p * t), rr * Math.sin(p * t), coil * Math.sin(q * t)]; };
      const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
      const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const norm = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
      const nv = (segs + 1) * (sides + 1);
      const pos = new Float32Array(nv * 3), nrm = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
      let k = 0;
      for (let r = 0; r <= segs; r++) {
        const t = (r / segs) * Math.PI * 2;
        const P = curve(t), T = norm(sub(curve(t + 0.001), curve(t - 0.001)));
        const up = Math.abs(T[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
        const N = norm(cross(T, up)), B = cross(T, N);
        for (let c = 0; c <= sides; c++) {
          const a = (c / sides) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a);
          const rad = [N[0] * ca + B[0] * sa, N[1] * ca + B[1] * sa, N[2] * ca + B[2] * sa];
          pos[k * 3] = P[0] + rad[0] * tube; pos[k * 3 + 1] = P[1] + rad[1] * tube; pos[k * 3 + 2] = P[2] + rad[2] * tube;
          nrm[k * 3] = rad[0]; nrm[k * 3 + 1] = rad[1]; nrm[k * 3 + 2] = rad[2];
          uv[k * 2] = r / segs; uv[k * 2 + 1] = c / sides;
          k++;
        }
      }
      const idx = new Uint32Array(segs * sides * 6);
      let j = 0;
      for (let r = 0; r < segs; r++) for (let c = 0; c < sides; c++) {
        const a = r * (sides + 1) + c, b = a + 1, d = a + sides + 1, e = d + 1;
        idx[j++] = a; idx[j++] = d; idx[j++] = b; idx[j++] = b; idx[j++] = d; idx[j++] = e;
      }
      return K.geo(pos, nrm, uv, idx);
    },
  });

  /* ================================================================== */
  /*  DAT — JSON, selection and merging                                 */
  /* ================================================================== */
  const tableOf = (o) => {
    if (!o) return [];
    if (o.table && o.table.length) return o.table.map((r) => (Array.isArray(r) ? r.map(String) : [String(r)]));
    if (o.text != null) return String(o.text).split('\n').map((l) => [l]);
    return [];
  };
  const toText = (t) => t.map((r) => r.join('\t')).join('\n');
  const fmtNum = (v, p) => {
    const n = Number(v);
    if (!isFinite(n)) return String(v);
    return String(+n.toFixed(U.clamp(p, 0, 10)));
  };

  /* ---------- JSON ---------- */
  K.defineOp({
    type: 'jsonDAT', label: 'JSON', short: 'json', family: 'DAT', gen: true,
    help: 'Parses JSON text. Path digs into the data with dots and brackets (scenes.1.bpm, items[0].name). Outputs text, a json object and a key/value table.',
    params: [
      { name: 'text', label: 'JSON', type: 'code', lang: 'json', default: '{\n  "title": "Kiln",\n  "version": 2,\n  "tags": ["node", "live", "visual"],\n  "scenes": [\n    { "name": "Intro", "bpm": 120 },\n    { "name": "Drop", "bpm": 128 }\n  ]\n}' },
      { name: 'path', label: 'Path', type: 'string', default: '' },
      { name: 'pretty', label: 'Pretty Print', type: 'toggle', default: true },
    ],
    cook(op) {
      const raw = String(K.par(op, 'text') || '');
      let parsed;
      try {
        if (op.rt.key !== raw) { op.rt.key = raw; op.rt.parsed = JSON.parse(raw); }
        parsed = op.rt.parsed;
      } catch (e) {
        op.warn = 'JSON: ' + e.message;
        return { text: '', table: [['error'], [e.message]] };
      }
      op.warn = null;
      const path = String(K.par(op, 'path') || '').trim().replace(/^\$\.?/, '');
      let value = parsed;
      if (path) {
        const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.').filter(Boolean);
        for (const part of parts) {
          if (value == null) break;
          value = value[part];
        }
        if (value === undefined) {
          op.warn = 'Path not found: ' + path;
          return { text: '', json: undefined, table: [['error'], ['Path not found: ' + path]] };
        }
      }
      let table;
      if (Array.isArray(value)) {
        table = [['index', 'value']];
        value.forEach((v, i) => table.push([String(i), typeof v === 'object' ? JSON.stringify(v) : String(v)]));
      } else if (value && typeof value === 'object') {
        table = [['key', 'value']];
        Object.keys(value).forEach((k) => {
          const v = value[k];
          table.push([k, v && typeof v === 'object' ? JSON.stringify(v) : String(v)]);
        });
      } else {
        table = [['value'], [value == null ? '' : String(value)]];
      }
      const pretty = !!K.par(op, 'pretty');
      const text = typeof value === 'string' ? value : JSON.stringify(value, null, pretty ? 2 : 0);
      return { text, json: value, table };
    },
  });

  /* ---------- Merge ---------- */
  K.defineOp({
    type: 'mergeDAT', label: 'Merge', short: 'merge', family: 'DAT', inputs: 'multi',
    help: 'Combines DATs by stacking rows or by placing their columns side by side. Skip Repeated Headers drops duplicate header rows from inputs after the first.',
    params: [
      { name: 'mode', label: 'Merge', type: 'menu', options: ['rows', 'columns'], default: 'rows' },
      { name: 'skiphead', label: 'Skip Repeated Headers', type: 'toggle', default: true },
      { name: 'pad', label: 'Pad Value', type: 'string', default: '' },
    ],
    cook(op, ctx) {
      const ins = [];
      op.inputs.forEach((id, i) => { if (id) { const o = ctx.input(op, i); if (o) ins.push(tableOf(o)); } });
      if (!ins.length) return { table: [], text: '' };
      const mode = K.par(op, 'mode'), pad = String(K.par(op, 'pad') == null ? '' : K.par(op, 'pad'));
      let table;
      if (mode === 'columns') {
        const height = ins.reduce((m, t) => Math.max(m, t.length), 0);
        table = [];
        for (let r = 0; r < height; r++) {
          const row = [];
          ins.forEach((t) => {
            const src = t[r] || [];
            const width = t.reduce((m, rr) => Math.max(m, rr.length), 0);
            for (let c = 0; c < width; c++) row.push(src[c] == null ? pad : src[c]);
          });
          table.push(row);
        }
      } else {
        table = [];
        const skip = !!K.par(op, 'skiphead');
        ins.forEach((t, i) => {
          t.forEach((row, r) => {
            if (skip && i > 0 && r === 0) return;
            table.push(row.slice());
          });
        });
      }
      return { table, text: toText(table) };
    },
  });

  /* ---------- Select ---------- */
  K.defineOp({
    type: 'selectDAT', label: 'Select', short: 'select', family: 'DAT', minInputs: 0, allowMissing: true,
    help: 'Picks rows and columns from a table, or from any DAT by reference. Use ranges (1-3), comma lists (0,2,4), * for all, or column names when First Row = Header.',
    params: [
      { name: 'dat', label: 'DAT (optional)', type: 'op', family: 'DAT', default: '' },
      { name: 'rows', label: 'Rows', type: 'string', default: '*' },
      { name: 'cols', label: 'Columns', type: 'string', default: '*' },
      { name: 'header', label: 'First Row = Header', type: 'toggle', default: true },
      { name: 'transpose', label: 'Transpose', type: 'toggle', default: false },
    ],
    cook(op, ctx) {
      const src = ctx.refOut(op, 'dat', 'DAT') || ctx.input(op, 0);
      if (!src) return { table: [], text: '' };
      const table = tableOf(src);
      if (!table.length) return { table: [], text: '' };
      const maxRows = table.length, maxCols = table.reduce((m, r) => Math.max(m, r.length), 0);
      const header = !!K.par(op, 'header');
      const colNames = header ? (table[0] || []).map(String) : [];
      const pick = (spec, max, names) => {
        const s = String(spec == null ? '*' : spec).trim();
        if (!s || s === '*') return Array.from({ length: max }, (_, i) => i);
        const out = [];
        s.split(',').forEach((tokRaw) => {
          const tok = tokRaw.trim();
          if (!tok) return;
          const range = tok.match(/^(-?\d+)\s*-\s*(-?\d+)$/);
          if (range) {
            let a = +range[1], b = +range[2];
            if (a < 0) a += max; if (b < 0) b += max;
            const step = a <= b ? 1 : -1;
            for (let i = a; i !== b + step; i += step) if (i >= 0 && i < max) out.push(i);
          } else if (/^-?\d+$/.test(tok)) {
            let n = +tok; if (n < 0) n += max;
            if (n >= 0 && n < max) out.push(n);
          } else if (names) {
            const n = names.findIndex((x) => x === tok);
            if (n >= 0) out.push(n);
          }
        });
        return Array.from(new Set(out));
      };
      const rows = pick(K.par(op, 'rows'), maxRows, null);
      const cols = pick(K.par(op, 'cols'), maxCols, colNames);
      let out = rows.map((r) => cols.map((c) => (table[r] && table[r][c] != null ? table[r][c] : '')));
      if (K.par(op, 'transpose') && out.length) {
        const h = out.length, w = out.reduce((m, r) => Math.max(m, r.length), 0);
        out = Array.from({ length: w }, (_, c) => Array.from({ length: h }, (_, r) => out[r][c] == null ? '' : out[r][c]));
      }
      return { table: out, text: toText(out) };
    },
  });

  /* ---------- CHOP to DAT ---------- */
  K.defineOp({
    type: 'choptoDAT', label: 'CHOP to DAT', short: 'chopto', family: 'DAT', minInputs: 0, allowMissing: true,
    help: 'Writes the channels and samples of a CHOP into a table. Pick names with wildcards (n*, low mid). Columns mode puts channels across; Rows mode gives one channel per row.',
    params: [
      { name: 'chop', label: 'CHOP (optional)', type: 'op', family: 'CHOP', default: '' },
      { name: 'names', label: 'Channel Names', type: 'string', default: '*' },
      { name: 'mode', label: 'Layout', type: 'menu', options: ['columns', 'rows'], default: 'columns' },
      { name: 'precision', label: 'Decimals', type: 'int', default: 4, min: 0, max: 8 },
    ],
    cook(op, ctx) {
      const src = ctx.refOut(op, 'chop', 'CHOP') || ctx.input(op, 0);
      if (!src || !src.chans) return { table: [], text: '' };
      const pats = String(K.par(op, 'names') || '*').split(/[\s,]+/).filter(Boolean).map(pattern);
      const chans = src.chans.filter((c) => pats.some((r) => r.test(c.name)));
      if (!chans.length) { op.warn = 'No channels match'; return { table: [], text: '' }; }
      op.warn = null;
      const p = Math.round(K.parNum(op, 'precision'));
      let table;
      if (K.par(op, 'mode') === 'rows') {
        table = chans.map((c) => [c.name].concat(Array.from(c.data, (v) => fmtNum(v, p))));
      } else {
        const max = chans.reduce((m, c) => Math.max(m, c.data.length), 0);
        table = [chans.map((c) => c.name)];
        for (let i = 0; i < max; i++) table.push(chans.map((c) => (i < c.data.length ? fmtNum(c.data[i], p) : '')));
      }
      return { table, text: toText(table) };
    },
  });
})();
