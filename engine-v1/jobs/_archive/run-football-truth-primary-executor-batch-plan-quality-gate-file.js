#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/primary-executor-batch-plan-bundle-2026-06-14/primary-executor-batch-plan-bundle-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/primary-executor-batch-plan-quality-gate-2026-06-14/primary-executor-batch-plan-quality-gate-2026-06-14.json";

const RETAINED_RAW_MAP_COUNT = 689;
const ACTIVE_COMPETITION_COUNT = 515;
const SCOPE_ACCOUNTING_NO_ACTION_COUNT = 174;
const PRIMARY_COMPETITION_COUNT = 473;
const PRIMARY_EXECUTOR_ROW_COUNT = 273;
const PRIMARY_BATCH_ROW_COUNT = 13;
const REMAINING_FOLLOWUP_COUNT = 42;

const EXPECTED_BATCH_LANES = {
  source_authority_template_executor_batch_plan: {
    batchRows: 6,
    executorRows: 193,
    competitions: 372,
    batchPlanStatus: "batch_plan_ready_no_fetch_no_search",
    gateStatus: "passed_ready_for_source_authority_batch_runner_manifest_without_fetch",
    nextRunner: "build_source_authority_batch_runner_manifest_without_fetch_for_372_competitions"
  },
  existing_signal_truth_gap_executor_batch_plan: {
    batchRows: 7,
    executorRows: 80,
    competitions: 101,
    batchPlanStatus: "batch_plan_ready_no_truth_assertion",
    gateStatus: "passed_ready_for_existing_signal_batch_runner_manifest_without_truth_assertion",
    nextRunner: "build_existing_signal_batch_runner_manifest_without_truth_assertion_for_101_competitions"
  }
};

function parseArgs(argv) {
  const args = { date: DEFAULT_DATE, input: DEFAULT_INPUT, output: DEFAULT_OUTPUT };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--input") args.input = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing JSON input: ${filePath}`);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
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
  if (!(key in summary)) throw new Error(`Missing summary key: ${key}`);
  if (summary[key] !== expected) {
    throw new Error(`Guardrail failed for ${key}: expected ${expected}, got ${summary[key]}`);
  }
}

function assertZeroCounts(summary, label) {
  const checks = [
    ["fetchAllowedNowCount", 0],
    ["searchAllowedNowCount", 0],
    ["broadSearchAllowedNowCount", 0],
    ["controlledDiscoveryAllowedNowCount", 0],
    ["canonicalPromotionAllowedNowCount", 0],
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
      throw new Error(`${label}: expected ${key}=${expected}, got ${summary[key]}`);
    }
  }
}

function assertBatchRow(row, lane) {
  const key = row.batchGroupKey || "__missing_batch_group_key__";

  if (row.batchPlanLane !== lane) throw new Error(`${lane}/${key}: batchPlanLane mismatch`);
  if (row.sourceOnly !== true) throw new Error(`${lane}/${key}: sourceOnly must be true`);

  const falseFields = [
    "fetchAllowedNow",
    "searchAllowedNow",
    "broadSearchAllowedNow",
    "controlledDiscoveryAllowedNow",
    "canonicalPromotionAllowedNow",
    "zeroResultMayImplyAbsence",
    "canonicalWriteEligibleNow",
    "productionWrite",
    "truthAssertionsAllowedNow",
    "activeAssertedNow",
    "inactiveAssertedNow",
    "completedAssertedNow"
  ];

  for (const field of falseFields) {
    if (row[field] !== false) throw new Error(`${lane}/${key}: ${field} must be false`);
  }

  const arrayFields = [
    "competitionSlugs",
    "slugPrefixes",
    "regions",
    "requiredEvidenceRoles",
    "requiredExecutorSections",
    "executorPlanActions",
    "nextAllowedSteps",
    "compilerGroupingKeys",
    "sourceExecutorPlanIndexes",
    "batchGuardrails"
  ];

  for (const field of arrayFields) {
    if (!Array.isArray(row[field]) || row[field].length < 1) {
      throw new Error(`${lane}/${key}: ${field} must be non-empty`);
    }
  }

  if (!row.batchPlanStatus) throw new Error(`${lane}/${key}: batchPlanStatus is required`);
  if (!row.batchExecutionMode) throw new Error(`${lane}/${key}: batchExecutionMode is required`);
  if (!row.batchRegionKey) throw new Error(`${lane}/${key}: batchRegionKey is required`);
  if (!Number.isInteger(row.executorPlanRowCount) || row.executorPlanRowCount < 1) {
    throw new Error(`${lane}/${key}: executorPlanRowCount must be positive integer`);
  }
}

function validateBatchFile(fileRow) {
  const lane = fileRow.batchPlanLane;
  const expected = EXPECTED_BATCH_LANES[lane];

  if (!expected) throw new Error(`Unexpected batch plan lane: ${lane}`);
  if (!fs.existsSync(fileRow.outputFile)) throw new Error(`Missing batch plan output file: ${fileRow.outputFile}`);

  const json = readJson(fileRow.outputFile);
  const summary = json.summary || {};
  const rows = Array.isArray(json.rows) ? json.rows : [];

  if (summary.batchPlanLane !== lane) throw new Error(`${lane}: summary.batchPlanLane mismatch`);
  if (summary.batchPlanRowCount !== expected.batchRows) {
    throw new Error(`${lane}: expected ${expected.batchRows} batch rows, got ${summary.batchPlanRowCount}`);
  }
  if (summary.executorPlanRowCount !== expected.executorRows) {
    throw new Error(`${lane}: expected ${expected.executorRows} executor rows, got ${summary.executorPlanRowCount}`);
  }
  if (summary.batchPlanCompetitionCount !== expected.competitions) {
    throw new Error(`${lane}: expected ${expected.competitions} competitions, got ${summary.batchPlanCompetitionCount}`);
  }
  if (summary.batchPlanUniqueCompetitionCount !== expected.competitions) {
    throw new Error(`${lane}: expected ${expected.competitions} unique competitions, got ${summary.batchPlanUniqueCompetitionCount}`);
  }

  assertZeroCounts(summary, lane);

  if (rows.length !== expected.batchRows) {
    throw new Error(`${lane}: expected ${expected.batchRows} rows array length, got ${rows.length}`);
  }

  let executorRowSum = 0;
  for (const row of rows) {
    assertBatchRow(row, lane);
    if (row.batchPlanStatus !== expected.batchPlanStatus) {
      throw new Error(`${lane}/${row.batchGroupKey}: expected batchPlanStatus ${expected.batchPlanStatus}, got ${row.batchPlanStatus}`);
    }
    if (row.batchExecutionMode !== "source_only_batch_plan_not_executed") {
      throw new Error(`${lane}/${row.batchGroupKey}: batchExecutionMode must be source_only_batch_plan_not_executed`);
    }
    executorRowSum += row.executorPlanRowCount;
  }

  if (executorRowSum !== expected.executorRows) {
    throw new Error(`${lane}: expected executor row sum ${expected.executorRows}, got ${executorRowSum}`);
  }

  const uniqueSlugs = uniqueSorted(rows.flatMap((row) => row.competitionSlugs || []));
  if (uniqueSlugs.length !== expected.competitions) {
    throw new Error(`${lane}: expected ${expected.competitions} unique slugs, got ${uniqueSlugs.length}`);
  }

  return {
    batchPlanLane: lane,
    qualityGateStatus: expected.gateStatus,
    nextRunner: expected.nextRunner,
    inputFile: fileRow.outputFile,
    batchPlanRowCount: expected.batchRows,
    executorPlanRowCount: expected.executorRows,
    batchPlanCompetitionCount: expected.competitions,
    batchPlanUniqueCompetitionCount: uniqueSlugs.length,
    slugPrefixCount: uniqueSorted(rows.flatMap((row) => row.slugPrefixes || [])).length,
    regionCount: uniqueSorted(rows.flatMap((row) => row.regions || [])).length,
    requiredEvidenceRoleCount: uniqueSorted(rows.flatMap((row) => row.requiredEvidenceRoles || [])).length,
    batchRegionKeys: uniqueSorted(rows.map((row) => row.batchRegionKey)),
    batchPlanStatuses: uniqueSorted(rows.map((row) => row.batchPlanStatus)),
    batchExecutionModes: uniqueSorted(rows.map((row) => row.batchExecutionMode)),
    sampleCompetitionSlugs: uniqueSlugs.slice(0, 40),
    sourceOnly: true,
    fetchAllowedNow: false,
    searchAllowedNow: false,
    broadSearchAllowedNow: false,
    controlledDiscoveryAllowedNow: false,
    canonicalPromotionAllowedNow: false,
    zeroResultMayImplyAbsence: false,
    canonicalWriteEligibleNow: false,
    productionWrite: false,
    truthAssertionsAllowedNow: false
  };
}

function main() {
  const args = parseArgs(process.argv);
  const bundle = readJson(args.input);
  const summary = bundle.summary || {};

  assertSummary(summary, "retainedRawMapCompetitionCount", RETAINED_RAW_MAP_COUNT);
  assertSummary(summary, "competitionCount", RETAINED_RAW_MAP_COUNT);
  assertSummary(summary, "activeExecutionWaveCompetitionCount", ACTIVE_COMPETITION_COUNT);
  assertSummary(summary, "scopeAccountingNoActionCompetitionCount", SCOPE_ACCOUNTING_NO_ACTION_COUNT);
  assertSummary(summary, "primaryExecutorBatchPlanLaneCount", 2);
  assertSummary(summary, "primaryExecutorBatchPlanOutputFileCount", 2);
  assertSummary(summary, "primaryExecutorBatchPlanRowCount", PRIMARY_BATCH_ROW_COUNT);
  assertSummary(summary, "primaryExecutorBatchPlanExecutorRowCount", PRIMARY_EXECUTOR_ROW_COUNT);
  assertSummary(summary, "primaryExecutorBatchPlanUniqueCompetitionCount", PRIMARY_COMPETITION_COUNT);
  assertSummary(summary, "sourceAuthorityTemplateExecutorBatchPlanCompetitionCount", 372);
  assertSummary(summary, "sourceAuthorityTemplateExecutorBatchPlanRowCount", 6);
  assertSummary(summary, "sourceAuthorityTemplateExecutorBatchPlanExecutorRowCount", 193);
  assertSummary(summary, "existingSignalTruthGapExecutorBatchPlanCompetitionCount", 101);
  assertSummary(summary, "existingSignalTruthGapExecutorBatchPlanRowCount", 7);
  assertSummary(summary, "existingSignalTruthGapExecutorBatchPlanExecutorRowCount", 80);
  assertSummary(summary, "remainingFollowupLaneCompetitionCount", REMAINING_FOLLOWUP_COUNT);
  assertSummary(summary, "currentEffectiveMapExactCountAsserted", false);
  assertSummary(summary, "currentEffectiveMapExactCount", null);
  assertSummary(summary, "sourceDiscoveryConfirmedActionableCompetitionCount", 0);
  assertSummary(summary, "actionableConfirmedNowCount", 0);
  assertSummary(summary, "contractConfirmedNowCount", 0);
  assertSummary(summary, "validatedRouteMapCount", 0);
  assertSummary(summary, "validatedFixtureContractCount", 0);
  assertSummary(summary, "validatedStandingsContractCount", 0);
  assertSummary(summary, "validatedSeasonStateContractCount", 0);
  assertSummary(summary, "fetchAllowedNowCount", 0);
  assertSummary(summary, "searchAllowedNowCount", 0);
  assertSummary(summary, "broadSearchAllowedNowCount", 0);
  assertSummary(summary, "controlledDiscoveryAllowedNowCount", 0);
  assertSummary(summary, "canonicalPromotionAllowedNowCount", 0);
  assertSummary(summary, "zeroResultMayImplyAbsenceCount", 0);
  assertSummary(summary, "canonicalWriteEligibleNowCount", 0);
  assertSummary(summary, "activeAssertedCount", 0);
  assertSummary(summary, "inactiveAssertedCount", 0);
  assertSummary(summary, "completedAssertedCount", 0);
  assertSummary(summary, "canonicalWrites", 0);
  assertSummary(summary, "productionWrite", false);

  const batchPlanOutputFiles = Array.isArray(bundle.batchPlanOutputFiles)
    ? bundle.batchPlanOutputFiles
    : [];

  if (batchPlanOutputFiles.length !== 2) {
    throw new Error(`Expected 2 batchPlanOutputFiles, got ${batchPlanOutputFiles.length}`);
  }

  const qualityGateRows = batchPlanOutputFiles
    .map(validateBatchFile)
    .sort((a, b) => a.batchPlanLane.localeCompare(b.batchPlanLane));

  const passedRows = qualityGateRows.filter((row) => row.qualityGateStatus.startsWith("passed_"));
  const blockedRows = qualityGateRows.filter((row) => !row.qualityGateStatus.startsWith("passed_"));

  if (passedRows.length !== 2) throw new Error(`Expected 2 passed batch plan lanes, got ${passedRows.length}`);
  if (blockedRows.length !== 0) throw new Error(`Expected 0 blocked batch plan lanes, got ${blockedRows.length}`);

  const sourceAuthorityRow = qualityGateRows.find((row) =>
    row.batchPlanLane === "source_authority_template_executor_batch_plan"
  );
  const existingSignalRow = qualityGateRows.find((row) =>
    row.batchPlanLane === "existing_signal_truth_gap_executor_batch_plan"
  );

  const totalBatchRows = qualityGateRows.reduce((sum, row) => sum + row.batchPlanRowCount, 0);
  const totalExecutorRows = qualityGateRows.reduce((sum, row) => sum + row.executorPlanRowCount, 0);
  const totalCompetitionRefs = qualityGateRows.reduce((sum, row) => sum + row.batchPlanCompetitionCount, 0);

  if (totalBatchRows !== PRIMARY_BATCH_ROW_COUNT) {
    throw new Error(`Expected ${PRIMARY_BATCH_ROW_COUNT} batch rows, got ${totalBatchRows}`);
  }
  if (totalExecutorRows !== PRIMARY_EXECUTOR_ROW_COUNT) {
    throw new Error(`Expected ${PRIMARY_EXECUTOR_ROW_COUNT} executor rows, got ${totalExecutorRows}`);
  }
  if (totalCompetitionRefs !== PRIMARY_COMPETITION_COUNT) {
    throw new Error(`Expected ${PRIMARY_COMPETITION_COUNT} competition refs, got ${totalCompetitionRefs}`);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "run-football-truth-primary-executor-batch-plan-quality-gate-file",
    mode: "source_only_quality_gate_for_primary_executor_batch_plan_outputs_473_competitions_no_fetch_no_search_no_writes_no_truth_assertions",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      primaryExecutorBatchPlanBundle: args.input
    },
    summary: {
      retainedRawMapCompetitionCount: RETAINED_RAW_MAP_COUNT,
      competitionCount: RETAINED_RAW_MAP_COUNT,
      activeExecutionWaveCompetitionCount: ACTIVE_COMPETITION_COUNT,
      scopeAccountingNoActionCompetitionCount: SCOPE_ACCOUNTING_NO_ACTION_COUNT,

      primaryExecutorBatchPlanQualityGateLaneCount: qualityGateRows.length,
      primaryExecutorBatchPlanQualityGatePassedLaneCount: passedRows.length,
      primaryExecutorBatchPlanQualityGateBlockedLaneCount: blockedRows.length,
      primaryExecutorBatchPlanQualityGateBatchRowCount: totalBatchRows,
      primaryExecutorBatchPlanQualityGateExecutorRowCount: totalExecutorRows,
      primaryExecutorBatchPlanQualityGateCompetitionReferenceCount: totalCompetitionRefs,

      sourceAuthorityTemplateExecutorBatchPlanQualityGateStatus: sourceAuthorityRow?.qualityGateStatus || null,
      sourceAuthorityTemplateExecutorBatchPlanCompetitionCount: sourceAuthorityRow?.batchPlanCompetitionCount || 0,
      sourceAuthorityTemplateExecutorBatchPlanRowCount: sourceAuthorityRow?.batchPlanRowCount || 0,
      sourceAuthorityTemplateExecutorBatchPlanExecutorRowCount: sourceAuthorityRow?.executorPlanRowCount || 0,
      existingSignalTruthGapExecutorBatchPlanQualityGateStatus: existingSignalRow?.qualityGateStatus || null,
      existingSignalTruthGapExecutorBatchPlanCompetitionCount: existingSignalRow?.batchPlanCompetitionCount || 0,
      existingSignalTruthGapExecutorBatchPlanRowCount: existingSignalRow?.batchPlanRowCount || 0,
      existingSignalTruthGapExecutorBatchPlanExecutorRowCount: existingSignalRow?.executorPlanRowCount || 0,
      remainingFollowupLaneCompetitionCount: REMAINING_FOLLOWUP_COUNT,

      currentEffectiveMapExactCountAsserted: false,
      currentEffectiveMapExactCount: null,
      sourceDiscoveryConfirmedActionableCompetitionCount: 0,
      actionableConfirmedNowCount: 0,
      contractConfirmedNowCount: 0,
      validatedRouteMapCount: 0,
      validatedFixtureContractCount: 0,
      validatedStandingsContractCount: 0,
      validatedSeasonStateContractCount: 0,

      fetchAllowedNowCount: 0,
      searchAllowedNowCount: 0,
      broadSearchAllowedNowCount: 0,
      controlledDiscoveryAllowedNowCount: 0,
      canonicalPromotionAllowedNowCount: 0,
      zeroResultMayImplyAbsenceCount: 0,
      canonicalWriteEligibleNowCount: 0,
      activeAssertedCount: 0,
      inactiveAssertedCount: 0,
      completedAssertedCount: 0,
      canonicalWrites: 0,
      productionWrite: false,

      firstRecommendedRunner: sourceAuthorityRow?.nextRunner || null,
      secondRecommendedRunner: existingSignalRow?.nextRunner || null,
      recommendedNextLane: "build_primary_batch_runner_manifest_bundle_without_fetch_for_source_authority_372_and_existing_signal_101"
    },
    counts: {
      byBatchPlanLane: countBy(qualityGateRows, "batchPlanLane"),
      byQualityGateStatus: countBy(qualityGateRows, "qualityGateStatus")
    },
    guardrails: [
      "This quality gate covers both primary executor batch plan outputs together.",
      "It validates 473 primary competition references from 13 batch rows and 273 executor plan rows.",
      "It does not execute fetch/search/write.",
      "Controlled discovery remains disabled.",
      "Canonical promotion remains disabled.",
      "It does not assert source discovery, actionable scope, contracts, route, fixture, standings, season-state, active, inactive, or completed truth.",
      "Zero result must not imply absence.",
      "No match today must not imply inactive.",
      "Match status must not be used as season-state truth.",
      "The 42 non-primary active competitions remain in follow-up lanes, not dropped."
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
    primaryExecutorBatchPlanQualityGateLaneCount: output.summary.primaryExecutorBatchPlanQualityGateLaneCount,
    primaryExecutorBatchPlanQualityGatePassedLaneCount: output.summary.primaryExecutorBatchPlanQualityGatePassedLaneCount,
    primaryExecutorBatchPlanQualityGateBlockedLaneCount: output.summary.primaryExecutorBatchPlanQualityGateBlockedLaneCount,
    primaryExecutorBatchPlanQualityGateBatchRowCount: output.summary.primaryExecutorBatchPlanQualityGateBatchRowCount,
    primaryExecutorBatchPlanQualityGateExecutorRowCount: output.summary.primaryExecutorBatchPlanQualityGateExecutorRowCount,
    primaryExecutorBatchPlanQualityGateCompetitionReferenceCount: output.summary.primaryExecutorBatchPlanQualityGateCompetitionReferenceCount,
    sourceAuthorityTemplateExecutorBatchPlanQualityGateStatus: output.summary.sourceAuthorityTemplateExecutorBatchPlanQualityGateStatus,
    sourceAuthorityTemplateExecutorBatchPlanCompetitionCount: output.summary.sourceAuthorityTemplateExecutorBatchPlanCompetitionCount,
    sourceAuthorityTemplateExecutorBatchPlanRowCount: output.summary.sourceAuthorityTemplateExecutorBatchPlanRowCount,
    sourceAuthorityTemplateExecutorBatchPlanExecutorRowCount: output.summary.sourceAuthorityTemplateExecutorBatchPlanExecutorRowCount,
    existingSignalTruthGapExecutorBatchPlanQualityGateStatus: output.summary.existingSignalTruthGapExecutorBatchPlanQualityGateStatus,
    existingSignalTruthGapExecutorBatchPlanCompetitionCount: output.summary.existingSignalTruthGapExecutorBatchPlanCompetitionCount,
    existingSignalTruthGapExecutorBatchPlanRowCount: output.summary.existingSignalTruthGapExecutorBatchPlanRowCount,
    existingSignalTruthGapExecutorBatchPlanExecutorRowCount: output.summary.existingSignalTruthGapExecutorBatchPlanExecutorRowCount,
    remainingFollowupLaneCompetitionCount: output.summary.remainingFollowupLaneCompetitionCount,
    currentEffectiveMapExactCountAsserted: output.summary.currentEffectiveMapExactCountAsserted,
    currentEffectiveMapExactCount: output.summary.currentEffectiveMapExactCount,
    sourceDiscoveryConfirmedActionableCompetitionCount: output.summary.sourceDiscoveryConfirmedActionableCompetitionCount,
    actionableConfirmedNowCount: output.summary.actionableConfirmedNowCount,
    contractConfirmedNowCount: output.summary.contractConfirmedNowCount,
    validatedRouteMapCount: output.summary.validatedRouteMapCount,
    validatedFixtureContractCount: output.summary.validatedFixtureContractCount,
    validatedStandingsContractCount: output.summary.validatedStandingsContractCount,
    validatedSeasonStateContractCount: output.summary.validatedSeasonStateContractCount,
    fetchAllowedNowCount: output.summary.fetchAllowedNowCount,
    searchAllowedNowCount: output.summary.searchAllowedNowCount,
    broadSearchAllowedNowCount: output.summary.broadSearchAllowedNowCount,
    controlledDiscoveryAllowedNowCount: output.summary.controlledDiscoveryAllowedNowCount,
    canonicalPromotionAllowedNowCount: output.summary.canonicalPromotionAllowedNowCount,
    zeroResultMayImplyAbsenceCount: output.summary.zeroResultMayImplyAbsenceCount,
    canonicalWriteEligibleNowCount: output.summary.canonicalWriteEligibleNowCount,
    activeAssertedCount: output.summary.activeAssertedCount,
    inactiveAssertedCount: output.summary.inactiveAssertedCount,
    completedAssertedCount: output.summary.completedAssertedCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    firstRecommendedRunner: output.summary.firstRecommendedRunner,
    secondRecommendedRunner: output.summary.secondRecommendedRunner,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
