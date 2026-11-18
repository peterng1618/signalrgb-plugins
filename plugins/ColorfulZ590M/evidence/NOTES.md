# Colorful CVN Z590M GAMING FROZEN V20 — evidence notes

Target reversed: `C:\Program Files\iGameCenter\iGameAPI\iGameAPI.LED.dll`
(x86_64, sha256 `d73f40a3d1bed37b4c779ba401cd6aae619a4122e55550172d64e186a0e2928b`,
1683 procedures, 825 strings, image base `0x180000000`).

Tooling: REA MCP (`open_binary`, `binary_overview`, `search_procedures`,
`procedure_pseudo_code`, `procedure_assembly`, `analyze_function`, `xrefs`,
`read_bytes`, `resolve_containing_procedure`). Secondary source: the public
OpenColorHub `colorctl` implementation, cloned read-only during recon.

Citations use exact virtual addresses; each conclusion below states whether it
is **observed** (read out of the binary / descriptor) or **inferred**.

---

## 1. Endpoint — OBSERVED

Windows PnP + `hid.enumerate` on this box:

| Interface | Usage page | Usage | Product string | Role |
| --- | --- | --- | --- | --- |
| `MI_00` | `0x0001` | `6` | — | keyboard collection |
| `MI_01` | `0xFF00` (65280) | `1` | `X570-USBHID-LED` | firmware update — never written |
| `MI_02` | `0xFF01` (65281) | `1` | `COLORFUL` | LED frames |

The plugin's `Validate()` accepts only `usage_page === 0xFF01 && usage === 1`.

Cross-check (OBSERVED, public source): OpenColorHub
`crates/colorctl-core/src/backend/frame.rs` and `docs/RGB-COMPATIBILITY.md`
document the same `2F4C:1000`, `0xFF01`, usage `0x0001`, 65-byte report
identifier.

## 2. Device is a 140-LED buffer, not 200 — OBSERVED

`FUN_1800334e0` (PID `0x1000` probe / `X570` object construction):

- `hid_open1(0x2f4c, 0x1000, -0xff)` — vendor `0x2f4c`, product `0x1000`.
- version query: 65-byte buffer `00 80`, `hid_write`, `hid_read_timeout(...)`.
- `*(u32*)(obj[0x6e] + 8) = 0x8c` → **LedCount = 140**.
- `*(u32*)(obj[0x66] + 4) = 0x10002f4c`, `*(u32*)obj[0x66] = 0x2011`
  (usb ids / device version 2002).

`FUN_18003a3a0` (frame builder) loops `local_84 += 0x14` while
`local_84 < 0x8c`, i.e. 7 packets of 20 LEDs = 140 entries.

`FUN_18003afb0` (`X570Write` constructor) allocates the LED data block with
size `0x8c` via `FUN_18002b520`.

The public OpenColorHub frame code hardcodes `TOTAL_LEDS = 200` ten packets —
that is its **AMD** `0x1000` path. This board answers on the same VID/PID but
the vendor driver provisions 140 entries, matching iGameCenter's own
`LedCount:140` log line. The plugin uses 7 data packets + commit.

## 3. Frame layout — OBSERVED

`FUN_18003a3a0`, per packet:

```
append 0x00                 ; report id
append param_1[0x14]        ; byte at this+0xa0  = 0x01
append byte[this+0xa1]      ; = 0x00
append 0x88                 ; mode / magic
append (u8)index            ; 0-based packet counter
20 x LED.serialize()        ; 3 bytes each
```

and after the loop:

```
append 0x00, 0x01, 0x00, 0x88, 0xFF
```

`FUN_18003afb0` writes the header bytes as one `u16`:
`*(u16*)(this + 0x112) = 1` → bytes `[0x890]=0x01`, `[0x891]=0x00`, and
`*(u32*)(this + 0x86c) = 0x88` sets the mode used by the `0x88` branch.

`FUN_180004af0` (`LEDProperty` serializer) appends exactly three bytes:
`byte[+8] * float[+0xc]`, `byte[+9] * f`, `byte[+10] * f` — i.e. `R, G, B`
with a per-LED brightness multiplier. Colour order is **RGB**, not GRB.

Packet length: 5 header bytes + 20 x 3 = 65.

`FUN_18002d230` is the raw transport: `hid_write(handle, buf, len) > 0`.

**Inferred (high confidence):** 7 data packets then commit latches the frame;
the reference implementation does the same with 10 packets for 200 LEDs.

## 4. Channel map — OBSERVED (initialisers) / INFERRED (physical header labels)

Channel initialisers build LED-index vectors:

| Proc | Channel id | Vector |
| --- | --- | --- |
| `FUN_180002950` | `0x79` (121, `12V_1`) | `{0, 1}` — 2 slots |
| `FUN_180002a40` | `0x33` (51, `5V_1`) | `0x14..0x4f` = 20..79 (60) |
| `FUN_180002b70` | `0x34` (52, `5V_2`) | `0x50..0x8b` = 80..139 (60) |
| `FUN_1800029a0` | onboard | 18 entries `{14,15,16,17,18,19,2..13}` |

`FUN_180002ca0` copies a 140-entry ordering table out of
`0x18007b7a0`:

```
0,1,14,15,16,17,18,19,2,3,4,5,6,7,8,9,10,11,12,13, 20,21,...,139
```

`FUN_18002fd80` (capabilities) reports `LedCount`, `LedCount - 0x79` (=19),
and 12V/5V counts `0x33`/`0x34`, `0x79`, `1`.

`FUN_180004b90` writes a colour into the LED vector at a channel-relative
index — confirming these vectors are index lists into the 140-entry buffer,
not separate buffers.

Resulting buffer layout:

```
slot 0..1     12V RGB header (one zone, two wire entries)
slot 2..19    onboard, 18 LEDs, vendor order 14..19 then 2..13
slot 20..79   ARGB 1 (5V_1), 60
slot 80..139  ARGB 2 (5V_2), 60
                        = 140
```

**Inferred:** the physical header labels (`5V_1`/`5V_2`, `12V_1`) map to the
connectors silk-screened on the board in that order. This needs the hardware
run to confirm.

This differs from the plan's starting assumption (3 ARGB x 40 + 2 x 12V = 140
on the Intel Z590 class). The 140 total is consistent either way; the driver's
own 0x1000 initialisers say 2 ARGB headers of 60 and one 12V header.

## 5. Safety

- `MI_01` / usage page `0xFF00` is never opened: `Validate()` cannot return
  true for it, and `set_endpoint` is only called with the matched endpoint.
- No firmware, EC or BIOS path is invoked. The plugin only writes 65-byte
  reports to the LED collection.
- `hid_open1`/`hid_write` to `0xFF00` exist in the binary (version query is on
  the LED collection, `00 80`, not the firmware one) and were not exercised.

## 6. Hardware walk — OBSERVED on 2026-11-11

Vendor stack stopped (`iGameCenterService`, `iGame.LightingService`). A
diagnostic build (`tools/walk/ColorfulZ590M.js`) held one zone per run; SignalRGB
held the HID collection for the whole session (`CreateFileW` on `MI_02` returned
`ERROR_SHARING_VIOLATION`, i.e. the plugin owned the device).

| Run | Frame | Result |
| --- | --- | --- |
| zone 1 | 7 packets, onboard slots 2..19 green | right-edge vertical strip **and** bottom shroud fully green, everything else dark, no gap |
| zone 2 | 7 packets, 12V slots 0..1 red | void (mis-answer); header has no load |
| zone 3 | 7 packets, ARGB1 slots 20..79 blue | nothing lit |
| zone 4 | 7 packets, ARGB2 slots 80..139 white | nothing lit |
| zone 5 | 10 packets + commit, slots 140..199 white | **fully dark** |

Conclusions:

- **OBSERVED:** the 18 onboard slots cover both physical regions (right-edge
  vertical strip + bottom shroud), and the vendor permutation is therefore
  correct end to end.
- **OBSERVED:** the hardware exposes no LEDs above index 139. A well-formed
  200-LED frame with a valid commit produced no light. This matches the
  disassembly in section 2 and independently confirms 140, so the plugin
  ships a 7-packet frame.
- **OBSERVED:** both 5V ARGB outputs produced no light. On this machine ARGB 1
  is physically broken and ARGB 2 carries the Jungle Leopard L10 hub's ARGB
  input, so the silent hub is consistent with a broken header under the hub,
  a power-only hub input, or firmware that needs a load handshake. No write
  error occurred, so the frame path is not implicated.

### Per-LED walk (onboard layout)

SignalRGB was closed for this pass; each frame was written directly with
`tools/hold.py`, which opens only usage page `0xFF01` / usage 1 and leaves the
frame latched, so no other device was touched.

| Held slot | Observed |
| --- | --- |
| 2 (red) / 13 (blue) | two-point probe: 2 = top of the right-edge strip, 13 = bottom, at the chipset end |
| 15 | vertical part of the lower right edge |
| 16 | bottom edge, rightmost, at the corner |
| 17 | bottom edge, left of 16 |
| 18 | bottom edge, left of 17 |
| 19 | not visible - hidden behind the SATA ports or unpopulated |

A six-colour probe over slots 14..19 had already shown the run crossing the
corner between 15 and 16, and grouping probes showed slots 2..13 = whole
right-edge strip, 14..19 = lower right edge plus bottom edge.

**OBSERVED:** the 18 onboard LEDs are one polyline, not two independent strips:

```
slot  2 .. 15   right edge, top -> bottom (14 LEDs, slot 15 just above the corner)
slot 16 .. 19   bottom edge, right -> left (4 LEDs, 19 hidden at the far left)
```

**Why the flat layout was wrong:** the previous build exposed the onboard LEDs
as an 18-LED horizontal channel and pushed the vendor permutation into the
frame. Whatever the effect drew was spread over one straight strip, so the
geometry never reached SignalRGB and whole segments stayed dark under a
full-canvas effect. The plugin places all 139 LEDs with `setControllableLeds`
and the wire slot for layout LED `i` is simply `2 + i`, so the permutation is
represented by the positions instead of by index arithmetic.

**Canvas size:** the layout is authored on a 120x120 canvas (`Size()` and
`setSize([120, 120])`), which SignalRGB renders as a 60x60 card on the Layout
page - observed ratio is 2:1 (a 240x240 canvas showed as 120x120, a 60x60
canvas showed as 30x30). Onboard 1..14 sit at `x = 116`, `y = 4 + 6i`
(4 -> 82); Onboard 15..18 at `y = 116`, `x = 116 - 24(i - 13)` (92 -> 20); the
12V zone at `[2, 2]`; ARGB 1 and ARGB 2 each get one full-width row (`y = 96`,
`y = 104`, `x` 0 -> 118 step 2).

Rounding must not collapse LEDs onto one pixel: the ARGB runs originally used a
3-pixel step on a 240 grid, which shared positions once scaled, so positions are
authored directly on the target grid and `tools/frame-check.mjs` asserts all
139 are distinct as well as checking the polyline corners.

`tools/frame-check.mjs` asserts the polyline corners and that each layout LED
lands on its expected wire slot (`frame-check: ok`).

## 7. Unresolved

1. Which of wire slots 0/1 actually drives the 12V header — nothing is
   connected, so it stays unverified. The plugin writes both identically.
2. Why neither 5V ARGB header lights a load (broken header vs. hub input vs.
   load handshake). Not a protocol question: the same 7-packet frame lights
   the onboard strip.
3. Sleep/resume behaviour: the plugin does not cache the HID handle, so a
   resume re-uses SignalRGB's endpoint. Not exercised with the device
   suspended.

