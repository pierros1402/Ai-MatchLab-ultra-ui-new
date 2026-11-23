// Historical writer-path classification only. A path match is not proof of
// actual writer identity, provider authenticity, freshness or safe stage reuse.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {auditHistoricalAcquisition} from "./audit-stage20-value-acquisition-census.mjs";
const prefix="data/value-data-acquisition/";
const allowedSegment=/^[a-zA-Z0-9_.-]+$/;
export function classifyAcquisitionWriterPath(p){
  if(typeof p!=="string"||!p.startsWith(prefix))return "unattributed";
  const parts=p.slice(prefix.length).split("/");
  if(parts.some(x=>!allowedSegment.test(x)||x==="."||x===".."))return "unattributed";
  if(parts.length===1){
    if(parts[0]==="queue.json")return "alarm_queue";
    if(/^20\d\d-\d\d-\d\d\.json$/.test(parts[0]))return "alarm_day_report";
    return "unattributed";
  }
  if(parts.length!==2||!/^20\d\d-\d\d-\d\d$/.test(parts[0]))return "unattributed";
  const f=parts[1];
  if(f==="verified-history-recovery.report.research.json")return "verified_history_report";
  if(/^[a-zA-Z0-9_.-]+\.primary-contract\.research\.json$/.test(f))return "primary_contract";
  if(/^[a-zA-Z0-9_.-]+\.primary\.research\.json$/.test(f))return "primary_standings";
  if(/^[a-zA-Z0-9_.-]+\.team-[a-zA-Z0-9_.-]+\.[a-zA-Z0-9_.-]+\.results\.research\.json$/.test(f))return "team_competition_results";
  if(/^[a-zA-Z0-9_.-]+\.team-[a-zA-Z0-9_.-]+\.research\.json$/.test(f))return "team_history";
  if(/^[a-zA-Z0-9_.-]+\.results\.research\.json$/.test(f))return "league_results";
  if(/^[a-zA-Z0-9_.-]+\.research\.json$/.test(f))return "league_standings";
  return "unattributed";
}
export function aggregateAcquisitionWriterPaths(paths){
  if(!Array.isArray(paths)||new Set(paths).size!==paths.length)throw Error("writer_paths_invalid");
  const tally={};
  for(const p of paths){const kind=classifyAcquisitionWriterPath(p);tally[kind]=(tally[kind]||0)+1;}
  return {writerPathCategories:Object.fromEntries(Object.entries(tally).sort()),
    patternMatches:paths.length-(tally.unattributed||0),unattributedPaths:tally.unattributed||0,
    currentWriterPathMatchIsNotProducerAttestation:true,
    originalWriterBlob:"c6faf0f18af5da26f6fbf0b09db68be8ef022131",
    originalSourceCommit:"5133d9ff8623dd015c6578d89e34b7a5da0b12a0",
    writer:"engine-v1/jobs/run-value-data-alarm-day.js",
    dynamicDependencyClosureVerified:false,externalProviderEquivalenceProven:false,
    freshnessVerified:false,resumeAuthorized:false,productionWrites:0};
}
export function auditAcquisitionWriterPaths(root){
  const a=auditHistoricalAcquisition(root);
  const doc=JSON.parse(fs.readFileSync(path.join(root,"manifest.json"),"utf8"));
  const paths=doc.files.filter(x=>x.path.startsWith(prefix)).map(x=>x.path);
  if(paths.length!==a.files)throw Error("writer_scope_mismatch");
  return {schema:"ai-matchlab.stage20-acquisition-writer-path-audit.v1",
    dayKey:a.dayKey,sourceManifestSha256:a.originalManifestSha256,
    originalFiles:a.files,originalBytes:a.bytes,...aggregateAcquisitionWriterPaths(paths)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv.length!==3||!path.isAbsolute(process.argv[2]))throw Error("absolute_root_required");
    console.log("STAGE20_VALUE_WRITER_PATHS="+JSON.stringify(auditAcquisitionWriterPaths(process.argv[2])));
  }catch(e){console.error("STAGE20_VALUE_WRITER_PATHS_DENIED="+e.message);process.exitCode=1;}
}
