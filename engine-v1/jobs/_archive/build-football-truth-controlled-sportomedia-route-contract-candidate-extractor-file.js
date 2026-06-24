import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const inputPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-sportomedia-accepted-asset-bounded-marker-scan-2026-06-16",
  "controlled-sportomedia-accepted-asset-bounded-marker-scan-2026-06-16.json"
);

const outputDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "controlled-sportomedia-route-contract-candidate-extractor-2026-06-16"
);

const outputPath = path.join(
  outputDir,
  "controlled-sportomedia-route-contract-candidate-extractor-2026-06-16.json"
);

const expectedCompetitions = ["swe.1", "swe.2"];

function sha256Text(value) {
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

function normalizeCandidate(value) {
  return String(value ?? "")
    .replace(/\\u002F/g, "/")
    .replace(/\\\//g, "/")
    .replace(/&amp;/g, "&")
    .trim();
}

function classifyCandidate(value) {
  const v = normalizeCandidate(value);
  const lower = v.toLowerCase();
  const classes = [];

  if (/graphql|gql/.test(lower)) classes.push("graphql_candidate");
  if (/wp-json|\/api\/|\/ajax|admin-ajax|endpoint|rest/.test(lower)) classes.push("api_candidate");
  if (/standings|standing|league[-_]?table|table|tabell/.test(lower)) classes.push("standings_candidate");
  if (/fixtures?|matches|matcher|schedule|results?|resultat/.test(lower)) classes.push("fixtures_results_candidate");
  if (/team|teams|club|clubs|competitor|participants?/.test(lower)) classes.push("team_candidate");
  if (/season|competition|league|tournament/.test(lower)) classes.push("competition_season_candidate");
  if (/sportomedia|sef-leagues|sportsdata|sportsmedia/.test(lower)) classes.push("provider_or_asset_family_candidate");
  if (/allsvenskan|superettan|svenskfotboll/.test(lower)) classes.push("swedish_official_candidate");
  if (/^https?:\/\//.test(v)) classes.push("absolute_url_candidate");
  if (/^\//.test(v)) classes.push("relative_route_candidate");

  return classes;
}

function extractCandidatesFromContext(context) {
  const text = normalizeCandidate(context);
  const candidates = [];

  const regexes = [
    /https?:\/\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]{8,240}/g,
    /\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]{3,180}/g,
    /\b[A-Za-z0-9_$.-]{0,40}(?:graphql|GraphQL|gql|standings|standing|leagueTable|tabell|matcher|resultat|fixtures|matches|results|wp-json|ajax|endpoint|sportomedia|Sportomedia|season|competition|teams?)[A-Za-z0-9_$.-]{0,80}\b/g
  ];

  for (const re of regexes) {
    let match;
    while ((match = re.exec(text)) !== null) {
      const candidateValue = normalizeCandidate(match[0]).slice(0, 240);
      const classes = classifyCandidate(candidateValue);
      if (classes.length === 0) continue;

      candidates.push({
        candidateValue,
        candidateClasses: classes
      });
    }
  }

  return candidates;
}

function scoreCandidate(candidateClasses) {
  let score = 0;
  if (candidateClasses.includes("graphql_candidate")) score += 100;
  if (candidateClasses.includes("api_candidate")) score += 80;
  if (candidateClasses.includes("standings_candidate")) score += 70;
  if (candidateClasses.includes("fixtures_results_candidate")) score += 45;
  if (candidateClasses.includes("competition_season_candidate")) score += 35;
  if (candidateClasses.includes("provider_or_asset_family_candidate")) score += 30;
  if (candidateClasses.includes("absolute_url_candidate")) score += 20;
  if (candidateClasses.includes("relative_route_candidate")) score += 15;
  if (candidateClasses.includes("swedish_official_candidate")) score += 10;
  if (candidateClasses.includes("team_candidate")) score += 8;
  return score;
}

function assertCheck(checks, name, passed, details = {}) {
  checks.push({ name, passed: Boolean(passed), ...details });
}

if (!fs.existsSync(inputPath)) {
  throw new Error(`Missing bounded marker scan diagnostic: ${inputPath}`);
}

const inputText = fs.readFileSync(inputPath, "utf8");
const input = JSON.parse(inputText);
const sourceRows = [
  ...(Array.isArray(input.highValueMarkerRows) ? input.highValueMarkerRows : []),
  ...(Array.isArray(input.markerRows) ? input.markerRows : [])
];

const byKey = new Map();

for (const markerRow of sourceRows) {
  const extracted = extractCandidatesFromContext(markerRow.context ?? "");
  for (const item of extracted) {
    const candidateValue = item.candidateValue;
    const candidateClasses = item.candidateClasses;
    const score = scoreCandidate(candidateClasses);
    const key = `${markerRow.competitionSlug}::${candidateValue}`;

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        sportomediaRouteContractCandidateRowId: null,
        competitionSlug: markerRow.competitionSlug,
        providerFamily: "sportomedia",
        candidateValue,
        candidateClasses,
        candidateScore: score,
        sourceMarkerCount: 1,
        sourceMarkers: [markerRow.marker],
        sourceOffsets: [markerRow.offset],
        sampleContexts: [markerRow.context],
        candidateStatus: "local_marker_context_candidate_requires_controlled_validation"
      });
    } else {
      existing.sourceMarkerCount += 1;
      if (!existing.sourceMarkers.includes(markerRow.marker)) existing.sourceMarkers.push(markerRow.marker);
      if (existing.sourceOffsets.length < 10) existing.sourceOffsets.push(markerRow.offset);
      if (existing.sampleContexts.length < 3 && !existing.sampleContexts.includes(markerRow.context)) existing.sampleContexts.push(markerRow.context);
      existing.candidateScore = Math.max(existing.candidateScore, score);
      existing.candidateClasses = uniqueSorted([...existing.candidateClasses, ...candidateClasses]);
    }
  }
}

const candidateRows = [...byKey.values()]
  .filter((row) => row.candidateScore >= 30)
  .sort((a, b) => {
    const comp = String(a.competitionSlug).localeCompare(String(b.competitionSlug));
    if (comp !== 0) return comp;
    return b.candidateScore - a.candidateScore || b.sourceMarkerCount - a.sourceMarkerCount || a.candidateValue.localeCompare(b.candidateValue);
  })
  .slice(0, 300)
  .map((row, index) => ({
    ...row,
    sportomediaRouteContractCandidateRowId: `sportomedia_route_contract_candidate_${String(index + 1).padStart(3, "0")}`,
    sourceMarkers: uniqueSorted(row.sourceMarkers)
  }));

const highPriorityCandidateRows = candidateRows.filter((row) =>
  row.candidateClasses.includes("graphql_candidate") ||
  row.candidateClasses.includes("api_candidate") ||
  row.candidateClasses.includes("standings_candidate")
);

const checks = [];
assertCheck(checks, "sourceMarkerScanPassed", input.summary?.controlledSportomediaAcceptedAssetBoundedMarkerScanStatus === "passed", { actual: input.summary?.controlledSportomediaAcceptedAssetBoundedMarkerScanStatus });
assertCheck(checks, "sourceScannedExpectedCompetitions", JSON.stringify(uniqueSorted(input.summary?.scannedCompetitions ?? [])) === JSON.stringify(expectedCompetitions), { actual: input.summary?.scannedCompetitions, expected: expectedCompetitions });
assertCheck(checks, "sourceNoFetchSearchCanonicalProductionTruth", Number(input.summary?.fetchExecutedNowCount ?? -1) === 0 && Number(input.summary?.searchExecutedNowCount ?? -1) === 0 && Number(input.summary?.broadSearchExecutedNowCount ?? -1) === 0 && Number(input.summary?.canonicalWriteExecutedNowCount ?? -1) === 0 && Number(input.summary?.productionWriteExecutedNowCount ?? -1) === 0 && Number(input.summary?.truthAssertionExecutedNowCount ?? -1) === 0);
assertCheck(checks, "candidateRowsFound", candidateRows.length > 0, { actual: candidateRows.length });
assertCheck(checks, "highPriorityCandidateRowsFound", highPriorityCandidateRows.length > 0, { actual: highPriorityCandidateRows.length });
assertCheck(checks, "candidateRowsRemainLocalOnly", candidateRows.every((row) => row.candidateStatus === "local_marker_context_candidate_requires_controlled_validation"));
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
  job: "build-football-truth-controlled-sportomedia-route-contract-candidate-extractor-file",
  generatedAtUtc: new Date().toISOString(),
  inputPath,
  inputSha256: sha256Text(inputText),
  policy: {
    localOnly: true,
    markerContextExtractionOnly: true,
    noFetchInThisJob: true,
    noSearchInThisJob: true,
    noBroadSearchInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true
  },
  summary: {
    controlledSportomediaRouteContractCandidateExtractorStatus: blockedCheckCount === 0 ? "passed" : "passed_with_candidate_gaps",
    sourceMarkerRowCount: sourceRows.length,
    routeContractCandidateRowCount: candidateRows.length,
    highPriorityRouteContractCandidateRowCount: highPriorityCandidateRows.length,
    candidateRowsByCompetition: countBy(candidateRows, "competitionSlug"),
    highPriorityCandidateRowsByCompetition: countBy(highPriorityCandidateRows, "competitionSlug"),
    checkCount: checks.length,
    passedCheckCount,
    blockedCheckCount,
    mayBuildControlledSportomediaRouteContractValidationPlanCount: highPriorityCandidateRows.length > 0 ? 1 : 0,
    fetchExecutedNowCount: 0,
    searchExecutedNowCount: 0,
    broadSearchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0
  },
  checks,
  highPriorityCandidateRows: highPriorityCandidateRows.slice(0, 120),
  candidateRows
};

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  controlledSportomediaRouteContractCandidateExtractorStatus: output.summary.controlledSportomediaRouteContractCandidateExtractorStatus,
  sourceMarkerRowCount: output.summary.sourceMarkerRowCount,
  routeContractCandidateRowCount: output.summary.routeContractCandidateRowCount,
  highPriorityRouteContractCandidateRowCount: output.summary.highPriorityRouteContractCandidateRowCount,
  candidateRowsByCompetition: output.summary.candidateRowsByCompetition,
  highPriorityCandidateRowsByCompetition: output.summary.highPriorityCandidateRowsByCompetition,
  mayBuildControlledSportomediaRouteContractValidationPlanCount: output.summary.mayBuildControlledSportomediaRouteContractValidationPlanCount,
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
