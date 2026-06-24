#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULTS = {
  date: "2026-06-14",
  gateInput: "data/football-truth/_diagnostics/whole-map-resumption-action-bundle-quality-gate-2026-06-14/whole-map-resumption-action-bundle-quality-gate-2026-06-14.json",
  output: "data/football-truth/_diagnostics/whole-map-resumption-execution-plan-2026-06-14/whole-map-resumption-execution-plan-2026-06-14.json"
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
    else if (arg === "--gate-input") args.gateInput = argv[++i];
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
  if (!(key in summary)) throw new Error("Missing quality gate summary key: " + key);
  if (summary[key] !== expected) {
    throw new Error(`Quality gate guardrail failed for ${key}: expected ${expected}, got ${summary[key]}`);
  }
}

function validateQualityGate(gate) {
  const s = gate.summary || {};

  assertSummary(s, "actionBundleReadCount", 1);
  assertSummary(s, "wholeMapResumptionActionBundleQualityGateRowCount", 5);
  assertSummary(s, "wholeMapResumptionActionBundleQualityGatePassedCount", 5);
  assertSummary(s, "wholeMapResumptionActionBundleQualityGateBlockedCount", 0);
  assertSummary(s, "wholeMapResumePrimaryManifestQualityGatedCount", 1);
  assertSummary(s, "wholeMapAttachFollowupQualityGatedPackQualityGatedCount", 1);
  assertSummary(s, "wholeMapAttachActiveWorkstreamExecutionWaveQualityGatedCount", 1);
  assertSummary(s, "reusableFamilyPromotionQualityGatedCount", 1);
  assertSummary(s, "providerFamilyRepairDeferredQualityGatedCount", 1);
  assertSummary(s, "laligaReusablePatternQualityGatedCount", 1);
  assertSummary(s, "norwayNtfReusablePatternQualityGatedCount", 1);
  assertSummary(s, "sportomediaProviderFamilyRepairDeferredQualityGatedCount", 1);
  assertSummary(s, "sportomediaBlocksWholeMapCount", 0);
  assertSummary(s, "mayBuildWholeMapResumptionExecutionPlanCount", 1);
  assertSummary(s, "qualityGateIsExecutionPermissionNowCount", 0);
  assertSummary(s, "qualityGateIsFetchPermissionNowCount", 0);

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
  assertSummary(s, "wholeMapResumptionActionBundleQualityGateTruthCount", 0);
  assertSummary(s, "canonicalWrites", 0);
  if (s.productionWrite !== false) throw new Error("Quality gate productionWrite must be false.");

  const rows = Array.isArray(gate.qualityGateRows) ? gate.qualityGateRows : [];
  if (rows.length !== 5) throw new Error("Expected 5 qualityGateRows.");

  const types = new Set(rows.map((row) => row.actionType));
  for (const type of REQUIRED_ACTION_TYPES) {
    if (!types.has(type)) throw new Error("Missing required action type in quality gate rows: " + type);
  }

  for (const row of rows) {
    if (row.qualityGateStatus !== "passed_whole_map_resumption_action_bundle_quality_gate") {
      throw new Error(row.actionId + ": quality gate row did not pass.");
    }
    if (row.mayBuildWholeMapResumptionExecutionPlan !== true) {
      throw new Error(row.actionId + ": mayBuildWholeMapResumptionExecutionPlan must be true.");
    }
    if (row.qualityGateIsExecutionPermissionNow !== false) throw new Error(row.actionId + ": execution permission must be false now.");
    if (row.qualityGateIsFetchPermissionNow !== false) throw new Error(row.actionId + ": fetch permission must be false now.");
    if (row.mayExecuteNow !== false) throw new Error(row.actionId + ": mayExecuteNow must be false.");
    if (row.mayFetchNow !== false) throw new Error(row.actionId + ": mayFetchNow must be false.");
    if (row.maySearchNow !== false) throw new Error(row.actionId + ": maySearchNow must be false.");
    if (row.mayBroadSearchNow !== false) throw new Error(row.actionId + ": mayBroadSearchNow must be false.");
    if (row.mayClassifySeasonStateNow !== false) throw new Error(row.actionId + ": mayClassifySeasonStateNow must be false.");
    if (row.mayWriteCanonicalNow !== false) throw new Error(row.actionId + ": mayWriteCanonicalNow must be false.");
    if (row.mayAssertTruthNow !== false) throw new Error(row.actionId + ": mayAssertTruthNow must be false.");
  }

  return rows;
}

function buildExecutionPlanRow(row) {
  const planStatus = "ready_for_whole_map_resumption_runner_manifest_build";

  let executionPlanStep;
  if (row.actionType === "whole_map_resume_primary_manifest") {
    executionPlanStep = "bind_primary_batch_runner_manifest";
  } else if (row.actionType === "whole_map_attach_followup_quality_gated_pack") {
    executionPlanStep = "attach_followup_quality_gated_work_queue";
  } else if (row.actionType === "whole_map_attach_active_workstream_execution_wave") {
    executionPlanStep = "attach_active_workstream_execution_wave_context";
  } else if (row.actionType === "promote_reusable_family_patterns_to_full_map") {
    executionPlanStep = "promote_reusable_family_patterns";
  } else if (row.actionType === "defer_provider_family_repair_backlog") {
    executionPlanStep = "defer_provider_family_repair_backlog";
  } else {
    executionPlanStep = "unknown_action_type";
  }

  return {
    actionId: row.actionId,
    actionType: row.actionType,
    executionPlanStep,
    executionPlanStatus: planStatus,
    sourceCandidateType: row.sourceCandidateType || null,
    sourceFilePath: row.sourceFilePath || null,
    sourceFileSha256: row.sourceFileSha256 || null,
    reusableFamilies: row.reusableFamilies || [],
    competitionSlugs: row.competitionSlugs || [],
    purpose: row.purpose || null,

    qualityGateStatus: row.qualityGateStatus,
    qualityGateAllowsPlanBuild: row.mayBuildWholeMapResumptionExecutionPlan === true,

    mayBuildWholeMapResumptionRunnerManifest: true,
    executionPlanIsExecutionPermissionNow: false,
    executionPlanIsFetchPermissionNow: false,

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
    executionPlanRowIsTruth: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    nextAllowedStep: "build_whole_map_resumption_runner_manifest",
    nextBlockedStep: "execution_fetch_search_classifier_canonical_write_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const gate = readJson(args.gateInput);
  const qualityGateRows = validateQualityGate(gate);

  const executionPlanRows = qualityGateRows
    .map(buildExecutionPlanRow)
    .sort((a, b) => a.executionPlanStep.localeCompare(b.executionPlanStep) || a.actionId.localeCompare(b.actionId));

  const blockedRows = executionPlanRows.filter((row) => row.executionPlanStatus !== "ready_for_whole_map_resumption_runner_manifest_build");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-whole-map-resumption-execution-plan-file",
    mode: "no_write_whole_map_resumption_execution_plan_from_action_bundle_quality_gate",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      wholeMapResumptionActionBundleQualityGate: args.gateInput
    },
    summary: {
      actionBundleQualityGateReadCount: 1,
      wholeMapResumptionExecutionPlanRowCount: executionPlanRows.length,
      wholeMapResumptionExecutionPlanReadyCount:
        executionPlanRows.filter((row) => row.executionPlanStatus === "ready_for_whole_map_resumption_runner_manifest_build").length,
      wholeMapResumptionExecutionPlanBlockedCount: blockedRows.length,

      primaryBatchRunnerManifestPlanCount:
        executionPlanRows.filter((row) => row.actionType === "whole_map_resume_primary_manifest").length,
      followupLaneQualityGatedPackPlanCount:
        executionPlanRows.filter((row) => row.actionType === "whole_map_attach_followup_quality_gated_pack").length,
      activeWorkstreamExecutionWavePlanCount:
        executionPlanRows.filter((row) => row.actionType === "whole_map_attach_active_workstream_execution_wave").length,
      reusableFamilyPromotionPlanCount:
        executionPlanRows.filter((row) => row.actionType === "promote_reusable_family_patterns_to_full_map").length,
      providerFamilyRepairDeferredPlanCount:
        executionPlanRows.filter((row) => row.actionType === "defer_provider_family_repair_backlog").length,

      laligaReusablePatternPlanCount:
        executionPlanRows.filter((row) => (row.reusableFamilies || []).includes("laliga")).length,
      norwayNtfReusablePatternPlanCount:
        executionPlanRows.filter((row) => (row.reusableFamilies || []).includes("norway_ntf")).length,
      sportomediaProviderFamilyRepairDeferredPlanCount:
        executionPlanRows.filter((row) => (row.reusableFamilies || []).includes("sportomedia")).length,
      sportomediaBlocksWholeMapCount: 0,

      mayBuildWholeMapResumptionRunnerManifestCount:
        blockedRows.length === 0 ? 1 : 0,

      executionPlanIsExecutionPermissionNowCount:
        executionPlanRows.filter((row) => row.executionPlanIsExecutionPermissionNow).length,
      executionPlanIsFetchPermissionNowCount:
        executionPlanRows.filter((row) => row.executionPlanIsFetchPermissionNow).length,

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
      wholeMapResumptionExecutionPlanTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        blockedRows.length === 0
          ? "build_whole_map_resumption_runner_manifest"
          : "repair_whole_map_resumption_execution_plan"
    },
    counts: {
      byActionType: countBy(executionPlanRows, "actionType"),
      byExecutionPlanStep: countBy(executionPlanRows, "executionPlanStep"),
      byExecutionPlanStatus: countBy(executionPlanRows, "executionPlanStatus"),
      byNextAllowedStep: countBy(executionPlanRows, "nextAllowedStep")
    },
    wholeMapResumptionPolicy: {
      resumeWholeMapNow: true,
      sportomediaBlocksWholeMap: false,
      sportomediaDisposition: "provider_family_repair_backlog",
      preservedReusableFamilyWins: ["laliga", "norway_ntf"],
      nextAction: "build_whole_map_resumption_runner_manifest",
      noProviderMicroProbingInMainLane: true,
      noExecutionUntilFutureExplicitRunnerGate: true,
      noFetchUntilFutureExplicitRunnerGate: true,
      noSearchUntilFutureExplicitApproval: true,
      noCanonicalWritesUntilFutureExplicitApproval: true,
      noProductionWritesUntilFutureExplicitApproval: true,
      noTruthAssertionsUntilFutureEvidenceGate: true
    },
    guardrails: [
      "This execution plan reads the whole-map resumption action bundle quality gate only.",
      "It does not build or run a runner.",
      "It does not execute.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Execution plan rows are workflow routing artifacts, not truth assertions.",
      "Passing this plan only allows building a whole-map resumption runner manifest.",
      "It does not allow execution or fetch now.",
      "Sportomedia remains in provider-family repair backlog and does not block the full-map main lane."
    ],
    executionPlanRows,
    blockedRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    actionBundleQualityGateReadCount: output.summary.actionBundleQualityGateReadCount,
    wholeMapResumptionExecutionPlanRowCount: output.summary.wholeMapResumptionExecutionPlanRowCount,
    wholeMapResumptionExecutionPlanReadyCount: output.summary.wholeMapResumptionExecutionPlanReadyCount,
    wholeMapResumptionExecutionPlanBlockedCount: output.summary.wholeMapResumptionExecutionPlanBlockedCount,
    primaryBatchRunnerManifestPlanCount: output.summary.primaryBatchRunnerManifestPlanCount,
    followupLaneQualityGatedPackPlanCount: output.summary.followupLaneQualityGatedPackPlanCount,
    activeWorkstreamExecutionWavePlanCount: output.summary.activeWorkstreamExecutionWavePlanCount,
    reusableFamilyPromotionPlanCount: output.summary.reusableFamilyPromotionPlanCount,
    providerFamilyRepairDeferredPlanCount: output.summary.providerFamilyRepairDeferredPlanCount,
    laligaReusablePatternPlanCount: output.summary.laligaReusablePatternPlanCount,
    norwayNtfReusablePatternPlanCount: output.summary.norwayNtfReusablePatternPlanCount,
    sportomediaProviderFamilyRepairDeferredPlanCount: output.summary.sportomediaProviderFamilyRepairDeferredPlanCount,
    sportomediaBlocksWholeMapCount: output.summary.sportomediaBlocksWholeMapCount,
    mayBuildWholeMapResumptionRunnerManifestCount: output.summary.mayBuildWholeMapResumptionRunnerManifestCount,
    executionPlanIsExecutionPermissionNowCount: output.summary.executionPlanIsExecutionPermissionNowCount,
    executionPlanIsFetchPermissionNowCount: output.summary.executionPlanIsFetchPermissionNowCount,
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
    wholeMapResumptionExecutionPlanTruthCount: output.summary.wholeMapResumptionExecutionPlanTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
