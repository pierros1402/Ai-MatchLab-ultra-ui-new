import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const boardPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "whole-map-official-route-parser-extraction-board-wave-01-2026-06-16",
  "whole-map-official-route-parser-extraction-board-wave-01-2026-06-16.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "whole-map-runner-ready-route-extractor-wave-01-2026-06-16"
);

const outputPath = path.join(
  outputDir,
  "whole-map-runner-ready-route-extractor-wave-01-2026-06-16.json"
);

const runnerReadyLanes = new Set([
  "runner_ready_embedded_json_or_app_state_parser",
  "runner_ready_generic_html_table_exact_expected_rows",
  "runner_ready_provider_specific_html_table_filter"
]);

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

function cleanText(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseIntLoose(value) {
  const text = String(value ?? "").trim().replace(/^\+/, "");
  if (!/^-?\d+$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
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
  const hasPosition = parseIntLoose(cells[0]) !== null || /^\d+/.test(cells.join(" "));
  const hasTeamLike = cells.some((cell) => /[A-Za-zÀ-ÿ]/.test(cell) && String(cell).length >= 2);
  const hasNumbers = numericTokenCount(cells) >= 3;
  return hasPosition && hasTeamLike && hasNumbers;
}

function extractHtmlTableCandidates(text, expectedRows) {
  const htmlRows = parseHtmlRows(text);
  const standingRows = htmlRows
    .filter(looksLikeStandingRow)
    .map((cells, index) => ({
      rowIndex: index + 1,
      extractionMethod: "generic_html_table_row",
      position: parseIntLoose(cells[0]),
      teamName: guessTeamNameFromCells(cells),
      rawCells: cells
    }));

  if (standingRows.length === expectedRows) return standingRows;

  if (standingRows.length > expectedRows && expectedRows > 0) {
    const windows = [];
    for (let start = 0; start <= standingRows.length - expectedRows; start++) {
      const slice = standingRows.slice(start, start + expectedRows);
      const positions = slice.map((row) => row.position);
      const hasContiguousPositions = positions.every((value, index) => value === index + 1);
      const uniqueTeams = unique(slice.map((row) => row.teamName)).length;
      const score = (hasContiguousPositions ? 1000 : 0) + uniqueTeams * 10;
      windows.push({ start, score, rows: slice });
    }

    windows.sort((a, b) => b.score - a.score);
    if (windows[0]) return windows[0].rows.map((row, index) => ({ ...row, rowIndex: index + 1, extractionMethod: "generic_html_table_filtered_window" }));
  }

  return standingRows;
}

function guessTeamNameFromCells(cells) {
  const cell = cells.find((value, index) =>
    index > 0 &&
    /[A-Za-zÀ-ÿ]/.test(String(value)) &&
    !/^\d+$/.test(String(value).replace(/\s+/g, "")) &&
    String(value).length >= 2
  );
  return cleanText(cell ?? "");
}

function htmlDecodeJsonText(value) {
  return String(value ?? "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\\u002F/g, "/")
    .replace(/\\u003C/g, "<")
    .replace(/\\u003E/g, ">")
    .replace(/\\u0026/g, "&");
}

function extractJsonScriptPayloads(text) {
  const payloads = [];

  const nextMatches = [...String(text).matchAll(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of nextMatches) {
    payloads.push({ source: "__NEXT_DATA__", text: htmlDecodeJsonText(match[1]) });
  }

  const jsonScriptMatches = [...String(text).matchAll(/<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of jsonScriptMatches) {
    payloads.push({ source: "application_json_script", text: htmlDecodeJsonText(match[1]) });
  }

  const nuxtMatch = String(text).match(/window\.__NUXT__\s*=\s*([\s\S]*?);<\/script>/i);
  if (nuxtMatch) payloads.push({ source: "__NUXT__", text: htmlDecodeJsonText(nuxtMatch[1]) });

  const apolloMatch = String(text).match(/window\.__APOLLO_STATE__\s*=\s*([\s\S]*?);<\/script>/i);
  if (apolloMatch) payloads.push({ source: "__APOLLO_STATE__", text: htmlDecodeJsonText(apolloMatch[1]) });

  return payloads;
}

function tryParseJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function objectKeysLower(obj) {
  return Object.keys(obj ?? {}).map((key) => key.toLowerCase());
}

function getFirstByKeyHints(obj, hints) {
  if (!obj || typeof obj !== "object") return null;
  for (const [key, value] of Object.entries(obj)) {
    const lower = key.toLowerCase();
    if (hints.some((hint) => lower === hint || lower.includes(hint))) return value;
  }
  return null;
}

function scoreStandingObject(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return 0;
  const keys = objectKeysLower(obj);
  let score = 0;

  if (keys.some((key) => key.includes("team") || key.includes("club") || key === "name" || key.includes("shortname"))) score += 4;
  if (keys.some((key) => key.includes("position") || key === "rank" || key.includes("standing"))) score += 3;
  if (keys.some((key) => key.includes("point") || key === "pts")) score += 3;
  if (keys.some((key) => key.includes("played") || key === "matches" || key === "playedmatches" || key === "games")) score += 2;
  if (keys.some((key) => key.includes("win"))) score += 1;
  if (keys.some((key) => key.includes("draw"))) score += 1;
  if (keys.some((key) => key.includes("loss") || key.includes("lost"))) score += 1;
  if (keys.some((key) => key.includes("goal"))) score += 1;

  return score;
}

function normalizeJsonStandingRow(obj, index, sourcePath, sourceKind) {
  const teamObj = getFirstByKeyHints(obj, ["team", "club"]);
  const teamNameRaw =
    getFirstByKeyHints(obj, ["teamname", "clubname", "name", "displayname", "shortname"]) ??
    (teamObj && typeof teamObj === "object" ? getFirstByKeyHints(teamObj, ["teamname", "clubname", "name", "displayname", "shortname"]) : null);

  const positionRaw = getFirstByKeyHints(obj, ["position", "rank", "place"]);
  const pointsRaw = getFirstByKeyHints(obj, ["points", "pts"]);
  const playedRaw = getFirstByKeyHints(obj, ["played", "playedmatches", "matches", "games"]);
  const winsRaw = getFirstByKeyHints(obj, ["wins", "won"]);
  const drawsRaw = getFirstByKeyHints(obj, ["draws", "drawn"]);
  const lossesRaw = getFirstByKeyHints(obj, ["losses", "lost"]);
  const gfRaw = getFirstByKeyHints(obj, ["goalsfor", "goals_for", "scored"]);
  const gaRaw = getFirstByKeyHints(obj, ["goalsagainst", "goals_against", "conceded"]);
  const gdRaw = getFirstByKeyHints(obj, ["goaldifference", "goal_difference", "diff"]);

  return {
    rowIndex: index + 1,
    extractionMethod: "embedded_json_or_app_state",
    sourcePath,
    sourceKind,
    position: parseIntLoose(positionRaw),
    teamName: cleanText(teamNameRaw),
    played: parseIntLoose(playedRaw),
    wins: parseIntLoose(winsRaw),
    draws: parseIntLoose(drawsRaw),
    losses: parseIntLoose(lossesRaw),
    goalsFor: parseIntLoose(gfRaw),
    goalsAgainst: parseIntLoose(gaRaw),
    goalDifference: parseIntLoose(gdRaw),
    points: parseIntLoose(pointsRaw),
    rawObjectKeyCount: Object.keys(obj ?? {}).length,
    rawObjectSample: JSON.parse(JSON.stringify(obj, (_, value) => typeof value === "string" && value.length > 160 ? `${value.slice(0, 160)}…` : value))
  };
}

function findCandidateJsonArrays(root, expectedRows, sourceKind) {
  const candidates = [];
  const maxVisits = 25000;
  let visits = 0;

  function walk(node, pathParts, depth) {
    visits++;
    if (visits > maxVisits || depth > 24) return;

    if (Array.isArray(node)) {
      const objectRows = node.filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry));
      if (objectRows.length >= Math.max(3, Math.min(expectedRows ?? 3, 6))) {
        const scored = objectRows.map(scoreStandingObject);
        const strongRows = scored.filter((score) => score >= 7).length;
        const mediumRows = scored.filter((score) => score >= 5).length;
        const nearExpected =
          expectedRows &&
          objectRows.length >= Math.max(1, expectedRows - 2) &&
          objectRows.length <= expectedRows + 8;

        if (strongRows >= Math.max(3, Math.floor((expectedRows ?? objectRows.length) * 0.45)) || (nearExpected && mediumRows >= Math.max(3, Math.floor(objectRows.length * 0.5)))) {
          candidates.push({
            sourceKind,
            sourcePath: pathParts.join(".") || "$",
            objectRowCount: objectRows.length,
            strongRows,
            mediumRows,
            nearExpected: Boolean(nearExpected),
            score: strongRows * 10 + mediumRows * 4 + (nearExpected ? 25 : 0),
            rows: objectRows.map((obj, index) => normalizeJsonStandingRow(obj, index, pathParts.join(".") || "$", sourceKind))
          });
        }
      }

      for (let i = 0; i < Math.min(node.length, 250); i++) walk(node[i], [...pathParts, `[${i}]`], depth + 1);
      return;
    }

    if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) walk(value, [...pathParts, key], depth + 1);
    }
  }

  walk(root, [], 0);
  return candidates.sort((a, b) => b.score - a.score).slice(0, 20);
}

function extractEmbeddedJsonCandidates(text, expectedRows) {
  const payloads = extractJsonScriptPayloads(text);
  const allCandidates = [];

  for (const payload of payloads) {
    const parsed = tryParseJson(payload.text);
    if (!parsed) continue;
    const candidates = findCandidateJsonArrays(parsed, expectedRows, payload.source);
    allCandidates.push(...candidates);
  }

  return allCandidates.sort((a, b) => b.score - a.score);
}

function classifyExtraction(candidateRows, expectedRows) {
  if (candidateRows.length === 0) return "no_candidate_rows_extracted_requires_parser_contract_probe";
  if (expectedRows && candidateRows.length === expectedRows) return "accepted_extraction_candidate_rows_exact_expected_count_requires_quality_gate";
  if (expectedRows && candidateRows.length >= Math.max(1, expectedRows - 2) && candidateRows.length <= expectedRows + 8) return "partial_or_near_expected_extraction_requires_quality_gate";
  return "extracted_rows_count_mismatch_requires_parser_review";
}

function check(checks, name, passed, details = {}) {
  checks.push({ name, passed: Boolean(passed), ...details });
}

if (!fs.existsSync(boardPath)) throw new Error(`Missing parser extraction board: ${boardPath}`);

const boardText = fs.readFileSync(boardPath, "utf8");
const board = JSON.parse(boardText);
const bestParserRows = Array.isArray(board.bestParserRows) ? board.bestParserRows : [];
const runnerReadyRows = bestParserRows.filter((row) => runnerReadyLanes.has(row.parserLane));

const extractionRows = [];

for (const row of runnerReadyRows) {
  const expectedRows = Number(row.expectedRows ?? 0) || null;
  let responseText = "";

  if (row.outputFile && fs.existsSync(row.outputFile)) {
    responseText = fs.readFileSync(row.outputFile, "utf8");
  }

  const htmlCandidates = extractHtmlTableCandidates(responseText, expectedRows);
  const jsonCandidates = extractEmbeddedJsonCandidates(responseText, expectedRows);

  let selectedMethod = "none";
  let selectedRows = [];
  let selectedJsonCandidate = null;

  if (row.parserLane === "runner_ready_generic_html_table_exact_expected_rows") {
    selectedMethod = "generic_html_table";
    selectedRows = htmlCandidates;
  } else if (row.parserLane === "runner_ready_provider_specific_html_table_filter") {
    selectedMethod = "provider_specific_html_table_filter";
    selectedRows = htmlCandidates;
  } else if (row.parserLane === "runner_ready_embedded_json_or_app_state_parser") {
    selectedJsonCandidate = jsonCandidates[0] ?? null;
    if (selectedJsonCandidate) {
      selectedMethod = selectedJsonCandidate.sourceKind;
      selectedRows = selectedJsonCandidate.rows;
    }
  }

  const extractionStatus = classifyExtraction(selectedRows, expectedRows);

  extractionRows.push({
    competitionSlug: row.competitionSlug,
    competitionLabel: row.competitionLabel,
    countryCode: row.countryCode,
    parserLane: row.parserLane,
    parserConfidence: row.parserConfidence,
    sourceUrl: row.sourceUrl,
    finalUrl: row.finalUrl,
    outputFile: row.outputFile,
    expectedRows,
    selectedExtractionMethod: selectedMethod,
    extractionStatus,
    extractedCandidateRowCount: selectedRows.length,
    htmlCandidateRowCount: htmlCandidates.length,
    jsonCandidateArrayCount: jsonCandidates.length,
    selectedJsonCandidatePath: selectedJsonCandidate?.sourcePath ?? null,
    selectedJsonCandidateScore: selectedJsonCandidate?.score ?? null,
    extractedCandidateRows: selectedRows.slice(0, expectedRows ? Math.max(expectedRows + 8, 40) : 40),
    nextAllowedAction: {
      mayBuildBulkExtractionQualityGate:
        extractionStatus === "accepted_extraction_candidate_rows_exact_expected_count_requires_quality_gate" ||
        extractionStatus === "partial_or_near_expected_extraction_requires_quality_gate",
      mayBuildParserReview:
        extractionStatus === "extracted_rows_count_mismatch_requires_parser_review",
      mayBuildParserContractProbe:
        extractionStatus === "no_candidate_rows_extracted_requires_parser_contract_probe",
      mayWriteCanonicalNow: false,
      mayWriteProductionNow: false,
      mayAssertTruthNow: false
    }
  });
}

const extractionRowsByStatus = countBy(extractionRows, "extractionStatus");
const extractionRowsByParserLane = countBy(extractionRows, "parserLane");
const acceptedOrNearRows = extractionRows.filter((row) => row.nextAllowedAction.mayBuildBulkExtractionQualityGate);
const parserReviewRows = extractionRows.filter((row) => row.nextAllowedAction.mayBuildParserReview);
const parserContractProbeRows = extractionRows.filter((row) => row.nextAllowedAction.mayBuildParserContractProbe);
const totalExtractedCandidateRowCount = extractionRows.reduce((sum, row) => sum + Number(row.extractedCandidateRowCount ?? 0), 0);

const checks = [];
check(checks, "sourceBoardPassed", board.summary?.wholeMapOfficialRouteParserExtractionBoardStatus === "passed", { actual: board.summary?.wholeMapOfficialRouteParserExtractionBoardStatus });
check(checks, "runnerReadyRowsNine", runnerReadyRows.length === 9, { actual: runnerReadyRows.length, expected: 9 });
check(checks, "ger3IncludedInRunnerReadyRows", runnerReadyRows.some((row) => row.competitionSlug === "ger.3"));
check(checks, "extractionRowsNine", extractionRows.length === 9, { actual: extractionRows.length, expected: 9 });
check(checks, "allExtractionRowsHaveNextLane", extractionRows.every((row) => row.nextAllowedAction.mayBuildBulkExtractionQualityGate || row.nextAllowedAction.mayBuildParserReview || row.nextAllowedAction.mayBuildParserContractProbe));
check(checks, "noFetchSearchWriteInThisJob", true);
check(checks, "productionAndTruthLocked", true);

const blockedCheckCount = checks.filter((entry) => !entry.passed).length;
const passedCheckCount = checks.filter((entry) => entry.passed).length;

const output = {
  output: outputPath,
  job: "run-football-truth-whole-map-runner-ready-route-extractor-wave-01-file",
  generatedAtUtc: new Date().toISOString(),
  sourceBoardPath: boardPath,
  sourceBoardSha256: sha256Text(boardText),
  policy: {
    bulkRunnerReadyExtractionOnly: true,
    noFetchInThisJob: true,
    noSearchInThisJob: true,
    noBroadSearchInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true
  },
  checks,
  extractionRows,
  summary: {
    status: blockedCheckCount === 0 ? "passed" : "blocked",
    sourceRunnerReadyCompetitionCount: runnerReadyRows.length,
    extractionCompetitionCount: extractionRows.length,
    extractionRowsByStatus,
    extractionRowsByParserLane,
    acceptedOrNearExtractionCompetitionCount: acceptedOrNearRows.length,
    parserReviewCompetitionCount: parserReviewRows.length,
    parserContractProbeCompetitionCount: parserContractProbeRows.length,
    totalExtractedCandidateRowCount,
    ger3ExtractionStatus: extractionRows.find((row) => row.competitionSlug === "ger.3")?.extractionStatus ?? null,
    ger3ExtractedCandidateRowCount: extractionRows.find((row) => row.competitionSlug === "ger.3")?.extractedCandidateRowCount ?? null,
    mayBuildBulkExtractionQualityGateCount: acceptedOrNearRows.length > 0 ? 1 : 0,
    mayBuildParserReviewCount: parserReviewRows.length > 0 ? 1 : 0,
    mayBuildParserContractProbeCount: parserContractProbeRows.length > 0 ? 1 : 0,
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
  sourceRunnerReadyCompetitionCount: output.summary.sourceRunnerReadyCompetitionCount,
  extractionCompetitionCount: output.summary.extractionCompetitionCount,
  extractionRowsByStatus: output.summary.extractionRowsByStatus,
  extractionRowsByParserLane: output.summary.extractionRowsByParserLane,
  acceptedOrNearExtractionCompetitionCount: output.summary.acceptedOrNearExtractionCompetitionCount,
  parserReviewCompetitionCount: output.summary.parserReviewCompetitionCount,
  parserContractProbeCompetitionCount: output.summary.parserContractProbeCompetitionCount,
  totalExtractedCandidateRowCount: output.summary.totalExtractedCandidateRowCount,
  ger3ExtractionStatus: output.summary.ger3ExtractionStatus,
  ger3ExtractedCandidateRowCount: output.summary.ger3ExtractedCandidateRowCount,
  mayBuildBulkExtractionQualityGateCount: output.summary.mayBuildBulkExtractionQualityGateCount,
  mayBuildParserReviewCount: output.summary.mayBuildParserReviewCount,
  mayBuildParserContractProbeCount: output.summary.mayBuildParserContractProbeCount,
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
