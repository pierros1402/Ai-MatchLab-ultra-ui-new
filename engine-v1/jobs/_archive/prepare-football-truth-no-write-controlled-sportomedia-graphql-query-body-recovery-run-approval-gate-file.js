#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULTS = {
  date: "2026-06-14",
  gateInput: "data/football-truth/_diagnostics/no-write-sportomedia-graphql-query-body-recovery-runner-manifest-quality-gate-2026-06-14/no-write-sportomedia-graphql-query-body-recovery-runner-manifest-quality-gate-2026-06-14.json",
  output: "data/football-truth/_diagnostics/no-write-controlled-sportomedia-graphql-query-body-recovery-run-approval-gate-2026-06-14/no-write-controlled-sportomedia-graphql-query-body-recovery-run-approval-gate-2026-06-14.json"
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

  assertSummary(s, "sportomediaGraphqlQueryBodyRecoveryRunnerManifestQualityGateCompetitionCount", 2);
  assertSummary(s, "queryBodyRecoveryRunnerManifestQualityGatePassedCount", 2);
  assertSummary(s, "queryBodyRecoveryRunnerManifestQualityGateBlockedCount", 0);
  assertSummary(s, "qualityGatedEndpointReachableButInsufficientPayloadCount", 2);
  assertSummary(s, "qualityGatedQueryBodyRecoveryNeededCount", 2);
  assertSummary(s, "totalQualityGatedOperationCandidateCount", 16);
  assertSummary(s, "totalQualityGatedHighConfidenceOperationCandidateCount", 2);
  assertSummary(s, "totalQualityGatedGraphqlQueryTextCandidateCount", 0);
  assertSummary(s, "totalQualityGatedGraphqlBodyLikeCandidateCount", 8);
  assertSummary(s, "totalQualityGatedOperationNameCandidateCount", 0);
  assertSummary(s, "totalQualityGatedPersistedQueryCandidateCount", 8);
  assertSummary(s, "manifestCompleteCount", 2);
  assertSummary(s, "runnerManifestBuiltCount", 2);
  assertSummary(s, "mayPrepareQueryBodyRecoveryRunApprovalGateCount", 2);
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
  assertSummary(s, "runnerManifestTruthCount", 0);
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
    if (row.qualityGateStatus !== "passed_no_write_sportomedia_graphql_query_body_recovery_runner_manifest_quality_gate") {
      throw new Error(row.competitionSlug + ": quality gate did not pass.");
    }
    if (row.mayPrepareQueryBodyRecoveryRunApprovalGate !== true) {
      throw new Error(row.competitionSlug + ": mayPrepareQueryBodyRecoveryRunApprovalGate must be true.");
    }
    if (!row.primaryOperationCandidate) throw new Error(row.competitionSlug + ": missing primary operation candidate.");
    if (row.qualityGateIsExecutionPermissionNow !== false || row.qualityGateIsFetchPermissionNow !== false) {
      throw new Error(row.competitionSlug + ": quality gate must not be execution/fetch permission now.");
    }
  }

  return rows;
}

function buildApprovalRow(row) {
  const blockingReasons = [];

  if (row.qualityGateStatus !== "passed_no_write_sportomedia_graphql_query_body_recovery_runner_manifest_quality_gate") {
    blockingReasons.push("query_body_recovery_manifest_quality_gate_not_passed");
  }
  if (row.mayPrepareQueryBodyRecoveryRunApprovalGate !== true) {
    blockingReasons.push("quality_gate_does_not_allow_run_approval_gate");
  }
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

  const runApprovalGateStatus =
    blockingReasons.length === 0
      ? "approved_to_build_controlled_sportomedia_graphql_query_body_recovery_execution_runner"
      : "blocked_controlled_sportomedia_graphql_query_body_recovery_run_approval_gate";

  return {
    competitionSlug: row.competitionSlug,
    reusableFamily: row.reusableFamily,
    runApprovalGateStatus,
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

    approvedRunScope: "sportomedia_official_standings_graphql_query_body_recovery_only",
    approvedNextArtifact: "controlled_sportomedia_graphql_query_body_recovery_execution_runner",
    approvedExecutionMode: "diagnostics_only_query_body_recovery_execution_after_future_final_approval",
    runApprovalIsExecutionPermissionNow: false,
    runApprovalIsFetchPermissionNow: false,

    mayBuildControlledQueryBodyRecoveryExecutionRunner:
      runApprovalGateStatus === "approved_to_build_controlled_sportomedia_graphql_query_body_recovery_execution_runner",

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
    runApprovalIsTruth: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    zeroResultDoesNotImplyAbsence: true,
    missingStandingKeywordDoesNotProveAbsence: true,
    noMatchTodayDoesNotImplyInactive: true,

    nextAllowedStep:
      runApprovalGateStatus === "approved_to_build_controlled_sportomedia_graphql_query_body_recovery_execution_runner"
        ? "build_controlled_sportomedia_graphql_query_body_recovery_execution_runner"
        : "repair_controlled_sportomedia_graphql_query_body_recovery_run_approval_gate",
    nextBlockedStep: "controlled_graphql_payload_refetch_classifier_canonical_write_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const gate = readJson(args.gateInput);
  const gateRows = validateGate(gate);

  const runApprovalRows = gateRows
    .map(buildApprovalRow)
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const approvedRows = runApprovalRows.filter((row) => row.runApprovalGateStatus === "approved_to_build_controlled_sportomedia_graphql_query_body_recovery_execution_runner");
  const blockedRows = runApprovalRows.filter((row) => row.runApprovalGateStatus !== "approved_to_build_controlled_sportomedia_graphql_query_body_recovery_execution_runner");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "prepare-football-truth-no-write-controlled-sportomedia-graphql-query-body-recovery-run-approval-gate-file",
    mode: "prepare_no_write_controlled_sportomedia_graphql_query_body_recovery_run_approval_gate_no_fetch_no_search_no_classifier_no_truth_assertion_no_write",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      sportomediaGraphqlQueryBodyRecoveryRunnerManifestQualityGate: args.gateInput
    },
    summary: {
      controlledSportomediaGraphqlQueryBodyRecoveryRunApprovalGateCompetitionCount: runApprovalRows.length,
      controlledSportomediaGraphqlQueryBodyRecoveryRunApprovalGateApprovedCount: approvedRows.length,
      controlledSportomediaGraphqlQueryBodyRecoveryRunApprovalGateBlockedCount: blockedRows.length,

      approvedEndpointReachableButInsufficientPayloadCount: runApprovalRows.filter((row) => row.endpointReachableButInsufficientPayload).length,
      approvedQueryBodyRecoveryNeededCount: runApprovalRows.filter((row) => row.queryBodyRecoveryNeeded).length,

      approvedRunnerTargetCount: runApprovalRows.filter((row) => row.runnerTargetId).length,
      approvedPrimaryOperationCandidateCount: runApprovalRows.filter((row) => row.primaryOperationCandidate).length,
      approvedOperationCandidateCount: runApprovalRows.reduce((sum, row) => sum + Number(row.operationCandidateCount || 0), 0),
      approvedHighConfidenceOperationCandidateCount: runApprovalRows.reduce((sum, row) => sum + Number(row.highConfidenceOperationCandidateCount || 0), 0),
      approvedGraphqlQueryTextCandidateCount: runApprovalRows.reduce((sum, row) => sum + Number(row.graphqlQueryTextCandidateCount || 0), 0),
      approvedGraphqlBodyLikeCandidateCount: runApprovalRows.reduce((sum, row) => sum + Number(row.graphqlBodyLikeCandidateCount || 0), 0),
      approvedOperationNameCandidateCount: runApprovalRows.reduce((sum, row) => sum + Number(row.operationNameCandidateCount || 0), 0),
      approvedPersistedQueryCandidateCount: runApprovalRows.reduce((sum, row) => sum + Number(row.persistedQueryCandidateCount || 0), 0),

      mayBuildControlledQueryBodyRecoveryExecutionRunnerCount:
        runApprovalRows.filter((row) => row.mayBuildControlledQueryBodyRecoveryExecutionRunner).length,

      runApprovalIsExecutionPermissionNowCount: runApprovalRows.filter((row) => row.runApprovalIsExecutionPermissionNow).length,
      runApprovalIsFetchPermissionNowCount: runApprovalRows.filter((row) => row.runApprovalIsFetchPermissionNow).length,

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
      runApprovalTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        blockedRows.length === 0
          ? "build_controlled_sportomedia_graphql_query_body_recovery_execution_runner"
          : "repair_controlled_sportomedia_graphql_query_body_recovery_run_approval_gate"
    },
    counts: {
      byRunApprovalGateStatus: countBy(runApprovalRows, "runApprovalGateStatus"),
      byNextAllowedStep: countBy(runApprovalRows, "nextAllowedStep")
    },
    guardrails: [
      "This run approval gate reads the query/body recovery runner manifest quality gate only.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a season-state classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Approval only allows building a controlled query/body recovery execution runner next.",
      "Approval does not allow endpoint execution or fetch now.",
      "Query/body candidates are not truth assertions.",
      "Run approval rows are not truth assertions.",
      "Endpoint reachability is not standings truth.",
      "Missing standing keyword does not prove absence.",
      "No match today must not imply inactive.",
      "Zero result must not imply absence."
    ],
    runApprovalRows,
    blockedRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    controlledSportomediaGraphqlQueryBodyRecoveryRunApprovalGateCompetitionCount: output.summary.controlledSportomediaGraphqlQueryBodyRecoveryRunApprovalGateCompetitionCount,
    controlledSportomediaGraphqlQueryBodyRecoveryRunApprovalGateApprovedCount: output.summary.controlledSportomediaGraphqlQueryBodyRecoveryRunApprovalGateApprovedCount,
    controlledSportomediaGraphqlQueryBodyRecoveryRunApprovalGateBlockedCount: output.summary.controlledSportomediaGraphqlQueryBodyRecoveryRunApprovalGateBlockedCount,
    approvedEndpointReachableButInsufficientPayloadCount: output.summary.approvedEndpointReachableButInsufficientPayloadCount,
    approvedQueryBodyRecoveryNeededCount: output.summary.approvedQueryBodyRecoveryNeededCount,
    approvedRunnerTargetCount: output.summary.approvedRunnerTargetCount,
    approvedPrimaryOperationCandidateCount: output.summary.approvedPrimaryOperationCandidateCount,
    approvedOperationCandidateCount: output.summary.approvedOperationCandidateCount,
    approvedHighConfidenceOperationCandidateCount: output.summary.approvedHighConfidenceOperationCandidateCount,
    approvedGraphqlQueryTextCandidateCount: output.summary.approvedGraphqlQueryTextCandidateCount,
    approvedGraphqlBodyLikeCandidateCount: output.summary.approvedGraphqlBodyLikeCandidateCount,
    approvedOperationNameCandidateCount: output.summary.approvedOperationNameCandidateCount,
    approvedPersistedQueryCandidateCount: output.summary.approvedPersistedQueryCandidateCount,
    mayBuildControlledQueryBodyRecoveryExecutionRunnerCount: output.summary.mayBuildControlledQueryBodyRecoveryExecutionRunnerCount,
    runApprovalIsExecutionPermissionNowCount: output.summary.runApprovalIsExecutionPermissionNowCount,
    runApprovalIsFetchPermissionNowCount: output.summary.runApprovalIsFetchPermissionNowCount,
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
    runApprovalTruthCount: output.summary.runApprovalTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    userHintUsedCount: output.summary.userHintUsedCount,
    hardcodedSeasonStateOverrideUsedCount: output.summary.hardcodedSeasonStateOverrideUsedCount,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
