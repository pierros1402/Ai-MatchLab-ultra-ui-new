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

function splitRowsFromInput(input) {
  if (Array.isArray(input.splitRows)) return input.splitRows;
  if (Array.isArray(input.rows)) return input.rows;
  return [];
}

function buildReport({ splitReport, splitReportPath }) {
  const rows = splitRowsFromInput(splitReport);
  const ftRows = rows.filter((row) => row.batchBLane === "needs_ft_repair_first");

  const bucketRows = ftRows.map((row) => {
    const hasStandings = row.standingsFileExists === true;
    const hasHistory = num(row.historyRowsCount) > 0;
    const hasFinalHistory = num(row.historyFinalRowsCount) > 0;
    const missingFTCount = num(row.missingFTCount);

    let ftRepairBucket = "repair_ft_with_standings_and_history";

    if (!hasStandings && !hasHistory) {
      ftRepairBucket = "repair_ft_without_standings_or_history";
    } else if (hasStandings && !hasHistory) {
      ftRepairBucket = "repair_ft_with_standings_without_history";
    } else if (!hasStandings && hasHistory) {
      ftRepairBucket = "repair_ft_with_history_without_standings";
    }

    let ftRepairPriority = "normal";

    if (missingFTCount >= 10) {
      ftRepairPriority = "high_missing_ft_volume";
    } else if (!hasStandings && !hasHistory) {
      ftRepairPriority = "bootstrap_context_first";
    }

    return {
      leagueSlug: asText(row.leagueSlug),
      competitionSlug: asText(row.competitionSlug || row.leagueSlug),
      competitionName: asText(row.competitionName),
      coverageType: asText(row.coverageType),
      coverageCountry: asText(row.coverageCountry),
      targetDate: asText(row.targetDate),
      seasonKey: asText(row.seasonKey),

      standingsFileExists: hasStandings,
      historyRowsCount: num(row.historyRowsCount),
      historyFinalRowsCount: num(row.historyFinalRowsCount),
      lastHistoryDate: asText(row.lastHistoryDate),

      missingFTCount,
      needsFTRepair: row.needsFTRepair === true,

      canonicalFixtureCountToday: num(row.canonicalFixtureCountToday),
      canonicalFixtureCountNext7Days: num(row.canonicalFixtureCountNext7Days),
      lastKnownFixtureDate: asText(row.lastKnownFixtureDate),
      nextKnownCanonicalFixtureDate: asText(row.nextKnownCanonicalFixtureDate),

      ftRepairBucket,
      ftRepairPriority,

      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false
    };
  });

  const byBucket = {};
  const byPriority = {};
  const byContextShape = {};

  for (const row of bucketRows) {
    byBucket[row.ftRepairBucket] = (byBucket[row.ftRepairBucket] || 0) + 1;
    byPriority[row.ftRepairPriority] = (byPriority[row.ftRepairPriority] || 0) + 1;

    const shape = [
      row.standingsFileExists ? "has_standings" : "no_standings",
      row.historyRowsCount > 0 ? "has_history" : "no_history",
      row.historyFinalRowsCount > 0 ? "has_final_history" : "no_final_history"
    ].join("__");

    byContextShape[shape] = (byContextShape[shape] || 0) + 1;
  }

  return {
    ok: true,
    job: "build-football-truth-ft-repair-lane-buckets-file",
    mode: "read_only_diagnostic",
    input: {
      splitReportPath
    },
    summary: {
      inputSplitRowCount: rows.length,
      ftRepairRowCount: ftRows.length,
      bucketRowCount: bucketRows.length,
      totalMissingFTCount: bucketRows.reduce((sum, row) => sum + row.missingFTCount, 0),

      withStandingsCount: bucketRows.filter((row) => row.standingsFileExists).length,
      withoutStandingsCount: bucketRows.filter((row) => !row.standingsFileExists).length,
      withHistoryCount: bucketRows.filter((row) => row.historyRowsCount > 0).length,
      withoutHistoryCount: bucketRows.filter((row) => row.historyRowsCount <= 0).length,
      withFinalHistoryCount: bucketRows.filter((row) => row.historyFinalRowsCount > 0).length,

      byBucket,
      byPriority,
      byContextShape,

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
      usesOnlyProvidedSplitReport: true,
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
    bucketRows
  };
}

function selfTest() {
  const splitReport = {
    splitRows: [
      {
        leagueSlug: "aaa.1",
        competitionName: "AAA League",
        standingsFileExists: true,
        historyRowsCount: 10,
        historyFinalRowsCount: 10,
        missingFTCount: 2,
        needsFTRepair: true,
        batchBLane: "needs_ft_repair_first"
      },
      {
        leagueSlug: "bbb.1",
        competitionName: "BBB League",
        standingsFileExists: false,
        historyRowsCount: 0,
        historyFinalRowsCount: 0,
        missingFTCount: 3,
        needsFTRepair: true,
        batchBLane: "needs_ft_repair_first"
      },
      {
        leagueSlug: "ccc.1",
        competitionName: "CCC League",
        standingsFileExists: true,
        historyRowsCount: 30,
        historyFinalRowsCount: 30,
        missingFTCount: 12,
        needsFTRepair: true,
        batchBLane: "needs_ft_repair_first"
      },
      {
        leagueSlug: "ddd.1",
        competitionName: "DDD League",
        standingsFileExists: true,
        historyRowsCount: 20,
        historyFinalRowsCount: 20,
        missingFTCount: 0,
        needsFTRepair: false,
        batchBLane: "ready_for_final_or_offseason_verification"
      }
    ]
  };

  const report = buildReport({
    splitReport,
    splitReportPath: "self-test-split-report"
  });

  if (report.summary.inputSplitRowCount !== 4) throw new Error("self-test input split count failed");
  if (report.summary.ftRepairRowCount !== 3) throw new Error("self-test FT repair row count failed");
  if (report.summary.bucketRowCount !== 3) throw new Error("self-test bucket row count failed");
  if (report.summary.totalMissingFTCount !== 17) throw new Error("self-test total missing FT count failed");
  if (report.summary.byBucket.repair_ft_with_standings_and_history !== 2) throw new Error("self-test standings/history bucket failed");
  if (report.summary.byBucket.repair_ft_without_standings_or_history !== 1) throw new Error("self-test no context bucket failed");
  if (report.summary.byPriority.normal !== 1) throw new Error("self-test normal priority failed");
  if (report.summary.byPriority.bootstrap_context_first !== 1) throw new Error("self-test bootstrap priority failed");
  if (report.summary.byPriority.high_missing_ft_volume !== 1) throw new Error("self-test high volume priority failed");
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

  const splitReportPath = getArg("--split") || getArg("--input");
  const outputPath = getArg("--output");

  if (!splitReportPath) throw new Error("Missing required --split <path> or --input <path>");
  if (!outputPath) throw new Error("Missing required --output <path>");

  const splitReport = readJson(splitReportPath);
  const report = buildReport({
    splitReport,
    splitReportPath
  });

  if (report.summary.bucketRowCount <= 0) {
    throw new Error("No FT repair bucket rows produced");
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