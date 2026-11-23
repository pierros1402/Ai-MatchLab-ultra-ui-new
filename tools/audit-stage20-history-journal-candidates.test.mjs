import test from "node:test";
import assert from "node:assert/strict";
import {fingerprint} from "../engine-v1/core/season-closure-contract.js";
import {classifyHistoryJournalCandidate} from "./audit-stage20-history-journal-candidates.mjs";
function candidate(kind,record) {
  return "data/history-recovery-journal/"+kind+"/"+fingerprint(record)+".json";
}
test("exact immutable fact record and fingerprint admitted as candidate",()=>{
  const record={schema:"ai-matchlab.history-recovery-fact.v1",fact:{id:"cid_test",dayKey:"2026-11-23"}};
  assert.equal(classifyHistoryJournalCandidate(candidate("facts",record),record).eligible,true);
});
test("source hold payload admitted only with correct typed schema and SHA",()=>{
  const record={schema:"ai-matchlab.history-recovery-hold.v1",dayKey:"2026-11-23",
    reason:"test",errors:[],eligible:[]};
  assert.equal(classifyHistoryJournalCandidate(candidate("holds",record),record).eligible,true);
});
test("source link payload verified by content-addressing",()=>{
  const record={schema:"ai-matchlab.history-recovery-link.v1",decision:{kind:"OFFICIAL_CORRECTION"}};
  assert.equal(classifyHistoryJournalCandidate(candidate("links",record),record).eligible,true);
});
test("wrong content digest fails closed",()=>{
  const r={schema:"ai-matchlab.history-recovery-fact.v1",fact:{id:"a"}};
  assert.equal(classifyHistoryJournalCandidate("data/history-recovery-journal/facts/"+"0".repeat(64)+".json",r).eligible,false);
});
test("typed schema mismatch fails even with self-consistent hash",()=>{
  const r={schema:"ai-matchlab.history-recovery-link.v1",fact:{}};
  assert.equal(classifyHistoryJournalCandidate(candidate("facts",r),r).reason,"journal_schema_invalid");
});
test("nested files and legacy names cannot enter strict family",()=>{
  for(const x of ["data/history-recovery-journal/facts/private-key.json",
    "data/history-recovery-journal/other/"+"0".repeat(64)+".json",
    "data/history-recovery-journal/facts/subfolder/"+"0".repeat(64)+".json"])
    assert.equal(classifyHistoryJournalCandidate(x,{}).eligible,false);
});
test("fingerprint with valid hash but missing typed payload fails",()=>{
  const r={schema:"ai-matchlab.history-recovery-fact.v1"};
  assert.equal(classifyHistoryJournalCandidate(candidate("facts",r),r).reason,"journal_fact_payload_invalid");
});
