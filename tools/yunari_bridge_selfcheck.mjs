/*
 * Runnable self-check for the Yunari bridge plugin.
 * Run: node tools/yunari_bridge_selfcheck.mjs
 *
 * Stubs the SignalRGB device/service/udp globals and XMLHttpRequest; no
 * hardware, no SignalRGB process, no network. Asserts the YRGB datagram, the
 * 30 Hz + unchanged-payload skip, ring/strip geometry, subdevice/channel
 * naming, descriptor refresh behaviour, and the no-throw render path.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const sourcePath = new URL("../plugins/YunariBridge/YunariBridge.js", import.meta.url);
const raw = fs.readFileSync(sourcePath, "utf8");

let failures = 0;

function check(label, condition, detail = "") {
	if (condition) {
		console.log(`ok   ${label}`);
	} else {
		failures++;
		console.log(`FAIL ${label} ${detail}`);
	}
}

// The plugin throttles at 30 Hz; tests drive Render faster than that.
let clockOffset = 0;
const realNow = Date.now;
Date.now = () => realNow() + clockOffset;
const advanceClock = ms => { clockOffset += ms; };

function ringPositions(width, height) {
	const pts = [];
	for (let k = 0; k < height; k++) pts.push([0, height - 1 - k]);
	for (let x = 1; x <= width - 2; x++) pts.push([x, 0]);
	for (let y = 0; y < height; y++) pts.push([width - 1, y]);
	for (let x = width - 2; x >= 1; x--) pts.push([x, height - 1]);
	return pts;
}

const FIXTURE = {
	hub: { name: "Yunari", vendor: "Yunari" },
	devices: [
		{
			id: "kraken-z",
			kind: "kraken",
			name: "NZXT Kraken Z",
			lighting: {
				ledCount: 40,
				udpPort: 7788,
				channels: [{ name: "Kraken Z", leds: 40 }],
				layout: { shape: "ring", width: 11, height: 11 },
			},
			controls: { pump: true, fans: true, telemetry: true },
			display: { kind: "panel", width: 320, height: 320 },
		},
		{ id: "lcd-only", kind: "display", name: "LCD only", lighting: null },
		{
			id: "strip-1",
			kind: "strip",
			name: "LED Strip",
			lighting: {
				ledCount: 8,
				udpPort: 7789,
				channels: [{ name: "Strip", leds: 8 }],
				layout: { shape: "strip", width: 4, height: 2 },
			},
		},
	],
};

const FIXTURE_2 = {
	hub: { name: "Yunari", vendor: "Yunari" },
	devices: [
		{
			id: "kraken-z",
			kind: "kraken",
			name: "NZXT Kraken Z",
			lighting: {
				ledCount: 24,
				udpPort: 7788,
				channels: [{ name: "Kraken Z", leds: 24 }],
				layout: { shape: "ring", width: 7, height: 7 },
			},
		},
	],
};

async function load(globals, xhrResponse = null) {
	for (const [key, value] of Object.entries(globals)) globalThis[key] = value;

	globalThis.__xhrResponse = xhrResponse;

	const state = {
		subdevices: new Map(),
		channels: new Map(),
		created: 0,
		removed: 0,
		ledLimit: 0,
		controllableLeds: null,
	};

	globalThis.device = {
		setName() {},
		addFeature() {},
		SetLedLimit(value) { state.ledLimit = value; },
		setSize() {},
		setControllableLeds(names, positions) { state.controllableLeds = [names, positions]; },
		addChannel(name, count) { state.channels.set(name, count); },
		removeChannel(name) { state.channels.delete(name); },
		getChannelNames() { return [...state.channels.keys()]; },
		channel(name) {
			return {
				LedCount: () => state.channels.get(name),
				ledCount: state.channels.get(name),
				getColors: () => {
					const out = [];
					for (let i = 0; i < state.channels.get(name); i++) out.push(i + 1, 1, 2);
					return out;
				},
			};
		},
		createSubdevice(id) { state.created++; state.subdevices.set(id, {}); },
		removeSubdevice(id) { state.removed++; state.subdevices.delete(id); },
		getCurrentSubdevices() { return [...state.subdevices.keys()]; },
		setSubdeviceName(id, name) { const s = state.subdevices.get(id); if (s) s.name = name; },
		setSubdeviceImage() {},
		setSubdeviceSize(id, width, height) { const s = state.subdevices.get(id); if (s) s.size = [width, height]; },
		setSubdeviceLeds(id, names, xs, ys) {
			const s = state.subdevices.get(id);
			if (!s) return;
			s.names = names;
			s.positions = Array.isArray(ys) ? xs.map((x, i) => [x, ys[i]]) : xs;
			s.ledArgs = [Array.isArray(xs), Array.isArray(ys)];
		},
		subdeviceColor(id, x, y) { return [x + 1, y + 2, id.length]; },
		createColorArray(hex, count) {
			const rgb = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
			return new Array(count).fill(rgb).flat();
		},
		getChannelPulseColor() { return "#ff0000"; },
		log(message) { logs.push(String(message)); },
	};

	const logs = [];
	const sends = [];
	const urls = [];
	globalThis.__udp = { send(host, port, packet) { sends.push({ host, port, packet: Array.from(packet) }); } };
	globalThis.udp = globalThis.__udp;

	class FakeXhr {
		open(method, url) { this.method = method; this.url = url; this.readyState = 0; urls.push(url); }
		send() {
			const response = globalThis.__xhrResponse;
			if (response === null || response === undefined) {
				this.status = 0;
				this.responseText = "";
			} else {
				this.status = 200;
				this.responseText = typeof response === "string" ? response : JSON.stringify(response);
			}
			this.readyState = 4;
			if (this.onreadystatechange) this.onreadystatechange();
		}
	}
	globalThis.XMLHttpRequest = FakeXhr;

	const file = path.join(os.tmpdir(), `yunari-selfcheck-${process.pid}-${Math.random().toString(16).slice(2)}.mjs`);
	fs.writeFileSync(file, raw);
	const mod = await import(pathToFileURL(file).href);
	fs.unlinkSync(file);

	return { mod, state, logs, sends, urls };
}

const baseGlobals = {
	LightingMode: "Canvas",
	forcedColor: "#ff0000",
	shutdownColor: "#000000",
	layoutModel: "Subdevices",
	devices: "kraken-z:40:ring:11:11",
};

// 1. fallback descriptor -> one ring subdevice and a correct YRGB datagram
{
	const { mod, state, logs, sends } = await load({ ...baseGlobals });
	mod.Initialize();
	check("fallback creates one subdevice", state.subdevices.size === 1, JSON.stringify([...state.subdevices]));
	check("subdevice id is stable", state.subdevices.has("yunari:kraken-z"));
	const ring = state.subdevices.get("yunari:kraken-z");
	check("subdevice name from fallback", ring.name === "Kraken Z", ring.name);
	check("40-LED ring is 11x11", ring.size.join(",") === "11,11", ring.size.join(","));
	check("ring has 40 LEDs", ring.positions.length === 40, String(ring.positions.length));
	check("ring positions are unique", new Set(ring.positions.map(p => p.join(","))).size === 40);
	check("ring positions are the perimeter", ring.positions.every(p => p[0] === 0 || p[0] === 10 || p[1] === 0 || p[1] === 10));
	check("ring names start with the channel name", ring.names[0] === "Kraken Z 1" && ring.names.length === 40, ring.names.slice(0, 2).join(","));

	mod.Render();
	check("one datagram per lighting device", sends.length === 1, String(sends.length));
	const { host, port, packet } = sends[0];
	check("UDP goes to loopback and the descriptor port", host === "127.0.0.1" && port === 7788, `${host}:${port}`);
	check("datagram magic is YRGB", packet.slice(0, 4).join(",") === "89,82,71,66", packet.slice(0, 4).join(","));
	check("datagram version is 1", packet[4] === 1, String(packet[4]));
	check("datagram device index is 0", packet[5] === 0, String(packet[5]));
	check("datagram LED count is uint16 LE 40", packet[6] === 40 && packet[7] === 0, `${packet[6]},${packet[7]}`);
	check("datagram length is 8 + 3*N", packet.length === 8 + 40 * 3, String(packet.length));
	check("first LED samples the ring's first position", packet.slice(8, 11).join(",") === "1,12,15", packet.slice(8, 11).join(","));
	check("descriptor failure logged once", logs.filter(l => l.includes("Yunari unreachable")).length === 1, logs.filter(l => l.includes("unreachable")).join("|"));
}

// 2. 30 Hz cap and unchanged-payload skip
{
	const { mod, sends } = await load({ ...baseGlobals });
	mod.Initialize();
	mod.Render();
	mod.Render();
	mod.Render();
	check("rapid Renders send one frame", sends.length === 1, String(sends.length));

	advanceClock(100);
	mod.Render();
	check("identical payload is skipped after the interval", sends.length === 1, String(sends.length));

	globalThis.LightingMode = "Forced";
	globalThis.forcedColor = "#102030";
	advanceClock(100);
	mod.Render();
	check("changed forced colour opens the throttle", sends.length === 2, String(sends.length));
	check("forced colour fills every LED", sends[1].packet.slice(8, 11).join(",") === "16,32,48", sends[1].packet.slice(8, 11).join(",") + "/" + sends[1].packet.slice(8 + 39 * 3, 8 + 40 * 3).join(","));

	advanceClock(100);
	mod.Render();
	check("identical forced frame is skipped", sends.length === 2, String(sends.length));
}

// 2b. the unchanged-frame skip compares every byte. A change on one LED must
// still send; a sparse sample hash (every 16th byte) aliases it away and turns
// a 30 Hz stream into visible steps.
{
	const { mod, sends } = await load({ ...baseGlobals });
	// fallback ring position 4 is [0,7]; every other LED is a fixed colour
	let led3 = [10, 10, 10];
	globalThis.device.subdeviceColor = (id, x, y) => (x === 0 && y === 7 ? led3 : [10, 10, 10]);
	mod.Initialize();
	mod.Render();
	advanceClock(40);
	led3 = [10, 10, 200];
	mod.Render();
	check("a one-LED change is not skipped as unchanged", sends.length === 2, String(sends.length));
}

// 3. a mismatched ring cannot be a ring (4x4 is 12 LEDs, not 40), so it is
// drawn as a strip; the shipped fallback default is the Kraken's 40-LED strip.
{
	const { mod, state, logs } = await load({ ...baseGlobals, devices: "dev-a:40:ring:4:4" });
	mod.Initialize();
	const sub = state.subdevices.get("yunari:dev-a");
	check("4x4 ring cannot hold 40 LEDs", sub.size.join(",") === "40,1", sub.size.join(","));
	check("strip fallback is row-major", sub.positions[0].join(",") === "0,0" && sub.positions[39].join(",") === "39,0", sub.positions[39].join(","));
	check("setSubdeviceLeds gets separate x and y arrays", sub.ledArgs[0] === true && sub.ledArgs[1] === true, JSON.stringify(sub.ledArgs));
	check("ring mismatch is logged", logs.some(l => /perimeter LEDs, not 40/.test(l)), logs.join("\n"));
	check("shipped fallback default is three fan rings", mod.ControllableParameters().find(p => p.property === "devices").default === "kraken-z:40:rings:3:3:3");
	const shipped = mod.ControllableParameters().find(p => p.property === "layoutModel").default;
	check("shipped layout model defaults to subdevices", shipped === "Subdevices", shipped);
}

// 3b. three 8-LED fan rings side by side: 24 positions on an 11x3 canvas, the
// controller's remaining 16 LEDs carry no position (so they stay black).
{
	const { mod, state } = await load({ ...baseGlobals, devices: "kraken-z:40:rings:3:3:3" });
	mod.Initialize();
	const sub = state.subdevices.get("yunari:kraken-z");
	check("three fan rings fit on an 11x3 canvas", sub.size.join(",") === "11,3", sub.size.join(","));
	check("only the 24 fan LEDs are placed", sub.positions.length === 24, String(sub.positions.length));
	check("second ring starts at x=4", sub.positions[8].join(",") === "4,2", sub.positions[8].join(","));
	check("third ring starts at x=8", sub.positions[16].join(",") === "8,2", sub.positions[16].join(","));
}

// 4. strip geometry
{
	const { mod, state } = await load({ ...baseGlobals, devices: "strip-a:8:strip:4:2" });
	mod.Initialize();
	const sub = state.subdevices.get("yunari:strip-a");
	check("strip size is width x height", sub.size.join(",") === "4,2", sub.size.join(","));
	check("strip positions are row-major", sub.positions.map(p => p.join(",")).join(";") === "0,0;1,0;2,0;3,0;0,1;1,1;2,1;3,1", sub.positions.map(p => p.join(",")).join(";"));
	check("strip names match the LED count", sub.names.length === 8, String(sub.names.length));
}

// 5. HTTP descriptor: names, geometry, UDP device index, no subdevice for unlit devices
{
	const { mod, state, sends } = await load({ ...baseGlobals }, FIXTURE);
	mod.Initialize();
	check("descriptor replaces fallback", state.subdevices.size === 2, JSON.stringify([...state.subdevices.keys()]));
	check("descriptor subdevice ids", state.subdevices.has("yunari:kraken-z") && state.subdevices.has("yunari:strip-1"));
	check("descriptor names", state.subdevices.get("yunari:kraken-z").name === "NZXT Kraken Z" && state.subdevices.get("yunari:strip-1").name === "LED Strip");
	check("descriptor ring geometry", state.subdevices.get("yunari:kraken-z").size.join(",") === "11,11");
	check("descriptor strip geometry", state.subdevices.get("yunari:strip-1").size.join(",") === "4,2");
	check("unlit device creates no subdevice", !state.subdevices.has("yunari:lcd-only"));

	mod.Render();
	check("one datagram per lit device", sends.length === 2, String(sends.length));
	const kraken = sends.find(s => s.packet[5] === 0);
	const strip = sends.find(s => s.packet[5] === 2);
	check("kraken keeps UDP index 0 and port 7788", Boolean(kraken) && kraken.port === 7788, kraken && String(kraken.port));
	check("unlit device still consumes UDP index 1", Boolean(strip) && strip.port === 7789, strip && String(strip.port));
	check("strip datagram count and length", strip.packet[6] === 8 && strip.packet.length === 8 + 8 * 3, String(strip.packet.length));
}

// 6. descriptor refresh recreates only when it really changed
{
	const { mod, state } = await load({ ...baseGlobals }, FIXTURE);
	mod.Initialize();
	const createdAfterInit = state.created;
	const removedAfterInit = state.removed;
	advanceClock(15000);
	mod.Render();
	check("unchanged descriptor does not recreate", state.created === createdAfterInit && state.removed === removedAfterInit, `created=${state.created} removed=${state.removed}`);

	globalThis.__xhrResponse = FIXTURE_2;
	advanceClock(15000);
	mod.Render();
	const ring = state.subdevices.get("yunari:kraken-z");
	// Same uid: the subdevice must be updated in place, never destroyed. Only
	// the ids that disappeared may be removed.
	check("changed descriptor keeps the same subdevice", state.created === createdAfterInit && state.removed === 1, `created=${state.created} removed=${state.removed}`);
	check("changed descriptor updates geometry", ring && ring.size.join(",") === "7,7", ring && ring.size.join(","));
	check("descriptor refresh removed the unlit/strip devices", state.subdevices.size === 1, JSON.stringify([...state.subdevices.keys()]));
}

// 7. Channels fallback: descriptor channel names, merged datagram, live switch
{
	const { mod, state, sends } = await load({ ...baseGlobals, layoutModel: "Channels" }, FIXTURE);
	mod.Initialize();
	check("channels are named after descriptor channels", [...state.channels.keys()].join(",") === "Kraken Z,Strip", JSON.stringify([...state.channels]));
	check("channel LED counts come from the descriptor", state.channels.get("Kraken Z") === 40 && state.channels.get("Strip") === 8);
	check("SetLedLimit is the channel total", state.ledLimit === 48, String(state.ledLimit));
	check("no subdevices in channel mode", state.subdevices.size === 0);
	check("parent canvas is cleared in channel mode", state.controllableLeds && state.controllableLeds[0].length === 0 && state.controllableLeds[1].length === 0);

	mod.Render();
	check("channel mode sends one merged datagram per device", sends.length === 2, String(sends.length));
	const kraken = sends.find(s => s.packet[5] === 0);
	check("channel colours merge in channel order", kraken.packet.slice(8, 11).join(",") === "1,1,2", kraken.packet.slice(8, 11).join(","));

	globalThis.layoutModel = "Subdevices";
	mod.onlayoutModelChanged();
	check("model switch removes channels", state.channels.size === 0, JSON.stringify([...state.channels]));
	check("model switch creates subdevices", state.subdevices.size === 2, JSON.stringify([...state.subdevices.keys()]));
}

// 7b. createSubdevice failure falls back to channels in the same build
{
	const { mod, state, sends, logs } = await load({ ...baseGlobals }, FIXTURE);
	globalThis.device.createSubdevice = () => { throw new Error("subdevices unsupported"); };
	mod.Initialize();
	check("subdevice failure falls back to channels", state.subdevices.size === 0 && state.channels.size === 2, `subdevices=${state.subdevices.size} channels=${state.channels.size}`);
	check("fallback is logged", logs.some(l => l.includes("falling back to channels")), logs.join("\n"));
	mod.Render();
	const kraken = sends.find(s => s.packet[5] === 0);
	check("fallback still sends frames through channels", Boolean(kraken) && kraken.packet.slice(8, 11).join(",") === "1,1,2", kraken && kraken.packet.slice(8, 11).join(","));
}

// 8. Yunari/SignalRGB UDP absence never throws from Render
{
	const { mod, logs } = await load({ ...baseGlobals });
	globalThis.udp = undefined;
	mod.Initialize();
	let threw = false;
	try {
		mod.Render();
		mod.Render();
	} catch (e) {
		threw = true;
	}
	check("Render does not throw without udp", !threw);
	check("missing udp is logged once", logs.filter(l => l.includes("UDP transport unavailable")).length === 1, logs.join("\n"));
	globalThis.udp = globalThis.__udp;
}

// 9. shutdown writes shutdownColor, suspend writes black
{
	const { mod, sends } = await load({ ...baseGlobals, shutdownColor: "#112233" }, FIXTURE);
	mod.Initialize();
	mod.Render();
	sends.length = 0;
	mod.Shutdown(false);
	check("shutdown writes one frame per device", sends.length === 2, String(sends.length));
	check("shutdown uses shutdownColor", sends[0].packet.slice(8, 11).join(",") === "17,34,51", sends[0].packet.slice(8, 11).join(","));
	sends.length = 0;
	mod.Shutdown(true);
	check("suspend writes black", sends[0].packet.slice(8, 11).join(",") === "0,0,0", sends[0].packet.slice(8, 11).join(","));
}

// 10. a descriptor with no lighting devices never blanks the layout
{
	const { mod, state, logs } = await load({ ...baseGlobals });
	mod.Initialize();
	globalThis.__xhrResponse = { hub: { name: "Yunari" }, devices: [{ id: "lcd-only", kind: "display", name: "LCD only" }] };
	advanceClock(15000);
	mod.Render();
	check("zero-lighting descriptor keeps the previous layout", state.subdevices.size === 1, JSON.stringify([...state.subdevices.keys()]));
	check("zero-lighting descriptor is logged", logs.some(l => l.includes("no lighting devices")), logs.join("\n"));
}

// 11. API host/port come from settings, with a safe fallback
{
	const { mod, urls, sends } = await load({ ...baseGlobals, apiHost: "10.1.2.3", apiPort: "6000" }, FIXTURE);
	new mod.DiscoveryService().Initialize();
	check("custom apiHost/apiPort used", urls.every(u => u.startsWith("http://10.1.2.3:6000/")), JSON.stringify(urls));
	mod.Initialize();
	mod.Render();
	check("UDP frames follow apiHost", sends.length > 0 && sends.every(s => s.host === "10.1.2.3"), JSON.stringify(sends));
}
{
	const { mod, urls } = await load({ ...baseGlobals, apiHost: "  ", apiPort: "not-a-number" }, FIXTURE);
	new mod.DiscoveryService().Initialize();
	check("blank host and bad port fall back", urls.length > 0 && urls.every(u => u.startsWith("http://127.0.0.1:5227/")), JSON.stringify(urls));
}
{
	const { mod, urls } = await load({ ...baseGlobals, apiPort: "0" }, FIXTURE);
	new mod.DiscoveryService().Initialize();
	check("out-of-range port falls back to 5227", urls.length > 0 && urls.every(u => u.startsWith("http://127.0.0.1:5227/")), JSON.stringify(urls));
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
