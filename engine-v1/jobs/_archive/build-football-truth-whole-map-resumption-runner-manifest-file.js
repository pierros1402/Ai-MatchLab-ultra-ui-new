#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULTS = {
  date: "2026-06-14",
  planInput: "data/football-truth/_diagnostics/whole-map-resumption-execution-plan-2026-06-14/whole-map-resumption-execution-plan-2026-06-14.json",
  output: "data/football-truth/_diagnostics/whole-map-resumption-runner-manifest-2026-06-14/whole-map-resumption-runner-manifest-2026-06-14.json"
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
    else if (arg === "--plan-input") args.planInput = argv[++i];
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
  if (!(key in summary)) throw new Error("Missing execution plan summary key: " + key);
  if (summary[key] !== expected) {
    throw new Error(`Execution plan guardrail failed for ${key}: expected ${expected}, got ${summary[key]}`);
  }
}

function validateExecutionPlan(plan) {
  const s = plan.summary || {};

  assertSummary(s, "actionBundleQualityGateReadCount", 1);
  assertSummary(s, "wholeMapResumptionExecutionPlanRowCount", 5);
  assertSummary(s, "wholeMapResumptionExecutionPlanReadyCount", 5);
  assertSummary(s, "wholeMapResumptionExecutionPlanBlockedCount", 0);
  assertSummary(s, "primaryBatchRunnerManifestPlanCount", 1);
  assertSummary(s, "followupLaneQualityGatedPackPlanCount", 1);
  assertSummary(s, "activeWorkstreamExecutionWavePlanCount", 1);
  assertSummary(s, "reusableFamilyPromotionPlanCount", 1);
  assertSummary(s, "providerFamilyRepairDeferredPlanCount", 1);
  assertSummary(s, "laligaReusablePatternPlanCount", 1);
  assertSummary(s, "norwayNtfReusablePatternPlanCount", 1);
  assertSummary(s, "sportomediaProviderFamilyRepairDeferredPlanCount", 1);
  assertSummary(s, "sportomediaBlocksWholeMapCount", 0);
  assertSummary(s, "mayBuildWholeMapResumptionRunnerManifestCount", 1);
  assertSummary(s, "executionPlanIsExecutionPermissionNowCount", 0);
  assertSummary(s, "executionPlanIsFetchPermissionNowCount", 0);

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
  assertSummary(s, "wholeMapResumptionExecutionPlanTruthCount", 0);
  assertSummary(s, "canonicalWrites", 0);
  if (s.productionWrite !== false) throw new Error("Execution plan productionWrite must be false.");

  const rows = Array.isArray(plan.executionPlanRows) ? plan.executionPlanRows : [];
  if (rows.length !== 5) throw new Error("Expected 5 executionPlanRows.");

  const steps = new Set(rows.map((row) => row.executionPlanStep));
  for (const step of REQUIRED_PLAN_STEPS) {
    if (!steps.has(step)) throw new Error("Missing required execution plan step: " + step);
  }

  for (const row of rows) {
    if (row.executionPlanStatus !== "ready_for_whole_map_resumption_runner_manifest_build") {
      throw new Error(row.actionId + ": execution plan row is not runner-manifest ready.");
    }
    if (row.mayBuildWholeMapResumptionRunnerManifest !== true) {
      throw new Error(row.actionId + ": mayBuildWholeMapResumptionRunnerManifest must be true.");
    }
    if (row.executionPlanIsExecutionPermissionNow !== false) throw new Error(row.actionId + ": execution permission must be false.");
    if (row.executionPlanIsFetchPermissionNow !== false) throw new Error(row.actionId + ": fetch permission must be false.");
    if (row.mayExecuteNow !== false) throw new Error(row.actionId + ": mayExecuteNow must be false.");
    if (row.mayFetchNow !== false) throw new Error(row.actionId + ": mayFetchNow must be false.");
    if (row.maySearchNow !== false) throw new Error(row.actionId + ": maySearchNow must be false.");
    if (row.mayBroadSearchNow !== false) throw new Error(row.actionId + ": mayBroadSearchNow must be false.");
    if (row.mayClassifySeasonStateNow !== false) throw new Error(row.actionId + ": mayClassifySeasonStateNow must be false.");
    if (row.mayWriteCanonicalNow !== false) throw new Error(row.actionId + ": mayWriteCanonicalNow must be false.");
    if (row.mayAssertTruthNow !== false) throw new Error(row.actionId + ": mayAssertTruthNow must be false.");
  }

  return rows;
}

function buildManifestRow(planRow) {
  return {
    manifestEntryId: `whole-map-resumption:${planRow.executionPlanStep}`,
    actionId: planRow.actionId,
    actionType: planRow.actionType,
    executionPlanStep: planRow.executionPlanStep,
    manifestEntryStatus: "ready_for_whole_map_resumption_runner_manifest_quality_gate",

    sourceCandidateType: planRow.sourceCandidateType || null,
    sourceFilePath: planRow.sourceFilePath || null,
    sourceFileSha256: planRow.sourceFileSha256 || null,
    reusableFamilies: planRow.reusableFamilies || [],
    competitionSlugs: planRow.competitionSlugs || [],
    purpose: planRow.purpose || null,

    runnerManifestScope: "whole_map_resumption_main_lane_no_provider_micro_probing",
    runnerManifestRole: "routing_manifest_entry_not_execution",
    runnerManifestComplete: true,
    runnerManifestBuilt: true,

    mayProceedToWholeMapResumptionRunnerManifestQualityGate: true,
    runnerManifestIsExecutionPermissionNow: false,
    runnerManifestIsFetchPermissionNow: false,

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
    runnerManifestRowIsTruth: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    nextAllowedStep: "run_whole_map_resumption_runner_manifest_quality_gate",
    nextBlockedStep: "execution_fetch_search_classifier_canonical_write_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const plan = readJson(args.planInput);
  const planRows = validateExecutionPlan(plan);

  const manifestRows = planRows
    .map(buildManifestRow)
    .sort((a, b) => a.executionPlanStep.localeCompare(b.executionPlanStep) || a.actionId.localeCompare(b.actionId));

  const blockedRows = manifestRows.filter((row) => row.manifestEntryStatus !== "ready_for_whole_map_resumption_runner_manifest_quality_gate");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-whole-map-resumption-runner-manifest-file",
    mode: "no_write_whole_map_resumption_runner_manifest_from_execution_plan",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      wholeMapResumptionExecutionPlan: args.planInput
    },
    summary: {
      executionPlanReadCount: 1,
      wholeMapResumptionRunnerManifestRowCount: manifestRows.length,
      wholeMapResumptionRunnerManifestReadyCount:
        manifestRows.filter((row) => row.manifestEntryStatus === "ready_for_whole_map_resumption_runner_manifest_quality_gate").length,
      wholeMapResumptionRunnerManifestBlockedCount: blockedRows.length,

      primaryBatchRunnerManifestEntryCount:
        manifestRows.filter((row) => row.executionPlanStep === "bind_primary_batch_runner_manifest").length,
      followupLaneQualityGatedPackManifestEntryCount:
        manifestRows.filter((row) => row.executionPlanStep === "attach_followup_quality_gated_work_queue").length,
      activeWorkstreamExecutionWaveManifestEntryCount:
        manifestRows.filter((row) => row.executionPlanStep === "attach_active_workstream_execution_wave_context").length,
      reusableFamilyPromotionManifestEntryCount:
        manifestRows.filter((row) => row.executionPlanStep === "promote_reusable_family_patterns").length,
      providerFamilyRepairDeferredManifestEntryCount:
        manifestRows.filter((row) => row.executionPlanStep === "defer_provider_family_repair_backlog").length,

      laligaReusablePatternManifestEntryCount:
        manifestRows.filter((row) => (row.reusableFamilies || []).includes("laliga")).length,
      norwayNtfReusablePatternManifestEntryCount:
        manifestRows.filter((row) => (row.reusableFamilies || []).includes("norway_ntf")).length,
      sportomediaProviderFamilyRepairDeferredManifestEntryCount:
        manifestRows.filter((row) => (row.reusableFamilies || []).includes("sportomedia")).length,
      sportomediaBlocksWholeMapCount: 0,

      runnerManifestCompleteCount: manifestRows.filter((row) => row.runnerManifestComplete).length,
      runnerManifestBuiltCount: manifestRows.filter((row) => row.runnerManifestBuilt).length,
      mayProceedToWholeMapResumptionRunnerManifestQualityGateCount:
        blockedRows.length === 0 ? 1 : 0,

      runnerManifestIsExecutionPermissionNowCount:
        manifestRows.filter((row) => row.runnerManifestIsExecutionPermissionNow).length,
      runnerManifestIsFetchPermissionNowCount:
        manifestRows.filter((row) => row.runnerManifestIsFetchPermissionNow).length,

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
      wholeMapResumptionRunnerManifestTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        blockedRows.length === 0
          ? "run_whole_map_resumption_runner_manifest_quality_gate"
          : "repair_whole_map_resumption_runner_manifest"
    },
    counts: {
      byActionType: countBy(manifestRows, "actionType"),
      byExecutionPlanStep: countBy(manifestRows, "executionPlanStep"),
      byManifestEntryStatus: countBy(manifestRows, "manifestEntryStatus"),
      byNextAllowedStep: countBy(manifestRows, "nextAllowedStep")
    },
    wholeMapResumptionPolicy: {
      resumeWholeMapNow: true,
      sportomediaBlocksWholeMap: false,
      sportomediaDisposition: "provider_family_repair_backlog",
      preservedReusableFamilyWins: ["laliga", "norway_ntf"],
      nextAction: "run_whole_map_resumption_runner_manifest_quality_gate",
      noProviderMicroProbingInMainLane: true,
      runnerManifestIsNotExecution: true,
      noExecutionUntilFutureExplicitRunnerGate: true,
      noFetchUntilFutureExplicitRunnerGate: true,
      noSearchUntilFutureExplicitApproval: true,
      noCanonicalWritesUntilFutureExplicitApproval: true,
      noProductionWritesUntilFutureExplicitApproval: true,
      noTruthAssertionsUntilFutureEvidenceGate: true
    },
    guardrails: [
      "This runner manifest reads the whole-map resumption execution plan only.",
      "It does not run a runner.",
      "It does not execute.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Runner manifest rows are workflow routing artifacts, not truth assertions.",
      "Passing this manifest only allows running a runner manifest quality gate.",
      "It does not allow execution or fetch now.",
      "Sportomedia remains in provider-family repair backlog and does not block the full-map main lane."
    ],
    manifestRows,
    blockedRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    executionPlanReadCount: output.summary.executionPlanReadCount,
    wholeMapResumptionRunnerManifestRowCount: output.summary.wholeMapResumptionRunnerManifestRowCount,
    wholeMapResumptionRunnerManifestReadyCount: output.summary.wholeMapResumptionRunnerManifestReadyCount,
    wholeMapResumptionRunnerManifestBlockedCount: output.summary.wholeMapResumptionRunnerManifestBlockedCount,
    primaryBatchRunnerManifestEntryCount: output.summary.primaryBatchRunnerManifestEntryCount,
    followupLaneQualityGatedPackManifestEntryCount: output.summary.followupLaneQualityGatedPackManifestEntryCount,
    activeWorkstreamExecutionWaveManifestEntryCount: output.summary.activeWorkstreamExecutionWaveManifestEntryCount,
    reusableFamilyPromotionManifestEntryCount: output.summary.reusableFamilyPromotionManifestEntryCount,
    providerFamilyRepairDeferredManifestEntryCount: output.summary.providerFamilyRepairDeferredManifestEntryCount,
    laligaReusablePatternManifestEntryCount: output.summary.laligaReusablePatternManifestEntryCount,
    norwayNtfReusablePatternManifestEntryCount: output.summary.norwayNtfReusablePatternManifestEntryCount,
    sportomediaProviderFamilyRepairDeferredManifestEntryCount: output.summary.sportomediaProviderFamilyRepairDeferredManifestEntryCount,
    sportomediaBlocksWholeMapCount: output.summary.sportomediaBlocksWholeMapCount,
    runnerManifestCompleteCount: output.summary.runnerManifestCompleteCount,
    runnerManifestBuiltCount: output.summary.runnerManifestBuiltCount,
    mayProceedToWholeMapResumptionRunnerManifestQualityGateCount: output.summary.mayProceedToWholeMapResumptionRunnerManifestQualityGateCount,
    runnerManifestIsExecutionPermissionNowCount: output.summary.runnerManifestIsExecutionPermissionNowCount,
    runnerManifestIsFetchPermissionNowCount: output.summary.runnerManifestIsFetchPermissionNowCount,
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
    wholeMapResumptionRunnerManifestTruthCount: output.summary.wholeMapResumptionRunnerManifestTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
