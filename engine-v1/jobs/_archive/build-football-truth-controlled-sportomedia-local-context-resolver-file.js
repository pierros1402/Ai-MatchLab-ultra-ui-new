import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const validationPlanPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-sportomedia-route-contract-validation-plan-2026-06-16",
  "controlled-sportomedia-route-contract-validation-plan-2026-06-16.json"
);

const runnerPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-sportomedia-accepted-asset-micro-probe-runner-2026-06-16",
  "controlled-sportomedia-accepted-asset-micro-probe-runner-2026-06-16.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-sportomedia-local-context-resolver-2026-06-16"
);

const outputPath = path.join(
  outputDir,
  "controlled-sportomedia-local-context-resolver-2026-06-16.json"
);

const expectedCompetitions = ["swe.1", "swe.2"];

const resolverNeedlesByKind = {
  local_graphql_runtime_binding_context_resolution: [
    "window.gqlURI",
    "gqlUri",
    "gqlURI",
    "graphql",
    "GraphQL",
    "/graphql-response+json"
  ],
  local_standings_operation_context_resolution: [
    "standingsForLeague",
    "s.standingsForLeague",
    "standings",
    "standing"
  ],
  local_standings_dom_schema_confirmation: [
    "standings-table__name",
    "standings-table__points",
    "standings-table__games",
    "standings-table__wins",
    "standings-table__ties",
    "standings-table__losses",
    "standings-table__goals-scored",
    "standings-table__goals-conceded",
    "standings-table__goals-difference"
  ],
  local_data_endpoint_binding_context_resolution: [
    "data-endpoint",
    "endpointUrl",
    "/data-endpoint/",
    "/data-endpoint/vote",
    "wp-json",
    "ajax"
  ]
};

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function sha256Text(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sha256Buffer(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function uniqueSorted(values) {
  return [...new Set(values.filter((value) => value !== null && value !== undefined && value !== "").map(String))].sort();
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = String(row[key] ?? "unknown");
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function boundedFindAll(text, needle, maxCount = 24) {
  const offsets = [];
  let cursor = 0;
  while (offsets.length < maxCount) {
    const found = text.indexOf(needle, cursor);
    if (found === -1) break;
    offsets.push(found);
    cursor = found + Math.max(needle.length, 1);
  }
  return offsets;
}

function contextAt(text, offset, radius = 850) {
  const start = Math.max(0, offset - radius);
  const end = Math.min(text.length, offset + radius);
  return text.slice(start, end).replace(/\s+/g, " ").slice(0, 2200);
}

function classifyResolution(context) {
  const lower = String(context).toLowerCase();
  const signals = [];
  if (lower.includes("window.gqluri") || lower.includes("gqluri")) signals.push("graphql_uri_runtime_binding_signal");
  if (lower.includes("standingsforleague")) signals.push("standings_for_league_operation_signal");
  if (lower.includes("standings-table__points") || lower.includes("standings-table__games")) signals.push("standings_table_dom_schema_signal");
  if (lower.includes("data-endpoint") || lower.includes("endpointurl")) signals.push("data_endpoint_binding_signal");
  if (lower.includes("graphql")) signals.push("graphql_general_signal");
  if (lower.includes("tabell")) signals.push("official_standings_route_signal");
  return uniqueSorted(signals);
}

function extractLocalHints(context) {
  const normalized = String(context).replace(/\\u002F/g, "/").replace(/\\\//g, "/");
  const hints = [];

  const regexes = [
    /\bwindow\.gqlURI\b.{0,160}/gi,
    /\bgqlUri\b.{0,160}/gi,
    /\bstandingsForLeague\b.{0,160}/gi,
    /\bendpointUrl\b.{0,160}/gi,
    /\bdata-endpoint\b.{0,160}/gi,
    /\/[A-Za-z0-9._~:/?#@!$&'()*+,;=%-]{3,180}/g,
    /standings-table__[a-z0-9-]+/gi
  ];

  for (const re of regexes) {
    let match;
    while ((match = re.exec(normalized)) !== null && hints.length < 40) {
      const value = match[0].slice(0, 220);
      if (!hints.includes(value)) hints.push(value);
    }
  }

  return hints;
}

function assertCheck(checks, name, passed, details = {}) {
  checks.push({ name, passed: Boolean(passed), ...details });
}

if (!fs.existsSync(validationPlanPath)) {
  throw new Error(`Missing validation plan output: ${validationPlanPath}`);
}

if (!fs.existsSync(runnerPath)) {
  throw new Error(`Missing micro probe runner output: ${runnerPath}`);
}

const validationPlanText = readText(validationPlanPath);
const validationPlan = JSON.parse(validationPlanText);
const runnerText = readText(runnerPath);
const runner = JSON.parse(runnerText);

const validationPlanRows = Array.isArray(validationPlan.validationPlanRows) ? validationPlan.validationPlanRows : [];
const localPlanRows = validationPlanRows.filter((row) => row.nextAllowedAction?.mayReadExistingAssetFilesOnly === true);
const runnerProbeRows = Array.isArray(runner.probeRows) ? runner.probeRows : [];

const assetByCompetition = new Map();
for (const row of runnerProbeRows) {
  if (!row.rangeTempFile || !fs.existsSync(row.rangeTempFile)) continue;
  const buffer = fs.readFileSync(row.rangeTempFile);
  assetByCompetition.set(row.competitionSlug, {
    competitionSlug: row.competitionSlug,
    assetUrl: row.assetUrl,
    assetPath: row.rangeTempFile,
    assetSize: buffer.length,
    assetSha256: sha256Buffer(buffer),
    text: buffer.toString("utf8")
  });
}

const contextRows = [];

for (const planRow of localPlanRows) {
  const asset = assetByCompetition.get(planRow.competitionSlug);
  const needles = resolverNeedlesByKind[planRow.validationKind] ?? [];

  if (!asset) {
    contextRows.push({
      sportomediaLocalContextResolverRowId: `sportomedia_local_context_resolver_${String(contextRows.length + 1).padStart(3, "0")}`,
      sourceValidationPlanRowId: planRow.sportomediaRouteContractValidationPlanRowId,
      competitionSlug: planRow.competitionSlug,
      validationKind: planRow.validationKind,
      resolverStatus: "blocked_missing_existing_asset_file",
      matchedNeedleCount: 0,
      resolvedSignalCount: 0,
      contextMatches: []
    });
    continue;
  }

  const contextMatches = [];

  for (const needle of needles) {
    const offsets = boundedFindAll(asset.text, needle);
    for (const offset of offsets) {
      const context = contextAt(asset.text, offset);
      const resolvedSignals = classifyResolution(context);
      contextMatches.push({
        needle,
        offset,
        resolvedSignals,
        localHints: extractLocalHints(context).slice(0, 20),
        context
      });
    }
  }

  const resolvedSignals = uniqueSorted(contextMatches.flatMap((match) => match.resolvedSignals));
  const matchedNeedles = uniqueSorted(contextMatches.map((match) => match.needle));

  contextRows.push({
    sportomediaLocalContextResolverRowId: `sportomedia_local_context_resolver_${String(contextRows.length + 1).padStart(3, "0")}`,
    sourceValidationPlanRowId: planRow.sportomediaRouteContractValidationPlanRowId,
    competitionSlug: planRow.competitionSlug,
    competitionLabel: planRow.competitionLabel,
    providerFamily: "sportomedia",
    validationKind: planRow.validationKind,
    assetUrl: asset.assetUrl,
    assetPath: asset.assetPath,
    assetSize: asset.assetSize,
    assetSha256: asset.assetSha256,
    matchedNeedleCount: matchedNeedles.length,
    matchedNeedles,
    contextMatchCount: contextMatches.length,
    resolvedSignalCount: resolvedSignals.length,
    resolvedSignals,
    resolverStatus: contextMatches.length > 0 ? "resolved_local_context_candidates" : "no_local_context_match",
    contextMatches: contextMatches.slice(0, 24)
  });
}

const resolvedContextRows = contextRows.filter((row) => row.resolverStatus === "resolved_local_context_candidates");
const unresolvedContextRows = contextRows.filter((row) => row.resolverStatus !== "resolved_local_context_candidates");
const resolvedSignalRows = contextRows.filter((row) => row.resolvedSignalCount > 0);

const checks = [];
assertCheck(checks, "sourceValidationPlanPassed", validationPlan.summary?.controlledSportomediaRouteContractValidationPlanStatus === "passed", { actual: validationPlan.summary?.controlledSportomediaRouteContractValidationPlanStatus });
assertCheck(checks, "sourceRunnerPassed", runner.summary?.status === "passed", { actual: runner.summary?.status });
assertCheck(checks, "sourceNoSearchCanonicalProductionTruth", Number(validationPlan.summary?.searchExecutedNowCount ?? -1) === 0 && Number(validationPlan.summary?.canonicalWriteExecutedNowCount ?? -1) === 0 && Number(validationPlan.summary?.productionWriteExecutedNowCount ?? -1) === 0 && Number(validationPlan.summary?.truthAssertionExecutedNowCount ?? -1) === 0);
assertCheck(checks, "localPlanRowsExpectedCount", localPlanRows.length === 8, { actual: localPlanRows.length, expected: 8 });
assertCheck(checks, "assetsAvailableForExpectedCompetitions", JSON.stringify(uniqueSorted([...assetByCompetition.keys()])) === JSON.stringify(expectedCompetitions), { actual: uniqueSorted([...assetByCompetition.keys()]), expected: expectedCompetitions });
assertCheck(checks, "contextRowsExpectedCount", contextRows.length === 8, { actual: contextRows.length, expected: 8 });
assertCheck(checks, "resolvedContextRowsExist", resolvedContextRows.length > 0, { actual: resolvedContextRows.length });
assertCheck(checks, "resolvedSignalRowsExist", resolvedSignalRows.length > 0, { actual: resolvedSignalRows.length });
assertCheck(checks, "allContextRowsLocalOnly", contextRows.every((row) => row.assetPath && !/^https?:\/\//i.test(row.assetPath)));
assertCheck(checks, "fetchExecutedNowCount", true, { actual: 0 });
assertCheck(checks, "searchExecutedNowCount", true, { actual: 0 });
assertCheck(checks, "broadSearchExecutedNowCount", true, { actual: 0 });
assertCheck(checks, "canonicalWriteExecutedNowCount", true, { actual: 0 });
assertCheck(checks, "productionWriteExecutedNowCount", true, { actual: 0 });
assertCheck(checks, "truthAssertionExecutedNowCount", true, { actual: 0 });

const blockedCheckCount = checks.filter((check) => !check.passed).length;
const passedCheckCount = checks.filter((check) => check.passed).length;

const output = {
  output: outputPath,
  job: "build-football-truth-controlled-sportomedia-local-context-resolver-file",
  generatedAtUtc: new Date().toISOString(),
  sourcePaths: {
    validationPlanPath,
    runnerPath
  },
  sourceSha256: {
    validationPlanSha256: sha256Text(validationPlanText),
    runnerSha256: sha256Text(runnerText)
  },
  policy: {
    localOnly: true,
    existingAssetFilesOnly: true,
    noFetchInThisJob: true,
    noSearchInThisJob: true,
    noBroadSearchInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true
  },
  summary: {
    controlledSportomediaLocalContextResolverStatus: blockedCheckCount === 0 ? "passed" : "passed_with_local_context_gaps",
    localPlanRowCount: localPlanRows.length,
    contextResolverRowCount: contextRows.length,
    resolvedContextResolverRowCount: resolvedContextRows.length,
    unresolvedContextResolverRowCount: unresolvedContextRows.length,
    resolvedSignalRowCount: resolvedSignalRows.length,
    contextRowsByCompetition: countBy(contextRows, "competitionSlug"),
    contextRowsByValidationKind: countBy(contextRows, "validationKind"),
    contextRowsByStatus: countBy(contextRows, "resolverStatus"),
    checkCount: checks.length,
    passedCheckCount,
    blockedCheckCount,
    mayBuildControlledSportomediaRouteContractReviewBoardCount: resolvedSignalRows.length > 0 ? 1 : 0,
    fetchExecutedNowCount: 0,
    searchExecutedNowCount: 0,
    broadSearchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0
  },
  checks,
  assetInputs: [...assetByCompetition.values()].map((asset) => ({
    competitionSlug: asset.competitionSlug,
    assetUrl: asset.assetUrl,
    assetPath: asset.assetPath,
    assetSize: asset.assetSize,
    assetSha256: asset.assetSha256
  })),
  contextRows
};

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  controlledSportomediaLocalContextResolverStatus: output.summary.controlledSportomediaLocalContextResolverStatus,
  localPlanRowCount: output.summary.localPlanRowCount,
  contextResolverRowCount: output.summary.contextResolverRowCount,
  resolvedContextResolverRowCount: output.summary.resolvedContextResolverRowCount,
  unresolvedContextResolverRowCount: output.summary.unresolvedContextResolverRowCount,
  resolvedSignalRowCount: output.summary.resolvedSignalRowCount,
  contextRowsByCompetition: output.summary.contextRowsByCompetition,
  contextRowsByValidationKind: output.summary.contextRowsByValidationKind,
  mayBuildControlledSportomediaRouteContractReviewBoardCount: output.summary.mayBuildControlledSportomediaRouteContractReviewBoardCount,
  fetchExecutedNowCount: output.summary.fetchExecutedNowCount,
  searchExecutedNowCount: output.summary.searchExecutedNowCount,
  broadSearchExecutedNowCount: output.summary.broadSearchExecutedNowCount,
  canonicalWriteExecutedNowCount: output.summary.canonicalWriteExecutedNowCount,
  productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedCheckCount !== 0) {
  process.exitCode = 1;
}
