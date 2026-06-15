import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const inputPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "six-league-structured-evidence-candidates-2026-06-15",
  "six-league-structured-evidence-candidates-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "six-league-structured-evidence-validation-gate-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "six-league-structured-evidence-validation-gate-2026-06-15.json"
);

const expectedCounts = {
  structuredEvidenceCandidateCount: 18,
  competitionStructuredEvidenceCandidateRowCount: 6,
  laligaStructuredEvidenceCandidateCount: 2,
  norwayNtfStructuredEvidenceCandidateCount: 8,
  sportomediaStructuredEvidenceCandidateCount: 8,
  standingsStatisticsStructuredEvidenceCandidateCount: 4,
  fixturesResultsStructuredEvidenceCandidateCount: 4,
  seasonStateStructuredEvidenceCandidateCount: 4,
  nextActiveRestartDateStructuredEvidenceCandidateCount: 6
};

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required input file: ${filePath}`);
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertZero(value, name) {
  if (value !== undefined && value !== null && value !== 0) {
    throw new Error(`Expected ${name}=0, got ${value}`);
  }
}

function assertFalse(value, name) {
  if (value !== undefined && value !== null && value !== false) {
    throw new Error(`Expected ${name}=false, got ${value}`);
  }
}

function assertInputGuardrails(input) {
  const s = input.summary || {};

  [
    "structuredExtractionIsExecutionPermissionNowCount",
    "structuredExtractionIsFetchPermissionNowCount",
    "structuredExtractionIsSearchPermissionNowCount",
    "structuredExtractionIsBroadSearchPermissionNowCount",
    "structuredExtractionIsClassifierPermissionNowCount",
    "structuredExtractionIsCanonicalWritePermissionNowCount",
    "structuredExtractionIsProductionWritePermissionNowCount",
    "structuredExtractionIsTruthAssertionPermissionNowCount",
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "seasonStateTruthAssertedCount",
    "sixLeagueStructuredEvidenceCandidatesTruthCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `summary.${key}`));

  assertZero(input.canonicalWrites, "canonicalWrites");
  assertFalse(input.productionWrite, "productionWrite");
  assertFalse(input.sourceFetch?.executed, "sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "searchProviderUsed");
  assertFalse(input.broadSearchUsed, "broadSearchUsed");
  assertFalse(input.classifierExecuted, "classifierExecuted");
}

function countWhere(rows, predicate) {
  return rows.filter(predicate).length;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function validateCandidate(candidate) {
  const failures = [];

  if (!candidate.structuredEvidenceCandidateId) failures.push("missing_candidate_id");
  if (!candidate.competitionSlug) failures.push("missing_competition_slug");
  if (!candidate.family) failures.push("missing_family");
  if (!candidate.evidenceArea) failures.push("missing_evidence_area");
  if (!candidate.sourceRawPayloadFile) failures.push("missing_source_raw_payload_file");
  if (!candidate.sourceRoutePurpose) failures.push("missing_source_route_purpose");
  if (candidate.routeBackedCandidate !== true) failures.push("not_route_backed_candidate");

  if (!fs.existsSync(candidate.sourceRawPayloadFile)) {
    failures.push("source_raw_payload_file_missing_on_disk");
  }

  if (Number(candidate.responseRawTextLength || 0) <= 0) {
    failures.push("empty_or_missing_raw_text_length");
  }

  if (candidate.candidateStatus !== "structured_evidence_candidate_needs_validation_before_any_truth_promotion") {
    failures.push(`unexpected_candidate_status:${candidate.candidateStatus}`);
  }

  if (candidate.isCanonicalWritePermissionNow !== false) failures.push("canonical_write_permission_not_false");
  if (candidate.isProductionWritePermissionNow !== false) failures.push("production_write_permission_not_false");
  if (candidate.isTruthAssertionPermissionNow !== false) failures.push("truth_assertion_permission_not_false");

  const evidenceArea = String(candidate.evidenceArea || "");
  const routePurpose = String(candidate.sourceRoutePurpose || "");

  if (evidenceArea === "standings_statistics" && !routePurpose.includes("standings_statistics")) {
    failures.push("standings_candidate_not_backed_by_standings_route");
  }

  if (evidenceArea === "fixtures_results" && !routePurpose.includes("fixtures_results")) {
    failures.push("fixtures_candidate_not_backed_by_fixtures_route");
  }

  if (evidenceArea === "season_state" && !routePurpose.includes("season_state")) {
    failures.push("season_state_candidate_not_backed_by_season_state_route");
  }

  if (evidenceArea === "next_active_restart_date" && !routePurpose.includes("next_active_restart_date")) {
    failures.push("restart_date_candidate_not_backed_by_restart_route");
  }

  if (
    ["fixtures_results", "season_state", "next_active_restart_date"].includes(evidenceArea) &&
    Number(candidate.dateCandidateCount || 0) <= 0
  ) {
    failures.push("date_sensitive_candidate_has_no_date_candidates");
  }

  return failures;
}

const input = readJson(inputPath);
assertInputGuardrails(input);

const candidates = Array.isArray(input.structuredEvidenceCandidates)
  ? input.structuredEvidenceCandidates
  : [];

const competitionCandidateRows = Array.isArray(input.competitionCandidateRows)
  ? input.competitionCandidateRows
  : [];

for (const [key, expected] of Object.entries(expectedCounts)) {
  const actual = input.summary?.[key];

  if (actual !== expected) {
    throw new Error(`Expected summary.${key}=${expected}, got ${actual}`);
  }
}

if (input.summary?.blockedStructuredEvidenceCandidateCount !== 0) {
  throw new Error("Expected blockedStructuredEvidenceCandidateCount=0");
}

if (input.summary?.allExpectedStructuredEvidenceCandidatesBuiltCompetitionCount !== 6) {
  throw new Error("Expected all 6 competitions to have structured evidence candidates");
}

if (candidates.length !== 18) {
  throw new Error(`Expected 18 structured evidence candidates, got ${candidates.length}`);
}

if (competitionCandidateRows.length !== 6) {
  throw new Error(`Expected 6 competition candidate rows, got ${competitionCandidateRows.length}`);
}

const validationRows = candidates.map((candidate, index) => {
  const failures = validateCandidate(candidate);

  return {
    validationRowId: `six_league_structured_evidence_validation_${String(index + 1).padStart(2, "0")}`,
    structuredEvidenceCandidateId: candidate.structuredEvidenceCandidateId,
    competitionSlug: candidate.competitionSlug,
    family: candidate.family,
    evidenceArea: candidate.evidenceArea,
    sourceRawPayloadFile: candidate.sourceRawPayloadFile,
    sourceRoutePurpose: candidate.sourceRoutePurpose,
    routeBackedCandidate: candidate.routeBackedCandidate,
    parserSignalBackedCandidate: candidate.parserSignalBackedCandidate,
    dateCandidateCount: candidate.dateCandidateCount,
    structuredScriptHintCount: candidate.structuredScriptHintCount,
    validationStatus:
      failures.length === 0
        ? "approved_for_controlled_promotion_candidate_path"
        : "blocked_from_controlled_promotion_candidate_path",
    failures,
    isCanonicalWritePermissionNow: false,
    isProductionWritePermissionNow: false,
    isTruthAssertionPermissionNow: false
  };
});

const approvedRows = validationRows.filter((row) => row.failures.length === 0);
const blockedRows = validationRows.filter((row) => row.failures.length > 0);

const competitionValidationRows = competitionCandidateRows.map((row) => {
  const rows = validationRows.filter((validationRow) => validationRow.competitionSlug === row.competitionSlug);
  const approvedEvidenceAreas = unique(
    rows
      .filter((validationRow) => validationRow.validationStatus === "approved_for_controlled_promotion_candidate_path")
      .map((validationRow) => validationRow.evidenceArea)
  ).sort();

  const expectedAreas = Array.isArray(row.expectedAreas) ? row.expectedAreas : [];
  const missingApprovedEvidenceAreas = expectedAreas.filter((area) => !approvedEvidenceAreas.includes(area));

  return {
    competitionSlug: row.competitionSlug,
    expectedAreas,
    approvedEvidenceAreas,
    missingApprovedEvidenceAreas,
    validationRowCount: rows.length,
    competitionValidationStatus:
      missingApprovedEvidenceAreas.length === 0
        ? "all_expected_evidence_areas_approved_for_controlled_promotion_candidate_path"
        : "missing_approved_evidence_areas",
    isCanonicalWritePermissionNow: false,
    isProductionWritePermissionNow: false,
    isTruthAssertionPermissionNow: false
  };
});

const summary = {
  sixLeagueStructuredEvidenceValidationGateReadCount: 1,
  sourceStructuredEvidenceCandidateCount: candidates.length,
  sourceCompetitionCandidateRowCount: competitionCandidateRows.length,

  validationRowCount: validationRows.length,
  approvedStructuredEvidenceCandidateCount: approvedRows.length,
  blockedStructuredEvidenceCandidateCount: blockedRows.length,

  approvedLaligaStructuredEvidenceCandidateCount: countWhere(approvedRows, (row) => row.family === "laliga"),
  approvedNorwayNtfStructuredEvidenceCandidateCount: countWhere(approvedRows, (row) => row.family === "norway_ntf"),
  approvedSportomediaStructuredEvidenceCandidateCount: countWhere(approvedRows, (row) => row.family === "sportomedia"),

  approvedStandingsStatisticsCandidateCount: countWhere(approvedRows, (row) => row.evidenceArea === "standings_statistics"),
  approvedFixturesResultsCandidateCount: countWhere(approvedRows, (row) => row.evidenceArea === "fixtures_results"),
  approvedSeasonStateCandidateCount: countWhere(approvedRows, (row) => row.evidenceArea === "season_state"),
  approvedNextActiveRestartDateCandidateCount: countWhere(approvedRows, (row) => row.evidenceArea === "next_active_restart_date"),

  competitionValidationRowCount: competitionValidationRows.length,
  allExpectedEvidenceAreasApprovedCompetitionCount: countWhere(
    competitionValidationRows,
    (row) => row.competitionValidationStatus === "all_expected_evidence_areas_approved_for_controlled_promotion_candidate_path"
  ),
  missingApprovedEvidenceAreasCompetitionCount: countWhere(
    competitionValidationRows,
    (row) => row.competitionValidationStatus === "missing_approved_evidence_areas"
  ),

  mayBuildSixLeagueControlledPromotionCandidatePlanCount: blockedRows.length === 0 ? 1 : 0,

  validationGateIsExecutionPermissionNowCount: 0,
  validationGateIsFetchPermissionNowCount: 0,
  validationGateIsSearchPermissionNowCount: 0,
  validationGateIsBroadSearchPermissionNowCount: 0,
  validationGateIsClassifierPermissionNowCount: 0,
  validationGateIsCanonicalWritePermissionNowCount: 0,
  validationGateIsProductionWritePermissionNowCount: 0,
  validationGateIsTruthAssertionPermissionNowCount: 0,

  fetchExecutedNowCount: 0,
  searchExecutedNowCount: 0,
  broadSearchExecutedNowCount: 0,
  classifierExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  seasonStateTruthAssertedCount: 0,
  sixLeagueStructuredEvidenceValidationGateTruthCount: 0,
  canonicalWrites: 0,
  productionWrite: false
};

const artifact = {
  job: "run-football-truth-six-league-structured-evidence-validation-gate-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_structured_evidence_validation_gate_artifact",
  dryRun: true,
  inputs: {
    sixLeagueStructuredEvidenceCandidates: inputPath
  },
  policy: {
    validationGateOnly: true,
    validationDoesNotPromoteTruth: true,
    controlledPromotionCandidatePlanRequiredBeforeAnyCanonicalWrite: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  summary,
  validationRows,
  competitionValidationRows,
  blockedRows,
  sourceFetch: { allowed: false, executed: false },
  searchProviderUsed: false,
  broadSearchUsed: false,
  classifierExecuted: false,
  canonicalWrites: 0,
  productionWrite: false
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

console.log(JSON.stringify({ output: outputPath, ...summary }, null, 2));

if (blockedRows.length > 0) {
  throw new Error(`Validation gate blocked ${blockedRows.length} candidates`);
}
