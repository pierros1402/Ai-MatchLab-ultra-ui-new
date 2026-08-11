import test from "node:test";
import assert from "node:assert/strict";

import {
  buildVerifiedFinalResult
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
