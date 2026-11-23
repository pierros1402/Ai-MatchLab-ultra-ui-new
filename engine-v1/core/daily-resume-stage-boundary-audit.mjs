import fs from "node:fs";
import crypto from "node:crypto";

const STAGES = Object.freeze([
  ["acquisition-persisted", "Commit canonical fixture acquisition store", "persisted-source"],
  ["prior-value-settlement", "Persist prior Value settlement checkpoint", "persisted-source"],
  ["plan-c-preflight", "Preflight existing Plan C settlement before long daily cycle", "validation"],
  ["daily-cycle", "Run daily cycle", "monolithic-mutable"],
  ["live-status-refresh", "Refresh final authoritative live status", "external-freshness"],
  ["assessment-input", "Ensure persistent model assessment input for Value Plans B/B2", "assessment-authority"],
  ["plan-c-production", "Generate, settle and build Plan C shadow feed", "canonical-derived"],
  ["snapshot-rebuild", "Refresh value artifacts after final canonical snapshot", "derived"],
  ["truth-persistence", "Persist truth artifacts (ungated)", "persisted-source"],
  ["prepublish-gate", "Complete daily prepublish contract gate", "mandatory-gate"],
  ["commit-snapshot", "Commit and push snapshot", "publication-write"],
  ["public-verify", "Promote and verify current-day public runtime snapshot", "mandatory-public-verify"]
]);
const CYCLE_MARKERS = [
  "[daily-cycle] provider-competition-discovery:start",
  "[daily-cycle] value-build:start",
  "checkpointDailyPlanA(dayKey, valueBuild);",
  "[daily-cycle] finalize:start",
  "[daily-cycle] final-model-priors-foundation:done",
  "[daily-cycle] done"
];
function invariant(ok, reason) { if (!ok) throw new Error(reason); }
function sha256(s) { return crypto.createHash("sha256").update(s).digest("hex"); }
function stepLocations(workflowText) {
  const found = new Map();
  const lines = workflowText.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s{6}- name: (.+)$/);
    if (!m) continue;
    const name = m[1].trim();
    invariant(!found.has(name), "resume_duplicate_workflow_step:" + name);
    found.set(name, i + 1);
  }
  return found;
}
export function auditDailyResumeStageBoundaries(workflowText, cycleText) {
  invariant(typeof workflowText === "string" && typeof cycleText === "string",
    "resume_stage_source_missing");
  const locations = stepLocations(workflowText);
  const stages = [];
  let previousLine = 0;
  for (const [id, label, category] of STAGES) {
    const line = locations.get(label);
    invariant(Number.isInteger(line), "resume_missing_workflow_stage:" + id);
    invariant(line > previousLine, "resume_workflow_stage_order_changed:" + id);
    stages.push({ id, name: label, category, line, resumeAllowed: false });
    previousLine = line;
  }
  let previous = -1;
  for (const marker of CYCLE_MARKERS) {
    const at = cycleText.indexOf(marker);
    invariant(at >= 0, "resume_cycle_marker_missing:" + marker);
    invariant(at > previous, "resume_cycle_marker_order_changed:" + marker);
    previous = at;
  }
  // The expensive cycle still contains stateful provider, value, previous-day
  // settlement and history writes. No inferred cut point is safe for resume.
  return {
    schema: "ai-matchlab.daily-resume-stage-boundary-audit.v1",
    workflowSha256: sha256(workflowText),
    dailyCycleSha256: sha256(cycleText),
    sourceBound: true,
    stages,
    monolithicCycleSplitApproved: false,
    crossRunResumeAuthorized: false,
    publicationAuthorized: false
  };
}
export function auditDailyResumeRepository(root = process.cwd()) {
  const wf = fs.readFileSync(root + "/.github/workflows/daily-deploy-snapshot.yml", "utf8");
  const cycle = fs.readFileSync(root + "/engine-v1/jobs/run-daily-cycle.js", "utf8");
  return auditDailyResumeStageBoundaries(wf, cycle);
}
