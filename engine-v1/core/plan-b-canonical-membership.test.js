import test from "node:test";
import assert from "node:assert/strict";

import {
  exactFixtureAliases,
  joinCanonicalFixturesWithModelAssessments,
  validatePicksAgainstCanonicalFixtures
} from "./plan-b-canonical-membership.js";

function assessment(overrides = {}) {
  return {
    matchId: "odds-1",
    canonicalId: "cid_fin1_hjk_ilves_20260701",
    leagueSlug: "fin.1",
    home: "HJK",
    away: "Ilves",
    dayKey: "2026-07-01",
    aiAssessment: {
      markets: {
        OU25: {
          probs: { over: 0.8, under: 0.2 }
        }
      }
    },
    ...overrides
  };
}

function canonical(overrides = {}) {
  return {
    canonicalId: "cid_fin1_hjk_ilves_20260701",
    matchId: "provider-1",
    sourceMatchId: "odds-1",
    leagueSlug: "fin.1",
    homeTeam: "HJK",
    awayTeam: "Ilves",
    dayKey: "2026-07-01",
    kickoffUtc: "2026-07-01T15:00:00.000Z",
    ...overrides
  };
}

test("exact aliases include canonical and provider identity without fuzzy matching", () => {
  const aliases = exactFixtureAliases(canonical());
  assert.deepEqual(
    new Set(aliases),
    new Set([
      "cid_fin1_hjk_ilves_20260701",
      "provider-1",
      "odds-1"
    ])
  );
});

test("Plan B joins assessment only through an exact canonical identity", () => {
  const result = joinCanonicalFixturesWithModelAssessments(
    [canonical()],
    [assessment()]
  );

  assert.deepEqual(result.summary, {
    canonicalFixtures: 1,
    assessmentRows: 1,
    joinedMatches: 1,
    orphanAssessmentRows: 0,
    canonicalRowsWithoutAssessment: 0,
    ambiguousCanonicalMatches: 0,
    canonicalRowsMissingIdentity: 0,
    ambiguousAssessmentAliases: 0
  });

  assert.equal(result.joinedMatches[0].canonicalId, "cid_fin1_hjk_ilves_20260701");
  assert.equal(result.joinedMatches[0].matchId, "provider-1");
  assert.equal(result.joinedMatches[0].home, "HJK");
  assert.equal(result.joinedMatches[0].away, "Ilves");
  assert.ok(result.joinedMatches[0].aiAssessment?.markets?.OU25);
});

test("odds-only assessment cannot create a Plan B fixture", () => {
  const result = joinCanonicalFixturesWithModelAssessments(
    [],
    [assessment()]
  );

  assert.equal(result.joinedMatches.length, 0);
  assert.equal(result.orphanAssessmentRows.length, 1);
  assert.equal(result.summary.orphanAssessmentRows, 1);
});

test("team-name equality without exact identity does not create membership", () => {
  const result = joinCanonicalFixturesWithModelAssessments(
    [canonical({ canonicalId: "cid_real", matchId: "provider-real", sourceMatchId: null })],
    [assessment({ canonicalId: "cid_phantom", matchId: "odds-phantom" })]
  );

  assert.equal(result.joinedMatches.length, 0);
  assert.equal(result.orphanAssessmentRows.length, 1);
  assert.equal(result.canonicalRowsWithoutAssessment.length, 1);
});

test("ambiguous assessment identity fails closed", () => {
  const result = joinCanonicalFixturesWithModelAssessments(
    [canonical()],
    [
      assessment({ matchId: "odds-1", canonicalId: "cid_first" }),
      assessment({ matchId: "odds-1", canonicalId: "cid_second" })
    ]
  );

  assert.equal(result.joinedMatches.length, 0);
  assert.equal(result.ambiguousCanonicalMatches.length, 1);
  assert.equal(result.summary.ambiguousAssessmentAliases, 1);
});

test("published Plan B picks must resolve to the canonical day universe", () => {
  const valid = {
    canonicalId: "cid_fin1_hjk_ilves_20260701",
    market: "OU25",
    pick: "over"
  };

  const orphan = {
    canonicalId: "cid_chn1_wuhanthreetowns_shandongtaishan_20260721",
    market: "BTTS",
    pick: "yes"
  };

  const result = validatePicksAgainstCanonicalFixtures(
    [valid, orphan],
    [canonical()]
  );

  assert.equal(result.ok, false);
  assert.equal(result.validPicks.length, 1);
  assert.equal(result.orphanPicks.length, 1);
  assert.equal(result.orphanPicks[0], orphan);
});
