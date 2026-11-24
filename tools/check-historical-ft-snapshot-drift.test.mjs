import test from 'node:test';
import assert from 'node:assert/strict';
import { precedingDay, findVerifiedFinalDrift } from './check-historical-ft-snapshot-drift.mjs';

const day = '2026-11-23';
const id = 'cid_par1_2mayo_sportivosanlorenzo_20261123';
const truth = { verifiedFinalTruth: true, dayKey: day, matchId: id,
  verification: { verdict: 'verified_final_result' }, scoreHome: 1, scoreAway: 1 };
const fixture = { canonicalId: id, status: 'HALF_TIME', scoreHome: 0, scoreAway: 0 };
const snap = row => ({ ok: true, date: day, fixtures: [row] });

test('Athens day rollover uses calendar dates, not local server timezone', () => {
  assert.equal(precedingDay('2026-11-24', 1), day);
  assert.equal(precedingDay('2026-03-01', 1), '2026-02-28');
  assert.throws(() => precedingDay('2026-02-30', 1));
});
test('verified FT mismatching LIVE snapshot is detected', () => {
  assert.deepEqual(findVerifiedFinalDrift(day, [truth], snap(fixture)), [id]);
});
test('matching FT snapshot is clean and does not dispatch', () => {
  assert.deepEqual(findVerifiedFinalDrift(day, [truth],
    snap({ ...fixture, status: 'FT', scoreHome: 1, scoreAway: 1 })), []);
});
test('wrong terminal score is detected', () => {
  assert.deepEqual(findVerifiedFinalDrift(day, [truth],
    snap({ ...fixture, status: 'FT', scoreHome: 2, scoreAway: 1 })), [id]);
});
test('no speculative fixture insertion and no unverified score promotion', () => {
  assert.deepEqual(findVerifiedFinalDrift(day, [truth], snap({ canonicalId: 'other', status: 'FT' })), []);
  assert.deepEqual(findVerifiedFinalDrift(day, [{ ...truth, verifiedFinalTruth: false }], snap(fixture)), []);
  assert.deepEqual(findVerifiedFinalDrift(day, [{ ...truth, verification: { verdict: 'pending' } }], snap(fixture)), []);
});
test('malformed or duplicate snapshot identity fails closed', () => {
  assert.throws(() => findVerifiedFinalDrift(day, [truth], { ok: true, date: day, fixtures: [fixture, fixture] }));
  assert.throws(() => findVerifiedFinalDrift(day, [truth], { ok: false, date: day, fixtures: [] }));
});
