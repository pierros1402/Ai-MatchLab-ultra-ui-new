#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULTS = {
  date: "2026-06-14",
  selectorInput: "data/football-truth/_diagnostics/post-resumption-full-map-work-queue-selector-2026-06-14/post-resumption-full-map-work-queue-selector-2026-06-14.json",
  output: "data/football-truth/_diagnostics/post-resumption-full-map-work-queue-bundle-2026-06-14/post-resumption-full-map-work-queue-bundle-2026-06-14.json"
};

const REQUIRED_QUEUE_LANES = [
  "full_map_primary_manifest_lane",
  "full_map_followup_quality_gated_lane",
  "full_map_active_workstream_execution_wave_lane",
  "full_map_reusable_family_acceleration_lane",
  "provider_family_repair_backlog_lane"
];

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--selector-input") args.selectorInput = argv[++i];
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
  if (!(key in summary)) throw new Error("Missing selector summary key: " + key);
  if (summary[key] !== expected) {
    throw new Error(`Selector guardrail failed for ${key}: expected ${expected}, got ${summary[key]}`);
  }
}

function validateSelector(selector) {
  const s = selector.summary || {};

  assertSummary(s, "controlledLocalExecutionReviewReadCount", 1);
  assertSummary(s, "postResumptionFullMapWorkQueueSelectorRowCount", 5);
  assertSummary(s, "postResumptionFullMapWorkQueueSelectedCount", 5);
  assertSummary(s, "postResumptionFullMapWorkQueueBlockedCount", 0);
  assertSummary(s, "primaryManifestLaneSelectedCount", 1);
  assertSummary(s, "followupQualityGatedLaneSelectedCount", 1);
  assertSummary(s, "activeWorkstreamExecutionWaveLaneSelectedCount", 1);
  assertSummary(s, "reusableFamilyAccelerationLaneSelectedCount", 1);
  assertSummary(s, "providerFamilyRepairBacklogLaneSelectedCount", 1);
  assertSummary(s, "fullMapMainLaneEligibleQueueCount", 4);
  assertSummary(s, "repairBacklogEligibleQueueCount", 1);
  assertSummary(s, "laligaReusablePatternQueueSelectedCount", 1);
  assertSummary(s, "norwayNtfReusablePatternQueueSelectedCount", 1);
  assertSummary(s, "sportomediaProviderFamilyRepairQueueSelectedCount", 1);
  assertSummary(s, "wholeMapMainLaneResumedQueueCount", 5);
  assertSummary(s, "sportomediaBlocksWholeMapCount", 0);
  assertSummary(s, "providerMicroProbingContinuedInMainLaneCount", 0);
  assertSummary(s, "mayBuildPostResumptionFullMapWorkQueueBundleCount", 1);

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
  assertSummary(s, "postResumptionFullMapWorkQueueSelectorTruthCount", 0);
  assertSummary(s, "canonicalWrites", 0);
  if (s.productionWrite !== false) throw new Error("Selector productionWrite must be false.");

  const rows = Array.isArray(selector.queueSelectionRows) ? selector.queueSelectionRows : [];
  if (rows.length !== 5) throw new Error("Expected 5 queueSelectionRows.");

  const lanes = new Set(rows.map((row) => row.queueLane));
  for (const lane of REQUIRED_QUEUE_LANES) {
    if (!lanes.has(lane)) throw new Error("Missing required queue lane: " + lane);
  }

  for (const row of rows) {
    if (row.queueSelectionStatus !== "selected_for_post_resumption_full_map_work_queue_bundle") {
      throw new Error(row.queueSelectionId + ": queue row is not selected for bundle.");
    }
    if (row.mayBuildPostResumptionFullMapWorkQueueBundle !== true) {
      throw new Error(row.queueSelectionId + ": bundle build must be allowed.");
    }
    if (row.queueLane === "provider_family_repair_backlog_lane") {
      if (row.mainLaneEligible !== false) throw new Error(row.queueSelectionId + ": repair backlog must not be main-lane eligible.");
      if (row.repairBacklogEligible !== true) throw new Error(row.queueSelectionId + ": repair backlog must be repair-backlog eligible.");
    } else {
      if (row.mainLaneEligible !== true) throw new Error(row.queueSelectionId + ": main-lane row must be main-lane eligible.");
      if (row.repairBacklogEligible !== false) throw new Error(row.queueSelectionId + ": main-lane row must not be repair-backlog eligible.");
    }

    if (row.sportomediaBlocksWholeMap !== false) throw new Error(row.queueSelectionId + ": Sportomedia must not block whole map.");
    if (row.providerMicroProbingContinuedInMainLane !== false) throw new Error(row.queueSelectionId + ": provider micro-probing must not continue in main lane.");
    if (row.wholeMapMainLaneResumed !== true) throw new Error(row.queueSelectionId + ": whole-map main lane must be resumed.");

    if (row.fetchExecutedNow !== false) throw new Error(row.queueSelectionId + ": fetch must remain false.");
    if (row.searchExecutedNow !== false) throw new Error(row.queueSelectionId + ": search must remain false.");
    if (row.broadSearchExecutedNow !== false) throw new Error(row.queueSelectionId + ": broad search must remain false.");
    if (row.classifierExecutedNow !== false) throw new Error(row.queueSelectionId + ": classifier must remain false.");
    if (row.canonicalWriteExecutedNow !== false) throw new Error(row.queueSelectionId + ": canonical write must remain false.");
    if (row.productionWriteExecutedNow !== false) throw new Error(row.queueSelectionId + ": production write must remain false.");
    if (row.seasonStateTruthAssertedNow !== false) throw new Error(row.queueSelectionId + ": season-state truth assertion must remain false.");
    if (row.queueSelectionRowIsTruth !== false) throw new Error(row.queueSelectionId + ": queue selection row must not be truth.");
  }

  return rows;
}

function buildBundleRow(row) {
  const isRepairBacklog = row.queueLane === "provider_family_repair_backlog_lane";

  return {
    workQueueBundleId: `post-resumption-bundle:${row.queueLane}`,
    queueSelectionId: row.queueSelectionId,
    queueLane: row.queueLane,
    queuePriority: row.queuePriority,
    queueRole: row.queueRole,
    workQueueBundleStatus: "ready_for_post_resumption_full_map_work_queue_bundle_quality_gate",

    runnerTargetId: row.runnerTargetId,
    actionId: row.actionId,
    actionType: row.actionType,
    executionPlanStep: row.executionPlanStep,
    runnerStage: row.runnerStage,
    controlledLocalExecutionStatus: row.controlledLocalExecutionStatus,
    reviewStatus: row.reviewStatus,

    sourceCandidateType: row.sourceCandidateType || null,
    sourceFilePath: row.sourceFilePath || null,
    sourceFileSha256: row.sourceFileSha256 || null,
    reusableFamilies: row.reusableFamilies || [],
    competitionSlugs: row.competitionSlugs || [],
    sportomediaDisposition: row.sportomediaDisposition || null,

    bundleLaneType: isRepairBacklog ? "repair_backlog_lane" : "main_lane",
    bundleMainLaneEligible: !isRepairBacklog,
    bundleRepairBacklogEligible: isRepairBacklog,
    bundleExecutionOrder: row.queuePriority,
    wholeMapMainLaneResumed: true,
    sportomediaBlocksWholeMap: false,
    providerMicroProbingContinuedInMainLane: false,

    mayProceedToPostResumptionFullMapWorkQueueBundleQualityGate: true,
    workQueueBundleIsExecutionPermissionNow: false,
    workQueueBundleIsFetchPermissionNow: false,

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
    workQueueBundleRowIsTruth: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    nextAllowedStep: "run_post_resumption_full_map_work_queue_bundle_quality_gate",
    nextBlockedStep: "fetch_search_broad_search_classifier_canonical_write_production_write_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const selector = readJson(args.selectorInput);
  const queueSelectionRows = validateSelector(selector);

  const workQueueBundleRows = queueSelectionRows
    .map(buildBundleRow)
    .sort((a, b) => a.bundleExecutionOrder - b.bundleExecutionOrder || a.workQueueBundleId.localeCompare(b.workQueueBundleId));

  const readyRows = workQueueBundleRows.filter((row) => row.workQueueBundleStatus === "ready_for_post_resumption_full_map_work_queue_bundle_quality_gate");
  const blockedRows = workQueueBundleRows.filter((row) => row.workQueueBundleStatus !== "ready_for_post_resumption_full_map_work_queue_bundle_quality_gate");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-post-resumption-full-map-work-queue-bundle-file",
    mode: "no_write_post_resumption_full_map_work_queue_bundle",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      postResumptionFullMapWorkQueueSelector: args.selectorInput
    },
    summary: {
      postResumptionFullMapWorkQueueSelectorReadCount: 1,
      postResumptionFullMapWorkQueueBundleRowCount: workQueueBundleRows.length,
      postResumptionFullMapWorkQueueBundleReadyCount: readyRows.length,
      postResumptionFullMapWorkQueueBundleBlockedCount: blockedRows.length,

      primaryManifestBundleLaneCount:
        workQueueBundleRows.filter((row) => row.queueLane === "full_map_primary_manifest_lane").length,
      followupQualityGatedBundleLaneCount:
        workQueueBundleRows.filter((row) => row.queueLane === "full_map_followup_quality_gated_lane").length,
      activeWorkstreamExecutionWaveBundleLaneCount:
        workQueueBundleRows.filter((row) => row.queueLane === "full_map_active_workstream_execution_wave_lane").length,
      reusableFamilyAccelerationBundleLaneCount:
        workQueueBundleRows.filter((row) => row.queueLane === "full_map_reusable_family_acceleration_lane").length,
      providerFamilyRepairBacklogBundleLaneCount:
        workQueueBundleRows.filter((row) => row.queueLane === "provider_family_repair_backlog_lane").length,

      mainLaneBundleRowCount:
        workQueueBundleRows.filter((row) => row.bundleLaneType === "main_lane").length,
      repairBacklogBundleRowCount:
        workQueueBundleRows.filter((row) => row.bundleLaneType === "repair_backlog_lane").length,

      laligaReusablePatternBundleCount:
        workQueueBundleRows.filter((row) => (row.reusableFamilies || []).includes("laliga")).length,
      norwayNtfReusablePatternBundleCount:
        workQueueBundleRows.filter((row) => (row.reusableFamilies || []).includes("norway_ntf")).length,
      sportomediaProviderFamilyRepairBundleCount:
        workQueueBundleRows.filter((row) => (row.reusableFamilies || []).includes("sportomedia")).length,

      wholeMapMainLaneResumedBundleCount:
        workQueueBundleRows.filter((row) => row.wholeMapMainLaneResumed).length,
      sportomediaBlocksWholeMapCount:
        workQueueBundleRows.filter((row) => row.sportomediaBlocksWholeMap).length,
      providerMicroProbingContinuedInMainLaneCount:
        workQueueBundleRows.filter((row) => row.providerMicroProbingContinuedInMainLane).length,

      mayProceedToPostResumptionFullMapWorkQueueBundleQualityGateCount:
        blockedRows.length === 0 ? 1 : 0,

      workQueueBundleIsExecutionPermissionNowCount:
        workQueueBundleRows.filter((row) => row.workQueueBundleIsExecutionPermissionNow).length,
      workQueueBundleIsFetchPermissionNowCount:
        workQueueBundleRows.filter((row) => row.workQueueBundleIsFetchPermissionNow).length,

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
      postResumptionFullMapWorkQueueBundleTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        blockedRows.length === 0
          ? "run_post_resumption_full_map_work_queue_bundle_quality_gate"
          : "repair_post_resumption_full_map_work_queue_bundle"
    },
    counts: {
      byQueueLane: countBy(workQueueBundleRows, "queueLane"),
      byQueueRole: countBy(workQueueBundleRows, "queueRole"),
      byBundleLaneType: countBy(workQueueBundleRows, "bundleLaneType"),
      byWorkQueueBundleStatus: countBy(workQueueBundleRows, "workQueueBundleStatus"),
      byActionType: countBy(workQueueBundleRows, "actionType"),
      byRunnerStage: countBy(workQueueBundleRows, "runnerStage"),
      byNextAllowedStep: countBy(workQueueBundleRows, "nextAllowedStep")
    },
    wholeMapResumptionPolicy: {
      wholeMapMainLaneResumed: true,
      sportomediaBlocksWholeMap: false,
      sportomediaDisposition: "provider_family_repair_backlog",
      preservedReusableFamilyWins: ["laliga", "norway_ntf"],
      mainLaneBundleRows: 4,
      repairBacklogBundleRows: 1,
      repairBacklogSeparated: true,
      nextAction: blockedRows.length === 0
        ? "run_post_resumption_full_map_work_queue_bundle_quality_gate"
        : "repair_post_resumption_full_map_work_queue_bundle",
      noProviderMicroProbingInMainLane: true,
      workQueueBundleIsNotExecution: true,
      noFetchExecuted: true,
      noSearchExecuted: true,
      noBroadSearchExecuted: true,
      noClassifierExecuted: true,
      noCanonicalWritesExecuted: true,
      noProductionWritesExecuted: true,
      noTruthAssertionsExecuted: true
    },
    guardrails: [
      "This bundle reads the post-resumption full-map work queue selector only.",
      "It does not execute.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Work queue bundle rows are workflow routing artifacts, not truth assertions.",
      "Sportomedia remains in provider-family repair backlog and does not block the full-map main lane.",
      "The next step is a no-write work queue bundle quality gate."
    ],
    workQueueBundleRows,
    blockedRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    postResumptionFullMapWorkQueueSelectorReadCount: output.summary.postResumptionFullMapWorkQueueSelectorReadCount,
    postResumptionFullMapWorkQueueBundleRowCount: output.summary.postResumptionFullMapWorkQueueBundleRowCount,
    postResumptionFullMapWorkQueueBundleReadyCount: output.summary.postResumptionFullMapWorkQueueBundleReadyCount,
    postResumptionFullMapWorkQueueBundleBlockedCount: output.summary.postResumptionFullMapWorkQueueBundleBlockedCount,
    primaryManifestBundleLaneCount: output.summary.primaryManifestBundleLaneCount,
    followupQualityGatedBundleLaneCount: output.summary.followupQualityGatedBundleLaneCount,
    activeWorkstreamExecutionWaveBundleLaneCount: output.summary.activeWorkstreamExecutionWaveBundleLaneCount,
    reusableFamilyAccelerationBundleLaneCount: output.summary.reusableFamilyAccelerationBundleLaneCount,
    providerFamilyRepairBacklogBundleLaneCount: output.summary.providerFamilyRepairBacklogBundleLaneCount,
    mainLaneBundleRowCount: output.summary.mainLaneBundleRowCount,
    repairBacklogBundleRowCount: output.summary.repairBacklogBundleRowCount,
    laligaReusablePatternBundleCount: output.summary.laligaReusablePatternBundleCount,
    norwayNtfReusablePatternBundleCount: output.summary.norwayNtfReusablePatternBundleCount,
    sportomediaProviderFamilyRepairBundleCount: output.summary.sportomediaProviderFamilyRepairBundleCount,
    wholeMapMainLaneResumedBundleCount: output.summary.wholeMapMainLaneResumedBundleCount,
    sportomediaBlocksWholeMapCount: output.summary.sportomediaBlocksWholeMapCount,
    providerMicroProbingContinuedInMainLaneCount: output.summary.providerMicroProbingContinuedInMainLaneCount,
    mayProceedToPostResumptionFullMapWorkQueueBundleQualityGateCount: output.summary.mayProceedToPostResumptionFullMapWorkQueueBundleQualityGateCount,
    workQueueBundleIsExecutionPermissionNowCount: output.summary.workQueueBundleIsExecutionPermissionNowCount,
    workQueueBundleIsFetchPermissionNowCount: output.summary.workQueueBundleIsFetchPermissionNowCount,
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
    postResumptionFullMapWorkQueueBundleTruthCount: output.summary.postResumptionFullMapWorkQueueBundleTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
