import test from "node:test";
import assert from "node:assert/strict";

import {
  applyCanonicalStatusCoherenceRepair
} from "./canonical-status-coherence-repair.js";

test("repairs nested Flashscore conflict from explicit finished/statusCode evidence", () => {
  const canonicalRow = {
    canonicalId: "cid_usa2_indyeleven_hartfordathletic_20260810",
    matchId: "cid_usa2_indyeleven_hartfordathletic_20260810",
    source: "flashscore",
    sourceId: "S8NKex5F",
    sourceMatchId: "S8NKex5F",
    leagueSlug: "usa.2",
    dayKey: "2026-08-10",
    kickoffUtc: "2026-08-09T21:00:00.000Z",
    homeTeam: "Indy Eleven",
    awayTeam: "Hartford Athletic",
    scoreHome: 1,
    scoreAway: 1,
    status: "FT",
    statusType: "STATUS_FINAL",
    rawStatus: "STATUS_FINAL",
    operationalState: "TERMINAL_CONFIRMED",
    minute: "FT",
    authoritativeTerminalWriteback: {
      observation: {
        status: "FT",
        statusType: "STATUS_FINAL",
        rawStatus: "STATUS_SCHEDULED",
        scoreHome: 1,
        scoreAway: 1
      }
    }
  };

  const finalResult = {
    verifiedFinalTruth: true,
    dayKey: "2026-08-10",
    matchId: canonicalRow.canonicalId,
    leagueSlug: "usa.2",
    homeTeam: "Indy Eleven",
    awayTeam: "Hartford Athletic",
    kickoffUtc: "2026-08-09T21:00:00.000Z",
    scoreHome: 1,
    scoreAway: 1,
    sources: [{
      provider: "flashscore",
      providerMatchId: "S8NKex5F",
      home: "Indy Eleven",
      away: "Hartford Athletic",
      kickoffUtc: "2026-08-09T21:00:00.000Z",
      scoreHome: 1,
      scoreAway: 1,
      finished: true,
      playedFinal: true,
      nonPlayedTerminal: false,
      statusCode: "3"
    }]
  };

  const result =
    applyCanonicalStatusCoherenceRepair({
      canonicalRow,
      finalResult,
      dayKey: "2026-08-10",
      repairedAt: "2026-08-11T06:30:00.000Z"
    });

  assert.equal(result.changed, true);
  assert.equal(result.row.status, "FT");
  assert.equal(result.row.rawStatus, "STATUS_FULL_TIME");

  assert.equal(
    result.row.authoritativeTerminalWriteback.observation.rawStatus,
    "STATUS_FULL_TIME"
  );
});
