#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_LANES =
  "data/football-truth/_diagnostics/trusted-source-discovery-season-calendar-lanes-2026-06-14/trusted-source-discovery-season-calendar-lanes-2026-06-14.json";

const DEFAULT_MATRIX =
  "data/football-truth/_diagnostics/full-map-source-authority-season-calendar-matrix-2026-06-14/full-map-source-authority-season-calendar-matrix-2026-06-14.json";

const DEFAULT_TRUSTED_FETCH_INPUT =
  "data/football-truth/_diagnostics/scoped-active-today-trusted-fixture-fetch-input-2026-06-13/scoped-active-today-trusted-fixture-fetch-input-2026-06-13.json";

const DEFAULT_FETCH_REVIEW =
  "data/football-truth/_diagnostics/scoped-active-today-fetch-snapshot-review-board-2026-06-13/scoped-active-today-fetch-snapshot-review-board-2026-06-13.json";

const DEFAULT_ADAPTER_INPUT =
  "data/football-truth/_diagnostics/scoped-active-today-adapter-extraction-review-input-2026-06-13/scoped-active-today-adapter-extraction-review-input-2026-06-13.json";

const DEFAULT_LOW_RISK_ADAPTER_REVIEW =
  "data/football-truth/_diagnostics/scoped-active-today-low-risk-adapter-extraction-review-batch-2026-06-13/scoped-active-today-low-risk-adapter-extraction-review-batch-2026-06-13.json";

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    lanes: DEFAULT_LANES,
    matrix: DEFAULT_MATRIX,
    trustedFetchInput: DEFAULT_TRUSTED_FETCH_INPUT,
    fetchReview: DEFAULT_FETCH_REVIEW,
    adapterInput: DEFAULT_ADAPTER_INPUT,
    lowRiskAdapterReview: DEFAULT_LOW_RISK_ADAPTER_REVIEW,
    output: null
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--lanes") args.lanes = argv[++i];
    else if (arg === "--matrix") args.matrix = argv[++i];
    else if (arg === "--trusted-fetch-input") args.trustedFetchInput = argv[++i];
    else if (arg === "--fetch-review") args.fetchReview = argv[++i];
    else if (arg === "--adapter-input") args.adapterInput = argv[++i];
    else if (arg === "--low-risk-adapter-review") args.lowRiskAdapterReview = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.output) {
    args.output = path.join(
      "data/football-truth/_diagnostics",
      `partial-trusted-source-enrichment-plan-${args.date}`,
      `partial-trusted-source-enrichment-plan-${args.date}.json`
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

function indexBySlug(rows) {
  const map = new Map();

  for (const row of rows || []) {
    const slug = String(row.competitionSlug || row.slug || "").trim();
    if (!slug) continue;
    if (!map.has(slug)) map.set(slug, []);
    map.get(slug).push(row);
  }

  return map;
}

function findRows(value, keys) {
  if (!value || typeof value !== "object") return [];

  for (const key of keys) {
    if (Array.isArray(value[key])) return value[key];
  }

  for (const nested of Object.values(value)) {
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      const found = findRows(nested, keys);
      if (found.length) return found;
    }
  }

  return [];
}

function adapterFamilyFromRows(rows) {
  const families = rows
    .map((row) => row.adapterFamily || row.adapter || row.providerFamily || row.sourceFamily)
    .filter(Boolean)
    .map(String);

  return [...new Set(families)].sort();
}

function sourceUrlsFromRows(rows) {
  const urls = [];

  for (const row of rows) {
    for (const key of [
      "sourceUrl",
      "url",
      "fixtureUrl",
      "fetchUrl",
      "providerUrl",
      "officialUrl",
      "standingUrl",
      "standingSourceUrl"
    ]) {
      if (row[key]) urls.push(String(row[key]));
    }
  }

  return [...new Set(urls)].sort();
}

function classifyPlanRow(laneRow, indexes) {
  const slug = laneRow.competitionSlug;

  const matrixRow = (indexes.matrix.get(slug) || [])[0] || null;
  const trustedFetchRows = indexes.trustedFetch.get(slug) || [];
  const fetchReviewRows = indexes.fetchReview.get(slug) || [];
  const adapterRows = indexes.adapter.get(slug) || [];
  const lowRiskRows = indexes.lowRisk.get(slug) || [];

  const adapterFamilies = adapterFamilyFromRows([...adapterRows, ...lowRiskRows, ...trustedFetchRows]);
  const knownSourceUrls = sourceUrlsFromRows([...trustedFetchRows, ...fetchReviewRows, ...adapterRows, ...lowRiskRows]);

  const hasLowRiskAdapterCandidate = lowRiskRows.some((row) =>
    row.adapterExtractionCandidateReadiness === "candidate" ||
    row.adapterReviewStatus === "adapter_signal_candidate"
  );

  const hasAdapterReviewInput = adapterRows.length > 0;
  const hasFetchReview = fetchReviewRows.length > 0;

  let enrichmentPlanStatus = "requires_fixture_source_extraction_validation";
  let recommendedNextJob = "build_trusted_fixture_extraction_validation_targets_no_fetch_no_canonical_write";

  if (hasLowRiskAdapterCandidate) {
    enrichmentPlanStatus = "adapter_candidate_ready_for_extraction_validation_plan";
    recommendedNextJob = "build_low_risk_adapter_extraction_validation_plan_no_canonical_write";
  } else if (hasAdapterReviewInput) {
    enrichmentPlanStatus = "adapter_review_input_ready_needs_family_specific_candidate_builder";
    recommendedNextJob = "build_adapter_family_specific_candidate_targets_no_canonical_write";
  } else if (hasFetchReview) {
    enrichmentPlanStatus = "trusted_fetch_review_ready_needs_extraction_route";
    recommendedNextJob = "build_fetch_review_extraction_validation_targets_no_canonical_write";
  }

  const missingForFullContract = [
    "fixture_calendar_extraction_validation",
    "standings_results_source_validation",
    "season_state_evidence_validation",
    "next_season_restart_date_source_validation",
    "next_check_policy_derivation"
  ];

  return {
    planRowId: null,
    competitionSlug: slug,
    competitionName: laneRow.competitionName || matrixRow?.competitionName || "",
    competitionType: laneRow.competitionType || matrixRow?.competitionType || "",
    providerHint: laneRow.providerHint || matrixRow?.providerHint || "",
    sourceAuthorityStatus: laneRow.sourceAuthorityStatus,
    fixtureCalendarStatus: laneRow.fixtureCalendarStatus,
    trustedFixtureSource: Boolean(laneRow.trustedFixtureSource),
    adapterCandidate: Boolean(laneRow.adapterCandidate || hasLowRiskAdapterCandidate),
    adapterFamilies,
    knownSourceUrls,
    trustedFetchRowCount: trustedFetchRows.length,
    fetchReviewRowCount: fetchReviewRows.length,
    adapterReviewInputRowCount: adapterRows.length,
    lowRiskAdapterReviewRowCount: lowRiskRows.length,
    lowRiskAdapterCandidateRowCount: lowRiskRows.filter((row) =>
      row.adapterExtractionCandidateReadiness === "candidate" ||
      row.adapterReviewStatus === "adapter_signal_candidate"
    ).length,
    enrichmentPlanStatus,
    missingForFullContract,
    recommendedNextJob,

    fixtureCalendarExtractionValidationRequired: true,
    standingsResultsSourceValidationRequired: true,
    seasonStateEvidenceValidationRequired: true,
    nextSeasonRestartDateSourceValidationRequired: true,
    nextCheckPolicyDerivationRequired: true,

    canBecomeFullContractWithoutSourceDiscovery: true,
    fullContractSatisfiedNow: false,
    activeAsserted: false,
    inactiveAsserted: false,
    completedAsserted: false,
    fetchAllowedNow: false,
    searchAllowedNow: false,
    canonicalWriteEligibleNow: false,
    productionWrite: false
  };
}

function main() {
  const args = parseArgs(process.argv);

  const lanes = readJsonIfExists(args.lanes);
  if (!lanes) throw new Error(`Missing lanes input: ${args.lanes}`);

  const matrix = readJsonIfExists(args.matrix);
  const trustedFetchInput = readJsonIfExists(args.trustedFetchInput);
  const fetchReview = readJsonIfExists(args.fetchReview);
  const adapterInput = readJsonIfExists(args.adapterInput);
  const lowRiskAdapterReview = readJsonIfExists(args.lowRiskAdapterReview);

  const laneRows = Array.isArray(lanes.laneRows) ? lanes.laneRows : [];
  const matrixRows = Array.isArray(matrix?.matrixRows) ? matrix.matrixRows : [];
  const trustedFetchRows = findRows(trustedFetchInput, ["fetchInputRows", "rows"]);
  const fetchReviewRows = findRows(fetchReview, ["reviewRows", "rows"]);
  const adapterRows = findRows(adapterInput, ["adapterReviewInputRows", "rows"]);
  const lowRiskRows = findRows(lowRiskAdapterReview, ["reviewRows", "rows"]);

  const partialRows = laneRows.filter((row) =>
    row.executionLane === "partial_trusted_source_extraction_validation_and_season_calendar_enrichment"
  );

  const indexes = {
    matrix: indexBySlug(matrixRows),
    trustedFetch: indexBySlug(trustedFetchRows),
    fetchReview: indexBySlug(fetchReviewRows),
    adapter: indexBySlug(adapterRows),
    lowRisk: indexBySlug(lowRiskRows)
  };

  const planRows = partialRows
    .map((row) => classifyPlanRow(row, indexes))
    .sort((a, b) => {
      if (a.enrichmentPlanStatus !== b.enrichmentPlanStatus) {
        return a.enrichmentPlanStatus.localeCompare(b.enrichmentPlanStatus);
      }

      return a.competitionSlug.localeCompare(b.competitionSlug);
    })
    .map((row, index) => ({
      ...row,
      planRowId: `partial_trusted_enrichment_${String(index + 1).padStart(3, "0")}`,
      planSequence: index + 1
    }));

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-partial-trusted-source-enrichment-plan-file",
    mode: "source_only_partial_trusted_source_enrichment_plan_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      lanes: args.lanes,
      matrix: args.matrix,
      trustedFetchInput: args.trustedFetchInput,
      fetchReview: args.fetchReview,
      adapterInput: args.adapterInput,
      lowRiskAdapterReview: args.lowRiskAdapterReview,
      laneRowCount: laneRows.length,
      partialTrustedLaneRowCount: partialRows.length,
      matrixRowCount: matrixRows.length,
      trustedFetchRowCount: trustedFetchRows.length,
      fetchReviewRowCount: fetchReviewRows.length,
      adapterReviewInputRowCount: adapterRows.length,
      lowRiskAdapterReviewRowCount: lowRiskRows.length
    },
    summary: {
      planRowCount: planRows.length,
      canBecomeFullContractWithoutSourceDiscoveryCount: planRows.filter((row) => row.canBecomeFullContractWithoutSourceDiscovery).length,
      adapterCandidateReadyForExtractionValidationPlanCount: planRows.filter((row) => row.enrichmentPlanStatus === "adapter_candidate_ready_for_extraction_validation_plan").length,
      adapterReviewInputReadyNeedsFamilySpecificCandidateBuilderCount: planRows.filter((row) => row.enrichmentPlanStatus === "adapter_review_input_ready_needs_family_specific_candidate_builder").length,
      trustedFetchReviewReadyNeedsExtractionRouteCount: planRows.filter((row) => row.enrichmentPlanStatus === "trusted_fetch_review_ready_needs_extraction_route").length,
      requiresFixtureSourceExtractionValidationCount: planRows.filter((row) => row.enrichmentPlanStatus === "requires_fixture_source_extraction_validation").length,
      fixtureCalendarExtractionValidationRequiredCount: planRows.filter((row) => row.fixtureCalendarExtractionValidationRequired).length,
      standingsResultsSourceValidationRequiredCount: planRows.filter((row) => row.standingsResultsSourceValidationRequired).length,
      seasonStateEvidenceValidationRequiredCount: planRows.filter((row) => row.seasonStateEvidenceValidationRequired).length,
      nextSeasonRestartDateSourceValidationRequiredCount: planRows.filter((row) => row.nextSeasonRestartDateSourceValidationRequired).length,
      nextCheckPolicyDerivationRequiredCount: planRows.filter((row) => row.nextCheckPolicyDerivationRequired).length,
      fullContractSatisfiedNowCount: 0,
      activeAssertedCount: 0,
      inactiveAssertedCount: 0,
      completedAssertedCount: 0,
      fetchAllowedNowCount: 0,
      searchAllowedNowCount: 0,
      canonicalWriteEligibleNowCount: 0,
      sourceFetch: false,
      searchProviderUsed: false,
      canonicalWrites: 0,
      productionWrite: false,
      recommendedNextLane: "build_low_risk_adapter_extraction_validation_plan_first"
    },
    counts: {
      byEnrichmentPlanStatus: countBy(planRows, "enrichmentPlanStatus"),
      byRecommendedNextJob: countBy(planRows, "recommendedNextJob"),
      byCompetitionType: countBy(planRows, "competitionType"),
      byProviderHint: countBy(planRows, "providerHint")
    },
    guardrails: [
      "This plan only scopes the 37 partial trusted source rows.",
      "This plan does not fetch.",
      "This plan does not search.",
      "This plan does not write canonical files.",
      "This plan does not write production files.",
      "No row is active/inactive/completed truth in this output.",
      "All rows still require fixture/calendar extraction validation, standings/results validation, season-state evidence, restart-date evidence, and nextCheck policy derivation before full contract coverage."
    ],
    planRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    planRowCount: output.summary.planRowCount,
    canBecomeFullContractWithoutSourceDiscoveryCount: output.summary.canBecomeFullContractWithoutSourceDiscoveryCount,
    adapterCandidateReadyForExtractionValidationPlanCount: output.summary.adapterCandidateReadyForExtractionValidationPlanCount,
    adapterReviewInputReadyNeedsFamilySpecificCandidateBuilderCount: output.summary.adapterReviewInputReadyNeedsFamilySpecificCandidateBuilderCount,
    trustedFetchReviewReadyNeedsExtractionRouteCount: output.summary.trustedFetchReviewReadyNeedsExtractionRouteCount,
    requiresFixtureSourceExtractionValidationCount: output.summary.requiresFixtureSourceExtractionValidationCount,
    fixtureCalendarExtractionValidationRequiredCount: output.summary.fixtureCalendarExtractionValidationRequiredCount,
    standingsResultsSourceValidationRequiredCount: output.summary.standingsResultsSourceValidationRequiredCount,
    seasonStateEvidenceValidationRequiredCount: output.summary.seasonStateEvidenceValidationRequiredCount,
    nextSeasonRestartDateSourceValidationRequiredCount: output.summary.nextSeasonRestartDateSourceValidationRequiredCount,
    nextCheckPolicyDerivationRequiredCount: output.summary.nextCheckPolicyDerivationRequiredCount,
    fullContractSatisfiedNowCount: 0,
    activeAssertedCount: 0,
    inactiveAssertedCount: 0,
    completedAssertedCount: 0,
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
