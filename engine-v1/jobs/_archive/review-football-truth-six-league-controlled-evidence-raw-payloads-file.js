import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const executionDiagnosticPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "six-league-controlled-evidence-acquisition-execution-runner-2026-06-15",
  "six-league-controlled-evidence-acquisition-execution-runner-2026-06-15.json"
);

const rawPayloadDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "six-league-controlled-evidence-acquisition-execution-runner-2026-06-15",
  "raw-payloads"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "six-league-controlled-evidence-raw-payload-review-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "six-league-controlled-evidence-raw-payload-review-2026-06-15.json"
);

const competitionConfig = {
  "esp.1": { family: "laliga", expectedAreas: ["next_active_restart_date"] },
  "esp.2": { family: "laliga", expectedAreas: ["next_active_restart_date"] },
  "nor.1": { family: "norway_ntf", expectedAreas: ["standings_statistics", "fixtures_results", "season_state", "next_active_restart_date"] },
  "nor.2": { family: "norway_ntf", expectedAreas: ["standings_statistics", "fixtures_results", "season_state", "next_active_restart_date"] },
  "swe.1": { family: "sportomedia", expectedAreas: ["standings_statistics", "fixtures_results", "season_state", "next_active_restart_date"] },
  "swe.2": { family: "sportomedia", expectedAreas: ["standings_statistics", "fixtures_results", "season_state", "next_active_restart_date"] }
};

function readJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`Missing required input file: ${filePath}`);
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

function assertExecutionGuardrails(input) {
  const s = input.summary || {};

  if (
    s.fetchAttemptCount !== 10 ||
    s.fetchOkCount !== 10 ||
    s.httpOkCount !== 10 ||
    s.rawPayloadPersistedCount !== 10
  ) {
    throw new Error("Expected previous execution diagnostic to contain 10 successful persisted raw payloads");
  }

  [
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "seasonStateTruthAssertedCount",
    "sixLeagueControlledEvidenceAcquisitionExecutionRunnerTruthCount",
    "canonicalWrites",
    "maySearchNowCount",
    "mayBroadSearchNowCount",
    "mayClassifySeasonStateNowCount",
    "mayWriteCanonicalNowCount",
    "mayAssertTruthNowCount"
  ].forEach((key) => assertZero(s[key], `summary.${key}`));

  assertZero(input.canonicalWrites, "canonicalWrites");
  assertFalse(input.productionWrite, "productionWrite");
  assertFalse(input.searchProviderUsed, "searchProviderUsed");
  assertFalse(input.broadSearchUsed, "broadSearchUsed");
  assertFalse(input.classifierExecuted, "classifierExecuted");
}

function normalizeWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
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

  return unique(candidates).slice(0, 120);
}

function collectJsonLdBlocks(text) {
  const blocks = [];
  const regex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of text.matchAll(regex)) {
    blocks.push(normalizeWhitespace(match[1]).slice(0, 8000));
  }
  return blocks.slice(0, 20);
}

function structuredPresence(text) {
  return {
    hasNextData: /<script[^>]+id=["']__NEXT_DATA__["']/i.test(text),
    hasNuxtData: /window\.__NUXT__|__NUXT_DATA__/i.test(text),
    hasApolloState: /__APOLLO_STATE__|apolloState|graphql/i.test(text),
    hasJsonLd: /application\/ld\+json/i.test(text)
  };
}

function detectSignals(text) {
  const lower = text.toLowerCase();

  return {
    standings:
      lower.includes("standings") ||
      lower.includes("standing") ||
      lower.includes("tabell") ||
      lower.includes("points") ||
      lower.includes("played"),
    fixturesResults:
      lower.includes("fixture") ||
      lower.includes("fixtures") ||
      lower.includes("terminliste") ||
      lower.includes("matcher") ||
      lower.includes("match") ||
      lower.includes("result") ||
      lower.includes("kamper"),
    seasonState:
      lower.includes("season") ||
      lower.includes("2026") ||
      lower.includes("round") ||
      lower.includes("matchday") ||
      lower.includes("omgång") ||
      lower.includes("runde") ||
      lower.includes("serie"),
    nextActiveRestartDate: collectDateCandidates(text).length > 0
  };
}

function routeBackedAreas(routePurpose) {
  const purpose = String(routePurpose || "").toLowerCase();
  const areas = [];

  if (purpose.includes("standings_statistics")) {
    areas.push("standings_statistics");
  }

  if (purpose.includes("fixtures_results")) {
    areas.push("fixtures_results");
  }

  if (purpose.includes("season_state")) {
    areas.push("season_state");
  }

  if (purpose.includes("next_active_restart_date")) {
    areas.push("next_active_restart_date");
  }

  return unique(areas);
}

function signalBackedAreas(signals) {
  const areas = [];
  if (signals.standings) areas.push("standings_statistics");
  if (signals.fixturesResults) areas.push("fixtures_results");
  if (signals.seasonState) areas.push("season_state");
  if (signals.nextActiveRestartDate) areas.push("next_active_restart_date");
  return unique(areas);
}

function parseRawPayloadFilename(name) {
  const base = name.replace(/\.txt$/i, "");
  const withoutIndex = base.replace(/^[0-9]+-/, "");
  const parts = withoutIndex.split("-");
  const competitionSlug = parts[0];
  const routePurpose = parts.slice(1).join("-").replace(/-/g, "_");
  return { competitionSlug, routePurpose };
}

function snippetAround(text, needles) {
  const lower = text.toLowerCase();
  let index = -1;

  for (const needle of needles) {
    const found = lower.indexOf(String(needle).toLowerCase());
    if (found >= 0 && (index < 0 || found < index)) index = found;
  }

  if (index < 0) index = 0;

  return normalizeWhitespace(text.slice(Math.max(0, index - 500), Math.min(text.length, index + 1500))).slice(0, 4000);
}

const executionDiagnostic = readJson(executionDiagnosticPath);
assertExecutionGuardrails(executionDiagnostic);

if (!fs.existsSync(rawPayloadDir)) {
  throw new Error(`Missing raw payload directory: ${rawPayloadDir}`);
}

const rawFiles = fs.readdirSync(rawPayloadDir).filter((name) => name.endsWith(".txt")).sort();

if (rawFiles.length !== 10) {
  throw new Error(`Expected 10 raw payload files, got ${rawFiles.length}`);
}

const reviewRows = rawFiles.map((name, index) => {
  const filePath = path.join(rawPayloadDir, name);
  const text = fs.readFileSync(filePath, "utf8");
  const parsed = parseRawPayloadFilename(name);
  const config = competitionConfig[parsed.competitionSlug];

  if (!config) throw new Error(`Unknown competition slug from raw payload filename: ${name}`);

  const signals = detectSignals(text);
  const routeAreas = routeBackedAreas(parsed.routePurpose);
  const signalAreas = signalBackedAreas(signals);
  const candidateAreas = unique([...routeAreas, ...signalAreas]).sort();
  const dates = collectDateCandidates(text);
  const presence = structuredPresence(text);
  const jsonLdBlocks = collectJsonLdBlocks(text);

  return {
    reviewRowId: `six_league_raw_payload_review_${String(index + 1).padStart(2, "0")}`,
    rawPayloadFile: path.join(rawPayloadDir, name).replace(/\\/g, "/"),
    rawPayloadFileName: name,
    competitionSlug: parsed.competitionSlug,
    family: config.family,
    routePurpose: parsed.routePurpose,
    expectedAreas: config.expectedAreas,
    responseRawTextLength: text.length,
    routeBackedCandidateAreas: routeAreas,
    signalBackedCandidateAreas: signalAreas,
    candidateAreas,
    signals,
    dateCandidateCount: dates.length,
    dateCandidates: dates.slice(0, 60),
    structuredPresence: presence,
    jsonLdBlockCount: jsonLdBlocks.length,
    jsonLdBlocks: jsonLdBlocks.slice(0, 5),
    extractionReviewStatus:
      routeAreas.length > 0
        ? "route_backed_raw_payload_candidate_ready_for_structured_extraction"
        : "needs_route_or_parser_repair",
    reviewSnippet: snippetAround(text, [
      parsed.competitionSlug,
      "standings",
      "tabell",
      "terminliste",
      "fixtures",
      "matcher",
      "2026"
    ]),
    isCanonicalWritePermissionNow: false,
    isProductionWritePermissionNow: false,
    isTruthAssertionPermissionNow: false
  };
});

function countWhere(rows, predicate) {
  return rows.filter(predicate).length;
}

const competitionRows = Object.keys(competitionConfig).map((slug) => {
  const rows = reviewRows.filter((row) => row.competitionSlug === slug);
  const expectedAreas = competitionConfig[slug].expectedAreas;
  const routeBackedCandidateAreas = unique(rows.flatMap((row) => row.routeBackedCandidateAreas)).sort();
  const signalBackedCandidateAreas = unique(rows.flatMap((row) => row.signalBackedCandidateAreas)).sort();
  const candidateAreas = unique(rows.flatMap((row) => row.candidateAreas)).sort();

  const missingRouteBackedAreas = expectedAreas.filter((area) => !routeBackedCandidateAreas.includes(area));
  const missingSignalBackedAreas = expectedAreas.filter((area) => !signalBackedCandidateAreas.includes(area));

  return {
    competitionSlug: slug,
    family: competitionConfig[slug].family,
    rawPayloadReviewRowCount: rows.length,
    expectedAreas,
    routeBackedCandidateAreas,
    signalBackedCandidateAreas,
    candidateAreas,
    missingRouteBackedAreas,
    missingSignalBackedAreas,
    competitionReviewStatus:
      missingRouteBackedAreas.length === 0
        ? "all_expected_areas_have_route_backed_raw_payload_candidates_needs_structured_extraction"
        : "missing_route_backed_expected_area_candidates_needs_route_repair",
    parserSignalReviewStatus:
      missingSignalBackedAreas.length === 0
        ? "all_expected_areas_have_parser_signals"
        : "some_expected_areas_need_structured_parser_not_plain_text_signal",
    isCanonicalWritePermissionNow: false,
    isProductionWritePermissionNow: false,
    isTruthAssertionPermissionNow: false
  };
});

const summary = {
  sixLeagueControlledEvidenceRawPayloadReviewReadCount: 1,
  sourceExecutionFetchAttemptCount: executionDiagnostic.summary.fetchAttemptCount,
  sourceExecutionRawPayloadPersistedCount: executionDiagnostic.summary.rawPayloadPersistedCount,

  rawPayloadFileCount: rawFiles.length,
  rawPayloadReviewRowCount: reviewRows.length,
  competitionReviewRowCount: competitionRows.length,

  routeBackedRawPayloadCandidateRowCount: countWhere(reviewRows, (row) => row.routeBackedCandidateAreas.length > 0),
  allExpectedAreasHaveRouteBackedRawPayloadCandidatesCompetitionCount: countWhere(
    competitionRows,
    (row) => row.competitionReviewStatus === "all_expected_areas_have_route_backed_raw_payload_candidates_needs_structured_extraction"
  ),
  missingRouteBackedExpectedAreaCandidatesCompetitionCount: countWhere(
    competitionRows,
    (row) => row.competitionReviewStatus === "missing_route_backed_expected_area_candidates_needs_route_repair"
  ),

  allExpectedAreasHaveParserSignalsCompetitionCount: countWhere(
    competitionRows,
    (row) => row.parserSignalReviewStatus === "all_expected_areas_have_parser_signals"
  ),
  structuredParserNeededCompetitionCount: countWhere(
    competitionRows,
    (row) => row.parserSignalReviewStatus === "some_expected_areas_need_structured_parser_not_plain_text_signal"
  ),

  mayBuildSixLeagueStructuredEvidenceExtractionPlanCount: 1,

  rawPayloadReviewIsExecutionPermissionNowCount: 0,
  rawPayloadReviewIsFetchPermissionNowCount: 0,
  rawPayloadReviewIsSearchPermissionNowCount: 0,
  rawPayloadReviewIsBroadSearchPermissionNowCount: 0,
  rawPayloadReviewIsClassifierPermissionNowCount: 0,
  rawPayloadReviewIsCanonicalWritePermissionNowCount: 0,
  rawPayloadReviewIsProductionWritePermissionNowCount: 0,
  rawPayloadReviewIsTruthAssertionPermissionNowCount: 0,

  fetchExecutedNowCount: 0,
  searchExecutedNowCount: 0,
  broadSearchExecutedNowCount: 0,
  classifierExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  seasonStateTruthAssertedCount: 0,
  sixLeagueControlledEvidenceRawPayloadReviewTruthCount: 0,
  canonicalWrites: 0,
  productionWrite: false
};

const artifact = {
  job: "review-football-truth-six-league-controlled-evidence-raw-payloads-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_route_backed_raw_payload_review_artifact",
  dryRun: true,
  inputs: {
    controlledExecutionDiagnostic: executionDiagnosticPath,
    rawPayloadDir
  },
  policy: {
    rawPayloadReviewOnly: true,
    routeBackedCandidateAreasAreNotTruthAssertions: true,
    plainTextSignalsAreOnlyParserHints: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  summary,
  reviewRows,
  competitionRows,
  blockedRows: [],
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
