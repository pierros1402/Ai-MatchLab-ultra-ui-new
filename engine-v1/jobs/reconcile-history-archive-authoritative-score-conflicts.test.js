import assert from "node:assert/strict";
import test from "node:test";
import {
  findArchiveScoreConflicts,
  resolveAuthoritativeScoreForConflict,
} from "./reconcile-history-archive-authoritative-score-conflicts.js";

const t = Date.parse("2026-08-08T17:00:00.000Z");
const conflict = {
  pair: "can.1|atleticoottawa|hfxwanderers",
  slug: "can.1",
  kickoffMs: t,
  scores: [],
};

function finalRow(scoreHome, scoreAway, extra = {}) {
  return {
    slug: "can.1",
    home: "Atlético Ottawa",
    away: "HFX Wanderers",
    sh: scoreHome,
    sa: scoreAway,
    ts: t,
    matchId: "cid_can1_atlottawa_hfxwanderers_20260808",
    source: "flashscore_same_day_exact_team_match",
    adjudicated: false,
    adjudicationId: null,
    ...extra,
  };
}
function historyRow(scoreHome, scoreAway) {
  return {
    slug: "can.1",
    home: "Atlético Ottawa",
    away: "HFX Wanderers",
    sh: scoreHome,
    sa: scoreAway,
    ts: t,
    row: { id: "cid_can1_atlottawa_hfxwanderers_20260808" },
  };
}

test("approved adjudication outranks conflicting ordinary verified final", () => {
  const resolved = resolveAuthoritativeScoreForConflict(conflict, {
    verifiedFinals: [
      finalRow(1, 1),
      finalRow(2, 1, { adjudicated: true, source: "manual_versioned_truth_adjudication", adjudicationId: "adj_test" }),
    ],
    currentHistory: [historyRow(2, 1)],
  });
  assert.equal(resolved.authority, "approved_adjudication");
  assert.equal(resolved.score, "2|1");
  assert.deepEqual(resolved.adjudicationIds, ["adj_test"]);
});

test("unanimous verified final is accepted when no adjudication exists", () => {
  const resolved = resolveAuthoritativeScoreForConflict(conflict, {
    verifiedFinals: [finalRow(1, 1)],
    currentHistory: [historyRow(1, 1)],
  });
  assert.equal(resolved.authority, "verified_final");
  assert.equal(resolved.score, "1|1");
});

test("conflicting verified finals without adjudication fail closed", () => {
  assert.throws(() => resolveAuthoritativeScoreForConflict(conflict, {
    verifiedFinals: [finalRow(1, 1), finalRow(2, 1, { matchId: "other" })],
    currentHistory: [historyRow(1, 1)],
  }), /archive_conflict_authoritative_final_not_unique/u);
});

test("current history disagreement fails closed", () => {
  assert.throws(() => resolveAuthoritativeScoreForConflict(conflict, {
    verifiedFinals: [finalRow(1, 1)],
    currentHistory: [historyRow(2, 1)],
  }), /archive_conflict_current_history_disagrees/u);
});

test("archive conflict detector groups semantic aliases in one kickoff window", () => {
  const rows = [
    { __container: "history-archive/can.1/2026.json", id: "cid_x", leagueSlug: "can.1", homeTeam: "Atlético Ottawa", awayTeam: "HFX Wanderers", scoreHome: 1, scoreAway: 1, kickoff: "2026-08-08T17:00:00.000Z" },
    { __container: "history-archive/can.1/2026.json", id: "provider", leagueSlug: "can.1", homeTeam: "Atl. Ottawa", awayTeam: "HFX Wanderers", scoreHome: 2, scoreAway: 1, kickoff: "2026-08-08T17:00:00.000Z" },
  ];
  const found = findArchiveScoreConflicts(rows);
  assert.equal(found.length, 1);
  assert.equal(found[0].scores.length, 2);
});
