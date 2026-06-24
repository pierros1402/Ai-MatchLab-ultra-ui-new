#!/usr/bin/env node

import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function asText(value) {
  return value == null ? "" : String(value).trim();
}

function asBool(value) {
  return value === true;
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
    outputDir: "",
    maxLeagues: 0,
    maxTotalTargets: 0,
    inputPlan: "",
    selfTest: false
  };

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--date") args.date = argv[++index];
    else if (arg === "--output-dir") args.outputDir = argv[++index];
    else if (arg === "--max-leagues") args.maxLeagues = Number(argv[++index] || 0);
    else if (arg === "--max-total-targets") args.maxTotalTargets = Number(argv[++index] || 0);
    else if (arg === "--input-plan") args.inputPlan = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function selectRows(input, keys) {
  if (Array.isArray(input)) return input;

  for (const key of keys) {
    if (Array.isArray(input?.[key])) return input[key];
  }

  return [];
}

function leagueSlugFromRow(row) {
  return asText(row.leagueSlug || row.slug || row.competitionSlug || row.league);
}

function uniqueLeagues(rows) {
  return [...new Set(rows.map(leagueSlugFromRow).filter(Boolean))].sort();
}

function rowsByLeague(rows) {
  const map = new Map();

  for (const row of rows) {
    const leagueSlug = leagueSlugFromRow(row);
    if (!leagueSlug) continue;
    if (!map.has(leagueSlug)) map.set(leagueSlug, []);
    map.get(leagueSlug).push(row);
  }

  return map;
}

function capRows(rows, maxRows) {
  if (!Number.isFinite(maxRows) || maxRows <= 0) return rows;
  return rows.slice(0, maxRows);
}

function runNodeJob(jobName, args, label) {
  const jobPath = path.join(__dirname, jobName);
  if (!fs.existsSync(jobPath)) {
    throw new Error(`missing job for ${label}: ${jobPath}`);
  }

  const result = spawnSync(process.execPath, [jobPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit ${result.status}\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
  }

  return {
    label,
    jobName,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim()
  };
}

function buildPaths(outputDir, date) {
  return {
    plan: path.join(outputDir, `active-league-plan-${date}.json`),
    workset: path.join(outputDir, `autonomous-workset-${date}.json`),
    targets: path.join(outputDir, `autonomous-targets-${date}.json`),
    seasonStatus: path.join(outputDir, `league-season-status-routing-${date}.json`),
    dayActivityBootstrap: path.join(outputDir, `league-day-activity-bootstrap-${date}.json`),
    normalizedDayActivity: path.join(outputDir, `league-day-activity-normalized-routing-${date}.json`),
    routingProof: path.join(outputDir, `season-aware-day-activity-routing-proof-${date}.json`),
    productionDayActivityState: path.join(repoRoot, "data", "football-truth", "_state", "league-day-activity", `${date}.json`)
  };
}

function createBootstrapDayActivity(filePath, date) {
  writeJson(filePath, {
    ok: true,
    reportType: "empty-day-activity-bootstrap-for-season-aware-routing-proof",
    generatedAt: new Date().toISOString(),
    targetDate: date,
    rows: [],
    summary: {
      rowCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      sourceFetch: false
    },
    guarantees: {
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  });
}

function routeLeague({ leagueSlug, activity, targetRows }) {
  const activityState = asText(activity.activityState) || "missing_day_activity_state_needs_autonomous_discovery";
  const fixtureAcquisitionMode = asText(activity.fixtureAcquisitionMode);
  const seasonFinishedCandidate = asBool(activity.seasonFinishedCandidate);
  const activeForDay = asBool(activity.activeForDay);

  const targetDateFixtureSearch =
    activeForDay ||
    activityState === "active_for_day" ||
    fixtureAcquisitionMode === "target_date_fixture_acquisition";

  const autonomousDiscovery =
    !targetDateFixtureSearch &&
    !seasonFinishedCandidate &&
    activityState !== "season_finished_or_out_of_season_candidate" &&
    activityState !== "no_expected_fixtures_for_day";

  const seasonMonitoring =
    asBool(activity.continueSeasonMonitoring) ||
    seasonFinishedCandidate ||
    activityState === "season_finished_or_out_of_season_candidate" ||
    activityState === "no_expected_fixtures_for_day";

  let routeState = "season_monitoring_only";
  if (targetDateFixtureSearch) routeState = "target_date_fixture_search";
  else if (autonomousDiscovery) routeState = "autonomous_day_activity_discovery";

  return {
    leagueSlug,
    activityState,
    routeState,
    routedToTargetDateFixtureSearch: targetDateFixtureSearch,
    routedToAutonomousSearch: autonomousDiscovery,
    routedToSeasonMonitoring: seasonMonitoring,
    targetRowCount: targetRows.length,
    emittedTargetRowCount: autonomousDiscovery || targetDateFixtureSearch ? targetRows.length : 0,
    seasonStatusState: asText(activity.seasonStatusState),
    standingsEvidenceState: asText(activity.standingsEvidenceState),
    seasonActiveCandidate: asBool(activity.seasonActiveCandidate),
    seasonFinishedCandidate,
    breakOrCalendarGapCandidate: asBool(activity.breakOrCalendarGapCandidate),
    continueAutonomousSearch: autonomousDiscovery,
    continueSeasonMonitoring: seasonMonitoring,
    hardExcludedFromFutureSearch: false,
    nextRequiredAction: asText(activity.nextRequiredAction || activity.seasonStatusNextRequiredAction)
  };
}

function buildRoutingProof({ date, workset, targets, normalizedDayActivity, maxTotalTargets }) {
  const workRows = selectRows(workset, ["workRows", "rows", "leagueRows"]);
  const targetRows = selectRows(targets, ["searchTargetRows", "targetRows", "rows"]);
  const activityRows = selectRows(normalizedDayActivity, ["rows", "dayActivityRows", "leagueRows", "results"]);

  const targetMap = rowsByLeague(targetRows);
  const activityMap = new Map();

  for (const row of activityRows) {
    const leagueSlug = leagueSlugFromRow(row);
    if (leagueSlug && !activityMap.has(leagueSlug)) activityMap.set(leagueSlug, row);
  }

  const leagueSlugs = [...new Set([
    ...uniqueLeagues(workRows),
    ...targetMap.keys(),
    ...activityMap.keys()
  ])].sort();

  const routingRows = leagueSlugs.map((leagueSlug) => routeLeague({
    leagueSlug,
    activity: activityMap.get(leagueSlug) || {
      leagueSlug,
      activityState: "missing_day_activity_state_needs_autonomous_discovery",
      fixtureAcquisitionMode: "continue_autonomous_day_discovery",
      continueSeasonMonitoring: true
    },
    targetRows: targetMap.get(leagueSlug) || []
  }));

  const routedTargetRows = [];
  for (const row of routingRows) {
    if (!row.routedToAutonomousSearch && !row.routedToTargetDateFixtureSearch) continue;
    routedTargetRows.push(...(targetMap.get(row.leagueSlug) || []));
  }

  const cappedTargetRows = capRows(routedTargetRows, maxTotalTargets);

  const byActivityState = {};
  const byRouteState = {};
  for (const row of routingRows) {
    byActivityState[row.activityState] = (byActivityState[row.activityState] || 0) + 1;
    byRouteState[row.routeState] = (byRouteState[row.routeState] || 0) + 1;
  }

  return {
    ok: routingRows.every((row) => asText(row.activityState)),
    reportType: "season-aware-day-activity-routing-proof",
    generatedAt: new Date().toISOString(),
    targetDate: date,
    summary: {
      workRowCount: workRows.length,
      inputTargetRowCount: targetRows.length,
      normalizedDayActivityRowCount: activityRows.length,
      routingRowCount: routingRows.length,
      emptyActivityStateCount: routingRows.filter((row) => !asText(row.activityState)).length,
      routedToAutonomousSearchCount: routingRows.filter((row) => row.routedToAutonomousSearch).length,
      routedToTargetDateFixtureSearchCount: routingRows.filter((row) => row.routedToTargetDateFixtureSearch).length,
      routedToSeasonMonitoringCount: routingRows.filter((row) => row.routedToSeasonMonitoring).length,
      emittedTargetRowCount: routedTargetRows.length,
      cappedTargetRowCount: cappedTargetRows.length,
      byActivityState,
      byRouteState,
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false
    },
    routingRows,
    routedTargetRows: cappedTargetRows,
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
  const workset = {
    workRows: [
      { leagueSlug: "eng.1" },
      { leagueSlug: "esp.1" },
      { leagueSlug: "caf.champions" }
    ]
  };

  const targets = {
    searchTargetRows: [
      { leagueSlug: "eng.1", query: "eng target" },
      { leagueSlug: "esp.1", query: "esp target" },
      { leagueSlug: "caf.champions", query: "caf target" }
    ]
  };

  const normalizedDayActivity = {
    rows: [
      { leagueSlug: "eng.1", activityState: "season_active_needs_day_fixture_discovery", seasonActiveCandidate: true, continueSeasonMonitoring: true },
      { leagueSlug: "esp.1", activityState: "season_finished_or_out_of_season_candidate", seasonFinishedCandidate: true, continueSeasonMonitoring: true },
      { leagueSlug: "caf.champions", activityState: "missing_day_activity_state_needs_autonomous_discovery", continueSeasonMonitoring: true }
    ]
  };

  const report = buildRoutingProof({
    date: "2026-06-02",
    workset,
    targets,
    normalizedDayActivity,
    maxTotalTargets: 0
  });

  if (!report.ok) throw new Error("expected ok report");
  if (report.summary.routingRowCount !== 3) throw new Error("expected three routing rows");
  if (report.summary.emptyActivityStateCount !== 0) throw new Error("expected no empty activity states");
  if (report.summary.routedToAutonomousSearchCount !== 2) throw new Error("expected two autonomous-search rows");
  if (report.summary.routedToSeasonMonitoringCount !== 3) throw new Error("expected three monitoring rows");
  if (report.summary.canonicalWrites !== 0 || report.summary.productionWrite !== false) {
    throw new Error("read-only guarantees changed");
  }

  return {
    ok: true,
    selfTest: "run-season-aware-day-activity-routing-proof",
    summary: report.summary
  };
}

function main() {
  const args = parseArgs(process.argv);

  if (args.selfTest) {
    console.log(JSON.stringify(runSelfTest(), null, 2));
    return;
  }

  const date = args.date || new Date().toISOString().slice(0, 10);
  const outputDir = args.outputDir
    ? path.resolve(args.outputDir)
    : fs.mkdtempSync(path.join(os.tmpdir(), `aiml-season-aware-routing-proof-${date}-`));

  fs.mkdirSync(outputDir, { recursive: true });

  const paths = buildPaths(outputDir, date);
  const steps = [];

  if (args.inputPlan) {
    fs.copyFileSync(path.resolve(args.inputPlan), paths.plan);
  } else {
    steps.push(runNodeJob("build-active-league-acquisition-plan-file.js", [
      "--date", date,
      "--output", paths.plan
    ], "active league plan"));
  }

  const worksetArgs = [
    "--input", paths.plan,
    "--output", paths.workset
  ];

  if (Number.isFinite(args.maxLeagues) && args.maxLeagues > 0) {
    worksetArgs.push("--limit", String(args.maxLeagues));
  }

  steps.push(runNodeJob("build-fixture-league-date-autonomous-source-discovery-workset-file.js", worksetArgs, "autonomous discovery workset"));

  steps.push(runNodeJob("build-fixture-league-date-autonomous-source-candidate-targets-file.js", [
    "--input", paths.workset,
    "--output", paths.targets
  ], "autonomous source candidate targets"));

  steps.push(runNodeJob("build-league-season-status-from-standings-file.js", [
    "--date", date,
    "--standings-dir", path.join("data", "standings"),
    "--output", paths.seasonStatus
  ], "standings-based league season status"));

  const dayActivityInput = fs.existsSync(paths.productionDayActivityState)
    ? paths.productionDayActivityState
    : paths.dayActivityBootstrap;

  if (!fs.existsSync(dayActivityInput)) {
    createBootstrapDayActivity(paths.dayActivityBootstrap, date);
  }

  steps.push(runNodeJob("normalize-league-day-activity-with-season-status-file.js", [
    "--date", date,
    "--day-activity", dayActivityInput,
    "--season-status", paths.seasonStatus,
    "--output", paths.normalizedDayActivity
  ], "normalize day activity with season status"));

  const workset = readJson(paths.workset);
  const targets = readJson(paths.targets);
  const normalizedDayActivity = readJson(paths.normalizedDayActivity);

  const report = buildRoutingProof({
    date,
    workset,
    targets,
    normalizedDayActivity,
    maxTotalTargets: args.maxTotalTargets
  });

  report.paths = {
    outputDir: path.relative(repoRoot, outputDir).replace(/\\/g, "/"),
    plan: path.relative(repoRoot, paths.plan).replace(/\\/g, "/"),
    workset: path.relative(repoRoot, paths.workset).replace(/\\/g, "/"),
    targets: path.relative(repoRoot, paths.targets).replace(/\\/g, "/"),
    seasonStatus: path.relative(repoRoot, paths.seasonStatus).replace(/\\/g, "/"),
    dayActivityInput: path.relative(repoRoot, path.resolve(dayActivityInput)).replace(/\\/g, "/"),
    normalizedDayActivity: path.relative(repoRoot, paths.normalizedDayActivity).replace(/\\/g, "/"),
    routingProof: path.relative(repoRoot, paths.routingProof).replace(/\\/g, "/")
  };

  report.steps = steps.map((step) => ({
    label: step.label,
    jobName: step.jobName
  }));

  writeJson(paths.routingProof, report);

  console.log(JSON.stringify({
    ok: report.ok,
    output: report.paths.routingProof,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectRun) {
  main();
}