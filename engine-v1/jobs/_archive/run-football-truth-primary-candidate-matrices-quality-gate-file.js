#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/primary-candidate-matrices-bundle-2026-06-14/primary-candidate-matrices-bundle-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/primary-candidate-matrices-quality-gate-2026-06-14/primary-candidate-matrices-quality-gate-2026-06-14.json";

const RETAINED_RAW_MAP_COUNT = 689;
const ACTIVE_COMPETITION_COUNT = 515;
const SCOPE_ACCOUNTING_NO_ACTION_COUNT = 174;
const PRIMARY_MATRIX_COMPETITION_COUNT = 473;
const REMAINING_FOLLOWUP_COUNT = 42;

const EXPECTED_MATRICES = {
  source_authority_template_candidate_matrix: {
    rows: 193,
    competitions: 372,
    gateStatus: "passed_ready_for_source_authority_template_candidate_matrix_executor_plan",
    nextRunner: "build_source_authority_template_candidate_matrix_executor_plan_for_372_competitions"
  },
  existing_signal_truth_gap_matrix: {
    rows: 80,
    competitions: 101,
    gateStatus: "passed_ready_for_existing_signal_truth_gap_matrix_executor_plan",
    nextRunner: "build_existing_signal_truth_gap_matrix_executor_plan_for_101_competitions"
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

function assertMatrixRowGuardrails(row, matrixLane) {
  const key =
    row.compilerGroupingKey ||
    row.sourceAuthorityTemplateKey ||
    row.existingSignalReviewKey ||
    "__missing_key__";

  if (row.matrixLane !== matrixLane) throw new Error(`${matrixLane}/${key}: matrixLane mismatch`);
  if (row.sourceOnly !== true) throw new Error(`${matrixLane}/${key}: sourceOnly must be true`);
  if (row.fetchAllowedNow !== false) throw new Error(`${matrixLane}/${key}: fetchAllowedNow must be false`);
  if (row.searchAllowedNow !== false) throw new Error(`${matrixLane}/${key}: searchAllowedNow must be false`);
  if (row.broadSearchAllowedNow !== false) throw new Error(`${matrixLane}/${key}: broadSearchAllowedNow must be false`);
  if (row.zeroResultMayImplyAbsence !== false) throw new Error(`${matrixLane}/${key}: zeroResultMayImplyAbsence must be false`);
  if (row.canonicalWriteEligibleNow !== false) throw new Error(`${matrixLane}/${key}: canonicalWriteEligibleNow must be false`);
  if (row.productionWrite !== false) throw new Error(`${matrixLane}/${key}: productionWrite must be false`);
  if (row.truthAssertionsAllowedNow !== false) throw new Error(`${matrixLane}/${key}: truthAssertionsAllowedNow must be false`);
  if (row.activeAssertedNow !== false) throw new Error(`${matrixLane}/${key}: activeAssertedNow must be false`);
  if (row.inactiveAssertedNow !== false) throw new Error(`${matrixLane}/${key}: inactiveAssertedNow must be false`);
  if (row.completedAssertedNow !== false) throw new Error(`${matrixLane}/${key}: completedAssertedNow must be false`);

  if (!Array.isArray(row.competitionSlugs) || row.competitionSlugs.length < 1) {
    throw new Error(`${matrixLane}/${key}: competitionSlugs must be non-empty`);
  }

  if (!Array.isArray(row.requiredEvidenceRoles) || row.requiredEvidenceRoles.length < 1) {
    throw new Error(`${matrixLane}/${key}: requiredEvidenceRoles must be non-empty`);
  }

  if (!Array.isArray(row.regions) || row.regions.length < 1) {
    throw new Error(`${matrixLane}/${key}: regions must be non-empty`);
  }

  if (!Array.isArray(row.slugPrefixes) || row.slugPrefixes.length < 1) {
    throw new Error(`${matrixLane}/${key}: slugPrefixes must be non-empty`);
  }

  if (matrixLane === "source_authority_template_candidate_matrix") {
    if (row.controlledDiscoveryAllowedNow !== false) {
      throw new Error(`${matrixLane}/${key}: controlledDiscoveryAllowedNow must be false`);
    }
    if (row.sourcePresenceAssertedNow !== false) {
      throw new Error(`${matrixLane}/${key}: sourcePresenceAssertedNow must be false`);
    }
    if (row.sourceAbsenceAssertedNow !== false) {
      throw new Error(`${matrixLane}/${key}: sourceAbsenceAssertedNow must be false`);
    }
    if (!Array.isArray(row.candidateColumns) || row.candidateColumns.length < 1) {
      throw new Error(`${matrixLane}/${key}: candidateColumns must be non-empty`);
    }
  }

  if (matrixLane === "existing_signal_truth_gap_matrix") {
    if (row.canonicalPromotionAllowedNow !== false) {
      throw new Error(`${matrixLane}/${key}: canonicalPromotionAllowedNow must be false`);
    }
    if (row.routeTruthAssertedNow !== false) {
      throw new Error(`${matrixLane}/${key}: routeTruthAssertedNow must be false`);
    }
    if (row.fixtureTruthAssertedNow !== false) {
      throw new Error(`${matrixLane}/${key}: fixtureTruthAssertedNow must be false`);
    }
    if (row.standingsTruthAssertedNow !== false) {
      throw new Error(`${matrixLane}/${key}: standingsTruthAssertedNow must be false`);
    }
    if (row.seasonStateTruthAssertedNow !== false) {
      throw new Error(`${matrixLane}/${key}: seasonStateTruthAssertedNow must be false`);
    }
    if (!Array.isArray(row.truthGapColumns) || row.truthGapColumns.length < 1) {
      throw new Error(`${matrixLane}/${key}: truthGapColumns must be non-empty`);
    }
  }
}

function validateMatrixFile(fileRow) {
  const matrixLane = fileRow.matrixLane;
  const expected = EXPECTED_MATRICES[matrixLane];

  if (!expected) throw new Error(`Unexpected matrix lane: ${matrixLane}`);
  if (!fs.existsSync(fileRow.outputFile)) throw new Error(`Missing matrix output file: ${fileRow.outputFile}`);

  const json = readJson(fileRow.outputFile);
  const summary = json.summary || {};
  const rows = Array.isArray(json.rows) ? json.rows : [];

  if (summary.matrixLane !== matrixLane) {
    throw new Error(`${matrixLane}: summary.matrixLane mismatch`);
  }

  if (summary.matrixRowCount !== expected.rows) {
    throw new Error(`${matrixLane}: expected ${expected.rows} matrix rows, got ${summary.matrixRowCount}`);
  }

  if (summary.matrixCompetitionCount !== expected.competitions) {
    throw new Error(`${matrixLane}: expected ${expected.competitions} competitions, got ${summary.matrixCompetitionCount}`);
  }

  if (summary.matrixUniqueCompetitionCount !== expected.competitions) {
    throw new Error(`${matrixLane}: expected ${expected.competitions} unique competitions, got ${summary.matrixUniqueCompetitionCount}`);
  }

  if (rows.length !== expected.rows) {
    throw new Error(`${matrixLane}: expected ${expected.rows} rows, got ${rows.length}`);
  }

  assertZeroTruthAndWriteSummary(summary, matrixLane);

  for (const row of rows) assertMatrixRowGuardrails(row, matrixLane);

  const uniqueSlugs = uniqueSorted(rows.flatMap((row) => row.competitionSlugs || []));
  if (uniqueSlugs.length !== expected.competitions) {
    throw new Error(`${matrixLane}: expected ${expected.competitions} unique row slugs, got ${uniqueSlugs.length}`);
  }

  return {
    matrixLane,
    qualityGateStatus: expected.gateStatus,
    nextRunner: expected.nextRunner,
    inputFile: fileRow.outputFile,
    matrixRowCount: expected.rows,
    matrixCompetitionCount: expected.competitions,
    matrixUniqueCompetitionCount: uniqueSlugs.length,
    slugPrefixCount: uniqueSorted(rows.flatMap((row) => row.slugPrefixes || [])).length,
    regionCount: uniqueSorted(rows.flatMap((row) => row.regions || [])).length,
    requiredEvidenceRoleCount: uniqueSorted(rows.flatMap((row) => row.requiredEvidenceRoles || [])).length,
    regions: uniqueSorted(rows.flatMap((row) => row.regions || [])),
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
  assertSummary(summary, "primaryMatrixLaneCount", 2);
  assertSummary(summary, "primaryMatrixOutputFileCount", 2);
  assertSummary(summary, "primaryMatrixRowCount", 273);
  assertSummary(summary, "primaryMatrixUniqueCompetitionCount", PRIMARY_MATRIX_COMPETITION_COUNT);
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

  const matrixOutputFiles = Array.isArray(bundle.matrixOutputFiles) ? bundle.matrixOutputFiles : [];
  if (matrixOutputFiles.length !== 2) {
    throw new Error(`Expected 2 matrix output files, got ${matrixOutputFiles.length}`);
  }

  const qualityGateRows = matrixOutputFiles
    .map(validateMatrixFile)
    .sort((a, b) => a.matrixLane.localeCompare(b.matrixLane));

  const passedRows = qualityGateRows.filter((row) => row.qualityGateStatus.startsWith("passed_"));
  const blockedRows = qualityGateRows.filter((row) => !row.qualityGateStatus.startsWith("passed_"));

  if (passedRows.length !== 2) throw new Error(`Expected 2 passed matrix lanes, got ${passedRows.length}`);
  if (blockedRows.length !== 0) throw new Error(`Expected 0 blocked matrix lanes, got ${blockedRows.length}`);

  const sourceAuthorityRow = qualityGateRows.find((row) =>
    row.matrixLane === "source_authority_template_candidate_matrix"
  );
  const existingSignalRow = qualityGateRows.find((row) =>
    row.matrixLane === "existing_signal_truth_gap_matrix"
  );

  const totalMatrixRows = qualityGateRows.reduce((sum, row) => sum + row.matrixRowCount, 0);
  const totalCompetitionRefs = qualityGateRows.reduce((sum, row) => sum + row.matrixCompetitionCount, 0);

  if (totalMatrixRows !== 273) throw new Error(`Expected 273 matrix rows, got ${totalMatrixRows}`);
  if (totalCompetitionRefs !== 473) throw new Error(`Expected 473 competition refs, got ${totalCompetitionRefs}`);

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "run-football-truth-primary-candidate-matrices-quality-gate-file",
    mode: "source_only_quality_gate_for_primary_candidate_matrices_473_competitions_no_fetch_no_search_no_writes_no_truth_assertions",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      primaryCandidateMatricesBundle: args.input
    },
    summary: {
      retainedRawMapCompetitionCount: RETAINED_RAW_MAP_COUNT,
      competitionCount: RETAINED_RAW_MAP_COUNT,
      activeExecutionWaveCompetitionCount: ACTIVE_COMPETITION_COUNT,
      scopeAccountingNoActionCompetitionCount: SCOPE_ACCOUNTING_NO_ACTION_COUNT,

      primaryMatrixQualityGateLaneCount: qualityGateRows.length,
      primaryMatrixQualityGatePassedLaneCount: passedRows.length,
      primaryMatrixQualityGateBlockedLaneCount: blockedRows.length,
      primaryMatrixQualityGateRowCount: totalMatrixRows,
      primaryMatrixQualityGateCompetitionReferenceCount: totalCompetitionRefs,

      sourceAuthorityTemplateCandidateMatrixQualityGateStatus: sourceAuthorityRow?.qualityGateStatus || null,
      sourceAuthorityTemplateCandidateMatrixCompetitionCount: sourceAuthorityRow?.matrixCompetitionCount || 0,
      sourceAuthorityTemplateCandidateMatrixRowCount: sourceAuthorityRow?.matrixRowCount || 0,
      existingSignalTruthGapMatrixQualityGateStatus: existingSignalRow?.qualityGateStatus || null,
      existingSignalTruthGapMatrixCompetitionCount: existingSignalRow?.matrixCompetitionCount || 0,
      existingSignalTruthGapMatrixRowCount: existingSignalRow?.matrixRowCount || 0,
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

      firstRecommendedRunner: sourceAuthorityRow?.nextRunner || null,
      secondRecommendedRunner: existingSignalRow?.nextRunner || null,
      recommendedNextLane: "build_source_authority_template_candidate_matrix_executor_plan_for_372_competitions_then_existing_signal_truth_gap_executor_plan_for_101_competitions"
    },
    counts: {
      byMatrixLane: countBy(qualityGateRows, "matrixLane"),
      byQualityGateStatus: countBy(qualityGateRows, "qualityGateStatus")
    },
    guardrails: [
      "This quality gate covers both primary candidate matrix outputs together.",
      "It validates 473 primary competition references from 273 matrix rows.",
      "It does not execute fetch/search/write.",
      "It does not assert source discovery, actionable scope, contracts, route, fixture, standings, season-state, active, inactive, or completed truth.",
      "Controlled discovery remains disabled here.",
      "Canonical promotion remains disabled here.",
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
    primaryMatrixQualityGateLaneCount: output.summary.primaryMatrixQualityGateLaneCount,
    primaryMatrixQualityGatePassedLaneCount: output.summary.primaryMatrixQualityGatePassedLaneCount,
    primaryMatrixQualityGateBlockedLaneCount: output.summary.primaryMatrixQualityGateBlockedLaneCount,
    primaryMatrixQualityGateRowCount: output.summary.primaryMatrixQualityGateRowCount,
    primaryMatrixQualityGateCompetitionReferenceCount: output.summary.primaryMatrixQualityGateCompetitionReferenceCount,
    sourceAuthorityTemplateCandidateMatrixQualityGateStatus: output.summary.sourceAuthorityTemplateCandidateMatrixQualityGateStatus,
    sourceAuthorityTemplateCandidateMatrixCompetitionCount: output.summary.sourceAuthorityTemplateCandidateMatrixCompetitionCount,
    sourceAuthorityTemplateCandidateMatrixRowCount: output.summary.sourceAuthorityTemplateCandidateMatrixRowCount,
    existingSignalTruthGapMatrixQualityGateStatus: output.summary.existingSignalTruthGapMatrixQualityGateStatus,
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
    firstRecommendedRunner: output.summary.firstRecommendedRunner,
    secondRecommendedRunner: output.summary.secondRecommendedRunner,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
