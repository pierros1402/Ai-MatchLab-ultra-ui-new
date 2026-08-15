import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { recoverZeroValueObservationDays } from "./recover-zero-value-observation-days.js";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-zero-days-"));
  return {
    valuePlansRoot: path.join(root, "value-plans"),
    comparisonRoot: path.join(root, "value-comparison")
  };
}

function evidence(overrides = {}) {
  return {
    schema: "ai-matchlab.zero-value-observation-recovery-evidence.v1",
    generatedAt: "2026-08-15T08:00:00.000Z",
    entries: [{
      date: "2026-08-13",
      expectedPlanASignature: "7216c040a9933180b7afdb2b9bafa48e13e85ba0e76d996b3e087a6425180a3d",
      observedAt: "2026-08-13T05:52:47.629Z",
      runIds: ["31665818242"],
      headShas: ["72bf6a9fcc282e3c87637cbe3fd5b57e0810ebef"],
      planBObservation: "observed_zero",
      ...overrides
    }]
  };
}

test("recovers a signed zero Plan A day and an eligible observed-zero comparison", () => {
  const paths = fixture();
  const result = recoverZeroValueObservationDays({
    evidence: evidence(),
    evidencePathLabel: "data/value-plans/recovery-evidence.json",
    ...paths
  });

  assert.equal(result.ok, true);
  const planA = JSON.parse(fs.readFileSync(
    path.join(paths.valuePlansRoot, "2026-08-13", "plan-a.json"),
    "utf8"
  ));
  const comparison = JSON.parse(fs.readFileSync(
    path.join(paths.comparisonRoot, "2026-08-13.json"),
    "utf8"
  ));
  assert.equal(planA.count, 0);
  assert.equal(planA.immutable, true);
  assert.equal(comparison.comparisonEligible, true);
  assert.equal(comparison.plans.B.summary.picks, 0);

  const repeated = recoverZeroValueObservationDays({
    evidence: evidence(),
    evidencePathLabel: "data/value-plans/recovery-evidence.json",
    ...paths
  });
  assert.equal(repeated.ok, true);
  assert.equal(repeated.results[0].comparisonCreated, false);
});

test("marks a day ineligible when the historical pipeline never observed Plan B", () => {
  const paths = fixture();
  const result = recoverZeroValueObservationDays({
    evidence: evidence({ planBObservation: "not_observed" }),
    evidencePathLabel: "evidence.json",
    ...paths
  });

  assert.equal(result.ok, true);
  const comparison = JSON.parse(fs.readFileSync(
    path.join(paths.comparisonRoot, "2026-08-13.json"),
    "utf8"
  ));
  assert.equal(comparison.comparisonEligible, false);
  assert.equal(comparison.planBAvailability.available, false);
});

test("rejects evidence whose zero-day signature is wrong without writing", () => {
  const paths = fixture();
  const result = recoverZeroValueObservationDays({
    evidence: evidence({ expectedPlanASignature: "f".repeat(64) }),
    evidencePathLabel: "evidence.json",
    ...paths
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "zero_observation_signature_mismatch");
  assert.equal(fs.existsSync(paths.valuePlansRoot), false);
});
