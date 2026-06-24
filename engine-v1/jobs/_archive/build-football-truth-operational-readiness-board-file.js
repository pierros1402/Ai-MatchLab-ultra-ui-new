import fs from "fs";
import path from "path";

const JOB = "build-football-truth-operational-readiness-board-file";

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
  if (Array.isArray(input.boardRows)) return input.boardRows;
  if (Array.isArray(input.rows)) return input.rows;
  return [];
}

function countBy(rows, key) {
  const out = {};
  for (const row of rows) {
    const value = asText(row[key]) || "unknown";
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

function classifySeason(row) {
  const selectedCalendarEvidenceCount = num(row.selectedCalendarEvidenceCount);
  const needsSeasonStatus = boolValue(row.needsSeasonStatus);
  const explicit = asText(row.seasonState || row.seasonStatus || row.leagueSeasonState || row.statusBucket || row.seasonStatusBucket || row.seasonStateBucket);

  if (explicit) {
    return {
      state: explicit,
      confidence: "medium",
      blocker: "",
      nextAction: ""
    };
  }

  if (selectedCalendarEvidenceCount > 0) {
    return {
      state: "calendar_evidence_ready",
      confidence: "medium",
      blocker: "",
      nextAction: "classify_season_state_from_calendar_evidence"
    };
  }

  if (needsSeasonStatus) {
    return {
      state: "unknown_needs_calendar_evidence",
      confidence: "low",
      blocker: "season_status_unknown",
      nextAction: "run_season_calendar_evidence"
    };
  }

  return {
    state: "unknown",
    confidence: "low",
    blocker: "season_state_not_classified",
    nextAction: "run_season_calendar_evidence"
  };
}

function isActiveSeasonState(state) {
  const text = asText(state).toLowerCase();
  return (
    text.includes("active") ||
    text.includes("in_progress") ||
    text.includes("in-season") ||
    text.includes("in_season") ||
    text.includes("live")
  );
}

function isInactiveSeasonState(state) {
  const text = asText(state).toLowerCase();
  return (
    text.includes("offseason") ||
    text.includes("finished") ||
    text.includes("break") ||
    text.includes("not_active") ||
    text.includes("inactive")
  );
}

function classifyFixtureTruth(row, season) {
  const today = num(row.canonicalFixtureCountToday);
  const next7 = num(row.canonicalFixtureCountNext7Days);
  const needsFixtureAcquisition = boolValue(row.needsFixtureAcquisition);
  const needsDayActivityEvidence = boolValue(row.needsDayActivityEvidence);
  const hasDayActivityState = asText(row.dayActivityState || row.dayActivityStatus || row.dayActivityBucket);

  if (today > 0) {
    return {
      state: "verified_today_canonical_fixture_basis",
      confidence: "medium",
      blocker: "",
      nextAction: ""
    };
  }

  if (next7 > 0) {
    return {
      state: "date_window_uncertain",
      confidence: "low",
      blocker: "canonical_fixture_exists_outside_target_day",
      nextAction: "verify_fixture_date_window_and_timezone"
    };
  }

  if (season.state.startsWith("unknown") || season.state === "calendar_evidence_ready") {
    return {
      state: "deferred_until_season_state_known",
      confidence: "low",
      blocker: "season_state_unknown",
      nextAction: ""
    };
  }

  if (isInactiveSeasonState(season.state)) {
    return {
      state: "not_expected_for_inactive_season",
      confidence: "medium",
      blocker: "",
      nextAction: ""
    };
  }

  if (isActiveSeasonState(season.state) && (needsFixtureAcquisition || needsDayActivityEvidence || !hasDayActivityState)) {
    return {
      state: "missing_daily_fixture_basis_for_active_league",
      confidence: "low",
      blocker: "no_verified_daily_fixture_basis",
      nextAction: "run_verified_daily_fixture_acquisition"
    };
  }

  return {
    state: "unknown_fixture_basis",
    confidence: "low",
    blocker: "fixture_basis_not_classified",
    nextAction: "run_verified_daily_fixture_acquisition"
  };
}

function classifyStandings(row) {
  const standingsFileExists = boolValue(row.standingsFileExists);
  const needsStandingsRefresh = boolValue(row.needsStandingsRefresh);
  const standingsTableCount = num(row.standingsTableCount);
  const standingsFreshness = asText(row.standingsFreshness);

  if (!standingsFileExists) {
    return {
      state: "missing",
      confidence: "low",
      blocker: "standings_file_missing",
      nextAction: "run_standings_acquisition_or_refresh"
    };
  }

  if (needsStandingsRefresh) {
    return {
      state: "stale_or_needs_refresh",
      confidence: "low",
      blocker: "standings_refresh_needed",
      nextAction: "run_standings_refresh"
    };
  }

  if (standingsTableCount > 0 || standingsFreshness) {
    return {
      state: "usable",
      confidence: "medium",
      blocker: "",
      nextAction: ""
    };
  }

  return {
    state: "present_but_unclassified",
    confidence: "low",
    blocker: "standings_context_unclassified",
    nextAction: "classify_standings_context"
  };
}

function classifyHistoryCompleteness(row) {
  const historyRowsCount = num(row.historyRowsCount);
  const historyFinalRowsCount = num(row.historyFinalRowsCount);
  const missingFTCount = num(row.missingFTCount);
  const needsFTRepair = boolValue(row.needsFTRepair);

  if (historyRowsCount <= 0) {
    return {
      state: "missing_history",
      confidence: "low",
      blocker: "history_missing",
      nextAction: "run_history_backfill"
    };
  }

  if (needsFTRepair || missingFTCount > 0) {
    return {
      state: "partial_history_with_missing_ft",
      confidence: "low",
      blocker: "missing_ft_or_unverified_fixture_basis",
      nextAction: "verify_fixture_basis_before_ft_repair"
    };
  }

  if (historyFinalRowsCount > 0 && historyFinalRowsCount === historyRowsCount) {
    return {
      state: "history_final_rows_consistent_but_season_completeness_unverified",
      confidence: "medium",
      blocker: "season_expected_match_count_not_verified",
      nextAction: "run_season_completeness_estimator"
    };
  }

  return {
    state: "partial_or_mixed_history",
    confidence: "low",
    blocker: "history_final_rows_incomplete",
    nextAction: "run_history_completeness_check"
  };
}

function decideFtRepairGate({ row, fixtureTruth, season, history }) {
  const needsFTRepair = boolValue(row.needsFTRepair) || num(row.missingFTCount) > 0;

  if (!needsFTRepair) {
    return {
      state: "not_needed",
      blocker: "",
      nextAction: ""
    };
  }

  if (season.state.startsWith("unknown") || season.state === "calendar_evidence_ready") {
    return {
      state: "blocked",
      blocker: "blocked_by_unknown_season_state",
      nextAction: season.nextAction || "run_season_calendar_evidence"
    };
  }

  if (fixtureTruth.state !== "verified_today_canonical_fixture_basis") {
    return {
      state: "blocked",
      blocker: "blocked_by_fixture_truth",
      nextAction: fixtureTruth.nextAction || "run_verified_daily_fixture_acquisition"
    };
  }

  if (history.state === "missing_history") {
    return {
      state: "blocked",
      blocker: "blocked_by_missing_history",
      nextAction: history.nextAction || "run_history_backfill"
    };
  }

  return {
    state: "ready",
    blocker: "",
    nextAction: "run_ft_repair"
  };
}

function decideAiValueGate({ fixtureTruth, season, standings, history, ftRepairGate }) {
  if (season.state.startsWith("unknown") || season.state === "calendar_evidence_ready") {
    return {
      state: "blocked",
      blocker: "season_state_unknown",
      nextAction: season.nextAction || "run_season_calendar_evidence"
    };
  }

  if (isActiveSeasonState(season.state) && fixtureTruth.state !== "verified_today_canonical_fixture_basis") {
    return {
      state: "blocked",
      blocker: "fixture_truth_not_verified",
      nextAction: fixtureTruth.nextAction || "run_verified_daily_fixture_acquisition"
    };
  }

  if (standings.state !== "usable") {
    return {
      state: "blocked",
      blocker: "standings_not_usable",
      nextAction: standings.nextAction
    };
  }

  if (history.state !== "history_final_rows_consistent_but_season_completeness_unverified") {
    return {
      state: "blocked",
      blocker: "history_not_complete_or_not_verified",
      nextAction: history.nextAction
    };
  }

  if (ftRepairGate.state === "blocked") {
    return {
      state: "blocked",
      blocker: ftRepairGate.blocker,
      nextAction: ftRepairGate.nextAction
    };
  }

  return {
    state: "ready",
    blocker: "",
    nextAction: "ready_for_ai_value"
  };
}

function choosePrimaryNextAction({ fixtureTruth, season, standings, history, ftRepairGate, aiValueGate }) {
  if (season.nextAction) return season.nextAction;

  if (isActiveSeasonState(season.state) && fixtureTruth.nextAction) {
    return fixtureTruth.nextAction;
  }

  if (isInactiveSeasonState(season.state)) {
    if (history.nextAction === "verify_fixture_basis_before_ft_repair") {
      return "run_season_completeness_estimator";
    }
    if (history.nextAction) return history.nextAction;
    if (standings.nextAction) return standings.nextAction;
  }

  if (standings.nextAction) return standings.nextAction;
  if (history.nextAction) return history.nextAction;
  if (fixtureTruth.nextAction) return fixtureTruth.nextAction;
  if (ftRepairGate.nextAction) return ftRepairGate.nextAction;
  if (aiValueGate.nextAction) return aiValueGate.nextAction;

  return "review_manually";
}

function buildBoard({ inventory, inventoryPath }) {
  const inventoryRows = rowsFromInventory(inventory);

  const readinessRows = inventoryRows.map((row) => {
    const season = classifySeason(row);
    const fixtureTruth = classifyFixtureTruth(row, season);
    const standings = classifyStandings(row);
    const history = classifyHistoryCompleteness(row);
    const ftRepairGate = decideFtRepairGate({ row, fixtureTruth, season, history });
    const aiValueGate = decideAiValueGate({ fixtureTruth, season, standings, history, ftRepairGate });
    const primaryNextAction = choosePrimaryNextAction({ fixtureTruth, season, standings, history, ftRepairGate, aiValueGate });

    return {
      leagueSlug: asText(row.leagueSlug || row.competitionSlug),
      competitionSlug: asText(row.competitionSlug || row.leagueSlug),
      competitionName: asText(row.competitionName || row.leagueName),
      coverageType: asText(row.coverageType),
      coverageCountry: asText(row.coverageCountry),
      targetDate: asText(row.targetDate),
      seasonKey: asText(row.seasonKey),

      canonicalFixtureCountToday: num(row.canonicalFixtureCountToday),
      canonicalFixtureCountNext7Days: num(row.canonicalFixtureCountNext7Days),
      standingsFileExists: boolValue(row.standingsFileExists),
      standingsTableCount: num(row.standingsTableCount),
      historyRowsCount: num(row.historyRowsCount),
      historyFinalRowsCount: num(row.historyFinalRowsCount),
      missingFTCount: num(row.missingFTCount),

      fixtureTruthState: fixtureTruth.state,
      fixtureTruthConfidence: fixtureTruth.confidence,
      fixtureTruthBlocker: fixtureTruth.blocker,
      fixtureTruthNextAction: fixtureTruth.nextAction,

      seasonState: season.state,
      seasonStateConfidence: season.confidence,
      seasonStateBlocker: season.blocker,
      seasonNextAction: season.nextAction,

      standingsState: standings.state,
      standingsConfidence: standings.confidence,
      standingsBlocker: standings.blocker,
      standingsNextAction: standings.nextAction,

      historyCompletenessState: history.state,
      historyCompletenessConfidence: history.confidence,
      historyCompletenessBlocker: history.blocker,
      historyNextAction: history.nextAction,

      ftRepairGate: ftRepairGate.state,
      ftRepairBlocker: ftRepairGate.blocker,
      ftRepairNextAction: ftRepairGate.nextAction,

      aiValueGate: aiValueGate.state,
      aiValueBlocker: aiValueGate.blocker,
      aiValueNextAction: aiValueGate.nextAction,

      primaryNextAction,

      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false
    };
  });

  return {
    ok: true,
    job: JOB,
    mode: "read_only_operational_board",
    input: {
      inventoryPath
    },
    summary: {
      inventoryRowCount: inventoryRows.length,
      readinessRowCount: readinessRows.length,
      byFixtureTruthState: countBy(readinessRows, "fixtureTruthState"),
      bySeasonState: countBy(readinessRows, "seasonState"),
      byStandingsState: countBy(readinessRows, "standingsState"),
      byHistoryCompletenessState: countBy(readinessRows, "historyCompletenessState"),
      byFtRepairGate: countBy(readinessRows, "ftRepairGate"),
      byAiValueGate: countBy(readinessRows, "aiValueGate"),
      byPrimaryNextAction: countBy(readinessRows, "primaryNextAction"),
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
      usesOnlyProvidedInventory: true,
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
    readinessRows
  };
}

function selfTest() {
  const inventory = {
    inventoryRows: [
      {
        leagueSlug: "active.1",
        competitionName: "Active League",
        targetDate: "2026-06-05",
        standingsFileExists: true,
        standingsTableCount: 1,
        historyRowsCount: 100,
        historyFinalRowsCount: 100,
        missingFTCount: 0,
        needsFTRepair: false,
        needsFixtureAcquisition: true,
        needsDayActivityEvidence: true,
        needsSeasonStatus: false,
        canonicalFixtureCountToday: 0,
        seasonState: "active"
      },
      {
        leagueSlug: "unknown.1",
        competitionName: "Unknown League",
        targetDate: "2026-06-05",
        standingsFileExists: false,
        historyRowsCount: 0,
        historyFinalRowsCount: 0,
        missingFTCount: 2,
        needsFTRepair: true,
        needsFixtureAcquisition: true,
        needsDayActivityEvidence: true,
        needsSeasonStatus: true,
        canonicalFixtureCountToday: 0
      },
      {
        leagueSlug: "offseason.1",
        competitionName: "Offseason League",
        targetDate: "2026-06-05",
        standingsFileExists: true,
        standingsTableCount: 1,
        historyRowsCount: 100,
        historyFinalRowsCount: 100,
        missingFTCount: 0,
        needsFTRepair: false,
        needsFixtureAcquisition: false,
        needsDayActivityEvidence: false,
        needsSeasonStatus: false,
        canonicalFixtureCountToday: 0,
        seasonState: "offseason"
      }
    ]
  };

  const report = buildBoard({
    inventory,
    inventoryPath: "self-test-inventory"
  });

  if (report.summary.readinessRowCount !== 3) throw new Error("self-test row count failed");
  if (report.summary.byPrimaryNextAction.run_verified_daily_fixture_acquisition !== 1) throw new Error("self-test active fixture action failed");
  if (report.summary.byPrimaryNextAction.run_season_calendar_evidence !== 1) throw new Error("self-test unknown season action failed");
  if (report.summary.byFixtureTruthState.not_expected_for_inactive_season !== 1) throw new Error("self-test inactive fixture state failed");
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

  const inventoryPath = getArg("--inventory") || getArg("--input");
  const outputPath = getArg("--output");

  if (!inventoryPath) throw new Error("Missing required --inventory <path> or --input <path>");
  if (!outputPath) throw new Error("Missing required --output <path>");

  const inventory = readJson(inventoryPath);
  const report = buildBoard({ inventory, inventoryPath });

  if (report.summary.readinessRowCount <= 0) {
    throw new Error("Operational readiness board produced zero rows");
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