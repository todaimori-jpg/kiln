/* Kiln — chops.js : Channel Operators (motion, control, audio) */
(function () {
  'use strict';
  const K = window.K, U = K.util;

  const one = (name, v) => ({ name, data: new Float32Array([v]) });
  const outOf = (chans) => ({ chans });

  /* ---------------- audio engine ---------------- */
  const A = (K.audio = {
    ctx: null,
    ensure() {
      if (!A.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        A.ctx = new AC();
        A.master = A.ctx.createGain();
        A.master.connect(A.ctx.destination);
        try { A.recDest = A.ctx.createMediaStreamDestination(); A.master.connect(A.recDest); } catch (e) { A.recDest = null; }
      }
      if (A.ctx.state === 'suspended') A.ctx.resume().catch(() => {});
      return A.ctx;
    },
  });
  // resume audio on first gesture (iOS requires it)
  ['pointerdown', 'keydown'].forEach((ev) => window.addEventListener(ev, () => { if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume(); }, { capture: true }));

  function makeAnalyser(ctx) {
    const an = ctx.createAnalyser();
    an.fftSize = 2048; an.smoothingTimeConstant = 0.6;
    return an;
  }
  function audioOut(op, an) {
    if (!an) return outOf([{ name: 'audio', data: new Float32Array(512) }]);
    const n = 512;
    op.rt.wave = op.rt.wave || new Float32Array(an.fftSize);
    an.getFloatTimeDomainData(op.rt.wave);
    const d = new Float32Array(n);
    const step = Math.floor(op.rt.wave.length / n);
    for (let i = 0; i < n; i++) d[i] = op.rt.wave[i * step];
    const o = outOf([{ name: 'audio', data: d }]);
    o.analyser = an;
    return o;
  }

  /* ---------------- generators ---------------- */
  K.defineOp({
    type: 'constantCHOP', label: 'Constant', short: 'constant', family: 'CHOP', gen: true,
    help: 'Named constant channels. Values accept expressions.',
    params: [0, 1, 2, 3].flatMap((i) => [
      { name: 'name' + i, label: 'Name ' + i, type: 'string', default: i === 0 ? 'chan1' : '', row: 'c' + i },
      { name: 'value' + i, label: 'Value ' + i, type: 'float', default: 0, min: -1, max: 1, row: 'c' + i },
    ]),
    cook(op) {
      const chans = [];
      for (let i = 0; i < 4; i++) { const n = K.par(op, 'name' + i); if (n) chans.push(one(n, K.parNum(op, 'value' + i))); }
      return outOf(chans);
    },
  });

  const WAVES = ['sine', 'triangle', 'square', 'saw', 'ramp', 'pulse'];
  function wave(type, x, duty) {
    const f = U.fract(x);
    switch (type) {
      case 'sine': return Math.sin(x * Math.PI * 2);
      case 'triangle': return 1 - 4 * Math.abs(Math.round(x - 0.25) - (x - 0.25));
      case 'square': return f < 0.5 ? 1 : -1;
      case 'saw': return f * 2 - 1;
      case 'ramp': return f;
      case 'pulse': return f < (duty || 0.1) ? 1 : 0;
    }
    return 0;
  }
  K.wave = wave;
  K.defineOp({
    type: 'lfoCHOP', label: 'LFO', short: 'lfo', family: 'CHOP', gen: true,
    help: 'Low-frequency oscillator. Turn on Beat Sync to lock to the project BPM.',
    params: [
      { name: 'wave', label: 'Type', type: 'menu', options: WAVES, default: 'sine' },
      { name: 'freq', label: 'Frequency', type: 'float', default: 0.5, min: 0, max: 10 },
      { name: 'sync', label: 'Beat Sync (freq = per beat)', type: 'toggle', default: false },
      { name: 'amp', label: 'Amplitude', type: 'float', default: 1, min: 0, max: 10 },
      { name: 'offset', label: 'Offset', type: 'float', default: 0, min: -10, max: 10 },
      { name: 'phase', label: 'Phase', type: 'float', default: 0, min: 0, max: 1 },
      { name: 'duty', label: 'Pulse Width', type: 'float', default: 0.1, min: 0, max: 1 },
      { name: 'chname', label: 'Channel Name', type: 'string', default: 'chan1' },
    ],
    cook(op) {
      const f = K.parNum(op, 'freq') * (K.par(op, 'sync') ? K.project.bpm / 60 : 1);
      const x = K.time.seconds * f + K.parNum(op, 'phase');
      return outOf([one(K.par(op, 'chname') || 'chan1', wave(K.par(op, 'wave'), x, K.parNum(op, 'duty')) * K.parNum(op, 'amp') + K.parNum(op, 'offset'))]);
    },
  });

  K.defineOp({
    type: 'noiseCHOP', label: 'Noise', short: 'noise', family: 'CHOP', gen: true,
    help: 'Smooth random channels for organic motion.',
    params: [
      { name: 'chans', label: 'Channels', type: 'int', default: 3, min: 1, max: 16 },
      { name: 'prefix', label: 'Name Prefix', type: 'string', default: 'n' },
      { name: 'speed', label: 'Speed', type: 'float', default: 0.4, min: 0, max: 10 },
      { name: 'amp', label: 'Amplitude', type: 'float', default: 1, min: 0, max: 10 },
      { name: 'offset', label: 'Offset', type: 'float', default: 0, min: -10, max: 10 },
      { name: 'harm', label: 'Harmonics', type: 'int', default: 2, min: 1, max: 6 },
      { name: 'seed', label: 'Seed', type: 'float', default: 1, min: 0, max: 100 },
    ],
    cook(op) {
      const n = K.parNum(op, 'chans'), s = K.time.seconds * K.parNum(op, 'speed'), seed = K.parNum(op, 'seed');
      const chans = [];
      for (let i = 0; i < n; i++) chans.push(one((K.par(op, 'prefix') || 'n') + i, U.fbm3(s, i * 17.13 + seed * 3.1, seed, K.parNum(op, 'harm'), 0.5) * K.parNum(op, 'amp') + K.parNum(op, 'offset')));
      return outOf(chans);
    },
  });

  K.defineOp({
    type: 'beatCHOP', label: 'Beat', short: 'beat', family: 'CHOP', gen: true,
    help: 'Tempo clock from the project BPM: ramp, pulse, beat count, bar ramp.',
    params: [
      { name: 'mult', label: 'Rate Multiplier', type: 'float', default: 1, min: 0.125, max: 8 },
      { name: 'decay', label: 'Pulse Decay', type: 'float', default: 8, min: 0.5, max: 40 },
    ],
    cook(op) {
      const b = (K.time.seconds * K.project.bpm) / 60 * K.parNum(op, 'mult');
      const f = U.fract(b);
      return outOf([one('ramp', f), one('pulse', Math.exp(-f * K.parNum(op, 'decay'))), one('count', Math.floor(b)), one('bar', Math.floor(b / 4)), one('barramp', U.fract(b / 4))]);
    },
  });

  K.mouse = { x: 0.5, y: 0.5, down: 0, wheel: 0 };
  K.defineOp({
    type: 'mouseinCHOP', label: 'Mouse In', short: 'mousein', family: 'CHOP', gen: true,
    help: 'Pointer position over the viewer / perform window (0–1) and button state. Works with touch.',
    params: [{ name: 'range', label: 'Range', type: 'menu', options: ['0 to 1', '-1 to 1'], default: '0 to 1' }],
    cook(op) {
      const m = K.mouse, c = K.par(op, 'range') === '-1 to 1';
      return outOf([one('tx', c ? m.x * 2 - 1 : m.x), one('ty', c ? m.y * 2 - 1 : m.y), one('lbutton', m.down), one('wheel', m.wheel)]);
    },
  });

  K.keys = new Set();
  K.keyTaps = new Set(); // keys pressed since last frame (cleared after each cook) — catches fast taps
  K.keyPresses = 0;
  window.addEventListener('keydown', (e) => { const k = e.key.toLowerCase() === ' ' ? 'space' : e.key.toLowerCase(); K.keys.add(k); if (!e.repeat) K.keyTaps.add(k); });
  window.addEventListener('keyup', (e) => { K.keys.delete(e.key.toLowerCase() === ' ' ? 'space' : e.key.toLowerCase()); });
  window.addEventListener('blur', () => K.keys.clear());
  K.defineOp({
    type: 'keyboardinCHOP', label: 'Keyboard In', short: 'keyboardin', family: 'CHOP', gen: true,
    help: 'One channel per key (1 while held). Separate keys with spaces: a s d arrowright space',
    params: [{ name: 'keys', label: 'Keys', type: 'string', default: 'arrowright arrowleft space' }],
    cook(op) {
      const ks = String(K.par(op, 'keys')).toLowerCase().split(/[\s,]+/).filter(Boolean);
      return outOf(ks.map((k) => one(k, K.keys.has(k) || K.keyTaps.has(k) ? 1 : 0)));
    },
  });

  // WebMIDI
  K.midi = { state: {}, access: null, status: 'idle' };
  K.initMidi = function () {
    if (K.midi.status !== 'idle') return;
    if (!navigator.requestMIDIAccess) { K.midi.status = 'unsupported'; return; }
    K.midi.status = 'pending';
    navigator.requestMIDIAccess().then((acc) => {
      K.midi.access = acc; K.midi.status = 'ready';
      const bind = () => acc.inputs.forEach((inp) => { inp.onmidimessage = onMidi; });
      bind(); acc.onstatechange = bind;
    }).catch(() => { K.midi.status = 'denied'; });
  };
  function onMidi(e) {
    const [st, d1, d2] = e.data, type = st & 0xf0;
    const s = K.midi.state;
    if (type === 0xb0) s['cc' + d1] = d2 / 127;
    else if (type === 0x90 && d2 > 0) { s['note' + d1] = d2 / 127; s.note = d1; s.velocity = d2 / 127; s.noteon = 1; }
    else if (type === 0x80 || (type === 0x90 && d2 === 0)) { s['note' + d1] = 0; s.noteon = 0; }
    else if (type === 0xe0) s.pitchbend = ((d2 << 7) | d1) / 16383;
  }
  K.defineOp({
    type: 'midiinCHOP', label: 'MIDI In', short: 'midiin', family: 'CHOP', gen: true,
    help: 'Web MIDI input from controllers (Chrome/Edge). Channels appear as you move knobs: cc1, note60, velocity…',
    params: [{ name: 'connect', label: 'Connect MIDI', type: 'pulse' }, { name: 'filter', label: 'Only These (blank = all)', type: 'string', default: '' }],
    pulse(op, n) { if (n === 'connect') K.initMidi(); },
    cook(op) {
      if (K.midi.status !== 'ready') op.warn = K.midi.status === 'unsupported' ? 'Web MIDI not supported in this browser' : 'Press Connect MIDI';
      const f = String(K.par(op, 'filter')).split(/[\s,]+/).filter(Boolean);
      const names = Object.keys(K.midi.state).filter((n) => !f.length || f.includes(n));
      return outOf(names.map((n) => one(n, K.midi.state[n])));
    },
  });

  K.defineOp({
    type: 'gamepadCHOP', label: 'Gamepad', short: 'gamepad', family: 'CHOP', gen: true,
    help: 'Axes and buttons from a connected game controller.',
    params: [{ name: 'index', label: 'Gamepad Index', type: 'int', default: 0, min: 0, max: 3 }],
    cook(op) {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      const p = pads && pads[K.parNum(op, 'index')];
      if (!p) { op.warn = 'Press a button on the controller'; return outOf([]); }
      return outOf(p.axes.map((v, i) => one('axis' + i, v)).concat(p.buttons.map((b, i) => one('b' + i, b.value))));
    },
  });

  K.defineOp({
    type: 'audiofileinCHOP', label: 'Audio File In', short: 'audiofilein', family: 'CHOP', gen: true,
    help: 'Play an audio file (mp3, wav, m4a) in sync with the timeline. Feed into Audio Analyze / Spectrum.',
    params: [
      { name: 'file', label: 'File', type: 'file', accept: 'audio/*,video/*,.mp3,.m4a,.wav,.aac,.ogg,.flac,.aif,.aiff', default: '' },
      { name: 'url', label: 'or URL', type: 'string', default: '' },
      { name: 'play', label: 'Play', type: 'toggle', default: true },
      { name: 'volume', label: 'Volume', type: 'float', default: 0.9, min: 0, max: 1 },
      { name: 'loop', label: 'Loop', type: 'toggle', default: true },
      { name: 'synctl', label: 'Sync to Timeline', type: 'toggle', default: true },
      { name: 'cue', label: 'Cue (restart)', type: 'pulse' },
    ],
    destroy(op) { if (op.rt.el) { op.rt.el.pause(); op.rt.el.src = ''; } try { op.rt.node && op.rt.node.disconnect(); } catch (e) {} },
    pulse(op, n) { if (n === 'cue' && op.rt.el) op.rt.el.currentTime = 0; },
    cook(op) {
      const fid = K.par(op, 'file');
      const m = fid && K.media.get(fid);
      const src = m ? m.url : String(K.par(op, 'url') || '');
      if (src !== op.rt.src) {
        op.rt.src = src; op.rt.err = null;
        if (op.rt.el) { op.rt.el._wantPlay = false; K.util.pendingPlay.delete(op.rt.el); op.rt.el.pause(); }
        try { op.rt.node && op.rt.node.disconnect(); } catch (e) {}
        op.rt.el = null; op.rt.node = null;
        if (src) {
          const ctx = A.ensure();
          const el = new Audio();
          if (/^https?:/i.test(src)) el.crossOrigin = 'anonymous';
          el.loop = true; el.preload = 'auto'; el.setAttribute('playsinline', '');
          el.addEventListener('error', () => {
            const code = el.error && el.error.code;
            op.rt.err = code === 4 ? 'This browser can\'t play this audio format. Try MP3, M4A or WAV.' : 'Could not load audio' + (code ? ' (error ' + code + ')' : '');
          });
          el.src = src;
          op.rt.el = el;
          if (ctx) {
            try {
              op.rt.node = ctx.createMediaElementSource(el);
              op.rt.gain = ctx.createGain();
              op.rt.an = makeAnalyser(ctx);
              op.rt.node.connect(op.rt.gain); op.rt.gain.connect(op.rt.an); op.rt.gain.connect(A.master);
            } catch (e) { op.rt.err = e.message; }
          }
        }
      }
      const el = op.rt.el;
      if (!el) { op.warn = 'Choose an audio file'; return audioOut(op, null); }
      if (op.rt.gain) op.rt.gain.gain.value = K.parNum(op, 'volume');
      el.loop = !!K.par(op, 'loop');
      if (op.rt.err) op.warn = op.rt.err;
      const want = K.par(op, 'play') && K.time.playing;
      el._wantPlay = want;
      if (want && el.paused) { A.ensure(); K.util.tryPlay(el); if (el.paused) op.warn = op.warn || 'Tap anywhere to start audio'; }
      if (!want && !el.paused) el.pause();
      if (K.par(op, 'synctl') && el.duration && isFinite(el.duration)) {
        const target = K.time.seconds % el.duration;
        if (Math.abs(el.currentTime - target) > 0.35 && (K.time.jumped || !want)) el.currentTime = target;
      }
      const o = audioOut(op, op.rt.an);
      o.chans.push(one('time', el.currentTime || 0));
      return o;
    },
  });

  K.defineOp({
    type: 'audiodeviceinCHOP', label: 'Audio Device In', short: 'audiodevin', family: 'CHOP', gen: true,
    help: 'Microphone / line input. Press Start Device and allow access.',
    params: [{ name: 'start', label: 'Start Device', type: 'pulse' }, { name: 'gain', label: 'Input Gain', type: 'float', default: 1, min: 0, max: 8 }, { name: 'monitor', label: 'Monitor (hear it)', type: 'toggle', default: false }],
    destroy(op) { if (op.rt.stream) op.rt.stream.getTracks().forEach((t) => t.stop()); },
    pulse(op, n) {
      if (n !== 'start') return;
      const ctx = A.ensure();
      if (!ctx || !navigator.mediaDevices) { K.toast('Audio input not available'); return; }
      navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } }).then((s) => {
        op.rt.stream = s;
        op.rt.node = ctx.createMediaStreamSource(s);
        op.rt.gain = ctx.createGain();
        op.rt.an = makeAnalyser(ctx);
        op.rt.node.connect(op.rt.gain); op.rt.gain.connect(op.rt.an);
      }).catch((e) => K.toast('Microphone unavailable: ' + e.message));
    },
    cook(op) {
      if (!op.rt.an) { op.warn = 'Press Start Device'; return audioOut(op, null); }
      op.rt.gain.gain.value = K.parNum(op, 'gain');
      const mon = !!K.par(op, 'monitor');
      if (mon !== !!op.rt.mon) { try { if (mon) op.rt.gain.connect(A.master); else op.rt.gain.disconnect(A.master); } catch (e) {} op.rt.mon = mon; }
      return audioOut(op, op.rt.an);
    },
  });

  K.defineOp({
    type: 'audiooscCHOP', label: 'Audio Oscillator', short: 'audioosc', family: 'CHOP', gen: true,
    help: 'Synthesized tone (sine/square/saw/triangle) — test signal or drone. Feeds Analyze/Spectrum.',
    params: [
      { name: 'wave', label: 'Wave', type: 'menu', options: ['sine', 'square', 'sawtooth', 'triangle'], default: 'sine' },
      { name: 'freq', label: 'Frequency (Hz)', type: 'float', default: 110, min: 20, max: 2000 },
      { name: 'volume', label: 'Volume', type: 'float', default: 0.0, min: 0, max: 1 },
    ],
    destroy(op) { try { op.rt.osc && op.rt.osc.stop(); } catch (e) {} },
    cook(op) {
      const ctx = A.ensure();
      if (!ctx) return audioOut(op, null);
      if (!op.rt.osc) {
        op.rt.osc = ctx.createOscillator(); op.rt.gain = ctx.createGain(); op.rt.an = makeAnalyser(ctx);
        op.rt.osc.connect(op.rt.an); op.rt.osc.connect(op.rt.gain); op.rt.gain.connect(A.master); op.rt.osc.start();
      }
      op.rt.osc.type = K.par(op, 'wave');
      op.rt.osc.frequency.setTargetAtTime(K.parNum(op, 'freq'), ctx.currentTime, 0.02);
      op.rt.gain.gain.setTargetAtTime(K.time.playing ? K.parNum(op, 'volume') : 0, ctx.currentTime, 0.02);
      return audioOut(op, op.rt.an);
    },
  });

  /* ---------------- audio filters ---------------- */
  K.defineOp({
    type: 'audiospectrumCHOP', label: 'Audio Spectrum', short: 'spectrum', family: 'CHOP',
    help: 'FFT magnitude bins (0–1) from an audio CHOP. Feed into CHOP to TOP or CHOP to SOP.',
    params: [
      { name: 'bins', label: 'Bins', type: 'int', default: 64, min: 8, max: 512 },
      { name: 'log', label: 'Logarithmic Frequency', type: 'toggle', default: true },
      { name: 'gain', label: 'Gain', type: 'float', default: 1.2, min: 0, max: 8 },
      { name: 'smooth', label: 'Smoothing', type: 'float', default: 0.7, min: 0, max: 0.99 },
    ],
    cook(op, ctx) {
      const src = ctx.input(op, 0);
      // An expression can hand back a fraction or an absurd value; typed arrays throw on
      // the first and stall the browser on the second.
      const n = U.clamp(Math.round(K.parNum(op, 'bins')), 1, 4096);
      const out = new Float32Array(n);
      if (!src || !src.analyser) { op.warn = 'Connect an audio CHOP'; return outOf([{ name: 'spectrum', data: out }]); }
      const an = src.analyser;
      an.smoothingTimeConstant = K.parNum(op, 'smooth');
      op.rt.fft = op.rt.fft && op.rt.fft.length === an.frequencyBinCount ? op.rt.fft : new Uint8Array(an.frequencyBinCount);
      an.getByteFrequencyData(op.rt.fft);
      const N = op.rt.fft.length, lg = K.par(op, 'log'), g = K.parNum(op, 'gain');
      const maxBin = Math.floor(N * 0.7);
      for (let i = 0; i < n; i++) {
        let a, b;
        if (lg) { a = Math.floor(Math.pow(maxBin, i / n)); b = Math.max(a + 1, Math.floor(Math.pow(maxBin, (i + 1) / n))); }
        else { a = Math.floor((i / n) * maxBin); b = Math.max(a + 1, Math.floor(((i + 1) / n) * maxBin)); }
        let s = 0;
        for (let j = a; j < b; j++) s += op.rt.fft[j];
        out[i] = Math.min(1.5, (s / (b - a) / 255) * g);
      }
      return outOf([{ name: 'spectrum', data: out }]);
    },
  });

  K.defineOp({
    type: 'audioanalyzeCHOP', label: 'Audio Analyze', short: 'analyze', family: 'CHOP',
    help: 'Level, low/mid/high bands and an onset (kick) detector — the fastest way to make visuals audio-reactive.',
    params: [
      { name: 'gain', label: 'Gain', type: 'float', default: 1.5, min: 0, max: 10 },
      { name: 'smooth', label: 'Smoothing', type: 'float', default: 0.5, min: 0, max: 0.99 },
      { name: 'sens', label: 'Onset Sensitivity', type: 'float', default: 1.35, min: 1, max: 3 },
    ],
    cook(op, ctx) {
      const src = ctx.input(op, 0);
      const names = ['level', 'low', 'mid', 'high', 'onset'];
      if (!src || !src.analyser) { op.warn = 'Connect an audio CHOP'; return outOf(names.map((n) => one(n, 0))); }
      const an = src.analyser;
      op.rt.fft = op.rt.fft && op.rt.fft.length === an.frequencyBinCount ? op.rt.fft : new Uint8Array(an.frequencyBinCount);
      an.getByteFrequencyData(op.rt.fft);
      const sr = (A.ctx && A.ctx.sampleRate) || 48000, hz = sr / an.fftSize;
      const band = (lo, hi) => { let s = 0, c = 0; for (let i = Math.floor(lo / hz); i < Math.min(op.rt.fft.length, Math.ceil(hi / hz)); i++) { s += op.rt.fft[i]; c++; } return c ? s / c / 255 : 0; };
      const g = K.parNum(op, 'gain'), sm = K.parNum(op, 'smooth');
      const raw = [band(20, 8000), band(20, 180), band(180, 2200), band(2200, 12000)].map((v) => Math.min(1.5, v * g));
      op.rt.s = op.rt.s || [0, 0, 0, 0];
      for (let i = 0; i < 4; i++) op.rt.s[i] = op.rt.s[i] * sm + raw[i] * (1 - sm);
      // onset: low band energy vs running average
      op.rt.avg = (op.rt.avg || 0) * 0.95 + raw[1] * 0.05;
      const hit = raw[1] > op.rt.avg * K.parNum(op, 'sens') && raw[1] > 0.12 && K.time.seconds - (op.rt.lastHit || -1) > 0.12;
      if (hit) op.rt.lastHit = K.time.seconds;
      op.rt.env = Math.max(hit ? 1 : 0, (op.rt.env || 0) * 0.86);
      return outOf([one('level', op.rt.s[0]), one('low', op.rt.s[1]), one('mid', op.rt.s[2]), one('high', op.rt.s[3]), one('onset', op.rt.env)]);
    },
  });

  /* ---------------- channel filters ---------------- */
  function mapChans(src, fn) {
    return outOf(src.chans.map((c, ci) => { const d = new Float32Array(c.data.length); for (let i = 0; i < d.length; i++) d[i] = fn(c.data[i], ci, i); return { name: c.name, data: d }; }));
  }

  K.defineOp({
    type: 'mathCHOP', label: 'Math', short: 'math', family: 'CHOP', inputs: 'multi',
    help: 'Combine inputs, then offset, multiply and remap ranges.',
    params: [
      { name: 'combine', label: 'Combine Inputs', type: 'menu', options: ['off', 'add', 'multiply', 'average', 'maximum', 'minimum'], default: 'off' },
      { name: 'pre', label: 'Pre-Add', type: 'float', default: 0, min: -10, max: 10 },
      { name: 'gain', label: 'Multiply', type: 'float', default: 1, min: -10, max: 10 },
      { name: 'post', label: 'Post-Add', type: 'float', default: 0, min: -10, max: 10 },
      { name: 'abs', label: 'Absolute Value', type: 'toggle', default: false },
      { name: 'range', label: 'Remap Range', type: 'toggle', default: false, page: 'Range' },
      { name: 'fromlo', label: 'From Low', type: 'float', default: -1, min: -10, max: 10, page: 'Range', row: 'f' },
      { name: 'fromhi', label: 'From High', type: 'float', default: 1, min: -10, max: 10, page: 'Range', row: 'f' },
      { name: 'tolo', label: 'To Low', type: 'float', default: 0, min: -10, max: 10, page: 'Range', row: 't' },
      { name: 'tohi', label: 'To High', type: 'float', default: 1, min: -10, max: 10, page: 'Range', row: 't' },
      { name: 'clamp', label: 'Clamp to Range', type: 'toggle', default: false, page: 'Range' },
    ],
    cook(op, ctx) {
      const ins = op.inputs.filter(Boolean).map((id) => K.cook(K.getOp(id))).filter((o) => o && o.chans);
      if (!ins.length) return outOf([]);
      let base = ins[0];
      const comb = K.par(op, 'combine');
      if (comb !== 'off' && ins.length > 1) {
        base = mapChans(ins[0], (v, ci, i) => {
          let acc = v, cnt = 1;
          for (let k = 1; k < ins.length; k++) {
            const ch = ins[k].chans[ci] || ins[k].chans[0];
            if (!ch) continue;
            const w = ch.data[Math.min(i, ch.data.length - 1)];
            cnt++;
            if (comb === 'add' || comb === 'average') acc += w;
            else if (comb === 'multiply') acc *= w;
            else if (comb === 'maximum') acc = Math.max(acc, w);
            else if (comb === 'minimum') acc = Math.min(acc, w);
          }
          return comb === 'average' ? acc / cnt : acc;
        });
      } else if (ins.length > 1) {
        base = outOf([].concat(...ins.map((o) => o.chans)));
      }
      const pre = K.parNum(op, 'pre'), g = K.parNum(op, 'gain'), post = K.parNum(op, 'post'), ab = K.par(op, 'abs');
      const rng = K.par(op, 'range'), fl = K.parNum(op, 'fromlo'), fh = K.parNum(op, 'fromhi'), tl = K.parNum(op, 'tolo'), th = K.parNum(op, 'tohi'), cl = K.par(op, 'clamp');
      const out = mapChans(base, (v) => {
        v = (v + pre) * g + post;
        if (ab) v = Math.abs(v);
        if (rng) { v = tl + ((v - fl) / (fh - fl || 1)) * (th - tl); if (cl) v = U.clamp(v, Math.min(tl, th), Math.max(tl, th)); }
        return v;
      });
      if (base.analyser) out.analyser = base.analyser;
      return out;
    },
  });

  K.defineOp({
    type: 'lagCHOP', label: 'Lag', short: 'lag', family: 'CHOP',
    help: 'Smooth changes over time with separate rise / fall times.',
    params: [
      { name: 'up', label: 'Lag Up (s)', type: 'float', default: 0.2, min: 0, max: 5 },
      { name: 'down', label: 'Lag Down (s)', type: 'float', default: 0.4, min: 0, max: 5 },
    ],
    cook(op, ctx) {
      const src = ctx.input(op, 0);
      if (!src || !src.chans) return outOf([]);
      const dt = K.time.dt, up = K.parNum(op, 'up'), dn = K.parNum(op, 'down');
      op.rt.st = op.rt.st || {};
      return mapChans(src, (v, ci, i) => {
        const k = ci + ':' + i;
        const prev = op.rt.st[k] == null ? v : op.rt.st[k];
        const tau = v > prev ? up : dn;
        const a = tau <= 0 ? 1 : 1 - Math.exp(-dt / tau);
        const r = prev + (v - prev) * a;
        op.rt.st[k] = r;
        return r;
      });
    },
  });

  K.defineOp({
    type: 'speedCHOP', label: 'Speed', short: 'speed', family: 'CHOP',
    help: 'Integrates input over time (value = units per second). Great for audio-driven rotation.',
    params: [{ name: 'reset', label: 'Reset', type: 'pulse' }, { name: 'wrap', label: 'Wrap At (0 = off)', type: 'float', default: 0, min: 0, max: 360 }],
    pulse(op, n) { if (n === 'reset') op.rt.acc = {}; },
    cook(op, ctx) {
      const src = ctx.input(op, 0);
      if (!src || !src.chans) return outOf([]);
      op.rt.acc = op.rt.acc || {};
      const w = K.parNum(op, 'wrap');
      return outOf(src.chans.map((c) => {
        let v = (op.rt.acc[c.name] || 0) + (K.time.playing ? c.data[c.data.length - 1] * K.time.dt : 0);
        if (w > 0) v = ((v % w) + w) % w;
        op.rt.acc[c.name] = v;
        return one(c.name, v);
      }));
    },
  });

  K.defineOp({
    type: 'countCHOP', label: 'Count', short: 'count', family: 'CHOP',
    help: 'Counts off→on transitions of the first input channel. Use for slide advance, scene changes.',
    params: [
      { name: 'thresh', label: 'Threshold', type: 'float', default: 0.5, min: 0, max: 1 },
      { name: 'limit', label: 'Limit', type: 'menu', options: ['off', 'clamp', 'loop'], default: 'loop' },
      { name: 'min', label: 'Min', type: 'int', default: 0, min: 0, max: 100, row: 'm' },
      { name: 'max', label: 'Max', type: 'int', default: 3, min: 0, max: 100, row: 'm' },
      { name: 'step', label: 'Step', type: 'pulse' },
      { name: 'back', label: 'Step Back', type: 'pulse' },
      { name: 'reset', label: 'Reset', type: 'pulse' },
    ],
    pulse(op, n) { const lo = K.parNum(op, 'min'); if (op.rt.c == null) op.rt.c = lo; if (n === 'step') op.rt.c++; if (n === 'back') op.rt.c--; if (n === 'reset') op.rt.c = lo; },
    cook(op, ctx) {
      const src = ctx.input(op, 0);
      let v = 0;
      if (src && src.chans && src.chans[0]) v = src.chans[0].data[0];
      const on = v >= K.parNum(op, 'thresh');
      if (op.rt.c == null) op.rt.c = K.parNum(op, 'min');
      if (on && !op.rt.on) op.rt.c++;
      op.rt.on = on;
      // second channel (if present) counts backwards
      if (src && src.chans && src.chans[1]) {
        const on2 = src.chans[1].data[0] >= K.parNum(op, 'thresh');
        if (on2 && !op.rt.on2) op.rt.c--;
        op.rt.on2 = on2;
      }
      const lo = K.parNum(op, 'min'), hi = K.parNum(op, 'max'), lim = K.par(op, 'limit');
      if (lim === 'clamp') op.rt.c = U.clamp(op.rt.c, lo, hi);
      else if (lim === 'loop') { const span = hi - lo + 1; op.rt.c = lo + (((op.rt.c - lo) % span) + span) % span; }
      return outOf([one('count', op.rt.c)]);
    },
    allowMissing: true, minInputs: 0,
  });

  K.defineOp({
    type: 'triggerCHOP', label: 'Trigger', short: 'trigger', family: 'CHOP',
    help: 'Attack / hold / release envelope fired when the input rises past the threshold.',
    params: [
      { name: 'thresh', label: 'Threshold', type: 'float', default: 0.5, min: 0, max: 1 },
      { name: 'attack', label: 'Attack (s)', type: 'float', default: 0.02, min: 0, max: 5 },
      { name: 'hold', label: 'Hold (s)', type: 'float', default: 0.05, min: 0, max: 5 },
      { name: 'release', label: 'Release (s)', type: 'float', default: 0.6, min: 0, max: 10 },
      { name: 'fire', label: 'Fire', type: 'pulse' },
    ],
    pulse(op, n) { if (n === 'fire') op.rt.start = K.time.absSeconds; },
    allowMissing: true, minInputs: 0,
    cook(op, ctx) {
      const src = ctx.input(op, 0);
      const v = src && src.chans && src.chans[0] ? src.chans[0].data[0] : 0;
      const on = v >= K.parNum(op, 'thresh');
      if (on && !op.rt.on) op.rt.start = K.time.absSeconds;
      op.rt.on = on;
      const a = K.parNum(op, 'attack'), h = K.parNum(op, 'hold'), r = K.parNum(op, 'release');
      let e = 0;
      if (op.rt.start != null) {
        const dt = K.time.absSeconds - op.rt.start;
        if (dt < a) e = dt / (a || 1e-6);
        else if (dt < a + h) e = 1;
        else if (dt < a + h + r) e = 1 - (dt - a - h) / (r || 1e-6);
      }
      return outOf([one('env', e)]);
    },
  });

  K.defineOp({
    type: 'mergeCHOP', label: 'Merge', short: 'merge', family: 'CHOP', inputs: 'multi',
    help: 'Combine channels from many CHOPs into one.',
    params: [],
    cook(op) {
      const chans = [];
      op.inputs.filter(Boolean).forEach((id) => { const o = K.cook(K.getOp(id)); if (o && o.chans) chans.push(...o.chans); });
      return outOf(chans);
    },
  });

  K.defineOp({
    type: 'selectCHOP', label: 'Select', short: 'select', family: 'CHOP', minInputs: 0, allowMissing: true,
    help: 'Pick channels by name (wildcards ok: n*, low mid) from the input or from any CHOP by reference.',
    params: [
      { name: 'chop', label: 'CHOP (optional)', type: 'op', family: 'CHOP', default: '' },
      { name: 'names', label: 'Channel Names', type: 'string', default: '*' },
      { name: 'rename', label: 'Rename To', type: 'string', default: '' },
    ],
    cook(op, ctx) {
      const src = ctx.refOut(op, 'chop', 'CHOP') || ctx.input(op, 0);
      if (!src || !src.chans) return outOf([]);
      const pats = String(K.par(op, 'names')).split(/[\s,]+/).filter(Boolean).map((p) => new RegExp('^' + p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$'));
      const ren = String(K.par(op, 'rename')).split(/[\s,]+/).filter(Boolean);
      const sel = src.chans.filter((c) => pats.some((r) => r.test(c.name)));
      const o = outOf(sel.map((c, i) => ({ name: ren[i] || c.name, data: c.data })));
      if (src.analyser) o.analyser = src.analyser;
      return o;
    },
  });

  K.defineOp({
    type: 'dattoCHOP', label: 'DAT to CHOP', short: 'datto', family: 'CHOP', gen: true,
    help: 'Numbers from a Table DAT (row 0 = names, row 1 = values) or a JSON object.',
    params: [{ name: 'dat', label: 'DAT', type: 'op', family: 'DAT', default: '' }],
    cook(op, ctx) {
      const d = ctx.refOut(op, 'dat', 'DAT');
      if (!d) { op.warn = 'Pick a DAT'; return outOf([]); }
      if (d.json && typeof d.json === 'object') {
        const chans = [];
        const walk = (o, pre) => Object.keys(o).forEach((k) => { const v = o[k]; if (typeof v === 'number') chans.push(one(pre + k, v)); else if (v && typeof v === 'object' && chans.length < 64) walk(v, pre + k + '_'); });
        walk(d.json, '');
        return outOf(chans);
      }
      if (d.table && d.table.length >= 2) return outOf(d.table[0].map((n, i) => one(n || 'c' + i, parseFloat(d.table[1][i]) || 0)));
      return outOf([]);
    },
  });

  K.defineOp({
    type: 'nullCHOP', label: 'Null', short: 'null', family: 'CHOP',
    help: 'Pass-through reference point.', params: [],
    cook: (op, ctx) => ctx.input(op, 0),
  });
})();
