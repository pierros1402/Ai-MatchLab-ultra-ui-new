import test from "node:test";
import assert from "node:assert/strict";

import {
  buildValueA2B2Day,
  shouldFreezeAdjustedValueObservations
} from "./build-value-a2-b2-day.js";

const DAY = "2026-09-07";
const PAST = "2026-09-06";
const FUTURE = "2026-09-08";

const ABSENT = Object.freeze({
  planA2: false,
  auditA2: false,
  planB2: false,
  auditB2: false
});

const ALL_PRESENT = Object.freeze({
  planA2: true,
  auditA2: true,
  planB2: true,
  auditB2: true
});

function makeHarness({
  frozen = { A2: null, B2: null },
  presence = ABSENT
} = {}) {
  const calls = {
    frozen: 0,
    presence: 0,
    build: 0,
    derive: 0
  };

  return {
    calls,

    options: {
      ensureOutputDir() {},

      readFrozen() {
        calls.frozen += 1;
        return frozen;
      },

      readPresence() {
        calls.presence += 1;
        return presence;
      },

      async buildValue(dayKey) {
        calls.build += 1;

        return {
          ok: true,
          date: dayKey,
          planId: "plan-a2",
          count: 0,
          picks: []
        };
      },

      deriveValue(dayKey) {
        calls.derive += 1;

        return {
          ok: true,
          date: dayKey,
          planId: "plan-b2",
          outputMode: "plan-b2-observation",
          count: 0,
          picks: []
        };
      }
    }
  };
}

test(
  "freeze policy still includes historical and current day only",
  () => {
    assert.equal(
      shouldFreezeAdjustedValueObservations(PAST, DAY),
      true
    );

    assert.equal(
      shouldFreezeAdjustedValueObservations(DAY, DAY),
      true
    );

    assert.equal(
      shouldFreezeAdjustedValueObservations(FUTURE, DAY),
      false
    );
  }
);

test(
  "current day missing observations fail without explicit bootstrap",
  async () => {
    const h = makeHarness();

    const result =
      await buildValueA2B2Day(DAY, {
        ...h.options,
        calendarDay: DAY
      });

    assert.equal(result.ok, false);

    assert.equal(
      result.reason,
      "missing_or_invalid_frozen_adjusted_value_observation"
    );

    assert.equal(h.calls.build, 0);
    assert.equal(h.calls.derive, 0);
  }
);

test(
  "historical day remains fail closed even with bootstrap option",
  async () => {
    const h = makeHarness();

    const result =
      await buildValueA2B2Day(PAST, {
        ...h.options,
        calendarDay: DAY,
        allowCurrentDayBootstrap: true
      });

    assert.equal(result.ok, false);

    assert.equal(
      result.reason,
      "missing_or_invalid_frozen_adjusted_value_observation"
    );

    assert.equal(h.calls.build, 0);
    assert.equal(h.calls.derive, 0);
  }
);

test(
  "current day bootstraps only when all four artifacts are absent",
  async () => {
    const h = makeHarness();

    const result =
      await buildValueA2B2Day(DAY, {
        ...h.options,
        calendarDay: DAY,
        allowCurrentDayBootstrap: true
      });

    assert.equal(result.ok, true);
    assert.equal(result.freezeObservations, true);
    assert.equal(result.bootstrapCurrentDay, true);
    assert.equal(result.preservedExisting, false);

    assert.deepEqual(
      result.artifactPresence,
      ABSENT
    );

    assert.equal(h.calls.build, 1);
    assert.equal(h.calls.derive, 1);
  }
);

test(
  "current day partial artifact state remains fail closed",
  async () => {
    const h = makeHarness({
      presence: {
        planA2: true,
        auditA2: false,
        planB2: false,
        auditB2: false
      }
    });

    const result =
      await buildValueA2B2Day(DAY, {
        ...h.options,
        calendarDay: DAY,
        allowCurrentDayBootstrap: true
      });

    assert.equal(result.ok, false);

    assert.equal(
      result.reason,
      "missing_or_invalid_frozen_adjusted_value_observation"
    );

    assert.equal(h.calls.build, 0);
    assert.equal(h.calls.derive, 0);
  }
);

test(
  "current day fully present but invalid state remains fail closed",
  async () => {
    const h = makeHarness({
      presence: ALL_PRESENT
    });

    const result =
      await buildValueA2B2Day(DAY, {
        ...h.options,
        calendarDay: DAY,
        allowCurrentDayBootstrap: true
      });

    assert.equal(result.ok, false);

    assert.equal(
      result.reason,
      "missing_or_invalid_frozen_adjusted_value_observation"
    );

    assert.equal(h.calls.build, 0);
    assert.equal(h.calls.derive, 0);
  }
);

test(
  "valid current-day frozen observations are preserved",
  async () => {
    const h = makeHarness({
      frozen: {
        A2: {
          ok: true,
          date: DAY,
          planId: "plan-a2",
          count: 0,
          picks: []
        },

        B2: {
          ok: true,
          date: DAY,
          planId: "plan-b2",
          outputMode: "plan-b2-observation",
          count: 0,
          picks: []
        }
      }
    });

    const result =
      await buildValueA2B2Day(DAY, {
        ...h.options,
        calendarDay: DAY,
        allowCurrentDayBootstrap: true
      });

    assert.equal(result.ok, true);
    assert.equal(result.freezeObservations, true);
    assert.equal(result.preservedExisting, true);
    assert.equal(result.bootstrapCurrentDay, false);

    assert.equal(h.calls.presence, 0);
    assert.equal(h.calls.build, 0);
    assert.equal(h.calls.derive, 0);
  }
);

test(
  "future day keeps ordinary non-frozen generation",
  async () => {
    const h = makeHarness();

    const result =
      await buildValueA2B2Day(FUTURE, {
        ...h.options,
        calendarDay: DAY,
        allowCurrentDayBootstrap: true
      });

    assert.equal(result.ok, true);
    assert.equal(result.freezeObservations, false);
    assert.equal(result.preservedExisting, false);
    assert.equal(result.bootstrapCurrentDay, false);

    assert.equal(h.calls.frozen, 0);
    assert.equal(h.calls.presence, 0);
    assert.equal(h.calls.build, 1);
    assert.equal(h.calls.derive, 1);
  }
);
