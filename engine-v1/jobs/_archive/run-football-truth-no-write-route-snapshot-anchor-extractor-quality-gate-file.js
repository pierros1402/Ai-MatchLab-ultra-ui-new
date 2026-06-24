#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";
const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/no-write-route-snapshot-anchor-extractor-2026-06-14/no-write-route-snapshot-anchor-extractor-2026-06-14.json";
const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/no-write-route-snapshot-anchor-extractor-quality-gate-2026-06-14/no-write-route-snapshot-anchor-extractor-quality-gate-2026-06-14.json";

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

function validateExtractor(input) {
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
  assertSummary(summary, "laligaAnchorExtractorCompetitionCount", 2);
  assertSummary(summary, "norwayNtfAnchorExtractorCompetitionCount", 2);
  assertSummary(summary, "sportomediaAnchorExtractorCompetitionCount", 2);

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

  if (summary.totalSeasonMarkerAnchorCount < 6) throw new Error("Expected at least 6 total season marker anchors.");
  if (summary.totalFixtureResultAnchorCount < 6) throw new Error("Expected at least 6 total fixture/result anchors.");
  if (summary.totalStandingsAnchorCount < 6) throw new Error("Expected at least 6 total standings anchors.");

  const competitionRows = Array.isArray(input.competitionAnchorRows) ? input.competitionAnchorRows : [];
  const routeRows = Array.isArray(input.routeAnchorRows) ? input.routeAnchorRows : [];

  if (competitionRows.length !== 6) throw new Error("Expected 6 competitionAnchorRows, got " + competitionRows.length);
  if (routeRows.length !== 18) throw new Error("Expected 18 routeAnchorRows, got " + routeRows.length);

  const slugs = uniqueSorted(competitionRows.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Unexpected competition slugs: " + slugs.join(", "));
  }

  for (const row of competitionRows) {
    if (row.extractorReadinessStatus !== "ready_for_no_write_anchor_quality_gate") {
      throw new Error(row.competitionSlug + ": extractor readiness is not ready");
    }
    if (row.routeCoverageComplete !== true) throw new Error(row.competitionSlug + ": route coverage incomplete");
    if (row.hasSeasonMarkerAnchors !== true) throw new Error(row.competitionSlug + ": missing season marker anchors");
    if (row.hasFixtureResultAnchors !== true) throw new Error(row.competitionSlug + ": missing fixture/result anchors");
    if (row.hasStandingsAnchors !== true) throw new Error(row.competitionSlug + ": missing standings anchors");
    if (row.activeAssertedNow !== false || row.inactiveAssertedNow !== false || row.completedAssertedNow !== false) {
      throw new Error(row.competitionSlug + ": truth assertions must remain false");
    }
    if (row.seasonStateTruthAssertedNow !== false || row.classifierExecutedNow !== false) {
      throw new Error(row.competitionSlug + ": classifier/truth assertion must remain false");
    }
    if (row.canonicalWriteExecutedNow !== false || row.productionWriteExecutedNow !== false) {
      throw new Error(row.competitionSlug + ": writes must remain false");
    }
    if (row.fetchExecutedNow !== false || row.searchExecutedNow !== false || row.broadSearchExecutedNow !== false) {
      throw new Error(row.competitionSlug + ": fetch/search flags must remain false");
    }
    if (row.userHintUsed !== false || row.hardcodedSeasonStateOverrideUsed !== false) {
      throw new Error(row.competitionSlug + ": hints/overrides must remain false");
    }
  }

  for (const row of routeRows) {
    if (row.routeAnchorStatus !== "route_anchor_candidates_extracted_no_truth_assertion") {
      throw new Error(row.competitionSlug + " " + row.routeKind + ": route anchor status not ready");
    }
    if (Number(row.routeAnchorStrength || 0) <= 0) {
      throw new Error(row.competitionSlug + " " + row.routeKind + ": routeAnchorStrength must be positive");
    }
    if (row.fetchExecutedNow !== false || row.searchExecutedNow !== false || row.broadSearchExecutedNow !== false) {
      throw new Error(row.competitionSlug + " " + row.routeKind + ": extractor must not fetch/search");
    }
    if (row.classifierExecutedNow !== false || row.seasonStateTruthAssertedNow !== false) {
      throw new Error(row.competitionSlug + " " + row.routeKind + ": classifier/truth assertion must be false");
    }
    if (row.canonicalWriteExecutedNow !== false || row.productionWriteExecutedNow !== false) {
      throw new Error(row.competitionSlug + " " + row.routeKind + ": write flags must be false");
    }
    if (row.userHintUsed !== false || row.hardcodedSeasonStateOverrideUsed !== false) {
      throw new Error(row.competitionSlug + " " + row.routeKind + ": hints/overrides must be false");
    }
  }

  return { competitionRows, routeRows };
}

function gateRow(row) {
  const blockingReasons = [];

  if (row.extractorReadinessStatus !== "ready_for_no_write_anchor_quality_gate") blockingReasons.push("extractor_not_ready");
  if (row.routeCoverageComplete !== true) blockingReasons.push("route_coverage_incomplete");
  if (row.hasSeasonMarkerAnchors !== true) blockingReasons.push("missing_season_marker_anchors");
  if (row.hasFixtureResultAnchors !== true) blockingReasons.push("missing_fixture_result_anchors");
  if (row.hasStandingsAnchors !== true) blockingReasons.push("missing_standings_anchors");
  if (row.seasonStateTruthAssertedNow !== false) blockingReasons.push("truth_asserted");
  if (row.classifierExecutedNow !== false) blockingReasons.push("classifier_executed");
  if (row.canonicalWriteExecutedNow !== false) blockingReasons.push("canonical_write_executed");
  if (row.productionWriteExecutedNow !== false) blockingReasons.push("production_write_executed");
  if (row.userHintUsed !== false) blockingReasons.push("user_hint_used");
  if (row.hardcodedSeasonStateOverrideUsed !== false) blockingReasons.push("hardcoded_override_used");

  const anchorQualityGateStatus =
    blockingReasons.length === 0
      ? "passed_no_write_anchor_extractor_quality_gate"
      : "blocked_no_write_anchor_extractor_quality_gate";

  return {
    competitionSlug: row.competitionSlug,
    reusableFamily: row.reusableFamily,
    routeAcquisitionType: row.routeAcquisitionType,
    routeScope: row.routeScope,

    anchorQualityGateStatus,
    blockingReasons,

    routeAnchorRowCount: row.routeAnchorRowCount,
    totalRouteAnchorStrength: row.totalRouteAnchorStrength,
    seasonMarkerAnchorCount: row.seasonMarkerAnchorCount,
    fixtureResultAnchorCount: row.fixtureResultAnchorCount,
    standingsAnchorCount: row.standingsAnchorCount,
    completedOrInactiveAnchorCount: row.completedOrInactiveAnchorCount,
    restartDateAnchorCount: row.restartDateAnchorCount,

    anchorEvidenceReadyForNoWriteEvidenceBoard: anchorQualityGateStatus === "passed_no_write_anchor_extractor_quality_gate",
    anchorEvidenceIsTruthAssertion: false,
    structuralRouteKindAnchorsAreTruthAssertion: false,

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

    nextAllowedStep: "build_no_write_route_snapshot_evidence_readiness_board",
    nextBlockedStep: "season_state_classifier_canonical_write_and_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const input = readJson(args.input);
  const { competitionRows, routeRows } = validateExtractor(input);

  const qualityGateRows = competitionRows
    .map(gateRow)
    .sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));

  const passedRows = qualityGateRows.filter((row) => row.anchorQualityGateStatus === "passed_no_write_anchor_extractor_quality_gate");
  const blockedRows = qualityGateRows.filter((row) => row.anchorQualityGateStatus !== "passed_no_write_anchor_extractor_quality_gate");

  if (blockedRows.length !== 0) {
    throw new Error("No-write anchor extractor quality gate blocked rows: " + blockedRows.map((row) => row.competitionSlug).join(", "));
  }

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "run-football-truth-no-write-route-snapshot-anchor-extractor-quality-gate-file",
    mode: "quality_gate_no_write_route_snapshot_anchor_extractor_no_fetch_no_search_no_classifier_no_truth_assertion",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      noWriteRouteSnapshotAnchorExtractor: args.input
    },
    summary: {
      anchorExtractorQualityGateCompetitionCount: qualityGateRows.length,
      anchorExtractorQualityGatePassedCount: passedRows.length,
      anchorExtractorQualityGateBlockedCount: blockedRows.length,

      anchorEvidenceReadyForNoWriteEvidenceBoardCount: qualityGateRows.filter((row) =>
        row.anchorEvidenceReadyForNoWriteEvidenceBoard
      ).length,
      routeAnchorRowCount: routeRows.length,
      routeAnchorRowsWithCandidatesCount: routeRows.filter((row) =>
        row.routeAnchorStatus === "route_anchor_candidates_extracted_no_truth_assertion"
      ).length,

      seasonMarkerAnchorCompetitionCount: qualityGateRows.filter((row) => row.seasonMarkerAnchorCount > 0).length,
      fixtureResultAnchorCompetitionCount: qualityGateRows.filter((row) => row.fixtureResultAnchorCount > 0).length,
      standingsAnchorCompetitionCount: qualityGateRows.filter((row) => row.standingsAnchorCount > 0).length,
      completedOrInactiveAnchorCompetitionCount: qualityGateRows.filter((row) => row.completedOrInactiveAnchorCount > 0).length,
      restartDateAnchorCompetitionCount: qualityGateRows.filter((row) => row.restartDateAnchorCount > 0).length,

      totalSeasonMarkerAnchorCount: qualityGateRows.reduce((sum, row) => sum + row.seasonMarkerAnchorCount, 0),
      totalFixtureResultAnchorCount: qualityGateRows.reduce((sum, row) => sum + row.fixtureResultAnchorCount, 0),
      totalStandingsAnchorCount: qualityGateRows.reduce((sum, row) => sum + row.standingsAnchorCount, 0),
      totalCompletedOrInactiveAnchorCount: qualityGateRows.reduce((sum, row) => sum + row.completedOrInactiveAnchorCount, 0),
      totalRestartDateAnchorCount: qualityGateRows.reduce((sum, row) => sum + row.restartDateAnchorCount, 0),

      laligaAnchorQualityGateCompetitionCount: qualityGateRows.filter((row) => row.reusableFamily === "laliga").length,
      norwayNtfAnchorQualityGateCompetitionCount: qualityGateRows.filter((row) => row.reusableFamily === "norway_ntf").length,
      sportomediaAnchorQualityGateCompetitionCount: qualityGateRows.filter((row) => row.reusableFamily === "sportomedia").length,

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

      recommendedNextLane: "build_no_write_route_snapshot_evidence_readiness_board"
    },
    counts: {
      byReusableFamily: countBy(qualityGateRows, "reusableFamily"),
      byAnchorQualityGateStatus: countBy(qualityGateRows, "anchorQualityGateStatus"),
      byNextAllowedStep: countBy(qualityGateRows, "nextAllowedStep")
    },
    guardrails: [
      "This quality gate reads anchor candidates only.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not classify season state.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Anchor candidates are not truth assertions.",
      "Structural route-kind anchors are not truth assertions.",
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
    anchorExtractorQualityGateCompetitionCount: output.summary.anchorExtractorQualityGateCompetitionCount,
    anchorExtractorQualityGatePassedCount: output.summary.anchorExtractorQualityGatePassedCount,
    anchorExtractorQualityGateBlockedCount: output.summary.anchorExtractorQualityGateBlockedCount,
    anchorEvidenceReadyForNoWriteEvidenceBoardCount: output.summary.anchorEvidenceReadyForNoWriteEvidenceBoardCount,
    routeAnchorRowCount: output.summary.routeAnchorRowCount,
    routeAnchorRowsWithCandidatesCount: output.summary.routeAnchorRowsWithCandidatesCount,
    seasonMarkerAnchorCompetitionCount: output.summary.seasonMarkerAnchorCompetitionCount,
    fixtureResultAnchorCompetitionCount: output.summary.fixtureResultAnchorCompetitionCount,
    standingsAnchorCompetitionCount: output.summary.standingsAnchorCompetitionCount,
    completedOrInactiveAnchorCompetitionCount: output.summary.completedOrInactiveAnchorCompetitionCount,
    restartDateAnchorCompetitionCount: output.summary.restartDateAnchorCompetitionCount,
    totalSeasonMarkerAnchorCount: output.summary.totalSeasonMarkerAnchorCount,
    totalFixtureResultAnchorCount: output.summary.totalFixtureResultAnchorCount,
    totalStandingsAnchorCount: output.summary.totalStandingsAnchorCount,
    totalCompletedOrInactiveAnchorCount: output.summary.totalCompletedOrInactiveAnchorCount,
    totalRestartDateAnchorCount: output.summary.totalRestartDateAnchorCount,
    laligaAnchorQualityGateCompetitionCount: output.summary.laligaAnchorQualityGateCompetitionCount,
    norwayNtfAnchorQualityGateCompetitionCount: output.summary.norwayNtfAnchorQualityGateCompetitionCount,
    sportomediaAnchorQualityGateCompetitionCount: output.summary.sportomediaAnchorQualityGateCompetitionCount,
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
