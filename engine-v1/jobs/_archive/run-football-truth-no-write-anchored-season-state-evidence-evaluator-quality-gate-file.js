#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";
const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/no-write-anchored-season-state-evidence-evaluator-2026-06-14/no-write-anchored-season-state-evidence-evaluator-2026-06-14.json";
const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/no-write-anchored-season-state-evidence-evaluator-quality-gate-2026-06-14/no-write-anchored-season-state-evidence-evaluator-quality-gate-2026-06-14.json";

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

function validateEvaluator(input) {
  const summary = input.summary || {};

  assertSummary(summary, "anchoredSeasonStateEvidenceEvaluatorCompetitionCount", 6);
  assertSummary(summary, "anchoredSeasonStateEvidenceEvaluatorReadyCount", 6);
  assertSummary(summary, "anchoredSeasonStateEvidenceEvaluatorBlockedCount", 0);
  assertSummary(summary, "currentSeasonDataCandidateCount", 6);
  assertSummary(summary, "seasonEvidenceCandidateCompetitionCount", 6);
  assertSummary(summary, "fixtureResultEvidenceCandidateCompetitionCount", 6);
  assertSummary(summary, "standingsEvidenceCandidateCompetitionCount", 6);
  assertSummary(summary, "evaluatorCanProceedToNoWriteQualityGateCount", 6);
  assertSummary(summary, "evaluatorMayClassifySeasonStateNowCount", 0);
  assertSummary(summary, "evaluatorMayAssertTruthNowCount", 0);
  assertSummary(summary, "evaluatorMayWriteCanonicalNowCount", 0);

  assertSummary(summary, "laligaEvaluatorCompetitionCount", 2);
  assertSummary(summary, "norwayNtfEvaluatorCompetitionCount", 2);
  assertSummary(summary, "sportomediaEvaluatorCompetitionCount", 2);

  assertSummary(summary, "fetchExecutedNowCount", 0);
  assertSummary(summary, "searchExecutedNowCount", 0);
  assertSummary(summary, "broadSearchExecutedNowCount", 0);
  assertSummary(summary, "classifierExecutedNowCount", 0);
  assertSummary(summary, "canonicalWriteExecutedNowCount", 0);
  assertSummary(summary, "productionWriteExecutedNowCount", 0);
  assertSummary(summary, "activeAssertedCount", 0);
  assertSummary(summary, "inactiveAssertedCount", 0);
  assertSummary(summary, "completedAssertedCount", 0);
  assertSummary(summary, "seasonStateTruthAssertedCount", 0);
  assertSummary(summary, "anchorEvidenceIsTruthAssertionCount", 0);
  assertSummary(summary, "structuralRouteKindAnchorsAreTruthAssertionCount", 0);
  assertSummary(summary, "canonicalWrites", 0);
  assertSummary(summary, "productionWrite", false);
  assertSummary(summary, "userHintUsedCount", 0);
  assertSummary(summary, "hardcodedSeasonStateOverrideUsedCount", 0);

  if (summary.totalSeasonEvidenceCandidateCount < 6) throw new Error("Expected season evidence candidates.");
  if (summary.totalFixtureResultEvidenceCandidateCount < 6) throw new Error("Expected fixture/result evidence candidates.");
  if (summary.totalStandingsEvidenceCandidateCount < 6) throw new Error("Expected standings evidence candidates.");

  const rows = Array.isArray(input.evaluatorRows) ? input.evaluatorRows : [];
  if (rows.length !== 6) throw new Error("Expected 6 evaluatorRows, got " + rows.length);

  const slugs = uniqueSorted(rows.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Unexpected evaluator slugs: " + slugs.join(", "));
  }

  for (const row of rows) {
    if (row.anchoredEvidenceEvaluatorStatus !== "ready_for_no_write_evidence_evaluator_quality_gate") {
      throw new Error(row.competitionSlug + ": evaluator is not quality-gate ready");
    }
    if (row.currentSeasonDataCandidate !== true) throw new Error(row.competitionSlug + ": currentSeasonDataCandidate must be true");
    if (row.hasSeasonEvidenceCandidate !== true) throw new Error(row.competitionSlug + ": missing season evidence candidate");
    if (row.hasFixtureResultEvidenceCandidate !== true) throw new Error(row.competitionSlug + ": missing fixture/result evidence candidate");
    if (row.hasStandingsEvidenceCandidate !== true) throw new Error(row.competitionSlug + ": missing standings evidence candidate");
    if (row.evaluatorCanProceedToNoWriteQualityGate !== true) {
      throw new Error(row.competitionSlug + ": evaluatorCanProceedToNoWriteQualityGate must be true");
    }

    if (row.evaluatorMayClassifySeasonStateNow !== false) throw new Error(row.competitionSlug + ": evaluator must not classify now");
    if (row.evaluatorMayAssertTruthNow !== false) throw new Error(row.competitionSlug + ": evaluator must not assert truth now");
    if (row.evaluatorMayWriteCanonicalNow !== false) throw new Error(row.competitionSlug + ": evaluator must not write canonical now");

    if (row.activeAssertedNow !== false || row.inactiveAssertedNow !== false || row.completedAssertedNow !== false) {
      throw new Error(row.competitionSlug + ": active/inactive/completed assertions must remain false");
    }
    if (row.seasonStateTruthAssertedNow !== false || row.classifierExecutedNow !== false) {
      throw new Error(row.competitionSlug + ": classifier/truth assertion must remain false");
    }
    if (row.canonicalWriteExecutedNow !== false || row.productionWriteExecutedNow !== false) {
      throw new Error(row.competitionSlug + ": write flags must remain false");
    }
    if (row.fetchExecutedNow !== false || row.searchExecutedNow !== false || row.broadSearchExecutedNow !== false) {
      throw new Error(row.competitionSlug + ": fetch/search flags must remain false");
    }
    if (row.anchorEvidenceIsTruthAssertion !== false || row.structuralRouteKindAnchorsAreTruthAssertion !== false) {
      throw new Error(row.competitionSlug + ": anchor truth flags must remain false");
    }
    if (row.userHintUsed !== false || row.hardcodedSeasonStateOverrideUsed !== false) {
      throw new Error(row.competitionSlug + ": hints/overrides must remain false");
    }
  }

  return rows;
}

function qualityGateRow(row) {
  const blockingReasons = [];

  if (row.anchoredEvidenceEvaluatorStatus !== "ready_for_no_write_evidence_evaluator_quality_gate") blockingReasons.push("evaluator_not_ready");
  if (row.currentSeasonDataCandidate !== true) blockingReasons.push("missing_current_season_data_candidate");
  if (row.hasSeasonEvidenceCandidate !== true) blockingReasons.push("missing_season_evidence_candidate");
  if (row.hasFixtureResultEvidenceCandidate !== true) blockingReasons.push("missing_fixture_result_evidence_candidate");
  if (row.hasStandingsEvidenceCandidate !== true) blockingReasons.push("missing_standings_evidence_candidate");
  if (row.evaluatorCanProceedToNoWriteQualityGate !== true) blockingReasons.push("cannot_proceed_to_quality_gate");

  if (row.evaluatorMayClassifySeasonStateNow !== false) blockingReasons.push("evaluator_would_classify_now");
  if (row.evaluatorMayAssertTruthNow !== false) blockingReasons.push("evaluator_would_assert_truth_now");
  if (row.evaluatorMayWriteCanonicalNow !== false) blockingReasons.push("evaluator_would_write_canonical_now");
  if (row.seasonStateTruthAssertedNow !== false) blockingReasons.push("truth_asserted");
  if (row.classifierExecutedNow !== false) blockingReasons.push("classifier_executed");
  if (row.canonicalWriteExecutedNow !== false) blockingReasons.push("canonical_write_executed");
  if (row.productionWriteExecutedNow !== false) blockingReasons.push("production_write_executed");
  if (row.userHintUsed !== false) blockingReasons.push("user_hint_used");
  if (row.hardcodedSeasonStateOverrideUsed !== false) blockingReasons.push("hardcoded_override_used");

  const evidenceEvaluatorQualityGateStatus =
    blockingReasons.length === 0
      ? "passed_no_write_anchored_evidence_evaluator_quality_gate"
      : "blocked_no_write_anchored_evidence_evaluator_quality_gate";

  return {
    competitionSlug: row.competitionSlug,
    reusableFamily: row.reusableFamily,
    routeAcquisitionType: row.routeAcquisitionType,
    routeScope: row.routeScope,

    evidenceEvaluatorQualityGateStatus,
    blockingReasons,

    currentSeasonDataCandidate: row.currentSeasonDataCandidate,
    seasonEvidenceCandidateCount: row.seasonEvidenceCandidateCount,
    fixtureResultEvidenceCandidateCount: row.fixtureResultEvidenceCandidateCount,
    standingsEvidenceCandidateCount: row.standingsEvidenceCandidateCount,
    completedOrInactiveEvidenceCandidateCount: row.completedOrInactiveEvidenceCandidateCount,
    restartDateEvidenceCandidateCount: row.restartDateEvidenceCandidateCount,

    qualityGateReadyForStructuredExtractor: evidenceEvaluatorQualityGateStatus === "passed_no_write_anchored_evidence_evaluator_quality_gate",
    qualityGateReadyForClassifier: false,
    qualityGateReadyForCanonicalWrite: false,
    qualityGateReadyForTruthAssertion: false,

    activeAssertedNow: false,
    inactiveAssertedNow: false,
    completedAssertedNow: false,
    seasonStateTruthAssertedNow: false,
    classifierExecutedNow: false,
    canonicalWriteExecutedNow: false,
    productionWriteExecutedNow: false,
    fetchExecutedNow: false,
    searchExecutedNow: false,
    broadSearchExecutedNow: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    noMatchTodayDoesNotImplyInactive: true,
    zeroResultDoesNotImplyAbsence: true,
    currentSeasonDataCandidateIsNotActiveTruth: true,
    missingCompletedInactiveCandidateDoesNotProveActive: true,
    missingRestartDateCandidateDoesNotProveAbsence: true,
    anchorEvidenceIsTruthAssertion: false,
    structuralRouteKindAnchorsAreTruthAssertion: false,

    nextAllowedStep: "build_no_write_structured_season_state_stats_extractor",
    nextBlockedStep: "season_state_classifier_canonical_write_and_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const evaluator = readJson(args.input);
  const evaluatorRows = validateEvaluator(evaluator);

  const qualityGateRows = evaluatorRows
    .map(qualityGateRow)
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const passedRows = qualityGateRows.filter((row) => row.evidenceEvaluatorQualityGateStatus === "passed_no_write_anchored_evidence_evaluator_quality_gate");
  const blockedRows = qualityGateRows.filter((row) => row.evidenceEvaluatorQualityGateStatus !== "passed_no_write_anchored_evidence_evaluator_quality_gate");

  if (blockedRows.length !== 0) {
    throw new Error("Anchored evidence evaluator quality gate blocked rows: " + blockedRows.map((row) => row.competitionSlug).join(", "));
  }

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "run-football-truth-no-write-anchored-season-state-evidence-evaluator-quality-gate-file",
    mode: "quality_gate_no_write_anchored_season_state_evidence_evaluator_no_classifier_no_truth_assertion_no_write",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      noWriteAnchoredSeasonStateEvidenceEvaluator: args.input
    },
    summary: {
      anchoredEvidenceEvaluatorQualityGateCompetitionCount: qualityGateRows.length,
      anchoredEvidenceEvaluatorQualityGatePassedCount: passedRows.length,
      anchoredEvidenceEvaluatorQualityGateBlockedCount: blockedRows.length,

      qualityGateReadyForStructuredExtractorCount: qualityGateRows.filter((row) => row.qualityGateReadyForStructuredExtractor).length,
      qualityGateReadyForClassifierCount: qualityGateRows.filter((row) => row.qualityGateReadyForClassifier).length,
      qualityGateReadyForCanonicalWriteCount: qualityGateRows.filter((row) => row.qualityGateReadyForCanonicalWrite).length,
      qualityGateReadyForTruthAssertionCount: qualityGateRows.filter((row) => row.qualityGateReadyForTruthAssertion).length,

      currentSeasonDataCandidateCount: qualityGateRows.filter((row) => row.currentSeasonDataCandidate).length,
      seasonEvidenceCandidateCompetitionCount: qualityGateRows.filter((row) => row.seasonEvidenceCandidateCount > 0).length,
      fixtureResultEvidenceCandidateCompetitionCount: qualityGateRows.filter((row) => row.fixtureResultEvidenceCandidateCount > 0).length,
      standingsEvidenceCandidateCompetitionCount: qualityGateRows.filter((row) => row.standingsEvidenceCandidateCount > 0).length,
      completedOrInactiveEvidenceCandidateCompetitionCount: qualityGateRows.filter((row) => row.completedOrInactiveEvidenceCandidateCount > 0).length,
      restartDateEvidenceCandidateCompetitionCount: qualityGateRows.filter((row) => row.restartDateEvidenceCandidateCount > 0).length,

      totalSeasonEvidenceCandidateCount: qualityGateRows.reduce((sum, row) => sum + row.seasonEvidenceCandidateCount, 0),
      totalFixtureResultEvidenceCandidateCount: qualityGateRows.reduce((sum, row) => sum + row.fixtureResultEvidenceCandidateCount, 0),
      totalStandingsEvidenceCandidateCount: qualityGateRows.reduce((sum, row) => sum + row.standingsEvidenceCandidateCount, 0),
      totalCompletedOrInactiveEvidenceCandidateCount: qualityGateRows.reduce((sum, row) => sum + row.completedOrInactiveEvidenceCandidateCount, 0),
      totalRestartDateEvidenceCandidateCount: qualityGateRows.reduce((sum, row) => sum + row.restartDateEvidenceCandidateCount, 0),

      laligaQualityGateCompetitionCount: qualityGateRows.filter((row) => row.reusableFamily === "laliga").length,
      norwayNtfQualityGateCompetitionCount: qualityGateRows.filter((row) => row.reusableFamily === "norway_ntf").length,
      sportomediaQualityGateCompetitionCount: qualityGateRows.filter((row) => row.reusableFamily === "sportomedia").length,

      fetchExecutedNowCount: 0,
      searchExecutedNowCount: 0,
      broadSearchExecutedNowCount: 0,
      classifierExecutedNowCount: 0,
      canonicalWriteExecutedNowCount: 0,
      productionWriteExecutedNowCount: 0,
      activeAssertedCount: 0,
      inactiveAssertedCount: 0,
      completedAssertedCount: 0,
      seasonStateTruthAssertedCount: 0,
      anchorEvidenceIsTruthAssertionCount: 0,
      structuralRouteKindAnchorsAreTruthAssertionCount: 0,
      currentSeasonDataCandidateIsNotActiveTruthCount: qualityGateRows.filter((row) => row.currentSeasonDataCandidateIsNotActiveTruth).length,
      missingCompletedInactiveCandidateDoesNotProveActiveCount: qualityGateRows.filter((row) => row.missingCompletedInactiveCandidateDoesNotProveActive).length,
      missingRestartDateCandidateDoesNotProveAbsenceCount: qualityGateRows.filter((row) => row.missingRestartDateCandidateDoesNotProveAbsence).length,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane: "build_no_write_structured_season_state_stats_extractor"
    },
    counts: {
      byReusableFamily: countBy(qualityGateRows, "reusableFamily"),
      byEvidenceEvaluatorQualityGateStatus: countBy(qualityGateRows, "evidenceEvaluatorQualityGateStatus"),
      byNextAllowedStep: countBy(qualityGateRows, "nextAllowedStep")
    },
    guardrails: [
      "This quality gate reads no-write evidence evaluator candidates only.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a season-state classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Passing this gate allows structured extraction only.",
      "Passing this gate does not allow classifier, truth assertion, canonical write, or production write.",
      "Current-season data candidates are not active-season truth.",
      "Missing completed/inactive candidates does not prove active.",
      "Missing restart date candidates does not prove absence.",
      "No match today must not imply inactive.",
      "Zero result must not imply absence."
    ],
    qualityGateRows,
    blockedRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    anchoredEvidenceEvaluatorQualityGateCompetitionCount: output.summary.anchoredEvidenceEvaluatorQualityGateCompetitionCount,
    anchoredEvidenceEvaluatorQualityGatePassedCount: output.summary.anchoredEvidenceEvaluatorQualityGatePassedCount,
    anchoredEvidenceEvaluatorQualityGateBlockedCount: output.summary.anchoredEvidenceEvaluatorQualityGateBlockedCount,
    qualityGateReadyForStructuredExtractorCount: output.summary.qualityGateReadyForStructuredExtractorCount,
    qualityGateReadyForClassifierCount: output.summary.qualityGateReadyForClassifierCount,
    qualityGateReadyForCanonicalWriteCount: output.summary.qualityGateReadyForCanonicalWriteCount,
    qualityGateReadyForTruthAssertionCount: output.summary.qualityGateReadyForTruthAssertionCount,
    currentSeasonDataCandidateCount: output.summary.currentSeasonDataCandidateCount,
    seasonEvidenceCandidateCompetitionCount: output.summary.seasonEvidenceCandidateCompetitionCount,
    fixtureResultEvidenceCandidateCompetitionCount: output.summary.fixtureResultEvidenceCandidateCompetitionCount,
    standingsEvidenceCandidateCompetitionCount: output.summary.standingsEvidenceCandidateCompetitionCount,
    completedOrInactiveEvidenceCandidateCompetitionCount: output.summary.completedOrInactiveEvidenceCandidateCompetitionCount,
    restartDateEvidenceCandidateCompetitionCount: output.summary.restartDateEvidenceCandidateCompetitionCount,
    totalSeasonEvidenceCandidateCount: output.summary.totalSeasonEvidenceCandidateCount,
    totalFixtureResultEvidenceCandidateCount: output.summary.totalFixtureResultEvidenceCandidateCount,
    totalStandingsEvidenceCandidateCount: output.summary.totalStandingsEvidenceCandidateCount,
    totalCompletedOrInactiveEvidenceCandidateCount: output.summary.totalCompletedOrInactiveEvidenceCandidateCount,
    totalRestartDateEvidenceCandidateCount: output.summary.totalRestartDateEvidenceCandidateCount,
    laligaQualityGateCompetitionCount: output.summary.laligaQualityGateCompetitionCount,
    norwayNtfQualityGateCompetitionCount: output.summary.norwayNtfQualityGateCompetitionCount,
    sportomediaQualityGateCompetitionCount: output.summary.sportomediaQualityGateCompetitionCount,
    fetchExecutedNowCount: output.summary.fetchExecutedNowCount,
    searchExecutedNowCount: output.summary.searchExecutedNowCount,
    broadSearchExecutedNowCount: output.summary.broadSearchExecutedNowCount,
    classifierExecutedNowCount: output.summary.classifierExecutedNowCount,
    canonicalWriteExecutedNowCount: output.summary.canonicalWriteExecutedNowCount,
    productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
    activeAssertedCount: output.summary.activeAssertedCount,
    inactiveAssertedCount: output.summary.inactiveAssertedCount,
    completedAssertedCount: output.summary.completedAssertedCount,
    seasonStateTruthAssertedCount: output.summary.seasonStateTruthAssertedCount,
    anchorEvidenceIsTruthAssertionCount: output.summary.anchorEvidenceIsTruthAssertionCount,
    structuralRouteKindAnchorsAreTruthAssertionCount: output.summary.structuralRouteKindAnchorsAreTruthAssertionCount,
    currentSeasonDataCandidateIsNotActiveTruthCount: output.summary.currentSeasonDataCandidateIsNotActiveTruthCount,
    missingCompletedInactiveCandidateDoesNotProveActiveCount: output.summary.missingCompletedInactiveCandidateDoesNotProveActiveCount,
    missingRestartDateCandidateDoesNotProveAbsenceCount: output.summary.missingRestartDateCandidateDoesNotProveAbsenceCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    userHintUsedCount: output.summary.userHintUsedCount,
    hardcodedSeasonStateOverrideUsedCount: output.summary.hardcodedSeasonStateOverrideUsedCount,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
