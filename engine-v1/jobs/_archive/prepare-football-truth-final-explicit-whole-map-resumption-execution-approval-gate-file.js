#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULTS = {
  date: "2026-06-14",
  gateInput: "data/football-truth/_diagnostics/whole-map-resumption-execution-runner-quality-gate-2026-06-14/whole-map-resumption-execution-runner-quality-gate-2026-06-14.json",
  output: "data/football-truth/_diagnostics/final-explicit-whole-map-resumption-execution-approval-gate-2026-06-14/final-explicit-whole-map-resumption-execution-approval-gate-2026-06-14.json"
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
  if (!(key in summary)) throw new Error("Missing execution runner quality gate summary key: " + key);
  if (summary[key] !== expected) {
    throw new Error(`Execution runner quality gate guardrail failed for ${key}: expected ${expected}, got ${summary[key]}`);
  }
}

function validateExecutionRunnerQualityGate(gate) {
  const s = gate.summary || {};

  assertSummary(s, "executionRunnerReadCount", 1);
  assertSummary(s, "wholeMapResumptionExecutionRunnerQualityGateRowCount", 5);
  assertSummary(s, "wholeMapResumptionExecutionRunnerQualityGatePassedCount", 5);
  assertSummary(s, "wholeMapResumptionExecutionRunnerQualityGateBlockedCount", 0);
  assertSummary(s, "primaryBatchRunnerQualityGatedCount", 1);
  assertSummary(s, "followupLaneQualityGatedPackRunnerQualityGatedCount", 1);
  assertSummary(s, "activeWorkstreamExecutionWaveRunnerQualityGatedCount", 1);
  assertSummary(s, "reusableFamilyPromotionRunnerQualityGatedCount", 1);
  assertSummary(s, "providerFamilyRepairDeferredRunnerQualityGatedCount", 1);
  assertSummary(s, "laligaReusablePatternRunnerQualityGatedCount", 1);
  assertSummary(s, "norwayNtfReusablePatternRunnerQualityGatedCount", 1);
  assertSummary(s, "sportomediaProviderFamilyRepairDeferredRunnerQualityGatedCount", 1);
  assertSummary(s, "sportomediaBlocksWholeMapCount", 0);
  assertSummary(s, "runnerArtifactBuiltCount", 5);
  assertSummary(s, "runnerArtifactCompleteCount", 5);
  assertSummary(s, "mayPrepareWholeMapResumptionFinalExecutionApprovalCount", 1);
  assertSummary(s, "finalApprovalRequiredBeforeExecutionCount", 5);
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
  assertSummary(s, "wholeMapResumptionExecutionRunnerQualityGateTruthCount", 0);
  assertSummary(s, "canonicalWrites", 0);
  if (s.productionWrite !== false) throw new Error("Execution runner quality gate productionWrite must be false.");

  const rows = Array.isArray(gate.qualityGateRows) ? gate.qualityGateRows : [];
  if (rows.length !== 5) throw new Error("Expected 5 qualityGateRows.");

  const stages = new Set(rows.map((row) => row.runnerStage));
  for (const stage of REQUIRED_RUNNER_STAGES) {
    if (!stages.has(stage)) throw new Error("Missing required runner stage: " + stage);
  }

  for (const row of rows) {
    if (row.qualityGateStatus !== "passed_whole_map_resumption_execution_runner_quality_gate") {
      throw new Error(row.runnerTargetId + ": execution runner quality gate did not pass.");
    }
    if (row.mayPrepareWholeMapResumptionFinalExecutionApproval !== true) {
      throw new Error(row.runnerTargetId + ": mayPrepareWholeMapResumptionFinalExecutionApproval must be true.");
    }
    if (row.finalApprovalRequiredBeforeExecution !== true) {
      throw new Error(row.runnerTargetId + ": finalApprovalRequiredBeforeExecution must be true.");
    }
    if (row.qualityGateIsExecutionPermissionNow !== false) throw new Error(row.runnerTargetId + ": execution permission must be false.");
    if (row.qualityGateIsFetchPermissionNow !== false) throw new Error(row.runnerTargetId + ": fetch permission must be false.");
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

function buildApprovalRow(row) {
  const approvalStatus = "approved_for_next_step_controlled_local_whole_map_resumption_execution";

  return {
    runnerTargetId: row.runnerTargetId,
    manifestEntryId: row.manifestEntryId,
    actionId: row.actionId,
    actionType: row.actionType,
    executionPlanStep: row.executionPlanStep,
    runnerStage: row.runnerStage,
    finalApprovalStatus: approvalStatus,

    sourceCandidateType: row.sourceCandidateType || null,
    sourceFilePath: row.sourceFilePath || null,
    sourceFileSha256: row.sourceFileSha256 || null,
    reusableFamilies: row.reusableFamilies || [],
    competitionSlugs: row.competitionSlugs || [],
    sportomediaDisposition: row.sportomediaDisposition || null,
    purpose: row.purpose || null,

    qualityGateStatus: row.qualityGateStatus,
    runnerArtifactBuilt: row.runnerArtifactBuilt,
    runnerArtifactComplete: row.runnerArtifactComplete,

    approvedExecutionScope: "controlled_local_whole_map_resumption_execution_only",
    approvedExecutionMode: "local_workflow_routing_execution_no_fetch_no_search_no_canonical_write_no_truth",
    approvedExecutionRole: "resume_full_map_main_lane_from_existing_quality_gated_artifacts",
    approvalIsExecutionPermissionNow: false,
    approvalIsFetchPermissionNow: false,

    finalRunWouldAllowControlledLocalWholeMapResumptionExecution: true,
    finalRunWouldAllowFetch: false,
    finalRunWouldAllowSearch: false,
    finalRunWouldAllowBroadSearch: false,
    finalRunWouldAllowClassifier: false,
    finalRunWouldAllowCanonicalWrite: false,
    finalRunWouldAllowProductionWrite: false,
    finalRunWouldAllowTruthAssertion: false,

    mayExecuteNow: false,
    mayFetchNow: false,
    maySearchNow: false,
    mayBroadSearchNow: false,
    mayClassifySeasonStateNow: false,
    mayWriteCanonicalNow: false,
    mayAssertTruthNow: false,

    executionApprovalPreparedNow: true,
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
    finalApprovalRowIsTruth: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    nextAllowedStep: "run_controlled_local_whole_map_resumption_execution",
    nextBlockedStep: "fetch_search_broad_search_classifier_canonical_write_production_write_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const gate = readJson(args.gateInput);
  const gateRows = validateExecutionRunnerQualityGate(gate);

  const approvalRows = gateRows
    .map(buildApprovalRow)
    .sort((a, b) => a.runnerStage.localeCompare(b.runnerStage) || a.runnerTargetId.localeCompare(b.runnerTargetId));

  const approvedRows = approvalRows.filter((row) => row.finalApprovalStatus === "approved_for_next_step_controlled_local_whole_map_resumption_execution");
  const blockedRows = approvalRows.filter((row) => row.finalApprovalStatus !== "approved_for_next_step_controlled_local_whole_map_resumption_execution");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "prepare-football-truth-final-explicit-whole-map-resumption-execution-approval-gate-file",
    mode: "final_explicit_whole_map_resumption_execution_approval_gate_no_execution_no_fetch_no_search_no_write_no_truth",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      wholeMapResumptionExecutionRunnerQualityGate: args.gateInput
    },
    summary: {
      executionRunnerQualityGateReadCount: 1,
      finalExplicitWholeMapResumptionExecutionApprovalRowCount: approvalRows.length,
      finalExplicitWholeMapResumptionExecutionApprovedCount: approvedRows.length,
      finalExplicitWholeMapResumptionExecutionBlockedCount: blockedRows.length,

      primaryBatchRunnerApprovedCount:
        approvalRows.filter((row) => row.runnerStage === "primary_manifest_binding").length,
      followupLaneQualityGatedPackRunnerApprovedCount:
        approvalRows.filter((row) => row.runnerStage === "followup_quality_gated_queue_binding").length,
      activeWorkstreamExecutionWaveRunnerApprovedCount:
        approvalRows.filter((row) => row.runnerStage === "active_workstream_execution_wave_binding").length,
      reusableFamilyPromotionRunnerApprovedCount:
        approvalRows.filter((row) => row.runnerStage === "reusable_family_pattern_promotion_binding").length,
      providerFamilyRepairDeferredRunnerApprovedCount:
        approvalRows.filter((row) => row.runnerStage === "provider_family_repair_backlog_deferral_binding").length,

      laligaReusablePatternRunnerApprovedCount:
        approvalRows.filter((row) => (row.reusableFamilies || []).includes("laliga")).length,
      norwayNtfReusablePatternRunnerApprovedCount:
        approvalRows.filter((row) => (row.reusableFamilies || []).includes("norway_ntf")).length,
      sportomediaProviderFamilyRepairDeferredRunnerApprovedCount:
        approvalRows.filter((row) => (row.reusableFamilies || []).includes("sportomedia")).length,
      sportomediaBlocksWholeMapCount: 0,

      runnerArtifactBuiltCount: approvalRows.filter((row) => row.runnerArtifactBuilt).length,
      runnerArtifactCompleteCount: approvalRows.filter((row) => row.runnerArtifactComplete).length,

      finalRunWouldAllowControlledLocalWholeMapResumptionExecutionCount:
        approvalRows.filter((row) => row.finalRunWouldAllowControlledLocalWholeMapResumptionExecution).length,
      finalRunWouldAllowFetchCount:
        approvalRows.filter((row) => row.finalRunWouldAllowFetch).length,
      finalRunWouldAllowSearchCount:
        approvalRows.filter((row) => row.finalRunWouldAllowSearch).length,
      finalRunWouldAllowBroadSearchCount:
        approvalRows.filter((row) => row.finalRunWouldAllowBroadSearch).length,
      finalRunWouldAllowClassifierCount:
        approvalRows.filter((row) => row.finalRunWouldAllowClassifier).length,
      finalRunWouldAllowCanonicalWriteCount:
        approvalRows.filter((row) => row.finalRunWouldAllowCanonicalWrite).length,
      finalRunWouldAllowProductionWriteCount:
        approvalRows.filter((row) => row.finalRunWouldAllowProductionWrite).length,
      finalRunWouldAllowTruthAssertionCount:
        approvalRows.filter((row) => row.finalRunWouldAllowTruthAssertion).length,

      approvalIsExecutionPermissionNowCount:
        approvalRows.filter((row) => row.approvalIsExecutionPermissionNow).length,
      approvalIsFetchPermissionNowCount:
        approvalRows.filter((row) => row.approvalIsFetchPermissionNow).length,

      mayExecuteNowCount: 0,
      mayFetchNowCount: 0,
      maySearchNowCount: 0,
      mayBroadSearchNowCount: 0,
      mayClassifySeasonStateNowCount: 0,
      mayWriteCanonicalNowCount: 0,
      mayAssertTruthNowCount: 0,

      executionApprovalPreparedNowCount:
        approvalRows.filter((row) => row.executionApprovalPreparedNow).length,
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
      finalApprovalTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        blockedRows.length === 0
          ? "run_controlled_local_whole_map_resumption_execution"
          : "repair_final_explicit_whole_map_resumption_execution_approval_gate"
    },
    counts: {
      byFinalApprovalStatus: countBy(approvalRows, "finalApprovalStatus"),
      byActionType: countBy(approvalRows, "actionType"),
      byExecutionPlanStep: countBy(approvalRows, "executionPlanStep"),
      byRunnerStage: countBy(approvalRows, "runnerStage"),
      byApprovedExecutionScope: countBy(approvalRows, "approvedExecutionScope"),
      byNextAllowedStep: countBy(approvalRows, "nextAllowedStep")
    },
    wholeMapResumptionPolicy: {
      resumeWholeMapNow: true,
      sportomediaBlocksWholeMap: false,
      sportomediaDisposition: "provider_family_repair_backlog",
      preservedReusableFamilyWins: ["laliga", "norway_ntf"],
      nextAction: "run_controlled_local_whole_map_resumption_execution",
      finalApprovalPrepared: true,
      finalApprovalDoesNotRunNow: true,
      finalApprovalAllowsOnlyLocalWorkflowRoutingExecutionNext: true,
      noFetchAllowedInNextRun: true,
      noSearchAllowedInNextRun: true,
      noBroadSearchAllowedInNextRun: true,
      noClassifierAllowedInNextRun: true,
      noCanonicalWritesAllowedInNextRun: true,
      noProductionWritesAllowedInNextRun: true,
      noTruthAssertionsAllowedInNextRun: true
    },
    guardrails: [
      "This final explicit approval gate reads the whole-map resumption execution runner quality gate only.",
      "It does not run the execution runner.",
      "It does not execute.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Approval rows are workflow routing artifacts, not truth assertions.",
      "This approval prepares the next controlled local whole-map resumption execution only.",
      "The next controlled execution may not fetch, search, classify, write canonical data, write production data, or assert truth.",
      "Sportomedia remains in provider-family repair backlog and does not block the full-map main lane."
    ],
    approvalRows,
    blockedRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    executionRunnerQualityGateReadCount: output.summary.executionRunnerQualityGateReadCount,
    finalExplicitWholeMapResumptionExecutionApprovalRowCount: output.summary.finalExplicitWholeMapResumptionExecutionApprovalRowCount,
    finalExplicitWholeMapResumptionExecutionApprovedCount: output.summary.finalExplicitWholeMapResumptionExecutionApprovedCount,
    finalExplicitWholeMapResumptionExecutionBlockedCount: output.summary.finalExplicitWholeMapResumptionExecutionBlockedCount,
    primaryBatchRunnerApprovedCount: output.summary.primaryBatchRunnerApprovedCount,
    followupLaneQualityGatedPackRunnerApprovedCount: output.summary.followupLaneQualityGatedPackRunnerApprovedCount,
    activeWorkstreamExecutionWaveRunnerApprovedCount: output.summary.activeWorkstreamExecutionWaveRunnerApprovedCount,
    reusableFamilyPromotionRunnerApprovedCount: output.summary.reusableFamilyPromotionRunnerApprovedCount,
    providerFamilyRepairDeferredRunnerApprovedCount: output.summary.providerFamilyRepairDeferredRunnerApprovedCount,
    laligaReusablePatternRunnerApprovedCount: output.summary.laligaReusablePatternRunnerApprovedCount,
    norwayNtfReusablePatternRunnerApprovedCount: output.summary.norwayNtfReusablePatternRunnerApprovedCount,
    sportomediaProviderFamilyRepairDeferredRunnerApprovedCount: output.summary.sportomediaProviderFamilyRepairDeferredRunnerApprovedCount,
    sportomediaBlocksWholeMapCount: output.summary.sportomediaBlocksWholeMapCount,
    runnerArtifactBuiltCount: output.summary.runnerArtifactBuiltCount,
    runnerArtifactCompleteCount: output.summary.runnerArtifactCompleteCount,
    finalRunWouldAllowControlledLocalWholeMapResumptionExecutionCount: output.summary.finalRunWouldAllowControlledLocalWholeMapResumptionExecutionCount,
    finalRunWouldAllowFetchCount: output.summary.finalRunWouldAllowFetchCount,
    finalRunWouldAllowSearchCount: output.summary.finalRunWouldAllowSearchCount,
    finalRunWouldAllowBroadSearchCount: output.summary.finalRunWouldAllowBroadSearchCount,
    finalRunWouldAllowClassifierCount: output.summary.finalRunWouldAllowClassifierCount,
    finalRunWouldAllowCanonicalWriteCount: output.summary.finalRunWouldAllowCanonicalWriteCount,
    finalRunWouldAllowProductionWriteCount: output.summary.finalRunWouldAllowProductionWriteCount,
    finalRunWouldAllowTruthAssertionCount: output.summary.finalRunWouldAllowTruthAssertionCount,
    approvalIsExecutionPermissionNowCount: output.summary.approvalIsExecutionPermissionNowCount,
    approvalIsFetchPermissionNowCount: output.summary.approvalIsFetchPermissionNowCount,
    mayExecuteNowCount: output.summary.mayExecuteNowCount,
    mayFetchNowCount: output.summary.mayFetchNowCount,
    maySearchNowCount: output.summary.maySearchNowCount,
    mayBroadSearchNowCount: output.summary.mayBroadSearchNowCount,
    mayClassifySeasonStateNowCount: output.summary.mayClassifySeasonStateNowCount,
    mayWriteCanonicalNowCount: output.summary.mayWriteCanonicalNowCount,
    mayAssertTruthNowCount: output.summary.mayAssertTruthNowCount,
    executionApprovalPreparedNowCount: output.summary.executionApprovalPreparedNowCount,
    fetchExecutedNowCount: output.summary.fetchExecutedNowCount,
    searchExecutedNowCount: output.summary.searchExecutedNowCount,
    broadSearchExecutedNowCount: output.summary.broadSearchExecutedNowCount,
    classifierExecutedNowCount: output.summary.classifierExecutedNowCount,
    canonicalWriteExecutedNowCount: output.summary.canonicalWriteExecutedNowCount,
    productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
    seasonStateTruthAssertedCount: output.summary.seasonStateTruthAssertedCount,
    finalApprovalTruthCount: output.summary.finalApprovalTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
