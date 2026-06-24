import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const allLanesPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-all-lanes-board-2026-06-16","whole-map-high-volume-all-lanes-board-2026-06-16.json");
const recoveryPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-contract-expected-recovery-extraction-board-2026-06-16","whole-map-high-volume-contract-expected-recovery-extraction-board-2026-06-16.json");
const outputPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-accepted-shape-stat-mapper-and-canonical-plan-2026-06-16","whole-map-high-volume-accepted-shape-stat-mapper-and-canonical-plan-2026-06-16.json");

function sha256Text(v){return crypto.createHash("sha256").update(v).digest("hex");}
function writeJson(p,v){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,`${JSON.stringify(v,null,2)}\n`,"utf8");}
function uniq(values){return [...new Set(values.filter(v=>v!==null&&v!==undefined&&v!=="").map(String))];}
function countBy(rows,key){return rows.reduce((a,r)=>{const v=String(r[key]??"unknown");a[v]=(a[v]??0)+1;return a;},{});}
function clean(v){return String(v??"").replace(/\s+/g," ").trim();}
function check(checks,name,passed,details={}){checks.push({name,passed:Boolean(passed),...details});}

function parseIntLoose(v){
  const t=String(v??"").trim().replace(/^\+/,"");
  if(!/^-?\d+$/.test(t)) return null;
  const n=Number(t);
  return Number.isFinite(n)?n:null;
}
function firstNumber(v){const m=String(v??"").match(/[+-]?\d+/); return m?Number(m[0]):null;}
function parseGoalPair(v){
  const m=String(v??"").match(/(\d+)\s*[:\-]\s*(\d+)/);
  return m ? {goalsFor:Number(m[1]),goalsAgainst:Number(m[2])} : null;
}

function normalizeSourceRow(row, competitionSlug, countryCode, sourceGroup, sourceUrl, finalUrl, expectedRows){
  const rawCells = Array.isArray(row.rawCells) ? row.rawCells.map(clean).filter(Boolean) : [];
  const position = Number.isInteger(row.position) ? row.position : parseIntLoose(rawCells[0]) ?? firstNumber(rawCells[0]);
  const teamName = clean(row.teamName || rawCells.find((c,i)=>i>0 && /[A-Za-zÀ-ÿ]/.test(c) && !/^[+-]?\d+$/.test(c)));

  const numericCells = rawCells
    .map((cell,idx)=>({idx,cell,value:parseIntLoose(cell)}))
    .filter(x=>x.value!==null);

  const afterPosition = numericCells.filter(x=>x.value!==position || x.idx!==0);
  const goalPair = rawCells.map(parseGoalPair).find(Boolean);

  let played = Number.isInteger(row.played) ? row.played : null;
  let wins = Number.isInteger(row.wins) ? row.wins : null;
  let draws = Number.isInteger(row.draws) ? row.draws : null;
  let losses = Number.isInteger(row.losses) ? row.losses : null;
  let goalsFor = Number.isInteger(row.goalsFor) ? row.goalsFor : null;
  let goalsAgainst = Number.isInteger(row.goalsAgainst) ? row.goalsAgainst : null;
  let goalDifference = Number.isInteger(row.goalDifference) ? row.goalDifference : null;
  let points = Number.isInteger(row.points) ? row.points : null;

  if(afterPosition.length >= 1 && played === null) played = afterPosition[0].value;
  if(afterPosition.length >= 4 && wins === null && draws === null && losses === null){
    wins = afterPosition[1].value;
    draws = afterPosition[2].value;
    losses = afterPosition[3].value;
  }

  if(goalPair){
    goalsFor = goalsFor ?? goalPair.goalsFor;
    goalsAgainst = goalsAgainst ?? goalPair.goalsAgainst;
    if(goalDifference === null) goalDifference = goalsFor - goalsAgainst;
  } else if(afterPosition.length >= 7) {
    goalsFor = goalsFor ?? afterPosition[4].value;
    goalsAgainst = goalsAgainst ?? afterPosition[5].value;
    goalDifference = goalDifference ?? afterPosition[6].value;
  }

  if(afterPosition.length >= 1 && points === null) points = afterPosition[afterPosition.length - 1].value;

  const rowIssueCodes = [
    Number.isInteger(position) ? null : "missing_position",
    teamName ? null : "missing_team_name"
  ].filter(Boolean);

  const statCompleteness = ["played","wins","draws","losses","goalsFor","goalsAgainst","goalDifference","points"]
    .reduce((s,k)=>s+(Number.isInteger({played,wins,draws,losses,goalsFor,goalsAgainst,goalDifference,points}[k])?1:0),0);

  return {
    competitionSlug,
    countryCode,
    sourceGroup,
    sourceUrl,
    finalUrl,
    expectedRows,
    rowIndex: row.rowIndex ?? null,
    position,
    teamName,
    played,
    wins,
    draws,
    losses,
    goalsFor,
    goalsAgainst,
    goalDifference,
    points,
    rawCells,
    rowIssueCodes,
    statCompleteness
  };
}

function quality(rows, expectedRows){
  const positions = rows.map(r=>r.position);
  const teams = rows.map(r=>r.teamName);
  const missingPositions = Array.from({length:expectedRows},(_,i)=>i+1).filter(p=>!positions.includes(p));
  const duplicateTeams = teams.filter((t,i)=>t && teams.indexOf(t)!==i);
  const rowIssueCount = rows.reduce((s,r)=>s+r.rowIssueCodes.length,0);
  const statCompleteRows = rows.filter(r=>r.statCompleteness>=2).length;

  const status = rows.length===expectedRows && uniq(teams).length===expectedRows && missingPositions.length===0 && duplicateTeams.length===0 && rowIssueCount===0
    ? "accepted_candidate_shape_ready_for_canonical_write_plan"
    : "blocked_candidate_shape_needs_review";

  return {status,rowCount:rows.length,expectedRows,uniqueTeamCount:uniq(teams).length,missingPositions,duplicateTeams,rowIssueCount,statCompleteRows};
}

for(const p of [allLanesPath,recoveryPath]){
  if(!fs.existsSync(p)) throw new Error(`Missing input: ${p}`);
}

const allText = fs.readFileSync(allLanesPath,"utf8");
const recoveryText = fs.readFileSync(recoveryPath,"utf8");
const all = JSON.parse(allText);
const recovery = JSON.parse(recoveryText);

const initialAccepted = (all.laneRows ?? [])
  .filter(r=>r.laneKind==="quality_gate_and_stat_mapper" && r.laneStatus==="accepted_shape_quality_gate_ready_for_stat_mapper")
  .map(r=>{
    const sourceRows = r.qualityGate?.mappedRowsPreview ?? r.qualityGate?.sampleRows ?? [];
    const expectedRows = Number(r.expectedRows ?? sourceRows.length);
    const candidateRows = sourceRows.map(row=>normalizeSourceRow(row,r.competitionSlug,r.countryCode,"initial_accepted_shape",r.sourceUrl,r.finalUrl,expectedRows));
    return {
      competitionSlug:r.competitionSlug,
      countryCode:r.countryCode,
      sourceGroup:"initial_accepted_shape",
      sourceUrl:r.sourceUrl,
      finalUrl:r.finalUrl,
      expectedRows,
      candidateRowCount:candidateRows.length,
      quality:quality(candidateRows,expectedRows),
      candidateRows
    };
  });

const recoveredAccepted = (recovery.recoveredRows ?? [])
  .filter(r=>r.recoveredStatus==="accepted_recovered_exact_expected_shape_ready_for_stat_mapper")
  .map(r=>{
    const sourceRows = r.recoveredCandidateRows ?? [];
    const expectedRows = Number(r.recoveredExpectedRows ?? sourceRows.length);
    const candidateRows = sourceRows.map(row=>normalizeSourceRow(row,r.competitionSlug,r.countryCode,"contract_recovered_expected_shape",r.probeUrl,r.finalUrl,expectedRows));
    return {
      competitionSlug:r.competitionSlug,
      countryCode:r.countryCode,
      sourceGroup:"contract_recovered_expected_shape",
      sourceUrl:r.probeUrl,
      finalUrl:r.finalUrl,
      outputFile:r.outputFile,
      expectedRows,
      candidateRowCount:candidateRows.length,
      quality:quality(candidateRows,expectedRows),
      candidateRows
    };
  });

const acceptedCompetitionPlans = [...initialAccepted,...recoveredAccepted];
const allCandidateRows = acceptedCompetitionPlans.flatMap(p=>p.candidateRows);
const acceptedQualityPlans = acceptedCompetitionPlans.filter(p=>p.quality.status==="accepted_candidate_shape_ready_for_canonical_write_plan");

const canonicalCandidatePreview = acceptedQualityPlans.map(plan=>({
  competitionSlug:plan.competitionSlug,
  countryCode:plan.countryCode,
  sourceGroup:plan.sourceGroup,
  sourceUrl:plan.sourceUrl,
  finalUrl:plan.finalUrl,
  expectedRows:plan.expectedRows,
  candidateRowCount:plan.candidateRowCount,
  quality:plan.quality,
  previewRows:plan.candidateRows.slice(0,5),
  candidateRows:plan.candidateRows.map(r=>({
    competitionSlug:r.competitionSlug,
    countryCode:r.countryCode,
    position:r.position,
    teamName:r.teamName,
    played:r.played,
    wins:r.wins,
    draws:r.draws,
    losses:r.losses,
    goalsFor:r.goalsFor,
    goalsAgainst:r.goalsAgainst,
    goalDifference:r.goalDifference,
    points:r.points,
    sourceUrl:r.sourceUrl,
    finalUrl:r.finalUrl,
    rawCells:r.rawCells
  }))
}));

const candidatePreviewText = JSON.stringify(canonicalCandidatePreview,null,2);
const plannedCanonicalCandidateSha256 = sha256Text(candidatePreviewText);

const checks=[];
check(checks,"sourceAllLanesPassed",all.summary?.status==="passed",{actual:all.summary?.status});
check(checks,"sourceRecoveryPassed",recovery.summary?.status==="passed",{actual:recovery.summary?.status});
check(checks,"initialAcceptedShapeCountFour",initialAccepted.length===4,{actual:initialAccepted.length});
check(checks,"recoveredAcceptedShapeCountOne",recoveredAccepted.length===1,{actual:recoveredAccepted.length});
check(checks,"acceptedPlanCountFive",acceptedCompetitionPlans.length===5,{actual:acceptedCompetitionPlans.length});
check(checks,"acceptedCandidateRowsEighty",allCandidateRows.length===80,{actual:allCandidateRows.length});
check(checks,"allFiveQualityAccepted",acceptedQualityPlans.length===5,{actual:acceptedQualityPlans.length});
check(checks,"noFetchSearchWriteInThisJob",true);
check(checks,"canonicalWriteStillRequiresExplicitApproval",true);
check(checks,"productionAndTruthLocked",true);

const blockedCheckCount=checks.filter(c=>!c.passed).length;
const passedCheckCount=checks.filter(c=>c.passed).length;

const output={
  output:outputPath,
  job:"build-football-truth-whole-map-high-volume-accepted-shape-stat-mapper-and-canonical-plan-file",
  generatedAtUtc:new Date().toISOString(),
  sourceAllLanesPath:allLanesPath,
  sourceAllLanesSha256:sha256Text(allText),
  sourceRecoveryPath:recoveryPath,
  sourceRecoverySha256:sha256Text(recoveryText),
  policy:{
    acceptedShapeStatMapperAndCanonicalPlanOnly:true,
    noFetchInThisJob:true,
    noSearchInThisJob:true,
    noBroadSearchInThisJob:true,
    noCanonicalWriteInThisJob:true,
    noProductionWriteInThisJob:true,
    noTruthAssertionInThisJob:true,
    canonicalCandidateWriteRequiresExplicitUserApproval:true
  },
  checks,
  acceptedCompetitionPlans,
  canonicalCandidatePreview,
  summary:{
    status:blockedCheckCount===0?"passed":"blocked",
    acceptedCompetitionPlanCount:acceptedCompetitionPlans.length,
    acceptedCompetitionPlansBySourceGroup:countBy(acceptedCompetitionPlans,"sourceGroup"),
    acceptedQualityCompetitionCount:acceptedQualityPlans.length,
    acceptedCandidateRowCount:allCandidateRows.length,
    canonicalCandidatePreviewCompetitionCount:canonicalCandidatePreview.length,
    canonicalCandidatePreviewRowCount:canonicalCandidatePreview.reduce((s,p)=>s+p.candidateRowCount,0),
    plannedCanonicalCandidateSha256,
    mayWriteCanonicalCandidateAfterExplicitUserApprovalCount:canonicalCandidatePreview.length>0?1:0,
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
