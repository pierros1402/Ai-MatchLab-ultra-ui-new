import test from 'node:test';
import assert from 'node:assert/strict';
import {preservedDayBucket,normalizeEvent,historyAdmissionConflicts} from './rebuild-current-season-history.js';
test('existing rows survive empty or failed acquisition',()=>{
 const existing={rows:[{id:'123',scoreHome:2,scoreAway:1}]};
 const bucket=preservedDayBucket('2026-11-25',existing);
 assert.deepEqual(bucket.rows,existing.rows);
 bucket.rows.push({id:'456'});
 assert.equal(existing.rows.length,1);
});
test('missing score is not converted to zero',()=>{
 const event={id:'123',date:'2026-11-25T12:00:00Z',status:{type:{name:'STATUS_FULL_TIME'}},competitions:[{competitors:[{homeAway:'home',team:{displayName:'Home'}},{homeAway:'away',score:'0',team:{displayName:'Away'}}]}]};
 assert.equal(normalizeEvent(event,'ind.2','2026-11-25'),null);
});

test('provider identity overlap is held, with score and orientation conflicts distinguished',()=>{
 const row={id:'cid_example',leagueSlug:'test.1',homeTeam:'Alpha',awayTeam:'Beta',kickoff_ms:Date.parse('2026-11-25T23:00:00Z'),kickoff:'2026-11-25T23:00:00Z',scoreHome:2,scoreAway:1};
 const provider={...row,id:'sofa_example'};
 assert.ok(historyAdmissionConflicts(provider,[row])[0].reasons.includes('duplicateGroups'));
 assert.ok(historyAdmissionConflicts({...provider,scoreHome:3},[row])[0].reasons.includes('scoreConflictGroups'));
 assert.ok(historyAdmissionConflicts({...provider,homeTeam:'Beta',awayTeam:'Alpha'},[row])[0].reasons.includes('flippedOrientationGroups'));
 assert.deepEqual(historyAdmissionConflicts({...provider,kickoff_ms:row.kickoff_ms+86400000},[row]),[]);
 assert.deepEqual(historyAdmissionConflicts({...provider,leagueSlug:'test.2'},[row]),[]);
});
