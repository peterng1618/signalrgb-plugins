// Static release gate. Run: node tools/release_check.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PLUGIN_SOURCES, DOC_SOURCES, lintPlugin, lintSanitization } from "./release_rules.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = PLUGIN_SOURCES.flatMap((file) =>
	lintPlugin(file, fs.readFileSync(path.join(root, file), "utf8"))).concat(
	DOC_SOURCES.flatMap((file) =>
		lintSanitization(file, fs.readFileSync(path.join(root, file), "utf8"))));

if (failures.length) {
	for (const line of failures) console.log(`FAIL ${line}`);
	process.exit(1);
}
console.log(`release rules ok: ${PLUGIN_SOURCES.length} plugins`);
