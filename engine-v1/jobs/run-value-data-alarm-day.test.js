import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runValueDataAlarmDay } from "./run-value-data-alarm-day.js";
test("catch-up research rejects invalid or unbounded league limits before work", async () => {
  for (const maxResearchLeagues of [0, -1, 13, 1.5, NaN]) {
    await assert.rejects(runValueDataAlarmDay("2099-10-04", { maxResearchLeagues }), /invalid_research_league_limit/);
  }
});
test("team research is consumed in the same cycle but raw findings cannot close an incident", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-team-cycle-"));
  const day = "2099-10-04", nowMs = Date.parse(`${day}T08:00Z`);
  const fixture = { canonicalId: "cid_team_cycle", leagueSlug: "egy.2", homeTeam: "A", awayTeam: "B",
    kickoffUtc: `${day}T14:00Z`, providerIds: { flashscore: "match001" } };
  const candidateFile = path.join(root, day, "egy.2.team-native01.egy.2.results.research.json");
  let produced = 0, researched = 0;
  const dependencies = { queueRoot: root, fixtures: () => [fixture], assessments: () => [], standings: () => ({ ok: false }),
    supplement: () => {
      produced++;
      if (produced === 2) assert.ok(fs.existsSync(candidateFile), "second production pass must see persisted research");
      return { assessmentRowsWritten: 0, unavailableEvidence: [{ canonicalId: fixture.canonicalId, homeSample: 1, awaySample: 6 }] };
    }, primarySearch: async () => ({ ok: true }), search: async () => ({ status: "NO_SOURCE" }),
    resultsSearch: async () => ({ rows: [], upcomingAnchors: [{ leagueSlug: "egy.2", providerMatchId: "match001",
      kickoffUtc: fixture.kickoffUtc, home: "A", away: "B", homeProviderTeamId: "native01", homeProviderTeamSlug: "team-a" }] }),
    teamHistorySearch: async () => {
      researched++;
      return { status: "TEAM_RESULTS_AWAIT_CANONICAL_FINAL_VALIDATION", documents: [{ leagueSlug: "egy.2", rows: [{ providerMatchId: "result01" }] }] };
    } };
  try {
    const result = await runValueDataAlarmDay(day, { write: true, research: true, nowMs, lookAheadDays: 0, dependencies });
    assert.equal(produced, 2);
    assert.equal(researched, 1, "consumption must not recursively perform another acquisition");
    assert.equal(result.report.postResearchReevaluation, true);
    assert.equal(result.report.futureOpen, 1);
    assert.notEqual(result.queue.incidents[fixture.canonicalId].status, "RESOLVED");
    assert.equal(result.report.days[0].joined, 0);
    assert.equal(result.report.teamHistoryResearch[0].attempts.length, 1);
    assert.ok(result.queue.teamHistoryAttempts["egy.2|native01"]);
  } finally {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(root, { recursive: true });
  }
});

test("league-only research also rechecks persisted inputs in the same cycle", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-league-cycle-"));
  const day = "2099-10-04", fixture = { canonicalId: "cid_league_cycle", leagueSlug: "egy.2", homeTeam: "A", awayTeam: "B", kickoffUtc: `${day}T14:00Z` };
  let productions = 0;
  try {
    const result = await runValueDataAlarmDay(day, { write: true, research: true, nowMs: Date.parse(`${day}T08:00Z`), lookAheadDays: 0,
      dependencies: { queueRoot: root, fixtures: () => [fixture], assessments: () => [], standings: () => ({ ok: false }),
        primarySearch: async () => ({ ok: true }), search: async () => ({ status: "NO_SOURCE" }),
        resultsSearch: async () => ({ rows: [{ providerMatchId: "result01" }], upcomingAnchors: [] }),
        supplement: () => { productions++; return { assessmentRowsWritten: 0 }; } } });
    assert.equal(productions, 2);
    assert.equal(result.report.postResearchReevaluation, true);
    assert.equal(result.report.futureOpen, 1, "raw league rows are not an assessment");
    assert.deepEqual(result.report.teamHistoryResearch, []);
  } finally {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(root, { recursive: true });
  }
});

test("alarm scans previous-day readiness for the next week, persists before research, and retains failures across days", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-alarm-test-"));
  const id = "cid_alarm_future_20991004";
  const fixtures = day => day === "2099-10-04" ? [{ canonicalId: id, leagueSlug: "egy.2", homeTeam: "A", awayTeam: "B", kickoffUtc: "2099-10-04T10:00Z" }] : [];
  let calls = 0;
  const dependencies = { queueRoot: root, fixtures, assessments: () => [], standings: () => ({ ok: false, validation: { issues: ["TEAM_COUNT_AUTHORITY_MISSING"] } }),
    resultsSearch: async () => ({ status: "RESULTS_AWAIT_IDENTITY_VALIDATION", rows: [{ providerMatchId: "abcdefgh" }] }),
    supplement: () => ({ assessmentRowsWritten: 0 }), primarySearch: async options => { assert.deepEqual(options.leagues, ["egy.2"]); return { ok: false, error: "primary_unavailable" }; }, search: async () => {
      calls++;
      const queue = JSON.parse(fs.readFileSync(path.join(root, "queue.json")));
      assert.ok(queue.incidents[id], "alarm must exist before the source search starts");
      throw new Error("provider_unavailable");
    } };
  try {
    const options = { dependencies, nowMs: Date.parse("2099-10-01T08:00Z") };
    const dry = await runValueDataAlarmDay("2099-10-01", options);
    assert.equal(dry.report.days.length, 8);
    assert.equal(dry.report.futureOpen, 1);
    assert.equal(dry.report.readinessComplete, false);
    assert.equal(fs.readdirSync(root).length, 0);
    const applied = await runValueDataAlarmDay("2099-10-01", { ...options, write: true, research: true });
    assert.equal(calls, 1);
    assert.equal(applied.queue.incidents[id].status, "DATA_SEARCH_REQUIRED");
    assert.equal(Object.values(applied.queue.research)[0].result.status, "SOURCE_SEARCH_FAILED");
    assert.equal(Object.values(applied.queue.research)[0].result.primarySource.error, "primary_unavailable");
    assert.equal(Object.values(applied.queue.research)[0].result.recentResults.rows, 1);
    assert.equal(applied.report.generatedAt, new Date(options.nowMs).toISOString());
    assert.ok(fs.existsSync(path.join(root, "2099-10-01", "egy.2.results.research.json")));
    await runValueDataAlarmDay("2099-10-01", { ...options, write: true, research: true });
    assert.equal(calls, 1, "backoff must prevent repeated source requests on every five-minute tick");
    const rollover = await runValueDataAlarmDay("2099-10-10", { ...options, write: true, research: true, nowMs: Date.parse("2099-10-10T08:00Z") });
    assert.ok(rollover.queue.incidents[id], "the next day cannot erase an unresolved old fixture");
    assert.equal(rollover.queue.incidents[id].status, "HISTORICAL_GAP_OPEN");
    const generated = { ...dependencies, supplement: () => ({ assessmentRowsWritten: 1 }), exportOdds: async () => ({ ok: true, changed: true }),
      persistedOdds: () => ({ matches: [{ canonicalId: id, dayKey: "2099-10-04", aiAssessment: { markets: { OU25: { probs: { over: 0.64 } } } } }] }) };
    const restored = await runValueDataAlarmDay("2099-10-01", { ...options, dependencies: generated, write: true });
    assert.equal(restored.queue.incidents[id].status, "RESOLVED");
    assert.deepEqual(restored.report.oddsWrittenDays, ["2099-10-04"]);
    assert.equal(restored.report.days.find(row => row.day === "2099-10-04").joined, 1);
    assert.equal(restored.report.days.find(row => row.day === "2099-10-04").joinedBefore, 0);
    const unpersisted = { ...generated, persistedOdds: () => ({ matches: [] }) };
    const notUsed = await runValueDataAlarmDay("2099-10-01", { ...options, dependencies: unpersisted, write: true });
    assert.notEqual(notUsed.queue.incidents[id].status, "RESOLVED", "producer success cannot close an incident when the persisted input is still missing");
    const broken = await runValueDataAlarmDay("2099-10-01", { ...options, write: true,
      dependencies: { ...dependencies, supplement: () => { throw new Error("producer_broken"); } } });
    assert.equal(broken.report.acquisitionErrors[0].error, "producer_broken");
    const durable = JSON.parse(fs.readFileSync(path.join(root, "queue.json")));
    assert.equal(durable.incidents[id].lastProductionError.error, "producer_broken");
    assert.notEqual(durable.incidents[id].status, "RESOLVED");
  } finally {
    assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
    fs.rmSync(root, { recursive: true });
  }
});

test('an existing model assessment cannot hide a known recent-history gap',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'aiml-known-history-gap-'));
 const day='2099-10-04',nowMs=Date.parse(day+'T08:00Z');
 const fixture={canonicalId:'cid_known_history_gap',leagueSlug:'eng.1',homeTeam:'H',awayTeam:'A',kickoffUtc:day+'T18:00Z'};
 let missing=true;
 const dependencies={queueRoot:root,fixtures:()=>[fixture],standings:()=>({ok:false}),
  assessments:()=>[{...fixture,aiAssessment:{markets:{OU25:{probs:{over:.8}}}}}],
  valueCoverage:()=>({rows:[{matchId:fixture.canonicalId,nullReason:missing?'minimum_recent_sample':null,minimumSample:{homeRawSample:1,awayRawSample:6}}]})};
 try{
  const bad=await runValueDataAlarmDay(day,{write:true,lookAheadDays:0,nowMs,dependencies});
  assert.equal(bad.report.futureOpen,1);assert.deepEqual(bad.queue.incidents[fixture.canonicalId].requiredInputs,['model_assessment','recent_team_history']);
  missing=false;const good=await runValueDataAlarmDay(day,{write:true,lookAheadDays:0,nowMs:nowMs+1000,dependencies});
  assert.equal(good.queue.incidents[fixture.canonicalId].status,'RESOLVED');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test("expired research budget preserves unresolved work for the next automatic cycle",async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),"alarm-budget-"));
 let calls=0;
 try{
 const {report}=await runValueDataAlarmDay("2099-10-04",{write:true,research:true,researchBudgetMs:0,lookAheadDays:0,nowMs:Date.parse("2099-10-04T08:00Z"),dependencies:{
 queueRoot:root,fixtures:()=>[{canonicalId:"cid_budget",leagueSlug:"eng.1",homeTeam:"A",awayTeam:"B",kickoffUtc:"2099-10-04T14:00Z"}],
 assessments:()=>[],standings:()=>({ok:false}),supplement:()=>({assessmentRowsWritten:0,unavailableEvidence:[]}),
  primarySearch:async()=>{calls++;return {ok:true};},search:async()=>{calls++;return {status:"NO_SOURCE"};},resultsSearch:async()=>{calls++;return {rows:[]};}}});
 assert.equal(calls,0);assert.equal(report.attemptedResearchTasks.length,0);assert.ok(report.deferredResearchTasks.length>0);assert.ok(report.openIncidents>0);
 }finally{fs.rmSync(root,{recursive:true});}
});

test('capacity-deferred groups remain visible even when the selected cycle has no budget',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'alarm-capacity-backlog-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const day='2099-10-04',nowMs=Date.parse(day+'T08:00Z');
 const fixtures=Array.from({length:5},(_,i)=>({canonicalId:`cid_backlog_${i}`,leagueSlug:`backlog.${i}`,homeTeam:'A',awayTeam:'B',kickoffUtc:day+'T14:00Z'}));
 const {report}=await runValueDataAlarmDay(day,{write:true,research:true,maxResearchLeagues:2,researchBudgetMs:0,lookAheadDays:0,nowMs,dependencies:{queueRoot:root,fixtures:()=>fixtures,assessments:()=>[],standings:()=>({ok:false}),supplement:()=>({assessmentRowsWritten:0}),primarySearch:async()=>{throw Error('must not acquire');}}});
 assert.equal(report.researchBacklog.dueGroups,5);assert.equal(report.researchBacklog.selectedGroups,2);
 assert.equal(report.researchBacklog.deferredByCapacity.length,3);assert.equal(report.researchBacklog.deferredByBudget.length,2);
 assert.equal(report.deferredResearchTasks.length,5);assert.equal(report.futureOpen,5);
});

test('source-policy recovery runs after native profile persistence and cannot close an unconsumed assessment',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'alarm-source-policy-cycle-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const day='2099-10-04',nowMs=Date.parse(day+'T08:00Z'),fixture={canonicalId:'cid_policy_future',leagueSlug:'egy.2',homeTeam:'A',awayTeam:'B',kickoffUtc:day+'T14:00Z',providerIds:{flashscore:'future01'}};
 let recoveryCalls=0;
 const {report,queue}=await runValueDataAlarmDay(day,{write:true,research:true,verifiedHistoryPolicy:'exact-native-future-team-v1',lookAheadDays:0,nowMs,dependencies:{
  queueRoot:root,fixtures:()=>[fixture],assessments:()=>[],standings:()=>({ok:false}),supplement:()=>({assessmentRowsWritten:0,unavailableEvidence:[{canonicalId:fixture.canonicalId,homeSample:1,awaySample:6}]}),
  primarySearch:async()=>({ok:true}),search:async()=>({status:'NO_SOURCE'}),
  resultsSearch:async()=>({rows:[],upcomingAnchors:[{leagueSlug:'egy.2',providerMatchId:'future01',kickoffUtc:fixture.kickoffUtc,home:'A',away:'B',homeProviderTeamId:'native01',homeProviderTeamSlug:'team-a'}]}),
  teamHistorySearch:async()=>({documents:[{leagueSlug:'egy.2',rows:[{providerMatchId:'past0001'}]}]}),
  verifiedHistoryRecovery:async(_day,bindings)=>{recoveryCalls++;assert.equal(bindings[0].target.nativeAnchor.providerMatchId,'future01');assert.ok(fs.existsSync(path.join(root,day,'egy.2.team-native01.egy.2.results.research.json')));return {appliedMatches:0,writePaths:[],fullCoverageCertified:false};}
 }});
 assert.equal(recoveryCalls,1);assert.equal(report.postResearchReevaluation,true);assert.equal(report.verifiedHistoryRecovery.appliedMatches,0);
 assert.equal(report.futureOpen,1);assert.notEqual(queue.incidents[fixture.canonicalId].status,'RESOLVED');
});
