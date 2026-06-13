#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-13";
const DEFAULT_TIMEZONE = "Europe/Athens";

const DEFAULT_WORKPLAN =
  "data/football-truth/_diagnostics/global-league-activity-fixture-workplan-2026-06-13/global-league-activity-fixture-workplan-2026-06-13.json";

const DEFAULT_FRESHNESS =
  "data/football-truth/_diagnostics/global-fixture-freshness-validator-2026-06-13/global-fixture-freshness-validator-2026-06-13.json";

const DEFAULT_ORACLE =
  "data/football-truth/_diagnostics/athens-local-active-today-oracle-2026-06-13/athens-local-active-today-oracle-2026-06-13.json";

const DEFAULT_INVENTORY =
  "data/football-truth/_diagnostics/full-competition-map-inventory-2026-06-11/full-competition-map-inventory-2026-06-11.json";

const DEFAULT_PROVIDER_EVIDENCE =
  "data/football-truth/_diagnostics/standing-provider-evidence-link-board-2026-06-13/standing-provider-evidence-link-board-2026-06-13.json";

const DEFAULT_PROVIDER_LINKING =
  "data/football-truth/_diagnostics/standing-provider-snapshot-linking-plan-2026-06-13/standing-provider-snapshot-linking-plan-2026-06-13.json";

const WORLD_CUP_GLOBAL_LANE_ROW = {
  competitionSlug: "world.cup",
  competitionName: "FIFA World Cup",
  competitionType: "global",
  sourceLane: "global_competition_active_today_required",
  refreshReason: "athens_oracle_expected_active_today_global_competition_missing_from_domestic_league_workplan",
  requiredBehavior: "include global/continental competitions in active-today fixture refresh, not only domestic leagues",
  providerHints: ["fifa.com", "inside.fifa.com"]
};


const CURATED_PROVIDER_HINTS_BY_SLUG = {
  "world.cup": [
    { providerHint: "fifa.com", evidenceType: "curated_global_competition_provider_hint" },
    { providerHint: "inside.fifa.com", evidenceType: "curated_global_competition_provider_hint" }
  ],
  "chi.1": [
    { providerHint: "anfp.cl", evidenceType: "curated_oracle_official_provider_hint" },
    { providerHint: "campeonatochileno.cl", evidenceType: "curated_oracle_official_provider_hint" }
  ]
};

const TRUSTED_PROVIDER_EVIDENCE_TYPES = [
  "global_competition_static_provider_hint",
  "curated_global_competition_provider_hint",
  "curated_oracle_official_provider_hint",
  "standing_provider_evidence_expected_official_provider",
  "standing_provider_evidence_matched_expected_provider",
  "standing_provider_snapshot_linking_expected_official_provider",
  "workplan_current_provider_contract",
  "inventory_current_provider_contract"
];

const WEAK_PROVIDER_EVIDENCE_TYPES = [
  "workplan_official_like_provider",
  "standing_provider_evidence_accepted_hint"
];

function isTrustedProviderEvidenceType(evidenceType) {
  return TRUSTED_PROVIDER_EVIDENCE_TYPES.includes(evidenceType);
}

function isWeakProviderEvidenceType(evidenceType) {
  return WEAK_PROVIDER_EVIDENCE_TYPES.includes(evidenceType);
}

function trustedProviderHints(hints) {
  return hints.filter((row) => isTrustedProviderEvidenceType(row.evidenceType));
}

function weakProviderHints(hints) {
  return hints.filter((row) => isWeakProviderEvidenceType(row.evidenceType));
}

function providerHintTrust(providerHintEvidence) {
  if (trustedProviderHints(providerHintEvidence).length > 0) return "trusted_provider_hint";
  if (weakProviderHints(providerHintEvidence).length > 0) return "weak_provider_hint_needs_review";
  return "provider_hint_missing";
}
const NOISE_PROVIDER_HINTS = new Set([
  "",
  "unknown",
  "bing_html",
  "duckduckgo_html",
  "official_league",
  "official_route_probe_fetch",
  "autonomous_official_route_search",
  "fpf",
  "youtube.com",
  "wikihow.com",
  "en.wikipedia.org",
  "de.wikipedia.org",
  "cs.wikipedia.org",
  "sv.wikipedia.org",
  "zhihu.com",
  "britannica.com",
  "www.britannica.com",
  "countryreports.org",
  "worldatlas.com",
  "theworldfactbook.org"
]);

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    timezone: DEFAULT_TIMEZONE,
    workplan: DEFAULT_WORKPLAN,
    freshness: DEFAULT_FRESHNESS,
    oracle: DEFAULT_ORACLE,
    inventory: DEFAULT_INVENTORY,
    providerEvidence: DEFAULT_PROVIDER_EVIDENCE,
    providerLinking: DEFAULT_PROVIDER_LINKING,
    output: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--timezone") args.timezone = argv[++i];
    else if (arg === "--workplan") args.workplan = argv[++i];
    else if (arg === "--freshness") args.freshness = argv[++i];
    else if (arg === "--oracle") args.oracle = argv[++i];
    else if (arg === "--inventory") args.inventory = argv[++i];
    else if (arg === "--provider-evidence") args.providerEvidence = argv[++i];
    else if (arg === "--provider-linking") args.providerLinking = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.output) {
    args.output = path.join(
      "data/football-truth/_diagnostics",
      `scoped-active-today-fixture-refresh-input-${args.date}`,
      `scoped-active-today-fixture-refresh-input-${args.date}.json`
    );
  }

  return args;
}

function readJson(filePath, { optional = false } = {}) {
  if (!fs.existsSync(filePath)) {
    if (optional) return null;
    throw new Error(`Missing JSON input: ${filePath}`);
  }
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

function indexBySlug(rows) {
  const map = new Map();
  for (const row of rows || []) {
    if (row?.competitionSlug) map.set(row.competitionSlug, row);
  }
  return map;
}

function normalizeHint(value) {
  return String(value || "").trim();
}

function isUsefulProviderHint(value) {
  const hint = normalizeHint(value);
  if (!hint) return false;

  const lower = hint.toLowerCase();
  if (NOISE_PROVIDER_HINTS.has(lower)) return false;
  if (lower.includes("wikipedia")) return false;
  if (lower.includes("wikihow")) return false;
  if (lower.includes("britannica")) return false;
  if (lower.includes("countryreports")) return false;
  if (lower.includes("worldatlas")) return false;
  if (lower.includes("microsoft.com")) return false;
  if (lower.includes("support.google.com")) return false;
  if (lower.includes("accounts.google.com")) return false;
  if (lower.includes("account.microsoft.com")) return false;
  if (lower.includes("drive.google.com")) return false;
  if (lower.includes("calculator.com")) return false;
  if (lower.includes("amazon.")) return false;
  if (lower.includes("duolingo.com")) return false;
  if (lower.includes("blogger.com")) return false;
  if (lower.includes("baike.baidu.com")) return false;
  if (lower.includes("xnxx.com")) return false;
  if (lower.includes("ionos.com")) return false;
  if (lower.includes("leagueofgraphs.com")) return false;
  if (lower.includes("leagueoflegends.com")) return false;
  if (lower.includes("riotgames.com")) return false;
  if (lower.includes("liquipedia.net")) return false;

  return true;
}

function addHint(hints, value, evidenceType) {
  const hint = normalizeHint(value);
  if (!isUsefulProviderHint(hint)) return;

  if (!hints.some((row) => row.providerHint.toLowerCase() === hint.toLowerCase())) {
    hints.push({
      providerHint: hint,
      evidenceType
    });
  }
}

function addHintArray(hints, values, evidenceType) {
  if (!Array.isArray(values)) return;
  for (const value of values) addHint(hints, value, evidenceType);
}

function providerHintsForSlug({
  slug,
  workplanRow,
  inventoryRow,
  providerEvidenceRow,
  providerLinkingRow,
  oracleRow
}) {
  const hints = [];

  if (slug === "world.cup") {
    for (const hint of WORLD_CUP_GLOBAL_LANE_ROW.providerHints) {
      addHint(hints, hint, "global_competition_static_provider_hint");
    }
  }

  addHintArray(hints, providerEvidenceRow?.expectedOfficialProviders, "standing_provider_evidence_expected_official_provider");
  addHintArray(hints, providerEvidenceRow?.matchedExpectedProviders, "standing_provider_evidence_matched_expected_provider");
  addHintArray(hints, providerEvidenceRow?.acceptedProviderHints, "standing_provider_evidence_accepted_hint");

  addHintArray(hints, providerLinkingRow?.expectedOfficialProviders, "standing_provider_snapshot_linking_expected_official_provider");

  addHintArray(hints, workplanRow?.officialLikeProviders, "workplan_official_like_provider");
  addHint(hints, workplanRow?.currentProviderContract?.providerId, "workplan_current_provider_contract");

  for (const curated of CURATED_PROVIDER_HINTS_BY_SLUG[slug] || []) {
    addHint(hints, curated.providerHint, curated.evidenceType);
  }

  addHint(hints, inventoryRow?.currentProviderContract?.providerId, "inventory_current_provider_contract");

  addHint( hints, oracleRow?.providerHint, "oracle_provider_hint");

  return hints;
}

function bestProviderHint(hints) {
  if (!hints.length) return "";

  const preferred = [
    "current_provider_contract",
    "expected_official_provider",
    "matched_expected_provider",
    "workplan_official_like_provider",
    "inventory_current_provider_contract",
    "inventory_provider",
    "global_competition_static_provider_hint"
  ];

  for (const needle of preferred) {
    const found = hints.find((row) => row.evidenceType.includes(needle));
    if (found) return found.providerHint;
  }

  return hints[0].providerHint;
}

function classifyRefreshClass({ oracleRow, freshnessRow, workplanRow, isWorldCup }) {
  if (isWorldCup) {
    return {
      refreshClass: "global_competition_active_today_oracle_gap",
      priority: 1,
      refreshReason: "world_cup_expected_active_today_but_missing_from_domestic_league_workplan",
      requiredLane: "global_competition_fixture_refresh_input"
    };
  }

  if (oracleRow && !oracleRow.programCurrentlyPassesOracle) {
    if (oracleRow.gapReason === "stale_fixture_window") {
      return {
        refreshClass: "athens_oracle_expected_active_today_stale_fixture_window",
        priority: 2,
        refreshReason: "expected_active_today_but_current_fixture_rows_are_stale",
        requiredLane: "scoped_current_date_fixture_refresh"
      };
    }

    if (oracleRow.gapReason === "fixture_count_source_mismatch_or_current_fixture_file_gap") {
      return {
        refreshClass: "athens_oracle_expected_active_today_current_fixture_file_gap",
        priority: 2,
        refreshReason: "expected_active_today_but_current_fixtures_json_has_no_rows",
        requiredLane: "resolve_fixture_count_mismatch_then_scoped_current_date_fixture_refresh"
      };
    }

    return {
      refreshClass: "athens_oracle_expected_active_today_gap",
      priority: 2,
      refreshReason: oracleRow.gapReason || "expected_active_today_gap",
      requiredLane: "scoped_current_date_fixture_refresh"
    };
  }

  if (freshnessRow?.freshnessStatus === "dated_fixtures_but_no_current_window") {
    return {
      refreshClass: "stale_fixture_window",
      priority: 20,
      refreshReason: "current_canonical_fixture_rows_exist_but_no_athens_current_window",
      requiredLane: "scoped_current_date_fixture_refresh_or_season_metadata"
    };
  }

  if (freshnessRow?.freshnessStatus === "no_observed_fixture_rows_in_current_fixtures_file") {
    return {
      refreshClass: "fixture_count_signal_but_current_file_gap",
      priority: 30,
      refreshReason: "diagnostic_or_workplan_fixture_count_signal_but_no_rows_in_current_fixtures_json",
      requiredLane: "fixture_count_source_mismatch_resolution_then_refresh"
    };
  }

  if (workplanRow?.fixtureLane === "official_provider_fixture_fetch_input_needed") {
    return {
      refreshClass: "official_provider_fixture_input_needed",
      priority: 40,
      refreshReason: "official_like_provider_available_but_current_fixture_refresh_input_not_built",
      requiredLane: "official_provider_fixture_refresh_input"
    };
  }

  if (workplanRow?.fixtureLane === "trusted_partial_host_fixture_targets_needed") {
    return {
      refreshClass: "trusted_partial_host_fixture_target_needed",
      priority: 50,
      refreshReason: "trusted_partial_host_recovery_needed_for_current_fixtures",
      requiredLane: "host_scoped_fixture_recovery_input"
    };
  }

  return {
    refreshClass: "unclassified_refresh_candidate",
    priority: 90,
    refreshReason: "requires_review_before_refresh_input",
    requiredLane: "manual_review"
  };
}

function shouldIncludeWorkplanRow(row) {
  return [
    "official_provider_fixture_fetch_input_needed",
    "trusted_partial_host_fixture_targets_needed"
  ].includes(row?.fixtureLane);
}

function shouldIncludeFreshnessRow(row) {
  return [
    "dated_fixtures_but_no_current_window",
    "no_observed_fixture_rows_in_current_fixtures_file"
  ].includes(row?.freshnessStatus);
}

function main() {
  const args = parseArgs(process.argv);

  if (args.timezone !== "Europe/Athens") {
    throw new Error("This refresh input is intentionally scoped to Europe/Athens local date.");
  }

  const workplan = readJson(args.workplan);
  const freshness = readJson(args.freshness);
  const oracle = readJson(args.oracle);
  const inventory = readJson(args.inventory);
  const providerEvidence = readJson(args.providerEvidence, { optional: true }) || { evidenceRows: [] };
  const providerLinking = readJson(args.providerLinking, { optional: true }) || { linkRows: [] };

  const workRows = Array.isArray(workplan.workRows) ? workplan.workRows : [];
  const freshnessRows = Array.isArray(freshness.validationRows) ? freshness.validationRows : [];
  const oracleRows = Array.isArray(oracle.oracleRows) ? oracle.oracleRows : [];
  const inventoryRows = Array.isArray(inventory.rows) ? inventory.rows : [];
  const providerEvidenceRows = Array.isArray(providerEvidence.evidenceRows) ? providerEvidence.evidenceRows : [];
  const providerLinkingRows = Array.isArray(providerLinking.linkRows) ? providerLinking.linkRows : [];

  const workBySlug = indexBySlug(workRows);
  const freshnessBySlug = indexBySlug(freshnessRows);
  const oracleBySlug = indexBySlug(oracleRows);
  const inventoryBySlug = indexBySlug(inventoryRows);
  const providerEvidenceBySlug = indexBySlug(providerEvidenceRows);
  const providerLinkingBySlug = indexBySlug(providerLinkingRows);

  const targetSlugs = new Set();

  for (const row of oracleRows) targetSlugs.add(row.competitionSlug);
  for (const row of freshnessRows.filter(shouldIncludeFreshnessRow)) targetSlugs.add(row.competitionSlug);
  for (const row of workRows.filter(shouldIncludeWorkplanRow)) targetSlugs.add(row.competitionSlug);

  const refreshRows = Array.from(targetSlugs).map((competitionSlug) => {
    const oracleRow = oracleBySlug.get(competitionSlug) || null;
    const freshnessRow = freshnessBySlug.get(competitionSlug) || null;
    const workplanRow = workBySlug.get(competitionSlug) || null;
    const inventoryRow = inventoryBySlug.get(competitionSlug) || null;
    const providerEvidenceRow = providerEvidenceBySlug.get(competitionSlug) || null;
    const providerLinkingRow = providerLinkingBySlug.get(competitionSlug) || null;
    const isWorldCup = competitionSlug === "world.cup";

    const cls = classifyRefreshClass({ oracleRow, freshnessRow, workplanRow, isWorldCup });

    const providerHintEvidence = providerHintsForSlug({
      slug: competitionSlug,
      workplanRow,
      inventoryRow,
      providerEvidenceRow,
      providerLinkingRow,
      oracleRow
    });

    const trust = providerHintTrust(providerHintEvidence);
    const trustedHints = trustedProviderHints(providerHintEvidence);
    const weakHints = weakProviderHints(providerHintEvidence);
    const providerHint = bestProviderHint(trustedHints.length ? trustedHints : weakHints);

    const competitionName =
      oracleRow?.competitionName ||
      workplanRow?.competitionName ||
      workplanRow?.leagueName ||
      inventoryRow?.competitionName ||
      inventoryRow?.leagueName ||
      freshnessRow?.competitionName ||
      (isWorldCup ? WORLD_CUP_GLOBAL_LANE_ROW.competitionName : "");

    return {
      competitionSlug,
      competitionName,
      date: args.date,
      timezone: args.timezone,
      localDayRule: "Europe/Athens local date of fixture kickoff must equal 2026-06-13",
      localDayWindow: {
        localStartInclusive: "2026-06-13T00:00:00+03:00",
        localEndExclusive: "2026-06-14T00:00:00+03:00",
        utcStartInclusive: "2026-06-12T21:00:00Z",
        utcEndExclusive: "2026-06-13T21:00:00Z"
      },
      refreshClass: cls.refreshClass,
      priority: cls.priority,
      refreshReason: cls.refreshReason,
      requiredLane: cls.requiredLane,
      providerHint,
      providerHintEvidence,
      providerHintTrust: trust,
      sourceInputStatus:
        trust === "trusted_provider_hint"
          ? "trusted_provider_hint_present_needs_scoped_refresh_builder"
          : trust === "weak_provider_hint_needs_review"
            ? "weak_provider_hint_present_needs_source_review_before_fetch"
            : "provider_hint_missing_needs_source_resolution",
      presentInAthensOracle: Boolean(oracleRow),
      oracleExpectedActiveToday: Boolean(oracleRow),
      oracleProgramCurrentlyPasses: Boolean(oracleRow?.programCurrentlyPassesOracle),
      oracleGapReason: oracleRow?.gapReason || "",
      presentInWorkplan: Boolean(workplanRow),
      workplanActivityLane: workplanRow?.activityLane || "",
      workplanFixtureLane: workplanRow?.fixtureLane || "",
      workplanCanonicalFixtureRows: Number(workplanRow?.canonicalFixtureRows || 0),
      presentInFreshnessValidator: Boolean(freshnessRow),
      freshnessStatus: freshnessRow?.freshnessStatus || "",
      freshnessObservedFixtureRows: Number(freshnessRow?.observedFixtureRows || 0),
      freshnessFirstFixtureDate: freshnessRow?.firstFixtureDate || "",
      freshnessLastFixtureDate: freshnessRow?.lastFixtureDate || "",
      fetchAllowedNow: false,
      searchAllowedNow: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false,
      nextAction:
        cls.refreshClass === "global_competition_active_today_oracle_gap"
          ? "add_global_competition_fixture_refresh_lane_before_fetch"
          : trust === "trusted_provider_hint"
            ? "build_fetch_input_from_trusted_scoped_provider_hint_then_require_explicit_fetch_approval"
            : trust === "weak_provider_hint_needs_review"
              ? "review_weak_provider_hint_before_fetch_input"
              : "resolve_provider_hint_or_official_source_before_fetch"
    };
  }).sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.competitionSlug.localeCompare(b.competitionSlug);
  });

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    timezone: args.timezone,
    job: "build-football-truth-scoped-active-today-fixture-refresh-input-file",
    mode: "source_only_full_map_active_today_discovery_universe_with_athens_oracle_acceptance_sample_no_search_no_fetch_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      workplan: args.workplan,
      freshness: args.freshness,
      oracle: args.oracle,
      inventory: args.inventory,
      providerEvidence: args.providerEvidence,
      providerLinking: args.providerLinking,
      workplanRowCount: workRows.length,
      freshnessValidationRowCount: freshnessRows.length,
      oracleRowCount: oracleRows.length,
      inventoryRowCount: inventoryRows.length,
      providerEvidenceRowCount: providerEvidenceRows.length,
      providerLinkingRowCount: providerLinkingRows.length
    },
    summary: {
      refreshRowCount: refreshRows.length,
      activeTodayDiscoveryUniverseRowCount: refreshRows.length,
      athensOracleExpectedRefreshCount: refreshRows.filter((row) => row.presentInAthensOracle).length,
      athensOracleRowsAreAcceptanceSampleOnly: true,
      activeTodayDiscoveryMustUseFullRefreshUniverse: true,
      globalCompetitionRefreshCount: refreshRows.filter((row) => row.refreshClass === "global_competition_active_today_oracle_gap").length,
      staleFixtureWindowRefreshCount: refreshRows.filter((row) => row.refreshClass === "stale_fixture_window" || row.refreshClass === "athens_oracle_expected_active_today_stale_fixture_window").length,
      fixtureCountCurrentFileGapRefreshCount: refreshRows.filter((row) => row.refreshClass === "fixture_count_signal_but_current_file_gap" || row.refreshClass === "athens_oracle_expected_active_today_current_fixture_file_gap").length,
      officialProviderFixtureInputNeededCount: refreshRows.filter((row) => row.refreshClass === "official_provider_fixture_input_needed").length,
      trustedPartialHostFixtureTargetNeededCount: refreshRows.filter((row) => row.refreshClass === "trusted_partial_host_fixture_target_needed").length,
      providerHintPresentCount: refreshRows.filter((row) => row.providerHint).length,
      providerHintMissingCount: refreshRows.filter((row) => !row.providerHint).length,
      trustedProviderHintCount: refreshRows.filter((row) => row.providerHintTrust === "trusted_provider_hint").length,
      weakProviderHintNeedsReviewCount: refreshRows.filter((row) => row.providerHintTrust === "weak_provider_hint_needs_review").length,
      athensOracleProviderHintPresentCount: refreshRows.filter((row) => row.presentInAthensOracle && row.providerHint).length,
      athensOracleProviderHintMissingCount: refreshRows.filter((row) => row.presentInAthensOracle && !row.providerHint).length,
      athensOracleTrustedProviderHintCount: refreshRows.filter((row) => row.presentInAthensOracle && row.providerHintTrust === "trusted_provider_hint").length,
      athensOracleWeakProviderHintNeedsReviewCount: refreshRows.filter((row) => row.presentInAthensOracle && row.providerHintTrust === "weak_provider_hint_needs_review").length,
      fetchAllowedNowCount: 0,
      searchAllowedNowCount: 0,
      canonicalWriteEligibleNowCount: 0,
      sourceFetch: false,
      searchProviderUsed: false,
      canonicalWrites: 0,
      productionWrite: false,
      trustedProviderDiscoveryUniverseCount: refreshRows.filter((row) => row.providerHintTrust === "trusted_provider_hint").length,
      weakProviderDiscoveryUniverseNeedsReviewCount: refreshRows.filter((row) => row.providerHintTrust === "weak_provider_hint_needs_review").length,
      missingProviderDiscoveryUniverseNeedsSourceResolutionCount: refreshRows.filter((row) => row.providerHintTrust === "provider_hint_missing").length,
      recommendedNextLane: "build_scoped_fetch_input_from_trusted_provider_discovery_universe_not_only_oracle_rows_then_require_explicit_fetch_approval"
    },
    counts: {
      byRefreshClass: countBy(refreshRows, "refreshClass"),
      byRequiredLane: countBy(refreshRows, "requiredLane"),
      bySourceInputStatus: countBy(refreshRows, "sourceInputStatus"),
      byWorkplanFixtureLane: countBy(refreshRows, "workplanFixtureLane"),
      byFreshnessStatus: countBy(refreshRows, "freshnessStatus"),
      byProviderHintTrust: countBy(refreshRows, "providerHintTrust"),
      byProviderHint: countBy(refreshRows.filter((row) => row.providerHint), "providerHint")
    },
    guardrails: [
      "This file is refresh input planning only.",
      "The Athens oracle rows are an acceptance sample, not the complete set of active competitions today.",
      "The program must discover active-today competitions from the full refreshRows universe, not only from oracle rows.",
      "trusted_provider_hint rows are candidates for scoped fetch-input generation; weak and missing rows are not fetch-ready.",
      "It does not fetch, search, or write canonical data.",
      "Athens active-today means Europe/Athens local date equals 2026-06-13, not UTC date.",
      "World Cup/global competitions must be included in active-today refresh planning.",
      "Stale fixture windows and fixture-count gaps are not inactivity evidence.",
      "Provider hints are source-planning hints, not truth acceptance.",
      "Raw inventory providers are not accepted as trusted fetch targets unless promoted through a contract, expected-provider board, or curated oracle rule.",
      "Weak provider hints require review before any fetch input.",
      "Any future fetch requires explicit approval and a scoped fetch input generated from this board.",
      "canonicalWriteEligibleNow remains false for every row."
    ],
    refreshRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    refreshRowCount: output.summary.refreshRowCount,
    athensOracleExpectedRefreshCount: output.summary.athensOracleExpectedRefreshCount,
    globalCompetitionRefreshCount: output.summary.globalCompetitionRefreshCount,
    staleFixtureWindowRefreshCount: output.summary.staleFixtureWindowRefreshCount,
    fixtureCountCurrentFileGapRefreshCount: output.summary.fixtureCountCurrentFileGapRefreshCount,
    officialProviderFixtureInputNeededCount: output.summary.officialProviderFixtureInputNeededCount,
    trustedPartialHostFixtureTargetNeededCount: output.summary.trustedPartialHostFixtureTargetNeededCount,
    providerHintPresentCount: output.summary.providerHintPresentCount,
    providerHintMissingCount: output.summary.providerHintMissingCount,
    trustedProviderHintCount: output.summary.trustedProviderHintCount,
    weakProviderHintNeedsReviewCount: output.summary.weakProviderHintNeedsReviewCount,
    athensOracleProviderHintPresentCount: output.summary.athensOracleProviderHintPresentCount,
    athensOracleProviderHintMissingCount: output.summary.athensOracleProviderHintMissingCount,
    athensOracleTrustedProviderHintCount: output.summary.athensOracleTrustedProviderHintCount,
    athensOracleWeakProviderHintNeedsReviewCount: output.summary.athensOracleWeakProviderHintNeedsReviewCount,
    fetchAllowedNowCount: 0,
    searchAllowedNowCount: 0,
    canonicalWriteEligibleNowCount: 0,
    activeTodayDiscoveryUniverseRowCount: output.summary.activeTodayDiscoveryUniverseRowCount,
    athensOracleRowsAreAcceptanceSampleOnly: output.summary.athensOracleRowsAreAcceptanceSampleOnly,
    activeTodayDiscoveryMustUseFullRefreshUniverse: output.summary.activeTodayDiscoveryMustUseFullRefreshUniverse,
    trustedProviderDiscoveryUniverseCount: output.summary.trustedProviderDiscoveryUniverseCount,
    weakProviderDiscoveryUniverseNeedsReviewCount: output.summary.weakProviderDiscoveryUniverseNeedsReviewCount,
    missingProviderDiscoveryUniverseNeedsSourceResolutionCount: output.summary.missingProviderDiscoveryUniverseNeedsSourceResolutionCount,
    recommendedNextLane: output.summary.recommendedNextLane,
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
}

main();
