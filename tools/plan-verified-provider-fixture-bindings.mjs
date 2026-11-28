import fs from "node:fs";
import path from "node:path";
import { planVerifiedProviderFixtureBindings } from "../engine-v1/core/plan-verified-provider-fixture-bindings.js";
const [auditFile, discoveryFile, canonicalDirectory, reportFile, writeFlag] = process.argv.slice(2);
if (!auditFile || !discoveryFile || !canonicalDirectory || !reportFile || (writeFlag && writeFlag !== "--write"))
  throw new Error("usage: audit.json discovery.json canonical-day-directory report.json [--write]");
const audit = JSON.parse(fs.readFileSync(auditFile, "utf8"));
const discovery = JSON.parse(fs.readFileSync(discoveryFile, "utf8"));
if (path.basename(path.resolve(canonicalDirectory)) !== audit.dayKey) throw new Error("binding_directory_day_mismatch");
const inputs = fs.readdirSync(canonicalDirectory).filter(f => f.endsWith(".json")).sort()
  .map(file => ({ file, payload: JSON.parse(fs.readFileSync(path.join(canonicalDirectory, file), "utf8")) }));
const plan = planVerifiedProviderFixtureBindings({
  audit, discovery, canonicalFixtures: inputs.flatMap(input => input.payload.fixtures || [])
});
const changed = new Set(plan.changes.map(row => row.canonicalId));
const replacements = new Map(plan.fixtures.map(row => [row.canonicalId || row.matchId, row]));
const changedFiles = [];
for (const { file, payload } of inputs) {
  if (!(payload.fixtures || []).some(row => changed.has(row.canonicalId || row.matchId))) continue;
  changedFiles.push(file);
  if (writeFlag === "--write") {
    const next = { ...payload, fixtures: payload.fixtures.map(row =>
      changed.has(row.canonicalId || row.matchId) ? replacements.get(row.canonicalId || row.matchId) : row) };
    fs.writeFileSync(path.join(canonicalDirectory, file), JSON.stringify(next, null, 2) + "\n");
  }
}
fs.mkdirSync(path.dirname(reportFile), { recursive: true });
fs.writeFileSync(reportFile, JSON.stringify({
  schema: "ai-matchlab.reviewed-verified-provider-fixture-binding-plan.v1", dayKey: audit.dayKey,
  sourceAuditSha: audit.sourceSha, sourceDiscoveryHash: audit.discoveryHash,
  wroteCanonicalFiles: writeFlag === "--write", changes: plan.changes, rejected: plan.rejected, changedFiles
}, null, 2) + "\n");
console.log(JSON.stringify({ changes: plan.changes.length, files: changedFiles.length,
  rejected: plan.rejected.length, write: writeFlag === "--write" }));
