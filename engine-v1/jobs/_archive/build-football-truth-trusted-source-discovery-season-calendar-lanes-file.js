#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_MATRIX =
  "data/football-truth/_diagnostics/full-map-source-authority-season-calendar-matrix-2026-06-14/full-map-source-authority-season-calendar-matrix-2026-06-14.json";

const LANE_ORDER = [
  "partial_trusted_source_extraction_validation_and_season_calendar_enrichment",
  "league_trusted_source_discovery_required",
  "cup_source_authority_round_final_calendar_required",
  "registry_or_competition_type_resolution_required",
  "suppressed_low_value_policy_review"
];

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    matrix: DEFAULT_MATRIX,
    output: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--matrix") args.matrix = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.output) {
    args.output = path.join(
      "data/football-truth/_diagnostics",
      `trusted-source-discovery-season-calendar-lanes-${args.date}`,
      `trusted-source-discovery-season-calendar-lanes-${args.date}.json`
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

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean).map(String))].sort();
}

function lanePriority(lane) {
  const index = LANE_ORDER.indexOf(lane);
  return index === -1 ? 999 : index + 1;
}

function deriveLane(row) {
  if (row.suppressedLowValue) {
    return {
      executionLane: "suppressed_low_value_policy_review",
      lanePriority: lanePriority("suppressed_low_value_policy_review"),
      laneClass: "policy_review",
      laneReason: "suppressed_low_value_row_not_inactive_truth",
      nextJobRecommendation: "review_suppressed_low_value_policy_no_fetch_no_canonical_write"
    };
  }

  if (row.cupLike || row.requiresSeparateCupActivityLane || row.nextRequiredLane === "cup_source_authority_round_final_and_calendar_lane_required") {
    return {
      executionLane: "cup_source_authority_round_final_calendar_required",
      lanePriority: lanePriority("cup_source_authority_round_final_calendar_required"),
      laneClass: "cup_calendar_round_final_source_authority",
      laneReason: "cup_requires_dedicated_source_authority_round_final_calendar_lane",
      nextJobRecommendation: "build_cup_source_authority_round_final_calendar_lane_no_search_no_fetch"
    };
  }

  if (
    row.requiresSeparateRegistryOrCompetitionTypeResolutionLane ||
    row.nextRequiredLane === "registry_or_competition_type_resolution_lane_required"
  ) {
    return {
      executionLane: "registry_or_competition_type_resolution_required",
      lanePriority: lanePriority("registry_or_competition_type_resolution_required"),
      laneClass: "registry_type_resolution",
      laneReason: "competition_type_or_registry_gap_must_be_resolved_before_activity_truth",
      nextJobRecommendation: "build_registry_competition_type_resolution_lane_no_search_no_fetch"
    };
  }

  if (row.sourceAuthorityStatus === "partial_trusted_source_present") {
    return {
      executionLane: "partial_trusted_source_extraction_validation_and_season_calendar_enrichment",
      lanePriority: lanePriority("partial_trusted_source_extraction_validation_and_season_calendar_enrichment"),
      laneClass: "trusted_source_validation_and_calendar_enrichment",
      laneReason: "partial_trusted_source_exists_but_full_contract_missing",
      nextJobRecommendation: "build_partial_trusted_source_extraction_standings_season_restart_enrichment_plan_no_canonical_write"
    };
  }

  if (row.leagueLike) {
    return {
      executionLane: "league_trusted_source_discovery_required",
      lanePriority: lanePriority("league_trusted_source_discovery_required"),
      laneClass: "league_source_discovery",
      laneReason: "league_requires_trusted_source_before_activity_or_inactive_truth",
      nextJobRecommendation: "build_league_trusted_source_discovery_targets_no_truth_no_canonical_write"
    };
  }

  return {
    executionLane: "registry_or_competition_type_resolution_required",
    lanePriority: lanePriority("registry_or_competition_type_resolution_required"),
    laneClass: "fallback_registry_type_resolution",
    laneReason: "fallback_unclassified_row_requires_type_resolution",
    nextJobRecommendation: "build_registry_competition_type_resolution_lane_no_search_no_fetch"
  };
}

function buildLaneRow(row, index) {
  const lane = deriveLane(row);

  return {
    laneRowId: `source_calendar_lane_${String(index + 1).padStart(3, "0")}`,
    competitionSlug: row.competitionSlug,
    competitionName: row.competitionName || "",
    competitionType: row.competitionType,
    leagueLike: Boolean(row.leagueLike),
    cupLike: Boolean(row.cupLike),
    suppressedLowValue: Boolean(row.suppressedLowValue),
    providerHint: row.providerHint || "",
    sourceAuthorityStatus: row.sourceAuthorityStatus,
    fixtureCalendarStatus: row.fixtureCalendarStatus,
    standingsResultsStatus: row.standingsResultsStatus,
    seasonStateStatus: row.seasonStateStatus,
    nextSeasonRestartDateStatus: row.nextSeasonRestartDateStatus,
    nextCheckPolicyStatus: row.nextCheckPolicyStatus,
    trustedFixtureSource: Boolean(row.trustedFixtureSource),
    adapterCandidate: Boolean(row.adapterCandidate),
    trustedFetchRowCount: Number(row.trustedFetchRowCount || 0),
    adapterReviewInputRowCount: Number(row.adapterReviewInputRowCount || 0),
    lowRiskAdapterCandidateRowCount: Number(row.lowRiskAdapterCandidateRowCount || 0),
    fullContractSatisfied: Boolean(row.fullContractSatisfied),
    fullContractMissingReasons: row.fullContractMissingReasons || [],
    originalNextRequiredLane: row.nextRequiredLane,
    rolloverLane: row.rolloverLane,
    ...lane,
    trustedSourceDiscoveryAllowedNow: false,
    extractionAllowedNow: false,
    fetchAllowedNow: false,
    searchAllowedNow: false,
    canonicalWriteEligibleNow: false,
    productionWrite: false,
    activeAsserted: false,
    inactiveAsserted: false,
    completedAsserted: false
  };
}

function buildLaneSummaries(laneRows) {
  const summaries = {};

  for (const lane of LANE_ORDER) {
    const rows = laneRows.filter((row) => row.executionLane === lane);
    summaries[lane] = {
      executionLane: lane,
      rowCount: rows.length,
      leagueCount: rows.filter((row) => row.leagueLike).length,
      cupCount: rows.filter((row) => row.cupLike).length,
      partialTrustedSourceCount: rows.filter((row) => row.sourceAuthorityStatus === "partial_trusted_source_present").length,
      missingOrUntrustedSourceCount: rows.filter((row) => row.sourceAuthorityStatus === "source_missing_or_untrusted_requires_discovery").length,
      sourceUnknownRequiresReviewCount: rows.filter((row) => row.sourceAuthorityStatus === "source_unknown_requires_review").length,
      competitions: uniqueSorted(rows.map((row) => row.competitionSlug)),
      nextJobRecommendation: rows[0]?.nextJobRecommendation || "no_rows_for_lane",
      fetchAllowedNow: false,
      searchAllowedNow: false,
      canonicalWriteEligibleNow: false
    };
  }

  return summaries;
}

function main() {
  const args = parseArgs(process.argv);
  const matrix = readJson(args.matrix);
  const matrixRows = Array.isArray(matrix.matrixRows) ? matrix.matrixRows : [];

  const laneRows = matrixRows
    .map(buildLaneRow)
    .sort((a, b) => {
      if (a.lanePriority !== b.lanePriority) return a.lanePriority - b.lanePriority;
      return `${a.competitionSlug}:${a.executionLane}`.localeCompare(`${b.competitionSlug}:${b.executionLane}`);
    })
    .map((row, index) => ({
      ...row,
      laneRowId: `source_calendar_lane_${String(index + 1).padStart(3, "0")}`,
      laneSequence: index + 1
    }));

  const laneSummaries = buildLaneSummaries(laneRows);

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-trusted-source-discovery-season-calendar-lanes-file",
    mode: "source_only_trusted_source_discovery_and_season_calendar_lanes_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      matrix: args.matrix,
      matrixRowCount: matrixRows.length
    },
    summary: {
      laneRowCount: laneRows.length,
      partialTrustedSourceLaneCount: laneRows.filter((row) => row.executionLane === "partial_trusted_source_extraction_validation_and_season_calendar_enrichment").length,
      leagueTrustedSourceDiscoveryLaneCount: laneRows.filter((row) => row.executionLane === "league_trusted_source_discovery_required").length,
      cupSourceAuthorityLaneCount: laneRows.filter((row) => row.executionLane === "cup_source_authority_round_final_calendar_required").length,
      registryOrCompetitionTypeResolutionLaneCount: laneRows.filter((row) => row.executionLane === "registry_or_competition_type_resolution_required").length,
      suppressedLowValuePolicyReviewLaneCount: laneRows.filter((row) => row.executionLane === "suppressed_low_value_policy_review").length,
      fullContractSatisfiedCount: laneRows.filter((row) => row.fullContractSatisfied).length,
      activeAssertedCount: 0,
      inactiveAssertedCount: 0,
      completedAssertedCount: 0,
      trustedSourceDiscoveryAllowedNowCount: 0,
      extractionAllowedNowCount: 0,
      fetchAllowedNowCount: 0,
      searchAllowedNowCount: 0,
      canonicalWriteEligibleNowCount: 0,
      sourceFetch: false,
      searchProviderUsed: false,
      canonicalWrites: 0,
      productionWrite: false,
      recommendedNextLane: "build_partial_trusted_source_enrichment_plan_first_then_league_source_discovery_batches"
    },
    counts: {
      byExecutionLane: countBy(laneRows, "executionLane"),
      byLaneClass: countBy(laneRows, "laneClass"),
      bySourceAuthorityStatus: countBy(laneRows, "sourceAuthorityStatus"),
      byOriginalNextRequiredLane: countBy(laneRows, "originalNextRequiredLane")
    },
    laneSummaries,
    guardrails: [
      "This job only builds executable lanes from the matrix.",
      "This job does not discover sources yet.",
      "This job does not fetch.",
      "This job does not search.",
      "This job does not write canonical files.",
      "This job does not write production files.",
      "No row is active/inactive/completed truth in this output.",
      "Partial trusted source rows still require extraction validation, standings/results, season state, restart date, and nextCheck policy.",
      "Missing/untrusted source rows require controlled source discovery before activity or inactivity can be asserted."
    ],
    laneRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    laneRowCount: output.summary.laneRowCount,
    partialTrustedSourceLaneCount: output.summary.partialTrustedSourceLaneCount,
    leagueTrustedSourceDiscoveryLaneCount: output.summary.leagueTrustedSourceDiscoveryLaneCount,
    cupSourceAuthorityLaneCount: output.summary.cupSourceAuthorityLaneCount,
    registryOrCompetitionTypeResolutionLaneCount: output.summary.registryOrCompetitionTypeResolutionLaneCount,
    suppressedLowValuePolicyReviewLaneCount: output.summary.suppressedLowValuePolicyReviewLaneCount,
    fullContractSatisfiedCount: output.summary.fullContractSatisfiedCount,
    activeAssertedCount: 0,
    inactiveAssertedCount: 0,
    completedAssertedCount: 0,
    trustedSourceDiscoveryAllowedNowCount: 0,
    extractionAllowedNowCount: 0,
    fetchAllowedNowCount: 0,
    searchAllowedNowCount: 0,
    canonicalWriteEligibleNowCount: 0,
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    recommendedNextLane: output.summary.recommendedNextLane
  }, null, 2));
}

main();
