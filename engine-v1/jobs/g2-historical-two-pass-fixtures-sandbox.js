import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join,dirname} from "node:path";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {buildP0CP4DeploySnapshotFixtures} from "./p0c-p4-build-deploy-snapshot-fixtures.js";

const digest=x=>createHash("sha256").update(x).digest("hex");
const before=execFileSync("git",["status","--porcelain"],{encoding:"utf8"});
const manifest=JSON.parse(readFileSync("historical-identity-register.json","utf8"));
const entries=manifest.aliasReviewManifest?.entries;
if(!Array.isArray(entries)||entries.length!==72)throw Error("G2_REVIEW_NOT_BOUND_TO_72");
const targets=[...new Set(entries.flatMap(r=>(r.dependencies||[])
 .map(d=>d.path).filter(p=>/^data\/deploy-snapshots\/\d{4}-\d\d-\d\d\/fixtures\.json$/.test(p))))].sort();
if(!targets.length)throw Error("G2_NO_FIXTURE_TARGETS");
const dirs=[mkdtempSync(join(tmpdir(),"aiml-g2-pass1-")),mkdtempSync(join(tmpdir(),"aiml-g2-pass2-"))];
const rows=[];const errors=[];
try{
 for(const path of targets){
  const day=path.split("/")[2];
  try{
   const raw=JSON.parse(readFileSync(path,"utf8"));
   const source=Array.isArray(raw.fixtures)?raw.fixtures:Array.isArray(raw.matches)?raw.matches:null;
   if(!source)throw Error("UNSUPPORTED_FIXTURE_SOURCE_SHAPE");
   const produced=[];
   for(const dir of dirs){
    const result=buildP0CP4DeploySnapshotFixtures({dayKey:day,fixtureRows:source});
    const bytes=Buffer.from(JSON.stringify(result)+"\n","utf8");
    const out=join(dir,path);mkdirSync(dirname(out),{recursive:true});writeFileSync(out,bytes);
    produced.push({sha256:digest(bytes),count:result.count});
   }
   if(produced[0].sha256!==produced[1].sha256)throw Error("NONDETERMINISTIC_OUTPUT");
   rows.push({path,day,sourceRows:source.length,outputRows:produced[0].count,outputSha256:produced[0].sha256});
  }catch(error){errors.push({path,error:String(error.message||error)});}
 }
 const after=execFileSync("git",["status","--porcelain"],{encoding:"utf8"});
 if(before!==after)errors.push({error:"TRACKED_WORKTREE_STATUS_CHANGED"});
 const report={schema:"ai-matchlab.g2-two-pass-fixtures-sandbox.v1",readOnly:true,
  writeAuthorized:false,sourceBoundArtifact:"historical-identity-register.json",
  expectedCandidatePairs:72,selectedTargetCount:targets.length,
  successfulTargets:rows.length,failedTargets:errors.length,
  status:errors.length?"HOLD_G2_TWO_PASS_FIXTURES":"PASS_G2_TWO_PASS_FIXTURES_ONLY",
  results:rows,errors};
 writeFileSync("g2-two-pass-fixtures-result.json",JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({status:report.status,targets:targets.length,passed:rows.length,failed:errors.length}));
 if(errors.length)process.exitCode=1;
}finally{for(const dir of dirs)rmSync(dir,{recursive:true,force:true});}
