#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULTS = {
  date: "2026-06-14",
  approvalInput: "data/football-truth/_diagnostics/no-write-controlled-sportomedia-graphql-payload-acquisition-approval-gate-2026-06-14/no-write-controlled-sportomedia-graphql-payload-acquisition-approval-gate-2026-06-14.json",
  output: "data/football-truth/_diagnostics/no-write-controlled-sportomedia-graphql-payload-acquisition-runner-manifest-2026-06-14/no-write-controlled-sportomedia-graphql-payload-acquisition-runner-manifest-2026-06-14.json"
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

function validateApprovalGate(input) {
  const s = input.summary || {};

  assertSummary(s, "controlledSportomediaGraphqlPayloadAcquisitionApprovalGateCompetitionCount", 2);
  assertSummary(s, "controlledSportomediaGraphqlPayloadAcquisitionApprovalGateApprovedCount", 2);
  assertSummary(s, "controlledSportomediaGraphqlPayloadAcquisitionApprovalGateBlockedCount", 0);
  assertSummary(s, "totalRouteCandidateCount", 7);
  assertSummary(s, "totalPrimaryRouteCandidateCount", 2);
  assertSummary(s, "totalFallbackRouteCandidateCount", 5);
  assertSummary(s, "mayBuildControlledRunnerManifestCount", 2);
  assertSummary(s, "approvalIsExecutionPermissionCount", 0);
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
  assertSummary(s, "graphqlRouteCandidatesTruthCount", 0);
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
    if (row.approvalGateStatus !== "approved_to_build_no_write_controlled_sportomedia_graphql_payload_acquisition_runner_manifest") {
      throw new Error(row.competitionSlug + ": approval row is not runner-manifest approved.");
    }
    if (row.mayBuildControlledRunnerManifest !== true) {
      throw new Error(row.competitionSlug + ": mayBuildControlledRunnerManifest must be true.");
    }
    if (row.approvalIsExecutionPermission !== false || row.approvalIsFetchPermissionNow !== false) {
      throw new Error(row.competitionSlug + ": approval must not be execution/fetch permission.");
    }
    if (row.mayExecuteNow !== false || row.mayFetchNow !== false || row.maySearchNow !== false || row.mayBroadSearchNow !== false) {
      throw new Error(row.competitionSlug + ": execution/fetch/search must remain false.");
    }
    if (row.mayClassifySeasonStateNow !== false || row.mayWriteCanonicalNow !== false || row.mayAssertTruthNow !== false) {
      throw new Error(row.competitionSlug + ": classifier/write/truth must remain false.");
    }
    if (!Array.isArray(row.primaryRouteCandidates) || row.primaryRouteCandidates.length < 1) {
      throw new Error(row.competitionSlug + ": missing primary route candidate.");
    }
  }

  return rows;
}

function normalizeCandidate(candidate) {
  return {
    kind: candidate.kind || "unknown",
    value: String(candidate.value || "").trim(),
    operationType: candidate.operationType || null,
    source: candidate.source || null,
    index: candidate.index ?? null,
    routeCandidateClass: candidate.routeCandidateClass || "unknown_candidate",
    routeCandidatePriority: candidate.routeCandidatePriority ?? 0,
    routeCandidateIsTruth: false
  };
}

function buildManifestRow(row) {
  const primary = row.primaryRouteCandidates.map(normalizeCandidate);
  const fallback = row.fallbackRouteCandidates.map(normalizeCandidate);
  const primaryTarget = primary[0];

  const blockingReasons = [];

  if (!primaryTarget || !primaryTarget.value) blockingReasons.push("missing_primary_controlled_graphql_payload_target");
  if (row.approvalGateStatus !== "approved_to_build_no_write_controlled_sportomedia_graphql_payload_acquisition_runner_manifest") {
    blockingReasons.push("approval_gate_not_approved");
  }
  if (row.approvalIsExecutionPermission !== false) blockingReasons.push("approval_is_execution_permission_unexpected");
  if (row.approvalIsFetchPermissionNow !== false) blockingReasons.push("approval_is_fetch_permission_unexpected");

  const runnerManifestStatus =
    blockingReasons.length === 0
      ? "ready_for_no_write_controlled_sportomedia_graphql_payload_acquisition_runner_manifest_quality_gate"
      : "blocked_controlled_sportomedia_graphql_payload_acquisition_runner_manifest";

  return {
    competitionSlug: row.competitionSlug,
    reusableFamily: row.reusableFamily,
    runnerManifestStatus,
    blockingReasons,

    runnerTargetId: row.competitionSlug + "::sportomedia_official_standings_graphql_payload_primary",
    runnerTargetScope: "sportomedia_official_standings_graphql_payload_only",
    runnerTargetPurpose: "recover_row_level_standings_candidates_for_sportomedia_parser_gap",
    runnerTargetMethod: "controlled_configured_graphql_payload_fetch_after_separate_explicit_execution_approval_only",

    primaryRouteCandidate: primaryTarget,
    fallbackRouteCandidates: fallback,
    allRouteCandidateCount: primary.length + fallback.length,
    primaryRouteCandidateCount: primary.length,
    fallbackRouteCandidateCount: fallback.length,

    requestTemplate: {
      method: "GET_OR_POST_TO_BE_RESOLVED_BY_EXECUTION_RUNNER_FROM_ROUTE_CANDIDATE_SHAPE",
      urlOrPathCandidate: primaryTarget ? primaryTarget.value : null,
      routeCandidateKind: primaryTarget ? primaryTarget.kind : null,
      operationType: primaryTarget ? primaryTarget.operationType : null,
      headers: {
        accept: "application/json,text/plain,*/*",
        purpose: "diagnostics_only_no_canonical_write"
      },
      bodyTemplate: null,
      mustRemainDiagnosticsOnly: true
    },

    manifestComplete: blockingReasons.length === 0,
    mayProceedToRunnerManifestQualityGate: blockingReasons.length === 0,
    approvalAllowsManifestBuildOnly: true,

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
    graphqlRouteCandidatesAreTruth: false,
    runnerManifestIsTruth: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    zeroResultDoesNotImplyAbsence: true,
    missingEmbeddedRowsDoesNotProveAbsence: true,
    noMatchTodayDoesNotImplyInactive: true,

    nextAllowedStep:
      blockingReasons.length === 0
        ? "run_no_write_controlled_sportomedia_graphql_payload_acquisition_runner_manifest_quality_gate"
        : "repair_controlled_sportomedia_graphql_payload_acquisition_runner_manifest",
    nextBlockedStep: "controlled_graphql_payload_fetch_classifier_canonical_write_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const approval = readJson(args.approvalInput);
  const approvalRows = validateApprovalGate(approval);

  const manifestRows = approvalRows
    .map(buildManifestRow)
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const readyRows = manifestRows.filter((row) => row.runnerManifestStatus === "ready_for_no_write_controlled_sportomedia_graphql_payload_acquisition_runner_manifest_quality_gate");
  const blockedRows = manifestRows.filter((row) => row.runnerManifestStatus !== "ready_for_no_write_controlled_sportomedia_graphql_payload_acquisition_runner_manifest_quality_gate");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-no-write-controlled-sportomedia-graphql-payload-acquisition-runner-manifest-file",
    mode: "build_no_write_controlled_sportomedia_graphql_payload_acquisition_runner_manifest_no_fetch_no_search_no_classifier_no_truth_assertion_no_write",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      controlledSportomediaGraphqlPayloadAcquisitionApprovalGate: args.approvalInput
    },
    summary: {
      controlledSportomediaGraphqlPayloadAcquisitionRunnerManifestCompetitionCount: manifestRows.length,
      controlledSportomediaGraphqlPayloadAcquisitionRunnerManifestReadyCount: readyRows.length,
      controlledSportomediaGraphqlPayloadAcquisitionRunnerManifestBlockedCount: blockedRows.length,

      runnerManifestPrimaryTargetCount: manifestRows.filter((row) => row.primaryRouteCandidate && row.primaryRouteCandidate.value).length,
      runnerManifestFallbackCandidateCount: manifestRows.reduce((sum, row) => sum + row.fallbackRouteCandidateCount, 0),
      totalRouteCandidateReferenceCount: manifestRows.reduce((sum, row) => sum + row.allRouteCandidateCount, 0),

      manifestCompleteCount: manifestRows.filter((row) => row.manifestComplete).length,
      mayProceedToRunnerManifestQualityGateCount: manifestRows.filter((row) => row.mayProceedToRunnerManifestQualityGate).length,
      approvalAllowsManifestBuildOnlyCount: manifestRows.filter((row) => row.approvalAllowsManifestBuildOnly).length,

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
      graphqlRouteCandidatesTruthCount: 0,
      runnerManifestTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        blockedRows.length === 0
          ? "run_no_write_controlled_sportomedia_graphql_payload_acquisition_runner_manifest_quality_gate"
          : "repair_controlled_sportomedia_graphql_payload_acquisition_runner_manifest"
    },
    counts: {
      byRunnerManifestStatus: countBy(manifestRows, "runnerManifestStatus"),
      byNextAllowedStep: countBy(manifestRows, "nextAllowedStep")
    },
    guardrails: [
      "This job builds a controlled Sportomedia GraphQL payload acquisition runner manifest only.",
      "It does not execute the runner.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a season-state classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Approval only allowed manifest construction, not execution.",
      "GraphQL route candidates are not truth assertions.",
      "Runner manifest rows are not truth assertions.",
      "Missing embedded rows does not prove absence.",
      "No match today must not imply inactive.",
      "Zero result must not imply absence."
    ],
    manifestRows,
    blockedRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    controlledSportomediaGraphqlPayloadAcquisitionRunnerManifestCompetitionCount: output.summary.controlledSportomediaGraphqlPayloadAcquisitionRunnerManifestCompetitionCount,
    controlledSportomediaGraphqlPayloadAcquisitionRunnerManifestReadyCount: output.summary.controlledSportomediaGraphqlPayloadAcquisitionRunnerManifestReadyCount,
    controlledSportomediaGraphqlPayloadAcquisitionRunnerManifestBlockedCount: output.summary.controlledSportomediaGraphqlPayloadAcquisitionRunnerManifestBlockedCount,
    runnerManifestPrimaryTargetCount: output.summary.runnerManifestPrimaryTargetCount,
    runnerManifestFallbackCandidateCount: output.summary.runnerManifestFallbackCandidateCount,
    totalRouteCandidateReferenceCount: output.summary.totalRouteCandidateReferenceCount,
    manifestCompleteCount: output.summary.manifestCompleteCount,
    mayProceedToRunnerManifestQualityGateCount: output.summary.mayProceedToRunnerManifestQualityGateCount,
    approvalAllowsManifestBuildOnlyCount: output.summary.approvalAllowsManifestBuildOnlyCount,
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
    graphqlRouteCandidatesTruthCount: output.summary.graphqlRouteCandidatesTruthCount,
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
