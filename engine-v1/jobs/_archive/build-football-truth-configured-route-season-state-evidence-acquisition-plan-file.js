#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";
const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/configured-family-season-state-source-evidence-probe-quality-gate-2026-06-14/configured-family-season-state-source-evidence-probe-quality-gate-2026-06-14.json";
const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/configured-route-season-state-evidence-acquisition-plan-2026-06-14/configured-route-season-state-evidence-acquisition-plan-2026-06-14.json";

const EXPECTED_SLUGS = ["esp.1", "esp.2", "nor.1", "nor.2", "swe.1", "swe.2"];

const FAMILY_ROUTE_TEMPLATES = {
  laliga: {
    configuredRouteFamily: "laliga",
    routeAcquisitionType: "official_route_season_state_evidence_acquisition",
    routeScope: "official_competition_route_only",
    requiredEvidenceArtifacts: [
      "official competition season/calendar page or endpoint",
      "standings/table with explicit season marker",
      "latest fixture/result window with dates",
      "completed/inactive marker if present",
      "next-season restart/start date when season is completed or inactive"
    ],
    classifierUnlockConditions: [
      "anchored season marker exists",
      "current fixture/result or final standings evidence exists",
      "completed/inactive state is supported by source text, not absence",
      "restart/start date evidence is captured when completed or inactive"
    ],
    noBroadSearchPolicy: "do_not_use_broad_search_for_laliga_season_state_acquisition"
  },
  norway_ntf: {
    configuredRouteFamily: "norway_ntf",
    routeAcquisitionType: "configured_family_route_season_state_evidence_acquisition",
    routeScope: "configured_ntf_route_only",
    requiredEvidenceArtifacts: [
      "configured NTF fixture/result route response",
      "configured NTF standings/table response with season marker",
      "current competition season/status marker when available",
      "latest result or next fixture date window"
    ],
    classifierUnlockConditions: [
      "current season marker exists",
      "current fixture/result window exists",
      "standings/table evidence exists",
      "active state is supported by current source evidence, not by validator readiness"
    ],
    noBroadSearchPolicy: "do_not_use_broad_search_for_norway_ntf_season_state_acquisition"
  },
  sportomedia: {
    configuredRouteFamily: "sportomedia",
    routeAcquisitionType: "configured_payload_route_season_state_evidence_acquisition",
    routeScope: "configured_sportomedia_payload_route_only",
    requiredEvidenceArtifacts: [
      "configured Sportomedia fixture/result payload",
      "configured Sportomedia standings/table payload",
      "round or matchday evidence from payload",
      "played match count or fixture volume evidence when available",
      "competition season marker when available"
    ],
    classifierUnlockConditions: [
      "payload contains current season marker or current competition context",
      "fixture/result payload contains dated matches",
      "standings/table payload exists",
      "round/match-volume evidence is anchored in payload, not user observation"
    ],
    noBroadSearchPolicy: "do_not_use_broad_search_for_sportomedia_season_state_acquisition"
  }
};

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

function validateQualityGate(input) {
  const summary = input.summary || {};

  assertSummary(summary, "sourceEvidenceProbeQualityGateCompetitionCount", 6);
  assertSummary(summary, "sourceEvidenceProbeQualityGateRowsEmitted", 6);
  assertSummary(summary, "anchoredActiveSignalCandidateCount", 0);
  assertSummary(summary, "anchoredCompletedOrInactiveSignalCandidateCount", 0);
  assertSummary(summary, "anchoredConflictingSignalCandidateCount", 0);
  assertSummary(summary, "signalNoiseOnlyNeedsConfiguredRouteEvidenceCount", 6);
  assertSummary(summary, "canProceedToControlledDryRunClassifierCount", 0);
  assertSummary(summary, "evidenceCanClassifySeasonStateNowCount", 0);
  assertSummary(summary, "laligaQualityGateCompetitionCount", 2);
  assertSummary(summary, "norwayNtfQualityGateCompetitionCount", 2);
  assertSummary(summary, "sportomediaQualityGateCompetitionCount", 2);
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
    if (row.qualityGateStatus !== "season_state_signal_noise_only_needs_configured_route_evidence") {
      throw new Error(row.competitionSlug + ": expected noise-only status");
    }
    if (row.canProceedToControlledDryRunClassifier !== false) {
      throw new Error(row.competitionSlug + ": must not proceed to classifier");
    }
    if (row.evidenceCanClassifySeasonStateNow !== false) {
      throw new Error(row.competitionSlug + ": must not classify season state");
    }
    if (row.userHintUsed !== false || row.hardcodedSeasonStateOverrideUsed !== false) {
      throw new Error(row.competitionSlug + ": hints/overrides must be false");
    }
    if (row.fetchAllowedNow !== false || row.searchAllowedNow !== false || row.canonicalWriteEligibleNow !== false) {
      throw new Error(row.competitionSlug + ": unsafe quality gate flag");
    }
  }

  return rows;
}

function buildAcquisitionRow(row) {
  const template = FAMILY_ROUTE_TEMPLATES[row.reusableFamily];
  if (!template) throw new Error("Missing route template for " + row.reusableFamily);

  return {
    competitionSlug: row.competitionSlug,
    reusableFamily: row.reusableFamily,

    sourceQualityGateStatus: row.qualityGateStatus,
    sourceQualityGateFinding: row.qualityGateFinding,
    sourceNextAllowedStep: row.nextAllowedStep,

    configuredRouteFamily: template.configuredRouteFamily,
    routeAcquisitionType: template.routeAcquisitionType,
    routeScope: template.routeScope,
    requiredEvidenceArtifacts: template.requiredEvidenceArtifacts,
    classifierUnlockConditions: template.classifierUnlockConditions,
    noBroadSearchPolicy: template.noBroadSearchPolicy,

    configuredRouteEvidenceAcquisitionPlanStatus: "configured_route_season_state_evidence_acquisition_plan_ready_no_fetch",
    configuredRouteEvidenceAcquisitionRequired: true,
    configuredRouteEvidenceAcquisitionAllowedNow: false,
    requiresExplicitControlledRunApproval: true,
    classifierAllowedNow: false,
    classifierBlockedUntilAnchoredEvidenceAcquired: true,

    acquisitionMustCaptureActiveEvidence: true,
    acquisitionMustCaptureCompletedOrInactiveEvidence: true,
    acquisitionMustCaptureRestartDateWhenCompletedOrInactive: true,
    acquisitionMustRejectZeroResultAsAbsence: true,
    acquisitionMustRejectMatchStatusOnlySeasonState: true,
    acquisitionMustRejectValidatorReadinessAsActive: true,

    nextAllowedStep: "build_controlled_configured_route_acquisition_runner_manifest_no_broad_search_no_write",
    nextBlockedStep: "season_state_classifier_and_canonical_write_blocked_until_anchored_source_evidence",

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
  const sourceRows = validateQualityGate(input);

  const acquisitionRows = sourceRows
    .map(buildAcquisitionRow)
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-configured-route-season-state-evidence-acquisition-plan-file",
    mode: "source_only_configured_route_season_state_evidence_acquisition_plan_no_broad_search_no_fetch_no_writes_no_truth_assertions",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      sourceEvidenceProbeQualityGate: args.input
    },
    summary: {
      configuredRouteEvidenceAcquisitionPlanCompetitionCount: acquisitionRows.length,
      configuredRouteEvidenceAcquisitionPlanReadyCompetitionCount: acquisitionRows.filter((row) =>
        row.configuredRouteEvidenceAcquisitionPlanStatus === "configured_route_season_state_evidence_acquisition_plan_ready_no_fetch"
      ).length,
      configuredRouteEvidenceAcquisitionPlanBlockedCompetitionCount: 0,

      configuredRouteEvidenceAcquisitionRequiredCount: acquisitionRows.filter((row) => row.configuredRouteEvidenceAcquisitionRequired).length,
      configuredRouteEvidenceAcquisitionAllowedNowCount: acquisitionRows.filter((row) => row.configuredRouteEvidenceAcquisitionAllowedNow).length,
      controlledRouteAcquisitionAllowedNowCount: acquisitionRows.filter((row) => row.controlledRouteAcquisitionAllowedNow).length,
      requiresExplicitControlledRunApprovalCount: acquisitionRows.filter((row) => row.requiresExplicitControlledRunApproval).length,

      classifierAllowedNowCount: acquisitionRows.filter((row) => row.classifierAllowedNow).length,
      classifierBlockedUntilAnchoredEvidenceAcquiredCount: acquisitionRows.filter((row) => row.classifierBlockedUntilAnchoredEvidenceAcquired).length,

      laligaAcquisitionPlanCompetitionCount: acquisitionRows.filter((row) => row.reusableFamily === "laliga").length,
      norwayNtfAcquisitionPlanCompetitionCount: acquisitionRows.filter((row) => row.reusableFamily === "norway_ntf").length,
      sportomediaAcquisitionPlanCompetitionCount: acquisitionRows.filter((row) => row.reusableFamily === "sportomedia").length,

      userHintUsedCount: acquisitionRows.filter((row) => row.userHintUsed).length,
      hardcodedSeasonStateOverrideUsedCount: acquisitionRows.filter((row) => row.hardcodedSeasonStateOverrideUsed).length,
      validatorReadinessDoesNotImplyActiveCount: acquisitionRows.filter((row) => row.validatorReadinessDoesNotImplyActive).length,

      fetchAllowedNowCount: 0,
      searchAllowedNowCount: 0,
      broadSearchAllowedNowCount: 0,
      controlledDiscoveryAllowedNowCount: 0,
      canonicalPromotionAllowedNowCount: 0,
      canonicalWriteEligibleNowCount: 0,
      truthAssertionsAllowedNowCount: 0,
      activeAssertedCount: 0,
      inactiveAssertedCount: 0,
      completedAssertedCount: 0,
      canonicalWrites: 0,
      productionWrite: false,

      recommendedNextLane: "build_controlled_configured_route_acquisition_runner_manifest_no_broad_search_no_write"
    },
    counts: {
      byReusableFamily: countBy(acquisitionRows, "reusableFamily"),
      byRouteAcquisitionType: countBy(acquisitionRows, "routeAcquisitionType"),
      byRouteScope: countBy(acquisitionRows, "routeScope"),
      byConfiguredRouteEvidenceAcquisitionPlanStatus: countBy(acquisitionRows, "configuredRouteEvidenceAcquisitionPlanStatus"),
      byNextAllowedStep: countBy(acquisitionRows, "nextAllowedStep")
    },
    guardrails: [
      "This is a source-only acquisition plan; it does not fetch.",
      "This plan does not search.",
      "Broad search remains forbidden.",
      "Controlled route acquisition is not allowed now; it requires a later explicit runner manifest and approval gate.",
      "Season-state classifier is blocked until anchored source evidence is acquired.",
      "Canonical write is blocked.",
      "No active/inactive/completed truth is asserted.",
      "No user-provided season-state hints are used.",
      "No hardcoded season-state overrides are used.",
      "Validator readiness must not imply active season state.",
      "No match today must not imply inactive.",
      "Match status alone must not be used as season-state truth.",
      "Zero result must not imply absence."
    ],
    acquisitionRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    configuredRouteEvidenceAcquisitionPlanCompetitionCount: output.summary.configuredRouteEvidenceAcquisitionPlanCompetitionCount,
    configuredRouteEvidenceAcquisitionPlanReadyCompetitionCount: output.summary.configuredRouteEvidenceAcquisitionPlanReadyCompetitionCount,
    configuredRouteEvidenceAcquisitionPlanBlockedCompetitionCount: output.summary.configuredRouteEvidenceAcquisitionPlanBlockedCompetitionCount,
    configuredRouteEvidenceAcquisitionRequiredCount: output.summary.configuredRouteEvidenceAcquisitionRequiredCount,
    configuredRouteEvidenceAcquisitionAllowedNowCount: output.summary.configuredRouteEvidenceAcquisitionAllowedNowCount,
    controlledRouteAcquisitionAllowedNowCount: output.summary.controlledRouteAcquisitionAllowedNowCount,
    requiresExplicitControlledRunApprovalCount: output.summary.requiresExplicitControlledRunApprovalCount,
    classifierAllowedNowCount: output.summary.classifierAllowedNowCount,
    classifierBlockedUntilAnchoredEvidenceAcquiredCount: output.summary.classifierBlockedUntilAnchoredEvidenceAcquiredCount,
    laligaAcquisitionPlanCompetitionCount: output.summary.laligaAcquisitionPlanCompetitionCount,
    norwayNtfAcquisitionPlanCompetitionCount: output.summary.norwayNtfAcquisitionPlanCompetitionCount,
    sportomediaAcquisitionPlanCompetitionCount: output.summary.sportomediaAcquisitionPlanCompetitionCount,
    userHintUsedCount: output.summary.userHintUsedCount,
    hardcodedSeasonStateOverrideUsedCount: output.summary.hardcodedSeasonStateOverrideUsedCount,
    validatorReadinessDoesNotImplyActiveCount: output.summary.validatorReadinessDoesNotImplyActiveCount,
    fetchAllowedNowCount: output.summary.fetchAllowedNowCount,
    searchAllowedNowCount: output.summary.searchAllowedNowCount,
    broadSearchAllowedNowCount: output.summary.broadSearchAllowedNowCount,
    controlledDiscoveryAllowedNowCount: output.summary.controlledDiscoveryAllowedNowCount,
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
