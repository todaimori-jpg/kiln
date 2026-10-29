/* Kiln — bible.js : the Kiln Bible (glossary, every operator, connection recipes).
   Chain syntax:  a > b      wire (output of a into input of b)
                  a ~> b.par  reference (a drives parameter "par" of b — no wire)
   Operators are written by type (noiseTOP) or type#name (lfoCHOP#lfo1). */
(function () {
  'use strict';
  const K = window.K;
  const B = (K.BIBLE = {});

  /* ------------------------------------------------------------------ */
  B.intro = [
    'Kiln is a node-based studio. Every piece of a project is an operator (OP): a small box that does one job. You connect operators with wires so the output of one becomes the input of the next. Every frame, Kiln "cooks" the network from left to right and shows the result.',
    'Operators come in six families, each with its own color and kind of data. Wires only connect operators of the same family. Families talk to each other through references: a CHOP value can drive a TOP parameter, a Table DAT can feed a Text TOP, and so on.',
    'Read the network left to right: generators (no input) on the left, filters in the middle, and an Out TOP with the blue Display flag on the far right. That Out TOP is what Perform mode shows and what Record exports.',
  ];

  B.families = [
    { id: 'TOP', name: 'Texture Operators', short: 'Images', what: 'Make and process 2D images on the GPU: color, noise, text, video, effects, compositing, and the final output frame.', data: 'An image (texture) at a resolution, with alpha.', example: 'noiseTOP > lookupTOP > bloomTOP > outTOP' },
    { id: 'CHOP', name: 'Channel Operators', short: 'Motion & sound', what: 'Numbers that change over time: LFOs, noise, audio levels, MIDI knobs, keys, counters. Used to animate parameters.', data: 'One or more named channels, each holding one value (or many samples, like an audio spectrum).', example: 'audiofileinCHOP > audioanalyzeCHOP ~> circleTOP.radius' },
    { id: 'SOP', name: 'Surface Operators', short: '3D geometry', what: 'Create and deform 3D shapes, point clouds and particles.', data: 'Points, normals, colors and triangles/lines.', example: 'torusSOP > noiseSOP ~> geometryCOMP.sop' },
    { id: 'MAT', name: 'Materials', short: 'Shading', what: 'Describe how a 3D surface looks under light: flat, shiny, metallic, wireframe or custom GLSL.', data: 'A shader and its settings, assigned to a Geometry COMP.', example: 'pbrMAT ~> geometryCOMP.mat' },
    { id: 'COMP', name: 'Components', short: 'Objects & UI', what: 'Containers and objects: 3D objects, cameras, lights, on-screen controls (sliders, buttons, XY pads) and Base COMPs that hold whole sub-networks.', data: 'A transform or control value; Base COMPs hold other operators.', example: 'sliderCOMP ~> levelTOP.bright' },
    { id: 'DAT', name: 'Data Operators', short: 'Text, tables, code', what: 'Text, tables, JavaScript, and connections to the outside world (web, WebSocket, serial).', data: 'Text or a table of cells.', example: 'tableDAT ~> textTOP.dat' },
  ];

  /* ------------------------------------------------------------------ */
  B.terms = [
    ['Operator (OP)', 'A single node in the network. It has a type (Noise TOP), a unique name (noise1), parameters, and usually inputs and an output.', 'Press Tab to add one.'],
    ['Family', 'The kind of data an operator makes: TOP, CHOP, SOP, MAT, COMP or DAT. Each family has a color: TOP purple, CHOP green, SOP blue, MAT gold, DAT pink, COMP grey.', 'Wires only join operators of the same family.'],
    ['Network', 'The canvas where operators live and are wired together. A project has a root network, and every Base COMP holds its own network inside.', 'The path at the top of the network (project / base1) shows where you are.'],
    ['Node', 'The box that represents an operator in the network. It shows the name, type, a live thumbnail, flags and ports.', ''],
    ['Wire', 'A connection from an output port (right side) to an input port (left side). Data flows along it, left to right.', 'Click a wire, then press Delete or tap its × to cut it.'],
    ['Port', 'The small circles on a node. Input ports are on the left, the output port is on the right. Filled ports are connected.', 'Drag from a port to start a wire.'],
    ['Generator', 'An operator with no inputs that creates something from scratch: Noise TOP, LFO CHOP, Sphere SOP, Table DAT.', 'Generators are marked "gen" in the palette.'],
    ['Filter', 'An operator that takes an input and changes it: Blur TOP, Lag CHOP, Noise SOP.', ''],
    ['Cook', 'Computing an operator\'s output for the current frame. Kiln cooks every operator that needs updating, every frame.', 'The ms number under a selected node is its cook time.'],
    ['Parameter', 'A setting on an operator, edited in the panel on the right: numbers, colors, menus, toggles, text, files, operator references.', ''],
    ['Parameter page', 'Parameters are grouped into tabs, for example Main, Layout and Common. Common holds the resolution settings for TOPs.', ''],
    ['Constant mode', 'The parameter holds a fixed value that you type, drag or pick.', 'Drag a number left or right to scrub it. Hold Shift for fine control.'],
    ['Expression', 'A small JavaScript formula that is re-evaluated every frame, for example sin(t)*0.5 or op(\'lfo1\')[0]. An expression turns a parameter blue.', 'Click a parameter label, or press its = button.'],
    ['Reference', 'Using another operator\'s data without a wire, through an expression (op(\'lfo1\')[0]) or an operator parameter (Text TOP → DAT Source). Shown as a dashed line in the network.', 'This is how CHOPs drive TOPs and how DATs feed Text TOPs.'],
    ['Channel', 'A named stream of numbers in a CHOP, for example chan1, low or arrowright. Read it with op(\'name\')[\'channel\'] or op(\'name\')[0] for the first one.', ''],
    ['Sample', 'One value inside a channel. Most control CHOPs have one sample. Audio Spectrum has one sample per frequency bin.', ''],
    ['Display flag (D)', 'The blue D on a TOP. It marks which image Perform mode and Record use. Normally set on your Out TOP.', 'Select a TOP and press D.'],
    ['Bypass flag (B)', 'Turns an operator off and passes its first input straight through, for quick before/after comparisons.', 'Select and press B.'],
    ['Viewer', 'The preview at the top right. Selected shows the chosen operator. Output shows the final Display image. The expand button (or F) opens it in full view.', ''],
    ['Full view', 'The viewer enlarged to fill the window while the timeline stays usable. Press F or Esc, or click the shrink button, to bring it back down.', 'Double-click an Out TOP to open it in full view.'],
    ['Perform mode', 'Fullscreen output for presenting or projecting, with an optional live control panel (C). Hides the editor.', 'P or F1 to enter, Esc to exit.'],
    ['Record (Movie File Out)', 'Captures the Display image to a video file at the project resolution, optionally with audio.', 'Press R.'],
    ['Timeline', 'The bar at the bottom: current time, play/pause, scrub, length, BPM, tap tempo and loop. t in expressions is timeline seconds.', 'Space plays and pauses.'],
    ['Frame', 'One step of the timeline. frame = seconds × project fps.', ''],
    ['BPM / Beat', 'Project tempo. beat counts beats since the start, bar counts bars of 4 beats. The Beat CHOP and LFO Beat Sync follow it.', 'Tap the Tap button in rhythm to set it.'],
    ['Resolution', 'The pixel size of the project (for example 1920 × 1080 or 1080 × 1920). TOPs default to it, and Record exports at it.', 'Set it from the menu in the top bar.'],
    ['Texture', 'An image living on the GPU. TOPs pass textures to each other.', ''],
    ['Alpha', 'Transparency. 1 is opaque and 0 is invisible. Text, Circle and Rectangle TOPs have transparent backgrounds, so you can layer them.', ''],
    ['Composite / layering', 'Stacking images. In a Composite TOP, input 0 is the bottom layer and each next input goes on top.', ''],
    ['Blend mode', 'How layers mix: over (normal), add (glow), screen (lighten), multiply (darken), difference and more.', ''],
    ['Feedback', 'Feeding the previous frame back into itself, slightly transformed, to create trails, tunnels and smears.', 'See Feedback TOP.'],
    ['Palette / gradient map', 'Replacing brightness with colors from a gradient, which turns grey noise into a styled image.', 'See Lookup TOP.'],
    ['GLSL / shader', 'A small GPU program that computes every pixel (GLSL TOP) or every surface point (GLSL MAT). Kiln accepts Shadertoy-style mainImage code.', ''],
    ['Uniform', 'A value passed into a shader. In Kiln, u0 to u3 and c0 are uniforms you can drive with expressions.', ''],
    ['Render pipeline', 'How 3D reaches the screen: SOP (shape) + MAT (look) → Geometry COMP (object) → seen by a Camera COMP, lit by Light COMPs → drawn by a Render TOP.', ''],
    ['Instancing', 'Drawing one shape many times, once per point of another SOP, in one fast GPU draw call. Set on the Geometry COMP (Instance SOP).', ''],
    ['Gadget / panel', 'An on-screen control (Slider, Button, XY Pad COMP) you can use in the viewer and in Perform mode.', ''],
    ['Base COMP (container)', 'An operator that holds a whole sub-network, to keep big projects tidy.', 'Select nodes and press Shift+C to collapse them into one.'],
    ['Null', 'A pass-through operator. Put one at the end of a chain as a stable name for other operators to reference.', ''],
    ['FFT / spectrum', 'Splitting audio into frequency bands from low (bass) to high (treble). See Audio Spectrum CHOP.', ''],
    ['Onset', 'A sudden jump in loudness, like a kick drum. Audio Analyze outputs an onset channel that spikes on hits.', ''],
    ['Lag / smoothing', 'Easing a value toward its target over time instead of jumping, so motion feels physical.', 'See Lag CHOP.'],
    ['Projection mapping', 'Warping the output to fit a real surface, such as a wall, box or screen at an angle.', 'See Corner Pin TOP.'],
    ['Media', 'Files you load (video, images, audio, 3D models). They stay on your device. Save with media embedded to carry them inside the .kiln file.', ''],
    ['.kiln file', 'A saved project (JSON). Open it with File → Open. Kiln also autosaves in the browser.', ''],
    ['Relay', 'A tiny local program (tools/relay.js) that bridges Kiln\'s WebSocket DAT to OSC, DMX/Art-Net and HTTP APIs that send no CORS headers, which browsers cannot reach directly.', ''],
    ['CORS', 'A permission a web API grants by header, allowing a page on another site to read its response. Without it the browser refuses the request — the API itself is fine, the page is not allowed to see it. Most government and institutional feeds omit it; run them through the relay\'s HTTP proxy.', 'See Web Client DAT.'],
  ];

  /* ------------------------------------------------------------------ */
  // Per-operator guide: what it does, when to use it, an example connection, a tip.
  B.ops = {
    // ---------- TOP ----------
    constantTOP: { what: 'Fills the frame with one solid color (and alpha).', use: ['Background color for compositing', 'Tinting with Multiply in a Composite TOP', 'A solid plate behind text'], chain: 'constantTOP > compositeTOP > outTOP', tip: 'Set Alpha below 1 and use it as a color wash over another image.' },
    noiseTOP: { what: 'Generates organic, animated noise patterns on the GPU: smooth simplex, layered fbm, ridged, cellular or turbulence.', use: ['Atmospheric backgrounds and fog', 'Displacement maps for warping', 'Texture for materials'], chain: 'noiseTOP > lookupTOP > levelTOP > outTOP', tip: 'Animate Z Offset with t*0.1 for slow morphing, or raise Speed. Pipe it through a Lookup TOP to colorize it.' },
    rampTOP: { what: 'Draws a 3-color gradient: linear, radial, angular or diamond.', use: ['Gradient backgrounds', 'Custom palettes for Lookup TOP input 1', 'Vignettes and light falloff'], chain: 'rampTOP > lookupTOP', tip: 'Animate Angle or Phase for a slowly rotating sky.' },
    circleTOP: { what: 'Draws an anti-aliased circle, ring or polygon on a transparent background.', use: ['Rings, dots and badges', 'Audio-reactive pulses', 'Seeds for feedback trails'], chain: 'circleTOP > feedbackTOP > compositeTOP', tip: 'Set Ring Width above 0 for an outline. Drive Radius with an audio level.' },
    rectangleTOP: { what: 'Draws a rounded rectangle with optional border and softness on a transparent background.', use: ['Cards and lower thirds behind text', 'Progress bars', 'Frames, lines and dividers'], chain: 'rectangleTOP > compositeTOP', tip: 'A very thin, wide rectangle makes a clean horizon or divider line.' },
    patternTOP: { what: 'Tiles a pattern: checker, stripes, grid, dots, hex or waves.', use: ['Graphic backgrounds', 'Calibration grids for mapping', 'Op-art with Kaleido or Displace'], chain: 'patternTOP > kaleidoTOP > outTOP', tip: 'Scroll Speed animates the pattern without expressions.' },
    textTOP: { what: 'Renders typography with web fonts, alignment, wrapping, letter spacing and a typewriter Reveal. It can pull its text from a Table or Text DAT.', use: ['Titles, slides and captions', 'Live data labels ({round(t)}s)', 'One-pager copy driven by a table'], chain: 'tableDAT ~> textTOP.dat > compositeTOP > outTOP', tip: 'Press Return in the Text box (or write \\n) for multiple lines. When reading from a Table DAT, turn on All DAT Rows to stack every row as a line, or set DAT Row to an expression like 1 + floor(t/7.5) to step through rows over time.' },
    moviefileinTOP: { what: 'Plays a video file or shows an image file (MP4, MOV, WebM, PNG, JPG, GIF).', use: ['Footage and B-roll', 'Logos and photos', 'Content for projection mapping'], chain: 'moviefileinTOP > levelTOP > compositeTOP > outTOP', tip: 'H.264 MP4 plays everywhere. You can also drag a file onto the network to create one.' },
    videodeviceinTOP: { what: 'Live camera input from a webcam or the iPad camera.', use: ['Interactive mirrors', 'Live performance visuals', 'Edge and feedback effects on people'], chain: 'videodeviceinTOP > edgeTOP > feedbackTOP > outTOP', tip: 'Press Start Device and allow access. Camera can switch between user (front) and environment (back).' },
    screengrabTOP: { what: 'Captures a screen, window or browser tab as a live image (desktop browsers).', use: ['Bring slides or a website into a composition', 'Picture-in-picture', 'Live remixing of another app'], chain: 'screengrabTOP > cornerpinTOP > outTOP', tip: 'Not available on iPad. Press Start Device and choose what to share.' },
    glslTOP: { what: 'Runs your own pixel shader, with up to 4 image inputs. Shadertoy mainImage code works as-is.', use: ['Custom effects and generative art', 'Raymarching 3D scenes', 'Porting shaders from Shadertoy'], chain: 'sliderCOMP ~> glslTOP.u0 > bloomTOP > outTOP', tip: 'u0 to u3 accept expressions. Compile errors show on the node.' },
    choptoTOP: { what: 'Draws CHOP channels as an image: waveform, bars, radial scope, or raw data.', use: ['Audio visualizers', 'Spectrum bars', 'Debugging what a CHOP is doing'], chain: 'audiofileinCHOP > audiospectrumCHOP ~> choptoTOP.chop > feedbackTOP', tip: 'Radial mode with feedback makes a classic audio tunnel.' },
    levelTOP: { what: 'Adjusts brightness, contrast, gamma, black level and opacity, or inverts the image.', use: ['Dim a background so text reads', 'Punch up contrast', 'Fade a layer in or out'], chain: 'noiseTOP > levelTOP > compositeTOP', tip: 'Drive Opacity with an expression to fade a layer.' },
    hsvadjustTOP: { what: 'Shifts hue and scales saturation and value.', use: ['Color shifts over time', 'Desaturate to black and white', 'Boost a dull image'], chain: 'videodeviceinTOP > hsvadjustTOP > outTOP', tip: 'Hue Offset = t*20 cycles through the rainbow.' },
    blurTOP: { what: 'Gaussian blur on the GPU, with adjustable size and passes.', use: ['Soft backgrounds', 'Depth-of-field look', 'Glow, combined with Add'], chain: 'moviefileinTOP > blurTOP > compositeTOP', tip: 'Large blurs at high resolution are costly. Raise passes before size.' },
    transformTOP: { what: 'Moves, scales and rotates an image, with edge modes (zero, hold, repeat, mirror).', use: ['Position a layer', 'Spin and zoom animations', 'Tile an image with repeat'], chain: 'circleTOP > transformTOP > feedbackTOP', tip: 'Extend: repeat plus Scale below 1 makes instant tiling.' },
    kaleidoTOP: { what: 'Folds the image into kaleidoscope segments or mirror symmetry.', use: ['Mandala visuals', 'Symmetric VJ loops', 'Turning any footage abstract'], chain: 'feedbackTOP > kaleidoTOP > outTOP', tip: 'Animate Rotate slowly. 6 to 12 segments look classic.' },
    compositeTOP: { what: 'Layers any number of inputs with a blend mode. Input 0 is the bottom layer.', use: ['Stacking background, graphics and text', 'Glow with Add or Screen', 'Masks with Multiply'], chain: 'noiseTOP > compositeTOP ; textTOP > compositeTOP > outTOP', tip: 'Wire order equals layer order. Rewire to restack.' },
    crossTOP: { what: 'Crossfades between two inputs.', use: ['Transitions between scenes', 'Blend two looks', 'A/B comparisons'], chain: 'moviefileinTOP > crossTOP ; noiseTOP > crossTOP > outTOP', tip: 'Drive Cross with a Lag CHOP for smooth timed transitions.' },
    switchTOP: { what: 'Picks one of many inputs by index. With Blend on, fractional indices crossfade.', use: ['Scene switching', 'Slide decks with image slides', 'Live input selection'], chain: 'countCHOP ~> switchTOP.index > outTOP', tip: 'Index 1.5 with Blend on is halfway between inputs 1 and 2.' },
    displaceTOP: { what: 'Warps input 0 by the colors (or luminance) of input 1.', use: ['Heat haze and liquid warps', 'Glitch distortion', 'Noise-driven motion on still images'], chain: 'moviefileinTOP > displaceTOP ; noiseTOP > displaceTOP > outTOP', tip: 'Use a slow Noise TOP as input 1 and keep Amount small (0.02 to 0.05).' },
    edgeTOP: { what: 'Finds edges (Sobel) and draws them as lines, optionally over the original.', use: ['Outline and sketch looks', 'Webcam silhouettes', 'Feeding lines into feedback'], chain: 'videodeviceinTOP > edgeTOP > feedbackTOP', tip: 'Composite Over Input mixes the edges back over the image.' },
    thresholdTOP: { what: 'Turns the image into two colors at a brightness cutoff.', use: ['Graphic posters', 'Masks', 'High-contrast looks'], chain: 'noiseTOP > thresholdTOP > outTOP', tip: 'Add Softness for smooth, liquid edges.' },
    lookupTOP: { what: 'Gradient-maps brightness to color, using a built-in palette (ember, fire, ocean, neon, dusk, forest, ink, rainbow), three custom colors, or a Ramp TOP in input 1.', use: ['Colorize noise', 'Brand palettes', 'Scene-by-scene color moods'], chain: 'noiseTOP > lookupTOP > outTOP', tip: 'Animate Shift (for example floor(t/7.5)*0.22) to change mood per scene.' },
    rgbshiftTOP: { what: 'Splits red, green and blue apart (chromatic aberration), linearly or radially.', use: ['Glitch accents', 'Lens realism', 'Hits on beats'], chain: 'kaleidoTOP > rgbshiftTOP > outTOP', tip: 'Drive Amount with the onset channel of Audio Analyze for hits.' },
    pixelateTOP: { what: 'Mosaics the image into cells, with optional color posterizing and round dots.', use: ['Retro 8-bit look', 'LED-wall simulation', 'Censor or abstract'], chain: 'moviefileinTOP > pixelateTOP > outTOP', tip: 'Shape: dot makes an LED-matrix look.' },
    filmTOP: { what: 'Adds finishing grain, vignette and scanlines.', use: ['Premium filmic finish', 'Hide banding in gradients', 'CRT style'], chain: 'compositeTOP > filmTOP > outTOP', tip: 'Small amounts (grain 0.03 to 0.05) usually look best.' },
    feedbackTOP: { what: 'Blends the input with its own previous frame, slightly zoomed, rotated, faded and hue-shifted, so motion leaves trails.', use: ['Trails and light painting', 'Infinite tunnels', 'Smears and echoes'], chain: 'circleTOP > feedbackTOP > bloomTOP > outTOP', tip: 'Feedback near 0.95 with Zoom 1.01 makes a tunnel. Press Reset to clear it.' },
    bloomTOP: { what: 'Makes bright areas glow.', use: ['Neon and light', 'Making 3D renders feel cinematic', 'Soft halation'], chain: 'renderTOP > bloomTOP > outTOP', tip: 'Lower Threshold to make more of the image glow.' },
    cornerpinTOP: { what: 'Pins the four corners of the image onto any quadrilateral, for projection mapping.', use: ['Mapping onto walls, boxes and screens', 'Perspective tricks', 'Keystone correction'], chain: 'moviefileinTOP > cornerpinTOP > outTOP', tip: 'Select it and drag the four handles in the viewer. Show Grid helps alignment.' },
    nullTOP: { what: 'Passes the image through unchanged.', use: ['A stable name to reference', 'A tidy end point of a chain', 'Splitting a chain into branches'], chain: 'bloomTOP > nullTOP > outTOP', tip: 'Reference null1 in other places. You can then rebuild the chain before it without breaking links.' },
    outTOP: { what: 'The final output of your project. The Out TOP with the Display flag is what Perform shows and Record exports.', use: ['The last operator in every project', 'Fullscreen review', 'Export'], chain: 'filmTOP > outTOP', tip: 'Double-click it, or press F, to open the output in full view. Press F or Esc to shrink it back.' },
    renderTOP: { what: 'Draws the 3D scene: Geometry COMPs seen through a Camera COMP and lit by Light COMPs.', use: ['Any 3D visual', 'Product-style turntables', 'Point clouds and particles'], chain: 'cameraCOMP ~> renderTOP.camera > bloomTOP > outTOP', tip: 'Geometry and Lights accept * for all, or names separated by spaces.' },

    // ---------- CHOP ----------
    constantCHOP: { what: 'Holds up to four named channels whose values you set, or compute with expressions.', use: ['Named control values', 'Combine several sources with max()', 'Make a trigger from keys and buttons'], chain: 'constantCHOP > countCHOP', tip: 'value0 = max(op(\'keyboardin1\')[\'arrowright\'], op(\'button1\')[0]) merges two triggers.' },
    lfoCHOP: { what: 'A low-frequency oscillator: sine, triangle, square, saw, ramp or pulse.', use: ['Breathing, pulsing and swaying motion', 'Rhythmic animation locked to BPM', 'Looping parameter sweeps'], chain: 'lfoCHOP ~> circleTOP.radius', tip: 'Beat Sync makes Frequency mean cycles per beat.' },
    noiseCHOP: { what: 'Smooth random channels for organic, non-repeating motion.', use: ['Camera drift', 'Wandering positions', 'Natural flicker'], chain: 'noiseCHOP ~> transformTOP.tx', tip: 'Channels 3 gives you x, y and z in one operator.' },
    beatCHOP: { what: 'A tempo clock from the project BPM: beat ramp, pulse, beat count and bar ramp.', use: ['Hits on every beat', 'Tempo-locked transitions', 'Fallback rhythm when no audio is playing'], chain: 'beatCHOP ~> levelTOP.bright', tip: 'Set BPM with the Tap button. The pulse channel decays after each beat.' },
    mouseinCHOP: { what: 'Pointer or touch position over the viewer and Perform window (0 to 1) and button state.', use: ['Interactive installations', 'Testing ideas by hand', 'Drawing with feedback'], chain: 'mouseinCHOP ~> circleTOP.cx', tip: 'Range −1 to 1 centers the values on zero.' },
    keyboardinCHOP: { what: 'One channel per key you list, 1 while held. Fast taps are always caught.', use: ['Advance slides with the arrow keys', 'Trigger effects live', 'Hotkeys in Perform mode'], chain: 'keyboardinCHOP > countCHOP', tip: 'Key names: a, s, space, arrowright, arrowleft, enter.' },
    midiinCHOP: { what: 'Reads MIDI controllers (knobs, faders, pads) as channels such as cc1 and note60.', use: ['Hands-on VJ control', 'Map knobs to effects', 'Trigger scenes from pads'], chain: 'midiinCHOP ~> feedbackTOP.decay', tip: 'Chrome, Edge or Firefox only, not Safari or iPad. Press Connect MIDI, then move a knob.' },
    gamepadCHOP: { what: 'Axes and buttons from a game controller.', use: ['Cheap wireless live controller', 'Joystick-driven cameras', 'Playful installations'], chain: 'gamepadCHOP ~> cameraCOMP.az', tip: 'Press a button on the pad first so the browser sees it.' },
    audiofileinCHOP: { what: 'Plays an audio file in sync with the timeline and passes its sound to analysis operators.', use: ['Soundtrack for an exported video', 'Music-reactive visuals', 'Ambient beds for presentations'], chain: 'audiofileinCHOP > audioanalyzeCHOP', tip: 'Sync to Timeline keeps audio and scrubbing together. Tick Include audio when recording.' },
    audiodeviceinCHOP: { what: 'Live microphone or line input.', use: ['Live gigs', 'Room-reactive installations', 'Voice-reactive visuals'], chain: 'audiodeviceinCHOP > audioanalyzeCHOP', tip: 'Leave Monitor off to avoid feedback squeal.' },
    audiooscCHOP: { what: 'A synthesized test tone or drone (sine, square, saw, triangle).', use: ['Testing audio chains', 'Simple drones', 'Sound for quick sketches'], chain: 'audiooscCHOP > audiospectrumCHOP', tip: 'Keep Volume low because it plays out loud.' },
    audiospectrumCHOP: { what: 'Splits audio into frequency bins (FFT) from bass to treble, each 0 to 1.', use: ['Spectrum bars', 'Radial scopes', 'Per-band animation'], chain: 'audiofileinCHOP > audiospectrumCHOP ~> choptoTOP.chop', tip: 'Logarithmic spacing looks more musical.' },
    audioanalyzeCHOP: { what: 'Outputs simple, ready-to-use channels: level, low, mid, high and onset (kick).', use: ['The fastest way to go audio-reactive', 'Pulse on kicks', 'Brightness from loudness'], chain: 'audiofileinCHOP > audioanalyzeCHOP ~> circleTOP.radius', tip: 'Use op(\'analyze1\')[\'low\'] for bass and [\'onset\'] for hits.' },
    mathCHOP: { what: 'Combines inputs (add, multiply, average, max, min), then offsets, scales and remaps ranges.', use: ['Turn 0–1 into 20–80', 'Mix several controls', 'Invert or clamp a value'], chain: 'lfoCHOP > mathCHOP ~> transformTOP.rotate', tip: 'Remap Range is the no-code alternative to fit().' },
    lagCHOP: { what: 'Smooths changes over time, with separate rise and fall times.', use: ['Ease slide transitions', 'Tame jittery audio', 'Make controls feel weighty'], chain: 'countCHOP > lagCHOP ~> crossTOP.cross', tip: 'Short Lag Up with a long Lag Down makes a punchy attack with a slow decay.' },
    speedCHOP: { what: 'Accumulates its input over time (units per second), like a speedometer feeding an odometer.', use: ['Rotation that speeds up with music', 'Scrolling driven by level', 'Continuous travel'], chain: 'audioanalyzeCHOP > speedCHOP ~> transformTOP.rotate', tip: 'Wrap At 360 keeps rotation values tidy.' },
    countCHOP: { what: 'Counts each time its first input switches from off to on, with optional clamp or loop limits.', use: ['Slide number', 'Scene index', 'Counting button presses'], chain: 'keyboardinCHOP > countCHOP ~> textTOP.row', tip: 'Limit: loop with Min 1 and Max 4 cycles through four slides.' },
    triggerCHOP: { what: 'Fires an attack, hold and release envelope when its input rises past a threshold.', use: ['Flashes on hits', 'Timed reveals', 'Turning a button into a smooth envelope'], chain: 'audioanalyzeCHOP > triggerCHOP ~> levelTOP.bright', tip: 'Press Fire to test it by hand.' },
    mergeCHOP: { what: 'Combines channels from many CHOPs into one operator.', use: ['One tidy control bus', 'Feeding several channels into CHOP to TOP', 'Organizing'], chain: 'lfoCHOP > mergeCHOP ; noiseCHOP > mergeCHOP', tip: 'Then use Select CHOP to pull channels out by name.' },
    selectCHOP: { what: 'Picks channels by name (wildcards allowed) from its input or any CHOP, optionally renaming them.', use: ['Pull "low" from Audio Analyze', 'Rename channels', 'Clean up a busy CHOP'], chain: 'audioanalyzeCHOP > selectCHOP', tip: 'Patterns like n* or "low mid" work.' },
    dattoCHOP: { what: 'Converts numbers in a Table DAT (names in row 0, values in row 1) or JSON into channels.', use: ['Data from a web API', 'Arduino sensor values', 'Hand-entered keyframes'], chain: 'serialDAT ~> dattoCHOP.dat', tip: 'Pairs with Web Client and Serial DATs.' },
    nullCHOP: { what: 'Passes channels through unchanged.', use: ['A stable name to reference', 'End of a control chain'], chain: 'lagCHOP > nullCHOP', tip: 'Reference the null, not the middle of a chain.' },

    // ---------- SOP ----------
    sphereSOP: { what: 'A UV sphere.', use: ['Planets and orbs', 'Particle emitters', 'Material previews'], chain: 'sphereSOP > noiseSOP ~> geometryCOMP.sop', tip: 'More rows and columns give smoother noise displacement.' },
    boxSOP: { what: 'A box with flat-shaded faces.', use: ['Instanced cubes', 'Architectural blocks', 'Simple props'], chain: 'boxSOP ~> geometryCOMP.sop', tip: 'Use it as the shape in an instancing setup.' },
    torusSOP: { what: 'A torus (donut).', use: ['Rings and sculptures', 'Logos in 3D', 'Twist and noise experiments'], chain: 'torusSOP > twistSOP ~> geometryCOMP.sop', tip: 'Works well with PBR metal.' },
    gridSOP: { what: 'A subdivided flat plane (floor or wall).', use: ['Floors', 'Terrain with Noise SOP', 'Instance points'], chain: 'gridSOP > noiseSOP ~> geometryCOMP.inst', tip: 'Rows × Columns sets how many points it has.' },
    tubeSOP: { what: 'A cylinder or cone.', use: ['Columns and pillars', 'Tunnels', 'Cones and lampshades'], chain: 'tubeSOP > twistSOP ~> geometryCOMP.sop', tip: 'Set Top Radius to 0 for a cone.' },
    pointcloudSOP: { what: 'Generates thousands of points: box, sphere, shell, ring, or a spiral galaxy.', use: ['Galaxies and starfields', 'Data-art clouds', 'Instance positions'], chain: 'pointcloudSOP ~> geometryCOMP.sop ; cameraCOMP ~> renderTOP.camera > outTOP', tip: 'Render as points with additive blending and a Constant MAT.' },
    fileinSOP: { what: 'Imports .obj meshes, .ply point clouds and .xyz/.csv point files.', use: ['Bring in models and scans', 'Photogrammetry point clouds', 'Logos as 3D'], chain: 'fileinSOP > transformSOP ~> geometryCOMP.sop', tip: 'Center & Normalize fits any model to a sensible size.' },
    choptoSOP: { what: 'Turns CHOP samples into a line, circle or spiral of points.', use: ['3D audio waveforms', 'Spectrum rings', 'Data lines'], chain: 'audiospectrumCHOP ~> choptoSOP.chop ~> geometryCOMP.sop', tip: 'Draw it as lines with a Constant MAT.' },
    particleSOP: { what: 'A particle system emitting from its input\'s points, with gravity, drag, wind and turbulence.', use: ['Sparks, dust and snow', 'Fountains', 'Audio-reactive bursts'], chain: 'sphereSOP > particleSOP ~> geometryCOMP.sop', tip: 'Drive Birth Rate with an audio level for bursts on hits.' },
    transformSOP: { what: 'Moves, rotates and scales geometry.', use: ['Place a model', 'Stack transforms', 'Animate parts'], chain: 'fileinSOP > transformSOP', tip: 'For whole-object animation, animating the Geometry COMP is cheaper.' },
    noiseSOP: { what: 'Pushes points around with 3D noise, along normals or freely, and can animate.', use: ['Blobby organic shapes', 'Terrain', 'Wavy instance fields'], chain: 'torusSOP > noiseSOP ~> geometryCOMP.sop', tip: 'Speed animates it. Recompute Normals keeps lighting right.' },
    twistSOP: { what: 'Twists and tapers geometry along Y.', use: ['Twisted sculptures', 'Spiral columns', 'Animated wringing'], chain: 'tubeSOP > twistSOP', tip: 'Animate Twist with sin(t)*60.' },
    mergeSOP: { what: 'Combines several SOPs into one geometry (same primitive type).', use: ['Join parts', 'One object from many shapes'], chain: 'sphereSOP > mergeSOP ; boxSOP > mergeSOP', tip: 'Mesh with mesh, points with points.' },
    nullSOP: { what: 'Passes geometry through unchanged.', use: ['A stable reference name', 'End of a modeling chain'], chain: 'noiseSOP > nullSOP ~> geometryCOMP.sop', tip: '' },

    // ---------- MAT ----------
    constantMAT: { what: 'Flat, unlit color, ideal for points, lines and glowing shapes.', use: ['Point clouds and particles', 'Glowing wireframes', 'Graphic flat 3D'], chain: 'constantMAT ~> geometryCOMP.mat', tip: 'Soft Points makes round, soft-edged points.' },
    wireframeMAT: { what: 'Draws the edges of the mesh as lines.', use: ['Technical, blueprint looks', 'Retro vector graphics', 'Seeing the mesh'], chain: 'wireframeMAT ~> geometryCOMP.mat', tip: 'Add a Bloom TOP for neon vectors.' },
    phongMAT: { what: 'Classic shading with diffuse color plus a specular highlight.', use: ['Plastic and clay looks', 'Fast, simple lighting'], chain: 'phongMAT ~> geometryCOMP.mat', tip: 'Needs Light COMPs in the scene.' },
    pbrMAT: { what: 'Physically based shading: base color, metallic and roughness, plus a sky/ground environment light.', use: ['Realistic metal, plastic and ceramics', 'Product shots', 'Premium sculptures'], chain: 'pbrMAT ~> geometryCOMP.mat', tip: 'Metallic 0.85 with Roughness 0.25 reads as polished metal.' },
    normalMAT: { what: 'Colors the surface by its normal direction.', use: ['Debugging shapes', 'Iridescent stylized look'], chain: 'normalMAT ~> geometryCOMP.mat', tip: '' },
    glslMAT: { what: 'Your own surface shader for full control of the look.', use: ['Custom stylized shading', 'Animated surface patterns'], chain: 'glslMAT ~> geometryCOMP.mat', tip: 'u0, u1 and uC0 take expressions.' },

    // ---------- COMP ----------
    geometryCOMP: { what: 'A renderable 3D object: links a SOP (shape) and a MAT (look), with position, rotation and scale. It can instance its shape onto another SOP\'s points.', use: ['Every visible 3D object', 'Spinning turntables (Rotate Y = t*15)', 'Instancing thousands of copies'], chain: 'torusSOP ~> geometryCOMP.sop ; pbrMAT ~> geometryCOMP.mat', tip: 'Draw As: points with Blending: add for glowing point clouds.' },
    cameraCOMP: { what: 'The viewpoint for a Render TOP. Orbit mode circles a target, and Position mode places it freely.', use: ['Orbiting product shots', 'Fly-throughs', 'Orthographic graphic looks'], chain: 'cameraCOMP ~> renderTOP.camera', tip: 'Orbit Azimuth = t*10 makes a slow turntable.' },
    lightCOMP: { what: 'A point or directional light for Phong and PBR materials (up to 4 per render).', use: ['Key and rim lighting', 'Colored mood light', 'Animated light sweeps'], chain: 'lightCOMP ~> renderTOP.lights', tip: 'A warm key light plus a cool rim light reads as cinematic.' },
    sliderCOMP: { what: 'An on-screen slider for control panels and Perform mode. Its value is op(\'slider1\')[0].', use: ['Live control during shows', 'Tuning while presenting', 'Client-facing controls'], chain: 'sliderCOMP ~> glslTOP.u0', tip: 'Right-click any number and choose "with new Slider" to make one automatically.' },
    buttonCOMP: { what: 'A momentary or toggle button for panels and Perform mode.', use: ['Next/Previous slide', 'Trigger an effect', 'Scene on/off'], chain: 'buttonCOMP ~> constantCHOP.value0 > countCHOP', tip: 'Pair with a Count CHOP to step through slides.' },
    xypadCOMP: { what: 'A two-axis touch pad. op(\'xypad1\')[0] is x and [1] is y.', use: ['Move a light or object by hand', 'Two parameters at once', 'Expressive live control'], chain: 'xypadCOMP ~> transformTOP.tx', tip: 'Great on iPad in Perform mode (press C for controls).' },
    baseCOMP: { what: 'A container that holds its own network, to keep big projects organized.', use: ['Group a scene', 'Reusable effects', 'A tidy top level'], chain: 'baseCOMP', tip: 'Select nodes and press Shift+C to collapse them. Press I to dive in, U to go up.' },

    // ---------- DAT ----------
    textDAT: { what: 'Free text: notes, copy, GLSL code or JSON (parsed automatically).', use: ['Project notes', 'Long copy for Text TOPs', 'Shader code shared between operators'], chain: 'textDAT ~> textTOP.dat', tip: 'op(\'text1\').json gives you parsed JSON.' },
    tableDAT: { what: 'An editable grid of cells. Paste straight from a spreadsheet with Edit as text.', use: ['Slide and scene copy', 'Lists of names and values', 'Data for charts'], chain: 'tableDAT ~> textTOP.dat > compositeTOP', tip: 'Row 0 is your header. Read a cell with op(\'table1\').cell(row, col).' },
    scriptDAT: { what: 'JavaScript that runs at start (onStart) and every frame (onFrame) to drive parameters, logic and sequencing.', use: ['Auto-advance scenes', 'Complex logic', 'Sending data to the outside world'], chain: 'scriptDAT', tip: 'Inside: op(), log(), kiln.play(), kiln.seek(), t, frame.' },
    webclientDAT: { what: 'Fetches from a web API (GET/POST). JSON responses are parsed into .json, and CSV/TSV bodies are split into columns by the Delimiter parameter, so DAT to CHOP reads them as numbers.', use: ['Live data (weather, air quality, counts, tickers)', 'Content from a CMS', 'Any API that sends no CORS headers, through Via Relay'], chain: 'webclientDAT ~> dattoCHOP.dat ~> circleTOP.radius', tip: 'Set Auto Refresh to poll. If the request is refused, the API has no CORS headers: start tools/relay.js, connect a WebSocket DAT and choose it in Via Relay. In a delimited table, row 0 becomes channel names and row 1 the values.' },
    websocketDAT: { what: 'A two-way WebSocket connection — Kiln\'s bridge to OSC, DMX/Art-Net, Ableton and sensors through the relay, and to arbitrary HTTP APIs through the relay\'s proxy.', use: ['Lighting control', 'Talking to other apps', 'Remote control from a phone', 'Proxying a blocked API'], chain: 'websocketDAT ~> dattoCHOP.dat', tip: 'Run tools/relay.js, then connect to ws://localhost:9980. kiln.send(name, msg) fires and forgets; kiln.request(name, msg) returns a promise resolved by the reply carrying the same id.' },
    serialDAT: { what: 'Talks to an Arduino or Pico over USB with Web Serial (Chrome/Edge desktop).', use: ['Sensors: distance, light, buttons', 'Driving LEDs and motors', 'Physical installations'], chain: 'serialDAT ~> dattoCHOP.dat', tip: 'Have the board print lines like 512,300,1.' },
  };

  /* ------------------------------------------------------------------ */
  // Connection recipes. Each can be built into the current network.
  B.recipes = [
    { title: 'Colorful animated background', tags: ['TOP'], chain: 'noiseTOP > lookupTOP > levelTOP > outTOP', steps: ['Noise TOP makes moving grey clouds.', 'Lookup TOP maps them to a palette.', 'Level TOP dims them so text reads on top.'] },
    { title: 'Title over a background', tags: ['TOP'], chain: 'noiseTOP > compositeTOP ; textTOP > compositeTOP > filmTOP > outTOP', steps: ['Wire the background into Composite first (input 0 is the bottom layer).', 'Wire the Text TOP second so it sits on top.', 'Finish with Film TOP.'] },
    { title: 'Breathing circle (LFO drives a parameter)', tags: ['CHOP', 'TOP'], chain: 'lfoCHOP ~> circleTOP.radius > outTOP', steps: ['Add an LFO CHOP.', 'On the Circle TOP, right-click Radius → Animate → with new LFO CHOP. Or type op(\'lfo1\')[0]*0.1 + 0.2.'] },
    { title: 'Feedback trails', tags: ['TOP'], chain: 'circleTOP > transformTOP > feedbackTOP > bloomTOP > outTOP', steps: ['Move the circle with Transform (tx = sin(t)*0.3).', 'Feedback leaves a trail. Feedback 0.95, Zoom 1.01.', 'Bloom makes it glow.'] },
    { title: 'Audio-reactive pulse', tags: ['CHOP', 'TOP'], chain: 'audiofileinCHOP > audioanalyzeCHOP ~> circleTOP.radius > outTOP', steps: ['Choose a song in Audio File In.', 'Audio Analyze outputs level, low, mid, high and onset.', 'Circle Radius = 0.1 + op(\'analyze1\')[\'low\']*0.2.'] },
    { title: 'Spectrum visualizer', tags: ['CHOP', 'TOP'], chain: 'audiofileinCHOP > audiospectrumCHOP ~> choptoTOP.chop > feedbackTOP > kaleidoTOP > outTOP', steps: ['Audio Spectrum splits sound into bins.', 'CHOP to TOP draws them (radial mode).', 'Feedback and Kaleido turn the bars into a tunnel.'] },
    { title: 'Slides from a table, advanced by keys', tags: ['DAT', 'CHOP', 'TOP'], chain: 'keyboardinCHOP > countCHOP ~> textTOP.row > outTOP ; tableDAT ~> textTOP.dat', steps: ['Table DAT holds the copy (row 0 is the header).', 'Keyboard In with Keys: arrowright.', 'Count CHOP, Limit loop, Min 1, Max = number of slides.', 'Text TOP: DAT Source = table, DAT Row = op(\'count1\')[0].'] },
    { title: 'Timed scenes (one-pager video)', tags: ['DAT', 'TOP'], chain: 'tableDAT ~> textTOP.dat > compositeTOP > outTOP', steps: ['Text TOP DAT Row = 1 + min(3, floor(t/7.5)) for four 7.5-second scenes.', 'Font Alpha = smoothstep(0,0.7,mod(t,7.5)) * (1-smoothstep(6.8,7.5,mod(t,7.5))) for fades.', 'Record → Whole timeline from start.'] },
    { title: 'Smooth transition between two looks', tags: ['TOP', 'CHOP'], chain: 'noiseTOP > crossTOP ; patternTOP > crossTOP > outTOP ; constantCHOP > lagCHOP ~> crossTOP.cross', steps: ['Cross TOP blends input 0 (noise) to input 1 (pattern).', 'Set Value 0 on the Constant CHOP to 0 or 1, or set it to op(\'button1\')[0] with a toggle Button COMP.', 'Lag CHOP eases the change, so the look fades instead of snapping.'] },
    { title: 'Spinning metal sculpture (3D basics)', tags: ['SOP', 'MAT', 'COMP', 'TOP'], chain: 'torusSOP > noiseSOP ~> geometryCOMP.sop ; pbrMAT ~> geometryCOMP.mat ; cameraCOMP ~> renderTOP.camera > bloomTOP > outTOP ; lightCOMP', steps: ['SOP = shape, MAT = look, Geometry COMP = object.', 'Camera COMP and Light COMP set the view and lighting.', 'Render TOP draws it. Bloom adds polish.', 'Geometry Rotate Y = t*15 spins it.'] },
    { title: 'Glowing point-cloud galaxy', tags: ['SOP', 'MAT', 'COMP', 'TOP'], chain: 'pointcloudSOP ~> geometryCOMP.sop ; constantMAT ~> geometryCOMP.mat ; cameraCOMP ~> renderTOP.camera > feedbackTOP > bloomTOP > outTOP', steps: ['Point Cloud: Distribution galaxy.', 'Geometry COMP: Draw As points, Blending add.', 'Feedback adds star trails.'] },
    { title: 'Instancing: thousands of cubes', tags: ['SOP', 'COMP'], chain: 'gridSOP > noiseSOP ~> geometryCOMP.inst ; boxSOP ~> geometryCOMP.sop ; cameraCOMP ~> renderTOP.camera > outTOP', steps: ['Grid SOP gives the positions, and Noise SOP makes them wave.', 'Geometry COMP: SOP = box, Instance SOP = the noise SOP.', 'Instance Scale sets the size of each copy.'] },
    { title: 'Webcam sketch mirror', tags: ['TOP'], chain: 'videodeviceinTOP > edgeTOP > feedbackTOP > hsvadjustTOP > outTOP', steps: ['Press Start Device on Video Device In.', 'Edge draws outlines, Feedback leaves echoes, HSV shifts the hue.'] },
    { title: 'Projection map a video', tags: ['TOP'], chain: 'moviefileinTOP > cornerpinTOP > outTOP', steps: ['Select Corner Pin and drag its 4 corners in the viewer to match the surface.', 'Press P to output fullscreen to the projector.'] },
    { title: 'Live control panel', tags: ['COMP', 'TOP'], chain: 'sliderCOMP ~> levelTOP.bright ; xypadCOMP ~> transformTOP.tx', steps: ['Add Slider, Button or XY Pad COMPs.', 'Reference them in parameters: op(\'slider1\')[0].', 'In Perform mode, press C to show the controls.'] },
    { title: 'Custom shader with a slider', tags: ['TOP', 'COMP'], chain: 'sliderCOMP ~> glslTOP.u0 > bloomTOP > outTOP', steps: ['Paste Shadertoy code into the GLSL TOP.', 'Use u0 in the code and set u0 = op(\'slider1\')[0].'] },
    { title: 'MIDI knob controls feedback', tags: ['CHOP', 'TOP'], chain: 'midiinCHOP ~> feedbackTOP.decay', steps: ['Press Connect MIDI and turn a knob. A channel like cc1 appears.', 'Feedback = fit(op(\'midiin1\')[\'cc1\'], 0, 1, 0.8, 0.99).'] },
    { title: 'Arduino sensor drives visuals', tags: ['DAT', 'CHOP'], chain: 'serialDAT ~> dattoCHOP.dat ~> circleTOP.radius', steps: ['The board prints values per line.', 'Serial DAT turns them into a table, and DAT to CHOP into channels.', 'Reference the channel in any parameter.'] },
    { title: 'Live data from an API that blocks browsers', tags: ['DAT', 'CHOP', 'TOP'], chain: 'websocketDAT ; webclientDAT ~> dattoCHOP.dat > smoothCHOP ~> textTOP.text', steps: ['Run node tools/relay.js, add a WebSocket DAT at ws://localhost:9980 and press Connect.', 'On Web Client DAT, paste the URL, set Auto Refresh (30–300s for public data) and pick that WebSocket DAT in Via Relay.', 'Leave Delimiter on Auto for CSV or TSV; JSON is parsed without it.', 'DAT to CHOP gives one channel per column — row 0 names them, row 1 is the current values.', 'Put Smooth or Lag between them so a value that updates every minute glides instead of snapping.', 'Data Readout TOP prints the number with a label and units on screen.'] },
  ];

  /* ------------------------------------------------------------------ */
  B.expressions = [
    ['t', 'Timeline time in seconds.', 'sin(t)'],
    ['frame', 'Timeline frame number.', 'frame % 60'],
    ['absTime', 'Seconds since Kiln opened (keeps running when paused).', 'absTime*0.1'],
    ['beat, bar, bpm', 'Beats and bars since the start, and the tempo.', 'pulse(beat, 0.15)'],
    ['progress', '0 → 1 across the whole timeline.', 'progress*360'],
    ['me', 'This operator.', 'me.name'],
    ["op('name')[0]", 'First channel of a CHOP or panel COMP.', "op('lfo1')[0]"],
    ["op('name')['chan']", 'A channel by name.', "op('analyze1')['low']"],
    ["op('table').cell(r, c)", 'A cell from a Table DAT.', "op('slides').cell(1, 0)"],
    ["ch('name', 'chan')", 'Shortcut for a channel value.', "ch('lfo1','chan1')"],
    ['noise(x, y, z)', 'Smooth noise between −1 and 1.', 'noise(t*0.3)'],
    ['fit(v, a, b, c, d)', 'Remap v from range a–b to range c–d.', 'fit(op(\'lfo1\')[0], 0, 1, 20, 80)'],
    ['pulse(x, w)', '1 for a short time at the start of each whole number of x.', 'pulse(beat, 0.1)'],
    ['tri(x), saw(x), sq(x)', 'Repeating waves from 0 to 1.', 'tri(t*0.5)'],
    ['smoothstep(a, b, x)', 'Smooth 0 → 1 as x goes from a to b. Good for fades.', 'smoothstep(0, 1, t)'],
    ['mix(a, b, k)', 'Blend from a to b by k (0–1).', 'mix(0.2, 0.8, progress)'],
    ['clamp(x, lo, hi)', 'Keep x inside a range.', 'clamp(t/5, 0, 1)'],
    ['mod(x, y)', 'Remainder that wraps, for loops within loops.', 'mod(t, 7.5)'],
    ['rand(seed)', 'Repeatable random 0–1 for a seed.', 'rand(floor(beat))'],
    ['Math', 'Everything in JavaScript Math: sin, cos, abs, floor, round, min, max, PI…', 'abs(sin(t*PI))'],
    ['{ … } in Text TOP', 'Live values inside text.', 'Time: {round(t)}s'],
  ];

  B.shortcuts = [
    ['Add operator (OP Create)', 'Tab · double-click empty space'], ['Wire', 'Drag output port → input port'],
    ['Cut a wire', 'Click it, then Delete or ×'], ['Delete', 'Delete / Backspace'],
    ['Copy · Paste · Duplicate', '⌘/Ctrl C · V · D'], ['Undo · Redo', '⌘/Ctrl Z · ⇧Z'],
    ['Save · Open', '⌘/Ctrl S · O'], ['Select all', '⌘/Ctrl A'], ['Frame all nodes', 'H / Home'],
    ['Display · Bypass flag', 'D · B'], ['Play / pause', 'Space'], ['Viewer: Selected · Output', '1 · 2'],
    ['Full view (enlarge viewer)', 'F · double-click Out TOP'], ['Shrink full view', 'F · Esc'],
    ['Perform mode', 'P / F1 (Esc exits, C controls)'], ['Record video', 'R'],
    ['Enter COMP · Go up', 'I · U'], ['Collapse to Base COMP', '⇧C'], ['Rename', 'F2'],
    ['Open the Bible', '? · Help → Kiln Bible'], ['Search the Bible', '/ while it is open'],
    ['Pan · Zoom', 'Drag empty space · wheel or pinch'], ['Box select', '⇧ drag'],
  ];
})();
