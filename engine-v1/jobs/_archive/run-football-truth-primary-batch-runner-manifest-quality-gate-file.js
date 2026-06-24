#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/primary-batch-runner-manifest-bundle-2026-06-14/primary-batch-runner-manifest-bundle-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/primary-batch-runner-manifest-quality-gate-2026-06-14/primary-batch-runner-manifest-quality-gate-2026-06-14.json";

const RETAINED_RAW_MAP_COUNT = 689;
const ACTIVE_COMPETITION_COUNT = 515;
const SCOPE_ACCOUNTING_NO_ACTION_COUNT = 174;
const PRIMARY_COMPETITION_COUNT = 473;
const PRIMARY_EXECUTOR_ROW_COUNT = 273;
const PRIMARY_MANIFEST_ROW_COUNT = 13;
const REMAINING_FOLLOWUP_COUNT = 42;

const EXPECTED_MANIFEST_LANES = {
  source_authority_batch_runner_manifest: {
    rows: 6,
    executorRows: 193,
    competitions: 372,
    status: "runner_manifest_ready_without_fetch",
    intent: "prepare_source_authority_batch_inputs_without_fetch_or_search",
    gateStatus: "passed_primary_source_authority_runner_manifest_ready_for_followup_lane_planning_without_execution"
  },
  existing_signal_batch_runner_manifest: {
    rows: 7,
    executorRows: 80,
    competitions: 101,
    status: "runner_manifest_ready_without_truth_assertion",
    intent: "prepare_existing_signal_batch_inputs_without_truth_assertion",
    gateStatus: "passed_primary_existing_signal_runner_manifest_ready_for_followup_lane_planning_without_execution"
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
    ["runnerManifestExecutionAllowedNowCount", 0],
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

function assertManifestRow(row, lane) {
  const key = row.sourceBatchGroupKey || "__missing_source_batch_group_key__";

  if (row.runnerManifestLane !== lane) throw new Error(`${lane}/${key}: runnerManifestLane mismatch`);
  if (row.sourceOnly !== true) throw new Error(`${lane}/${key}: sourceOnly must be true`);
  if (row.runnerManifestExecutionAllowedNow !== false) throw new Error(`${lane}/${key}: runnerManifestExecutionAllowedNow must be false`);

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
    "batchGuardrails",
    "runnerGuardrails"
  ];

  for (const field of arrayFields) {
    if (!Array.isArray(row[field]) || row[field].length < 1) {
      throw new Error(`${lane}/${key}: ${field} must be non-empty`);
    }
  }

  if (!row.runnerManifestStatus) throw new Error(`${lane}/${key}: runnerManifestStatus is required`);
  if (!row.runnerIntent) throw new Error(`${lane}/${key}: runnerIntent is required`);
  if (!row.runnerManifestMode) throw new Error(`${lane}/${key}: runnerManifestMode is required`);
  if (!row.batchRegionKey) throw new Error(`${lane}/${key}: batchRegionKey is required`);
  if (!Number.isInteger(row.executorPlanRowCount) || row.executorPlanRowCount < 1) {
    throw new Error(`${lane}/${key}: executorPlanRowCount must be positive integer`);
  }
}

function validateManifestFile(fileRow) {
  const lane = fileRow.runnerManifestLane;
  const expected = EXPECTED_MANIFEST_LANES[lane];

  if (!expected) throw new Error(`Unexpected runner manifest lane: ${lane}`);
  if (!fs.existsSync(fileRow.outputFile)) throw new Error(`Missing runner manifest output file: ${fileRow.outputFile}`);

  const json = readJson(fileRow.outputFile);
  const summary = json.summary || {};
  const rows = Array.isArray(json.rows) ? json.rows : [];

  if (summary.runnerManifestLane !== lane) throw new Error(`${lane}: summary.runnerManifestLane mismatch`);
  if (summary.runnerManifestRowCount !== expected.rows) {
    throw new Error(`${lane}: expected ${expected.rows} manifest rows, got ${summary.runnerManifestRowCount}`);
  }
  if (summary.sourceBatchPlanRowCount !== expected.rows) {
    throw new Error(`${lane}: expected ${expected.rows} source batch rows, got ${summary.sourceBatchPlanRowCount}`);
  }
  if (summary.executorPlanRowCount !== expected.executorRows) {
    throw new Error(`${lane}: expected ${expected.executorRows} executor rows, got ${summary.executorPlanRowCount}`);
  }
  if (summary.runnerManifestCompetitionCount !== expected.competitions) {
    throw new Error(`${lane}: expected ${expected.competitions} competitions, got ${summary.runnerManifestCompetitionCount}`);
  }
  if (summary.runnerManifestUniqueCompetitionCount !== expected.competitions) {
    throw new Error(`${lane}: expected ${expected.competitions} unique competitions, got ${summary.runnerManifestUniqueCompetitionCount}`);
  }

  assertZeroCounts(summary, lane);

  if (rows.length !== expected.rows) {
    throw new Error(`${lane}: expected ${expected.rows} rows array length, got ${rows.length}`);
  }

  let executorRowSum = 0;
  for (const row of rows) {
    assertManifestRow(row, lane);
    if (row.runnerManifestStatus !== expected.status) {
      throw new Error(`${lane}/${row.sourceBatchGroupKey}: expected runnerManifestStatus ${expected.status}, got ${row.runnerManifestStatus}`);
    }
    if (row.runnerIntent !== expected.intent) {
      throw new Error(`${lane}/${row.sourceBatchGroupKey}: expected runnerIntent ${expected.intent}, got ${row.runnerIntent}`);
    }
    if (row.runnerManifestMode !== "source_only_runner_manifest_not_executed") {
      throw new Error(`${lane}/${row.sourceBatchGroupKey}: runnerManifestMode must be source_only_runner_manifest_not_executed`);
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
    runnerManifestLane: lane,
    qualityGateStatus: expected.gateStatus,
    inputFile: fileRow.outputFile,
    runnerManifestRowCount: expected.rows,
    sourceBatchPlanRowCount: expected.rows,
    executorPlanRowCount: expected.executorRows,
    runnerManifestCompetitionCount: expected.competitions,
    runnerManifestUniqueCompetitionCount: uniqueSlugs.length,
    slugPrefixCount: uniqueSorted(rows.flatMap((row) => row.slugPrefixes || [])).length,
    regionCount: uniqueSorted(rows.flatMap((row) => row.regions || [])).length,
    requiredEvidenceRoleCount: uniqueSorted(rows.flatMap((row) => row.requiredEvidenceRoles || [])).length,
    batchRegionKeys: uniqueSorted(rows.map((row) => row.batchRegionKey)),
    runnerManifestStatuses: uniqueSorted(rows.map((row) => row.runnerManifestStatus)),
    runnerManifestModes: uniqueSorted(rows.map((row) => row.runnerManifestMode)),
    runnerIntents: uniqueSorted(rows.map((row) => row.runnerIntent)),
    sampleCompetitionSlugs: uniqueSlugs.slice(0, 40),
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
  assertSummary(summary, "primaryRunnerManifestLaneCount", 2);
  assertSummary(summary, "primaryRunnerManifestOutputFileCount", 2);
  assertSummary(summary, "primaryRunnerManifestRowCount", PRIMARY_MANIFEST_ROW_COUNT);
  assertSummary(summary, "primaryRunnerManifestExecutorRowCount", PRIMARY_EXECUTOR_ROW_COUNT);
  assertSummary(summary, "primaryRunnerManifestUniqueCompetitionCount", PRIMARY_COMPETITION_COUNT);
  assertSummary(summary, "sourceAuthorityRunnerManifestCompetitionCount", 372);
  assertSummary(summary, "sourceAuthorityRunnerManifestRowCount", 6);
  assertSummary(summary, "sourceAuthorityRunnerManifestExecutorRowCount", 193);
  assertSummary(summary, "existingSignalRunnerManifestCompetitionCount", 101);
  assertSummary(summary, "existingSignalRunnerManifestRowCount", 7);
  assertSummary(summary, "existingSignalRunnerManifestExecutorRowCount", 80);
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
  assertSummary(summary, "runnerManifestExecutionAllowedNowCount", 0);
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

  const runnerManifestOutputFiles = Array.isArray(bundle.runnerManifestOutputFiles)
    ? bundle.runnerManifestOutputFiles
    : [];

  if (runnerManifestOutputFiles.length !== 2) {
    throw new Error(`Expected 2 runnerManifestOutputFiles, got ${runnerManifestOutputFiles.length}`);
  }

  const qualityGateRows = runnerManifestOutputFiles
    .map(validateManifestFile)
    .sort((a, b) => a.runnerManifestLane.localeCompare(b.runnerManifestLane));

  const passedRows = qualityGateRows.filter((row) => row.qualityGateStatus.startsWith("passed_"));
  const blockedRows = qualityGateRows.filter((row) => !row.qualityGateStatus.startsWith("passed_"));

  if (passedRows.length !== 2) throw new Error(`Expected 2 passed runner manifest lanes, got ${passedRows.length}`);
  if (blockedRows.length !== 0) throw new Error(`Expected 0 blocked runner manifest lanes, got ${blockedRows.length}`);

  const sourceAuthorityRow = qualityGateRows.find((row) =>
    row.runnerManifestLane === "source_authority_batch_runner_manifest"
  );
  const existingSignalRow = qualityGateRows.find((row) =>
    row.runnerManifestLane === "existing_signal_batch_runner_manifest"
  );

  const totalManifestRows = qualityGateRows.reduce((sum, row) => sum + row.runnerManifestRowCount, 0);
  const totalExecutorRows = qualityGateRows.reduce((sum, row) => sum + row.executorPlanRowCount, 0);
  const totalCompetitionRefs = qualityGateRows.reduce((sum, row) => sum + row.runnerManifestCompetitionCount, 0);

  if (totalManifestRows !== PRIMARY_MANIFEST_ROW_COUNT) {
    throw new Error(`Expected ${PRIMARY_MANIFEST_ROW_COUNT} manifest rows, got ${totalManifestRows}`);
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
    job: "run-football-truth-primary-batch-runner-manifest-quality-gate-file",
    mode: "source_only_quality_gate_for_primary_batch_runner_manifest_outputs_473_competitions_no_fetch_no_search_no_writes_no_truth_assertions",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      primaryBatchRunnerManifestBundle: args.input
    },
    summary: {
      retainedRawMapCompetitionCount: RETAINED_RAW_MAP_COUNT,
      competitionCount: RETAINED_RAW_MAP_COUNT,
      activeExecutionWaveCompetitionCount: ACTIVE_COMPETITION_COUNT,
      scopeAccountingNoActionCompetitionCount: SCOPE_ACCOUNTING_NO_ACTION_COUNT,

      primaryRunnerManifestQualityGateLaneCount: qualityGateRows.length,
      primaryRunnerManifestQualityGatePassedLaneCount: passedRows.length,
      primaryRunnerManifestQualityGateBlockedLaneCount: blockedRows.length,
      primaryRunnerManifestQualityGateRowCount: totalManifestRows,
      primaryRunnerManifestQualityGateExecutorRowCount: totalExecutorRows,
      primaryRunnerManifestQualityGateCompetitionReferenceCount: totalCompetitionRefs,

      sourceAuthorityRunnerManifestQualityGateStatus: sourceAuthorityRow?.qualityGateStatus || null,
      sourceAuthorityRunnerManifestCompetitionCount: sourceAuthorityRow?.runnerManifestCompetitionCount || 0,
      sourceAuthorityRunnerManifestRowCount: sourceAuthorityRow?.runnerManifestRowCount || 0,
      sourceAuthorityRunnerManifestExecutorRowCount: sourceAuthorityRow?.executorPlanRowCount || 0,
      existingSignalRunnerManifestQualityGateStatus: existingSignalRow?.qualityGateStatus || null,
      existingSignalRunnerManifestCompetitionCount: existingSignalRow?.runnerManifestCompetitionCount || 0,
      existingSignalRunnerManifestRowCount: existingSignalRow?.runnerManifestRowCount || 0,
      existingSignalRunnerManifestExecutorRowCount: existingSignalRow?.executorPlanRowCount || 0,
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

      recommendedNextLane: "build_followup_lane_batch_plan_bundle_without_fetch_for_remaining_42_competitions"
    },
    counts: {
      byRunnerManifestLane: countBy(qualityGateRows, "runnerManifestLane"),
      byQualityGateStatus: countBy(qualityGateRows, "qualityGateStatus")
    },
    guardrails: [
      "This quality gate covers both primary runner manifest outputs together.",
      "It validates 473 primary competition references from 13 runner manifest rows and 273 executor plan rows.",
      "It does not execute runner manifests.",
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
    primaryRunnerManifestQualityGateLaneCount: output.summary.primaryRunnerManifestQualityGateLaneCount,
    primaryRunnerManifestQualityGatePassedLaneCount: output.summary.primaryRunnerManifestQualityGatePassedLaneCount,
    primaryRunnerManifestQualityGateBlockedLaneCount: output.summary.primaryRunnerManifestQualityGateBlockedLaneCount,
    primaryRunnerManifestQualityGateRowCount: output.summary.primaryRunnerManifestQualityGateRowCount,
    primaryRunnerManifestQualityGateExecutorRowCount: output.summary.primaryRunnerManifestQualityGateExecutorRowCount,
    primaryRunnerManifestQualityGateCompetitionReferenceCount: output.summary.primaryRunnerManifestQualityGateCompetitionReferenceCount,
    sourceAuthorityRunnerManifestQualityGateStatus: output.summary.sourceAuthorityRunnerManifestQualityGateStatus,
    sourceAuthorityRunnerManifestCompetitionCount: output.summary.sourceAuthorityRunnerManifestCompetitionCount,
    sourceAuthorityRunnerManifestRowCount: output.summary.sourceAuthorityRunnerManifestRowCount,
    sourceAuthorityRunnerManifestExecutorRowCount: output.summary.sourceAuthorityRunnerManifestExecutorRowCount,
    existingSignalRunnerManifestQualityGateStatus: output.summary.existingSignalRunnerManifestQualityGateStatus,
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
