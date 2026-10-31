import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync} from "node:fs";
import {join,dirname} from "node:path";
import {tmpdir} from "node:os";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {buildP0CP4DeploySnapshotDetails} from "./p0c-p4-build-deploy-snapshot-details.js";
const digest=x=>createHash("sha256").update(x).digest("hex");
const before=execFileSync("git",["status","--porcelain"],{encoding:"utf8"});
const report=JSON.parse(readFileSync("historical-identity-register.json","utf8"));
const entries=report.aliasReviewManifest?.entries;
if(!Array.isArray(entries)||!entries.length||report.readOnly!==true||report.approvedForWrite!==false||report.aliasPreflight?.preflightQualifiedCount!==entries.length||!Array.isArray(report.aliasSourceBoundManifest?.files))throw Error("G2_SOURCE_REGISTER_INCONSISTENT");
const targets=[...new Set(entries.flatMap(x=>(x.dependencies||[]).map(d=>d.path)
 .filter(p=>/^data\/deploy-snapshots\/\d{4}-\d{2}-\d{2}\/details\/[^/]+\.json$/.test(p))))].sort();
if(!targets.length||targets.some(path=>!report.aliasSourceBoundManifest.files.some(file=>file.path===path)))throw Error("G2_DETAILS_TARGETS_NOT_SOURCE_BOUND");
const byDay=new Map();
for(const path of targets){const day=path.split("/")[2];if(!byDay.has(day))byDay.set(day,[]);byDay.get(day).push(path);}
const dirs=[mkdtempSync(join(tmpdir(),"aiml-details-a-")),mkdtempSync(join(tmpdir(),"aiml-details-b-"))];
const passed=[],held=[];
try{
 for(const [day,paths] of [...byDay].sort(([a],[b])=>a.localeCompare(b))){
  try{
   const snapshot=JSON.parse(readFileSync(join("data/deploy-snapshots",day,"fixtures.json"),"utf8"));
   const fixtures=Array.isArray(snapshot.fixtures)?snapshot.fixtures:snapshot.matches;
   if(!Array.isArray(fixtures))throw Error("PUBLISHED_FIXTURE_ROWS_MISSING");
   const records=paths.map(path=>({path,detail:JSON.parse(readFileSync(path,"utf8"))}));
   const hashes=[];
   for(const dir of dirs){
    const result=buildP0CP4DeploySnapshotDetails({dayKey:day,inventoryPaths:paths,
      sourceDetails:[],existingDeployDetails:records,fixtureRows:fixtures,
      preserveExistingDetails:true,patchedAt:day+"T00:00:00.000Z",identityOverlay:null});
    if(!result.ok||!result.completeFamilyOutput||result.outputs.length!==paths.length)throw Error("INCOMPLETE_DETAILS_OUTPUT");
    for(const row of result.outputs){
     if(row.action!=="write")throw Error("DETAIL_DELETION_REQUIRES_SEPARATE_AUTHORITY:"+row.relativePath);
     const bytes=Buffer.from(JSON.stringify(row.content,null,2)+"\n");
     const dest=join(dir,row.relativePath);mkdirSync(dirname(dest),{recursive:true});writeFileSync(dest,bytes);
    }
    hashes.push(paths.map(path=>digest(readFileSync(join(dir,path)))));
   }
   if(JSON.stringify(hashes[0])!==JSON.stringify(hashes[1]))throw Error("NONDETERMINISTIC_DETAILS");
   paths.forEach((path,i)=>passed.push({path,sha256:hashes[0][i]}));
  }catch(e){held.push({day,targetCount:paths.length,reason:String(e.message||e)});}
 }
 if(before!==execFileSync("git",["status","--porcelain"],{encoding:"utf8"}))held.push({reason:"REPOSITORY_CHANGED"});
 const result={schema:"ai-matchlab.g2-details-existing-source-two-pass.v1",
  readOnly:true,writeAuthorized:false,identityReconciliationAuthorized:false,
  source:"existing-deploy-details-and-published-fixtures; no independent canonical verification",
  expected:targets.length,passed:passed.length,heldTargets:targets.length-passed.length,
  status:held.length?"HOLD_G2_DETAILS":"PASS_G2_DETAILS_DETERMINISM_ONLY",outputs:passed,failures:held};
 writeFileSync("g2-details-two-pass.json",JSON.stringify(result,null,2)+"\n");
 console.log(JSON.stringify({status:result.status,passed:result.passed,heldDays:held.length}));
 if(held.length)process.exitCode=1;
}finally{for(const d of dirs)rmSync(d,{recursive:true,force:true});}
