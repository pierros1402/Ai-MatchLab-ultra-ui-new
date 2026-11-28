import fs from "node:fs";
import path from "node:path";
import { planPriorProviderBindingRestoration } from "../engine-v1/core/plan-prior-provider-binding-restoration.js";
const [historyFile, discoveryFile, directory, reportFile, writeFlag] = process.argv.slice(2);
if (!historyFile || !discoveryFile || !directory || !reportFile || writeFlag && writeFlag !== "--write")
  throw new Error("usage: history.json discovery.json canonical-day-directory report.json [--write]");
const history = JSON.parse(fs.readFileSync(historyFile, "utf8"));
const discovery = JSON.parse(fs.readFileSync(discoveryFile, "utf8"));
if (path.basename(path.resolve(directory)) !== history.dayKey) throw new Error("prior_binding_directory_day_mismatch");
const inputs = fs.readdirSync(directory).filter(f => f.endsWith(".json")).sort()
  .map(file => ({ file, payload: JSON.parse(fs.readFileSync(path.join(directory, file), "utf8")) }));
const plan = planPriorProviderBindingRestoration({
  canonicalFixtures: inputs.flatMap(p => p.payload.fixtures || []), discovery, history });
const changed = new Set(plan.changes.map(c => c.canonicalId));
const replacements = new Map(plan.fixtures.map(c => [c.canonicalId || c.matchId, c]));
const changedFiles = [];
for (const { file, payload } of inputs) {
  if (!(payload.fixtures || []).some(c => changed.has(c.canonicalId || c.matchId))) continue;
  changedFiles.push(file);
  if (writeFlag === "--write") fs.writeFileSync(path.join(directory, file), JSON.stringify({
    ...payload, fixtures: payload.fixtures.map(c => changed.has(c.canonicalId || c.matchId)
      ? replacements.get(c.canonicalId || c.matchId) : c)
  }, null, 2) + "\n");
}
fs.mkdirSync(path.dirname(reportFile), { recursive: true });
fs.writeFileSync(reportFile, JSON.stringify({
  schema: "ai-matchlab.prior-provider-binding-restoration-plan.v1",
  dayKey: history.dayKey, wroteCanonicalFiles: writeFlag === "--write",
  changedFiles, changes: plan.changes, rejected: plan.rejected
}, null, 2) + "\n");
console.log(JSON.stringify({ changes: plan.changes.length, changedFiles: changedFiles.length,
  rejected: plan.rejected, write: writeFlag === "--write" }));
