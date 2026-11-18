# Rainbow Music Led — direct SignalRGB plugin

Drives the **Rainbow Music Led WiFi strip** from SignalRGB without `rmlapp.exe` or `WiFi Led Studio.exe`.

- Device: `Rainbow Music Led`, WLED **0.13.0-b3**, ESP8266, **118 LEDs**, IP set in the device settings (blank = no traffic)
- Primary: **WLED realtime UDP** — DRGB (`0x02`), port **7778** (the port from `/json/cfg` → `if.sync.port0`; not WLED's default 21324)
- Fallback: `POST http://<strip-ip>/json/state` with `seg[0].i` (per-LED colors)
- Plugin type: `network`, LED layout is a 45 × 16 rectangle ring (16+43+16+43 bars) exposed as parameters

## Install

1. Copy this folder to `%USERPROFILE%\Documents\WhirlwindFX\Plugins\RainbowMusicLedDirect\`.
2. Restart SignalRGB.
3. The strip appears as **Rainbow Music Led** (Controller) in *Devices* and in the *Lighting* layout list.
4. Stop `rmlapp.exe` and `WiFi Led Studio.exe`; none are needed at runtime.

## Protocol (proved on this unit)

| Path | Packet / request | Notes |
|---|---|---|
| UDP `<strip-ip>:7778` | `02 <timeout_s> R0 G0 B0 R1 G1 B1 ...` | DRGB, 118×3+2 = 356 bytes, 2 s timeout, sent at 17–40 Hz |
| UDP `21324` | same bytes | **Ignored** by this strip (`live` stays false) |
| HTTP `/json/state` | `{"on":true,"bri":255,"transition":0,"seg":[{"id":0,"start":0,"stop":118,"i":[[r,g,b],...]}]}` | fallback; `seg.i` supported by 0.13.0-b3 |
| HTTP `/json/cfg` | read `if.sync.port0` | realtime UDP port (7778 here) |

The plugin POSTs `{"on":true,"bri":255}` once on Initialize so realtime pixels are not dimmed by the strip's saved master brightness (64 on this unit). This is adjustable with the *WLED master brightness* parameter.

## Controllable parameters

- `ip` (blank = no traffic; enter the strip IP)
- `udpPort` (0 = read `/json/cfg`; default 0)
- `httpPort` (default 80)
- `transport` = `Auto` / `UDP` / `HTTP` (Auto falls back to HTTP if WLED does not enter realtime mode)
- `refreshRate` (Hz, max 40)
- `wledBrightness` (0–255)
- `ledCount` (default 118)
- `layoutShape` = `Ring` (default) / `Strip`
- `layoutWidth` (default 45), `layoutHeight` (default 16), `layoutStart` (default Bottom-Left), `layoutDirection` (default Clockwise)
- `layoutSerpentine` (Strip only), `LightingMode`, `forcedColor`, `shutdownColor`

Layout is applied on Initialize and on parameter change. The Ring needs `2 × (width + height) − 4 = ledCount`; if it does not, the plugin logs and falls back to 45 × 16.

## Discovery UI

`RainbowMusicLedDirect.qml` provides a **Discover strip** panel: an IPv4 field
with an Add button (`discovery.forceDiscover(text)`) and a Scan LAN button
(`discovery.forceDiscover("")`). Scan is opt-in and walks 8 hosts per discovery
tick. Each WLED device is identified by its MAC (`wled-<mac>`), so DHCP moves
update the existing controller. LED count, shape and geometry can be overridden
per controller via `service.getSetting(id, key)`.

## Discovery

`DiscoveryService` announces controllers from saved settings on `Initialize()` (no probe has to succeed first), keyed by WLED MAC (`wled-<mac>`), then `service.addController` + `service.updateController` + `service.announceController`. The HTTP probe (`/json/info`, `/json/cfg`) only refreshes MAC, name, LED count, firmware and realtime port, and runs every 15 s in `Update()` with its status codes logged. The device shows up in **Devices → Fan & RGB Controllers** as *Rainbow Music Led / Controller* (`evidence/ui_devices_20261112.txt`).

`service.log` output from the discovery sandbox is not written to any SignalRGB log file on 2.5.86 (verified: code execution, announce success and probe HTTP 200 proven via a temporary local XHR endpoint, while the log only ever shows `Starting discovery thread`). Do not rely on discovery log lines; use the Devices page.

## Layout page

The plugin is one flat 2D component, so it uses the Nanoleaf path: `device.setSize()` + `device.setControllableLeds()` in `Initialize`, no channels. Do not add `SubdeviceController()`/`DefaultComponentBrand()` without also creating subdevices (`createSubdevice` + `setSubdeviceLeds`) or channels (`addChannel`) — a subdevice controller with zero subdevices lists under Devices but never appears in the Layouts sidebar. `evidence/NOTES.md` E16 has the shipped-plugin comparison.

## Physical layout

Rectangle ring, 118 LEDs as four bars **16 + 43 + 16 + 43**. The 16-LED vertical bars include both corner LEDs, so the outer grid is **45 × 16** (`2×45 + 2×14 = 118`). Index 0 is the **bottom-left corner**; the run goes up the left side (16), across the top (43, x=1..43), down the right side (16, x=44), and back along the bottom (43, x=43..1). WLED 0.13.0-b3 has no matrix/ledmap in `/json/cfg`, so the direction is a parameter, not device-derived. `tools/check_layout.js` asserts the mapping. The vendor app's 322-LED 23×14 matrix is a different configuration.

The plugin sets WLED's base state to solid black before entering realtime, so when SignalRGB quits and WLED's 2 s realtime timeout fires, the strip goes dark instead of resuming the saved blue preset (`wledBrightness` controls master brightness; `on:false` is not used because it zeroes WLED brightness, which blanks realtime output too).

## Files

- `RainbowMusicLedDirect.js` — plugin
- `evidence/NOTES.md` — observed vs inferred, Evidence IDs, captures
- `../tools/wled_probe.py` — HTTP/UDP probe used for recon
- `../tools/check_layout.js` — ring mapping self-check (`node tools/check_layout.js`)
- `../tools/walk.py` — one-pixel walk (index 0 red, then green 0→117)
