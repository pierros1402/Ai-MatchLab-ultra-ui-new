#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULTS = {
  date: "2026-06-14",
  approvalInput: "data/football-truth/_diagnostics/final-explicit-whole-map-resumption-execution-approval-gate-2026-06-14/final-explicit-whole-map-resumption-execution-approval-gate-2026-06-14.json",
  output: "data/football-truth/_diagnostics/controlled-local-whole-map-resumption-execution-2026-06-14/controlled-local-whole-map-resumption-execution-2026-06-14.json"
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
    else if (arg === "--approval-input") args.approvalInput = argv[++i];
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
  if (!(key in summary)) throw new Error("Missing final approval summary key: " + key);
  if (summary[key] !== expected) {
    throw new Error(`Final approval guardrail failed for ${key}: expected ${expected}, got ${summary[key]}`);
  }
}

function validateApproval(approval) {
  const s = approval.summary || {};

  assertSummary(s, "executionRunnerQualityGateReadCount", 1);
  assertSummary(s, "finalExplicitWholeMapResumptionExecutionApprovalRowCount", 5);
  assertSummary(s, "finalExplicitWholeMapResumptionExecutionApprovedCount", 5);
  assertSummary(s, "finalExplicitWholeMapResumptionExecutionBlockedCount", 0);
  assertSummary(s, "primaryBatchRunnerApprovedCount", 1);
  assertSummary(s, "followupLaneQualityGatedPackRunnerApprovedCount", 1);
  assertSummary(s, "activeWorkstreamExecutionWaveRunnerApprovedCount", 1);
  assertSummary(s, "reusableFamilyPromotionRunnerApprovedCount", 1);
  assertSummary(s, "providerFamilyRepairDeferredRunnerApprovedCount", 1);
  assertSummary(s, "laligaReusablePatternRunnerApprovedCount", 1);
  assertSummary(s, "norwayNtfReusablePatternRunnerApprovedCount", 1);
  assertSummary(s, "sportomediaProviderFamilyRepairDeferredRunnerApprovedCount", 1);
  assertSummary(s, "sportomediaBlocksWholeMapCount", 0);
  assertSummary(s, "runnerArtifactBuiltCount", 5);
  assertSummary(s, "runnerArtifactCompleteCount", 5);

  assertSummary(s, "finalRunWouldAllowControlledLocalWholeMapResumptionExecutionCount", 5);
  assertSummary(s, "finalRunWouldAllowFetchCount", 0);
  assertSummary(s, "finalRunWouldAllowSearchCount", 0);
  assertSummary(s, "finalRunWouldAllowBroadSearchCount", 0);
  assertSummary(s, "finalRunWouldAllowClassifierCount", 0);
  assertSummary(s, "finalRunWouldAllowCanonicalWriteCount", 0);
  assertSummary(s, "finalRunWouldAllowProductionWriteCount", 0);
  assertSummary(s, "finalRunWouldAllowTruthAssertionCount", 0);
  assertSummary(s, "approvalIsExecutionPermissionNowCount", 0);
  assertSummary(s, "approvalIsFetchPermissionNowCount", 0);

  assertSummary(s, "mayExecuteNowCount", 0);
  assertSummary(s, "mayFetchNowCount", 0);
  assertSummary(s, "maySearchNowCount", 0);
  assertSummary(s, "mayBroadSearchNowCount", 0);
  assertSummary(s, "mayClassifySeasonStateNowCount", 0);
  assertSummary(s, "mayWriteCanonicalNowCount", 0);
  assertSummary(s, "mayAssertTruthNowCount", 0);

  assertSummary(s, "executionApprovalPreparedNowCount", 5);
  assertSummary(s, "fetchExecutedNowCount", 0);
  assertSummary(s, "searchExecutedNowCount", 0);
  assertSummary(s, "broadSearchExecutedNowCount", 0);
  assertSummary(s, "classifierExecutedNowCount", 0);
  assertSummary(s, "canonicalWriteExecutedNowCount", 0);
  assertSummary(s, "productionWriteExecutedNowCount", 0);
  assertSummary(s, "seasonStateTruthAssertedCount", 0);
  assertSummary(s, "finalApprovalTruthCount", 0);
  assertSummary(s, "canonicalWrites", 0);
  if (s.productionWrite !== false) throw new Error("Final approval productionWrite must be false.");

  const rows = Array.isArray(approval.approvalRows) ? approval.approvalRows : [];
  if (rows.length !== 5) throw new Error("Expected 5 approvalRows.");

  const stages = new Set(rows.map((row) => row.runnerStage));
  for (const stage of REQUIRED_RUNNER_STAGES) {
    if (!stages.has(stage)) throw new Error("Missing required approved runner stage: " + stage);
  }

  for (const row of rows) {
    if (row.finalApprovalStatus !== "approved_for_next_step_controlled_local_whole_map_resumption_execution") {
      throw new Error(row.runnerTargetId + ": final approval status is not approved.");
    }
    if (row.approvedExecutionScope !== "controlled_local_whole_map_resumption_execution_only") {
      throw new Error(row.runnerTargetId + ": unexpected approved execution scope.");
    }
    if (row.finalRunWouldAllowControlledLocalWholeMapResumptionExecution !== true) {
      throw new Error(row.runnerTargetId + ": controlled local execution must be approved.");
    }
    if (row.finalRunWouldAllowFetch !== false) throw new Error(row.runnerTargetId + ": fetch must not be approved.");
    if (row.finalRunWouldAllowSearch !== false) throw new Error(row.runnerTargetId + ": search must not be approved.");
    if (row.finalRunWouldAllowBroadSearch !== false) throw new Error(row.runnerTargetId + ": broad search must not be approved.");
    if (row.finalRunWouldAllowClassifier !== false) throw new Error(row.runnerTargetId + ": classifier must not be approved.");
    if (row.finalRunWouldAllowCanonicalWrite !== false) throw new Error(row.runnerTargetId + ": canonical write must not be approved.");
    if (row.finalRunWouldAllowProductionWrite !== false) throw new Error(row.runnerTargetId + ": production write must not be approved.");
    if (row.finalRunWouldAllowTruthAssertion !== false) throw new Error(row.runnerTargetId + ": truth assertion must not be approved.");
    if (row.approvalIsExecutionPermissionNow !== false) throw new Error(row.runnerTargetId + ": approval gate itself must not be execution permission now.");
    if (row.approvalIsFetchPermissionNow !== false) throw new Error(row.runnerTargetId + ": approval gate itself must not be fetch permission now.");

    if (row.mayExecuteNow !== false) throw new Error(row.runnerTargetId + ": mayExecuteNow must be false in approval artifact.");
    if (row.mayFetchNow !== false) throw new Error(row.runnerTargetId + ": mayFetchNow must be false.");
    if (row.maySearchNow !== false) throw new Error(row.runnerTargetId + ": maySearchNow must be false.");
    if (row.mayBroadSearchNow !== false) throw new Error(row.runnerTargetId + ": mayBroadSearchNow must be false.");
    if (row.mayClassifySeasonStateNow !== false) throw new Error(row.runnerTargetId + ": mayClassifySeasonStateNow must be false.");
    if (row.mayWriteCanonicalNow !== false) throw new Error(row.runnerTargetId + ": mayWriteCanonicalNow must be false.");
    if (row.mayAssertTruthNow !== false) throw new Error(row.runnerTargetId + ": mayAssertTruthNow must be false.");
  }

  return rows;
}

function executionStatusFor(row) {
  if (row.runnerStage === "primary_manifest_binding") {
    return "executed_local_primary_manifest_binding";
  }
  if (row.runnerStage === "followup_quality_gated_queue_binding") {
    return "executed_local_followup_quality_gated_queue_binding";
  }
  if (row.runnerStage === "active_workstream_execution_wave_binding") {
    return "executed_local_active_workstream_execution_wave_binding";
  }
  if (row.runnerStage === "reusable_family_pattern_promotion_binding") {
    return "executed_local_reusable_family_pattern_promotion_binding";
  }
  if (row.runnerStage === "provider_family_repair_backlog_deferral_binding") {
    return "executed_local_provider_family_repair_backlog_deferral_binding";
  }
  return "blocked_unknown_runner_stage";
}

function buildExecutionRow(row) {
  const executionStatus = executionStatusFor(row);
  const executed = executionStatus.startsWith("executed_local_");

  return {
    runnerTargetId: row.runnerTargetId,
    manifestEntryId: row.manifestEntryId,
    actionId: row.actionId,
    actionType: row.actionType,
    executionPlanStep: row.executionPlanStep,
    runnerStage: row.runnerStage,
    controlledLocalExecutionStatus: executionStatus,

    sourceCandidateType: row.sourceCandidateType || null,
    sourceFilePath: row.sourceFilePath || null,
    sourceFileSha256: row.sourceFileSha256 || null,
    reusableFamilies: row.reusableFamilies || [],
    competitionSlugs: row.competitionSlugs || [],
    sportomediaDisposition: row.sportomediaDisposition || null,
    purpose: row.purpose || null,

    approvedExecutionScope: row.approvedExecutionScope,
    approvedExecutionMode: row.approvedExecutionMode,
    approvedExecutionRole: row.approvedExecutionRole,

    localRoutingExecutedNow: executed,
    localPrimaryManifestBindingExecutedNow: row.runnerStage === "primary_manifest_binding",
    localFollowupQualityGatedQueueBindingExecutedNow: row.runnerStage === "followup_quality_gated_queue_binding",
    localActiveWorkstreamExecutionWaveBindingExecutedNow: row.runnerStage === "active_workstream_execution_wave_binding",
    localReusableFamilyPatternPromotionBindingExecutedNow: row.runnerStage === "reusable_family_pattern_promotion_binding",
    localProviderFamilyRepairBacklogDeferralBindingExecutedNow: row.runnerStage === "provider_family_repair_backlog_deferral_binding",

    sportomediaBlocksWholeMap: false,
    wholeMapMainLaneResumed: true,
    providerMicroProbingContinuedInMainLane: false,

    executionIsFetch: false,
    executionIsSearch: false,
    executionIsBroadSearch: false,
    executionIsClassifier: false,
    executionIsCanonicalWrite: false,
    executionIsProductionWrite: false,
    executionIsTruthAssertion: false,

    mayExecuteFurtherNow: false,
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
    controlledLocalExecutionRowIsTruth: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    nextAllowedStep:
      executed
        ? "review_controlled_local_whole_map_resumption_execution_results"
        : "repair_controlled_local_whole_map_resumption_execution",
    nextBlockedStep: "fetch_search_broad_search_classifier_canonical_write_production_write_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const approval = readJson(args.approvalInput);
  const approvalRows = validateApproval(approval);

  const executionRows = approvalRows
    .map(buildExecutionRow)
    .sort((a, b) => a.runnerStage.localeCompare(b.runnerStage) || a.runnerTargetId.localeCompare(b.runnerTargetId));

  const executedRows = executionRows.filter((row) => row.localRoutingExecutedNow);
  const blockedRows = executionRows.filter((row) => !row.localRoutingExecutedNow);

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "run-football-truth-controlled-local-whole-map-resumption-execution-file",
    mode: "controlled_local_whole_map_resumption_execution_no_fetch_no_search_no_classifier_no_write_no_truth",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: false,
    inputs: {
      finalExplicitWholeMapResumptionExecutionApprovalGate: args.approvalInput
    },
    summary: {
      finalApprovalReadCount: 1,
      controlledLocalWholeMapResumptionExecutionRowCount: executionRows.length,
      controlledLocalWholeMapResumptionExecutionExecutedCount: executedRows.length,
      controlledLocalWholeMapResumptionExecutionBlockedCount: blockedRows.length,

      localPrimaryManifestBindingExecutedCount:
        executionRows.filter((row) => row.localPrimaryManifestBindingExecutedNow).length,
      localFollowupQualityGatedQueueBindingExecutedCount:
        executionRows.filter((row) => row.localFollowupQualityGatedQueueBindingExecutedNow).length,
      localActiveWorkstreamExecutionWaveBindingExecutedCount:
        executionRows.filter((row) => row.localActiveWorkstreamExecutionWaveBindingExecutedNow).length,
      localReusableFamilyPatternPromotionBindingExecutedCount:
        executionRows.filter((row) => row.localReusableFamilyPatternPromotionBindingExecutedNow).length,
      localProviderFamilyRepairBacklogDeferralBindingExecutedCount:
        executionRows.filter((row) => row.localProviderFamilyRepairBacklogDeferralBindingExecutedNow).length,

      laligaReusablePatternLocalBindingExecutedCount:
        executionRows.filter((row) => (row.reusableFamilies || []).includes("laliga")).length,
      norwayNtfReusablePatternLocalBindingExecutedCount:
        executionRows.filter((row) => (row.reusableFamilies || []).includes("norway_ntf")).length,
      sportomediaProviderFamilyRepairDeferredLocalBindingExecutedCount:
        executionRows.filter((row) => (row.reusableFamilies || []).includes("sportomedia")).length,
      sportomediaBlocksWholeMapCount: 0,
      providerMicroProbingContinuedInMainLaneCount:
        executionRows.filter((row) => row.providerMicroProbingContinuedInMainLane).length,

      wholeMapMainLaneResumedCount:
        executionRows.filter((row) => row.wholeMapMainLaneResumed).length,

      finalApprovalApprovedInputCount: approvalRows.length,
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

      mayExecuteFurtherNowCount: 0,
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
      controlledLocalWholeMapResumptionExecutionTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        blockedRows.length === 0
          ? "review_controlled_local_whole_map_resumption_execution_results"
          : "repair_controlled_local_whole_map_resumption_execution"
    },
    counts: {
      byActionType: countBy(executionRows, "actionType"),
      byExecutionPlanStep: countBy(executionRows, "executionPlanStep"),
      byRunnerStage: countBy(executionRows, "runnerStage"),
      byControlledLocalExecutionStatus: countBy(executionRows, "controlledLocalExecutionStatus"),
      byNextAllowedStep: countBy(executionRows, "nextAllowedStep")
    },
    wholeMapResumptionPolicy: {
      wholeMapMainLaneResumed: true,
      sportomediaBlocksWholeMap: false,
      sportomediaDisposition: "provider_family_repair_backlog",
      preservedReusableFamilyWins: ["laliga", "norway_ntf"],
      controlledExecutionCompleted: blockedRows.length === 0,
      controlledExecutionWasLocalOnly: true,
      noProviderMicroProbingInMainLane: true,
      noFetchExecuted: true,
      noSearchExecuted: true,
      noBroadSearchExecuted: true,
      noClassifierExecuted: true,
      noCanonicalWritesExecuted: true,
      noProductionWritesExecuted: true,
      noTruthAssertionsExecuted: true,
      nextAction: blockedRows.length === 0
        ? "review_controlled_local_whole_map_resumption_execution_results"
        : "repair_controlled_local_whole_map_resumption_execution"
    },
    guardrails: [
      "This controlled execution performs local whole-map resumption routing only.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Execution rows are workflow routing artifacts, not truth assertions.",
      "Sportomedia remains in provider-family repair backlog and does not block the full-map main lane.",
      "The next step is a no-write review of the controlled local execution results."
    ],
    executionRows,
    blockedRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    finalApprovalReadCount: output.summary.finalApprovalReadCount,
    controlledLocalWholeMapResumptionExecutionRowCount: output.summary.controlledLocalWholeMapResumptionExecutionRowCount,
    controlledLocalWholeMapResumptionExecutionExecutedCount: output.summary.controlledLocalWholeMapResumptionExecutionExecutedCount,
    controlledLocalWholeMapResumptionExecutionBlockedCount: output.summary.controlledLocalWholeMapResumptionExecutionBlockedCount,
    localPrimaryManifestBindingExecutedCount: output.summary.localPrimaryManifestBindingExecutedCount,
    localFollowupQualityGatedQueueBindingExecutedCount: output.summary.localFollowupQualityGatedQueueBindingExecutedCount,
    localActiveWorkstreamExecutionWaveBindingExecutedCount: output.summary.localActiveWorkstreamExecutionWaveBindingExecutedCount,
    localReusableFamilyPatternPromotionBindingExecutedCount: output.summary.localReusableFamilyPatternPromotionBindingExecutedCount,
    localProviderFamilyRepairBacklogDeferralBindingExecutedCount: output.summary.localProviderFamilyRepairBacklogDeferralBindingExecutedCount,
    laligaReusablePatternLocalBindingExecutedCount: output.summary.laligaReusablePatternLocalBindingExecutedCount,
    norwayNtfReusablePatternLocalBindingExecutedCount: output.summary.norwayNtfReusablePatternLocalBindingExecutedCount,
    sportomediaProviderFamilyRepairDeferredLocalBindingExecutedCount: output.summary.sportomediaProviderFamilyRepairDeferredLocalBindingExecutedCount,
    sportomediaBlocksWholeMapCount: output.summary.sportomediaBlocksWholeMapCount,
    providerMicroProbingContinuedInMainLaneCount: output.summary.providerMicroProbingContinuedInMainLaneCount,
    wholeMapMainLaneResumedCount: output.summary.wholeMapMainLaneResumedCount,
    finalApprovalApprovedInputCount: output.summary.finalApprovalApprovedInputCount,
    finalRunWouldAllowControlledLocalWholeMapResumptionExecutionCount: output.summary.finalRunWouldAllowControlledLocalWholeMapResumptionExecutionCount,
    finalRunWouldAllowFetchCount: output.summary.finalRunWouldAllowFetchCount,
    finalRunWouldAllowSearchCount: output.summary.finalRunWouldAllowSearchCount,
    finalRunWouldAllowBroadSearchCount: output.summary.finalRunWouldAllowBroadSearchCount,
    finalRunWouldAllowClassifierCount: output.summary.finalRunWouldAllowClassifierCount,
    finalRunWouldAllowCanonicalWriteCount: output.summary.finalRunWouldAllowCanonicalWriteCount,
    finalRunWouldAllowProductionWriteCount: output.summary.finalRunWouldAllowProductionWriteCount,
    finalRunWouldAllowTruthAssertionCount: output.summary.finalRunWouldAllowTruthAssertionCount,
    mayExecuteFurtherNowCount: output.summary.mayExecuteFurtherNowCount,
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
    controlledLocalWholeMapResumptionExecutionTruthCount: output.summary.controlledLocalWholeMapResumptionExecutionTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
