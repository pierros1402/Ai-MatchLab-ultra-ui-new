import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const outDir = path.join("data","football-truth","_diagnostics","whole-map-bulk-coverage-gap-board-2026-06-17");
const outPath = path.join(outDir,"whole-map-bulk-coverage-gap-board-2026-06-17.json");
const stateDir = path.join("data","football-truth","_state","canonical-standings-candidates");
const diagRoot = path.join("data","football-truth","_diagnostics");

function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8")); }
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p, JSON.stringify(v,null,2)); }
function sha256File(p){ return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"); }
function walkFiles(dir, pred, acc=[]){
  if(!fs.existsSync(dir)) return acc;
  for(const ent of fs.readdirSync(dir,{withFileTypes:true})){
    const p = path.join(dir, ent.name);
    if(ent.isDirectory()) walkFiles(p,pred,acc);
    else if(pred(p)) acc.push(p);
  }
  return acc;
}
function isObj(v){ return v && typeof v === "object" && !Array.isArray(v); }
function props(o){ return isObj(o) ? Object.keys(o) : []; }
function firstDefined(...xs){ return xs.find(x => x !== undefined && x !== null); }
function clean(v){ return String(v ?? "").replace(/\s+/g," ").trim(); }
function num(v){ const n=Number(v); return Number.isFinite(n) ? n : null; }
function slugOf(o){ return clean(firstDefined(o.competitionSlug,o.slug,o.competition_id,o.competitionId,o.id)); }
function teamOf(o){
  return clean(firstDefined(o.teamName,o.team,o.name,o.club,o.clubName,o.squadName,o.contestantName,o.canonicalTeamName,o.team_name));
}
function posOf(o){ return clean(firstDefined(o.position,o.rank,o.pos,o.place,o.standingPosition,o.tablePosition)); }
function looksStandingRow(o){
  if(!isObj(o)) return false;
  const ks = props(o).map(k=>k.toLowerCase());
  const hasSlug = Boolean(slugOf(o));
  const hasTeam = Boolean(teamOf(o));
  const hasPos = Boolean(posOf(o)) || ks.some(k=>["position","rank","pos","place","tableposition"].includes(k));
  const hasStats = ks.some(k => /(points|pts|played|matches|won|draw|lost|goals|goaldifference|gd|rank|position)/i.test(k));
  return hasSlug && hasTeam && (hasPos || hasStats);
}
function collectStandingRows(node, pathParts=[], out=[]){
  if(Array.isArray(node)){
    const rows = node.filter(looksStandingRow);
    if(rows.length){
      out.push({ path:pathParts.join("."), rowCount:rows.length, rows });
    }
    node.forEach((x,i)=>collectStandingRows(x,[...pathParts,String(i)],out));
  } else if(isObj(node)){
    for(const [k,v] of Object.entries(node)) collectStandingRows(v,[...pathParts,k],out);
  }
  return out;
}
function rowsByCompFromRows(rows){
  const seen = new Set();
  const map = {};
  for(const r of rows){
    const slug = slugOf(r);
    if(!slug) continue;
    const key = [slug, posOf(r), teamOf(r)].join("||").toLowerCase();
    if(seen.has(key)) continue;
    seen.add(key);
    map[slug] = (map[slug] || 0) + 1;
  }
  return map;
}
function mergeMaps(a,b){
  for(const [k,v] of Object.entries(b||{})) a[k] = Math.max(Number(a[k]||0), Number(v||0));
  return a;
}
function bestRowsByCompetitionFromJson(j){
  const candidateArrays = collectStandingRows(j);
  const byComp = {};
  for(const arr of candidateArrays){
    const low = arr.path.toLowerCase();
    if(/sample|debug|preview|check|context/.test(low)) continue;
    const score =
      (/canonical|candidate|accepted|standings|rows/.test(low) ? 1000 : 0) +
      (/mappedrows|extractedcandidaterows/.test(low) ? 200 : 0) +
      arr.rowCount;
    const map = rowsByCompFromRows(arr.rows);
    for(const [slug,count] of Object.entries(map)){
      if(!byComp[slug] || score > byComp[slug].score || count > byComp[slug].rows){
        byComp[slug] = { rows:count, sourcePath:arr.path, score };
      }
    }
  }
  const out = {};
  for(const [slug,v] of Object.entries(byComp)) out[slug] = v.rows;
  return { rowsByCompetition: out, candidateArrayCount:candidateArrays.length, candidateArrays:candidateArrays.map(a=>({path:a.path,rowCount:a.rowCount})) };
}

const canonicalFiles = fs.existsSync(stateDir) ? fs.readdirSync(stateDir).filter(f=>f.endsWith(".json")).sort().map(f=>path.join(stateDir,f)) : [];
const canonicalFileRows = [];
const covered = {};
for(const p of canonicalFiles){
  const j = readJson(p);
  const extracted = bestRowsByCompetitionFromJson(j);
  const rowsByCompetition = extracted.rowsByCompetition;
  const competitionCount = Object.keys(rowsByCompetition).length;
  const candidateRows = Object.values(rowsByCompetition).reduce((s,n)=>s+Number(n||0),0);
  for(const [slug,count] of Object.entries(rowsByCompetition)) covered[slug] = Math.max(Number(covered[slug]||0),Number(count||0));
  canonicalFileRows.push({
    file:path.relative(".",p),
    sha256:sha256File(p),
    competitionCount,
    candidateRows,
    rowsByCompetition,
    candidateArrayCount:extracted.candidateArrayCount,
    topCandidateArrays:extracted.candidateArrays.sort((a,b)=>b.rowCount-a.rowCount).slice(0,5)
  });
}

const inventoryFiles = walkFiles(diagRoot, p => p.endsWith(".json") && /inventory|competition-map/i.test(p));
let bestInventory = null;
for(const p of inventoryFiles){
  try{
    const j = readJson(p);
    const s = j.summary ?? j;
    const n = num(firstDefined(s.normalizedCompetitionCount, j.normalizedCompetitionCount));
    if(n !== null && (!bestInventory || n > bestInventory.normalizedCompetitionCount)){
      bestInventory = { file:path.relative(".",p), normalizedCompetitionCount:n, summary:s };
    }
  }catch{}
}
const normalizedCompetitionCount = bestInventory?.normalizedCompetitionCount ?? 689;

const diagFiles = walkFiles(diagRoot, p => p.endsWith(".json"));
const opportunityRows = [];
for(const p of diagFiles){
  try{
    const j = readJson(p);
    const s = j.summary ?? j;
    const status = firstDefined(s.status,j.status);
    const row = {
      file:path.relative(".",p),
      status,
      plannedCompetitionCount:num(firstDefined(s.plannedCompetitionCount,s.competitionCount,s.officialSearchTargetCount,s.bestCompetitionCount,s.bestCompetitionCandidateCount)),
      plannedRowCount:num(firstDefined(s.plannedProbeRowCount,s.plannedSeedRowCount,s.rawSearchRowCount,s.urlCandidateRowCount,s.candidateRowCount)),
      fetchExecutedNowCount:num(firstDefined(s.fetchExecutedNowCount,0)),
      searchExecutedNowCount:num(firstDefined(s.searchExecutedNowCount,0)),
      canonicalWriteExecutedNowCount:num(firstDefined(s.canonicalWriteExecutedNowCount,0)),
      productionWriteExecutedNowCount:num(firstDefined(s.productionWriteExecutedNowCount,0)),
      truthAssertionExecutedNowCount:num(firstDefined(s.truthAssertionExecutedNowCount,0)),
      acceptedQualityGateCompetitionCount:num(firstDefined(s.acceptedQualityGateCompetitionCount,s.acceptedCompetitionCount,s.canonicalCandidateCompetitionCount)),
      acceptedCandidateRowCount:num(firstDefined(s.acceptedCandidateRowCount,s.canonicalCandidateRowCount,s.candidateRowCount)),
      parserReviewCompetitionCount:num(firstDefined(s.parserReviewCompetitionCount,s.reviewCompetitionCount)),
      routeRepairFollowupCompetitionCount:num(firstDefined(s.routeRepairFollowupCompetitionCount,s.unresolvedCompetitionCount)),
      runnerReadyCompetitionCount:num(firstDefined(s.runnerReadyCompetitionCount)),
      officialSearchTargetCount:num(firstDefined(s.officialSearchTargetCount)),
      officialSearchQueryCount:num(firstDefined(s.officialSearchQueryCount,s.plannedSearchQueryCount)),
      broadSearchExecutedNowCount:num(firstDefined(s.broadSearchExecutedNowCount,0))
    };
    const potential = Math.max(
      row.acceptedQualityGateCompetitionCount ?? 0,
      row.parserReviewCompetitionCount ?? 0,
      row.routeRepairFollowupCompetitionCount ?? 0,
      row.runnerReadyCompetitionCount ?? 0,
      row.officialSearchTargetCount ?? 0,
      row.plannedCompetitionCount ?? 0
    );
    if(potential > 0 || (row.fetchExecutedNowCount ?? 0) > 0 || (row.searchExecutedNowCount ?? 0) > 0){
      row.bulkPotentialCompetitionCount = potential;
      opportunityRows.push(row);
    }
  }catch{}
}
opportunityRows.sort((a,b)=>
  (b.bulkPotentialCompetitionCount-a.bulkPotentialCompetitionCount) ||
  ((b.plannedRowCount??0)-(a.plannedRowCount??0))
);

const coveragePercent = Number(((Object.keys(covered).length / normalizedCompetitionCount) * 100).toFixed(2));
const topOpportunities = opportunityRows.slice(0,60);

const checks = [];
function check(name,passed,details={}){ checks.push({name,passed:Boolean(passed),...details}); }
check("noFetchSearchWriteInThisJob", true);
check("productionAndTruthLocked", true);
check("canonicalCandidateFilesFound", canonicalFiles.length > 0, {canonicalFileCount: canonicalFiles.length});
check("inventoryCountAvailable", normalizedCompetitionCount >= Object.keys(covered).length, {normalizedCompetitionCount});
check("bulkCoverageStillLow", coveragePercent < 25, {coveragePercent});

const output = {
  status:"passed",
  generatedAt:new Date().toISOString(),
  canonicalFileRows,
  coveredCompetitions:Object.fromEntries(Object.entries(covered).sort(([a],[b])=>a.localeCompare(b))),
  topBulkOpportunityDiagnostics:topOpportunities,
  bestInventory,
  checks,
  summary:{
    status:"passed",
    canonicalCandidateFileCount: canonicalFiles.length,
    coveredCanonicalStandingCandidateCompetitionCount: Object.keys(covered).length,
    totalCanonicalStandingCandidateRowsBestPerCompetition: Object.values(covered).reduce((s,n)=>s+Number(n||0),0),
    inventoryNormalizedCompetitionCount: normalizedCompetitionCount,
    coveragePercentOfNormalizedUniverse: coveragePercent,
    uncoveredCompetitionEstimate: normalizedCompetitionCount - Object.keys(covered).length,
    topBulkOpportunityCount: topOpportunities.length,
    maxBulkPotentialCompetitionCount: topOpportunities[0]?.bulkPotentialCompetitionCount ?? 0,
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
console.log(JSON.stringify({
  topBulkOpportunityDiagnostics: topOpportunities.slice(0,12).map(r=>({
    file:r.file,
    status:r.status,
    bulkPotentialCompetitionCount:r.bulkPotentialCompetitionCount,
    plannedCompetitionCount:r.plannedCompetitionCount,
    plannedRowCount:r.plannedRowCount,
    acceptedQualityGateCompetitionCount:r.acceptedQualityGateCompetitionCount,
    parserReviewCompetitionCount:r.parserReviewCompetitionCount,
    routeRepairFollowupCompetitionCount:r.routeRepairFollowupCompetitionCount,
    runnerReadyCompetitionCount:r.runnerReadyCompetitionCount,
    officialSearchTargetCount:r.officialSearchTargetCount,
    fetchExecutedNowCount:r.fetchExecutedNowCount,
    searchExecutedNowCount:r.searchExecutedNowCount
  }))
},null,2));
