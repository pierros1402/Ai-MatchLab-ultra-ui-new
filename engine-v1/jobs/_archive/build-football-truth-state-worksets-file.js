#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: "",
    output: "",
    limitPerBucket: 0,
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++i] || "";
    else if (arg.startsWith("--input=")) args.input = arg.slice("--input=".length);
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg.startsWith("--output=")) args.output = arg.slice("--output=".length);
    else if (arg === "--limit-per-bucket") args.limitPerBucket = Number(argv[++i] || 0);
    else if (arg.startsWith("--limit-per-bucket=")) args.limitPerBucket = Number(arg.slice("--limit-per-bucket=".length));
    else throw new Error(`unknown argument: ${arg}`);
  }

  if (!args.selfTest && !args.input) throw new Error("--input is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");

  args.limitPerBucket = Number.isFinite(args.limitPerBucket) && args.limitPerBucket > 0
    ? Math.floor(args.limitPerBucket)
    : 0;

  return args;
}

function inventoryRowsOf(input) {
  if (Array.isArray(input)) return input;

  for (const key of [
    "footballTruthStateInventoryRows",
    "inventoryRows",
    "rows",
    "items"
  ]) {
    if (Array.isArray(input && input[key])) return input[key];
  }

  return [];
}

function competitionFamily(row) {
  const type = asText(row.coverageType).toLowerCase();

  if (type === "league") return "domestic_league";
  if (type === "cup") return "cup_or_knockout";
  if (type === "continental" || type === "global") return "continental_or_global";

  return "unknown";
}

function familyWeight(row) {
  const family = asText(row.competitionFamily || competitionFamily(row));
  if (family === "domestic_league") return 1;
  if (family === "continental_or_global") return 2;
  if (family === "cup_or_knockout") return 3;
  return 9;
}

function trustWeight(row) {
  const trust = Number(row.coverageTrust || row.trust || 0);
  return Number.isFinite(trust) ? -trust : 0;
}

function tierWeight(row) {
  const tier = Number(row.coverageTier || row.tier || 0);
  return Number.isFinite(tier) && tier > 0 ? tier : 99;
}

function sortRows(rows) {
  return [...rows].sort((a, b) =>
    familyWeight(a) - familyWeight(b) ||
    tierWeight(a) - tierWeight(b) ||
    trustWeight(a) - trustWeight(b) ||
    asText(a.leagueSlug || a.competitionSlug).localeCompare(asText(b.leagueSlug || b.competitionSlug))
  );
}

function limitRows(rows, limit) {
  const sorted = sortRows(rows);
  return limit > 0 ? sorted.slice(0, limit) : sorted;
}

function workRow(row, bucket) {
  const leagueSlug = asText(row.leagueSlug || row.competitionSlug);
  const family = competitionFamily(row);

  return {
    worksetBucket: bucket,
    leagueSlug,
    targetLeagueSlug: leagueSlug,
    competitionSlug: leagueSlug,
    leagueName: asText(row.leagueName || row.competitionName),
    competitionName: asText(row.leagueName || row.competitionName),
    coverageType: asText(row.coverageType),
    competitionType: asText(row.coverageType),
    competitionFamily: family,
    coverageRegion: asText(row.coverageRegion),
    region: asText(row.coverageRegion),
    coverageCountry: asText(row.coverageCountry),
    country: asText(row.coverageCountry),
    countryPrefix: asText(row.countryPrefix || leagueSlug.split(".")[0]),
    coverageTier: Number(row.coverageTier || 0),
    tier: Number(row.coverageTier || 0),
    coverageTrust: Number(row.coverageTrust || 0),
    trust: Number(row.coverageTrust || 0),
    targetDate: asText(row.targetDate),
    seasonKey: asText(row.seasonKey),

    canonicalFixtureCountToday: Number(row.canonicalFixtureCountToday || 0),
    canonicalFixtureCountNext7Days: Number(row.canonicalFixtureCountNext7Days || 0),
    canonicalFixtureCountTotal: Number(row.canonicalFixtureCountTotal || 0),
    nextKnownCanonicalFixtureDate: asText(row.nextKnownCanonicalFixtureDate),
    lastKnownFixtureDate: asText(row.lastKnownFixtureDate),

    standingsFreshness: asText(row.standingsFreshness),
    standingsFileExists: row.standingsFileExists === true,
    standingsTableCount: Number(row.standingsTableCount || 0),
    standingsPhaseTableRowCount: Number(row.standingsPhaseTableRowCount || 0),
    standingsPhaseKeys: asArray(row.standingsPhaseKeys),
    standingsMtime: asText(row.standingsMtime),

    historyRowsCount: Number(row.historyRowsCount || 0),
    historyFinalRowsCount: Number(row.historyFinalRowsCount || 0),
    lastHistoryDate: asText(row.lastHistoryDate),
    verifiedFTCount: Number(row.verifiedFTCount || 0),
    missingFTCount: Number(row.missingFTCount || 0),
    lastVerifiedFTDate: asText(row.lastVerifiedFTDate),

    dayActivityState: asText(row.dayActivityState),
    dayActivityEvidenceState: asText(row.dayActivityEvidenceState),
    dayActivityNextKnownFixtureDate: asText(row.dayActivityNextKnownFixtureDate),
    seasonWatchState: asText(row.seasonWatchState),
    seasonWatchNextKnownFixtureDate: asText(row.seasonWatchNextKnownFixtureDate),
    seasonStatusStateExists: row.seasonStatusStateExists === true,
    seasonStatus: asText(row.seasonStatus),
    seasonStatusEvidenceState: asText(row.seasonStatusEvidenceState),

    needsFixtureAcquisition: row.needsFixtureAcquisition === true,
    needsDayActivityEvidence: row.needsDayActivityEvidence === true,
    needsFTRepair: row.needsFTRepair === true,
    needsStandingsRefresh: row.needsStandingsRefresh === true,
    needsSeasonStatus: row.needsSeasonStatus === true,
    inventoryPriority: asText(row.priority),

    sourceFetch: false,
    noFetch: true,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
}

function buildBucket(rows, bucket, predicate, limit) {
  return limitRows(rows.filter(predicate), limit).map((row) => workRow(row, bucket));
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = asText(typeof key === "function" ? key(row) : row[key]) || "unknown";
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function buildReport(input, { inputPath = "", limitPerBucket = 0 } = {}) {
  const rows = inventoryRowsOf(input);

  const buckets = {
    fixtureAcquisition: buildBucket(rows, "fixtureAcquisition", (row) => row.needsFixtureAcquisition === true, limitPerBucket),
    dayActivityEvidence: buildBucket(rows, "dayActivityEvidence", (row) => row.needsDayActivityEvidence === true, limitPerBucket),
    ftRepair: buildBucket(rows, "ftRepair", (row) => row.needsFTRepair === true, limitPerBucket),
    standingsRefresh: buildBucket(rows, "standingsRefresh", (row) => row.needsStandingsRefresh === true, limitPerBucket),
    seasonStatus: buildBucket(rows, "seasonStatus", (row) => row.needsSeasonStatus === true, limitPerBucket)
  };

  const allWorkRows = Object.values(buckets).flat();

  return {
    ok: true,
    job: "build-football-truth-state-worksets-file",
    mode: "read_only_workset_materialization",
    generatedAt: new Date().toISOString(),
    inputPath,
    inputSummary: {
      inputJob: asText(input && input.job),
      inputGeneratedAt: asText(input && input.generatedAt),
      targetDate: asText((input && input.summary && input.summary.targetDate) || (rows[0] && rows[0].targetDate)),
      seasonKey: asText((input && input.summary && input.summary.seasonKey) || (rows[0] && rows[0].seasonKey)),
      inputInventoryRowCount: rows.length
    },
    options: {
      limitPerBucket
    },
    summary: {
      inputInventoryRowCount: rows.length,
      totalWorkRowCount: allWorkRows.length,
      fixtureAcquisitionWorkRowCount: buckets.fixtureAcquisition.length,
      dayActivityEvidenceWorkRowCount: buckets.dayActivityEvidence.length,
      ftRepairWorkRowCount: buckets.ftRepair.length,
      standingsRefreshWorkRowCount: buckets.standingsRefresh.length,
      seasonStatusWorkRowCount: buckets.seasonStatus.length,
      byBucket: countBy(allWorkRows, "worksetBucket"),
      byCompetitionFamily: countBy(allWorkRows, "competitionFamily"),
      byCoverageRegion: countBy(allWorkRows, "coverageRegion"),
      byInventoryPriority: countBy(allWorkRows, "inventoryPriority"),
      sourceFetch: false,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    worksets: buckets,
    footballTruthStateWorkRows: allWorkRows,
    workRows: allWorkRows,
    guarantees: {
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      usesOnlyProvidedFootballTruthInventory: true,
      noFixtureWrites: true,
      noHistoryWrites: true,
      noValueWrites: true,
      noDetailsWrites: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      diagnosticOnly: true
    },
    canonicalWrites: 0,
    productionWrite: false
  };
}

function runSelfTest() {
  const input = {
    ok: true,
    job: "build-football-truth-state-inventory-file",
    summary: {
      targetDate: "2026-06-03",
      seasonKey: "2025-2026"
    },
    inventoryRows: [
      {
        leagueSlug: "eng.1",
        leagueName: "Premier League",
        coverageType: "league",
        coverageRegion: "europe",
        coverageCountry: "england",
        coverageTier: 1,
        coverageTrust: 1,
        targetDate: "2026-06-03",
        seasonKey: "2025-2026",
        needsFixtureAcquisition: true,
        needsDayActivityEvidence: true,
        needsFTRepair: false,
        needsStandingsRefresh: false,
        needsSeasonStatus: true,
        priority: "fixture_acquisition_and_season_status"
      },
      {
        leagueSlug: "aut.2",
        leagueName: "2. Liga",
        coverageType: "league",
        coverageRegion: "europe",
        coverageCountry: "austria",
        coverageTier: 2,
        coverageTrust: 0.78,
        targetDate: "2026-06-03",
        seasonKey: "2025-2026",
        needsFixtureAcquisition: false,
        needsDayActivityEvidence: false,
        needsFTRepair: true,
        needsStandingsRefresh: true,
        needsSeasonStatus: true,
        priority: "ft_repair_and_season_status"
      }
    ]
  };

  const report = buildReport(input, { inputPath: "self-test", limitPerBucket: 0 });

  if (report.summary.inputInventoryRowCount !== 2) throw new Error("expected two inventory rows");
  if (report.summary.fixtureAcquisitionWorkRowCount !== 1) throw new Error("expected one fixture acquisition row");
  if (report.summary.dayActivityEvidenceWorkRowCount !== 1) throw new Error("expected one day activity evidence row");
  if (report.summary.ftRepairWorkRowCount !== 1) throw new Error("expected one FT repair row");
  if (report.summary.standingsRefreshWorkRowCount !== 1) throw new Error("expected one standings refresh row");
  if (report.summary.seasonStatusWorkRowCount !== 2) throw new Error("expected two season status rows");
  if (report.summary.totalWorkRowCount !== 6) throw new Error("expected six total work rows");
  if (!report.worksets.fixtureAcquisition[0].competitionFamily) throw new Error("expected competition family");
  if (report.worksets.seasonStatus.some((row) => row.canonicalWrites !== 0 || row.productionWrite !== false)) throw new Error("expected read-only rows");
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) throw new Error("read-only guarantees failed");

  const limited = buildReport(input, { inputPath: "self-test", limitPerBucket: 1 });
  if (limited.summary.seasonStatusWorkRowCount !== 1) throw new Error("expected season status bucket limit");

  return {
    ok: true,
    selfTest: "build-football-truth-state-worksets-file",
    summary: report.summary
  };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const inputPath = path.resolve(repoRoot, args.input);
  const outputPath = path.resolve(repoRoot, args.output);
  const input = readJson(inputPath);
  const report = buildReport(input, {
    inputPath: args.input,
    limitPerBucket: args.limitPerBucket
  });

  writeJson(outputPath, report);

  console.log(JSON.stringify({
    ok: true,
    job: report.job,
    output: args.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

main();