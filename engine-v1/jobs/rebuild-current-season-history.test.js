import test from 'node:test';
import assert from 'node:assert/strict';
import {preservedDayBucket,normalizeEvent} from './rebuild-current-season-history.js';
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
