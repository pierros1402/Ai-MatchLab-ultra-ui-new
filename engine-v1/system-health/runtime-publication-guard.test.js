import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import {
  beginPublication, finishPublication, readPublicationGuard,
  publicationGuardFile, isPublicationProtectedRequest, acquirePublicationReadLease, publicationReadLeaseDir, waitForPublicationReadersToDrain
} from './runtime-publication-guard.js';

async function sandbox(fn) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aiml-v35e-'));
  try { await fn(root); } finally { await fs.rm(root, { recursive: true, force: true }); }
}

const args = {day:'2026-11-11', ref:'a'.repeat(40), manifestHash:'b'.repeat(64), mode:'snapshot'};

test('snapshot publication begins exclusive and HOLD is observed', async () => sandbox(async root => {
  const ticket = await beginPublication(root, args);
  assert.equal(readPublicationGuard(root).pending, true);
  assert.equal(readPublicationGuard(root).day, args.day);
  await finishPublication(root, ticket);
  assert.deepEqual(readPublicationGuard(root), {pending:false});
}));

test('second writer is denied and cannot unlock first writer', async () => sandbox(async root => {
  const a = await beginPublication(root, args);
  await assert.rejects(beginPublication(root, {...args, mode:'settlement'}), /publication_guard_existing_hold/);
  await assert.rejects(finishPublication(root, {...a, token:'00000000-0000-0000-0000-000000000000'}), /ticket_mismatch/);
  assert.equal(readPublicationGuard(root).pending, true);
  await finishPublication(root, a);
}));

test('failed publication retains journal and blocks retry', async () => sandbox(async root => {
  await beginPublication(root, args);
  assert.equal(readPublicationGuard(root).pending, true);
  await assert.rejects(beginPublication(root, args), /existing_hold/);
}));

test('malformed or truncated marker is HOLD', async () => sandbox(async root => {
  const f=publicationGuardFile(root);
  await fs.mkdir(path.dirname(f), {recursive:true});
  await fs.writeFile(f, '{broken');
  assert.equal(readPublicationGuard(root).reason, 'publication_guard_unreadable');
}));

test('invalid schema is HOLD', async () => sandbox(async root => {
  const f=publicationGuardFile(root);
  await fs.mkdir(path.dirname(f), {recursive:true});
  await fs.writeFile(f, '{}');
  assert.equal(readPublicationGuard(root).reason, 'publication_guard_invalid');
}));

test('settlement-only sync uses same exclusive publication guard', async () => sandbox(async root => {
  const ticket=await beginPublication(root,{...args, mode:'settlement'});
  assert.equal(readPublicationGuard(root).mode,'settlement');
  await finishPublication(root,ticket);
}));

test('unrelated health and control endpoints remain available', () => {
  assert.equal(isPublicationProtectedRequest('GET','/health'),false);
  assert.equal(isPublicationProtectedRequest('GET','/ops/sync-snapshot/status'),false);
  assert.equal(isPublicationProtectedRequest('POST','/ops/sync-snapshot'),false);
  assert.equal(isPublicationProtectedRequest('OPTIONS','/release'),false);
  assert.equal(isPublicationProtectedRequest('HEAD','/health'),false);
});

test('public snapshot, health and Value GET endpoints are held during publication', () => {
  for(const p of ['/release','/ready','/deploy-snapshot','/deploy-snapshot/latest',
    '/system-health','/system-health-alerts','/value-comparison','/value-picks',
    '/value-export/range','/assessment-export/range','/fixtures-runtime','/match','/odds','/api/odds']) {
    assert.equal(isPublicationProtectedRequest('GET',p),true,p);
  }
});

test('invalid day/mode rejected before marker creation', async () => sandbox(async root => {
  await assert.rejects(beginPublication(root,{...args,day:'yesterday'}),/day_invalid/);
  await assert.rejects(beginPublication(root,{...args,mode:'random'}),/mode_invalid/);
  assert.deepEqual(readPublicationGuard(root),{pending:false});
}));

test('actual production writer and server contain guard at mutation/read boundary', async () => {
  const writer=await fs.readFile(new URL('../jobs/sync-deploy-snapshot-from-github.js',import.meta.url),'utf8');
  const index=await fs.readFile(new URL('../index.js',import.meta.url),'utf8');
  const a=writer.indexOf('const publication = await beginPublication(resolveDataPath(), {');
  const b=writer.indexOf('await promoteDirectory(stageDayDir, targetDayDir, backupDir);');
  const c=writer.indexOf('await updateRuntimeSyncState({ day, ref, manifest, latestPromoted, stats });');
  const d=writer.indexOf('await finishPublication(resolveDataPath(), publication);',c);
  assert.ok(a>=0 && a<b && b<c && c<d);
  assert.ok(index.includes('app.use((req, res, next) => {\n  if (!isPublicationProtectedRequest'));
  assert.ok(index.indexOf('runtime_publication_guard_active') < index.indexOf('app.get("/deploy-snapshot/latest"'));
});


test('all declared Engine GET data routes and their HEAD equivalents fail closed', async () => {
  const index = await fs.readFile(new URL('../index.js', import.meta.url), 'utf8');
  const paths = [...index.matchAll(/app\.get\(\s*\"([^\"]+)\"/g)].map(x => x[1]);
  assert.ok(paths.length >= 30, `unexpected Engine route inventory: ${paths.length}`);
  const excluded = paths.filter(p => p === '/health' || p.startsWith('/ops/'));
  const protectedRoutes = paths.filter(p => !excluded.includes(p));
  assert.ok(protectedRoutes.includes('/plan-c-shadow'));
  assert.ok(protectedRoutes.includes('/api/matches-for-date'));
  assert.ok(protectedRoutes.includes('/match-intelligence'));
  assert.ok(protectedRoutes.includes('/details'));
  for (const route of protectedRoutes) {
    assert.equal(isPublicationProtectedRequest('GET', route), true, `GET ${route}`);
    assert.equal(isPublicationProtectedRequest('HEAD', route), true, `HEAD ${route}`);
  }
  for (const route of excluded) {
    assert.equal(isPublicationProtectedRequest('GET', route), false, `diagnostic ${route}`);
  }
});

test('new and unknown public paths are not silently exempted from publication HOLD', () => {
  for (const p of ['/new-public-data-endpoint', '/api/updated-route', '/plan-c-shadow', '/debug/deploy-snapshot']) {
    assert.equal(isPublicationProtectedRequest('GET', p), true, p);
    assert.equal(isPublicationProtectedRequest('HEAD', p), true, p);
  }
  assert.equal(isPublicationProtectedRequest('POST', '/ops/sync-snapshot'), false);
});


test('read lease blocks writer until a running reader completes', async () => sandbox(async root => {
  const release = acquirePublicationReadLease(root);
  const ticket = await beginPublication(root, args);
  await assert.rejects(waitForPublicationReadersToDrain(root, {timeoutMs:20, pollMs:2}), /not_drained/);
  release(); release();
  await waitForPublicationReadersToDrain(root, {timeoutMs:200, pollMs:2});
  await finishPublication(root, ticket);
}));

test('a request arriving after writer marker cannot obtain lease', async () => sandbox(async root => {
  const ticket = await beginPublication(root, args);
  assert.throws(() => acquirePublicationReadLease(root), /publication_read_guard_active/);
  await waitForPublicationReadersToDrain(root);
  await finishPublication(root, ticket);
}));

test('orphan lease retains HOLD and prevents data mutation', async () => sandbox(async root => {
  const leaseDir = publicationReadLeaseDir(root);
  await fs.mkdir(leaseDir,{recursive:true});
  await fs.writeFile(path.join(leaseDir,'orphan.lease'),'abandoned');
  const ticket = await beginPublication(root,args);
  await assert.rejects(waitForPublicationReadersToDrain(root,{timeoutMs:8,pollMs:2}),/not_drained/);
  assert.equal(readPublicationGuard(root).pending,true);
  // Never automatically remove an orphan or the writer guard.
  await fs.unlink(path.join(leaseDir,'orphan.lease'));
  await waitForPublicationReadersToDrain(root);
  await finishPublication(root,ticket);
}));

test('writer must acquire marker, drain readers, then promote release', async () => {
  const writer=await fs.readFile(new URL('../jobs/sync-deploy-snapshot-from-github.js',import.meta.url),'utf8');
  const index=await fs.readFile(new URL('../index.js',import.meta.url),'utf8');
  const a=writer.indexOf('const publication = await beginPublication(resolveDataPath(), {');
  const b=writer.indexOf('await waitForPublicationReadersToDrain(resolveDataPath());', a);
  const c=writer.indexOf('await promoteDirectory(stageDayDir, targetDayDir, backupDir);',b);
  assert.ok(a>=0 && a<b && b<c);
  assert.ok(index.includes('acquirePublicationReadLease(resolveDataPath())'));
  assert.ok(index.includes('res.once("close", release)'));
});


test('settlement-only writer drains readers before updating Value artifacts', async () => {
  const writer = await fs.readFile(new URL('../jobs/sync-deploy-snapshot-from-github.js', import.meta.url), 'utf8');
  const start = writer.indexOf('async function syncValueComparison({');
  const end = writer.indexOf('export async function syncDeploySnapshotFromGithub', start);
  const body = writer.slice(start, end < 0 ? undefined : end);
  const marker = body.indexOf('const publication = await beginPublication(resolveDataPath(), {');
  const drained = body.indexOf('await waitForPublicationReadersToDrain(resolveDataPath());',marker);
  const mutation = body.indexOf('await writeFileAtomic(',drained);
  assert.ok(marker >= 0 && marker < drained && drained < mutation);
});
