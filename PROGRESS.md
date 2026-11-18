# Progress — 2026-11-11

Status: **four devices done.** Three plugins work, are verified on hardware, and all three appear in
the SignalRGB Layouts sidebar (2026-11-12); the Massdrop CTRL keyboard was reflashed to QMK with the
SignalRGB protocol and is controlled by the shipped plugin. Merged into `main` at `9d85a6e`.

## Delivered

| Plugin | Device | Transport | State |
|---|---|---|---|
| `plugins/RainbowMusicLedDirect/` | Rainbow Music Led WiFi strip | WLED UDP 7778 | working |
| `plugins/JungleLeopardL10/` | Jungle Leopard L10 ARGB hub | CH340 serial COM4 | working |
| `plugins/ColorfulZ590M/` | CVN Z590M GAMING FROZEN V20 | USB HID 2F4C:1000 MI_02 | working |

Installed copies (what SignalRGB loads):
`%USERPROFILE%\Documents\WhirlwindFX\Plugins\{RainbowMusicLedDirect,JungleLeopardL10,ColorfulZ590M}\`

Worker worktrees and branches:
`%USERPROFILE%\orca\workspaces\signalrgb-plugins\{rainbow-wled,jungle-l10,colorful-z590m}`

## Device 1 — Rainbow Music Led (done)

- Strip: `<strip-ip>`, WLED 0.13.0-b3, 118 LEDs.
- Protocol proved: UDP port **7778** (from `/json/cfg` `if.sync.port0`, not the default 21324),
  DRGB `0x02`, packet `[0x02, timeout, R0G0B0 … R117G117B117]` = 356 bytes, 17–22 Hz observed.
- Fallback: `POST /json/state` with `seg.i` per-LED colours (supported by 0.13.0-b3).
- Verified: static colour, per-LED mapping, moving effect, reconnect after app restarts.
- Commit `00896e0`, branch `rainbow-wled`.
- Open: `Shutdown()` black frame never observed at runtime. Cause identified: when the DRGB stream
  stops, WLED leaves realtime mode and restores the state it had before realtime, which is a blue
  preset — pausing the effect in SignalRGB goes dark, quitting SignalRGB comes back blue. The vendor
  app sends an explicit off frame on exit; SignalRGB does not call `Shutdown()` on quit.
  Fix in progress: set the WLED base state to off (`POST /json/state {"on":false}`) so the revert lands
  on off. No presets changed, no flashing.
- Geometry (user-supplied, from the WLED layout editor): the strip is a **rectangle perimeter**, 118 LEDs
  as four bars `16 + 43 + 16 + 43`. LED index 0 is the bottom-left corner (shown black in the editor).
  `/json/cfg` has no matrix/ledmap for this unit (`hw.led.ins` = one 118-LED 1D output, pin 2), so the
  ring comes from those bars: outer grid **45×16** (2×45 + 2×14 = 118). Defaults: `layoutShape=Ring`,
  `layoutWidth=45`, `layoutHeight=16`, `layoutStart=Bottom-Left`, `layoutDirection=Clockwise`.
  Index map: `0..15` left side bottom→top, `16..58` top left→right, `59..74` right side top→bottom,
  `75..117` bottom right→left. `tools/check_layout.js` asserts 118 unique closed slots.
- Off-on-quit fix: WLED reverts to its saved state (blue preset 250) when realtime stops. `on:false`
  cannot be used (it zeroes `bri`, which also blanks the realtime stream: pwr 218 vs 3489). The plugin
  now sets the running segment to solid black (`on:true, bri:255, fx:0`, black) before realtime, leaving
  the saved preset untouched. Measured: streaming pwr 3494+, after killing SignalRGB `live:false`,
  pwr 218, `fx 0`, black — not blue.
- Ring direction **verified physically** with `tools/wled_walk.py` (one LED at a time, 0.8 s):
  LED 0 at the bottom-left corner, the dot moves up the left side and travels clockwise. Matches the
  plugin defaults (`layoutStart=Bottom-Left`, `layoutDirection=Clockwise`).
- **Layouts sidebar fixed 2026-11-12.** The plugin exported `SubdeviceController() true` and
  `DefaultComponentBrand 'CompGen'` but never created a subdevice or channel, so SignalRGB built a
  zero-subdevice component: it listed in Devices and streamed, but never enumerated in Layouts.
  Nanoleaf-style single flat component is the right model — both exports removed, `setSize` +
  `setControllableLeds` in `Initialize` kept. Component now appears in Layouts (X5 Y40 W187 H67)
  and still streams (pwr 3494, 29 fps), surviving a restart. Commits `1dc6361` (discovery),
  `9bf4396` (layout), merged `55915c6`. Evidence `evidence/ui_layout_20261112.txt`.
  Note: the discovery sandbox `service.log` is not persisted to `SignalRGB_*.log` on 2.5.86, so
  plugin `dlog` lines never reach the log file; the Devices page is the reliable check.

## Device 2 — Jungle Leopard L10 (done)

- Transport: CH340 `USB\VID_1A86&PID_8042\<serial>` → **COM4**, 2,000,000 baud 8N1.
- Frames (observed live + static):
  - handshake `55 15 01 00 00` → 21-byte status (uid, 10 ports, fw 1.2)
  - bindPort `55 15 03 00 00`
  - fillCount `55 25 22 00 00 00 00 | len16be(value+1) | 00..0B + 12 per-port counts | xor8(payload)`
  - colours `55 25 21 00 00 00 | len16be(rgb+1) | flat RGB in port order | xor8(payload)`
  - every command ACKs `55 04 02 00 00`
- 10 ports, 600 LED capacity, 60 per port max. Channels `Port 1..Port 10`, default 30-LED strips.
- Motherboard ARGB input: firmware mode 2 = controlled by motherboard, but nothing in `app.asar`
  sets the mode (only `55 15 01/02/03`), so it is a physical/hub-side choice. Hub is in mode 3
  (host software), which is why the Z590M 5V headers light nothing on the fans.
- **Resolved 2026-11-11 22:00 (after reboot).** The CH340/hub TX path was wedged; a power cycle
  (reboot) cleared it. Under SignalRGB the hub now answers everything:
  handshake `55 04 02 93 2f cb 26 3b 38 99 8e 04 00 64 0a 0a` → `uid v2_932fcb, 10 ports, fw 1.2`,
  fillCount ACK `55 04 02 00 00`, colours ACK `55 04 02 00 00`. SignalRGB's serial layer does apply
  2,000,000 baud. **User confirmed the fans light.** The diagnostic build (handshake retry, ACK reads,
  toFile logging) is merged into `main` (`30ef026`).
- Earlier instrumentation that led here: `Initialize()` ran, `connect: isConnected=true`, frames were
  byte-correct, but the hub returned 0 bytes and standalone writes timed out at both 2 M and 115.2 k.
- Commits `55a1675`, `43ee474`; branch `jungle-l10`. Full debug section in
  `plugins/JungleLeopardL10/evidence/NOTES.md`.
- **Port map solved on hardware (late 2026-11-11).** Only three ports are used:
  **port 6 = bottom 3-fan group (24 LEDs), port 7 = back 2-fan group (16), port 8 = front 2-fan group (16)**.
  Ports 1-5, 9, 10 are unused. The VGA ARGB cable lights nothing (GPU is SMBus-controlled).
- **Wire rule:** fillCount must always be 60 for all ten ports, payload 600 LEDs / 1800 B, and each
  port owns a fixed 60-LED block (start = `(port-1)*60`). Real LEDs go at the start of the block.
  Sending zeros for unused ports gets the frame rejected and the hub falls back to its stored purple
  default — that produced the confusing "random" colours. Verified: block 5 red = bottom, block 6
  green = back, block 7 blue = front, all correct.
- **Software reset:** pulsing DTR low ~0.3 s then high, then reopening, revives a wedged hub
  (verified once). When DTR and RTS pulses both fail and every write still times out at any baud,
  the CH340 TX path is hard-stuck and the fix is a USB re-enumeration:
  `Disable-PnpDevice -InstanceId "USB\VID_1A86&PID_8042\<serial>"`, wait 5 s, `Enable-PnpDevice`
  (needs elevation; user approved). Verified 2026-11-12: handshake returned
  `uid v2_932fcb, 10 ports, firmware 1.2` immediately after. No reboot needed.
  SignalRGB's serial API has no documented DTR control; `tools/l10_reset.py` covers the pulse case.
- **Direction verified and set:** port 6 LED 0 left → right; port 7 LED 0 top → bottom; port 8 reversed by
  default (`reversePorts=0,0,0,0,0,0,0,1,0,0`) so both vertical groups run top → bottom. User confirmed
  both vertical groups now flow the same way and all three follow the effect.
- Handshake fixed: drain the input buffer before `55 15 01` and reject ACK-shaped replies; the log now
  reports `hub found: uid v2_932fcb, 10 ports, firmware 1.2`. Self-check `node tools/plugin_selfcheck.mjs`.
- **Working on hardware, verified 2026-11-12:** moving effect followed, all three fan groups synced,
  handshake clean on every SignalRGB restart since the re-enumeration.
  `tools/l10_reset.py` covers the DTR pulse; `tools/l10_reenumerate.ps1` covers the hard-stuck
  case (elevated, disable/enable the CH340 PnP device, then handshake).
- **GPU ARGB on Port 1 (measured 2026-11-12):** the Palit RTX 3080 Ti cable is on **port 1**,
  not the hub's motherboard input. 20 LEDs (indices 0-19), measured LED-by-LED; set
  `Port LED Counts Override` to `20,0,0,0,0,24,16,16,0,0` to get a Port 1 channel. The GPU is also
  driven over SMBus by SignalRGB's own plugin, so enabling both means two writers.
- **Recurring CH340 wedge (2026-11-12).** The TX path hard-sticks after long SignalRGB runs, even
  idle: every `Serial.write` then times out at any baud, DTR and RTS pulses do nothing, and the only
  fix is the USB re-enumeration (`tools/l10_reenumerate.ps1`, elevated). Symptom on the glass is the
  fans holding their last frame. Mitigation in the plugin: colour writes are capped at **30 Hz** and
  unchanged payloads are skipped, so a 1800-byte frame goes out ~54 KB/s instead of as fast as
  `Render` is called. Root cause is suspected TX-path saturation, not proven; watch whether the wedge
  returns.
- **Wedged again 2026-11-12 15:37**, on the first SignalRGB start after the USB power changes
  (`l10_usb_power.ps1`: selective suspend off, hub/CH340 power management off): the handshake
  returned no valid status and only the fillCount frame went out. A direct probe at 15:47 hung on the
  5-byte handshake write (real TX wedge), so the power settings did not prevent it.
- **Cleared without elevation.** After stopping SignalRGB the probe still hung, but a later probe at
  20:38 returned the full 21-byte status (`55 04 02 93 2f cb … fw 1.2`) and the next SignalRGB start
  logged `hub found: uid v2_932fcb, 10 ports, firmware 1.2`. The wedge clears on its own once the
  port is released; `tools/l10_reenumerate.ps1` (elevated) remains the last resort, not the default
  fix. LibreHardwareMonitor must be closed before it.
- **LibreHardwareMonitor blocks PnP removal on this box** (Kernel-PnP event 225 names it stopping the
  removal of hub `1A40:0101`). Close it before running the re-enumeration, or the script refuses
  (exit 5).
- **Last known good (2026-11-13 23:42).** Tag `l10-last-known-good` = commit `e10ff41`: the plugin
  paced to the hub's measured reply time, `MAX_WRITE_HZ = 8`, no `Serial.read` in `Render`. Ran clean
  from 23:42 to 01:11 (zero stall or write-failure lines, two SignalRGB restarts, clean handshakes).
  Vendor `startSend` awaits the reply (2 s timeout) so its live rate is the reply latency; measured
  ACK 122-126 ms per 1804-byte frame, i.e. ~8 fps. `Serial.read` inside `Render` blocks ~1 s per call
  (renders 1.0/s with it, 29.8/s without), which is why the ACK cannot be read for pacing.
  `tools/l10_latency.py` reproduces the measurement; details in `plugins/JungleLeopardL10/evidence/NOTES.md`.
- **15 fps trial failed (2026-11-15 01:52).** `MAX_WRITE_HZ = 15` ran ~48 h and wedged: COM4 opened
  but the 5-byte handshake write timed out, and a re-enumeration was needed. The rates explain it —
  the hub drains one 1804 B frame per 125 ms = **14.4 KB/s**; 8 fps is **14.4 KB/s** (matched, no
  backlog), 15 fps is **27 KB/s**, 1.9x the drain, so the surplus piles up for hours and stalls the
  CH340. 8 fps is therefore the hardware equilibrium, not tuning slack. Reverted; tag
  `l10-last-known-good` = `e10ff41` stands.
- Remaining: reconnect after a physical unplug/replug, `Shutdown()` with the user watching.
- Note: `SignalRgbLauncher.exe` is a watchdog — it relaunches `SignalRgb.exe` whenever the app dies.
  That explains the earlier "restart cycles"; stop both when a test needs COM4.

## Device 3 — Colorful CVN Z590M GAMING FROZEN V20 (done)

- Endpoint: `VID 0x2F4C PID 0x1000`, HID `MI_02`, usage page `0xFF01`, usage `1`, 65-byte reports.
  `MI_01` is usage page `0xFF00` (firmware collection) — never written, `Validate()` cannot select it.
- Frame: `[0x00, 0x01, 0x00, 0x88, index]` + 20×RGB; 140 LEDs = 7 data packets + `0xFF` commit.
- Channel map (proved by disassembly, confirmed by walk):
  slots `0..1` 12V RGB, `2..19` onboard (18), `20..79` ARGB1 (60), `80..139` ARGB2 (60).
- Hardware cap confirmed: 200-LED frame with slots 140..199 white lit **nothing** → 140 is real.
- Onboard polyline, proved one LED at a time:
  `2..13` right-edge vertical top→bottom (slot 2 top, 13 chipset end), `14..15` lower vertical,
  `16` bottom edge at the corner, `17..18` bottom edge leftward, `19` hidden behind SATA / unpopulated.
- Plugin canvas is 240x240 -> shown 120x120, and now **120x120 -> shown 60x60** (SignalRGB renders
  the layout card at half the canvas). 139 controllable LEDs authored on the 120 grid,
  wire slot = `2 + layout index`. Commit `436bd6b`, merged `b3cbd9b`.
- Open: both 5V ARGB headers light nothing (one broken, the other carries the L10 input and the hub
  ignores it in mode 3). This is a wiring fact, not a protocol bug.

## Device 4 — Massdrop CTRL (done 2026-11-12)

- Symptom was SignalRGB's `Missing Privileges` message. Root cause proved: the stock Drop firmware
  (VER Oct 20 2021, `massdrop/ctrl:p_ctrl__default`) exposes **no raw-HID collection**, so the
  shipped plugin's 32-byte write to interface 1 (the NKRO keyboard collection) fails with Win32
  error 5 — administrator rights cannot fix that.
- Fix: backed up the stock image, then flashed a QMK build carrying the SignalRGB protocol.
  - Backup `stock_ctrl_v1.bin`, 65536 B, SHA-256
    `9410FDAACD8935D64290807FBF6B1465BDACA538A43EF9CEE9C455B00070D21E` (kept in the worker scratch
    dir; copy it somewhere permanent if you want it long-term).
  - Flashed `drop_ctrl_v1_default_md.bin`, 54740 B, SHA-256
    `DB4654161DB9A02706ABEA3E5D022D57051CD9FF2D5959122906E082373199D6`, source
    `SRGBmods/QMK-Binaries` (outdated folder, only prebuilt SignalRGB image for CTRL v1),
    tool mdloader 1.0.7.
  - Bootloader: **Fn+B held ~3 s** (pinhole not needed). SAMD51J18A, bootloader v2.18, COM7.
  - Recovery: Fn+B re-enters SAM-BA; re-flash the backup with mdloader.
- Post-flash verified: raw HID `0xFF60`/`0x61` on interface 1; identity replies fw type 2,
  QMK 0.6.103, SignalRGB protocol 1.0.5, LED count 119; 14 colour packets + enable/disable accepted;
  user confirmed the keyboard works under SignalRGB.
- Shipped plugin `Massdrop_CTRL_QMK_Keyboard.js` v1.1.2 is wire-compatible (protocol 1.0.5 vs 1.0.6
  differs by one `#include`). Its line-124 test `!== 1 || !== 2` is always true and pops a cosmetic
  "Unsupported Firmware" notification — harmless, left untouched (cache addon, not ours).
- Evidence `plugins/MassdropCtrl/evidence/NOTES.md`, tools `tools/hid_probe.py`,
  `tools/verify-after-flash.py`, `tools/flash-ctrl-stage1.ps1`, `tools/flash-ctrl-stage2.ps1`.
  Commits `a5f3008`, merged `9d85a6e`.

## Device 5 — Yunari bridge / Kraken Z ownership (2026-11-12)

- Why: SignalRGB and Yunari cannot both open `1e71:3008`; SignalRGB switches it to `HybridUSB` and
  both writers scramble the glass. Yunari becomes the single owner; SignalRGB drives it through a
  virtual hub.
- Contract `%REPO%\yunari\docs\signalrgb-bridge.md` (hub descriptor, UDP `YRGB` 7788, HTTP
  controls/telemetry/lighting-mode). SignalRGB half: `plugins/YunariBridge/`, merged `4b94a6b`,
  installed to `Documents\WhirlwindFX\Plugins\YunariBridge`.
- Yunari half committed as `10f79b7eb` on branch `yunari-signalrgb-bridge` (worktree
  `%USERPROFILE%\orca\workspaces\yunari\signalrgb-bridge`): `DeviceSink` on `PanelDevice`,
  `createKrakenSink` reusing the panel's HID handle and `exclusive` queue, loopback YRGB receiver with
  newest-frame coalescing, controls/telemetry/lighting-mode routes, descriptor merged into the
  existing `GET /api/devices`. Decision `docs/decisions/0132-device-sink-seam-and-signalrgb-bridge.md`.
  **Merged into local `main`** as `e2eb7e1d7` (branch tip `c2afdc053`, not pushed); `npm run gate`
  green on main.
- Settings surface (2026-11-12): Yunari **Settings → SignalRGB** page (`c2afdc053`) shows bridge
  listening state, bound/stored UDP port, per-device rows with LED count, channels, layout and frame
  counters, plus how a device is added. Port is editable through `PUT /api/signalrgb-bridge`
  (validated 1..65535); it takes effect on the next host start, no live rebind.
- **Wire order correction:** the device wants **GRB** (shipped plugin uses `getColors("Inline","GRB")`);
  the UDP contract still carries RGB and Yunari reorders per LED.
- **Disabling the real Kraken in SignalRGB (no UI needed):**
  `HKCU\Software\WhirlwindFX\SignalRgb\lighting\endpoint\1e71:3008:344A35613131` → `enabled`
  (REG_SZ) = `false`. Verified in the log: USB still enumerates the device, but no Kraken engine
  thread / `HybridUSB` / `Nzxt_Kraken_Z3_AIO` init starts. Re-enable by deleting the value.
- Verified live 2026-11-12: descriptor lists `kraken-z` 40 LEDs ring 4x4 udpPort 7788; telemetry
  42.6 C / pump 1769 rpm 50% / fan 1022 rpm 50%; SignalRGB plugin frames arrive at Yunari's receiver
  (coalescing drops are normal at 30 Hz, `malformed` 0); no HID errors in the Yunari log.
- **Both halves proven live together** (Yunari HEAD `6bc9f9fc1`, 30 s window): 650 frames received at
  21.7 Hz, `malformed` 0, 184 newest-frame coalesced, every frame resolved to device index 0
  (40 LEDs), no LCD write refusals. SignalRGB stayed up (`SignalRgb.exe` PID 7608) with the Kraken
  endpoint disabled.
- Unverified: LED colour order/brightness on the glass (nobody watching), >30 s coexistence, fan
  behaviour at 0/100%. Yunari host start command (after `npm run build` in `src/web`):
  `node packages/host/bin/yunari.js -n`.
- Gap: SignalRGB network plugins have no fan API, so fan/pump percentages are reachable only over
  Yunari's own HTTP route, not from a SignalRGB effect.
- **Layout position reset fixed (2026-11-13).** Every descriptor change used to remove and recreate
  the subdevice (`Starting Removal of Subdevice … Destroying Sub device`), which threw away the
  saved canvas position/scale. `setDevices` now syncs in place: existing uids are updated only when
  name/geometry changed, new ids are created, disappeared ids are removed. A mismatched ring also
  derives the square from its LED count (40 LEDs = 11x11) instead of flattening to a 40x1 strip, so
  the fallback default and the live descriptor agree. Verified: SignalRGB restart with Yunari down
  (fallback) then Yunari up, and a plain Yunari restart — `Removal of Subdevice` count 0 in both,
  endpoint position/scale values unchanged. Commit `cbc7e7c`.
- Host descriptor corrected for the real hardware (2026-11-13): the Kraken's 40-LED channel is the
  controller's capacity, three 8-LED AER RGB fan rings are daisy-chained to it (24 lit, 16 empty
  slots) and the pump is an LCD with no LED ring. The sink publishes
  `{shape:"rings", width:3, height:3, count:3}` with `ledCount` 40; the plugin places 24 LEDs on an
  11x3 canvas and sends black for the rest. Yunari `aa09025c0`; contract documents strip/ring/rings.
- **Wrong ring geometry (11x11) shipped and reverted.** `1912cc885` had published `ring 11x11`,
  which drew the fans as a rectangle whose columns lit together. Ring math stays only for genuine
  rings; a mismatched ring degrades to a strip.
- Plugin `setSubdeviceLeds` bug fixed (`a72a559`): the API takes parallel x and y arrays, not
  `[x,y]` pairs. Passing pairs made every LED sample one pixel, so the Kraken lit as a single unit.
- Yunari main is built and the host now runs from `%REPO%\yunari`
  (`node packages/host/bin/yunari.js --no-browser --port 5227`). Verified live: descriptor
  `{shape:"rings",width:3,height:3,count:3}`, 40-LED frames with only indices 0-23 carrying colour.

## Device images and L10 hub recovery (2026-11-15)

- All four plugins export `ImageUrl()` with the photo **embedded as a `data:` URI**.
  `Image()` is dead in this SignalRGB build (`ReferenceError: Image is not defined` in a shipped plugin);
  `ImageUrl()` is the only supported route, and the plugin sandbox has no way to address its own
  folder (no `__dirname`, no relative-path API), so a `file://` URL had to be machine-absolute.
  The zippo-2024/RmlAPP-Sync community plugin solves the same problem by hosting its icon on
  GitHub raw and calling `device.setImageFromUrl(url)`; that trades a local path for an external
  dependency, so it was not copied.
- Verified 2026-11-15 on SignalRGB 2.5.86: a `data:` URI in `ImageUrl()` renders on the Devices
  page. All four cards show their photos (L10 hub, Rainbow monitor, Yunari Y, Colorful board).
  `tools/embed_image_urls.py` regenerates the URIs from the photos kept in each plugin folder and
  copies the result into the installed plugin directory.
- **Hub recovery has no in-plugin button.** The plugin API is sandboxed JS: no exec/process spawn, and
  `ControllableParameters` has no button type. Chosen route (user picked "Elevated shortcut"):
  `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Recover L10 hub.lnk`,
  RunAs bit set, target `powershell.exe -NoExit -ExecutionPolicy Bypass -File
  "%REPO%\tools\l10_reenumerate.ps1" -RestartSignalRgb`. One UAC prompt,
  then it closes SignalRGB, re-enumerates `USB\VID_1A86&PID_8042\<serial>`, waits for COM4,
  handshakes, and restarts SignalRGB. The shortcut is outside the repo and is not recreated by it.
- `l10_reenumerate.ps1` gained `-RestartSignalRgb` and now allows `-DryRun` unelevated (the admin
  check used to run first and made a dry run impossible).

## Next session, in order

1. **L10 finish:** reconnect after unplug/replug, `Shutdown()` with the user watching.
2. **WLED finish:** observe `Shutdown()` on a real app exit (base-state fix already verified);
   physical ring-direction re-check is already done.
3. **Z590M finish:** sleep/resume, reconnect; layout card size is user-resizable and settled.
4. **Massdrop CTRL (done):** flashed QMK with the SignalRGB protocol; keyboard controlled by
   SignalRGB. Keep the stock backup somewhere permanent.
5. Optional: push branches, clean up worker worktrees.

## Notes and rules

- **UAC rule:** any elevation stops and asks the user via `AskUserQuestion`; no `Start-Process -Verb RunAs`,
  no silent elevation. Two elevations happened before the rule (worker 3 stopping `iGameCenterService`
  and `iGame.LightingService`); disclosed, rollback is `Start-Service iGameCenterService`.
- Out of scope, never touched: Massdrop Ctrl `04D8:EED2`, Logitech G604 `046D:C539`,
  Razer Kraken Ultimate `1532:0527`, NZXT Kraken Z73 `1E71:3008`, Lian Li 9.2" LCD `1CBE:A092`/`1A86:AD26`.
- Vendor apps not running: `iGameCenterService` and `iGame.LightingService` stopped,
  `Jungle Leopard Display.exe` stopped, `rmlapp.exe` / `WiFi Led Studio.exe` not running.
- SignalRGB restarted itself several times between 00:31 and 00:55 while the L10 UI automation was
  running; it stopped when that paused. One further exit at 01:49 was not initiated by us.
  No crash signature in the logs; one Crashpad event at 00:55:50 with `Write timeout` breadcrumbs.
- Leftover oddities, not from these plugins: one RAM stick lit pink and three dark, GPU lit by the
  active effect, WLED strip stayed blue after SignalRGB exited.

## Useful commands

```powershell
# start SignalRGB
Start-Process "$env:LOCALAPPDATA\VortxEngine\app-2.5.86\Signal-x64\SignalRgb.exe"
# newest log
Get-ChildItem "$env:LOCALAPPDATA\WhirlwindFX\SignalRgb\Logs\SignalRGB_*.log" |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
# plugin frame self-check
node tools/frame-check.mjs
# Orca worker state
orca orchestration worker-list --json
```
