import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildSuppressedFinalAliasRepairPlan, applySuppressedFinalAliasRepair } from './reconcile-suppressed-final-result-aliases.js';

function write(p,v){fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,JSON.stringify(v,null,2));}
function setup({aliasScore=[1,4],targetScore=[1,4],withAdj=false}={}){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'aiml-final-alias-'));
 const finals=path.join(root,'final-results'); const retention=path.join(root,'retention.json'); const adj=path.join(root,'adj.json');
 write(retention,{decisions:[{dayKey:'2026-07-29',retainedRepositoryFixtureId:'retained',fixtureRetentionDecisionId:'d1',suppressedFixtureLineageAliases:[{aliasFixtureId:'alias',targetFixtureId:'retained'}]}]});
 write(path.join(finals,'2026-07-29','alias.json'),{matchId:'alias',scoreHome:aliasScore[0],scoreAway:aliasScore[1]});
 write(path.join(finals,'2026-07-29','retained.json'),{matchId:'retained',scoreHome:targetScore[0],scoreAway:targetScore[1]});
 write(adj,{adjudications:withAdj?[{matchId:'retained',homeScore:targetScore[0],awayScore:targetScore[1]}]:[]});
 return {root,finals,retention,adj};
}
test('same-truth suppressed alias is repairable and quarantined',()=>{const s=setup();const plan=buildSuppressedFinalAliasRepairPlan({finalRoot:s.finals,retentionPath:s.retention,adjudicationPath:s.adj});assert.equal(plan.ok,true);assert.equal(plan.actions[0].reason,'SAME_TRUTH_SUPPRESSED_ALIAS');const q=path.join(s.root,'q');applySuppressedFinalAliasRepair(plan,{write:true,quarantineRoot:q});assert.equal(fs.existsSync(path.join(s.finals,'2026-07-29','alias.json')),false);assert.equal(fs.existsSync(path.join(q,'2026-07-29','alias.json')),true);});
test('score-conflicting alias requires adjudicated retained truth',()=>{const s=setup({aliasScore:[1,5],targetScore:[1,4]});const plan=buildSuppressedFinalAliasRepairPlan({finalRoot:s.finals,retentionPath:s.retention,adjudicationPath:s.adj});assert.equal(plan.ok,false);assert.equal(plan.blocked[0].reason,'SUPPRESSED_SCORE_CONFLICT_WITHOUT_MATCHING_ADJUDICATION');});
test('score-conflicting alias is repairable when retained score is adjudicated',()=>{const s=setup({aliasScore:[1,5],targetScore:[1,4],withAdj:true});const plan=buildSuppressedFinalAliasRepairPlan({finalRoot:s.finals,retentionPath:s.retention,adjudicationPath:s.adj});assert.equal(plan.ok,true);assert.equal(plan.actions[0].reason,'SUPPRESSED_ALIAS_CONFLICTS_WITH_ADJUDICATED_RETAINED_TRUTH');});
