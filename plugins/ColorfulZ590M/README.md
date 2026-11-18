# Colorful CVN Z590M GAMING FROZEN V20 — SignalRGB plugin

Direct USB HID control of the onboard shroud LEDs and the 5V ARGB / 12V RGB
headers. No iGameCenter, `iGame.LightingService` or Dynamik Light process is
required at runtime.

## Device

| Field | Value |
| --- | --- |
| Vendor ID | `0x2F4C` (Colorful) |
| Product ID | `0x1000` |
| HID interface | `MI_02` |
| Usage page / usage | `0xFF01` / `1` |
| Report length | 65 bytes (report ID `0x00` included) |

`MI_01` (`usage page 0xFF00`, product string `X570-USBHID-LED`) is the
firmware-update collection. The plugin's `Validate()` matches only
`0xFF01`/`1`, so it can never bind to `MI_01`.

## Frame format

The controller takes one colour buffer per update, streamed in 20-LED packets,
then latched by a commit packet.

```
byte 0      report ID            0x00
byte 1..3   magic                0x01 0x00 0x88
byte 4      packet index         0..6, or 0xFF = commit
byte 5..64  20 x (R, G, B)
```

140 LEDs → 7 data packets + 1 commit packet = 8 writes of 65 bytes per frame.
Bytes past the last populated LED stay zero.

Source: `iGameAPI.LED.dll` frame builder at `0x18003a3a0` (loop bound `0x8c`
= 140, magic `0x88`, commit `0xFF`) and the independently published
OpenColorHub `crates/colorctl-core/src/backend/frame.rs`.

## LED layout (140-LED buffer)

The device is exposed as 139 individually positioned LEDs on a 120x120 canvas
(SignalRGB shows it as 60x60 on the Layout page), not as flat channels, so an
effect follows the real shape of the board.

| LEDs | Wire slots | Placement |
| --- | --- | --- |
| `12V RGB` (1) | 0..1 | header zone, written to both slots |
| `Onboard 1..18` | 2..19 | polyline: right edge top to bottom, then bottom edge right to left |
| `ARGB 1 - 1..60` | 20..79 | `5V_1` header |
| `ARGB 2 - 1..60` | 80..139 | `5V_2` header |

Onboard polyline, confirmed one LED at a time on the board:

```
slot  2  Onboard 1   right edge, top
  ..13  Onboard 12  right edge, down to the chipset end
    14  Onboard 13  lower right edge
    15  Onboard 14  lower right edge
    16  Onboard 15  bottom edge, corner (right)
    17  Onboard 16  bottom edge, moving left
    18  Onboard 17  bottom edge
    19  Onboard 18  bottom edge, far left (hidden behind the SATA ports)
```

`Onboard 1..14` sit at `x = 116` with `y = 4 + 6i` (4 -> 82); `Onboard 15..18`
sit at `y = 116` with `x = 116 - 24(i - 13)` (92 -> 20). The 12V zone is at
`[2, 2]`, and each ARGB run is one full-width row (`y = 96` and `y = 104`,
`x` 0 -> 118 step 2) so no two LEDs share a pixel. The vendor permutation that
appeared in the flat 18-slot strip is gone: the wire slot is now
`slot = 2 + (layout index - 1)`, and the geometry lives in the positions.

Ranges come from `iGameAPI.LED.dll` channel initialisers: channel `121`
(`12V_1`) = LEDs `{0,1}`, onboard = 18 LEDs, channel `51` (`5V_1`) = LEDs
`20..79`, channel `52` (`5V_2`) = LEDs `80..139`.

## Test steps

1. Stop the vendor stack: `iGameCenter.exe`, `iGameCenter.Service.exe`,
   `iGame.LightingService.exe`. SignalRGB lists them under Conflicting
   Processes.
2. Copy this folder to `%USERPROFILE%\Documents\WhirlwindFX\Plugins\ColorfulZ590M\`.
3. Restart SignalRGB and confirm the device appears as `Colorful CVN Z590M GAMING FROZEN V20`.
4. Static test: onboard solid colour, then ARGB 1 and ARGB 2.
5. Run a moving effect and check the motion runs down the right edge, around the bottom-right corner, then left along the bottom edge.
6. Sleep/resume, then restart SignalRGB.
7. Watch `%LOCALAPPDATA%\WhirlwindFX\SignalRgb\Logs\SignalRGB_*.log` for errors.

## Notes

- Colour order is plain RGB (the driver writes `R`, `G`, `B` per LED).
- The 12V header is a single zone driven by one of the two slots; the plugin
  writes the same colour to both, so either mapping looks identical.
- The 12V header's second wire slot (1) is written with the same colour, so
  either slot driving the header looks identical.

## Verified on this board

Walk performed on 2026-11-11 with the vendor stack stopped, one wire slot
held white at a time, written straight to the LED collection:

| Slot | Result |
| --- | --- |
| 2 | top of the right-edge strip (red end of the two-point probe) |
| 13 | bottom of the right-edge strip, at the chipset end (blue end) |
| 15 | vertical part of the lower right edge |
| 16 | bottom edge, at the corner |
| 17 | bottom edge, left of 16 |
| 18 | bottom edge, left of 17 |
| 19 | nothing visible - behind the SATA ports or unpopulated |
| 20..79 | ARGB 1, nothing lit |
| 80..139 | ARGB 2, nothing lit |
| 140..199 | 200-LED frame, fully dark -> hardware really is 140 |

Earlier grouping probes agreed: slots 2..13 light the whole right-edge strip
and slots 14..19 the lower right edge and bottom edge.

The tail probe settles the buffer size: the hardware has **140 LEDs**, matching
the vendor driver's `LedCount = 140` and its 7-packet frame builder. No
200-LED path exists for this board.

### Wiring on this machine

- **12V RGB header** — nothing connected.
- **5V ARGB header 1** — physically broken, no output expected.
- **5V ARGB header 2** — feeds the Jungle Leopard L10 hub's ARGB input.

Neither ARGB zone produced light, including the one the L10 hub is on. The
board accepted every frame (no write errors, exclusive HID open held by
SignalRGB throughout), so this is a header/hub-side wiring or load-handshake
question, not a frame-format one. Unresolved: whether the L10 hub is on the
broken header, whether its ARGB input is power-only, or whether the firmware
needs a load handshake before driving a 5V output.

