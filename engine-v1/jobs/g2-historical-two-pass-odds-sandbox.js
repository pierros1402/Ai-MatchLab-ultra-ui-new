import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync} from "node:fs";
import {join,dirname} from "node:path";
import {tmpdir} from "node:os";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {buildP0CP4DeploySnapshotOdds} from "./p0c-p4-build-deploy-snapshot-odds.js";
const hash=x=>createHash("sha256").update(x).digest("hex");
const before=execFileSync("git",["status","--porcelain"],{encoding:"utf8"});
const register=JSON.parse(readFileSync("historical-identity-register.json","utf8"));
const entries=register.aliasReviewManifest?.entries;
if(!Array.isArray(entries)||entries.length!==72)throw Error("G2_ODDS_REGISTER_NOT_72");
const targets=[...new Set(entries.flatMap(x=>(x.dependencies||[]).map(y=>y.path).filter(p=>/^data\/deploy-snapshots\/\d{4}-\d{2}-\d{2}\/odds\.json$/.test(p))))].sort();
if(targets.length!==8)throw Error("G2_ODDS_TARGET_COUNT:"+targets.length);
const dirs=[mkdtempSync(join(tmpdir(),"aiml-g2odds-a-")),mkdtempSync(join(tmpdir(),"aiml-g2odds-b-"))];
const passed=[],held=[];
try {
 for(const target of targets){
  const day=target.split("/")[2];
  try{
   const source=JSON.parse(readFileSync(target,"utf8"));
   if(source.date!==day||!Array.isArray(source.matches)||source.count!==source.matches.length)throw Error("ODDS_SOURCE_INCONSISTENT");
   const outputs=[];
   for(const dir of dirs){
    const result=buildP0CP4DeploySnapshotOdds({dayKey:day,generatedAt:source.generatedAt,oddsDay:source});
    if(result.count!==source.count ||result.hash!==source.hash)throw Error("ODDS_SOURCE_CONTENT_HASH_MISMATCH");
    const bytes=Buffer.from(JSON.stringify(result,null,2)+"\n");
    const dest=join(dir,target);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,bytes);outputs.push(hash(bytes));
   }
   if(outputs[0]!==outputs[1])throw Error("ODDS_NONDETERMINISTIC");
   passed.push({target,matchCount:source.count,outputSha256:outputs[0]});
  }catch(e){held.push({target,reason:String(e.message||e)});}
 }
 if(before!==execFileSync("git",["status","--porcelain"],{encoding:"utf8"}))held.push({reason:"REPOSITORY_STATUS_CHANGED"});
 const report={schema:"ai-matchlab.g2-historical-odds-producer-two-pass.v1",readOnly:true,writeAuthorized:false,
  provenance:"existing-snapshot-odds; no independent upstream odds capture",
  expected:8,passed:passed.length,held:held.length,
  status:held.length?"HOLD_G2_ODDS":"PASS_G2_ODDS_DETERMINISM_ONLY",outputs:passed,failures:held};
 writeFileSync("g2-odds-two-pass.json",JSON.stringify(report,null,2)+"\n");
 console.log(JSON.stringify({status:report.status,passed:report.passed,held:report.held}));
 if(held.length)process.exitCode=1;
} finally {for(const dir of dirs)rmSync(dir,{recursive:true,force:true});}
