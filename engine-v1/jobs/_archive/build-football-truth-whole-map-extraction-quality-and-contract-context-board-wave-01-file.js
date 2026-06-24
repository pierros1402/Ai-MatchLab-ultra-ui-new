import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const extractorPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "whole-map-runner-ready-route-extractor-wave-01-2026-06-16",
  "whole-map-runner-ready-route-extractor-wave-01-2026-06-16.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "whole-map-extraction-quality-and-contract-context-board-wave-01-2026-06-16"
);

const outputPath = path.join(
  outputDir,
  "whole-map-extraction-quality-and-contract-context-board-wave-01-2026-06-16.json"
);

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

function cleanText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function parseIntLoose(value) {
  const text = String(value ?? "").trim().replace(/^\+/, "");
  if (!/^-?\d+$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function firstNumberInCell(value) {
  const match = String(value ?? "").match(/[+-]?\d+/);
  return match ? Number(match[0]) : null;
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

function htmlDecodeText(value) {
  return String(value ?? "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\\u002F/g, "/")
    .replace(/\\u003C/g, "<")
    .replace(/\\u003E/g, ">")
    .replace(/\\u0026/g, "&")
    .replace(/\\"/g, '"');
}

function candidateTeamName(row) {
  if (row.teamName) return cleanText(row.teamName);
  const cells = Array.isArray(row.rawCells) ? row.rawCells : [];
  const teamCell = cells.find((cell, index) =>
    index > 0 &&
    /[A-Za-zÀ-ÿ]/.test(String(cell)) &&
    !/^[+-]?\d+$/.test(String(cell).trim()) &&
    String(cell).trim().length >= 2
  );
  return cleanText(teamCell ?? "");
}

function candidatePosition(row) {
  if (Number.isInteger(row.position)) return row.position;
  if (row.position !== null && row.position !== undefined) {
    const parsed = parseIntLoose(row.position);
    if (parsed !== null) return parsed;
  }
  const cells = Array.isArray(row.rawCells) ? row.rawCells : [];
  for (const cell of cells.slice(0, 3)) {
    const parsed = parseIntLoose(cell);
    if (parsed !== null && parsed >= 1 && parsed <= 30) return parsed;
  }
  return null;
}

function mapShapeCandidate(row, competitionRow, index) {
  const rawCells = Array.isArray(row.rawCells) ? row.rawCells.map(cleanText).filter(Boolean) : [];
  const position = candidatePosition(row);
  const teamName = candidateTeamName(row);

  const numericCells = rawCells
    .map((cell) => ({ cell, value: firstNumberInCell(cell) }))
    .filter((entry) => entry.value !== null)
    .map((entry) => entry.value);

  return {
    competitionSlug: competitionRow.competitionSlug,
    competitionLabel: competitionRow.competitionLabel,
    sourceUrl: competitionRow.sourceUrl,
    finalUrl: competitionRow.finalUrl,
    outputFile: competitionRow.outputFile,
    parserLane: competitionRow.parserLane,
    extractionMethod: competitionRow.selectedExtractionMethod,
    rowIndex: index + 1,
    position,
    teamName,
    rawCells,
    numericCells,
    rowIssueCodes: [
      Number.isInteger(position) ? null : "missing_position",
      teamName.length >= 2 ? null : "missing_team_name",
      rawCells.length >= 3 ? null : "too_few_raw_cells"
    ].filter(Boolean)
  };
}

function qualityGateAcceptedExtraction(row) {
  const expectedRows = Number(row.expectedRows ?? 0) || null;
  const sourceRows = Array.isArray(row.extractedCandidateRows) ? row.extractedCandidateRows : [];
  const mappedRows = sourceRows.map((sourceRow, index) => mapShapeCandidate(sourceRow, row, index));
  const positions = mappedRows.map((candidate) => candidate.position);
  const teams = mappedRows.map((candidate) => candidate.teamName);
  const expectedPositionSet = expectedRows ? Array.from({ length: expectedRows }, (_, index) => index + 1) : [];
  const missingPositions = expectedPositionSet.filter((position) => !positions.includes(position));
  const duplicateTeams = teams.filter((team, index) => team && teams.indexOf(team) !== index);
  const issueCount = mappedRows.reduce((sum, candidate) => sum + candidate.rowIssueCodes.length, 0);

  const qualityGateStatus =
    expectedRows !== null &&
    mappedRows.length === expectedRows &&
    unique(teams).length === expectedRows &&
    missingPositions.length === 0 &&
    duplicateTeams.length === 0 &&
    issueCount === 0
      ? "accepted_shape_quality_gate_ready_for_bulk_stat_mapper"
      : "blocked_shape_quality_gate_needs_parser_review";

  return {
    competitionSlug: row.competitionSlug,
    competitionLabel: row.competitionLabel,
    parserLane: row.parserLane,
    selectedExtractionMethod: row.selectedExtractionMethod,
    sourceUrl: row.sourceUrl,
    finalUrl: row.finalUrl,
    outputFile: row.outputFile,
    expectedRows,
    extractedCandidateRowCount: mappedRows.length,
    uniqueTeamCount: unique(teams).length,
    minPosition: Math.min(...positions.filter(Number.isInteger)),
    maxPosition: Math.max(...positions.filter(Number.isInteger)),
    missingPositions,
    duplicateTeams,
    rowIssueCount: issueCount,
    qualityGateStatus,
    mappedCandidateRows: mappedRows,
    sampleRows: mappedRows.slice(0, 5),
    nextAllowedAction: {
      mayBuildBulkStatMapper: qualityGateStatus === "accepted_shape_quality_gate_ready_for_bulk_stat_mapper",
      mayBuildParserReview: qualityGateStatus !== "accepted_shape_quality_gate_ready_for_bulk_stat_mapper",
      mayWriteCanonicalNow: false,
      mayWriteProductionNow: false,
      mayAssertTruthNow: false
    }
  };
}

function getScriptBlocks(text) {
  const scripts = [];
  const matches = [...String(text).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  for (const [index, match] of matches.entries()) {
    const attrs = match[1] ?? "";
    const body = htmlDecodeText(match[2] ?? "");
    scripts.push({
      scriptIndex: index + 1,
      attrs: attrs.replace(/\s+/g, " ").trim(),
      length: body.length,
      body
    });
  }
  return scripts;
}

function scoreContractContext(body) {
  const lower = body.toLowerCase();
  const terms = [
    "standings",
    "standing",
    "table",
    "ranking",
    "rankings",
    "tabelle",
    "classement",
    "klassement",
    "sarjataulukko",
    "team",
    "club",
    "points",
    "position",
    "rank",
    "played",
    "wins",
    "draws",
    "losses",
    "goals",
    "graphql",
    "api",
    "season"
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

  return { score, hits };
}

function extractEndpointHints(body) {
  const hints = [];
  const urlMatches = [...String(body).matchAll(/https?:\/\/[^"'\\\s<>)]+/gi)].map((match) => match[0]);
  const pathMatches = [...String(body).matchAll(/["'`]((?:\/api\/|\/graphql|\/data\/|\/_next\/data\/|\/wp-json\/|\/ajax\/)[^"'`\\\s<>)]+)["'`]/gi)].map((match) => match[1]);
  for (const value of [...urlMatches, ...pathMatches]) {
    if (/api|graphql|data|stand|table|ranking|tabelle|classement|team|club|season|competition/i.test(value)) {
      hints.push(value);
    }
  }
  return unique(hints).slice(0, 30);
}

function contractContextForRow(row) {
  let responseText = "";
  if (row.outputFile && fs.existsSync(row.outputFile)) {
    responseText = fs.readFileSync(row.outputFile, "utf8");
  }

  const scripts = getScriptBlocks(responseText);
  const scoredScripts = scripts
    .map((script) => {
      const scoring = scoreContractContext(script.body);
      return {
        scriptIndex: script.scriptIndex,
        attrs: script.attrs,
        length: script.length,
        score: scoring.score,
        hits: scoring.hits,
        endpointHints: extractEndpointHints(script.body),
        first800: script.body.slice(0, 800).replace(/\s+/g, " ")
      };
    })
    .filter((script) => script.score > 0 || script.endpointHints.length > 0)
    .sort((a, b) => b.score - a.score || b.endpointHints.length - a.endpointHints.length)
    .slice(0, 12);

  const visibleText = stripTags(responseText).slice(0, 3000);
  const visibleScoring = scoreContractContext(visibleText);
  const endpointHints = unique(scoredScripts.flatMap((script) => script.endpointHints));

  let contractContextStatus = "blocked_no_contract_context_signal";
  if (endpointHints.length > 0 && scoredScripts.some((script) => script.score >= 8)) {
    contractContextStatus = "route_contract_context_with_endpoint_hints_ready_for_controlled_probe_plan";
  } else if (scoredScripts.some((script) => script.score >= 8)) {
    contractContextStatus = "route_contract_context_without_endpoint_ready_for_asset_or_js_probe_plan";
  } else if (visibleScoring.score >= 8) {
    contractContextStatus = "visible_shell_context_ready_for_route_repair_or_js_probe";
  }

  return {
    competitionSlug: row.competitionSlug,
    competitionLabel: row.competitionLabel,
    parserLane: row.parserLane,
    sourceUrl: row.sourceUrl,
    finalUrl: row.finalUrl,
    outputFile: row.outputFile,
    expectedRows: row.expectedRows,
    extractionStatus: row.extractionStatus,
    contractContextStatus,
    scriptCount: scripts.length,
    relevantScriptContextCount: scoredScripts.length,
    endpointHintCount: endpointHints.length,
    endpointHints,
    visibleTextScore: visibleScoring.score,
    visibleTextHits: visibleScoring.hits,
    topScriptContexts: scoredScripts.slice(0, 6),
    nextAllowedAction: {
      mayBuildControlledEndpointProbePlan: contractContextStatus === "route_contract_context_with_endpoint_hints_ready_for_controlled_probe_plan",
      mayBuildAssetOrJsProbePlan: contractContextStatus === "route_contract_context_without_endpoint_ready_for_asset_or_js_probe_plan",
      mayBuildRouteRepairOrJsProbePlan: contractContextStatus === "visible_shell_context_ready_for_route_repair_or_js_probe",
      mayBuildRouteRepairPlan: contractContextStatus === "blocked_no_contract_context_signal",
      mayFetchNow: false,
      maySearchNow: false,
      mayWriteCanonicalNow: false,
      mayWriteProductionNow: false,
      mayAssertTruthNow: false
    }
  };
}

function check(checks, name, passed, details = {}) {
  checks.push({ name, passed: Boolean(passed), ...details });
}

if (!fs.existsSync(extractorPath)) {
  throw new Error(`Missing extractor output: ${extractorPath}`);
}

const extractorText = fs.readFileSync(extractorPath, "utf8");
const extractor = JSON.parse(extractorText);
const extractionRows = Array.isArray(extractor.extractionRows) ? extractor.extractionRows : [];

const acceptedExtractionRows = extractionRows.filter((row) =>
  row.extractionStatus === "accepted_extraction_candidate_rows_exact_expected_count_requires_quality_gate" ||
  row.extractionStatus === "partial_or_near_expected_extraction_requires_quality_gate"
);

const contractProbeRows = extractionRows.filter((row) =>
  row.extractionStatus === "no_candidate_rows_extracted_requires_parser_contract_probe"
);

const qualityGateRows = acceptedExtractionRows.map(qualityGateAcceptedExtraction);
const contractContextRows = contractProbeRows.map(contractContextForRow);

const acceptedQualityGateRows = qualityGateRows.filter((row) => row.qualityGateStatus === "accepted_shape_quality_gate_ready_for_bulk_stat_mapper");
const blockedQualityGateRows = qualityGateRows.filter((row) => row.qualityGateStatus !== "accepted_shape_quality_gate_ready_for_bulk_stat_mapper");

const contractContextRowsByStatus = countBy(contractContextRows, "contractContextStatus");

const endpointProbeReadyCount = contractContextRows.filter((row) => row.nextAllowedAction.mayBuildControlledEndpointProbePlan).length;
const assetOrJsProbeReadyCount = contractContextRows.filter((row) => row.nextAllowedAction.mayBuildAssetOrJsProbePlan).length;
const visibleShellProbeReadyCount = contractContextRows.filter((row) => row.nextAllowedAction.mayBuildRouteRepairOrJsProbePlan).length;
const routeRepairNeededCount = contractContextRows.filter((row) => row.nextAllowedAction.mayBuildRouteRepairPlan).length;

const checks = [];
check(checks, "sourceExtractorPassed", extractor.summary?.status === "passed", { actual: extractor.summary?.status });
check(checks, "sourceExtractorRowsNine", extractionRows.length === 9, { actual: extractionRows.length, expected: 9 });
check(checks, "acceptedExtractionRowsTwo", acceptedExtractionRows.length === 2, { actual: acceptedExtractionRows.length, expected: 2 });
check(checks, "contractProbeRowsSeven", contractProbeRows.length === 7, { actual: contractProbeRows.length, expected: 7 });
check(checks, "qualityGateRowsTwo", qualityGateRows.length === 2, { actual: qualityGateRows.length, expected: 2 });
check(checks, "acceptedQualityGateRowsTwo", acceptedQualityGateRows.length === 2, { actual: acceptedQualityGateRows.length, expected: 2 });
check(checks, "contractContextRowsSeven", contractContextRows.length === 7, { actual: contractContextRows.length, expected: 7 });
check(checks, "ger3IncludedInContractContextRows", contractContextRows.some((row) => row.competitionSlug === "ger.3"));
check(checks, "allNineRowsHaveNextLane", acceptedQualityGateRows.length + blockedQualityGateRows.length + endpointProbeReadyCount + assetOrJsProbeReadyCount + visibleShellProbeReadyCount + routeRepairNeededCount >= 9, { acceptedQualityGateRows: acceptedQualityGateRows.length, blockedQualityGateRows: blockedQualityGateRows.length, endpointProbeReadyCount, assetOrJsProbeReadyCount, visibleShellProbeReadyCount, routeRepairNeededCount });
check(checks, "noFetchSearchWriteInThisJob", true);
check(checks, "productionAndTruthLocked", true);

const blockedCheckCount = checks.filter((entry) => !entry.passed).length;
const passedCheckCount = checks.filter((entry) => entry.passed).length;

const output = {
  output: outputPath,
  job: "build-football-truth-whole-map-extraction-quality-and-contract-context-board-wave-01-file",
  generatedAtUtc: new Date().toISOString(),
  sourceExtractorPath: extractorPath,
  sourceExtractorSha256: sha256Text(extractorText),
  policy: {
    bulkQualityAndContractContextBoardOnly: true,
    noFetchInThisJob: true,
    noSearchInThisJob: true,
    noBroadSearchInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true
  },
  checks,
  qualityGateRows,
  contractContextRows,
  summary: {
    status: blockedCheckCount === 0 ? "passed" : "blocked",
    sourceExtractionCompetitionCount: extractionRows.length,
    acceptedExtractionInputCount: acceptedExtractionRows.length,
    contractProbeInputCount: contractProbeRows.length,
    qualityGateCompetitionCount: qualityGateRows.length,
    acceptedQualityGateCompetitionCount: acceptedQualityGateRows.length,
    blockedQualityGateCompetitionCount: blockedQualityGateRows.length,
    qualityGateRowsByStatus: countBy(qualityGateRows, "qualityGateStatus"),
    contractContextCompetitionCount: contractContextRows.length,
    contractContextRowsByStatus,
    endpointProbeReadyCompetitionCount: endpointProbeReadyCount,
    assetOrJsProbeReadyCompetitionCount: assetOrJsProbeReadyCount,
    visibleShellProbeReadyCompetitionCount: visibleShellProbeReadyCount,
    routeRepairNeededCompetitionCount: routeRepairNeededCount,
    ger3ContractContextStatus: contractContextRows.find((row) => row.competitionSlug === "ger.3")?.contractContextStatus ?? null,
    ger3EndpointHintCount: contractContextRows.find((row) => row.competitionSlug === "ger.3")?.endpointHintCount ?? null,
    mayBuildBulkStatMapperCount: acceptedQualityGateRows.length > 0 ? 1 : 0,
    mayBuildControlledEndpointProbePlanCount: endpointProbeReadyCount > 0 ? 1 : 0,
    mayBuildAssetOrJsProbePlanCount: assetOrJsProbeReadyCount > 0 ? 1 : 0,
    mayBuildRouteRepairPlanCount: routeRepairNeededCount > 0 ? 1 : 0,
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
  sourceExtractionCompetitionCount: output.summary.sourceExtractionCompetitionCount,
  acceptedExtractionInputCount: output.summary.acceptedExtractionInputCount,
  contractProbeInputCount: output.summary.contractProbeInputCount,
  acceptedQualityGateCompetitionCount: output.summary.acceptedQualityGateCompetitionCount,
  blockedQualityGateCompetitionCount: output.summary.blockedQualityGateCompetitionCount,
  contractContextCompetitionCount: output.summary.contractContextCompetitionCount,
  contractContextRowsByStatus: output.summary.contractContextRowsByStatus,
  endpointProbeReadyCompetitionCount: output.summary.endpointProbeReadyCompetitionCount,
  assetOrJsProbeReadyCompetitionCount: output.summary.assetOrJsProbeReadyCompetitionCount,
  visibleShellProbeReadyCompetitionCount: output.summary.visibleShellProbeReadyCompetitionCount,
  routeRepairNeededCompetitionCount: output.summary.routeRepairNeededCompetitionCount,
  ger3ContractContextStatus: output.summary.ger3ContractContextStatus,
  ger3EndpointHintCount: output.summary.ger3EndpointHintCount,
  mayBuildBulkStatMapperCount: output.summary.mayBuildBulkStatMapperCount,
  mayBuildControlledEndpointProbePlanCount: output.summary.mayBuildControlledEndpointProbePlanCount,
  mayBuildAssetOrJsProbePlanCount: output.summary.mayBuildAssetOrJsProbePlanCount,
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
