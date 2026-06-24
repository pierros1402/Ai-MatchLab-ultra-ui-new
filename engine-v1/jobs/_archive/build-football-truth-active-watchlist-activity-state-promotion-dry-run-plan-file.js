import fs from "fs";
import path from "path";

function asText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function readJson(filePath) {
  if (!filePath) throw new Error("missing --input");
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  if (!filePath) throw new Error("missing --output");
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    input: "",
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

    if (arg === "--input") {
      args.input = asText(argv[++i]);
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

function buildPromotionCandidate(row) {
  const competitionSlug = asText(row.competitionSlug || row.leagueSlug);

  return {
    competitionSlug,
    leagueSlug: asText(row.leagueSlug || competitionSlug),
    sourceFamily: asText(row.sourceFamily),
    promotionType: "activity_state_candidate",
    proposedSeasonState: asText(row.proposedSeasonState),
    proposedFixtureTruthState: asText(row.proposedFixtureTruthState),
    proposedResultTruthState: asText(row.proposedResultTruthState),
    proposedDailyFixtureGateState: asText(row.proposedDailyFixtureGateState),
    confidence: asText(row.confidence),
    evidence: {
      inputRowCount: Number(row.inputRowCount || 0),
      finishedRowCount: Number(row.finishedRowCount || 0),
      scheduledRowCount: Number(row.scheduledRowCount || 0),
      firstDate: asText(row.firstDate),
      lastDate: asText(row.lastDate),
      firstScheduledDate: asText(row.firstScheduledDate),
      lastScheduledDate: asText(row.lastScheduledDate),
      teamCount: Number(row.teamCount || 0),
      sourceActivityValidationState: asText(row.sourceActivityValidationState),
      sourceFixtureTruthStateCandidate: asText(row.sourceFixtureTruthStateCandidate),
      sourceResultTruthStateCandidate: asText(row.sourceResultTruthStateCandidate)
    },
    reviewRequired: true,
    explicitApprovalRequiredBeforeWrite: true,
    dryRunPromotionOnly: true,
    mayPromoteCanonical: false,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function buildPartialCandidate(row) {
  const competitionSlug = asText(row.competitionSlug || row.leagueSlug);

  return {
    competitionSlug,
    leagueSlug: asText(row.leagueSlug || competitionSlug),
    sourceFamily: asText(row.sourceFamily),
    promotionType: "partial_activity_state_candidate",
    proposedSeasonState: asText(row.proposedSeasonState),
    proposedFixtureTruthState: asText(row.proposedFixtureTruthState),
    proposedResultTruthState: asText(row.proposedResultTruthState),
    proposedDailyFixtureGateState: asText(row.proposedDailyFixtureGateState),
    confidence: asText(row.confidence),
    blockedReason: asText(row.blockedReason),
    evidence: {
      inputRowCount: Number(row.inputRowCount || 0),
      finishedRowCount: Number(row.finishedRowCount || 0),
      scheduledRowCount: Number(row.scheduledRowCount || 0),
      firstDate: asText(row.firstDate),
      lastDate: asText(row.lastDate),
      teamCount: Number(row.teamCount || 0),
      sourceActivityValidationState: asText(row.sourceActivityValidationState)
    },
    fixtureAcquisitionAllowed: false,
    reasonFixtureAcquisitionBlocked: "partial_results_only_or_fixture_endpoint_blocked",
    reviewRequired: true,
    explicitApprovalRequiredBeforeWrite: true,
    dryRunPromotionOnly: true,
    mayPromoteCanonical: false,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function buildRepairRow(row) {
  return {
    competitionSlug: asText(row.competitionSlug || row.leagueSlug),
    leagueSlug: asText(row.leagueSlug || row.competitionSlug),
    sourceFamily: asText(row.sourceFamily),
    repairBucket: asText(row.repairBucket),
    recommendedNextAction: asText(row.recommendedNextAction),
    blockedReason: asText(row.blockedReason),
    promotionType: "blocked_repair_required",
    dryRunPromotionOnly: true,
    mayPromoteCanonical: false,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function buildReport(input, date) {
  const activityReadyRows = asArray(input.activityTruthReadyRows);
  const partialRows = asArray(input.partialTruthReadyRows);
  const repairRows = asArray(input.blockedOrRepairRows);

  const activityPromotionCandidates = activityReadyRows.map(buildPromotionCandidate);
  const partialPromotionCandidates = partialRows.map(buildPartialCandidate);
  const blockedRepairRows = repairRows.map(buildRepairRow);

  const allPromotionCandidates = [
    ...activityPromotionCandidates,
    ...partialPromotionCandidates
  ];

  const byPromotionType = {};
  for (const row of [...allPromotionCandidates, ...blockedRepairRows]) {
    byPromotionType[row.promotionType] = (byPromotionType[row.promotionType] || 0) + 1;
  }

  const byDailyFixtureGateState = {};
  for (const row of allPromotionCandidates) {
    const state = asText(row.proposedDailyFixtureGateState);
    byDailyFixtureGateState[state] = (byDailyFixtureGateState[state] || 0) + 1;
  }

  return {
    ok: true,
    job: "build-football-truth-active-watchlist-activity-state-promotion-dry-run-plan-file",
    mode: "read_only_activity_state_promotion_dry_run_plan",
    generatedAt: new Date().toISOString(),
    date,
    sourceSummary: input.summary || {},
    summary: {
      sourceTruthReviewRowCount: Number(input.summary?.truthReviewRowCount || 0),
      activityPromotionCandidateCount: activityPromotionCandidates.length,
      partialPromotionCandidateCount: partialPromotionCandidates.length,
      totalPromotionCandidateCount: allPromotionCandidates.length,
      blockedRepairRowCount: blockedRepairRows.length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      byPromotionType,
      byDailyFixtureGateState
    },
    activityPromotionCandidates,
    partialPromotionCandidates,
    allPromotionCandidates,
    blockedRepairRows,
    writerContract: {
      writeCanonical: false,
      requiresExplicitApproval: true,
      allowedWriteTargetsIfApprovedLater: [
        "competition season/activity state",
        "fixture truth gate state",
        "daily fixture acquisition eligibility flag"
      ],
      disallowedWriteTargets: [
        "fixtures",
        "results",
        "standings",
        "source reliability mutation",
        "production write"
      ]
    },
    policy: {
      dryRunOnly: true,
      noCanonicalWritesFromThisPlan: true,
      explicitApprovalRequiredBeforeCanonicalWrite: true,
      dailyFixtureAcquisitionRequiresApprovedTruthGate: true,
      partialRowsDoNotEnableFixtureAcquisition: true,
      noSearch: true,
      noFetch: true,
      noCanonicalPromotion: true
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
    summary: { truthReviewRowCount: 2 },
    activityTruthReadyRows: [
      {
        competitionSlug: "abc.1",
        sourceFamily: "test",
        proposedSeasonState: "active_current_season",
        proposedFixtureTruthState: "fixtures_available",
        proposedDailyFixtureGateState: "eligible_after_truth_review",
        scheduledRowCount: 3,
        firstScheduledDate: "2026-06-12"
      }
    ],
    partialTruthReadyRows: [
      {
        competitionSlug: "abc.2",
        sourceFamily: "test",
        proposedSeasonState: "active_or_recent_current_season_results_available",
        proposedFixtureTruthState: "fixtures_blocked_by_official_endpoint",
        proposedDailyFixtureGateState: "blocked_until_fixture_route_recovered",
        finishedRowCount: 10,
        blockedReason: "blocked"
      }
    ],
    blockedOrRepairRows: [
      {
        competitionSlug: "abc.3",
        sourceFamily: "test",
        repairBucket: "official_route_or_adapter_repair_needed",
        recommendedNextAction: "repair",
        blockedReason: "blocked"
      }
    ]
  }, "2026-06-12");

  if (report.summary.activityPromotionCandidateCount !== 1) throw new Error("expected one activity candidate");
  if (report.summary.partialPromotionCandidateCount !== 1) throw new Error("expected one partial candidate");
  if (report.summary.blockedRepairRowCount !== 1) throw new Error("expected one repair row");
  if (report.summary.canonicalWrites !== 0) throw new Error("must not write canonical");
  if (report.writerContract.writeCanonical !== false) throw new Error("writer contract must be dry-run only");
  return report;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "build-football-truth-active-watchlist-activity-state-promotion-dry-run-plan-file",
      summary: report.summary,
      writerContract: report.writerContract,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  if (!args.input) throw new Error("--input is required");
  if (!args.output) throw new Error("--output is required");

  const report = buildReport(readJson(args.input), args.date);
  writeJson(args.output, report);

  console.log(JSON.stringify({
    ok: true,
    output: args.output,
    summary: report.summary,
    writerContract: report.writerContract,
    guarantees: report.guarantees
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    job: "build-football-truth-active-watchlist-activity-state-promotion-dry-run-plan-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
}