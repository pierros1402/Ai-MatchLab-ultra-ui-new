import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const reviewPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "six-league-controlled-evidence-raw-payload-review-2026-06-15",
  "six-league-controlled-evidence-raw-payload-review-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "six-league-structured-evidence-candidates-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "six-league-structured-evidence-candidates-2026-06-15.json"
);

const expectedCompetitionAreas = {
  "esp.1": ["next_active_restart_date"],
  "esp.2": ["next_active_restart_date"],
  "nor.1": ["standings_statistics", "fixtures_results", "season_state", "next_active_restart_date"],
  "nor.2": ["standings_statistics", "fixtures_results", "season_state", "next_active_restart_date"],
  "swe.1": ["standings_statistics", "fixtures_results", "season_state", "next_active_restart_date"],
  "swe.2": ["standings_statistics", "fixtures_results", "season_state", "next_active_restart_date"]
};

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required input file: ${filePath}`);
  }

  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readText(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing raw payload file: ${filePath}`);
  }

  return fs.readFileSync(filePath, "utf8");
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

function assertReviewGuardrails(review) {
  const s = review.summary || {};

  if (s.rawPayloadFileCount !== 10) {
    throw new Error(`Expected rawPayloadFileCount=10, got ${s.rawPayloadFileCount}`);
  }

  if (s.allExpectedAreasHaveRouteBackedRawPayloadCandidatesCompetitionCount !== 6) {
    throw new Error("Expected 6 competitions with route-backed raw payload candidates");
  }

  if (s.missingRouteBackedExpectedAreaCandidatesCompetitionCount !== 0) {
    throw new Error("Expected 0 missing route-backed expected area candidates");
  }

  [
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "seasonStateTruthAssertedCount",
    "sixLeagueControlledEvidenceRawPayloadReviewTruthCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `summary.${key}`));

  assertZero(review.canonicalWrites, "canonicalWrites");
  assertFalse(review.productionWrite, "productionWrite");
  assertFalse(review.sourceFetch?.executed, "sourceFetch.executed");
  assertFalse(review.searchProviderUsed, "searchProviderUsed");
  assertFalse(review.broadSearchUsed, "broadSearchUsed");
  assertFalse(review.classifierExecuted, "classifierExecuted");
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function collectDateCandidates(text) {
  const candidates = [];
  const patterns = [
    /\b20[2-9][0-9][-/.][0-1]?[0-9][-/.][0-3]?[0-9]\b/g,
    /\b[0-3]?[0-9][-/.][0-1]?[0-9][-/.]20[2-9][0-9]\b/g,
    /\b(?:Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December)\s+[0-3]?[0-9],?\s+20[2-9][0-9]\b/gi,
    /\b[0-3]?[0-9]\s+(?:Jan|January|Feb|February|Mar|March|Apr|April|May|Jun|June|Jul|July|Aug|August|Sep|Sept|September|Oct|October|Nov|November|Dec|December)\s+20[2-9][0-9]\b/gi,
    /\b[0-3]?[0-9]\.\s*(?:jan|feb|mar|apr|mai|jun|jul|aug|sep|okt|nov|des|januar|februar|mars|april|juni|juli|august|september|oktober|november|desember)\b/gi,
    /\b[0-3]?[0-9]\s*(?:jan|feb|mar|apr|maj|jun|jul|aug|sep|okt|nov|dec|januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december)\b/gi
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) candidates.push(match[0]);
  }

  return unique(candidates).slice(0, 150);
}

function collectScriptHints(text) {
  const hints = [];

  const patterns = [
    { type: "next_data", regex: /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i },
    { type: "nuxt_data", regex: /<script[^>]*>([\s\S]{0,2000}(?:__NUXT__|__NUXT_DATA__)[\s\S]{0,12000})<\/script>/i },
    { type: "apollo_or_graphql", regex: /([\s\S]{0,2000}(?:__APOLLO_STATE__|apolloState|graphql|GraphQL)[\s\S]{0,12000})/i },
    { type: "json_ld", regex: /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i }
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern.regex);
    if (match?.[1]) {
      hints.push({
        type: pattern.type,
        textSample: normalizeWhitespace(match[1]).slice(0, 8000)
      });
    }
  }

  return hints;
}

function collectAreaKeywords(text, area) {
  const lower = text.toLowerCase();
  const keywordMap = {
    standings_statistics: ["standings", "standing", "tabell", "points", "played", "wins", "draws", "losses"],
    fixtures_results: ["fixtures", "fixture", "terminliste", "matcher", "match", "result", "kamper"],
    season_state: ["season", "2026", "round", "matchday", "runde", "omgång", "serie"],
    next_active_restart_date: ["2026", "january", "february", "march", "april", "may", "june", "july", "august"]
  };

  return (keywordMap[area] || []).filter((keyword) => lower.includes(keyword));
}

function snippetAroundArea(text, area) {
  const keywordMap = {
    standings_statistics: ["standings", "tabell", "points", "played"],
    fixtures_results: ["fixtures", "terminliste", "matcher", "match"],
    season_state: ["season", "2026", "round", "runde", "omgång"],
    next_active_restart_date: ["2026", "calendar", "terminliste", "matcher"]
  };

  const lower = text.toLowerCase();
  let index = -1;

  for (const keyword of keywordMap[area] || []) {
    const found = lower.indexOf(keyword.toLowerCase());
    if (found >= 0 && (index < 0 || found < index)) index = found;
  }

  if (index < 0) index = 0;

  return normalizeWhitespace(text.slice(Math.max(0, index - 800), Math.min(text.length, index + 2200))).slice(0, 5000);
}

function chooseRawRowsForArea(reviewRows, competitionSlug, area) {
  return reviewRows.filter((row) => {
    if (row.competitionSlug !== competitionSlug) return false;
    const routeAreas = Array.isArray(row.routeBackedCandidateAreas) ? row.routeBackedCandidateAreas : [];
    const candidateAreas = Array.isArray(row.candidateAreas) ? row.candidateAreas : [];
    return routeAreas.includes(area) || candidateAreas.includes(area);
  });
}

function buildCandidate({ competitionSlug, area, row, index }) {
  const rawText = readText(row.rawPayloadFile);
  const dateCandidates = collectDateCandidates(rawText);
  const scriptHints = collectScriptHints(rawText);
  const areaKeywords = collectAreaKeywords(rawText, area);

  return {
    structuredEvidenceCandidateId: `six_league_structured_evidence_candidate_${String(index).padStart(2, "0")}`,
    competitionSlug,
    family: row.family,
    evidenceArea: area,
    sourceRawPayloadFile: row.rawPayloadFile,
    sourceRawPayloadFileName: row.rawPayloadFileName,
    sourceRoutePurpose: row.routePurpose,
    responseRawTextLength: rawText.length,
    routeBackedCandidate: true,
    parserSignalBackedCandidate:
      Array.isArray(row.signalBackedCandidateAreas) && row.signalBackedCandidateAreas.includes(area),
    areaKeywords,
    dateCandidateCount: dateCandidates.length,
    dateCandidates: area === "next_active_restart_date" || area === "fixtures_results" || area === "season_state"
      ? dateCandidates.slice(0, 80)
      : [],
    structuredScriptHintCount: scriptHints.length,
    structuredScriptHints: scriptHints.slice(0, 4),
    evidenceSample: snippetAroundArea(rawText, area),
    extractionConfidence:
      areaKeywords.length > 0 || dateCandidates.length > 0 || scriptHints.length > 0
        ? "medium_route_backed_needs_parser_validation"
        : "low_route_backed_needs_parser_validation",
    candidateStatus: "structured_evidence_candidate_needs_validation_before_any_truth_promotion",
    isCanonicalWritePermissionNow: false,
    isProductionWritePermissionNow: false,
    isTruthAssertionPermissionNow: false
  };
}

const review = readJson(reviewPath);
assertReviewGuardrails(review);

const reviewRows = Array.isArray(review.reviewRows) ? review.reviewRows : [];
const competitionRows = Array.isArray(review.competitionRows) ? review.competitionRows : [];

if (reviewRows.length !== 10) {
  throw new Error(`Expected 10 review rows, got ${reviewRows.length}`);
}

if (competitionRows.length !== 6) {
  throw new Error(`Expected 6 competition rows, got ${competitionRows.length}`);
}

const structuredEvidenceCandidates = [];
const blockedRows = [];

for (const [competitionSlug, expectedAreas] of Object.entries(expectedCompetitionAreas)) {
  for (const area of expectedAreas) {
    const matchingRows = chooseRawRowsForArea(reviewRows, competitionSlug, area);

    if (matchingRows.length === 0) {
      blockedRows.push({
        competitionSlug,
        evidenceArea: area,
        blockReason: "missing_route_backed_raw_payload_for_expected_area"
      });
      continue;
    }

    const preferredRow =
      matchingRows.find((row) => Array.isArray(row.routeBackedCandidateAreas) && row.routeBackedCandidateAreas.includes(area)) ||
      matchingRows[0];

    structuredEvidenceCandidates.push(
      buildCandidate({
        competitionSlug,
        area,
        row: preferredRow,
        index: structuredEvidenceCandidates.length + 1
      })
    );
  }
}

function countWhere(rows, predicate) {
  return rows.filter(predicate).length;
}

const competitionCandidateRows = Object.keys(expectedCompetitionAreas).map((competitionSlug) => {
  const expectedAreas = expectedCompetitionAreas[competitionSlug];
  const candidates = structuredEvidenceCandidates.filter((row) => row.competitionSlug === competitionSlug);
  const candidateAreas = unique(candidates.map((row) => row.evidenceArea)).sort();
  const missingCandidateAreas = expectedAreas.filter((area) => !candidateAreas.includes(area));

  return {
    competitionSlug,
    expectedAreas,
    candidateAreas,
    missingCandidateAreas,
    structuredEvidenceCandidateCount: candidates.length,
    competitionCandidateStatus:
      missingCandidateAreas.length === 0
        ? "all_expected_structured_evidence_candidates_built_needs_validation"
        : "missing_structured_evidence_candidates",
    isCanonicalWritePermissionNow: false,
    isProductionWritePermissionNow: false,
    isTruthAssertionPermissionNow: false
  };
});

const summary = {
  sixLeagueStructuredEvidenceCandidatesReadCount: 1,
  sourceRawPayloadReviewRowCount: reviewRows.length,
  sourceCompetitionReviewRowCount: competitionRows.length,

  structuredEvidenceCandidateCount: structuredEvidenceCandidates.length,
  competitionStructuredEvidenceCandidateRowCount: competitionCandidateRows.length,
  blockedStructuredEvidenceCandidateCount: blockedRows.length,

  laligaStructuredEvidenceCandidateCount: countWhere(structuredEvidenceCandidates, (row) => row.family === "laliga"),
  norwayNtfStructuredEvidenceCandidateCount: countWhere(structuredEvidenceCandidates, (row) => row.family === "norway_ntf"),
  sportomediaStructuredEvidenceCandidateCount: countWhere(structuredEvidenceCandidates, (row) => row.family === "sportomedia"),

  standingsStatisticsStructuredEvidenceCandidateCount: countWhere(structuredEvidenceCandidates, (row) => row.evidenceArea === "standings_statistics"),
  fixturesResultsStructuredEvidenceCandidateCount: countWhere(structuredEvidenceCandidates, (row) => row.evidenceArea === "fixtures_results"),
  seasonStateStructuredEvidenceCandidateCount: countWhere(structuredEvidenceCandidates, (row) => row.evidenceArea === "season_state"),
  nextActiveRestartDateStructuredEvidenceCandidateCount: countWhere(structuredEvidenceCandidates, (row) => row.evidenceArea === "next_active_restart_date"),

  allExpectedStructuredEvidenceCandidatesBuiltCompetitionCount: countWhere(
    competitionCandidateRows,
    (row) => row.competitionCandidateStatus === "all_expected_structured_evidence_candidates_built_needs_validation"
  ),
  missingStructuredEvidenceCandidatesCompetitionCount: countWhere(
    competitionCandidateRows,
    (row) => row.competitionCandidateStatus === "missing_structured_evidence_candidates"
  ),

  mayBuildSixLeagueStructuredEvidenceValidationGateCount: blockedRows.length === 0 ? 1 : 0,

  structuredExtractionIsExecutionPermissionNowCount: 0,
  structuredExtractionIsFetchPermissionNowCount: 0,
  structuredExtractionIsSearchPermissionNowCount: 0,
  structuredExtractionIsBroadSearchPermissionNowCount: 0,
  structuredExtractionIsClassifierPermissionNowCount: 0,
  structuredExtractionIsCanonicalWritePermissionNowCount: 0,
  structuredExtractionIsProductionWritePermissionNowCount: 0,
  structuredExtractionIsTruthAssertionPermissionNowCount: 0,

  fetchExecutedNowCount: 0,
  searchExecutedNowCount: 0,
  broadSearchExecutedNowCount: 0,
  classifierExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  seasonStateTruthAssertedCount: 0,
  sixLeagueStructuredEvidenceCandidatesTruthCount: 0,
  canonicalWrites: 0,
  productionWrite: false
};

const artifact = {
  job: "extract-football-truth-six-league-structured-evidence-candidates-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_structured_evidence_candidate_extraction_artifact",
  dryRun: true,
  inputs: {
    sixLeagueRawPayloadReview: reviewPath
  },
  policy: {
    structuredEvidenceCandidatesAreNotTruthAssertions: true,
    validationGateRequiredBeforePromotion: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  summary,
  structuredEvidenceCandidates,
  competitionCandidateRows,
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
  throw new Error(`Blocked structured evidence candidates: ${blockedRows.length}`);
}
