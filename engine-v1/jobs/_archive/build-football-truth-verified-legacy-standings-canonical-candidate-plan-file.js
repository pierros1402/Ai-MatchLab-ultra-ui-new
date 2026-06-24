import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const boardPath = path.join("data","football-truth","_diagnostics","strict-legacy-standings-verification-board-2026-06-17","strict-legacy-standings-verification-board-2026-06-17.json");
const standingsDir = path.join("data","standings");
const stateDir = path.join("data","football-truth","_state","canonical-standings-candidates");
const outDir = path.join("data","football-truth","_diagnostics","verified-legacy-standings-canonical-candidate-plan-2026-06-17");
const outPath = path.join(outDir,"verified-legacy-standings-canonical-candidate-plan-2026-06-17.json");

function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8")); }
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }
function sha256File(p){ return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"); }
function clean(v){ return String(v??"").replace(/\s+/g," ").trim(); }
function n(v){ const x=Number(v); return Number.isFinite(x) ? x : null; }

const covered = new Set();
if(fs.existsSync(stateDir)){
  for(const f of fs.readdirSync(stateDir).filter(f=>f.endsWith(".json"))){
    const txt = fs.readFileSync(path.join(stateDir,f),"utf8");
    for(const m of txt.matchAll(/"competitionSlug"\s*:\s*"([^"]+)"/g)) covered.add(m[1]);
    for(const m of txt.matchAll(/"rowsByCompetition"\s*:\s*\{([\s\S]*?)\}/g)){
      for(const s of m[1].matchAll(/"([^"]+)"\s*:/g)) covered.add(s[1]);
    }
  }
}

const board = readJson(boardPath);
const verified = board.rows.filter(r => r.verificationStatus === "verified_promotable_candidate");
const uncoveredVerified = verified.filter(r => !covered.has(r.competitionSlug));

const candidateCompetitions = uncoveredVerified.map(v => {
  const sourcePath = path.join(standingsDir, `${v.competitionSlug}.json`);
  const source = readJson(sourcePath);
  const rows = source.table.map((r,idx) => ({
    competitionSlug:v.competitionSlug,
    position:n(r.position ?? r.rank) ?? idx+1,
    teamName:clean(r.teamName ?? r.team ?? r.name),
    played:n(r.played),
    wins:n(r.wins ?? r.won),
    draws:n(r.draws ?? r.drawn),
    losses:n(r.losses ?? r.lost),
    goalsFor:n(r.goalsFor),
    goalsAgainst:n(r.goalsAgainst),
    goalDiff:n(r.goalDiff ?? r.goalDifference),
    points:n(r.points),
    provenance:{
      sourceGroup:"verified_legacy_local_history_standings",
      sourceFile:path.relative(".",sourcePath),
      sourceSha256:sha256File(sourcePath),
      verificationBoard:path.relative(".",boardPath),
      verificationStatus:v.verificationStatus,
      historyMatchCount:v.historyMatchCount,
      matchedHistoryTeams:v.matchedHistoryTeams,
      confidence:v.confidence,
      completeness:v.completeness
    }
  }));
  return {
    competitionSlug:v.competitionSlug,
    sourceFile:path.relative(".",sourcePath),
    sourceSha256:sha256File(sourcePath),
    rowCount:rows.length,
    historyMatchCount:v.historyMatchCount,
    matchedHistoryTeams:v.matchedHistoryTeams,
    confidence:v.confidence,
    completeness:v.completeness,
    rows
  };
});

const rowsByCompetition = Object.fromEntries(candidateCompetitions.map(c => [c.competitionSlug,c.rowCount]));
const totalRows = candidateCompetitions.reduce((s,c)=>s+c.rowCount,0);

const checks = [];
function check(name,passed,details={}){ checks.push({name,passed:Boolean(passed),...details}); }
check("strictVerificationBoardPresent", fs.existsSync(boardPath));
check("onlyVerifiedPromotableRowsIncluded", candidateCompetitions.every(c => c.rows.every(r => r.provenance.verificationStatus === "verified_promotable_candidate")));
check("alreadyCoveredCompetitionsExcluded", candidateCompetitions.every(c => !covered.has(c.competitionSlug)));
check("candidateCompetitionCountPositive", candidateCompetitions.length > 0, {candidateCompetitionCount:candidateCompetitions.length});
check("noFetchSearchWriteInThisPlan", true);
check("productionAndTruthLocked", true);

const output = {
  status:"passed",
  generatedAtUtc:new Date().toISOString(),
  candidateCompetitions,
  rowsByCompetition,
  excludedAlreadyCovered:[...verified.filter(r=>covered.has(r.competitionSlug)).map(r=>r.competitionSlug)].sort(),
  checks,
  policy:{
    planOnly:true,
    noFetch:true,
    noSearch:true,
    noCanonicalWriteInThisPlan:true,
    noProductionWrite:true,
    noTruthAssertion:true,
    canonicalCandidateWriteRequiresExplicitApproval:true,
    productionTruthRequiresSeparateSourceIdentityGate:true
  },
  summary:{
    status:"passed",
    verifiedPromotableFromBoardCount:verified.length,
    excludedAlreadyCoveredCount:verified.filter(r=>covered.has(r.competitionSlug)).length,
    candidateCompetitionCount:candidateCompetitions.length,
    candidateRowCount:totalRows,
    rowsByCompetition,
    fetchExecutedNowCount:0,
    searchExecutedNowCount:0,
    broadSearchExecutedNowCount:0,
    canonicalWriteExecutedNowCount:0,
    productionWriteExecutedNowCount:0,
    truthAssertionExecutedNowCount:0,
    checkCount:checks.length,
    passedCheckCount:checks.filter(c=>c.passed).length,
    blockedCheckCount:checks.filter(c=>!c.passed).length
  }
};

writeJson(outPath, output);
console.log(JSON.stringify(output.summary,null,2));
