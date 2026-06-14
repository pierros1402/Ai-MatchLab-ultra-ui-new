#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";
const DEFAULT_TIMEZONE = "Europe/Athens";

const DEFAULT_FULL_MAP_INVENTORY =
  "data/football-truth/_diagnostics/full-competition-map-inventory-2026-06-11/full-competition-map-inventory-2026-06-11.json";

const DEFAULT_PREVIOUS_REFRESH_INPUT =
  "data/football-truth/_diagnostics/scoped-active-today-fixture-refresh-input-2026-06-13/scoped-active-today-fixture-refresh-input-2026-06-13.json";

const DEFAULT_PREVIOUS_ADAPTER_BATCH_PLAN =
  "data/football-truth/_diagnostics/scoped-active-today-adapter-family-batch-plan-2026-06-13/scoped-active-today-adapter-family-batch-plan-2026-06-13.json";

const SUPPRESSED_LOW_VALUE = new Set([
  "afg.1",
  "afg.2",
  "afg.cup",
  "pak.1",
  "pak.2",
  "pak.cup"
]);

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    timezone: DEFAULT_TIMEZONE,
    rollingPastDays: 14,
    rollingFutureDays: 30,
    fullMapInventory: DEFAULT_FULL_MAP_INVENTORY,
    previousRefreshInput: DEFAULT_PREVIOUS_REFRESH_INPUT,
    previousAdapterBatchPlan: DEFAULT_PREVIOUS_ADAPTER_BATCH_PLAN,
    output: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--timezone") args.timezone = argv[++i];
    else if (arg === "--rolling-past-days") args.rollingPastDays = Number(argv[++i]);
    else if (arg === "--rolling-future-days") args.rollingFutureDays = Number(argv[++i]);
    else if (arg === "--full-map-inventory") args.fullMapInventory = argv[++i];
    else if (arg === "--previous-refresh-input") args.previousRefreshInput = argv[++i];
    else if (arg === "--previous-adapter-batch-plan") args.previousAdapterBatchPlan = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.output) {
    args.output = path.join(
      "data/football-truth/_diagnostics",
      `active-day-rollover-full-map-plan-${args.date}`,
      `active-day-rollover-full-map-plan-${args.date}.json`
    );
  }

  return args;
}

function readJsonIfExists(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function stableJson(value) {
  return JSON.stringify(value, null, 2);
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value =
      row[key] === null || row[key] === undefined || String(row[key]).trim() === ""
        ? "__missing__"
        : String(row[key]).trim();

    counts[value] = (counts[value] || 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
  );
}

function findArrayByLikelyKeys(value, keys) {
  if (!value || typeof value !== "object") return [];

  for (const key of keys) {
    if (Array.isArray(value[key])) return value[key];
  }

  for (const nestedValue of Object.values(value)) {
    if (nestedValue && typeof nestedValue === "object" && !Array.isArray(nestedValue)) {
      const result = findArrayByLikelyKeys(nestedValue, keys);
      if (result.length) return result;
    }
  }

  return [];
}

function inferSlug(row) {
  return String(
    row.competitionSlug ||
    row.slug ||
    row.normalizedSlug ||
    row.competition ||
    row.id ||
    ""
  ).trim();
}

function inferType(row) {
  return String(
    row.competitionType ||
    row.type ||
    row.kind ||
    row.inventoryType ||
    ""
  ).trim();
}

function inferBucket(row) {
  return String(
    row.inventoryBucket ||
    row.executionBucket ||
    row.bucket ||
    row.lane ||
    row.status ||
    ""
  ).trim();
}

function inferProvider(row) {
  return String(
    row.providerHint ||
    row.provider ||
    row.expectedProvider ||
    row.officialProvider ||
    row.sourceProvider ||
    ""
  ).trim();
}

function normalizeInventoryRows(fullMapInventory) {
  const rows = findArrayByLikelyKeys(fullMapInventory, [
    "inventoryRows",
    "rows",
    "normalizedRows",
    "competitionRows",
    "competitions",
    "resolutionRows"
  ]);

  return rows.map((row, index) => {
    const slug = inferSlug(row);
    const type = inferType(row);
    const bucket = inferBucket(row);
    const providerHint = inferProvider(row);

    return {
      sourceIndex: index,
      competitionSlug: slug || `__missing_slug_${index}`,
      competitionName: String(row.competitionName || row.name || row.title || "").trim(),
      competitionType: type || "__unknown__",
      inventoryBucket: bucket || "__unknown__",
      providerHint,
      region: String(row.region || row.confederation || row.area || "").trim(),
      country: String(row.country || row.countryCode || row.iso2 || "").trim(),
      raw: row
    };
  });
}

function classifyRollingWindowLane(row, previousKnownSlugs) {
  const slug = row.competitionSlug;
  const type = row.competitionType.toLowerCase();
  const bucket = row.inventoryBucket.toLowerCase();
  const provider = row.providerHint;

  if (SUPPRESSED_LOW_VALUE.has(slug)) {
    return {
      rolloverLane: "suppressed_low_value_no_active_work_not_inactive_assertion",
      rollingWindowEvaluationRequired: false,
      inactiveAsserted: false,
      sourceCoverageKnownComplete: false,
      laneReason: "suppressed_by_existing_low_value_policy_not_an_inactive_truth_assertion"
    };
  }

  if (type.includes("cup")) {
    return {
      rolloverLane: "cup_requires_separate_rolling_window_or_round_lane_not_daily_league_scan",
      rollingWindowEvaluationRequired: true,
      primaryLeagueScanTarget: false,
      requiresSeparateCupActivityLane: true,
      inactiveAsserted: false,
      sourceCoverageKnownComplete: false,
      laneReason: "cup_must_not_be_inferred_inactive_from_no_daily_league_fixture_and_requires_round_final_or_fixture_window_evidence"
    };
  }

  const leagueLike = type.includes("league") || slug.endsWith(".1") || slug.endsWith(".2");

  if (!leagueLike) {
    return {
      rolloverLane: "non_league_or_registry_gap_requires_type_resolution_not_inactive_assertion",
      rollingWindowEvaluationRequired: false,
      primaryLeagueScanTarget: false,
      requiresSeparateRegistryOrCompetitionTypeResolutionLane: true,
      inactiveAsserted: false,
      sourceCoverageKnownComplete: false,
      laneReason: "not_classified_as_daily_league_target_and_must_not_be_inferred_inactive"
    };
  }

  if (previousKnownSlugs.has(slug)) {
    return {
      rolloverLane: "league_previous_active_day_universe_carry_forward_requires_rolling_window_recheck",
      rollingWindowEvaluationRequired: true,
      primaryLeagueScanTarget: true,
      inactiveAsserted: false,
      sourceCoverageKnownComplete: false,
      laneReason: "present_in_previous_active_day_universe_but_today_requires_rolling_window_recheck_not_single_date_inference"
    };
  }

  if (provider) {
    return {
      rolloverLane: "league_provider_hint_available_requires_rolling_window_activity_check",
      rollingWindowEvaluationRequired: true,
      primaryLeagueScanTarget: true,
      inactiveAsserted: false,
      sourceCoverageKnownComplete: false,
      laneReason: "provider_hint_or_signal_available_but_active_state_requires_rolling_window_fixture_or_result_evidence"
    };
  }

  if (
    bucket.includes("missing") ||
    bucket.includes("provider_discovery") ||
    bucket.includes("truth_review") ||
    bucket.includes("signals")
  ) {
    return {
      rolloverLane: "league_missing_or_untrusted_provider_requires_source_resolution_and_rolling_window_check",
      rollingWindowEvaluationRequired: true,
      primaryLeagueScanTarget: true,
      inactiveAsserted: false,
      sourceCoverageKnownComplete: false,
      laneReason: "missing_or_untrusted_provider_means_unresolved_not_inactive_broad_search_remains_blocked"
    };
  }

  return {
    rolloverLane: "league_low_information_requires_rolling_window_activity_check",
    rollingWindowEvaluationRequired: true,
    primaryLeagueScanTarget: true,
    inactiveAsserted: false,
    sourceCoverageKnownComplete: false,
    laneReason: "league_row_requires_rolling_window_classification_even_without_trusted_provider"
  };
}

function main() {
  const args = parseArgs(process.argv);

  const fullMapInventory = readJsonIfExists(args.fullMapInventory);
  if (!fullMapInventory) throw new Error(`Missing full map inventory: ${args.fullMapInventory}`);

  const previousRefreshInput = readJsonIfExists(args.previousRefreshInput);
  const previousAdapterBatchPlan = readJsonIfExists(args.previousAdapterBatchPlan);

  const inventoryRows = normalizeInventoryRows(fullMapInventory);
  const previousRefreshRows = Array.isArray(previousRefreshInput?.refreshRows)
    ? previousRefreshInput.refreshRows
    : Array.isArray(previousRefreshInput?.refreshInputRows)
      ? previousRefreshInput.refreshInputRows
      : [];

  const previousKnownSlugs = new Set(
    previousRefreshRows
      .map((row) => row.competitionSlug || row.slug)
      .filter(Boolean)
      .map(String)
  );

  const previousAdapterBatchRows = Array.isArray(previousAdapterBatchPlan?.batchRows)
    ? previousAdapterBatchPlan.batchRows
    : [];

  const rolloverRows = inventoryRows.map((row) => {
    const lane = classifyRollingWindowLane(row, previousKnownSlugs);

    return {
      competitionSlug: row.competitionSlug,
      competitionName: row.competitionName,
      competitionType: row.competitionType,
      inventoryBucket: row.inventoryBucket,
      providerHint: row.providerHint,
      region: row.region,
      country: row.country,
      targetLocalDate: args.date,
      timezone: args.timezone,
      rollingWindow: {
        localDate: args.date,
        pastDays: args.rollingPastDays,
        futureDays: args.rollingFutureDays,
        semantics: "recent_results_or_upcoming_fixtures_window_not_single_day_match_presence"
      },
      previousActiveDayUniverseMember: previousKnownSlugs.has(row.competitionSlug),
      ...lane,
      noFixtureOnTargetDateDoesNotMeanInactive: true,
      excludedDoesNotMeanInactive: lane.primaryLeagueScanTarget === false || lane.rollingWindowEvaluationRequired === false,
      broadSearchAllowedNow: false,
      fetchAllowedNow: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false,
      nextAction:
        lane.rollingWindowEvaluationRequired
          ? "include_in_rolling_window_activity_evidence_plan_or_source_resolution_without_broad_search"
          : "route_to_separate_resolution_lane_without_inactive_assertion"
    };
  });

  const rollingWindowRows = rolloverRows.filter((row) => row.rollingWindowEvaluationRequired);
  const primaryLeagueScanRows = rolloverRows.filter((row) => row.primaryLeagueScanTarget === true);
  const cups = rolloverRows.filter((row) => row.requiresSeparateCupActivityLane);
  const unresolvedProviderRows = rolloverRows.filter((row) =>
    row.rolloverLane === "league_missing_or_untrusted_provider_requires_source_resolution_and_rolling_window_check"
  );

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    timezone: args.timezone,
    job: "build-football-truth-active-day-rollover-full-map-plan-file",
    mode: "source_only_full_map_rolling_window_activity_rollover_plan_no_fetch_no_broad_search_no_canonical_writes_no_production_writes",
    fullMapScan: true,
    sourceCoverageCompleteForFullMap: false,
    activitySemantics: {
      noFixtureOnTargetDateDoesNotMeanInactive: true,
      singleDayFixtureAbsenceDoesNotMeanInactive: true,
      activeStateRequiresRollingWindowEvidence: true,
      inactiveRequiresExplicitSeasonEndOrNoFixturesAcrossTrustedWindow: true,
      rollingPastDays: args.rollingPastDays,
      rollingFutureDays: args.rollingFutureDays
    },
    broadSearchAllowedNow: false,
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      fullMapInventory: args.fullMapInventory,
      previousRefreshInput: args.previousRefreshInput,
      previousAdapterBatchPlan: args.previousAdapterBatchPlan,
      inventoryRowCount: inventoryRows.length,
      previousActiveDayUniverseRowCount: previousRefreshRows.length,
      previousAdapterBatchCount: previousAdapterBatchRows.length
    },
    summary: {
      inventoryRowCount: inventoryRows.length,
      rolloverRowCount: rolloverRows.length,
      rollingWindowEvaluationRequiredCount: rollingWindowRows.length,
      primaryLeagueRollingWindowTargetCount: primaryLeagueScanRows.length,
      previousActiveDayUniverseCarryForwardCount: rolloverRows.filter((row) => row.previousActiveDayUniverseMember).length,
      missingOrUntrustedProviderNeedsSourceResolutionCount: unresolvedProviderRows.length,
      cupRequiresSeparateRollingWindowOrRoundLaneCount: cups.length,
      nonLeagueOrRegistryGapRequiresResolutionCount: rolloverRows.filter((row) => row.requiresSeparateRegistryOrCompetitionTypeResolutionLane).length,
      suppressedLowValueNoActiveWorkCount: rolloverRows.filter((row) => row.rolloverLane === "suppressed_low_value_no_active_work_not_inactive_assertion").length,
      sourceCoverageCompleteForFullMap: false,
      inactiveAssertedCount: rolloverRows.filter((row) => row.inactiveAsserted).length,
      noFixtureOnTargetDateDoesNotMeanInactiveCount: rolloverRows.filter((row) => row.noFixtureOnTargetDateDoesNotMeanInactive).length,
      broadSearchAllowedNowCount: 0,
      fetchAllowedNowCount: 0,
      canonicalWriteEligibleNowCount: 0,
      sourceFetch: false,
      searchProviderUsed: false,
      canonicalWrites: 0,
      productionWrite: false,
      recommendedNextLane: "build_2026_06_14_full_map_rolling_window_activity_universe_no_broad_search"
    },
    counts: {
      byRolloverLane: countBy(rolloverRows, "rolloverLane"),
      byCompetitionType: countBy(rolloverRows, "competitionType"),
      byInventoryBucket: countBy(rolloverRows, "inventoryBucket"),
      byRegion: countBy(rolloverRows, "region")
    },
    reusableSourceInfrastructure: {
      adapterFamilyBatchPlanReusable: Boolean(previousAdapterBatchPlan),
      previousAdapterFamilies: previousAdapterBatchRows.map((row) => ({
        adapterFamily: row.adapterFamily,
        extractionRisk: row.extractionRisk,
        rowCount: row.rowCount,
        competitions: row.competitions
      })),
      note: "Previous 2026-06-13 diagnostics are not today's truth. Source jobs and adapter contracts are reusable, but active/inactive state requires a rolling window for 2026-06-14."
    },
    guardrails: [
      "This planner scans the full internal competition map.",
      "This planner does not assert inactivity for any row.",
      "No fixture on the target date does not mean inactive.",
      "No fixture yesterday does not mean no fixture tomorrow or later.",
      "Active state requires trusted rolling-window evidence, not single-day match presence.",
      "Excluded from primary daily league scan means separate lane or unresolved source, not inactive.",
      "Full-map trusted source coverage is not complete while missing/untrusted provider rows remain.",
      "Cup rows require separate cup activity/final/round/date lanes.",
      "This planner does not use broad/untrusted search.",
      "This planner does not fetch.",
      "This planner does not write canonical files.",
      "This planner does not write production files.",
      "Zero search results must not be treated as absence."
    ],
    rolloverRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    inventoryRowCount: output.summary.inventoryRowCount,
    rolloverRowCount: output.summary.rolloverRowCount,
    rollingWindowEvaluationRequiredCount: output.summary.rollingWindowEvaluationRequiredCount,
    primaryLeagueRollingWindowTargetCount: output.summary.primaryLeagueRollingWindowTargetCount,
    previousActiveDayUniverseCarryForwardCount: output.summary.previousActiveDayUniverseCarryForwardCount,
    missingOrUntrustedProviderNeedsSourceResolutionCount: output.summary.missingOrUntrustedProviderNeedsSourceResolutionCount,
    cupRequiresSeparateRollingWindowOrRoundLaneCount: output.summary.cupRequiresSeparateRollingWindowOrRoundLaneCount,
    nonLeagueOrRegistryGapRequiresResolutionCount: output.summary.nonLeagueOrRegistryGapRequiresResolutionCount,
    sourceCoverageCompleteForFullMap: output.summary.sourceCoverageCompleteForFullMap,
    inactiveAssertedCount: output.summary.inactiveAssertedCount,
    noFixtureOnTargetDateDoesNotMeanInactiveCount: output.summary.noFixtureOnTargetDateDoesNotMeanInactiveCount,
    broadSearchAllowedNowCount: 0,
    fetchAllowedNowCount: 0,
    canonicalWriteEligibleNowCount: 0,
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    recommendedNextLane: output.summary.recommendedNextLane
  }, null, 2));
}

main();
