#!/usr/bin/env node

import fs from "fs";
import os from "os";
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
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv) {
  const args = {
    input: "",
    output: "",
    selfTest: false
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++index];
    else if (arg === "--output") args.output = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function pickRows(input) {
  if (Array.isArray(input)) return input;
  for (const key of ["routingRows", "rows", "results"]) {
    if (Array.isArray(input?.[key])) return input[key];
  }
  return [];
}

function leagueFamily(leagueSlug) {
  const slug = asText(leagueSlug);
  if (!slug) return "unknown";

  if (/(cup|copa|pokal|trophy|supercup|shield)/i.test(slug)) return "cup_or_knockout";
  if (/^(uefa|caf|afc|concacaf|conmebol|ofc|fifa)\./i.test(slug)) return "continental_or_global";
  if (/\.\d+$/.test(slug)) return "domestic_league";
  return "other_competition";
}

function gapBucket(row) {
  const activityState = asText(row.activityState);
  const standingsEvidenceState = asText(row.standingsEvidenceState);
  const seasonStatusState = asText(row.seasonStatusState);
  const family = leagueFamily(row.leagueSlug);

  if (activityState === "season_finished_or_out_of_season_candidate") {
    return "season_finished_or_out_of_season_candidate";
  }

  if (activityState === "no_expected_fixtures_for_day") {
    return "no_expected_fixtures_for_day";
  }

  if (standingsEvidenceState === "missing_standings_evidence" || !standingsEvidenceState) {
    if (family === "domestic_league") return "domestic_league_missing_standings";
    if (family === "cup_or_knockout") return "cup_or_knockout_needs_calendar_evidence";
    if (family === "continental_or_global") return "continental_or_global_needs_calendar_evidence";
    return "competition_missing_season_or_calendar_evidence";
  }

  if (standingsEvidenceState === "no_standings_table_available") {
    if (family === "cup_or_knockout" || family === "continental_or_global") {
      return "non_table_competition_needs_calendar_evidence";
    }
    return "standings_file_without_table_needs_review";
  }

  if (activityState === "season_active_needs_day_fixture_discovery") {
    return "season_active_needs_day_fixture_discovery";
  }

  if (activityState === "missing_day_activity_state_needs_autonomous_discovery") {
    if (seasonStatusState === "unknown_needs_evidence") return "unknown_season_status_needs_evidence";
    return "missing_day_activity_state_needs_autonomous_discovery";
  }

  return "other_explicit_state";
}

function summarize(rows) {
  const byGapBucket = {};
  const byLeagueFamily = {};
  const byActivityState = {};
  const byStandingsEvidenceState = {};
  const byRouteState = {};

  for (const row of rows) {
    const bucket = gapBucket(row);
    const family = leagueFamily(row.leagueSlug);
    const activityState = asText(row.activityState) || "missing";
    const standingsEvidenceState = asText(row.standingsEvidenceState) || "missing";
    const routeState = asText(row.routeState) || "missing";

    byGapBucket[bucket] = (byGapBucket[bucket] || 0) + 1;
    byLeagueFamily[family] = (byLeagueFamily[family] || 0) + 1;
    byActivityState[activityState] = (byActivityState[activityState] || 0) + 1;
    byStandingsEvidenceState[standingsEvidenceState] = (byStandingsEvidenceState[standingsEvidenceState] || 0) + 1;
    byRouteState[routeState] = (byRouteState[routeState] || 0) + 1;
  }

  return {
    routingRowCount: rows.length,
    emptyActivityStateCount: rows.filter((row) => !asText(row.activityState)).length,
    missingStandingsEvidenceCount: rows.filter((row) => asText(row.standingsEvidenceState) === "missing_standings_evidence" || !asText(row.standingsEvidenceState)).length,
    noStandingsTableCount: rows.filter((row) => asText(row.standingsEvidenceState) === "no_standings_table_available").length,
    seasonActiveNeedsDiscoveryCount: rows.filter((row) => asText(row.activityState) === "season_active_needs_day_fixture_discovery").length,
    missingDayActivityNeedsDiscoveryCount: rows.filter((row) => asText(row.activityState) === "missing_day_activity_state_needs_autonomous_discovery").length,
    finishedOrOutOfSeasonCandidateCount: rows.filter((row) => asText(row.activityState) === "season_finished_or_out_of_season_candidate").length,
    byGapBucket,
    byLeagueFamily,
    byActivityState,
    byStandingsEvidenceState,
    byRouteState,
    sourceFetch: false,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function buildReport(input) {
  const rows = pickRows(input);
  const gapRows = rows.map((row) => ({
    leagueSlug: asText(row.leagueSlug),
    leagueFamily: leagueFamily(row.leagueSlug),
    gapBucket: gapBucket(row),
    activityState: asText(row.activityState),
    routeState: asText(row.routeState),
    standingsEvidenceState: asText(row.standingsEvidenceState),
    seasonStatusState: asText(row.seasonStatusState),
    seasonActiveCandidate: row.seasonActiveCandidate === true,
    seasonFinishedCandidate: row.seasonFinishedCandidate === true,
    targetRowCount: Number(row.targetRowCount || 0),
    emittedTargetRowCount: Number(row.emittedTargetRowCount || 0),
    continueAutonomousSearch: row.continueAutonomousSearch === true,
    continueSeasonMonitoring: row.continueSeasonMonitoring === true,
    nextRequiredAction: asText(row.nextRequiredAction),
    hardExcludedFromFutureSearch: row.hardExcludedFromFutureSearch === true
  }));

  return {
    ok: gapRows.every((row) => asText(row.activityState)),
    reportType: "season-aware-routing-coverage-gap-report",
    generatedAt: new Date().toISOString(),
    targetDate: asText(input.targetDate),
    summary: summarize(gapRows),
    gapRows,
    priorityGroups: {
      firstFix: gapRows.filter((row) => row.gapBucket === "domestic_league_missing_standings"),
      calendarEvidenceNeeded: gapRows.filter((row) =>
        row.gapBucket === "cup_or_knockout_needs_calendar_evidence" ||
        row.gapBucket === "continental_or_global_needs_calendar_evidence" ||
        row.gapBucket === "non_table_competition_needs_calendar_evidence"
      ),
      activeNeedsDayDiscovery: gapRows.filter((row) => row.gapBucket === "season_active_needs_day_fixture_discovery"),
      unknownNeedsEvidence: gapRows.filter((row) => row.gapBucket === "unknown_season_status_needs_evidence")
    },
    guarantees: {
      sourceFetch: false,
      noSearch: true,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      noCanonicalPromotion: true,
      hardExcludedFromFutureSearch: false
    }
  };
}

function runSelfTest() {
  const input = {
    targetDate: "2026-06-02",
    routingRows: [
      {
        leagueSlug: "eng.1",
        activityState: "season_active_needs_day_fixture_discovery",
        routeState: "autonomous_day_activity_discovery",
        standingsEvidenceState: "standings_available_with_played_matches",
        seasonStatusState: "season_in_progress_or_recently_active_candidate"
      },
      {
        leagueSlug: "abc.1",
        activityState: "missing_day_activity_state_needs_autonomous_discovery",
        routeState: "autonomous_day_activity_discovery",
        standingsEvidenceState: "missing_standings_evidence",
        seasonStatusState: "missing_season_status_evidence"
      },
      {
        leagueSlug: "uefa.champions",
        activityState: "missing_day_activity_state_needs_autonomous_discovery",
        routeState: "autonomous_day_activity_discovery",
        standingsEvidenceState: "no_standings_table_available",
        seasonStatusState: "unknown_needs_evidence"
      }
    ]
  };

  const report = buildReport(input);

  if (!report.ok) throw new Error("expected ok report");
  if (report.summary.routingRowCount !== 3) throw new Error("expected 3 rows");
  if (report.summary.emptyActivityStateCount !== 0) throw new Error("expected no empty activity states");
  if (report.summary.byGapBucket.domestic_league_missing_standings !== 1) throw new Error("expected one domestic missing standings row");
  if (report.summary.canonicalWrites !== 0 || report.summary.productionWrite !== false) {
    throw new Error("read-only guarantees changed");
  }

  return {
    ok: true,
    selfTest: "build-season-aware-routing-coverage-gap-report",
    summary: report.summary
  };
}

function main() {
  const args = parseArgs(process.argv);

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  if (!args.input) throw new Error("--input is required");

  const inputPath = path.resolve(args.input);
  const outputPath = args.output
    ? path.resolve(args.output)
    : path.join(path.dirname(inputPath), `season-aware-routing-coverage-gap-report.json`);

  const report = buildReport(readJson(inputPath));
  writeJson(outputPath, report);

  console.log(JSON.stringify({
    ok: report.ok,
    output: path.relative(repoRoot, outputPath).replace(/\\/g, "/"),
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  main();
}