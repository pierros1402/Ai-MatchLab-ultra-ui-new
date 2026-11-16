// Explicit review tool, never run by the test suite. Updating the snapshot also
// requires reviewing the pinned digest and expected counts in the test.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {getProjectRoot} from '../../engine-v1/storage/data-root.js';
import {canonicalFixturesForDay} from '../../engine-v1/core/day-fixture-universe.js';
import {getProductionIdentityResolver} from '../../engine-v1/core/production-identity-resolver-runtime.js';
import {buildVerifiedHistoryDay} from '../../engine-v1/jobs/append-finalized-day-to-history.js';

const root=getProjectRoot(), dayKey='2026-07-31';
const hash=b=>createHash('sha256').update(b).digest('hex');
const finalDir=path.join(root,'data/final-results',dayKey);
const finalFiles=fs.readdirSync(finalDir).filter(n=>n.endsWith('.json')).sort();
const canonicalRows=canonicalFixturesForDay(dayKey);
const finalResultRows=finalFiles.map(n=>JSON.parse(fs.readFileSync(path.join(finalDir,n))));
const sourcePaths=[...fs.readdirSync(path.join(root,'data/canonical-fixtures',dayKey)).filter(n=>n.endsWith('.json')).sort().map(n=>`data/canonical-fixtures/${dayKey}/${n}`),
  ...finalFiles.map(n=>`data/final-results/${dayKey}/${n}`)];
const resolver=getProductionIdentityResolver(), identities={};
const identityResolver={resolveTeamReference(ref){
  const key=JSON.stringify([ref.leagueSlug,ref.alias]);
  return identities[key]??=resolver.resolveTeamReference(ref);
}};
const input={dayKey,canonicalRows,finalResultRows,rebuiltAt:0};
const build=buildVerifiedHistoryDay({...input,identityResolver});
assert.equal(build.acceptedRows,60);
assert.equal(build.errors.length,42);
assert.ok(build.errors.every(e=>e.reason==='verified_final_missing_canonical_fixture'));
const evidence={schema:'ai-matchlab.history-parity-test-evidence.v1',
  checkpoint:'AIML_HISTORY_REMAINING_RESULT_20261116-073225.zip',
  provenance:sourcePaths.map(p=>({path:p,sha256:hash(fs.readFileSync(path.join(root,p)))})),
  input,identities,expected:{rows:build.rows,errors:build.errors}};
const target=path.join(root,'engine-v1/tests/fixtures/july-2026-parity-evidence.json');
fs.mkdirSync(path.dirname(target),{recursive:true});
const bytes=JSON.stringify(evidence,null,2)+'\n';
fs.writeFileSync(target,bytes);
console.log(JSON.stringify({target,sha256:hash(bytes),bytes:Buffer.byteLength(bytes),accepted:build.acceptedRows,rejected:build.errors.length}));
