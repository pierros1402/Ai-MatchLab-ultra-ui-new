import test from "node:test";
import assert from "node:assert/strict";
import { validatePrematchFinalForm, collectPrematchFinalForm } from "./prematch-verified-final-form.js";

const now = Date.parse("2026-10-01T20:00Z");
const canonical = { canonicalId: "cid_egy2_a_b_20260917", dayKey: "2026-09-17", leagueSlug: "egy.2", homeTeam: "A", awayTeam: "B",
  kickoffUtc: "2026-09-17T13:30Z", status: "FT", scoreHome: 1, scoreAway: 2, source: "flashscore", sourceMatchId: "abcd1234", providerIds: { flashscore: "abcd1234" } };
const candidate = { providerMatchId: "abcd1234", leagueSlug: "egy.2", kickoffUtc: canonical.kickoffUtc, scoreHome: 1, scoreAway: 2 };
const final = { schema: "ai-matchlab.verified-final-result.v1", verifiedFinalTruth: true, matchId: canonical.canonicalId, dayKey: canonical.dayKey,
  leagueSlug: "egy.2", homeTeam: "A", awayTeam: "B", kickoffUtc: canonical.kickoffUtc, scoreHome: 1, scoreAway: 2,
  verdict: "verified_final_result", finalTruthVerdict: "verified_final_result", generatedAt: "2026-09-17T19:00Z" };

test("a missing model-history row requires committed exact canonical and verified-final parity", () => {
  const result = validatePrematchFinalForm(candidate, canonical, final, now);
  assert.equal(result.ok, true);
  assert.equal(result.row.id, canonical.canonicalId);
  assert.equal(result.row.truthContract.exactScoreParity, true);
  assert.equal(validatePrematchFinalForm(candidate, canonical, null, now).ok, false);
  assert.equal(validatePrematchFinalForm(candidate, canonical, { ...final, verifiedFinalTruth: false }, now).ok, false);
  assert.equal(validatePrematchFinalForm(candidate, canonical, { ...final, homeTeam: "A FC" }, now).reason, "EXACT_FINAL_METADATA_MISMATCH");
  assert.equal(validatePrematchFinalForm(candidate, { ...canonical, scoreHome: 3 }, final, now).ok, false);
  assert.equal(validatePrematchFinalForm(candidate, canonical, { ...final, homeScore: 3 }, now).ok, false);
  assert.equal(validatePrematchFinalForm({ ...candidate, scoreHome: 3 }, canonical, final, now).ok, false);
  assert.equal(validatePrematchFinalForm(candidate, { ...canonical, sourceMatchId: "other123" }, final, now).ok, false);
  assert.equal(validatePrematchFinalForm(candidate, canonical, { ...final, homeGlobalClubId: "other" }, now).ok, false);
  assert.equal(validatePrematchFinalForm(candidate, canonical, { ...final, generatedAt: "2026-10-02T20:00Z" }, now).reason, "FINAL_AVAILABILITY_UNCONFIRMED");
  assert.equal(validatePrematchFinalForm(candidate, { ...canonical, status: "PEN" }, final, now).ok, false);
  assert.equal(validatePrematchFinalForm(candidate, { ...canonical, status: "STATUS_POSTPONED" }, final, now).ok, false);
});

test("final bridge deduplicates indexed games and rejects ambiguous provider identity without writing history", () => {
  const deps = { fixturesForDay: () => [canonical], finalForFixture: () => final };
  const input = JSON.stringify({ canonical, final, candidate });
  const result = collectPrematchFinalForm({}, [candidate, candidate], now, deps);
  assert.equal(result.summary.accepted, 1);
  assert.equal(result.index.A.matches.length, 1);
  assert.equal(result.index.B.matches.length, 1);
  const repeated = collectPrematchFinalForm(result.index, [candidate], now, deps);
  assert.equal(repeated.summary.accepted, 0);
  assert.equal(repeated.summary.alreadyIndexed, 1);
  const ambiguous = collectPrematchFinalForm({}, [candidate], now, { ...deps, fixturesForDay: () => [canonical, { ...canonical, canonicalId: "cid_duplicate" }] });
  assert.equal(ambiguous.summary.accepted, 0);
  assert.equal(ambiguous.summary.rejected.CANONICAL_PROVIDER_ID_NOT_UNIQUE, 1);
  assert.equal(JSON.stringify({ canonical, final, candidate }), input);
});
