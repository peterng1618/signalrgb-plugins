# Plan 2 — Jungle Leopard L10 ARGB Hub, direct control

## Outcome
`plugins/JungleLeopardL10/JungleLeopardL10.js` drives the L10 hub directly over its USB transport. `Jungle Leopard Display.exe` is not running.

## What exists (observed)
- Vendor app: `C:\Program Files\Jungle Leopard Display\` — **Electron**.
  - `resources\app.asar` (59 MB) — app code + device drivers.
  - `resources\main\` — unpacked i18n, themes, SDK.
  - `resources\main\SDK\` — `ch375_driver\CH375DLL64.dll` (USB display), `ingenic_display_driver\ingenic_display_driver.dll`, `devcon.exe`, `handle64.exe`.
  - The app is a multi-OEM "HT Digital" device composer: it contains ~100 `appId`/`showName` entries (`com.ht.Jungle_Leopard_Display`, `com.ht.AWEST` → "AV1204T ARGB", `com.ht.HURA_HUB`, etc.).
  - Device table includes VID **0x5131** (20785) with PIDs **0x2007–0x2024**, plus `usagePage` entries, `hidOnly` flags, and `hidWhiteList` arrays.
- **Transport confirmed (vendor log, 2026-11-11): the L10 hub is the CH340 serial device `USB\VID_1A86&PID_8042\<serial>` → `COM4`.**
  - `%APPDATA%\Jungle_Leopard_Display\logs\main.log`:
    `Start connecting USB\VID_1A86&PID_8042\<serial>` → `bind ... -> COM4` → `getDeviceInfo result: 200` → `action setLight` / `action live` / `action freeDraw` → `fillCount [24,0,0,0,0,24,16,16,0,0,0,0]` → `startLight 8 5504020000` → `endLight end 5504020000`.
  - `5504020000` is a strong frame-prefix clue; `fillCount` suggests 12 channels with 24/16 LEDs each.
- Other present devices — **out of scope**, never open/probe/write:
  | Device | ID |
  |---|---|
  | Massdrop Ctrl keyboard | `04D8:EED2` descriptor `CTRL` |
  | Logitech G604 Lightspeed | `046D:C539` |
  | Razer Kraken Ultimate | `1532:0527` |
  | NZXT Kraken Z73 AIO | `1E71:3008` (already SignalRGB-compatible) |
  | Lian Li 9.2" LCD | `1CBE:A092` / `1A86:AD26` (same serial `672DBE2A50B7C205`) |
- The app's `app.asar` config lists `Jungle_Leopard_Display` with `vidWhiteList:["33C3"]`, `pidWhiteList:["7788","7792"]` — that is the **display** path, not the L10 hub. The hub is the CH340 serial on COM4.
- Prior art:
  - `https://github.com/mnesler/jungle-leopard-pf360` — PF360 LCD protocol over USB CDC serial, VID **0x33C3**, 115200 8N1, frame `55 AA <len16> <cmd> <payload> <sum16>`; `jl.py`, `probe.py`, `lights.py`. This is the **LCD**, not necessarily the L10 hub.
  - `https://github.com/lencraft151-cloud/Jungle-Leopard-360-Watercool-addon-for-SignalRGB-` — SignalRGB LCD addon with a bridge; inspect for reusable device IDs/protocol.
  - `https://github.com/Lennox151/Jungle-Leopard-360-Watercool-addon-to-signal-rgb-lcd-display` — empty at recon.

## Unknowns to resolve with REA
1. Serial parameters for COM4: baud rate, data bits, parity, stop bits, flow control.
2. Exact frame format behind `55 04 02 00 00`: header, length/command fields, payload, checksum; whether it matches the PF360 `55 AA <len16> <cmd>` framing or is a different protocol.
3. LED count, channel/port map (the log's `fillCount` suggests 12 channels of 24/16 LEDs), color order, brightness/effect commands.
4. Which actions map to `setLight`, `live`, `freeDraw`, `startLight`, `endLight`, and how to stream per-LED colors continuously.
5. Whether the app writes raw serial or tunnels a protocol through `serialport` (the asar includes `node-serialport`).

## REA targets (in order)
1. `app.asar` — Electron JavaScript:
   - `analyze_javascript_application` with `detail: "summary"`, then drill into modules.
   - Search for: `Jungle_Leopard`, `L10`, `hidWhiteList`, `hidOnly`, `usagePage`, `0x5131`, `33C3`, `0x04D8`, `0x1A86`, `serialport`, `node-hid`, `koffi`, `CH375`, `ARGB`.
   - Identify the device descriptor for the L10 and the frame builder. Page by `node_id`, do not dump the whole 59 MB graph.
2. `resources\main\SDK\ch375_driver\CH375DLL64.dll` and `ingenic_display_driver.dll` — native, only if the JS calls into them.
3. Runtime (after confirming the hub is connected):
   - Start `Jungle Leopard Display.exe`, change an ARGB color/effect.
   - Capture USB with USBPcap + Wireshark (filter by the hub's VID/PID and endpoint).
   - Capture serial with a port monitor or `com0com` pair if the transport is CH340.
   - Correlate: one color change → exact bytes. Repeat with a second color to confirm field positions.
4. Serial capture (COM4):
   - The vendor app holds COM4; capture the CH340 USB bulk transfers with USBPcap + Wireshark while changing one color in the app.
   - Repeat with a second color and diff the frames. Confirm baud rate from the capture or the asar.
   - Close the app only for plugin testing.

## Implementation
- **Serial (primary, confirmed):**
  - `VendorId() { return 0x1A86; }`, `ProductId() { return 0x8042; }`, `Type() { return "serial"; }`.
  - `import serial from "@SignalRGB/serial"; serial.connect({baudRate:<from capture>, dataBits:8, stopBits:"One", parity:"None"})`, `serial.write(frame)`.
  - Use the exact COM4 device, not a user-chosen port.
- HID fallback only if evidence shows a second ARGB interface.
- Channels: one per hub port, `device.addChannel("Port 1", n)`; `device.SetLedLimit(total)`; `SubdeviceController()` if the hub exposes ports as subdevices.
- `Render()`: read canvas/subdevice colors, build frames, write. `Shutdown()`: black or `shutdownColor`.
- `ConflictingProcesses()`: return `["Jungle Leopard Display.exe"]` if SignalRGB supports it, so the app is closed automatically.

## Verification
- Confirm the hub's transport and VID/PID from the app, not from the box's unrelated devices.
- Stop `Jungle Leopard Display.exe`; plugin loads and drives every hub port.
- Test: all ports red, then a walk across ports, then a moving effect.
- Reconnect after unplug/replug and after app restart.
- Confirm no vendor process is required.

## Deliverables
- `plugins/JungleLeopardL10/JungleLeopardL10.js`
- `plugins/JungleLeopardL10/README.md` (VID/PID/transport, frame format, port map, test steps)
- `plugins/JungleLeopardL10/evidence/NOTES.md` (REA Evidence IDs, captures, observed vs inferred)
- Optional probe scripts under `tools/` (redact serial numbers).

## Stop conditions
- If the L10 cannot be identified because it is not connected, report that with the evidence and ask the coordinator to have the user connect it. Do not guess a device and write to it.
- Never flash firmware or write to the display/firmware collections.
