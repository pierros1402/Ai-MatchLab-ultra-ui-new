#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULTS = {
  date: "2026-06-14",
  approvalInput: "data/football-truth/_diagnostics/no-write-sportomedia-graphql-query-body-recovery-approval-gate-2026-06-14/no-write-sportomedia-graphql-query-body-recovery-approval-gate-2026-06-14.json",
  output: "data/football-truth/_diagnostics/no-write-sportomedia-graphql-query-body-recovery-runner-manifest-2026-06-14/no-write-sportomedia-graphql-query-body-recovery-runner-manifest-2026-06-14.json"
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

  assertSummary(s, "sportomediaGraphqlQueryBodyRecoveryApprovalGateCompetitionCount", 2);
  assertSummary(s, "queryBodyRecoveryApprovalGateApprovedCount", 2);
  assertSummary(s, "queryBodyRecoveryApprovalGateBlockedCount", 0);
  assertSummary(s, "approvedEndpointReachableButInsufficientPayloadCount", 2);
  assertSummary(s, "approvedQueryBodyRecoveryNeededCount", 2);
  assertSummary(s, "totalApprovedSourceTextCandidateCount", 160);
  assertSummary(s, "totalApprovedOperationCandidateCount", 16);
  assertSummary(s, "totalApprovedHighConfidenceOperationCandidateCount", 2);
  assertSummary(s, "totalApprovedGraphqlQueryTextCandidateCount", 0);
  assertSummary(s, "totalApprovedGraphqlBodyLikeCandidateCount", 8);
  assertSummary(s, "totalApprovedOperationNameCandidateCount", 0);
  assertSummary(s, "totalApprovedPersistedQueryCandidateCount", 8);
  assertSummary(s, "mayBuildQueryBodyRecoveryRunnerManifestCount", 2);
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
  assertSummary(s, "queryBodyCandidatesTruthCount", 0);
  assertSummary(s, "approvalRowTruthCount", 0);
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
    if (row.approvalGateStatus !== "approved_to_build_no_write_sportomedia_graphql_query_body_recovery_runner_manifest") {
      throw new Error(row.competitionSlug + ": approval row is not runner-manifest approved.");
    }
    if (row.mayBuildQueryBodyRecoveryRunnerManifest !== true) {
      throw new Error(row.competitionSlug + ": mayBuildQueryBodyRecoveryRunnerManifest must be true.");
    }
    if (!row.approvedPrimaryOperationCandidate) {
      throw new Error(row.competitionSlug + ": missing approved primary operation candidate.");
    }
    if (row.approvalIsExecutionPermissionNow !== false || row.approvalIsFetchPermissionNow !== false) {
      throw new Error(row.competitionSlug + ": approval must not be execution/fetch permission now.");
    }
    if (row.queryBodyCandidatesAreTruth !== false || row.approvalRowIsTruth !== false) {
      throw new Error(row.competitionSlug + ": approval/query-body candidates must not be truth.");
    }
  }

  return rows;
}

function buildRunnerManifestRow(row) {
  const blockingReasons = [];

  if (row.approvalGateStatus !== "approved_to_build_no_write_sportomedia_graphql_query_body_recovery_runner_manifest") {
    blockingReasons.push("query_body_recovery_approval_not_approved");
  }
  if (row.mayBuildQueryBodyRecoveryRunnerManifest !== true) {
    blockingReasons.push("approval_does_not_allow_runner_manifest_build");
  }
  if (!row.approvedPrimaryOperationCandidate) {
    blockingReasons.push("missing_approved_primary_operation_candidate");
  }
  if (Number(row.highConfidenceOperationCandidateCount || 0) < 1) {
    blockingReasons.push("missing_high_confidence_operation_candidate");
  }
  if (row.approvalIsExecutionPermissionNow !== false) {
    blockingReasons.push("approval_is_execution_permission_now");
  }
  if (row.approvalIsFetchPermissionNow !== false) {
    blockingReasons.push("approval_is_fetch_permission_now");
  }
  if (row.queryBodyCandidatesAreTruth !== false || row.approvalRowIsTruth !== false) {
    blockingReasons.push("query_body_or_approval_marked_truth");
  }

  if (row.mayExecuteNow !== false) blockingReasons.push("approval_would_execute_now");
  if (row.mayFetchNow !== false) blockingReasons.push("approval_would_fetch_now");
  if (row.maySearchNow !== false) blockingReasons.push("approval_would_search_now");
  if (row.mayBroadSearchNow !== false) blockingReasons.push("approval_would_broad_search_now");
  if (row.mayClassifySeasonStateNow !== false) blockingReasons.push("approval_would_classify_now");
  if (row.mayWriteCanonicalNow !== false) blockingReasons.push("approval_would_write_canonical_now");
  if (row.mayAssertTruthNow !== false) blockingReasons.push("approval_would_assert_truth_now");

  const manifestStatus =
    blockingReasons.length === 0
      ? "ready_for_no_write_sportomedia_graphql_query_body_recovery_runner_manifest_quality_gate"
      : "blocked_no_write_sportomedia_graphql_query_body_recovery_runner_manifest";

  return {
    competitionSlug: row.competitionSlug,
    reusableFamily: row.reusableFamily,
    queryBodyRecoveryRunnerManifestStatus: manifestStatus,
    blockingReasons,

    endpointReachableButInsufficientPayload: row.endpointReachableButInsufficientPayload,
    queryBodyRecoveryNeeded: row.queryBodyRecoveryNeeded,

    runnerTargetId: row.competitionSlug + "::sportomedia_graphql_query_body_recovery",
    runnerTargetScope: "sportomedia_official_standings_graphql_query_body_recovery_only",
    runnerTargetPurpose: "recover_graphql_operation_body_for_sportomedia_standings_payload_acquisition",
    approvedPurpose: row.approvedPurpose,
    approvedNextArtifact: row.approvedNextArtifact,

    primaryOperationCandidate: row.approvedPrimaryOperationCandidate,
    operationCandidateSamples: Array.isArray(row.approvedOperationCandidateSamples) ? row.approvedOperationCandidateSamples : [],

    sourceTextCandidateCount: row.sourceTextCandidateCount,
    operationCandidateCount: row.operationCandidateCount,
    highConfidenceOperationCandidateCount: row.highConfidenceOperationCandidateCount,
    graphqlQueryTextCandidateCount: row.graphqlQueryTextCandidateCount,
    graphqlBodyLikeCandidateCount: row.graphqlBodyLikeCandidateCount,
    operationNameCandidateCount: row.operationNameCandidateCount,
    persistedQueryCandidateCount: row.persistedQueryCandidateCount,

    recoveryRunnerDefinition: {
      runnerMode: "no_write_sportomedia_graphql_query_body_recovery_manifest",
      targetSlug: row.competitionSlug,
      targetFamily: row.reusableFamily,
      targetKind: "sportomedia_official_standings_graphql_query_body_recovery",
      primaryCandidateType: row.approvedPrimaryOperationCandidate?.candidateType || null,
      primaryCandidateScore: row.approvedPrimaryOperationCandidate?.candidateScore ?? null,
      primaryCandidateSource: row.approvedPrimaryOperationCandidate?.source || null,
      primaryCandidateSnippet: row.approvedPrimaryOperationCandidate?.rawSnippet || null,
      queryTextAvailable: Boolean(row.approvedPrimaryOperationCandidate?.query),
      persistedQueryAvailable: Boolean(row.approvedPrimaryOperationCandidate?.persistedValue),
      bodyLikeCandidateAvailable: row.approvedPrimaryOperationCandidate?.candidateType === "graphqlBodyLikeObject",
      allowedSideEffects: ["write_diagnostics_only"],
      forbiddenSideEffects: [
        "fetch",
        "search",
        "broad_search",
        "season_state_classifier",
        "canonical_write",
        "production_write",
        "truth_assertion"
      ]
    },

    manifestComplete: blockingReasons.length === 0,
    mayProceedToQueryBodyRecoveryRunnerManifestQualityGate: blockingReasons.length === 0,
    approvalAllowsRunnerManifestBuildOnly: true,

    mayExecuteNow: false,
    mayFetchNow: false,
    maySearchNow: false,
    mayBroadSearchNow: false,
    mayClassifySeasonStateNow: false,
    mayWriteCanonicalNow: false,
    mayAssertTruthNow: false,

    runnerManifestBuilt: true,
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
    runnerManifestIsTruth: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    zeroResultDoesNotImplyAbsence: true,
    missingStandingKeywordDoesNotProveAbsence: true,
    noMatchTodayDoesNotImplyInactive: true,

    nextAllowedStep:
      blockingReasons.length === 0
        ? "run_no_write_sportomedia_graphql_query_body_recovery_runner_manifest_quality_gate"
        : "repair_no_write_sportomedia_graphql_query_body_recovery_runner_manifest",
    nextBlockedStep: "controlled_graphql_payload_refetch_classifier_canonical_write_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const approval = readJson(args.approvalInput);
  const approvalRows = validateApproval(approval);

  const manifestRows = approvalRows
    .map(buildRunnerManifestRow)
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const readyRows = manifestRows.filter((row) => row.queryBodyRecoveryRunnerManifestStatus === "ready_for_no_write_sportomedia_graphql_query_body_recovery_runner_manifest_quality_gate");
  const blockedRows = manifestRows.filter((row) => row.queryBodyRecoveryRunnerManifestStatus !== "ready_for_no_write_sportomedia_graphql_query_body_recovery_runner_manifest_quality_gate");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-no-write-sportomedia-graphql-query-body-recovery-runner-manifest-file",
    mode: "build_no_write_sportomedia_graphql_query_body_recovery_runner_manifest_no_fetch_no_search_no_classifier_no_truth_assertion_no_write",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      sportomediaGraphqlQueryBodyRecoveryApprovalGate: args.approvalInput
    },
    summary: {
      sportomediaGraphqlQueryBodyRecoveryRunnerManifestCompetitionCount: manifestRows.length,
      queryBodyRecoveryRunnerManifestReadyCount: readyRows.length,
      queryBodyRecoveryRunnerManifestBlockedCount: blockedRows.length,

      endpointReachableButInsufficientPayloadCount: manifestRows.filter((row) => row.endpointReachableButInsufficientPayload).length,
      queryBodyRecoveryNeededCount: manifestRows.filter((row) => row.queryBodyRecoveryNeeded).length,

      totalRunnerManifestSourceTextCandidateCount: manifestRows.reduce((sum, row) => sum + Number(row.sourceTextCandidateCount || 0), 0),
      totalRunnerManifestOperationCandidateCount: manifestRows.reduce((sum, row) => sum + Number(row.operationCandidateCount || 0), 0),
      totalRunnerManifestHighConfidenceOperationCandidateCount: manifestRows.reduce((sum, row) => sum + Number(row.highConfidenceOperationCandidateCount || 0), 0),
      totalRunnerManifestGraphqlQueryTextCandidateCount: manifestRows.reduce((sum, row) => sum + Number(row.graphqlQueryTextCandidateCount || 0), 0),
      totalRunnerManifestGraphqlBodyLikeCandidateCount: manifestRows.reduce((sum, row) => sum + Number(row.graphqlBodyLikeCandidateCount || 0), 0),
      totalRunnerManifestOperationNameCandidateCount: manifestRows.reduce((sum, row) => sum + Number(row.operationNameCandidateCount || 0), 0),
      totalRunnerManifestPersistedQueryCandidateCount: manifestRows.reduce((sum, row) => sum + Number(row.persistedQueryCandidateCount || 0), 0),

      manifestCompleteCount: manifestRows.filter((row) => row.manifestComplete).length,
      mayProceedToQueryBodyRecoveryRunnerManifestQualityGateCount:
        manifestRows.filter((row) => row.mayProceedToQueryBodyRecoveryRunnerManifestQualityGate).length,
      approvalAllowsRunnerManifestBuildOnlyCount:
        manifestRows.filter((row) => row.approvalAllowsRunnerManifestBuildOnly).length,
      runnerManifestBuiltCount: manifestRows.filter((row) => row.runnerManifestBuilt).length,

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
      runnerManifestTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        blockedRows.length === 0
          ? "run_no_write_sportomedia_graphql_query_body_recovery_runner_manifest_quality_gate"
          : "repair_no_write_sportomedia_graphql_query_body_recovery_runner_manifest"
    },
    counts: {
      byQueryBodyRecoveryRunnerManifestStatus: countBy(manifestRows, "queryBodyRecoveryRunnerManifestStatus"),
      byNextAllowedStep: countBy(manifestRows, "nextAllowedStep")
    },
    guardrails: [
      "This job builds a no-write Sportomedia GraphQL query/body recovery runner manifest only.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a season-state classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Runner manifest construction is not endpoint execution.",
      "Query/body candidates are not truth assertions.",
      "Runner manifest rows are not truth assertions.",
      "Endpoint reachability is not standings truth.",
      "Missing standing keyword does not prove absence.",
      "No match today must not imply inactive.",
      "Zero result must not imply absence."
    ],
    manifestRows,
    blockedRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    sportomediaGraphqlQueryBodyRecoveryRunnerManifestCompetitionCount: output.summary.sportomediaGraphqlQueryBodyRecoveryRunnerManifestCompetitionCount,
    queryBodyRecoveryRunnerManifestReadyCount: output.summary.queryBodyRecoveryRunnerManifestReadyCount,
    queryBodyRecoveryRunnerManifestBlockedCount: output.summary.queryBodyRecoveryRunnerManifestBlockedCount,
    endpointReachableButInsufficientPayloadCount: output.summary.endpointReachableButInsufficientPayloadCount,
    queryBodyRecoveryNeededCount: output.summary.queryBodyRecoveryNeededCount,
    totalRunnerManifestSourceTextCandidateCount: output.summary.totalRunnerManifestSourceTextCandidateCount,
    totalRunnerManifestOperationCandidateCount: output.summary.totalRunnerManifestOperationCandidateCount,
    totalRunnerManifestHighConfidenceOperationCandidateCount: output.summary.totalRunnerManifestHighConfidenceOperationCandidateCount,
    totalRunnerManifestGraphqlQueryTextCandidateCount: output.summary.totalRunnerManifestGraphqlQueryTextCandidateCount,
    totalRunnerManifestGraphqlBodyLikeCandidateCount: output.summary.totalRunnerManifestGraphqlBodyLikeCandidateCount,
    totalRunnerManifestOperationNameCandidateCount: output.summary.totalRunnerManifestOperationNameCandidateCount,
    totalRunnerManifestPersistedQueryCandidateCount: output.summary.totalRunnerManifestPersistedQueryCandidateCount,
    manifestCompleteCount: output.summary.manifestCompleteCount,
    mayProceedToQueryBodyRecoveryRunnerManifestQualityGateCount: output.summary.mayProceedToQueryBodyRecoveryRunnerManifestQualityGateCount,
    approvalAllowsRunnerManifestBuildOnlyCount: output.summary.approvalAllowsRunnerManifestBuildOnlyCount,
    runnerManifestBuiltCount: output.summary.runnerManifestBuiltCount,
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
    runnerManifestTruthCount: output.summary.runnerManifestTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    userHintUsedCount: output.summary.userHintUsedCount,
    hardcodedSeasonStateOverrideUsedCount: output.summary.hardcodedSeasonStateOverrideUsedCount,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
