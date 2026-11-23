import test from "node:test";
import assert from "node:assert/strict";
import {classifyAcquisitionWriterPath,aggregateAcquisitionWriterPaths} from "./audit-stage20-value-acquisition-writer-map.mjs";
const base="data/value-data-acquisition/";
const examples={
  "queue.json":"alarm_queue",
  "2026-11-23.json":"alarm_day_report",
  "2026-11-23/nor.eliteserien.primary-contract.research.json":"primary_contract",
  "2026-11-23/nor.eliteserien.primary.research.json":"primary_standings",
  "2026-11-23/nor.eliteserien.team-123.nor.cup.results.research.json":"team_competition_results",
  "2026-11-23/nor.eliteserien.team-123.research.json":"team_history",
  "2026-11-23/nor.eliteserien.results.research.json":"league_results",
  "2026-11-23/nor.eliteserien.research.json":"league_standings",
  "2026-11-23/verified-history-recovery.report.research.json":"verified_history_report"
};
test("all explicitly evidenced writer path families classified",()=>{
  for(const [p,k]of Object.entries(examples))assert.equal(classifyAcquisitionWriterPath(base+p),k,p);
});
test("unknown and unsafe paths never assigned writer ownership",()=>{
  for(const p of ["../../foo.json","2026-11-23/../foo.json","2026-11-23/a.gz",
    "2026-11-23/a.other.json","import-review/x.json","2026-11-23/queue.json"])
    assert.equal(classifyAcquisitionWriterPath(base+p),"unattributed",p);
});
test("duplicates fail closed; source matching is never resumption authority",()=>{
  assert.throws(()=>aggregateAcquisitionWriterPaths([base+"queue.json",base+"queue.json"]),/writer_paths_invalid/);
  const x=aggregateAcquisitionWriterPaths([base+"queue.json"]);
  assert.equal(x.patternMatches,1);assert.equal(x.dynamicDependencyClosureVerified,false);
  assert.equal(x.resumeAuthorized,false);assert.equal(x.externalProviderEquivalenceProven,false);
});
