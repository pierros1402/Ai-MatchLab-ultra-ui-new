import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const inputPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "six-league-evidence-completion-plan-2026-06-15",
  "six-league-evidence-completion-plan-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "six-league-controlled-evidence-acquisition-plan-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "six-league-controlled-evidence-acquisition-plan-2026-06-15.json"
);

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required input file: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertZero(value, name) {
  if (value !== undefined && value !== null && value !== 0) {
    throw new Error(`Expected ${name}=0, got ${value}`);
  }
}

function assertFalse(value, name) {
  if (value !== undefined && value !== null && value !== false) {
    throw new Error(`Expected ${name}=false, got ${value}`);
  }
}

function assertInputGuardrails(input) {
  const s = input.summary || {};

  [
    "planIsExecutionPermissionNowCount",
    "planIsFetchPermissionNowCount",
    "planIsSearchPermissionNowCount",
    "planIsBroadSearchPermissionNowCount",
    "planIsClassifierPermissionNowCount",
    "planIsCanonicalWritePermissionNowCount",
    "planIsProductionWritePermissionNowCount",
    "planIsTruthAssertionPermissionNowCount",
    "mayExecuteFurtherNowCount",
    "mayFetchNowCount",
    "maySearchNowCount",
    "mayBroadSearchNowCount",
    "mayClassifySeasonStateNowCount",
    "mayWriteCanonicalNowCount",
    "mayAssertTruthNowCount",
    "fetchExecutedNowCount",
    "searchExecutedNowCount",
    "broadSearchExecutedNowCount",
    "classifierExecutedNowCount",
    "canonicalWriteExecutedNowCount",
    "productionWriteExecutedNowCount",
    "seasonStateTruthAssertedCount",
    "sixLeagueEvidenceCompletionPlanTruthCount",
    "canonicalWrites"
  ].forEach((key) => assertZero(s[key], `summary.${key}`));

  assertZero(input.canonicalWrites, "canonicalWrites");
  assertFalse(input.productionWrite, "productionWrite");
  assertFalse(input.sourceFetch?.executed, "sourceFetch.executed");
  assertFalse(input.searchProviderUsed, "searchProviderUsed");
  assertFalse(input.broadSearchUsed, "broadSearchUsed");
  assertFalse(input.classifierExecuted, "classifierExecuted");
}

function uniq(values) {
  return [...new Set(values)];
}

function rowsFor(rows, predicate) {
  return rows.filter(predicate);
}

function buildWorkPackage({ id, family, title, rows, acquisitionMode, trustedSourceRoute, targetCompetitions }) {
  const requiredEvidenceTypes = uniq(rows.map((row) => row.requiredEvidenceType)).sort();
  const proposedCompletionLanes = uniq(rows.map((row) => row.proposedCompletionLane)).sort();

  return {
    workPackageId: id,
    family,
    title,
    acquisitionMode,
    trustedSourceRoute,
    targetCompetitions,
    sourceCompletionPlanRowCount: rows.length,
    requiredEvidenceTypes,
    proposedCompletionLanes,
    sourceCompletionPlanRowIds: rows.map((row) => row.completionPlanRowId),
    rowsByCompetition: targetCompetitions.reduce((acc, slug) => {
      acc[slug] = rows.filter((row) => row.competitionSlug === slug).map((row) => ({
        completionPlanRowId: row.completionPlanRowId,
        requiredEvidenceType: row.requiredEvidenceType,
        proposedCompletionLane: row.proposedCompletionLane,
        missingStrictTruthArea: row.missingStrictTruthArea
      }));
      return acc;
    }, {}),
    mayBuildControlledAcquisitionRunner: true,
    isExecutionPermissionNow: false,
    isFetchPermissionNow: false,
    isSearchPermissionNow: false,
    isBroadSearchPermissionNow: false,
    isClassifierPermissionNow: false,
    isCanonicalWritePermissionNow: false,
    isProductionWritePermissionNow: false,
    isTruthAssertionPermissionNow: false
  };
}

const input = readJson(inputPath);
assertInputGuardrails(input);

const rows = Array.isArray(input.completionPlanRows) ? input.completionPlanRows : [];

if (rows.length !== 18) {
  throw new Error(`Expected 18 completion plan rows, got ${rows.length}`);
}

const laligaRows = rowsFor(
  rows,
  (row) => row.family === "laliga" && row.requiredEvidenceType === "next_active_restart_date"
);

const norwayRows = rowsFor(rows, (row) => row.family === "norway_ntf");
const sportomediaRows = rowsFor(rows, (row) => row.family === "sportomedia");

if (laligaRows.length !== 2) {
  throw new Error(`Expected 2 LaLiga restart-date rows, got ${laligaRows.length}`);
}

if (norwayRows.length !== 8) {
  throw new Error(`Expected 8 Norway rows, got ${norwayRows.length}`);
}

if (sportomediaRows.length !== 8) {
  throw new Error(`Expected 8 Sportomedia rows, got ${sportomediaRows.length}`);
}

const workPackages = [
  buildWorkPackage({
    id: "six_league_acquisition_wp_01_laliga_restart_dates_only",
    family: "laliga",
    title: "LaLiga restart/next-active date completion only",
    rows: laligaRows,
    acquisitionMode: "reuse_existing_laliga_source_route_for_restart_date_only",
    trustedSourceRoute: "configured_laliga_official_route_restart_or_next_fixture_date",
    targetCompetitions: ["esp.1", "esp.2"]
  }),
  buildWorkPackage({
    id: "six_league_acquisition_wp_02_norway_ntf_full_truth_capture",
    family: "norway_ntf",
    title: "Norway NTF full trusted standings/fixtures/season-state/restart capture",
    rows: norwayRows,
    acquisitionMode: "reuse_existing_norway_ntf_route_for_full_trusted_capture",
    trustedSourceRoute: "configured_norway_ntf_official_route_full_truth_capture",
    targetCompetitions: ["nor.1", "nor.2"]
  }),
  buildWorkPackage({
    id: "six_league_acquisition_wp_03_sportomedia_full_truth_capture",
    family: "sportomedia",
    title: "Sportomedia full trusted standings/fixtures/season-state/restart capture",
    rows: sportomediaRows,
    acquisitionMode: "repair_backlog_controlled_sportomedia_route_full_trusted_capture",
    trustedSourceRoute: "configured_sportomedia_route_full_truth_capture_after_repair_backlog",
    targetCompetitions: ["swe.1", "swe.2"]
  })
];

const competitionPackages = ["esp.1", "esp.2", "nor.1", "nor.2", "swe.1", "swe.2"].map((slug) => {
  const competitionRows = rows.filter((row) => row.competitionSlug === slug);
  const family = competitionRows[0]?.family || "unknown";

  return {
    competitionPackageId: `${slug}_controlled_evidence_acquisition_package`,
    competitionSlug: slug,
    family,
    sourceCompletionPlanRowCount: competitionRows.length,
    requiredEvidenceTypes: uniq(competitionRows.map((row) => row.requiredEvidenceType)).sort(),
    sourceCompletionPlanRowIds: competitionRows.map((row) => row.completionPlanRowId),
    packageStatus: "ready_for_grouped_controlled_acquisition_runner_manifest",
    isExecutionPermissionNow: false,
    isFetchPermissionNow: false,
    isSearchPermissionNow: false,
    isBroadSearchPermissionNow: false,
    isClassifierPermissionNow: false,
    isCanonicalWritePermissionNow: false,
    isProductionWritePermissionNow: false,
    isTruthAssertionPermissionNow: false
  };
});

const summary = {
  sixLeagueControlledEvidenceAcquisitionPlanReadCount: 1,
  sourceCompletionPlanRowCount: rows.length,
  controlledAcquisitionWorkPackageCount: workPackages.length,
  controlledAcquisitionCompetitionPackageCount: competitionPackages.length,

  laligaRestartDateOnlyWorkPackageCount: workPackages.filter((row) => row.family === "laliga").length,
  norwayNtfFullTrustedCaptureWorkPackageCount: workPackages.filter((row) => row.family === "norway_ntf").length,
  sportomediaFullTrustedCaptureWorkPackageCount: workPackages.filter((row) => row.family === "sportomedia").length,

  laligaRestartDateOnlyCompletionRowCount: laligaRows.length,
  norwayNtfFullTrustedCaptureCompletionRowCount: norwayRows.length,
  sportomediaFullTrustedCaptureCompletionRowCount: sportomediaRows.length,

  controlledAcquisitionRunnerManifestReadyCount: 1,
  oneOffFieldByFieldExecutionPlannedCount: 0,
  oneOffLeagueDebuggingPlannedCount: 0,

  mayBuildSixLeagueControlledEvidenceAcquisitionRunnerManifestCount: 1,

  planIsExecutionPermissionNowCount: 0,
  planIsFetchPermissionNowCount: 0,
  planIsSearchPermissionNowCount: 0,
  planIsBroadSearchPermissionNowCount: 0,
  planIsClassifierPermissionNowCount: 0,
  planIsCanonicalWritePermissionNowCount: 0,
  planIsProductionWritePermissionNowCount: 0,
  planIsTruthAssertionPermissionNowCount: 0,

  mayExecuteFurtherNowCount: 0,
  mayFetchNowCount: 0,
  maySearchNowCount: 0,
  mayBroadSearchNowCount: 0,
  mayClassifySeasonStateNowCount: 0,
  mayWriteCanonicalNowCount: 0,
  mayAssertTruthNowCount: 0,

  fetchExecutedNowCount: 0,
  searchExecutedNowCount: 0,
  broadSearchExecutedNowCount: 0,
  classifierExecutedNowCount: 0,
  canonicalWriteExecutedNowCount: 0,
  productionWriteExecutedNowCount: 0,
  seasonStateTruthAssertedCount: 0,
  sixLeagueControlledEvidenceAcquisitionPlanTruthCount: 0,
  canonicalWrites: 0,
  productionWrite: false
};

const artifact = {
  job: "build-football-truth-six-league-controlled-evidence-acquisition-plan-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "grouped_no_write_no_fetch_no_search_controlled_acquisition_planning_artifact",
  dryRun: true,
  inputs: {
    sixLeagueEvidenceCompletionPlan: inputPath
  },
  policy: {
    groupedWorkPackagesInsteadOfFieldByFieldJobs: true,
    pauseFullMapMaterializationUntilSixLeagueEvidenceIsCompleted: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  summary,
  workPackages,
  competitionPackages,
  blockedRows: [],
  guardrails: [
    { name: "no_fetch", allowed: false, executed: false },
    { name: "no_search", allowed: false, executed: false },
    { name: "no_broad_search", allowed: false, executed: false },
    { name: "no_classifier", allowed: false, executed: false },
    { name: "no_canonical_write", allowed: false, executed: false },
    { name: "no_production_write", allowed: false, executed: false },
    { name: "no_truth_assertion", allowed: false, executed: false },
    { name: "grouped_work_packages", allowed: true, executed: true }
  ],
  sourceFetch: { allowed: false, executed: false },
  searchProviderUsed: false,
  broadSearchUsed: false,
  classifierExecuted: false,
  canonicalWrites: 0,
  productionWrite: false
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

console.log(JSON.stringify({ output: outputPath, ...summary }, null, 2));
