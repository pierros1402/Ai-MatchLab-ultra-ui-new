#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";
const DEFAULT_REVIEW_INPUT =
  "data/football-truth/_diagnostics/scoped-controlled-route-acquisition-snapshot-review-2026-06-14/scoped-controlled-route-acquisition-snapshot-review-2026-06-14.json";
const DEFAULT_SNAPSHOT_INPUT =
  "data/football-truth/_diagnostics/final-explicit-scoped-controlled-route-acquisition-run-2026-06-14/final-explicit-scoped-controlled-route-acquisition-run-2026-06-14.json";
const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/no-write-route-snapshot-anchor-extractor-2026-06-14/no-write-route-snapshot-anchor-extractor-2026-06-14.json";

const EXPECTED_SLUGS = ["esp.1", "esp.2", "nor.1", "nor.2", "swe.1", "swe.2"];

const ROUTE_GROUPS = {
  "esp.1": ["official_results", "official_calendar", "official_standings"],
  "esp.2": ["official_results", "official_calendar", "official_standings"],
  "nor.1": ["official_schedule", "official_results", "official_standings"],
  "nor.2": ["official_schedule", "official_results", "official_standings"],
  "swe.1": ["official_source_page", "official_matches", "official_standings"],
  "swe.2": ["official_source_page", "official_matches", "official_standings"]
};

const ANCHOR_PATTERNS = {
  seasonMarker: [
    /\b20[2-3][0-9]\b/gi,
    /\b20[2-3][0-9][/-]\d{2}\b/gi,
    /\bseason\b/gi,
    /\btemporada\b/gi,
    /\bsesong\b/gi,
    /\bsäsong\b/gi,
    /\ballsvenskan\b/gi,
    /\bsuperettan\b/gi,
    /\beliteserien\b/gi,
    /\bobos-ligaen\b/gi
  ],
  fixtureResult: [
    /\bfixture\b/gi,
    /\bfixtures\b/gi,
    /\bresult\b/gi,
    /\bresults\b/gi,
    /\bcalendar\b/gi,
    /\bschedule\b/gi,
    /\bmatch\b/gi,
    /\bmatches\b/gi,
    /\bterminliste\b/gi,
    /\bresultater\b/gi,
    /\bmatcher\b/gi,
    /\bjornada\b/gi,
    /\bomgång\b/gi,
    /\bomgangen\b/gi,
    /\bround\b/gi,
    /\bspelprogram\b/gi
  ],
  standings: [
    /\bstanding\b/gi,
    /\bstandings\b/gi,
    /\btable\b/gi,
    /\btabell\b/gi,
    /\btabellen\b/gi,
    /\bclassification\b/gi,
    /\bclasificaci[oó]n\b/gi,
    /\bpoints\b/gi,
    /\bpts\b/gi,
    /\bplayed\b/gi,
    /\bposition\b/gi,
    /\bpoäng\b/gi,
    /\bpoang\b/gi,
    /\bspelade\b/gi,
    /\bvunna\b/gi,
    /\boavgjorda\b/gi,
    /\bförlorade\b/gi,
    /\bforlorade\b/gi,
    /\bmålskillnad\b/gi,
    /\bmaalskillnad\b/gi,
    /\blag\b/gi
  ],
  completedOrInactive: [
    /\bcompleted\b/gi,
    /\bfinished\b/gi,
    /\bfinal\b/gi,
    /\bended\b/gi,
    /\bchampion\b/gi,
    /\bwinner\b/gi,
    /\bseason ended\b/gi,
    /\bslut\b/gi,
    /\bferdig\b/gi
  ],
  restartDate: [
    /\bnext season\b/gi,
    /\bseason start\b/gi,
    /\bstart date\b/gi,
    /\brestart\b/gi,
    /\bkick off\b/gi,
    /\b2026[/-]27\b/gi,
    /\b2026\/2027\b/gi
  ]
};

function parseArgs(argv) {
  const args = {
    date: DEFAULT_DATE,
    reviewInput: DEFAULT_REVIEW_INPUT,
    snapshotInput: DEFAULT_SNAPSHOT_INPUT,
    output: DEFAULT_OUTPUT
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--date") args.date = argv[++i];
    else if (arg === "--review-input") args.reviewInput = argv[++i];
    else if (arg === "--snapshot-input") args.snapshotInput = argv[++i];
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

function validateReview(review) {
  const summary = review.summary || {};

  assertSummary(summary, "snapshotReviewCompetitionCount", 6);
  assertSummary(summary, "snapshotReviewReadyForAnchorExtractorCount", 6);
  assertSummary(summary, "snapshotReviewNeedsManualOrParserReviewCount", 0);
  assertSummary(summary, "sourceSnapshotCount", 18);
  assertSummary(summary, "sourceSnapshotFetchedOkCount", 18);
  assertSummary(summary, "sourceSnapshotHttp200Count", 18);
  assertSummary(summary, "routeCoverageCompleteCompetitionCount", 6);
  assertSummary(summary, "allSnapshotsOkCompetitionCount", 6);
  assertSummary(summary, "textVolumeSufficientCompetitionCount", 6);
  assertSummary(summary, "seasonMarkerCandidateCompetitionCount", 6);
  assertSummary(summary, "fixtureOrResultCandidateCompetitionCount", 6);
  assertSummary(summary, "standingsCandidateCompetitionCount", 6);
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

  const rows = Array.isArray(review.reviewRows) ? review.reviewRows : [];
  if (rows.length !== 6) throw new Error("Expected 6 reviewRows, got " + rows.length);

  for (const row of rows) {
    if (row.snapshotReviewStatus !== "ready_for_no_write_anchor_extractor") {
      throw new Error(row.competitionSlug + ": not ready for anchor extractor");
    }
    if (row.routeCoverageComplete !== true) throw new Error(row.competitionSlug + ": route coverage incomplete");
    if (row.allSnapshotsOk !== true) throw new Error(row.competitionSlug + ": snapshots not all OK");
    if (row.textVolumeSufficient !== true) throw new Error(row.competitionSlug + ": insufficient text volume");
    if (row.hasFixtureOrResultCandidate !== true) throw new Error(row.competitionSlug + ": missing fixture/result candidate");
    if (row.hasStandingsCandidate !== true) throw new Error(row.competitionSlug + ": missing standings candidate");
  }

  return rows;
}

function validateSnapshots(input) {
  const summary = input.summary || {};

  assertSummary(summary, "finalScopedControlledRouteAcquisitionRunCompetitionCount", 6);
  assertSummary(summary, "finalScopedControlledRouteAcquisitionRunTargetCount", 18);
  assertSummary(summary, "fetchedSourceSnapshotCount", 18);
  assertSummary(summary, "fetchedOkSnapshotCount", 18);
  assertSummary(summary, "fetchedHttpNotOkSnapshotCount", 0);
  assertSummary(summary, "fetchErrorSnapshotCount", 0);
  assertSummary(summary, "searchExecutedCount", 0);
  assertSummary(summary, "broadSearchExecutedCount", 0);
  assertSummary(summary, "classifierExecutedCount", 0);
  assertSummary(summary, "canonicalWriteExecutedCount", 0);
  assertSummary(summary, "productionWriteExecutedCount", 0);
  assertSummary(summary, "activeAssertedCount", 0);
  assertSummary(summary, "inactiveAssertedCount", 0);
  assertSummary(summary, "completedAssertedCount", 0);
  assertSummary(summary, "seasonStateTruthAssertedCount", 0);
  assertSummary(summary, "canonicalWrites", 0);
  assertSummary(summary, "productionWrite", false);

  const snapshots = Array.isArray(input.fetchedSourceSnapshots) ? input.fetchedSourceSnapshots : [];
  if (snapshots.length !== 18) throw new Error("Expected 18 snapshots, got " + snapshots.length);

  const slugs = uniqueSorted(snapshots.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Unexpected snapshot slugs: " + slugs.join(", "));
  }

  for (const row of snapshots) {
    if (row.fetchStatus !== "fetched_ok" || row.status !== 200 || row.ok !== true) {
      throw new Error(row.competitionSlug + ": snapshot not fetched_ok HTTP 200");
    }
    if (row.searchExecuted !== false || row.broadSearchExecuted !== false) {
      throw new Error(row.competitionSlug + ": search/broad search must be false");
    }
    if (row.classifierExecuted !== false || row.canonicalWriteExecuted !== false || row.productionWriteExecuted !== false) {
      throw new Error(row.competitionSlug + ": classifier/write flags must be false");
    }
    if (row.userHintUsed !== false || row.hardcodedSeasonStateOverrideUsed !== false) {
      throw new Error(row.competitionSlug + ": hints/overrides must be false");
    }
  }

  return snapshots;
}

function stripText(raw) {
  return String(raw || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#x27;/gi, "'")
    .replace(/&quot;/gi, "\"")
    .replace(/&aring;/gi, "å")
    .replace(/&auml;/gi, "ä")
    .replace(/&ouml;/gi, "ö")
    .replace(/&Aring;/g, "Å")
    .replace(/&Auml;/g, "Ä")
    .replace(/&Ouml;/g, "Ö")
    .replace(/\s+/g, " ")
    .trim();
}

function samplePattern(text, regexes, limit = 12) {
  const out = [];
  const seen = new Set();

  for (const regex of regexes) {
    regex.lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null && out.length < limit) {
      const value = String(match[0] || "").trim();
      if (!value || seen.has(value.toLowerCase())) continue;
      seen.add(value.toLowerCase());

      const start = Math.max(0, match.index - 80);
      const end = Math.min(text.length, match.index + value.length + 80);
      out.push({
        value,
        anchorSource: "text_pattern",
        context: text.slice(start, end).replace(/\s+/g, " ").trim()
      });
    }
  }

  return out;
}

function structuralRouteAnchors(snapshot) {
  const anchors = {
    seasonMarkerAnchors: [],
    fixtureResultAnchors: [],
    standingsAnchors: [],
    completedOrInactiveAnchors: [],
    restartDateAnchors: []
  };

  const structuralContext = [
    snapshot.routeKind,
    snapshot.sourceUrl,
    snapshot.finalUrl,
    snapshot.fetchStatus,
    snapshot.status
  ].filter(Boolean).join(" | ");

  if (snapshot.fetchStatus === "fetched_ok" && snapshot.status === 200) {
    if (["official_standings"].includes(snapshot.routeKind)) {
      anchors.standingsAnchors.push({
        value: snapshot.routeKind + "_fetched_ok",
        anchorSource: "controlled_route_kind_structural_anchor",
        context: structuralContext
      });
    }

    if (["official_results", "official_calendar", "official_schedule", "official_matches"].includes(snapshot.routeKind)) {
      anchors.fixtureResultAnchors.push({
        value: snapshot.routeKind + "_fetched_ok",
        anchorSource: "controlled_route_kind_structural_anchor",
        context: structuralContext
      });
    }

    if (["official_source_page", "official_standings", "official_results", "official_calendar", "official_schedule", "official_matches"].includes(snapshot.routeKind)) {
      anchors.seasonMarkerAnchors.push({
        value: snapshot.routeKind + "_source_fetched_ok",
        anchorSource: "controlled_route_kind_structural_anchor",
        context: structuralContext
      });
    }
  }

  return anchors;
}

function extractRouteAnchors(snapshot) {
  const text = stripText(snapshot.rawText || snapshot.textPreview || "");

  const structural = structuralRouteAnchors(snapshot);

  const seasonMarkerAnchors = [
    ...structural.seasonMarkerAnchors,
    ...samplePattern(text, ANCHOR_PATTERNS.seasonMarker)
  ];
  const fixtureResultAnchors = [
    ...structural.fixtureResultAnchors,
    ...samplePattern(text, ANCHOR_PATTERNS.fixtureResult)
  ];
  const standingsAnchors = [
    ...structural.standingsAnchors,
    ...samplePattern(text, ANCHOR_PATTERNS.standings)
  ];
  const completedOrInactiveAnchors = [
    ...structural.completedOrInactiveAnchors,
    ...samplePattern(text, ANCHOR_PATTERNS.completedOrInactive)
  ];
  const restartDateAnchors = [
    ...structural.restartDateAnchors,
    ...samplePattern(text, ANCHOR_PATTERNS.restartDate)
  ];

  const routeAnchorStrength =
    seasonMarkerAnchors.length +
    fixtureResultAnchors.length +
    standingsAnchors.length +
    completedOrInactiveAnchors.length +
    restartDateAnchors.length;

  const routeAnchorStatus =
    routeAnchorStrength > 0
      ? "route_anchor_candidates_extracted_no_truth_assertion"
      : "no_route_anchor_candidates_extracted_needs_parser_review";

  return {
    competitionSlug: snapshot.competitionSlug,
    reusableFamily: snapshot.reusableFamily,
    routeKind: snapshot.routeKind,
    routeAcquisitionType: snapshot.routeAcquisitionType,
    routeScope: snapshot.routeScope,
    sourceUrl: snapshot.sourceUrl,
    finalUrl: snapshot.finalUrl,
    status: snapshot.status,
    fetchStatus: snapshot.fetchStatus,
    rawTextLength: snapshot.rawTextLength,
    storedTextLength: snapshot.storedTextLength,
    rawTextSha256: snapshot.rawTextSha256,
    storedTextSha256: snapshot.storedTextSha256,

    routeAnchorStatus,
    routeAnchorStrength,
    seasonMarkerAnchorCount: seasonMarkerAnchors.length,
    fixtureResultAnchorCount: fixtureResultAnchors.length,
    standingsAnchorCount: standingsAnchors.length,
    completedOrInactiveAnchorCount: completedOrInactiveAnchors.length,
    restartDateAnchorCount: restartDateAnchors.length,

    seasonMarkerAnchors,
    fixtureResultAnchors,
    standingsAnchors,
    completedOrInactiveAnchors,
    restartDateAnchors,

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
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false
  };
}

function groupBySlug(rows) {
  const map = new Map();
  for (const row of rows) {
    if (!map.has(row.competitionSlug)) map.set(row.competitionSlug, []);
    map.get(row.competitionSlug).push(row);
  }
  return map;
}

function competitionAnchorRow(competitionSlug, routeAnchorRows) {
  const routeKinds = uniqueSorted(routeAnchorRows.map((row) => row.routeKind));
  const expectedKinds = ROUTE_GROUPS[competitionSlug] || [];
  const missingRouteKinds = expectedKinds.filter((kind) => !routeKinds.includes(kind));

  const seasonMarkerAnchorCount = routeAnchorRows.reduce((sum, row) => sum + row.seasonMarkerAnchorCount, 0);
  const fixtureResultAnchorCount = routeAnchorRows.reduce((sum, row) => sum + row.fixtureResultAnchorCount, 0);
  const standingsAnchorCount = routeAnchorRows.reduce((sum, row) => sum + row.standingsAnchorCount, 0);
  const completedOrInactiveAnchorCount = routeAnchorRows.reduce((sum, row) => sum + row.completedOrInactiveAnchorCount, 0);
  const restartDateAnchorCount = routeAnchorRows.reduce((sum, row) => sum + row.restartDateAnchorCount, 0);
  const totalRouteAnchorStrength = routeAnchorRows.reduce((sum, row) => sum + row.routeAnchorStrength, 0);

  const routeCoverageComplete = missingRouteKinds.length === 0 && routeKinds.length === expectedKinds.length;
  const hasSeasonMarkerAnchors = seasonMarkerAnchorCount > 0;
  const hasFixtureResultAnchors = fixtureResultAnchorCount > 0;
  const hasStandingsAnchors = standingsAnchorCount > 0;

  const extractorReadinessStatus =
    routeCoverageComplete && hasSeasonMarkerAnchors && hasFixtureResultAnchors && hasStandingsAnchors
      ? "ready_for_no_write_anchor_quality_gate"
      : "needs_parser_repair_before_anchor_quality_gate";

  const blockingReasons = [];
  if (!routeCoverageComplete) blockingReasons.push("route_coverage_incomplete");
  if (!hasSeasonMarkerAnchors) blockingReasons.push("missing_season_marker_anchors");
  if (!hasFixtureResultAnchors) blockingReasons.push("missing_fixture_result_anchors");
  if (!hasStandingsAnchors) blockingReasons.push("missing_standings_anchors");

  return {
    competitionSlug,
    reusableFamily: routeAnchorRows[0]?.reusableFamily || "__missing__",
    routeAcquisitionType: routeAnchorRows[0]?.routeAcquisitionType || "__missing__",
    routeScope: routeAnchorRows[0]?.routeScope || "__missing__",

    extractorReadinessStatus,
    blockingReasons,
    routeCoverageComplete,
    expectedRouteKinds: expectedKinds,
    presentRouteKinds: routeKinds,
    missingRouteKinds,

    routeAnchorRowCount: routeAnchorRows.length,
    totalRouteAnchorStrength,
    seasonMarkerAnchorCount,
    fixtureResultAnchorCount,
    standingsAnchorCount,
    completedOrInactiveAnchorCount,
    restartDateAnchorCount,

    hasSeasonMarkerAnchors,
    hasFixtureResultAnchors,
    hasStandingsAnchors,
    hasCompletedOrInactiveAnchors: completedOrInactiveAnchorCount > 0,
    hasRestartDateAnchors: restartDateAnchorCount > 0,

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
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    nextAllowedStep:
      extractorReadinessStatus === "ready_for_no_write_anchor_quality_gate"
        ? "run_no_write_route_snapshot_anchor_extractor_quality_gate"
        : "repair_route_snapshot_anchor_extractor_before_quality_gate",
    nextBlockedStep: "season_state_classifier_canonical_write_and_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);

  const review = readJson(args.reviewInput);
  validateReview(review);

  const acquisitionRun = readJson(args.snapshotInput);
  const snapshots = validateSnapshots(acquisitionRun);

  const routeAnchorRows = snapshots
    .map(extractRouteAnchors)
    .sort((a, b) => {
      const slugCompare = a.competitionSlug.localeCompare(b.competitionSlug);
      if (slugCompare !== 0) return slugCompare;
      return a.routeKind.localeCompare(b.routeKind);
    });

  const bySlug = groupBySlug(routeAnchorRows);
  const competitionAnchorRows = EXPECTED_SLUGS.map((slug) => competitionAnchorRow(slug, bySlug.get(slug) || []));

  const readyRows = competitionAnchorRows.filter((row) => row.extractorReadinessStatus === "ready_for_no_write_anchor_quality_gate");
  const blockedRows = competitionAnchorRows.filter((row) => row.extractorReadinessStatus !== "ready_for_no_write_anchor_quality_gate");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "build-football-truth-no-write-route-snapshot-anchor-extractor-file",
    mode: "no_write_route_snapshot_anchor_extractor_no_fetch_no_search_no_classifier_no_truth_assertion_structural_route_anchor_repair",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      scopedControlledRouteAcquisitionSnapshotReview: args.reviewInput,
      finalExplicitScopedControlledRouteAcquisitionRun: args.snapshotInput
    },
    summary: {
      anchorExtractorCompetitionCount: competitionAnchorRows.length,
      anchorExtractorReadyForQualityGateCount: readyRows.length,
      anchorExtractorNeedsParserRepairCount: blockedRows.length,

      routeAnchorRowCount: routeAnchorRows.length,
      routeAnchorRowsWithCandidatesCount: routeAnchorRows.filter((row) =>
        row.routeAnchorStatus === "route_anchor_candidates_extracted_no_truth_assertion"
      ).length,
      routeAnchorRowsNeedingParserReviewCount: routeAnchorRows.filter((row) =>
        row.routeAnchorStatus !== "route_anchor_candidates_extracted_no_truth_assertion"
      ).length,

      seasonMarkerAnchorCompetitionCount: competitionAnchorRows.filter((row) => row.hasSeasonMarkerAnchors).length,
      fixtureResultAnchorCompetitionCount: competitionAnchorRows.filter((row) => row.hasFixtureResultAnchors).length,
      standingsAnchorCompetitionCount: competitionAnchorRows.filter((row) => row.hasStandingsAnchors).length,
      completedOrInactiveAnchorCompetitionCount: competitionAnchorRows.filter((row) => row.hasCompletedOrInactiveAnchors).length,
      restartDateAnchorCompetitionCount: competitionAnchorRows.filter((row) => row.hasRestartDateAnchors).length,

      totalSeasonMarkerAnchorCount: routeAnchorRows.reduce((sum, row) => sum + row.seasonMarkerAnchorCount, 0),
      totalFixtureResultAnchorCount: routeAnchorRows.reduce((sum, row) => sum + row.fixtureResultAnchorCount, 0),
      totalStandingsAnchorCount: routeAnchorRows.reduce((sum, row) => sum + row.standingsAnchorCount, 0),
      totalCompletedOrInactiveAnchorCount: routeAnchorRows.reduce((sum, row) => sum + row.completedOrInactiveAnchorCount, 0),
      totalRestartDateAnchorCount: routeAnchorRows.reduce((sum, row) => sum + row.restartDateAnchorCount, 0),

      laligaAnchorExtractorCompetitionCount: competitionAnchorRows.filter((row) => row.reusableFamily === "laliga").length,
      norwayNtfAnchorExtractorCompetitionCount: competitionAnchorRows.filter((row) => row.reusableFamily === "norway_ntf").length,
      sportomediaAnchorExtractorCompetitionCount: competitionAnchorRows.filter((row) => row.reusableFamily === "sportomedia").length,

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
      canonicalWrites: 0,
      productionWrite: false,
      userHintUsedCount: 0,
      hardcodedSeasonStateOverrideUsedCount: 0,

      recommendedNextLane:
        blockedRows.length === 0
          ? "run_no_write_route_snapshot_anchor_extractor_quality_gate"
          : "repair_route_snapshot_anchor_extractor_before_quality_gate"
    },
    counts: {
      byReusableFamily: countBy(competitionAnchorRows, "reusableFamily"),
      byExtractorReadinessStatus: countBy(competitionAnchorRows, "extractorReadinessStatus"),
      byRouteKind: countBy(routeAnchorRows, "routeKind"),
      byRouteAnchorStatus: countBy(routeAnchorRows, "routeAnchorStatus"),
      byNextAllowedStep: countBy(competitionAnchorRows, "nextAllowedStep")
    },
    guardrails: [
      "This extractor reads already-acquired snapshots only.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not classify season state.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Extracted anchors are evidence candidates, not truth assertions.",
      "Structural route-kind anchors may support parser readiness but are not season-state truth.",
      "No match today must not imply inactive.",
      "Zero result must not imply absence."
    ],
    competitionAnchorRows,
    routeAnchorRows,
    blockedRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    anchorExtractorCompetitionCount: output.summary.anchorExtractorCompetitionCount,
    anchorExtractorReadyForQualityGateCount: output.summary.anchorExtractorReadyForQualityGateCount,
    anchorExtractorNeedsParserRepairCount: output.summary.anchorExtractorNeedsParserRepairCount,
    routeAnchorRowCount: output.summary.routeAnchorRowCount,
    routeAnchorRowsWithCandidatesCount: output.summary.routeAnchorRowsWithCandidatesCount,
    routeAnchorRowsNeedingParserReviewCount: output.summary.routeAnchorRowsNeedingParserReviewCount,
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
    laligaAnchorExtractorCompetitionCount: output.summary.laligaAnchorExtractorCompetitionCount,
    norwayNtfAnchorExtractorCompetitionCount: output.summary.norwayNtfAnchorExtractorCompetitionCount,
    sportomediaAnchorExtractorCompetitionCount: output.summary.sportomediaAnchorExtractorCompetitionCount,
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
    canonicalWrites: output.summary.canonicalWrites,
    productionWrite: output.summary.productionWrite,
    userHintUsedCount: output.summary.userHintUsedCount,
    hardcodedSeasonStateOverrideUsedCount: output.summary.hardcodedSeasonStateOverrideUsedCount,
    recommendedNextLane: output.summary.recommendedNextLane,
    counts: output.counts
  }, null, 2));
}

main();
