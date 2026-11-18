# Shared contract — 3 SignalRGB plugins

## Goal
Three independent SignalRGB plugins that drive the LEDs directly, with **no vendor app running in the background**:

1. `RainbowMusicLedDirect` — WiFi LED strip, direct over LAN.
2. `JungleLeopardL10` — L10 ARGB hub, direct over its USB transport.
3. `ColorfulZ590M` — CVN Z590M GAMING FROZEN V20 onboard + ARGB headers, direct over HID.

## Repo layout (per worker worktree)
```
plugins/<Vendor>/<Plugin>.js     # the deliverable
plugins/<Vendor>/README.md       # model IDs, channels, protocol, test steps
plugins/<Vendor>/evidence/       # REA Evidence IDs, captures, notes
```

## SignalRGB plugin API (from shipped 2.5.86 plugins + official repo types)
Required exports:
```js
export function Name()        { return "..."; }
export function VendorId()    { return 0x....; }   // HID/serial plugins
export function ProductId()   { return 0x....; }
export function Publisher()   { return "..."; }
export function Type()        { return "HID"; }    // "HID" | "RAWUSB" | "SMBUS" | "serial"
export function DeviceType()  { return "motherboard" | "lightingcontroller" | "other"; }
export function Size()        { return [w, h]; }
export function Validate(endpoint) { return endpoint.usage_page === 0xFF01 && endpoint.usage === 1; }
export function Initialize()  { /* open device, build channels */ }
export function Render()      { /* read canvas, write frame */ }
export function Shutdown(SystemSuspending) { /* black or shutdownColor */ }
```
Useful globals/methods (see `types/device.d.ts` in the official repo):
- `device.write(data, length)`, `device.send_report`, `device.read`, `device.get_report`
- `device.set_endpoint(interface, usage, usagePage, collection)`
- `device.addChannel(name, ledCount)`, `device.channel(name)`, `device.SetLedLimit(n)`
- `device.setControllableLeds(names, positions)`, `device.setSize([w,h])`
- `device.setName`, `device.setImageFromUrl`, `device.notify`, `device.log`, `device.pause(ms)`
- `device.createColorArray(color, count, "Inline")`, `device.color(x,y)`
- `LightingMode` (`"Canvas"` / `"Forced"`), `forcedColor`, `shutdownColor`
- Serial: `import serial from "@SignalRGB/serial"; serial.connect({baudRate,...}); serial.write([...])`
- HTTP: `XMLHttpRequest` works in the plugin sandbox (proven by RmlAPPSync.js).

Reference plugins on this box:
`%LOCALAPPDATA%\VortxEngine\app-2.5.86\Signal-x64\Plugins\`
- HID skeleton: `CoolerMaster\Cooler_Master_ARGB_Controller.js`
- HID + Validate + channels: `Nzxt\NZXT_Motherboard.js`
- Serial skeleton: `OEM\OEM_Devices_Controller.js`
- HTTP/XMLHttpRequest: `%LOCALAPPDATA%\WhirlwindFX\SignalRgb\cache\addons\89e1c67a005a4f12eb9621c1d68f9f31\RmlAPPSync.js`
- Full official source: `https://gitlab.com/signalrgb/signal-plugins` (cloned at `recon\signal-plugins` during recon).

## Test procedure (same for all 3)
1. Copy plugin folder to `%USERPROFILE%\Documents\WhirlwindFX\Plugins\<PluginName>\`.
2. Restart SignalRGB (`SignalRgb.exe`), or reload the device in the UI.
3. Watch `%LOCALAPPDATA%\WhirlwindFX\SignalRgb\Logs\SignalRGB_*.log` for plugin load/runtime errors.
4. Select the device in SignalRGB, run a static effect and a moving effect.
5. Verify with the vendor app **stopped**: unload its service/process, then re-test.
6. Record screenshots/video + log excerpts under `evidence/`.

SignalRGB currently runs from `%LOCALAPPDATA%\VortxEngine\app-2.5.86\Signal-x64\SignalRgb.exe` (PID 20672 at recon time).

## REA rules
- Prefer the REA MCP tools when available (`open_binary`, `analyze_javascript_application`, `search_strings`, `decompile`/pseudocode, `capture_process_scenario`, `inspect_web_network_capture`, etc.).
- If MCP is absent, use the CLI: `npx -y rea-agents@6.4.0` (REA 6.4.0).
- Static analysis first; runtime observation only when static evidence cannot answer the question.
- Every conclusion in `evidence/NOTES.md` must cite an Evidence ID or an exact file offset/address. Separate **observed**, **inferred**, **unknown**.
- Do not infer protocol bytes from filenames or random strings. Corroborate with a second evidence type (disassembly + capture, or JS source + runtime).
- Never write firmware, never flash, never touch BIOS/EC. Read-only probing until a write is proven reversible.

## Out of scope (user-confirmed 2026-11-11)
Present on the box but **must never be opened, probed, or written**:
- Massdrop Ctrl keyboard — `04D8:EED2` (`CTRL`)
- Logitech G604 Lightspeed — `046D:C539`
- Razer Kraken Ultimate — `1532:0527`
- NZXT Kraken Z73 AIO — `1E71:3008`
- Lian Li 9.2" LCD — `1CBE:A092` / `1A86:AD26`

`1A86:8042` COM4 is **not** out of scope: the vendor log proves it is the Jungle Leopard L10 hub. Only the Plan 2 worker may open it.

## Hardware safety
- Only the device owned by the plan may be opened/written. Do not touch other HID devices.
- Never write to Colorful MI_01 (`usage page 0xFF00`, `X570-USBHID-LED`) — that is the firmware-update collection.
- Stop only your vendor's process/service. Do not stop `iGameCenterService` from the Jungle Leopard worker or `rmlapp` from the Colorful worker.
- Color writes are allowed after the frame layout is verified. Start with a single LED/zone at low brightness, then a full frame.
- If a probe could brick or persist state, stop and report instead.

## Tool installation
Approved for this job. Expected tools: Python 3 + pip (`hidapi`, `pyserial`, `pyusb`, `pyinstxtractor`, `decompyle3`/`pycdc`), Wireshark/tshark + USBPcap, Node.js, `npx rea-agents@6.4.0`, OpenRGB (reference only), `git`, `gh`.

## UAC / elevation rule (user, 2026-11-11)
Whenever a UAC/elevation approval is needed, **stop and ask** — never attempt it silently, never use `Start-Process -Verb RunAs`, and never bypass elevation.
- Workers: send an Orca question with subject `UAC approval needed`, containing the exact command, why elevation is required, what it changes, and the rollback.
- Coordinator: surface it to the user with `AskUserQuestion` before approving; reply to the worker after the user confirms.
- Applies to driver installs (USBPcap, CH340, PawnIO), service start/stop, and elevated device probes.
- Non-elevated read-only work continues normally.

## Concurrency
- All 3 workers run on the same physical box and the same SignalRGB instance.
- Use unique plugin folder names. Do not edit another worker's plugin.
- SignalRGB can only hot-load one broken plugin gracefully; if the app crashes while testing, restart it and note which plugin was last loaded.
- USB HID handles are exclusive. If a device is busy, identify the holder (`Get-Process`, `handle64.exe`) and stop only your vendor app.

## Definition of done (each)
- Plugin loads in SignalRGB with the vendor app stopped.
- Static color, per-LED/per-channel mapping, and a moving effect all work.
- Shutdown/suspend goes dark or uses `shutdownColor`.
- Reconnect after app restart works.
- `README.md` + `evidence/NOTES.md` complete.
- Work committed on the worker branch.
