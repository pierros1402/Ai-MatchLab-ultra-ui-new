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
