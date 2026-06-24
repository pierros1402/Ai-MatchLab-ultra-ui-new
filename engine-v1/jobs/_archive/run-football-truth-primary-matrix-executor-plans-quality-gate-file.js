#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/primary-matrix-executor-plans-bundle-2026-06-14/primary-matrix-executor-plans-bundle-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/primary-matrix-executor-plans-quality-gate-2026-06-14/primary-matrix-executor-plans-quality-gate-2026-06-14.json";

const RETAINED_RAW_MAP_COUNT = 689;
const ACTIVE_COMPETITION_COUNT = 515;
const SCOPE_ACCOUNTING_NO_ACTION_COUNT = 174;
const PRIMARY_COMPETITION_COUNT = 473;
const REMAINING_FOLLOWUP_COUNT = 42;

const EXPECTED_PLANS = {
  source_authority_template_executor_plan: {
    rows: 193,
    competitions: 372,
    rowStatus: "executor_plan_ready_no_fetch_no_search",
    gateStatus: "passed_ready_for_source_authority_template_executor_batch_plan",
    nextRunner: "build_source_authority_template_executor_batch_plan_for_372_competitions"
  },
  existing_signal_truth_gap_executor_plan: {
    rows: 80,
    competitions: 101,
    rowStatus: "executor_plan_ready_no_truth_assertion",
    gateStatus: "passed_ready_for_existing_signal_truth_gap_executor_batch_plan",
    nextRunner: "build_existing_signal_truth_gap_executor_batch_plan_for_101_competitions"
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

function assertExecutorPlanRow(row, lane) {
  const key = row.compilerGroupingKey || row.sourceAuthorityTemplateKey || row.existingSignalReviewKey || "__missing_key__";

  if (row.executorPlanLane !== lane) throw new Error(`${lane}/${key}: executorPlanLane mismatch`);
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
    "executorPlanGuardrails"
  ];

  for (const field of arrayFields) {
    if (!Array.isArray(row[field]) || row[field].length < 1) {
      throw new Error(`${lane}/${key}: ${field} must be non-empty`);
    }
  }

  if (!row.executorPlanStatus) throw new Error(`${lane}/${key}: executorPlanStatus is required`);
  if (!row.executorPlanAction) throw new Error(`${lane}/${key}: executorPlanAction is required`);
  if (!row.nextAllowedStep) throw new Error(`${lane}/${key}: nextAllowedStep is required`);
}

function validatePlanFile(fileRow) {
  const lane = fileRow.executorPlanLane;
  const expected = EXPECTED_PLANS[lane];

  if (!expected) throw new Error(`Unexpected executor plan lane: ${lane}`);
  if (!fs.existsSync(fileRow.outputFile)) throw new Error(`Missing executor plan output file: ${fileRow.outputFile}`);

  const json = readJson(fileRow.outputFile);
  const summary = json.summary || {};
  const rows = Array.isArray(json.rows) ? json.rows : [];

  if (summary.executorPlanLane !== lane) throw new Error(`${lane}: summary.executorPlanLane mismatch`);
  if (summary.executorPlanRowCount !== expected.rows) {
    throw new Error(`${lane}: expected ${expected.rows} rows, got ${summary.executorPlanRowCount}`);
  }
  if (summary.executorPlanCompetitionCount !== expected.competitions) {
    throw new Error(`${lane}: expected ${expected.competitions} competitions, got ${summary.executorPlanCompetitionCount}`);
  }
  if (summary.executorPlanUniqueCompetitionCount !== expected.competitions) {
    throw new Error(`${lane}: expected ${expected.competitions} unique competitions, got ${summary.executorPlanUniqueCompetitionCount}`);
  }

  assertZeroCounts(summary, lane);

  if (rows.length !== expected.rows) {
    throw new Error(`${lane}: expected ${expected.rows} rows array length, got ${rows.length}`);
  }

  for (const row of rows) {
    assertExecutorPlanRow(row, lane);
    if (row.executorPlanStatus !== expected.rowStatus) {
      throw new Error(`${lane}/${row.compilerGroupingKey}: expected executorPlanStatus ${expected.rowStatus}, got ${row.executorPlanStatus}`);
    }
  }

  const uniqueSlugs = uniqueSorted(rows.flatMap((row) => row.competitionSlugs || []));
  if (uniqueSlugs.length !== expected.competitions) {
    throw new Error(`${lane}: expected ${expected.competitions} unique slugs, got ${uniqueSlugs.length}`);
  }

  return {
    executorPlanLane: lane,
    qualityGateStatus: expected.gateStatus,
    nextRunner: expected.nextRunner,
    inputFile: fileRow.outputFile,
    executorPlanRowCount: expected.rows,
    executorPlanCompetitionCount: expected.competitions,
    executorPlanUniqueCompetitionCount: uniqueSlugs.length,
    slugPrefixCount: uniqueSorted(rows.flatMap((row) => row.slugPrefixes || [])).length,
    regionCount: uniqueSorted(rows.flatMap((row) => row.regions || [])).length,
    requiredEvidenceRoleCount: uniqueSorted(rows.flatMap((row) => row.requiredEvidenceRoles || [])).length,
    executorPlanActions: uniqueSorted(rows.map((row) => row.executorPlanAction)),
    nextAllowedSteps: uniqueSorted(rows.map((row) => row.nextAllowedStep)),
    regions: uniqueSorted(rows.flatMap((row) => row.regions || [])),
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
  assertSummary(summary, "primaryExecutorPlanLaneCount", 2);
  assertSummary(summary, "primaryExecutorPlanOutputFileCount", 2);
  assertSummary(summary, "primaryExecutorPlanRowCount", 273);
  assertSummary(summary, "primaryExecutorPlanUniqueCompetitionCount", PRIMARY_COMPETITION_COUNT);
  assertSummary(summary, "sourceAuthorityTemplateExecutorPlanCompetitionCount", 372);
  assertSummary(summary, "sourceAuthorityTemplateExecutorPlanRowCount", 193);
  assertSummary(summary, "existingSignalTruthGapExecutorPlanCompetitionCount", 101);
  assertSummary(summary, "existingSignalTruthGapExecutorPlanRowCount", 80);
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

  const executorPlanOutputFiles = Array.isArray(bundle.executorPlanOutputFiles)
    ? bundle.executorPlanOutputFiles
    : [];

  if (executorPlanOutputFiles.length !== 2) {
    throw new Error(`Expected 2 executorPlanOutputFiles, got ${executorPlanOutputFiles.length}`);
  }

  const qualityGateRows = executorPlanOutputFiles
    .map(validatePlanFile)
    .sort((a, b) => a.executorPlanLane.localeCompare(b.executorPlanLane));

  const passedRows = qualityGateRows.filter((row) => row.qualityGateStatus.startsWith("passed_"));
  const blockedRows = qualityGateRows.filter((row) => !row.qualityGateStatus.startsWith("passed_"));

  if (passedRows.length !== 2) throw new Error(`Expected 2 passed executor plan lanes, got ${passedRows.length}`);
  if (blockedRows.length !== 0) throw new Error(`Expected 0 blocked executor plan lanes, got ${blockedRows.length}`);

  const sourceAuthorityRow = qualityGateRows.find((row) => row.executorPlanLane === "source_authority_template_executor_plan");
  const existingSignalRow = qualityGateRows.find((row) => row.executorPlanLane === "existing_signal_truth_gap_executor_plan");

  const totalPlanRows = qualityGateRows.reduce((sum, row) => sum + row.executorPlanRowCount, 0);
  const totalCompetitionRefs = qualityGateRows.reduce((sum, row) => sum + row.executorPlanCompetitionCount, 0);

  if (totalPlanRows !== 273) throw new Error(`Expected 273 executor plan rows, got ${totalPlanRows}`);
  if (totalCompetitionRefs !== 473) throw new Error(`Expected 473 competition refs, got ${totalCompetitionRefs}`);

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "run-football-truth-primary-matrix-executor-plans-quality-gate-file",
    mode: "source_only_quality_gate_for_primary_matrix_executor_plans_473_competitions_no_fetch_no_search_no_writes_no_truth_assertions",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      primaryMatrixExecutorPlansBundle: args.input
    },
    summary: {
      retainedRawMapCompetitionCount: RETAINED_RAW_MAP_COUNT,
      competitionCount: RETAINED_RAW_MAP_COUNT,
      activeExecutionWaveCompetitionCount: ACTIVE_COMPETITION_COUNT,
      scopeAccountingNoActionCompetitionCount: SCOPE_ACCOUNTING_NO_ACTION_COUNT,

      primaryExecutorPlanQualityGateLaneCount: qualityGateRows.length,
      primaryExecutorPlanQualityGatePassedLaneCount: passedRows.length,
      primaryExecutorPlanQualityGateBlockedLaneCount: blockedRows.length,
      primaryExecutorPlanQualityGateRowCount: totalPlanRows,
      primaryExecutorPlanQualityGateCompetitionReferenceCount: totalCompetitionRefs,

      sourceAuthorityTemplateExecutorPlanQualityGateStatus: sourceAuthorityRow?.qualityGateStatus || null,
      sourceAuthorityTemplateExecutorPlanCompetitionCount: sourceAuthorityRow?.executorPlanCompetitionCount || 0,
      sourceAuthorityTemplateExecutorPlanRowCount: sourceAuthorityRow?.executorPlanRowCount || 0,
      existingSignalTruthGapExecutorPlanQualityGateStatus: existingSignalRow?.qualityGateStatus || null,
      existingSignalTruthGapExecutorPlanCompetitionCount: existingSignalRow?.executorPlanCompetitionCount || 0,
      existingSignalTruthGapExecutorPlanRowCount: existingSignalRow?.executorPlanRowCount || 0,
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
      recommendedNextLane: "build_primary_executor_batch_plan_bundle_for_source_authority_372_and_existing_signal_101"
    },
    counts: {
      byExecutorPlanLane: countBy(qualityGateRows, "executorPlanLane"),
      byQualityGateStatus: countBy(qualityGateRows, "qualityGateStatus")
    },
    guardrails: [
      "This quality gate covers both primary executor plan outputs together.",
      "It validates 473 primary competition references from 273 executor plan rows.",
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
    primaryExecutorPlanQualityGateLaneCount: output.summary.primaryExecutorPlanQualityGateLaneCount,
    primaryExecutorPlanQualityGatePassedLaneCount: output.summary.primaryExecutorPlanQualityGatePassedLaneCount,
    primaryExecutorPlanQualityGateBlockedLaneCount: output.summary.primaryExecutorPlanQualityGateBlockedLaneCount,
    primaryExecutorPlanQualityGateRowCount: output.summary.primaryExecutorPlanQualityGateRowCount,
    primaryExecutorPlanQualityGateCompetitionReferenceCount: output.summary.primaryExecutorPlanQualityGateCompetitionReferenceCount,
    sourceAuthorityTemplateExecutorPlanQualityGateStatus: output.summary.sourceAuthorityTemplateExecutorPlanQualityGateStatus,
    sourceAuthorityTemplateExecutorPlanCompetitionCount: output.summary.sourceAuthorityTemplateExecutorPlanCompetitionCount,
    sourceAuthorityTemplateExecutorPlanRowCount: output.summary.sourceAuthorityTemplateExecutorPlanRowCount,
    existingSignalTruthGapExecutorPlanQualityGateStatus: output.summary.existingSignalTruthGapExecutorPlanQualityGateStatus,
    existingSignalTruthGapExecutorPlanCompetitionCount: output.summary.existingSignalTruthGapExecutorPlanCompetitionCount,
    existingSignalTruthGapExecutorPlanRowCount: output.summary.existingSignalTruthGapExecutorPlanRowCount,
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
