import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const probePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "whole-map-official-host-direct-route-probe-wave-01-2026-06-16",
  "whole-map-official-host-direct-route-probe-wave-01-2026-06-16.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "whole-map-official-route-parser-extraction-board-wave-01-2026-06-16"
);

const outputPath = path.join(
  outputDir,
  "whole-map-official-route-parser-extraction-board-wave-01-2026-06-16.json"
);

const expectedRowsBySlug = {
  "ger.3": 20,
  "eng.1": 20,
  "eng.2": 24,
  "eng.3": 24,
  "eng.4": 24,
  "eng.5": 24,
  "fra.1": 18,
  "fra.2": 18,
  "ita.1": 20,
  "ita.2": 20,
  "ned.1": 18,
  "ned.2": 20,
  "bel.1": 16,
  "bel.2": 16,
  "den.1": 12,
  "den.2": 12,
  "sui.1": 12,
  "sui.2": 10,
  "aut.1": 12,
  "aut.2": 16,
  "fin.1": 12,
  "fin.2": 10,
  "irl.1": 10,
  "irl.2": 10
};

function sha256Text(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function stripTags(value) {
  return String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function parseHtmlRows(text) {
  const rows = [];
  const trMatches = [...String(text).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)];

  for (const tr of trMatches) {
    const cells = [...tr[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)]
      .map((match) => stripTags(match[1]))
      .filter(Boolean);
    if (cells.length >= 3) rows.push(cells);
  }

  return rows;
}

function cleanJsonCandidateText(value) {
  return String(value ?? "")
    .replace(/\\u002F/g, "/")
    .replace(/\\u003C/g, "<")
    .replace(/\\u003E/g, ">")
    .replace(/\\u0026/g, "&")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
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

function parseIntLoose(value) {
  const text = String(value ?? "").trim().replace(/^\+/, "");
  if (!/^-?\d+$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function numericTokenCount(cells) {
  return cells.filter((cell) => /(^|\s)[+-]?\d+(\s|$)/.test(String(cell))).length;
}

function looksLikeStandingRow(cells) {
  if (!Array.isArray(cells) || cells.length < 4) return false;
  const joined = cells.join(" ");
  const hasPosition = parseIntLoose(cells[0]) !== null || /^\d+/.test(joined);
  const hasTeamLike = cells.some((cell) => /[A-Za-zÀ-ÿ]/.test(cell) && cell.length >= 2);
  const hasSeveralNumbers = numericTokenCount(cells) >= 3 || /\d+\s*[-:]\s*\d+/.test(joined);
  return hasPosition && hasTeamLike && hasSeveralNumbers;
}

function extractTableCandidateRows(htmlRows) {
  return htmlRows
    .filter(looksLikeStandingRow)
    .map((cells, index) => ({
      rowIndex: index + 1,
      cells,
      cellCount: cells.length
    }));
}

function jsonMarkerCounts(text) {
  const cleaned = cleanJsonCandidateText(text);
  const markers = [
    "__NEXT_DATA__",
    "__NUXT__",
    "standings",
    "table",
    "ranking",
    "classement",
    "klassement",
    "tabelle",
    "sarjataulukko",
    "teamName",
    "clubName",
    "shortName",
    "position",
    "rank",
    "points",
    "played",
    "wins",
    "draws",
    "losses",
    "goalsFor",
    "goalsAgainst",
    "goalDifference"
  ];

  const lower = cleaned.toLowerCase();
  return Object.fromEntries(markers.map((marker) => {
    const needle = marker.toLowerCase();
    return [marker, lower.split(needle).length - 1];
  }));
}

function extractScriptContexts(text) {
  const contexts = [];
  const scriptMatches = [...String(text).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const [index, match] of scriptMatches.entries()) {
    const body = cleanJsonCandidateText(match[1]);
    const lower = body.toLowerCase();
    const score = [
      lower.includes("standings"),
      lower.includes("table"),
      lower.includes("ranking"),
      lower.includes("tabelle"),
      lower.includes("team"),
      lower.includes("club"),
      lower.includes("points"),
      lower.includes("position"),
      lower.includes("rank")
    ].filter(Boolean).length;

    if (score >= 2) {
      contexts.push({
        scriptIndex: index + 1,
        score,
        length: body.length,
        first600: body.slice(0, 600).replace(/\s+/g, " ")
      });
    }
  }
  return contexts.slice(0, 10);
}

function classifyParserLane(row, responseText) {
  const htmlRows = parseHtmlRows(responseText);
  const tableCandidateRows = extractTableCandidateRows(htmlRows);
  const markers = jsonMarkerCounts(responseText);
  const scriptContexts = extractScriptContexts(responseText);
  const expectedRows = expectedRowsBySlug[row.competitionSlug] ?? row.expectedStandingRowCount ?? null;

  const resultIsStrong = row.resultStatus === "accepted_official_route_candidate_strong_signal_requires_parser";
  const resultIsWeak = row.resultStatus === "review_official_route_candidate_weak_signal";
  const hasExactExpectedTableCandidates = expectedRows !== null && tableCandidateRows.length === expectedRows;
  const hasNearExpectedTableCandidates = expectedRows !== null && tableCandidateRows.length >= Math.max(1, expectedRows - 2) && tableCandidateRows.length <= expectedRows + 6;
  const hasManyTableCandidates = expectedRows !== null && tableCandidateRows.length > expectedRows + 6;
  const hasJsonSignals =
    markers.standings > 0 ||
    markers.ranking > 0 ||
    markers.tabelle > 0 ||
    markers.teamName > 0 ||
    markers.clubName > 0 ||
    markers.points > 0 ||
    scriptContexts.length > 0;

  let parserLane = "blocked_no_parser_signal";
  let confidence = "none";

  if (resultIsStrong && hasExactExpectedTableCandidates) {
    parserLane = "runner_ready_generic_html_table_exact_expected_rows";
    confidence = "high";
  } else if (resultIsStrong && hasNearExpectedTableCandidates) {
    parserLane = "runner_ready_html_table_near_expected_rows_needs_filter";
    confidence = "medium";
  } else if (resultIsStrong && hasManyTableCandidates) {
    parserLane = "runner_ready_provider_specific_html_table_filter";
    confidence = "medium";
  } else if (resultIsStrong && hasJsonSignals) {
    parserLane = "runner_ready_embedded_json_or_app_state_parser";
    confidence = "medium";
  } else if (resultIsStrong) {
    parserLane = "official_route_shell_requires_js_runtime_or_network_contract_probe";
    confidence = "low";
  } else if (resultIsWeak && (hasJsonSignals || tableCandidateRows.length > 0)) {
    parserLane = "weak_route_review_before_parser_runner";
    confidence = "low";
  } else if (resultIsWeak) {
    parserLane = "weak_route_needs_route_repair";
    confidence = "low";
  } else if (row.httpStatus === 200) {
    parserLane = "fetched_2xx_no_parser_signal_needs_route_repair";
    confidence = "low";
  } else {
    parserLane = "route_unusable_needs_route_repair";
    confidence = "none";
  }

  return {
    parserLane,
    parserConfidence: confidence,
    expectedRows,
    htmlTableRowCount: htmlRows.length,
    tableCandidateRowCount: tableCandidateRows.length,
    hasExactExpectedTableCandidates,
    hasNearExpectedTableCandidates,
    hasManyTableCandidates,
    jsonMarkerCounts: markers,
    scriptContextCount: scriptContexts.length,
    scriptContexts,
    sampleTableCandidateRows: tableCandidateRows.slice(0, 5)
  };
}

function check(checks, name, passed, details = {}) {
  checks.push({ name, passed: Boolean(passed), ...details });
}

if (!fs.existsSync(probePath)) {
  throw new Error(`Missing direct-route probe output: ${probePath}`);
}

const probeText = fs.readFileSync(probePath, "utf8");
const probe = JSON.parse(probeText);
const resultRows = Array.isArray(probe.resultRows) ? probe.resultRows : [];
const bestRouteRows = Array.isArray(probe.bestRouteRows) ? probe.bestRouteRows : [];

const relevantRows = resultRows.filter((row) =>
  row.resultStatus === "accepted_official_route_candidate_strong_signal_requires_parser" ||
  row.resultStatus === "review_official_route_candidate_weak_signal" ||
  (row.httpStatus >= 200 && row.httpStatus < 300)
);

const parserRows = [];

for (const row of relevantRows) {
  let responseText = "";
  let responseSha256 = null;

  if (row.outputFile && fs.existsSync(row.outputFile)) {
    responseText = fs.readFileSync(row.outputFile, "utf8");
    responseSha256 = sha256Text(responseText);
  }

  const lane = classifyParserLane(row, responseText);

  parserRows.push({
    competitionSlug: row.competitionSlug,
    competitionLabel: row.competitionLabel,
    countryCode: row.countryCode,
    providerSignalClass: row.providerSignalClass,
    sourceUrl: row.url,
    finalUrl: row.finalUrl,
    httpStatus: row.httpStatus,
    resultStatus: row.resultStatus,
    outputFile: row.outputFile,
    outputSha256: responseSha256,
    outputSize: row.outputSize,
    routeSignalScore: row.inspection?.routeSignalScore ?? null,
    title: row.inspection?.title ?? null,
    ...lane,
    nextAllowedAction: {
      mayBuildBulkGenericHtmlTableExtractor:
        lane.parserLane === "runner_ready_generic_html_table_exact_expected_rows" ||
        lane.parserLane === "runner_ready_html_table_near_expected_rows_needs_filter",
      mayBuildProviderSpecificHtmlTableFilter:
        lane.parserLane === "runner_ready_provider_specific_html_table_filter",
      mayBuildEmbeddedJsonOrAppStateParser:
        lane.parserLane === "runner_ready_embedded_json_or_app_state_parser",
      mayBuildJsRuntimeOrNetworkContractProbe:
        lane.parserLane === "official_route_shell_requires_js_runtime_or_network_contract_probe",
      mayBuildRouteRepairPlan:
        lane.parserLane.includes("route_repair") || lane.parserLane === "route_unusable_needs_route_repair",
      mayWriteCanonicalNow: false,
      mayWriteProductionNow: false,
      mayAssertTruthNow: false
    }
  });
}

const bestParserRows = [];
for (const best of bestRouteRows) {
  const rows = parserRows.filter((row) => row.competitionSlug === best.competitionSlug);
  if (rows.length === 0) {
    bestParserRows.push({
      competitionSlug: best.competitionSlug,
      parserLane: "no_relevant_fetched_parser_row",
      parserConfidence: "none",
      sourceUrl: best.url,
      finalUrl: best.finalUrl,
      httpStatus: best.httpStatus,
      resultStatus: best.bestResultStatus,
      nextAllowedAction: {
        mayBuildRouteRepairPlan: true,
        mayWriteCanonicalNow: false,
        mayWriteProductionNow: false,
        mayAssertTruthNow: false
      }
    });
    continue;
  }

  const sorted = rows.slice().sort((a, b) => {
    const rank = {
      runner_ready_generic_html_table_exact_expected_rows: 100,
      runner_ready_html_table_near_expected_rows_needs_filter: 90,
      runner_ready_provider_specific_html_table_filter: 80,
      runner_ready_embedded_json_or_app_state_parser: 70,
      official_route_shell_requires_js_runtime_or_network_contract_probe: 60,
      weak_route_review_before_parser_runner: 40,
      fetched_2xx_no_parser_signal_needs_route_repair: 20,
      weak_route_needs_route_repair: 10,
      route_unusable_needs_route_repair: 0,
      blocked_no_parser_signal: 0
    };
    const rankA = rank[a.parserLane] ?? 0;
    const rankB = rank[b.parserLane] ?? 0;
    if (rankB !== rankA) return rankB - rankA;
    return (b.routeSignalScore ?? -1) - (a.routeSignalScore ?? -1);
  });

  bestParserRows.push(sorted[0]);
}

const parserRowsByLane = countBy(parserRows, "parserLane");
const bestParserRowsByLane = countBy(bestParserRows, "parserLane");

const runnerReadyCompetitionCount = bestParserRows.filter((row) =>
  row.nextAllowedAction?.mayBuildBulkGenericHtmlTableExtractor ||
  row.nextAllowedAction?.mayBuildProviderSpecificHtmlTableFilter ||
  row.nextAllowedAction?.mayBuildEmbeddedJsonOrAppStateParser
).length;

const shellProbeCompetitionCount = bestParserRows.filter((row) =>
  row.nextAllowedAction?.mayBuildJsRuntimeOrNetworkContractProbe
).length;

const routeRepairCompetitionCount = bestParserRows.filter((row) =>
  row.nextAllowedAction?.mayBuildRouteRepairPlan
).length;

const weakRouteReviewCompetitionCount = bestParserRows.filter((row) =>
  row.parserLane === "weak_route_review_before_parser_runner" ||
  row.parserLane === "weak_route_needs_route_repair"
).length;

const checks = [];
check(checks, "sourceProbePassed", probe.summary?.status === "passed", { actual: probe.summary?.status });
check(checks, "sourceProbeWaveTargetCountTwentyFour", Number(probe.summary?.waveTargetCount ?? -1) === 24, { actual: probe.summary?.waveTargetCount });
check(checks, "sourceProbeNoSearchNoWrite", Number(probe.summary?.searchExecutedNowCount ?? -1) === 0 && Number(probe.summary?.canonicalWriteExecutedNowCount ?? -1) === 0 && Number(probe.summary?.productionWriteExecutedNowCount ?? -1) === 0 && Number(probe.summary?.truthAssertionExecutedNowCount ?? -1) === 0);
check(checks, "parserRowsPresent", parserRows.length >= 20, { actual: parserRows.length });
check(checks, "bestParserRowsTwentyFour", bestParserRows.length === 24, { actual: bestParserRows.length, expected: 24 });
check(checks, "ger3IncludedInBestParserRows", bestParserRows.some((row) => row.competitionSlug === "ger.3"));
check(checks, "runnerReadyOrShellOrRepairOrWeakReviewCoverageAll", runnerReadyCompetitionCount + shellProbeCompetitionCount + routeRepairCompetitionCount + weakRouteReviewCompetitionCount >= 24, { runnerReadyCompetitionCount, shellProbeCompetitionCount, routeRepairCompetitionCount, weakRouteReviewCompetitionCount });
check(checks, "noFetchSearchWriteInThisJob", true);
check(checks, "productionAndTruthLocked", true);

const blockedCheckCount = checks.filter((entry) => !entry.passed).length;
const passedCheckCount = checks.filter((entry) => entry.passed).length;

const output = {
  output: outputPath,
  job: "build-football-truth-whole-map-official-route-parser-extraction-board-wave-01-file",
  generatedAtUtc: new Date().toISOString(),
  sourceProbePath: probePath,
  sourceProbeSha256: sha256Text(probeText),
  policy: {
    parserExtractionBoardOnly: true,
    noFetchInThisJob: true,
    noSearchInThisJob: true,
    noBroadSearchInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true
  },
  summary: {
    wholeMapOfficialRouteParserExtractionBoardStatus: blockedCheckCount === 0 ? "passed" : "blocked",
    sourceWaveTargetCount: probe.summary?.waveTargetCount ?? null,
    sourceRouteCandidateCount: probe.summary?.routeCandidateCount ?? null,
    sourceStrongRouteCandidateCount: probe.summary?.strongOfficialRouteCandidateCount ?? null,
    sourceWeakRouteCandidateCount: probe.summary?.weakOfficialRouteCandidateCount ?? null,
    parserRowCount: parserRows.length,
    parserRowsByLane,
    bestParserCompetitionCount: bestParserRows.length,
    bestParserRowsByLane,
    runnerReadyCompetitionCount,
    shellProbeCompetitionCount,
    routeRepairCompetitionCount,
    weakRouteReviewCompetitionCount,
    mayBuildBulkGenericHtmlTableExtractorCount: bestParserRows.some((row) => row.nextAllowedAction?.mayBuildBulkGenericHtmlTableExtractor) ? 1 : 0,
    mayBuildProviderSpecificHtmlTableFilterCount: bestParserRows.some((row) => row.nextAllowedAction?.mayBuildProviderSpecificHtmlTableFilter) ? 1 : 0,
    mayBuildEmbeddedJsonOrAppStateParserCount: bestParserRows.some((row) => row.nextAllowedAction?.mayBuildEmbeddedJsonOrAppStateParser) ? 1 : 0,
    mayBuildJsRuntimeOrNetworkContractProbeCount: shellProbeCompetitionCount > 0 ? 1 : 0,
    mayBuildRouteRepairPlanCount: routeRepairCompetitionCount > 0 ? 1 : 0,
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
  parserRows,
  bestParserRows
};

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  wholeMapOfficialRouteParserExtractionBoardStatus: output.summary.wholeMapOfficialRouteParserExtractionBoardStatus,
  sourceWaveTargetCount: output.summary.sourceWaveTargetCount,
  sourceRouteCandidateCount: output.summary.sourceRouteCandidateCount,
  sourceStrongRouteCandidateCount: output.summary.sourceStrongRouteCandidateCount,
  sourceWeakRouteCandidateCount: output.summary.sourceWeakRouteCandidateCount,
  parserRowCount: output.summary.parserRowCount,
  parserRowsByLane: output.summary.parserRowsByLane,
  bestParserCompetitionCount: output.summary.bestParserCompetitionCount,
  bestParserRowsByLane: output.summary.bestParserRowsByLane,
  runnerReadyCompetitionCount: output.summary.runnerReadyCompetitionCount,
  shellProbeCompetitionCount: output.summary.shellProbeCompetitionCount,
  routeRepairCompetitionCount: output.summary.routeRepairCompetitionCount,
  weakRouteReviewCompetitionCount: output.summary.weakRouteReviewCompetitionCount,
  mayBuildBulkGenericHtmlTableExtractorCount: output.summary.mayBuildBulkGenericHtmlTableExtractorCount,
  mayBuildProviderSpecificHtmlTableFilterCount: output.summary.mayBuildProviderSpecificHtmlTableFilterCount,
  mayBuildEmbeddedJsonOrAppStateParserCount: output.summary.mayBuildEmbeddedJsonOrAppStateParserCount,
  mayBuildJsRuntimeOrNetworkContractProbeCount: output.summary.mayBuildJsRuntimeOrNetworkContractProbeCount,
  mayBuildRouteRepairPlanCount: output.summary.mayBuildRouteRepairPlanCount,
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
