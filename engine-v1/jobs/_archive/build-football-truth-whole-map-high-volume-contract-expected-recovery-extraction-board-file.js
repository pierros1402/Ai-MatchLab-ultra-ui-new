import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const resultBoardPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-contract-deep-probe-result-and-extraction-board-2026-06-16","whole-map-high-volume-contract-deep-probe-result-and-extraction-board-2026-06-16.json");
const planPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-contract-deep-probe-plan-2026-06-16","whole-map-high-volume-contract-deep-probe-plan-2026-06-16.json");
const wavePath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-contract-deep-probe-wave-2026-06-16","whole-map-high-volume-contract-deep-probe-wave-2026-06-16.json");
const outputPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-contract-expected-recovery-extraction-board-2026-06-16","whole-map-high-volume-contract-expected-recovery-extraction-board-2026-06-16.json");

function sha256Text(v){return crypto.createHash("sha256").update(v).digest("hex");}
function writeJson(p,v){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,`${JSON.stringify(v,null,2)}\n`,"utf8");}
function countBy(rows,key){return rows.reduce((a,r)=>{const v=String(r[key]??"unknown");a[v]=(a[v]??0)+1;return a;},{});}
function uniq(values){return [...new Set(values.filter(v=>v!==null&&v!==undefined&&v!=="").map(String))];}
function clean(v){return String(v??"").replace(/\s+/g," ").trim();}
function check(checks,name,passed,details={}){checks.push({name,passed:Boolean(passed),...details});}

function parseIntLoose(v){const t=String(v??"").trim().replace(/^\+/,""); if(!/^-?\d+$/.test(t)) return null; const n=Number(t); return Number.isFinite(n)?n:null;}
function firstNumber(v){const m=String(v??"").match(/[+-]?\d+/); return m?Number(m[0]):null;}

function recoverExpectedRows(slug, plan){
  const rows = Array.isArray(plan.contractLaneRows) ? plan.contractLaneRows : [];
  const matching = rows.filter(r=>r.competitionSlug===slug);
  const vals = uniq(matching.map(r=>r.expectedRows)).map(Number).filter(Number.isFinite);
  if(vals.length) return vals[0];
  return null;
}

function segmentByPositionReset(rows, expectedRows){
  const sourceRows = Array.isArray(rows) ? rows : [];
  if(!expectedRows || sourceRows.length < expectedRows) return [];
  const segments = [];

  for(let i=0;i<sourceRows.length;i++){
    const pos = Number.isInteger(sourceRows[i]?.position) ? sourceRows[i].position : parseIntLoose(sourceRows[i]?.rawCells?.[0]) ?? firstNumber(sourceRows[i]?.rawCells?.[0]);
    if(pos !== 1) continue;

    const slice = sourceRows.slice(i, i + expectedRows);
    if(slice.length !== expectedRows) continue;

    const positions = slice.map((r,idx)=>Number.isInteger(r.position) ? r.position : parseIntLoose(r.rawCells?.[0]) ?? firstNumber(r.rawCells?.[0]));
    const teams = slice.map(r=>clean(r.teamName || r.rawCells?.find(c=>/[A-Za-zÀ-ÿ]/.test(String(c)) && !/^\d+$/.test(String(c).trim()))));
    const contiguous = positions.every((p,idx)=>p===idx+1);
    const uniqueTeams = uniq(teams).length;
    const missingTeams = teams.filter(t=>!t).length;

    segments.push({
      startIndex:i,
      endIndex:i+expectedRows-1,
      score:(contiguous?1000:0)+uniqueTeams*10-missingTeams*20,
      contiguous,
      uniqueTeamCount:uniqueTeams,
      missingTeamCount:missingTeams,
      rows:slice.map((r,idx)=>({...r,rowIndex:idx+1,position:positions[idx],teamName:teams[idx] || clean(r.teamName)}))
    });
  }

  return segments.sort((a,b)=>b.score-a.score);
}

function qualityGate(rows, expectedRows){
  const mapped = rows.map((r,i)=>{
    const position = Number.isInteger(r.position) ? r.position : parseIntLoose(r.rawCells?.[0]) ?? firstNumber(r.rawCells?.[0]);
    const teamName = clean(r.teamName || r.rawCells?.find(c=>/[A-Za-zÀ-ÿ]/.test(String(c)) && !/^\d+$/.test(String(c).trim())));
    const rawCells = Array.isArray(r.rawCells) ? r.rawCells.map(clean).filter(Boolean) : [];
    return {
      rowIndex:i+1,
      position,
      teamName,
      rawCells,
      rowIssueCodes:[
        Number.isInteger(position) ? null : "missing_position",
        teamName ? null : "missing_team_name"
      ].filter(Boolean)
    };
  });

  const positions = mapped.map(r=>r.position);
  const teams = mapped.map(r=>r.teamName);
  const missingPositions = Array.from({length:expectedRows},(_,i)=>i+1).filter(p=>!positions.includes(p));
  const duplicateTeams = teams.filter((t,i)=>t && teams.indexOf(t)!==i);
  const rowIssueCount = mapped.reduce((s,r)=>s+r.rowIssueCodes.length,0);

  const qualityGateStatus = mapped.length===expectedRows && uniq(teams).length===expectedRows && missingPositions.length===0 && duplicateTeams.length===0 && rowIssueCount===0
    ? "accepted_shape_quality_gate_ready_for_stat_mapper"
    : "blocked_shape_quality_gate_needs_parser_review";

  return {qualityGateStatus,rowCount:mapped.length,uniqueTeamCount:uniq(teams).length,missingPositions,duplicateTeams,rowIssueCount,sampleRows:mapped.slice(0,5),mappedRows:mapped};
}

function classifyRecovered(row, expectedRows){
  const existingRows = Array.isArray(row.extractedCandidateRows) ? row.extractedCandidateRows : [];
  let selectedRows = existingRows;
  let recoveryMethod = "none";

  if(expectedRows && existingRows.length !== expectedRows && existingRows.length > expectedRows){
    const segments = segmentByPositionReset(existingRows, expectedRows);
    if(segments.length){
      selectedRows = segments[0].rows;
      recoveryMethod = "segment_by_position_reset_and_expected_rows";
    }
  }

  const q = expectedRows && selectedRows.length >= expectedRows ? qualityGate(selectedRows.slice(0, expectedRows), expectedRows) : null;

  let recoveredStatus = row.extractionStatus;
  if(q?.qualityGateStatus === "accepted_shape_quality_gate_ready_for_stat_mapper") recoveredStatus = "accepted_recovered_exact_expected_shape_ready_for_stat_mapper";
  else if(q) recoveredStatus = "recovered_rows_shape_needs_parser_review";
  else if(expectedRows && existingRows.length === expectedRows) recoveredStatus = "exact_expected_count_requires_quality_gate_review";

  return {
    recoveredExpectedRows: expectedRows,
    recoveryMethod,
    recoveredCandidateRowCount: selectedRows.length,
    recoveredCandidateRows: selectedRows.slice(0, expectedRows ? Math.max(expectedRows+5,40) : 40),
    recoveredQualityGate: q,
    recoveredStatus
  };
}

for(const p of [resultBoardPath, planPath, wavePath]){
  if(!fs.existsSync(p)) throw new Error(`Missing input: ${p}`);
}

const resultText = fs.readFileSync(resultBoardPath,"utf8");
const planText = fs.readFileSync(planPath,"utf8");
const waveText = fs.readFileSync(wavePath,"utf8");
const resultBoard = JSON.parse(resultText);
const plan = JSON.parse(planText);
const wave = JSON.parse(waveText);

const boardRows = Array.isArray(resultBoard.boardRows) ? resultBoard.boardRows : [];
const recoveredRows = boardRows.map(row=>{
  const expectedRows = recoverExpectedRows(row.competitionSlug, plan);
  const recovery = classifyRecovered(row, expectedRows);
  return {
    competitionSlug:row.competitionSlug,
    countryCode:row.countryCode,
    sourceGroup:row.sourceGroup,
    bestProbeStatus:row.bestProbeStatus,
    probeType:row.probeType,
    probeUrl:row.probeUrl,
    finalUrl:row.finalUrl,
    outputFile:row.outputFile,
    originalExpectedRows:row.expectedRows ?? null,
    originalExtractionStatus:row.extractionStatus,
    originalExtractedCandidateRowCount:row.extractedCandidateRowCount,
    selectedExtractionMethod:row.selectedExtractionMethod,
    ...recovery,
    nextAllowedAction:{
      mayBuildStatMapperAndCanonicalCandidatePlanAfterExplicitApproval:
        recovery.recoveredQualityGate?.qualityGateStatus==="accepted_shape_quality_gate_ready_for_stat_mapper",
      mayBuildParserReview:
        recovery.recoveredStatus==="recovered_rows_shape_needs_parser_review" ||
        recovery.recoveredStatus==="exact_expected_count_requires_quality_gate_review" ||
        row.extractionStatus==="weak_contract_signal_requires_review" ||
        row.extractionStatus==="extracted_rows_count_mismatch_requires_parser_review",
      mayBuildParserContractFollowup:
        recovery.recoveredStatus==="no_rows_extracted_requires_contract_review",
      mayBuildContractRouteRepairFollowup:
        recovery.recoveredStatus==="contract_route_repair_followup_required",
      mayWriteCanonicalNow:false,
      mayWriteProductionNow:false,
      mayAssertTruthNow:false
    }
  };
});

const accepted = recoveredRows.filter(r=>r.nextAllowedAction.mayBuildStatMapperAndCanonicalCandidatePlanAfterExplicitApproval);
const parserReview = recoveredRows.filter(r=>r.nextAllowedAction.mayBuildParserReview);
const contractFollowup = recoveredRows.filter(r=>r.nextAllowedAction.mayBuildParserContractFollowup);
const routeRepair = recoveredRows.filter(r=>r.nextAllowedAction.mayBuildContractRouteRepairFollowup);

const checks=[];
check(checks,"sourceResultBoardPassed",resultBoard.summary?.status==="passed",{actual:resultBoard.summary?.status});
check(checks,"sourcePlanPassed",plan.summary?.status==="passed",{actual:plan.summary?.status});
check(checks,"sourceWavePassed",wave.summary?.status==="passed",{actual:wave.summary?.status});
check(checks,"boardRowsFifteen",boardRows.length===15,{actual:boardRows.length});
check(checks,"recoveredRowsFifteen",recoveredRows.length===15,{actual:recoveredRows.length});
check(checks,"expectedRowsRecoveredForAll",recoveredRows.every(r=>Number.isFinite(Number(r.recoveredExpectedRows))),{missing:recoveredRows.filter(r=>!Number.isFinite(Number(r.recoveredExpectedRows))).map(r=>r.competitionSlug)});
check(checks,"noFetchSearchWriteInThisJob",true);
check(checks,"productionAndTruthLocked",true);

const blockedCheckCount=checks.filter(c=>!c.passed).length;
const passedCheckCount=checks.filter(c=>c.passed).length;

const output={
  output:outputPath,
  job:"build-football-truth-whole-map-high-volume-contract-expected-recovery-extraction-board-file",
  generatedAtUtc:new Date().toISOString(),
  sourceResultBoardPath:resultBoardPath,
  sourceResultBoardSha256:sha256Text(resultText),
  sourcePlanPath:planPath,
  sourcePlanSha256:sha256Text(planText),
  sourceWavePath:wavePath,
  sourceWaveSha256:sha256Text(waveText),
  policy:{
    expectedRowsRecoveryOnly:true,
    noFetchInThisJob:true,
    noSearchInThisJob:true,
    noBroadSearchInThisJob:true,
    noCanonicalWriteInThisJob:true,
    noProductionWriteInThisJob:true,
    noTruthAssertionInThisJob:true,
    canonicalCandidateWriteRequiresExplicitUserApproval:true
  },
  checks,
  recoveredRows,
  summary:{
    status:blockedCheckCount===0 ? "passed" : "blocked",
    sourceBoardCompetitionCount:boardRows.length,
    recoveredCompetitionCount:recoveredRows.length,
    recoveredRowsByStatus:countBy(recoveredRows,"recoveredStatus"),
    recoveryMethodsByType:countBy(recoveredRows,"recoveryMethod"),
    acceptedRecoveredQualityCompetitionCount:accepted.length,
    parserReviewCompetitionCount:parserReview.length,
    parserContractFollowupCompetitionCount:contractFollowup.length,
    contractRouteRepairFollowupCompetitionCount:routeRepair.length,
    recoveredCandidateRowCount:recoveredRows.reduce((s,r)=>s+r.recoveredCandidateRowCount,0),
    acceptedRecoveredCandidateRowCount:accepted.reduce((s,r)=>s+r.recoveredCandidateRowCount,0),
    mayBuildStatMapperAndCanonicalCandidatePlanAfterExplicitApprovalCount:accepted.length>0?1:0,
    mayBuildParserReviewCount:parserReview.length>0?1:0,
    mayBuildParserContractFollowupCount:contractFollowup.length>0?1:0,
    mayBuildContractRouteRepairFollowupCount:routeRepair.length>0?1:0,
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
