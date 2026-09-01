import test from "node:test";
import assert from "node:assert/strict";

import {
  buildPenaltyWinnerMarkerNormalizedFinalResult,
  buildVerifiedFinalResult,
  resolveTerminalScoreConvergence
} from "./export-verified-final-results-day.js";

test("Flashscore verified-final payload preserves explicit terminal admission evidence", () => {
  const target = {
    matchId: "cid_usa2_indyeleven_hartfordathletic_20260810",
    leagueSlug: "usa.2",
    leagueName: "USL Championship",
    country: "USA",
    homeTeam: "Indy Eleven",
    awayTeam: "Hartford Athletic",
    kickoffUtc: "2026-08-09T21:00:00.000Z"
  };

  const source = {
    matchId: "S8NKex5F",
    country: "USA",
    leagueName: "USL Championship",
    leaguePath: "/football/usa/usl-championship/",
    home: "Indy Eleven",
    away: "Hartford Athletic",
    scoreHome: 1,
    scoreAway: 1,
    kickoffUtc: "2026-08-09T21:00:00.000Z",
    finished: true,
    playedFinal: true,
    nonPlayedTerminal: false,
    statusCode: "3",
    statusDetailCode: ""
  };

  const result =
    buildVerifiedFinalResult(
      "2026-08-10",
      target,
      source
    );

  assert.equal(result.verifiedFinalTruth, true);
  assert.equal(result.scoreKey, "1-1");

  const evidence = result.sources[0];

  assert.equal(evidence.provider, "flashscore");
  assert.equal(evidence.providerMatchId, "S8NKex5F");
  assert.equal(evidence.finished, true);
  assert.equal(evidence.playedFinal, true);
  assert.equal(evidence.nonPlayedTerminal, false);
  assert.equal(evidence.statusCode, "3");
});

test("FINAL_PEN winner marker is normalized to the canonical played score", () => {
  const canonicalFixture = {
    canonicalId: "cid_por_cup_home_away_20260830",
    source: "espn",
    sourceMatchId: "401906001",
    leagueName: "Taca de Portugal",
    homeTeam: "Home",
    awayTeam: "Away",
    dayKey: "2026-08-30",
    kickoffUtc: "2026-08-30T16:00:00.000Z",
    status: "FT",
    rawStatus: "STATUS_FINAL_PEN",
    scoreHome: 2,
    scoreAway: 2,
    lastSeenAt: "2026-09-01T14:15:56.000Z"
  };

  const target = {
    matchId: canonicalFixture.canonicalId,
    leagueSlug: "por.taca.portugal",
    leagueName: "Taca de Portugal",
    country: "Portugal",
    homeTeam: "Home",
    awayTeam: "Away",
    kickoffUtc: canonicalFixture.kickoffUtc,
    canonicalFixture
  };

  const flashscoreRow = {
    matchId: "ttYIQWNc",
    home: "Home",
    away: "Away",
    scoreHome: 2,
    scoreAway: 3,
    kickoffUtc: canonicalFixture.kickoffUtc,
    finished: true,
    playedFinal: true
  };

  const convergence =
    resolveTerminalScoreConvergence({
      target,
      dayKey: "2026-08-30",
      flashscoreMatch: {
        ok: true,
        row: flashscoreRow
      }
    });

  assert.equal(
    convergence.state,
    "penalty_winner_marker_normalized"
  );
  assert.equal(convergence.flashscoreScoreKey, "2-3");
  assert.equal(convergence.canonicalScoreKey, "2-2");
  assert.equal(convergence.winnerMarkerSide, "away");

  const result =
    buildPenaltyWinnerMarkerNormalizedFinalResult(
      "2026-08-30",
      target,
      flashscoreRow,
      convergence
    );

  assert.equal(result.scoreKey, "2-2");
  assert.equal(
    result.source,
    "canonical_espn_final_pen_score_correction"
  );
  assert.equal(
    result.settlement.scoreSemantics,
    "played_score_excluding_penalty_shootout"
  );
  assert.equal(
    result.verification.checks
      .flashscoreSinglePenaltyWinnerMarker,
    true
  );
});

test("ordinary terminal score disagreement remains pending recheck", () => {
  const canonicalFixture = {
    canonicalId: "cid_por_cup_home_away_20260830",
    source: "espn",
    sourceMatchId: "401906001",
    homeTeam: "Home",
    awayTeam: "Away",
    dayKey: "2026-08-30",
    kickoffUtc: "2026-08-30T16:00:00.000Z",
    status: "FT",
    rawStatus: "STATUS_FINAL",
    scoreHome: 2,
    scoreAway: 1,
    lastSeenAt: "2026-09-01T14:15:56.000Z"
  };

  const result =
    resolveTerminalScoreConvergence({
      target: {
        matchId: canonicalFixture.canonicalId,
        homeTeam: "Home",
        awayTeam: "Away",
        canonicalFixture
      },
      dayKey: "2026-08-30",
      flashscoreMatch: {
        ok: true,
        row: {
          matchId: "ttYIQWNc",
          home: "Home",
          away: "Away",
          scoreHome: 2,
          scoreAway: 3
        }
      }
    });

  assert.equal(result.state, "pending_recheck");
});
