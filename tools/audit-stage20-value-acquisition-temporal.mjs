// Historical temporal indicators only; timestamps in payloads are not trusted provider attestations.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";
import {auditHistoricalAcquisition} from "./audit-stage20-value-acquisition-census.mjs";
import {classifyAcquisitionWriterPath} from "./audit-stage20-value-acquisition-writer-map.mjs";
const PREFIX="data/value-data-acquisition/";
const REFERENCE="2026-11-23T17:00:00.000Z";
const TIME_KEYS=["generatedAt","acquiredAt","fetchedAt","checkedAt","updatedAt","attemptedAt","createdAt"];
const sha=b=>crypto.createHash("sha256").update(b).digest("hex");
function guard(ok,reason){if(!ok)throw Error(reason);}
export function inspectTemporalRows(rows,readBytes,{reference=REFERENCE}={}){
  guard(Array.isArray(rows)&&typeof readBytes==="function"&&Number.isFinite(Date.parse(reference))&&new Date(reference).toISOString()===reference,"temporal_bad_arguments");
  const seen=new Set(),byFamily={};
  let fields=0,valid=0,invalid=0,future=0,withoutTime=0;
  for(const row of rows){
    const p=row?.path;
    guard(typeof p==="string"&&p.startsWith(PREFIX)&&!seen.has(p)&&p.split("/").every(s=>s&&s!=="."&&s!==".."&&!s.includes("\\"))&&Number.isSafeInteger(row.bytes)&&row.bytes>=0&&/^[a-f0-9]{64}$/.test(row.sha256),"temporal_manifest_invalid");
    seen.add(p);
    const family=classifyAcquisitionWriterPath(p);
    guard(family!=="unattributed","temporal_unknown_writer_path");
    const b=readBytes(p);
    guard(Buffer.isBuffer(b)&&b.length===row.bytes&&sha(b)===row.sha256,"temporal_bytes_mismatch");
    let doc;try{doc=JSON.parse(b.toString("utf8"));}catch{throw Error("temporal_invalid_json");}
    guard(doc&&typeof doc==="object"&&!Array.isArray(doc),"temporal_invalid_root");
    const g=byFamily[family]??={files:0,filesWithTopLevelTime:0};g.files++;
    let found=false;
    for(const key of TIME_KEYS){
      if(!Object.hasOwn(doc,key))continue;
      found=true;fields++;
      const value=doc[key];
      const ms=typeof value==="string"&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(value)?Date.parse(value):NaN;
      if(!Number.isFinite(ms)||new Date(ms).toISOString().slice(0,19)!==value.slice(0,19)){invalid++;continue;}
      valid++;if(ms>Date.parse(reference))future++;
    }
    if(found)g.filesWithTopLevelTime++;else withoutTime++;
  }
  return {files:seen.size,referenceInstant:reference,byWriterPathFamily:Object.fromEntries(Object.entries(byFamily).sort()),
    topLevelTimeFields:fields,parseableTopLevelTimeFields:valid,invalidTopLevelTimeFields:invalid,
    futureTopLevelTimeFields:future,filesWithoutTopLevelTime:withoutTime,
    topLevelTimeKeyScope:TIME_KEYS,nestedTimeAndExternalHeadersNotAudited:true,
    sourceTimestampAuthenticationProven:false,providerResponseEquivalenceProven:false,
    transitiveDependencyClosureVerified:false,timeEvidenceEstablishesFreshness:false,
    crossRunReuseAuthorized:false,omissionAuthorized:false,checkpointAuthorized:false,productionWrites:0};
}
export function auditTemporal(root){
  const source=auditHistoricalAcquisition(root);
  const manifest=JSON.parse(fs.readFileSync(path.join(root,"manifest.json"),"utf8"));
  const rows=manifest.files.filter(x=>x.path.startsWith(PREFIX));
  guard(rows.length===19&&source.files===19&&source.bytes===20251721,"temporal_wrong_original_scope");
  const result=inspectTemporalRows(rows,p=>fs.readFileSync(path.join(root,p)));
  guard(result.files===19,"temporal_incomplete");
  return {schema:"ai-matchlab.stage20-acquisition-temporal-evidence.v1",runId:source.runId,dayKey:source.dayKey,
    sourceManifestSha256:source.originalManifestSha256,originalFiles:source.files,originalBytes:source.bytes,...result};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{guard(process.argv.length===3&&path.isAbsolute(process.argv[2]),"absolute_root_required");
    console.log("STAGE20_VALUE_TEMPORAL="+JSON.stringify(auditTemporal(process.argv[2])));
  }catch(e){console.error("STAGE20_VALUE_TEMPORAL_DENIED="+e.message);process.exitCode=1;}
}
