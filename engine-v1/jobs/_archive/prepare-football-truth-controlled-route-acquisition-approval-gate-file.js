#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";
const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/controlled-configured-route-acquisition-runner-manifest-quality-gate-2026-06-14/controlled-configured-route-acquisition-runner-manifest-quality-gate-2026-06-14.json";
const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/controlled-route-acquisition-approval-gate-2026-06-14/controlled-route-acquisition-approval-gate-2026-06-14.json";

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

function validateManifestQualityGate(input) {
  const summary = input.summary || {};

  assertSummary(summary, "controlledConfiguredRouteAcquisitionRunnerManifestQualityGateCompetitionCount", 6);
  assertSummary(summary, "controlledConfiguredRouteAcquisitionRunnerManifestQualityGatePassedCount", 6);
  assertSummary(summary, "controlledConfiguredRouteAcquisitionRunnerManifestQualityGateBlockedCount", 0);
  assertSummary(summary, "executionAllowedNowCount", 0);
  assertSummary(summary, "configuredRouteEvidenceAcquisitionAllowedNowCount", 0);
  assertSummary(summary, "controlledRouteAcquisitionAllowedNowCount", 0);
  assertSummary(summary, "classifierAllowedNowCount", 0);
  assertSummary(summary, "classifierBlockedUntilAnchoredEvidenceAcquiredCount", 6);
  assertSummary(summary, "requiresExplicitControlledRunApprovalCount", 6);
  assertSummary(summary, "laligaQualityGateCompetitionCount", 2);
  assertSummary(summary, "norwayNtfQualityGateCompetitionCount", 2);
  assertSummary(summary, "sportomediaQualityGateCompetitionCount", 2);
  assertSummary(summary, "manifestCompleteCount", 6);
  assertSummary(summary, "userHintUsedCount", 0);
  assertSummary(summary, "hardcodedSeasonStateOverrideUsedCount", 0);
  assertSummary(summary, "validatorReadinessDoesNotImplyActiveCount", 6);
  assertSummary(summary, "fetchAllowedNowCount", 0);
  assertSummary(summary, "searchAllowedNowCount", 0);
  assertSummary(summary, "broadSearchAllowedNowCount", 0);
  assertSummary(summary, "controlledDiscoveryAllowedNowCount", 0);
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
    if (row.qualityGateStatus !== "passed_manifest_ready_execution_still_disabled") {
      throw new Error(row.competitionSlug + ": manifest quality gate did not pass");
    }

    if (!row.manifestComplete) {
      throw new Error(row.competitionSlug + ": manifestComplete must be truthy");
    }

    if (row.executionAllowedNow !== false) throw new Error(row.competitionSlug + ": execution must remain false");
    if (row.fetchAllowedNow !== false) throw new Error(row.competitionSlug + ": fetch must remain false");
    if (row.searchAllowedNow !== false) throw new Error(row.competitionSlug + ": search must remain false");
    if (row.broadSearchAllowedNow !== false) throw new Error(row.competitionSlug + ": broad search must remain false");
    if (row.controlledRouteAcquisitionAllowedNow !== false) throw new Error(row.competitionSlug + ": controlled route acquisition must remain false");
    if (row.classifierAllowedNow !== false) throw new Error(row.competitionSlug + ": classifier must remain false");
    if (row.canonicalWriteEligibleNow !== false || row.canonicalWrites !== 0 || row.productionWrite !== false) {
      throw new Error(row.competitionSlug + ": write flags must remain blocked");
    }
    if (row.userHintUsed !== false || row.hardcodedSeasonStateOverrideUsed !== false) {
      throw new Error(row.competitionSlug + ": hints/overrides must be false");
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
    sourceManifestQualityGateStatus: row.qualityGateStatus,

    approvalGateStatus: "eligible_for_explicit_controlled_route_acquisition_approval_but_not_enabled",
    approvalGateFinding: "manifest_complete_and_safe_but_execution_requires_explicit_next_gate",
    approvalScope: "controlled_configured_route_only_no_broad_search_no_write",
    approvalRequiredBeforeExecution: true,

    mayPrepareControlledAcquisitionRunner: true,
    mayEnableControlledRouteAcquisitionNow: false,
    mayFetchNow: false,
    maySearchNow: false,
    mayBroadSearchNow: false,
    mayClassifySeasonStateNow: false,
    mayWriteCanonicalNow: false,

    allowedFutureRunnerMode: "controlled_route_evidence_acquisition_no_broad_search_no_canonical_write",
    requiredFutureRunnerGuards: [
      "competition slug must be one of the six approved rows",
      "route scope must match manifest routeScope",
      "broad search must remain false",
      "canonical writes must remain false",
      "classifier must remain false until anchored evidence is acquired",
      "zero result must not imply absence",
      "match status alone must not imply season state",
      "no user hint or hardcoded season-state override may be used"
    ],

    executionAllowedNow: false,
    fetchAllowedNow: false,
    searchAllowedNow: false,
    broadSearchAllowedNow: false,
    controlledDiscoveryAllowedNow: false,
    controlledRouteAcquisitionAllowedNow: false,
    classifierAllowedNow: false,
    classifierBlockedUntilAnchoredEvidenceAcquired: true,
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

    nextAllowedStep: "build_actual_controlled_route_acquisition_runner_no_broad_search_no_write_execution_still_gateable",
    nextBlockedStep: "classifier_canonical_write_and_broad_search_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const input = readJson(args.input);
  const qualityGateRows = validateManifestQualityGate(input);

  const approvalRows = qualityGateRows
    .map(approvalRow)
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "prepare-football-truth-controlled-route-acquisition-approval-gate-file",
    mode: "explicit_approval_gate_for_controlled_configured_route_acquisition_no_broad_search_no_write_execution_not_enabled",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      controlledConfiguredRouteAcquisitionRunnerManifestQualityGate: args.input
    },
    summary: {
      controlledRouteAcquisitionApprovalGateCompetitionCount: approvalRows.length,
      controlledRouteAcquisitionApprovalEligibleCount: approvalRows.filter((row) =>
        row.approvalGateStatus === "eligible_for_explicit_controlled_route_acquisition_approval_but_not_enabled"
      ).length,
      controlledRouteAcquisitionApprovalBlockedCount: 0,

      mayPrepareControlledAcquisitionRunnerCount: approvalRows.filter((row) => row.mayPrepareControlledAcquisitionRunner).length,
      mayEnableControlledRouteAcquisitionNowCount: approvalRows.filter((row) => row.mayEnableControlledRouteAcquisitionNow).length,
      mayFetchNowCount: approvalRows.filter((row) => row.mayFetchNow).length,
      maySearchNowCount: approvalRows.filter((row) => row.maySearchNow).length,
      mayBroadSearchNowCount: approvalRows.filter((row) => row.mayBroadSearchNow).length,
      mayClassifySeasonStateNowCount: approvalRows.filter((row) => row.mayClassifySeasonStateNow).length,
      mayWriteCanonicalNowCount: approvalRows.filter((row) => row.mayWriteCanonicalNow).length,

      laligaApprovalGateCompetitionCount: approvalRows.filter((row) => row.reusableFamily === "laliga").length,
      norwayNtfApprovalGateCompetitionCount: approvalRows.filter((row) => row.reusableFamily === "norway_ntf").length,
      sportomediaApprovalGateCompetitionCount: approvalRows.filter((row) => row.reusableFamily === "sportomedia").length,

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

      recommendedNextLane: "build_actual_controlled_route_acquisition_runner_no_broad_search_no_write_execution_still_gateable"
    },
    counts: {
      byReusableFamily: countBy(approvalRows, "reusableFamily"),
      byRouteAcquisitionType: countBy(approvalRows, "routeAcquisitionType"),
      byRouteScope: countBy(approvalRows, "routeScope"),
      byApprovalGateStatus: countBy(approvalRows, "approvalGateStatus"),
      byNextAllowedStep: countBy(approvalRows, "nextAllowedStep")
    },
    guardrails: [
      "This approval gate does not execute acquisition.",
      "It only confirms that a future controlled route acquisition runner may be prepared.",
      "Fetch remains disabled now.",
      "Search remains disabled now.",
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
    approvalRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    controlledRouteAcquisitionApprovalGateCompetitionCount: output.summary.controlledRouteAcquisitionApprovalGateCompetitionCount,
    controlledRouteAcquisitionApprovalEligibleCount: output.summary.controlledRouteAcquisitionApprovalEligibleCount,
    controlledRouteAcquisitionApprovalBlockedCount: output.summary.controlledRouteAcquisitionApprovalBlockedCount,
    mayPrepareControlledAcquisitionRunnerCount: output.summary.mayPrepareControlledAcquisitionRunnerCount,
    mayEnableControlledRouteAcquisitionNowCount: output.summary.mayEnableControlledRouteAcquisitionNowCount,
    mayFetchNowCount: output.summary.mayFetchNowCount,
    maySearchNowCount: output.summary.maySearchNowCount,
    mayBroadSearchNowCount: output.summary.mayBroadSearchNowCount,
    mayClassifySeasonStateNowCount: output.summary.mayClassifySeasonStateNowCount,
    mayWriteCanonicalNowCount: output.summary.mayWriteCanonicalNowCount,
    laligaApprovalGateCompetitionCount: output.summary.laligaApprovalGateCompetitionCount,
    norwayNtfApprovalGateCompetitionCount: output.summary.norwayNtfApprovalGateCompetitionCount,
    sportomediaApprovalGateCompetitionCount: output.summary.sportomediaApprovalGateCompetitionCount,
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
