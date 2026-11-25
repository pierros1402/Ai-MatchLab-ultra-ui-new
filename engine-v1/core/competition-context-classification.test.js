import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { classifyCompetitionType, buildCompetitionContext } from "./competition-context.js";

test("registered competition type is exact and independent of names and standings",()=>{
  for(const [leagueSlug,expected] of [
    ["afc.cup","international_cup"],["afc.champions","international_cup"],
    ["uefa.champions","international_cup"],["ucl.q","international_cup"],
    ["caf.confed","international_cup"],["fifa.world","international_cup"],
    ["fifa.club_world","international_cup"],["eng.fa","domestic_cup"],
    ["eng.trophy","domestic_cup"],["gre.cup","domestic_cup"],
    ["eng.1","league"],["rsa.1","league"],["afc.fake.cup","unknown"],
    ["unknown.champions","unknown"],["","unknown"]
  ]) assert.equal(classifyCompetitionType({leagueSlug,leagueName:"Misleading Cup"}),expected,leagueSlug);
  assert.equal(classifyCompetitionType({leagueSlug:" AFC.CUP "}),"international_cup");
});

test("missing standings cannot relabel AFC or unknown fixtures as a league",()=>{
  for(const [leagueSlug,expected] of [["afc.cup","international_cup"],["unknown.champions","unknown"]]){
    const result=buildCompetitionContext({leagueSlug,homeTeam:"ZZZ no matching home 9382",awayTeam:"ZZZ no matching away 4721"});
    assert.equal(result.status,"fallback");
    assert.equal(result.data.type,expected);
    assert.equal(result.data.positions,null);
  }
});

test("Details uses the same classifier for basic and context, not evidence mode",()=>{
  const source=fs.readFileSync(new URL("../jobs/build-details-day.js",import.meta.url),"utf8");
  assert.match(source,/import \{ classifyCompetitionType \} from "\.\.\/core\/competition-context\.js"/);
  assert.doesNotMatch(source,/function classifyCompetitionType\(/);
  assert.doesNotMatch(source,/competitionType: competitionContext\?\.data\?\.type/);
  assert.ok((source.match(/competitionType: classifyCompetitionType\(match\)/g)||[]).length>=2);
});
