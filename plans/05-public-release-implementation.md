# Public release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the four plugins portable and publish each as its own flat, single-click-installable SignalRGB add-on repo.

**Architecture:** The dev repo stays the source of truth. Four `release/<repo>/README.md` files plus `tools/build-releases.mjs` produce `dist/<repo>/` trees (README, LICENSE, one `.js`, one photo) and git-init each with a single commit. Plugin sources get a static gate (`tools/release_check.mjs`) and two real portability fixes (RML IP, Yunari API host/port) proven by stub harnesses.

**Tech Stack:** plain JavaScript (ES modules, Node 18+), no dependencies. Checks are assert-style scripts run with `node`.

**Spec:** `plans/04-public-release.md`

## Global Constraints

- Release repo names: `signalrgb-rainbow-music-led`, `signalrgb-jungle-leopard-l10`, `signalrgb-colorful-z590m`, `signalrgb-yunari`.
- GitHub owner: `peterng1618`.
- Deep link: `signalrgb://addon/install?url=https://github.com/peterng1618/<repo>`.
- Badge: `[![Add To Installation](https://marketplace.signalrgb.com/resources/add-extension-256.png)]`.
- `Publisher()` returns exactly `"Huy Nguyen"`; every plugin exports `Version()`.
- `LICENSE`: MIT, `Copyright (c) 2026 Huy Nguyen` (reuse root `LICENSE`).
- Release repos contain no dev tools, no evidence, no `.qml`, no `.mjs`.
- Forbidden in any published file: `192.168.<n>.<n>`, `C:\Users\`, `%REPO%`, `orca\chat-scratch`, `<mac>`, `<serial>`, `<serial>`.
- Plugin file names never change (`ColorfulZ590M.js`, `JungleLeopardL10.js`, `RainbowMusicLedDirect.js`, `YunariBridge.js`).

## Review Focus

- RML with no Strip IP configured: zero UDP sends, zero HTTP requests, one log line — not a packet to the author's old address.
- RML `DiscoveryService.Update()`: never probes a hardcoded LAN address, at any interval.
- Yunari with `apiHost`/`apiPort` set: every HTTP request goes to that host and port, and the announced controller matches.
- Yunari with a blank/non-numeric/out-of-range `apiPort`: falls back to `127.0.0.1`/`5227` instead of throwing.
- Release repo tree: exactly README + LICENSE + one `.js` + one photo — a stray `.js`/`.mjs` would be crawled as a plugin.

---

### Task 1: Static release gate + plugin metadata

**Files:**
- Create: `tools/release_rules.mjs`
- Create: `tools/release_check.mjs`
- Modify: `plugins/ColorfulZ590M/ColorfulZ590M.js:15`
- Modify: `plugins/JungleLeopardL10/JungleLeopardL10.js:39`
- Modify: `plugins/RainbowMusicLedDirect/RainbowMusicLedDirect.js:11`
- Modify: `plugins/YunariBridge/YunariBridge.js:32`

**Interfaces:**
- Produces: `release_rules.mjs` exports `PLUGIN_SOURCES: string[]` (repo-relative paths), `lintSanitization(label: string, text: string): string[]` (forbidden private values only), and `lintPlugin(label: string, text: string): string[]` (Publisher/Version exports plus sanitization). `release_check.mjs` is a CLI that exits 1 when `lintPlugin` returns anything.
- Consumes: nothing.

- [ ] **Step 1: Write the gate**

`tools/release_rules.mjs` — the rule set both the source check and the build use:

```js
// Shared release rules. Used by tools/release_check.mjs (sources) and
// tools/build-releases.mjs (built repos).
export const PLUGIN_SOURCES = [
	"plugins/RainbowMusicLedDirect/RainbowMusicLedDirect.js",
	"plugins/JungleLeopardL10/JungleLeopardL10.js",
	"plugins/ColorfulZ590M/ColorfulZ590M.js",
	"plugins/YunariBridge/YunariBridge.js",
];

const FORBIDDEN = [
	[/192\.168\.\d+\.\d+/, "private LAN address"],
	[/C:\\Users\\/i, "author user path"],
	[/D:\\git-repos/i, "author repo path"],
	[/orca\\chat-scratch/i, "orca scratch path"],
	[/<mac>/i, "author device MAC"],
	[/<serial>/i, "author USB serial"],
	[/<serial>/i, "author hardware serial"],
];

export function lintSanitization(label, text) {
	const out = [];
	for (const [pattern, what] of FORBIDDEN) {
		const hit = text.match(pattern);
		if (hit) out.push(`${label}: ${what} (${hit[0]})`);
	}
	return out;
}

export function lintPlugin(label, text) {
	const out = [];
	if (!/export function Publisher\(\) \{ return "Huy Nguyen"; \}/.test(text)) {
		out.push(`${label}: Publisher() must return "Huy Nguyen"`);
	}
	if (!/export function Version\(\) \{ return "\d+\.\d+\.\d+"/.test(text)) {
		out.push(`${label}: Version() must be exported`);
	}
	return out.concat(lintSanitization(label, text));
}
```

`tools/release_check.mjs`:

```js
// Static release gate. Run: node tools/release_check.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PLUGIN_SOURCES, lintPlugin } from "./release_rules.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = PLUGIN_SOURCES.flatMap((file) =>
	lintPlugin(file, fs.readFileSync(path.join(root, file), "utf8")));

if (failures.length) {
	for (const line of failures) console.log(`FAIL ${line}`);
	process.exit(1);
}
console.log(`release rules ok: ${PLUGIN_SOURCES.length} plugins`);
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `node tools/release_check.mjs`
Expected: exit 1, `FAIL` lines naming all four plugins (Publisher) plus missing `Version()` on ColorfulZ590M and JungleLeopardL10, plus the `192.168.` hit in `RainbowMusicLedDirect.js`.

- [ ] **Step 3: Fix the metadata only**

- `ColorfulZ590M.js`: `Publisher()` → `"Huy Nguyen"`; add `export function Version() { return "1.0.0"; }` directly below `Publisher()`.
- `JungleLeopardL10.js`: same two edits.
- `RainbowMusicLedDirect.js`: `Publisher()` → `"Huy Nguyen"` (Version already `"1.0.0"`).
- `YunariBridge.js`: `Publisher()` → `"Huy Nguyen"`.

- [ ] **Step 4: Re-run the gate**

Run: `node tools/release_check.mjs`
Expected: still exit 1; the only remaining failure is the `192.168.` line in `RainbowMusicLedDirect.js` (Task 2 owns it).

- [ ] **Step 5: Confirm the plugin harnesses still pass**

Run: `node tools/frame-check.mjs && node tools/plugin_selfcheck.mjs && node tools/yunari_bridge_selfcheck.mjs && node tools/check_layout.js`
Expected: each prints its existing ok/summary line and exits 0.

- [ ] **Step 6: Commit**

```bash
git add tools/release_rules.mjs tools/release_check.mjs plugins/*/*.js
git commit -m "Add release gate and standardize plugin metadata"
```

---

### Task 2: RainbowMusicLedDirect portability

**Files:**
- Create: `tools/rml_selfcheck.mjs`
- Modify: `plugins/RainbowMusicLedDirect/RainbowMusicLedDirect.js:23,76-81,215,219-228,307,432-448,455-470,555-566`

**Interfaces:**
- Consumes: `PLUGIN_SOURCES`/`lintPlugin` from Task 1 (the gate must end green).
- Produces: module-internal `controllerIp(): string` (empty string when nothing is configured or discovered), `STABLE_ID = "rainbow-music-led"`. No exports change.

- [ ] **Step 1: Write the failing harness**

`tools/rml_selfcheck.mjs` — stub signal globals, import a temp copy (same pattern as `tools/yunari_bridge_selfcheck.mjs`):

```js
// Runnable portability check for RainbowMusicLedDirect. Run: node tools/rml_selfcheck.mjs
// Stubs device/service/udp/XMLHttpRequest; no hardware, no network.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const raw = fs.readFileSync(new URL("../plugins/RainbowMusicLedDirect/RainbowMusicLedDirect.js", import.meta.url), "utf8");
let failures = 0;
const check = (label, ok, detail = "") => {
	console.log(`${ok ? "ok  " : "FAIL"} ${label} ${ok ? "" : detail}`);
	if (!ok) failures++;
};

async function load(globals) {
	Object.assign(globalThis, globals);
	const logs = [], sends = [], urls = [];
	globalThis.device = {
		setName() {}, addFeature() {}, setSize() {}, setControllableLeds() {}, SetLedLimit() {},
		log(m) { logs.push(String(m)); }, color: () => [0, 0, 0],
	};
	globalThis.service = {
		controllers: [], saveSetting() {}, updateController() {}, announceController() {},
		addController(c) { this.controllers.push(c); },
		getController() { return undefined; },
	};
	globalThis.udp = { send(host, port, packet) { sends.push({ host, port, len: packet.length }); } };
	class FakeXhr {
		open(method, url) { this.url = url; urls.push(url); }
		setRequestHeader() {}
		send() { this.readyState = 4; this.status = 0; this.responseText = ""; if (this.onreadystatechange) this.onreadystatechange(); }
	}
	globalThis.XMLHttpRequest = FakeXhr;
	const file = path.join(os.tmpdir(), `rml-selfcheck-${process.pid}-${Math.random().toString(16).slice(2)}.mjs`);
	fs.writeFileSync(file, raw);
	const mod = await import(pathToFileURL(file).href);
	fs.unlinkSync(file);
	return { mod, logs, sends, urls };
}

const base = { LightingMode: "Canvas", forcedColor: "#ff0000", shutdownColor: "#000000", layoutModel: "Channels" };

// 1. no IP configured -> no network I/O at all
{
	const { mod, logs, sends, urls } = await load({ ...base });
	mod.Initialize();
	check("initialize makes no HTTP request", urls.length === 0, JSON.stringify(urls));
	mod.DiscoveryService().Update();
	check("discovery probe skipped without IP", urls.length === 0, JSON.stringify(urls));
	mod.Render();
	check("render sends no UDP without IP", sends.length === 0, JSON.stringify(sends));
	check("logs that the IP is missing", logs.some(l => /ip/i.test(l)), JSON.stringify(logs));
}

// 2. configured IP -> that address is used everywhere
{
	const { mod, sends, urls } = await load({ ...base, ip: "10.0.0.9", ledCount: "8", layoutShape: "Strip", layoutWidth: "8", layoutHeight: "1" });
	mod.Initialize();
	check("discovery probes the configured IP", urls.some(u => u.startsWith("http://10.0.0.9/")), JSON.stringify(urls));
	mod.Render();
	check("render sends UDP to the configured IP", sends.length > 0 && sends.every(s => s.host === "10.0.0.9"), JSON.stringify(sends));
}

if (failures) process.exit(1);
console.log("rainbow-music-led portability ok");
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node tools/rml_selfcheck.mjs`
Expected: FAIL on "initialize makes no HTTP request", "discovery probe skipped without IP", "render sends no UDP without IP" — requests/listeners target `<strip-ip>`.

- [ ] **Step 3: Implement the portability change**

In `RainbowMusicLedDirect.js`:

1. Replace line 23 `const DEFAULT_IP = "<strip-ip>";` with `const STABLE_ID = "rainbow-music-led";`.
2. `controllerIp()` returns `""` instead of `DEFAULT_IP` in the last line.
3. `sendUdp`: first line `const target = controllerIp(); if (!target) { log("Rainbow Music Led: set Strip IP in the device settings."); return; }`, then `udp.send(target, ...)`.
4. `httpRequest`: same guard first; when empty call `callback(0, "")` and return before constructing the XHR.
5. `Initialize` log line: use `${controllerIp() || "(no IP set)"}`.
6. `findController`: replace the `service.getController("<mac>")` block with `service.getController(STABLE_ID)`, and drop the `c.ip === DEFAULT_IP` half of the adoption condition (keep `c.name === "Rainbow Music Led"`).
7. `announceFromConfig`: `const targetIp = controllerIp();` and keep announcing with `ip: targetIp || ""`, so the device still appears in Devices before an IP is entered.
8. `DiscoveryService().Update`: `const target = controllerIp(); if (!target) return;` before `probeDevice(target)`.

- [ ] **Step 4: Run both checks**

Run: `node tools/rml_selfcheck.mjs && node tools/check_layout.js && node tools/release_check.mjs`
Expected: `rainbow-music-led portability ok`, `ring ok: ...`, `release rules ok: 4 plugins`.

- [ ] **Step 5: Commit**

```bash
git add tools/rml_selfcheck.mjs plugins/RainbowMusicLedDirect/RainbowMusicLedDirect.js
git commit -m "Rainbow Music Led: drop the author's hardcoded IP"
```

---

### Task 3: YunariBridge configurable API host and port

**Files:**
- Modify: `plugins/YunariBridge/YunariBridge.js:45-46,55-62,486-535,715-749,776-792`
- Modify: `tools/yunari_bridge_selfcheck.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: module-internal `apiHostValue(): string` (trimmed `apiHost`, fallback `"127.0.0.1"`), `apiPortValue(): number` (`apiPort` clamped to 1–65535 when finite, else `5227`). New ControllableParameters `apiHost` (textfield) and `apiPort` (number 1–65535, default `5227`).

- [ ] **Step 1: Extend the harness with failing assertions**

In `tools/yunari_bridge_selfcheck.mjs`:

1. Add a `urls` array next to `sends` in `load()`, and push `url` in `FakeXhr.open`.
2. Return `urls` from `load()`.
3. Append before the final summary:

```js
// API host/port come from settings, with a safe fallback
{
	const { mod, urls } = await load({ ...baseGlobals, apiHost: "10.1.2.3", apiPort: "6000" }, FIXTURE);
	mod.DiscoveryService().Initialize();
	check("custom apiHost/apiPort used", urls.some(u => u.startsWith("http://10.1.2.3:6000/")), JSON.stringify(urls));
}
{
	const { mod, urls } = await load({ ...baseGlobals, apiHost: "  ", apiPort: "not-a-number" }, FIXTURE);
	mod.DiscoveryService().Initialize();
	check("blank host and bad port fall back", urls.every(u => u.startsWith("http://127.0.0.1:5227/")), JSON.stringify(urls));
}
{
	const { mod, urls } = await load({ ...baseGlobals, apiPort: "0" }, FIXTURE);
	mod.DiscoveryService().Initialize();
	check("out-of-range port falls back to 5227", urls.every(u => u.startsWith("http://127.0.0.1:5227/")), JSON.stringify(urls));
}
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `node tools/yunari_bridge_selfcheck.mjs`
Expected: FAIL on all three new checks (requests still go to `127.0.0.1:5227`).

- [ ] **Step 3: Implement the settings**

In `YunariBridge.js`:

1. Keep `const LOOPBACK = "127.0.0.1";` as the default; delete `const API_PORT = 5227;`.
2. Add to `ControllableParameters()`:
   `{ property: "apiHost", group: "device", label: "Yunari API host", description: "Leave blank for 127.0.0.1.", type: "textfield", default: "127.0.0.1" }`
   `{ property: "apiPort", group: "device", label: "Yunari API port", description: "HTTP port Yunari listens on.", type: "number", min: "1", max: "65535", step: "1", default: "5227" }`
3. Add helpers next to the other small helpers:

```js
function apiHostValue() {
	const host = typeof apiHost !== "undefined" ? String(apiHost || "").trim() : "";
	return host || LOOPBACK;
}
function apiPortValue() {
	const port = Number(typeof apiPort !== "undefined" ? apiPort : 5227);
	return Number.isFinite(port) && port >= 1 && port <= 65535 ? Math.floor(port) : 5227;
}
```

4. Replace every `LOOPBACK`/`API_PORT` use in `fetchDescriptor` (URL + log line), `YunariController` constructor fields, and `announceFromConfig` (`controller.ip`, `controller.hostname`, `controller.port`) with `apiHostValue()` / `apiPortValue()`.
5. `findController`'s adoption test: keep `candidate.name === "Yunari"`, drop the `candidate.ip === LOOPBACK` half.

- [ ] **Step 4: Run the checks**

Run: `node tools/yunari_bridge_selfcheck.mjs && node tools/release_check.mjs`
Expected: every existing check plus the three new ones print `ok`, then `release rules ok: 4 plugins`.

- [ ] **Step 5: Commit**

```bash
git add tools/yunari_bridge_selfcheck.mjs plugins/YunariBridge/YunariBridge.js
git commit -m "Yunari: make the API host and port configurable"
```

---

### Task 4: Release READMEs

**Files:**
- Create: `release/signalrgb-rainbow-music-led/README.md`
- Create: `release/signalrgb-jungle-leopard-l10/README.md`
- Create: `release/signalrgb-colorful-z590m/README.md`
- Create: `release/signalrgb-yunari/README.md`

**Interfaces:**
- Consumes: sanitized facts from the existing `plugins/*/README.md` (device IDs, settings, troubleshooting).
- Produces: four files that Task 5 copies verbatim into `dist/<repo>/README.md`. Each must contain the exact deep-link line:

```
[![Add To Installation](https://marketplace.signalrgb.com/resources/add-extension-256.png)](signalrgb://addon/install?url=https://github.com/peterng1618/<repo>)
```

- [ ] **Step 1: Write the four READMEs**

Each file, in this order, with these headings: `# <Device>` (title and badge line directly under it), a 2–3 sentence description of what the plugin controls, `![](<photo filename>)`, `## Requirements` (device model, SignalRGB tested version `2.5.86`, vendor-app rule), `## Installation` (click the badge **or** Settings → Add-ons → paste `https://github.com/peterng1618/<repo>`; restart SignalRGB; the per-device step), `## Settings` (markdown table: setting, meaning, default — taken from the plugin's `ControllableParameters()`), `## Troubleshooting` (sanitized bullets from `evidence/NOTES.md`), `## Support` ("Open an issue on this repository."), `## License` ("MIT — see `LICENSE`.").

Per-device content:

| Repo | Title | Device facts | Per-device install step |
| --- | --- | --- | --- |
| `signalrgb-rainbow-music-led` | Rainbow Music Led (WLED) | WLED strip, UDP realtime + HTTP fallback, `118` LEDs default, ring `45x16` default | Enter the strip IP in the device settings; blank means no traffic |
| `signalrgb-jungle-leopard-l10` | Jungle Leopard L10 ARGB Hub | CH340 serial `1A86:8042`, 10 ports, 60 LEDs/port cap, hub recovery steps | Close `Jungle Leopard Display.exe` |
| `signalrgb-colorful-z590m` | Colorful CVN Z590M GAMING FROZEN V20 | HID `2F4C:1000` interface `MI_02`, 139 LEDs, 12V RGB + 2x ARGB | Close iGameCenter / `iGame.LightingService` |
| `signalrgb-yunari` | Yunari | Yunari bridge, `127.0.0.1:5227` API, UDP `7788` default | Disable SignalRGB's own NZXT Kraken plugin; Yunari must be running |

No private IP, MAC, BSSID, user path, serial number or firmware-backup path may appear. Refer to the strip IP as "your strip IP".

- [ ] **Step 2: Check the READMEs**

Run: `grep -rniE '192\.168\.|C:\\Users|orca|<mac>|<serial>|<serial>' release/ ; grep -L 'signalrgb://addon/install?url=https://github.com/peterng1618/' release/*/README.md`
Expected: the first grep prints nothing; the second prints nothing (every README has a deep link). A README whose URL does not match its folder is caught by Task 5's build.

- [ ] **Step 3: Commit**

```bash
git add release
git commit -m "Add per-repo READMEs with install deep links"
```

---

### Task 5: Build script and release trees

**Files:**
- Create: `tools/build-releases.mjs`
- Create: `.gitignore`
- Output (not committed): `dist/<repo>/` x4

**Interfaces:**
- Consumes: `lintSanitization` from `tools/release_rules.mjs`; `release/<repo>/README.md` from Task 4; plugin `.js` files; root `LICENSE`.
- Produces: `dist/<repo>/` containing exactly `README.md`, `LICENSE`, `<Plugin>.js`, `<photo>`; each is a git repo on `main` with one commit unless `--no-git` is passed. Exit code 1 on any violation.

- [ ] **Step 1: Write the build script**

`tools/build-releases.mjs`:

```js
// Build the four public add-on repos from the dev tree.
// Run: node tools/build-releases.mjs [--no-git]
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { lintSanitization } from "./release_rules.mjs";

const REPOS = [
	{ repo: "signalrgb-rainbow-music-led", plugin: "plugins/RainbowMusicLedDirect/RainbowMusicLedDirect.js", photo: "plugins/RainbowMusicLedDirect/rainbow-music-led-monitor-backlight-led-bars.jpg" },
	{ repo: "signalrgb-jungle-leopard-l10", plugin: "plugins/JungleLeopardL10/JungleLeopardL10.js", photo: "plugins/JungleLeopardL10/jungle-leopard-l10-argb-hub.png" },
	{ repo: "signalrgb-colorful-z590m", plugin: "plugins/ColorfulZ590M/ColorfulZ590M.js", photo: "plugins/ColorfulZ590M/colorful-cvn-z590m-gaming-frozen-v20.png" },
	{ repo: "signalrgb-yunari", plugin: "plugins/YunariBridge/YunariBridge.js", photo: "plugins/YunariBridge/yunari.svg" },
];

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = !process.argv.includes("--no-git");
const copy = (from, to) => fs.copyFileSync(path.join(root, from), path.join(to));
let failures = [];

for (const entry of REPOS) {
	const out = path.join(root, "dist", entry.repo);
	fs.rmSync(out, { recursive: true, force: true });
	fs.mkdirSync(out, { recursive: true });

	const js = path.basename(entry.plugin);
	copy(entry.plugin, path.join(out, js));
	copy(entry.photo, path.join(out, path.basename(entry.photo)));
	copy("LICENSE", path.join(out, "LICENSE"));
	copy(`release/${entry.repo}/README.md`, path.join(out, "README.md"));

	const readme = fs.readFileSync(path.join(out, "README.md"), "utf8");
	const link = `signalrgb://addon/install?url=https://github.com/peterng1618/${entry.repo}`;
	if (!readme.includes(link)) failures.push(`${entry.repo}: README missing deep link ${link}`);

	for (const file of fs.readdirSync(out)) {
		if (!file.endsWith(".md") && !file.endsWith(".js") && file !== "LICENSE") continue;
		failures.push(...lintSanitization(`${entry.repo}/${file}`, fs.readFileSync(path.join(out, file), "utf8")));
	}

	const jsFiles = fs.readdirSync(out).filter(f => f.endsWith(".js"));
	if (jsFiles.length !== 1 || jsFiles[0] !== js) failures.push(`${entry.repo}: expected only ${js}, got ${jsFiles.join(",")}`);
	if (fs.readdirSync(out).length !== 4) failures.push(`${entry.repo}: expected 4 files, got ${fs.readdirSync(out).join(",")}`);

	if (git) {
		execFileSync("git", ["init", "-q", "-b", "main"], { cwd: out });
		execFileSync("git", ["add", "-A"], { cwd: out });
		execFileSync("git", ["commit", "-q", "-m", `Add ${js.replace(/\.js$/, "")} plugin for SignalRGB`], { cwd: out });
	}
	console.log(`built ${entry.repo} (${fs.readdirSync(out).length} files${git ? ", 1 commit" : ""})`);
}

if (failures.length) {
	for (const line of failures) console.log(`FAIL ${line}`);
	process.exit(1);
}
```

`.gitignore`: `dist/`

- [ ] **Step 2: Build with git and inspect**

Run: `node tools/build-releases.mjs`
Expected: four `built ...` lines; each `dist/<repo>` has 4 files and one commit (`git -C dist/signalrgb-yunari log --oneline` → one line).

- [ ] **Step 3: Prove the gate blocks a bad publish**

Run: `git -C dist/signalrgb-rainbow-music-led rev-parse HEAD && node -e "require('fs').appendFileSync('release/signalrgb-yunari/README.md','\nstrip at <strip-ip>\n')" && node tools/build-releases.mjs`
Expected: exit 1 with `FAIL signalrgb-yunari/README.md: private LAN address (<strip-ip>)`. Then revert: `git checkout -- release/signalrgb-yunari/README.md` and re-run the build to green.

- [ ] **Step 4: Commit**

```bash
git add .gitignore tools/build-releases.mjs
git commit -m "Add release build script producing four add-on repos"
```

---

### Task 6: Sanitize dev docs and final verification

**Files:**
- Modify: `plugins/RainbowMusicLedDirect/README.md`
- Modify: `plugins/JungleLeopardL10/README.md`
- Modify: `plugins/ColorfulZ590M/README.md`
- Modify: `plugins/YunariBridge/README.md`
- Modify: any remaining `plugins/*/evidence/NOTES.md` hits for the forbidden patterns

**Interfaces:**
- Consumes: everything above.
- Produces: dev tree with no private values outside `plans/` history notes that are explicitly labelled author-machine.

- [ ] **Step 1: Find every remaining hit**

Run: `grep -rniE '192\.168\.|C:\\Users\\|orca|<mac>|<serial>|<serial>' plugins/ | grep -v '^Binary'`
Expected: a list of lines in the four `README.md` files and `evidence/NOTES.md` files.

- [ ] **Step 2: Rewrite the hits**

- Private IP → "your strip IP" / `<strip-ip>`; keep the example shape (`http://<ip>:7778`).
- User/Orca paths → the generic folder (`%USERPROFILE%\Documents\WhirlwindFX\Plugins\`).
- MAC/BSSID/serials → removed, or replaced by "the device's MAC as reported by `/json/info`".
- Keep vendor paths, protocol constants, firmware hashes and the COM4 measurement note (generic port name).

- [ ] **Step 3: Full verification**

Run:

```
node tools/release_check.mjs
node tools/check_layout.js
node tools/frame-check.mjs
node tools/plugin_selfcheck.mjs
node tools/yunari_bridge_selfcheck.mjs
node tools/rml_selfcheck.mjs
node tools/build-releases.mjs
grep -rniE '192\.168\.|C:\\Users\\|orca|<mac>|<serial>|<serial>' plugins/ release/ | grep -v '^Binary'
```

Expected: every script prints its ok line and exits 0; the final grep prints nothing.

- [ ] **Step 4: Confirm release trees**

Run: `for d in dist/*/; do echo "$d"; ls "$d"; done`
Expected: each lists exactly `LICENSE`, `README.md`, `<Plugin>.js`, `<photo>`.

- [ ] **Step 5: Commit**

```bash
git add plugins
git commit -m "Sanitize dev docs for public release"
```

---

## Handoff

Pushing the four `dist/<repo>` trees to GitHub creates public repositories; that is a separate step requiring explicit approval. After approval:

```bash
for d in dist/*/; do repo=$(basename "$d"); gh repo create "peterng1618/$repo" --public --source="$d" --push; done
```
