/* Kiln — examples.js : starter networks */
(function () {
  'use strict';
  const K = window.K, P = K.project;
  const GX = 216, GY = 172;
  const mk = (type, name, c, r, p, e, flags) => K.createOp(type, { name, x: c * GX, y: r * GY, p: p || {}, e: e || {}, flags: flags || {}, parent: 'root' });
  const w = (a, b, i) => K.connect(a.id, b.id, i);
  const comp = (name, c, r, op, inputs, p) => { const o = mk('compositeTOP', name, c, r, Object.assign({ operation: op }, p || {})); inputs.forEach((s, i) => w(s, o, i)); return o; };
  function begin(title, res, opts) {
    K.clearProject();
    P.title = title; P.res = res || { w: 1920, h: 1080 };
    P.bpm = (opts && opts.bpm) || 120; P.length = (opts && opts.length) || 30;
    K.time.seconds = 0;
  }

  K.EXAMPLES = [
    {
      id: 'welcome', title: 'Welcome — Ember Field', tags: ['TOP', 'CHOP', 'DAT'],
      desc: 'Noise, palette lookup, a feedback ring and typography, finished with bloom and film grain.',
      build() {
        begin('Ember Field');
        const lfo = mk('lfoCHOP', 'lfo1', 0, 3, { freq: 0.25 });
        const noise = mk('noiseTOP', 'noise1', 0, 0, { period: 2.6, harmonics: 5, rough: 0.55, speed: 0.06 }, { tx: 't*0.03' });
        const look = mk('lookupTOP', 'lookup1', 1, 0, { palette: 'ember', cycles: 1.2 }, { shift: 't*0.01' }); w(noise, look);
        const lev = mk('levelTOP', 'level1', 2, 0, { bright: 0.55, contrast: 1.25 }); w(look, lev);
        const circ = mk('circleTOP', 'circle1', 0, 1, { ring: 0.012, color: '#fff3e0' }, { radius: "0.2 + op('lfo1')[0]*0.05", sides: '0' });
        delete circ.e.sides;
        const xf = mk('transformTOP', 'transform1', 1, 1, {}, { rotate: 't*25', tx: 'sin(t*0.6)*0.35', ty: 'cos(t*0.45)*0.2' }); w(circ, xf);
        const fb = mk('feedbackTOP', 'feedback1', 2, 1, { decay: 0.955, zoom: 1.012, rotate: 0.35, hue: 0.0025, mode: 'max' }); w(xf, fb);
        const bg = comp('comp1', 3, 0, 'screen', [lev, fb]);
        const t1 = mk('textTOP', 'title', 0, 2, { text: 'KILN', font: 'Geist', weight: '800', size: 24, tracking: 0.32 });
        const t2 = mk('textTOP', 'subtitle', 1, 2, { text: 'a node-based audiovisual studio · {round(t)}s', font: 'JetBrains Mono', weight: '400', size: 2.6, tracking: 0.3, upper: true, alpha: 0.75, py: -0.2 });
        const c2 = comp('comp2', 4, 0, 'over', [bg, t1, t2]);
        const bloom = mk('bloomTOP', 'bloom1', 5, 0, { thresh: 0.55, intensity: 0.9, radius: 10 }); w(c2, bloom);
        const film = mk('filmTOP', 'film1', 6, 0, { grain: 0.05, vignette: 0.6 }); w(bloom, film);
        const out = mk('outTOP', 'out1', 7, 0, {}, {}, { display: true }); w(film, out);
        mk('textDAT', 'readme', 3, 2, { text: 'Welcome to Kiln.\n\n• Tab or double-click: add operators\n• Drag from an output port to an input port to wire\n• Click a parameter label to turn it into an expression\n• Right-click a number: animate / link to CHOP\n• P or F1: Perform mode · R: record video\n\nTry: change lookup1 palette, or noise1 period.' });
        lfo.comment = 'drives circle1 radius';
      },
    },
    {
      id: 'audio', title: 'Audio Reactive Kaleidoscope', tags: ['CHOP', 'TOP'],
      desc: 'Audio Analyze + Spectrum drive a radial scope, feedback tunnel and kaleidoscope. Falls back to the BPM clock until you load audio.',
      build() {
        begin('Audio Reactive', null, { bpm: 124 });
        const af = mk('audiofileinCHOP', 'audiofilein1', 0, 2, {});
        const an = mk('audioanalyzeCHOP', 'analyze1', 1, 2, {}); w(af, an);
        const sp = mk('audiospectrumCHOP', 'spectrum1', 1, 3, { bins: 96 }); w(af, sp);
        mk('audiodeviceinCHOP', 'audiodevin1', 0, 3, {});
        const beat = mk('beatCHOP', 'beat1', 2, 3, {});
        const lvl = mk('constantCHOP', 'drive', 2, 2, { name0: 'kick', name1: 'level' }, { value0: "max(op('analyze1')['low'], op('beat1')['pulse']*0.7)", value1: "max(op('analyze1')['level'], 0.25 + op('beat1')['pulse']*0.25)" });
        const scope = mk('choptoTOP', 'scope1', 0, 0, { chop: 'spectrum1', mode: 'radial', thick: 0.004, color: '#ffffff', color2: '#ff3d6e', gain: 1.2 });
        const circ = mk('circleTOP', 'core', 0, 1, { color: '#ff6a3d', soft: 0.02 }, { radius: "0.05 + op('drive')['kick']*0.11" });
        const c1 = comp('comp1', 1, 0, 'add', [scope, circ]);
        const fb = mk('feedbackTOP', 'feedback1', 2, 0, { decay: 0.9, rotate: 0.7, hue: 0.004, mode: 'max' }, { zoom: "1.0 + op('drive')['level']*0.04" }); w(c1, fb);
        const kal = mk('kaleidoTOP', 'kaleido1', 3, 0, { segments: 8 }, { rotate: 't*8' }); w(fb, kal);
        const rgb = mk('rgbshiftTOP', 'rgbshift1', 4, 0, {}, { amount: "0.002 + op('analyze1')['onset']*0.02" }); w(kal, rgb);
        const bl = mk('bloomTOP', 'bloom1', 5, 0, { thresh: 0.4, intensity: 1.4 }); w(rgb, bl);
        const out = mk('outTOP', 'out1', 6, 0, {}, {}, { display: true }); w(bl, out);
        mk('textDAT', 'howto', 3, 2, { text: 'Load music: select audiofilein1 → File → Choose…\nOr mic: audiodevin1 → Start Device, then wire it into analyze1 and spectrum1.\n\nUntil audio plays, the drive CHOP falls back to beat1 (project BPM).' });
        void beat; void lvl;
      },
    },
    {
      id: 'pbr', title: '3D — PBR Sculpture', tags: ['SOP', 'MAT', 'COMP', 'TOP'],
      desc: 'Noise-displaced torus with metallic PBR, two lights, an orbiting camera and a Render TOP.',
      build() {
        begin('PBR Sculpture');
        const tor = mk('torusSOP', 'torus1', 0, 0, { r1: 1.1, r2: 0.42, rows: 64, cols: 128 });
        const nz = mk('noiseSOP', 'noise1', 1, 0, { amp: 0.16, freq: 1.7, speed: 0.25 }); w(tor, nz);
        const tw = mk('twistSOP', 'twist1', 2, 0, {}, { twist: 'sin(t*0.4)*60' }); w(nz, tw);
        const gridS = mk('gridSOP', 'floor', 0, 1, { w: 30, h: 30, rows: 2, cols: 2 });
        const pbr = mk('pbrMAT', 'pbr1', 1, 1, { base: '#d0a374', metal: 0.85, rough: 0.26 });
        const pbr2 = mk('pbrMAT', 'pbrfloor', 2, 1, { base: '#18181c', metal: 0, rough: 0.8 });
        mk('geometryCOMP', 'geo1', 3, 0, { sop: 'twist1', mat: 'pbr1' }, { ry: 't*14', rx: '20' });
        mk('geometryCOMP', 'geofloor', 3, 1, { sop: 'floor', mat: 'pbrfloor', ty: -1.7 });
        mk('cameraCOMP', 'cam1', 4, 2, { el: 12, dist: 6.4 }, { az: 't*9' });
        mk('lightCOMP', 'key', 2, 2, { tx: 4, ty: 5, tz: 3, color: '#ffe2c4', dimmer: 1.6 });
        mk('lightCOMP', 'rim', 3, 2, { tx: -5, ty: 2, tz: -3, color: '#6f9dff', dimmer: 1.4 });
        const rn = mk('renderTOP', 'render1', 4, 0, { camera: 'cam1', bg: '#0a0b0f', bga: 1, ambient: '#3a3c46' });
        const bl = mk('bloomTOP', 'bloom1', 5, 0, { thresh: 0.72, intensity: 0.8 }); w(rn, bl);
        const fl = mk('filmTOP', 'film1', 6, 0, { grain: 0.03, vignette: 0.7 }); w(bl, fl);
        const out = mk('outTOP', 'out1', 7, 0, {}, {}, { display: true }); w(fl, out);
        void gridS; void pbr; void pbr2;
      },
    },
    {
      id: 'galaxy', title: 'Point Cloud Galaxy + Particles', tags: ['SOP', 'MAT', 'COMP'],
      desc: '60k-point spiral galaxy, a particle fountain with turbulence, additive points and feedback trails.',
      build() {
        begin('Galaxy');
        mk('pointcloudSOP', 'points1', 0, 0, { count: 60000, dist: 'galaxy', size: 5, arms: 4 });
        const sph = mk('sphereSOP', 'emitter', 0, 1, { radius: 0.25, rows: 12, cols: 18 });
        const pt = mk('particleSOP', 'particle1', 1, 1, { rate: 1600, life: 4, speed: 0.5, gravity: 0, turb: 1.4, drag: 0.2, c1: '#cfe8ff', c2: '#ff4fa3' }); w(sph, pt);
        mk('constantMAT', 'glow', 1, 2, { color: '#ffffff', alpha: 0.75 });
        mk('geometryCOMP', 'geo1', 2, 0, { sop: 'points1', mat: 'glow', prim: 'points', psize: 2.4, blend: 'add' }, { ry: 't*5' });
        mk('geometryCOMP', 'geo2', 2, 1, { sop: 'particle1', mat: 'glow', prim: 'points', psize: 3.5, blend: 'add' });
        mk('cameraCOMP', 'cam1', 3, 2, { el: 30, dist: 5.4 }, { az: 't*4' });
        const rn = mk('renderTOP', 'render1', 3, 0, { camera: 'cam1', bg: '#000000', bga: 1 });
        const fb = mk('feedbackTOP', 'trails', 4, 0, { decay: 0.82, zoom: 1.0, rotate: 0, mode: 'max' }); w(rn, fb);
        const bl = mk('bloomTOP', 'bloom1', 5, 0, { thresh: 0.35, intensity: 1.3, radius: 8 }); w(fb, bl);
        const out = mk('outTOP', 'out1', 6, 0, {}, {}, { display: true }); w(bl, out);
      },
    },
    {
      id: 'instance', title: 'GPU Instancing Field', tags: ['SOP', 'COMP', 'MAT'],
      desc: 'A Box SOP instanced onto every point of a noise-animated grid — thousands of objects in one draw call.',
      build() {
        begin('Instancing');
        const g = mk('gridSOP', 'grid1', 0, 0, { w: 7, h: 7, rows: 24, cols: 24 });
        const nz = mk('noiseSOP', 'wave', 1, 0, { amp: 0.9, freq: 0.5, speed: 0.5, renorm: false }); w(g, nz);
        mk('boxSOP', 'box1', 0, 1, {});
        mk('pbrMAT', 'pbr1', 1, 1, { base: '#ebe4d6', rough: 0.45, metal: 0.1 });
        mk('geometryCOMP', 'geo1', 2, 0, { sop: 'box1', mat: 'pbr1', inst: 'wave', iscale: 0.22 });
        mk('cameraCOMP', 'cam1', 2, 2, { el: 38, dist: 9.5 }, { az: 't*7' });
        mk('lightCOMP', 'sun', 1, 2, { ltype: 'directional', tx: 3, ty: 6, tz: 2, color: '#fff1dd', dimmer: 1.4 });
        mk('lightCOMP', 'fill', 0, 2, { tx: -5, ty: 3, tz: -4, color: '#ff6a3d', dimmer: 1.8 });
        const rn = mk('renderTOP', 'render1', 3, 0, { camera: 'cam1', bg: '#101014', bga: 1, ambient: '#40404c' });
        const fl = mk('filmTOP', 'film1', 4, 0, { grain: 0.03, vignette: 0.5 }); w(rn, fl);
        const out = mk('outTOP', 'out1', 5, 0, {}, {}, { display: true }); w(fl, out);
      },
    },
    {
      id: 'deck', title: 'Presentation Deck', tags: ['DAT', 'CHOP', 'COMP', 'TOP'],
      desc: 'Slides from a Table DAT. Arrow keys or the Next/Prev buttons step a Count CHOP; Lag CHOP animates transitions.',
      build() {
        begin('Presentation Deck', { w: 1920, h: 1080 });
        mk('tableDAT', 'slides', 0, 3, { table: [
          ['title', 'subtitle', 'kicker'],
          ['Kiln', 'Real-time visuals for presentations, artworks and live shows.', 'Chapter 01 — Hello'],
          ['Everything is an operator', 'Textures, channels, surfaces, materials, data and components — wired together.', 'Chapter 02 — System'],
          ['Edit the table, not the slide', 'Every line of copy lives in slides (a Table DAT). Change a cell and the frame updates.', 'Chapter 03 — Workflow'],
          ['Perform it live', 'Press P for fullscreen. Arrow keys advance. R records an MP4/WebM.', 'Chapter 04 — Show'],
        ] });
        const kb = mk('keyboardinCHOP', 'keyboard1', 0, 2, { keys: 'arrowright arrowleft' });
        mk('buttonCOMP', 'btnNext', 1, 3, { label: 'Next →' });
        mk('buttonCOMP', 'btnPrev', 2, 3, { label: '← Prev' });
        const trig = mk('constantCHOP', 'steps', 1, 2, { name0: 'next', name1: 'prev' }, { value0: "max(op('keyboard1')['arrowright'], op('btnNext')[0])", value1: "max(op('keyboard1')['arrowleft'], op('btnPrev')[0])" });
        const cnt = mk('countCHOP', 'slide', 2, 2, { limit: 'loop', min: 1, max: 4 }); w(trig, cnt);
        const lag = mk('lagCHOP', 'slidelag', 3, 2, { up: 0.35, down: 0.35 }); w(cnt, lag);
        const ramp = mk('rampTOP', 'bg', 0, 0, { c1: '#0d0c11', c2: '#24163a', c3: '#ff6a3d', mid: 0.68 }, { angle: "100 + op('slidelag')[0]*22" });
        const noise = mk('noiseTOP', 'grain', 0, 1, { period: 1.2, speed: 0.05, color1: '#000000', color2: '#2b2b2b' });
        const bgc = comp('bgcomp', 1, 0, 'screen', [ramp, noise]);
        const ring = mk('circleTOP', 'ring', 1, 1, { ring: 0.0025, color: '#ff6a3d', cy: 0.15 }, { radius: "0.36 + sin(t*0.5)*0.01", cx: "1.25 - op('slidelag')[0]*0.05" });
        const tr = "clamp(1 - abs(op('slide')[0]-op('slidelag')[0])*1.6, 0, 1)";
        const kick = mk('textTOP', 'kicker', 2, 1, { dat: 'slides', colI: 2, font: 'JetBrains Mono', size: 2.4, weight: '500', upper: true, tracking: 0.25, color: '#ff8a5c', alignx: 'left', wrap: 80, py: 0.36 }, { row: "op('slide')[0]", alpha: tr });
        const title = mk('textTOP', 'title', 2, 0, { dat: 'slides', colI: 0, font: 'Instrument Serif', weight: '400', size: 14, alignx: 'left', wrap: 80, py: 0.08 }, { row: "op('slide')[0]", reveal: tr });
        const sub = mk('textTOP', 'subtitle', 3, 1, { dat: 'slides', colI: 1, font: 'Geist', weight: '400', size: 3.8, alignx: 'left', wrap: 60, py: -0.26, color: '#d8d3ca', leading: 1.35 }, { row: "op('slide')[0]", alpha: tr });
        const page = mk('textTOP', 'pagenum', 3, 0, { text: "{round(op('slide')[0])} / 4", font: 'JetBrains Mono', size: 1.8, alignx: 'right', aligny: 'bottom', wrap: 92, alpha: 0.55 });
        const c = comp('slidecomp', 4, 0, 'over', [bgc, ring, kick, title, sub, page]);
        const fl = mk('filmTOP', 'film1', 5, 0, { grain: 0.035, vignette: 0.45 }); w(c, fl);
        const out = mk('outTOP', 'out1', 6, 0, {}, {}, { display: true }); w(fl, out);
        void kb; void lag;
      },
    },
    {
      id: 'onepager', title: 'Layover Listening — One-Pager Video', tags: ['DAT', 'TOP'],
      desc: 'A 9:16, 30-second, four-scene one-pager driven by a Table DAT and the timeline. Hit Record to export.',
      build() {
        begin('Layover Listening', { w: 1080, h: 1920 }, { length: 30, bpm: 80 });
        mk('tableDAT', 'scenes', 0, 3, { table: [
          ['kicker', 'title', 'body'],
          ['A listening station for the layover', 'Layover Listening', 'Ninety seconds of calm, curated sound between gates.'],
          ['Choose a sonic itinerary', 'Tokyo Night\\nIceland Morning\\nMississippi Delta\\nNairobi Dusk', 'Each destination is a mood. Light, color and sound move together.'],
          ['The pilot', 'A 90-day pilot', 'A small footprint at the gate: headphones, a screen, a quiet corner.'],
          ['The ask', 'Host the first station', 'Partner with us on a calmer, more human layover.'],
        ] });
        const scene = "1 + min(3, floor(t/7.5))";
        const fade = "smoothstep(0.0, 0.7, mod(t,7.5)) * (1 - smoothstep(6.8, 7.5, mod(t,7.5)))";
        const noise = mk('noiseTOP', 'atmos', 0, 0, { period: 1.6, harmonics: 5, speed: 0.05 }, { ty: 't*0.02' });
        const look = mk('lookupTOP', 'mood', 1, 0, { palette: 'ocean', cycles: 0.8 }, { shift: "floor(t/7.5)*0.22 + t*0.004" }); w(noise, look);
        const lev = mk('levelTOP', 'dim', 2, 0, { bright: 0.45, contrast: 1.15 }); w(look, lev);
        const hor = mk('rectangleTOP', 'horizon', 0, 1, { w: 3, h: 0.003, color: '#f4efe6', alpha: 0.6, cy: -0.12 }, { cy: "-0.12 + sin(t*0.4)*0.01" });
        const ring = mk('circleTOP', 'listen', 1, 1, { ring: 0.003, color: '#f4efe6', cy: 0.52 }, { radius: "0.17 + sin(t*1.3)*0.012" });
        const kick = mk('textTOP', 'kicker', 2, 1, { dat: 'scenes', colI: 0, font: 'JetBrains Mono', size: 1.45, upper: true, tracking: 0.28, color: '#f4efe6', alignx: 'left', wrap: 82, py: 0.62, alpha: 0.8 }, { row: scene, alpha: fade });
        const title = mk('textTOP', 'title', 3, 1, { dat: 'scenes', colI: 1, font: 'Instrument Serif', weight: '400', size: 6.4, leading: 1.05, alignx: 'left', wrap: 84, py: 0.25 }, { row: scene, reveal: "smoothstep(0, 1.6, mod(t,7.5))", alpha: fade });
        const body = mk('textTOP', 'body', 3, 2, { dat: 'scenes', colI: 2, font: 'Geist', weight: '400', size: 2.4, leading: 1.4, alignx: 'left', wrap: 80, py: -0.32, color: '#e9e3d8' }, { row: scene, alpha: fade });
        const prog = mk('rectangleTOP', 'progress', 2, 2, { h: 0.004, cy: -1.86, color: '#ff8a5c', corner: 0 }, { w: '(t/30)*1.1', cx: '-0.55 + (t/30)*0.55' });
        const c = comp('frame', 4, 0, 'over', [lev, hor, ring, kick, title, body, prog]);
        const fl = mk('filmTOP', 'film1', 5, 0, { grain: 0.04, vignette: 0.5 }); w(c, fl);
        const out = mk('outTOP', 'out1', 6, 0, {}, {}, { display: true }); w(fl, out);
      },
    },
    {
      id: 'glsl', title: 'GLSL Shader Lab', tags: ['TOP', 'COMP'],
      desc: 'A Shadertoy-compatible raymarcher with its uniforms on sliders. Paste any Shadertoy code into glsl1.',
      build() {
        begin('Shader Lab');
        const code = `// Raymarched gyroid — u0 = warp, u1 = glow (sliders)
float map(vec3 p){
  p.z += iTime*0.6;
  float g = dot(sin(p*1.3), cos(p.zxy*1.3)) ;
  return abs(g)/1.3 - 0.06 - u0*0.12;
}
void mainImage(out vec4 fragColor, in vec2 fragCoord){
  vec2 uv = (fragCoord - 0.5*iResolution.xy)/iResolution.y;
  vec3 ro = vec3(0.0, 0.0, 0.0), rd = normalize(vec3(uv, 1.1));
  float a = iTime*0.15; rd.xy *= mat2(cos(a),-sin(a),sin(a),cos(a));
  float t = 0.0, glow = 0.0;
  for(int i=0;i<90;i++){ float d = map(ro+rd*t); glow += 0.012/(0.02+abs(d)); if(d<0.001||t>30.0) break; t += d*0.8; }
  vec3 col = 0.5 + 0.5*cos(vec3(0.0,0.6,1.2) + t*0.25 + iTime*0.2);
  col *= exp(-t*0.08);
  col += glow*0.02*u1*vec3(1.0,0.45,0.25);
  fragColor = vec4(col,1.0);
}`;
        mk('sliderCOMP', 'warp', 0, 1, { label: 'Warp', value: 0.3 });
        mk('sliderCOMP', 'glowamt', 1, 1, { label: 'Glow', value: 0.6 });
        const g = mk('glslTOP', 'glsl1', 0, 0, { code, res: 'half' }, { u0: "op('warp')[0]", u1: "op('glowamt')[0]" });
        const bl = mk('bloomTOP', 'bloom1', 1, 0, { thresh: 0.5, intensity: 1 }); w(g, bl);
        const fl = mk('filmTOP', 'film1', 2, 0, { grain: 0.04 }); w(bl, fl);
        const out = mk('outTOP', 'out1', 3, 0, {}, {}, { display: true }); w(fl, out);
      },
    },
    {
      id: 'mapping', title: 'Projection Mapping', tags: ['TOP'],
      desc: 'Content warped through a Corner Pin TOP. Select cornerpin1 and drag the corners in the viewer to fit a surface.',
      build() {
        begin('Projection Mapping');
        const pat = mk('patternTOP', 'pattern1', 0, 0, { ptype: 'stripes', scale: 18, width: 0.5, c1: '#111111', c2: '#ff6a3d' }, { rotate: 't*6' });
        const t = mk('textTOP', 'label', 0, 1, { text: 'MAP ME', font: 'Archivo Black', size: 16, weight: '400' });
        const c = comp('content', 1, 0, 'over', [pat, t]);
        const cp = mk('cornerpinTOP', 'cornerpin1', 2, 0, { x0: 0.18, y0: 0.12, x1: 0.86, y1: 0.2, x2: 0.8, y2: 0.88, x3: 0.12, y3: 0.8, grid: true }); w(c, cp);
        const out = mk('outTOP', 'out1', 3, 0, {}, {}, { display: true }); w(cp, out);
      },
    },
    {
      id: 'webcam', title: 'Webcam Feedback Mirror', tags: ['TOP'],
      desc: 'Camera input through edge detection, feedback trails and hue drift. Select videodevin1 and press Start Device.',
      build() {
        begin('Webcam Mirror');
        const v = mk('videodeviceinTOP', 'videodevin1', 0, 0, {});
        const e = mk('edgeTOP', 'edge1', 1, 0, { strength: 3, over: 0.25 }); w(v, e);
        const fb = mk('feedbackTOP', 'feedback1', 2, 0, { decay: 0.9, zoom: 1.006, rotate: 0, hue: 0.01, mode: 'max' }); w(e, fb);
        const hs = mk('hsvadjustTOP', 'hsv1', 3, 0, { sat: 1.6 }); w(fb, hs);
        const out = mk('outTOP', 'out1', 4, 0, {}, {}, { display: true }); w(hs, out);
      },
    },
    {
      id: 'gwchirp', title: 'Black Hole Chirp (GW)', tags: ['CHOP', 'TOP'],
      desc: 'A gravitational-wave merger drives color, glow and a live frequency readout. Uses the built-in synthetic chirp offline, or drop a GWOSC .txt/.gz file on gwstrain1. The merger lands at about 20 s.',
      build() {
        begin('Black Hole Chirp', null, { length: 30 });
        const gw = mk('gwstraininCHOP', 'gwstrain1', 0, 3, { speed: 0.15, start: 13 });
        const an = mk('gwanalysisCHOP', 'gwanalysis1', 1, 3, {}); w(gw, an);
        const ch = mk('gwchirpCHOP', 'gwchirp1', 1, 4, {}); w(gw, ch);
        const sn = mk('gwsineCHOP', 'gwsine1', 2, 3, {}); w(an, sn);
        const noise = mk('noiseTOP', 'noise1', 0, 0, { period: 2.2, harmonics: 5, rough: 0.5, speed: 0.05 });
        const look = mk('lookupTOP', 'lookup1', 1, 0, { palette: 'ember' }); w(noise, look);
        const ring = mk('circleTOP', 'ring1', 0, 1, { ring: 0.01, color: '#ffffff' }, { radius: "0.12 + op('gwanalysis1')['rms']*0.25" });
        const xf = mk('transformTOP', 'transform1', 1, 1, {}, { rotate: "op('gwsine1')['phase']*360" }); w(ring, xf);
        const fb = mk('feedbackTOP', 'feedback1', 2, 1, { decay: 0.93, zoom: 1.01, mode: 'max' }); w(xf, fb);
        const c1 = comp('comp1', 2, 0, 'screen', [look, fb]);
        const hs = mk('hsvadjustTOP', 'hsv1', 3, 0, {}, { hue: "op('gwchirp1')['progress']*0.6" }); w(c1, hs);
        const bl = mk('bloomTOP', 'bloom1', 4, 0, { thresh: 0.45 }, { intensity: "0.6 + op('gwchirp1')['strength']*1.0" }); w(hs, bl);
        const ro = mk('datareadoutTOP', 'readout1', 3, 2, { chop: 'gwchirp1', chan: 'freq', label: 'chirp frequency', units: 'Hz', decimals: 0 });
        const c2 = comp('comp2', 5, 0, 'over', [bl, ro]);
        const out = mk('outTOP', 'out1', 6, 0, {}, {}, { display: true }); w(c2, out);
        mk('textDAT', 'readme', 4, 3, { text: 'gwstrain1 plays a synthetic black-hole merger (or your GWOSC file).\ngwchirp1 progress → hue, strength → bloom.\ngwanalysis1 rms → ring radius.\nPress play: the chirp rises into the merger near 20 s.' });
      },
    },
    {
      id: 'retro', title: 'Retro Monitor', tags: ['TOP'],
      desc: 'Moving shapes melted by Datamosh, shown on a CRT with glowing phosphors. Swap the source for your own movie.',
      build() {
        begin('Retro Monitor');
        const noise = mk('noiseTOP', 'noise1', 0, 0, { period: 3, speed: 0.1 });
        const c1 = mk('circleTOP', 'circle1', 0, 1, { radius: 0.14, color: '#ff4d6d' }, { cx: 'sin(t*1.3)*0.6', cy: 'cos(t*0.9)*0.3' });
        const t1 = mk('textTOP', 'title', 0, 2, { text: 'KILN TV', font: 'Bebas Neue', size: 26, tracking: 0.1 });
        const c = comp('comp1', 1, 0, 'over', [noise, c1, t1]);
        const dm = mk('datamoshTOP', 'datamosh1', 2, 0, {}); w(c, dm);
        const crt = mk('crtTOP', 'crt1', 3, 0, {}); w(dm, crt);
        const bl = mk('bloomTOP', 'bloom1', 4, 0, { thresh: 0.5, intensity: 1.1 }); w(crt, bl);
        const out = mk('outTOP', 'out1', 5, 0, {}, {}, { display: true }); w(bl, out);
      },
    },
    {
      id: 'kinetic', title: 'Kinetic Type', tags: ['TOP'],
      desc: 'Text TOP animation modes layered together: a popping title that floats, a typewriter subtitle with a cursor, and a scrambled tagline. Change the Animation menu on any Text TOP to try all 20 modes.',
      build() {
        begin('Kinetic Type', null, { length: 10 });
        const bg = mk('rampTOP', 'ramp1', 0, 0, { rtype: 'radial', c1: '#22203a', c2: '#0e0d18', c3: '#060609' });
        const t1 = mk('textTOP', 'title', 0, 1, { text: 'MAKE IT MOVE', font: 'Archivo Black', size: 16, weight: '900', py: 0.18, anim: 'pop', order: 'center out', stagger: 0.06, adur: 0.7, motion: 'float', amount: 0.8, aspeed: 0.4 });
        const t2 = mk('textTOP', 'subtitle', 0, 2, { text: 'every letter is an operator', font: 'JetBrains Mono', size: 5.5, weight: '500', py: -0.12, color: '#ff8a4c', anim: 'typewriter', astart: 1.2, stagger: 0.05, cursor: true });
        const t3 = mk('textTOP', 'tagline', 0, 3, { text: 'KILN / KINETIC TYPE', font: 'Space Mono', size: 4, weight: '700', py: -0.32, tracking: 0.25, anim: 'scramble', astart: 2.8, stagger: 0.04, adur: 0.5, color: '#9aa0b4' });
        const c = comp('comp1', 1, 0, 'over', [bg, t1, t2, t3]);
        const bl = mk('bloomTOP', 'bloom1', 2, 0, { thresh: 0.6, intensity: 0.6 }); w(c, bl);
        const out = mk('outTOP', 'out1', 3, 0, {}, {}, { display: true }); w(bl, out);
      },
    },
  ];

  K.loadExample = function (id) {
    const ex = K.EXAMPLES.find((e) => e.id === id) || K.EXAMPLES[0];
    K.history.lock = true;
    ex.build();
    K.history.lock = false;
    P.network = 'root';
    K.history.reset();
    K.bus.emit('project'); K.bus.emit('graph');
    if (K.net && K.net.render) { K.net.render(); requestAnimationFrame(() => K.net.fit()); }
    const out = K.opsOfFamily('TOP').find((o) => o.type === 'outTOP');
    if (out && K.net) K.net.select(out.id);
    if (K.viewer) K.viewer.setMode('output');
  };
})();
