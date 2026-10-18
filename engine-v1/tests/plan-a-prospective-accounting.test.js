import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildValueDay} from '../core/build-value-day.js';
import {buildValueFixtureUniverse} from '../core/value-fixture-universe.js';
test('prospective eligibility accounts for played, cancelled and near-kickoff fixtures exactly once',async()=>{
 const day='2099-04-03',temp=fs.mkdtempSync(path.join(os.tmpdir(),'prospective-accounting-'));
 const oldNow=Date.now;Date.now=()=>Date.parse(day+'T18:00Z');
 const make=(name,status,time)=>({canonicalId:'cid_prospective_'+name,matchId:'cid_prospective_'+name,leagueSlug:'eng.1',homeTeam:name,awayTeam:'Away',kickoffUtc:day+'T'+time+'Z',status});
 const fixtures=[make('played','FT','17:00'),make('passed','PRE','17:30'),make('near','PRE','18:00:30'),make('cancelled','CANCELLED','20:00'),make('future','PRE','21:00')];
 try{
  await buildValueDay(day,{buildUniverse:()=>buildValueFixtureUniverse(day,{fixtures}),rebuild:true,prospectiveOnly:true,outputPath:path.join(temp,'value.json'),auditPath:path.join(temp,'audit.json'),decisionEvidenceFactory:()=>({capture(){},summary(){return {};}})});
  const a=JSON.parse(fs.readFileSync(path.join(temp,'audit.json'))).evaluationAccounting;
  assert.equal(a.evaluatedFixtureCount,fixtures.length);assert.equal(a.terminalOutcomeCount,fixtures.length);assert.equal(a.unaccountedFixtureCount,0);assert.equal(a.duplicateOutcomeCount,0);
 }finally{Date.now=oldNow;fs.rmSync(temp,{recursive:true});}
});
