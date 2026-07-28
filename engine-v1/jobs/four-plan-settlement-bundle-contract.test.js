import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  buildFourPlanSettlementBundleDay
} from "./build-four-plan-settlement-bundle-day.js";

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {
    recursive: true
  });

  fs.writeFileSync(
    filePath,
    JSON.stringify(value),
    "utf8"
  );
}

function zeroPickArtifact(dayKey, planKey) {
  return {
    ok: true,
    date: dayKey,
    planKey,
    count: 0,
    picks: []
  };
}

test(
  "four-plan bundle accepts four zero-pick plans",
  () => {
    const dayKey = "2099-02-01";
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "aiml-four-plan-")
    );

    try {
      const valuePaths = {};
      const reportPaths = {};
      const summaryPaths = {};

      for (const planKey of [
        "A",
        "A2",
        "B",
        "B2"
      ]) {
        valuePaths[planKey] =
          path.join(
            tempDir,
            `value-${planKey}.json`
          );

        reportPaths[planKey] =
          path.join(
            tempDir,
            `report-${planKey}.json`
          );

        summaryPaths[planKey] =
          path.join(
            tempDir,
            `summary-${planKey}.json`
          );

        writeJson(
          valuePaths[planKey],
          zeroPickArtifact(dayKey, planKey)
        );
      }

      const bundlePath =
        path.join(tempDir, "bundle.json");

      const aggregateSummaryPath =
        path.join(
          tempDir,
          "aggregate-summary.json"
        );

      const result =
        buildFourPlanSettlementBundleDay(
          dayKey,
          {
            valuePaths,
            reportPaths,
            summaryPaths,
            bundlePath,
            aggregateSummaryPath
          }
        );

      assert.equal(result.ok, true);
      assert.deepEqual(
        result.presentPlans,
        ["A", "A2", "B", "B2"]
      );
      assert.deepEqual(result.missingPlans, []);
      assert.equal(result.aggregate.totalRows, 0);
      assert.equal(result.writesPerformed, 10);

      const aggregate =
        JSON.parse(
          fs.readFileSync(
            aggregateSummaryPath,
            "utf8"
          )
        );

      assert.equal(
        aggregate.schema,
        "ai-matchlab.value-settlement-summary.v2"
      );
      assert.equal(
        aggregate.planKey,
        "FOUR_PLAN"
      );
      assert.equal(
        aggregate.summary.planCount,
        4
      );
      assert.equal(
        aggregate.summary.totalRows,
        0
      );
      assert.deepEqual(aggregate.rows, []);

      for (const planKey of [
        "A",
        "A2",
        "B",
        "B2"
      ]) {
        assert.equal(
          fs.existsSync(reportPaths[planKey]),
          true
        );
        assert.equal(
          fs.existsSync(summaryPaths[planKey]),
          true
        );
      }
    } finally {
      fs.rmSync(tempDir, {
        recursive: true,
        force: true
      });
    }
  }
);

test(
  "missing plan fails before any writes",
  () => {
    const dayKey = "2099-02-02";
    const tempDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "aiml-four-plan-")
    );

    try {
      const valuePaths = {};
      const reportPaths = {};
      const summaryPaths = {};

      for (const planKey of [
        "A",
        "A2",
        "B"
      ]) {
        valuePaths[planKey] =
          path.join(
            tempDir,
            `value-${planKey}.json`
          );

        writeJson(
          valuePaths[planKey],
          zeroPickArtifact(dayKey, planKey)
        );
      }

      valuePaths.B2 =
        path.join(
          tempDir,
          "missing-b2.json"
        );

      for (const planKey of [
        "A",
        "A2",
        "B",
        "B2"
      ]) {
        reportPaths[planKey] =
          path.join(
            tempDir,
            `report-${planKey}.json`
          );

        summaryPaths[planKey] =
          path.join(
            tempDir,
            `summary-${planKey}.json`
          );
      }

      const bundlePath =
        path.join(tempDir, "bundle.json");

      const aggregateSummaryPath =
        path.join(
          tempDir,
          "aggregate-summary.json"
        );

      const result =
        buildFourPlanSettlementBundleDay(
          dayKey,
          {
            valuePaths,
            reportPaths,
            summaryPaths,
            bundlePath,
            aggregateSummaryPath
          }
        );

      assert.equal(result.ok, false);
      assert.deepEqual(
        result.missingPlans,
        ["B2"]
      );
      assert.equal(result.writesPerformed, 0);
      assert.equal(
        fs.existsSync(bundlePath),
        false
      );
      assert.equal(
        fs.existsSync(aggregateSummaryPath),
        false
      );

      for (const filePath of [
        ...Object.values(reportPaths),
        ...Object.values(summaryPaths)
      ]) {
        assert.equal(
          fs.existsSync(filePath),
          false
        );
      }
    } finally {
      fs.rmSync(tempDir, {
        recursive: true,
        force: true
      });
    }
  }
);

test(
  "bundle source paths preserve existing plan layout",
  () => {
    const source = fs.readFileSync(
      new URL(
        "./build-four-plan-settlement-bundle-day.js",
        import.meta.url
      ),
      "utf8"
    );

    for (const token of [
      'resolveDataPath("value", `${dayKey}.json`)',
      '"plan-a2.json"',
      '"plan-b.json"',
      '"plan-b2.json"',
      'requiredPlans: ["A", "A2", "B", "B2"]',
      "failClosedBeforeWrites: true"
    ]) {
      assert.ok(source.includes(token));
    }
  }
);
