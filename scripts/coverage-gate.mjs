// Enforces 100% lines/branches/functions on the logic layer — the files where
// a silent regression costs real games (urgency, drafts, streaks, share
// fallbacks, RPC reason mapping). UI screens are deliberately NOT gated at
// 100% (they redesign weekly; their guards are the contract + e2e layers).
// Run after `vitest run --coverage` (json-summary reporter).
import fs from "node:fs";

const GATE = [
  "courtship.ts", "celebrate.ts", "draftGame.ts", "reasons.ts", "calendar.ts",
  "courts.ts", "guest.ts", "share.ts", "utils.ts", "cities.ts", "areas.ts",
  "session.ts", "authReturn.ts", // who is signed in / what Google handed back (2026-10-24)
  "courtsCache.ts",              // one courts fetch per session (2026-10-24 perf)
];

const summaryPath = "coverage/coverage-summary.json";
if (!fs.existsSync(summaryPath)) {
  console.error(`❌ ${summaryPath} not found — run: npx vitest run --coverage`);
  process.exit(1);
}
const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));

let fail = false;
const seen = new Set();
for (const [file, v] of Object.entries(summary)) {
  const base = file.split("/").pop();
  if (!GATE.includes(base)) continue;
  seen.add(base);
  const { lines, branches, functions } = v;
  const ok = lines.pct === 100 && branches.pct === 100 && functions.pct === 100;
  if (!ok) {
    fail = true;
    console.error(`❌ ${base}: lines ${lines.pct}% branches ${branches.pct}% funcs ${functions.pct}% — must be 100/100/100`);
  }
}
for (const base of GATE) {
  if (!seen.has(base)) {
    fail = true;
    console.error(`❌ ${base}: missing from the coverage report (file moved/renamed? update GATE in scripts/coverage-gate.mjs)`);
  }
}

if (fail) process.exit(1);
console.log(`✅ logic-layer coverage gate: ${GATE.length} files at 100/100/100`);
