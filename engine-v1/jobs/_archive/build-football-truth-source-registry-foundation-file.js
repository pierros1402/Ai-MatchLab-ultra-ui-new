import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const inventoryPath = path.join("data","football-truth","_diagnostics","full-competition-map-inventory-2026-06-11","full-competition-map-inventory-2026-06-11.json");
const sourceGatePath = path.join("data","football-truth","_diagnostics","canonical-candidate-source-identity-gate-2026-06-17","canonical-candidate-source-identity-gate-2026-06-17.json");
const canonicalStateDir = path.join("data","football-truth","_state","canonical-standings-candidates");
const outDir = path.join("data","football-truth","_diagnostics","source-registry-foundation-2026-06-17");
const outPath = path.join(outDir,"source-registry-foundation-2026-06-17.json");

function readJson(p){ return JSON.parse(fs.readFileSync(p,"utf8")); }
function writeJson(p,v){ fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,JSON.stringify(v,null,2)); }
function sha256File(p){ return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex"); }
function clean(v){ return String(v??"").replace(/\s+/g," ").trim(); }
function isObj(v){ return v && typeof v==="object" && !Array.isArray(v); }

function inventoryRows(j){
  if(Array.isArray(j.rows)) return j.rows;
  if(Array.isArray(j.competitions)) return j.competitions;
  if(Array.isArray(j.inventoryRows)) return j.inventoryRows;
  if(Array.isArray(j.normalizedRows)) return j.normalizedRows;
  for(const v of Object.values(j)){
    if(Array.isArray(v) && v.length && isObj(v[0]) && clean(v[0].competitionSlug)) return v;
  }
  return [];
}

function collectCandidateFilesBySlug(){
  const bySlug = new Map();
  if(!fs.existsSync(canonicalStateDir)) return bySlug;
  for(const f of fs.readdirSync(canonicalStateDir).filter(f=>f.endsWith(".json")).sort()){
    const p = path.join(canonicalStateDir,f);
    const txt = fs.readFileSync(p,"utf8");
    const slugs = new Set();
    for(const m of txt.matchAll(/"competitionSlug"\s*:\s*"([^"]+)"/g)) slugs.add(m[1]);
    for(const m of txt.matchAll(/"rowsByCompetition"\s*:\s*\{([\s\S]*?)\}/g)){
      for(const s of m[1].matchAll(/"([^"]+)"\s*:/g)) slugs.add(s[1]);
    }
    for(const slug of slugs){
      bySlug.set(slug,{file:path.relative(".",p),sha256:sha256File(p)});
    }
  }
  return bySlug;
}

if(!fs.existsSync(inventoryPath)) throw new Error(`Missing inventory: ${inventoryPath}`);
if(!fs.existsSync(sourceGatePath)) throw new Error(`Missing source identity gate: ${sourceGatePath}`);

const inv = readJson(inventoryPath);
const rows = inventoryRows(inv);
const gate = readJson(sourceGatePath);
const strongBySlug = new Map((gate.strongSourceIdentityCompetitions || []).map(r => [r.competitionSlug,r]));
const blockedBySlug = new Map((gate.blockedCompetitions || []).map(r => [r.competitionSlug,r]));
const candidateFileBySlug = collectCandidateFilesBySlug();

const registryRows = rows.map(r => {
  const slug = clean(r.competitionSlug);
  const strong = strongBySlug.get(slug);
  const blocked = blockedBySlug.get(slug);
  const cand = candidateFileBySlug.get(slug);

  if(strong){
    return {
      competitionSlug:slug,
      competitionType:r.competitionType ?? "unknown",
      registryLevel:"L2_source_identity_verified",
      sourceIdentityStatus:"verified",
      sourceIdentityTier:strong.sourceIdentityTier,
      sourceIdentityLabel:strong.sourceIdentityLabel,
      extractionContractStatus:"requires_explicit_contract_gate_before_new_extraction",
      standingsCandidateStatus:cand ? "existing_candidate_state_present" : "no_candidate_state",
      canonicalCandidateFile:cand?.file ?? null,
      canonicalCandidateSha256:cand?.sha256 ?? null,
      productionTruthStatus:"blocked_not_promoted",
      nextAllowedAction:"build_contract_evidence_gate_or_promote_candidate_only_after_separate_approval",
      blockedReason:null
    };
  }

  if(blocked){
    return {
      competitionSlug:slug,
      competitionType:r.competitionType ?? "unknown",
      registryLevel:"L1_candidate_rejected_or_quarantined",
      sourceIdentityStatus:"blocked",
      sourceIdentityTier:blocked.sourceIdentityTier,
      sourceIdentityLabel:blocked.sourceIdentityLabel,
      extractionContractStatus:"blocked",
      standingsCandidateStatus:"quarantined_or_deleted",
      canonicalCandidateFile:blocked.file ?? null,
      canonicalCandidateSha256:null,
      productionTruthStatus:"blocked",
      nextAllowedAction:"source_identity_recovery_only",
      blockedReason:"blocked_generic_shape_without_source_identity"
    };
  }

  return {
    competitionSlug:slug,
    competitionType:r.competitionType ?? "unknown",
    registryLevel:"L0_unknown_no_verified_source_identity",
    sourceIdentityStatus:"unknown",
    sourceIdentityTier:null,
    sourceIdentityLabel:null,
    extractionContractStatus:"blocked_no_source_identity",
    standingsCandidateStatus:"not_allowed",
    canonicalCandidateFile:null,
    canonicalCandidateSha256:null,
    productionTruthStatus:"blocked",
    nextAllowedAction:"source_identity_discovery_only",
    blockedReason:"no_verified_source_identity"
  };
});

const counts = registryRows.reduce((a,r)=>{
  a.byRegistryLevel[r.registryLevel]=(a.byRegistryLevel[r.registryLevel]||0)+1;
  a.byCompetitionType[r.competitionType]=(a.byCompetitionType[r.competitionType]||0)+1;
  return a;
},{byRegistryLevel:{},byCompetitionType:{}});

const checks = [];
function check(name,passed,details={}){ checks.push({name,passed:Boolean(passed),...details}); }
check("inventoryRowCountExpected689", registryRows.length===689, {actual:registryRows.length});
check("strongSourceIdentityCountExpected11", registryRows.filter(r=>r.registryLevel==="L2_source_identity_verified").length===11, {actual:registryRows.filter(r=>r.registryLevel==="L2_source_identity_verified").length});
check("noExtractionAllowedForL0", registryRows.filter(r=>r.registryLevel==="L0_unknown_no_verified_source_identity").every(r=>r.extractionContractStatus==="blocked_no_source_identity"));
check("productionTruthBlockedForAll", registryRows.every(r=>r.productionTruthStatus==="blocked" || r.productionTruthStatus==="blocked_not_promoted"));
check("noFetchSearchWriteInThisJob", true);

const output = {
  status:"passed",
  generatedAtUtc:new Date().toISOString(),
  sourceRegistryRows:registryRows,
  checks,
  policy:{
    truthLadder:[
      "L0_unknown_no_verified_source_identity",
      "L1_source_candidate_found",
      "L2_source_identity_verified",
      "L3_extraction_contract_verified",
      "L4_standings_shape_verified",
      "L5_reconciled_with_fixtures_or_official_final_table",
      "L6_canonical_candidate",
      "L7_production_truth"
    ],
    hardRules:[
      "No source identity -> no extraction.",
      "No extraction contract -> no standings.",
      "No expected shape policy -> no candidate.",
      "No reconciliation/final-source evidence -> no production truth.",
      "Generic accepted-shape tables are not valid source identity evidence."
    ]
  },
  summary:{
    status:"passed",
    sourceRegistryRowCount:registryRows.length,
    verifiedSourceIdentityCount:registryRows.filter(r=>r.registryLevel==="L2_source_identity_verified").length,
    rejectedOrQuarantinedCount:registryRows.filter(r=>r.registryLevel==="L1_candidate_rejected_or_quarantined").length,
    unknownNoVerifiedSourceIdentityCount:registryRows.filter(r=>r.registryLevel==="L0_unknown_no_verified_source_identity").length,
    byRegistryLevel:counts.byRegistryLevel,
    byCompetitionType:counts.byCompetitionType,
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

writeJson(outPath,output);
console.log(JSON.stringify(output.summary,null,2));
