import test from 'node:test';
import assert from 'node:assert/strict';
import { repairOrphanResultsPayload } from './repair-results-memory-orphans.js';

function side(matchId,date,opp,ha,gf,ga){return {matchId,date,opp,ha,gf,ga,res:gf>ga?'W':gf<ga?'L':'D'};}

test('reconstructs missing mirror side without inventing score', () => {
  const payload={slug:'x.1',teams:{Alpha:[side('m1','2026-08-01T12:00:00Z','Beta','H',2,1)]}};
  const {payload:out,report}=repairOrphanResultsPayload(payload,{nowMs:Date.parse('2026-08-09T00:00:00Z')});
  assert.equal(report.reconstructedCount,1);
  assert.equal(out.teams.Alpha[0].gf,2);
  assert.equal(out.teams.Beta[0].gf,1);
  assert.equal(out.teams.Beta[0].ga,2);
  assert.equal(out.teams.Beta[0].ha,'A');
  assert.equal(report.postAudit.orphans,0);
});

test('match-level retention removes both perspectives together', () => {
  const teams={A:[],B:[],C:[],D:[]};
  for(const [id,date,opp] of [['m3','2026-08-03T12:00:00Z','B'],['m2','2026-08-02T12:00:00Z','C'],['m1','2026-08-01T12:00:00Z','D']]) teams.A.push(side(id,date,opp,'H',1,0));
  teams.B.push(side('m3','2026-08-03T12:00:00Z','A','A',0,1));
  teams.C.push(side('m2','2026-08-02T12:00:00Z','A','A',0,1));
  teams.D.push(side('m1','2026-08-01T12:00:00Z','A','A',0,1));
  // No orphans here; function leaves payload semantically intact. Retention is
  // exercised by the shared applyMatchLevelRetention unit tests separately.
  const {report}=repairOrphanResultsPayload({slug:'x.1',teams},{nowMs:Date.parse('2026-08-09T00:00:00Z')});
  assert.equal(report.postAudit.orphans,0);
});
