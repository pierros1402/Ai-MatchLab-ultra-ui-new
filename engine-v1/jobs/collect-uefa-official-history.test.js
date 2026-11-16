import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {validateUefaOfficialResult,revalidateUefaOfficialCapture} from './collect-uefa-official-history.js';
const expected={leagueSlug:'uefa.nations',officialMatchId:'123',officialEdition:'2024-2025',officialDate:'2024-09-05',homeTeam:'Home',awayTeam:'Away',scoreHome:2,scoreAway:2};
const payload={id:'123',competition:{id:'2014',sex:'MALE',sportsType:'FOOTBALL',teamCategory:'NATIONAL'},seasonYear:'2025',status:'FINISHED',
  kickOffTime:{date:'2024-09-05',dateTime:'2024-09-05T18:00Z'},fullTimeAt:'2024-09-05T20:00Z',
  homeTeam:{id:'home',internationalName:'Home',teamTypeDetail:'NATIONAL_MEN_TEAM_A'},awayTeam:{id:'away',internationalName:'Away',teamTypeDetail:'NATIONAL_MEN_TEAM_A'},
  score:{regular:{home:2,away:2},total:{home:2,away:2}}};
const opts={nowMs:Date.parse('2026-11-15T00:00Z')};

test('official native IDs, senior competition, edition, final status and timeline validate without promotion',()=>{
  const result=validateUefaOfficialResult(payload,expected,opts);
  assert.equal(result.ok,true);assert.equal(result.authorityPromotionAllowed,false);
  assert.equal(result.fact.kickoffUtc,'2024-09-05T18:00:00.000Z');assert.equal(result.fact.homeProviderTeamId,'home');
});

test('regulation, extra time and penalty scores remain distinct',()=>{
  const d=structuredClone(payload);d.score.penalty={home:5,away:3};
  const r=validateUefaOfficialResult(d,expected,opts);
  assert.equal(r.ok,true);assert.deepEqual(r.fact.regularScore,{home:2,away:2});assert.deepEqual(r.fact.penaltyScore,{home:5,away:3});
  d.score.regular.home=null;
  assert.equal(validateUefaOfficialResult(d,expected,opts).reason,'OFFICIAL_REGULAR_AND_TOTAL_SCORE_REQUIRED');
});

test('wrong ID, edition, competition, date or ordered teams cannot pass',()=>{
  for(const patch of [{id:'other'},{seasonYear:'2027'},{competition:{...payload.competition,id:'1'}},
    {competition:{...payload.competition,sex:'FEMALE'}},{homeTeam:{...payload.homeTeam,internationalName:'Other'}},
    {kickOffTime:{...payload.kickOffTime,date:'2024-09-06'}}])assert.equal(validateUefaOfficialResult({...payload,...patch},expected,opts).ok,false);
});

test('live, future, missing finish time and contradictory aggregate score remain held',()=>{
  for(const patch of [{status:'LIVE'},{fullTimeAt:null},{fullTimeAt:'2027-01-01T00:00Z'},
    {score:{regular:{home:2,away:2},total:{home:9,away:2}}}])assert.equal(validateUefaOfficialResult({...payload,...patch},expected,opts).ok,false);
  assert.equal(validateUefaOfficialResult(payload,expected,{nowMs:Date.parse('2024-09-01T00:00Z')}).ok,false);
});

test('placeholders and invalid penalty scores are never accepted as played senior results',()=>{
  const d=structuredClone(payload);d.homeTeam.isPlaceHolder=true;
  assert.equal(validateUefaOfficialResult(d,expected,opts).reason,'OFFICIAL_SENIOR_TEAM_IDS_REQUIRED');
  delete d.homeTeam.isPlaceHolder;d.score.penalty={home:-1,away:2};
  assert.equal(validateUefaOfficialResult(d,expected,opts).reason,'OFFICIAL_SCORE_PERIOD_INVALID');
});

test('offline revalidation verifies exact captured bytes and clears a superseded parser hold',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aiml-uefa-revalidate-'));
  try{
    const bytes=Buffer.from(JSON.stringify(payload)),sha256=crypto.createHash('sha256').update(bytes).digest('hex');
    const file=path.join(dir,sha256+'.json');fs.writeFileSync(file,bytes);
    const aggregateSha256='a'.repeat(64);
    const source={...expected,responseSha256:aggregateSha256};
    const extraction={schema:'ai-matchlab.official-history-extraction.v1',sources:[{rows:[source]}]};
    const capture={schema:'ai-matchlab.official-uefa-result-validation.v1',output:dir,records:[{
      officialMatchId:'123',url:'https://match.uefa.com/v5/matches/123',file,sha256,bytes:bytes.length,aggregateSha256,ok:false,reason:'OLD_PARSER_HOLD'}]};
    const result=revalidateUefaOfficialCapture(capture,extraction);
    assert.equal(result.validated,1);assert.equal(result.records[0].reason,undefined);assert.equal(capture.records[0].reason,'OLD_PARSER_HOLD');
    fs.appendFileSync(file,'tampered');
    assert.throws(()=>revalidateUefaOfficialCapture(capture,extraction),/HASH_OR_SIZE_MISMATCH/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test('an offline capture cannot escape its directory or change its official source binding',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aiml-uefa-binding-'));
  try{
    const bytes=Buffer.from(JSON.stringify(payload)),sha256=crypto.createHash('sha256').update(bytes).digest('hex');
    const file=path.join(dir,'fact.json');fs.writeFileSync(file,bytes);
    const capture={schema:'ai-matchlab.official-uefa-result-validation.v1',output:path.join(dir,'child'),records:[{file}]};
    const extraction={schema:'ai-matchlab.official-history-extraction.v1',sources:[]};
    assert.throws(()=>revalidateUefaOfficialCapture(capture,extraction),/PATH_ESCAPE/);
    capture.output=dir;capture.records[0]={file,sha256,bytes:bytes.length,officialMatchId:'123',url:'https://other.example/123'};
    assert.throws(()=>revalidateUefaOfficialCapture(capture,extraction),/SOURCE_BINDING_MISMATCH/);
  }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
