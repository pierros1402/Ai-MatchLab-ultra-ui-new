// Source-owned research cache envelope audit; source file is pinned in CI
// by BOTH historical producer and consumer Git blob SHA. No values emitted.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {auditHistorical954} from "./audit-daily954-stage20-history.mjs";
const PREFIX="data/research-cache/";
const EXPECTED_KEYS=["competitionContext","lineups","referee","remoteStatus","sources","teamNews"];
const VERSION="research-cache-v2-compact";
function check(ok,code){if(!ok)throw Error(code);}
export function inspectResearchCacheEnvelope(doc) {
  if(!doc || typeof doc!=="object" || Array.isArray(doc))
    return {ok:false,reason:"research_cache_not_object"};
  const keys=Object.keys(doc).sort();
  if(JSON.stringify(keys)!==JSON.stringify(["meta","payload"]))
    return {ok:false,reason:"research_cache_top_level_shape"};
  if(!doc.meta || typeof doc.meta!=="object" || Array.isArray(doc.meta) ||
    !doc.payload || typeof doc.payload!=="object" || Array.isArray(doc.payload))
    return {ok:false,reason:"research_cache_envelope_invalid"};
  const meta=doc.meta;
  if(meta.version!==VERSION)return {ok:false,reason:"research_cache_version_mismatch"};
  if(typeof meta.fetchedAt!=="string" ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(meta.fetchedAt) ||
    !Number.isSafeInteger(meta.fetchedAtTs) || meta.fetchedAtTs<=0)
    return {ok:false,reason:"research_cache_time_invalid"};
  if(!Number.isFinite(Date.parse(meta.fetchedAt)) ||
    Math.abs(Date.parse(meta.fetchedAt)-meta.fetchedAtTs)>1000)
    return {ok:false,reason:"research_cache_time_inconsistent"};
  if(JSON.stringify(Object.keys(doc.payload).sort())!==JSON.stringify(EXPECTED_KEYS))
    return {ok:false,reason:"research_cache_payload_shape"};
  if(!Array.isArray(doc.payload.sources) ||
    typeof doc.payload.remoteStatus!=="string")
    return {ok:false,reason:"research_cache_payload_fields_invalid"};
  return {ok:true,reason:null,version:VERSION};
}
export function auditResearchCacheEnvelopes(root) {
  const upstream=auditHistorical954(root);
  check(upstream.files===9083 && upstream.bytes===428113899 &&
    upstream.manifestSha256==="12c19ca0c9c97aca10c25fe62f3184ceaa02d87b5e9d66fa4340e0d5589ce1c0",
    "research_cache_upstream_not_proven");
  const doc=JSON.parse(fs.readFileSync(path.join(root,"manifest.json"),"utf8"));
  const files=doc.files.filter(row=>row.path.startsWith(PREFIX));
  check(files.length===349,"research_cache_expected_count_mismatch");
  const byReason={}, byVersion={}, timeRange={earliestTs:null,latestTs:null};
  let approved=0;
  for(const row of files){
    check(/^data\/research-cache\/cid_[a-z0-9_]+\.json$/.test(row.path) &&
      Number.isSafeInteger(row.bytes) && row.bytes>=0,"research_cache_path_not_canonical");
    const raw=fs.readFileSync(path.join(root,row.path));
    check(raw.length===row.bytes,"research_cache_bytes_changed");
    let parsed,classification;
    try {
      parsed=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(raw));
      classification=inspectResearchCacheEnvelope(parsed);
    }catch{classification={ok:false,reason:"research_cache_unparseable"};}
    if(classification.ok){
      approved++;
      const t=parsed.meta.fetchedAtTs;
      timeRange.earliestTs=timeRange.earliestTs===null?t:Math.min(timeRange.earliestTs,t);
      timeRange.latestTs=timeRange.latestTs===null?t:Math.max(timeRange.latestTs,t);
      byVersion[classification.version]=(byVersion[classification.version]||0)+1;
    }else byReason[classification.reason]=(byReason[classification.reason]||0)+1;
  }
  return {
    schema:"ai-matchlab.stage20-research-cache-writer-envelope-audit.v1",
    sourceRunId:upstream.runId,sourceManifestSha256:upstream.manifestSha256,
    writerPath:"engine-v1/ai-match-intelligence/research-cache.js",
    writerGitBlob:"af25594346eee63252d9e42e74776f516a3b7f4f",
    originalFiles:upstream.files,researchCacheFiles:349,envelopeValid:approved,
    invalid:files.length-approved,
    byReason:Object.fromEntries(Object.entries(byReason).sort()),
    byVersion:Object.fromEntries(Object.entries(byVersion).sort()),
    earliestObservedFetchedAtTs:timeRange.earliestTs,
    latestObservedFetchedAtTs:timeRange.latestTs,
    writerSourceByteParityProvenByWorkflow:true,
    providerResponseReproducibilityProven:false,
    pointInTimeCacheUsabilityProven:false,
    archiveRetentionAuthorized:false,omissionAuthorized:false,
    resumeAuthorized:false,publicationAuthorized:false,productionWrites:0
  };
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    check(process.argv.length===3 && path.isAbsolute(process.argv[2]),
      "research_cache_absolute_archive_required");
    console.log("STAGE20_RESEARCH_CACHE_ENVELOPES="+JSON.stringify(auditResearchCacheEnvelopes(process.argv[2])));
  }catch(e){console.error("STAGE20_RESEARCH_CACHE_ENVELOPES_DENIED="+String(e.message||e));process.exitCode=1;}
}
