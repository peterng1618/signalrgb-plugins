# Yunari RGB bridge — SignalRGB plugin

Makes **Yunari** appear as one hub in SignalRGB's **Devices** and **Layouts** pages, with one
independently placeable subdevice per RGB device Yunari owns. SignalRGB never opens the real Kraken
Z; it only speaks HTTP and UDP to Yunari (loopback by default, configurable with `apiHost`/`apiPort`).

```
SignalRGB ──UDP <apiHost>:7788 (YRGB, ≤30 Hz)──> Yunari ──HID iface 1──> Kraken LEDs
SignalRGB ──HTTP <apiHost>:<apiPort> (descriptor)──> Yunari
```

Yunari owns the device (`1e71:3008`) so the LCD, LEDs and fan reports all go through one handle.
Nothing here opens HID, USB, serial or a vendor endpoint.

## Install

1. Copy this folder to `%USERPROFILE%\Documents\WhirlwindFX\Plugins\YunariBridge\`.
2. Restart SignalRGB (or reload the device) so the plugin is loaded.
3. **Disable the real Kraken device in SignalRGB.**
   - Open **Devices** and find the NZXT Kraken Z / `Nzxt_Kraken_Z3_AIO.js` entry.
   - Disable it. SignalRGB must not open the Kraken HID interface: it switches the composite
     device to its `HybridUSB` protocol, which blocks Yunari's bulk interface and scrambles the
     glass when both write.
   - Leave **Yunari** enabled. Yunari (the app) must be running for colours to reach the LEDs.
4. Open **Layouts**; the Yunari hub and each of its lighting devices are listed separately.

## Files

- `YunariBridge.js` — the plugin
- `../tools/yunari_bridge_selfcheck.mjs` — runnable self-check, no hardware
  (`node tools/yunari_bridge_selfcheck.mjs`)
- `evidence/NOTES.md` — API precedents and what is observed vs inferred

## Layout model

Default (`Layout Model = Subdevices`): one SignalRGB **subdevice** per descriptor entity that has
lighting. Each subdevice carries the descriptor geometry through
`device.setSubdeviceSize` + `device.setSubdeviceLeds`, so a strip is `width × height` row-major and
a ring is its rectangle perimeter, and `rings` is several identical rings side by side. The
Kraken's 40-LED channel is the controller's capacity: **three 8-LED AER RGB fan rings** are
daisy-chained to it (24 lit, the remaining 16 slots empty; the pump has an LCD, no LED ring), so the
descriptor is `{shape:"rings", width:3, height:3, count:3}` on an 11x3 canvas and a moving strip
lights one LED at a time. Subdevices are independently placeable on the Layouts canvas — the same user model as
the Jungle Leopard L10 ports, but with real geometry instead of a generic chain.

`setSubdeviceLeds(id, names, xs, ys)` takes **parallel x and y arrays**; passing `[x, y]` pairs makes
every LED sample one pixel and the whole device lights as a unit.

`Layout Model = Channels` is the fallback (L10-style `device.addChannel`). SignalRGB channels are
generic LED chains: a plugin cannot set per-channel LED coordinates, so the user assigns a
component to each channel in the Layouts page. Use this model only if a SignalRGB build fails to
enumerate the subdevices. Switching the combobox rebuilds the layout live. If subdevice creation
throws, the plugin falls back to channels automatically in the same build and logs it; it never
leaves a subdevice controller with zero placeable devices (the trap the Rainbow Music Led plugin
hit).

**Descriptor → subdevice mapping.** `devices[]` order is the UDP device index, including devices
without lighting (they consume an index but create no subdevice and receive no frames). Laid-out
LEDs follow the concatenated `lighting.channels` order; LED names are `<channel name> <n>`.

`Layout Model`, `LightingMode`, `Forced Color` and `Shutdown Color` are device settings. The fallback
descriptor string is documented below.

## Fallback descriptor

`Fallback devices` is used at `Initialize()` before the HTTP descriptor answers, and whenever Yunari
is unreachable or reports no lighting devices. Format:

```
id:leds:shape:width:height[:count][;...]
```

Default: **`kraken-z:40:rings:3:3:3`**.

- A ring's LED count is the rectangle perimeter `2·(w+h) − 4`. **40 LEDs = 11 × 11**, not 4 × 4
  (4 × 4 is 12 LEDs). A ring whose perimeter does not match its LED count is logged and falls back
  to a `count × 1` strip.
- A strip is `width` LEDs per row × `height` rows, row-major.
- `rings` draws `count` rings of `width × height` side by side, one cell apart; the default is
  `kraken-z:40:rings:3:3:3` = three 8-LED fan rings on an 11 × 3 canvas, with the channel's other 16
  LEDs left unplaced.
- Once the descriptor answers, its names, counts, UDP ports and layouts replace the fallback.
  Subdevices are **updated in place**: a uid that is already present is never removed and recreated,
  so SignalRGB keeps its saved canvas position and scale across Yunari restarts and descriptor
  changes. Only ids that disappear are removed and only new ids are created; an unchanged refresh
  touches nothing. Channels (the fallback model) are still rebuilt, because they carry no geometry.
- A ring whose descriptor size cannot hold its LED count (4 × 4 is 12 LEDs, not 40) is logged and
  drawn as a `count × 1` strip; the Kraken is published as a strip by Yunari, not a ring.
- A descriptor with no lighting devices is ignored, so the Layouts entry is never blanked.

## Descriptor refresh

`DiscoveryService` announces one controller with the stable id `yunari`, host `apiHost` (default
`127.0.0.1`) and port `apiPort` (default `5227`), at app start (`service.addController` → `updateController` → `announceController`) and then
probes `GET /api/devices` on every discovery update. The plugin also fetches it once at
`Initialize()` and at most every 15 s from `Render()`; responses are asynchronous and never block.
The HTTP status is logged once per status change (`GET /api/devices status=…`). On 2.5.86 the
discovery `service.log` is not persisted to `SignalRGB_*.log`, so use the Devices page for UI
checks; plugin `device.log` lines do appear in the log.

If Yunari is stopped, the plugin keeps rendering and sending UDP (there is simply no listener),
counts failures, and logs the unreachable state once. `Render()` never throws or blocks.

## Colour frames

One datagram per lighting device per frame to `<apiHost>:<lighting.udpPort>` (default `7788`):

| Offset | Size | Content |
|---|---|---|
| 0 | 4 | magic `YRGB` (`59 52 47 42`) |
| 4 | 1 | version `1` |
| 5 | 1 | device index (order in `devices`) |
| 6 | 2 | LED count, uint16 little-endian |
| 8 | 3×N | RGB triples, channel order |

`Render()` caps at **30 Hz**, skips a device whose payload is unchanged (sampled hash), reads
`LightingMode`/`forcedColor` every frame, and normalises short/long channel arrays. Shutdown sends
`shutdownColor`; system suspend sends black. A UDP send failure is retried on the next frame and
logged once.

## Controls and telemetry — not implemented

Yunari remains the owner of pump/fan control. This plugin does **not** expose SignalRGB Cooling
fan controls:

- No shipped network plugin uses `SupportsFanControl`/`device.createFanControl`/`setRPM`/
  `getNormalizedFanlevel`; every user of that API is HID or serial (Arctic, NZXT, Corsair, Lian Li,
  Asus, …).
- The fan-control docs describe the `device.*` methods but do not say whether a network plugin's
  Cooling UI/hard-lock behaviour is supported.
- Adding it would be unverified guesswork, and a fan controller that stops updating `setRPM` can
  hard-lock its target speed. Use Yunari's UI for pump/fan curves.

The HTTP control endpoints (`POST /controls`, `GET /telemetry`, `POST /lighting-mode`) are therefore
unused by this plugin. `forced`/`off` lighting modes are equivalent to SignalRGB's own `Forced`
mode and `Shutdown` black frame here; Yunari's endpoints stay available for other clients.

## Verification

`node tools/yunari_bridge_selfcheck.mjs` stubs `device`, `udp` and `XMLHttpRequest` and asserts:

- YRGB datagram magic, version, device index, uint16 LE LED count and payload length;
- 30 Hz throttle, unchanged-payload skip, changed-colour reopen, forced-colour fill;
- three 3 × 3 rings = 24 placed positions on an 11 × 3 canvas; a 4 × 4 ring for 40 LEDs is rejected and falls back to a strip;
- strip 4 × 2 row-major positions and names;
- descriptor → subdevice ids/names/sizes, unlit devices consuming a UDP index but no subdevice;
- unchanged descriptor does not recreate, changed descriptor does, zero-lighting descriptor keeps
  the current layout;
- channel fallback naming/merge, model switch, automatic fallback when `createSubdevice` throws;
- no throw without UDP and one-time logging; shutdown/suspend colours.

Needs hardware / a running SignalRGB to confirm: the subdevices enumerating separately in Devices
and Layouts, the three fan rings on the canvas, end-to-end colours while a Yunari theme plays on
the LCD, the user's fan/pump controls still working in Yunari, and survival across a SignalRGB
restart.

**Live check 2026-11-12 (SignalRGB 2.5.86, pid 25476, Yunari host down so the fallback path
loaded):** the plugin loaded, logged `Created Sub device with uid: yunari:yunari:kraken-z`, and the
UI showed **Yunari / Controller** in Devices and **Yunari → Sub Devices → Kraken Z** in the Layouts
sidebar. See `evidence/ui_20261112.txt`. Pixel screenshots were not available (the session was
locked during the check and SignalRGB exited afterwards), so the accessible-tree text is the stored
UI evidence. Still unverified live: the drawn ring shape, UDP delivery, and a Yunari-up run.


## Contract notes

the Yunari bridge contract doc says the plugin creates "channels" per
`lighting.channels` entry and "author layout with `setControllableLeds`". That only fits a flat
single-canvas device; it cannot give a channel real geometry. This implementation uses subdevices
for geometry (proven by the shipped `PhilipsHue.js`, which is also `Type() = "network"` with
`SubdeviceController()` and `createSubdevice`/`setSubdeviceLeds`/`device.subdeviceColor`) and keeps
channels as the documented fallback. The Yunari contract doc is read-only for this worktree, so the
divergence is recorded here and in `evidence/NOTES.md` instead of edited in place.
