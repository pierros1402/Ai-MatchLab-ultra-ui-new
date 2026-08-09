import test from "node:test";
import assert from "node:assert/strict";

import {
  reconcileObservations
} from "../core/reconcile-observations.js";

const dayKey =
  "2026-07-19";

const canonicalId =
  "cid_kaz1_ertispavlodar_astana_20260719";

const providerMatchId =
  "ldvtm1Wg";

function existingFinal() {
  return {
    canonicalId,
    matchId: canonicalId,

    dayKey,

    source: "flashscore",
    sourceId:
      providerMatchId,
    sourceMatchId:
      providerMatchId,

    homeTeam:
      "Ertis Pavlodar",

    awayTeam:
      "FC Astana",

    kickoffUtc:
      "2026-07-19T14:00:00.000Z",

    status: "FT",
    rawStatus: "STATUS_FINAL",
    statusType: "STATUS_FINAL",
    minute: "FT",

    scoreHome: 0,
    scoreAway: 0
  };
}

function specialObservation({
  decisionBacked
}) {
  const row = {
    canonicalId,
    matchId: canonicalId,

    dayKey,

    source: "flashscore",
    sourceId:
      providerMatchId,
    sourceMatchId:
      providerMatchId,

    ts: Date.now(),

    homeTeam:
      "Ertis Pavlodar",

    awayTeam:
      "FC Astana",

    kickoffUtc:
      "2026-07-19T14:00:00.000Z",

    status:
      "STATUS_POSTPONED",

    rawStatus:
      "STATUS_POSTPONED",

    statusType:
      "STATUS_POSTPONED",

    minute: null,
    scoreHome: null,
    scoreAway: null
  };

  if (!decisionBacked) {
    return row;
  }

  row.statusCorrection = {
    decisionId:
      "flashscore-nonplayed-20260719-ldvtm1Wg-v1",

    policyVersion:
      "flashscore-nonplayed-decision-v1",

    reason:
      "approved_flashscore_nonplayed_decision",

    correctedFrom: {
      status: "FT",
      rawStatus:
        "STATUS_FINAL",
      statusType:
        "STATUS_FINAL",
      minute: "FT",
      scoreHome: 0,
      scoreAway: 0
    },

    correctedTo: {
      status:
        "STATUS_POSTPONED",

      rawStatus:
        "STATUS_POSTPONED",

      statusType:
        "STATUS_POSTPONED",

      minute: null,
      scoreHome: null,
      scoreAway: null
    },

    providerEvidence: {
      provider:
        "flashscore",

      providerMatchId,

      statusCode: "3",
      statusDetailCode: "4",

      playedFinal: false,
      nonPlayedTerminal: true,

      scoreHome: null,
      scoreAway: null
    }
  };

  return row;
}

test(
  "unbacked SPECIAL observation cannot retract an existing terminal result",
  async () => {
    const result =
      await reconcileObservations({
        env: {},
        sideEffects: false,

        existing:
          existingFinal(),

        observations: [
          specialObservation({
            decisionBacked:
              false
          })
        ]
      });

    assert.equal(
      result.status,
      "FT"
    );

    assert.equal(
      result.scoreHome,
      0
    );

    assert.equal(
      result.scoreAway,
      0
    );

    assert.equal(
      result
        .reconcileMeta
        ?.chosenStatusSource,
      "existing"
    );

    assert.equal(
      result
        .statusCorrection,
      null
    );
  }
);

test(
  "exact decision-backed SPECIAL observation can retract the poisoned terminal result",
  async () => {
    const result =
      await reconcileObservations({
        env: {},
        sideEffects: false,

        existing:
          existingFinal(),

        observations: [
          specialObservation({
            decisionBacked:
              true
          })
        ]
      });

    assert.equal(
      result.status,
      "STATUS_POSTPONED"
    );

    assert.equal(
      result.rawStatus,
      "STATUS_POSTPONED"
    );

    assert.equal(
      result.operationalState,
      "SPECIAL"
    );

    assert.equal(
      result.isDisplayFinal,
      false
    );

    assert.equal(
      result.scoreHome,
      null
    );

    assert.equal(
      result.scoreAway,
      null
    );

    assert.equal(
      result
        .sources
        ?.flashscore
        ?.scoreHome,
      null
    );

    assert.equal(
      result
        .sources
        ?.flashscore
        ?.scoreAway,
      null
    );

    assert.equal(
      result
        .reconcileMeta
        ?.chosenStatusSource,
      "flashscore"
    );

    assert.equal(
      result
        .reconcileMeta
        ?.chosenScoreSource,
      null
    );

    assert.equal(
      result
        .reconcileMeta
        ?.decision
        ?.status
        ?.type,
      "approved_status_correction"
    );

    assert.equal(
      result
        .reconcileMeta
        ?.decision
        ?.status
        ?.decisionId,
      "flashscore-nonplayed-20260719-ldvtm1Wg-v1"
    );

    assert.equal(
      result
        .statusCorrection
        ?.decisionId,
      "flashscore-nonplayed-20260719-ldvtm1Wg-v1"
    );
  }
);

test(
  "decision-backed override fails closed when provider evidence is altered",
  async () => {
    const row =
      specialObservation({
        decisionBacked:
          true
      });

    row
      .statusCorrection
      .providerEvidence
      .providerMatchId =
        "different-provider-id";

    const result =
      await reconcileObservations({
        env: {},
        sideEffects: false,

        existing:
          existingFinal(),

        observations: [
          row
        ]
      });

    assert.equal(
      result.status,
      "FT"
    );

    assert.equal(
      result.scoreHome,
      0
    );

    assert.equal(
      result.scoreAway,
      0
    );

    assert.equal(
      result.statusCorrection,
      null
    );
  }
);

test(
  "autonomous exact-provider non-played correction survives reconciliation",
  async () => {
    const autoCanonicalId =
      "cid_blr1_belshina_dinminsk_20260808";

    const existing = {
      canonicalId: autoCanonicalId,
      matchId: autoCanonicalId,
      dayKey: "2026-08-08",
      leagueSlug: "blr.1",
      source: "flashscore",
      sourceId: "4nadNw3N",
      sourceMatchId: "4nadNw3N",
      homeTeam: "Belshina",
      awayTeam: "Din. Minsk",
      kickoffUtc: "2026-08-08T11:00:00.000Z",
      status: "STATUS_SCHEDULED",
      rawStatus: "STATUS_SCHEDULED",
      statusType: null,
      minute: null,
      scoreHome: null,
      scoreAway: null
    };

    const observation = {
      ...existing,
      ts: Date.now(),
      status: "STATUS_POSTPONED",
      rawStatus: "STATUS_POSTPONED",
      statusType: "STATUS_POSTPONED",
      statusCorrection: {
        decisionId:
          "flashscore-nonplayed-auto-20260808-4nadNw3N-v1",
        policyVersion:
          "flashscore-nonplayed-autonomous-v1",
        decisionMode:
          "autonomous_exact_provider_occurrence",
        reason:
          "verified_flashscore_nonplayed_decision",
        correctedTo: {
          status: "STATUS_POSTPONED",
          rawStatus: "STATUS_POSTPONED",
          statusType: "STATUS_POSTPONED",
          minute: null,
          scoreHome: null,
          scoreAway: null
        },
        providerEvidence: {
          provider: "flashscore",
          providerMatchId: "4nadNw3N",
          canonicalSource: "flashscore",
          canonicalProviderMatchId: "4nadNw3N",
          home: "Belshina",
          away: "Din. Minsk",
          kickoffUtc: "2026-08-08T11:00:00.000Z",
          statusCode: "3",
          statusDetailCode: "4",
          playedFinal: false,
          finished: false,
          nonPlayedTerminal: true,
          scoreHome: null,
          scoreAway: null
        }
      }
    };

    const result =
      await reconcileObservations({
        env: {},
        sideEffects: false,
        existing,
        observations: [observation]
      });

    assert.equal(result.status, "STATUS_POSTPONED");
    assert.equal(result.scoreHome, null);
    assert.equal(result.scoreAway, null);
    assert.equal(
      result.statusCorrection?.decisionId,
      "flashscore-nonplayed-auto-20260808-4nadNw3N-v1"
    );
  }
);
