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
    date: "",
    dayActivity: "",
    seasonStatus: "",
    output: "",
    selfTest: false
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--date") args.date = argv[++index];
    else if (arg === "--day-activity") args.dayActivity = argv[++index];
    else if (arg === "--season-status") args.seasonStatus = argv[++index];
    else if (arg === "--output") args.output = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function pickRows(input) {
  if (Array.isArray(input)) return input;

  for (const key of ["rows", "dayActivityRows", "leagueRows", "results"]) {
    if (Array.isArray(input?.[key])) return input[key];
  }

  return [];
}

function rowByLeague(rows) {
  const map = new Map();

  for (const row of rows) {
    const leagueSlug = asText(row.leagueSlug || row.slug || row.competitionSlug);
    if (leagueSlug && !map.has(leagueSlug)) {
      map.set(leagueSlug, row);
    }
  }

  return map;
}

function normalizeFromSeasonOnly({ leagueSlug, seasonRow, targetDate }) {
  const seasonStatusState = asText(seasonRow.seasonStatusState);
  const standingsEvidenceState = asText(seasonRow.standingsEvidenceState);
  const seasonActiveCandidate = seasonRow.seasonActiveCandidate === true;
  const seasonFinishedCandidate = seasonRow.seasonFinishedCandidate === true;
  const calendarEvidenceRequired =
    seasonStatusState === "standings_available_needs_calendar_evidence" ||
    seasonStatusState === "season_status_needs_calendar_evidence" ||
    /needs_calendar_evidence/i.test(seasonStatusState);

  if (seasonFinishedCandidate) {
    return {
      leagueSlug,
      targetDate,
      activityState: "season_finished_or_out_of_season_candidate",
      dayActivityEvidenceState: "filled_from_standings_season_finished_candidate",
      activeForDay: false,
      noExpectedFixturesForDay: true,
      outOfSeasonForDay: true,
      fixtureAcquisitionMode: "no_target_date_fixture_acquisition",
      valuePipelineEligibility: "not_value_ready_for_target_date",
      seasonMonitoringMode: "restart_or_next_season_watch",
      nextRequiredAction: "verify_final_table_or_next_season_restart",
      decisionReason: "no_day_activity_row_season_status_finished_candidate",
      hardExcludedFromFutureSearch: false,
      continueAutonomousSearch: false,
      continueSeasonMonitoring: true
    };
  }

  if (calendarEvidenceRequired) {
    return {
      leagueSlug,
      targetDate,
      activityState: "season_calendar_evidence_required",
      dayActivityEvidenceState: "filled_from_standings_calendar_evidence_required",
      standingsEvidenceState,
      activeForDay: false,
      noExpectedFixturesForDay: false,
      outOfSeasonForDay: false,
      fixtureAcquisitionMode: "calendar_evidence_required_before_day_fixture_acquisition",
      valuePipelineEligibility: "not_value_ready_for_target_date",
      seasonMonitoringMode: "calendar_or_restart_evidence_monitoring",
      nextRequiredAction: seasonRow.nextRequiredAction || "discover_competition_calendar_or_next_fixture_date",
      decisionReason: "no_day_activity_row_standings_do_not_prove_active_season",
      hardExcludedFromFutureSearch: false,
      continueAutonomousSearch: false,
      continueSeasonMonitoring: true
    };
  }

  if (seasonActiveCandidate) {
    return {
      leagueSlug,
      targetDate,
      activityState: "season_active_needs_day_fixture_discovery",
      dayActivityEvidenceState: "filled_from_standings_season_active_candidate",
      activeForDay: false,
      noExpectedFixturesForDay: false,
      outOfSeasonForDay: false,
      fixtureAcquisitionMode: "continue_autonomous_day_discovery",
      valuePipelineEligibility: "not_value_ready_for_target_date",
      seasonMonitoringMode: "normal_daily_or_break_monitoring",
      nextRequiredAction: "discover_target_date_fixtures_or_next_fixture_date",
      decisionReason: "no_day_activity_row_season_status_active_candidate",
      hardExcludedFromFutureSearch: false,
      continueAutonomousSearch: true,
      continueSeasonMonitoring: true
    };
  }

  return {
    leagueSlug,
    targetDate,
    activityState: seasonStatusState === "preseason_or_not_started_candidate"
      ? "preseason_or_not_started_candidate"
      : "missing_day_activity_state_needs_autonomous_discovery",
    dayActivityEvidenceState: "filled_from_standings_insufficient_or_empty_evidence",
    activeForDay: false,
    noExpectedFixturesForDay: false,
    outOfSeasonForDay: false,
    fixtureAcquisitionMode: "continue_autonomous_day_discovery",
    valuePipelineEligibility: "not_value_ready_for_target_date",
    seasonMonitoringMode: "evidence_discovery_monitoring",
    nextRequiredAction: "discover_day_activity_or_competition_calendar",
    decisionReason: "no_day_activity_row_and_season_status_not_decisive",
    hardExcludedFromFutureSearch: false,
    continueAutonomousSearch: true,
    continueSeasonMonitoring: true
  };
}

function normalizeExistingDayRow({ dayRow, seasonRow, targetDate }) {
  const activityState = asText(dayRow.activityState) || "missing_day_activity_state_needs_autonomous_discovery";

  return {
    ...dayRow,
    leagueSlug: asText(dayRow.leagueSlug),
    targetDate: asText(dayRow.targetDate) || targetDate,
    activityState,
    dayActivityEvidenceState: asText(dayRow.dayActivityEvidenceState) || "existing_day_activity_missing_evidence_state",
    fixtureAcquisitionMode: asText(dayRow.fixtureAcquisitionMode) || "continue_autonomous_day_discovery",
    valuePipelineEligibility: asText(dayRow.valuePipelineEligibility) || "not_value_ready_for_target_date",
    seasonMonitoringMode: asText(dayRow.seasonMonitoringMode) || "normal_daily_monitoring",
    nextRequiredAction: asText(dayRow.nextRequiredAction) || "continue_autonomous_source_discovery",
    hardExcludedFromFutureSearch: dayRow.hardExcludedFromFutureSearch === true ? true : false,
    continueAutonomousSearch: dayRow.continueAutonomousSearch === false ? false : true,
    continueSeasonMonitoring: true,
    seasonStatusState: seasonRow ? asText(seasonRow.seasonStatusState) : "missing_season_status_evidence",
    standingsEvidenceState: seasonRow ? asText(seasonRow.standingsEvidenceState) : "missing_standings_evidence",
    seasonActiveCandidate: seasonRow ? seasonRow.seasonActiveCandidate === true : false,
    seasonFinishedCandidate: seasonRow ? seasonRow.seasonFinishedCandidate === true : false,
    breakOrCalendarGapCandidate: seasonRow ? seasonRow.breakOrCalendarGapCandidate === true : false,
    seasonStatusNextRequiredAction: seasonRow ? asText(seasonRow.nextRequiredAction) : "build_or_discover_season_status_evidence",
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
}

function normalizeRow({ leagueSlug, dayRow, seasonRow, targetDate }) {
  const base = dayRow
    ? normalizeExistingDayRow({ dayRow, seasonRow, targetDate })
    : normalizeFromSeasonOnly({ leagueSlug, seasonRow, targetDate });

  if (!dayRow) {
    return {
      ...base,
      seasonStatusState: seasonRow ? asText(seasonRow.seasonStatusState) : "missing_season_status_evidence",
      standingsEvidenceState: seasonRow ? asText(seasonRow.standingsEvidenceState) : "missing_standings_evidence",
      seasonActiveCandidate: seasonRow ? seasonRow.seasonActiveCandidate === true : false,
      seasonFinishedCandidate: seasonRow ? seasonRow.seasonFinishedCandidate === true : false,
      breakOrCalendarGapCandidate: seasonRow ? seasonRow.breakOrCalendarGapCandidate === true : false,
      seasonStatusNextRequiredAction: seasonRow ? asText(seasonRow.nextRequiredAction) : "build_or_discover_season_status_evidence",
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    };
  }

  return base;
}

function buildReport({ dayActivity, seasonStatus, targetDate }) {
  const dayRows = pickRows(dayActivity);
  const seasonRows = pickRows(seasonStatus);

  const dayMap = rowByLeague(dayRows);
  const seasonMap = rowByLeague(seasonRows);

  const leagueSlugs = [...new Set([...dayMap.keys(), ...seasonMap.keys()])].sort();

  const rows = leagueSlugs.map((leagueSlug) => normalizeRow({
    leagueSlug,
    dayRow: dayMap.get(leagueSlug),
    seasonRow: seasonMap.get(leagueSlug),
    targetDate
  }));

  const emptyActivityStateRows = rows.filter((row) => !asText(row.activityState));
  const byActivityState = {};
  const byFixtureAcquisitionMode = {};

  for (const row of rows) {
    byActivityState[row.activityState] = (byActivityState[row.activityState] || 0) + 1;
    byFixtureAcquisitionMode[row.fixtureAcquisitionMode] = (byFixtureAcquisitionMode[row.fixtureAcquisitionMode] || 0) + 1;
  }

  return {
    ok: emptyActivityStateRows.length === 0,
    reportType: "league-day-activity-normalized-with-season-status",
    generatedAt: new Date().toISOString(),
    targetDate,
    summary: {
      inputDayActivityRowCount: dayRows.length,
      inputSeasonStatusRowCount: seasonRows.length,
      normalizedRowCount: rows.length,
      filledFromSeasonStatusCount: rows.filter((row) => row.dayActivityEvidenceState.startsWith("filled_from_standings_")).length,
      existingDayActivityRowCount: rows.filter((row) => dayMap.has(row.leagueSlug)).length,
      emptyActivityStateCount: emptyActivityStateRows.length,
      activeForDayCount: rows.filter((row) => row.activeForDay === true).length,
      seasonActiveNeedsDiscoveryCount: rows.filter((row) => row.activityState === "season_active_needs_day_fixture_discovery").length,
      seasonFinishedOrOutOfSeasonCandidateCount: rows.filter((row) => row.activityState === "season_finished_or_out_of_season_candidate").length,
      missingDayActivityStateNeedsDiscoveryCount: rows.filter((row) => row.activityState === "missing_day_activity_state_needs_autonomous_discovery").length,
      continueAutonomousSearchCount: rows.filter((row) => row.continueAutonomousSearch === true).length,
      continueSeasonMonitoringCount: rows.filter((row) => row.continueSeasonMonitoring === true).length,
      byActivityState,
      byFixtureAcquisitionMode,
      canonicalWrites: 0,
      productionWrite: false,
      sourceFetch: false
    },
    rows,
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      canonicalWrites: 0,
      productionWrite: false,
      noCanonicalPromotion: true,
      hardExcludedFromFutureSearch: false
    }
  };
}

function runSelfTest() {
  const dayActivity = {
    date: "2026-06-02",
    rows: [
      {
        leagueSlug: "aut.1",
        targetDate: "2026-06-02",
        activityState: "no_expected_fixtures_for_day",
        fixtureAcquisitionMode: "no_target_date_fixture_acquisition",
        nextRequiredAction: "continue_periodic_day_activity_discovery"
      }
    ]
  };

  const seasonStatus = {
    targetDate: "2026-06-02",
    rows: [
      {
        leagueSlug: "aut.1",
        seasonStatusState: "season_in_progress_or_recently_active_candidate",
        standingsEvidenceState: "standings_available_with_played_matches",
        seasonActiveCandidate: true,
        seasonFinishedCandidate: false,
        breakOrCalendarGapCandidate: true,
        nextRequiredAction: "discover_target_date_fixtures_or_next_fixture_date"
      },
      {
        leagueSlug: "eng.1",
        seasonStatusState: "standings_available_needs_calendar_evidence",
        standingsEvidenceState: "standings_available_with_played_matches",
        seasonActiveCandidate: false,
        seasonFinishedCandidate: false,
        breakOrCalendarGapCandidate: true,
        nextRequiredAction: "discover_competition_calendar_or_next_fixture_date"
      },
      {
        leagueSlug: "esp.1",
        seasonStatusState: "regular_season_complete_or_near_complete_candidate",
        standingsEvidenceState: "standings_available_with_played_matches",
        seasonActiveCandidate: false,
        seasonFinishedCandidate: true,
        breakOrCalendarGapCandidate: false,
        nextRequiredAction: "verify_final_table_or_next_season_restart"
      },
      {
        leagueSlug: "caf.champions",
        seasonStatusState: "unknown_needs_evidence",
        standingsEvidenceState: "no_standings_table_available",
        seasonActiveCandidate: false,
        seasonFinishedCandidate: false,
        breakOrCalendarGapCandidate: false,
        nextRequiredAction: "discover_standings_or_competition_calendar"
      }
    ]
  };

  const report = buildReport({ dayActivity, seasonStatus, targetDate: "2026-06-02" });

  if (report.summary.normalizedRowCount !== 4) throw new Error("expected 4 normalized rows");
  if (report.summary.emptyActivityStateCount !== 0) throw new Error("expected no empty activity states");
  if (report.summary.existingDayActivityRowCount !== 1) throw new Error("expected one preserved day activity row");
  if (report.summary.filledFromSeasonStatusCount !== 3) throw new Error("expected three season-status-filled rows");
  if (report.summary.seasonActiveNeedsDiscoveryCount !== 0) throw new Error("standings-only evidence must not create active day discovery");
  if (report.summary.byActivityState.season_calendar_evidence_required !== 1) throw new Error("expected one calendar-evidence-required row");
  if (report.summary.seasonFinishedOrOutOfSeasonCandidateCount !== 1) throw new Error("expected one finished/out-of-season candidate");
  if (report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) {
    throw new Error("read-only guarantees changed");
  }

  return {
    ok: true,
    selfTest: "normalize-league-day-activity-with-season-status",
    summary: report.summary
  };
}

function main() {
  const args = parseArgs(process.argv);

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  if (!args.dayActivity) throw new Error("--day-activity is required");
  if (!args.seasonStatus) throw new Error("--season-status is required");

  const dayActivityPath = path.resolve(args.dayActivity);
  const seasonStatusPath = path.resolve(args.seasonStatus);
  const dayActivity = readJson(dayActivityPath);
  const seasonStatus = readJson(seasonStatusPath);
  const targetDate = args.date || asText(dayActivity.date || seasonStatus.targetDate) || new Date().toISOString().slice(0, 10);

  const output = args.output
    ? path.resolve(args.output)
    : path.join(repoRoot, "data", "football-truth", "_state", "league-day-activity-normalized", `${targetDate}.json`);

  const report = buildReport({ dayActivity, seasonStatus, targetDate });
  writeJson(output, report);

  console.log(JSON.stringify({
    ok: report.ok,
    output: path.relative(repoRoot, output).replace(/\\/g, "/"),
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  main();
}