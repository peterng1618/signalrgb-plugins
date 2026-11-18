# RML multi-strip support — design

Status: approved in conversation 2026-11-18.

## Goal

Let one SignalRGB add-on drive any number of Rainbow Music Led / WLED strips:
independent controllers with different LED counts and shapes (4-bar ring,
3-bar U, strip), each surviving DHCP changes and router reboots.

## Current behaviour and root causes

- The plugin announces exactly one controller with fixed `id = "rainbow-music-led"`.
  `Render/Initialize` read one global `ip`/`ledCount`/geometry. Two strips
  collapse onto one device.
- MAC is already returned by WLED `/json/info` and stored on the controller but
  never used for identity; a DHCP move orphans the old IP.
- `Ring` positions are a *closed* rectangle perimeter, `2(w+h)-4` LEDs. A 3-bar
  U (no bottom run) cannot be represented; `Strip` uses rows only.
- Scan matching accepts name "Rainbow Music Led" **or** exactly 118 LEDs, so a
  3-bar/other-count strip is skipped.

## Decisions

| Decision | Value |
| --- | --- |
| Device model | one SignalRGB controller per WLED device (Nanoleaf/Hue pattern) |
| Identity | `id = "wled-" + MAC` from `/json/info`; DHCP move updates the same controller's IP |
| Per-device settings | `service.getSetting(id, key)` with the global `ControllableParameters` value as fallback |
| Layout shapes | `Ring` (closed 4-bar), `U` (3-bar, hollow bottom), `Strip` (rows) |
| Ring direction | `layoutDirection` describes how the strip is affixed to the back of the monitor. From the viewer's front POV, a "clockwise" strip is mounted mirrored: LED 0 stays at the physical first LED on the strip (the viewer's bottom-left corner in the default mount), and LED 1 goes **up the left side**, then L→R, down the right side, bottom R→L. Reversing the mounting direction reverses the path. |
| U traversal | same principle: LED 0 is fixed on the strip's first LED; `layoutDirection` reverses the open path (up first leg, across top, down second leg). No corner choice: the viewer sees the mirror of the strip's own orientation. |
| No corner setting | `layoutStart` is removed for Ring/U. It never selected a different physical LED — it only mirrored the canvas — and the physical starting LED is fixed by the strip wiring. |
| U count | `W + 2H − 2` for outer grid `W×H`; settings must satisfy this exactly |
| Discovery | opt-in `/24` scan, 8 hosts per `Update()` tick, one sweep per load |
| Scan acceptance | any WLED device whose `/json/info` reports a valid MAC — no name/LED-count filter |
| IP entry | typing an IP in settings probes it, adopts the returned MAC as id, re-announces |
| Rescan UI | ship `RainbowMusicLedDirect.qml` with an IP field + "Add strip" button calling `discovery.forceDiscover(text)` and a "Scan LAN" button calling `discovery.forceDiscover("")`; ship the same `.qml` in the release repo |
| Existing single-strip users | their current `rainbow-music-led` controller is migrated: scan/probe finds the same MAC and reuses the old id |
| Setting changes | `onipChanged`, `onscanSubnetChanged`, `onledCountChanged`, `onlayoutShapeChanged`, `onlayoutWidthChanged`, `onlayoutHeightChanged`, `onlayoutDirectionChanged` refresh layout and announcement |

## Geometry

`uPositions(w, h)`:

```
leg A: (0,h-1) ... (0,0)        // h LEDs, bottom -> top
top:   (1,0) ... (w-2,0)        // w-2 LEDs, left -> right
leg B: (w-1,0) ... (w-1,h-1)    // h LEDs, top -> bottom
```

Total `h + (w-2) + h = w + 2h - 2`. The top corners are the endpoints of the
legs, so no duplicates. LED 0 is the fixed physical first LED of the strip;
`layoutDirection` reverses the open path. There is no corner choice.

`ringPositions(w, h, reversed)` builds the canonical path once:

```
forward: (0,h-1) -> ... -> (0,0) -> (1,0) ... (w-1,0) -> (w-1,h-1) -> ... bottom R->L
reverse: the same path traversed backwards
```

The viewer looks at the *front* of the monitor; the strip is on the back, so
the canvas is the mirror of the strip's own left/right. `layoutDirection`
selects which way the LED run travels from its fixed physical start; no
corner mirroring is applied to LED 0. `layoutStart` is removed for Ring/U.
`tools/check_layout.js` asserts LED 0 at the bottom-left of the canvas and LED 1
up the left side for forward, along the bottom row for reverse. `Strip` is unchanged.

If the configured `layoutWidth`/`layoutHeight` do not produce `count` LEDs for
the chosen shape, log and fall back to `count x 1` strip (same safety rule as
today).

## Controller data

```
WledController {
  id: "wled-" + mac.toLowerCase().replace(/[^a-f0-9]/g, ""),
  mac, name, ip, hostname, port, streamingPort, deviceledcount,
  firmwareversion, announced, ...
}
```

- `announce()` saves `name`, `ip`, `udpPort`, `mac`, plus per-controller copies
  of `ledCount`, `layoutShape`, `layoutWidth`, `layoutHeight`, `layoutStart`,
  `layoutDirection` (only when non-default) via `service.saveSetting(id, key, value)`.
- On discovery of a known MAC, update the existing controller's IP/port/count
  and re-announce instead of adding a second device.
- `Initialize()` uses the global `controller` (the one SignalRGB is rendering),
  reads per-controller overrides via `service.getSetting`, and builds only its
  own canvas/layout. `Render()` sends frames only to that controller's IP/port.
- Legacy `rainbow-music-led` controller: if present, adopt and rename to the
  MAC-derived id on first successful probe so existing users keep one device.

## Discovery flow

1. `DiscoveryService.Initialize()` — announce each cached controller from saved
   settings (no MAC needed for cached entries).
2. `Update()` every ~15s:
   - if global `ip` set, probe that address;
   - if `scanSubnet` true and no explicit IP (or last probe failed), advance the
     scan cursor by 8 hosts within `lanIp`'s /24;
   - each successful probe yields a MAC-derived controller id; `addController`
     for new devices, update + re-announce for known ones.
3. Typing a new IP calls `onipChanged()` → probe immediately → adopt by MAC.

No unsolicited network traffic when `scanSubnet` is false and `ip` is blank.

## Settings changes

New/changed entries in `ControllableParameters()`:

- `layoutShape`: values `Ring`, `U`, `Strip` (was `Ring`, `Strip`).
- `scanSubnet` stays opt-in; description updated to say "any WLED device".
- per-controller overrides are *not* new global fields; they are written by the
  plugin under each controller id via `service.saveSetting` and read by
  `Initialize()`. Users set them on each device page only if the global default
  does not fit that strip.

## Discovery UI (`.qml`)

SignalRGB renders device settings from `ControllableParameters()` but exposes
discovery actions through a sibling `.qml` panel. The built-in WLED plugin uses
exactly this pattern (`WLED.qml`: "Discover WLED device by IP" →
`discovery.forceDiscover(text)`). Our plugin had the JS hook but no `.qml`, hence
no rescan surface.

Create `plugins/RainbowMusicLedDirect/RainbowMusicLedDirect.qml` following the
built-in WLED panel: an IP `TextField` with an IPv4 validator and a button,
both calling `discovery.forceDiscover(ipField.text)`; plus a second button
"Scan LAN" calling `discovery.forceDiscover("")` (the empty-argument form starts
the opt-in sweep). Keep it minimal — no images, no extra settings.
`tools/build-releases.mjs` copies the `.qml` into the release repo; verification
asserts the release tree has exactly one `.js`, one `.qml`, one photo, README
and LICENSE.

## README updates

- Release README: installation now says "use the Discover strip panel to enter
  an IP or start a LAN scan"; settings table gains `U` and LAN scan; troubleshooting covers
  DHCP moves (automatic by MAC) and multiple strips (one device each).
- Dev README: note MAC identity, per-controller settings, U shape.

## L10 recovery panel (separate follow-on)

The L10 hub's re-enumeration is an OS-level operation. Plugin JS/QML cannot
spawn processes; a QML button can only open a URL. Agreed route: add a minimal
L10 QML panel with a **Download recovery script** button pointing to the
published script in `github.com/peterng1618/signalrgb-jungle-leopard-l10`
(served as a raw/plain-text file so browsers download rather than execute it).
The user inspects and starts it; the approved ZIP launcher below requests UAC
with one visible prompt. No auto-download, no auto-execution, no silent UAC.

The published form is a ZIP (GitHub Release asset) containing:

- `Recover-L10.cmd` — double-click launcher. Relaunches itself with
  `Start-Process -Verb RunAs` (one visible UAC prompt), then runs
  `powershell -ExecutionPolicy Bypass -File l10_reenumerate.ps1 -RestartSignalRgb`,
  then pauses so the output is readable. No silent elevation.
- `l10_reenumerate.ps1` — generalized: auto-detect the `1A86:8042` CH340 instance
  and its COM port; never embed a serial or COM number; keep all existing safety
  checks, `-DryRun`, and the no-parent-hub rule.
- `l10_reset.py` — the handshake helper the ps1 calls.
- `README.txt` — what the script does (kills SignalRGB, disable/enable the hub,
  waits for COM back, relaunches SignalRGB), when to use it (writes time out but
  hub is healthy), and the one-time "Unblock" step for MOTW-flagged ZIPs.

The ZIP is unsigned; Windows SmartScreen may warn. The QML button opens the
GitHub Releases page, not the ZIP directly. This ZIP work is a follow-on after
the RML multi-strip implementation, NOT part of this plan.

## Verification

Extend `tools/rml_selfcheck.mjs` with stub `service.getSetting` and multiple
controllers:

1. two WLED devices with different MACs → two controllers, distinct ids and IPs;
2. same MAC at a new IP → one controller, IP updated, no duplicate;
3. per-controller `ledCount`/`layoutShape` override → distinct canvas sizes;
4. `U` shape: `uPositions(45,16)` = `45 + 2*16 - 2 = 75` unique, adjacent, no
   duplicate positions; ring: LED 0 stays at the bottom-left of the canvas for
   both directions, LED 1 goes up the left side when forward and along the
   bottom row when reversed;
5. scan accepts a WLED with a non-118 LED count and a different name;
6. IP edit re-announces with the probed MAC id;
7. existing check suite (`release_check`, `check_layout`, `frame-check`,
   `plugin_selfcheck`, `yunari_bridge_selfcheck`, `rml_selfcheck`, build) green.

## Risks

- `service.getSetting` behaviour varies across SignalRGB builds; fallback to
  the global value means worst case all strips share the global geometry.
- MAC-based ids change if a user replaces the WLED hardware; the old controller
  stays until manually removed in SignalRGB.
- 8 probes per 15 s = a full /24 in ~8 minutes with default timing; scan is
  opt-in for this reason.
- A daisy chain is one WLED controller with summed LEDs; it is treated as a
  single device whose geometry the user must configure by hand.
