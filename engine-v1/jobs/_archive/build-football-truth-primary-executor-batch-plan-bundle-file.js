#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/primary-matrix-executor-plans-quality-gate-2026-06-14/primary-matrix-executor-plans-quality-gate-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/primary-executor-batch-plan-bundle-2026-06-14/primary-executor-batch-plan-bundle-2026-06-14.json";

const RETAINED_RAW_MAP_COUNT = 689;
const ACTIVE_COMPETITION_COUNT = 515;
const SCOPE_ACCOUNTING_NO_ACTION_COUNT = 174;
const PRIMARY_COMPETITION_COUNT = 473;
const REMAINING_FOLLOWUP_COUNT = 42;

const EXPECTED_PLAN_LANES = {
  source_authority_template_executor_plan: {
    gateStatus: "passed_ready_for_source_authority_template_executor_batch_plan",
    rows: 193,
    competitions: 372,
    batchRows: 6,
    batchPlanLane: "source_authority_template_executor_batch_plan",
    batchPlanStatus: "batch_plan_ready_no_fetch_no_search",
    nextRunner: "run_source_only_source_authority_template_executor_batch_plan_quality_gate"
  },
  existing_signal_truth_gap_executor_plan: {
    gateStatus: "passed_ready_for_existing_signal_truth_gap_executor_batch_plan",
    rows: 80,
    competitions: 101,
    batchRows: 7,
    batchPlanLane: "existing_signal_truth_gap_executor_batch_plan",
    batchPlanStatus: "batch_plan_ready_no_truth_assertion",
    nextRunner: "run_source_only_existing_signal_truth_gap_executor_batch_plan_quality_gate"
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

function assertExecutorRow(row, lane) {
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

function loadExecutorPlanFromGate(gateRows, lane) {
  const expected = EXPECTED_PLAN_LANES[lane];
  const gateRow = gateRows.find((row) => row.executorPlanLane === lane);

  if (!gateRow) throw new Error(`Missing quality gate row for ${lane}`);
  if (gateRow.qualityGateStatus !== expected.gateStatus) {
    throw new Error(`${lane}: expected status ${expected.gateStatus}, got ${gateRow.qualityGateStatus}`);
  }
  if (gateRow.executorPlanRowCount !== expected.rows) {
    throw new Error(`${lane}: expected gate row count ${expected.rows}, got ${gateRow.executorPlanRowCount}`);
  }
  if (gateRow.executorPlanCompetitionCount !== expected.competitions) {
    throw new Error(`${lane}: expected gate competition count ${expected.competitions}, got ${gateRow.executorPlanCompetitionCount}`);
  }
  if (!fs.existsSync(gateRow.inputFile)) throw new Error(`${lane}: missing inputFile ${gateRow.inputFile}`);

  const file = readJson(gateRow.inputFile);
  const summary = file.summary || {};
  const rows = Array.isArray(file.rows) ? file.rows : [];

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

  for (const row of rows) assertExecutorRow(row, lane);

  const uniqueSlugs = uniqueSorted(rows.flatMap((row) => row.competitionSlugs || []));
  if (uniqueSlugs.length !== expected.competitions) {
    throw new Error(`${lane}: expected ${expected.competitions} unique slugs, got ${uniqueSlugs.length}`);
  }

  return { gateRow, file, summary, rows, uniqueSlugs };
}

function groupRows(rows, keyFn) {
  const groups = new Map();

  for (const row of rows) {
    const key = keyFn(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  return [...groups.entries()];
}

function buildBatchRows(lane, executorRows) {
  const expected = EXPECTED_PLAN_LANES[lane];

  return groupRows(executorRows, (row) => {
    const regions = uniqueSorted(row.regions || []);
    return regions.join("+") || "unknown_region";
  }).map(([regionKey, rows], index) => {
    const competitionSlugs = uniqueSorted(rows.flatMap((row) => row.competitionSlugs || []));
    const slugPrefixes = uniqueSorted(rows.flatMap((row) => row.slugPrefixes || []));
    const regions = uniqueSorted(rows.flatMap((row) => row.regions || []));
    const executorPlanActions = uniqueSorted(rows.map((row) => row.executorPlanAction));
    const nextAllowedSteps = uniqueSorted(rows.map((row) => row.nextAllowedStep));

    return {
      batchPlanLane: expected.batchPlanLane,
      sourceExecutorPlanLane: lane,
      batchPlanStatus: expected.batchPlanStatus,
      batchPlanIndex: index + 1,
      batchGroupKey: `${expected.batchPlanLane}::${regionKey}`,
      batchRegionKey: regionKey,
      executorFamily: expected.batchPlanLane,
      executorPlanRowCount: rows.length,
      competitionCount: competitionSlugs.length,
      competitionSlugs,
      slugPrefixes,
      regions,
      requiredEvidenceRoles: uniqueSorted(rows.flatMap((row) => row.requiredEvidenceRoles || [])),
      requiredExecutorSections: uniqueSorted(rows.flatMap((row) => row.requiredExecutorSections || [])),
      executorPlanActions,
      nextAllowedSteps,
      compilerGroupingKeys: uniqueSorted(rows.map((row) => row.compilerGroupingKey)),
      sourceExecutorPlanIndexes: rows.map((row) => row.executorPlanIndex).sort((a, b) => a - b),
      batchExecutionMode: "source_only_batch_plan_not_executed",
      sourceOnly: true,
      fetchAllowedNow: false,
      searchAllowedNow: false,
      broadSearchAllowedNow: false,
      controlledDiscoveryAllowedNow: false,
      canonicalPromotionAllowedNow: false,
      zeroResultMayImplyAbsence: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false,
      truthAssertionsAllowedNow: false,
      activeAssertedNow: false,
      inactiveAssertedNow: false,
      completedAssertedNow: false,
      batchGuardrails: [
        "no_fetch",
        "no_search",
        "no_broad_search",
        "controlled_discovery_disabled",
        "canonical_promotion_disabled",
        "zero_result_not_absence",
        "no_canonical_write",
        "no_production_write",
        "no_active_inactive_completed_assertion",
        "no_route_fixture_standings_season_state_truth_assertion"
      ]
    };
  }).sort((a, b) => {
    if (a.batchRegionKey !== b.batchRegionKey) return a.batchRegionKey.localeCompare(b.batchRegionKey);
    return a.batchGroupKey.localeCompare(b.batchGroupKey);
  }).map((row, index) => ({
    ...row,
    batchPlanIndex: index + 1
  }));
}

function writeBatchPlanFile({ outputDir, date, batchPlanLane, rows }) {
  const uniqueSlugs = uniqueSorted(rows.flatMap((row) => row.competitionSlugs || []));
  const filePath = path.join(
    outputDir,
    `primary-executor-batch-plan-output-${batchPlanLane}-${date}.json`
  ).replaceAll("\\", "/");

  const output = {
    generatedAt: new Date().toISOString(),
    date,
    job: "build-football-truth-primary-executor-batch-plan-bundle-file",
    mode: "source_only_primary_executor_batch_plan_output_no_fetch_no_search_no_writes_no_truth_assertions",
    batchPlanLane,
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    summary: {
      batchPlanLane,
      batchPlanRowCount: rows.length,
      executorPlanRowCount: rows.reduce((sum, row) => sum + row.executorPlanRowCount, 0),
      batchPlanCompetitionCount: uniqueSlugs.length,
      batchPlanUniqueCompetitionCount: uniqueSlugs.length,
      slugPrefixCount: uniqueSorted(rows.flatMap((row) => row.slugPrefixes || [])).length,
      regionCount: uniqueSorted(rows.flatMap((row) => row.regions || [])).length,
      requiredEvidenceRoleCount: uniqueSorted(rows.flatMap((row) => row.requiredEvidenceRoles || [])).length,
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
      productionWrite: false
    },
    counts: {
      byBatchRegionKey: countBy(rows, "batchRegionKey"),
      byBatchPlanStatus: countBy(rows, "batchPlanStatus"),
      byBatchExecutionMode: countBy(rows, "batchExecutionMode")
    },
    guardrails: [
      "This is a source-only primary executor batch plan output.",
      "No fetch/search/write/truth assertion is performed.",
      "Controlled discovery remains disabled.",
      "Canonical promotion remains disabled.",
      "Zero result must not imply absence.",
      "No match today must not imply inactive.",
      "Match status must not be used as season-state truth."
    ],
    rows
  };

  fs.writeFileSync(filePath, stableJson(output));

  return {
    batchPlanLane,
    outputFile: filePath,
    batchPlanRowCount: rows.length,
    executorPlanRowCount: output.summary.executorPlanRowCount,
    batchPlanCompetitionCount: output.summary.batchPlanCompetitionCount,
    batchPlanUniqueCompetitionCount: output.summary.batchPlanUniqueCompetitionCount,
    slugPrefixCount: output.summary.slugPrefixCount,
    regionCount: output.summary.regionCount,
    fetchAllowedNow: false,
    searchAllowedNow: false,
    broadSearchAllowedNow: false,
    controlledDiscoveryAllowedNow: false,
    canonicalPromotionAllowedNow: false,
    zeroResultMayImplyAbsence: false,
    canonicalWriteEligibleNow: false,
    productionWrite: false
  };
}

function main() {
  const args = parseArgs(process.argv);
  const gate = readJson(args.input);
  const summary = gate.summary || {};

  assertSummary(summary, "retainedRawMapCompetitionCount", RETAINED_RAW_MAP_COUNT);
  assertSummary(summary, "competitionCount", RETAINED_RAW_MAP_COUNT);
  assertSummary(summary, "activeExecutionWaveCompetitionCount", ACTIVE_COMPETITION_COUNT);
  assertSummary(summary, "scopeAccountingNoActionCompetitionCount", SCOPE_ACCOUNTING_NO_ACTION_COUNT);
  assertSummary(summary, "primaryExecutorPlanQualityGateLaneCount", 2);
  assertSummary(summary, "primaryExecutorPlanQualityGatePassedLaneCount", 2);
  assertSummary(summary, "primaryExecutorPlanQualityGateBlockedLaneCount", 0);
  assertSummary(summary, "primaryExecutorPlanQualityGateRowCount", 273);
  assertSummary(summary, "primaryExecutorPlanQualityGateCompetitionReferenceCount", PRIMARY_COMPETITION_COUNT);
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

  const qualityGateRows = Array.isArray(gate.qualityGateRows) ? gate.qualityGateRows : [];
  if (qualityGateRows.length !== 2) throw new Error(`Expected 2 qualityGateRows, got ${qualityGateRows.length}`);

  const sourceAuthority = loadExecutorPlanFromGate(qualityGateRows, "source_authority_template_executor_plan");
  const existingSignal = loadExecutorPlanFromGate(qualityGateRows, "existing_signal_truth_gap_executor_plan");

  const sourceAuthorityBatchRows = buildBatchRows("source_authority_template_executor_plan", sourceAuthority.rows);
  const existingSignalBatchRows = buildBatchRows("existing_signal_truth_gap_executor_plan", existingSignal.rows);

  if (sourceAuthorityBatchRows.length !== 6) {
    throw new Error(`Expected 6 source-authority batch rows, got ${sourceAuthorityBatchRows.length}`);
  }

  if (existingSignalBatchRows.length !== 7) {
    throw new Error(`Expected 7 existing-signal batch rows, got ${existingSignalBatchRows.length}`);
  }

  const allBatchSlugs = uniqueSorted([
    ...sourceAuthorityBatchRows.flatMap((row) => row.competitionSlugs || []),
    ...existingSignalBatchRows.flatMap((row) => row.competitionSlugs || [])
  ]);

  if (allBatchSlugs.length !== PRIMARY_COMPETITION_COUNT) {
    throw new Error(`Expected ${PRIMARY_COMPETITION_COUNT} unique batch plan slugs, got ${allBatchSlugs.length}`);
  }

  const outputDir = path.dirname(args.output);
  fs.mkdirSync(outputDir, { recursive: true });

  const sourceAuthorityBatchOutput = writeBatchPlanFile({
    outputDir,
    date: args.date,
    batchPlanLane: "source_authority_template_executor_batch_plan",
    rows: sourceAuthorityBatchRows
  });

  const existingSignalBatchOutput = writeBatchPlanFile({
    outputDir,
    date: args.date,
    batchPlanLane: "existing_signal_truth_gap_executor_batch_plan",
    rows: existingSignalBatchRows
  });

  const batchPlanOutputFiles = [sourceAuthorityBatchOutput, existingSignalBatchOutput];

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-primary-executor-batch-plan-bundle-file",
    mode: "source_only_primary_executor_batch_plan_bundle_for_source_authority_372_and_existing_signal_101_no_fetch_no_search_no_writes_no_truth_assertions",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      primaryMatrixExecutorPlansQualityGate: args.input,
      sourceAuthorityTemplateExecutorPlan: sourceAuthority.gateRow.inputFile,
      existingSignalTruthGapExecutorPlan: existingSignal.gateRow.inputFile
    },
    summary: {
      retainedRawMapCompetitionCount: RETAINED_RAW_MAP_COUNT,
      competitionCount: RETAINED_RAW_MAP_COUNT,
      activeExecutionWaveCompetitionCount: ACTIVE_COMPETITION_COUNT,
      scopeAccountingNoActionCompetitionCount: SCOPE_ACCOUNTING_NO_ACTION_COUNT,

      primaryExecutorBatchPlanLaneCount: batchPlanOutputFiles.length,
      primaryExecutorBatchPlanOutputFileCount: batchPlanOutputFiles.length,
      primaryExecutorBatchPlanRowCount: sourceAuthorityBatchRows.length + existingSignalBatchRows.length,
      primaryExecutorBatchPlanExecutorRowCount:
        sourceAuthorityBatchOutput.executorPlanRowCount + existingSignalBatchOutput.executorPlanRowCount,
      primaryExecutorBatchPlanUniqueCompetitionCount: allBatchSlugs.length,

      sourceAuthorityTemplateExecutorBatchPlanCompetitionCount: sourceAuthorityBatchOutput.batchPlanCompetitionCount,
      sourceAuthorityTemplateExecutorBatchPlanRowCount: sourceAuthorityBatchOutput.batchPlanRowCount,
      sourceAuthorityTemplateExecutorBatchPlanExecutorRowCount: sourceAuthorityBatchOutput.executorPlanRowCount,
      existingSignalTruthGapExecutorBatchPlanCompetitionCount: existingSignalBatchOutput.batchPlanCompetitionCount,
      existingSignalTruthGapExecutorBatchPlanRowCount: existingSignalBatchOutput.batchPlanRowCount,
      existingSignalTruthGapExecutorBatchPlanExecutorRowCount: existingSignalBatchOutput.executorPlanRowCount,
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

      recommendedNextLane: "run_source_only_primary_executor_batch_plan_quality_gate_then_prepare_controlled_source_authority_batch_runner_manifest_without_fetch"
    },
    counts: {
      byBatchPlanLane: countBy([
        ...sourceAuthorityBatchRows,
        ...existingSignalBatchRows
      ], "batchPlanLane"),
      byBatchRegionKey: countBy([
        ...sourceAuthorityBatchRows,
        ...existingSignalBatchRows
      ], "batchRegionKey"),
      byBatchPlanStatus: countBy([
        ...sourceAuthorityBatchRows,
        ...existingSignalBatchRows
      ], "batchPlanStatus")
    },
    guardrails: [
      "This bundle builds both primary executor batch plans together.",
      "It covers 473 unique competitions: 372 source-authority and 101 existing-signal.",
      "It groups 273 executor plan rows into 13 batch plan rows.",
      "It does not execute fetch/search/write.",
      "Controlled discovery remains disabled.",
      "Canonical promotion remains disabled.",
      "It does not assert source discovery, actionable scope, contracts, route, fixture, standings, season-state, active, inactive, or completed truth.",
      "Zero result must not imply absence.",
      "No match today must not imply inactive.",
      "Match status must not be used as season-state truth.",
      "The 42 non-primary active competitions remain in follow-up lanes, not dropped."
    ],
    batchPlanOutputFiles,
    sourceAuthorityBatchRows,
    existingSignalBatchRows
  };

  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    retainedRawMapCompetitionCount: output.summary.retainedRawMapCompetitionCount,
    competitionCount: output.summary.competitionCount,
    activeExecutionWaveCompetitionCount: output.summary.activeExecutionWaveCompetitionCount,
    scopeAccountingNoActionCompetitionCount: output.summary.scopeAccountingNoActionCompetitionCount,
    primaryExecutorBatchPlanLaneCount: output.summary.primaryExecutorBatchPlanLaneCount,
    primaryExecutorBatchPlanOutputFileCount: output.summary.primaryExecutorBatchPlanOutputFileCount,
    primaryExecutorBatchPlanRowCount: output.summary.primaryExecutorBatchPlanRowCount,
    primaryExecutorBatchPlanExecutorRowCount: output.summary.primaryExecutorBatchPlanExecutorRowCount,
    primaryExecutorBatchPlanUniqueCompetitionCount: output.summary.primaryExecutorBatchPlanUniqueCompetitionCount,
    sourceAuthorityTemplateExecutorBatchPlanCompetitionCount: output.summary.sourceAuthorityTemplateExecutorBatchPlanCompetitionCount,
    sourceAuthorityTemplateExecutorBatchPlanRowCount: output.summary.sourceAuthorityTemplateExecutorBatchPlanRowCount,
    sourceAuthorityTemplateExecutorBatchPlanExecutorRowCount: output.summary.sourceAuthorityTemplateExecutorBatchPlanExecutorRowCount,
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
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
