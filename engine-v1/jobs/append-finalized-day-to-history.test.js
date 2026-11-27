import test from "node:test";
import assert from "node:assert/strict";

import { buildVerifiedHistoryDay } from "./append-finalized-day-to-history.js";

function canonical(overrides = {}) {
  return {
    canonicalId: "cid_test_home_away_20260808",
    matchId: "401000001",
    source: "espn",
    sourceMatchId: "401000001",
    leagueSlug: "test.1",
    leagueName: "Test League",
    kickoffUtc: "2026-08-08T18:00:00Z",
    homeTeam: "Home",
    awayTeam: "Away",
    status: "FT",
    rawStatus: "STATUS_FULL_TIME",
    scoreHome: 2,
    scoreAway: 1,
    ...overrides
  };
}

function finalResult(overrides = {}) {
  return {
    verifiedFinalTruth: true,
    finalTruthVerdict: "verified_final_result",
    verdict: "verified_final_result",
    date: "2026-08-08",
    dayKey: "2026-08-08",
    matchId: "cid_test_home_away_20260808",
    leagueSlug: "test.1",
    homeTeam: "Home",
    awayTeam: "Away",
    homeScore: 2,
    awayScore: 1,
    finalScore: { homeScore: 2, awayScore: 1, scoreKey: "2-1" },
    kickoffUtc: "2026-08-08T18:00:00Z",
    source: "verified-test",
    ...overrides
  };
}

test("builds history only from exact canonical and verified-final parity", () => {
  const result = buildVerifiedHistoryDay({
    dayKey: "2026-08-08",
    canonicalRows: [canonical()],
    finalResultRows: [finalResult()],
    season: "2026-2027",
    rebuiltAt: 1
  });

  assert.equal(result.ok, true);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].id, "cid_test_home_away_20260808");
  assert.equal(result.rows[0].scoreHome, 2);
  assert.equal(result.rows[0].scoreAway, 1);
  assert.equal(result.rows[0].status, "FT");
  assert.equal(result.rows[0].truthContract.exactScoreParity, true);
});

test("rejects mixed scheduled/final canonical evidence", () => {
  const result = buildVerifiedHistoryDay({
    dayKey: "2026-08-08",
    canonicalRows: [canonical({ status: "STATUS_SCHEDULED", statusType: "FINAL" })],
    finalResultRows: [finalResult()],
    season: "2026-2027"
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors.some(error => error.reason === "canonical_status_conflict"), true);
});

test("rejects null canonical score instead of coercing it to zero", () => {
  const result = buildVerifiedHistoryDay({
    dayKey: "2026-08-08",
    canonicalRows: [canonical({ scoreHome: null })],
    finalResultRows: [finalResult()],
    season: "2026-2027"
  });

  assert.equal(result.ok, false);
  assert.equal(result.errors.some(error => error.reason === "canonical_final_numeric_score_required"), true);
});

test("rejects score mismatch and canonical nonterminal final-result drift", () => {
  const scoreMismatch = buildVerifiedHistoryDay({
    dayKey: "2026-08-08",
    canonicalRows: [canonical()],
    finalResultRows: [finalResult({ homeScore: 3, finalScore: { homeScore: 3, awayScore: 1 } })],
    season: "2026-2027"
  });
  assert.equal(scoreMismatch.ok, false);
  assert.equal(scoreMismatch.errors.some(error => error.reason === "canonical_verified_final_score_mismatch"), true);

  const nonterminal = buildVerifiedHistoryDay({
    dayKey: "2026-08-08",
    canonicalRows: [canonical({ status: "PRE", rawStatus: "STATUS_SCHEDULED", scoreHome: null, scoreAway: null })],
    finalResultRows: [finalResult()],
    season: "2026-2027"
  });
  assert.equal(nonterminal.ok, false);
  assert.equal(nonterminal.errors.some(error => error.reason === "verified_final_canonical_nonterminal"), true);
});

test("accepts provider display aliases only after exact canonical match-id parity", () => {
  const c = canonical({
    canonicalId: "cid_alias",
    matchId: "cid_alias",
    leagueSlug: "rus.2",
    homeTeam: "SKA Khabarovsk",
    awayTeam: "S. Kostroma",
    scoreHome: 1,
    scoreAway: 3,
  });
  const f = finalResult({
    matchId: "cid_alias",
    leagueSlug: "rus.2",
    homeTeam: "SKA Khabarovsk",
    awayTeam: "Spartak Kostroma",
    homeScore: 1,
    awayScore: 3,
    scoreHome: 1,
    scoreAway: 3,
    finalScore: { homeScore: 1, awayScore: 3, home: 1, away: 3, scoreKey: "1-3" },
    scoreKey: "1-3",
  });
  const built = buildVerifiedHistoryDay({
    dayKey: "2026-08-08",
    canonicalRows: [c],
    finalResultRows: [f],
    season: "2026-2027",
  });
  assert.equal(built.ok, true);
  assert.equal(built.acceptedRows, 1);
});

test('finalized exact club aliases retain location qualifiers when validating history',()=>{
 const result=buildVerifiedHistoryDay({dayKey:'2026-08-08',
  canonicalRows:[canonical({leagueSlug:'arg.2',homeTeam:'Gimnasia y Esgrima (Jujuy)',awayTeam:'Atletico Rafaela'})],
  finalResultRows:[finalResult({leagueSlug:'arg.2',homeTeam:'Gimnasia Jujuy',awayTeam:'Atl. Rafaela'})]});
 assert.equal(result.ok,true);assert.equal(result.acceptedRows,1);
 assert.equal(result.rows[0].scoreHome,2);assert.equal(result.rows[0].scoreAway,1);
});

test('different finalized global club identities veto legacy names that otherwise match',()=>{
 const identityResolver={resolveTeamReference:({alias})=>({ok:true,globalClubId:alias==='Home'?'club-one':alias==='Home FC'?'club-two':'away-club'})};
 const result=buildVerifiedHistoryDay({dayKey:'2026-08-08',canonicalRows:[canonical()],
  finalResultRows:[finalResult({homeTeam:'Home FC'})],identityResolver});
 assert.equal(result.ok,false);assert.ok(result.errors.some(e=>e.reason==='canonical_verified_final_team_mismatch'));
});

test('unregistered history aliases retain the existing conservative name validation',()=>{
 const identityResolver={resolveTeamReference:()=>({ok:false,status:'NORMALIZED_EXACT_ALIAS_NOT_FOUND'})};
 const result=buildVerifiedHistoryDay({dayKey:'2026-08-08',canonicalRows:[canonical()],
  finalResultRows:[finalResult({homeTeam:'Home FC'})],identityResolver});
 assert.equal(result.ok,true);assert.equal(result.acceptedRows,1);
});

test('squad markers veto history aliases before any global identity match',()=>{
 const identityResolver={resolveTeamReference:()=>({ok:true,globalClubId:'same-club'})};
 for(const name of ['Home B','Home U21','Home W']){
  const result=buildVerifiedHistoryDay({dayKey:'2026-08-08',canonicalRows:[canonical()],finalResultRows:[finalResult({homeTeam:name})],identityResolver});
  assert.equal(result.ok,false);assert.ok(result.errors.some(e=>e.reason==='canonical_verified_final_team_mismatch'));
 }
});

test('batch recovery imports only requested verified IDs and keeps conflicted rows out', async t => {
  const fs = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { persistVerifiedHistoryBuild } = await import('./append-finalized-day-to-history.js');
  const root = await fs.mkdtemp(join(tmpdir(), 'matchlab-history-batch-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const historyPath = join(root, 'history.json');
  const input = {
    dayKey: '2026-08-08', season: '2026-2027', ok: false, reason: 'history_truth_parity_failed',
    rows: [
      { id: 'new', leagueSlug: 'test.1', homeTeam: 'Home', awayTeam: 'Away', kickoff_ms: 1 },
      { id: 'blocked', leagueSlug: 'test.1', homeTeam: 'C', awayTeam: 'D', kickoff_ms: 2 },
      { id: 'outside-plan', leagueSlug: 'test.1', homeTeam: 'E', awayTeam: 'F', kickoff_ms: 3 },
      { id: 'alternate-id', leagueSlug: 'test.1', homeTeam: 'Home', awayTeam: 'Away', kickoff_ms: 4 },
    ],
    errors: [{ matchId: 'blocked', reason: 'verified_final_identity_duplicate' }],
  };
  const options = { historyPath, journalRoot: join(root, 'journal') };
  assert.equal((await persistVerifiedHistoryBuild(input, options)).ok, false);
  options.recoveryMatchIds = ['new', 'blocked', 'alternate-id'];
  assert.equal((await persistVerifiedHistoryBuild(input, options)).rowsWritten, 1);
  const history = await fs.readFile(historyPath, 'utf8');
  assert.deepEqual(JSON.parse(history).days[0].rows.map(row => row.id), ['new']);
  assert.equal((await persistVerifiedHistoryBuild(input, options)).rowsWritten, 0);
  assert.equal(await fs.readFile(historyPath, 'utf8'), history);
});

test("overlapping canonical identities are held regardless of score or provider", () => {
  for (const score of [2, 3]) {
    const result = buildVerifiedHistoryDay({
      dayKey: "2026-08-08",
      canonicalRows: [canonical(), canonical({canonicalId:"cid_other", scoreHome:score, kickoffUtc:"2026-08-08T19:00:00Z"})],
      finalResultRows: [finalResult(), finalResult({matchId:"cid_other", homeScore:score, finalScore:{homeScore:score,awayScore:1}})]
    });
    assert.equal(result.ok, false);
    assert.deepEqual(result.errors.filter(e=>e.reason==="history_semantic_identity_overlap").map(e=>e.matchId).sort(), ["cid_other","cid_test_home_away_20260808"]);
  }
});

test("adjacent-day overlap blocks normal and additive admission without rewriting prior truth", async t => {
  const fs = await import("node:fs/promises");
  const {tmpdir} = await import("node:os");
  const {join} = await import("node:path");
  const {persistVerifiedHistoryBuild} = await import("./append-finalized-day-to-history.js");
  const root = await fs.mkdtemp(join(tmpdir(), "matchlab-history-cross-day-"));
  t.after(() => fs.rm(root, {recursive:true, force:true}));
  const historyPath = join(root, "history.json");
  const old = {id:"old-provider", dayKey:"2026-08-08", leagueSlug:"test.1", homeTeam:"Home", awayTeam:"Away", kickoff_ms:Date.parse("2026-08-08T20:30:00Z"), scoreHome:2, scoreAway:1, status:"FT"};
  const original = JSON.stringify({season:"2026-2027",days:[{dayKey:old.dayKey,rows:[old]}]});
  await fs.writeFile(historyPath, original);
  const next = {...old,id:"new-canonical",dayKey:"2026-08-09",kickoff_ms:Date.parse("2026-08-08T21:30:00Z")};
  const options = {historyPath,journalRoot:join(root,"journal")};
  for (const scoreHome of [2,3]) {
    const build = {ok:true,season:"2026-2027",dayKey:next.dayKey,rows:[{...next,scoreHome}],errors:[]};
    const normal = await persistVerifiedHistoryBuild(build,options);
    assert.equal(normal.ok,false);
    assert.equal(normal.reason,"history_review_required");
    assert.equal(normal.errors[0].reason,"history_cross_day_identity_overlap");
    assert.equal(await fs.readFile(historyPath,"utf8"),original);
    const recovery = await persistVerifiedHistoryBuild(build,{...options,recoveryMatchIds:[next.id]});
    assert.equal(recovery.rowsWritten,0);
    assert.equal(await fs.readFile(historyPath,"utf8"),original);
  }
  const later = {...next,kickoff_ms:Date.parse("2026-08-09T18:00:00Z")};
  const accepted = await persistVerifiedHistoryBuild({ok:true,season:"2026-2027",dayKey:next.dayKey,rows:[later],errors:[]},options);
  assert.equal(accepted.ok,true);
  assert.equal(accepted.rowsWritten,1);
  assert.deepEqual(JSON.parse(await fs.readFile(historyPath,"utf8")).days[0].rows,[old]);
});
