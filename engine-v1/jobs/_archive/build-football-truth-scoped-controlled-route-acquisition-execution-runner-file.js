#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";
const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/actual-controlled-route-acquisition-execution-approval-gate-2026-06-14/actual-controlled-route-acquisition-execution-approval-gate-2026-06-14.json";
const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/scoped-controlled-route-acquisition-execution-runner-2026-06-14/scoped-controlled-route-acquisition-execution-runner-2026-06-14.json";

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

function validateExecutionApprovalGate(input) {
  const summary = input.summary || {};

  assertSummary(summary, "actualControlledRouteAcquisitionExecutionApprovalGateCompetitionCount", 6);
  assertSummary(summary, "actualControlledRouteAcquisitionExecutionApprovalEligibleCount", 6);
  assertSummary(summary, "actualControlledRouteAcquisitionExecutionApprovalBlockedCount", 0);
  assertSummary(summary, "mayBuildExecutableControlledAcquisitionRunnerCount", 6);
  assertSummary(summary, "nextExecutionRunnerMayAllowControlledRouteAcquisitionCount", 6);
  assertSummary(summary, "mayExecuteRunnerNowCount", 0);
  assertSummary(summary, "mayFetchNowCount", 0);
  assertSummary(summary, "maySearchNowCount", 0);
  assertSummary(summary, "mayBroadSearchNowCount", 0);
  assertSummary(summary, "mayClassifySeasonStateNowCount", 0);
  assertSummary(summary, "mayWriteCanonicalNowCount", 0);
  assertSummary(summary, "laligaExecutionApprovalCompetitionCount", 2);
  assertSummary(summary, "norwayNtfExecutionApprovalCompetitionCount", 2);
  assertSummary(summary, "sportomediaExecutionApprovalCompetitionCount", 2);
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
    if (row.executionApprovalGateStatus !== "eligible_for_next_step_explicit_controlled_acquisition_execution_but_not_executed_now") {
      throw new Error(row.competitionSlug + ": execution approval row is not eligible");
    }
    if (row.mayBuildExecutableControlledAcquisitionRunner !== true) {
      throw new Error(row.competitionSlug + ": mayBuildExecutableControlledAcquisitionRunner must be true");
    }
    if (row.nextExecutionRunnerMayAllowControlledRouteAcquisition !== true) {
      throw new Error(row.competitionSlug + ": next runner may allow controlled route acquisition must be true");
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

function executionRunnerRow(row) {
  return {
    competitionSlug: row.competitionSlug,
    reusableFamily: row.reusableFamily,
    routeAcquisitionType: row.routeAcquisitionType,
    routeScope: row.routeScope,
    sourceExecutionApprovalGateStatus: row.executionApprovalGateStatus,

    scopedExecutionRunnerStatus: "scoped_controlled_route_acquisition_execution_runner_defined_not_executed",
    scopedExecutionRunnerMode: "controlled_route_evidence_acquisition_only_no_broad_search_no_write_no_classifier",
    scopedExecutionRunnerScopeStatus: "scope_locked_to_single_competition_family_and_route",

    runnerWouldAllowControlledRouteAcquisitionWhenExplicitlyExecuted: true,
    runnerWouldFetchConfiguredRouteWhenExplicitlyExecuted: true,
    runnerWouldSearchWhenExplicitlyExecuted: false,
    runnerWouldBroadSearchWhenExplicitlyExecuted: false,
    runnerWouldClassifySeasonStateWhenExplicitlyExecuted: false,
    runnerWouldWriteCanonicalWhenExplicitlyExecuted: false,
    runnerWouldWriteProductionWhenExplicitlyExecuted: false,

    executionRunnerBuiltNow: true,
    executionRunnerExecutedNow: false,
    evidenceAcquisitionExecutedNow: false,
    fetchExecutedNow: false,
    searchExecutedNow: false,
    broadSearchExecutedNow: false,
    classifierExecutedNow: false,
    canonicalWriteExecutedNow: false,
    productionWriteExecutedNow: false,

    lockedExecutionScope: {
      allowedCompetitionSlug: row.competitionSlug,
      allowedReusableFamily: row.reusableFamily,
      allowedRouteScope: row.routeScope,
      allowedRouteAcquisitionType: row.routeAcquisitionType,
      disallowedOperations: [
        "broad_search",
        "search_provider_discovery",
        "canonical_write",
        "production_write",
        "season_state_classifier",
        "truth_assertion",
        "user_hint_as_truth",
        "hardcoded_season_state_override",
        "zero_result_as_absence"
      ],
      requiredEvidenceOutputFields: [
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
      ]
    },

    nextAllowedStep: "run_scoped_controlled_route_acquisition_execution_runner_quality_gate_no_execution_no_write",
    nextBlockedStep: "actual_execution_fetch_classifier_canonical_write_and_production_write_blocked_until_explicit_final_run",

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
  const approvalRows = validateExecutionApprovalGate(input);

  const executionRunnerRows = approvalRows
    .map(executionRunnerRow)
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-scoped-controlled-route-acquisition-execution-runner-file",
    mode: "build_scoped_controlled_route_acquisition_execution_runner_definition_not_executed_no_search_no_write_no_classifier",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      actualControlledRouteAcquisitionExecutionApprovalGate: args.input
    },
    summary: {
      scopedControlledRouteAcquisitionExecutionRunnerCompetitionCount: executionRunnerRows.length,
      scopedControlledRouteAcquisitionExecutionRunnerDefinedCount: executionRunnerRows.filter((row) =>
        row.scopedExecutionRunnerStatus === "scoped_controlled_route_acquisition_execution_runner_defined_not_executed"
      ).length,
      scopedControlledRouteAcquisitionExecutionRunnerBlockedCount: 0,

      runnerWouldAllowControlledRouteAcquisitionWhenExplicitlyExecutedCount: executionRunnerRows.filter((row) =>
        row.runnerWouldAllowControlledRouteAcquisitionWhenExplicitlyExecuted
      ).length,
      runnerWouldFetchConfiguredRouteWhenExplicitlyExecutedCount: executionRunnerRows.filter((row) =>
        row.runnerWouldFetchConfiguredRouteWhenExplicitlyExecuted
      ).length,
      runnerWouldSearchWhenExplicitlyExecutedCount: executionRunnerRows.filter((row) =>
        row.runnerWouldSearchWhenExplicitlyExecuted
      ).length,
      runnerWouldBroadSearchWhenExplicitlyExecutedCount: executionRunnerRows.filter((row) =>
        row.runnerWouldBroadSearchWhenExplicitlyExecuted
      ).length,
      runnerWouldClassifySeasonStateWhenExplicitlyExecutedCount: executionRunnerRows.filter((row) =>
        row.runnerWouldClassifySeasonStateWhenExplicitlyExecuted
      ).length,
      runnerWouldWriteCanonicalWhenExplicitlyExecutedCount: executionRunnerRows.filter((row) =>
        row.runnerWouldWriteCanonicalWhenExplicitlyExecuted
      ).length,

      executionRunnerBuiltNowCount: executionRunnerRows.filter((row) => row.executionRunnerBuiltNow).length,
      executionRunnerExecutedNowCount: executionRunnerRows.filter((row) => row.executionRunnerExecutedNow).length,
      evidenceAcquisitionExecutedNowCount: executionRunnerRows.filter((row) => row.evidenceAcquisitionExecutedNow).length,
      fetchExecutedNowCount: executionRunnerRows.filter((row) => row.fetchExecutedNow).length,
      searchExecutedNowCount: executionRunnerRows.filter((row) => row.searchExecutedNow).length,
      broadSearchExecutedNowCount: executionRunnerRows.filter((row) => row.broadSearchExecutedNow).length,
      classifierExecutedNowCount: executionRunnerRows.filter((row) => row.classifierExecutedNow).length,
      canonicalWriteExecutedNowCount: executionRunnerRows.filter((row) => row.canonicalWriteExecutedNow).length,
      productionWriteExecutedNowCount: executionRunnerRows.filter((row) => row.productionWriteExecutedNow).length,

      laligaExecutionRunnerCompetitionCount: executionRunnerRows.filter((row) => row.reusableFamily === "laliga").length,
      norwayNtfExecutionRunnerCompetitionCount: executionRunnerRows.filter((row) => row.reusableFamily === "norway_ntf").length,
      sportomediaExecutionRunnerCompetitionCount: executionRunnerRows.filter((row) => row.reusableFamily === "sportomedia").length,

      userHintUsedCount: executionRunnerRows.filter((row) => row.userHintUsed).length,
      hardcodedSeasonStateOverrideUsedCount: executionRunnerRows.filter((row) => row.hardcodedSeasonStateOverrideUsed).length,
      validatorReadinessDoesNotImplyActiveCount: executionRunnerRows.filter((row) => row.validatorReadinessDoesNotImplyActive).length,

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

      recommendedNextLane: "run_scoped_controlled_route_acquisition_execution_runner_quality_gate_no_execution_no_write"
    },
    counts: {
      byReusableFamily: countBy(executionRunnerRows, "reusableFamily"),
      byRouteAcquisitionType: countBy(executionRunnerRows, "routeAcquisitionType"),
      byRouteScope: countBy(executionRunnerRows, "routeScope"),
      byScopedExecutionRunnerStatus: countBy(executionRunnerRows, "scopedExecutionRunnerStatus"),
      byNextAllowedStep: countBy(executionRunnerRows, "nextAllowedStep")
    },
    guardrails: [
      "This job builds the scoped execution runner definition only.",
      "It does not execute the runner.",
      "It does not fetch now.",
      "It does not search now.",
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
    executionRunnerRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    scopedControlledRouteAcquisitionExecutionRunnerCompetitionCount: output.summary.scopedControlledRouteAcquisitionExecutionRunnerCompetitionCount,
    scopedControlledRouteAcquisitionExecutionRunnerDefinedCount: output.summary.scopedControlledRouteAcquisitionExecutionRunnerDefinedCount,
    scopedControlledRouteAcquisitionExecutionRunnerBlockedCount: output.summary.scopedControlledRouteAcquisitionExecutionRunnerBlockedCount,
    runnerWouldAllowControlledRouteAcquisitionWhenExplicitlyExecutedCount: output.summary.runnerWouldAllowControlledRouteAcquisitionWhenExplicitlyExecutedCount,
    runnerWouldFetchConfiguredRouteWhenExplicitlyExecutedCount: output.summary.runnerWouldFetchConfiguredRouteWhenExplicitlyExecutedCount,
    runnerWouldSearchWhenExplicitlyExecutedCount: output.summary.runnerWouldSearchWhenExplicitlyExecutedCount,
    runnerWouldBroadSearchWhenExplicitlyExecutedCount: output.summary.runnerWouldBroadSearchWhenExplicitlyExecutedCount,
    runnerWouldClassifySeasonStateWhenExplicitlyExecutedCount: output.summary.runnerWouldClassifySeasonStateWhenExplicitlyExecutedCount,
    runnerWouldWriteCanonicalWhenExplicitlyExecutedCount: output.summary.runnerWouldWriteCanonicalWhenExplicitlyExecutedCount,
    executionRunnerBuiltNowCount: output.summary.executionRunnerBuiltNowCount,
    executionRunnerExecutedNowCount: output.summary.executionRunnerExecutedNowCount,
    evidenceAcquisitionExecutedNowCount: output.summary.evidenceAcquisitionExecutedNowCount,
    fetchExecutedNowCount: output.summary.fetchExecutedNowCount,
    searchExecutedNowCount: output.summary.searchExecutedNowCount,
    broadSearchExecutedNowCount: output.summary.broadSearchExecutedNowCount,
    classifierExecutedNowCount: output.summary.classifierExecutedNowCount,
    canonicalWriteExecutedNowCount: output.summary.canonicalWriteExecutedNowCount,
    productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
    laligaExecutionRunnerCompetitionCount: output.summary.laligaExecutionRunnerCompetitionCount,
    norwayNtfExecutionRunnerCompetitionCount: output.summary.norwayNtfExecutionRunnerCompetitionCount,
    sportomediaExecutionRunnerCompetitionCount: output.summary.sportomediaExecutionRunnerCompetitionCount,
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
