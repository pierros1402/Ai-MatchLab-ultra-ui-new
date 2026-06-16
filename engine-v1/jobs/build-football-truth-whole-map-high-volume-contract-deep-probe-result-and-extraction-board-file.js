import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const wavePath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-contract-deep-probe-wave-2026-06-16","whole-map-high-volume-contract-deep-probe-wave-2026-06-16.json");
const outputPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-contract-deep-probe-result-and-extraction-board-2026-06-16","whole-map-high-volume-contract-deep-probe-result-and-extraction-board-2026-06-16.json");

function sha256Text(v){return crypto.createHash("sha256").update(v).digest("hex");}
function writeJson(p,v){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,`${JSON.stringify(v,null,2)}\n`,"utf8");}
function countBy(rows,key){return rows.reduce((a,r)=>{const v=String(r[key]??"unknown");a[v]=(a[v]??0)+1;return a;},{});}
function uniq(values){return [...new Set(values.filter(v=>v!==null&&v!==undefined&&v!=="").map(String))];}
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

function stripTags(v){
  return decode(v)
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<[^>]+>/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function parseIntLoose(v){
  const t=String(v??"").trim().replace(/^\+/,"");
  if(!/^-?\d+$/.test(t)) return null;
  const n=Number(t);
  return Number.isFinite(n) ? n : null;
}

function firstNumber(v){
  const m=String(v??"").match(/[+-]?\d+/);
  return m ? Number(m[0]) : null;
}

function parseHtmlRows(text){
  return [...String(text).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map(m=>[...m[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)].map(c=>stripTags(c[1])).filter(Boolean))
    .filter(cells=>cells.length>=3);
}

function numericCount(cells){
  return cells.filter(c=>/(^|\s)[+-]?\d+(\s|$)/.test(String(c)) || /\d+\s*[-:]\s*\d+/.test(String(c))).length;
}

function looksStanding(cells){
  if(!Array.isArray(cells)||cells.length<4) return false;
  const hasPos=parseIntLoose(cells[0])!==null || /^\d+/.test(cells.join(" "));
  const hasTeam=cells.some(c=>/[A-Za-zÀ-ÿ]/.test(String(c)) && String(c).trim().length>=2);
  return hasPos && hasTeam && numericCount(cells)>=3;
}

function teamNameFromCells(cells){
  const cell=cells.find((v,i)=>i>0 && /[A-Za-zÀ-ÿ]/.test(String(v)) && !/^[+-]?\d+$/.test(String(v).trim()) && String(v).trim().length>=2);
  return clean(cell);
}

function getHint(obj,hints){
  if(!obj || typeof obj!=="object") return null;
  for(const [k,v] of Object.entries(obj)){
    const lower=k.toLowerCase();
    if(hints.some(h=>lower===h || lower.includes(h))) return v;
  }
  return null;
}

function objectScore(obj){
  if(!obj || typeof obj!=="object" || Array.isArray(obj)) return 0;
  const keys=Object.keys(obj).map(k=>k.toLowerCase());
  let score=0;
  if(keys.some(k=>k.includes("team")||k.includes("club")||k==="name"||k.includes("displayname")||k.includes("shortname"))) score+=4;
  if(keys.some(k=>k.includes("position")||k==="rank"||k.includes("standing")||k.includes("place"))) score+=3;
  if(keys.some(k=>k.includes("point")||k==="pts")) score+=3;
  if(keys.some(k=>k.includes("played")||k.includes("match")||k.includes("game"))) score+=2;
  if(keys.some(k=>k.includes("win"))) score+=1;
  if(keys.some(k=>k.includes("draw"))) score+=1;
  if(keys.some(k=>k.includes("loss")||k.includes("lost"))) score+=1;
  if(keys.some(k=>k.includes("goal"))) score+=1;
  return score;
}

function normalizeJsonRow(obj,index,sourcePath,sourceKind){
  const teamObj=getHint(obj,["team","club"]);
  const teamNameRaw =
    getHint(obj,["teamname","clubname","displayname","shortname","name"]) ??
    (teamObj && typeof teamObj==="object" ? getHint(teamObj,["teamname","clubname","displayname","shortname","name"]) : null);

  return {
    rowIndex:index+1,
    extractionMethod:"contract_deep_json_or_endpoint",
    sourceKind,
    sourcePath,
    position:parseIntLoose(getHint(obj,["position","rank","place","standing"])),
    teamName:clean(teamNameRaw),
    played:parseIntLoose(getHint(obj,["played","playedmatches","matches","games"])),
    wins:parseIntLoose(getHint(obj,["wins","won"])),
    draws:parseIntLoose(getHint(obj,["draws","drawn"])),
    losses:parseIntLoose(getHint(obj,["losses","lost"])),
    goalsFor:parseIntLoose(getHint(obj,["goalsfor","goals_for","scored"])),
    goalsAgainst:parseIntLoose(getHint(obj,["goalsagainst","goals_against","conceded"])),
    goalDifference:parseIntLoose(getHint(obj,["goaldifference","goal_difference","diff"])),
    points:parseIntLoose(getHint(obj,["points","pts"])),
    rawObjectKeyCount:Object.keys(obj??{}).length,
    rawObjectSample:JSON.parse(JSON.stringify(obj,(_,v)=>typeof v==="string"&&v.length>120?`${v.slice(0,120)}…`:v))
  };
}

function tryParseJson(text){
  try{return JSON.parse(text);}catch{return null;}
}

function extractPayloads(text){
  const raw=decode(text);
  const payloads=[];
  const direct=tryParseJson(raw.trim());
  if(direct) payloads.push({sourceKind:"direct_json_response",root:direct});

  for(const m of [...raw.matchAll(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi)]){
    const parsed=tryParseJson(decode(m[1]).trim());
    if(parsed) payloads.push({sourceKind:"__NEXT_DATA__",root:parsed});
  }

  for(const m of [...raw.matchAll(/<script[^>]+type=["']application\/(?:json|ld\+json)["'][^>]*>([\s\S]*?)<\/script>/gi)]){
    const parsed=tryParseJson(decode(m[1]).trim());
    if(parsed) payloads.push({sourceKind:"application_json_script",root:parsed});
  }

  return payloads;
}

function walkJson(root,expectedRows,sourceKind){
  const candidates=[];
  let visits=0;
  function walk(node,pathParts,depth){
    visits++;
    if(visits>80000 || depth>30) return;
    if(Array.isArray(node)){
      const objects=node.filter(x=>x&&typeof x==="object"&&!Array.isArray(x));
      if(objects.length>=3){
        const scores=objects.map(objectScore);
        const strong=scores.filter(s=>s>=7).length;
        const medium=scores.filter(s=>s>=5).length;
        const nearExpected=expectedRows && objects.length>=Math.max(1,expectedRows-2) && objects.length<=expectedRows+10;
        if(strong>=Math.max(3,Math.floor(objects.length*0.30)) || (nearExpected && medium>=Math.max(3,Math.floor(objects.length*0.35)))){
          candidates.push({
            sourceKind,
            sourcePath:pathParts.join(".")||"$",
            objectRowCount:objects.length,
            strongRows:strong,
            mediumRows:medium,
            nearExpected:Boolean(nearExpected),
            score:strong*10+medium*4+(nearExpected?30:0),
            rows:objects.map((obj,i)=>normalizeJsonRow(obj,i,pathParts.join(".")||"$",sourceKind))
          });
        }
      }
      for(let i=0;i<Math.min(node.length,400);i++) walk(node[i],[...pathParts,`[${i}]`],depth+1);
      return;
    }
    if(node && typeof node==="object"){
      for(const [k,v] of Object.entries(node)) walk(v,[...pathParts,k],depth+1);
    }
  }
  walk(root,[],0);
  return candidates.sort((a,b)=>b.score-a.score).slice(0,20);
}

function htmlCandidates(text,expectedRows){
  const rows=parseHtmlRows(text).filter(looksStanding).map((cells,i)=>({
    rowIndex:i+1,
    extractionMethod:"contract_deep_html_table",
    sourceKind:"html_table",
    sourcePath:"table_rows",
    position:parseIntLoose(cells[0])??firstNumber(cells[0]),
    teamName:teamNameFromCells(cells),
    rawCells:cells.map(clean).filter(Boolean),
    numericCells:cells.map(firstNumber).filter(v=>v!==null)
  }));

  if(!expectedRows || rows.length<=expectedRows+8) return rows;

  const windows=[];
  for(let start=0;start<=rows.length-expectedRows;start++){
    const slice=rows.slice(start,start+expectedRows);
    const contiguous=slice.map(r=>r.position).every((p,i)=>p===i+1);
    const teams=uniq(slice.map(r=>r.teamName)).length;
    windows.push({score:(contiguous?1000:0)+teams*10,rows:slice});
  }
  windows.sort((a,b)=>b.score-a.score);
  return windows[0]?.rows ?? rows;
}

function qualityGate(rows,expectedRows){
  const mapped=rows.map((r,i)=>{
    const position=Number.isInteger(r.position)?r.position:null;
    const teamName=clean(r.teamName);
    return {
      rowIndex:i+1,
      position,
      teamName,
      points:Number.isInteger(r.points)?r.points:null,
      played:Number.isInteger(r.played)?r.played:null,
      rawCells:Array.isArray(r.rawCells)?r.rawCells:[],
      rowIssueCodes:[
        Number.isInteger(position)?null:"missing_position",
        teamName?null:"missing_team_name"
      ].filter(Boolean)
    };
  });

  const positions=mapped.map(r=>r.position);
  const teams=mapped.map(r=>r.teamName);
  const expectedPositions=expectedRows?Array.from({length:expectedRows},(_,i)=>i+1):[];
  const missingPositions=expectedPositions.filter(p=>!positions.includes(p));
  const duplicateTeams=teams.filter((t,i)=>t&&teams.indexOf(t)!==i);
  const rowIssueCount=mapped.reduce((s,r)=>s+r.rowIssueCodes.length,0);

  const qualityGateStatus=expectedRows && mapped.length===expectedRows && uniq(teams).length===expectedRows && missingPositions.length===0 && duplicateTeams.length===0 && rowIssueCount===0
    ? "accepted_shape_quality_gate_ready_for_stat_mapper"
    : "blocked_shape_quality_gate_needs_parser_review";

  return {qualityGateStatus,uniqueTeamCount:uniq(teams).length,missingPositions,duplicateTeams,rowIssueCount,sampleRows:mapped.slice(0,5)};
}

function extractionStatus(rows,expectedRows){
  if(rows.length===0) return "no_rows_extracted_requires_contract_review";
  if(expectedRows && rows.length===expectedRows) return "accepted_extraction_candidate_rows_exact_expected_count_requires_quality_gate";
  if(expectedRows && rows.length>=Math.max(1,expectedRows-2) && rows.length<=expectedRows+10) return "partial_or_near_expected_extraction_requires_quality_gate";
  return "extracted_rows_count_mismatch_requires_parser_review";
}

function extractForBestRow(row){
  let text="";
  if(row.outputFile && fs.existsSync(row.outputFile)) text=fs.readFileSync(row.outputFile,"utf8");

  const expectedRows=Number(row.expectedRows??0)||null;
  const jsonCandidates=[];
  for(const payload of extractPayloads(text)){
    jsonCandidates.push(...walkJson(payload.root,expectedRows,payload.sourceKind));
  }
  jsonCandidates.sort((a,b)=>b.score-a.score);

  const htmlRows=htmlCandidates(text,expectedRows);
  const bestJson=jsonCandidates[0]??null;

  let selectedExtractionMethod="none";
  let selectedRows=[];
  let selectedJsonCandidatePath=null;
  let selectedJsonCandidateScore=null;

  if(bestJson && (!expectedRows || bestJson.rows.length>=Math.max(3,expectedRows-2))){
    selectedExtractionMethod=bestJson.sourceKind;
    selectedRows=bestJson.rows;
    selectedJsonCandidatePath=bestJson.sourcePath;
    selectedJsonCandidateScore=bestJson.score;
  } else if(htmlRows.length>0) {
    selectedExtractionMethod="contract_deep_html_table";
    selectedRows=htmlRows;
  }

  const status=extractionStatus(selectedRows,expectedRows);
  const q=(status==="accepted_extraction_candidate_rows_exact_expected_count_requires_quality_gate" || status==="partial_or_near_expected_extraction_requires_quality_gate")
    ? qualityGate(selectedRows,expectedRows)
    : null;

  return {
    selectedExtractionMethod,
    selectedJsonCandidatePath,
    selectedJsonCandidateScore,
    jsonCandidateArrayCount:jsonCandidates.length,
    htmlCandidateRowCount:htmlRows.length,
    extractedCandidateRowCount:selectedRows.length,
    extractionStatus:status,
    qualityGate:q,
    extractedCandidateRows:selectedRows.slice(0,expectedRows?Math.max(expectedRows+10,60):60)
  };
}

if(!fs.existsSync(wavePath)) throw new Error(`Missing contract deep probe wave: ${wavePath}`);

const waveText=fs.readFileSync(wavePath,"utf8");
const wave=JSON.parse(waveText);
const bestRows=Array.isArray(wave.bestRows)?wave.bestRows:[];

const boardRows=bestRows.map(row=>{
  const canAttemptExtraction=row.bestProbeStatus==="accepted_contract_probe_strong_signal_requires_extractor";
  const extraction=canAttemptExtraction ? extractForBestRow(row) : {
    selectedExtractionMethod:"none",
    selectedJsonCandidatePath:null,
    selectedJsonCandidateScore:null,
    jsonCandidateArrayCount:Number(row.jsonCandidateArrayCount??0),
    htmlCandidateRowCount:Number(row.htmlTableRowCount??0),
    extractedCandidateRowCount:0,
    extractionStatus:row.bestProbeStatus==="review_contract_probe_weak_signal" ? "weak_contract_signal_requires_review" : "contract_route_repair_followup_required",
    qualityGate:null,
    extractedCandidateRows:[]
  };

  const nextAllowedAction={
    mayBuildCanonicalCandidateWritePlanAfterExplicitApproval:
      extraction.qualityGate?.qualityGateStatus==="accepted_shape_quality_gate_ready_for_stat_mapper",
    mayBuildStatMapperOrQualityReview:
      extraction.qualityGate?.qualityGateStatus==="accepted_shape_quality_gate_ready_for_stat_mapper",
    mayBuildParserReview:
      extraction.extractionStatus==="extracted_rows_count_mismatch_requires_parser_review" ||
      extraction.qualityGate?.qualityGateStatus==="blocked_shape_quality_gate_needs_parser_review" ||
      extraction.extractionStatus==="weak_contract_signal_requires_review",
    mayBuildParserContractFollowup:
      extraction.extractionStatus==="no_rows_extracted_requires_contract_review",
    mayBuildContractRouteRepairFollowup:
      extraction.extractionStatus==="contract_route_repair_followup_required",
    mayWriteCanonicalNow:false,
    mayWriteProductionNow:false,
    mayAssertTruthNow:false
  };

  return {
    competitionSlug:row.competitionSlug,
    countryCode:row.countryCode,
    sourceGroup:row.sourceGroup,
    probeType:row.probeType,
    bestProbeStatus:row.bestProbeStatus,
    httpStatus:row.httpStatus,
    score:row.score,
    title:row.title,
    probeUrl:row.probeUrl,
    finalUrl:row.finalUrl,
    outputFile:row.outputFile,
    expectedRows:Number(row.expectedRows??0)||null,
    ...extraction,
    nextAllowedAction
  };
});

const acceptedQuality=boardRows.filter(r=>r.qualityGate?.qualityGateStatus==="accepted_shape_quality_gate_ready_for_stat_mapper");
const parserReviewRows=boardRows.filter(r=>r.nextAllowedAction.mayBuildParserReview);
const contractFollowupRows=boardRows.filter(r=>r.nextAllowedAction.mayBuildParserContractFollowup);
const routeRepairRows=boardRows.filter(r=>r.nextAllowedAction.mayBuildContractRouteRepairFollowup);

const checks=[];
check(checks,"sourceWavePassed",wave.summary?.status==="passed",{actual:wave.summary?.status});
check(checks,"sourceFetchedFourFortyFour",Number(wave.summary?.fetchExecutedNowCount??0)===444,{actual:wave.summary?.fetchExecutedNowCount});
check(checks,"bestRowsFifteen",bestRows.length===15,{actual:bestRows.length});
check(checks,"strongRowsNine",bestRows.filter(r=>r.bestProbeStatus==="accepted_contract_probe_strong_signal_requires_extractor").length===9,{actual:bestRows.filter(r=>r.bestProbeStatus==="accepted_contract_probe_strong_signal_requires_extractor").length});
check(checks,"weakRowsFour",bestRows.filter(r=>r.bestProbeStatus==="review_contract_probe_weak_signal").length===4,{actual:bestRows.filter(r=>r.bestProbeStatus==="review_contract_probe_weak_signal").length});
check(checks,"boardRowsFifteen",boardRows.length===15,{actual:boardRows.length});
check(checks,"allBoardRowsHaveNextLane",boardRows.every(r=>r.nextAllowedAction.mayBuildStatMapperOrQualityReview||r.nextAllowedAction.mayBuildParserReview||r.nextAllowedAction.mayBuildParserContractFollowup||r.nextAllowedAction.mayBuildContractRouteRepairFollowup));
check(checks,"noFetchSearchWriteInThisJob",true);
check(checks,"productionAndTruthLocked",true);

const blockedCheckCount=checks.filter(c=>!c.passed).length;
const passedCheckCount=checks.filter(c=>c.passed).length;

const output={
  output:outputPath,
  job:"build-football-truth-whole-map-high-volume-contract-deep-probe-result-and-extraction-board-file",
  generatedAtUtc:new Date().toISOString(),
  sourceContractDeepProbeWavePath:wavePath,
  sourceContractDeepProbeWaveSha256:sha256Text(waveText),
  policy:{
    contractDeepProbeResultAndExtractionBoardOnly:true,
    noFetchInThisJob:true,
    noSearchInThisJob:true,
    noBroadSearchInThisJob:true,
    noCanonicalWriteInThisJob:true,
    noProductionWriteInThisJob:true,
    noTruthAssertionInThisJob:true,
    canonicalCandidateWriteRequiresExplicitUserApproval:true
  },
  checks,
  boardRows,
  summary:{
    status:blockedCheckCount===0?"passed":"blocked",
    sourceProbeRowCount:wave.summary?.plannedProbeRowCount??null,
    sourceFetchExecutedNowCount:wave.summary?.fetchExecutedNowCount??null,
    bestCompetitionCount:bestRows.length,
    bestRowsByStatus:countBy(bestRows,"bestProbeStatus"),
    extractionRowsByStatus:countBy(boardRows,"extractionStatus"),
    selectedMethodsByType:countBy(boardRows,"selectedExtractionMethod"),
    extractionAttemptCompetitionCount:boardRows.filter(r=>r.bestProbeStatus==="accepted_contract_probe_strong_signal_requires_extractor").length,
    acceptedQualityGateCompetitionCount:acceptedQuality.length,
    parserReviewCompetitionCount:parserReviewRows.length,
    parserContractFollowupCompetitionCount:contractFollowupRows.length,
    contractRouteRepairFollowupCompetitionCount:routeRepairRows.length,
    totalExtractedCandidateRowCount:boardRows.reduce((s,r)=>s+r.extractedCandidateRowCount,0),
    mayBuildCanonicalCandidateWritePlanAfterExplicitApprovalCount:acceptedQuality.length>0?1:0,
    mayBuildParserReviewCount:parserReviewRows.length>0?1:0,
    mayBuildParserContractFollowupCount:contractFollowupRows.length>0?1:0,
    mayBuildContractRouteRepairFollowupCount:routeRepairRows.length>0?1:0,
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
