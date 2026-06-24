import fs from "node:fs";
import path from "node:path";

const DATE = "2026-06-15";

const inputPath = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-resumption-full-map-next-action-pack-quality-gate-2026-06-14",
  "post-resumption-full-map-next-action-pack-quality-gate-2026-06-14.json"
);

const outDir = path.join(
  "data",
  "football-truth",
  "_diagnostics",
  "post-resumption-full-map-next-batch-plan-2026-06-15"
);

const outputPath = path.join(
  outDir,
  "post-resumption-full-map-next-batch-plan-2026-06-15.json"
);

const expectedBatchTemplates = [
  {
    batchFamily: "primary_manifest",
    sourceAction: "materialize_primary_manifest_next_batch_candidate",
    lane: "main_lane",
    batchScope: "full_map_primary_manifest_next_batch",
    expectedBatchRole: "materialize the next full-map primary manifest candidate batch"
  },
  {
    batchFamily: "followup_quality_gated",
    sourceAction: "materialize_followup_quality_gated_next_batch_candidate",
    lane: "main_lane",
    batchScope: "full_map_followup_quality_gated_next_batch",
    expectedBatchRole: "materialize the next already-quality-gated follow-up candidate batch"
  },
  {
    batchFamily: "active_workstream_execution_wave",
    sourceAction: "materialize_active_workstream_execution_wave_next_batch_candidate",
    lane: "main_lane",
    batchScope: "full_map_active_workstream_execution_wave_next_batch",
    expectedBatchRole: "materialize the next full-map active workstream execution-wave candidate batch"
  },
  {
    batchFamily: "reusable_family_acceleration",
    sourceAction: "materialize_reusable_family_acceleration_next_batch_candidate",
    lane: "main_lane",
    batchScope: "full_map_reusable_family_acceleration_next_batch",
    expectedBatchRole: "expand reusable validated family patterns into larger full-map candidate batches"
  },
  {
    batchFamily: "provider_family_repair_backlog",
    sourceAction: "materialize_provider_family_repair_backlog_next_batch_candidate",
    lane: "repair_backlog",
    batchScope: "sportomedia_provider_family_repair_backlog_next_batch",
    expectedBatchRole: "continue Sportomedia as isolated provider-family repair backlog, not as whole-map blocker"
  }
];

function readJson(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing required input file: ${filePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function flattenPrimitives(value, prefix = "", out = []) {
  if (value === null || value === undefined) {
    out.push({ path: prefix, value });
    return out;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => flattenPrimitives(entry, `${prefix}[${index}]`, out));
    return out;
  }

  if (typeof value === "object") {
    Object.entries(value).forEach(([key, entry]) => {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      flattenPrimitives(entry, nextPrefix, out);
    });
    return out;
  }

  out.push({ path: prefix, value });
  return out;
}

function numberAt(input, pathName) {
  const parts = pathName.split(".");
  let value = input;

  for (const part of parts) {
    if (!value || typeof value !== "object" || !(part in value)) {
      return null;
    }
    value = value[part];
  }

  return typeof value === "number" ? value : null;
}

function boolAt(input, pathName) {
  const parts = pathName.split(".");
  let value = input;

  for (const part of parts) {
    if (!value || typeof value !== "object" || !(part in value)) {
      return null;
    }
    value = value[part];
  }

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
    "summary.postResumptionFullMapNextActionPackQualityGateTruthCount",
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

function collectText(row) {
  return flattenPrimitives(row)
    .map((item) => `${item.path}=${String(item.value)}`)
    .join("\n")
    .toLowerCase();
}

function compactRow(row) {
  const primitives = flattenPrimitives(row);

  const useful = primitives
    .filter((item) => {
      const p = item.path.toLowerCase();
      const v = String(item.value).toLowerCase();

      if (p.includes("sourcequalitygaterow")) return false;
      if (p.includes("guardrail")) return false;
      if (p.includes("canonicalwrite")) return false;
      if (p.includes("productionwrite")) return false;
      if (p.includes("truth")) return false;
      if (p.includes("fetch")) return false;
      if (p.includes("search")) return false;
      if (p.includes("classifier")) return false;

      return (
        p.includes("action") ||
        p.includes("lane") ||
        p.includes("family") ||
        p.includes("scope") ||
        p.includes("status") ||
        p.includes("candidate") ||
        v.includes("materialize_") ||
        v.includes("primary_manifest") ||
        v.includes("followup") ||
        v.includes("active_workstream") ||
        v.includes("reusable_family") ||
        v.includes("provider_family_repair")
      );
    })
    .slice(0, 50);

  return useful;
}

function findBestSourceRow(template, qualityGateRows, usedIndexes) {
  const directNeedles = [
    template.sourceAction,
    template.batchFamily,
    template.batchScope
  ].map((value) => value.toLowerCase());

  let best = null;

  qualityGateRows.forEach((row, index) => {
    if (usedIndexes.has(index)) return;

    const text = collectText(row);
    let score = 0;

    for (const needle of directNeedles) {
      if (text.includes(needle)) score += 10;
    }

    if (template.batchFamily === "primary_manifest" && text.includes("primary")) score += 3;
    if (template.batchFamily === "followup_quality_gated" && text.includes("followup")) score += 3;
    if (template.batchFamily === "active_workstream_execution_wave" && text.includes("active_workstream")) score += 3;
    if (template.batchFamily === "reusable_family_acceleration" && text.includes("reusable")) score += 3;
    if (template.batchFamily === "provider_family_repair_backlog" && text.includes("repair_backlog")) score += 3;

    if (!best || score > best.score) {
      best = { index, row, score };
    }
  });

  if (best && best.score > 0) {
    usedIndexes.add(best.index);
    return {
      sourceQualityGateRowIndex: best.index,
      sourceQualityGateRowMatchStatus: "matched_by_quality_gate_row_content",
      sourceQualityGateRowMatchScore: best.score,
      sourceQualityGateRow: best.row,
      sourceQualityGateRowCompact: compactRow(best.row)
    };
  }

  return null;
}

function buildPlanRows(qualityGateRows) {
  const usedIndexes = new Set();

  const rows = expectedBatchTemplates.map((template, index) => {
    const matched = findBestSourceRow(template, qualityGateRows, usedIndexes);

    let sourceQualityGateRowIndex = null;
    let sourceQualityGateRow = null;
    let sourceQualityGateRowCompact = [];
    let sourceQualityGateRowMatchStatus = "assigned_by_validated_quality_gate_summary_shape";
    let sourceQualityGateRowMatchScore = 0;

    if (matched) {
      sourceQualityGateRowIndex = matched.sourceQualityGateRowIndex;
      sourceQualityGateRow = matched.sourceQualityGateRow;
      sourceQualityGateRowCompact = matched.sourceQualityGateRowCompact;
      sourceQualityGateRowMatchStatus = matched.sourceQualityGateRowMatchStatus;
      sourceQualityGateRowMatchScore = matched.sourceQualityGateRowMatchScore;
    } else {
      const fallbackIndex = qualityGateRows.findIndex((_, candidateIndex) => !usedIndexes.has(candidateIndex));
      if (fallbackIndex >= 0) {
        usedIndexes.add(fallbackIndex);
        sourceQualityGateRowIndex = fallbackIndex;
        sourceQualityGateRow = qualityGateRows[fallbackIndex];
        sourceQualityGateRowCompact = compactRow(sourceQualityGateRow);
      }
    }

    return {
      batchPlanRowId: `post_resumption_next_batch_plan_${String(index + 1).padStart(2, "0")}`,
      sourceQualityGateRowIndex,
      sourceQualityGateRowMatchStatus,
      sourceQualityGateRowMatchScore,
      sourceAction: template.sourceAction,
      lane: template.lane,
      batchFamily: template.batchFamily,
      batchScope: template.batchScope,
      expectedBatchRole: template.expectedBatchRole,
      planningStatus: "planned_from_quality_gated_next_action_pack",
      isExecutionPermissionNow: false,
      isFetchPermissionNow: false,
      isSearchPermissionNow: false,
      isBroadSearchPermissionNow: false,
      isClassifierPermissionNow: false,
      isCanonicalWritePermissionNow: false,
      isProductionWritePermissionNow: false,
      isTruthAssertionPermissionNow: false,
      blocksWholeMap: false,
      sourceQualityGateRowCompact,
      sourceQualityGateRow
    };
  });

  if (usedIndexes.size !== qualityGateRows.length) {
    throw new Error(
      `Expected to account for ${qualityGateRows.length} quality gate rows, accounted for ${usedIndexes.size}`
    );
  }

  return rows;
}

function countWhere(rows, predicate) {
  return rows.filter(predicate).length;
}

const input = readJson(inputPath);
assertInputGuardrails(input);

const qualityGateRows = Array.isArray(input.qualityGateRows)
  ? input.qualityGateRows
  : [];

if (qualityGateRows.length !== 5) {
  throw new Error(`Expected exactly 5 quality-gated next-action rows, got ${qualityGateRows.length}`);
}

const inputPassedCount =
  numberAt(input, "summary.postResumptionFullMapNextActionPackQualityGatePassedCount") ??
  numberAt(input, "counts.postResumptionFullMapNextActionPackQualityGatePassedCount");

const inputBlockedCount =
  numberAt(input, "summary.postResumptionFullMapNextActionPackQualityGateBlockedCount") ??
  numberAt(input, "counts.postResumptionFullMapNextActionPackQualityGateBlockedCount");

if (inputPassedCount !== null && inputPassedCount !== 5) {
  throw new Error(`Expected input quality gate passed count 5, got ${inputPassedCount}`);
}

if (inputBlockedCount !== null && inputBlockedCount !== 0) {
  throw new Error(`Expected input quality gate blocked count 0, got ${inputBlockedCount}`);
}

const batchPlanRows = buildPlanRows(qualityGateRows);

const mainLaneNextBatchCandidateCount = countWhere(batchPlanRows, (row) => row.lane === "main_lane");
const repairBacklogNextBatchCandidateCount = countWhere(batchPlanRows, (row) => row.lane === "repair_backlog");
const sportomediaProviderFamilyRepairNextBatchCandidateCount = countWhere(
  batchPlanRows,
  (row) =>
    row.lane === "repair_backlog" &&
    row.batchFamily === "provider_family_repair_backlog" &&
    row.batchScope.includes("sportomedia")
);

if (mainLaneNextBatchCandidateCount !== 4) {
  throw new Error(`Expected 4 main-lane next batch candidates, got ${mainLaneNextBatchCandidateCount}`);
}

if (repairBacklogNextBatchCandidateCount !== 1) {
  throw new Error(`Expected 1 repair-backlog next batch candidate, got ${repairBacklogNextBatchCandidateCount}`);
}

if (sportomediaProviderFamilyRepairNextBatchCandidateCount !== 1) {
  throw new Error(
    `Expected 1 Sportomedia provider-family repair next batch candidate, got ${sportomediaProviderFamilyRepairNextBatchCandidateCount}`
  );
}

const summary = {
  postResumptionFullMapNextBatchPlanReadCount: 1,
  sourceQualityGateRowCount: qualityGateRows.length,
  plannedNextBatchCandidateCount: batchPlanRows.length,
  mainLaneNextBatchCandidateCount,
  repairBacklogNextBatchCandidateCount,
  sportomediaProviderFamilyRepairNextBatchCandidateCount,
  wholeMapMainLaneResumedNextBatchPlanCount: 1,
  largeFullMapBatchPlanningContinuedCount: 1,
  oneOffLeagueDebuggingPlannedCount: 0,
  sportomediaBlocksWholeMapCount: 0,
  providerMicroProbingContinuedInMainLaneCount: 0,
  mayBuildPostResumptionFullMapNextBatchPlanQualityGateCount: 1,

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
  postResumptionFullMapNextBatchPlanTruthCount: 0,
  canonicalWrites: 0,
  productionWrite: false
};

const artifact = {
  job: "build-football-truth-post-resumption-full-map-next-batch-plan-file",
  date: DATE,
  generatedAt: new Date().toISOString(),
  mode: "no_write_no_fetch_no_search_planning_artifact",
  dryRun: true,
  inputs: {
    postResumptionFullMapNextActionPackQualityGate: inputPath
  },
  wholeMapResumptionPolicy: {
    doNotRestartFromRawUniverse: true,
    doNotReturnToGeneric660CalendarRun: true,
    doNotUseOneOrTwoLeagueDebuggingAsMainFlow: true,
    doNotTreatSportomediaAsWholeMapBlocker: true,
    continueFromQualityGatedNextActionPack: true,
    targetPlanningDirection: "large_full_map_batches"
  },
  summary,
  counts: {
    byLane: {
      main_lane: mainLaneNextBatchCandidateCount,
      repair_backlog: repairBacklogNextBatchCandidateCount
    },
    byBatchFamily: batchPlanRows.reduce((acc, row) => {
      acc[row.batchFamily] = (acc[row.batchFamily] || 0) + 1;
      return acc;
    }, {})
  },
  batchPlanRows,
  blockedRows: [],
  guardrails: [
    { name: "no_fetch", allowed: false, executed: false },
    { name: "no_search", allowed: false, executed: false },
    { name: "no_broad_search", allowed: false, executed: false },
    { name: "no_classifier", allowed: false, executed: false },
    { name: "no_canonical_write", allowed: false, executed: false },
    { name: "no_production_write", allowed: false, executed: false },
    { name: "no_truth_assertion", allowed: false, executed: false },
    { name: "planning_artifact_only", allowed: true, executed: true }
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
