#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";
const DEFAULT_BOARD_INPUT =
  "data/football-truth/_diagnostics/no-write-route-snapshot-evidence-readiness-board-2026-06-14/no-write-route-snapshot-evidence-readiness-board-2026-06-14.json";
const DEFAULT_ANCHOR_INPUT =
  "data/football-truth/_diagnostics/no-write-route-snapshot-anchor-extractor-2026-06-14/no-write-route-snapshot-anchor-extractor-2026-06-14.json";
const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/no-write-anchored-season-state-evidence-evaluator-2026-06-14/no-write-anchored-season-state-evidence-evaluator-2026-06-14.json";

const EXPECTED_SLUGS = ["esp.1", "esp.2", "nor.1", "nor.2", "swe.1", "swe.2"];

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    boardInput: DEFAULT_BOARD_INPUT,
    anchorInput: DEFAULT_ANCHOR_INPUT,
    output: DEFAULT_OUTPUT
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--board-input") args.boardInput = argv[++i];
    else if (arg === "--anchor-input") args.anchorInput = argv[++i];
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

function validateReadinessBoard(board) {
  const summary = board.summary || {};

  assertSummary(summary, "routeSnapshotEvidenceReadinessBoardCompetitionCount", 6);
  assertSummary(summary, "routeSnapshotEvidenceReadinessBoardReadyCount", 6);
  assertSummary(summary, "routeSnapshotEvidenceReadinessBoardBlockedCount", 0);
  assertSummary(summary, "requiredEvidenceGroupsPresentCount", 6);
  assertSummary(summary, "structuralRouteKindAnchorCompetitionCount", 6);
  assertSummary(summary, "textPatternAnchorCompetitionCount", 6);
  assertSummary(summary, "totalRouteAnchorRowCount", 18);
  assertSummary(summary, "laligaEvidenceReadinessCompetitionCount", 2);
  assertSummary(summary, "norwayNtfEvidenceReadinessCompetitionCount", 2);
  assertSummary(summary, "sportomediaEvidenceReadinessCompetitionCount", 2);

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

  const rows = Array.isArray(board.evidenceReadinessRows) ? board.evidenceReadinessRows : [];
  if (rows.length !== 6) throw new Error("Expected 6 evidenceReadinessRows, got " + rows.length);

  const slugs = uniqueSorted(rows.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Unexpected readiness slugs: " + slugs.join(", "));
  }

  for (const row of rows) {
    if (row.evidenceBoardStatus !== "ready_for_no_write_anchored_evidence_evaluator") {
      throw new Error(row.competitionSlug + ": evidence board row is not ready");
    }
    if (row.requiredEvidenceGroupsPresent !== true) {
      throw new Error(row.competitionSlug + ": required evidence groups missing");
    }
    if (row.anchorEvidenceIsTruthAssertion !== false || row.structuralRouteKindAnchorsAreTruthAssertion !== false) {
      throw new Error(row.competitionSlug + ": anchor truth flags must be false");
    }
    if (row.seasonStateTruthAssertedNow !== false || row.classifierExecutedNow !== false) {
      throw new Error(row.competitionSlug + ": classifier/truth assertion must be false");
    }
    if (row.canonicalWriteExecutedNow !== false || row.productionWriteExecutedNow !== false) {
      throw new Error(row.competitionSlug + ": write flags must be false");
    }
  }

  return rows;
}

function validateAnchorExtractor(anchor) {
  const summary = anchor.summary || {};

  assertSummary(summary, "anchorExtractorCompetitionCount", 6);
  assertSummary(summary, "anchorExtractorReadyForQualityGateCount", 6);
  assertSummary(summary, "anchorExtractorNeedsParserRepairCount", 0);
  assertSummary(summary, "routeAnchorRowCount", 18);
  assertSummary(summary, "routeAnchorRowsWithCandidatesCount", 18);
  assertSummary(summary, "seasonMarkerAnchorCompetitionCount", 6);
  assertSummary(summary, "fixtureResultAnchorCompetitionCount", 6);
  assertSummary(summary, "standingsAnchorCompetitionCount", 6);
  assertSummary(summary, "fetchExecutedNowCount", 0);
  assertSummary(summary, "searchExecutedNowCount", 0);
  assertSummary(summary, "broadSearchExecutedNowCount", 0);
  assertSummary(summary, "classifierExecutedNowCount", 0);
  assertSummary(summary, "canonicalWriteExecutedNowCount", 0);
  assertSummary(summary, "productionWriteExecutedNowCount", 0);
  assertSummary(summary, "seasonStateTruthAssertedCount", 0);
  assertSummary(summary, "canonicalWrites", 0);
  assertSummary(summary, "productionWrite", false);

  const routeRows = Array.isArray(anchor.routeAnchorRows) ? anchor.routeAnchorRows : [];
  if (routeRows.length !== 18) throw new Error("Expected 18 routeAnchorRows, got " + routeRows.length);

  return routeRows;
}

function groupBySlug(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.competitionSlug)) map.set(row.competitionSlug, []);
    map.get(row.competitionSlug).push(row);
  }
  return map;
}

function flattenAnchors(routeRows, field) {
  const out = [];
  for (const row of routeRows) {
    const anchors = Array.isArray(row[field]) ? row[field] : [];
    for (const anchor of anchors) {
      out.push({
        routeKind: row.routeKind,
        sourceUrl: row.sourceUrl,
        finalUrl: row.finalUrl,
        value: anchor.value,
        anchorSource: anchor.anchorSource || "unknown",
        context: anchor.context
      });
    }
  }
  return out;
}

function evidenceEvaluatorRow(readinessRow, routeRows) {
  const seasonAnchors = flattenAnchors(routeRows, "seasonMarkerAnchors");
  const fixtureAnchors = flattenAnchors(routeRows, "fixtureResultAnchors");
  const standingsAnchors = flattenAnchors(routeRows, "standingsAnchors");
  const completedAnchors = flattenAnchors(routeRows, "completedOrInactiveAnchors");
  const restartAnchors = flattenAnchors(routeRows, "restartDateAnchors");

  const hasSeasonEvidenceCandidate = seasonAnchors.length > 0;
  const hasFixtureResultEvidenceCandidate = fixtureAnchors.length > 0;
  const hasStandingsEvidenceCandidate = standingsAnchors.length > 0;
  const hasCompletedOrInactiveEvidenceCandidate = completedAnchors.length > 0;
  const hasRestartDateEvidenceCandidate = restartAnchors.length > 0;

  const currentSeasonDataCandidate =
    hasSeasonEvidenceCandidate &&
    hasFixtureResultEvidenceCandidate &&
    hasStandingsEvidenceCandidate;

  const evaluatorStatus =
    readinessRow.evidenceBoardStatus === "ready_for_no_write_anchored_evidence_evaluator" &&
    currentSeasonDataCandidate
      ? "ready_for_no_write_evidence_evaluator_quality_gate"
      : "blocked_before_no_write_evidence_evaluator_quality_gate";

  const blockingReasons = [];
  if (readinessRow.evidenceBoardStatus !== "ready_for_no_write_anchored_evidence_evaluator") {
    blockingReasons.push("readiness_board_not_ready");
  }
  if (!hasSeasonEvidenceCandidate) blockingReasons.push("missing_season_evidence_candidate");
  if (!hasFixtureResultEvidenceCandidate) blockingReasons.push("missing_fixture_result_evidence_candidate");
  if (!hasStandingsEvidenceCandidate) blockingReasons.push("missing_standings_evidence_candidate");

  return {
    competitionSlug: readinessRow.competitionSlug,
    reusableFamily: readinessRow.reusableFamily,
    routeAcquisitionType: readinessRow.routeAcquisitionType,
    routeScope: readinessRow.routeScope,

    anchoredEvidenceEvaluatorStatus: evaluatorStatus,
    blockingReasons,

    currentSeasonDataCandidate,
    hasSeasonEvidenceCandidate,
    hasFixtureResultEvidenceCandidate,
    hasStandingsEvidenceCandidate,
    hasCompletedOrInactiveEvidenceCandidate,
    hasRestartDateEvidenceCandidate,

    seasonEvidenceCandidateCount: seasonAnchors.length,
    fixtureResultEvidenceCandidateCount: fixtureAnchors.length,
    standingsEvidenceCandidateCount: standingsAnchors.length,
    completedOrInactiveEvidenceCandidateCount: completedAnchors.length,
    restartDateEvidenceCandidateCount: restartAnchors.length,

    routeKinds: readinessRow.routeKinds,
    sourceUrls: readinessRow.sourceUrls,
    finalUrls: readinessRow.finalUrls,
    routeAnchorHashes: readinessRow.routeAnchorHashes,

    evaluatorCanProceedToNoWriteQualityGate: evaluatorStatus === "ready_for_no_write_evidence_evaluator_quality_gate",
    evaluatorMayClassifySeasonStateNow: false,
    evaluatorMayAssertTruthNow: false,
    evaluatorMayWriteCanonicalNow: false,

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
    validatorReadinessDoesNotImplyActive: true,
    anchorEvidenceIsTruthAssertion: false,
    structuralRouteKindAnchorsAreTruthAssertion: false,

    nextAllowedStep:
      evaluatorStatus === "ready_for_no_write_evidence_evaluator_quality_gate"
        ? "run_no_write_anchored_season_state_evidence_evaluator_quality_gate"
        : "repair_no_write_anchored_season_state_evidence_evaluator",
    nextBlockedStep: "season_state_classifier_canonical_write_and_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);

  const board = readJson(args.boardInput);
  const readinessRows = validateReadinessBoard(board);

  const anchor = readJson(args.anchorInput);
  const routeRows = validateAnchorExtractor(anchor);
  const routeRowsBySlug = groupBySlug(routeRows);

  const evaluatorRows = readinessRows
    .map((row) => evidenceEvaluatorRow(row, routeRowsBySlug.get(row.competitionSlug) || []))
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const readyRows = evaluatorRows.filter((row) => row.anchoredEvidenceEvaluatorStatus === "ready_for_no_write_evidence_evaluator_quality_gate");
  const blockedRows = evaluatorRows.filter((row) => row.anchoredEvidenceEvaluatorStatus !== "ready_for_no_write_evidence_evaluator_quality_gate");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-no-write-anchored-season-state-evidence-evaluator-file",
    mode: "build_no_write_anchored_season_state_evidence_evaluator_no_classifier_no_truth_assertion_no_write",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      noWriteRouteSnapshotEvidenceReadinessBoard: args.boardInput,
      noWriteRouteSnapshotAnchorExtractor: args.anchorInput
    },
    summary: {
      anchoredSeasonStateEvidenceEvaluatorCompetitionCount: evaluatorRows.length,
      anchoredSeasonStateEvidenceEvaluatorReadyCount: readyRows.length,
      anchoredSeasonStateEvidenceEvaluatorBlockedCount: blockedRows.length,

      currentSeasonDataCandidateCount: evaluatorRows.filter((row) => row.currentSeasonDataCandidate).length,
      seasonEvidenceCandidateCompetitionCount: evaluatorRows.filter((row) => row.hasSeasonEvidenceCandidate).length,
      fixtureResultEvidenceCandidateCompetitionCount: evaluatorRows.filter((row) => row.hasFixtureResultEvidenceCandidate).length,
      standingsEvidenceCandidateCompetitionCount: evaluatorRows.filter((row) => row.hasStandingsEvidenceCandidate).length,
      completedOrInactiveEvidenceCandidateCompetitionCount: evaluatorRows.filter((row) => row.hasCompletedOrInactiveEvidenceCandidate).length,
      restartDateEvidenceCandidateCompetitionCount: evaluatorRows.filter((row) => row.hasRestartDateEvidenceCandidate).length,

      totalSeasonEvidenceCandidateCount: evaluatorRows.reduce((sum, row) => sum + row.seasonEvidenceCandidateCount, 0),
      totalFixtureResultEvidenceCandidateCount: evaluatorRows.reduce((sum, row) => sum + row.fixtureResultEvidenceCandidateCount, 0),
      totalStandingsEvidenceCandidateCount: evaluatorRows.reduce((sum, row) => sum + row.standingsEvidenceCandidateCount, 0),
      totalCompletedOrInactiveEvidenceCandidateCount: evaluatorRows.reduce((sum, row) => sum + row.completedOrInactiveEvidenceCandidateCount, 0),
      totalRestartDateEvidenceCandidateCount: evaluatorRows.reduce((sum, row) => sum + row.restartDateEvidenceCandidateCount, 0),

      evaluatorCanProceedToNoWriteQualityGateCount: evaluatorRows.filter((row) => row.evaluatorCanProceedToNoWriteQualityGate).length,
      evaluatorMayClassifySeasonStateNowCount: evaluatorRows.filter((row) => row.evaluatorMayClassifySeasonStateNow).length,
      evaluatorMayAssertTruthNowCount: evaluatorRows.filter((row) => row.evaluatorMayAssertTruthNow).length,
      evaluatorMayWriteCanonicalNowCount: evaluatorRows.filter((row) => row.evaluatorMayWriteCanonicalNow).length,

      laligaEvaluatorCompetitionCount: evaluatorRows.filter((row) => row.reusableFamily === "laliga").length,
      norwayNtfEvaluatorCompetitionCount: evaluatorRows.filter((row) => row.reusableFamily === "norway_ntf").length,
      sportomediaEvaluatorCompetitionCount: evaluatorRows.filter((row) => row.reusableFamily === "sportomedia").length,

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
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        blockedRows.length === 0
          ? "run_no_write_anchored_season_state_evidence_evaluator_quality_gate"
          : "repair_no_write_anchored_season_state_evidence_evaluator"
    },
    counts: {
      byReusableFamily: countBy(evaluatorRows, "reusableFamily"),
      byAnchoredEvidenceEvaluatorStatus: countBy(evaluatorRows, "anchoredEvidenceEvaluatorStatus"),
      byNextAllowedStep: countBy(evaluatorRows, "nextAllowedStep")
    },
    guardrails: [
      "This evaluator reads quality-gated evidence candidates only.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not run a season-state classifier.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Current-season data candidates are not active-season truth.",
      "Missing completed/inactive anchors does not prove active.",
      "Missing restart date anchors does not prove absence.",
      "No match today must not imply inactive.",
      "Zero result must not imply absence."
    ],
    evaluatorRows,
    blockedRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    anchoredSeasonStateEvidenceEvaluatorCompetitionCount: output.summary.anchoredSeasonStateEvidenceEvaluatorCompetitionCount,
    anchoredSeasonStateEvidenceEvaluatorReadyCount: output.summary.anchoredSeasonStateEvidenceEvaluatorReadyCount,
    anchoredSeasonStateEvidenceEvaluatorBlockedCount: output.summary.anchoredSeasonStateEvidenceEvaluatorBlockedCount,
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
    evaluatorCanProceedToNoWriteQualityGateCount: output.summary.evaluatorCanProceedToNoWriteQualityGateCount,
    evaluatorMayClassifySeasonStateNowCount: output.summary.evaluatorMayClassifySeasonStateNowCount,
    evaluatorMayAssertTruthNowCount: output.summary.evaluatorMayAssertTruthNowCount,
    evaluatorMayWriteCanonicalNowCount: output.summary.evaluatorMayWriteCanonicalNowCount,
    laligaEvaluatorCompetitionCount: output.summary.laligaEvaluatorCompetitionCount,
    norwayNtfEvaluatorCompetitionCount: output.summary.norwayNtfEvaluatorCompetitionCount,
    sportomediaEvaluatorCompetitionCount: output.summary.sportomediaEvaluatorCompetitionCount,
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
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    userHintUsedCount: output.summary.userHintUsedCount,
    hardcodedSeasonStateOverrideUsedCount: output.summary.hardcodedSeasonStateOverrideUsedCount,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
