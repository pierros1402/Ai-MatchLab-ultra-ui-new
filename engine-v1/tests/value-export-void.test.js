import test from "node:test";
import assert from "node:assert/strict";

import {
  buildValueExportReport,
  comparisonToValueExportDay
} from "../core/value-export-report.js";

test("closed-day postponed picks export as VOID and keep the report complete", () => {
  const date = "2026-08-08";
  const comparison = {
    plans: {
      A: {
        summary: {
          picks: 1,
          wins: 0,
          losses: 0,
          voids: 1,
          unresolved: 0
        },
        picks: [
          {
            matchId: "cid_postponed",
            market: "1X2",
            pick: "HOME",
            score: null,
            confidence: null,
            finalScore: null,
            finalStatus: "STATUS_POSTPONED",
            result: "VOID"
          }
        ]
      },
      A2: { picks: [] },
      B: { picks: [] },
      B2: { picks: [] }
    }
  };

  const day = comparisonToValueExportDay({ date, comparison });
  const report = buildValueExportReport({
    from: date,
    to: date,
    days: [date],
    dayRecords: [day],
    today: "2026-08-09"
  });

  assert.equal(report.plans.A.picks[0].result, "VOID");
  assert.equal(report.plans.A.picks[0].finalScore, null);
  assert.equal(report.plans.A.picks[0].score, null);
  assert.equal(report.plans.A.daily[0].voids, 1);
  assert.equal(report.plans.A.daily[0].unresolved, 0);
  assert.equal(report.plans.A.daily[0].status, "COMPLETE_WITH_PICKS");
  assert.equal(report.integrity.status, "COMPLETE");
  assert.equal(report.integrity.unresolvedClosedDays.length, 0);
});
