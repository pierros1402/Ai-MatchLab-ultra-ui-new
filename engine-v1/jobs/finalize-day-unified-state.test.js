import test from "node:test";
import assert from "node:assert/strict";

import {
  classifyFinalizationState,
  hasStablePlayedFinalObservation,
  settleValueResultsIfPossible
} from "./finalize-day.js";

import {
  OPERATIONAL_MATCH_STATE
} from "../core/non-played-state.js";

test(
  "finalize-day consumes the shared operational-state contract",
  () => {
    assert.equal(
      classifyFinalizationState({
        status: "SPECIAL",
        rawStatus: "STATUS_SUSPENDED"
      }),
      OPERATIONAL_MATCH_STATE.INTERRUPTED
    );

    assert.equal(
      classifyFinalizationState({
        status: "LIVE",
        rawStatus: "STATUS_DELAYED"
      }),
      OPERATIONAL_MATCH_STATE.DELAYED
    );

    assert.equal(
      classifyFinalizationState({
        operationalState: "STALE_LIVE"
      }),
      OPERATIONAL_MATCH_STATE.LIVE
    );

    assert.equal(
      classifyFinalizationState({
        status: "FT",
        rawStatus: "STATUS_FINAL_PEN"
      }),
      OPERATIONAL_MATCH_STATE.PLAYED_TERMINAL
    );

    assert.equal(
      classifyFinalizationState({
        status: "FT",
        rawStatus: "STATUS_POSTPONED"
      }),
      OPERATIONAL_MATCH_STATE.CONFLICT
    );
  }
);

test(
  "suspended evidence can never satisfy stable played-final confirmation",
  () => {
    const row = {
      matchId: "m1",
      scoreHome: 2,
      scoreAway: 1
    };

    const observations = [
      {
        actualDay: "2026-09-15",
        status: "SUSPENDED",
        scoreHome: 2,
        scoreAway: 1
      }
    ];

    assert.equal(
      hasStablePlayedFinalObservation(
        row,
        "2026-09-15",
        observations
      ),
      false
    );
  }
);

test(
  "stable final confirmation rejects missing-score coercion",
  () => {
    const row = {
      matchId: "m2",
      scoreHome: null,
      scoreAway: null
    };

    const observations = [
      {
        actualDay: "2026-09-15",
        status: "FT",
        rawStatus: "STATUS_FINAL",
        scoreHome: null,
        scoreAway: null
      }
    ];

    assert.equal(
      hasStablePlayedFinalObservation(
        row,
        "2026-09-15",
        observations
      ),
      false
    );
  }
);

test(
  "stable penalty final remains valid played-final evidence",
  () => {
    const row = {
      matchId: "m3",
      scoreHome: 1,
      scoreAway: 1
    };

    const observations = [
      {
        actualDay: "2026-09-15",
        status: "FT",
        rawStatus: "STATUS_FINAL_PEN",
        scoreHome: 1,
        scoreAway: 1
      }
    ];

    assert.equal(
      hasStablePlayedFinalObservation(
        row,
        "2026-09-15",
        observations
      ),
      true
    );
  }
);

test(
  "legacy fixture-score settlement is disabled in favor of verified-final pipeline",
  async () => {
    const result =
      await settleValueResultsIfPossible(
        "2099-01-01"
      );

    assert.equal(result.ok, true);
    assert.equal(result.skipped, true);
    assert.equal(
      result.productionWrite,
      false
    );
    assert.equal(
      result.requiresVerifiedFinalTruth,
      true
    );
    assert.equal(
      result.legacyFixtureScoreSettlementDisabled,
      true
    );
  }
);
