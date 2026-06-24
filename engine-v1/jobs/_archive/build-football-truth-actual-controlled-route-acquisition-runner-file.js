#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";
const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/controlled-route-acquisition-approval-gate-2026-06-14/controlled-route-acquisition-approval-gate-2026-06-14.json";
const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/actual-controlled-route-acquisition-runner-2026-06-14/actual-controlled-route-acquisition-runner-2026-06-14.json";

const EXPECTED_SLUGS = ["esp.1", "esp.2", "nor.1", "nor.2", "swe.1", "swe.2"];

function parseArgs(argv) {
  const args = { date: DEFAULT_DATE, input: DEFAULT_INPUT, output: DEFAULT_OUTPUT };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--input") args.input = argv[++i];
    else if (arg === "--output") args.output = argv[++i];
    else throw new Error("Unknown argument: " + arg);
  }

  return args;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error("Missing JSON input: " + filePath);
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function stableJson(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

function uniqueSorted(values) {
  return [...new Set(
    values
      .filter((value) => value !== null && value !== undefined)
      .map((value) => String(value).trim())
      .filter(Boolean)
  )].sort((a, b) => a.localeCompare(b));
}

function countBy(rows, key) {
  const counts = {};
  for (const row of rows) {
    const value =
      row[key] === null || row[key] === undefined || String(row[key]).trim() === ""
        ? "__missing__"
        : String(row[key]).trim();

    counts[value] = (counts[value] || 0) + 1;
  }

  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    })
  );
}

function assertSummary(summary, key, expected) {
  if (!(key in summary)) throw new Error("Missing summary key: " + key);
  if (summary[key] !== expected) {
    throw new Error("Guardrail failed for " + key + ": expected " + expected + ", got " + summary[key]);
  }
}

function validateApprovalGate(input) {
  const summary = input.summary || {};

  assertSummary(summary, "controlledRouteAcquisitionApprovalGateCompetitionCount", 6);
  assertSummary(summary, "controlledRouteAcquisitionApprovalEligibleCount", 6);
  assertSummary(summary, "controlledRouteAcquisitionApprovalBlockedCount", 0);
  assertSummary(summary, "mayPrepareControlledAcquisitionRunnerCount", 6);
  assertSummary(summary, "mayEnableControlledRouteAcquisitionNowCount", 0);
  assertSummary(summary, "mayFetchNowCount", 0);
  assertSummary(summary, "maySearchNowCount", 0);
  assertSummary(summary, "mayBroadSearchNowCount", 0);
  assertSummary(summary, "mayClassifySeasonStateNowCount", 0);
  assertSummary(summary, "mayWriteCanonicalNowCount", 0);
  assertSummary(summary, "laligaApprovalGateCompetitionCount", 2);
  assertSummary(summary, "norwayNtfApprovalGateCompetitionCount", 2);
  assertSummary(summary, "sportomediaApprovalGateCompetitionCount", 2);
  assertSummary(summary, "userHintUsedCount", 0);
  assertSummary(summary, "hardcodedSeasonStateOverrideUsedCount", 0);
  assertSummary(summary, "validatorReadinessDoesNotImplyActiveCount", 6);
  assertSummary(summary, "executionAllowedNowCount", 0);
  assertSummary(summary, "fetchAllowedNowCount", 0);
  assertSummary(summary, "searchAllowedNowCount", 0);
  assertSummary(summary, "broadSearchAllowedNowCount", 0);
  assertSummary(summary, "controlledDiscoveryAllowedNowCount", 0);
  assertSummary(summary, "controlledRouteAcquisitionAllowedNowCount", 0);
  assertSummary(summary, "classifierAllowedNowCount", 0);
  assertSummary(summary, "canonicalPromotionAllowedNowCount", 0);
  assertSummary(summary, "canonicalWriteEligibleNowCount", 0);
  assertSummary(summary, "truthAssertionsAllowedNowCount", 0);
  assertSummary(summary, "activeAssertedCount", 0);
  assertSummary(summary, "inactiveAssertedCount", 0);
  assertSummary(summary, "completedAssertedCount", 0);
  assertSummary(summary, "canonicalWrites", 0);
  assertSummary(summary, "productionWrite", false);

  const rows = Array.isArray(input.approvalRows) ? input.approvalRows : [];
  if (rows.length !== 6) throw new Error("Expected 6 approvalRows, got " + rows.length);

  const slugs = uniqueSorted(rows.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Unexpected approval slugs: " + slugs.join(", "));
  }

  for (const row of rows) {
    if (row.approvalGateStatus !== "eligible_for_explicit_controlled_route_acquisition_approval_but_not_enabled") {
      throw new Error(row.competitionSlug + ": approval gate row is not eligible");
    }
    if (row.mayPrepareControlledAcquisitionRunner !== true) {
      throw new Error(row.competitionSlug + ": mayPrepareControlledAcquisitionRunner must be true");
    }
    if (row.mayEnableControlledRouteAcquisitionNow !== false) {
      throw new Error(row.competitionSlug + ": mayEnableControlledRouteAcquisitionNow must remain false");
    }
    if (row.mayFetchNow !== false || row.maySearchNow !== false || row.mayBroadSearchNow !== false) {
      throw new Error(row.competitionSlug + ": fetch/search/broadSearch must remain false");
    }
    if (row.mayClassifySeasonStateNow !== false || row.mayWriteCanonicalNow !== false) {
      throw new Error(row.competitionSlug + ": classifier/write must remain false");
    }
    if (row.userHintUsed !== false || row.hardcodedSeasonStateOverrideUsed !== false) {
      throw new Error(row.competitionSlug + ": hints/overrides must remain false");
    }
  }

  return rows;
}

function buildRunnerRow(row) {
  return {
    competitionSlug: row.competitionSlug,
    reusableFamily: row.reusableFamily,
    routeAcquisitionType: row.routeAcquisitionType,
    routeScope: row.routeScope,

    actualRunnerStatus: "controlled_route_acquisition_runner_defined_execution_disabled",
    actualRunnerMode: "controlled_configured_route_evidence_acquisition_no_broad_search_no_canonical_write",
    sourceApprovalGateStatus: row.approvalGateStatus,
    sourceApprovalScope: row.approvalScope,

    runnerMayBePrepared: true,
    runnerExecutionAllowedNow: false,
    runnerFetchAllowedNow: false,
    runnerSearchAllowedNow: false,
    runnerBroadSearchAllowedNow: false,
    runnerClassifierAllowedNow: false,
    runnerCanonicalWriteAllowedNow: false,

    runnerTask: {
      taskType: "season_state_evidence_acquisition",
      allowedRouteScope: row.routeScope,
      allowedRouteAcquisitionType: row.routeAcquisitionType,
      allowedCompetitionSlug: row.competitionSlug,
      allowedReusableFamily: row.reusableFamily,
      forbiddenOperations: [
        "broad_search",
        "canonical_write",
        "production_write",
        "season_state_truth_assertion",
        "classifier_execution",
        "zero_result_as_absence",
        "user_hint_as_truth",
        "hardcoded_season_state_override"
      ],
      requiredOutputsBeforeClassifier: [
        "anchored season marker",
        "dated fixture/result or final standings evidence",
        "source URL or configured route reference",
        "completed/inactive marker when present",
        "restart/start date evidence when completed or inactive"
      ]
    },

    requiredExecutionApprovalGate: "run_actual_controlled_route_acquisition_runner_quality_gate_then_explicit_execute_approval",
    nextAllowedStep: "run_actual_controlled_route_acquisition_runner_quality_gate_no_fetch_no_write",
    nextBlockedStep: "actual_route_acquisition_execution_classifier_and_canonical_write_blocked",

    executionAllowedNow: false,
    fetchAllowedNow: false,
    searchAllowedNow: false,
    broadSearchAllowedNow: false,
    controlledDiscoveryAllowedNow: false,
    controlledRouteAcquisitionAllowedNow: false,
    classifierAllowedNow: false,
    canonicalPromotionAllowedNow: false,
    canonicalWriteEligibleNow: false,
    truthAssertionsAllowedNow: false,
    activeAssertedNow: false,
    inactiveAssertedNow: false,
    completedAssertedNow: false,
    canonicalWrites: 0,
    productionWrite: false,

    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,
    validatorReadinessDoesNotImplyActive: true,
    noMatchTodayDoesNotImplyInactive: true,
    matchStatusIsNotSeasonStateTruth: true,
    zeroResultDoesNotImplyAbsence: true
  };
}

function main() {
  const args = parseArgs(process.argv);
  const input = readJson(args.input);
  const approvalRows = validateApprovalGate(input);

  const runnerRows = approvalRows
    .map(buildRunnerRow)
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-actual-controlled-route-acquisition-runner-file",
    mode: "define_actual_controlled_route_acquisition_runner_no_fetch_no_search_no_write_execution_disabled",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      controlledRouteAcquisitionApprovalGate: args.input
    },
    summary: {
      actualControlledRouteAcquisitionRunnerCompetitionCount: runnerRows.length,
      actualControlledRouteAcquisitionRunnerDefinedCount: runnerRows.filter((row) =>
        row.actualRunnerStatus === "controlled_route_acquisition_runner_defined_execution_disabled"
      ).length,
      actualControlledRouteAcquisitionRunnerBlockedCount: 0,

      runnerMayBePreparedCount: runnerRows.filter((row) => row.runnerMayBePrepared).length,
      runnerExecutionAllowedNowCount: runnerRows.filter((row) => row.runnerExecutionAllowedNow).length,
      runnerFetchAllowedNowCount: runnerRows.filter((row) => row.runnerFetchAllowedNow).length,
      runnerSearchAllowedNowCount: runnerRows.filter((row) => row.runnerSearchAllowedNow).length,
      runnerBroadSearchAllowedNowCount: runnerRows.filter((row) => row.runnerBroadSearchAllowedNow).length,
      runnerClassifierAllowedNowCount: runnerRows.filter((row) => row.runnerClassifierAllowedNow).length,
      runnerCanonicalWriteAllowedNowCount: runnerRows.filter((row) => row.runnerCanonicalWriteAllowedNow).length,

      laligaRunnerCompetitionCount: runnerRows.filter((row) => row.reusableFamily === "laliga").length,
      norwayNtfRunnerCompetitionCount: runnerRows.filter((row) => row.reusableFamily === "norway_ntf").length,
      sportomediaRunnerCompetitionCount: runnerRows.filter((row) => row.reusableFamily === "sportomedia").length,

      userHintUsedCount: runnerRows.filter((row) => row.userHintUsed).length,
      hardcodedSeasonStateOverrideUsedCount: runnerRows.filter((row) => row.hardcodedSeasonStateOverrideUsed).length,
      validatorReadinessDoesNotImplyActiveCount: runnerRows.filter((row) => row.validatorReadinessDoesNotImplyActive).length,

      executionAllowedNowCount: 0,
      fetchAllowedNowCount: 0,
      searchAllowedNowCount: 0,
      broadSearchAllowedNowCount: 0,
      controlledDiscoveryAllowedNowCount: 0,
      controlledRouteAcquisitionAllowedNowCount: 0,
      classifierAllowedNowCount: 0,
      canonicalPromotionAllowedNowCount: 0,
      canonicalWriteEligibleNowCount: 0,
      truthAssertionsAllowedNowCount: 0,
      activeAssertedCount: 0,
      inactiveAssertedCount: 0,
      completedAssertedCount: 0,
      canonicalWrites: 0,
      productionWrite: false,

      recommendedNextLane: "run_actual_controlled_route_acquisition_runner_quality_gate_no_fetch_no_write"
    },
    counts: {
      byReusableFamily: countBy(runnerRows, "reusableFamily"),
      byRouteAcquisitionType: countBy(runnerRows, "routeAcquisitionType"),
      byRouteScope: countBy(runnerRows, "routeScope"),
      byActualRunnerStatus: countBy(runnerRows, "actualRunnerStatus"),
      byNextAllowedStep: countBy(runnerRows, "nextAllowedStep")
    },
    guardrails: [
      "This job defines the actual controlled route acquisition runner contract only.",
      "It does not execute acquisition.",
      "Fetch remains disabled.",
      "Search remains disabled.",
      "Broad search remains forbidden.",
      "Classifier remains disabled.",
      "Canonical writes remain blocked.",
      "No active/inactive/completed truth is asserted.",
      "No user-provided season-state hints are used.",
      "No hardcoded season-state overrides are used.",
      "Validator readiness must not imply active season state.",
      "No match today must not imply inactive.",
      "Match status alone must not be used as season-state truth.",
      "Zero result must not imply absence."
    ],
    runnerRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    actualControlledRouteAcquisitionRunnerCompetitionCount: output.summary.actualControlledRouteAcquisitionRunnerCompetitionCount,
    actualControlledRouteAcquisitionRunnerDefinedCount: output.summary.actualControlledRouteAcquisitionRunnerDefinedCount,
    actualControlledRouteAcquisitionRunnerBlockedCount: output.summary.actualControlledRouteAcquisitionRunnerBlockedCount,
    runnerMayBePreparedCount: output.summary.runnerMayBePreparedCount,
    runnerExecutionAllowedNowCount: output.summary.runnerExecutionAllowedNowCount,
    runnerFetchAllowedNowCount: output.summary.runnerFetchAllowedNowCount,
    runnerSearchAllowedNowCount: output.summary.runnerSearchAllowedNowCount,
    runnerBroadSearchAllowedNowCount: output.summary.runnerBroadSearchAllowedNowCount,
    runnerClassifierAllowedNowCount: output.summary.runnerClassifierAllowedNowCount,
    runnerCanonicalWriteAllowedNowCount: output.summary.runnerCanonicalWriteAllowedNowCount,
    laligaRunnerCompetitionCount: output.summary.laligaRunnerCompetitionCount,
    norwayNtfRunnerCompetitionCount: output.summary.norwayNtfRunnerCompetitionCount,
    sportomediaRunnerCompetitionCount: output.summary.sportomediaRunnerCompetitionCount,
    userHintUsedCount: output.summary.userHintUsedCount,
    hardcodedSeasonStateOverrideUsedCount: output.summary.hardcodedSeasonStateOverrideUsedCount,
    validatorReadinessDoesNotImplyActiveCount: output.summary.validatorReadinessDoesNotImplyActiveCount,
    executionAllowedNowCount: output.summary.executionAllowedNowCount,
    fetchAllowedNowCount: output.summary.fetchAllowedNowCount,
    searchAllowedNowCount: output.summary.searchAllowedNowCount,
    broadSearchAllowedNowCount: output.summary.broadSearchAllowedNowCount,
    controlledDiscoveryAllowedNowCount: output.summary.controlledDiscoveryAllowedNowCount,
    controlledRouteAcquisitionAllowedNowCount: output.summary.controlledRouteAcquisitionAllowedNowCount,
    classifierAllowedNowCount: output.summary.classifierAllowedNowCount,
    canonicalPromotionAllowedNowCount: output.summary.canonicalPromotionAllowedNowCount,
    canonicalWriteEligibleNowCount: output.summary.canonicalWriteEligibleNowCount,
    truthAssertionsAllowedNowCount: output.summary.truthAssertionsAllowedNowCount,
    activeAssertedCount: output.summary.activeAssertedCount,
    inactiveAssertedCount: output.summary.inactiveAssertedCount,
    completedAssertedCount: output.summary.completedAssertedCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
