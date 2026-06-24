#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULTS = {
  date: "2026-06-14",
  reviewInput: "data/football-truth/_diagnostics/controlled-sportomedia-graphql-query-body-recovery-response-review-and-refinement-plan-2026-06-14/controlled-sportomedia-graphql-query-body-recovery-response-review-and-refinement-plan-2026-06-14.json",
  output: "data/football-truth/_diagnostics/next-sportomedia-graphql-query-body-recovery-candidate-approval-gate-2026-06-14/next-sportomedia-graphql-query-body-recovery-candidate-approval-gate-2026-06-14.json"
};

const EXPECTED_SLUGS = ["swe.1", "swe.2"];

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--review-input") args.reviewInput = argv[++i];
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

function validateReview(input) {
  const s = input.summary || {};

  assertSummary(s, "sportomediaGraphqlQueryBodyRecoveryResponseReviewCompetitionCount", 2);
  assertSummary(s, "http400ResponseCount", 2);
  assertSummary(s, "persistedQueryIdCandidateRejectedCount", 2);
  assertSummary(s, "responseHasErrorsKeyCount", 2);
  assertSummary(s, "responseHasDataKeyCount", 0);
  assertSummary(s, "standingKeywordResponseCount", 0);
  assertSummary(s, "queryBodyRecoveryResponseCandidateCount", 0);
  assertSummary(s, "refinementReadyCount", 2);
  assertSummary(s, "refinementBlockedCount", 0);
  assertSummary(s, "nextCandidateApprovalGateReadyCount", 2);
  assertSummary(s, "totalCandidateCount", 16);
  assertSummary(s, "totalRemainingCandidateCount", 16);
  assertSummary(s, "totalRemainingBodyLikeCandidateCount", 8);
  assertSummary(s, "totalRemainingPersistedQueryCandidateCount", 8);
  assertSummary(s, "totalRemainingHashLikePersistedCandidateCount", 0);
  assertSummary(s, "recommendedPrimaryRefinementCandidateCount", 2);

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
  assertSummary(s, "responseReviewTruthCount", 0);
  assertSummary(s, "queryBodyCandidatesTruthCount", 0);
  assertSummary(s, "canonicalWrites", 0);
  assertSummary(s, "productionWrite", false);
  assertSummary(s, "userHintUsedCount", 0);
  assertSummary(s, "hardcodedSeasonStateOverrideUsedCount", 0);

  const rows = Array.isArray(input.reviewRows) ? input.reviewRows : [];
  if (rows.length !== 2) throw new Error("Expected 2 reviewRows.");

  const slugs = uniqueSorted(rows.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Unexpected review slugs: " + slugs.join(", "));
  }

  for (const row of rows) {
    if (row.responseReviewStatus !== "http_400_persisted_query_id_candidate_rejected_needs_body_like_or_hash_candidate_refinement") {
      throw new Error(row.competitionSlug + ": expected persisted query id rejection response review status.");
    }
    if (row.refinementStatus !== "ready_for_next_no_write_query_body_recovery_candidate_approval_gate") {
      throw new Error(row.competitionSlug + ": refinement row is not approval-gate ready.");
    }
    if (row.mayPrepareNextCandidateApprovalGate !== true) {
      throw new Error(row.competitionSlug + ": mayPrepareNextCandidateApprovalGate must be true.");
    }
    if (!row.recommendedPrimaryRefinementCandidate) {
      throw new Error(row.competitionSlug + ": missing recommended primary refinement candidate.");
    }
  }

  return rows;
}

function buildApprovalRow(row) {
  const candidate = row.recommendedPrimaryRefinementCandidate || {};
  const blockingReasons = [];

  if (row.responseReviewStatus !== "http_400_persisted_query_id_candidate_rejected_needs_body_like_or_hash_candidate_refinement") {
    blockingReasons.push("response_review_status_not_expected_persisted_id_rejection");
  }
  if (row.refinementStatus !== "ready_for_next_no_write_query_body_recovery_candidate_approval_gate") {
    blockingReasons.push("refinement_not_ready");
  }
  if (row.mayPrepareNextCandidateApprovalGate !== true) {
    blockingReasons.push("review_does_not_allow_next_candidate_approval_gate");
  }
  if (!candidate || Object.keys(candidate).length === 0) {
    blockingReasons.push("missing_recommended_primary_refinement_candidate");
  }
  if (candidate.wasAlreadyAttemptedPrimary === true) {
    blockingReasons.push("recommended_candidate_was_already_attempted");
  }
  if (candidate.candidateType === "persistedQueryOrDocumentId" && row.requestBodyVariant === "persisted_query_id_candidate") {
    blockingReasons.push("recommended_candidate_repeats_persisted_id_strategy");
  }
  if (Number(row.remainingBodyLikeCandidateCount || 0) < 1) {
    blockingReasons.push("no_remaining_body_like_candidate_available");
  }

  if (row.mayExecuteNow !== false) blockingReasons.push("review_would_execute_now");
  if (row.mayFetchNow !== false) blockingReasons.push("review_would_fetch_now");
  if (row.maySearchNow !== false) blockingReasons.push("review_would_search_now");
  if (row.mayBroadSearchNow !== false) blockingReasons.push("review_would_broad_search_now");
  if (row.mayClassifySeasonStateNow !== false) blockingReasons.push("review_would_classify_now");
  if (row.mayWriteCanonicalNow !== false) blockingReasons.push("review_would_write_canonical_now");
  if (row.mayAssertTruthNow !== false) blockingReasons.push("review_would_assert_truth_now");

  const approvalGateStatus =
    blockingReasons.length === 0
      ? "approved_to_build_next_sportomedia_graphql_query_body_recovery_candidate_execution_runner"
      : "blocked_next_sportomedia_graphql_query_body_recovery_candidate_approval_gate";

  return {
    competitionSlug: row.competitionSlug,
    reusableFamily: row.reusableFamily,
    approvalGateStatus,
    blockingReasons,

    previousResponseReviewStatus: row.responseReviewStatus,
    previousRefinementStatus: row.refinementStatus,
    previousHttpStatus: row.httpStatus,
    previousRequestBodyVariant: row.requestBodyVariant,
    previousRequestBodyBuildStatus: row.requestBodyBuildStatus,
    previousExecutionStatus: row.executionStatus,
    previousResponseHasErrorsKey: row.responseHasErrorsKey,
    previousResponseHasDataKey: row.responseHasDataKey,
    previousQueryBodyRecoveryResponseCandidate: row.queryBodyRecoveryResponseCandidate,

    remainingCandidateCount: row.remainingCandidateCount,
    remainingBodyLikeCandidateCount: row.remainingBodyLikeCandidateCount,
    remainingPersistedQueryCandidateCount: row.remainingPersistedQueryCandidateCount,
    remainingHashLikePersistedCandidateCount: row.remainingHashLikePersistedCandidateCount,

    approvedPrimaryRefinementCandidate: candidate,
    approvedPrimaryRefinementCandidateType: candidate.candidateType || null,
    approvedPrimaryRefinementCandidateScore: candidate.refinementScore ?? candidate.candidateScore ?? null,
    approvedPrimaryRefinementCandidateSource: candidate.source || null,
    approvedPrimaryIsBodyLikeCandidate: candidate.candidateType === "graphqlBodyLikeObject",
    approvedPrimaryIsPersistedQueryCandidate: candidate.candidateType === "persistedQueryOrDocumentId",

    approvedCandidateSamples: Array.isArray(row.nextRefinementCandidates) ? row.nextRefinementCandidates.slice(0, 6) : [],

    approvedScope: "sportomedia_official_standings_graphql_query_body_recovery_refined_candidate_only",
    approvedPurpose: "build_next_controlled_query_body_recovery_execution_runner_from_refined_candidate",
    approvedNextArtifact: "next_controlled_sportomedia_graphql_query_body_recovery_candidate_execution_runner",

    approvalIsExecutionPermissionNow: false,
    approvalIsFetchPermissionNow: false,

    mayBuildNextCandidateExecutionRunner:
      approvalGateStatus === "approved_to_build_next_sportomedia_graphql_query_body_recovery_candidate_execution_runner",

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
    approvalRowIsTruth: false,
    queryBodyCandidatesAreTruth: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    zeroResultDoesNotImplyAbsence: true,
    missingStandingKeywordDoesNotProveAbsence: true,
    noMatchTodayDoesNotImplyInactive: true,

    nextAllowedStep:
      approvalGateStatus === "approved_to_build_next_sportomedia_graphql_query_body_recovery_candidate_execution_runner"
        ? "build_next_controlled_sportomedia_graphql_query_body_recovery_candidate_execution_runner"
        : "repair_next_sportomedia_graphql_query_body_recovery_candidate_approval_gate",
    nextBlockedStep: "controlled_fetch_classifier_canonical_write_truth_assertions_blocked_until_final_execution_approval"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const review = readJson(args.reviewInput);
  const reviewRows = validateReview(review);

  const approvalRows = reviewRows
    .map(buildApprovalRow)
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const approvedRows = approvalRows.filter((row) => row.approvalGateStatus === "approved_to_build_next_sportomedia_graphql_query_body_recovery_candidate_execution_runner");
  const blockedRows = approvalRows.filter((row) => row.approvalGateStatus !== "approved_to_build_next_sportomedia_graphql_query_body_recovery_candidate_execution_runner");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "prepare-football-truth-next-sportomedia-graphql-query-body-recovery-candidate-approval-gate-file",
    mode: "prepare_next_sportomedia_graphql_query_body_recovery_candidate_approval_gate_no_fetch_no_search_no_classifier_no_truth_assertion_no_write",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      sportomediaGraphqlQueryBodyRecoveryResponseReviewAndRefinementPlan: args.reviewInput
    },
    summary: {
      nextSportomediaGraphqlQueryBodyRecoveryCandidateApprovalGateCompetitionCount: approvalRows.length,
      nextSportomediaGraphqlQueryBodyRecoveryCandidateApprovalGateApprovedCount: approvedRows.length,
      nextSportomediaGraphqlQueryBodyRecoveryCandidateApprovalGateBlockedCount: blockedRows.length,

      approvedHttp400PersistedQueryIdCandidateRejectedCount:
        approvalRows.filter((row) => row.previousResponseReviewStatus === "http_400_persisted_query_id_candidate_rejected_needs_body_like_or_hash_candidate_refinement").length,
      approvedRefinementReadyCount:
        approvalRows.filter((row) => row.previousRefinementStatus === "ready_for_next_no_write_query_body_recovery_candidate_approval_gate").length,
      approvedPreviousErrorResponseCount:
        approvalRows.filter((row) => row.previousResponseHasErrorsKey).length,
      approvedPreviousDataResponseCount:
        approvalRows.filter((row) => row.previousResponseHasDataKey).length,
      approvedPreviousPayloadCandidateResponseCount:
        approvalRows.filter((row) => row.previousQueryBodyRecoveryResponseCandidate).length,

      approvedRemainingCandidateCount:
        approvalRows.reduce((sum, row) => sum + Number(row.remainingCandidateCount || 0), 0),
      approvedRemainingBodyLikeCandidateCount:
        approvalRows.reduce((sum, row) => sum + Number(row.remainingBodyLikeCandidateCount || 0), 0),
      approvedRemainingPersistedQueryCandidateCount:
        approvalRows.reduce((sum, row) => sum + Number(row.remainingPersistedQueryCandidateCount || 0), 0),
      approvedRemainingHashLikePersistedCandidateCount:
        approvalRows.reduce((sum, row) => sum + Number(row.remainingHashLikePersistedCandidateCount || 0), 0),

      approvedPrimaryRefinementCandidateCount:
        approvalRows.filter((row) => row.approvedPrimaryRefinementCandidate).length,
      approvedPrimaryBodyLikeCandidateCount:
        approvalRows.filter((row) => row.approvedPrimaryIsBodyLikeCandidate).length,
      approvedPrimaryPersistedQueryCandidateCount:
        approvalRows.filter((row) => row.approvedPrimaryIsPersistedQueryCandidate).length,

      mayBuildNextCandidateExecutionRunnerCount:
        approvalRows.filter((row) => row.mayBuildNextCandidateExecutionRunner).length,
      approvalIsExecutionPermissionNowCount:
        approvalRows.filter((row) => row.approvalIsExecutionPermissionNow).length,
      approvalIsFetchPermissionNowCount:
        approvalRows.filter((row) => row.approvalIsFetchPermissionNow).length,

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
      approvalRowTruthCount: 0,
      queryBodyCandidatesTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        blockedRows.length === 0
          ? "build_next_controlled_sportomedia_graphql_query_body_recovery_candidate_execution_runner"
          : "repair_next_sportomedia_graphql_query_body_recovery_candidate_approval_gate"
    },
    counts: {
      byApprovalGateStatus: countBy(approvalRows, "approvalGateStatus"),
      byApprovedPrimaryRefinementCandidateType: countBy(approvalRows, "approvedPrimaryRefinementCandidateType"),
      byPreviousRequestBodyVariant: countBy(approvalRows, "previousRequestBodyVariant"),
      byNextAllowedStep: countBy(approvalRows, "nextAllowedStep")
    },
    guardrails: [
      "This approval gate reads only the no-write Sportomedia query/body recovery response review and refinement plan.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a season-state classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Approval only allows building the next controlled refined-candidate execution runner artifact.",
      "Approval does not allow endpoint execution or fetch now.",
      "Refined query/body candidates are not truth assertions.",
      "Approval rows are not truth assertions.",
      "HTTP 400 GraphQL errors are diagnostic feedback only.",
      "Endpoint reachability is not standings truth.",
      "Missing standing keyword does not prove absence.",
      "No match today must not imply inactive.",
      "Zero result must not imply absence."
    ],
    approvalRows,
    blockedRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    nextSportomediaGraphqlQueryBodyRecoveryCandidateApprovalGateCompetitionCount: output.summary.nextSportomediaGraphqlQueryBodyRecoveryCandidateApprovalGateCompetitionCount,
    nextSportomediaGraphqlQueryBodyRecoveryCandidateApprovalGateApprovedCount: output.summary.nextSportomediaGraphqlQueryBodyRecoveryCandidateApprovalGateApprovedCount,
    nextSportomediaGraphqlQueryBodyRecoveryCandidateApprovalGateBlockedCount: output.summary.nextSportomediaGraphqlQueryBodyRecoveryCandidateApprovalGateBlockedCount,
    approvedHttp400PersistedQueryIdCandidateRejectedCount: output.summary.approvedHttp400PersistedQueryIdCandidateRejectedCount,
    approvedRefinementReadyCount: output.summary.approvedRefinementReadyCount,
    approvedPreviousErrorResponseCount: output.summary.approvedPreviousErrorResponseCount,
    approvedPreviousDataResponseCount: output.summary.approvedPreviousDataResponseCount,
    approvedPreviousPayloadCandidateResponseCount: output.summary.approvedPreviousPayloadCandidateResponseCount,
    approvedRemainingCandidateCount: output.summary.approvedRemainingCandidateCount,
    approvedRemainingBodyLikeCandidateCount: output.summary.approvedRemainingBodyLikeCandidateCount,
    approvedRemainingPersistedQueryCandidateCount: output.summary.approvedRemainingPersistedQueryCandidateCount,
    approvedRemainingHashLikePersistedCandidateCount: output.summary.approvedRemainingHashLikePersistedCandidateCount,
    approvedPrimaryRefinementCandidateCount: output.summary.approvedPrimaryRefinementCandidateCount,
    approvedPrimaryBodyLikeCandidateCount: output.summary.approvedPrimaryBodyLikeCandidateCount,
    approvedPrimaryPersistedQueryCandidateCount: output.summary.approvedPrimaryPersistedQueryCandidateCount,
    mayBuildNextCandidateExecutionRunnerCount: output.summary.mayBuildNextCandidateExecutionRunnerCount,
    approvalIsExecutionPermissionNowCount: output.summary.approvalIsExecutionPermissionNowCount,
    approvalIsFetchPermissionNowCount: output.summary.approvalIsFetchPermissionNowCount,
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
    approvalRowTruthCount: output.summary.approvalRowTruthCount,
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
