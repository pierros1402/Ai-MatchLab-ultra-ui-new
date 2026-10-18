import test from "node:test";
import assert from "node:assert/strict";
import { collectPrematchFinalForm } from "./prematch-verified-final-form.js";

const now = Date.parse("2026-10-04T13:00Z");
function fixture(day, provider) {
  return { canonicalId: `cid_proof_${day}`, dayKey: `2026-09-${day}`, leagueSlug: "esp.2", homeTeam: "Home CF", awayTeam: "Away",
    kickoffUtc: `2026-09-${day}T12:00Z`, status: "FT", scoreHome: 2, scoreAway: 1,
    providerIds: provider === "espn" ? { espn: "401123456" } : { flashscore: `match0${day}` } };
}
function setup() {
  const canonicals = [fixture(10), fixture(17), fixture(24, "espn")];
  const candidates = canonicals.map((c, i) => ({ providerMatchId: `match0${[10,17,24][i]}`, leagueSlug: c.leagueSlug,
    home: "Home FC", away: "Away", homeProviderTeamId: "home0001", awayProviderTeamId: "away0001", kickoffUtc: c.kickoffUtc, scoreHome: 2, scoreAway: 1 }));
  const finals = Object.fromEntries(canonicals.map(c => [c.canonicalId, { schema: "ai-matchlab.verified-final-result.v1", matchId: c.canonicalId,
    dayKey: c.dayKey, leagueSlug: c.leagueSlug, homeTeam: c.homeTeam, awayTeam: c.awayTeam, kickoffUtc: c.kickoffUtc,
    scoreHome: 2, scoreAway: 1, verifiedFinalTruth: true, verdict: "verified_final_result", finalTruthVerdict: "verified_final_result", generatedAt: `${c.dayKey}T16:00Z` }]));
  return { canonicals, candidates, finals };
}
function run(s) { return collectPrematchFinalForm({}, s.candidates, now, { fixturesForDay: () => s.canonicals, finalForFixture: (_, id) => s.finals[id] }); }

test("two independent exact-provider finals establish both team bindings before a missing ESPN link is consumed", () => {
  const s = setup(), before = JSON.stringify(s), result = run(s);
  assert.equal(result.summary.accepted, 3);
  const proof = result.summary.providerIdentityLinks[0];
  assert.equal(proof.canonicalId, "cid_proof_24");
  assert.equal(proof.espnMatchId, "401123456");
  assert.deepEqual(proof.sides.home.days, ["2026-09-10", "2026-09-17"]);
  assert.equal(result.index["Home CF"].matches[2].providerIdentityLink.providerMatchId, "match024");
  assert.equal(JSON.stringify(s), before, "canonical identity and final truth are unchanged");
});

test("insufficient, conflicting, different-time or different-team proof cannot create a link", () => {
  const mutations = [
    s => s.candidates.shift(),
    s => { s.candidates[2].homeProviderTeamId = "unknown1"; },
    s => { s.candidates[1].homeProviderTeamId = "conflict"; },
    s => { s.candidates[2].kickoffUtc = "2026-09-24T12:01Z"; },
    s => { s.canonicals[2].homeTeam = "Home Reserves"; },
    s => { s.canonicals[2].homeGlobalClubId = "different"; },
    s => { s.canonicals[2].providerIds.flashscore = "other001"; },
    s => { s.canonicals[2].hasConflict = true; },
    s => { s.candidates[2].scoreHome = 3; },
    s => { delete s.finals.cid_proof_24; },
    s => { s.finals.cid_proof_24.verifiedFinalTruth = false; }
  ];
  for (const mutate of mutations) { const s = setup(); mutate(s); assert.equal(run(s).summary.providerIdentityLinks.length, 0, mutate.toString()); }
});

test("duplicate canonical or provider claims remain ambiguous even when scores agree", () => {
  const duplicateCanonical = setup();
  duplicateCanonical.canonicals.push({ ...duplicateCanonical.canonicals[2], canonicalId: "cid_duplicate" });
  const a = run(duplicateCanonical);
  assert.equal(a.summary.providerIdentityLinks.length, 0);
  assert.equal(a.summary.rejected.CROSS_PROVIDER_IDENTITY_NOT_UNIQUE, 1);
  const duplicateProvider = setup();
  duplicateProvider.candidates.push({ ...duplicateProvider.candidates[2], providerMatchId: "another1" });
  const b = run(duplicateProvider);
  assert.equal(b.summary.providerIdentityLinks.length, 0);
  assert.equal(b.summary.rejected.CROSS_PROVIDER_IDENTITY_NOT_UNIQUE, 2);
});

function espnOnlySetup() {
 const s=setup();
 for(let i=0;i<s.canonicals.length;i++){
  s.canonicals[i].providerIds={espn:String(401123450+i)};
  s.candidates[i].home=s.canonicals[i].homeTeam;
 }
 return s;
}

test('ESPN-only exact metadata and original final scores link only with two OTHER verified games',()=>{
 const s=espnOnlySetup(),before=JSON.stringify(s),r=run(s);
 assert.equal(r.summary.exactNameBootstrapSeeds,3);assert.equal(r.summary.accepted,3);
 assert.equal(r.summary.providerIdentityLinks.length,3);
 for(const proof of r.summary.providerIdentityLinks){
  assert.equal(proof.evidencePolicy,'exact_names_and_two_other_original_verified_finals');
  assert.equal(proof.currentMatchExcludedFromSeeds,true);
  assert.equal(proof.sides.home.canonicalIds.length,2);
  assert.equal(proof.sides.home.canonicalIds.includes(proof.canonicalId),false);
  assert.equal(proof.sides.home.providerMatchIds.includes(proof.providerMatchId),false);
 }
 assert.equal(JSON.stringify(s),before,'canonical IDs, names, stored finals and original forecasts remain unchanged');
});

test('two original ESPN finals may identify a future anchor but cannot certify themselves',()=>{
 const s=espnOnlySetup();s.canonicals.pop();s.candidates.pop();const r=run(s);
 assert.equal(r.summary.accepted,0);
 const canonical={...fixture(24,'espn'),canonicalId:'cid_future_anchor',kickoffUtc:'2026-10-05T12:00Z',providerIds:{espn:'401999999'},status:'PRE'};
 const candidate={...s.candidates[0],providerMatchId:'future01',kickoffUtc:canonical.kickoffUtc};
 const proof=r.providerIdentityLinker(candidate,canonical);assert.ok(proof);assert.equal(proof.sides.home.canonicalIds.length,2);
});

test('ESPN bootstrap rejects score, identity, final-availability and ambiguous-claim contradictions',()=>{
 const mutations=[
  s=>{s.candidates[2].scoreHome=3;},
  s=>{s.finals.cid_proof_24.verifiedFinalTruth=false;},
  s=>{delete s.finals.cid_proof_24;},
  s=>{s.candidates[2].kickoffUtc='2026-09-24T12:01Z';},
  s=>{s.candidates[2].home='Home Reserves';},
  s=>{s.canonicals[2].hasConflict=true;},
  s=>{s.canonicals[2].providerIds.flashscore='other001';},
  s=>{s.canonicals[2].homeGlobalClubId='different';},
  s=>{s.candidates[2].homeProviderTeamId='different';},
  s=>{s.canonicals[2].providerIds.espn=s.canonicals[1].providerIds.espn;},
  s=>{s.finals.cid_proof_24.generatedAt='2026-10-05T12:00Z';},
  s=>{s.canonicals[2].rawStatus='STATUS_FINAL_AET';},
  s=>{s.candidates.push({...s.candidates[2],providerMatchId:'duplicate'});},
  s=>{s.canonicals.push({...s.canonicals[2],canonicalId:'cid_duplicate'});}
 ];
 for(const mutate of mutations){const s=espnOnlySetup();mutate(s);assert.equal(run(s).summary.accepted,0,mutate.toString());}
});
