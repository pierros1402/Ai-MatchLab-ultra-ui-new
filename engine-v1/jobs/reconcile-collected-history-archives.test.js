import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import crypto from 'node:crypto';import zlib from 'node:zlib';
import {parseFlashscoreFeed} from '../odds/flashscore-fixtures-source.js';
import {validateObservedFeedResult} from './collect-missing-competition-history.js';
import {revalidateCollectedArchiveFacts,sameVerifiedCanonicalArchiveEvent,sameCanonicalArchiveIdentity} from './reconcile-collected-history-archives.js';
test('archive preparation revalidates exact captured bytes and rejects a changed observed result',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'aiml-native-archive-validation-'));
 try{
  fs.mkdirSync(path.join(dir,'raw'));const feed='ZA÷Bundesliga¬ZL÷/football/germany/bundesliga/¬~AA÷NATIVE01¬AE÷Home¬AF÷Away¬PX÷TEAM0001¬PY÷TEAM0002¬AD÷1790863200¬AB÷3¬AC÷3¬AG÷2¬AH÷0¬~';
  const bytes=Buffer.from(feed),sha256=crypto.createHash('sha256').update(bytes).digest('hex'),url='https://2.flashscore.ninja/2/x/feed/test',capturedAt='2026-11-15T00:00Z';
  const value=validateObservedFeedResult(parseFlashscoreFeed(feed)[0],{slug:'ger.1',season:'2026-2027',nowMs:Date.parse(capturedAt)});assert.equal(value.ok,true);
  const row={...value.row,sourceEvidence:{url,sha256,capturedAt,independentSourceCount:1,verifiedCanonicalPromotion:false}};
  fs.writeFileSync(path.join(dir,'raw',sha256+'.gz'),zlib.gzipSync(bytes));
  fs.writeFileSync(path.join(dir,'capture-manifest.json'),JSON.stringify([{ok:true,url,sha256,capturedAt,file:'raw/'+sha256+'.gz',bytes:bytes.length}]));
  const report={schema:'aiml.missing-competition-native-history-capture.v1',competitionInventory:230,productionWrites:0,excludedCompletedUefaRecovery:true,records:[{slug:'ger.1',seasons:[{season:'2026-2027',rows:[row]}]}]};
  fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report));assert.equal(revalidateCollectedArchiveFacts(dir).facts.length,1);
  row.scoreHome=9;fs.writeFileSync(path.join(dir,'report.json'),JSON.stringify(report));assert.throws(()=>revalidateCollectedArchiveFacts(dir),/RAW_NATIVE_FACT_DISAGREEMENT/);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('archive alias duplicates require exact verified canonical ID, instant, ordered identities and scores',()=>{
 const fact={id:'cid_match',leagueSlug:'eng.1',homeTeam:'Hull City',awayTeam:'Manchester United',kickoff_ms:Date.parse('2026-08-22T11:30Z'),scoreHome:2,scoreAway:0};
 const alias={...fact,homeTeam:'Hull',awayTeam:'Manchester Utd'};assert.equal(sameVerifiedCanonicalArchiveEvent(alias,fact),true);
 for(const patch of [{id:'other'},{scoreAway:1},{kickoff_ms:fact.kickoff_ms+3600000},{homeTeam:'Hull City U21'},{awayTeam:'Unrelated Club'}])assert.equal(sameVerifiedCanonicalArchiveEvent({...alias,...patch},fact),false);
 assert.equal(sameCanonicalArchiveIdentity({...alias,scoreAway:1},fact),true);
 assert.equal(sameCanonicalArchiveIdentity({...alias,kickoff_ms:fact.kickoff_ms+60000},fact),false);
});
