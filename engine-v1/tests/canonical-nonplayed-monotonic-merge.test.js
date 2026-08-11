import test from "node:test";
import assert from "node:assert/strict";

import {
  mergeCanonicalFixtures
} from "../jobs/run-fixture-acquisition-chunk.js";

function postponedFixture() {
  return {
    canonicalId: "cid_col2_leones_realcundinamarca_20260811",
    matchId: "cid_col2_leones_realcundinamarca_20260811",
    source: "flashscore",
    sourceId: "verified-postponed-01",
    sourceMatchId: "verified-postponed-01",
    leagueSlug: "col.2",
    leagueName: "Primera B",
    dayKey: "2026-08-11",
    kickoffUtc: "2026-08-11T20:00:00.000Z",
    homeTeam: "Leones",
    awayTeam: "Real Cundinamarca",
    status: "STATUS_POSTPONED",
    rawStatus: "STATUS_POSTPONED",
    statusType: "STATUS_POSTPONED",
    operationalState: "UNKNOWN",
    normalizedStatus: "PRE_KICKOFF_NON_PLAYED",
    nonPlayedState: "PRE_KICKOFF_NON_PLAYED",
    stateClass: "PRE_KICKOFF_NON_PLAYED",
    nonPlayedKind: "POSTPONED",
    isNonPlayed: true,
    isPreKickoffNonPlayed: true,
    terminal: false,
    scoreHome: null,
    scoreAway: null,
    minute: null,
    penalties: null,
    decidedBy: null,
    statusEvidence: {
      provider: "flashscore",
      providerMatchId: "verified-postponed-01"
    },
    statusCorrection: {
      reason: "verified_flashscore_nonplayed_decision",
      provider: "flashscore"
    },
    nonPlayedStateEvidence: {
      provider: "flashscore",
      decision: "POSTPONED"
    }
  };
}

function staleScheduledFixture() {
  return {
    canonicalId: "cid_col2_leones_realcundinamarca_20260811",
    matchId: "cid_col2_leones_realcundinamarca_20260811",
    source: "flashscore",
    sourceId: "verified-postponed-01",
    sourceMatchId: "verified-postponed-01",
    leagueSlug: "col.2",
    leagueName: "Primera B",
    dayKey: "2026-08-11",
    kickoffUtc: "2026-08-11T20:00:00.000Z",
    homeTeam: "Leones",
    awayTeam: "Real Cundinamarca",
    status: "STATUS_SCHEDULED",
    rawStatus: "STATUS_SCHEDULED",
    operationalState: "UNKNOWN",
    scoreHome: null,
    scoreAway: null,
    minute: null
  };
}

test(
  "canonical evidence-backed non-played truth is not downgraded by stale scheduled acquisition",
  () => {
    const previous = postponedFixture();
    const [merged] = mergeCanonicalFixtures(
      [previous],
      [staleScheduledFixture()]
    );

    assert.equal(merged.status, "STATUS_POSTPONED");
    assert.equal(merged.rawStatus, "STATUS_POSTPONED");
    assert.equal(merged.statusType, "STATUS_POSTPONED");
    assert.equal(merged.normalizedStatus, "PRE_KICKOFF_NON_PLAYED");
    assert.equal(merged.nonPlayedState, "PRE_KICKOFF_NON_PLAYED");
    assert.equal(merged.nonPlayedKind, "POSTPONED");
    assert.equal(merged.isNonPlayed, true);
    assert.equal(merged.isPreKickoffNonPlayed, true);
    assert.equal(merged.scoreHome, null);
    assert.equal(merged.scoreAway, null);
    assert.equal(merged.minute, null);
    assert.deepEqual(merged.statusEvidence, previous.statusEvidence);
    assert.deepEqual(merged.statusCorrection, previous.statusCorrection);
    assert.deepEqual(
      merged.nonPlayedStateEvidence,
      previous.nonPlayedStateEvidence
    );
  }
);

test(
  "explicit played final still supersedes prior canonical non-played truth",
  () => {
    const finalIncoming = {
      ...staleScheduledFixture(),
      status: "FT",
      rawStatus: "STATUS_FINAL",
      statusType: "STATUS_FINAL",
      operationalState: "TERMINAL_CONFIRMED",
      scoreHome: 2,
      scoreAway: 1,
      minute: "FT"
    };

    const [merged] = mergeCanonicalFixtures(
      [postponedFixture()],
      [finalIncoming]
    );

    assert.equal(merged.status, "FT");
    assert.equal(merged.rawStatus, "STATUS_FINAL");
    assert.equal(merged.statusType, "STATUS_FINAL");
    assert.equal(merged.scoreHome, 2);
    assert.equal(merged.scoreAway, 1);
  }
);
