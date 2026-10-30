import {createHash} from "node:crypto";
import {resolve} from "node:path";
import {fileURLToPath} from "node:url";
import {auditAllVerifiedFinalProviderIdentities} from "./audit-all-verified-final-provider-identities.js";

// Deterministic read-only case registry; no automatic authority assignment.
export function buildHistoricalIdentityAdjudicationRegister(audit) {
 if(!audit || audit.readOnly!==true || !Array.isArray(audit.duplicates) ||
    !Array.isArray(audit.unverifiable)) throw Error("source_audit_invalid");
 const cases=audit.duplicates.map(row=>{
   const evidence={provider:row.provider,providerMatchId:row.providerMatchId,
     firstPath:row.firstPath,secondPath:row.secondPath,
     firstMatchId:row.firstMatchId,secondMatchId:row.secondMatchId,
     firstScore:row.firstScore,secondScore:row.secondScore,
     firstKickoffUtc:row.firstKickoffUtc||null,
     secondKickoffUtc:row.secondKickoffUtc||null,
     firstProviderTerminal:row.firstProviderTerminal,
     secondProviderTerminal:row.secondProviderTerminal};
   const digest=createHash("sha256").update(JSON.stringify(evidence)).digest("hex");
   const identicalScore=row.scoreAgreement===true;
   const identicalKickoff=row.kickoffAgreement===true;
   const sameFixtureEvidence=identicalScore && identicalKickoff &&
     row.firstMatchId && row.secondMatchId;
   const distinctScores=row.scoreAgreement===false;
   const distinctKickoff=row.kickoffAgreement===false;
   const evidenceState=distinctScores?"CONTRADICTORY_TERMINAL_SCORE":
     distinctKickoff?"CONTRADICTORY_KICKOFF":
     sameFixtureEvidence?"DUPLICATE_CANDIDATE_REQUIRES_CANONICAL_PROOF":
     "INSUFFICIENT_INDEPENDENT_IDENTITY_PROOF";
   // Never infer the retained canonical row from sort order or file age.
   const candidateOperation=sameFixtureEvidence ?
     {kind:"PROPOSE_ALIAS_RECONCILIATION",fromMatchId:null,
       toMatchId:null,requiresExternalCanonicalProof:true,
       requiresDependencyInventory:true,approvedForWrite:false} : null;
   return {caseId:"HIST-"+digest.slice(0,20),
     evidenceState,candidateOperation,
     classification:row.scoreAgreement===false?"SCORE_CONFLICT":
       row.kickoffAgreement===false?"KICKOFF_CONFLICT":
       row.scoreAgreement===true?"SAME_SCORE_IDENTITY_CONFLICT":"INCOMPLETE_SCORE_EVIDENCE",
     disposition:"HOLD_FOR_SOURCE_ADJUDICATION",
     canonicalRetainedId:null,approvedForWrite:false,
     evidence};
 }).sort((a,b)=>a.caseId.localeCompare(b.caseId));
 return {schema:"ai-matchlab.historical-identity-adjudication-register.v1",
   readOnly:true,approvedForWrite:false,requiresHumanAdjudication:true,
   sourceTrackedFinalFiles:audit.trackedFinalFiles,
   duplicateCases:cases.length,unverifiableCases:audit.unverifiable.length,
   cases,unverifiable:audit.unverifiable};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const output=buildHistoricalIdentityAdjudicationRegister(
   auditAllVerifiedFinalProviderIdentities(process.cwd()));
 console.log(JSON.stringify(output,null,2));
 if(output.duplicateCases || output.unverifiableCases)process.exitCode=1;
}
