import test from "node:test";
import assert from "node:assert/strict";

import {
  mergeFlashscoreTargetLeaguesWithApprovedDecisions,
  isFlashscoreNonPlayedTerminalEvidence,
  isExactFlashscorePostponedRow,
  buildFlashscorePostponedIncoming
} from "../jobs/run-live-status-refresh-day.js";

import {
  applyMutableStatusFields
} from "../jobs/run-intraday-snapshot-refresh.js";

import {
  findExactFlashscorePostponedMatch,
  shouldRetractExistingFlashscoreFinal
} from "../jobs/export-verified-final-results-day.js";

import {
  resolveApprovedFlashscoreNonPlayedDecision
} from "../source-discovery/flashscore-nonplayed-decisions.js";

const dayKey =
  "2026-07-19";

const canonicalId =
  "cid_kaz1_ertispavlodar_astana_20260719";

function postponedRow(overrides = {}) {
  return {
    matchId: "ldvtm1Wg",
    home: "Ertis Pavlodar",
    away: "FC Astana",

    kickoffUtc:
      "2026-07-19T14:00:00.000Z",

    statusCode: "3",
    statusDetailCode: "4",

    scoreHome: null,
    scoreAway: null,

    playedFinal: false,
    nonPlayedTerminal: true,
    finished: false,

    ...overrides
  };
}

function canonicalRow(overrides = {}) {
  return {
    canonicalId,
    matchId: canonicalId,

    source: "flashscore",
    sourceId: "ldvtm1Wg",
    sourceMatchId: "ldvtm1Wg",

    dayKey,

    homeTeam: "Ertis Pavlodar",
    awayTeam: "FC Astana",

    kickoffUtc:
      "2026-07-19T14:00:00.000Z",

    status: "FT",
    rawStatus: "STATUS_FINAL",
    statusType: "STATUS_FINAL",
    minute: "FT",

    scoreHome: 0,
    scoreAway: 0,

    ...overrides
  };
}

test(
  "AC4 is only raw evidence and is not a global postponed mapping",
  () => {
    assert.equal(
      isFlashscoreNonPlayedTerminalEvidence(
        postponedRow(),
        dayKey
      ),
      true
    );

    assert.equal(
      isExactFlashscorePostponedRow(
        postponedRow(),
        dayKey,
        canonicalRow()
      ),
      true
    );

    assert.equal(
      isExactFlashscorePostponedRow(
        {
          ...postponedRow(),
          matchId: "rsKsyLsA",
          home: "Tacuarembo",
          away: "Plaza Colonia",
          kickoffUtc:
            "2026-07-19T13:30:00.000Z"
        },
        dayKey,
        {
          ...canonicalRow(),
          canonicalId:
            "cid_uru2_tacuarembo_plazacolonia_20260719",

          matchId:
            "cid_uru2_tacuarembo_plazacolonia_20260719",

          sourceId: "rsKsyLsA",
          sourceMatchId: "rsKsyLsA"
        }
      ),
      false
    );
  }
);

test(
  "approved decision is exact on date canonical ID and provider ID",
  () => {
    const decision =
      resolveApprovedFlashscoreNonPlayedDecision({
        dayKey,
        canonicalId,
        providerMatchId:
          "ldvtm1Wg"
      });

    assert.equal(
      decision?.resolvedStatus,
      "STATUS_POSTPONED"
    );

    assert.equal(
      resolveApprovedFlashscoreNonPlayedDecision({
        dayKey,
        canonicalId,
        providerMatchId:
          "different-id"
      }),
      null
    );
  }
);

test(
  "approved correction clears the poisoned FT score",
  () => {
    const corrected =
      buildFlashscorePostponedIncoming(
        canonicalRow(),
        postponedRow(),
        dayKey
      );

    assert.equal(
      corrected.status,
      "STATUS_POSTPONED"
    );

    assert.equal(
      corrected.scoreHome,
      null
    );

    assert.equal(
      corrected.scoreAway,
      null
    );

    assert.equal(
      corrected
        .statusCorrection
        ?.decisionId,
      "flashscore-nonplayed-20260719-ldvtm1Wg-v1"
    );
  }
);

test(
  "details status patch explicitly clears old scores",
  () => {
    const basic = {
      status: "FT",
      rawStatus: "STATUS_FINAL",
      statusType: "STATUS_FINAL",
      minute: "FT",
      scoreHome: 0,
      scoreAway: 0
    };

    const changed =
      applyMutableStatusFields(
        basic,
        {
          status:
            "STATUS_POSTPONED",

          rawStatus:
            "STATUS_POSTPONED",

          statusType:
            "STATUS_POSTPONED",

          minute: null,
          scoreHome: null,
          scoreAway: null
        }
      );

    assert.equal(changed, true);
    assert.equal(basic.scoreHome, null);
    assert.equal(basic.scoreAway, null);
  }
);

test(
  "verified final retraction requires the immutable decision and exact provider ID",
  () => {
    const target = {
      matchId: canonicalId,
      canonicalId,
      homeTeam: "Ertis Pavlodar",
      awayTeam: "FC Astana"
    };

    const found =
      findExactFlashscorePostponedMatch(
        target,
        [postponedRow()],
        dayKey
      );

    assert.equal(found.ok, true);

    const existing = {
      verifiedFinalTruth: true,

      sources: [
        {
          provider: "flashscore",
          providerMatchId:
            "ldvtm1Wg"
        }
      ]
    };

    assert.equal(
      shouldRetractExistingFlashscoreFinal(
        existing,
        target,
        found.row,
        found.decision
      ),
      true
    );

    assert.equal(
      shouldRetractExistingFlashscoreFinal(
        {
          ...existing,

          sources: [
            {
              provider: "flashscore",
              providerMatchId:
                "different-id"
            }
          ]
        },
        target,
        found.row,
        found.decision
      ),
      false
    );
  }
);

test(
  "approved non-played decision forces its terminal league using the downstream target object contract",
  () => {
    const forcedOnly =
      mergeFlashscoreTargetLeaguesWithApprovedDecisions(
        [],
        dayKey
      );

    assert.equal(
      forcedOnly.length,
      1
    );

    assert.equal(
      forcedOnly[0]?.slug,
      "kaz.1"
    );

    assert.equal(
      forcedOnly[0]
        ?.forcedByApprovedDecision,
      true
    );

    assert.equal(
      forcedOnly[0]
        ?.approvedDecisionCount,
      1
    );

    assert.deepEqual(
      forcedOnly[0]
        ?.approvedDecisionIds,
      [
        "flashscore-nonplayed-20260719-ldvtm1Wg-v1"
      ]
    );

    const baseTargets = [
      {
        slug: "swe.1",
        candidateCount: 3,
        fixtureCount: 3
      },
      {
        slug: "kaz.1",
        candidateCount: 0,
        fixtureCount: 3
      }
    ];

    const merged =
      mergeFlashscoreTargetLeaguesWithApprovedDecisions(
        baseTargets,
        dayKey
      );

    assert.deepEqual(
      merged.map(row =>
        row.slug
      ),
      [
        "kaz.1",
        "swe.1"
      ]
    );

    const kaz =
      merged.find(row =>
        row.slug === "kaz.1"
      );

    const swe =
      merged.find(row =>
        row.slug === "swe.1"
      );

    assert.equal(
      kaz?.fixtureCount,
      3
    );

    assert.equal(
      kaz
        ?.forcedByApprovedDecision,
      true
    );

    assert.equal(
      swe?.candidateCount,
      3
    );

    assert.equal(
      swe
        ?.forcedByApprovedDecision,
      undefined
    );

    const wrongDay =
      mergeFlashscoreTargetLeaguesWithApprovedDecisions(
        [
          {
            slug: "swe.1",
            candidateCount: 3,
            fixtureCount: 3
          }
        ],
        "2026-07-20"
      );

    assert.deepEqual(
      wrongDay,
      [
        {
          slug: "swe.1",
          candidateCount: 3,
          fixtureCount: 3
        }
      ]
    );
  }
);
