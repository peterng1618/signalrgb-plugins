# Jungle Leopard L10 ARGB Hub

[![Add To Installation](https://marketplace.signalrgb.com/resources/add-extension-256.png)](signalrgb://addon/install?url=https://github.com/peterng1618/signalrgb-jungle-leopard-l10)

Direct control of the Jungle Leopard L10 ARGB hub over its CH340 serial link, with
no vendor app running. Each populated port becomes its own independently
placeable channel group in SignalRGB, with per-fan LED layout.

![](jungle-leopard-l10-argb-hub.png)

## Requirements

- Jungle Leopard L10 ARGB hub (`1A86:8042`).
- SignalRGB `2.5.86` (tested).
- Close `Jungle Leopard Display.exe` — it holds the serial port.

## Installation

1. Click the button above, or open SignalRGB → **Settings → Add-ons → Add Add-on**
   and paste `https://github.com/peterng1618/signalrgb-jungle-leopard-l10`.
2. Restart SignalRGB when prompted.
3. Close the Jungle Leopard vendor app so the hub's serial port is free.

## Settings

| Setting | Meaning | Default |
| --- | --- | --- |
| Fans Per Port | Comma-separated fan count for ports 1–10; `0` = unused. | `0,0,0,0,0,3,2,2,0,0` |
| LEDs Per Fan | LEDs on each fan; port LED count = fans × LEDs, capped at 60. | `8` |
| Reverse Ports | Comma-separated `0`/`1` per port; reverses LED order inside that port. | `0,0,0,0,0,0,0,1,0,0` |
| Port LED Counts Override | Optional logical LED count per port; empty uses fans × LEDs. | `20,0,0,0,0,24,16,16,0,0` |
| Diagnostic Mode | `Off`, `Port walk` (each port 2 s) or `LED walk` (one LED every 0.5 s). | `Off` |
| Diagnostic Port | Port used by LED walk. | `6` |
| Lighting Mode | `Canvas` follows the effect, `Forced` uses one colour. | `Canvas` |
| Forced Color | Colour used in `Forced` mode. | `#009bde` |
| Shutdown Color | Written when SignalRGB shuts down. | `#000000` |

The hub always receives a fixed 60-LED block per port on the wire; the logical
count only decides how much of that block is driven.

## Troubleshooting

- **Hub stops responding after a replug.** The firmware offers no reset command.
  Unplug the hub's USB, wait a few seconds, plug it back in, then reload the
  device in SignalRGB.
- **Ports light purple / nothing responds.** The hub rejects a fill count other
  than 60. Leave the wire fill count defaults alone; use the logical overrides
  instead.
- **Port mapping looks wrong.** Turn on `Port walk`, note which fans light, then
  set `Fans Per Port` and `Reverse Ports` to match.

## Support

Open an issue on this repository.

## License

MIT — see `LICENSE`.
