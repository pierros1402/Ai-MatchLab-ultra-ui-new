import test from "node:test";
import assert from "node:assert/strict";

import {
  assessDetailStatusState,
  synchronizeDetailStatusState
} from "../core/detail-status-sync.js";

function buildDetail({
  status = "PRE",
  rawStatus = "STATUS_SCHEDULED",
  minute = "0'",
  scoreHome = 0,
  scoreAway = 0
} = {}) {
  return {
    generatedAt:
      "2026-07-29T16:00:00.000Z",
    basic: {
      canonicalId:
        "cid_test_home_away_20260729",
      status,
      rawStatus,
      minute,
      scoreHome,
      scoreAway,
      providerRound: {
        verified: true,
        roundNumber: 21,
        roundLabel: "Round 21"
      }
    },
    meta: {
      signature: JSON.stringify({
        matchId: "provider-id",
        dayKey: "2026-07-29",
        status,
        rawStatus,
        minute: String(minute || ""),
        scoreHome,
        scoreAway,
        preservedContext:
          "must-stay"
      })
    },
    teamNews: {
      status: "ok",
      confidence: 0.74
    },
    standings: {
      updatedAt:
        "2026-07-29T15:32:39.173Z",
      rows: [
        {
          teamName: "Home"
        }
      ]
    },
    opponentAdjustedForm: {
      homeStrength: 0.66,
      awayStrength: 0.44
    },
    leagueForm5: {
      status: "ready",
      rows: [
        {
          teamName: "Home",
          points: 12
        }
      ]
    }
  };
}

test(
  "shared synchronizer updates only mutable state",
  () => {
    const detail =
      buildDetail();

    const enrichmentBefore = {
      providerRound:
        structuredClone(
          detail.basic.providerRound
        ),
      teamNews:
        structuredClone(
          detail.teamNews
        ),
      standings:
        structuredClone(
          detail.standings
        ),
      opponentAdjustedForm:
        structuredClone(
          detail.opponentAdjustedForm
        ),
      leagueForm5:
        structuredClone(
          detail.leagueForm5
        )
    };

    const fixture = {
      canonicalId:
        "cid_test_home_away_20260729",
      status: "FT",
      rawStatus:
        "STATUS_FULL_TIME",
      minute: "90'+4'",
      scoreHome: 2,
      scoreAway: 1
    };

    const result =
      synchronizeDetailStatusState(
        detail,
        fixture,
        {
          patchedAt:
            "2026-07-29T17:45:00.000Z"
        }
      );

    assert.equal(result.ok, true);
    assert.equal(result.changed, true);

    assert.equal(
      detail.basic.status,
      "FT"
    );

    assert.equal(
      detail.basic.rawStatus,
      "STATUS_FULL_TIME"
    );

    assert.equal(
      detail.basic.minute,
      "90'+4'"
    );

    assert.equal(
      detail.basic.scoreHome,
      2
    );

    assert.equal(
      detail.basic.scoreAway,
      1
    );

    const signature =
      JSON.parse(
        detail.meta.signature
      );

    assert.equal(
      signature.status,
      "FT"
    );

    assert.equal(
      signature.rawStatus,
      "STATUS_FULL_TIME"
    );

    assert.equal(
      signature.minute,
      "90'+4'"
    );

    assert.equal(
      signature.scoreHome,
      2
    );

    assert.equal(
      signature.scoreAway,
      1
    );

    assert.equal(
      signature.preservedContext,
      "must-stay"
    );

    assert.deepEqual(
      detail.basic.providerRound,
      enrichmentBefore.providerRound
    );

    assert.deepEqual(
      detail.teamNews,
      enrichmentBefore.teamNews
    );

    assert.deepEqual(
      detail.standings,
      enrichmentBefore.standings
    );

    assert.deepEqual(
      detail.opponentAdjustedForm,
      enrichmentBefore.opponentAdjustedForm
    );

    assert.deepEqual(
      detail.leagueForm5,
      enrichmentBefore.leagueForm5
    );

    const assessment =
      assessDetailStatusState(
        detail,
        fixture
      );

    assert.equal(
      assessment.basicDifferences.length,
      0
    );

    assert.equal(
      assessment.signatureDifferences.length,
      0
    );
  }
);

test(
  "shared synchronizer clears manufactured non-played zero state",
  () => {
    const detail =
      buildDetail({
        status: "SPECIAL",
        rawStatus:
          "STATUS_POSTPONED",
        minute: "0'",
        scoreHome: 0,
        scoreAway: 0
      });

    const fixture = {
      status: "SPECIAL",
      rawStatus:
        "STATUS_POSTPONED",
      minute: null,
      scoreHome: null,
      scoreAway: null
    };

    const result =
      synchronizeDetailStatusState(
        detail,
        fixture,
        {
          patchedAt:
            "2026-07-29T17:46:00.000Z"
        }
      );

    assert.equal(result.ok, true);
    assert.equal(result.changed, true);

    assert.equal(
      detail.basic.minute,
      null
    );

    assert.equal(
      detail.basic.scoreHome,
      null
    );

    assert.equal(
      detail.basic.scoreAway,
      null
    );

    const signature =
      JSON.parse(
        detail.meta.signature
      );

    assert.equal(
      signature.minute,
      ""
    );

    assert.equal(
      signature.scoreHome,
      null
    );

    assert.equal(
      signature.scoreAway,
      null
    );

    assert.equal(
      detail.teamNews.status,
      "ok"
    );

    assert.equal(
      detail.leagueForm5.status,
      "ready"
    );
  }
);

test(
  "already synchronized detail remains byte-semantically unchanged",
  () => {
    const detail =
      buildDetail({
        status: "FT",
        rawStatus:
          "STATUS_FINAL",
        minute: 90,
        scoreHome: 0,
        scoreAway: 0
      });

    const before =
      JSON.stringify(detail);

    const fixture = {
      status: "FT",
      rawStatus:
        "STATUS_FINAL",
      minute: 90,
      scoreHome: 0,
      scoreAway: 0
    };

    const result =
      synchronizeDetailStatusState(
        detail,
        fixture
      );

    assert.equal(result.ok, true);
    assert.equal(result.changed, false);

    assert.equal(
      JSON.stringify(detail),
      before
    );
  }
);


test(
  "second-pass deploy-only detail synchronization preserves enrichment",
  () => {
    const detail =
      buildDetail({
        status: "PRE",
        rawStatus:
          "STATUS_SCHEDULED",
        minute: null,
        scoreHome: 0,
        scoreAway: 0
      });

    detail.basic.canonicalId =
      "cid_deploy_only_home_away_20260729";

    const enrichmentBefore = {
      providerRound:
        structuredClone(
          detail.basic.providerRound
        ),
      teamNews:
        structuredClone(
          detail.teamNews
        ),
      standings:
        structuredClone(
          detail.standings
        ),
      opponentAdjustedForm:
        structuredClone(
          detail.opponentAdjustedForm
        ),
      leagueForm5:
        structuredClone(
          detail.leagueForm5
        )
    };

    const fixture = {
      canonicalId:
        "cid_deploy_only_home_away_20260729",
      status: "PRE",
      rawStatus:
        "STATUS_SCHEDULED",
      minute: "0'",
      scoreHome: null,
      scoreAway: null
    };

    const result =
      synchronizeDetailStatusState(
        detail,
        fixture,
        {
          patchedAt:
            "2026-07-29T18:00:00.000Z"
        }
      );

    assert.equal(
      result.ok,
      true
    );

    assert.equal(
      result.changed,
      true
    );

    assert.equal(
      detail.basic.minute,
      "0'"
    );

    assert.equal(
      detail.basic.scoreHome,
      null
    );

    assert.equal(
      detail.basic.scoreAway,
      null
    );

    const signature =
      JSON.parse(
        detail.meta.signature
      );

    assert.equal(
      signature.minute,
      "0'"
    );

    assert.equal(
      signature.scoreHome,
      null
    );

    assert.equal(
      signature.scoreAway,
      null
    );

    assert.deepEqual(
      detail.basic.providerRound,
      enrichmentBefore.providerRound
    );

    assert.deepEqual(
      detail.teamNews,
      enrichmentBefore.teamNews
    );

    assert.deepEqual(
      detail.standings,
      enrichmentBefore.standings
    );

    assert.deepEqual(
      detail.opponentAdjustedForm,
      enrichmentBefore.opponentAdjustedForm
    );

    assert.deepEqual(
      detail.leagueForm5,
      enrichmentBefore.leagueForm5
    );

    const assessment =
      assessDetailStatusState(
        detail,
        fixture
      );

    assert.equal(
      assessment.ok,
      true
    );

    assert.equal(
      assessment.basicDifferences.length,
      0
    );

    assert.equal(
      assessment.signatureDifferences.length,
      0
    );
  }
);
