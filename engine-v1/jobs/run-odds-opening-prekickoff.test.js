import test from "node:test";
import assert from "node:assert/strict";
import { openingAssessmentPreKickoff, runOddsOpening } from "./run-odds-opening.js";

const day="2026-11-21";
const base={matchId:"abc12345",leagueName:"World Cup",country:"World",leaguePath:"/football/world/world-cup/",
  home:"Example National Home",away:"Example National Away"};
const mk=kickoffUtc=>({...base,kickoffUtc});
const run=async(fixture,nowMs)=>{
  const rows=[], patches=[];
  const oldLog=console.log;
  console.log=()=>{};
  try {
    const stats=await runOddsOpening({
      nowMs,todayDayKey:day,
      fetchFixtures:async()=>({rows:[fixture],attempts:[{offset:0,rows:1}]}),
      fetchMarket:async()=>({rows:[],providers:[]}),
      fetchReferees:async()=>new Map(),
      recordFn:(id,meta,pricing)=>{rows.push({id,meta,pricing});return {opened:[],moved:[]}},
      patchFn:(...args)=>patches.push(args)
    });
    return {rows,patches,stats};
  } finally {console.log=oldLog}
};

test("pre-kickoff admission rejects invalid, missing and already-started timestamps",()=>{
  const t=Date.parse("2026-11-21T12:00:00Z");
  assert.equal(openingAssessmentPreKickoff(null,t),false);
  assert.equal(openingAssessmentPreKickoff("2026-11-21T12:01:00",t),false);
  assert.equal(openingAssessmentPreKickoff("2026-11-21T11:59:59Z",t),false);
  assert.equal(openingAssessmentPreKickoff("2026-11-21T12:00:00Z",t),false);
  assert.equal(openingAssessmentPreKickoff("2026-11-21T12:00:01Z",t),true);
});

test("late World Cup opening retains real market capture path but does not create model evidence",async()=>{
  const v=await run(mk("2026-11-21T09:00:00Z"),Date.parse("2026-11-21T10:00:00Z"));
  assert.equal(v.rows.length,1);
  assert.equal(v.rows[0].meta.aiAssessment,undefined);
  assert.equal(v.patches.length,0);
  assert.equal(v.stats.withAiAssessment,0);
  assert.equal(v.stats.skippedLateModel,1);
});

test("future World Cup opening still computes and attaches pre-kickoff model",async()=>{
  const v=await run(mk("2026-11-22T09:00:00Z"),Date.parse("2026-11-21T10:00:00Z"));
  assert.equal(v.rows.length,1);
  assert.ok(Object.keys(v.rows[0].meta.aiAssessment?.markets||{}).length>0);
  assert.equal(v.patches.length,1);
  assert.equal(v.stats.withAiAssessment,1);
});
