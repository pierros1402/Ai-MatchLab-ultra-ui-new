import test from "node:test";
import assert from "node:assert/strict";

import {
  buildValueA2B2Day,
  shouldFreezeAdjustedValueObservations
} from "../jobs/build-value-a2-b2-day.js";

test("adjusted Value observations freeze on the target Athens day and remain frozen historically", () => {
  assert.equal(
    shouldFreezeAdjustedValueObservations("2026-08-21", "2026-08-20"),
    false
  );
  assert.equal(
    shouldFreezeAdjustedValueObservations("2026-08-21", "2026-08-21"),
    true
  );
  assert.equal(
    shouldFreezeAdjustedValueObservations("2026-08-21", "2026-08-22"),
    true
  );
});

test("current-day A2 and B2 observations are preserved without invoking builders", async () => {
  let buildCalls = 0;
  let deriveCalls = 0;

  const frozenA2 = {
    ok: true,
    date: "2026-08-21",
    planId: "plan-a2",
    outputMode: "plan-a2-observation",
    count: 10,
    picks: Array.from({ length: 10 }, (_, i) => ({ matchId: `a2-${i}` })),
    fixtureUniverse: { count: 190, hash: "a2-universe" },
    frozenObservation: true
  };

  const frozenB2 = {
    ok: true,
    date: "2026-08-21",
    planId: "plan-b2",
    outputMode: "plan-b2-observation",
    count: 2,
    picks: [{ matchId: "b2-1" }, { matchId: "b2-2" }],
    sourceContract: {
      canonicalFixtureUniverseRequired: true,
      oddsMemoryCanCreateFixture: false,
      fixtureUniverse: { count: 190, hash: "b2-universe" }
    },
    frozenObservation: true
  };

  const result = await buildValueA2B2Day("2026-08-21", {
    calendarDay: "2026-08-21",
    readFrozen: () => ({ A2: frozenA2, B2: frozenB2 }),
    buildValue: async () => {
      buildCalls += 1;
      throw new Error("A2 builder must not run after day rollover");
    },
    deriveValue: () => {
      deriveCalls += 1;
      throw new Error("B2 builder must not run after day rollover");
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.freezeObservations, true);
  assert.equal(result.preservedExisting, true);
  assert.equal(result.plans.A2.count, 10);
  assert.equal(result.plans.B2.count, 2);
  assert.equal(buildCalls, 0);
  assert.equal(deriveCalls, 0);
});

test("current-day adjusted observations fail closed when a frozen family member is missing", async () => {
  let buildCalls = 0;
  let deriveCalls = 0;

  const result = await buildValueA2B2Day("2026-08-21", {
    calendarDay: "2026-08-21",
    readFrozen: () => ({
      A2: {
        ok: true,
        date: "2026-08-21",
        count: 1,
        picks: [{ matchId: "a2-1" }],
        fixtureUniverse: { count: 190, hash: "a2-universe" }
      },
      B2: null
    }),
    buildValue: async () => {
      buildCalls += 1;
      return { ok: true };
    },
    deriveValue: () => {
      deriveCalls += 1;
      return { ok: true };
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing_or_invalid_frozen_adjusted_value_observation");
  assert.deepEqual(result.missing, ["B2"]);
  assert.equal(buildCalls, 0);
  assert.equal(deriveCalls, 0);
});
