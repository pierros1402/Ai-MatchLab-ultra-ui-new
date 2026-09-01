import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateFrozenValueFixtureBinding,
  isFrozenPlanAPublication,
  isFrozenValueGateReleaseSafe
} from "../core/frozen-value-release-contract.js";

const fixtures = [{
  canonicalId: "cid_test_home_away_20990817",
  matchId: "provider-17"
}];

test("frozen Value is release-safe only when every pick is same-day identity-bound", () => {
  const binding = evaluateFrozenValueFixtureBinding({
    preserveSnapshotValueBytes: true,
    dayKey: "2099-08-17",
    valueArtifact: {
      date: "2099-08-17",
      source: "canonical_fixtures",
      count: 2,
      picks: [
        { matchId: "cid_test_home_away_20990817", market: "1X2" },
        { matchId: "cid_test_home_away_20990817", market: "BTTS" }
      ]
    },
    fixtures
  });
  assert.equal(binding.mode, "frozen_snapshot");
  assert.equal(binding.frozenIdentityBound, true);
  assert.equal(binding.releaseSafe, true);
  assert.equal(binding.orphanPickCount, 0);
  assert.equal(binding.missingMatchIdPickCount, 0);
});

test("orphan frozen pick fails closed", () => {
  const binding = evaluateFrozenValueFixtureBinding({
    preserveSnapshotValueBytes: true,
    dayKey: "2099-08-17",
    valueArtifact: {
      date: "2099-08-17",
      source: "canonical_fixtures",
      count: 1,
      picks: [{ matchId: "cid_orphan_20990817" }]
    },
    fixtures
  });
  assert.equal(binding.releaseSafe, false);
  assert.deepEqual(binding.orphanPickIds, ["cid_orphan_20990817"]);
});

test("full export recognizes immutable Plan A publication authority", () => {
  const valueArtifact = {
    date: "2099-08-17",
    source: "canonical_fixtures",
    planId: "plan-a",
    outputMode:
      "plan-a-observation",
    immutable: true,
    publicationAuthority:
      "frozen_plan_a_observation",
    count: 1,
    picks: [
      {
        matchId:
          "cid_test_home_away_20990817"
      }
    ]
  };

  assert.equal(
    isFrozenPlanAPublication(
      valueArtifact
    ),
    true
  );

  const binding =
    evaluateFrozenValueFixtureBinding({
      preserveSnapshotValueBytes:
        false,
      frozenPublicationAuthority:
        isFrozenPlanAPublication(
          valueArtifact
        ),
      dayKey:
        "2099-08-17",
      valueArtifact,
      fixtures
    });

  assert.equal(
    binding.mode,
    "frozen_snapshot"
  );

  assert.equal(
    binding.releaseSafe,
    true
  );
});

test("mutable Plan A cannot claim full-export frozen authority", () => {
  const valueArtifact = {
    date: "2099-08-17",
    source: "canonical_fixtures",
    planId: "plan-a",
    outputMode: "production",
    count: 0,
    picks: []
  };

  assert.equal(
    isFrozenPlanAPublication(
      valueArtifact
    ),
    false
  );

  const binding =
    evaluateFrozenValueFixtureBinding({
      frozenPublicationAuthority:
        isFrozenPlanAPublication(
          valueArtifact
        ),
      dayKey:
        "2099-08-17",
      valueArtifact,
      fixtures
    });

  assert.equal(
    binding.releaseSafe,
    false
  );
});

test("wrong-day, missing-id, or non-canonical frozen artifacts fail closed", () => {
  const cases = [
    { date: "2099-08-16", source: "canonical_fixtures", count: 0, picks: [] },
    { date: "2099-08-17", source: "legacy_value", count: 0, picks: [] },
    { date: "2099-08-17", source: "canonical_fixtures", count: 1, picks: [{}] }
  ];
  for (const valueArtifact of cases) {
    const binding = evaluateFrozenValueFixtureBinding({
      preserveSnapshotValueBytes: true,
      dayKey: "2099-08-17",
      valueArtifact,
      fixtures
    });
    assert.equal(binding.releaseSafe, false);
  }
});

test("frozen gate waiver requires explicit complete binding evidence", () => {
  const green = {
    mode: "frozen_snapshot",
    frozenIdentityBound: true,
    frozenReleaseSafe: true,
    orphanPickCount: 0,
    missingMatchIdPickCount: 0
  };
  assert.equal(isFrozenValueGateReleaseSafe(green), true);
  assert.equal(isFrozenValueGateReleaseSafe({ ...green, orphanPickCount: 1 }), false);
  assert.equal(isFrozenValueGateReleaseSafe({ ...green, mode: "current_value" }), false);
});
