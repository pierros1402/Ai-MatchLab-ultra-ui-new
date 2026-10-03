import test from "node:test";
import assert from "node:assert/strict";
import { applyProviderTeamContinuity } from "./prematch-provider-team-continuity.js";

const now = Date.parse("2026-10-02T11:00Z");
const history = () => ["2026-08-20", "2026-08-27"].map((day, i) => ({
  candidate: { providerMatchId: `result0${i}`, home: "Delta United", away: "Opponent", homeProviderTeamId: "x6F5TwDt", awayProviderTeamId: "other001" },
  row: { id: `cid_egy2_old_${day.replaceAll("-", "")}`, leagueSlug: "egy.2", dayKey: day,
    homeTeam: "Mega Sport", awayTeam: "Opponent", scoreHome: i, scoreAway: i }
}));
const anchor = () => ({
  candidate: { providerMatchId: "E7qIMIT0", leagueSlug: "egy.2", kickoffUtc: "2026-10-02T12:30Z",
    home: "Opponent", away: "Delta United", homeProviderTeamId: "other001", awayProviderTeamId: "x6F5TwDt" },
  canonical: { leagueSlug: "egy.2", kickoffUtc: "2026-10-02T12:30Z", homeTeam: "Opponent", awayTeam: "Delta United", providerIds: { flashscore: "E7qIMIT0" } }
});

test("two verified games on distinct days and an exact future anchor create a model-only name view", () => {
  const games = history(), anchors = [anchor()], before = JSON.stringify({ games, anchors });
  const result = applyProviderTeamContinuity(games, anchors, now);
  assert.equal(result.proofs.length, 1);
  assert.deepEqual(result.proofs[0].days, ["2026-08-20", "2026-08-27"]);
  for (const [i, row] of result.rows.entries()) {
    assert.equal(row.homeTeam, "Delta United");
    assert.equal(row.id, games[i].row.id);
    assert.equal(row.scoreHome, games[i].row.scoreHome);
    assert.equal(row.modelIdentityReadView.canonicalHomeTeam, "Mega Sport");
  }
  assert.equal(JSON.stringify({ games, anchors }), before);
});

test("missing, started, mismatched and conflicting anchors never establish continuity", () => {
  for (const mutate of [a => { a.canonical.homeTeam = "Other"; }, a => { a.canonical.providerIds.flashscore = "wrong001"; },
    a => { a.canonical.kickoffUtc = "2026-10-02T12:31Z"; }, a => { a.canonical.hasConflict = true; },
    a => { a.canonical.awayGlobalClubId = "managed_conflict"; }]) {
    const a = anchor(); mutate(a);
    assert.equal(applyProviderTeamContinuity(history(), [a], now).proofs.length, 0);
  }
  assert.equal(applyProviderTeamContinuity(history(), [], now).proofs.length, 0);
  assert.equal(applyProviderTeamContinuity(history(), [anchor()], now + 2 * 3600000).proofs.length, 0);
  const conflict = anchor(); conflict.candidate.awayProviderTeamId = "another1";
  assert.equal(applyProviderTeamContinuity(history(), [anchor(), conflict], now).proofs.length, 0);
});

test("single-game, same-day and ambiguous historic native identities are insufficient", () => {
  assert.equal(applyProviderTeamContinuity(history().slice(0, 1), [anchor()], now).proofs.length, 0);
  const sameDay = history(); sameDay[1].row.dayKey = sameDay[0].row.dayKey;
  assert.equal(applyProviderTeamContinuity(sameDay, [anchor()], now).proofs.length, 0);
  const conflict = history(); conflict[1].candidate.homeProviderTeamId = "another1";
  assert.equal(applyProviderTeamContinuity(conflict, [anchor()], now).proofs.length, 0);
});

test("a proved mapping never leaks to a third row with conflicting global identity", () => {
  const games = history();
  const conflicting = structuredClone(games[0]);
  conflicting.row.id = "cid_conflicting";
  conflicting.row.homeGlobalClubId = "different_global_id";
  conflicting.candidate.providerMatchId = "conflict";
  games.push(conflicting);
  const result = applyProviderTeamContinuity(games, [anchor()], now);
  assert.equal(result.proofs.length, 1);
  assert.equal(result.rows[2].homeTeam, "Mega Sport");
  assert.equal(result.rows[2].modelIdentityReadView, undefined);
});

test("an exact recent verified-final spelling sustains continuity after kickoff; raw history cannot", () => {
  const recent = { candidate: { ...history()[0].candidate, providerMatchId: "recent01" }, row: {
    ...history()[0].row, id: "cid_recent", homeTeam: "Delta United", dayKey: "2026-09-25", kickoff: "2026-09-25T13:30Z",
    source: "prematch_exact_verified_final", truthContract: { verifiedFinalTruth: true }
  } };
  assert.equal(applyProviderTeamContinuity([...history(), recent], [], now).proofs.length, 1);
  recent.row.truthContract.verifiedFinalTruth = false;
  assert.equal(applyProviderTeamContinuity([...history(), recent], [], now).proofs.length, 0);
});
