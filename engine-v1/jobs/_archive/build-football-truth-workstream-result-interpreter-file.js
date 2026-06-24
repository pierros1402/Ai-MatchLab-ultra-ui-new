#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/whole-map-master-workstream-bundle-runner-2026-06-14/whole-map-master-workstream-bundle-runner-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/workstream-result-interpreter-2026-06-14/workstream-result-interpreter-2026-06-14.json";

const RETAINED_RAW_MAP_COUNT = 689;
const ACTIVE_COMPETITION_COUNT = 515;
const SCOPE_ACCOUNTING_NO_ACTION_COUNT = 174;

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

function assertRunnerGuardrails(row) {
  const slug = row.competitionSlug || "__missing_slug__";

  if (row.fetchAllowedNow !== false) throw new Error(`${slug}: fetchAllowedNow must be false`);
  if (row.searchAllowedNow !== false) throw new Error(`${slug}: searchAllowedNow must be false`);
  if (row.broadSearchAllowedNow !== false) throw new Error(`${slug}: broadSearchAllowedNow must be false`);
  if (row.zeroResultMayImplyAbsence !== false) throw new Error(`${slug}: zeroResultMayImplyAbsence must be false`);
  if (row.canonicalWriteEligibleNow !== false) throw new Error(`${slug}: canonicalWriteEligibleNow must be false`);
  if (row.productionWrite !== false) throw new Error(`${slug}: productionWrite must be false`);
  if (row.truthAssertionsAllowedNow !== false) throw new Error(`${slug}: truthAssertionsAllowedNow must be false`);
  if (row.activeAssertedNow !== false) throw new Error(`${slug}: activeAssertedNow must be false`);
  if (row.inactiveAssertedNow !== false) throw new Error(`${slug}: inactiveAssertedNow must be false`);
  if (row.completedAssertedNow !== false) throw new Error(`${slug}: completedAssertedNow must be false`);
}

function interpretationForWorkstream(workstream) {
  const map = {
    source_authority_template_materialization: {
      interpreterLane: "source_authority_template_compiler_lane",
      compilerPriority: 10,
      nextSourceOnlyCompiler: "build_source_authority_template_compiler_for_372_rows",
      interpretation: "large source-authority template lane; compile country/prefix templates before controlled discovery; no search/fetch now"
    },
    existing_signal_truth_review: {
      interpreterLane: "existing_signal_truth_review_compiler_lane",
      compilerPriority: 20,
      nextSourceOnlyCompiler: "build_existing_signal_truth_review_compiler_for_101_rows",
      interpretation: "existing signals should be reviewed before new discovery; no truth assertion now"
    },
    blocked_configured_family_source_traceback: {
      interpreterLane: "blocked_source_traceback_compiler_lane",
      compilerPriority: 30,
      nextSourceOnlyCompiler: "build_blocked_configured_family_source_traceback_compiler_for_23_rows",
      interpretation: "blocked configured-family rows require source traceback; blocked does not mean absence"
    },
    generic_validator_ready_config_only_followup: {
      interpreterLane: "generic_validator_ready_followup_lane",
      compilerPriority: 40,
      nextSourceOnlyCompiler: "build_generic_validator_ready_followup_compiler_for_6_rows",
      interpretation: "generic validator config is ready but no contract validation has run"
    },
    priority1_reusable_family_repair_and_contract_review: {
      interpreterLane: "priority1_reusable_family_repair_lane",
      compilerPriority: 45,
      nextSourceOnlyCompiler: "build_priority1_reusable_family_repair_compiler_for_6_rows",
      interpretation: "priority reusable families need repair/contract review as group"
    },
    standings_first_contract_review: {
      interpreterLane: "standings_first_contract_review_lane",
      compilerPriority: 50,
      nextSourceOnlyCompiler: "build_standings_first_contract_review_compiler_for_2_rows",
      interpretation: "standings-first rows must remain separate from fixture and season-state validation"
    },
    cup_state_or_final_winner_review: {
      interpreterLane: "cup_state_final_winner_review_lane",
      compilerPriority: 55,
      nextSourceOnlyCompiler: "build_cup_state_final_winner_review_compiler_for_3_rows",
      interpretation: "cup state/final winner review only; no canonical write now"
    },
    policy_reduction_candidate_review: {
      interpreterLane: "policy_reduction_governance_lane",
      compilerPriority: 60,
      nextSourceOnlyCompiler: "build_policy_reduction_governance_compiler_for_2_rows",
      interpretation: "policy reduction candidates need governance review; no deletion/suppression now"
    }
  };

  return map[workstream] || {
    interpreterLane: "unknown_workstream_interpreter_lane",
    compilerPriority: 999,
    nextSourceOnlyCompiler: "manual_source_only_workstream_interpretation_required",
    interpretation: "unknown workstream requires manual source-only classification"
  };
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

function buildCompilerLaneRows(runnerRows) {
  return groupRows(runnerRows, (row) => row.workstream).map(([workstream, rows]) => {
    const meta = interpretationForWorkstream(workstream);

    return {
      workstream,
      interpreterLane: meta.interpreterLane,
      compilerPriority: meta.compilerPriority,
      nextSourceOnlyCompiler: meta.nextSourceOnlyCompiler,
      interpretation: meta.interpretation,
      competitionCount: rows.length,
      competitionSlugs: uniqueSorted(rows.map((row) => row.competitionSlug)),
      runnerGroupingKeyCount: uniqueSorted(rows.map((row) => row.runnerGroupingKey)).length,
      runnerGroupingKeys: uniqueSorted(rows.map((row) => row.runnerGroupingKey)),
      executionWaves: uniqueSorted(rows.map((row) => row.executionWave)),
      packTypes: uniqueSorted(rows.map((row) => row.packType)),
      slugPrefixes: uniqueSorted(rows.map((row) => row.slugPrefix)),
      sourceOnly: true,
      fetchAllowedNow: false,
      searchAllowedNow: false,
      broadSearchAllowedNow: false,
      zeroResultMayImplyAbsence: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false,
      truthAssertionsAllowedNow: false
    };
  }).sort((a, b) => {
    if (a.compilerPriority !== b.compilerPriority) return a.compilerPriority - b.compilerPriority;
    return a.workstream.localeCompare(b.workstream);
  });
}

function buildGroupingKeyRows(runnerRows) {
  return groupRows(runnerRows, (row) => row.runnerGroupingKey).map(([runnerGroupingKey, rows]) => {
    const workstream = rows[0].workstream;
    const meta = interpretationForWorkstream(workstream);

    return {
      runnerGroupingKey,
      workstream,
      interpreterLane: meta.interpreterLane,
      nextSourceOnlyCompiler: meta.nextSourceOnlyCompiler,
      competitionCount: rows.length,
      competitionSlugs: uniqueSorted(rows.map((row) => row.competitionSlug)),
      executionWaves: uniqueSorted(rows.map((row) => row.executionWave)),
      packTypes: uniqueSorted(rows.map((row) => row.packType)),
      slugPrefixes: uniqueSorted(rows.map((row) => row.slugPrefix)),
      sourceOnly: true,
      fetchAllowedNow: false,
      searchAllowedNow: false,
      broadSearchAllowedNow: false,
      zeroResultMayImplyAbsence: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false,
      truthAssertionsAllowedNow: false
    };
  }).sort((a, b) => {
    if (a.workstream !== b.workstream) return a.workstream.localeCompare(b.workstream);
    if (b.competitionCount !== a.competitionCount) return b.competitionCount - a.competitionCount;
    return a.runnerGroupingKey.localeCompare(b.runnerGroupingKey);
  });
}

function main() {
  const args = parseArgs(process.argv);
  const runner = readJson(args.input);
  const summary = runner.summary || {};

  assertSummary(summary, "retainedRawMapCompetitionCount", RETAINED_RAW_MAP_COUNT);
  assertSummary(summary, "competitionCount", RETAINED_RAW_MAP_COUNT);
  assertSummary(summary, "activeExecutionWaveCompetitionCount", ACTIVE_COMPETITION_COUNT);
  assertSummary(summary, "scopeAccountingNoActionCompetitionCount", SCOPE_ACCOUNTING_NO_ACTION_COUNT);
  assertSummary(summary, "masterQueueRowCount", 8);
  assertSummary(summary, "workstreamRunnerOutputFileCount", 8);
  assertSummary(summary, "runnerRowCount", ACTIVE_COMPETITION_COUNT);
  assertSummary(summary, "runnerUniqueCompetitionCount", ACTIVE_COMPETITION_COUNT);
  assertSummary(summary, "runnerGroupingKeyCount", 281);
  assertSummary(summary, "sourceAuthorityTemplateMaterializationRunnerCount", 372);
  assertSummary(summary, "existingSignalTruthReviewRunnerCount", 101);
  assertSummary(summary, "blockedConfiguredFamilySourceTracebackRunnerCount", 23);
  assertSummary(summary, "genericValidatorReadyFollowupRunnerCount", 6);
  assertSummary(summary, "priority1ReusableFamilyRepairRunnerCount", 6);
  assertSummary(summary, "cupStateOrFinalWinnerReviewRunnerCount", 3);
  assertSummary(summary, "policyReductionCandidateReviewRunnerCount", 2);
  assertSummary(summary, "standingsFirstContractReviewRunnerCount", 2);
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

  const runnerRows = Array.isArray(runner.masterRunnerRows) ? runner.masterRunnerRows : [];
  if (runnerRows.length !== ACTIVE_COMPETITION_COUNT) {
    throw new Error(`Expected ${ACTIVE_COMPETITION_COUNT} master runner rows, got ${runnerRows.length}`);
  }

  for (const row of runnerRows) assertRunnerGuardrails(row);

  const compilerLaneRows = buildCompilerLaneRows(runnerRows);
  const groupingKeyRows = buildGroupingKeyRows(runnerRows);

  if (compilerLaneRows.length !== 8) {
    throw new Error(`Expected 8 compiler lane rows, got ${compilerLaneRows.length}`);
  }

  if (groupingKeyRows.length !== 281) {
    throw new Error(`Expected 281 grouping key rows, got ${groupingKeyRows.length}`);
  }

  const allInterpretedSlugs = uniqueSorted(compilerLaneRows.flatMap((row) => row.competitionSlugs));
  if (allInterpretedSlugs.length !== ACTIVE_COMPETITION_COUNT) {
    throw new Error(`Expected ${ACTIVE_COMPETITION_COUNT} interpreted unique slugs, got ${allInterpretedSlugs.length}`);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-workstream-result-interpreter-file",
    mode: "source_only_interprets_all_8_workstream_runner_outputs_515_competitions_no_fetch_no_search_no_writes_no_truth_assertions",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      wholeMapMasterWorkstreamBundleRunner: args.input
    },
    summary: {
      retainedRawMapCompetitionCount: RETAINED_RAW_MAP_COUNT,
      competitionCount: RETAINED_RAW_MAP_COUNT,
      activeExecutionWaveCompetitionCount: ACTIVE_COMPETITION_COUNT,
      scopeAccountingNoActionCompetitionCount: SCOPE_ACCOUNTING_NO_ACTION_COUNT,

      interpretedRunnerRowCount: runnerRows.length,
      interpretedUniqueCompetitionCount: allInterpretedSlugs.length,
      interpretedWorkstreamCount: compilerLaneRows.length,
      interpretedGroupingKeyCount: groupingKeyRows.length,

      sourceAuthorityTemplateCompilerCompetitionCount:
        compilerLaneRows.find((row) => row.workstream === "source_authority_template_materialization")?.competitionCount || 0,
      existingSignalTruthReviewCompilerCompetitionCount:
        compilerLaneRows.find((row) => row.workstream === "existing_signal_truth_review")?.competitionCount || 0,
      blockedSourceTracebackCompilerCompetitionCount:
        compilerLaneRows.find((row) => row.workstream === "blocked_configured_family_source_traceback")?.competitionCount || 0,
      genericValidatorReadyFollowupCompilerCompetitionCount:
        compilerLaneRows.find((row) => row.workstream === "generic_validator_ready_config_only_followup")?.competitionCount || 0,
      priority1RepairCompilerCompetitionCount:
        compilerLaneRows.find((row) => row.workstream === "priority1_reusable_family_repair_and_contract_review")?.competitionCount || 0,
      cupStateCompilerCompetitionCount:
        compilerLaneRows.find((row) => row.workstream === "cup_state_or_final_winner_review")?.competitionCount || 0,
      policyReductionCompilerCompetitionCount:
        compilerLaneRows.find((row) => row.workstream === "policy_reduction_candidate_review")?.competitionCount || 0,
      standingsFirstCompilerCompetitionCount:
        compilerLaneRows.find((row) => row.workstream === "standings_first_contract_review")?.competitionCount || 0,

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

      firstRecommendedCompilerLane: compilerLaneRows[0]?.interpreterLane || null,
      firstRecommendedCompiler: compilerLaneRows[0]?.nextSourceOnlyCompiler || null,
      recommendedNextLane: "build_source_authority_template_compiler_and_existing_signal_truth_review_compiler_as_two_large_source_only_outputs"
    },
    counts: {
      byInterpreterLane: countBy(compilerLaneRows, "interpreterLane"),
      byWorkstream: countBy(runnerRows, "workstream"),
      byRunnerAction: countBy(runnerRows, "runnerAction"),
      byExecutionWave: countBy(runnerRows, "executionWave"),
      byPackType: countBy(runnerRows, "packType")
    },
    guardrails: [
      "This interpreter covers all 8 runner outputs together.",
      "It covers all 515 active execution-wave competitions.",
      "The retained raw map remains 689 and is not confirmed actionable scope.",
      "The 174 no-action/suppressed rows remain scope accounting only.",
      "No fetch is performed or allowed.",
      "No search is performed or allowed.",
      "No broad search is performed or allowed.",
      "No zero-result outcome may imply absence.",
      "No canonical or production data is written.",
      "No active, inactive, completed, actionable, route, fixture, standings, or season-state truth is asserted.",
      "The next compiler should operate at workstream scale, not one family or one pack at a time."
    ],
    compilerLaneRows,
    groupingKeyRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    retainedRawMapCompetitionCount: output.summary.retainedRawMapCompetitionCount,
    competitionCount: output.summary.competitionCount,
    activeExecutionWaveCompetitionCount: output.summary.activeExecutionWaveCompetitionCount,
    scopeAccountingNoActionCompetitionCount: output.summary.scopeAccountingNoActionCompetitionCount,
    interpretedRunnerRowCount: output.summary.interpretedRunnerRowCount,
    interpretedUniqueCompetitionCount: output.summary.interpretedUniqueCompetitionCount,
    interpretedWorkstreamCount: output.summary.interpretedWorkstreamCount,
    interpretedGroupingKeyCount: output.summary.interpretedGroupingKeyCount,
    sourceAuthorityTemplateCompilerCompetitionCount: output.summary.sourceAuthorityTemplateCompilerCompetitionCount,
    existingSignalTruthReviewCompilerCompetitionCount: output.summary.existingSignalTruthReviewCompilerCompetitionCount,
    blockedSourceTracebackCompilerCompetitionCount: output.summary.blockedSourceTracebackCompilerCompetitionCount,
    genericValidatorReadyFollowupCompilerCompetitionCount: output.summary.genericValidatorReadyFollowupCompilerCompetitionCount,
    priority1RepairCompilerCompetitionCount: output.summary.priority1RepairCompilerCompetitionCount,
    cupStateCompilerCompetitionCount: output.summary.cupStateCompilerCompetitionCount,
    policyReductionCompilerCompetitionCount: output.summary.policyReductionCompilerCompetitionCount,
    standingsFirstCompilerCompetitionCount: output.summary.standingsFirstCompilerCompetitionCount,
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
    firstRecommendedCompilerLane: output.summary.firstRecommendedCompilerLane,
    firstRecommendedCompiler: output.summary.firstRecommendedCompiler,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
