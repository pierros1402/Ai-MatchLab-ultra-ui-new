// Read-only observability inventory. Log markers are NOT resumable stages.
// This file must never execute run-daily-cycle.js or mutate project data.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

export const BOUNDARY_AUDIT_SCHEMA = "ai-matchlab.daily-cycle-log-boundaries.v1";
const REQUIRED = [
  "provider-competition-discovery", "canonical-fixtures-sync",
  "discover-active-leagues", "standings-build", "details-build",
  "player-usage-workset", "team-news-build",
  "fixture-acquisition-v2-readiness", "value-build",
  "four-plan-settlement-bundle", "deploy-snapshot-export",
  "finalize-live-status-refresh", "finalization-readiness",
  "finalize-value-resettle", "h2h-foundation-rebuild",
  "final-standings-foundation", "final-model-priors-foundation"
];
function insist(value, code) { if (!value) throw new Error(code); }
export function auditDailyCycleBoundarySource(source) {
  insist(typeof source === "string" && source.length > 0, "boundary_source_required");
  const sourceSha256 = crypto.createHash("sha256").update(source).digest("hex");
  const events = [], open = new Map(), pairs = [], anomalies = [];
  // Match literal log markers only; this is a source-observability inventory,
  // not a JavaScript parser, output manifest or claim of execution success.
  const re = /console\.log\(\s*["'`]\[daily-cycle\] ([a-z0-9-]+):(start|done)["'`]/g;
  for (const match of source.matchAll(re)) {
    const [ , id, phase ] = match;
    const line = source.slice(0, match.index).split("\n").length;
    events.push({ id, phase, line });
    if (phase === "start") {
      if (open.has(id)) anomalies.push({ id, code: "duplicate_unclosed_start", line });
      open.set(id, line);
    } else if (open.has(id)) {
      pairs.push({ id, startLine: open.get(id), doneLine: line });
      open.delete(id);
    } else {
      anomalies.push({ id, code: "done_without_prior_start", line });
    }
  }
  for (const [id, line] of open) anomalies.push({ id, code: "start_without_done", line });
  const observed = new Set(pairs.map(x => x.id));
  const missingRequired = REQUIRED.filter(id => !observed.has(id));
  return {
    schema: BOUNDARY_AUDIT_SCHEMA, sourceSha256,
    lineCount: source.split("\n").length,
    eventCount: events.length, pairedCount: pairs.length,
    missingRequired, anomalies, pairs,
    semantics: {
      sourceOnly: true, runtimeObserved: false, conditionalBranchesNotResolved: true,
      durableOutputInventory: false, dependencyDAG: false,
      checkpointAuthorized: false, productionResumeAuthorized: false,
      publicationAuthorized: false
    }
  };
}
export function requireBaselineBoundaryCoverage(report) {
  insist(report?.schema === BOUNDARY_AUDIT_SCHEMA, "boundary_report_invalid");
  insist(report.pairedCount >= 60, "boundary_pair_floor_drift");
  insist(report.missingRequired.length === 0, "required_boundary_missing");
  // Anomalies are reported, not silently reinterpreted as resumable stages.
  return report;
}
const self = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (self) {
  const file = path.resolve("engine-v1/jobs/run-daily-cycle.js");
  const report = requireBaselineBoundaryCoverage(
    auditDailyCycleBoundarySource(fs.readFileSync(file, "utf8"))
  );
  process.stdout.write(JSON.stringify(report, null, 2) + "\n");
}
