import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const inputPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-sportomedia-exact-graphql-standings-extraction-runner-2026-06-16",
  "controlled-sportomedia-exact-graphql-standings-extraction-runner-2026-06-16.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-sportomedia-standings-extraction-quality-gate-2026-06-16"
);

const outputPath = path.join(
  outputDir,
  "controlled-sportomedia-standings-extraction-quality-gate-2026-06-16.json"
);

const expected = {
  "swe.1": {
    competitionLabel: "Sweden Allsvenskan",
    providerFamily: "sportomedia",
    expectedLeague: "allsvenskan",
    expectedSeason: 2026,
    expectedRowCount: 16,
    expectedOfficialRoute: "https://allsvenskan.se/tabell"
  },
  "swe.2": {
    competitionLabel: "Sweden Superettan",
    providerFamily: "sportomedia",
    expectedLeague: "superettan",
    expectedSeason: 2026,
    expectedRowCount: 16,
    expectedOfficialRoute: "https://superettan.se/tabell"
  }
};

function sha256Text(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function unique(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== "").map(String))];
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = String(row[key] ?? "unknown");
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sortedNumbers(values) {
  return values.map(Number).sort((a, b) => a - b);
}

function expectedSequence(n) {
  return Array.from({ length: n }, (_, index) => index + 1);
}

function sameNumberArray(a, b) {
  return a.length === b.length && a.every((value, index) => Number(value) === Number(b[index]));
}

function rowIssues(row) {
  const issues = [];
  const position = numberOrNull(row.position);
  const played = numberOrNull(row.played);
  const wins = numberOrNull(row.wins);
  const draws = numberOrNull(row.draws);
  const losses = numberOrNull(row.losses);
  const goalsFor = numberOrNull(row.goalsFor);
  const goalsAgainst = numberOrNull(row.goalsAgainst);
  const goalDifference = numberOrNull(row.goalDifference);
  const points = numberOrNull(row.points);

  if (!row.teamName || String(row.teamName).trim().length < 2) issues.push("missing_team_name");
  if (!row.teamAbbrv || String(row.teamAbbrv).trim().length < 1) issues.push("missing_team_abbrv");
  if (position === null || position < 1) issues.push("invalid_position");
  for (const [name, value] of Object.entries({ played, wins, draws, losses, goalsFor, goalsAgainst, goalDifference, points })) {
    if (value === null) issues.push(`invalid_${name}`);
  }

  if (played !== null && wins !== null && draws !== null && losses !== null && played !== wins + draws + losses) {
    issues.push("played_not_equal_wins_draws_losses");
  }

  if (goalsFor !== null && goalsAgainst !== null && goalDifference !== null && goalDifference !== goalsFor - goalsAgainst) {
    issues.push("goal_difference_mismatch");
  }

  if (wins !== null && draws !== null && points !== null && points !== wins * 3 + draws) {
    issues.push("points_not_equal_3wins_plus_draws");
  }

  return issues;
}

function canonicalPreviewRows(extractionRow) {
  return (Array.isArray(extractionRow.normalizedStandingRows) ? extractionRow.normalizedStandingRows : []).map((row) => ({
    competitionSlug: extractionRow.competitionSlug,
    competitionLabel: expected[extractionRow.competitionSlug]?.competitionLabel ?? extractionRow.competitionLabel,
    providerFamily: "sportomedia",
    sourceKind: "official_sportomedia_graphql_standingsForLeague",
    sourceUrl: extractionRow.request?.url,
    officialRoute: extractionRow.officialRoute,
    seasonStartYear: extractionRow.request?.variables?.configSeasonStartYear,
    league: extractionRow.request?.variables?.configLeagueName,
    type: extractionRow.request?.variables?.type,
    position: numberOrNull(row.position),
    teamId: row.teamId ?? null,
    teamName: row.teamName,
    teamAbbrv: row.teamAbbrv,
    played: numberOrNull(row.played),
    wins: numberOrNull(row.wins),
    draws: numberOrNull(row.draws),
    losses: numberOrNull(row.losses),
    goalsFor: numberOrNull(row.goalsFor),
    goalsAgainst: numberOrNull(row.goalsAgainst),
    goalDifference: numberOrNull(row.goalDifference),
    points: numberOrNull(row.points),
    borderType: row.borderType ?? null
  }));
}

function validateExtractionRow(extractionRow) {
  const meta = expected[extractionRow.competitionSlug];
  const rows = Array.isArray(extractionRow.normalizedStandingRows) ? extractionRow.normalizedStandingRows : [];
  const issues = [];

  if (!meta) issues.push("unexpected_competition_slug");
  if (extractionRow.extractionStatus !== "accepted_exact_graphql_standings_rows_requires_quality_gate") issues.push("source_extraction_not_accepted");
  if (Number(extractionRow.graphQlErrorCount ?? -1) !== 0) issues.push("graphql_errors_present");
  if (Number(extractionRow.attempt?.httpStatus ?? 0) !== 200) issues.push("http_status_not_200");
  if (!String(extractionRow.attempt?.contentType ?? "").toLowerCase().includes("application/json")) issues.push("content_type_not_json");
  if (meta && extractionRow.officialRoute !== meta.expectedOfficialRoute) issues.push("official_route_mismatch");
  if (meta && extractionRow.request?.variables?.configLeagueName !== meta.expectedLeague) issues.push("league_variable_mismatch");
  if (meta && Number(extractionRow.request?.variables?.configSeasonStartYear ?? 0) !== meta.expectedSeason) issues.push("season_variable_mismatch");
  if (extractionRow.request?.variables?.type !== "total") issues.push("type_variable_not_total");
  if (meta && rows.length !== meta.expectedRowCount) issues.push("standing_row_count_mismatch");

  const positionSequence = sortedNumbers(rows.map((row) => row.position));
  if (meta && !sameNumberArray(positionSequence, expectedSequence(meta.expectedRowCount))) {
    issues.push("positions_not_1_to_expected_count");
  }

  const teamNames = rows.map((row) => row.teamName);
  if (unique(teamNames).length !== rows.length) issues.push("duplicate_team_names");

  const teamIds = rows.map((row) => row.teamId).filter((value) => value !== null && value !== undefined && value !== "");
  if (teamIds.length > 0 && unique(teamIds).length !== teamIds.length) issues.push("duplicate_team_ids");

  const perRowIssues = rows.map((row, index) => ({
    position: row.position,
    teamName: row.teamName,
    rowIndex: index,
    issues: rowIssues(row)
  })).filter((entry) => entry.issues.length > 0);

  if (perRowIssues.length > 0) issues.push("row_level_quality_issues");

  return {
    competitionSlug: extractionRow.competitionSlug,
    competitionLabel: meta?.competitionLabel ?? extractionRow.competitionLabel,
    providerFamily: "sportomedia",
    sourceExtractionStatus: extractionRow.extractionStatus,
    officialRoute: extractionRow.officialRoute,
    graphqlEndpoint: extractionRow.request?.url,
    league: extractionRow.request?.variables?.configLeagueName,
    seasonStartYear: extractionRow.request?.variables?.configSeasonStartYear,
    type: extractionRow.request?.variables?.type,
    httpStatus: extractionRow.attempt?.httpStatus ?? null,
    contentType: extractionRow.attempt?.contentType ?? null,
    graphQlErrorCount: extractionRow.graphQlErrorCount,
    expectedStandingRowCount: meta?.expectedRowCount ?? null,
    actualStandingRowCount: rows.length,
    positionSequence,
    teamNameCount: teamNames.length,
    uniqueTeamNameCount: unique(teamNames).length,
    teamIdCount: teamIds.length,
    uniqueTeamIdCount: unique(teamIds).length,
    perRowIssueCount: perRowIssues.length,
    perRowIssues,
    qualityGateStatus: issues.length === 0
      ? "accepted_exact_graphql_standings_rows_ready_for_canonical_candidate_write_plan"
      : "blocked_quality_gate_issues",
    issues,
    canonicalCandidatePreviewRows: canonicalPreviewRows(extractionRow),
    nextAllowedAction: {
      mayBuildCanonicalCandidateWritePlan: issues.length === 0,
      mayWriteCanonicalNow: false,
      mayWriteProductionNow: false,
      mayAssertTruthNow: false,
      mayFetchNow: false,
      maySearch: false,
      mayBroadSearch: false
    }
  };
}

function check(checks, name, passed, details = {}) {
  checks.push({ name, passed: Boolean(passed), ...details });
}

if (!fs.existsSync(inputPath)) {
  throw new Error(`Missing exact GraphQL extraction runner output: ${inputPath}`);
}

const inputText = fs.readFileSync(inputPath, "utf8");
const input = JSON.parse(inputText);
const extractionRows = Array.isArray(input.extractionRows) ? input.extractionRows : [];
const qualityRows = extractionRows.map(validateExtractionRow);
const acceptedRows = qualityRows.filter((row) => row.qualityGateStatus === "accepted_exact_graphql_standings_rows_ready_for_canonical_candidate_write_plan");
const blockedRows = qualityRows.filter((row) => row.qualityGateStatus !== "accepted_exact_graphql_standings_rows_ready_for_canonical_candidate_write_plan");
const canonicalCandidatePreviewRows = qualityRows.flatMap((row) => row.canonicalCandidatePreviewRows);

const checks = [];
check(checks, "sourceExactGraphqlRunnerPassed", input.summary?.status === "passed", { actual: input.summary?.status });
check(checks, "sourceAcceptedExtractionRowsTwo", Number(input.summary?.acceptedStandingsExtractionRowCount ?? 0) === 2, { actual: input.summary?.acceptedStandingsExtractionRowCount });
check(checks, "sourceTotalExtractedRowsThirtyTwo", Number(input.summary?.totalExtractedStandingRowCount ?? 0) === 32, { actual: input.summary?.totalExtractedStandingRowCount });
check(checks, "sourceNoSearchCanonicalProductionTruth", Number(input.summary?.searchExecutedNowCount ?? -1) === 0 && Number(input.summary?.broadSearchExecutedNowCount ?? -1) === 0 && Number(input.summary?.canonicalWriteExecutedNowCount ?? -1) === 0 && Number(input.summary?.productionWriteExecutedNowCount ?? -1) === 0 && Number(input.summary?.truthAssertionExecutedNowCount ?? -1) === 0);
check(checks, "qualityRowsExpectedCount", qualityRows.length === 2, { actual: qualityRows.length, expected: 2 });
check(checks, "qualityRowsCoverExpectedCompetitions", JSON.stringify(qualityRows.map((row) => row.competitionSlug).sort()) === JSON.stringify(Object.keys(expected).sort()), { actual: qualityRows.map((row) => row.competitionSlug).sort(), expected: Object.keys(expected).sort() });
check(checks, "acceptedQualityRowsExpectedCount", acceptedRows.length === 2, { actual: acceptedRows.length, expected: 2 });
check(checks, "blockedQualityRowsExpectedZero", blockedRows.length === 0, { actual: blockedRows.length, expected: 0 });
check(checks, "canonicalPreviewRowsThirtyTwo", canonicalCandidatePreviewRows.length === 32, { actual: canonicalCandidatePreviewRows.length, expected: 32 });
check(checks, "canonicalPreviewRowsNoDuplicatesByCompetitionPosition", unique(canonicalCandidatePreviewRows.map((row) => `${row.competitionSlug}:${row.position}`)).length === canonicalCandidatePreviewRows.length);
check(checks, "allRowsKeepCanonicalProductionTruthBlocked", qualityRows.every((row) => row.nextAllowedAction.mayWriteCanonicalNow === false && row.nextAllowedAction.mayWriteProductionNow === false && row.nextAllowedAction.mayAssertTruthNow === false));
check(checks, "fetchExecutedNowCount", true, { actual: 0 });
check(checks, "searchExecutedNowCount", true, { actual: 0 });
check(checks, "broadSearchExecutedNowCount", true, { actual: 0 });
check(checks, "canonicalWriteExecutedNowCount", true, { actual: 0 });
check(checks, "productionWriteExecutedNowCount", true, { actual: 0 });
check(checks, "truthAssertionExecutedNowCount", true, { actual: 0 });

const blockedCheckCount = checks.filter((entry) => !entry.passed).length;
const passedCheckCount = checks.filter((entry) => entry.passed).length;

const output = {
  output: outputPath,
  job: "build-football-truth-controlled-sportomedia-standings-extraction-quality-gate-file",
  generatedAtUtc: new Date().toISOString(),
  sourcePath: inputPath,
  sourceSha256: sha256Text(inputText),
  policy: {
    qualityGateOnly: true,
    noFetchInThisJob: true,
    noSearchInThisJob: true,
    noBroadSearchInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true
  },
  summary: {
    controlledSportomediaStandingsExtractionQualityGateStatus: blockedCheckCount === 0 ? "passed" : "blocked",
    qualityGateRowCount: qualityRows.length,
    acceptedQualityGateRowCount: acceptedRows.length,
    blockedQualityGateRowCount: blockedRows.length,
    totalCanonicalCandidatePreviewRowCount: canonicalCandidatePreviewRows.length,
    qualityRowsByCompetition: countBy(qualityRows, "competitionSlug"),
    qualityRowsByStatus: countBy(qualityRows, "qualityGateStatus"),
    checkCount: checks.length,
    passedCheckCount,
    blockedCheckCount,
    mayBuildControlledSportomediaCanonicalCandidateWritePlanCount: acceptedRows.length === 2 ? 1 : 0,
    mayBuildCanonicalCandidateNowCount: 0,
    fetchExecutedNowCount: 0,
    searchExecutedNowCount: 0,
    broadSearchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0
  },
  checks,
  qualityRows,
  canonicalCandidatePreviewRows
};

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  controlledSportomediaStandingsExtractionQualityGateStatus: output.summary.controlledSportomediaStandingsExtractionQualityGateStatus,
  qualityGateRowCount: output.summary.qualityGateRowCount,
  acceptedQualityGateRowCount: output.summary.acceptedQualityGateRowCount,
  blockedQualityGateRowCount: output.summary.blockedQualityGateRowCount,
  totalCanonicalCandidatePreviewRowCount: output.summary.totalCanonicalCandidatePreviewRowCount,
  qualityRowsByStatus: output.summary.qualityRowsByStatus,
  mayBuildControlledSportomediaCanonicalCandidateWritePlanCount: output.summary.mayBuildControlledSportomediaCanonicalCandidateWritePlanCount,
  mayBuildCanonicalCandidateNowCount: output.summary.mayBuildCanonicalCandidateNowCount,
  fetchExecutedNowCount: output.summary.fetchExecutedNowCount,
  searchExecutedNowCount: output.summary.searchExecutedNowCount,
  broadSearchExecutedNowCount: output.summary.broadSearchExecutedNowCount,
  canonicalWriteExecutedNowCount: output.summary.canonicalWriteExecutedNowCount,
  productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedCheckCount !== 0) process.exitCode = 1;
