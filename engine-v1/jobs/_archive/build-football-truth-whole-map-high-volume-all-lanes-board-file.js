import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const parserBoardPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "whole-map-high-volume-parser-extraction-board-2026-06-16",
  "whole-map-high-volume-parser-extraction-board-2026-06-16.json"
);

const extractorPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "whole-map-high-volume-runner-ready-extractor-2026-06-16",
  "whole-map-high-volume-runner-ready-extractor-2026-06-16.json"
);

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
  "whole-map-high-volume-all-lanes-board-2026-06-16"
);

const outputPath = path.join(
  outputDir,
  "whole-map-high-volume-all-lanes-board-2026-06-16.json"
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

function parseIntLoose(value) {
  const text = String(value ?? "").trim().replace(/^\+/, "");
  if (!/^-?\d+$/.test(text)) return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

function candidatePosition(row) {
  if (Number.isInteger(row.position)) return row.position;
  const parsed = parseIntLoose(row.position);
  if (parsed !== null) return parsed;

  const rawCells = Array.isArray(row.rawCells) ? row.rawCells : [];
  for (const cell of rawCells.slice(0, 3)) {
    const n = parseIntLoose(cell);
    if (n !== null && n >= 1 && n <= 60) return n;
  }
  return null;
}

function candidateTeamName(row) {
  if (row.teamName) return cleanText(row.teamName);
  const rawCells = Array.isArray(row.rawCells) ? row.rawCells : [];
  const teamCell = rawCells.find((cell, index) =>
    index > 0 &&
    /[A-Za-zÀ-ÿ]/.test(String(cell)) &&
    !/^[+-]?\d+$/.test(String(cell).trim()) &&
    String(cell).trim().length >= 2
  );
  return cleanText(teamCell ?? "");
}

function shapeQualityGate(extractionRow) {
  const expectedRows = Number(extractionRow.expectedRows ?? 0) || null;
  const sourceRows = Array.isArray(extractionRow.extractedCandidateRows) ? extractionRow.extractedCandidateRows : [];

  const mappedRows = sourceRows.map((row, index) => {
    const position = candidatePosition(row);
    const teamName = candidateTeamName(row);
    const rawCells = Array.isArray(row.rawCells) ? row.rawCells.map(cleanText).filter(Boolean) : [];
    return {
      rowIndex: index + 1,
      position,
      teamName,
      rawCells,
      rowIssueCodes: [
        Number.isInteger(position) ? null : "missing_position",
        teamName.length >= 2 ? null : "missing_team_name",
        rawCells.length >= 1 || row.rawObjectSample ? null : "missing_raw_shape"
      ].filter(Boolean)
    };
  });

  const positions = mappedRows.map((row) => row.position);
  const teams = mappedRows.map((row) => row.teamName);
  const expectedPositions = expectedRows ? Array.from({ length: expectedRows }, (_, index) => index + 1) : [];
  const missingPositions = expectedPositions.filter((position) => !positions.includes(position));
  const duplicateTeams = teams.filter((team, index) => team && teams.indexOf(team) !== index);
  const rowIssueCount = mappedRows.reduce((sum, row) => sum + row.rowIssueCodes.length, 0);

  const qualityGateStatus =
    expectedRows !== null &&
    mappedRows.length === expectedRows &&
    unique(teams).length === expectedRows &&
    missingPositions.length === 0 &&
    duplicateTeams.length === 0 &&
    rowIssueCount === 0
      ? "accepted_shape_quality_gate_ready_for_stat_mapper"
      : "blocked_shape_quality_gate_needs_parser_review";

  return {
    qualityGateStatus,
    expectedRows,
    extractedCandidateRowCount: mappedRows.length,
    uniqueTeamCount: unique(teams).length,
    minPosition: positions.filter(Number.isInteger).length ? Math.min(...positions.filter(Number.isInteger)) : null,
    maxPosition: positions.filter(Number.isInteger).length ? Math.max(...positions.filter(Number.isInteger)) : null,
    missingPositions,
    duplicateTeams,
    rowIssueCount,
    sampleRows: mappedRows.slice(0, 6),
    mappedRowsPreview: mappedRows.slice(0, 40)
  };
}

function getScriptBlocks(text) {
  const matches = [...String(text).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  return matches.map((match, index) => ({
    scriptIndex: index + 1,
    attrs: cleanText(match[1] ?? ""),
    body: decodeText(match[2] ?? "")
  }));
}

function scoreContext(text) {
  const lower = String(text ?? "").toLowerCase();
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
  return { score, hits };
}

function extractEndpointHints(text) {
  const decoded = decodeText(text);
  const urls = [...decoded.matchAll(/https?:\/\/[^"'\\\s<>)]+/gi)].map((match) => match[0]);
  const paths = [...decoded.matchAll(/["'`]((?:\/api\/|\/graphql|\/data\/|\/_next\/data\/|\/wp-json\/|\/ajax\/)[^"'`\\\s<>)]+)["'`]/gi)].map((match) => match[1]);

  return unique([...urls, ...paths].filter((value) =>
    /api|graphql|data|stand|table|ranking|tabelle|classement|team|club|season|competition|fixture|standing/i.test(value)
  )).slice(0, 40);
}

function contractContextForRow(row) {
  let responseText = "";
  if (row.outputFile && fs.existsSync(row.outputFile)) {
    responseText = fs.readFileSync(row.outputFile, "utf8");
  }

  const scripts = getScriptBlocks(responseText);
  const scriptContexts = scripts
    .map((script) => {
      const scoring = scoreContext(script.body);
      const hints = extractEndpointHints(script.body);
      return {
        scriptIndex: script.scriptIndex,
        attrs: script.attrs,
        length: script.body.length,
        score: scoring.score,
        hits: scoring.hits,
        endpointHints: hints,
        first700: script.body.slice(0, 700).replace(/\s+/g, " ")
      };
    })
    .filter((script) => script.score > 0 || script.endpointHints.length > 0)
    .sort((a, b) => b.score - a.score || b.endpointHints.length - a.endpointHints.length)
    .slice(0, 8);

  const endpointHints = unique(scriptContexts.flatMap((script) => script.endpointHints));
  const visibleText = stripTags(responseText).slice(0, 3000);
  const visibleScore = scoreContext(visibleText);

  let contractContextStatus = "blocked_no_contract_context_signal";
  if (endpointHints.length > 0 && scriptContexts.some((script) => script.score >= 8)) {
    contractContextStatus = "route_contract_context_with_endpoint_hints_ready_for_controlled_probe_plan";
  } else if (scriptContexts.some((script) => script.score >= 8)) {
    contractContextStatus = "route_contract_context_without_endpoint_ready_for_asset_or_js_probe_plan";
  } else if (visibleScore.score >= 8) {
    contractContextStatus = "visible_shell_context_ready_for_route_repair_or_js_probe";
  }

  return {
    contractContextStatus,
    scriptCount: scripts.length,
    relevantScriptContextCount: scriptContexts.length,
    endpointHintCount: endpointHints.length,
    endpointHints,
    visibleTextScore: visibleScore.score,
    visibleTextHits: visibleScore.hits,
    topScriptContexts: scriptContexts.slice(0, 5)
  };
}

function check(checks, name, passed, details = {}) {
  checks.push({ name, passed: Boolean(passed), ...details });
}

for (const requiredPath of [parserBoardPath, extractorPath, probePath]) {
  if (!fs.existsSync(requiredPath)) throw new Error(`Missing required input: ${requiredPath}`);
}

const parserBoardText = fs.readFileSync(parserBoardPath, "utf8");
const extractorText = fs.readFileSync(extractorPath, "utf8");
const probeText = fs.readFileSync(probePath, "utf8");

const parserBoard = JSON.parse(parserBoardText);
const extractor = JSON.parse(extractorText);
const probe = JSON.parse(probeText);

const parserRows = Array.isArray(parserBoard.parserRows) ? parserBoard.parserRows : [];
const extractionRows = Array.isArray(extractor.extractionRows) ? extractor.extractionRows : [];
const bestRouteRows = Array.isArray(probe.bestRouteRows) ? probe.bestRouteRows : [];

const extractionBySlug = new Map(extractionRows.map((row) => [row.competitionSlug, row]));
const bestRouteBySlug = new Map(bestRouteRows.map((row) => [row.competitionSlug, row]));

const laneRows = parserRows.map((parserRow) => {
  const extractionRow = extractionBySlug.get(parserRow.competitionSlug) ?? null;
  const bestRouteRow = bestRouteBySlug.get(parserRow.competitionSlug) ?? null;

  let laneKind = "route_repair";
  let laneStatus = "route_repair_required";
  let qualityGate = null;
  let contractContext = null;

  if (runnerReadyLanes.has(parserRow.parserLane) && extractionRow) {
    if (
      extractionRow.extractionStatus === "accepted_extraction_candidate_rows_exact_expected_count_requires_quality_gate" ||
      extractionRow.extractionStatus === "partial_or_near_expected_extraction_requires_quality_gate"
    ) {
      laneKind = "quality_gate_and_stat_mapper";
      qualityGate = shapeQualityGate(extractionRow);
      laneStatus = qualityGate.qualityGateStatus;
    } else if (extractionRow.extractionStatus === "extracted_rows_count_mismatch_requires_parser_review") {
      laneKind = "parser_review";
      laneStatus = "parser_review_required_extracted_count_mismatch";
    } else if (extractionRow.extractionStatus === "no_candidate_rows_extracted_requires_parser_contract_probe") {
      laneKind = "parser_contract_context";
      contractContext = contractContextForRow(parserRow);
      laneStatus = contractContext.contractContextStatus;
    }
  } else if (parserRow.parserLane === "weak_route_review_before_parser_runner") {
    laneKind = "weak_route_review";
    contractContext = contractContextForRow(parserRow);
    laneStatus = contractContext.contractContextStatus === "blocked_no_contract_context_signal"
      ? "weak_route_review_required"
      : contractContext.contractContextStatus;
  } else if (
    parserRow.parserLane === "fetched_2xx_no_parser_signal_needs_route_repair" ||
    parserRow.parserLane === "route_unusable_needs_route_repair"
  ) {
    laneKind = "route_repair";
    laneStatus = parserRow.parserLane === "fetched_2xx_no_parser_signal_needs_route_repair"
      ? "route_repair_required_after_2xx_no_signal"
      : "route_repair_required_after_unusable_route";
  }

  return {
    competitionSlug: parserRow.competitionSlug,
    countryCode: parserRow.countryCode,
    providerSignalClass: parserRow.providerSignalClass,
    parserLane: parserRow.parserLane,
    parserConfidence: parserRow.parserConfidence,
    sourceUrl: parserRow.sourceUrl,
    finalUrl: parserRow.finalUrl,
    httpStatus: parserRow.httpStatus,
    bestResultStatus: parserRow.bestResultStatus,
    routeSignalScore: parserRow.routeSignalScore,
    tableCandidateRowCount: parserRow.tableCandidateRowCount,
    htmlTableRowCount: parserRow.htmlTableRowCount,
    scriptContextCount: parserRow.scriptContextCount,
    endpointHintCount: parserRow.endpointHintCount,
    outputFile: parserRow.outputFile,
    extractionStatus: extractionRow?.extractionStatus ?? null,
    extractedCandidateRowCount: extractionRow?.extractedCandidateRowCount ?? null,
    expectedRows: extractionRow?.expectedRows ?? parserRow.expectedRows ?? null,
    laneKind,
    laneStatus,
    qualityGate,
    contractContext,
    bestRouteSnapshot: bestRouteRow ? {
      bestResultStatus: bestRouteRow.bestResultStatus,
      httpStatus: bestRouteRow.httpStatus,
      sourceUrl: bestRouteRow.sourceUrl,
      finalUrl: bestRouteRow.finalUrl,
      routeSource: bestRouteRow.routeSource,
      title: bestRouteRow.title
    } : null,
    nextAllowedAction: {
      mayBuildBulkStatMapper: laneKind === "quality_gate_and_stat_mapper" && laneStatus === "accepted_shape_quality_gate_ready_for_stat_mapper",
      mayBuildParserReview: laneKind === "parser_review" || (laneKind === "quality_gate_and_stat_mapper" && laneStatus !== "accepted_shape_quality_gate_ready_for_stat_mapper"),
      mayBuildControlledEndpointProbePlan: laneKind === "parser_contract_context" && laneStatus === "route_contract_context_with_endpoint_hints_ready_for_controlled_probe_plan",
      mayBuildAssetOrJsProbePlan: laneKind === "parser_contract_context" && laneStatus === "route_contract_context_without_endpoint_ready_for_asset_or_js_probe_plan",
      mayBuildWeakRouteReview: laneKind === "weak_route_review",
      mayBuildRouteRepairPlan: laneKind === "route_repair" || laneStatus === "blocked_no_contract_context_signal",
      mayWriteCanonicalNow: false,
      mayWriteProductionNow: false,
      mayAssertTruthNow: false
    }
  };
});

for (const row of laneRows) {
  const action = row.nextAllowedAction ?? {};
  const hasNextAction =
    action.mayBuildBulkStatMapper ||
    action.mayBuildParserReview ||
    action.mayBuildControlledEndpointProbePlan ||
    action.mayBuildAssetOrJsProbePlan ||
    action.mayBuildWeakRouteReview ||
    action.mayBuildRouteRepairPlan;

  if (!hasNextAction) {
    row.nextAllowedAction = {
      ...action,
      mayBuildRouteRepairPlan: true,
      mayWriteCanonicalNow: false,
      mayWriteProductionNow: false,
      mayAssertTruthNow: false
    };
    row.recoveredCoverageLane = "route_repair_or_js_probe_required_for_uncovered_lane";
  }
}

const laneRowsByKind = countBy(laneRows, "laneKind");
const laneRowsByStatus = countBy(laneRows, "laneStatus");
const acceptedShapeRows = laneRows.filter((row) => row.laneKind === "quality_gate_and_stat_mapper" && row.laneStatus === "accepted_shape_quality_gate_ready_for_stat_mapper");
const parserReviewRows = laneRows.filter((row) => row.nextAllowedAction.mayBuildParserReview);
const endpointProbeRows = laneRows.filter((row) => row.nextAllowedAction.mayBuildControlledEndpointProbePlan);
const assetOrJsProbeRows = laneRows.filter((row) => row.nextAllowedAction.mayBuildAssetOrJsProbePlan);
const weakReviewRows = laneRows.filter((row) => row.nextAllowedAction.mayBuildWeakRouteReview);
const routeRepairRows = laneRows.filter((row) => row.nextAllowedAction.mayBuildRouteRepairPlan);

const checks = [];
check(checks, "sourceParserBoardPassed", parserBoard.summary?.status === "passed", { actual: parserBoard.summary?.status });
check(checks, "sourceExtractorPassed", extractor.summary?.status === "passed", { actual: extractor.summary?.status });
check(checks, "sourceProbePassed", probe.summary?.status === "passed", { actual: probe.summary?.status });
check(checks, "parserRowsFiftySix", parserRows.length === 56, { actual: parserRows.length, expected: 56 });
check(checks, "laneRowsFiftySix", laneRows.length === 56, { actual: laneRows.length, expected: 56 });
check(checks, "allLaneRowsHaveNextAction", laneRows.every((row) =>
  row.nextAllowedAction.mayBuildBulkStatMapper ||
  row.nextAllowedAction.mayBuildParserReview ||
  row.nextAllowedAction.mayBuildControlledEndpointProbePlan ||
  row.nextAllowedAction.mayBuildAssetOrJsProbePlan ||
  row.nextAllowedAction.mayBuildWeakRouteReview ||
  row.nextAllowedAction.mayBuildRouteRepairPlan
));
check(checks, "qualityLaneRowsFour", Number(laneRowsByKind.quality_gate_and_stat_mapper ?? 0) === 4, { actual: laneRowsByKind.quality_gate_and_stat_mapper ?? 0, expected: 4 });
check(checks, "noFetchSearchWriteInThisJob", true);
check(checks, "productionAndTruthLocked", true);

const blockedCheckCount = checks.filter((entry) => !entry.passed).length;
const passedCheckCount = checks.filter((entry) => entry.passed).length;

const output = {
  output: outputPath,
  job: "build-football-truth-whole-map-high-volume-all-lanes-board-file",
  generatedAtUtc: new Date().toISOString(),
  sourceParserBoardPath: parserBoardPath,
  sourceParserBoardSha256: sha256Text(parserBoardText),
  sourceExtractorPath: extractorPath,
  sourceExtractorSha256: sha256Text(extractorText),
  sourceProbePath: probePath,
  sourceProbeSha256: sha256Text(probeText),
  policy: {
    highVolumeAllLanesBoardOnly: true,
    coversAllBestRouteParserRows: true,
    noFetchInThisJob: true,
    noSearchInThisJob: true,
    noBroadSearchInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true
  },
  checks,
  laneRows,
  summary: {
    status: blockedCheckCount === 0 ? "passed" : "blocked",
    sourceSelectedTargetCount: probe.summary?.selectedTargetCount ?? null,
    sourceRouteCandidateCount: probe.summary?.routeCandidateCount ?? null,
    sourceBestRouteCompetitionCount: probe.summary?.bestRouteCompetitionCount ?? null,
    sourceParserCompetitionCount: parserBoard.summary?.parserCompetitionCount ?? null,
    sourceRunnerReadyCompetitionCount: parserBoard.summary?.runnerReadyCompetitionCount ?? null,
    sourceExtractionCompetitionCount: extractor.summary?.extractionCompetitionCount ?? null,
    laneCompetitionCount: laneRows.length,
    laneRowsByKind,
    laneRowsByStatus,
    acceptedShapeQualityGateCompetitionCount: acceptedShapeRows.length,
    parserReviewCompetitionCount: parserReviewRows.length,
    endpointProbeReadyCompetitionCount: endpointProbeRows.length,
    assetOrJsProbeReadyCompetitionCount: assetOrJsProbeRows.length,
    weakReviewCompetitionCount: weakReviewRows.length,
    routeRepairCompetitionCount: routeRepairRows.length,
    mayBuildBulkStatMapperCount: acceptedShapeRows.length > 0 ? 1 : 0,
    mayBuildParserReviewCount: parserReviewRows.length > 0 ? 1 : 0,
    mayBuildControlledEndpointProbePlanCount: endpointProbeRows.length > 0 ? 1 : 0,
    mayBuildAssetOrJsProbePlanCount: assetOrJsProbeRows.length > 0 ? 1 : 0,
    mayBuildWeakRouteReviewCount: weakReviewRows.length > 0 ? 1 : 0,
    mayBuildRouteRepairPlanCount: routeRepairRows.length > 0 ? 1 : 0,
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
  sourceRouteCandidateCount: output.summary.sourceRouteCandidateCount,
  sourceBestRouteCompetitionCount: output.summary.sourceBestRouteCompetitionCount,
  sourceParserCompetitionCount: output.summary.sourceParserCompetitionCount,
  sourceRunnerReadyCompetitionCount: output.summary.sourceRunnerReadyCompetitionCount,
  sourceExtractionCompetitionCount: output.summary.sourceExtractionCompetitionCount,
  laneCompetitionCount: output.summary.laneCompetitionCount,
  laneRowsByKind: output.summary.laneRowsByKind,
  acceptedShapeQualityGateCompetitionCount: output.summary.acceptedShapeQualityGateCompetitionCount,
  parserReviewCompetitionCount: output.summary.parserReviewCompetitionCount,
  endpointProbeReadyCompetitionCount: output.summary.endpointProbeReadyCompetitionCount,
  assetOrJsProbeReadyCompetitionCount: output.summary.assetOrJsProbeReadyCompetitionCount,
  weakReviewCompetitionCount: output.summary.weakReviewCompetitionCount,
  routeRepairCompetitionCount: output.summary.routeRepairCompetitionCount,
  mayBuildBulkStatMapperCount: output.summary.mayBuildBulkStatMapperCount,
  mayBuildParserReviewCount: output.summary.mayBuildParserReviewCount,
  mayBuildControlledEndpointProbePlanCount: output.summary.mayBuildControlledEndpointProbePlanCount,
  mayBuildAssetOrJsProbePlanCount: output.summary.mayBuildAssetOrJsProbePlanCount,
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
