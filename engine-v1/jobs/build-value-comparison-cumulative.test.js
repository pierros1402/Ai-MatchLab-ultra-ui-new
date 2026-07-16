import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildValueComparisonCumulative } from "./build-value-comparison-cumulative.js";

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "aiml-value-cumulative-"));
}

function summary({ picks = 0, wins = 0, losses = 0, unresolved = 0 }) {
  const settled = wins + losses;
  return {
    picks,
    uniqueMatches: picks,
    settled,
    wins,
    losses,
    unresolved,
    unsupported: 0,
    hitRate: settled ? wins / settled : null,
    oddsAvailable: 0,
    averageOdds: null,
    totalStake: null,
    totalReturn: null,
    profit: null,
    roi: null
  };
}

function writeComparison(dir, day, planA, planB) {
  fs.writeFileSync(path.join(dir, `${day}.json`), JSON.stringify({
    ok: true,
    date: day,
    sourceContract: { planAImmutable: true },
    plans: {
      A: {
        id: "plan-a",
        label: "Plan A - frozen production observation",
        immutable: true,
        summary: planA
      },
      B: {
        id: "plan-b",
        label: "Plan B - strict value-policy-v2.3 observation",
        summary: planB
      }
    }
  }), "utf8");
}

test("cumulative trial starts on 2026-07-05 and includes zero-pick days", () => {
  const dir = tempDir();
  writeComparison(dir, "2026-07-04", summary({ picks: 9, wins: 9 }), summary({}));
  writeComparison(dir, "2026-07-05", summary({ picks: 3, wins: 3 }), summary({ picks: 2, wins: 2 }));
  writeComparison(dir, "2026-07-06", summary({ picks: 2, wins: 1, losses: 1 }), summary({ picks: 2, wins: 1, losses: 1 }));
  writeComparison(dir, "2026-07-07", summary({}), summary({}));

  const result = buildValueComparisonCumulative({
    dir,
    output: path.join(dir, "cumulative.json"),
    write: false,
    requireIntegrityClean: false,
    requireImmutablePlanA: false
  });

  assert.deepEqual(result.payload.daysIncluded, ["2026-07-05", "2026-07-06", "2026-07-07"]);
  assert.equal(result.payload.firstDay, "2026-07-05");
  assert.equal(result.payload.dayCount, 3);
  assert.equal(result.payload.plans.A.totals.picks, 5);
  assert.equal(result.payload.plans.A.totals.wins, 4);
  assert.equal(result.payload.plans.A.totals.losses, 1);
  assert.equal(result.payload.plans.B.totals.picks, 4);
});

test("cumulative can still require clean integrity explicitly", () => {
  const dir = tempDir();
  writeComparison(dir, "2099-01-01", summary({ picks: 1, wins: 1 }), summary({ picks: 1, wins: 1 }));

  const result = buildValueComparisonCumulative({
    dir,
    output: path.join(dir, "cumulative.json"),
    write: false,
    requireIntegrityClean: true,
    requireImmutablePlanA: false
  });

  assert.equal(result.payload.dayCount, 0);
  assert.equal(result.payload.daysExcluded[0].reason, "build_report_missing");
});
