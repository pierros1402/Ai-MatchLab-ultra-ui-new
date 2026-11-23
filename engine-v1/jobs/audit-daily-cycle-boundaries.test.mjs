import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { auditDailyCycleBoundarySource, requireBaselineBoundaryCoverage } from "./audit-daily-cycle-boundaries.mjs";

test("current production cycle has explicit paired observability boundaries", () => {
  const source = fs.readFileSync(new URL("./run-daily-cycle.js", import.meta.url), "utf8");
  const report = requireBaselineBoundaryCoverage(auditDailyCycleBoundarySource(source));
  assert.equal(report.semantics.productionResumeAuthorized, false);
  assert.equal(report.semantics.checkpointAuthorized, false);
  assert.equal(report.semantics.publicationAuthorized, false);
  assert.ok(report.pairedCount >= 60);
  for (const p of report.pairs) assert.ok(p.startLine < p.doneLine);
  assert.match(report.sourceSha256, /^[0-9a-f]{64}$/);
});

test("missing critical marker is never a valid baseline", () => {
  const src = fs.readFileSync(new URL("./run-daily-cycle.js", import.meta.url), "utf8");
  const changed = src.replace("[daily-cycle] value-build:start", "[daily-cycle] value-build:altered");
  assert.notEqual(changed, src);
  const audit = auditDailyCycleBoundarySource(changed);
  assert.ok(audit.missingRequired.includes("value-build"));
  assert.throws(() => requireBaselineBoundaryCoverage(audit), /required_boundary_missing/);
});

test("synthetic unpaired boundaries are disclosed without treating them as checkpoints", () => {
  const audit = auditDailyCycleBoundarySource('console.log("[daily-cycle] test-stage:start");');
  assert.equal(audit.pairedCount, 0);
  assert.ok(audit.anomalies.some(x => x.code === "start_without_done"));
  assert.equal(audit.semantics.durableOutputInventory, false);
  assert.throws(() => requireBaselineBoundaryCoverage(audit), /boundary_pair_floor_drift/);
});
