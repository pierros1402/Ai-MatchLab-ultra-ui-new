#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULTS = {
  date: "2026-06-14",
  runnerInput: "data/football-truth/_diagnostics/controlled-sportomedia-graphql-payload-acquisition-execution-runner-2026-06-14/controlled-sportomedia-graphql-payload-acquisition-execution-runner-2026-06-14.json",
  output: "data/football-truth/_diagnostics/controlled-sportomedia-graphql-payload-acquisition-execution-runner-quality-gate-2026-06-14/controlled-sportomedia-graphql-payload-acquisition-execution-runner-quality-gate-2026-06-14.json"
};

const EXPECTED_SLUGS = ["swe.1", "swe.2"];

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--runner-input") args.runnerInput = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error("Unknown argument: " + arg);
  }
  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error("Missing JSON input: " + filePath);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n");
}

function assertSummary(summary, key, expected) {
  if (!(key in summary)) throw new Error("Missing summary key: " + key);
  if (summary[key] !== expected) {
    throw new Error("Guardrail failed for " + key + ": expected " + expected + ", got " + summary[key]);
  }
}

function uniqueSorted(values) {
  return [...new Set(values.filter((v) => v !== null && v !== undefined).map((v) => String(v).trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value = row[key] === null || row[key] === undefined || String(row[key]).trim() === "" ? "__missing__" : String(row[key]).trim();
    counts[value] = (counts[value] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function validateRunner(input) {
  const s = input.summary || {};

  assertSummary(s, "controlledSportomediaGraphqlPayloadAcquisitionExecutionRunnerCompetitionCount", 2);
  assertSummary(s, "controlledSportomediaGraphqlPayloadAcquisitionExecutionRunnerReadyCount", 2);
  assertSummary(s, "controlledSportomediaGraphqlPayloadAcquisitionExecutionRunnerBlockedCount", 0);
  assertSummary(s, "executionRunnerTargetCount", 2);
  assertSummary(s, "executionRunnerPrimaryRouteCandidateCount", 2);
  assertSummary(s, "executionRunnerRouteCandidateReferenceCount", 7);
  assertSummary(s, "executionRunnerCompleteCount", 2);
  assertSummary(s, "mayProceedToExecutionRunnerQualityGateCount", 2);
  assertSummary(s, "approvalAllowsRunnerBuildOnlyCount", 2);
  assertSummary(s, "mayRunControlledPayloadAcquisitionAfterFutureFinalApprovalCount", 2);

  assertSummary(s, "mayExecuteNowCount", 0);
  assertSummary(s, "mayFetchNowCount", 0);
  assertSummary(s, "maySearchNowCount", 0);
  assertSummary(s, "mayBroadSearchNowCount", 0);
  assertSummary(s, "mayClassifySeasonStateNowCount", 0);
  assertSummary(s, "mayWriteCanonicalNowCount", 0);
  assertSummary(s, "mayAssertTruthNowCount", 0);

  assertSummary(s, "executionRunnerBuiltCount", 2);
  assertSummary(s, "fetchExecutedNowCount", 0);
  assertSummary(s, "searchExecutedNowCount", 0);
  assertSummary(s, "broadSearchExecutedNowCount", 0);
  assertSummary(s, "classifierExecutedNowCount", 0);
  assertSummary(s, "canonicalWriteExecutedNowCount", 0);
  assertSummary(s, "productionWriteExecutedNowCount", 0);
  assertSummary(s, "activeAssertedCount", 0);
  assertSummary(s, "inactiveAssertedCount", 0);
  assertSummary(s, "completedAssertedCount", 0);
  assertSummary(s, "seasonStateTruthAssertedCount", 0);
  assertSummary(s, "graphqlRouteCandidatesTruthCount", 0);
  assertSummary(s, "executionRunnerTruthCount", 0);
  assertSummary(s, "canonicalWrites", 0);
  assertSummary(s, "productionWrite", false);
  assertSummary(s, "userHintUsedCount", 0);
  assertSummary(s, "hardcodedSeasonStateOverrideUsedCount", 0);

  const rows = Array.isArray(input.runnerRows) ? input.runnerRows : [];
  if (rows.length !== 2) throw new Error("Expected 2 runnerRows.");

  const slugs = uniqueSorted(rows.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Unexpected runner slugs: " + slugs.join(", "));
  }

  return rows;
}

function buildGateRow(row) {
  const blockingReasons = [];

  if (row.executionRunnerStatus !== "ready_for_controlled_sportomedia_graphql_payload_acquisition_execution_runner_quality_gate") {
    blockingReasons.push("execution_runner_not_quality_gate_ready");
  }
  if (row.executionRunnerComplete !== true) blockingReasons.push("execution_runner_not_complete");
  if (row.mayProceedToExecutionRunnerQualityGate !== true) blockingReasons.push("execution_runner_not_allowed_to_quality_gate");
  if (row.approvalAllowsRunnerBuildOnly !== true) blockingReasons.push("approval_scope_not_runner_build_only");
  if (row.executionRunnerBuilt !== true) blockingReasons.push("execution_runner_not_marked_built");
  if (!row.runnerTargetId) blockingReasons.push("missing_runner_target_id");
  if (!row.primaryRouteCandidate || !row.primaryRouteCandidate.value) blockingReasons.push("missing_primary_route_candidate");
  if (!row.executionRunnerDefinition || row.executionRunnerDefinition.runnerMode !== "controlled_diagnostics_only_sportomedia_graphql_payload_acquisition") {
    blockingReasons.push("missing_or_invalid_execution_runner_definition");
  }
  if (row.mayRunControlledPayloadAcquisitionAfterFutureFinalApproval !== true) {
    blockingReasons.push("future_final_approval_runnable_flag_missing");
  }

  if (row.mayExecuteNow !== false) blockingReasons.push("runner_would_execute_now");
  if (row.mayFetchNow !== false) blockingReasons.push("runner_would_fetch_now");
  if (row.maySearchNow !== false) blockingReasons.push("runner_would_search_now");
  if (row.mayBroadSearchNow !== false) blockingReasons.push("runner_would_broad_search_now");
  if (row.mayClassifySeasonStateNow !== false) blockingReasons.push("runner_would_classify_now");
  if (row.mayWriteCanonicalNow !== false) blockingReasons.push("runner_would_write_canonical_now");
  if (row.mayAssertTruthNow !== false) blockingReasons.push("runner_would_assert_truth_now");

  if (row.fetchExecutedNow !== false) blockingReasons.push("runner_builder_fetched");
  if (row.searchExecutedNow !== false) blockingReasons.push("runner_builder_searched");
  if (row.broadSearchExecutedNow !== false) blockingReasons.push("runner_builder_broad_searched");
  if (row.classifierExecutedNow !== false) blockingReasons.push("runner_builder_classified");
  if (row.canonicalWriteExecutedNow !== false) blockingReasons.push("runner_builder_wrote_canonical");
  if (row.productionWriteExecutedNow !== false) blockingReasons.push("runner_builder_wrote_production");
  if (row.seasonStateTruthAssertedNow !== false) blockingReasons.push("runner_builder_asserted_truth");
  if (row.graphqlRouteCandidatesAreTruth !== false) blockingReasons.push("graphql_route_candidate_marked_truth");
  if (row.executionRunnerIsTruth !== false) blockingReasons.push("execution_runner_marked_truth");
  if (row.userHintUsed !== false) blockingReasons.push("user_hint_used");
  if (row.hardcodedSeasonStateOverrideUsed !== false) blockingReasons.push("hardcoded_override_used");

  const qualityGateStatus =
    blockingReasons.length === 0
      ? "passed_controlled_sportomedia_graphql_payload_acquisition_execution_runner_quality_gate"
      : "blocked_controlled_sportomedia_graphql_payload_acquisition_execution_runner_quality_gate";

  return {
    competitionSlug: row.competitionSlug,
    reusableFamily: row.reusableFamily,
    qualityGateStatus,
    blockingReasons,

    runnerTargetId: row.runnerTargetId,
    runnerTargetScope: row.runnerTargetScope,
    runnerTargetPurpose: row.runnerTargetPurpose,
    primaryRouteCandidate: row.primaryRouteCandidate,
    allRouteCandidateCount: row.allRouteCandidateCount,
    executionRunnerComplete: row.executionRunnerComplete,
    executionRunnerBuilt: row.executionRunnerBuilt,

    mayPrepareFinalExplicitControlledPayloadAcquisitionExecutionRunApproval:
      qualityGateStatus === "passed_controlled_sportomedia_graphql_payload_acquisition_execution_runner_quality_gate",

    qualityGateIsExecutionPermissionNow: false,
    qualityGateIsFetchPermissionNow: false,

    mayExecuteNow: false,
    mayFetchNow: false,
    maySearchNow: false,
    mayBroadSearchNow: false,
    mayClassifySeasonStateNow: false,
    mayWriteCanonicalNow: false,
    mayAssertTruthNow: false,

    fetchExecutedNow: false,
    searchExecutedNow: false,
    broadSearchExecutedNow: false,
    classifierExecutedNow: false,
    canonicalWriteExecutedNow: false,
    productionWriteExecutedNow: false,
    activeAssertedNow: false,
    inactiveAssertedNow: false,
    completedAssertedNow: false,
    seasonStateTruthAssertedNow: false,
    graphqlRouteCandidatesAreTruth: false,
    executionRunnerIsTruth: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    zeroResultDoesNotImplyAbsence: true,
    missingEmbeddedRowsDoesNotProveAbsence: true,
    noMatchTodayDoesNotImplyInactive: true,

    nextAllowedStep:
      qualityGateStatus === "passed_controlled_sportomedia_graphql_payload_acquisition_execution_runner_quality_gate"
        ? "prepare_final_explicit_controlled_sportomedia_graphql_payload_acquisition_execution_run_approval"
        : "repair_controlled_sportomedia_graphql_payload_acquisition_execution_runner",
    nextBlockedStep: "controlled_graphql_payload_fetch_classifier_canonical_write_truth_assertions_blocked_until_final_execution_approval"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const runner = readJson(args.runnerInput);
  const runnerRows = validateRunner(runner);

  const qualityGateRows = runnerRows
    .map(buildGateRow)
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const passedRows = qualityGateRows.filter((row) => row.qualityGateStatus === "passed_controlled_sportomedia_graphql_payload_acquisition_execution_runner_quality_gate");
  const blockedRows = qualityGateRows.filter((row) => row.qualityGateStatus !== "passed_controlled_sportomedia_graphql_payload_acquisition_execution_runner_quality_gate");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "run-football-truth-controlled-sportomedia-graphql-payload-acquisition-execution-runner-quality-gate-file",
    mode: "run_controlled_sportomedia_graphql_payload_acquisition_execution_runner_quality_gate_no_fetch_no_search_no_classifier_no_truth_assertion_no_write",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      controlledSportomediaGraphqlPayloadAcquisitionExecutionRunner: args.runnerInput
    },
    summary: {
      controlledSportomediaGraphqlPayloadAcquisitionExecutionRunnerQualityGateCompetitionCount: qualityGateRows.length,
      controlledSportomediaGraphqlPayloadAcquisitionExecutionRunnerQualityGatePassedCount: passedRows.length,
      controlledSportomediaGraphqlPayloadAcquisitionExecutionRunnerQualityGateBlockedCount: blockedRows.length,

      qualityGatedExecutionRunnerTargetCount: qualityGateRows.filter((row) => row.runnerTargetId).length,
      qualityGatedPrimaryRouteCandidateCount: qualityGateRows.filter((row) => row.primaryRouteCandidate && row.primaryRouteCandidate.value).length,
      qualityGatedRouteCandidateReferenceCount: qualityGateRows.reduce((sum, row) => sum + row.allRouteCandidateCount, 0),

      executionRunnerCompleteCount: qualityGateRows.filter((row) => row.executionRunnerComplete).length,
      executionRunnerBuiltCount: qualityGateRows.filter((row) => row.executionRunnerBuilt).length,

      mayPrepareFinalExplicitControlledPayloadAcquisitionExecutionRunApprovalCount:
        qualityGateRows.filter((row) => row.mayPrepareFinalExplicitControlledPayloadAcquisitionExecutionRunApproval).length,

      qualityGateIsExecutionPermissionNowCount: qualityGateRows.filter((row) => row.qualityGateIsExecutionPermissionNow).length,
      qualityGateIsFetchPermissionNowCount: qualityGateRows.filter((row) => row.qualityGateIsFetchPermissionNow).length,

      mayExecuteNowCount: 0,
      mayFetchNowCount: 0,
      maySearchNowCount: 0,
      mayBroadSearchNowCount: 0,
      mayClassifySeasonStateNowCount: 0,
      mayWriteCanonicalNowCount: 0,
      mayAssertTruthNowCount: 0,

      fetchExecutedNowCount: 0,
      searchExecutedNowCount: 0,
      broadSearchExecutedNowCount: 0,
      classifierExecutedNowCount: 0,
      canonicalWriteExecutedNowCount: 0,
      productionWriteExecutedNowCount: 0,
      activeAssertedCount: 0,
      inactiveAssertedCount: 0,
      completedAssertedCount: 0,
      seasonStateTruthAssertedCount: 0,
      graphqlRouteCandidatesTruthCount: 0,
      executionRunnerTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        blockedRows.length === 0
          ? "prepare_final_explicit_controlled_sportomedia_graphql_payload_acquisition_execution_run_approval"
          : "repair_controlled_sportomedia_graphql_payload_acquisition_execution_runner"
    },
    counts: {
      byQualityGateStatus: countBy(qualityGateRows, "qualityGateStatus"),
      byNextAllowedStep: countBy(qualityGateRows, "nextAllowedStep")
    },
    guardrails: [
      "This quality gate reads the controlled Sportomedia GraphQL execution runner only.",
      "It does not execute the runner.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a season-state classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Passing this quality gate only allows preparing final explicit execution approval.",
      "Passing this quality gate does not allow execution or fetch now.",
      "Execution runner rows are not truth assertions.",
      "GraphQL route candidates are not truth assertions.",
      "Missing embedded rows does not prove absence.",
      "No match today must not imply inactive.",
      "Zero result must not imply absence."
    ],
    qualityGateRows,
    blockedRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    controlledSportomediaGraphqlPayloadAcquisitionExecutionRunnerQualityGateCompetitionCount: output.summary.controlledSportomediaGraphqlPayloadAcquisitionExecutionRunnerQualityGateCompetitionCount,
    controlledSportomediaGraphqlPayloadAcquisitionExecutionRunnerQualityGatePassedCount: output.summary.controlledSportomediaGraphqlPayloadAcquisitionExecutionRunnerQualityGatePassedCount,
    controlledSportomediaGraphqlPayloadAcquisitionExecutionRunnerQualityGateBlockedCount: output.summary.controlledSportomediaGraphqlPayloadAcquisitionExecutionRunnerQualityGateBlockedCount,
    qualityGatedExecutionRunnerTargetCount: output.summary.qualityGatedExecutionRunnerTargetCount,
    qualityGatedPrimaryRouteCandidateCount: output.summary.qualityGatedPrimaryRouteCandidateCount,
    qualityGatedRouteCandidateReferenceCount: output.summary.qualityGatedRouteCandidateReferenceCount,
    executionRunnerCompleteCount: output.summary.executionRunnerCompleteCount,
    executionRunnerBuiltCount: output.summary.executionRunnerBuiltCount,
    mayPrepareFinalExplicitControlledPayloadAcquisitionExecutionRunApprovalCount: output.summary.mayPrepareFinalExplicitControlledPayloadAcquisitionExecutionRunApprovalCount,
    qualityGateIsExecutionPermissionNowCount: output.summary.qualityGateIsExecutionPermissionNowCount,
    qualityGateIsFetchPermissionNowCount: output.summary.qualityGateIsFetchPermissionNowCount,
    mayExecuteNowCount: output.summary.mayExecuteNowCount,
    mayFetchNowCount: output.summary.mayFetchNowCount,
    maySearchNowCount: output.summary.maySearchNowCount,
    mayBroadSearchNowCount: output.summary.mayBroadSearchNowCount,
    mayClassifySeasonStateNowCount: output.summary.mayClassifySeasonStateNowCount,
    mayWriteCanonicalNowCount: output.summary.mayWriteCanonicalNowCount,
    mayAssertTruthNowCount: output.summary.mayAssertTruthNowCount,
    fetchExecutedNowCount: output.summary.fetchExecutedNowCount,
    searchExecutedNowCount: output.summary.searchExecutedNowCount,
    broadSearchExecutedNowCount: output.summary.broadSearchExecutedNowCount,
    classifierExecutedNowCount: output.summary.classifierExecutedNowCount,
    canonicalWriteExecutedNowCount: output.summary.canonicalWriteExecutedNowCount,
    productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
    activeAssertedCount: output.summary.activeAssertedCount,
    inactiveAssertedCount: output.summary.inactiveAssertedCount,
    completedAssertedCount: output.summary.completedAssertedCount,
    seasonStateTruthAssertedCount: output.summary.seasonStateTruthAssertedCount,
    graphqlRouteCandidatesTruthCount: output.summary.graphqlRouteCandidatesTruthCount,
    executionRunnerTruthCount: output.summary.executionRunnerTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    userHintUsedCount: output.summary.userHintUsedCount,
    hardcodedSeasonStateOverrideUsedCount: output.summary.hardcodedSeasonStateOverrideUsedCount,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
