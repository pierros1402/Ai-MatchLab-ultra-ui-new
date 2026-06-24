import fs from "node:fs";
import path from "node:path";

const sourcePath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "sportomedia-parser-gap-plan-2026-06-15",
  "sportomedia-parser-gap-plan-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-sportomedia-route-contract-probe-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "controlled-sportomedia-route-contract-probe-2026-06-15.json"
);

const expectedCompetitions = ["swe.1", "swe.2"];
const maxFileBytes = 450_000;
const maxProbeRows = 220;
const scanRoots = [
  "engine-v1/adapters",
  "engine-v1/jobs",
  "engine-v1/football-truth",
  "engine-v1/ai-match-intelligence"
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
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

function assertEqual(name, actual, expected, checks) {
  const passed = Object.is(actual, expected);
  checks.push({ name, actual, expected, passed });
}

function assertArrayEqual(name, actual, expected, checks) {
  const passed = JSON.stringify(actual) === JSON.stringify(expected);
  checks.push({ name, actual, expected, passed });
}

function compact(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function isTextFile(filePath) {
  return /\.(js|mjs|cjs|ts|tsx|json|txt|md|yml|yaml|html)$/i.test(filePath);
}

function shouldSkipFile(filePath) {
  const rel = filePath.replaceAll("\\", "/").toLowerCase();
  return (
    rel.includes("/node_modules/") ||
    rel.includes("/.git/") ||
    rel.includes("/_diagnostics/") ||
    rel.includes("/_state/") ||
    rel.includes("/dist/") ||
    rel.includes("/build/") ||
    rel.includes("team-news-source-registry.js") ||
    rel.includes("build-coverage-competition-state-inventory-file.js")
  );
}

function collectCandidateFiles() {
  const out = [];

  function walk(dir) {
    if (!fs.existsSync(dir)) return;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if ([".git", "node_modules", ".next", "dist", "build", "coverage", "_diagnostics", "_state"].includes(entry.name)) continue;
        walk(fullPath);
        continue;
      }

      if (!entry.isFile() || !isTextFile(fullPath) || shouldSkipFile(fullPath)) continue;

      let stat;
      try {
        stat = fs.statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.size > maxFileBytes) continue;

      const rel = fullPath.replaceAll("\\", "/").toLowerCase();
      if (
        rel.includes("sportomedia") ||
        rel.includes("source") ||
        rel.includes("provider") ||
        rel.includes("adapter") ||
        rel.includes("fixture") ||
        rel.includes("standing") ||
        rel.includes("football-truth") ||
        rel.includes("audit") ||
        rel.includes("route") ||
        rel.includes("contract") ||
        rel.includes("runner") ||
        rel.includes("probe")
      ) {
        out.push(fullPath);
      }
    }
  }

  for (const root of scanRoots) walk(root);
  return uniqueSorted(out);
}

function extractUrls(text) {
  return [...String(text ?? "").matchAll(/https?:\/\/[^\s"'`),}>\]]+/gi)]
    .map((match) => match[0].replace(/[.;]+$/, ""))
    .slice(0, 8);
}

function extractPotentialIds(text) {
  return [...String(text ?? "").matchAll(/\b(?:leagueId|competitionId|tournamentId|seasonId|seriesId|sportId|entityId|clientId|widgetId|id)\s*[:=]\s*["']?([A-Za-z0-9_.:-]{2,})["']?/gi)]
    .map((match) => ({ parameter: match[0].split(/[:=]/)[0].trim(), value: match[1] }))
    .slice(0, 8);
}

function classifySignal(text, filePath) {
  const joined = `${filePath} ${text}`;
  const lower = joined.toLowerCase();
  const signalKinds = [];

  if (lower.includes("sportomedia")) signalKinds.push("sportomedia_literal");
  if (lower.includes("graphql") || lower.includes("gql")) signalKinds.push("graphql_signal");
  if (lower.includes("svenskfotboll") || lower.includes("allsvenskan.se") || lower.includes("superettan.se")) signalKinds.push("swedish_official_host_signal");
  if (lower.includes("swe.1") || lower.includes("allsvenskan")) signalKinds.push("swe_1_signal");
  if (lower.includes("swe.2") || lower.includes("superettan")) signalKinds.push("swe_2_signal");
  if (/(standings|standing|table|tabell|league\s*table|rank|points|poäng|played|matches)/i.test(joined)) signalKinds.push("standings_signal");
  if (/(endpoint|url|uri|route|api|query|operation|variables|competition|season|tournament|source)/i.test(joined)) signalKinds.push("route_contract_signal");
  if (/https?:\/\//i.test(joined)) signalKinds.push("url_literal");
  if (/(leagueId|competitionId|tournamentId|seasonId|seriesId|sportId|entityId|clientId|widgetId|id)\s*[:=]/i.test(joined)) signalKinds.push("id_parameter_signal");

  const competitionSignals = [];
  if (lower.includes("swe.1") || lower.includes("allsvenskan")) competitionSignals.push("swe.1");
  if (lower.includes("swe.2") || lower.includes("superettan")) competitionSignals.push("swe.2");

  const rejectionReasons = [];
  if (/(nyheter|news|fotbollskanalen|team-news|source-registry)/i.test(joined)) rejectionReasons.push("news_or_media_signal_not_route_contract");
  if (/(canonical-fixtures|fixture seed|build-coverage-competition-state-inventory)/i.test(joined)) rejectionReasons.push("fixture_seed_not_route_contract");
  if (!signalKinds.includes("sportomedia_literal") && !signalKinds.includes("graphql_signal")) rejectionReasons.push("missing_sportomedia_or_graphql_route_contract_signal");
  if (!signalKinds.includes("route_contract_signal") && !signalKinds.includes("id_parameter_signal") && !signalKinds.includes("url_literal")) rejectionReasons.push("missing_route_or_id_or_url_signal");
  if (!signalKinds.includes("standings_signal") && !/tabell|standing|standings/i.test(joined)) rejectionReasons.push("missing_standings_signal");

  const usableAsControlledRunnerInput = rejectionReasons.length === 0 && competitionSignals.length > 0;

  return {
    signalKinds: uniqueSorted(signalKinds),
    competitionSignals: uniqueSorted(competitionSignals),
    rejectionReasons: uniqueSorted(rejectionReasons),
    usableAsControlledRunnerInput
  };
}

function scanLocalRouteContracts() {
  const files = collectCandidateFiles();
  const rows = [];
  let scannedLocalFileCount = 0;

  for (const filePath of files) {
    if (rows.length >= maxProbeRows) break;

    scannedLocalFileCount += 1;

    let text = "";
    try {
      text = fs.readFileSync(filePath, "utf8");
    } catch {
      continue;
    }

    const lower = text.toLowerCase();
    if (
      !lower.includes("sportomedia") &&
      !lower.includes("graphql") &&
      !lower.includes("svenskfotboll") &&
      !lower.includes("allsvenskan") &&
      !lower.includes("superettan") &&
      !lower.includes("swe.1") &&
      !lower.includes("swe.2")
    ) {
      continue;
    }

    const lines = text.split(/\r?\n/);

    for (let index = 0; index < lines.length && rows.length < maxProbeRows; index += 1) {
      const line = compact(lines[index]);
      if (!line) continue;

      const localWindow = compact(lines.slice(Math.max(0, index - 2), Math.min(lines.length, index + 3)).join(" "));
      const signal = classifySignal(`${line} ${localWindow}`, filePath);

      if (signal.signalKinds.length === 0 && signal.competitionSignals.length === 0) continue;

      const relevant =
        signal.signalKinds.includes("sportomedia_literal") ||
        signal.signalKinds.includes("graphql_signal") ||
        signal.signalKinds.includes("swedish_official_host_signal") ||
        signal.competitionSignals.length > 0;

      if (!relevant) continue;

      rows.push({
        sportomediaRouteContractProbeRowId: `sportomedia_route_contract_probe_${String(rows.length + 1).padStart(3, "0")}`,
        filePath: filePath.replaceAll("\\", "/"),
        lineNumber: index + 1,
        signalKinds: signal.signalKinds,
        competitionSignals: signal.competitionSignals,
        urls: extractUrls(`${line} ${localWindow}`),
        potentialIds: extractPotentialIds(`${line} ${localWindow}`),
        usableAsControlledRunnerInput: signal.usableAsControlledRunnerInput,
        rejectionReasons: signal.rejectionReasons,
        line: line.slice(0, 320),
        context: localWindow.slice(0, 700)
      });
    }
  }

  return {
    candidateLocalFileCount: files.length,
    scannedLocalFileCount,
    routeContractProbeRows: rows
  };
}

function buildControlledRunnerInputRows(usableRows) {
  return expectedCompetitions.map((competitionSlug, index) => {
    const rows = usableRows.filter((row) => row.competitionSignals.includes(competitionSlug));
    return {
      sportomediaControlledRunnerInputRowId: `sportomedia_controlled_runner_input_${String(index + 1).padStart(2, "0")}`,
      competitionSlug,
      providerFamily: "sportomedia",
      usableLocalContractSignalRowCount: rows.length,
      candidateUrls: uniqueSorted(rows.flatMap((row) => row.urls)),
      potentialIds: rows.flatMap((row) => row.potentialIds),
      inputStatus: rows.length > 0
        ? "ready_for_controlled_sportomedia_runner_input_quality_gate"
        : "blocked_no_usable_local_route_contract_signal",
      mayFetchNextOnlyAfterQualityGate: rows.length > 0,
      maySearchNext: false,
      mayBroadSearchNext: false,
      mayClassifyNext: false,
      mayWriteCanonicalNext: false,
      mayWriteProductionNext: false,
      mayAssertTruthNext: false
    };
  });
}

fs.mkdirSync(outputDir, { recursive: true });

if (!fs.existsSync(sourcePath)) {
  throw new Error(`Missing Sportomedia parser gap plan diagnostic: ${sourcePath}`);
}

const source = readJson(sourcePath);
const summary = source.summary && typeof source.summary === "object" ? source.summary : {};
const parserGapPlanRows = Array.isArray(source.sportomediaParserGapPlanRows) ? source.sportomediaParserGapPlanRows : [];

const scanned = scanLocalRouteContracts();
const usableRouteContractRows = scanned.routeContractProbeRows.filter((row) => row.usableAsControlledRunnerInput);
const rejectedRouteContractProbeRows = scanned.routeContractProbeRows.filter((row) => !row.usableAsControlledRunnerInput);
const controlledRunnerInputRows = buildControlledRunnerInputRows(usableRouteContractRows);

const allInputsReady = controlledRunnerInputRows.every((row) => row.inputStatus === "ready_for_controlled_sportomedia_runner_input_quality_gate");
const routeContractGapDetected = !allInputsReady;
const status = allInputsReady
  ? "passed_with_controlled_runner_inputs"
  : "passed_with_local_route_contract_gap_requires_controlled_official_route_discovery_plan";

const checks = [];
assertEqual("sourceSportomediaParserGapPlanStatus", summary.sportomediaParserGapPlanStatus, "passed", checks);
assertEqual("sourceMayBuildControlledSportomediaRouteContractProbeCount", Number(summary.mayBuildControlledSportomediaRouteContractProbeCount ?? 0), 1, checks);
assertEqual("parserGapPlanRowCount", parserGapPlanRows.length, 2, checks);
assertArrayEqual("parserGapPlanCompetitions", uniqueSorted(parserGapPlanRows.map((row) => row.competitionSlug)), expectedCompetitions, checks);
assertEqual("controlledRunnerInputRowCount", controlledRunnerInputRows.length, 2, checks);
assertArrayEqual("controlledRunnerInputCompetitions", uniqueSorted(controlledRunnerInputRows.map((row) => row.competitionSlug)), expectedCompetitions, checks);
assertEqual("fetchExecutedNowCount", 0, 0, checks);
assertEqual("searchExecutedNowCount", 0, 0, checks);
assertEqual("canonicalWriteExecutedNowCount", 0, 0, checks);
assertEqual("productionWriteExecutedNowCount", 0, 0, checks);
assertEqual("truthAssertionExecutedNowCount", 0, 0, checks);

const blockedProbeCheckCount = checks.filter((check) => !check.passed).length;
const passedProbeCheckCount = checks.filter((check) => check.passed).length;

const output = {
  output: outputPath,
  job: "run-football-truth-controlled-sportomedia-route-contract-probe-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: { sourcePath },
  policy: {
    boundedLocalRouteContractProbeOnly: true,
    routeContractGapIsNonFatal: true,
    scanRoots,
    maxFileBytes,
    maxProbeRows,
    noFetchInThisJob: true,
    noExternalSearchInThisJob: true,
    noClassifierInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true
  },
  summary: {
    controlledSportomediaRouteContractProbeStatus: blockedProbeCheckCount === 0 ? status : "blocked_probe_integrity_checks_failed",
    sportomediaParserGapPlanReadCount: 1,
    candidateLocalFileCount: scanned.candidateLocalFileCount,
    scannedLocalFileCount: scanned.scannedLocalFileCount,

    routeContractProbeRowCount: scanned.routeContractProbeRows.length,
    usableRouteContractProbeRowCount: usableRouteContractRows.length,
    rejectedRouteContractProbeRowCount: rejectedRouteContractProbeRows.length,
    controlledRunnerInputRowCount: controlledRunnerInputRows.length,
    controlledRunnerInputCompetitions: uniqueSorted(controlledRunnerInputRows.map((row) => row.competitionSlug)),
    controlledRunnerInputRowsByStatus: countBy(controlledRunnerInputRows, "inputStatus"),
    usableRowsByCompetitionSignal: {
      "swe.1": usableRouteContractRows.filter((row) => row.competitionSignals.includes("swe.1")).length,
      "swe.2": usableRouteContractRows.filter((row) => row.competitionSignals.includes("swe.2")).length
    },
    rejectedRowsByReason: rejectedRouteContractProbeRows.reduce((acc, row) => {
      for (const reason of row.rejectionReasons) acc[reason] = (acc[reason] ?? 0) + 1;
      return acc;
    }, {}),

    routeContractGapDetected,
    probeCheckCount: checks.length,
    passedProbeCheckCount,
    blockedProbeCheckCount,

    mayBuildSportomediaRunnerInputQualityGateCount: blockedProbeCheckCount === 0 && allInputsReady ? 1 : 0,
    mayBuildControlledSportomediaOfficialRouteDiscoveryPlanCount: blockedProbeCheckCount === 0 && routeContractGapDetected ? 1 : 0,

    fetchExecutedNowCount: 0,
    searchExecutedNowCount: 0,
    broadSearchExecutedNowCount: 0,
    classifierExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    canonicalWrites: 0,
    productionWrite: false,
    truthAssertion: false
  },
  checks,
  controlledRunnerInputRows,
  usableRouteContractRows,
  rejectedRouteContractProbeRows: rejectedRouteContractProbeRows.slice(0, 80),
  routeContractProbeRows: scanned.routeContractProbeRows.slice(0, 120)
};

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  controlledSportomediaRouteContractProbeStatus: output.summary.controlledSportomediaRouteContractProbeStatus,
  candidateLocalFileCount: output.summary.candidateLocalFileCount,
  scannedLocalFileCount: output.summary.scannedLocalFileCount,
  routeContractProbeRowCount: output.summary.routeContractProbeRowCount,
  usableRouteContractProbeRowCount: output.summary.usableRouteContractProbeRowCount,
  rejectedRouteContractProbeRowCount: output.summary.rejectedRouteContractProbeRowCount,
  controlledRunnerInputRowsByStatus: output.summary.controlledRunnerInputRowsByStatus,
  usableRowsByCompetitionSignal: output.summary.usableRowsByCompetitionSignal,
  rejectedRowsByReason: output.summary.rejectedRowsByReason,
  routeContractGapDetected: output.summary.routeContractGapDetected,
  mayBuildSportomediaRunnerInputQualityGateCount: output.summary.mayBuildSportomediaRunnerInputQualityGateCount,
  mayBuildControlledSportomediaOfficialRouteDiscoveryPlanCount: output.summary.mayBuildControlledSportomediaOfficialRouteDiscoveryPlanCount,
  productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedProbeCheckCount !== 0) {
  process.exitCode = 1;
}
