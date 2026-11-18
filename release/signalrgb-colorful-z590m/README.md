# Colorful CVN Z590M GAMING FROZEN V20

[![Add To Installation](https://marketplace.signalrgb.com/resources/add-extension-256.png)](signalrgb://addon/install?url=https://github.com/peterng1618/signalrgb-colorful-z590m)

Direct USB HID control of the Colorful CVN Z590M GAMING FROZEN V20's onboard
shroud LEDs, 12V RGB header and both 5V ARGB headers — no iGameCenter or
`iGame.LightingService` process needed at runtime.

![](colorful-cvn-z590m-gaming-frozen-v20.png)

## Requirements

- Colorful CVN Z590M GAMING FROZEN V20 (`2F4C:1000`, HID interface `MI_02`).
- SignalRGB `2.5.86` (tested).
- Close iGameCenter and `iGame.LightingService` — they fight for the same HID
  interface.

## Installation

1. Click the button above, or open SignalRGB → **Settings → Add-ons → Add Add-on**
   and paste `https://github.com/peterng1618/signalrgb-colorful-z590m`.
2. Restart SignalRGB when prompted.
3. Close iGameCenter and its background services.

The plugin binds only to the LED collection (`usage page 0xFF01`, `usage 1`); the
firmware-update collection on `MI_01` is never opened.

## Settings

| Setting | Meaning | Default |
| --- | --- | --- |
| Lighting Mode | `Canvas` follows the effect, `Forced` uses one colour. | `Canvas` |
| Forced Color | Colour used in `Forced` mode. | `#009bde` |
| Shutdown Color | Written when SignalRGB shuts down. | `#000000` |

## Troubleshooting

- **A header stays dark.** The 5V ARGB headers only work while the board's
  lighting controller is in software mode. Close the vendor services completely
  (not just the window) and reload the device.
- **Device does not appear.** Check Device Information in SignalRGB for
  `VID 2F4C / PID 1000`; if the board is missing, update the chipset/USB drivers
  and rescan.
- **Another app takes over the LEDs.** iGameCenter, Dynamik Light, Armoury Crate
  or OpenRGB can all claim the HID collection. Run only one.

## Support

Open an issue on this repository.

## License

MIT — see `LICENSE`.
