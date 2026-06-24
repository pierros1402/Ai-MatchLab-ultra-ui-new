import fs from "node:fs";
import path from "node:path";

const sourceRunnerPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-standings-season-state-extraction-runner-2026-06-15",
  "controlled-standings-season-state-extraction-runner-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-standings-season-state-extraction-review-board-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "controlled-standings-season-state-extraction-review-board-2026-06-15.json"
);

const expectedCompetitions = ["esp.1", "esp.2", "nor.1", "nor.2", "swe.1", "swe.2"];
const expectedProviderFamilies = ["laliga", "norway_ntf", "sportomedia"];
const expectedLeagueSizes = { "esp.1": 20, "esp.2": 22 };

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function uniqueSorted(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== "").map(String))].sort();
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = String(row[key] ?? "unknown");
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function groupBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function assertEqual(name, actual, expected, checks) {
  const passed = Object.is(actual, expected);
  checks.push({ name, actual, expected, passed });
}

function assertArrayEqual(name, actual, expected, checks) {
  const passed = JSON.stringify(actual) === JSON.stringify(expected);
  checks.push({ name, actual, expected, passed });
}

function normalizeTeamName(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .trim()
    .toLowerCase();
}

function dedupeStandingRows(rows) {
  const seen = new Set();
  const out = [];

  for (const row of rows) {
    const key = [
      normalizeTeamName(row.teamName),
      row.position ?? "",
      row.points ?? "",
      row.played ?? ""
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  return out;
}

function positionStats(rows) {
  const positions = rows
    .map((row) => Number(row.position))
    .filter((value) => Number.isFinite(value));

  const uniquePositions = [...new Set(positions)].sort((a, b) => a - b);

  return {
    positionCount: positions.length,
    uniquePositionCount: uniquePositions.length,
    minPosition: uniquePositions.length ? uniquePositions[0] : null,
    maxPosition: uniquePositions.length ? uniquePositions[uniquePositions.length - 1] : null,
    hasPositionOne: uniquePositions.includes(1)
  };
}

function candidateScore(rows, competitionSlug) {
  const stats = positionStats(rows);
  const playedValues = [...new Set(rows.map((row) => Number(row.played)).filter((value) => Number.isFinite(value)))].sort((a, b) => b - a);
  const primaryPlayed = playedValues.length === 1 ? playedValues[0] : null;
  const expectedLeagueSize = expectedLeagueSizes[competitionSlug] ?? null;
  const isSeasonTotalCandidate = primaryPlayed !== null && primaryPlayed >= 30 && stats.hasPositionOne && stats.uniquePositionCount >= 10;
  const isCompleteFullTableCandidate = expectedLeagueSize !== null && isSeasonTotalCandidate && stats.uniquePositionCount >= expectedLeagueSize;

  return {
    score: (isCompleteFullTableCandidate ? 10000 : 0) + (isSeasonTotalCandidate ? 5000 : 0) + (primaryPlayed ?? 0) * 10 + stats.uniquePositionCount,
    primaryPlayed,
    expectedLeagueSize,
    isSeasonTotalCandidate,
    isCompleteFullTableCandidate,
    ...stats
  };
}

function buildTableCandidateRows(extractionResultRows) {
  const rowsWithCoreFields = extractionResultRows.filter((row) =>
    row.teamName &&
    Number.isFinite(Number(row.position)) &&
    Number.isFinite(Number(row.points)) &&
    Number.isFinite(Number(row.played))
  );

  const tableRows = [];

  for (const [competitionSlug, competitionRows] of groupBy(rowsWithCoreFields, (row) => row.competitionSlug).entries()) {
    for (const [played, playedRows] of groupBy(competitionRows, (row) => String(row.played)).entries()) {
      const dedupedRows = dedupeStandingRows(playedRows)
        .sort((a, b) => Number(a.position) - Number(b.position) || String(a.teamName).localeCompare(String(b.teamName)));

      const score = candidateScore(dedupedRows, competitionSlug);

      let candidateTableStatus = "review_partial_or_alternate_table_candidate";
      if (score.isCompleteFullTableCandidate) candidateTableStatus = "accepted_full_table_candidate";
      else if (score.isSeasonTotalCandidate) candidateTableStatus = "selected_season_total_partial_candidate";

      tableRows.push({
        standingsExtractionReviewTableCandidateRowId: `standings_extraction_review_table_candidate_${String(tableRows.length + 1).padStart(2, "0")}`,
        competitionSlug,
        providerFamily: dedupedRows[0]?.providerFamily ?? null,
        extractionRoute: dedupedRows[0]?.extractionRoute ?? null,
        groupingKey: `played_${played}`,
        candidateTableStatus,
        tableScore: score.score,
        rowCount: dedupedRows.length,
        primaryPlayed: score.primaryPlayed,
        expectedLeagueSize: score.expectedLeagueSize,
        uniquePositionCount: score.uniquePositionCount,
        minPosition: score.minPosition,
        maxPosition: score.maxPosition,
        hasPositionOne: score.hasPositionOne,
        completenessGapCount: score.expectedLeagueSize === null ? null : Math.max(0, score.expectedLeagueSize - score.uniquePositionCount),
        rows: dedupedRows.map((row, index) => ({
          standingReviewTableRowOrdinal: index + 1,
          sourceStandingExtractionResultRowId: row.standingsSeasonStateExtractionResultRowId,
          teamName: row.teamName,
          position: Number(row.position),
          points: Number(row.points),
          played: Number(row.played),
          won: row.won === null ? null : Number(row.won),
          drawn: row.drawn === null ? null : Number(row.drawn),
          lost: row.lost === null ? null : Number(row.lost),
          goalsFor: row.goalsFor === null ? null : Number(row.goalsFor),
          goalsAgainst: row.goalsAgainst === null ? null : Number(row.goalsAgainst),
          goalDifference: row.goalDifference === null ? null : Number(row.goalDifference)
        }))
      });
    }
  }

  return tableRows.sort((a, b) => {
    if (a.competitionSlug !== b.competitionSlug) return a.competitionSlug.localeCompare(b.competitionSlug);
    return b.tableScore - a.tableScore;
  });
}

function selectBestSeasonTotalCandidates(tableCandidateRows) {
  const selected = [];

  for (const [competitionSlug, rows] of groupBy(tableCandidateRows, (row) => row.competitionSlug).entries()) {
    const ranked = rows
      .filter((row) => row.candidateTableStatus === "accepted_full_table_candidate" || row.candidateTableStatus === "selected_season_total_partial_candidate")
      .sort((a, b) => b.tableScore - a.tableScore);

    if (ranked.length > 0) {
      selected.push({
        ...ranked[0],
        selectedTableStatus: ranked[0].candidateTableStatus === "accepted_full_table_candidate"
          ? "selected_best_full_table_candidate"
          : "selected_best_season_total_partial_candidate"
      });
    }
  }

  return selected.sort((a, b) => a.competitionSlug.localeCompare(b.competitionSlug));
}

fs.mkdirSync(outputDir, { recursive: true });

if (!fs.existsSync(sourceRunnerPath)) {
  throw new Error(`Missing controlled extraction runner diagnostic: ${sourceRunnerPath}`);
}

const runner = readJson(sourceRunnerPath);
const runnerSummary = runner.summary && typeof runner.summary === "object" ? runner.summary : {};
const fetchRows = Array.isArray(runner.controlledExtractionFetchRows) ? runner.controlledExtractionFetchRows : [];
const seasonStateCandidateRows = Array.isArray(runner.seasonStateCandidateRows) ? runner.seasonStateCandidateRows : [];
const extractionResultRows = Array.isArray(runner.extractionResultRows) ? runner.extractionResultRows : [];

const tableCandidateRows = buildTableCandidateRows(extractionResultRows);
const selectedSeasonTotalCandidateRows = selectBestSeasonTotalCandidates(tableCandidateRows);

const competitionsWithOkFetch = uniqueSorted(fetchRows.filter((row) => row.ok).map((row) => row.competitionSlug));
const competitionsWithStandingCandidates = uniqueSorted(extractionResultRows.map((row) => row.competitionSlug));
const competitionsWithSelectedSeasonTotalCandidates = uniqueSorted(selectedSeasonTotalCandidateRows.map((row) => row.competitionSlug));
const competitionsWithoutStandingCandidates = expectedCompetitions.filter((slug) => !competitionsWithStandingCandidates.includes(slug));

const selectedStandingRows = selectedSeasonTotalCandidateRows.flatMap((table) =>
  table.rows.map((row) => ({
    selectedStandingCandidateRowId: `selected_standing_candidate_${table.competitionSlug}_${String(row.standingReviewTableRowOrdinal).padStart(2, "0")}`,
    sourceStandingsExtractionReviewTableCandidateRowId: table.standingsExtractionReviewTableCandidateRowId,
    competitionSlug: table.competitionSlug,
    providerFamily: table.providerFamily,
    extractionRoute: table.extractionRoute,
    teamName: row.teamName,
    position: row.position,
    points: row.points,
    played: row.played,
    won: row.won,
    drawn: row.drawn,
    lost: row.lost,
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
    goalDifference: row.goalDifference,
    candidateStatus: table.selectedTableStatus === "selected_best_full_table_candidate"
      ? "selected_full_table_candidate_not_truth_asserted"
      : "selected_season_total_partial_candidate_not_truth_asserted",
    canonicalWriteAllowedNow: false,
    productionWriteAllowedNow: false,
    truthAssertionAllowedNow: false
  }))
);

const providerParserGapRows = competitionsWithoutStandingCandidates.map((competitionSlug, index) => {
  const fetchForCompetition = fetchRows.filter((row) => row.competitionSlug === competitionSlug);
  const providerFamily = fetchForCompetition[0]?.providerFamily ?? "unknown";
  const extractionRoute = fetchForCompetition[0]?.extractionRoute ?? "unknown";

  return {
    providerParserGapRowId: `provider_parser_gap_${String(index + 1).padStart(2, "0")}`,
    competitionSlug,
    providerFamily,
    extractionRoute,
    okFetchCount: fetchForCompetition.filter((row) => row.ok).length,
    standingCandidateRowCount: extractionResultRows.filter((row) => row.competitionSlug === competitionSlug).length,
    seasonStateCandidateRowCount: seasonStateCandidateRows.filter((row) => row.competitionSlug === competitionSlug).length,
    gapStatus: "ok_fetch_and_season_state_candidate_but_no_generic_standings_parse",
    recommendedNextAction: providerFamily === "norway_ntf"
      ? "build_ntf_tabell_route_specific_parser"
      : providerFamily === "sportomedia"
        ? "build_sportomedia_route_specific_parser_or_graphql_parser"
        : "build_provider_specific_parser"
  };
});

const fullTableCompletenessGapRows = selectedSeasonTotalCandidateRows
  .filter((row) => row.selectedTableStatus === "selected_best_season_total_partial_candidate")
  .map((row, index) => ({
    fullTableCompletenessGapRowId: `full_table_completeness_gap_${String(index + 1).padStart(2, "0")}`,
    competitionSlug: row.competitionSlug,
    providerFamily: row.providerFamily,
    extractionRoute: row.extractionRoute,
    selectedRowCount: row.rowCount,
    expectedLeagueSize: row.expectedLeagueSize,
    completenessGapCount: row.completenessGapCount,
    gapStatus: "season_total_candidate_selected_but_full_table_not_yet_complete",
    recommendedNextAction: "expand_laliga_extraction_candidate_window_or_route_specific_table_parser"
  }));

const checks = [];

assertEqual("runnerStatus", runnerSummary.controlledStandingsSeasonStateExtractionRunnerStatus, "passed_with_extracted_candidates", checks);
assertEqual("controlledExtractionFetchAttemptCount", Number(runnerSummary.controlledExtractionFetchAttemptCount ?? 0), 12, checks);
assertEqual("controlledExtractionOkFetchCount", Number(runnerSummary.controlledExtractionOkFetchCount ?? 0), 12, checks);
assertEqual("standingCandidateRowCount", extractionResultRows.length, 80, checks);
assertEqual("seasonStateCandidateRowCount", seasonStateCandidateRows.length, 12, checks);

assertEqual("tableCandidateRowCount", tableCandidateRows.length, 4, checks);
assertEqual("selectedSeasonTotalCandidateCompetitionCount", competitionsWithSelectedSeasonTotalCandidates.length, 2, checks);
assertArrayEqual("competitionsWithSelectedSeasonTotalCandidates", competitionsWithSelectedSeasonTotalCandidates, ["esp.1", "esp.2"], checks);
assertArrayEqual("competitionsWithoutStandingCandidates", competitionsWithoutStandingCandidates, ["nor.1", "nor.2", "swe.1", "swe.2"], checks);

assertEqual("selectedStandingRowCount", selectedStandingRows.length, 28, checks);
assertEqual("providerParserGapRowCount", providerParserGapRows.length, 4, checks);
assertEqual("fullTableCompletenessGapRowCount", fullTableCompletenessGapRows.length, 2, checks);

assertArrayEqual("competitionsWithOkFetch", competitionsWithOkFetch, expectedCompetitions, checks);
assertArrayEqual("providerFamilies", uniqueSorted(fetchRows.map((row) => row.providerFamily)), expectedProviderFamilies, checks);

assertEqual("runnerSearchExecutedNowCount", Number(runnerSummary.searchExecutedNowCount ?? 0), 0, checks);
assertEqual("runnerBroadSearchExecutedNowCount", Number(runnerSummary.broadSearchExecutedNowCount ?? 0), 0, checks);
assertEqual("runnerClassifierExecutedNowCount", Number(runnerSummary.classifierExecutedNowCount ?? 0), 0, checks);
assertEqual("runnerCanonicalWriteExecutedNowCount", Number(runnerSummary.canonicalWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("runnerProductionWriteExecutedNowCount", Number(runnerSummary.productionWriteExecutedNowCount ?? 0), 0, checks);
assertEqual("runnerTruthAssertionExecutedNowCount", Number(runnerSummary.truthAssertionExecutedNowCount ?? 0), 0, checks);
assertEqual("runnerCanonicalWrites", Number(runnerSummary.canonicalWrites ?? 0), 0, checks);
assertEqual("runnerProductionWrite", Boolean(runnerSummary.productionWrite), false, checks);
assertEqual("runnerTruthAssertion", Boolean(runnerSummary.truthAssertion), false, checks);

const blockedReviewCheckCount = checks.filter((check) => !check.passed).length;
const passedReviewCheckCount = checks.filter((check) => check.passed).length;

const reviewBoard = {
  output: outputPath,
  job: "build-football-truth-controlled-standings-season-state-extraction-review-board-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: { sourceRunnerPath },
  policy: {
    reviewOnly: true,
    selectedCandidatesAreNotTruthAssertions: true,
    selectedSeasonTotalCandidatesMayBePartial: true,
    fullTableCompletenessGapsAreTransparent: true,
    providerParserGapsAreTransparent: true,
    broadSearchAllowed: false,
    classifierAllowed: false,
    canonicalWriteAllowed: false,
    productionWriteAllowed: false,
    truthAssertionAllowed: false
  },
  summary: {
    controlledStandingsSeasonStateExtractionReviewBoardReadCount: 1,
    runnerStatus: runnerSummary.controlledStandingsSeasonStateExtractionRunnerStatus,

    controlledExtractionFetchAttemptCount: fetchRows.length,
    controlledExtractionOkFetchCount: fetchRows.filter((row) => row.ok).length,
    standingCandidateRowCount: extractionResultRows.length,
    seasonStateCandidateRowCount: seasonStateCandidateRows.length,

    tableCandidateRowCount: tableCandidateRows.length,
    acceptedFullTableCandidateRowCount: tableCandidateRows.filter((row) => row.candidateTableStatus === "accepted_full_table_candidate").length,
    selectedSeasonTotalCandidateCompetitionCount: competitionsWithSelectedSeasonTotalCandidates.length,
    selectedStandingRowCount: selectedStandingRows.length,

    competitionsWithOkFetch,
    competitionsWithStandingCandidates,
    competitionsWithSelectedSeasonTotalCandidates,
    competitionsWithoutStandingCandidates,

    providerParserGapRowCount: providerParserGapRows.length,
    providerParserGapCompetitions: providerParserGapRows.map((row) => row.competitionSlug),
    fullTableCompletenessGapRowCount: fullTableCompletenessGapRows.length,
    fullTableCompletenessGapCompetitions: fullTableCompletenessGapRows.map((row) => row.competitionSlug),

    selectedStandingRowsByCompetition: countBy(selectedStandingRows, "competitionSlug"),
    providerParserGapsByProviderFamily: countBy(providerParserGapRows, "providerFamily"),

    reviewCheckCount: checks.length,
    passedReviewCheckCount,
    blockedReviewCheckCount,
    controlledStandingsSeasonStateExtractionReviewBoardStatus: blockedReviewCheckCount === 0 ? "passed" : "blocked",
    mayBuildSelectedSeasonTotalCandidateQualityGateCount: blockedReviewCheckCount === 0 ? 1 : 0,
    mayBuildProviderSpecificParserGapPlanCount: blockedReviewCheckCount === 0 ? 1 : 0,
    mayBuildLaligaFullTableExtractionExpansionPlanCount: blockedReviewCheckCount === 0 ? 1 : 0,

    fetchExecutedNowCount: 0,
    searchExecutedNowCount: 0,
    broadSearchExecutedNowCount: 0,
    classifierExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    canonicalWrites: 0,
    productionWrite: false,
    truthAssertion: false
  },
  checks,
  selectedSeasonTotalCandidateRows,
  selectedStandingRows,
  tableCandidateRows,
  providerParserGapRows,
  fullTableCompletenessGapRows
};

writeJson(outputPath, reviewBoard);

console.log(JSON.stringify({
  output: reviewBoard.output,
  controlledStandingsSeasonStateExtractionReviewBoardStatus: reviewBoard.summary.controlledStandingsSeasonStateExtractionReviewBoardStatus,
  acceptedFullTableCandidateRowCount: reviewBoard.summary.acceptedFullTableCandidateRowCount,
  selectedSeasonTotalCandidateCompetitionCount: reviewBoard.summary.selectedSeasonTotalCandidateCompetitionCount,
  selectedStandingRowCount: reviewBoard.summary.selectedStandingRowCount,
  selectedStandingRowsByCompetition: reviewBoard.summary.selectedStandingRowsByCompetition,
  providerParserGapRowCount: reviewBoard.summary.providerParserGapRowCount,
  providerParserGapCompetitions: reviewBoard.summary.providerParserGapCompetitions,
  fullTableCompletenessGapRowCount: reviewBoard.summary.fullTableCompletenessGapRowCount,
  fullTableCompletenessGapCompetitions: reviewBoard.summary.fullTableCompletenessGapCompetitions,
  sampleSelectedStandingRows: selectedStandingRows.slice(0, 12).map((row) => ({
    competitionSlug: row.competitionSlug,
    teamName: row.teamName,
    position: row.position,
    points: row.points,
    played: row.played,
    candidateStatus: row.candidateStatus
  })),
  mayBuildSelectedSeasonTotalCandidateQualityGateCount: reviewBoard.summary.mayBuildSelectedSeasonTotalCandidateQualityGateCount,
  mayBuildProviderSpecificParserGapPlanCount: reviewBoard.summary.mayBuildProviderSpecificParserGapPlanCount,
  mayBuildLaligaFullTableExtractionExpansionPlanCount: reviewBoard.summary.mayBuildLaligaFullTableExtractionExpansionPlanCount,
  productionWriteExecutedNowCount: reviewBoard.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: reviewBoard.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedReviewCheckCount !== 0) {
  process.exitCode = 1;
}
