import {readFileSync,readdirSync,writeFileSync,copyFileSync,mkdtempSync,mkdirSync,rmSync} from "node:fs";
import {join,dirname} from "node:path";
import {tmpdir} from "node:os";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {buildFixturesAllFromCanonicalEvidenceDay} from "./rebuild-fixtures-all-from-canonical-evidence-day.js";
const sha=x=>createHash("sha256").update(x).digest("hex");
const before=execFileSync("git",["status","--porcelain"],{encoding:"utf8"});
const register=JSON.parse(readFileSync("historical-identity-register.json","utf8"));
const entries=register.aliasReviewManifest?.entries;
if(!Array.isArray(entries)||entries.length!==72)throw Error("G2_BAD_REGISTER");
const targets=[...new Set(entries.flatMap(x=>(x.dependencies||[]).map(d=>d.path)
 .filter(p=>/^data\/deploy-snapshots\/\d{4}-\d{2}-\d{2}\/fixtures-all\.json$/.test(p))))].sort();
if(targets.length!==24)throw Error("G2_FIXTURES_ALL_TARGET_SET_CHANGED:"+targets.length);
const dirs=[mkdtempSync(join(tmpdir(),"aiml-fa1-")),mkdtempSync(join(tmpdir(),"aiml-fa2-"))];
const passed=[],failed=[];
try{
 for(const target of targets){
  const day=target.split("/")[2],root=join("data","canonical-fixtures",day);
  try{
   const names=readdirSync(root).filter(s=>s.endsWith(".json")).sort();
   if(!names.length)throw Error("MISSING_CANONICAL_PARTITIONS");
   const canonicalRows=[],identity=new Set();
   for(const name of names){
    const part=JSON.parse(readFileSync(join(root,name),"utf8"));
    if(part.dayKey!==day || !Array.isArray(part.fixtures))throw Error("INVALID_CANONICAL_PARTITION:"+name);
    for(const row of part.fixtures){
     const id=row.canonicalId||row.matchId;
     if(!id||identity.has(id))throw Error("DUPLICATE_OR_MISSING_CANONICAL_ID:"+id);
     identity.add(id);canonicalRows.push(row);
    }
   }
   const outputs=[];
   for(const dir of dirs){
    const result=buildFixturesAllFromCanonicalEvidenceDay({
      dayKey:day,canonicalRows,providerEvidenceRows:[]});
    const bytes=Buffer.from(JSON.stringify(result)+"\n");
    const dest=join(dir,target);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,bytes);
    outputs.push(sha(bytes));
   }
   if(outputs[0]!==outputs[1])throw Error("NONDETERMINISTIC_FIXTURES_ALL");
   const durable=join("g2-fixtures-all-payload",target);
   mkdirSync(dirname(durable),{recursive:true});
   copyFileSync(join(dirs[0],target),durable);
   if(sha(readFileSync(durable))!==outputs[0])throw Error("EXPORTED_PAYLOAD_HASH_MISMATCH");
   passed.push({target,canonicalPartitions:names.length,canonicalRows:canonicalRows.length,outputSha256:outputs[0]});
  }catch(error){failed.push({target,reason:String(error.message||error)});}
 }
 const after=execFileSync("git",["status","--porcelain"],{encoding:"utf8"});
 if(before!==after)failed.push({reason:"WORKTREE_CHANGED"});
 const result={schema:"ai-matchlab.g2-fixtures-all-two-pass.v1",readOnly:true,
  writeAuthorized:false,source:"canonical-fixtures",expected:24,passed:passed.length,
  held:failed.length,status:failed.length?"HOLD_G2_FIXTURES_ALL":"PASS_G2_FIXTURES_ALL_TWO_PASS_ONLY",
  outputs:passed,failures:failed};
 writeFileSync("g2-fixtures-all-two-pass.json",JSON.stringify(result,null,2)+"\n");
 console.log(JSON.stringify({status:result.status,passed:result.passed,held:result.held}));
 if(failed.length)process.exitCode=1;
}finally{for(const d of dirs)rmSync(d,{recursive:true,force:true});}
