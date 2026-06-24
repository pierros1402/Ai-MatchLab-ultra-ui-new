import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const stateDir = path.join("data","football-truth","_state","canonical-standings-candidates");
const outDir = path.join("data","football-truth","_diagnostics","strict-canonical-candidate-state-audit-2026-06-17");
const outPath = path.join(outDir,"strict-canonical-candidate-state-audit-2026-06-17.json");

const expectedTeams = {
  "aut.1":12, "aut.2":16,
  "esp.1":20, "esp.2":22,
  "fin.1":12,
  "ger.1":18, "ger.2":18, "ger.3":20,
  "ita.2":20,
  "ned.1":18,
  "nor.1":16, "nor.2":16,
  "sco.1":12, "sco.2":10,
  "swe.1":16, "swe.2":16
};

function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8")); }
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }
function sha256File(p){ return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"); }
function clean(v){ return String(v??"").replace(/\s+/g," ").trim(); }
function n(v){ const x=Number(v); return Number.isFinite(x) ? x : null; }
function isObj(v){ return v && typeof v === "object" && !Array.isArray(v); }

function collectRows(node,out=[]){
  if(Array.isArray(node)){
    const rows = node.filter(r => isObj(r) && clean(r.competitionSlug || r.slug).length && clean(r.teamName || r.team || r.name).length);
    if(rows.length) out.push(rows);
    for(const x of node) collectRows(x,out);
  } else if(isObj(node)){
    for(const v of Object.values(node)) collectRows(v,out);
  }
  return out;
}

function rowSlug(r){ return clean(r.competitionSlug || r.slug); }
function rowTeam(r){ return clean(r.teamName || r.team || r.name); }
function rowPos(r){ return n(r.position ?? r.rank ?? r.pos); }

function auditFile(p){
  const j = readJson(p);
  const arrays = collectRows(j);
  const bySlug = new Map();

  for(const arr of arrays){
    for(const r of arr){
      const slug=rowSlug(r);
      if(!slug) continue;
      if(!bySlug.has(slug)) bySlug.set(slug,[]);
      bySlug.get(slug).push(r);
    }
  }

  const competitions = [];
  for(const [slug,rowsRaw] of bySlug.entries()){
    const seen = new Set();
    const rows = [];
    for(const r of rowsRaw){
      const key = `${rowSlug(r)}||${rowPos(r)}||${rowTeam(r).toLowerCase()}`;
      if(seen.has(key)) continue;
      seen.add(key);
      rows.push(r);
    }

    const teams = rows.map(rowTeam).filter(Boolean);
    const positions = rows.map(rowPos).filter(x=>x!==null);
    const duplicateTeams = teams.filter((t,i)=>teams.indexOf(t)!==i);
    const duplicatePositions = positions.filter((t,i)=>positions.indexOf(t)!==i);
    const missingPositions = expectedTeams[slug] ? Array.from({length:expectedTeams[slug]},(_,i)=>i+1).filter(x=>!positions.includes(x)) : [];

    const provenanceStrings = JSON.stringify(rows.slice(0,3)).toLowerCase() + " " + JSON.stringify(j.summary || {}).toLowerCase();
    const hasSourceIdentity =
      /official|bundesliga|laliga|ntf|sportomedia|torneopal|spfl|accepted_shape|official_domain_seed|source|provenance|sha/.test(provenanceStrings);

    const issues = [];
    if(!expectedTeams[slug]) issues.push("missing_explicit_expected_team_count_policy");
    if(expectedTeams[slug] && rows.length !== expectedTeams[slug]) issues.push(`row_count_mismatch_expected_${expectedTeams[slug]}_actual_${rows.length}`);
    if(teams.length !== rows.length) issues.push("missing_team_names");
    if(new Set(teams.map(t=>t.toLowerCase())).size !== rows.length) issues.push("duplicate_team_names");
    if(expectedTeams[slug] && new Set(positions).size !== rows.length) issues.push("duplicate_or_missing_positions");
    if(expectedTeams[slug] && missingPositions.length) issues.push(`missing_positions_${missingPositions.join("_")}`);
    if(!hasSourceIdentity) issues.push("missing_source_identity_or_provenance_signal");

    let auditStatus = "keep_candidate_state";
    if(issues.length) auditStatus = "quarantine_or_delete_required";

    competitions.push({
      competitionSlug:slug,
      rowCount:rows.length,
      expectedTeams:expectedTeams[slug] ?? null,
      uniqueTeamCount:new Set(teams.map(t=>t.toLowerCase())).size,
      uniquePositionCount:new Set(positions).size,
      auditStatus,
      issues,
      sampleRows:rows.slice(0,3)
    });
  }

  return {
    file:path.relative(".",p),
    sha256:sha256File(p),
    competitionCount:competitions.length,
    rowCount:competitions.reduce((s,c)=>s+c.rowCount,0),
    competitions,
    fileAuditStatus:competitions.some(c=>c.auditStatus!=="keep_candidate_state") ? "quarantine_or_delete_required" : "keep_candidate_state"
  };
}

const files = fs.existsSync(stateDir) ? fs.readdirSync(stateDir).filter(f=>f.endsWith(".json")).sort().map(f=>path.join(stateDir,f)) : [];
const fileRows = files.map(auditFile);
const competitionRows = fileRows.flatMap(f => f.competitions.map(c => ({file:f.file,...c})));
const statusCounts = competitionRows.reduce((a,r)=>{a[r.auditStatus]=(a[r.auditStatus]||0)+1;return a;},{});
const issueCounts = {};
for(const r of competitionRows) for(const i of r.issues) issueCounts[i]=(issueCounts[i]||0)+1;

const output = {
  status:"passed",
  generatedAtUtc:new Date().toISOString(),
  fileRows,
  competitionRows,
  summary:{
    status:"passed",
    canonicalCandidateFileCount:fileRows.length,
    canonicalCandidateCompetitionCount:competitionRows.length,
    keepCandidateCompetitionCount:competitionRows.filter(r=>r.auditStatus==="keep_candidate_state").length,
    quarantineOrDeleteRequiredCompetitionCount:competitionRows.filter(r=>r.auditStatus!=="keep_candidate_state").length,
    statusCounts,
    issueCounts,
    fetchExecutedNowCount:0,
    searchExecutedNowCount:0,
    broadSearchExecutedNowCount:0,
    canonicalWriteExecutedNowCount:0,
    productionWriteExecutedNowCount:0,
    truthAssertionExecutedNowCount:0
  },
  policy:{
    noWriteInThisAudit:true,
    anyDoubtRequiresQuarantineOrDeletion:true,
    productionTruthStillLocked:true
  }
};

writeJson(outPath,output);
console.log(JSON.stringify(output.summary,null,2));
