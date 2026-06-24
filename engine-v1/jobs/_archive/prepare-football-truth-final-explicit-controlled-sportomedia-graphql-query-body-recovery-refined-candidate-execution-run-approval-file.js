#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULTS = {
  date: "2026-06-14",
  gateInput: "data/football-truth/_diagnostics/next-controlled-sportomedia-graphql-query-body-recovery-candidate-execution-runner-quality-gate-2026-06-14/next-controlled-sportomedia-graphql-query-body-recovery-candidate-execution-runner-quality-gate-2026-06-14.json",
  output: "data/football-truth/_diagnostics/final-explicit-controlled-sportomedia-graphql-query-body-recovery-refined-candidate-execution-run-approval-2026-06-14/final-explicit-controlled-sportomedia-graphql-query-body-recovery-refined-candidate-execution-run-approval-2026-06-14.json"
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

  assertSummary(s, "nextControlledSportomediaGraphqlQueryBodyRecoveryCandidateExecutionRunnerQualityGateCompetitionCount", 2);
  assertSummary(s, "nextControlledSportomediaGraphqlQueryBodyRecoveryCandidateExecutionRunnerQualityGatePassedCount", 2);
  assertSummary(s, "nextControlledSportomediaGraphqlQueryBodyRecoveryCandidateExecutionRunnerQualityGateBlockedCount", 0);
  assertSummary(s, "qualityGatedExecutionRunnerTargetCount", 2);
  assertSummary(s, "qualityGatedPreviousPersistedQueryIdCandidateRejectedCount", 2);
  assertSummary(s, "qualityGatedPreviousHttp400Count", 2);
  assertSummary(s, "qualityGatedPreviousErrorResponseCount", 2);
  assertSummary(s, "qualityGatedPreviousDataResponseCount", 0);
  assertSummary(s, "qualityGatedPreviousPayloadCandidateResponseCount", 0);
  assertSummary(s, "qualityGatedPrimaryRefinementCandidateCount", 2);
  assertSummary(s, "qualityGatedPrimaryBodyLikeCandidateCount", 2);
  assertSummary(s, "qualityGatedPrimaryPersistedQueryCandidateCount", 0);
  assertSummary(s, "qualityGatedRemainingCandidateCount", 16);
  assertSummary(s, "qualityGatedRemainingBodyLikeCandidateCount", 8);
  assertSummary(s, "qualityGatedRemainingPersistedQueryCandidateCount", 8);
  assertSummary(s, "qualityGatedRemainingHashLikePersistedCandidateCount", 0);
  assertSummary(s, "executionRunnerCompleteCount", 2);
  assertSummary(s, "executionRunnerBuiltCount", 2);
  assertSummary(s, "mayPrepareNextCandidateFinalExecutionApprovalCount", 2);
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
  assertSummary(s, "executionRunnerTruthCount", 0);
  assertSummary(s, "queryBodyCandidatesTruthCount", 0);
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
    if (row.qualityGateStatus !== "passed_next_controlled_sportomedia_graphql_query_body_recovery_candidate_execution_runner_quality_gate") {
      throw new Error(row.competitionSlug + ": refined-candidate quality gate did not pass.");
    }
    if (row.primaryRefinementCandidateType !== "graphqlBodyLikeObject") {
      throw new Error(row.competitionSlug + ": primary refinement candidate must be graphqlBodyLikeObject.");
    }
    if (row.previousRequestBodyVariant !== "persisted_query_id_candidate") {
      throw new Error(row.competitionSlug + ": previous request body variant must be persisted_query_id_candidate.");
    }
    if (Number(row.previousHttpStatus) !== 400) {
      throw new Error(row.competitionSlug + ": previous HTTP status must be 400.");
    }
    if (row.mayPrepareNextCandidateFinalExecutionApproval !== true) {
      throw new Error(row.competitionSlug + ": mayPrepareNextCandidateFinalExecutionApproval must be true.");
    }
    if (row.qualityGateIsExecutionPermissionNow !== false || row.qualityGateIsFetchPermissionNow !== false) {
      throw new Error(row.competitionSlug + ": quality gate must not be execution/fetch permission now.");
    }
  }

  return rows;
}

function buildApprovalRow(row) {
  const blockingReasons = [];

  if (row.qualityGateStatus !== "passed_next_controlled_sportomedia_graphql_query_body_recovery_candidate_execution_runner_quality_gate") {
    blockingReasons.push("refined_candidate_execution_runner_quality_gate_not_passed");
  }
  if (row.mayPrepareNextCandidateFinalExecutionApproval !== true) {
    blockingReasons.push("quality_gate_does_not_allow_final_refined_candidate_execution_approval");
  }
  if (!row.runnerTargetId) blockingReasons.push("missing_runner_target_id");
  if (!row.primaryRefinementCandidate) blockingReasons.push("missing_primary_refinement_candidate");
  if (row.primaryRefinementCandidateType !== "graphqlBodyLikeObject") {
    blockingReasons.push("primary_refinement_candidate_not_body_like");
  }
  if (row.previousRequestBodyVariant !== "persisted_query_id_candidate") {
    blockingReasons.push("previous_request_body_variant_not_persisted_id");
  }
  if (Number(row.previousHttpStatus) !== 400) {
    blockingReasons.push("previous_http_status_not_400");
  }
  if (row.previousResponseHasErrorsKey !== true) {
    blockingReasons.push("previous_response_errors_key_missing");
  }
  if (row.previousResponseHasDataKey !== false) {
    blockingReasons.push("previous_response_had_data_key");
  }
  if (row.previousQueryBodyRecoveryResponseCandidate !== false) {
    blockingReasons.push("previous_response_already_payload_candidate");
  }
  if (row.executionRunnerComplete !== true) blockingReasons.push("execution_runner_not_complete");
  if (row.executionRunnerBuilt !== true) blockingReasons.push("execution_runner_not_built");
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
      ? "approved_for_next_step_controlled_sportomedia_graphql_query_body_recovery_refined_candidate_execution"
      : "blocked_final_explicit_controlled_sportomedia_graphql_query_body_recovery_refined_candidate_execution_run_approval";

  return {
    competitionSlug: row.competitionSlug,
    reusableFamily: row.reusableFamily,
    finalApprovalStatus,
    blockingReasons,

    runnerTargetId: row.runnerTargetId,
    runnerTargetScope: row.runnerTargetScope,
    runnerTargetPurpose: row.runnerTargetPurpose,

    previousResponseReviewStatus: row.previousResponseReviewStatus,
    previousRefinementStatus: row.previousRefinementStatus,
    previousHttpStatus: row.previousHttpStatus,
    previousRequestBodyVariant: row.previousRequestBodyVariant,
    previousRequestBodyBuildStatus: row.previousRequestBodyBuildStatus,
    previousExecutionStatus: row.previousExecutionStatus,
    previousResponseHasErrorsKey: row.previousResponseHasErrorsKey,
    previousResponseHasDataKey: row.previousResponseHasDataKey,
    previousQueryBodyRecoveryResponseCandidate: row.previousQueryBodyRecoveryResponseCandidate,

    primaryRefinementCandidate: row.primaryRefinementCandidate,
    primaryRefinementCandidateType: row.primaryRefinementCandidateType,
    primaryRefinementCandidateScore: row.primaryRefinementCandidateScore,
    primaryRefinementCandidateSource: row.primaryRefinementCandidateSource,
    primaryRefinementCandidateSha256: row.primaryRefinementCandidateSha256,

    remainingCandidateCount: row.remainingCandidateCount,
    remainingBodyLikeCandidateCount: row.remainingBodyLikeCandidateCount,
    remainingPersistedQueryCandidateCount: row.remainingPersistedQueryCandidateCount,
    remainingHashLikePersistedCandidateCount: row.remainingHashLikePersistedCandidateCount,

    finalApprovedExecutionScope: "sportomedia_official_standings_graphql_query_body_recovery_refined_body_like_candidate_only",
    finalApprovedExecutionMode: "controlled_diagnostics_only_refined_body_like_query_body_recovery",
    finalApprovalAllowsNextExecutionRunnerRun:
      finalApprovalStatus === "approved_for_next_step_controlled_sportomedia_graphql_query_body_recovery_refined_candidate_execution",
    finalApprovalAllowsFetchInNextSeparateRunnerOnly:
      finalApprovalStatus === "approved_for_next_step_controlled_sportomedia_graphql_query_body_recovery_refined_candidate_execution",

    mayRunControlledRefinedCandidateQueryBodyRecoveryNext:
      finalApprovalStatus === "approved_for_next_step_controlled_sportomedia_graphql_query_body_recovery_refined_candidate_execution",
    finalRunWouldAllowControlledRefinedCandidateQueryBodyRecovery:
      finalApprovalStatus === "approved_for_next_step_controlled_sportomedia_graphql_query_body_recovery_refined_candidate_execution",
    finalRunWouldAllowConfiguredGraphqlPayloadFetch:
      finalApprovalStatus === "approved_for_next_step_controlled_sportomedia_graphql_query_body_recovery_refined_candidate_execution",
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
    finalApprovalIsTruth: false,
    queryBodyCandidatesAreTruth: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    zeroResultDoesNotImplyAbsence: true,
    missingStandingKeywordDoesNotProveAbsence: true,
    noMatchTodayDoesNotImplyInactive: true,

    nextAllowedStep:
      finalApprovalStatus === "approved_for_next_step_controlled_sportomedia_graphql_query_body_recovery_refined_candidate_execution"
        ? "run_controlled_sportomedia_graphql_query_body_recovery_refined_candidate_execution"
        : "repair_final_explicit_controlled_sportomedia_graphql_query_body_recovery_refined_candidate_execution_run_approval",
    nextBlockedStep: "search_classifier_canonical_write_production_write_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const gate = readJson(args.gateInput);
  const gateRows = validateGate(gate);

  const finalApprovalRows = gateRows
    .map(buildApprovalRow)
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const approvedRows = finalApprovalRows.filter((row) => row.finalApprovalStatus === "approved_for_next_step_controlled_sportomedia_graphql_query_body_recovery_refined_candidate_execution");
  const blockedRows = finalApprovalRows.filter((row) => row.finalApprovalStatus !== "approved_for_next_step_controlled_sportomedia_graphql_query_body_recovery_refined_candidate_execution");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "prepare-football-truth-final-explicit-controlled-sportomedia-graphql-query-body-recovery-refined-candidate-execution-run-approval-file",
    mode: "prepare_final_explicit_controlled_sportomedia_graphql_query_body_recovery_refined_candidate_execution_run_approval_no_fetch_no_search_no_classifier_no_truth_assertion_no_write",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      nextControlledSportomediaGraphqlQueryBodyRecoveryCandidateExecutionRunnerQualityGate: args.gateInput
    },
    summary: {
      finalExplicitControlledSportomediaGraphqlQueryBodyRecoveryRefinedCandidateExecutionRunApprovalCompetitionCount: finalApprovalRows.length,
      finalExplicitControlledSportomediaGraphqlQueryBodyRecoveryRefinedCandidateExecutionRunApprovalApprovedCount: approvedRows.length,
      finalExplicitControlledSportomediaGraphqlQueryBodyRecoveryRefinedCandidateExecutionRunApprovalBlockedCount: blockedRows.length,

      approvedRunnerTargetCount: finalApprovalRows.filter((row) => row.runnerTargetId).length,
      approvedPreviousPersistedQueryIdCandidateRejectedCount:
        finalApprovalRows.filter((row) => row.previousResponseReviewStatus === "http_400_persisted_query_id_candidate_rejected_needs_body_like_or_hash_candidate_refinement").length,
      approvedPreviousHttp400Count: finalApprovalRows.filter((row) => Number(row.previousHttpStatus) === 400).length,
      approvedPreviousErrorResponseCount: finalApprovalRows.filter((row) => row.previousResponseHasErrorsKey).length,
      approvedPreviousDataResponseCount: finalApprovalRows.filter((row) => row.previousResponseHasDataKey).length,
      approvedPreviousPayloadCandidateResponseCount: finalApprovalRows.filter((row) => row.previousQueryBodyRecoveryResponseCandidate).length,

      approvedPrimaryRefinementCandidateCount: finalApprovalRows.filter((row) => row.primaryRefinementCandidate).length,
      approvedPrimaryBodyLikeCandidateCount: finalApprovalRows.filter((row) => row.primaryRefinementCandidateType === "graphqlBodyLikeObject").length,
      approvedPrimaryPersistedQueryCandidateCount: finalApprovalRows.filter((row) => row.primaryRefinementCandidateType === "persistedQueryOrDocumentId").length,

      approvedRemainingCandidateCount: finalApprovalRows.reduce((sum, row) => sum + Number(row.remainingCandidateCount || 0), 0),
      approvedRemainingBodyLikeCandidateCount: finalApprovalRows.reduce((sum, row) => sum + Number(row.remainingBodyLikeCandidateCount || 0), 0),
      approvedRemainingPersistedQueryCandidateCount: finalApprovalRows.reduce((sum, row) => sum + Number(row.remainingPersistedQueryCandidateCount || 0), 0),
      approvedRemainingHashLikePersistedCandidateCount: finalApprovalRows.reduce((sum, row) => sum + Number(row.remainingHashLikePersistedCandidateCount || 0), 0),

      mayRunControlledRefinedCandidateQueryBodyRecoveryNextCount:
        finalApprovalRows.filter((row) => row.mayRunControlledRefinedCandidateQueryBodyRecoveryNext).length,
      finalRunWouldAllowControlledRefinedCandidateQueryBodyRecoveryCount:
        finalApprovalRows.filter((row) => row.finalRunWouldAllowControlledRefinedCandidateQueryBodyRecovery).length,
      finalRunWouldAllowConfiguredGraphqlPayloadFetchCount:
        finalApprovalRows.filter((row) => row.finalRunWouldAllowConfiguredGraphqlPayloadFetch).length,

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
      finalApprovalTruthCount: 0,
      queryBodyCandidatesTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        blockedRows.length === 0
          ? "run_controlled_sportomedia_graphql_query_body_recovery_refined_candidate_execution"
          : "repair_final_explicit_controlled_sportomedia_graphql_query_body_recovery_refined_candidate_execution_run_approval"
    },
    counts: {
      byFinalApprovalStatus: countBy(finalApprovalRows, "finalApprovalStatus"),
      byPrimaryRefinementCandidateType: countBy(finalApprovalRows, "primaryRefinementCandidateType"),
      byPreviousRequestBodyVariant: countBy(finalApprovalRows, "previousRequestBodyVariant"),
      byNextAllowedStep: countBy(finalApprovalRows, "nextAllowedStep")
    },
    guardrails: [
      "This final approval reads only the refined-candidate execution runner quality gate.",
      "It does not execute the runner.",
      "It does not fetch now.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a season-state classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "It only authorizes the next separate controlled diagnostics-only refined-candidate query/body recovery execution.",
      "The next run may fetch only the approved Sportomedia GraphQL refined body-like query/body recovery targets for swe.1 and swe.2.",
      "The next run may not search, classify, write canonical data, write production data, or assert truth.",
      "The body-like query/body candidate is not a truth assertion.",
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
    finalExplicitControlledSportomediaGraphqlQueryBodyRecoveryRefinedCandidateExecutionRunApprovalCompetitionCount: output.summary.finalExplicitControlledSportomediaGraphqlQueryBodyRecoveryRefinedCandidateExecutionRunApprovalCompetitionCount,
    finalExplicitControlledSportomediaGraphqlQueryBodyRecoveryRefinedCandidateExecutionRunApprovalApprovedCount: output.summary.finalExplicitControlledSportomediaGraphqlQueryBodyRecoveryRefinedCandidateExecutionRunApprovalApprovedCount,
    finalExplicitControlledSportomediaGraphqlQueryBodyRecoveryRefinedCandidateExecutionRunApprovalBlockedCount: output.summary.finalExplicitControlledSportomediaGraphqlQueryBodyRecoveryRefinedCandidateExecutionRunApprovalBlockedCount,
    approvedRunnerTargetCount: output.summary.approvedRunnerTargetCount,
    approvedPreviousPersistedQueryIdCandidateRejectedCount: output.summary.approvedPreviousPersistedQueryIdCandidateRejectedCount,
    approvedPreviousHttp400Count: output.summary.approvedPreviousHttp400Count,
    approvedPreviousErrorResponseCount: output.summary.approvedPreviousErrorResponseCount,
    approvedPreviousDataResponseCount: output.summary.approvedPreviousDataResponseCount,
    approvedPreviousPayloadCandidateResponseCount: output.summary.approvedPreviousPayloadCandidateResponseCount,
    approvedPrimaryRefinementCandidateCount: output.summary.approvedPrimaryRefinementCandidateCount,
    approvedPrimaryBodyLikeCandidateCount: output.summary.approvedPrimaryBodyLikeCandidateCount,
    approvedPrimaryPersistedQueryCandidateCount: output.summary.approvedPrimaryPersistedQueryCandidateCount,
    approvedRemainingCandidateCount: output.summary.approvedRemainingCandidateCount,
    approvedRemainingBodyLikeCandidateCount: output.summary.approvedRemainingBodyLikeCandidateCount,
    approvedRemainingPersistedQueryCandidateCount: output.summary.approvedRemainingPersistedQueryCandidateCount,
    approvedRemainingHashLikePersistedCandidateCount: output.summary.approvedRemainingHashLikePersistedCandidateCount,
    mayRunControlledRefinedCandidateQueryBodyRecoveryNextCount: output.summary.mayRunControlledRefinedCandidateQueryBodyRecoveryNextCount,
    finalRunWouldAllowControlledRefinedCandidateQueryBodyRecoveryCount: output.summary.finalRunWouldAllowControlledRefinedCandidateQueryBodyRecoveryCount,
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
    finalApprovalTruthCount: output.summary.finalApprovalTruthCount,
    queryBodyCandidatesTruthCount: output.summary.queryBodyCandidatesTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    userHintUsedCount: output.summary.userHintUsedCount,
    hardcodedSeasonStateOverrideUsedCount: output.summary.hardcodedSeasonStateOverrideUsedCount,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
