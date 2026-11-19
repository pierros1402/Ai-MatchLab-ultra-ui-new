import test from "node:test";
import assert from "node:assert/strict";
import { projectPublicOddsRow, projectPublicOddsRows } from "./public-odds-assessment-projection.js";
const dayKey = "2026-11-15";
const fixture = {canonicalId:"cid_test",dayKey,leagueSlug:"test.1",home:"Home",away:"Away",kickoffUtc:"2026-11-15T19:00:00Z",providerIds:{flashscore:"event1"}};
const price={open:{home:2.2},current:{home:2.4},delta:{home:0.2}};
const assessment={markets:{"1X2":{probs:{home:0.6,away:0.4}}}};
const row={...fixture,matchId:"cid_test",market:price,source:"bookmaker",oddsBook:"licensed",aiAssessment:assessment};
test("exact corroborated publication preserves odds and model",()=>{
  const projected=projectPublicOddsRow(row,[fixture],dayKey);
  assert.equal(projected.aiAssessment,assessment);
  assert.equal(projected.market,price);
});
test("unapproved canonical identity, provider and kickoff mismatch suppress model only",()=>{
  for(const change of [
    {canonicalId:"old_id"},{providerIds:{flashscore:"foreign"}},
    {kickoffUtc:"2026-11-14T19:00:00Z"},{leagueSlug:"other.1"},
    {home:"Wrong Home"},{dayKey:"2026-11-16"},{providerIds:{}}]){
    const input={...row,...change};
    const projected=projectPublicOddsRow(input,[fixture],dayKey);
    assert.equal(projected.aiAssessment,null);
    assert.equal(projected.market,price);
    assert.equal(projected.oddsBook,"licensed");
    assert.equal(input.aiAssessment,assessment);
  }
});
test("missing canonical universe and duplicate model owners fail closed",()=>{
  assert.equal(projectPublicOddsRow(row,[],dayKey).aiAssessment,null);
  const rows=projectPublicOddsRows([row,{...row}], [fixture],dayKey);
  assert.deepEqual(rows.map(x=>x.aiAssessment),[null,null]);
  assert.equal(projectPublicOddsRows([row], [fixture],dayKey)[0].aiAssessment,assessment);
});
test("malformed records or absent day never authorize",()=>{
  assert.equal(projectPublicOddsRow(null,[fixture],dayKey),null);
  assert.equal(projectPublicOddsRow(row,[fixture],null).aiAssessment,null);
  assert.equal(projectPublicOddsRow({...row,aiAssessment:null},[fixture],dayKey).aiAssessment,null);
});
