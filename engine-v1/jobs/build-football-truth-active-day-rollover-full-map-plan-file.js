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

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    timezone: DEFAULT_TIMEZONE,
    fullMapInventory: DEFAULT_FULL_MAP_INVENTORY,
    previousRefreshInput: DEFAULT_PREVIOUS_REFRESH_INPUT,
    previousAdapterBatchPlan: DEFAULT_PREVIOUS_ADAPTER_BATCH_PLAN,
    output: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--timezone") args.timezone = argv[++i];
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

function classifyRolloverLane(row, previousKnownSlugs) {
  const type = row.competitionType.toLowerCase();
  const bucket = row.inventoryBucket.toLowerCase();
  const provider = row.providerHint;

  if (["afg.1", "afg.2", "afg.cup", "pak.1", "pak.2", "pak.cup"].includes(row.competitionSlug)) {
    return {
      rolloverLane: "suppressed_low_value_no_active_work",
      activeDayDiscoveryRequired: false,
      laneReason: "suppressed_by_existing_low_value_policy"
    };
  }

  if (type.includes("cup")) {
    return {
      rolloverLane: "cup_not_in_primary_active_league_day_scan",
      activeDayDiscoveryRequired: false,
      laneReason: "cup_handled_by_winner_or_round_specific_lanes_not_daily_league_active_scan"
    };
  }

  if (!type.includes("league") && !row.competitionSlug.endsWith(".1") && !row.competitionSlug.endsWith(".2")) {
    return {
      rolloverLane: "non_league_or_registry_gap_not_primary_active_day_scan",
      activeDayDiscoveryRequired: false,
      laneReason: "not_classified_as_daily_league_scan_target"
    };
  }

  if (previousKnownSlugs.has(row.competitionSlug)) {
    return {
      rolloverLane: "rerun_from_previous_active_day_universe",
      activeDayDiscoveryRequired: true,
      laneReason: "present_in_previous_active_day_discovery_universe_and_must_roll_forward_to_new_local_date"
    };
  }

  if (provider) {
    return {
      rolloverLane: "full_map_league_provider_hint_available_needs_active_day_check",
      activeDayDiscoveryRequired: true,
      laneReason: "league_row_has_provider_hint_or_signal_and_should_be_in_2026_06_14_active_day_scan"
    };
  }

  if (
    bucket.includes("missing") ||
    bucket.includes("provider_discovery") ||
    bucket.includes("truth_review") ||
    bucket.includes("signals")
  ) {
    return {
      rolloverLane: "full_map_league_missing_or_untrusted_provider_needs_source_resolution_not_broad_search",
      activeDayDiscoveryRequired: true,
      laneReason: "league_row_needs_active_day_status_but broad search remains blocked"
    };
  }

  return {
    rolloverLane: "full_map_league_low_information_active_day_check_needed",
    activeDayDiscoveryRequired: true,
    laneReason: "league_row_in_full_map_requires active-day classification even without trusted provider"
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

  const rolloverRows = inventoryRows.map((row) => {
    const lane = classifyRolloverLane(row, previousKnownSlugs);

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
      previousActiveDayUniverseMember: previousKnownSlugs.has(row.competitionSlug),
      ...lane,
      broadSearchAllowedNow: false,
      fetchAllowedNow: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false,
      nextAction:
        lane.activeDayDiscoveryRequired
          ? "include_in_2026_06_14_full_map_active_day_discovery_plan_without_broad_search"
          : "exclude_from_primary_daily_league_active_scan"
    };
  });

  const leagueLikeRows = rolloverRows.filter((row) => row.activeDayDiscoveryRequired);
  const previousAdapterBatchRows = Array.isArray(previousAdapterBatchPlan?.batchRows)
    ? previousAdapterBatchPlan.batchRows
    : [];

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    timezone: args.timezone,
    job: "build-football-truth-active-day-rollover-full-map-plan-file",
    mode: "source_only_full_map_active_day_rollover_plan_no_fetch_no_broad_search_no_canonical_writes_no_production_writes",
    fullMapScan: true,
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
      fullMapActiveDayDiscoveryRequiredCount: leagueLikeRows.length,
      previousActiveDayUniverseCarryForwardCount: rolloverRows.filter((row) => row.previousActiveDayUniverseMember).length,
      suppressedOrExcludedFromPrimaryDailyScanCount: rolloverRows.filter((row) => !row.activeDayDiscoveryRequired).length,
      broadSearchAllowedNowCount: 0,
      fetchAllowedNowCount: 0,
      canonicalWriteEligibleNowCount: 0,
      sourceFetch: false,
      searchProviderUsed: false,
      canonicalWrites: 0,
      productionWrite: false,
      recommendedNextLane: "build_2026_06_14_full_map_active_day_discovery_universe_from_rollover_plan_no_broad_search"
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
      note: "Previous 2026-06-13 diagnostics are not today's truth; source jobs and adapter contracts are reusable for 2026-06-14."
    },
    guardrails: [
      "This planner scans the full internal competition map.",
      "This planner does not use broad/untrusted search.",
      "This planner does not fetch.",
      "This planner does not write canonical files.",
      "This planner does not write production files.",
      "Zero search results must not be treated as absence.",
      "2026-06-13 diagnostics are previous-day evidence only.",
      "2026-06-14 requires its own active-day discovery universe."
    ],
    rolloverRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    inventoryRowCount: output.summary.inventoryRowCount,
    rolloverRowCount: output.summary.rolloverRowCount,
    fullMapActiveDayDiscoveryRequiredCount: output.summary.fullMapActiveDayDiscoveryRequiredCount,
    previousActiveDayUniverseCarryForwardCount: output.summary.previousActiveDayUniverseCarryForwardCount,
    suppressedOrExcludedFromPrimaryDailyScanCount: output.summary.suppressedOrExcludedFromPrimaryDailyScanCount,
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
