#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULTS = {
  date: "2026-06-14",
  manifestInput: "data/football-truth/_diagnostics/no-write-controlled-sportomedia-graphql-payload-acquisition-runner-manifest-2026-06-14/no-write-controlled-sportomedia-graphql-payload-acquisition-runner-manifest-2026-06-14.json",
  output: "data/football-truth/_diagnostics/no-write-controlled-sportomedia-graphql-payload-acquisition-runner-manifest-quality-gate-2026-06-14/no-write-controlled-sportomedia-graphql-payload-acquisition-runner-manifest-quality-gate-2026-06-14.json"
};

const EXPECTED_SLUGS = ["swe.1", "swe.2"];

function parseArgs(argv) {
  const args = { ...DEFAULTS };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--manifest-input") args.manifestInput = argv[++i];
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

function validateManifest(input) {
  const s = input.summary || {};

  assertSummary(s, "controlledSportomediaGraphqlPayloadAcquisitionRunnerManifestCompetitionCount", 2);
  assertSummary(s, "controlledSportomediaGraphqlPayloadAcquisitionRunnerManifestReadyCount", 2);
  assertSummary(s, "controlledSportomediaGraphqlPayloadAcquisitionRunnerManifestBlockedCount", 0);
  assertSummary(s, "runnerManifestPrimaryTargetCount", 2);
  assertSummary(s, "runnerManifestFallbackCandidateCount", 5);
  assertSummary(s, "totalRouteCandidateReferenceCount", 7);
  assertSummary(s, "manifestCompleteCount", 2);
  assertSummary(s, "mayProceedToRunnerManifestQualityGateCount", 2);
  assertSummary(s, "approvalAllowsManifestBuildOnlyCount", 2);

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
  assertSummary(s, "canonicalWrites", 0);
  assertSummary(s, "productionWrite", false);
  assertSummary(s, "userHintUsedCount", 0);
  assertSummary(s, "hardcodedSeasonStateOverrideUsedCount", 0);

  const rows = Array.isArray(input.manifestRows) ? input.manifestRows : [];
  if (rows.length !== 2) throw new Error("Expected 2 manifestRows.");

  const slugs = uniqueSorted(rows.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Unexpected manifest slugs: " + slugs.join(", "));
  }

  return rows;
}

function buildQualityGateRow(row) {
  const blockingReasons = [];

  if (row.runnerManifestStatus !== "ready_for_no_write_controlled_sportomedia_graphql_payload_acquisition_runner_manifest_quality_gate") {
    blockingReasons.push("runner_manifest_status_not_quality_gate_ready");
  }
  if (row.manifestComplete !== true) blockingReasons.push("manifest_not_complete");
  if (row.mayProceedToRunnerManifestQualityGate !== true) blockingReasons.push("manifest_not_allowed_to_quality_gate");
  if (row.approvalAllowsManifestBuildOnly !== true) blockingReasons.push("approval_scope_not_manifest_build_only");

  if (!row.primaryRouteCandidate || !row.primaryRouteCandidate.value) {
    blockingReasons.push("missing_primary_route_candidate");
  }
  if (row.primaryRouteCandidateCount < 1) blockingReasons.push("primary_route_candidate_count_zero");
  if (row.allRouteCandidateCount < 1) blockingReasons.push("route_candidate_reference_count_zero");

  if (row.mayExecuteNow !== false) blockingReasons.push("manifest_would_execute_now");
  if (row.mayFetchNow !== false) blockingReasons.push("manifest_would_fetch_now");
  if (row.maySearchNow !== false) blockingReasons.push("manifest_would_search_now");
  if (row.mayBroadSearchNow !== false) blockingReasons.push("manifest_would_broad_search_now");
  if (row.mayClassifySeasonStateNow !== false) blockingReasons.push("manifest_would_classify_now");
  if (row.mayWriteCanonicalNow !== false) blockingReasons.push("manifest_would_write_canonical_now");
  if (row.mayAssertTruthNow !== false) blockingReasons.push("manifest_would_assert_truth_now");

  if (row.fetchExecutedNow !== false) blockingReasons.push("manifest_builder_fetched");
  if (row.searchExecutedNow !== false) blockingReasons.push("manifest_builder_searched");
  if (row.broadSearchExecutedNow !== false) blockingReasons.push("manifest_builder_broad_searched");
  if (row.classifierExecutedNow !== false) blockingReasons.push("manifest_builder_classified");
  if (row.canonicalWriteExecutedNow !== false) blockingReasons.push("manifest_builder_wrote_canonical");
  if (row.productionWriteExecutedNow !== false) blockingReasons.push("manifest_builder_wrote_production");
  if (row.seasonStateTruthAssertedNow !== false) blockingReasons.push("manifest_builder_asserted_truth");
  if (row.graphqlRouteCandidatesAreTruth !== false) blockingReasons.push("graphql_route_candidate_marked_truth");
  if (row.runnerManifestIsTruth !== false) blockingReasons.push("runner_manifest_marked_truth");
  if (row.userHintUsed !== false) blockingReasons.push("user_hint_used");
  if (row.hardcodedSeasonStateOverrideUsed !== false) blockingReasons.push("hardcoded_season_state_override_used");

  const qualityGateStatus =
    blockingReasons.length === 0
      ? "passed_no_write_controlled_sportomedia_graphql_payload_acquisition_runner_manifest_quality_gate"
      : "blocked_no_write_controlled_sportomedia_graphql_payload_acquisition_runner_manifest_quality_gate";

  return {
    competitionSlug: row.competitionSlug,
    reusableFamily: row.reusableFamily,
    qualityGateStatus,
    blockingReasons,

    runnerTargetId: row.runnerTargetId,
    runnerTargetScope: row.runnerTargetScope,
    runnerTargetPurpose: row.runnerTargetPurpose,
    runnerTargetMethod: row.runnerTargetMethod,
    primaryRouteCandidate: row.primaryRouteCandidate,
    fallbackRouteCandidateCount: row.fallbackRouteCandidateCount,
    allRouteCandidateCount: row.allRouteCandidateCount,

    manifestComplete: row.manifestComplete,
    approvalAllowsManifestBuildOnly: row.approvalAllowsManifestBuildOnly,

    mayPrepareExplicitControlledGraphqlPayloadAcquisitionRunApprovalGate:
      qualityGateStatus === "passed_no_write_controlled_sportomedia_graphql_payload_acquisition_runner_manifest_quality_gate",

    qualityGateIsExecutionPermission: false,
    qualityGateIsFetchPermissionNow: false,

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
      qualityGateStatus === "passed_no_write_controlled_sportomedia_graphql_payload_acquisition_runner_manifest_quality_gate"
        ? "prepare_explicit_controlled_sportomedia_graphql_payload_acquisition_run_approval_gate"
        : "repair_controlled_sportomedia_graphql_payload_acquisition_runner_manifest",
    nextBlockedStep: "controlled_graphql_payload_fetch_classifier_canonical_write_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const manifest = readJson(args.manifestInput);
  const manifestRows = validateManifest(manifest);

  const qualityGateRows = manifestRows
    .map(buildQualityGateRow)
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const passedRows = qualityGateRows.filter((row) => row.qualityGateStatus === "passed_no_write_controlled_sportomedia_graphql_payload_acquisition_runner_manifest_quality_gate");
  const blockedRows = qualityGateRows.filter((row) => row.qualityGateStatus !== "passed_no_write_controlled_sportomedia_graphql_payload_acquisition_runner_manifest_quality_gate");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "run-football-truth-no-write-controlled-sportomedia-graphql-payload-acquisition-runner-manifest-quality-gate-file",
    mode: "run_no_write_controlled_sportomedia_graphql_payload_acquisition_runner_manifest_quality_gate_no_fetch_no_search_no_classifier_no_truth_assertion_no_write",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      controlledSportomediaGraphqlPayloadAcquisitionRunnerManifest: args.manifestInput
    },
    summary: {
      controlledSportomediaGraphqlPayloadAcquisitionRunnerManifestQualityGateCompetitionCount: qualityGateRows.length,
      controlledSportomediaGraphqlPayloadAcquisitionRunnerManifestQualityGatePassedCount: passedRows.length,
      controlledSportomediaGraphqlPayloadAcquisitionRunnerManifestQualityGateBlockedCount: blockedRows.length,

      qualityGatedRunnerTargetCount: qualityGateRows.filter((row) => row.runnerTargetId).length,
      qualityGatedPrimaryRouteCandidateCount: qualityGateRows.filter((row) => row.primaryRouteCandidate && row.primaryRouteCandidate.value).length,
      qualityGatedFallbackRouteCandidateCount: qualityGateRows.reduce((sum, row) => sum + row.fallbackRouteCandidateCount, 0),
      qualityGatedRouteCandidateReferenceCount: qualityGateRows.reduce((sum, row) => sum + row.allRouteCandidateCount, 0),

      manifestCompleteCount: qualityGateRows.filter((row) => row.manifestComplete).length,
      approvalAllowsManifestBuildOnlyCount: qualityGateRows.filter((row) => row.approvalAllowsManifestBuildOnly).length,

      mayPrepareExplicitControlledGraphqlPayloadAcquisitionRunApprovalGateCount:
        qualityGateRows.filter((row) => row.mayPrepareExplicitControlledGraphqlPayloadAcquisitionRunApprovalGate).length,

      qualityGateIsExecutionPermissionCount: qualityGateRows.filter((row) => row.qualityGateIsExecutionPermission).length,
      qualityGateIsFetchPermissionNowCount: qualityGateRows.filter((row) => row.qualityGateIsFetchPermissionNow).length,

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
          ? "prepare_explicit_controlled_sportomedia_graphql_payload_acquisition_run_approval_gate"
          : "repair_controlled_sportomedia_graphql_payload_acquisition_runner_manifest"
    },
    counts: {
      byQualityGateStatus: countBy(qualityGateRows, "qualityGateStatus"),
      byNextAllowedStep: countBy(qualityGateRows, "nextAllowedStep")
    },
    guardrails: [
      "This quality gate reads the controlled Sportomedia GraphQL runner manifest only.",
      "It does not execute the runner.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a season-state classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Passing this quality gate only allows preparing a separate explicit run approval gate.",
      "Passing this quality gate does not allow runner execution or fetch now.",
      "GraphQL route candidates are not truth assertions.",
      "Runner manifest rows are not truth assertions.",
      "Missing embedded rows does not prove absence.",
      "No match today must not imply inactive.",
      "Zero result must not imply absence."
    ],
    qualityGateRows,
    blockedRows
  };

  writeJson(args.output, output);

  console.log(JSON.stringify({
    output: args.output,
    controlledSportomediaGraphqlPayloadAcquisitionRunnerManifestQualityGateCompetitionCount: output.summary.controlledSportomediaGraphqlPayloadAcquisitionRunnerManifestQualityGateCompetitionCount,
    controlledSportomediaGraphqlPayloadAcquisitionRunnerManifestQualityGatePassedCount: output.summary.controlledSportomediaGraphqlPayloadAcquisitionRunnerManifestQualityGatePassedCount,
    controlledSportomediaGraphqlPayloadAcquisitionRunnerManifestQualityGateBlockedCount: output.summary.controlledSportomediaGraphqlPayloadAcquisitionRunnerManifestQualityGateBlockedCount,
    qualityGatedRunnerTargetCount: output.summary.qualityGatedRunnerTargetCount,
    qualityGatedPrimaryRouteCandidateCount: output.summary.qualityGatedPrimaryRouteCandidateCount,
    qualityGatedFallbackRouteCandidateCount: output.summary.qualityGatedFallbackRouteCandidateCount,
    qualityGatedRouteCandidateReferenceCount: output.summary.qualityGatedRouteCandidateReferenceCount,
    manifestCompleteCount: output.summary.manifestCompleteCount,
    approvalAllowsManifestBuildOnlyCount: output.summary.approvalAllowsManifestBuildOnlyCount,
    mayPrepareExplicitControlledGraphqlPayloadAcquisitionRunApprovalGateCount: output.summary.mayPrepareExplicitControlledGraphqlPayloadAcquisitionRunApprovalGateCount,
    qualityGateIsExecutionPermissionCount: output.summary.qualityGateIsExecutionPermissionCount,
    qualityGateIsFetchPermissionNowCount: output.summary.qualityGateIsFetchPermissionNowCount,
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
