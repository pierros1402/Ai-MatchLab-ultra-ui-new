import test from "node:test";
import assert from "node:assert/strict";

import { shouldPreserveHistoricalPlanBObservation } from "../jobs/verify-artifact-freshness-day.js";

function validInput() {
  return {
    dayKey: "2026-07-19",
    currentAthensDay: "2026-07-20",
    planB: {
      outputMode: "plan-b-observation"
    },
    planBAudit: {
      date: "2026-07-19",
      sourceContract: {
        valueInput: "odds_memory_ai_assessment",
        deploySnapshotInput: false,
        realBookmakerOddsUsed: false
      }
    }
  };
}

test("closed-day immutable Plan B observation is preserved", () => {
  assert.equal(shouldPreserveHistoricalPlanBObservation(validInput()), true);
});

test("current Athens operational day remains freshness-gated", () => {
  const input = validInput();
  input.dayKey = "2026-07-20";
  input.currentAthensDay = "2026-07-20";
  input.planBAudit.date = "2026-07-20";

  assert.equal(shouldPreserveHistoricalPlanBObservation(input), false);
});

test("wrong Plan B output mode is not preserved", () => {
  const input = validInput();
  input.planB.outputMode = "production";

  assert.equal(shouldPreserveHistoricalPlanBObservation(input), false);
});

test("snapshot-dependent or wrong value input is not preserved", () => {
  const snapshotDependent = validInput();
  snapshotDependent.planBAudit.sourceContract.deploySnapshotInput = true;

  const wrongValueInput = validInput();
  wrongValueInput.planBAudit.sourceContract.valueInput = "deploy_snapshot_odds";

  assert.equal(shouldPreserveHistoricalPlanBObservation(snapshotDependent), false);
  assert.equal(shouldPreserveHistoricalPlanBObservation(wrongValueInput), false);
});

test("wrong Plan B audit date is not preserved", () => {
  const input = validInput();
  input.planBAudit.date = "2026-07-18";

  assert.equal(shouldPreserveHistoricalPlanBObservation(input), false);
});

test("Plan B observation using bookmaker odds is not preserved", () => {
  const input = validInput();
  input.planBAudit.sourceContract.realBookmakerOddsUsed = true;

  assert.equal(shouldPreserveHistoricalPlanBObservation(input), false);
});
