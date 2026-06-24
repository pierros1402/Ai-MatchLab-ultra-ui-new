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
    fin1: "",
    fin2: "",
    loi: "",
    ksi: "",
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

    if (arg === "--fin1") {
      args.fin1 = asText(argv[++i]);
      continue;
    }

    if (arg === "--fin2") {
      args.fin2 = asText(argv[++i]);
      continue;
    }

    if (arg === "--loi") {
      args.loi = asText(argv[++i]);
      continue;
    }

    if (arg === "--ksi") {
      args.ksi = asText(argv[++i]);
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

function countBy(rows, predicate) {
  return rows.filter(predicate).length;
}

function isoDates(rows) {
  return [...new Set(rows.map((row) => asText(row.isoDate || row.date)).filter(Boolean))]
    .sort();
}

function summarizeTorneopal(report, competitionSlug) {
  const rows = asArray(report.normalizedFixtureRows)
    .filter((row) => asText(row.competitionSlug) === competitionSlug);

  const finishedRows = rows.filter((row) => asText(row.normalizedStatus || row.status) === "finished");
  const scheduledRows = rows.filter((row) => asText(row.normalizedStatus || row.status) === "scheduled");
  const dates = isoDates(rows);
  const scheduledDates = isoDates(scheduledRows);

  const activityValidationState = scheduledRows.length > 0
    ? "provider_lane_active_current_season_with_scheduled_fixtures"
    : rows.length > 0
      ? "provider_lane_current_season_results_only_or_no_future_schedule"
      : "provider_lane_no_rows_for_competition";

  return {
    competitionSlug,
    leagueSlug: competitionSlug,
    sourceFamily: "palloliitto_torneopal",
    inputRowCount: rows.length,
    finishedRowCount: finishedRows.length,
    scheduledRowCount: scheduledRows.length,
    firstDate: dates[0] || "",
    lastDate: dates[dates.length - 1] || "",
    firstScheduledDate: scheduledDates[0] || "",
    lastScheduledDate: scheduledDates[scheduledDates.length - 1] || "",
    teamCount: new Set(rows.flatMap((row) => [asText(row.homeTeam), asText(row.awayTeam)]).filter(Boolean)).size,
    activityValidationState,
    fixtureTruthStateCandidate: scheduledRows.length > 0 ? "fixtures_available" : "fixtures_not_proven",
    resultTruthStateCandidate: finishedRows.length > 0 ? "results_available" : "results_not_proven",
    blockedReason: "",
    mayPromoteCanonical: false,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function summarizeLoi(report, competitionSlug) {
  const rows = asArray(report.normalizedRows)
    .filter((row) => asText(row.competition) === competitionSlug);

  const finishedRows = rows.filter((row) => asText(row.status) === "finished");
  const scheduledRows = rows.filter((row) => asText(row.status) === "scheduled");
  const fixtureRows = rows.filter((row) => asText(row.pageKind) === "fixtures");
  const resultRows = rows.filter((row) => asText(row.pageKind) === "results");
  const dates = isoDates(rows);
  const scheduledDates = isoDates(scheduledRows);

  const blocked = report.blocked || {};
  const irl2FixturesBlocked = competitionSlug === "irl.2" && blocked.irl2Fixtures === true;

  let activityValidationState = "provider_lane_no_rows_for_competition";
  if (scheduledRows.length > 0) {
    activityValidationState = "provider_lane_active_current_season_with_scheduled_fixtures";
  } else if (finishedRows.length > 0 && irl2FixturesBlocked) {
    activityValidationState = "provider_lane_results_available_fixture_endpoint_blocked";
  } else if (finishedRows.length > 0) {
    activityValidationState = "provider_lane_current_season_results_only_or_no_future_schedule";
  }

  return {
    competitionSlug,
    leagueSlug: competitionSlug,
    sourceFamily: "leagueofireland_ajax",
    inputRowCount: rows.length,
    fixturePageRowCount: fixtureRows.length,
    resultPageRowCount: resultRows.length,
    finishedRowCount: finishedRows.length,
    scheduledRowCount: scheduledRows.length,
    firstDate: dates[0] || "",
    lastDate: dates[dates.length - 1] || "",
    firstScheduledDate: scheduledDates[0] || "",
    lastScheduledDate: scheduledDates[scheduledDates.length - 1] || "",
    teamCount: new Set(rows.flatMap((row) => [asText(row.homeTeam), asText(row.awayTeam)]).filter(Boolean)).size,
    activityValidationState,
    fixtureTruthStateCandidate: scheduledRows.length > 0 ? "fixtures_available" : "fixtures_not_available_from_current_lane",
    resultTruthStateCandidate: finishedRows.length > 0 ? "results_available" : "results_not_proven",
    blockedReason: irl2FixturesBlocked ? asText(blocked.reason) : "",
    mayPromoteCanonical: false,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function summarizeKsi(report) {
  const summary = report.summary || {};
  const fixtureRows = asArray(report.normalizedFixtureRows);
  const standingRows = asArray(report.normalizedStandingRows);

  return {
    competitionSlug: "isl.1",
    leagueSlug: "isl.1",
    sourceFamily: "ksi_tournament_route",
    inputRowCount: fixtureRows.length + standingRows.length,
    fixtureRowCount: fixtureRows.length,
    standingRowCount: standingRows.length,
    finishedRowCount: countBy(fixtureRows, (row) => asText(row.status || row.normalizedStatus) === "finished"),
    scheduledRowCount: fixtureRows.length,
    firstDate: asText(summary.firstFixtureDate),
    lastDate: asText(summary.lastFixtureDate),
    firstScheduledDate: asText(summary.firstFixtureDate),
    lastScheduledDate: asText(summary.lastFixtureDate),
    teamCount: standingRows.length,
    seasonStateCandidate: asText(summary.seasonStateCandidate),
    activityValidationState: summary.seasonStateCandidate === "active_current_season" && fixtureRows.length > 0
      ? "provider_lane_active_current_season_with_scheduled_fixtures"
      : "provider_lane_needs_review",
    fixtureTruthStateCandidate: asText(summary.fixtureTruthStateCandidate || "fixtures_not_proven"),
    standingsStateCandidate: asText(summary.standingsStateCandidate || "standings_not_proven"),
    resultTruthStateCandidate: "not_checked_in_ksi_lane",
    blockedReason: "",
    mayPromoteCanonical: false,
    canonicalWrites: 0,
    productionWrite: false
  };
}

function buildReport({ fin1, fin2, loi, ksi }, date) {
  const validationRows = [
    summarizeTorneopal(fin1, "fin.1"),
    summarizeTorneopal(fin2, "fin.2"),
    summarizeLoi(loi, "irl.1"),
    summarizeLoi(loi, "irl.2"),
    summarizeKsi(ksi)
  ];

  const byActivityValidationState = {};
  for (const row of validationRows) {
    byActivityValidationState[row.activityValidationState] = (byActivityValidationState[row.activityValidationState] || 0) + 1;
  }

  const readyForActivityTruthReviewRows = validationRows.filter((row) =>
    row.activityValidationState === "provider_lane_active_current_season_with_scheduled_fixtures" ||
    row.activityValidationState === "provider_lane_results_available_fixture_endpoint_blocked"
  );

  const blockedOrNeedsRepairRows = [
    {
      competitionSlug: "isl.2",
      leagueSlug: "isl.2",
      sourceFamily: "ksi_tournament_route",
      activityValidationState: "provider_specific_route_discovery_needed",
      blockedReason: "KSI tournament id not yet recovered for isl.2",
      mayPromoteCanonical: false,
      canonicalWrites: 0,
      productionWrite: false
    },
    {
      competitionSlug: "per.1",
      leagueSlug: "per.1",
      sourceFamily: "liga1_official",
      activityValidationState: "official_route_or_adapter_repair_needed",
      blockedReason: "Liga1 generic official route probes returned 404",
      mayPromoteCanonical: false,
      canonicalWrites: 0,
      productionWrite: false
    },
    {
      competitionSlug: "per.2",
      leagueSlug: "per.2",
      sourceFamily: "unknown_official",
      activityValidationState: "official_host_and_route_discovery_needed",
      blockedReason: "No strict evidence-derived official host selected for Peru Liga 2",
      mayPromoteCanonical: false,
      canonicalWrites: 0,
      productionWrite: false
    }
  ];

  return {
    ok: true,
    job: "build-football-truth-active-watchlist-provider-lane-activity-validation-board-file",
    mode: "read_only_provider_lane_activity_validation_board",
    generatedAt: new Date().toISOString(),
    date,
    sourceSummaries: {
      fin1: fin1.summary || {},
      fin2: fin2.summary || {},
      loi: loi.summary || {},
      ksi: ksi.summary || {}
    },
    summary: {
      validatedProviderLaneCompetitionCount: validationRows.length,
      readyForActivityTruthReviewCount: readyForActivityTruthReviewRows.length,
      blockedOrNeedsRepairCount: blockedOrNeedsRepairRows.length,
      canonicalWrites: 0,
      productionWrite: false,
      dryRun: true,
      byActivityValidationState
    },
    validationRows,
    readyForActivityTruthReviewRows,
    blockedOrNeedsRepairRows,
    policy: {
      providerLaneEvidenceDoesNotEqualCanonicalTruth: true,
      truthReviewRequiredBeforeCanonicalPromotion: true,
      noSearch: true,
      noFetch: true,
      noCanonicalPromotion: true,
      noCanonicalWritesFromValidationBoard: true
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
    fin1: { summary: {}, normalizedFixtureRows: [{ competitionSlug: "fin.1", normalizedStatus: "scheduled", isoDate: "2026-06-12", homeTeam: "A", awayTeam: "B" }] },
    fin2: { summary: {}, normalizedFixtureRows: [{ competitionSlug: "fin.2", normalizedStatus: "finished", isoDate: "2026-02-01", homeTeam: "A", awayTeam: "B" }] },
    loi: { summary: {}, blocked: { irl2Fixtures: true, reason: "blocked" }, normalizedRows: [{ competition: "irl.1", status: "scheduled", pageKind: "fixtures", isoDate: "2026-06-12", homeTeam: "A", awayTeam: "B" }, { competition: "irl.2", status: "finished", pageKind: "results", isoDate: "2026-02-01", homeTeam: "C", awayTeam: "D" }] },
    ksi: { summary: { seasonStateCandidate: "active_current_season", firstFixtureDate: "2026-06-14", lastFixtureDate: "2026-06-16", fixtureTruthStateCandidate: "fixtures_available", standingsStateCandidate: "official_standings_available" }, normalizedFixtureRows: [{ date: "2026-06-14" }], normalizedStandingRows: [{ teamName: "A" }] }
  }, "2026-06-12");

  if (report.summary.validatedProviderLaneCompetitionCount !== 5) throw new Error("expected 5 validated competitions");
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
      selfTest: "build-football-truth-active-watchlist-provider-lane-activity-validation-board-file",
      summary: report.summary,
      guarantees: report.guarantees
    }, null, 2));
    return;
  }

  if (!args.fin1) throw new Error("--fin1 is required");
  if (!args.fin2) throw new Error("--fin2 is required");
  if (!args.loi) throw new Error("--loi is required");
  if (!args.ksi) throw new Error("--ksi is required");
  if (!args.output) throw new Error("--output is required");

  const report = buildReport({
    fin1: readJson(args.fin1),
    fin2: readJson(args.fin2),
    loi: readJson(args.loi),
    ksi: readJson(args.ksi)
  }, args.date);

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
    job: "build-football-truth-active-watchlist-provider-lane-activity-validation-board-file",
    error: error?.message || String(error),
    canonicalWrites: 0,
    productionWrite: false
  }, null, 2));
  process.exitCode = 1;
}