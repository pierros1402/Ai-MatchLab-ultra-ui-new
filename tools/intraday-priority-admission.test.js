import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const source = fs.readFileSync(new URL('../.github/workflows/intraday-deploy-snapshot-refresh.yml', import.meta.url), 'utf8');
const loop = source.match(/for WORKFLOW in ([^;]+); do/);
assert.ok(loop, 'workflow-priority loop exists');
assert.deepEqual(loop[1].split(/\s+/), [
  'daily-deploy-snapshot.yml',
  'daily-autonomous.yml',
  'value-data-alarm.yml',
  'value-data-recovery.yml'
]);

const validator = source.match(/COUNT="\$\(python3 -c '([^']+)' "\$RESPONSE_FILE" 2>\/dev\/null \|\| true\)"/);
assert.ok(validator, 'the executable workflow counter is present');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'intraday-admission-'));
function count(payload) {
  const file = path.join(tmp, 'payload.json');
  fs.writeFileSync(file, JSON.stringify(payload));
  const run = spawnSync('python3', ['-c', validator[1], file], { encoding: 'utf8' });
  assert.equal(run.error, undefined);
  return { code: run.status, output: run.stdout.trim() };
}
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));

test('pending maintenance or daily must deny intraday admission', () => {
  for (const status of ['queued', 'pending', 'waiting', 'in_progress', 'requested']) {
    assert.deepEqual(count({ workflow_runs: [{ status }] }), { code: 0, output: '1' });
  }
});
test('completed workflow does not occupy priority writer lane', () => {
  assert.deepEqual(count({ workflow_runs: [{ status: 'completed' }] }), { code: 0, output: '0' });
  assert.deepEqual(count({ workflow_runs: [{ status: 'completed' }, { status: 'pending' }] }), { code: 0, output: '1' });
});
test('malformed API payloads fail closed', () => {
  for (const payload of [{}, [], { workflow_runs: null }, { workflow_runs: {} }, { workflow_runs: [null] }, { workflow_runs: [{}] }, { workflow_runs: [{ status: '' }] }, { workflow_runs: [{ status: 2 }] }]) {
    assert.notEqual(count(payload).code, 0);
  }
});
test('valid empty list means no higher-priority writers', () => {
  assert.deepEqual(count({ workflow_runs: [] }), { code: 0, output: '0' });
});
