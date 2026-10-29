/* Kiln — bible-extra.js : Bible entries for the extra TD-style operators */
(function () {
  'use strict';
  const K = window.K, B = K.BIBLE;
  if (!B || !B.ops) return;

  Object.assign(B.ops, {
    /* ---------------- TOP ---------------- */
    chromakeyTOP: {
      what: 'Removes a chosen background color (green or blue screen) and outputs the foreground with a soft alpha matte. Chroma distance ignores brightness, Spill Suppress neutralizes colored fringes, and Show: matte displays the cut-out mask.',
      use: ['Drop a performer onto graphics', 'Replace a green-screen background with a Noise TOP', 'Build a live camera cut-out for feedback effects'],
      chain: 'videodeviceinTOP > chromakeyTOP > compositeTOP > outTOP',
      tip: 'Set Key Color by picking the screen color, raise Tolerance until the background disappears, then add Softness. If skin or clothes vanish, lower Tolerance. Use Show: matte to check the edge.',
    },
    vignetteTOP: {
      what: 'Darkens or tints the edges of the image with a smooth radial falloff. Center X/Y moves the light off axis, Radius sets where the falloff starts and Softness controls how gradual it is.',
      use: ['Focus the eye on the center', 'Give flat graphics a lit, cinematic edge', 'Animate the radius for a breathing pulse'],
      chain: 'noiseTOP > lookupTOP > vignetteTOP > outTOP',
      tip: 'Radius 0.8, Softness 0.5 and Amount 0.6 is a safe starting point. Set Edge Color to a deep blue rather than black for a cooler look.',
    },
    sharpenTOP: {
      what: 'An unsharp mask: compares the image to a slightly blurred copy and adds the difference back, making edges crisper. Radius is measured in pixels; Threshold ignores differences below a cutoff, protecting noise and flat areas.',
      use: ['Rescue soft footage', 'Make text and lines pop', 'Add crunch to pixel-art or dither looks'],
      chain: 'moviefileinTOP > sharpenTOP > levelTOP > outTOP',
      tip: 'Start at Amount 0.8 and Radius 1. Too much amount creates bright halos around high-contrast edges.',
    },
    gradientmapTOP: {
      what: 'Maps a chosen source (luminance, a color channel, average or alpha) onto a four-stop color gradient, with Gamma, Invert and Blend. This is the classic duotone/tritone colorizer.',
      use: ['Duotone and tritone posters', 'Re-color noise or video to a brand palette', 'Turn depth or luma maps into heat maps'],
      chain: 'moviefileinTOP > gradientmapTOP > compositeTOP > outTOP',
      tip: 'Luminance with a dark purple shadow, a hot mid and a cream highlight is a strong editorial look. Add a Lookup TOP after it to push the palette further.',
    },
    directionalblurTOP: {
      what: 'Multi-tap blur in three modes: linear streaks at an angle, radial streaks outward from a center, and spin streaks around a center. Samples controls smoothness; Length controls how far it smears.',
      use: ['Speed lines and motion streaks', 'Radial impact bursts on a beat', 'Dreamy spin transitions'],
      chain: 'circleTOP > directionalblurTOP > bloomTOP > outTOP',
      tip: 'Radial mode with a small Length and high Samples makes a clean zoom blur. Pair it with a Feedback TOP for tunnel trails.',
    },

    /* ---------------- CHOP ---------------- */
    envelopeCHOP: {
      what: 'Follows the outline of an incoming signal with separate Attack (how fast it rises) and Release (how slowly it falls). Absolute Input rectifies audio first. Output channels keep their names.',
      use: ['Audio-reactive brightness without flicker', 'Smooth scale or hue from a waveform', 'Driving feedback safely from sound'],
      chain: 'audiofileinCHOP > envelopeCHOP ~> levelTOP.bright',
      tip: 'Attack 0.02 and Release 0.3 feels musical. Longer release gives a slow glow; shorter release snaps back on every hit.',
    },
    smoothCHOP: {
      what: 'Averages channels with a gaussian or box window. Multi-sample channels (spectra, waveforms) smooth across samples; single-value controls smooth over time, giving a moving average without setup.',
      use: ['De-flicker audio spectra', 'Average noisy sensor channels', 'Rolling means of control signals'],
      chain: 'audiospectrumCHOP > smoothCHOP > choptoTOP > outTOP',
      tip: 'Gaussian with Window 5–9 keeps shapes readable. Box with a high window is useful for long, glassy averages.',
    },
    quantizeCHOP: {
      what: 'Snaps values to a fixed number of steps per unit, with an Offset and round, floor or ceil modes. The result is stepped, digital motion instead of smooth values.',
      use: ['Stop-motion and pixel-style motion', 'Stepped fades and feedback decay', 'Turning continuous sensors into discrete states'],
      chain: 'lfoCHOP > quantizeCHOP ~> circleTOP.radius',
      tip: 'Steps 4–8 is chunky but still readable. Combine with a Lag CHOP after it if you want each jump to glide.',
    },
    sampleholdCHOP: {
      what: 'Holds the input steady and updates it at a fixed interval, on rising edges of the last channel (trigger mode), or when a named channel crosses a threshold. Values stay frozen between updates.',
      use: ['Robotic stepped motion from an LFO', 'Random-feeling gates on a beat', 'Holding MIDI values until a hit'],
      chain: 'noiseCHOP > sampleholdCHOP ~> transformTOP.rotate',
      tip: 'Time mode with Interval 0.125 at 120 BPM updates every 16th note. Channel mode with a Keyboard In gate gives hand-triggered changes.',
    },
    stepseqCHOP: {
      what: 'A tempo-synced step sequencer. Type a space-separated list of values; it walks through them and outputs value, index, phase and gate. Glide smooths the jump between steps.',
      use: ['Rhythmic brightness and scale patterns', 'Melodic-looking drive from a list of numbers', 'Beat-synced scene changes'],
      chain: 'stepseqCHOP ~> levelTOP.bright ; stepseqCHOP ~> hsvadjustTOP.hue',
      tip: 'Keep Glide at 0 for hard steps, 0.05–0.15 for slides. Gate Width shapes the pulse when it drives a Trigger or Switch.',
    },

    /* ---------------- SOP ---------------- */
    lineSOP: {
      what: 'A straight line made of evenly spaced points, centered on the origin along X, Y or Z. Close Loop joins the last point back to the first.',
      use: ['Rails and seams for instancing', 'Basis geometry for Polyline', 'Simple scanlines in 3D'],
      chain: 'lineSOP ~> geometryCOMP.sop ; pbrMAT ~> geometryCOMP.mat',
      tip: 'Set Points high enough for smooth sweeps, then drive Length with an expression for expanding lines.',
    },
    spiralSOP: {
      what: 'A spiral or helix line. Radius sets the start size, Height lifts it into a coil, Turns sets how many times it winds and Taper narrows the radius toward the end.',
      use: ['Helix staircases and ribbons', 'Particle emitters along a coil', 'Wireframe spirals around a render'],
      chain: 'spiralSOP ~> geometryCOMP.sop ; constantMAT ~> geometryCOMP.mat ; renderTOP > outTOP',
      tip: 'Height 0 gives a flat spiral for 2D-looking graphics. Animate Turns slowly for a winding motion.',
    },
    polylineSOP: {
      what: 'Connects the points of its input geometry in order with line segments. Close Loop joins the ends, and Point Stride skips points to simplify or dot the path.',
      use: ['Connecting point clouds into paths', 'Drawing lines through tracked points', 'Turning particle positions into traces'],
      chain: 'noiseSOP > polylineSOP > geometryCOMP > renderTOP > outTOP',
      tip: 'Use Stride 2–6 for lighter, sketchier paths. Combine with CHOP to SOP for audio waveforms.',
    },
    torusknotSOP: {
      what: 'A (p, q) torus knot swept with a round tube. P and Q set the knot pattern, Radius sets the overall size, Coil Radius controls how far the knot swings and Tube Radius controls thickness.',
      use: ['Sculptural wireframe centerpieces', 'Metallic loops for motion graphics', 'Geometry for instanced particles'],
      chain: 'torusknotSOP ~> geometryCOMP.sop ; pbrMAT ~> geometryCOMP.mat ; cameraCOMP ~> renderTOP.camera > outTOP',
      tip: 'Try P 2 / Q 3, P 3 / Q 4 or P 5 / Q 2. Raise Segments before Sides for smoother curves.',
    },

    /* ---------------- DAT ---------------- */
    jsonDAT: {
      what: 'Parses JSON text into a live object, text and key/value table. Path drills in with dots and brackets (scenes.1.bpm or items[0].name); invalid JSON shows a warning.',
      use: ['API responses and config files', 'Structured copy for Text TOPs', 'Driving channels from nested data'],
      chain: 'jsonDAT ~> textTOP.dat ; jsonDAT > dattoCHOP > outTOP',
      tip: 'Use Path scenes.0.name for one field, or leave Path empty and read cells with op(\'json1\').cell(1, 1).',
    },
    mergeDAT: {
      what: 'Combines several DATs either by stacking their rows or by putting their columns side by side. Skip Repeated Headers keeps one header row when appending tables.',
      use: ['Building one table from several sources', 'Joining labels with values', 'Combining CSV-like data'],
      chain: 'tableDAT > mergeDAT ; jsonDAT > mergeDAT > textTOP.dat',
      tip: 'Rows mode with Skip Repeated Headers is the usual append. Columns mode aligns rows by index and pads missing cells.',
    },
    selectDAT: {
      what: 'Picks rows and columns from a table, or from any DAT by reference. Supports ranges (1-3), comma lists (0,2,4), negative indices, * for all, and column names when First Row = Header. Transpose flips the result.',
      use: ['Only the columns a Text TOP needs', 'Paging through rows of copy', 'Reordering table data before merging'],
      chain: 'tableDAT > selectDAT > textTOP.dat',
      tip: 'Set Rows to 1-3 and Columns to title,body. Negative indices count from the end; -1 is the last row.',
    },
    choptoDAT: {
      what: 'Writes CHOP channels and samples into a table. Columns mode puts channel names across the top; Rows mode gives each channel its own row. Channel Names accepts wildcards.',
      use: ['Logging audio or sensor data', 'Feeding channel values into Text TOPs', 'Debugging complex CHOP chains'],
      chain: 'audioanalyzeCHOP > choptoDAT > textTOP.dat',
      tip: 'Use names like low mid high to keep only musical bands. Raise Decimals for tiny GW-scale values.',
    },
  });

  B.recipes.push(
    { title: 'Green-screen cut-out', tags: ['TOP'], chain: 'videodeviceinTOP > chromakeyTOP > compositeTOP > outTOP', steps: ['Press Start Device on Video Device In.', 'Set the Chroma Key color to the screen color and raise Tolerance until the background vanishes.', 'Show: matte to check the edge, then composite the performer over a Noise or Video TOP.'] },
    { title: 'Radial beat burst', tags: ['CHOP', 'TOP'], chain: 'beatCHOP ~> directionalblurTOP.length ; circleTOP > directionalblurTOP > compositeTOP > outTOP', steps: ['Set Directional Blur to radial mode.', 'Drive Length from the pulse channel of a Beat CHOP (0.02 to 0.25).', 'Composite it over a background with Screen or Add.'] },
    { title: 'Step-sequenced motion', tags: ['CHOP', 'TOP'], chain: 'stepseqCHOP ~> circleTOP.radius ; lfoCHOP > sampleholdCHOP ~> transformTOP.rotate', steps: ['Type a pattern into the Step Sequencer and set Clock to bpm.', 'Reference value in any numeric parameter.', 'Use a Sample & Hold CHOP in time mode to freeze a Noise or LFO into rhythmic steps.'] },
    { title: 'Torus knot hero object', tags: ['SOP', 'MAT', 'COMP', 'TOP'], chain: 'torusknotSOP ~> geometryCOMP.sop ; pbrMAT ~> geometryCOMP.mat ; cameraCOMP ~> renderTOP.camera > bloomTOP > outTOP', steps: ['Set P 2 and Q 3 for a trefoil, or P 3 Q 4 for a more complex knot.', 'Assign a metallic PBR material, add a camera and a light, then render.', 'Rotate the Geometry COMP with t*20 on Rotate Y.'] },
    { title: 'API data as labels', tags: ['DAT', 'TOP'], chain: 'jsonDAT ~> textTOP.dat', steps: ['Paste a JSON response into the JSON DAT.', 'Set Path to the field you want, or use op(\'json1\').cell(r, c) in a Text TOP expression.', 'For charts, send the table into dattoCHOP and drive geometry.'] },
  );
})();
