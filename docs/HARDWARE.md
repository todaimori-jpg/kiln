# Hardware, devices & networking

Kiln runs in a browser tab, so it can only use what the browser exposes. This page is the honest map: what works natively, what works through a small relay, and what needs desktop software.

## Works natively in the browser

| Device / protocol | Operator | Notes |
|---|---|---|
| Webcam / capture card | Video Device In TOP | Press **Start Device**. Needs HTTPS or `localhost` (or `file://` in most browsers). |
| Screen / window / tab | Screen Grab TOP | Uses `getDisplayMedia`. Not available on iOS. |
| Microphone / audio interface | Audio Device In CHOP | Feed into Audio Analyze / Audio Spectrum. |
| Audio & video files | Audio File In CHOP, Movie File In TOP | MP4 (H.264/HEVC), WebM, MOV (Safari), MP3, WAV, AAC. HAP is not supported by browsers — transcode HAP to H.264 or ProRes→H.264. |
| MIDI controllers | MIDI In CHOP | Web MIDI: Chrome, Edge, Firefox. Not Safari/iOS. |
| Gamepads | Gamepad CHOP | Xbox, PlayStation, Switch Pro, many HID pads. |
| Arduino / serial | Serial DAT | Web Serial: Chrome/Edge desktop. Send `name:value` lines from the board, read them with DAT to CHOP. |
| HTTP / REST APIs | Web Client DAT | Subject to CORS — APIs that send no CORS headers go through the relay's HTTP proxy instead (see below). CSV and TSV bodies are split into columns by the **Delimiter** parameter, so DAT to CHOP gets numbers. |
| WebSocket | WebSocket DAT | Bidirectional; this is the bridge for everything below. |
| Keyboard / mouse / touch | Keyboard In, Mouse In CHOPs, panel COMPs | |
| VR headsets | File → **VR headset output** | Requires a browser offering `immersive-vr` (Chrome/Edge on desktop with a linked headset). See below. |
| Video export | Record (Movie File Out) | MediaRecorder: MP4 in Safari, MP4 or WebM in Chrome. |

## Works through the relay (`tools/relay.js`)

Browsers cannot send raw UDP, so OSC, Art-Net and sACN need a tiny local bridge:

```bash
cd tools && npm install   # installs ws — the relay's only dependency
node relay.js             # ws://localhost:9980 · OSC in on udp:9000 · sACN out on udp:5568
npm test                  # packet builders + storage scoping, no install or browser needed
```

In Kiln add a **WebSocket DAT** (`ws://localhost:9980`, press Connect) and drive it from a **Script DAT**:

```js
function onFrame(t) {
  const lvl = op('analyze1')['level'];
  kiln.send('websocket1', { type: 'osc', host: '127.0.0.1', port: 7000, address: '/kiln/level', args: [lvl] });
  kiln.send('websocket1', { type: 'artnet', universe: 0, data: [Math.round(lvl * 255), 0, 0] });
  kiln.send('websocket1', { type: 'sacn', universe: 1, data: [Math.round(lvl * 255), 0, 0] });
}
```

- **OSC** — TouchOSC, Ableton (via Max for Live / TDAbleton-style OSC devices), Resolume, QLab, Max/MSP, Processing.
- **DMX via Art-Net and sACN (E1.31)** — most Ethernet DMX nodes (Enttec ODE, DMXking, etc.). Both multicast by default; set `host` to unicast instead. Note **Art-Net universes are 0-based while sACN universes are 1-based** (1–63999, sent to `239.255.<hi>.<lo>:5568`). Add `priority` (0–200, default 100) to an sACN message when another controller may also drive the same universe.
- Incoming OSC is forwarded to the WebSocket DAT as JSON; read it with `op('websocket1')` in expressions or a DAT to CHOP.

### HTTP proxy (APIs with no CORS headers)

Most open-data endpoints — weather, transit, air quality, civic feeds — send no
`Access-Control-Allow-Origin`, so a browser refuses to read them. The relay will fetch them
for you and hand the text back. Set **Via Relay** on a Web Client DAT, or ask from a Script
DAT and get a promise:

```js
kiln.request('websocket1', { type: 'http', method: 'GET', url: 'https://example.org/feed.csv' })
  .then((r) => log(r.status + ' ' + r.body.slice(0, 60)));
```

Responses are UTF-8 text, capped at 4 MB, with a 15 s timeout; a binary body comes back
mangled. Anything reachable on the port is an open proxy, so the defaults are tight: it
binds `127.0.0.1`, and `http` mode only answers for origins that are `file://`, `null` or
loopback. Options, all environment variables:

| Variable | Effect |
|---|---|
| `RELAY_HOST=0.0.0.0` | Listen on another interface, e.g. to reach the relay from a phone on the LAN. |
| `RELAY_TOKEN=s3cret` | Require `ws://localhost:9980/?token=s3cret` on every connection. |
| `ALLOW_ORIGIN=https://you.github.io` | Let extra origins use `http` mode — comma-separated. |
| `HTTP_TIMEOUT` · `HTTP_MAX_BYTES` | Override the 15 s timeout and the 4 MB cap. |

**Running Kiln from GitHub Pages?** That origin is refused by default. Start the relay with
`ALLOW_ORIGIN=https://<your-username>.github.io` (or use the `file://` / `localhost` copy)
and OSC, DMX and proxied HTTP all work from the hosted page.

## Needs desktop software (not possible in a browser)

| Feature | Why | Workaround |
|---|---|---|
| Kinect / RealSense / ZED depth | No browser driver | Run a depth-to-WebSocket bridge, or use a webcam + MediaPipe in a Script DAT. |
| Leap Motion / Ultraleap | Legacy WebSocket service only | Ultraleap's local WebSocket server, read with WebSocket DAT. |
| NDI, Spout, Syphon | Native frameworks | Use OBS (NDI plugin) → virtual camera → Video Device In TOP. |
| Lasers (ILDA, Ether Dream) | Native SDKs | Send points over the relay to a laser app. |
| HAP / NotchLC playback | Codec not in browsers | Transcode to H.264/HEVC. |
| Multi-GPU, Genlock, SDI | Hardware | Use TouchDesigner for those installs. |
| Python / C++ operators | Browser sandbox | Kiln uses JavaScript (Script DAT, expressions) and GLSL. |
| Stereo 3D in VR | Kiln shows one flat panel per eye, not a per-eye 3D render | Flat output still reads as a big screen in the headset; per-eye camera rendering is the next step. |

## Projection mapping & multiple displays

- **Corner Pin TOP** — select it and drag the four handles in the viewer for keystone or surface mapping. Chain several, then Composite them for multi-surface maps.
- **Perform mode** (P) goes fullscreen on the current display. For a second display or projector, drag the browser window there first, then press P. Each tab is one output, so open the same project in two windows for two outputs.

## VR headsets

**File → VR headset output** (or ⌘K / Ctrl+K and search "VR") starts an `immersive-vr`
WebXR session that presents whichever operator holds the **Output** flag, letterboxed into
each eye. Choose the same entry again to stop it, or end the session from the browser's own
VR controls.

- The menu entry is greyed out unless the browser reports `immersive-vr` support — usually
  Chrome or Edge on desktop with a headset linked, or the headset's own browser.
- It is a **flat panel**, not stereo 3D: both eyes get the same image, so there is no
  parallax. Depth cues still come through if you render a 3D scene with
  **Camera COMP + Render TOP** and feed it to Output.
- Nothing in the patch changes — the network keeps cooking on the page's own frame loop,
  so time, timeline and MIDI input all continue to drive it.
