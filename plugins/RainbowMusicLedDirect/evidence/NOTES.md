# Rainbow Music Led — evidence notes

Built 2026-11-11 on this box. No flashing, no WiFi changes, no vendor app at runtime.

## Observed (device, this unit)

**E1 — WLED version/count/IP** (`evidence/http_info.json`, live `GET /json/info`)
```
ver 0.13.0-b3, arch esp8266, leds.count 118, name "Rainbow Music Led",
brand "RAINBOW MUSIC LED", mac <mac>, ip <strip-ip>
```

**E2 — WLED hardware config** (`evidence/http_cfg.json`, `evidence/wled_cfg_summary.json`)
```
hw.led.total 118, one output: start 0 len 118 pin 2 order 0 rev false
if.sync.port0 7778   <-- realtime UDP port
if.sync.port1 7780
if.live.en true, if.live.port 7979 (E1.31 port, not realtime UDP)
if.live.timeout 25, maxbri false, no-gc true
```

**E3 — HTTP fallback works**
`POST /json/state` with `{"on":true,"bri":64,"transition":0,"seg":[{"id":0,"start":0,"stop":118,"col":[[0,0,255]]}]}` → `{"success":true}`; state then reports `on:true, bri:64`, strip changed (recon).
`POST` with `seg[0].i = [[255,0,0] × 118]` → `{"success":true}`. Per-LED fallback accepted.

**E4 — realtime UDP is on 7778, not 21324**
Probe `tools/wled_probe.py drgb 7778 255 0 0` (ten DRGB packets, timeout 2 s) → within 1 s `/json/info`:
```
live true, lm "Rainbow Music Led qua WiFi", lip <host-ip>
```
After the 2 s timeout: `live false`. The same DRGB bytes sent to port **21324** left `live:false` and changed nothing. This contradicts the plan's assumed `21324`/`0x01`; evidence wins.

**E5 — WLED v0.13.0-b3 source (public tag)**
Fetched from `https://raw.githubusercontent.com/wled/WLED/v0.13.0-b3/`:
- `wled00/udp.cpp` lines 356–416: realtime protocols `1 WARLS`, `2 DRGB`, `3 DRGBW`, `4 DNRGB`; timeout is one byte in seconds (`udpIn[1]*1000+1`, line 368). DRGB payload is `[0x02, timeout, R,G,B, ...]` starting at LED 0 (lines 378–386). Packet cap `UDP_IN_MAXSIZE 1472` (line 8). Realtime is only accepted when `receiveDirect` is true, which maps to `if.live.en` (`udp.cpp` line 316, `cfg.cpp` line 264).
- `wled00/udp.cpp` lines 435–447: `setRealtimePixel` applies gamma only when `arlsDisableGammaCorrection` is false; this unit has `no-gc:true` (E2), so bytes are taken raw.
- `wled00/json.cpp` lines 156–205: `seg.i` individual-LED array supported in 0.13.0-b3; it sets `SEG_OPTION_FREEZE`, fills black once, then writes `[r,g,b]` arrays per LED.
- `wled00/cfg.cpp` lines 237–238: `CJSON(udpPort, if_sync["port0"])`; line 265: `CJSON(e131Port, if_live["port"])`. So `if.live.port` (7979) is the E1.31/DMX port; the realtime UDP port is `if.sync.port0` (7778).

**E6 — captured SignalRGB → strip traffic** (`evidence/captures/udp7778.pcapng`, tshark)
```
5.0 s capture, Wi-Fi interface, filter udp port 7778
87 packets, all dst <strip-ip>:7778, UDP length 364 (356-byte payload)
payload[0]=0x02, payload[1]=0x02, 118 RGB triples decoded
frame 0:   all 118 pixels identical (255,5,176)   <- uniform/static frame
frame 86:  first pixels (255,5,176), middle/last (10,47,255) <- per-LED difference
frames evolve over time (Side to Side moving effect); 0 identical consecutive frames
```
Rate: 87/5 s ≈ 17.4 Hz from SignalRGB 2.5.86 (plugin cap 40 Hz).

**E7 — vendor stack (REA, read-only)**
- `ev_ceb5bf7b94f62940a9f2d0708adb82f150611de7159007d73c868c7683ad1bad`: `rmlapp.exe` (sha256 `81e74dd2…cf720`) contains `SignalRGBServer::start/stop/handleConnect/handleGetAvailableDevices/handleSetColors/parseColors`.
- `ev_3f86a654cc37910b2aa88fe3237e761799b73b4c5bf8c2ad090f391b7affa3ff`: string `/setColors`.
- `ev_f5655526dfcb8612a8e9bbe69d4a267615ed68340fd2309a8385d0736ddfe5dc`: search for `2905` returned no defined strings (port may be numeric/constructed; the live API confirmed it).
- Live `GET http://127.0.0.1:2905/health` → `{"status":"ok","service":"RmlAPP SignalRGB Server"}` while rmlapp ran. `GetAvalaibleDevices` (with the key from the addon) returned device `rainbow-music-led-matrix`, **322 LEDs**, zone `LED Matrix Zone` type 2, matrix **23×14** (`evidence/vendor_device_summary.json`).
- Conclusion: the vendor app is only a bridge/skin; the transport to the strip is WLED. The 322/23×14 description is a different configuration and does not match this strip's 118 LEDs.

**E8 — one-pixel walk**
`tools/walk.py` was run for two rounds (index 0 red, then green 0→117 at 1.2 s/pixel). No human was available to observe the physical order. User-supplied geometry (E12) now supplies the ring; a later walk can confirm direction. Probe and script are kept for that check.

**E12 — physical geometry (user supplied, 2026-11-11)**
Rectangle ring, 118 LEDs, four bars **16 + 43 + 16 + 43**, LED index 0 at the bottom-left corner. `/json/cfg` has no matrix/ledmap (`hw.led.ins` is one 118-LED 1D output on pin 2), so the device does not describe 2D. The only consistent ring layout with those bar counts and index 0 in the first (16) bar is `2×45 + 2×14 = 118`: the 16-LED vertical bars include both corner LEDs, horizontal bars of 43 sit between them. Mapping used:
```
i   0..15   x=0        y=15-i      left, bottom -> top (includes both left corners)
i  16..58   x=i-15     y=0         top, x=1..43
i  59..74   x=44       y=i-59      right, y=0..15 (includes both right corners)
i  75..117  x=118-i    y=15        bottom, x=43..1
```
`tools/check_layout.js` asserts 118 unique, closed (every consecutive pair adjacent, including 117→0), bars 16/43/16/43, LED 0 = (0,15). Direction (up-left first vs along bottom first) is a ControllableParameter (`layoutDirection`); `layoutStart` moves the origin corner.

**E13 — base state after realtime timeout**
WLED restores its current segment render when the 2 s realtime timeout fires; it had been resuming the saved blue preset (pwr ≈ 2381). `{"on":false}` was measured unusable: it zeroes WLED `bri`, and realtime pixels are scaled by `bri`, so a white 118-LED stream drew pwr 218 (dark) instead of 3489. Fix: before streaming, POST `/json/state` `{"on":true,"bri":255,"transition":0,"seg":[{"id":0,"on":true,"fx":0,"col":[[0,0,0]]x3}]}`. This leaves realtime visible (pwr 3489) and makes the post-timeout base render solid black (pwr 218). Saved presets (`ps`) untouched; only the running segment state changes.

**E14 — quit verification with plugin (2026-11-11 02:26-02:28)**
SignalRGB 2.5.86 (PID 15080) loaded the updated plugin and streamed (live:true, pwr 3498, fps 25). `Stop-Process` (abrupt quit, no Shutdown callback) → after 4 s: `live:false`, `pwr:218`, `fps:5`, state `on:true, bri:255, fx:0, col:[[0,0,0]]`; saved preset id 250 still present. Blue baseline for comparison is pwr ≈ 2381. So the strip now goes dark on quit, not blue.

**E9 — plugin load / discovery / render in SignalRGB 2.5.86**
Log excerpts (`SignalRGB_20261111_*.log`):
```
PluginCrawler: Network plugin with name Rainbow Music Led already exists. Overwriting with new path:
  ...\Documents\WhirlwindFX\Plugins\RainbowMusicLedDirect\RainbowMusicLedDirect.js
Starting discovery thread for ...\RainbowMusicLedDirect.js
Custom Plugin File Loaded for Path: ...\RainbowMusicLedDirect.js
```
A temporary probe endpoint confirmed `DiscoveryService.Initialize` and `Update` run (`HIT /diag?stage=init`, `HIT /diag?stage=update`); the diagnostic XHR was removed from the shipped plugin.

**E15 — discovery fixed: immediate announce, device listed (2026-11-12)**
Build with `dlog()` at every step, stable id `rainbow-music-led`, `announceFromConfig()` on `Initialize` (announces the fixed IP before any probe), then `addController` → `updateController` → `announceController`; probe refreshes MAC/name/LED count/firmware/UDP port every 15 s and logs `readyState`/status.
- `service.log` output from the discovery sandbox reaches **no log file**: `SignalRGB_20261112_001409.log` contains only `Starting discovery thread` + `Custom Plugin File Loaded` for the plugin, exactly like the broken build. Proven separately with a temporary XHR to `127.0.0.1:8099`: hits `/module`, `/ctor`, `/init`, `/update1..3`, `/announced_ok`, `/info_status_200`, `/cfg_status_200`. So the sandbox executes, the `service` object exists (`log`/`addController`/`updateController`/`announceController` are functions), announce succeeds, and probe HTTP returns 200 — only log persistence is missing. Instrumentation removed from the shipped file.
- Device now appears in **Devices → Fan & RGB Controllers** as `Rainbow Music Led / Controller` (`evidence/ui_devices_20261112.txt`, PID 28168), and the same layout streams: `live:true`, `pwr 3461`, `fps 30`, 118 LEDs.

**E16 — why the component never reached the Layout page (2026-11-12)**
The plugin exported `SubdeviceController(){ return true; }` and `DefaultComponentBrand(){ return "CompGen"; }` but never created a subdevice or channel. SignalRGB then creates a *subdevice controller* component with zero subdevices, so the Lighting/Layouts sidebar has nothing to enumerate — the controller still lists on Devices and Render still runs (WLED `live:true`, `pwr 3494`), but no layout card exists. Shipped plugins never mix the two models:
- `Nanoleaf.js` (single 2D component): no `SubdeviceController`, no channels — `device.setSize` + `device.setControllableLeds` only. This is the correct match for this strip.
- `WLED.js` (community) / `Govee.js`: `SubdeviceController` true **and** `device.addChannel(name, ledCount)` in `Initialize`; render reads `device.channel(name)`.
- `PhilipsHue.js` / `AsusSMBusMotherboardController.js` / `KBDCraft`: `SubdeviceController` true **and** `device.createSubdevice` + `setSubdeviceName` + `setSubdeviceSize` + `setSubdeviceLeds` in `Initialize`.

`setSize`/`setControllableLeds` are declared in `Initialize`, not in `Render`; `Render` only reads canvas colors. `CompGen` is a valid brand (used by the shipped WLED plugin) but it is irrelevant without subdevices. The RmlAPP-Sync add-on for this same strip also exports neither function for its single-zone path.

Fix: dropped both exports, keeping the Nanoleaf-style path (`setSize` + `setControllableLeds`). After restart the component appears in the Layouts sidebar with geometry X 5 Y 40 W 187 H 67 (45×16 cells) and keeps streaming (`pwr 3494`, `fps 29`); see `evidence/ui_layout_20261112.txt`.

**E10 — reconnect**
SignalRGB was restarted several times during testing (other workers also restart the shared instance). After each restart with the plugin installed, the strip returned to `live:true` / vendor live mode without restarting the strip or vendor app, and a fresh tshark capture showed frames again. UDP is stateless; the discovery service re-probes every 15 s.

**E11 — shutdown (UNRESOLVED)**
Two 15–20 s captures were taken while exiting SignalRGB (`evidence/captures/shutdown.pcapng`, `shutdown2.pcapng`). No all-zero (black) frame was observed; SignalRGB's tested exit path hid/terminated without invoking the plugin `Shutdown` callback (or it was killed during a concurrent restart). `Shutdown()` implements black/`shutdownColor` over UDP (or HTTP in HTTP mode), but runtime observation is missing.

## Inferred (not directly observed)

- SignalRGB calls `Render()` for this device at ~17–20 Hz on this box (measured 87 frames/5 s). The plugin's 40 Hz cap is not the limiter.
- SignalRGB's tray/minimize exit path does not call `Shutdown`; a real app exit or system suspend should.

## Unknown

- Ring run direction (up the left side first vs along the bottom first) and whether the bar order is mirrored in the physical build. Parameters `layoutDirection` / `layoutStart` cover both.
- Whether `WiFi Led Studio.exe` would interfere; it was not running and is not installed as a service.

## Evidence IDs

| ID | Type | Artifact |
|---|---|---|
| E1 | observed | `/json/info` → `evidence/http_info.json` |
| E2 | observed | `/json/cfg` → `evidence/http_cfg.json`, `wled_cfg_summary.json` |
| E3 | observed | HTTP `seg.i` / `seg.col` probes (`{"success":true}`) |
| E4 | observed | UDP 7778 vs 21324 probe (`live:true`, `lip <host-ip>`) |
| E5 | source | WLED tag `v0.13.0-b3` `udp.cpp`, `json.cpp`, `cfg.cpp` |
| E6 | observed | `evidence/captures/udp7778.pcapng` + tshark decode |
| E7 | REA | `ev_ceb5…`, `ev_3f86…`, `ev_f565…` (rmlapp.exe sha256 `81e74dd2…cf720`) |
| E8 | probe | `tools/walk.py` |
| E9 | observed | SignalRGB log lines + temporary discovery probe |
| E10 | observed | live:true after app restarts |
| E11 | observed | shutdown captures; callback not observed |
| E12 | user | rectangle ring geometry, bars 16+43+16+43, LED 0 bottom-left |
| E13 | observed | base state pwr: off 218, black 218, blue 2381; `on:false` blanks realtime |
| E14 | observed | quit test 02:26-02:28: live:false, pwr 218, base black |

## Safety

- No firmware flashing, no WiFi/AP changes, no WLED config writes.
- Only `POST /json/state` (power/colors/effect selection) and realtime UDP pixels were written. Saved presets were not modified; the running segment is set to solid black so the realtime timeout reverts to dark instead of the blue preset.
- Vendor processes: `rmlapp.exe` started only to read the device description, then stopped. `WiFi Led Studio.exe` never started. No listener on 2905 at final test time.
