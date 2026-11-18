// Runnable portability check for RainbowMusicLedDirect. Run: node tools/rml_selfcheck.mjs
// Stubs device/service/udp/XMLHttpRequest; no hardware, no network.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";

const raw = fs.readFileSync(new URL("../plugins/RainbowMusicLedDirect/RainbowMusicLedDirect.js", import.meta.url), "utf8");

// Drive the plugin's 1 s log throttle deterministically.
let clockOffset = 0;
const realNow = Date.now;
Date.now = () => realNow() + clockOffset;
const advanceClock = ms => { clockOffset += ms; };
let failures = 0;
const check = (label, ok, detail = "") => {
	console.log(`${ok ? "ok  " : "FAIL"} ${label} ${ok ? "" : detail}`);
	if (!ok) failures++;
};

async function load(globals, xhrResponse, settings = {}, asyncXhr = false) {
	Object.assign(globalThis, globals);
	const logs = [], sends = [], urls = [];
	const sizes = [];
	globalThis.device = {
		setName() {}, addFeature() {}, setSize(size) { sizes.push(size); },
		setControllableLeds(names) { ledNames = names.slice(); }, SetLedLimit() {},
		log(m) { logs.push(String(m)); }, color: () => [0, 0, 0],
	};
	let ledNames = [];
	globalThis.service = {
		controllers: [], settings, saveSetting(id, key, value) { (this.settings[id] = this.settings[id] || {})[key] = value; },
		updateController() {}, announceController() {},
		getSetting(id, key) { const row = this.settings[id]; return row && row[key] !== undefined ? row[key] : null; },
		addController(c) { this.controllers.push(c); },
		getController(id) { return this.controllers.find(c => c.id === id); },
	};
	globalThis.udp = { send(host, port, packet) { sends.push({ host, port, len: packet.length }); } };
	class FakeXhr {
		open(method, url) { this.url = url; urls.push(url); }
		setRequestHeader() {}
		send() {
			const finish = () => {
				const response = globalThis.__xhrResponse && globalThis.__xhrResponse[this.url];
				this.readyState = 4;
				this.status = response ? 200 : 0;
				this.responseText = response ? JSON.stringify(response) : "";
				if (this.onreadystatechange) this.onreadystatechange();
			};
			if (asyncXhr) setTimeout(finish, 5);
			else finish();
		}
	}
	globalThis.__xhrResponse = xhrResponse || null;
	globalThis.XMLHttpRequest = FakeXhr;
	const file = path.join(os.tmpdir(), `rml-selfcheck-${process.pid}-${Math.random().toString(16).slice(2)}.mjs`);
	fs.writeFileSync(file, raw);
	const mod = await import(pathToFileURL(file).href);
	fs.unlinkSync(file);
	return { mod, logs, sends, urls, sizes, getNames: () => ledNames, service: globalThis.service };
}

const base = { LightingMode: "Canvas", forcedColor: "#ff0000", shutdownColor: "#000000", layoutModel: "Channels" };

// 1. no IP configured -> no network I/O at all
{
	const { mod, logs, sends, urls } = await load({ ...base });
	mod.Initialize();
	check("initialize makes no HTTP request", urls.length === 0, JSON.stringify(urls));
	const discovery = new mod.DiscoveryService();
	discovery.Initialize();
	discovery.Update();
	check("discovery probe skipped without IP", urls.length === 0, JSON.stringify(urls));
	for (let i = 0; i < 5; i++) {
		mod.Render();
		advanceClock(1100);
	}
	check("render sends no UDP without IP", sends.length === 0, JSON.stringify(sends));
	check("warns exactly once about the missing IP", logs.filter(l => /set Strip IP/.test(l)).length === 1, JSON.stringify(logs));
	check("no bogus HTTP failure log", !logs.some(l => /HTTP frame failed/.test(l)), JSON.stringify(logs));
}

// 2. configured IP -> that address is used everywhere
{
	const { mod, sends, urls } = await load({ ...base, ip: "10.0.0.9", ledCount: "8", layoutShape: "Strip", layoutWidth: "8", layoutHeight: "1" });
	mod.Initialize();
	check("initialize talks to the configured IP", urls.some(u => u.startsWith("http://10.0.0.9:")), JSON.stringify(urls));
	const discovery = new mod.DiscoveryService();
	discovery.Initialize();
	discovery.Update();
	check("discovery probes the configured IP", urls.some(u => u === "http://10.0.0.9/json/info"), JSON.stringify(urls));
	mod.Render();
	check("render sends UDP to the configured IP", sends.length > 0 && sends.every(s => s.host === "10.0.0.9"), JSON.stringify(sends));
}

// 3. opt-in subnet scan finds a renamed device, rejects a different WLED
{
	const found = { ip: "10.0.0.42", name: "Rainbow Music Led", mac: "aa:bb:cc:dd:ee:ff", leds: { count: 118 }, ver: "0.13.0-b3" };
	const cfg = { if: { sync: { port0: 7778 } } };
	const responses = {};
	for (let i = 1; i < 255; i++) responses[`http://10.0.0.${i}/json/info`] = i === 42 ? found : { name: "Other WLED", leds: { count: 12 }, mac: "" };
	responses["http://10.0.0.42/json/cfg"] = cfg;
	responses["http://10.0.0.9/json/info"] = { name: "Other WLED", leds: { count: 12 }, mac: "" };
	const { mod, urls, service, logs: scanLogs } = await load({ ...base, ip: "", lanIp: "10.0.0.157", scanSubnet: true }, responses);
	const discovery = new mod.DiscoveryService();
	discovery.Initialize();
	for (let i = 0; i < 35; i++) {
		advanceClock(16000);
		discovery.Update();
	}
	const controller = service.controllers.find(c => c.ip === "10.0.0.42");
	check("scan finds the WLED by name", controller && controller.ip === "10.0.0.42", JSON.stringify({ controllers: service.controllers.map(c => ({ ip: c.ip, id: c.id })), probes: urls.length, found42: urls.includes("http://10.0.0.42/json/info"), sample: urls.slice(0,5) }));
	check("scan adopts the device's realtime port", controller && controller.streamingPort === 7778, String(controller && controller.streamingPort));
	check("scan probes a bounded batch", urls.length <= 520, `probes: ${urls.length}`);
}

// 4. scan off -> no subnet traffic
{
	const { mod, urls } = await load({ ...base, ip: "", lanIp: "10.0.0.157", scanSubnet: false });
	const discovery = new mod.DiscoveryService();
	discovery.Initialize();
	for (let i = 0; i < 3; i++) {
		advanceClock(16000);
		discovery.Update();
	}
	check("scan off probes nothing", urls.length === 0, JSON.stringify(urls));
}

// 5. onipChanged re-announces immediately
{
	const { mod, service } = await load({ ...base, ip: "10.0.0.9" });
	mod.Initialize();
	if (typeof mod.onipChanged === "function") mod.onipChanged();
	check("onipChanged refreshes the announcement", service.controllers.some(c => c.ip === "10.0.0.9"), JSON.stringify(service.controllers.map(c => c.ip)));
}

// 6. per-controller override builds a distinct canvas
{
	const { mod, sizes, getNames } = await load(
		{ ...base, ip: "10.0.0.9", ledCount: "8", layoutShape: "Strip", controller: { id: "wled-aabb" } },
		null,
		{ "wled-aabb": { ledCount: "8", layoutShape: "Ring", layoutWidth: "3", layoutHeight: "3" } });
	mod.Initialize();
	check("per-controller override sets canvas size", sizes[sizes.length - 1] && sizes[sizes.length - 1].join(",") === "3,3", JSON.stringify(sizes));
	check("per-controller override sets LED count", getNames().length === 8, String(getNames().length));
}

// 7. two WLED devices -> two controllers with MAC-based ids
{
	const responses = {
		"http://10.0.0.10/json/info": { name: "Strip A", mac: "aa:bb:cc:dd:ee:01", leds: { count: 30 } },
		"http://10.0.0.11/json/info": { name: "Strip B", mac: "aa:bb:cc:dd:ee:02", leds: { count: 60 } },
	};
	const { mod, service } = await load({ ...base, ip: "" }, responses);
	const discovery = new mod.DiscoveryService();
	discovery.Initialize();
	discovery.forceDiscover("10.0.0.10");
	discovery.forceDiscover("10.0.0.11");
	check("two MACs produce two controllers", service.controllers.length === 2, JSON.stringify(service.controllers.map(c => ({ id: c.id, ip: c.ip }))));
	check("ids come from MAC", service.controllers.some(c => c.id === "wled-aabbccddee01") && service.controllers.some(c => c.id === "wled-aabbccddee02"), JSON.stringify(service.controllers.map(c => c.id)));
}

// 8. same MAC at a new IP -> one controller updated
{
	const responses = { "http://10.0.0.12/json/info": { name: "Strip A", mac: "aa:bb:cc:dd:ee:01", leds: { count: 30 } } };
	const { mod, service } = await load({ ...base, ip: "" }, responses, { "wled-aabbccddee01": { ip: "10.0.0.10" } });
	const discovery = new mod.DiscoveryService();
	discovery.Initialize();
	discovery.forceDiscover("10.0.0.12");
	check("DHCP move updates one controller", service.controllers.length === 1 && service.controllers[0].ip === "10.0.0.12", JSON.stringify(service.controllers.map(c => ({ id: c.id, ip: c.ip }))));
}

// 9. scan adopts any WLED with a MAC
{
	const responses = {
		"http://10.0.0.157/json/info": { name: "Other WLED", mac: "11:22:33:44:55:66", leds: { count: 60 } },
	};
	const { mod, service } = await load({ ...base, ip: "", lanIp: "10.0.0.157", scanSubnet: true }, responses);
	const discovery = new mod.DiscoveryService();
	discovery.Initialize();
	for (let i = 0; i < 35; i++) {
		advanceClock(16000);
		discovery.Update();
	}
	check("scan adopts any WLED with a MAC", service.controllers.some(c => c.id === "wled-112233445566"), JSON.stringify(service.controllers.map(c => c.id)));
}

// 10. IP edit re-probes and adopts the MAC id
{
	const responses = { "http://10.0.0.20/json/info": { name: "Strip C", mac: "aa:bb:cc:dd:ee:03", leds: { count: 20 } } };
	const { mod, service } = await load({ ...base, ip: "10.0.0.20" }, responses, { "rainbow-music-led": { ip: "10.0.0.20" } });
	service.controllers.push({ id: "wled-", ip: "10.0.0.20", name: "Rainbow Music Led", announced: true });
	mod.Initialize();
	mod.onipChanged();
	check("IP edit adopts MAC id", service.controllers.some(c => c.id === "wled-aabbccddee03"), JSON.stringify(service.controllers.map(c => c.id)));
}

// 11. QML discovery panel exists and is shipped in the release
{
	const qmlPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../plugins/RainbowMusicLedDirect/RainbowMusicLedDirect.qml");
	const qml = fs.existsSync(qmlPath) ? fs.readFileSync(qmlPath, "utf8") : "";
	check("QML panel exists", !!qml, qmlPath);
	check("QML panel has two discovery actions", (qml.match(/discovery\.forceDiscover/g) || []).length >= 2, qml.slice(0, 200));
	check("QML Scan LAN passes the entered LAN base", /forceDiscover\(ipField\.text\)/.test(qml) && /text: "Scan LAN"/.test(qml), qml.slice(-400));
	check("QML has no edit-triggered probe", !/onEditingFinished/.test(qml), "onEditingFinished still present");
	check("QML exposes bar count buttons", /setBarCount\(3\)/.test(qml) && /setBarCount\(4\)/.test(qml), qml.slice(0, 500));
	check("QML exposes direction buttons", (qml.match(/setStartDirection/g) || []).length >= 2, qml.slice(0, 500));
}

// 12. async XHR: a scan tick probes all 8 hosts, not just the first
{
	const responses = {};
	for (let i = 1; i <= 8; i++) responses[`http://10.0.0.${i}/json/info`] = { name: "WLED", mac: `00:00:00:00:00:0${i}`, leds: { count: 10 } };
	const { mod, urls } = await load({ ...base, ip: "", lanIp: "10.0.0.157", scanSubnet: true }, responses, {}, true);
	const discovery = new mod.DiscoveryService();
	discovery.Initialize();
	discovery.forceDiscover("");
	await new Promise(r => setTimeout(r, 40));
	const probes = urls.filter(u => u.endsWith("/json/info"));
	check("async scan probes all 8 hosts", probes.length === 8, `probes: ${probes.length}`);
}

// 13. DHCP move persists the new IP for the renderer
{
	const responses = { "http://10.0.0.12/json/info": { name: "Strip A", mac: "aa:bb:cc:dd:ee:01", leds: { count: 30 } } };
	const settings = { "wled-aabbccddee01": { ip: "10.0.0.10", udpPort: 7778 } };
	const { mod, service, sends } = await load({ ...base, ip: "", controller: { id: "wled-aabbccddee01", ip: "10.0.0.10" } }, responses, settings);
	const discovery = new mod.DiscoveryService();
	discovery.Initialize();
	discovery.forceDiscover("10.0.0.12");
	check("DHCP move saves the new IP", settings["wled-aabbccddee01"].ip === "10.0.0.12", JSON.stringify(settings));
	mod.Initialize();
	mod.Render();
	check("DHCP move streams to the new IP", sends.length > 0 && sends.every(s => s.host === "10.0.0.12"), JSON.stringify(sends));
}

// 14. empty IP edit does not open a request
{
	const { mod, urls } = await load({ ...base, ip: "", controller: undefined });
	mod.Initialize();
	urls.length = 0;
	mod.onipChanged();
	check("empty IP edit makes no request", urls.length === 0, JSON.stringify(urls));
}

// 15. three-octet input to forceDiscover is a scan base (no cached controller)
{
	const responses = { "http://10.0.0.42/json/info": { name: "WLED", mac: "00:11:22:33:44:55", leds: { count: 60 } } };
	const { mod, service, urls } = await load({ ...base, ip: "" }, responses);
	const discovery = new mod.DiscoveryService();
	discovery.Initialize();
	discovery.forceDiscover("10.0.0");
	for (let i = 0; i < 6; i++) { advanceClock(16000); discovery.Update(); }
	const controller = service.controllers.find(c => c.id === "wled-001122334455");
	check("3-octet input starts a scan", controller && controller.ip === "10.0.0.42", JSON.stringify({ urls: urls.slice(0, 3), count: urls.length }));
}

// 16. every network plugin that appears in third-party services ships a QML UI
{
	const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "plugins");
	for (const name of ["RainbowMusicLedDirect", "YunariBridge"]) {
		const qml = path.join(dir, name, name + ".qml");
		check(name + " has a QML interface", fs.existsSync(qml), qml);
	}
}

// 17. Entering a strip IP in the discovery field needs no separate Add press
{
	const responses = { "http://10.0.0.42/json/info": { name: "WLED", mac: "00:11:22:33:44:66", leds: { count: 60 } } };
	const { mod, service } = await load({ ...base, ip: "" }, responses);
	const discovery = new mod.DiscoveryService();
	discovery.Initialize();
	discovery.forceDiscover("10.0.0.42");
	check("discovery field probes a full IP immediately", service.controllers.some(c => c.id === "wled-001122334466"), JSON.stringify(service.controllers.map(c => c.id)));
}


// 18. discovery prefix works without globalThis (SignalRGB sandbox)
{
	const sandboxGlobal = globalThis;
	const responses = { "http://10.0.0.43/json/info": { name: "WLED", mac: "00:11:22:33:44:77", leds: { count: 60 } } };
	const { mod, service } = await load({ ...base, ip: "", lanIp: "" }, responses);
	discoveryNoGlobal(mod, sandboxGlobal, responses, service);
}

function discoveryNoGlobal(mod, sandboxGlobal, responses, service) {
	// Re-import the same source with a sandbox that shadows globalThis as undefined.
	const file = path.join(os.tmpdir(), `rml-noglobal-${process.pid}-${Math.random().toString(16).slice(2)}.mjs`);
	fs.writeFileSync(file, raw);
	// Static check instead of a second import: no direct globalThis reference may
	// remain in the runtime path used by forceDiscover.
	const hasBareGlobalThis = /globalThis\.lanIp/.test(raw);
	const hasUndeclaredAssign = /^\s*lanIp = /m.test(raw) && !/let lanIp/.test(raw);
	check("forceDiscover avoids bare globalThis", !hasBareGlobalThis, "globalThis.lanIp still present");
	check("forceDiscover avoids undeclared global assignment", !hasUndeclaredAssign, "lanIp assigned without declaration");
	fs.unlinkSync(file);
	void mod; void sandboxGlobal; void responses; void service;
}

// 19. repeated discovery Initialize must not announce duplicate controllers
{
	const responses = { "http://10.0.0.44/json/info": { name: "WLED", mac: "00:11:22:33:44:88", leds: { count: 60 } } };
	const settings = { "wled-001122334488": { ip: "10.0.0.44" } };
	const cached = { id: "wled-001122334488", ip: "10.0.0.44", name: "Rainbow Music Led", announced: true };
	const globals = { ...base, ip: "", controller: cached };
	const { mod, service } = await load(globals, responses, settings);
	service.controllers.push(cached);
	const first = new mod.DiscoveryService();
	first.Initialize();
	const second = new mod.DiscoveryService();
	second.Initialize();
	check("repeated Initialize does not duplicate controllers", service.controllers.length === 1, JSON.stringify(service.controllers.map(c => ({ id: c.id, ip: c.ip }))));
}

// 20. full-IP entry also seeds a fallback scan of that subnet
{
	const responses = {
		"http://10.0.0.44/json/info": { name: "WLED", mac: "00:11:22:33:44:99", leds: { count: 60 } },
	};
	const { mod, service, urls } = await load({ ...base, ip: "" }, responses);
	const discovery = new mod.DiscoveryService();
	discovery.Initialize();
	discovery.forceDiscover("10.0.0.44");
	for (let i = 0; i < 8; i++) {
		advanceClock(16000);
		discovery.forceDiscover("");
		discovery.Update();
	}
	check("IP-seeded LAN prefix drives a scan", urls.some(u => u === "http://10.0.0.1/json/info"), JSON.stringify({ first: urls.slice(0, 4), count: urls.length }));
	check("full IP probe succeeds", service.controllers.some(c => c.id === "wled-001122334499"), JSON.stringify(service.controllers.map(c => c.id)));
}

// 21. repeated forceDiscover of the same IP must not add duplicate controllers
{
	const responses = { "http://10.0.0.45/json/info": { name: "WLED", mac: "00:11:22:33:44:aa", leds: { count: 60 } } };
	const { mod, service } = await load({ ...base, ip: "" }, responses);
	const discovery = new mod.DiscoveryService();
	discovery.Initialize();
	discovery.forceDiscover("10.0.0.45");
	discovery.forceDiscover("10.0.0.45");
	discovery.forceDiscover("10.0.0.45");
	check("repeated Add strip stays one controller", service.controllers.length === 1, JSON.stringify(service.controllers.map(c => c.id)));
}

// 22. duplicate MAC probes stay one device even if service.getController fails
{
	const responses = { "http://10.0.0.46/json/info": { name: "WLED", mac: "00:11:22:33:44:bb", leds: { count: 60 } } };
	const { mod, service } = await load({ ...base, ip: "" }, responses);
	service.getController = function() { return undefined; };
	const discovery = new mod.DiscoveryService();
	discovery.Initialize();
	discovery.forceDiscover("10.0.0.46");
	discovery.forceDiscover("10.0.0.46");
	discovery.forceDiscover("10.0.0.46");
	check("MAC probe dedupe without service.getController", service.controllers.filter(c => c.id === "wled-0011223344bb").length === 1, JSON.stringify(service.controllers.map(c => c.id)));
}

if (failures) process.exit(1);
console.log("rainbow-music-led portability ok");

// 23. discovery-panel shape and direction actions persist per-controller settings
{
	const responses = { "http://10.0.0.47/json/info": { name: "WLED", mac: "00:11:22:33:44:cc", leds: { count: 118 } } };
	const settings = {};
	const { mod, service, sizes } = await load({ ...base, ip: "" }, responses, settings);
	const discovery = new mod.DiscoveryService();
	discovery.Initialize();
	discovery.forceDiscover("10.0.0.47");
	discovery.setBarCount(3);
	discovery.setStartDirection("Counter-Clockwise");
	check("setBarCount persists U shape", settings["wled-0011223344cc"].layoutShape === "U", JSON.stringify(settings));
	check("setStartDirection persists direction", settings["wled-0011223344cc"].layoutDirection === "Counter-Clockwise", JSON.stringify(settings));
	check("setBarCount rebuilds canvas", sizes.length > 0, JSON.stringify(sizes));
}
