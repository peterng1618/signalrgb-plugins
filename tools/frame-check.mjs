// Runnable check for the ColorfulZ590M plugin: layout positions and frame bytes.
// Stubs the SignalRGB globals, imports the plugin, inspects what it writes.
//   node tools/frame-check.mjs
import assert from "node:assert/strict";

const writes = [];
let leds = null;

globalThis.LightingMode = "Canvas";
globalThis.device = {
	set_endpoint: () => {},
	setName: () => {},
	setSize: () => {},
	setControllableLeds: (names, positions) => { leds = { names, positions }; },
	log: () => {},
	color: () => [0, 0, 0],
	write: (data, len) => writes.push({ data, len }),
};

const plugin = await import("../plugins/ColorfulZ590M/ColorfulZ590M.js");

assert.equal(plugin.Validate({ usage_page: 0xFF01, usage: 1 }), true);
assert.equal(plugin.Validate({ usage_page: 0xFF00, usage: 1 }), false, "must never bind MI_01");

plugin.Initialize();
assert.equal(leds.positions.length, 139, "1 x 12V + 18 onboard + 2 x 60 ARGB");
assert.equal(leds.names.length, leds.positions.length);
assert.equal(new Set(leds.positions.map((p) => p.join(","))).size, 139, "every LED owns a pixel");

// Onboard polyline: slots 2..15 down the right edge, 16..19 along the bottom.
const pos = (name) => leds.positions[leds.names.indexOf(name)];
assert.equal(plugin.Size()[0], 120, "120x120 canvas (shown as 60x60)");
assert.deepEqual(pos("Onboard 1"), [116, 4], "slot 2 is the top of the right edge");
assert.deepEqual(pos("Onboard 14"), [116, 82], "slot 15 still vertical");
assert.deepEqual(pos("Onboard 15"), [92, 116], "slot 16 turns the corner");
assert.deepEqual(pos("Onboard 18"), [20, 116], "slot 19 runs left along the bottom");

// Feed each layout LED a colour that encodes its index, then check wire slots.
const canvas = new Map(leds.positions.map(([x, y], i) => [`${x},${y}`, [i & 0xFF, 0, 0]]));
globalThis.device.color = (x, y) => canvas.get(`${x},${y}`);

plugin.Render();

assert.equal(writes.length, 8, "7 data packets + commit");
for (const [i, w] of writes.entries()) {
	assert.equal(w.len, 65);
	assert.equal(w.data.length, 65);
	assert.deepEqual(w.data.slice(0, 4), [0x00, 0x01, 0x00, 0x88]);
	assert.equal(w.data[4], i === 7 ? 0xFF : i);
}

const slot = (n) => writes[Math.floor(n / 20)].data.slice(5 + (n % 20) * 3, 5 + (n % 20) * 3 + 3);
assert.deepEqual(slot(0), [0, 0, 0], "12V zone -> wire 0");
assert.deepEqual(slot(1), [0, 0, 0], "12V zone -> wire 1");
assert.deepEqual(slot(2), [1, 0, 0], "Onboard 1 -> wire 2");
assert.deepEqual(slot(15), [14, 0, 0], "Onboard 14 -> wire 15");
assert.deepEqual(slot(19), [18, 0, 0], "Onboard 18 -> wire 19");
assert.deepEqual(slot(20), [19, 0, 0], "first ARGB 1 LED -> wire 20");
assert.deepEqual(slot(79), [78, 0, 0], "last ARGB 1 LED -> wire 79");
assert.deepEqual(slot(80), [79, 0, 0], "first ARGB 2 LED -> wire 80");
assert.deepEqual(slot(139), [138, 0, 0], "last ARGB 2 LED -> wire 139");

console.log("frame-check: ok");
