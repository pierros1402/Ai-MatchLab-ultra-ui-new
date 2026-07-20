import test from "node:test";
import assert from "node:assert/strict";

import {
  MATCH_STATE_CLASS,
  classifyMatchState,
  hasMatchStateConflict,
  hasPreKickoffNonPlayedDisplayViolation,
  isPreKickoffNonPlayed,
  isVerifiedFinalVetoState,
  sanitizePreKickoffNonPlayed,
  verifiedFinalVetoReason
} from "../core/non-played-state.js";
import { normalizeFixture } from "../core/normalize.js";
import { mergeCanonicalFixtures } from "../jobs/run-fixture-acquisition-chunk.js";
import {
  hasCanonicalPreKickoffNonPlayedVeto
} from "../jobs/export-verified-final-results-day.js";
import {
  normalizeFinalResultData
} from "../jobs/build-value-settlement-from-final-results-day.js";

test("provider-independent match-state taxonomy stays fail-closed", () => {
  assert.equal(
    classifyMatchState({ status: "SPECIAL", rawStatus: "STATUS_POSTPONED" }),
    MATCH_STATE_CLASS.PRE_KICKOFF_NON_PLAYED
  );
  assert.equal(
    classifyMatchState({ status: "SPECIAL", rawStatus: "STATUS_CANCELED" }),
    MATCH_STATE_CLASS.PRE_KICKOFF_NON_PLAYED
  );
  assert.equal(
    classifyMatchState({ status: "SPECIAL", rawStatus: "STATUS_ABANDONED" }),
    MATCH_STATE_CLASS.PLAY_INTERRUPTED
  );
  assert.equal(
    classifyMatchState({ status: "LIVE", rawStatus: "STATUS_DELAYED" }),
    MATCH_STATE_CLASS.TEMPORARY_DELAY
  );
  assert.equal(
    classifyMatchState({ status: "SPECIAL", rawStatus: "STATUS_VOID" }),
    MATCH_STATE_CLASS.RESULT_INVALIDATED
  );
  assert.equal(
    classifyMatchState({ status: "SPECIAL" }),
    MATCH_STATE_CLASS.UNKNOWN
  );
});

test("conflicting played-final and non-played evidence fails closed", () => {
  const row = {
    status: "FT",
    rawStatus: "STATUS_POSTPONED",
    scoreHome: 0,
    scoreAway: 0
  };

  assert.equal(classifyMatchState(row), MATCH_STATE_CLASS.CONFLICT);
  assert.equal(hasMatchStateConflict(row), true);
  assert.equal(isPreKickoffNonPlayed(row), false);
  assert.equal(isVerifiedFinalVetoState(row), true);
  assert.equal(verifiedFinalVetoReason(row), "canonical_status_conflict");
});

test("pre-kickoff sanitizer preserves interrupted and invalidated evidence", () => {
  const postponed = sanitizePreKickoffNonPlayed({
    status: "SPECIAL",
    rawStatus: "STATUS_POSTPONED",
    scoreHome: 0,
    scoreAway: 0,
    homeScore: 0,
    awayScore: 0,
    minute: "0'",
    penalties: { home: 4, away: 3 },
    decidedBy: "pens",
    isDisplayFinal: true
  });

  assert.equal(postponed.scoreHome, null);
  assert.equal(postponed.scoreAway, null);
  assert.equal(postponed.homeScore, null);
  assert.equal(postponed.awayScore, null);
  assert.equal(postponed.minute, null);
  assert.equal(postponed.penalties, null);
  assert.equal(postponed.decidedBy, null);
  assert.equal(postponed.isDisplayFinal, false);

  for (const rawStatus of ["STATUS_ABANDONED", "STATUS_VOID"]) {
    const observed = sanitizePreKickoffNonPlayed({
      status: "SPECIAL",
      rawStatus,
      scoreHome: 2,
      scoreAway: 1,
      minute: "64'"
    });

    assert.equal(observed.scoreHome, 2);
    assert.equal(observed.scoreAway, 1);
    assert.equal(observed.minute, "64'");
    assert.equal(isVerifiedFinalVetoState(observed), true);
  }
});

test("display violation detects every non-null minute representation", () => {
  for (const minute of ["0'", "FT", 0, 64]) {
    assert.equal(
      hasPreKickoffNonPlayedDisplayViolation({
        status: "SPECIAL",
        rawStatus: "STATUS_POSTPONED",
        scoreHome: null,
        scoreAway: null,
        minute
      }),
      true
    );
  }

  assert.equal(
    hasPreKickoffNonPlayedDisplayViolation({
      status: "SPECIAL",
      rawStatus: "STATUS_POSTPONED",
      scoreHome: null,
      scoreAway: null,
      minute: null,
      isDisplayFinal: false
    }),
    false
  );

  for (const extraField of [
    { penalties: { home: 4, away: 3 } },
    { decidedBy: "pens" }
  ]) {
    assert.equal(
      hasPreKickoffNonPlayedDisplayViolation({
        status: "SPECIAL",
        rawStatus: "STATUS_POSTPONED",
        scoreHome: null,
        scoreAway: null,
        minute: null,
        ...extraField
      }),
      true
    );
  }
});

test("ESPN postponed normalization cannot manufacture 0-0 or minute 0", () => {
  const row = normalizeFixture(
    {
      id: "401872719",
      date: "2026-07-19T16:00:00Z",
      competitions: [
        {
          date: "2026-07-19T16:00:00Z",
          status: {
            type: { name: "STATUS_POSTPONED" },
            displayClock: "0'"
          },
          competitors: [
            {
              homeAway: "home",
              score: "0",
              team: { displayName: "Cerro" }
            },
            {
              homeAway: "away",
              score: "0",
              team: { displayName: "Racing (Montevideo)" }
            }
          ]
        }
      ]
    },
    "uru.1"
  );

  assert.ok(row);
  assert.equal(row.status, "SPECIAL");
  assert.equal(row.rawStatus, "STATUS_POSTPONED");
  assert.equal(row.scoreHome, null);
  assert.equal(row.scoreAway, null);
  assert.equal(row.minute, null);
  assert.equal(row.penalties, null);
  assert.equal(row.decidedBy, null);
});

test("canonical merge gives exact incoming postponed evidence precedence", () => {
  const merged = mergeCanonicalFixtures(
    [
      {
        canonicalId: "cid_uru1_cerro_racingmontevideo_20260719",
        matchId: "401872719",
        source: "espn",
        status: "FT",
        rawStatus: "STATUS_FINAL",
        scoreHome: 2,
        scoreAway: 1,
        minute: "FT",
        firstSeenAt: "2026-07-19T15:00:00.000Z"
      }
    ],
    [
      {
        canonicalId: "cid_uru1_cerro_racingmontevideo_20260719",
        matchId: "401872719",
        source: "espn",
        status: "SPECIAL",
        rawStatus: "STATUS_POSTPONED",
        scoreHome: 0,
        scoreAway: 0,
        minute: "0'",
        lastSeenAt: "2026-07-20T00:11:30.410Z"
      }
    ]
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, "SPECIAL");
  assert.equal(merged[0].rawStatus, "STATUS_POSTPONED");
  assert.equal(merged[0].scoreHome, null);
  assert.equal(merged[0].scoreAway, null);
  assert.equal(merged[0].minute, null);
});

test("source-less legacy rows retain exact matchId merge semantics", () => {
  const merged = mergeCanonicalFixtures(
    [
      {
        matchId: "legacy-123",
        status: "FT",
        rawStatus: "STATUS_FINAL",
        scoreHome: 2,
        scoreAway: 1
      }
    ],
    [
      {
        matchId: "legacy-123",
        status: "PRE",
        rawStatus: "STATUS_SCHEDULED",
        scoreHome: null,
        scoreAway: null
      }
    ]
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].status, "FT");
  assert.equal(merged[0].scoreHome, 2);
  assert.equal(merged[0].scoreAway, 1);
});

test("same provider event merges across canonical ID correction", () => {
  const merged = mergeCanonicalFixtures(
    [
      {
        canonicalId: "cid_old",
        matchId: "401872719",
        source: "espn",
        status: "PRE",
        rawStatus: "STATUS_SCHEDULED"
      }
    ],
    [
      {
        canonicalId: "cid_corrected",
        matchId: "401872719",
        source: "espn",
        status: "SPECIAL",
        rawStatus: "STATUS_POSTPONED",
        scoreHome: 0,
        scoreAway: 0,
        minute: "0'"
      }
    ]
  );

  assert.equal(merged.length, 1);
  assert.equal(merged[0].canonicalId, "cid_corrected");
  assert.equal(merged[0].status, "SPECIAL");
  assert.equal(merged[0].scoreHome, null);
  assert.equal(merged[0].scoreAway, null);
  assert.equal(merged[0].minute, null);
});

test("provider IDs are namespace-scoped during canonical merge", () => {
  const merged = mergeCanonicalFixtures(
    [
      {
        canonicalId: "cid_alpha",
        matchId: "123",
        source: "flashscore",
        status: "FT",
        rawStatus: "STATUS_FINAL",
        scoreHome: 1,
        scoreAway: 0
      }
    ],
    [
      {
        canonicalId: "cid_beta",
        matchId: "123",
        source: "espn",
        status: "SPECIAL",
        rawStatus: "STATUS_POSTPONED",
        scoreHome: 0,
        scoreAway: 0,
        minute: "0'"
      }
    ]
  );

  assert.equal(merged.length, 2);

  const alpha = merged.find(row => row.canonicalId === "cid_alpha");
  const beta = merged.find(row => row.canonicalId === "cid_beta");

  assert.equal(alpha.scoreHome, 1);
  assert.equal(alpha.scoreAway, 0);
  assert.equal(beta.scoreHome, null);
  assert.equal(beta.scoreAway, null);
  assert.equal(beta.minute, null);
});

test("settlement final-result parser never coerces missing scores to 0-0", () => {
  const base = {
    verifiedFinalTruth: true,
    verdict: "verified_final_result",
    matchId: "cid_test",
    date: "2026-07-20",
    verification: {
      sourceCount: 2,
      independentSourceCount: 1
    }
  };

  for (const invalid of [
    null,
    undefined,
    "",
    "   ",
    -1,
    1.5
  ]) {
    assert.equal(
      normalizeFinalResultData({
        ...base,
        finalScore: {
          homeScore: invalid,
          awayScore: 0
        }
      }, "test.json"),
      null
    );
  }

  const valid = normalizeFinalResultData({
    ...base,
    finalScore: {
      homeScore: 0,
      awayScore: 0
    }
  }, "test.json");

  assert.ok(valid);
  assert.equal(valid.homeScore, 0);
  assert.equal(valid.awayScore, 0);
});

test("verified-final exporter vetoes every non-final canonical state", () => {
  const cases = [
    ["STATUS_POSTPONED", true],
    ["STATUS_ABANDONED", true],
    ["STATUS_DELAYED", true],
    ["STATUS_VOID", true],
    ["STATUS_FINAL", false]
  ];

  for (const [rawStatus, expected] of cases) {
    assert.equal(
      hasCanonicalPreKickoffNonPlayedVeto({
        canonicalFixture: {
          status: rawStatus === "STATUS_FINAL" ? "FT" : "SPECIAL",
          rawStatus
        }
      }),
      expected
    );
  }

  assert.equal(
    hasCanonicalPreKickoffNonPlayedVeto({
      canonicalFixture: {
        status: "FT",
        rawStatus: "STATUS_POSTPONED"
      }
    }),
    true
  );

  assert.equal(
    hasCanonicalPreKickoffNonPlayedVeto({
      canonicalFixture: {
        status: "SPECIAL"
      }
    }),
    false
  );
});
