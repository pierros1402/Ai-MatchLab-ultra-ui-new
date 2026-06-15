import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const inputPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-resumption-full-map-next-batch-plan-2026-06-15",
  "post-resumption-full-map-next-batch-plan-2026-06-15.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-resumption-full-map-next-batch-plan-quality-gate-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-resumption-full-map-next-batch-plan-quality-gate-2026-06-15.json"
);

const expectedFamilies = new Set([
  "primary_manifest",
  "followup_quality_gated",
  "active_workstream_execution_wave",
  "reusable_family_acceleration",
  "provider_family_repair_backlog"
]);

const expectedMainLaneFamilies = new Set([
  "primary_manifest",
  "followup_quality_gated",
  "active_workstream_execution_wave",
  "reusable_family_acceleration"
]);

const expectedRepairBacklogFamilies = new Set([
  "provider_family_repair_backlog"
]);

const permissionKeys = [
  "isExecutionPermissionNow",
  "isFetchPermissionNow",
  "isSearchPermissionNow",
  "isBroadSearchPermissionNow",
  "isClassifierPermissionNow",
  "isCanonicalWritePermissionNow",
  "isProductionWritePermissionNow",
  "isTruthAssertionPermissionNow"
];

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required input file: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function valueAt(input, pathName) {
  const parts = pathName.split(".");
  let value = input;

  for (const part of parts) {
    if (!value || typeof value !== "object" || !(part in value)) {
      return null;
    }
    value = value[part];
  }

  return value;
}

function numberAt(input, pathName) {
  const value = valueAt(input, pathName);
  return typeof value === "number" ? value : null;
}

function boolAt(input, pathName) {
  const value = valueAt(input, pathName);
  return typeof value === "boolean" ? value : null;
}

function assertZeroIfPresent(input, pathName) {
  const value = numberAt(input, pathName);
  if (value !== null && value !== 0) {
    throw new Error(`Expected ${pathName}=0, got ${value}`);
  }
}

function assertFalseIfPresent(input, pathName) {
  const value = boolAt(input, pathName);
  if (value !== null && value !== false) {
    throw new Error(`Expected ${pathName}=false, got ${value}`);
  }
}

function assertInputGuardrails(input) {
  [
    "summary.planIsExecutionPermissionNowCount",
    "summary.planIsFetchPermissionNowCount",
    "summary.planIsSearchPermissionNowCount",
    "summary.planIsBroadSearchPermissionNowCount",
    "summary.planIsClassifierPermissionNowCount",
    "summary.planIsCanonicalWritePermissionNowCount",
    "summary.planIsProductionWritePermissionNowCount",
    "summary.planIsTruthAssertionPermissionNowCount",
    "summary.mayExecuteFurtherNowCount",
    "summary.mayFetchNowCount",
    "summary.maySearchNowCount",
    "summary.mayBroadSearchNowCount",
    "summary.mayClassifySeasonStateNowCount",
    "summary.mayWriteCanonicalNowCount",
    "summary.mayAssertTruthNowCount",
    "summary.fetchExecutedNowCount",
    "summary.searchExecutedNowCount",
    "summary.broadSearchExecutedNowCount",
    "summary.classifierExecutedNowCount",
    "summary.canonicalWriteExecutedNowCount",
    "summary.productionWriteExecutedNowCount",
    "summary.seasonStateTruthAssertedCount",
    "summary.postResumptionFullMapNextBatchPlanTruthCount",
    "canonicalWrites"
  ].forEach((pathName) => assertZeroIfPresent(input, pathName));

  [
    "productionWrite",
    "sourceFetch.executed",
    "searchProviderUsed",
    "broadSearchUsed",
    "classifierExecuted"
  ].forEach((pathName) => assertFalseIfPresent(input, pathName));
}

function countWhere(rows, predicate) {
  return rows.filter(predicate).length;
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = row[key] || "missing";
    acc[value] = (acc[value] || 0) + 1;
    return acc;
  }, {});
}

function validateBatchPlanRow(row, index) {
  const failures = [];

  if (!row || typeof row !== "object") {
    failures.push("row_is_not_object");
    return failures;
  }

  if (!row.batchPlanRowId || typeof row.batchPlanRowId !== "string") {
    failures.push("missing_batch_plan_row_id");
  }

  if (!row.sourceAction || typeof row.sourceAction !== "string") {
    failures.push("missing_source_action");
  }

  if (!row.batchFamily || !expectedFamilies.has(row.batchFamily)) {
    failures.push(`unexpected_batch_family:${row.batchFamily}`);
  }

  if (row.lane !== "main_lane" && row.lane !== "repair_backlog") {
    failures.push(`unexpected_lane:${row.lane}`);
  }

  if (row.lane === "main_lane" && !expectedMainLaneFamilies.has(row.batchFamily)) {
    failures.push(`main_lane_unexpected_family:${row.batchFamily}`);
  }

  if (row.lane === "repair_backlog" && !expectedRepairBacklogFamilies.has(row.batchFamily)) {
    failures.push(`repair_backlog_unexpected_family:${row.batchFamily}`);
  }

  if (row.batchFamily === "provider_family_repair_backlog") {
    const scope = String(row.batchScope || "").toLowerCase();
    if (!scope.includes("sportomedia")) {
      failures.push("provider_family_repair_backlog_not_scoped_to_sportomedia");
    }
  }

  if (row.planningStatus !== "planned_from_quality_gated_next_action_pack") {
    failures.push(`unexpected_planning_status:${row.planningStatus}`);
  }

  for (const key of permissionKeys) {
    if (row[key] !== false) {
      failures.push(`permission_not_false:${key}`);
    }
  }

  if (row.blocksWholeMap !== false) {
    failures.push("blocks_whole_map_not_false");
  }

  if (index < 0) {
    failures.push("invalid_row_index");
  }

  return failures;
}

const input = readJson(inputPath);
assertInputGuardrails(input);

const batchPlanRows = Array.isArray(input.batchPlanRows)
  ? input.batchPlanRows
  : [];

if (batchPlanRows.length !== 5) {
  throw new Error(`Expected exactly 5 batch plan rows, got ${batchPlanRows.length}`);
}

const sourceSummary = input.summary || {};

if (sourceSummary.plannedNextBatchCandidateCount !== 5) {
  throw new Error(`Expected source plannedNextBatchCandidateCount=5, got ${sourceSummary.plannedNextBatchCandidateCount}`);
}

if (sourceSummary.mainLaneNextBatchCandidateCount !== 4) {
  throw new Error(`Expected source mainLaneNextBatchCandidateCount=4, got ${sourceSummary.mainLaneNextBatchCandidateCount}`);
}

if (sourceSummary.repairBacklogNextBatchCandidateCount !== 1) {
  throw new Error(`Expected source repairBacklogNextBatchCandidateCount=1, got ${sourceSummary.repairBacklogNextBatchCandidateCount}`);
}

if (sourceSummary.sportomediaProviderFamilyRepairNextBatchCandidateCount !== 1) {
  throw new Error(
    `Expected source sportomediaProviderFamilyRepairNextBatchCandidateCount=1, got ${sourceSummary.sportomediaProviderFamilyRepairNextBatchCandidateCount}`
  );
}

if (sourceSummary.oneOffLeagueDebuggingPlannedCount !== 0) {
  throw new Error(`Expected source oneOffLeagueDebuggingPlannedCount=0, got ${sourceSummary.oneOffLeagueDebuggingPlannedCount}`);
}

if (sourceSummary.sportomediaBlocksWholeMapCount !== 0) {
  throw new Error(`Expected source sportomediaBlocksWholeMapCount=0, got ${sourceSummary.sportomediaBlocksWholeMapCount}`);
}

const byLane = countBy(batchPlanRows, "lane");
const byFamily = countBy(batchPlanRows, "batchFamily");

if ((byLane.main_lane || 0) !== 4) {
  throw new Error(`Expected 4 main_lane rows, got ${byLane.main_lane || 0}`);
}

if ((byLane.repair_backlog || 0) !== 1) {
  throw new Error(`Expected 1 repair_backlog row, got ${byLane.repair_backlog || 0}`);
}

for (const family of expectedFamilies) {
  if ((byFamily[family] || 0) !== 1) {
    throw new Error(`Expected exactly 1 row for ${family}, got ${byFamily[family] || 0}`);
  }
}

const qualityGateRows = batchPlanRows.map((row, index) => {
  const failures = validateBatchPlanRow(row, index);

  return {
    qualityGateRowId: `post_resumption_next_batch_plan_quality_gate_${String(index + 1).padStart(2, "0")}`,
    sourceBatchPlanRowId: row.batchPlanRowId || null,
    sourceBatchPlanRowIndex: index,
    sourceAction: row.sourceAction || null,
    lane: row.lane || null,
    batchFamily: row.batchFamily || null,
    batchScope: row.batchScope || null,
    qualityGateStatus:
      failures.length === 0
        ? "passed_post_resumption_full_map_next_batch_plan_quality_gate"
        : "blocked_post_resumption_full_map_next_batch_plan_quality_gate",
    failures,
    mayBuildNextMaterializationPlan: failures.length === 0,
    isExecutionPermissionNow: false,
    isFetchPermissionNow: false,
    isSearchPermissionNow: false,
    isBroadSearchPermissionNow: false,
    isClassifierPermissionNow: false,
    isCanonicalWritePermissionNow: false,
    isProductionWritePermissionNow: false,
    isTruthAssertionPermissionNow: false,
    blocksWholeMap: false
  };
});

const blockedRows = qualityGateRows.filter((row) => row.failures.length > 0);
const passedRows = qualityGateRows.filter((row) => row.failures.length === 0);

const mainLaneNextBatchPlanQualityGatedCount = countWhere(
  passedRows,
  (row) => row.lane === "main_lane"
);

const repairBacklogNextBatchPlanQualityGatedCount = countWhere(
  passedRows,
  (row) => row.lane === "repair_backlog"
);

const sportomediaProviderFamilyRepairNextBatchPlanQualityGatedCount = countWhere(
  passedRows,
  (row) =>
    row.lane === "repair_backlog" &&
    row.batchFamily === "provider_family_repair_backlog" &&
    String(row.batchScope || "").includes("sportomedia")
);

const summary = {
  postResumptionFullMapNextBatchPlanQualityGateReadCount: 1,
  sourceBatchPlanRowCount: batchPlanRows.length,
  postResumptionFullMapNextBatchPlanQualityGateRowCount: qualityGateRows.length,
  postResumptionFullMapNextBatchPlanQualityGatePassedCount: passedRows.length,
  postResumptionFullMapNextBatchPlanQualityGateBlockedCount: blockedRows.length,
  mainLaneNextBatchPlanQualityGatedCount,
  repairBacklogNextBatchPlanQualityGatedCount,
  sportomediaProviderFamilyRepairNextBatchPlanQualityGatedCount,
  wholeMapMainLaneResumedNextBatchPlanQualityGatedCount: mainLaneNextBatchPlanQualityGatedCount === 4 ? 1 : 0,
  largeFullMapBatchPlanningQualityGatedCount: passedRows.length === 5 ? 1 : 0,
  oneOffLeagueDebuggingQualityGatedCount: 0,
  sportomediaBlocksWholeMapCount: 0,
  providerMicroProbingContinuedInMainLaneCount: 0,
  mayBuildPostResumptionFullMapNextBatchMaterializationPlanCount: blockedRows.length === 0 ? 1 : 0,

  qualityGateIsExecutionPermissionNowCount: 0,
  qualityGateIsFetchPermissionNowCount: 0,
  qualityGateIsSearchPermissionNowCount: 0,
  qualityGateIsBroadSearchPermissionNowCount: 0,
  qualityGateIsClassifierPermissionNowCount: 0,
  qualityGateIsCanonicalWritePermissionNowCount: 0,
  qualityGateIsProductionWritePermissionNowCount: 0,
  qualityGateIsTruthAssertionPermissionNowCount: 0,

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
  postResumptionFullMapNextBatchPlanQualityGateTruthCount: 0,
  canonicalWrites: 0,
  productionWrite: false
};

const artifact = {
  job: "run-football-truth-post-resumption-full-map-next-batch-plan-quality-gate-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_quality_gate_artifact",
  dryRun: true,
  inputs: {
    postResumptionFullMapNextBatchPlan: inputPath
  },
  wholeMapResumptionPolicy: {
    doNotRestartFromRawUniverse: true,
    doNotReturnToGeneric660CalendarRun: true,
    doNotUseOneOrTwoLeagueDebuggingAsMainFlow: true,
    doNotTreatSportomediaAsWholeMapBlocker: true,
    continueFromPostResumptionFullMapNextBatchPlan: true,
    targetPlanningDirection: "large_full_map_batches"
  },
  summary,
  counts: {
    byLane,
    byFamily
  },
  qualityGateRows,
  blockedRows,
  guardrails: [
    { name: "no_fetch", allowed: false, executed: false },
    { name: "no_search", allowed: false, executed: false },
    { name: "no_broad_search", allowed: false, executed: false },
    { name: "no_classifier", allowed: false, executed: false },
    { name: "no_canonical_write", allowed: false, executed: false },
    { name: "no_production_write", allowed: false, executed: false },
    { name: "no_truth_assertion", allowed: false, executed: false },
    { name: "quality_gate_artifact_only", allowed: true, executed: true }
  ],
  sourceFetch: {
    allowed: false,
    executed: false
  },
  searchProviderUsed: false,
  broadSearchUsed: false,
  classifierExecuted: false,
  canonicalWrites: 0,
  productionWrite: false
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");

console.log(
  JSON.stringify(
    {
      output: outputPath,
      ...summary
    },
    null,
    2
  )
);

if (blockedRows.length > 0) {
  throw new Error(`Quality gate blocked ${blockedRows.length} rows`);
}
