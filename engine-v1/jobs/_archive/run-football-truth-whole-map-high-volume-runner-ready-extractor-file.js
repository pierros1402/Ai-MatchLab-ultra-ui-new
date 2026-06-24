import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const boardPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "whole-map-high-volume-parser-extraction-board-2026-06-16",
  "whole-map-high-volume-parser-extraction-board-2026-06-16.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "whole-map-high-volume-runner-ready-extractor-2026-06-16"
);

const outputPath = path.join(
  outputDir,
  "whole-map-high-volume-runner-ready-extractor-2026-06-16.json"
);

const runnerReadyLanes = new Set([
  "runner_ready_embedded_json_or_app_state_parser",
  "runner_ready_generic_html_table_exact_expected_rows",
  "runner_ready_html_table_near_expected_rows_needs_filter",
  "runner_ready_provider_specific_html_table_filter"
]);

function sha256Text(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function decodeText(value) {
  return String(value ?? "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/\\u002F/g, "/")
    .replace(/\\u003C/g, "<")
    .replace(/\\u003E/g, ">")
    .replace(/\\u0026/g, "&")
    .replace(/\\"/g, '"');
}

function stripTags(value) {
  return decodeText(value)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function firstNumber(value) {
  const match = String(value ?? "").match(/[+-]?\d+/);
  return match ? Number(match[0]) : null;
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
  const hasTeamLike = cells.some((cell) => /[A-Za-zÀ-ÿ]/.test(cell) && String(cell).trim().length >= 2);
  const hasNumbers = numericTokenCount(cells) >= 3;
  return hasPosition && hasTeamLike && hasNumbers;
}

function guessTeamName(cells) {
  const cell = cells.find((value, index) =>
    index > 0 &&
    /[A-Za-zÀ-ÿ]/.test(String(value)) &&
    !/^[+-]?\d+$/.test(String(value).trim()) &&
    String(value).trim().length >= 2
  );
  return cleanText(cell ?? "");
}

function normalizeHtmlRow(cells, index, method) {
  return {
    rowIndex: index + 1,
    extractionMethod: method,
    position: parseIntLoose(cells[0]) ?? firstNumber(cells[0]),
    teamName: guessTeamName(cells),
    rawCells: cells.map(cleanText).filter(Boolean),
    numericCells: cells.map(firstNumber).filter((value) => value !== null)
  };
}

function extractHtmlCandidates(text, expectedRows, method) {
  const htmlRows = parseHtmlRows(text);
  const standingRows = htmlRows
    .filter(looksLikeStandingRow)
    .map((cells, index) => normalizeHtmlRow(cells, index, method));

  if (!expectedRows || standingRows.length <= expectedRows + 8) return standingRows;

  const windows = [];
  for (let start = 0; start <= standingRows.length - expectedRows; start++) {
    const slice = standingRows.slice(start, start + expectedRows);
    const positions = slice.map((row) => row.position);
    const contiguous = positions.every((position, index) => position === index + 1);
    const uniqueTeams = unique(slice.map((row) => row.teamName)).length;
    const score = (contiguous ? 1000 : 0) + uniqueTeams * 10;
    windows.push({ start, score, rows: slice });
  }

  windows.sort((a, b) => b.score - a.score);
  return (windows[0]?.rows ?? standingRows).map((row, index) => ({
    ...row,
    rowIndex: index + 1,
    extractionMethod: `${method}_filtered_window`
  }));
}

function getScriptPayloads(text) {
  const payloads = [];

  const nextMatches = [...String(text).matchAll(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of nextMatches) payloads.push({ source: "__NEXT_DATA__", text: decodeText(match[1]) });

  const jsonMatches = [...String(text).matchAll(/<script[^>]+type=["']application\/(?:json|ld\+json)["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of jsonMatches) payloads.push({ source: "application_json_script", text: decodeText(match[1]) });

  const nuxtMatch = String(text).match(/window\.__NUXT__\s*=\s*([\s\S]*?);<\/script>/i);
  if (nuxtMatch) payloads.push({ source: "__NUXT__", text: decodeText(nuxtMatch[1]) });

  const apolloMatch = String(text).match(/window\.__APOLLO_STATE__\s*=\s*([\s\S]*?);<\/script>/i);
  if (apolloMatch) payloads.push({ source: "__APOLLO_STATE__", text: decodeText(apolloMatch[1]) });

  const scriptMatches = [...String(text).matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
  for (const [index, match] of scriptMatches.entries()) {
    const body = decodeText(match[1]);
    if (/standings|standing|table|ranking|tabelle|classement|team|club|points|position|rank|played|wins|draws|losses/i.test(body)) {
      payloads.push({ source: `generic_script_${index + 1}`, text: body });
    }
  }

  return payloads;
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function objectKeysLower(obj) {
  return Object.keys(obj ?? {}).map((key) => key.toLowerCase());
}

function getHint(obj, hints) {
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
  if (keys.some((key) => key.includes("team") || key.includes("club") || key === "name" || key.includes("shortname") || key.includes("displayname"))) score += 4;
  if (keys.some((key) => key.includes("position") || key === "rank" || key.includes("standing") || key.includes("place"))) score += 3;
  if (keys.some((key) => key.includes("point") || key === "pts")) score += 3;
  if (keys.some((key) => key.includes("played") || key.includes("match") || key.includes("game"))) score += 2;
  if (keys.some((key) => key.includes("win"))) score += 1;
  if (keys.some((key) => key.includes("draw"))) score += 1;
  if (keys.some((key) => key.includes("loss") || key.includes("lost"))) score += 1;
  if (keys.some((key) => key.includes("goal"))) score += 1;
  return score;
}

function normalizeJsonStandingRow(obj, index, sourcePath, sourceKind) {
  const teamObj = getHint(obj, ["team", "club"]);
  const teamNameRaw =
    getHint(obj, ["teamname", "clubname", "displayname", "shortname", "name"]) ??
    (teamObj && typeof teamObj === "object" ? getHint(teamObj, ["teamname", "clubname", "displayname", "shortname", "name"]) : null);

  return {
    rowIndex: index + 1,
    extractionMethod: "embedded_json_or_app_state",
    sourcePath,
    sourceKind,
    position: parseIntLoose(getHint(obj, ["position", "rank", "place", "standing"])),
    teamName: cleanText(teamNameRaw),
    played: parseIntLoose(getHint(obj, ["played", "playedmatches", "matches", "games"])),
    wins: parseIntLoose(getHint(obj, ["wins", "won"])),
    draws: parseIntLoose(getHint(obj, ["draws", "drawn"])),
    losses: parseIntLoose(getHint(obj, ["losses", "lost"])),
    goalsFor: parseIntLoose(getHint(obj, ["goalsfor", "goals_for", "scored"])),
    goalsAgainst: parseIntLoose(getHint(obj, ["goalsagainst", "goals_against", "conceded"])),
    goalDifference: parseIntLoose(getHint(obj, ["goaldifference", "goal_difference", "diff"])),
    points: parseIntLoose(getHint(obj, ["points", "pts"])),
    rawObjectKeyCount: Object.keys(obj ?? {}).length,
    rawObjectSample: JSON.parse(JSON.stringify(obj, (_, value) => typeof value === "string" && value.length > 120 ? `${value.slice(0, 120)}…` : value))
  };
}

function walkJsonForCandidateArrays(root, expectedRows, sourceKind) {
  const candidates = [];
  let visits = 0;
  const maxVisits = 60000;

  function walk(node, pathParts, depth) {
    visits++;
    if (visits > maxVisits || depth > 28) return;

    if (Array.isArray(node)) {
      const objectRows = node.filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry));
      if (objectRows.length >= 3) {
        const scored = objectRows.map(scoreStandingObject);
        const strongRows = scored.filter((score) => score >= 7).length;
        const mediumRows = scored.filter((score) => score >= 5).length;
        const nearExpected =
          expectedRows &&
          objectRows.length >= Math.max(1, expectedRows - 2) &&
          objectRows.length <= expectedRows + 10;

        if (strongRows >= Math.max(3, Math.floor(objectRows.length * 0.35)) || (nearExpected && mediumRows >= Math.max(3, Math.floor(objectRows.length * 0.4)))) {
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

      for (let i = 0; i < Math.min(node.length, 300); i++) walk(node[i], [...pathParts, `[${i}]`], depth + 1);
      return;
    }

    if (node && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) walk(value, [...pathParts, key], depth + 1);
    }
  }

  walk(root, [], 0);
  return candidates;
}

function extractJsonObjectsFromScriptText(text) {
  const candidates = [];
  const assignmentMatches = [...String(text).matchAll(/(?:window\.)?[A-Z_a-z0-9.]*\s*=\s*(\{[\s\S]{200,}\});?/g)];
  for (const match of assignmentMatches.slice(0, 8)) candidates.push(match[1].replace(/;$/, ""));

  const braceStart = String(text).indexOf("{");
  const braceEnd = String(text).lastIndexOf("}");
  if (braceStart >= 0 && braceEnd > braceStart) candidates.push(String(text).slice(braceStart, braceEnd + 1));

  return unique(candidates).slice(0, 10);
}

function extractEmbeddedCandidates(text, expectedRows) {
  const payloads = getScriptPayloads(text);
  const allCandidates = [];

  for (const payload of payloads) {
    const directParsed = tryParseJson(payload.text);
    if (directParsed) {
      allCandidates.push(...walkJsonForCandidateArrays(directParsed, expectedRows, payload.source));
      continue;
    }

    for (const candidateJsonText of extractJsonObjectsFromScriptText(payload.text)) {
      const parsed = tryParseJson(candidateJsonText);
      if (parsed) allCandidates.push(...walkJsonForCandidateArrays(parsed, expectedRows, payload.source));
    }
  }

  return allCandidates.sort((a, b) => b.score - a.score).slice(0, 20);
}

function classifyExtraction(row, selectedRows, expectedRows) {
  if (selectedRows.length === 0) return "no_candidate_rows_extracted_requires_parser_contract_probe";
  if (expectedRows && selectedRows.length === expectedRows) return "accepted_extraction_candidate_rows_exact_expected_count_requires_quality_gate";
  if (expectedRows && selectedRows.length >= Math.max(1, expectedRows - 2) && selectedRows.length <= expectedRows + 10) return "partial_or_near_expected_extraction_requires_quality_gate";
  return "extracted_rows_count_mismatch_requires_parser_review";
}

function check(checks, name, passed, details = {}) {
  checks.push({ name, passed: Boolean(passed), ...details });
}

if (!fs.existsSync(boardPath)) {
  throw new Error(`Missing high-volume parser board: ${boardPath}`);
}

const boardText = fs.readFileSync(boardPath, "utf8");
const board = JSON.parse(boardText);
const parserRows = Array.isArray(board.parserRows) ? board.parserRows : [];
const runnerReadyRows = parserRows.filter((row) => runnerReadyLanes.has(row.parserLane));

const extractionRows = [];

for (const row of runnerReadyRows) {
  const expectedRows = Number(row.expectedRows ?? 0) || null;
  let responseText = "";

  if (row.outputFile && fs.existsSync(row.outputFile)) {
    responseText = fs.readFileSync(row.outputFile, "utf8");
  }

  const htmlCandidates = extractHtmlCandidates(
    responseText,
    expectedRows,
    row.parserLane === "runner_ready_provider_specific_html_table_filter" ? "provider_specific_html_table_filter" : "generic_html_table"
  );

  const jsonCandidates = extractEmbeddedCandidates(responseText, expectedRows);

  let selectedExtractionMethod = "none";
  let selectedRows = [];
  let selectedJsonCandidate = null;

  if (row.parserLane === "runner_ready_generic_html_table_exact_expected_rows" || row.parserLane === "runner_ready_html_table_near_expected_rows_needs_filter") {
    selectedExtractionMethod = "generic_html_table";
    selectedRows = htmlCandidates;
  } else if (row.parserLane === "runner_ready_provider_specific_html_table_filter") {
    selectedExtractionMethod = "provider_specific_html_table_filter";
    selectedRows = htmlCandidates;
  } else if (row.parserLane === "runner_ready_embedded_json_or_app_state_parser") {
    selectedJsonCandidate = jsonCandidates[0] ?? null;
    if (selectedJsonCandidate) {
      selectedExtractionMethod = selectedJsonCandidate.sourceKind;
      selectedRows = selectedJsonCandidate.rows;
    }
  }

  const extractionStatus = classifyExtraction(row, selectedRows, expectedRows);

  extractionRows.push({
    competitionSlug: row.competitionSlug,
    countryCode: row.countryCode,
    providerSignalClass: row.providerSignalClass,
    parserLane: row.parserLane,
    parserConfidence: row.parserConfidence,
    sourceUrl: row.sourceUrl,
    finalUrl: row.finalUrl,
    title: row.title,
    outputFile: row.outputFile,
    expectedRows,
    selectedExtractionMethod,
    extractionStatus,
    extractedCandidateRowCount: selectedRows.length,
    htmlCandidateRowCount: htmlCandidates.length,
    jsonCandidateArrayCount: jsonCandidates.length,
    selectedJsonCandidatePath: selectedJsonCandidate?.sourcePath ?? null,
    selectedJsonCandidateScore: selectedJsonCandidate?.score ?? null,
    extractedCandidateRows: selectedRows.slice(0, expectedRows ? Math.max(expectedRows + 10, 50) : 50),
    nextAllowedAction: {
      mayBuildHighVolumeExtractionQualityGate:
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

const acceptedOrNearRows = extractionRows.filter((row) => row.nextAllowedAction.mayBuildHighVolumeExtractionQualityGate);
const parserReviewRows = extractionRows.filter((row) => row.nextAllowedAction.mayBuildParserReview);
const parserContractProbeRows = extractionRows.filter((row) => row.nextAllowedAction.mayBuildParserContractProbe);
const totalExtractedCandidateRowCount = extractionRows.reduce((sum, row) => sum + Number(row.extractedCandidateRowCount ?? 0), 0);

const checks = [];
check(checks, "sourceBoardPassed", board.summary?.status === "passed", { actual: board.summary?.status });
check(checks, "sourceParserCompetitionCountAtLeastFifty", Number(board.summary?.parserCompetitionCount ?? 0) >= 50, { actual: board.summary?.parserCompetitionCount });
check(checks, "runnerReadyRowsTwenty", runnerReadyRows.length === 20, { actual: runnerReadyRows.length, expected: 20 });
check(checks, "ger3IncludedInRunnerReadyRows", runnerReadyRows.some((row) => row.competitionSlug === "ger.3"));
check(checks, "extractionRowsTwenty", extractionRows.length === 20, { actual: extractionRows.length, expected: 20 });
check(checks, "allExtractionRowsHaveNextLane", extractionRows.every((row) => row.nextAllowedAction.mayBuildHighVolumeExtractionQualityGate || row.nextAllowedAction.mayBuildParserReview || row.nextAllowedAction.mayBuildParserContractProbe));
check(checks, "noFetchSearchWriteInThisJob", true);
check(checks, "productionAndTruthLocked", true);

const blockedCheckCount = checks.filter((entry) => !entry.passed).length;
const passedCheckCount = checks.filter((entry) => entry.passed).length;

const output = {
  output: outputPath,
  job: "run-football-truth-whole-map-high-volume-runner-ready-extractor-file",
  generatedAtUtc: new Date().toISOString(),
  sourceBoardPath: boardPath,
  sourceBoardSha256: sha256Text(boardText),
  policy: {
    highVolumeRunnerReadyExtractionOnly: true,
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
    sourceParserCompetitionCount: board.summary?.parserCompetitionCount ?? null,
    sourceRunnerReadyCompetitionCount: runnerReadyRows.length,
    extractionCompetitionCount: extractionRows.length,
    extractionRowsByStatus: countBy(extractionRows, "extractionStatus"),
    extractionRowsByParserLane: countBy(extractionRows, "parserLane"),
    acceptedOrNearExtractionCompetitionCount: acceptedOrNearRows.length,
    parserReviewCompetitionCount: parserReviewRows.length,
    parserContractProbeCompetitionCount: parserContractProbeRows.length,
    totalExtractedCandidateRowCount,
    ger3ExtractionStatus: extractionRows.find((row) => row.competitionSlug === "ger.3")?.extractionStatus ?? null,
    ger3ExtractedCandidateRowCount: extractionRows.find((row) => row.competitionSlug === "ger.3")?.extractedCandidateRowCount ?? null,
    mayBuildHighVolumeExtractionQualityGateCount: acceptedOrNearRows.length > 0 ? 1 : 0,
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
  sourceParserCompetitionCount: output.summary.sourceParserCompetitionCount,
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
  mayBuildHighVolumeExtractionQualityGateCount: output.summary.mayBuildHighVolumeExtractionQualityGateCount,
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
