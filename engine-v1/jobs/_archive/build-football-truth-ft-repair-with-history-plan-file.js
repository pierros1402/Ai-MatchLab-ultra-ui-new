import fs from "fs";
import path from "path";

function readJson(filePath) {
  if (!filePath) throw new Error("Missing JSON path");
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function getArg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  if (index < 0) return fallback;
  const value = process.argv[index + 1];
  if (!value || value.startsWith("--")) return fallback;
  return value;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function asText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function num(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function bucketRowsFromInput(input) {
  if (Array.isArray(input.bucketRows)) return input.bucketRows;
  if (Array.isArray(input.rows)) return input.rows;
  return [];
}

function buildReport({ bucketReport, bucketReportPath }) {
  const rows = bucketRowsFromInput(bucketReport);

  const repairPlanRows = rows
    .filter((row) => row.ftRepairBucket === "repair_ft_with_standings_and_history")
    .map((row) => {
      const missingFTCount = num(row.missingFTCount);

      let repairPlanLane = "standard_history_backed_ft_repair";

      if (missingFTCount >= 10) {
        repairPlanLane = "high_volume_history_backed_ft_repair";
      } else if (missingFTCount <= 2) {
        repairPlanLane = "small_gap_history_backed_ft_repair";
      }

      return {
        leagueSlug: asText(row.leagueSlug),
        competitionSlug: asText(row.competitionSlug || row.leagueSlug),
        competitionName: asText(row.competitionName),
        coverageType: asText(row.coverageType),
        coverageCountry: asText(row.coverageCountry),
        targetDate: asText(row.targetDate),
        seasonKey: asText(row.seasonKey),

        standingsFileExists: row.standingsFileExists === true,
        historyRowsCount: num(row.historyRowsCount),
        historyFinalRowsCount: num(row.historyFinalRowsCount),
        lastHistoryDate: asText(row.lastHistoryDate),

        missingFTCount,
        ftRepairBucket: asText(row.ftRepairBucket),
        ftRepairPriority: asText(row.ftRepairPriority),
        repairPlanLane,

        suggestedNextDiagnostic: "materialize_missing_ft_repair_cases_from_history_context",

        sourceFetch: false,
        canonicalWrites: 0,
        productionWrite: false
      };
    })
    .sort((a, b) => {
      if (b.missingFTCount !== a.missingFTCount) return b.missingFTCount - a.missingFTCount;
      return a.leagueSlug.localeCompare(b.leagueSlug);
    });

  const byRepairPlanLane = {};
  const byPriority = {};

  for (const row of repairPlanRows) {
    byRepairPlanLane[row.repairPlanLane] = (byRepairPlanLane[row.repairPlanLane] || 0) + 1;
    byPriority[row.ftRepairPriority] = (byPriority[row.ftRepairPriority] || 0) + 1;
  }

  return {
    ok: true,
    job: "build-football-truth-ft-repair-with-history-plan-file",
    mode: "read_only_diagnostic",
    input: {
      bucketReportPath
    },
    summary: {
      inputBucketRowCount: rows.length,
      withHistoryRepairRowCount: repairPlanRows.length,
      totalMissingFTCount: repairPlanRows.reduce((sum, row) => sum + row.missingFTCount, 0),
      maxMissingFTCount: repairPlanRows.reduce((max, row) => Math.max(max, row.missingFTCount), 0),

      highVolumeCount: repairPlanRows.filter((row) => row.repairPlanLane === "high_volume_history_backed_ft_repair").length,
      smallGapCount: repairPlanRows.filter((row) => row.repairPlanLane === "small_gap_history_backed_ft_repair").length,
      standardCount: repairPlanRows.filter((row) => row.repairPlanLane === "standard_history_backed_ft_repair").length,

      byRepairPlanLane,
      byPriority,

      sourceFetch: false,
      noFetch: true,
      noWebSearch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    guarantees: {
      noWebSearch: true,
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      usesOnlyProvidedBucketReport: true,
      noCanonicalPromotion: true,
      noFixtureWrites: true,
      noHistoryWrites: true,
      noValueWrites: true,
      noDetailsWrites: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      diagnosticOnly: true
    },
    repairPlanRows
  };
}

function selfTest() {
  const bucketReport = {
    bucketRows: [
      {
        leagueSlug: "aaa.1",
        competitionName: "AAA League",
        standingsFileExists: true,
        historyRowsCount: 100,
        historyFinalRowsCount: 100,
        missingFTCount: 12,
        ftRepairPriority: "high_missing_ft_volume",
        ftRepairBucket: "repair_ft_with_standings_and_history"
      },
      {
        leagueSlug: "bbb.1",
        competitionName: "BBB League",
        standingsFileExists: true,
        historyRowsCount: 80,
        historyFinalRowsCount: 80,
        missingFTCount: 5,
        ftRepairPriority: "normal",
        ftRepairBucket: "repair_ft_with_standings_and_history"
      },
      {
        leagueSlug: "ccc.1",
        competitionName: "CCC League",
        standingsFileExists: true,
        historyRowsCount: 50,
        historyFinalRowsCount: 50,
        missingFTCount: 1,
        ftRepairPriority: "normal",
        ftRepairBucket: "repair_ft_with_standings_and_history"
      },
      {
        leagueSlug: "ddd.1",
        competitionName: "DDD League",
        standingsFileExists: false,
        historyRowsCount: 0,
        historyFinalRowsCount: 0,
        missingFTCount: 3,
        ftRepairPriority: "bootstrap_context_first",
        ftRepairBucket: "repair_ft_without_standings_or_history"
      }
    ]
  };

  const report = buildReport({
    bucketReport,
    bucketReportPath: "self-test-bucket-report"
  });

  if (report.summary.inputBucketRowCount !== 4) throw new Error("self-test input bucket count failed");
  if (report.summary.withHistoryRepairRowCount !== 3) throw new Error("self-test with-history row count failed");
  if (report.summary.totalMissingFTCount !== 18) throw new Error("self-test total missing FT failed");
  if (report.summary.maxMissingFTCount !== 12) throw new Error("self-test max missing FT failed");
  if (report.summary.highVolumeCount !== 1) throw new Error("self-test high volume failed");
  if (report.summary.standardCount !== 1) throw new Error("self-test standard failed");
  if (report.summary.smallGapCount !== 1) throw new Error("self-test small gap failed");
  if (report.guarantees.productionWrite !== false) throw new Error("self-test production write guarantee failed");
  if (report.guarantees.canonicalWrites !== 0) throw new Error("self-test canonical write guarantee failed");

  console.log(JSON.stringify({
    ok: true,
    selfTest: true,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

function main() {
  if (hasFlag("--self-test")) {
    selfTest();
    return;
  }

  const bucketReportPath = getArg("--buckets") || getArg("--input");
  const outputPath = getArg("--output");

  if (!bucketReportPath) throw new Error("Missing required --buckets <path> or --input <path>");
  if (!outputPath) throw new Error("Missing required --output <path>");

  const bucketReport = readJson(bucketReportPath);
  const report = buildReport({
    bucketReport,
    bucketReportPath
  });

  if (report.summary.withHistoryRepairRowCount <= 0) {
    throw new Error("No with-history FT repair rows produced");
  }

  writeJson(outputPath, report);

  console.log(JSON.stringify({
    ok: true,
    output: outputPath,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main();