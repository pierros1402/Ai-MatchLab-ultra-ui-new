import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const probePath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-controlled-probe-wave-next-execution-2026-06-16","whole-map-high-volume-controlled-probe-wave-next-execution-2026-06-16.json");
const manifestPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-lane-execution-manifest-2026-06-16","whole-map-high-volume-lane-execution-manifest-2026-06-16.json");
const outputPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-controlled-probe-result-board-next-execution-2026-06-16","whole-map-high-volume-controlled-probe-result-board-next-execution-2026-06-16.json");

function sha256Text(v){return crypto.createHash("sha256").update(v).digest("hex");}
function writeJson(p,v){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,`${JSON.stringify(v,null,2)}\n`,"utf8");}
function countBy(rows,key){return rows.reduce((a,r)=>{const v=String(r[key]??"unknown");a[v]=(a[v]??0)+1;return a;},{});}
function uniq(values){return [...new Set(values.filter(Boolean).map(String))];}
function clean(v){return String(v??"").replace(/\s+/g," ").trim();}
function check(checks,name,passed,details={}){checks.push({name,passed:Boolean(passed),...details});}

function decode(v){
  return String(v??"")
    .replace(/&quot;/g,'"')
    .replace(/&amp;/g,"&")
    .replace(/&lt;/g,"<")
    .replace(/&gt;/g,">")
    .replace(/&nbsp;/g," ")
    .replace(/\\u002F/g,"/")
    .replace(/\\u003C/g,"<")
    .replace(/\\u003E/g,">")
    .replace(/\\"/g,'"');
}

function stripTags(v){
  return decode(v)
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function parseHtmlRows(text){
  return [...String(text).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map(m=>[...m[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)].map(c=>stripTags(c[1])).filter(Boolean))
    .filter(cells=>cells.length>=3);
}

function parseIntLoose(v){
  const t=String(v??"").trim().replace(/^\+/,"");
  if(!/^-?\d+$/.test(t)) return null;
  const n=Number(t);
  return Number.isFinite(n) ? n : null;
}

function numericCount(cells){
  return cells.filter(c=>/(^|\s)[+-]?\d+(\s|$)/.test(String(c)) || /\d+\s*[-:]\s*\d+/.test(String(c))).length;
}

function looksStanding(cells){
  if(!Array.isArray(cells) || cells.length<4) return false;
  const joined=cells.join(" ");
  const hasPos=parseIntLoose(cells[0])!==null || /^\d+/.test(joined);
  const hasTeam=cells.some(c=>/[A-Za-zÀ-ÿ]/.test(String(c)) && String(c).trim().length>=2);
  return hasPos && hasTeam && numericCount(cells)>=3;
}

function markerCounts(text){
  const lower=decode(text).toLowerCase();
  const markers=["__next_data__","__nuxt__","apollo","graphql","standings","standing","table","ranking","rankings","tabelle","classement","klassement","ladder","teamname","clubname","displayname","position","rank","points","played","matches","wins","draws","losses","goals","season","competition","api"];
  return Object.fromEntries(markers.map(m=>[m,lower.split(m).length-1]));
}

function endpointHints(text){
  const decoded=decode(text);
  const urls=[...decoded.matchAll(/https?:\/\/[^"'\\\s<>)]+/gi)].map(m=>m[0]);
  const paths=[...decoded.matchAll(/["'`]((?:\/api\/|\/graphql|\/data\/|\/_next\/data\/|\/wp-json\/|\/ajax\/)[^"'`\\\s<>)]+)["'`]/gi)].map(m=>m[1]);
  return uniq([...urls,...paths].filter(v=>/api|graphql|data|stand|table|ranking|tabelle|classement|team|club|season|competition|fixture|standing/i.test(v))).slice(0,30);
}

function scriptContexts(text){
  const rows=[];
  const scripts=[...String(text).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  for(const [idx,m] of scripts.entries()){
    const body=decode(m[2]??"");
    const lower=body.toLowerCase();
    const terms=["standings","standing","table","ranking","tabelle","classement","klassement","ladder","team","club","points","position","rank","played","wins","draws","losses","goals","graphql","api","season","competition"];
    let score=0; const hits=[];
    for(const term of terms){
      const c=lower.split(term).length-1;
      if(c>0){score+=Math.min(c,12);hits.push({term,count:c});}
    }
    const hints=endpointHints(body);
    if(score>0 || hints.length>0) rows.push({scriptIndex:idx+1,attrs:clean(m[1]??""),length:body.length,score,hits,endpointHints:hints,first600:body.slice(0,600).replace(/\s+/g," ")});
  }
  return rows.sort((a,b)=>b.score-a.score || b.endpointHints.length-a.endpointHints.length).slice(0,8);
}

function classifyBestRow(row, manifestRow){
  let text="";
  if(row.outputFile && fs.existsSync(row.outputFile)) text=fs.readFileSync(row.outputFile,"utf8");
  const htmlRows=parseHtmlRows(text);
  const standingRows=htmlRows.filter(looksStanding);
  const markers=markerCounts(text);
  const scripts=scriptContexts(text);
  const hints=uniq([...(row.endpointHints??[]),...scripts.flatMap(s=>s.endpointHints)]);
  const expectedRows=Number(manifestRow?.expectedRows??row.expectedRows??0)||null;

  const jsonScore=(markers.standings??0)+(markers.standing??0)+(markers.table??0)+(markers.ranking??0)+(markers.tabelle??0)+(markers.teamname??0)+(markers.clubname??0)+(markers.points??0)+scripts.reduce((s,r)=>s+Math.min(r.score,20),0);
  const signalBest = row.bestProbeStatus==="accepted_probe_strong_signal_requires_parser_board" || row.bestProbeStatus==="review_probe_weak_signal";

  let laneKind="unresolved_route_repair_followup";
  let laneStatus="route_repair_followup_required";
  if(signalBest && expectedRows && standingRows.length===expectedRows){
    laneKind="probe_result_runner_ready";
    laneStatus="runner_ready_generic_html_table_exact_expected_rows";
  } else if(signalBest && expectedRows && standingRows.length>=Math.max(1,expectedRows-2) && standingRows.length<=expectedRows+8){
    laneKind="probe_result_runner_ready";
    laneStatus="runner_ready_html_table_near_expected_rows_needs_filter";
  } else if(signalBest && standingRows.length>=6){
    laneKind="probe_result_runner_ready";
    laneStatus="runner_ready_provider_specific_html_table_filter";
  } else if(signalBest && (jsonScore>=10 || scripts.length>=2 || hints.length>0)){
    laneKind="probe_result_runner_ready";
    laneStatus="runner_ready_embedded_json_or_endpoint_contract_parser";
  } else if(signalBest){
    laneKind="probe_result_review";
    laneStatus="weak_or_shell_signal_requires_manual_parser_review";
  }

  return {
    competitionSlug: row.competitionSlug,
    countryCode: row.countryCode,
    previousAction: manifestRow?.primaryAction ?? null,
    previousBand: manifestRow?.executionBand ?? null,
    laneType: row.laneType,
    bestProbeStatus: row.bestProbeStatus,
    httpStatus: row.httpStatus,
    score: row.score,
    title: row.title,
    probeUrl: row.probeUrl,
    finalUrl: row.finalUrl,
    outputFile: row.outputFile,
    expectedRows,
    htmlTableRowCount: htmlRows.length,
    standingLikeRowCount: standingRows.length,
    markerCounts: markers,
    scriptContextCount: scripts.length,
    endpointHintCount: hints.length,
    endpointHints: hints,
    topScriptContexts: scripts.slice(0,5),
    sampleStandingRows: standingRows.slice(0,5),
    laneKind,
    laneStatus,
    nextAllowedAction:{
      mayBuildProbeResultExtractor:
        laneKind==="probe_result_runner_ready",
      mayBuildProbeResultReview:
        laneKind==="probe_result_review",
      mayBuildRouteRepairFollowup:
        laneKind==="unresolved_route_repair_followup",
      mayWriteCanonicalNow:false,
      mayWriteProductionNow:false,
      mayAssertTruthNow:false
    }
  };
}

if(!fs.existsSync(probePath)) throw new Error(`Missing controlled probe wave output: ${probePath}`);
if(!fs.existsSync(manifestPath)) throw new Error(`Missing lane manifest: ${manifestPath}`);

const probeText=fs.readFileSync(probePath,"utf8");
const manifestText=fs.readFileSync(manifestPath,"utf8");
const probe=JSON.parse(probeText);
const manifest=JSON.parse(manifestText);

const bestRows=Array.isArray(probe.bestRows) ? probe.bestRows : [];
const manifestRows=Array.isArray(manifest.manifestRows) ? manifest.manifestRows : [];
const manifestBySlug=new Map(manifestRows.map(r=>[r.competitionSlug,r]));

const resultRows=bestRows.map(row=>classifyBestRow(row,manifestBySlug.get(row.competitionSlug)));
const runnerReadyRows=resultRows.filter(r=>r.nextAllowedAction.mayBuildProbeResultExtractor);
const reviewRows=resultRows.filter(r=>r.nextAllowedAction.mayBuildProbeResultReview);
const routeRepairRows=resultRows.filter(r=>r.nextAllowedAction.mayBuildRouteRepairFollowup);
const strongOrWeakRows=resultRows.filter(r=>r.bestProbeStatus==="accepted_probe_strong_signal_requires_parser_board" || r.bestProbeStatus==="review_probe_weak_signal");

const checks=[];
check(checks,"sourceProbeWavePassed", probe.summary?.status==="passed", {actual:probe.summary?.status});
check(checks,"sourceProbeWaveFetchedThreeSixty", Number(probe.summary?.fetchExecutedNowCount??0)===360, {actual:probe.summary?.fetchExecutedNowCount});
check(checks,"bestRowsFortyNine", bestRows.length===49, {actual:bestRows.length});
check(checks,"strongOrWeakBestRowsEight", strongOrWeakRows.length=== 8, {actual:strongOrWeakRows.length});
check(checks,"resultRowsFortyNine", resultRows.length===49, {actual:resultRows.length});
check(checks,"allRowsHaveFollowupLane", resultRows.every(r=>r.nextAllowedAction.mayBuildProbeResultExtractor||r.nextAllowedAction.mayBuildProbeResultReview||r.nextAllowedAction.mayBuildRouteRepairFollowup));
check(checks,"noFetchSearchWriteInThisJob", true);
check(checks,"productionAndTruthLocked", true);

const blockedCheckCount=checks.filter(c=>!c.passed).length;
const passedCheckCount=checks.filter(c=>c.passed).length;

const output={
  output:outputPath,
  job:"build-football-truth-whole-map-high-volume-controlled-probe-result-board-next-execution-file",
  generatedAtUtc:new Date().toISOString(),
  sourceProbeWavePath:probePath,
  sourceProbeWaveSha256:sha256Text(probeText),
  sourceManifestPath:manifestPath,
  sourceManifestSha256:sha256Text(manifestText),
  policy:{
    controlledProbeResultBoardOnly:true,
    noFetchInThisJob:true,
    noSearchInThisJob:true,
    noBroadSearchInThisJob:true,
    noCanonicalWriteInThisJob:true,
    noProductionWriteInThisJob:true,
    noTruthAssertionInThisJob:true
  },
  checks,
  resultRows,
  summary:{
    status:blockedCheckCount===0?"passed":"blocked",
    sourceProbeRowCount:probe.summary?.plannedProbeRowCount??null,
    sourceFetchExecutedNowCount:probe.summary?.fetchExecutedNowCount??null,
    bestCompetitionCount:bestRows.length,
    strongOrWeakBestCompetitionCount:strongOrWeakRows.length,
    resultRowsByLaneKind:countBy(resultRows,"laneKind"),
    resultRowsByLaneStatus:countBy(resultRows,"laneStatus"),
    runnerReadyCompetitionCount:runnerReadyRows.length,
    reviewCompetitionCount:reviewRows.length,
    routeRepairFollowupCompetitionCount:routeRepairRows.length,
    endpointHintReadyCompetitionCount:resultRows.filter(r=>r.endpointHintCount>0).length,
    mayBuildProbeResultExtractorCount:runnerReadyRows.length>0?1:0,
    mayBuildProbeResultReviewCount:reviewRows.length>0?1:0,
    mayBuildRouteRepairFollowupCount:routeRepairRows.length>0?1:0,
    mayBuildCanonicalCandidateNowCount:0,
    fetchExecutedNowCount:0,
    searchExecutedNowCount:0,
    broadSearchExecutedNowCount:0,
    canonicalWriteExecutedNowCount:0,
    productionWriteExecutedNowCount:0,
    truthAssertionExecutedNowCount:0,
    checkCount:checks.length,
    passedCheckCount,
    blockedCheckCount
  }
};

writeJson(outputPath,output);
console.log(JSON.stringify(output.summary,null,2));
if(blockedCheckCount!==0) process.exitCode=1;

