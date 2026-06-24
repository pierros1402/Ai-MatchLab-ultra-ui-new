#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/master-compiler-lane-bundle-2026-06-14/master-compiler-lane-bundle-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/master-compiler-lane-quality-gate-2026-06-14/master-compiler-lane-quality-gate-2026-06-14.json";

const RETAINED_RAW_MAP_COUNT = 689;
const ACTIVE_COMPETITION_COUNT = 515;
const SCOPE_ACCOUNTING_NO_ACTION_COUNT = 174;
const COMPILER_GROUPING_ROW_COUNT = 281;

const EXPECTED_LANE_COUNTS = {
  source_authority_template_compiler_lane: { competitions: 372, groupingRows: 193 },
  existing_signal_truth_review_compiler_lane: { competitions: 101, groupingRows: 80 },
  blocked_source_traceback_compiler_lane: { competitions: 23, groupingRows: 1 },
  generic_validator_ready_followup_lane: { competitions: 6, groupingRows: 3 },
  priority1_reusable_family_repair_lane: { competitions: 6, groupingRows: 1 },
  standings_first_contract_review_lane: { competitions: 2, groupingRows: 1 },
  cup_state_final_winner_review_lane: { competitions: 3, groupingRows: 1 },
  policy_reduction_governance_lane: { competitions: 2, groupingRows: 1 }
};

const LANE_PRIORITY = {
  source_authority_template_compiler_lane: 10,
  existing_signal_truth_review_compiler_lane: 20,
  blocked_source_traceback_compiler_lane: 30,
  generic_validator_ready_followup_lane: 40,
  priority1_reusable_family_repair_lane: 45,
  standings_first_contract_review_lane: 50,
  cup_state_final_winner_review_lane: 55,
  policy_reduction_governance_lane: 60
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

function assertCompilerRowGuardrails(row, lane) {
  const key = row.compilerGroupingKey || "__missing_grouping_key__";

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

function readinessForLane(lane) {
  if (lane === "source_authority_template_compiler_lane") {
    return {
      qualityGateStatus: "passed_ready_for_large_source_authority_template_compiler",
      nextRunner: "build_source_authority_template_compiler_large_batch_for_372_competitions",
      executionClass: "large_batch_primary"
    };
  }

  if (lane === "existing_signal_truth_review_compiler_lane") {
    return {
      qualityGateStatus: "passed_ready_for_large_existing_signal_truth_review_compiler",
      nextRunner: "build_existing_signal_truth_review_compiler_large_batch_for_101_competitions",
      executionClass: "large_batch_primary"
    };
  }

  if (lane === "blocked_source_traceback_compiler_lane") {
    return {
      qualityGateStatus: "passed_ready_for_blocked_source_traceback_compiler",
      nextRunner: "build_blocked_source_traceback_compiler_for_23_competitions",
      executionClass: "governance_followup"
    };
  }

  if (lane === "generic_validator_ready_followup_lane") {
    return {
      qualityGateStatus: "passed_ready_for_generic_validator_ready_followup_compiler",
      nextRunner: "build_generic_validator_ready_followup_compiler_for_6_competitions",
      executionClass: "validator_followup"
    };
  }

  if (lane === "priority1_reusable_family_repair_lane") {
    return {
      qualityGateStatus: "passed_ready_for_priority1_family_repair_compiler",
      nextRunner: "build_priority1_reusable_family_repair_compiler_for_6_competitions",
      executionClass: "repair_followup"
    };
  }

  if (lane === "standings_first_contract_review_lane") {
    return {
      qualityGateStatus: "passed_ready_for_standings_first_review_compiler",
      nextRunner: "build_standings_first_review_compiler_for_2_competitions",
      executionClass: "contract_followup"
    };
  }

  if (lane === "cup_state_final_winner_review_lane") {
    return {
      qualityGateStatus: "passed_ready_for_cup_state_final_winner_review_compiler",
      nextRunner: "build_cup_state_final_winner_review_compiler_for_3_competitions",
      executionClass: "cup_followup"
    };
  }

  if (lane === "policy_reduction_governance_lane") {
    return {
      qualityGateStatus: "passed_ready_for_policy_reduction_governance_compiler",
      nextRunner: "build_policy_reduction_governance_compiler_for_2_competitions",
      executionClass: "policy_governance"
    };
  }

  return {
    qualityGateStatus: "blocked_unknown_compiler_lane",
    nextRunner: "manual_source_only_review_required",
    executionClass: "blocked"
  };
}

function validateLaneFile(fileRow) {
  const lane = fileRow.interpreterLane;
  const expected = EXPECTED_LANE_COUNTS[lane];
  if (!expected) throw new Error(`Unexpected compiler lane: ${lane}`);

  if (!fs.existsSync(fileRow.outputFile)) {
    throw new Error(`Missing compiler output file for ${lane}: ${fileRow.outputFile}`);
  }

  const json = readJson(fileRow.outputFile);
  const summary = json.summary || {};
  const compilerRows = Array.isArray(json.compilerRows) ? json.compilerRows : [];

  if (summary.interpreterLane !== lane) throw new Error(`${lane}: summary.interpreterLane mismatch`);
  if (summary.compilerGroupingRowCount !== expected.groupingRows) {
    throw new Error(`${lane}: expected ${expected.groupingRows} grouping rows, got ${summary.compilerGroupingRowCount}`);
  }

  if (summary.competitionCount !== expected.competitions) {
    throw new Error(`${lane}: expected ${expected.competitions} competitions, got ${summary.competitionCount}`);
  }

  if (compilerRows.length !== expected.groupingRows) {
    throw new Error(`${lane}: expected ${expected.groupingRows} compilerRows, got ${compilerRows.length}`);
  }

  for (const row of compilerRows) assertCompilerRowGuardrails(row, lane);

  const slugs = uniqueSorted(compilerRows.flatMap((row) => row.competitionSlugs || []));
  if (slugs.length !== expected.competitions) {
    throw new Error(`${lane}: expected ${expected.competitions} unique slugs, got ${slugs.length}`);
  }

  if (summary.fetchAllowedNowCount !== 0) throw new Error(`${lane}: fetchAllowedNowCount must be 0`);
  if (summary.searchAllowedNowCount !== 0) throw new Error(`${lane}: searchAllowedNowCount must be 0`);
  if (summary.broadSearchAllowedNowCount !== 0) throw new Error(`${lane}: broadSearchAllowedNowCount must be 0`);
  if (summary.zeroResultMayImplyAbsenceCount !== 0) throw new Error(`${lane}: zeroResultMayImplyAbsenceCount must be 0`);
  if (summary.canonicalWriteEligibleNowCount !== 0) throw new Error(`${lane}: canonicalWriteEligibleNowCount must be 0`);
  if (summary.activeAssertedCount !== 0) throw new Error(`${lane}: activeAssertedCount must be 0`);
  if (summary.inactiveAssertedCount !== 0) throw new Error(`${lane}: inactiveAssertedCount must be 0`);
  if (summary.completedAssertedCount !== 0) throw new Error(`${lane}: completedAssertedCount must be 0`);
  if (summary.canonicalWrites !== 0) throw new Error(`${lane}: canonicalWrites must be 0`);
  if (summary.productionWrite !== false) throw new Error(`${lane}: productionWrite must be false`);

  const readiness = readinessForLane(lane);

  return {
    interpreterLane: lane,
    qualityGateStatus: readiness.qualityGateStatus,
    executionClass: readiness.executionClass,
    nextRunner: readiness.nextRunner,
    inputFile: fileRow.outputFile,
    compilerGroupingRowCount: expected.groupingRows,
    competitionCount: expected.competitions,
    uniqueCompetitionCount: slugs.length,
    slugPrefixCount: Array.isArray(summary.slugPrefixes) ? summary.slugPrefixes.length : 0,
    compilerActions: uniqueSorted(compilerRows.map((row) => row.compilerAction)),
    requiredEvidenceRoles: uniqueSorted(compilerRows.flatMap((row) => row.requiredEvidenceRoles || [])),
    packTypes: uniqueSorted(compilerRows.flatMap((row) => row.packTypes || [])),
    executionWaves: uniqueSorted(compilerRows.flatMap((row) => row.executionWaves || [])),
    sampleCompetitionSlugs: slugs.slice(0, 30),
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
  assertSummary(summary, "compilerLaneCount", 8);
  assertSummary(summary, "compilerOutputFileCount", 8);
  assertSummary(summary, "compilerGroupingRowCount", COMPILER_GROUPING_ROW_COUNT);
  assertSummary(summary, "compilerUniqueCompetitionCount", ACTIVE_COMPETITION_COUNT);
  assertSummary(summary, "sourceAuthorityTemplateCompilerCompetitionCount", 372);
  assertSummary(summary, "sourceAuthorityTemplateCompilerGroupingRowCount", 193);
  assertSummary(summary, "existingSignalTruthReviewCompilerCompetitionCount", 101);
  assertSummary(summary, "existingSignalTruthReviewCompilerGroupingRowCount", 80);
  assertSummary(summary, "blockedSourceTracebackCompilerCompetitionCount", 23);
  assertSummary(summary, "genericValidatorReadyFollowupCompilerCompetitionCount", 6);
  assertSummary(summary, "priority1RepairCompilerCompetitionCount", 6);
  assertSummary(summary, "standingsFirstCompilerCompetitionCount", 2);
  assertSummary(summary, "cupStateCompilerCompetitionCount", 3);
  assertSummary(summary, "policyReductionCompilerCompetitionCount", 2);
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

  const compilerOutputFiles = Array.isArray(bundle.compilerOutputFiles) ? bundle.compilerOutputFiles : [];
  const masterCompilerQueueRows = Array.isArray(bundle.masterCompilerQueueRows) ? bundle.masterCompilerQueueRows : [];

  if (compilerOutputFiles.length !== 8) throw new Error(`Expected 8 compilerOutputFiles, got ${compilerOutputFiles.length}`);
  if (masterCompilerQueueRows.length !== 8) throw new Error(`Expected 8 masterCompilerQueueRows, got ${masterCompilerQueueRows.length}`);

  const qualityGateRows = compilerOutputFiles.map(validateLaneFile).sort((a, b) => {
    const pa = LANE_PRIORITY[a.interpreterLane] || 999;
    const pb = LANE_PRIORITY[b.interpreterLane] || 999;
    if (pa !== pb) return pa - pb;
    return a.interpreterLane.localeCompare(b.interpreterLane);
  });

  const passedRows = qualityGateRows.filter((row) => row.qualityGateStatus.startsWith("passed_"));
  const blockedRows = qualityGateRows.filter((row) => !row.qualityGateStatus.startsWith("passed_"));
  if (passedRows.length !== 8) throw new Error(`Expected 8 passed quality gate lanes, got ${passedRows.length}`);
  if (blockedRows.length !== 0) throw new Error(`Expected 0 blocked quality gate lanes, got ${blockedRows.length}`);

  const totalGroupingRows = qualityGateRows.reduce((sum, row) => sum + row.compilerGroupingRowCount, 0);
  const totalCompetitionRefs = qualityGateRows.reduce((sum, row) => sum + row.competitionCount, 0);

  if (totalGroupingRows !== COMPILER_GROUPING_ROW_COUNT) {
    throw new Error(`Expected ${COMPILER_GROUPING_ROW_COUNT} grouping rows, got ${totalGroupingRows}`);
  }

  if (totalCompetitionRefs !== ACTIVE_COMPETITION_COUNT) {
    throw new Error(`Expected ${ACTIVE_COMPETITION_COUNT} competition refs, got ${totalCompetitionRefs}`);
  }

  const sourceAuthorityRow = qualityGateRows.find((row) => row.interpreterLane === "source_authority_template_compiler_lane");
  const existingSignalRow = qualityGateRows.find((row) => row.interpreterLane === "existing_signal_truth_review_compiler_lane");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "run-football-truth-master-compiler-lane-quality-gate-file",
    mode: "source_only_quality_gate_for_all_8_compiler_lane_outputs_281_grouping_rows_515_competitions_no_fetch_no_search_no_writes_no_truth_assertions",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      masterCompilerLaneBundle: args.input
    },
    summary: {
      retainedRawMapCompetitionCount: RETAINED_RAW_MAP_COUNT,
      competitionCount: RETAINED_RAW_MAP_COUNT,
      activeExecutionWaveCompetitionCount: ACTIVE_COMPETITION_COUNT,
      scopeAccountingNoActionCompetitionCount: SCOPE_ACCOUNTING_NO_ACTION_COUNT,

      qualityGateLaneCount: qualityGateRows.length,
      qualityGatePassedLaneCount: passedRows.length,
      qualityGateBlockedLaneCount: blockedRows.length,
      qualityGateCompilerGroupingRowCount: totalGroupingRows,
      qualityGateCompetitionReferenceCount: totalCompetitionRefs,

      sourceAuthorityTemplateQualityGateStatus: sourceAuthorityRow?.qualityGateStatus || null,
      sourceAuthorityTemplateCompetitionCount: sourceAuthorityRow?.competitionCount || 0,
      sourceAuthorityTemplateGroupingRowCount: sourceAuthorityRow?.compilerGroupingRowCount || 0,
      existingSignalTruthReviewQualityGateStatus: existingSignalRow?.qualityGateStatus || null,
      existingSignalTruthReviewCompetitionCount: existingSignalRow?.competitionCount || 0,
      existingSignalTruthReviewGroupingRowCount: existingSignalRow?.compilerGroupingRowCount || 0,

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
      recommendedNextLane: "build_source_authority_template_compiler_large_batch_for_372_competitions_then_existing_signal_truth_review_compiler_for_101_competitions"
    },
    counts: {
      byQualityGateStatus: countBy(qualityGateRows, "qualityGateStatus"),
      byExecutionClass: countBy(qualityGateRows, "executionClass"),
      byInterpreterLane: countBy(qualityGateRows, "interpreterLane")
    },
    guardrails: [
      "This quality gate covers all 8 compiler lane output files together.",
      "It verifies all 281 compiler grouping rows and all 515 active execution-wave competitions.",
      "It does not execute compiler truth logic.",
      "It does not fetch, search, or write canonical/production data.",
      "Zero result must not imply absence.",
      "No match today must not imply inactive.",
      "Match status must not be used as season-state truth.",
      "All active/inactive/completed/actionable/route/fixture/standings/season-state truth assertions remain prohibited here."
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
    qualityGateLaneCount: output.summary.qualityGateLaneCount,
    qualityGatePassedLaneCount: output.summary.qualityGatePassedLaneCount,
    qualityGateBlockedLaneCount: output.summary.qualityGateBlockedLaneCount,
    qualityGateCompilerGroupingRowCount: output.summary.qualityGateCompilerGroupingRowCount,
    qualityGateCompetitionReferenceCount: output.summary.qualityGateCompetitionReferenceCount,
    sourceAuthorityTemplateQualityGateStatus: output.summary.sourceAuthorityTemplateQualityGateStatus,
    sourceAuthorityTemplateCompetitionCount: output.summary.sourceAuthorityTemplateCompetitionCount,
    sourceAuthorityTemplateGroupingRowCount: output.summary.sourceAuthorityTemplateGroupingRowCount,
    existingSignalTruthReviewQualityGateStatus: output.summary.existingSignalTruthReviewQualityGateStatus,
    existingSignalTruthReviewCompetitionCount: output.summary.existingSignalTruthReviewCompetitionCount,
    existingSignalTruthReviewGroupingRowCount: output.summary.existingSignalTruthReviewGroupingRowCount,
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
