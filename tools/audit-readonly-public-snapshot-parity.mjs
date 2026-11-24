// Read-only public snapshot parity, never a sync/publish caller.
// UNAVAILABLE must not be represented as VERIFIED or as a missing release.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const HEX=/^[a-f0-9]{64}$/;
export const PUBLIC_READONLY_SCHEMA="ai-matchlab.stage20-public-readonly-parity.v1";
const verdict=(day,status,hash,publicHash=null)=>({
  schema:PUBLIC_READONLY_SCHEMA,day,verdict:status,
  expectedHash:hash,publicHash,
  sourceManifestValid:true,productionWriterInvoked:false,
  syncInvoked:false,publicationAuthorized:false,resumeAuthorized:false
});
export function inspectReadOnlyPublicSnapshot(day,manifest,publicRelease,httpStatus){
  if(!DAY.test(day||"") || manifest?.ok!==true || manifest.date!==day ||
     !HEX.test(manifest.hash||""))throw Error("readonly_public_source_manifest_invalid");
  if(httpStatus===404)return verdict(day,"SYNC_REQUIRED",manifest.hash);
  if(httpStatus!==200)return verdict(day,"UNAVAILABLE",manifest.hash);
  if(publicRelease?.ok!==true || publicRelease.date!==day ||
     !HEX.test(publicRelease.manifest?.hash||""))
    return verdict(day,"SYNC_REQUIRED",manifest.hash);
  const publicHash=publicRelease.manifest.hash;
  return verdict(day,publicHash===manifest.hash?"VERIFIED":"SYNC_REQUIRED",
    manifest.hash,publicHash);
}
export async function probeReadOnlyPublicSnapshot(day,manifest,request=fetch){
  if(!DAY.test(day||"") || manifest?.date!==day ||
     manifest?.ok!==true || !HEX.test(manifest.hash||""))
    throw Error("readonly_public_source_manifest_invalid");
  try{
    const response=await request("https://ai-matchlab-engine.onrender.com/deploy-snapshot?date="+
      encodeURIComponent(day),{signal:AbortSignal.timeout(20000)});
    if(!response || !Number.isSafeInteger(response.status))
      return inspectReadOnlyPublicSnapshot(day,manifest,null,503);
    if(response.status!==200)
      return inspectReadOnlyPublicSnapshot(day,manifest,null,response.status);
    let body;
    try{body=await response.json()}
    catch{return inspectReadOnlyPublicSnapshot(day,manifest,null,503)}
    return inspectReadOnlyPublicSnapshot(day,manifest,body,200);
  }catch{return inspectReadOnlyPublicSnapshot(day,manifest,null,503)}
}
const invoked=process.argv[1] &&
  path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  try{
    const day=process.argv[2];
    if(process.argv.length!==3 || !DAY.test(day||""))
      throw Error("readonly_public_day_invalid");
    const root=path.resolve("data/deploy-snapshots",day);
    const file=path.join(root,"manifest.json");
    const data=JSON.parse(fs.readFileSync(file,"utf8"));
    const result=await probeReadOnlyPublicSnapshot(day,data);
    console.log("READONLY_PUBLIC_SNAPSHOT_PARITY="+JSON.stringify(result));
    // A non-verified verdict is never a success claim. This audit exits 0
    // to preserve the diagnostic record without causing an automatic writer.
  }catch{console.error("READONLY_PUBLIC_SNAPSHOT_PARITY_DENIED");process.exitCode=1;}
}
