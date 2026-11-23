// Read-only source-bound audit of accumulated league results memory.
// A live 7-10 day feed cannot recreate the full historical FORM window.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";
import {auditHistorical954} from "./audit-daily954-stage20-history.mjs";
export const RESULTS_CUSTODY_SCHEMA="ai-matchlab.stage20-league-result-memory-custody.v1";
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
function check(ok,reason){if(!ok)throw Error(reason);}
export function inspectResultsMemoryWriter(source) {
  check(typeof source==="string" && [
    'resolveDataPath("league-memory", "results")',
    "export function recordMatchResult(",
    "export function teamFormRates(",
    "applyMatchLevelRetention",
    "bindProductionResultIdentity",
    "PER_TEAM_CAP",
    "MAX_AGE_DAYS",
    "fs.writeFileSync("
  ].every(s=>source.includes(s)),"results_memory_source_contract_mismatch");
  return {sourceSha256:sha(source),
    historyAccumulation:"per-league-append-with-retention",
    valueFormInput:true,liveFeedRebuildEquivalenceProven:false,
    stage20OmissionAuthorized:false,resumeAuthorized:false};
}
export function summarizeResultsMemoryRows(rows,root){
  check(Array.isArray(rows) && typeof root==="string","results_memory_invalid_input");
  let files=0,bytes=0,validPayloads=0,invalidPaths=0,
    invalidShape=0,teamKeys=0,resultRows=0,missingCanonicalIdRows=0,
    emptyTeamMaps=0;
  const seen=new Set();
  for(const item of rows){
    const p=item?.path;
    check(typeof p==="string" && p.startsWith("data/league-memory/results/") &&
      !p.includes("\\") && !p.includes("\0") &&
      p.split("/").every(s=>s&&s!=="."&&s!=="..") && !seen.has(p),
      "results_memory_path_invalid");
    seen.add(p);
    files++;
    if(!/^data\/league-memory\/results\/[A-Za-z0-9._-]+\.json$/.test(p)) {
      invalidPaths++;continue;
    }
    const data=fs.readFileSync(path.join(root,p));
    check(data.length===item.bytes && sha(data)===item.sha256,
      "results_memory_historical_bytes_mismatch");
    bytes+=data.length;
    let obj;
    try{obj=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(data));}
    catch{invalidShape++;continue;}
    if(!obj || typeof obj!=="object" || Array.isArray(obj) ||
      !obj.teams || typeof obj.teams!=="object" ||
      Array.isArray(obj.teams)){
      invalidShape++;continue;
    }
    validPayloads++;
    const teams=Object.values(obj.teams);
    teamKeys+=teams.length;
    if(!teams.length)emptyTeamMaps++;
    for(const matches of teams){
      if(!Array.isArray(matches)){invalidShape++;continue;}
      resultRows+=matches.length;
      for(const m of matches)
        if(!m?.canonicalId && !String(m?.matchId||"").startsWith("cid_"))
          missingCanonicalIdRows++;
    }
  }
  return {
    files,bytes,validPayloads,invalidPaths,invalidShape,teamKeys,resultRows,
    emptyTeamMaps,missingCanonicalIdRows,
    originalRowsSourceHashVerified:true,
    resultIdentityTruthIndependentlyVerified:false,
    dynamicRebuildEquivalent:false,
    requireExactResultsMemoryBaseline:true,
    omissionAuthorized:false,resumeAuthorized:false,publicationAuthorized:false
  };
}
export function auditHistoricalResultsMemory(root,sourceRoot){
  const archive=auditHistorical954(root);
  check(archive.files===9083 && archive.bytes===428113899,
    "results_memory_unbound_archive");
  const source=inspectResultsMemoryWriter(fs.readFileSync(
    path.join(sourceRoot,"engine-v1/storage/results-memory-db.js"),"utf8"));
  const manifest=JSON.parse(fs.readFileSync(path.join(root,"manifest.json"),"utf8"));
  const rows=manifest.files.filter(r=>r.path.startsWith("data/league-memory/results/"));
  // Read-only path topology to locate the actual archived producer namespace.
  // No file payloads, league slugs or full paths printed.
  const allLeague=manifest.files.filter(r=>r.path.startsWith("data/league-memory/"));
  const topology={};
  for(const row of allLeague){
    const segments=row.path.split("/");
    const k=segments.length===3?"(root-file)":segments[2]+"/";
    topology[k]=(topology[k]||0)+1;
  }
  console.log("STAGE20_LEAGUE_TOPOLOGY="+JSON.stringify({total:allLeague.length,groups:topology}));
  const report=summarizeResultsMemoryRows(rows,root);
  check(report.files===98 && report.invalidPaths===0 && report.invalidShape===0 &&
    report.validPayloads===98,"results_memory_historical_shape_incomplete:"+JSON.stringify({files:report.files,validPayloads:report.validPayloads,invalidPaths:report.invalidPaths,invalidShape:report.invalidShape}));
  return {
    schema:RESULTS_CUSTODY_SCHEMA,dayKey:archive.dayKey,
    sourceManifestSha256:archive.manifestSha256,writer:source,...report,
    readOnly:true,productionWrites:0
  };
}
const invoked=process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  try {
    check(process.argv.length===4 && path.isAbsolute(process.argv[2]) &&
      path.isAbsolute(process.argv[3]),"results_memory_absolute_roots_required");
    console.log("STAGE20_RESULTS_MEMORY_CUSTODY="+JSON.stringify(
      auditHistoricalResultsMemory(process.argv[2],process.argv[3])));
  }catch(e){console.error("STAGE20_RESULTS_MEMORY_DENIED="+String(e.message||e));process.exitCode=1;}
}
