#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";
const DEFAULT_QUALITY_GATE_INPUT =
  "data/football-truth/_diagnostics/no-write-route-snapshot-anchor-extractor-quality-gate-2026-06-14/no-write-route-snapshot-anchor-extractor-quality-gate-2026-06-14.json";
const DEFAULT_ANCHOR_INPUT =
  "data/football-truth/_diagnostics/no-write-route-snapshot-anchor-extractor-2026-06-14/no-write-route-snapshot-anchor-extractor-2026-06-14.json";
const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/no-write-route-snapshot-evidence-readiness-board-2026-06-14/no-write-route-snapshot-evidence-readiness-board-2026-06-14.json";

const EXPECTED_SLUGS = ["esp.1", "esp.2", "nor.1", "nor.2", "swe.1", "swe.2"];

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    qualityGateInput: DEFAULT_QUALITY_GATE_INPUT,
    anchorInput: DEFAULT_ANCHOR_INPUT,
    output: DEFAULT_OUTPUT
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--quality-gate-input") args.qualityGateInput = argv[++i];
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

function validateQualityGate(input) {
  const summary = input.summary || {};

  assertSummary(summary, "anchorExtractorQualityGateCompetitionCount", 6);
  assertSummary(summary, "anchorExtractorQualityGatePassedCount", 6);
  assertSummary(summary, "anchorExtractorQualityGateBlockedCount", 0);
  assertSummary(summary, "anchorEvidenceReadyForNoWriteEvidenceBoardCount", 6);
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

  const rows = Array.isArray(input.qualityGateRows) ? input.qualityGateRows : [];
  if (rows.length !== 6) throw new Error("Expected 6 qualityGateRows, got " + rows.length);

  const slugs = uniqueSorted(rows.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Unexpected quality gate slugs: " + slugs.join(", "));
  }

  for (const row of rows) {
    if (row.anchorQualityGateStatus !== "passed_no_write_anchor_extractor_quality_gate") {
      throw new Error(row.competitionSlug + ": anchor quality gate did not pass");
    }
    if (row.anchorEvidenceReadyForNoWriteEvidenceBoard !== true) {
      throw new Error(row.competitionSlug + ": anchorEvidenceReadyForNoWriteEvidenceBoard must be true");
    }
    if (row.anchorEvidenceIsTruthAssertion !== false || row.structuralRouteKindAnchorsAreTruthAssertion !== false) {
      throw new Error(row.competitionSlug + ": anchor truth flags must be false");
    }
    if (row.seasonStateTruthAssertedNow !== false || row.classifierExecutedNow !== false) {
      throw new Error(row.competitionSlug + ": classifier/truth assertion must remain false");
    }
    if (row.canonicalWriteExecutedNow !== false || row.productionWriteExecutedNow !== false) {
      throw new Error(row.competitionSlug + ": write flags must remain false");
    }
  }

  return rows;
}

function validateAnchorExtractor(input) {
  const summary = input.summary || {};

  assertSummary(summary, "anchorExtractorCompetitionCount", 6);
  assertSummary(summary, "anchorExtractorReadyForQualityGateCount", 6);
  assertSummary(summary, "anchorExtractorNeedsParserRepairCount", 0);
  assertSummary(summary, "routeAnchorRowCount", 18);
  assertSummary(summary, "routeAnchorRowsWithCandidatesCount", 18);
  assertSummary(summary, "routeAnchorRowsNeedingParserReviewCount", 0);
  assertSummary(summary, "seasonMarkerAnchorCompetitionCount", 6);
  assertSummary(summary, "fixtureResultAnchorCompetitionCount", 6);
  assertSummary(summary, "standingsAnchorCompetitionCount", 6);
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
  assertSummary(summary, "canonicalWrites", 0);
  assertSummary(summary, "productionWrite", false);
  assertSummary(summary, "userHintUsedCount", 0);
  assertSummary(summary, "hardcodedSeasonStateOverrideUsedCount", 0);

  const competitionRows = Array.isArray(input.competitionAnchorRows) ? input.competitionAnchorRows : [];
  const routeRows = Array.isArray(input.routeAnchorRows) ? input.routeAnchorRows : [];

  if (competitionRows.length !== 6) throw new Error("Expected 6 competitionAnchorRows, got " + competitionRows.length);
  if (routeRows.length !== 18) throw new Error("Expected 18 routeAnchorRows, got " + routeRows.length);

  return { competitionRows, routeRows };
}

function groupBySlug(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.competitionSlug)) map.set(row.competitionSlug, []);
    map.get(row.competitionSlug).push(row);
  }
  return map;
}

function anchorSourceCounts(routeRows) {
  const counts = {
    textPattern: 0,
    structuralRouteKind: 0
  };

  for (const row of routeRows) {
    for (const groupName of [
      "seasonMarkerAnchors",
      "fixtureResultAnchors",
      "standingsAnchors",
      "completedOrInactiveAnchors",
      "restartDateAnchors"
    ]) {
      const anchors = Array.isArray(row[groupName]) ? row[groupName] : [];
      for (const anchor of anchors) {
        if (anchor.anchorSource === "controlled_route_kind_structural_anchor") counts.structuralRouteKind += 1;
        else if (anchor.anchorSource === "text_pattern") counts.textPattern += 1;
      }
    }
  }

  return counts;
}

function readinessRow({ gateRow, anchorRow, routeRows }) {
  const sources = anchorSourceCounts(routeRows);

  const hasAnyStructuralAnchor = sources.structuralRouteKind > 0;
  const hasAnyTextPatternAnchor = sources.textPattern > 0;

  const requiredEvidenceGroupsPresent =
    gateRow.seasonMarkerAnchorCount > 0 &&
    gateRow.fixtureResultAnchorCount > 0 &&
    gateRow.standingsAnchorCount > 0;

  const evidenceBoardStatus =
    gateRow.anchorQualityGateStatus === "passed_no_write_anchor_extractor_quality_gate" &&
    gateRow.anchorEvidenceReadyForNoWriteEvidenceBoard === true &&
    requiredEvidenceGroupsPresent
      ? "ready_for_no_write_anchored_evidence_evaluator"
      : "blocked_before_no_write_anchored_evidence_evaluator";

  const blockingReasons = [];
  if (gateRow.anchorQualityGateStatus !== "passed_no_write_anchor_extractor_quality_gate") blockingReasons.push("anchor_quality_gate_not_passed");
  if (gateRow.anchorEvidenceReadyForNoWriteEvidenceBoard !== true) blockingReasons.push("anchor_evidence_not_ready_for_board");
  if (!requiredEvidenceGroupsPresent) blockingReasons.push("required_anchor_groups_missing");
  if (gateRow.anchorEvidenceIsTruthAssertion !== false) blockingReasons.push("anchor_evidence_marked_as_truth_assertion");
  if (gateRow.structuralRouteKindAnchorsAreTruthAssertion !== false) blockingReasons.push("structural_anchor_marked_as_truth_assertion");

  return {
    competitionSlug: gateRow.competitionSlug,
    reusableFamily: gateRow.reusableFamily,
    routeAcquisitionType: gateRow.routeAcquisitionType,
    routeScope: gateRow.routeScope,

    evidenceBoardStatus,
    blockingReasons,
    routeAnchorRowCount: gateRow.routeAnchorRowCount,
    totalRouteAnchorStrength: gateRow.totalRouteAnchorStrength,

    seasonMarkerAnchorCount: gateRow.seasonMarkerAnchorCount,
    fixtureResultAnchorCount: gateRow.fixtureResultAnchorCount,
    standingsAnchorCount: gateRow.standingsAnchorCount,
    completedOrInactiveAnchorCount: gateRow.completedOrInactiveAnchorCount,
    restartDateAnchorCount: gateRow.restartDateAnchorCount,

    requiredEvidenceGroupsPresent,
    hasCompletedOrInactiveAnchorCandidates: gateRow.completedOrInactiveAnchorCount > 0,
    hasRestartDateAnchorCandidates: gateRow.restartDateAnchorCount > 0,
    hasAnyStructuralAnchor,
    hasAnyTextPatternAnchor,
    textPatternAnchorCount: sources.textPattern,
    structuralRouteKindAnchorCount: sources.structuralRouteKind,

    routeKinds: uniqueSorted(routeRows.map((row) => row.routeKind)),
    sourceUrls: uniqueSorted(routeRows.map((row) => row.sourceUrl)),
    finalUrls: uniqueSorted(routeRows.map((row) => row.finalUrl)),
    routeAnchorHashes: uniqueSorted(routeRows.map((row) => row.storedTextSha256)),

    anchorEvidenceIsTruthAssertion: false,
    structuralRouteKindAnchorsAreTruthAssertion: false,
    noMatchTodayDoesNotImplyInactive: true,
    zeroResultDoesNotImplyAbsence: true,
    validatorReadinessDoesNotImplyActive: true,

    fetchExecutedNow: false,
    searchExecutedNow: false,
    broadSearchExecutedNow: false,
    classifierExecutedNow: false,
    canonicalWriteExecutedNow: false,
    productionWriteExecutedNow: false,
    activeAssertedNow: false,
    inactiveAssertedNow: false,
    completedAssertedNow: false,
    seasonStateTruthAssertedNow: false,
    canonicalWrites: 0,
    productionWrite: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    nextAllowedStep:
      evidenceBoardStatus === "ready_for_no_write_anchored_evidence_evaluator"
        ? "build_no_write_anchored_season_state_evidence_evaluator"
        : "repair_no_write_route_snapshot_evidence_readiness_board",
    nextBlockedStep: "season_state_classifier_canonical_write_and_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);

  const qualityGate = readJson(args.qualityGateInput);
  const qualityGateRows = validateQualityGate(qualityGate);

  const anchorExtractor = readJson(args.anchorInput);
  const { competitionRows, routeRows } = validateAnchorExtractor(anchorExtractor);

  const anchorRowsBySlug = new Map(competitionRows.map((row) => [row.competitionSlug, row]));
  const routeRowsBySlug = groupBySlug(routeRows);

  const evidenceReadinessRows = qualityGateRows
    .map((gateRow) => readinessRow({
      gateRow,
      anchorRow: anchorRowsBySlug.get(gateRow.competitionSlug),
      routeRows: routeRowsBySlug.get(gateRow.competitionSlug) || []
    }))
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const readyRows = evidenceReadinessRows.filter((row) => row.evidenceBoardStatus === "ready_for_no_write_anchored_evidence_evaluator");
  const blockedRows = evidenceReadinessRows.filter((row) => row.evidenceBoardStatus !== "ready_for_no_write_anchored_evidence_evaluator");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-no-write-route-snapshot-evidence-readiness-board-file",
    mode: "build_no_write_route_snapshot_evidence_readiness_board_no_fetch_no_search_no_classifier_no_truth_assertion",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      noWriteRouteSnapshotAnchorExtractorQualityGate: args.qualityGateInput,
      noWriteRouteSnapshotAnchorExtractor: args.anchorInput
    },
    summary: {
      routeSnapshotEvidenceReadinessBoardCompetitionCount: evidenceReadinessRows.length,
      routeSnapshotEvidenceReadinessBoardReadyCount: readyRows.length,
      routeSnapshotEvidenceReadinessBoardBlockedCount: blockedRows.length,

      requiredEvidenceGroupsPresentCount: evidenceReadinessRows.filter((row) => row.requiredEvidenceGroupsPresent).length,
      completedOrInactiveAnchorCandidateCompetitionCount: evidenceReadinessRows.filter((row) => row.hasCompletedOrInactiveAnchorCandidates).length,
      restartDateAnchorCandidateCompetitionCount: evidenceReadinessRows.filter((row) => row.hasRestartDateAnchorCandidates).length,
      structuralRouteKindAnchorCompetitionCount: evidenceReadinessRows.filter((row) => row.hasAnyStructuralAnchor).length,
      textPatternAnchorCompetitionCount: evidenceReadinessRows.filter((row) => row.hasAnyTextPatternAnchor).length,

      totalRouteAnchorRowCount: evidenceReadinessRows.reduce((sum, row) => sum + row.routeAnchorRowCount, 0),
      totalRouteAnchorStrength: evidenceReadinessRows.reduce((sum, row) => sum + row.totalRouteAnchorStrength, 0),
      totalSeasonMarkerAnchorCount: evidenceReadinessRows.reduce((sum, row) => sum + row.seasonMarkerAnchorCount, 0),
      totalFixtureResultAnchorCount: evidenceReadinessRows.reduce((sum, row) => sum + row.fixtureResultAnchorCount, 0),
      totalStandingsAnchorCount: evidenceReadinessRows.reduce((sum, row) => sum + row.standingsAnchorCount, 0),
      totalCompletedOrInactiveAnchorCount: evidenceReadinessRows.reduce((sum, row) => sum + row.completedOrInactiveAnchorCount, 0),
      totalRestartDateAnchorCount: evidenceReadinessRows.reduce((sum, row) => sum + row.restartDateAnchorCount, 0),
      totalTextPatternAnchorCount: evidenceReadinessRows.reduce((sum, row) => sum + row.textPatternAnchorCount, 0),
      totalStructuralRouteKindAnchorCount: evidenceReadinessRows.reduce((sum, row) => sum + row.structuralRouteKindAnchorCount, 0),

      laligaEvidenceReadinessCompetitionCount: evidenceReadinessRows.filter((row) => row.reusableFamily === "laliga").length,
      norwayNtfEvidenceReadinessCompetitionCount: evidenceReadinessRows.filter((row) => row.reusableFamily === "norway_ntf").length,
      sportomediaEvidenceReadinessCompetitionCount: evidenceReadinessRows.filter((row) => row.reusableFamily === "sportomedia").length,

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
          ? "build_no_write_anchored_season_state_evidence_evaluator"
          : "repair_no_write_route_snapshot_evidence_readiness_board"
    },
    counts: {
      byReusableFamily: countBy(evidenceReadinessRows, "reusableFamily"),
      byEvidenceBoardStatus: countBy(evidenceReadinessRows, "evidenceBoardStatus"),
      byNextAllowedStep: countBy(evidenceReadinessRows, "nextAllowedStep")
    },
    guardrails: [
      "This board reads quality-gated anchor candidates only.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not classify season state.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Anchor candidates are not truth assertions.",
      "Structural route-kind anchors are not truth assertions.",
      "Completed/inactive candidates require later evaluator review and restart-date handling.",
      "No match today must not imply inactive.",
      "Zero result must not imply absence."
    ],
    evidenceReadinessRows,
    blockedRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    routeSnapshotEvidenceReadinessBoardCompetitionCount: output.summary.routeSnapshotEvidenceReadinessBoardCompetitionCount,
    routeSnapshotEvidenceReadinessBoardReadyCount: output.summary.routeSnapshotEvidenceReadinessBoardReadyCount,
    routeSnapshotEvidenceReadinessBoardBlockedCount: output.summary.routeSnapshotEvidenceReadinessBoardBlockedCount,
    requiredEvidenceGroupsPresentCount: output.summary.requiredEvidenceGroupsPresentCount,
    completedOrInactiveAnchorCandidateCompetitionCount: output.summary.completedOrInactiveAnchorCandidateCompetitionCount,
    restartDateAnchorCandidateCompetitionCount: output.summary.restartDateAnchorCandidateCompetitionCount,
    structuralRouteKindAnchorCompetitionCount: output.summary.structuralRouteKindAnchorCompetitionCount,
    textPatternAnchorCompetitionCount: output.summary.textPatternAnchorCompetitionCount,
    totalRouteAnchorRowCount: output.summary.totalRouteAnchorRowCount,
    totalRouteAnchorStrength: output.summary.totalRouteAnchorStrength,
    totalSeasonMarkerAnchorCount: output.summary.totalSeasonMarkerAnchorCount,
    totalFixtureResultAnchorCount: output.summary.totalFixtureResultAnchorCount,
    totalStandingsAnchorCount: output.summary.totalStandingsAnchorCount,
    totalCompletedOrInactiveAnchorCount: output.summary.totalCompletedOrInactiveAnchorCount,
    totalRestartDateAnchorCount: output.summary.totalRestartDateAnchorCount,
    totalTextPatternAnchorCount: output.summary.totalTextPatternAnchorCount,
    totalStructuralRouteKindAnchorCount: output.summary.totalStructuralRouteKindAnchorCount,
    laligaEvidenceReadinessCompetitionCount: output.summary.laligaEvidenceReadinessCompetitionCount,
    norwayNtfEvidenceReadinessCompetitionCount: output.summary.norwayNtfEvidenceReadinessCompetitionCount,
    sportomediaEvidenceReadinessCompetitionCount: output.summary.sportomediaEvidenceReadinessCompetitionCount,
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
