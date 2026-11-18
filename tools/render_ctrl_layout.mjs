// Render the Massdrop CTRL LED map as an SVG.
// Usage: node tools/render_ctrl_layout.mjs [led_map.csv] [out.svg]
import fs from "node:fs";
import path from "node:path";

const csvPath = process.argv[2] || "plugins/MassdropCtrl/evidence/led_map.csv";
const outPath = process.argv[3] || "plugins/MassdropCtrl/evidence/ctrl_layout.svg";

// Minimal RFC4180 row splitter (names can be quoted, e.g. the "," key).
function splitCsv(line) {
	const out = [];
	let field = "";
	let quoted = false;
	for (let i = 0; i < line.length; i++) {
		const ch = line[i];
		if (quoted) {
			if (ch === '"' && line[i + 1] === '"') { field += '"'; i++; }
			else if (ch === '"') quoted = false;
			else field += ch;
		} else if (ch === '"') quoted = true;
		else if (ch === ",") { out.push(field); field = ""; }
		else field += ch;
	}
	out.push(field);
	return out;
}

const rows = fs.readFileSync(csvPath, "utf8").trim().split(/\r?\n/).slice(1).map(line => {
	const [led, wire, name, x, y] = splitCsv(line);
	return { led: +led, name, x: +x, y: +y };
});

const cell = 46;
const pad = 24;
const width = (Math.max(...rows.map(r => r.x)) + 1) * cell + pad * 2;
const height = (Math.max(...rows.map(r => r.y)) + 1) * cell + pad * 2;
const isGlow = r => /^under/i.test(r.name);

const rects = rows.map(r => {
	const px = pad + r.x * cell;
	const py = pad + r.y * cell;
	const fill = isGlow(r) ? "#f3e3ff" : "#eaf3ff";
	const stroke = isGlow(r) ? "#8a4fbf" : "#3f6fa8";
	const label = r.name.replace(/\s+/g, "");
	return [
		`<rect x="${px + 2}" y="${py + 2}" width="${cell - 4}" height="${cell - 4}" rx="4" fill="${fill}" stroke="${stroke}"/>`,
		`<text x="${px + cell / 2}" y="${py + 18}" text-anchor="middle" font-size="12" font-weight="bold" fill="#111">${r.led}</text>`,
		`<text x="${px + cell / 2}" y="${py + 32}" text-anchor="middle" font-size="7" fill="#333">${label}</text>`,
	].join("\n");
}).join("\n");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="Segoe UI, Arial, sans-serif">
<rect width="100%" height="100%" fill="#ffffff"/>
<text x="${pad}" y="${pad - 8}" font-size="12" font-weight="bold" fill="#111">Massdrop CTRL — LED index / key map (119 LEDs)</text>
${rects}
</svg>
`;

fs.writeFileSync(outPath, svg);
console.log(`${outPath}: ${rows.length} LEDs, ${width}x${height}`);
