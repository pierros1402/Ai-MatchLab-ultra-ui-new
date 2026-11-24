// Read-only source-bound runtime journal integrity audit.
// Log markers are observations, NOT durable stage checkpoint receipts.
import crypto from "node:crypto";
import {auditCompleteCycleMarkerInventory} from "./daily-resume-stage-boundary-audit.mjs";
import {JOURNAL_SCHEMA} from "../jobs/observe-daily-runtime-boundaries.mjs";
export const STAGE20_JOURNAL_INTEGRITY_SCHEMA="ai-matchlab.daily-stage20-boundary-journal-integrity.v1";
const HEX=/^[a-f0-9]{64}$/;
const DAY=/^\d{4}-\d{2}-\d{2}$/;
const hash=bytes=>crypto.createHash("sha256").update(bytes).digest("hex");
const deny=reason=>({schema:STAGE20_JOURNAL_INTEGRITY_SCHEMA,
  accepted:false,reason,runtimeMarkersIntegrityVerified:false,
  completeCycleProven:false,stageOutputsVerified:false,
  checkpointReusable:false,resumeAuthorized:false,publicationAuthorized:false});
export function auditStage20RuntimeJournal({cycleSource,dayKey,events,sourceSha256}={}){
  if(typeof cycleSource!=="string" || !cycleSource.length ||
     !DAY.test(dayKey||"") || !HEX.test(sourceSha256||"") ||
     !Array.isArray(events) || events.length===0 || events.length>100000)
    return deny("stage20_journal_input_invalid");
  try {
    if(hash(Buffer.from(cycleSource,"utf8"))!==sourceSha256)
      return deny("stage20_journal_source_sha_mismatch");
    const source=auditCompleteCycleMarkerInventory(cycleSource);
    if(source.cycleSha256!==sourceSha256)
      return deny("stage20_journal_source_fingerprint_mismatch");
    const pairIDs=new Set(source.pairs.map(s=>s.id));
    const doneOnlyIDs=new Set(source.doneOnly.map(s=>s.id));
    const byID=new Map();
    let lastAt=-Infinity,pairedDone=0,doneOnly=0;
    const signature=crypto.createHash("sha256");
    for(const row of events){
      if(!row || row.schema!==JOURNAL_SCHEMA ||
         row.dayKey!==dayKey || row.sourceSha256!==sourceSha256 ||
         row.resumeAuthorized!==false || row.publicationAuthorized!==false ||
         typeof row.stageId!=="string" ||
         !["start","done"].includes(row.phase) ||
         typeof row.observedAt!=="string" ||
         !/^\d{4}-\d{2}-\d{2}T/.test(row.observedAt))
        return deny("stage20_journal_event_binding_invalid");
      const at=Date.parse(row.observedAt);
      if(!Number.isFinite(at) || at<lastAt)
        return deny("stage20_journal_timestamp_invalid");
      lastAt=at;
      const knownPair=pairIDs.has(row.stageId);
      const knownDoneOnly=doneOnlyIDs.has(row.stageId);
      if(!knownPair && !knownDoneOnly)
        return deny("stage20_journal_unknown_source_marker");
      const previous=byID.get(row.stageId)||0;
      if(knownPair){
        if(row.phase==="start" && previous!==0)
          return deny("stage20_journal_duplicate_or_reversed_start");
        if(row.phase==="done" && previous!==1)
          return deny("stage20_journal_done_without_single_start");
        byID.set(row.stageId,row.phase==="start"?1:2);
        if(row.phase==="done")pairedDone++;
      }else{
        if(row.phase!=="done" || previous!==0)
          return deny("stage20_journal_doneonly_invalid");
        byID.set(row.stageId,2);
        doneOnly++;
      }
      // Hash only strictly validated fixed-field receipt values.
      signature.update(JSON.stringify(row));signature.update("\n");
    }
    const startedOnly=[...byID.values()].filter(state=>state===1).length;
    return {schema:STAGE20_JOURNAL_INTEGRITY_SCHEMA,
      accepted:true,reason:null,dayKey,sourceSha256,
      sourcePairedMarkerCount:source.pairedCount,
      sourceDoneOnlyMarkerCount:source.doneOnlyCount,
      observedEvents:events.length,observedPairedDone:pairedDone,
      observedDoneOnly:doneOnly,observedIncompletePairs:startedOnly,
      canonicalJournalSha256:signature.digest("hex"),
      // A successful process exit, conditional branch coverage, stage outputs,
      // upstream dependencies and external freshness have not been attested.
      runtimeMarkersIntegrityVerified:true,completeCycleProven:false,
      stageOutputsVerified:false,checkpointReusable:false,
      resumeAuthorized:false,publicationAuthorized:false};
  }catch{return deny("stage20_journal_source_audit_failure");}
}
