#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DEFAULTS = {
  date: "2026-06-14",
  approvalInput: "data/football-truth/_diagnostics/next-sportomedia-graphql-query-body-recovery-candidate-approval-gate-2026-06-14/next-sportomedia-graphql-query-body-recovery-candidate-approval-gate-2026-06-14.json",
  output: "data/football-truth/_diagnostics/next-controlled-sportomedia-graphql-query-body-recovery-candidate-execution-runner-2026-06-14/next-controlled-sportomedia-graphql-query-body-recovery-candidate-execution-runner-2026-06-14.json"
};

const EXPECTED_SLUGS = ["swe.1", "swe.2"];

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--approval-input") args.approvalInput = argv[++i];
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

function sha256(value) {
  return crypto.createHash("sha256").update(String(value || "")).digest("hex");
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

function validateApproval(input) {
  const s = input.summary || {};

  assertSummary(s, "nextSportomediaGraphqlQueryBodyRecoveryCandidateApprovalGateCompetitionCount", 2);
  assertSummary(s, "nextSportomediaGraphqlQueryBodyRecoveryCandidateApprovalGateApprovedCount", 2);
  assertSummary(s, "nextSportomediaGraphqlQueryBodyRecoveryCandidateApprovalGateBlockedCount", 0);
  assertSummary(s, "approvedHttp400PersistedQueryIdCandidateRejectedCount", 2);
  assertSummary(s, "approvedRefinementReadyCount", 2);
  assertSummary(s, "approvedPreviousErrorResponseCount", 2);
  assertSummary(s, "approvedPreviousDataResponseCount", 0);
  assertSummary(s, "approvedPreviousPayloadCandidateResponseCount", 0);
  assertSummary(s, "approvedRemainingCandidateCount", 16);
  assertSummary(s, "approvedRemainingBodyLikeCandidateCount", 8);
  assertSummary(s, "approvedRemainingPersistedQueryCandidateCount", 8);
  assertSummary(s, "approvedRemainingHashLikePersistedCandidateCount", 0);
  assertSummary(s, "approvedPrimaryRefinementCandidateCount", 2);
  assertSummary(s, "approvedPrimaryBodyLikeCandidateCount", 2);
  assertSummary(s, "approvedPrimaryPersistedQueryCandidateCount", 0);
  assertSummary(s, "mayBuildNextCandidateExecutionRunnerCount", 2);
  assertSummary(s, "approvalIsExecutionPermissionNowCount", 0);
  assertSummary(s, "approvalIsFetchPermissionNowCount", 0);

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
  assertSummary(s, "approvalRowTruthCount", 0);
  assertSummary(s, "queryBodyCandidatesTruthCount", 0);
  assertSummary(s, "canonicalWrites", 0);
  assertSummary(s, "productionWrite", false);
  assertSummary(s, "userHintUsedCount", 0);
  assertSummary(s, "hardcodedSeasonStateOverrideUsedCount", 0);

  const rows = Array.isArray(input.approvalRows) ? input.approvalRows : [];
  if (rows.length !== 2) throw new Error("Expected 2 approvalRows.");

  const slugs = uniqueSorted(rows.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Unexpected approval slugs: " + slugs.join(", "));
  }

  for (const row of rows) {
    if (row.approvalGateStatus !== "approved_to_build_next_sportomedia_graphql_query_body_recovery_candidate_execution_runner") {
      throw new Error(row.competitionSlug + ": approval row is not approved.");
    }
    if (row.approvedPrimaryRefinementCandidateType !== "graphqlBodyLikeObject") {
      throw new Error(row.competitionSlug + ": expected approved primary candidate type graphqlBodyLikeObject.");
    }
    if ((row.approvedPrimaryBodyLikeCandidate ?? row.approvedPrimaryIsBodyLikeCandidate) !== true) {
      throw new Error(row.competitionSlug + ": approved primary body-like candidate flag must be true.");
    }
    if ((row.approvedPrimaryPersistedQueryCandidate ?? row.approvedPrimaryIsPersistedQueryCandidate) !== false) {
      throw new Error(row.competitionSlug + ": approved primary persisted-query candidate flag must be false.");
    }
    if (row.previousRequestBodyVariant !== "persisted_query_id_candidate") {
      throw new Error(row.competitionSlug + ": previous request body variant must be persisted_query_id_candidate.");
    }
    if (row.mayBuildNextCandidateExecutionRunner !== true) {
      throw new Error(row.competitionSlug + ": mayBuildNextCandidateExecutionRunner must be true.");
    }
    if (row.approvalIsExecutionPermissionNow !== false || row.approvalIsFetchPermissionNow !== false) {
      throw new Error(row.competitionSlug + ": approval must not be execution/fetch permission now.");
    }
  }

  return rows;
}

function buildRunnerRow(row) {
  const candidate = row.approvedPrimaryRefinementCandidate || {};
  const blockingReasons = [];

  if (row.approvalGateStatus !== "approved_to_build_next_sportomedia_graphql_query_body_recovery_candidate_execution_runner") {
    blockingReasons.push("next_candidate_approval_not_approved");
  }
  if (row.mayBuildNextCandidateExecutionRunner !== true) {
    blockingReasons.push("approval_does_not_allow_next_candidate_execution_runner_build");
  }
  if (!candidate || Object.keys(candidate).length === 0) {
    blockingReasons.push("missing_approved_primary_refinement_candidate");
  }
  if (row.approvedPrimaryRefinementCandidateType !== "graphqlBodyLikeObject") {
    blockingReasons.push("approved_primary_refinement_candidate_not_body_like");
  }
  if (candidate.wasAlreadyAttemptedPrimary === true) {
    blockingReasons.push("approved_candidate_was_already_attempted");
  }
  if ((row.approvedPrimaryPersistedQueryCandidate ?? row.approvedPrimaryIsPersistedQueryCandidate) !== false) {
    blockingReasons.push("approved_primary_repeats_persisted_query_strategy");
  }
  if (row.approvalIsExecutionPermissionNow !== false) blockingReasons.push("approval_is_execution_permission_now");
  if (row.approvalIsFetchPermissionNow !== false) blockingReasons.push("approval_is_fetch_permission_now");

  if (row.mayExecuteNow !== false) blockingReasons.push("approval_would_execute_now");
  if (row.mayFetchNow !== false) blockingReasons.push("approval_would_fetch_now");
  if (row.maySearchNow !== false) blockingReasons.push("approval_would_search_now");
  if (row.mayBroadSearchNow !== false) blockingReasons.push("approval_would_broad_search_now");
  if (row.mayClassifySeasonStateNow !== false) blockingReasons.push("approval_would_classify_now");
  if (row.mayWriteCanonicalNow !== false) blockingReasons.push("approval_would_write_canonical_now");
  if (row.mayAssertTruthNow !== false) blockingReasons.push("approval_would_assert_truth_now");

  const runnerStatus =
    blockingReasons.length === 0
      ? "ready_for_next_controlled_sportomedia_graphql_query_body_recovery_candidate_execution_runner_quality_gate"
      : "blocked_next_controlled_sportomedia_graphql_query_body_recovery_candidate_execution_runner";

  return {
    competitionSlug: row.competitionSlug,
    reusableFamily: row.reusableFamily,
    nextCandidateExecutionRunnerStatus: runnerStatus,
    blockingReasons,

    runnerTargetId: `${row.competitionSlug}::sportomedia_graphql_query_body_recovery_refined_body_like_candidate`,
    runnerTargetScope: "sportomedia_official_standings_graphql_query_body_recovery_refined_candidate_only",
    runnerTargetPurpose: "retry_graphql_query_body_recovery_with_body_like_candidate_after_persisted_id_http_400",

    previousResponseReviewStatus: row.previousResponseReviewStatus,
    previousRefinementStatus: row.previousRefinementStatus,
    previousHttpStatus: row.previousHttpStatus,
    previousRequestBodyVariant: row.previousRequestBodyVariant,
    previousRequestBodyBuildStatus: row.previousRequestBodyBuildStatus,
    previousExecutionStatus: row.previousExecutionStatus,
    previousResponseHasErrorsKey: row.previousResponseHasErrorsKey,
    previousResponseHasDataKey: row.previousResponseHasDataKey,
    previousQueryBodyRecoveryResponseCandidate: row.previousQueryBodyRecoveryResponseCandidate,

    remainingCandidateCount: row.remainingCandidateCount,
    remainingBodyLikeCandidateCount: row.remainingBodyLikeCandidateCount,
    remainingPersistedQueryCandidateCount: row.remainingPersistedQueryCandidateCount,
    remainingHashLikePersistedCandidateCount: row.remainingHashLikePersistedCandidateCount,

    primaryRefinementCandidate: candidate,
    primaryRefinementCandidateType: row.approvedPrimaryRefinementCandidateType,
    primaryRefinementCandidateScore: row.approvedPrimaryRefinementCandidateScore,
    primaryRefinementCandidateSource: row.approvedPrimaryRefinementCandidateSource,
    primaryRefinementCandidateSha256: sha256(JSON.stringify(candidate)),
    primaryRefinementCandidateRawSnippetSha256: sha256(candidate.rawSnippet || ""),
    primaryRefinementCandidateRawSnippetPreview: String(candidate.rawSnippet || "").slice(0, 1500),

    candidateSamples: Array.isArray(row.approvedCandidateSamples) ? row.approvedCandidateSamples : [],

    nextCandidateExecutionRunnerDefinition: {
      runnerMode: "controlled_diagnostics_only_sportomedia_graphql_query_body_recovery_refined_body_like_candidate",
      targetSlug: row.competitionSlug,
      targetFamily: row.reusableFamily,
      targetKind: "sportomedia_official_standings_graphql_query_body_recovery_refined_candidate",
      previousRejectedRequestBodyVariant: row.previousRequestBodyVariant,
      previousRejectedHttpStatus: row.previousHttpStatus,
      primaryCandidateType: row.approvedPrimaryRefinementCandidateType,
      primaryCandidateScore: row.approvedPrimaryRefinementCandidateScore,
      primaryCandidateSource: row.approvedPrimaryRefinementCandidateSource,
      primaryCandidateRawSnippet: candidate.rawSnippet || null,
      bodyLikeCandidateAvailable: (row.approvedPrimaryBodyLikeCandidate ?? row.approvedPrimaryIsBodyLikeCandidate) === true,
      persistedQueryCandidateAvailable: false,
      requireFutureQualityGateBeforeFinalApproval: true,
      requireFutureFinalExecutionApprovalBeforeFetch: true,
      allowedSideEffects: ["write_diagnostics_only"],
      forbiddenSideEffects: [
        "fetch_now",
        "search",
        "broad_search",
        "season_state_classifier",
        "canonical_write",
        "production_write",
        "truth_assertion"
      ]
    },

    executionRunnerComplete: blockingReasons.length === 0,
    executionRunnerBuilt: true,
    mayProceedToNextCandidateExecutionRunnerQualityGate: blockingReasons.length === 0,
    approvalAllowsExecutionRunnerBuildOnly: true,
    mayRunNextCandidateControlledQueryBodyRecoveryAfterFutureFinalApproval: blockingReasons.length === 0,

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
      blockingReasons.length === 0
        ? "run_next_controlled_sportomedia_graphql_query_body_recovery_candidate_execution_runner_quality_gate"
        : "repair_next_controlled_sportomedia_graphql_query_body_recovery_candidate_execution_runner",
    nextBlockedStep: "controlled_fetch_classifier_canonical_write_truth_assertions_blocked_until_future_final_execution_approval"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const approval = readJson(args.approvalInput);
  const approvalRows = validateApproval(approval);

  const runnerRows = approvalRows
    .map(buildRunnerRow)
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const readyRows = runnerRows.filter((row) => row.nextCandidateExecutionRunnerStatus === "ready_for_next_controlled_sportomedia_graphql_query_body_recovery_candidate_execution_runner_quality_gate");
  const blockedRows = runnerRows.filter((row) => row.nextCandidateExecutionRunnerStatus !== "ready_for_next_controlled_sportomedia_graphql_query_body_recovery_candidate_execution_runner_quality_gate");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-next-controlled-sportomedia-graphql-query-body-recovery-candidate-execution-runner-file",
    mode: "build_next_controlled_sportomedia_graphql_query_body_recovery_candidate_execution_runner_no_fetch_no_search_no_classifier_no_truth_assertion_no_write",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      nextSportomediaGraphqlQueryBodyRecoveryCandidateApprovalGate: args.approvalInput
    },
    summary: {
      nextControlledSportomediaGraphqlQueryBodyRecoveryCandidateExecutionRunnerCompetitionCount: runnerRows.length,
      nextControlledSportomediaGraphqlQueryBodyRecoveryCandidateExecutionRunnerReadyCount: readyRows.length,
      nextControlledSportomediaGraphqlQueryBodyRecoveryCandidateExecutionRunnerBlockedCount: blockedRows.length,

      executionRunnerTargetCount: runnerRows.filter((row) => row.runnerTargetId).length,
      previousPersistedQueryIdCandidateRejectedCount:
        runnerRows.filter((row) => row.previousResponseReviewStatus === "http_400_persisted_query_id_candidate_rejected_needs_body_like_or_hash_candidate_refinement").length,
      previousHttp400Count: runnerRows.filter((row) => Number(row.previousHttpStatus) === 400).length,
      previousErrorResponseCount: runnerRows.filter((row) => row.previousResponseHasErrorsKey).length,
      previousDataResponseCount: runnerRows.filter((row) => row.previousResponseHasDataKey).length,
      previousPayloadCandidateResponseCount: runnerRows.filter((row) => row.previousQueryBodyRecoveryResponseCandidate).length,

      primaryRefinementCandidateCount: runnerRows.filter((row) => row.primaryRefinementCandidate).length,
      primaryBodyLikeCandidateCount: runnerRows.filter((row) => row.primaryRefinementCandidateType === "graphqlBodyLikeObject").length,
      primaryPersistedQueryCandidateCount: runnerRows.filter((row) => row.primaryRefinementCandidateType === "persistedQueryOrDocumentId").length,

      remainingCandidateCount: runnerRows.reduce((sum, row) => sum + Number(row.remainingCandidateCount || 0), 0),
      remainingBodyLikeCandidateCount: runnerRows.reduce((sum, row) => sum + Number(row.remainingBodyLikeCandidateCount || 0), 0),
      remainingPersistedQueryCandidateCount: runnerRows.reduce((sum, row) => sum + Number(row.remainingPersistedQueryCandidateCount || 0), 0),
      remainingHashLikePersistedCandidateCount: runnerRows.reduce((sum, row) => sum + Number(row.remainingHashLikePersistedCandidateCount || 0), 0),

      executionRunnerCompleteCount: runnerRows.filter((row) => row.executionRunnerComplete).length,
      executionRunnerBuiltCount: runnerRows.filter((row) => row.executionRunnerBuilt).length,
      mayProceedToNextCandidateExecutionRunnerQualityGateCount:
        runnerRows.filter((row) => row.mayProceedToNextCandidateExecutionRunnerQualityGate).length,
      approvalAllowsExecutionRunnerBuildOnlyCount:
        runnerRows.filter((row) => row.approvalAllowsExecutionRunnerBuildOnly).length,
      mayRunNextCandidateControlledQueryBodyRecoveryAfterFutureFinalApprovalCount:
        runnerRows.filter((row) => row.mayRunNextCandidateControlledQueryBodyRecoveryAfterFutureFinalApproval).length,

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
          ? "run_next_controlled_sportomedia_graphql_query_body_recovery_candidate_execution_runner_quality_gate"
          : "repair_next_controlled_sportomedia_graphql_query_body_recovery_candidate_execution_runner"
    },
    counts: {
      byNextCandidateExecutionRunnerStatus: countBy(runnerRows, "nextCandidateExecutionRunnerStatus"),
      byPrimaryRefinementCandidateType: countBy(runnerRows, "primaryRefinementCandidateType"),
      byPreviousRequestBodyVariant: countBy(runnerRows, "previousRequestBodyVariant"),
      byNextAllowedStep: countBy(runnerRows, "nextAllowedStep")
    },
    guardrails: [
      "This job builds the next controlled Sportomedia GraphQL query/body recovery refined-candidate execution runner artifact only.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a season-state classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Execution runner construction is not endpoint execution.",
      "The approved refined candidate is diagnostic only and not truth.",
      "HTTP 400 GraphQL errors are diagnostic feedback only.",
      "Endpoint reachability is not standings truth.",
      "Missing standing keyword does not prove absence.",
      "No match today must not imply inactive.",
      "Zero result must not imply absence."
    ],
    runnerRows,
    blockedRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    nextControlledSportomediaGraphqlQueryBodyRecoveryCandidateExecutionRunnerCompetitionCount: output.summary.nextControlledSportomediaGraphqlQueryBodyRecoveryCandidateExecutionRunnerCompetitionCount,
    nextControlledSportomediaGraphqlQueryBodyRecoveryCandidateExecutionRunnerReadyCount: output.summary.nextControlledSportomediaGraphqlQueryBodyRecoveryCandidateExecutionRunnerReadyCount,
    nextControlledSportomediaGraphqlQueryBodyRecoveryCandidateExecutionRunnerBlockedCount: output.summary.nextControlledSportomediaGraphqlQueryBodyRecoveryCandidateExecutionRunnerBlockedCount,
    executionRunnerTargetCount: output.summary.executionRunnerTargetCount,
    previousPersistedQueryIdCandidateRejectedCount: output.summary.previousPersistedQueryIdCandidateRejectedCount,
    previousHttp400Count: output.summary.previousHttp400Count,
    previousErrorResponseCount: output.summary.previousErrorResponseCount,
    previousDataResponseCount: output.summary.previousDataResponseCount,
    previousPayloadCandidateResponseCount: output.summary.previousPayloadCandidateResponseCount,
    primaryRefinementCandidateCount: output.summary.primaryRefinementCandidateCount,
    primaryBodyLikeCandidateCount: output.summary.primaryBodyLikeCandidateCount,
    primaryPersistedQueryCandidateCount: output.summary.primaryPersistedQueryCandidateCount,
    remainingCandidateCount: output.summary.remainingCandidateCount,
    remainingBodyLikeCandidateCount: output.summary.remainingBodyLikeCandidateCount,
    remainingPersistedQueryCandidateCount: output.summary.remainingPersistedQueryCandidateCount,
    remainingHashLikePersistedCandidateCount: output.summary.remainingHashLikePersistedCandidateCount,
    executionRunnerCompleteCount: output.summary.executionRunnerCompleteCount,
    executionRunnerBuiltCount: output.summary.executionRunnerBuiltCount,
    mayProceedToNextCandidateExecutionRunnerQualityGateCount: output.summary.mayProceedToNextCandidateExecutionRunnerQualityGateCount,
    approvalAllowsExecutionRunnerBuildOnlyCount: output.summary.approvalAllowsExecutionRunnerBuildOnlyCount,
    mayRunNextCandidateControlledQueryBodyRecoveryAfterFutureFinalApprovalCount: output.summary.mayRunNextCandidateControlledQueryBodyRecoveryAfterFutureFinalApprovalCount,
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
