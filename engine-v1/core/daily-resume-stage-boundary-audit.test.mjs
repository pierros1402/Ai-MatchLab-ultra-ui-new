import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { auditDailyResumeStageBoundaries, auditDailyResumeRepository, auditRealCyclePairs } from "./daily-resume-stage-boundary-audit.mjs";

const root = process.cwd();
const wf = fs.readFileSync(path.join(root, ".github/workflows/daily-deploy-snapshot.yml"), "utf8");
const cycle = fs.readFileSync(path.join(root, "engine-v1/jobs/run-daily-cycle.js"), "utf8");

test("actual Daily stage boundaries are source-bound but not yet resumable", () => {
  const report = auditDailyResumeRepository(root);
  assert.equal(report.sourceBound, true);
  assert.equal(report.stages.length, 12);
  assert.ok(report.stages.every(s => s.resumeAllowed === false));
  assert.equal(report.crossRunResumeAuthorized, false);
  assert.equal(report.monolithicCycleSplitApproved, false);
  assert.equal(report.publicationAuthorized, false);
  assert.match(report.dailyCycleSha256, /^[a-f0-9]{64}$/);
});
test("missing production step blocks the topology audit", () => {
  assert.throws(() => auditDailyResumeStageBoundaries(
    wf.replace("      - name: Run daily cycle", "      - name: Renamed unknown step"), cycle),
  /resume_missing_workflow_stage:daily-cycle/);
});
test("reordered publisher and prepublish gates rejected", () => {
  const a = "      - name: Complete daily prepublish contract gate";
  const b = "      - name: Commit and push snapshot";
  assert.throws(() => auditDailyResumeStageBoundaries(wf.replace(a, "# TEMP").replace(b, a).replace("# TEMP", b), cycle),
    /resume_workflow_stage_order_changed/);
});
test("missing Plan A frozen observation marker rejected", () => {
  assert.throws(() => auditDailyResumeStageBoundaries(wf, cycle.replace(
    "checkpointDailyPlanA(dayKey, valueBuild);", "// forbidden removed")),
  /resume_cycle_marker_missing/);
});
test("missing final model priors marker rejected", () => {
  assert.throws(() => auditDailyResumeStageBoundaries(wf, cycle.replace(
    "[daily-cycle] final-model-priors-foundation:done", "missing-marker")),
  /resume_cycle_marker_missing/);
});
test("different Daily source changes its bound fingerprint", () => {
  const before = auditDailyResumeStageBoundaries(wf, cycle);
  const after = auditDailyResumeStageBoundaries(wf + "\n# informational-only\n", cycle);
  assert.notEqual(after.workflowSha256, before.workflowSha256);
});

test("real cycle pairs are ordered, source-bound and never falsely reusable", () => {
  const report = auditDailyResumeRepository(root);
  assert.equal(report.realCyclePairs.length, 16);
  assert.ok(report.realCyclePairs.every(x => x.doneOffset > x.startOffset &&
    x.resumeAllowed === false && x.persistedManifest === false));
});
test("a missing real execution done marker blocks the audit", () => {
  assert.throws(() => auditDailyResumeStageBoundaries(wf, cycle.replace(
    "[daily-cycle] details-build:done", "details-build-marker-removed")),
    /resume_real_cycle_pair_missing:details-build/);
});
test("a swapped real execution boundary blocks the audit", () => {
  const start = "[daily-cycle] value-build:start";
  const done = "[daily-cycle] value-build:done";
  assert.throws(() => auditRealCyclePairs(
    cycle.replace(start, "TEMP_BOUNDARY").replace(done, start)
      .replace("TEMP_BOUNDARY", done)),
    /resume_real_cycle_pair_order_changed:value-build/);
});
