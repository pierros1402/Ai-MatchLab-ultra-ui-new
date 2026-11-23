// Source-bound root league-memory triage. Print only safe basenames, no
// JSON values, file contents or rights to skip/reconstruct these inputs.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";
import {auditHistorical954} from "./audit-daily954-stage20-history.mjs";
export const LEAGUE_ROOT_SCHEMA="ai-matchlab.stage20-league-root-custody.v1";
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
function check(ok,reason){if(!ok)throw Error(reason);}
const known=Object.freeze({
  "state.json":"storage/league-memory-db.js",
  "standings-url-cache.json":"source-discovery/standings-researcher.js",
  "source-memory.json":"storage/source-memory-db.js"
});
export function classifyLeagueRoot(name,bytes){
  check(typeof name==="string" &&
    /^data\/league-memory\/[A-Za-z0-9._-]+\.json$/.test(name) &&
    !/(secret|credential|password|token|private[-_]?key)/i.test(name),
    "stage20_league_root_unsafe_name");
  let obj;
  try{obj=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}
  catch{return {name:"(invalid-json)",kind:"invalid",verifiedJson:false};}
  const base=name.split("/").at(-1);
  return {name:base,kind:known[base]||"unknown-producer",
    verifiedJson:obj!==null && typeof obj==="object" && !Array.isArray(obj)};
}
export function auditHistoricalLeagueRoot(root,sourceRoot){
  const original=auditHistorical954(root);
  check(original.files===9083 && original.bytes===428113899,
    "stage20_league_root_archive_unbound");
  const manifest=JSON.parse(fs.readFileSync(path.join(root,"manifest.json"),"utf8"));
  const rows=manifest.files.filter(r=>
    r.path.startsWith("data/league-memory/") && r.path.split("/").length===3);
  check(rows.length===3,"stage20_league_root_count_mismatch");
  const details=[];
  for(const r of rows){
    const raw=fs.readFileSync(path.join(root,r.path));
    check(raw.length===r.bytes && sha(raw)===r.sha256,
      "stage20_league_root_bytes_changed");
    details.push(classifyLeagueRoot(r.path,raw));
  }
  const stateSource=fs.readFileSync(
    path.join(sourceRoot,"engine-v1/storage/league-memory-db.js"),"utf8");
  const urlSource=fs.readFileSync(
    path.join(sourceRoot,"engine-v1/source-discovery/standings-researcher.js"),"utf8");
  const reliabilitySource=fs.readFileSync(
    path.join(sourceRoot,"engine-v1/storage/source-memory-db.js"),"utf8");
  check(stateSource.includes('resolveDataPath("league-memory", "state.json")') &&
    stateSource.includes("export function writeLeagueState(") &&
    urlSource.includes('resolveDataPath("league-memory", "standings-url-cache.json")') &&
    urlSource.includes("function writeUrlCache(") &&
    reliabilitySource.includes('resolveDataPath("league-memory", "source-memory.json")') &&
    reliabilitySource.includes("export function recordSourceSuccess(") &&
    reliabilitySource.includes("export function recordSourceFailure("),
    "stage20_league_root_source_contract_changed");
  const counts={sourceMapped:details.filter(x=>x.kind.includes(".js")).length,
    unmapped:details.filter(x=>x.kind==="unknown-producer").length,
    invalid:details.filter(x=>!x.verifiedJson).length};
  check(counts.invalid===0,"stage20_league_root_json_invalid");
  return {
    schema:LEAGUE_ROOT_SCHEMA,dayKey:original.dayKey,
    originalManifestSha256:original.manifestSha256,
    sourceHashes:{leagueState:sha(stateSource),urlCache:sha(urlSource),
      sourceReliability:sha(reliabilitySource)},
    files:details.sort((a,b)=>a.name.localeCompare(b.name)),
    counts,allRootFilesVerified:true,
    sourceAuthorityComplete:counts.unmapped===0,
    omissionAuthorized:false,resumeAuthorized:false,
    productionWrites:0,publicationAuthorized:false
  };
}
const invoked=process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  try{
    check(process.argv.length===4 && path.isAbsolute(process.argv[2]) &&
      path.isAbsolute(process.argv[3]),"stage20_league_root_absolute_roots_required");
    console.log("STAGE20_LEAGUE_ROOT_CUSTODY="+JSON.stringify(
      auditHistoricalLeagueRoot(process.argv[2],process.argv[3])));
  }catch(e){console.error("STAGE20_LEAGUE_ROOT_DENIED="+String(e.message||e));process.exitCode=1;}
}
