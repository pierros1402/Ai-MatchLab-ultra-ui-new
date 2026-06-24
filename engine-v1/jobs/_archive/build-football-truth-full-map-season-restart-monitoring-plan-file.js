#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const SUPPRESSED_LOW_VALUE_SLUGS = new Set([
  "afg.1",
  "afg.2",
  "afg.cup",
  "pak.1",
  "pak.2",
  "pak.cup"
]);

function asText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    inventory: "",
    currentBoard: "",
    seasonWatch: "",
    output: "",
    date: "",
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--inventory") args.inventory = argv[++i] || "";
    else if (arg === "--current-board") args.currentBoard = argv[++i] || "";
    else if (arg === "--season-watch") args.seasonWatch = argv[++i] || "";
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg === "--date") args.date = argv[++i] || "";
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function collectRows(value, depth = 0) {
  if (depth > 5 || !value) return [];

  if (Array.isArray(value)) {
    const objectRows = value.filter((row) => row && typeof row === "object");
    const slugRows = objectRows.filter((row) => slugOf(row));
    if (slugRows.length) return slugRows;
    return objectRows.flatMap((row) => collectRows(row, depth + 1));
  }

  if (typeof value !== "object") return [];

  const preferredKeys = [
    "normalizedCompetitionRows",
    "competitionRows",
    "inventoryRows",
    "fullMapRows",
    "allRows",
    "rows",
    "competitionStateBoard",
    "activityGapRows",
    "partialGapRows",
    "repairGapRows"
  ];

  for (const key of preferredKeys) {
    if (Array.isArray(value[key])) {
      const rows = collectRows(value[key], depth + 1);
      if (rows.length) return rows;
    }
  }

  const collected = [];
  for (const child of Object.values(value)) {
    collected.push(...collectRows(child, depth + 1));
  }
  return collected;
}

function slugOf(row) {
  return asText(
    row?.competitionSlug ||
    row?.leagueSlug ||
    row?.slug ||
    row?.competition ||
    row?.league ||
    row?.id
  );
}

function nameOf(row) {
  return asText(row?.competitionName || row?.leagueName || row?.name || row?.displayName || row?.searchName);
}

function typeOf(row) {
  const value = asText(row?.competitionType || row?.type || row?.kind || row?.category).toLowerCase();
  if (value.includes("cup")) return "cup";
  if (value.includes("league")) return "league";
  if (value.includes("continental")) return "continental_or_international";
  if (value.includes("international")) return "continental_or_international";
  return value || "unknown";
}

function isSuppressed(row) {
  const slug = slugOf(row);
  const bucket = asText(row?.inventoryBucket || row?.bucket || row?.executionBucket || row?.stateBucket).toLowerCase();

  return (
    SUPPRESSED_LOW_VALUE_SLUGS.has(slug) ||
    row?.suppressed === true ||
    row?.lowValueSuppressed === true ||
    bucket.includes("suppressed_low_value") ||
    bucket.includes("low_value_no_active_work")
  );
}

function currentStateOf(row) {
  return asText(row?.currentSeasonState || row?.seasonState || row?.activityState || row?.state || row?.competitionState);
}

function isActiveState(state) {
  const value = asText(state).toLowerCase();
  return value === "active" || value.includes("active_current_season") || value.includes("fixtures_available");
}

function isNonActiveState(state) {
  const value = asText(state).toLowerCase();
  return (
    value.includes("completed") ||
    value.includes("results_only") ||
    value.includes("inactive") ||
    value.includes("out_of_season") ||
    value.includes("no_expected")
  );
}

function isBlockedState(state) {
  const value = asText(state).toLowerCase();
  return value.includes("blocked") || value.includes("repair");
}

function indexBySlug(rows) {
  const map = new Map();
  for (const row of rows) {
    const slug = slugOf(row);
    if (!slug) continue;
    if (!map.has(slug)) map.set(slug, row);
  }
  return map;
}

function canonicalWatchStateFor(slug, seasonWatchRows) {
  return seasonWatchRows.find((row) => {
    return asText(row?.competitionSlug) === slug || asText(row?.leagueSlug) === slug;
  }) || null;
}

function buildMonitoringRow({ inventoryRow, currentRow, seasonWatchRow }) {
  const slug = slugOf(inventoryRow);
  const competitionType = typeOf(inventoryRow);
  const state = currentStateOf(currentRow);
  const canonicalActivityState = asText(seasonWatchRow?.activityState);
  const fixtureTruthState = asText(seasonWatchRow?.fixtureTruthState);
  const dailyFixtureGateState = asText(seasonWatchRow?.dailyFixtureGateState);

  let monitoringBucket = "full_map_activity_and_restart_discovery_required";
  let nextRequiredAction = "discover_official_activity_or_restart_route";
  let dailyFixtureEligibility = "blocked_until_truth_gate";

  if (seasonWatchRow && canonicalActivityState === "active_current_season" && fixtureTruthState === "fixtures_available") {
    monitoringBucket = "canonical_activity_gate_active";
    nextRequiredAction = "eligible_for_daily_fixture_acquisition_after_fixture_materialization_plan";
    dailyFixtureEligibility = dailyFixtureGateState || "eligible_after_explicit_truth_approval";
  } else if (isBlockedState(state)) {
    monitoringBucket = "repair_required_before_activity_or_restart_truth";
    nextRequiredAction = "repair_provider_or_official_route";
  } else if (isActiveState(state)) {
    monitoringBucket = "known_active_needs_canonical_gate_or_fixture_materialization_review";
    nextRequiredAction = "build_scoped_truth_review_or_writer_plan";
  } else if (isNonActiveState(state)) {
    monitoringBucket = "non_active_restart_discovery_required";
    nextRequiredAction = "find_next_season_restart_or_next_known_fixture_date";
  } else if (competitionType === "cup") {
    monitoringBucket = "cup_winner_or_next_start_discovery_required";
    nextRequiredAction = "find_cup_winner_final_or_next_cup_start_date";
  }

  return {
    competitionSlug: slug,
    leagueSlug: slug,
    competitionName: nameOf(inventoryRow),
    competitionType,
    country: asText(inventoryRow?.country || inventoryRow?.countryCode || inventoryRow?.countrySlug),
    region: asText(inventoryRow?.region),
    currentSeasonState: state,
    canonicalActivityState,
    fixtureTruthState,
    dailyFixtureGateState,
    monitoringBucket,
    nextRequiredAction,
    dailyFixtureEligibility,
    requiredEvidence: {
      officialActivityRoute: true,
      officialFixtureOrResultEvidence: monitoringBucket !== "non_active_restart_discovery_required",
      restartOrNextSeasonDate: monitoringBucket === "non_active_restart_discovery_required" || monitoringBucket === "full_map_activity_and_restart_discovery_required",
      secondaryReferenceAllowedForComparisonOnly: true,
      zeroSearchResultDoesNotImplyAbsence: true
    },
    writePolicy: {
      noCanonicalWriteFromThisPlan: true,
      truthReviewRequiredBeforeWrite: true,
      noFixtureWrites: true,
      noResultWrites: true,
      noStandingWrites: true,
      noSourceReliabilityMutation: true
    }
  };
}

function fifaRows(existingSlugs) {
  const base = [
    {
      competitionSlug: "fifa.world_cup",
      competitionName: "FIFA World Cup",
      fifaOfficialLane: "fifa_official_competition_route_required",
      reason: "custom_or_unmapped_watchlist_competition_not_promoted_by_general_search"
    },
    {
      competitionSlug: "fifa.club_world_cup",
      competitionName: "FIFA Club World Cup",
      fifaOfficialLane: "fifa_official_competition_route_required",
      reason: "official_fifa_competition_route_needed_for_active_or_upcoming_fixture_truth"
    }
  ];

  return base.map((row) => ({
    ...row,
    leagueSlug: row.competitionSlug,
    competitionType: "continental_or_international",
    monitoringBucket: existingSlugs.has(row.competitionSlug)
      ? "fifa_official_lane_required"
      : "fifa_custom_lane_required_missing_or_unmapped",
    nextRequiredAction: "build_fifa_official_route_recovery_plan_read_only",
    requiredEvidence: {
      fifaOfficialCompetitionUrl: true,
      officialScheduleOrMatchCentre: true,
      tournamentDateWindow: true,
      qualifierOrFinalTournamentStartDate: true,
      secondaryReferenceAllowedForComparisonOnly: true
    },
    writePolicy: {
      noCanonicalWriteFromThisPlan: true,
      truthReviewRequiredBeforeWrite: true,
      noFixtureWrites: true,
      noResultWrites: true,
      noStandingWrites: true,
      noSourceReliabilityMutation: true
    }
  }));
}

function buildPlan({ inventory, currentBoard, seasonWatch, date }) {
  const inventoryRowsRaw = collectRows(inventory);
  const currentRows = collectRows(currentBoard);
  const seasonWatchRows = collectRows(seasonWatch);

  const currentBySlug = indexBySlug(currentRows);
  const seen = new Set();
  const normalizedInventoryRows = [];

  for (const row of inventoryRowsRaw) {
    const slug = slugOf(row);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);

    const type = typeOf(row);
    if (!["league", "cup", "continental_or_international", "unknown"].includes(type)) continue;
    if (isSuppressed(row)) continue;

    normalizedInventoryRows.push(row);
  }

  const monitoringRows = normalizedInventoryRows.map((row) => {
    const slug = slugOf(row);
    return buildMonitoringRow({
      inventoryRow: row,
      currentRow: currentBySlug.get(slug) || null,
      seasonWatchRow: canonicalWatchStateFor(slug, seasonWatchRows)
    });
  });

  const fifaOfficialLaneRows = fifaRows(new Set(monitoringRows.map((row) => row.competitionSlug)));

  const byBucket = {};
  for (const row of monitoringRows) {
    byBucket[row.monitoringBucket] = (byBucket[row.monitoringBucket] || 0) + 1;
  }

  return {
    ok: true,
    job: "build-football-truth-full-map-season-restart-monitoring-plan-file",
    mode: "read_only_full_map_season_restart_monitoring_plan",
    generatedAt: new Date().toISOString(),
    date,
    summary: {
      inventoryInputRowCount: inventoryRowsRaw.length,
      normalizedMonitoringCompetitionCount: monitoringRows.length,
      currentBoardRowCount: currentRows.length,
      seasonWatchRowCount: seasonWatchRows.length,
      canonicalActivityGateActiveCount: byBucket.canonical_activity_gate_active || 0,
      knownActiveNeedsReviewCount: byBucket.known_active_needs_canonical_gate_or_fixture_materialization_review || 0,
      nonActiveRestartDiscoveryRequiredCount: byBucket.non_active_restart_discovery_required || 0,
      unknownActivityOrRestartDiscoveryRequiredCount: byBucket.full_map_activity_and_restart_discovery_required || 0,
      cupWinnerOrNextStartDiscoveryRequiredCount: byBucket.cup_winner_or_next_start_discovery_required || 0,
      repairRequiredCount: byBucket.repair_required_before_activity_or_restart_truth || 0,
      fifaOfficialLaneRowCount: fifaOfficialLaneRows.length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      byMonitoringBucket: byBucket
    },
    monitoringRows,
    fifaOfficialLaneRows,
    recurringPolicy: {
      activeDiscoveryRequired: true,
      restartDiscoveryRequiredForNonActive: true,
      fullMapNotLeagueByLeague: true,
      dailyFixtureAcquisitionRequiresCanonicalTruthGate: true,
      zeroSearchResultDoesNotImplyAbsence: true,
      secondaryReferenceCannotPromoteCanonical: true
    },
    policy: {
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      noCanonicalPromotion: true,
      noCanonicalWritesFromThisPlan: true,
      noFixtureWrites: true,
      noResultWrites: true,
      noStandingWrites: true,
      noSourceReliabilityMutation: true,
      productionWrite: false,
      dryRun: true
    },
    guarantees: {
      noSearch: true,
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
  const plan = buildPlan({
    date: "2026-06-12",
    inventory: {
      rows: [
        { competitionSlug: "isl.1", competitionName: "Icelandic Besta deild karla", competitionType: "league" },
        { competitionSlug: "abc.1", competitionName: "Inactive League", competitionType: "league" },
        { competitionSlug: "xyz.cup", competitionName: "Cup", competitionType: "cup" }
      ]
    },
    currentBoard: {
      rows: [
        { competitionSlug: "abc.1", currentSeasonState: "completed_or_results_only" }
      ]
    },
    seasonWatch: {
      rows: [
        { competitionSlug: "isl.1", activityState: "active_current_season", fixtureTruthState: "fixtures_available" }
      ]
    }
  });

  if (plan.summary.canonicalActivityGateActiveCount !== 1) throw new Error("expected one canonical active gate");
  if (plan.summary.nonActiveRestartDiscoveryRequiredCount !== 1) throw new Error("expected one restart discovery row");
  if (plan.summary.fifaOfficialLaneRowCount !== 2) throw new Error("expected two FIFA lane rows");
  if (plan.guarantees.canonicalWrites !== 0) throw new Error("must not write canonical");

  return plan;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const plan = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "build-football-truth-full-map-season-restart-monitoring-plan-file",
      summary: plan.summary,
      fifaOfficialLaneRows: plan.fifaOfficialLaneRows,
      guarantees: plan.guarantees
    }, null, 2));
    return;
  }

  if (!args.inventory) throw new Error("--inventory is required");
  if (!args.currentBoard) throw new Error("--current-board is required");
  if (!args.seasonWatch) throw new Error("--season-watch is required");
  if (!args.output) throw new Error("--output is required");

  const plan = buildPlan({
    inventory: readJson(args.inventory),
    currentBoard: readJson(args.currentBoard),
    seasonWatch: readJson(args.seasonWatch),
    date: args.date
  });

  writeJson(args.output, plan);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: plan.summary,
    guarantees: plan.guarantees
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    job: "build-football-truth-full-map-season-restart-monitoring-plan-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
}