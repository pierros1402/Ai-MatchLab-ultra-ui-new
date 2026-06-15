#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULTS = {
  date: "2026-06-14",
  runnerInput: "data/football-truth/_diagnostics/whole-map-resumption-execution-runner-2026-06-14/whole-map-resumption-execution-runner-2026-06-14.json",
  output: "data/football-truth/_diagnostics/whole-map-resumption-execution-runner-quality-gate-2026-06-14/whole-map-resumption-execution-runner-quality-gate-2026-06-14.json"
};

const REQUIRED_RUNNER_STAGES = [
  "primary_manifest_binding",
  "followup_quality_gated_queue_binding",
  "active_workstream_execution_wave_binding",
  "reusable_family_pattern_promotion_binding",
  "provider_family_repair_backlog_deferral_binding"
];

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--runner-input") args.runnerInput = argv[++i];
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
  if (!(key in summary)) throw new Error("Missing execution runner summary key: " + key);
  if (summary[key] !== expected) {
    throw new Error(`Execution runner guardrail failed for ${key}: expected ${expected}, got ${summary[key]}`);
  }
}

function validateExecutionRunner(runner) {
  const s = runner.summary || {};

  assertSummary(s, "runnerManifestQualityGateReadCount", 1);
  assertSummary(s, "wholeMapResumptionExecutionRunnerTargetCount", 5);
  assertSummary(s, "wholeMapResumptionExecutionRunnerReadyCount", 5);
  assertSummary(s, "wholeMapResumptionExecutionRunnerBlockedCount", 0);
  assertSummary(s, "primaryBatchRunnerTargetCount", 1);
  assertSummary(s, "followupLaneQualityGatedPackRunnerTargetCount", 1);
  assertSummary(s, "activeWorkstreamExecutionWaveRunnerTargetCount", 1);
  assertSummary(s, "reusableFamilyPromotionRunnerTargetCount", 1);
  assertSummary(s, "providerFamilyRepairDeferredRunnerTargetCount", 1);
  assertSummary(s, "laligaReusablePatternRunnerTargetCount", 1);
  assertSummary(s, "norwayNtfReusablePatternRunnerTargetCount", 1);
  assertSummary(s, "sportomediaProviderFamilyRepairDeferredRunnerTargetCount", 1);
  assertSummary(s, "sportomediaBlocksWholeMapCount", 0);
  assertSummary(s, "runnerArtifactBuiltCount", 5);
  assertSummary(s, "runnerArtifactCompleteCount", 5);
  assertSummary(s, "mayProceedToWholeMapResumptionExecutionRunnerQualityGateCount", 1);
  assertSummary(s, "executionRunnerIsExecutionPermissionNowCount", 0);
  assertSummary(s, "executionRunnerIsFetchPermissionNowCount", 0);
  assertSummary(s, "nextExecutionRunnerMayAllowActualExecutionAfterFutureFinalApprovalCount", 5);

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
  assertSummary(s, "wholeMapResumptionExecutionRunnerTruthCount", 0);
  assertSummary(s, "canonicalWrites", 0);
  if (s.productionWrite !== false) throw new Error("Execution runner productionWrite must be false.");

  const rows = Array.isArray(runner.runnerTargets) ? runner.runnerTargets : [];
  if (rows.length !== 5) throw new Error("Expected 5 runnerTargets.");

  const stages = new Set(rows.map((row) => row.runnerStage));
  for (const stage of REQUIRED_RUNNER_STAGES) {
    if (!stages.has(stage)) throw new Error("Missing required runner stage: " + stage);
  }

  for (const row of rows) {
    if (row.runnerTargetStatus !== "ready_for_whole_map_resumption_execution_runner_quality_gate") {
      throw new Error(row.runnerTargetId + ": runner target not quality-gate ready.");
    }
    if (row.runnerArtifactBuilt !== true) throw new Error(row.runnerTargetId + ": runnerArtifactBuilt must be true.");
    if (row.runnerArtifactComplete !== true) throw new Error(row.runnerTargetId + ": runnerArtifactComplete must be true.");
    if (row.mayProceedToWholeMapResumptionExecutionRunnerQualityGate !== true) {
      throw new Error(row.runnerTargetId + ": mayProceedToWholeMapResumptionExecutionRunnerQualityGate must be true.");
    }
    if (row.executionRunnerIsExecutionPermissionNow !== false) throw new Error(row.runnerTargetId + ": execution permission must be false.");
    if (row.executionRunnerIsFetchPermissionNow !== false) throw new Error(row.runnerTargetId + ": fetch permission must be false.");
    if (row.nextExecutionRunnerMayAllowActualExecutionAfterFutureFinalApproval !== true) {
      throw new Error(row.runnerTargetId + ": future final approval eligibility must be true.");
    }
    if (row.mayExecuteNow !== false) throw new Error(row.runnerTargetId + ": mayExecuteNow must be false.");
    if (row.mayFetchNow !== false) throw new Error(row.runnerTargetId + ": mayFetchNow must be false.");
    if (row.maySearchNow !== false) throw new Error(row.runnerTargetId + ": maySearchNow must be false.");
    if (row.mayBroadSearchNow !== false) throw new Error(row.runnerTargetId + ": mayBroadSearchNow must be false.");
    if (row.mayClassifySeasonStateNow !== false) throw new Error(row.runnerTargetId + ": mayClassifySeasonStateNow must be false.");
    if (row.mayWriteCanonicalNow !== false) throw new Error(row.runnerTargetId + ": mayWriteCanonicalNow must be false.");
    if (row.mayAssertTruthNow !== false) throw new Error(row.runnerTargetId + ": mayAssertTruthNow must be false.");
  }

  return rows;
}

function buildQualityGateRow(target) {
  const blockingReasons = [];

  if (target.runnerTargetStatus !== "ready_for_whole_map_resumption_execution_runner_quality_gate") {
    blockingReasons.push("runner_target_not_quality_gate_ready");
  }
  if (target.runnerArtifactBuilt !== true) blockingReasons.push("runner_artifact_not_built");
  if (target.runnerArtifactComplete !== true) blockingReasons.push("runner_artifact_not_complete");
  if (target.mayProceedToWholeMapResumptionExecutionRunnerQualityGate !== true) {
    blockingReasons.push("runner_target_does_not_allow_quality_gate");
  }
  if (!REQUIRED_RUNNER_STAGES.includes(target.runnerStage)) {
    blockingReasons.push("unexpected_runner_stage");
  }

  if (target.executionRunnerIsExecutionPermissionNow !== false) blockingReasons.push("runner_is_execution_permission_now");
  if (target.executionRunnerIsFetchPermissionNow !== false) blockingReasons.push("runner_is_fetch_permission_now");
  if (target.mayExecuteNow !== false) blockingReasons.push("runner_would_execute_now");
  if (target.mayFetchNow !== false) blockingReasons.push("runner_would_fetch_now");
  if (target.maySearchNow !== false) blockingReasons.push("runner_would_search_now");
  if (target.mayBroadSearchNow !== false) blockingReasons.push("runner_would_broad_search_now");
  if (target.mayClassifySeasonStateNow !== false) blockingReasons.push("runner_would_classify_now");
  if (target.mayWriteCanonicalNow !== false) blockingReasons.push("runner_would_write_canonical_now");
  if (target.mayAssertTruthNow !== false) blockingReasons.push("runner_would_assert_truth_now");

  if (target.fetchExecutedNow !== false) blockingReasons.push("runner_fetched");
  if (target.searchExecutedNow !== false) blockingReasons.push("runner_searched");
  if (target.broadSearchExecutedNow !== false) blockingReasons.push("runner_broad_searched");
  if (target.classifierExecutedNow !== false) blockingReasons.push("runner_classified");
  if (target.canonicalWriteExecutedNow !== false) blockingReasons.push("runner_wrote_canonical");
  if (target.productionWriteExecutedNow !== false) blockingReasons.push("runner_wrote_production");
  if (target.seasonStateTruthAssertedNow !== false) blockingReasons.push("runner_asserted_truth");
  if (target.executionRunnerRowIsTruth !== false) blockingReasons.push("runner_row_marked_truth");

  const qualityGateStatus =
    blockingReasons.length === 0
      ? "passed_whole_map_resumption_execution_runner_quality_gate"
      : "blocked_whole_map_resumption_execution_runner_quality_gate";

  return {
    runnerTargetId: target.runnerTargetId,
    manifestEntryId: target.manifestEntryId,
    actionId: target.actionId,
    actionType: target.actionType,
    executionPlanStep: target.executionPlanStep,
    runnerStage: target.runnerStage,
    qualityGateStatus,
    blockingReasons,

    sourceCandidateType: target.sourceCandidateType || null,
    sourceFilePath: target.sourceFilePath || null,
    sourceFileSha256: target.sourceFileSha256 || null,
    reusableFamilies: target.reusableFamilies || [],
    competitionSlugs: target.competitionSlugs || [],
    sportomediaDisposition: target.sportomediaDisposition || null,
    purpose: target.purpose || null,

    runnerArtifactBuilt: target.runnerArtifactBuilt,
    runnerArtifactComplete: target.runnerArtifactComplete,

    mayPrepareWholeMapResumptionFinalExecutionApproval:
      qualityGateStatus === "passed_whole_map_resumption_execution_runner_quality_gate",
    qualityGateIsExecutionPermissionNow: false,
    qualityGateIsFetchPermissionNow: false,
    finalApprovalRequiredBeforeExecution: true,

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
    executionRunnerQualityGateRowIsTruth: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    nextAllowedStep:
      qualityGateStatus === "passed_whole_map_resumption_execution_runner_quality_gate"
        ? "prepare_final_explicit_whole_map_resumption_execution_approval_gate"
        : "repair_whole_map_resumption_execution_runner",
    nextBlockedStep: "actual_execution_fetch_search_classifier_canonical_write_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const runner = readJson(args.runnerInput);
  const runnerTargets = validateExecutionRunner(runner);

  const qualityGateRows = runnerTargets
    .map(buildQualityGateRow)
    .sort((a, b) => a.runnerStage.localeCompare(b.runnerStage) || a.runnerTargetId.localeCompare(b.runnerTargetId));

  const passedRows = qualityGateRows.filter((row) => row.qualityGateStatus === "passed_whole_map_resumption_execution_runner_quality_gate");
  const blockedRows = qualityGateRows.filter((row) => row.qualityGateStatus !== "passed_whole_map_resumption_execution_runner_quality_gate");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "run-football-truth-whole-map-resumption-execution-runner-quality-gate-file",
    mode: "no_write_whole_map_resumption_execution_runner_quality_gate",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      wholeMapResumptionExecutionRunner: args.runnerInput
    },
    summary: {
      executionRunnerReadCount: 1,
      wholeMapResumptionExecutionRunnerQualityGateRowCount: qualityGateRows.length,
      wholeMapResumptionExecutionRunnerQualityGatePassedCount: passedRows.length,
      wholeMapResumptionExecutionRunnerQualityGateBlockedCount: blockedRows.length,

      primaryBatchRunnerQualityGatedCount:
        qualityGateRows.filter((row) => row.runnerStage === "primary_manifest_binding").length,
      followupLaneQualityGatedPackRunnerQualityGatedCount:
        qualityGateRows.filter((row) => row.runnerStage === "followup_quality_gated_queue_binding").length,
      activeWorkstreamExecutionWaveRunnerQualityGatedCount:
        qualityGateRows.filter((row) => row.runnerStage === "active_workstream_execution_wave_binding").length,
      reusableFamilyPromotionRunnerQualityGatedCount:
        qualityGateRows.filter((row) => row.runnerStage === "reusable_family_pattern_promotion_binding").length,
      providerFamilyRepairDeferredRunnerQualityGatedCount:
        qualityGateRows.filter((row) => row.runnerStage === "provider_family_repair_backlog_deferral_binding").length,

      laligaReusablePatternRunnerQualityGatedCount:
        qualityGateRows.filter((row) => (row.reusableFamilies || []).includes("laliga")).length,
      norwayNtfReusablePatternRunnerQualityGatedCount:
        qualityGateRows.filter((row) => (row.reusableFamilies || []).includes("norway_ntf")).length,
      sportomediaProviderFamilyRepairDeferredRunnerQualityGatedCount:
        qualityGateRows.filter((row) => (row.reusableFamilies || []).includes("sportomedia")).length,
      sportomediaBlocksWholeMapCount: 0,

      runnerArtifactBuiltCount: qualityGateRows.filter((row) => row.runnerArtifactBuilt).length,
      runnerArtifactCompleteCount: qualityGateRows.filter((row) => row.runnerArtifactComplete).length,
      mayPrepareWholeMapResumptionFinalExecutionApprovalCount:
        blockedRows.length === 0 ? 1 : 0,
      finalApprovalRequiredBeforeExecutionCount:
        qualityGateRows.filter((row) => row.finalApprovalRequiredBeforeExecution).length,

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
      wholeMapResumptionExecutionRunnerQualityGateTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        blockedRows.length === 0
          ? "prepare_final_explicit_whole_map_resumption_execution_approval_gate"
          : "repair_whole_map_resumption_execution_runner"
    },
    counts: {
      byActionType: countBy(qualityGateRows, "actionType"),
      byExecutionPlanStep: countBy(qualityGateRows, "executionPlanStep"),
      byRunnerStage: countBy(qualityGateRows, "runnerStage"),
      byQualityGateStatus: countBy(qualityGateRows, "qualityGateStatus"),
      byNextAllowedStep: countBy(qualityGateRows, "nextAllowedStep")
    },
    wholeMapResumptionPolicy: {
      resumeWholeMapNow: true,
      sportomediaBlocksWholeMap: false,
      sportomediaDisposition: "provider_family_repair_backlog",
      preservedReusableFamilyWins: ["laliga", "norway_ntf"],
      nextAction: "prepare_final_explicit_whole_map_resumption_execution_approval_gate",
      noProviderMicroProbingInMainLane: true,
      qualityGateIsNotExecution: true,
      finalExplicitApprovalRequiredBeforeAnyExecution: true,
      noExecutionUntilFinalExplicitApproval: true,
      noFetchUntilFinalExplicitApproval: true,
      noSearchUntilFutureExplicitApproval: true,
      noCanonicalWritesUntilFutureExplicitApproval: true,
      noProductionWritesUntilFutureExplicitApproval: true,
      noTruthAssertionsUntilFutureEvidenceGate: true
    },
    guardrails: [
      "This quality gate reads the whole-map resumption execution runner artifact only.",
      "It does not run the execution runner.",
      "It does not execute.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Execution runner quality gate rows are workflow routing artifacts, not truth assertions.",
      "Passing this gate only allows preparing a final explicit approval gate.",
      "It does not allow execution or fetch now.",
      "Sportomedia remains in provider-family repair backlog and does not block the full-map main lane."
    ],
    qualityGateRows,
    blockedRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    executionRunnerReadCount: output.summary.executionRunnerReadCount,
    wholeMapResumptionExecutionRunnerQualityGateRowCount: output.summary.wholeMapResumptionExecutionRunnerQualityGateRowCount,
    wholeMapResumptionExecutionRunnerQualityGatePassedCount: output.summary.wholeMapResumptionExecutionRunnerQualityGatePassedCount,
    wholeMapResumptionExecutionRunnerQualityGateBlockedCount: output.summary.wholeMapResumptionExecutionRunnerQualityGateBlockedCount,
    primaryBatchRunnerQualityGatedCount: output.summary.primaryBatchRunnerQualityGatedCount,
    followupLaneQualityGatedPackRunnerQualityGatedCount: output.summary.followupLaneQualityGatedPackRunnerQualityGatedCount,
    activeWorkstreamExecutionWaveRunnerQualityGatedCount: output.summary.activeWorkstreamExecutionWaveRunnerQualityGatedCount,
    reusableFamilyPromotionRunnerQualityGatedCount: output.summary.reusableFamilyPromotionRunnerQualityGatedCount,
    providerFamilyRepairDeferredRunnerQualityGatedCount: output.summary.providerFamilyRepairDeferredRunnerQualityGatedCount,
    laligaReusablePatternRunnerQualityGatedCount: output.summary.laligaReusablePatternRunnerQualityGatedCount,
    norwayNtfReusablePatternRunnerQualityGatedCount: output.summary.norwayNtfReusablePatternRunnerQualityGatedCount,
    sportomediaProviderFamilyRepairDeferredRunnerQualityGatedCount: output.summary.sportomediaProviderFamilyRepairDeferredRunnerQualityGatedCount,
    sportomediaBlocksWholeMapCount: output.summary.sportomediaBlocksWholeMapCount,
    runnerArtifactBuiltCount: output.summary.runnerArtifactBuiltCount,
    runnerArtifactCompleteCount: output.summary.runnerArtifactCompleteCount,
    mayPrepareWholeMapResumptionFinalExecutionApprovalCount: output.summary.mayPrepareWholeMapResumptionFinalExecutionApprovalCount,
    finalApprovalRequiredBeforeExecutionCount: output.summary.finalApprovalRequiredBeforeExecutionCount,
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
    wholeMapResumptionExecutionRunnerQualityGateTruthCount: output.summary.wholeMapResumptionExecutionRunnerQualityGateTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
