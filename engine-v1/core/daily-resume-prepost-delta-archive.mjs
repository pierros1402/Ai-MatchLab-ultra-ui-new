// Isolated pre/post full-data delta archive, including ignored paths. Never
// promoted, replayed or published without separate complete base-tree contract.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {execFileSync} from "node:child_process";
import {
  verifyDataInventory,compareDataInventories
} from "./daily-resume-complete-data-inventory.mjs";
import {evaluateStage20CapturePaths} from "./daily-resume-stage20-admission.mjs";
export const PREPOST_DELTA_SCHEMA="ai-matchlab.daily-stage20-prepost-delta-archive.v1";
const digest=buf=>crypto.createHash("sha256").update(buf).digest("hex");
const SHA256=/^[a-f0-9]{64}$/;
function check(ok,code){if(!ok)throw Error(code);}
function fileAt(root,rel) {
  check(typeof rel==="string" && rel.startsWith("data/") &&
    rel.length<512 && !rel.includes("\\") && !rel.includes("\0") &&
    rel.split("/").every(x=>x && x!=="." && x!==".."),
    "stage20_prepost_unsafe_path");
  let p=path.resolve(root);
  for(const s of rel.split("/")) {
    p=path.join(p,s);
    check(!fs.lstatSync(p).isSymbolicLink(),"stage20_prepost_symlink");
  }
  check(fs.statSync(p).isFile(),"stage20_prepost_not_file");
  return p;
}
function listFiles(root) {
  const files=[];
  function walk(dir,prefix="") {
    if(!fs.existsSync(dir))return;
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
      const rel=prefix?prefix+"/"+entry.name:entry.name;
      const p=path.join(dir,entry.name);
      check(!entry.isSymbolicLink(),"stage20_prepost_archive_symlink");
      if(entry.isDirectory())walk(p,rel);
      else { check(entry.isFile(),"stage20_prepost_archive_nonfile"); files.push(rel); }
    }
  }
  walk(root);
  return files.sort();
}
function manifestBody(before,after,changes) {
  return {
    schema:PREPOST_DELTA_SCHEMA,dayKey:before.dayKey,
    stageId:"daily-cycle",sourceCommit:before.sourceCommit,
    beforeInventorySha256:before.manifestSha256,
    afterInventorySha256:after.manifestSha256,
    entries:changes.map(change=>({
      path:change.path,op:change.action==="delete"?"DELETE":"WRITE",
      ...(change.action!=="delete"?{
        sha256:change.afterSha256,
        bytes:after.files.find(r=>r.path===change.path).bytes
      }:{})
    })),
    completeBaseTreeIncluded:false,quiescenceAttested:false,
    replayAuthorized:false,resumeAuthorized:false,publicationAuthorized:false
  };
}
function validateInputs(before,after) {
  check(verifyDataInventory(before).ok && verifyDataInventory(after).ok,
    "stage20_prepost_inventory_not_verified");
  const delta=compareDataInventories(before,after);
  const paths=delta.changes.map(x=>x.path);
  const admission=evaluateStage20CapturePaths({dayKey:before.dayKey,paths});
  check(admission.ok,"stage20_prepost_paths_not_admitted");
  check(delta.changes.length<=10000 && delta.changes.length>0,
    "stage20_prepost_delta_count_invalid");
  const byteMap=new Map(after.files.map(r=>[r.path,r.bytes]));
  const count=delta.changes.reduce((total,item)=>total+(byteMap.get(item.path)||0),0);
  check(count<=512*1024*1024,"stage20_prepost_delta_too_large");
  return delta;
}
export function verifyPrepostDeltaArchive(archiveRoot,before,after) {
  try {
    const delta=validateInputs(before,after);
    const manifestFile=path.join(archiveRoot,"manifest.json");
    check(fs.existsSync(manifestFile) && !fs.lstatSync(manifestFile).isSymbolicLink(),
      "stage20_prepost_manifest_missing");
    const doc=JSON.parse(fs.readFileSync(manifestFile,"utf8"));
    const {evidenceSha256,...body}=doc;
    check(SHA256.test(evidenceSha256) &&
      digest(Buffer.from(JSON.stringify(body)))===evidenceSha256,
      "stage20_prepost_manifest_tampered");
    const expected=manifestBody(before,after,delta.changes);
    check(JSON.stringify(body)===JSON.stringify(expected),
      "stage20_prepost_manifest_binding_mismatch");
    const expectedFiles=[];
    let total=0;
    for(const e of doc.entries) {
      if(e.op!=="WRITE")continue;
      const bytes=fs.readFileSync(fileAt(path.join(archiveRoot,"files"),e.path));
      total+=bytes.length;
      check(bytes.length===e.bytes && digest(bytes)===e.sha256 &&
        total<=512*1024*1024,"stage20_prepost_archive_bytes_mismatch");
      expectedFiles.push(e.path);
    }
    const found=listFiles(path.join(archiveRoot,"files"));
    check(JSON.stringify(found)===JSON.stringify(expectedFiles.sort()),
      "stage20_prepost_archive_file_set_mismatch");
    return {ok:true,evidenceSha256,entries:doc.entries.length,
      completeBaseTreeIncluded:false,replayAuthorized:false,
      resumeAuthorized:false,publicationAuthorized:false};
  }catch(e){return {ok:false,reason:e.message,replayAuthorized:false,resumeAuthorized:false,publicationAuthorized:false};}
}
export function capturePrepostDeltaToIsolatedArchive(root,archiveRoot,before,after) {
  const delta=validateInputs(before,after);
  const head=execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim();
  check(head===before.sourceCommit,"stage20_prepost_head_drift");
  check(!fs.existsSync(archiveRoot),"stage20_prepost_archive_exists");
  const body=manifestBody(before,after,delta.changes);
  const manifest={...body,evidenceSha256:digest(Buffer.from(JSON.stringify(body)))};
  const parent=path.dirname(path.resolve(archiveRoot));
  fs.mkdirSync(parent,{recursive:true});
  const tmp=fs.mkdtempSync(path.join(parent,".prepost-incomplete-"));
  try {
    for(const row of manifest.entries) {
      const source=path.join(root,row.path);
      if(row.op==="DELETE"){
        check(!fs.existsSync(source),"stage20_prepost_deletion_reappeared");
        continue;
      }
      const bytes=fs.readFileSync(fileAt(root,row.path));
      check(bytes.length===row.bytes && digest(bytes)===row.sha256,
        "stage20_prepost_source_drift");
      const target=path.join(tmp,"files",row.path);
      fs.mkdirSync(path.dirname(target),{recursive:true});
      fs.writeFileSync(target,bytes,{flag:"wx",mode:0o600});
    }
    fs.writeFileSync(path.join(tmp,"manifest.json"),JSON.stringify(manifest),{flag:"wx",mode:0o600});
    const verification=verifyPrepostDeltaArchive(tmp,before,after);
    check(verification.ok,"stage20_prepost_internal_verification_failed:"+verification.reason);
    fs.renameSync(tmp,archiveRoot);
    return {schema:PREPOST_DELTA_SCHEMA,
      checkpointSha256:manifest.evidenceSha256,added:delta.added,
      modified:delta.modified,deleted:delta.deleted,
      completeBaseTreeIncluded:false,replayAuthorized:false,
      resumeAuthorized:false,publicationAuthorized:false};
  }finally{if(fs.existsSync(tmp))fs.rmSync(tmp,{recursive:true,force:true});}
}
