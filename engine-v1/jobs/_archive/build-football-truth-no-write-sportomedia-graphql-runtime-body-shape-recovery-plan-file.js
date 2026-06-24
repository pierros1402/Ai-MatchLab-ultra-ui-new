#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DEFAULTS = {
  date: "2026-06-14",
  reviewInput: "data/football-truth/_diagnostics/controlled-sportomedia-graphql-query-body-recovery-refined-candidate-response-review-2026-06-14/controlled-sportomedia-graphql-query-body-recovery-refined-candidate-response-review-2026-06-14.json",
  approvalInput: "data/football-truth/_diagnostics/final-explicit-controlled-sportomedia-graphql-query-body-recovery-refined-candidate-execution-run-approval-2026-06-14/final-explicit-controlled-sportomedia-graphql-query-body-recovery-refined-candidate-execution-run-approval-2026-06-14.json",
  output: "data/football-truth/_diagnostics/no-write-sportomedia-graphql-runtime-body-shape-recovery-plan-2026-06-14/no-write-sportomedia-graphql-runtime-body-shape-recovery-plan-2026-06-14.json"
};

const EXPECTED_SLUGS = ["swe.1", "swe.2"];

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--review-input") args.reviewInput = argv[++i];
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

function safeJsonParse(value) {
  try {
    return JSON.parse(String(value || ""));
  } catch {
    return null;
  }
}

function validateReview(input) {
  const s = input.summary || {};

  assertSummary(s, "sportomediaGraphqlQueryBodyRecoveryRefinedCandidateResponseReviewCompetitionCount", 2);
  assertSummary(s, "http200GraphqlErrorResponseCount", 2);
  assertSummary(s, "refinedCandidateRequestBodyBuiltCount", 2);
  assertSummary(s, "refinedCandidateRequestBodyBuildBlockedCount", 0);
  assertSummary(s, "responseHasErrorsKeyCount", 2);
  assertSummary(s, "responseHasDataKeyCount", 0);
  assertSummary(s, "responseJsonParsedCount", 2);
  assertSummary(s, "standingKeywordResponseCount", 0);
  assertSummary(s, "refinedCandidateResponseCandidateCount", 0);
  assertSummary(s, "runtimeBodyShapeRecoveryNeededCount", 2);
  assertSummary(s, "runtimeBodyShapeRecoveryPlanReadyCount", 2);
  assertSummary(s, "runtimeBodyShapeRecoveryPlanBlockedCount", 0);
  assertSummary(s, "mayPrepareRuntimeBodyShapeRecoveryPlanCount", 2);

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
  assertSummary(s, "refinedCandidateResponseTruthCount", 0);
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
    if (row.responseReviewStatus !== "http_200_refined_body_like_candidate_graphql_error_needs_runtime_body_shape_recovery") {
      throw new Error(row.competitionSlug + ": expected refined body-like HTTP 200 GraphQL error review status.");
    }
    if (row.refinementStatus !== "ready_for_runtime_body_shape_recovery_plan") {
      throw new Error(row.competitionSlug + ": runtime body-shape recovery plan is not ready.");
    }
    if (row.graphqlErrorClass !== "graphql_error_needs_runtime_body_shape_inspection") {
      throw new Error(row.competitionSlug + ": expected generic runtime body-shape inspection class.");
    }
    if (row.mayPrepareRuntimeBodyShapeRecoveryPlan !== true) {
      throw new Error(row.competitionSlug + ": mayPrepareRuntimeBodyShapeRecoveryPlan must be true.");
    }
  }

  return rows;
}

function validateApproval(input) {
  const s = input.summary || {};

  assertSummary(s, "finalExplicitControlledSportomediaGraphqlQueryBodyRecoveryRefinedCandidateExecutionRunApprovalCompetitionCount", 2);
  assertSummary(s, "finalExplicitControlledSportomediaGraphqlQueryBodyRecoveryRefinedCandidateExecutionRunApprovalApprovedCount", 2);
  assertSummary(s, "finalExplicitControlledSportomediaGraphqlQueryBodyRecoveryRefinedCandidateExecutionRunApprovalBlockedCount", 0);
  assertSummary(s, "approvedRunnerTargetCount", 2);
  assertSummary(s, "approvedPrimaryRefinementCandidateCount", 2);
  assertSummary(s, "approvedPrimaryBodyLikeCandidateCount", 2);
  assertSummary(s, "approvedPrimaryPersistedQueryCandidateCount", 0);
  assertSummary(s, "finalRunWouldAllowSearchCount", 0);
  assertSummary(s, "finalRunWouldAllowBroadSearchCount", 0);
  assertSummary(s, "finalRunWouldAllowClassifierCount", 0);
  assertSummary(s, "finalRunWouldAllowCanonicalWriteCount", 0);
  assertSummary(s, "finalRunWouldAllowProductionWriteCount", 0);
  assertSummary(s, "finalRunWouldAllowTruthAssertionCount", 0);
  assertSummary(s, "fetchExecutedNowCount", 0);
  assertSummary(s, "searchExecutedNowCount", 0);
  assertSummary(s, "broadSearchExecutedNowCount", 0);
  assertSummary(s, "classifierExecutedNowCount", 0);
  assertSummary(s, "canonicalWriteExecutedNowCount", 0);
  assertSummary(s, "productionWriteExecutedNowCount", 0);
  assertSummary(s, "finalApprovalTruthCount", 0);
  assertSummary(s, "queryBodyCandidatesTruthCount", 0);
  assertSummary(s, "canonicalWrites", 0);
  assertSummary(s, "productionWrite", false);

  const rows = Array.isArray(input.finalApprovalRows) ? input.finalApprovalRows : [];
  if (rows.length !== 2) throw new Error("Expected 2 finalApprovalRows.");

  const slugs = uniqueSorted(rows.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Unexpected approval slugs: " + slugs.join(", "));
  }

  return rows;
}

function normalizeBodyKeys(body) {
  const parsed = typeof body === "string" ? safeJsonParse(body) : body;
  const source = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  return Object.keys(source).sort();
}

function buildCandidateShapes(reviewRow, approvalRow) {
  const requestBody = safeJsonParse(reviewRow.requestBodyPreview) || {};
  const bodyKeys = normalizeBodyKeys(requestBody);
  const hasQuery = typeof requestBody.query === "string" && requestBody.query.trim().length > 0;
  const hasVariables = requestBody.variables && typeof requestBody.variables === "object";
  const variableKeys = hasVariables ? Object.keys(requestBody.variables).sort() : [];
  const hasOperationName = typeof requestBody.operationName === "string" && requestBody.operationName.trim().length > 0;
  const hasExtensions = requestBody.extensions && typeof requestBody.extensions === "object";
  const hasDocumentId = Boolean(requestBody.id || requestBody.queryId || requestBody.documentId || requestBody.operationId);

  const rawCandidate = approvalRow?.primaryRefinementCandidate || {};
  const rawCandidateKeys = rawCandidate && typeof rawCandidate === "object" ? Object.keys(rawCandidate).sort() : [];

  const planCandidates = [];

  planCandidates.push({
    candidateRank: 1,
    candidateType: "runtime_body_shape_inspection_from_refined_body_like_request",
    candidatePurpose: "inspect_actual_request_body_shape_that_returns_http_200_graphql_errors",
    reason: "Refined body-like request builds and reaches GraphQL with HTTP 200, but response has errors and no data.",
    requestBodyKeys: bodyKeys,
    variableKeys,
    hasQuery,
    hasVariables,
    hasOperationName,
    hasExtensions,
    hasDocumentId,
    requestBodySha256: sha256(JSON.stringify(requestBody)),
    requestBodyPreview: JSON.stringify(requestBody).slice(0, 1500),
    mayExecuteNow: false,
    mayFetchNow: false
  });

  planCandidates.push({
    candidateRank: 2,
    candidateType: "runtime_variables_and_arguments_recovery_candidate",
    candidatePurpose: "recover_missing_or_malformed_variables_arguments_from_candidate_shape_and_runtime_error",
    reason: "Generic GraphQL error class did not expose a simple missing-variable label, so variables/body shape must be reviewed structurally.",
    currentVariableKeys: variableKeys,
    approvedCandidateKeys: rawCandidateKeys,
    approvedCandidateSha256: sha256(JSON.stringify(rawCandidate)),
    mayExecuteNow: false,
    mayFetchNow: false
  });

  planCandidates.push({
    candidateRank: 3,
    candidateType: "runtime_operation_name_and_document_shape_recovery_candidate",
    candidatePurpose: "recover_operationName_or_document_id_shape_when body-like request returns errors",
    reason: "The body-like request is accepted at HTTP level but GraphQL rejects it semantically; operation/document shape is still uncertain.",
    hasOperationName,
    hasDocumentId,
    hasExtensions,
    requestBodyKeys: bodyKeys,
    mayExecuteNow: false,
    mayFetchNow: false
  });

  return planCandidates;
}

function buildPlanRow(reviewRow, approvalRow) {
  const blockingReasons = [];

  if (reviewRow.responseReviewStatus !== "http_200_refined_body_like_candidate_graphql_error_needs_runtime_body_shape_recovery") {
    blockingReasons.push("response_review_status_not_runtime_body_shape_recovery");
  }
  if (reviewRow.refinementStatus !== "ready_for_runtime_body_shape_recovery_plan") {
    blockingReasons.push("review_row_not_runtime_body_shape_plan_ready");
  }
  if (reviewRow.mayPrepareRuntimeBodyShapeRecoveryPlan !== true) {
    blockingReasons.push("review_does_not_allow_runtime_body_shape_recovery_plan");
  }
  if (reviewRow.requestBodyBuildStatus !== "built_from_refined_graphql_body_like_candidate") {
    blockingReasons.push("refined_candidate_request_body_not_built");
  }
  if (reviewRow.requestBodyVariant !== "refined_graphql_body_like_candidate") {
    blockingReasons.push("request_body_variant_not_refined_body_like_candidate");
  }
  if (reviewRow.responseHasErrorsKey !== true) {
    blockingReasons.push("response_missing_errors_key");
  }
  if (reviewRow.responseHasDataKey !== false) {
    blockingReasons.push("response_has_data_key");
  }
  if (reviewRow.refinedCandidateResponseCandidate !== false) {
    blockingReasons.push("response_already_payload_candidate");
  }
  if (!approvalRow) {
    blockingReasons.push("missing_final_approval_row");
  }
  if (approvalRow && approvalRow.primaryRefinementCandidateType !== "graphqlBodyLikeObject") {
    blockingReasons.push("approved_primary_refinement_candidate_not_body_like");
  }

  if (reviewRow.mayExecuteNow !== false) blockingReasons.push("review_would_execute_now");
  if (reviewRow.mayFetchNow !== false) blockingReasons.push("review_would_fetch_now");
  if (reviewRow.maySearchNow !== false) blockingReasons.push("review_would_search_now");
  if (reviewRow.mayBroadSearchNow !== false) blockingReasons.push("review_would_broad_search_now");
  if (reviewRow.mayClassifySeasonStateNow !== false) blockingReasons.push("review_would_classify_now");
  if (reviewRow.mayWriteCanonicalNow !== false) blockingReasons.push("review_would_write_canonical_now");
  if (reviewRow.mayAssertTruthNow !== false) blockingReasons.push("review_would_assert_truth_now");

  const runtimeBodyShapeRecoveryPlanStatus =
    blockingReasons.length === 0
      ? "ready_for_runtime_body_shape_recovery_approval_gate"
      : "blocked_runtime_body_shape_recovery_plan";

  const recoveryCandidates = buildCandidateShapes(reviewRow, approvalRow);

  return {
    competitionSlug: reviewRow.competitionSlug,
    reusableFamily: reviewRow.reusableFamily,
    runtimeBodyShapeRecoveryPlanStatus,
    blockingReasons,

    responseReviewStatus: reviewRow.responseReviewStatus,
    refinementStatus: reviewRow.refinementStatus,
    graphqlErrorClass: reviewRow.graphqlErrorClass,
    errorSignals: reviewRow.errorSignals || [],

    httpStatus: reviewRow.httpStatus,
    executionStatus: reviewRow.executionStatus,
    fetchStatus: reviewRow.fetchStatus,
    requestBodyBuildStatus: reviewRow.requestBodyBuildStatus,
    requestBodyVariant: reviewRow.requestBodyVariant,
    requestBodySha256: reviewRow.requestBodySha256,
    requestBodyPreview: reviewRow.requestBodyPreview,
    responseHasErrorsKey: reviewRow.responseHasErrorsKey,
    responseHasDataKey: reviewRow.responseHasDataKey,
    responseJsonParsed: reviewRow.responseJsonParsed,
    hasStandingKeyword: reviewRow.hasStandingKeyword,
    refinedCandidateResponseCandidate: reviewRow.refinedCandidateResponseCandidate,

    approvedRunnerTargetId: approvalRow?.runnerTargetId || reviewRow.approvedRunnerTargetId,
    approvedPrimaryRefinementCandidateType: approvalRow?.primaryRefinementCandidateType || reviewRow.approvedPrimaryRefinementCandidateType,
    approvedPrimaryRefinementCandidateScore: approvalRow?.primaryRefinementCandidateScore || reviewRow.approvedPrimaryRefinementCandidateScore,
    approvedPrimaryRefinementCandidateSource: approvalRow?.primaryRefinementCandidateSource || reviewRow.approvedPrimaryRefinementCandidateSource,
    approvedPrimaryRefinementCandidateSha256: approvalRow?.primaryRefinementCandidateSha256 || reviewRow.approvedPrimaryRefinementCandidateSha256,

    recoveryCandidateCount: recoveryCandidates.length,
    primaryRecoveryCandidateType: recoveryCandidates[0]?.candidateType || null,
    runtimeBodyShapeRecoveryCandidates: recoveryCandidates,

    mayPrepareRuntimeBodyShapeRecoveryApprovalGate:
      runtimeBodyShapeRecoveryPlanStatus === "ready_for_runtime_body_shape_recovery_approval_gate",

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
    runtimeBodyShapePlanIsTruth: false,
    recoveryCandidatesAreTruth: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    zeroResultDoesNotImplyAbsence: true,
    missingStandingKeywordDoesNotProveAbsence: true,
    noMatchTodayDoesNotImplyInactive: true,

    nextAllowedStep:
      runtimeBodyShapeRecoveryPlanStatus === "ready_for_runtime_body_shape_recovery_approval_gate"
        ? "prepare_sportomedia_graphql_runtime_body_shape_recovery_approval_gate"
        : "repair_sportomedia_graphql_runtime_body_shape_recovery_plan",
    nextBlockedStep: "fetch_search_classifier_canonical_write_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const review = readJson(args.reviewInput);
  const reviewRows = validateReview(review);

  const approval = readJson(args.approvalInput);
  const approvalRows = validateApproval(approval);

  const planRows = reviewRows.map((reviewRow) => {
    const approvalRow = approvalRows.find((row) => row.competitionSlug === reviewRow.competitionSlug);
    return buildPlanRow(reviewRow, approvalRow);
  }).sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const readyRows = planRows.filter((row) => row.runtimeBodyShapeRecoveryPlanStatus === "ready_for_runtime_body_shape_recovery_approval_gate");
  const blockedRows = planRows.filter((row) => row.runtimeBodyShapeRecoveryPlanStatus !== "ready_for_runtime_body_shape_recovery_approval_gate");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-no-write-sportomedia-graphql-runtime-body-shape-recovery-plan-file",
    mode: "build_no_write_sportomedia_graphql_runtime_body_shape_recovery_plan_no_fetch_no_search_no_classifier_no_truth_assertion_no_write",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      refinedCandidateResponseReview: args.reviewInput,
      refinedCandidateFinalApproval: args.approvalInput
    },
    summary: {
      sportomediaGraphqlRuntimeBodyShapeRecoveryPlanCompetitionCount: planRows.length,
      runtimeBodyShapeRecoveryPlanReadyCount: readyRows.length,
      runtimeBodyShapeRecoveryPlanBlockedCount: blockedRows.length,

      http200GraphqlErrorResponseCount:
        planRows.filter((row) => row.responseReviewStatus === "http_200_refined_body_like_candidate_graphql_error_needs_runtime_body_shape_recovery").length,
      graphqlErrorNeedsRuntimeBodyShapeInspectionCount:
        planRows.filter((row) => row.graphqlErrorClass === "graphql_error_needs_runtime_body_shape_inspection").length,
      refinedBodyLikeRequestBodyBuiltCount:
        planRows.filter((row) => row.requestBodyBuildStatus === "built_from_refined_graphql_body_like_candidate").length,
      responseHasErrorsKeyCount: planRows.filter((row) => row.responseHasErrorsKey).length,
      responseHasDataKeyCount: planRows.filter((row) => row.responseHasDataKey).length,
      refinedCandidateResponseCandidateCount: planRows.filter((row) => row.refinedCandidateResponseCandidate).length,

      approvedPrimaryBodyLikeCandidateCount:
        planRows.filter((row) => row.approvedPrimaryRefinementCandidateType === "graphqlBodyLikeObject").length,
      approvedPrimaryPersistedQueryCandidateCount:
        planRows.filter((row) => row.approvedPrimaryRefinementCandidateType === "persistedQueryOrDocumentId").length,

      totalRuntimeBodyShapeRecoveryCandidateCount:
        planRows.reduce((sum, row) => sum + Number(row.recoveryCandidateCount || 0), 0),
      primaryRuntimeBodyShapeInspectionCandidateCount:
        planRows.filter((row) => row.primaryRecoveryCandidateType === "runtime_body_shape_inspection_from_refined_body_like_request").length,
      runtimeVariablesAndArgumentsRecoveryCandidateCount:
        planRows.reduce((sum, row) => sum + row.runtimeBodyShapeRecoveryCandidates.filter((candidate) => candidate.candidateType === "runtime_variables_and_arguments_recovery_candidate").length, 0),
      runtimeOperationNameAndDocumentShapeRecoveryCandidateCount:
        planRows.reduce((sum, row) => sum + row.runtimeBodyShapeRecoveryCandidates.filter((candidate) => candidate.candidateType === "runtime_operation_name_and_document_shape_recovery_candidate").length, 0),

      mayPrepareRuntimeBodyShapeRecoveryApprovalGateCount:
        planRows.filter((row) => row.mayPrepareRuntimeBodyShapeRecoveryApprovalGate).length,

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
      runtimeBodyShapePlanTruthCount: 0,
      recoveryCandidatesTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        blockedRows.length === 0
          ? "prepare_sportomedia_graphql_runtime_body_shape_recovery_approval_gate"
          : "repair_sportomedia_graphql_runtime_body_shape_recovery_plan"
    },
    counts: {
      byRuntimeBodyShapeRecoveryPlanStatus: countBy(planRows, "runtimeBodyShapeRecoveryPlanStatus"),
      byGraphqlErrorClass: countBy(planRows, "graphqlErrorClass"),
      byRequestBodyVariant: countBy(planRows, "requestBodyVariant"),
      byPrimaryRecoveryCandidateType: countBy(planRows, "primaryRecoveryCandidateType"),
      byNextAllowedStep: countBy(planRows, "nextAllowedStep")
    },
    guardrails: [
      "This plan reads only refined-candidate response review and final approval artifacts.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a season-state classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "HTTP 200 with GraphQL errors is diagnostic feedback only.",
      "Runtime body shape candidates are not truth assertions.",
      "Plan rows are not truth assertions.",
      "Response data is not canonical truth until later parser/evidence gates pass.",
      "Endpoint reachability is not standings truth.",
      "Missing standing keyword does not prove absence.",
      "No match today must not imply inactive.",
      "Zero result must not imply absence."
    ],
    planRows,
    blockedRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    sportomediaGraphqlRuntimeBodyShapeRecoveryPlanCompetitionCount: output.summary.sportomediaGraphqlRuntimeBodyShapeRecoveryPlanCompetitionCount,
    runtimeBodyShapeRecoveryPlanReadyCount: output.summary.runtimeBodyShapeRecoveryPlanReadyCount,
    runtimeBodyShapeRecoveryPlanBlockedCount: output.summary.runtimeBodyShapeRecoveryPlanBlockedCount,
    http200GraphqlErrorResponseCount: output.summary.http200GraphqlErrorResponseCount,
    graphqlErrorNeedsRuntimeBodyShapeInspectionCount: output.summary.graphqlErrorNeedsRuntimeBodyShapeInspectionCount,
    refinedBodyLikeRequestBodyBuiltCount: output.summary.refinedBodyLikeRequestBodyBuiltCount,
    responseHasErrorsKeyCount: output.summary.responseHasErrorsKeyCount,
    responseHasDataKeyCount: output.summary.responseHasDataKeyCount,
    refinedCandidateResponseCandidateCount: output.summary.refinedCandidateResponseCandidateCount,
    approvedPrimaryBodyLikeCandidateCount: output.summary.approvedPrimaryBodyLikeCandidateCount,
    approvedPrimaryPersistedQueryCandidateCount: output.summary.approvedPrimaryPersistedQueryCandidateCount,
    totalRuntimeBodyShapeRecoveryCandidateCount: output.summary.totalRuntimeBodyShapeRecoveryCandidateCount,
    primaryRuntimeBodyShapeInspectionCandidateCount: output.summary.primaryRuntimeBodyShapeInspectionCandidateCount,
    runtimeVariablesAndArgumentsRecoveryCandidateCount: output.summary.runtimeVariablesAndArgumentsRecoveryCandidateCount,
    runtimeOperationNameAndDocumentShapeRecoveryCandidateCount: output.summary.runtimeOperationNameAndDocumentShapeRecoveryCandidateCount,
    mayPrepareRuntimeBodyShapeRecoveryApprovalGateCount: output.summary.mayPrepareRuntimeBodyShapeRecoveryApprovalGateCount,
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
    runtimeBodyShapePlanTruthCount: output.summary.runtimeBodyShapePlanTruthCount,
    recoveryCandidatesTruthCount: output.summary.recoveryCandidatesTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    userHintUsedCount: output.summary.userHintUsedCount,
    hardcodedSeasonStateOverrideUsedCount: output.summary.hardcodedSeasonStateOverrideUsedCount,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
