#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";
const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/scoped-controlled-route-acquisition-execution-runner-quality-gate-2026-06-14/scoped-controlled-route-acquisition-execution-runner-quality-gate-2026-06-14.json";
const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/final-explicit-scoped-controlled-route-acquisition-run-approval-2026-06-14/final-explicit-scoped-controlled-route-acquisition-run-approval-2026-06-14.json";

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

function validateScopedQualityGate(input) {
  const summary = input.summary || {};

  assertSummary(summary, "scopedExecutionRunnerQualityGateCompetitionCount", 6);
  assertSummary(summary, "scopedExecutionRunnerQualityGatePassedCount", 6);
  assertSummary(summary, "scopedExecutionRunnerQualityGateBlockedCount", 0);
  assertSummary(summary, "scopedRunnerContractCompleteCount", 6);
  assertSummary(summary, "mayPrepareFinalExplicitExecutionRunCount", 6);

  assertSummary(summary, "mayExecuteRunnerNowCount", 0);
  assertSummary(summary, "mayFetchNowCount", 0);
  assertSummary(summary, "maySearchNowCount", 0);
  assertSummary(summary, "mayBroadSearchNowCount", 0);
  assertSummary(summary, "mayClassifySeasonStateNowCount", 0);
  assertSummary(summary, "mayWriteCanonicalNowCount", 0);

  assertSummary(summary, "runnerWouldAllowControlledRouteAcquisitionWhenExplicitlyExecutedCount", 6);
  assertSummary(summary, "runnerWouldFetchConfiguredRouteWhenExplicitlyExecutedCount", 6);
  assertSummary(summary, "runnerWouldSearchWhenExplicitlyExecutedCount", 0);
  assertSummary(summary, "runnerWouldBroadSearchWhenExplicitlyExecutedCount", 0);
  assertSummary(summary, "runnerWouldClassifySeasonStateWhenExplicitlyExecutedCount", 0);
  assertSummary(summary, "runnerWouldWriteCanonicalWhenExplicitlyExecutedCount", 0);

  assertSummary(summary, "executionRunnerExecutedNowCount", 0);
  assertSummary(summary, "evidenceAcquisitionExecutedNowCount", 0);
  assertSummary(summary, "fetchExecutedNowCount", 0);
  assertSummary(summary, "searchExecutedNowCount", 0);
  assertSummary(summary, "broadSearchExecutedNowCount", 0);
  assertSummary(summary, "classifierExecutedNowCount", 0);
  assertSummary(summary, "canonicalWriteExecutedNowCount", 0);
  assertSummary(summary, "productionWriteExecutedNowCount", 0);

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
    throw new Error("Unexpected scoped quality gate slugs: " + slugs.join(", "));
  }

  for (const row of rows) {
    if (row.qualityGateStatus !== "passed_scoped_execution_runner_contract_not_executed") {
      throw new Error(row.competitionSlug + ": scoped runner quality gate did not pass");
    }
    if (row.scopedRunnerContractComplete !== true) {
      throw new Error(row.competitionSlug + ": scopedRunnerContractComplete must be true");
    }
    if (row.mayPrepareFinalExplicitExecutionRun !== true) {
      throw new Error(row.competitionSlug + ": mayPrepareFinalExplicitExecutionRun must be true");
    }

    if (row.mayExecuteRunnerNow !== false) throw new Error(row.competitionSlug + ": execute-now must remain false");
    if (row.mayFetchNow !== false) throw new Error(row.competitionSlug + ": fetch-now must remain false");
    if (row.maySearchNow !== false) throw new Error(row.competitionSlug + ": search-now must remain false");
    if (row.mayBroadSearchNow !== false) throw new Error(row.competitionSlug + ": broad-search-now must remain false");
    if (row.mayClassifySeasonStateNow !== false) throw new Error(row.competitionSlug + ": classifier-now must remain false");
    if (row.mayWriteCanonicalNow !== false) throw new Error(row.competitionSlug + ": canonical-write-now must remain false");

    if (row.runnerWouldAllowControlledRouteAcquisitionWhenExplicitlyExecuted !== true) {
      throw new Error(row.competitionSlug + ": future controlled route acquisition must be true");
    }
    if (row.runnerWouldFetchConfiguredRouteWhenExplicitlyExecuted !== true) {
      throw new Error(row.competitionSlug + ": future configured route fetch must be true");
    }
    if (row.runnerWouldSearchWhenExplicitlyExecuted !== false) throw new Error(row.competitionSlug + ": future search must be false");
    if (row.runnerWouldBroadSearchWhenExplicitlyExecuted !== false) throw new Error(row.competitionSlug + ": future broad search must be false");
    if (row.runnerWouldClassifySeasonStateWhenExplicitlyExecuted !== false) throw new Error(row.competitionSlug + ": future classifier must be false");
    if (row.runnerWouldWriteCanonicalWhenExplicitlyExecuted !== false) throw new Error(row.competitionSlug + ": future canonical write must be false");

    if (row.executionRunnerExecutedNow !== false) throw new Error(row.competitionSlug + ": execution must not have run");
    if (row.evidenceAcquisitionExecutedNow !== false) throw new Error(row.competitionSlug + ": evidence acquisition must not have run");
    if (row.fetchExecutedNow !== false) throw new Error(row.competitionSlug + ": fetch must not have run");
    if (row.searchExecutedNow !== false) throw new Error(row.competitionSlug + ": search must not have run");
    if (row.broadSearchExecutedNow !== false) throw new Error(row.competitionSlug + ": broad search must not have run");
    if (row.classifierExecutedNow !== false) throw new Error(row.competitionSlug + ": classifier must not have run");
    if (row.canonicalWriteExecutedNow !== false) throw new Error(row.competitionSlug + ": canonical write must not have run");
    if (row.productionWriteExecutedNow !== false) throw new Error(row.competitionSlug + ": production write must not have run");

    if (row.userHintUsed !== false || row.hardcodedSeasonStateOverrideUsed !== false) {
      throw new Error(row.competitionSlug + ": hints/overrides must remain false");
    }
  }

  return rows;
}

function finalApprovalRow(row) {
  return {
    competitionSlug: row.competitionSlug,
    reusableFamily: row.reusableFamily,
    routeAcquisitionType: row.routeAcquisitionType,
    routeScope: row.routeScope,
    sourceQualityGateStatus: row.qualityGateStatus,

    finalRunApprovalStatus: "approved_for_next_explicit_scoped_controlled_route_acquisition_run_not_executed_now",
    finalRunApprovalScope: "single_competition_configured_route_acquisition_only",
    finalRunApprovalFinding: "all scoped runner guardrails passed; next step may execute controlled route acquisition only",

    mayRunFinalScopedControlledAcquisitionNext: true,
    mayExecuteRunnerNow: false,
    mayFetchNow: false,
    maySearchNow: false,
    mayBroadSearchNow: false,
    mayClassifySeasonStateNow: false,
    mayWriteCanonicalNow: false,

    finalRunWouldAllowControlledRouteAcquisition: true,
    finalRunWouldAllowConfiguredRouteFetch: true,
    finalRunWouldAllowSearch: false,
    finalRunWouldAllowBroadSearch: false,
    finalRunWouldAllowClassifier: false,
    finalRunWouldAllowCanonicalWrite: false,
    finalRunWouldAllowProductionWrite: false,

    finalRunScopeLock: {
      allowedCompetitionSlug: row.competitionSlug,
      allowedReusableFamily: row.reusableFamily,
      allowedRouteScope: row.routeScope,
      allowedRouteAcquisitionType: row.routeAcquisitionType,
      maximumAllowedOperation: "controlled_route_evidence_acquisition",
      forbiddenOperations: [
        "broad_search",
        "search_provider_discovery",
        "season_state_classifier",
        "truth_assertion",
        "canonical_write",
        "production_write",
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

    approvalPreparedNow: true,
    runnerExecutedNow: false,
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

    nextAllowedStep: "run_final_explicit_scoped_controlled_route_acquisition_no_broad_search_no_classifier_no_write",
    nextBlockedStep: "classifier_truth_assertions_canonical_write_and_production_write_blocked_after_acquisition_until_evidence_review"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const input = readJson(args.input);
  const sourceRows = validateScopedQualityGate(input);

  const finalApprovalRows = sourceRows
    .map(finalApprovalRow)
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "prepare-football-truth-final-explicit-scoped-controlled-route-acquisition-run-approval-file",
    mode: "prepare_final_explicit_scoped_controlled_route_acquisition_run_approval_no_execution_no_search_no_classifier_no_write",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      scopedControlledRouteAcquisitionExecutionRunnerQualityGate: args.input
    },
    summary: {
      finalScopedControlledRouteAcquisitionRunApprovalCompetitionCount: finalApprovalRows.length,
      finalScopedControlledRouteAcquisitionRunApprovalApprovedCount: finalApprovalRows.filter((row) =>
        row.finalRunApprovalStatus === "approved_for_next_explicit_scoped_controlled_route_acquisition_run_not_executed_now"
      ).length,
      finalScopedControlledRouteAcquisitionRunApprovalBlockedCount: 0,

      mayRunFinalScopedControlledAcquisitionNextCount: finalApprovalRows.filter((row) =>
        row.mayRunFinalScopedControlledAcquisitionNext
      ).length,

      finalRunWouldAllowControlledRouteAcquisitionCount: finalApprovalRows.filter((row) =>
        row.finalRunWouldAllowControlledRouteAcquisition
      ).length,
      finalRunWouldAllowConfiguredRouteFetchCount: finalApprovalRows.filter((row) =>
        row.finalRunWouldAllowConfiguredRouteFetch
      ).length,
      finalRunWouldAllowSearchCount: finalApprovalRows.filter((row) => row.finalRunWouldAllowSearch).length,
      finalRunWouldAllowBroadSearchCount: finalApprovalRows.filter((row) => row.finalRunWouldAllowBroadSearch).length,
      finalRunWouldAllowClassifierCount: finalApprovalRows.filter((row) => row.finalRunWouldAllowClassifier).length,
      finalRunWouldAllowCanonicalWriteCount: finalApprovalRows.filter((row) => row.finalRunWouldAllowCanonicalWrite).length,
      finalRunWouldAllowProductionWriteCount: finalApprovalRows.filter((row) => row.finalRunWouldAllowProductionWrite).length,

      approvalPreparedNowCount: finalApprovalRows.filter((row) => row.approvalPreparedNow).length,
      runnerExecutedNowCount: finalApprovalRows.filter((row) => row.runnerExecutedNow).length,
      evidenceAcquisitionExecutedNowCount: finalApprovalRows.filter((row) => row.evidenceAcquisitionExecutedNow).length,
      fetchExecutedNowCount: finalApprovalRows.filter((row) => row.fetchExecutedNow).length,
      searchExecutedNowCount: finalApprovalRows.filter((row) => row.searchExecutedNow).length,
      broadSearchExecutedNowCount: finalApprovalRows.filter((row) => row.broadSearchExecutedNow).length,
      classifierExecutedNowCount: finalApprovalRows.filter((row) => row.classifierExecutedNow).length,
      canonicalWriteExecutedNowCount: finalApprovalRows.filter((row) => row.canonicalWriteExecutedNow).length,
      productionWriteExecutedNowCount: finalApprovalRows.filter((row) => row.productionWriteExecutedNow).length,

      laligaFinalRunApprovalCompetitionCount: finalApprovalRows.filter((row) => row.reusableFamily === "laliga").length,
      norwayNtfFinalRunApprovalCompetitionCount: finalApprovalRows.filter((row) => row.reusableFamily === "norway_ntf").length,
      sportomediaFinalRunApprovalCompetitionCount: finalApprovalRows.filter((row) => row.reusableFamily === "sportomedia").length,

      userHintUsedCount: finalApprovalRows.filter((row) => row.userHintUsed).length,
      hardcodedSeasonStateOverrideUsedCount: finalApprovalRows.filter((row) => row.hardcodedSeasonStateOverrideUsed).length,
      validatorReadinessDoesNotImplyActiveCount: finalApprovalRows.filter((row) => row.validatorReadinessDoesNotImplyActive).length,

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

      recommendedNextLane: "run_final_explicit_scoped_controlled_route_acquisition_no_broad_search_no_classifier_no_write"
    },
    counts: {
      byReusableFamily: countBy(finalApprovalRows, "reusableFamily"),
      byRouteAcquisitionType: countBy(finalApprovalRows, "routeAcquisitionType"),
      byRouteScope: countBy(finalApprovalRows, "routeScope"),
      byFinalRunApprovalStatus: countBy(finalApprovalRows, "finalRunApprovalStatus"),
      byNextAllowedStep: countBy(finalApprovalRows, "nextAllowedStep")
    },
    guardrails: [
      "This job prepares final explicit run approval only.",
      "It does not execute acquisition.",
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
    finalApprovalRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    finalScopedControlledRouteAcquisitionRunApprovalCompetitionCount: output.summary.finalScopedControlledRouteAcquisitionRunApprovalCompetitionCount,
    finalScopedControlledRouteAcquisitionRunApprovalApprovedCount: output.summary.finalScopedControlledRouteAcquisitionRunApprovalApprovedCount,
    finalScopedControlledRouteAcquisitionRunApprovalBlockedCount: output.summary.finalScopedControlledRouteAcquisitionRunApprovalBlockedCount,
    mayRunFinalScopedControlledAcquisitionNextCount: output.summary.mayRunFinalScopedControlledAcquisitionNextCount,
    finalRunWouldAllowControlledRouteAcquisitionCount: output.summary.finalRunWouldAllowControlledRouteAcquisitionCount,
    finalRunWouldAllowConfiguredRouteFetchCount: output.summary.finalRunWouldAllowConfiguredRouteFetchCount,
    finalRunWouldAllowSearchCount: output.summary.finalRunWouldAllowSearchCount,
    finalRunWouldAllowBroadSearchCount: output.summary.finalRunWouldAllowBroadSearchCount,
    finalRunWouldAllowClassifierCount: output.summary.finalRunWouldAllowClassifierCount,
    finalRunWouldAllowCanonicalWriteCount: output.summary.finalRunWouldAllowCanonicalWriteCount,
    finalRunWouldAllowProductionWriteCount: output.summary.finalRunWouldAllowProductionWriteCount,
    approvalPreparedNowCount: output.summary.approvalPreparedNowCount,
    runnerExecutedNowCount: output.summary.runnerExecutedNowCount,
    evidenceAcquisitionExecutedNowCount: output.summary.evidenceAcquisitionExecutedNowCount,
    fetchExecutedNowCount: output.summary.fetchExecutedNowCount,
    searchExecutedNowCount: output.summary.searchExecutedNowCount,
    broadSearchExecutedNowCount: output.summary.broadSearchExecutedNowCount,
    classifierExecutedNowCount: output.summary.classifierExecutedNowCount,
    canonicalWriteExecutedNowCount: output.summary.canonicalWriteExecutedNowCount,
    productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
    laligaFinalRunApprovalCompetitionCount: output.summary.laligaFinalRunApprovalCompetitionCount,
    norwayNtfFinalRunApprovalCompetitionCount: output.summary.norwayNtfFinalRunApprovalCompetitionCount,
    sportomediaFinalRunApprovalCompetitionCount: output.summary.sportomediaFinalRunApprovalCompetitionCount,
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
