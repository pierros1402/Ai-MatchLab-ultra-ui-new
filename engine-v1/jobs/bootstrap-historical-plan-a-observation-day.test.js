import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  describePlanAObservationDifference
} from "./bootstrap-historical-plan-a-observation-day.js";

const workflow = fs.readFileSync(
  new URL(
    "../../.github/workflows/tmp-p0-publication-chain-stage2-day29-20260829.yml",
    import.meta.url
  ),
  "utf8"
);

const bootstrapSource = fs.readFileSync(
  new URL(
    "./bootstrap-historical-plan-a-observation-day.js",
    import.meta.url
  ),
  "utf8"
);

test("Plan A bootstrap diagnostics expose the exact first changed pick", () => {
  const candidate = {
    picks: [
      { matchId: "m1", market: "1X2", pick: "HOME", score: 0.71 },
      { matchId: "m2", market: "OU25", pick: "OVER", score: 0.68 }
    ]
  };
  const snapshot = {
    picks: [
      { matchId: "m1", market: "1X2", pick: "HOME", score: 0.71 },
      { matchId: "m2", market: "OU25", pick: "UNDER", score: 0.68 }
    ]
  };

  const result = describePlanAObservationDifference(
    "2026-08-29",
    candidate,
    snapshot
  );

  assert.equal(result.ok, false);
  assert.equal(result.firstMismatchIndex, 1);
  assert.deepEqual(result.candidateOnlyIdentities, ["m2|OU25|OVER"]);
  assert.deepEqual(result.snapshotOnlyIdentities, ["m2|OU25|UNDER"]);
  assert.notEqual(result.candidateSignature, result.snapshotSignature);
});

test("Plan A bootstrap diagnostics pass identical source-bound payloads", () => {
  const payload = {
    picks: [
      { matchId: "m1", market: "BTTS", pick: "YES", score: 0.66 }
    ]
  };

  const result = describePlanAObservationDifference(
    "2026-08-29",
    payload,
    structuredClone(payload)
  );

  assert.equal(result.ok, true);
  assert.equal(result.firstMismatchIndex, null);
});

test("Day29 recovery uses the reusable source-bound bootstrap after Details stabilize", () => {
  const detailsIndex = workflow.indexOf(
    "Synchronize Day29 canonical runtime and Details"
  );
  const bootstrapIndex = workflow.indexOf(
    "bootstrap-historical-plan-a-observation-day.js"
  );
  const stageIndex = workflow.indexOf(
    "Stage source-bound Day29 seed and truth foundations"
  );

  assert.ok(detailsIndex >= 0);
  assert.ok(bootstrapIndex > detailsIndex);
  assert.ok(stageIndex > bootstrapIndex);
  assert.match(
    workflow.slice(bootstrapIndex, stageIndex),
    /--date=2026-08-29[\s\S]*--plan-a-candidate=[\s\S]*--plan-b-candidate=[\s\S]*--source-ref=3f4bcb309b3035422983de5ed48a3f94e3bdca7b/
  );
  assert.match(
    workflow,
    /Rebuild Day29 A and B from the immutable adjusted cohort checkpoint/
  );
  assert.match(
    workflow,
    /data\/value-plans\/2026-08-29\/plan-b-audit\.json/
  );
  assert.doesNotMatch(
    workflow,
    /day29_plan_a_snapshot_candidate_pick_signature_mismatch/
  );
});

test("historical bootstrap refreshes the snapshot before comparison and freezes only afterward", () => {
  const coverageIndex = bootstrapSource.indexOf(
    'coverage.mode !== "full_canonical"'
  );
  const snapshotRefreshIndex = bootstrapSource.indexOf(
    "const snapshotValue = updateSnapshotValueArtifacts("
  );
  const signatureCheckIndex = bootstrapSource.indexOf(
    "const signatureCheck = describePlanAObservationDifference("
  );
  const freezeIndex = bootstrapSource.indexOf(
    "ensurePlanAObservationDay(date, persistedSnapshot"
  );

  assert.ok(coverageIndex >= 0);
  assert.ok(snapshotRefreshIndex > coverageIndex);
  assert.ok(signatureCheckIndex > snapshotRefreshIndex);
  assert.ok(freezeIndex > signatureCheckIndex);
});
