import fs from "node:fs";
import path from "node:path";
import { planNativeProviderTeamIdentityBackfill } from "../engine-v1/core/plan-native-provider-team-identity-backfill.js";

const [discoveryFile, canonicalDirectory, reportFile, writeFlag] = process.argv.slice(2);
if (!discoveryFile || !canonicalDirectory || !reportFile || (writeFlag && writeFlag !== "--write"))
  throw new Error("usage: discovery.json canonical-day-directory report.json [--write]");
const discovery = JSON.parse(fs.readFileSync(discoveryFile, "utf8"));
if (path.basename(path.resolve(canonicalDirectory)) !== discovery.dayKey)
  throw new Error("native_identity_backfill_directory_day_mismatch");
const inputs = fs.readdirSync(canonicalDirectory).filter(f => f.endsWith(".json")).sort()
  .map(file => ({ file, payload: JSON.parse(fs.readFileSync(path.join(canonicalDirectory, file), "utf8")) }));
const plan = planNativeProviderTeamIdentityBackfill({
  discovery, canonicalFixtures: inputs.flatMap(input => input.payload.fixtures || [])
});
const replacements = new Map(plan.fixtures.map(row => [row.canonicalId || row.matchId, row]));
const changed = new Set(plan.changes.map(row => row.canonicalId));
const changedFiles = [];
for (const { file, payload } of inputs) {
  if (!(payload.fixtures || []).some(row => changed.has(row.canonicalId || row.matchId))) continue;
  changedFiles.push(file);
  if (writeFlag === "--write") {
    const next = { ...payload, fixtures: payload.fixtures.map(row => replacements.get(row.canonicalId || row.matchId)) };
    fs.writeFileSync(path.join(canonicalDirectory, file), JSON.stringify(next, null, 2) + "\n");
  }
}
fs.mkdirSync(path.dirname(reportFile), { recursive: true });
fs.writeFileSync(reportFile, JSON.stringify({
  schema: "ai-matchlab.native-provider-team-identity-backfill-plan.v1",
  dayKey: discovery.dayKey, discoveryHash: discovery.hash, observedAt: discovery.generatedAt,
  wroteCanonicalFiles: writeFlag === "--write", changedFiles,
  changes: plan.changes, rejected: plan.rejected
}, null, 2) + "\n");
console.log(JSON.stringify({ changes: plan.changes.length, changedFiles: changedFiles.length,
  rejected: plan.rejected.length, write: writeFlag === "--write" }));
