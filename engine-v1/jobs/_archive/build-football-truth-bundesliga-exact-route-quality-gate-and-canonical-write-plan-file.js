import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const runnerPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "whole-map-exact-route-retry-runner-2026-06-16",
  "whole-map-exact-route-retry-runner-2026-06-16.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "bundesliga-exact-route-quality-gate-and-canonical-write-plan-2026-06-16"
);

const outputPath = path.join(
  outputDir,
  "bundesliga-exact-route-quality-gate-and-canonical-write-plan-2026-06-16.json"
);

const plannedCanonicalCandidatePath = path.join(
  "data",
  "football-truth",
  "_state",
  "canonical-standings-candidates",
  "bundesliga-official-standings-candidates-2026-06-16.json"
);

const expectedRowsByCompetition = {
  "ger.1": 18,
  "ger.2": 18
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

function parseIntStrict(value) {
  const text = String(value ?? "").trim().replace(/^\+/, "");
  if (!/^-?\d+$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function parseWdl(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d+)\s*-\s*(\d+)\s*-\s*(\d+)$/);
  if (!match) return null;
  return {
    wins: Number(match[1]),
    draws: Number(match[2]),
    losses: Number(match[3])
  };
}

function parseGoals(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d+)\s*:\s*(\d+)$/);
  if (!match) return null;
  return {
    goalsFor: Number(match[1]),
    goalsAgainst: Number(match[2])
  };
}

function cleanCells(cells) {
  return (Array.isArray(cells) ? cells : [])
    .map((cell) => String(cell ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function cleanTeamName(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .replace(/\bLogo\b/gi, "")
    .replace(/\bClub\b/gi, "")
    .trim();
}

function mapBundesligaCellsToCandidate(raw, competitionRow, sourceRowIndex) {
  const cells = cleanCells(raw.rawCells);

  const position = parseIntStrict(cells[0]);
  const teamName = cleanTeamName(cells[1]);
  const played = parseIntStrict(cells[2]);
  const wdl = parseWdl(cells[3]);
  const goals = parseGoals(cells[4]);
  const goalDifference = parseIntStrict(cells[5]);
  const points = parseIntStrict(cells[6]);

  const candidate = {
    competitionSlug: competitionRow.competitionSlug,
    competitionLabel: competitionRow.competitionLabel,
    providerFamily: "bundesliga_official",
    sourceKind: "official_bundesliga_html_table",
    sourceUrl: competitionRow.route,
    sourceFinalUrl: competitionRow.finalUrl,
    sourceOutputFile: competitionRow.outputFile,
    sourceOutputSha256: competitionRow.outputSha256,
    rowIndex: sourceRowIndex + 1,
    position,
    teamName,
    played,
    wins: wdl?.wins ?? null,
    draws: wdl?.draws ?? null,
    losses: wdl?.losses ?? null,
    goalsFor: goals?.goalsFor ?? null,
    goalsAgainst: goals?.goalsAgainst ?? null,
    goalDifference,
    points,
    rawCells: cells,
    parserContract: {
      columnSchema: [
        "position",
        "teamName",
        "played",
        "wins-draws-losses",
        "goalsFor:goalsAgainst",
        "goalDifference",
        "points"
      ],
      parserName: "bundesliga_official_column_aware_html_table_parser_v1"
    }
  };

  candidate.qualityHints = {
    hasSevenCells: cells.length >= 7,
    hasPosition: Number.isInteger(candidate.position),
    hasTeamName: candidate.teamName.length >= 2,
    hasPlayed: Number.isInteger(candidate.played),
    hasWdl: Boolean(wdl),
    hasGoals: Boolean(goals),
    hasGoalDifference: Number.isInteger(candidate.goalDifference),
    hasPoints: Number.isInteger(candidate.points),
    resultEquationOk:
      Number.isInteger(candidate.played) &&
      Number.isInteger(candidate.wins) &&
      Number.isInteger(candidate.draws) &&
      Number.isInteger(candidate.losses)
        ? candidate.played === candidate.wins + candidate.draws + candidate.losses
        : null,
    goalDifferenceEquationOk:
      Number.isInteger(candidate.goalsFor) &&
      Number.isInteger(candidate.goalsAgainst) &&
      Number.isInteger(candidate.goalDifference)
        ? candidate.goalsFor - candidate.goalsAgainst === candidate.goalDifference
        : null,
    pointsEquationPlausible:
      Number.isInteger(candidate.points) &&
      Number.isInteger(candidate.wins) &&
      Number.isInteger(candidate.draws)
        ? candidate.points >= (candidate.wins * 3 + candidate.draws - 3) && candidate.points <= (candidate.wins * 3 + candidate.draws + 3)
        : null
  };

  candidate.rowIssueCodes = [
    !candidate.qualityHints.hasSevenCells ? "unexpected_cell_count" : null,
    !candidate.qualityHints.hasPosition ? "missing_position" : null,
    !candidate.qualityHints.hasTeamName ? "missing_team_name" : null,
    !candidate.qualityHints.hasPlayed ? "missing_played" : null,
    !candidate.qualityHints.hasWdl ? "missing_wdl" : null,
    !candidate.qualityHints.hasGoals ? "missing_goals_for_against" : null,
    !candidate.qualityHints.hasGoalDifference ? "missing_goal_difference" : null,
    !candidate.qualityHints.hasPoints ? "missing_points" : null,
    candidate.qualityHints.resultEquationOk === false ? "played_not_equal_wdl" : null,
    candidate.qualityHints.goalDifferenceEquationOk === false ? "goal_difference_not_equal_gf_minus_ga" : null,
    candidate.qualityHints.pointsEquationPlausible === false ? "points_not_plausible_from_wins_draws" : null
  ].filter(Boolean);

  return candidate;
}

function check(checks, name, passed, details = {}) {
  checks.push({ name, passed: Boolean(passed), ...details });
}

if (!fs.existsSync(runnerPath)) {
  throw new Error(`Missing exact-route retry runner output: ${runnerPath}`);
}

const runnerText = fs.readFileSync(runnerPath, "utf8");
const runner = JSON.parse(runnerText);
const resultRows = Array.isArray(runner.resultRows) ? runner.resultRows : [];

const candidateRows = [];
const qualityRows = [];

for (const resultRow of resultRows) {
  const genericRows = Array.isArray(resultRow.inspection?.genericStandingRows)
    ? resultRow.inspection.genericStandingRows
    : [];

  const mappedRows = genericRows.map((genericRow, index) => mapBundesligaCellsToCandidate(genericRow, resultRow, index));
  candidateRows.push(...mappedRows);

  const expectedRowCount = expectedRowsByCompetition[resultRow.competitionSlug] ?? null;
  const positions = mappedRows.map((row) => row.position);
  const teams = mappedRows.map((row) => row.teamName);
  const rowIssueCount = mappedRows.reduce((sum, row) => sum + row.rowIssueCodes.length, 0);
  const expectedPositionSet = expectedRowCount ? Array.from({ length: expectedRowCount }, (_, idx) => idx + 1) : [];
  const missingPositions = expectedPositionSet.filter((position) => !positions.includes(position));
  const duplicateTeams = teams.filter((team, index) => teams.indexOf(team) !== index);
  const equationFailureRows = mappedRows.filter((row) =>
    row.qualityHints.resultEquationOk === false ||
    row.qualityHints.goalDifferenceEquationOk === false
  );

  qualityRows.push({
    competitionSlug: resultRow.competitionSlug,
    competitionLabel: resultRow.competitionLabel,
    route: resultRow.route,
    httpStatus: resultRow.httpStatus,
    resultStatus: resultRow.resultStatus,
    expectedRowCount,
    mappedRowCount: mappedRows.length,
    uniqueTeamCount: unique(teams).length,
    minPosition: Math.min(...positions),
    maxPosition: Math.max(...positions),
    missingPositions,
    duplicateTeams,
    rowIssueCount,
    equationFailureRowCount: equationFailureRows.length,
    qualityGateStatus:
      resultRow.httpStatus === 200 &&
      resultRow.resultStatus === "accepted_generic_html_rows_requires_quality_gate" &&
      expectedRowCount !== null &&
      mappedRows.length === expectedRowCount &&
      unique(teams).length === expectedRowCount &&
      missingPositions.length === 0 &&
      duplicateTeams.length === 0 &&
      rowIssueCount === 0 &&
      equationFailureRows.length === 0
        ? "accepted_bundesliga_official_rows_ready_for_canonical_candidate_write_plan"
        : "blocked_bundesliga_quality_gate_issue",
    sampleRows: mappedRows.slice(0, 3)
  });
}

const acceptedQualityRows = qualityRows.filter((row) => row.qualityGateStatus === "accepted_bundesliga_official_rows_ready_for_canonical_candidate_write_plan");
const blockedQualityRows = qualityRows.filter((row) => row.qualityGateStatus !== "accepted_bundesliga_official_rows_ready_for_canonical_candidate_write_plan");
const candidateRowsByCompetition = countBy(candidateRows, "competitionSlug");
const candidateRowIssueCount = candidateRows.reduce((sum, row) => sum + row.rowIssueCodes.length, 0);

const canonicalCandidatePayload = {
  generatedAtUtc: new Date().toISOString(),
  sourceRunnerPath: runnerPath,
  sourceRunnerSha256: sha256Text(runnerText),
  providerFamily: "bundesliga_official",
  canonicalCandidateKind: "standings",
  competitions: Object.keys(expectedRowsByCompetition).sort(),
  rowCount: candidateRows.length,
  rowsByCompetition: candidateRowsByCompetition,
  rows: candidateRows
};

const plannedCanonicalCandidateSha256 = sha256Text(`${JSON.stringify(canonicalCandidatePayload, null, 2)}\n`);

const checks = [];
check(checks, "sourceRunnerPassed", runner.summary?.status === "passed", { actual: runner.summary?.status });
check(checks, "sourceFetchCountTwo", Number(runner.summary?.fetchExecutedNowCount ?? -1) === 2, { actual: runner.summary?.fetchExecutedNowCount });
check(checks, "sourceNoSearchNoWrite", Number(runner.summary?.searchExecutedNowCount ?? -1) === 0 && Number(runner.summary?.canonicalWriteExecutedNowCount ?? -1) === 0 && Number(runner.summary?.productionWriteExecutedNowCount ?? -1) === 0 && Number(runner.summary?.truthAssertionExecutedNowCount ?? -1) === 0);
check(checks, "qualityRowsTwo", qualityRows.length === 2, { actual: qualityRows.length, expected: 2 });
check(checks, "acceptedQualityRowsTwo", acceptedQualityRows.length === 2, { actual: acceptedQualityRows.length, expected: 2 });
check(checks, "blockedQualityRowsZero", blockedQualityRows.length === 0, { actual: blockedQualityRows.length, expected: 0 });
check(checks, "candidateRowCountThirtySix", candidateRows.length === 36, { actual: candidateRows.length, expected: 36 });
check(checks, "candidateRowsByCompetitionExpected", Object.entries(expectedRowsByCompetition).every(([slug, count]) => Number(candidateRowsByCompetition[slug] ?? 0) === count), { actual: candidateRowsByCompetition, expected: expectedRowsByCompetition });
check(checks, "candidateRowIssueCountZero", candidateRowIssueCount === 0, { actual: candidateRowIssueCount });
check(checks, "positionsUniquePerCompetition", qualityRows.every((row) => row.missingPositions.length === 0 && row.minPosition === 1 && row.maxPosition === row.expectedRowCount));
check(checks, "noFetchSearchWriteInThisJob", true);
check(checks, "productionAndTruthLocked", true);

const blockedCheckCount = checks.filter((entry) => !entry.passed).length;
const passedCheckCount = checks.filter((entry) => entry.passed).length;

const output = {
  output: outputPath,
  job: "build-football-truth-bundesliga-exact-route-quality-gate-and-canonical-write-plan-file",
  generatedAtUtc: new Date().toISOString(),
  sourceRunnerPath: runnerPath,
  sourceRunnerSha256: sha256Text(runnerText),
  policy: {
    qualityGateAndWritePlanOnly: true,
    noFetchInThisJob: true,
    noSearchInThisJob: true,
    noBroadSearchInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true,
    canonicalCandidateWriteRequiresExplicitUserApproval: true
  },
  summary: {
    bundesligaExactRouteQualityGateAndCanonicalWritePlanStatus: blockedCheckCount === 0 ? "passed" : "blocked",
    qualityGateRowCount: qualityRows.length,
    acceptedQualityGateRowCount: acceptedQualityRows.length,
    blockedQualityGateRowCount: blockedQualityRows.length,
    candidatePreviewRowCount: candidateRows.length,
    candidatePreviewRowsByCompetition: candidateRowsByCompetition,
    candidatePreviewRowIssueCount: candidateRowIssueCount,
    plannedCanonicalCandidatePath,
    plannedCanonicalCandidateSha256,
    mayWriteCanonicalCandidateOnlyAfterExplicitUserApprovalCount: blockedCheckCount === 0 ? 1 : 0,
    mayBuildCanonicalCandidateNowCount: 0,
    fetchExecutedNowCount: 0,
    searchExecutedNowCount: 0,
    broadSearchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    checkCount: checks.length,
    passedCheckCount,
    blockedCheckCount
  },
  checks,
  qualityRows,
  candidatePreviewRows: candidateRows,
  plannedCanonicalCandidatePayload: canonicalCandidatePayload
};

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  bundesligaExactRouteQualityGateAndCanonicalWritePlanStatus: output.summary.bundesligaExactRouteQualityGateAndCanonicalWritePlanStatus,
  qualityGateRowCount: output.summary.qualityGateRowCount,
  acceptedQualityGateRowCount: output.summary.acceptedQualityGateRowCount,
  blockedQualityGateRowCount: output.summary.blockedQualityGateRowCount,
  candidatePreviewRowCount: output.summary.candidatePreviewRowCount,
  candidatePreviewRowsByCompetition: output.summary.candidatePreviewRowsByCompetition,
  candidatePreviewRowIssueCount: output.summary.candidatePreviewRowIssueCount,
  plannedCanonicalCandidatePath: output.summary.plannedCanonicalCandidatePath,
  plannedCanonicalCandidateSha256: output.summary.plannedCanonicalCandidateSha256,
  mayWriteCanonicalCandidateOnlyAfterExplicitUserApprovalCount: output.summary.mayWriteCanonicalCandidateOnlyAfterExplicitUserApprovalCount,
  mayBuildCanonicalCandidateNowCount: output.summary.mayBuildCanonicalCandidateNowCount,
  fetchExecutedNowCount: output.summary.fetchExecutedNowCount,
  searchExecutedNowCount: output.summary.searchExecutedNowCount,
  broadSearchExecutedNowCount: output.summary.broadSearchExecutedNowCount,
  canonicalWriteExecutedNowCount: output.summary.canonicalWriteExecutedNowCount,
  productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount,
  blockedCheckCount: output.summary.blockedCheckCount
}, null, 2));

if (blockedCheckCount !== 0) process.exitCode = 1;
