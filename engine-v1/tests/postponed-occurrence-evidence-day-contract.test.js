import test from "node:test";
import assert from "node:assert/strict";

import {
  resolveApprovedFlashscoreNonPlayedDecision
} from "../source-discovery/flashscore-nonplayed-decisions.js";

import {
  isExactFlashscorePostponedRow,
  buildFlashscorePostponedIncoming,
  resolveFlashscoreRefreshOffsets
} from "../jobs/run-live-status-refresh-day.js";

import {
  findExactFlashscorePostponedMatch
} from "../jobs/export-verified-final-results-day.js";

function sourceRow(overrides = {}) {
  return {
    matchId:
      "88Qs0xvB",
    home:
      "Birmingham",
    away:
      "New Mexico",
    kickoffUtc:
      "2026-07-25T23:00:00.000Z",
    statusCode:
      "3",
    statusDetailCode:
      "4",
    scoreHome:
      null,
    scoreAway:
      null,
    playedFinal:
      false,
    nonPlayedTerminal:
      true,
    finished:
      false,
    ...overrides
  };
}

function oldCanonical(overrides = {}) {
  return {
    canonicalId:
      "cid_usa2_birmingham_newmexico_20260725",
    matchId:
      "cid_usa2_birmingham_newmexico_20260725",
    source:
      "flashscore",
    sourceId:
      "88Qs0xvB",
    sourceMatchId:
      "88Qs0xvB",
    leagueSlug:
      "usa.2",
    dayKey:
      "2026-07-25",
    kickoffUtc:
      "2026-07-25T00:00:00.000Z",
    homeTeam:
      "Birmingham",
    awayTeam:
      "New Mexico",
    status:
      "STATUS_SCHEDULED",
    rawStatus:
      "STATUS_SCHEDULED",
    scoreHome:
      null,
    scoreAway:
      null,
    ...overrides
  };
}

test(
  "registers both Birmingham occurrences and Aluminij independently",
  () => {
    const oldBirmingham =
      resolveApprovedFlashscoreNonPlayedDecision({
        dayKey:
          "2026-07-25",
        canonicalId:
          "cid_usa2_birmingham_newmexico_20260725",
        providerMatchId:
          "88Qs0xvB"
      });

    assert.equal(
      oldBirmingham?.resolvedStatus,
      "STATUS_POSTPONED"
    );

    assert.equal(
      oldBirmingham?.evidenceDayKey,
      "2026-07-26"
    );

    assert.equal(
      oldBirmingham?.evidenceKickoffUtc,
      "2026-07-25T23:00:00.000Z"
    );

    const newBirmingham =
      resolveApprovedFlashscoreNonPlayedDecision({
        dayKey:
          "2026-07-26",
        canonicalId:
          "cid_usa2_birmingham_newmexico_20260726",
        providerMatchId:
          "88Qs0xvB"
      });

    assert.equal(
      newBirmingham?.resolvedStatus,
      "STATUS_POSTPONED"
    );

    assert.equal(
      newBirmingham?.evidenceDayKey,
      null
    );

    const aluminij =
      resolveApprovedFlashscoreNonPlayedDecision({
        dayKey:
          "2026-07-25",
        canonicalId:
          "cid_svn1_aluminij_celje_20260725",
        providerMatchId:
          "r1CG9jwR"
      });

    assert.equal(
      aluminij?.resolvedStatus,
      "STATUS_POSTPONED"
    );
  }
);

test(
  "accepts exact next-day evidence for the postponed original occurrence",
  () => {
    assert.equal(
      isExactFlashscorePostponedRow(
        sourceRow(),
        "2026-07-25",
        oldCanonical()
      ),
      true
    );

    const corrected =
      buildFlashscorePostponedIncoming(
        oldCanonical(),
        sourceRow(),
        "2026-07-25"
      );

    assert.equal(
      corrected.status,
      "STATUS_POSTPONED"
    );

    assert.equal(
      corrected.rawStatus,
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
  }
);

test(
  "exporter accepts the exact evidence-day row for the original occurrence",
  () => {
    const found =
      findExactFlashscorePostponedMatch(
        oldCanonical(),
        [sourceRow()],
        "2026-07-25"
      );

    assert.equal(found.ok, true);

    assert.equal(
      found.decision.decisionId,
      "flashscore-nonplayed-20260725-88Qs0xvB-v1"
    );
  }
);

test(
  "fails closed for wrong provider ID evidence day or evidence kickoff",
  () => {
    for (const invalidRow of [
      sourceRow({
        matchId:
          "different-provider"
      }),
      sourceRow({
        kickoffUtc:
          "2026-07-25T22:00:00.000Z"
      }),
      sourceRow({
        kickoffUtc:
          "2026-07-24T23:00:00.000Z"
      })
    ]) {
      assert.equal(
        isExactFlashscorePostponedRow(
          invalidRow,
          "2026-07-25",
          oldCanonical()
        ),
        false
      );

      assert.equal(
        findExactFlashscorePostponedMatch(
          oldCanonical(),
          [invalidRow],
          "2026-07-25"
        ).ok,
        false
      );
    }
  }
);

test(
  "derives the closed-day and approved evidence-day offsets deterministically",
  () => {
    const decisions = [
      {
        dayKey:
          "2026-07-25",
        evidenceDayKey:
          null
      },
      {
        dayKey:
          "2026-07-25",
        evidenceDayKey:
          "2026-07-26"
      },
      {
        dayKey:
          "2026-07-26",
        evidenceDayKey:
          "2026-07-27"
      }
    ];

    assert.deepEqual(
      resolveFlashscoreRefreshOffsets(
        "2026-07-25",
        decisions,
        "2026-07-26"
      ),
      [-1, 0]
    );
  }
);

test(
  "uses only the requested day when there is no different approved evidence day",
  () => {
    assert.deepEqual(
      resolveFlashscoreRefreshOffsets(
        "2026-07-25",
        [
          {
            dayKey:
              "2026-07-25",
            evidenceDayKey:
              null
          }
        ],
        "2026-07-26"
      ),
      [-1]
    );

    assert.deepEqual(
      resolveFlashscoreRefreshOffsets(
        "2026-07-26",
        [],
        "2026-07-26"
      ),
      [0]
    );
  }
);

test(
  "deduplicates evidence days and ignores decisions belonging to another occurrence day",
  () => {
    assert.deepEqual(
      resolveFlashscoreRefreshOffsets(
        "2026-07-25",
        [
          {
            dayKey:
              "2026-07-25",
            evidenceDayKey:
              "2026-07-26"
          },
          {
            dayKey:
              "2026-07-25",
            evidenceDayKey:
              "2026-07-26"
          },
          {
            dayKey:
              "2026-07-24",
            evidenceDayKey:
              "2026-07-27"
          }
        ],
        "2026-07-26"
      ),
      [-1, 0]
    );
  }
);

test(
  "fails closed for invalid requested or reference days",
  () => {
    assert.throws(
      () =>
        resolveFlashscoreRefreshOffsets(
          "not-a-day",
          [],
          "2026-07-26"
        ),
      /invalid_flashscore_refresh_day/
    );

    assert.throws(
      () =>
        resolveFlashscoreRefreshOffsets(
          "2026-07-25",
          [],
          "invalid-reference"
        ),
      /invalid_flashscore_refresh_day/
    );
  }
);
