import test from "node:test";
import assert from "node:assert/strict";
import {
  buildRecoveredOddsMatches,
  reconcileOddsSnapshotCoverageDay
} from "./reconcile-odds-snapshot-coverage-day.js";

const day = "2026-11-20";
const make = (id, p = 0.55) => ({
  canonicalId: id,
  matchId: id,
  providerIds: { espn: id },
  leagueSlug: "test.1",
  dayKey: day,
  home: "Home " + id,
  away: "Away " + id,
  kickoffUtc: "2026-11-20T18:00:00.000Z",
  aiAssessment: p === null ? null : {
    model: { source: "verified_model" },
    markets: { OU25: { probs: { over: p, under: 1 - p } } }
  }
});
const fixture = row => ({ ...row, aiAssessment: null });

test("reconciler preserves only exact independently certified assessments", () => {
  const old = make("old");
  const fresh = make("new", 0.61);
  const result = buildRecoveredOddsMatches({
    canonical: [fixture(old), fixture(fresh)],
    existingMatches: [old],
    candidateMatches: [make("old", null), make("new", null)],
    currentRunAssessments: [fresh],
    requiredIds: ["old", "new"]
  });
  assert.equal(result.ok, true);
  assert.equal(result.restored, 2);
  assert.equal(result.matches.length, 2);
  assert.deepEqual(result.matches[0].aiAssessment, old.aiAssessment);
  assert.deepEqual(result.matches[1].aiAssessment, fresh.aiAssessment);
});

test("reconciler keeps newer verified assessment instead of overwriting", () => {
  const old = make("old", 0.55);
  const newer = make("old", 0.65);
  const result = buildRecoveredOddsMatches({
    canonical: [fixture(old)],
    existingMatches: [old],
    candidateMatches: [newer],
    currentRunAssessments: [],
    requiredIds: ["old"]
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.matches[0].aiAssessment, newer.aiAssessment);
});

test("reconciler fails closed on required fixture without any real model", () => {
  const old = make("old");
  const newcomer = make("new", null);
  const result = buildRecoveredOddsMatches({
    canonical: [fixture(old), fixture(newcomer)],
    existingMatches: [old],
    candidateMatches: [old, newcomer],
    requiredIds: ["old", "new"]
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "required_assessment_still_missing");
  assert.deepEqual(result.missingRequiredFixtureIds, ["new"]);
});

test("reconciler refuses conflicting fixture identity and never writes", () => {
  const old = make("old");
  const conflicting = { ...make("old", null), providerIds: { espn: "different" } };
  let writes = 0;
  const result = reconcileOddsSnapshotCoverageDay(day, {
    getCanonical: () => [fixture(old)],
    getCandidate: () => [conflicting],
    readExisting: () => ({ date: day, matches: [old] }),
    write: () => { writes++; },
    currentRunAssessments: [],
    requiredIds: ["old"]
  });
  assert.equal(result.ok, false);
  assert.equal(writes, 0);
});

test("reconciler writes exactly one validated derived odds artifact", () => {
  const old = make("old");
  const fresh = make("new", 0.62);
  const existing = { ok: true, date: day, hash: "prior", matches: [old] };
  const writes = [];
  const result = reconcileOddsSnapshotCoverageDay(day, {
    getCanonical: () => [fixture(old), fixture(fresh)],
    getCandidate: () => [old, make("new", null)],
    readExisting: () => existing,
    write: (key, payload) => writes.push({ key, payload }),
    currentRunAssessments: [fresh],
    requiredIds: ["old", "new"]
  });
  assert.equal(result.ok, true);
  assert.equal(result.changed, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].key, day);
  assert.equal(writes[0].payload.assessmentRows, 2);
  assert.equal(writes[0].payload.date, day);
});
