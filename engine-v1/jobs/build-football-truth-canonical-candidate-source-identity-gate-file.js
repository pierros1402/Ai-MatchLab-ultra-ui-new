import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const stateDir = path.join("data","football-truth","_state","canonical-standings-candidates");
const outDir = path.join("data","football-truth","_diagnostics","canonical-candidate-source-identity-gate-2026-06-17");
const outPath = path.join(outDir,"canonical-candidate-source-identity-gate-2026-06-17.json");

function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8")); }
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }
function sha256File(p){ return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"); }
function clean(v){ return String(v??"").replace(/\s+/g," ").trim(); }
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

function collectCompetitionSlugs(j){
  const slugs = new Set();
  for(const arr of collectRows(j)){
    for(const r of arr){
      const slug = clean(r.competitionSlug || r.slug);
      if(slug) slugs.add(slug);
    }
  }
  if(j.rowsByCompetition && isObj(j.rowsByCompetition)){
    for(const k of Object.keys(j.rowsByCompetition)) slugs.add(k);
  }
  if(j.summary?.rowsByCompetition && isObj(j.summary.rowsByCompetition)){
    for(const k of Object.keys(j.summary.rowsByCompetition)) slugs.add(k);
  }
  return [...slugs].sort();
}

function classifyFile(fileName, text){
  const lowerName = fileName.toLowerCase();
  const lowerText = text.toLowerCase();

  if(lowerName.includes("laliga-full-table")){
    return {
      sourceIdentityStatus:"strong_source_identity_candidate",
      sourceIdentityTier:"official_league_family",
      sourceIdentityLabel:"LaLiga official full-table candidate",
      productionTruthAllowedNow:false
    };
  }

  if(lowerName.includes("norway-ntf")){
    return {
      sourceIdentityStatus:"strong_source_identity_candidate",
      sourceIdentityTier:"official_league_family",
      sourceIdentityLabel:"Norway NTF official route/table candidate",
      productionTruthAllowedNow:false
    };
  }

  if(lowerName.includes("bundesliga-official")){
    return {
      sourceIdentityStatus:"strong_source_identity_candidate",
      sourceIdentityTier:"official_league_family",
      sourceIdentityLabel:"Bundesliga official standings candidate",
      productionTruthAllowedNow:false
    };
  }

  if(lowerName.includes("sportomedia-sweden")){
    return {
      sourceIdentityStatus:"strong_source_identity_candidate",
      sourceIdentityTier:"official_site_provider_contract",
      sourceIdentityLabel:"Sweden Sportomedia official-site provider candidate",
      productionTruthAllowedNow:false
    };
  }

  if(lowerName.includes("official-domain-seed-austria")){
    return {
      sourceIdentityStatus:"strong_source_identity_candidate",
      sourceIdentityTier:"official_domain_seed",
      sourceIdentityLabel:"Austria official-domain seed candidate",
      productionTruthAllowedNow:false
    };
  }

  if(lowerName.includes("official-domain-seed-finland")){
    return {
      sourceIdentityStatus:"strong_source_identity_candidate",
      sourceIdentityTier:"official_domain_seed",
      sourceIdentityLabel:"Finland official-domain seed candidate",
      productionTruthAllowedNow:false
    };
  }

  if(lowerName.includes("whole-map-high-volume-accepted-shape")){
    return {
      sourceIdentityStatus:"blocked_generic_shape_needs_source_identity",
      sourceIdentityTier:"generic_accepted_shape_only",
      sourceIdentityLabel:"Generic accepted-shape candidate lacks explicit source identity gate",
      productionTruthAllowedNow:false
    };
  }

  const hasOfficialSignal = /official|sourceurl|sourceurl|officialdomain|official_domain|league official|federation|bundesliga|laliga|sportomedia|ntf/.test(lowerText);
  if(hasOfficialSignal){
    return {
      sourceIdentityStatus:"review_source_identity_signal_present",
      sourceIdentityTier:"review_required",
      sourceIdentityLabel:"Source identity signal present but not mapped to approved family",
      productionTruthAllowedNow:false
    };
  }

  return {
    sourceIdentityStatus:"blocked_missing_source_identity",
    sourceIdentityTier:"missing_source_identity",
    sourceIdentityLabel:"No explicit source identity evidence found",
    productionTruthAllowedNow:false
  };
}

const files = fs.existsSync(stateDir) ? fs.readdirSync(stateDir).filter(f=>f.endsWith(".json")).sort() : [];
const fileRows = [];

for(const f of files){
  const p = path.join(stateDir,f);
  const text = fs.readFileSync(p,"utf8");
  const j = JSON.parse(text);
  const slugs = collectCompetitionSlugs(j);
  const classification = classifyFile(f,text);
  fileRows.push({
    file:path.relative(".",p),
    sha256:sha256File(p),
    competitionSlugs:slugs,
    competitionCount:slugs.length,
    ...classification
  });
}

const competitionRows = [];
for(const f of fileRows){
  for(const slug of f.competitionSlugs){
    competitionRows.push({
      competitionSlug:slug,
      file:f.file,
      sourceIdentityStatus:f.sourceIdentityStatus,
      sourceIdentityTier:f.sourceIdentityTier,
      sourceIdentityLabel:f.sourceIdentityLabel,
      productionTruthAllowedNow:f.productionTruthAllowedNow
    });
  }
}

const statusCounts = competitionRows.reduce((a,r)=>{a[r.sourceIdentityStatus]=(a[r.sourceIdentityStatus]||0)+1;return a;},{});
const tierCounts = competitionRows.reduce((a,r)=>{a[r.sourceIdentityTier]=(a[r.sourceIdentityTier]||0)+1;return a;},{});

const blocked = competitionRows.filter(r => r.sourceIdentityStatus.startsWith("blocked_"));
const strong = competitionRows.filter(r => r.sourceIdentityStatus === "strong_source_identity_candidate");

const output = {
  status:"passed",
  generatedAtUtc:new Date().toISOString(),
  fileRows,
  competitionRows,
  blockedCompetitions:blocked,
  strongSourceIdentityCompetitions:strong,
  summary:{
    status:"passed",
    canonicalCandidateFileCount:fileRows.length,
    canonicalCandidateCompetitionCount:competitionRows.length,
    strongSourceIdentityCompetitionCount:strong.length,
    blockedSourceIdentityCompetitionCount:blocked.length,
    reviewRequiredCompetitionCount:competitionRows.filter(r => r.sourceIdentityStatus.includes("review")).length,
    productionTruthAllowedNowCount:competitionRows.filter(r => r.productionTruthAllowedNow).length,
    statusCounts,
    tierCounts,
    fetchExecutedNowCount:0,
    searchExecutedNowCount:0,
    broadSearchExecutedNowCount:0,
    canonicalWriteExecutedNowCount:0,
    productionWriteExecutedNowCount:0,
    truthAssertionExecutedNowCount:0
  },
  policy:{
    noWriteInThisGate:true,
    candidateStateKeepDoesNotMeanProductionTruth:true,
    blockedSourceIdentityMustBeQuarantinedOrDeletedBeforeProduction:true,
    productionTruthRequiresSeparateExplicitApprovalAndEvidence:true
  }
};

writeJson(outPath,output);
console.log(JSON.stringify(output.summary,null,2));
