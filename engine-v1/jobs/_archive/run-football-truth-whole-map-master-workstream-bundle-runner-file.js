#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/whole-map-active-workstream-input-bundle-2026-06-14/whole-map-active-workstream-input-bundle-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/whole-map-master-workstream-bundle-runner-2026-06-14/whole-map-master-workstream-bundle-runner-2026-06-14.json";

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

function assertNoUnsafeFlags(rows, label) {
  for (const row of rows) {
    const slug = row.competitionSlug || "__missing_slug__";

    if (row.fetchAllowedNow !== false) throw new Error(`${label}/${slug}: fetchAllowedNow must be false`);
    if (row.searchAllowedNow !== false) throw new Error(`${label}/${slug}: searchAllowedNow must be false`);
    if (row.broadSearchAllowedNow !== false) throw new Error(`${label}/${slug}: broadSearchAllowedNow must be false`);
    if (row.zeroResultMayImplyAbsence !== false) throw new Error(`${label}/${slug}: zeroResultMayImplyAbsence must be false`);
    if (row.canonicalWriteEligibleNow !== false) throw new Error(`${label}/${slug}: canonicalWriteEligibleNow must be false`);
    if (row.productionWrite !== false) throw new Error(`${label}/${slug}: productionWrite must be false`);
    if (row.truthAssertionsAllowedNow !== false) throw new Error(`${label}/${slug}: truthAssertionsAllowedNow must be false`);
    if (row.activeAssertedNow !== false) throw new Error(`${label}/${slug}: activeAssertedNow must be false`);
    if (row.inactiveAssertedNow !== false) throw new Error(`${label}/${slug}: inactiveAssertedNow must be false`);
    if (row.completedAssertedNow !== false) throw new Error(`${label}/${slug}: completedAssertedNow must be false`);
  }
}

function runnerActionForWorkstream(workstream) {
  const map = {
    existing_signal_truth_review:
      "runner_materialized_existing_signal_review_rows_no_truth_assertion",
    source_authority_template_materialization:
      "runner_materialized_source_authority_template_rows_no_discovery_execution",
    blocked_configured_family_source_traceback:
      "runner_materialized_blocked_source_traceback_rows_not_absence",
    generic_validator_ready_config_only_followup:
      "runner_materialized_generic_validator_ready_followup_rows_no_contract_validation",
    priority1_reusable_family_repair_and_contract_review:
      "runner_materialized_priority1_family_repair_rows_no_canonical_write",
    standings_first_contract_review:
      "runner_materialized_standings_first_review_rows_no_fixture_or_state_assertion",
    cup_state_or_final_winner_review:
      "runner_materialized_cup_state_review_rows_no_canonical_write",
    policy_reduction_candidate_review:
      "runner_materialized_policy_reduction_rows_no_scope_delete"
  };

  return map[workstream] || "runner_materialized_unknown_source_only_rows";
}

function runnerGroupingKey(row) {
  if (row.workstream === "source_authority_template_materialization") {
    return `${row.workstream}::${row.slugPrefix}`;
  }

  if (row.workstream === "existing_signal_truth_review") {
    return `${row.workstream}::${row.packType}::${row.slugPrefix}`;
  }

  if (row.workstream === "blocked_configured_family_source_traceback") {
    return `${row.workstream}::${row.packId}`;
  }

  if (row.workstream === "generic_validator_ready_config_only_followup") {
    return `${row.workstream}::${row.slugPrefix}`;
  }

  return `${row.workstream}::${row.packType}`;
}

function makeRunnerRow(inputRow) {
  return {
    competitionSlug: inputRow.competitionSlug,
    slugPrefix: inputRow.slugPrefix,
    executionWave: inputRow.executionWave,
    workstream: inputRow.workstream,
    packId: inputRow.packId,
    packType: inputRow.packType,
    executionMode: inputRow.executionMode,
    runnerAction: runnerActionForWorkstream(inputRow.workstream),
    runnerGroupingKey: runnerGroupingKey(inputRow),
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
    completedAssertedNow: false,
    runnerOutputStatus: "materialized_source_only_no_truth_assertion"
  };
}

function writeRunnerOutputFile({ outputDir, date, queueRow, inputRows }) {
  assertNoUnsafeFlags(inputRows, queueRow.workstream);

  const runnerRows = inputRows.map(makeRunnerRow).sort((a, b) => {
    if (a.runnerGroupingKey !== b.runnerGroupingKey) return a.runnerGroupingKey.localeCompare(b.runnerGroupingKey);
    return a.competitionSlug.localeCompare(b.competitionSlug);
  });

  const outputFile = path.join(
    outputDir,
    `whole-map-master-runner-output-${queueRow.queueIndex}-${queueRow.workstream}-${date}.json`
  ).replaceAll("\\", "/");

  const uniqueSlugs = uniqueSorted(runnerRows.map((row) => row.competitionSlug));

  const runnerOutput = {
    generatedAt: new Date().toISOString(),
    date,
    job: "run-football-truth-whole-map-master-workstream-bundle-runner-file",
    mode: "source_only_per_workstream_runner_output_no_fetch_no_search_no_writes_no_truth_assertions",
    workstream: queueRow.workstream,
    executionMode: queueRow.executionMode,
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      workstreamInputFile: queueRow.inputFile
    },
    summary: {
      queueIndex: queueRow.queueIndex,
      workstream: queueRow.workstream,
      inputCompetitionCount: inputRows.length,
      runnerRowCount: runnerRows.length,
      uniqueCompetitionCount: uniqueSlugs.length,
      groupingKeyCount: uniqueSorted(runnerRows.map((row) => row.runnerGroupingKey)).length,
      executionWaves: uniqueSorted(runnerRows.map((row) => row.executionWave)),
      packTypes: uniqueSorted(runnerRows.map((row) => row.packType)),
      slugPrefixes: uniqueSorted(runnerRows.map((row) => row.slugPrefix)),
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
      byRunnerAction: countBy(runnerRows, "runnerAction"),
      byRunnerGroupingKey: countBy(runnerRows, "runnerGroupingKey"),
      byPackType: countBy(runnerRows, "packType"),
      bySlugPrefix: countBy(runnerRows, "slugPrefix")
    },
    guardrails: [
      "This is a runner output only.",
      "No fetch/search/write/truth assertion is performed.",
      "Zero result must not imply absence.",
      "No match today must not imply inactive.",
      "Match status must not be used as season-state truth."
    ],
    runnerRows
  };

  fs.writeFileSync(outputFile, stableJson(runnerOutput));

  return {
    queueIndex: queueRow.queueIndex,
    workstream: queueRow.workstream,
    executionMode: queueRow.executionMode,
    inputFile: queueRow.inputFile,
    outputFile,
    inputCompetitionCount: inputRows.length,
    runnerRowCount: runnerRows.length,
    uniqueCompetitionCount: uniqueSlugs.length,
    groupingKeyCount: runnerOutput.summary.groupingKeyCount,
    runnerActions: uniqueSorted(runnerRows.map((row) => row.runnerAction)),
    executionWaves: runnerOutput.summary.executionWaves,
    packTypes: runnerOutput.summary.packTypes,
    slugPrefixes: runnerOutput.summary.slugPrefixes,
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
  const bundle = readJson(args.input);
  const summary = bundle.summary || {};

  assertSummary(summary, "retainedRawMapCompetitionCount", RETAINED_RAW_MAP_COUNT);
  assertSummary(summary, "competitionCount", RETAINED_RAW_MAP_COUNT);
  assertSummary(summary, "activeExecutionWaveCompetitionCount", ACTIVE_COMPETITION_COUNT);
  assertSummary(summary, "scopeAccountingNoActionCompetitionCount", SCOPE_ACCOUNTING_NO_ACTION_COUNT);
  assertSummary(summary, "activeWorkstreamCount", 8);
  assertSummary(summary, "workstreamInputFileCount", 8);
  assertSummary(summary, "masterQueueRowCount", 8);
  assertSummary(summary, "materializedInputCompetitionCount", ACTIVE_COMPETITION_COUNT);
  assertSummary(summary, "sourceAuthorityTemplateMaterializationCompetitionCount", 372);
  assertSummary(summary, "existingSignalTruthReviewCompetitionCount", 101);
  assertSummary(summary, "blockedConfiguredFamilySourceTracebackCompetitionCount", 23);
  assertSummary(summary, "genericValidatorReadyFollowupCompetitionCount", 6);
  assertSummary(summary, "priority1ReusableFamilyRepairCompetitionCount", 6);
  assertSummary(summary, "cupStateOrFinalWinnerReviewCompetitionCount", 3);
  assertSummary(summary, "policyReductionCandidateReviewCompetitionCount", 2);
  assertSummary(summary, "standingsFirstContractReviewCompetitionCount", 2);
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

  const masterQueueRows = Array.isArray(bundle.masterQueueRows) ? bundle.masterQueueRows : [];
  if (masterQueueRows.length !== 8) throw new Error(`Expected 8 master queue rows, got ${masterQueueRows.length}`);

  const outputDir = path.dirname(args.output);
  fs.mkdirSync(outputDir, { recursive: true });

  const workstreamRunnerOutputs = [];
  const allRunnerRows = [];

  for (const queueRow of masterQueueRows.sort((a, b) => a.queueIndex - b.queueIndex)) {
    if (!fs.existsSync(queueRow.inputFile)) {
      throw new Error(`Missing workstream input file: ${queueRow.inputFile}`);
    }

    const workstreamInput = readJson(queueRow.inputFile);
    const inputRows = Array.isArray(workstreamInput.rows) ? workstreamInput.rows : [];

    if (inputRows.length !== queueRow.competitionCount) {
      throw new Error(
        `Workstream ${queueRow.workstream} count mismatch: queue expected ${queueRow.competitionCount}, file has ${inputRows.length}`
      );
    }

    const runnerOutput = writeRunnerOutputFile({
      outputDir,
      date: args.date,
      queueRow,
      inputRows
    });

    workstreamRunnerOutputs.push(runnerOutput);

    const runnerFileJson = readJson(runnerOutput.outputFile);
    allRunnerRows.push(...runnerFileJson.runnerRows);
  }

  const uniqueRunnerSlugs = uniqueSorted(allRunnerRows.map((row) => row.competitionSlug));
  if (allRunnerRows.length !== ACTIVE_COMPETITION_COUNT) {
    throw new Error(`Expected ${ACTIVE_COMPETITION_COUNT} runner rows, got ${allRunnerRows.length}`);
  }

  if (uniqueRunnerSlugs.length !== ACTIVE_COMPETITION_COUNT) {
    throw new Error(`Expected ${ACTIVE_COMPETITION_COUNT} unique runner slugs, got ${uniqueRunnerSlugs.length}`);
  }

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "run-football-truth-whole-map-master-workstream-bundle-runner-file",
    mode: "source_only_master_runner_over_all_8_workstreams_515_competitions_no_fetch_no_search_no_writes_no_truth_assertions",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      activeWorkstreamInputBundle: args.input
    },
    summary: {
      retainedRawMapCompetitionCount: RETAINED_RAW_MAP_COUNT,
      competitionCount: RETAINED_RAW_MAP_COUNT,
      activeExecutionWaveCompetitionCount: ACTIVE_COMPETITION_COUNT,
      scopeAccountingNoActionCompetitionCount: SCOPE_ACCOUNTING_NO_ACTION_COUNT,

      masterQueueRowCount: masterQueueRows.length,
      workstreamRunnerOutputFileCount: workstreamRunnerOutputs.length,
      runnerRowCount: allRunnerRows.length,
      runnerUniqueCompetitionCount: uniqueRunnerSlugs.length,
      runnerGroupingKeyCount: uniqueSorted(allRunnerRows.map((row) => row.runnerGroupingKey)).length,

      sourceAuthorityTemplateMaterializationRunnerCount:
        allRunnerRows.filter((row) => row.workstream === "source_authority_template_materialization").length,
      existingSignalTruthReviewRunnerCount:
        allRunnerRows.filter((row) => row.workstream === "existing_signal_truth_review").length,
      blockedConfiguredFamilySourceTracebackRunnerCount:
        allRunnerRows.filter((row) => row.workstream === "blocked_configured_family_source_traceback").length,
      genericValidatorReadyFollowupRunnerCount:
        allRunnerRows.filter((row) => row.workstream === "generic_validator_ready_config_only_followup").length,
      priority1ReusableFamilyRepairRunnerCount:
        allRunnerRows.filter((row) => row.workstream === "priority1_reusable_family_repair_and_contract_review").length,
      cupStateOrFinalWinnerReviewRunnerCount:
        allRunnerRows.filter((row) => row.workstream === "cup_state_or_final_winner_review").length,
      policyReductionCandidateReviewRunnerCount:
        allRunnerRows.filter((row) => row.workstream === "policy_reduction_candidate_review").length,
      standingsFirstContractReviewRunnerCount:
        allRunnerRows.filter((row) => row.workstream === "standings_first_contract_review").length,

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

      recommendedNextLane: "build_source_only_workstream_result_interpreter_for_all_runner_outputs_no_truth_assertions"
    },
    counts: {
      byExecutionWave: countBy(allRunnerRows, "executionWave"),
      byWorkstream: countBy(allRunnerRows, "workstream"),
      byRunnerAction: countBy(allRunnerRows, "runnerAction"),
      byPackType: countBy(allRunnerRows, "packType"),
      byRunnerGroupingKey: countBy(allRunnerRows, "runnerGroupingKey")
    },
    guardrails: [
      "This runner processes all 8 active workstream input files together.",
      "It covers all 515 active execution-wave competitions.",
      "The retained raw map remains 689 and is not confirmed actionable scope.",
      "The 174 no-action/suppressed rows remain scope accounting only.",
      "No fetch is performed or allowed.",
      "No search is performed or allowed.",
      "No broad search is performed or allowed.",
      "No zero-result outcome may imply absence.",
      "No canonical or production data is written.",
      "No active, inactive, completed, actionable, route, fixture, standings, or season-state truth is asserted."
    ],
    workstreamRunnerOutputs,
    masterRunnerRows: allRunnerRows
  };

  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    retainedRawMapCompetitionCount: output.summary.retainedRawMapCompetitionCount,
    competitionCount: output.summary.competitionCount,
    activeExecutionWaveCompetitionCount: output.summary.activeExecutionWaveCompetitionCount,
    scopeAccountingNoActionCompetitionCount: output.summary.scopeAccountingNoActionCompetitionCount,
    masterQueueRowCount: output.summary.masterQueueRowCount,
    workstreamRunnerOutputFileCount: output.summary.workstreamRunnerOutputFileCount,
    runnerRowCount: output.summary.runnerRowCount,
    runnerUniqueCompetitionCount: output.summary.runnerUniqueCompetitionCount,
    runnerGroupingKeyCount: output.summary.runnerGroupingKeyCount,
    sourceAuthorityTemplateMaterializationRunnerCount: output.summary.sourceAuthorityTemplateMaterializationRunnerCount,
    existingSignalTruthReviewRunnerCount: output.summary.existingSignalTruthReviewRunnerCount,
    blockedConfiguredFamilySourceTracebackRunnerCount: output.summary.blockedConfiguredFamilySourceTracebackRunnerCount,
    genericValidatorReadyFollowupRunnerCount: output.summary.genericValidatorReadyFollowupRunnerCount,
    priority1ReusableFamilyRepairRunnerCount: output.summary.priority1ReusableFamilyRepairRunnerCount,
    cupStateOrFinalWinnerReviewRunnerCount: output.summary.cupStateOrFinalWinnerReviewRunnerCount,
    policyReductionCandidateReviewRunnerCount: output.summary.policyReductionCandidateReviewRunnerCount,
    standingsFirstContractReviewRunnerCount: output.summary.standingsFirstContractReviewRunnerCount,
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
