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

function truthReviewDecision(row) {
  const competitionSlug = asText(row.competitionSlug || row.leagueSlug);
  const activityState = asText(row.activityValidationState);
  const scheduledRowCount = Number(row.scheduledRowCount || 0);
  const finishedRowCount = Number(row.finishedRowCount || 0);
  const firstScheduledDate = asText(row.firstScheduledDate);
  const sourceFamily = asText(row.sourceFamily);

  if (
    activityState === "provider_lane_active_current_season_with_scheduled_fixtures" &&
    scheduledRowCount > 0 &&
    firstScheduledDate
  ) {
    return {
      reviewBucket: "activity_truth_review_ready",
      proposedSeasonState: "active_current_season",
      proposedFixtureTruthState: "fixtures_available",
      proposedResultTruthState: finishedRowCount > 0 ? "results_available" : "results_not_checked_or_not_required",
      proposedDailyFixtureGateState: "eligible_after_truth_review",
      confidence: "provider_lane_structured_high",
      reason: "Provider-specific normalized lane has scheduled fixtures with official-source lineage."
    };
  }

  if (
    activityState === "provider_lane_results_available_fixture_endpoint_blocked" &&
    finishedRowCount > 0
  ) {
    return {
      reviewBucket: "partial_truth_review_ready_fixture_endpoint_blocked",
      proposedSeasonState: "active_or_recent_current_season_results_available",
      proposedFixtureTruthState: "fixtures_blocked_by_official_endpoint",
      proposedResultTruthState: "results_available",
      proposedDailyFixtureGateState: "blocked_until_fixture_route_recovered",
      confidence: "provider_lane_partial_high",
      reason: "Results are normalized from provider lane, but fixture endpoint is explicitly blocked or unsafe."
    };
  }

  return {
    reviewBucket: "not_ready_for_truth_review",
    proposedSeasonState: "unknown_needs_repair",
    proposedFixtureTruthState: "fixtures_not_proven",
    proposedResultTruthState: "results_not_proven",
    proposedDailyFixtureGateState: "blocked",
    confidence: "none",
    reason: "Provider-lane evidence is insufficient for activity truth review."
  };
}

function buildTruthReviewRow(row) {
  const decision = truthReviewDecision(row);

  return {
    competitionSlug: asText(row.competitionSlug || row.leagueSlug),
    leagueSlug: asText(row.leagueSlug || row.competitionSlug),
    sourceFamily: asText(row.sourceFamily),
    inputRowCount: Number(row.inputRowCount || 0),
    finishedRowCount: Number(row.finishedRowCount || 0),
    scheduledRowCount: Number(row.scheduledRowCount || 0),
    firstDate: asText(row.firstDate),
    lastDate: asText(row.lastDate),
    firstScheduledDate: asText(row.firstScheduledDate),
    lastScheduledDate: asText(row.lastScheduledDate),
    teamCount: Number(row.teamCount || 0),
    sourceActivityValidationState: asText(row.activityValidationState),
    sourceFixtureTruthStateCandidate: asText(row.fixtureTruthStateCandidate),
    sourceResultTruthStateCandidate: asText(row.resultTruthStateCandidate),
    blockedReason: asText(row.blockedReason),
    ...decision,
    allowedNextStepType: "read_only_truth_review_or_dry_run_promotion_plan",
    blockedNextSteps: [
      "canonical_write_without_explicit_approval",
      "daily_fixture_acquisition_without_truth_gate",
      "generic_search_retry"
    ],
    mayPromoteCanonical: false,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function buildBlockedRow(row) {
  return {
    competitionSlug: asText(row.competitionSlug || row.leagueSlug),
    leagueSlug: asText(row.leagueSlug || row.competitionSlug),
    sourceFamily: asText(row.sourceFamily),
    repairBucket: asText(row.activityValidationState),
    blockedReason: asText(row.blockedReason),
    recommendedNextAction:
      asText(row.activityValidationState) === "provider_specific_route_discovery_needed"
        ? "recover_provider_specific_route_id_read_only"
        : asText(row.activityValidationState) === "official_route_or_adapter_repair_needed"
          ? "build_official_route_adapter_repair_plan_read_only"
          : "recover_official_host_and_route_read_only",
    mayPromoteCanonical: false,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function buildReport(input, date) {
  const validationRows = asArray(input.validationRows);
  const blockedInputRows = asArray(input.blockedOrNeedsRepairRows);

  const truthReviewRows = validationRows.map(buildTruthReviewRow);
  const activityTruthReadyRows = truthReviewRows.filter((row) => row.reviewBucket === "activity_truth_review_ready");
  const partialTruthReadyRows = truthReviewRows.filter((row) => row.reviewBucket === "partial_truth_review_ready_fixture_endpoint_blocked");
  const notReadyRows = truthReviewRows.filter((row) => row.reviewBucket === "not_ready_for_truth_review");
  const blockedOrRepairRows = blockedInputRows.map(buildBlockedRow);

  const byReviewBucket = {};
  for (const row of truthReviewRows) {
    byReviewBucket[row.reviewBucket] = (byReviewBucket[row.reviewBucket] || 0) + 1;
  }

  const byDailyFixtureGateState = {};
  for (const row of truthReviewRows) {
    byDailyFixtureGateState[row.proposedDailyFixtureGateState] = (byDailyFixtureGateState[row.proposedDailyFixtureGateState] || 0) + 1;
  }

  return {
    ok: true,
    job: "build-football-truth-active-watchlist-activity-truth-review-plan-file",
    mode: "read_only_activity_truth_review_plan",
    generatedAt: new Date().toISOString(),
    date,
    sourceSummary: input.summary || {},
    summary: {
      inputValidationRowCount: validationRows.length,
      truthReviewRowCount: truthReviewRows.length,
      activityTruthReadyCount: activityTruthReadyRows.length,
      partialTruthReadyCount: partialTruthReadyRows.length,
      notReadyCount: notReadyRows.length,
      blockedOrRepairCount: blockedOrRepairRows.length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      byReviewBucket,
      byDailyFixtureGateState
    },
    truthReviewRows,
    activityTruthReadyRows,
    partialTruthReadyRows,
    notReadyRows,
    blockedOrRepairRows,
    policy: {
      truthReviewPlanDoesNotWriteCanonical: true,
      explicitApprovalRequiredBeforeCanonicalWrite: true,
      dailyFixtureAcquisitionRequiresTruthGate: true,
      partialResultsOnlyDoesNotEnableFixtureAcquisition: true,
      providerLaneEvidenceDoesNotEqualCanonicalTruthUntilApproved: true,
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
    summary: {},
    validationRows: [
      {
        competitionSlug: "abc.1",
        sourceFamily: "test",
        inputRowCount: 10,
        finishedRowCount: 2,
        scheduledRowCount: 3,
        firstScheduledDate: "2026-06-12",
        activityValidationState: "provider_lane_active_current_season_with_scheduled_fixtures"
      },
      {
        competitionSlug: "abc.2",
        sourceFamily: "test",
        inputRowCount: 10,
        finishedRowCount: 10,
        scheduledRowCount: 0,
        activityValidationState: "provider_lane_results_available_fixture_endpoint_blocked"
      }
    ],
    blockedOrNeedsRepairRows: [
      {
        competitionSlug: "abc.3",
        sourceFamily: "test",
        activityValidationState: "official_route_or_adapter_repair_needed",
        blockedReason: "blocked"
      }
    ]
  }, "2026-06-12");

  if (report.summary.activityTruthReadyCount !== 1) throw new Error("expected one activity truth ready row");
  if (report.summary.partialTruthReadyCount !== 1) throw new Error("expected one partial truth ready row");
  if (report.summary.blockedOrRepairCount !== 1) throw new Error("expected one blocked repair row");
  if (report.summary.canonicalWrites !== 0) throw new Error("must not write canonical");
  if (report.guarantees.noFetch !== true) throw new Error("must not fetch");
  return report;
}

function main() {
  const args = parseArgs();

  if (args.selfTest) {
    const report = selfTest();
    console.log(JSON.stringify({
      ok: true,
      selfTest: "build-football-truth-active-watchlist-activity-truth-review-plan-file",
      summary: report.summary,
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
    guarantees: report.guarantees
  }, null, 2));
}

try {
  main();
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    job: "build-football-truth-active-watchlist-activity-truth-review-plan-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
}