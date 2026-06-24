import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const inputPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "six-league-controlled-evidence-acquisition-runner-manifest-2026-06-15",
  "six-league-controlled-evidence-acquisition-runner-manifest-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "six-league-controlled-evidence-acquisition-approval-gate-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "six-league-controlled-evidence-acquisition-approval-gate-2026-06-15.json"
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
    "manifestIsExecutionPermissionNowCount",
    "manifestIsFetchPermissionNowCount",
    "manifestIsSearchPermissionNowCount",
    "manifestIsBroadSearchPermissionNowCount",
    "manifestIsClassifierPermissionNowCount",
    "manifestIsCanonicalWritePermissionNowCount",
    "manifestIsProductionWritePermissionNowCount",
    "manifestIsTruthAssertionPermissionNowCount",
    "mayExecuteRunnerNowCount",
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
    "sixLeagueControlledEvidenceAcquisitionRunnerManifestTruthCount",
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

function validateTarget(target) {
  const failures = [];

  if (!target.runnerTargetId) failures.push("missing_runner_target_id");
  if (!target.workPackageId) failures.push("missing_work_package_id");
  if (!target.family) failures.push("missing_family");
  if (!target.executionGroup) failures.push("missing_execution_group");
  if (target.runnerStatus !== "ready_for_controlled_evidence_acquisition_approval_gate") {
    failures.push(`unexpected_runner_status:${target.runnerStatus}`);
  }

  if (!Array.isArray(target.targetCompetitions) || target.targetCompetitions.length === 0) {
    failures.push("missing_target_competitions");
  }

  if (!Array.isArray(target.requiredEvidenceTypes) || target.requiredEvidenceTypes.length === 0) {
    failures.push("missing_required_evidence_types");
  }

  if (!Array.isArray(target.sourceCompletionPlanRowIds) || target.sourceCompletionPlanRowIds.length === 0) {
    failures.push("missing_source_completion_plan_row_ids");
  }

  if (Number(target.sourceCompletionPlanRowCount || 0) !== target.sourceCompletionPlanRowIds.length) {
    failures.push("source_completion_row_count_mismatch");
  }

  const permissionKeys = [
    "isExecutionPermissionNow",
    "isFetchPermissionNow",
    "isSearchPermissionNow",
    "isBroadSearchPermissionNow",
    "isClassifierPermissionNow",
    "isCanonicalWritePermissionNow",
    "isProductionWritePermissionNow",
    "isTruthAssertionPermissionNow",
    "fetchExecutedNow",
    "searchExecutedNow",
    "broadSearchExecutedNow",
    "classifierExecutedNow",
    "canonicalWriteExecutedNow",
    "productionWriteExecutedNow",
    "truthAssertedNow"
  ];

  for (const key of permissionKeys) {
    if (target[key] !== false) {
      failures.push(`target_guardrail_not_false:${key}`);
    }
  }

  if (target.family === "laliga") {
    if (target.sourceCompletionPlanRowCount !== 2) failures.push("laliga_expected_2_completion_rows");
    if (!target.executionGroup.includes("laliga_restart_dates_only")) failures.push("laliga_wrong_execution_group");
  }

  if (target.family === "norway_ntf") {
    if (target.sourceCompletionPlanRowCount !== 8) failures.push("norway_expected_8_completion_rows");
    if (!target.executionGroup.includes("norway_ntf_full_truth_capture")) failures.push("norway_wrong_execution_group");
  }

  if (target.family === "sportomedia") {
    if (target.sourceCompletionPlanRowCount !== 8) failures.push("sportomedia_expected_8_completion_rows");
    if (!target.executionGroup.includes("sportomedia_full_truth_capture")) failures.push("sportomedia_wrong_execution_group");
  }

  return failures;
}

const input = readJson(inputPath);
assertInputGuardrails(input);

const runnerTargets = Array.isArray(input.runnerTargets) ? input.runnerTargets : [];
const competitionPackages = Array.isArray(input.competitionPackages) ? input.competitionPackages : [];

if (runnerTargets.length !== 3) {
  throw new Error(`Expected 3 runner targets, got ${runnerTargets.length}`);
}

if (competitionPackages.length !== 6) {
  throw new Error(`Expected 6 competition packages, got ${competitionPackages.length}`);
}

const familySet = uniq(runnerTargets.map((row) => row.family)).sort();
const expectedFamilySet = ["laliga", "norway_ntf", "sportomedia"];

if (JSON.stringify(familySet) !== JSON.stringify(expectedFamilySet)) {
  throw new Error(`Unexpected runner target family set: ${JSON.stringify(familySet)}`);
}

const allCompetitions = uniq(runnerTargets.flatMap((row) => row.targetCompetitions || [])).sort();
const expectedCompetitions = ["esp.1", "esp.2", "nor.1", "nor.2", "swe.1", "swe.2"];

if (JSON.stringify(allCompetitions) !== JSON.stringify(expectedCompetitions)) {
  throw new Error(`Unexpected competition set: ${JSON.stringify(allCompetitions)}`);
}

const totalCompletionRows = runnerTargets.reduce(
  (sum, row) => sum + Number(row.sourceCompletionPlanRowCount || 0),
  0
);

if (totalCompletionRows !== 18) {
  throw new Error(`Expected 18 source completion rows, got ${totalCompletionRows}`);
}

const approvalRows = runnerTargets.map((target, index) => {
  const failures = validateTarget(target);

  return {
    approvalRowId: `six_league_controlled_evidence_acquisition_approval_${String(index + 1).padStart(2, "0")}`,
    runnerTargetId: target.runnerTargetId,
    workPackageId: target.workPackageId,
    family: target.family,
    executionGroup: target.executionGroup,
    targetCompetitions: target.targetCompetitions,
    sourceCompletionPlanRowCount: target.sourceCompletionPlanRowCount,
    requiredEvidenceTypes: target.requiredEvidenceTypes,
    approvalStatus:
      failures.length === 0
        ? "approved_to_build_controlled_evidence_acquisition_execution_runner"
        : "blocked_controlled_evidence_acquisition_execution_runner",
    failures,
    mayBuildControlledEvidenceAcquisitionExecutionRunner: failures.length === 0,

    approvalIsExecutionPermissionNow: false,
    approvalIsFetchPermissionNow: false,
    approvalIsSearchPermissionNow: false,
    approvalIsBroadSearchPermissionNow: false,
    approvalIsClassifierPermissionNow: false,
    approvalIsCanonicalWritePermissionNow: false,
    approvalIsProductionWritePermissionNow: false,
    approvalIsTruthAssertionPermissionNow: false
  };
});

const approvedRows = approvalRows.filter((row) => row.failures.length === 0);
const blockedRows = approvalRows.filter((row) => row.failures.length > 0);

const summary = {
  sixLeagueControlledEvidenceAcquisitionApprovalGateReadCount: 1,
  sourceRunnerTargetCount: runnerTargets.length,
  sourceCompetitionPackageCount: competitionPackages.length,
  sourceCompletionPlanRowCount: totalCompletionRows,

  approvalRowCount: approvalRows.length,
  approvedRunnerTargetCount: approvedRows.length,
  blockedRunnerTargetCount: blockedRows.length,

  approvedLaligaRunnerTargetCount: approvedRows.filter((row) => row.family === "laliga").length,
  approvedNorwayNtfRunnerTargetCount: approvedRows.filter((row) => row.family === "norway_ntf").length,
  approvedSportomediaRunnerTargetCount: approvedRows.filter((row) => row.family === "sportomedia").length,

  approvedCompetitionTargetCount: uniq(approvedRows.flatMap((row) => row.targetCompetitions)).length,
  approvedCompletionPlanRowCount: approvedRows.reduce(
    (sum, row) => sum + Number(row.sourceCompletionPlanRowCount || 0),
    0
  ),

  oneOffFieldByFieldExecutionApprovedCount: 0,
  oneOffLeagueDebuggingApprovedCount: 0,

  mayBuildSixLeagueControlledEvidenceAcquisitionExecutionRunnerCount:
    blockedRows.length === 0 ? 1 : 0,

  approvalIsExecutionPermissionNowCount: 0,
  approvalIsFetchPermissionNowCount: 0,
  approvalIsSearchPermissionNowCount: 0,
  approvalIsBroadSearchPermissionNowCount: 0,
  approvalIsClassifierPermissionNowCount: 0,
  approvalIsCanonicalWritePermissionNowCount: 0,
  approvalIsProductionWritePermissionNowCount: 0,
  approvalIsTruthAssertionPermissionNowCount: 0,

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
  sixLeagueControlledEvidenceAcquisitionApprovalGateTruthCount: 0,
  canonicalWrites: 0,
  productionWrite: false
};

const artifact = {
  job: "run-football-truth-six-league-controlled-evidence-acquisition-approval-gate-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "single_no_write_no_fetch_no_search_controlled_acquisition_approval_gate_artifact",
  dryRun: true,
  inputs: {
    sixLeagueControlledEvidenceAcquisitionRunnerManifest: inputPath
  },
  policy: {
    approvalGateOnly: true,
    approvalDoesNotExecuteFetch: true,
    approvalDoesNotAssertTruth: true,
    executionRunnerBuildRequiredAfterApproval: true,
    singleGroupedExecutionPath: true,
    noFetch: true,
    noSearch: true,
    noBroadSearch: true,
    noClassifierExecution: true,
    noCanonicalWrite: true,
    noProductionWrite: true,
    noTruthAssertion: true
  },
  summary,
  approvalRows,
  blockedRows,
  guardrails: [
    { name: "no_fetch", allowed: false, executed: false },
    { name: "no_search", allowed: false, executed: false },
    { name: "no_broad_search", allowed: false, executed: false },
    { name: "no_classifier", allowed: false, executed: false },
    { name: "no_canonical_write", allowed: false, executed: false },
    { name: "no_production_write", allowed: false, executed: false },
    { name: "no_truth_assertion", allowed: false, executed: false },
    { name: "single_grouped_approval_gate", allowed: true, executed: true }
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

if (blockedRows.length > 0) {
  throw new Error(`Approval gate blocked ${blockedRows.length} runner targets`);
}
