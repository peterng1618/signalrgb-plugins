// Build the four public add-on repos from the dev tree.
// Run: node tools/build-releases.mjs [--no-git]
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { lintPlugin, lintSanitization } from "./release_rules.mjs";

const REPOS = [
	{ repo: "signalrgb-rainbow-music-led", plugin: "plugins/RainbowMusicLedDirect/RainbowMusicLedDirect.js", photo: "plugins/RainbowMusicLedDirect/rainbow-music-led-monitor-backlight-led-bars.jpg", qml: "plugins/RainbowMusicLedDirect/RainbowMusicLedDirect.qml" },
	{ repo: "signalrgb-jungle-leopard-l10", plugin: "plugins/JungleLeopardL10/JungleLeopardL10.js", photo: "plugins/JungleLeopardL10/jungle-leopard-l10-argb-hub.png" },
	{ repo: "signalrgb-colorful-z590m", plugin: "plugins/ColorfulZ590M/ColorfulZ590M.js", photo: "plugins/ColorfulZ590M/colorful-cvn-z590m-gaming-frozen-v20.png" },
	{ repo: "signalrgb-yunari", plugin: "plugins/YunariBridge/YunariBridge.js", photo: "plugins/YunariBridge/yunari.svg", qml: "plugins/YunariBridge/YunariBridge.qml" },
];

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = !process.argv.includes("--no-git");
const copy = (from, to) => fs.copyFileSync(path.join(root, from), path.join(to));
const failures = [];
const built = [];

for (const entry of REPOS) {
	const out = path.join(root, "dist", entry.repo);
	fs.rmSync(out, { recursive: true, force: true });
	fs.mkdirSync(out, { recursive: true });

	const js = path.basename(entry.plugin);
	copy(entry.plugin, path.join(out, js));
	copy(entry.photo, path.join(out, path.basename(entry.photo)));
	copy("LICENSE", path.join(out, "LICENSE"));
	copy(`release/${entry.repo}/README.md`, path.join(out, "README.md"));
	if (entry.qml) copy(entry.qml, path.join(out, path.basename(entry.qml)));

	const readme = fs.readFileSync(path.join(out, "README.md"), "utf8");
	const link = `signalrgb://addon/install?url=https://github.com/peterng1618/${entry.repo}`;
	if (!readme.includes(link)) failures.push(`${entry.repo}: README missing deep link ${link}`);

	// Lint every text asset, including the SVG icon.
	const textFiles = fs.readdirSync(out).filter(f => /\.(md|js|svg|qml)$/.test(f) || f === "LICENSE");
	for (const file of textFiles) {
		const label = `${entry.repo}/${file}`;
		const text = fs.readFileSync(path.join(out, file), "utf8");
		failures.push(...lintSanitization(label, text));
		if (file.endsWith(".js")) failures.push(...lintPlugin(label, text));
	}

	const jsFiles = fs.readdirSync(out).filter(f => f.endsWith(".js"));
	if (jsFiles.length !== 1 || jsFiles[0] !== js) failures.push(`${entry.repo}: expected only ${js}, got ${jsFiles.join(",")}`);
	const expectedCount = entry.qml ? 5 : 4;
	if (fs.readdirSync(out).length !== expectedCount) failures.push(`${entry.repo}: expected ${expectedCount} files, got ${fs.readdirSync(out).join(",")}`);
	const qmlFiles = fs.readdirSync(out).filter(f => f.endsWith(".qml"));
	if (qmlFiles.length !== (entry.qml ? 1 : 0)) failures.push(`${entry.repo}: expected ${entry.qml ? 1 : 0} qml files, got ${qmlFiles.join(",")}`);

	built.push({ ...entry, out, js, expectedCount });
}

if (failures.length) {
	for (const line of failures) console.log(`FAIL ${line}`);
	process.exit(1);
}

for (const entry of built) {
	if (git) {
		execFileSync("git", ["init", "-q", "-b", "main"], { cwd: entry.out });
		execFileSync("git", ["add", "-A"], { cwd: entry.out });
		execFileSync("git", ["commit", "-q", "-m", `Add ${entry.js.replace(/\.js$/, "")} plugin for SignalRGB`], { cwd: entry.out });
	}
	console.log(`built ${entry.repo} (${entry.expectedCount} files${git ? ", 1 commit" : ""})`);
}
