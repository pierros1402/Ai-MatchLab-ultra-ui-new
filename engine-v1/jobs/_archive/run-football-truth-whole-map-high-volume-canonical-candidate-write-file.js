import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const args = new Set(process.argv.slice(2));
const allowWrite = args.has("--allow-write");
const approved = args.has("--canonical-candidate-approved");

const planPath = path.join("data","football-truth","_diagnostics","whole-map-high-volume-accepted-shape-stat-mapper-and-canonical-plan-2026-06-16","whole-map-high-volume-accepted-shape-stat-mapper-and-canonical-plan-2026-06-16.json");
const canonicalPath = path.join("data","football-truth","_state","canonical-standings-candidates","whole-map-high-volume-accepted-shape-standings-candidates-2026-06-16.json");

function sha256Text(v){return crypto.createHash("sha256").update(v).digest("hex");}
function writeJson(p,v){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,`${JSON.stringify(v,null,2)}\n`,"utf8");}
function countBy(rows,key){return rows.reduce((a,r)=>{const v=String(r[key]??"unknown");a[v]=(a[v]??0)+1;return a;},{});}
function uniq(values){return [...new Set(values.filter(v=>v!==null&&v!==undefined&&v!=="").map(String))];}
function check(checks,name,passed,details={}){checks.push({name,passed:Boolean(passed),...details});}

if(!fs.existsSync(planPath)) throw new Error(`Missing canonical plan: ${planPath}`);

const planText = fs.readFileSync(planPath,"utf8");
const plan = JSON.parse(planText);
const preview = Array.isArray(plan.canonicalCandidatePreview) ? plan.canonicalCandidatePreview : [];
const candidateRows = preview.flatMap(p => (p.candidateRows ?? []).map((r,i)=>({
  competitionSlug: p.competitionSlug,
  countryCode: p.countryCode,
  sourceGroup: p.sourceGroup,
  rowIndex: i + 1,
  position: r.position,
  teamName: r.teamName,
  played: r.played,
  wins: r.wins,
  draws: r.draws,
  losses: r.losses,
  goalsFor: r.goalsFor,
  goalsAgainst: r.goalsAgainst,
  goalDifference: r.goalDifference,
  points: r.points,
  sourceUrl: r.sourceUrl,
  finalUrl: r.finalUrl,
  rawCells: r.rawCells
})));

const previewSha = sha256Text(JSON.stringify(preview,null,2));

const checks = [];
check(checks,"allowWriteFlagPresent", allowWrite);
check(checks,"canonicalCandidateApprovedFlagPresent", approved);
check(checks,"sourcePlanPassed", plan.summary?.status === "passed", {actual: plan.summary?.status});
check(checks,"sourcePlanRowsEighty", Number(plan.summary?.acceptedCandidateRowCount ?? 0) === 80, {actual: plan.summary?.acceptedCandidateRowCount});
check(checks,"previewRowsEighty", candidateRows.length === 80, {actual: candidateRows.length});
check(checks,"previewCompetitionsFive", preview.length === 5, {actual: preview.length});
check(checks,"previewShaMatchesPlan", previewSha === plan.summary?.plannedCanonicalCandidateSha256, {actual: previewSha, expected: plan.summary?.plannedCanonicalCandidateSha256});
check(checks,"noProductionWrite", true);
check(checks,"noTruthAssertion", true);

const blockedCheckCount = checks.filter(c=>!c.passed).length;
const passedCheckCount = checks.filter(c=>c.passed).length;

const canonicalCandidate = {
  fileType: "canonical_standings_candidates",
  generatedAtUtc: new Date().toISOString(),
  sourcePlanPath: planPath,
  sourcePlanSha256: sha256Text(planText),
  canonicalCandidatePreviewSha256: previewSha,
  policy: {
    canonicalCandidateWrite: true,
    explicitUserApprovalReceived: approved,
    noFetchInThisJob: true,
    noSearchInThisJob: true,
    noBroadSearchInThisJob: true,
    noProductionWriteInThisJob: true,
    noTruthAssertionInThisJob: true
  },
  checks,
  competitions: preview.map(p=>({
    competitionSlug: p.competitionSlug,
    countryCode: p.countryCode,
    sourceGroup: p.sourceGroup,
    sourceUrl: p.sourceUrl,
    finalUrl: p.finalUrl,
    expectedRows: p.expectedRows,
    candidateRowCount: p.candidateRowCount,
    quality: p.quality
  })),
  candidateRows,
  summary: {
    status: blockedCheckCount === 0 ? "passed" : "blocked",
    competitionCount: preview.length,
    countryCount: uniq(preview.map(p=>p.countryCode)).length,
    candidateRowCount: candidateRows.length,
    rowsBySourceGroup: countBy(candidateRows,"sourceGroup"),
    rowsByCompetition: countBy(candidateRows,"competitionSlug"),
    canonicalCandidatePreviewSha256: previewSha,
    canonicalCandidateWriteExecutedNowCount: blockedCheckCount === 0 ? 1 : 0,
    fetchExecutedNowCount: 0,
    searchExecutedNowCount: 0,
    broadSearchExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    checkCount: checks.length,
    passedCheckCount,
    blockedCheckCount
  }
};

if(blockedCheckCount !== 0 || !allowWrite || !approved){
  console.log(JSON.stringify({
    status: "blocked",
    canonicalPath,
    competitionCount: preview.length,
    candidateRowCount: candidateRows.length,
    checks,
    blockedCheckCount,
    canonicalCandidateWriteExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0
  }, null, 2));
  process.exitCode = 1;
} else {
  writeJson(canonicalPath, canonicalCandidate);
  const writtenText = fs.readFileSync(canonicalPath,"utf8");
  const writtenSha = sha256Text(writtenText);
  console.log(JSON.stringify({
    status: canonicalCandidate.summary.status,
    canonicalPath,
    competitionCount: canonicalCandidate.summary.competitionCount,
    countryCount: canonicalCandidate.summary.countryCount,
    candidateRowCount: canonicalCandidate.summary.candidateRowCount,
    rowsBySourceGroup: canonicalCandidate.summary.rowsBySourceGroup,
    rowsByCompetition: canonicalCandidate.summary.rowsByCompetition,
    canonicalCandidatePreviewSha256: previewSha,
    writtenFileSha256: writtenSha,
    canonicalCandidateWriteExecutedNowCount: canonicalCandidate.summary.canonicalCandidateWriteExecutedNowCount,
    fetchExecutedNowCount: 0,
    searchExecutedNowCount: 0,
    broadSearchExecutedNowCount: 0,
    productionWriteExecutedNowCount: 0,
    truthAssertionExecutedNowCount: 0,
    blockedCheckCount
  }, null, 2));
}
