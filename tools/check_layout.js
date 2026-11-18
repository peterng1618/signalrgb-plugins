// Self-check for the Rainbow Music Led geometry. Run: node tools/check_layout.js
const fs = require("fs");
const src = fs.readFileSync(__dirname + "/../plugins/RainbowMusicLedDirect/RainbowMusicLedDirect.js", "utf8");

function extract(name) {
  const m = src.match(new RegExp("function " + name + "[\\s\\S]*?\\r?\\n}\\r?\\n"));
  if (!m) throw new Error(name + " not found");
  eval(m[0]);
  return eval(name);
}
const ringPositions = extract("ringPositions");
const uPositions = extract("uPositions");

const key = p => p.join(",");
function ok(condition, message) { if (!condition) throw new Error(message); }
function assertPath(label, pts, expectedCount, closed, first, second) {
  ok(pts.length === expectedCount, `${label}: count ${pts.length} != ${expectedCount}`);
  ok(new Set(pts.map(key)).size === pts.length, `${label}: duplicate positions`);
  const end = closed ? pts.length : pts.length - 1;
  for (let i = 0; i < end; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    ok(Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 1, `${label}: gap ${i}: ${a} -> ${b}`);
  }
  ok(key(pts[0]) === first, `${label}: LED0 ${pts[0]}, expected ${first}`);
  ok(key(pts[1]) === second, `${label}: LED1 ${pts[1]}, expected ${second}`);
}

const w = 45, h = 16;
const ring = ringPositions(w, h, false);
const ringRev = ringPositions(w, h, true);
const u = uPositions(w, h, false);
const uRev = uPositions(w, h, true);

assertPath("ring forward", ring, 118, true, "0,15", "0,14");
assertPath("ring reverse", ringRev, 118, true, "0,15", "1,15");
assertPath("U forward", u, 75, false, "0,15", "0,14");
assertPath("U reverse", uRev, 75, false, "44,15", "44,14");
ok(u.filter(p => p[0] === 0).length === 16, "U left bar must be 16 (corners included)");
ok(u.filter(p => p[1] === 0).length === 45, "U top bar must be 45 (corners included)");
ok(u.every(p => p[1] !== 15 || p[0] === 0 || p[0] === 44), "U bottom must be hollow");
ok(ring.filter(p => p[0] === 0).length === 16, "ring left bar must be 16");
ok(ring.filter(p => p[1] === 0).length === 45, "ring top bar must be 45");
ok(ring.filter(p => p[0] === 44).length === 16, "ring right bar must be 16");
ok(ring.filter(p => p[1] === 15).length === 45, "ring bottom bar must be 45");
console.log("geometry ok: ring 118 closed, U 75 open, LED0 fixed, direction reverses path");
