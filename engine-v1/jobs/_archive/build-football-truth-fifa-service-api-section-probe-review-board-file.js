#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function asText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: "",
    snapshots: "",
    output: "",
    date: "",
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++i] || "";
    else if (arg === "--snapshots") args.snapshots = argv[++i] || "";
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg === "--date") args.date = argv[++i] || "";
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function markerCount(text, marker) {
  const safe = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return (String(text || "").match(new RegExp(safe, "gi")) || []).length;
}

function classifyProbe(inputRow, snapshot) {
  const status = Number(snapshot?.httpStatus || snapshot?.status || 0);
  const rawText = asText(snapshot?.rawText || snapshot?.plainText);
  const contentType = asText(snapshot?.contentType);

  const positiveShapeMarkerCounts = {
    availableStatistics: markerCount(rawText, "availableStatistics"),
    stats: markerCount(rawText, "\"stats\""),
    info: markerCount(rawText, "\"info\""),
    isPostMatch: markerCount(rawText, "isPostMatch"),
    endDate: markerCount(rawText, "endDate"),
    standings: markerCount(rawText, "standings"),
    matches: markerCount(rawText, "matches"),
    groups: markerCount(rawText, "groups")
  };

  const positiveShapeMarkerTotal = Object.values(positiveShapeMarkerCounts).reduce((sum, count) => sum + count, 0);
  const errorMarkerCount = markerCount(rawText, "Error occured") + markerCount(rawText, "Unable to retrieve competitioneSeasonSummary");

  if (status === 200 && positiveShapeMarkerTotal > 0) {
    return {
      probeReviewState: "candidate_response_needs_shape_validation",
      acceptedForTruth: false,
      rejectionReason: "",
      positiveShapeMarkerCounts,
      positiveShapeMarkerTotal,
      errorMarkerCount
    };
  }

  if (status === 404) {
    return {
      probeReviewState: "rejected_candidate_entry_id_not_found",
      acceptedForTruth: false,
      rejectionReason: "service_api_returned_404_for_candidate_entry_id",
      positiveShapeMarkerCounts,
      positiveShapeMarkerTotal,
      errorMarkerCount
    };
  }

  if (contentType.includes("html")) {
    return {
      probeReviewState: "rejected_html_or_shell_response",
      acceptedForTruth: false,
      rejectionReason: "html_response_not_service_api_truth_shape",
      positiveShapeMarkerCounts,
      positiveShapeMarkerTotal,
      errorMarkerCount
    };
  }

  return {
    probeReviewState: "rejected_no_competition_summary_shape",
    acceptedForTruth: false,
    rejectionReason: "response_does_not_contain_required_summary_or_data_shape",
    positiveShapeMarkerCounts,
    positiveShapeMarkerTotal,
    errorMarkerCount
  };
}

function buildBoard(input, snapshots, options = {}) {
  const fetchInputRows = asArray(input.fetchInputRows);
  const snapshotRows = asArray(snapshots.fetchedSourceSnapshots);

  const inputById = new Map(fetchInputRows.map(row => [asText(row.fetchInputId), row]));
  const snapshotsById = new Map(snapshotRows.map(row => [asText(row.fetchInputId), row]));

  const reviewRows = fetchInputRows.map(inputRow => {
    const fetchInputId = asText(inputRow.fetchInputId);
    const snapshot = snapshotsById.get(fetchInputId) || {};
    const review = classifyProbe(inputRow, snapshot);

    return {
      fetchInputId,
      competitionSlug: asText(inputRow.competitionSlug || inputRow.leagueSlug),
      fetchPurpose: asText(inputRow.fetchPurpose),
      candidateEntryId: asText(inputRow.candidateEntryId),
      candidateUrl: asText(inputRow.candidateUrl),
      httpStatus: Number(snapshot.httpStatus || snapshot.status || 0),
      contentType: asText(snapshot.contentType),
      rawTextLength: asText(snapshot.rawText || snapshot.plainText).length,
      plainTextLength: asText(snapshot.plainText).length,
      responseSample: asText(snapshot.rawText || snapshot.plainText).slice(0, 300),
      ...review,
      policy: {
        candidateEntryIdIsHypothesisOnly: true,
        responseDoesNotEqualTruthUntilValidated: true,
        noCanonicalPromotion: true,
        noFixtureWrites: true,
        noResultWrites: true,
        noStandingWrites: true,
        productionWrite: false,
        dryRun: true
      }
    };
  });

  const missingSnapshotRows = fetchInputRows
    .filter(row => !snapshotsById.has(asText(row.fetchInputId)))
    .map(row => ({
      fetchInputId: asText(row.fetchInputId),
      competitionSlug: asText(row.competitionSlug || row.leagueSlug),
      candidateEntryId: asText(row.candidateEntryId),
      issue: "missing_snapshot_for_fetch_input"
    }));

  const orphanSnapshotRows = snapshotRows
    .filter(row => !inputById.has(asText(row.fetchInputId)))
    .map(row => ({
      fetchInputId: asText(row.fetchInputId),
      competitionSlug: asText(row.competitionSlug || row.leagueSlug),
      issue: "snapshot_without_matching_fetch_input"
    }));

  const byCompetition = {};
  const byReviewState = {};
  const byStatus = {};
  const byPurpose = {};

  for (const row of reviewRows) {
    byCompetition[row.competitionSlug] = (byCompetition[row.competitionSlug] || 0) + 1;
    byReviewState[row.probeReviewState] = (byReviewState[row.probeReviewState] || 0) + 1;
    byStatus[String(row.httpStatus)] = (byStatus[String(row.httpStatus)] || 0) + 1;
    byPurpose[row.fetchPurpose] = (byPurpose[row.fetchPurpose] || 0) + 1;
  }

  const acceptedForTruthCount = reviewRows.filter(row => row.acceptedForTruth).length;
  const rejectedCount = reviewRows.filter(row => !row.acceptedForTruth).length;

  return {
    ok: true,
    job: "build-football-truth-fifa-service-api-section-probe-review-board-file",
    mode: "read_only_fifa_service_api_section_probe_review_board",
    generatedAt: new Date().toISOString(),
    date: asText(options.date),
    inputSummary: input.summary || {},
    snapshotSummary: snapshots.summary || {},
    summary: {
      fetchInputRowCount: fetchInputRows.length,
      snapshotRowCount: snapshotRows.length,
      reviewRowCount: reviewRows.length,
      acceptedForTruthCount,
      rejectedCount,
      rejectedCandidateEntryIdNotFoundCount: byReviewState.rejected_candidate_entry_id_not_found || 0,
      missingSnapshotCount: missingSnapshotRows.length,
      orphanSnapshotCount: orphanSnapshotRows.length,
      nextDiscoveryRequired: acceptedForTruthCount === 0,
      recommendedNextLane: acceptedForTruthCount === 0
        ? "fifa_real_entry_id_discovery_required_before_more_section_fetch"
        : "shape_validation_before_truth_extraction",
      sourceFetch: false,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      byCompetition,
      byReviewState,
      byStatus,
      byPurpose
    },
    reviewRows,
    missingSnapshotRows,
    orphanSnapshotRows,
    nextStagePlan: {
      doNotRepeat: [
        "do_not_retry_same_candidate_entry_ids",
        "do_not_promote_any_fifa_truth_from_404_probe_responses",
        "do_not_treat_route_slug_or_tournament_slug_as_contentful_entry_id"
      ],
      nextAllowedSourceOnlyStep: "build_real_fifa_entry_id_discovery_plan_from_js_bundle_search_api_or_page_component_contexts",
      fetchPolicy: "no further fetch until source-only candidate entry id discovery input is built from concrete evidence",
      truthPolicy: "only 200 JSON responses with required section/data shape and competition identity may enter truth review"
    },
    policy: {
      noSearchProvider: true,
      noFetchInThisJob: true,
      noUrlFetch: true,
      noCanonicalPromotion: true,
      noFixtureWrites: true,
      noResultWrites: true,
      noStandingWrites: true,
      noSourceReliabilityMutation: true,
      productionWrite: false,
      dryRun: true
    },
    guarantees: {
      noSearchProvider: true,
      noFetch: true,
      noUrlFetch: true,
      noCanonicalPromotion: true,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true
    }
  };
}

function selfTest() {
  const input = {
    summary: { fetchInputRowCount: 1 },
    fetchInputRows: [
      {
        fetchInputId: "fifa-service-section:001",
        competitionSlug: "fifa.world_cup",
        fetchPurpose: "competition_season_summary_section_probe",
        candidateEntryId: "worldcup",
        candidateUrl: "https://cxm-api.fifa.com/fifaplusweb/api/sections/competitionSeasonSummary/worldcup?locale=en"
      }
    ]
  };

  const snapshots = {
    summary: { fetchedSnapshotCount: 1 },
    fetchedSourceSnapshots: [
      {
        fetchInputId: "fifa-service-section:001",
        competitionSlug: "fifa.world_cup",
        fetchPurpose: "competition_season_summary_section_probe",
        httpStatus: 404,
        status: 404,
        contentType: "application/json; charset=utf-8",
        rawText: "{\"message\":\"Error occured: Unable to retrieve competitioneSeasonSummary with entryId: worldcup and localse: en\"}",
        plainText: "{\"message\":\"Error occured\"}"
      }
    ]
  };

  const report = buildBoard(input, snapshots, { date: "2026-06-12" });

  if (report.summary.reviewRowCount !== 1) throw new Error("expected one review row");
  if (report.summary.acceptedForTruthCount !== 0) throw new Error("404 must not be accepted");
  if (report.summary.rejectedCandidateEntryIdNotFoundCount !== 1) throw new Error("expected candidate id rejection");
  if (!report.summary.nextDiscoveryRequired) throw new Error("next discovery should be required");

  return report;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "build-football-truth-fifa-service-api-section-probe-review-board-file",
      summary: report.summary,
      reviewRows: report.reviewRows,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  if (!args.input) throw new Error("--input is required");
  if (!args.snapshots) throw new Error("--snapshots is required");
  if (!args.output) throw new Error("--output is required");

  const report = buildBoard(readJson(args.input), readJson(args.snapshots), { date: args.date });
  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: report.summary,
    reviewRows: report.reviewRows.slice(0, 20),
    guarantees: report.guarantees
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    job: "build-football-truth-fifa-service-api-section-probe-review-board-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
}
