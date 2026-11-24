import test from 'node:test';
import assert from 'node:assert/strict';
import { publicParityVerdict } from './check-historical-public-snapshot-parity.mjs';

const date = '2026-11-23';
const hash = 'a'.repeat(64);
const manifest = { ok: true, date, hash };
const response = (status, release = null) => ({ status, ok: status === 200, json: async () => release });

test('exact manifest parity is verified', async () => {
  assert.equal(await publicParityVerdict(date, manifest, async () =>
    response(200, { ok: true, date, manifest: { hash } })), 'VERIFIED');
});
test('stale public manifest requires guarded reconciliation', async () => {
  assert.equal(await publicParityVerdict(date, manifest, async () =>
    response(200, { ok: true, date, manifest: { hash: 'b'.repeat(64) } })), 'SYNC_REQUIRED');
});
test('missing historical public mirror requires sync', async () => {
  assert.equal(await publicParityVerdict(date, manifest, async () => response(404)), 'SYNC_REQUIRED');
});
test('public day mismatch fails parity', async () => {
  assert.equal(await publicParityVerdict(date, manifest, async () =>
    response(200, { ok: true, date: '2026-11-24', manifest: { hash } })), 'SYNC_REQUIRED');
});
test('unavailable public authority fails closed rather than claiming health', async () => {
  await assert.rejects(publicParityVerdict(date, manifest, async () => response(503)));
  await assert.rejects(publicParityVerdict(date, { ...manifest, hash: 'invalid' },
    async () => response(200, { ok: true, date, manifest: { hash } })));
});
