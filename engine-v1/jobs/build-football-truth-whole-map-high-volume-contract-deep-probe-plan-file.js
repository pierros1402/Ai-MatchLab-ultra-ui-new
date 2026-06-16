import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const initialExtractorPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-runner-ready-extractor-2026-06-16","whole-map-high-volume-runner-ready-extractor-2026-06-16.json");
const allLanesPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-all-lanes-board-2026-06-16","whole-map-high-volume-all-lanes-board-2026-06-16.json");
const probeResultExtractorPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-probe-result-extractor-2026-06-16","whole-map-high-volume-probe-result-extractor-2026-06-16.json");
const probeResultBoardPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-controlled-probe-result-board-2026-06-16","whole-map-high-volume-controlled-probe-result-board-2026-06-16.json");

const outputPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-contract-deep-probe-plan-2026-06-16","whole-map-high-volume-contract-deep-probe-plan-2026-06-16.json");

function sha256Text(v){return crypto.createHash("sha256").update(v).digest("hex");}
function writeJson(p,v){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,`${JSON.stringify(v,null,2)}\n`,"utf8");}
function uniq(values){return [...new Set(values.filter(Boolean).map(String))];}
function countBy(rows,key){return rows.reduce((a,r)=>{const v=String(r[key]??"unknown");a[v]=(a[v]??0)+1;return a;},{});}
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
    .replace(/\\u0026/g,"&")
    .replace(/\\"/g,'"');
}

function safeUrl(value, base){
  try { return new URL(value, base).toString(); } catch { return null; }
}

function endpointHints(text){
  const decoded=decode(text);
  const urls=[...decoded.matchAll(/https?:\/\/[^"'\\\s<>)]+/gi)].map(m=>m[0]);
  const paths=[...decoded.matchAll(/["'`]((?:\/api\/|\/graphql|\/data\/|\/_next\/data\/|\/wp-json\/|\/ajax\/)[^"'`\\\s<>)]+)["'`]/gi)].map(m=>m[1]);
  return uniq([...urls,...paths].filter(v=>/api|graphql|data|stand|table|ranking|tabelle|classement|team|club|season|competition|fixture|standing/i.test(v))).slice(0,40);
}

function scriptSrcs(text, base){
  const decoded=decode(text);
  const srcs=[...decoded.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map(m=>safeUrl(m[1],base)).filter(Boolean);
  return uniq(srcs.filter(v=>/\.js($|\?)|\/_next\/static\/|\/static\/|\/assets\/|\/build\/|chunk|main|app|runtime/i.test(v))).slice(0,30);
}

function cssOrAssetHints(text, base){
  const decoded=decode(text);
  const hrefs=[...decoded.matchAll(/<(?:link|source)\b[^>]*(?:href|src)=["']([^"']+)["'][^>]*>/gi)].map(m=>safeUrl(m[1],base)).filter(Boolean);
  return uniq(hrefs.filter(v=>/\.js($|\?)|\.json($|\?)|\/_next\/data\/|\/assets\/|\/static\/|stand|table|ranking|competition|season/i.test(v))).slice(0,20);
}

function generatedRouteSeeds(row){
  const base = row.finalUrl || row.sourceUrl || "";
  let host = null;
  try { host = new URL(base).origin; } catch {}
  if(!host) return [];
  return [
    "/api/standings",
    "/api/table",
    "/api/ranking",
    "/api/competition/standings",
    "/api/competitions/standings",
    "/graphql",
    "/wp-json/wp/v2/search?search=standings",
    "/_next/data/build-id/index.json"
  ].map(p=>safeUrl(p,host)).filter(Boolean);
}

function scoreUrl(url){
  const lower=String(url).toLowerCase();
  let score=0;
  for(const term of ["stand","standing","standings","table","ranking","tabelle","classement","klassement","team","club","points","season","competition","graphql","api","data","fixture"]){
    if(lower.includes(term)) score+=3;
  }
  if(lower.includes(".json")) score+=4;
  if(lower.includes("graphql")) score+=6;
  if(lower.includes("api")) score+=5;
  if(lower.includes("_next/data")) score+=5;
  if(lower.includes(".js")) score+=2;
  return score;
}

function readJsonFile(p){
  const text=fs.readFileSync(p,"utf8");
  return {text,json:JSON.parse(text),sha:sha256Text(text)};
}

function contextForLane(row, extraHints=[]){
  let responseText="";
  if(row.outputFile && fs.existsSync(row.outputFile)) responseText=fs.readFileSync(row.outputFile,"utf8");

  const base=row.finalUrl||row.sourceUrl||row.probeUrl||"";
  const directHints=endpointHints(responseText);
  const scripts=scriptSrcs(responseText,base);
  const assets=cssOrAssetHints(responseText,base);
  const generated=generatedRouteSeeds(row);

  const candidates=[
    ...extraHints.map(url=>({probeUrl:url,probeType:"carried_endpoint_hint",score:scoreUrl(url)+20})),
    ...directHints.map(url=>({probeUrl:safeUrl(url,base),probeType:"mined_endpoint_hint",score:scoreUrl(url)+15})),
    ...scripts.map(url=>({probeUrl:url,probeType:"script_asset_src",score:scoreUrl(url)+8})),
    ...assets.map(url=>({probeUrl:url,probeType:"asset_or_data_hint",score:scoreUrl(url)+5})),
    ...generated.map(url=>({probeUrl:url,probeType:"generated_controlled_seed",score:scoreUrl(url)}))
  ].filter(r=>r.probeUrl);

  const deduped=[];
  const seen=new Set();
  for(const c of candidates.sort((a,b)=>b.score-a.score)){
    if(seen.has(c.probeUrl)) continue;
    seen.add(c.probeUrl);
    deduped.push(c);
  }

  return {
    responseBytes: responseText.length,
    minedEndpointHintCount: directHints.length,
    scriptSrcCount: scripts.length,
    assetHintCount: assets.length,
    generatedSeedCount: generated.length,
    plannedCandidateProbeCount: deduped.slice(0,20).length,
    plannedCandidateProbes: deduped.slice(0,20)
  };
}

for(const p of [initialExtractorPath, allLanesPath, probeResultExtractorPath, probeResultBoardPath]){
  if(!fs.existsSync(p)) throw new Error(`Missing required input: ${p}`);
}

const initialExtractor = readJsonFile(initialExtractorPath);
const allLanes = readJsonFile(allLanesPath);
const probeResultExtractor = readJsonFile(probeResultExtractorPath);
const probeResultBoard = readJsonFile(probeResultBoardPath);

const allLaneBySlug = new Map((allLanes.json.laneRows ?? []).map(r=>[r.competitionSlug,r]));
const probeBoardBySlug = new Map((probeResultBoard.json.resultRows ?? []).map(r=>[r.competitionSlug,r]));

const initialContractRows = (initialExtractor.json.extractionRows ?? [])
  .filter(r=>r.extractionStatus==="no_candidate_rows_extracted_requires_parser_contract_probe")
  .map(r=>{
    const lane=allLaneBySlug.get(r.competitionSlug);
    const extraHints=lane?.contractContext?.endpointHints ?? [];
    const ctx=contextForLane({...r,sourceUrl:r.sourceUrl,finalUrl:r.finalUrl,outputFile:r.outputFile},extraHints);
    return {
      sourceGroup:"initial_runner_ready_contract_probe",
      competitionSlug:r.competitionSlug,
      countryCode:r.countryCode,
      parserLane:r.parserLane,
      sourceUrl:r.sourceUrl,
      finalUrl:r.finalUrl,
      outputFile:r.outputFile,
      extractionStatus:r.extractionStatus,
      expectedRows:r.expectedRows,
      carriedEndpointHintCount:extraHints.length,
      ...ctx,
      nextAllowedAction:{
        mayRunControlledContractDeepProbeWithExplicitFetch:ctx.plannedCandidateProbeCount>0,
        mayWriteCanonicalNow:false,
        mayWriteProductionNow:false,
        mayAssertTruthNow:false
      }
    };
  });

const probeResultContractRows = (probeResultExtractor.json.extractionRows ?? [])
  .filter(r=>r.extractionStatus==="no_candidate_rows_extracted_requires_parser_contract_probe")
  .map(r=>{
    const board=probeBoardBySlug.get(r.competitionSlug);
    const extraHints=board?.endpointHints ?? [];
    const ctx=contextForLane({...r,sourceUrl:r.probeUrl,finalUrl:r.finalUrl,outputFile:r.outputFile,probeUrl:r.probeUrl},extraHints);
    return {
      sourceGroup:"controlled_probe_result_contract_probe",
      competitionSlug:r.competitionSlug,
      countryCode:r.countryCode,
      parserLane:r.laneStatus,
      sourceUrl:r.probeUrl,
      finalUrl:r.finalUrl,
      outputFile:r.outputFile,
      extractionStatus:r.extractionStatus,
      expectedRows:r.expectedRows,
      carriedEndpointHintCount:extraHints.length,
      ...ctx,
      nextAllowedAction:{
        mayRunControlledContractDeepProbeWithExplicitFetch:ctx.plannedCandidateProbeCount>0,
        mayWriteCanonicalNow:false,
        mayWriteProductionNow:false,
        mayAssertTruthNow:false
      }
    };
  });

const contractLaneRows=[...initialContractRows,...probeResultContractRows];

const deepProbeRows=[];
for(const row of contractLaneRows){
  for(const [index,c] of row.plannedCandidateProbes.entries()){
    deepProbeRows.push({
      contractLaneId:`${row.sourceGroup}:${row.competitionSlug}`,
      competitionSlug:row.competitionSlug,
      countryCode:row.countryCode,
      sourceGroup:row.sourceGroup,
      probePriority:index+1,
      probeType:c.probeType,
      probeUrl:c.probeUrl,
      score:c.score,
      sourceUrl:row.sourceUrl,
      finalUrl:row.finalUrl
    });
  }
}

const checks=[];
check(checks,"sourceInitialExtractorPassed",initialExtractor.json.summary?.status==="passed",{actual:initialExtractor.json.summary?.status});
check(checks,"sourceProbeResultExtractorPassed",probeResultExtractor.json.summary?.status==="passed",{actual:probeResultExtractor.json.summary?.status});
check(checks,"initialContractRowsFifteen",initialContractRows.length===15,{actual:initialContractRows.length});
check(checks,"probeResultContractRowsEight",probeResultContractRows.length===8,{actual:probeResultContractRows.length});
check(checks,"contractLaneRowsTwentyThree",contractLaneRows.length===23,{actual:contractLaneRows.length});
check(checks,"deepProbeRowsAtLeastFifty",deepProbeRows.length>=50,{actual:deepProbeRows.length});
check(checks,"noFetchSearchWriteInThisJob",true);
check(checks,"productionAndTruthLocked",true);

const blockedCheckCount=checks.filter(c=>!c.passed).length;
const passedCheckCount=checks.filter(c=>c.passed).length;

const output={
  output:outputPath,
  job:"build-football-truth-whole-map-high-volume-contract-deep-probe-plan-file",
  generatedAtUtc:new Date().toISOString(),
  sourceInitialExtractorPath:initialExtractorPath,
  sourceInitialExtractorSha256:initialExtractor.sha,
  sourceAllLanesPath:allLanesPath,
  sourceAllLanesSha256:allLanes.sha,
  sourceProbeResultExtractorPath:probeResultExtractorPath,
  sourceProbeResultExtractorSha256:probeResultExtractor.sha,
  sourceProbeResultBoardPath:probeResultBoardPath,
  sourceProbeResultBoardSha256:probeResultBoard.sha,
  policy:{
    contractDeepProbePlanOnly:true,
    noFetchInThisJob:true,
    noSearchInThisJob:true,
    noBroadSearchInThisJob:true,
    noCanonicalWriteInThisJob:true,
    noProductionWriteInThisJob:true,
    noTruthAssertionInThisJob:true
  },
  checks,
  contractLaneRows,
  deepProbeRows,
  summary:{
    status:blockedCheckCount===0?"passed":"blocked",
    contractLaneRowCount:contractLaneRows.length,
    uniqueContractCompetitionCount:uniq(contractLaneRows.map(r=>r.competitionSlug)).length,
    contractLaneRowsBySourceGroup:countBy(contractLaneRows,"sourceGroup"),
    deepProbeRowCount:deepProbeRows.length,
    deepProbeRowsByType:countBy(deepProbeRows,"probeType"),
    competitionCountWithProbeCandidates:uniq(deepProbeRows.map(r=>r.competitionSlug)).length,
    mayRunControlledContractDeepProbeWithExplicitFetchCount:deepProbeRows.length>0?1:0,
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
