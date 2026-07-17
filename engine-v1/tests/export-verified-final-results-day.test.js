import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCanonicalEspnVerifiedFinalResult,
  resolveCanonicalEspnFinalFallback
} from "../jobs/export-verified-final-results-day.js";

const dayKey = "2026-07-17";

function validTarget(overrides = {}) {
  const canonicalFixture = {
    canonicalId: "cid_ecu1_aucas_independientedelvalle_20260717",
    matchId: "401859617",
    sourceMatchId: "401859617",
    sourceId: "401859617",
    source: "espn",
    leagueSlug: "ecu.1",
    leagueName: "LigaPro Ecuador",
    dayKey,
    kickoffUtc: "2026-07-16T21:30Z",
    homeTeam: "Aucas",
    awayTeam: "Independiente del Valle",
    scoreHome: 0,
    scoreAway: 3,
    status: "FT",
    rawStatus: "STATUS_FULL_TIME",
    statusType: "STATUS_FINAL",
    lastSeenAt: "2026-07-17T00:12:04.625Z",
    ...overrides
  };

  return {
    matchId: canonicalFixture.canonicalId,
    leagueSlug: "ecu.1",
    leagueName: "LigaPro Ecuador",
    country: "Ecuador",
    homeTeam: "Aucas",
    awayTeam: "Independiente del Valle",
    kickoffUtc: canonicalFixture.kickoffUtc,
    canonicalFixture
  };
}

test("accepts only an explicit canonical ESPN terminal final", () => {
  const target = validTarget();
  const resolved = resolveCanonicalEspnFinalFallback(target, dayKey);

  assert.equal(resolved.ok, true);
  assert.equal(resolved.providerMatchId, "401859617");
  assert.equal(resolved.scoreKey, "0-3");
  assert.equal(
    resolved.observedAt,
    "2026-07-17T00:12:04.625Z"
  );
});

test("rejects a non-ESPN canonical source", () => {
  const target = validTarget({ source: "flashscore" });
  const resolved = resolveCanonicalEspnFinalFallback(target, dayKey);

  assert.deepEqual(resolved, {
    ok: false,
    reason: "canonical_source_not_espn",
    source: "flashscore"
  });
});

test("rejects inferred FT without explicit provider terminal status", () => {
  const target = validTarget({
    status: "FT",
    rawStatus: "STATUS_SCHEDULED",
    statusType: "",
    operationalState: ""
  });

  const resolved = resolveCanonicalEspnFinalFallback(target, dayKey);

  assert.equal(resolved.ok, false);
  assert.equal(
    resolved.reason,
    "canonical_espn_not_explicit_terminal"
  );
});

test("rejects provider terminal evidence when canonical status is not terminal", () => {
  const target = validTarget({
    status: "SCHEDULED",
    rawStatus: "STATUS_FULL_TIME",
    statusType: "STATUS_FINAL"
  });

  const resolved = resolveCanonicalEspnFinalFallback(target, dayKey);

  assert.equal(resolved.ok, false);
  assert.equal(
    resolved.reason,
    "canonical_espn_status_not_terminal"
  );
});

test("rejects invalid or missing final score", () => {
  const target = validTarget({ scoreAway: null });
  const resolved = resolveCanonicalEspnFinalFallback(target, dayKey);

  assert.equal(resolved.ok, false);
  assert.equal(
    resolved.reason,
    "canonical_espn_final_score_invalid"
  );
});

test("rejects a fixture outside the requested Athens day", () => {
  const target = validTarget({
    dayKey: "2026-07-16",
    kickoffUtc: "2026-07-16T18:00Z"
  });

  const resolved = resolveCanonicalEspnFinalFallback(target, dayKey);

  assert.equal(resolved.ok, false);
  assert.equal(
    resolved.reason,
    "canonical_espn_day_key_mismatch"
  );
});

test("builds a settlement-compatible artifact with explicit provenance", () => {
  const target = validTarget();
  const resolved = resolveCanonicalEspnFinalFallback(target, dayKey);
  const payload = buildCanonicalEspnVerifiedFinalResult(
    dayKey,
    target,
    resolved
  );

  assert.equal(payload.schema, "ai-matchlab.verified-final-result.v1");
  assert.equal(payload.verifiedFinalTruth, true);
  assert.equal(payload.matchId, target.matchId);
  assert.equal(payload.scoreKey, "0-3");
  assert.equal(payload.source, "canonical_espn_terminal_final");
  assert.equal(payload.sources.length, 1);
  assert.equal(payload.sources[0].provider, "espn");
  assert.equal(payload.sources[0].providerMatchId, "401859617");
  assert.equal(
    payload.verification.method,
    "canonical_espn_terminal_final"
  );
  assert.equal(
    payload.verification.authority,
    "canonical_fixture_store"
  );
  assert.equal(
    payload.verification.checks.flashscoreFinishedMatchAbsent,
    true
  );
  assert.equal(
    payload.settlement.finalTruthVerdict,
    "verified_final_result"
  );
});
