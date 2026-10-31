import {readFileSync,readdirSync,existsSync,writeFileSync} from "node:fs";
import {join} from "node:path";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
const hash=x=>createHash("sha256").update(x).digest("hex");
const before=execFileSync("git",["status","--porcelain","--untracked-files=no"],{encoding:"utf8"});
const registry=JSON.parse(readFileSync("historical-identity-register.json","utf8"));
const entries=registry.aliasReviewManifest?.entries;
if(!Array.isArray(entries)||entries.length!==72)throw Error("G2_RECONCILIATION_REGISTER_NOT_72");
const days=[...new Set(entries.flatMap(e=>(e.dependencies||[])
 .map(d=>/^data\/deploy-snapshots\/(\d{4}-\d{2}-\d{2})\/(?:manifest|value-audit)\.json$/.exec(d.path)?.[1])
 .filter(Boolean)))].sort();
const records=[];
for(const day of days){
 const folder=join("data","deploy-snapshots",day);
 const item={day,sourceBlobs:{},counts:{},diagnostics:[],canonicalStatus:"UNVERIFIED"};
 for(const name of ["fixtures.json","fixtures-all.json","manifest.json","value-audit.json"]){
  const file=join(folder,name);
  if(!existsSync(file)){item.diagnostics.push("SOURCE_ABSENT:"+name);continue;}
  const bytes=readFileSync(file);item.sourceBlobs[name]={sha256:hash(bytes),bytes:bytes.length};
  try{
   const d=JSON.parse(bytes);
   if(name==="fixtures.json"){
    const matches=Array.isArray(d.fixtures)?d.fixtures:d.matches;
    if(!Array.isArray(matches))throw Error("NO_FIXTURE_ARRAY");
    item.counts.snapshotFixtures=matches.length;
    item.fixtureIds=matches.map(x=>x.canonicalId||x.matchId||x.id);
   }
   if(name==="fixtures-all.json")item.counts.fixturesAll=d.matchCount??d.matches?.length;
   if(name==="manifest.json"){item.counts.manifestFixtures=d.counts?.fixtures;item.counts.manifestDetailCount=d.counts?.details;}
   if(name==="value-audit.json")item.counts.valueAuditFixtures=d.universe?.fixturesSeen;
  }catch(error){item.diagnostics.push("UNREADABLE:"+name+":"+String(error.message));}
 }
 const root=join("data","canonical-fixtures",day);
 if(existsSync(root)){
  try{
   const files=readdirSync(root).filter(x=>x.endsWith(".json")).sort(),rows=[];
   for(const file of files){
    const full=join(root,file),bytes=readFileSync(full),obj=JSON.parse(bytes);
    if(obj.dayKey!==day||!Array.isArray(obj.fixtures))throw Error("CANONICAL_PARTITION_INVALID:"+file);
    rows.push(...obj.fixtures);
    item.sourceBlobs["canonical/"+file]={sha256:hash(bytes),bytes:bytes.length};
   }
   const ids=rows.map(x=>x.canonicalId||x.matchId);
   if(ids.some(x=>!x)||new Set(ids).size!==ids.length)throw Error("CANONICAL_ID_MISSING_OR_DUPLICATE");
   item.counts.canonicalFixtures=ids.length;
   const snapshot=new Set(item.fixtureIds||[]);
   item.counts.canonicalMissingFromSnapshot=ids.filter(x=>!snapshot.has(x)).length;
   const canonical=new Set(ids);
   item.counts.snapshotMissingFromCanonical=(item.fixtureIds||[]).filter(x=>!canonical.has(x)).length;
   item.canonicalStatus="PRESENT_UNADJUDICATED";
  }catch(error){item.canonicalStatus="INVALID";item.diagnostics.push("CANONICAL_INVALID:"+String(error.message));}
 }else{item.canonicalStatus="DAY_PARTITIONS_MISSING";item.diagnostics.push("CANONICAL_DAY_PARTITIONS_MISSING");}
 delete item.fixtureIds;
 const x=item.counts;
 for(const field of ["manifestFixtures","valueAuditFixtures","fixturesAll"]){
  if(Number.isInteger(x[field])&&Number.isInteger(x.snapshotFixtures)&&x[field]!==x.snapshotFixtures)item.diagnostics.push("COUNT_DRIFT:"+field+":"+x[field]+":snapshot:"+x.snapshotFixtures);
 }
 if(x.canonicalMissingFromSnapshot>0||x.snapshotMissingFromCanonical>0)item.diagnostics.push("CANONICAL_SNAPSHOT_IDENTITY_DRIFT");
 item.status=item.diagnostics.length?"HOLD_REQUIRES_SOURCE_ADJUDICATION":"CONSISTENT_COUNTS_ONLY";
 records.push(item);
}
if(before!==execFileSync("git",["status","--porcelain","--untracked-files=no"],{encoding:"utf8"}))throw Error("TRACKED_WORKTREE_CHANGED");
const result={schema:"ai-matchlab.g2-cross-family-source-triage.v1",readOnly:true,writeAuthorized:false,
 independentFinalScoreAuthority:false,authoritativeWriteSet:false,expectedCandidatePairs:72,
 days:records.length,consistent:records.filter(r=>r.status==="CONSISTENT_COUNTS_ONLY").length,
 hold:records.filter(r=>r.status!=="CONSISTENT_COUNTS_ONLY").length,records};
writeFileSync("g2-cross-family-source-triage.json",JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify({days:result.days,consistent:result.consistent,hold:result.hold}));
