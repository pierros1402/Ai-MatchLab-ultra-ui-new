#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/primary-executor-batch-plan-quality-gate-2026-06-14/primary-executor-batch-plan-quality-gate-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/primary-batch-runner-manifest-bundle-2026-06-14/primary-batch-runner-manifest-bundle-2026-06-14.json";

const RETAINED_RAW_MAP_COUNT = 689;
const ACTIVE_COMPETITION_COUNT = 515;
const SCOPE_ACCOUNTING_NO_ACTION_COUNT = 174;
const PRIMARY_COMPETITION_COUNT = 473;
const PRIMARY_EXECUTOR_ROW_COUNT = 273;
const PRIMARY_BATCH_ROW_COUNT = 13;
const REMAINING_FOLLOWUP_COUNT = 42;

const EXPECTED_BATCH_LANES = {
  source_authority_template_executor_batch_plan: {
    gateStatus: "passed_ready_for_source_authority_batch_runner_manifest_without_fetch",
    batchRows: 6,
    executorRows: 193,
    competitions: 372,
    manifestLane: "source_authority_batch_runner_manifest",
    manifestStatus: "runner_manifest_ready_without_fetch",
    runnerIntent: "prepare_source_authority_batch_inputs_without_fetch_or_search",
    nextRunner: "run_source_only_source_authority_batch_runner_manifest_quality_gate"
  },
  existing_signal_truth_gap_executor_batch_plan: {
    gateStatus: "passed_ready_for_existing_signal_batch_runner_manifest_without_truth_assertion",
    batchRows: 7,
    executorRows: 80,
    competitions: 101,
    manifestLane: "existing_signal_batch_runner_manifest",
    manifestStatus: "runner_manifest_ready_without_truth_assertion",
    runnerIntent: "prepare_existing_signal_batch_inputs_without_truth_assertion",
    nextRunner: "run_source_only_existing_signal_batch_runner_manifest_quality_gate"
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

function loadBatchPlanFromGate(gateRows, lane) {
  const expected = EXPECTED_BATCH_LANES[lane];
  const gateRow = gateRows.find((row) => row.batchPlanLane === lane);

  if (!gateRow) throw new Error(`Missing quality gate row for ${lane}`);
  if (gateRow.qualityGateStatus !== expected.gateStatus) {
    throw new Error(`${lane}: expected status ${expected.gateStatus}, got ${gateRow.qualityGateStatus}`);
  }
  if (gateRow.batchPlanRowCount !== expected.batchRows) {
    throw new Error(`${lane}: expected gate batch row count ${expected.batchRows}, got ${gateRow.batchPlanRowCount}`);
  }
  if (gateRow.executorPlanRowCount !== expected.executorRows) {
    throw new Error(`${lane}: expected gate executor row count ${expected.executorRows}, got ${gateRow.executorPlanRowCount}`);
  }
  if (gateRow.batchPlanCompetitionCount !== expected.competitions) {
    throw new Error(`${lane}: expected gate competition count ${expected.competitions}, got ${gateRow.batchPlanCompetitionCount}`);
  }
  if (!fs.existsSync(gateRow.inputFile)) throw new Error(`${lane}: missing inputFile ${gateRow.inputFile}`);

  const file = readJson(gateRow.inputFile);
  const summary = file.summary || {};
  const rows = Array.isArray(file.rows) ? file.rows : [];

  if (summary.batchPlanLane !== lane) throw new Error(`${lane}: summary.batchPlanLane mismatch`);
  if (summary.batchPlanRowCount !== expected.batchRows) {
    throw new Error(`${lane}: expected ${expected.batchRows} rows, got ${summary.batchPlanRowCount}`);
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
    executorRowSum += row.executorPlanRowCount;
  }

  if (executorRowSum !== expected.executorRows) {
    throw new Error(`${lane}: expected executor row sum ${expected.executorRows}, got ${executorRowSum}`);
  }

  const uniqueSlugs = uniqueSorted(rows.flatMap((row) => row.competitionSlugs || []));
  if (uniqueSlugs.length !== expected.competitions) {
    throw new Error(`${lane}: expected ${expected.competitions} unique slugs, got ${uniqueSlugs.length}`);
  }

  return { gateRow, file, summary, rows, uniqueSlugs };
}

function buildManifestRows(batchPlanLane, batchRows) {
  const expected = EXPECTED_BATCH_LANES[batchPlanLane];

  return batchRows.map((row, index) => ({
    runnerManifestLane: expected.manifestLane,
    runnerManifestStatus: expected.manifestStatus,
    runnerManifestIndex: index + 1,
    runnerIntent: expected.runnerIntent,
    sourceBatchPlanLane: batchPlanLane,
    sourceBatchGroupKey: row.batchGroupKey,
    batchRegionKey: row.batchRegionKey,
    executorPlanRowCount: row.executorPlanRowCount,
    competitionCount: row.competitionCount,
    competitionSlugs: uniqueSorted(row.competitionSlugs || []),
    slugPrefixes: uniqueSorted(row.slugPrefixes || []),
    regions: uniqueSorted(row.regions || []),
    requiredEvidenceRoles: uniqueSorted(row.requiredEvidenceRoles || []),
    requiredExecutorSections: uniqueSorted(row.requiredExecutorSections || []),
    executorPlanActions: uniqueSorted(row.executorPlanActions || []),
    nextAllowedSteps: uniqueSorted(row.nextAllowedSteps || []),
    compilerGroupingKeys: uniqueSorted(row.compilerGroupingKeys || []),
    sourceExecutorPlanIndexes: [...(row.sourceExecutorPlanIndexes || [])].sort((a, b) => a - b),
    batchGuardrails: uniqueSorted(row.batchGuardrails || []),
    runnerManifestMode: "source_only_runner_manifest_not_executed",
    runnerManifestExecutionAllowedNow: false,
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
    runnerGuardrails: [
      "manifest_only",
      "not_executed",
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
  })).sort((a, b) => {
    if (a.batchRegionKey !== b.batchRegionKey) return a.batchRegionKey.localeCompare(b.batchRegionKey);
    return a.sourceBatchGroupKey.localeCompare(b.sourceBatchGroupKey);
  }).map((row, index) => ({
    ...row,
    runnerManifestIndex: index + 1
  }));
}

function writeManifestFile({ outputDir, date, manifestLane, rows }) {
  const uniqueSlugs = uniqueSorted(rows.flatMap((row) => row.competitionSlugs || []));
  const filePath = path.join(
    outputDir,
    `primary-batch-runner-manifest-output-${manifestLane}-${date}.json`
  ).replaceAll("\\", "/");

  const output = {
    generatedAt: new Date().toISOString(),
    date,
    job: "build-football-truth-primary-batch-runner-manifest-bundle-file",
    mode: "source_only_primary_batch_runner_manifest_output_no_fetch_no_search_no_writes_no_truth_assertions",
    runnerManifestLane: manifestLane,
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    summary: {
      runnerManifestLane: manifestLane,
      runnerManifestRowCount: rows.length,
      sourceBatchPlanRowCount: rows.length,
      executorPlanRowCount: rows.reduce((sum, row) => sum + row.executorPlanRowCount, 0),
      runnerManifestCompetitionCount: uniqueSlugs.length,
      runnerManifestUniqueCompetitionCount: uniqueSlugs.length,
      slugPrefixCount: uniqueSorted(rows.flatMap((row) => row.slugPrefixes || [])).length,
      regionCount: uniqueSorted(rows.flatMap((row) => row.regions || [])).length,
      requiredEvidenceRoleCount: uniqueSorted(rows.flatMap((row) => row.requiredEvidenceRoles || [])).length,
      runnerManifestExecutionAllowedNowCount: 0,
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
      byRunnerManifestStatus: countBy(rows, "runnerManifestStatus"),
      byRunnerManifestMode: countBy(rows, "runnerManifestMode"),
      byRunnerIntent: countBy(rows, "runnerIntent")
    },
    guardrails: [
      "This is a source-only runner manifest output.",
      "It is not an execution run.",
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
    runnerManifestLane: manifestLane,
    outputFile: filePath,
    runnerManifestRowCount: output.summary.runnerManifestRowCount,
    sourceBatchPlanRowCount: output.summary.sourceBatchPlanRowCount,
    executorPlanRowCount: output.summary.executorPlanRowCount,
    runnerManifestCompetitionCount: output.summary.runnerManifestCompetitionCount,
    runnerManifestUniqueCompetitionCount: output.summary.runnerManifestUniqueCompetitionCount,
    slugPrefixCount: output.summary.slugPrefixCount,
    regionCount: output.summary.regionCount,
    runnerManifestExecutionAllowedNow: false,
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
  assertSummary(summary, "primaryExecutorBatchPlanQualityGateLaneCount", 2);
  assertSummary(summary, "primaryExecutorBatchPlanQualityGatePassedLaneCount", 2);
  assertSummary(summary, "primaryExecutorBatchPlanQualityGateBlockedLaneCount", 0);
  assertSummary(summary, "primaryExecutorBatchPlanQualityGateBatchRowCount", PRIMARY_BATCH_ROW_COUNT);
  assertSummary(summary, "primaryExecutorBatchPlanQualityGateExecutorRowCount", PRIMARY_EXECUTOR_ROW_COUNT);
  assertSummary(summary, "primaryExecutorBatchPlanQualityGateCompetitionReferenceCount", PRIMARY_COMPETITION_COUNT);
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

  const qualityGateRows = Array.isArray(gate.qualityGateRows) ? gate.qualityGateRows : [];
  if (qualityGateRows.length !== 2) throw new Error(`Expected 2 qualityGateRows, got ${qualityGateRows.length}`);

  const sourceAuthority = loadBatchPlanFromGate(
    qualityGateRows,
    "source_authority_template_executor_batch_plan"
  );
  const existingSignal = loadBatchPlanFromGate(
    qualityGateRows,
    "existing_signal_truth_gap_executor_batch_plan"
  );

  const sourceAuthorityManifestRows = buildManifestRows(
    "source_authority_template_executor_batch_plan",
    sourceAuthority.rows
  );
  const existingSignalManifestRows = buildManifestRows(
    "existing_signal_truth_gap_executor_batch_plan",
    existingSignal.rows
  );

  if (sourceAuthorityManifestRows.length !== 6) {
    throw new Error(`Expected 6 source-authority manifest rows, got ${sourceAuthorityManifestRows.length}`);
  }

  if (existingSignalManifestRows.length !== 7) {
    throw new Error(`Expected 7 existing-signal manifest rows, got ${existingSignalManifestRows.length}`);
  }

  const allManifestSlugs = uniqueSorted([
    ...sourceAuthorityManifestRows.flatMap((row) => row.competitionSlugs || []),
    ...existingSignalManifestRows.flatMap((row) => row.competitionSlugs || [])
  ]);

  if (allManifestSlugs.length !== PRIMARY_COMPETITION_COUNT) {
    throw new Error(`Expected ${PRIMARY_COMPETITION_COUNT} unique manifest slugs, got ${allManifestSlugs.length}`);
  }

  const outputDir = path.dirname(args.output);
  fs.mkdirSync(outputDir, { recursive: true });

  const sourceAuthorityManifestOutput = writeManifestFile({
    outputDir,
    date: args.date,
    manifestLane: "source_authority_batch_runner_manifest",
    rows: sourceAuthorityManifestRows
  });

  const existingSignalManifestOutput = writeManifestFile({
    outputDir,
    date: args.date,
    manifestLane: "existing_signal_batch_runner_manifest",
    rows: existingSignalManifestRows
  });

  const runnerManifestOutputFiles = [sourceAuthorityManifestOutput, existingSignalManifestOutput];

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-primary-batch-runner-manifest-bundle-file",
    mode: "source_only_primary_batch_runner_manifest_bundle_for_source_authority_372_and_existing_signal_101_no_fetch_no_search_no_writes_no_truth_assertions",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      primaryExecutorBatchPlanQualityGate: args.input,
      sourceAuthorityExecutorBatchPlan: sourceAuthority.gateRow.inputFile,
      existingSignalExecutorBatchPlan: existingSignal.gateRow.inputFile
    },
    summary: {
      retainedRawMapCompetitionCount: RETAINED_RAW_MAP_COUNT,
      competitionCount: RETAINED_RAW_MAP_COUNT,
      activeExecutionWaveCompetitionCount: ACTIVE_COMPETITION_COUNT,
      scopeAccountingNoActionCompetitionCount: SCOPE_ACCOUNTING_NO_ACTION_COUNT,

      primaryRunnerManifestLaneCount: runnerManifestOutputFiles.length,
      primaryRunnerManifestOutputFileCount: runnerManifestOutputFiles.length,
      primaryRunnerManifestRowCount: sourceAuthorityManifestRows.length + existingSignalManifestRows.length,
      primaryRunnerManifestExecutorRowCount:
        sourceAuthorityManifestOutput.executorPlanRowCount + existingSignalManifestOutput.executorPlanRowCount,
      primaryRunnerManifestUniqueCompetitionCount: allManifestSlugs.length,

      sourceAuthorityRunnerManifestCompetitionCount: sourceAuthorityManifestOutput.runnerManifestCompetitionCount,
      sourceAuthorityRunnerManifestRowCount: sourceAuthorityManifestOutput.runnerManifestRowCount,
      sourceAuthorityRunnerManifestExecutorRowCount: sourceAuthorityManifestOutput.executorPlanRowCount,
      existingSignalRunnerManifestCompetitionCount: existingSignalManifestOutput.runnerManifestCompetitionCount,
      existingSignalRunnerManifestRowCount: existingSignalManifestOutput.runnerManifestRowCount,
      existingSignalRunnerManifestExecutorRowCount: existingSignalManifestOutput.executorPlanRowCount,
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

      runnerManifestExecutionAllowedNowCount: 0,
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

      recommendedNextLane: "run_source_only_primary_batch_runner_manifest_quality_gate_then_build_followup_lane_batch_plan_bundle_without_fetch"
    },
    counts: {
      byRunnerManifestLane: countBy([
        ...sourceAuthorityManifestRows,
        ...existingSignalManifestRows
      ], "runnerManifestLane"),
      byRunnerManifestStatus: countBy([
        ...sourceAuthorityManifestRows,
        ...existingSignalManifestRows
      ], "runnerManifestStatus"),
      byBatchRegionKey: countBy([
        ...sourceAuthorityManifestRows,
        ...existingSignalManifestRows
      ], "batchRegionKey"),
      byRunnerIntent: countBy([
        ...sourceAuthorityManifestRows,
        ...existingSignalManifestRows
      ], "runnerIntent")
    },
    guardrails: [
      "This bundle builds both primary runner manifests together.",
      "It covers 473 unique competitions: 372 source-authority and 101 existing-signal.",
      "It maps 13 batch rows and 273 executor rows into runner manifest rows.",
      "It does not execute fetch/search/write.",
      "Runner manifest execution remains disabled.",
      "Controlled discovery remains disabled.",
      "Canonical promotion remains disabled.",
      "It does not assert source discovery, actionable scope, contracts, route, fixture, standings, season-state, active, inactive, or completed truth.",
      "Zero result must not imply absence.",
      "No match today must not imply inactive.",
      "Match status must not be used as season-state truth.",
      "The 42 non-primary active competitions remain in follow-up lanes, not dropped."
    ],
    runnerManifestOutputFiles,
    sourceAuthorityManifestRows,
    existingSignalManifestRows
  };

  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    retainedRawMapCompetitionCount: output.summary.retainedRawMapCompetitionCount,
    competitionCount: output.summary.competitionCount,
    activeExecutionWaveCompetitionCount: output.summary.activeExecutionWaveCompetitionCount,
    scopeAccountingNoActionCompetitionCount: output.summary.scopeAccountingNoActionCompetitionCount,
    primaryRunnerManifestLaneCount: output.summary.primaryRunnerManifestLaneCount,
    primaryRunnerManifestOutputFileCount: output.summary.primaryRunnerManifestOutputFileCount,
    primaryRunnerManifestRowCount: output.summary.primaryRunnerManifestRowCount,
    primaryRunnerManifestExecutorRowCount: output.summary.primaryRunnerManifestExecutorRowCount,
    primaryRunnerManifestUniqueCompetitionCount: output.summary.primaryRunnerManifestUniqueCompetitionCount,
    sourceAuthorityRunnerManifestCompetitionCount: output.summary.sourceAuthorityRunnerManifestCompetitionCount,
    sourceAuthorityRunnerManifestRowCount: output.summary.sourceAuthorityRunnerManifestRowCount,
    sourceAuthorityRunnerManifestExecutorRowCount: output.summary.sourceAuthorityRunnerManifestExecutorRowCount,
    existingSignalRunnerManifestCompetitionCount: output.summary.existingSignalRunnerManifestCompetitionCount,
    existingSignalRunnerManifestRowCount: output.summary.existingSignalRunnerManifestRowCount,
    existingSignalRunnerManifestExecutorRowCount: output.summary.existingSignalRunnerManifestExecutorRowCount,
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
    runnerManifestExecutionAllowedNowCount: output.summary.runnerManifestExecutionAllowedNowCount,
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
