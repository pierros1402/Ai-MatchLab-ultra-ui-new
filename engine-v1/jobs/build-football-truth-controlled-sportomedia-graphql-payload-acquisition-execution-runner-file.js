#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULTS = {
  date: "2026-06-14",
  approvalInput: "data/football-truth/_diagnostics/explicit-controlled-sportomedia-graphql-payload-acquisition-run-approval-gate-2026-06-14/explicit-controlled-sportomedia-graphql-payload-acquisition-run-approval-gate-2026-06-14.json",
  output: "data/football-truth/_diagnostics/controlled-sportomedia-graphql-payload-acquisition-execution-runner-2026-06-14/controlled-sportomedia-graphql-payload-acquisition-execution-runner-2026-06-14.json"
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

function validateRunApproval(input) {
  const s = input.summary || {};

  assertSummary(s, "controlledSportomediaGraphqlPayloadAcquisitionRunApprovalGateCompetitionCount", 2);
  assertSummary(s, "controlledSportomediaGraphqlPayloadAcquisitionRunApprovalGateApprovedCount", 2);
  assertSummary(s, "controlledSportomediaGraphqlPayloadAcquisitionRunApprovalGateBlockedCount", 0);
  assertSummary(s, "approvedRunnerTargetCount", 2);
  assertSummary(s, "approvedPrimaryRouteCandidateCount", 2);
  assertSummary(s, "approvedRouteCandidateReferenceCount", 7);
  assertSummary(s, "mayBuildControlledExecutionRunnerCount", 2);
  assertSummary(s, "runApprovalIsExecutionPermissionNowCount", 0);
  assertSummary(s, "runApprovalIsFetchPermissionNowCount", 0);

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
  assertSummary(s, "graphqlRouteCandidatesTruthCount", 0);
  assertSummary(s, "runnerManifestTruthCount", 0);
  assertSummary(s, "runApprovalTruthCount", 0);
  assertSummary(s, "canonicalWrites", 0);
  assertSummary(s, "productionWrite", false);
  assertSummary(s, "userHintUsedCount", 0);
  assertSummary(s, "hardcodedSeasonStateOverrideUsedCount", 0);

  const rows = Array.isArray(input.runApprovalRows) ? input.runApprovalRows : [];
  if (rows.length !== 2) throw new Error("Expected 2 runApprovalRows.");

  const slugs = uniqueSorted(rows.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Unexpected run approval slugs: " + slugs.join(", "));
  }

  return rows;
}

function buildRunnerRow(row) {
  const blockingReasons = [];

  if (row.runApprovalGateStatus !== "approved_to_build_controlled_sportomedia_graphql_payload_acquisition_execution_runner") {
    blockingReasons.push("run_approval_gate_not_approved");
  }
  if (row.mayBuildControlledExecutionRunner !== true) {
    blockingReasons.push("run_approval_does_not_allow_execution_runner_build");
  }
  if (row.runApprovalIsExecutionPermissionNow !== false) {
    blockingReasons.push("run_approval_is_execution_permission_now");
  }
  if (row.runApprovalIsFetchPermissionNow !== false) {
    blockingReasons.push("run_approval_is_fetch_permission_now");
  }
  if (!row.runnerTargetId) blockingReasons.push("missing_runner_target_id");
  if (!row.primaryRouteCandidate || !row.primaryRouteCandidate.value) blockingReasons.push("missing_primary_route_candidate");

  if (row.mayExecuteNow !== false) blockingReasons.push("approval_would_execute_now");
  if (row.mayFetchNow !== false) blockingReasons.push("approval_would_fetch_now");
  if (row.maySearchNow !== false) blockingReasons.push("approval_would_search_now");
  if (row.mayBroadSearchNow !== false) blockingReasons.push("approval_would_broad_search_now");
  if (row.mayClassifySeasonStateNow !== false) blockingReasons.push("approval_would_classify_now");
  if (row.mayWriteCanonicalNow !== false) blockingReasons.push("approval_would_write_canonical_now");
  if (row.mayAssertTruthNow !== false) blockingReasons.push("approval_would_assert_truth_now");

  const executionRunnerStatus =
    blockingReasons.length === 0
      ? "ready_for_controlled_sportomedia_graphql_payload_acquisition_execution_runner_quality_gate"
      : "blocked_controlled_sportomedia_graphql_payload_acquisition_execution_runner";

  const primary = row.primaryRouteCandidate || {};
  const candidateValue = String(primary.value || "");

  return {
    competitionSlug: row.competitionSlug,
    reusableFamily: row.reusableFamily,
    executionRunnerStatus,
    blockingReasons,

    runnerTargetId: row.runnerTargetId,
    runnerTargetScope: row.runnerTargetScope,
    runnerTargetPurpose: row.runnerTargetPurpose,
    approvedRunScope: row.approvedRunScope,
    approvedExecutionMode: row.approvedExecutionMode,

    primaryRouteCandidate: row.primaryRouteCandidate,
    fallbackRouteCandidateCount: row.fallbackRouteCandidateCount,
    allRouteCandidateCount: row.allRouteCandidateCount,

    executionRunnerDefinition: {
      runnerMode: "controlled_diagnostics_only_sportomedia_graphql_payload_acquisition",
      targetSlug: row.competitionSlug,
      targetFamily: row.reusableFamily,
      targetKind: "official_standings_graphql_payload",
      routeCandidateKind: primary.kind || null,
      routeCandidateValue: candidateValue || null,
      operationType: primary.operationType || null,
      requestMethodPolicy: "resolve_get_or_post_from_route_candidate_shape_at_execution_time",
      requestHeadersPolicy: {
        accept: "application/json,text/plain,*/*",
        diagnosticsOnly: "true"
      },
      outputPayloadUse: "diagnostics_only_parser_recovery_input",
      allowedSideEffects: ["write_diagnostics_payload_snapshot_only"],
      forbiddenSideEffects: [
        "search",
        "broad_search",
        "season_state_classifier",
        "canonical_write",
        "production_write",
        "truth_assertion"
      ]
    },

    executionRunnerComplete: blockingReasons.length === 0,
    mayProceedToExecutionRunnerQualityGate: blockingReasons.length === 0,
    approvalAllowsRunnerBuildOnly: true,

    mayRunControlledPayloadAcquisitionAfterFutureFinalApproval: blockingReasons.length === 0,
    mayExecuteNow: false,
    mayFetchNow: false,
    maySearchNow: false,
    mayBroadSearchNow: false,
    mayClassifySeasonStateNow: false,
    mayWriteCanonicalNow: false,
    mayAssertTruthNow: false,

    executionRunnerBuilt: true,
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
    graphqlRouteCandidatesAreTruth: false,
    executionRunnerIsTruth: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    zeroResultDoesNotImplyAbsence: true,
    missingEmbeddedRowsDoesNotProveAbsence: true,
    noMatchTodayDoesNotImplyInactive: true,

    nextAllowedStep:
      blockingReasons.length === 0
        ? "run_controlled_sportomedia_graphql_payload_acquisition_execution_runner_quality_gate"
        : "repair_controlled_sportomedia_graphql_payload_acquisition_execution_runner",
    nextBlockedStep: "controlled_graphql_payload_fetch_classifier_canonical_write_truth_assertions_blocked_until_final_execution_approval"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const approval = readJson(args.approvalInput);
  const approvalRows = validateRunApproval(approval);

  const runnerRows = approvalRows
    .map(buildRunnerRow)
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const readyRows = runnerRows.filter((row) => row.executionRunnerStatus === "ready_for_controlled_sportomedia_graphql_payload_acquisition_execution_runner_quality_gate");
  const blockedRows = runnerRows.filter((row) => row.executionRunnerStatus !== "ready_for_controlled_sportomedia_graphql_payload_acquisition_execution_runner_quality_gate");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-controlled-sportomedia-graphql-payload-acquisition-execution-runner-file",
    mode: "build_controlled_sportomedia_graphql_payload_acquisition_execution_runner_no_fetch_no_search_no_classifier_no_truth_assertion_no_write",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      explicitControlledSportomediaGraphqlPayloadAcquisitionRunApprovalGate: args.approvalInput
    },
    summary: {
      controlledSportomediaGraphqlPayloadAcquisitionExecutionRunnerCompetitionCount: runnerRows.length,
      controlledSportomediaGraphqlPayloadAcquisitionExecutionRunnerReadyCount: readyRows.length,
      controlledSportomediaGraphqlPayloadAcquisitionExecutionRunnerBlockedCount: blockedRows.length,

      executionRunnerTargetCount: runnerRows.filter((row) => row.runnerTargetId).length,
      executionRunnerPrimaryRouteCandidateCount: runnerRows.filter((row) => row.primaryRouteCandidate && row.primaryRouteCandidate.value).length,
      executionRunnerRouteCandidateReferenceCount: runnerRows.reduce((sum, row) => sum + row.allRouteCandidateCount, 0),

      executionRunnerCompleteCount: runnerRows.filter((row) => row.executionRunnerComplete).length,
      mayProceedToExecutionRunnerQualityGateCount: runnerRows.filter((row) => row.mayProceedToExecutionRunnerQualityGate).length,
      approvalAllowsRunnerBuildOnlyCount: runnerRows.filter((row) => row.approvalAllowsRunnerBuildOnly).length,

      mayRunControlledPayloadAcquisitionAfterFutureFinalApprovalCount:
        runnerRows.filter((row) => row.mayRunControlledPayloadAcquisitionAfterFutureFinalApproval).length,

      mayExecuteNowCount: 0,
      mayFetchNowCount: 0,
      maySearchNowCount: 0,
      mayBroadSearchNowCount: 0,
      mayClassifySeasonStateNowCount: 0,
      mayWriteCanonicalNowCount: 0,
      mayAssertTruthNowCount: 0,

      executionRunnerBuiltCount: runnerRows.filter((row) => row.executionRunnerBuilt).length,
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
      graphqlRouteCandidatesTruthCount: 0,
      executionRunnerTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        blockedRows.length === 0
          ? "run_controlled_sportomedia_graphql_payload_acquisition_execution_runner_quality_gate"
          : "repair_controlled_sportomedia_graphql_payload_acquisition_execution_runner"
    },
    counts: {
      byExecutionRunnerStatus: countBy(runnerRows, "executionRunnerStatus"),
      byNextAllowedStep: countBy(runnerRows, "nextAllowedStep")
    },
    guardrails: [
      "This job builds the controlled Sportomedia GraphQL payload acquisition execution runner artifact only.",
      "It does not execute the runner.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a season-state classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Run approval only allowed runner construction, not immediate execution.",
      "Execution runner rows are not truth assertions.",
      "GraphQL route candidates are not truth assertions.",
      "Missing embedded rows does not prove absence.",
      "No match today must not imply inactive.",
      "Zero result must not imply absence."
    ],
    runnerRows,
    blockedRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    controlledSportomediaGraphqlPayloadAcquisitionExecutionRunnerCompetitionCount: output.summary.controlledSportomediaGraphqlPayloadAcquisitionExecutionRunnerCompetitionCount,
    controlledSportomediaGraphqlPayloadAcquisitionExecutionRunnerReadyCount: output.summary.controlledSportomediaGraphqlPayloadAcquisitionExecutionRunnerReadyCount,
    controlledSportomediaGraphqlPayloadAcquisitionExecutionRunnerBlockedCount: output.summary.controlledSportomediaGraphqlPayloadAcquisitionExecutionRunnerBlockedCount,
    executionRunnerTargetCount: output.summary.executionRunnerTargetCount,
    executionRunnerPrimaryRouteCandidateCount: output.summary.executionRunnerPrimaryRouteCandidateCount,
    executionRunnerRouteCandidateReferenceCount: output.summary.executionRunnerRouteCandidateReferenceCount,
    executionRunnerCompleteCount: output.summary.executionRunnerCompleteCount,
    mayProceedToExecutionRunnerQualityGateCount: output.summary.mayProceedToExecutionRunnerQualityGateCount,
    approvalAllowsRunnerBuildOnlyCount: output.summary.approvalAllowsRunnerBuildOnlyCount,
    mayRunControlledPayloadAcquisitionAfterFutureFinalApprovalCount: output.summary.mayRunControlledPayloadAcquisitionAfterFutureFinalApprovalCount,
    mayExecuteNowCount: output.summary.mayExecuteNowCount,
    mayFetchNowCount: output.summary.mayFetchNowCount,
    maySearchNowCount: output.summary.maySearchNowCount,
    mayBroadSearchNowCount: output.summary.mayBroadSearchNowCount,
    mayClassifySeasonStateNowCount: output.summary.mayClassifySeasonStateNowCount,
    mayWriteCanonicalNowCount: output.summary.mayWriteCanonicalNowCount,
    mayAssertTruthNowCount: output.summary.mayAssertTruthNowCount,
    executionRunnerBuiltCount: output.summary.executionRunnerBuiltCount,
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
    graphqlRouteCandidatesTruthCount: output.summary.graphqlRouteCandidatesTruthCount,
    executionRunnerTruthCount: output.summary.executionRunnerTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    userHintUsedCount: output.summary.userHintUsedCount,
    hardcodedSeasonStateOverrideUsedCount: output.summary.hardcodedSeasonStateOverrideUsedCount,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
