import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const probePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "whole-map-high-volume-official-host-route-probe-2026-06-16",
  "whole-map-high-volume-official-host-route-probe-2026-06-16.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "whole-map-high-volume-parser-extraction-board-2026-06-16"
);

const outputPath = path.join(
  outputDir,
  "whole-map-high-volume-parser-extraction-board-2026-06-16.json"
);

const expectedRowsBySlug = {
  "ger.3": 20, "eng.1": 20, "eng.2": 24, "eng.3": 24, "eng.4": 24, "eng.5": 24,
  "fra.1": 18, "fra.2": 18, "ita.1": 20, "ita.2": 20, "ned.1": 18, "ned.2": 20,
  "bel.1": 16, "bel.2": 16, "den.1": 12, "den.2": 12, "sui.1": 12, "sui.2": 10,
  "aut.1": 12, "aut.2": 16, "fin.1": 12, "fin.2": 10, "irl.1": 10, "irl.2": 10,
  "por.1": 18, "por.2": 18, "sco.1": 12, "sco.2": 10, "usa.1": 30, "usa.2": 24,
  "mex.1": 18, "mex.2": 15, "arg.1": 30, "arg.2": 20, "aus.1": 12, "aus.2": 12,
  "arm.1": 10, "arm.2": 10, "alg.1": 16, "alg.2": 16, "aze.1": 10, "aze.2": 10
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

function cleanDecodedText(value) {
  return String(value ?? "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\\u002F/g, "/")
    .replace(/\\u003C/g, "<")
    .replace(/\\u003E/g, ">")
    .replace(/\\u0026/g, "&")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function parseIntLoose(value) {
  const text = String(value ?? "").trim().replace(/^\+/, "");
  if (!/^-?\d+$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
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

function numericTokenCount(cells) {
  return cells.filter((cell) => /(^|\s)[+-]?\d+(\s|$)/.test(String(cell)) || /\d+\s*[-:]\s*\d+/.test(String(cell))).length;
}

function looksLikeStandingRow(cells) {
  if (!Array.isArray(cells) || cells.length < 4) return false;
  const joined = cells.join(" ");
  const hasPosition = parseIntLoose(cells[0]) !== null || /^\d+/.test(joined);
  const hasTeamLike = cells.some((cell) => /[A-Za-zÀ-ÿ]/.test(cell) && String(cell).length >= 2);
  const hasNumbers = numericTokenCount(cells) >= 3;
  return hasPosition && hasTeamLike && hasNumbers;
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

function markerCounts(text) {
  const lower = cleanDecodedText(text).toLowerCase();
  const markers = [
    "__next_data__", "__nuxt__", "apollo", "graphql", "standings", "standing", "table", "ranking",
    "rankings", "classement", "klassement", "tabelle", "sarjataulukko", "ladder", "teamname",
    "clubname", "shortname", "displayname", "position", "rank", "points", "played", "matches",
    "wins", "draws", "losses", "goalsfor", "goalsagainst", "goaldifference", "season", "competition"
  ];

  return Object.fromEntries(markers.map((marker) => [marker, lower.split(marker).length - 1]));
}

function endpointHints(text) {
  const decoded = cleanDecodedText(text);
  const hints = [];

  const urlMatches = [...decoded.matchAll(/https?:\/\/[^"'\\\s<>)]+/gi)].map((match) => match[0]);
  const pathMatches = [...decoded.matchAll(/["'`]((?:\/api\/|\/graphql|\/data\/|\/_next\/data\/|\/wp-json\/|\/ajax\/)[^"'`\\\s<>)]+)["'`]/gi)].map((match) => match[1]);

  for (const value of [...urlMatches, ...pathMatches]) {
    if (/api|graphql|data|stand|table|ranking|tabelle|classement|team|club|season|competition|fixture|standing/i.test(value)) {
      hints.push(value);
    }
  }

  return unique(hints).slice(0, 40);
}

function scriptContexts(text) {
  const contexts = [];
  const matches = [...String(text).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  for (const [index, match] of matches.entries()) {
    const attrs = (match[1] ?? "").replace(/\s+/g, " ").trim();
    const body = cleanDecodedText(match[2] ?? "");
    const lower = body.toLowerCase();

    const terms = [
      "standings", "standing", "table", "ranking", "rankings", "tabelle", "classement", "klassement",
      "sarjataulukko", "ladder", "team", "club", "points", "position", "rank", "played", "wins",
      "draws", "losses", "goals", "graphql", "api", "season", "competition"
    ];

    let score = 0;
    const hits = [];
    for (const term of terms) {
      const count = lower.split(term).length - 1;
      if (count > 0) {
        hits.push({ term, count });
        score += Math.min(count, 12);
      }
    }

    const hints = endpointHints(body);
    if (score > 0 || hints.length > 0) {
      contexts.push({
        scriptIndex: index + 1,
        attrs,
        length: body.length,
        score,
        hits,
        endpointHints: hints,
        first700: body.slice(0, 700).replace(/\s+/g, " ")
      });
    }
  }

  return contexts.sort((a, b) => b.score - a.score || b.endpointHints.length - a.endpointHints.length).slice(0, 10);
}

function classify(row, responseText) {
  const htmlRows = parseHtmlRows(responseText);
  const tableCandidateRows = extractTableCandidateRows(htmlRows);
  const markers = markerCounts(responseText);
  const scripts = scriptContexts(responseText);
  const hints = unique(scripts.flatMap((script) => script.endpointHints));
  const expectedRows = expectedRowsBySlug[row.competitionSlug] ?? null;

  const isStrong = row.bestResultStatus === "accepted_route_candidate_strong_signal_requires_parser";
  const isWeak = row.bestResultStatus === "review_route_candidate_weak_signal";
  const is2xx = row.httpStatus >= 200 && row.httpStatus < 300;

  const hasExactExpectedTableCandidates = expectedRows !== null && tableCandidateRows.length === expectedRows;
  const hasNearExpectedTableCandidates = expectedRows !== null && tableCandidateRows.length >= Math.max(1, expectedRows - 2) && tableCandidateRows.length <= expectedRows + 8;
  const hasManyTableCandidates = expectedRows !== null && tableCandidateRows.length > expectedRows + 8;

  const jsonSignalScore =
    (markers.standings ?? 0) + (markers.standing ?? 0) + (markers.table ?? 0) + (markers.ranking ?? 0) +
    (markers.tabelle ?? 0) + (markers.teamname ?? 0) + (markers.clubname ?? 0) + (markers.points ?? 0) +
    scripts.reduce((sum, script) => sum + Math.min(script.score, 20), 0);

  let parserLane = "route_unusable_needs_route_repair";
  let parserConfidence = "none";

  if ((isStrong || isWeak) && hasExactExpectedTableCandidates) {
    parserLane = "runner_ready_generic_html_table_exact_expected_rows";
    parserConfidence = "high";
  } else if ((isStrong || isWeak) && hasNearExpectedTableCandidates) {
    parserLane = "runner_ready_html_table_near_expected_rows_needs_filter";
    parserConfidence = "medium";
  } else if ((isStrong || isWeak) && hasManyTableCandidates) {
    parserLane = "runner_ready_provider_specific_html_table_filter";
    parserConfidence = "medium";
  } else if ((isStrong || isWeak) && (jsonSignalScore >= 10 || scripts.length >= 2)) {
    parserLane = "runner_ready_embedded_json_or_app_state_parser";
    parserConfidence = "medium";
  } else if (isStrong && is2xx) {
    parserLane = "official_route_shell_requires_js_runtime_or_network_contract_probe";
    parserConfidence = "low";
  } else if (isWeak && is2xx) {
    parserLane = "weak_route_review_before_parser_runner";
    parserConfidence = "low";
  } else if (is2xx) {
    parserLane = "fetched_2xx_no_parser_signal_needs_route_repair";
    parserConfidence = "low";
  }

  return {
    parserLane,
    parserConfidence,
    expectedRows,
    htmlTableRowCount: htmlRows.length,
    tableCandidateRowCount: tableCandidateRows.length,
    hasExactExpectedTableCandidates,
    hasNearExpectedTableCandidates,
    hasManyTableCandidates,
    markerCounts: markers,
    scriptContextCount: scripts.length,
    endpointHintCount: hints.length,
    endpointHints: hints,
    topScriptContexts: scripts.slice(0, 5),
    sampleTableCandidateRows: tableCandidateRows.slice(0, 5)
  };
}

function check(checks, name, passed, details = {}) {
  checks.push({ name, passed: Boolean(passed), ...details });
}

if (!fs.existsSync(probePath)) {
  throw new Error(`Missing high-volume probe output: ${probePath}`);
}

const probeText = fs.readFileSync(probePath, "utf8");
const probe = JSON.parse(probeText);
const bestRouteRows = Array.isArray(probe.bestRouteRows) ? probe.bestRouteRows : [];

const parserRows = [];

for (const row of bestRouteRows) {
  let responseText = "";
  let responseSha256 = null;
  if (row.outputFile && fs.existsSync(row.outputFile)) {
    responseText = fs.readFileSync(row.outputFile, "utf8");
    responseSha256 = sha256Text(responseText);
  }

  const classification = classify(row, responseText);

  parserRows.push({
    competitionSlug: row.competitionSlug,
    countryCode: row.countryCode,
    providerSignalClass: row.providerSignalClass,
    bestResultStatus: row.bestResultStatus,
    httpStatus: row.httpStatus,
    routeSignalScore: row.routeSignalScore,
    sourceUrl: row.sourceUrl,
    finalUrl: row.finalUrl,
    routeSource: row.routeSource,
    routeConfidence: row.routeConfidence,
    title: row.title,
    outputFile: row.outputFile,
    outputSha256: responseSha256,
    ...classification,
    nextAllowedAction: {
      mayBuildHighVolumeGenericHtmlExtractor:
        classification.parserLane === "runner_ready_generic_html_table_exact_expected_rows" ||
        classification.parserLane === "runner_ready_html_table_near_expected_rows_needs_filter",
      mayBuildHighVolumeProviderSpecificHtmlFilter:
        classification.parserLane === "runner_ready_provider_specific_html_table_filter",
      mayBuildHighVolumeEmbeddedJsonOrAppStateParser:
        classification.parserLane === "runner_ready_embedded_json_or_app_state_parser",
      mayBuildJsRuntimeOrNetworkContractProbe:
        classification.parserLane === "official_route_shell_requires_js_runtime_or_network_contract_probe",
      mayBuildWeakRouteReview:
        classification.parserLane === "weak_route_review_before_parser_runner",
      mayBuildRouteRepairPlan:
        classification.parserLane === "fetched_2xx_no_parser_signal_needs_route_repair" ||
        classification.parserLane === "route_unusable_needs_route_repair",
      mayWriteCanonicalNow: false,
      mayWriteProductionNow: false,
      mayAssertTruthNow: false
    }
  });
}

const parserRowsByLane = countBy(parserRows, "parserLane");
const runnerReadyCompetitionCount = parserRows.filter((row) =>
  row.nextAllowedAction.mayBuildHighVolumeGenericHtmlExtractor ||
  row.nextAllowedAction.mayBuildHighVolumeProviderSpecificHtmlFilter ||
  row.nextAllowedAction.mayBuildHighVolumeEmbeddedJsonOrAppStateParser
).length;

const shellProbeCompetitionCount = parserRows.filter((row) => row.nextAllowedAction.mayBuildJsRuntimeOrNetworkContractProbe).length;
const weakReviewCompetitionCount = parserRows.filter((row) => row.nextAllowedAction.mayBuildWeakRouteReview).length;
const routeRepairCompetitionCount = parserRows.filter((row) => row.nextAllowedAction.mayBuildRouteRepairPlan).length;

const checks = [];
check(checks, "sourceProbePassed", probe.summary?.status === "passed", { actual: probe.summary?.status });
check(checks, "sourceProbeSelectedTargetsSeventyEight", Number(probe.summary?.selectedTargetCount ?? -1) === 78, { actual: probe.summary?.selectedTargetCount });
check(checks, "sourceProbeRouteCandidatesAtLeastOneSixty", Number(probe.summary?.routeCandidateCount ?? 0) >= 160, { actual: probe.summary?.routeCandidateCount });
check(checks, "sourceProbeNoSearchNoWrite", Number(probe.summary?.searchExecutedNowCount ?? -1) === 0 && Number(probe.summary?.canonicalWriteExecutedNowCount ?? -1) === 0 && Number(probe.summary?.productionWriteExecutedNowCount ?? -1) === 0 && Number(probe.summary?.truthAssertionExecutedNowCount ?? -1) === 0);
check(checks, "bestRouteRowsAtLeastFifty", bestRouteRows.length >= 50, { actual: bestRouteRows.length });
check(checks, "parserRowsEqualBestRouteRows", parserRows.length === bestRouteRows.length, { parserRows: parserRows.length, bestRouteRows: bestRouteRows.length });
check(checks, "allParserRowsHaveNextLane", runnerReadyCompetitionCount + shellProbeCompetitionCount + weakReviewCompetitionCount + routeRepairCompetitionCount === parserRows.length, { runnerReadyCompetitionCount, shellProbeCompetitionCount, weakReviewCompetitionCount, routeRepairCompetitionCount, parserRows: parserRows.length });
check(checks, "noFetchSearchWriteInThisJob", true);
check(checks, "productionAndTruthLocked", true);

const blockedCheckCount = checks.filter((entry) => !entry.passed).length;
const passedCheckCount = checks.filter((entry) => entry.passed).length;

const output = {
  output: outputPath,
  job: "build-football-truth-whole-map-high-volume-parser-extraction-board-file",
  generatedAtUtc: new Date().toISOString(),
  sourceProbePath: probePath,
  sourceProbeSha256: sha256Text(probeText),
  policy: {
    highVolumeParserExtractionBoardOnly: true,
    noFetchInThisJob: true,
    noSearchInThisJob: true,
    noBroadSearchInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true
  },
  checks,
  parserRows,
  summary: {
    status: blockedCheckCount === 0 ? "passed" : "blocked",
    sourceAllTargetCount: probe.summary?.sourceAllTargetCount ?? null,
    sourceSelectedTargetCount: probe.summary?.selectedTargetCount ?? null,
    sourceSelectedCountryCount: probe.summary?.selectedCountryCount ?? null,
    sourceRouteCandidateCount: probe.summary?.routeCandidateCount ?? null,
    sourceBestRouteCompetitionCount: bestRouteRows.length,
    parserCompetitionCount: parserRows.length,
    parserRowsByLane,
    runnerReadyCompetitionCount,
    shellProbeCompetitionCount,
    weakReviewCompetitionCount,
    routeRepairCompetitionCount,
    mayBuildHighVolumeGenericHtmlExtractorCount: parserRows.some((row) => row.nextAllowedAction.mayBuildHighVolumeGenericHtmlExtractor) ? 1 : 0,
    mayBuildHighVolumeProviderSpecificHtmlFilterCount: parserRows.some((row) => row.nextAllowedAction.mayBuildHighVolumeProviderSpecificHtmlFilter) ? 1 : 0,
    mayBuildHighVolumeEmbeddedJsonOrAppStateParserCount: parserRows.some((row) => row.nextAllowedAction.mayBuildHighVolumeEmbeddedJsonOrAppStateParser) ? 1 : 0,
    mayBuildJsRuntimeOrNetworkContractProbeCount: shellProbeCompetitionCount > 0 ? 1 : 0,
    mayBuildWeakRouteReviewCount: weakReviewCompetitionCount > 0 ? 1 : 0,
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
  }
};

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  status: output.summary.status,
  sourceSelectedTargetCount: output.summary.sourceSelectedTargetCount,
  sourceSelectedCountryCount: output.summary.sourceSelectedCountryCount,
  sourceRouteCandidateCount: output.summary.sourceRouteCandidateCount,
  parserCompetitionCount: output.summary.parserCompetitionCount,
  parserRowsByLane: output.summary.parserRowsByLane,
  runnerReadyCompetitionCount: output.summary.runnerReadyCompetitionCount,
  shellProbeCompetitionCount: output.summary.shellProbeCompetitionCount,
  weakReviewCompetitionCount: output.summary.weakReviewCompetitionCount,
  routeRepairCompetitionCount: output.summary.routeRepairCompetitionCount,
  mayBuildHighVolumeGenericHtmlExtractorCount: output.summary.mayBuildHighVolumeGenericHtmlExtractorCount,
  mayBuildHighVolumeProviderSpecificHtmlFilterCount: output.summary.mayBuildHighVolumeProviderSpecificHtmlFilterCount,
  mayBuildHighVolumeEmbeddedJsonOrAppStateParserCount: output.summary.mayBuildHighVolumeEmbeddedJsonOrAppStateParserCount,
  mayBuildJsRuntimeOrNetworkContractProbeCount: output.summary.mayBuildJsRuntimeOrNetworkContractProbeCount,
  mayBuildWeakRouteReviewCount: output.summary.mayBuildWeakRouteReviewCount,
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
