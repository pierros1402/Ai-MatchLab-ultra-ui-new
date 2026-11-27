// Cryptographic candidate verification only; no production witness is enrolled.
// Repair-authorization keys are deliberately NOT reused for runtime attestation.
import {createHash,createPublicKey,verify} from "node:crypto";
import {auditInvocationManifestBytes} from "./daily-resume-invocation-manifest-byte-audit.mjs";
const SCHEMA="ai-matchlab.daily-runtime-witness-attestation.v1";
const DOMAIN="AI_MATCHLAB_DAILY_RUNTIME_WITNESS_V1\0";
const hex=/^[a-f0-9]{64}$/;
export const DAILY_RUNTIME_WITNESS_TRUST=Object.freeze([]);
const hash=x=>createHash("sha256").update(x).digest("hex");
function need(ok,reason){if(!ok)throw Error(reason);}
const fields=["schema","witnessId","keySha256","receiptSha256","captureEvidenceSha256","observedAtMs","signature"];
export function runtimeWitnessSigningBytes(a){
 return Buffer.from(DOMAIN+JSON.stringify({schema:a.schema,witnessId:a.witnessId,keySha256:a.keySha256,receiptSha256:a.receiptSha256,captureEvidenceSha256:a.captureEvidenceSha256,observedAtMs:a.observedAtMs}),"utf8");
}
// Explicitly untrusted candidate key verification, useful for offline testing.
export function verifyRuntimeWitnessSignatureCandidate({attestation:a,publicKeyPem,receipt,captureEvidenceSha256}={}){
 try{
  need(a&&Object.keys(a).length===fields.length&&fields.every(k=>Object.hasOwn(a,k))&&a.schema===SCHEMA,"witness_shape_invalid");
  need(typeof a.witnessId==="string"&&/^[a-z0-9][a-z0-9._-]{0,63}$/.test(a.witnessId),"witness_id_invalid");
  need(typeof a.keySha256==="string"&&hex.test(a.keySha256)&&typeof a.receiptSha256==="string"&&hex.test(a.receiptSha256)&&a.receiptSha256===receipt?.receiptSha256,"witness_receipt_binding_invalid");
  need(typeof a.captureEvidenceSha256==="string"&&hex.test(a.captureEvidenceSha256)&&a.captureEvidenceSha256===captureEvidenceSha256,"witness_capture_binding_invalid");
  need(Number.isSafeInteger(a.observedAtMs)&&Number.isSafeInteger(receipt.completedAtMs)&&a.observedAtMs>=receipt.completedAtMs,"witness_time_invalid");
  const key=createPublicKey(publicKeyPem);
  need(key.asymmetricKeyType==="ed25519"&&hash(key.export({type:"spki",format:"der"}))===a.keySha256,"witness_key_mismatch");
  need(typeof a.signature==="string"&&a.signature.length===88,"witness_signature_encoding_invalid");
  const sig=Buffer.from(a.signature,"base64");
  need(sig.length===64&&sig.toString("base64")===a.signature,"witness_signature_encoding_invalid");
  need(verify(null,runtimeWitnessSigningBytes(a),key,sig),"witness_signature_invalid");
  return {signatureValid:true,reason:null,trustedWitness:false,runtimeAttested:false,resumeAuthorized:false,publicationAuthorized:false};
 }catch(e){return {signatureValid:false,reason:e.message,trustedWitness:false,runtimeAttested:false,resumeAuthorized:false,publicationAuthorized:false};}
}
export function auditIndependentRuntimeAttestation({evidence,attestation,captureEvidenceSha256}={}){
 const deny=reason=>({accepted:false,reason,trustedWitness:false,runtimeAttested:false,checkpointReusable:false,resumeAuthorized:false,publicationAuthorized:false});
 try{
  const keys=DAILY_RUNTIME_WITNESS_TRUST.filter(k=>k.witnessId===attestation?.witnessId&&k.keySha256===attestation?.keySha256);
  need(keys.length===1,"witness_not_enrolled");
  const bytes=auditInvocationManifestBytes(evidence);
  need(bytes.accepted===true,"witness_manifest_audit_failed");
  const checked=verifyRuntimeWitnessSignatureCandidate({attestation,publicKeyPem:keys[0].publicKeyPem,receipt:evidence.receipt,captureEvidenceSha256});
  need(checked.signatureValid,"witness_signature_rejected");
  // Even an enrolled signature must not substitute for a verified capture
  // protocol, separation of custody, source closure, or replay admission.
  return deny("witness_capture_protocol_not_qualified");
 }catch(e){return deny(e.message);}
}
