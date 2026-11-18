# RML Multi-Strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Rainbow Music Led plugin support multiple WLED strips with MAC-based identity, per-controller settings, U-shape geometry, and a QML discovery panel.

**Architecture:** `RainbowMusicLedDirect.js` keeps one module instance per SignalRGB controller (one WLED strip). Discovery uses MAC as id, so DHCP moves update a controller in place. Geometry becomes three explicit generators (`ringPositions(w,h,reversed)`, `uPositions(w,h,reversed)`, strip rows) plus per-controller setting overrides via `service.getSetting(id,key)`. A sibling `.qml` provides the rescan UI; `tools/build-releases.mjs` ships it. The L10 ZIP work is explicitly out of scope.

**Tech Stack:** SignalRGB sandboxed JS plugin (ES modules), QML settings panel, Node assert-style selfchecks, no new dependencies.

**Spec:** `plans/06-rml-multistrip-design.md`

## Global Constraints

- Controller id: `"wled-" + MAC.toLowerCase().replace(/[^a-f0-9]/g, "")`.
- Shapes: `Ring` (closed 4-bar), `U` (3-bar hollow bottom), `Strip` (rows). `layoutStart` removed for Ring/U; retained for Strip.
- LED 0 is fixed on the strip's first physical LED. `layoutDirection` selects path direction only.
- Ring forward from viewer POV: LED 0 bottom-left, LED 1 up left side, top L→R, down right side, bottom R→L. Reversed: bottom row first.
- U count = `W + 2H - 2` for outer grid `W×H`; direction reverses the open path.
- Discovery: opt-in `/24`, 8 hosts per `Update()` tick, one sweep per load; accepts any WLED with a valid MAC.
- `service.getSetting(id, key)` with the global setting as fallback for per-controller overrides.
- Release tree for RML: exactly `README.md`, `LICENSE`, `RainbowMusicLedDirect.js`, `RainbowMusicLedDirect.qml`, one photo (5 files).
- No L10 ZIP work in this plan.

## Review Focus

- Two strips with different MACs: two controllers, distinct ids/IPs, no cross-talk — Task 3 test "two MACs produce two controllers".
- Same MAC at a new IP: one controller, IP updated, no duplicate — Task 3 test "DHCP move updates one controller".
- Per-controller geometry override: each strip's canvas differs — Task 4 test "per-controller override builds a distinct canvas".
- Ring LED 0 fixed and direction correct for forward/reverse — Task 2 tests in `tools/check_layout.js`.
- Scan accepts a non-118-LED, differently named WLED — Task 3 test "scan adopts any WLED with a MAC".

---

### Task 1: U shape and fixed-direction ring geometry

**Files:**
- Modify: `plugins/RainbowMusicLedDirect/RainbowMusicLedDirect.js:23-25,42-48,103-182`
- Modify: `tools/check_layout.js`

**Interfaces:**
- Produces: `uPositions(w: number, h: number, reversed?: boolean): number[][]`, `ringPositions(w: number, h: number, reversed?: boolean): number[][]`. Both return `[x,y]` arrays; `reversed` defaults to `false`.
- Consumes: nothing.

- [ ] **Step 1: Write failing geometry tests**

Rewrite `tools/check_layout.js` to import both generators from the plugin source (keep the existing regex-extract-and-eval pattern) and assert:

```
ringPositions(45,16,false): 118 unique, adjacent, closed; LED0 "0,15"; LED1 "0,14"
ringPositions(45,16,true):  118 unique, adjacent, closed; LED0 "0,15"; LED1 "1,15"
uPositions(45,16,false): 75 unique, adjacent, open; LED0 "0,15"; LED1 "0,14"
uPositions(45,16,true):  75 unique, adjacent, open; LED0 "0,15"; LED1 "1,15"
uPositions(45,16).filter(x==0).length == 16; .filter(y==0).length == 45; bottom row absent
```

Run `node tools/check_layout.js`; expect FAIL because `uPositions` doesn't exist and `ringPositions(w,h,true)` ignores the new argument.

- [ ] **Step 2: Implement generators in the plugin**

In `RainbowMusicLedDirect.js`:

- Replace `ringPositions(w,h)` body with a parameterised path: build forward once (left bottom→top, top L→R, right top→bottom, bottom R→L), return it reversed when `reversed===true`. No mirroring/corner transform in the generator.
- Add `uPositions(w,h,reversed)`: leg A `(0,h-1)…(0,0)`, top `(1,0)…(w-2,0)`, leg B `(w-1,0)…(w-1,h-1)`; reverse when `reversed===true`.
- In `ControllableParameters()` add `"U"` to `layoutShape` values; change `layoutStart` description to `"Strip only"`.

- [ ] **Step 3: Verify geometry green**

Run `node tools/check_layout.js && node tools/release_check.mjs`; expect `ring ok`/`geometry ok` summary and `release rules ok: 4 plugins`.

- [ ] **Step 4: Commit**

```bash
git add plugins/RainbowMusicLedDirect/RainbowMusicLedDirect.js tools/check_layout.js
git commit -m "RML: add U geometry and fixed-direction ring"
```

---

### Task 2: Per-controller settings resolution

**Files:**
- Modify: `plugins/RainbowMusicLedDirect/RainbowMusicLedDirect.js:32-108,184-189`
- Modify: `tools/rml_selfcheck.mjs`

**Interfaces:**
- Produces: module-internal `settingValue(key: string, fallback: any): any` — returns `service.getSetting(controller.id, key)` when a non-null value exists, else the global variable of that name, else `fallback`. Used by `controllerIp()`, `udpPortNumber()`, `desiredCount()`, and `buildLayout()`.
- Consumes: nothing.

- [ ] **Step 1: Write failing test**

In `tools/rml_selfcheck.mjs` add `getSetting` to the stub `service` (a per-id map), extend `load(globals, xhrResponse, settings)`, and append:

```
// per-controller override builds a distinct canvas
load({...base, ledCount:"8", layoutShape:"Strip"}, null,
     {"wled-aabb": {ledCount:"6", layoutShape:"Ring", layoutWidth:"3", layoutHeight:"3"}})
with globalThis.controller = {id:"wled-aabb"}; mod.Initialize();
assert device.setControllableLeds names.length === 8?? -> expect 8 for Ring 3x3 perimeter = 8.
```

Run `node tools/rml_selfcheck.mjs`; expect FAIL: `names.length` is `8` from global Strip count but `setSize` uses global shape; specifically assert `setSize` equals `[3,3]` and fail with `[8,1]`.

- [ ] **Step 2: Implement `settingValue`**

Add helper near `controllerIp()`; use it in the four consumers. Keep the existing global-variable fallback semantics. `desiredCount()` must prefer per-controller `ledCount`, then global, then `controller.deviceledcount`, then `DEFAULT_LEDS`.

- [ ] **Step 3: Verify**

Run `node tools/rml_selfcheck.mjs && node tools/check_layout.js && node tools/release_check.mjs`; expect all ok.

- [ ] **Step 4: Commit**

```bash
git add plugins/RainbowMusicLedDirect/RainbowMusicLedDirect.js tools/rml_selfcheck.mjs
git commit -m "RML: per-controller setting overrides"
```

---

### Task 3: MAC identity, multi-controller discovery, and generic scan

**Files:**
- Modify: `plugins/RainbowMusicLedDirect/RainbowMusicLedDirect.js:402-507,526-606`
- Modify: `tools/rml_selfcheck.mjs`

**Interfaces:**
- Produces: `controllerIdForMac(mac: string): string`, `WledController` with `id` from MAC, `DiscoveryService.forceDiscover(targetIp?)` accepting an empty/alternate target, and scan acceptance of any `/json/info` with a valid MAC.
- Consumes: `settingValue` from Task 2.

- [ ] **Step 1: Write failing tests**

Extend `tools/rml_selfcheck.mjs` with:

```
1. two WLED devices (different MACs, IPs) found by forceDiscover -> service.controllers.length === 2, ids "wled-aabb..." and "wled-ccdd...", IPs distinct
2. same MAC at a new IP -> forceDiscover new IP -> controllers.length unchanged, controller.ip === new IP
3. scan accepts a WLED named "Other WLED" with 60 LEDs and a valid MAC -> controller added
4. typing a new IP calls mod.onipChanged() -> probe -> controller id from MAC, announced
```

Run `node tools/rml_selfcheck.mjs`; expect FAIL on 1–3 (ids always `rainbow-music-led`, `probeDevice` rejects other devices).

- [ ] **Step 2: Implement identity and discovery**

In the plugin:

- Add `controllerIdForMac(mac)`; `WledController` constructor uses it and saves `mac` and per-controller override keys in `announce()` via `service.saveSetting(this.id, key, value)` — only when a non-default override is active.
- `findController(mac)` looks up `service.getController(controllerIdForMac(mac))` first, then legacy `rainbow-music-led` by name for migration.
- `probeDevice` no longer rejects a device by name/LED count; requires a MAC from `/json/info`, else skip and log.
- `DiscoveryService.Initialize()` announces cached controllers from saved settings; `Update()` probes configured IP and/or advances scan; `forceDiscover(ip?)` probes the given IP, or starts a sweep when called with empty/undefined.
- Keep the one-sweep-per-load rule; reset it in `onscanSubnetChanged()`.

- [ ] **Step 3: Verify**

Run `node tools/rml_selfcheck.mjs && node tools/release_check.mjs`; expect all checks ok.

- [ ] **Step 4: Commit**

```bash
git add plugins/RainbowMusicLedDirect/RainbowMusicLedDirect.js tools/rml_selfcheck.mjs
git commit -m "RML: MAC identity and multi-strip discovery"
```

---

### Task 4: QML discovery panel and build packaging

**Files:**
- Create: `plugins/RainbowMusicLedDirect/RainbowMusicLedDirect.qml`
- Modify: `tools/build-releases.mjs`
- Modify: `release/signalrgb-rainbow-music-led/README.md`
- Modify: `plugins/RainbowMusicLedDirect/README.md`

**Interfaces:**
- Consumes: `DiscoveryService.forceDiscover(targetIp?)` from Task 3.
- Produces: RML release tree with 5 files; QML calls `discovery.forceDiscover(ipField.text)` and `discovery.forceDiscover("")`.

- [ ] **Step 1: Write failing build test**

Add to `tools/rml_selfcheck.mjs` (or a new small Node check in the same file) assertions that `plugins/RainbowMusicLedDirect/RainbowMusicLedDirect.qml` exists, contains `discovery.forceDiscover` twice, and that `dist/signalrgb-rainbow-music-led/` after build contains exactly `README.md`, `LICENSE`, `RainbowMusicLedDirect.js`, `RainbowMusicLedDirect.qml`, and one photo. Run `node tools/rml_selfcheck.mjs`; expect FAIL (no QML file).

- [ ] **Step 2: Add QML and packaging**

Create a minimal QML panel modeled on the built-in WLED panel: IPv4-validated `TextField`, "Add strip" ToolButton calling `discovery.forceDiscover(ipField.text)`, "Scan LAN" ToolButton calling `discovery.forceDiscover("")`. Use `theme.primarytextcolor`, Poppins font, no images.

Modify `tools/build-releases.mjs`: add `qml` to the RML entry, copy it to `dist/<repo>/`, assert RML file count 5 and exactly one `.qml`, keep all other repos at 4 files.

- [ ] **Step 3: Update READMEs**

Release README: replace the IP install step with "open the Discover strip panel → enter IP or Scan LAN". Add `U` to layout docs; document one device per strip, MAC identity, DHCP survival, and the per-controller overrides. Dev README: same additions, plus note QML panel.

- [ ] **Step 4: Verify**

Run `node tools/rml_selfcheck.mjs && node tools/build-releases.mjs && node tools/release_check.mjs`; expect ok lines and 4 built repos.

- [ ] **Step 5: Commit**

```bash
git add plugins/RainbowMusicLedDirect tools/build-releases.mjs release/signalrgb-rainbow-music-led/README.md
git commit -m "RML: QML discovery panel and release packaging"
```

---

### Task 5: Local installation and final verification

**Files:**
- Installed copies: `%USERPROFILE%\Documents\WhirlwindFX\Plugins\RainbowMusicLedDirect\` (outside repo).

**Interfaces:**
- Consumes: all above.
- Produces: installed RML plugin matches source byte-for-byte.

- [ ] **Step 1: Run full suite**

```
node tools/release_check.mjs
node tools/check_layout.js
node tools/frame-check.mjs
node tools/plugin_selfcheck.mjs
node tools/yunari_bridge_selfcheck.mjs
node tools/rml_selfcheck.mjs
node tools/build-releases.mjs
```

All exit 0.

- [ ] **Step 2: Install locally**

Copy `plugins/RainbowMusicLedDirect/RainbowMusicLedDirect.js` and `.qml` into the installed folder. Verify hashes match.

- [ ] **Step 3: Report**

Report that SignalRGB must be restarted; discovery actions are in the device settings panel.

- [ ] **Step 4: Commit any remaining doc changes**

```bash
git add -A && git commit -m "RML multi-strip: final verification"
```
