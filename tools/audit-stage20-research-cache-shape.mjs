// Read-only structural classification for the original 349 research-cache
// outputs. Filename contents, record values and credentials are never emitted.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {auditHistorical954} from "./audit-daily954-stage20-history.mjs";
const PREFIX="data/research-cache/";
const DAY=/^20\d{2}-\d{2}-\d{2}$/;
const SHA=/^[a-f0-9]{64}$/;
const CID=/^cid_[a-z0-9_]+$/;
function requireThat(ok,reason){if(!ok)throw Error(reason);}
function classifyFilename(p){
  requireThat(typeof p==="string" && p.startsWith(PREFIX) &&
    !p.includes("\\") && !p.includes("\0") &&
    p.split("/").every(s=>s && s!=="." && s!==".."),
    "research_cache_unsafe_path");
  const segments=p.slice(PREFIX.length).split("/");
  const base=segments.at(-1);
  const stem=base.replace(/\.[^.]+$/,"");
  const ext=base.includes(".")?base.slice(base.lastIndexOf(".")+1).toLowerCase():"none";
  return {depth:segments.length,ext,
    stemClass:SHA.test(stem)?"sha256":CID.test(stem)?"canonical-id":
      DAY.test(stem)?"iso-day":/^\d{8}$/.test(stem)?"compact-day":
      /^[a-z0-9_-]{1,160}$/i.test(stem)?"safe-slug":"other",
    hasDay:segments.some(s=>DAY.test(s)),bytes:0};
}
function tally(obj,key){obj[key]=(obj[key]||0)+1;}
export function classifyResearchCacheRows(rows,root,{expected=349}={}){
  requireThat(Array.isArray(rows)&&Number.isInteger(expected)&&expected>=1,
    "research_cache_bad_inventory");
  const matching=rows.filter(row=>row?.path?.startsWith(PREFIX));
  requireThat(matching.length===expected,"research_cache_count_mismatch");
  const seen=new Set(),depth={},extensions={},stems={},jsonShapes={},age={};
  let bytes=0,maxBytes=0,zeroBytes=0,validJson=0,invalidJson=0,
    binaryOrUnsupported=0,filesWithEmbeddedDay=0;
  for(const row of matching){
    requireThat(!seen.has(row.path) && Number.isSafeInteger(row.bytes) && row.bytes>=0,
      "research_cache_duplicate_or_invalid");
    seen.add(row.path);
    const meta=classifyFilename(row.path);
    tally(depth,String(meta.depth));tally(extensions,meta.ext);tally(stems,meta.stemClass);
    if(meta.hasDay)filesWithEmbeddedDay++;
    const full=path.join(root,row.path);
    requireThat(fs.lstatSync(full).isFile() && !fs.lstatSync(full).isSymbolicLink(),
      "research_cache_nonregular_file");
    const buf=fs.readFileSync(full);
    requireThat(buf.length===row.bytes,"research_cache_length_changed");
    bytes+=buf.length;maxBytes=Math.max(maxBytes,buf.length);
    if(buf.length===0)zeroBytes++;
    if(meta.ext!=="json" && meta.ext!=="jsonl" && meta.ext!=="ndjson"){
      binaryOrUnsupported++;continue;
    }
    let text;
    try{text=new TextDecoder("utf-8",{fatal:true}).decode(buf);}
    catch{invalidJson++;continue;}
    if(meta.ext==="json"){
      try{
        const val=JSON.parse(text);
        const shape=Array.isArray(val)?"array":
          val===null?"null":typeof val==="object"?"object":typeof val;
        tally(jsonShapes,shape);
        validJson++;
      }catch{invalidJson++;}
    }else{
      const lines=text.split(/\r?\n/).filter(Boolean);
      let all=true;
      for(const line of lines){try{JSON.parse(line);}catch{all=false;break;}}
      if(all){validJson++;tally(jsonShapes,"json-lines");}else invalidJson++;
    }
  }
  return {
    schema:"ai-matchlab.stage20-research-cache-structure-audit.v1",
    researchCacheFiles:matching.length,bytes,maxBytes,zeroBytes,
    depths:Object.fromEntries(Object.entries(depth).sort()),
    extensions:Object.fromEntries(Object.entries(extensions).sort()),
    basenameKinds:Object.fromEntries(Object.entries(stems).sort()),
    jsonKinds:Object.fromEntries(Object.entries(jsonShapes).sort()),
    validJson,invalidJson,binaryOrUnsupported,filesWithEmbeddedDay,
    sourceWriterIdentified:false,reconstructibleProven:false,
    omissionAuthorized:false,stage20FamilyApproved:false,
    resumeAuthorized:false,publicationAuthorized:false,productionWrites:0
  };
}
export function auditRealResearchCache(root){
  const source=auditHistorical954(root);
  requireThat(source.files===9083 && source.bytes===428113899 &&
    source.manifestSha256==="12c19ca0c9c97aca10c25fe62f3184ceaa02d87b5e9d66fa4340e0d5589ce1c0",
    "research_cache_source_not_pinned");
  const manifest=JSON.parse(fs.readFileSync(path.join(root,"manifest.json"),"utf8"));
  const result=classifyResearchCacheRows(manifest.files,root);
  return {...result,sourceManifestSha256:source.manifestSha256,
    sourceRunId:source.runId,readOnly:true};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    requireThat(process.argv.length===3 && path.isAbsolute(process.argv[2]),
      "research_cache_absolute_root_required");
    console.log("STAGE20_RESEARCH_CACHE_SHAPE="+JSON.stringify(auditRealResearchCache(process.argv[2])));
  }catch(e){console.error("STAGE20_RESEARCH_CACHE_DENIED="+String(e.message||e));process.exitCode=1;}
}
