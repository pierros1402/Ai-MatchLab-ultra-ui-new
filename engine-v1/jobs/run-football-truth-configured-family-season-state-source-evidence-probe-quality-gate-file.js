#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";
const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/configured-family-season-state-source-evidence-probe-2026-06-14/configured-family-season-state-source-evidence-probe-2026-06-14.json";
const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/configured-family-season-state-source-evidence-probe-quality-gate-2026-06-14/configured-family-season-state-source-evidence-probe-quality-gate-2026-06-14.json";

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

function validateProbe(probe) {
  const summary = probe.summary || {};

  assertSummary(summary, "sourceEvidenceProbeCompetitionCount", 6);
  assertSummary(summary, "sourceEvidenceProbeRowsEmitted", 6);
  assertSummary(summary, "activeSignalDetectedCount", 0);
  assertSummary(summary, "completedOrInactiveSignalDetectedCount", 0);
  assertSummary(summary, "conflictingSignalDetectedCount", 6);
  assertSummary(summary, "weakSignalDetectedCount", 0);
  assertSummary(summary, "absentSignalCount", 0);
  assertSummary(summary, "laligaProbeCompetitionCount", 2);
  assertSummary(summary, "norwayNtfProbeCompetitionCount", 2);
  assertSummary(summary, "sportomediaProbeCompetitionCount", 2);
  assertSummary(summary, "readableLocalProbeInputFileCount", 18);
  assertSummary(summary, "probeMatchedObjectCount", 38);
  assertSummary(summary, "configuredPlanMatchedObjectCount", 38);
  assertSummary(summary, "evidenceCanClassifySeasonStateNowCount", 0);
  assertSummary(summary, "evidenceSignalRequiresQualityGateCount", 6);
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

  const rows = Array.isArray(probe.probeRows) ? probe.probeRows : [];
  if (rows.length !== 6) throw new Error("Expected 6 probeRows, got " + rows.length);

  const slugs = uniqueSorted(rows.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Unexpected probe slugs: " + slugs.join(", "));
  }

  return rows;
}

function flattenSamples(row) {
  const parts = [];

  for (const file of row.readableFiles || []) {
    for (const match of file.matchedObjects || []) {
      parts.push(JSON.stringify({
        filePath: file.filePath,
        location: match.location,
        sample: match.sample
      }).toLowerCase());
    }
  }

  return parts.join(" ");
}

function hasAnchoredActiveEvidence(text) {
  const activeAnchors = [
    /\bcurrent season\b/,
    /\bin progress\b/,
    /\bin_progress\b/,
    /\bongoing\b/,
    /\bupcoming fixture\b/,
    /\bnext fixture\b/,
    /\brecent result\b/,
    /\bround\s+\d+\b/,
    /\bmatchday\s+\d+\b/,
    /\bplayed\b/,
    /\bstandings\b.*\bpoints\b/,
    /\bfixture\b.*\bdate\b/,
    /\bresults\b.*\bdate\b/
  ];

  return activeAnchors.filter((pattern) => pattern.test(text)).map(String);
}

function hasAnchoredCompletedEvidence(text) {
  const completedAnchors = [
    /\bseason completed\b/,
    /\bseason finished\b/,
    /\bfinal standings\b/,
    /\bfinal table\b/,
    /\bcompleted season\b/,
    /\binactive between seasons\b/,
    /\bnext season start\b/,
    /\bseason restart\b/,
    /\bchampion\b.*\bseason\b/,
    /\bwinner\b.*\bfinal\b/
  ];

  return completedAnchors.filter((pattern) => pattern.test(text)).map(String);
}

function detectNoiseOnly(text) {
  const noisePatterns = [
    /\bno active\b/,
    /\bactiveassertednow\b/,
    /\binactiveassertednow\b/,
    /\bcompletedassertednow\b/,
    /\btruthassertionsallowednow\b/,
    /\bvalidator readiness\b/,
    /\bcontract\b/,
    /\bguardrail\b/,
    /\bmust not imply\b/,
    /\bnot imply inactive\b/,
    /\bnot classify\b/,
    /\bno_truth_assertion\b/,
    /\bcanonicalwriteeligible\b/,
    /\bsource_only\b/,
    /\bno_write\b/,
    /\bready\b/
  ];

  return noisePatterns.filter((pattern) => pattern.test(text)).map(String);
}

function gateRow(row) {
  const text = flattenSamples(row);

  const activeAnchors = hasAnchoredActiveEvidence(text);
  const completedAnchors = hasAnchoredCompletedEvidence(text);
  const noiseHits = detectNoiseOnly(text);

  const activeAnchoredScore = activeAnchors.length;
  const completedAnchoredScore = completedAnchors.length;
  const noiseScore = noiseHits.length;

  let qualityGateStatus = "season_state_signal_noise_only_needs_configured_route_evidence";
  let qualityGateFinding = "conflict_not_accepted_as_season_state_evidence";

  if (activeAnchoredScore >= 2 && completedAnchoredScore === 0) {
    qualityGateStatus = "anchored_active_signal_candidate_no_truth_assertion";
    qualityGateFinding = "active_signal_can_move_to_controlled_dry_run_classifier";
  } else if (completedAnchoredScore >= 2 && activeAnchoredScore === 0) {
    qualityGateStatus = "anchored_completed_or_inactive_signal_candidate_no_truth_assertion";
    qualityGateFinding = "completed_or_inactive_signal_can_move_to_controlled_dry_run_classifier";
  } else if (activeAnchoredScore >= 1 && completedAnchoredScore >= 1) {
    qualityGateStatus = "anchored_conflicting_signal_candidate_requires_source_review";
    qualityGateFinding = "real_conflicting_anchored_signals_need_source_review";
  }

  return {
    competitionSlug: row.competitionSlug,
    reusableFamily: row.reusableFamily,
    sourceEvidenceProbeStatus: row.sourceEvidenceProbeStatus,
    qualityGateStatus,
    qualityGateFinding,

    activeSignalScore: row.activeSignalScore,
    completedOrInactiveSignalScore: row.completedOrInactiveSignalScore,
    seasonMarkerScore: row.seasonMarkerScore,
    contractOnlyScore: row.contractOnlyScore,

    anchoredActiveEvidenceScore: activeAnchoredScore,
    anchoredCompletedOrInactiveEvidenceScore: completedAnchoredScore,
    noiseOnlySignalScore: noiseScore,
    activeAnchoredHits: activeAnchors,
    completedAnchoredHits: completedAnchors,
    noiseHits,

    evidenceCanClassifySeasonStateNow: false,
    canProceedToControlledDryRunClassifier:
      qualityGateStatus === "anchored_active_signal_candidate_no_truth_assertion" ||
      qualityGateStatus === "anchored_completed_or_inactive_signal_candidate_no_truth_assertion",

    nextAllowedStep:
      qualityGateStatus === "season_state_signal_noise_only_needs_configured_route_evidence"
        ? "build_configured_route_season_state_evidence_acquisition_plan_no_broad_search"
        : "build_controlled_dry_run_classifier_from_anchored_source_evidence_no_write",

    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,
    validatorReadinessDoesNotImplyActive: true,
    noMatchTodayDoesNotImplyInactive: true,
    matchStatusIsNotSeasonStateTruth: true,

    fetchAllowedNow: false,
    searchAllowedNow: false,
    broadSearchAllowedNow: false,
    controlledDiscoveryAllowedNow: false,
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
  const probe = readJson(args.input);
  const probeRows = validateProbe(probe);

  const qualityGateRows = probeRows
    .map(gateRow)
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const activeCandidates = qualityGateRows.filter((row) =>
    row.qualityGateStatus === "anchored_active_signal_candidate_no_truth_assertion"
  );
  const completedCandidates = qualityGateRows.filter((row) =>
    row.qualityGateStatus === "anchored_completed_or_inactive_signal_candidate_no_truth_assertion"
  );
  const anchoredConflicts = qualityGateRows.filter((row) =>
    row.qualityGateStatus === "anchored_conflicting_signal_candidate_requires_source_review"
  );
  const noiseOnlyRows = qualityGateRows.filter((row) =>
    row.qualityGateStatus === "season_state_signal_noise_only_needs_configured_route_evidence"
  );

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "run-football-truth-configured-family-season-state-source-evidence-probe-quality-gate-file",
    mode: "no_write_quality_gate_for_local_source_evidence_probe_distinguish_anchored_evidence_from_noise",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      configuredFamilySeasonStateSourceEvidenceProbe: args.input
    },
    summary: {
      sourceEvidenceProbeQualityGateCompetitionCount: qualityGateRows.length,
      sourceEvidenceProbeQualityGateRowsEmitted: qualityGateRows.length,

      anchoredActiveSignalCandidateCount: activeCandidates.length,
      anchoredCompletedOrInactiveSignalCandidateCount: completedCandidates.length,
      anchoredConflictingSignalCandidateCount: anchoredConflicts.length,
      signalNoiseOnlyNeedsConfiguredRouteEvidenceCount: noiseOnlyRows.length,

      canProceedToControlledDryRunClassifierCount: qualityGateRows.filter((row) => row.canProceedToControlledDryRunClassifier).length,
      evidenceCanClassifySeasonStateNowCount: 0,

      laligaQualityGateCompetitionCount: qualityGateRows.filter((row) => row.reusableFamily === "laliga").length,
      norwayNtfQualityGateCompetitionCount: qualityGateRows.filter((row) => row.reusableFamily === "norway_ntf").length,
      sportomediaQualityGateCompetitionCount: qualityGateRows.filter((row) => row.reusableFamily === "sportomedia").length,

      userHintUsedCount: qualityGateRows.filter((row) => row.userHintUsed).length,
      hardcodedSeasonStateOverrideUsedCount: qualityGateRows.filter((row) => row.hardcodedSeasonStateOverrideUsed).length,
      validatorReadinessDoesNotImplyActiveCount: qualityGateRows.filter((row) => row.validatorReadinessDoesNotImplyActive).length,

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

      recommendedNextLane:
        noiseOnlyRows.length > 0 || anchoredConflicts.length > 0
          ? "build_configured_route_season_state_evidence_acquisition_plan_no_broad_search"
          : "build_controlled_dry_run_classifier_from_anchored_source_evidence_no_write"
    },
    counts: {
      byReusableFamily: countBy(qualityGateRows, "reusableFamily"),
      byQualityGateStatus: countBy(qualityGateRows, "qualityGateStatus"),
      byQualityGateFinding: countBy(qualityGateRows, "qualityGateFinding"),
      byNextAllowedStep: countBy(qualityGateRows, "nextAllowedStep")
    },
    guardrails: [
      "This quality gate does not classify season state.",
      "It distinguishes anchored season-state evidence from generic signal noise.",
      "It uses no user-provided season-state hints.",
      "It uses no hardcoded season-state overrides.",
      "Validator readiness must not imply active season state.",
      "No match today must not imply inactive.",
      "Match status must not be used as season-state truth.",
      "It does not fetch.",
      "It does not search.",
      "It does not write canonical data.",
      "It does not assert active/inactive/completed truth.",
      "It does not update production."
    ],
    qualityGateRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    sourceEvidenceProbeQualityGateCompetitionCount: output.summary.sourceEvidenceProbeQualityGateCompetitionCount,
    sourceEvidenceProbeQualityGateRowsEmitted: output.summary.sourceEvidenceProbeQualityGateRowsEmitted,
    anchoredActiveSignalCandidateCount: output.summary.anchoredActiveSignalCandidateCount,
    anchoredCompletedOrInactiveSignalCandidateCount: output.summary.anchoredCompletedOrInactiveSignalCandidateCount,
    anchoredConflictingSignalCandidateCount: output.summary.anchoredConflictingSignalCandidateCount,
    signalNoiseOnlyNeedsConfiguredRouteEvidenceCount: output.summary.signalNoiseOnlyNeedsConfiguredRouteEvidenceCount,
    canProceedToControlledDryRunClassifierCount: output.summary.canProceedToControlledDryRunClassifierCount,
    evidenceCanClassifySeasonStateNowCount: output.summary.evidenceCanClassifySeasonStateNowCount,
    laligaQualityGateCompetitionCount: output.summary.laligaQualityGateCompetitionCount,
    norwayNtfQualityGateCompetitionCount: output.summary.norwayNtfQualityGateCompetitionCount,
    sportomediaQualityGateCompetitionCount: output.summary.sportomediaQualityGateCompetitionCount,
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
