#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";
const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/no-write-structured-season-state-stats-extractor-2026-06-14/no-write-structured-season-state-stats-extractor-2026-06-14.json";
const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/no-write-structured-season-state-stats-extractor-quality-gate-2026-06-14/no-write-structured-season-state-stats-extractor-quality-gate-2026-06-14.json";

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

function validateStructuredExtractor(input) {
  const summary = input.summary || {};

  assertSummary(summary, "structuredSeasonStateStatsExtractorCompetitionCount", 6);
  assertSummary(summary, "structuredSeasonStateStatsExtractorReadyCount", 6);
  assertSummary(summary, "structuredSeasonStateStatsExtractorBlockedCount", 0);
  assertSummary(summary, "structuredSeasonCandidateCompetitionCount", 6);
  assertSummary(summary, "structuredStandingsCandidateCompetitionCount", 6);
  assertSummary(summary, "structuredFixtureResultCandidateCompetitionCount", 6);
  assertSummary(summary, "completedOrInactiveStructuredCandidateCompetitionCount", 0);
  assertSummary(summary, "restartDateStructuredCandidateCompetitionCount", 0);
  assertSummary(summary, "requiredRouteCoverageCompetitionCount", 6);
  assertSummary(summary, "standingsRouteCompetitionCount", 6);
  assertSummary(summary, "fixtureOrResultRouteCompetitionCount", 6);
  assertSummary(summary, "totalStandingsRouteCount", 6);
  assertSummary(summary, "totalFixtureOrResultRouteCount", 10);
  assertSummary(summary, "structuredExtractorMayProceedToQualityGateCount", 6);
  assertSummary(summary, "structuredExtractorMayClassifySeasonStateNowCount", 0);
  assertSummary(summary, "structuredExtractorMayAssertTruthNowCount", 0);
  assertSummary(summary, "structuredExtractorMayWriteCanonicalNowCount", 0);
  assertSummary(summary, "laligaStructuredExtractorCompetitionCount", 2);
  assertSummary(summary, "norwayNtfStructuredExtractorCompetitionCount", 2);
  assertSummary(summary, "sportomediaStructuredExtractorCompetitionCount", 2);

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
  assertSummary(summary, "structuredSeasonStateCandidateTruthCount", 0);
  assertSummary(summary, "canonicalWrites", 0);
  assertSummary(summary, "productionWrite", false);
  assertSummary(summary, "userHintUsedCount", 0);
  assertSummary(summary, "hardcodedSeasonStateOverrideUsedCount", 0);

  if (summary.totalDateCandidateCount < 1) throw new Error("Expected date candidates.");
  if (summary.totalScorePatternCandidateCount < 1) throw new Error("Expected score pattern candidates.");
  if (summary.totalFixtureObjectCandidateCount < 1) throw new Error("Expected fixture object candidates.");

  const rows = Array.isArray(input.structuredRows) ? input.structuredRows : [];
  if (rows.length !== 6) throw new Error("Expected 6 structuredRows, got " + rows.length);

  const slugs = uniqueSorted(rows.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Unexpected structured slugs: " + slugs.join(", "));
  }

  for (const row of rows) {
    if (row.structuredExtractorStatus !== "ready_for_no_write_structured_extractor_quality_gate") {
      throw new Error(row.competitionSlug + ": structured extractor not quality-gate ready");
    }
    if (row.hasRequiredRouteCoverage !== true) throw new Error(row.competitionSlug + ": route coverage missing");
    if (row.hasStructuredSeasonCandidate !== true) throw new Error(row.competitionSlug + ": season candidate missing");
    if (row.hasStructuredStandingsCandidate !== true) throw new Error(row.competitionSlug + ": standings candidate missing");
    if (row.hasStructuredFixtureResultCandidate !== true) throw new Error(row.competitionSlug + ": fixture/result candidate missing");
    if (row.structuredExtractorMayProceedToQualityGate !== true) {
      throw new Error(row.competitionSlug + ": cannot proceed to quality gate");
    }

    if (row.structuredSeasonStateCandidateIsTruth !== false) {
      throw new Error(row.competitionSlug + ": structured season candidate must not be truth");
    }
    if (row.currentSeasonDataCandidateIsActiveTruth !== false) {
      throw new Error(row.competitionSlug + ": current-season data candidate must not be active truth");
    }
    if (row.structuredExtractorMayClassifySeasonStateNow !== false) {
      throw new Error(row.competitionSlug + ": structured extractor must not classify now");
    }
    if (row.structuredExtractorMayAssertTruthNow !== false) {
      throw new Error(row.competitionSlug + ": structured extractor must not assert truth now");
    }
    if (row.structuredExtractorMayWriteCanonicalNow !== false) {
      throw new Error(row.competitionSlug + ": structured extractor must not write canonical now");
    }

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
    if (row.userHintUsed !== false || row.hardcodedSeasonStateOverrideUsed !== false) {
      throw new Error(row.competitionSlug + ": hints/overrides must remain false");
    }
  }

  return rows;
}

function qualityGateRow(row) {
  const blockingReasons = [];

  if (row.structuredExtractorStatus !== "ready_for_no_write_structured_extractor_quality_gate") blockingReasons.push("structured_extractor_not_ready");
  if (row.hasRequiredRouteCoverage !== true) blockingReasons.push("required_route_coverage_missing");
  if (row.hasStructuredSeasonCandidate !== true) blockingReasons.push("structured_season_candidate_missing");
  if (row.hasStructuredStandingsCandidate !== true) blockingReasons.push("structured_standings_candidate_missing");
  if (row.hasStructuredFixtureResultCandidate !== true) blockingReasons.push("structured_fixture_result_candidate_missing");
  if (row.structuredExtractorMayProceedToQualityGate !== true) blockingReasons.push("cannot_proceed_to_quality_gate");

  if (row.structuredSeasonStateCandidateIsTruth !== false) blockingReasons.push("structured_season_candidate_is_truth");
  if (row.currentSeasonDataCandidateIsActiveTruth !== false) blockingReasons.push("current_season_candidate_marked_active_truth");
  if (row.structuredExtractorMayClassifySeasonStateNow !== false) blockingReasons.push("structured_extractor_would_classify_now");
  if (row.structuredExtractorMayAssertTruthNow !== false) blockingReasons.push("structured_extractor_would_assert_truth_now");
  if (row.structuredExtractorMayWriteCanonicalNow !== false) blockingReasons.push("structured_extractor_would_write_canonical_now");
  if (row.seasonStateTruthAssertedNow !== false) blockingReasons.push("truth_asserted");
  if (row.classifierExecutedNow !== false) blockingReasons.push("classifier_executed");
  if (row.canonicalWriteExecutedNow !== false) blockingReasons.push("canonical_write_executed");
  if (row.productionWriteExecutedNow !== false) blockingReasons.push("production_write_executed");
  if (row.userHintUsed !== false) blockingReasons.push("user_hint_used");
  if (row.hardcodedSeasonStateOverrideUsed !== false) blockingReasons.push("hardcoded_override_used");

  const structuredExtractorQualityGateStatus =
    blockingReasons.length === 0
      ? "passed_no_write_structured_extractor_quality_gate"
      : "blocked_no_write_structured_extractor_quality_gate";

  const rowLevelStandingsParserNeeded = Number(row.standingObjectCandidateCount || 0) === 0;
  const rowLevelFixtureResultParserNeeded = Number(row.fixtureObjectCandidateCount || 0) === 0 && Number(row.scorePatternCandidateCount || 0) > 0;

  return {
    competitionSlug: row.competitionSlug,
    reusableFamily: row.reusableFamily,
    routeAcquisitionType: row.routeAcquisitionType,
    routeScope: row.routeScope,

    structuredExtractorQualityGateStatus,
    blockingReasons,

    qualityGateReadyForFamilyStructuredParser: structuredExtractorQualityGateStatus === "passed_no_write_structured_extractor_quality_gate",
    qualityGateReadyForClassifier: false,
    qualityGateReadyForCanonicalWrite: false,
    qualityGateReadyForTruthAssertion: false,

    rowLevelStandingsParserNeeded,
    rowLevelFixtureResultParserNeeded,
    rowLevelStatsExtractionComplete: false,

    hasStructuredSeasonCandidate: row.hasStructuredSeasonCandidate,
    hasStructuredStandingsCandidate: row.hasStructuredStandingsCandidate,
    hasStructuredFixtureResultCandidate: row.hasStructuredFixtureResultCandidate,
    hasCompletedOrInactiveStructuredCandidate: row.hasCompletedOrInactiveStructuredCandidate,
    hasRestartDateStructuredCandidate: row.hasRestartDateStructuredCandidate,

    standingsRouteCount: row.standingsRouteCount,
    fixtureOrResultRouteCount: row.fixtureOrResultRouteCount,
    dateCandidateCount: row.dateCandidateCount,
    scorePatternCandidateCount: row.scorePatternCandidateCount,
    roundCandidateCount: row.roundCandidateCount,
    footballObjectCandidateCount: row.footballObjectCandidateCount,
    standingObjectCandidateCount: row.standingObjectCandidateCount,
    fixtureObjectCandidateCount: row.fixtureObjectCandidateCount,

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

    structuredSeasonStateCandidateIsTruth: false,
    currentSeasonDataCandidateIsActiveTruth: false,
    noMatchTodayDoesNotImplyInactive: true,
    zeroResultDoesNotImplyAbsence: true,
    missingCompletedInactiveCandidateDoesNotProveActive: true,
    missingRestartDateCandidateDoesNotProveAbsence: true,

    nextAllowedStep: "build_no_write_family_structured_stats_parser_normalizer",
    nextBlockedStep: "season_state_classifier_canonical_write_and_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const input = readJson(args.input);
  const structuredRows = validateStructuredExtractor(input);

  const qualityGateRows = structuredRows
    .map(qualityGateRow)
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const passedRows = qualityGateRows.filter((row) => row.structuredExtractorQualityGateStatus === "passed_no_write_structured_extractor_quality_gate");
  const blockedRows = qualityGateRows.filter((row) => row.structuredExtractorQualityGateStatus !== "passed_no_write_structured_extractor_quality_gate");

  if (blockedRows.length !== 0) {
    throw new Error("Structured extractor quality gate blocked rows: " + blockedRows.map((row) => row.competitionSlug).join(", "));
  }

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "run-football-truth-no-write-structured-season-state-stats-extractor-quality-gate-file",
    mode: "quality_gate_no_write_structured_season_state_stats_extractor_no_classifier_no_truth_assertion_no_write",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      noWriteStructuredSeasonStateStatsExtractor: args.input
    },
    summary: {
      structuredExtractorQualityGateCompetitionCount: qualityGateRows.length,
      structuredExtractorQualityGatePassedCount: passedRows.length,
      structuredExtractorQualityGateBlockedCount: blockedRows.length,

      qualityGateReadyForFamilyStructuredParserCount: qualityGateRows.filter((row) => row.qualityGateReadyForFamilyStructuredParser).length,
      qualityGateReadyForClassifierCount: qualityGateRows.filter((row) => row.qualityGateReadyForClassifier).length,
      qualityGateReadyForCanonicalWriteCount: qualityGateRows.filter((row) => row.qualityGateReadyForCanonicalWrite).length,
      qualityGateReadyForTruthAssertionCount: qualityGateRows.filter((row) => row.qualityGateReadyForTruthAssertion).length,

      rowLevelStandingsParserNeededCompetitionCount: qualityGateRows.filter((row) => row.rowLevelStandingsParserNeeded).length,
      rowLevelFixtureResultParserNeededCompetitionCount: qualityGateRows.filter((row) => row.rowLevelFixtureResultParserNeeded).length,
      rowLevelStatsExtractionCompleteCompetitionCount: qualityGateRows.filter((row) => row.rowLevelStatsExtractionComplete).length,

      structuredSeasonCandidateCompetitionCount: qualityGateRows.filter((row) => row.hasStructuredSeasonCandidate).length,
      structuredStandingsCandidateCompetitionCount: qualityGateRows.filter((row) => row.hasStructuredStandingsCandidate).length,
      structuredFixtureResultCandidateCompetitionCount: qualityGateRows.filter((row) => row.hasStructuredFixtureResultCandidate).length,
      completedOrInactiveStructuredCandidateCompetitionCount: qualityGateRows.filter((row) => row.hasCompletedOrInactiveStructuredCandidate).length,
      restartDateStructuredCandidateCompetitionCount: qualityGateRows.filter((row) => row.hasRestartDateStructuredCandidate).length,

      totalStandingsRouteCount: qualityGateRows.reduce((sum, row) => sum + row.standingsRouteCount, 0),
      totalFixtureOrResultRouteCount: qualityGateRows.reduce((sum, row) => sum + row.fixtureOrResultRouteCount, 0),
      totalDateCandidateCount: qualityGateRows.reduce((sum, row) => sum + row.dateCandidateCount, 0),
      totalScorePatternCandidateCount: qualityGateRows.reduce((sum, row) => sum + row.scorePatternCandidateCount, 0),
      totalRoundCandidateCount: qualityGateRows.reduce((sum, row) => sum + row.roundCandidateCount, 0),
      totalFootballObjectCandidateCount: qualityGateRows.reduce((sum, row) => sum + row.footballObjectCandidateCount, 0),
      totalStandingObjectCandidateCount: qualityGateRows.reduce((sum, row) => sum + row.standingObjectCandidateCount, 0),
      totalFixtureObjectCandidateCount: qualityGateRows.reduce((sum, row) => sum + row.fixtureObjectCandidateCount, 0),

      laligaStructuredQualityGateCompetitionCount: qualityGateRows.filter((row) => row.reusableFamily === "laliga").length,
      norwayNtfStructuredQualityGateCompetitionCount: qualityGateRows.filter((row) => row.reusableFamily === "norway_ntf").length,
      sportomediaStructuredQualityGateCompetitionCount: qualityGateRows.filter((row) => row.reusableFamily === "sportomedia").length,

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
      structuredSeasonStateCandidateTruthCount: 0,
      currentSeasonDataCandidateActiveTruthCount: 0,
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane: "build_no_write_family_structured_stats_parser_normalizer"
    },
    counts: {
      byReusableFamily: countBy(qualityGateRows, "reusableFamily"),
      byStructuredExtractorQualityGateStatus: countBy(qualityGateRows, "structuredExtractorQualityGateStatus"),
      byNextAllowedStep: countBy(qualityGateRows, "nextAllowedStep")
    },
    guardrails: [
      "This quality gate reads structured candidates only.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a season-state classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Passing this gate allows family-specific structured parsing/normalization only.",
      "Passing this gate does not allow classifier, truth assertion, canonical write, or production write.",
      "Structured candidates are not truth assertions.",
      "Current-season data candidates are not active-season truth.",
      "Standing object candidate count of zero means row-level family parser is still required, not that standings are absent.",
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
    structuredExtractorQualityGateCompetitionCount: output.summary.structuredExtractorQualityGateCompetitionCount,
    structuredExtractorQualityGatePassedCount: output.summary.structuredExtractorQualityGatePassedCount,
    structuredExtractorQualityGateBlockedCount: output.summary.structuredExtractorQualityGateBlockedCount,
    qualityGateReadyForFamilyStructuredParserCount: output.summary.qualityGateReadyForFamilyStructuredParserCount,
    qualityGateReadyForClassifierCount: output.summary.qualityGateReadyForClassifierCount,
    qualityGateReadyForCanonicalWriteCount: output.summary.qualityGateReadyForCanonicalWriteCount,
    qualityGateReadyForTruthAssertionCount: output.summary.qualityGateReadyForTruthAssertionCount,
    rowLevelStandingsParserNeededCompetitionCount: output.summary.rowLevelStandingsParserNeededCompetitionCount,
    rowLevelFixtureResultParserNeededCompetitionCount: output.summary.rowLevelFixtureResultParserNeededCompetitionCount,
    rowLevelStatsExtractionCompleteCompetitionCount: output.summary.rowLevelStatsExtractionCompleteCompetitionCount,
    structuredSeasonCandidateCompetitionCount: output.summary.structuredSeasonCandidateCompetitionCount,
    structuredStandingsCandidateCompetitionCount: output.summary.structuredStandingsCandidateCompetitionCount,
    structuredFixtureResultCandidateCompetitionCount: output.summary.structuredFixtureResultCandidateCompetitionCount,
    completedOrInactiveStructuredCandidateCompetitionCount: output.summary.completedOrInactiveStructuredCandidateCompetitionCount,
    restartDateStructuredCandidateCompetitionCount: output.summary.restartDateStructuredCandidateCompetitionCount,
    totalStandingsRouteCount: output.summary.totalStandingsRouteCount,
    totalFixtureOrResultRouteCount: output.summary.totalFixtureOrResultRouteCount,
    totalDateCandidateCount: output.summary.totalDateCandidateCount,
    totalScorePatternCandidateCount: output.summary.totalScorePatternCandidateCount,
    totalRoundCandidateCount: output.summary.totalRoundCandidateCount,
    totalFootballObjectCandidateCount: output.summary.totalFootballObjectCandidateCount,
    totalStandingObjectCandidateCount: output.summary.totalStandingObjectCandidateCount,
    totalFixtureObjectCandidateCount: output.summary.totalFixtureObjectCandidateCount,
    laligaStructuredQualityGateCompetitionCount: output.summary.laligaStructuredQualityGateCompetitionCount,
    norwayNtfStructuredQualityGateCompetitionCount: output.summary.norwayNtfStructuredQualityGateCompetitionCount,
    sportomediaStructuredQualityGateCompetitionCount: output.summary.sportomediaStructuredQualityGateCompetitionCount,
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
    structuredSeasonStateCandidateTruthCount: output.summary.structuredSeasonStateCandidateTruthCount,
    currentSeasonDataCandidateActiveTruthCount: output.summary.currentSeasonDataCandidateActiveTruthCount,
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    userHintUsedCount: output.summary.userHintUsedCount,
    hardcodedSeasonStateOverrideUsedCount: output.summary.hardcodedSeasonStateOverrideUsedCount,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
