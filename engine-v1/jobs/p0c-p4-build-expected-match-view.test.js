import test from "node:test";
import assert from "node:assert/strict";

import {
  P0C_P4_EXPECTED_MATCH_VIEW_SCHEMA,
  buildP0CP4ExpectedMatchView,
  buildP0CP4ExpectedMatchViewFromExisting,
} from "./p0c-p4-build-expected-match-view.js";

const DAY =
  "2026-05-02";

const RECORDED_AT =
  "2026-05-02T04:30:00.000Z";

function fixturesAll() {
  return {
    schema: "fixtures-snapshot-v1",
    matches: [
      {
        canonicalId:
          "cid_alpha_beta_20260502",
        id:
          "legacy_alpha_beta",
        dayKey:
          DAY,
        home:
          "Alpha",
        away:
          "Beta",
        leagueSlug:
          "test.1",
        leagueName:
          "Test League",
        kickoffUtc:
          "2026-05-02T12:00:00.000Z",
      },
      {
        id:
          "cid_gamma_delta_20260502",
        dayKey:
          DAY,
        homeTeam:
          "Gamma",
        awayTeam:
          "Delta",
        competition:
          "Other League",
        kickoffLocal:
          "2026-05-02T15:00:00.000Z",
      },
      {
        id:
          "other-day",
        dayKey:
          "2026-05-03",
        home:
          "Other",
        away:
          "Day",
      },
      {
        id:
          "missing-away",
        dayKey:
          DAY,
        home:
          "Incomplete",
      },
    ],
  };
}

test("publishes the source-bound expected-match schema", () => {
  assert.equal(
    P0C_P4_EXPECTED_MATCH_VIEW_SCHEMA,
    "ai-matchlab.p0c-p4-expected-match-view.v1",
  );
});

test("builds the exact expected-match projection for one day", () => {
  const result =
    buildP0CP4ExpectedMatchView({
      dayKey: DAY,
      fixturesAll: fixturesAll(),
      recordedAt: RECORDED_AT,
    });

  assert.deepEqual(result, {
    schema:
      "ai-matchlab.p0c-p4-expected-match-view.v1",
    dayKey:
      DAY,
    recordedAt:
      RECORDED_AT,
    source:
      "fixtures-all",
    matchCount:
      2,
    matches: [
      {
        matchId:
          "cid_alpha_beta_20260502",
        home:
          "Alpha",
        away:
          "Beta",
        leagueSlug:
          "test.1",
        leagueName:
          "Test League",
        kickoffUtc:
          "2026-05-02T12:00:00.000Z",
      },
      {
        matchId:
          "cid_gamma_delta_20260502",
        home:
          "Gamma",
        away:
          "Delta",
        leagueSlug:
          "",
        leagueName:
          "Other League",
        kickoffUtc:
          "2026-05-02T15:00:00.000Z",
      },
    ],
  });
});

test("prefers canonicalId over legacy id and matchId", () => {
  const result =
    buildP0CP4ExpectedMatchView({
      dayKey: DAY,
      fixturesAll: {
        matches: [
          {
            canonicalId: "canonical",
            id: "legacy-id",
            matchId: "legacy-match-id",
            dayKey: DAY,
            home: "A",
            away: "B",
          },
        ],
      },
      recordedAt: RECORDED_AT,
    });

  assert.equal(
    result.matches[0].matchId,
    "canonical",
  );
});

test("preserves input order without mutating fixtures-all", () => {
  const input =
    fixturesAll();
  const before =
    JSON.stringify(input);

  const first =
    buildP0CP4ExpectedMatchView({
      dayKey: DAY,
      fixturesAll: input,
      recordedAt: RECORDED_AT,
    });
  const second =
    buildP0CP4ExpectedMatchView({
      dayKey: DAY,
      fixturesAll: input,
      recordedAt: RECORDED_AT,
    });

  assert.deepEqual(first, second);
  assert.equal(
    JSON.stringify(input),
    before,
  );
  assert.equal(
    first.matches[0].home,
    "Alpha",
  );
  assert.equal(
    first.matches[1].home,
    "Gamma",
  );
});

test("rebuilds from an existing artifact while preserving record metadata", () => {
  const result =
    buildP0CP4ExpectedMatchViewFromExisting({
      dayKey: DAY,
      fixturesAll: fixturesAll(),
      existingArtifact: {
        dayKey: DAY,
        recordedAt: RECORDED_AT,
        source: "fixtures-all",
        matchCount: 99,
        matches: [],
      },
    });

  assert.equal(
    result.recordedAt,
    RECORDED_AT,
  );
  assert.equal(
    result.source,
    "fixtures-all",
  );
  assert.equal(
    result.matchCount,
    2,
  );
});

test("rejects invalid day, timestamp and fixtures-all inputs", () => {
  assert.throws(
    () => buildP0CP4ExpectedMatchView({
      dayKey: "2026-5-2",
      fixturesAll: fixturesAll(),
      recordedAt: RECORDED_AT,
    }),
    /day_key_invalid/,
  );

  assert.throws(
    () => buildP0CP4ExpectedMatchView({
      dayKey: DAY,
      fixturesAll: fixturesAll(),
      recordedAt: "not-a-date",
    }),
    /recorded_at_invalid/,
  );

  assert.throws(
    () => buildP0CP4ExpectedMatchView({
      dayKey: DAY,
      fixturesAll: {},
      recordedAt: RECORDED_AT,
    }),
    /fixtures_all_invalid/,
  );
});

test("rejects duplicate resolved match identities", () => {
  assert.throws(
    () => buildP0CP4ExpectedMatchView({
      dayKey: DAY,
      fixturesAll: {
        matches: [
          {
            id: "duplicate",
            dayKey: DAY,
            home: "A",
            away: "B",
          },
          {
            matchId: "duplicate",
            dayKey: DAY,
            home: "C",
            away: "D",
          },
        ],
      },
      recordedAt: RECORDED_AT,
    }),
    /duplicate_id:duplicate/,
  );
});

test("rejects missing existing-artifact metadata and day drift", () => {
  assert.throws(
    () => buildP0CP4ExpectedMatchViewFromExisting({
      dayKey: DAY,
      fixturesAll: fixturesAll(),
      existingArtifact: null,
    }),
    /existing_artifact_invalid/,
  );

  assert.throws(
    () => buildP0CP4ExpectedMatchViewFromExisting({
      dayKey: DAY,
      fixturesAll: fixturesAll(),
      existingArtifact: {
        dayKey: "2026-05-03",
        recordedAt: RECORDED_AT,
      },
    }),
    /existing_day_mismatch/,
  );
});
