#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";
const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/configured-route-season-state-evidence-acquisition-plan-2026-06-14/configured-route-season-state-evidence-acquisition-plan-2026-06-14.json";
const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/controlled-configured-route-acquisition-runner-manifest-2026-06-14/controlled-configured-route-acquisition-runner-manifest-2026-06-14.json";

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

function validateAcquisitionPlan(plan) {
  const summary = plan.summary || {};

  assertSummary(summary, "configuredRouteEvidenceAcquisitionPlanCompetitionCount", 6);
  assertSummary(summary, "configuredRouteEvidenceAcquisitionPlanReadyCompetitionCount", 6);
  assertSummary(summary, "configuredRouteEvidenceAcquisitionPlanBlockedCompetitionCount", 0);
  assertSummary(summary, "configuredRouteEvidenceAcquisitionRequiredCount", 6);
  assertSummary(summary, "configuredRouteEvidenceAcquisitionAllowedNowCount", 0);
  assertSummary(summary, "controlledRouteAcquisitionAllowedNowCount", 0);
  assertSummary(summary, "requiresExplicitControlledRunApprovalCount", 6);
  assertSummary(summary, "classifierAllowedNowCount", 0);
  assertSummary(summary, "classifierBlockedUntilAnchoredEvidenceAcquiredCount", 6);
  assertSummary(summary, "laligaAcquisitionPlanCompetitionCount", 2);
  assertSummary(summary, "norwayNtfAcquisitionPlanCompetitionCount", 2);
  assertSummary(summary, "sportomediaAcquisitionPlanCompetitionCount", 2);
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

  const rows = Array.isArray(plan.acquisitionRows) ? plan.acquisitionRows : [];
  if (rows.length !== 6) throw new Error("Expected 6 acquisitionRows, got " + rows.length);

  const slugs = uniqueSorted(rows.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Unexpected acquisition slugs: " + slugs.join(", "));
  }

  for (const row of rows) {
    if (row.configuredRouteEvidenceAcquisitionPlanStatus !== "configured_route_season_state_evidence_acquisition_plan_ready_no_fetch") {
      throw new Error(row.competitionSlug + ": expected ready no-fetch acquisition plan status");
    }
    if (row.configuredRouteEvidenceAcquisitionAllowedNow !== false) {
      throw new Error(row.competitionSlug + ": acquisition must not be allowed now");
    }
    if (row.controlledRouteAcquisitionAllowedNow !== false) {
      throw new Error(row.competitionSlug + ": controlled route acquisition must not be allowed now");
    }
    if (row.classifierAllowedNow !== false) {
      throw new Error(row.competitionSlug + ": classifier must not be allowed now");
    }
    if (row.userHintUsed !== false || row.hardcodedSeasonStateOverrideUsed !== false) {
      throw new Error(row.competitionSlug + ": hints/overrides must be false");
    }
    if (row.fetchAllowedNow !== false || row.searchAllowedNow !== false || row.broadSearchAllowedNow !== false) {
      throw new Error(row.competitionSlug + ": fetch/search/broad search must be false");
    }
    if (row.canonicalWriteEligibleNow !== false || row.canonicalWrites !== 0 || row.productionWrite !== false) {
      throw new Error(row.competitionSlug + ": write flags must be blocked");
    }
  }

  return rows;
}

function buildManifestRow(row) {
  return {
    competitionSlug: row.competitionSlug,
    reusableFamily: row.reusableFamily,
    configuredRouteFamily: row.configuredRouteFamily,
    routeAcquisitionType: row.routeAcquisitionType,
    routeScope: row.routeScope,

    runnerManifestStatus: "controlled_configured_route_acquisition_manifest_ready_but_execution_disabled",
    runnerManifestIntent: "prepare_exact_configured_route_evidence_acquisition_without_broad_search_or_write",
    requiredEvidenceArtifacts: row.requiredEvidenceArtifacts,
    classifierUnlockConditions: row.classifierUnlockConditions,
    noBroadSearchPolicy: row.noBroadSearchPolicy,

    executionAllowedNow: false,
    requiresExplicitControlledRunApproval: true,
    configuredRouteEvidenceAcquisitionAllowedNow: false,
    controlledRouteAcquisitionAllowedNow: false,
    classifierAllowedNow: false,
    classifierBlockedUntilAnchoredEvidenceAcquired: true,

    manifestMustCaptureActiveEvidence: true,
    manifestMustCaptureCompletedOrInactiveEvidence: true,
    manifestMustCaptureRestartDateWhenCompletedOrInactive: true,
    manifestMustRejectZeroResultAsAbsence: true,
    manifestMustRejectMatchStatusOnlySeasonState: true,
    manifestMustRejectValidatorReadinessAsActive: true,

    nextAllowedStep: "run_controlled_configured_route_acquisition_runner_manifest_quality_gate_no_fetch_no_write",
    nextBlockedStep: "actual_configured_route_acquisition_blocked_until_quality_gate_and_explicit_approval",

    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,
    validatorReadinessDoesNotImplyActive: true,
    noMatchTodayDoesNotImplyInactive: true,
    matchStatusIsNotSeasonStateTruth: true,

    fetchAllowedNow: false,
    searchAllowedNow: false,
    broadSearchAllowedNow: false,
    controlledDiscoveryAllowedNow: false,
    controlledRouteAcquisitionAllowedNow: false,
    canonicalPromotionAllowedNow: false,
    canonicalWriteEligibleNow: false,
    truthAssertionsAllowedNow: false,
    activeAssertedNow: false,
    inactiveAssertedNow: false,
    completedAssertedNow: false,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function main() {
  const args = parseArgs(process.argv);
  const input = readJson(args.input);
  const acquisitionRows = validateAcquisitionPlan(input);

  const manifestRows = acquisitionRows
    .map(buildManifestRow)
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-controlled-configured-route-acquisition-runner-manifest-file",
    mode: "source_only_controlled_configured_route_acquisition_runner_manifest_no_fetch_no_search_no_write_no_truth_assertions",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      configuredRouteSeasonStateEvidenceAcquisitionPlan: args.input
    },
    summary: {
      controlledConfiguredRouteAcquisitionRunnerManifestCompetitionCount: manifestRows.length,
      controlledConfiguredRouteAcquisitionRunnerManifestReadyCount: manifestRows.filter((row) =>
        row.runnerManifestStatus === "controlled_configured_route_acquisition_manifest_ready_but_execution_disabled"
      ).length,
      controlledConfiguredRouteAcquisitionRunnerManifestBlockedCount: 0,

      executionAllowedNowCount: manifestRows.filter((row) => row.executionAllowedNow).length,
      requiresExplicitControlledRunApprovalCount: manifestRows.filter((row) => row.requiresExplicitControlledRunApproval).length,
      configuredRouteEvidenceAcquisitionAllowedNowCount: manifestRows.filter((row) => row.configuredRouteEvidenceAcquisitionAllowedNow).length,
      controlledRouteAcquisitionAllowedNowCount: manifestRows.filter((row) => row.controlledRouteAcquisitionAllowedNow).length,
      classifierAllowedNowCount: manifestRows.filter((row) => row.classifierAllowedNow).length,
      classifierBlockedUntilAnchoredEvidenceAcquiredCount: manifestRows.filter((row) => row.classifierBlockedUntilAnchoredEvidenceAcquired).length,

      laligaRunnerManifestCompetitionCount: manifestRows.filter((row) => row.reusableFamily === "laliga").length,
      norwayNtfRunnerManifestCompetitionCount: manifestRows.filter((row) => row.reusableFamily === "norway_ntf").length,
      sportomediaRunnerManifestCompetitionCount: manifestRows.filter((row) => row.reusableFamily === "sportomedia").length,

      userHintUsedCount: manifestRows.filter((row) => row.userHintUsed).length,
      hardcodedSeasonStateOverrideUsedCount: manifestRows.filter((row) => row.hardcodedSeasonStateOverrideUsed).length,
      validatorReadinessDoesNotImplyActiveCount: manifestRows.filter((row) => row.validatorReadinessDoesNotImplyActive).length,

      fetchAllowedNowCount: 0,
      searchAllowedNowCount: 0,
      broadSearchAllowedNowCount: 0,
      controlledDiscoveryAllowedNowCount: 0,
      controlledRouteAcquisitionAllowedNowCount: 0,
      canonicalPromotionAllowedNowCount: 0,
      canonicalWriteEligibleNowCount: 0,
      truthAssertionsAllowedNowCount: 0,
      activeAssertedCount: 0,
      inactiveAssertedCount: 0,
      completedAssertedCount: 0,
      canonicalWrites: 0,
      productionWrite: false,

      recommendedNextLane: "run_controlled_configured_route_acquisition_runner_manifest_quality_gate_no_fetch_no_write"
    },
    counts: {
      byReusableFamily: countBy(manifestRows, "reusableFamily"),
      byRouteAcquisitionType: countBy(manifestRows, "routeAcquisitionType"),
      byRouteScope: countBy(manifestRows, "routeScope"),
      byRunnerManifestStatus: countBy(manifestRows, "runnerManifestStatus"),
      byNextAllowedStep: countBy(manifestRows, "nextAllowedStep")
    },
    guardrails: [
      "This is a runner manifest only; execution remains disabled.",
      "It does not fetch.",
      "It does not search.",
      "Broad search remains forbidden.",
      "Configured route acquisition remains disabled until a later explicit approval gate.",
      "Season-state classifier remains blocked until anchored source evidence is acquired.",
      "Canonical write is blocked.",
      "No active/inactive/completed truth is asserted.",
      "No user-provided season-state hints are used.",
      "No hardcoded season-state overrides are used.",
      "Validator readiness must not imply active season state.",
      "No match today must not imply inactive.",
      "Match status alone must not be used as season-state truth.",
      "Zero result must not imply absence."
    ],
    manifestRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    controlledConfiguredRouteAcquisitionRunnerManifestCompetitionCount: output.summary.controlledConfiguredRouteAcquisitionRunnerManifestCompetitionCount,
    controlledConfiguredRouteAcquisitionRunnerManifestReadyCount: output.summary.controlledConfiguredRouteAcquisitionRunnerManifestReadyCount,
    controlledConfiguredRouteAcquisitionRunnerManifestBlockedCount: output.summary.controlledConfiguredRouteAcquisitionRunnerManifestBlockedCount,
    executionAllowedNowCount: output.summary.executionAllowedNowCount,
    requiresExplicitControlledRunApprovalCount: output.summary.requiresExplicitControlledRunApprovalCount,
    configuredRouteEvidenceAcquisitionAllowedNowCount: output.summary.configuredRouteEvidenceAcquisitionAllowedNowCount,
    controlledRouteAcquisitionAllowedNowCount: output.summary.controlledRouteAcquisitionAllowedNowCount,
    classifierAllowedNowCount: output.summary.classifierAllowedNowCount,
    classifierBlockedUntilAnchoredEvidenceAcquiredCount: output.summary.classifierBlockedUntilAnchoredEvidenceAcquiredCount,
    laligaRunnerManifestCompetitionCount: output.summary.laligaRunnerManifestCompetitionCount,
    norwayNtfRunnerManifestCompetitionCount: output.summary.norwayNtfRunnerManifestCompetitionCount,
    sportomediaRunnerManifestCompetitionCount: output.summary.sportomediaRunnerManifestCompetitionCount,
    userHintUsedCount: output.summary.userHintUsedCount,
    hardcodedSeasonStateOverrideUsedCount: output.summary.hardcodedSeasonStateOverrideUsedCount,
    validatorReadinessDoesNotImplyActiveCount: output.summary.validatorReadinessDoesNotImplyActiveCount,
    fetchAllowedNowCount: output.summary.fetchAllowedNowCount,
    searchAllowedNowCount: output.summary.searchAllowedNowCount,
    broadSearchAllowedNowCount: output.summary.broadSearchAllowedNowCount,
    controlledDiscoveryAllowedNowCount: output.summary.controlledDiscoveryAllowedNowCount,
    controlledRouteAcquisitionAllowedNowCount: output.summary.controlledRouteAcquisitionAllowedNowCount,
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
