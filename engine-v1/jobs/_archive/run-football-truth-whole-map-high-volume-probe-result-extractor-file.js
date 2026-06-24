import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const boardPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-controlled-probe-result-board-2026-06-16","whole-map-high-volume-controlled-probe-result-board-2026-06-16.json");
const outputPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-probe-result-extractor-2026-06-16","whole-map-high-volume-probe-result-extractor-2026-06-16.json");

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

function objectKeysLower(obj){
  return Object.keys(obj??{}).map(k=>k.toLowerCase());
}

function getHint(obj,hints){
  if(!obj || typeof obj!=="object") return null;
  for(const [k,v] of Object.entries(obj)){
    const lower=k.toLowerCase();
    if(hints.some(h=>lower===h || lower.includes(h))) return v;
  }
  return null;
}

function scoreStandingObject(obj){
  if(!obj || typeof obj!=="object" || Array.isArray(obj)) return 0;
  const keys=objectKeysLower(obj);
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

function normalizeJsonStandingRow(obj,index,sourcePath,sourceKind){
  const teamObj=getHint(obj,["team","club"]);
  const teamNameRaw =
    getHint(obj,["teamname","clubname","displayname","shortname","name"]) ??
    (teamObj && typeof teamObj==="object" ? getHint(teamObj,["teamname","clubname","displayname","shortname","name"]) : null);

  return {
    rowIndex:index+1,
    extractionMethod:"json_or_endpoint_contract",
    sourcePath,
    sourceKind,
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
    rawObjectSample:JSON.parse(JSON.stringify(obj,(_,v)=>typeof v==="string"&&v.length>140?`${v.slice(0,140)}…`:v))
  };
}

function tryParseJson(text){
  try{return JSON.parse(text);}catch{return null;}
}

function extractJsonPayloads(text){
  const payloads=[];
  const raw=decode(text);

  const direct=tryParseJson(raw.trim());
  if(direct) payloads.push({sourceKind:"direct_json_response",root:direct});

  const nextMatches=[...raw.matchAll(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for(const m of nextMatches){
    const parsed=tryParseJson(decode(m[1]).trim());
    if(parsed) payloads.push({sourceKind:"__NEXT_DATA__",root:parsed});
  }

  const jsonScripts=[...raw.matchAll(/<script[^>]+type=["']application\/(?:json|ld\+json)["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for(const m of jsonScripts){
    const parsed=tryParseJson(decode(m[1]).trim());
    if(parsed) payloads.push({sourceKind:"application_json_script",root:parsed});
  }

  const assignmentMatches=[...raw.matchAll(/(?:window\.)?[A-Z_a-z0-9.]*\s*=\s*(\{[\s\S]{200,}?\});?\s*(?:<\/script>|$)/g)];
  for(const m of assignmentMatches.slice(0,12)){
    const parsed=tryParseJson(m[1].replace(/;$/,""));
    if(parsed) payloads.push({sourceKind:"script_assignment_json",root:parsed});
  }

  return payloads;
}

function walkJsonForArrays(root,expectedRows,sourceKind){
  const candidates=[];
  let visits=0;
  const maxVisits=80000;

  function walk(node,pathParts,depth){
    visits++;
    if(visits>maxVisits || depth>30) return;

    if(Array.isArray(node)){
      const objectRows=node.filter(x=>x&&typeof x==="object"&&!Array.isArray(x));
      if(objectRows.length>=3){
        const scored=objectRows.map(scoreStandingObject);
        const strong=scored.filter(s=>s>=7).length;
        const medium=scored.filter(s=>s>=5).length;
        const nearExpected=expectedRows && objectRows.length>=Math.max(1,expectedRows-2) && objectRows.length<=expectedRows+10;
        if(strong>=Math.max(3,Math.floor(objectRows.length*0.35)) || (nearExpected && medium>=Math.max(3,Math.floor(objectRows.length*0.35)))){
          candidates.push({
            sourceKind,
            sourcePath:pathParts.join(".")||"$",
            objectRowCount:objectRows.length,
            strongRows:strong,
            mediumRows:medium,
            nearExpected:Boolean(nearExpected),
            score:strong*10+medium*4+(nearExpected?30:0),
            rows:objectRows.map((obj,i)=>normalizeJsonStandingRow(obj,i,pathParts.join(".")||"$",sourceKind))
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
  return candidates;
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

function htmlCandidates(text,expectedRows){
  const rows=parseHtmlRows(text).filter(looksStanding).map((cells,i)=>({
    rowIndex:i+1,
    extractionMethod:"html_table_from_probe_result",
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
    const positions=slice.map(r=>r.position);
    const contiguous=positions.every((p,i)=>p===i+1);
    const teamCount=uniq(slice.map(r=>r.teamName)).length;
    windows.push({score:(contiguous?1000:0)+teamCount*10,start,rows:slice});
  }
  windows.sort((a,b)=>b.score-a.score);
  return windows[0]?.rows ?? rows;
}

function classifyExtraction(selectedRows,expectedRows){
  if(selectedRows.length===0) return "no_candidate_rows_extracted_requires_parser_contract_probe";
  if(expectedRows && selectedRows.length===expectedRows) return "accepted_extraction_candidate_rows_exact_expected_count_requires_quality_gate";
  if(expectedRows && selectedRows.length>=Math.max(1,expectedRows-2) && selectedRows.length<=expectedRows+10) return "partial_or_near_expected_extraction_requires_quality_gate";
  return "extracted_rows_count_mismatch_requires_parser_review";
}

function qualityGateRows(rows,expectedRows){
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

  const status=expectedRows && mapped.length===expectedRows && uniq(teams).length===expectedRows && missingPositions.length===0 && duplicateTeams.length===0 && rowIssueCount===0
    ? "accepted_shape_quality_gate_ready_for_stat_mapper"
    : "blocked_shape_quality_gate_needs_parser_review";

  return {qualityGateStatus:status,uniqueTeamCount:uniq(teams).length,missingPositions,duplicateTeams,rowIssueCount,sampleRows:mapped.slice(0,5)};
}

if(!fs.existsSync(boardPath)) throw new Error(`Missing probe result board: ${boardPath}`);
const boardText=fs.readFileSync(boardPath,"utf8");
const board=JSON.parse(boardText);
const resultRows=Array.isArray(board.resultRows)?board.resultRows:[];
const runnerRows=resultRows.filter(r=>r.nextAllowedAction?.mayBuildProbeResultExtractor);

const extractionRows=runnerRows.map(row=>{
  let text="";
  if(row.outputFile && fs.existsSync(row.outputFile)) text=fs.readFileSync(row.outputFile,"utf8");
  const expectedRows=Number(row.expectedRows??0)||null;

  const allJsonCandidates=[];
  for(const payload of extractJsonPayloads(text)){
    allJsonCandidates.push(...walkJsonForArrays(payload.root,expectedRows,payload.sourceKind));
  }
  allJsonCandidates.sort((a,b)=>b.score-a.score);

  const htmlRows=htmlCandidates(text,expectedRows);
  const bestJson=allJsonCandidates[0]??null;

  let selectedMethod="none";
  let selectedRows=[];
  if(bestJson && (!expectedRows || bestJson.rows.length>=Math.max(3,expectedRows-2))){
    selectedMethod=bestJson.sourceKind;
    selectedRows=bestJson.rows;
  } else if(htmlRows.length>0){
    selectedMethod="html_table_from_probe_result";
    selectedRows=htmlRows;
  }

  const extractionStatus=classifyExtraction(selectedRows,expectedRows);
  const qualityGate=extractionStatus==="accepted_extraction_candidate_rows_exact_expected_count_requires_quality_gate" || extractionStatus==="partial_or_near_expected_extraction_requires_quality_gate"
    ? qualityGateRows(selectedRows,expectedRows)
    : null;

  return {
    competitionSlug:row.competitionSlug,
    countryCode:row.countryCode,
    previousAction:row.previousAction,
    laneType:row.laneType,
    laneStatus:row.laneStatus,
    probeUrl:row.probeUrl,
    finalUrl:row.finalUrl,
    outputFile:row.outputFile,
    expectedRows,
    selectedExtractionMethod:selectedMethod,
    selectedJsonCandidatePath:bestJson?.sourcePath??null,
    selectedJsonCandidateScore:bestJson?.score??null,
    jsonCandidateArrayCount:allJsonCandidates.length,
    htmlCandidateRowCount:htmlRows.length,
    extractedCandidateRowCount:selectedRows.length,
    extractionStatus,
    extractedCandidateRows:selectedRows.slice(0,expectedRows?Math.max(expectedRows+10,60):60),
    qualityGate,
    nextAllowedAction:{
      mayBuildCanonicalCandidateWritePlanAfterExplicitApproval:
        qualityGate?.qualityGateStatus==="accepted_shape_quality_gate_ready_for_stat_mapper",
      mayBuildStatMapperOrQualityReview:
        qualityGate?.qualityGateStatus==="accepted_shape_quality_gate_ready_for_stat_mapper",
      mayBuildParserReview:
        extractionStatus==="extracted_rows_count_mismatch_requires_parser_review" ||
        qualityGate?.qualityGateStatus==="blocked_shape_quality_gate_needs_parser_review",
      mayBuildParserContractProbe:
        extractionStatus==="no_candidate_rows_extracted_requires_parser_contract_probe",
      mayWriteCanonicalNow:false,
      mayWriteProductionNow:false,
      mayAssertTruthNow:false
    }
  };
});

const acceptedQuality=extractionRows.filter(r=>r.qualityGate?.qualityGateStatus==="accepted_shape_quality_gate_ready_for_stat_mapper");
const reviewRows=extractionRows.filter(r=>r.nextAllowedAction.mayBuildParserReview);
const contractProbeRows=extractionRows.filter(r=>r.nextAllowedAction.mayBuildParserContractProbe);

const checks=[];
check(checks,"sourceBoardPassed",board.summary?.status==="passed",{actual:board.summary?.status});
check(checks,"runnerReadyRowsEight",runnerRows.length===8,{actual:runnerRows.length});
check(checks,"extractionRowsEight",extractionRows.length===8,{actual:extractionRows.length});
check(checks,"allExtractionRowsHaveNextLane",extractionRows.every(r=>r.nextAllowedAction.mayBuildStatMapperOrQualityReview||r.nextAllowedAction.mayBuildParserReview||r.nextAllowedAction.mayBuildParserContractProbe));
check(checks,"noFetchSearchWriteInThisJob",true);
check(checks,"productionAndTruthLocked",true);

const blockedCheckCount=checks.filter(c=>!c.passed).length;
const passedCheckCount=checks.filter(c=>c.passed).length;

const output={
  output:outputPath,
  job:"run-football-truth-whole-map-high-volume-probe-result-extractor-file",
  generatedAtUtc:new Date().toISOString(),
  sourceProbeResultBoardPath:boardPath,
  sourceProbeResultBoardSha256:sha256Text(boardText),
  policy:{probeResultExtractionOnly:true,noFetchInThisJob:true,noSearchInThisJob:true,noBroadSearchInThisJob:true,noCanonicalWriteInThisJob:true,noProductionWriteInThisJob:true,noTruthAssertionInThisJob:true},
  checks,
  extractionRows,
  summary:{
    status:blockedCheckCount===0?"passed":"blocked",
    sourceRunnerReadyCompetitionCount:runnerRows.length,
    extractionCompetitionCount:extractionRows.length,
    extractionRowsByStatus:countBy(extractionRows,"extractionStatus"),
    selectedMethodsByType:countBy(extractionRows,"selectedExtractionMethod"),
    acceptedQualityGateCompetitionCount:acceptedQuality.length,
    parserReviewCompetitionCount:reviewRows.length,
    parserContractProbeCompetitionCount:contractProbeRows.length,
    totalExtractedCandidateRowCount:extractionRows.reduce((s,r)=>s+r.extractedCandidateRowCount,0),
    mayBuildCanonicalCandidateWritePlanAfterExplicitApprovalCount:acceptedQuality.length>0?1:0,
    mayBuildParserReviewCount:reviewRows.length>0?1:0,
    mayBuildParserContractProbeCount:contractProbeRows.length>0?1:0,
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
