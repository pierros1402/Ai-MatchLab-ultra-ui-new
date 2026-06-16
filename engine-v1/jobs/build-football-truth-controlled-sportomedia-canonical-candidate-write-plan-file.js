import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const inputPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-sportomedia-standings-extraction-quality-gate-2026-06-16",
  "controlled-sportomedia-standings-extraction-quality-gate-2026-06-16.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-sportomedia-canonical-candidate-write-plan-2026-06-16"
);

const outputPath = path.join(
  outputDir,
  "controlled-sportomedia-canonical-candidate-write-plan-2026-06-16.json"
);

const plannedCanonicalCandidatePath = path.join(
  "data",
  "football-truth",
  "_state",
  "canonical-standings-candidates",
  "sportomedia-sweden-standings-candidates-2026-06-16.json"
);

const expected = {
  "swe.1": { rowCount: 16, label: "Sweden Allsvenskan", league: "allsvenskan", seasonStartYear: 2026 },
  "swe.2": { rowCount: 16, label: "Sweden Superettan", league: "superettan", seasonStartYear: 2026 }
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

function canonicalRows(previewRows) {
  return previewRows
    .map((row) => ({
      competitionSlug: row.competitionSlug,
      competitionLabel: row.competitionLabel,
      providerFamily: "sportomedia",
      sourceKind: "official_sportomedia_graphql_standingsForLeague",
      sourceUrl: row.sourceUrl,
      officialRoute: row.officialRoute,
      seasonStartYear: Number(row.seasonStartYear),
      league: row.league,
      tableType: row.type,
      position: Number(row.position),
      teamId: row.teamId ?? null,
      teamName: row.teamName,
      teamAbbrv: row.teamAbbrv,
      played: Number(row.played),
      wins: Number(row.wins),
      draws: Number(row.draws),
      losses: Number(row.losses),
      goalsFor: Number(row.goalsFor),
      goalsAgainst: Number(row.goalsAgainst),
      goalDifference: Number(row.goalDifference),
      points: Number(row.points),
      borderType: row.borderType ?? null
    }))
    .sort((a, b) => String(a.competitionSlug).localeCompare(String(b.competitionSlug)) || a.position - b.position);
}

function rowIssue(row) {
  const issues = [];
  if (!expected[row.competitionSlug]) issues.push("unexpected_competition_slug");
  if (expected[row.competitionSlug] && row.league !== expected[row.competitionSlug].league) issues.push("league_mismatch");
  if (expected[row.competitionSlug] && Number(row.seasonStartYear) !== expected[row.competitionSlug].seasonStartYear) issues.push("season_mismatch");
  if (!row.teamName) issues.push("missing_team_name");
  if (!Number.isFinite(Number(row.position)) || Number(row.position) < 1) issues.push("invalid_position");
  if (Number(row.played) !== Number(row.wins) + Number(row.draws) + Number(row.losses)) issues.push("record_sum_mismatch");
  if (Number(row.goalDifference) !== Number(row.goalsFor) - Number(row.goalsAgainst)) issues.push("goal_difference_mismatch");
  if (Number(row.points) !== Number(row.wins) * 3 + Number(row.draws)) issues.push("points_formula_mismatch");
  return issues;
}

function check(checks, name, passed, details = {}) {
  checks.push({ name, passed: Boolean(passed), ...details });
}

if (!fs.existsSync(inputPath)) {
  throw new Error(`Missing Sportomedia quality gate output: ${inputPath}`);
}

const inputText = fs.readFileSync(inputPath, "utf8");
const input = JSON.parse(inputText);
const qualityRows = Array.isArray(input.qualityRows) ? input.qualityRows : [];
const previewRows = Array.isArray(input.canonicalCandidatePreviewRows) ? input.canonicalCandidatePreviewRows : [];
const candidateRows = canonicalRows(previewRows);

const rowIssues = candidateRows.map((row, index) => ({
  index,
  competitionSlug: row.competitionSlug,
  position: row.position,
  teamName: row.teamName,
  issues: rowIssue(row)
})).filter((entry) => entry.issues.length > 0);

const rowsByCompetition = countBy(candidateRows, "competitionSlug");
const planRows = Object.entries(expected).map(([competitionSlug, meta]) => {
  const rows = candidateRows.filter((row) => row.competitionSlug === competitionSlug);
  const positions = rows.map((row) => Number(row.position)).sort((a, b) => a - b);
  const expectedPositions = Array.from({ length: meta.rowCount }, (_, index) => index + 1);
  const ready =
    rows.length === meta.rowCount &&
    JSON.stringify(positions) === JSON.stringify(expectedPositions) &&
    rows.every((row) => row.league === meta.league && Number(row.seasonStartYear) === meta.seasonStartYear) &&
    rowIssues.filter((issue) => issue.competitionSlug === competitionSlug).length === 0;

  return {
    competitionSlug,
    competitionLabel: meta.label,
    providerFamily: "sportomedia",
    candidateRowCount: rows.length,
    expectedCandidateRowCount: meta.rowCount,
    positionSequence: positions,
    candidateRowsSha256: sha256Text(JSON.stringify(rows)),
    canonicalCandidateWritePlanStatus: ready
      ? "ready_for_explicitly_approved_canonical_candidate_write"
      : "blocked_candidate_preview_quality_gap",
    plannedCanonicalCandidatePath,
    nextAllowedAction: {
      mayWriteCanonicalCandidateOnlyAfterExplicitUserApproval: ready,
      mayWriteCanonicalNow: false,
      mayWriteProductionNow: false,
      mayAssertTruthNow: false,
      mayFetchNow: false,
      maySearch: false,
      mayBroadSearch: false
    }
  };
});

const readyPlanRows = planRows.filter((row) => row.canonicalCandidateWritePlanStatus === "ready_for_explicitly_approved_canonical_candidate_write");
const blockedPlanRows = planRows.filter((row) => row.canonicalCandidateWritePlanStatus !== "ready_for_explicitly_approved_canonical_candidate_write");

const plannedCanonicalPayload = {
  generatedAtUtc: null,
  source: {
    providerFamily: "sportomedia",
    sourceKind: "official_sportomedia_graphql_standingsForLeague",
    qualityGatePath: inputPath,
    qualityGateSha256: sha256Text(inputText)
  },
  policy: {
    canonicalCandidateOnly: true,
    productionWrite: false,
    truthAssertion: false
  },
  summary: {
    competitionCount: 2,
    totalStandingRowCount: candidateRows.length,
    rowsByCompetition
  },
  rows: candidateRows
};

const plannedCanonicalPayloadSha256 = sha256Text(JSON.stringify(plannedCanonicalPayload));

const checks = [];
check(checks, "sourceQualityGatePassed", input.summary?.controlledSportomediaStandingsExtractionQualityGateStatus === "passed", { actual: input.summary?.controlledSportomediaStandingsExtractionQualityGateStatus });
check(checks, "sourceAcceptedQualityGateRowsTwo", Number(input.summary?.acceptedQualityGateRowCount ?? 0) === 2, { actual: input.summary?.acceptedQualityGateRowCount });
check(checks, "sourceCanonicalPreviewRowsThirtyTwo", Number(input.summary?.totalCanonicalCandidatePreviewRowCount ?? 0) === 32, { actual: input.summary?.totalCanonicalCandidatePreviewRowCount });
check(checks, "candidateRowsThirtyTwo", candidateRows.length === 32, { actual: candidateRows.length, expected: 32 });
check(checks, "candidateRowsByCompetitionExpected", rowsByCompetition["swe.1"] === 16 && rowsByCompetition["swe.2"] === 16, { actual: rowsByCompetition });
check(checks, "candidateRowsNoRowIssues", rowIssues.length === 0, { actual: rowIssues.length });
check(checks, "planRowsExpectedCount", planRows.length === 2, { actual: planRows.length, expected: 2 });
check(checks, "readyPlanRowsExpectedCount", readyPlanRows.length === 2, { actual: readyPlanRows.length, expected: 2 });
check(checks, "blockedPlanRowsExpectedZero", blockedPlanRows.length === 0, { actual: blockedPlanRows.length, expected: 0 });
check(checks, "plannedCanonicalPathIsStateCandidatePath", plannedCanonicalCandidatePath.includes("_state") && plannedCanonicalCandidatePath.includes("canonical-standings-candidates"));
check(checks, "allWritesBlockedNow", planRows.every((row) => row.nextAllowedAction.mayWriteCanonicalNow === false && row.nextAllowedAction.mayWriteProductionNow === false && row.nextAllowedAction.mayAssertTruthNow === false));
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
  job: "build-football-truth-controlled-sportomedia-canonical-candidate-write-plan-file",
  generatedAtUtc: new Date().toISOString(),
  sourcePath: inputPath,
  sourceSha256: sha256Text(inputText),
  policy: {
    planOnly: true,
    noFetchInThisJob: true,
    noSearchInThisJob: true,
    noBroadSearchInThisJob: true,
    noCanonicalWriteInThisJob: true,
    canonicalCandidateWriteRequiresExplicitUserApproval: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true
  },
  plannedCanonicalCandidate: {
    path: plannedCanonicalCandidatePath,
    payloadSha256: plannedCanonicalPayloadSha256,
    rowCount: candidateRows.length,
    rowsByCompetition
  },
  summary: {
    controlledSportomediaCanonicalCandidateWritePlanStatus: blockedCheckCount === 0 ? "passed" : "blocked",
    canonicalCandidateWritePlanRowCount: planRows.length,
    readyCanonicalCandidateWritePlanRowCount: readyPlanRows.length,
    blockedCanonicalCandidateWritePlanRowCount: blockedPlanRows.length,
    candidatePreviewRowCount: candidateRows.length,
    candidatePreviewRowsByCompetition: rowsByCompetition,
    candidatePreviewRowIssueCount: rowIssues.length,
    checkCount: checks.length,
    passedCheckCount,
    blockedCheckCount,
    mayWriteCanonicalCandidateOnlyAfterExplicitUserApprovalCount: readyPlanRows.length === 2 ? 1 : 0,
    mayBuildCanonicalCandidateNowCount: 0,
    fetchExecutedNowCount: 0,
    searchExecutedNowCount: 0,
    broadSearchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0
  },
  checks,
  planRows,
  rowIssues,
  plannedCanonicalPayload
};

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  controlledSportomediaCanonicalCandidateWritePlanStatus: output.summary.controlledSportomediaCanonicalCandidateWritePlanStatus,
  canonicalCandidateWritePlanRowCount: output.summary.canonicalCandidateWritePlanRowCount,
  readyCanonicalCandidateWritePlanRowCount: output.summary.readyCanonicalCandidateWritePlanRowCount,
  blockedCanonicalCandidateWritePlanRowCount: output.summary.blockedCanonicalCandidateWritePlanRowCount,
  candidatePreviewRowCount: output.summary.candidatePreviewRowCount,
  candidatePreviewRowsByCompetition: output.summary.candidatePreviewRowsByCompetition,
  candidatePreviewRowIssueCount: output.summary.candidatePreviewRowIssueCount,
  plannedCanonicalCandidatePath: output.plannedCanonicalCandidate.path,
  plannedCanonicalCandidateSha256: output.plannedCanonicalCandidate.payloadSha256,
  mayWriteCanonicalCandidateOnlyAfterExplicitUserApprovalCount: output.summary.mayWriteCanonicalCandidateOnlyAfterExplicitUserApprovalCount,
  mayBuildCanonicalCandidateNowCount: output.summary.mayBuildCanonicalCandidateNowCount,
  fetchExecutedNowCount: output.summary.fetchExecutedNowCount,
  searchExecutedNowCount: output.summary.searchExecutedNowCount,
  broadSearchExecutedNowCount: output.summary.broadSearchExecutedNowCount,
  canonicalWriteExecutedNowCount: output.summary.canonicalWriteExecutedNowCount,
  productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedCheckCount !== 0) process.exitCode = 1;
