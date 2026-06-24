#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULTS = {
  date: "2026-06-14",
  planInput: "data/football-truth/_diagnostics/no-write-sportomedia-graphql-query-body-recovery-plan-2026-06-14/no-write-sportomedia-graphql-query-body-recovery-plan-2026-06-14.json",
  output: "data/football-truth/_diagnostics/no-write-sportomedia-graphql-query-body-recovery-approval-gate-2026-06-14/no-write-sportomedia-graphql-query-body-recovery-approval-gate-2026-06-14.json"
};

const EXPECTED_SLUGS = ["swe.1", "swe.2"];

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
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

function validatePlan(input) {
  const s = input.summary || {};

  assertSummary(s, "sportomediaGraphqlQueryBodyRecoveryPlanCompetitionCount", 2);
  assertSummary(s, "queryBodyRecoveryPlanReadyCount", 2);
  assertSummary(s, "queryBodyRecoveryPlanNeedsRefinementCount", 0);
  assertSummary(s, "queryBodyRecoveryPlanBlockedCount", 0);
  assertSummary(s, "endpointReachableButInsufficientPayloadCount", 2);
  assertSummary(s, "queryBodyRecoveryNeededCount", 2);
  assertSummary(s, "totalSourceTextCandidateCount", 160);
  assertSummary(s, "totalOperationCandidateCount", 16);
  assertSummary(s, "totalHighConfidenceOperationCandidateCount", 2);
  assertSummary(s, "totalGraphqlQueryTextCandidateCount", 0);
  assertSummary(s, "totalGraphqlBodyLikeCandidateCount", 8);
  assertSummary(s, "totalOperationNameCandidateCount", 0);
  assertSummary(s, "totalPersistedQueryCandidateCount", 8);
  assertSummary(s, "mayPrepareQueryBodyRecoveryApprovalGateCount", 2);

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
  assertSummary(s, "canonicalWrites", 0);
  assertSummary(s, "productionWrite", false);
  assertSummary(s, "userHintUsedCount", 0);
  assertSummary(s, "hardcodedSeasonStateOverrideUsedCount", 0);

  const rows = Array.isArray(input.planRows) ? input.planRows : [];
  if (rows.length !== 2) throw new Error("Expected 2 planRows.");

  const slugs = uniqueSorted(rows.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Unexpected query body recovery plan slugs: " + slugs.join(", "));
  }

  for (const row of rows) {
    if (row.queryBodyRecoveryPlanStatus !== "ready_for_no_write_sportomedia_graphql_query_body_recovery_approval_gate") {
      throw new Error(row.competitionSlug + ": plan row is not approval-gate ready.");
    }
    if (row.mayPrepareQueryBodyRecoveryApprovalGate !== true) {
      throw new Error(row.competitionSlug + ": mayPrepareQueryBodyRecoveryApprovalGate must be true.");
    }
    if (!row.recommendedPrimaryOperationCandidate) {
      throw new Error(row.competitionSlug + ": missing recommended primary operation candidate.");
    }
    if (Number(row.highConfidenceOperationCandidateCount || 0) < 1) {
      throw new Error(row.competitionSlug + ": expected at least one high-confidence operation candidate.");
    }
    if (row.queryBodyCandidatesAreTruth !== false) {
      throw new Error(row.competitionSlug + ": query/body candidates must not be truth.");
    }
    if (row.mayExecuteNow !== false || row.mayFetchNow !== false || row.maySearchNow !== false || row.mayBroadSearchNow !== false) {
      throw new Error(row.competitionSlug + ": execution/fetch/search must remain false.");
    }
    if (row.mayClassifySeasonStateNow !== false || row.mayWriteCanonicalNow !== false || row.mayAssertTruthNow !== false) {
      throw new Error(row.competitionSlug + ": classify/write/truth must remain false.");
    }
  }

  return rows;
}

function buildApprovalRow(row) {
  const blockingReasons = [];

  if (row.queryBodyRecoveryPlanStatus !== "ready_for_no_write_sportomedia_graphql_query_body_recovery_approval_gate") {
    blockingReasons.push("query_body_recovery_plan_not_ready");
  }
  if (row.mayPrepareQueryBodyRecoveryApprovalGate !== true) {
    blockingReasons.push("plan_does_not_allow_query_body_recovery_approval_gate");
  }
  if (!row.recommendedPrimaryOperationCandidate) {
    blockingReasons.push("missing_recommended_primary_operation_candidate");
  }
  if (Number(row.highConfidenceOperationCandidateCount || 0) < 1) {
    blockingReasons.push("missing_high_confidence_operation_candidate");
  }
  if (row.queryBodyCandidatesAreTruth !== false) {
    blockingReasons.push("query_body_candidate_marked_truth");
  }

  if (row.mayExecuteNow !== false) blockingReasons.push("plan_would_execute_now");
  if (row.mayFetchNow !== false) blockingReasons.push("plan_would_fetch_now");
  if (row.maySearchNow !== false) blockingReasons.push("plan_would_search_now");
  if (row.mayBroadSearchNow !== false) blockingReasons.push("plan_would_broad_search_now");
  if (row.mayClassifySeasonStateNow !== false) blockingReasons.push("plan_would_classify_now");
  if (row.mayWriteCanonicalNow !== false) blockingReasons.push("plan_would_write_canonical_now");
  if (row.mayAssertTruthNow !== false) blockingReasons.push("plan_would_assert_truth_now");

  const approvalGateStatus =
    blockingReasons.length === 0
      ? "approved_to_build_no_write_sportomedia_graphql_query_body_recovery_runner_manifest"
      : "blocked_no_write_sportomedia_graphql_query_body_recovery_approval_gate";

  const primary = row.recommendedPrimaryOperationCandidate || null;

  return {
    competitionSlug: row.competitionSlug,
    reusableFamily: row.reusableFamily,
    approvalGateStatus,
    blockingReasons,

    endpointReachableButInsufficientPayload: row.endpointReachableButInsufficientPayload,
    queryBodyRecoveryNeeded: row.queryBodyRecoveryNeeded,

    sourceTextCandidateCount: row.sourceTextCandidateCount,
    operationCandidateCount: row.operationCandidateCount,
    highConfidenceOperationCandidateCount: row.highConfidenceOperationCandidateCount,
    graphqlQueryTextCandidateCount: row.graphqlQueryTextCandidateCount,
    graphqlBodyLikeCandidateCount: row.graphqlBodyLikeCandidateCount,
    operationNameCandidateCount: row.operationNameCandidateCount,
    persistedQueryCandidateCount: row.persistedQueryCandidateCount,

    approvedPrimaryOperationCandidate: primary,
    approvedOperationCandidateSamples: Array.isArray(row.operationCandidateSamples) ? row.operationCandidateSamples.slice(0, 12) : [],

    approvedScope: "sportomedia_official_standings_graphql_query_body_recovery_only",
    approvedPurpose: "build_controlled_query_body_recovery_runner_manifest_for_sportomedia_standings_payload_acquisition",
    approvedNextArtifact: "no_write_sportomedia_graphql_query_body_recovery_runner_manifest",
    approvalIsExecutionPermissionNow: false,
    approvalIsFetchPermissionNow: false,

    mayBuildQueryBodyRecoveryRunnerManifest: approvalGateStatus === "approved_to_build_no_write_sportomedia_graphql_query_body_recovery_runner_manifest",
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
    queryBodyCandidatesAreTruth: false,
    approvalRowIsTruth: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    zeroResultDoesNotImplyAbsence: true,
    missingStandingKeywordDoesNotProveAbsence: true,
    noMatchTodayDoesNotImplyInactive: true,

    nextAllowedStep:
      approvalGateStatus === "approved_to_build_no_write_sportomedia_graphql_query_body_recovery_runner_manifest"
        ? "build_no_write_sportomedia_graphql_query_body_recovery_runner_manifest"
        : "repair_sportomedia_graphql_query_body_recovery_plan_before_runner_manifest",
    nextBlockedStep: "controlled_graphql_payload_refetch_classifier_canonical_write_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const plan = readJson(args.planInput);
  const planRows = validatePlan(plan);

  const approvalRows = planRows
    .map(buildApprovalRow)
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const approvedRows = approvalRows.filter((row) => row.approvalGateStatus === "approved_to_build_no_write_sportomedia_graphql_query_body_recovery_runner_manifest");
  const blockedRows = approvalRows.filter((row) => row.approvalGateStatus !== "approved_to_build_no_write_sportomedia_graphql_query_body_recovery_runner_manifest");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "prepare-football-truth-no-write-sportomedia-graphql-query-body-recovery-approval-gate-file",
    mode: "prepare_no_write_sportomedia_graphql_query_body_recovery_approval_gate_no_fetch_no_search_no_classifier_no_truth_assertion_no_write",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      sportomediaGraphqlQueryBodyRecoveryPlan: args.planInput
    },
    summary: {
      sportomediaGraphqlQueryBodyRecoveryApprovalGateCompetitionCount: approvalRows.length,
      queryBodyRecoveryApprovalGateApprovedCount: approvedRows.length,
      queryBodyRecoveryApprovalGateBlockedCount: blockedRows.length,

      approvedEndpointReachableButInsufficientPayloadCount: approvalRows.filter((row) => row.endpointReachableButInsufficientPayload).length,
      approvedQueryBodyRecoveryNeededCount: approvalRows.filter((row) => row.queryBodyRecoveryNeeded).length,

      totalApprovedSourceTextCandidateCount: approvalRows.reduce((sum, row) => sum + Number(row.sourceTextCandidateCount || 0), 0),
      totalApprovedOperationCandidateCount: approvalRows.reduce((sum, row) => sum + Number(row.operationCandidateCount || 0), 0),
      totalApprovedHighConfidenceOperationCandidateCount: approvalRows.reduce((sum, row) => sum + Number(row.highConfidenceOperationCandidateCount || 0), 0),
      totalApprovedGraphqlQueryTextCandidateCount: approvalRows.reduce((sum, row) => sum + Number(row.graphqlQueryTextCandidateCount || 0), 0),
      totalApprovedGraphqlBodyLikeCandidateCount: approvalRows.reduce((sum, row) => sum + Number(row.graphqlBodyLikeCandidateCount || 0), 0),
      totalApprovedOperationNameCandidateCount: approvalRows.reduce((sum, row) => sum + Number(row.operationNameCandidateCount || 0), 0),
      totalApprovedPersistedQueryCandidateCount: approvalRows.reduce((sum, row) => sum + Number(row.persistedQueryCandidateCount || 0), 0),

      mayBuildQueryBodyRecoveryRunnerManifestCount: approvalRows.filter((row) => row.mayBuildQueryBodyRecoveryRunnerManifest).length,
      approvalIsExecutionPermissionNowCount: approvalRows.filter((row) => row.approvalIsExecutionPermissionNow).length,
      approvalIsFetchPermissionNowCount: approvalRows.filter((row) => row.approvalIsFetchPermissionNow).length,

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
      queryBodyCandidatesTruthCount: 0,
      approvalRowTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        blockedRows.length === 0
          ? "build_no_write_sportomedia_graphql_query_body_recovery_runner_manifest"
          : "repair_sportomedia_graphql_query_body_recovery_plan_before_runner_manifest"
    },
    counts: {
      byApprovalGateStatus: countBy(approvalRows, "approvalGateStatus"),
      byNextAllowedStep: countBy(approvalRows, "nextAllowedStep")
    },
    guardrails: [
      "This approval gate reads the no-write Sportomedia GraphQL query/body recovery plan only.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a season-state classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Approval only allows building a query/body recovery runner manifest.",
      "Approval does not allow endpoint execution or fetch now.",
      "Query/body candidates are not truth assertions.",
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
    sportomediaGraphqlQueryBodyRecoveryApprovalGateCompetitionCount: output.summary.sportomediaGraphqlQueryBodyRecoveryApprovalGateCompetitionCount,
    queryBodyRecoveryApprovalGateApprovedCount: output.summary.queryBodyRecoveryApprovalGateApprovedCount,
    queryBodyRecoveryApprovalGateBlockedCount: output.summary.queryBodyRecoveryApprovalGateBlockedCount,
    approvedEndpointReachableButInsufficientPayloadCount: output.summary.approvedEndpointReachableButInsufficientPayloadCount,
    approvedQueryBodyRecoveryNeededCount: output.summary.approvedQueryBodyRecoveryNeededCount,
    totalApprovedSourceTextCandidateCount: output.summary.totalApprovedSourceTextCandidateCount,
    totalApprovedOperationCandidateCount: output.summary.totalApprovedOperationCandidateCount,
    totalApprovedHighConfidenceOperationCandidateCount: output.summary.totalApprovedHighConfidenceOperationCandidateCount,
    totalApprovedGraphqlQueryTextCandidateCount: output.summary.totalApprovedGraphqlQueryTextCandidateCount,
    totalApprovedGraphqlBodyLikeCandidateCount: output.summary.totalApprovedGraphqlBodyLikeCandidateCount,
    totalApprovedOperationNameCandidateCount: output.summary.totalApprovedOperationNameCandidateCount,
    totalApprovedPersistedQueryCandidateCount: output.summary.totalApprovedPersistedQueryCandidateCount,
    mayBuildQueryBodyRecoveryRunnerManifestCount: output.summary.mayBuildQueryBodyRecoveryRunnerManifestCount,
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
    queryBodyCandidatesTruthCount: output.summary.queryBodyCandidatesTruthCount,
    approvalRowTruthCount: output.summary.approvalRowTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    userHintUsedCount: output.summary.userHintUsedCount,
    hardcodedSeasonStateOverrideUsedCount: output.summary.hardcodedSeasonStateOverrideUsedCount,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
