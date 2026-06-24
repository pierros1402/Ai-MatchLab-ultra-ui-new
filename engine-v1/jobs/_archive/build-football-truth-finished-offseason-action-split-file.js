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

function boolValue(value) {
  return value === true || asText(value).toLowerCase() === "true";
}

function num(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function rowsFromInventory(input) {
  if (Array.isArray(input.inventoryRows)) return input.inventoryRows;
  if (Array.isArray(input.footballTruthStateInventoryRows)) return input.footballTruthStateInventoryRows;
  if (Array.isArray(input.rows)) return input.rows;
  return [];
}

function finishedRowsFromWorkset(input) {
  if (Array.isArray(input.finishedOrOffseasonRows)) return input.finishedOrOffseasonRows;
  if (Array.isArray(input.finishedOrOffseasonCandidateRows)) return input.finishedOrOffseasonCandidateRows;

  if (Array.isArray(input.rows)) {
    return input.rows.filter((row) => {
      const lane = asText(row.easyFirstLane || row.lane || row.actionLane || row.seasonStateCandidate);
      return lane.includes("finished") || lane.includes("offseason");
    });
  }

  return [];
}

function buildReport({ inventory, workset, inventoryPath, worksetPath }) {
  const inventoryRows = rowsFromInventory(inventory);
  const finishedRows = finishedRowsFromWorkset(workset);

  const inventoryBySlug = new Map();

  for (const row of inventoryRows) {
    const slug = asText(row.leagueSlug || row.competitionSlug);
    if (slug && !inventoryBySlug.has(slug)) inventoryBySlug.set(slug, row);
  }

  const splitRows = finishedRows.map((row) => {
    const slug = asText(row.leagueSlug || row.competitionSlug);
    const inv = inventoryBySlug.get(slug) || {};

    const standingsFileExists = boolValue(inv.standingsFileExists);
    const historyRowsCount = num(inv.historyRowsCount);
    const historyFinalRowsCount = num(inv.historyFinalRowsCount);
    const needsFTRepair = boolValue(inv.needsFTRepair);

    let batchBLane = "ready_for_final_or_offseason_verification";

    if (needsFTRepair) {
      batchBLane = "needs_ft_repair_first";
    } else if (!standingsFileExists && historyRowsCount <= 0) {
      batchBLane = "needs_standings_or_history_backfill";
    }

    return {
      leagueSlug: slug,
      competitionSlug: asText(row.competitionSlug || slug),
      competitionName: asText(row.competitionName || inv.leagueName || inv.competitionName),
      coverageType: asText(inv.coverageType),
      coverageCountry: asText(inv.coverageCountry),
      targetDate: asText(inv.targetDate),
      seasonKey: asText(inv.seasonKey),

      standingsFileExists,
      standingsFreshness: asText(inv.standingsFreshness),
      standingsTableCount: num(inv.standingsTableCount),
      standingsPhaseTableRowCount: num(inv.standingsPhaseTableRowCount),

      historyRowsCount,
      historyFinalRowsCount,
      lastHistoryDate: asText(inv.lastHistoryDate),

      canonicalFixtureCountToday: num(inv.canonicalFixtureCountToday),
      canonicalFixtureCountNext7Days: num(inv.canonicalFixtureCountNext7Days),
      lastKnownFixtureDate: asText(inv.lastKnownFixtureDate),
      nextKnownCanonicalFixtureDate: asText(inv.nextKnownCanonicalFixtureDate),

      missingFTCount: num(inv.missingFTCount),
      needsFTRepair,
      needsStandingsRefresh: boolValue(inv.needsStandingsRefresh),
      needsSeasonStatus: boolValue(inv.needsSeasonStatus),
      needsFixtureAcquisition: boolValue(inv.needsFixtureAcquisition),

      batchBLane,
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false
    };
  });

  const byBatchBLane = {};
  const byStandingHistoryShape = {};

  for (const row of splitRows) {
    byBatchBLane[row.batchBLane] = (byBatchBLane[row.batchBLane] || 0) + 1;

    const shape = [
      row.standingsFileExists ? "has_standings" : "no_standings",
      row.historyRowsCount > 0 ? "has_history" : "no_history",
      row.historyFinalRowsCount > 0 ? "has_final_history" : "no_final_history",
      row.needsFTRepair ? "needs_ft_repair" : "no_ft_repair"
    ].join("__");

    byStandingHistoryShape[shape] = (byStandingHistoryShape[shape] || 0) + 1;
  }

  return {
    ok: true,
    job: "build-football-truth-finished-offseason-action-split-file",
    mode: "read_only_diagnostic",
    input: {
      inventoryPath,
      worksetPath
    },
    summary: {
      inventoryRowCount: inventoryRows.length,
      finishedOrOffseasonCandidateCount: finishedRows.length,
      splitRowCount: splitRows.length,

      withStandingsCount: splitRows.filter((row) => row.standingsFileExists).length,
      withoutStandingsCount: splitRows.filter((row) => !row.standingsFileExists).length,
      withHistoryCount: splitRows.filter((row) => row.historyRowsCount > 0).length,
      withoutHistoryCount: splitRows.filter((row) => row.historyRowsCount <= 0).length,
      withFinalHistoryCount: splitRows.filter((row) => row.historyFinalRowsCount > 0).length,

      needsFTRepairCount: splitRows.filter((row) => row.needsFTRepair).length,
      readyForFinalOrOffseasonVerificationCount: splitRows.filter((row) => row.batchBLane === "ready_for_final_or_offseason_verification").length,
      needsStandingsOrHistoryBackfillCount: splitRows.filter((row) => row.batchBLane === "needs_standings_or_history_backfill").length,
      needsFTRepairFirstCount: splitRows.filter((row) => row.batchBLane === "needs_ft_repair_first").length,

      byBatchBLane,
      byStandingHistoryShape,

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
      usesOnlyProvidedInventoryAndWorkset: true,
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
    splitRows
  };
}

function selfTest() {
  const inventory = {
    inventoryRows: [
      {
        leagueSlug: "aaa.1",
        competitionName: "AAA League",
        standingsFileExists: true,
        historyRowsCount: 10,
        historyFinalRowsCount: 10,
        needsFTRepair: true
      },
      {
        leagueSlug: "bbb.1",
        competitionName: "BBB League",
        standingsFileExists: false,
        historyRowsCount: 0,
        historyFinalRowsCount: 0,
        needsFTRepair: false
      },
      {
        leagueSlug: "ccc.1",
        competitionName: "CCC League",
        standingsFileExists: true,
        historyRowsCount: 20,
        historyFinalRowsCount: 20,
        needsFTRepair: false
      }
    ]
  };

  const workset = {
    finishedOrOffseasonRows: [
      { leagueSlug: "aaa.1" },
      { leagueSlug: "bbb.1" },
      { leagueSlug: "ccc.1" }
    ]
  };

  const report = buildReport({
    inventory,
    workset,
    inventoryPath: "self-test-inventory",
    worksetPath: "self-test-workset"
  });

  if (report.summary.splitRowCount !== 3) throw new Error("self-test split count failed");
  if (report.summary.needsFTRepairFirstCount !== 1) throw new Error("self-test FT repair lane failed");
  if (report.summary.needsStandingsOrHistoryBackfillCount !== 1) throw new Error("self-test backfill lane failed");
  if (report.summary.readyForFinalOrOffseasonVerificationCount !== 1) throw new Error("self-test ready lane failed");
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

  const inventoryPath = getArg("--inventory");
  const worksetPath = getArg("--workset") || getArg("--easy-first");
  const outputPath = getArg("--output");

  if (!inventoryPath) throw new Error("Missing required --inventory <path>");
  if (!worksetPath) throw new Error("Missing required --workset <path> or --easy-first <path>");
  if (!outputPath) throw new Error("Missing required --output <path>");

  const inventory = readJson(inventoryPath);
  const workset = readJson(worksetPath);

  const report = buildReport({
    inventory,
    workset,
    inventoryPath,
    worksetPath
  });

  if (report.summary.splitRowCount <= 0) {
    throw new Error("Finished/offseason action split produced zero rows");
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