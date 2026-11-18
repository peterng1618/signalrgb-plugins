# Massdrop CTRL (04D8:EED2) — SignalRGB "Missing Privileges" investigation

Date: 2026-11-12. Host: Windows 11 Pro 10.0.22631. Worktree: `signalrgb-plugins/massdrop-ctrl`.

## Verdict

The keyboard is running **stock Drop firmware without any raw-HID / vendor HID collection**. SignalRGB's
shipped plugin for this board (`Massdrop_CTRL_QMK_Keyboard.js`, from the `SRGBmods/qmk-plugins` addon)
talks a 32-byte raw-HID protocol that only exists in a QMK build carrying the SignalRGB protocol module.
No such collection exists on this firmware, so the plugin's first write lands on the NKRO keyboard
collection and fails with **Win32 error 5 (ERROR_ACCESS_DENIED)**. SignalRGB turns that into its canned
"Missing Privileges / unsupported QMK firmware" device-page message. Elevation cannot fix it.
**A firmware flash is required** — done 2026-11-12 with coordinator approval (see Flash performed below).
After the flash the raw-HID collection exists on interface 1, the plugin's identity queries all answer,
and a full 119-LED red frame was accepted. Remaining step: SignalRGB restart (coordinator owns it) and
visual confirmation.

## Observations (measured)

| ID | Observation |
|---|---|
| OBS-1 | Device enumerates as `USB\VID_04D8&PID_EED2` (product `CTRL`, manufacturer `Drop`, serial `<serial>`), plus internal hub `USB\VID_04D8&PID_EEC5` (Generic USB Hub). All Status OK. |
| OBS-2 | Exactly 5 HID top-level collections exist (hidapi 0.15.0 enumeration, read-only): MI_00 `0x1/0x6` 6KRO keyboard (in 1+1+6 B, out 1+1 B); MI_01 `0x1/0x6` NKRO keyboard (in 1+31 B, out 1+3 B); MI_02 Col01 `0x1/0x2` mouse; Col02 `0x1/0x80` system; Col03 `0xC/0x1` consumer. Full descriptors: `evidence/hid_descriptors.txt`. |
| OBS-3 | **No usage page `0xFF60` / usage `0x61` raw-HID collection exists on MI_00, MI_01 or MI_02.** MI_01 is the NKRO keyboard interface, not raw HID. |
| OBS-4 | All five collections open read/write as a normal (non-elevated) process (`tools/hid_probe.py`). So a plain `CreateFile` is not the blocker. |
| OBS-5 | Replaying the plugin's first packet (`device.write([0x00]*32)` on MI_01) returns `-1` with `GetLastError()==5` (ERROR_ACCESS_DENIED), and `read(32)` fails with `OSError('read error')`. Windows does not allow host writes to the keyboard collection's output report. |
| OBS-6 | SignalRGB 2.5.86 is a native Qt app (`%LOCALAPPDATA%\VortxEngine\app-2.5.86\Signal-x64\SignalRgb.exe`, SHA-256 `bf9efe1958ccaf82ad5c020e618d60b7000b55bbf1ed6a6934f2cf95c16d50af`). It has no Massdrop plugin of its own; the string `Massdrop` does not occur in the exe. |
| OBS-7 | The plugin comes from the built-in addon repo `https://github.com/SRGBmods/qmk-plugins` (local clone commit `d476c65e8acb0ed1034b5343ecca368c6724aa2c`, 2026-11-07): `cache\addons\db96a7d88f5b77cb2217d656c1356d4e\Massdrop\Massdrop_CTRL_QMK_Keyboard.js`, plugin version 1.1.2. Log confirms it loaded: `11/12/26 01:05:20 USB - Product: [CTRL]`, `01:06:40 Shutting down Massdrop CTRL QMK Keyboard`. |
| OBS-8 | Plugin contract: `VendorId() 0x04d8`, `ProductId() 0xEED2`, `Validate(endpoint){ return endpoint.interface === 1 }` (no usage-page check), 32-byte reports, 33-byte colour packets. Commands: `0x28` firmware type, `0x21` QMK version, `0x22` protocol version, `0x23` unique ID, `0x27` LED count, `0x25` effect enable, `0x24` stream colours (9 LEDs/packet, `[0x00,0x24,startIdx,count,R,G,B...]`), `0x26` effect disable. |
| OBS-9 | Plugin 1.1.2 has an always-true bug at line 124: `if(FirmwareTypeByte !== 1 \|\| FirmwareTypeByte !== 2)` — this notifies "Unsupported Firmware" even on good firmware. Cosmetic; not the failure. |
| OBS-10 | QMK mainline still documents `keyboards/massdrop/ctrl` (ATSAMD51J18A + USB2422 hub — matches this host's `04D8:EEC5` hub), but `arm_atsam` was removed from QMK mainline in Nov 2024, so current mainline cannot build it; 0.26.x or a fork is required. |
| OBS-11 | SRGBmods ships the only prebuilt SignalRGB-protocol CTRL v1 image: `drop_ctrl_v1_default_md.bin`, 54,740 B, SHA-256 `DB4654161DB9A02706ABEA3E5D022D57051CD9FF2D5959122906E082373199D6` (downloaded copy in scratch, unverified against a signed manifest — repo only). It contains the strings `Drop Inc.`, `Drop Hub`, `CTRL`. |
| OBS-12 | `mdloader` 1.0.7 Windows release zip: SHA-256 `C0B358642A5A0B0286E9B1B35B814A3EAADFF52B3D944DD6C5F881CAE6B2E19E`, contains a single 150,965 B `mdloader.exe` (applet is bundled). |
| OBS-13 | Process runs as a non-elevated token (`IsUserAnAdmin()==false`); no elevation was attempted. |
| OBS-14 | Stock backup read over the SAM-BA bootloader (COM7, MCU SAMD51J18A, bootloader `v2.18 Sep 4 2018`): `stock_ctrl_v1.bin`, 65,536 B at `0x4000`, SHA-256 `9410FDAACD8935D64290807FBF6B1465BDACA538A43EF9CEE9C455B00070D21E`, stored in the local firmware scratch folder. The dump contains `VER Oct 20 2021 11:35:02 [massdrop/ctrl:p_ctrl__default]` (stock v1 firmware, default keymap) — this resolves UNK-1. |
| OBS-15 | Flash performed with `mdloader 1.0.7`: `--first --download drop_ctrl_v1_default_md.bin --restart` → `Writing firmware... Complete! / Booting device... Success!`. Bootloader entry method: **Fn+B held ~3 s** (first 180 s attempt with a short press did not enter; pinhole not used). Exactly one bootloader port was present for both the backup and the download. |
| OBS-16 | Post-flash HID map (hidapi): if0 `0x1/0x6` 6KRO keyboard; **if1 `0xFF60/0x61` raw HID**; if2 `0x1/0x2` mouse, `0x1/0x80` system, `0xC/0x1` consumer, and `0x1/0x6` NKRO keyboard. The plugin's `Validate(interface === 1)` now selects the raw-HID collection. |
| OBS-17 | Protocol identity over raw HID (report 32 B): `0x28`→2 (firmware type), `0x21`→0.6.103 (QMK version), `0x22`→1.0.5 (SignalRGB protocol), `0x23`→0 (unique id), `0x27`→0x77 = **119 LEDs**. `0x25` effect-enable, 14 × `0x24` colour packets (9 LEDs each) for all 119 LEDs red, then `0x26` effect-disable were all accepted (`hid.write` returned 33 for every packet). |
| OBS-18 | The 1.0.5 and 1.0.6 protocol sources differ only by an `#include QMK_KEYBOARD_H` line (`GPL/1.0.5/.../signalrgb.c` vs `GPL/1.0.6/.../signalrgb.c`), so plugin 1.1.2 "built for V1.0.6" is wire-compatible with this 1.0.5 build. |

## Inferences

- INF-1: The stock CTRL firmware is Drop's QMK-derived firmware with onboard lighting only; it exposes
  no host-controllable lighting channel (no vendor page, no feature/output RGB reports). Drop configures
  this board by reflashing firmware, not by runtime HID commands. Therefore no SignalRGB plugin — ours
  or theirs — can light it on the stock firmware.
- INF-2: "Missing Privileges" is a generic UI string for "plugin initialisation/open failed", not a real
  UAC problem. It is reproduced by OBS-5 outside SignalRGB.
- INF-3: The plugin binds interface 1 blindly, which on the stock firmware was the NKRO keyboard
  interface. After the flash the raw-HID collection took that slot (OBS-16), matching the plugin.
- INF-4: The board is a CTRL v1 (SAMD51J18A + USB2422 hub + mdloader), not v2 (v2 images are `.uf2`).

## Unknowns

- UNK-1 (resolved): stock firmware was `VER Oct 20 2021 11:35:02 [massdrop/ctrl:p_ctrl__default]`.
- UNK-2: Whether the flashed SRGBmods image uses SmartEEPROM. mdloader 1.0.7 raised no SmartEEPROM
  warning for either the read or the write, so no `--ignore-eep` was needed.
- UNK-3 (resolved): raw HID landed on interface 1 (OBS-16).
- UNK-4: The flashed image uses Drop's default layout; keymaps are not customised. Any user
  customisation from the stock firmware is gone (stock was `p_ctrl__default`, so none was expected).
- UNK-5: Administrator-token open of MI_01 was never tested (no elevation attempted). Not needed —
  the protocol works from a normal token now (OBS-17).
- UNK-6: Visual confirmation that the 3 s red frame lit all 119 LEDs is pending user report; the
  protocol writes were accepted.

## Evidence IDs

- `evidence/hid_descriptors.txt` — raw report descriptors for all five collections (OBS-2).
- REA (`mcp__rea__open_binary`) opened SignalRgb.exe for string analysis but `search_strings` timed out
  at 330 s on the 120 MB binary; no REA evidence bundle was produced. Strings were instead located with
  the byte search in `tools/pe_strings_search.py` (OBS-6). No REA evidence ID exists to cite.

## Flash performed (approved 2026-11-12)

Result: backup verified first, then the write completed and the board rebooted into the new firmware.
No device re-enumeration failure, no `--ignore-eep` needed, exactly one bootloader device throughout.
Post-flash verification `python tools/verify-after-flash.py` → `PASS` (OBS-16/17).

- File: `drop_ctrl_v1_default_md.bin` (54,740 B)
- Source: https://raw.githubusercontent.com/SRGBmods/QMK-Binaries/main/QMK%2BWeirdness-Outdated-Firmware/massdrop-xap/default_md/drop_ctrl_v1_default_md.bin
- SHA-256: `DB4654161DB9A02706ABEA3E5D022D57051CD9FF2D5959122906E082373199D6`
- Build: SRGBmods back-port of `Massdrop/qmk_firmware` branch `feature/riot_xap` + SignalRGB protocol
  (repo `SRGBmods/QMK-Binaries`, folder warns "massively unsupported / outdated"). QMK version and
  `RAW_ENABLE` value are not stated by the repo; the build is the vendor-recommended image for this
  board and must expose the raw-HID collection the plugin needs.
- Tool: `mdloader.exe` 1.0.7 (`C0B3…E19E`), no admin rights needed.
- Command, after backing up the stock image:
  `mdloader.exe --first --upload stock_ctrl_v1.bin --addr 0x4000 --size 0x10000`
  `mdloader.exe --first --download drop_ctrl_v1_default_md.bin --restart`
  (press `Fn`+`B` for ~0.5 s, or the pinhole on the bottom, within the 60 s scan window)
- Recovery: `Fn`+`B`/pinhole re-enters the SAM-BA bootloader (mdloader never writes the bootloader);
  re-flash the backed-up `stock_ctrl_v1.bin` or any subsequent QMK image with the same command.
- Risks: keymap reset to Drop default; keyboard unusable if the flash is interrupted (recoverable via
  bootloader); SignalRGB must be restarted afterwards to re-detect.
