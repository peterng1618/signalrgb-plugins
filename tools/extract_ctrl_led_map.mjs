// Extract the Massdrop CTRL key/LED map from SignalRGB's shipped plugin.
// Usage: node tools/extract_ctrl_led_map.mjs [plugin.js] [out.csv]
import fs from "node:fs";
import path from "node:path";

const plugin = process.argv[2] || path.join(
	process.env.LOCALAPPDATA || "",
	"WhirlwindFX", "SignalRgb", "cache", "addons",
	"db96a7d88f5b77cb2217d656c1356d4e", "Massdrop", "Massdrop_CTRL_QMK_Keyboard.js");
const out = process.argv[3] || "plugins/MassdropCtrl/evidence/led_map.csv";

const src = fs.readFileSync(plugin, "utf8");

function arrayAfter(name) {
	const at = src.indexOf(name);
	if (at < 0) throw new Error(`${name} not found`);
	const open = src.indexOf("[", at);
	let depth = 0;
	for (let i = open; i < src.length; i++) {
		if (src[i] === "[") depth++;
		else if (src[i] === "]") { depth--; if (depth === 0) return src.slice(open, i + 1); }
	}
	throw new Error(`${name} unterminated`);
}

const parseArray = text => Function(`"use strict"; return (${text});`)();
const vKeys = parseArray(arrayAfter("const vKeys ="));
const names = parseArray(arrayAfter("const vKeyNames ="));
const positions = parseArray(arrayAfter("const vKeyPositions ="));

if (vKeys.length !== names.length || names.length !== positions.length) {
	throw new Error(`length mismatch: keys=${vKeys.length} names=${names.length} positions=${positions.length}`);
}

const cell = value => /[",\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value);
const rows = [["led_index", "wire_index", "name", "x", "y"]];
for (let i = 0; i < names.length; i++) {
	rows.push([i, vKeys[i], names[i], positions[i][0], positions[i][1]]);
}

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, rows.map(r => r.map(cell).join(",")).join("\n") + "\n");

const keys = names.filter(n => !/^under/i.test(n)).length;
console.log(`${out}: ${names.length} LEDs (${keys} keys, ${names.length - keys} underglow), indices 0..${names.length - 1}`);
console.log(`identity mapping: ${vKeys.every((v, i) => v === i) ? "yes" : "no"}`);
