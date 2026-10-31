import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
const sha=x=>createHash("sha256").update(x).digest("hex");
const before=execFileSync("git",["status","--porcelain","--untracked-files=no"],{encoding:"utf8"});
const register=JSON.parse(readFileSync("historical-identity-register.json","utf8"));
const entries=register.aliasReviewManifest?.entries;
if(!Array.isArray(entries)||entries.length!==72)throw Error("G2_VALUE_AUDIT_REGISTER_NOT_72");
const targets=[...new Set(entries.flatMap(e=>(e.dependencies||[]).map(d=>d.path)
 .filter(p=>/^data\/deploy-snapshots\/\d{4}-\d{2}-\d{2}\/value-audit\.json$/.test(p))))].sort();
if(targets.length!==17)throw Error("G2_VALUE_AUDIT_TARGET_COUNT:"+targets.length);
const passed=[],held=[];
for(const path of targets){
 try{
  const bytes=readFileSync(path),a=JSON.parse(bytes);
  const day=path.split("/")[2];
  if(a.ok!==true||a.date!==day||a.sourceContract?.canonicalOnly!==true||
    a.sourceContract?.deploySnapshotInput!==false||
    a.sourceContract?.realBookmakerOddsUsed!==false)throw Error("VALUE_AUDIT_SOURCE_CONTRACT_INVALID");
  if(!a.universe||!Number.isInteger(a.universe.fixturesSeen)||
    !Number.isInteger(a.universe.approved)||a.universe.approved<0)throw Error("VALUE_AUDIT_UNIVERSE_INVALID");
  const sum=Object.values(a.rejections?.byReason||{}).reduce((n,x)=>n+x,0);
  if(sum!==a.rejections?.total)throw Error("VALUE_AUDIT_REJECTION_COUNTS_MISMATCH");
  const existing=JSON.parse(readFileSync("data/deploy-snapshots/"+day+"/fixtures.json","utf8"));
  const fixtureRows=Array.isArray(existing.fixtures)?existing.fixtures:existing.matches;
  if(!Array.isArray(fixtureRows))throw Error("VALUE_AUDIT_FIXTURE_SOURCE_INVALID");
  // Audit universe is historical input coverage, not the count of the later
  // published snapshot. A difference requires provenance review, not a false
  // claim that the historical Value record is malformed.
  const sourceCoverageDiff=a.universe.fixturesSeen-fixtureRows.length;
  passed.push({path,sha256:sha(bytes),publishedFixtureCount:fixtureRows.length,auditFixturesSeen:a.universe.fixturesSeen,sourceCoverageDiff,approved:a.universe.approved});
 }catch(e){held.push({path,reason:String(e.message||e)});}
}
if(before!==execFileSync("git",["status","--porcelain","--untracked-files=no"],{encoding:"utf8"}))held.push({reason:"TRACKED_WORKTREE_CHANGED"});
const report={schema:"ai-matchlab.g2-value-audit-preservation-integrity.v1",readOnly:true,
 writeAuthorized:false,sourceTruthChanged:false,settlementTruthChanged:false,
 scope:"existing immutable value audit structural contract; not model re-evaluation, not canonical authority",
 expected:17,passed:passed.length,held:held.length,
 status:held.length?"HOLD_G2_VALUE_AUDIT":"PASS_G2_VALUE_AUDIT_PRESERVATION_ONLY",
 outputs:passed,failures:held};
writeFileSync("g2-value-audit-integrity.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({status:report.status,passed:report.passed,held:report.held}));
if(held.length)process.exitCode=1;
