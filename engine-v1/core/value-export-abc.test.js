import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {comparisonToValueExportDay,attachAutonomousExportDay,attachShadowExportDay,buildValueExportReport,valueExportCsvRecords,prepareValueComparisonForExport} from './value-export-report.js';
import {VALUE_EXPORT_IDENTITY_FIELDS,VALUE_EXPORT_IDENTITY_LABELS,valueExportIdentityValues} from './value-export-identity.js';
import {planCPredictionSignature,planCPredictionSetHash,PLAN_C_SHADOW_DAY_SCHEMA} from '../value/plan-c-shadow-export.js';
import {signature} from '../value/unified-shadow.js';
import {researchHash} from '../value/autonomous-comparison-stats.js';
import {buildAutonomousTransport,readAutonomousPreviewTransport,AB_PREVIEW_SCHEMA} from '../value/autonomous-preview-transport.js';
import {bindResearchEnvelope,exposeBoundResearch} from '../value/autonomous-release-binding.js';
import {prepareImmutableGeneration,activateImmutableGeneration} from '../jobs/runtime-immutable-generation.js';
import {readPinnedRuntimeArtifact} from '../jobs/runtime-generation-artifact-reader.js';
const day='2026-11-15',now=day+'T06:00:00.000Z',id='cid_one_20261115',kickoffUtc=day+'T19:00:00.000Z';
const aRow={matchId:id,canonicalMatchId:id,homeTeam:'Home',awayTeam:'Away',leagueSlug:'eng.1',kickoffUtc,market:'OU25',pick:'over',result:'UNRESOLVED',settlementTruth:null,unified:true,sourceScores:{A:.748,A2:.751}};
const sum={picks:1,wins:0,losses:0,voids:0,settled:0,unresolved:1,hitRate:null};
const aBody={id:'plan-u1',date:day,status:'AVAILABLE',policyId:'unified-public-u1-incremental-v1',count:1,picks:[aRow],analysisComplete:false,records:[{signature:'a'.repeat(64),generatedAt:now}],summary:sum};
const a={...aBody,projectionSignature:signature(aBody)};
const bRows=[{...aRow,unified:false,researchOnly:true,modelProb:.8,result:'PENDING',timingCertified:false},{...aRow,unified:false,researchOnly:true,market:'BTTS',pick:'yes',modelProb:.75,result:'PENDING',timingCertified:false}];
const bBody={schema:'aiml.autonomous-research-daily.v1',id:'plan-autonomous-preview',date:day,status:'RESEARCH_ONLY',publicationAuthorized:false,analysisComplete:false,zeroPicksCertified:false,generatedAt:now,count:2,picks:bRows,records:[{signature:'b'.repeat(64),generatedAt:now,commonDecisionAt:now}],conflicts:[],summary:{picks:2,wins:0,losses:0,voids:0,settled:0,pending:2,hitRate:null}};
const b={...bBody,projectionSha256:researchHash(bBody)};
const privateComparison={ok:true,date:day,generatedAt:now,publicationAuthorized:false,unifiedPlan:a,autonomousPreviewMode:true,autonomousPreview:b};
const transport=buildAutonomousTransport(privateComparison);
const legacy={ok:true,date:day,plans:{A:{picks:[]},A2:{picks:[]},B:{picks:[{...aRow,pick:'under'}]},B2:{picks:[]}},unifiedPlan:a};
const bound=bindResearchEnvelope(legacy,transport,day);
const exposed=exposeBoundResearch(bound,day,{pinned:true,enabled:true});
function shadowEntry(i,state,home=0,away=0,overrides={}){
 const row={schema:'ai-matchlab.plan-c-shadow-prediction.v1.1',canonicalFixtureId:`cid_c${i}_20261115`,day,kickoffUtc,snapshotRetrievedAt:day+'T04:00:00Z',predictionCreatedAt:day+'T05:00:00Z',identityCategory:'both',eloApplied:true,planCPick:true,homeTeam:'C Home '+i,awayTeam:'C Away '+i,leagueSlug:'eng.1',baseline:{pOver25:.55},adjusted:{pOver25:.77},...overrides};
 return {prediction:{...row,predictionSignature:planCPredictionSignature(row)},settlement:{state,truth:state==='SETTLED'?{status:'FT',scoreHome:home,scoreAway:away}:null}};
}
function shadowArtifact(entries=[shadowEntry(1,'SETTLED',2,1),shadowEntry(2,'SETTLED',1,1),shadowEntry(3,'VOID_EXCLUDED'),shadowEntry(4,'PENDING'),shadowEntry(5,'PENDING',0,0,{planCPick:false}),shadowEntry(6,'PENDING',0,0,{canonicalFixtureId:'cid_future_20261116',kickoffUtc:'2026-11-15T22:30:00Z'})]){
 return {schema:PLAN_C_SHADOW_DAY_SCHEMA,ok:true,available:true,mode:'SHADOW',productionEligible:false,date:day,generatedAt:now,sourcePredictionSetHash:planCPredictionSetHash(entries),count:entries.length,pickCount:entries.filter(e=>e.prediction.planCPick).length,entries};
}
function combinedRecord(c=exposed,shadow=shadowArtifact()){
 return attachShadowExportDay(attachAutonomousExportDay(comparisonToValueExportDay({date:day,comparison:c}),c),{payload:shadow,source:'snapshot'});
}
function report(records,days=[day],includeAutonomous=true,includeShadow=true){return buildValueExportReport({from:days[0],to:days.at(-1),days,dayRecords:records,today:day,includeAutonomous,includeShadow});}
test('new B and C export independently with canonical IDs; no legacy B or observations leak into active picks',()=>{
 const before=JSON.stringify({exposed,transport,bound});const r=report([combinedRecord()]);
 assert.deepEqual(r.planOrder,['U1','B_AUTO','C_SHADOW']);assert.deepEqual([r.plans.U1.picks.length,r.plans.B_AUTO.picks.length,r.plans.C_SHADOW.picks.length],[1,2,4]);
 assert.equal(r.totalRows,7);assert.deepEqual(r.plans.U1.picks[0].sourceScores,{A:.748,A2:.751});assert.equal(r.plans.U1.picks[0].score,null);assert.equal(r.plans.U1.picks[0].originalPickValue,null);assert.equal(r.plans.U1.picks[0].originalPickValueKind,"SOURCE_SCORES");assert.equal(r.plans.B_AUTO.picks[0].originalPickValue,.8);assert.equal(r.plans.C_SHADOW.picks[0].originalPickValue,.77);assert.equal(r.plans.B_AUTO.picks[0].score,null);assert.equal(r.plans.B_AUTO.picks[0].marketProb,.8);assert.equal(r.plans.B_AUTO.picks[0].timingCertified,false);assert.equal(r.plans.B_AUTO.range.winRate,null);assert.equal(r.plans.C_SHADOW.picks[0].marketProb,.77);assert.equal(r.plans.C_SHADOW.range.winRate,.5);
 assert.deepEqual(r.plans.C_SHADOW.picks.map(x=>x.result),['WIN','LOSS','VOID','UNRESOLVED']);assert.equal(r.plans.C_SHADOW.picks[0].finalScore,'2-1');assert.equal(r.plans.C_SHADOW.picks[2].finalScore,null);assert.equal(r.plans.C_SHADOW.picks[3].finalScore,null);assert.equal(r.integrity.identityGaps.length,0);assert.equal(JSON.stringify({exposed,transport,bound}),before);
});
test('mixed range keeps original B distinct; absent C and unavailable A not presented as successful zero',()=>{
 const old='2026-10-17',oldRow={...aRow,canonicalMatchId:'cid_legacy_20261017',matchId:'cid_legacy_20261017'};
 const oldRecord=comparisonToValueExportDay({date:old,comparison:{plans:{A:{picks:[]},A2:{picks:[]},B:{picks:[oldRow]},B2:{picks:[]}}}});
 const r=report([oldRecord,combinedRecord()],[old,day]);assert.deepEqual(r.planOrder,['A','A2','B','B2','U1','B_AUTO','C_SHADOW']);assert.equal(r.plans.B.picks.length,1);assert.equal(r.plans.B_AUTO.picks.length,2);assert.equal(r.plans.B_AUTO.range.totalDays,1);assert.equal(r.plans.C_SHADOW.range.totalDays,2);assert.equal(r.plans.C_SHADOW.daily[0].status,'NO_PLAN_RECORD');
 const cOnly=attachShadowExportDay({date:day,plans:{},comparisonMissing:true},{payload:shadowArtifact(),source:'snapshot'});const r2=report([cOnly]);assert.equal(r2.plans.U1.daily[0].status,'MISSING_DAY');assert.equal(r2.plans.B_AUTO.daily[0].status,'MISSING_DAY');assert.equal(r2.plans.C_SHADOW.picks.length,4);
});
test('B export not authorized by unpinned or disabled release; invalid B cannot remove A',()=>{
 for(const opts of [{pinned:false,enabled:true},{pinned:true,enabled:false}]){
  const cmp=exposeBoundResearch(bound,day,opts);const r=report([combinedRecord(cmp)]);assert.equal(r.plans.U1.picks.length,1);assert.equal(r.plans.B_AUTO.picks.length,0);assert.equal(r.plans.B_AUTO.daily[0].status,'NO_PLAN_RECORD');
 }
 const bad=structuredClone(bound);bad.autonomousResearchEnvelope.autonomousPreview.picks[0].modelProb=.99;const r=report([combinedRecord(exposeBoundResearch(bad,day,{pinned:true,enabled:true}))]);assert.equal(r.plans.U1.picks.length,1);assert.equal(r.plans.B_AUTO.picks.length,0);
});
test('C wrong day or tampered signed probability fails closed; valid empty C is not certified zero',()=>{
 for(const corrupt of [p=>p.date='2026-11-14',p=>p.entries[0].prediction.adjusted.pOver25=.99,p=>p.productionEligible=true]){
  const c=shadowArtifact();corrupt(c);const r=report([combinedRecord(exposed,c)]);assert.equal(r.plans.C_SHADOW.picks.length,0);assert.equal(r.plans.C_SHADOW.daily[0].status,'NO_PLAN_RECORD');assert.equal(r.plans.U1.picks.length,1);
 }
 const r=report([combinedRecord(exposed,shadowArtifact([shadowEntry(1,'PENDING',0,0,{planCPick:false})]))]);assert.equal(r.plans.C_SHADOW.daily[0].status,'ZERO_PICKS_UNVERIFIED');
});
const index=fs.readFileSync(new URL('../index.js',import.meta.url),'utf8');
test('real compact/range XLSX row renderers and CSV retain identities, native model probabilities and plan separation',()=>{
 const r=report([combinedRecord()]);const rows=[];const sheet={rowCount:0,addRow(values){rows.push(Array.from(values));this.rowCount++;return {number:this.rowCount,getCell(){return {}}}},mergeCells(){}};
 const ctx={VALUE_EXPORT_IDENTITY_FIELDS,VALUE_EXPORT_IDENTITY_LABELS,valueExportIdentityValues,styleValueExportTitle:(s,n,t)=>s.addRow([t]),addValueExportTableHeader:(s,v)=>s.addRow(v),setValueExportPercentCell(){},valueExportPercent:x=>x,valueExportFinalScore:r=>r.finalScore||'',valueExportMatchLabel:r=>r.homeTeam+' – '+r.awayTeam,valueExportKickoffTime:x=>x,csvEscape:x=>JSON.stringify(String(x??''))};
 vm.createContext(ctx);for(const [start,end] of [['function addCompactDailyValuePicks(','function addCompactDailyPlanAnalysis('],['function addValueExportPlanSection(','function valueExportKickoffTime('],['function valueExportCsvHeader()','app.get("/value-export/range"']])vm.runInContext(index.slice(index.indexOf(start),index.indexOf(end,index.indexOf(start))),ctx);
 ctx.addCompactDailyValuePicks(sheet,r);const header=rows[1];assert.deepEqual(header.slice(-3),VALUE_EXPORT_IDENTITY_LABELS);assert.equal(header.indexOf('Market Prob'),11);for(const row of rows.slice(2)){assert.equal(row.length,header.length)}
 assert.equal(rows[2][12],"A=0.748; A2=0.751");assert.equal(rows[3][13],.8);assert.equal(rows[5][13],.77);assert.equal(rows[3][11],.8);assert.equal(rows[5][11],.77);assert.match(rows[3][0],/Plan B/);assert.match(rows[5][0],/Plan C/);
 rows.length=0;sheet.rowCount=0;ctx.addValueExportPlanSection(sheet,r.plans.B_AUTO);assert.equal(rows[2][10],.8);assert.deepEqual(rows[2].slice(-3),valueExportIdentityValues(r.plans.B_AUTO.picks[0]));
 const csvh=Array.from(ctx.valueExportCsvHeader()),records=valueExportCsvRecords(r);assert.equal(records.filter(x=>x.recordType==='PICK').length,7);for(const row of records.filter(x=>x.recordType==='PICK')){const parsed=JSON.parse('['+ctx.valueExportCsvLine(row)+']');assert.equal(parsed.length,csvh.length);assert.equal(parsed[csvh.indexOf('marketProb')],String(row.marketProb??''));assert.equal(parsed[csvh.indexOf('sourceScores')],Object.entries(row.sourceScores||{}).map(([k,v])=>`${k}=${v}`).join("; "))};
});
test('actual backend export reader traverses immutable generation, verifies mirrors, rejects drift and does not expose B via legacy fallback',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'aiml-export-abc-'));try{
  const dataRoot=path.join(root,'data'),stage=path.join(root,'stage'),ref='a'.repeat(40),hash='b'.repeat(64);fs.mkdirSync(path.join(stage,'runtime'),{recursive:true});const stageFile=path.join(stage,'runtime','value-comparison.json');fs.writeFileSync(stageFile,JSON.stringify(bound));fs.writeFileSync(path.join(stage,'manifest.json'),JSON.stringify({ok:true,hash,date:day}));const gen=await prepareImmutableGeneration({dataRoot,day,ref,manifestHash:hash,sourceDir:stage});await activateImmutableGeneration(dataRoot,gen);
  const ctx={fs,process:{env:{AIML_AB_RESEARCH_PREVIEW_READS:'1',AIML_V35K_GENERATION_READS:'1'}},path,resolveDataPath:(...p)=>path.join(dataRoot,...p),preferRuntimeReleaseArtifact:()=>stageFile,deploySnapshotRuntimeArtifactFile:()=>path.join(root,'mirror.json'),truthyEnv:x=>x==='1',readPinnedRuntimeArtifact,exposeBoundResearch,readAutonomousPreviewTransport,AB_PREVIEW_SCHEMA,prepareValueComparisonForExport,comparisonToValueExportDay,attachAutonomousExportDay};vm.createContext(ctx);
  for(const [start,end] of [['function readValueComparisonArtifact(','app.get("/value-comparison"'],['function valueExportComparisonMirrorPaths(','function valueExportSourcePicks(']])vm.runInContext(index.slice(index.indexOf(start),index.indexOf(end,index.indexOf(start))),ctx);
  let r=await ctx.loadValueExportComparisonDay(day);assert.equal(r.ok,true);assert.equal(r.day.plans.B_AUTO.picks.length,2);assert.equal(r.day.plans.U1.picks.length,1);
  ctx.process.env.AIML_AB_RESEARCH_PREVIEW_READS='0';r=await ctx.loadValueExportComparisonDay(day);assert.equal(r.day.plans.B_AUTO.available,false);ctx.process.env.AIML_AB_RESEARCH_PREVIEW_READS='1';ctx.process.env.AIML_V35K_GENERATION_READS='0';r=await ctx.loadValueExportComparisonDay(day);assert.equal(r.day.plans.B_AUTO.available,false);
  ctx.process.env.AIML_V35K_GENERATION_READS='1';fs.writeFileSync(path.join(root,'mirror.json'),'{}');r=await ctx.loadValueExportComparisonDay(day);assert.equal(r.ok,false);assert.match(r.issue.message,/mirror_generation_divergence/);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('actual frontend adapter preserves A and strips raw or wrong-day research extensions',async()=>{
 const source=fs.readFileSync(new URL('../../assets/js/live/value-adapter.js',import.meta.url),'utf8');let payload={...exposed,source:'value-comparison-release-artifact'};
 const get=vm.runInNewContext(source.slice(source.indexOf('  async function fetchComparisonUrl('),source.indexOf('  async function fetchValueComparison('))+'\nfetchComparisonUrl',{rawFetchWithTimeout:async()=>({ok:true,status:200,json:async()=>payload}),console:{log(){},warn(){}},isAbortError:()=>false});
 assert.equal((await get('x','engine-release')).autonomousPreview.count,2);assert.equal((await get('x','static-fallback')).autonomousPreview,undefined);
 payload={...payload,autonomousPreview:{...payload.autonomousPreview,date:'2026-11-16'}};const wrong=await get('x','engine-release');assert.equal(wrong.autonomousPreview,undefined);assert.equal(wrong.unifiedPlan.count,1);
 payload={...bound,...exposed,source:'value-comparison-release-artifact'};assert.equal((await get('x','engine-release')).autonomousPreview,undefined);
});
test('real frontend panel renders both plan cards with identical row layout, separate stats and a research warning',()=>{
 const body={innerHTML:''},head={innerHTML:''},handlers={};const root={isConnected:true,getBoundingClientRect:()=>({width:500,height:500}),querySelector:s=>s==='.value-head-wrap'?head:s==='#value-picks-list'?body:null};
 const window={on:(k,fn)=>handlers[k]=fn,getComputedStyle:()=>({display:'block',visibility:'visible'}),AIML_PANEL:{set:()=>{}}};const document={querySelectorAll:()=>[root],querySelector:()=>root};
 vm.runInNewContext(fs.readFileSync(new URL('../../assets/js/ui/value-picks.js',import.meta.url),'utf8'),{window,document,console:{log(){},warn(){}},setTimeout:()=>{},Date,Intl});
 handlers['value:update']({date:day,unifiedPlan:a,comparison:exposed});const html=head.innerHTML+body.innerHTML;assert.equal((html.match(/class="value-plan-card"/g)||[]).length,2);assert.equal((html.match(/class="value-row value-compare-row/g)||[]).length,3);assert.match(html,/>Plan A\s*</);assert.match(html,/>Plan B\s*</);assert.match(html,/ερευνητική λειτουργία/);assert.match(html,/1 picks/);assert.match(html,/2 picks/);assert.match(html,/Model 0,800/);assert.match(html,/Score A 0,748 · A2 0,751/);assert.match(html,/FT —/);assert.match(html,/BTTS Yes/);
 handlers['value:update']({date:day,unifiedPlan:a,comparison:legacy});const single=head.innerHTML+body.innerHTML;assert.equal((single.match(/class="value-plan-card"/g)||[]).length,1);assert.doesNotMatch(single,/Plan B/);
});

test('common row shows original decimal and verified FT, with no made-up source score or late B final',()=>{
 const source=fs.readFileSync(new URL('../../assets/js/ui/value-picks.js',import.meta.url),'utf8');
 const start=source.indexOf('function comparisonScoreLabel('),end=source.indexOf('// Unified publication',start);
 const f=vm.runInNewContext(source.slice(start,end)+'\n({label:comparisonScoreLabel,ft:comparisonFinalScore})');
 const a={unified:true,sourceScores:{A:.748,A2:.748},result:'WIN',settlementTruth:{scoreHome:2,scoreAway:1},finalScore:{scoreKey:'2-1'}};
 const b={researchOnly:true,modelProb:.748,timingCertified:true,settlementTruth:{scoreHome:2,scoreAway:1},result:'WIN',finalScore:{scoreKey:'2-1'}};
 assert.equal(f.label(a),'Score A/A2 0,748');assert.equal(f.label(b),'Model 0,748');assert.equal(f.ft(a),'2-1');assert.equal(f.ft(b),'2-1');
 assert.equal(f.ft({...b,timingCertified:false}),null);assert.equal(f.ft({...b,result:'PENDING'}),null);assert.equal(f.ft({...b,finalScore:{scoreKey:'<script>'}}),null);assert.equal(f.ft({...b,finalScore:{scoreKey:'0-0'}}),null);assert.equal(f.ft({...a,finalScore:null}),'2-1');
 assert.equal(f.label({unified:true,rawConfidence:.99,readiness:.9}),'Score —');assert.equal(f.label({researchOnly:true,modelProb:null}),'Model —');
});

test('settled A/B render the same FT field and export the original value without recomputation',()=>{
 const aPick={...aRow,sourceScores:{A:.748,A2:.748},result:'WIN',finalScore:{scoreKey:'2-1'},settlementTruth:{scoreHome:2,scoreAway:1}};
 const bPick={...bRows[0],modelProb:.748,result:'WIN',timingCertified:true,finalScore:{scoreKey:'2-1'},settlementTruth:{scoreHome:2,scoreAway:1}};
 const c={...exposed,unifiedPlan:{...a,picks:[aPick]},autonomousPreview:{...b,count:1,picks:[bPick]}};
 // Presentation fixture only: upstream signature/transport acceptance is separately tested above.
 const r=report([combinedRecord(c)]);
 for(const row of [r.plans.U1.picks[0],r.plans.B_AUTO.picks[0]]){assert.equal(row.originalPickValue,.748);assert.equal(row.finalScore,'2-1');assert.equal(row.result,'WIN');}
 assert.equal(r.plans.U1.picks[0].originalPickValueKind,'SOURCE_SCORES');assert.equal(r.plans.B_AUTO.picks[0].originalPickValueKind,'MODEL_PROBABILITY');
 const mismatch=structuredClone(c);mismatch.unifiedPlan.picks[0].finalScore={scoreKey:'0-0'};mismatch.autonomousPreview.picks[0].finalScore={scoreKey:'0-0'};const bad=report([combinedRecord(mismatch)]);assert.equal(bad.plans.U1.picks[0].finalScore,null);assert.equal(bad.plans.B_AUTO.picks[0].finalScore,null);
 const body={innerHTML:''},head={innerHTML:''},handlers={};const root={isConnected:true,getBoundingClientRect:()=>({width:500,height:500}),querySelector:s=>s==='.value-head-wrap'?head:s==='#value-picks-list'?body:null};
 const window={on:(k,fn)=>handlers[k]=fn,getComputedStyle:()=>({display:'block',visibility:'visible'}),AIML_PANEL:{set:()=>{}}};const document={querySelectorAll:()=>[root],querySelector:()=>root};
 vm.runInNewContext(fs.readFileSync(new URL('../../assets/js/ui/value-picks.js',import.meta.url),'utf8'),{window,document,console:{log(){},warn(){}},setTimeout:()=>{},Date,Intl});
 handlers['value:update']({date:day,unifiedPlan:c.unifiedPlan,comparison:c});
 assert.equal((body.innerHTML.match(/value-final-score">FT 2-1</g)||[]).length,2);assert.equal((body.innerHTML.match(/data-verified-final="true"/g)||[]).length,2);assert.match(body.innerHTML,/Score A\/A2 0,748/);assert.match(body.innerHTML,/Model 0,748/);
});
