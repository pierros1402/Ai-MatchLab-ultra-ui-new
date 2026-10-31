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
    // Historical canonical fixtures may carry sourceId before sourceMatchId existed.
    // Use the fallback only when sourceMatchId is absent; never override a conflicting primary ID.
    // Provider identity may be stored in the source fields or providerIds map.
    // All populated identifiers for this provider must agree; a contradiction
    // is never rescued by a matching fallback.
    const ids=[row?.sourceMatchId,row?.sourceId,row?.providerIds?.[evidence.provider]]
      .filter(x=>x!==null && x!==undefined && String(x).trim()!=="")
      .map(x=>String(x).trim());
    if(ids.length===0 || new Set(ids).size!==1 ||
       ids[0]!==String(evidence.providerMatchId||"")) continue;
    matches.push({canonicalId:id,fixturePath:join("data","canonical-fixtures",first[1],entry)});
   }
  }
 } catch(error) {
  if(error?.code==="ENOENT" && error?.path===dir)
   return {status:"HOLD_CANONICAL_AMBIGUOUS_OR_MISSING",matches:[],reason:"canonical_day_directory_missing"};
  return {status:"HOLD_CANONICAL_EVIDENCE_UNREADABLE",reason:String(error.message)};
 }
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
  let output="";
  try {
   output=execFileSync("git",["grep","-l","-z","-F","-e",id,"--","data"],{
     cwd:root,maxBuffer:128*1024*1024,encoding:"utf8",stdio:["ignore","pipe","pipe"]
   });
  } catch(error) {
   // git grep returns status 1 for a valid search with zero matches.
   // Any other failure must remain fail-closed.
   if(error.status!==1 || String(error.stderr||"").trim())throw error;
  }
  for(const file of output.split("\0").filter(Boolean))paths.add(file);
 }
 const categories={CANONICAL:0,VERIFIED_FINAL:0,IMMUTABLE_OR_SETTLEMENT:0,
   DERIVED_REBUILD:0,OTHER_REVIEW:0};
 const references=[...paths].sort().map(file=>{
  const bytes=readFileSync(join(root,file),"utf8");
  const counts=ids.map(id=>bytes.split(id).length-1);
  const category=file.includes("/canonical-fixtures/")?"CANONICAL":
    file.includes("/final-results/")?"VERIFIED_FINAL":
    /\/history-index\//.test(file)?"DERIVED_REBUILD":
    /\/h2h\//.test(file)?"OTHER_REVIEW":
    /history|settlement|value-plan|value-pick/.test(file)?"IMMUTABLE_OR_SETTLEMENT":
    /deploy-snapshot|coverage|public-snapshot/.test(file)?"DERIVED_REBUILD":"OTHER_REVIEW";
  categories[category]++;
  const prescribedAction=category==="IMMUTABLE_OR_SETTLEMENT"?"PRESERVE_AND_RECONCILE_BY_APPEND":
    category==="DERIVED_REBUILD"?"DETERMINISTIC_REBUILD_REQUIRED":
    category==="VERIFIED_FINAL"?"PRESERVE_EVIDENCE_PENDING_ALIAS_ADJUDICATION":
    category==="CANONICAL"?"CANONICAL_AUTHORITY_READ_ONLY":
    "MANUAL_CONTRACT_REVIEW_REQUIRED";
  return {path:file,retainedOccurrences:counts[0],aliasOccurrences:counts[1],
    category,prescribedAction,writeAuthorized:false};
 });
 return {readOnly:true,approvedForWrite:false,retainedId,aliasId,
   fileCount:references.length,aliasOccurrenceCount:references.reduce((n,x)=>n+x.aliasOccurrences,0),
   retainedOccurrenceCount:references.reduce((n,x)=>n+x.retainedOccurrences,0),
   categories,writeSetApproved:false,automaticReplacementAuthorized:false,references};
}

// A bounded, non-executable reconciliation preflight: do not translate a
// source-bound candidate into a mutation without a complete dependency review.
export function buildHistoricalAliasPreflight(register) {
 if(register?.readOnly!==true || register?.approvedForWrite!==false ||
    !Array.isArray(register.safelyScopedCanonicalCandidates) ||
    !Array.isArray(register.cases)) throw Error("invalid_historical_register");
 const cases=new Map(register.cases.map(row=>[row.caseId,row]));
 const seen=new Set();
 const candidates=register.safelyScopedCanonicalCandidates.map(row=>{
   const item=cases.get(row.caseId);
   const dependency=row.dependencyAudit;
   const identifiersValid=typeof row.retainedCanonicalId==="string" &&
     typeof row.aliasCandidateId==="string" && row.retainedCanonicalId.length>0 &&
     row.aliasCandidateId.length>0 && row.retainedCanonicalId!==row.aliasCandidateId;
   const exactEvidence=item?.evidenceState==="DUPLICATE_CANDIDATE_REQUIRES_CANONICAL_PROOF" &&
     item?.canonicalAuthority?.status==="CANONICAL_SOURCE_BOUND_CANDIDATE" &&
     item.canonicalAuthority.canonicalId===row.retainedCanonicalId &&
     item.evidence.provider===row.provider &&
     item.evidence.providerMatchId===row.providerMatchId;
   const dependencyBound=dependency?.readOnly===true &&
     dependency.approvedForWrite===false &&
     dependency.writeSetApproved===false &&
     dependency.retainedId===row.retainedCanonicalId &&
     dependency.aliasId===row.aliasCandidateId &&
     Array.isArray(dependency.references);
   const references=dependencyBound ? dependency.references : [];
   const paths=references.map(ref=>ref?.path);
   const dependencyInventoryExact=dependencyBound &&
     Number.isSafeInteger(dependency.fileCount) &&
     dependency.fileCount===references.length &&
     paths.every(p=>typeof p==="string" && p.startsWith("data/")) &&
     new Set(paths).size===paths.length &&
     references.every(ref=>Number.isSafeInteger(ref.aliasOccurrences) &&
       Number.isSafeInteger(ref.retainedOccurrences) &&
       ref.aliasOccurrences>=0 && ref.retainedOccurrences>=0 &&
       ref.writeAuthorized===false) &&
     references.reduce((n,ref)=>n+ref.aliasOccurrences,0)===
       dependency.aliasOccurrenceCount &&
     references.reduce((n,ref)=>n+ref.retainedOccurrences,0)===
       dependency.retainedOccurrenceCount &&
     references.some(ref=>ref.path===row.firstPath &&
       ref.category==="VERIFIED_FINAL") &&
     references.some(ref=>ref.path===row.secondPath &&
       ref.category==="VERIFIED_FINAL");
   const uniquePair=!seen.has(row.aliasCandidateId);
   seen.add(row.aliasCandidateId);
   const preflightQualified=Boolean(identifiersValid && exactEvidence && dependencyInventoryExact && uniquePair);
   return {caseId:row.caseId,retainedCanonicalId:row.retainedCanonicalId,
     aliasCandidateId:row.aliasCandidateId,
     preflightQualified,
     dependencyFileCount:dependencyBound?dependency.fileCount:null,
     preservationRequired:true,independentTruthReviewRequired:true,
     h2hReconciliationRequired:true,derivedRebuildRequired:true,
     writeAuthorized:false};
 });
 return {schema:"ai-matchlab.historical-alias-preflight.v1",readOnly:true,
   approvedForWrite:false,writeSetApproved:false,
   candidateCount:candidates.length,
   preflightQualifiedCount:candidates.filter(x=>x.preflightQualified).length,
   blockedCount:candidates.filter(x=>!x.preflightQualified).length,
   candidates};
}

// A deterministic review manifest, deliberately not a sequence of file mutations.
export function buildHistoricalAliasReviewManifest(register,preflight=buildHistoricalAliasPreflight(register)) {
 if(preflight?.readOnly!==true || preflight?.approvedForWrite!==false ||
    preflight?.writeSetApproved!==false ||
    preflight.candidateCount!==register?.safelyScopedCanonicalCandidates?.length ||
    preflight.blockedCount!==0 || !Array.isArray(preflight.candidates) ||
    preflight.candidates.some(row=>row.preflightQualified!==true || row.writeAuthorized!==false))
   return {schema:"ai-matchlab.historical-alias-review-manifest.v1",
     readOnly:true,approvedForWrite:false,status:"HOLD_PREFLIGHT_INCOMPLETE",
     candidateCount:preflight?.candidateCount??null,entries:[]};
 const entries=register.safelyScopedCanonicalCandidates.map(row=>({
   caseId:row.caseId,retainedCanonicalId:row.retainedCanonicalId,
   aliasCandidateId:row.aliasCandidateId,
   provider:row.provider,providerMatchId:row.providerMatchId,
   evidencePaths:[row.firstPath,row.secondPath],
   dependencies:row.dependencyAudit.references.map(ref=>({
     path:ref.path,category:ref.category,
     prescribedAction:ref.prescribedAction,
     aliasOccurrences:ref.aliasOccurrences,
     retainedOccurrences:ref.retainedOccurrences
   })).sort((a,b)=>a.path.localeCompare(b.path)),
   requiredProofs:["INDEPENDENT_RESULT_TRUTH","IMMUTABLE_HISTORY_RETENTION",
     "H2H_RECONCILIATION","DETERMINISTIC_DERIVED_REBUILD",
     "SOURCE_BOUND_FULL_REGRESSION"],
   writeAuthorized:false
 })).sort((a,b)=>a.caseId.localeCompare(b.caseId));
 return {schema:"ai-matchlab.historical-alias-review-manifest.v1",
   readOnly:true,approvedForWrite:false,status:"READY_FOR_INDEPENDENT_REVIEW_NOT_WRITE",
   candidateCount:entries.length,entries};
}

// Source-bound evidence only. Capture the exact bytes of every dependency
// and reject missing/unreadable paths without ever mutating tracked files.
export function buildHistoricalAliasSourceBoundManifest(review,root) {
 if(review?.readOnly!==true || review?.approvedForWrite!==false ||
    review?.status!=="READY_FOR_INDEPENDENT_REVIEW_NOT_WRITE" ||
    !Array.isArray(review.entries) || !root)
   return {schema:"ai-matchlab.historical-alias-source-bound.v1",
     readOnly:true,approvedForWrite:false,status:"HOLD_REVIEW_INCOMPLETE",files:[]};
 const paths=[...new Set(review.entries.flatMap(row=>[
   ...(Array.isArray(row.evidencePaths)?row.evidencePaths:[]),
   ...(Array.isArray(row.dependencies)?row.dependencies.map(x=>x.path):[])
 ]))].sort();
 const files=paths.map(file=>{
   if(typeof file!=="string" || !(file.startsWith("data/") && /^[A-Za-z0-9_./~-]+$/.test(file.slice(5))) ||
      file.split("/").includes(".."))
     return {path:file,status:"HOLD_INVALID_PATH"};
   try {
     const bytes=readFileSync(join(root,file));
     return {path:file,status:"SHA256_BOUND",bytes:bytes.length,
       sha256:createHash("sha256").update(bytes).digest("hex")};
   }catch(error){
     return {path:file,status:"HOLD_UNREADABLE",errorCode:error.code||"UNKNOWN"};
   }
 });
 return {schema:"ai-matchlab.historical-alias-source-bound.v1",
   readOnly:true,approvedForWrite:false,
   status:files.every(row=>row.status==="SHA256_BOUND")
     ? "SOURCE_HASHES_CAPTURED_NOT_AUTHORIZED_FOR_WRITE" : "HOLD_SOURCE_BINDING",
   uniqueFileCount:files.length,
   inventorySha256:createHash("sha256").update(JSON.stringify(files)).digest("hex"),
   files};
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
   const canonicalAuthority=root ? findCanonicalAuthorityForCase(root,evidence) : null;
   return {caseId:"HIST-"+digest.slice(0,20),
     evidenceState,candidateOperation,
     canonicalAuthority,
     classification:row.scoreAgreement===false?"SCORE_CONFLICT":
       row.kickoffAgreement===false?"KICKOFF_CONFLICT":
       row.scoreAgreement===true?"SAME_SCORE_IDENTITY_CONFLICT":"INCOMPLETE_SCORE_EVIDENCE",
     disposition:"HOLD_FOR_SOURCE_ADJUDICATION",
     // A source-bound canonical identity is a read-only reconciliation lead,
     // not authority to select a conflicting score or apply an alias.
     reconciliationLead:canonicalAuthority?.status==="CANONICAL_SOURCE_BOUND_CANDIDATE"
         ? {retainedCanonicalId:canonicalAuthority.canonicalId,
            fixturePath:canonicalAuthority.fixturePath,
            evidenceState,firstMatchId:evidence.firstMatchId,
            secondMatchId:evidence.secondMatchId,
            requiredAction:"INDEPENDENT_FINAL_AND_KICKOFF_ADJUDICATION",
            approvedForWrite:false}
         : null,
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
   reconciliationGate:{
     status:"HOLD_UNTIL_DEPENDENCIES_ADJUDICATED",
     sourceBoundCandidateCount:cases.filter(item=>
       item.evidenceState==="DUPLICATE_CANDIDATE_REQUIRES_CANONICAL_PROOF" &&
       item.canonicalAuthority?.status==="CANONICAL_SOURCE_BOUND_CANDIDATE").length,
     unresolvedCases:cases.length+audit.unverifiable.length,
     approvedWriteActions:0,
     requiredEvidence:["immutable_history_retention","verified_final_alias_lineage",
       "deterministic_derived_rebuild","H2H_reconciliation","full_regression"],
     approvedForWrite:false
   },
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
 output.aliasPreflight=buildHistoricalAliasPreflight(output);
 output.aliasReviewManifest=buildHistoricalAliasReviewManifest(output,output.aliasPreflight);
 output.aliasSourceBoundManifest=buildHistoricalAliasSourceBoundManifest(output.aliasReviewManifest,process.cwd());
 console.log(JSON.stringify(output,null,2));
 if(output.duplicateCases || output.unverifiableCases)process.exitCode=1;
}
