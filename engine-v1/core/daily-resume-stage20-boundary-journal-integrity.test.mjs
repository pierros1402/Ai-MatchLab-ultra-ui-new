import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {auditStage20RuntimeJournal as audit} from "./daily-resume-stage20-boundary-journal-integrity.mjs";
import {JOURNAL_SCHEMA} from "../jobs/observe-daily-runtime-boundaries.mjs";
const sha=x=>crypto.createHash("sha256").update(x).digest("hex");
const DAY="2026-11-24";
const source='console.log("[daily-cycle] acquisition:start");\n'+
 'console.log("[daily-cycle] acquisition:done");\n'+
 'console.log("[daily-cycle] gate:done");\n';
const digest=sha(source);
function event(stageId,phase,offset=0,sourceHash=digest) {
  return {schema:JOURNAL_SCHEMA,dayKey:DAY,sourceSha256:sourceHash,
    stageId,phase,observedAt:new Date(Date.UTC(2026,10,24,7,0,offset)).toISOString(),
    resumeAuthorized:false,publicationAuthorized:false};
}
const good=()=>[event("acquisition","start"),event("acquisition","done",1),event("gate","done",2)];
const run=(events=good(),options={})=>audit({
  cycleSource:source,dayKey:DAY,sourceSha256:digest,events,...options});
test("source-bound complete synthetic markers pass integrity but never checkpoint authority",()=>{
  const r=run();
  assert.equal(r.accepted,true);
  assert.equal(r.sourcePairedMarkerCount,1);
  assert.equal(r.observedPairedDone,1);
  assert.equal(r.observedDoneOnly,1);
  assert.equal(r.observedIncompletePairs,0);
  assert.equal(r.completeCycleProven,false);
  assert.equal(r.checkpointReusable,false);
  assert.equal(r.resumeAuthorized,false);
  assert.equal(r.publicationAuthorized,false);
});
test("partial crash journal is valid diagnostic but has an unfinished pair",()=>{
  const r=run([event("acquisition","start")]);
  assert.equal(r.accepted,true);
  assert.equal(r.observedIncompletePairs,1);
  assert.equal(r.completeCycleProven,false);
});
test("unknown marker cannot impersonate source stage",()=>{
  assert.equal(run([event("fabricated","start")]).reason,
    "stage20_journal_unknown_source_marker");
});
test("a done without a corresponding start must be denied",()=>{
  assert.equal(run([event("acquisition","done")]).reason,
    "stage20_journal_done_without_single_start");
});
test("duplicate starts and duplicate done receipts are rejected",()=>{
  assert.equal(run([event("acquisition","start"),event("acquisition","start",1)]).reason,
    "stage20_journal_duplicate_or_reversed_start");
  assert.equal(run([...good(),event("acquisition","done",3)]).reason,
    "stage20_journal_done_without_single_start");
});
test("tampered source and mismatched source SHA are denied",()=>{
  assert.equal(run(good(),{cycleSource:source+"// changed\n"}).reason,
    "stage20_journal_source_sha_mismatch");
  assert.equal(run([event("acquisition","start",0,"a".repeat(64))]).reason,
    "stage20_journal_event_binding_invalid");
});
test("wrong day, bad timestamp and reverse timeline fail",()=>{
  assert.equal(run([{...event("acquisition","start"),dayKey:"2026-11-23"}]).accepted,false);
  assert.equal(run([event("acquisition","start",2),event("acquisition","done",1)]).reason,
    "stage20_journal_timestamp_invalid");
  assert.equal(run([{...event("acquisition","start"),observedAt:"not-a-date"}]).accepted,false);
});
test("done-only markers can never be reported as start events",()=>{
  assert.equal(run([event("gate","start")]).reason,"stage20_journal_doneonly_invalid");
});
test("production source inventory of 63 pairs remains source-bound and nonresumable",()=>{
  const text=fs.readFileSync(path.join(process.cwd(),
    "engine-v1/jobs/run-daily-cycle.js"),"utf8");
  const s=sha(text);
  const x=audit({cycleSource:text,dayKey:DAY,sourceSha256:s,
    events:[{schema:JOURNAL_SCHEMA,dayKey:DAY,sourceSha256:s,
      stageId:"provider-competition-discovery",phase:"start",
      observedAt:"2026-11-24T09:00:00.000Z",
      resumeAuthorized:false,publicationAuthorized:false}]});
  assert.equal(x.accepted,true);
  assert.equal(x.sourcePairedMarkerCount,63);
  assert.equal(x.sourceDoneOnlyMarkerCount,7);
  assert.equal(x.observedIncompletePairs,1);
  assert.equal(x.completeCycleProven,false);
});
