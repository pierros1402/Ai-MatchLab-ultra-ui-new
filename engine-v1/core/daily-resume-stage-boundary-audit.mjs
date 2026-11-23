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

// Source-bound execution boundaries for the real monolithic cycle. A pair
// proves source order only; it never authorizes reuse, stage completion or skips.
const REAL_CYCLE_PAIRS = Object.freeze([
  ["provider-competition-discovery", "external"],
  ["canonical-fixtures-sync", "mutable"],
  ["discover-active-leagues", "derived"],
  ["standings-build", "external"],
  ["details-history-index-foundation", "derived"],
  ["details-h2h-foundation", "derived"],
  ["details-build", "derived"],
  ["fixture-acquisition-v2-readiness", "gate"],
  ["value-build", "derived"],
  ["four-plan-settlement-bundle", "mutable"],
  ["authoritative-terminal-promotion", "mutable"],
  ["final-details-sync", "mutable"],
  ["deploy-snapshot-export", "derived"],
  ["h2h-foundation-rebuild", "derived"],
  ["final-standings-foundation", "derived"],
  ["final-model-priors-foundation", "derived"]
]);
export function auditRealCyclePairs(cycleText) {
  invariant(typeof cycleText === "string", "resume_cycle_source_missing");
  let previous = -1;
  return REAL_CYCLE_PAIRS.map(([id, reuseClass]) => {
    const startMarker = "[daily-cycle] " + id + ":start";
    const doneMarker = "[daily-cycle] " + id + ":done";
    const start = cycleText.indexOf(startMarker);
    const done = cycleText.indexOf(doneMarker);
    invariant(start >= 0 && done >= 0, "resume_real_cycle_pair_missing:" + id);
    invariant(start > previous && done > start, "resume_real_cycle_pair_order_changed:" + id);
    invariant(cycleText.indexOf(startMarker, start + 1) === -1 &&
      cycleText.indexOf(doneMarker, done + 1) === -1,
      "resume_real_cycle_pair_ambiguous:" + id);
    previous = done;
    return { id, reuseClass, startOffset: start, doneOffset: done,
      resumeAllowed: false, persistedManifest: false };
  });
}


/**
 * Inventory every literal Daily log boundary, including conditional branches.
 * This is static source evidence, not a runtime completion journal or resume grant.
 * A done-only marker is retained as a diagnostic, never a resumable stage.
 */
export function auditCompleteCycleMarkerInventory(cycleText) {
  invariant(typeof cycleText === "string", "resume_cycle_source_missing");
  const marker = /\[daily-cycle\] ([A-Za-z][A-Za-z0-9-]*):(start|done)\b/g;
  const byId = new Map();
  for (const match of cycleText.matchAll(marker)) {
    const id = match[1];
    const entry = byId.get(id) || { id, startOffsets: [], doneOffsets: [] };
    entry[match[2] === "start" ? "startOffsets" : "doneOffsets"].push(match.index);
    byId.set(id, entry);
  }
  invariant(byId.size > 0, "resume_complete_inventory_empty");
  const paired = [];
  const doneOnly = [];
  for (const entry of byId.values()) {
    const { id, startOffsets, doneOffsets } = entry;
    invariant(startOffsets.length <= 1 && doneOffsets.length <= 1,
      "resume_complete_inventory_duplicate:" + id);
    invariant(doneOffsets.length === 1, "resume_complete_inventory_missing_done:" + id);
    if (startOffsets.length === 0) {
      doneOnly.push({ id, doneOffset: doneOffsets[0], resumeAllowed: false });
      continue;
    }
    invariant(startOffsets[0] < doneOffsets[0],
      "resume_complete_inventory_pair_order_changed:" + id);
    paired.push({ id, startOffset: startOffsets[0], doneOffset: doneOffsets[0],
      resumeAllowed: false, persistedManifest: false });
  }
  paired.sort((a, b) => a.startOffset - b.startOffset);
  doneOnly.sort((a, b) => a.doneOffset - b.doneOffset);
  return {
    schema: "ai-matchlab.daily-complete-cycle-marker-inventory.v1",
    cycleSha256: sha256(cycleText),
    literalMarkerCount: [...cycleText.matchAll(marker)].length,
    pairedCount: paired.length,
    doneOnlyCount: doneOnly.length,
    pairs: paired,
    doneOnly,
    staticSourceOnly: true,
    crossRunResumeAuthorized: false,
    publicationAuthorized: false
  };
}

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
  const realCyclePairs = auditRealCyclePairs(cycleText);
  const completeCycleInventory = auditCompleteCycleMarkerInventory(cycleText);
  invariant(realCyclePairs.every(pair => completeCycleInventory.pairs.some(full => full.id === pair.id)),
    "resume_selected_pair_missing_from_complete_inventory");
  // The expensive cycle still contains stateful provider, value, previous-day
  // settlement and history writes. No inferred cut point is safe for resume.
  return {
    schema: "ai-matchlab.daily-resume-stage-boundary-audit.v1",
    workflowSha256: sha256(workflowText),
    dailyCycleSha256: sha256(cycleText),
    sourceBound: true,
    stages,
    realCyclePairs,
    completeCycleInventory,
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
