#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/workstream-result-interpreter-2026-06-14/workstream-result-interpreter-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/master-compiler-lane-bundle-2026-06-14/master-compiler-lane-bundle-2026-06-14.json";

const RETAINED_RAW_MAP_COUNT = 689;
const ACTIVE_COMPETITION_COUNT = 515;
const SCOPE_ACCOUNTING_NO_ACTION_COUNT = 174;
const GROUPING_KEY_COUNT = 281;

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

function safeFilePart(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function compilerActionForLane(lane) {
  const map = {
    source_authority_template_compiler_lane:
      "compile_source_authority_template_requirements_by_grouping_key_no_discovery_execution",
    existing_signal_truth_review_compiler_lane:
      "compile_existing_signal_truth_review_requirements_by_grouping_key_no_truth_assertion",
    blocked_source_traceback_compiler_lane:
      "compile_blocked_source_traceback_requirements_not_absence",
    generic_validator_ready_followup_lane:
      "compile_generic_validator_ready_followup_requirements_no_contract_validation",
    priority1_reusable_family_repair_lane:
      "compile_priority1_reusable_family_repair_requirements_no_canonical_write",
    standings_first_contract_review_lane:
      "compile_standings_first_review_requirements_no_fixture_or_state_assertion",
    cup_state_final_winner_review_lane:
      "compile_cup_state_final_winner_review_requirements_no_canonical_write",
    policy_reduction_governance_lane:
      "compile_policy_reduction_governance_requirements_no_scope_delete"
  };

  return map[lane] || "compile_unknown_lane_source_only_requirements";
}

function requiredEvidenceRolesForLane(lane) {
  if (lane === "source_authority_template_compiler_lane") {
    return [
      "official_or_high_trust_source_authority_candidate",
      "competition_identity_mapping",
      "fixture_route_candidate",
      "standings_route_candidate",
      "season_state_route_candidate",
      "restart_or_start_date_evidence_when_completed_inactive_or_near_finish"
    ];
  }

  if (lane === "existing_signal_truth_review_compiler_lane") {
    return [
      "existing_signal_source_trace",
      "route_evidence_trace",
      "fixture_or_result_signal_trace",
      "standings_signal_trace",
      "season_state_signal_trace",
      "truth_gap_classification"
    ];
  }

  if (lane === "blocked_source_traceback_compiler_lane") {
    return [
      "upstream_source_traceback",
      "diagnostic_echo_detection",
      "blocked_reason_preservation",
      "absence_not_asserted"
    ];
  }

  if (lane === "generic_validator_ready_followup_lane") {
    return [
      "configured_family_route_selector",
      "configured_family_fixture_selector",
      "configured_family_standings_selector",
      "configured_family_season_state_selector",
      "validation_runner_required_but_not_executed_now"
    ];
  }

  if (lane === "priority1_reusable_family_repair_lane") {
    return [
      "reusable_family_missing_role",
      "family_repair_source_file_trace",
      "contract_review_scope",
      "no_canonical_write"
    ];
  }

  if (lane === "standings_first_contract_review_lane") {
    return [
      "standings_table_selector",
      "expected_table_shape",
      "source_route_trace",
      "fixture_and_season_state_not_asserted"
    ];
  }

  if (lane === "cup_state_final_winner_review_lane") {
    return [
      "cup_final_or_winner_evidence",
      "trusted_source_trace",
      "final_state_not_written_now"
    ];
  }

  if (lane === "policy_reduction_governance_lane") {
    return [
      "policy_reason_candidate",
      "scope_preservation",
      "no_delete_no_suppress_now"
    ];
  }

  return ["source_only_review_required"];
}

function buildCompilerRows(groupingRows) {
  return groupingRows.map((row) => {
    const lane = row.interpreterLane;
    const competitionSlugs = uniqueSorted(row.competitionSlugs || []);
    const slugPrefixes = uniqueSorted(row.slugPrefixes || []);

    return {
      compilerGroupingKey: row.runnerGroupingKey,
      workstream: row.workstream,
      interpreterLane: lane,
      compilerPriority: LANE_PRIORITY[lane] || 999,
      nextSourceOnlyCompiler: row.nextSourceOnlyCompiler,
      compilerAction: compilerActionForLane(lane),
      requiredEvidenceRoles: requiredEvidenceRolesForLane(lane),
      competitionCount: competitionSlugs.length,
      competitionSlugs,
      executionWaves: uniqueSorted(row.executionWaves || []),
      packTypes: uniqueSorted(row.packTypes || []),
      slugPrefixes,
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
    if (a.compilerPriority !== b.compilerPriority) return a.compilerPriority - b.compilerPriority;
    if (a.workstream !== b.workstream) return a.workstream.localeCompare(b.workstream);
    if (b.competitionCount !== a.competitionCount) return b.competitionCount - a.competitionCount;
    return a.compilerGroupingKey.localeCompare(b.compilerGroupingKey);
  });
}

function writeCompilerOutputFiles({ outputDir, date, compilerRows }) {
  const groups = new Map();

  for (const row of compilerRows) {
    if (!groups.has(row.interpreterLane)) groups.set(row.interpreterLane, []);
    groups.get(row.interpreterLane).push(row);
  }

  const files = [];

  for (const [lane, rows] of groups.entries()) {
    const orderedRows = rows.sort((a, b) => {
      if (b.competitionCount !== a.competitionCount) return b.competitionCount - a.competitionCount;
      return a.compilerGroupingKey.localeCompare(b.compilerGroupingKey);
    });

    const filePath = path.join(
      outputDir,
      `master-compiler-lane-output-${safeFilePart(lane)}-${date}.json`
    ).replaceAll("\\", "/");

    const uniqueSlugs = uniqueSorted(orderedRows.flatMap((row) => row.competitionSlugs));
    const output = {
      generatedAt: new Date().toISOString(),
      date,
      job: "build-football-truth-master-compiler-lane-bundle-file",
      mode: "source_only_per_compiler_lane_output_no_fetch_no_search_no_writes_no_truth_assertions",
      interpreterLane: lane,
      sourceFetch: false,
      searchProviderUsed: false,
      broadSearchUsed: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      summary: {
        interpreterLane: lane,
        workstreams: uniqueSorted(orderedRows.map((row) => row.workstream)),
        compilerGroupingRowCount: orderedRows.length,
        competitionCount: uniqueSlugs.length,
        compilerGroupingKeys: uniqueSorted(orderedRows.map((row) => row.compilerGroupingKey)),
        slugPrefixes: uniqueSorted(orderedRows.flatMap((row) => row.slugPrefixes)),
        packTypes: uniqueSorted(orderedRows.flatMap((row) => row.packTypes)),
        executionWaves: uniqueSorted(orderedRows.flatMap((row) => row.executionWaves)),
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
      guardrails: [
        "This is a compiler-lane source-only output.",
        "No fetch/search/write/truth assertion is performed.",
        "Zero result must not imply absence.",
        "No match today must not imply inactive.",
        "Match status must not be used as season-state truth.",
        "Completed/inactive/near-finish competitions require trusted restart/start evidence when available before daily scheduling decisions."
      ],
      compilerRows: orderedRows
    };

    fs.writeFileSync(filePath, stableJson(output));

    files.push({
      interpreterLane: lane,
      workstreams: output.summary.workstreams,
      priority: LANE_PRIORITY[lane] || 999,
      outputFile: filePath,
      compilerGroupingRowCount: orderedRows.length,
      competitionCount: uniqueSlugs.length,
      slugPrefixCount: output.summary.slugPrefixes.length,
      fetchAllowedNow: false,
      searchAllowedNow: false,
      broadSearchAllowedNow: false,
      zeroResultMayImplyAbsence: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false
    });
  }

  return files.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return a.interpreterLane.localeCompare(b.interpreterLane);
  });
}

function main() {
  const args = parseArgs(process.argv);
  const interpreter = readJson(args.input);
  const summary = interpreter.summary || {};

  assertSummary(summary, "retainedRawMapCompetitionCount", RETAINED_RAW_MAP_COUNT);
  assertSummary(summary, "competitionCount", RETAINED_RAW_MAP_COUNT);
  assertSummary(summary, "activeExecutionWaveCompetitionCount", ACTIVE_COMPETITION_COUNT);
  assertSummary(summary, "scopeAccountingNoActionCompetitionCount", SCOPE_ACCOUNTING_NO_ACTION_COUNT);
  assertSummary(summary, "interpretedRunnerRowCount", ACTIVE_COMPETITION_COUNT);
  assertSummary(summary, "interpretedUniqueCompetitionCount", ACTIVE_COMPETITION_COUNT);
  assertSummary(summary, "interpretedWorkstreamCount", 8);
  assertSummary(summary, "interpretedGroupingKeyCount", GROUPING_KEY_COUNT);
  assertSummary(summary, "sourceAuthorityTemplateCompilerCompetitionCount", 372);
  assertSummary(summary, "existingSignalTruthReviewCompilerCompetitionCount", 101);
  assertSummary(summary, "blockedSourceTracebackCompilerCompetitionCount", 23);
  assertSummary(summary, "genericValidatorReadyFollowupCompilerCompetitionCount", 6);
  assertSummary(summary, "priority1RepairCompilerCompetitionCount", 6);
  assertSummary(summary, "cupStateCompilerCompetitionCount", 3);
  assertSummary(summary, "policyReductionCompilerCompetitionCount", 2);
  assertSummary(summary, "standingsFirstCompilerCompetitionCount", 2);
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

  const compilerLaneRows = Array.isArray(interpreter.compilerLaneRows) ? interpreter.compilerLaneRows : [];
  const groupingKeyRows = Array.isArray(interpreter.groupingKeyRows) ? interpreter.groupingKeyRows : [];

  if (compilerLaneRows.length !== 8) throw new Error(`Expected 8 compiler lane rows, got ${compilerLaneRows.length}`);
  if (groupingKeyRows.length !== GROUPING_KEY_COUNT) {
    throw new Error(`Expected ${GROUPING_KEY_COUNT} grouping key rows, got ${groupingKeyRows.length}`);
  }

  const compilerRows = buildCompilerRows(groupingKeyRows);
  const compiledSlugs = uniqueSorted(compilerRows.flatMap((row) => row.competitionSlugs));

  if (compilerRows.length !== GROUPING_KEY_COUNT) {
    throw new Error(`Expected ${GROUPING_KEY_COUNT} compiler rows, got ${compilerRows.length}`);
  }

  if (compiledSlugs.length !== ACTIVE_COMPETITION_COUNT) {
    throw new Error(`Expected ${ACTIVE_COMPETITION_COUNT} compiled unique slugs, got ${compiledSlugs.length}`);
  }

  const outputDir = path.dirname(args.output);
  fs.mkdirSync(outputDir, { recursive: true });

  const compilerOutputFiles = writeCompilerOutputFiles({
    outputDir,
    date: args.date,
    compilerRows
  });

  if (compilerOutputFiles.length !== 8) {
    throw new Error(`Expected 8 compiler output files, got ${compilerOutputFiles.length}`);
  }

  const sourceAuthorityCompilerRows = compilerRows.filter((row) =>
    row.interpreterLane === "source_authority_template_compiler_lane"
  );
  const existingSignalCompilerRows = compilerRows.filter((row) =>
    row.interpreterLane === "existing_signal_truth_review_compiler_lane"
  );

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-master-compiler-lane-bundle-file",
    mode: "source_only_master_compiler_lane_bundle_for_all_8_compiler_lanes_515_competitions_no_fetch_no_search_no_writes_no_truth_assertions",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      workstreamResultInterpreter: args.input
    },
    summary: {
      retainedRawMapCompetitionCount: RETAINED_RAW_MAP_COUNT,
      competitionCount: RETAINED_RAW_MAP_COUNT,
      activeExecutionWaveCompetitionCount: ACTIVE_COMPETITION_COUNT,
      scopeAccountingNoActionCompetitionCount: SCOPE_ACCOUNTING_NO_ACTION_COUNT,

      compilerLaneCount: compilerOutputFiles.length,
      compilerOutputFileCount: compilerOutputFiles.length,
      compilerGroupingRowCount: compilerRows.length,
      compilerUniqueCompetitionCount: compiledSlugs.length,

      sourceAuthorityTemplateCompilerCompetitionCount:
        uniqueSorted(sourceAuthorityCompilerRows.flatMap((row) => row.competitionSlugs)).length,
      sourceAuthorityTemplateCompilerGroupingRowCount: sourceAuthorityCompilerRows.length,
      existingSignalTruthReviewCompilerCompetitionCount:
        uniqueSorted(existingSignalCompilerRows.flatMap((row) => row.competitionSlugs)).length,
      existingSignalTruthReviewCompilerGroupingRowCount: existingSignalCompilerRows.length,
      blockedSourceTracebackCompilerCompetitionCount:
        uniqueSorted(compilerRows.filter((row) => row.interpreterLane === "blocked_source_traceback_compiler_lane").flatMap((row) => row.competitionSlugs)).length,
      genericValidatorReadyFollowupCompilerCompetitionCount:
        uniqueSorted(compilerRows.filter((row) => row.interpreterLane === "generic_validator_ready_followup_lane").flatMap((row) => row.competitionSlugs)).length,
      priority1RepairCompilerCompetitionCount:
        uniqueSorted(compilerRows.filter((row) => row.interpreterLane === "priority1_reusable_family_repair_lane").flatMap((row) => row.competitionSlugs)).length,
      standingsFirstCompilerCompetitionCount:
        uniqueSorted(compilerRows.filter((row) => row.interpreterLane === "standings_first_contract_review_lane").flatMap((row) => row.competitionSlugs)).length,
      cupStateCompilerCompetitionCount:
        uniqueSorted(compilerRows.filter((row) => row.interpreterLane === "cup_state_final_winner_review_lane").flatMap((row) => row.competitionSlugs)).length,
      policyReductionCompilerCompetitionCount:
        uniqueSorted(compilerRows.filter((row) => row.interpreterLane === "policy_reduction_governance_lane").flatMap((row) => row.competitionSlugs)).length,

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

      recommendedNextLane: "run_source_only_master_compiler_lane_quality_gate_then_source_authority_template_compiler_large_batch"
    },
    counts: {
      byInterpreterLane: countBy(compilerRows, "interpreterLane"),
      byWorkstream: countBy(compilerRows, "workstream"),
      byCompilerAction: countBy(compilerRows, "compilerAction"),
      byPackType: countBy(compilerRows, "packTypes")
    },
    guardrails: [
      "This bundle compiles all 8 compiler lanes together.",
      "It covers all 515 active execution-wave competitions.",
      "It emits per-lane compiler outputs but does not execute fetch/search/write.",
      "The retained raw map remains 689 and is not confirmed actionable scope.",
      "The 174 no-action/suppressed rows remain scope accounting only.",
      "No fetch is performed or allowed.",
      "No search is performed or allowed.",
      "No broad search is performed or allowed.",
      "No zero-result outcome may imply absence.",
      "No canonical or production data is written.",
      "No active, inactive, completed, actionable, route, fixture, standings, or season-state truth is asserted."
    ],
    compilerOutputFiles,
    masterCompilerQueueRows: compilerOutputFiles.map((fileRow, index) => ({
      queueIndex: index + 1,
      interpreterLane: fileRow.interpreterLane,
      workstreams: fileRow.workstreams,
      inputFile: fileRow.outputFile,
      compilerGroupingRowCount: fileRow.compilerGroupingRowCount,
      competitionCount: fileRow.competitionCount,
      recommendedRunnerStatus: "source_only_quality_gate_not_executed_by_this_bundle",
      fetchAllowedNow: false,
      searchAllowedNow: false,
      broadSearchAllowedNow: false,
      zeroResultMayImplyAbsence: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false
    })),
    compilerRows
  };

  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    retainedRawMapCompetitionCount: output.summary.retainedRawMapCompetitionCount,
    competitionCount: output.summary.competitionCount,
    activeExecutionWaveCompetitionCount: output.summary.activeExecutionWaveCompetitionCount,
    scopeAccountingNoActionCompetitionCount: output.summary.scopeAccountingNoActionCompetitionCount,
    compilerLaneCount: output.summary.compilerLaneCount,
    compilerOutputFileCount: output.summary.compilerOutputFileCount,
    compilerGroupingRowCount: output.summary.compilerGroupingRowCount,
    compilerUniqueCompetitionCount: output.summary.compilerUniqueCompetitionCount,
    sourceAuthorityTemplateCompilerCompetitionCount: output.summary.sourceAuthorityTemplateCompilerCompetitionCount,
    sourceAuthorityTemplateCompilerGroupingRowCount: output.summary.sourceAuthorityTemplateCompilerGroupingRowCount,
    existingSignalTruthReviewCompilerCompetitionCount: output.summary.existingSignalTruthReviewCompilerCompetitionCount,
    existingSignalTruthReviewCompilerGroupingRowCount: output.summary.existingSignalTruthReviewCompilerGroupingRowCount,
    blockedSourceTracebackCompilerCompetitionCount: output.summary.blockedSourceTracebackCompilerCompetitionCount,
    genericValidatorReadyFollowupCompilerCompetitionCount: output.summary.genericValidatorReadyFollowupCompilerCompetitionCount,
    priority1RepairCompilerCompetitionCount: output.summary.priority1RepairCompilerCompetitionCount,
    standingsFirstCompilerCompetitionCount: output.summary.standingsFirstCompilerCompetitionCount,
    cupStateCompilerCompetitionCount: output.summary.cupStateCompilerCompetitionCount,
    policyReductionCompilerCompetitionCount: output.summary.policyReductionCompilerCompetitionCount,
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
