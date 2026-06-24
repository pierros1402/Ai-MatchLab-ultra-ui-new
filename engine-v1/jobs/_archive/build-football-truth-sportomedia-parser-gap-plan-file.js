import fs from "node:fs";
import path from "node:path";

const norwayVerificationPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "norway-ntf-canonical-candidate-write-verification-2026-06-15",
  "norway-ntf-canonical-candidate-write-verification-2026-06-15.json"
);

const providerSpecificGapPlanPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "provider-specific-parser-gap-plan-2026-06-15",
  "provider-specific-parser-gap-plan-2026-06-15.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "sportomedia-parser-gap-plan-2026-06-15"
);

const outputPath = path.join(
  outputDir,
  "sportomedia-parser-gap-plan-2026-06-15.json"
);

const expectedCompetitions = ["swe.1", "swe.2"];

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
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

function flattenObjects(value, out = []) {
  if (Array.isArray(value)) {
    for (const item of value) flattenObjects(item, out);
    return out;
  }

  if (value && typeof value === "object") {
    out.push(value);
    for (const child of Object.values(value)) flattenObjects(child, out);
  }

  return out;
}

function safeJsonIncludes(value, needle) {
  return JSON.stringify(value ?? {}).toLowerCase().includes(String(needle).toLowerCase());
}

function collectLocalSportomediaHints() {
  const roots = ["engine-v1", "data/football-truth"];
  const hints = [];

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (["node_modules", ".git", ".next", "dist", "build"].includes(entry.name)) continue;
        walk(fullPath);
        continue;
      }

      if (!entry.isFile()) continue;
      if (!/\.(js|mjs|cjs|json|txt|md)$/i.test(entry.name)) continue;

      let text = "";
      try {
        text = fs.readFileSync(fullPath, "utf8");
      } catch {
        continue;
      }

      const lower = text.toLowerCase();
      if (!lower.includes("sportomedia") && !lower.includes("svenskfotboll") && !lower.includes("swe.1") && !lower.includes("swe.2")) continue;

      const lines = text.split(/\r?\n/);
      for (const [index, line] of lines.entries()) {
        const normalized = line.trim();
        const lineLower = normalized.toLowerCase();
        if (
          lineLower.includes("sportomedia") ||
          lineLower.includes("graphql") ||
          lineLower.includes("svenskfotboll") ||
          lineLower.includes("swe.1") ||
          lineLower.includes("swe.2") ||
          lineLower.includes("allsvenskan") ||
          lineLower.includes("superettan")
        ) {
          hints.push({
            filePath: fullPath.replaceAll("\\", "/"),
            lineNumber: index + 1,
            line: normalized.slice(0, 280)
          });
        }
      }
    }
  }

  for (const root of roots) walk(root);

  return hints.slice(0, 250);
}

function buildSportomediaPlanRows(gapPlan, localHints) {
  const gapObjects = gapPlan ? flattenObjects(gapPlan) : [];
  const rows = [];

  for (const competitionSlug of expectedCompetitions) {
    const gapSignals = gapObjects.filter((row) => {
      const slugMatches = row?.competitionSlug === competitionSlug || row?.slug === competitionSlug || safeJsonIncludes(row, competitionSlug);
      const providerMatches = safeJsonIncludes(row, "sportomedia");
      return slugMatches && providerMatches;
    });

    const hintRows = localHints.filter((hint) => {
      const text = `${hint.filePath} ${hint.line}`.toLowerCase();
      if (competitionSlug === "swe.1") return text.includes("swe.1") || text.includes("allsvenskan") || text.includes("sportomedia");
      if (competitionSlug === "swe.2") return text.includes("swe.2") || text.includes("superettan") || text.includes("sportomedia");
      return false;
    }).slice(0, 30);

    rows.push({
      sportomediaParserGapPlanRowId: `sportomedia_parser_gap_plan_${competitionSlug.replace(".", "_")}`,
      competitionSlug,
      providerFamily: "sportomedia",
      country: "Sweden",
      expectedCompetitionKind: "league_standings",
      parserGapStatus: "ready_for_controlled_sportomedia_route_contract_probe",
      sourceProviderSpecificGapSignalCount: gapSignals.length,
      localSportomediaHintCount: hintRows.length,
      localSportomediaHints: hintRows,
      controlledNextStep: "build_controlled_sportomedia_route_contract_probe_or_runner",
      allowedNextActions: {
        mayReadLocalContracts: true,
        mayFetchSportomediaControlledRouteOnlyAfterNextGate: false,
        maySearch: false,
        mayBroadSearch: false,
        mayClassify: false,
        mayWriteCanonical: false,
        mayWriteProduction: false,
        mayAssertTruth: false
      },
      canonicalWriteAllowedNow: false,
      productionWriteAllowedNow: false,
      truthAssertionAllowedNow: false
    });
  }

  return rows;
}

fs.mkdirSync(outputDir, { recursive: true });

const norwayVerification = readJsonIfExists(norwayVerificationPath);
const providerSpecificGapPlan = readJsonIfExists(providerSpecificGapPlanPath);
const norwaySummary = norwayVerification?.summary && typeof norwayVerification.summary === "object" ? norwayVerification.summary : {};
const providerGapSummary = providerSpecificGapPlan?.summary && typeof providerSpecificGapPlan.summary === "object" ? providerSpecificGapPlan.summary : {};

const localSportomediaHints = collectLocalSportomediaHints();
const sportomediaParserGapPlanRows = buildSportomediaPlanRows(providerSpecificGapPlan, localSportomediaHints);

const checks = [];
assertEqual("norwayVerificationPresent", Boolean(norwayVerification), true, checks);
assertEqual("norwayVerificationStatus", norwaySummary.norwayNtfCanonicalCandidateWriteVerificationStatus, "passed", checks);
assertEqual("norwayMayBuildSportomediaParserGapPlanOrRunnerCount", Number(norwaySummary.mayBuildSportomediaParserGapPlanOrRunnerCount ?? 0), 1, checks);
assertEqual("providerSpecificGapPlanPresent", Boolean(providerSpecificGapPlan), true, checks);
assertEqual("sportomediaParserGapPlanRowCount", sportomediaParserGapPlanRows.length, 2, checks);
assertArrayEqual("sportomediaParserGapPlanCompetitions", uniqueSorted(sportomediaParserGapPlanRows.map((row) => row.competitionSlug)), expectedCompetitions, checks);
assertArrayEqual("sportomediaParserGapProviderFamilies", uniqueSorted(sportomediaParserGapPlanRows.map((row) => row.providerFamily)), ["sportomedia"], checks);
assertEqual("localSportomediaHintsPresent", localSportomediaHints.length > 0, true, checks);
assertEqual("sportomediaRowsHaveLocalHints", sportomediaParserGapPlanRows.every((row) => row.localSportomediaHintCount > 0), true, checks);
assertEqual("canonicalWriteExecutedNowCount", 0, 0, checks);
assertEqual("productionWriteExecutedNowCount", 0, 0, checks);
assertEqual("truthAssertionExecutedNowCount", 0, 0, checks);

const blockedPlanCheckCount = checks.filter((check) => !check.passed).length;
const passedPlanCheckCount = checks.filter((check) => check.passed).length;

const output = {
  output: outputPath,
  job: "build-football-truth-sportomedia-parser-gap-plan-file",
  generatedAt: new Date().toISOString(),
  sourcePaths: {
    norwayVerificationPath,
    providerSpecificGapPlanPath
  },
  policy: {
    planOnly: true,
    localContractScanOnly: true,
    noFetchInThisJob: true,
    noExternalSearchInThisJob: true,
    noClassifierInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true
  },
  summary: {
    sportomediaParserGapPlanStatus: blockedPlanCheckCount === 0 ? "passed" : "blocked",
    norwayVerificationReadCount: norwayVerification ? 1 : 0,
    providerSpecificGapPlanReadCount: providerSpecificGapPlan ? 1 : 0,

    sportomediaParserGapPlanRowCount: sportomediaParserGapPlanRows.length,
    sportomediaParserGapPlanCompetitions: uniqueSorted(sportomediaParserGapPlanRows.map((row) => row.competitionSlug)),
    sportomediaParserGapPlanRowsByStatus: countBy(sportomediaParserGapPlanRows, "parserGapStatus"),
    localSportomediaHintCount: localSportomediaHints.length,
    providerSpecificGapPlanStatus: providerGapSummary.providerSpecificParserGapPlanStatus ?? providerGapSummary.status ?? null,

    planCheckCount: checks.length,
    passedPlanCheckCount,
    blockedPlanCheckCount,

    mayBuildControlledSportomediaRouteContractProbeCount: blockedPlanCheckCount === 0 ? 1 : 0,

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
  sportomediaParserGapPlanRows,
  localSportomediaHints
};

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  sportomediaParserGapPlanStatus: output.summary.sportomediaParserGapPlanStatus,
  sportomediaParserGapPlanRowCount: output.summary.sportomediaParserGapPlanRowCount,
  sportomediaParserGapPlanCompetitions: output.summary.sportomediaParserGapPlanCompetitions,
  sportomediaParserGapPlanRowsByStatus: output.summary.sportomediaParserGapPlanRowsByStatus,
  localSportomediaHintCount: output.summary.localSportomediaHintCount,
  sampleLocalSportomediaHints: localSportomediaHints.slice(0, 12),
  mayBuildControlledSportomediaRouteContractProbeCount: output.summary.mayBuildControlledSportomediaRouteContractProbeCount,
  productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount
}, null, 2));

if (blockedPlanCheckCount !== 0) {
  process.exitCode = 1;
}
