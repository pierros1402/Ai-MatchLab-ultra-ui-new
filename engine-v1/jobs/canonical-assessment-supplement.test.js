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
