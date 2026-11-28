import test from "node:test";
import assert from "node:assert/strict";
import { parseFlashscoreExactKickoffPage, validateEspnExactKickoffEvidence } from "./exact-provider-kickoff-evidence.js";
const fixture = { providerFixtureId: "fixture1", providerCompetitionId: "league01",
  dayKey: "2026-11-28", kickoffUtc: "2026-11-28T12:00Z",
  home: { providerTeamId: "nativeH1" }, away: { providerTeamId: "nativeA1" } };
const html = '<meta property="og:url" content="https://www.flashscore.com/match/football/home-nativeH1/away-nativeA1/?mid=fixture1">' +
  '<script>var pageinfo = {"id":"fixture1","sport":"soccer","tournament":"league01"};</script>' +
  '{"common_feed":[{"DC":1795867200}]}';
test("exact match page, native sides, tournament and independent feed prove kickoff", () => {
  assert.equal(parseFlashscoreExactKickoffPage(html, fixture).kickoffUtc, "2026-11-28T12:00:00.000Z");
});
test("wrong page, reversed native sides, conflicting time and ambiguous feeds fail closed", () => {
  for (const [body,row] of [[html.replaceAll("fixture1","other001"),fixture],
    [html,{...fixture,home:fixture.away,away:fixture.home}],
    [html,{...fixture,kickoffUtc:"2026-11-28T13:00Z"}],
    [html+'{"common_feed":[{"DC":1795867200}]}',fixture]])
    assert.equal(parseFlashscoreExactKickoffPage(body,row).ok,false);
});
test("ESPN kickoff authority requires exact event, ordered native IDs and target day", () => {
  const canonical={canonicalId:"CID",source:"espn",leagueSlug:"eng.1",providerIds:{espn:"123"},
    providerTeamIds:{espn:{home:"101",away:"202"}}};
  const entry={provider:"espn",canonicalId:"CID",leagueSlug:"eng.1",header:{id:"123",
    competitions:[{id:"123",date:"2026-11-28T18:30Z",competitors:[
      {homeAway:"home",team:{id:"101"}},{homeAway:"away",team:{id:"202"}}]}]}};
  assert.equal(validateEspnExactKickoffEvidence(canonical,entry,"2026-11-28").ok,true);
  const bad=structuredClone(entry);bad.header.competitions[0].competitors[0].team.id="999";
  assert.equal(validateEspnExactKickoffEvidence(canonical,bad,"2026-11-28").ok,false);
  assert.equal(validateEspnExactKickoffEvidence(canonical,entry,"2026-11-29").ok,false);
});

import { certifiedProviderKickoffUtc, retainCertifiedKickoff } from "./exact-provider-kickoff-evidence.js";
test("certified primary kickoff survives a stale scoreboard observation without changing final truth",()=>{
  const row={canonicalId:"CID",dayKey:"2026-11-28",leagueSlug:"eng.1",source:"espn",
    providerIds:{espn:"123",flashscore:"fixture1"},providerTeamIds:{espn:{home:"101",away:"202"}},
    kickoffUtc:"2026-11-28T18:30Z",status:"FT",scoreHome:2,scoreAway:1};
  row.exactProviderKickoffEvidence={schema:"ai-matchlab.exact-provider-kickoff.v1",provider:"espn",
    canonicalId:"CID",leagueSlug:"eng.1",dayKey:row.dayKey,providerFixtureId:"fixture1",header:{id:"123",competitions:[
      {id:"123",date:row.kickoffUtc,competitors:[{homeAway:"home",team:{id:"101"}},{homeAway:"away",team:{id:"202"}}]}]}};
  const merged=retainCertifiedKickoff(row,{...row,kickoffUtc:"2026-11-28T14:30Z"});
  assert.equal(merged.kickoffUtc,"2026-11-28T18:30:00.000Z");
  assert.equal(merged.status,"FT");assert.equal(merged.scoreHome,2);
  assert.equal(certifiedProviderKickoffUtc({...row,providerTeamIds:{espn:{home:"999",away:"202"}}}),null);
});

import { mergeCanonicalFixtures } from "../jobs/run-fixture-acquisition-chunk.js";
import { mergeStatusRow } from "../jobs/run-live-status-refresh-day.js";
import { synchronizeDetailStatusState } from "./detail-status-sync.js";
function certifiedRow(){
 const row={matchId:"CID",canonicalId:"CID",source:"espn",sourceMatchId:"123",sourceId:"123",
  dayKey:"2026-11-28",leagueSlug:"eng.1",homeTeam:"Home",awayTeam:"Away",
  providerIds:{espn:"123",flashscore:"fixture1"},providerTeamIds:{espn:{home:"101",away:"202"}},
  kickoffUtc:"2026-11-28T18:30:00.000Z",status:"PRE",rawStatus:"STATUS_SCHEDULED",
  minute:null,scoreHome:null,scoreAway:null};
 row.exactProviderKickoffEvidence={schema:"ai-matchlab.exact-provider-kickoff.v1",provider:"espn",canonicalId:"CID",
  leagueSlug:"eng.1",dayKey:row.dayKey,providerFixtureId:"fixture1",header:{id:"123",competitions:[{
   id:"123",date:row.kickoffUtc,competitors:[{homeAway:"home",team:{id:"101"}},{homeAway:"away",team:{id:"202"}}]}]}};
 return row;
}
test("acquisition and live merges retain certified clock while admitting fresh final scores",()=>{
 for(const merge of [(a,b)=>mergeCanonicalFixtures([a],[b])[0],mergeStatusRow]){
  const prior=certifiedRow(),incoming={...prior,kickoffUtc:"2026-11-28T14:30Z",status:"FT",
   rawStatus:"STATUS_FINAL",statusType:"STATUS_FINAL",minute:"FT",scoreHome:2,scoreAway:1};
  delete incoming.exactProviderKickoffEvidence;
  const result=merge(prior,incoming);
  assert.equal(result.kickoffUtc,prior.kickoffUtc);
  assert.equal(result.status,"FT");assert.equal(result.scoreHome,2);assert.equal(result.scoreAway,1);
 }
});
test("same-day certified kickoff patches existing Details basic fields without changing rich evidence",()=>{
 const row=certifiedRow(),detail={basic:{...row,kickoffUtc:"2026-11-28T14:30Z"},rich:{frozen:"keep"},
  meta:{signature:JSON.stringify({status:row.status,rawStatus:row.rawStatus,minute:"",scoreHome:null,scoreAway:null})}};
 const frozen=JSON.stringify(detail.rich);
 const result=synchronizeDetailStatusState(detail,row);
 assert.equal(result.ok,true);assert.equal(detail.basic.kickoffUtc,row.kickoffUtc);
 assert.equal(JSON.stringify(detail.rich),frozen);
 const uncertified=structuredClone(row);delete uncertified.exactProviderKickoffEvidence;
 detail.basic.kickoffUtc="2026-11-28T14:30Z";
 synchronizeDetailStatusState(detail,uncertified);
 assert.equal(detail.basic.kickoffUtc,"2026-11-28T14:30Z");
});
