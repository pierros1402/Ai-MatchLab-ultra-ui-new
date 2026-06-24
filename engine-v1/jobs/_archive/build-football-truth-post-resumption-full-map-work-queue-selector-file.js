#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULTS = {
  date: "2026-06-14",
  reviewInput: "data/football-truth/_diagnostics/controlled-local-whole-map-resumption-execution-review-2026-06-14/controlled-local-whole-map-resumption-execution-review-2026-06-14.json",
  output: "data/football-truth/_diagnostics/post-resumption-full-map-work-queue-selector-2026-06-14/post-resumption-full-map-work-queue-selector-2026-06-14.json"
};

const REQUIRED_REVIEW_STATUSES = [
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
    else if (arg === "--review-input") args.reviewInput = argv[++i];
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
  if (!(key in summary)) throw new Error("Missing review summary key: " + key);
  if (summary[key] !== expected) {
    throw new Error(`Review guardrail failed for ${key}: expected ${expected}, got ${summary[key]}`);
  }
}

function validateReview(review) {
  const s = review.summary || {};

  assertSummary(s, "controlledLocalExecutionReadCount", 1);
  assertSummary(s, "controlledLocalWholeMapResumptionExecutionReviewRowCount", 5);
  assertSummary(s, "controlledLocalWholeMapResumptionExecutionVerifiedCount", 5);
  assertSummary(s, "controlledLocalWholeMapResumptionExecutionReviewBlockedCount", 0);
  assertSummary(s, "localPrimaryManifestBindingVerifiedCount", 1);
  assertSummary(s, "localFollowupQualityGatedQueueBindingVerifiedCount", 1);
  assertSummary(s, "localActiveWorkstreamExecutionWaveBindingVerifiedCount", 1);
  assertSummary(s, "localReusableFamilyPatternPromotionBindingVerifiedCount", 1);
  assertSummary(s, "localProviderFamilyRepairBacklogDeferralBindingVerifiedCount", 1);
  assertSummary(s, "laligaReusablePatternReviewVerifiedCount", 1);
  assertSummary(s, "norwayNtfReusablePatternReviewVerifiedCount", 1);
  assertSummary(s, "sportomediaProviderFamilyRepairDeferredReviewVerifiedCount", 1);
  assertSummary(s, "wholeMapMainLaneResumedVerifiedCount", 5);
  assertSummary(s, "sportomediaBlocksWholeMapCount", 0);
  assertSummary(s, "providerMicroProbingContinuedInMainLaneCount", 0);
  assertSummary(s, "maySelectPostResumptionFullMapWorkQueueCount", 1);

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
  assertSummary(s, "controlledLocalWholeMapResumptionExecutionReviewTruthCount", 0);
  assertSummary(s, "canonicalWrites", 0);
  if (s.productionWrite !== false) throw new Error("Review productionWrite must be false.");

  const rows = Array.isArray(review.reviewRows) ? review.reviewRows : [];
  if (rows.length !== 5) throw new Error("Expected 5 reviewRows.");

  const statuses = new Set(rows.map((row) => row.controlledLocalExecutionStatus));
  for (const status of REQUIRED_REVIEW_STATUSES) {
    if (!statuses.has(status)) throw new Error("Missing required review status: " + status);
  }

  for (const row of rows) {
    if (row.reviewStatus !== "controlled_local_whole_map_resumption_execution_verified") {
      throw new Error(row.runnerTargetId + ": review row is not verified.");
    }
    if (row.reviewDisposition !== "ready_for_post_resumption_full_map_work_queue_selection") {
      throw new Error(row.runnerTargetId + ": review row is not ready for work queue selection.");
    }
    if (row.maySelectPostResumptionFullMapWorkQueue !== true) {
      throw new Error(row.runnerTargetId + ": work queue selection must be allowed.");
    }
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
    if (row.executionReviewRowIsTruth !== false) throw new Error(row.runnerTargetId + ": review row must not be truth.");
  }

  return rows;
}

function queueLaneFor(row) {
  if (row.controlledLocalExecutionStatus === "executed_local_primary_manifest_binding") {
    return {
      queueLane: "full_map_primary_manifest_lane",
      queuePriority: 1,
      queueRole: "primary_main_lane_resume_anchor"
    };
  }

  if (row.controlledLocalExecutionStatus === "executed_local_followup_quality_gated_queue_binding") {
    return {
      queueLane: "full_map_followup_quality_gated_lane",
      queuePriority: 2,
      queueRole: "quality_gated_followup_work_queue"
    };
  }

  if (row.controlledLocalExecutionStatus === "executed_local_active_workstream_execution_wave_binding") {
    return {
      queueLane: "full_map_active_workstream_execution_wave_lane",
      queuePriority: 3,
      queueRole: "active_execution_wave_context"
    };
  }

  if (row.controlledLocalExecutionStatus === "executed_local_reusable_family_pattern_promotion_binding") {
    return {
      queueLane: "full_map_reusable_family_acceleration_lane",
      queuePriority: 4,
      queueRole: "laliga_norway_reusable_pattern_expansion"
    };
  }

  if (row.controlledLocalExecutionStatus === "executed_local_provider_family_repair_backlog_deferral_binding") {
    return {
      queueLane: "provider_family_repair_backlog_lane",
      queuePriority: 5,
      queueRole: "sportomedia_deferred_repair_not_main_lane_blocker"
    };
  }

  return {
    queueLane: "unknown_post_resumption_lane",
    queuePriority: 99,
    queueRole: "unknown"
  };
}

function buildSelectorRow(row) {
  const lane = queueLaneFor(row);
  const isRepairBacklog = lane.queueLane === "provider_family_repair_backlog_lane";

  return {
    queueSelectionId: `post-resumption:${lane.queueLane}`,
    runnerTargetId: row.runnerTargetId,
    actionId: row.actionId,
    actionType: row.actionType,
    executionPlanStep: row.executionPlanStep,
    runnerStage: row.runnerStage,
    controlledLocalExecutionStatus: row.controlledLocalExecutionStatus,
    reviewStatus: row.reviewStatus,

    queueLane: lane.queueLane,
    queuePriority: lane.queuePriority,
    queueRole: lane.queueRole,
    queueSelectionStatus: "selected_for_post_resumption_full_map_work_queue_bundle",

    sourceCandidateType: row.sourceCandidateType || null,
    sourceFilePath: row.sourceFilePath || null,
    sourceFileSha256: row.sourceFileSha256 || null,
    reusableFamilies: row.reusableFamilies || [],
    competitionSlugs: row.competitionSlugs || [],
    sportomediaDisposition: row.sportomediaDisposition || null,

    mainLaneEligible: !isRepairBacklog,
    repairBacklogEligible: isRepairBacklog,
    sportomediaBlocksWholeMap: false,
    providerMicroProbingContinuedInMainLane: false,
    wholeMapMainLaneResumed: true,

    mayBuildPostResumptionFullMapWorkQueueBundle: true,
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
    queueSelectionRowIsTruth: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    nextAllowedStep: "build_post_resumption_full_map_work_queue_bundle",
    nextBlockedStep: "fetch_search_broad_search_classifier_canonical_write_production_write_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const review = readJson(args.reviewInput);
  const reviewRows = validateReview(review);

  const queueSelectionRows = reviewRows
    .map(buildSelectorRow)
    .sort((a, b) => a.queuePriority - b.queuePriority || a.queueSelectionId.localeCompare(b.queueSelectionId));

  const selectedRows = queueSelectionRows.filter((row) => row.queueSelectionStatus === "selected_for_post_resumption_full_map_work_queue_bundle");
  const blockedRows = queueSelectionRows.filter((row) => row.queueSelectionStatus !== "selected_for_post_resumption_full_map_work_queue_bundle");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-post-resumption-full-map-work-queue-selector-file",
    mode: "no_write_post_resumption_full_map_work_queue_selector",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      controlledLocalWholeMapResumptionExecutionReview: args.reviewInput
    },
    summary: {
      controlledLocalExecutionReviewReadCount: 1,
      postResumptionFullMapWorkQueueSelectorRowCount: queueSelectionRows.length,
      postResumptionFullMapWorkQueueSelectedCount: selectedRows.length,
      postResumptionFullMapWorkQueueBlockedCount: blockedRows.length,

      primaryManifestLaneSelectedCount:
        queueSelectionRows.filter((row) => row.queueLane === "full_map_primary_manifest_lane").length,
      followupQualityGatedLaneSelectedCount:
        queueSelectionRows.filter((row) => row.queueLane === "full_map_followup_quality_gated_lane").length,
      activeWorkstreamExecutionWaveLaneSelectedCount:
        queueSelectionRows.filter((row) => row.queueLane === "full_map_active_workstream_execution_wave_lane").length,
      reusableFamilyAccelerationLaneSelectedCount:
        queueSelectionRows.filter((row) => row.queueLane === "full_map_reusable_family_acceleration_lane").length,
      providerFamilyRepairBacklogLaneSelectedCount:
        queueSelectionRows.filter((row) => row.queueLane === "provider_family_repair_backlog_lane").length,

      fullMapMainLaneEligibleQueueCount:
        queueSelectionRows.filter((row) => row.mainLaneEligible).length,
      repairBacklogEligibleQueueCount:
        queueSelectionRows.filter((row) => row.repairBacklogEligible).length,

      laligaReusablePatternQueueSelectedCount:
        queueSelectionRows.filter((row) => (row.reusableFamilies || []).includes("laliga")).length,
      norwayNtfReusablePatternQueueSelectedCount:
        queueSelectionRows.filter((row) => (row.reusableFamilies || []).includes("norway_ntf")).length,
      sportomediaProviderFamilyRepairQueueSelectedCount:
        queueSelectionRows.filter((row) => (row.reusableFamilies || []).includes("sportomedia")).length,

      wholeMapMainLaneResumedQueueCount:
        queueSelectionRows.filter((row) => row.wholeMapMainLaneResumed).length,
      sportomediaBlocksWholeMapCount:
        queueSelectionRows.filter((row) => row.sportomediaBlocksWholeMap).length,
      providerMicroProbingContinuedInMainLaneCount:
        queueSelectionRows.filter((row) => row.providerMicroProbingContinuedInMainLane).length,

      mayBuildPostResumptionFullMapWorkQueueBundleCount:
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
      postResumptionFullMapWorkQueueSelectorTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        blockedRows.length === 0
          ? "build_post_resumption_full_map_work_queue_bundle"
          : "repair_post_resumption_full_map_work_queue_selector"
    },
    counts: {
      byQueueLane: countBy(queueSelectionRows, "queueLane"),
      byQueueRole: countBy(queueSelectionRows, "queueRole"),
      byQueueSelectionStatus: countBy(queueSelectionRows, "queueSelectionStatus"),
      byActionType: countBy(queueSelectionRows, "actionType"),
      byRunnerStage: countBy(queueSelectionRows, "runnerStage"),
      byNextAllowedStep: countBy(queueSelectionRows, "nextAllowedStep")
    },
    wholeMapResumptionPolicy: {
      wholeMapMainLaneResumed: true,
      sportomediaBlocksWholeMap: false,
      sportomediaDisposition: "provider_family_repair_backlog",
      preservedReusableFamilyWins: ["laliga", "norway_ntf"],
      mainLaneQueueSelected: true,
      repairBacklogSeparated: true,
      nextAction: blockedRows.length === 0
        ? "build_post_resumption_full_map_work_queue_bundle"
        : "repair_post_resumption_full_map_work_queue_selector",
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
      "This selector reads the controlled local whole-map resumption execution review only.",
      "It does not execute.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Queue selector rows are workflow routing artifacts, not truth assertions.",
      "Sportomedia remains in provider-family repair backlog and does not block the full-map main lane.",
      "The next step is a no-write post-resumption full-map work queue bundle."
    ],
    queueSelectionRows,
    blockedRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    controlledLocalExecutionReviewReadCount: output.summary.controlledLocalExecutionReviewReadCount,
    postResumptionFullMapWorkQueueSelectorRowCount: output.summary.postResumptionFullMapWorkQueueSelectorRowCount,
    postResumptionFullMapWorkQueueSelectedCount: output.summary.postResumptionFullMapWorkQueueSelectedCount,
    postResumptionFullMapWorkQueueBlockedCount: output.summary.postResumptionFullMapWorkQueueBlockedCount,
    primaryManifestLaneSelectedCount: output.summary.primaryManifestLaneSelectedCount,
    followupQualityGatedLaneSelectedCount: output.summary.followupQualityGatedLaneSelectedCount,
    activeWorkstreamExecutionWaveLaneSelectedCount: output.summary.activeWorkstreamExecutionWaveLaneSelectedCount,
    reusableFamilyAccelerationLaneSelectedCount: output.summary.reusableFamilyAccelerationLaneSelectedCount,
    providerFamilyRepairBacklogLaneSelectedCount: output.summary.providerFamilyRepairBacklogLaneSelectedCount,
    fullMapMainLaneEligibleQueueCount: output.summary.fullMapMainLaneEligibleQueueCount,
    repairBacklogEligibleQueueCount: output.summary.repairBacklogEligibleQueueCount,
    laligaReusablePatternQueueSelectedCount: output.summary.laligaReusablePatternQueueSelectedCount,
    norwayNtfReusablePatternQueueSelectedCount: output.summary.norwayNtfReusablePatternQueueSelectedCount,
    sportomediaProviderFamilyRepairQueueSelectedCount: output.summary.sportomediaProviderFamilyRepairQueueSelectedCount,
    wholeMapMainLaneResumedQueueCount: output.summary.wholeMapMainLaneResumedQueueCount,
    sportomediaBlocksWholeMapCount: output.summary.sportomediaBlocksWholeMapCount,
    providerMicroProbingContinuedInMainLaneCount: output.summary.providerMicroProbingContinuedInMainLaneCount,
    mayBuildPostResumptionFullMapWorkQueueBundleCount: output.summary.mayBuildPostResumptionFullMapWorkQueueBundleCount,
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
    postResumptionFullMapWorkQueueSelectorTruthCount: output.summary.postResumptionFullMapWorkQueueSelectorTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
