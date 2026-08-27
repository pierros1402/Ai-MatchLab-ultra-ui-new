import assert from "node:assert/strict";
import test from "node:test";

import {
  FOUR_PLAN_EVALUATOR_CONTRACT,
  FOUR_PLAN_EVALUATOR_SCHEMA,
  binaryBrierScore,
  binaryLogLoss,
  evaluateFourPlanRows,
  isValidEventProbability
} from "./four-plan-evaluator-core.js";

function closeTo(
  actual,
  expected,
  epsilon = 1e-9
) {
  assert.ok(
    Math.abs(
      actual - expected
    ) <= epsilon,
    `expected ${actual} ~= ${expected}`
  );
}

function row({
  plan = "A",
  day = "2026-08-01",
  canonicalMatchId = "m1",
  leagueSlug = "test.1",
  market = "OU25",
  pick = "OVER",
  band = "HIGH",
  probability = 0.8,
  result = "WIN",
  preKickoffProven = true,
  comparisonMatched = true,
  universeExact = true,
  planAFreezeProven = true
} = {}) {
  return {
    plan,
    day,
    canonicalMatchId,
    leagueSlug,
    market,
    pick,
    band,
    probability,
    result,
    preKickoffProven,
    comparisonMatched,
    universeExact,
    planAFreezeProven
  };
}

test(
  "binary proper-scoring primitives are deterministic",
  () => {
    assert.equal(
      isValidEventProbability(0),
      true
    );

    assert.equal(
      isValidEventProbability(1),
      true
    );

    assert.equal(
      isValidEventProbability(1.01),
      false
    );

    assert.equal(
      isValidEventProbability(null),
      false
    );

    assert.equal(
      isValidEventProbability(""),
      false
    );

    assert.equal(
      isValidEventProbability(false),
      false
    );

    assert.equal(
      isValidEventProbability("0.8"),
      true
    );

    closeTo(
      binaryBrierScore(
        0.8,
        1
      ),
      0.04
    );

    closeTo(
      binaryLogLoss(
        0.8,
        1
      ),
      -Math.log(0.8)
    );

    assert.equal(
      binaryBrierScore(
        1.2,
        1
      ),
      null
    );
  }
);

test(
  "confidence is never substituted for a missing event probability",
  () => {
    const result =
      evaluateFourPlanRows([
        {
          ...row(),
          probability: null,
          confidence: 0.99
        }
      ]);

    assert.equal(
      result.plans.A
        .counts
        .validProbability,
      0
    );

    assert.equal(
      result.plans.A
        .counts
        .properScoreEligible,
      0
    );

    assert.equal(
      result.plans.A
        .properScoring
        .pickLevel
        .count,
      0
    );
  }
);

test(
  "void unresolved and post-kickoff rows never enter proper scoring",
  () => {
    const result =
      evaluateFourPlanRows([
        row({
          canonicalMatchId: "win",
          probability: 0.8,
          result: "WIN"
        }),

        row({
          canonicalMatchId: "loss",
          probability: 0.7,
          result: "LOSS"
        }),

        row({
          canonicalMatchId: "void",
          probability: 0.9,
          result: "VOID"
        }),

        row({
          canonicalMatchId: "unresolved",
          probability: 0.9,
          result: "UNRESOLVED"
        }),

        row({
          canonicalMatchId: "late",
          probability: 0.9,
          result: "WIN",
          preKickoffProven: false
        })
      ]);

    const plan =
      result.plans.A;

    assert.equal(
      plan.counts.rows,
      5
    );

    assert.equal(
      plan.counts.settled,
      3
    );

    assert.equal(
      plan.counts.void,
      1
    );

    assert.equal(
      plan.counts.unresolved,
      1
    );

    assert.equal(
      plan.counts.properScoreEligible,
      2
    );

    assert.equal(
      plan.properScoring
        .pickLevel
        .count,
      2
    );

    closeTo(
      plan.selectionQuality
        .hitRate,
      2 / 3,
      1e-6
    );
  }
);

test(
  "match-cluster scoring gives each match one aggregate weight",
  () => {
    const result =
      evaluateFourPlanRows([
        row({
          canonicalMatchId: "m1",
          market: "OU25",
          probability: 0.8,
          result: "WIN"
        }),

        row({
          canonicalMatchId: "m1",
          market: "BTTS",
          probability: 0.7,
          result: "WIN"
        }),

        row({
          canonicalMatchId: "m2",
          market: "OU25",
          probability: 0.6,
          result: "WIN"
        })
      ]);

    const scoring =
      result.plans.A
        .properScoring;

    assert.equal(
      scoring.pickLevel.count,
      3
    );

    assert.equal(
      scoring.matchClusterLevel.count,
      2
    );

    closeTo(
      scoring.pickLevel.brier,
      (
        0.04 +
        0.09 +
        0.16
      ) / 3,
      1e-6
    );

    closeTo(
      scoring.matchClusterLevel.brier,
      (
        (
          0.04 +
          0.09
        ) / 2 +
        0.16
      ) / 2,
      1e-6
    );
  }
);

test(
  "calibration reliability bins use only proper-score-eligible rows",
  () => {
    const result =
      evaluateFourPlanRows([
        row({
          canonicalMatchId: "m1",
          probability: 0.81,
          result: "WIN"
        }),

        row({
          canonicalMatchId: "m2",
          probability: 0.84,
          result: "LOSS"
        }),

        row({
          canonicalMatchId: "m3",
          probability: 0.42,
          result: "WIN"
        }),

        row({
          canonicalMatchId: "m4",
          probability: 0.82,
          result: "UNRESOLVED"
        })
      ]);

    const calibration =
      result.plans.A
        .properScoring
        .calibration;

    assert.equal(
      calibration.length,
      2
    );

    const highBin =
      calibration.find(
        bin =>
          bin.bin === "0.8-0.9"
      );

    assert.ok(highBin);

    assert.equal(
      highBin.count,
      2
    );

    closeTo(
      highBin.meanProbability,
      0.825,
      1e-6
    );

    closeTo(
      highBin.observedRate,
      0.5,
      1e-6
    );
  }
);

test(
  "per-market per-league and per-band summaries are emitted",
  () => {
    const result =
      evaluateFourPlanRows([
        row({
          canonicalMatchId: "m1",
          leagueSlug: "eng.1",
          market: "OU25",
          band: "HIGH"
        }),

        row({
          canonicalMatchId: "m2",
          leagueSlug: "eng.1",
          market: "BTTS",
          band: "MEDIUM"
        }),

        row({
          canonicalMatchId: "m3",
          leagueSlug: "esp.1",
          market: "OU25",
          band: "HIGH"
        })
      ]);

    const plan =
      result.plans.A;

    assert.equal(
      plan.byMarket.OU25
        .counts.rows,
      2
    );

    assert.equal(
      plan.byMarket.BTTS
        .counts.rows,
      1
    );

    assert.equal(
      plan.byLeague["eng.1"]
        .counts.rows,
      2
    );

    assert.equal(
      plan.byLeague["esp.1"]
        .counts.rows,
      1
    );

    assert.equal(
      plan.byBand.HIGH
        .counts.rows,
      2
    );

    assert.equal(
      plan.byBand.MEDIUM
        .counts.rows,
      1
    );
  }
);

test(
  "strict common-selected cohort requires all four plans and evidence gates",
  () => {
    const rows =
      [
        ["A", 0.80],
        ["A2", 0.78],
        ["B", 0.82],
        ["B2", 0.79]
      ].map(
        ([plan, probability]) =>
          row({
            plan,
            probability,
            canonicalMatchId: "common-1",
            market: "OU25",
            pick: "OVER",
            result: "WIN",
            universeExact: true,
            planAFreezeProven: true
          })
      );

    const result =
      evaluateFourPlanRows(
        rows
      );

    assert.equal(
      result.commonSelected
        .commonSelectedSlotCount,
      1
    );

    assert.equal(
      result.commonSelected
        .strictScoreableSlotCount,
      1
    );

    for (
      const plan
      of ["A", "A2", "B", "B2"]
    ) {
      assert.equal(
        result.commonSelected
          .plans[plan]
          .properScoring
          .pickLevel
          .count,
        1
      );
    }
  }
);

test(
  "common-selected row is excluded when exact-universe evidence is absent",
  () => {
    const rows =
      ["A", "A2", "B", "B2"]
        .map(
          plan =>
            row({
              plan,
              canonicalMatchId: "common-2",
              universeExact:
                plan !== "B2"
            })
        );

    const result =
      evaluateFourPlanRows(
        rows
      );

    assert.equal(
      result.commonSelected
        .commonSelectedSlotCount,
      1
    );

    assert.equal(
      result.commonSelected
        .strictScoreableSlotCount,
      0
    );

    assert.equal(
      result.commonSelected
        .rejectionFlags
        .exactUniverseMissing,
      1
    );
  }
);

test(
  "duplicate plan rows for one selected slot fail closed as ambiguous",
  () => {
    const rows =
      ["A", "A2", "B", "B2"]
        .map(
          plan =>
            row({
              plan,
              canonicalMatchId:
                "common-3"
            })
        );

    rows.push(
      row({
        plan: "A",
        canonicalMatchId:
          "common-3"
      })
    );

    const result =
      evaluateFourPlanRows(
        rows
      );

    assert.equal(
      result.commonSelected
        .ambiguousSlotCount,
      1
    );

    assert.equal(
      result.commonSelected
        .commonSelectedSlotCount,
      0
    );

    assert.equal(
      result.commonSelected
        .strictScoreableSlotCount,
      0
    );
  }
);

test(
  "schema freezes the no-retrospective and no-full-universe contract",
  () => {
    const result =
      evaluateFourPlanRows([]);

    assert.equal(
      result.schema,
      FOUR_PLAN_EVALUATOR_SCHEMA
    );

    assert.equal(
      FOUR_PLAN_EVALUATOR_CONTRACT
        .fullFixtureUniverseProbabilityScoringSupported,
      false
    );

    assert.equal(
      FOUR_PLAN_EVALUATOR_CONTRACT
        .confidenceUsedAsEventProbability,
      false
    );

    assert.equal(
      FOUR_PLAN_EVALUATOR_CONTRACT
        .retrospectiveForecastRebuildAllowed,
      false
    );

    assert.equal(
      FOUR_PLAN_EVALUATOR_CONTRACT
        .frozenObservationMutationAllowed,
      false
    );
  }
);
