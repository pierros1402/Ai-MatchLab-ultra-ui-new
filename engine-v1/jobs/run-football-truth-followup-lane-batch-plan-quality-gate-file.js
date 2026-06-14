#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";
const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/followup-lane-batch-plan-bundle-2026-06-14/followup-lane-batch-plan-bundle-2026-06-14.json";
const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/followup-lane-batch-plan-quality-gate-2026-06-14/followup-lane-batch-plan-quality-gate-2026-06-14.json";

const RETAINED_RAW_MAP_COUNT = 689;
const ACTIVE_COMPETITION_COUNT = 515;
const SCOPE_ACCOUNTING_NO_ACTION_COUNT = 174;
const PRIMARY_COMPETITION_COUNT = 473;
const FOLLOWUP_COMPETITION_COUNT = 42;
const FOLLOWUP_BATCH_ROW_COUNT = 8;

const EXPECTED = {
  blocked_source_traceback_followup_batch_plan: {
    rows: 1,
    competitions: 23,
    status: "followup_batch_plan_ready_for_source_traceback_review_no_fetch",
    gateStatus: "passed_ready_for_blocked_source_traceback_followup_runner_manifest_without_fetch"
  },
  generic_validator_ready_followup_batch_plan: {
    rows: 3,
    competitions: 6,
    status: "followup_batch_plan_ready_for_generic_validator_planning_no_execution",
    gateStatus: "passed_ready_for_generic_validator_followup_runner_manifest_without_execution"
  },
  priority1_reusable_family_repair_followup_batch_plan: {
    rows: 1,
    competitions: 6,
    status: "followup_batch_plan_ready_for_priority1_reusable_family_repair_no_fetch",
    gateStatus: "passed_ready_for_priority1_reusable_family_repair_followup_runner_manifest_without_fetch"
  },
  standings_first_contract_review_followup_batch_plan: {
    rows: 1,
    competitions: 2,
    status: "followup_batch_plan_ready_for_standings_first_contract_review_no_write",
    gateStatus: "passed_ready_for_standings_first_contract_review_followup_runner_manifest_without_write"
  },
  cup_state_final_winner_review_followup_batch_plan: {
    rows: 1,
    competitions: 3,
    status: "followup_batch_plan_ready_for_cup_state_final_winner_review_no_write",
    gateStatus: "passed_ready_for_cup_state_final_winner_review_followup_runner_manifest_without_write"
  },
  policy_reduction_governance_followup_batch_plan: {
    rows: 1,
    competitions: 2,
    status: "followup_batch_plan_ready_for_policy_reduction_governance_no_suppression_write",
    gateStatus: "passed_ready_for_policy_reduction_governance_followup_runner_manifest_without_suppression_write"
  }
};

function parseArgs(argv) {
  const args = { date: DEFAULT_DATE, input: DEFAULT_INPUT, output: DEFAULT_OUTPUT };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--input") args.input = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error("Unknown argument: " + arg);
  }
  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error("Missing JSON input: " + filePath);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function stableJson(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

function uniqueSorted(values) {
  return [...new Set(
    values
      .filter((value) => value !== null && value !== undefined)
      .map((value) => String(value).trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value =
      row[key] === null || row[key] === undefined || String(row[key]).trim() === ""
        ? "__missing__"
        : String(row[key]).trim();
    counts[value] = (counts[value] || 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
  );
}

function assertSummary(summary, key, expected) {
  if (!(key in summary)) throw new Error("Missing summary key: " + key);
  if (summary[key] !== expected) {
    throw new Error("Guardrail failed for " + key + ": expected " + expected + ", got " + summary[key]);
  }
}

function validateBundleSummary(summary) {
  assertSummary(summary, "retainedRawMapCompetitionCount", RETAINED_RAW_MAP_COUNT);
  assertSummary(summary, "competitionCount", RETAINED_RAW_MAP_COUNT);
  assertSummary(summary, "activeExecutionWaveCompetitionCount", ACTIVE_COMPETITION_COUNT);
  assertSummary(summary, "scopeAccountingNoActionCompetitionCount", SCOPE_ACCOUNTING_NO_ACTION_COUNT);
  assertSummary(summary, "primaryRunnerManifestQualityGateCompetitionReferenceCount", PRIMARY_COMPETITION_COUNT);
  assertSummary(summary, "followupBatchPlanLaneCount", 6);
  assertSummary(summary, "followupBatchPlanOutputFileCount", 6);
  assertSummary(summary, "followupBatchPlanRowCount", FOLLOWUP_BATCH_ROW_COUNT);
  assertSummary(summary, "followupBatchPlanCompetitionReferenceCount", FOLLOWUP_COMPETITION_COUNT);
  assertSummary(summary, "followupBatchPlanUniqueCompetitionCount", FOLLOWUP_COMPETITION_COUNT);
  assertSummary(summary, "remainingFollowupLaneCompetitionCount", FOLLOWUP_COMPETITION_COUNT);
  assertSummary(summary, "blockedSourceTracebackFollowupCompetitionCount", 23);
  assertSummary(summary, "genericValidatorReadyFollowupCompetitionCount", 6);
  assertSummary(summary, "priority1ReusableFamilyRepairFollowupCompetitionCount", 6);
  assertSummary(summary, "standingsFirstContractReviewFollowupCompetitionCount", 2);
  assertSummary(summary, "cupStateFinalWinnerReviewFollowupCompetitionCount", 3);
  assertSummary(summary, "policyReductionGovernanceFollowupCompetitionCount", 2);
  assertSummary(summary, "currentEffectiveMapExactCountAsserted", false);
  assertSummary(summary, "currentEffectiveMapExactCount", null);
  assertSummary(summary, "sourceDiscoveryConfirmedActionableCompetitionCount", 0);
  assertSummary(summary, "actionableConfirmedNowCount", 0);
  assertSummary(summary, "contractConfirmedNowCount", 0);
  assertSummary(summary, "validatedRouteMapCount", 0);
  assertSummary(summary, "validatedFixtureContractCount", 0);
  assertSummary(summary, "validatedStandingsContractCount", 0);
  assertSummary(summary, "validatedSeasonStateContractCount", 0);
  assertSummary(summary, "followupExecutionAllowedNowCount", 0);
  assertSummary(summary, "runnerManifestExecutionAllowedNowCount", 0);
  assertSummary(summary, "fetchAllowedNowCount", 0);
  assertSummary(summary, "searchAllowedNowCount", 0);
  assertSummary(summary, "broadSearchAllowedNowCount", 0);
  assertSummary(summary, "controlledDiscoveryAllowedNowCount", 0);
  assertSummary(summary, "canonicalPromotionAllowedNowCount", 0);
  assertSummary(summary, "suppressionWriteAllowedNowCount", 0);
  assertSummary(summary, "zeroResultMayImplyAbsenceCount", 0);
  assertSummary(summary, "canonicalWriteEligibleNowCount", 0);
  assertSummary(summary, "activeAssertedCount", 0);
  assertSummary(summary, "inactiveAssertedCount", 0);
  assertSummary(summary, "completedAssertedCount", 0);
  assertSummary(summary, "canonicalWrites", 0);
  assertSummary(summary, "productionWrite", false);
}

function validateZeroSummary(summary, lane) {
  const checks = [
    ["followupExecutionAllowedNowCount", 0],
    ["fetchAllowedNowCount", 0],
    ["searchAllowedNowCount", 0],
    ["broadSearchAllowedNowCount", 0],
    ["controlledDiscoveryAllowedNowCount", 0],
    ["canonicalPromotionAllowedNowCount", 0],
    ["suppressionWriteAllowedNowCount", 0],
    ["zeroResultMayImplyAbsenceCount", 0],
    ["canonicalWriteEligibleNowCount", 0],
    ["activeAssertedCount", 0],
    ["inactiveAssertedCount", 0],
    ["completedAssertedCount", 0],
    ["canonicalWrites", 0],
    ["productionWrite", false]
  ];

  for (const [key, expected] of checks) {
    if (summary[key] !== expected) {
      throw new Error(lane + ": expected " + key + "=" + expected + ", got " + summary[key]);
    }
  }
}

function validateRow(row, lane) {
  const key = row.followupBatchGroupKey || "__missing_followup_batch_group_key__";

  if (row.followupBatchPlanLane !== lane) throw new Error(lane + "/" + key + ": followupBatchPlanLane mismatch");
  if (row.sourceOnly !== true) throw new Error(lane + "/" + key + ": sourceOnly must be true");
  if (row.followupExecutionAllowedNow !== false) throw new Error(lane + "/" + key + ": followupExecutionAllowedNow must be false");

  const falseFields = [
    "fetchAllowedNow",
    "searchAllowedNow",
    "broadSearchAllowedNow",
    "controlledDiscoveryAllowedNow",
    "canonicalPromotionAllowedNow",
    "suppressionWriteAllowedNow",
    "zeroResultMayImplyAbsence",
    "canonicalWriteEligibleNow",
    "productionWrite",
    "truthAssertionsAllowedNow",
    "activeAssertedNow",
    "inactiveAssertedNow",
    "completedAssertedNow"
  ];

  for (const field of falseFields) {
    if (row[field] !== false) throw new Error(lane + "/" + key + ": " + field + " must be false");
  }

  const requiredArrays = [
    "competitionSlugs",
    "slugPrefixes",
    "regions",
    "requiredEvidenceRoles",
    "followupGuardrails"
  ];

  for (const field of requiredArrays) {
    if (!Array.isArray(row[field]) || row[field].length < 1) {
      throw new Error(lane + "/" + key + ": " + field + " must be non-empty");
    }
  }

  if (!row.followupBatchPlanStatus) throw new Error(lane + "/" + key + ": followupBatchPlanStatus is required");
  if (!row.followupIntent) throw new Error(lane + "/" + key + ": followupIntent is required");
  if (row.followupExecutionMode !== "source_only_followup_batch_plan_not_executed") {
    throw new Error(lane + "/" + key + ": followupExecutionMode must be source_only_followup_batch_plan_not_executed");
  }
}

function validateLaneOutput(fileRow) {
  const lane = fileRow.followupBatchPlanLane;
  const expected = EXPECTED[lane];

  if (!expected) throw new Error("Unexpected follow-up batch plan lane: " + lane);
  if (!fs.existsSync(fileRow.outputFile)) throw new Error("Missing follow-up batch plan output file: " + fileRow.outputFile);

  const json = readJson(fileRow.outputFile);
  const summary = json.summary || {};
  const rows = Array.isArray(json.rows) ? json.rows : [];

  if (summary.followupBatchPlanLane !== lane) throw new Error(lane + ": summary.followupBatchPlanLane mismatch");
  if (summary.followupBatchPlanRowCount !== expected.rows) {
    throw new Error(lane + ": expected " + expected.rows + " rows, got " + summary.followupBatchPlanRowCount);
  }
  if (summary.followupBatchPlanCompetitionCount !== expected.competitions) {
    throw new Error(lane + ": expected " + expected.competitions + " competitions, got " + summary.followupBatchPlanCompetitionCount);
  }
  if (summary.followupBatchPlanUniqueCompetitionCount !== expected.competitions) {
    throw new Error(lane + ": expected " + expected.competitions + " unique competitions, got " + summary.followupBatchPlanUniqueCompetitionCount);
  }

  validateZeroSummary(summary, lane);

  if (rows.length !== expected.rows) {
    throw new Error(lane + ": expected rows length " + expected.rows + ", got " + rows.length);
  }

  for (const row of rows) {
    validateRow(row, lane);
    if (row.followupBatchPlanStatus !== expected.status) {
      throw new Error(lane + "/" + row.followupBatchGroupKey + ": expected status " + expected.status + ", got " + row.followupBatchPlanStatus);
    }
  }

  const uniqueSlugs = uniqueSorted(rows.flatMap((row) => row.competitionSlugs || []));
  if (uniqueSlugs.length !== expected.competitions) {
    throw new Error(lane + ": expected unique slugs " + expected.competitions + ", got " + uniqueSlugs.length);
  }

  return {
    followupBatchPlanLane: lane,
    qualityGateStatus: expected.gateStatus,
    inputFile: fileRow.outputFile,
    followupBatchPlanRowCount: expected.rows,
    followupBatchPlanCompetitionCount: expected.competitions,
    followupBatchPlanUniqueCompetitionCount: uniqueSlugs.length,
    slugPrefixCount: uniqueSorted(rows.flatMap((row) => row.slugPrefixes || [])).length,
    regionCount: uniqueSorted(rows.flatMap((row) => row.regions || [])).length,
    requiredEvidenceRoleCount: uniqueSorted(rows.flatMap((row) => row.requiredEvidenceRoles || [])).length,
    followupIntents: uniqueSorted(rows.map((row) => row.followupIntent)),
    followupExecutionModes: uniqueSorted(rows.map((row) => row.followupExecutionMode)),
    sampleCompetitionSlugs: uniqueSlugs.slice(0, 40),
    sourceOnly: true,
    followupExecutionAllowedNow: false,
    fetchAllowedNow: false,
    searchAllowedNow: false,
    broadSearchAllowedNow: false,
    controlledDiscoveryAllowedNow: false,
    canonicalPromotionAllowedNow: false,
    suppressionWriteAllowedNow: false,
    zeroResultMayImplyAbsence: false,
    canonicalWriteEligibleNow: false,
    productionWrite: false,
    truthAssertionsAllowedNow: false
  };
}

function main() {
  const args = parseArgs(process.argv);
  const bundle = readJson(args.input);
  validateBundleSummary(bundle.summary || {});

  const files = Array.isArray(bundle.followupBatchPlanOutputFiles) ? bundle.followupBatchPlanOutputFiles : [];
  if (files.length !== 6) throw new Error("Expected 6 followupBatchPlanOutputFiles, got " + files.length);

  const qualityGateRows = files
    .map(validateLaneOutput)
    .sort((a, b) => a.followupBatchPlanLane.localeCompare(b.followupBatchPlanLane));

  const passedRows = qualityGateRows.filter((row) => row.qualityGateStatus.startsWith("passed_"));
  const blockedRows = qualityGateRows.filter((row) => !row.qualityGateStatus.startsWith("passed_"));

  if (passedRows.length !== 6) throw new Error("Expected 6 passed follow-up lanes, got " + passedRows.length);
  if (blockedRows.length !== 0) throw new Error("Expected 0 blocked follow-up lanes, got " + blockedRows.length);

  const rowCount = qualityGateRows.reduce((sum, row) => sum + row.followupBatchPlanRowCount, 0);
  const competitionRefs = qualityGateRows.reduce((sum, row) => sum + row.followupBatchPlanCompetitionCount, 0);

  if (rowCount !== FOLLOWUP_BATCH_ROW_COUNT) {
    throw new Error("Expected " + FOLLOWUP_BATCH_ROW_COUNT + " follow-up rows, got " + rowCount);
  }

  if (competitionRefs !== FOLLOWUP_COMPETITION_COUNT) {
    throw new Error("Expected " + FOLLOWUP_COMPETITION_COUNT + " follow-up competition refs, got " + competitionRefs);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "run-football-truth-followup-lane-batch-plan-quality-gate-file",
    mode: "source_only_quality_gate_for_followup_lane_batch_plan_outputs_42_competitions_no_fetch_no_search_no_writes_no_truth_assertions",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      followupLaneBatchPlanBundle: args.input
    },
    summary: {
      retainedRawMapCompetitionCount: RETAINED_RAW_MAP_COUNT,
      competitionCount: RETAINED_RAW_MAP_COUNT,
      activeExecutionWaveCompetitionCount: ACTIVE_COMPETITION_COUNT,
      scopeAccountingNoActionCompetitionCount: SCOPE_ACCOUNTING_NO_ACTION_COUNT,
      primaryRunnerManifestQualityGateCompetitionReferenceCount: PRIMARY_COMPETITION_COUNT,

      followupBatchPlanQualityGateLaneCount: qualityGateRows.length,
      followupBatchPlanQualityGatePassedLaneCount: passedRows.length,
      followupBatchPlanQualityGateBlockedLaneCount: blockedRows.length,
      followupBatchPlanQualityGateRowCount: rowCount,
      followupBatchPlanQualityGateCompetitionReferenceCount: competitionRefs,
      followupBatchPlanQualityGateUniqueCompetitionCount: competitionRefs,
      remainingFollowupLaneCompetitionCount: FOLLOWUP_COMPETITION_COUNT,

      blockedSourceTracebackFollowupCompetitionCount: 23,
      genericValidatorReadyFollowupCompetitionCount: 6,
      priority1ReusableFamilyRepairFollowupCompetitionCount: 6,
      standingsFirstContractReviewFollowupCompetitionCount: 2,
      cupStateFinalWinnerReviewFollowupCompetitionCount: 3,
      policyReductionGovernanceFollowupCompetitionCount: 2,

      currentEffectiveMapExactCountAsserted: false,
      currentEffectiveMapExactCount: null,
      sourceDiscoveryConfirmedActionableCompetitionCount: 0,
      actionableConfirmedNowCount: 0,
      contractConfirmedNowCount: 0,
      validatedRouteMapCount: 0,
      validatedFixtureContractCount: 0,
      validatedStandingsContractCount: 0,
      validatedSeasonStateContractCount: 0,

      followupExecutionAllowedNowCount: 0,
      runnerManifestExecutionAllowedNowCount: 0,
      fetchAllowedNowCount: 0,
      searchAllowedNowCount: 0,
      broadSearchAllowedNowCount: 0,
      controlledDiscoveryAllowedNowCount: 0,
      canonicalPromotionAllowedNowCount: 0,
      suppressionWriteAllowedNowCount: 0,
      zeroResultMayImplyAbsenceCount: 0,
      canonicalWriteEligibleNowCount: 0,
      activeAssertedCount: 0,
      inactiveAssertedCount: 0,
      completedAssertedCount: 0,
      canonicalWrites: 0,
      productionWrite: false,

      recommendedNextLane: "build_followup_runner_manifest_bundle_without_fetch_for_remaining_42_competitions"
    },
    counts: {
      byFollowupBatchPlanLane: countBy(qualityGateRows, "followupBatchPlanLane"),
      byQualityGateStatus: countBy(qualityGateRows, "qualityGateStatus")
    },
    guardrails: [
      "This quality gate covers all follow-up batch plan outputs together.",
      "It validates the 42 non-primary active competitions from 8 follow-up batch rows.",
      "It does not execute follow-up runners.",
      "It does not execute fetch/search/write.",
      "Controlled discovery remains disabled.",
      "Canonical promotion remains disabled.",
      "Suppression writes remain disabled.",
      "It does not assert source discovery, actionable scope, contracts, route, fixture, standings, season-state, active, inactive, or completed truth.",
      "Zero result must not imply absence.",
      "No match today must not imply inactive.",
      "Match status must not be used as season-state truth."
    ],
    qualityGateRows,
    blockedRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    retainedRawMapCompetitionCount: output.summary.retainedRawMapCompetitionCount,
    competitionCount: output.summary.competitionCount,
    activeExecutionWaveCompetitionCount: output.summary.activeExecutionWaveCompetitionCount,
    scopeAccountingNoActionCompetitionCount: output.summary.scopeAccountingNoActionCompetitionCount,
    primaryRunnerManifestQualityGateCompetitionReferenceCount: output.summary.primaryRunnerManifestQualityGateCompetitionReferenceCount,
    followupBatchPlanQualityGateLaneCount: output.summary.followupBatchPlanQualityGateLaneCount,
    followupBatchPlanQualityGatePassedLaneCount: output.summary.followupBatchPlanQualityGatePassedLaneCount,
    followupBatchPlanQualityGateBlockedLaneCount: output.summary.followupBatchPlanQualityGateBlockedLaneCount,
    followupBatchPlanQualityGateRowCount: output.summary.followupBatchPlanQualityGateRowCount,
    followupBatchPlanQualityGateCompetitionReferenceCount: output.summary.followupBatchPlanQualityGateCompetitionReferenceCount,
    followupBatchPlanQualityGateUniqueCompetitionCount: output.summary.followupBatchPlanQualityGateUniqueCompetitionCount,
    remainingFollowupLaneCompetitionCount: output.summary.remainingFollowupLaneCompetitionCount,
    blockedSourceTracebackFollowupCompetitionCount: output.summary.blockedSourceTracebackFollowupCompetitionCount,
    genericValidatorReadyFollowupCompetitionCount: output.summary.genericValidatorReadyFollowupCompetitionCount,
    priority1ReusableFamilyRepairFollowupCompetitionCount: output.summary.priority1ReusableFamilyRepairFollowupCompetitionCount,
    standingsFirstContractReviewFollowupCompetitionCount: output.summary.standingsFirstContractReviewFollowupCompetitionCount,
    cupStateFinalWinnerReviewFollowupCompetitionCount: output.summary.cupStateFinalWinnerReviewFollowupCompetitionCount,
    policyReductionGovernanceFollowupCompetitionCount: output.summary.policyReductionGovernanceFollowupCompetitionCount,
    currentEffectiveMapExactCountAsserted: output.summary.currentEffectiveMapExactCountAsserted,
    currentEffectiveMapExactCount: output.summary.currentEffectiveMapExactCount,
    sourceDiscoveryConfirmedActionableCompetitionCount: output.summary.sourceDiscoveryConfirmedActionableCompetitionCount,
    actionableConfirmedNowCount: output.summary.actionableConfirmedNowCount,
    contractConfirmedNowCount: output.summary.contractConfirmedNowCount,
    validatedRouteMapCount: output.summary.validatedRouteMapCount,
    validatedFixtureContractCount: output.summary.validatedFixtureContractCount,
    validatedStandingsContractCount: output.summary.validatedStandingsContractCount,
    validatedSeasonStateContractCount: output.summary.validatedSeasonStateContractCount,
    followupExecutionAllowedNowCount: output.summary.followupExecutionAllowedNowCount,
    runnerManifestExecutionAllowedNowCount: output.summary.runnerManifestExecutionAllowedNowCount,
    fetchAllowedNowCount: output.summary.fetchAllowedNowCount,
    searchAllowedNowCount: output.summary.searchAllowedNowCount,
    broadSearchAllowedNowCount: output.summary.broadSearchAllowedNowCount,
    controlledDiscoveryAllowedNowCount: output.summary.controlledDiscoveryAllowedNowCount,
    canonicalPromotionAllowedNowCount: output.summary.canonicalPromotionAllowedNowCount,
    suppressionWriteAllowedNowCount: output.summary.suppressionWriteAllowedNowCount,
    zeroResultMayImplyAbsenceCount: output.summary.zeroResultMayImplyAbsenceCount,
    canonicalWriteEligibleNowCount: output.summary.canonicalWriteEligibleNowCount,
    activeAssertedCount: output.summary.activeAssertedCount,
    inactiveAssertedCount: output.summary.inactiveAssertedCount,
    completedAssertedCount: output.summary.completedAssertedCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
