#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const DEFAULTS = {
  date: "2026-06-14",
  executionInput: "data/football-truth/_diagnostics/controlled-sportomedia-graphql-query-body-recovery-execution-run-2026-06-14/controlled-sportomedia-graphql-query-body-recovery-execution-run-2026-06-14.json",
  planInput: "data/football-truth/_diagnostics/no-write-sportomedia-graphql-query-body-recovery-plan-2026-06-14/no-write-sportomedia-graphql-query-body-recovery-plan-2026-06-14.json",
  output: "data/football-truth/_diagnostics/controlled-sportomedia-graphql-query-body-recovery-response-review-and-refinement-plan-2026-06-14/controlled-sportomedia-graphql-query-body-recovery-response-review-and-refinement-plan-2026-06-14.json"
};

const EXPECTED_SLUGS = ["swe.1", "swe.2"];

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--execution-input") args.executionInput = argv[++i];
    else if (arg === "--plan-input") args.planInput = argv[++i];
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

  assertSummary(s, "controlledSportomediaGraphqlQueryBodyRecoveryExecutionCompetitionCount", 2);
  assertSummary(s, "controlledQueryBodyRecoveryExecutedCount", 2);
  assertSummary(s, "configuredGraphqlPayloadFetchExecutedCount", 2);
  assertSummary(s, "requestBodyBuiltCount", 2);
  assertSummary(s, "requestBodyBuildBlockedCount", 0);
  assertSummary(s, "fetchedOkCount", 2);
  assertSummary(s, "httpOkCount", 0);
  assertSummary(s, "httpNotOkCount", 2);
  assertSummary(s, "fetchErrorCount", 0);
  assertSummary(s, "totalResponseRawTextLength", 222);
  assertSummary(s, "jsonContentTypeCount", 2);
  assertSummary(s, "responseJsonParsedCount", 2);
  assertSummary(s, "responseHasDataKeyCount", 0);
  assertSummary(s, "responseHasErrorsKeyCount", 2);
  assertSummary(s, "graphqlKeywordResponseCount", 2);
  assertSummary(s, "standingKeywordResponseCount", 0);
  assertSummary(s, "queryBodyRecoveryCandidateResponseCount", 0);
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
  assertSummary(s, "queryBodyCandidateResponseTruthCount", 0);
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

function validatePlan(input) {
  const s = input.summary || {};

  assertSummary(s, "sportomediaGraphqlQueryBodyRecoveryPlanCompetitionCount", 2);
  assertSummary(s, "queryBodyRecoveryPlanReadyCount", 2);
  assertSummary(s, "queryBodyRecoveryPlanNeedsRefinementCount", 0);
  assertSummary(s, "queryBodyRecoveryPlanBlockedCount", 0);
  assertSummary(s, "totalOperationCandidateCount", 16);
  assertSummary(s, "totalHighConfidenceOperationCandidateCount", 2);
  assertSummary(s, "totalGraphqlQueryTextCandidateCount", 0);
  assertSummary(s, "totalGraphqlBodyLikeCandidateCount", 8);
  assertSummary(s, "totalOperationNameCandidateCount", 0);
  assertSummary(s, "totalPersistedQueryCandidateCount", 8);
  assertSummary(s, "fetchExecutedNowCount", 0);
  assertSummary(s, "searchExecutedNowCount", 0);
  assertSummary(s, "broadSearchExecutedNowCount", 0);
  assertSummary(s, "classifierExecutedNowCount", 0);
  assertSummary(s, "canonicalWriteExecutedNowCount", 0);
  assertSummary(s, "productionWriteExecutedNowCount", 0);
  assertSummary(s, "queryBodyCandidatesTruthCount", 0);

  const rows = Array.isArray(input.planRows) ? input.planRows : [];
  if (rows.length !== 2) throw new Error("Expected 2 planRows.");

  const slugs = uniqueSorted(rows.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Unexpected plan slugs: " + slugs.join(", "));
  }

  return rows;
}

function candidateIdentity(candidate) {
  return [
    candidate?.candidateType || "",
    candidate?.operationName || "",
    candidate?.persistedKey || "",
    candidate?.persistedValue || "",
    candidate?.source || "",
    sha256(candidate?.query || ""),
    sha256(candidate?.rawSnippet || "")
  ].join("|");
}

function collectErrorSignals(row) {
  const parsed = safeJsonParse(row.rawTextPreview);
  const signals = [];

  if (parsed && typeof parsed === "object") {
    for (const key of Object.keys(parsed).slice(0, 20)) {
      signals.push({ kind: "json_top_level_key", value: key });
    }

    if (Array.isArray(parsed.errors)) {
      for (const err of parsed.errors.slice(0, 10)) {
        signals.push({
          kind: "graphql_error",
          message: String(err?.message || "").slice(0, 500),
          code: err?.extensions?.code || null,
          path: Array.isArray(err?.path) ? err.path.join(".") : null
        });
      }
    }
  } else if (row.rawTextPreview) {
    signals.push({ kind: "raw_text_preview", value: String(row.rawTextPreview).slice(0, 500) });
  }

  return signals;
}

function scoreRefinementCandidate(candidate, attemptedIdentity, executionRow) {
  const id = candidateIdentity(candidate);
  const joined = [
    candidate?.candidateType,
    candidate?.persistedKey,
    candidate?.persistedValue,
    candidate?.source,
    candidate?.rawSnippet,
    candidate?.query
  ].map((x) => String(x || "")).join(" ").toLowerCase();

  let score = Number(candidate?.candidateScore || 0);

  if (id === attemptedIdentity) score -= 1000;
  if (candidate?.candidateType === "graphqlBodyLikeObject") score += 80;
  if (candidate?.candidateType === "graphqlQueryText") score += 100;
  if (candidate?.candidateType === "persistedQueryOrDocumentId") score += 10;

  if (/sha|hash/.test(String(candidate?.persistedKey || "").toLowerCase())) score += 40;
  if (executionRow.requestBodyVariant === "persisted_query_id_candidate" && candidate?.candidateType === "persistedQueryOrDocumentId") score -= 30;

  if (joined.includes("standing") || joined.includes("standings") || joined.includes("tabell") || joined.includes("table")) score += 30;
  if (joined.includes("competition")) score += 10;
  if (joined.includes("season")) score += 10;
  if (joined.includes("team") || joined.includes("club") || joined.includes("lag")) score += 10;
  if (joined.includes("point") || joined.includes("poäng") || joined.includes("poang")) score += 10;

  return score;
}

function buildReviewRow(executionRow, planRow) {
  const attemptedIdentity = candidateIdentity(executionRow.primaryOperationCandidate || {});
  const allCandidates = Array.isArray(planRow.operationCandidateSamples) ? planRow.operationCandidateSamples : [];

  const candidates = allCandidates.map((candidate) => ({
    ...candidate,
    candidateIdentity: candidateIdentity(candidate),
    wasAlreadyAttemptedPrimary: candidateIdentity(candidate) === attemptedIdentity,
    refinementScore: scoreRefinementCandidate(candidate, attemptedIdentity, executionRow)
  })).sort((a, b) => b.refinementScore - a.refinementScore || b.candidateScore - a.candidateScore);

  const nextCandidates = candidates
    .filter((candidate) => !candidate.wasAlreadyAttemptedPrimary && candidate.refinementScore > -100)
    .slice(0, 6);

  const bodyLikeAvailable = candidates.some((candidate) => !candidate.wasAlreadyAttemptedPrimary && candidate.candidateType === "graphqlBodyLikeObject");
  const hashCandidateAvailable = candidates.some((candidate) => !candidate.wasAlreadyAttemptedPrimary && candidate.candidateType === "persistedQueryOrDocumentId" && /sha|hash/i.test(candidate.persistedKey || ""));

  const responseStatus =
    executionRow.executionStatus === "query_body_recovery_http_not_ok" &&
    executionRow.status === 400 &&
    executionRow.requestBodyVariant === "persisted_query_id_candidate"
      ? "http_400_persisted_query_id_candidate_rejected_needs_body_like_or_hash_candidate_refinement"
      : executionRow.responseHasErrorsKey
        ? "graphql_error_response_needs_query_body_refinement"
        : "query_body_recovery_response_needs_manual_refinement";

  const refinementStatus =
    nextCandidates.length > 0
      ? "ready_for_next_no_write_query_body_recovery_candidate_approval_gate"
      : "blocked_no_remaining_query_body_recovery_candidate";

  return {
    competitionSlug: executionRow.competitionSlug,
    reusableFamily: executionRow.reusableFamily,

    responseReviewStatus: responseStatus,
    refinementStatus,

    executionStatus: executionRow.executionStatus,
    fetchStatus: executionRow.fetchStatus,
    httpStatus: executionRow.status,
    contentType: executionRow.contentType,
    rawTextLength: executionRow.rawTextLength,
    rawTextSha256: executionRow.rawTextSha256,
    responseHasDataKey: executionRow.responseHasDataKey,
    responseHasErrorsKey: executionRow.responseHasErrorsKey,
    hasStandingKeyword: executionRow.hasStandingKeyword,
    queryBodyRecoveryResponseCandidate: executionRow.queryBodyRecoveryResponseCandidate,

    requestBodyBuildStatus: executionRow.requestBodyBuildStatus,
    requestBodyVariant: executionRow.requestBodyVariant,
    attemptedPrimaryCandidateType: executionRow.primaryCandidateType,
    attemptedPrimaryCandidateScore: executionRow.primaryCandidateScore,
    attemptedPrimaryCandidateSource: executionRow.primaryCandidateSource,
    attemptedPrimaryCandidateSha256: executionRow.primaryCandidateSha256,
    attemptedRequestBodySha256: executionRow.requestBodySha256,

    errorSignals: collectErrorSignals(executionRow),

    totalCandidateCount: candidates.length,
    remainingCandidateCount: candidates.filter((candidate) => !candidate.wasAlreadyAttemptedPrimary).length,
    remainingBodyLikeCandidateCount: candidates.filter((candidate) => !candidate.wasAlreadyAttemptedPrimary && candidate.candidateType === "graphqlBodyLikeObject").length,
    remainingPersistedQueryCandidateCount: candidates.filter((candidate) => !candidate.wasAlreadyAttemptedPrimary && candidate.candidateType === "persistedQueryOrDocumentId").length,
    remainingHashLikePersistedCandidateCount: candidates.filter((candidate) => !candidate.wasAlreadyAttemptedPrimary && candidate.candidateType === "persistedQueryOrDocumentId" && /sha|hash/i.test(candidate.persistedKey || "")).length,

    bodyLikeCandidateAvailable: bodyLikeAvailable,
    hashCandidateAvailable,
    nextRefinementCandidates: nextCandidates,
    recommendedPrimaryRefinementCandidate: nextCandidates[0] || null,

    mayPrepareNextCandidateApprovalGate: nextCandidates.length > 0,
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
    queryBodyCandidatesAreTruth: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    zeroResultDoesNotImplyAbsence: true,
    missingStandingKeywordDoesNotProveAbsence: true,
    noMatchTodayDoesNotImplyInactive: true,

    nextAllowedStep:
      nextCandidates.length > 0
        ? "prepare_next_sportomedia_graphql_query_body_recovery_candidate_approval_gate"
        : "inspect_sportomedia_client_runtime_for_missing_query_variables_or_headers",
    nextBlockedStep: "controlled_graphql_payload_refetch_classifier_canonical_write_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const execution = readJson(args.executionInput);
  const executionRows = validateExecution(execution);

  const plan = readJson(args.planInput);
  const planRows = validatePlan(plan);

  const reviewRows = executionRows.map((executionRow) => {
    const planRow = planRows.find((row) => row.competitionSlug === executionRow.competitionSlug);
    if (!planRow) throw new Error(executionRow.competitionSlug + ": missing query/body recovery plan row.");
    return buildReviewRow(executionRow, planRow);
  }).sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const readyRows = reviewRows.filter((row) => row.refinementStatus === "ready_for_next_no_write_query_body_recovery_candidate_approval_gate");
  const blockedRows = reviewRows.filter((row) => row.refinementStatus !== "ready_for_next_no_write_query_body_recovery_candidate_approval_gate");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "review-football-truth-controlled-sportomedia-graphql-query-body-recovery-execution-responses-file",
    mode: "review_controlled_sportomedia_graphql_query_body_recovery_execution_responses_and_refine_candidates_no_fetch_no_search_no_classifier_no_truth_assertion_no_write",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      controlledSportomediaGraphqlQueryBodyRecoveryExecutionRun: args.executionInput,
      sportomediaGraphqlQueryBodyRecoveryPlan: args.planInput
    },
    summary: {
      sportomediaGraphqlQueryBodyRecoveryResponseReviewCompetitionCount: reviewRows.length,
      http400ResponseCount: reviewRows.filter((row) => row.httpStatus === 400).length,
      persistedQueryIdCandidateRejectedCount:
        reviewRows.filter((row) => row.responseReviewStatus === "http_400_persisted_query_id_candidate_rejected_needs_body_like_or_hash_candidate_refinement").length,
      responseHasErrorsKeyCount: reviewRows.filter((row) => row.responseHasErrorsKey).length,
      responseHasDataKeyCount: reviewRows.filter((row) => row.responseHasDataKey).length,
      standingKeywordResponseCount: reviewRows.filter((row) => row.hasStandingKeyword).length,
      queryBodyRecoveryResponseCandidateCount: reviewRows.filter((row) => row.queryBodyRecoveryResponseCandidate).length,

      refinementReadyCount: readyRows.length,
      refinementBlockedCount: blockedRows.length,
      nextCandidateApprovalGateReadyCount: reviewRows.filter((row) => row.mayPrepareNextCandidateApprovalGate).length,

      totalCandidateCount: reviewRows.reduce((sum, row) => sum + Number(row.totalCandidateCount || 0), 0),
      totalRemainingCandidateCount: reviewRows.reduce((sum, row) => sum + Number(row.remainingCandidateCount || 0), 0),
      totalRemainingBodyLikeCandidateCount: reviewRows.reduce((sum, row) => sum + Number(row.remainingBodyLikeCandidateCount || 0), 0),
      totalRemainingPersistedQueryCandidateCount: reviewRows.reduce((sum, row) => sum + Number(row.remainingPersistedQueryCandidateCount || 0), 0),
      totalRemainingHashLikePersistedCandidateCount: reviewRows.reduce((sum, row) => sum + Number(row.remainingHashLikePersistedCandidateCount || 0), 0),
      recommendedPrimaryRefinementCandidateCount: reviewRows.filter((row) => row.recommendedPrimaryRefinementCandidate).length,

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
      queryBodyCandidatesTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        readyRows.length === reviewRows.length
          ? "prepare_next_sportomedia_graphql_query_body_recovery_candidate_approval_gate"
          : "inspect_sportomedia_client_runtime_for_missing_query_variables_or_headers"
    },
    counts: {
      byResponseReviewStatus: countBy(reviewRows, "responseReviewStatus"),
      byRefinementStatus: countBy(reviewRows, "refinementStatus"),
      byRequestBodyVariant: countBy(reviewRows, "requestBodyVariant"),
      byNextAllowedStep: countBy(reviewRows, "nextAllowedStep")
    },
    guardrails: [
      "This review reads the controlled query/body recovery execution diagnostics and earlier candidate plan only.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a season-state classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "HTTP 400 GraphQL responses are diagnostic feedback only.",
      "Refined query/body candidates are not truth assertions.",
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
    sportomediaGraphqlQueryBodyRecoveryResponseReviewCompetitionCount: output.summary.sportomediaGraphqlQueryBodyRecoveryResponseReviewCompetitionCount,
    http400ResponseCount: output.summary.http400ResponseCount,
    persistedQueryIdCandidateRejectedCount: output.summary.persistedQueryIdCandidateRejectedCount,
    responseHasErrorsKeyCount: output.summary.responseHasErrorsKeyCount,
    responseHasDataKeyCount: output.summary.responseHasDataKeyCount,
    standingKeywordResponseCount: output.summary.standingKeywordResponseCount,
    queryBodyRecoveryResponseCandidateCount: output.summary.queryBodyRecoveryResponseCandidateCount,
    refinementReadyCount: output.summary.refinementReadyCount,
    refinementBlockedCount: output.summary.refinementBlockedCount,
    nextCandidateApprovalGateReadyCount: output.summary.nextCandidateApprovalGateReadyCount,
    totalCandidateCount: output.summary.totalCandidateCount,
    totalRemainingCandidateCount: output.summary.totalRemainingCandidateCount,
    totalRemainingBodyLikeCandidateCount: output.summary.totalRemainingBodyLikeCandidateCount,
    totalRemainingPersistedQueryCandidateCount: output.summary.totalRemainingPersistedQueryCandidateCount,
    totalRemainingHashLikePersistedCandidateCount: output.summary.totalRemainingHashLikePersistedCandidateCount,
    recommendedPrimaryRefinementCandidateCount: output.summary.recommendedPrimaryRefinementCandidateCount,
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
