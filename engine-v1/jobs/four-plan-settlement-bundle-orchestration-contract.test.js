import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  fileURLToPath
} from "node:url";

const here = path.dirname(
  fileURLToPath(import.meta.url)
);

const dailyCycle = fs
  .readFileSync(
    path.join(here, "run-daily-cycle.js"),
    "utf8"
  )
  .replace(/\r\n/g, "\n");

function settlementBlock() {
  const start = dailyCycle.indexOf(
    'console.log("[daily-cycle] four-plan-settlement-bundle:start"'
  );

  const end = dailyCycle.indexOf(
    'console.log("[daily-cycle] final-details-sync:start"',
    start
  );

  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  assert.ok(end > start);

  return dailyCycle.slice(start, end);
}

test(
  "daily cycle invokes four-plan bundle builder",
  () => {
    const block = settlementBlock();

    assert.ok(
      block.includes(
        "./engine-v1/jobs/build-four-plan-settlement-bundle-day.js"
      )
    );

    assert.equal(
      block.includes(
        "./engine-v1/jobs/build-value-settlement-from-final-results-day.js"
      ),
      false
    );

    assert.equal(
      block.includes(
        "./engine-v1/jobs/export-value-settlement-summary-file.js"
      ),
      false
    );
  }
);

test(
  "daily cycle validates all four plans before statistics",
  () => {
    const block = settlementBlock();

    const bundleCall = block.indexOf(
      "build-four-plan-settlement-bundle-day.js"
    );

    const completenessCheck = block.indexOf(
      "four_plan_settlement_bundle_not_complete"
    );

    const summaryCheck = block.indexOf(
      "four_plan_aggregate_summary_invalid"
    );

    const statisticsCall = block.indexOf(
      "build-value-settlement-statistics-range.js"
    );

    assert.ok(bundleCall >= 0);
    assert.ok(completenessCheck > bundleCall);
    assert.ok(summaryCheck > completenessCheck);
    assert.ok(statisticsCall > summaryCheck);

    for (const token of [
      "fourPlanComplete",
      'planKey !==',
      '"FOUR_PLAN"',
      "planCount || 0",
      ") !== 4"
    ]) {
      assert.ok(block.includes(token));
    }
  }
);

test(
  "aggregate summary and statistics paths remain compatible",
  () => {
    const block = settlementBlock();

    assert.ok(
      block.includes(
        "data/football-truth/_settlement-summaries/"
      )
    );

    assert.ok(
      block.includes(
        ".value-settlement-summary.json"
      )
    );

    assert.ok(
      block.includes(
        "data/football-truth/_settlement-statistics/"
      )
    );

    assert.ok(
      block.includes(
        "value-settlement-statistics-"
      )
    );
  }
);

test(
  "daily cycle exposes unresolved and by-plan statistics",
  () => {
    const block = settlementBlock();

    for (const token of [
      "unresolvedRows:",
      "valueSettlementStatistics?.byPlan",
      'requiredPlans: ["A", "A2", "B", "B2"]',
      "finalResultWrites: false"
    ]) {
      assert.ok(block.includes(token));
    }
  }
);

test(
  "bundle failure remains write-safe",
  () => {
    const block = settlementBlock();

    const catchIndex = block.indexOf(
      "} catch (error) {"
    );

    assert.ok(catchIndex >= 0);

    const catchBlock = block.slice(
      catchIndex
    );

    for (const token of [
      "valueWrites: false",
      "fixtureWrites: false",
      "historyWrites: false",
      "detailsWrites: false",
      "finalResultWrites: false"
    ]) {
      assert.ok(catchBlock.includes(token));
    }
  }
);
