import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {execFileSync} from "node:child_process";

// Pure read-only historical inventory. File names and provider bindings are evidence,
// not permission to delete, rename, settle, or silently collapse any fixture.
export function auditAllVerifiedFinalProviderIdentities(root) {
 const files=execFileSync("git",["ls-files","-z","--","data/final-results"],{
  cwd:root,maxBuffer:64*1024*1024
 }).toString("utf8").split("\0").filter(x=>x.endsWith(".json"));
 const index=new Map(),duplicates=[],unverifiable=[];
 let checked=0,bindings=0;
 for(const file of files) {
  try {
   const payload=JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));
   checked++;
   if(!Array.isArray(payload?.sources)) {
    unverifiable.push({path:file,reason:"provider_sources_missing_or_invalid"});continue;
   }
   const seen=new Set();
   for(const source of payload.sources) {
    if(typeof source?.provider!=="string"||!source.provider||!source.providerMatchId)continue;
    const key=JSON.stringify([source.provider,String(source.providerMatchId)]);
    if(seen.has(key))continue;
    seen.add(key);bindings++;
    const previous=index.get(key);
    if(previous && previous.path!==file) {
     duplicates.push({provider:source.provider,providerMatchId:String(source.providerMatchId),
       firstPath:previous.path,firstMatchId:previous.matchId,
       secondPath:file,secondMatchId:payload?.matchId||null});
    } else if(!previous)index.set(key,{path:file,matchId:payload?.matchId||null});
   }
  } catch(error) {
   unverifiable.push({path:file,reason:"provider_source_unreadable",error:String(error?.message||error)});
  }
 }
 return {ok:duplicates.length===0&&unverifiable.length===0,readOnly:true,
  approvedForWrite:false,trackedFinalFiles:files.length,checked,providerBindings:bindings,
  uniqueProviderMatches:index.size,duplicateCount:duplicates.length,
  unverifiableCount:unverifiable.length,duplicates,unverifiable};
}
if(process.argv[1] && path.resolve(process.argv[1])===new URL(import.meta.url).pathname) {
 const result=auditAllVerifiedFinalProviderIdentities(process.cwd());
 console.log(JSON.stringify(result,null,2));
 if(!result.ok)process.exitCode=1;
}
