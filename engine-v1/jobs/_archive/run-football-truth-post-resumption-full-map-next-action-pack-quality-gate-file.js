#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULTS = {
  date: "2026-06-14",
  packInput: "data/football-truth/_diagnostics/post-resumption-full-map-next-action-pack-2026-06-14/post-resumption-full-map-next-action-pack-2026-06-14.json",
  output: "data/football-truth/_diagnostics/post-resumption-full-map-next-action-pack-quality-gate-2026-06-14/post-resumption-full-map-next-action-pack-quality-gate-2026-06-14.json"
};

const REQUIRED_ACTION_TYPES = [
  "materialize_primary_manifest_next_batch_candidate",
  "materialize_followup_quality_gated_next_batch_candidate",
  "materialize_active_workstream_execution_wave_next_batch_candidate",
  "materialize_reusable_family_acceleration_next_batch_candidate",
  "materialize_provider_family_repair_backlog_next_batch_candidate"
];

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--pack-input") args.packInput = argv[++i];
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
  if (!(key in summary)) throw new Error("Missing next action pack summary key: " + key);
  if (summary[key] !== expected) {
    throw new Error(`Next action pack guardrail failed for ${key}: expected ${expected}, got ${summary[key]}`);
  }
}

function validatePack(pack) {
  const s = pack.summary || {};

  assertSummary(s, "postResumptionFullMapWorkQueueBundleQualityGateReadCount", 1);
  assertSummary(s, "postResumptionFullMapNextActionPackRowCount", 5);
  assertSummary(s, "postResumptionFullMapNextActionPackReadyCount", 5);
  assertSummary(s, "postResumptionFullMapNextActionPackBlockedCount", 0);
  assertSummary(s, "primaryManifestNextActionCount", 1);
  assertSummary(s, "followupQualityGatedNextActionCount", 1);
  assertSummary(s, "activeWorkstreamExecutionWaveNextActionCount", 1);
  assertSummary(s, "reusableFamilyAccelerationNextActionCount", 1);
  assertSummary(s, "providerFamilyRepairBacklogNextActionCount", 1);
  assertSummary(s, "mainLaneNextActionCount", 4);
  assertSummary(s, "repairBacklogNextActionCount", 1);
  assertSummary(s, "laligaReusablePatternNextActionCount", 1);
  assertSummary(s, "norwayNtfReusablePatternNextActionCount", 1);
  assertSummary(s, "sportomediaProviderFamilyRepairNextActionCount", 1);
  assertSummary(s, "wholeMapMainLaneResumedNextActionCount", 5);
  assertSummary(s, "sportomediaBlocksWholeMapCount", 0);
  assertSummary(s, "providerMicroProbingContinuedInMainLaneCount", 0);
  assertSummary(s, "mayProceedToPostResumptionFullMapNextActionPackQualityGateCount", 1);
  assertSummary(s, "nextActionPackIsExecutionPermissionNowCount", 0);
  assertSummary(s, "nextActionPackIsFetchPermissionNowCount", 0);

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
  assertSummary(s, "postResumptionFullMapNextActionPackTruthCount", 0);
  assertSummary(s, "canonicalWrites", 0);
  if (s.productionWrite !== false) throw new Error("Next action pack productionWrite must be false.");

  const rows = Array.isArray(pack.nextActionPackRows) ? pack.nextActionPackRows : [];
  if (rows.length !== 5) throw new Error("Expected 5 nextActionPackRows.");

  const actionTypes = new Set(rows.map((row) => row.nextActionType));
  for (const actionType of REQUIRED_ACTION_TYPES) {
    if (!actionTypes.has(actionType)) throw new Error("Missing required next action type: " + actionType);
  }

  for (const row of rows) {
    if (row.nextActionPackStatus !== "ready_for_post_resumption_full_map_next_action_pack_quality_gate") {
      throw new Error(row.nextActionPackId + ": next action pack row is not quality-gate ready.");
    }
    if (row.mayProceedToPostResumptionFullMapNextActionPackQualityGate !== true) {
      throw new Error(row.nextActionPackId + ": row must allow quality gate.");
    }
    if (row.nextActionPackIsExecutionPermissionNow !== false) throw new Error(row.nextActionPackId + ": must not be execution permission now.");
    if (row.nextActionPackIsFetchPermissionNow !== false) throw new Error(row.nextActionPackId + ": must not be fetch permission now.");

    if (row.mainLaneNextAction === true && row.repairBacklogNextAction === true) {
      throw new Error(row.nextActionPackId + ": cannot be both main-lane and repair-backlog.");
    }
    if (row.nextActionType === "materialize_provider_family_repair_backlog_next_batch_candidate") {
      if (row.mainLaneNextAction !== false) throw new Error(row.nextActionPackId + ": Sportomedia repair action must not be main-lane.");
      if (row.repairBacklogNextAction !== true) throw new Error(row.nextActionPackId + ": Sportomedia repair action must be repair-backlog.");
    }

    if (row.wholeMapMainLaneResumed !== true) throw new Error(row.nextActionPackId + ": whole-map main lane must be resumed.");
    if (row.sportomediaBlocksWholeMap !== false) throw new Error(row.nextActionPackId + ": Sportomedia must not block whole map.");
    if (row.providerMicroProbingContinuedInMainLane !== false) throw new Error(row.nextActionPackId + ": provider micro-probing must not continue in main lane.");

    if (row.mayExecuteFurtherNow !== false) throw new Error(row.nextActionPackId + ": mayExecuteFurtherNow must be false.");
    if (row.mayFetchNow !== false) throw new Error(row.nextActionPackId + ": mayFetchNow must be false.");
    if (row.maySearchNow !== false) throw new Error(row.nextActionPackId + ": maySearchNow must be false.");
    if (row.mayBroadSearchNow !== false) throw new Error(row.nextActionPackId + ": mayBroadSearchNow must be false.");
    if (row.mayClassifySeasonStateNow !== false) throw new Error(row.nextActionPackId + ": mayClassifySeasonStateNow must be false.");
    if (row.mayWriteCanonicalNow !== false) throw new Error(row.nextActionPackId + ": mayWriteCanonicalNow must be false.");
    if (row.mayAssertTruthNow !== false) throw new Error(row.nextActionPackId + ": mayAssertTruthNow must be false.");

    if (row.fetchExecutedNow !== false) throw new Error(row.nextActionPackId + ": fetch must remain false.");
    if (row.searchExecutedNow !== false) throw new Error(row.nextActionPackId + ": search must remain false.");
    if (row.broadSearchExecutedNow !== false) throw new Error(row.nextActionPackId + ": broad search must remain false.");
    if (row.classifierExecutedNow !== false) throw new Error(row.nextActionPackId + ": classifier must remain false.");
    if (row.canonicalWriteExecutedNow !== false) throw new Error(row.nextActionPackId + ": canonical write must remain false.");
    if (row.productionWriteExecutedNow !== false) throw new Error(row.nextActionPackId + ": production write must remain false.");
    if (row.seasonStateTruthAssertedNow !== false) throw new Error(row.nextActionPackId + ": season-state truth assertion must remain false.");
    if (row.nextActionPackRowIsTruth !== false) throw new Error(row.nextActionPackId + ": next action pack row must not be truth.");
  }

  return rows;
}

function buildGateRow(row) {
  const blockingReasons = [];

  if (row.nextActionPackStatus !== "ready_for_post_resumption_full_map_next_action_pack_quality_gate") {
    blockingReasons.push("next_action_pack_row_not_quality_gate_ready");
  }
  if (row.mayProceedToPostResumptionFullMapNextActionPackQualityGate !== true) {
    blockingReasons.push("next_action_pack_row_does_not_allow_quality_gate");
  }
  if (!REQUIRED_ACTION_TYPES.includes(row.nextActionType)) blockingReasons.push("unexpected_next_action_type");

  if (row.nextActionPackIsExecutionPermissionNow !== false) blockingReasons.push("next_action_pack_is_execution_permission_now");
  if (row.nextActionPackIsFetchPermissionNow !== false) blockingReasons.push("next_action_pack_is_fetch_permission_now");
  if (row.mayExecuteFurtherNow !== false) blockingReasons.push("next_action_pack_would_allow_further_execution_now");
  if (row.mayFetchNow !== false) blockingReasons.push("next_action_pack_would_fetch_now");
  if (row.maySearchNow !== false) blockingReasons.push("next_action_pack_would_search_now");
  if (row.mayBroadSearchNow !== false) blockingReasons.push("next_action_pack_would_broad_search_now");
  if (row.mayClassifySeasonStateNow !== false) blockingReasons.push("next_action_pack_would_classify_now");
  if (row.mayWriteCanonicalNow !== false) blockingReasons.push("next_action_pack_would_write_canonical_now");
  if (row.mayAssertTruthNow !== false) blockingReasons.push("next_action_pack_would_assert_truth_now");

  if (row.fetchExecutedNow !== false) blockingReasons.push("next_action_pack_fetched");
  if (row.searchExecutedNow !== false) blockingReasons.push("next_action_pack_searched");
  if (row.broadSearchExecutedNow !== false) blockingReasons.push("next_action_pack_broad_searched");
  if (row.classifierExecutedNow !== false) blockingReasons.push("next_action_pack_classified");
  if (row.canonicalWriteExecutedNow !== false) blockingReasons.push("next_action_pack_wrote_canonical");
  if (row.productionWriteExecutedNow !== false) blockingReasons.push("next_action_pack_wrote_production");
  if (row.seasonStateTruthAssertedNow !== false) blockingReasons.push("next_action_pack_asserted_truth");
  if (row.nextActionPackRowIsTruth !== false) blockingReasons.push("next_action_pack_row_marked_truth");

  const qualityGateStatus =
    blockingReasons.length === 0
      ? "passed_post_resumption_full_map_next_action_pack_quality_gate"
      : "blocked_post_resumption_full_map_next_action_pack_quality_gate";

  return {
    nextActionPackId: row.nextActionPackId,
    nextActionType: row.nextActionType,
    nextActionPriority: row.nextActionPriority,
    nextActionRole: row.nextActionRole,
    qualityGateStatus,
    blockingReasons,

    workQueueBundleId: row.workQueueBundleId,
    queueSelectionId: row.queueSelectionId,
    queueLane: row.queueLane,
    queuePriority: row.queuePriority,
    queueRole: row.queueRole,
    bundleLaneType: row.bundleLaneType,

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

    mainLaneNextAction: row.mainLaneNextAction,
    repairBacklogNextAction: row.repairBacklogNextAction,
    wholeMapMainLaneResumed: row.wholeMapMainLaneResumed,
    sportomediaBlocksWholeMap: row.sportomediaBlocksWholeMap,
    providerMicroProbingContinuedInMainLane: row.providerMicroProbingContinuedInMainLane,

    mayBuildPostResumptionFullMapNextBatchPlan:
      qualityGateStatus === "passed_post_resumption_full_map_next_action_pack_quality_gate",
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
    nextActionPackQualityGateRowIsTruth: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    nextAllowedStep:
      qualityGateStatus === "passed_post_resumption_full_map_next_action_pack_quality_gate"
        ? "build_post_resumption_full_map_next_batch_plan"
        : "repair_post_resumption_full_map_next_action_pack",
    nextBlockedStep: "fetch_search_broad_search_classifier_canonical_write_production_write_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const pack = readJson(args.packInput);
  const packRows = validatePack(pack);

  const qualityGateRows = packRows
    .map(buildGateRow)
    .sort((a, b) => a.nextActionPriority - b.nextActionPriority || a.nextActionPackId.localeCompare(b.nextActionPackId));

  const passedRows = qualityGateRows.filter((row) => row.qualityGateStatus === "passed_post_resumption_full_map_next_action_pack_quality_gate");
  const blockedRows = qualityGateRows.filter((row) => row.qualityGateStatus !== "passed_post_resumption_full_map_next_action_pack_quality_gate");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "run-football-truth-post-resumption-full-map-next-action-pack-quality-gate-file",
    mode: "no_write_post_resumption_full_map_next_action_pack_quality_gate",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      postResumptionFullMapNextActionPack: args.packInput
    },
    summary: {
      postResumptionFullMapNextActionPackReadCount: 1,
      postResumptionFullMapNextActionPackQualityGateRowCount: qualityGateRows.length,
      postResumptionFullMapNextActionPackQualityGatePassedCount: passedRows.length,
      postResumptionFullMapNextActionPackQualityGateBlockedCount: blockedRows.length,

      primaryManifestNextActionQualityGatedCount:
        qualityGateRows.filter((row) => row.nextActionType === "materialize_primary_manifest_next_batch_candidate").length,
      followupQualityGatedNextActionQualityGatedCount:
        qualityGateRows.filter((row) => row.nextActionType === "materialize_followup_quality_gated_next_batch_candidate").length,
      activeWorkstreamExecutionWaveNextActionQualityGatedCount:
        qualityGateRows.filter((row) => row.nextActionType === "materialize_active_workstream_execution_wave_next_batch_candidate").length,
      reusableFamilyAccelerationNextActionQualityGatedCount:
        qualityGateRows.filter((row) => row.nextActionType === "materialize_reusable_family_acceleration_next_batch_candidate").length,
      providerFamilyRepairBacklogNextActionQualityGatedCount:
        qualityGateRows.filter((row) => row.nextActionType === "materialize_provider_family_repair_backlog_next_batch_candidate").length,

      mainLaneNextActionQualityGatedCount:
        qualityGateRows.filter((row) => row.mainLaneNextAction).length,
      repairBacklogNextActionQualityGatedCount:
        qualityGateRows.filter((row) => row.repairBacklogNextAction).length,

      laligaReusablePatternNextActionQualityGatedCount:
        qualityGateRows.filter((row) => (row.reusableFamilies || []).includes("laliga")).length,
      norwayNtfReusablePatternNextActionQualityGatedCount:
        qualityGateRows.filter((row) => (row.reusableFamilies || []).includes("norway_ntf")).length,
      sportomediaProviderFamilyRepairNextActionQualityGatedCount:
        qualityGateRows.filter((row) => (row.reusableFamilies || []).includes("sportomedia")).length,

      wholeMapMainLaneResumedNextActionQualityGatedCount:
        qualityGateRows.filter((row) => row.wholeMapMainLaneResumed).length,
      sportomediaBlocksWholeMapCount:
        qualityGateRows.filter((row) => row.sportomediaBlocksWholeMap).length,
      providerMicroProbingContinuedInMainLaneCount:
        qualityGateRows.filter((row) => row.providerMicroProbingContinuedInMainLane).length,

      mayBuildPostResumptionFullMapNextBatchPlanCount:
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
      postResumptionFullMapNextActionPackQualityGateTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        blockedRows.length === 0
          ? "build_post_resumption_full_map_next_batch_plan"
          : "repair_post_resumption_full_map_next_action_pack"
    },
    counts: {
      byNextActionType: countBy(qualityGateRows, "nextActionType"),
      byNextActionRole: countBy(qualityGateRows, "nextActionRole"),
      byQueueLane: countBy(qualityGateRows, "queueLane"),
      byBundleLaneType: countBy(qualityGateRows, "bundleLaneType"),
      byQualityGateStatus: countBy(qualityGateRows, "qualityGateStatus"),
      byNextAllowedStep: countBy(qualityGateRows, "nextAllowedStep")
    },
    wholeMapResumptionPolicy: {
      wholeMapMainLaneResumed: true,
      sportomediaBlocksWholeMap: false,
      sportomediaDisposition: "provider_family_repair_backlog",
      preservedReusableFamilyWins: ["laliga", "norway_ntf"],
      mainLaneNextActionsQualityGated: 4,
      repairBacklogNextActionsQualityGated: 1,
      repairBacklogSeparated: true,
      nextAction: blockedRows.length === 0
        ? "build_post_resumption_full_map_next_batch_plan"
        : "repair_post_resumption_full_map_next_action_pack",
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
      "This quality gate reads the post-resumption full-map next action pack only.",
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
      "The next step is a no-write post-resumption full-map next batch plan."
    ],
    qualityGateRows,
    blockedRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    postResumptionFullMapNextActionPackReadCount: output.summary.postResumptionFullMapNextActionPackReadCount,
    postResumptionFullMapNextActionPackQualityGateRowCount: output.summary.postResumptionFullMapNextActionPackQualityGateRowCount,
    postResumptionFullMapNextActionPackQualityGatePassedCount: output.summary.postResumptionFullMapNextActionPackQualityGatePassedCount,
    postResumptionFullMapNextActionPackQualityGateBlockedCount: output.summary.postResumptionFullMapNextActionPackQualityGateBlockedCount,
    primaryManifestNextActionQualityGatedCount: output.summary.primaryManifestNextActionQualityGatedCount,
    followupQualityGatedNextActionQualityGatedCount: output.summary.followupQualityGatedNextActionQualityGatedCount,
    activeWorkstreamExecutionWaveNextActionQualityGatedCount: output.summary.activeWorkstreamExecutionWaveNextActionQualityGatedCount,
    reusableFamilyAccelerationNextActionQualityGatedCount: output.summary.reusableFamilyAccelerationNextActionQualityGatedCount,
    providerFamilyRepairBacklogNextActionQualityGatedCount: output.summary.providerFamilyRepairBacklogNextActionQualityGatedCount,
    mainLaneNextActionQualityGatedCount: output.summary.mainLaneNextActionQualityGatedCount,
    repairBacklogNextActionQualityGatedCount: output.summary.repairBacklogNextActionQualityGatedCount,
    laligaReusablePatternNextActionQualityGatedCount: output.summary.laligaReusablePatternNextActionQualityGatedCount,
    norwayNtfReusablePatternNextActionQualityGatedCount: output.summary.norwayNtfReusablePatternNextActionQualityGatedCount,
    sportomediaProviderFamilyRepairNextActionQualityGatedCount: output.summary.sportomediaProviderFamilyRepairNextActionQualityGatedCount,
    wholeMapMainLaneResumedNextActionQualityGatedCount: output.summary.wholeMapMainLaneResumedNextActionQualityGatedCount,
    sportomediaBlocksWholeMapCount: output.summary.sportomediaBlocksWholeMapCount,
    providerMicroProbingContinuedInMainLaneCount: output.summary.providerMicroProbingContinuedInMainLaneCount,
    mayBuildPostResumptionFullMapNextBatchPlanCount: output.summary.mayBuildPostResumptionFullMapNextBatchPlanCount,
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
    postResumptionFullMapNextActionPackQualityGateTruthCount: output.summary.postResumptionFullMapNextActionPackQualityGateTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
