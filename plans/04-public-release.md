# Public release — 4 SignalRGB plugin repos

Status: approved 2026-11-15.

## Goal

Publish the four working plugins as four independent, installable SignalRGB
add-on repos under `github.com/peterng1618/`, so any user can install one
device with a single click and a shallow `git` clone.

Non-goals: changing device protocols, publishing evidence, publishing dev
tools, publishing the Massdrop CTRL writeup (that folder contains no plugin).

## Decisions

| Decision | Value |
| --- | --- |
| Release shape | one repo per plugin, flat like `gitlab.com/signalrgb/cololight` |
| Repo owner | `peterng1618` |
| Install route | SignalRGB → Settings → Add-ons → repo URL, or the README deep link |
| Deep link | `signalrgb://addon/install?url=https://github.com/peterng1618/<repo>` |
| Badge image | `https://marketplace.signalrgb.com/resources/add-extension-256.png` |
| Dev repo | keeps `plugins/`, `tools/`, `plans/`, `PROGRESS.md`, full history |
| Public history | one fresh commit per release repo; no dev history |
| Dev tools | never in a release repo (SignalRGB's `PluginCrawler` recurses every `.js`/`.mjs` in the clone) |
| Evidence | stays in the dev repo only |
| Settings UI | `ControllableParameters()` in `.js`; no `.qml`, no `.mjs` |

## Release repos

| Repo | Source plugin | Device photo |
| --- | --- | --- |
| `signalrgb-rainbow-music-led` | `plugins/RainbowMusicLedDirect/RainbowMusicLedDirect.js` | `rainbow-music-led-monitor-backlight-led-bars.jpg` |
| `signalrgb-jungle-leopard-l10` | `plugins/JungleLeopardL10/JungleLeopardL10.js` | `jungle-leopard-l10-argb-hub.png` |
| `signalrgb-colorful-z590m` | `plugins/ColorfulZ590M/ColorfulZ590M.js` | `colorful-cvn-z590m-gaming-frozen-v20.png` |
| `signalrgb-yunari` | `plugins/YunariBridge/YunariBridge.js` | `yunari.svg` |

Repo contents:

```
README.md          badge + deep link, requirements, install, settings, troubleshooting, support, MIT
LICENSE            MIT, Copyright (c) 2026 Huy Nguyen
<Plugin>.js        the plugin, byte-identical to the dev-repo source
<photo>            single device photo/svg referenced by the README
```

## Code changes (dev repo)

### All plugins

- `Publisher()` returns `"Huy Nguyen"` (was `"WhirlwindFX"` / `"community"`;
  `WhirlwindFX` would read as an official plugin).
- `Version()` exported by every plugin: `ColorfulZ590M` and
  `JungleLeopardL10` are missing it; add `"1.0.0"`.

### RainbowMusicLedDirect — portability

Problem: `DEFAULT_IP = "<strip-ip>"` is hardcoded; `controllerIp()` falls
back to it and `DiscoveryService.Update()` probes that exact address, so the
plugin only discovers the author's strip.

- Delete `DEFAULT_IP` and its fallbacks.
- `controllerIp()` returns the configured `ip` setting, else the discovered
  controller IP, else `""`.
- Every send path (`Render`, health check, base-state POST) returns early when
  the IP is empty; log once that the Strip IP must be entered.
- `DiscoveryService.Update()` probes only a non-empty target.
- Geometry defaults (`118 LEDs`, `45x16` ring) stay: they describe the device
  family, not the author's network.

### YunariBridge — portability

Problem: `const API_PORT = 5227` and `LOOPBACK = "127.0.0.1"` are fixed; a
Yunari instance on another port never answers.

- Add settings `apiHost` (textfield, default `127.0.0.1`) and `apiPort`
  (number, 1–65535, default `5227`).
- Use them in `fetchDescriptor()` and in `YunariController` announce/hostname.
- UDP ports already come from the descriptor (`lighting.udpPort`) — unchanged.

### JungleLeopardL10 / ColorfulZ590M — no code change

Both match on VID/PID (Z590M also on `usage_page 0xFF01` / `usage 1`), so any
USB port, COM number or PCIe slot works. `Serial.connect()` passes no port
path. Documentation that mentions COM4 is generic enough to keep, but all
author-machine paths are removed.

### Sanitization

Remove from plugin sources and READMEs:

- private LAN addresses (`192.168.2.*`), the strip MAC (`<mac>`) and
  WiFi BSSID;
- `%USERPROFILE%\...`, Orca scratch/worktree paths, `%REPO%\...`;
- hardware serial numbers and firmware backup locations.

Keep: vendor paths (`C:\Program Files\...`), protocol constants, SHA-256 of
public firmware images.

## README per release repo

````markdown
# <Device name>

[![Add To Installation](https://marketplace.signalrgb.com/resources/add-extension-256.png)](signalrgb://addon/install?url=<repo url>)

<one-paragraph description>

## Requirements
- SignalRGB version tested
- vendor app must be closed / must stay running / not required

## Installation
1. Click the button above, or copy the repo URL into Settings → Add-ons.
2. Restart SignalRGB if prompted.
3. <device-specific step: set IP, disable vendor plugin, ...>

## Settings
<table of ControllableParameters: property, meaning, default>

## Troubleshooting
<known issues from evidence/NOTES.md, sanitized>

## Support
Open an issue on this repo.

## License
MIT
````

## Build tooling (dev repo)

- `release/<repo>/README.md` — authored once per repo.
- `tools/build-releases.mjs`:
  1. wipes and rebuilds `dist/<repo>/`;
  2. copies `<Plugin>.js`, `LICENSE`, the device photo, the README;
  3. fails if any output file matches `192\.168\.|C:\\Users|<mac>|peterng|<serial>|<serial>`;
  4. `git init -b main` + one commit in each `dist/<repo>/` (skipped if `--no-git`).
- `.gitignore`: add `dist/`.
- Pushing to GitHub is a separate, explicitly approved step.

## Verification

Run after the code edits:

```
node tools/plugin_selfcheck.mjs          # L10 frames/channels
node tools/yunari_bridge_selfcheck.mjs   # Yunari descriptor/frames
node tools/frame-check.mjs               # Z590M frame builder
node tools/check_layout.js               # RML 118-LED ring map
node tools/build-releases.mjs            # builds 4 repos, sanitization guard passes
```

Manual checks:

- diff each release `<Plugin>.js` against its dev-repo source (must be identical);
- open each `dist/<repo>/README.md`: deep link URL matches the repo name;
- confirm every release repo has exactly `README.md`, `LICENSE`, one `.js`, one photo.

## Risks

- RML auto-discovery disappears for users who never set an IP. Mitigation:
  the README's first setting step says to enter the strip IP and restart.
  mDNS (`wled.local`) is untested in the plugin sandbox, so it is not used.
- Yunari's `apiHost`/`apiPort` are untested against a non-default instance;
  the defaults reproduce today's behaviour exactly.
- No plugin can be tested on a second PC from here; portability is proven from
  the matching code paths, not from hardware.
- The Z590M plugin was verified on one board revision only.
