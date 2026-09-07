import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHistoricalRecoveryPublicationBindingArtifact
} from "./export-deploy-snapshot-day.js";

const RECOVERY =
  "historical_missing_observation_recovery_sentinel";

function universe(
  ids,
  hash = "a".repeat(64)
) {
  return {
    schema:
      "ai-matchlab.value-fixture-universe.v1",
    source:
      "canonical_fixtures",
    count:
      ids.length,
    hash,
    canonicalIds:
      [...ids]
  };
}

function recoverySibling(
  day,
  fixtureUniverse
) {
  return {
    ok: true,
    date: day,
    source: RECOVERY,
    count: 0,
    picks: [],

    sourceContract: {
      recoveryObservation: true,
      retrospectiveModelOutputUsed: false,
      fixtureUniverse
    },

    recoveryContract: {
      authenticPayloadRecovered: false,
      retrospectivePredictionGeneration: false,
      inventedHistoricalPicks: false
    }
  };
}

function recoveryValue(
  day,
  fixtureUniverse = null
) {
  return {
    ok: true,
    date: day,
    schema:
      "ai-matchlab.value-plan-a-observation.v1",
    planId:
      "plan-a",
    outputMode:
      "plan-a-observation",
    immutable: true,
    source: RECOVERY,
    publicationAuthority:
      "frozen_plan_a_observation",
    count: 0,
    picks: [],

    ...(fixtureUniverse
      ? {
          fixtureUniverse
        }
      : {}),

    sourceContract: {
      recoveryObservation: true,
      retrospectiveModelOutputUsed: false,

      ...(fixtureUniverse
        ? {
            fixtureUniverse
          }
        : {})
    },

    recoveryContract: {
      authenticPayloadRecovered: false,
      retrospectivePredictionGeneration: false,
      inventedHistoricalPicks: false
    }
  };
}

test(
  "missing Plan A universe is supplied only by exact A2/B/B2/current consensus",
  () => {
    const day = "2026-09-01";
    const u = universe(
      ["cid_a", "cid_b"]
    );

    const original =
      recoveryValue(day);

    const result =
      buildHistoricalRecoveryPublicationBindingArtifact({
        dayKey: day,
        valueArtifact: original,
        planA2Artifact:
          recoverySibling(day, u),
        planBArtifact:
          recoverySibling(day, u),
        planB2Artifact:
          recoverySibling(day, u),
        currentUniverse: u
      });

    assert.equal(
      result.evidence?.source,
      "frozen_sibling_consensus"
    );

    assert.equal(
      result.evidence?.count,
      2
    );

    assert.deepEqual(
      result.evidence?.plans,
      ["A2", "B", "B2"]
    );

    assert.deepEqual(
      result.valueArtifact.fixtureUniverse,
      u
    );

    assert.deepEqual(
      result.valueArtifact
        .sourceContract
        .fixtureUniverse,
      u
    );

    // Immutable source object itself was not changed.
    assert.equal(
      original.fixtureUniverse,
      undefined
    );

    assert.equal(
      original.sourceContract.fixtureUniverse,
      undefined
    );
  }
);

test(
  "consensus fails closed when one sibling universe differs",
  () => {
    const day = "2026-09-01";

    const u =
      universe(["cid_a"]);

    const different =
      universe(
        ["cid_x"],
        "b".repeat(64)
      );

    const original =
      recoveryValue(day);

    const result =
      buildHistoricalRecoveryPublicationBindingArtifact({
        dayKey: day,
        valueArtifact: original,
        planA2Artifact:
          recoverySibling(day, u),
        planBArtifact:
          recoverySibling(
            day,
            different
          ),
        planB2Artifact:
          recoverySibling(day, u),
        currentUniverse: u
      });

    assert.equal(
      result.evidence,
      null
    );

    assert.strictEqual(
      result.valueArtifact,
      original
    );
  }
);

test(
  "consensus fails closed when current canonical universe differs",
  () => {
    const day = "2026-09-01";

    const frozen =
      universe(["cid_a"]);

    const current =
      universe(
        ["cid_a", "cid_b"],
        "c".repeat(64)
      );

    const original =
      recoveryValue(day);

    const result =
      buildHistoricalRecoveryPublicationBindingArtifact({
        dayKey: day,
        valueArtifact: original,
        planA2Artifact:
          recoverySibling(
            day,
            frozen
          ),
        planBArtifact:
          recoverySibling(
            day,
            frozen
          ),
        planB2Artifact:
          recoverySibling(
            day,
            frozen
          ),
        currentUniverse:
          current
      });

    assert.equal(
      result.evidence,
      null
    );

    assert.strictEqual(
      result.valueArtifact,
      original
    );
  }
);

test(
  "embedded frozen recovery universe wins over later current-universe growth",
  () => {
    const day = "2026-09-06";

    const frozen =
      universe(
        ["cid_a"],
        "d".repeat(64)
      );

    const current =
      universe(
        ["cid_a", "cid_new"],
        "e".repeat(64)
      );

    const original =
      recoveryValue(
        day,
        frozen
      );

    const result =
      buildHistoricalRecoveryPublicationBindingArtifact({
        dayKey: day,
        valueArtifact: original,
        planA2Artifact: null,
        planBArtifact: null,
        planB2Artifact: null,
        currentUniverse:
          current
      });

    assert.equal(
      result.evidence?.source,
      "artifact_embedded"
    );

    assert.strictEqual(
      result.valueArtifact,
      original
    );

    assert.equal(
      result.evidence?.count,
      1
    );
  }
);

test(
  "ordinary non-recovery Value artifact is untouched",
  () => {
    const valueArtifact = {
      ok: true,
      date: "2026-09-07",
      source:
        "canonical_fixtures",
      count: 0,
      picks: []
    };

    const result =
      buildHistoricalRecoveryPublicationBindingArtifact({
        dayKey:
          "2026-09-07",
        valueArtifact
      });

    assert.equal(
      result.evidence,
      null
    );

    assert.strictEqual(
      result.valueArtifact,
      valueArtifact
    );
  }
);
