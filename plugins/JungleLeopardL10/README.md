# Jungle Leopard L10 ARGB Hub - SignalRGB plugin

Direct control of the Jungle Leopard L10 10-port ARGB hub over its CH340 USB serial port, with `Jungle Leopard Display.exe` closed.

## Device

| Item | Value |
|---|---|
| USB | `USB\VID_1A86&PID_8042` (CH340, "USB2.0 To Serial Port") |
| Serial | COM4 on the test box, 2,000,000 baud, 8N1 |
| Hub status | uid `v2_932fcb`, 10 ports, firmware 1.2 |
| LED capacity | 600 total, 10 ports x 60 max |
| Conflicting app | `Jungle Leopard Display.exe` (declared via `ConflictingProcesses()`) |

SignalRGB shows the hub as `Jungle Leopard L10 ARGB Hub` with one channel per *populated*
port (`Port 6`, `Port 7`, `Port 8` with the default configuration).

## Wire format - hardware-verified

Two rules override what the vendor app's source suggests (see `evidence/NOTES.md`):

1. **fillCount is always `60,60,60,60,60,60,60,60,60,60`.** Declaring zero counts
   (`0,0,0,0,0,24,16,16,0,0`) makes the hub reject the frame and fall back to its stored
   purple default. The plugin never sends a fillCount containing zeros.
2. **The colour payload is always 600 LEDs = 1800 bytes.** Each port owns a fixed 60-LED
   block; block start = `(port-1) * 60`. The real N LEDs of a populated port are written at
   the start of its block; the rest of the block and every unused block are black.

Measured mapping (1-based firmware ports, defaults match it):

| Port | Fans | LEDs | Physical group | Natural LED order | With default `reversePorts` |
|---|---|---|---|---|---|
| 1 | 3 (GPU) | **20** | Palit RTX 3080 Ti GameRock strip | measured LED-by-LED 2026-11-12: indices 0-19, 20+ dead | natural |
| 6 | 3 | 24 | bottom fans | left to right (horizontal) | left to right |
| 7 | 2 | 16 | back fans | top to bottom (vertical) | top to bottom |
| 8 | 2 | 16 | front fans | bottom to top (vertical, inverted mount) | top to bottom (reversed) |

Natural direction was verified on hardware one LED at a time against the 60-stride payload:
port 6 left to right, port 7 top to bottom, port 8 bottom to top. Both vertical groups are
wanted top to bottom, so the default `reversePorts` is `0,0,0,0,0,0,0,1,0,0` - Port 8
reversed, Ports 6 and 7 natural. Set it to all zeros to get the natural order back.

The GPU's ARGB cable is on **Port 1** (not the hub's VGA/motherboard input). To enable it,
set `Port LED Counts Override` to `20,0,0,0,0,24,16,16,0,0` and reload the device; `Port 1`
then appears as a 20-LED channel. Ports 2-5, 9, 10 are unused.

## Protocol (all frames host -> hub)

`xor8` is the XOR of every payload byte after the length field.

```
handshake   55 15 01 00 00
            -> 21-byte status: uid at 3..5, port count at 14, firmware minor at 17

bindPort    55 15 03 00 00
            -> per-port bound flags (reply byte 15 + port index)

fillCount   55 25 22 00 00 00 00 | len16be(value+1) | 00..0B + 12 per-port LED counts | xor8(value)
colors      55 25 21 00 00 00    | len16be(rgb+1)    | 1800 RGB bytes                   | xor8(rgb)
```

The 12-slot count table is the protocol maximum, not 12 ports; the plugin sends ten 60s and
leaves slots 11-12 at 0. Every command is acknowledged with `55 04 02 00 00`.

Because the ACK shares the status header, the plugin drains the input buffer until it is
empty immediately before writing the handshake, then accepts only a >= 21-byte reply with a
non-zero uid and a port count in 1..12. A backlog of ACKs (seen as 131 B in the log) can
therefore never be parsed as the status.

Mode query `55 15 02 00 00` returns a 0x2c-byte status frame whose byte 0x29 is the light
mode (`0` off, `1` controller, `2` motherboard, `3` host software). The vendor app only
reads this mode; it never sets it. The hub is normally in mode 3, which this plugin drives.

## Motherboard ARGB input

The hub also has a 5V ARGB input. In firmware mode 2 it passes the motherboard header
signal through; the vendor app has no command to switch modes (verified across the whole
app.asar), so mode selection is physical/hub-side, not serial-reachable. With the ARGB
input connected on the test box the hub stayed in mode 3: motherboard-header effects lit
nothing on the L10 fans, and serial frames drove every port. Serial is therefore the only
usable control path.

## Port configuration (device settings, no code edits)

| Property | Type | Default | Applies |
|---|---|---|---|
| `fansPerPort` | comma-separated 10 values | `0,0,0,0,0,3,2,2,0,0` | device reload |
| `ledsPerFan` | number 1-60 | `8` | device reload |
| `reversePorts` | comma-separated 0/1, 10 values | `0,0,0,0,0,0,0,1,0,0` | live |
| `portLedCounts` | comma-separated override | *(empty)* | device reload |
| `diagnosticMode` | combobox: Off / Port walk / LED walk | `Off` | live |
| `diagnosticPort` | number 1-10 | `6` | live |

- Logical port LED count = `fansPerPort[p] * ledsPerFan`, clamped to 60 per port.
- `portLedCounts`, when non-empty, overrides the *logical* counts only. Up to 12 values are
  accepted (11-12 ignored); 0 means unused. Clear it to use the fans model. It never
  changes the wire fillCount, which is always 60 per port.
- Unused ports (count 0) are not added as channels and are never coloured.
- `reversePorts[p] = 1` reverses the LED order of that port's logical LEDs *inside* its
  fixed 60-LED block; the rest of the block stays black.
- Changing `fansPerPort`, `ledsPerFan` or `portLedCounts` rebuilds channels only in
  `Initialize()`, so reload the device (or restart SignalRGB) after editing them.
  `reversePorts` and the diagnostics are read every `Render()` and apply live.
- Diagnostics: **Port walk** lights each populated port solid white for 2 s in turn;
  **LED walk** lights one LED every 0.5 s on `diagnosticPort` in payload order and writes
  `L10 LED walk Port N LED i/count (payload order)` to the log. Off renders the canvas
  exactly as before.

## Reconnect and wedged-hub recovery

The CH340 TX path can wedge after long streaming sessions (writes time out, no replies).
The plugin retries the connection every 2 s from `Render()` and re-runs the handshake, so
it recovers on its own once the port answers again.

SignalRGB's `@SignalRGB/serial` API exposes no DTR / `setSignals`, so the plugin cannot
pulse DTR. A hardware-verified revival is a DTR low pulse (~0.3 s) followed by high and a
reopen. With SignalRGB stopped, run:

```
python tools/l10_reset.py COM4
python tools/l10_reset.py COM4 --no-pulse     # handshake only
```

Then start SignalRGB and reload the device. There is no vendor reset command in the
protocol.

## Install

1. Copy this folder to `%USERPROFILE%\Documents\WhirlwindFX\Plugins\JungleLeopardL10\`.
2. Close `Jungle Leopard Display.exe` (SignalRGB lists it as a conflicting process).
3. Restart SignalRGB, open **Devices**, enable **Jungle Leopard L10 ARGB Hub**.
4. In **Layout**, place the hub; each `Port N` channel can take any strip length.

## Test

`tools/jl_test.py COM4 <hold-seconds>` (repo, Python + pyserial) sends the same frames and
prints the hub's ACK for each. Close SignalRGB first - it holds COM4 while the plugin is
loaded. `node tools/plugin_selfcheck.mjs` verifies the frame builders and port model with
no hardware.

## Evidence

See `evidence/NOTES.md` for the static source citations, REA evidence ID, live probe
results, the block-scan results that pinned the fixed-60 rule, and the
observed/inferred/unknown split.
