import assert from "node:assert/strict";
import test from "node:test";

import { buildLegacyVerifiedHistoryDay } from "./rebuild-legacy-history-from-verified-finals.js";

const DAY = "2026-07-29";
function finalRow(overrides = {}) {
  return {
    verifiedFinalTruth: true,
    finalTruthVerdict: "verified_final_result",
    verdict: "verified_final_result",
    dayKey: DAY,
    date: DAY,
    matchId: "cid_a",
    leagueSlug: "test.1",
    leagueName: "Test",
    kickoffUtc: "2026-07-29T18:00:00Z",
    homeTeam: "Home",
    awayTeam: "Away",
    homeScore: 2,
    awayScore: 1,
    scoreHome: 2,
    scoreAway: 1,
    finalScore: { homeScore: 2, awayScore: 1, scoreKey: "2-1" },
    source: "test",
    ...overrides,
  };
}

const unmanagedResolver = { resolveFixtureId: () => ({ ok: false, status: "UNKNOWN" }) };

test("legacy builder accepts strict verified-final truth without canonical store", () => {
  const result = buildLegacyVerifiedHistoryDay({ dayKey: DAY, finalResultRows: [finalRow()], resolver: unmanagedResolver, rebuiltAt: 1 });
  assert.equal(result.ok, true);
  assert.equal(result.acceptedRows, 1);
  assert.equal(result.rows[0].truthContract.canonicalStoreUnavailableForDay, true);
});

test("legacy builder rejects null score", () => {
  const result = buildLegacyVerifiedHistoryDay({ dayKey: DAY, finalResultRows: [finalRow({ homeScore: null, scoreHome: null, finalScore: { homeScore: null, awayScore: 1 } })], resolver: unmanagedResolver });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.reason === "verified_final_numeric_score_required"));
});

test("legacy builder rejects unresolved suppressed identity alias", () => {
  const resolver = { resolveFixtureId: id => ({ ok: true, sourceRole: "suppressed_lineage_alias", resolvedFixtureId: "cid_retained", sourceFixtureId: id }) };
  const result = buildLegacyVerifiedHistoryDay({ dayKey: DAY, finalResultRows: [finalRow()], resolver });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.reason === "suppressed_verified_final_alias_not_reconciled"));
});

test("legacy builder rejects semantic duplicate instead of silently merging", () => {
  const result = buildLegacyVerifiedHistoryDay({
    dayKey: DAY,
    resolver: unmanagedResolver,
    finalResultRows: [
      finalRow(),
      finalRow({ matchId: "cid_b", homeTeam: "Home FC", awayTeam: "Away FC", kickoffUtc: "2026-07-29T18:01:00Z" }),
    ],
  });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some(error => error.reason === "legacy_semantic_duplicate_not_reconciled"));
});
