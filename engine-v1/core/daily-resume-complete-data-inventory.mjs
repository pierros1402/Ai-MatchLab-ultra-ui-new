// Read-only pre/post inventory foundation: Git-tracked, untracked AND ignored.
// It never captures payload bytes, restores paths or authorizes production resume.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
export const COMPLETE_DATA_INVENTORY_SCHEMA="ai-matchlab.daily-stage20-complete-tree-inventory.v1";
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const SHA40=/^[a-f0-9]{40}$/;
const SHA256=/^[a-f0-9]{64}$/;
const MAX_FILES=250000;
const MAX_BYTES=32*1024*1024*1024;
const MAX_FILE_BYTES=2*1024*1024*1024;
function check(ok,code){if(!ok)throw Error(code);}
const sha=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
function safeRelative(name) {
  check(typeof name==="string" && name.startsWith("data/") &&
    !name.includes("\\") && !name.includes("\0") &&
    name.length<=700 && name.split("/").every(s=>s && s!=="." && s!==".."),
    "stage20_inventory_unsafe_path");
  return name;
}
function hashStableFile(file) {
  const first=fs.lstatSync(file,{bigint:true});
  check(first.isFile() && !first.isSymbolicLink(), "stage20_inventory_nonregular");
  check(first.size<=BigInt(MAX_FILE_BYTES),"stage20_inventory_file_oversize");
  const flags=fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0);
  const fd=fs.openSync(file,flags);
  try {
    const opened=fs.fstatSync(fd,{bigint:true});
    check(opened.ino===first.ino && opened.dev===first.dev &&
      opened.size===first.size && opened.mtimeNs===first.mtimeNs,
      "stage20_inventory_file_changed_during_open");
    const hash=crypto.createHash("sha256"), block=Buffer.allocUnsafe(1024*1024);
    let position=0,total=0;
    while(true) {
      const n=fs.readSync(fd,block,0,block.length,position);
      if(n===0)break;
      hash.update(block.subarray(0,n));
      total+=n;position+=n;
      check(total<=MAX_FILE_BYTES,"stage20_inventory_file_oversize");
    }
    const after=fs.fstatSync(fd,{bigint:true});
    const nameAfter=fs.lstatSync(file,{bigint:true});
    check(after.size===first.size && BigInt(total)===first.size &&
      after.mtimeNs===first.mtimeNs && after.ctimeNs===first.ctimeNs &&
      nameAfter.ino===first.ino && nameAfter.dev===first.dev &&
      nameAfter.mtimeNs===first.mtimeNs,
      "stage20_inventory_file_changed_during_read");
    return {bytes:total,sha256:hash.digest("hex")};
  }finally{fs.closeSync(fd);}
}
function treeManifest(body) {
  return {...body,manifestSha256:sha(Buffer.from(JSON.stringify(body),"utf8"))};
}
export function inventoryDataTree(repoRoot,dayKey) {
  check(DAY.test(dayKey),"stage20_inventory_day_invalid");
  const root=path.resolve(repoRoot);
  const dataRoot=path.join(root,"data");
  check(fs.existsSync(dataRoot) && fs.lstatSync(dataRoot).isDirectory() &&
    !fs.lstatSync(dataRoot).isSymbolicLink(),"stage20_inventory_root_invalid");
  const commit=execFileSync("git",["rev-parse","HEAD"],{cwd:root,encoding:"utf8"}).trim();
  check(SHA40.test(commit),"stage20_inventory_commit_invalid");
  const files=[];
  let totalBytes=0;
  function walk(abs,rel) {
    for(const ent of fs.readdirSync(abs,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,"en"))) {
      const name=safeRelative(rel+"/"+ent.name);
      const full=path.join(abs,ent.name);
      const st=fs.lstatSync(full);
      check(!st.isSymbolicLink(),"stage20_inventory_symlink_forbidden");
      if(st.isDirectory())walk(full,name);
      else {
        check(st.isFile(),"stage20_inventory_nonregular");
        const proof=hashStableFile(full);
        totalBytes+=proof.bytes;
        check(files.length<MAX_FILES && totalBytes<=MAX_BYTES,"stage20_inventory_limits_exceeded");
        files.push({path:name,...proof});
      }
    }
  }
  walk(dataRoot,"data");
  files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  check(files.length>0,"stage20_inventory_empty");
  return treeManifest({
    schema:COMPLETE_DATA_INVENTORY_SCHEMA,dayKey,
    sourceCommit:commit,root:"data/",
    fileCount:files.length,totalBytes,files,
    includesIgnored:true,includesUntracked:true,includesTracked:true,
    stageCaptureAuthorized:false,resumeAuthorized:false,publicationAuthorized:false
  });
}
export function verifyDataInventory(doc) {
  try {
    check(doc?.schema===COMPLETE_DATA_INVENTORY_SCHEMA &&
      DAY.test(doc.dayKey) && SHA40.test(doc.sourceCommit) &&
      doc.root==="data/" && doc.includesIgnored===true &&
      doc.includesUntracked===true && doc.includesTracked===true &&
      doc.stageCaptureAuthorized===false &&
      doc.resumeAuthorized===false && doc.publicationAuthorized===false &&
      Array.isArray(doc.files) && doc.files.length>0 &&
      doc.files.length<=MAX_FILES && doc.fileCount===doc.files.length &&
      Number.isSafeInteger(doc.totalBytes) && doc.totalBytes>=0 &&
      SHA256.test(doc.manifestSha256),"stage20_inventory_contract_invalid");
    let previous="",total=0;
    for(const row of doc.files) {
      safeRelative(row.path);
      check(row.path>previous && Number.isSafeInteger(row.bytes) &&
        row.bytes>=0 && row.bytes<=MAX_FILE_BYTES &&
        SHA256.test(row.sha256),"stage20_inventory_row_invalid");
      total+=row.bytes;previous=row.path;
    }
    check(total===doc.totalBytes && total<=MAX_BYTES,"stage20_inventory_bytes_invalid");
    const {manifestSha256,...body}=doc;
    check(sha(Buffer.from(JSON.stringify(body),"utf8"))===manifestSha256,
      "stage20_inventory_manifest_tampered");
    return {ok:true,reason:null};
  }catch(e){return {ok:false,reason:e.message};}
}
export function compareDataInventories(before,after) {
  const first=verifyDataInventory(before), second=verifyDataInventory(after);
  check(first.ok && second.ok,
    "stage20_prepost_inventory_invalid:"+(first.ok?second.reason:first.reason));
  check(before.dayKey===after.dayKey && before.sourceCommit===after.sourceCommit,
    "stage20_prepost_source_mismatch");
  const left=new Map(before.files.map(r=>[r.path,r]));
  const right=new Map(after.files.map(r=>[r.path,r]));
  const changes=[];
  for(const [name,old] of left) {
    const now=right.get(name);
    if(!now)changes.push({path:name,action:"delete",beforeSha256:old.sha256,afterSha256:null});
    else if(now.sha256!==old.sha256 || now.bytes!==old.bytes)
      changes.push({path:name,action:"modify",beforeSha256:old.sha256,afterSha256:now.sha256});
  }
  for(const [name,now] of right)if(!left.has(name))
    changes.push({path:name,action:"add",beforeSha256:null,afterSha256:now.sha256});
  changes.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  return {
    schema:"ai-matchlab.daily-stage20-complete-tree-delta.v1",
    dayKey:before.dayKey,sourceCommit:before.sourceCommit,
    beforeSha256:before.manifestSha256,afterSha256:after.manifestSha256,
    added:changes.filter(x=>x.action==="add").length,
    modified:changes.filter(x=>x.action==="modify").length,
    deleted:changes.filter(x=>x.action==="delete").length,
    changes,completeGitIgnoreIndependentComparison:true,
    payloadArchiveCreated:false,quiescenceAttested:false,
    stageCaptureAuthorized:false,resumeAuthorized:false,publicationAuthorized:false
  };
}
