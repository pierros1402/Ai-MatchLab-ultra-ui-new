import test from "node:test";
import assert from "node:assert/strict";
import {createHash,generateKeyPairSync,sign} from "node:crypto";
import {DAILY_RUNTIME_WITNESS_TRUST,runtimeWitnessSigningBytes,verifyRuntimeWitnessSignatureCandidate,auditIndependentRuntimeAttestation} from "./daily-resume-runtime-witness-attestation.mjs";
function fixture(){
 const {publicKey,privateKey}=generateKeyPairSync("ed25519");
 const publicKeyPem=publicKey.export({type:"spki",format:"pem"});
 const keySha256=createHash("sha256").update(publicKey.export({type:"spki",format:"der"})).digest("hex");
 const receipt={receiptSha256:"a".repeat(64),completedAtMs:100};
 const captureEvidenceSha256="b".repeat(64);
 const a={schema:"ai-matchlab.daily-runtime-witness-attestation.v1",witnessId:"synthetic-witness",keySha256,receiptSha256:receipt.receiptSha256,captureEvidenceSha256,observedAtMs:101};
 const attestation={...a,signature:sign(null,runtimeWitnessSigningBytes(a),privateKey).toString("base64")};
 return {attestation,publicKeyPem,receipt,captureEvidenceSha256};
}
test("valid synthetic witness signature grants no trust or execution authority",()=>{
 const f=fixture(),r=verifyRuntimeWitnessSignatureCandidate(f);
 assert.equal(r.signatureValid,true,r.reason);
 for(const k of ["trustedWitness","runtimeAttested","resumeAuthorized","publicationAuthorized"])assert.equal(r[k],false);
});
test("wrong key and tampered signature rejected",()=>{
 const f=fixture();
 assert.equal(verifyRuntimeWitnessSignatureCandidate({...f,publicKeyPem:fixture().publicKeyPem}).signatureValid,false);
 const signature=Buffer.alloc(64).toString("base64");
 assert.equal(verifyRuntimeWitnessSignatureCandidate({...f,attestation:{...f.attestation,signature}}).signatureValid,false);
});
test("cross receipt and cross capture signatures rejected",()=>{
 const f=fixture();
 assert.equal(verifyRuntimeWitnessSignatureCandidate({...f,receipt:{...f.receipt,receiptSha256:"c".repeat(64)}}).signatureValid,false);
 assert.equal(verifyRuntimeWitnessSignatureCandidate({...f,captureEvidenceSha256:"d".repeat(64)}).signatureValid,false);
});
test("premature witness and injected authority fields rejected",()=>{
 const f=fixture();
 assert.equal(verifyRuntimeWitnessSignatureCandidate({...f,attestation:{...f.attestation,observedAtMs:99}}).signatureValid,false);
 assert.equal(verifyRuntimeWitnessSignatureCandidate({...f,attestation:{...f.attestation,resumeAuthorized:true}}).signatureValid,false);
});
test("no production witness enrolled and caller key cannot grant trust",()=>{
 const f=fixture();
 assert.equal(DAILY_RUNTIME_WITNESS_TRUST.length,0);
 assert.ok(Object.isFrozen(DAILY_RUNTIME_WITNESS_TRUST));
 const r=auditIndependentRuntimeAttestation({...f,evidence:{receipt:f.receipt},trustedKeys:[f]});
 assert.equal(r.reason,"witness_not_enrolled");
 for(const k of ["accepted","trustedWitness","runtimeAttested","checkpointReusable","resumeAuthorized","publicationAuthorized"])assert.equal(r[k],false);
});
