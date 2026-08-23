import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { buildValueA2B2Day } from "../jobs/build-value-a2-b2-day.js";
import {
  evaluateValueRefreshUniverseParity
} from "../jobs/refresh-value-artifacts-day.js";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const source = fs.readFileSync(
  path.join(root, "engine-v1", "jobs", "refresh-value-artifacts-day.js"),
  "utf8"
);

test("Plan B refresh imports the shared observation freeze boundary", () => {
  assert.match(source, /shouldFreezeAdjustedValueObservations/);
  assert.match(source, /from ["']\.\/build-value-a2-b2-day\.js["']/);
});

test("Plan B current-day refresh uses the freeze primitive instead of unconditional rewrite", () => {
  assert.match(
    source,
    /freeze\s*:\s*shouldFreezeAdjustedValueObservations\(date,\s*athensDayKey\(\)\)/
  );

  const planBBlock = source.match(
    /const\s+planB\s*=\s*options\.skipPlanB\s*===\s*true[\s\S]*?outputMode\s*:\s*["']plan-b-observation["'][\s\S]*?\}\);/
  );

  assert.ok(planBBlock, "Plan B observation block must exist");
  assert.doesNotMatch(planBBlock[0], /freeze\s*:\s*false/);
});

test("frozen adjusted plans satisfy the refresh consumer acceptance contract", async () => {
  const adjustedPlans = await buildValueA2B2Day("2026-08-22", {
    calendarDay: "2026-08-22",
    readFrozen: () => ({
      A2: {
        date: "2026-08-22",
        count: 0,
        picks: [],
        frozenObservation: true
      },
      B2: {
        ok: true,
        date: "2026-08-22",
        planId: "plan-b2",
        outputMode: "plan-b2-observation",
        count: 1,
        picks: [{ matchId: "cid_test_frozen_b2_20260822" }],
        frozenObservation: true
      }
    }),
    buildValue: async () => {
      throw new Error("A2 builder must not run for frozen observation");
    },
    deriveValue: () => {
      throw new Error("B2 builder must not run for frozen observation");
    }
  });

  const planA2 = adjustedPlans?.plans?.A2 || null;
  const planB2 = adjustedPlans?.plans?.B2 || null;

  const refreshWouldReject =
    adjustedPlans?.ok !== true ||
    planA2?.ok !== true ||
    planB2?.ok !== true;

  assert.equal(adjustedPlans.ok, true);
  assert.equal(adjustedPlans.freezeObservations, true);
  assert.equal(adjustedPlans.preservedExisting, true);
  assert.equal(planA2.frozenObservation, true);
  assert.equal(planA2.ok, true);
  assert.equal(planB2.frozenObservation, true);
  assert.equal(planB2.ok, true);
  assert.equal(
    refreshWouldReject,
    false,
    "refresh-value-artifacts-day must accept a valid frozen A2/B2 pair"
  );
});
function fixtureUniverse(hash, canonicalIds = ["cid_one", "cid_two"]) {
  return {
    schema: "ai-matchlab.value-fixture-universe.v1",
    source: "canonical_fixtures",
    count: canonicalIds.length,
    hash,
    canonicalIds
  };
}

function frozenParityInputs({
  candidateIds = ["cid_one", "cid_two"],
  candidateHash = "current-hash",
  frozenHash = "frozen-hash",
  bHash = frozenHash
} = {}) {
  const frozenUniverse =
    fixtureUniverse(
      frozenHash
    );

  return {
    frozenProduction: true,

    planACandidate: {
      fixtureUniverse:
        fixtureUniverse(
          candidateHash,
          candidateIds
        )
    },

    publishedPlanA: {
      immutable: true,
      picks: [
        {
          matchId:
            "cid_one"
        }
      ]
    },

    planA2: {
      ok: true,
      fixtureUniverse:
        frozenUniverse
    },

    planB: {
      ok: true,
      sourceContract: {
        fixtureUniverse:
          fixtureUniverse(
            bHash
          )
      }
    },

    planB2: {
      ok: true,
      sourceContract: {
        fixtureUniverse:
          frozenUniverse
      }
    }
  };
}

test(
  "frozen Value cohort accepts descriptor drift only when canonical membership is unchanged",
  () => {
    const result =
      evaluateValueRefreshUniverseParity(
        frozenParityInputs()
      );

    assert.equal(
      result.mode,
      "frozen_observation_cohort"
    );

    assert.equal(
      result.currentVsFrozenMembership.ok,
      true
    );

    assert.equal(
      result.currentVsFrozenMembership.descriptorDrift,
      true
    );

    assert.equal(
      result.legacyPlanAUniverseMissing,
      true
    );

    assert.equal(
      result.frozenPlanAPicks.ok,
      true
    );

    assert.equal(
      result.A2_B.ok,
      true
    );

    assert.equal(
      result.A2_B2.ok,
      true
    );

    assert.equal(
      result.B_B2.ok,
      true
    );
  }
);

test(
  "frozen Value cohort still fails closed when canonical membership changes",
  () => {
    assert.throws(
      () =>
        evaluateValueRefreshUniverseParity(
          frozenParityInputs({
            candidateIds: [
              "cid_one",
              "cid_three"
            ]
          })
        ),
      /VALUE_PLAN_UNIVERSE_MEMBERSHIP_PARITY_FAILED/
    );
  }
);

test(
  "frozen Value cohort retains strict descriptor parity between frozen plans",
  () => {
    assert.throws(
      () =>
        evaluateValueRefreshUniverseParity(
          frozenParityInputs({
            bHash:
              "different-frozen-hash"
          })
        ),
      /VALUE_PLAN_UNIVERSE_PARITY_FAILED/
    );
  }
);

test(
  "non-frozen Value refresh retains strict descriptor parity",
  () => {
    const inputs =
      frozenParityInputs();

    assert.throws(
      () =>
        evaluateValueRefreshUniverseParity({
          ...inputs,
          frozenProduction:
            false
        }),
      /VALUE_PLAN_UNIVERSE_PARITY_FAILED/
    );
  }
);
