// Source-bound read-only review of immutable content-addressed history journals.
// Filename identity is a hash of the typed RECORD, not necessarily raw bytes.
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {fingerprint} from "../engine-v1/core/season-closure-contract.js";
import {auditHistorical954} from "./audit-daily954-stage20-history.mjs";
const TYPES=Object.freeze({
  facts:"ai-matchlab.history-recovery-fact.v1",
  holds:"ai-matchlab.history-recovery-hold.v1",
  links:"ai-matchlab.history-recovery-link.v1"
});
function check(ok,code){if(!ok)throw Error(code);}
export function classifyHistoryJournalCandidate(name,record) {
  const m=typeof name==="string"?name.match(
    /^data\/history-recovery-journal\/(facts|holds|links)\/([a-f0-9]{64})\.json$/
  ):null;
  if(!m)return {eligible:false,reason:"journal_path_not_content_addressed"};
  if(!record || typeof record!=="object" || Array.isArray(record) ||
    record.schema!==TYPES[m[1]])return {eligible:false,reason:"journal_schema_invalid"};
  if(fingerprint(record)!==m[2])
    return {eligible:false,reason:"journal_content_fingerprint_mismatch"};
  if(m[1]==="facts" && (!record.fact || typeof record.fact!=="object"))
    return {eligible:false,reason:"journal_fact_payload_invalid"};
  if(m[1]==="holds" && (typeof record.dayKey!=="string" ||
    !Array.isArray(record.errors) || !Array.isArray(record.eligible)))
    return {eligible:false,reason:"journal_hold_payload_invalid"};
  if(m[1]==="links" && (!record.decision || typeof record.decision!=="object"))
    return {eligible:false,reason:"journal_link_payload_invalid"};
  return {eligible:true,kind:m[1],reason:null};
}
export function auditHistoricalHistoryJournal(root) {
  const source=auditHistorical954(root);
  const doc=JSON.parse(fs.readFileSync(path.join(root,"manifest.json"),"utf8"));
  const rows=doc.files.filter(row=>row.path.startsWith("data/history-recovery-journal/"));
  const counts={eligible:0,invalidPath:0,jsonParseFailed:0,schemaMismatch:0,
    fingerprintMismatch:0,payloadMismatch:0};
  const kinds={facts:0,holds:0,links:0};
  for(const row of rows){
    const full=path.join(root,row.path);
    const st=fs.lstatSync(full);
    check(st.isFile()&&!st.isSymbolicLink(),"journal_candidate_nonregular");
    let object;
    try { object=JSON.parse(fs.readFileSync(full,"utf8")); }
    catch { counts.jsonParseFailed++;continue; }
    const result=classifyHistoryJournalCandidate(row.path,object);
    if(result.eligible){counts.eligible++;kinds[result.kind]++;continue;}
    if(result.reason==="journal_path_not_content_addressed")counts.invalidPath++;
    else if(result.reason==="journal_schema_invalid")counts.schemaMismatch++;
    else if(result.reason==="journal_content_fingerprint_mismatch")counts.fingerprintMismatch++;
    else counts.payloadMismatch++;
  }
  check(Object.values(counts).reduce((a,b)=>a+b,0)===rows.length,
    "history_journal_inventory_incomplete");
  return {
    schema:"ai-matchlab.stage20-history-recovery-journal-candidate.v1",
    runId:source.runId,dayKey:source.dayKey,
    sourceFiles:source.files,sourceBytes:source.bytes,
    sourceManifestSha256:source.manifestSha256,
    journalFiles:rows.length,counts,kinds,
    immutableFactContentAddressVerified:counts.eligible===rows.length,
    journalPolicyApproval:false,captureEnabled:false,
    resumeAuthorized:false,publicationAuthorized:false,productionWrites:0
  };
}
const invoked=process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url);
if(invoked){
  try {
    check(process.argv.length===3 && path.isAbsolute(process.argv[2]),
      "history_journal_absolute_root_required");
    console.log("STAGE20_HISTORY_JOURNAL_CANDIDATES="+JSON.stringify(
      auditHistoricalHistoryJournal(process.argv[2])));
  }catch(e){console.error("STAGE20_HISTORY_JOURNAL_DENIED="+String(e.message||e));process.exitCode=1;}
}
