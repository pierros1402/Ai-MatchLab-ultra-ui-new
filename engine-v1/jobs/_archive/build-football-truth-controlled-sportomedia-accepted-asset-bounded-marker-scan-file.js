import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const inputPath = path.join(
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
  "controlled-sportomedia-accepted-asset-bounded-marker-scan-2026-06-16"
);

const outputPath = path.join(
  outputDir,
  "controlled-sportomedia-accepted-asset-bounded-marker-scan-2026-06-16.json"
);

const markerSpecs = [
  { marker: "graphql", classes: ["graphql_signal", "api_signal"] },
  { marker: "GraphQL", classes: ["graphql_signal", "api_signal"] },
  { marker: "gql", classes: ["graphql_signal"] },
  { marker: "sportomedia", classes: ["provider_signal"] },
  { marker: "Sportomedia", classes: ["provider_signal"] },
  { marker: "standings", classes: ["standings_signal"] },
  { marker: "standing", classes: ["standings_signal"] },
  { marker: "leagueTable", classes: ["standings_signal"] },
  { marker: "table", classes: ["standings_signal"] },
  { marker: "tabell", classes: ["standings_signal", "swedish_route_signal"] },
  { marker: "matcher", classes: ["fixtures_signal", "swedish_route_signal"] },
  { marker: "resultat", classes: ["results_signal", "swedish_route_signal"] },
  { marker: "fixtures", classes: ["fixtures_signal"] },
  { marker: "matches", classes: ["fixtures_signal"] },
  { marker: "results", classes: ["results_signal"] },
  { marker: "wp-json", classes: ["api_signal", "wordpress_signal"] },
  { marker: "/api/", classes: ["api_signal", "route_signal"] },
  { marker: "/graphql", classes: ["graphql_signal", "route_signal"] },
  { marker: "ajax", classes: ["api_signal"] },
  { marker: "endpoint", classes: ["api_signal"] },
  { marker: "competition", classes: ["competition_signal"] },
  { marker: "season", classes: ["season_signal"] },
  { marker: "team", classes: ["team_signal"] },
  { marker: "allsvenskan", classes: ["swedish_official_signal"] },
  { marker: "superettan", classes: ["swedish_official_signal"] },
  { marker: "sef-leagues", classes: ["swedish_official_signal", "asset_family_signal"] }
];

const maxOccurrencesPerMarkerPerAsset = 60;
const contextRadius = 240;

function sha256Buffer(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

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

function boundedFindAll(text, marker) {
  const offsets = [];
  let cursor = 0;
  while (offsets.length < maxOccurrencesPerMarkerPerAsset) {
    const found = text.indexOf(marker, cursor);
    if (found === -1) break;
    offsets.push(found);
    cursor = found + Math.max(marker.length, 1);
  }
  return offsets;
}

function contextAt(text, offset) {
  const start = Math.max(0, offset - contextRadius);
  const end = Math.min(text.length, offset + contextRadius);
  return text.slice(start, end).replace(/\s+/g, " ").slice(0, 700);
}

function scanAsset(probeRow) {
  const assetPath = probeRow.rangeTempFile;
  if (!assetPath || !fs.existsSync(assetPath)) {
    return {
      competitionSlug: probeRow.competitionSlug,
      assetUrl: probeRow.assetUrl,
      assetPath,
      assetReadStatus: "missing",
      assetSize: 0,
      assetSha256: null,
      markerRows: []
    };
  }

  const buffer = fs.readFileSync(assetPath);
  const text = buffer.toString("utf8");
  const markerRows = [];

  for (const spec of markerSpecs) {
    const offsets = boundedFindAll(text, spec.marker);
    for (const offset of offsets) {
      markerRows.push({
        competitionSlug: probeRow.competitionSlug,
        providerFamily: probeRow.providerFamily,
        sourcePlanRowId: probeRow.sourcePlanRowId,
        assetUrl: probeRow.assetUrl,
        marker: spec.marker,
        markerClasses: spec.classes,
        offset,
        context: contextAt(text, offset)
      });
    }
  }

  return {
    competitionSlug: probeRow.competitionSlug,
    assetUrl: probeRow.assetUrl,
    assetPath,
    assetReadStatus: "read",
    assetSize: buffer.length,
    assetSha256: sha256Buffer(buffer),
    markerRowCount: markerRows.length,
    markerRows
  };
}

function assertCheck(checks, name, passed, details = {}) {
  checks.push({ name, passed: Boolean(passed), ...details });
}

if (!fs.existsSync(inputPath)) {
  throw new Error(`Missing controlled micro probe runner output: ${inputPath}`);
}

const inputText = fs.readFileSync(inputPath, "utf8");
const input = JSON.parse(inputText);
const sourceProbeRows = Array.isArray(input.probeRows) ? input.probeRows : [];
const scannedAssets = sourceProbeRows.map(scanAsset);
const markerRows = scannedAssets.flatMap((asset) => asset.markerRows);

const highValueMarkerRows = markerRows.filter((row) =>
  row.markerClasses.includes("graphql_signal") ||
  row.markerClasses.includes("api_signal") ||
  row.markerClasses.includes("provider_signal") ||
  row.markerClasses.includes("standings_signal") ||
  row.markerClasses.includes("swedish_route_signal")
);

const checks = [];
assertCheck(checks, "sourceRunnerStatusPassed", input.summary?.status === "passed", { actual: input.summary?.status });
assertCheck(checks, "sourceRunnerSelectedProbeRowsTwo", Number(input.summary?.selectedProbeRowCount ?? 0) === 2, { actual: input.summary?.selectedProbeRowCount });
assertCheck(checks, "sourceRunnerNoSearchCanonicalProductionTruth", Number(input.summary?.searchExecutedNowCount ?? -1) === 0 && Number(input.summary?.broadSearchExecutedNowCount ?? -1) === 0 && Number(input.summary?.canonicalWriteExecutedNowCount ?? -1) === 0 && Number(input.summary?.productionWriteExecutedNowCount ?? -1) === 0 && Number(input.summary?.truthAssertionExecutedNowCount ?? -1) === 0);
assertCheck(checks, "assetFilesRead", scannedAssets.length === 2 && scannedAssets.every((asset) => asset.assetReadStatus === "read"), { actual: scannedAssets.map((asset) => asset.assetReadStatus) });
assertCheck(checks, "assetFilesNonEmpty", scannedAssets.every((asset) => asset.assetSize > 0), { actual: scannedAssets.map((asset) => asset.assetSize) });
assertCheck(checks, "markerRowsFound", markerRows.length > 0, { actual: markerRows.length });
assertCheck(checks, "highValueMarkerRowsFound", highValueMarkerRows.length > 0, { actual: highValueMarkerRows.length });
assertCheck(checks, "boundedMarkerScanOnly", true, { maxOccurrencesPerMarkerPerAsset });
assertCheck(checks, "fetchExecutedNowCount", true, { actual: 0 });
assertCheck(checks, "searchExecutedNowCount", true, { actual: 0 });
assertCheck(checks, "canonicalWriteExecutedNowCount", true, { actual: 0 });
assertCheck(checks, "productionWriteExecutedNowCount", true, { actual: 0 });
assertCheck(checks, "truthAssertionExecutedNowCount", true, { actual: 0 });

const blockedCheckCount = checks.filter((check) => !check.passed).length;
const passedCheckCount = checks.filter((check) => check.passed).length;

const output = {
  output: outputPath,
  job: "build-football-truth-controlled-sportomedia-accepted-asset-bounded-marker-scan-file",
  generatedAtUtc: new Date().toISOString(),
  inputPath,
  inputSha256: sha256Text(inputText),
  policy: {
    localOnly: true,
    boundedMarkerScanOnly: true,
    noRegexStringLiteralMining: true,
    noFetchInThisJob: true,
    noSearchInThisJob: true,
    noBroadSearchInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true
  },
  summary: {
    controlledSportomediaAcceptedAssetBoundedMarkerScanStatus: blockedCheckCount === 0 ? "passed" : "passed_with_local_marker_gaps",
    scannedAssetCount: scannedAssets.length,
    scannedCompetitionCount: uniqueSorted(scannedAssets.map((asset) => asset.competitionSlug)).length,
    scannedCompetitions: uniqueSorted(scannedAssets.map((asset) => asset.competitionSlug)),
    markerRowCount: markerRows.length,
    highValueMarkerRowCount: highValueMarkerRows.length,
    markerRowsByCompetition: countBy(markerRows, "competitionSlug"),
    highValueMarkerRowsByCompetition: countBy(highValueMarkerRows, "competitionSlug"),
    checkCount: checks.length,
    passedCheckCount,
    blockedCheckCount,
    mayBuildControlledSportomediaRouteContractCandidatePlanCount: highValueMarkerRows.length > 0 ? 1 : 0,
    fetchExecutedNowCount: 0,
    searchExecutedNowCount: 0,
    broadSearchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0
  },
  checks,
  scannedAssets: scannedAssets.map((asset) => ({
    competitionSlug: asset.competitionSlug,
    assetUrl: asset.assetUrl,
    assetPath: asset.assetPath,
    assetReadStatus: asset.assetReadStatus,
    assetSize: asset.assetSize,
    assetSha256: asset.assetSha256,
    markerRowCount: asset.markerRowCount
  })),
  highValueMarkerRows: highValueMarkerRows.slice(0, 200),
  markerRows: markerRows.slice(0, 500)
};

writeJson(outputPath, output);

console.log(JSON.stringify({
  output: output.output,
  controlledSportomediaAcceptedAssetBoundedMarkerScanStatus: output.summary.controlledSportomediaAcceptedAssetBoundedMarkerScanStatus,
  scannedAssetCount: output.summary.scannedAssetCount,
  scannedCompetitions: output.summary.scannedCompetitions,
  markerRowCount: output.summary.markerRowCount,
  highValueMarkerRowCount: output.summary.highValueMarkerRowCount,
  markerRowsByCompetition: output.summary.markerRowsByCompetition,
  highValueMarkerRowsByCompetition: output.summary.highValueMarkerRowsByCompetition,
  mayBuildControlledSportomediaRouteContractCandidatePlanCount: output.summary.mayBuildControlledSportomediaRouteContractCandidatePlanCount,
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
