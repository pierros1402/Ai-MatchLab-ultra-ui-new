#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_READINESS =
  "data/football-truth/_diagnostics/full-map-exploration-readiness-board-2026-06-14/full-map-exploration-readiness-board-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/full-map-reusable-family-expansion-plan-2026-06-14/full-map-reusable-family-expansion-plan-2026-06-14.json";

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    readiness: DEFAULT_READINESS,
    output: DEFAULT_OUTPUT
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--readiness") args.readiness = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
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

function getSlug(row) {
  return String(row.competitionSlug || row.slug || row.normalizedCompetitionSlug || "").trim();
}

function getSlugPrefix(slug) {
  const match = String(slug).match(/^([a-z]{2,3})\./i);
  return match ? match[1].toLowerCase() : "__missing_prefix__";
}

function getCompetitionRank(slug) {
  const match = String(slug).match(/\.([^.]+)$/);
  return match ? match[1].toLowerCase() : "__missing_rank__";
}

function normalizeKey(value) {
  return String(value || "__missing__")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "missing";
}

function safeValue(value, fallback = "__missing__") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function findRows(readiness) {
  if (Array.isArray(readiness.explorationRows)) return readiness.explorationRows;
  if (Array.isArray(readiness.rows)) return readiness.rows;
  if (Array.isArray(readiness.planRows)) return readiness.planRows;
  throw new Error("Could not locate exploration rows in full-map readiness input");
}

function uniqueSorted(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined).map((value) => String(value).trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function compactRows(rows, limit = 40) {
  return rows.slice(0, limit).map((row) => ({
    competitionSlug: row.competitionSlug,
    competitionName: row.competitionName || null,
    country: row.country || null,
    region: row.region || null,
    competitionType: row.competitionType || null,
    inventoryBucket: row.inventoryBucket || null,
    explorationLane: row.explorationLane || null,
    reusableFamily: row.reusableFamily || null,
    recommendedNextStep: row.recommendedNextStep || null
  }));
}

function groupRows(rows, buildKey, buildMeta, options = {}) {
  const limit = options.limit || 40;
  const groups = new Map();

  for (const row of rows) {
    const key = buildKey(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  return [...groups.entries()]
    .map(([key, groupedRows], index) => ({
      batchId: `${options.batchPrefix || "batch"}_${String(index + 1).padStart(3, "0")}_${normalizeKey(key)}`,
      groupingKey: key,
      competitionCount: groupedRows.length,
      competitionSlugs: uniqueSorted(groupedRows.map((row) => row.competitionSlug)),
      ...buildMeta(groupedRows, key),
      fetchAllowedNow: false,
      searchAllowedNow: false,
      broadSearchAllowedNow: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false,
      sampleRows: compactRows(groupedRows, limit)
    }))
    .sort((a, b) => {
      if (b.competitionCount !== a.competitionCount) return b.competitionCount - a.competitionCount;
      return a.groupingKey.localeCompare(b.groupingKey);
    });
}

function requireGuardrail(readinessSummary, key, expected) {
  if (!readinessSummary || !(key in readinessSummary)) return;
  if (readinessSummary[key] !== expected) {
    throw new Error(`Readiness guardrail failed: summary.${key} expected ${expected}, got ${readinessSummary[key]}`);
  }
}

function main() {
  const args = parseArgs(process.argv);
  const readiness = readJson(args.readiness);
  const readinessSummary = readiness.summary || {};

  requireGuardrail(readinessSummary, "currentEffectiveMapExactCountAsserted", false);
  requireGuardrail(readinessSummary, "currentEffectiveMapExactCount", null);
  requireGuardrail(readinessSummary, "sourceDiscoveryConfirmedActionableCompetitionCount", 0);
  requireGuardrail(readinessSummary, "fetchAllowedNowCount", 0);
  requireGuardrail(readinessSummary, "searchAllowedNowCount", 0);
  requireGuardrail(readinessSummary, "broadSearchAllowedNowCount", 0);
  requireGuardrail(readinessSummary, "zeroResultMayImplyAbsenceCount", 0);
  requireGuardrail(readinessSummary, "canonicalWriteEligibleNowCount", 0);
  requireGuardrail(readinessSummary, "activeAssertedCount", 0);
  requireGuardrail(readinessSummary, "inactiveAssertedCount", 0);
  requireGuardrail(readinessSummary, "completedAssertedCount", 0);

  const sourceRows = findRows(readiness);
  const dedupedBySlug = new Map();

  for (const rawRow of sourceRows) {
    if (!rawRow || typeof rawRow !== "object" || Array.isArray(rawRow)) continue;
    const slug = getSlug(rawRow);
    if (!slug) continue;

    if (!dedupedBySlug.has(slug)) {
      dedupedBySlug.set(slug, {
        ...rawRow,
        competitionSlug: slug,
        slugPrefix: getSlugPrefix(slug),
        competitionRank: getCompetitionRank(slug),
        explorationLane: safeValue(rawRow.explorationLane),
        inventoryBucket: safeValue(rawRow.inventoryBucket),
        competitionType: safeValue(rawRow.competitionType, "unknown"),
        country: safeValue(rawRow.country, null),
        region: safeValue(rawRow.region, null),
        reusableFamily: rawRow.reusableFamily || null
      });
    }
  }

  const rows = [...dedupedBySlug.values()].sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const priority1FullContractCandidateRows = rows.filter((row) =>
    row.explorationLane === "priority1_full_contract_candidate_no_canonical_write"
  );

  const priority1RepairRows = rows.filter((row) =>
    row.explorationLane === "priority1_reusable_repair_lane"
  );

  const configuredReusableRows = rows.filter((row) =>
    row.explorationLane === "reusable_family_configured_validation_lane"
  );

  const truthReviewRows = rows.filter((row) => row.explorationLane === "truth_review_lane");
  const providerRepairRows = rows.filter((row) => row.explorationLane === "provider_repair_lane");
  const registryGapRows = rows.filter((row) => row.explorationLane === "registry_gap_review_lane");
  const cupStateRows = rows.filter((row) => row.explorationLane === "cup_winner_or_cup_state_review_lane");
  const leagueFullContractRows = rows.filter((row) => row.explorationLane === "league_full_contract_exploration_lane");
  const sourceDiscoveryRows = rows.filter((row) => row.explorationLane === "source_discovery_planning_lane");
  const manualClassificationRows = rows.filter((row) => row.explorationLane === "full_map_manual_classification_avoid_bespoke_execution");
  const suppressedRows = rows.filter((row) => row.explorationLane === "suppressed_low_value_no_active_work");
  const coveredNoActionRows = rows.filter((row) => row.explorationLane === "covered_no_action");

  const fullContractCandidateReviewBatches = groupRows(
    priority1FullContractCandidateRows,
    (row) => row.reusableFamily || "priority1_full_contract_candidate",
    (groupedRows, key) => ({
      lane: "review_full_contract_candidates_no_write",
      reusableFamily: key,
      requiredReview: "confirm source contract and activity-state gates before any separate scoped canonical write plan"
    }),
    { batchPrefix: "full_contract_candidate_review" }
  );

  const priority1FamilyRepairBatches = groupRows(
    priority1RepairRows,
    (row) => row.reusableFamily || `${row.slugPrefix}::priority1_repair`,
    (groupedRows, key) => ({
      lane: "priority1_family_repair",
      reusableFamily: key,
      requiredRepair: "repair missing family-level contract parts; do not patch leagues one by one"
    }),
    { batchPrefix: "priority1_family_repair" }
  );

  const configuredReusableFamilyApplyBatches = groupRows(
    configuredReusableRows,
    (row) => row.reusableFamily || `${row.slugPrefix}::configured_reusable_family`,
    (groupedRows, key) => ({
      lane: "configured_reusable_family_apply",
      reusableFamily: key,
      requiredAction: "apply reusable validator family in a controlled batch before any canonical plan"
    }),
    { batchPrefix: "configured_reusable_family_apply" }
  );

  const truthReviewGroupingBatches = groupRows(
    truthReviewRows,
    (row) => `${row.region || "__missing_region__"}::${row.slugPrefix}::${row.competitionType}`,
    () => ({
      lane: "truth_review_grouping",
      requiredAction: "group existing signals into trusted source review lanes; no search or fetch in this plan"
    }),
    { batchPrefix: "truth_review_group" }
  );

  const cupStateGroupingBatches = groupRows(
    cupStateRows,
    (row) => `${row.region || "__missing_region__"}::${row.slugPrefix}::cup_state`,
    () => ({
      lane: "cup_state_grouping",
      requiredAction: "separate cup final/winner/round-state evidence workflow; no league season-state inference"
    }),
    { batchPrefix: "cup_state_group" }
  );

  const providerRepairGroupingBatches = groupRows(
    providerRepairRows,
    (row) => `${row.region || "__missing_region__"}::${row.slugPrefix}::provider_repair`,
    () => ({
      lane: "provider_repair_grouping",
      requiredAction: "convert provider repair rows into reusable provider/family repair tasks"
    }),
    { batchPrefix: "provider_repair_group" }
  );

  const registryGapGroupingBatches = groupRows(
    registryGapRows,
    (row) => `${row.region || "__missing_region__"}::${row.slugPrefix}::registry_gap`,
    () => ({
      lane: "registry_gap_grouping",
      requiredAction: "resolve registry/type gaps before fixture, standings, or season-state work"
    }),
    { batchPrefix: "registry_gap_group" }
  );

  const sourceAuthorityProviderFamilyGroupingBatches = groupRows(
    [...leagueFullContractRows, ...sourceDiscoveryRows],
    (row) => `${row.region || "__missing_region__"}::${row.slugPrefix}::${row.competitionType}::${row.inventoryBucket}`,
    () => ({
      lane: "source_authority_provider_family_grouping",
      requiredAction: "design source-authority/provider-family template before any controlled search/fetch lane",
      actionableConfirmedByThisPlan: false
    }),
    { batchPrefix: "source_authority_group", limit: 20 }
  );

  const futurePolicyReductionCandidateBatches = groupRows(
    [...sourceDiscoveryRows, ...manualClassificationRows],
    (row) => `${row.region || "__missing_region__"}::${row.slugPrefix}::policy_reduction_review`,
    () => ({
      lane: "future_policy_reduction_candidate_grouping",
      requiredAction: "review for non-existent, irrelevant, low-value, no-market, or no-product-value policy exclusion",
      actionableConfirmedByThisPlan: false
    }),
    { batchPrefix: "future_policy_reduction_group", limit: 20 }
  );

  const nextExecutionRows = [
    ...fullContractCandidateReviewBatches,
    ...priority1FamilyRepairBatches,
    ...configuredReusableFamilyApplyBatches,
    ...providerRepairGroupingBatches,
    ...truthReviewGroupingBatches,
    ...cupStateGroupingBatches,
    ...registryGapGroupingBatches,
    ...sourceAuthorityProviderFamilyGroupingBatches,
    ...futurePolicyReductionCandidateBatches
  ].map((batch, index) => ({
    executionOrder: index + 1,
    batchId: batch.batchId,
    lane: batch.lane,
    competitionCount: batch.competitionCount,
    groupingKey: batch.groupingKey,
    fetchAllowedNow: false,
    searchAllowedNow: false,
    broadSearchAllowedNow: false,
    canonicalWriteEligibleNow: false,
    productionWrite: false
  }));

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-full-map-reusable-family-expansion-plan-file",
    mode: "source_only_full_map_reusable_family_expansion_plan_no_fetch_no_search_no_canonical_writes_no_production_writes",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      readiness: args.readiness,
      readinessJob: readiness.job || null,
      readinessMode: readiness.mode || null,
      readinessRecommendedNextLane: readinessSummary.recommendedNextLane || null
    },
    summary: {
      retainedRawMapCompetitionCount: readinessSummary.retainedRawMapCompetitionCount ?? rows.length,
      competitionCount: rows.length,
      currentEffectiveMapExactCountAsserted: false,
      currentEffectiveMapExactCount: null,
      currentEffectiveMapQualitativeState: readinessSummary.currentEffectiveMapQualitativeState || "above_600_expected_to_shrink_after_policy_reductions",
      sourceDiscoveryConfirmedActionableCompetitionCount: 0,

      priority1FullContractCandidateNoCanonicalWriteCount: priority1FullContractCandidateRows.length,
      priority1ReusableRepairCompetitionCount: priority1RepairRows.length,
      configuredReusableFamilyApplyCompetitionCount: configuredReusableRows.length,
      providerRepairCompetitionCount: providerRepairRows.length,
      truthReviewCompetitionCount: truthReviewRows.length,
      cupStateReviewCompetitionCount: cupStateRows.length,
      registryGapReviewCompetitionCount: registryGapRows.length,
      leagueFullContractExplorationCompetitionCount: leagueFullContractRows.length,
      sourceDiscoveryPlanningCompetitionCount: sourceDiscoveryRows.length,
      manualClassificationCompetitionCount: manualClassificationRows.length,
      futurePolicyReductionCandidateCompetitionCount: sourceDiscoveryRows.length + manualClassificationRows.length,
      suppressedCompetitionCount: suppressedRows.length,
      coveredNoActionCompetitionCount: coveredNoActionRows.length,

      fullContractCandidateReviewBatchCount: fullContractCandidateReviewBatches.length,
      priority1FamilyRepairBatchCount: priority1FamilyRepairBatches.length,
      configuredReusableFamilyApplyBatchCount: configuredReusableFamilyApplyBatches.length,
      providerRepairGroupingBatchCount: providerRepairGroupingBatches.length,
      truthReviewGroupingBatchCount: truthReviewGroupingBatches.length,
      cupStateGroupingBatchCount: cupStateGroupingBatches.length,
      registryGapGroupingBatchCount: registryGapGroupingBatches.length,
      sourceAuthorityProviderFamilyGroupingBatchCount: sourceAuthorityProviderFamilyGroupingBatches.length,
      futurePolicyReductionCandidateBatchCount: futurePolicyReductionCandidateBatches.length,
      nextExecutionRowCount: nextExecutionRows.length,

      fetchAllowedNowCount: 0,
      searchAllowedNowCount: 0,
      broadSearchAllowedNowCount: 0,
      zeroResultMayImplyAbsenceCount: 0,
      canonicalWriteEligibleNowCount: 0,
      activeAssertedCount: 0,
      inactiveAssertedCount: 0,
      completedAssertedCount: 0,
      sourceFetch: false,
      searchProviderUsed: false,
      broadSearchUsed: false,
      canonicalWrites: 0,
      productionWrite: false,
      recommendedNextLane: "run_source_only_reusable_family_expansion_review_then_choose_first_large_family_batch"
    },
    counts: {
      byExplorationLane: countBy(rows, "explorationLane"),
      byInventoryBucket: countBy(rows, "inventoryBucket"),
      byCompetitionType: countBy(rows, "competitionType"),
      byReusableFamily: countBy(rows, "reusableFamily"),
      bySlugPrefix: countBy(rows, "slugPrefix")
    },
    guardrails: [
      "This is a source-only expansion plan from the full-map readiness board.",
      "The retained raw map count is not the confirmed actionable league count.",
      "This plan does not assert an exact current effective/actionable map count.",
      "This plan does not run search or fetch.",
      "This plan does not treat raw source-discovery rows as actionable competitions.",
      "This plan does not treat zero search results as absence.",
      "This plan does not infer inactive from no match today.",
      "This plan does not infer season state from match status alone.",
      "This plan does not write canonical or production data.",
      "Full-contract diagnostic candidates still require a separate scoped canonical gate before any write."
    ],
    fullContractCandidateReviewBatches,
    priority1FamilyRepairBatches,
    configuredReusableFamilyApplyBatches,
    providerRepairGroupingBatches,
    truthReviewGroupingBatches,
    cupStateGroupingBatches,
    registryGapGroupingBatches,
    sourceAuthorityProviderFamilyGroupingBatches,
    futurePolicyReductionCandidateBatches,
    nextExecutionRows
  };

  if (output.summary.retainedRawMapCompetitionCount !== rows.length) {
    throw new Error(`Readiness retained raw count (${output.summary.retainedRawMapCompetitionCount}) does not match deduped plan rows (${rows.length})`);
  }

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${stableJson(output)}\n`);

  console.log(JSON.stringify({
    output: args.output,
    retainedRawMapCompetitionCount: output.summary.retainedRawMapCompetitionCount,
    competitionCount: output.summary.competitionCount,
    currentEffectiveMapExactCountAsserted: output.summary.currentEffectiveMapExactCountAsserted,
    currentEffectiveMapExactCount: output.summary.currentEffectiveMapExactCount,
    sourceDiscoveryConfirmedActionableCompetitionCount: output.summary.sourceDiscoveryConfirmedActionableCompetitionCount,
    priority1FullContractCandidateNoCanonicalWriteCount: output.summary.priority1FullContractCandidateNoCanonicalWriteCount,
    priority1ReusableRepairCompetitionCount: output.summary.priority1ReusableRepairCompetitionCount,
    configuredReusableFamilyApplyCompetitionCount: output.summary.configuredReusableFamilyApplyCompetitionCount,
    providerRepairCompetitionCount: output.summary.providerRepairCompetitionCount,
    truthReviewCompetitionCount: output.summary.truthReviewCompetitionCount,
    cupStateReviewCompetitionCount: output.summary.cupStateReviewCompetitionCount,
    registryGapReviewCompetitionCount: output.summary.registryGapReviewCompetitionCount,
    sourceAuthorityProviderFamilyGroupingBatchCount: output.summary.sourceAuthorityProviderFamilyGroupingBatchCount,
    futurePolicyReductionCandidateCompetitionCount: output.summary.futurePolicyReductionCandidateCompetitionCount,
    fetchAllowedNowCount: output.summary.fetchAllowedNowCount,
    searchAllowedNowCount: output.summary.searchAllowedNowCount,
    broadSearchAllowedNowCount: output.summary.broadSearchAllowedNowCount,
    zeroResultMayImplyAbsenceCount: output.summary.zeroResultMayImplyAbsenceCount,
    canonicalWriteEligibleNowCount: output.summary.canonicalWriteEligibleNowCount,
    activeAssertedCount: output.summary.activeAssertedCount,
    inactiveAssertedCount: output.summary.inactiveAssertedCount,
    completedAssertedCount: output.summary.completedAssertedCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    recommendedNextLane: output.summary.recommendedNextLane
  }, null, 2));
}

main();
