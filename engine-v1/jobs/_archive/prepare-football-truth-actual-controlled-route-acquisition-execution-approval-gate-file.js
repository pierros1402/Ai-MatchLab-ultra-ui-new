#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";
const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/actual-controlled-route-acquisition-runner-quality-gate-2026-06-14/actual-controlled-route-acquisition-runner-quality-gate-2026-06-14.json";
const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/actual-controlled-route-acquisition-execution-approval-gate-2026-06-14/actual-controlled-route-acquisition-execution-approval-gate-2026-06-14.json";

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

function validateActualRunnerQualityGate(input) {
  const summary = input.summary || {};

  assertSummary(summary, "actualControlledRouteAcquisitionRunnerQualityGateCompetitionCount", 6);
  assertSummary(summary, "actualControlledRouteAcquisitionRunnerQualityGatePassedCount", 6);
  assertSummary(summary, "actualControlledRouteAcquisitionRunnerQualityGateBlockedCount", 0);
  assertSummary(summary, "runnerContractCompleteCount", 6);
  assertSummary(summary, "mayPrepareExplicitExecutionApprovalCount", 6);
  assertSummary(summary, "mayExecuteRunnerNowCount", 0);
  assertSummary(summary, "mayFetchNowCount", 0);
  assertSummary(summary, "maySearchNowCount", 0);
  assertSummary(summary, "mayBroadSearchNowCount", 0);
  assertSummary(summary, "mayClassifySeasonStateNowCount", 0);
  assertSummary(summary, "mayWriteCanonicalNowCount", 0);
  assertSummary(summary, "laligaQualityGateCompetitionCount", 2);
  assertSummary(summary, "norwayNtfQualityGateCompetitionCount", 2);
  assertSummary(summary, "sportomediaQualityGateCompetitionCount", 2);
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

  const rows = Array.isArray(input.qualityGateRows) ? input.qualityGateRows : [];
  if (rows.length !== 6) throw new Error("Expected 6 qualityGateRows, got " + rows.length);

  const slugs = uniqueSorted(rows.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Unexpected quality gate slugs: " + slugs.join(", "));
  }

  for (const row of rows) {
    if (row.qualityGateStatus !== "passed_actual_runner_contract_execution_still_disabled") {
      throw new Error(row.competitionSlug + ": actual runner quality gate did not pass");
    }
    if (row.runnerContractComplete !== true) {
      throw new Error(row.competitionSlug + ": runnerContractComplete must be true");
    }
    if (row.mayPrepareExplicitExecutionApproval !== true) {
      throw new Error(row.competitionSlug + ": mayPrepareExplicitExecutionApproval must be true");
    }
    if (row.mayExecuteRunnerNow !== false) throw new Error(row.competitionSlug + ": execute-now must remain false");
    if (row.mayFetchNow !== false) throw new Error(row.competitionSlug + ": fetch-now must remain false");
    if (row.maySearchNow !== false) throw new Error(row.competitionSlug + ": search-now must remain false");
    if (row.mayBroadSearchNow !== false) throw new Error(row.competitionSlug + ": broad-search-now must remain false");
    if (row.mayClassifySeasonStateNow !== false) throw new Error(row.competitionSlug + ": classifier-now must remain false");
    if (row.mayWriteCanonicalNow !== false) throw new Error(row.competitionSlug + ": canonical-write-now must remain false");
    if (row.userHintUsed !== false || row.hardcodedSeasonStateOverrideUsed !== false) {
      throw new Error(row.competitionSlug + ": hints/overrides must remain false");
    }
  }

  return rows;
}

function approvalRow(row) {
  return {
    competitionSlug: row.competitionSlug,
    reusableFamily: row.reusableFamily,
    routeAcquisitionType: row.routeAcquisitionType,
    routeScope: row.routeScope,
    sourceQualityGateStatus: row.qualityGateStatus,

    executionApprovalGateStatus: "eligible_for_next_step_explicit_controlled_acquisition_execution_but_not_executed_now",
    executionApprovalScope: "actual_controlled_route_acquisition_only_no_broad_search_no_classifier_no_canonical_write",
    executionApprovalFinding: "runner_contract_passed_and_can_be_enabled_only_by_next_explicit_execution_runner",

    mayBuildExecutableControlledAcquisitionRunner: true,
    mayExecuteRunnerNow: false,
    mayFetchNow: false,
    maySearchNow: false,
    mayBroadSearchNow: false,
    mayClassifySeasonStateNow: false,
    mayWriteCanonicalNow: false,

    nextExecutionRunnerMayAllowControlledRouteAcquisition: true,
    nextExecutionRunnerMustRemainScopedToCompetition: row.competitionSlug,
    nextExecutionRunnerMustRemainScopedToRouteScope: row.routeScope,
    nextExecutionRunnerMustRemainScopedToRouteAcquisitionType: row.routeAcquisitionType,

    nextExecutionRunnerRequiredGuards: [
      "allowed competition slug must exactly match this approval row",
      "allowed route scope must exactly match this approval row",
      "allowed route acquisition type must exactly match this approval row",
      "broad search must remain false",
      "canonical writes must remain false",
      "production writes must remain false",
      "classifier must remain false",
      "truth assertions must remain false",
      "zero result must not imply absence",
      "match status alone must not imply season state",
      "user hint must not be used as truth",
      "hardcoded season-state override must not be used"
    ],

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

    nextAllowedStep: "build_scoped_controlled_route_acquisition_execution_runner_no_broad_search_no_write_no_classifier",
    nextBlockedStep: "broad_search_classifier_truth_assertions_canonical_write_and_production_write_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const input = readJson(args.input);
  const sourceRows = validateActualRunnerQualityGate(input);

  const approvalRows = sourceRows
    .map(approvalRow)
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "prepare-football-truth-actual-controlled-route-acquisition-execution-approval-gate-file",
    mode: "prepare_explicit_execution_approval_for_actual_controlled_route_acquisition_no_fetch_now_no_search_no_write_no_classifier",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      actualControlledRouteAcquisitionRunnerQualityGate: args.input
    },
    summary: {
      actualControlledRouteAcquisitionExecutionApprovalGateCompetitionCount: approvalRows.length,
      actualControlledRouteAcquisitionExecutionApprovalEligibleCount: approvalRows.filter((row) =>
        row.executionApprovalGateStatus === "eligible_for_next_step_explicit_controlled_acquisition_execution_but_not_executed_now"
      ).length,
      actualControlledRouteAcquisitionExecutionApprovalBlockedCount: 0,

      mayBuildExecutableControlledAcquisitionRunnerCount: approvalRows.filter((row) => row.mayBuildExecutableControlledAcquisitionRunner).length,
      nextExecutionRunnerMayAllowControlledRouteAcquisitionCount: approvalRows.filter((row) => row.nextExecutionRunnerMayAllowControlledRouteAcquisition).length,

      mayExecuteRunnerNowCount: approvalRows.filter((row) => row.mayExecuteRunnerNow).length,
      mayFetchNowCount: approvalRows.filter((row) => row.mayFetchNow).length,
      maySearchNowCount: approvalRows.filter((row) => row.maySearchNow).length,
      mayBroadSearchNowCount: approvalRows.filter((row) => row.mayBroadSearchNow).length,
      mayClassifySeasonStateNowCount: approvalRows.filter((row) => row.mayClassifySeasonStateNow).length,
      mayWriteCanonicalNowCount: approvalRows.filter((row) => row.mayWriteCanonicalNow).length,

      laligaExecutionApprovalCompetitionCount: approvalRows.filter((row) => row.reusableFamily === "laliga").length,
      norwayNtfExecutionApprovalCompetitionCount: approvalRows.filter((row) => row.reusableFamily === "norway_ntf").length,
      sportomediaExecutionApprovalCompetitionCount: approvalRows.filter((row) => row.reusableFamily === "sportomedia").length,

      userHintUsedCount: approvalRows.filter((row) => row.userHintUsed).length,
      hardcodedSeasonStateOverrideUsedCount: approvalRows.filter((row) => row.hardcodedSeasonStateOverrideUsed).length,
      validatorReadinessDoesNotImplyActiveCount: approvalRows.filter((row) => row.validatorReadinessDoesNotImplyActive).length,

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

      recommendedNextLane: "build_scoped_controlled_route_acquisition_execution_runner_no_broad_search_no_write_no_classifier"
    },
    counts: {
      byReusableFamily: countBy(approvalRows, "reusableFamily"),
      byRouteAcquisitionType: countBy(approvalRows, "routeAcquisitionType"),
      byRouteScope: countBy(approvalRows, "routeScope"),
      byExecutionApprovalGateStatus: countBy(approvalRows, "executionApprovalGateStatus"),
      byNextAllowedStep: countBy(approvalRows, "nextAllowedStep")
    },
    guardrails: [
      "This approval gate does not execute acquisition.",
      "It only authorizes building the next scoped controlled route acquisition execution runner.",
      "Fetch remains disabled now.",
      "Search remains disabled now.",
      "Broad search remains forbidden.",
      "Classifier remains disabled.",
      "Canonical writes remain blocked.",
      "Production writes remain blocked.",
      "No active/inactive/completed truth is asserted.",
      "No user-provided season-state hints are used.",
      "No hardcoded season-state overrides are used.",
      "Validator readiness must not imply active season state.",
      "No match today must not imply inactive.",
      "Match status alone must not be used as season-state truth.",
      "Zero result must not imply absence."
    ],
    approvalRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    actualControlledRouteAcquisitionExecutionApprovalGateCompetitionCount: output.summary.actualControlledRouteAcquisitionExecutionApprovalGateCompetitionCount,
    actualControlledRouteAcquisitionExecutionApprovalEligibleCount: output.summary.actualControlledRouteAcquisitionExecutionApprovalEligibleCount,
    actualControlledRouteAcquisitionExecutionApprovalBlockedCount: output.summary.actualControlledRouteAcquisitionExecutionApprovalBlockedCount,
    mayBuildExecutableControlledAcquisitionRunnerCount: output.summary.mayBuildExecutableControlledAcquisitionRunnerCount,
    nextExecutionRunnerMayAllowControlledRouteAcquisitionCount: output.summary.nextExecutionRunnerMayAllowControlledRouteAcquisitionCount,
    mayExecuteRunnerNowCount: output.summary.mayExecuteRunnerNowCount,
    mayFetchNowCount: output.summary.mayFetchNowCount,
    maySearchNowCount: output.summary.maySearchNowCount,
    mayBroadSearchNowCount: output.summary.mayBroadSearchNowCount,
    mayClassifySeasonStateNowCount: output.summary.mayClassifySeasonStateNowCount,
    mayWriteCanonicalNowCount: output.summary.mayWriteCanonicalNowCount,
    laligaExecutionApprovalCompetitionCount: output.summary.laligaExecutionApprovalCompetitionCount,
    norwayNtfExecutionApprovalCompetitionCount: output.summary.norwayNtfExecutionApprovalCompetitionCount,
    sportomediaExecutionApprovalCompetitionCount: output.summary.sportomediaExecutionApprovalCompetitionCount,
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
