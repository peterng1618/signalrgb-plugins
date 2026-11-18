/*
 * Runnable self-check for the L10 plugin's frame builders and port model.
 * Run: node tools/plugin_selfcheck.mjs
 * Stubs @SignalRGB/serial and the SignalRGB device globals; no hardware needed.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const sourcePath = new URL("../plugins/JungleLeopardL10/JungleLeopardL10.js", import.meta.url);
const raw = fs.readFileSync(sourcePath, "utf8").replace('import Serial from "@SignalRGB/serial";', "");

let failures = 0;

function check(label, condition, detail = "") {
	if (condition) {
		console.log(`ok   ${label}`);
	} else {
		failures++;
		console.log(`FAIL ${label} ${detail}`);
	}
}

function xor8(bytes) {
	return bytes.reduce((a, b) => a ^ b, 0);
}

function parseColorFrame(frame) {
	const header = frame.slice(0, 6).join(",") === "85,37,33,0,0,0";

	if (!header) {
		throw new Error("colour header mismatch");
	}

	const len = (frame[6] << 8) | frame[7];
	const payload = frame.slice(8, 8 + len - 1);
	const crc = frame[8 + len - 1];

	return { payload, ok: len === payload.length + 1 && crc === xor8(payload) };
}

function parseFillFrame(frame) {
	const len = (frame[7] << 8) | frame[8];
	const value = frame.slice(9, 9 + len - 1);
	const crc = frame[9 + len - 1];

	return { counts: value.slice(12, 24), ok: crc === xor8(value) };
}

async function load(globals, staleQueue = [], statusReply = null) {
	for (const [key, value] of Object.entries(globals)) {
		globalThis[key] = value;
	}

	const channels = new Map();
	const frames = [];
	const logs = [];

	globalThis.device = {
		setName() {},
		SetLedLimit() {},
		pause() {},
		addChannel(name, count) { channels.set(name, count); },
		channel(name) {
			const portIndex = parseInt(name.replace("Port ", ""), 10);

			return {
				LedCount: () => channels.get(name),
				ledCount: channels.get(name),
				getColors: () => {
					const out = [];

					for (let led = 0; led < channels.get(name); led++) {
						out.push(led + 1, portIndex, 0);
					}

					return out;
				},
			};
		},
		createColorArray(hex, count) {
			const rgb = [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
			return new Array(count).fill(rgb).flat();
		},
		log(message) { logs.push(message); },
	};

	let connected = false;
	let handshakeWritten = false;
	let pendingStatus = statusReply;

	globalThis.Serial = {
		isConnected: () => connected,
		connect() { connected = true; },
		write(frame) {
			const bytes = Array.from(frame);

			frames.push(bytes);

			if (bytes[0] === 0x55 && bytes[1] === 0x15 && bytes[2] === 0x01) {
				handshakeWritten = true;
			}
		},
		read() {
			// Before the handshake write, hand out stale ACK/garbage chunks; drainInput()
			// stops on the first empty read. After it, hand out the status reply once.
			if (!handshakeWritten) {
				return staleQueue.length ? staleQueue.shift() : [];
			}

			if (pendingStatus) {
				const reply = pendingStatus;

				pendingStatus = null;
				return reply;
			}

			return [];
		},
	};

	const file = path.join(os.tmpdir(), `jl-selfcheck-${process.pid}-${Math.random().toString(16).slice(2)}.mjs`);
	fs.writeFileSync(file, raw);
	const mod = await import(pathToFileURL(file).href);
	fs.unlinkSync(file);

	return { mod, channels, frames, logs };
}

// The plugin throttles colour writes to MAX_WRITE_HZ; tests drive Render faster than that.
let clockOffset = 0;
const realNow = Date.now;
Date.now = () => realNow() + clockOffset;
const advanceClock = ms => { clockOffset += ms; };

const baseGlobals = {
	shutdownColor: "#000000",
	LightingMode: "Canvas",
	forcedColor: "#ffffff",
	portLedCounts: "",
	fansPerPort: "0,0,0,0,0,3,2,2,0,0",
	ledsPerFan: 8,
	reversePorts: "0,0,0,0,0,0,0,1,0,0",
	diagnosticMode: "Off",
	diagnosticPort: 6,
};

// 1. default fans model -> channels, fixed wire fillCount, 600-LED payload
{
	const { mod, channels, frames } = await load({ ...baseGlobals });

	mod.Initialize();
	check("channels are only populated ports",
		[...channels.keys()].join(",") === "Port 6,Port 7,Port 8"
		&& channels.get("Port 6") === 24 && channels.get("Port 7") === 16 && channels.get("Port 8") === 16,
		JSON.stringify([...channels]));

	const fill = frames.find(f => f[0] === 0x55 && f[2] === 0x22);
	const parsed = parseFillFrame(fill);

	check("fillCount frame checksum", parsed.ok);
	check("fillCount is 60 for all ten ports", parsed.counts.slice(0, 10).join(",") === new Array(10).fill(60).join(","), parsed.counts.join(","));

	mod.Render();
	const colours = frames.filter(f => f[2] === 0x21).pop();
	const { payload, ok } = parseColorFrame(colours);

	check("colour frame checksum", ok);
	check("colour payload is always 1800 bytes", payload.length === 1800, String(payload.length));
	check("port 6 starts at fixed block 5*60", payload.slice(300 * 3, 300 * 3 + 3).join(",") === "1,6,0", payload.slice(900, 903).join(","));
	check("port 7 starts at fixed block 6*60", payload.slice(360 * 3, 360 * 3 + 3).join(",") === "1,7,0", payload.slice(1080, 1083).join(","));
	check("port 8 starts at fixed block 7*60 and is reversed by default", payload.slice(420 * 3, 420 * 3 + 3).join(",") === "16,8,0", payload.slice(1260, 1263).join(","));
	check("port 7 default is natural order", payload.slice(360 * 3, 360 * 3 + 3).join(",") === "1,7,0", payload.slice(1080, 1083).join(","));
	check("unused block 0 stays black", payload.slice(0, 6).join(",") === "0,0,0,0,0,0", payload.slice(0, 6).join(","));
	check("port 6 block after its 24 LEDs stays black", payload.slice((300 + 24) * 3, (300 + 24) * 3 + 3).join(",") === "0,0,0", payload.slice((300 + 24) * 3, (300 + 24) * 3 + 3).join(","));
	check("only 1800 bytes ever written after fillCount", frames.filter(f => f[2] === 0x21).every(f => f.length === 1800 + 6 + 2 + 1), "");
}

// 2. reversePorts reverses only that port's logical LEDs inside its fixed block
{
	const { mod, frames } = await load({ ...baseGlobals, reversePorts: "0,0,0,0,0,1,0,0,0,0" });

	mod.Initialize();
	mod.Render();
	const { payload } = parseColorFrame(frames.filter(f => f[2] === 0x21).pop());

	check("port 6 reversed first LED is LED 24", payload.slice(300 * 3, 300 * 3 + 3).join(",") === "24,6,0", payload.slice(900, 903).join(","));
	check("port 6 block still ends at LED 24", payload.slice((300 + 23) * 3, (300 + 23) * 3 + 3).join(",") === "1,6,0", payload.slice((300 + 23) * 3, (300 + 23) * 3 + 3).join(","));
	check("port 7 untouched", payload.slice(360 * 3, 360 * 3 + 3).join(",") === "1,7,0");
}

// 3. portLedCounts overrides logical counts only; the wire fillCount stays 60
{
	const { mod, channels, frames } = await load({ ...baseGlobals, portLedCounts: "70,0,0,0,0,0,0,0,0,5,9,9" });

	mod.Initialize();
	check("override channels", [...channels.keys()].join(",") === "Port 1,Port 10", JSON.stringify([...channels]));
	check("override clamps to 60 per port", channels.get("Port 1") === 60 && channels.get("Port 10") === 5);

	const fill = frames.find(f => f[0] === 0x55 && f[2] === 0x22);

	check("override leaves wire fillCount at 60", parseFillFrame(fill).counts.slice(0, 10).every(c => c === 60), parseFillFrame(fill).counts.join(","));

	mod.Render();
	const { payload } = parseColorFrame(frames.filter(f => f[2] === 0x21).pop());

	check("override payload still 1800 bytes", payload.length === 1800, String(payload.length));
	check("override port 10 block at 9*60", payload.slice(540 * 3, 540 * 3 + 3).join(",") === "1,10,0", payload.slice(1620, 1623).join(","));
}

// 4. bad override falls back to the fans model
{
	const { mod, channels, logs } = await load({ ...baseGlobals, portLedCounts: "rubbish" });

	mod.Initialize();
	check("bad override falls back", [...channels.keys()].join(",") === "Port 6,Port 7,Port 8", JSON.stringify([...channels]));
	check("bad override is logged", logs.some(l => l.includes("bad portLedCounts")), logs.join("\n"));
}

// 4b. shipped default enables Port 1 (GPU ARGB, 20 LEDs) plus the three fan groups
{
	const { mod, channels } = await load({ ...baseGlobals, portLedCounts: "20,0,0,0,0,24,16,16,0,0" });

	mod.Initialize();
	check("default override adds GPU on port 1",
		[...channels.keys()].join(",") === "Port 1,Port 6,Port 7,Port 8"
		&& channels.get("Port 1") === 20,
		JSON.stringify([...channels]));
	const shipped = mod.ControllableParameters().find(p => p.property === "portLedCounts").default;
	check("shipped portLedCounts default matches", shipped === "20,0,0,0,0,24,16,16,0,0", shipped);
}

// 5. fans model clamped to 60 per port
{
	const { mod, channels } = await load({ ...baseGlobals, fansPerPort: "0,0,0,0,0,9,0,0,0,0", ledsPerFan: 8 });

	mod.Initialize();
	check("fans clamp to 60", channels.get("Port 6") === 60, String(channels.get("Port 6")));
}

// 6. diagnostics: LED walk lights one LED in payload order and logs the index
{
	const { mod, frames, logs } = await load({ ...baseGlobals, diagnosticMode: "LED walk", diagnosticPort: 8 });

	mod.Initialize();
	mod.Render();
	const { payload, ok } = parseColorFrame(frames.filter(f => f[2] === 0x21).pop());
	const lit = [];

	for (let i = 0; i < payload.length; i += 3) {
		if (payload[i] || payload[i + 1] || payload[i + 2]) {
			lit.push(i / 3);
		}
	}

	check("LED walk frame checksum", ok);
	check("exactly one LED lit", lit.length === 1, lit.join(","));
	check("lit LED is inside Port 8's fixed block", lit[0] >= 420 && lit[0] < 436, String(lit[0]));
	check("LED walk logs index", logs.some(l => /LED walk Port 8 LED \d+\/16/.test(l)), logs.join("\n"));

	globalThis.diagnosticMode = "Port walk";
	advanceClock(1000);
	mod.Render();
	const walk = parseColorFrame(frames.filter(f => f[2] === 0x21).pop());
	const white = [];

	for (let i = 0; i < walk.payload.length; i += 3) {
		if (walk.payload[i] === 255 && walk.payload[i + 1] === 255 && walk.payload[i + 2] === 255) {
			white.push(i / 3);
		}
	}

	check("port walk lights one whole port", white.length === 24 || white.length === 16, String(white.length));
	check("port walk payload still 1800 bytes", walk.payload.length === 1800, String(walk.payload.length));
}

// 6b. colour writes are throttled: back-to-back Renders send one frame
{
	const { mod, frames } = await load({ ...baseGlobals });

	mod.Initialize();
	mod.Render();
	mod.Render();
	mod.Render();
	check("throttle sends one colour frame for rapid Renders",
		frames.filter(f => f[2] === 0x21).length === 1,
		String(frames.filter(f => f[2] === 0x21).length));

	advanceClock(100);
	mod.Render();
	check("identical payload is skipped even after the interval",
		frames.filter(f => f[2] === 0x21).length === 1,
		String(frames.filter(f => f[2] === 0x21).length));

	globalThis.LightingMode = "Forced";
	globalThis.forcedColor = "#ff0000";
	advanceClock(100);
	mod.Render();
	check("throttle opens again for a changed payload",
		frames.filter(f => f[2] === 0x21).length === 2,
		String(frames.filter(f => f[2] === 0x21).length));
	globalThis.LightingMode = "Canvas";
}

// 7. Off renders canvas, not diagnostics
{
	globalThis.diagnosticMode = "Off";
	const { mod, frames } = await load({ ...baseGlobals });

	mod.Initialize();
	mod.Render();
	const { payload } = parseColorFrame(frames.filter(f => f[2] === 0x21).pop());

	check("Off mode uses canvas colours", payload[900] === 1 && payload[901] === 6, payload.slice(900, 903).join(","));
}

// 8. handshake: garbage is discarded, a valid 55 04 02 status is parsed
{
	const valid = new Array(21).fill(0);

	valid[0] = 0x55;
	valid[1] = 0x04;
	valid[2] = 0x02;
	valid[3] = 0x93;
	valid[4] = 0x2f;
	valid[5] = 0xcb;
	valid[14] = 10;
	valid[17] = 2;

	const { mod, logs } = await load({ ...baseGlobals }, [new Array(9).fill(0xee)], valid);

	mod.Initialize();
	check("garbage rejected, valid status parsed",
		logs.some(l => l.includes("uid v2_932fcb") && l.includes("10 ports")), logs.join("\n"));
	check("no bogus port count", !logs.some(l => /153 ports/.test(l)), logs.join("\n"));
}

// 9. handshake: garbage only -> no bogus uid
{
	const { mod, logs } = await load({ ...baseGlobals }, [new Array(9).fill(0xee)]);

	mod.Initialize();
	check("garbage-only logs no valid status",
		logs.some(l => l.includes("no valid status")) && !logs.some(l => l.includes("hub found")), logs.join("\n"));
}

// 10. handshake: 131 B of queued ACKs are drained, not parsed as status
{
	const ack = [0x55, 0x04, 0x02, 0x00, 0x00];
	const backlog = [];

	for (let i = 0; i < 26; i++) {
		backlog.push(...ack);
	}

	backlog.push(0x55); // 131 bytes: a cut-off frame, worst case

	const valid = new Array(21).fill(0);

	valid[0] = 0x55;
	valid[1] = 0x04;
	valid[2] = 0x02;
	valid[3] = 0x93;
	valid[4] = 0x2f;
	valid[5] = 0xcb;
	valid[14] = 10;
	valid[17] = 2;

	const { mod, logs } = await load({ ...baseGlobals }, [backlog], valid);

	mod.Initialize();
	check("ACK backlog drained before handshake",
		logs.some(l => l.includes("uid v2_932fcb") && l.includes("10 ports")), logs.join("\n"));
	check("ACK backlog never parsed as ports", !logs.some(l => /153 ports|no valid status/.test(l)), logs.join("\n"));
}

// 11. handshake: ACK backlog only -> rejected, no bogus uid
{
	const ack = [0x55, 0x04, 0x02, 0x00, 0x00];
	const backlog = [];

	for (let i = 0; i < 26; i++) {
		backlog.push(...ack);
	}

	const { mod, logs } = await load({ ...baseGlobals }, [backlog]);

	mod.Initialize();
	check("ACK-only reply is not a status",
		logs.some(l => l.includes("no valid status")) && !logs.some(l => l.includes("hub found")), logs.join("\n"));
}

console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
