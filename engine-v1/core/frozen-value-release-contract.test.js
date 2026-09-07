import test from "node:test";
import assert from "node:assert/strict";

import {
  evaluateFrozenValueFixtureBinding,
  isFrozenValueGateReleaseSafe,
  isVerifiedHistoricalRecoverySentinel
} from "./frozen-value-release-contract.js";

const DAY = "2026-09-06";

function universe(ids) {
  return {
    schema:
      "ai-matchlab.value-fixture-universe.v1",
    source: "canonical_fixtures",
    count: ids.length,
    hash: "a".repeat(64),
    canonicalIds: [...ids]
  };
}

function recoveryValue(ids = ["cid_a", "cid_b"]) {
  const fixtureUniverse = universe(ids);

  return {
    ok: true,
    date: DAY,
    source:
      "historical_missing_observation_recovery_sentinel",
    count: 0,
    picks: [],
    fixtureUniverse,
    recoveryContract: {
      version: 1,
      mode:
        "historical_missing_observation_zero_pick_sentinel",
      authenticPayloadRecovered: false,
      retrospectivePredictionGeneration: false,
      inventedHistoricalPicks: false
    },
    sourceContract: {
      recoveryObservation: true,
      fixtureUniverse: {
        ...fixtureUniverse,
        canonicalIds:
          [...fixtureUniverse.canonicalIds]
      },
      retrospectiveModelOutputUsed: false,
      deploySnapshotUsedAsFinalTruth: false,
      observationInputArtifact:
        "recovery-contract:no-authentic-original-plan-a-payload",
      observationImmutable: true
    },
    schema:
      "ai-matchlab.value-plan-a-observation.v1",
    planId: "plan-a",
    outputMode: "plan-a-observation",
    immutable: true,
    provenance: {
      kind:
        "historical_missing_observation_recovery_sentinel",
      sourcePath:
        "recovery-contract:no-authentic-original-plan-a-payload",
      reason:
        "original_plan_a_payload_unavailable",
      retrospectiveModelRebuild: false,
      inventedHistoricalPicks: false
    },
    publicationAuthority:
      "frozen_plan_a_observation"
  };
}

function recoveryGate(binding) {
  return {
    mode: binding.mode,
    frozenIdentityBound:
      binding.frozenIdentityBound,
    frozenReleaseSafe:
      binding.releaseSafe,
    orphanPickCount:
      binding.orphanPickCount,
    missingMatchIdPickCount:
      binding.missingMatchIdPickCount,
    recoveryContractBound:
      binding.recoveryContractBound,
    recoveryPublishedUniverseBound:
      binding.recoveryPublishedUniverseBound
  };
}

test(
  "verified historical recovery sentinel is release-safe only on its exact published cohort",
  () => {
    const value = recoveryValue();

    assert.equal(
      isVerifiedHistoricalRecoverySentinel(
        value,
        DAY
      ),
      true
    );

    const binding =
      evaluateFrozenValueFixtureBinding({
        frozenPublicationAuthority: true,
        dayKey: DAY,
        valueArtifact: value,
        fixtures: [
          { canonicalId: "cid_a" },
          { canonicalId: "cid_b" }
        ]
      });

    assert.equal(
      binding.mode,
      "historical_recovery_sentinel"
    );
    assert.equal(
      binding.recoveryContractBound,
      true
    );
    assert.equal(
      binding.recoveryPublishedUniverseBound,
      true
    );
    assert.equal(
      binding.canonicalSourceBound,
      true
    );
    assert.equal(
      binding.frozenIdentityBound,
      true
    );
    assert.equal(
      binding.releaseSafe,
      true
    );

    assert.equal(
      isFrozenValueGateReleaseSafe(
        recoveryGate(binding)
      ),
      true
    );
  }
);

test(
  "historical recovery sentinel fails closed when the published cohort differs",
  () => {
    const binding =
      evaluateFrozenValueFixtureBinding({
        frozenPublicationAuthority: true,
        dayKey: DAY,
        valueArtifact: recoveryValue(),
        fixtures: [
          { canonicalId: "cid_a" },
          { canonicalId: "cid_c" }
        ]
      });

    assert.equal(
      binding.recoveryContractBound,
      true
    );
    assert.equal(
      binding.recoveryPublishedUniverseBound,
      false
    );
    assert.equal(
      binding.frozenIdentityBound,
      false
    );
    assert.equal(
      binding.releaseSafe,
      false
    );
    assert.equal(
      isFrozenValueGateReleaseSafe(
        recoveryGate(binding)
      ),
      false
    );
  }
);

test(
  "historical recovery sentinel fails closed if retrospective generation is claimed",
  () => {
    const value = recoveryValue();

    value.recoveryContract
      .retrospectivePredictionGeneration =
        true;

    assert.equal(
      isVerifiedHistoricalRecoverySentinel(
        value,
        DAY
      ),
      false
    );

    const binding =
      evaluateFrozenValueFixtureBinding({
        frozenPublicationAuthority: true,
        dayKey: DAY,
        valueArtifact: value,
        fixtures: [
          { canonicalId: "cid_a" },
          { canonicalId: "cid_b" }
        ]
      });

    assert.equal(
      binding.mode,
      "historical_recovery_sentinel"
    );
    assert.equal(
      binding.recoveryContractBound,
      false
    );
    assert.equal(
      binding.releaseSafe,
      false
    );
  }
);

test(
  "ordinary frozen Plan A contract remains unchanged",
  () => {
    const value = {
      date: DAY,
      source: "canonical_fixtures",
      count: 1,
      picks: [
        { matchId: "cid_a" }
      ]
    };

    const binding =
      evaluateFrozenValueFixtureBinding({
        frozenPublicationAuthority: true,
        dayKey: DAY,
        valueArtifact: value,
        fixtures: [
          { canonicalId: "cid_a" }
        ]
      });

    assert.equal(
      binding.mode,
      "frozen_snapshot"
    );
    assert.equal(
      binding.recoveryContractBound,
      false
    );
    assert.equal(
      binding.recoveryPublishedUniverseBound,
      false
    );
    assert.equal(
      binding.frozenIdentityBound,
      true
    );
    assert.equal(
      binding.releaseSafe,
      true
    );

    assert.equal(
      isFrozenValueGateReleaseSafe({
        mode: binding.mode,
        frozenIdentityBound:
          binding.frozenIdentityBound,
        frozenReleaseSafe:
          binding.releaseSafe,
        orphanPickCount:
          binding.orphanPickCount,
        missingMatchIdPickCount:
          binding.missingMatchIdPickCount
      }),
      true
    );
  }
);
