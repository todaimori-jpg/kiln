/* Kiln — bible-special.js : Bible entries for the special operators (looks, history, tracking, GW). */
(function () {
  'use strict';
  const K = window.K, B = K.BIBLE;

  Object.assign(B.ops, {
    ditherTOP: { what: 'Quantizes the image to a few levels using an ordered Bayer pattern (or noise), so gradients turn into fine dot patterns. Two-Tone maps it onto any dark and light color.', use: ['1-bit Mac and Game Boy looks', 'Zine and risograph-style posters', 'Making video feel printed'], chain: 'moviefileinTOP > ditherTOP > outTOP', tip: 'Pixel Size 3 with Levels 2 reads clearly on big screens. Try a deep blue Dark Color and cream Light Color.' },
    nightvisionTOP: { what: 'Image-intensifier look: boosts brightness, tints it with a phosphor color, adds grain, flicker, scanlines and highlight bloom, then masks it as a vignette, a round scope or binoculars.', use: ['Surveillance and documentary moods', 'Turning dark footage into graphic green', 'Thriller title sequences'], chain: 'videodeviceinTOP > nightvisionTOP > outTOP', tip: 'Gain around 2–3 and Gamma 0.7 suit most footage. Mask: binocular for a classic POV.' },
    crtTOP: { what: 'Simulates a cathode-ray tube: curved glass with rounded corners, scanlines, an RGB phosphor mask (aperture grille, shadow mask or slot mask), color fringing, glow and flicker.', use: ['Retro TV and arcade looks', 'Presenting slides “on a monitor”', 'Lo-fi music visuals'], chain: 'textTOP > crtTOP > bloomTOP > outTOP', tip: 'Follow with a Bloom TOP for glowing phosphors. Line Count 0 picks a count that matches the output size.' },
    receiptTOP: { what: 'Prints the image like a thermal receipt: dithered black dots on worn paper with print-head fade streaks, side margins and a torn top and bottom edge.', use: ['Data-as-receipt graphics', 'Retail or airport themed pieces', 'Tactile, analog texture'], chain: 'textTOP > receiptTOP > outTOP', tip: 'Keep it high contrast. Raise Print-Head Fade for a used-up printer.' },
    depthmapTOP: { what: 'Makes a pseudo depth map from brightness (bright = near). It is not real 3D depth, but it works well as a map for displacement, fog and parallax. False Color shows it as a heat map.', use: ['Displacement maps for a fake 3D push', 'Fog and atmospheric falloff', 'Masks for Luma Blur focus'], chain: 'moviefileinTOP > depthmapTOP > lumablurTOP', tip: 'Smooth removes texture noise so the depth reads as shapes. Swap Near and Far to invert.' },
    lumablurTOP: { what: 'Variable blur: each pixel blurs by an amount set by a map. The map can be input 1, the image\'s own brightness, a horizontal focus band (tilt-shift) or a radial vignette. Cost stays the same at any radius.', use: ['Tilt-shift miniatures', 'Focus pulls driven by a CHOP', 'Depth-of-field with a depth map'], chain: 'moviefileinTOP > lumablurTOP > outTOP', tip: 'Map Source: vertical (tilt-shift), then animate Focus Position for a focus rack.' },
    datamoshTOP: { what: 'Simulates a video-compression glitch. Moving blocks drag old pixels along the motion while still areas hold the previous frame. Press I-Frame to snap back to a clean image.', use: ['Glitch transitions between clips', 'Music video breakdowns', 'Painterly motion smears'], chain: 'moviefileinTOP > datamoshTOP > outTOP', tip: 'Drive Freeze with a Beat CHOP or button for on-beat melts. Lower Block Size for finer detail.' },
    channelmixTOP: { what: 'A 3 × 3 color matrix: each output channel is a weighted blend of the input red, green and blue, plus an offset.', use: ['Sepia, cross-process and false-color grades', 'Channel swaps', 'Matching footage to a palette'], chain: 'moviefileinTOP > channelmixTOP > outTOP', tip: 'Sepia: Red ← .39 .77 .19, Green ← .35 .69 .17, Blue ← .27 .53 .13.' },
    reorderTOP: { what: 'Rebuilds red, green, blue and alpha from any channel of input 0 or input 1, plus luma, inverted channels, zero or one.', use: ['Use a luma image as an alpha mask', 'Swap channels for color shifts', 'Pack two maps into one image'], chain: 'moviefileinTOP > reorderTOP > compositeTOP', tip: 'Alpha From: in1 luma turns input 1 into a cut-out mask for input 0.' },
    selectTOP: { what: 'Pulls in any TOP by name, with no wire. Kiln just passes the image through, so it costs nothing, unless you change its resolution.', use: ['Reuse one look in many places', 'Reach into a Base COMP', 'Keep big networks tidy'], chain: 'noiseTOP ~> selectTOP.top > outTOP', tip: 'Combine with a Switch TOP to build a scene selector from distant parts of the network.' },
    cacheTOP: { what: 'Keeps the last N frames on the GPU. Output Index 0 is now, −1 the previous frame and so on, with smooth blending between frames. Turn Record off to freeze a moment and scrub through it.', use: ['Instant replay and stutter effects', 'Freeze-frame on a button', 'Scrubbing a captured moment'], chain: 'videodeviceinTOP > cacheTOP > outTOP', tip: 'Drive Output Index with −floor(tri(t)*15) for a back-and-forth stutter.' },
    timemachineTOP: { what: 'Every pixel shows a different moment. A time map (input 1, or a built-in vertical, horizontal or radial ramp, or the image\'s own brightness) picks how many frames back each pixel looks.', use: ['Slit-scan time smears', 'Ripples of the past spreading out', 'Faces that melt through time'], chain: 'videodeviceinTOP > timemachineTOP > outTOP', tip: 'Time Map: vertical ramp gives a classic slit-scan. Feed a Noise TOP into input 1 for liquid time.' },
    timedisplaceTOP: { what: 'A frame delay with smooth fractional delays and up to six fading echoes, mixed with the live image. Delay can be set in frames or seconds.', use: ['Echo trails on dancers', 'Elastic time driven by audio or GW strain', 'Delayed duplicates for layering'], chain: 'moviefileinTOP > timedisplaceTOP > outTOP', tip: 'Set Delay to an expression like 4 + op(\'gwanalysis1\')[\'rms\']*20 so time stretches with the signal.' },
    blobtrackTOP: { what: 'Finds bright (or dark) regions, gives each one an ID that stays the same from frame to frame, and draws boxes over them. It also outputs channels you can read like a CHOP: count, then b1u, b1v, b1w, b1h, b1id, b1area for each blob (u and v run from 0 to 1, starting bottom-left).', use: ['Follow a performer or a light', 'Trigger visuals where people stand', 'Interactive projections'], chain: 'videodeviceinTOP > blobtrackTOP ~> circleTOP.cx > outTOP', tip: 'Circle Center X = (op(\'blobtrack1\')[\'b1u\']-0.5)*2. Raise Threshold until only your subject shows in mask view.' },
    datareadoutTOP: { what: 'Shows a live value as a styled number with a label, units and a scrolling history graph, on a transparent background ready to layer.', use: ['On-screen telemetry for data art', 'Showing what a signal is doing in a presentation', 'Debugging CHOPs'], chain: 'gwchirpCHOP ~> datareadoutTOP.chop > compositeTOP > outTOP', tip: 'Set Channel to a name (freq, rms…). Turn on Scientific Notation for tiny numbers.' },

    gwstraininCHOP: { what: 'Plays gravitational-wave strain data, the measured stretch of space from detectors like LIGO, as a control signal. It loads GWOSC .txt or .gz files and cleans them with a band-pass filter. With no file, it plays a built-in synthetic black-hole merger, so it works offline. It also finds the merger moment automatically. Outputs: strain, env (loudness), time, progress, tomerger.', use: ['Science-driven art and installations', 'Driving motion with real cosmic data', 'Timing a piece around the merger'], chain: 'gwstraininCHOP > gwchirpCHOP ~> hsvadjustTOP.hue', tip: 'Download a 32-second, 4 kHz file from gwosc.org (for example GW150914 H1) and drop it on the network. A slow Speed (0.1) stretches the chirp across a scene.' },
    gwanalysisCHOP: { what: 'Turns strain into steady 0–1 controls: abs (instant amplitude), rms (smoothed loudness) and peak (with a release), all relative to the loudest moment in the file. It also works on any CHOP as a general envelope follower.', use: ['Pulse brightness with the signal', 'Scale shapes with the envelope', 'Smoother control than raw strain'], chain: 'gwstraininCHOP > gwanalysisCHOP ~> levelTOP.bright', tip: 'Use rms for smooth motion and peak for punchy hits. A longer Window means smoother output.' },
    gwchirpCHOP: { what: 'Tracks the chirp: the rising tone of two black holes spiraling together. It compares each moment\'s spectrum to the file\'s noise baseline and outputs the strongest excess frequency (freq), its progress through the band (0–1), strength, active (0 or 1), ratio and composite.', use: ['Hue or pitch that climbs into the merger', 'Triggering a reveal when the chirp appears', 'Data readouts of frequency'], chain: 'gwstraininCHOP > gwchirpCHOP ~> datareadoutTOP.chop', tip: 'progress is the most useful control: 0 at Low Hz, 1 at High Hz. Raise Detect Threshold if noise triggers it.' },
    gwsineCHOP: { what: 'An oscillator whose speed and swing follow its input. Quiet input gives slow, small motion; loud input gives fast, wide motion. Amplitude Floor keeps some motion when the input is silent.', use: ['Turning jittery data into graceful motion', 'Breathing shapes that speed up with the signal', 'Rotation, scale or displacement modulation'], chain: 'gwanalysisCHOP > gwsineCHOP ~> transformTOP.rotate', tip: 'Turn on Output 0–1 to drive opacity or mix parameters.' },
    gwfilmsyncCHOP: { what: 'Syncs GW strain to a film or timeline. It stretches the inspiral so the merger lands exactly at Film Merger Time, then stretches the ringdown to fill the rest. The clock can be the timeline or a Movie File In\'s playhead. Wire it into a GW Strain In to drive its playhead.', use: ['Landing the merger on a cut or musical hit', 'Scoring a film edit with real data', 'Long installations paced around one event'], chain: 'gwfilmsyncCHOP > gwstraininCHOP > gwchirpCHOP', tip: 'Set GW Strain In inside the Film Sync parameters as well, so it knows the file length and merger time.' },
  });

  // Text TOP animation modes
  if (B.ops.textTOP) {
    B.ops.textTOP.what += ' On the Font tab, click Upload Font… (or drag a .ttf, .otf or .woff2 file onto the network) to use any typeface downloaded from Google Fonts or your own font library. Uploaded fonts are saved in Kiln Files so they stay available across sessions. The Animate page brings type to life with 20 modes. Entrances play once (or loop): Typewriter, Fade, Slide Up, Slide Down, Slide Left, Slide Right, Pop, Blur In, Scramble and Rain. Continuous motions keep moving: Wave, Bounce, Float, Pulse, Shake, Rotate, Flip, Tracking, Orbit and Glitch. Add Motion layers a second movement on top, for example Pop and then Float.';
    B.ops.textTOP.use = (B.ops.textTOP.use || []).concat(['Kinetic titles and lower thirds', 'Typewriter quotes in presentations']);
    B.ops.textTOP.tip += ' Animate By (character, word or line), Order (center out, random…) and Stagger control the rhythm. Set Clock to progress and drive Progress with an expression or CHOP to scrub an entrance by hand.';
  }
  B.TEXT_ANIM_HELP = {
    'typewriter': 'Reveals characters one at a time. Turn on Typewriter Cursor for a blinking caret.',
    'fade': 'Fades characters in one after another.',
    'slide up': 'Characters rise into place from below.',
    'slide down': 'Characters drop into place from above.',
    'slide left': 'Characters enter from the right.',
    'slide right': 'Characters enter from the left.',
    'pop': 'Characters scale in with a slight overshoot.',
    'wave': 'A flowing vertical wave runs through the line. Phase Spread sets the wavelength.',
    'bounce': 'Characters hop upward again and again.',
    'float': 'Characters gently drift and tilt.',
    'pulse': 'Characters grow and shrink in rhythm.',
    'shake': 'Characters jitter rapidly.',
    'rotate': 'Characters rock back and forth.',
    'flip': 'Characters flip horizontally like cards.',
    'tracking': 'Letter spacing breathes in and out.',
    'blur in': 'Characters come into focus while fading in.',
    'scramble': 'Random symbols cycle before each character resolves.',
    'rain': 'Characters fall from above and bounce into place.',
    'orbit': 'Characters circle along small elliptical paths.',
    'glitch': 'Characters jump, dim and split into RGB at random moments.',
  };
  B.terms.push(
    ['Stagger', 'The delay between one character (or word, or line) starting its animation and the next.', 'Text TOP → Animate → Stagger (s).'],
    ['Kinetic type', 'Typography that moves: letters animate in, out or continuously to add rhythm and emphasis.', 'See the Kinetic Type example.'],
  );
  B.recipes.push(
    { title: 'Kinetic title: pop in, then float', tags: ['TOP'], chain: 'textTOP > bloomTOP > outTOP', steps: ['Text TOP → Animate: Animation = pop, Order = center out, Stagger 0.06.', 'Add Motion = float, Amount 0.8, Motion Speed 0.4.', 'Bloom softly lifts the highlights.'] },
    { title: 'Typewriter quote with cursor', tags: ['TOP'], chain: 'textTOP > compositeTOP > outTOP', steps: ['Text TOP: Font JetBrains Mono. Animation = typewriter.', 'Stagger 0.05 (about 20 characters per second). Turn on Typewriter Cursor.', 'Start (s) delays it, so you can sequence several lines.'] },
    { title: 'Scrub text by hand', tags: ['TOP', 'CHOP'], chain: 'lfoCHOP ~> textTOP.progress > outTOP', steps: ['Text TOP: Animation = slide up, Clock = progress.', 'Progress = an expression or a CHOP value from 0 to 1, for example a slider or an LFO.', 'Any entrance can be scrubbed forward and back this way.'] },
  );
  B.recipes.push(
    { title: 'Black-hole chirp to light (GW)', tags: ['CHOP', 'TOP'], chain: 'gwstraininCHOP > gwchirpCHOP ~> hsvadjustTOP.hue ; noiseTOP > hsvadjustTOP > bloomTOP > outTOP', steps: ['GW Strain In plays the built-in merger (or drop a GWOSC file on it). Set Speed to 0.1 to stretch the chirp.', 'GW Chirp Analysis tracks the rising frequency. Hue Offset = op(\'gwchirp1\')[\'progress\']*0.6.', 'Level Brightness or Bloom Intensity = 1 + op(\'gwchirp1\')[\'strength\'] makes the merger flash.'] },
    { title: 'Land the merger on a film beat', tags: ['CHOP', 'TOP'], chain: 'gwfilmsyncCHOP > gwstraininCHOP > gwanalysisCHOP ~> levelTOP.bright ; moviefileinTOP > levelTOP > outTOP', steps: ['Load your film in Movie File In.', 'GW Film Sync: Film Clock = movie, Movie File In = moviefilein1, GW Strain In = gwstrain1, Film Merger Time = the second of your cut.', 'Wire Film Sync into GW Strain In. The inspiral stretches to land exactly on that second.'] },
    { title: 'Elastic time from GW strain', tags: ['CHOP', 'TOP'], chain: 'gwstraininCHOP > gwanalysisCHOP > gwsineCHOP ~> timedisplaceTOP.delay ; videodeviceinTOP > timedisplaceTOP > outTOP', steps: ['GW Signal Analysis turns strain into a 0–1 envelope.', 'GW Sine Modulator makes smooth motion that speeds up with the signal.', 'Time Displace Delay = 8 + op(\'gwsine1\')[\'sine\']*6 for breathing echoes.'] },
    { title: 'Retro monitor look', tags: ['TOP'], chain: 'moviefileinTOP > datamoshTOP > crtTOP > bloomTOP > outTOP', steps: ['Datamosh smears the footage like a broken codec. Press I-Frame to clean it.', 'CRT Monitor adds glass curvature, scanlines and a phosphor mask.', 'Bloom makes the phosphors glow.'] },
    { title: 'Thermal receipt poster', tags: ['TOP', 'DAT'], chain: 'tableDAT ~> textTOP.dat > receiptTOP > outTOP', steps: ['Put your copy in a Table DAT.', 'Text TOP reads a row. Use a mono font such as Space Mono.', 'Receipt Paper prints it on worn thermal paper.'] },
    { title: 'Slit-scan mirror', tags: ['TOP'], chain: 'videodeviceinTOP > timemachineTOP > outTOP', steps: ['Start the camera.', 'Time Machine: Time Map = vertical ramp, Black Offset −30, History 32.', 'Move slowly: the bottom of the frame shows the past.'] },
    { title: 'Follow a light with Blob Track', tags: ['TOP'], chain: 'videodeviceinTOP > blobtrackTOP ~> circleTOP.cx > compositeTOP > outTOP', steps: ['Blob Track: raise Threshold until only the light shows in mask view.', 'Circle Center X = (op(\'blobtrack1\')[\'b1u\']-0.5)*2, Center Y = (op(\'blobtrack1\')[\'b1v\']-0.5)*2.', 'Composite the circle over the camera, or feed it into Feedback for trails.'] },
    { title: 'Tilt-shift miniature', tags: ['TOP'], chain: 'moviefileinTOP > lumablurTOP > hsvadjustTOP > outTOP', steps: ['Luma Blur: Map Source = vertical (tilt-shift), Max Radius 18.', 'Focus Position 0.45, Focus Width 0.15.', 'HSV Adjust Saturation 1.4 sells the toy look.'] },
  );

  B.terms.push(
    ['Strain', 'How much space itself stretches as a gravitational wave passes, about 10⁻²¹. Kiln normalizes it so you can use it like any other signal.', 'See GW Strain In.'],
    ['Chirp', 'The rising whoop of two black holes spiraling together: frequency and loudness climb fast right before they merge.', 'GW Chirp Analysis tracks it.'],
    ['Merger', 'The moment the two objects become one. It is the loudest point of the signal, and Kiln finds it automatically.', 'GW Film Sync lands it on a film time.'],
    ['GWOSC', 'The Gravitational Wave Open Science Center (gwosc.org), where LIGO and Virgo data is free to download as .txt or .gz files.', 'Pick a 32-second, 4 kHz file.'],
    ['Frame history', 'A stack of recent frames kept on the GPU. Cache, Time Machine and Time Displace read from it.', 'History Resolution: half saves memory on iPad.'],
    ['Datamosh', 'A glitch made by breaking video compression, so motion drags old pixels around instead of drawing new ones.', 'See Datamosh TOP.'],
    ['Blob', 'A connected region of pixels brighter (or darker) than a threshold. Blob Track gives each blob an ID and position.', ''],
  );

  B.expressions.push(
    ["op('gwchirp1')['progress']", 'How far the chirp has climbed through its band (0–1).', "op('gwchirp1')['progress']*0.6"],
    ["op('blobtrack1')['b1u']", 'Blob 1 horizontal position (0–1). Use b1v for vertical, count for the number of blobs.', "(op('blobtrack1')['b1u']-0.5)*2"],
  );
})();
