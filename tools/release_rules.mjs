import fs from "node:fs";

// Shared release rules. Used by tools/release_check.mjs (sources) and
// tools/build-releases.mjs (built repos).
export const PLUGIN_SOURCES = [
	"plugins/RainbowMusicLedDirect/RainbowMusicLedDirect.js",
	"plugins/JungleLeopardL10/JungleLeopardL10.js",
	"plugins/ColorfulZ590M/ColorfulZ590M.js",
	"plugins/YunariBridge/YunariBridge.js",
];

// Published-facing docs that must stay sanitized even though only the release
// repos ship them (the dev copies are the source of the release copies).
export const DOC_SOURCES = [
	"plugins/RainbowMusicLedDirect/README.md",
	"plugins/JungleLeopardL10/README.md",
	"plugins/ColorfulZ590M/README.md",
	"plugins/YunariBridge/README.md",
];

const FORBIDDEN = [
	[/192\.168\.\d+\.\d+/, "private LAN address"],
	[/C:\\Users\\/i, "author user path"],
	[/D:\\git-repos/i, "author repo path"],
	[/orca\\chat-scratch/i, "orca scratch path"],
];

// Device- and machine-specific identifiers live in a git-ignored file, so this
// file can be published without publishing the values it guards.
try {
	const local = fs.readFileSync(new URL("./private_values.txt", import.meta.url), "utf8");
	for (const line of local.split(/\r?\n/)) {
		const value = line.trim();
		if (!value || value.startsWith("#")) continue;
		const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		FORBIDDEN.push([new RegExp(escaped, "i"), "private device value"]);
	}
} catch (e) { /* no local list: nothing extra to check */ }

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
