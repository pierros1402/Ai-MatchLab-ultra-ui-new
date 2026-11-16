import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { buildValueDay } from "../core/build-value-day.js";
import { deriveValueFromOdds } from "../jobs/derive-value-from-odds.js";
import { buildValueFixtureUniverse, valueFixtureUniverseContract } from "../core/value-fixture-universe.js";
import { athensDayKey, shiftDay } from "../core/daykey.js";
import { resolveDataPath } from "../storage/data-root.js";

// Real producer calls, no mocked producer or persisted prediction fixture.
// Controlled admission inputs, deliberately not a forecast-quality backtest.
const day = shiftDay(athensDayKey(), 1);
const runId = crypto.randomUUID();
const id = `cid_v35_compute_mode_${runId.replaceAll("-", "")}`;
const fixture = { canonicalId: id, matchId: id, leagueSlug: "test.1",
  homeTeam: "QA Fixture Home", awayTeam: "QA Fixture Away",
  kickoffUtc: `${day}T18:00:00Z`, status: "STATUS_CANCELLED" };
const paths = [resolveDataPath("value", `${day}.json`),
  resolveDataPath("value", "_audit", `${day}.json`),
  resolveDataPath("value-plans", day), resolveDataPath("deploy-snapshots", day),
  resolveDataPath("value-unified", day)];
function inventory() {
  const result = {};
  function walk(p) {
    if (!fs.existsSync(p)) { result[p] = "ABSENT"; return; }
    const st = fs.lstatSync(p);
    assert.equal(st.isSymbolicLink(), false);
    if (st.isDirectory()) { result[p] = "DIR"; for (const n of fs.readdirSync(p).sort()) walk(path.join(p,n)); }
    else result[p] = crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  }
  for (const p of paths) walk(p);
  return result;
}
function makeInputs(fixtures) {
  const universe = buildValueFixtureUniverse(day, {fixtures});
  let universeCalls=0, evidenceCalls=0;
  return { universe, options:{buildUniverse(requestedDay) {
    assert.equal(requestedDay,day); universeCalls++; return structuredClone(universe);
  }, decisionEvidenceFactory(requestedDay, plan, shared) {
    assert.equal(requestedDay,day); assert.ok(["plan-a","plan-a2","plan-b","plan-b2"].includes(plan));
    assert.deepEqual(shared.canonicalFixtures,fixtures); evidenceCalls++;
    return {capture(){return null;},summary(){return {records:[]};}};
  }}, verify(){assert.equal(universeCalls,1);assert.equal(evidenceCalls,1);} };
}
for (const fixtures of [[],[fixture]]) {
  for (const plan of ["A","A2","B","B2"]) {
    test(`real ${plan} computeOnly: ${fixtures.length ? "nonempty" : "empty"} canonical universe, no publication writes`, async()=>{
      const before = inventory(), inputs=makeInputs(fixtures);
      const output = plan.startsWith("A") ? await buildValueDay(day,{...inputs.options, rebuild:true,prospectiveOnly:true,computeOnly:true,opponentAdjusted:plan==="A2",autonomousResearch:plan==="A"}) : deriveValueFromOdds(day,{...inputs.options,computeOnly:true,outputMode:plan==="B"?"plan-b-observation":"plan-b2-observation",publicationRunId:runId});
      inputs.verify();
      assert.ok(output?.result && output?.audit);
      assert.equal(output.result.date,day); assert.deepEqual(output.result.picks,[]);
      assert.equal(output.result.count,0);
      assert.deepEqual(output.audit.fixtureUniverse || output.audit.membership?.fixtureUniverse,valueFixtureUniverseContract(inputs.universe));
      if (plan==="A") assert.equal(output.autonomousResearch?.status,"RESEARCH_ONLY_NOT_POLICY_APPROVED");
      else assert.equal(output.autonomousResearch,undefined);
      assert.deepEqual(inventory(),before,"computeOnly modified publication paths");
    });
  }
}
test("real producers fail closed on invalid computeOnly options",async()=>{
  const before=inventory();
  await assert.rejects(buildValueDay(day,{computeOnly:true}),/invalid_compute_only_options/);
  assert.throws(()=>deriveValueFromOdds(day,{computeOnly:true}),/invalid_compute_only_options/);
  await assert.rejects(buildValueDay(day,{autonomousResearch:true}),/autonomous_research_requires_primary_compute_only/);
  assert.deepEqual(inventory(),before);
});

// Existing legacy cache membership contract; retain exact rows, never recompute
// after merely adding the compute-only path. Synthetic far-future day is owned by test.
test("legacy Plan A cache resolves canonical membership and preserves the stored original score",async()=>{
  const cacheDay="2099-12-28";
  const canonical=resolveDataPath("canonical-fixtures",cacheDay);
  const snapshot=resolveDataPath("value",`${cacheDay}.json`);
  const audit=resolveDataPath("value","_audit",`${cacheDay}.json`);
  assert.equal(fs.existsSync(canonical),false,"reserved QA canonical date must be absent");
  assert.equal(fs.existsSync(snapshot),false,"reserved QA Value date must be absent");
  assert.equal(fs.existsSync(audit),false,"reserved QA audit date must be absent");
  const keep="cid_v35_cache_retained_20991228";
  const drop="cid_v35_cache_orphan_20991228";
  let ownedDir=false,ownedFile=false;
  try {
    fs.mkdirSync(canonical,{recursive:true});ownedDir=true;
    fs.mkdirSync(path.dirname(snapshot),{recursive:true});
    fs.writeFileSync(path.join(canonical,"test.1.json"),JSON.stringify({date:cacheDay,fixtures:[{
      canonicalId:keep,matchId:keep,leagueSlug:"test.1",homeTeam:"QA Cache Home",awayTeam:"QA Cache Away",
      kickoffUtc:`${cacheDay}T18:00:00Z`,status:"PRE"
    }]}),{flag:"wx"});
    fs.writeFileSync(snapshot,JSON.stringify({date:cacheDay,count:2,picks:[{matchId:keep,market:"OU25",pick:"over",score:0.748},{matchId:drop,market:"OU25",pick:"over",score:0.999}]}),{flag:"wx"});ownedFile=true;
    const before=fs.readFileSync(snapshot);
    const result=await buildValueDay(cacheDay,{buildUniverse(){throw new Error("legacy cache must not recompute");}});
    assert.equal(result.count,1);
    assert.deepEqual(result.picks,[{matchId:keep,market:"OU25",pick:"over",score:0.748}]);
    assert.deepEqual(fs.readFileSync(snapshot),before);
    assert.equal(fs.existsSync(audit),false);
  } finally {
    if(ownedFile)fs.unlinkSync(snapshot);
    if(ownedDir)fs.rmSync(canonical,{recursive:true});
  }
});
