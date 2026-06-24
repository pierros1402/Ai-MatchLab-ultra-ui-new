#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DEFAULTS = {
  date: "2026-06-14",
  selectorInput: "data/football-truth/_diagnostics/whole-map-resumption-selector-2026-06-14/whole-map-resumption-selector-2026-06-14.json",
  output: "data/football-truth/_diagnostics/whole-map-resumption-action-bundle-2026-06-14/whole-map-resumption-action-bundle-2026-06-14.json"
};

const REQUIRED_SELECTED_TYPES = [
  "primary_batch_runner_manifest_or_quality_gate",
  "followup_lane_quality_gated_pack",
  "whole_map_active_workstream_or_execution_wave"
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

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
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

  assertSummary(s, "pilotBoardReadCount", 1);
  assertSummary(s, "pilotCompetitionCount", 6);
  assertSummary(s, "retainedReusableFamilyPatternCount", 4);
  assertSummary(s, "deferredProviderFamilyRepairCount", 2);
  assertSummary(s, "sportomediaDeferredRepairLaneCount", 2);
  assertSummary(s, "wholeMapResumptionBlockedByPilotCount", 0);
  assertSummary(s, "selectedResumptionInputCount", 3);
  assertSummary(s, "selectedPrimaryBatchRunnerManifestOrQualityGateCount", 1);
  assertSummary(s, "selectedFollowupLaneQualityGatedPackCount", 1);
  assertSummary(s, "selectedWholeMapActiveWorkstreamOrExecutionWaveCount", 1);
  assertSummary(s, "missingPreferredResumptionInputTypeCount", 0);
  assertSummary(s, "wholeMapResumptionSelectorReadyCount", 1);
  assertSummary(s, "wholeMapResumptionSelectorBlockedCount", 0);

  assertSummary(s, "fetchExecutedNowCount", 0);
  assertSummary(s, "searchExecutedNowCount", 0);
  assertSummary(s, "broadSearchExecutedNowCount", 0);
  assertSummary(s, "classifierExecutedNowCount", 0);
  assertSummary(s, "canonicalWriteExecutedNowCount", 0);
  assertSummary(s, "productionWriteExecutedNowCount", 0);
  assertSummary(s, "seasonStateTruthAssertedCount", 0);
  assertSummary(s, "wholeMapResumptionSelectorTruthCount", 0);
  assertSummary(s, "canonicalWrites", 0);

  if (s.productionWrite !== false) throw new Error("Selector productionWrite must be false.");
  if (selector.resumptionStatus !== "ready_to_build_whole_map_resumption_action_bundle") {
    throw new Error("Selector is not ready for whole-map resumption action bundle.");
  }
  if (selector.wholeMapResumptionPolicy?.sportomediaBlocksWholeMap !== false) {
    throw new Error("Sportomedia must not block whole-map resumption.");
  }

  const selectedRows = Array.isArray(selector.selectedRows) ? selector.selectedRows : [];
  if (selectedRows.length !== 3) throw new Error("Expected exactly 3 selected resumption inputs.");

  const types = new Set(selectedRows.map((row) => row.candidateType));
  for (const type of REQUIRED_SELECTED_TYPES) {
    if (!types.has(type)) throw new Error("Missing required selected input type: " + type);
  }

  return selectedRows;
}

function readSelectedInputMetadata(selectedRows) {
  return selectedRows
    .map((row) => {
      const filePath = row.filePath;
      if (!filePath || !fs.existsSync(filePath)) {
        throw new Error("Selected resumption input file is missing: " + filePath);
      }

      const raw = fs.readFileSync(filePath, "utf8");
      let json = null;
      try {
        json = JSON.parse(raw);
      } catch {
        throw new Error("Selected resumption input is not valid JSON: " + filePath);
      }

      return {
        candidateType: row.candidateType,
        candidateScore: row.candidateScore,
        filePath,
        fileSha256: sha256(raw),
        sourceJob: json.job || null,
        sourceMode: json.mode || null,
        sourceRecommendedNextLane: json.summary?.recommendedNextLane || row.recommendedNextLane || null,
        sourceSummaryKeyCount: Object.keys(json.summary || {}).length,
        sourceHasSummary: Boolean(json.summary && typeof json.summary === "object"),
        selectedForActionBundle: true
      };
    })
    .sort((a, b) => a.candidateType.localeCompare(b.candidateType));
}

function buildActionRows(selectedInputs) {
  const byType = new Map(selectedInputs.map((row) => [row.candidateType, row]));

  const primary = byType.get("primary_batch_runner_manifest_or_quality_gate");
  const followup = byType.get("followup_lane_quality_gated_pack");
  const wave = byType.get("whole_map_active_workstream_or_execution_wave");

  return [
    {
      actionId: "resume-primary-batch-runner-manifest",
      actionType: "whole_map_resume_primary_manifest",
      actionStatus: "ready_for_whole_map_resumption_action_bundle_quality_gate",
      sourceCandidateType: primary.candidateType,
      sourceFilePath: primary.filePath,
      sourceFileSha256: primary.fileSha256,
      purpose: "Use the best selected primary batch runner/quality-gated manifest signal as the main whole-map resumption anchor.",
      mayExecuteNow: false,
      mayFetchNow: false,
      maySearchNow: false,
      mayBroadSearchNow: false,
      mayClassifySeasonStateNow: false,
      mayWriteCanonicalNow: false,
      mayAssertTruthNow: false
    },
    {
      actionId: "attach-followup-quality-gated-lane-pack",
      actionType: "whole_map_attach_followup_quality_gated_pack",
      actionStatus: "ready_for_whole_map_resumption_action_bundle_quality_gate",
      sourceCandidateType: followup.candidateType,
      sourceFilePath: followup.filePath,
      sourceFileSha256: followup.fileSha256,
      purpose: "Retain follow-up quality-gated lanes as the controlled next full-map work queue, not as truth.",
      mayExecuteNow: false,
      mayFetchNow: false,
      maySearchNow: false,
      mayBroadSearchNow: false,
      mayClassifySeasonStateNow: false,
      mayWriteCanonicalNow: false,
      mayAssertTruthNow: false
    },
    {
      actionId: "attach-active-workstream-or-execution-wave",
      actionType: "whole_map_attach_active_workstream_execution_wave",
      actionStatus: "ready_for_whole_map_resumption_action_bundle_quality_gate",
      sourceCandidateType: wave.candidateType,
      sourceFilePath: wave.filePath,
      sourceFileSha256: wave.fileSha256,
      purpose: "Resume from the selected active workstream/execution-wave context, while requiring later gates before any controlled execution.",
      mayExecuteNow: false,
      mayFetchNow: false,
      maySearchNow: false,
      mayBroadSearchNow: false,
      mayClassifySeasonStateNow: false,
      mayWriteCanonicalNow: false,
      mayAssertTruthNow: false
    },
    {
      actionId: "promote-laliga-and-norway-reusable-patterns",
      actionType: "promote_reusable_family_patterns_to_full_map",
      actionStatus: "ready_for_whole_map_resumption_action_bundle_quality_gate",
      reusableFamilies: ["laliga", "norway_ntf"],
      competitionSlugs: ["esp.1", "esp.2", "nor.1", "nor.2"],
      purpose: "Preserve pilot wins and reuse LaLiga/Norway family patterns in broader full-map lanes.",
      mayExecuteNow: false,
      mayFetchNow: false,
      maySearchNow: false,
      mayBroadSearchNow: false,
      mayClassifySeasonStateNow: false,
      mayWriteCanonicalNow: false,
      mayAssertTruthNow: false
    },
    {
      actionId: "defer-sportomedia-provider-family-repair",
      actionType: "defer_provider_family_repair_backlog",
      actionStatus: "ready_for_whole_map_resumption_action_bundle_quality_gate",
      reusableFamilies: ["sportomedia"],
      competitionSlugs: ["swe.1", "swe.2"],
      purpose: "Keep Sportomedia as separate provider-family repair backlog. It must not block full-map resumption.",
      mayExecuteNow: false,
      mayFetchNow: false,
      maySearchNow: false,
      mayBroadSearchNow: false,
      mayClassifySeasonStateNow: false,
      mayWriteCanonicalNow: false,
      mayAssertTruthNow: false
    }
  ];
}

function main() {
  const args = parseArgs(process.argv);
  const selector = readJson(args.selectorInput);
  const selectedRows = validateSelector(selector);
  const selectedInputs = readSelectedInputMetadata(selectedRows);
  const actionRows = buildActionRows(selectedInputs);

  const blockedActions = actionRows.filter((row) => row.actionStatus !== "ready_for_whole_map_resumption_action_bundle_quality_gate");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-whole-map-resumption-action-bundle-file",
    mode: "no_write_whole_map_resumption_action_bundle_from_selector",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      wholeMapResumptionSelector: args.selectorInput
    },
    summary: {
      selectorReadCount: 1,
      selectedResumptionInputCount: selectedInputs.length,
      selectedPrimaryBatchRunnerManifestOrQualityGateCount:
        selectedInputs.filter((row) => row.candidateType === "primary_batch_runner_manifest_or_quality_gate").length,
      selectedFollowupLaneQualityGatedPackCount:
        selectedInputs.filter((row) => row.candidateType === "followup_lane_quality_gated_pack").length,
      selectedWholeMapActiveWorkstreamOrExecutionWaveCount:
        selectedInputs.filter((row) => row.candidateType === "whole_map_active_workstream_or_execution_wave").length,

      actionBundleRowCount: actionRows.length,
      actionBundleReadyRowCount: actionRows.filter((row) => row.actionStatus === "ready_for_whole_map_resumption_action_bundle_quality_gate").length,
      actionBundleBlockedRowCount: blockedActions.length,

      wholeMapResumePrimaryManifestActionCount:
        actionRows.filter((row) => row.actionType === "whole_map_resume_primary_manifest").length,
      wholeMapAttachFollowupQualityGatedPackActionCount:
        actionRows.filter((row) => row.actionType === "whole_map_attach_followup_quality_gated_pack").length,
      wholeMapAttachActiveWorkstreamExecutionWaveActionCount:
        actionRows.filter((row) => row.actionType === "whole_map_attach_active_workstream_execution_wave").length,
      reusableFamilyPromotionActionCount:
        actionRows.filter((row) => row.actionType === "promote_reusable_family_patterns_to_full_map").length,
      providerFamilyRepairDeferredActionCount:
        actionRows.filter((row) => row.actionType === "defer_provider_family_repair_backlog").length,

      laligaReusablePatternPromotedCount: 1,
      norwayNtfReusablePatternPromotedCount: 1,
      sportomediaProviderFamilyRepairDeferredCount: 1,
      sportomediaBlocksWholeMapCount: 0,

      mayProceedToWholeMapResumptionActionBundleQualityGateCount:
        blockedActions.length === 0 ? 1 : 0,

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
      wholeMapResumptionActionBundleTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        blockedActions.length === 0
          ? "run_whole_map_resumption_action_bundle_quality_gate"
          : "repair_whole_map_resumption_action_bundle"
    },
    counts: {
      bySelectedCandidateType: countBy(selectedInputs, "candidateType"),
      byActionType: countBy(actionRows, "actionType"),
      byActionStatus: countBy(actionRows, "actionStatus")
    },
    wholeMapResumptionPolicy: {
      resumeWholeMapNow: true,
      sportomediaBlocksWholeMap: false,
      sportomediaDisposition: "provider_family_repair_backlog",
      preservedReusableFamilyWins: ["laliga", "norway_ntf"],
      nextAction: "run_whole_map_resumption_action_bundle_quality_gate",
      noProviderMicroProbingInMainLane: true,
      noCanonicalWritesUntilFutureExplicitApproval: true,
      noProductionWritesUntilFutureExplicitApproval: true,
      noTruthAssertionsUntilFutureEvidenceGate: true
    },
    guardrails: [
      "This action bundle reads the whole-map resumption selector and selected local diagnostics only.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a classifier.",
      "It does not execute the selected manifests or workstreams.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Action rows are workflow routing artifacts, not truth assertions.",
      "Sportomedia remains in provider-family repair backlog and does not block the full-map main lane.",
      "The next step must be a quality gate before any execution runner is built or run."
    ],
    selectedInputs,
    actionRows,
    blockedActions
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    selectorReadCount: output.summary.selectorReadCount,
    selectedResumptionInputCount: output.summary.selectedResumptionInputCount,
    selectedPrimaryBatchRunnerManifestOrQualityGateCount: output.summary.selectedPrimaryBatchRunnerManifestOrQualityGateCount,
    selectedFollowupLaneQualityGatedPackCount: output.summary.selectedFollowupLaneQualityGatedPackCount,
    selectedWholeMapActiveWorkstreamOrExecutionWaveCount: output.summary.selectedWholeMapActiveWorkstreamOrExecutionWaveCount,
    actionBundleRowCount: output.summary.actionBundleRowCount,
    actionBundleReadyRowCount: output.summary.actionBundleReadyRowCount,
    actionBundleBlockedRowCount: output.summary.actionBundleBlockedRowCount,
    wholeMapResumePrimaryManifestActionCount: output.summary.wholeMapResumePrimaryManifestActionCount,
    wholeMapAttachFollowupQualityGatedPackActionCount: output.summary.wholeMapAttachFollowupQualityGatedPackActionCount,
    wholeMapAttachActiveWorkstreamExecutionWaveActionCount: output.summary.wholeMapAttachActiveWorkstreamExecutionWaveActionCount,
    reusableFamilyPromotionActionCount: output.summary.reusableFamilyPromotionActionCount,
    providerFamilyRepairDeferredActionCount: output.summary.providerFamilyRepairDeferredActionCount,
    laligaReusablePatternPromotedCount: output.summary.laligaReusablePatternPromotedCount,
    norwayNtfReusablePatternPromotedCount: output.summary.norwayNtfReusablePatternPromotedCount,
    sportomediaProviderFamilyRepairDeferredCount: output.summary.sportomediaProviderFamilyRepairDeferredCount,
    sportomediaBlocksWholeMapCount: output.summary.sportomediaBlocksWholeMapCount,
    mayProceedToWholeMapResumptionActionBundleQualityGateCount: output.summary.mayProceedToWholeMapResumptionActionBundleQualityGateCount,
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
    wholeMapResumptionActionBundleTruthCount: output.summary.wholeMapResumptionActionBundleTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
