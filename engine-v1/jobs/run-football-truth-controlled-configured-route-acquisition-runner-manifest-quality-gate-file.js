#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";
const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/controlled-configured-route-acquisition-runner-manifest-2026-06-14/controlled-configured-route-acquisition-runner-manifest-2026-06-14.json";
const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/controlled-configured-route-acquisition-runner-manifest-quality-gate-2026-06-14/controlled-configured-route-acquisition-runner-manifest-quality-gate-2026-06-14.json";

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

function validateManifest(manifest) {
  const summary = manifest.summary || {};

  assertSummary(summary, "controlledConfiguredRouteAcquisitionRunnerManifestCompetitionCount", 6);
  assertSummary(summary, "controlledConfiguredRouteAcquisitionRunnerManifestReadyCount", 6);
  assertSummary(summary, "controlledConfiguredRouteAcquisitionRunnerManifestBlockedCount", 0);
  assertSummary(summary, "executionAllowedNowCount", 0);
  assertSummary(summary, "requiresExplicitControlledRunApprovalCount", 6);
  assertSummary(summary, "configuredRouteEvidenceAcquisitionAllowedNowCount", 0);
  assertSummary(summary, "controlledRouteAcquisitionAllowedNowCount", 0);
  assertSummary(summary, "classifierAllowedNowCount", 0);
  assertSummary(summary, "classifierBlockedUntilAnchoredEvidenceAcquiredCount", 6);
  assertSummary(summary, "laligaRunnerManifestCompetitionCount", 2);
  assertSummary(summary, "norwayNtfRunnerManifestCompetitionCount", 2);
  assertSummary(summary, "sportomediaRunnerManifestCompetitionCount", 2);
  assertSummary(summary, "userHintUsedCount", 0);
  assertSummary(summary, "hardcodedSeasonStateOverrideUsedCount", 0);
  assertSummary(summary, "validatorReadinessDoesNotImplyActiveCount", 6);
  assertSummary(summary, "fetchAllowedNowCount", 0);
  assertSummary(summary, "searchAllowedNowCount", 0);
  assertSummary(summary, "broadSearchAllowedNowCount", 0);
  assertSummary(summary, "controlledDiscoveryAllowedNowCount", 0);
  assertSummary(summary, "controlledRouteAcquisitionAllowedNowCount", 0);
  assertSummary(summary, "canonicalPromotionAllowedNowCount", 0);
  assertSummary(summary, "canonicalWriteEligibleNowCount", 0);
  assertSummary(summary, "truthAssertionsAllowedNowCount", 0);
  assertSummary(summary, "activeAssertedCount", 0);
  assertSummary(summary, "inactiveAssertedCount", 0);
  assertSummary(summary, "completedAssertedCount", 0);
  assertSummary(summary, "canonicalWrites", 0);
  assertSummary(summary, "productionWrite", false);

  const rows = Array.isArray(manifest.manifestRows) ? manifest.manifestRows : [];
  if (rows.length !== 6) throw new Error("Expected 6 manifestRows, got " + rows.length);

  const slugs = uniqueSorted(rows.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Unexpected manifest slugs: " + slugs.join(", "));
  }

  for (const row of rows) {
    if (row.runnerManifestStatus !== "controlled_configured_route_acquisition_manifest_ready_but_execution_disabled") {
      throw new Error(row.competitionSlug + ": unexpected runner manifest status");
    }
    if (row.executionAllowedNow !== false) throw new Error(row.competitionSlug + ": execution must be false");
    if (row.configuredRouteEvidenceAcquisitionAllowedNow !== false) {
      throw new Error(row.competitionSlug + ": configured acquisition must be false");
    }
    if (row.controlledRouteAcquisitionAllowedNow !== false) {
      throw new Error(row.competitionSlug + ": controlled route acquisition must be false");
    }
    if (row.classifierAllowedNow !== false) throw new Error(row.competitionSlug + ": classifier must be false");
    if (row.classifierBlockedUntilAnchoredEvidenceAcquired !== true) {
      throw new Error(row.competitionSlug + ": classifier block must be true");
    }
    if (row.userHintUsed !== false || row.hardcodedSeasonStateOverrideUsed !== false) {
      throw new Error(row.competitionSlug + ": hints/overrides must be false");
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
  const requiredEvidenceArtifactCount = Array.isArray(row.requiredEvidenceArtifacts)
    ? row.requiredEvidenceArtifacts.length
    : 0;

  const classifierUnlockConditionCount = Array.isArray(row.classifierUnlockConditions)
    ? row.classifierUnlockConditions.length
    : 0;

  const manifestComplete =
    requiredEvidenceArtifactCount > 0 &&
    classifierUnlockConditionCount > 0 &&
    row.noBroadSearchPolicy &&
    row.runnerManifestIntent &&
    row.routeScope &&
    row.routeAcquisitionType;

  const blockingReasons = [];
  if (!manifestComplete) blockingReasons.push("manifest_missing_required_route_fields");
  if (row.executionAllowedNow !== false) blockingReasons.push("execution_allowed_now_not_false");
  if (row.fetchAllowedNow !== false) blockingReasons.push("fetch_allowed_now_not_false");
  if (row.searchAllowedNow !== false) blockingReasons.push("search_allowed_now_not_false");
  if (row.broadSearchAllowedNow !== false) blockingReasons.push("broad_search_allowed_now_not_false");
  if (row.controlledRouteAcquisitionAllowedNow !== false) blockingReasons.push("controlled_route_acquisition_allowed_now_not_false");
  if (row.classifierAllowedNow !== false) blockingReasons.push("classifier_allowed_now_not_false");
  if (row.canonicalWriteEligibleNow !== false) blockingReasons.push("canonical_write_eligible_not_false");
  if (row.canonicalWrites !== 0) blockingReasons.push("canonical_writes_not_zero");
  if (row.productionWrite !== false) blockingReasons.push("production_write_not_false");
  if (row.userHintUsed !== false) blockingReasons.push("user_hint_used");
  if (row.hardcodedSeasonStateOverrideUsed !== false) blockingReasons.push("hardcoded_override_used");

  const qualityGateStatus =
    blockingReasons.length === 0
      ? "passed_manifest_ready_execution_still_disabled"
      : "blocked_manifest_quality_gate";

  return {
    competitionSlug: row.competitionSlug,
    reusableFamily: row.reusableFamily,
    routeAcquisitionType: row.routeAcquisitionType,
    routeScope: row.routeScope,
    runnerManifestStatus: row.runnerManifestStatus,
    qualityGateStatus,
    blockingReasons,

    requiredEvidenceArtifactCount,
    classifierUnlockConditionCount,
    manifestComplete,

    executionAllowedNow: false,
    configuredRouteEvidenceAcquisitionAllowedNow: false,
    controlledRouteAcquisitionAllowedNow: false,
    classifierAllowedNow: false,
    classifierBlockedUntilAnchoredEvidenceAcquired: true,
    requiresExplicitControlledRunApproval: true,

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
    productionWrite: false,

    nextAllowedStep: "prepare_explicit_controlled_route_acquisition_approval_gate_no_broad_search_no_write",
    nextBlockedStep: "actual_acquisition_fetch_classifier_and_canonical_write_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const manifest = readJson(args.input);
  const manifestRows = validateManifest(manifest);

  const qualityGateRows = manifestRows
    .map(gateRow)
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const passedRows = qualityGateRows.filter((row) => row.qualityGateStatus === "passed_manifest_ready_execution_still_disabled");
  const blockedRows = qualityGateRows.filter((row) => row.qualityGateStatus === "blocked_manifest_quality_gate");

  if (blockedRows.length !== 0) {
    throw new Error("Manifest quality gate blocked rows: " + blockedRows.map((row) => row.competitionSlug).join(", "));
  }

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "run-football-truth-controlled-configured-route-acquisition-runner-manifest-quality-gate-file",
    mode: "quality_gate_for_controlled_configured_route_acquisition_runner_manifest_execution_still_disabled",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      controlledConfiguredRouteAcquisitionRunnerManifest: args.input
    },
    summary: {
      controlledConfiguredRouteAcquisitionRunnerManifestQualityGateCompetitionCount: qualityGateRows.length,
      controlledConfiguredRouteAcquisitionRunnerManifestQualityGatePassedCount: passedRows.length,
      controlledConfiguredRouteAcquisitionRunnerManifestQualityGateBlockedCount: blockedRows.length,

      executionAllowedNowCount: qualityGateRows.filter((row) => row.executionAllowedNow).length,
      configuredRouteEvidenceAcquisitionAllowedNowCount: qualityGateRows.filter((row) => row.configuredRouteEvidenceAcquisitionAllowedNow).length,
      controlledRouteAcquisitionAllowedNowCount: qualityGateRows.filter((row) => row.controlledRouteAcquisitionAllowedNow).length,
      classifierAllowedNowCount: qualityGateRows.filter((row) => row.classifierAllowedNow).length,
      classifierBlockedUntilAnchoredEvidenceAcquiredCount: qualityGateRows.filter((row) => row.classifierBlockedUntilAnchoredEvidenceAcquired).length,
      requiresExplicitControlledRunApprovalCount: qualityGateRows.filter((row) => row.requiresExplicitControlledRunApproval).length,

      laligaQualityGateCompetitionCount: qualityGateRows.filter((row) => row.reusableFamily === "laliga").length,
      norwayNtfQualityGateCompetitionCount: qualityGateRows.filter((row) => row.reusableFamily === "norway_ntf").length,
      sportomediaQualityGateCompetitionCount: qualityGateRows.filter((row) => row.reusableFamily === "sportomedia").length,

      manifestCompleteCount: qualityGateRows.filter((row) => row.manifestComplete).length,
      userHintUsedCount: qualityGateRows.filter((row) => row.userHintUsed).length,
      hardcodedSeasonStateOverrideUsedCount: qualityGateRows.filter((row) => row.hardcodedSeasonStateOverrideUsed).length,
      validatorReadinessDoesNotImplyActiveCount: qualityGateRows.filter((row) => row.validatorReadinessDoesNotImplyActive).length,

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

      recommendedNextLane: "prepare_explicit_controlled_route_acquisition_approval_gate_no_broad_search_no_write"
    },
    counts: {
      byReusableFamily: countBy(qualityGateRows, "reusableFamily"),
      byRouteAcquisitionType: countBy(qualityGateRows, "routeAcquisitionType"),
      byRouteScope: countBy(qualityGateRows, "routeScope"),
      byQualityGateStatus: countBy(qualityGateRows, "qualityGateStatus"),
      byNextAllowedStep: countBy(qualityGateRows, "nextAllowedStep")
    },
    guardrails: [
      "This quality gate validates manifest completeness only.",
      "Execution remains disabled.",
      "Fetch remains disabled.",
      "Search remains disabled.",
      "Broad search remains forbidden.",
      "Controlled route acquisition remains disabled until a separate explicit approval gate.",
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
    qualityGateRows,
    blockedRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    controlledConfiguredRouteAcquisitionRunnerManifestQualityGateCompetitionCount: output.summary.controlledConfiguredRouteAcquisitionRunnerManifestQualityGateCompetitionCount,
    controlledConfiguredRouteAcquisitionRunnerManifestQualityGatePassedCount: output.summary.controlledConfiguredRouteAcquisitionRunnerManifestQualityGatePassedCount,
    controlledConfiguredRouteAcquisitionRunnerManifestQualityGateBlockedCount: output.summary.controlledConfiguredRouteAcquisitionRunnerManifestQualityGateBlockedCount,
    executionAllowedNowCount: output.summary.executionAllowedNowCount,
    configuredRouteEvidenceAcquisitionAllowedNowCount: output.summary.configuredRouteEvidenceAcquisitionAllowedNowCount,
    controlledRouteAcquisitionAllowedNowCount: output.summary.controlledRouteAcquisitionAllowedNowCount,
    classifierAllowedNowCount: output.summary.classifierAllowedNowCount,
    classifierBlockedUntilAnchoredEvidenceAcquiredCount: output.summary.classifierBlockedUntilAnchoredEvidenceAcquiredCount,
    requiresExplicitControlledRunApprovalCount: output.summary.requiresExplicitControlledRunApprovalCount,
    laligaQualityGateCompetitionCount: output.summary.laligaQualityGateCompetitionCount,
    norwayNtfQualityGateCompetitionCount: output.summary.norwayNtfQualityGateCompetitionCount,
    sportomediaQualityGateCompetitionCount: output.summary.sportomediaQualityGateCompetitionCount,
    manifestCompleteCount: output.summary.manifestCompleteCount,
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
