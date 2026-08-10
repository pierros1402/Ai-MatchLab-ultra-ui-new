import test from 'node:test';
import assert from 'node:assert/strict';
import { buildResultsSemanticRepairPlan } from './repair-results-memory-semantic-integrity.js';

test('plan separates same-truth duplicate and mirror conflict actions', () => {
  const plan = buildResultsSemanticRepairPlan({ reports: [{
    slug: 'x.1',
    semantic: { examples: { semanticDuplicates: [{ pair: 'x|a|b', score: '2|1', rows: [{id:'cid_x'},{id:'native'}] }] } },
    examples: { mirrorConflicts: [{ matchId: 'm1' }] }
  }]});
  assert.equal(plan.actions.length, 2);
  assert.deepEqual(plan.actions.map(x => x.type).sort(), ['mirror_conflict','same_truth_semantic_dedup']);
});
