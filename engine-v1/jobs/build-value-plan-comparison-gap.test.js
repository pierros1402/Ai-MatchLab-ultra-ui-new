import assert from "node:assert/strict";
import test from "node:test";

import {
  buildComparisonFinalResultProvenance,
  buildPlanAUnavailableComparisonPayload,
  resolveComparisonFinalStatus,
  resolveComparisonFinalStatusType
} from "./build-value-plan-comparison-day.js";

test(
  "records an unrecoverable Plan A gap without synthesizing Plan A",
  () => {
    const planB = {
      id: "plan-b",
      label:
        "Plan B - retrospective strict value-policy-v2.3 observation",
      count: 18,
      summary: {
        picks: 18,
        uniqueMatches: 17,
        settled: 16,
        wins: 10,
        losses: 6,
        unresolved: 2,
        unsupported: 0,
        hitRate: 0.625,
        oddsAvailable: 0,
        averageOdds: null,
        totalStake: null,
        totalReturn: null,
        profit: null,
        roi: null
      },
      picks: []
    };

    const payload =
      buildPlanAUnavailableComparisonPayload({
        dayKey:
          "2026-07-26",

        reason:
          "historical_plan_a_artifact_never_persisted",

        planAPath:
          "data/value-plans/2026-07-26/plan-a.json",

        planBPath:
          "data/value-plans/2026-07-26/plan-b.json",

        outputPath:
          "data/value-comparison/2026-07-26.json",

        planB,

        fixturesPath:
          "data/deploy-snapshots/2026-07-26/fixtures-all.json",

        finalResultsDir:
          "data/final-results/2026-07-26",

        verifiedFinalResults:
          213,

        canonicalFinalVetoDir:
          "data/canonical-fixtures/2026-07-26",

        canonicalContradictionsRejected:
          [],

        canonicalIdentityAmbiguities:
          [],

        fixtureIdentityAmbiguities:
          [],

        finalIdentityAmbiguities:
          [],

        planBMembership: {
          picks: 18,
          validPicks: 18,
          orphanPicks: 0,
          ambiguousPicks: 0
        }
      });

    assert.equal(
      payload.ok,
      true
    );

    assert.equal(
      payload.schema,
      "ai-matchlab.value-plan-comparison.v1"
    );

    assert.equal(
      payload.date,
      "2026-07-26"
    );

    assert.equal(
      payload.comparisonEligible,
      false
    );

    assert.deepEqual(
      payload.planAAvailability,
      {
        status:
          "unrecoverable",

        reason:
          "historical_plan_a_artifact_never_persisted",

        historicalArtifactRecovered:
          false,

        retrospectivePlanASynthesisAllowed:
          false
      }
    );

    assert.equal(
      payload.sourceContract.planA,
      "unavailable_historical_observation"
    );

    assert.equal(
      payload.sourceContract.planAImmutable,
      false
    );

    assert.equal(
      payload.sourceContract.planAAvailability,
      "unrecoverable"
    );

    assert.equal(
      payload.sourceContract.planB,
      "retrospective_strict_value_policy_v2.3_observation_artifact"
    );

    assert.equal(
      payload.sourceContract
        .planBCanonicalFixtureMembershipRequired,
      true
    );

    assert.equal(
      payload.sourceContract
        .planBOddsMayCreateFixtures,
      false
    );

    assert.equal(
      payload.plans.A,
      null
    );

    assert.equal(
      payload.plans.B,
      planB
    );

    assert.equal(
      payload.plans.B.summary.picks,
      18
    );

    assert.deepEqual(
      payload.comparison,
      {
        pickDeltaPlanBMinusPlanA:
          null,

        settledDeltaPlanBMinusPlanA:
          null,

        winsDeltaPlanBMinusPlanA:
          null,

        lossesDeltaPlanBMinusPlanA:
          null,

        hitRateDeltaPlanBMinusPlanA:
          null,

        roiDeltaPlanBMinusPlanA:
          null
      }
    );
  }
);

test(
  "unrecoverable Plan A requires an explicit non-empty reason",
  () => {
    assert.throws(
      () =>
        buildPlanAUnavailableComparisonPayload({
          dayKey:
            "2026-07-26",

          reason:
            "",

          planAPath:
            "data/value-plans/2026-07-26/plan-a.json",

          planBPath:
            "data/value-plans/2026-07-26/plan-b.json",

          outputPath:
            "data/value-comparison/2026-07-26.json",

          planB: {
            count: 18,
            summary: {
              picks: 18
            },
            picks: []
          }
        }),

      /plan_a_unavailable_reason_required/u
    );
  }
);
test("comparison final-result metadata preserves authoritative settlement evidence", () => {
  const finalResult = {
    verifiedFinalTruth: true,
    finalTruthVerdict: "verified_final_result",
    verdict: "verified_final_result",
    source: "canonical_espn_terminal_final",
    sourceCount: 1,
    independentSourceCount: 1,
    generatedAt: "2026-07-27T08:31:25.324Z",
    verification: {
      state: "verified_final_result",
      method: "canonical_espn_terminal_final",
      authority: "canonical_fixture_store"
    },
    settlement: {
      state: "verified_final_result"
    },
    sources: [
      {
        provider: "espn",
        providerMatchId: "401841434",
        statusType: "STATUS_FINAL",
        rawStatus: "STATUS_FULL_TIME"
      }
    ]
  };

  assert.equal(
    resolveComparisonFinalStatus(finalResult),
    "verified_final_result"
  );

  assert.equal(
    resolveComparisonFinalStatusType(finalResult),
    "STATUS_FINAL"
  );

  assert.deepEqual(
    buildComparisonFinalResultProvenance(finalResult),
    {
      verifiedFinalTruth: true,
      verdict: "verified_final_result",
      source: "canonical_espn_terminal_final",
      method: "canonical_espn_terminal_final",
      authority: "canonical_fixture_store",
      sourceCount: 1,
      independentSourceCount: 1,
      generatedAt: "2026-07-27T08:31:25.324Z",
      sources: finalResult.sources
    }
  );
});

test("provider-native final status type remains optional", () => {
  const finalResult = {
    verifiedFinalTruth: true,
    finalTruthVerdict: "verified_final_result",
    source: "flashscore_same_day_exact_team_match",
    verification: {
      method: "flashscore_same_day_exact_team_match"
    },
    sources: [
      {
        provider: "flashscore",
        providerMatchId: "QFe0V8qQ"
      }
    ]
  };

  assert.equal(
    resolveComparisonFinalStatus(finalResult),
    "verified_final_result"
  );

  assert.equal(
    resolveComparisonFinalStatusType(finalResult),
    null
  );

  assert.equal(
    buildComparisonFinalResultProvenance(finalResult)
      .source,
    "flashscore_same_day_exact_team_match"
  );
});

test("missing verified final produces no fabricated metadata", () => {
  assert.equal(
    resolveComparisonFinalStatus(null),
    null
  );

  assert.equal(
    resolveComparisonFinalStatusType(null),
    null
  );

  assert.equal(
    buildComparisonFinalResultProvenance(null),
    null
  );
});
