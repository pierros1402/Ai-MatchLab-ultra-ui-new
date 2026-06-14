#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";
const DEFAULT_EXECUTOR =
  "data/football-truth/_diagnostics/generic-validator-no-write-local-executor-2026-06-14/generic-validator-no-write-local-executor-2026-06-14.json";
const DEFAULT_QUALITY_GATE =
  "data/football-truth/_diagnostics/generic-validator-no-write-local-executor-quality-gate-2026-06-14/generic-validator-no-write-local-executor-quality-gate-2026-06-14.json";
const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/generic-validator-evidence-derived-season-state-dry-run-plan-2026-06-14/generic-validator-evidence-derived-season-state-dry-run-plan-2026-06-14.json";

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    executor: DEFAULT_EXECUTOR,
    qualityGate: DEFAULT_QUALITY_GATE,
    output: DEFAULT_OUTPUT
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--executor") args.executor = argv[++i];
    else if (arg === "--quality-gate") args.qualityGate = argv[++i];
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

function validateExecutor(executor) {
  const summary = executor.summary || {};
  assertSummary(summary, "localExecutorCompetitionCount", 6);
  assertSummary(summary, "localExecutorReadyObservationCount", 6);
  assertSummary(summary, "localExecutorWeakObservationCount", 0);
  assertSummary(summary, "localExecutorBlockedObservationCount", 0);
  assertSummary(summary, "localEvidenceFileReferenceCount", 24);
  assertSummary(summary, "localEvidenceFilesWithMatchesCount", 18);
  assertSummary(summary, "localEvidenceMatchedObjectCount", 38);
  assertSummary(summary, "concreteObservationRowsEmitted", 6);
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

  const rows = Array.isArray(executor.observationRows) ? executor.observationRows : [];
  if (rows.length !== 6) throw new Error("Expected 6 executor observationRows, got " + rows.length);

  return rows;
}

function validateQualityGate(qualityGate) {
  const summary = qualityGate.summary || {};
  assertSummary(summary, "qualityGateCompetitionCount", 6);
  assertSummary(summary, "qualityGatePassedCompetitionCount", 6);
  assertSummary(summary, "qualityGateStrongCompetitionCount", 6);
  assertSummary(summary, "qualityGateWeakCompetitionCount", 0);
  assertSummary(summary, "qualityGateBlockedCompetitionCount", 0);
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

  const rows = Array.isArray(qualityGate.qualityGateRows) ? qualityGate.qualityGateRows : [];
  if (rows.length !== 6) throw new Error("Expected 6 qualityGateRows, got " + rows.length);

  return rows;
}

function flattenEvidenceText(value) {
  return JSON.stringify(value || {})
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function countHits(text, patterns) {
  let score = 0;
  const hits = [];

  for (const pattern of patterns) {
    const regex = pattern instanceof RegExp ? pattern : new RegExp(pattern, "i");
    if (regex.test(text)) {
      score += 1;
      hits.push(String(pattern));
    }
  }

  return { score, hits };
}

function deriveSeasonState(row, qualityRow) {
  const evidenceText = flattenEvidenceText({
    competitionSlug: row.competitionSlug,
    reusableFamily: row.reusableFamily,
    signals: row.signals,
    fileObservations: row.fileObservations,
    qualityRow
  });

  const activePatterns = [
    /\bactive_current_season\b/,
    /\bactive\b/,
    /\bin_progress\b/,
    /\bcurrent fixture\b/,
    /\bcurrent fixtures\b/,
    /\bupcoming\b/,
    /\bnext match\b/,
    /\bfixture window\b/,
    /\brecent result\b/,
    /\brecent results\b/,
    /\bstandings\b/,
    /\blive\b/,
    /\branked\b/
  ];

  const completedPatterns = [
    /\bcompleted\b/,
    /\bfinished\b/,
    /\bfinal standings\b/,
    /\bfinal table\b/,
    /\bseason finished\b/,
    /\bseason completed\b/,
    /\bchampion\b/,
    /\bwinner\b/,
    /\bclosed\b/,
    /\binactive\b/,
    /\bnext season\b/,
    /\brestart\b/,
    /\bstart date\b/
  ];

  const contractOnlyPatterns = [
    /\bvalidator\b/,
    /\bcontract\b/,
    /\bready\b/,
    /\bfamily\b/,
    /\broute\b/,
    /\bsource_only\b/,
    /\bno_write\b/
  ];

  const active = countHits(evidenceText, activePatterns);
  const completed = countHits(evidenceText, completedPatterns);
  const contractOnly = countHits(evidenceText, contractOnlyPatterns);

  let derivedSeasonStateCandidate = "unknown_needs_evidence";
  let evidenceStrength = "insufficient_season_state_evidence";
  let nextRequiredEvidence = [
    "trusted season-state source signal",
    "current fixture/result window for active candidates",
    "final standings/results and next-season restart/start date for inactive/completed candidates"
  ];

  if (active.score >= 3 && completed.score < 2) {
    derivedSeasonStateCandidate = "active_current_season_candidate";
    evidenceStrength = "evidence_suggests_active_current_season_candidate";
    nextRequiredEvidence = [
      "validate current fixture/result window",
      "validate standings or recent results",
      "confirm season-state source signal"
    ];
  } else if (completed.score >= 3 && active.score < 2) {
    derivedSeasonStateCandidate = "completed_or_inactive_candidate";
    evidenceStrength = "evidence_suggests_completed_or_inactive_candidate";
    nextRequiredEvidence = [
      "validate completed/inactive season-state source signal",
      "validate final standings or last results",
      "seek next-season restart/start date where available"
    ];
  } else if (active.score >= 2 && completed.score >= 2) {
    derivedSeasonStateCandidate = "ambiguous_active_vs_completed_needs_review";
    evidenceStrength = "conflicting_season_state_evidence";
    nextRequiredEvidence = [
      "separate historical/current-season evidence",
      "identify authoritative current season marker",
      "avoid active/inactive assertion until conflict is resolved"
    ];
  }

  return {
    derivedSeasonStateCandidate,
    evidenceStrength,
    activeEvidenceScore: active.score,
    completedOrInactiveEvidenceScore: completed.score,
    contractOnlyEvidenceScore: contractOnly.score,
    activeEvidenceHits: active.hits,
    completedOrInactiveEvidenceHits: completed.hits,
    contractOnlyEvidenceHits: contractOnly.hits,
    nextRequiredEvidence
  };
}

function main() {
  const args = parseArgs(process.argv);
  const executor = readJson(args.executor);
  const qualityGate = readJson(args.qualityGate);

  const observationRows = validateExecutor(executor);
  const qualityRows = validateQualityGate(qualityGate);
  const qualityBySlug = new Map(qualityRows.map((row) => [row.competitionSlug, row]));

  const planRows = observationRows
    .map((row) => {
      const qualityRow = qualityBySlug.get(row.competitionSlug);
      if (!qualityRow) throw new Error("Missing quality gate row for " + row.competitionSlug);

      const derived = deriveSeasonState(row, qualityRow);

      return {
        competitionSlug: row.competitionSlug,
        reusableFamily: row.reusableFamily,
        sourceObservationStatus: row.observationStatus,
        sourceQualityGateStatus: qualityRow.qualityGateStatus,
        observationStrengthScore: qualityRow.observationStrengthScore,
        derivedSeasonStateCandidate: derived.derivedSeasonStateCandidate,
        evidenceStrength: derived.evidenceStrength,
        activeEvidenceScore: derived.activeEvidenceScore,
        completedOrInactiveEvidenceScore: derived.completedOrInactiveEvidenceScore,
        contractOnlyEvidenceScore: derived.contractOnlyEvidenceScore,
        activeEvidenceHits: derived.activeEvidenceHits,
        completedOrInactiveEvidenceHits: derived.completedOrInactiveEvidenceHits,
        contractOnlyEvidenceHits: derived.contractOnlyEvidenceHits,
        nextRequiredEvidence: derived.nextRequiredEvidence,
        planStatus:
          derived.derivedSeasonStateCandidate === "unknown_needs_evidence"
            ? "season_state_dry_run_plan_ready_but_state_unknown_needs_evidence"
            : "season_state_dry_run_plan_ready_with_evidence_derived_candidate_no_write",
        evidenceDerivedOnly: true,
        userHintUsed: false,
        hardcodedSeasonStateOverrideUsed: false,
        dryRunMustNotAssumeActiveFromValidatorReadiness: true,
        dryRunMustNotUseMatchStatusAsSeasonStateTruth: true,
        dryRunMustNotTreatNoMatchTodayAsInactive: true,
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
    })
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-generic-validator-evidence-derived-season-state-dry-run-plan-file",
    mode: "evidence_derived_season_state_dry_run_plan_no_user_hints_no_fetch_no_search_no_writes_no_truth_assertions",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      genericValidatorNoWriteLocalExecutor: args.executor,
      genericValidatorNoWriteLocalExecutorQualityGate: args.qualityGate
    },
    summary: {
      dryRunPlanCompetitionCount: planRows.length,
      evidenceDerivedPlanRowCount: planRows.length,
      userHintInputCount: 0,
      hardcodedSeasonStateOverrideCount: 0,

      activeCurrentSeasonCandidateCount: planRows.filter((row) => row.derivedSeasonStateCandidate === "active_current_season_candidate").length,
      completedOrInactiveCandidateCount: planRows.filter((row) => row.derivedSeasonStateCandidate === "completed_or_inactive_candidate").length,
      ambiguousSeasonStateCandidateCount: planRows.filter((row) => row.derivedSeasonStateCandidate === "ambiguous_active_vs_completed_needs_review").length,
      unknownNeedsEvidenceCount: planRows.filter((row) => row.derivedSeasonStateCandidate === "unknown_needs_evidence").length,

      laligaDryRunPlanCompetitionCount: planRows.filter((row) => row.reusableFamily === "laliga").length,
      norwayNtfDryRunPlanCompetitionCount: planRows.filter((row) => row.reusableFamily === "norway_ntf").length,
      sportomediaDryRunPlanCompetitionCount: planRows.filter((row) => row.reusableFamily === "sportomedia").length,

      validatorReadinessDoesNotImplyActiveCount: planRows.length,
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
        planRows.some((row) => row.derivedSeasonStateCandidate === "unknown_needs_evidence")
          ? "build_source_evidence_gap_plan_for_unknown_season_state_rows_before_dry_run_validator"
          : "run_evidence_derived_controlled_dry_run_validator_no_write"
    },
    counts: {
      byReusableFamily: countBy(planRows, "reusableFamily"),
      byDerivedSeasonStateCandidate: countBy(planRows, "derivedSeasonStateCandidate"),
      byEvidenceStrength: countBy(planRows, "evidenceStrength"),
      byPlanStatus: countBy(planRows, "planStatus")
    },
    guardrails: [
      "Season state is derived only from local evidence/observation text.",
      "No user-provided league state hint is used.",
      "No hardcoded season-state override is used.",
      "Validator readiness must not imply active season state.",
      "No match today must not imply inactive.",
      "Match status must not be used as season-state truth.",
      "Unknown remains unknown when evidence is insufficient.",
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
    evidenceDerivedPlanRowCount: output.summary.evidenceDerivedPlanRowCount,
    userHintInputCount: output.summary.userHintInputCount,
    hardcodedSeasonStateOverrideCount: output.summary.hardcodedSeasonStateOverrideCount,
    activeCurrentSeasonCandidateCount: output.summary.activeCurrentSeasonCandidateCount,
    completedOrInactiveCandidateCount: output.summary.completedOrInactiveCandidateCount,
    ambiguousSeasonStateCandidateCount: output.summary.ambiguousSeasonStateCandidateCount,
    unknownNeedsEvidenceCount: output.summary.unknownNeedsEvidenceCount,
    laligaDryRunPlanCompetitionCount: output.summary.laligaDryRunPlanCompetitionCount,
    norwayNtfDryRunPlanCompetitionCount: output.summary.norwayNtfDryRunPlanCompetitionCount,
    sportomediaDryRunPlanCompetitionCount: output.summary.sportomediaDryRunPlanCompetitionCount,
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
