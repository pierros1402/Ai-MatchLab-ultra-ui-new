import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { comparisonAvailable } from './value-comparison-availability.mjs';

test('immutable history distinguishes missing comparison from invalid existing data and invalid refs', () => {
  const cwd = mkdtempSync(path.join(tmpdir(), 'comparison-availability-'));
  const git = args => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  try {
    git(['init']);
    const dir = path.join(cwd, 'data/value-comparison');
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, '2026-11-01.json'), JSON.stringify({ ok: true, date: '2026-11-01' }));
    writeFileSync(path.join(dir, '2026-10-29.json'), '{');
    writeFileSync(path.join(dir, '2026-10-28.json'), JSON.stringify({ ok: true, date: '2026-10-27' }));
    git(['add', '.']);
    git(['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-m', 'test']);
    const ref = git(['rev-parse', 'HEAD']);
    assert.equal(comparisonAvailable('2026-11-01', ref, { cwd }), true);
    assert.equal(comparisonAvailable('2026-10-31', ref, { cwd }), false);
    // Uncommitted files cannot authorize publication at the pinned release.
    writeFileSync(path.join(dir, '2026-10-31.json'), JSON.stringify({ ok: true, date: '2026-10-31' }));
    assert.equal(comparisonAvailable('2026-10-31', ref, { cwd }), false);
    assert.throws(() => comparisonAvailable('2026-10-29', ref, { cwd }));
    assert.throws(() => comparisonAvailable('2026-10-28', ref, { cwd }));
    assert.throws(() => comparisonAvailable('2026-10-31', '0'.repeat(40), { cwd }));
    assert.throws(() => comparisonAvailable('2026-10-31', 'main', { cwd }));
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});
