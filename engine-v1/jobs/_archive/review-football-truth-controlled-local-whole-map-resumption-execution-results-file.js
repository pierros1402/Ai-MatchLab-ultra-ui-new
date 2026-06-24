#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULTS = {
  date: "2026-06-14",
  executionInput: "data/football-truth/_diagnostics/controlled-local-whole-map-resumption-execution-2026-06-14/controlled-local-whole-map-resumption-execution-2026-06-14.json",
  output: "data/football-truth/_diagnostics/controlled-local-whole-map-resumption-execution-review-2026-06-14/controlled-local-whole-map-resumption-execution-review-2026-06-14.json"
};

const REQUIRED_STATUSES = [
  "executed_local_active_workstream_execution_wave_binding",
  "executed_local_followup_quality_gated_queue_binding",
  "executed_local_primary_manifest_binding",
  "executed_local_provider_family_repair_backlog_deferral_binding",
  "executed_local_reusable_family_pattern_promotion_binding"
];

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--execution-input") args.executionInput = argv[++i];
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
  if (!(key in summary)) throw new Error("Missing execution summary key: " + key);
  if (summary[key] !== expected) {
    throw new Error(`Execution summary guardrail failed for ${key}: expected ${expected}, got ${summary[key]}`);
  }
}

function validateExecution(execution) {
  const s = execution.summary || {};

  assertSummary(s, "finalApprovalReadCount", 1);
  assertSummary(s, "controlledLocalWholeMapResumptionExecutionRowCount", 5);
  assertSummary(s, "controlledLocalWholeMapResumptionExecutionExecutedCount", 5);
  assertSummary(s, "controlledLocalWholeMapResumptionExecutionBlockedCount", 0);
  assertSummary(s, "localPrimaryManifestBindingExecutedCount", 1);
  assertSummary(s, "localFollowupQualityGatedQueueBindingExecutedCount", 1);
  assertSummary(s, "localActiveWorkstreamExecutionWaveBindingExecutedCount", 1);
  assertSummary(s, "localReusableFamilyPatternPromotionBindingExecutedCount", 1);
  assertSummary(s, "localProviderFamilyRepairBacklogDeferralBindingExecutedCount", 1);
  assertSummary(s, "laligaReusablePatternLocalBindingExecutedCount", 1);
  assertSummary(s, "norwayNtfReusablePatternLocalBindingExecutedCount", 1);
  assertSummary(s, "sportomediaProviderFamilyRepairDeferredLocalBindingExecutedCount", 1);
  assertSummary(s, "sportomediaBlocksWholeMapCount", 0);
  assertSummary(s, "providerMicroProbingContinuedInMainLaneCount", 0);
  assertSummary(s, "wholeMapMainLaneResumedCount", 5);

  assertSummary(s, "finalApprovalApprovedInputCount", 5);
  assertSummary(s, "finalRunWouldAllowControlledLocalWholeMapResumptionExecutionCount", 5);
  assertSummary(s, "finalRunWouldAllowFetchCount", 0);
  assertSummary(s, "finalRunWouldAllowSearchCount", 0);
  assertSummary(s, "finalRunWouldAllowBroadSearchCount", 0);
  assertSummary(s, "finalRunWouldAllowClassifierCount", 0);
  assertSummary(s, "finalRunWouldAllowCanonicalWriteCount", 0);
  assertSummary(s, "finalRunWouldAllowProductionWriteCount", 0);
  assertSummary(s, "finalRunWouldAllowTruthAssertionCount", 0);

  assertSummary(s, "mayExecuteFurtherNowCount", 0);
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
  assertSummary(s, "controlledLocalWholeMapResumptionExecutionTruthCount", 0);
  assertSummary(s, "canonicalWrites", 0);

  if (s.productionWrite !== false) throw new Error("Controlled local execution productionWrite must be false.");

  const rows = Array.isArray(execution.executionRows) ? execution.executionRows : [];
  if (rows.length !== 5) throw new Error("Expected 5 executionRows.");

  const statuses = new Set(rows.map((row) => row.controlledLocalExecutionStatus));
  for (const status of REQUIRED_STATUSES) {
    if (!statuses.has(status)) throw new Error("Missing required controlled local execution status: " + status);
  }

  for (const row of rows) {
    if (row.localRoutingExecutedNow !== true) throw new Error(row.runnerTargetId + ": local routing was not executed.");
    if (row.wholeMapMainLaneResumed !== true) throw new Error(row.runnerTargetId + ": whole-map main lane was not resumed.");
    if (row.sportomediaBlocksWholeMap !== false) throw new Error(row.runnerTargetId + ": Sportomedia must not block whole map.");
    if (row.providerMicroProbingContinuedInMainLane !== false) throw new Error(row.runnerTargetId + ": provider micro-probing must not continue in main lane.");

    if (row.fetchExecutedNow !== false) throw new Error(row.runnerTargetId + ": fetch must remain false.");
    if (row.searchExecutedNow !== false) throw new Error(row.runnerTargetId + ": search must remain false.");
    if (row.broadSearchExecutedNow !== false) throw new Error(row.runnerTargetId + ": broad search must remain false.");
    if (row.classifierExecutedNow !== false) throw new Error(row.runnerTargetId + ": classifier must remain false.");
    if (row.canonicalWriteExecutedNow !== false) throw new Error(row.runnerTargetId + ": canonical write must remain false.");
    if (row.productionWriteExecutedNow !== false) throw new Error(row.runnerTargetId + ": production write must remain false.");
    if (row.seasonStateTruthAssertedNow !== false) throw new Error(row.runnerTargetId + ": season-state truth assertion must remain false.");
    if (row.controlledLocalExecutionRowIsTruth !== false) throw new Error(row.runnerTargetId + ": controlled local execution row must not be truth.");
  }

  return rows;
}

function buildReviewRow(row) {
  return {
    runnerTargetId: row.runnerTargetId,
    actionId: row.actionId,
    actionType: row.actionType,
    executionPlanStep: row.executionPlanStep,
    runnerStage: row.runnerStage,
    controlledLocalExecutionStatus: row.controlledLocalExecutionStatus,

    reviewStatus: "controlled_local_whole_map_resumption_execution_verified",
    reviewDisposition: "ready_for_post_resumption_full_map_work_queue_selection",

    sourceCandidateType: row.sourceCandidateType || null,
    sourceFilePath: row.sourceFilePath || null,
    sourceFileSha256: row.sourceFileSha256 || null,
    reusableFamilies: row.reusableFamilies || [],
    competitionSlugs: row.competitionSlugs || [],
    sportomediaDisposition: row.sportomediaDisposition || null,

    localRoutingExecutedNow: row.localRoutingExecutedNow,
    wholeMapMainLaneResumed: row.wholeMapMainLaneResumed,
    sportomediaBlocksWholeMap: row.sportomediaBlocksWholeMap,
    providerMicroProbingContinuedInMainLane: row.providerMicroProbingContinuedInMainLane,

    maySelectPostResumptionFullMapWorkQueue: true,
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
    executionReviewRowIsTruth: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    nextAllowedStep: "build_post_resumption_full_map_work_queue_selector",
    nextBlockedStep: "fetch_search_broad_search_classifier_canonical_write_production_write_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const execution = readJson(args.executionInput);
  const executionRows = validateExecution(execution);

  const reviewRows = executionRows
    .map(buildReviewRow)
    .sort((a, b) => a.runnerStage.localeCompare(b.runnerStage) || a.runnerTargetId.localeCompare(b.runnerTargetId));

  const verifiedRows = reviewRows.filter((row) => row.reviewStatus === "controlled_local_whole_map_resumption_execution_verified");
  const blockedRows = reviewRows.filter((row) => row.reviewStatus !== "controlled_local_whole_map_resumption_execution_verified");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "review-football-truth-controlled-local-whole-map-resumption-execution-results-file",
    mode: "no_write_controlled_local_whole_map_resumption_execution_review",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      controlledLocalWholeMapResumptionExecution: args.executionInput
    },
    summary: {
      controlledLocalExecutionReadCount: 1,
      controlledLocalWholeMapResumptionExecutionReviewRowCount: reviewRows.length,
      controlledLocalWholeMapResumptionExecutionVerifiedCount: verifiedRows.length,
      controlledLocalWholeMapResumptionExecutionReviewBlockedCount: blockedRows.length,

      localPrimaryManifestBindingVerifiedCount:
        reviewRows.filter((row) => row.controlledLocalExecutionStatus === "executed_local_primary_manifest_binding").length,
      localFollowupQualityGatedQueueBindingVerifiedCount:
        reviewRows.filter((row) => row.controlledLocalExecutionStatus === "executed_local_followup_quality_gated_queue_binding").length,
      localActiveWorkstreamExecutionWaveBindingVerifiedCount:
        reviewRows.filter((row) => row.controlledLocalExecutionStatus === "executed_local_active_workstream_execution_wave_binding").length,
      localReusableFamilyPatternPromotionBindingVerifiedCount:
        reviewRows.filter((row) => row.controlledLocalExecutionStatus === "executed_local_reusable_family_pattern_promotion_binding").length,
      localProviderFamilyRepairBacklogDeferralBindingVerifiedCount:
        reviewRows.filter((row) => row.controlledLocalExecutionStatus === "executed_local_provider_family_repair_backlog_deferral_binding").length,

      laligaReusablePatternReviewVerifiedCount:
        reviewRows.filter((row) => (row.reusableFamilies || []).includes("laliga")).length,
      norwayNtfReusablePatternReviewVerifiedCount:
        reviewRows.filter((row) => (row.reusableFamilies || []).includes("norway_ntf")).length,
      sportomediaProviderFamilyRepairDeferredReviewVerifiedCount:
        reviewRows.filter((row) => (row.reusableFamilies || []).includes("sportomedia")).length,

      wholeMapMainLaneResumedVerifiedCount:
        reviewRows.filter((row) => row.wholeMapMainLaneResumed).length,
      sportomediaBlocksWholeMapCount:
        reviewRows.filter((row) => row.sportomediaBlocksWholeMap).length,
      providerMicroProbingContinuedInMainLaneCount:
        reviewRows.filter((row) => row.providerMicroProbingContinuedInMainLane).length,

      maySelectPostResumptionFullMapWorkQueueCount:
        blockedRows.length === 0 ? 1 : 0,

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
      controlledLocalWholeMapResumptionExecutionReviewTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        blockedRows.length === 0
          ? "build_post_resumption_full_map_work_queue_selector"
          : "repair_controlled_local_whole_map_resumption_execution_results"
    },
    counts: {
      byReviewStatus: countBy(reviewRows, "reviewStatus"),
      byReviewDisposition: countBy(reviewRows, "reviewDisposition"),
      byActionType: countBy(reviewRows, "actionType"),
      byExecutionPlanStep: countBy(reviewRows, "executionPlanStep"),
      byRunnerStage: countBy(reviewRows, "runnerStage"),
      byControlledLocalExecutionStatus: countBy(reviewRows, "controlledLocalExecutionStatus"),
      byNextAllowedStep: countBy(reviewRows, "nextAllowedStep")
    },
    wholeMapResumptionPolicy: {
      wholeMapMainLaneResumed: true,
      sportomediaBlocksWholeMap: false,
      sportomediaDisposition: "provider_family_repair_backlog",
      preservedReusableFamilyWins: ["laliga", "norway_ntf"],
      controlledLocalExecutionReviewed: blockedRows.length === 0,
      nextAction: blockedRows.length === 0
        ? "build_post_resumption_full_map_work_queue_selector"
        : "repair_controlled_local_whole_map_resumption_execution_results",
      noProviderMicroProbingInMainLane: true,
      noFetchExecuted: true,
      noSearchExecuted: true,
      noBroadSearchExecuted: true,
      noClassifierExecuted: true,
      noCanonicalWritesExecuted: true,
      noProductionWritesExecuted: true,
      noTruthAssertionsExecuted: true
    },
    guardrails: [
      "This review reads the controlled local whole-map resumption execution output only.",
      "It does not execute.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Review rows are workflow routing artifacts, not truth assertions.",
      "Sportomedia remains in provider-family repair backlog and does not block the full-map main lane.",
      "The next step is a no-write post-resumption full-map work queue selector."
    ],
    reviewRows,
    blockedRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    controlledLocalExecutionReadCount: output.summary.controlledLocalExecutionReadCount,
    controlledLocalWholeMapResumptionExecutionReviewRowCount: output.summary.controlledLocalWholeMapResumptionExecutionReviewRowCount,
    controlledLocalWholeMapResumptionExecutionVerifiedCount: output.summary.controlledLocalWholeMapResumptionExecutionVerifiedCount,
    controlledLocalWholeMapResumptionExecutionReviewBlockedCount: output.summary.controlledLocalWholeMapResumptionExecutionReviewBlockedCount,
    localPrimaryManifestBindingVerifiedCount: output.summary.localPrimaryManifestBindingVerifiedCount,
    localFollowupQualityGatedQueueBindingVerifiedCount: output.summary.localFollowupQualityGatedQueueBindingVerifiedCount,
    localActiveWorkstreamExecutionWaveBindingVerifiedCount: output.summary.localActiveWorkstreamExecutionWaveBindingVerifiedCount,
    localReusableFamilyPatternPromotionBindingVerifiedCount: output.summary.localReusableFamilyPatternPromotionBindingVerifiedCount,
    localProviderFamilyRepairBacklogDeferralBindingVerifiedCount: output.summary.localProviderFamilyRepairBacklogDeferralBindingVerifiedCount,
    laligaReusablePatternReviewVerifiedCount: output.summary.laligaReusablePatternReviewVerifiedCount,
    norwayNtfReusablePatternReviewVerifiedCount: output.summary.norwayNtfReusablePatternReviewVerifiedCount,
    sportomediaProviderFamilyRepairDeferredReviewVerifiedCount: output.summary.sportomediaProviderFamilyRepairDeferredReviewVerifiedCount,
    wholeMapMainLaneResumedVerifiedCount: output.summary.wholeMapMainLaneResumedVerifiedCount,
    sportomediaBlocksWholeMapCount: output.summary.sportomediaBlocksWholeMapCount,
    providerMicroProbingContinuedInMainLaneCount: output.summary.providerMicroProbingContinuedInMainLaneCount,
    maySelectPostResumptionFullMapWorkQueueCount: output.summary.maySelectPostResumptionFullMapWorkQueueCount,
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
    controlledLocalWholeMapResumptionExecutionReviewTruthCount: output.summary.controlledLocalWholeMapResumptionExecutionReviewTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
