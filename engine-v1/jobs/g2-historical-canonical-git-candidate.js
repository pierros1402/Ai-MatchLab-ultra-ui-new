import {execFileSync} from "node:child_process";
import {readFileSync,writeFileSync} from "node:fs";
import {createHash} from "node:crypto";
const inventory={days:[{day:"2026-07-13",commit:"b487f4a858328d9bbdc0bf073885dc62050c1858"},{day:"2026-07-20",commit:"bd3e10a695fe3773ed37bfc24028ef2c480e5054"}]};
const sha=b=>createHash("sha256").update(b).digest("hex");
const git=(args)=>execFileSync("git",args,{maxBuffer:32*1024*1024});
const results=[];
for(const day of inventory.days){
 const historical=[],failures=[],seen=new Set();
 const paths=git(["ls-tree","-r","--name-only",day.commit,"data/canonical-fixtures/"+day.day+"/"]).toString("utf8").split("\n").filter(x=>x.endsWith(".json"));
 for(const item of paths.map(path=>({path}))){
  try{
   const raw=git(["show",day.commit+":"+item.path]);
   // hash-object receives the original bytes through stdin, without rewriting source.
   const actual=execFileSync("git",["hash-object","--stdin"],{input:raw}).toString().trim();
   const pinned=git(["ls-tree",day.commit,"--",item.path]).toString("utf8").trim().split(/\s+/)[2];
   if(actual!==pinned)throw Error("HISTORICAL_BLOB_MISMATCH");
   const p=JSON.parse(raw.toString("utf8"));
   if(p.dayKey!==day.day||!Array.isArray(p.fixtures))throw Error("INVALID_HISTORICAL_PARTITION");
   for(const row of p.fixtures){
    const id=row.canonicalId||row.matchId;
    if(!id||seen.has(String(id)))failures.push({path:item.path,id,reason:"DUPLICATE_OR_MISSING_CANONICAL_ID"});
    else seen.add(String(id));
    historical.push({id:String(id||""),matchId:String(row.matchId||""),sourceId:String(row.sourceId||""),status:row.status,score:row.score??null,source:item.path});
   }
  }catch(e){failures.push({path:item.path,reason:String(e.message||e)})}
 }
 const files=git(["ls-files","--","data/final-results/"+day.day+"/"]).toString("utf8").split("\n").filter(x=>x.endsWith(".json"));
 const finals=[];
 for(const path of files){
  try{
   const p=JSON.parse(readFileSync(path,"utf8"));
   finals.push({path,id:String(p.canonicalId||p.matchId||""),payload:p});
  }catch(e){failures.push({path,reason:"FINAL_READ_ERROR:"+String(e.message||e)})}
 }
 const index=new Map(),aliasConflicts=[];
 for(const h of historical){
  for(const key of new Set([h.id,h.matchId,h.sourceId].filter(Boolean))){
   if(index.has(key)&&index.get(key).id!==h.id)aliasConflicts.push({key,first:index.get(key).id,second:h.id});
   else index.set(key,h);
  }
 }
 const matched=[],unmatched=[],matchedCanonical=new Set();
 for(const f of finals){
  const h=index.get(f.id);
  if(!h)unmatched.push({path:f.path,id:f.id,reason:"NO_SOURCE_BOUND_CANONICAL_OR_PROVIDER_ID"});
  else{
   if(matchedCanonical.has(h.id))failures.push({path:f.path,id:f.id,reason:"MULTIPLE_FINALS_FOR_CANONICAL_ID:"+h.id});
   matchedCanonical.add(h.id);
   matched.push({path:f.path,id:f.id,canonicalId:h.id,matchMode:f.id===h.id?"CANONICAL_ID":"PROVIDER_SOURCE_ID",historicalStatus:h.status,source:h.source});
  }
 }
 for(const conflict of aliasConflicts)failures.push({reason:"AMBIGUOUS_HISTORICAL_PROVIDER_ALIAS",...conflict});
 const unpairedHistorical=historical.filter(h=>!matchedCanonical.has(h.id));
 results.push({day:day.day,commit:day.commit,unpairedHistorical,files:paths.length,historicalRows:historical.length,historicalFT:historical.filter(x=>x.status==="FT").length,finalFiles:files.length,matched,unmatched,failures});
}
const result={schema:"ai-matchlab.historical-git-canonical-candidate.v1",readOnly:true,writeAuthorized:false,ftMutationAuthorized:false,approval:"HOLD_PENDING_INDEPENDENT_FINAL_TRUTH_RECONCILIATION",results};
writeFileSync("historical-canonical-git-candidate.json",JSON.stringify(result,null,2)+"\n");
console.log(JSON.stringify(results.map(x=>({day:x.day,rows:x.historicalRows,finalFiles:x.finalFiles,matched:x.matched.length,unmatched:x.unmatched.length,failures:x.failures.length}))));
if(results.some(x=>x.failures.length||x.unmatched.length))process.exitCode=1;
