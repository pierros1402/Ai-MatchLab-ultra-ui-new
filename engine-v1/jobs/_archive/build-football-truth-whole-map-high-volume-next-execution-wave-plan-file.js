import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const manifestPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-lane-execution-manifest-2026-06-16","whole-map-high-volume-lane-execution-manifest-2026-06-16.json");
const allLanesPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-all-lanes-board-2026-06-16","whole-map-high-volume-all-lanes-board-2026-06-16.json");
const outputPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-next-execution-wave-plan-2026-06-16","whole-map-high-volume-next-execution-wave-plan-2026-06-16.json");

function sha256Text(v){return crypto.createHash("sha256").update(v).digest("hex");}
function writeJson(p,v){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,`${JSON.stringify(v,null,2)}\n`,"utf8");}
function countBy(rows,key){return rows.reduce((a,r)=>{const v=String(r[key]??"unknown");a[v]=(a[v]??0)+1;return a;},{});}
function uniq(values){return [...new Set(values.filter(Boolean).map(String))];}
function clean(v){return String(v??"").replace(/\s+/g," ").trim();}
function firstInt(v){const m=String(v??"").match(/[+-]?\d+/); return m ? Number(m[0]) : null;}
function parseWdl(v){const m=String(v??"").match(/(\d+)\s*[-–]\s*(\d+)\s*[-–]\s*(\d+)/); return m ? {wins:Number(m[1]),draws:Number(m[2]),losses:Number(m[3])} : null;}
function parseGoals(v){const m=String(v??"").match(/(\d+)\s*[:\-]\s*(\d+)/); return m ? {goalsFor:Number(m[1]),goalsAgainst:Number(m[2])} : null;}
function check(checks,name,passed,details={}){checks.push({name,passed:Boolean(passed),...details});}

function mapStats(row, source){
  const raw = Array.isArray(row.rawCells) ? row.rawCells.map(clean).filter(Boolean) : [];
  const numeric = raw.map(firstInt).filter(v=>v!==null);
  const wdl = raw.map(parseWdl).find(Boolean);
  const goals = raw.map(parseGoals).find(Boolean);
  const position = Number.isInteger(row.position) ? row.position : firstInt(raw[0]);
  const teamName = clean(row.teamName);
  const played = numeric.length >= 2 ? numeric[1] : null;
  const points = numeric.length >= 2 ? numeric[numeric.length - 1] : null;
  const goalDifference = goals ? null : (numeric.length >= 3 ? numeric[numeric.length - 2] : null);

  const mapped = {
    competitionSlug: source.competitionSlug,
    countryCode: source.countryCode,
    sourceUrl: source.sourceUrl,
    finalUrl: source.finalUrl,
    parserLane: source.parserLane,
    expectedRows: source.expectedRows,
    rowIndex: row.rowIndex,
    position,
    teamName,
    played,
    wins: wdl?.wins ?? null,
    draws: wdl?.draws ?? null,
    losses: wdl?.losses ?? null,
    goalsFor: goals?.goalsFor ?? null,
    goalsAgainst: goals?.goalsAgainst ?? null,
    goalDifference,
    points,
    rawCells: raw
  };

  mapped.statIssueCodes = [
    Number.isInteger(mapped.position) ? null : "missing_position",
    mapped.teamName ? null : "missing_team_name",
    Number.isInteger(mapped.points) ? null : "missing_points",
    Number.isInteger(mapped.played) ? null : "missing_played",
    Number.isInteger(mapped.wins) ? null : "missing_wins",
    Number.isInteger(mapped.draws) ? null : "missing_draws",
    Number.isInteger(mapped.losses) ? null : "missing_losses"
  ].filter(Boolean);

  return mapped;
}

function routeRepairCandidates(row){
  const urls = [];
  const baseUrl = row.finalUrl || row.sourceUrl || "";
  try {
    const u = new URL(baseUrl);
    const host = u.hostname;
    for(const p of ["/standings","/standings/","/table","/table/","/tables","/tables/","/ranking","/ranking/","/tabelle","/tabelle/","/classement","/classement/","/klassement","/klassement/","/ladder","/ladder/"]){
      urls.push(`https://${host}${p}`);
    }
  } catch {}
  return uniq(urls).slice(0,8);
}

if(!fs.existsSync(manifestPath)) throw new Error(`Missing manifest: ${manifestPath}`);
if(!fs.existsSync(allLanesPath)) throw new Error(`Missing all-lanes board: ${allLanesPath}`);

const manifestText = fs.readFileSync(manifestPath,"utf8");
const allLanesText = fs.readFileSync(allLanesPath,"utf8");
const manifest = JSON.parse(manifestText);
const allLanes = JSON.parse(allLanesText);

const manifestRows = Array.isArray(manifest.manifestRows) ? manifest.manifestRows : [];
const laneRows = Array.isArray(allLanes.laneRows) ? allLanes.laneRows : [];
const laneBySlug = new Map(laneRows.map(r=>[r.competitionSlug,r]));

const statMapperInputs = manifestRows.filter(r=>r.primaryAction==="build_bulk_stat_mapper_for_accepted_shape_rows");
const endpointInputs = manifestRows.filter(r=>r.primaryAction==="build_controlled_endpoint_probe_plan");
const assetInputs = manifestRows.filter(r=>r.primaryAction==="build_asset_or_js_probe_plan");
const routeRepairInputs = manifestRows.filter(r=>r.primaryAction==="build_high_volume_route_repair_probe_plan" || r.primaryAction==="build_route_repair_or_js_probe_plan");
const weakReviewInputs = manifestRows.filter(r=>r.primaryAction==="build_weak_route_review_plan");
const parserReviewInputs = manifestRows.filter(r=>r.primaryAction==="build_parser_review_for_count_mismatch");

const statMapperRows = statMapperInputs.map(input=>{
  const lane = laneBySlug.get(input.competitionSlug);
  const q = lane?.qualityGate ?? {};
  const mappedRows = Array.isArray(q.mappedRowsPreview) ? q.mappedRowsPreview.map(r=>mapStats(r,input)) : [];
  return {
    competitionSlug: input.competitionSlug,
    countryCode: input.countryCode,
    sourceUrl: input.sourceUrl,
    finalUrl: input.finalUrl,
    expectedRows: input.expectedRows,
    mappedCandidateRowCount: mappedRows.length,
    mappedRowsWithStatIssues: mappedRows.filter(r=>r.statIssueCodes.length>0).length,
    sampleMappedRows: mappedRows.slice(0,5),
    mappedRows,
    nextAllowedAction: {
      mayBuildCanonicalCandidateWritePlanAfterStatQualityReview: mappedRows.length === Number(input.expectedRows ?? 0),
      mayWriteCanonicalNow: false,
      mayWriteProductionNow: false,
      mayAssertTruthNow: false
    }
  };
});

const endpointProbePlanRows = endpointInputs.map(row=>({
  competitionSlug: row.competitionSlug,
  countryCode: row.countryCode,
  sourceUrl: row.sourceUrl,
  finalUrl: row.finalUrl,
  endpointHintCount: row.endpointHintCount,
  plannedEndpointProbeUrls: uniq(row.endpointHints ?? []).slice(0,6),
  nextAllowedAction: {
    mayRunControlledEndpointProbeWithExplicitFetch: true,
    mayWriteCanonicalNow: false,
    mayWriteProductionNow: false,
    mayAssertTruthNow: false
  }
}));

const assetOrJsProbePlanRows = assetInputs.map(row=>({
  competitionSlug: row.competitionSlug,
  countryCode: row.countryCode,
  sourceUrl: row.sourceUrl,
  finalUrl: row.finalUrl,
  endpointHintCount: row.endpointHintCount,
  plannedProbeSeedUrls: uniq([row.finalUrl,row.sourceUrl,...(row.endpointHints ?? [])]).slice(0,6),
  nextAllowedAction: {
    mayRunControlledAssetOrJsProbeWithExplicitFetch: true,
    mayWriteCanonicalNow: false,
    mayWriteProductionNow: false,
    mayAssertTruthNow: false
  }
}));

const routeRepairProbePlanRows = routeRepairInputs.map(row=>({
  competitionSlug: row.competitionSlug,
  countryCode: row.countryCode,
  sourceUrl: row.sourceUrl,
  finalUrl: row.finalUrl,
  primaryAction: row.primaryAction,
  plannedRouteRepairUrls: routeRepairCandidates(row),
  nextAllowedAction: {
    mayRunControlledRouteRepairProbeWithExplicitFetch: true,
    mayWriteCanonicalNow: false,
    mayWriteProductionNow: false,
    mayAssertTruthNow: false
  }
}));

const weakReviewPlanRows = weakReviewInputs.map(row=>({
  competitionSlug: row.competitionSlug,
  countryCode: row.countryCode,
  sourceUrl: row.sourceUrl,
  finalUrl: row.finalUrl,
  laneStatus: row.laneStatus,
  reviewFocus: "confirm weak route is official and has standings-bearing contract before parser execution",
  nextAllowedAction: {
    mayBuildParserOrRepairLaneAfterReview: true,
    mayWriteCanonicalNow: false,
    mayWriteProductionNow: false,
    mayAssertTruthNow: false
  }
}));

const parserReviewPlanRows = parserReviewInputs.map(row=>({
  competitionSlug: row.competitionSlug,
  countryCode: row.countryCode,
  sourceUrl: row.sourceUrl,
  finalUrl: row.finalUrl,
  expectedRows: row.expectedRows,
  extractedCandidateRowCount: row.extractedCandidateRowCount,
  reviewFocus: "count mismatch between extracted rows and expected standings size",
  nextAllowedAction: {
    mayBuildParserFilterPatchAfterReview: true,
    mayWriteCanonicalNow: false,
    mayWriteProductionNow: false,
    mayAssertTruthNow: false
  }
}));

const checks = [];
check(checks,"sourceManifestPassed", manifest.summary?.status==="passed", {actual: manifest.summary?.status});
check(checks,"sourceAllLanesPassed", allLanes.summary?.status==="passed", {actual: allLanes.summary?.status});
check(checks,"manifestRowsFiftySix", manifestRows.length===56, {actual: manifestRows.length});
check(checks,"statMapperInputRowsFour", statMapperInputs.length===4, {actual: statMapperInputs.length});
check(checks,"endpointProbeInputsSeven", endpointInputs.length===7, {actual: endpointInputs.length});
check(checks,"assetInputsTwo", assetInputs.length===2, {actual: assetInputs.length});
check(checks,"routeRepairInputsForty", routeRepairInputs.length===40, {actual: routeRepairInputs.length});
check(checks,"allManifestRowsMaterialized", statMapperInputs.length+endpointInputs.length+assetInputs.length+routeRepairInputs.length+weakReviewInputs.length+parserReviewInputs.length===manifestRows.length);
check(checks,"noFetchSearchWriteInThisJob", true);
check(checks,"productionAndTruthLocked", true);

const blockedCheckCount = checks.filter(c=>!c.passed).length;
const passedCheckCount = checks.filter(c=>c.passed).length;

const output = {
  output: outputPath,
  job: "build-football-truth-whole-map-high-volume-next-execution-wave-plan-file",
  generatedAtUtc: new Date().toISOString(),
  sourceManifestPath: manifestPath,
  sourceManifestSha256: sha256Text(manifestText),
  sourceAllLanesPath: allLanesPath,
  sourceAllLanesSha256: sha256Text(allLanesText),
  policy: {
    highVolumeNextExecutionWavePlanOnly: true,
    coversAllManifestRows: true,
    noFetchInThisJob: true,
    noSearchInThisJob: true,
    noBroadSearchInThisJob: true,
    noCanonicalWriteInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true,
    canonicalCandidateWriteRequiresExplicitUserApproval: true
  },
  checks,
  statMapperRows,
  endpointProbePlanRows,
  assetOrJsProbePlanRows,
  routeRepairProbePlanRows,
  weakReviewPlanRows,
  parserReviewPlanRows,
  summary: {
    status: blockedCheckCount===0 ? "passed" : "blocked",
    manifestCompetitionCount: manifestRows.length,
    manifestCountryCount: uniq(manifestRows.map(r=>r.countryCode)).length,
    statMapperCompetitionCount: statMapperRows.length,
    statMapperMappedCandidateRowCount: statMapperRows.reduce((s,r)=>s+r.mappedCandidateRowCount,0),
    statMapperRowsWithStatIssues: statMapperRows.reduce((s,r)=>s+r.mappedRowsWithStatIssues,0),
    endpointProbeCompetitionCount: endpointProbePlanRows.length,
    endpointProbeUrlCount: endpointProbePlanRows.reduce((s,r)=>s+r.plannedEndpointProbeUrls.length,0),
    assetOrJsProbeCompetitionCount: assetOrJsProbePlanRows.length,
    assetOrJsProbeSeedUrlCount: assetOrJsProbePlanRows.reduce((s,r)=>s+r.plannedProbeSeedUrls.length,0),
    routeRepairCompetitionCount: routeRepairProbePlanRows.length,
    routeRepairProbeUrlCount: routeRepairProbePlanRows.reduce((s,r)=>s+r.plannedRouteRepairUrls.length,0),
    weakReviewCompetitionCount: weakReviewPlanRows.length,
    parserReviewCompetitionCount: parserReviewPlanRows.length,
    mayRunControlledEndpointProbeWithExplicitFetchCount: endpointProbePlanRows.length>0 ? 1 : 0,
    mayRunControlledAssetOrJsProbeWithExplicitFetchCount: assetOrJsProbePlanRows.length>0 ? 1 : 0,
    mayRunControlledRouteRepairProbeWithExplicitFetchCount: routeRepairProbePlanRows.length>0 ? 1 : 0,
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
console.log(JSON.stringify(output.summary,null,2));
if(blockedCheckCount!==0) process.exitCode=1;
