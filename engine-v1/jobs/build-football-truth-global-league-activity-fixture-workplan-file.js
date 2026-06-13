#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-13";

const DEFAULT_INVENTORY =
  "data/football-truth/_diagnostics/full-competition-map-inventory-2026-06-11/full-competition-map-inventory-2026-06-11.json";

const DEFAULT_LOOP =
  "data/football-truth/_diagnostics/autonomous-competition-resolution-loop-2026-06-13/autonomous-competition-resolution-loop-2026-06-13.json";

const OFFICIAL_PROVIDER_HINTS = [
  "official",
  "league",
  "federation",
  "association",
  "premierleague.com",
  "efl.com",
  "bundesliga",
  "laliga",
  "legaseriea",
  "legab",
  "eredivisie",
  "keukenkampioen",
  "proleague",
  "afa.com.ar",
  "dfb.de",
  "slgr.gr",
  "sfl.ch",
  "mlssoccer",
  "spl.com.sa",
  "cfa.com.cy",
  "lpf.ro",
  "ksi.is",
  "palloliitto",
  "spfl",
  "loi",
  "sportomedia",
  "torneopal"
];

const AGGREGATOR_HINTS = [
  "flashscore",
  "sofascore",
  "soccerway",
  "globalsportsarchive",
  "espn",
  "fbref",
  "livesport",
  "futbol24",
  "365scores",
  "aiscore",
  "footystats",
  "transfermarkt"
];

const NOISE_HINTS = [
  "porn",
  "xhamster",
  "xnxx",
  "xvideos",
  "reddit.com",
  "wikihow.com",
  "microsoft.com",
  "google.com",
  "facebook.com",
  "instagram.com",
  "youtube.com",
  "amazon.",
  "booking.com"
];

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    inventory: DEFAULT_INVENTORY,
    loop: DEFAULT_LOOP,
    output: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--inventory") args.inventory = argv[++i];
    else if (arg === "--loop") args.loop = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.output) {
    args.output = path.join(
      "data/football-truth/_diagnostics",
      `global-league-activity-fixture-workplan-${args.date}`,
      `global-league-activity-fixture-workplan-${args.date}.json`
    );
  }

  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing JSON input: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function stableJson(value) {
  return JSON.stringify(value, null, 2);
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
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

function hasAny(value, hints) {
  const text = normalize(value);
  return hints.some((hint) => text.includes(hint));
}

function classifyProviders(providers) {
  const rows = providers.map((provider) => {
    const p = normalize(provider);

    let providerClass = "other";
    if (!p) providerClass = "unknown";
    else if (hasAny(p, NOISE_HINTS)) providerClass = "noise";
    else if (hasAny(p, OFFICIAL_PROVIDER_HINTS)) providerClass = "official_like";
    else if (hasAny(p, AGGREGATOR_HINTS)) providerClass = "aggregator";

    return { provider, providerClass };
  });

  return {
    providerRows: rows,
    officialLikeProviderCount: rows.filter((row) => row.providerClass === "official_like").length,
    aggregatorProviderCount: rows.filter((row) => row.providerClass === "aggregator").length,
    noiseProviderCount: rows.filter((row) => row.providerClass === "noise").length,
    officialLikeProviders: rows.filter((row) => row.providerClass === "official_like").map((row) => row.provider).slice(0, 20),
    aggregatorProviders: rows.filter((row) => row.providerClass === "aggregator").map((row) => row.provider).slice(0, 20),
    noiseProviders: rows.filter((row) => row.providerClass === "noise").map((row) => row.provider).slice(0, 20)
  };
}

function rowText(row) {
  return normalize(JSON.stringify(row || {}));
}

function inferActivityLane(inventoryRow, loopRow, providerInfo) {
  const inventoryBucket = inventoryRow.inventoryBucket || "";
  const loopLane = loopRow?.lane || "";
  const loopStatus = loopRow?.status || "";

  const canonicalStandingRows = Number(loopRow?.canonicalStandingRows || 0);
  const canonicalFixtureRows = Number(loopRow?.canonicalFixtureRows || 0);

  const text = rowText(inventoryRow) + " " + rowText(loopRow);

  if (
    loopLane === "suppressed_low_value_no_active_work" ||
    loopStatus === "suppressed" ||
    inventoryBucket === "suppressed_low_value_no_active_work"
  ) {
    return {
      activityLane: "suppressed_low_value_activity_not_prioritized",
      activityStatus: "suppressed",
      activityPriority: 999,
      nextActivityAction: "do_not_prioritize_activity_or_fixture_work_until_policy_changes"
    };
  }

  if (
    inventoryBucket === "current_intelligence_overlay_available" ||
    text.includes("active_current_season") ||
    text.includes("current_season") ||
    text.includes("active")
  ) {
    return {
      activityLane: "current_or_active_overlay_review",
      activityStatus: "needs_current_activity_confirmation",
      activityPriority: 10,
      nextActivityAction: "validate_current_overlay_with_recent_fixture_or_result_evidence"
    };
  }

  if (canonicalFixtureRows > 0) {
    return {
      activityLane: "fixture_rows_present_needs_freshness_gate",
      activityStatus: "needs_fixture_freshness_validation",
      activityPriority: 20,
      nextActivityAction: "validate_fixture_dates_against_current_date_and_source_context"
    };
  }

  if (canonicalStandingRows > 0) {
    return {
      activityLane: "standings_present_activity_unknown",
      activityStatus: "needs_activity_evidence",
      activityPriority: 30,
      nextActivityAction: "derive_activity_from official fixtures/results or season metadata"
    };
  }

  if (loopLane === "official_host_recovery_host_scoped_targets") {
    return {
      activityLane: "trusted_partial_host_activity_recovery",
      activityStatus: "actionable_source_scoped",
      activityPriority: 40,
      nextActivityAction: "build_host_scoped_activity_and_fixture_targets_from_trusted_partial_host"
    };
  }

  if (providerInfo.officialLikeProviderCount > 0) {
    return {
      activityLane: "official_like_provider_activity_needed",
      activityStatus: "needs_official_provider_activity_evidence",
      activityPriority: 50,
      nextActivityAction: "build_scoped_official_provider_activity_fixture_fetch_input"
    };
  }

  if (providerInfo.aggregatorProviderCount > 0 && providerInfo.noiseProviderCount === 0) {
    return {
      activityLane: "aggregator_pointer_activity_needed",
      activityStatus: "needs_independent_or_official_confirmation",
      activityPriority: 70,
      nextActivityAction: "use_aggregator_only_as_pointer_not_truth"
    };
  }

  if (loopLane === "blocked_provider_discovery_untrusted_search" || loopStatus === "blocked") {
    return {
      activityLane: "blocked_untrusted_discovery_activity_unknown",
      activityStatus: "blocked",
      activityPriority: 90,
      nextActivityAction: "do_not_use_broad_search_zero_results_as_absence_build_better_source_index"
    };
  }

  return {
    activityLane: "activity_unknown_needs_source_strategy",
    activityStatus: "blocked_or_waiting",
    activityPriority: 95,
    nextActivityAction: "needs_official_source_or_provider_strategy_before_activity_truth"
  };
}

function inferFixtureLane(inventoryRow, loopRow, providerInfo) {
  const canonicalFixtureRows = Number(loopRow?.canonicalFixtureRows || 0);
  const canonicalStandingRows = Number(loopRow?.canonicalStandingRows || 0);
  const loopLane = loopRow?.lane || "";
  const loopStatus = loopRow?.status || "";
  const inventoryBucket = inventoryRow.inventoryBucket || "";

  if (
    loopLane === "suppressed_low_value_no_active_work" ||
    loopStatus === "suppressed" ||
    inventoryBucket === "suppressed_low_value_no_active_work"
  ) {
    return {
      fixtureLane: "suppressed_low_value_fixture_not_prioritized",
      fixtureStatus: "suppressed",
      fixturePriority: 999,
      nextFixtureAction: "do_not_prioritize_fixture_work_until_policy_changes"
    };
  }

  if (canonicalFixtureRows > 0) {
    return {
      fixtureLane: "fixture_rows_present_needs_current_window_validation",
      fixtureStatus: "needs_freshness_gate",
      fixturePriority: 10,
      nextFixtureAction: "validate_fixture_rows_dates_source_url_and_current_window"
    };
  }

  if (loopLane === "official_host_recovery_host_scoped_targets") {
    return {
      fixtureLane: "trusted_partial_host_fixture_targets_needed",
      fixtureStatus: "actionable_source_scoped",
      fixturePriority: 20,
      nextFixtureAction: "build_host_scoped_fixture_fetch_candidates_from_trusted_partial_host"
    };
  }

  if (providerInfo.officialLikeProviderCount > 0) {
    return {
      fixtureLane: "official_provider_fixture_fetch_input_needed",
      fixtureStatus: "needs_scoped_official_fetch_input",
      fixturePriority: 30,
      nextFixtureAction: "build_official_provider_fixture_fetch_input_without_broad_search"
    };
  }

  if (canonicalStandingRows > 0) {
    return {
      fixtureLane: "standings_present_but_fixture_source_missing",
      fixtureStatus: "needs_fixture_source",
      fixturePriority: 50,
      nextFixtureAction: "find_fixture_endpoint_or_official_schedule_source_for_same_provider"
    };
  }

  if (providerInfo.aggregatorProviderCount > 0) {
    return {
      fixtureLane: "aggregator_fixture_pointer_only",
      fixtureStatus: "needs_official_confirmation",
      fixturePriority: 70,
      nextFixtureAction: "do_not_promote_aggregator_fixtures_without_official_or_independent_confirmation"
    };
  }

  return {
    fixtureLane: "fixture_source_unknown",
    fixtureStatus: "blocked_or_waiting",
    fixturePriority: 95,
    nextFixtureAction: "needs_provider_discovery_or_source_index_recovery"
  };
}

function main() {
  const args = parseArgs(process.argv);

  const inventory = readJson(args.inventory);
  const loop = readJson(args.loop);

  if (!Array.isArray(inventory.rows)) throw new Error("Expected inventory.rows array.");
  if (!Array.isArray(loop.resolutionRows)) throw new Error("Expected loop.resolutionRows array.");

  const loopBySlug = new Map(loop.resolutionRows.map((row) => [row.competitionSlug, row]));

  const leagueRows = inventory.rows.filter((row) => row.competitionType === "league");

  const workRows = leagueRows.map((inventoryRow) => {
    const loopRow = loopBySlug.get(inventoryRow.competitionSlug) || {};
    const providers = Array.isArray(inventoryRow.providers) ? inventoryRow.providers : [];
    const providerInfo = classifyProviders(providers);

    const activity = inferActivityLane(inventoryRow, loopRow, providerInfo);
    const fixture = inferFixtureLane(inventoryRow, loopRow, providerInfo);

    return {
      competitionSlug: inventoryRow.competitionSlug,
      countryKey: inventoryRow.countryKey || String(inventoryRow.competitionSlug || "").split(".")[0],
      competitionType: inventoryRow.competitionType,
      inventoryBucket: inventoryRow.inventoryBucket || "",
      loopLane: loopRow.lane || "",
      loopStatus: loopRow.status || "",
      canonicalStandingRows: Number(loopRow.canonicalStandingRows || 0),
      canonicalFixtureRows: Number(loopRow.canonicalFixtureRows || 0),
      standingSignals: Number(loopRow.standingSignals || 0),
      fixtureSignals: Number(loopRow.fixtureSignals || 0),
      providerCount: providers.length,
      officialLikeProviderCount: providerInfo.officialLikeProviderCount,
      aggregatorProviderCount: providerInfo.aggregatorProviderCount,
      noiseProviderCount: providerInfo.noiseProviderCount,
      officialLikeProviders: providerInfo.officialLikeProviders,
      aggregatorProviders: providerInfo.aggregatorProviders,
      noiseProviders: providerInfo.noiseProviders,
      activityLane: activity.activityLane,
      activityStatus: activity.activityStatus,
      activityPriority: activity.activityPriority,
      nextActivityAction: activity.nextActivityAction,
      fixtureLane: fixture.fixtureLane,
      fixtureStatus: fixture.fixtureStatus,
      fixturePriority: fixture.fixturePriority,
      nextFixtureAction: fixture.nextFixtureAction,
      activeTruthKnownNow: false,
      fixtureTruthKnownNow: false,
      canonicalWriteEligibleNow: false,
      sourceFetch: false,
      searchProviderUsed: false
    };
  }).sort((a, b) => {
    const aPriority = Math.min(a.activityPriority, a.fixturePriority);
    const bPriority = Math.min(b.activityPriority, b.fixturePriority);
    if (aPriority !== bPriority) return aPriority - bPriority;
    return a.competitionSlug.localeCompare(b.competitionSlug);
  });

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-global-league-activity-fixture-workplan-file",
    mode: "source_only_all_leagues_activity_fixture_workplan_no_search_no_fetch_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      inventory: args.inventory,
      loop: args.loop
    },
    summary: {
      inventoryLeagueCount: leagueRows.length,
      workRowCount: workRows.length,
      activityKnownNowCount: 0,
      fixtureTruthKnownNowCount: 0,
      fixtureRowsPresentCount: workRows.filter((row) => row.canonicalFixtureRows > 0).length,
      standingsRowsPresentCount: workRows.filter((row) => row.canonicalStandingRows > 0).length,
      officialLikeProviderAvailableCount: workRows.filter((row) => row.officialLikeProviderCount > 0).length,
      blockedOrWaitingActivityCount: workRows.filter((row) => row.activityStatus === "blocked" || row.activityStatus === "blocked_or_waiting").length,
      canonicalWriteEligibleNowCount: 0,
      sourceFetch: false,
      searchProviderUsed: false,
      canonicalWrites: 0,
      productionWrite: false,
      recommendedNextLane: "build_scoped_activity_fixture_fetch_input_for_all_official_like_provider_leagues_then_require_explicit_fetch_approval"
    },
    counts: {
      byActivityLane: countBy(workRows, "activityLane"),
      byActivityStatus: countBy(workRows, "activityStatus"),
      byFixtureLane: countBy(workRows, "fixtureLane"),
      byFixtureStatus: countBy(workRows, "fixtureStatus"),
      byInventoryBucket: countBy(workRows, "inventoryBucket"),
      byLoopLane: countBy(workRows, "loopLane")
    },
    guardrails: [
      "This is the full-league activity and fixture workplan.",
      "It covers all league rows from the full inventory.",
      "It does not decide active truth without recent fixture/result/season evidence.",
      "It does not fetch or search.",
      "Fixture correctness requires official/scoped provider evidence plus freshness validation.",
      "canonicalWriteEligibleNow remains false for every row."
    ],
    workRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    inventoryLeagueCount: output.summary.inventoryLeagueCount,
    workRowCount: output.summary.workRowCount,
    fixtureRowsPresentCount: output.summary.fixtureRowsPresentCount,
    standingsRowsPresentCount: output.summary.standingsRowsPresentCount,
    officialLikeProviderAvailableCount: output.summary.officialLikeProviderAvailableCount,
    blockedOrWaitingActivityCount: output.summary.blockedOrWaitingActivityCount,
    canonicalWriteEligibleNowCount: output.summary.canonicalWriteEligibleNowCount,
    recommendedNextLane: output.summary.recommendedNextLane,
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
}

main();

