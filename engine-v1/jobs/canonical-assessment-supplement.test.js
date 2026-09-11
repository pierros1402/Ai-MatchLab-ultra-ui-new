import test from "node:test";
import assert from "node:assert/strict";

import { supplementCanonicalAssessments } from "./canonical-assessment-supplement.js";

const NOW = Date.parse("2026-08-14T06:00:00.000Z");

function standings() {
  return {
    accepted: {
      rows: [
        { teamName: "Home", played: 10, goalsFor: 15 },
        { teamName: "Away", played: 10, goalsFor: 10 },
        { teamName: "Three", played: 10, goalsFor: 12 },
        { teamName: "Four", played: 10, goalsFor: 11 }
      ]
    }
  };
}

const noRates = () => null;

test("canonical supplement prices upcoming canonical fixtures without bookmaker odds", () => {
  const recorded = [];
  const summary = supplementCanonicalAssessments("2026-08-14", {
    nowMs: NOW,
    canonicalFixtures: [{
      canonicalId: "cid_test_home_away_20260814",
      leagueSlug: "test.1",
      leagueName: "Test League",
      dayKey: "2026-08-14",
      homeTeam: "Home",
      awayTeam: "Away",
      kickoffUtc: "2026-08-14T18:00:00.000Z"
    }],
    readStandingsFn: standings,
    resolveAliasesFn: (_slug, name) => [name],
    formFn: noRates,
    xgFn: noRates,
    priceFn: () => ({
      model: { source: "test_poisson" },
      markets: { OU25: { probs: { over: 0.6, under: 0.4 } } }
    }),
    recordFn: (id, meta, pricing) => recorded.push({ id, meta, pricing })
  });

  assert.equal(summary.canonicalFixtures, 1);
  assert.equal(summary.eligibleUpcomingFixtures, 1);
  assert.equal(summary.assessmentRowsWritten, 1);
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].id, "cid_test_home_away_20260814");
  assert.equal(recorded[0].meta.aiAssessment.inputSource, "canonical_fixture_trusted_standings");
  assert.deepEqual(recorded[0].pricing, { markets: {} });
});

test("canonical supplement never creates a new assessment after kickoff", () => {
  const recorded = [];
  const summary = supplementCanonicalAssessments("2026-08-14", {
    nowMs: NOW,
    canonicalFixtures: [{
      canonicalId: "cid_test_finished_20260814",
      leagueSlug: "test.1",
      dayKey: "2026-08-14",
      homeTeam: "Home",
      awayTeam: "Away",
      kickoffUtc: "2026-08-14T05:00:00.000Z"
    }],
    readStandingsFn: standings,
    resolveAliasesFn: (_slug, name) => [name],
    formFn: noRates,
    xgFn: noRates,
    priceFn: () => ({ model: {}, markets: { OU25: { probs: { over: 0.6, under: 0.4 } } } }),
    recordFn: (...args) => recorded.push(args)
  });

  assert.equal(summary.skippedStarted, 1);
  assert.equal(summary.assessmentRowsWritten, 0);
  assert.equal(recorded.length, 0);
});
test("canonical supplement fails closed on missing or invalid kickoff", () => {
  const recorded = [];
  let standingsReads = 0;
  let priceCalls = 0;

  const summary = supplementCanonicalAssessments("2026-08-14", {
    nowMs: NOW,
    canonicalFixtures: [
      {
        canonicalId: "cid_test_missing_kickoff_20260814",
        leagueSlug: "test.1",
        dayKey: "2026-08-14",
        homeTeam: "Home",
        awayTeam: "Away"
      },
      {
        canonicalId: "cid_test_invalid_kickoff_20260814",
        leagueSlug: "test.1",
        dayKey: "2026-08-14",
        homeTeam: "Home",
        awayTeam: "Away",
        kickoffUtc: "not-a-valid-kickoff"
      },
      {
        canonicalId: "cid_test_timezone_less_kickoff_20260814",
        leagueSlug: "test.1",
        dayKey: "2026-08-14",
        homeTeam: "Home",
        awayTeam: "Away",
        kickoffUtc: "2026-08-14T18:00:00.000"
      }
    ],
    readStandingsFn: (...args) => {
      standingsReads++;
      return standings(...args);
    },
    resolveAliasesFn: (_slug, name) => [name],
    formFn: noRates,
    xgFn: noRates,
    priceFn: () => {
      priceCalls++;
      return {
        model: {},
        markets: {
          OU25: {
            probs: { over: 0.6, under: 0.4 }
          }
        }
      };
    },
    recordFn: (...args) => recorded.push(args)
  });

  assert.equal(summary.skippedInvalidKickoff, 3);
  assert.equal(summary.skippedStarted, 0);
  assert.equal(summary.eligibleUpcomingFixtures, 0);
  assert.equal(summary.assessmentRowsWritten, 0);
  assert.equal(standingsReads, 0);
  assert.equal(priceCalls, 0);
  assert.equal(recorded.length, 0);
});


test("canonical supplement uses strict six-match team-form fallback when trusted standings are unavailable", () => {
  const recorded = [];
  let priceOptions = null;

  const summary = supplementCanonicalAssessments("2026-08-14", {
    nowMs: NOW,
    canonicalFixtures: [{
      canonicalId: "cid_test_form_fallback_20260814",
      leagueSlug: "test.1",
      leagueName: "Test League",
      dayKey: "2026-08-14",
      homeTeam: "Home FC",
      awayTeam: "Away FC",
      kickoffUtc: "2026-08-14T18:00:00.000Z"
    }],
    readStandingsFn: () => ({ accepted: null }),
    resolveAliasesFn: (_slug, name) => {
      if (name === "Home FC") return ["Home", "Home FC"];
      if (name === "Away FC") return ["Away", "Away FC"];
      return [name];
    },
    formFn: (_slug, name) => {
      if (name === "Home") {
        return { sample: 6, gfRate: 1.8, gaRate: 0.9, ppg: 2.0 };
      }
      if (name === "Away") {
        return { sample: 6, gfRate: 1.2, gaRate: 1.1, ppg: 1.5 };
      }
      return { sample: 0, gfRate: null, gaRate: null, ppg: null };
    },
    xgFn: () => ({ sample: 0, xgForRate: null, xgAgainstRate: null }),
    priceFn: (homeRow, awayRow, options) => {
      assert.deepEqual(homeRow, {});
      assert.deepEqual(awayRow, {});
      priceOptions = options;
      return {
        model: { source: "ai_poisson_standings_plus_form", formUsed: true, xgUsed: false },
        markets: { OU25: { probs: { over: 0.57, under: 0.43 } } }
      };
    },
    recordFn: (id, meta, pricing) => recorded.push({ id, meta, pricing })
  });

  assert.equal(summary.eligibleUpcomingFixtures, 1);
  assert.equal(summary.assessmentRowsWritten, 1);
  assert.equal(summary.assessmentRowsFromTrustedStandings, 0);
  assert.equal(summary.assessmentRowsFromTeamFormFallback, 1);
  assert.equal(summary.skippedMissingStandings, 0);
  assert.equal(summary.skippedInsufficientTeamEvidence, 0);
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].meta.aiAssessment.inputSource, "canonical_fixture_team_form_fallback");
  assert.equal(recorded[0].meta.aiAssessment.model.source, "ai_poisson_team_form_fallback");
  assert.equal(recorded[0].meta.aiAssessment.model.trustedStandingsUsed, false);
  assert.equal(recorded[0].meta.aiAssessment.model.minimumFormSamplePerSide, 6);
  assert.equal(priceOptions.homeForm.sample, 6);
  assert.equal(priceOptions.awayForm.sample, 6);
});

test("canonical team-form fallback fails closed below six form samples on either side", () => {
  const recorded = [];
  let priceCalls = 0;

  const summary = supplementCanonicalAssessments("2026-08-14", {
    nowMs: NOW,
    canonicalFixtures: [{
      canonicalId: "cid_test_form_fallback_insufficient_20260814",
      leagueSlug: "test.1",
      dayKey: "2026-08-14",
      homeTeam: "Home",
      awayTeam: "Away",
      kickoffUtc: "2026-08-14T18:00:00.000Z"
    }],
    readStandingsFn: () => ({ accepted: null }),
    resolveAliasesFn: (_slug, name) => [name],
    formFn: (_slug, name) => name === "Home"
      ? { sample: 6, gfRate: 1.5, gaRate: 1.0, ppg: 1.8 }
      : { sample: 5, gfRate: 1.2, gaRate: 1.2, ppg: 1.4 },
    xgFn: () => ({ sample: 10, xgForRate: 1.4, xgAgainstRate: 1.0 }),
    priceFn: () => {
      priceCalls++;
      return { model: {}, markets: { OU25: { probs: { over: 0.5, under: 0.5 } } } };
    },
    recordFn: (...args) => recorded.push(args)
  });

  assert.equal(summary.eligibleUpcomingFixtures, 1);
  assert.equal(summary.assessmentRowsWritten, 0);
  assert.equal(summary.assessmentRowsFromTeamFormFallback, 0);
  assert.equal(summary.skippedMissingStandings, 1);
  assert.equal(summary.skippedInsufficientTeamEvidence, 1);
  assert.equal(priceCalls, 0);
  assert.equal(recorded.length, 0);
});

test("canonical supplement can use safe cross-competition form while preserving the six-match threshold", () => {
  const recorded = [];
  let priceOptions = null;

  const summary =
    supplementCanonicalAssessments(
      "2026-08-14",
      {
        nowMs: NOW,

        canonicalFixtures: [{
          canonicalId:
            "cid_cross_form_home_away_20260814",
          leagueSlug:
            "eng.fa",
          leagueName:
            "FA Cup",
          dayKey:
            "2026-08-14",
          homeTeam:
            "Crystal Palace",
          awayTeam:
            "Middlesbrough",
          kickoffUtc:
            "2026-08-14T18:00:00.000Z"
        }],

        readStandingsFn:
          () => ({ accepted: null }),

        resolveAliasesFn:
          (_slug, name) => [name],

        formFn:
          () => ({
            sample: 0,
            gfRate: null,
            gaRate: null,
            ppg: null
          }),

        crossFormFn:
          (_slug, name) => ({
            ok: true,
            sample: 6,
            gfRate:
              name === "Crystal Palace"
                ? 1.7
                : 1.4,
            gaRate: 1.0,
            ppg: 1.8,
            source:
              "cross_competition_form",
            sourceCountry:
              "england",
            sourceSlugs:
              name === "Crystal Palace"
                ? ["eng.1"]
                : ["eng.2"]
          }),

        xgFn:
          () => ({
            sample: 0,
            xgForRate: null,
            xgAgainstRate: null
          }),

        priceFn:
          (_home, _away, options) => {
            priceOptions = options;

            return {
              model: {
                formUsed: true,
                xgUsed: false
              },
              markets: {
                OU25: {
                  probs: {
                    over: 0.59,
                    under: 0.41
                  }
                }
              }
            };
          },

        recordFn:
          (id, meta) =>
            recorded.push({
              id,
              meta
            })
      }
    );

  assert.equal(
    summary.assessmentRowsWritten,
    1
  );

  assert.equal(
    summary.assessmentRowsFromTeamFormFallback,
    1
  );

  assert.equal(
    summary.assessmentRowsFromCrossCompetitionFormFallback,
    1
  );

  assert.equal(
    recorded.length,
    1
  );

  assert.equal(
    recorded[0].meta.aiAssessment.inputSource,
    "canonical_fixture_cross_competition_team_form_fallback"
  );

  assert.equal(
    recorded[0]
      .meta
      .aiAssessment
      .model
      .crossCompetitionFormUsed,
    true
  );

  assert.equal(
    recorded[0]
      .meta
      .aiAssessment
      .model
      .minimumFormSamplePerSide,
    6
  );

  assert.equal(
    priceOptions.homeForm.sample,
    6
  );

  assert.equal(
    priceOptions.awayForm.sample,
    6
  );
});

test("cross-competition form still fails closed below six matches on either side", () => {
  const recorded = [];
  let priceCalls = 0;

  const summary =
    supplementCanonicalAssessments(
      "2026-08-14",
      {
        nowMs: NOW,

        canonicalFixtures: [{
          canonicalId:
            "cid_cross_form_short_sample_20260814",
          leagueSlug:
            "eng.fa",
          dayKey:
            "2026-08-14",
          homeTeam:
            "Crystal Palace",
          awayTeam:
            "Middlesbrough",
          kickoffUtc:
            "2026-08-14T18:00:00.000Z"
        }],

        readStandingsFn:
          () => ({ accepted: null }),

        resolveAliasesFn:
          (_slug, name) => [name],

        formFn:
          () => ({
            sample: 0,
            gfRate: null,
            gaRate: null,
            ppg: null
          }),

        crossFormFn:
          (_slug, name) => ({
            ok: true,
            sample:
              name === "Crystal Palace"
                ? 6
                : 5,
            gfRate: 1.4,
            gaRate: 1.0,
            ppg: 1.6,
            source:
              "cross_competition_form"
          }),

        xgFn:
          () => null,

        priceFn:
          () => {
            priceCalls++;

            return {
              model: {},
              markets: {
                OU25: {
                  probs: {
                    over: 0.5,
                    under: 0.5
                  }
                }
              }
            };
          },

        recordFn:
          (...args) =>
            recorded.push(args)
      }
    );

  assert.equal(
    summary.assessmentRowsWritten,
    0
  );

  assert.equal(
    summary.skippedInsufficientTeamEvidence,
    1
  );

  assert.equal(
    priceCalls,
    0
  );

  assert.equal(
    recorded.length,
    0
  );
});

test("ambiguous cross-competition identity remains fail closed and is audited", () => {
  const recorded = [];

  const summary =
    supplementCanonicalAssessments(
      "2026-08-14",
      {
        nowMs: NOW,

        canonicalFixtures: [{
          canonicalId:
            "cid_ambiguous_team_20260814",
          leagueSlug:
            "uefa.champions",
          dayKey:
            "2026-08-14",
          homeTeam:
            "Arsenal",
          awayTeam:
            "Away",
          kickoffUtc:
            "2026-08-14T18:00:00.000Z"
        }],

        readStandingsFn:
          () => ({ accepted: null }),

        resolveAliasesFn:
          (_slug, name) => [name],

        formFn:
          () => ({
            sample: 0,
            gfRate: null,
            gaRate: null,
            ppg: null
          }),

        crossFormFn:
          (_slug, name) =>
            name === "Arsenal"
              ? {
                  ok: false,
                  sample: 0,
                  reason:
                    "cross_country_identity_ambiguous"
                }
              : {
                  ok: true,
                  sample: 6,
                  gfRate: 1.2,
                  gaRate: 1.0,
                  ppg: 1.5
                },

        xgFn:
          () => null,

        priceFn:
          () => {
            throw new Error(
              "priceFn must not run"
            );
          },

        recordFn:
          (...args) =>
            recorded.push(args)
      }
    );

  assert.equal(
    summary.assessmentRowsWritten,
    0
  );

  assert.equal(
    summary.skippedCrossCompetitionAmbiguousIdentity,
    1
  );

  assert.equal(
    summary.skippedInsufficientTeamEvidence,
    1
  );

  assert.equal(
    recorded.length,
    0
  );
});
test("model evidence eligibility remains visible when pricing returns no markets", () => {
  const recorded = [];

  const canonicalId =
    "cid_evidence_eligible_empty_markets_20260814";

  const summary =
    supplementCanonicalAssessments(
      "2026-08-14",
      {
        nowMs: NOW,
        canonicalFixtures: [{
          canonicalId,
          leagueSlug: "test.1",
          leagueName: "Test League",
          dayKey: "2026-08-14",
          homeTeam: "Home",
          awayTeam: "Away",
          kickoffUtc:
            "2026-08-14T18:00:00.000Z"
        }],
        readStandingsFn: standings,
        resolveAliasesFn:
          (_slug, name) => [name],
        formFn: noRates,
        xgFn: noRates,
        priceFn: () => ({
          model: {
            source: "test_poisson"
          },
          markets: {}
        }),
        recordFn:
          (...args) => recorded.push(args)
      }
    );

  assert.equal(
    summary.eligibleUpcomingFixtures,
    1
  );
  assert.equal(
    summary.modelEvidenceEligibleFixtures,
    1
  );
  assert.deepEqual(
    summary.modelEvidenceEligibleFixtureIds,
    [canonicalId]
  );
  assert.equal(
    summary.assessmentRowsWritten,
    0
  );
  assert.deepEqual(
    summary.assessmentFixtureIds,
    []
  );
  assert.equal(
    summary.skippedEmptyAssessment,
    1
  );
  assert.deepEqual(
    summary.unassessedModelEvidenceEligibleFixtureIds,
    [canonicalId]
  );
  assert.equal(
    summary.unassessedModelEvidenceEligibleFixtures,
    1
  );
  assert.equal(
    summary.modelEvidenceUnavailableFixtures,
    0
  );
  assert.equal(
    summary.modelEvidenceCoverageOfUpcomingPct,
    100
  );
  assert.equal(
    summary.assessmentCoverageOfModelEvidencePct,
    0
  );
  assert.equal(
    recorded.length,
    0
  );
});
