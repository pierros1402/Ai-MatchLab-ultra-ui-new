// Read-only investigation of the reviewed before/after recovery reports.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {getProjectRoot} from '../../engine-v1/storage/data-root.js';
import {buildHistoryDayFromTruth} from '../../engine-v1/jobs/append-finalized-day-to-history.js';

const [beforeFile,checkpointDir,outputFile]=process.argv.slice(2);
if(!beforeFile||!checkpointDir||!outputFile)throw Error('BEFORE_CHECKPOINT_OUTPUT_REQUIRED');
const root=getProjectRoot(), hash=b=>createHash('sha256').update(b).digest('hex');
const read=p=>JSON.parse(fs.readFileSync(p));
const afterFile=path.join(checkpointDir,'coverage-after.json');
const before=read(beforeFile),after=read(afterFile);
const prepared=read(path.join(checkpointDir,'canonical-restoration/prepared-canonical-restoration.json'));
const plans=read(path.join(checkpointDir,'targeted-history/targeted-history-plans.json'));
const key=g=>JSON.stringify(Object.fromEntries(Object.entries(g).sort(([a],[b])=>a.localeCompare(b))));
const oldKeys=new Set(before.gaps.map(key)),newKeys=new Set(after.gaps.map(key));
assert.equal(oldKeys.size,before.gaps.length,'duplicate before gaps');
assert.equal(newKeys.size,after.gaps.length,'duplicate after gaps');
const added=after.gaps.filter(g=>!oldKeys.has(key(g))),removed=before.gaps.filter(g=>!newKeys.has(key(g)));
assert.equal(added.length,45);assert.equal(removed.length,1);
const archives=r=>r.provenance.filter(p=>p.path.startsWith('data/history-archive/')).sort((a,b)=>a.path.localeCompare(b.path));
assert.deepEqual(archives(after),archives(before),'archive path/bytes/hash must be identical');
assert.equal(before.metrics.archiveRows,218193);assert.equal(after.metrics.archiveRows,218193);
const currentSeasons=new Map(after.seasons.map(s=>[s,read(path.join(root,'data/history',s+'.json'))]));
const history=[...currentSeasons.values()].flatMap(d=>d.days.flatMap(d=>d.rows));
const builds=new Map();
const getBuild=d=>{if(!builds.has(d))builds.set(d,buildHistoryDayFromTruth(d));return builds.get(d);};
const witness=(p,expected)=>{assert.equal(hash(fs.readFileSync(path.join(root,p))),expected,'evidence changed: '+p);return {path:p,sha256:expected};};
const entries=added.map(g=>{
 assert.equal(g.reason,'VERIFIED_CANONICAL_RESULT_NOT_IN_HISTORY');
 const restored=prepared.accepted.find(r=>r.id===g.id);assert.ok(restored,'must be a newly restored canonical');
 const priorDay=before.truthDays.find(d=>d.dayKey===g.dayKey),nextDay=after.truthDays.find(d=>d.dayKey===g.dayKey);
 assert.ok(priorDay.errors.some(e=>e.matchId===g.id&&e.reason==='verified_final_missing_canonical_fixture'));
 assert.ok(!nextDay.errors.some(e=>e.matchId===g.id));
 const current=getBuild(g.dayKey).rows.find(r=>r.id===g.id);assert.ok(current,'current parity must still accept gap');
 const {rebuiltAt,...acceptedFact}=current;
 assert.ok(!history.some(r=>r.id===g.id),'gap unexpectedly already stored');
 const group=plans.held.find(h=>h.dayKey===g.dayKey&&h.slug===g.slug);assert.ok(group,'unexplained gap');
 const direct=group.held.filter(h=>h.id===g.id);
 const blockedBy=direct.length?direct:group.held;
 for(const h of blockedBy)assert.ok(history.some(r=>r.id===h.existingId)||plans.held.some(x=>x.held.some(y=>y.id===h.existingId)),'missing collision witness');
 return {...g,classification:direct.length?'DIRECT_IDENTITY_HOLD':'ATOMIC_GROUP_HOLD',
   cause:'RESTORED_CANONICAL_NOW_PASSES_TRUTH_BUT_HISTORY_ADDITION_REMAINS_HELD',
   groupReason:group.reason,blockedBy,acceptedFact,
   evidence:[witness(restored.finalPath,restored.finalSha256),witness(restored.archivePath,restored.archiveSha256)],
   canonicalPath:restored.relative};
});
const resolved=removed.map(g=>{
 const addedFact=plans.builds.flatMap(b=>b.rows).find(r=>r.id===g.id);assert.ok(addedFact,'resolved ID must be in the 97 additions');
 const stored=history.find(r=>r.id===g.id);assert.ok(stored);
 assert.deepEqual(stored,addedFact,'resolved fact must equal journaled addition');
 return {...g,classification:'ADDED_TO_HISTORY_IN_PRIOR_RUN',fact:stored};
});
const counts=entries.reduce((a,e)=>(a[e.classification]=(a[e.classification]||0)+1,a),{});
const report={schema:'aiml.restoration-coverage-delta-evidence.v1',
 inputs:[beforeFile,afterFile].map(p=>({file:path.basename(p),sha256:hash(fs.readFileSync(p))})),
 metricsBefore:before.metrics,metricsAfter:after.metrics,
 archiveFilesByteIdentical:archives(after).length,archiveRowsUnchanged:218193,
 gapEquation:`${before.gaps.length} + ${added.length} - ${removed.length} = ${after.gaps.length}`,
 counts,added:entries,resolved,fullCoverageCertified:false,historyWritten:false,canonicalRestorationRepeated:false};
fs.mkdirSync(path.dirname(outputFile),{recursive:true});fs.writeFileSync(outputFile,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({counts,archiveFilesByteIdentical:report.archiveFilesByteIdentical,gapEquation:report.gapEquation,resolved:resolved.map(r=>r.id)}));
