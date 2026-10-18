import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePrimaryCompetitionCount,acquirePrimaryCompetitionCount} from './primary-competition-count.js';
const base={slug:'eng.1',season:'2026-2027',url:'https://www.premierleague.com/en/clubs',retrievedAt:'2026-10-18T10:00Z'};
test('only current-season primary text certifies team count, never other format scopes',()=>{
 const proof=parsePrimaryCompetitionCount({...base,html:'<h1>All 20 clubs for 2026/27</h1>'});assert.equal(proof.count,20);assert.equal(proof.otherScopesVerified,false);
 for(const html of ['<h1>20 clubs 2025/26</h1>','<script>20 clubs 2026/27</script>','<h1>2026/27</h1><p>20 clubs 2025/26</p>','<h1>20 clubs 2026/27</h1><p>22 teams 2026/27</p>'])assert.throws(()=>parsePrimaryCompetitionCount({...base,html}));
 assert.throws(()=>parsePrimaryCompetitionCount({...base,url:'https://evil.test',html:'<h1>20 clubs 2026/27</h1>'}),/domain_invalid/);
});
test('LALIGA requires a current-season heading and distinct official club links',()=>{
 const clubs=Array.from({length:20},(_,i)=>`<a href="/en-DE/clubs/club-${i}/squad">Club</a>`).join('');
 const proof=parsePrimaryCompetitionCount({slug:'esp.1',season:base.season,url:'https://www.laliga.com/en-DE/laliga-easports/clubs',html:'<h1>Teams 2026/27</h1>'+clubs+clubs});assert.equal(proof.count,20);
});
test('expired source is rediscovered within the reviewed domain without following redirects or arbitrary results',async()=>{
 const urls=[];const r=await acquirePrimaryCompetitionCount('eng.1','2027-2028',{searchFn:async()=>[{url:'https://evil.test'},{url:base.url}],fetchFn:async(url,opts)=>{urls.push(url);assert.equal(opts.redirect,'error');return {ok:true,text:async()=>url===base.url?'<h1>All 20 clubs 2027/28</h1>':'<h1>All 20 clubs 2026/27</h1>'};}});
 assert.equal(r.status,'VERIFIED');assert.equal(urls.length,2);assert.equal(r.proof.season,'2027-2028');
});
