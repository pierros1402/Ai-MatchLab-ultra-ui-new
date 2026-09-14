import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

function source(relativeUrl) {
  return fs.readFileSync(new URL(relativeUrl, import.meta.url), "utf8").replace(/\r\n/g, "\n");
}

test("daily coverage evidence is rebuilt after final Details sync and before export", () => {
  const daily = source("../jobs/run-daily-cycle.js");
  const finalDetails = daily.indexOf('[daily-cycle] final-details-sync:done');
  const coverage = daily.indexOf('[daily-cycle] value-coverage-report:start');
  const exportStart = daily.indexOf('[daily-cycle] deploy-snapshot-export:start');

  assert.ok(finalDetails >= 0, "final Details sync marker missing");
  assert.ok(coverage > finalDetails, "coverage report must follow final Details sync");
  assert.ok(exportStart > coverage, "coverage report must precede snapshot export");
  assert.equal(
    (daily.match(/valueCoverageReport = await buildValueCoverageReportDay\(dayKey\);/gu) || []).length,
    1,
    "coverage report must be built exactly once"
  );
});

test("coverage readiness persists full Value coverage and four-plan settlement evidence", () => {
  const gap = source("../jobs/build-league-gap-report-day.js");
  const workflow = source("../../.github/workflows/daily-deploy-snapshot.yml");

  for (const fragment of [
    "valueCoverageEvidence,",
    "valueSettlementEvidence,",
    "four-plan-settlement-bundle.json",
    "value-settlement-summary.json",
    "value-settlement-statistics-"
  ]) {
    assert.ok(gap.includes(fragment), `missing persisted evidence fragment: ${fragment}`);
  }

  assert.ok(
    workflow.includes('git add "data/coverage-readiness/${DAY_KEY}.json"'),
    "coverage-readiness must be staged in the ungated truth checkpoint"
  );
  assert.ok(
    workflow.includes('data/coverage-readiness/${DAY_KEY}\\.json$'),
    "coverage-readiness must remain explicitly allow-listed"
  );
});
