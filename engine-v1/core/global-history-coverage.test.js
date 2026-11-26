import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {censusHistoryCoverage,COVERAGE_GAP,validCoverageResult} from './global-history-coverage.js';
import {selectHistoryCoverageRepairs,runGlobalHistoryCoverageDay} from '../jobs/run-global-history-coverage-day.js';
import {collectGlobalHistoryCoverageIssues} from '../system-health/global-history-coverage-policy.js';
import {auditGlobalHistoryCoverage} from '../jobs/audit-global-history-coverage.js';

const row={id:'cid_one',leagueSlug:'eng.1',homeTeam:'Home',awayTeam:'Away',kickoff:'2026-10-01T12:00Z',scoreHome:1,scoreAway:0,status:'FT'};
const registry=[{slug:'eng.1',type:'league'},{slug:'uefa.nations',type:'continental'}];
const index={teamForm:{Home:{matches:[row]},Away:{matches:[row]}},leagueForm:{'eng.1':{matches:1}},matchups:{'Away::Home':{matches:[row]}}};
const census=options=>censusHistoryCoverage({registry,seasons:['2026-2027'],indexes:{'2026-2027':index},...options});

test('even perfect observed parity cannot certify acquisition completeness without provider baseline',()=>{
  const report=census({history:[{season:'2026-2027',rows:[row]}],archive:[{slug:'eng.1',season:'2026-2027',rows:[row]}]});
  assert.equal(report.fullCoverageCertified,false);
  assert.equal(report.competitions.length,2);
  assert.equal(report.competitions[0].expectedProviderHistory,null);
  assert.ok(report.gaps.some(g=>g.reason===COVERAGE_GAP.missingArchive&&g.slug==='uefa.nations'));
  assert.equal(report.gaps.some(g=>/CROSS_INDEX/.test(g.reason)),false);
});

test('missing canonical storage, index conflicts, duplicates and invalid results are independently recorded',()=>{
  const missing={...row,id:'cid_missing',homeTeam:'Unindexed Home'},wrong={...row,scoreAway:3};
  const report=census({history:[{season:'2026-2027',rows:[row,row,missing]}],
    verifiedCanonical:[{season:'2026-2027',dayKey:'2026-10-01',rows:[{...row,id:'cid_neverstored',homeTeam:'Never Stored Home'}]}],
    indexes:{'2026-2027':{...index,matchups:{pair:{matches:[wrong]}}}}});
  for(const reason of [COVERAGE_GAP.duplicate,COVERAGE_GAP.storedNotIndexed,COVERAGE_GAP.acquiredNotStored,COVERAGE_GAP.indexConflict])
    assert.ok(report.gaps.some(g=>g.reason===reason),reason);
  for(const patch of [{scoreHome:null},{scoreHome:''},{scoreAway:-1},{status:'POSTPONED'},{kickoff:'invalid'}])
    assert.equal(validCoverageResult({...row,...patch}),false);
});

test('explicit index lineage and a uniquely identical stored event resolve aliases without concealing changed scores',()=>{
 const legacy={...row,id:'old_native'},indexed={...row,id:'new_native',sourceMatchIds:['old_native']};
 const ix={teamForm:{Home:{matches:[indexed]},Away:{matches:[indexed]}},leagueForm:{'eng.1':{matches:1}},matchups:{pair:{matches:[indexed]}}};
 const report=census({history:[{season:'2026-2027',rows:[legacy]}],verifiedCanonical:[{season:'2026-2027',dayKey:'2026-10-01',rows:[{...row,id:'canonical_alias'}]}],indexes:{'2026-2027':ix}});
 assert.equal(report.lineageResolutions[0].status,'EXPLICIT_INDEX_LINEAGE_SAME_FACT');
 assert.equal(report.canonicalResolutions[0].storedId,'old_native');
 assert.equal(report.gaps.some(g=>[COVERAGE_GAP.acquiredNotStored,COVERAGE_GAP.storedNotIndexed].includes(g.reason)),false);
 const changed=census({history:[{season:'2026-2027',rows:[{...legacy,scoreHome:9}]}],indexes:{'2026-2027':ix}});
 assert.ok(changed.gaps.some(g=>g.reason===COVERAGE_GAP.storedNotIndexed));
 assert.equal(changed.lineageResolutions.length,0);
});

test('new fixture teams remain visible when absent from every index',()=>{
  const report=census({fixtures:[{...row,homeTeam:'New Team',id:'cid_future'}]});
  const team=report.teams.find(r=>r.team==='New Team');
  assert.deepEqual(team.indexIds,[]);assert.deepEqual(team.fixtureIds,['cid_future']);
});

test('an unreadable competition file does not hide other competitions or produce a coverage pass',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'aiml-history-census-'));
  try{
    const dir=path.join(root,'data/history-archive/eng.1');fs.mkdirSync(dir,{recursive:true});
    fs.writeFileSync(path.join(dir,'2026-2027.json'),'{invalid');
    const report=auditGlobalHistoryCoverage({root,dayKey:'2026-11-14',verifyTruth:false});
    assert.equal(report.fullCoverageCertified,false);
    assert.ok(report.readErrors.some(error=>error.path.includes('eng.1')));
    assert.equal(report.competitions.length,230);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('repair planner caps retries, respects cooldown and resets only when missing evidence changes',()=>{
  const report={dayKey:'2026-11-14',gaps:[1,2].map(n=>({reason:COVERAGE_GAP.acquiredNotStored,dayKey:`2026-11-0${n}`,id:`cid_${n}`}))};
  const first=selectHistoryCoverageRepairs(report,{}, {nowMs:100,maxTasks:1});
  assert.equal(first.selected.length,1);assert.equal(first.held[0].reason,'BATCH_BUDGET');
  const task=first.selected[0],ledger={[task.dayKey]:{...task,attempts:3,nextAttemptMs:0}};
  assert.equal(selectHistoryCoverageRepairs(report,ledger,{nowMs:100,maxTasks:2}).held[0].reason,'RETRY_BOUND_OR_COOLDOWN');
  report.gaps[0].id='cid_new_evidence';
  assert.equal(selectHistoryCoverageRepairs(report,ledger,{nowMs:100,maxTasks:2}).selected[0].attempts,0);
});

test('recovery failure persists cooldown and a second identical run does not repeat the provider/writer call',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'aiml-history-retry-'));
  let calls=0;
  const report={dayKey:'2026-11-14',gaps:[{reason:COVERAGE_GAP.acquiredNotStored,dayKey:'2026-11-01',id:'cid_one'}],metrics:{gaps:1}};
  const dependencies={audit:()=>report,append:async()=>{calls++;throw Error('SIMULATED_PROVIDER_FAILURE');},
    rebuild:async()=>({ok:true})};
  try{
    const first=await runGlobalHistoryCoverageDay(report.dayKey,{root,recover:true,nowMs:100,dependencies});
    assert.equal(first.attempts[0].reason,'SIMULATED_PROVIDER_FAILURE');
    const again=await runGlobalHistoryCoverageDay(report.dayKey,{root,recover:true,nowMs:101,dependencies});
    assert.equal(calls,1);assert.equal(again.attempts.length,0);assert.equal(again.fullCoverageCertified,false);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('successful additive recovery rebuilds only the affected season and reports unresolved global coverage',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'aiml-history-rebuild-'));
  const report={dayKey:'2026-11-14',gaps:[{reason:COVERAGE_GAP.acquiredNotStored,dayKey:'2026-11-01',id:'cid_one'}],metrics:{gaps:1}};
  const seasons=[];
  try{
    const result=await runGlobalHistoryCoverageDay(report.dayKey,{root,recover:true,nowMs:100,dependencies:{audit:()=>report,
      append:async()=>({ok:true,season:'2026-2027',rowsWritten:1}),rebuild:async({season})=>{seasons.push(season);return {ok:true,season};}}});
    assert.deepEqual(seasons,['2026-2027']);assert.equal(result.frozenPredictionsRegenerated,false);
    assert.equal(collectGlobalHistoryCoverageIssues(report)[0].severity,'warning');
    assert.equal(collectGlobalHistoryCoverageIssues({...report,readErrors:[{reason:'bad json'}]})[0].severity,'error');
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('an alternate audit root cannot silently invoke writers bound to the real project',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'aiml-history-root-'));
  try{
    await assert.rejects(runGlobalHistoryCoverageDay('2026-11-14',{root,recover:true}),
      /COVERAGE_RECOVERY_ROOT_REQUIRES_BOUND_DEPENDENCIES/);
    assert.deepEqual(fs.readdirSync(root),[]);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('unavailable journal leaves the evidence retry budget untouched',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'aiml-history-preflight-'));
  const report={dayKey:'2026-11-14',gaps:[{reason:COVERAGE_GAP.acquiredNotStored,dayKey:'2026-11-01',id:'cid_one'}],metrics:{gaps:1}};
  let calls=0;
  try{
    const result=await runGlobalHistoryCoverageDay(report.dayKey,{root,recover:true,dependencies:{audit:()=>report,
      preflight:async()=>({ok:false,reason:'HISTORY_JOURNAL_UNAVAILABLE',code:'EPERM'}),
      append:async()=>{calls++;},rebuild:async()=>{calls++;}}});
    assert.equal(calls,0);assert.equal(result.storage.code,'EPERM');
    assert.equal(fs.existsSync(path.join(root,'data/history-coverage/recovery-ledger.json')),false);
    assert.equal(fs.existsSync(path.join(root,'data/history-coverage/pending-rebuilds.json')),false);
    assert.equal(result.fullCoverageCertified,false);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('legacy storage failures do not permanently exhaust evidence retries after the environment is repaired',()=>{
  const report={dayKey:'2026-11-14',gaps:[{reason:COVERAGE_GAP.acquiredNotStored,dayKey:'2026-11-01',id:'cid_one'}]};
  const task=selectHistoryCoverageRepairs(report,{}, {nowMs:100}).selected[0];
  const ledger={[task.dayKey]:{...task,attempts:3,nextAttemptMs:100000,ok:false,reason:'EPERM: operation not permitted, link'}};
  const retry=selectHistoryCoverageRepairs(report,ledger,{nowMs:100});
  assert.equal(retry.selected.length,1);assert.equal(retry.selected[0].attempts,0);
  assert.equal(ledger[task.dayKey].attempts,3);
  ledger[task.dayKey].reason='history_truth_parity_failed';
  assert.equal(selectHistoryCoverageRepairs(report,ledger,{nowMs:100}).selected.length,0);
});

test('a failed rebuild survives the now-complete history audit and is retried without reappending',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'aiml-history-pending-'));
  const report={dayKey:'2026-11-14',gaps:[{reason:COVERAGE_GAP.acquiredNotStored,dayKey:'2026-11-01',id:'cid_one'}],metrics:{gaps:1}};
  let writes=0,builds=0;
  const dependencies={audit:()=>report,append:async()=>{writes++;return {ok:true,rowsWritten:1,season:'2026-2027'};},
    rebuild:async()=>{builds++;if(builds===1)throw Error('INDEX_WRITE_INTERRUPTED');return {ok:true,season:'2026-2027'};}};
  try{
    const first=await runGlobalHistoryCoverageDay(report.dayKey,{root,recover:true,dependencies});
    assert.deepEqual(first.pendingRebuildSeasons,['2026-2027']);
    assert.equal(first.rebuilds[0].reason,'INDEX_WRITE_INTERRUPTED');
    report.gaps=[];
    const again=await runGlobalHistoryCoverageDay(report.dayKey,{root,recover:true,dependencies});
    assert.equal(writes,1);assert.equal(builds,2);assert.deepEqual(again.pendingRebuildSeasons,[]);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,'data/history-coverage/pending-rebuilds.json'),'utf8')),{});
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('dry-run audit retains outstanding rebuilds and never calls a writer',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'aiml-history-readonly-'));
  const dir=path.join(root,'data/history-coverage');fs.mkdirSync(dir,{recursive:true});
  const pending={'2026-2027':{reason:'HISTORY_APPEND_REQUIRES_INDEX_REBUILD'}};
  fs.writeFileSync(path.join(dir,'pending-rebuilds.json'),JSON.stringify(pending));
  try{
    const result=await runGlobalHistoryCoverageDay('2026-11-14',{root,dependencies:{
      audit:()=>({dayKey:'2026-11-14',gaps:[],metrics:{gaps:0}}),rebuild:async()=>{throw Error('UNEXPECTED_WRITER');}}});
    assert.deepEqual(result.pendingRebuildSeasons,['2026-2027']);assert.deepEqual(result.rebuilds,[]);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir,'pending-rebuilds.json'),'utf8')),pending);
  }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('daily batch gives current-season gaps priority and keeps one older slot',()=>{
  const days=['2026-05-08','2026-05-09','2026-08-01','2026-08-02','2026-08-03'];
  const report={dayKey:'2026-11-26',gaps:days.map(dayKey=>({
    dayKey,id:`cid_${dayKey}`,reason:COVERAGE_GAP.acquiredNotStored,
  }))};
  const first=selectHistoryCoverageRepairs(report,{}, {nowMs:100,maxTasks:3});
  assert.deepEqual(first.selected.map(task=>task.dayKey),['2026-08-01','2026-08-02','2026-05-08']);
  const ledger=Object.fromEntries(first.selected.map(task=>[task.dayKey,{
    ...task,attempts:1,nextAttemptMs:200,
  }]));
  const next=selectHistoryCoverageRepairs(report,ledger,{nowMs:101,maxTasks:3});
  assert.deepEqual(next.selected.map(task=>task.dayKey),['2026-08-03','2026-05-09']);
});
