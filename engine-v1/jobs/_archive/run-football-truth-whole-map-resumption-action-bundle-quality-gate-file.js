#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULTS = {
  date: "2026-06-14",
  bundleInput: "data/football-truth/_diagnostics/whole-map-resumption-action-bundle-2026-06-14/whole-map-resumption-action-bundle-2026-06-14.json",
  output: "data/football-truth/_diagnostics/whole-map-resumption-action-bundle-quality-gate-2026-06-14/whole-map-resumption-action-bundle-quality-gate-2026-06-14.json"
};

const REQUIRED_ACTION_TYPES = [
  "whole_map_resume_primary_manifest",
  "whole_map_attach_followup_quality_gated_pack",
  "whole_map_attach_active_workstream_execution_wave",
  "promote_reusable_family_patterns_to_full_map",
  "defer_provider_family_repair_backlog"
];

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--bundle-input") args.bundleInput = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error("Unknown argument: " + arg);
  }
  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error("Missing JSON input: " + filePath);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value = row[key] === null || row[key] === undefined || String(row[key]).trim() === "" ? "__missing__" : String(row[key]).trim();
    counts[value] = (counts[value] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function assertSummary(summary, key, expected) {
  if (!(key in summary)) throw new Error("Missing bundle summary key: " + key);
  if (summary[key] !== expected) {
    throw new Error(`Bundle guardrail failed for ${key}: expected ${expected}, got ${summary[key]}`);
  }
}

function validateBundle(bundle) {
  const s = bundle.summary || {};

  assertSummary(s, "selectorReadCount", 1);
  assertSummary(s, "selectedResumptionInputCount", 3);
  assertSummary(s, "selectedPrimaryBatchRunnerManifestOrQualityGateCount", 1);
  assertSummary(s, "selectedFollowupLaneQualityGatedPackCount", 1);
  assertSummary(s, "selectedWholeMapActiveWorkstreamOrExecutionWaveCount", 1);
  assertSummary(s, "actionBundleRowCount", 5);
  assertSummary(s, "actionBundleReadyRowCount", 5);
  assertSummary(s, "actionBundleBlockedRowCount", 0);
  assertSummary(s, "wholeMapResumePrimaryManifestActionCount", 1);
  assertSummary(s, "wholeMapAttachFollowupQualityGatedPackActionCount", 1);
  assertSummary(s, "wholeMapAttachActiveWorkstreamExecutionWaveActionCount", 1);
  assertSummary(s, "reusableFamilyPromotionActionCount", 1);
  assertSummary(s, "providerFamilyRepairDeferredActionCount", 1);
  assertSummary(s, "laligaReusablePatternPromotedCount", 1);
  assertSummary(s, "norwayNtfReusablePatternPromotedCount", 1);
  assertSummary(s, "sportomediaProviderFamilyRepairDeferredCount", 1);
  assertSummary(s, "sportomediaBlocksWholeMapCount", 0);
  assertSummary(s, "mayProceedToWholeMapResumptionActionBundleQualityGateCount", 1);

  assertSummary(s, "mayExecuteNowCount", 0);
  assertSummary(s, "mayFetchNowCount", 0);
  assertSummary(s, "maySearchNowCount", 0);
  assertSummary(s, "mayBroadSearchNowCount", 0);
  assertSummary(s, "mayClassifySeasonStateNowCount", 0);
  assertSummary(s, "mayWriteCanonicalNowCount", 0);
  assertSummary(s, "mayAssertTruthNowCount", 0);

  assertSummary(s, "fetchExecutedNowCount", 0);
  assertSummary(s, "searchExecutedNowCount", 0);
  assertSummary(s, "broadSearchExecutedNowCount", 0);
  assertSummary(s, "classifierExecutedNowCount", 0);
  assertSummary(s, "canonicalWriteExecutedNowCount", 0);
  assertSummary(s, "productionWriteExecutedNowCount", 0);
  assertSummary(s, "seasonStateTruthAssertedCount", 0);
  assertSummary(s, "wholeMapResumptionActionBundleTruthCount", 0);
  assertSummary(s, "canonicalWrites", 0);

  if (s.productionWrite !== false) throw new Error("Bundle productionWrite must be false.");
  if (bundle.wholeMapResumptionPolicy?.sportomediaBlocksWholeMap !== false) {
    throw new Error("Sportomedia must not block whole-map resumption.");
  }
  if (bundle.wholeMapResumptionPolicy?.noProviderMicroProbingInMainLane !== true) {
    throw new Error("Main lane must not continue provider micro-probing.");
  }
  if (bundle.wholeMapResumptionPolicy?.noCanonicalWritesUntilFutureExplicitApproval !== true) {
    throw new Error("Canonical writes must remain blocked until future explicit approval.");
  }
  if (bundle.wholeMapResumptionPolicy?.noTruthAssertionsUntilFutureEvidenceGate !== true) {
    throw new Error("Truth assertions must remain blocked until future evidence gate.");
  }

  const actionRows = Array.isArray(bundle.actionRows) ? bundle.actionRows : [];
  if (actionRows.length !== 5) throw new Error("Expected 5 actionRows.");

  const types = new Set(actionRows.map((row) => row.actionType));
  for (const type of REQUIRED_ACTION_TYPES) {
    if (!types.has(type)) throw new Error("Missing required action type: " + type);
  }

  return actionRows;
}

function buildGateRow(actionRow) {
  const blockingReasons = [];

  if (actionRow.actionStatus !== "ready_for_whole_map_resumption_action_bundle_quality_gate") {
    blockingReasons.push("action_not_ready_for_quality_gate");
  }
  if (!REQUIRED_ACTION_TYPES.includes(actionRow.actionType)) {
    blockingReasons.push("unexpected_action_type");
  }

  if (actionRow.actionType === "defer_provider_family_repair_backlog") {
    const families = Array.isArray(actionRow.reusableFamilies) ? actionRow.reusableFamilies : [];
    if (!families.includes("sportomedia")) blockingReasons.push("sportomedia_not_deferred_in_provider_repair_action");
  }

  if (actionRow.actionType === "promote_reusable_family_patterns_to_full_map") {
    const families = Array.isArray(actionRow.reusableFamilies) ? actionRow.reusableFamilies : [];
    if (!families.includes("laliga")) blockingReasons.push("laliga_pattern_not_promoted");
    if (!families.includes("norway_ntf")) blockingReasons.push("norway_ntf_pattern_not_promoted");
  }

  if (actionRow.mayExecuteNow !== false) blockingReasons.push("action_would_execute_now");
  if (actionRow.mayFetchNow !== false) blockingReasons.push("action_would_fetch_now");
  if (actionRow.maySearchNow !== false) blockingReasons.push("action_would_search_now");
  if (actionRow.mayBroadSearchNow !== false) blockingReasons.push("action_would_broad_search_now");
  if (actionRow.mayClassifySeasonStateNow !== false) blockingReasons.push("action_would_classify_now");
  if (actionRow.mayWriteCanonicalNow !== false) blockingReasons.push("action_would_write_canonical_now");
  if (actionRow.mayAssertTruthNow !== false) blockingReasons.push("action_would_assert_truth_now");

  const qualityGateStatus =
    blockingReasons.length === 0
      ? "passed_whole_map_resumption_action_bundle_quality_gate"
      : "blocked_whole_map_resumption_action_bundle_quality_gate";

  return {
    actionId: actionRow.actionId,
    actionType: actionRow.actionType,
    qualityGateStatus,
    blockingReasons,
    sourceCandidateType: actionRow.sourceCandidateType || null,
    sourceFilePath: actionRow.sourceFilePath || null,
    sourceFileSha256: actionRow.sourceFileSha256 || null,
    reusableFamilies: actionRow.reusableFamilies || [],
    competitionSlugs: actionRow.competitionSlugs || [],
    purpose: actionRow.purpose || null,

    mayBuildWholeMapResumptionExecutionPlan:
      qualityGateStatus === "passed_whole_map_resumption_action_bundle_quality_gate",
    qualityGateIsExecutionPermissionNow: false,
    qualityGateIsFetchPermissionNow: false,

    mayExecuteNow: false,
    mayFetchNow: false,
    maySearchNow: false,
    mayBroadSearchNow: false,
    mayClassifySeasonStateNow: false,
    mayWriteCanonicalNow: false,
    mayAssertTruthNow: false,

    fetchExecutedNow: false,
    searchExecutedNow: false,
    broadSearchExecutedNow: false,
    classifierExecutedNow: false,
    canonicalWriteExecutedNow: false,
    productionWriteExecutedNow: false,
    activeAssertedNow: false,
    inactiveAssertedNow: false,
    completedAssertedNow: false,
    seasonStateTruthAssertedNow: false,
    qualityGateRowIsTruth: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    nextAllowedStep:
      qualityGateStatus === "passed_whole_map_resumption_action_bundle_quality_gate"
        ? "build_whole_map_resumption_execution_plan"
        : "repair_whole_map_resumption_action_bundle",
    nextBlockedStep: "execution_fetch_search_classifier_canonical_write_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const bundle = readJson(args.bundleInput);
  const actionRows = validateBundle(bundle);

  const qualityGateRows = actionRows
    .map(buildGateRow)
    .sort((a, b) => a.actionType.localeCompare(b.actionType) || a.actionId.localeCompare(b.actionId));

  const passedRows = qualityGateRows.filter((row) => row.qualityGateStatus === "passed_whole_map_resumption_action_bundle_quality_gate");
  const blockedRows = qualityGateRows.filter((row) => row.qualityGateStatus !== "passed_whole_map_resumption_action_bundle_quality_gate");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "run-football-truth-whole-map-resumption-action-bundle-quality-gate-file",
    mode: "no_write_whole_map_resumption_action_bundle_quality_gate",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      wholeMapResumptionActionBundle: args.bundleInput
    },
    summary: {
      actionBundleReadCount: 1,
      wholeMapResumptionActionBundleQualityGateRowCount: qualityGateRows.length,
      wholeMapResumptionActionBundleQualityGatePassedCount: passedRows.length,
      wholeMapResumptionActionBundleQualityGateBlockedCount: blockedRows.length,

      wholeMapResumePrimaryManifestQualityGatedCount:
        qualityGateRows.filter((row) => row.actionType === "whole_map_resume_primary_manifest").length,
      wholeMapAttachFollowupQualityGatedPackQualityGatedCount:
        qualityGateRows.filter((row) => row.actionType === "whole_map_attach_followup_quality_gated_pack").length,
      wholeMapAttachActiveWorkstreamExecutionWaveQualityGatedCount:
        qualityGateRows.filter((row) => row.actionType === "whole_map_attach_active_workstream_execution_wave").length,
      reusableFamilyPromotionQualityGatedCount:
        qualityGateRows.filter((row) => row.actionType === "promote_reusable_family_patterns_to_full_map").length,
      providerFamilyRepairDeferredQualityGatedCount:
        qualityGateRows.filter((row) => row.actionType === "defer_provider_family_repair_backlog").length,

      laligaReusablePatternQualityGatedCount:
        qualityGateRows.filter((row) => (row.reusableFamilies || []).includes("laliga")).length,
      norwayNtfReusablePatternQualityGatedCount:
        qualityGateRows.filter((row) => (row.reusableFamilies || []).includes("norway_ntf")).length,
      sportomediaProviderFamilyRepairDeferredQualityGatedCount:
        qualityGateRows.filter((row) => (row.reusableFamilies || []).includes("sportomedia")).length,
      sportomediaBlocksWholeMapCount: 0,

      mayBuildWholeMapResumptionExecutionPlanCount:
        blockedRows.length === 0 ? 1 : 0,

      qualityGateIsExecutionPermissionNowCount:
        qualityGateRows.filter((row) => row.qualityGateIsExecutionPermissionNow).length,
      qualityGateIsFetchPermissionNowCount:
        qualityGateRows.filter((row) => row.qualityGateIsFetchPermissionNow).length,

      mayExecuteNowCount: 0,
      mayFetchNowCount: 0,
      maySearchNowCount: 0,
      mayBroadSearchNowCount: 0,
      mayClassifySeasonStateNowCount: 0,
      mayWriteCanonicalNowCount: 0,
      mayAssertTruthNowCount: 0,

      fetchExecutedNowCount: 0,
      searchExecutedNowCount: 0,
      broadSearchExecutedNowCount: 0,
      classifierExecutedNowCount: 0,
      canonicalWriteExecutedNowCount: 0,
      productionWriteExecutedNowCount: 0,
      activeAssertedCount: 0,
      inactiveAssertedCount: 0,
      completedAssertedCount: 0,
      seasonStateTruthAssertedCount: 0,
      wholeMapResumptionActionBundleQualityGateTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        blockedRows.length === 0
          ? "build_whole_map_resumption_execution_plan"
          : "repair_whole_map_resumption_action_bundle"
    },
    counts: {
      byActionType: countBy(qualityGateRows, "actionType"),
      byQualityGateStatus: countBy(qualityGateRows, "qualityGateStatus"),
      byNextAllowedStep: countBy(qualityGateRows, "nextAllowedStep")
    },
    wholeMapResumptionPolicy: {
      resumeWholeMapNow: true,
      sportomediaBlocksWholeMap: false,
      sportomediaDisposition: "provider_family_repair_backlog",
      preservedReusableFamilyWins: ["laliga", "norway_ntf"],
      nextAction: "build_whole_map_resumption_execution_plan",
      noProviderMicroProbingInMainLane: true,
      noExecutionUntilFutureExplicitRunnerGate: true,
      noFetchUntilFutureExplicitRunnerGate: true,
      noSearchUntilFutureExplicitApproval: true,
      noCanonicalWritesUntilFutureExplicitApproval: true,
      noProductionWritesUntilFutureExplicitApproval: true,
      noTruthAssertionsUntilFutureEvidenceGate: true
    },
    guardrails: [
      "This quality gate reads the whole-map resumption action bundle only.",
      "It does not execute the action bundle.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Quality gate rows are workflow routing artifacts, not truth assertions.",
      "Passing this gate only allows building a whole-map resumption execution plan.",
      "Passing this gate does not allow execution or fetch now.",
      "Sportomedia remains in provider-family repair backlog and does not block the full-map main lane."
    ],
    qualityGateRows,
    blockedRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    actionBundleReadCount: output.summary.actionBundleReadCount,
    wholeMapResumptionActionBundleQualityGateRowCount: output.summary.wholeMapResumptionActionBundleQualityGateRowCount,
    wholeMapResumptionActionBundleQualityGatePassedCount: output.summary.wholeMapResumptionActionBundleQualityGatePassedCount,
    wholeMapResumptionActionBundleQualityGateBlockedCount: output.summary.wholeMapResumptionActionBundleQualityGateBlockedCount,
    wholeMapResumePrimaryManifestQualityGatedCount: output.summary.wholeMapResumePrimaryManifestQualityGatedCount,
    wholeMapAttachFollowupQualityGatedPackQualityGatedCount: output.summary.wholeMapAttachFollowupQualityGatedPackQualityGatedCount,
    wholeMapAttachActiveWorkstreamExecutionWaveQualityGatedCount: output.summary.wholeMapAttachActiveWorkstreamExecutionWaveQualityGatedCount,
    reusableFamilyPromotionQualityGatedCount: output.summary.reusableFamilyPromotionQualityGatedCount,
    providerFamilyRepairDeferredQualityGatedCount: output.summary.providerFamilyRepairDeferredQualityGatedCount,
    laligaReusablePatternQualityGatedCount: output.summary.laligaReusablePatternQualityGatedCount,
    norwayNtfReusablePatternQualityGatedCount: output.summary.norwayNtfReusablePatternQualityGatedCount,
    sportomediaProviderFamilyRepairDeferredQualityGatedCount: output.summary.sportomediaProviderFamilyRepairDeferredQualityGatedCount,
    sportomediaBlocksWholeMapCount: output.summary.sportomediaBlocksWholeMapCount,
    mayBuildWholeMapResumptionExecutionPlanCount: output.summary.mayBuildWholeMapResumptionExecutionPlanCount,
    qualityGateIsExecutionPermissionNowCount: output.summary.qualityGateIsExecutionPermissionNowCount,
    qualityGateIsFetchPermissionNowCount: output.summary.qualityGateIsFetchPermissionNowCount,
    mayExecuteNowCount: output.summary.mayExecuteNowCount,
    mayFetchNowCount: output.summary.mayFetchNowCount,
    maySearchNowCount: output.summary.maySearchNowCount,
    mayBroadSearchNowCount: output.summary.mayBroadSearchNowCount,
    mayClassifySeasonStateNowCount: output.summary.mayClassifySeasonStateNowCount,
    mayWriteCanonicalNowCount: output.summary.mayWriteCanonicalNowCount,
    mayAssertTruthNowCount: output.summary.mayAssertTruthNowCount,
    fetchExecutedNowCount: output.summary.fetchExecutedNowCount,
    searchExecutedNowCount: output.summary.searchExecutedNowCount,
    broadSearchExecutedNowCount: output.summary.broadSearchExecutedNowCount,
    classifierExecutedNowCount: output.summary.classifierExecutedNowCount,
    canonicalWriteExecutedNowCount: output.summary.canonicalWriteExecutedNowCount,
    productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
    seasonStateTruthAssertedCount: output.summary.seasonStateTruthAssertedCount,
    wholeMapResumptionActionBundleQualityGateTruthCount: output.summary.wholeMapResumptionActionBundleQualityGateTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
