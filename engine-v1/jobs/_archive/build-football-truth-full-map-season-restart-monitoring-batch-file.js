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
    output: "",
    date: "",
    batchId: "001",
    activeLimit: 40,
    restartLimit: 40,
    cupLimit: 40,
    unknownLimit: 80,
    repairLimit: 20,
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--self-test") args.selfTest = true;
    else if (arg === "--input") args.input = argv[++i] || "";
    else if (arg === "--output") args.output = argv[++i] || "";
    else if (arg === "--date") args.date = argv[++i] || "";
    else if (arg === "--batch-id") args.batchId = argv[++i] || "001";
    else if (arg === "--active-limit") args.activeLimit = Number(argv[++i] || 40);
    else if (arg === "--restart-limit") args.restartLimit = Number(argv[++i] || 40);
    else if (arg === "--cup-limit") args.cupLimit = Number(argv[++i] || 40);
    else if (arg === "--unknown-limit") args.unknownLimit = Number(argv[++i] || 80);
    else if (arg === "--repair-limit") args.repairLimit = Number(argv[++i] || 20);
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function safeLimit(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function slugOf(row) {
  return asText(row?.competitionSlug || row?.leagueSlug || row?.slug);
}

function priorityScore(row) {
  const type = asText(row?.competitionType);
  const region = asText(row?.region).toLowerCase();
  const slug = slugOf(row);

  let score = 0;

  if (type === "league") score += 1000;
  if (type === "cup") score += 600;
  if (type === "continental_or_international") score += 900;

  if (region === "europe") score += 300;
  if (slug.startsWith("fifa.")) score += 1000;
  if (/^(eng|esp|ita|ger|fra|ned|por|bel|aut|den|sui|gre|tur|nor|swe|fin|irl|isl)\./.test(slug)) score += 200;

  return score;
}

function sortRows(rows) {
  return [...rows].sort((a, b) => {
    const scoreDiff = priorityScore(b) - priorityScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    return slugOf(a).localeCompare(slugOf(b));
  });
}

function selectBucket(rows, bucket, limit) {
  return sortRows(rows.filter((row) => asText(row.monitoringBucket) === bucket)).slice(0, safeLimit(limit, 0));
}

function withBatchMeta(row, lane, batchId, index) {
  return {
    batchRowId: `${batchId}:${lane}:${String(index + 1).padStart(4, "0")}`,
    lane,
    competitionSlug: slugOf(row),
    leagueSlug: asText(row.leagueSlug || row.competitionSlug),
    competitionName: asText(row.competitionName),
    competitionType: asText(row.competitionType),
    country: asText(row.country),
    region: asText(row.region),
    monitoringBucket: asText(row.monitoringBucket),
    currentSeasonState: asText(row.currentSeasonState),
    canonicalActivityState: asText(row.canonicalActivityState),
    fixtureTruthState: asText(row.fixtureTruthState),
    dailyFixtureGateState: asText(row.dailyFixtureGateState),
    nextRequiredAction: asText(row.nextRequiredAction),
    dailyFixtureEligibility: asText(row.dailyFixtureEligibility),
    requiredEvidence: row.requiredEvidence || {},
    writePolicy: row.writePolicy || {},
    selectedFor: lane,
    sourcePolicy: {
      officialEvidenceRequired: true,
      secondaryReferenceComparisonOnly: true,
      zeroSearchResultDoesNotImplyAbsence: true,
      noCanonicalWriteFromThisBatch: true
    },
    canonicalWrites: 0,
    productionWrite: false,
    dryRun: true
  };
}

function buildBatch(input, options = {}) {
  const monitoringRows = asArray(input.monitoringRows);
  const fifaOfficialLaneRows = asArray(input.fifaOfficialLaneRows);
  const batchId = asText(options.batchId) || "001";

  const activeRows = selectBucket(
    monitoringRows,
    "known_active_needs_canonical_gate_or_fixture_materialization_review",
    options.activeLimit
  );

  const restartRows = selectBucket(
    monitoringRows,
    "non_active_restart_discovery_required",
    options.restartLimit
  );

  const cupRows = selectBucket(
    monitoringRows,
    "cup_winner_or_next_start_discovery_required",
    options.cupLimit
  );

  const unknownRows = selectBucket(
    monitoringRows,
    "full_map_activity_and_restart_discovery_required",
    options.unknownLimit
  );

  const repairRows = selectBucket(
    monitoringRows,
    "repair_required_before_activity_or_restart_truth",
    options.repairLimit
  );

  const fifaRows = sortRows(fifaOfficialLaneRows);

  const batchRows = [
    ...activeRows.map((row, index) => withBatchMeta(row, "active_gate_review", batchId, index)),
    ...restartRows.map((row, index) => withBatchMeta(row, "restart_discovery", batchId, index)),
    ...cupRows.map((row, index) => withBatchMeta(row, "cup_winner_or_next_start", batchId, index)),
    ...unknownRows.map((row, index) => withBatchMeta(row, "unknown_activity_or_restart", batchId, index)),
    ...repairRows.map((row, index) => withBatchMeta(row, "repair", batchId, index)),
    ...fifaRows.map((row, index) => withBatchMeta(row, "fifa_official_lane", batchId, index))
  ];

  const byLane = {};
  for (const row of batchRows) {
    byLane[row.lane] = (byLane[row.lane] || 0) + 1;
  }

  return {
    ok: true,
    job: "build-football-truth-full-map-season-restart-monitoring-batch-file",
    mode: "read_only_full_map_season_restart_monitoring_batch",
    generatedAt: new Date().toISOString(),
    date: asText(options.date),
    batchId,
    sourceSummary: input.summary || {},
    summary: {
      sourceMonitoringRowCount: monitoringRows.length,
      sourceFifaOfficialLaneRowCount: fifaOfficialLaneRows.length,
      selectedBatchRowCount: batchRows.length,
      activeGateReviewRowCount: byLane.active_gate_review || 0,
      restartDiscoveryRowCount: byLane.restart_discovery || 0,
      cupWinnerOrNextStartRowCount: byLane.cup_winner_or_next_start || 0,
      unknownActivityOrRestartRowCount: byLane.unknown_activity_or_restart || 0,
      repairRowCount: byLane.repair || 0,
      fifaOfficialLaneRowCount: byLane.fifa_official_lane || 0,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      byLane
    },
    batchRows,
    nextStagePlan: {
      active_gate_review: "use existing provider lanes where available; otherwise official-route recovery",
      restart_discovery: "build official restart/next-season-date discovery targets",
      cup_winner_or_next_start: "split into winner-final truth and next-cup-start discovery",
      unknown_activity_or_restart: "official activity/restart route discovery, not direct fixture acquisition",
      repair: "provider-specific route repair before truth review",
      fifa_official_lane: "build FIFA official route recovery plan read-only"
    },
    policy: {
      noSearch: true,
      noFetch: true,
      noUrlFetch: true,
      noCanonicalPromotion: true,
      noCanonicalWritesFromThisBatch: true,
      dailyFixtureAcquisitionRequiresCanonicalTruthGate: true,
      restartDiscoveryRequiredForNonActive: true,
      fifaRequiresOfficialLane: true,
      secondaryReferenceCannotPromoteCanonical: true
    },
    guarantees: {
      noSearch: true,
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
  const report = buildBatch({
    summary: {},
    monitoringRows: [
      { competitionSlug: "fin.1", competitionType: "league", monitoringBucket: "known_active_needs_canonical_gate_or_fixture_materialization_review" },
      { competitionSlug: "ger.1", competitionType: "league", monitoringBucket: "non_active_restart_discovery_required" },
      { competitionSlug: "bel.cup", competitionType: "cup", monitoringBucket: "cup_winner_or_next_start_discovery_required" },
      { competitionSlug: "abc.1", competitionType: "league", monitoringBucket: "full_map_activity_and_restart_discovery_required" },
      { competitionSlug: "sco.1", competitionType: "league", monitoringBucket: "repair_required_before_activity_or_restart_truth" }
    ],
    fifaOfficialLaneRows: [
      { competitionSlug: "fifa.world_cup", monitoringBucket: "fifa_custom_lane_required_missing_or_unmapped" }
    ]
  }, {
    batchId: "self",
    activeLimit: 40,
    restartLimit: 40,
    cupLimit: 40,
    unknownLimit: 80,
    repairLimit: 20
  });

  if (report.summary.selectedBatchRowCount !== 6) throw new Error("expected 6 selected rows");
  if (report.summary.fifaOfficialLaneRowCount !== 1) throw new Error("expected 1 fifa row");
  if (report.guarantees.canonicalWrites !== 0) throw new Error("must not write canonical");

  return report;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "build-football-truth-full-map-season-restart-monitoring-batch-file",
      summary: report.summary,
      nextStagePlan: report.nextStagePlan,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  if (!args.input) throw new Error("--input is required");
  if (!args.output) throw new Error("--output is required");

  const report = buildBatch(readJson(args.input), {
    date: args.date,
    batchId: args.batchId,
    activeLimit: args.activeLimit,
    restartLimit: args.restartLimit,
    cupLimit: args.cupLimit,
    unknownLimit: args.unknownLimit,
    repairLimit: args.repairLimit
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: report.summary,
    guarantees: report.guarantees
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    job: "build-football-truth-full-map-season-restart-monitoring-batch-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
}