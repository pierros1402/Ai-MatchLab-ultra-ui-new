import test from "node:test";
import assert from "node:assert/strict";

import {
  enrichPick
} from "../jobs/build-value-plan-comparison-day.js";

const pick = {
  matchId: "cid_chn1_zhejiangprofessional_wuhanthreetowns_20260808",
  leagueSlug: "chn.1",
  homeTeam: "Zhejiang Professional FC",
  awayTeam: "Wuhan Three Towns",
  market: "Over / Under 2.5",
  pick: "Over 2.5"
};

const fixture = {
  canonicalId: pick.matchId,
  source: "espn",
  sourceId: "401861443",
  sourceMatchId: "401861443",
  status: "SPECIAL",
  rawStatus: "STATUS_POSTPONED",
  scoreHome: null,
  scoreAway: null,
  lastSeenAt: "2026-08-08T20:43:10.665Z"
};

test("postponed Value pick settles VOID with no manufactured final score", () => {
  const row = enrichPick(
    pick,
    fixture,
    null,
    "plan-a",
    null,
    null
  );

  assert.equal(row.result, "VOID");
  assert.equal(row.finalScore, null);
  assert.equal(row.finalStatus, "STATUS_POSTPONED");
  assert.equal(
    row.finalResultProvenance?.verifiedNonPlayedTruth,
    true
  );
  assert.equal(
    row.finalResultProvenance?.method,
    "canonical_non_played_match_state"
  );
});

test("delayed or merely scheduled Value pick remains unresolved", () => {
  for (const rawStatus of ["STATUS_DELAYED", "STATUS_SCHEDULED"]) {
    const row = enrichPick(
      pick,
      {
        ...fixture,
        status: "SPECIAL",
        rawStatus
      },
      null,
      "plan-a",
      null,
      null
    );

    assert.equal(row.result, "UNRESOLVED", rawStatus);
  }
});

test("canonical non-played truth vetoes a stale scored result", () => {
  const row = enrichPick(
    pick,
    fixture,
    {
      verifiedFinalTruth: true,
      matchId: pick.matchId,
      finalScore: {
        homeScore: 0,
        awayScore: 0,
        scoreKey: "0-0"
      }
    },
    "plan-a",
    null,
    null
  );

  assert.equal(row.result, "VOID");
  assert.equal(row.finalScore, null);
});
