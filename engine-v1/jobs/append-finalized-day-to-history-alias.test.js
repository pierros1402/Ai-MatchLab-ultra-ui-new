import test from "node:test";
import assert from "node:assert/strict";

import {
  buildVerifiedHistoryDay
} from "./append-finalized-day-to-history.js";

const dayKey = "2026-08-08";
const oldId = "cid_fs_test_home_away_20260808";
const retainedId = "cid_espn_test_home_away_20260808";

const resolver = {
  resolveTeamReference: () => ({
    ok:false,
    status:"NORMALIZED_EXACT_ALIAS_NOT_FOUND"
  })
};

function canonical(overrides={}) {
  return {
    canonicalId:retainedId,
    matchId:retainedId,
    canonicalAliases:[oldId],
    leagueSlug:"test.1",
    dayKey,
    kickoffUtc:"2026-08-08T18:00:00Z",
    homeTeam:"Home FC",
    awayTeam:"Away FC",
    scoreHome:2,
    scoreAway:1,
    status:"FT",
    rawStatus:"STATUS_FULL_TIME",
    ...overrides
  };
}

function finalResult(overrides={}) {
  return {
    verifiedFinalTruth:true,
    finalTruthVerdict:"verified_final_result",
    verdict:"verified_final_result",
    date:dayKey,
    dayKey,
    matchId:oldId,
    leagueSlug:"test.1",
    kickoffUtc:"2026-08-08T18:00:00Z",
    homeTeam:"Home",
    awayTeam:"Away",
    homeScore:2,
    awayScore:1,
    finalScore:{homeScore:2,awayScore:1},
    ...overrides
  };
}

function build(canonicalRows,finalResultRows) {
  return buildVerifiedHistoryDay({
    dayKey,
    canonicalRows,
    finalResultRows,
    identityResolver:resolver
  });
}

test("unique alias is reported as unverified, not missing",()=>{
  const result=build([canonical()],[finalResult()]);
  assert.equal(result.ok,false);
  assert.equal(result.acceptedRows,0);
  assert.ok(result.errors.some(e=>
    e.reason==="verified_final_canonical_alias_identity_unverified" &&
    e.matchId===oldId &&
    e.retainedCanonicalId===retainedId &&
    e.historyJoinAuthorized===false
  ));
  assert.equal(result.errors.some(e=>
    e.reason==="verified_final_missing_canonical_fixture"
  ),false);
});

test("genuinely absent canonical ID stays missing",()=>{
  const result=build(
    [canonical({canonicalAliases:[]})],
    [finalResult()]
  );
  assert.equal(result.ok,false);
  assert.ok(result.errors.some(e=>
    e.reason==="verified_final_missing_canonical_fixture" &&
    e.matchId===oldId
  ));
});

test("ambiguous alias owners are never joined",()=>{
  const second=canonical({
    canonicalId:"cid_other_retained",
    matchId:"cid_other_retained",
    homeTeam:"Other FC"
  });
  const result=build([canonical(),second],[finalResult()]);
  assert.equal(result.ok,false);
  assert.equal(result.acceptedRows,0);
  assert.ok(result.errors.some(e=>
    e.reason==="verified_final_canonical_alias_ambiguous" &&
    e.matchId===oldId &&
    e.retainedCanonicalIds.length===2
  ));
});

test("different final score never creates alias history",()=>{
  const result=build(
    [canonical()],
    [finalResult({
      homeScore:5,
      finalScore:{homeScore:5,awayScore:1}
    })]
  );
  assert.equal(result.ok,false);
  assert.equal(result.acceptedRows,0);
  assert.ok(result.errors.some(e=>
    e.reason==="verified_final_canonical_alias_identity_unverified"
  ));
});

test("exact canonical ID still requires normal truth parity",()=>{
  const result=build(
    [canonical({canonicalAliases:[]})],
    [finalResult({matchId:retainedId,homeTeam:"Home FC",
                  awayTeam:"Away FC"})]
  );
  assert.equal(result.ok,true);
  assert.equal(result.acceptedRows,1);
  assert.equal(result.rows[0].id,retainedId);
});