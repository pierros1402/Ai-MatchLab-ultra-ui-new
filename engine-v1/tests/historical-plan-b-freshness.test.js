import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateFrozenValueObservationFreshness,
  shouldPreserveHistoricalPlanBObservation
} from "../jobs/verify-artifact-freshness-day.js";

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

test("new canonical-joined Plan B contract is preserved for closed days", () => {
  const input = validInput();
  input.planBAudit.sourceContract = {
    valueInput: "canonical_fixture_universe_joined_with_odds_memory_ai_assessment",
    fixtureUniverse: "canonical_fixtures",
    canonicalFixtureUniverseRequired: true,
    exactIdentityJoinOnly: true,
    oddsMemoryCanCreateFixture: false,
    deploySnapshotInput: false,
    realBookmakerOddsUsed: false
  };

  assert.equal(shouldPreserveHistoricalPlanBObservation(input), true);
});
function frozenUniverse(
  hash,
  canonicalIds = [
    "cid_one",
    "cid_two"
  ]
) {
  return {
    schema:
      "ai-matchlab.value-fixture-universe.v1",
    source:
      "canonical_fixtures",
    count:
      canonicalIds.length,
    hash,
    canonicalIds
  };
}

function planBSourceContract(
  fixtureUniverse
) {
  return {
    valueInput:
      "canonical_fixture_universe_joined_with_persistent_ai_assessment",
    fixtureUniverse,
    canonicalFixtureUniverseRequired:
      true,
    exactIdentityJoinOnly:
      true,
    oddsMemoryCanCreateFixture:
      false,
    deploySnapshotInput:
      false,
    realBookmakerOddsUsed:
      false
  };
}

function frozenFreshnessInput({
  currentIds = [
    "cid_one",
    "cid_two"
  ],
  currentHash =
    "current-hash",
  frozenHash =
    "frozen-hash",
  planBHash =
    frozenHash,
  planB2Hash =
    frozenHash,
  dayKey =
    "2026-08-22",
  currentAthensDay =
    "2026-08-22",
  orphanPlanBPick =
    false
} = {}) {
  const a2Universe =
    frozenUniverse(
      frozenHash
    );

  const bUniverse =
    frozenUniverse(
      planBHash
    );

  const b2Universe =
    frozenUniverse(
      planB2Hash
    );

  const planBPick =
    orphanPlanBPick
      ? "cid_outside"
      : "cid_one";

  return {
    dayKey,
    currentAthensDay,

    currentUniverse:
      frozenUniverse(
        currentHash,
        currentIds
      ),

    planA2: {
      date:
        dayKey,
      count:
        0,
      picks:
        []
    },

    planA2Audit: {
      ok:
        true,
      date:
        dayKey,
      planId:
        "plan-a2",
      fixtureUniverse:
        a2Universe
    },

    planB: {
      ok:
        true,
      date:
        dayKey,
      planId:
        "plan-b",
      outputMode:
        "plan-b-observation",
      count:
        1,
      picks: [
        {
          canonicalId:
            planBPick
        }
      ],
      sourceContract:
        planBSourceContract(
          bUniverse
        )
    },

    planBAudit: {
      ok:
        true,
      date:
        dayKey,
      sourceContract:
        planBSourceContract(
          bUniverse
        )
    },

    planB2: {
      ok:
        true,
      date:
        dayKey,
      planId:
        "plan-b2",
      outputMode:
        "plan-b2-observation",
      count:
        1,
      picks: [
        {
          canonicalId:
            "cid_two"
        }
      ],
      sourceContract:
        planBSourceContract(
          b2Universe
        )
    },

    planB2Audit: {
      ok:
        true,
      date:
        dayKey,
      sourceContract:
        planBSourceContract(
          b2Universe
        )
    }
  };
}

test(
  "current-day frozen Value cohort preserves legitimate descriptor drift",
  () => {
    const result =
      evaluateFrozenValueObservationFreshness(
        frozenFreshnessInput()
      );

    assert.equal(
      result.ok,
      true
    );

    assert.equal(
      result.strictFrozenParity,
      true
    );

    assert.equal(
      result.membershipParity,
      true
    );

    assert.equal(
      result.descriptorDrift,
      true
    );
  }
);

test(
  "frozen Value freshness fails closed when current canonical membership changes",
  () => {
    const result =
      evaluateFrozenValueObservationFreshness(
        frozenFreshnessInput({
          currentIds: [
            "cid_one",
            "cid_three"
          ]
        })
      );

    assert.equal(
      result.ok,
      false
    );

    assert.equal(
      result.reason,
      "current_frozen_membership_mismatch"
    );
  }
);

test(
  "frozen Value freshness retains strict descriptor parity inside the frozen cohort",
  () => {
    const result =
      evaluateFrozenValueObservationFreshness(
        frozenFreshnessInput({
          planBHash:
            "different-frozen-hash"
        })
      );

    assert.equal(
      result.ok,
      false
    );

    assert.equal(
      result.reason,
      "frozen_universe_strict_parity_failed"
    );
  }
);

test(
  "future Value day is never treated as a frozen freshness cohort",
  () => {
    const result =
      evaluateFrozenValueObservationFreshness(
        frozenFreshnessInput({
          dayKey:
            "2026-08-23",
          currentAthensDay:
            "2026-08-22"
        })
      );

    assert.equal(
      result.ok,
      false
    );

    assert.equal(
      result.reason,
      "future_day_not_frozen"
    );
  }
);

test(
  "frozen Value freshness rejects a pick outside its frozen universe",
  () => {
    const result =
      evaluateFrozenValueObservationFreshness(
        frozenFreshnessInput({
          orphanPlanBPick:
            true
        })
      );

    assert.equal(
      result.ok,
      false
    );

    assert.equal(
      result.reason,
      "invalid_frozen_plan_b"
    );
  }
);
