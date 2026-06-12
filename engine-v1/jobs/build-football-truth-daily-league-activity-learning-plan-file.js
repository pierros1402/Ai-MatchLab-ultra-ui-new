import fs from "fs";
import path from "path";

function asText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    workset: "",
    targets: "",
    output: "",
    date: "",
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--workset") {
      args.workset = argv[++i] || "";
      continue;
    }

    if (arg === "--targets") {
      args.targets = argv[++i] || "";
      continue;
    }

    if (arg === "--output") {
      args.output = argv[++i] || "";
      continue;
    }

    if (arg === "--date") {
      args.date = argv[++i] || "";
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function selectRows(obj, names) {
  for (const name of names) {
    if (Array.isArray(obj?.[name])) return obj[name];
  }
  return [];
}

function intentOf(row) {
  return asText(row.intent || row.queryIntent || row.searchIntent);
}

function isKnownDayActivity(row) {
  if (row.activeForDay === true) return true;
  if (row.noExpectedFixturesForDay === true) return true;
  if (row.outOfSeasonForDay === true) return true;
  if (asText(row.nextKnownFixtureDate)) return true;

  const activityState = asText(row.activityState);
  const evidenceState = asText(row.dayActivityEvidenceState);
  const mode = asText(row.dayFixtureAcquisitionMode || row.fixtureAcquisitionMode);

  if (activityState && activityState !== "needs_day_activity_discovery") return true;
  if (evidenceState && evidenceState !== "unverified_for_day") return true;
  if (mode && mode !== "discovery_only") return true;

  return false;
}

function isActivityLearningTarget(row) {
  const intent = intentOf(row);
  const expectedSourceFamily = asText(row.expectedSourceFamily);
  const resolutionMode = asText(row.resolutionMode);

  return (
    intent === "official_fixture_url_surface_probe" ||
    intent === "official_fixture_url_surface" ||
    intent === "official_date_fixture_page" ||
    intent === "official_league_fixture_calendar" ||
    intent === "season_restart_calendar_discovery" ||
    resolutionMode === "autonomous_url_surface_probe" ||
    expectedSourceFamily === "official_league" ||
    expectedSourceFamily === "competition_operator" ||
    expectedSourceFamily === "national_federation"
  );
}

function targetPriority(row) {
  const intent = intentOf(row);
  const resolutionMode = asText(row.resolutionMode);
  const score = Number(row.compositeScore || row.priority || 0);

  if (resolutionMode === "autonomous_url_surface_probe") return 10000 + score;
  if (intent === "official_fixture_url_surface_probe") return 9000 + score;
  if (intent === "official_fixture_url_surface") return 8000 + score;
  if (intent === "official_date_fixture_page") return 7000 + score;
  if (intent === "official_league_fixture_calendar") return 6000 + score;
  if (intent === "season_restart_calendar_discovery") return 5000 + score;

  return score;
}

function groupByLeague(rows) {
  const map = new Map();
  for (const row of rows) {
    const leagueSlug = asText(row.leagueSlug);
    if (!leagueSlug) continue;
    if (!map.has(leagueSlug)) map.set(leagueSlug, []);
    map.get(leagueSlug).push(row);
  }
  return map;
}

function compactTarget(row) {
  return {
    searchTargetId: asText(row.searchTargetId),
    leagueSlug: asText(row.leagueSlug),
    name: asText(row.name || row.leagueName),
    country: asText(row.country),
    dayKey: asText(row.dayKey || row.date),
    intent: intentOf(row),
    expectedSourceFamily: asText(row.expectedSourceFamily),
    resolutionMode: asText(row.resolutionMode),
    query: asText(row.query),
    candidateUrl: asText(row.candidateUrl),
    compositeScore: Number(row.compositeScore || row.priority || 0),
    learningUse: intentOf(row) === "season_restart_calendar_discovery"
      ? "season_restart_or_next_fixture_date_learning"
      : "official_activity_surface_learning",
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
}

function buildPlan({ workset, targets, date }) {
  const workRows = selectRows(workset, ["workRows", "rows", "selectedRows"]);
  const targetRows = selectRows(targets, ["searchTargetRows", "targetRows", "rows"]);

  const targetsByLeague = groupByLeague(targetRows.filter(isActivityLearningTarget));

  const activityLearningRows = [];
  const fixtureAcquisitionBlockedRows = [];
  const readyForTargetDateFixtureAcquisitionRows = [];

  for (const workRow of workRows) {
    const leagueSlug = asText(workRow.leagueSlug);
    if (!leagueSlug) continue;

    const known = isKnownDayActivity(workRow);
    const leagueTargets = (targetsByLeague.get(leagueSlug) || [])
      .slice()
      .sort((a, b) => targetPriority(b) - targetPriority(a));

    const selectedLearningTargets = [];
    const seenIntent = new Set();

    for (const target of leagueTargets) {
      const intent = intentOf(target);
      const key = intent || asText(target.resolutionMode) || asText(target.query);
      if (seenIntent.has(key)) continue;
      seenIntent.add(key);
      selectedLearningTargets.push(compactTarget(target));
      if (selectedLearningTargets.length >= 4) break;
    }

    const base = {
      leagueSlug,
      name: asText(workRow.name || workRow.leagueName),
      country: asText(workRow.country),
      dayKey: asText(workRow.dayKey || date),
      activityState: asText(workRow.activityState),
      dayActivityEvidenceState: asText(workRow.dayActivityEvidenceState),
      dayFixtureAcquisitionMode: asText(workRow.dayFixtureAcquisitionMode || workRow.fixtureAcquisitionMode),
      activeForDay: workRow.activeForDay === true,
      noExpectedFixturesForDay: workRow.noExpectedFixturesForDay === true,
      outOfSeasonForDay: workRow.outOfSeasonForDay === true,
      nextKnownFixtureDate: asText(workRow.nextKnownFixtureDate),
      hasKnownDayActivityState: known,
      selectedActivityLearningTargetCount: selectedLearningTargets.length,
      selectedActivityLearningTargets: selectedLearningTargets,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    };

    if (known) {
      readyForTargetDateFixtureAcquisitionRows.push({
        ...base,
        nextAction: "eligible_for_target_date_fixture_routing"
      });
    } else {
      activityLearningRows.push({
        ...base,
        nextAction: "learn_day_activity_or_season_state_before_fixture_fetch",
        fixtureFetchBlockedUntilActivityKnown: true
      });

      fixtureAcquisitionBlockedRows.push({
        ...base,
        blockReason: "missing_day_activity_or_season_state",
        blockedAction: "target_date_fixture_fetch"
      });
    }
  }

  const byLeague = {};
  for (const row of activityLearningRows) {
    byLeague[row.leagueSlug] = {
      name: row.name,
      country: row.country,
      selectedActivityLearningTargetCount: row.selectedActivityLearningTargetCount,
      nextAction: row.nextAction,
      fixtureFetchBlockedUntilActivityKnown: true
    };
  }

  return {
    ok: true,
    job: "build-football-truth-daily-league-activity-learning-plan-file",
    mode: "read_only_daily_league_activity_learning_plan",
    generatedAt: new Date().toISOString(),
    date,
    summary: {
      inputWorkRowCount: workRows.length,
      inputSearchTargetRowCount: targetRows.length,
      activityLearningLeagueCount: activityLearningRows.length,
      fixtureAcquisitionBlockedLeagueCount: fixtureAcquisitionBlockedRows.length,
      readyForTargetDateFixtureAcquisitionLeagueCount: readyForTargetDateFixtureAcquisitionRows.length,
      activityLearningTargetRowCount: activityLearningRows.reduce((sum, row) => sum + row.selectedActivityLearningTargetCount, 0),
      requiredBeforeFixtureFetch: "learn_day_activity_or_season_state",
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    },
    policy: {
      fixtureAcquisitionRequiresKnownDayActivityState: true,
      missingDayActivityDoesNotMeanActive: true,
      missingDayActivityDoesNotMeanNoFixtures: true,
      seasonRestartCalendarDiscoveryIsActivityLearningOnly: true,
      noCanonicalPromotionFromActivityLearningPlan: true
    },
    byLeague,
    activityLearningRows,
    fixtureAcquisitionBlockedRows,
    readyForTargetDateFixtureAcquisitionRows,
    guarantees: {
      sourceFetch: false,
      noFetch: true,
      noUrlFetch: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

function selfTest() {
  const workset = {
    workRows: [
      {
        leagueSlug: "a.1",
        name: "A League",
        dayKey: "2026-06-12",
        activityState: "needs_day_activity_discovery",
        dayActivityEvidenceState: "unverified_for_day",
        dayFixtureAcquisitionMode: "discovery_only"
      },
      {
        leagueSlug: "b.1",
        name: "B League",
        dayKey: "2026-06-12",
        activeForDay: true
      }
    ]
  };

  const targets = {
    searchTargetRows: [
      {
        leagueSlug: "a.1",
        searchTargetId: "a.1:official-probe",
        intent: "official_fixture_url_surface_probe",
        resolutionMode: "autonomous_url_surface_probe",
        query: "https://example.test/fixtures",
        candidateUrl: "https://example.test/fixtures",
        compositeScore: 97
      },
      {
        leagueSlug: "a.1",
        searchTargetId: "a.1:restart",
        intent: "season_restart_calendar_discovery",
        query: "A League season start",
        compositeScore: 99
      },
      {
        leagueSlug: "b.1",
        searchTargetId: "b.1:official",
        intent: "official_fixture_url_surface",
        query: "B League fixtures",
        compositeScore: 100
      }
    ]
  };

  const report = buildPlan({ workset, targets, date: "2026-06-12" });

  if (report.summary.activityLearningLeagueCount !== 1) {
    throw new Error("self-test failed: expected one activity-learning league");
  }

  if (report.summary.fixtureAcquisitionBlockedLeagueCount !== 1) {
    throw new Error("self-test failed: expected one blocked league");
  }

  if (report.summary.readyForTargetDateFixtureAcquisitionLeagueCount !== 1) {
    throw new Error("self-test failed: expected one ready league");
  }

  if (report.activityLearningRows[0].selectedActivityLearningTargetCount !== 2) {
    throw new Error("self-test failed: expected two learning targets for a.1");
  }

  if (report.guarantees.noFetch !== true || report.guarantees.canonicalWrites !== 0 || report.guarantees.productionWrite !== false) {
    throw new Error("self-test failed: read-only guarantees missing");
  }

  return report;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "build-football-truth-daily-league-activity-learning-plan-file",
      summary: report.summary,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  if (!args.workset) throw new Error("--workset is required");
  if (!args.targets) throw new Error("--targets is required");
  if (!args.output) throw new Error("--output is required");

  const report = buildPlan({
    workset: readJson(args.workset),
    targets: readJson(args.targets),
    date: args.date
  });

  writeJson(args.output, report);
  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    job: "build-football-truth-daily-league-activity-learning-plan-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
}