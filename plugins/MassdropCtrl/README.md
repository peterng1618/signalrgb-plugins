# Massdrop CTRL — SignalRGB

Target: Massdrop/Drop CTRL v1, `USB\VID_04D8&PID_EED2`, internal hub `04D8:EEC5`.

## Status

Flashed 2026-11-12 with the SignalRGB-protocol QMK image (approved; stock image backed up first).
Post-flash verification: raw HID `0xFF60/0x61` is present on interface 1 and the plugin's identity
queries answer (`firmware type 2`, `QMK 0.6.103`, `protocol 1.0.5`, `119 LEDs`); a 119-LED red frame was
accepted. Remaining: restart SignalRGB (coordinator owns restarts) and confirm control visually.

No plugin is needed. SignalRGB 2.5.86 already ships one for this exact VID/PID
(`Massdrop_CTRL_QMK_Keyboard.js` 1.1.2, from the built-in `SRGBmods/qmk-plugins` addon).
Before the flash it could not work because stock Drop firmware exposes **no raw-HID /
vendor HID collection** (only keyboard, NKRO, mouse, system and consumer collections).

The failure surface (SignalRGB's "Missing Privileges") was the plugin writing its 32-byte
raw-HID query to interface 1, which on stock firmware is the NKRO keyboard collection;
Windows rejects the write with `ERROR_ACCESS_DENIED` (5). Running SignalRGB elevated
cannot change that. Details and evidence: [`evidence/NOTES.md`](evidence/NOTES.md).

## Firmware

- Image: `drop_ctrl_v1_default_md.bin`, SHA-256 `DB4654161DB9A02706ABEA3E5D022D57051CD9FF2D5959122906E082373199D6`
- Source: SRGBmods/QMK-Binaries, `massdrop-xap/default_md` (Massdrop `feature/riot_xap` + SignalRGB protocol)
- Tool: mdloader 1.0.7; bootloader entry = hold `Fn`+`B` ~3 s
- Stock backup: 65,536 B, SHA-256 `9410FDAACD8935D64290807FBF6B1465BDACA538A43EF9CEE9C455B00070D21E`
  (`stock_ctrl_v1.bin`, kept in a local archive folder). Re-flash it with the same
  mdloader command to return to stock.

After flashing:

```powershell
# expect: raw HID 0xFF60/0x61 present, all identity queries answered
python tools/verify-after-flash.py
```

Then restart SignalRGB (coordinator owns restarts) and check the CTRL appears without the
privileges warning.

## Files

- `evidence/NOTES.md` — observations/inferences/unknowns, flash request.
- `evidence/hid_descriptors.txt` — descriptor evidence.
- `../../tools/hid_probe.py` — read-only HID collection/descriptor dump.
- `../../tools/verify-after-flash.py` — runnable post-flash check.
