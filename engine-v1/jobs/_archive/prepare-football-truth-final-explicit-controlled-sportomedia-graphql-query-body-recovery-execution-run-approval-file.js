#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULTS = {
  date: "2026-06-14",
  gateInput: "data/football-truth/_diagnostics/controlled-sportomedia-graphql-query-body-recovery-execution-runner-quality-gate-2026-06-14/controlled-sportomedia-graphql-query-body-recovery-execution-runner-quality-gate-2026-06-14.json",
  output: "data/football-truth/_diagnostics/final-explicit-controlled-sportomedia-graphql-query-body-recovery-execution-run-approval-2026-06-14/final-explicit-controlled-sportomedia-graphql-query-body-recovery-execution-run-approval-2026-06-14.json"
};

const EXPECTED_SLUGS = ["swe.1", "swe.2"];

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--gate-input") args.gateInput = argv[++i];
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

function validateGate(input) {
  const s = input.summary || {};

  assertSummary(s, "controlledSportomediaGraphqlQueryBodyRecoveryExecutionRunnerQualityGateCompetitionCount", 2);
  assertSummary(s, "controlledSportomediaGraphqlQueryBodyRecoveryExecutionRunnerQualityGatePassedCount", 2);
  assertSummary(s, "controlledSportomediaGraphqlQueryBodyRecoveryExecutionRunnerQualityGateBlockedCount", 0);
  assertSummary(s, "qualityGatedExecutionRunnerTargetCount", 2);
  assertSummary(s, "qualityGatedPrimaryOperationCandidateCount", 2);
  assertSummary(s, "qualityGatedOperationCandidateCount", 16);
  assertSummary(s, "qualityGatedHighConfidenceOperationCandidateCount", 2);
  assertSummary(s, "qualityGatedGraphqlQueryTextCandidateCount", 0);
  assertSummary(s, "qualityGatedGraphqlBodyLikeCandidateCount", 8);
  assertSummary(s, "qualityGatedOperationNameCandidateCount", 0);
  assertSummary(s, "qualityGatedPersistedQueryCandidateCount", 8);
  assertSummary(s, "executionRunnerCompleteCount", 2);
  assertSummary(s, "executionRunnerBuiltCount", 2);
  assertSummary(s, "mayPrepareFinalQueryBodyRecoveryExecutionRunApprovalCount", 2);
  assertSummary(s, "qualityGateIsExecutionPermissionNowCount", 0);
  assertSummary(s, "qualityGateIsFetchPermissionNowCount", 0);

  assertSummary(s, "mayExecuteNowCount", 0);
  assertSummary(s, "mayFetchNowCount", 0);
  assertSummary(s, "maySearchNowCount", 0);
  assertSummary(s, "mayBroadSearchNowCount", 0);
  assertSummary(s, "mayClassifySeasonStateNowCount", 0);
  assertSummary(s, "mayWriteCanonicalNowCount", 0);
  assertSummary(s, "mayAssertTruthNowCount", 0);

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
  assertSummary(s, "queryBodyCandidatesTruthCount", 0);
  assertSummary(s, "executionRunnerTruthCount", 0);
  assertSummary(s, "canonicalWrites", 0);
  assertSummary(s, "productionWrite", false);
  assertSummary(s, "userHintUsedCount", 0);
  assertSummary(s, "hardcodedSeasonStateOverrideUsedCount", 0);

  const rows = Array.isArray(input.qualityGateRows) ? input.qualityGateRows : [];
  if (rows.length !== 2) throw new Error("Expected 2 qualityGateRows.");

  const slugs = uniqueSorted(rows.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Unexpected quality gate slugs: " + slugs.join(", "));
  }

  for (const row of rows) {
    if (row.qualityGateStatus !== "passed_controlled_sportomedia_graphql_query_body_recovery_execution_runner_quality_gate") {
      throw new Error(row.competitionSlug + ": quality gate did not pass.");
    }
    if (row.mayPrepareFinalQueryBodyRecoveryExecutionRunApproval !== true) {
      throw new Error(row.competitionSlug + ": mayPrepareFinalQueryBodyRecoveryExecutionRunApproval must be true.");
    }
    if (!row.primaryOperationCandidate) throw new Error(row.competitionSlug + ": missing primary operation candidate.");
    if (row.qualityGateIsExecutionPermissionNow !== false || row.qualityGateIsFetchPermissionNow !== false) {
      throw new Error(row.competitionSlug + ": quality gate must not be execution/fetch permission now.");
    }
  }

  return rows;
}

function buildFinalApprovalRow(row) {
  const blockingReasons = [];

  if (row.qualityGateStatus !== "passed_controlled_sportomedia_graphql_query_body_recovery_execution_runner_quality_gate") {
    blockingReasons.push("query_body_recovery_execution_runner_quality_gate_not_passed");
  }
  if (row.mayPrepareFinalQueryBodyRecoveryExecutionRunApproval !== true) {
    blockingReasons.push("quality_gate_does_not_allow_final_execution_approval");
  }
  if (!row.runnerTargetId) blockingReasons.push("missing_runner_target_id");
  if (!row.primaryOperationCandidate) blockingReasons.push("missing_primary_operation_candidate");
  if (Number(row.highConfidenceOperationCandidateCount || 0) < 1) blockingReasons.push("missing_high_confidence_operation_candidate");
  if (row.qualityGateIsExecutionPermissionNow !== false) blockingReasons.push("quality_gate_is_execution_permission_now");
  if (row.qualityGateIsFetchPermissionNow !== false) blockingReasons.push("quality_gate_is_fetch_permission_now");

  if (row.mayExecuteNow !== false) blockingReasons.push("quality_gate_would_execute_now");
  if (row.mayFetchNow !== false) blockingReasons.push("quality_gate_would_fetch_now");
  if (row.maySearchNow !== false) blockingReasons.push("quality_gate_would_search_now");
  if (row.mayBroadSearchNow !== false) blockingReasons.push("quality_gate_would_broad_search_now");
  if (row.mayClassifySeasonStateNow !== false) blockingReasons.push("quality_gate_would_classify_now");
  if (row.mayWriteCanonicalNow !== false) blockingReasons.push("quality_gate_would_write_canonical_now");
  if (row.mayAssertTruthNow !== false) blockingReasons.push("quality_gate_would_assert_truth_now");

  const finalApprovalStatus =
    blockingReasons.length === 0
      ? "approved_for_next_step_controlled_sportomedia_graphql_query_body_recovery_execution"
      : "blocked_final_explicit_controlled_sportomedia_graphql_query_body_recovery_execution_run_approval";

  return {
    competitionSlug: row.competitionSlug,
    reusableFamily: row.reusableFamily,
    finalApprovalStatus,
    blockingReasons,

    runnerTargetId: row.runnerTargetId,
    runnerTargetScope: row.runnerTargetScope,
    runnerTargetPurpose: row.runnerTargetPurpose,
    endpointReachableButInsufficientPayload: row.endpointReachableButInsufficientPayload,
    queryBodyRecoveryNeeded: row.queryBodyRecoveryNeeded,

    primaryOperationCandidate: row.primaryOperationCandidate,
    operationCandidateCount: row.operationCandidateCount,
    highConfidenceOperationCandidateCount: row.highConfidenceOperationCandidateCount,
    graphqlQueryTextCandidateCount: row.graphqlQueryTextCandidateCount,
    graphqlBodyLikeCandidateCount: row.graphqlBodyLikeCandidateCount,
    operationNameCandidateCount: row.operationNameCandidateCount,
    persistedQueryCandidateCount: row.persistedQueryCandidateCount,

    finalApprovedExecutionScope: "sportomedia_official_standings_graphql_query_body_recovery_only",
    finalApprovedExecutionMode: "controlled_diagnostics_only_query_body_recovery",
    finalApprovalAllowsNextExecutionRunnerRun: finalApprovalStatus === "approved_for_next_step_controlled_sportomedia_graphql_query_body_recovery_execution",
    finalApprovalAllowsFetchInNextSeparateRunnerOnly: finalApprovalStatus === "approved_for_next_step_controlled_sportomedia_graphql_query_body_recovery_execution",

    mayRunControlledQueryBodyRecoveryNext: finalApprovalStatus === "approved_for_next_step_controlled_sportomedia_graphql_query_body_recovery_execution",
    finalRunWouldAllowControlledQueryBodyRecovery: finalApprovalStatus === "approved_for_next_step_controlled_sportomedia_graphql_query_body_recovery_execution",
    finalRunWouldAllowConfiguredGraphqlPayloadFetch: finalApprovalStatus === "approved_for_next_step_controlled_sportomedia_graphql_query_body_recovery_execution",
    finalRunWouldAllowSearch: false,
    finalRunWouldAllowBroadSearch: false,
    finalRunWouldAllowClassifier: false,
    finalRunWouldAllowCanonicalWrite: false,
    finalRunWouldAllowProductionWrite: false,
    finalRunWouldAllowTruthAssertion: false,

    mayExecuteNow: false,
    mayFetchNow: false,
    maySearchNow: false,
    mayBroadSearchNow: false,
    mayClassifySeasonStateNow: false,
    mayWriteCanonicalNow: false,
    mayAssertTruthNow: false,

    executionApprovalPreparedNow: true,
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
    queryBodyCandidatesAreTruth: false,
    finalApprovalIsTruth: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    zeroResultDoesNotImplyAbsence: true,
    missingStandingKeywordDoesNotProveAbsence: true,
    noMatchTodayDoesNotImplyInactive: true,

    nextAllowedStep:
      finalApprovalStatus === "approved_for_next_step_controlled_sportomedia_graphql_query_body_recovery_execution"
        ? "run_controlled_sportomedia_graphql_query_body_recovery_execution"
        : "repair_final_explicit_controlled_sportomedia_graphql_query_body_recovery_execution_run_approval",
    nextBlockedStep: "classifier_canonical_write_production_write_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const gate = readJson(args.gateInput);
  const gateRows = validateGate(gate);

  const finalApprovalRows = gateRows
    .map(buildFinalApprovalRow)
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const approvedRows = finalApprovalRows.filter((row) => row.finalApprovalStatus === "approved_for_next_step_controlled_sportomedia_graphql_query_body_recovery_execution");
  const blockedRows = finalApprovalRows.filter((row) => row.finalApprovalStatus !== "approved_for_next_step_controlled_sportomedia_graphql_query_body_recovery_execution");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "prepare-football-truth-final-explicit-controlled-sportomedia-graphql-query-body-recovery-execution-run-approval-file",
    mode: "prepare_final_explicit_controlled_sportomedia_graphql_query_body_recovery_execution_run_approval_no_fetch_no_search_no_classifier_no_truth_assertion_no_write",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      controlledSportomediaGraphqlQueryBodyRecoveryExecutionRunnerQualityGate: args.gateInput
    },
    summary: {
      finalExplicitControlledSportomediaGraphqlQueryBodyRecoveryExecutionRunApprovalCompetitionCount: finalApprovalRows.length,
      finalExplicitControlledSportomediaGraphqlQueryBodyRecoveryExecutionRunApprovalApprovedCount: approvedRows.length,
      finalExplicitControlledSportomediaGraphqlQueryBodyRecoveryExecutionRunApprovalBlockedCount: blockedRows.length,

      approvedRunnerTargetCount: finalApprovalRows.filter((row) => row.runnerTargetId).length,
      approvedPrimaryOperationCandidateCount: finalApprovalRows.filter((row) => row.primaryOperationCandidate).length,
      approvedOperationCandidateCount: finalApprovalRows.reduce((sum, row) => sum + Number(row.operationCandidateCount || 0), 0),
      approvedHighConfidenceOperationCandidateCount: finalApprovalRows.reduce((sum, row) => sum + Number(row.highConfidenceOperationCandidateCount || 0), 0),
      approvedGraphqlQueryTextCandidateCount: finalApprovalRows.reduce((sum, row) => sum + Number(row.graphqlQueryTextCandidateCount || 0), 0),
      approvedGraphqlBodyLikeCandidateCount: finalApprovalRows.reduce((sum, row) => sum + Number(row.graphqlBodyLikeCandidateCount || 0), 0),
      approvedOperationNameCandidateCount: finalApprovalRows.reduce((sum, row) => sum + Number(row.operationNameCandidateCount || 0), 0),
      approvedPersistedQueryCandidateCount: finalApprovalRows.reduce((sum, row) => sum + Number(row.persistedQueryCandidateCount || 0), 0),

      mayRunControlledQueryBodyRecoveryNextCount: finalApprovalRows.filter((row) => row.mayRunControlledQueryBodyRecoveryNext).length,
      finalRunWouldAllowControlledQueryBodyRecoveryCount: finalApprovalRows.filter((row) => row.finalRunWouldAllowControlledQueryBodyRecovery).length,
      finalRunWouldAllowConfiguredGraphqlPayloadFetchCount: finalApprovalRows.filter((row) => row.finalRunWouldAllowConfiguredGraphqlPayloadFetch).length,

      finalRunWouldAllowSearchCount: finalApprovalRows.filter((row) => row.finalRunWouldAllowSearch).length,
      finalRunWouldAllowBroadSearchCount: finalApprovalRows.filter((row) => row.finalRunWouldAllowBroadSearch).length,
      finalRunWouldAllowClassifierCount: finalApprovalRows.filter((row) => row.finalRunWouldAllowClassifier).length,
      finalRunWouldAllowCanonicalWriteCount: finalApprovalRows.filter((row) => row.finalRunWouldAllowCanonicalWrite).length,
      finalRunWouldAllowProductionWriteCount: finalApprovalRows.filter((row) => row.finalRunWouldAllowProductionWrite).length,
      finalRunWouldAllowTruthAssertionCount: finalApprovalRows.filter((row) => row.finalRunWouldAllowTruthAssertion).length,

      mayExecuteNowCount: 0,
      mayFetchNowCount: 0,
      maySearchNowCount: 0,
      mayBroadSearchNowCount: 0,
      mayClassifySeasonStateNowCount: 0,
      mayWriteCanonicalNowCount: 0,
      mayAssertTruthNowCount: 0,

      executionApprovalPreparedNowCount: finalApprovalRows.filter((row) => row.executionApprovalPreparedNow).length,
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
      queryBodyCandidatesTruthCount: 0,
      finalApprovalTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        blockedRows.length === 0
          ? "run_controlled_sportomedia_graphql_query_body_recovery_execution"
          : "repair_final_explicit_controlled_sportomedia_graphql_query_body_recovery_execution_run_approval"
    },
    counts: {
      byFinalApprovalStatus: countBy(finalApprovalRows, "finalApprovalStatus"),
      byNextAllowedStep: countBy(finalApprovalRows, "nextAllowedStep")
    },
    guardrails: [
      "This final approval reads the Sportomedia query/body recovery execution runner quality gate only.",
      "It does not execute the runner.",
      "It does not fetch now.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a season-state classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "It only authorizes the next separate controlled diagnostics-only query/body recovery execution run.",
      "The next run may fetch only the approved Sportomedia GraphQL query/body recovery targets.",
      "The next run may not search, classify, write canonical data, write production data, or assert truth.",
      "Query/body candidates are not truth assertions.",
      "Final approval rows are not truth assertions.",
      "Endpoint reachability is not standings truth.",
      "Missing standing keyword does not prove absence.",
      "No match today must not imply inactive.",
      "Zero result must not imply absence."
    ],
    finalApprovalRows,
    blockedRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    finalExplicitControlledSportomediaGraphqlQueryBodyRecoveryExecutionRunApprovalCompetitionCount: output.summary.finalExplicitControlledSportomediaGraphqlQueryBodyRecoveryExecutionRunApprovalCompetitionCount,
    finalExplicitControlledSportomediaGraphqlQueryBodyRecoveryExecutionRunApprovalApprovedCount: output.summary.finalExplicitControlledSportomediaGraphqlQueryBodyRecoveryExecutionRunApprovalApprovedCount,
    finalExplicitControlledSportomediaGraphqlQueryBodyRecoveryExecutionRunApprovalBlockedCount: output.summary.finalExplicitControlledSportomediaGraphqlQueryBodyRecoveryExecutionRunApprovalBlockedCount,
    approvedRunnerTargetCount: output.summary.approvedRunnerTargetCount,
    approvedPrimaryOperationCandidateCount: output.summary.approvedPrimaryOperationCandidateCount,
    approvedOperationCandidateCount: output.summary.approvedOperationCandidateCount,
    approvedHighConfidenceOperationCandidateCount: output.summary.approvedHighConfidenceOperationCandidateCount,
    approvedGraphqlQueryTextCandidateCount: output.summary.approvedGraphqlQueryTextCandidateCount,
    approvedGraphqlBodyLikeCandidateCount: output.summary.approvedGraphqlBodyLikeCandidateCount,
    approvedOperationNameCandidateCount: output.summary.approvedOperationNameCandidateCount,
    approvedPersistedQueryCandidateCount: output.summary.approvedPersistedQueryCandidateCount,
    mayRunControlledQueryBodyRecoveryNextCount: output.summary.mayRunControlledQueryBodyRecoveryNextCount,
    finalRunWouldAllowControlledQueryBodyRecoveryCount: output.summary.finalRunWouldAllowControlledQueryBodyRecoveryCount,
    finalRunWouldAllowConfiguredGraphqlPayloadFetchCount: output.summary.finalRunWouldAllowConfiguredGraphqlPayloadFetchCount,
    finalRunWouldAllowSearchCount: output.summary.finalRunWouldAllowSearchCount,
    finalRunWouldAllowBroadSearchCount: output.summary.finalRunWouldAllowBroadSearchCount,
    finalRunWouldAllowClassifierCount: output.summary.finalRunWouldAllowClassifierCount,
    finalRunWouldAllowCanonicalWriteCount: output.summary.finalRunWouldAllowCanonicalWriteCount,
    finalRunWouldAllowProductionWriteCount: output.summary.finalRunWouldAllowProductionWriteCount,
    finalRunWouldAllowTruthAssertionCount: output.summary.finalRunWouldAllowTruthAssertionCount,
    mayExecuteNowCount: output.summary.mayExecuteNowCount,
    mayFetchNowCount: output.summary.mayFetchNowCount,
    maySearchNowCount: output.summary.maySearchNowCount,
    mayBroadSearchNowCount: output.summary.mayBroadSearchNowCount,
    mayClassifySeasonStateNowCount: output.summary.mayClassifySeasonStateNowCount,
    mayWriteCanonicalNowCount: output.summary.mayWriteCanonicalNowCount,
    mayAssertTruthNowCount: output.summary.mayAssertTruthNowCount,
    executionApprovalPreparedNowCount: output.summary.executionApprovalPreparedNowCount,
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
    queryBodyCandidatesTruthCount: output.summary.queryBodyCandidatesTruthCount,
    finalApprovalTruthCount: output.summary.finalApprovalTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    userHintUsedCount: output.summary.userHintUsedCount,
    hardcodedSeasonStateOverrideUsedCount: output.summary.hardcodedSeasonStateOverrideUsedCount,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
