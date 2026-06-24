import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const inputPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "six-league-controlled-evidence-acquisition-plan-2026-06-15",
  "six-league-controlled-evidence-acquisition-plan-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "six-league-controlled-evidence-acquisition-runner-manifest-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "six-league-controlled-evidence-acquisition-runner-manifest-2026-06-15.json"
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
    "sixLeagueControlledEvidenceAcquisitionPlanTruthCount",
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

function buildRunnerTarget(workPackage, index) {
  return {
    runnerTargetId: `six_league_controlled_evidence_acquisition_runner_target_${String(index + 1).padStart(2, "0")}`,
    workPackageId: workPackage.workPackageId,
    family: workPackage.family,
    title: workPackage.title,
    acquisitionMode: workPackage.acquisitionMode,
    trustedSourceRoute: workPackage.trustedSourceRoute,
    targetCompetitions: workPackage.targetCompetitions,
    sourceCompletionPlanRowCount: workPackage.sourceCompletionPlanRowCount,
    requiredEvidenceTypes: workPackage.requiredEvidenceTypes,
    sourceCompletionPlanRowIds: workPackage.sourceCompletionPlanRowIds,
    runnerStatus: "ready_for_controlled_evidence_acquisition_approval_gate",
    executionGroup:
      workPackage.family === "laliga"
        ? "group_01_laliga_restart_dates_only"
        : workPackage.family === "norway_ntf"
          ? "group_02_norway_ntf_full_truth_capture"
          : "group_03_sportomedia_full_truth_capture",
    executionOrder: index + 1,

    isExecutionPermissionNow: false,
    isFetchPermissionNow: false,
    isSearchPermissionNow: false,
    isBroadSearchPermissionNow: false,
    isClassifierPermissionNow: false,
    isCanonicalWritePermissionNow: false,
    isProductionWritePermissionNow: false,
    isTruthAssertionPermissionNow: false,

    fetchExecutedNow: false,
    searchExecutedNow: false,
    broadSearchExecutedNow: false,
    classifierExecutedNow: false,
    canonicalWriteExecutedNow: false,
    productionWriteExecutedNow: false,
    truthAssertedNow: false
  };
}

const input = readJson(inputPath);
assertInputGuardrails(input);

const workPackages = Array.isArray(input.workPackages) ? input.workPackages : [];
const competitionPackages = Array.isArray(input.competitionPackages) ? input.competitionPackages : [];

if (workPackages.length !== 3) {
  throw new Error(`Expected 3 work packages, got ${workPackages.length}`);
}

if (competitionPackages.length !== 6) {
  throw new Error(`Expected 6 competition packages, got ${competitionPackages.length}`);
}

const totalCompletionRows = workPackages.reduce(
  (sum, row) => sum + Number(row.sourceCompletionPlanRowCount || 0),
  0
);

if (totalCompletionRows !== 18) {
  throw new Error(`Expected 18 source completion rows across work packages, got ${totalCompletionRows}`);
}

const families = uniq(workPackages.map((row) => row.family)).sort();
const expectedFamilies = ["laliga", "norway_ntf", "sportomedia"];

if (JSON.stringify(families) !== JSON.stringify(expectedFamilies)) {
  throw new Error(`Unexpected family set: ${JSON.stringify(families)}`);
}

const runnerTargets = workPackages.map(buildRunnerTarget);

const summary = {
  sixLeagueControlledEvidenceAcquisitionRunnerManifestReadCount: 1,
  sourceControlledAcquisitionWorkPackageCount: workPackages.length,
  sourceControlledAcquisitionCompetitionPackageCount: competitionPackages.length,
  sourceCompletionPlanRowCount: totalCompletionRows,

  runnerTargetCount: runnerTargets.length,
  runnerCompetitionTargetCount: uniq(runnerTargets.flatMap((row) => row.targetCompetitions)).length,

  laligaRunnerTargetCount: runnerTargets.filter((row) => row.family === "laliga").length,
  norwayNtfRunnerTargetCount: runnerTargets.filter((row) => row.family === "norway_ntf").length,
  sportomediaRunnerTargetCount: runnerTargets.filter((row) => row.family === "sportomedia").length,

  groupedRunnerManifestReadyCount: 1,
  controlledEvidenceAcquisitionApprovalGateReadyCount: 1,
  oneOffFieldByFieldExecutionPlannedCount: 0,
  oneOffLeagueDebuggingPlannedCount: 0,

  mayBuildSixLeagueControlledEvidenceAcquisitionApprovalGateCount: 1,

  manifestIsExecutionPermissionNowCount: 0,
  manifestIsFetchPermissionNowCount: 0,
  manifestIsSearchPermissionNowCount: 0,
  manifestIsBroadSearchPermissionNowCount: 0,
  manifestIsClassifierPermissionNowCount: 0,
  manifestIsCanonicalWritePermissionNowCount: 0,
  manifestIsProductionWritePermissionNowCount: 0,
  manifestIsTruthAssertionPermissionNowCount: 0,

  mayExecuteRunnerNowCount: 0,
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
  sixLeagueControlledEvidenceAcquisitionRunnerManifestTruthCount: 0,
  canonicalWrites: 0,
  productionWrite: false
};

const artifact = {
  job: "build-football-truth-six-league-controlled-evidence-acquisition-runner-manifest-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "single_no_write_no_fetch_no_search_controlled_runner_manifest_artifact",
  dryRun: true,
  inputs: {
    sixLeagueControlledEvidenceAcquisitionPlan: inputPath
  },
  policy: {
    singleRunnerManifestForThreeGroupedWorkPackages: true,
    approvalGateRequiredBeforeAnyFetchExecution: true,
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
  runnerTargets,
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
    { name: "single_grouped_runner_manifest", allowed: true, executed: true }
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
