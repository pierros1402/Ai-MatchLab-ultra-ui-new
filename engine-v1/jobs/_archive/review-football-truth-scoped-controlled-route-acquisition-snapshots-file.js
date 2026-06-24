#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const DEFAULT_DATE = "2026-06-14";
const DEFAULT_INPUT =
  "data/football-truth/_diagnostics/final-explicit-scoped-controlled-route-acquisition-run-2026-06-14/final-explicit-scoped-controlled-route-acquisition-run-2026-06-14.json";
const DEFAULT_OUTPUT =
  "data/football-truth/_diagnostics/scoped-controlled-route-acquisition-snapshot-review-2026-06-14/scoped-controlled-route-acquisition-snapshot-review-2026-06-14.json";

const EXPECTED_SLUGS = ["esp.1", "esp.2", "nor.1", "nor.2", "swe.1", "swe.2"];

const REQUIRED_ROUTE_GROUPS = {
  "esp.1": ["official_results", "official_calendar", "official_standings"],
  "esp.2": ["official_results", "official_calendar", "official_standings"],
  "nor.1": ["official_schedule", "official_results", "official_standings"],
  "nor.2": ["official_schedule", "official_results", "official_standings"],
  "swe.1": ["official_source_page", "official_matches", "official_standings"],
  "swe.2": ["official_source_page", "official_matches", "official_standings"]
};

const FAMILY_MIN_TEXT_TOTAL = {
  laliga: 250000,
  norway_ntf: 150000,
  sportomedia: 50000
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

function validateAcquisitionRun(input) {
  const summary = input.summary || {};

  assertSummary(summary, "finalScopedControlledRouteAcquisitionRunCompetitionCount", 6);
  assertSummary(summary, "finalScopedControlledRouteAcquisitionRunTargetCount", 18);
  assertSummary(summary, "fetchedSourceSnapshotCount", 18);
  assertSummary(summary, "fetchedOkSnapshotCount", 18);
  assertSummary(summary, "fetchedHttpNotOkSnapshotCount", 0);
  assertSummary(summary, "fetchErrorSnapshotCount", 0);
  assertSummary(summary, "controlledRouteAcquisitionExecutedCount", 18);
  assertSummary(summary, "fetchExecutedCount", 18);
  assertSummary(summary, "searchExecutedCount", 0);
  assertSummary(summary, "broadSearchExecutedCount", 0);
  assertSummary(summary, "classifierExecutedCount", 0);
  assertSummary(summary, "canonicalWriteExecutedCount", 0);
  assertSummary(summary, "productionWriteExecutedCount", 0);
  assertSummary(summary, "laligaAcquisitionRunCompetitionCount", 2);
  assertSummary(summary, "norwayNtfAcquisitionRunCompetitionCount", 2);
  assertSummary(summary, "sportomediaAcquisitionRunCompetitionCount", 2);
  assertSummary(summary, "userHintUsedCount", 0);
  assertSummary(summary, "hardcodedSeasonStateOverrideUsedCount", 0);
  assertSummary(summary, "activeAssertedCount", 0);
  assertSummary(summary, "inactiveAssertedCount", 0);
  assertSummary(summary, "completedAssertedCount", 0);
  assertSummary(summary, "seasonStateTruthAssertedCount", 0);
  assertSummary(summary, "canonicalWrites", 0);
  assertSummary(summary, "productionWrite", false);

  const snapshots = Array.isArray(input.fetchedSourceSnapshots) ? input.fetchedSourceSnapshots : [];
  if (snapshots.length !== 18) throw new Error("Expected 18 fetchedSourceSnapshots, got " + snapshots.length);

  const slugs = uniqueSorted(snapshots.map((row) => row.competitionSlug));
  if (JSON.stringify(slugs) !== JSON.stringify(EXPECTED_SLUGS)) {
    throw new Error("Unexpected snapshot slugs: " + slugs.join(", "));
  }

  for (const snapshot of snapshots) {
    if (snapshot.fetchStatus !== "fetched_ok") throw new Error(snapshot.competitionSlug + ": snapshot not fetched_ok");
    if (snapshot.ok !== true) throw new Error(snapshot.competitionSlug + ": snapshot ok must be true");
    if (snapshot.status !== 200) throw new Error(snapshot.competitionSlug + ": snapshot status must be 200");
    if (snapshot.controlledRouteAcquisitionExecuted !== true) {
      throw new Error(snapshot.competitionSlug + ": controlled acquisition did not execute");
    }
    if (snapshot.fetchExecuted !== true) throw new Error(snapshot.competitionSlug + ": fetch did not execute");
    if (snapshot.searchExecuted !== false) throw new Error(snapshot.competitionSlug + ": search executed unexpectedly");
    if (snapshot.broadSearchExecuted !== false) throw new Error(snapshot.competitionSlug + ": broad search executed unexpectedly");
    if (snapshot.classifierExecuted !== false) throw new Error(snapshot.competitionSlug + ": classifier executed unexpectedly");
    if (snapshot.canonicalWriteExecuted !== false) throw new Error(snapshot.competitionSlug + ": canonical write executed unexpectedly");
    if (snapshot.productionWriteExecuted !== false) throw new Error(snapshot.competitionSlug + ": production write executed unexpectedly");
    if (snapshot.userHintUsed !== false || snapshot.hardcodedSeasonStateOverrideUsed !== false) {
      throw new Error(snapshot.competitionSlug + ": hints/overrides must be false");
    }
    if (!snapshot.rawTextSha256 || !snapshot.storedTextSha256) {
      throw new Error(snapshot.competitionSlug + ": snapshot hashes are missing");
    }
  }

  return snapshots;
}

function groupBySlug(snapshots) {
  const map = new Map();
  for (const snapshot of snapshots) {
    if (!map.has(snapshot.competitionSlug)) map.set(snapshot.competitionSlug, []);
    map.get(snapshot.competitionSlug).push(snapshot);
  }
  return map;
}

function hasAnyText(text, tokens) {
  const lower = String(text || "").toLowerCase();
  return tokens.some((token) => lower.includes(token.toLowerCase()));
}

function buildContentSignals(snapshots) {
  const combinedPreview = snapshots.map((row) => row.textPreview || "").join(" ");
  const combinedRaw = snapshots.map((row) => row.rawText || "").join(" ");

  return {
    hasSeasonMarkerCandidate:
      hasAnyText(combinedRaw, ["2025", "2026", "season", "temporada", "sesong", "säsong", "round", "matchday", "jornada", "omgång"]),
    hasFixtureOrResultCandidate:
      hasAnyText(combinedRaw, ["fixture", "result", "calendar", "schedule", "terminliste", "resultater", "matcher", "results", "fixtures", "kickoff", "match"]),
    hasStandingsCandidate:
      hasAnyText(combinedRaw, ["standing", "standings", "table", "tabell", "classification", "clasificación", "points", "pts", "played"]),
    hasCompletedOrInactiveCandidate:
      hasAnyText(combinedRaw, ["completed", "finished", "final", "ended", "season ended", "slut", "ferdig", "champion", "winner"]),
    hasRestartDateCandidate:
      hasAnyText(combinedRaw, ["2026/27", "2026-27", "next season", "season start", "start date", "kick off", "restart"]),
    preview: combinedPreview.slice(0, 1200)
  };
}

function reviewCompetition(competitionSlug, snapshots) {
  const reusableFamily = snapshots[0]?.reusableFamily || "__missing__";
  const routeAcquisitionType = snapshots[0]?.routeAcquisitionType || "__missing__";
  const routeScope = snapshots[0]?.routeScope || "__missing__";

  const expectedKinds = REQUIRED_ROUTE_GROUPS[competitionSlug] || [];
  const presentKinds = uniqueSorted(snapshots.map((row) => row.routeKind));
  const missingKinds = expectedKinds.filter((kind) => !presentKinds.includes(kind));

  const okSnapshotCount = snapshots.filter((row) => row.fetchStatus === "fetched_ok" && row.status === 200).length;
  const snapshotCount = snapshots.length;
  const totalRawTextLength = snapshots.reduce((sum, row) => sum + Number(row.rawTextLength || 0), 0);
  const totalStoredTextLength = snapshots.reduce((sum, row) => sum + Number(row.storedTextLength || 0), 0);
  const minRequiredTextLength = FAMILY_MIN_TEXT_TOTAL[reusableFamily] || 50000;

  const signals = buildContentSignals(snapshots);

  const routeCoverageComplete = missingKinds.length === 0 && snapshotCount === expectedKinds.length;
  const allSnapshotsOk = okSnapshotCount === expectedKinds.length;
  const textVolumeSufficient = totalRawTextLength >= minRequiredTextLength;

  const evidenceReadinessStatus =
    routeCoverageComplete && allSnapshotsOk && textVolumeSufficient && signals.hasFixtureOrResultCandidate && signals.hasStandingsCandidate
      ? "ready_for_no_write_anchor_extractor"
      : "needs_snapshot_review_before_anchor_extractor";

  const blockingReasons = [];
  if (!routeCoverageComplete) blockingReasons.push("route_coverage_incomplete");
  if (!allSnapshotsOk) blockingReasons.push("not_all_expected_snapshots_ok");
  if (!textVolumeSufficient) blockingReasons.push("text_volume_below_family_threshold");
  if (!signals.hasFixtureOrResultCandidate) blockingReasons.push("fixture_or_result_anchor_not_detected");
  if (!signals.hasStandingsCandidate) blockingReasons.push("standings_anchor_not_detected");

  return {
    competitionSlug,
    reusableFamily,
    routeAcquisitionType,
    routeScope,

    snapshotReviewStatus: evidenceReadinessStatus,
    blockingReasons,
    expectedRouteKinds: expectedKinds,
    presentRouteKinds: presentKinds,
    missingRouteKinds: missingKinds,

    snapshotCount,
    okSnapshotCount,
    routeCoverageComplete,
    allSnapshotsOk,
    totalRawTextLength,
    totalStoredTextLength,
    minRequiredTextLength,
    textVolumeSufficient,

    hasSeasonMarkerCandidate: signals.hasSeasonMarkerCandidate,
    hasFixtureOrResultCandidate: signals.hasFixtureOrResultCandidate,
    hasStandingsCandidate: signals.hasStandingsCandidate,
    hasCompletedOrInactiveCandidate: signals.hasCompletedOrInactiveCandidate,
    hasRestartDateCandidate: signals.hasRestartDateCandidate,
    textPreview: signals.preview,

    activeAssertedNow: false,
    inactiveAssertedNow: false,
    completedAssertedNow: false,
    seasonStateTruthAssertedNow: false,
    classifierExecutedNow: false,
    canonicalWriteExecutedNow: false,
    productionWriteExecutedNow: false,
    searchExecutedNow: false,
    broadSearchExecutedNow: false,
    fetchExecutedNow: false,
    evidenceAcquisitionExecutedNow: false,
    userHintUsed: false,
    hardcodedSeasonStateOverrideUsed: false,

    nextAllowedStep:
      evidenceReadinessStatus === "ready_for_no_write_anchor_extractor"
        ? "build_no_write_route_snapshot_anchor_extractor"
        : "inspect_snapshot_review_blockers_before_extractor",
    nextBlockedStep: "season_state_classifier_canonical_write_and_truth_assertions_blocked"
  };
}

function main() {
  const args = parseArgs(process.argv);
  const input = readJson(args.input);
  const snapshots = validateAcquisitionRun(input);

  const bySlug = groupBySlug(snapshots);
  const reviewRows = EXPECTED_SLUGS.map((slug) => {
    const rows = bySlug.get(slug) || [];
    return reviewCompetition(slug, rows);
  });

  const readyRows = reviewRows.filter((row) => row.snapshotReviewStatus === "ready_for_no_write_anchor_extractor");
  const blockedRows = reviewRows.filter((row) => row.snapshotReviewStatus !== "ready_for_no_write_anchor_extractor");

  const output = {
    generatedAt: new Date().toISOString(),
    date: args.date,
    job: "review-football-truth-scoped-controlled-route-acquisition-snapshots-file",
    mode: "review_scoped_controlled_route_acquisition_snapshots_no_fetch_no_search_no_classifier_no_write",
    sourceFetch: false,
    searchProviderUsed: false,
    broadSearchUsed: false,
    classifierExecuted: false,
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true,
    inputs: {
      finalExplicitScopedControlledRouteAcquisitionRun: args.input
    },
    summary: {
      snapshotReviewCompetitionCount: reviewRows.length,
      snapshotReviewReadyForAnchorExtractorCount: readyRows.length,
      snapshotReviewNeedsManualOrParserReviewCount: blockedRows.length,

      sourceSnapshotCount: snapshots.length,
      sourceSnapshotFetchedOkCount: snapshots.filter((row) => row.fetchStatus === "fetched_ok").length,
      sourceSnapshotHttp200Count: snapshots.filter((row) => row.status === 200).length,
      routeCoverageCompleteCompetitionCount: reviewRows.filter((row) => row.routeCoverageComplete).length,
      allSnapshotsOkCompetitionCount: reviewRows.filter((row) => row.allSnapshotsOk).length,
      textVolumeSufficientCompetitionCount: reviewRows.filter((row) => row.textVolumeSufficient).length,

      seasonMarkerCandidateCompetitionCount: reviewRows.filter((row) => row.hasSeasonMarkerCandidate).length,
      fixtureOrResultCandidateCompetitionCount: reviewRows.filter((row) => row.hasFixtureOrResultCandidate).length,
      standingsCandidateCompetitionCount: reviewRows.filter((row) => row.hasStandingsCandidate).length,
      completedOrInactiveCandidateCompetitionCount: reviewRows.filter((row) => row.hasCompletedOrInactiveCandidate).length,
      restartDateCandidateCompetitionCount: reviewRows.filter((row) => row.hasRestartDateCandidate).length,

      laligaSnapshotReviewCompetitionCount: reviewRows.filter((row) => row.reusableFamily === "laliga").length,
      norwayNtfSnapshotReviewCompetitionCount: reviewRows.filter((row) => row.reusableFamily === "norway_ntf").length,
      sportomediaSnapshotReviewCompetitionCount: reviewRows.filter((row) => row.reusableFamily === "sportomedia").length,

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
          ? "build_no_write_route_snapshot_anchor_extractor"
          : "inspect_snapshot_review_blockers_before_extractor"
    },
    counts: {
      byReusableFamily: countBy(reviewRows, "reusableFamily"),
      bySnapshotReviewStatus: countBy(reviewRows, "snapshotReviewStatus"),
      byNextAllowedStep: countBy(reviewRows, "nextAllowedStep")
    },
    guardrails: [
      "This job reviews already-acquired snapshots only.",
      "It does not fetch.",
      "It does not search.",
      "It does not broad search.",
      "It does not classify season state.",
      "It does not assert active/inactive/completed truth.",
      "It does not write canonical data.",
      "It does not write production data.",
      "Anchor candidates are not truth assertions.",
      "No match today must not imply inactive.",
      "Zero result must not imply absence."
    ],
    reviewRows,
    blockedRows
  };

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, stableJson(output));

  console.log(JSON.stringify({
    output: args.output,
    snapshotReviewCompetitionCount: output.summary.snapshotReviewCompetitionCount,
    snapshotReviewReadyForAnchorExtractorCount: output.summary.snapshotReviewReadyForAnchorExtractorCount,
    snapshotReviewNeedsManualOrParserReviewCount: output.summary.snapshotReviewNeedsManualOrParserReviewCount,
    sourceSnapshotCount: output.summary.sourceSnapshotCount,
    sourceSnapshotFetchedOkCount: output.summary.sourceSnapshotFetchedOkCount,
    sourceSnapshotHttp200Count: output.summary.sourceSnapshotHttp200Count,
    routeCoverageCompleteCompetitionCount: output.summary.routeCoverageCompleteCompetitionCount,
    allSnapshotsOkCompetitionCount: output.summary.allSnapshotsOkCompetitionCount,
    textVolumeSufficientCompetitionCount: output.summary.textVolumeSufficientCompetitionCount,
    seasonMarkerCandidateCompetitionCount: output.summary.seasonMarkerCandidateCompetitionCount,
    fixtureOrResultCandidateCompetitionCount: output.summary.fixtureOrResultCandidateCompetitionCount,
    standingsCandidateCompetitionCount: output.summary.standingsCandidateCompetitionCount,
    completedOrInactiveCandidateCompetitionCount: output.summary.completedOrInactiveCandidateCompetitionCount,
    restartDateCandidateCompetitionCount: output.summary.restartDateCandidateCompetitionCount,
    laligaSnapshotReviewCompetitionCount: output.summary.laligaSnapshotReviewCompetitionCount,
    norwayNtfSnapshotReviewCompetitionCount: output.summary.norwayNtfSnapshotReviewCompetitionCount,
    sportomediaSnapshotReviewCompetitionCount: output.summary.sportomediaSnapshotReviewCompetitionCount,
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
