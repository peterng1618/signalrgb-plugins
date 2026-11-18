# Plan 1 — Rainbow Music Led WiFi strip, direct control

## Outcome
`plugins/RainbowMusicLedDirect/RainbowMusicLedDirect.js` drives the WiFi LED strip directly. `rmlapp.exe` and `WiFi Led Studio.exe` are not running.

## Confirmed at recon (2026-11-11)
- Strip IP: **<strip-ip>** (user-provided, verified).
- The strip is **WLED 0.13.0-b3 on ESP8266**:
  - `GET /json/info` →
    `{"ver":"0.13.0-b3","leds":{"count":118,...},"name":"Rainbow Music Led","brand":"RAINBOW MUSIC LED","mac":"<mac>","ip":"<strip-ip>",...}`
  - `GET /json/state` → 118 LEDs, one segment `0..118`, currently `live:true`.
  - `POST /json/state` with `{"on":true,"bri":64,"transition":0,"seg":[{"id":0,"start":0,"stop":118,"col":[[0,0,255]]}]}` → `{"success":true}` and the strip changed.
  - `GET /ws` upgrades (HTTP 101) — WLED WebSocket JSON.
  - UDP port **21324** accepts WLED realtime packets (send succeeded).
- Root `/` serves the WLED UI (title "Rainbow Music Led"); a 302 to `http://4.3.2.1` appears for some routes — ignore it, use `/json/*`.
- The vendor stack is only a bridge:
  - `C:\Program Files\Rainbow Music Led\bin\rmlapp.exe` exposes `localhost:2905` (`/health`, `/connect`, `/GetAvalaibleDevices`, `/setColors`) with an API key.
  - Bridge plugin `RmlAPPSync.js` calls `setColors?host=127.0.0.1&port=1603&colors=[{red,green,blue}...]&deviceId=...`.
  - `WiFi Led Studio` (PyInstaller) is a separate WLS app, not needed.
- SignalRGB exposes a global **`udp.send(host, port, data)`** (`types/Udp.d.ts`), so the low-latency path is available in-plugin.

## What to build
Primary transport: **WLED realtime UDP** on port 21324.
- DRGB packet: `[0x01, timeout_hi, timeout_lo, R0,G0,B0, R1,G1,B1, ...]` for all 118 LEDs, ~20–40 Hz.
- Optional DNRGB `[0x04, timeout_hi, timeout_lo, start_hi, start_lo, ...]` for partial updates.
- `timeout` ~ 1000–2000 ms; refresh well inside it.

Fallback transport: HTTP `POST http://<ip>/json/state`.
- Full frame: `{"on":true,"bri":255,"transition":0,"seg":[{"id":0,"start":0,"stop":118,"i":[[r,g,b],...]}]}` if 0.13.0-b3 supports `seg.i`; otherwise use UDP.
- Static/Forced color: `seg.col`.
- WebSocket `/ws` is available if needed, but assume no WebSocket API in the plugin sandbox.

## Plugin shape
```js
export function Name() { return "Rainbow Music Led"; }
export function Type() { return "network"; }
export function Publisher() { return "community"; }
export function Size() { return [118, 1]; }          // or the real matrix layout
export function DeviceType() { return "lightingcontroller"; }
export function ControllableParameters() {
  return [
    {property:"ip", group:"network", label:"Strip IP", type:"text", default:"<strip-ip>"},
    {property:"shutdownColor", ...},
    {property:"LightingMode", ...},
    {property:"forcedColor", ...},
  ];
}
export function Initialize() { /* addChannel("Strip", 118) or setControllableLeds */ }
export function Render() {
  const frame = /* 118 × [r,g,b] from canvas or forcedColor */;
  udp.send(ip, 21324, [0x01, 0x03, 0xE8, ...frame.flat()]);
}
export function Shutdown(SystemSuspending) { /* send black or shutdownColor */ }
```
- If the strip is a matrix, read `device.color(x,y)` / `device.setControllableLeds`; if a single strip, `device.addChannel("Strip", 118)`.
- Skip identical frames; cap to ~40 Hz; never queue unbounded sends.
- Reconnect: UDP is connectionless; on no-op just keep sending. For HTTP fallback, retry with backoff.

## LED layout / mapping (resolve during build)
- `leds.count = 118`. Determine physical arrangement (single strip vs matrix) from the WLED config (`GET /json/cfg` may expose matrix settings; also `/settings`), or by a one-pixel walk with the user watching.
- Color order: WLED default RGB; verify with a red-only frame.
- If 0.13.0-b3 lacks `seg.i`, use UDP only for per-LED effects.

## REA targets (only what is still needed)
1. WLED 0.13.0-b3 protocol/API: fetch the matching WLED source/docs (`wled/WLED` at tag `v0.13.0-b3`) for:
   - UDP realtime packet formats (DRGB/DNRGB/WARLS), port 21324.
   - JSON `seg.i` support in 0.13.0-b3.
   - `/json/cfg` matrix/segment fields.
2. Vendor stack (only to confirm the LED layout / live-mode behavior):
   - `rmlapp.exe` strings around `SignalRGBServer`, `/setColors`, `1603`; `WiFi Led Studio` frontend `/api/*`.
   - This is optional now that WLED is confirmed; do not spend more than needed.
3. Runtime verification:
   - Send a red-only UDP frame, confirm the strip turns red.
   - Send a one-pixel walk, record the physical order.

## Verification
- Stop `rmlapp.exe` and `WiFi Led Studio.exe`; confirm no process and no listener on 2905.
- Plugin loads in SignalRGB and drives the strip: full red/green/blue, per-LED walk, moving gradient.
- Measure latency and max sustainable FPS over UDP.
- Power-cycle the strip/router; plugin resumes on the next frame.
- Confirm no vendor process is required.

## Deliverables
- `plugins/RainbowMusicLedDirect/RainbowMusicLedDirect.js`
- `plugins/RainbowMusicLedDirect/README.md` (IP, WLED version, UDP/HTTP protocol, LED layout, test steps)
- `plugins/RainbowMusicLedDirect/evidence/NOTES.md` (probe outputs, captures, observed vs inferred)
- Optional probe scripts under `tools/` (no secrets).

## Stop conditions
- Do not flash WLED or change its WiFi settings.
- If a full-frame UDP packet is rejected (WLED ignores oversized packets), split with DNRGB or use HTTP.
