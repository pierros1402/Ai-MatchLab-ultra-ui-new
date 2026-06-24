#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/primary-candidate-matrices-quality-gate-2026-06-14/primary-candidate-matrices-quality-gate-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/primary-matrix-executor-plans-bundle-2026-06-14/primary-matrix-executor-plans-bundle-2026-06-14.json";

const RETAINED_RAW_MAP_COUNT = 689;
const ACTIVE_COMPETITION_COUNT = 515;
const SCOPE_ACCOUNTING_NO_ACTION_COUNT = 174;
const PRIMARY_COMPETITION_COUNT = 473;
const REMAINING_FOLLOWUP_COUNT = 42;

const MATRIX_EXPECTED = {
  source_authority_template_candidate_matrix: {
    qualityGateStatus: "passed_ready_for_source_authority_template_candidate_matrix_executor_plan",
    matrixRows: 193,
    competitions: 372,
    executorPlanLane: "source_authority_template_executor_plan",
    executorPlanStatus: "executor_plan_ready_no_fetch_no_search",
    executorFamily: "source_authority_template_candidate_matrix",
    nextAllowedStep: "source_only_executor_plan_quality_gate_before_any_controlled_discovery"
  },
  existing_signal_truth_gap_matrix: {
    qualityGateStatus: "passed_ready_for_existing_signal_truth_gap_matrix_executor_plan",
    matrixRows: 80,
    competitions: 101,
    executorPlanLane: "existing_signal_truth_gap_executor_plan",
    executorPlanStatus: "executor_plan_ready_no_truth_assertion",
    executorFamily: "existing_signal_truth_gap_matrix",
    nextAllowedStep: "source_only_executor_plan_quality_gate_before_any_canonical_promotion_gate"
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

function assertSafeRow(row, lane) {
  const key =
    row.compilerGroupingKey ||
    row.sourceAuthorityTemplateKey ||
    row.existingSignalReviewKey ||
    "__missing_key__";

  const requiredFalse = [
    "fetchAllowedNow",
    "searchAllowedNow",
    "broadSearchAllowedNow",
    "zeroResultMayImplyAbsence",
    "canonicalWriteEligibleNow",
    "productionWrite",
    "truthAssertionsAllowedNow",
    "activeAssertedNow",
    "inactiveAssertedNow",
    "completedAssertedNow"
  ];

  if (row.sourceOnly !== true) throw new Error(`${lane}/${key}: sourceOnly must be true`);

  for (const field of requiredFalse) {
    if (row[field] !== false) throw new Error(`${lane}/${key}: ${field} must be false`);
  }

  if (!Array.isArray(row.competitionSlugs) || row.competitionSlugs.length < 1) {
    throw new Error(`${lane}/${key}: competitionSlugs must be non-empty`);
  }

  if (!Array.isArray(row.slugPrefixes) || row.slugPrefixes.length < 1) {
    throw new Error(`${lane}/${key}: slugPrefixes must be non-empty`);
  }

  if (!Array.isArray(row.regions) || row.regions.length < 1) {
    throw new Error(`${lane}/${key}: regions must be non-empty`);
  }

  if (!Array.isArray(row.requiredEvidenceRoles) || row.requiredEvidenceRoles.length < 1) {
    throw new Error(`${lane}/${key}: requiredEvidenceRoles must be non-empty`);
  }
}

function assertMatrixSummary(summary, lane, expected) {
  if (summary.matrixLane !== lane) throw new Error(`${lane}: matrixLane mismatch`);
  if (summary.matrixRowCount !== expected.matrixRows) {
    throw new Error(`${lane}: expected ${expected.matrixRows} rows, got ${summary.matrixRowCount}`);
  }
  if (summary.matrixCompetitionCount !== expected.competitions) {
    throw new Error(`${lane}: expected ${expected.competitions} competitions, got ${summary.matrixCompetitionCount}`);
  }
  if (summary.matrixUniqueCompetitionCount !== expected.competitions) {
    throw new Error(`${lane}: expected ${expected.competitions} unique competitions, got ${summary.matrixUniqueCompetitionCount}`);
  }

  const zeroChecks = [
    ["fetchAllowedNowCount", 0],
    ["searchAllowedNowCount", 0],
    ["broadSearchAllowedNowCount", 0],
    ["zeroResultMayImplyAbsenceCount", 0],
    ["canonicalWriteEligibleNowCount", 0],
    ["activeAssertedCount", 0],
    ["inactiveAssertedCount", 0],
    ["completedAssertedCount", 0],
    ["canonicalWrites", 0],
    ["productionWrite", false]
  ];

  for (const [key, expectedValue] of zeroChecks) {
    if (summary[key] !== expectedValue) {
      throw new Error(`${lane}: expected ${key}=${expectedValue}, got ${summary[key]}`);
    }
  }
}

function loadMatrixFromGate(gateRows, matrixLane) {
  const expected = MATRIX_EXPECTED[matrixLane];
  const gateRow = gateRows.find((row) => row.matrixLane === matrixLane);

  if (!gateRow) throw new Error(`Missing gate row for ${matrixLane}`);
  if (gateRow.qualityGateStatus !== expected.qualityGateStatus) {
    throw new Error(`${matrixLane}: expected status ${expected.qualityGateStatus}, got ${gateRow.qualityGateStatus}`);
  }
  if (gateRow.matrixRowCount !== expected.matrixRows) {
    throw new Error(`${matrixLane}: expected gate matrixRowCount ${expected.matrixRows}, got ${gateRow.matrixRowCount}`);
  }
  if (gateRow.matrixCompetitionCount !== expected.competitions) {
    throw new Error(`${matrixLane}: expected gate competition count ${expected.competitions}, got ${gateRow.matrixCompetitionCount}`);
  }
  if (!fs.existsSync(gateRow.inputFile)) throw new Error(`${matrixLane}: missing matrix file ${gateRow.inputFile}`);

  const file = readJson(gateRow.inputFile);
  const summary = file.summary || {};
  const rows = Array.isArray(file.rows) ? file.rows : [];

  assertMatrixSummary(summary, matrixLane, expected);

  if (rows.length !== expected.matrixRows) {
    throw new Error(`${matrixLane}: expected ${expected.matrixRows} rows, got ${rows.length}`);
  }

  for (const row of rows) assertSafeRow(row, matrixLane);

  const uniqueSlugs = uniqueSorted(rows.flatMap((row) => row.competitionSlugs || []));
  if (uniqueSlugs.length !== expected.competitions) {
    throw new Error(`${matrixLane}: expected ${expected.competitions} unique slugs, got ${uniqueSlugs.length}`);
  }

  return { gateRow, file, summary, rows, uniqueSlugs };
}

function buildExecutorPlanRows(matrixLane, matrixRows) {
  const expected = MATRIX_EXPECTED[matrixLane];

  return matrixRows.map((row, index) => {
    const competitionSlugs = uniqueSorted(row.competitionSlugs || []);
    const slugPrefixes = uniqueSorted(row.slugPrefixes || []);
    const regions = uniqueSorted(row.regions || []);

    const executorPlanRow = {
      executorPlanLane: expected.executorPlanLane,
      executorPlanStatus: expected.executorPlanStatus,
      executorFamily: expected.executorFamily,
      executorPlanIndex: index + 1,
      sourceMatrixLane: matrixLane,
      compilerGroupingKey: row.compilerGroupingKey,
      competitionCount: competitionSlugs.length,
      competitionSlugs,
      slugPrefixes,
      regions,
      requiredEvidenceRoles: uniqueSorted(row.requiredEvidenceRoles || []),
      nextAllowedStep: expected.nextAllowedStep,
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
      executorPlanGuardrails: [
        "no_fetch",
        "no_search",
        "no_broad_search",
        "zero_result_not_absence",
        "no_canonical_write",
        "no_production_write",
        "no_active_inactive_completed_assertion",
        "no_route_fixture_standings_season_state_truth_assertion"
      ]
    };

    if (matrixLane === "source_authority_template_candidate_matrix") {
      executorPlanRow.sourceAuthorityTemplateKey = row.sourceAuthorityTemplateKey;
      executorPlanRow.executorPlanAction =
        "plan_source_authority_template_candidate_evaluation_no_discovery_execution";
      executorPlanRow.requiredExecutorSections = [
        "identity_scope",
        "candidate_source_roles",
        "fixture_route_candidate_slot",
        "standings_route_candidate_slot",
        "season_state_route_candidate_slot",
        "restart_start_date_policy_slot",
        "controlled_discovery_gate_slot",
        "search_health_gate_slot"
      ];
    }

    if (matrixLane === "existing_signal_truth_gap_matrix") {
      executorPlanRow.existingSignalReviewKey = row.existingSignalReviewKey;
      executorPlanRow.executorPlanAction =
        "plan_existing_signal_truth_gap_evaluation_no_truth_assertion";
      executorPlanRow.requiredExecutorSections = [
        "existing_signal_trace_slot",
        "route_evidence_trace_slot",
        "fixture_result_signal_slot",
        "standings_signal_slot",
        "season_state_signal_slot",
        "truth_gap_classification_slot",
        "canonical_write_gate_slot",
        "restart_start_date_need_slot"
      ];
    }

    return executorPlanRow;
  }).sort((a, b) => {
    if (a.regions.join(",") !== b.regions.join(",")) return a.regions.join(",").localeCompare(b.regions.join(","));
    if (a.slugPrefixes.join(",") !== b.slugPrefixes.join(",")) return a.slugPrefixes.join(",").localeCompare(b.slugPrefixes.join(","));
    return a.compilerGroupingKey.localeCompare(b.compilerGroupingKey);
  });
}

function writeExecutorPlanFile({ outputDir, date, executorPlanLane, rows }) {
  const uniqueSlugs = uniqueSorted(rows.flatMap((row) => row.competitionSlugs || []));
  const filePath = path.join(
    outputDir,
    `primary-matrix-executor-plan-output-${executorPlanLane}-${date}.json`
  ).replaceAll("\\", "/");

  const output = {
    generatedAt: new Date().toISOString(),
    date,
    job: "build-football-truth-primary-matrix-executor-plans-bundle-file",
    mode: "source_only_primary_matrix_executor_plan_output_no_fetch_no_search_no_writes_no_truth_assertions",
    executorPlanLane,
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    summary: {
      executorPlanLane,
      executorPlanRowCount: rows.length,
      executorPlanCompetitionCount: uniqueSlugs.length,
      executorPlanUniqueCompetitionCount: uniqueSlugs.length,
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
      byRegion: countBy(rows.flatMap((row) => row.regions.map((region) => ({ region }))), "region"),
      byExecutorPlanStatus: countBy(rows, "executorPlanStatus"),
      byExecutorPlanAction: countBy(rows, "executorPlanAction")
    },
    guardrails: [
      "This is a source-only executor plan output.",
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
    executorPlanLane,
    outputFile: filePath,
    executorPlanRowCount: rows.length,
    executorPlanCompetitionCount: uniqueSlugs.length,
    executorPlanUniqueCompetitionCount: uniqueSlugs.length,
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
  assertSummary(summary, "primaryMatrixQualityGateLaneCount", 2);
  assertSummary(summary, "primaryMatrixQualityGatePassedLaneCount", 2);
  assertSummary(summary, "primaryMatrixQualityGateBlockedLaneCount", 0);
  assertSummary(summary, "primaryMatrixQualityGateRowCount", 273);
  assertSummary(summary, "primaryMatrixQualityGateCompetitionReferenceCount", PRIMARY_COMPETITION_COUNT);
  assertSummary(summary, "sourceAuthorityTemplateCandidateMatrixCompetitionCount", 372);
  assertSummary(summary, "sourceAuthorityTemplateCandidateMatrixRowCount", 193);
  assertSummary(summary, "existingSignalTruthGapMatrixCompetitionCount", 101);
  assertSummary(summary, "existingSignalTruthGapMatrixRowCount", 80);
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
  assertSummary(summary, "zeroResultMayImplyAbsenceCount", 0);
  assertSummary(summary, "canonicalWriteEligibleNowCount", 0);
  assertSummary(summary, "activeAssertedCount", 0);
  assertSummary(summary, "inactiveAssertedCount", 0);
  assertSummary(summary, "completedAssertedCount", 0);
  assertSummary(summary, "canonicalWrites", 0);
  assertSummary(summary, "productionWrite", false);

  const qualityGateRows = Array.isArray(gate.qualityGateRows) ? gate.qualityGateRows : [];
  if (qualityGateRows.length !== 2) throw new Error(`Expected 2 qualityGateRows, got ${qualityGateRows.length}`);

  const sourceAuthority = loadMatrixFromGate(qualityGateRows, "source_authority_template_candidate_matrix");
  const existingSignal = loadMatrixFromGate(qualityGateRows, "existing_signal_truth_gap_matrix");

  const sourceAuthorityExecutorRows = buildExecutorPlanRows(
    "source_authority_template_candidate_matrix",
    sourceAuthority.rows
  );

  const existingSignalExecutorRows = buildExecutorPlanRows(
    "existing_signal_truth_gap_matrix",
    existingSignal.rows
  );

  if (sourceAuthorityExecutorRows.length !== 193) {
    throw new Error(`Expected 193 source-authority executor rows, got ${sourceAuthorityExecutorRows.length}`);
  }

  if (existingSignalExecutorRows.length !== 80) {
    throw new Error(`Expected 80 existing-signal executor rows, got ${existingSignalExecutorRows.length}`);
  }

  const allExecutorSlugs = uniqueSorted([
    ...sourceAuthorityExecutorRows.flatMap((row) => row.competitionSlugs || []),
    ...existingSignalExecutorRows.flatMap((row) => row.competitionSlugs || [])
  ]);

  if (allExecutorSlugs.length !== PRIMARY_COMPETITION_COUNT) {
    throw new Error(`Expected ${PRIMARY_COMPETITION_COUNT} unique executor plan slugs, got ${allExecutorSlugs.length}`);
  }

  const outputDir = path.dirname(args.output);
  fs.mkdirSync(outputDir, { recursive: true });

  const sourceAuthorityPlanOutput = writeExecutorPlanFile({
    outputDir,
    date: args.date,
    executorPlanLane: "source_authority_template_executor_plan",
    rows: sourceAuthorityExecutorRows
  });

  const existingSignalPlanOutput = writeExecutorPlanFile({
    outputDir,
    date: args.date,
    executorPlanLane: "existing_signal_truth_gap_executor_plan",
    rows: existingSignalExecutorRows
  });

  const executorPlanOutputFiles = [sourceAuthorityPlanOutput, existingSignalPlanOutput];

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-primary-matrix-executor-plans-bundle-file",
    mode: "source_only_primary_matrix_executor_plans_for_source_authority_372_and_existing_signal_101_no_fetch_no_search_no_writes_no_truth_assertions",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      primaryCandidateMatricesQualityGate: args.input,
      sourceAuthorityTemplateCandidateMatrix: sourceAuthority.gateRow.inputFile,
      existingSignalTruthGapMatrix: existingSignal.gateRow.inputFile
    },
    summary: {
      retainedRawMapCompetitionCount: RETAINED_RAW_MAP_COUNT,
      competitionCount: RETAINED_RAW_MAP_COUNT,
      activeExecutionWaveCompetitionCount: ACTIVE_COMPETITION_COUNT,
      scopeAccountingNoActionCompetitionCount: SCOPE_ACCOUNTING_NO_ACTION_COUNT,

      primaryExecutorPlanLaneCount: executorPlanOutputFiles.length,
      primaryExecutorPlanOutputFileCount: executorPlanOutputFiles.length,
      primaryExecutorPlanRowCount: sourceAuthorityExecutorRows.length + existingSignalExecutorRows.length,
      primaryExecutorPlanUniqueCompetitionCount: allExecutorSlugs.length,

      sourceAuthorityTemplateExecutorPlanCompetitionCount: sourceAuthorityPlanOutput.executorPlanCompetitionCount,
      sourceAuthorityTemplateExecutorPlanRowCount: sourceAuthorityPlanOutput.executorPlanRowCount,
      existingSignalTruthGapExecutorPlanCompetitionCount: existingSignalPlanOutput.executorPlanCompetitionCount,
      existingSignalTruthGapExecutorPlanRowCount: existingSignalPlanOutput.executorPlanRowCount,
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

      recommendedNextLane: "run_source_only_primary_matrix_executor_plans_quality_gate_then_build_source_authority_template_executor_batch_plan"
    },
    counts: {
      byExecutorPlanLane: countBy([
        ...sourceAuthorityExecutorRows,
        ...existingSignalExecutorRows
      ], "executorPlanLane"),
      byExecutorPlanStatus: countBy([
        ...sourceAuthorityExecutorRows,
        ...existingSignalExecutorRows
      ], "executorPlanStatus"),
      bySourceAuthorityRegion: countBy(sourceAuthorityExecutorRows.flatMap((row) => row.regions.map((region) => ({ region }))), "region"),
      byExistingSignalRegion: countBy(existingSignalExecutorRows.flatMap((row) => row.regions.map((region) => ({ region }))), "region")
    },
    guardrails: [
      "This bundle builds both primary matrix executor plans together.",
      "It covers 473 unique competitions: 372 source-authority and 101 existing-signal.",
      "It does not execute fetch/search/write.",
      "Controlled discovery remains disabled.",
      "Canonical promotion remains disabled.",
      "It does not assert source discovery, actionable scope, contracts, route, fixture, standings, season-state, active, inactive, or completed truth.",
      "Zero result must not imply absence.",
      "No match today must not imply inactive.",
      "Match status must not be used as season-state truth.",
      "The 42 non-primary active competitions remain in follow-up lanes, not dropped."
    ],
    executorPlanOutputFiles,
    sourceAuthorityExecutorRows,
    existingSignalExecutorRows
  };

  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    retainedRawMapCompetitionCount: output.summary.retainedRawMapCompetitionCount,
    competitionCount: output.summary.competitionCount,
    activeExecutionWaveCompetitionCount: output.summary.activeExecutionWaveCompetitionCount,
    scopeAccountingNoActionCompetitionCount: output.summary.scopeAccountingNoActionCompetitionCount,
    primaryExecutorPlanLaneCount: output.summary.primaryExecutorPlanLaneCount,
    primaryExecutorPlanOutputFileCount: output.summary.primaryExecutorPlanOutputFileCount,
    primaryExecutorPlanRowCount: output.summary.primaryExecutorPlanRowCount,
    primaryExecutorPlanUniqueCompetitionCount: output.summary.primaryExecutorPlanUniqueCompetitionCount,
    sourceAuthorityTemplateExecutorPlanCompetitionCount: output.summary.sourceAuthorityTemplateExecutorPlanCompetitionCount,
    sourceAuthorityTemplateExecutorPlanRowCount: output.summary.sourceAuthorityTemplateExecutorPlanRowCount,
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
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
