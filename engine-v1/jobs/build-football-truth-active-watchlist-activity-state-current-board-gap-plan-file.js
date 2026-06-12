import fs from "fs";
import path from "path";

function asText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readJson(filePath) {
  if (!filePath) throw new Error("missing input file path");
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  if (!filePath) throw new Error("missing --output");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    plan: "",
    currentBoard: "",
    canonicalFixturesRoot: "data/canonical-fixtures",
    output: "",
    date: "",
    selfTest: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = asText(argv[i]);

    if (arg === "--self-test") {
      args.selfTest = true;
      continue;
    }

    if (arg === "--plan") {
      args.plan = asText(argv[++i]);
      continue;
    }

    if (arg === "--current-board") {
      args.currentBoard = asText(argv[++i]);
      continue;
    }

    if (arg === "--canonical-fixtures-root") {
      args.canonicalFixturesRoot = asText(argv[++i]);
      continue;
    }

    if (arg === "--output") {
      args.output = asText(argv[++i]);
      continue;
    }

    if (arg === "--date") {
      args.date = asText(argv[++i]);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function candidateSlug(row) {
  return asText(row?.competitionSlug || row?.leagueSlug || row?.slug || row?.competition || row?.id);
}

function boardCollectionRows(board, collectionName) {
  return asArray(board?.[collectionName]).map((row) => ({
    collectionName,
    row,
    slug: candidateSlug(row)
  })).filter((entry) => entry.slug);
}

function buildBoardIndex(board) {
  const collections = [
    "competitionStateBoard",
    "promotionReadinessBoard",
    "missingDataBoard",
    "providerContractBoard",
    "blockedProviderBoard",
    "nextBatchActionPlan",
    "localCoverageEvidence"
  ];

  const index = new Map();

  for (const collectionName of collections) {
    for (const entry of boardCollectionRows(board, collectionName)) {
      if (!index.has(entry.slug)) index.set(entry.slug, []);
      index.get(entry.slug).push(entry);
    }
  }

  return index;
}

function findCompetitionState(entries) {
  return entries.find((entry) => entry.collectionName === "competitionStateBoard")?.row || null;
}

function findPromotionReadiness(entries) {
  return entries.find((entry) => entry.collectionName === "promotionReadinessBoard")?.row || null;
}

function countCanonicalFixtureFiles(root, slug) {
  if (!root || !fs.existsSync(root)) {
    return {
      count: 0,
      firstFile: "",
      lastFile: ""
    };
  }

  const hits = [];

  function walk(dir) {
    for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, item.name);
      if (item.isDirectory()) {
        walk(fullPath);
      } else if (item.isFile() && item.name === `${slug}.json`) {
        hits.push(fullPath);
      }
    }
  }

  walk(root);
  hits.sort();

  return {
    count: hits.length,
    firstFile: hits[0] || "",
    lastFile: hits[hits.length - 1] || ""
  };
}

function buildActivityGapRow(candidate, boardIndex, canonicalFixturesRoot) {
  const slug = candidateSlug(candidate);
  const entries = boardIndex.get(slug) || [];
  const competitionState = findCompetitionState(entries);
  const promotionReadiness = findPromotionReadiness(entries);
  const fixtureFiles = countCanonicalFixtureFiles(canonicalFixturesRoot, slug);

  const currentSeasonState = asText(competitionState?.seasonState);
  const proposedSeasonState = asText(candidate.proposedSeasonState);
  const proposedFixtureTruthState = asText(candidate.proposedFixtureTruthState);
  const proposedDailyFixtureGateState = asText(candidate.proposedDailyFixtureGateState);

  let gapState = "needs_review";
  let recommendedNextAction = "manual_review_before_any_writer_plan";
  let canonicalActivityStateWriteNeeded = false;
  let fixtureMaterializationNeeded = false;

  if (currentSeasonState === "active" && proposedSeasonState === "active_current_season") {
    gapState = "current_board_already_active";
    recommendedNextAction = fixtureFiles.count > 0
      ? "no_activity_state_write_needed_verify_daily_gate_only"
      : "current_board_active_but_missing_canonical_fixture_files_review_fixture_materialization";
    canonicalActivityStateWriteNeeded = false;
    fixtureMaterializationNeeded = fixtureFiles.count === 0;
  } else if (!currentSeasonState && proposedSeasonState === "active_current_season") {
    gapState = "missing_current_board_activity_state";
    recommendedNextAction = "build_activity_state_writer_dry_run_for_explicit_approval";
    canonicalActivityStateWriteNeeded = true;
    fixtureMaterializationNeeded = fixtureFiles.count === 0;
  } else if (currentSeasonState === "completed_or_results_only") {
    gapState = "current_board_results_only_or_completed";
    recommendedNextAction = "do_not_enable_daily_fixture_acquisition_without_fixture_route_repair";
    canonicalActivityStateWriteNeeded = false;
    fixtureMaterializationNeeded = false;
  }

  return {
    competitionSlug: slug,
    promotionType: asText(candidate.promotionType),
    sourceFamily: asText(candidate.sourceFamily),
    proposedSeasonState,
    proposedFixtureTruthState,
    proposedDailyFixtureGateState,
    currentBoardMatched: entries.length > 0,
    currentBoardCollectionCount: entries.length,
    currentSeasonState,
    currentActivityState: asText(competitionState?.activityState),
    currentFixtureTruthState: asText(competitionState?.fixtureTruthState),
    promotionReadinessState: asText(promotionReadiness?.promotionReadiness || promotionReadiness?.readinessState),
    canonicalFixtureFileCount: fixtureFiles.count,
    firstCanonicalFixtureFile: fixtureFiles.firstFile,
    lastCanonicalFixtureFile: fixtureFiles.lastFile,
    evidence: candidate.evidence || {},
    gapState,
    recommendedNextAction,
    canonicalActivityStateWriteNeeded,
    fixtureMaterializationNeeded,
    writeCanonicalNow: false,
    mayPromoteCanonical: false,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function buildRepairGapRow(row) {
  return {
    competitionSlug: candidateSlug(row),
    sourceFamily: asText(row.sourceFamily),
    repairBucket: asText(row.repairBucket),
    recommendedNextAction: asText(row.recommendedNextAction),
    blockedReason: asText(row.blockedReason),
    gapState: "repair_required_before_activity_state_or_fixture_gate",
    writeCanonicalNow: false,
    mayPromoteCanonical: false,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function buildReport({ plan, currentBoard, canonicalFixturesRoot, date }) {
  const boardIndex = buildBoardIndex(currentBoard);

  const activityGapRows = asArray(plan.activityPromotionCandidates)
    .map((row) => buildActivityGapRow(row, boardIndex, canonicalFixturesRoot));

  const partialGapRows = asArray(plan.partialPromotionCandidates)
    .map((row) => buildActivityGapRow(row, boardIndex, canonicalFixturesRoot));

  const repairGapRows = asArray(plan.blockedRepairRows).map(buildRepairGapRow);

  const allGapRows = [...activityGapRows, ...partialGapRows, ...repairGapRows];

  const byGapState = {};
  for (const row of allGapRows) {
    byGapState[row.gapState] = (byGapState[row.gapState] || 0) + 1;
  }

  return {
    ok: true,
    job: "build-football-truth-active-watchlist-activity-state-current-board-gap-plan-file",
    mode: "read_only_current_board_gap_plan",
    generatedAt: new Date().toISOString(),
    date,
    sourcePlanSummary: plan.summary || {},
    currentBoardSummary: currentBoard.summary || {},
    summary: {
      activityGapRowCount: activityGapRows.length,
      partialGapRowCount: partialGapRows.length,
      repairGapRowCount: repairGapRows.length,
      totalGapRowCount: allGapRows.length,
      canonicalActivityStateWriteNeededCount: allGapRows.filter((row) => row.canonicalActivityStateWriteNeeded).length,
      fixtureMaterializationNeededCount: allGapRows.filter((row) => row.fixtureMaterializationNeeded).length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      byGapState
    },
    activityGapRows,
    partialGapRows,
    repairGapRows,
    allGapRows,
    writerPolicy: {
      writeCanonical: false,
      inspectOnly: true,
      explicitApprovalRequiredBeforeWrite: true,
      noFixtureWrites: true,
      noResultWrites: true,
      noStandingWrites: true,
      noSourceReliabilityMutation: true
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
  const report = buildReport({
    date: "2026-06-12",
    canonicalFixturesRoot: "",
    plan: {
      activityPromotionCandidates: [
        { competitionSlug: "abc.1", proposedSeasonState: "active_current_season", proposedFixtureTruthState: "fixtures_available", proposedDailyFixtureGateState: "eligible_after_truth_review", evidence: { scheduledRowCount: 3 } },
        { competitionSlug: "abc.2", proposedSeasonState: "active_current_season", proposedFixtureTruthState: "fixtures_available", proposedDailyFixtureGateState: "eligible_after_truth_review", evidence: { scheduledRowCount: 2 } }
      ],
      partialPromotionCandidates: [
        { competitionSlug: "abc.3", proposedSeasonState: "active_or_recent_current_season_results_available", proposedFixtureTruthState: "fixtures_blocked_by_official_endpoint", proposedDailyFixtureGateState: "blocked_until_fixture_route_recovered" }
      ],
      blockedRepairRows: [
        { competitionSlug: "abc.4", repairBucket: "repair", recommendedNextAction: "repair" }
      ]
    },
    currentBoard: {
      competitionStateBoard: [
        { competitionSlug: "abc.1", seasonState: "active" },
        { competitionSlug: "abc.3", seasonState: "completed_or_results_only" }
      ]
    }
  });

  if (report.summary.activityGapRowCount !== 2) throw new Error("expected two activity gap rows");
  if (report.summary.partialGapRowCount !== 1) throw new Error("expected one partial gap row");
  if (report.summary.repairGapRowCount !== 1) throw new Error("expected one repair gap row");
  if (report.summary.canonicalWrites !== 0) throw new Error("must not write canonical");
  return report;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "build-football-truth-active-watchlist-activity-state-current-board-gap-plan-file",
      summary: report.summary,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  if (!args.plan) throw new Error("--plan is required");
  if (!args.currentBoard) throw new Error("--current-board is required");
  if (!args.output) throw new Error("--output is required");

  const report = buildReport({
    plan: readJson(args.plan),
    currentBoard: readJson(args.currentBoard),
    canonicalFixturesRoot: args.canonicalFixturesRoot,
    date: args.date
  });

  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: report.summary,
    writerPolicy: report.writerPolicy,
    guarantees: report.guarantees
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    job: "build-football-truth-active-watchlist-activity-state-current-board-gap-plan-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
}