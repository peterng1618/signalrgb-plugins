# YunariBridge — evidence and API notes

Observed on this box, SignalRGB 2.5.86, 2026-11-12. No Yunari hardware run was required for the
self-check; live UI verification is listed as remaining work in the README.

## Layout model decision

| Question | Evidence | Result |
|---|---|---|
| Can a network plugin create per-device subdevices? | `cache/addons/0a9a1d8987644605907963196ccf391b/PhilipsHue.js` — `Type()` `"network"`, `SubdeviceController(){ return true; }`, `device.createSubdevice`, `setSubdeviceName`, `setSubdeviceSize`, `setSubdeviceLeds`, `device.subdeviceColor` | Yes, observed |
| Do channels carry geometry? | `docs.signalrgb.com/developer/plugins/using-components/` — channels are generic LED chains; components are user-assigned per channel. Shipped `OEM_Devices_Controller.js` channel modes call only `setSize([1,1])` + `addChannel`; Twinkly clears `setControllableLeds([], [])` before `addChannel`; Yeelight uses `setControllableLeds` only when not using components | No per-channel coordinates, observed |
| Is `SubdeviceController() true` safe with zero subdevices? | `PROGRESS.md` / `plugins/RainbowMusicLedDirect/evidence/NOTES.md` E16 — a true export with no subdevices listed in Devices but not Layouts | Trap confirmed; this plugin always creates at least one, and falls back to channels if creation throws |
| 40-LED ring size | `2·(w+h) − 4`; 11 × 11 = 40; 4 × 4 = 12. Coordinator correction 2026-11-12 | 11 × 11 is the fallback default |

## Fan control

`SupportsFanControl` / `createFanControl` / `setRPM` / `getNormalizedFanlevel` appear only in HID or
serial plugins on this box (Arctic, NZXT, Corsair, Lian Li, Asus, Gigabyte, Thermal Take).
`docs.signalrgb.com/developer/plugins/fan-control/` documents the calls but does not state whether a
network plugin's Cooling UI and hard-lock semantics are supported. No network plugin uses them, so
the bridge does not implement controls; Yunari keeps pump/fan ownership. Not implemented on
purpose, not faked.

## Colour protocol source

the Yunari bridge contract doc (read-only): `YRGB` magic `59 52 47 42`, version 1,
device index u8, LED count u16 LE, 3×N RGB, UDP 7788, descriptor at HTTP 5227. The self-check pins
these bytes. End-to-end UDP delivery to Yunari is unverified until a live run.

## Observed / inferred / unknown

- Observed: SignalRGB plugin API behaviour in the shipped files and docs cited above; self-check
  passes with stubbed device/udp/XHR.
- Inferred: subdevices will enumerate in this build exactly as PhilipsHue's lights do; the ring
  direction (bottom-left, up, clockwise) matches the RML ring convention but the Kraken's physical
  LED order is not measured here.
- Unknown: whether the 11 × 11 ring's first LED is physically at the bottom-left on the Kraken Z;
  whether the user's SignalRGB build renders the subdevice canvas exactly as authored; whether
  live Yunari accepts the frame while a theme drives the LCD.
