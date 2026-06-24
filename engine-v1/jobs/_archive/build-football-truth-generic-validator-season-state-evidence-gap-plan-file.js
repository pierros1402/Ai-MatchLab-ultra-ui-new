#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";
const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/generic-validator-evidence-derived-season-state-dry-run-plan-2026-06-14/generic-validator-evidence-derived-season-state-dry-run-plan-2026-06-14.json";
const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/generic-validator-season-state-evidence-gap-plan-2026-06-14/generic-validator-season-state-evidence-gap-plan-2026-06-14.json";

const FAMILY_EVIDENCE_REQUIREMENTS = {
  laliga: {
    requiredSeasonStateEvidenceRoles: [
      "current official competition calendar or season page",
      "standings/table with season marker",
      "recent/final result window",
      "next-season restart/start date when completed or inactive"
    ],
    safeAcquisitionMode: "local_or_controlled_official_route_only_no_broad_search",
    dryRunClassifierPolicy: "do_not_assume_inactive_or_completed_without explicit source evidence"
  },
  norway_ntf: {
    requiredSeasonStateEvidenceRoles: [
      "current official fixture/result window",
      "current standings/table with season marker",
      "competition season status marker"
    ],
    safeAcquisitionMode: "local_or_controlled_configured_family_route_only_no_broad_search",
    dryRunClassifierPolicy: "do_not_assume_active_without current fixture/result or standings evidence"
  },
  sportomedia: {
    requiredSeasonStateEvidenceRoles: [
      "current Sportomedia fixture/result payload",
      "current standings/table payload",
      "round/match-volume evidence from payload",
      "competition season marker when available"
    ],
    safeAcquisitionMode: "local_or_controlled_sportomedia_route_only_no_broad_search",
    dryRunClassifierPolicy: "derive active only from current payload evidence, not from user hints"
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

function validateInput(input) {
  const summary = input.summary || {};

  assertSummary(summary, "dryRunPlanCompetitionCount", 6);
  assertSummary(summary, "evidenceDerivedPlanRowCount", 6);
  assertSummary(summary, "userHintInputCount", 0);
  assertSummary(summary, "hardcodedSeasonStateOverrideCount", 0);
  assertSummary(summary, "activeCurrentSeasonCandidateCount", 0);
  assertSummary(summary, "completedOrInactiveCandidateCount", 0);
  assertSummary(summary, "ambiguousSeasonStateCandidateCount", 0);
  assertSummary(summary, "unknownNeedsEvidenceCount", 6);
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

  const rows = Array.isArray(input.planRows) ? input.planRows : [];
  if (rows.length !== 6) throw new Error("Expected 6 planRows, got " + rows.length);

  for (const row of rows) {
    if (row.derivedSeasonStateCandidate !== "unknown_needs_evidence") {
      throw new Error(row.competitionSlug + ": expected unknown_needs_evidence");
    }
    if (row.userHintUsed !== false) throw new Error(row.competitionSlug + ": userHintUsed must be false");
    if (row.hardcodedSeasonStateOverrideUsed !== false) {
      throw new Error(row.competitionSlug + ": hardcodedSeasonStateOverrideUsed must be false");
    }
    if (row.fetchAllowedNow !== false || row.searchAllowedNow !== false || row.canonicalWriteEligibleNow !== false) {
      throw new Error(row.competitionSlug + ": unsafe input flags");
    }
  }

  return rows;
}

function buildGapRow(row) {
  const familyRequirements = FAMILY_EVIDENCE_REQUIREMENTS[row.reusableFamily];
  if (!familyRequirements) throw new Error("Missing evidence requirement template for family " + row.reusableFamily);

  return {
    competitionSlug: row.competitionSlug,
    reusableFamily: row.reusableFamily,
    sourceDerivedSeasonStateCandidate: row.derivedSeasonStateCandidate,
    sourceEvidenceStrength: row.evidenceStrength,
    sourceActiveEvidenceScore: row.activeEvidenceScore,
    sourceCompletedOrInactiveEvidenceScore: row.completedOrInactiveEvidenceScore,
    sourceContractOnlyEvidenceScore: row.contractOnlyEvidenceScore,

    seasonStateEvidenceGapStatus: "season_state_unknown_needs_source_evidence",
    missingEvidenceRoles: familyRequirements.requiredSeasonStateEvidenceRoles,
    safeAcquisitionMode: familyRequirements.safeAcquisitionMode,
    dryRunClassifierPolicy: familyRequirements.dryRunClassifierPolicy,

    nextAllowedStep: "build_no_write_source_evidence_probe_plan_for_configured_family_route",
    nextBlockedStep: "controlled_dry_run_validator_must_wait_until_season_state_evidence_probe_exists",

    evidenceCanClassifyActiveNow: false,
    evidenceCanClassifyCompletedOrInactiveNow: false,
    evidenceCanClassifyAmbiguousNow: false,
    evidenceMustRemainUnknownNow: true,

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
  const input = readJson(args.input);
  const planRows = validateInput(input);

  const gapRows = planRows
    .map(buildGapRow)
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-generic-validator-season-state-evidence-gap-plan-file",
    mode: "source_only_season_state_evidence_gap_plan_for_unknown_generic_validator_rows_no_fetch_no_search_no_writes_no_truth_assertions",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      evidenceDerivedSeasonStateDryRunPlan: args.input
    },
    summary: {
      evidenceGapCompetitionCount: gapRows.length,
      unknownNeedsEvidenceCompetitionCount: gapRows.filter((row) => row.seasonStateEvidenceGapStatus === "season_state_unknown_needs_source_evidence").length,
      activeClassifiableNowCount: gapRows.filter((row) => row.evidenceCanClassifyActiveNow).length,
      completedOrInactiveClassifiableNowCount: gapRows.filter((row) => row.evidenceCanClassifyCompletedOrInactiveNow).length,
      evidenceMustRemainUnknownNowCount: gapRows.filter((row) => row.evidenceMustRemainUnknownNow).length,

      laligaEvidenceGapCompetitionCount: gapRows.filter((row) => row.reusableFamily === "laliga").length,
      norwayNtfEvidenceGapCompetitionCount: gapRows.filter((row) => row.reusableFamily === "norway_ntf").length,
      sportomediaEvidenceGapCompetitionCount: gapRows.filter((row) => row.reusableFamily === "sportomedia").length,

      userHintUsedCount: gapRows.filter((row) => row.userHintUsed).length,
      hardcodedSeasonStateOverrideUsedCount: gapRows.filter((row) => row.hardcodedSeasonStateOverrideUsed).length,
      validatorReadinessDoesNotImplyActiveCount: gapRows.filter((row) => row.validatorReadinessDoesNotImplyActive).length,

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

      recommendedNextLane: "build_no_write_configured_family_season_state_source_evidence_probe_plan_for_6_unknown_rows"
    },
    counts: {
      byReusableFamily: countBy(gapRows, "reusableFamily"),
      bySeasonStateEvidenceGapStatus: countBy(gapRows, "seasonStateEvidenceGapStatus"),
      bySafeAcquisitionMode: countBy(gapRows, "safeAcquisitionMode"),
      byNextAllowedStep: countBy(gapRows, "nextAllowedStep")
    },
    guardrails: [
      "This job does not classify season state.",
      "It records that all six rows remain unknown until source evidence exists.",
      "It uses no user-provided season-state hints.",
      "It uses no hardcoded season-state overrides.",
      "Validator readiness must not imply active season state.",
      "No match today must not imply inactive.",
      "Match status must not be used as season-state truth.",
      "This plan does not fetch.",
      "This plan does not search.",
      "This plan does not write canonical data.",
      "This plan does not assert active/inactive/completed truth.",
      "This plan does not update production."
    ],
    gapRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    evidenceGapCompetitionCount: output.summary.evidenceGapCompetitionCount,
    unknownNeedsEvidenceCompetitionCount: output.summary.unknownNeedsEvidenceCompetitionCount,
    activeClassifiableNowCount: output.summary.activeClassifiableNowCount,
    completedOrInactiveClassifiableNowCount: output.summary.completedOrInactiveClassifiableNowCount,
    evidenceMustRemainUnknownNowCount: output.summary.evidenceMustRemainUnknownNowCount,
    laligaEvidenceGapCompetitionCount: output.summary.laligaEvidenceGapCompetitionCount,
    norwayNtfEvidenceGapCompetitionCount: output.summary.norwayNtfEvidenceGapCompetitionCount,
    sportomediaEvidenceGapCompetitionCount: output.summary.sportomediaEvidenceGapCompetitionCount,
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
