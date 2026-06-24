#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULTS = {
  date: "2026-06-14",
  bundleInput: "data/football-truth/_diagnostics/post-resumption-full-map-work-queue-bundle-2026-06-14/post-resumption-full-map-work-queue-bundle-2026-06-14.json",
  output: "data/football-truth/_diagnostics/post-resumption-full-map-work-queue-bundle-quality-gate-2026-06-14/post-resumption-full-map-work-queue-bundle-quality-gate-2026-06-14.json"
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

  assertSummary(s, "postResumptionFullMapWorkQueueSelectorReadCount", 1);
  assertSummary(s, "postResumptionFullMapWorkQueueBundleRowCount", 5);
  assertSummary(s, "postResumptionFullMapWorkQueueBundleReadyCount", 5);
  assertSummary(s, "postResumptionFullMapWorkQueueBundleBlockedCount", 0);
  assertSummary(s, "primaryManifestBundleLaneCount", 1);
  assertSummary(s, "followupQualityGatedBundleLaneCount", 1);
  assertSummary(s, "activeWorkstreamExecutionWaveBundleLaneCount", 1);
  assertSummary(s, "reusableFamilyAccelerationBundleLaneCount", 1);
  assertSummary(s, "providerFamilyRepairBacklogBundleLaneCount", 1);
  assertSummary(s, "mainLaneBundleRowCount", 4);
  assertSummary(s, "repairBacklogBundleRowCount", 1);
  assertSummary(s, "laligaReusablePatternBundleCount", 1);
  assertSummary(s, "norwayNtfReusablePatternBundleCount", 1);
  assertSummary(s, "sportomediaProviderFamilyRepairBundleCount", 1);
  assertSummary(s, "wholeMapMainLaneResumedBundleCount", 5);
  assertSummary(s, "sportomediaBlocksWholeMapCount", 0);
  assertSummary(s, "providerMicroProbingContinuedInMainLaneCount", 0);
  assertSummary(s, "mayProceedToPostResumptionFullMapWorkQueueBundleQualityGateCount", 1);
  assertSummary(s, "workQueueBundleIsExecutionPermissionNowCount", 0);
  assertSummary(s, "workQueueBundleIsFetchPermissionNowCount", 0);

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
  assertSummary(s, "postResumptionFullMapWorkQueueBundleTruthCount", 0);
  assertSummary(s, "canonicalWrites", 0);
  if (s.productionWrite !== false) throw new Error("Bundle productionWrite must be false.");

  const rows = Array.isArray(bundle.workQueueBundleRows) ? bundle.workQueueBundleRows : [];
  if (rows.length !== 5) throw new Error("Expected 5 workQueueBundleRows.");

  const lanes = new Set(rows.map((row) => row.queueLane));
  for (const lane of REQUIRED_QUEUE_LANES) {
    if (!lanes.has(lane)) throw new Error("Missing required queue lane: " + lane);
  }

  for (const row of rows) {
    if (row.workQueueBundleStatus !== "ready_for_post_resumption_full_map_work_queue_bundle_quality_gate") {
      throw new Error(row.workQueueBundleId + ": bundle row is not quality-gate ready.");
    }
    if (row.mayProceedToPostResumptionFullMapWorkQueueBundleQualityGate !== true) {
      throw new Error(row.workQueueBundleId + ": bundle row must allow quality gate.");
    }
    if (row.workQueueBundleIsExecutionPermissionNow !== false) throw new Error(row.workQueueBundleId + ": bundle must not be execution permission now.");
    if (row.workQueueBundleIsFetchPermissionNow !== false) throw new Error(row.workQueueBundleId + ": bundle must not be fetch permission now.");

    if (row.bundleLaneType === "repair_backlog_lane") {
      if (row.bundleMainLaneEligible !== false) throw new Error(row.workQueueBundleId + ": repair backlog must not be main-lane eligible.");
      if (row.bundleRepairBacklogEligible !== true) throw new Error(row.workQueueBundleId + ": repair backlog must be repair-backlog eligible.");
    } else {
      if (row.bundleMainLaneEligible !== true) throw new Error(row.workQueueBundleId + ": main-lane bundle row must be main-lane eligible.");
      if (row.bundleRepairBacklogEligible !== false) throw new Error(row.workQueueBundleId + ": main-lane bundle row must not be repair-backlog eligible.");
    }

    if (row.wholeMapMainLaneResumed !== true) throw new Error(row.workQueueBundleId + ": whole-map main lane must be resumed.");
    if (row.sportomediaBlocksWholeMap !== false) throw new Error(row.workQueueBundleId + ": Sportomedia must not block whole map.");
    if (row.providerMicroProbingContinuedInMainLane !== false) throw new Error(row.workQueueBundleId + ": provider micro-probing must not continue in main lane.");

    if (row.mayExecuteFurtherNow !== false) throw new Error(row.workQueueBundleId + ": mayExecuteFurtherNow must be false.");
    if (row.mayFetchNow !== false) throw new Error(row.workQueueBundleId + ": mayFetchNow must be false.");
    if (row.maySearchNow !== false) throw new Error(row.workQueueBundleId + ": maySearchNow must be false.");
    if (row.mayBroadSearchNow !== false) throw new Error(row.workQueueBundleId + ": mayBroadSearchNow must be false.");
    if (row.mayClassifySeasonStateNow !== false) throw new Error(row.workQueueBundleId + ": mayClassifySeasonStateNow must be false.");
    if (row.mayWriteCanonicalNow !== false) throw new Error(row.workQueueBundleId + ": mayWriteCanonicalNow must be false.");
    if (row.mayAssertTruthNow !== false) throw new Error(row.workQueueBundleId + ": mayAssertTruthNow must be false.");

    if (row.fetchExecutedNow !== false) throw new Error(row.workQueueBundleId + ": fetch must remain false.");
    if (row.searchExecutedNow !== false) throw new Error(row.workQueueBundleId + ": search must remain false.");
    if (row.broadSearchExecutedNow !== false) throw new Error(row.workQueueBundleId + ": broad search must remain false.");
    if (row.classifierExecutedNow !== false) throw new Error(row.workQueueBundleId + ": classifier must remain false.");
    if (row.canonicalWriteExecutedNow !== false) throw new Error(row.workQueueBundleId + ": canonical write must remain false.");
    if (row.productionWriteExecutedNow !== false) throw new Error(row.workQueueBundleId + ": production write must remain false.");
    if (row.seasonStateTruthAssertedNow !== false) throw new Error(row.workQueueBundleId + ": season-state truth assertion must remain false.");
    if (row.workQueueBundleRowIsTruth !== false) throw new Error(row.workQueueBundleId + ": bundle row must not be truth.");
  }

  return rows;
}

function buildGateRow(row) {
  const blockingReasons = [];

  if (row.workQueueBundleStatus !== "ready_for_post_resumption_full_map_work_queue_bundle_quality_gate") {
    blockingReasons.push("bundle_row_not_quality_gate_ready");
  }
  if (row.mayProceedToPostResumptionFullMapWorkQueueBundleQualityGate !== true) {
    blockingReasons.push("bundle_row_does_not_allow_quality_gate");
  }
  if (!REQUIRED_QUEUE_LANES.includes(row.queueLane)) blockingReasons.push("unexpected_queue_lane");

  if (row.workQueueBundleIsExecutionPermissionNow !== false) blockingReasons.push("bundle_is_execution_permission_now");
  if (row.workQueueBundleIsFetchPermissionNow !== false) blockingReasons.push("bundle_is_fetch_permission_now");
  if (row.mayExecuteFurtherNow !== false) blockingReasons.push("bundle_would_allow_further_execution_now");
  if (row.mayFetchNow !== false) blockingReasons.push("bundle_would_fetch_now");
  if (row.maySearchNow !== false) blockingReasons.push("bundle_would_search_now");
  if (row.mayBroadSearchNow !== false) blockingReasons.push("bundle_would_broad_search_now");
  if (row.mayClassifySeasonStateNow !== false) blockingReasons.push("bundle_would_classify_now");
  if (row.mayWriteCanonicalNow !== false) blockingReasons.push("bundle_would_write_canonical_now");
  if (row.mayAssertTruthNow !== false) blockingReasons.push("bundle_would_assert_truth_now");

  if (row.fetchExecutedNow !== false) blockingReasons.push("bundle_fetched");
  if (row.searchExecutedNow !== false) blockingReasons.push("bundle_searched");
  if (row.broadSearchExecutedNow !== false) blockingReasons.push("bundle_broad_searched");
  if (row.classifierExecutedNow !== false) blockingReasons.push("bundle_classified");
  if (row.canonicalWriteExecutedNow !== false) blockingReasons.push("bundle_wrote_canonical");
  if (row.productionWriteExecutedNow !== false) blockingReasons.push("bundle_wrote_production");
  if (row.seasonStateTruthAssertedNow !== false) blockingReasons.push("bundle_asserted_truth");
  if (row.workQueueBundleRowIsTruth !== false) blockingReasons.push("bundle_row_marked_truth");

  const qualityGateStatus =
    blockingReasons.length === 0
      ? "passed_post_resumption_full_map_work_queue_bundle_quality_gate"
      : "blocked_post_resumption_full_map_work_queue_bundle_quality_gate";

  return {
    workQueueBundleId: row.workQueueBundleId,
    queueSelectionId: row.queueSelectionId,
    queueLane: row.queueLane,
    queuePriority: row.queuePriority,
    queueRole: row.queueRole,
    bundleLaneType: row.bundleLaneType,
    qualityGateStatus,
    blockingReasons,

    runnerTargetId: row.runnerTargetId,
    actionId: row.actionId,
    actionType: row.actionType,
    executionPlanStep: row.executionPlanStep,
    runnerStage: row.runnerStage,
    sourceCandidateType: row.sourceCandidateType || null,
    sourceFilePath: row.sourceFilePath || null,
    sourceFileSha256: row.sourceFileSha256 || null,
    reusableFamilies: row.reusableFamilies || [],
    competitionSlugs: row.competitionSlugs || [],
    sportomediaDisposition: row.sportomediaDisposition || null,

    wholeMapMainLaneResumed: row.wholeMapMainLaneResumed,
    sportomediaBlocksWholeMap: row.sportomediaBlocksWholeMap,
    providerMicroProbingContinuedInMainLane: row.providerMicroProbingContinuedInMainLane,
    bundleMainLaneEligible: row.bundleMainLaneEligible,
    bundleRepairBacklogEligible: row.bundleRepairBacklogEligible,

    mayBuildPostResumptionFullMapNextActionPack:
      qualityGateStatus === "passed_post_resumption_full_map_work_queue_bundle_quality_gate",
    qualityGateIsExecutionPermissionNow: false,
    qualityGateIsFetchPermissionNow: false,

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
    workQueueBundleQualityGateRowIsTruth: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    nextAllowedStep:
      qualityGateStatus === "passed_post_resumption_full_map_work_queue_bundle_quality_gate"
        ? "build_post_resumption_full_map_next_action_pack"
        : "repair_post_resumption_full_map_work_queue_bundle",
    nextBlockedStep: "fetch_search_broad_search_classifier_canonical_write_production_write_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const bundle = readJson(args.bundleInput);
  const bundleRows = validateBundle(bundle);

  const qualityGateRows = bundleRows
    .map(buildGateRow)
    .sort((a, b) => a.queuePriority - b.queuePriority || a.workQueueBundleId.localeCompare(b.workQueueBundleId));

  const passedRows = qualityGateRows.filter((row) => row.qualityGateStatus === "passed_post_resumption_full_map_work_queue_bundle_quality_gate");
  const blockedRows = qualityGateRows.filter((row) => row.qualityGateStatus !== "passed_post_resumption_full_map_work_queue_bundle_quality_gate");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "run-football-truth-post-resumption-full-map-work-queue-bundle-quality-gate-file",
    mode: "no_write_post_resumption_full_map_work_queue_bundle_quality_gate",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      postResumptionFullMapWorkQueueBundle: args.bundleInput
    },
    summary: {
      postResumptionFullMapWorkQueueBundleReadCount: 1,
      postResumptionFullMapWorkQueueBundleQualityGateRowCount: qualityGateRows.length,
      postResumptionFullMapWorkQueueBundleQualityGatePassedCount: passedRows.length,
      postResumptionFullMapWorkQueueBundleQualityGateBlockedCount: blockedRows.length,

      primaryManifestBundleQualityGatedCount:
        qualityGateRows.filter((row) => row.queueLane === "full_map_primary_manifest_lane").length,
      followupQualityGatedBundleQualityGatedCount:
        qualityGateRows.filter((row) => row.queueLane === "full_map_followup_quality_gated_lane").length,
      activeWorkstreamExecutionWaveBundleQualityGatedCount:
        qualityGateRows.filter((row) => row.queueLane === "full_map_active_workstream_execution_wave_lane").length,
      reusableFamilyAccelerationBundleQualityGatedCount:
        qualityGateRows.filter((row) => row.queueLane === "full_map_reusable_family_acceleration_lane").length,
      providerFamilyRepairBacklogBundleQualityGatedCount:
        qualityGateRows.filter((row) => row.queueLane === "provider_family_repair_backlog_lane").length,

      mainLaneBundleQualityGatedCount:
        qualityGateRows.filter((row) => row.bundleLaneType === "main_lane").length,
      repairBacklogBundleQualityGatedCount:
        qualityGateRows.filter((row) => row.bundleLaneType === "repair_backlog_lane").length,

      laligaReusablePatternBundleQualityGatedCount:
        qualityGateRows.filter((row) => (row.reusableFamilies || []).includes("laliga")).length,
      norwayNtfReusablePatternBundleQualityGatedCount:
        qualityGateRows.filter((row) => (row.reusableFamilies || []).includes("norway_ntf")).length,
      sportomediaProviderFamilyRepairBundleQualityGatedCount:
        qualityGateRows.filter((row) => (row.reusableFamilies || []).includes("sportomedia")).length,

      wholeMapMainLaneResumedBundleQualityGatedCount:
        qualityGateRows.filter((row) => row.wholeMapMainLaneResumed).length,
      sportomediaBlocksWholeMapCount:
        qualityGateRows.filter((row) => row.sportomediaBlocksWholeMap).length,
      providerMicroProbingContinuedInMainLaneCount:
        qualityGateRows.filter((row) => row.providerMicroProbingContinuedInMainLane).length,

      mayBuildPostResumptionFullMapNextActionPackCount:
        blockedRows.length === 0 ? 1 : 0,

      qualityGateIsExecutionPermissionNowCount:
        qualityGateRows.filter((row) => row.qualityGateIsExecutionPermissionNow).length,
      qualityGateIsFetchPermissionNowCount:
        qualityGateRows.filter((row) => row.qualityGateIsFetchPermissionNow).length,

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
      postResumptionFullMapWorkQueueBundleQualityGateTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        blockedRows.length === 0
          ? "build_post_resumption_full_map_next_action_pack"
          : "repair_post_resumption_full_map_work_queue_bundle"
    },
    counts: {
      byQueueLane: countBy(qualityGateRows, "queueLane"),
      byQueueRole: countBy(qualityGateRows, "queueRole"),
      byBundleLaneType: countBy(qualityGateRows, "bundleLaneType"),
      byQualityGateStatus: countBy(qualityGateRows, "qualityGateStatus"),
      byActionType: countBy(qualityGateRows, "actionType"),
      byRunnerStage: countBy(qualityGateRows, "runnerStage"),
      byNextAllowedStep: countBy(qualityGateRows, "nextAllowedStep")
    },
    wholeMapResumptionPolicy: {
      wholeMapMainLaneResumed: true,
      sportomediaBlocksWholeMap: false,
      sportomediaDisposition: "provider_family_repair_backlog",
      preservedReusableFamilyWins: ["laliga", "norway_ntf"],
      mainLaneBundleRowsQualityGated: 4,
      repairBacklogBundleRowsQualityGated: 1,
      repairBacklogSeparated: true,
      nextAction: blockedRows.length === 0
        ? "build_post_resumption_full_map_next_action_pack"
        : "repair_post_resumption_full_map_work_queue_bundle",
      qualityGateIsNotExecution: true,
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
      "This quality gate reads the post-resumption full-map work queue bundle only.",
      "It does not execute.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Quality gate rows are workflow routing artifacts, not truth assertions.",
      "Sportomedia remains in provider-family repair backlog and does not block the full-map main lane.",
      "The next step is a no-write post-resumption full-map next action pack."
    ],
    qualityGateRows,
    blockedRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    postResumptionFullMapWorkQueueBundleReadCount: output.summary.postResumptionFullMapWorkQueueBundleReadCount,
    postResumptionFullMapWorkQueueBundleQualityGateRowCount: output.summary.postResumptionFullMapWorkQueueBundleQualityGateRowCount,
    postResumptionFullMapWorkQueueBundleQualityGatePassedCount: output.summary.postResumptionFullMapWorkQueueBundleQualityGatePassedCount,
    postResumptionFullMapWorkQueueBundleQualityGateBlockedCount: output.summary.postResumptionFullMapWorkQueueBundleQualityGateBlockedCount,
    primaryManifestBundleQualityGatedCount: output.summary.primaryManifestBundleQualityGatedCount,
    followupQualityGatedBundleQualityGatedCount: output.summary.followupQualityGatedBundleQualityGatedCount,
    activeWorkstreamExecutionWaveBundleQualityGatedCount: output.summary.activeWorkstreamExecutionWaveBundleQualityGatedCount,
    reusableFamilyAccelerationBundleQualityGatedCount: output.summary.reusableFamilyAccelerationBundleQualityGatedCount,
    providerFamilyRepairBacklogBundleQualityGatedCount: output.summary.providerFamilyRepairBacklogBundleQualityGatedCount,
    mainLaneBundleQualityGatedCount: output.summary.mainLaneBundleQualityGatedCount,
    repairBacklogBundleQualityGatedCount: output.summary.repairBacklogBundleQualityGatedCount,
    laligaReusablePatternBundleQualityGatedCount: output.summary.laligaReusablePatternBundleQualityGatedCount,
    norwayNtfReusablePatternBundleQualityGatedCount: output.summary.norwayNtfReusablePatternBundleQualityGatedCount,
    sportomediaProviderFamilyRepairBundleQualityGatedCount: output.summary.sportomediaProviderFamilyRepairBundleQualityGatedCount,
    wholeMapMainLaneResumedBundleQualityGatedCount: output.summary.wholeMapMainLaneResumedBundleQualityGatedCount,
    sportomediaBlocksWholeMapCount: output.summary.sportomediaBlocksWholeMapCount,
    providerMicroProbingContinuedInMainLaneCount: output.summary.providerMicroProbingContinuedInMainLaneCount,
    mayBuildPostResumptionFullMapNextActionPackCount: output.summary.mayBuildPostResumptionFullMapNextActionPackCount,
    qualityGateIsExecutionPermissionNowCount: output.summary.qualityGateIsExecutionPermissionNowCount,
    qualityGateIsFetchPermissionNowCount: output.summary.qualityGateIsFetchPermissionNowCount,
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
    postResumptionFullMapWorkQueueBundleQualityGateTruthCount: output.summary.postResumptionFullMapWorkQueueBundleQualityGateTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
