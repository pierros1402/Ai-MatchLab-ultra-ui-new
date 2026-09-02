import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  describePlanAObservationDifference
} from "./bootstrap-historical-plan-a-observation-day.js";

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
