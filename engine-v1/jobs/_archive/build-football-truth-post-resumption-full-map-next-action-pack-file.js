#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULTS = {
  date: "2026-06-14",
  gateInput: "data/football-truth/_diagnostics/post-resumption-full-map-work-queue-bundle-quality-gate-2026-06-14/post-resumption-full-map-work-queue-bundle-quality-gate-2026-06-14.json",
  output: "data/football-truth/_diagnostics/post-resumption-full-map-next-action-pack-2026-06-14/post-resumption-full-map-next-action-pack-2026-06-14.json"
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

  assertSummary(s, "postResumptionFullMapWorkQueueBundleReadCount", 1);
  assertSummary(s, "postResumptionFullMapWorkQueueBundleQualityGateRowCount", 5);
  assertSummary(s, "postResumptionFullMapWorkQueueBundleQualityGatePassedCount", 5);
  assertSummary(s, "postResumptionFullMapWorkQueueBundleQualityGateBlockedCount", 0);
  assertSummary(s, "primaryManifestBundleQualityGatedCount", 1);
  assertSummary(s, "followupQualityGatedBundleQualityGatedCount", 1);
  assertSummary(s, "activeWorkstreamExecutionWaveBundleQualityGatedCount", 1);
  assertSummary(s, "reusableFamilyAccelerationBundleQualityGatedCount", 1);
  assertSummary(s, "providerFamilyRepairBacklogBundleQualityGatedCount", 1);
  assertSummary(s, "mainLaneBundleQualityGatedCount", 4);
  assertSummary(s, "repairBacklogBundleQualityGatedCount", 1);
  assertSummary(s, "laligaReusablePatternBundleQualityGatedCount", 1);
  assertSummary(s, "norwayNtfReusablePatternBundleQualityGatedCount", 1);
  assertSummary(s, "sportomediaProviderFamilyRepairBundleQualityGatedCount", 1);
  assertSummary(s, "wholeMapMainLaneResumedBundleQualityGatedCount", 5);
  assertSummary(s, "sportomediaBlocksWholeMapCount", 0);
  assertSummary(s, "providerMicroProbingContinuedInMainLaneCount", 0);
  assertSummary(s, "mayBuildPostResumptionFullMapNextActionPackCount", 1);
  assertSummary(s, "qualityGateIsExecutionPermissionNowCount", 0);
  assertSummary(s, "qualityGateIsFetchPermissionNowCount", 0);

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
  assertSummary(s, "postResumptionFullMapWorkQueueBundleQualityGateTruthCount", 0);
  assertSummary(s, "canonicalWrites", 0);
  if (s.productionWrite !== false) throw new Error("Quality gate productionWrite must be false.");

  const rows = Array.isArray(gate.qualityGateRows) ? gate.qualityGateRows : [];
  if (rows.length !== 5) throw new Error("Expected 5 qualityGateRows.");

  const lanes = new Set(rows.map((row) => row.queueLane));
  for (const lane of REQUIRED_QUEUE_LANES) {
    if (!lanes.has(lane)) throw new Error("Missing required queue lane: " + lane);
  }

  for (const row of rows) {
    if (row.qualityGateStatus !== "passed_post_resumption_full_map_work_queue_bundle_quality_gate") {
      throw new Error(row.workQueueBundleId + ": quality gate row did not pass.");
    }
    if (row.mayBuildPostResumptionFullMapNextActionPack !== true) {
      throw new Error(row.workQueueBundleId + ": next action pack build must be allowed.");
    }
    if (row.qualityGateIsExecutionPermissionNow !== false) throw new Error(row.workQueueBundleId + ": execution permission must be false.");
    if (row.qualityGateIsFetchPermissionNow !== false) throw new Error(row.workQueueBundleId + ": fetch permission must be false.");
    if (row.mayExecuteFurtherNow !== false) throw new Error(row.workQueueBundleId + ": mayExecuteFurtherNow must be false.");
    if (row.mayFetchNow !== false) throw new Error(row.workQueueBundleId + ": mayFetchNow must be false.");
    if (row.maySearchNow !== false) throw new Error(row.workQueueBundleId + ": maySearchNow must be false.");
    if (row.mayBroadSearchNow !== false) throw new Error(row.workQueueBundleId + ": mayBroadSearchNow must be false.");
    if (row.mayClassifySeasonStateNow !== false) throw new Error(row.workQueueBundleId + ": mayClassifySeasonStateNow must be false.");
    if (row.mayWriteCanonicalNow !== false) throw new Error(row.workQueueBundleId + ": mayWriteCanonicalNow must be false.");
    if (row.mayAssertTruthNow !== false) throw new Error(row.workQueueBundleId + ": mayAssertTruthNow must be false.");
  }

  return rows;
}

function actionFor(row) {
  if (row.queueLane === "full_map_primary_manifest_lane") {
    return {
      nextActionType: "materialize_primary_manifest_next_batch_candidate",
      nextActionPriority: 1,
      nextActionRole: "main_lane_primary_manifest_anchor"
    };
  }

  if (row.queueLane === "full_map_followup_quality_gated_lane") {
    return {
      nextActionType: "materialize_followup_quality_gated_next_batch_candidate",
      nextActionPriority: 2,
      nextActionRole: "main_lane_followup_quality_gated_work"
    };
  }

  if (row.queueLane === "full_map_active_workstream_execution_wave_lane") {
    return {
      nextActionType: "materialize_active_workstream_execution_wave_next_batch_candidate",
      nextActionPriority: 3,
      nextActionRole: "main_lane_active_execution_wave_context"
    };
  }

  if (row.queueLane === "full_map_reusable_family_acceleration_lane") {
    return {
      nextActionType: "materialize_reusable_family_acceleration_next_batch_candidate",
      nextActionPriority: 4,
      nextActionRole: "main_lane_laliga_norway_reusable_pattern_expansion"
    };
  }

  if (row.queueLane === "provider_family_repair_backlog_lane") {
    return {
      nextActionType: "materialize_provider_family_repair_backlog_next_batch_candidate",
      nextActionPriority: 5,
      nextActionRole: "separate_sportomedia_repair_backlog_not_main_lane_blocker"
    };
  }

  return {
    nextActionType: "unknown_post_resumption_action",
    nextActionPriority: 99,
    nextActionRole: "unknown"
  };
}

function buildActionPackRow(row) {
  const action = actionFor(row);
  const isRepairBacklog = row.bundleLaneType === "repair_backlog_lane";

  return {
    nextActionPackId: `post-resumption-next-action:${action.nextActionType}`,
    workQueueBundleId: row.workQueueBundleId,
    queueSelectionId: row.queueSelectionId,
    queueLane: row.queueLane,
    queuePriority: row.queuePriority,
    queueRole: row.queueRole,
    bundleLaneType: row.bundleLaneType,

    nextActionType: action.nextActionType,
    nextActionPriority: action.nextActionPriority,
    nextActionRole: action.nextActionRole,
    nextActionPackStatus: "ready_for_post_resumption_full_map_next_action_pack_quality_gate",

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

    mainLaneNextAction: !isRepairBacklog,
    repairBacklogNextAction: isRepairBacklog,
    wholeMapMainLaneResumed: true,
    sportomediaBlocksWholeMap: false,
    providerMicroProbingContinuedInMainLane: false,

    mayProceedToPostResumptionFullMapNextActionPackQualityGate: true,
    nextActionPackIsExecutionPermissionNow: false,
    nextActionPackIsFetchPermissionNow: false,

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
    nextActionPackRowIsTruth: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    nextAllowedStep: "run_post_resumption_full_map_next_action_pack_quality_gate",
    nextBlockedStep: "fetch_search_broad_search_classifier_canonical_write_production_write_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const gate = readJson(args.gateInput);
  const gateRows = validateQualityGate(gate);

  const nextActionPackRows = gateRows
    .map(buildActionPackRow)
    .sort((a, b) => a.nextActionPriority - b.nextActionPriority || a.nextActionPackId.localeCompare(b.nextActionPackId));

  const readyRows = nextActionPackRows.filter((row) => row.nextActionPackStatus === "ready_for_post_resumption_full_map_next_action_pack_quality_gate");
  const blockedRows = nextActionPackRows.filter((row) => row.nextActionPackStatus !== "ready_for_post_resumption_full_map_next_action_pack_quality_gate");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-post-resumption-full-map-next-action-pack-file",
    mode: "no_write_post_resumption_full_map_next_action_pack",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      postResumptionFullMapWorkQueueBundleQualityGate: args.gateInput
    },
    summary: {
      postResumptionFullMapWorkQueueBundleQualityGateReadCount: 1,
      postResumptionFullMapNextActionPackRowCount: nextActionPackRows.length,
      postResumptionFullMapNextActionPackReadyCount: readyRows.length,
      postResumptionFullMapNextActionPackBlockedCount: blockedRows.length,

      primaryManifestNextActionCount:
        nextActionPackRows.filter((row) => row.nextActionType === "materialize_primary_manifest_next_batch_candidate").length,
      followupQualityGatedNextActionCount:
        nextActionPackRows.filter((row) => row.nextActionType === "materialize_followup_quality_gated_next_batch_candidate").length,
      activeWorkstreamExecutionWaveNextActionCount:
        nextActionPackRows.filter((row) => row.nextActionType === "materialize_active_workstream_execution_wave_next_batch_candidate").length,
      reusableFamilyAccelerationNextActionCount:
        nextActionPackRows.filter((row) => row.nextActionType === "materialize_reusable_family_acceleration_next_batch_candidate").length,
      providerFamilyRepairBacklogNextActionCount:
        nextActionPackRows.filter((row) => row.nextActionType === "materialize_provider_family_repair_backlog_next_batch_candidate").length,

      mainLaneNextActionCount:
        nextActionPackRows.filter((row) => row.mainLaneNextAction).length,
      repairBacklogNextActionCount:
        nextActionPackRows.filter((row) => row.repairBacklogNextAction).length,

      laligaReusablePatternNextActionCount:
        nextActionPackRows.filter((row) => (row.reusableFamilies || []).includes("laliga")).length,
      norwayNtfReusablePatternNextActionCount:
        nextActionPackRows.filter((row) => (row.reusableFamilies || []).includes("norway_ntf")).length,
      sportomediaProviderFamilyRepairNextActionCount:
        nextActionPackRows.filter((row) => (row.reusableFamilies || []).includes("sportomedia")).length,

      wholeMapMainLaneResumedNextActionCount:
        nextActionPackRows.filter((row) => row.wholeMapMainLaneResumed).length,
      sportomediaBlocksWholeMapCount:
        nextActionPackRows.filter((row) => row.sportomediaBlocksWholeMap).length,
      providerMicroProbingContinuedInMainLaneCount:
        nextActionPackRows.filter((row) => row.providerMicroProbingContinuedInMainLane).length,

      mayProceedToPostResumptionFullMapNextActionPackQualityGateCount:
        blockedRows.length === 0 ? 1 : 0,

      nextActionPackIsExecutionPermissionNowCount:
        nextActionPackRows.filter((row) => row.nextActionPackIsExecutionPermissionNow).length,
      nextActionPackIsFetchPermissionNowCount:
        nextActionPackRows.filter((row) => row.nextActionPackIsFetchPermissionNow).length,

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
      postResumptionFullMapNextActionPackTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        blockedRows.length === 0
          ? "run_post_resumption_full_map_next_action_pack_quality_gate"
          : "repair_post_resumption_full_map_next_action_pack"
    },
    counts: {
      byNextActionType: countBy(nextActionPackRows, "nextActionType"),
      byNextActionRole: countBy(nextActionPackRows, "nextActionRole"),
      byQueueLane: countBy(nextActionPackRows, "queueLane"),
      byBundleLaneType: countBy(nextActionPackRows, "bundleLaneType"),
      byNextActionPackStatus: countBy(nextActionPackRows, "nextActionPackStatus"),
      byNextAllowedStep: countBy(nextActionPackRows, "nextAllowedStep")
    },
    wholeMapResumptionPolicy: {
      wholeMapMainLaneResumed: true,
      sportomediaBlocksWholeMap: false,
      sportomediaDisposition: "provider_family_repair_backlog",
      preservedReusableFamilyWins: ["laliga", "norway_ntf"],
      mainLaneNextActions: 4,
      repairBacklogNextActions: 1,
      repairBacklogSeparated: true,
      nextAction: blockedRows.length === 0
        ? "run_post_resumption_full_map_next_action_pack_quality_gate"
        : "repair_post_resumption_full_map_next_action_pack",
      nextActionPackIsNotExecution: true,
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
      "This action pack reads the post-resumption full-map work queue bundle quality gate only.",
      "It does not execute.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Next action pack rows are workflow routing artifacts, not truth assertions.",
      "Sportomedia remains in provider-family repair backlog and does not block the full-map main lane.",
      "The next step is a no-write next action pack quality gate."
    ],
    nextActionPackRows,
    blockedRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    postResumptionFullMapWorkQueueBundleQualityGateReadCount: output.summary.postResumptionFullMapWorkQueueBundleQualityGateReadCount,
    postResumptionFullMapNextActionPackRowCount: output.summary.postResumptionFullMapNextActionPackRowCount,
    postResumptionFullMapNextActionPackReadyCount: output.summary.postResumptionFullMapNextActionPackReadyCount,
    postResumptionFullMapNextActionPackBlockedCount: output.summary.postResumptionFullMapNextActionPackBlockedCount,
    primaryManifestNextActionCount: output.summary.primaryManifestNextActionCount,
    followupQualityGatedNextActionCount: output.summary.followupQualityGatedNextActionCount,
    activeWorkstreamExecutionWaveNextActionCount: output.summary.activeWorkstreamExecutionWaveNextActionCount,
    reusableFamilyAccelerationNextActionCount: output.summary.reusableFamilyAccelerationNextActionCount,
    providerFamilyRepairBacklogNextActionCount: output.summary.providerFamilyRepairBacklogNextActionCount,
    mainLaneNextActionCount: output.summary.mainLaneNextActionCount,
    repairBacklogNextActionCount: output.summary.repairBacklogNextActionCount,
    laligaReusablePatternNextActionCount: output.summary.laligaReusablePatternNextActionCount,
    norwayNtfReusablePatternNextActionCount: output.summary.norwayNtfReusablePatternNextActionCount,
    sportomediaProviderFamilyRepairNextActionCount: output.summary.sportomediaProviderFamilyRepairNextActionCount,
    wholeMapMainLaneResumedNextActionCount: output.summary.wholeMapMainLaneResumedNextActionCount,
    sportomediaBlocksWholeMapCount: output.summary.sportomediaBlocksWholeMapCount,
    providerMicroProbingContinuedInMainLaneCount: output.summary.providerMicroProbingContinuedInMainLaneCount,
    mayProceedToPostResumptionFullMapNextActionPackQualityGateCount: output.summary.mayProceedToPostResumptionFullMapNextActionPackQualityGateCount,
    nextActionPackIsExecutionPermissionNowCount: output.summary.nextActionPackIsExecutionPermissionNowCount,
    nextActionPackIsFetchPermissionNowCount: output.summary.nextActionPackIsFetchPermissionNowCount,
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
    postResumptionFullMapNextActionPackTruthCount: output.summary.postResumptionFullMapNextActionPackTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
