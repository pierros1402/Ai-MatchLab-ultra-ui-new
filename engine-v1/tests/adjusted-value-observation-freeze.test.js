import test from "node:test";
import assert from "node:assert/strict";

import {
  buildValueA2B2Day,
  shouldFreezeAdjustedValueObservations
} from "../jobs/build-value-a2-b2-day.js";

test("adjusted Value observations remain mutable only before their Athens day", () => {
  assert.equal(
    shouldFreezeAdjustedValueObservations("2026-08-23", "2026-08-22"),
    false
  );
  assert.equal(
    shouldFreezeAdjustedValueObservations("2026-08-22", "2026-08-22"),
    true
  );
  assert.equal(
    shouldFreezeAdjustedValueObservations("2026-08-21", "2026-08-22"),
    true
  );
});

test("current-day A2/B2 are preserved without invoking either builder", async () => {
  let a2BuildCalls = 0;
  let b2BuildCalls = 0;

  const result = await buildValueA2B2Day("2026-08-22", {
    calendarDay: "2026-08-22",
    readFrozen: () => ({
      A2: {
        date: "2026-08-22",
        count: 3,
        picks: [{ matchId: "a" }, { matchId: "b" }, { matchId: "c" }],
        frozenObservation: true
      },
      B2: {
        ok: true,
        date: "2026-08-22",
        planId: "plan-b2",
        outputMode: "plan-b2-observation",
        count: 1,
        picks: [{ matchId: "d" }],
        frozenObservation: true
      }
    }),
    buildValue: async () => {
      a2BuildCalls += 1;
      throw new Error("A2 builder must not run after rollover");
    },
    deriveValue: () => {
      b2BuildCalls += 1;
      throw new Error("B2 builder must not run after rollover");
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.freezeObservations, true);
  assert.equal(result.preservedExisting, true);
  assert.equal(result.plans.A2.count, 3);
  assert.equal(result.plans.A2.ok, true);
  assert.equal(result.plans.B2.count, 1);
  assert.equal(a2BuildCalls, 0);
  assert.equal(b2BuildCalls, 0);
});

test("missing current-day adjusted observation fails closed instead of rebuilding", async () => {
  let a2BuildCalls = 0;
  let b2BuildCalls = 0;

  const result = await buildValueA2B2Day("2026-08-22", {
    calendarDay: "2026-08-22",
    readFrozen: () => ({ A2: { count: 0, picks: [] }, B2: null }),
    buildValue: async () => {
      a2BuildCalls += 1;
      return { ok: true };
    },
    deriveValue: () => {
      b2BuildCalls += 1;
      return { ok: true };
    }
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "missing_or_invalid_frozen_adjusted_value_observation");
  assert.deepEqual(result.missing, ["B2"]);
  assert.equal(a2BuildCalls, 0);
  assert.equal(b2BuildCalls, 0);
});

test("future-day A2/B2 still rebuild during pre-midnight preparation", async () => {
  let a2BuildCalls = 0;
  let b2BuildCalls = 0;

  const result = await buildValueA2B2Day("2026-08-23", {
    calendarDay: "2026-08-22",
    buildValue: async () => {
      a2BuildCalls += 1;
      return { ok: true, count: 2, picks: [{}, {}] };
    },
    deriveValue: () => {
      b2BuildCalls += 1;
      return { ok: true, count: 1, picks: [{}] };
    }
  });

  assert.equal(result.ok, true);
  assert.equal(result.freezeObservations, false);
  assert.equal(result.preservedExisting, false);
  assert.equal(a2BuildCalls, 1);
  assert.equal(b2BuildCalls, 1);
});
