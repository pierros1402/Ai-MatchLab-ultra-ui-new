import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildSettlementReport
} from "./build-value-settlement-from-final-results-day.js";
import {
  buildSummary
} from "./export-value-settlement-summary-file.js";
import {
  resolveDataPath
} from "../storage/data-root.js";

const PLAN_DEFINITIONS = Object.freeze([
  Object.freeze({
    planKey: "A",
    fileName: "value.json",
    valuePath(dayKey) {
      return resolveDataPath("value", `${dayKey}.json`);
    }
  }),
  Object.freeze({
    planKey: "A2",
    fileName: "plan-a2.json",
    valuePath(dayKey) {
      return resolveDataPath(
        "value-plans",
        dayKey,
        "plan-a2.json"
      );
    }
  }),
  Object.freeze({
    planKey: "B",
    fileName: "plan-b.json",
    valuePath(dayKey) {
      return resolveDataPath(
        "value-plans",
        dayKey,
        "plan-b.json"
      );
    }
  }),
  Object.freeze({
    planKey: "B2",
    fileName: "plan-b2.json",
    valuePath(dayKey) {
      return resolveDataPath(
        "value-plans",
        dayKey,
        "plan-b2.json"
      );
    }
  })
]);

function clean(value) {
  return String(value ?? "").trim();
}

function parseArgs(argv) {
  const args = {};

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      continue;
    }

    const withoutPrefix = token.slice(2);
    const equalsIndex = withoutPrefix.indexOf("=");

    if (equalsIndex >= 0) {
      args[withoutPrefix.slice(0, equalsIndex)] =
        withoutPrefix.slice(equalsIndex + 1);
      continue;
    }

    const next = argv[index + 1];

    if (next && !next.startsWith("--")) {
      args[withoutPrefix] = next;
      index += 1;
    } else {
      args[withoutPrefix] = true;
    }
  }

  return args;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), {
    recursive: true
  });

  const tempPath =
    `${filePath}.tmp-${process.pid}-${Date.now()}`;

  fs.writeFileSync(
    tempPath,
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8"
  );

  fs.renameSync(tempPath, filePath);
}

function relativeDataPath(filePath) {
  const normalized = path
    .relative(process.cwd(), filePath)
    .replaceAll("\\", "/");

  return normalized || ".";
}

function defaultPaths(dayKey) {
  const diagnosticsDir = resolveDataPath(
    "football-truth",
    "_diagnostics",
    "value-settlement-daily-cycle"
  );

  const summariesDir = resolveDataPath(
    "football-truth",
    "_settlement-summaries"
  );

  return {
    bundle: path.join(
      diagnosticsDir,
      `${dayKey}.four-plan-settlement-bundle.json`
    ),
    aggregateSummary: path.join(
      summariesDir,
      `${dayKey}.value-settlement-summary.json`
    ),
    report(planKey) {
      return path.join(
        diagnosticsDir,
        `${dayKey}.${planKey.toLowerCase()}.value-settlement-report.json`
      );
    },
    summary(planKey) {
      return path.join(
        summariesDir,
        `${dayKey}.${planKey.toLowerCase()}.value-settlement-summary.json`
      );
    }
  };
}

function aggregatePlanSummaries(
  dayKey,
  planEntries,
  bundlePath
) {
  const rows = planEntries.flatMap(
    entry => entry.summary.rows
  );

  const count = result =>
    rows.filter(row => row.result === result).length;

  const winRows = count("WIN");
  const lossRows = count("LOSS");
  const voidRows = count("VOID");
  const unresolvedRows = count("UNRESOLVED");
  const settledRows =
    winRows + lossRows + voidRows;

  return {
    ok: true,
    stage:
      "four_plan_value_settlement_summary_ready",
    schema:
      "ai-matchlab.value-settlement-summary.v2",
    dayKey,
    planKey: "FOUR_PLAN",
    requiredPlans: ["A", "A2", "B", "B2"],
    generatedAt: new Date().toISOString(),
    input: relativeDataPath(bundlePath),
    source: {
      settlementReportStage:
        "four_plan_settlement_bundle",
      requiresVerifiedFinalTruth: true,
      plans: Object.fromEntries(
        planEntries.map(entry => [
          entry.planKey,
          {
            valuePath:
              entry.summary.source?.valuePath || null,
            finalResultsDir:
              entry.summary.source?.finalResultsDir || null,
            reportPath:
              relativeDataPath(entry.reportPath),
            summaryPath:
              relativeDataPath(entry.summaryPath)
          }
        ])
      )
    },
    summary: {
      planCount: planEntries.length,
      valuePicks: planEntries.reduce(
        (sum, entry) =>
          sum +
          Number(
            entry.summary.summary?.valuePicks || 0
          ),
        0
      ),
      verifiedFinalResults: Math.max(
        0,
        ...planEntries.map(entry =>
          Number(
            entry.summary.summary
              ?.verifiedFinalResults || 0
          )
        )
      ),
      totalRows: rows.length,
      settledRows,
      unresolvedRows,
      winRows,
      lossRows,
      voidRows,
      unknownRows:
        rows.length -
        settledRows -
        unresolvedRows
    },
    rows,
    errors: [],
    guarantees: {
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      valueWrites: false,
      fixtureWrites: false,
      historyWrites: false,
      detailsWrites: false,
      finalResultWrites: false,
      trackedSummaryArtifact: true,
      fourPlanBundle: true
    }
  };
}

export function buildFourPlanSettlementBundleDay(
  dayKey,
  options = {}
) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(clean(dayKey))) {
    return {
      ok: false,
      stage:
        "four_plan_settlement_bundle_blocked",
      dayKey: clean(dayKey),
      errors: ["invalid_day_key"],
      writesPerformed: 0
    };
  }

  const paths = defaultPaths(dayKey);
  const planEntries = [];
  const errors = [];

  for (const definition of PLAN_DEFINITIONS) {
    const valuePath =
      options.valuePaths?.[definition.planKey] ||
      definition.valuePath(dayKey);

    const report = buildSettlementReport(
      dayKey,
      {
        valuePath,
        planKey: definition.planKey,
        finalResultsDir:
          options.finalResultsDir,
        canonicalFixturesDir:
          options.canonicalFixturesDir
      }
    );

    if (report.ok !== true) {
      errors.push({
        planKey: definition.planKey,
        reason: "settlement_report_not_ok",
        valuePath:
          relativeDataPath(valuePath)
      });

      continue;
    }

    const reportPath =
      options.reportPaths?.[definition.planKey] ||
      paths.report(definition.planKey);

    const summaryPath =
      options.summaryPaths?.[definition.planKey] ||
      paths.summary(definition.planKey);

    const summary = buildSummary(
      report,
      {
        inputPath: reportPath
      }
    );

    if (summary.ok !== true) {
      errors.push({
        planKey: definition.planKey,
        reason: "settlement_summary_not_ok",
        summaryErrors: summary.errors || []
      });

      continue;
    }

    if (summary.planKey !== definition.planKey) {
      errors.push({
        planKey: definition.planKey,
        reason: "plan_key_mismatch",
        actualPlanKey: summary.planKey
      });

      continue;
    }

    planEntries.push({
      planKey: definition.planKey,
      valuePath,
      reportPath,
      summaryPath,
      report,
      summary
    });
  }

  const presentPlans =
    planEntries.map(entry => entry.planKey);

  const missingPlans =
    PLAN_DEFINITIONS
      .map(definition => definition.planKey)
      .filter(planKey =>
        !presentPlans.includes(planKey)
      );

  if (
    errors.length > 0 ||
    missingPlans.length > 0
  ) {
    return {
      ok: false,
      stage:
        "four_plan_settlement_bundle_blocked",
      schema:
        "ai-matchlab.four-plan-settlement-bundle.v1",
      dayKey,
      generatedAt: new Date().toISOString(),
      requiredPlans: ["A", "A2", "B", "B2"],
      presentPlans,
      missingPlans,
      errors,
      writesPerformed: 0,
      guarantees: {
        failClosedBeforeWrites: true,
        canonicalWrites: 0,
        historyWrites: 0,
        fixtureWrites: 0,
        detailsWrites: 0,
        finalResultWrites: 0
      }
    };
  }

  const bundlePath =
    options.bundlePath || paths.bundle;

  const aggregateSummaryPath =
    options.aggregateSummaryPath ||
    paths.aggregateSummary;

  const aggregateSummary =
    aggregatePlanSummaries(
      dayKey,
      planEntries,
      bundlePath
    );

  const bundle = {
    ok: true,
    stage:
      "four_plan_settlement_bundle_ready",
    schema:
      "ai-matchlab.four-plan-settlement-bundle.v1",
    dayKey,
    generatedAt: new Date().toISOString(),
    requiredPlans: ["A", "A2", "B", "B2"],
    presentPlans,
    missingPlans: [],
    plans: Object.fromEntries(
      planEntries.map(entry => [
        entry.planKey,
        {
          reportPath:
            relativeDataPath(entry.reportPath),
          summaryPath:
            relativeDataPath(entry.summaryPath),
          valuePath:
            relativeDataPath(entry.valuePath),
          reportSummary:
            entry.report.summary,
          settlementSummary:
            entry.summary.summary
        }
      ])
    ),
    aggregateSummaryPath:
      relativeDataPath(aggregateSummaryPath),
    aggregate: aggregateSummary.summary,
    guarantees: {
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      valueWrites: false,
      fixtureWrites: false,
      historyWrites: false,
      detailsWrites: false,
      finalResultWrites: false,
      verifiedFinalTruthRequired: true,
      fourPlanComplete: true
    }
  };

  for (const entry of planEntries) {
    writeJson(entry.reportPath, entry.report);
    writeJson(entry.summaryPath, entry.summary);
  }

  writeJson(
    aggregateSummaryPath,
    aggregateSummary
  );

  writeJson(bundlePath, bundle);

  return {
    ...bundle,
    bundlePath:
      relativeDataPath(bundlePath),
    writesPerformed:
      planEntries.length * 2 + 2
  };
}

function main() {
  const args = parseArgs(process.argv);
  const dayKey = clean(
    args.date ||
    args.day ||
    args.dayKey
  );

  if (!/^\d{4}-\d{2}-\d{2}$/u.test(dayKey)) {
    console.error(
      "Usage: node engine-v1/jobs/build-four-plan-settlement-bundle-day.js --date YYYY-MM-DD"
    );
    process.exit(2);
  }

  const result =
    buildFourPlanSettlementBundleDay(dayKey);

  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        stage: result.stage,
        dayKey: result.dayKey,
        bundlePath:
          result.bundlePath || null,
        aggregateSummaryPath:
          result.aggregateSummaryPath || null,
        presentPlans:
          result.presentPlans || [],
        missingPlans:
          result.missingPlans || [],
        aggregate:
          result.aggregate || null,
        writesPerformed:
          result.writesPerformed
      },
      null,
      2
    )
  );

  if (!result.ok) {
    process.exit(2);
  }
}

const entryUrl = process.argv[1]
  ? pathToFileURL(process.argv[1]).href
  : null;

if (entryUrl === import.meta.url) {
  main();
}
