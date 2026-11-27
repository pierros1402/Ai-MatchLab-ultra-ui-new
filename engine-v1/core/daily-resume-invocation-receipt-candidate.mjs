// Candidate receipt integrity, NOT independent runtime attestation.
import {createHash} from "node:crypto";
import {invocationKey,verifyInvocationSource} from "./daily-resume-runtime-invocations.mjs";
const schema="ai-matchlab.daily-invocation-receipt-candidate.v1";
const hex=/^[a-f0-9]{64}$/, commit=/^[a-f0-9]{40}$/;
const hash=x=>createHash("sha256").update(x).digest("hex");
function need(ok,reason){if(!ok)throw Error(reason);}
function bindingOf(b,source,census){
 verifyInvocationSource(source,census);
 need(b&&typeof b.dayKey==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(b.dayKey)&&Number.isFinite(Date.parse(b.dayKey+"T00:00:00Z"))&&new Date(b.dayKey+"T00:00:00Z").toISOString().slice(0,10)===b.dayKey,"receipt_day_invalid");
 need(typeof b.producerCommit==="string"&&commit.test(b.producerCommit)&&typeof b.runId==="string"&&/^[1-9][0-9]{0,18}$/.test(b.runId)&&Number.isSafeInteger(b.runAttempt)&&b.runAttempt>0,"receipt_run_binding_invalid");
 need(typeof b.sourceSha256==="string"&&b.sourceSha256===hash(source),"receipt_source_mismatch");
 return {dayKey:b.dayKey,producerCommit:b.producerCommit,runId:b.runId,runAttempt:b.runAttempt,sourceSha256:b.sourceSha256};
}
function bodyOf(binding,row){
 const key=invocationKey(row.id,row.scope);
 need(row.status==="completed"&&row.exitCode===0&&row.signal===null,"receipt_completion_unproven");
 need(Number.isSafeInteger(row.startedAtMs)&&row.startedAtMs>=0&&Number.isSafeInteger(row.completedAtMs)&&row.completedAtMs>=row.startedAtMs,"receipt_time_invalid");
 for(const k of ["inputManifestSha256","outputManifestSha256","deltaManifestSha256"])
  need(typeof row[k]==="string"&&hex.test(row[k]),"receipt_manifest_digest_invalid");
 return {schema,...binding,key,id:row.id,scope:row.scope,status:row.status,exitCode:row.exitCode,signal:row.signal,startedAtMs:row.startedAtMs,completedAtMs:row.completedAtMs,inputManifestSha256:row.inputManifestSha256,outputManifestSha256:row.outputManifestSha256,deltaManifestSha256:row.deltaManifestSha256};
}
export function createInvocationReceiptCandidate({binding,source,census,row}){
 const body=bodyOf(bindingOf(binding,source,census),row);
 return {...body,receiptSha256:hash(JSON.stringify(body))};
}
export function auditInvocationReceiptCandidate({binding,source,census,receipt}={}){
 const denied=reason=>({accepted:false,reason,receiptIntegrityVerified:false,runtimeAttested:false,manifestBytesVerified:false,checkpointReusable:false,resumeAuthorized:false,publicationAuthorized:false});
 try{
  const expected=createInvocationReceiptCandidate({binding,source,census,row:receipt});
  need(JSON.stringify(receipt)===JSON.stringify(expected),"receipt_binding_or_integrity_mismatch");
  return {accepted:true,reason:null,receiptSha256:expected.receiptSha256,receiptIntegrityVerified:true,runtimeAttested:false,manifestBytesVerified:false,checkpointReusable:false,resumeAuthorized:false,publicationAuthorized:false};
 }catch(e){return denied(e.message);}
}
