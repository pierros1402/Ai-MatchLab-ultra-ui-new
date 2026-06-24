#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULTS = {
  date: "2026-06-14",
  runnerInput: "data/football-truth/_diagnostics/next-controlled-sportomedia-graphql-query-body-recovery-candidate-execution-runner-2026-06-14/next-controlled-sportomedia-graphql-query-body-recovery-candidate-execution-runner-2026-06-14.json",
  output: "data/football-truth/_diagnostics/next-controlled-sportomedia-graphql-query-body-recovery-candidate-execution-runner-quality-gate-2026-06-14/next-controlled-sportomedia-graphql-query-body-recovery-candidate-execution-runner-quality-gate-2026-06-14.json"
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

  assertSummary(s, "nextControlledSportomediaGraphqlQueryBodyRecoveryCandidateExecutionRunnerCompetitionCount", 2);
  assertSummary(s, "nextControlledSportomediaGraphqlQueryBodyRecoveryCandidateExecutionRunnerReadyCount", 2);
  assertSummary(s, "nextControlledSportomediaGraphqlQueryBodyRecoveryCandidateExecutionRunnerBlockedCount", 0);
  assertSummary(s, "executionRunnerTargetCount", 2);
  assertSummary(s, "previousPersistedQueryIdCandidateRejectedCount", 2);
  assertSummary(s, "previousHttp400Count", 2);
  assertSummary(s, "previousErrorResponseCount", 2);
  assertSummary(s, "previousDataResponseCount", 0);
  assertSummary(s, "previousPayloadCandidateResponseCount", 0);
  assertSummary(s, "primaryRefinementCandidateCount", 2);
  assertSummary(s, "primaryBodyLikeCandidateCount", 2);
  assertSummary(s, "primaryPersistedQueryCandidateCount", 0);
  assertSummary(s, "remainingCandidateCount", 16);
  assertSummary(s, "remainingBodyLikeCandidateCount", 8);
  assertSummary(s, "remainingPersistedQueryCandidateCount", 8);
  assertSummary(s, "remainingHashLikePersistedCandidateCount", 0);
  assertSummary(s, "executionRunnerCompleteCount", 2);
  assertSummary(s, "executionRunnerBuiltCount", 2);
  assertSummary(s, "mayProceedToNextCandidateExecutionRunnerQualityGateCount", 2);
  assertSummary(s, "approvalAllowsExecutionRunnerBuildOnlyCount", 2);
  assertSummary(s, "mayRunNextCandidateControlledQueryBodyRecoveryAfterFutureFinalApprovalCount", 2);

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

  if (row.nextCandidateExecutionRunnerStatus !== "ready_for_next_controlled_sportomedia_graphql_query_body_recovery_candidate_execution_runner_quality_gate") {
    blockingReasons.push("next_candidate_execution_runner_not_quality_gate_ready");
  }
  if (row.executionRunnerComplete !== true) blockingReasons.push("execution_runner_not_complete");
  if (row.executionRunnerBuilt !== true) blockingReasons.push("execution_runner_not_built");
  if (row.mayProceedToNextCandidateExecutionRunnerQualityGate !== true) {
    blockingReasons.push("execution_runner_not_allowed_to_quality_gate");
  }
  if (row.approvalAllowsExecutionRunnerBuildOnly !== true) {
    blockingReasons.push("approval_scope_not_execution_runner_build_only");
  }
  if (row.mayRunNextCandidateControlledQueryBodyRecoveryAfterFutureFinalApproval !== true) {
    blockingReasons.push("future_final_approval_runnable_flag_missing");
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
    blockingReasons.push("previous_response_did_not_have_errors_key");
  }
  if (row.previousResponseHasDataKey !== false) {
    blockingReasons.push("previous_response_had_data_key");
  }
  if (row.previousQueryBodyRecoveryResponseCandidate !== false) {
    blockingReasons.push("previous_response_was_payload_candidate");
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
  if (row.executionRunnerIsTruth !== false) blockingReasons.push("execution_runner_marked_truth");
  if (row.queryBodyCandidatesAreTruth !== false) blockingReasons.push("query_body_candidates_marked_truth");
  if (row.userHintUsed !== false) blockingReasons.push("user_hint_used");
  if (row.hardcodedSeasonStateOverrideUsed !== false) blockingReasons.push("hardcoded_override_used");

  const qualityGateStatus =
    blockingReasons.length === 0
      ? "passed_next_controlled_sportomedia_graphql_query_body_recovery_candidate_execution_runner_quality_gate"
      : "blocked_next_controlled_sportomedia_graphql_query_body_recovery_candidate_execution_runner_quality_gate";

  return {
    competitionSlug: row.competitionSlug,
    reusableFamily: row.reusableFamily,
    qualityGateStatus,
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

    executionRunnerComplete: row.executionRunnerComplete,
    executionRunnerBuilt: row.executionRunnerBuilt,

    mayPrepareNextCandidateFinalExecutionApproval:
      qualityGateStatus === "passed_next_controlled_sportomedia_graphql_query_body_recovery_candidate_execution_runner_quality_gate",

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
    executionRunnerIsTruth: false,
    queryBodyCandidatesAreTruth: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    zeroResultDoesNotImplyAbsence: true,
    missingStandingKeywordDoesNotProveAbsence: true,
    noMatchTodayDoesNotImplyInactive: true,

    nextAllowedStep:
      qualityGateStatus === "passed_next_controlled_sportomedia_graphql_query_body_recovery_candidate_execution_runner_quality_gate"
        ? "prepare_final_explicit_controlled_sportomedia_graphql_query_body_recovery_refined_candidate_execution_run_approval"
        : "repair_next_controlled_sportomedia_graphql_query_body_recovery_candidate_execution_runner",
    nextBlockedStep: "controlled_fetch_classifier_canonical_write_truth_assertions_blocked_until_future_final_execution_approval"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const runner = readJson(args.runnerInput);
  const runnerRows = validateRunner(runner);

  const qualityGateRows = runnerRows
    .map(buildGateRow)
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const passedRows = qualityGateRows.filter((row) => row.qualityGateStatus === "passed_next_controlled_sportomedia_graphql_query_body_recovery_candidate_execution_runner_quality_gate");
  const blockedRows = qualityGateRows.filter((row) => row.qualityGateStatus !== "passed_next_controlled_sportomedia_graphql_query_body_recovery_candidate_execution_runner_quality_gate");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "run-football-truth-next-controlled-sportomedia-graphql-query-body-recovery-candidate-execution-runner-quality-gate-file",
    mode: "run_next_controlled_sportomedia_graphql_query_body_recovery_candidate_execution_runner_quality_gate_no_fetch_no_search_no_classifier_no_truth_assertion_no_write",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      nextControlledSportomediaGraphqlQueryBodyRecoveryCandidateExecutionRunner: args.runnerInput
    },
    summary: {
      nextControlledSportomediaGraphqlQueryBodyRecoveryCandidateExecutionRunnerQualityGateCompetitionCount: qualityGateRows.length,
      nextControlledSportomediaGraphqlQueryBodyRecoveryCandidateExecutionRunnerQualityGatePassedCount: passedRows.length,
      nextControlledSportomediaGraphqlQueryBodyRecoveryCandidateExecutionRunnerQualityGateBlockedCount: blockedRows.length,

      qualityGatedExecutionRunnerTargetCount: qualityGateRows.filter((row) => row.runnerTargetId).length,
      qualityGatedPreviousPersistedQueryIdCandidateRejectedCount:
        qualityGateRows.filter((row) => row.previousResponseReviewStatus === "http_400_persisted_query_id_candidate_rejected_needs_body_like_or_hash_candidate_refinement").length,
      qualityGatedPreviousHttp400Count: qualityGateRows.filter((row) => Number(row.previousHttpStatus) === 400).length,
      qualityGatedPreviousErrorResponseCount: qualityGateRows.filter((row) => row.previousResponseHasErrorsKey).length,
      qualityGatedPreviousDataResponseCount: qualityGateRows.filter((row) => row.previousResponseHasDataKey).length,
      qualityGatedPreviousPayloadCandidateResponseCount: qualityGateRows.filter((row) => row.previousQueryBodyRecoveryResponseCandidate).length,

      qualityGatedPrimaryRefinementCandidateCount: qualityGateRows.filter((row) => row.primaryRefinementCandidate).length,
      qualityGatedPrimaryBodyLikeCandidateCount: qualityGateRows.filter((row) => row.primaryRefinementCandidateType === "graphqlBodyLikeObject").length,
      qualityGatedPrimaryPersistedQueryCandidateCount: qualityGateRows.filter((row) => row.primaryRefinementCandidateType === "persistedQueryOrDocumentId").length,

      qualityGatedRemainingCandidateCount: qualityGateRows.reduce((sum, row) => sum + Number(row.remainingCandidateCount || 0), 0),
      qualityGatedRemainingBodyLikeCandidateCount: qualityGateRows.reduce((sum, row) => sum + Number(row.remainingBodyLikeCandidateCount || 0), 0),
      qualityGatedRemainingPersistedQueryCandidateCount: qualityGateRows.reduce((sum, row) => sum + Number(row.remainingPersistedQueryCandidateCount || 0), 0),
      qualityGatedRemainingHashLikePersistedCandidateCount: qualityGateRows.reduce((sum, row) => sum + Number(row.remainingHashLikePersistedCandidateCount || 0), 0),

      executionRunnerCompleteCount: qualityGateRows.filter((row) => row.executionRunnerComplete).length,
      executionRunnerBuiltCount: qualityGateRows.filter((row) => row.executionRunnerBuilt).length,
      mayPrepareNextCandidateFinalExecutionApprovalCount:
        qualityGateRows.filter((row) => row.mayPrepareNextCandidateFinalExecutionApproval).length,

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
      executionRunnerTruthCount: 0,
      queryBodyCandidatesTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        blockedRows.length === 0
          ? "prepare_final_explicit_controlled_sportomedia_graphql_query_body_recovery_refined_candidate_execution_run_approval"
          : "repair_next_controlled_sportomedia_graphql_query_body_recovery_candidate_execution_runner"
    },
    counts: {
      byQualityGateStatus: countBy(qualityGateRows, "qualityGateStatus"),
      byPrimaryRefinementCandidateType: countBy(qualityGateRows, "primaryRefinementCandidateType"),
      byPreviousRequestBodyVariant: countBy(qualityGateRows, "previousRequestBodyVariant"),
      byNextAllowedStep: countBy(qualityGateRows, "nextAllowedStep")
    },
    guardrails: [
      "This quality gate reads the next controlled Sportomedia GraphQL query/body recovery refined-candidate execution runner only.",
      "It does not execute the runner.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a season-state classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Passing this gate only allows preparing a future final explicit controlled execution approval.",
      "Passing this gate does not allow execution or fetch now.",
      "The body-like candidate is diagnostic only and not truth.",
      "Endpoint reachability is not standings truth.",
      "Missing standing keyword does not prove absence.",
      "No match today must not imply inactive.",
      "Zero result must not imply absence."
    ],
    qualityGateRows,
    blockedRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    nextControlledSportomediaGraphqlQueryBodyRecoveryCandidateExecutionRunnerQualityGateCompetitionCount: output.summary.nextControlledSportomediaGraphqlQueryBodyRecoveryCandidateExecutionRunnerQualityGateCompetitionCount,
    nextControlledSportomediaGraphqlQueryBodyRecoveryCandidateExecutionRunnerQualityGatePassedCount: output.summary.nextControlledSportomediaGraphqlQueryBodyRecoveryCandidateExecutionRunnerQualityGatePassedCount,
    nextControlledSportomediaGraphqlQueryBodyRecoveryCandidateExecutionRunnerQualityGateBlockedCount: output.summary.nextControlledSportomediaGraphqlQueryBodyRecoveryCandidateExecutionRunnerQualityGateBlockedCount,
    qualityGatedExecutionRunnerTargetCount: output.summary.qualityGatedExecutionRunnerTargetCount,
    qualityGatedPreviousPersistedQueryIdCandidateRejectedCount: output.summary.qualityGatedPreviousPersistedQueryIdCandidateRejectedCount,
    qualityGatedPreviousHttp400Count: output.summary.qualityGatedPreviousHttp400Count,
    qualityGatedPreviousErrorResponseCount: output.summary.qualityGatedPreviousErrorResponseCount,
    qualityGatedPreviousDataResponseCount: output.summary.qualityGatedPreviousDataResponseCount,
    qualityGatedPreviousPayloadCandidateResponseCount: output.summary.qualityGatedPreviousPayloadCandidateResponseCount,
    qualityGatedPrimaryRefinementCandidateCount: output.summary.qualityGatedPrimaryRefinementCandidateCount,
    qualityGatedPrimaryBodyLikeCandidateCount: output.summary.qualityGatedPrimaryBodyLikeCandidateCount,
    qualityGatedPrimaryPersistedQueryCandidateCount: output.summary.qualityGatedPrimaryPersistedQueryCandidateCount,
    qualityGatedRemainingCandidateCount: output.summary.qualityGatedRemainingCandidateCount,
    qualityGatedRemainingBodyLikeCandidateCount: output.summary.qualityGatedRemainingBodyLikeCandidateCount,
    qualityGatedRemainingPersistedQueryCandidateCount: output.summary.qualityGatedRemainingPersistedQueryCandidateCount,
    qualityGatedRemainingHashLikePersistedCandidateCount: output.summary.qualityGatedRemainingHashLikePersistedCandidateCount,
    executionRunnerCompleteCount: output.summary.executionRunnerCompleteCount,
    executionRunnerBuiltCount: output.summary.executionRunnerBuiltCount,
    mayPrepareNextCandidateFinalExecutionApprovalCount: output.summary.mayPrepareNextCandidateFinalExecutionApprovalCount,
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
    executionRunnerTruthCount: output.summary.executionRunnerTruthCount,
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
