import test from "node:test";
import assert from "node:assert/strict";
import { validatePrematchFinalForm, collectPrematchFinalForm, selectPrematchResearchEvidence } from "./prematch-verified-final-form.js";
import { mergeVerifiedFormIndexes } from "./prematch-verified-form.js";

const now = Date.parse("2026-10-01T20:00Z");
const canonical = { canonicalId: "cid_egy2_a_b_20260917", dayKey: "2026-09-17", leagueSlug: "egy.2", homeTeam: "A", awayTeam: "B",
  kickoffUtc: "2026-09-17T13:30Z", status: "FT", scoreHome: 1, scoreAway: 2, source: "flashscore", sourceMatchId: "abcd1234", providerIds: { flashscore: "abcd1234" } };
const candidate = { providerMatchId: "abcd1234", leagueSlug: "egy.2", kickoffUtc: canonical.kickoffUtc, scoreHome: 1, scoreAway: 2 };
const final = { schema: "ai-matchlab.verified-final-result.v1", verifiedFinalTruth: true, matchId: canonical.canonicalId, dayKey: canonical.dayKey,
  leagueSlug: "egy.2", homeTeam: "A", awayTeam: "B", kickoffUtc: canonical.kickoffUtc, scoreHome: 1, scoreAway: 2,
  verdict: "verified_final_result", finalTruthVerdict: "verified_final_result", generatedAt: "2026-09-17T19:00Z" };

test("dated native evidence survives provider pagination while conflicting, future and stale evidence is rejected", () => {
  const old = { schema: "ai-matchlab.recent-results-research.v1", source: "flashscore", status: "RESULTS_AWAIT_IDENTITY_VALIDATION",
    leagueSlug: "egy.2", acquiredAt: "2026-09-25T12:00Z", rows: [{ ...candidate, homeProviderTeamId: "native01", awayProviderTeamId: "native02" }] };
  const fresh = { ...old, acquiredAt: "2026-10-01T12:00Z", rows: [{ ...old.rows[0], providerMatchId: "fresh001" }] };
  assert.equal(selectPrematchResearchEvidence([fresh, old], now).candidates.length, 2);
  const conflict = { ...fresh, rows: [{ ...old.rows[0], homeProviderTeamId: "conflict" }] };
  const denied = selectPrematchResearchEvidence([old, conflict], now);
  assert.equal(denied.candidates.length, 0);
  assert.deepEqual(denied.identityConflicts, ["egy.2|abcd1234"]);
  assert.equal(selectPrematchResearchEvidence([{ ...old, acquiredAt: "2026-10-02T12:00Z" }, { ...old, acquiredAt: "2025-10-01T12:00Z" }], now).candidates.length, 0);
});

test("a missing model-history row requires committed exact canonical and verified-final parity", () => {
  const result = validatePrematchFinalForm(candidate, canonical, final, now);
  assert.equal(result.ok, true);
  assert.equal(result.row.id, canonical.canonicalId);
  assert.equal(result.row.truthContract.exactScoreParity, true);
  assert.equal(validatePrematchFinalForm(candidate, { ...canonical, rawStatus: "STATUS_FULL_TIME" }, final, now).ok, true);
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

test("continuity replaces existing old-name model rows once while preserving canonical and final truth", () => {
  const canonicals = [17, 24].map(day => ({ ...canonical, canonicalId: `cid_old_${day}`, dayKey: `2026-09-${day}`,
    kickoffUtc: `2026-09-${day}T13:30Z`, homeTeam: "Mega Sport", sourceMatchId: `result${day}`, providerIds: { flashscore: `result${day}` } }));
  const finals = canonicals.map(c => ({ ...final, matchId: c.canonicalId, dayKey: c.dayKey, homeTeam: c.homeTeam,
    kickoffUtc: c.kickoffUtc, generatedAt: `${c.dayKey}T19:00Z` }));
  const candidates = canonicals.map(c => ({ ...candidate, providerMatchId: c.sourceMatchId, kickoffUtc: c.kickoffUtc,
    home: "Delta United", away: "B", homeProviderTeamId: "x6F5TwDt", awayProviderTeamId: "other001" }));
  const anchor = { providerMatchId: "future01", leagueSlug: "egy.2", kickoffUtc: "2026-10-02T12:30Z", home: "Delta United", away: "B",
    homeProviderTeamId: "x6F5TwDt", awayProviderTeamId: "other001" };
  const upcoming = { ...canonical, canonicalId: "cid_upcoming", homeTeam: "Delta United", kickoffUtc: anchor.kickoffUtc,
    sourceMatchId: anchor.providerMatchId, providerIds: { flashscore: anchor.providerMatchId } };
  const deps = { fixturesForDay: () => [...canonicals, upcoming], finalForFixture: (_, id) => finals.find(f => f.matchId === id) };
  const base = collectPrematchFinalForm({}, candidates, now, deps).index;
  const before = JSON.stringify({ base, canonicals, finals });
  const result = collectPrematchFinalForm(base, candidates, now, { ...deps, anchors: [anchor] });
  assert.equal(result.summary.identityReadViewRows, 2);
  assert.equal(result.summary.teamContinuity.length, 1);
  const replaced = new Set(result.replacedCanonicalIds);
  const retained = Object.fromEntries(Object.entries(base).map(([name, entry]) => [name, {
    ...entry, matches: entry.matches.filter(row => !replaced.has(row.id))
  }]));
  const merged = mergeVerifiedFormIndexes([retained, result.index]);
  assert.equal(merged["Delta United"].matches.length, 2);
  assert.equal(merged.B.matches.length, 2);
  assert.equal(merged["Mega Sport"].matches.length, 0);
  assert.equal(JSON.stringify({ base, canonicals, finals }), before);
  const ambiguous = collectPrematchFinalForm(base, candidates, now, { ...deps, anchors: [anchor],
    fixturesForDay: () => [...canonicals, upcoming, { ...upcoming, canonicalId: "cid_duplicate_future" }] });
  assert.equal(ambiguous.summary.identityReadViewRows, 0);
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
  const conflictingIndex = structuredClone(result.index);
  for (const entry of Object.values(conflictingIndex)) entry.matches[0].scoreHome = 9;
  assert.throws(() => collectPrematchFinalForm(conflictingIndex, [candidate], now, deps), /index_score_conflict/);
  const ambiguous = collectPrematchFinalForm({}, [candidate], now, { ...deps, fixturesForDay: () => [canonical, { ...canonical, canonicalId: "cid_duplicate" }] });
  assert.equal(ambiguous.summary.accepted, 0);
  assert.equal(ambiguous.summary.rejected.CANONICAL_PROVIDER_ID_NOT_UNIQUE, 1);
  assert.equal(JSON.stringify({ canonical, final, candidate }), input);
});
