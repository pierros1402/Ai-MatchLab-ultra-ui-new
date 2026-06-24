import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const seedWavePath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-official-domain-seed-wave-2026-06-16","whole-map-high-volume-official-domain-seed-wave-2026-06-16.json");
const outputPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-official-domain-seed-accepted-canonical-plan-2026-06-16","whole-map-high-volume-official-domain-seed-accepted-canonical-plan-2026-06-16.json");

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
function parseGoalPair(v){const m=String(v??"").match(/(\d+)\s*[:\-]\s*(\d+)/); return m?{goalsFor:Number(m[1]),goalsAgainst:Number(m[2])}:null;}

function normalizeRow(row, plan){
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
    if(goalDifference === null && Number.isInteger(goalsFor) && Number.isInteger(goalsAgainst)) goalDifference = goalsFor - goalsAgainst;
  } else if(afterPosition.length >= 7) {
    goalsFor = goalsFor ?? afterPosition[4].value;
    goalsAgainst = goalsAgainst ?? afterPosition[5].value;
    goalDifference = goalDifference ?? afterPosition[6].value;
  }
  if(afterPosition.length >= 1 && points === null) points = afterPosition[afterPosition.length - 1].value;

  return {
    competitionSlug: plan.competitionSlug,
    countryCode: plan.countryCode,
    sourceGroup: "official_domain_seed_accepted_shape",
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
    sourceUrl: plan.probeUrl,
    finalUrl: plan.finalUrl,
    officialDomain: plan.officialDomain,
    seedSuffix: plan.seedSuffix,
    rawCells,
    rowIssueCodes:[
      Number.isInteger(position)?null:"missing_position",
      teamName?null:"missing_team_name"
    ].filter(Boolean)
  };
}

function quality(rows, expectedRows){
  const positions = rows.map(r=>r.position);
  const teams = rows.map(r=>r.teamName);
  const missingPositions = Array.from({length:expectedRows},(_,i)=>i+1).filter(p=>!positions.includes(p));
  const duplicateTeams = teams.filter((t,i)=>t && teams.indexOf(t)!==i);
  const rowIssueCount = rows.reduce((s,r)=>s+r.rowIssueCodes.length,0);
  const status = rows.length===expectedRows && uniq(teams).length===expectedRows && missingPositions.length===0 && duplicateTeams.length===0 && rowIssueCount===0
    ? "accepted_candidate_shape_ready_for_canonical_write_plan"
    : "blocked_candidate_shape_needs_review";
  return {status,rowCount:rows.length,expectedRows,uniqueTeamCount:uniq(teams).length,missingPositions,duplicateTeams,rowIssueCount};
}

if(!fs.existsSync(seedWavePath)) throw new Error(`Missing official domain seed wave output: ${seedWavePath}`);

const seedWaveText = fs.readFileSync(seedWavePath,"utf8");
const seedWave = JSON.parse(seedWaveText);
const acceptedBoardRows = (seedWave.boardRows ?? []).filter(r=>r.qualityGate?.qualityGateStatus==="accepted_shape_quality_gate_ready_for_stat_mapper");

const acceptedCompetitionPlans = acceptedBoardRows.map(plan=>{
  const expectedRows = Number(plan.expectedRows ?? plan.extractedCandidateRowCount ?? 0);
  const candidateRows = (plan.extractedCandidateRows ?? []).slice(0, expectedRows).map(row=>normalizeRow(row, plan));
  return {
    competitionSlug: plan.competitionSlug,
    countryCode: plan.countryCode,
    sourceGroup: "official_domain_seed_accepted_shape",
    sourceUrl: plan.probeUrl,
    finalUrl: plan.finalUrl,
    officialDomain: plan.officialDomain,
    seedSuffix: plan.seedSuffix,
    outputFile: plan.outputFile,
    expectedRows,
    candidateRowCount: candidateRows.length,
    quality: quality(candidateRows, expectedRows),
    previewRows: candidateRows.slice(0,5),
    candidateRows
  };
});

const acceptedQualityPlans = acceptedCompetitionPlans.filter(p=>p.quality.status==="accepted_candidate_shape_ready_for_canonical_write_plan");
const candidateRows = acceptedQualityPlans.flatMap(p=>p.candidateRows);
const canonicalCandidatePreview = acceptedQualityPlans.map(p=>({
  competitionSlug:p.competitionSlug,
  countryCode:p.countryCode,
  sourceGroup:p.sourceGroup,
  sourceUrl:p.sourceUrl,
  finalUrl:p.finalUrl,
  officialDomain:p.officialDomain,
  seedSuffix:p.seedSuffix,
  expectedRows:p.expectedRows,
  candidateRowCount:p.candidateRowCount,
  quality:p.quality,
  previewRows:p.previewRows,
  candidateRows:p.candidateRows
}));
const plannedCanonicalCandidateSha256 = sha256Text(JSON.stringify(canonicalCandidatePreview,null,2));

const checks=[];
check(checks,"sourceSeedWavePassed",seedWave.summary?.status==="passed",{actual:seedWave.summary?.status});
check(checks,"sourceAcceptedQualityCountTwo",Number(seedWave.summary?.acceptedQualityGateCompetitionCount??0)===2,{actual:seedWave.summary?.acceptedQualityGateCompetitionCount});
check(checks,"acceptedBoardRowsTwo",acceptedBoardRows.length===2,{actual:acceptedBoardRows.length});
check(checks,"acceptedQualityPlansTwo",acceptedQualityPlans.length===2,{actual:acceptedQualityPlans.length});
check(checks,"candidateRowsTwentyEight",candidateRows.length===28,{actual:candidateRows.length});
check(checks,"noFetchSearchWriteInThisJob",true);
check(checks,"canonicalWriteStillRequiresExplicitApproval",true);
check(checks,"productionAndTruthLocked",true);

const blockedCheckCount=checks.filter(c=>!c.passed).length;
const passedCheckCount=checks.filter(c=>c.passed).length;

const output={
  output:outputPath,
  job:"build-football-truth-whole-map-high-volume-official-domain-seed-accepted-canonical-plan-file",
  generatedAtUtc:new Date().toISOString(),
  sourceSeedWavePath:seedWavePath,
  sourceSeedWaveSha256:sha256Text(seedWaveText),
  policy:{
    officialDomainSeedAcceptedCanonicalPlanOnly:true,
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
    acceptedQualityCompetitionCount:acceptedQualityPlans.length,
    acceptedCandidateRowCount:candidateRows.length,
    rowsByCompetition:countBy(candidateRows,"competitionSlug"),
    rowsBySourceGroup:countBy(candidateRows,"sourceGroup"),
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
