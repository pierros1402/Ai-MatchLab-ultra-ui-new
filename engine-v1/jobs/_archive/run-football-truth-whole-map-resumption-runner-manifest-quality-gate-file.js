#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULTS = {
  date: "2026-06-14",
  manifestInput: "data/football-truth/_diagnostics/whole-map-resumption-runner-manifest-2026-06-14/whole-map-resumption-runner-manifest-2026-06-14.json",
  output: "data/football-truth/_diagnostics/whole-map-resumption-runner-manifest-quality-gate-2026-06-14/whole-map-resumption-runner-manifest-quality-gate-2026-06-14.json"
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
    else if (arg === "--manifest-input") args.manifestInput = argv[++i];
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
  if (!(key in summary)) throw new Error("Missing manifest summary key: " + key);
  if (summary[key] !== expected) {
    throw new Error(`Manifest guardrail failed for ${key}: expected ${expected}, got ${summary[key]}`);
  }
}

function validateManifest(manifest) {
  const s = manifest.summary || {};

  assertSummary(s, "executionPlanReadCount", 1);
  assertSummary(s, "wholeMapResumptionRunnerManifestRowCount", 5);
  assertSummary(s, "wholeMapResumptionRunnerManifestReadyCount", 5);
  assertSummary(s, "wholeMapResumptionRunnerManifestBlockedCount", 0);
  assertSummary(s, "primaryBatchRunnerManifestEntryCount", 1);
  assertSummary(s, "followupLaneQualityGatedPackManifestEntryCount", 1);
  assertSummary(s, "activeWorkstreamExecutionWaveManifestEntryCount", 1);
  assertSummary(s, "reusableFamilyPromotionManifestEntryCount", 1);
  assertSummary(s, "providerFamilyRepairDeferredManifestEntryCount", 1);
  assertSummary(s, "laligaReusablePatternManifestEntryCount", 1);
  assertSummary(s, "norwayNtfReusablePatternManifestEntryCount", 1);
  assertSummary(s, "sportomediaProviderFamilyRepairDeferredManifestEntryCount", 1);
  assertSummary(s, "sportomediaBlocksWholeMapCount", 0);
  assertSummary(s, "runnerManifestCompleteCount", 5);
  assertSummary(s, "runnerManifestBuiltCount", 5);
  assertSummary(s, "mayProceedToWholeMapResumptionRunnerManifestQualityGateCount", 1);
  assertSummary(s, "runnerManifestIsExecutionPermissionNowCount", 0);
  assertSummary(s, "runnerManifestIsFetchPermissionNowCount", 0);

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
  assertSummary(s, "wholeMapResumptionRunnerManifestTruthCount", 0);
  assertSummary(s, "canonicalWrites", 0);
  if (s.productionWrite !== false) throw new Error("Manifest productionWrite must be false.");

  const rows = Array.isArray(manifest.manifestRows) ? manifest.manifestRows : [];
  if (rows.length !== 5) throw new Error("Expected 5 manifestRows.");

  const steps = new Set(rows.map((row) => row.executionPlanStep));
  for (const step of REQUIRED_PLAN_STEPS) {
    if (!steps.has(step)) throw new Error("Missing required manifest plan step: " + step);
  }

  for (const row of rows) {
    if (row.manifestEntryStatus !== "ready_for_whole_map_resumption_runner_manifest_quality_gate") {
      throw new Error(row.manifestEntryId + ": manifest entry not quality-gate ready.");
    }
    if (row.runnerManifestComplete !== true) throw new Error(row.manifestEntryId + ": runnerManifestComplete must be true.");
    if (row.runnerManifestBuilt !== true) throw new Error(row.manifestEntryId + ": runnerManifestBuilt must be true.");
    if (row.mayProceedToWholeMapResumptionRunnerManifestQualityGate !== true) {
      throw new Error(row.manifestEntryId + ": mayProceedToWholeMapResumptionRunnerManifestQualityGate must be true.");
    }
    if (row.runnerManifestIsExecutionPermissionNow !== false) throw new Error(row.manifestEntryId + ": execution permission must be false.");
    if (row.runnerManifestIsFetchPermissionNow !== false) throw new Error(row.manifestEntryId + ": fetch permission must be false.");
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

function buildQualityGateRow(manifestRow) {
  const blockingReasons = [];

  if (manifestRow.manifestEntryStatus !== "ready_for_whole_map_resumption_runner_manifest_quality_gate") {
    blockingReasons.push("manifest_entry_not_quality_gate_ready");
  }
  if (manifestRow.runnerManifestComplete !== true) blockingReasons.push("runner_manifest_not_complete");
  if (manifestRow.runnerManifestBuilt !== true) blockingReasons.push("runner_manifest_not_built");
  if (manifestRow.mayProceedToWholeMapResumptionRunnerManifestQualityGate !== true) {
    blockingReasons.push("manifest_entry_does_not_allow_quality_gate");
  }
  if (!REQUIRED_PLAN_STEPS.includes(manifestRow.executionPlanStep)) {
    blockingReasons.push("unexpected_execution_plan_step");
  }

  if (manifestRow.runnerManifestIsExecutionPermissionNow !== false) blockingReasons.push("manifest_is_execution_permission_now");
  if (manifestRow.runnerManifestIsFetchPermissionNow !== false) blockingReasons.push("manifest_is_fetch_permission_now");
  if (manifestRow.mayExecuteNow !== false) blockingReasons.push("manifest_would_execute_now");
  if (manifestRow.mayFetchNow !== false) blockingReasons.push("manifest_would_fetch_now");
  if (manifestRow.maySearchNow !== false) blockingReasons.push("manifest_would_search_now");
  if (manifestRow.mayBroadSearchNow !== false) blockingReasons.push("manifest_would_broad_search_now");
  if (manifestRow.mayClassifySeasonStateNow !== false) blockingReasons.push("manifest_would_classify_now");
  if (manifestRow.mayWriteCanonicalNow !== false) blockingReasons.push("manifest_would_write_canonical_now");
  if (manifestRow.mayAssertTruthNow !== false) blockingReasons.push("manifest_would_assert_truth_now");

  if (manifestRow.fetchExecutedNow !== false) blockingReasons.push("manifest_fetched");
  if (manifestRow.searchExecutedNow !== false) blockingReasons.push("manifest_searched");
  if (manifestRow.broadSearchExecutedNow !== false) blockingReasons.push("manifest_broad_searched");
  if (manifestRow.classifierExecutedNow !== false) blockingReasons.push("manifest_classified");
  if (manifestRow.canonicalWriteExecutedNow !== false) blockingReasons.push("manifest_wrote_canonical");
  if (manifestRow.productionWriteExecutedNow !== false) blockingReasons.push("manifest_wrote_production");
  if (manifestRow.seasonStateTruthAssertedNow !== false) blockingReasons.push("manifest_asserted_truth");
  if (manifestRow.runnerManifestRowIsTruth !== false) blockingReasons.push("manifest_row_marked_truth");

  const qualityGateStatus =
    blockingReasons.length === 0
      ? "passed_whole_map_resumption_runner_manifest_quality_gate"
      : "blocked_whole_map_resumption_runner_manifest_quality_gate";

  return {
    manifestEntryId: manifestRow.manifestEntryId,
    actionId: manifestRow.actionId,
    actionType: manifestRow.actionType,
    executionPlanStep: manifestRow.executionPlanStep,
    qualityGateStatus,
    blockingReasons,

    sourceCandidateType: manifestRow.sourceCandidateType || null,
    sourceFilePath: manifestRow.sourceFilePath || null,
    sourceFileSha256: manifestRow.sourceFileSha256 || null,
    reusableFamilies: manifestRow.reusableFamilies || [],
    competitionSlugs: manifestRow.competitionSlugs || [],
    purpose: manifestRow.purpose || null,

    runnerManifestComplete: manifestRow.runnerManifestComplete,
    runnerManifestBuilt: manifestRow.runnerManifestBuilt,

    mayBuildWholeMapResumptionExecutionRunner:
      qualityGateStatus === "passed_whole_map_resumption_runner_manifest_quality_gate",
    qualityGateIsExecutionPermissionNow: false,
    qualityGateIsFetchPermissionNow: false,

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
    runnerManifestQualityGateRowIsTruth: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    nextAllowedStep:
      qualityGateStatus === "passed_whole_map_resumption_runner_manifest_quality_gate"
        ? "build_whole_map_resumption_execution_runner"
        : "repair_whole_map_resumption_runner_manifest",
    nextBlockedStep: "execution_fetch_search_classifier_canonical_write_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const manifest = readJson(args.manifestInput);
  const manifestRows = validateManifest(manifest);

  const qualityGateRows = manifestRows
    .map(buildQualityGateRow)
    .sort((a, b) => a.executionPlanStep.localeCompare(b.executionPlanStep) || a.manifestEntryId.localeCompare(b.manifestEntryId));

  const passedRows = qualityGateRows.filter((row) => row.qualityGateStatus === "passed_whole_map_resumption_runner_manifest_quality_gate");
  const blockedRows = qualityGateRows.filter((row) => row.qualityGateStatus !== "passed_whole_map_resumption_runner_manifest_quality_gate");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "run-football-truth-whole-map-resumption-runner-manifest-quality-gate-file",
    mode: "no_write_whole_map_resumption_runner_manifest_quality_gate",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      wholeMapResumptionRunnerManifest: args.manifestInput
    },
    summary: {
      runnerManifestReadCount: 1,
      wholeMapResumptionRunnerManifestQualityGateRowCount: qualityGateRows.length,
      wholeMapResumptionRunnerManifestQualityGatePassedCount: passedRows.length,
      wholeMapResumptionRunnerManifestQualityGateBlockedCount: blockedRows.length,

      primaryBatchRunnerManifestQualityGatedCount:
        qualityGateRows.filter((row) => row.executionPlanStep === "bind_primary_batch_runner_manifest").length,
      followupLaneQualityGatedPackManifestQualityGatedCount:
        qualityGateRows.filter((row) => row.executionPlanStep === "attach_followup_quality_gated_work_queue").length,
      activeWorkstreamExecutionWaveManifestQualityGatedCount:
        qualityGateRows.filter((row) => row.executionPlanStep === "attach_active_workstream_execution_wave_context").length,
      reusableFamilyPromotionManifestQualityGatedCount:
        qualityGateRows.filter((row) => row.executionPlanStep === "promote_reusable_family_patterns").length,
      providerFamilyRepairDeferredManifestQualityGatedCount:
        qualityGateRows.filter((row) => row.executionPlanStep === "defer_provider_family_repair_backlog").length,

      laligaReusablePatternManifestQualityGatedCount:
        qualityGateRows.filter((row) => (row.reusableFamilies || []).includes("laliga")).length,
      norwayNtfReusablePatternManifestQualityGatedCount:
        qualityGateRows.filter((row) => (row.reusableFamilies || []).includes("norway_ntf")).length,
      sportomediaProviderFamilyRepairDeferredManifestQualityGatedCount:
        qualityGateRows.filter((row) => (row.reusableFamilies || []).includes("sportomedia")).length,
      sportomediaBlocksWholeMapCount: 0,

      runnerManifestCompleteCount: qualityGateRows.filter((row) => row.runnerManifestComplete).length,
      runnerManifestBuiltCount: qualityGateRows.filter((row) => row.runnerManifestBuilt).length,
      mayBuildWholeMapResumptionExecutionRunnerCount:
        blockedRows.length === 0 ? 1 : 0,

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
      wholeMapResumptionRunnerManifestQualityGateTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        blockedRows.length === 0
          ? "build_whole_map_resumption_execution_runner"
          : "repair_whole_map_resumption_runner_manifest"
    },
    counts: {
      byActionType: countBy(qualityGateRows, "actionType"),
      byExecutionPlanStep: countBy(qualityGateRows, "executionPlanStep"),
      byQualityGateStatus: countBy(qualityGateRows, "qualityGateStatus"),
      byNextAllowedStep: countBy(qualityGateRows, "nextAllowedStep")
    },
    wholeMapResumptionPolicy: {
      resumeWholeMapNow: true,
      sportomediaBlocksWholeMap: false,
      sportomediaDisposition: "provider_family_repair_backlog",
      preservedReusableFamilyWins: ["laliga", "norway_ntf"],
      nextAction: "build_whole_map_resumption_execution_runner",
      noProviderMicroProbingInMainLane: true,
      qualityGateIsNotExecution: true,
      noExecutionUntilFutureExplicitRunnerGate: true,
      noFetchUntilFutureExplicitRunnerGate: true,
      noSearchUntilFutureExplicitApproval: true,
      noCanonicalWritesUntilFutureExplicitApproval: true,
      noProductionWritesUntilFutureExplicitApproval: true,
      noTruthAssertionsUntilFutureEvidenceGate: true
    },
    guardrails: [
      "This quality gate reads the whole-map resumption runner manifest only.",
      "It does not build or run an execution runner.",
      "It does not execute.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Manifest quality gate rows are workflow routing artifacts, not truth assertions.",
      "Passing this gate only allows building a whole-map resumption execution runner artifact.",
      "It does not allow execution or fetch now.",
      "Sportomedia remains in provider-family repair backlog and does not block the full-map main lane."
    ],
    qualityGateRows,
    blockedRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    runnerManifestReadCount: output.summary.runnerManifestReadCount,
    wholeMapResumptionRunnerManifestQualityGateRowCount: output.summary.wholeMapResumptionRunnerManifestQualityGateRowCount,
    wholeMapResumptionRunnerManifestQualityGatePassedCount: output.summary.wholeMapResumptionRunnerManifestQualityGatePassedCount,
    wholeMapResumptionRunnerManifestQualityGateBlockedCount: output.summary.wholeMapResumptionRunnerManifestQualityGateBlockedCount,
    primaryBatchRunnerManifestQualityGatedCount: output.summary.primaryBatchRunnerManifestQualityGatedCount,
    followupLaneQualityGatedPackManifestQualityGatedCount: output.summary.followupLaneQualityGatedPackManifestQualityGatedCount,
    activeWorkstreamExecutionWaveManifestQualityGatedCount: output.summary.activeWorkstreamExecutionWaveManifestQualityGatedCount,
    reusableFamilyPromotionManifestQualityGatedCount: output.summary.reusableFamilyPromotionManifestQualityGatedCount,
    providerFamilyRepairDeferredManifestQualityGatedCount: output.summary.providerFamilyRepairDeferredManifestQualityGatedCount,
    laligaReusablePatternManifestQualityGatedCount: output.summary.laligaReusablePatternManifestQualityGatedCount,
    norwayNtfReusablePatternManifestQualityGatedCount: output.summary.norwayNtfReusablePatternManifestQualityGatedCount,
    sportomediaProviderFamilyRepairDeferredManifestQualityGatedCount: output.summary.sportomediaProviderFamilyRepairDeferredManifestQualityGatedCount,
    sportomediaBlocksWholeMapCount: output.summary.sportomediaBlocksWholeMapCount,
    runnerManifestCompleteCount: output.summary.runnerManifestCompleteCount,
    runnerManifestBuiltCount: output.summary.runnerManifestBuiltCount,
    mayBuildWholeMapResumptionExecutionRunnerCount: output.summary.mayBuildWholeMapResumptionExecutionRunnerCount,
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
    wholeMapResumptionRunnerManifestQualityGateTruthCount: output.summary.wholeMapResumptionRunnerManifestQualityGateTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
