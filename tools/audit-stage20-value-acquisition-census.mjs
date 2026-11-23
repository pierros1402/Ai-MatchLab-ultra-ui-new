// Read-only, source-bound structure census. Does not attest provider equivalence
// or authorize omission, reuse, or live recovery.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";
import {auditHistorical954} from "./audit-daily954-stage20-history.mjs";
const PREFIX="data/value-data-acquisition/";
const EXPECTED_MANIFEST="12c19ca0c9c97aca10c25fe62f3184ceaa02d87b5e9d66fa4340e0d5589ce1c0";
const sha=x=>crypto.createHash("sha256").update(x).digest("hex");
function requireThat(x,code){if(!x)throw Error(code);}
function shapeOf(doc){
  if(doc===null)return "null";
  if(Array.isArray(doc))return "array";
  return typeof doc;
}
export function inspectAcquisitionRows(rows,readBytes){
  requireThat(Array.isArray(rows)&&typeof readBytes==="function","acquisition_rows_invalid");
  const paths=new Set(), shapes=new Map(), keySets=new Map();
  let bytes=0,parsed=0;
  for(const item of rows){
    const p=item?.path;
    requireThat(typeof p==="string"&&p.startsWith(PREFIX)&&
      /^data\/value-data-acquisition\/[a-zA-Z0-9_./-]+\.json$/.test(p)&&
      p.split("/").every(s=>s&&s!=="."&&s!=="..")&&!paths.has(p),
      "acquisition_path_invalid");
    paths.add(p);
    requireThat(Number.isSafeInteger(item.bytes)&&item.bytes>=0&&
      /^[a-f0-9]{64}$/.test(item.sha256),"acquisition_manifest_row_invalid");
    const raw=readBytes(p);
    requireThat(Buffer.isBuffer(raw)&&raw.length===item.bytes&&
      sha(raw)===item.sha256,"acquisition_bytes_mismatch");
    let doc;
    try{doc=JSON.parse(raw.toString("utf8"));}catch{throw Error("acquisition_json_invalid");}
    const kind=shapeOf(doc);
    shapes.set(kind,(shapes.get(kind)||0)+1);
    const fingerprint=kind==="object"?
      sha(JSON.stringify(Object.keys(doc).sort())):"not_object";
    keySets.set(fingerprint,(keySets.get(fingerprint)||0)+1);
    parsed++;bytes+=raw.length;
  }
  return {files:parsed,bytes,rootTypes:Object.fromEntries([...shapes].sort()),
    topLevelShapeFingerprints:Object.fromEntries([...keySets].sort()),
    providerSourceEquivalenceProven:false,producerContractMatched:false,
    externalInputFreshnessProven:false,completeStageCheckpointProven:false,
    safeForCrossRunReuse:false,omissionAuthorized:false,
    stageSkipAuthorized:false,publicationAuthorized:false};
}
export function auditHistoricalAcquisition(root){
  const original=auditHistorical954(root);
  requireThat(original.files===9083&&original.bytes===428113899&&
    original.manifestSha256===EXPECTED_MANIFEST,"acquisition_archive_unbound");
  const manifest=JSON.parse(fs.readFileSync(path.join(root,"manifest.json"),"utf8"));
  const rows=manifest.files.filter(r=>r.path.startsWith(PREFIX));
  requireThat(rows.length===19,"acquisition_expected_19");
  const result=inspectAcquisitionRows(rows,p=>fs.readFileSync(path.join(root,p)));
  requireThat(result.files===19&&result.bytes>0,"acquisition_census_incomplete");
  return {schema:"ai-matchlab.stage20-value-acquisition-census.v1",
    dayKey:original.dayKey,runId:original.runId,
    originalManifestSha256:original.manifestSha256,...result,
    archivedBytesIndividuallyVerified:true,readOnly:true,productionWrites:0};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    requireThat(process.argv.length===3&&path.isAbsolute(process.argv[2]),
      "acquisition_absolute_root_required");
    console.log("STAGE20_VALUE_ACQUISITION_CENSUS="+JSON.stringify(auditHistoricalAcquisition(process.argv[2])));
  }catch(err){console.error("STAGE20_VALUE_ACQUISITION_DENIED="+String(err.message||err));process.exitCode=1;}
}
