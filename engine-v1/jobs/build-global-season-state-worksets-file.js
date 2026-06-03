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

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8").replace(/^\uFEFF/, ""));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
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
    else throw new Error("unknown argument: " + arg);
  }

  if (!args.selfTest && !args.input) throw new Error("--input is required");
  if (!args.selfTest && !args.output) throw new Error("--output is required");
  args.limitPerBucket = Number.isFinite(args.limitPerBucket) && args.limitPerBucket > 0
    ? Math.floor(args.limitPerBucket)
    : 0;

  return args;
}

function rowsOf(input) {
  if (Array.isArray(input)) return input;
  for (const key of ["globalSeasonStateRows", "rows", "items"]) {
    if (Array.isArray(input && input[key])) return input[key];
  }
  return [];
}

function familyWeight(row) {
  const family = asText(row.competitionFamily);
  if (family === "domestic_league") return 1;
  if (family === "continental_or_global") return 2;
  if (family === "cup_or_knockout") return 3;
  return 9;
}

function trustWeight(row) {
  const trust = Number(row.trust || 0);
  return Number.isFinite(trust) ? -trust : 0;
}

function tierWeight(row) {
  const tier = Number(row.tier || 0);
  return Number.isFinite(tier) && tier > 0 ? tier : 99;
}

function sortRows(rows) {
  return [...rows].sort((a, b) =>
    familyWeight(a) - familyWeight(b) ||
    tierWeight(a) - tierWeight(b) ||
    trustWeight(a) - trustWeight(b) ||
    asText(a.competitionSlug).localeCompare(asText(b.competitionSlug))
  );
}

function limitRows(rows, limit) {
  const sorted = sortRows(rows);
  return limit > 0 ? sorted.slice(0, limit) : sorted;
}

function workRow(row, bucket) {
  return {
    worksetBucket: bucket,
    competitionSlug: asText(row.competitionSlug),
    competitionName: asText(row.competitionName),
    competitionType: asText(row.competitionType),
    competitionFamily: asText(row.competitionFamily),
    region: asText(row.region),
    country: asText(row.country),
    tier: Number(row.tier || 0),
    trust: Number(row.trust || 0),
    targetDate: asText(row.targetDate),
    seasonState: asText(row.seasonState),
    seasonStateConfidence: asText(row.seasonStateConfidence),
    evidenceStatus: asText(row.evidenceStatus),
    nextAction: asText(row.nextAction),
    needsFixtures: row.needsFixtures === true,
    needsStandings: row.needsStandings === true,
    needsHistoricalResults: row.needsHistoricalResults === true,
    needsWinnerFinal: row.needsWinnerFinal === true,
    needsStartDate: row.needsStartDate === true,
    hasSeasonRoutingEvidence: row.hasSeasonRoutingEvidence === true,
    hasCompetitionStateEvidence: row.hasCompetitionStateEvidence === true,
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
  const rows = rowsOf(input);

  const buckets = {
    needsFixtures: buildBucket(rows, "needsFixtures", (row) => row.needsFixtures === true, limitPerBucket),
    needsStandings: buildBucket(rows, "needsStandings", (row) => row.needsStandings === true, limitPerBucket),
    needsHistoricalResults: buildBucket(rows, "needsHistoricalResults", (row) => row.needsHistoricalResults === true, limitPerBucket),
    needsWinnerFinal: buildBucket(rows, "needsWinnerFinal", (row) => row.needsWinnerFinal === true, limitPerBucket),
    needsStartDate: buildBucket(rows, "needsStartDate", (row) => row.needsStartDate === true, limitPerBucket)
  };

  const allWorkRows = Object.values(buckets).flat();

  return {
    ok: true,
    job: "build-global-season-state-worksets-file",
    generatedAt: new Date().toISOString(),
    inputPath,
    options: {
      limitPerBucket
    },
    summary: {
      inputGlobalSeasonStateRowCount: rows.length,
      totalWorkRowCount: allWorkRows.length,
      needsFixturesWorkRowCount: buckets.needsFixtures.length,
      needsStandingsWorkRowCount: buckets.needsStandings.length,
      needsHistoricalResultsWorkRowCount: buckets.needsHistoricalResults.length,
      needsWinnerFinalWorkRowCount: buckets.needsWinnerFinal.length,
      needsStartDateWorkRowCount: buckets.needsStartDate.length,
      byBucket: countBy(allWorkRows, "worksetBucket"),
      byCompetitionFamily: countBy(allWorkRows, "competitionFamily"),
      byNextAction: countBy(allWorkRows, "nextAction"),
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    worksets: buckets,
    globalSeasonStateWorkRows: allWorkRows,
    guarantees: {
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      usesOnlyProvidedGlobalInventory: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

function runSelfTest() {
  const input = {
    globalSeasonStateRows: [
      {
        competitionSlug: "eng.1",
        competitionName: "Premier League",
        competitionType: "league",
        competitionFamily: "domestic_league",
        tier: 1,
        trust: 1,
        targetDate: "2026-06-03",
        seasonState: "needs_standings_or_calendar_evidence",
        nextAction: "discover_standings_and_competition_calendar",
        needsStandings: true,
        needsHistoricalResults: true,
        needsStartDate: true
      },
      {
        competitionSlug: "uefa.champions",
        competitionName: "UEFA Champions League",
        competitionType: "continental",
        competitionFamily: "continental_or_global",
        tier: 1,
        trust: 1,
        targetDate: "2026-06-03",
        seasonState: "active_or_day_activity_unknown_needs_fixture_discovery",
        nextAction: "discover_target_date_fixtures_or_next_fixture_date",
        needsFixtures: true,
        needsHistoricalResults: true
      },
      {
        competitionSlug: "eng.fa",
        competitionName: "FA Cup",
        competitionType: "cup",
        competitionFamily: "cup_or_knockout",
        tier: 1,
        trust: 1,
        targetDate: "2026-06-03",
        seasonState: "needs_calendar_or_competition_state_evidence",
        nextAction: "discover_or_validate_competition_state_evidence",
        needsWinnerFinal: true,
        needsHistoricalResults: true,
        needsStartDate: true
      }
    ]
  };

  const report = buildReport(input, { inputPath: "self-test", limitPerBucket: 0 });

  if (report.summary.inputGlobalSeasonStateRowCount !== 3) throw new Error("expected three input rows");
  if (report.summary.needsFixturesWorkRowCount !== 1) throw new Error("expected one needsFixtures row");
  if (report.summary.needsStandingsWorkRowCount !== 1) throw new Error("expected one needsStandings row");
  if (report.summary.needsHistoricalResultsWorkRowCount !== 3) throw new Error("expected three historical rows");
  if (report.summary.needsWinnerFinalWorkRowCount !== 1) throw new Error("expected one winner/final row");
  if (report.summary.needsStartDateWorkRowCount !== 2) throw new Error("expected two start-date rows");
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) throw new Error("read-only guarantees failed");

  const limited = buildReport(input, { inputPath: "self-test", limitPerBucket: 1 });
  if (limited.summary.needsHistoricalResultsWorkRowCount !== 1) throw new Error("expected limited historical bucket");

  return {
    ok: true,
    selfTest: "build-global-season-state-worksets-file",
    summary: report.summary,
    limitedSummary: limited.summary
  };
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const input = readJson(args.input);
  const report = buildReport(input, {
    inputPath: args.input,
    limitPerBucket: args.limitPerBucket
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: path.relative(repoRoot, args.output).replace(/\\/g, "/"),
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

if (path.resolve(process.argv[1] || "") === __filename) {
  main();
}

export { buildReport };