import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const inputPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-all-lanes-board-2026-06-16","whole-map-high-volume-all-lanes-board-2026-06-16.json");
const outputPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-lane-execution-manifest-2026-06-16","whole-map-high-volume-lane-execution-manifest-2026-06-16.json");

function sha256Text(v){return crypto.createHash("sha256").update(v).digest("hex");}
function writeJson(p,v){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,`${JSON.stringify(v,null,2)}\n`,"utf8");}
function countBy(rows,key){return rows.reduce((a,r)=>{const v=String(r[key]??"unknown");a[v]=(a[v]??0)+1;return a;},{});}
function unique(values){return [...new Set(values.filter(Boolean).map(String))];}
function check(checks,name,passed,details={}){checks.push({name,passed:Boolean(passed),...details});}

function primaryActionFor(row){
  if(row.laneKind==="quality_gate_and_stat_mapper" && row.laneStatus==="accepted_shape_quality_gate_ready_for_stat_mapper") return "build_bulk_stat_mapper_for_accepted_shape_rows";
  if(row.laneKind==="parser_review") return "build_parser_review_for_count_mismatch";
  if(row.laneKind==="parser_contract_context"){
    if(row.laneStatus==="route_contract_context_with_endpoint_hints_ready_for_controlled_probe_plan") return "build_controlled_endpoint_probe_plan";
    if(row.laneStatus==="route_contract_context_without_endpoint_ready_for_asset_or_js_probe_plan") return "build_asset_or_js_probe_plan";
    return "build_route_repair_or_js_probe_plan";
  }
  if(row.laneKind==="weak_route_review") return "build_weak_route_review_plan";
  if(row.laneKind==="route_repair") return "build_high_volume_route_repair_probe_plan";
  return "blocked_unknown_lane_requires_review";
}

function executionBandFor(action){
  const map = {
    build_bulk_stat_mapper_for_accepted_shape_rows: "band_01_stat_mapper_no_fetch",
    build_controlled_endpoint_probe_plan: "band_02_endpoint_probe_fetch_later",
    build_asset_or_js_probe_plan: "band_03_asset_or_js_probe_fetch_later",
    build_high_volume_route_repair_probe_plan: "band_04_route_repair_fetch_later",
    build_weak_route_review_plan: "band_05_weak_review_no_fetch",
    build_parser_review_for_count_mismatch: "band_06_parser_review_no_fetch",
    build_route_repair_or_js_probe_plan: "band_07_route_repair_or_js_probe_fetch_later"
  };
  return map[action] ?? "band_99_blocked";
}

if(!fs.existsSync(inputPath)) throw new Error(`Missing all-lanes board: ${inputPath}`);
const inputText = fs.readFileSync(inputPath,"utf8");
const input = JSON.parse(inputText);
const laneRows = Array.isArray(input.laneRows) ? input.laneRows : [];

const manifestRows = laneRows.map(row=>{
  const primaryAction = primaryActionFor(row);
  const executionBand = executionBandFor(primaryAction);
  return {
    competitionSlug: row.competitionSlug,
    countryCode: row.countryCode,
    providerSignalClass: row.providerSignalClass,
    laneKind: row.laneKind,
    laneStatus: row.laneStatus,
    parserLane: row.parserLane,
    parserConfidence: row.parserConfidence,
    sourceUrl: row.sourceUrl,
    finalUrl: row.finalUrl,
    httpStatus: row.httpStatus,
    bestResultStatus: row.bestResultStatus,
    expectedRows: row.expectedRows,
    extractedCandidateRowCount: row.extractedCandidateRowCount,
    endpointHintCount: row.contractContext?.endpointHintCount ?? row.endpointHintCount ?? 0,
    endpointHints: row.contractContext?.endpointHints ?? [],
    recoveredCoverageLane: row.recoveredCoverageLane ?? null,
    primaryAction,
    executionBand,
    canExecuteNow: false,
    reasonNotExecutedNow: "manifest_only_no_fetch_no_write_no_canonical",
    safety: {
      mayFetchNow: false,
      maySearchNow: false,
      mayBroadSearchNow: false,
      mayWriteCanonicalNow: false,
      mayWriteProductionNow: false,
      mayAssertTruthNow: false
    }
  };
});

const rowsByAction = countBy(manifestRows,"primaryAction");
const rowsByBand = countBy(manifestRows,"executionBand");
const band99Count = Number(rowsByBand.band_99_blocked ?? 0);

const checks = [];
check(checks,"sourceAllLanesBoardPassed", input.summary?.status==="passed", {actual: input.summary?.status});
check(checks,"sourceSelectedTargetsSeventyEight", Number(input.summary?.sourceSelectedTargetCount??-1)===78, {actual: input.summary?.sourceSelectedTargetCount});
check(checks,"manifestRowsFiftySix", manifestRows.length===56, {actual: manifestRows.length, expected: 56});
check(checks,"manifestCoversAllLaneRows", manifestRows.every(r=>r.primaryAction!=="blocked_unknown_lane_requires_review"));
check(checks,"band99Zero", band99Count===0, {actual: band99Count});
check(checks,"hasBulkStatMapperRows", Number(rowsByAction.build_bulk_stat_mapper_for_accepted_shape_rows??0)>=4, {actual: rowsByAction.build_bulk_stat_mapper_for_accepted_shape_rows??0});
check(checks,"hasEndpointProbeRows", Number(rowsByAction.build_controlled_endpoint_probe_plan??0)>=7, {actual: rowsByAction.build_controlled_endpoint_probe_plan??0});
check(checks,"hasRouteRepairOrJsRows", Number(rowsByAction.build_route_repair_or_js_probe_plan??0)>=1, {actual: rowsByAction.build_route_repair_or_js_probe_plan??0});
check(checks,"noFetchSearchWriteInThisJob", true);
check(checks,"productionAndTruthLocked", true);

const blockedCheckCount = checks.filter(c=>!c.passed).length;
const passedCheckCount = checks.filter(c=>c.passed).length;

const output = {
  output: outputPath,
  job: "build-football-truth-whole-map-high-volume-lane-execution-manifest-file",
  generatedAtUtc: new Date().toISOString(),
  sourceAllLanesBoardPath: inputPath,
  sourceAllLanesBoardSha256: sha256Text(inputText),
  policy: {
    highVolumeExecutionManifestOnly: true,
    coversAllBestRouteParserRows: true,
    noFetchInThisJob: true,
    noSearchInThisJob: true,
    noBroadSearchInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true,
    canonicalCandidateWriteRequiresExplicitUserApproval: true
  },
  checks,
  manifestRows,
  summary: {
    status: blockedCheckCount===0 ? "passed" : "blocked",
    sourceSelectedTargetCount: input.summary?.sourceSelectedTargetCount ?? null,
    sourceRouteCandidateCount: input.summary?.sourceRouteCandidateCount ?? null,
    sourceLaneCompetitionCount: laneRows.length,
    manifestCompetitionCount: manifestRows.length,
    manifestCountryCount: unique(manifestRows.map(r=>r.countryCode)).length,
    rowsByAction,
    rowsByBand,
    band99Count,
    mayBuildBulkStatMapperRunnerCount: Number(rowsByAction.build_bulk_stat_mapper_for_accepted_shape_rows??0)>0 ? 1 : 0,
    mayBuildControlledEndpointProbePlanCount: Number(rowsByAction.build_controlled_endpoint_probe_plan??0)>0 ? 1 : 0,
    mayBuildAssetOrJsProbePlanCount: Number(rowsByAction.build_asset_or_js_probe_plan??0)>0 ? 1 : 0,
    mayBuildHighVolumeRouteRepairProbePlanCount: Number(rowsByAction.build_high_volume_route_repair_probe_plan??0)>0 ? 1 : 0,
    mayBuildRouteRepairOrJsProbePlanCount: Number(rowsByAction.build_route_repair_or_js_probe_plan??0)>0 ? 1 : 0,
    mayBuildWeakRouteReviewPlanCount: Number(rowsByAction.build_weak_route_review_plan??0)>0 ? 1 : 0,
    mayBuildParserReviewPlanCount: Number(rowsByAction.build_parser_review_for_count_mismatch??0)>0 ? 1 : 0,
    mayBuildCanonicalCandidateNowCount: 0,
    fetchExecutedNowCount: 0,
    searchExecutedNowCount: 0,
    broadSearchExecutedNowCount: 0,
    canonicalWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    checkCount: checks.length,
    passedCheckCount,
    blockedCheckCount
  }
};

writeJson(outputPath, output);
console.log(JSON.stringify({
  output: output.output,
  status: output.summary.status,
  manifestCompetitionCount: output.summary.manifestCompetitionCount,
  manifestCountryCount: output.summary.manifestCountryCount,
  rowsByAction: output.summary.rowsByAction,
  rowsByBand: output.summary.rowsByBand,
  band99Count: output.summary.band99Count,
  mayBuildBulkStatMapperRunnerCount: output.summary.mayBuildBulkStatMapperRunnerCount,
  mayBuildControlledEndpointProbePlanCount: output.summary.mayBuildControlledEndpointProbePlanCount,
  mayBuildAssetOrJsProbePlanCount: output.summary.mayBuildAssetOrJsProbePlanCount,
  mayBuildHighVolumeRouteRepairProbePlanCount: output.summary.mayBuildHighVolumeRouteRepairProbePlanCount,
  mayBuildRouteRepairOrJsProbePlanCount: output.summary.mayBuildRouteRepairOrJsProbePlanCount,
  mayBuildWeakRouteReviewPlanCount: output.summary.mayBuildWeakRouteReviewPlanCount,
  mayBuildParserReviewPlanCount: output.summary.mayBuildParserReviewPlanCount,
  fetchExecutedNowCount: output.summary.fetchExecutedNowCount,
  searchExecutedNowCount: output.summary.searchExecutedNowCount,
  broadSearchExecutedNowCount: output.summary.broadSearchExecutedNowCount,
  canonicalWriteExecutedNowCount: output.summary.canonicalWriteExecutedNowCount,
  productionWriteExecutedNowCount: output.summary.productionWriteExecutedNowCount,
  truthAssertionExecutedNowCount: output.summary.truthAssertionExecutedNowCount,
  blockedCheckCount: output.summary.blockedCheckCount
}, null, 2));

if(blockedCheckCount!==0) process.exitCode=1;
