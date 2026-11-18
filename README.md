# SignalRGB plugins

SignalRGB device plugins written and verified on real hardware. Each plugin is
published as its own add-on repository so it can be installed on its own.

| Device | Transport | Install |
| --- | --- | --- |
| Rainbow Music Led (WLED strip) | WLED realtime UDP + HTTP fallback | [signalrgb-rainbow-music-led](https://github.com/peterng1618/signalrgb-rainbow-music-led) |
| Jungle Leopard L10 ARGB hub | CH340 serial | [signalrgb-jungle-leopard-l10](https://github.com/peterng1618/signalrgb-jungle-leopard-l10) |
| Colorful CVN Z590M GAMING FROZEN V20 | USB HID | [signalrgb-colorful-z590m](https://github.com/peterng1618/signalrgb-colorful-z590m) |
| Yunari RGB bridge | HTTP + UDP (loopback) | [signalrgb-yunari](https://github.com/peterng1618/signalrgb-yunari) |

Install any of them from SignalRGB → **Settings → Add-ons → Add Add-on** using
the repository URL, or click the install badge in its README.

## Repository layout
```
plugins/<Name>/<Name>.js    plugin source + README + evidence notes
release/<repo>/README.md    README shipped in each add-on repo
tools/                      checks and release tooling (not shipped)
plans/                      design and implementation records
PROGRESS.md                 reverse-engineering log
```

`tools/build-releases.mjs` copies each plugin, its photo, the license and the
release README into `dist/<repo>/` and commits it there. `dist/` is ignored.

## Checks

```
node tools/release_check.mjs            # exports + sanitization gate
node tools/check_layout.js              # WLED ring map
node tools/frame-check.mjs              # Z590M frame builder
node tools/plugin_selfcheck.mjs         # L10 frames and channels
node tools/yunari_bridge_selfcheck.mjs  # Yunari descriptor and frames
node tools/rml_selfcheck.mjs            # WLED portability
node tools/build-releases.mjs           # build the four add-on repos
```

The gate also rejects device-specific identifiers listed in
`tools/private_values.txt`, which is not committed.

## History

This public repository is a squashed snapshot: development history
(reverse-engineering logs, packet captures, machine-specific notes) is kept
locally and is not published.

## License

MIT — see `LICENSE`.
