#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";

const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/whole-map-active-execution-wave-materializer-2026-06-14/whole-map-active-execution-wave-materializer-2026-06-14.json";

const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/whole-map-active-workstream-input-bundle-2026-06-14/whole-map-active-workstream-input-bundle-2026-06-14.json";

const RETAINED_RAW_MAP_COUNT = 689;
const ACTIVE_COMPETITION_COUNT = 515;
const SCOPE_ACCOUNTING_NO_ACTION_COUNT = 174;

const WORKSTREAM_PRIORITY = {
  existing_signal_truth_review: 10,
  source_authority_template_materialization: 20,
  blocked_configured_family_source_traceback: 30,
  generic_validator_ready_config_only_followup: 40,
  priority1_reusable_family_repair_and_contract_review: 45,
  standings_first_contract_review: 50,
  cup_state_or_final_winner_review: 55,
  policy_reduction_candidate_review: 60
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

function executionModeForWorkstream(workstream) {
  const map = {
    existing_signal_truth_review: "source_only_existing_signal_truth_review_input",
    source_authority_template_materialization: "source_only_source_authority_template_grouping_input",
    blocked_configured_family_source_traceback: "source_only_blocked_configured_family_traceback_input",
    generic_validator_ready_config_only_followup: "source_only_generic_validator_ready_followup_input",
    priority1_reusable_family_repair_and_contract_review: "source_only_priority1_reusable_family_repair_input",
    standings_first_contract_review: "source_only_standings_first_contract_review_input",
    cup_state_or_final_winner_review: "source_only_cup_state_final_winner_review_input",
    policy_reduction_candidate_review: "source_only_policy_reduction_candidate_review_input"
  };

  return map[workstream] || "source_only_unclassified_workstream_input";
}

function evidencePolicyForWorkstream(workstream) {
  const base = {
    requireTrustedSourceEvidence: true,
    prohibitZeroResultAsAbsence: true,
    prohibitMatchStatusAsSeasonState: true,
    prohibitNoMatchTodayAsInactive: true,
    prohibitCanonicalWriteWithoutSeparateWriterGate: true,
    requireSeasonStateEvidenceSeparateFromFixtures: true,
    requireRestartOrStartDateForCompletedInactiveOrNearSeasonEndWhenAvailable: true
  };

  if (workstream === "source_authority_template_materialization") {
    return {
      ...base,
      purpose: "build reusable source-authority/provider templates before any controlled search or fetch",
      mayUseLiveSearchNow: false,
      mayUseLiveFetchNow: false,
      mayAssertSourcePresence: false,
      mayAssertSourceAbsence: false
    };
  }

  if (workstream === "existing_signal_truth_review") {
    return {
      ...base,
      purpose: "review existing local/intelligence signals before new discovery",
      mayUseLiveSearchNow: false,
      mayUseLiveFetchNow: false,
      mayPromoteCanonicalNow: false
    };
  }

  if (workstream === "blocked_configured_family_source_traceback") {
    return {
      ...base,
      purpose: "trace upstream source for blocked configured-family rows; blocked is not absence",
      mayUseLiveSearchNow: false,
      mayUseLiveFetchNow: false,
      mayUnblockWithoutSourceTraceback: false
    };
  }

  if (workstream === "policy_reduction_candidate_review") {
    return {
      ...base,
      purpose: "review no-market/no-product-value/non-existent candidates without deleting scope",
      maySuppressNow: false,
      mayDeleteScopeNow: false
    };
  }

  return {
    ...base,
    purpose: "source-only review input for high-signal or configured-family lane",
    mayUseLiveSearchNow: false,
    mayUseLiveFetchNow: false,
    mayPromoteCanonicalNow: false
  };
}

function makeInputRow(row) {
  return {
    competitionSlug: row.competitionSlug,
    slugPrefix: row.slugPrefix,
    executionWave: row.executionWave,
    workstream: row.workstream,
    packId: row.packId,
    packType: row.packType,
    executionMode: executionModeForWorkstream(row.workstream),
    materializedAction: row.materializedAction,
    evidencePolicy: evidencePolicyForWorkstream(row.workstream),
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
}

function writeWorkstreamFiles({ outputDir, date, materializedRows }) {
  const byWorkstream = new Map();

  for (const row of materializedRows) {
    if (!byWorkstream.has(row.workstream)) byWorkstream.set(row.workstream, []);
    byWorkstream.get(row.workstream).push(makeInputRow(row));
  }

  const workstreamFiles = [];

  for (const [workstream, rows] of byWorkstream.entries()) {
    const orderedRows = rows.sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));
    const filePath = path.join(
      outputDir,
      `whole-map-active-workstream-input-${safeFilePart(workstream)}-${date}.json`
    ).replaceAll("\\", "/");

    const workstreamOutput = {
      generatedAt: new Date().toISOString(),
      date,
      job: "build-football-truth-whole-map-active-workstream-input-bundle-file",
      mode: "source_only_per_workstream_input_file_no_fetch_no_search_no_writes_no_truth_assertions",
      workstream,
      executionMode: executionModeForWorkstream(workstream),
      sourceFetch: false,
      searchProviderUsed: false,
      broadSearchUsed: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      summary: {
        workstream,
        competitionCount: orderedRows.length,
        uniqueCompetitionCount: uniqueSorted(orderedRows.map((row) => row.competitionSlug)).length,
        executionWaves: uniqueSorted(orderedRows.map((row) => row.executionWave)),
        packTypes: uniqueSorted(orderedRows.map((row) => row.packType)),
        packIds: uniqueSorted(orderedRows.map((row) => row.packId)),
        slugPrefixes: uniqueSorted(orderedRows.map((row) => row.slugPrefix)),
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
        "This file is an input bundle only.",
        "No fetch/search/write/truth assertion is performed.",
        "Zero result must not imply absence.",
        "No match today must not imply inactive.",
        "Match status must not be used as season-state truth."
      ],
      rows: orderedRows
    };

    fs.writeFileSync(filePath, stableJson(workstreamOutput));

    workstreamFiles.push({
      workstream,
      executionMode: executionModeForWorkstream(workstream),
      priority: WORKSTREAM_PRIORITY[workstream] || 999,
      file: filePath,
      competitionCount: orderedRows.length,
      executionWaves: uniqueSorted(orderedRows.map((row) => row.executionWave)),
      packTypes: uniqueSorted(orderedRows.map((row) => row.packType)),
      slugPrefixes: uniqueSorted(orderedRows.map((row) => row.slugPrefix)),
      fetchAllowedNow: false,
      searchAllowedNow: false,
      broadSearchAllowedNow: false,
      zeroResultMayImplyAbsence: false,
      canonicalWriteEligibleNow: false,
      productionWrite: false
    });
  }

  return workstreamFiles.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    if (b.competitionCount !== a.competitionCount) return b.competitionCount - a.competitionCount;
    return a.workstream.localeCompare(b.workstream);
  });
}

function main() {
  const args = parseArgs(process.argv);
  const materializer = readJson(args.input);
  const summary = materializer.summary || {};

  assertSummary(summary, "retainedRawMapCompetitionCount", RETAINED_RAW_MAP_COUNT);
  assertSummary(summary, "competitionCount", RETAINED_RAW_MAP_COUNT);
  assertSummary(summary, "activeExecutionWaveCount", 3);
  assertSummary(summary, "activeExecutionWaveCompetitionCount", ACTIVE_COMPETITION_COUNT);
  assertSummary(summary, "scopeAccountingNoActionCompetitionCount", SCOPE_ACCOUNTING_NO_ACTION_COUNT);
  assertSummary(summary, "materializedActiveCompetitionCount", ACTIVE_COMPETITION_COUNT);
  assertSummary(summary, "materializedActiveUniqueCompetitionCount", ACTIVE_COMPETITION_COUNT);
  assertSummary(summary, "materializedWorkstreamCount", 8);
  assertSummary(summary, "highSignalExistingEvidenceAndReadyCompetitionCount", 118);
  assertSummary(summary, "sourceAuthorityTemplateWaveCompetitionCount", 372);
  assertSummary(summary, "policyAndTracebackWaveCompetitionCount", 25);
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

  const materializedRows = Array.isArray(materializer.materializedRows) ? materializer.materializedRows : [];
  const workstreamRows = Array.isArray(materializer.workstreamRows) ? materializer.workstreamRows : [];

  if (materializedRows.length !== ACTIVE_COMPETITION_COUNT) {
    throw new Error(`Expected ${ACTIVE_COMPETITION_COUNT} materialized rows, got ${materializedRows.length}`);
  }

  if (workstreamRows.length !== 8) {
    throw new Error(`Expected 8 workstream rows, got ${workstreamRows.length}`);
  }

  const activeSlugs = uniqueSorted(materializedRows.map((row) => row.competitionSlug));
  if (activeSlugs.length !== ACTIVE_COMPETITION_COUNT) {
    throw new Error(`Expected ${ACTIVE_COMPETITION_COUNT} unique active slugs, got ${activeSlugs.length}`);
  }

  const outputDir = path.dirname(args.output);
  fs.mkdirSync(outputDir, { recursive: true });

  const workstreamFiles = writeWorkstreamFiles({
    outputDir,
    date: args.date,
    materializedRows
  });

  if (workstreamFiles.length !== 8) {
    throw new Error(`Expected 8 workstream files, got ${workstreamFiles.length}`);
  }

  const masterQueueRows = workstreamFiles.map((fileRow, index) => ({
    queueIndex: index + 1,
    workstream: fileRow.workstream,
    executionMode: fileRow.executionMode,
    priority: fileRow.priority,
    inputFile: fileRow.file,
    competitionCount: fileRow.competitionCount,
    executionWaves: fileRow.executionWaves,
    packTypes: fileRow.packTypes,
    recommendedRunnerStatus: "source_only_runner_not_executed_by_this_bundle",
    fetchAllowedNow: false,
    searchAllowedNow: false,
    broadSearchAllowedNow: false,
    zeroResultMayImplyAbsence: false,
    canonicalWriteEligibleNow: false,
    productionWrite: false
  }));

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-whole-map-active-workstream-input-bundle-file",
    mode: "source_only_master_input_bundle_for_all_8_active_workstreams_515_competitions_no_fetch_no_search_no_writes_no_truth_assertions",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      activeExecutionWaveMaterializer: args.input
    },
    summary: {
      retainedRawMapCompetitionCount: RETAINED_RAW_MAP_COUNT,
      competitionCount: RETAINED_RAW_MAP_COUNT,
      activeExecutionWaveCompetitionCount: ACTIVE_COMPETITION_COUNT,
      scopeAccountingNoActionCompetitionCount: SCOPE_ACCOUNTING_NO_ACTION_COUNT,
      activeWorkstreamCount: workstreamFiles.length,
      workstreamInputFileCount: workstreamFiles.length,
      masterQueueRowCount: masterQueueRows.length,
      materializedInputCompetitionCount: activeSlugs.length,

      sourceAuthorityTemplateMaterializationCompetitionCount:
        materializedRows.filter((row) => row.workstream === "source_authority_template_materialization").length,
      existingSignalTruthReviewCompetitionCount:
        materializedRows.filter((row) => row.workstream === "existing_signal_truth_review").length,
      blockedConfiguredFamilySourceTracebackCompetitionCount:
        materializedRows.filter((row) => row.workstream === "blocked_configured_family_source_traceback").length,
      genericValidatorReadyFollowupCompetitionCount:
        materializedRows.filter((row) => row.workstream === "generic_validator_ready_config_only_followup").length,
      priority1ReusableFamilyRepairCompetitionCount:
        materializedRows.filter((row) => row.workstream === "priority1_reusable_family_repair_and_contract_review").length,
      cupStateOrFinalWinnerReviewCompetitionCount:
        materializedRows.filter((row) => row.workstream === "cup_state_or_final_winner_review").length,
      policyReductionCandidateReviewCompetitionCount:
        materializedRows.filter((row) => row.workstream === "policy_reduction_candidate_review").length,
      standingsFirstContractReviewCompetitionCount:
        materializedRows.filter((row) => row.workstream === "standings_first_contract_review").length,

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

      recommendedNextLane: "run_source_only_master_workstream_bundle_runner_over_all_8_workstreams_without_fetch_search_write"
    },
    counts: {
      byExecutionWave: countBy(materializedRows, "executionWave"),
      byWorkstream: countBy(materializedRows, "workstream"),
      byPackType: countBy(materializedRows, "packType"),
      bySlugPrefix: countBy(materializedRows, "slugPrefix")
    },
    guardrails: [
      "This bundle materializes all 8 active workstream inputs together.",
      "It covers 515 active execution-wave competitions.",
      "The retained raw map remains 689 and is not confirmed actionable scope.",
      "The 174 no-action/suppressed rows remain scope accounting only.",
      "No fetch is performed or allowed.",
      "No search is performed or allowed.",
      "No broad search is performed or allowed.",
      "No zero-result outcome may imply absence.",
      "No canonical or production data is written.",
      "No active, inactive, completed, actionable, route, fixture, standings, or season-state truth is asserted."
    ],
    workstreamFiles,
    masterQueueRows
  };

  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    retainedRawMapCompetitionCount: output.summary.retainedRawMapCompetitionCount,
    competitionCount: output.summary.competitionCount,
    activeExecutionWaveCompetitionCount: output.summary.activeExecutionWaveCompetitionCount,
    scopeAccountingNoActionCompetitionCount: output.summary.scopeAccountingNoActionCompetitionCount,
    activeWorkstreamCount: output.summary.activeWorkstreamCount,
    workstreamInputFileCount: output.summary.workstreamInputFileCount,
    masterQueueRowCount: output.summary.masterQueueRowCount,
    materializedInputCompetitionCount: output.summary.materializedInputCompetitionCount,
    sourceAuthorityTemplateMaterializationCompetitionCount: output.summary.sourceAuthorityTemplateMaterializationCompetitionCount,
    existingSignalTruthReviewCompetitionCount: output.summary.existingSignalTruthReviewCompetitionCount,
    blockedConfiguredFamilySourceTracebackCompetitionCount: output.summary.blockedConfiguredFamilySourceTracebackCompetitionCount,
    genericValidatorReadyFollowupCompetitionCount: output.summary.genericValidatorReadyFollowupCompetitionCount,
    priority1ReusableFamilyRepairCompetitionCount: output.summary.priority1ReusableFamilyRepairCompetitionCount,
    cupStateOrFinalWinnerReviewCompetitionCount: output.summary.cupStateOrFinalWinnerReviewCompetitionCount,
    policyReductionCandidateReviewCompetitionCount: output.summary.policyReductionCandidateReviewCompetitionCount,
    standingsFirstContractReviewCompetitionCount: output.summary.standingsFirstContractReviewCompetitionCount,
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
