#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULTS = {
  date: "2026-06-14",
  gateInput: "data/football-truth/_diagnostics/whole-map-resumption-runner-manifest-quality-gate-2026-06-14/whole-map-resumption-runner-manifest-quality-gate-2026-06-14.json",
  output: "data/football-truth/_diagnostics/whole-map-resumption-execution-runner-2026-06-14/whole-map-resumption-execution-runner-2026-06-14.json"
};

const REQUIRED_PLAN_STEPS = [
  "bind_primary_batch_runner_manifest",
  "attach_followup_quality_gated_work_queue",
  "attach_active_workstream_execution_wave_context",
  "promote_reusable_family_patterns",
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
  if (!(key in summary)) throw new Error("Missing manifest quality gate summary key: " + key);
  if (summary[key] !== expected) {
    throw new Error(`Manifest quality gate guardrail failed for ${key}: expected ${expected}, got ${summary[key]}`);
  }
}

function validateManifestQualityGate(gate) {
  const s = gate.summary || {};

  assertSummary(s, "runnerManifestReadCount", 1);
  assertSummary(s, "wholeMapResumptionRunnerManifestQualityGateRowCount", 5);
  assertSummary(s, "wholeMapResumptionRunnerManifestQualityGatePassedCount", 5);
  assertSummary(s, "wholeMapResumptionRunnerManifestQualityGateBlockedCount", 0);
  assertSummary(s, "primaryBatchRunnerManifestQualityGatedCount", 1);
  assertSummary(s, "followupLaneQualityGatedPackManifestQualityGatedCount", 1);
  assertSummary(s, "activeWorkstreamExecutionWaveManifestQualityGatedCount", 1);
  assertSummary(s, "reusableFamilyPromotionManifestQualityGatedCount", 1);
  assertSummary(s, "providerFamilyRepairDeferredManifestQualityGatedCount", 1);
  assertSummary(s, "laligaReusablePatternManifestQualityGatedCount", 1);
  assertSummary(s, "norwayNtfReusablePatternManifestQualityGatedCount", 1);
  assertSummary(s, "sportomediaProviderFamilyRepairDeferredManifestQualityGatedCount", 1);
  assertSummary(s, "sportomediaBlocksWholeMapCount", 0);
  assertSummary(s, "runnerManifestCompleteCount", 5);
  assertSummary(s, "runnerManifestBuiltCount", 5);
  assertSummary(s, "mayBuildWholeMapResumptionExecutionRunnerCount", 1);
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
  assertSummary(s, "wholeMapResumptionRunnerManifestQualityGateTruthCount", 0);
  assertSummary(s, "canonicalWrites", 0);
  if (s.productionWrite !== false) throw new Error("Manifest quality gate productionWrite must be false.");

  const rows = Array.isArray(gate.qualityGateRows) ? gate.qualityGateRows : [];
  if (rows.length !== 5) throw new Error("Expected 5 manifest quality gate rows.");

  const steps = new Set(rows.map((row) => row.executionPlanStep));
  for (const step of REQUIRED_PLAN_STEPS) {
    if (!steps.has(step)) throw new Error("Missing required quality-gated plan step: " + step);
  }

  for (const row of rows) {
    if (row.qualityGateStatus !== "passed_whole_map_resumption_runner_manifest_quality_gate") {
      throw new Error(row.manifestEntryId + ": manifest quality gate did not pass.");
    }
    if (row.mayBuildWholeMapResumptionExecutionRunner !== true) {
      throw new Error(row.manifestEntryId + ": mayBuildWholeMapResumptionExecutionRunner must be true.");
    }
    if (row.qualityGateIsExecutionPermissionNow !== false) throw new Error(row.manifestEntryId + ": execution permission must be false.");
    if (row.qualityGateIsFetchPermissionNow !== false) throw new Error(row.manifestEntryId + ": fetch permission must be false.");
    if (row.mayExecuteNow !== false) throw new Error(row.manifestEntryId + ": mayExecuteNow must be false.");
    if (row.mayFetchNow !== false) throw new Error(row.manifestEntryId + ": mayFetchNow must be false.");
    if (row.maySearchNow !== false) throw new Error(row.manifestEntryId + ": maySearchNow must be false.");
    if (row.mayBroadSearchNow !== false) throw new Error(row.manifestEntryId + ": mayBroadSearchNow must be false.");
    if (row.mayClassifySeasonStateNow !== false) throw new Error(row.manifestEntryId + ": mayClassifySeasonStateNow must be false.");
    if (row.mayWriteCanonicalNow !== false) throw new Error(row.manifestEntryId + ": mayWriteCanonicalNow must be false.");
    if (row.mayAssertTruthNow !== false) throw new Error(row.manifestEntryId + ": mayAssertTruthNow must be false.");
  }

  return rows;
}

function buildRunnerTarget(row) {
  const actionTypeToRunnerStage = {
    whole_map_resume_primary_manifest: "primary_manifest_binding",
    whole_map_attach_followup_quality_gated_pack: "followup_quality_gated_queue_binding",
    whole_map_attach_active_workstream_execution_wave: "active_workstream_execution_wave_binding",
    promote_reusable_family_patterns_to_full_map: "reusable_family_pattern_promotion_binding",
    defer_provider_family_repair_backlog: "provider_family_repair_backlog_deferral_binding"
  };

  return {
    runnerTargetId: `whole-map-resumption-runner:${row.executionPlanStep}`,
    manifestEntryId: row.manifestEntryId,
    actionId: row.actionId,
    actionType: row.actionType,
    executionPlanStep: row.executionPlanStep,
    runnerStage: actionTypeToRunnerStage[row.actionType] || "unknown_runner_stage",
    runnerTargetStatus: "ready_for_whole_map_resumption_execution_runner_quality_gate",

    sourceCandidateType: row.sourceCandidateType || null,
    sourceFilePath: row.sourceFilePath || null,
    sourceFileSha256: row.sourceFileSha256 || null,
    reusableFamilies: row.reusableFamilies || [],
    competitionSlugs: row.competitionSlugs || [],
    purpose: row.purpose || null,

    runnerArtifactBuilt: true,
    runnerArtifactComplete: true,
    runnerScope: "whole_map_resumption_main_lane",
    runnerMode: "artifact_only_no_execution",
    sportomediaDisposition: (row.reusableFamilies || []).includes("sportomedia")
      ? "provider_family_repair_backlog_deferred_not_main_lane_blocker"
      : null,

    mayProceedToWholeMapResumptionExecutionRunnerQualityGate: true,
    executionRunnerIsExecutionPermissionNow: false,
    executionRunnerIsFetchPermissionNow: false,
    nextExecutionRunnerMayAllowActualExecutionAfterFutureFinalApproval: true,

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
    executionRunnerRowIsTruth: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    nextAllowedStep: "run_whole_map_resumption_execution_runner_quality_gate",
    nextBlockedStep: "actual_execution_fetch_search_classifier_canonical_write_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const gate = readJson(args.gateInput);
  const gateRows = validateManifestQualityGate(gate);

  const runnerTargets = gateRows
    .map(buildRunnerTarget)
    .sort((a, b) => a.executionPlanStep.localeCompare(b.executionPlanStep) || a.runnerTargetId.localeCompare(b.runnerTargetId));

  const blockedRows = runnerTargets.filter((row) => row.runnerTargetStatus !== "ready_for_whole_map_resumption_execution_runner_quality_gate");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-whole-map-resumption-execution-runner-file",
    mode: "no_write_whole_map_resumption_execution_runner_artifact_from_manifest_quality_gate",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      wholeMapResumptionRunnerManifestQualityGate: args.gateInput
    },
    summary: {
      runnerManifestQualityGateReadCount: 1,
      wholeMapResumptionExecutionRunnerTargetCount: runnerTargets.length,
      wholeMapResumptionExecutionRunnerReadyCount:
        runnerTargets.filter((row) => row.runnerTargetStatus === "ready_for_whole_map_resumption_execution_runner_quality_gate").length,
      wholeMapResumptionExecutionRunnerBlockedCount: blockedRows.length,

      primaryBatchRunnerTargetCount:
        runnerTargets.filter((row) => row.runnerStage === "primary_manifest_binding").length,
      followupLaneQualityGatedPackRunnerTargetCount:
        runnerTargets.filter((row) => row.runnerStage === "followup_quality_gated_queue_binding").length,
      activeWorkstreamExecutionWaveRunnerTargetCount:
        runnerTargets.filter((row) => row.runnerStage === "active_workstream_execution_wave_binding").length,
      reusableFamilyPromotionRunnerTargetCount:
        runnerTargets.filter((row) => row.runnerStage === "reusable_family_pattern_promotion_binding").length,
      providerFamilyRepairDeferredRunnerTargetCount:
        runnerTargets.filter((row) => row.runnerStage === "provider_family_repair_backlog_deferral_binding").length,

      laligaReusablePatternRunnerTargetCount:
        runnerTargets.filter((row) => (row.reusableFamilies || []).includes("laliga")).length,
      norwayNtfReusablePatternRunnerTargetCount:
        runnerTargets.filter((row) => (row.reusableFamilies || []).includes("norway_ntf")).length,
      sportomediaProviderFamilyRepairDeferredRunnerTargetCount:
        runnerTargets.filter((row) => (row.reusableFamilies || []).includes("sportomedia")).length,
      sportomediaBlocksWholeMapCount: 0,

      runnerArtifactBuiltCount: runnerTargets.filter((row) => row.runnerArtifactBuilt).length,
      runnerArtifactCompleteCount: runnerTargets.filter((row) => row.runnerArtifactComplete).length,
      mayProceedToWholeMapResumptionExecutionRunnerQualityGateCount:
        blockedRows.length === 0 ? 1 : 0,

      executionRunnerIsExecutionPermissionNowCount:
        runnerTargets.filter((row) => row.executionRunnerIsExecutionPermissionNow).length,
      executionRunnerIsFetchPermissionNowCount:
        runnerTargets.filter((row) => row.executionRunnerIsFetchPermissionNow).length,
      nextExecutionRunnerMayAllowActualExecutionAfterFutureFinalApprovalCount:
        runnerTargets.filter((row) => row.nextExecutionRunnerMayAllowActualExecutionAfterFutureFinalApproval).length,

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
      wholeMapResumptionExecutionRunnerTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        blockedRows.length === 0
          ? "run_whole_map_resumption_execution_runner_quality_gate"
          : "repair_whole_map_resumption_execution_runner"
    },
    counts: {
      byActionType: countBy(runnerTargets, "actionType"),
      byExecutionPlanStep: countBy(runnerTargets, "executionPlanStep"),
      byRunnerStage: countBy(runnerTargets, "runnerStage"),
      byRunnerTargetStatus: countBy(runnerTargets, "runnerTargetStatus"),
      byNextAllowedStep: countBy(runnerTargets, "nextAllowedStep")
    },
    wholeMapResumptionPolicy: {
      resumeWholeMapNow: true,
      sportomediaBlocksWholeMap: false,
      sportomediaDisposition: "provider_family_repair_backlog",
      preservedReusableFamilyWins: ["laliga", "norway_ntf"],
      nextAction: "run_whole_map_resumption_execution_runner_quality_gate",
      noProviderMicroProbingInMainLane: true,
      runnerArtifactIsNotExecution: true,
      noExecutionUntilFutureExplicitFinalApproval: true,
      noFetchUntilFutureExplicitFinalApproval: true,
      noSearchUntilFutureExplicitApproval: true,
      noCanonicalWritesUntilFutureExplicitApproval: true,
      noProductionWritesUntilFutureExplicitApproval: true,
      noTruthAssertionsUntilFutureEvidenceGate: true
    },
    guardrails: [
      "This job builds a whole-map resumption execution runner artifact only.",
      "It does not run the execution runner.",
      "It does not execute.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Execution runner target rows are workflow routing artifacts, not truth assertions.",
      "Passing this artifact only allows running an execution runner quality gate.",
      "It does not allow execution or fetch now.",
      "Sportomedia remains in provider-family repair backlog and does not block the full-map main lane."
    ],
    runnerTargets,
    blockedRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    runnerManifestQualityGateReadCount: output.summary.runnerManifestQualityGateReadCount,
    wholeMapResumptionExecutionRunnerTargetCount: output.summary.wholeMapResumptionExecutionRunnerTargetCount,
    wholeMapResumptionExecutionRunnerReadyCount: output.summary.wholeMapResumptionExecutionRunnerReadyCount,
    wholeMapResumptionExecutionRunnerBlockedCount: output.summary.wholeMapResumptionExecutionRunnerBlockedCount,
    primaryBatchRunnerTargetCount: output.summary.primaryBatchRunnerTargetCount,
    followupLaneQualityGatedPackRunnerTargetCount: output.summary.followupLaneQualityGatedPackRunnerTargetCount,
    activeWorkstreamExecutionWaveRunnerTargetCount: output.summary.activeWorkstreamExecutionWaveRunnerTargetCount,
    reusableFamilyPromotionRunnerTargetCount: output.summary.reusableFamilyPromotionRunnerTargetCount,
    providerFamilyRepairDeferredRunnerTargetCount: output.summary.providerFamilyRepairDeferredRunnerTargetCount,
    laligaReusablePatternRunnerTargetCount: output.summary.laligaReusablePatternRunnerTargetCount,
    norwayNtfReusablePatternRunnerTargetCount: output.summary.norwayNtfReusablePatternRunnerTargetCount,
    sportomediaProviderFamilyRepairDeferredRunnerTargetCount: output.summary.sportomediaProviderFamilyRepairDeferredRunnerTargetCount,
    sportomediaBlocksWholeMapCount: output.summary.sportomediaBlocksWholeMapCount,
    runnerArtifactBuiltCount: output.summary.runnerArtifactBuiltCount,
    runnerArtifactCompleteCount: output.summary.runnerArtifactCompleteCount,
    mayProceedToWholeMapResumptionExecutionRunnerQualityGateCount: output.summary.mayProceedToWholeMapResumptionExecutionRunnerQualityGateCount,
    executionRunnerIsExecutionPermissionNowCount: output.summary.executionRunnerIsExecutionPermissionNowCount,
    executionRunnerIsFetchPermissionNowCount: output.summary.executionRunnerIsFetchPermissionNowCount,
    nextExecutionRunnerMayAllowActualExecutionAfterFutureFinalApprovalCount: output.summary.nextExecutionRunnerMayAllowActualExecutionAfterFutureFinalApprovalCount,
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
    wholeMapResumptionExecutionRunnerTruthCount: output.summary.wholeMapResumptionExecutionRunnerTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
