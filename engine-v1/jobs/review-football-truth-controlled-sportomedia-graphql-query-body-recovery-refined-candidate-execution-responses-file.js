#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DEFAULTS = {
  date: "2026-06-14",
  executionInput: "data/football-truth/_diagnostics/controlled-sportomedia-graphql-query-body-recovery-refined-candidate-execution-run-2026-06-14/controlled-sportomedia-graphql-query-body-recovery-refined-candidate-execution-run-2026-06-14.json",
  approvalInput: "data/football-truth/_diagnostics/final-explicit-controlled-sportomedia-graphql-query-body-recovery-refined-candidate-execution-run-approval-2026-06-14/final-explicit-controlled-sportomedia-graphql-query-body-recovery-refined-candidate-execution-run-approval-2026-06-14.json",
  output: "data/football-truth/_diagnostics/controlled-sportomedia-graphql-query-body-recovery-refined-candidate-response-review-2026-06-14/controlled-sportomedia-graphql-query-body-recovery-refined-candidate-response-review-2026-06-14.json"
};

const EXPECTED_SLUGS = ["swe.1", "swe.2"];

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--execution-input") args.executionInput = argv[++i];
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

function validateExecution(input) {
  const s = input.summary || {};

  assertSummary(s, "controlledSportomediaGraphqlQueryBodyRecoveryRefinedCandidateExecutionCompetitionCount", 2);
  assertSummary(s, "controlledRefinedCandidateQueryBodyRecoveryExecutedCount", 2);
  assertSummary(s, "configuredGraphqlPayloadFetchExecutedCount", 2);
  assertSummary(s, "requestBodyBuiltCount", 2);
  assertSummary(s, "requestBodyBuildBlockedCount", 0);
  assertSummary(s, "fetchedOkCount", 2);
  assertSummary(s, "httpOkCount", 2);
  assertSummary(s, "httpNotOkCount", 0);
  assertSummary(s, "fetchErrorCount", 0);
  assertSummary(s, "totalResponseRawTextLength", 178);
  assertSummary(s, "jsonContentTypeCount", 2);
  assertSummary(s, "responseJsonParsedCount", 2);
  assertSummary(s, "responseHasDataKeyCount", 0);
  assertSummary(s, "responseHasErrorsKeyCount", 2);
  assertSummary(s, "graphqlKeywordResponseCount", 2);
  assertSummary(s, "standingKeywordResponseCount", 0);
  assertSummary(s, "refinedCandidateResponseCandidateCount", 0);
  assertSummary(s, "fetchExecutedNowCount", 2);

  assertSummary(s, "searchExecutedNowCount", 0);
  assertSummary(s, "broadSearchExecutedNowCount", 0);
  assertSummary(s, "classifierExecutedNowCount", 0);
  assertSummary(s, "canonicalWriteExecutedNowCount", 0);
  assertSummary(s, "productionWriteExecutedNowCount", 0);
  assertSummary(s, "activeAssertedCount", 0);
  assertSummary(s, "inactiveAssertedCount", 0);
  assertSummary(s, "completedAssertedCount", 0);
  assertSummary(s, "seasonStateTruthAssertedCount", 0);
  assertSummary(s, "refinedCandidateResponseTruthCount", 0);
  assertSummary(s, "canonicalWrites", 0);
  assertSummary(s, "productionWrite", false);
  assertSummary(s, "userHintUsedCount", 0);
  assertSummary(s, "hardcodedSeasonStateOverrideUsedCount", 0);

  const rows = Array.isArray(input.executionRows) ? input.executionRows : [];
  if (rows.length !== 2) throw new Error("Expected 2 executionRows.");

  const slugs = uniqueSorted(rows.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Unexpected execution slugs: " + slugs.join(", "));
  }

  return rows;
}

function validateApproval(input) {
  const s = input.summary || {};

  assertSummary(s, "finalExplicitControlledSportomediaGraphqlQueryBodyRecoveryRefinedCandidateExecutionRunApprovalCompetitionCount", 2);
  assertSummary(s, "finalExplicitControlledSportomediaGraphqlQueryBodyRecoveryRefinedCandidateExecutionRunApprovalApprovedCount", 2);
  assertSummary(s, "finalExplicitControlledSportomediaGraphqlQueryBodyRecoveryRefinedCandidateExecutionRunApprovalBlockedCount", 0);
  assertSummary(s, "approvedRunnerTargetCount", 2);
  assertSummary(s, "approvedPreviousPersistedQueryIdCandidateRejectedCount", 2);
  assertSummary(s, "approvedPreviousHttp400Count", 2);
  assertSummary(s, "approvedPreviousErrorResponseCount", 2);
  assertSummary(s, "approvedPreviousDataResponseCount", 0);
  assertSummary(s, "approvedPreviousPayloadCandidateResponseCount", 0);
  assertSummary(s, "approvedPrimaryRefinementCandidateCount", 2);
  assertSummary(s, "approvedPrimaryBodyLikeCandidateCount", 2);
  assertSummary(s, "approvedPrimaryPersistedQueryCandidateCount", 0);
  assertSummary(s, "mayRunControlledRefinedCandidateQueryBodyRecoveryNextCount", 2);
  assertSummary(s, "finalRunWouldAllowControlledRefinedCandidateQueryBodyRecoveryCount", 2);
  assertSummary(s, "finalRunWouldAllowConfiguredGraphqlPayloadFetchCount", 2);
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

function extractGraphqlErrorSignals(rawText) {
  const parsed = safeJsonParse(rawText);
  const signals = [];

  if (parsed && typeof parsed === "object") {
    if (Array.isArray(parsed.errors)) {
      for (const err of parsed.errors.slice(0, 20)) {
        signals.push({
          kind: "graphql_error",
          message: String(err?.message || "").slice(0, 1000),
          code: err?.extensions?.code || err?.code || null,
          path: Array.isArray(err?.path) ? err.path.join(".") : null,
          locations: Array.isArray(err?.locations) ? err.locations.slice(0, 5) : []
        });
      }
    }

    for (const key of Object.keys(parsed).slice(0, 20)) {
      signals.push({ kind: "json_top_level_key", value: key });
    }
  } else if (rawText) {
    signals.push({ kind: "raw_text_preview", value: String(rawText).slice(0, 1000) });
  }

  return signals;
}

function classifyGraphqlErrorSignals(signals) {
  const text = signals.map((s) => [s.kind, s.message, s.code, s.path, s.value].filter(Boolean).join(" ")).join(" ").toLowerCase();

  if (/variable|required|argument|field.*required|cannot be null|non-null|missing/.test(text)) {
    return "graphql_error_likely_missing_required_variables_or_arguments";
  }
  if (/operation|operationname|unknown operation|must provide operation/.test(text)) {
    return "graphql_error_likely_missing_or_wrong_operation_name";
  }
  if (/persisted|hash|document|query id|queryid|documentid/.test(text)) {
    return "graphql_error_likely_persisted_document_shape_needed";
  }
  if (/syntax|parse|validation|cannot query field|unknown field|field .* not found/.test(text)) {
    return "graphql_error_likely_query_shape_or_schema_mismatch";
  }
  if (/unauthorized|forbidden|auth|token|permission|access/.test(text)) {
    return "graphql_error_likely_header_or_auth_context_missing";
  }

  return "graphql_error_needs_runtime_body_shape_inspection";
}

function buildReviewRow(executionRow, approvalRow) {
  const rawText = executionRow.rawTextPreview || "";
  const errorSignals = extractGraphqlErrorSignals(rawText);
  const errorClass = classifyGraphqlErrorSignals(errorSignals);

  const responseReviewStatus =
    executionRow.executionStatus === "refined_candidate_query_body_recovery_graphql_error_response" &&
    executionRow.status === 200 &&
    executionRow.responseHasErrorsKey === true &&
    executionRow.responseHasDataKey === false
      ? "http_200_refined_body_like_candidate_graphql_error_needs_runtime_body_shape_recovery"
      : "refined_candidate_response_needs_manual_review";

  const refinementStatus =
    responseReviewStatus === "http_200_refined_body_like_candidate_graphql_error_needs_runtime_body_shape_recovery"
      ? "ready_for_runtime_body_shape_recovery_plan"
      : "blocked_refined_candidate_response_review_not_classified";

  return {
    competitionSlug: executionRow.competitionSlug,
    reusableFamily: executionRow.reusableFamily,

    responseReviewStatus,
    refinementStatus,
    graphqlErrorClass: errorClass,
    errorSignals,

    executionStatus: executionRow.executionStatus,
    fetchStatus: executionRow.fetchStatus,
    httpStatus: executionRow.status,
    contentType: executionRow.contentType,
    rawTextLength: executionRow.rawTextLength,
    rawTextSha256: executionRow.rawTextSha256,
    responseHasDataKey: executionRow.responseHasDataKey,
    responseHasErrorsKey: executionRow.responseHasErrorsKey,
    responseJsonParsed: executionRow.responseJsonParsed,
    hasStandingKeyword: executionRow.hasStandingKeyword,
    refinedCandidateResponseCandidate: executionRow.refinedCandidateResponseCandidate,

    requestBodyBuildStatus: executionRow.requestBodyBuildStatus,
    requestBodyVariant: executionRow.requestBodyVariant,
    requestBodySha256: executionRow.requestBodySha256,
    requestBodyPreview: executionRow.requestBodyPreview,

    approvedRunnerTargetId: approvalRow?.runnerTargetId || executionRow.runnerTargetId,
    approvedPrimaryRefinementCandidateType: approvalRow?.primaryRefinementCandidateType || executionRow.primaryRefinementCandidateType,
    approvedPrimaryRefinementCandidateScore: approvalRow?.primaryRefinementCandidateScore || executionRow.primaryRefinementCandidateScore,
    approvedPrimaryRefinementCandidateSource: approvalRow?.primaryRefinementCandidateSource || executionRow.primaryRefinementCandidateSource,
    approvedPrimaryRefinementCandidateSha256: approvalRow?.primaryRefinementCandidateSha256 || executionRow.primaryRefinementCandidateSha256,

    previousRequestBodyVariant: approvalRow?.previousRequestBodyVariant || executionRow.previousRequestBodyVariant,
    previousHttpStatus: approvalRow?.previousHttpStatus || executionRow.previousHttpStatus,
    previousResponseHasErrorsKey: approvalRow?.previousResponseHasErrorsKey || executionRow.previousResponseHasErrorsKey,
    previousResponseHasDataKey: approvalRow?.previousResponseHasDataKey || executionRow.previousResponseHasDataKey,

    runtimeBodyShapeRecoveryNeeded: refinementStatus === "ready_for_runtime_body_shape_recovery_plan",
    likelyMissingVariablesOrArguments: errorClass === "graphql_error_likely_missing_required_variables_or_arguments",
    likelyMissingOperationName: errorClass === "graphql_error_likely_missing_or_wrong_operation_name",
    likelyPersistedDocumentShapeNeeded: errorClass === "graphql_error_likely_persisted_document_shape_needed",
    likelyQueryShapeOrSchemaMismatch: errorClass === "graphql_error_likely_query_shape_or_schema_mismatch",
    likelyHeaderOrAuthContextMissing: errorClass === "graphql_error_likely_header_or_auth_context_missing",

    mayPrepareRuntimeBodyShapeRecoveryPlan: refinementStatus === "ready_for_runtime_body_shape_recovery_plan",

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
    responseReviewIsTruth: false,
    refinedCandidateResponseIsTruth: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    zeroResultDoesNotImplyAbsence: true,
    missingStandingKeywordDoesNotProveAbsence: true,
    noMatchTodayDoesNotImplyInactive: true,

    nextAllowedStep:
      refinementStatus === "ready_for_runtime_body_shape_recovery_plan"
        ? "build_no_write_sportomedia_graphql_runtime_body_shape_recovery_plan"
        : "inspect_refined_candidate_response_manually",
    nextBlockedStep: "controlled_fetch_search_classifier_canonical_write_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const execution = readJson(args.executionInput);
  const executionRows = validateExecution(execution);

  const approval = readJson(args.approvalInput);
  const approvalRows = validateApproval(approval);

  const reviewRows = executionRows.map((executionRow) => {
    const approvalRow = approvalRows.find((row) => row.competitionSlug === executionRow.competitionSlug);
    if (!approvalRow) throw new Error(executionRow.competitionSlug + ": missing final approval row.");
    return buildReviewRow(executionRow, approvalRow);
  }).sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const readyRows = reviewRows.filter((row) => row.refinementStatus === "ready_for_runtime_body_shape_recovery_plan");
  const blockedRows = reviewRows.filter((row) => row.refinementStatus !== "ready_for_runtime_body_shape_recovery_plan");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "review-football-truth-controlled-sportomedia-graphql-query-body-recovery-refined-candidate-execution-responses-file",
    mode: "review_refined_candidate_graphql_error_responses_no_fetch_no_search_no_classifier_no_truth_assertion_no_write",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      controlledSportomediaGraphqlQueryBodyRecoveryRefinedCandidateExecutionRun: args.executionInput,
      finalExplicitControlledSportomediaGraphqlQueryBodyRecoveryRefinedCandidateExecutionRunApproval: args.approvalInput
    },
    summary: {
      sportomediaGraphqlQueryBodyRecoveryRefinedCandidateResponseReviewCompetitionCount: reviewRows.length,
      http200GraphqlErrorResponseCount:
        reviewRows.filter((row) => row.responseReviewStatus === "http_200_refined_body_like_candidate_graphql_error_needs_runtime_body_shape_recovery").length,
      refinedCandidateRequestBodyBuiltCount:
        reviewRows.filter((row) => row.requestBodyBuildStatus === "built_from_refined_graphql_body_like_candidate").length,
      refinedCandidateRequestBodyBuildBlockedCount:
        reviewRows.filter((row) => row.requestBodyBuildStatus !== "built_from_refined_graphql_body_like_candidate").length,
      responseHasErrorsKeyCount: reviewRows.filter((row) => row.responseHasErrorsKey).length,
      responseHasDataKeyCount: reviewRows.filter((row) => row.responseHasDataKey).length,
      responseJsonParsedCount: reviewRows.filter((row) => row.responseJsonParsed).length,
      standingKeywordResponseCount: reviewRows.filter((row) => row.hasStandingKeyword).length,
      refinedCandidateResponseCandidateCount: reviewRows.filter((row) => row.refinedCandidateResponseCandidate).length,

      runtimeBodyShapeRecoveryNeededCount: reviewRows.filter((row) => row.runtimeBodyShapeRecoveryNeeded).length,
      likelyMissingVariablesOrArgumentsCount: reviewRows.filter((row) => row.likelyMissingVariablesOrArguments).length,
      likelyMissingOperationNameCount: reviewRows.filter((row) => row.likelyMissingOperationName).length,
      likelyPersistedDocumentShapeNeededCount: reviewRows.filter((row) => row.likelyPersistedDocumentShapeNeeded).length,
      likelyQueryShapeOrSchemaMismatchCount: reviewRows.filter((row) => row.likelyQueryShapeOrSchemaMismatch).length,
      likelyHeaderOrAuthContextMissingCount: reviewRows.filter((row) => row.likelyHeaderOrAuthContextMissing).length,

      runtimeBodyShapeRecoveryPlanReadyCount: readyRows.length,
      runtimeBodyShapeRecoveryPlanBlockedCount: blockedRows.length,
      mayPrepareRuntimeBodyShapeRecoveryPlanCount:
        reviewRows.filter((row) => row.mayPrepareRuntimeBodyShapeRecoveryPlan).length,

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
      responseReviewTruthCount: 0,
      refinedCandidateResponseTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        blockedRows.length === 0
          ? "build_no_write_sportomedia_graphql_runtime_body_shape_recovery_plan"
          : "inspect_refined_candidate_response_manually"
    },
    counts: {
      byResponseReviewStatus: countBy(reviewRows, "responseReviewStatus"),
      byRefinementStatus: countBy(reviewRows, "refinementStatus"),
      byGraphqlErrorClass: countBy(reviewRows, "graphqlErrorClass"),
      byRequestBodyVariant: countBy(reviewRows, "requestBodyVariant"),
      byNextAllowedStep: countBy(reviewRows, "nextAllowedStep")
    },
    guardrails: [
      "This review reads only the refined-candidate execution diagnostics and final approval artifact.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a season-state classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "HTTP 200 with GraphQL errors is diagnostic feedback only.",
      "Refined candidate response review rows are not truth assertions.",
      "Response data is not canonical truth until later parser/evidence gates pass.",
      "Endpoint reachability is not standings truth.",
      "Missing standing keyword does not prove absence.",
      "No match today must not imply inactive.",
      "Zero result must not imply absence."
    ],
    reviewRows,
    blockedRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    sportomediaGraphqlQueryBodyRecoveryRefinedCandidateResponseReviewCompetitionCount: output.summary.sportomediaGraphqlQueryBodyRecoveryRefinedCandidateResponseReviewCompetitionCount,
    http200GraphqlErrorResponseCount: output.summary.http200GraphqlErrorResponseCount,
    refinedCandidateRequestBodyBuiltCount: output.summary.refinedCandidateRequestBodyBuiltCount,
    refinedCandidateRequestBodyBuildBlockedCount: output.summary.refinedCandidateRequestBodyBuildBlockedCount,
    responseHasErrorsKeyCount: output.summary.responseHasErrorsKeyCount,
    responseHasDataKeyCount: output.summary.responseHasDataKeyCount,
    responseJsonParsedCount: output.summary.responseJsonParsedCount,
    standingKeywordResponseCount: output.summary.standingKeywordResponseCount,
    refinedCandidateResponseCandidateCount: output.summary.refinedCandidateResponseCandidateCount,
    runtimeBodyShapeRecoveryNeededCount: output.summary.runtimeBodyShapeRecoveryNeededCount,
    likelyMissingVariablesOrArgumentsCount: output.summary.likelyMissingVariablesOrArgumentsCount,
    likelyMissingOperationNameCount: output.summary.likelyMissingOperationNameCount,
    likelyPersistedDocumentShapeNeededCount: output.summary.likelyPersistedDocumentShapeNeededCount,
    likelyQueryShapeOrSchemaMismatchCount: output.summary.likelyQueryShapeOrSchemaMismatchCount,
    likelyHeaderOrAuthContextMissingCount: output.summary.likelyHeaderOrAuthContextMissingCount,
    runtimeBodyShapeRecoveryPlanReadyCount: output.summary.runtimeBodyShapeRecoveryPlanReadyCount,
    runtimeBodyShapeRecoveryPlanBlockedCount: output.summary.runtimeBodyShapeRecoveryPlanBlockedCount,
    mayPrepareRuntimeBodyShapeRecoveryPlanCount: output.summary.mayPrepareRuntimeBodyShapeRecoveryPlanCount,
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
    responseReviewTruthCount: output.summary.responseReviewTruthCount,
    refinedCandidateResponseTruthCount: output.summary.refinedCandidateResponseTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    userHintUsedCount: output.summary.userHintUsedCount,
    hardcodedSeasonStateOverrideUsedCount: output.summary.hardcodedSeasonStateOverrideUsedCount,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
