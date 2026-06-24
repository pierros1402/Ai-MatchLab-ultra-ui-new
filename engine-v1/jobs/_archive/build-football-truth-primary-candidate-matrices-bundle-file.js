#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/primary-large-compiler-quality-gate-2026-06-14/primary-large-compiler-quality-gate-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/primary-candidate-matrices-bundle-2026-06-14/primary-candidate-matrices-bundle-2026-06-14.json";

const RETAINED_RAW_MAP_COUNT = 689;
const ACTIVE_COMPETITION_COUNT = 515;
const SCOPE_ACCOUNTING_NO_ACTION_COUNT = 174;
const PRIMARY_COMPETITION_COUNT = 473;
const REMAINING_FOLLOWUP_COUNT = 42;

const SOURCE_AUTHORITY_LANE = "source_authority_template_compiler_lane";
const EXISTING_SIGNAL_LANE = "existing_signal_truth_review_compiler_lane";

const EXPECTED = {
  [SOURCE_AUTHORITY_LANE]: {
    status: "passed_ready_for_source_authority_template_candidate_matrix",
    rows: 193,
    competitions: 372
  },
  [EXISTING_SIGNAL_LANE]: {
    status: "passed_ready_for_existing_signal_truth_gap_matrix",
    rows: 80,
    competitions: 101
  }
};

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    input: DEFAULT_INPUT,
    output: DEFAULT_OUTPUT
  };

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

function assertCompiledRowGuardrails(row, lane) {
  const key =
    row.compilerGroupingKey ||
    row.sourceAuthorityTemplateKey ||
    row.existingSignalReviewKey ||
    "__missing_key__";

  if (row.sourceOnly !== true) throw new Error(`${lane}/${key}: sourceOnly must be true`);
  if (row.fetchAllowedNow !== false) throw new Error(`${lane}/${key}: fetchAllowedNow must be false`);
  if (row.searchAllowedNow !== false) throw new Error(`${lane}/${key}: searchAllowedNow must be false`);
  if (row.broadSearchAllowedNow !== false) throw new Error(`${lane}/${key}: broadSearchAllowedNow must be false`);
  if (row.zeroResultMayImplyAbsence !== false) throw new Error(`${lane}/${key}: zeroResultMayImplyAbsence must be false`);
  if (row.canonicalWriteEligibleNow !== false) throw new Error(`${lane}/${key}: canonicalWriteEligibleNow must be false`);
  if (row.productionWrite !== false) throw new Error(`${lane}/${key}: productionWrite must be false`);
  if (row.truthAssertionsAllowedNow !== false) throw new Error(`${lane}/${key}: truthAssertionsAllowedNow must be false`);
  if (row.activeAssertedNow !== false) throw new Error(`${lane}/${key}: activeAssertedNow must be false`);
  if (row.inactiveAssertedNow !== false) throw new Error(`${lane}/${key}: inactiveAssertedNow must be false`);
  if (row.completedAssertedNow !== false) throw new Error(`${lane}/${key}: completedAssertedNow must be false`);

  if (!Array.isArray(row.competitionSlugs) || row.competitionSlugs.length < 1) {
    throw new Error(`${lane}/${key}: competitionSlugs must be non-empty`);
  }

  if (!Array.isArray(row.requiredEvidenceRoles) || row.requiredEvidenceRoles.length < 1) {
    throw new Error(`${lane}/${key}: requiredEvidenceRoles must be non-empty`);
  }
}

function validatePrimaryGateAndReadLane(gateRows, lane) {
  const expected = EXPECTED[lane];
  const gateRow = gateRows.find((row) => row.primaryCompilerLane === lane);
  if (!gateRow) throw new Error(`Missing quality gate row for ${lane}`);

  if (gateRow.qualityGateStatus !== expected.status) {
    throw new Error(`${lane}: expected qualityGateStatus ${expected.status}, got ${gateRow.qualityGateStatus}`);
  }

  if (gateRow.compiledRowCount !== expected.rows) {
    throw new Error(`${lane}: expected ${expected.rows} compiled rows, got ${gateRow.compiledRowCount}`);
  }

  if (gateRow.compiledCompetitionCount !== expected.competitions) {
    throw new Error(`${lane}: expected ${expected.competitions} competitions, got ${gateRow.compiledCompetitionCount}`);
  }

  if (!fs.existsSync(gateRow.inputFile)) {
    throw new Error(`${lane}: missing primary compiler output inputFile ${gateRow.inputFile}`);
  }

  const laneFile = readJson(gateRow.inputFile);
  const summary = laneFile.summary || {};
  const compiledRows = Array.isArray(laneFile.compiledRows) ? laneFile.compiledRows : [];

  if (summary.primaryCompilerLane !== lane) throw new Error(`${lane}: summary.primaryCompilerLane mismatch`);
  if (summary.compiledRowCount !== expected.rows) throw new Error(`${lane}: lane output compiledRowCount mismatch`);
  if (summary.compiledUniqueCompetitionCount !== expected.competitions) {
    throw new Error(`${lane}: lane output compiledUniqueCompetitionCount mismatch`);
  }

  if (compiledRows.length !== expected.rows) {
    throw new Error(`${lane}: expected ${expected.rows} compiledRows, got ${compiledRows.length}`);
  }

  for (const row of compiledRows) assertCompiledRowGuardrails(row, lane);

  const slugs = uniqueSorted(compiledRows.flatMap((row) => row.competitionSlugs || []));
  if (slugs.length !== expected.competitions) {
    throw new Error(`${lane}: expected ${expected.competitions} unique slugs, got ${slugs.length}`);
  }

  return { gateRow, laneFile, compiledRows, slugs };
}

function buildSourceAuthorityCandidateRows(compiledRows) {
  return compiledRows.map((row) => {
    const competitionSlugs = uniqueSorted(row.competitionSlugs || []);
    const slugPrefixes = uniqueSorted(row.slugPrefixes || []);
    const regions = uniqueSorted(row.regions || []);

    return {
      matrixLane: "source_authority_template_candidate_matrix",
      compilerGroupingKey: row.compilerGroupingKey,
      sourceAuthorityTemplateKey: row.sourceAuthorityTemplateKey,
      candidateMatrixStatus: "candidate_matrix_row_compiled_no_discovery_execution",
      competitionCount: competitionSlugs.length,
      competitionSlugs,
      slugPrefixes,
      regions,
      requiredEvidenceRoles: uniqueSorted(row.requiredEvidenceRoles || []),
      candidateColumns: [
        "competition_identity",
        "country_or_prefix_scope",
        "official_source_candidate",
        "high_trust_source_candidate",
        "fixture_route_candidate",
        "standings_route_candidate",
        "season_state_route_candidate",
        "restart_or_start_date_source_when_needed",
        "search_health_gate_required_before_controlled_discovery",
        "zero_result_not_absence"
      ],
      candidateReadiness: "ready_for_source_authority_template_matrix_review_no_fetch_no_search",
      controlledDiscoveryAllowedNow: false,
      sourcePresenceAssertedNow: false,
      sourceAbsenceAssertedNow: false,
      sourceOnly: true,
      fetchAllowedNow: false,
      searchAllowedNow: false,
      broadSearchAllowedNow: false,
      zeroResultMayImplyAbsence: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false,
      truthAssertionsAllowedNow: false,
      activeAssertedNow: false,
      inactiveAssertedNow: false,
      completedAssertedNow: false
    };
  }).sort((a, b) => {
    if (a.regions.join(",") !== b.regions.join(",")) return a.regions.join(",").localeCompare(b.regions.join(","));
    if (a.slugPrefixes.join(",") !== b.slugPrefixes.join(",")) return a.slugPrefixes.join(",").localeCompare(b.slugPrefixes.join(","));
    return a.compilerGroupingKey.localeCompare(b.compilerGroupingKey);
  });
}

function buildExistingSignalTruthGapRows(compiledRows) {
  return compiledRows.map((row) => {
    const competitionSlugs = uniqueSorted(row.competitionSlugs || []);
    const slugPrefixes = uniqueSorted(row.slugPrefixes || []);
    const regions = uniqueSorted(row.regions || []);

    return {
      matrixLane: "existing_signal_truth_gap_matrix",
      compilerGroupingKey: row.compilerGroupingKey,
      existingSignalReviewKey: row.existingSignalReviewKey,
      truthGapMatrixStatus: "truth_gap_matrix_row_compiled_no_truth_assertion",
      competitionCount: competitionSlugs.length,
      competitionSlugs,
      slugPrefixes,
      regions,
      requiredEvidenceRoles: uniqueSorted(row.requiredEvidenceRoles || []),
      truthGapColumns: [
        "existing_signal_source_trace",
        "route_evidence_trace",
        "fixture_or_result_signal_trace",
        "standings_signal_trace",
        "season_state_signal_trace",
        "restart_or_start_date_need_when_completed_inactive_near_finish",
        "canonical_write_gate_status",
        "truth_gap_classification"
      ],
      truthGapReadiness: "ready_for_existing_signal_truth_gap_review_no_fetch_no_search",
      canonicalPromotionAllowedNow: false,
      routeTruthAssertedNow: false,
      fixtureTruthAssertedNow: false,
      standingsTruthAssertedNow: false,
      seasonStateTruthAssertedNow: false,
      sourceOnly: true,
      fetchAllowedNow: false,
      searchAllowedNow: false,
      broadSearchAllowedNow: false,
      zeroResultMayImplyAbsence: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false,
      truthAssertionsAllowedNow: false,
      activeAssertedNow: false,
      inactiveAssertedNow: false,
      completedAssertedNow: false
    };
  }).sort((a, b) => {
    if (a.regions.join(",") !== b.regions.join(",")) return a.regions.join(",").localeCompare(b.regions.join(","));
    if (a.slugPrefixes.join(",") !== b.slugPrefixes.join(",")) return a.slugPrefixes.join(",").localeCompare(b.slugPrefixes.join(","));
    return a.compilerGroupingKey.localeCompare(b.compilerGroupingKey);
  });
}

function writeMatrixFile({ outputDir, date, matrixLane, rows }) {
  const uniqueSlugs = uniqueSorted(rows.flatMap((row) => row.competitionSlugs || []));
  const filePath = path.join(
    outputDir,
    `primary-candidate-matrix-output-${matrixLane}-${date}.json`
  ).replaceAll("\\", "/");

  const output = {
    generatedAt: new Date().toISOString(),
    date,
    job: "build-football-truth-primary-candidate-matrices-bundle-file",
    mode: "source_only_primary_candidate_matrix_output_no_fetch_no_search_no_writes_no_truth_assertions",
    matrixLane,
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    summary: {
      matrixLane,
      matrixRowCount: rows.length,
      matrixCompetitionCount: uniqueSlugs.length,
      matrixUniqueCompetitionCount: uniqueSlugs.length,
      slugPrefixCount: uniqueSorted(rows.flatMap((row) => row.slugPrefixes || [])).length,
      regionCount: uniqueSorted(rows.flatMap((row) => row.regions || [])).length,
      requiredEvidenceRoleCount: uniqueSorted(rows.flatMap((row) => row.requiredEvidenceRoles || [])).length,
      fetchAllowedNowCount: 0,
      searchAllowedNowCount: 0,
      broadSearchAllowedNowCount: 0,
      zeroResultMayImplyAbsenceCount: 0,
      canonicalWriteEligibleNowCount: 0,
      activeAssertedCount: 0,
      inactiveAssertedCount: 0,
      completedAssertedCount: 0,
      canonicalWrites: 0,
      productionWrite: false
    },
    counts: {
      byRegion: countBy(rows.flatMap((row) => row.regions.map((region) => ({ region }))), "region")
    },
    guardrails: [
      "This is a source-only candidate matrix output.",
      "No fetch/search/write/truth assertion is performed.",
      "Zero result must not imply absence.",
      "No match today must not imply inactive.",
      "Match status must not be used as season-state truth.",
      "Completed/inactive/near-finish competitions require trusted restart/start evidence when available before daily scheduling decisions."
    ],
    rows
  };

  fs.writeFileSync(filePath, stableJson(output));

  return {
    matrixLane,
    outputFile: filePath,
    matrixRowCount: rows.length,
    matrixCompetitionCount: uniqueSlugs.length,
    matrixUniqueCompetitionCount: uniqueSlugs.length,
    slugPrefixCount: output.summary.slugPrefixCount,
    regionCount: output.summary.regionCount,
    fetchAllowedNow: false,
    searchAllowedNow: false,
    broadSearchAllowedNow: false,
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
  assertSummary(summary, "primaryQualityGateLaneCount", 2);
  assertSummary(summary, "primaryQualityGatePassedLaneCount", 2);
  assertSummary(summary, "primaryQualityGateBlockedLaneCount", 0);
  assertSummary(summary, "primaryQualityGateCompiledRowCount", 273);
  assertSummary(summary, "primaryQualityGateCompetitionReferenceCount", PRIMARY_COMPETITION_COUNT);
  assertSummary(summary, "sourceAuthorityTemplateCompiledCompetitionCount", 372);
  assertSummary(summary, "sourceAuthorityTemplateCompiledRowCount", 193);
  assertSummary(summary, "existingSignalTruthReviewCompiledCompetitionCount", 101);
  assertSummary(summary, "existingSignalTruthReviewCompiledRowCount", 80);
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

  const sourceAuthority = validatePrimaryGateAndReadLane(qualityGateRows, SOURCE_AUTHORITY_LANE);
  const existingSignal = validatePrimaryGateAndReadLane(qualityGateRows, EXISTING_SIGNAL_LANE);

  const sourceAuthorityCandidateRows = buildSourceAuthorityCandidateRows(sourceAuthority.compiledRows);
  const existingSignalTruthGapRows = buildExistingSignalTruthGapRows(existingSignal.compiledRows);

  if (sourceAuthorityCandidateRows.length !== 193) {
    throw new Error(`Expected 193 source authority matrix rows, got ${sourceAuthorityCandidateRows.length}`);
  }

  if (existingSignalTruthGapRows.length !== 80) {
    throw new Error(`Expected 80 existing signal truth gap rows, got ${existingSignalTruthGapRows.length}`);
  }

  const primaryMatrixSlugs = uniqueSorted([
    ...sourceAuthorityCandidateRows.flatMap((row) => row.competitionSlugs || []),
    ...existingSignalTruthGapRows.flatMap((row) => row.competitionSlugs || [])
  ]);

  if (primaryMatrixSlugs.length !== PRIMARY_COMPETITION_COUNT) {
    throw new Error(`Expected ${PRIMARY_COMPETITION_COUNT} unique primary matrix slugs, got ${primaryMatrixSlugs.length}`);
  }

  const outputDir = path.dirname(args.output);
  fs.mkdirSync(outputDir, { recursive: true });

  const sourceAuthorityMatrixOutput = writeMatrixFile({
    outputDir,
    date: args.date,
    matrixLane: "source_authority_template_candidate_matrix",
    rows: sourceAuthorityCandidateRows
  });

  const existingSignalMatrixOutput = writeMatrixFile({
    outputDir,
    date: args.date,
    matrixLane: "existing_signal_truth_gap_matrix",
    rows: existingSignalTruthGapRows
  });

  const matrixOutputFiles = [sourceAuthorityMatrixOutput, existingSignalMatrixOutput];

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-primary-candidate-matrices-bundle-file",
    mode: "source_only_primary_candidate_matrices_for_source_authority_372_and_existing_signal_101_no_fetch_no_search_no_writes_no_truth_assertions",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      primaryLargeCompilerQualityGate: args.input,
      sourceAuthorityCompilerOutput: sourceAuthority.gateRow.inputFile,
      existingSignalCompilerOutput: existingSignal.gateRow.inputFile
    },
    summary: {
      retainedRawMapCompetitionCount: RETAINED_RAW_MAP_COUNT,
      competitionCount: RETAINED_RAW_MAP_COUNT,
      activeExecutionWaveCompetitionCount: ACTIVE_COMPETITION_COUNT,
      scopeAccountingNoActionCompetitionCount: SCOPE_ACCOUNTING_NO_ACTION_COUNT,

      primaryMatrixLaneCount: matrixOutputFiles.length,
      primaryMatrixOutputFileCount: matrixOutputFiles.length,
      primaryMatrixRowCount: sourceAuthorityCandidateRows.length + existingSignalTruthGapRows.length,
      primaryMatrixUniqueCompetitionCount: primaryMatrixSlugs.length,

      sourceAuthorityTemplateCandidateMatrixCompetitionCount: sourceAuthorityMatrixOutput.matrixCompetitionCount,
      sourceAuthorityTemplateCandidateMatrixRowCount: sourceAuthorityMatrixOutput.matrixRowCount,
      existingSignalTruthGapMatrixCompetitionCount: existingSignalMatrixOutput.matrixCompetitionCount,
      existingSignalTruthGapMatrixRowCount: existingSignalMatrixOutput.matrixRowCount,
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
      zeroResultMayImplyAbsenceCount: 0,
      canonicalWriteEligibleNowCount: 0,
      activeAssertedCount: 0,
      inactiveAssertedCount: 0,
      completedAssertedCount: 0,
      canonicalWrites: 0,
      productionWrite: false,

      recommendedNextLane: "run_source_only_primary_candidate_matrices_quality_gate_then_build_source_authority_template_candidate_matrix_executor_plan"
    },
    counts: {
      byMatrixLane: countBy([
        ...sourceAuthorityCandidateRows,
        ...existingSignalTruthGapRows
      ], "matrixLane"),
      bySourceAuthorityCandidateRegion: countBy(sourceAuthorityCandidateRows.flatMap((row) => row.regions.map((region) => ({ region }))), "region"),
      byExistingSignalTruthGapRegion: countBy(existingSignalTruthGapRows.flatMap((row) => row.regions.map((region) => ({ region }))), "region")
    },
    guardrails: [
      "This bundle builds both primary candidate matrices together.",
      "It covers 473 unique competitions: 372 source-authority and 101 existing-signal.",
      "It does not execute fetch/search/write.",
      "It does not assert source discovery, actionable scope, contracts, route, fixture, standings, season-state, active, inactive, or completed truth.",
      "Zero result must not imply absence.",
      "No match today must not imply inactive.",
      "Match status must not be used as season-state truth.",
      "The 42 non-primary active competitions remain in follow-up lanes, not dropped."
    ],
    matrixOutputFiles,
    sourceAuthorityCandidateRows,
    existingSignalTruthGapRows
  };

  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    retainedRawMapCompetitionCount: output.summary.retainedRawMapCompetitionCount,
    competitionCount: output.summary.competitionCount,
    activeExecutionWaveCompetitionCount: output.summary.activeExecutionWaveCompetitionCount,
    scopeAccountingNoActionCompetitionCount: output.summary.scopeAccountingNoActionCompetitionCount,
    primaryMatrixLaneCount: output.summary.primaryMatrixLaneCount,
    primaryMatrixOutputFileCount: output.summary.primaryMatrixOutputFileCount,
    primaryMatrixRowCount: output.summary.primaryMatrixRowCount,
    primaryMatrixUniqueCompetitionCount: output.summary.primaryMatrixUniqueCompetitionCount,
    sourceAuthorityTemplateCandidateMatrixCompetitionCount: output.summary.sourceAuthorityTemplateCandidateMatrixCompetitionCount,
    sourceAuthorityTemplateCandidateMatrixRowCount: output.summary.sourceAuthorityTemplateCandidateMatrixRowCount,
    existingSignalTruthGapMatrixCompetitionCount: output.summary.existingSignalTruthGapMatrixCompetitionCount,
    existingSignalTruthGapMatrixRowCount: output.summary.existingSignalTruthGapMatrixRowCount,
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
