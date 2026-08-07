import assert from "node:assert/strict";
import test from "node:test";

import {
  collectValueSettlementIssues,
  settlementAgeDays
} from "./value-settlement-policy.js";

function inputs(dayKey, todayDayKey, unresolved) {
  return {
    dayKey,
    todayDayKey,
    buildReport: {
      settlement: {
        planA: { picks: unresolved, settled: 0, unresolved }
      }
    }
  };
}

test("same-day unresolved settlement stays informational", () => {
  const issues = collectValueSettlementIssues(inputs("2026-08-07", "2026-08-07", 3));
  assert.equal(issues.length, 1);
  assert.equal(issues[0].severity, "info");
  assert.equal(issues[0].details.overdue, false);
});

test("D-1 unresolved settlement becomes actionable warning", () => {
  const issues = collectValueSettlementIssues(inputs("2026-08-06", "2026-08-07", 3));
  assert.equal(issues[0].severity, "warning");
  assert.equal(issues[0].details.ageDays, 1);
  assert.equal(issues[0].details.overdue, true);
});

test("D-2+ unresolved settlement is an error", () => {
  const issues = collectValueSettlementIssues(inputs("2026-08-05", "2026-08-07", 2));
  assert.equal(issues[0].severity, "error");
  assert.equal(settlementAgeDays("2026-08-05", "2026-08-07"), 2);
});

test("settled comparison overrides stale unresolved build report", () => {
  const issues = collectValueSettlementIssues({
    ...inputs("2026-08-06", "2026-08-07", 3),
    valueComparison: {
      plans: {
        A: { summary: { picks: 3, settled: 3, unresolved: 0 } }
      }
    }
  });
  assert.deepEqual(issues, []);
});

test("comparison unresolved count is preferred over build report", () => {
  const issues = collectValueSettlementIssues({
    ...inputs("2026-08-06", "2026-08-07", 3),
    valueComparison: {
      plans: {
        A: { summary: { picks: 3, settled: 2, unresolved: 1 } }
      }
    }
  });
  assert.equal(issues.length, 1);
  assert.equal(issues[0].source, "value-comparison");
  assert.equal(issues[0].details.unresolved, 1);
});
