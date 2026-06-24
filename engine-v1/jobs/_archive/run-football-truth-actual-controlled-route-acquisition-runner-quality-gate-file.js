#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";
const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/actual-controlled-route-acquisition-runner-2026-06-14/actual-controlled-route-acquisition-runner-2026-06-14.json";
const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/actual-controlled-route-acquisition-runner-quality-gate-2026-06-14/actual-controlled-route-acquisition-runner-quality-gate-2026-06-14.json";

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

function validateRunner(input) {
  const summary = input.summary || {};

  assertSummary(summary, "actualControlledRouteAcquisitionRunnerCompetitionCount", 6);
  assertSummary(summary, "actualControlledRouteAcquisitionRunnerDefinedCount", 6);
  assertSummary(summary, "actualControlledRouteAcquisitionRunnerBlockedCount", 0);
  assertSummary(summary, "runnerMayBePreparedCount", 6);
  assertSummary(summary, "runnerExecutionAllowedNowCount", 0);
  assertSummary(summary, "runnerFetchAllowedNowCount", 0);
  assertSummary(summary, "runnerSearchAllowedNowCount", 0);
  assertSummary(summary, "runnerBroadSearchAllowedNowCount", 0);
  assertSummary(summary, "runnerClassifierAllowedNowCount", 0);
  assertSummary(summary, "runnerCanonicalWriteAllowedNowCount", 0);
  assertSummary(summary, "laligaRunnerCompetitionCount", 2);
  assertSummary(summary, "norwayNtfRunnerCompetitionCount", 2);
  assertSummary(summary, "sportomediaRunnerCompetitionCount", 2);
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

  const rows = Array.isArray(input.runnerRows) ? input.runnerRows : [];
  if (rows.length !== 6) throw new Error("Expected 6 runnerRows, got " + rows.length);

  const slugs = uniqueSorted(rows.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Unexpected runner slugs: " + slugs.join(", "));
  }

  for (const row of rows) {
    if (row.actualRunnerStatus !== "controlled_route_acquisition_runner_defined_execution_disabled") {
      throw new Error(row.competitionSlug + ": actual runner is not defined/execution-disabled");
    }
    if (row.runnerMayBePrepared !== true) {
      throw new Error(row.competitionSlug + ": runnerMayBePrepared must be true");
    }
    if (row.runnerExecutionAllowedNow !== false) throw new Error(row.competitionSlug + ": runner execution must remain false");
    if (row.runnerFetchAllowedNow !== false) throw new Error(row.competitionSlug + ": runner fetch must remain false");
    if (row.runnerSearchAllowedNow !== false) throw new Error(row.competitionSlug + ": runner search must remain false");
    if (row.runnerBroadSearchAllowedNow !== false) throw new Error(row.competitionSlug + ": runner broad search must remain false");
    if (row.runnerClassifierAllowedNow !== false) throw new Error(row.competitionSlug + ": runner classifier must remain false");
    if (row.runnerCanonicalWriteAllowedNow !== false) throw new Error(row.competitionSlug + ": runner canonical write must remain false");

    if (!row.runnerTask || row.runnerTask.allowedCompetitionSlug !== row.competitionSlug) {
      throw new Error(row.competitionSlug + ": runnerTask slug mismatch");
    }
    if (row.runnerTask.allowedRouteScope !== row.routeScope) {
      throw new Error(row.competitionSlug + ": runnerTask route scope mismatch");
    }
    if (row.runnerTask.allowedRouteAcquisitionType !== row.routeAcquisitionType) {
      throw new Error(row.competitionSlug + ": runnerTask route acquisition type mismatch");
    }

    const forbidden = Array.isArray(row.runnerTask.forbiddenOperations) ? row.runnerTask.forbiddenOperations : [];
    for (const requiredForbidden of [
      "broad_search",
      "canonical_write",
      "production_write",
      "season_state_truth_assertion",
      "classifier_execution",
      "zero_result_as_absence",
      "user_hint_as_truth",
      "hardcoded_season_state_override"
    ]) {
      if (!forbidden.includes(requiredForbidden)) {
        throw new Error(row.competitionSlug + ": missing forbidden operation " + requiredForbidden);
      }
    }

    if (row.userHintUsed !== false || row.hardcodedSeasonStateOverrideUsed !== false) {
      throw new Error(row.competitionSlug + ": hints/overrides must remain false");
    }
    if (row.fetchAllowedNow !== false || row.searchAllowedNow !== false || row.broadSearchAllowedNow !== false) {
      throw new Error(row.competitionSlug + ": fetch/search/broadSearch must remain false");
    }
    if (row.canonicalWriteEligibleNow !== false || row.canonicalWrites !== 0 || row.productionWrite !== false) {
      throw new Error(row.competitionSlug + ": write flags must remain blocked");
    }
  }

  return rows;
}

function gateRow(row) {
  const requiredOutputs = Array.isArray(row.runnerTask?.requiredOutputsBeforeClassifier)
    ? row.runnerTask.requiredOutputsBeforeClassifier
    : [];

  const forbiddenOps = Array.isArray(row.runnerTask?.forbiddenOperations)
    ? row.runnerTask.forbiddenOperations
    : [];

  const runnerContractComplete =
    row.actualRunnerStatus === "controlled_route_acquisition_runner_defined_execution_disabled" &&
    row.runnerTask &&
    row.runnerTask.taskType === "season_state_evidence_acquisition" &&
    row.runnerTask.allowedCompetitionSlug === row.competitionSlug &&
    row.runnerTask.allowedRouteScope === row.routeScope &&
    row.runnerTask.allowedRouteAcquisitionType === row.routeAcquisitionType &&
    row.runnerTask.allowedReusableFamily === row.reusableFamily &&
    requiredOutputs.length >= 4 &&
    forbiddenOps.length >= 8;

  const blockingReasons = [];
  if (!runnerContractComplete) blockingReasons.push("runner_contract_incomplete");
  if (row.runnerExecutionAllowedNow !== false) blockingReasons.push("runner_execution_allowed_now_not_false");
  if (row.runnerFetchAllowedNow !== false) blockingReasons.push("runner_fetch_allowed_now_not_false");
  if (row.runnerSearchAllowedNow !== false) blockingReasons.push("runner_search_allowed_now_not_false");
  if (row.runnerBroadSearchAllowedNow !== false) blockingReasons.push("runner_broad_search_allowed_now_not_false");
  if (row.runnerClassifierAllowedNow !== false) blockingReasons.push("runner_classifier_allowed_now_not_false");
  if (row.runnerCanonicalWriteAllowedNow !== false) blockingReasons.push("runner_canonical_write_allowed_now_not_false");
  if (row.userHintUsed !== false) blockingReasons.push("user_hint_used");
  if (row.hardcodedSeasonStateOverrideUsed !== false) blockingReasons.push("hardcoded_override_used");

  const qualityGateStatus =
    blockingReasons.length === 0
      ? "passed_actual_runner_contract_execution_still_disabled"
      : "blocked_actual_runner_quality_gate";

  return {
    competitionSlug: row.competitionSlug,
    reusableFamily: row.reusableFamily,
    routeAcquisitionType: row.routeAcquisitionType,
    routeScope: row.routeScope,
    actualRunnerStatus: row.actualRunnerStatus,
    qualityGateStatus,
    blockingReasons,

    runnerContractComplete,
    requiredOutputsBeforeClassifierCount: requiredOutputs.length,
    forbiddenOperationCount: forbiddenOps.length,

    mayPrepareExplicitExecutionApproval: qualityGateStatus === "passed_actual_runner_contract_execution_still_disabled",
    mayExecuteRunnerNow: false,
    mayFetchNow: false,
    maySearchNow: false,
    mayBroadSearchNow: false,
    mayClassifySeasonStateNow: false,
    mayWriteCanonicalNow: false,

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
    zeroResultDoesNotImplyAbsence: true,

    nextAllowedStep: "prepare_explicit_actual_controlled_route_acquisition_execution_approval_no_broad_search_no_write",
    nextBlockedStep: "runner_execution_fetch_classifier_and_canonical_write_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const input = readJson(args.input);
  const runnerRows = validateRunner(input);

  const qualityGateRows = runnerRows
    .map(gateRow)
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const passedRows = qualityGateRows.filter((row) => row.qualityGateStatus === "passed_actual_runner_contract_execution_still_disabled");
  const blockedRows = qualityGateRows.filter((row) => row.qualityGateStatus === "blocked_actual_runner_quality_gate");

  if (blockedRows.length !== 0) {
    throw new Error("Actual runner quality gate blocked rows: " + blockedRows.map((row) => row.competitionSlug).join(", "));
  }

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "run-football-truth-actual-controlled-route-acquisition-runner-quality-gate-file",
    mode: "quality_gate_for_actual_controlled_route_acquisition_runner_contract_execution_still_disabled",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      actualControlledRouteAcquisitionRunner: args.input
    },
    summary: {
      actualControlledRouteAcquisitionRunnerQualityGateCompetitionCount: qualityGateRows.length,
      actualControlledRouteAcquisitionRunnerQualityGatePassedCount: passedRows.length,
      actualControlledRouteAcquisitionRunnerQualityGateBlockedCount: blockedRows.length,

      runnerContractCompleteCount: qualityGateRows.filter((row) => row.runnerContractComplete).length,
      mayPrepareExplicitExecutionApprovalCount: qualityGateRows.filter((row) => row.mayPrepareExplicitExecutionApproval).length,
      mayExecuteRunnerNowCount: qualityGateRows.filter((row) => row.mayExecuteRunnerNow).length,
      mayFetchNowCount: qualityGateRows.filter((row) => row.mayFetchNow).length,
      maySearchNowCount: qualityGateRows.filter((row) => row.maySearchNow).length,
      mayBroadSearchNowCount: qualityGateRows.filter((row) => row.mayBroadSearchNow).length,
      mayClassifySeasonStateNowCount: qualityGateRows.filter((row) => row.mayClassifySeasonStateNow).length,
      mayWriteCanonicalNowCount: qualityGateRows.filter((row) => row.mayWriteCanonicalNow).length,

      laligaQualityGateCompetitionCount: qualityGateRows.filter((row) => row.reusableFamily === "laliga").length,
      norwayNtfQualityGateCompetitionCount: qualityGateRows.filter((row) => row.reusableFamily === "norway_ntf").length,
      sportomediaQualityGateCompetitionCount: qualityGateRows.filter((row) => row.reusableFamily === "sportomedia").length,

      userHintUsedCount: qualityGateRows.filter((row) => row.userHintUsed).length,
      hardcodedSeasonStateOverrideUsedCount: qualityGateRows.filter((row) => row.hardcodedSeasonStateOverrideUsed).length,
      validatorReadinessDoesNotImplyActiveCount: qualityGateRows.filter((row) => row.validatorReadinessDoesNotImplyActive).length,

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

      recommendedNextLane: "prepare_explicit_actual_controlled_route_acquisition_execution_approval_no_broad_search_no_write"
    },
    counts: {
      byReusableFamily: countBy(qualityGateRows, "reusableFamily"),
      byRouteAcquisitionType: countBy(qualityGateRows, "routeAcquisitionType"),
      byRouteScope: countBy(qualityGateRows, "routeScope"),
      byQualityGateStatus: countBy(qualityGateRows, "qualityGateStatus"),
      byNextAllowedStep: countBy(qualityGateRows, "nextAllowedStep")
    },
    guardrails: [
      "This quality gate validates the actual runner contract only.",
      "Runner execution remains disabled.",
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
    qualityGateRows,
    blockedRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    actualControlledRouteAcquisitionRunnerQualityGateCompetitionCount: output.summary.actualControlledRouteAcquisitionRunnerQualityGateCompetitionCount,
    actualControlledRouteAcquisitionRunnerQualityGatePassedCount: output.summary.actualControlledRouteAcquisitionRunnerQualityGatePassedCount,
    actualControlledRouteAcquisitionRunnerQualityGateBlockedCount: output.summary.actualControlledRouteAcquisitionRunnerQualityGateBlockedCount,
    runnerContractCompleteCount: output.summary.runnerContractCompleteCount,
    mayPrepareExplicitExecutionApprovalCount: output.summary.mayPrepareExplicitExecutionApprovalCount,
    mayExecuteRunnerNowCount: output.summary.mayExecuteRunnerNowCount,
    mayFetchNowCount: output.summary.mayFetchNowCount,
    maySearchNowCount: output.summary.maySearchNowCount,
    mayBroadSearchNowCount: output.summary.mayBroadSearchNowCount,
    mayClassifySeasonStateNowCount: output.summary.mayClassifySeasonStateNowCount,
    mayWriteCanonicalNowCount: output.summary.mayWriteCanonicalNowCount,
    laligaQualityGateCompetitionCount: output.summary.laligaQualityGateCompetitionCount,
    norwayNtfQualityGateCompetitionCount: output.summary.norwayNtfQualityGateCompetitionCount,
    sportomediaQualityGateCompetitionCount: output.summary.sportomediaQualityGateCompetitionCount,
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
