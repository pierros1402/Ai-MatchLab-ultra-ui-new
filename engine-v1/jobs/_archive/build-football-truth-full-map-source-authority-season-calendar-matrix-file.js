#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_FULL_MAP_INVENTORY =
  "data/football-truth/_diagnostics/full-competition-map-inventory-2026-06-11/full-competition-map-inventory-2026-06-11.json";

const DEFAULT_ROLLOVER_PLAN =
  "data/football-truth/_diagnostics/active-day-rollover-full-map-plan-2026-06-14/active-day-rollover-full-map-plan-2026-06-14.json";

const DEFAULT_TRUSTED_FETCH_INPUT =
  "data/football-truth/_diagnostics/scoped-active-today-trusted-fixture-fetch-input-2026-06-13/scoped-active-today-trusted-fixture-fetch-input-2026-06-13.json";

const DEFAULT_ADAPTER_INPUT =
  "data/football-truth/_diagnostics/scoped-active-today-adapter-extraction-review-input-2026-06-13/scoped-active-today-adapter-extraction-review-input-2026-06-13.json";

const DEFAULT_LOW_RISK_ADAPTER_REVIEW =
  "data/football-truth/_diagnostics/scoped-active-today-low-risk-adapter-extraction-review-batch-2026-06-13/scoped-active-today-low-risk-adapter-extraction-review-batch-2026-06-13.json";

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
    fullMapInventory: DEFAULT_FULL_MAP_INVENTORY,
    rolloverPlan: DEFAULT_ROLLOVER_PLAN,
    trustedFetchInput: DEFAULT_TRUSTED_FETCH_INPUT,
    adapterInput: DEFAULT_ADAPTER_INPUT,
    lowRiskAdapterReview: DEFAULT_LOW_RISK_ADAPTER_REVIEW,
    output: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--full-map-inventory") args.fullMapInventory = argv[++i];
    else if (arg === "--rollover-plan") args.rolloverPlan = argv[++i];
    else if (arg === "--trusted-fetch-input") args.trustedFetchInput = argv[++i];
    else if (arg === "--adapter-input") args.adapterInput = argv[++i];
    else if (arg === "--low-risk-adapter-review") args.lowRiskAdapterReview = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.output) {
    args.output = path.join(
      "data/football-truth/_diagnostics",
      `full-map-source-authority-season-calendar-matrix-${args.date}`,
      `full-map-source-authority-season-calendar-matrix-${args.date}.json`
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

function indexBySlug(rows) {
  const map = new Map();

  for (const row of rows || []) {
    const slug = row.competitionSlug || row.slug;
    if (!slug) continue;
    if (!map.has(slug)) map.set(slug, []);
    map.get(slug).push(row);
  }

  return map;
}

function statusFromEvidence(slug, indexes) {
  const trustedFetchRows = indexes.trustedFetch.get(slug) || [];
  const adapterRows = indexes.adapter.get(slug) || [];
  const lowRiskRows = indexes.lowRisk.get(slug) || [];
  const rolloverRows = indexes.rollover.get(slug) || [];

  const trustedFixtureSource =
    trustedFetchRows.length > 0 ||
    adapterRows.length > 0 ||
    lowRiskRows.length > 0;

  const adapterCandidate = lowRiskRows.some((row) =>
    row.adapterExtractionCandidateReadiness === "candidate" ||
    row.adapterReviewStatus === "adapter_signal_candidate"
  );

  const rollover = rolloverRows[0] || null;

  return {
    trustedFixtureSource,
    trustedFixtureSourceStatus: trustedFixtureSource
      ? "partial_trusted_fixture_or_adapter_source_present"
      : "missing_or_unvalidated_fixture_source",
    adapterCandidate,
    trustedFetchRowCount: trustedFetchRows.length,
    adapterReviewInputRowCount: adapterRows.length,
    lowRiskAdapterCandidateRowCount: lowRiskRows.filter((row) =>
      row.adapterExtractionCandidateReadiness === "candidate" ||
      row.adapterReviewStatus === "adapter_signal_candidate"
    ).length,
    rolloverLane: rollover?.rolloverLane || "__missing_rollover_lane__",
    rollingWindowEvaluationRequired: Boolean(rollover?.rollingWindowEvaluationRequired),
    primaryLeagueScanTarget: Boolean(rollover?.primaryLeagueScanTarget),
    requiresSeparateCupActivityLane: Boolean(rollover?.requiresSeparateCupActivityLane),
    requiresSeparateRegistryOrCompetitionTypeResolutionLane: Boolean(rollover?.requiresSeparateRegistryOrCompetitionTypeResolutionLane)
  };
}

function classifyMatrixRow(row, indexes) {
  const type = row.competitionType.toLowerCase();
  const bucket = row.inventoryBucket.toLowerCase();
  const slug = row.competitionSlug;
  const evidence = statusFromEvidence(slug, indexes);

  const leagueLike = type.includes("league") || slug.endsWith(".1") || slug.endsWith(".2");
  const cupLike = type.includes("cup");
  const suppressed = SUPPRESSED_LOW_VALUE.has(slug);

  const sourceAuthorityStatus = evidence.trustedFixtureSource
    ? "partial_trusted_source_present"
    : bucket.includes("missing") || bucket.includes("provider_discovery") || bucket.includes("truth_review") || bucket.includes("signals")
      ? "source_missing_or_untrusted_requires_discovery"
      : "source_unknown_requires_review";

  const fixtureCalendarStatus = evidence.trustedFixtureSource
    ? "partial_fixture_calendar_source_present_needs_extraction_validation"
    : "fixture_calendar_source_missing_or_untrusted";

  const standingsResultsStatus = "not_verified_for_full_contract";
  const seasonStateStatus = "not_verified_for_full_contract";
  const nextSeasonRestartDateStatus = "not_verified_for_full_contract";
  const nextCheckPolicyStatus = "not_available_until_season_state_and_restart_date_verified";

  const fullContractSatisfied = false;

  let nextRequiredLane = "source_authority_discovery_required";

  if (suppressed) {
    nextRequiredLane = "suppressed_low_value_policy_review_not_inactive";
  } else if (cupLike) {
    nextRequiredLane = "cup_source_authority_round_final_and_calendar_lane_required";
  } else if (!leagueLike) {
    nextRequiredLane = "registry_or_competition_type_resolution_lane_required";
  } else if (evidence.trustedFixtureSource && evidence.adapterCandidate) {
    nextRequiredLane = "adapter_extraction_candidate_review_then_season_state_and_restart_matrix";
  } else if (evidence.trustedFixtureSource) {
    nextRequiredLane = "trusted_fixture_source_extraction_validation_then_standings_season_restart";
  } else {
    nextRequiredLane = "trusted_source_discovery_required_before_activity_or_inactive_truth";
  }

  return {
    competitionSlug: slug,
    competitionName: row.competitionName,
    competitionType: row.competitionType,
    inventoryBucket: row.inventoryBucket,
    providerHint: row.providerHint,
    region: row.region,
    country: row.country,
    targetDate: indexes.date,
    leagueLike,
    cupLike,
    suppressedLowValue: suppressed,

    sourceAuthorityStatus,
    fixtureCalendarStatus,
    standingsResultsStatus,
    seasonStateStatus,
    nextSeasonRestartDateStatus,
    nextCheckPolicyStatus,

    fullContractSatisfied,
    fullContractMissingReasons: [
      sourceAuthorityStatus === "partial_trusted_source_present" ? null : "trusted_source_missing_or_unvalidated",
      fixtureCalendarStatus.startsWith("partial_") ? "fixture_calendar_extraction_not_validated" : "fixture_calendar_source_missing_or_untrusted",
      "standings_results_not_verified",
      "season_state_not_verified",
      "next_season_restart_date_not_verified",
      "next_check_policy_not_available"
    ].filter(Boolean),

    trustedFixtureSource: evidence.trustedFixtureSource,
    adapterCandidate: evidence.adapterCandidate,
    trustedFetchRowCount: evidence.trustedFetchRowCount,
    adapterReviewInputRowCount: evidence.adapterReviewInputRowCount,
    lowRiskAdapterCandidateRowCount: evidence.lowRiskAdapterCandidateRowCount,
    rolloverLane: evidence.rolloverLane,
    rollingWindowEvaluationRequired: evidence.rollingWindowEvaluationRequired,
    primaryLeagueScanTarget: evidence.primaryLeagueScanTarget,
    requiresSeparateCupActivityLane: evidence.requiresSeparateCupActivityLane,
    requiresSeparateRegistryOrCompetitionTypeResolutionLane: evidence.requiresSeparateRegistryOrCompetitionTypeResolutionLane,

    inactiveAsserted: false,
    activeAsserted: false,
    completedAsserted: false,
    sourceCoverageCompleteForCompetition: false,
    nextRequiredLane,
    canonicalWriteEligibleNow: false,
    productionWrite: false
  };
}

function main() {
  const args = parseArgs(process.argv);

  const fullMapInventory = readJsonIfExists(args.fullMapInventory);
  if (!fullMapInventory) throw new Error(`Missing full map inventory: ${args.fullMapInventory}`);

  const rolloverPlan = readJsonIfExists(args.rolloverPlan);
  const trustedFetchInput = readJsonIfExists(args.trustedFetchInput);
  const adapterInput = readJsonIfExists(args.adapterInput);
  const lowRiskAdapterReview = readJsonIfExists(args.lowRiskAdapterReview);

  const inventoryRows = normalizeInventoryRows(fullMapInventory);
  const rolloverRows = Array.isArray(rolloverPlan?.rolloverRows) ? rolloverPlan.rolloverRows : [];
  const trustedFetchRows = Array.isArray(trustedFetchInput?.fetchInputRows) ? trustedFetchInput.fetchInputRows : [];
  const adapterRows = Array.isArray(adapterInput?.adapterReviewInputRows) ? adapterInput.adapterReviewInputRows : [];
  const lowRiskRows = Array.isArray(lowRiskAdapterReview?.reviewRows) ? lowRiskAdapterReview.reviewRows : [];

  const indexes = {
    date: args.date,
    rollover: indexBySlug(rolloverRows),
    trustedFetch: indexBySlug(trustedFetchRows),
    adapter: indexBySlug(adapterRows),
    lowRisk: indexBySlug(lowRiskRows)
  };

  const matrixRows = inventoryRows.map((row) => classifyMatrixRow(row, indexes));
  const leagueRows = matrixRows.filter((row) => row.leagueLike && !row.suppressedLowValue);
  const cupRows = matrixRows.filter((row) => row.cupLike && !row.suppressedLowValue);

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-full-map-source-authority-season-calendar-matrix-file",
    mode: "source_only_full_map_source_authority_season_calendar_requirement_matrix_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    contractDefinition: {
      fullCompetitionCoverageRequires: [
        "trusted official or credible source",
        "fixture/calendar or recent result source",
        "standings/results/final-state source",
        "season state evidence: active/completed/inactive_between_seasons",
        "next-season restart/start date when completed or inactive_between_seasons",
        "nextCheckAt policy so inactive/completed competitions are not checked blindly every day"
      ],
      unknownDoesNotMeanInactive: true,
      noMatchTodayDoesNotMeanInactive: true,
      sourceMissingDoesNotMeanInactive: true
    },
    inputs: {
      fullMapInventory: args.fullMapInventory,
      rolloverPlan: args.rolloverPlan,
      trustedFetchInput: args.trustedFetchInput,
      adapterInput: args.adapterInput,
      lowRiskAdapterReview: args.lowRiskAdapterReview,
      inventoryRowCount: inventoryRows.length,
      rolloverRowCount: rolloverRows.length,
      trustedFetchInputRowCount: trustedFetchRows.length,
      adapterReviewInputRowCount: adapterRows.length,
      lowRiskAdapterReviewRowCount: lowRiskRows.length
    },
    summary: {
      matrixRowCount: matrixRows.length,
      leagueMatrixRowCount: leagueRows.length,
      cupMatrixRowCount: cupRows.length,
      fullContractSatisfiedCount: matrixRows.filter((row) => row.fullContractSatisfied).length,
      fullContractSatisfiedLeagueCount: leagueRows.filter((row) => row.fullContractSatisfied).length,
      partialTrustedSourcePresentCount: matrixRows.filter((row) => row.sourceAuthorityStatus === "partial_trusted_source_present").length,
      partialTrustedSourcePresentLeagueCount: leagueRows.filter((row) => row.sourceAuthorityStatus === "partial_trusted_source_present").length,
      sourceMissingOrUntrustedRequiresDiscoveryCount: matrixRows.filter((row) => row.sourceAuthorityStatus === "source_missing_or_untrusted_requires_discovery").length,
      sourceMissingOrUntrustedRequiresDiscoveryLeagueCount: leagueRows.filter((row) => row.sourceAuthorityStatus === "source_missing_or_untrusted_requires_discovery").length,
      fixtureCalendarSourcePresentNeedsExtractionValidationCount: matrixRows.filter((row) => row.fixtureCalendarStatus === "partial_fixture_calendar_source_present_needs_extraction_validation").length,
      standingsResultsVerifiedCount: 0,
      seasonStateVerifiedCount: 0,
      nextSeasonRestartDateVerifiedCount: 0,
      nextCheckPolicyAvailableCount: 0,
      inactiveAssertedCount: 0,
      activeAssertedCount: 0,
      completedAssertedCount: 0,
      canonicalWriteEligibleNowCount: 0,
      sourceFetch: false,
      searchProviderUsed: false,
      canonicalWrites: 0,
      productionWrite: false,
      recommendedNextLane: "build_trusted_source_discovery_and_season_calendar_lanes_from_matrix"
    },
    counts: {
      bySourceAuthorityStatus: countBy(matrixRows, "sourceAuthorityStatus"),
      byFixtureCalendarStatus: countBy(matrixRows, "fixtureCalendarStatus"),
      byNextRequiredLane: countBy(matrixRows, "nextRequiredLane"),
      byCompetitionType: countBy(matrixRows, "competitionType"),
      byRolloverLane: countBy(matrixRows, "rolloverLane")
    },
    guardrails: [
      "This matrix does not fetch.",
      "This matrix does not search.",
      "This matrix does not write canonical files.",
      "This matrix does not write production files.",
      "No row is active/completed/inactive truth without explicit trusted evidence.",
      "Partial trusted source does not mean full contract coverage.",
      "Completed or inactive_between_seasons requires next-season restart/start date when available.",
      "No-match on a day or missing source must not be interpreted as inactive."
    ],
    matrixRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    matrixRowCount: output.summary.matrixRowCount,
    leagueMatrixRowCount: output.summary.leagueMatrixRowCount,
    cupMatrixRowCount: output.summary.cupMatrixRowCount,
    fullContractSatisfiedCount: output.summary.fullContractSatisfiedCount,
    fullContractSatisfiedLeagueCount: output.summary.fullContractSatisfiedLeagueCount,
    partialTrustedSourcePresentCount: output.summary.partialTrustedSourcePresentCount,
    partialTrustedSourcePresentLeagueCount: output.summary.partialTrustedSourcePresentLeagueCount,
    sourceMissingOrUntrustedRequiresDiscoveryCount: output.summary.sourceMissingOrUntrustedRequiresDiscoveryCount,
    sourceMissingOrUntrustedRequiresDiscoveryLeagueCount: output.summary.sourceMissingOrUntrustedRequiresDiscoveryLeagueCount,
    fixtureCalendarSourcePresentNeedsExtractionValidationCount: output.summary.fixtureCalendarSourcePresentNeedsExtractionValidationCount,
    standingsResultsVerifiedCount: 0,
    seasonStateVerifiedCount: 0,
    nextSeasonRestartDateVerifiedCount: 0,
    nextCheckPolicyAvailableCount: 0,
    inactiveAssertedCount: 0,
    activeAssertedCount: 0,
    completedAssertedCount: 0,
    canonicalWriteEligibleNowCount: 0,
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    recommendedNextLane: output.summary.recommendedNextLane
  }, null, 2));
}

main();
