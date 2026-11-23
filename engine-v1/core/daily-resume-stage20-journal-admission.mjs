// Source-bound immutable history journal admission. The SHA in each filename
// hashes a typed JSON record in stable key order, NOT the raw file bytes.
// This module grants only journal PATH + CONTENT eligibility, never resume.
import {fingerprint} from "./season-closure-contract.js";
export const STAGE20_JOURNAL_PREFIX="data/history-recovery-journal/";
const JOURNAL_TYPES=Object.freeze({
  facts:"ai-matchlab.history-recovery-fact.v1",
  holds:"ai-matchlab.history-recovery-hold.v1",
  links:"ai-matchlab.history-recovery-link.v1"
});
const SHAPE=/^data\/history-recovery-journal\/(facts|holds|links)\/([a-f0-9]{64})\.json$/;
export function isApprovedStage20JournalPath(name) {
  return typeof name==="string" && SHAPE.test(name);
}
export function inspectStage20JournalRecord(path,raw) {
  const m=typeof path==="string"?SHAPE.exec(path):null;
  if(!m)return {ok:false,reason:"stage20_journal_path_invalid"};
  if(!Buffer.isBuffer(raw) && typeof raw!=="string")
    return {ok:false,reason:"stage20_journal_bytes_invalid"};
  const bytes=Buffer.isBuffer(raw)?raw:Buffer.from(raw,"utf8");
  if(bytes.length<2 || bytes.length>16*1024*1024)
    return {ok:false,reason:"stage20_journal_size_invalid"};
  let record;
  try {
    const decoded=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
    record=JSON.parse(decoded);
  }catch{return {ok:false,reason:"stage20_journal_json_invalid"};}
  if(!record || typeof record!=="object" || Array.isArray(record) ||
    record.schema!==JOURNAL_TYPES[m[1]])
    return {ok:false,reason:"stage20_journal_schema_invalid"};
  if(m[1]==="facts" && (!record.fact || typeof record.fact!=="object" ||
      Array.isArray(record.fact)))
    return {ok:false,reason:"stage20_journal_fact_invalid"};
  if(m[1]==="holds" && (typeof record.dayKey!=="string" ||
      !Array.isArray(record.errors) || !Array.isArray(record.eligible)))
    return {ok:false,reason:"stage20_journal_hold_invalid"};
  if(m[1]==="links" && (!record.decision || typeof record.decision!=="object" ||
      Array.isArray(record.decision)))
    return {ok:false,reason:"stage20_journal_link_invalid"};
  if(fingerprint(record)!==m[2])
    return {ok:false,reason:"stage20_journal_fingerprint_mismatch"};
  return {ok:true,reason:null,kind:m[1]};
}
