# Kiln TD

A browser-native, TouchDesigner-style node studio for real-time visuals, audio-reactive
art, 3D, data and presentations. Everything runs in a tab — no install, no build step,
no dependencies.

Open [`index.html`](index.html) and you are editing.

```bash
# either just open the file, or serve the folder:
npx serve .          # or: python -m http.server
```

> Some features need a secure context: webcam, microphone and screen capture work on
> `localhost` and `https://`, and generally work from `file://` too.

## What it does

Six operator families, wired together in a live graph that cooks every frame:

| Family | Name | Does |
|---|---|---|
| **TOP** | Texture | GPU image generation, compositing and effects (GLSL fragment passes) |
| **CHOP** | Channel | Motion, audio, LFOs, controllers and signals |
| **SOP** | Surface | 3D geometry, point clouds and particles |
| **MAT** | Material | Surface shading: constant, wireframe, phong, PBR, GLSL |
| **DAT** | Data | Text, tables, scripts, shaders, web, WebSocket & serial I/O |
| **COMP** | Component | 3D objects, cameras, lights, UI panels, nested networks |

126 operator types, 13 worked examples, and a built-in **Bible** — a searchable glossary
of terms, every operator, and connection recipes (press `?`).

## Getting around

- **Tab** add an operator at the cursor · **⌘/Ctrl+K** command palette · **H** frame all
- **Double-click** the empty network to open the operator browser
- Drag from the palette on the left, or pick an example from **Examples** to start
- The viewer shows the **Selected** node or the **Output** node (`1` / `2`); **F** enlarges it
- **Space** play/pause the timeline · **R** record · **P** or **F1** perform mode
- **B** bypass · **D** display flag · **L** lock · **⌘/Ctrl+S** save · **/** find a node
- **Shift+M** performance monitor (fps, cook time, ops cooked)

Your work autosaves to `localStorage` every 5 seconds and on tab close, so reloading
returns to the same patch. **File → Save** writes a `.kiln` file (JSON); **Save with media
embedded** bundles any images, audio and video you imported into the file so it travels
alone. **Kiln Files** (**Shift+F**) is the library of recordings, exports and saves.

## Hardware and external devices

See [docs/HARDWARE.md](docs/HARDWARE.md) for the full map of what works natively in a
browser, what works through the local relay, and what is not possible at all.

Short version — natively: webcam, screen capture, microphone, MIDI, gamepads, serial
(Arduino), HTTP/WebSocket, and VR headset output (**File → VR headset output**, where the
browser offers WebXR). Through the relay: OSC, Art-Net and sACN/DMX, plus an HTTP proxy for
APIs that send no CORS headers.

```bash
cd tools && npm install   # the relay's only dependency; the app itself needs none
node relay.js             # ws://localhost:9980 · OSC in on udp:9000 · HTTP proxy (Node 18+)
npm test                  # the three test suites; they need no install and no browser
```

## Requirements

WebGL 2 with float-texture support: current Chrome, Edge, Firefox and Safari. No
frameworks, no bundler — plain `<script>` tags, listed in `index.html`.

## Layout

```
index.html          the app shell and the script list
src/core/           platform, utilities, WebGL wrapper, graph + cook engine
src/ops/            the operators, one file per family group
src/ui/             network editor, parameters, viewer, Bible, files, app chrome
src/examples.js     the 13 starter patches
src/bible*.js       the built-in documentation
tools/relay.js      local bridge for OSC, Art-Net, sACN and non-CORS HTTP
tools/test-relay.js packet-builder + proxy assertions, run in CI
tools/test-util.js  delimiter-parsing assertions, run in CI
tools/test-storage.js storage-namespacing assertions, run in CI
docs/HARDWARE.md    device & protocol reference
```

## Publishing

`.github/workflows/deploy.yml` checks every script parses and runs the relay's packet
tests on each push and pull request, then publishes this folder to GitHub Pages from
`main`. There is nothing to build — the artifact is the repository.

The one thing a workflow cannot do for you: on a new repo, set **Settings → Pages → Build
and deployment → Source** to **GitHub Actions** before the first deploy job will run.

Browser storage — the autosave in `localStorage` and the Kiln Files library in IndexedDB —
is scoped to the *origin*, not the URL path, so two copies of Kiln served from the same
host would otherwise share one saved patch and one file library. That is exactly what
`<user>.github.io` does: it hosts every Pages project of an account from one origin. On
those shared hosts (github.io, netlify.app, vercel.app, pages.dev) the keys are stamped
with the top folder of the path, so `/kiln-td/` and `/kiln-td-fork/` keep their own saves;
an older un-stamped autosave is still read the first time, so nothing disappears on the
first reload. Everywhere else — a custom domain, `localhost`, or the `file://` copy on your
iPad — the keys are unchanged. [`tools/test-storage.js`](tools/test-storage.js) asserts all
of this, and CI runs it.

## License

MIT — see [LICENSE](LICENSE).
