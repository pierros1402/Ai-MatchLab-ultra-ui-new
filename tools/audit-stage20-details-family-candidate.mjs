// Read-only candidate qualification for ONE source-owned family.
// Does not change capture allowlist or authorize any checkpoint.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {fileURLToPath} from "node:url";
import {auditHistorical954,HISTORICAL_954} from "./audit-daily954-stage20-history.mjs";
function check(ok,code){if(!ok)throw Error(code);}
const sha=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
function validDate(yyyy,mm,dd) {
  const y=Number(yyyy),m=Number(mm),d=Number(dd);
  const iso=new Date(Date.UTC(y,m-1,d));
  return iso.getUTCFullYear()===y &&
    iso.getUTCMonth()===m-1 && iso.getUTCDate()===d;
}
export function classifyDetailsCandidate(relative) {
  const m=typeof relative==="string"?relative.match(
    /^data\/details\/(\d{4})-(\d{2})-(\d{2})\/(cid_[a-z0-9_]{8,170})\.json$/
  ):null;
  if(!m)return {eligible:false,reason:"details_path_not_canonical"};
  if(!validDate(m[1],m[2],m[3]))return {eligible:false,reason:"details_calendar_date_invalid"};
  const date=m[1]+m[2]+m[3];
  if(!m[4].endsWith("_"+date))return {eligible:false,reason:"details_folder_id_date_mismatch"};
  return {eligible:true,date:m[1]+"-"+m[2]+"-"+m[3],canonicalId:m[4],reason:null};
}
export function auditHistoricalDetailsCandidates(root) {
  // Independently verify exact original 9,083-file manifest, every byte and
  // the full extracted file set BEFORE evaluating any subset content.
  const source=auditHistorical954(root,HISTORICAL_954);
  const manifest=JSON.parse(fs.readFileSync(path.join(root,"manifest.json"),"utf8"));
  const relevant=manifest.files.filter(r=>r.path.startsWith("data/details/"));
  const counts={eligible:0,invalidPath:0,identityMismatch:0,jsonParseFailed:0};
  const dateCounts={};
  let examinedBytes=0;
  for(const row of relevant){
    const classified=classifyDetailsCandidate(row.path);
    if(!classified.eligible){counts.invalidPath++;continue;}
    const file=path.join(root,row.path);
    const st=fs.lstatSync(file);
    check(st.isFile()&&!st.isSymbolicLink(),"details_candidate_nonregular_file");
    const bytes=fs.readFileSync(file);
    check(bytes.length===row.bytes && sha(bytes)===row.sha256,
      "details_candidate_sha_mismatch");
    examinedBytes+=bytes.length;
    let doc;
    try{doc=JSON.parse(bytes.toString("utf8"));}
    catch{counts.jsonParseFailed++;continue;}
    if(!doc || typeof doc!=="object" || Array.isArray(doc) ||
      String(doc.matchId||"")!==classified.canonicalId ||
      (doc.basic?.canonicalId && String(doc.basic.canonicalId)!==classified.canonicalId)){
      counts.identityMismatch++;continue;
    }
    counts.eligible++;
    dateCounts[classified.date]=(dateCounts[classified.date]||0)+1;
  }
  check(Object.values(counts).reduce((a,b)=>a+b,0)===relevant.length,
    "details_candidate_inventory_incomplete");
  return {
    schema:"ai-matchlab.stage20-details-family-candidate-audit.v1",
    dayKey:HISTORICAL_954.dayKey,
    runId:HISTORICAL_954.runId,
    manifestSha256:source.manifestSha256,
    sourceFiles:source.files,sourceBytes:source.bytes,
    detailsFiles:relevant.length,examinedCandidateBytes:examinedBytes,
    ...counts,dateCounts,
    policyChangeApproved:false,unknownFamiliesStillBlocked:true,
    captureEnabled:false,crossCommitResumeAuthorized:false,
    publicationAuthorized:false,productionWrites:0
  };
}
const invoked=process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  try{
    check(process.argv.length===3 && path.isAbsolute(process.argv[2]),
      "details_candidate_absolute_extracted_root_required");
    console.log("STAGE20_DETAILS_FAMILY_CANDIDATE="+JSON.stringify(
      auditHistoricalDetailsCandidates(process.argv[2])));
  }catch(e){console.error("STAGE20_DETAILS_FAMILY_CANDIDATE_DENIED="+String(e.message||e));process.exitCode=1;}
}
