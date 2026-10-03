import test from "node:test";
import assert from "node:assert/strict";
import { verifiedFormRates, verifiedHistoryResultDocuments, mergeVerifiedFormIndexes, verifiedNationalForm, filterPrematchCompetitionContradictions } from "./prematch-verified-form.js";
import { createCrossCompetitionFormResolver } from "../storage/cross-competition-form-db.js";

test("explicit lower-division history cannot masquerade as eng.1 form, even with valid file fingerprints", () => {
  const bad = { id: "cid_eng1_dartford_brentwood_20260811", leagueSlug: "eng.1", leagueName: "Isthmian League Premier Division",
    homeTeam: "Dartford", awayTeam: "Brentwood", kickoffUtc: "2026-08-11T18:45Z", status: "FT", scoreHome: 1, scoreAway: 0 };
  const good = { ...bad, id: "cid_engfa_valid", leagueSlug: "eng.fa", leagueName: "FA Cup" };
  const premier = { ...bad, id: "cid_eng1_valid", leagueName: "Premier League", homeTeam: "Arsenal", awayTeam: "Chelsea" };
  const input = { Brentwood: { matches: [bad, good] }, Dartford: { matches: [bad, good] }, Arsenal: { matches: [premier] } };
  const before = JSON.stringify(input);
  const checked = filterPrematchCompetitionContradictions(input);
  assert.equal(checked.summary.excludedMatches, 1, "opponent perspectives are not separate incidents");
  assert.equal(checked.summary.historicalFilesChanged, false);
  assert.equal(checked.index.Arsenal.matches.length, 1);
  assert.equal(verifiedFormRates(checked.index, "eng.1", "Brentwood", Date.parse("2026-10-03T00:00Z")).sample, 0);
  assert.equal(verifiedHistoryResultDocuments(checked.index, Date.parse("2026-10-03T00:00Z")).find(x => x.slug === "eng.fa").doc.teams.Brentwood.length, 1);
  for (const leagueName of ["Southern League Premier Central", "Southern League Premier South"]) {
    assert.equal(filterPrematchCompetitionContradictions({ T: { matches: [{ ...bad, leagueName }] } }).summary.excludedMatches, 1);
  }
  assert.equal(JSON.stringify(input), before);
});

test("early form excludes future results, other competitions and ambiguous team names", () => {
  const row = { homeTeam: "Exact", awayTeam: "Opponent", leagueSlug: "egy.2", status: "FT", scoreHome: 2, scoreAway: 1, kickoffUtc: "2026-09-30T12:00:00Z" };
  const index = { Exact: { matches: [row, { ...row, leagueSlug: "egy.1" },
    { ...row, kickoffUtc: "2026-10-02T12:00:00Z" }, { ...row, homeTeam: "Other" }] } };
  assert.deepEqual(verifiedFormRates(index, "egy.2", "Exact", Date.parse("2026-10-01T00:00:00Z")),
    { sample: 1, gfRate: 2, gaRate: 1, ppg: 3 });
  assert.equal(verifiedFormRates(index, "egy.2", "exact", Date.parse("2026-10-01T00:00:00Z")).sample, 0);
});

test("national form uses only national competition history and preserves the identity veto", () => {
  const row = { id: "n1", homeTeam: "Greece", awayTeam: "Opponent", leagueSlug: "fifa.world", status: "FT", scoreHome: 2, scoreAway: 0, kickoffUtc: "2026-06-20T12:00:00Z", homeGlobalClubId: "nation1" };
  const index = { Greece: { matches: [row, { ...row, id: "club", leagueSlug: "eng.1" }, { ...row, id: "n2", leagueSlug: "uefa.nations", kickoffUtc: "2026-09-20T12:00:00Z" }] } };
  const now = Date.parse("2026-10-01T00:00:00Z");
  assert.equal(verifiedNationalForm(index, "uefa.nations", "Greece", now).sample, 2);
  assert.equal(verifiedNationalForm(index, "eng.fa", "Greece", now), null);
  index.Greece.matches[2].homeGlobalClubId = "nation2";
  assert.equal(verifiedNationalForm(index, "uefa.nations", "Greece", now).reason, "global_club_id_conflict");
});

test("recent form crosses the season boundary, deduplicates truth and rejects stale results", () => {
  const row = { id: "same", homeTeam: "Exact", awayTeam: "Opponent", leagueSlug: "eng.3", status: "FT", scoreHome: 1, scoreAway: 0, kickoffUtc: "2026-07-31T12:00:00Z" };
  const merged = mergeVerifiedFormIndexes([{ Exact: { matches: [row] } }, { Exact: { matches: [row, { ...row, id: "old", kickoffUtc: "2025-12-31T12:00:00Z" }] } }]);
  assert.equal(verifiedFormRates(merged, "eng.3", "Exact", Date.parse("2026-10-01T00:00:00Z")).sample, 1);
});

test("cup form consumes verified prior domestic results with identity veto and cutoff preserved", () => {
  const rows = Array.from({ length: 6 }, (_, i) => ({ homeTeam: "Exact", awayTeam: "Opponent", leagueSlug: "eng.3", status: "FT", scoreHome: 2, scoreAway: 1, kickoffUtc: `2026-09-${String(20 + i).padStart(2, "0")}T12:00:00Z`, matchId: `m${i}`, homeGlobalClubId: "club1" }));
  rows.push({ ...rows[0], matchId: "future", kickoffUtc: "2026-10-02T12:00:00Z" });
  const docs = verifiedHistoryResultDocuments({ Exact: { matches: rows } }, Date.parse("2026-10-01T00:00:00Z"));
  const options = { coverageRows: [{ slug: "eng.3", country: "England", type: "league" }, { slug: "eng.fa", country: "England", type: "cup" }], canonicalResolver: x => x, resultDocuments: docs };
  assert.equal(createCrossCompetitionFormResolver(options)("eng.fa", "Exact").sample, 6);
  assert.equal(createCrossCompetitionFormResolver(options)("eng.fa", "Other").sample, 0);
  docs[0].doc.teams.Exact[0].homeGlobalClubId = "club2";
  assert.equal(createCrossCompetitionFormResolver(options)("eng.fa", "Exact").reason, "global_club_id_conflict");
});
