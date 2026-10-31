import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
const targets=["data/history-index/matchups/2025-2026.json","data/history-index/matchups/2026-2027.json",
 "data/history-index/team-form/2025-2026.json","data/history-index/team-form/2026-2027.json"];
const register=JSON.parse(readFileSync("historical-identity-register.json","utf8"));
const entries=register.aliasReviewManifest?.entries;
if(!Array.isArray(entries)||!entries.length||register.readOnly!==true||register.approvedForWrite!==false||register.aliasPreflight?.preflightQualifiedCount!==entries.length||!Array.isArray(register.aliasSourceBoundManifest?.files))throw Error("G2_SOURCE_REGISTER_INCONSISTENT");
const referenced=new Set(entries.flatMap(x=>(x.dependencies||[]).map(y=>y.path)));
if(targets.some(t=>!referenced.has(t)))throw Error("G2_HISTORY_TARGET_NOT_SOURCE_BOUND");
const before=execFileSync("git",["status","--porcelain","--untracked-files=no"],{encoding:"utf8"});
const rows=[],held=[];
for(const path of targets){
 try{
  const bytes=readFileSync(path);
  const doc=JSON.parse(bytes.toString("utf8"));
  if(!doc||typeof doc!=="object"||Array.isArray(doc))throw Error("NON_OBJECT_HISTORY_INDEX");
  rows.push({path,bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex"),
    topLevelKeyCount:Object.keys(doc).length});
 }catch(e){held.push({path,reason:String(e.message||e)});}
}
if(before!==execFileSync("git",["status","--porcelain","--untracked-files=no"],{encoding:"utf8"}))held.push({reason:"TRACKED_WORKTREE_CHANGED"});
const result={schema:"ai-matchlab.g2-history-index-source-integrity.v1",readOnly:true,writeAuthorized:false,
 rebuildPerformed:false,sourceAuthorityProven:false,
 scope:"source-bound four history indexes parseable and hash-inventoried only",
 expected:4,passed:rows.length,held:held.length,
 status:held.length?"HOLD_G2_HISTORY_INDEX_SOURCE":"PASS_G2_HISTORY_INDEX_SOURCE_ONLY",
 outputs:rows,failures:held};
writeFileSync("g2-history-index-source.json",JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify({status:result.status,passed:result.passed,held:result.held}));
if(held.length)process.exitCode=1;
