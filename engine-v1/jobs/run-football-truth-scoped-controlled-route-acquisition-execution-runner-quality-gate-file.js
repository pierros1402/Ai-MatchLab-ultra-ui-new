#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";
const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/scoped-controlled-route-acquisition-execution-runner-2026-06-14/scoped-controlled-route-acquisition-execution-runner-2026-06-14.json";
const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/scoped-controlled-route-acquisition-execution-runner-quality-gate-2026-06-14/scoped-controlled-route-acquisition-execution-runner-quality-gate-2026-06-14.json";

const EXPECTED_SLUGS = ["esp.1", "esp.2", "nor.1", "nor.2", "swe.1", "swe.2"];

const REQUIRED_DISALLOWED = [
  "broad_search",
  "search_provider_discovery",
  "canonical_write",
  "production_write",
  "season_state_classifier",
  "truth_assertion",
  "user_hint_as_truth",
  "hardcoded_season_state_override",
  "zero_result_as_absence"
];

const REQUIRED_EVIDENCE_FIELDS = [
  "competitionSlug",
  "reusableFamily",
  "routeScope",
  "routeAcquisitionType",
  "sourceReference",
  "seasonMarkerEvidence",
  "fixtureResultEvidence",
  "standingsEvidence",
  "completedOrInactiveEvidence",
  "restartDateEvidenceWhenApplicable"
];

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

function validateScopedRunner(input) {
  const summary = input.summary || {};

  assertSummary(summary, "scopedControlledRouteAcquisitionExecutionRunnerCompetitionCount", 6);
  assertSummary(summary, "scopedControlledRouteAcquisitionExecutionRunnerDefinedCount", 6);
  assertSummary(summary, "scopedControlledRouteAcquisitionExecutionRunnerBlockedCount", 0);
  assertSummary(summary, "runnerWouldAllowControlledRouteAcquisitionWhenExplicitlyExecutedCount", 6);
  assertSummary(summary, "runnerWouldFetchConfiguredRouteWhenExplicitlyExecutedCount", 6);
  assertSummary(summary, "runnerWouldSearchWhenExplicitlyExecutedCount", 0);
  assertSummary(summary, "runnerWouldBroadSearchWhenExplicitlyExecutedCount", 0);
  assertSummary(summary, "runnerWouldClassifySeasonStateWhenExplicitlyExecutedCount", 0);
  assertSummary(summary, "runnerWouldWriteCanonicalWhenExplicitlyExecutedCount", 0);

  assertSummary(summary, "executionRunnerBuiltNowCount", 6);
  assertSummary(summary, "executionRunnerExecutedNowCount", 0);
  assertSummary(summary, "evidenceAcquisitionExecutedNowCount", 0);
  assertSummary(summary, "fetchExecutedNowCount", 0);
  assertSummary(summary, "searchExecutedNowCount", 0);
  assertSummary(summary, "broadSearchExecutedNowCount", 0);
  assertSummary(summary, "classifierExecutedNowCount", 0);
  assertSummary(summary, "canonicalWriteExecutedNowCount", 0);
  assertSummary(summary, "productionWriteExecutedNowCount", 0);

  assertSummary(summary, "laligaExecutionRunnerCompetitionCount", 2);
  assertSummary(summary, "norwayNtfExecutionRunnerCompetitionCount", 2);
  assertSummary(summary, "sportomediaExecutionRunnerCompetitionCount", 2);
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

  const rows = Array.isArray(input.executionRunnerRows) ? input.executionRunnerRows : [];
  if (rows.length !== 6) throw new Error("Expected 6 executionRunnerRows, got " + rows.length);

  const slugs = uniqueSorted(rows.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Unexpected scoped runner slugs: " + slugs.join(", "));
  }

  for (const row of rows) {
    if (row.scopedExecutionRunnerStatus !== "scoped_controlled_route_acquisition_execution_runner_defined_not_executed") {
      throw new Error(row.competitionSlug + ": scoped execution runner status mismatch");
    }
    if (row.scopedExecutionRunnerMode !== "controlled_route_evidence_acquisition_only_no_broad_search_no_write_no_classifier") {
      throw new Error(row.competitionSlug + ": scoped execution runner mode mismatch");
    }
    if (row.scopedExecutionRunnerScopeStatus !== "scope_locked_to_single_competition_family_and_route") {
      throw new Error(row.competitionSlug + ": scope lock status mismatch");
    }

    if (row.runnerWouldAllowControlledRouteAcquisitionWhenExplicitlyExecuted !== true) {
      throw new Error(row.competitionSlug + ": future controlled route acquisition capability must be true");
    }
    if (row.runnerWouldFetchConfiguredRouteWhenExplicitlyExecuted !== true) {
      throw new Error(row.competitionSlug + ": future configured route fetch capability must be true");
    }
    if (row.runnerWouldSearchWhenExplicitlyExecuted !== false) throw new Error(row.competitionSlug + ": future search must be false");
    if (row.runnerWouldBroadSearchWhenExplicitlyExecuted !== false) throw new Error(row.competitionSlug + ": future broad search must be false");
    if (row.runnerWouldClassifySeasonStateWhenExplicitlyExecuted !== false) throw new Error(row.competitionSlug + ": future classifier must be false");
    if (row.runnerWouldWriteCanonicalWhenExplicitlyExecuted !== false) throw new Error(row.competitionSlug + ": future canonical write must be false");
    if (row.runnerWouldWriteProductionWhenExplicitlyExecuted !== false) throw new Error(row.competitionSlug + ": future production write must be false");

    for (const executedKey of [
      "executionRunnerExecutedNow",
      "evidenceAcquisitionExecutedNow",
      "fetchExecutedNow",
      "searchExecutedNow",
      "broadSearchExecutedNow",
      "classifierExecutedNow",
      "canonicalWriteExecutedNow",
      "productionWriteExecutedNow"
    ]) {
      if (row[executedKey] !== false) throw new Error(row.competitionSlug + ": " + executedKey + " must be false");
    }

    const scope = row.lockedExecutionScope || {};
    if (scope.allowedCompetitionSlug !== row.competitionSlug) throw new Error(row.competitionSlug + ": locked slug mismatch");
    if (scope.allowedReusableFamily !== row.reusableFamily) throw new Error(row.competitionSlug + ": locked family mismatch");
    if (scope.allowedRouteScope !== row.routeScope) throw new Error(row.competitionSlug + ": locked route scope mismatch");
    if (scope.allowedRouteAcquisitionType !== row.routeAcquisitionType) {
      throw new Error(row.competitionSlug + ": locked route acquisition type mismatch");
    }

    const disallowed = Array.isArray(scope.disallowedOperations) ? scope.disallowedOperations : [];
    for (const item of REQUIRED_DISALLOWED) {
      if (!disallowed.includes(item)) throw new Error(row.competitionSlug + ": missing disallowed operation " + item);
    }

    const fields = Array.isArray(scope.requiredEvidenceOutputFields) ? scope.requiredEvidenceOutputFields : [];
    for (const item of REQUIRED_EVIDENCE_FIELDS) {
      if (!fields.includes(item)) throw new Error(row.competitionSlug + ": missing required evidence output field " + item);
    }

    if (row.fetchAllowedNow !== false || row.searchAllowedNow !== false || row.broadSearchAllowedNow !== false) {
      throw new Error(row.competitionSlug + ": allowed-now fetch/search/broadSearch must remain false");
    }
    if (row.controlledRouteAcquisitionAllowedNow !== false || row.classifierAllowedNow !== false) {
      throw new Error(row.competitionSlug + ": acquisition/classifier allowed-now must remain false");
    }
    if (row.canonicalWriteEligibleNow !== false || row.canonicalWrites !== 0 || row.productionWrite !== false) {
      throw new Error(row.competitionSlug + ": write flags must remain blocked");
    }
    if (row.userHintUsed !== false || row.hardcodedSeasonStateOverrideUsed !== false) {
      throw new Error(row.competitionSlug + ": hints/overrides must remain false");
    }
  }

  return rows;
}

function qualityGateRow(row) {
  const scope = row.lockedExecutionScope || {};
  const disallowed = Array.isArray(scope.disallowedOperations) ? scope.disallowedOperations : [];
  const fields = Array.isArray(scope.requiredEvidenceOutputFields) ? scope.requiredEvidenceOutputFields : [];

  const scopedRunnerContractComplete =
    row.scopedExecutionRunnerStatus === "scoped_controlled_route_acquisition_execution_runner_defined_not_executed" &&
    row.scopedExecutionRunnerMode === "controlled_route_evidence_acquisition_only_no_broad_search_no_write_no_classifier" &&
    row.scopedExecutionRunnerScopeStatus === "scope_locked_to_single_competition_family_and_route" &&
    scope.allowedCompetitionSlug === row.competitionSlug &&
    scope.allowedReusableFamily === row.reusableFamily &&
    scope.allowedRouteScope === row.routeScope &&
    scope.allowedRouteAcquisitionType === row.routeAcquisitionType &&
    REQUIRED_DISALLOWED.every((item) => disallowed.includes(item)) &&
    REQUIRED_EVIDENCE_FIELDS.every((item) => fields.includes(item));

  const blockingReasons = [];
  if (!scopedRunnerContractComplete) blockingReasons.push("scoped_runner_contract_incomplete");
  if (row.runnerWouldSearchWhenExplicitlyExecuted !== false) blockingReasons.push("runner_would_search");
  if (row.runnerWouldBroadSearchWhenExplicitlyExecuted !== false) blockingReasons.push("runner_would_broad_search");
  if (row.runnerWouldClassifySeasonStateWhenExplicitlyExecuted !== false) blockingReasons.push("runner_would_classify");
  if (row.runnerWouldWriteCanonicalWhenExplicitlyExecuted !== false) blockingReasons.push("runner_would_write_canonical");
  if (row.runnerWouldWriteProductionWhenExplicitlyExecuted !== false) blockingReasons.push("runner_would_write_production");
  if (row.executionRunnerExecutedNow !== false) blockingReasons.push("runner_executed_now");
  if (row.fetchExecutedNow !== false) blockingReasons.push("fetch_executed_now");
  if (row.canonicalWriteExecutedNow !== false) blockingReasons.push("canonical_write_executed_now");
  if (row.userHintUsed !== false) blockingReasons.push("user_hint_used");
  if (row.hardcodedSeasonStateOverrideUsed !== false) blockingReasons.push("hardcoded_override_used");

  const qualityGateStatus =
    blockingReasons.length === 0
      ? "passed_scoped_execution_runner_contract_not_executed"
      : "blocked_scoped_execution_runner_quality_gate";

  return {
    competitionSlug: row.competitionSlug,
    reusableFamily: row.reusableFamily,
    routeAcquisitionType: row.routeAcquisitionType,
    routeScope: row.routeScope,
    scopedExecutionRunnerStatus: row.scopedExecutionRunnerStatus,
    qualityGateStatus,
    blockingReasons,

    scopedRunnerContractComplete,
    mayPrepareFinalExplicitExecutionRun: qualityGateStatus === "passed_scoped_execution_runner_contract_not_executed",
    mayExecuteRunnerNow: false,
    mayFetchNow: false,
    maySearchNow: false,
    mayBroadSearchNow: false,
    mayClassifySeasonStateNow: false,
    mayWriteCanonicalNow: false,

    runnerWouldAllowControlledRouteAcquisitionWhenExplicitlyExecuted: row.runnerWouldAllowControlledRouteAcquisitionWhenExplicitlyExecuted,
    runnerWouldFetchConfiguredRouteWhenExplicitlyExecuted: row.runnerWouldFetchConfiguredRouteWhenExplicitlyExecuted,
    runnerWouldSearchWhenExplicitlyExecuted: row.runnerWouldSearchWhenExplicitlyExecuted,
    runnerWouldBroadSearchWhenExplicitlyExecuted: row.runnerWouldBroadSearchWhenExplicitlyExecuted,
    runnerWouldClassifySeasonStateWhenExplicitlyExecuted: row.runnerWouldClassifySeasonStateWhenExplicitlyExecuted,
    runnerWouldWriteCanonicalWhenExplicitlyExecuted: row.runnerWouldWriteCanonicalWhenExplicitlyExecuted,

    executionRunnerExecutedNow: false,
    evidenceAcquisitionExecutedNow: false,
    fetchExecutedNow: false,
    searchExecutedNow: false,
    broadSearchExecutedNow: false,
    classifierExecutedNow: false,
    canonicalWriteExecutedNow: false,
    productionWriteExecutedNow: false,

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

    nextAllowedStep: "prepare_final_explicit_scoped_controlled_route_acquisition_run_approval_no_broad_search_no_write_no_classifier",
    nextBlockedStep: "actual_execution_fetch_and_evidence_acquisition_blocked_until_final_explicit_run"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const input = readJson(args.input);
  const runnerRows = validateScopedRunner(input);

  const qualityGateRows = runnerRows
    .map(qualityGateRow)
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const passedRows = qualityGateRows.filter((row) => row.qualityGateStatus === "passed_scoped_execution_runner_contract_not_executed");
  const blockedRows = qualityGateRows.filter((row) => row.qualityGateStatus === "blocked_scoped_execution_runner_quality_gate");

  if (blockedRows.length !== 0) {
    throw new Error("Scoped execution runner quality gate blocked rows: " + blockedRows.map((row) => row.competitionSlug).join(", "));
  }

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "run-football-truth-scoped-controlled-route-acquisition-execution-runner-quality-gate-file",
    mode: "quality_gate_for_scoped_controlled_route_acquisition_execution_runner_not_executed",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      scopedControlledRouteAcquisitionExecutionRunner: args.input
    },
    summary: {
      scopedExecutionRunnerQualityGateCompetitionCount: qualityGateRows.length,
      scopedExecutionRunnerQualityGatePassedCount: passedRows.length,
      scopedExecutionRunnerQualityGateBlockedCount: blockedRows.length,
      scopedRunnerContractCompleteCount: qualityGateRows.filter((row) => row.scopedRunnerContractComplete).length,
      mayPrepareFinalExplicitExecutionRunCount: qualityGateRows.filter((row) => row.mayPrepareFinalExplicitExecutionRun).length,

      mayExecuteRunnerNowCount: qualityGateRows.filter((row) => row.mayExecuteRunnerNow).length,
      mayFetchNowCount: qualityGateRows.filter((row) => row.mayFetchNow).length,
      maySearchNowCount: qualityGateRows.filter((row) => row.maySearchNow).length,
      mayBroadSearchNowCount: qualityGateRows.filter((row) => row.mayBroadSearchNow).length,
      mayClassifySeasonStateNowCount: qualityGateRows.filter((row) => row.mayClassifySeasonStateNow).length,
      mayWriteCanonicalNowCount: qualityGateRows.filter((row) => row.mayWriteCanonicalNow).length,

      runnerWouldAllowControlledRouteAcquisitionWhenExplicitlyExecutedCount: qualityGateRows.filter((row) =>
        row.runnerWouldAllowControlledRouteAcquisitionWhenExplicitlyExecuted
      ).length,
      runnerWouldFetchConfiguredRouteWhenExplicitlyExecutedCount: qualityGateRows.filter((row) =>
        row.runnerWouldFetchConfiguredRouteWhenExplicitlyExecuted
      ).length,
      runnerWouldSearchWhenExplicitlyExecutedCount: qualityGateRows.filter((row) => row.runnerWouldSearchWhenExplicitlyExecuted).length,
      runnerWouldBroadSearchWhenExplicitlyExecutedCount: qualityGateRows.filter((row) => row.runnerWouldBroadSearchWhenExplicitlyExecuted).length,
      runnerWouldClassifySeasonStateWhenExplicitlyExecutedCount: qualityGateRows.filter((row) =>
        row.runnerWouldClassifySeasonStateWhenExplicitlyExecuted
      ).length,
      runnerWouldWriteCanonicalWhenExplicitlyExecutedCount: qualityGateRows.filter((row) =>
        row.runnerWouldWriteCanonicalWhenExplicitlyExecuted
      ).length,

      executionRunnerExecutedNowCount: qualityGateRows.filter((row) => row.executionRunnerExecutedNow).length,
      evidenceAcquisitionExecutedNowCount: qualityGateRows.filter((row) => row.evidenceAcquisitionExecutedNow).length,
      fetchExecutedNowCount: qualityGateRows.filter((row) => row.fetchExecutedNow).length,
      searchExecutedNowCount: qualityGateRows.filter((row) => row.searchExecutedNow).length,
      broadSearchExecutedNowCount: qualityGateRows.filter((row) => row.broadSearchExecutedNow).length,
      classifierExecutedNowCount: qualityGateRows.filter((row) => row.classifierExecutedNow).length,
      canonicalWriteExecutedNowCount: qualityGateRows.filter((row) => row.canonicalWriteExecutedNow).length,
      productionWriteExecutedNowCount: qualityGateRows.filter((row) => row.productionWriteExecutedNow).length,

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

      recommendedNextLane: "prepare_final_explicit_scoped_controlled_route_acquisition_run_approval_no_broad_search_no_write_no_classifier"
    },
    counts: {
      byReusableFamily: countBy(qualityGateRows, "reusableFamily"),
      byRouteAcquisitionType: countBy(qualityGateRows, "routeAcquisitionType"),
      byRouteScope: countBy(qualityGateRows, "routeScope"),
      byQualityGateStatus: countBy(qualityGateRows, "qualityGateStatus"),
      byNextAllowedStep: countBy(qualityGateRows, "nextAllowedStep")
    },
    guardrails: [
      "This quality gate validates the scoped execution runner contract only.",
      "The scoped execution runner is not executed.",
      "Fetch is not executed.",
      "Search is not executed.",
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
    qualityGateRows,
    blockedRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    scopedExecutionRunnerQualityGateCompetitionCount: output.summary.scopedExecutionRunnerQualityGateCompetitionCount,
    scopedExecutionRunnerQualityGatePassedCount: output.summary.scopedExecutionRunnerQualityGatePassedCount,
    scopedExecutionRunnerQualityGateBlockedCount: output.summary.scopedExecutionRunnerQualityGateBlockedCount,
    scopedRunnerContractCompleteCount: output.summary.scopedRunnerContractCompleteCount,
    mayPrepareFinalExplicitExecutionRunCount: output.summary.mayPrepareFinalExplicitExecutionRunCount,
    mayExecuteRunnerNowCount: output.summary.mayExecuteRunnerNowCount,
    mayFetchNowCount: output.summary.mayFetchNowCount,
    maySearchNowCount: output.summary.maySearchNowCount,
    mayBroadSearchNowCount: output.summary.mayBroadSearchNowCount,
    mayClassifySeasonStateNowCount: output.summary.mayClassifySeasonStateNowCount,
    mayWriteCanonicalNowCount: output.summary.mayWriteCanonicalNowCount,
    runnerWouldAllowControlledRouteAcquisitionWhenExplicitlyExecutedCount: output.summary.runnerWouldAllowControlledRouteAcquisitionWhenExplicitlyExecutedCount,
    runnerWouldFetchConfiguredRouteWhenExplicitlyExecutedCount: output.summary.runnerWouldFetchConfiguredRouteWhenExplicitlyExecutedCount,
    runnerWouldSearchWhenExplicitlyExecutedCount: output.summary.runnerWouldSearchWhenExplicitlyExecutedCount,
    runnerWouldBroadSearchWhenExplicitlyExecutedCount: output.summary.runnerWouldBroadSearchWhenExplicitlyExecutedCount,
    runnerWouldClassifySeasonStateWhenExplicitlyExecutedCount: output.summary.runnerWouldClassifySeasonStateWhenExplicitlyExecutedCount,
    runnerWouldWriteCanonicalWhenExplicitlyExecutedCount: output.summary.runnerWouldWriteCanonicalWhenExplicitlyExecutedCount,
    executionRunnerExecutedNowCount: output.summary.executionRunnerExecutedNowCount,
    evidenceAcquisitionExecutedNowCount: output.summary.evidenceAcquisitionExecutedNowCount,
    fetchExecutedNowCount: output.summary.fetchExecutedNowCount,
    searchExecutedNowCount: output.summary.searchExecutedNowCount,
    broadSearchExecutedNowCount: output.summary.broadSearchExecutedNowCount,
    classifierExecutedNowCount: output.summary.classifierExecutedNowCount,
    canonicalWriteExecutedNowCount: output.summary.canonicalWriteExecutedNowCount,
    productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
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
