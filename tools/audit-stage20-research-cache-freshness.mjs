// Independent reference-time audit of short-lived external research cache.
// Immutable archive integrity is distinct from 180-minute runtime cache validity.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {auditHistorical954} from "./audit-daily954-stage20-history.mjs";
import {inspectResearchCacheEnvelope} from "./audit-stage20-research-cache-writer-envelopes.mjs";
export const RESEARCH_CACHE_TTL_MINUTES=180;
export const FIXED_REVIEW_INSTANT="2026-11-23T17:00:00.000Z";
const PREFIX="data/research-cache/";
function check(ok,reason){if(!ok)throw Error(reason);}
export function classifyResearchCacheFreshness(record,referenceIso) {
  if(!inspectResearchCacheEnvelope(record).ok)
    return {reusable:false,reason:"invalid_cache_envelope"};
  const now=Date.parse(referenceIso);
  if(!Number.isFinite(now) || typeof referenceIso!=="string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(referenceIso))
    return {reusable:false,reason:"invalid_reference_time"};
  const ageMs=now-record.meta.fetchedAtTs;
  if(ageMs<0)return {reusable:false,reason:"future_dated_cache"};
  if(ageMs>RESEARCH_CACHE_TTL_MINUTES*60000)
    return {reusable:false,reason:"expired_cache"};
  return {reusable:true,reason:null};
}
export function auditHistoricalResearchCacheFreshness(root,referenceIso=FIXED_REVIEW_INSTANT) {
  const source=auditHistorical954(root);
  check(source.files===9083 && source.bytes===428113899 &&
    source.manifestSha256==="12c19ca0c9c97aca10c25fe62f3184ceaa02d87b5e9d66fa4340e0d5589ce1c0",
    "cache_freshness_archive_not_bound");
  const manifest=JSON.parse(fs.readFileSync(path.join(root,"manifest.json"),"utf8"));
  const files=manifest.files.filter(x=>x.path.startsWith(PREFIX));
  check(files.length===349,"cache_freshness_count_invalid");
  const totals={reusable:0,expired_cache:0,future_dated_cache:0,
    invalid_cache_envelope:0,invalid_reference_time:0};
  for(const item of files) {
    check(/^data\/research-cache\/cid_[a-z0-9_]+\.json$/.test(item.path),
      "cache_freshness_path_invalid");
    const doc=JSON.parse(fs.readFileSync(path.join(root,item.path),"utf8"));
    const state=classifyResearchCacheFreshness(doc,referenceIso);
    totals[state.reusable?"reusable":state.reason]++;
  }
  check(Object.values(totals).reduce((n,x)=>n+x,0)===349,"cache_freshness_not_complete");
  return {
    schema:"ai-matchlab.daily954-stage20-research-cache-freshness-hold.v1",
    dayKey:source.dayKey,sourceRunId:source.runId,
    sourceManifestSha256:source.manifestSha256,
    writerPath:"engine-v1/ai-match-intelligence/research-cache.js",
    writerGitBlob:"af25594346eee63252d9e42e74776f516a3b7f4f",
    referenceTime:referenceIso,maxAgeMinutes:RESEARCH_CACHE_TTL_MINUTES,
    files:349,counts:totals,
    historicalArchiveByteIntegrityProven:true,
    runtimeCacheHitAtReferenceTimeProven:false,
    externalProviderEquivalenceProven:false,
    crossRunReuseAuthorized:false,
    stageSkipAuthorized:false,omissionAuthorized:false,
    publicationAuthorized:false,productionWrites:0
  };
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    check(process.argv.length===3 && path.isAbsolute(process.argv[2]),
      "cache_freshness_absolute_root_required");
    console.log("STAGE20_RESEARCH_CACHE_FRESHNESS="+JSON.stringify(
      auditHistoricalResearchCacheFreshness(process.argv[2])));
  }catch(e){console.error("STAGE20_RESEARCH_CACHE_FRESHNESS_DENIED="+e.message);process.exitCode=1;}
}
