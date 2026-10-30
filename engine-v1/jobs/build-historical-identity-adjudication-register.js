import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {resolve,join} from "node:path";
import {readdirSync,readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {auditAllVerifiedFinalProviderIdentities} from "./audit-all-verified-final-provider-identities.js";

// Resolve authoritative canonical IDs from the committed fixture store.
// Evidence only: matching a canonical row never authorizes dependent writes.
export function findCanonicalAuthorityForCase(root, evidence) {
 const first=evidence?.firstPath?.match(/^data\/final-results\/(\d{4}-\d{2}-\d{2})\//);
 const second=evidence?.secondPath?.match(/^data\/final-results\/(\d{4}-\d{2}-\d{2})\//);
 if(!first || !second || first[1]!==second[1]) return {status:"HOLD_CROSS_DAY"};
 const dir=join(root,"data","canonical-fixtures",first[1]);
 const matches=[];
 try {
  for(const entry of readdirSync(dir).filter(name=>name.endsWith(".json"))) {
   const doc=JSON.parse(readFileSync(join(dir,entry),"utf8"));
   for(const row of Array.isArray(doc?.fixtures)?doc.fixtures:[]) {
    const id=row?.canonicalId||row?.matchId;
    if(![evidence.firstMatchId,evidence.secondMatchId].includes(id)) continue;
    if(String(row?.source||"").toLowerCase()!==String(evidence.provider||"").toLowerCase()) continue;
    if(String(row?.sourceMatchId||"")!==String(evidence.providerMatchId||"")) continue;
    matches.push({canonicalId:id,fixturePath:join("data","canonical-fixtures",first[1],entry)});
   }
  }
 } catch(error) {return {status:"HOLD_CANONICAL_EVIDENCE_UNREADABLE",reason:String(error.message)};}
 const ids=[...new Set(matches.map(x=>x.canonicalId))];
 if(ids.length!==1)return {status:"HOLD_CANONICAL_AMBIGUOUS_OR_MISSING",matches};
 return {status:"CANONICAL_SOURCE_BOUND_CANDIDATE",canonicalId:ids[0],
   fixturePath:matches[0].fixturePath,approvedForWrite:false,
   dependencyInventoryVerified:false};
}

// Read-only, exact-byte reference census across tracked data files.
export function inventoryAliasDependencies(root, retainedId, aliasId) {
 if(!retainedId || !aliasId || retainedId===aliasId) throw Error("invalid_alias_pair");
 const ids=[retainedId,aliasId], paths=new Set();
 for(const id of ids) {
  const matches=execFileSync("git",["grep","-l","-z","-F","-e",id,"--","data"],{
    cwd:root,maxBuffer:128*1024*1024,encoding:"utf8"
  }).split("\0").filter(Boolean);
  for(const file of matches)paths.add(file);
 }
 const categories={CANONICAL:0,VERIFIED_FINAL:0,IMMUTABLE_OR_SETTLEMENT:0,
   DERIVED_REBUILD:0,OTHER_REVIEW:0};
 const references=[...paths].sort().map(file=>{
  const bytes=readFileSync(join(root,file),"utf8");
  const counts=ids.map(id=>bytes.split(id).length-1);
  const category=file.includes("/canonical-fixtures/")?"CANONICAL":
    file.includes("/final-results/")?"VERIFIED_FINAL":
    /history|settlement|value-plan|value-pick/.test(file)?"IMMUTABLE_OR_SETTLEMENT":
    /deploy-snapshot|coverage|public-snapshot/.test(file)?"DERIVED_REBUILD":"OTHER_REVIEW";
  categories[category]++;
  return {path:file,retainedOccurrences:counts[0],aliasOccurrences:counts[1],category};
 });
 return {readOnly:true,approvedForWrite:false,retainedId,aliasId,
   fileCount:references.length,aliasOccurrenceCount:references.reduce((n,x)=>n+x.aliasOccurrences,0),
   retainedOccurrenceCount:references.reduce((n,x)=>n+x.retainedOccurrences,0),
   categories,references};
}

// Deterministic read-only case registry; no automatic authority assignment.
export function buildHistoricalIdentityAdjudicationRegister(audit,root=null) {
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
     canonicalAuthority:root ? findCanonicalAuthorityForCase(root,evidence) : null,
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
   classificationCounts:Object.fromEntries(
     ["SCORE_CONFLICT","KICKOFF_CONFLICT","SAME_SCORE_IDENTITY_CONFLICT","INCOMPLETE_SCORE_EVIDENCE"]
       .map(name=>[name,cases.filter(item=>item.classification===name).length])),
   evidenceStateCounts:Object.fromEntries(
     ["CONTRADICTORY_TERMINAL_SCORE","CONTRADICTORY_KICKOFF",
       "DUPLICATE_CANDIDATE_REQUIRES_CANONICAL_PROOF",
       "INSUFFICIENT_INDEPENDENT_IDENTITY_PROOF"]
       .map(name=>[name,cases.filter(item=>item.evidenceState===name).length])),
   nonExecutableCandidateCount:cases.filter(item=>item.candidateOperation!==null).length,
   canonicalAuthorityCounts:Object.fromEntries(
     ["CANONICAL_SOURCE_BOUND_CANDIDATE","HOLD_CROSS_DAY",
      "HOLD_CANONICAL_AMBIGUOUS_OR_MISSING","HOLD_CANONICAL_EVIDENCE_UNREADABLE"]
       .map(status=>[status,cases.filter(item=>item.canonicalAuthority?.status===status).length])),
   safelyScopedCanonicalCandidates:cases.filter(item=>
     item.evidenceState==="DUPLICATE_CANDIDATE_REQUIRES_CANONICAL_PROOF" &&
     item.canonicalAuthority?.status==="CANONICAL_SOURCE_BOUND_CANDIDATE")
     .map(item=>({caseId:item.caseId,
       retainedCanonicalId:item.canonicalAuthority.canonicalId,
       aliasCandidateId:item.evidence.firstMatchId===item.canonicalAuthority.canonicalId
         ? item.evidence.secondMatchId : item.evidence.firstMatchId,
       provider:item.evidence.provider,providerMatchId:item.evidence.providerMatchId,
       firstPath:item.evidence.firstPath,secondPath:item.evidence.secondPath,
       dependencyAudit:root ? inventoryAliasDependencies(root,
         item.canonicalAuthority.canonicalId,
         item.evidence.firstMatchId===item.canonicalAuthority.canonicalId
           ? item.evidence.secondMatchId : item.evidence.firstMatchId)
         : "NOT_EXECUTED",writeAuthorized:false})),
   safelyScopedCanonicalCandidateCount:cases.filter(item=>
     item.evidenceState==="DUPLICATE_CANDIDATE_REQUIRES_CANONICAL_PROOF" &&
     item.canonicalAuthority?.status==="CANONICAL_SOURCE_BOUND_CANDIDATE").length,
   canonicalSourceBoundCases:cases.filter(item=>
     item.canonicalAuthority?.status==="CANONICAL_SOURCE_BOUND_CANDIDATE")
     .map(item=>({caseId:item.caseId,provider:item.evidence.provider,
       providerMatchId:item.evidence.providerMatchId,
       retainedCanonicalId:item.canonicalAuthority.canonicalId,
       fixturePath:item.canonicalAuthority.fixturePath,
       approvedForWrite:false,dependencyInventoryVerified:false})),
   cases,unverifiable:audit.unverifiable};
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const output=buildHistoricalIdentityAdjudicationRegister(
   auditAllVerifiedFinalProviderIdentities(process.cwd()),process.cwd());
 console.log(JSON.stringify(output,null,2));
 if(output.duplicateCases || output.unverifiableCases)process.exitCode=1;
}
