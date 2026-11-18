# Jungle Leopard L10 ARGB Hub - reverse-engineering evidence

Date: 2026-11-11. Worktree: `jungle-l10`. Host: SignalRGB 2.5.86.

## Target

`C:\Program Files\Jungle Leopard Display\resources\app.asar` (vendor app, Electron),
extracted to `recon/jl-asar/`, beautified sources in `recon/pretty/`.

REA evidence bundle for the app directory: `ev_4d94747f1366f5a0462e8f0d2caa237c5e782f457f891ef568015e9867d5e8b4`
(REA MCP `analyze_javascript_application`, `integrity_policy: record-and-continue`;
one entry failed integrity - unpacked `ffmpeg.exe` - which is why record-and-continue was used.
The record was too large for the MCP stdio reply, so the static conclusions below were
taken from the extracted JS itself, not from the REA summary.)

## Transport and identity - OBSERVED

- Windows enumerates `USB\VID_1A86&PID_8042\<serial>` as CH340 "USB2.0 To Serial Port",
  COM4. SignalRGB log: `Found USB Parent Device: [USB\VID_1A86&PID_8042\<serial>]`.
- Vendor `config.json` (`%APPDATA%\Jungle_Leopard_Display\config.json`):
  `{"v2_932fcb":{"model":"HID_LIGHT_1A86_8042","num":10,...}}` -
  model name encodes VID/PID, 10 ports, 600 LED total capacity, `exitPorts` 0/5/6/7,
  recorded fillCount `[24,0,0,0,0,24,16,16,0,0,0,0]`.
- Vendor `main.log` binds COM4 and issues `setLight`/`live`/`freeDraw`/`startLight`/`endLight`
  against `5504020000` (excerpt in `vendor-log-excerpt.txt`).
- Live probe (`tools/jl_probe.py`, `jl_probe_chunks.py`) at 2,000,000 8N1:
  handshake `55 15 01 00 00` returns a 21-byte status; uid `v2_932fcb`, port count 10,
  firmware `1.2`. `bindPort 55 15 03 00 00` returns per-port flags.
- Live frame test (`tools/jl_test.py`): fillCount and colour frames are acknowledged with
  `55 04 02 00 00`, and 1-LED, single-port and all-10-port colour frames all visibly
  changed the strip colours.
- SignalRGB created `HKCU\Software\WhirlwindFX\SignalRgb\devices\1a86:8042:<serial>:COM4`
  with `Port 1` .. `Port 10`, each populated with a 30-LED `Default Strip - 30`.
  After enabling the device in the layout, the Layout panel lists
  `Jungle Leopard L10 ARGB Hub` + Port 1..10, and COM4 open returns `PermissionError`,
  i.e. SignalRgb holds the port and the plugin's `Initialize()` ran.

## Protocol - OBSERVED (source + live)

Static anchors in `recon/pretty/device_light.js`:

| What | Lines |
|---|---|
| handshake `[0x55,0x15,0x1,0,0]` | 494 |
| bindPort `[0x55,0x15,0x3,0,0]` | 590 |
| fan/mode status query `[0x55,0x15,0x2,0,0]` + 0x2c reply parse | 63-102, 936 |
| fillCount key `[0x55,0x25,0x22,0,0,0,0]` + len16 + value + xor8 | 644-651 |
| colours key `[0x55,0x25,0x21,...]` + len16 + RGB + xor8 | 925, 975 |
| effect frames `55 25 25 01 xx` / `55 25 25 00 xx` | 463, 481 |

Frames (host -> hub):

```
handshake 55 15 01 00 00
bindPort  55 15 03 00 00
fillCount 55 25 22 00 00 00 00 | len16be(value+1) | [00..0B] + [12 per-port counts] | xor8(value)
colors    55 25 21 00 00 00    | len16be(rgb+1)    | R G B ... port order            | xor8(rgb)
```

`xor8` is the XOR of the payload only. The colour stream is flat RGB in port order; the
firmware partitions it by the last fillCount frame. ACK for all commands: `55 04 02 00 00`.

Baud rate: `recon/jl-asar/main/_baseClass/serialport.js` sets `2_000_000`, 8N1.

## Motherboard ARGB input / mode 2 - OBSERVED static, corroborated in hardware

`device_light.js` lines 45-50:

```
FAN_SPEED_LIGHT_MODE_LABEL = {
  0: 'lights off',
  1: 'controlled by controller',
  2: 'controlled by motherboard',
  3: 'controlled by host software'
}
```

The mode is read from the 0x2c-byte `55 15 02` status reply (lightMode at byte 0x29,
fanMode at 0x2a). A whole-asar search finds no setter for it: the only `55 15` commands
are 01 (info), 02 (status) and 03 (bindPort). So the vendor app cannot switch modes over
serial; mode selection is physical/hub-side.

Hardware corroboration: the hub's ARGB input is wired to a Colorful Z590M 5V header.
Driving that header (ARGB1 or ARGB2) lit nothing on the L10 fans, while serial frames drove
every port. Conclusion: hub stayed in mode 3; the ARGB input is not a usable control path.

## Inferred (not directly proven)

- Handshake status byte layout beyond uid (3..5), port count (14) and firmware minor (17)
  is guessed from how the plugin uses it; other bytes are unused.
- 60 LEDs/port is taken from the 600 total / 10 ports in the vendor config; firmware
  behaviour above 60 per port is untested.
- Physical silkscreen port numbers are assumed to map to fillCount/colour stream order
  0..9 (matching `allPorts` in config.json); not labelled on the hardware during this test.

## Unknown / not tested

- Visual verification of Render (moving effect), live reconnect and Shutdown on hardware
  from inside SignalRGB is pending; the coordinator runs it after the shared SignalRGB
  window is free. Protocol frames themselves were verified with the standalone probe.
- USBPcap capture of the vendor app was not possible without elevation; direct serial
  probing and static reversal were used instead (per the UAC rule, no elevation attempted).
- No firmware write, OTA, or display/firmware collection was touched. Only COM4 serial
  frames were sent, and only `Jungle Leopard Display.exe` was stopped.

## Dark-fan debug, 2026-11-11 01:5x-02:0x - OBSERVED

User reported all L10 fans dark with SignalRGB running and the device enabled. Instrumented
the plugin with `device.log(msg, {toFile: true})` and restarted SignalRGB twice (both
approved). SignalRGB 2.5.86.

Session `SignalRGB_20261111_015639.log` (first instrumented run, PID 23120 restart):

```
01:56:52.283 ... L10 Initialize entry
01:56:52.346 ... L10 connect: isConnected=true
01:56:53.497 ... L10 handshake rx 0B:
01:56:53.497 ... L10 handshake returned no status; using defaults
01:56:53.497 ... L10 fillCount 30,30,30,30,30,30,30,30,30,30 ->
                 55 25 22 00 00 00 00 00 19 00 01 02 03 04 05 06 (34B)
01:56:53.582 ... L10 Render first: counts=30,...,30 rgb=900B
                 first=e0 d3 cb e2 d7 d0 e3 d8 d1 ...
```

Session `SignalRGB_20261111_020420.log` (second run, with handshake retry + ACK reads):

```
02:04:33.963 ... L10 connect: isConnected=true
02:04:50.526 ... L10 handshake total rx 0B          <- 15 tries, each read ~1 s timeout
02:04:50.526 ... L10 fillCount ... (34B)
02:04:51.607 ... L10 fillCount rx 0B:
02:04:51.643 ... L10 Render first: counts=30,...,30 rgb=900B first=04 03 ...
02:04:51.695 ... L10 colours frame 909B
02:04:52.725 ... L10 colours rx 0B:
```

Conclusions from these logs (observed):

- `Initialize()` runs, the serial library reports connected, the port is bound to the
  `1a86:8042:...:COM4` engine thread.
- Render runs and produces 900 B of RGB (30 x 10 ports), so the canvas is NOT empty.
  FillCount and colour frames are byte-identical in structure to the standalone test.
- The hub never replies: 0 bytes to handshake (15 attempts, ~16 s) and 0 bytes to both
  fillCount and colour frames. In the standalone probe every one of those commands was
  ACKed with `55 04 02 00 00`.

Standalone A/B after stopping SignalRGB (user-approved window):

- COM4 opened fine with pyserial at 2,000,000 and at 115,200.
- PnP: `USB\VID_1A86&PID_8042\<serial>` status OK, COM4 present.
- Modem lines: CTS false, DSR false, RI false, CD false.
- Every write timed out (`SerialTimeoutException: Write timeout`) even for the 5-byte
  handshake, at both baud rates; no RX. This did not happen earlier today when the same
  probe lit the LEDs.

Working hypothesis (inferred, unproven): the CH340/hub TX path is wedged - most likely the
hub firmware stopped accepting USB data while SignalRGB was streaming ~909-byte frames at
~60 fps, and the driver now has a stalled OUT endpoint. A plain USB power cycle (replug the
hub or toggle its power) is the next step; it needs the user's hands. Only after that can a
clean pyserial 2M A/B distinguish "SignalRGB serial layer uses the wrong baud/settings"
from "hub firmware wedged".

Not yet ruled out: SignalRGB's serial wrapper not actually applying `baudRate: 2_000_000`
(the only serial plugin in the catalog uses 9600-512000, and `Serial.getDeviceInfo()` was
not logged yet). A wrong baud would also explain 0-byte replies and dark LEDs, but not the
standalone write timeouts.

Plugin changes kept for the next session: `device.log(..., {toFile: true})` diagnostics,
handshake retry loop, ACK reads after fillCount and the first colour frame, safe fallbacks
for `LedCount`/`getColors`. These are diagnostic-only and should be trimmed once the root
cause is fixed.


## Port model and built-in diagnostics, 2026-11-11 22:xx - OBSERVED static + self-check

User map: Port 2 = 3 fans (24 LEDs), Port 8 = 2 fans (16), Port 10 = 2 fans (16);
all other ports unused. A Palit 3080 Ti ARGB cable into the hub's input is inert (GPU is
driven over SMBus by the shipped Palit/PNY plugin).

Plugin now exposes these controls (all in the SignalRGB device settings):

| Property | Type | Default | Applied |
|---|---|---|---|
| fansPerPort | textfield, comma list of 10 | 0,3,0,0,0,0,0,2,0,2 | Initialize (reload device) |
| ledsPerFan | number 1-60 | 8 | Initialize (reload device) |
| reversePorts | textfield, comma list of 10 0/1 | 0,0,0,0,0,0,0,0,0,0 | every Render (live) |
| portLedCounts | textfield override, up to 12 values | empty | Initialize (reload device) |
| diagnosticMode | combobox Off / Port walk / LED walk | Off | every Render (live) |
| diagnosticPort | number 1-10 | 2 | every Render (live) |

Counts = fansPerPort[p] * ledsPerFan, clamped to 60 per port and 600 total. A non-empty
portLedCounts wins; malformed override falls back to the fans model and logs
`bad portLedCounts`. Ports with count 0 are not added as channels and never appear in
fillCount or the payload. reversePorts[p]=1 reverses the LED triplets of that port only.

`tools/plugin_selfcheck.mjs` (no hardware, stubs Serial/device) checks: fans model channels
and fillCount, colour frame checksum, per-port payload positions, per-port reversal,
override winning and clamping, malformed override fallback, fans clamping, LED walk
(one LED lit in Port 8, index logged), port walk (one full port white), and Off using
canvas colours. All checks pass.

SignalRGB restart with this build (PID 9676, 22:40): plugin loaded and logged
`L10 ports: counts=0,24,0,0,0,0,0,16,0,16 reverse=0000000000 (3 active)`. The hub itself
still does not accept connections (`L10 connect failed (port busy or hub not responding)`;
COM4 open is denied while SignalRgb holds it, and standalone writes timed out last night),
so no hardware visual test yet - the hub needs a USB power cycle first. Registry still
lists old Port 1..Port 10 values from earlier runs; the plugin only creates Port 2/8/10,
so stale entries are inert.

### Handshake validation and count source fix, 2026-11-11 22:4x

- The retry loop no longer concatenates raw reads: stale bytes are drained before each
  attempt, the buffer is trimmed to the `55 04 02` header, and a reply is accepted only
  when it is >= 21 bytes with a port count in 1..12. This kills the bogus
  `uid v2_000055, 153 ports` parse the user saw.
- fillCount and the colour payload now come from the configured port model
  (`portLedCounts` / fans model), not from whatever LED counts the SignalRGB layout
  channels happen to hold. The earlier build sent 0,30,0,...,30 because the stale layout
  channels were 30 LEDs each. Payloads are normalised to the configured count per port.
- portLedCounts default is now the measured `0,24,0,0,0,0,0,16,0,16`.
- Self-check extended: garbage-then-valid handshake parses uid v2_932fcb / 10 ports;
  garbage-only logs "no valid status" and never a bogus uid.

Live empirical mapping note from the user: with fillCount [60]*10, stream block 2 lit the
bottom 3 fans; with [24]*10, stream block 2 lit the front 2 fans. So the hub's byte-to-port
partition depends on the declared counts and the vendor port numbers are not physical
order. A three-block probe with fillCount [24,16,16] (24 red / 16 green / 16 blue) is the
next step once SignalRGB releases COM4.

### fillCount / payload partition analysis, 2026-11-11 late

- fillCount is always a 24-byte value: fixed prefix 0x00..0x0B plus a 12-slot count table
  (device_light.js 644-651). 12 is the protocol maximum, not the port count: the hub
  config says num=10 / allPorts=[0..9]. Vendor counts [24,0,0,0,0,24,16,16,0,0,0,0] mean
  populated firmware ports 0,5,6,7 (24,24,16,16); exitPorts matches.
- The vendor sends one flat colour payload, not fixed 60-byte port blocks. sendPos keys are
  (global fan index * ledsPerFan + led) * 3, with gaps zero-filled; the global fan index
  comes from the cumulative sum of populated ports' fan counts in sorted port order
  (lines 296-302, 760-790). Payload offset per port = sum of declared counts before it.
- Measured check: with fillCount ports 1,7,9 = 24,16,16, port 7 starts at offset 24, and
  its green block lit the FRONT group. Ports 1 and 9 lit nothing. So offset partitioning
  follows declared counts and firmware port 7 is the front group.
- Later block scan (coordinator) to map each 60-LED block to a physical group and settle
  bottom/back port indices.

### SOLVED: fixed 60-stride wire model, 2026-11-11 - OBSERVED (user/coordinator block scan)

Two rounds of block scans with SignalRGB stopped settled the earlier contradiction between
the vendor's cumulative-offset partitioning and what the hub actually does:

- The vendor source (sendPos offsets = cumulative populated counts) does NOT describe the
  wire behaviour of this hub firmware. Its 12-slot table and cumulative offsets are how the
  vendor app built frames for a different code path; the hub ignores them.
- The hub accepts one frame shape only:
  - fillCount MUST be `60` for all ten ports (`0,60,60,60,60,60,60,60,60,60` in the 12-slot
    value; slots 11-12 remain 0).
  - The colour payload MUST be 600 LEDs / 1800 bytes. Each port owns a fixed 60-LED block:
    block start LED = `(port - 1) * 60`.
  - The real N LEDs of a populated port are written at the start of its block; the rest of
    the block and all unused blocks must be black.
- A fillCount containing zeros (e.g. `0,0,0,0,0,24,16,16,0,0`) is rejected by the hub, which
  falls back to its stored purple default. This explains the earlier "only port 8 responds"
  and "stateful mapping" results: those probes changed the declared partitioning and the hub
  either ignored them or fell back.
- Physical mapping with the fixed-60 shape (1-based firmware ports):
  port 6 = bottom 3 fans (24 LEDs), port 7 = back 2 fans (16 LEDs),
  port 8 = front 2 fans (16 LEDs). Ports 1-5, 9, 10 unused. The VGA ARGB cable into the hub
  input is inert.
- Wedge recovery: DTR low ~0.3 s then high, then reopen/handshake, revives a hub whose TX
  path has stalled. There is no reset command in the protocol. SignalRGB's serial API has
  no setSignals/setDTR (strings in `SignalRgb.exe`: `setSignals` 0, `setDTR` 0), so the
  plugin reconnects with retry but cannot pulse DTR itself; `tools/l10_reset.py` does it.

Plugin now implements exactly this: `fansPerPort` default `0,0,0,0,0,3,2,2,0,0`,
`ledsPerFan` 8, `portLedCounts` empty override (logical counts only), fixed wire fillCount
60x10, fixed 1800-byte payload, per-port 60-LED blocks, per-port reversal inside the block.
`tools/plugin_selfcheck.mjs` asserts all of it (36 checks, no hardware).

Direction verified on hardware one LED at a time via the fixed 60-stride payload (user,
2026-11-11 late):

- Port 6 (bottom 3 fans, horizontal): LED 0 at the left, runs left to right.
- Port 7 (back 2 fans, vertical): LED 0 at the top, runs top to bottom.
- Port 8 (front 2 fans, vertical, inverted mounting): LED 0 at the bottom, runs bottom to top.

Natural order, no firmware reversal. The user wants both vertical groups to flow top to
bottom, so the plugin default is now `reversePorts = 0,0,0,0,0,0,0,1,0,0`: Port 8 is
reversed by the plugin (bottom-to-top natural becomes top-to-bottom), Ports 6 and 7 stay
natural (left-to-right and top-to-bottom). The mapping itself is unchanged; only the default
setting moved.

Full SignalRGB visual test with this build: the user confirmed all three groups follow the
effect. One log defect remained and is fixed: the handshake saw 131 B of queued
`55 04 02 00 00` ACKs (from fillCount/colour frames) and failed to find the 21-byte status,
so the plugin fell back to defaults. The plugin now drains the input until empty immediately
before writing `55 15 01`, and accepts a candidate only when it is >= 21 bytes with a
non-zero uid (bytes 3..5) and a port count in 1..12; ACK-shaped frames are skipped. The
device worked even in the fallback because the port model and wire frame are fixed.

Self-check covers the backlog case: 131 B of ACKs then a valid status parses `uid v2_932fcb`
/ 10 ports, and an ACK-only reply logs `no valid status` with no bogus uid (36 checks pass,
including the default Port 8 reversal).

## Vendor live pacing and the answer rate (2026-11-13)

Vendor source read from `C:\Program Files\Jungle Leopard Display\resources\app.asar`,
main-process file `main/_baseClass/device_light.js` (minified). The live path is
`startSend()`:

- builds the flat `sendPos` payload and does `await this.write({value: payload, noRecord: true})`;
- `write()` only resolves when the port emits `data` — the device's reply — with a
  2000 ms (`0x7d0`) timeout, unless the caller passes `noWait`. `fillCount`
  (`localSetFanCount`) waits the same way; only fan duty and `bindPort` use `noWait`;
- `loading` guards overlapping sends and the next call is scheduled with
  `setTimeout(1000 / rate)`, where `rate` is 30 (`liveRate` in
  `sendPic_getMaxSizeAndRate`), reduced only while an effect recording is running.

Because each frame waits for its reply, the vendor's real streaming rate is the
device's reply latency, not 30 fps.

Measured on COM4 with the port to ourselves (`python tools/l10_latency.py` style probe,
2026-11-13): a 1804-byte colour frame is ACKed after **122-126 ms** (5/5 frames), so the
vendor app's live loop settles at about **8 fps**.

SignalRGB's `Serial.read` is not usable for that pacing: every call inside `Render()`
blocks for about one second, whatever byte count is asked for (measured: renders 1.0/s
with a read per frame, 29.8/s without). Reading the ACK is therefore out of the render
path entirely; the plugin paces itself to the measured 8 fps (`MAX_WRITE_HZ = 8`), which
is the vendor's real rate, and detects failure only through the write call (short or
throwing writes).

This replaces the earlier 30 Hz stream, which was ~4x the rate the firmware answers at
and left the hub holding its last frame until the CH340 was re-enumerated.
