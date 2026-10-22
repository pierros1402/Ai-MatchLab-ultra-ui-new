import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {prepareArchivedMatchImport} from './prepare-archived-match-import.js';
import {applyPreparedArchivedImport} from './apply-reviewed-archived-match-import.js';
import {writeHistoryJsonAtomic} from '../storage/history-preservation.js';
const now=Date.parse('2026-10-22T04:00Z');
const c={providerMatchId:'match001',leagueSlug:'idn.1',home:'Bali United',away:'PSM Makassar',homeProviderTeamId:'home0001',awayProviderTeamId:'away0001',kickoffUtc:'2026-10-01T08:30Z',scoreHome:2,scoreAway:0};
const manifest={schema:'ai-matchlab.archived-match-review-batch.v1',candidates:[c]};
const e={event_id_c:c.providerMatchId,sport_id:1,eventStageId:3,eventStageTypeId:3,common_feed:[{DA:3},{DB:3},{DC:Date.parse(c.kickoffUtc)/1000},{DE:'2'},{DF:'0'}],header:{country_name:'Indonesia',tournament:{link:'/football/indonesia/super-league/',tournament:'Super League'}},stats2_config:{tournament:'native01',tournamentStage:'native02'},participantsData:{home:[{id:c.homeProviderTeamId,name:c.home}],away:[{id:c.awayProviderTeamId,name:c.away}]}};
const html='window.environment = '+JSON.stringify(e)+';';
const prepare=options=>prepareArchivedMatchImport(manifest,{nowFn:()=>now,fetchFn:async()=>({ok:true,text:async()=>html}),...options});
function temporary(t){const base=path.resolve('work','import-transaction-tests');fs.mkdirSync(base,{recursive:true});const root=fs.mkdtempSync(path.join(base,'case-'));t.after(()=>{if(!path.resolve(root).startsWith(base+path.sep))throw Error('invalid_test_cleanup_scope');fs.rmSync(root,{recursive:true,force:true});});return root;}

test('one prepared batch includes canonical, final and the existing 180-day reader evidence',async()=>{
 const r=await prepare();assert.equal(r.batch.ok,true);assert.equal(r.batch.files.length,3);assert.equal(r.productionWrites,0);
 const doc=r.batch.files.find(f=>f.path.includes('value-data-acquisition/')).payload;assert.equal(doc.status,'RESULTS_AWAIT_IDENTITY_VALIDATION');assert.deepEqual(doc.rows,[c]);assert.equal(doc.acquiredAt,new Date(now).toISOString());
});
test('a source failure leaves the entire batch without applicable files',async()=>{
 const r=await prepare({fetchFn:async()=>({ok:false,status:503})});assert.equal(r.batch.ok,false);assert.deepEqual(r.batch.files,[]);assert.equal(r.productionWrites,0);
});
test('Tanzania is excluded before any network acquisition, with no exception',async()=>{
 let calls=0;const r=await prepareArchivedMatchImport({...manifest,candidates:[{...c,leagueSlug:'tan.1'}]},{fetchFn:async()=>{calls++;throw Error('must not fetch');}});assert.equal(calls,0);assert.equal(r.batch.ok,false);assert.equal(r.proposals[0].reason,'DISABLED_COMPETITION');
});
test('new files are written together while existing canonical metadata and fixtures survive unchanged',async t=>{
 const root=temporary(t),r=await prepare();const file=r.batch.files.find(f=>f.path.includes('canonical-fixtures/'));const target=path.join(root,file.path);
 const old={dayKey:'2026-10-01',leagueSlug:'idn.1',customEvidence:'retained',fixtures:[{canonicalId:'cid_existing',status:'FT',scoreHome:1,scoreAway:0}]};writeHistoryJsonAtomic(target,old);
 const result=applyPreparedArchivedImport(r,{root});assert.equal(result.writtenPaths.length,3);
 const after=JSON.parse(fs.readFileSync(target,'utf8'));assert.equal(after.customEvidence,'retained');assert.deepEqual(after.fixtures[0],old.fixtures[0]);assert.equal(after.fixtures.length,2);assert.equal(result.existingPredictionsChanged,false);
});
test('an existing final blocks every write before any canonical file is created',async t=>{
 const root=temporary(t),r=await prepare(),file=r.batch.files.find(f=>f.path.includes('final-results/'));writeHistoryJsonAtomic(path.join(root,file.path),{existing:'untouched'});
 assert.throws(()=>applyPreparedArchivedImport(r,{root}),/EXISTING_TRUTH_CONFLICT/);assert.equal(fs.existsSync(path.join(root,'data/canonical-fixtures')),false);assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root,file.path),'utf8')),{existing:'untouched'});
});
test('a mid-batch write error restores original bytes and removes newly created truth',async t=>{
 const root=temporary(t),r=await prepare(),canonical=r.batch.files.find(f=>f.path.includes('canonical-fixtures/'));
 writeHistoryJsonAtomic(path.join(root,canonical.path),{fixtures:[{canonicalId:'cid_existing'}],metadata:'retained'});const original=fs.readFileSync(path.join(root,canonical.path));
 let writes=0;assert.throws(()=>applyPreparedArchivedImport(r,{root,writeFn:(file,payload)=>{writeHistoryJsonAtomic(file,payload);if(++writes===3)throw Error('simulated disk failure');}}),/simulated disk failure/);
 assert.deepEqual(fs.readFileSync(path.join(root,canonical.path)),original);
 for(const file of r.batch.files.filter(f=>f!==canonical))assert.equal(fs.existsSync(path.join(root,file.path)),false);
});
test('a write outside the exact data allowlist is rejected with no file writes',async t=>{
 const root=temporary(t),r=await prepare();r.batch.files.push({path:'data/value-unified/2026-10-22/public-plan.json',payload:{},mode:'CREATE_ONLY_AFTER_REVIEW'});assert.throws(()=>applyPreparedArchivedImport(r,{root}),/WRITE_SCOPE_INVALID/);assert.equal(fs.existsSync(path.join(root,'data')),false);
});
test('the existing workflow retains the common queue and blocks downstream publication on failed import',()=>{
 const file=new URL('../../.github/workflows/value-data-alarm.yml',import.meta.url),source=fs.readFileSync(file,'utf8');
 assert.match(source,/group: ai-matchlab-data-writer\s+queue: max\s+cancel-in-progress: false/);
 assert.equal((source.match(/steps\.archived-import\.outcome != 'failure'/g)||[]).length,2);
 assert.match(source,/name: Verify Value input and publication regression guards\s+id: regression-guards/);
 const recoverySteps=source.split(/\r?\n      - /).filter(step=>/name: (Repair verified derived inputs|Publish the prospective unified plan)/.test(step));
 assert.equal(recoverySteps.length,2);
 for(const step of recoverySteps)assert.match(step,/if:.*always\(\).*steps\.regression-guards\.outcome == 'success'/);
 assert.match(source,/if: inputs\.apply && inputs\.archivedImportManifest != ''/);
});
