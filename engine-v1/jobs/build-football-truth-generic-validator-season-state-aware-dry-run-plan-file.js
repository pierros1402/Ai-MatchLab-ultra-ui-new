#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";
const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/generic-validator-no-write-local-executor-quality-gate-2026-06-14/generic-validator-no-write-local-executor-quality-gate-2026-06-14.json";
const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/generic-validator-season-state-aware-dry-run-plan-2026-06-14/generic-validator-season-state-aware-dry-run-plan-2026-06-14.json";

const EXPECTATION_HINTS = {
  "esp.1": {
    expectedSeasonStateLane: "inactive_or_completed_current_season_candidate",
    expectedActiveNow: false,
    expectedNeedsRestartDateEvidence: true,
    userObservedHint: "Spain is not active now; treat as inactive/completed candidate, not as active-season validation."
  },
  "esp.2": {
    expectedSeasonStateLane: "inactive_or_completed_current_season_candidate",
    expectedActiveNow: false,
    expectedNeedsRestartDateEvidence: true,
    userObservedHint: "Spain is not active now; treat as inactive/completed candidate, not as active-season validation."
  },
  "nor.1": {
    expectedSeasonStateLane: "active_current_season_candidate",
    expectedActiveNow: true,
    expectedNeedsRestartDateEvidence: false,
    userObservedHint: "Norway is in progress."
  },
  "nor.2": {
    expectedSeasonStateLane: "active_current_season_candidate",
    expectedActiveNow: true,
    expectedNeedsRestartDateEvidence: false,
    userObservedHint: "Norway is in progress."
  },
  "swe.1": {
    expectedSeasonStateLane: "active_current_season_candidate",
    expectedActiveNow: true,
    expectedNeedsRestartDateEvidence: false,
    userObservedHint: "Sweden 1 is in progress; user observed 10 rounds / 80 matches.",
    userObservedRoundCount: 10,
    userObservedMatchCount: 80
  },
  "swe.2": {
    expectedSeasonStateLane: "active_current_season_candidate",
    expectedActiveNow: true,
    expectedNeedsRestartDateEvidence: false,
    userObservedHint: "Sweden is in progress."
  }
};

const EXPECTED_SLUGS = Object.keys(EXPECTATION_HINTS).sort();

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

function validateInput(gate) {
  const summary = gate.summary || {};

  assertSummary(summary, "qualityGateCompetitionCount", 6);
  assertSummary(summary, "qualityGatePassedCompetitionCount", 6);
  assertSummary(summary, "qualityGateStrongCompetitionCount", 6);
  assertSummary(summary, "qualityGateWeakCompetitionCount", 0);
  assertSummary(summary, "qualityGateBlockedCompetitionCount", 0);
  assertSummary(summary, "laligaQualityGateCompetitionCount", 2);
  assertSummary(summary, "norwayNtfQualityGateCompetitionCount", 2);
  assertSummary(summary, "sportomediaQualityGateCompetitionCount", 2);
  assertSummary(summary, "localEvidenceFileReferenceCount", 24);
  assertSummary(summary, "localEvidenceFilesWithMatchesCount", 18);
  assertSummary(summary, "localEvidenceMatchedObjectCount", 38);
  assertSummary(summary, "minimumObservationStrengthScore", 10);
  assertSummary(summary, "maximumObservationStrengthScore", 10);
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

  const rows = Array.isArray(gate.qualityGateRows) ? gate.qualityGateRows : [];
  if (rows.length !== 6) throw new Error("Expected 6 qualityGateRows, got " + rows.length);

  const slugs = uniqueSorted(rows.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Unexpected quality gate slugs: " + slugs.join(", "));
  }

  for (const row of rows) {
    if (row.qualityGateStatus !== "passed_ready_for_controlled_dry_run_validator_no_write") {
      throw new Error(row.competitionSlug + ": not ready for dry-run plan");
    }
    if (row.fetchAllowedNow !== false || row.searchAllowedNow !== false || row.canonicalWriteEligibleNow !== false) {
      throw new Error(row.competitionSlug + ": unsafe input flags");
    }
  }

  return rows;
}

function buildPlanRow(row) {
  const hint = EXPECTATION_HINTS[row.competitionSlug];

  const dryRunValidatorIntent =
    hint.expectedActiveNow === true
      ? "validate_active_current_season_evidence_without_canonical_write"
      : "validate_inactive_or_completed_current_season_evidence_and_restart_date_need_without_canonical_write";

  return {
    competitionSlug: row.competitionSlug,
    reusableFamily: row.reusableFamily,
    sourceQualityGateStatus: row.qualityGateStatus,
    observationStrengthScore: row.observationStrengthScore,
    expectedSeasonStateLane: hint.expectedSeasonStateLane,
    expectedActiveNow: hint.expectedActiveNow,
    expectedNeedsRestartDateEvidence: hint.expectedNeedsRestartDateEvidence,
    userObservedHint: hint.userObservedHint,
    userObservedRoundCount: hint.userObservedRoundCount || null,
    userObservedMatchCount: hint.userObservedMatchCount || null,
    userObservationIsCanonicalTruth: false,
    dryRunValidatorIntent,
    dryRunPlanStatus: "season_state_aware_controlled_dry_run_plan_ready_no_write",
    dryRunMustNotAssumeActiveFromValidatorReadiness: true,
    dryRunMustNotUseMatchStatusAsSeasonStateTruth: true,
    dryRunMustNotTreatNoMatchTodayAsInactive: true,
    dryRunRequiredEvidenceRoles:
      hint.expectedActiveNow === true
        ? ["current_fixture_or_result_window", "standings_or_recent_results", "season_state_source_signal"]
        : ["completed_or_inactive_state_source_signal", "final_standings_or_last_results", "next_season_restart_or_start_date_when_available"],
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
  const input = readJson(args.input);
  const gateRows = validateInput(input);

  const planRows = gateRows
    .map(buildPlanRow)
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const activeCandidateRows = planRows.filter((row) => row.expectedActiveNow === true);
  const inactiveOrCompletedCandidateRows = planRows.filter((row) => row.expectedActiveNow === false);

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-generic-validator-season-state-aware-dry-run-plan-file",
    mode: "season_state_aware_controlled_dry_run_plan_no_fetch_no_search_no_writes_no_truth_assertions",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      genericValidatorNoWriteLocalExecutorQualityGate: args.input
    },
    summary: {
      dryRunPlanCompetitionCount: planRows.length,
      dryRunPlanReadyCompetitionCount: planRows.filter((row) => row.dryRunPlanStatus.endsWith("_ready_no_write")).length,
      dryRunPlanBlockedCompetitionCount: 0,

      activeCurrentSeasonCandidateCount: activeCandidateRows.length,
      inactiveOrCompletedCurrentSeasonCandidateCount: inactiveOrCompletedCandidateRows.length,
      restartDateEvidenceNeededCandidateCount: planRows.filter((row) => row.expectedNeedsRestartDateEvidence === true).length,

      laligaDryRunPlanCompetitionCount: planRows.filter((row) => row.reusableFamily === "laliga").length,
      norwayNtfDryRunPlanCompetitionCount: planRows.filter((row) => row.reusableFamily === "norway_ntf").length,
      sportomediaDryRunPlanCompetitionCount: planRows.filter((row) => row.reusableFamily === "sportomedia").length,

      sweden1UserObservedRoundCount: 10,
      sweden1UserObservedMatchCount: 80,
      userHintsAreCanonicalTruthCount: 0,

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

      recommendedNextLane: "run_season_state_aware_controlled_dry_run_validator_no_write_for_6_competitions"
    },
    counts: {
      byReusableFamily: countBy(planRows, "reusableFamily"),
      byExpectedSeasonStateLane: countBy(planRows, "expectedSeasonStateLane"),
      byDryRunValidatorIntent: countBy(planRows, "dryRunValidatorIntent"),
      byDryRunPlanStatus: countBy(planRows, "dryRunPlanStatus")
    },
    guardrails: [
      "Validator readiness must not imply active season state.",
      "Spain is handled as inactive/completed current-season candidate based on user-observed hint, not canonical truth.",
      "Norway and Sweden are handled as active current-season candidates based on user-observed hint, not canonical truth.",
      "Sweden 1 has user-observed 10 rounds / 80 matches as a validation expectation, not canonical truth.",
      "No match today must not imply inactive.",
      "Match status must not be used as season-state truth.",
      "Completed/inactive candidates require restart/start date evidence where available.",
      "This plan does not fetch.",
      "This plan does not search.",
      "This plan does not write canonical data.",
      "This plan does not assert active/inactive/completed truth.",
      "This plan does not update production."
    ],
    planRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    dryRunPlanCompetitionCount: output.summary.dryRunPlanCompetitionCount,
    dryRunPlanReadyCompetitionCount: output.summary.dryRunPlanReadyCompetitionCount,
    dryRunPlanBlockedCompetitionCount: output.summary.dryRunPlanBlockedCompetitionCount,
    activeCurrentSeasonCandidateCount: output.summary.activeCurrentSeasonCandidateCount,
    inactiveOrCompletedCurrentSeasonCandidateCount: output.summary.inactiveOrCompletedCurrentSeasonCandidateCount,
    restartDateEvidenceNeededCandidateCount: output.summary.restartDateEvidenceNeededCandidateCount,
    laligaDryRunPlanCompetitionCount: output.summary.laligaDryRunPlanCompetitionCount,
    norwayNtfDryRunPlanCompetitionCount: output.summary.norwayNtfDryRunPlanCompetitionCount,
    sportomediaDryRunPlanCompetitionCount: output.summary.sportomediaDryRunPlanCompetitionCount,
    sweden1UserObservedRoundCount: output.summary.sweden1UserObservedRoundCount,
    sweden1UserObservedMatchCount: output.summary.sweden1UserObservedMatchCount,
    userHintsAreCanonicalTruthCount: output.summary.userHintsAreCanonicalTruthCount,
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
