import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {validateHistoryIndexFoundationSync} from '../core/derived-history-foundation.js';

const root=new URL('../../',import.meta.url);
const read=p=>JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));
test('reconciled history and form indexes retain exact canonical/verified score parity and recovery records',()=>{
 const auditRoot='data/history-resolutions/2026-11-01/';
 const first=read(auditRoot+'cid_gab1_vautour_libreville_20260704.json');
 const second=read(auditRoot+'verified-final-score-reconciliation.json');
 const corrections=[first,...second.corrections];
 assert.equal(corrections.length,2);
 const history=read('data/history/2025-2026.json');
 const form=read('data/history-index/team-form/2025-2026.json');
 for(const correction of corrections){
  const id=correction.matchId;
  const rows=history.days.flatMap(d=>d.rows||[]).filter(r=>r.id===id);
  assert.equal(rows.length,1,'reconciliation cannot duplicate or remove a fixture');
  assert.deepEqual(rows[0],correction.replacementRow);
  assert.equal(correction.originalRow.id,id);
  const canonical=read(correction.canonicalPath).fixtures.find(r=>r.canonicalId===id);
  const final=read(correction.finalPath);
  for(const key of ['scoreHome','scoreAway','homeTeam','awayTeam','leagueSlug']){
   assert.equal(rows[0][key],canonical[key]);assert.equal(rows[0][key],final[key]);
  }
  assert.equal(rows[0].truthContract.exactScoreParity,true);
  for(const team of [rows[0].homeTeam,rows[0].awayTeam]){
   const indexed=form[team].matches.filter(r=>r.id===id);
   assert.equal(indexed.length,1);
   assert.equal(indexed[0].scoreHome,rows[0].scoreHome);
   assert.equal(indexed[0].scoreAway,rows[0].scoreAway);
  }
 }
 assert.equal(second.rejected.length,3,'unresolved canonical/final disagreements remain outside this correction');
 assert.equal(validateHistoryIndexFoundationSync('2025-2026').ok,true);
});
