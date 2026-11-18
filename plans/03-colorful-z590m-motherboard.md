# Plan 3 — Colorful CVN Z590M GAMING FROZEN V20, direct control

## Outcome
`plugins/ColorfulZ590M/ColorfulZ590M.js` drives the motherboard onboard LEDs + 5V ARGB headers directly over USB HID. `iGameCenter` / `iGame.LightingService` / `iGame.DynamikLight` are not running.

## What exists (observed)
- Board: `CVN Z590M GAMING FROZEN V20` (`iGameCenter` log: `LedCount:140`, `LightingVersion:MBoard_3`, `DeviceVersion:2002`, `SubSystemId:268447564`).
- Vendor stack:
  - `C:\Program Files\iGameCenter\` (`iGameAPI\iGameAPI.LED.dll`, `iGameCenter.Hardware.dll`, `iGameCenter.Service.exe`).
  - `C:\Program Files (x86)\iGameDynamikLight\` (`iGame.LightingService.exe`, `USBCmdLib.dll`).
  - Service `iGameCenterService` is running; `iGame.LightingService` PID 16336 listens on 13344.
- **User-confirmed (2026-11-11): iGame Dynamik Light is deprecated and found no device. iGameCenter controls all motherboard LEDs.** Treat Dynamik Light as reference only; the active stack to reverse is iGameCenter (`iGameAPI.LED.dll` + `iGameCenter.Hardware.dll` + the service).
- USB device on this box:
  - `USB\VID_2F4C&PID_1000` — **Colorful RGB controller**.
  - `MI_01` descriptor: `X570-USBHID-LED`, usage page `0xFF00` — **firmware-update collection; never write**.
  - `MI_02` usage page `0xFF01` — **LED frames**.
  - `MI_00` also present.
- Protocol (verified in OpenColorHub, `crates/colorctl-core/src/backend/frame.rs`):
  ```
  offset 0      report ID 0x00
  offset 1..3   magic 0x01 0x00 0x88
  offset 4      packet index 0..9, or 0xFF = commit
  offset 5..    20 × (R,G,B)
  ```
  65-byte output reports, report ID `0x00`. Full frame = 10 data packets + 1 commit packet. 200 LEDs total; unused LEDs zero.
- Channel map (OpenColorHub `RGB-COMPATIBILITY.md`, AMD `0x1000` path; same wire format documented for Colorful boards):
  | Channel | Label | LED range |
  |---|---|---|
  | `led` | onboard shroud + I/O cover | 0..18 |
  | `rgb1` | 12V_1 | 18..19 |
  | `rgb2` | 12V_2 | 19..20 |
  | `argb1` | 5V_1 | 20..80 |
  | `argb2` | 5V_2 | 80..140 |
  | `argb3` | 5V_3 | 140..200 |
- Driver catalogue (`iGameMBoard.dll`): Intel Z590 PIDs are `0x1013`/`0x1015`; this board enumerates as `0x1000` on this box. Same endpoint/usage page per OpenColorHub/OpenRGB.
- OpenRGB registers the detector `0x2F4C, 0x1000, 0xFF01, 0x0001`.
- No SignalRGB plugin exists for this board; the official repo has no Colorful motherboard plugin.

## Runtime proof (2026-11-11)
- Standalone probe opened `\\?\HID#VID_2F4C&PID_1000&MI_02#...` and wrote 140 LEDs as 7×65-byte packets + commit, then black. MI_02 accepted the frame with `iGameCenterService` and `iGame.LightingService` stopped.
- SignalRGB loaded the plugin and found the board:
  `Found Supported Motherboard: Colorful Technology And Development Co.,LTD - CVN Z590M GAMING FROZEN, VID: 0x2F4C, PID: 0x1000, Plugin: ColorfulZ590M.js`
- **User report: the plugin syncs but does not use the full motherboard LED strip.** Installed plugin is hard-coded to `TOTAL_LEDS = 140` / 4 channels (Onboard 18, 12V, ARGB1 60, ARGB2 60), so there is no ARGB3 range. Expand to the full 200-LED frame (10 packets + commit) and verify each zone.

## Unknowns to resolve with REA
1. Confirm `MI_02` is the ARGB endpoint and `Validate(endpoint)` can select it by `usage_page === 0xFF01 && usage === 1`.
2. Confirm the Z590M's actual per-header LED counts. iGame reports 140 total, which suggests 18 onboard + 2×1 12V + 3×40 ARGB = 140, not the 60-per-header default. Verify by a per-range walk.
3. Confirm color order (RGB vs GRB) and whether a global brightness/commit sequence is required.
4. Confirm the vendor service does not hold the HID handle exclusively; determine how to release it cleanly.
5. Confirm behavior after sleep/resume and after `iGameCenter` starts/stops.

## REA targets (in order)
1. `C:\Program Files\iGameCenter\iGameAPI\iGameAPI.LED.dll` — native:
   - `open_binary` → `binary_overview` → `search_strings` for `2F4C`, `1000`, `FF01`, `MBoard`, `0x88`, `2002`, `140`.
   - Decompile the LED frame builder and the device-open path.
2. `C:\Program Files\iGameCenter\iGameCenter.Hardware.dll` / `iGameCenter.Service.exe` — confirm which DLL owns the HID handle and the service lifecycle.
3. `C:\Program Files (x86)\iGameDynamikLight\USBCmdLib.dll` — reference only; Dynamik Light is deprecated and does not detect this board. Do not build against it.
4. Runtime (only if static evidence leaves a gap):
   - Stop `iGameCenterService` and `iGame.LightingService`, start the plugin/probe, capture with USBPcap + Wireshark on `VID_2F4C PID_1000`.
   - Change one ARGB header color in iGameCenter, capture the frame, diff two colors.
5. Cross-check against the already-public `OpenColorHub` frame implementation (local clone during recon: `recon\OpenColorHub`) and the OpenRGB detector.

## Implementation
- Plugin:
  ```js
  export function VendorId() { return 0x2F4C; }
  export function ProductId() { return 0x1000; }
  export function Type() { return "HID"; }
  export function DeviceType() { return "motherboard"; }
  export function Validate(endpoint) {
      return endpoint.usage_page === 0xFF01 && endpoint.usage === 0x0001;
  }
  ```
- In `Initialize()`: `device.set_endpoint(2, 1, 0xFF01, 0)` (or the interface/collection found by REA), `device.SetLedLimit(200)`, add channels:
  - `device.addChannel("Onboard", 18)`
  - `device.addChannel("12V RGB 1", 1)` / `"12V RGB 2", 1`
  - `device.addChannel("ARGB 1", 60)` etc. (adjust to the verified counts)
  - Or `device.setControllableLeds(names, positions)` for a fixed 200-LED map.
- `Render()`:
  - Build a 200-entry `[[r,g,b], ...]` buffer from channels/canvas.
  - Emit packets 0..9 (`[0x00,0x01,0x00,0x88,i, ...60 bytes]`) then commit (`[0x00,0x01,0x00,0x88,0xFF, ...zeros]`), each `device.write(pkt, 65)`.
  - Keep one write path; do not re-open the device per frame.
- `Shutdown(SystemSuspending)`: black on suspend, `shutdownColor` otherwise.
- `ConflictingProcesses()`: return `["iGameCenter.exe", "iGameCenter.Service.exe"]` (plus Dynamik Light processes if they happen to be running) if supported.
- Robustness: if a write fails, re-enumerate/re-open; do not spin.

## Verification
- Stop `iGameCenterService`, `iGame.LightingService`, `iGame.DynamikLight`; confirm no process holds `2F4C:1000`.
- Plugin loads, SignalRGB sees the motherboard device.
- Test: onboard-only red; ARGB1-only green; ARGB2-only blue; ARGB3-only white; then a full-canvas moving effect.
- Verify each header independently to settle the LED range map.
- Sleep/resume and SignalRGB restart.
- Confirm no iGame process is required.

## Deliverables
- `plugins/ColorfulZ590M/ColorfulZ590M.js`
- `plugins/ColorfulZ590M/README.md` (VID/PID/usage page, frame format, channel map, test steps)
- `plugins/ColorfulZ590M/evidence/NOTES.md` (REA Evidence IDs, captures, observed vs inferred)
- Optional: a standalone probe script under `tools/` that writes one frame (65-byte reports) and restores black.

## Stop conditions
- Never write to `MI_01` / usage page `0xFF00`.
- Never flash firmware or update the EC/BIOS.
- If the Z590M uses a different frame magic than `0x01 0x00 0x88`, verify it twice (two colors, two captures) before writing a full frame.
