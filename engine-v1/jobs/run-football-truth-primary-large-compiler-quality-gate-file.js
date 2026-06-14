#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/primary-large-compiler-bundle-2026-06-14/primary-large-compiler-bundle-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/primary-large-compiler-quality-gate-2026-06-14/primary-large-compiler-quality-gate-2026-06-14.json";

const RETAINED_RAW_MAP_COUNT = 689;
const ACTIVE_COMPETITION_COUNT = 515;
const SCOPE_ACCOUNTING_NO_ACTION_COUNT = 174;
const PRIMARY_UNIQUE_COMPETITION_COUNT = 473;

const EXPECTED_LANES = {
  source_authority_template_compiler_lane: {
    rows: 193,
    competitions: 372,
    outputStatus: "passed_ready_for_source_authority_template_candidate_matrix",
    nextRunner: "build_source_authority_template_candidate_matrix_for_372_competitions"
  },
  existing_signal_truth_review_compiler_lane: {
    rows: 80,
    competitions: 101,
    outputStatus: "passed_ready_for_existing_signal_truth_gap_matrix",
    nextRunner: "build_existing_signal_truth_gap_matrix_for_101_competitions"
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

function assertZeroTruthAndWriteSummary(summary, label) {
  const checks = [
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

  for (const [key, expected] of checks) {
    if (summary[key] !== expected) {
      throw new Error(`${label}: expected ${key}=${expected}, got ${summary[key]}`);
    }
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

  if (!Array.isArray(row.regions) || row.regions.length < 1) {
    throw new Error(`${lane}/${key}: regions must be non-empty`);
  }

  if (!Array.isArray(row.slugPrefixes) || row.slugPrefixes.length < 1) {
    throw new Error(`${lane}/${key}: slugPrefixes must be non-empty`);
  }
}

function validatePrimaryOutputFile(fileRow) {
  const lane = fileRow.primaryCompilerLane;
  const expected = EXPECTED_LANES[lane];

  if (!expected) throw new Error(`Unexpected primary compiler lane: ${lane}`);
  if (!fs.existsSync(fileRow.outputFile)) throw new Error(`Missing primary compiler output file: ${fileRow.outputFile}`);

  const json = readJson(fileRow.outputFile);
  const summary = json.summary || {};
  const compiledRows = Array.isArray(json.compiledRows) ? json.compiledRows : [];

  if (summary.primaryCompilerLane !== lane) {
    throw new Error(`${lane}: summary.primaryCompilerLane mismatch`);
  }

  if (summary.compiledRowCount !== expected.rows) {
    throw new Error(`${lane}: expected ${expected.rows} compiled rows, got ${summary.compiledRowCount}`);
  }

  if (summary.compiledCompetitionCount !== expected.competitions) {
    throw new Error(`${lane}: expected ${expected.competitions} competitions, got ${summary.compiledCompetitionCount}`);
  }

  if (summary.compiledUniqueCompetitionCount !== expected.competitions) {
    throw new Error(`${lane}: expected ${expected.competitions} unique competitions, got ${summary.compiledUniqueCompetitionCount}`);
  }

  if (compiledRows.length !== expected.rows) {
    throw new Error(`${lane}: expected ${expected.rows} compiledRows, got ${compiledRows.length}`);
  }

  assertZeroTruthAndWriteSummary(summary, lane);

  for (const row of compiledRows) assertCompiledRowGuardrails(row, lane);

  const uniqueSlugs = uniqueSorted(compiledRows.flatMap((row) => row.competitionSlugs || []));
  if (uniqueSlugs.length !== expected.competitions) {
    throw new Error(`${lane}: expected ${expected.competitions} unique row slugs, got ${uniqueSlugs.length}`);
  }

  return {
    primaryCompilerLane: lane,
    qualityGateStatus: expected.outputStatus,
    nextRunner: expected.nextRunner,
    inputFile: fileRow.outputFile,
    compiledRowCount: expected.rows,
    compiledCompetitionCount: expected.competitions,
    compiledUniqueCompetitionCount: uniqueSlugs.length,
    slugPrefixCount: uniqueSorted(compiledRows.flatMap((row) => row.slugPrefixes || [])).length,
    regionCount: uniqueSorted(compiledRows.flatMap((row) => row.regions || [])).length,
    requiredEvidenceRoleCount: uniqueSorted(compiledRows.flatMap((row) => row.requiredEvidenceRoles || [])).length,
    nextSourceOnlyActions: uniqueSorted(compiledRows.map((row) => row.nextSourceOnlyAction)),
    regions: uniqueSorted(compiledRows.flatMap((row) => row.regions || [])),
    sampleCompetitionSlugs: uniqueSlugs.slice(0, 40),
    sourceOnly: true,
    fetchAllowedNow: false,
    searchAllowedNow: false,
    broadSearchAllowedNow: false,
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
  assertSummary(summary, "primaryCompilerLaneCount", 2);
  assertSummary(summary, "primaryCompilerOutputFileCount", 2);
  assertSummary(summary, "primaryCompiledRowCount", 273);
  assertSummary(summary, "primaryCompiledUniqueCompetitionCount", PRIMARY_UNIQUE_COMPETITION_COUNT);
  assertSummary(summary, "sourceAuthorityTemplateCompiledCompetitionCount", 372);
  assertSummary(summary, "sourceAuthorityTemplateCompiledRowCount", 193);
  assertSummary(summary, "existingSignalTruthReviewCompiledCompetitionCount", 101);
  assertSummary(summary, "existingSignalTruthReviewCompiledRowCount", 80);
  assertSummary(summary, "remainingFollowupLaneCompetitionCount", 42);
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

  const primaryCompilerOutputFiles = Array.isArray(bundle.primaryCompilerOutputFiles)
    ? bundle.primaryCompilerOutputFiles
    : [];

  if (primaryCompilerOutputFiles.length !== 2) {
    throw new Error(`Expected 2 primary compiler output files, got ${primaryCompilerOutputFiles.length}`);
  }

  const qualityGateRows = primaryCompilerOutputFiles
    .map(validatePrimaryOutputFile)
    .sort((a, b) => a.primaryCompilerLane.localeCompare(b.primaryCompilerLane));

  const passedRows = qualityGateRows.filter((row) => row.qualityGateStatus.startsWith("passed_"));
  const blockedRows = qualityGateRows.filter((row) => !row.qualityGateStatus.startsWith("passed_"));

  if (passedRows.length !== 2) throw new Error(`Expected 2 passed primary lanes, got ${passedRows.length}`);
  if (blockedRows.length !== 0) throw new Error(`Expected 0 blocked primary lanes, got ${blockedRows.length}`);

  const sourceAuthorityRow = qualityGateRows.find((row) =>
    row.primaryCompilerLane === "source_authority_template_compiler_lane"
  );
  const existingSignalRow = qualityGateRows.find((row) =>
    row.primaryCompilerLane === "existing_signal_truth_review_compiler_lane"
  );

  const totalCompiledRows = qualityGateRows.reduce((sum, row) => sum + row.compiledRowCount, 0);
  const totalCompetitionRefs = qualityGateRows.reduce((sum, row) => sum + row.compiledCompetitionCount, 0);

  if (totalCompiledRows !== 273) throw new Error(`Expected 273 total compiled rows, got ${totalCompiledRows}`);
  if (totalCompetitionRefs !== 473) throw new Error(`Expected 473 total competition refs, got ${totalCompetitionRefs}`);

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "run-football-truth-primary-large-compiler-quality-gate-file",
    mode: "source_only_quality_gate_for_primary_large_compiler_outputs_473_competitions_no_fetch_no_search_no_writes_no_truth_assertions",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      primaryLargeCompilerBundle: args.input
    },
    summary: {
      retainedRawMapCompetitionCount: RETAINED_RAW_MAP_COUNT,
      competitionCount: RETAINED_RAW_MAP_COUNT,
      activeExecutionWaveCompetitionCount: ACTIVE_COMPETITION_COUNT,
      scopeAccountingNoActionCompetitionCount: SCOPE_ACCOUNTING_NO_ACTION_COUNT,

      primaryQualityGateLaneCount: qualityGateRows.length,
      primaryQualityGatePassedLaneCount: passedRows.length,
      primaryQualityGateBlockedLaneCount: blockedRows.length,
      primaryQualityGateCompiledRowCount: totalCompiledRows,
      primaryQualityGateCompetitionReferenceCount: totalCompetitionRefs,

      sourceAuthorityTemplateQualityGateStatus: sourceAuthorityRow?.qualityGateStatus || null,
      sourceAuthorityTemplateCompiledCompetitionCount: sourceAuthorityRow?.compiledCompetitionCount || 0,
      sourceAuthorityTemplateCompiledRowCount: sourceAuthorityRow?.compiledRowCount || 0,
      existingSignalTruthReviewQualityGateStatus: existingSignalRow?.qualityGateStatus || null,
      existingSignalTruthReviewCompiledCompetitionCount: existingSignalRow?.compiledCompetitionCount || 0,
      existingSignalTruthReviewCompiledRowCount: existingSignalRow?.compiledRowCount || 0,
      remainingFollowupLaneCompetitionCount: 42,

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

      firstRecommendedRunner: sourceAuthorityRow?.nextRunner || null,
      secondRecommendedRunner: existingSignalRow?.nextRunner || null,
      recommendedNextLane: "build_source_authority_template_candidate_matrix_for_372_competitions_then_existing_signal_truth_gap_matrix_for_101_competitions"
    },
    counts: {
      byPrimaryCompilerLane: countBy(qualityGateRows, "primaryCompilerLane"),
      byQualityGateStatus: countBy(qualityGateRows, "qualityGateStatus")
    },
    guardrails: [
      "This quality gate covers both primary large compiler outputs together.",
      "It validates 473 primary competition references from 273 compiled rows.",
      "It does not execute fetch/search/write.",
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
    primaryQualityGateLaneCount: output.summary.primaryQualityGateLaneCount,
    primaryQualityGatePassedLaneCount: output.summary.primaryQualityGatePassedLaneCount,
    primaryQualityGateBlockedLaneCount: output.summary.primaryQualityGateBlockedLaneCount,
    primaryQualityGateCompiledRowCount: output.summary.primaryQualityGateCompiledRowCount,
    primaryQualityGateCompetitionReferenceCount: output.summary.primaryQualityGateCompetitionReferenceCount,
    sourceAuthorityTemplateQualityGateStatus: output.summary.sourceAuthorityTemplateQualityGateStatus,
    sourceAuthorityTemplateCompiledCompetitionCount: output.summary.sourceAuthorityTemplateCompiledCompetitionCount,
    sourceAuthorityTemplateCompiledRowCount: output.summary.sourceAuthorityTemplateCompiledRowCount,
    existingSignalTruthReviewQualityGateStatus: output.summary.existingSignalTruthReviewQualityGateStatus,
    existingSignalTruthReviewCompiledCompetitionCount: output.summary.existingSignalTruthReviewCompiledCompetitionCount,
    existingSignalTruthReviewCompiledRowCount: output.summary.existingSignalTruthReviewCompiledRowCount,
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
    firstRecommendedRunner: output.summary.firstRecommendedRunner,
    secondRecommendedRunner: output.summary.secondRecommendedRunner,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
