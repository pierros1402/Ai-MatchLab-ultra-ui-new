import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

export const PUBLICATION_GUARD_SCHEMA = 'aiml.runtime-publication-guard.v1';

// Every public data reader is fail-closed during a mutable publication. A
// restrictive opt-out is safer than an exact allow-list that misses new routes.
// HTTP HEAD inherits GET handlers in Express and must be covered as well.
const DIAGNOSTIC_READ_PATHS = new Set(['/health']);

export function isPublicationProtectedRequest(method, pathname) {
  const verb = String(method || '').toUpperCase();
  const route = String(pathname || '');
  if (verb !== 'GET' && verb !== 'HEAD') return false;
  if (DIAGNOSTIC_READ_PATHS.has(route)) return false;
  if (route === '/ops' || route.startsWith('/ops/')) return false;
  // Avoid permitting unseen/new data routes by default.
  return true;
}

export function publicationGuardFile(dataRoot) {
  return path.join(dataRoot, '.snapshot-sync', 'publication-guard.json');
}

export function readPublicationGuard(dataRoot) {
  const file = publicationGuardFile(dataRoot);
  // Presence is authoritative: even malformed or half-written evidence is HOLD.
  try {
    fs.statSync(file);
  } catch (error) {
    if (error?.code === 'ENOENT') return { pending: false };
    return { pending: true, reason: 'publication_guard_stat_failed' };
  }
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (value?.schema !== PUBLICATION_GUARD_SCHEMA ||
        !/^[0-9a-f-]{36}$/i.test(String(value.token || '')) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(String(value.day || ''))) {
      return { pending: true, reason: 'publication_guard_invalid' };
    }
    return {
      pending: true,
      reason: 'publication_in_progress_or_recovery_required',
      day: value.day,
      mode: value.mode,
      startedAt: value.startedAt
    };
  } catch {
    return { pending: true, reason: 'publication_guard_unreadable' };
  }
}

export async function beginPublication(dataRoot, { day, ref, manifestHash = null, mode }) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || ''))) {
    throw new Error('publication_guard_day_invalid');
  }
  if (mode !== 'snapshot' && mode !== 'settlement' && mode !== 'plan-c-shadow') {
    throw new Error('publication_guard_mode_invalid');
  }
  const file = publicationGuardFile(dataRoot);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const token = randomUUID();
  const value = {
    schema: PUBLICATION_GUARD_SCHEMA,
    token,
    day,
    ref: String(ref || ''),
    manifestHash,
    mode,
    startedAt: new Date().toISOString()
  };
  let handle;
  try {
    // Atomic exclusive-create: two concurrent writers cannot both publish.
    handle = await fsp.open(file, 'wx', 0o600);
  } catch (error) {
    if (error?.code === 'EEXIST') {
      throw new Error('publication_guard_existing_hold');
    }
    throw error;
  }
  // On any write/fsync failure, retain the marker for fail-closed recovery.
  try {
    await handle.writeFile(JSON.stringify(value) + '\n', 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  return { file, token, day, mode };
}

export async function finishPublication(dataRoot, ticket) {
  const file = publicationGuardFile(dataRoot);
  let value;
  try {
    value = JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch {
    throw new Error('publication_guard_completion_evidence_invalid');
  }
  if (value?.schema !== PUBLICATION_GUARD_SCHEMA ||
      value.token !== ticket?.token || value.day !== ticket?.day ||
      value.mode !== ticket?.mode) {
    throw new Error('publication_guard_completion_ticket_mismatch');
  }
  await fsp.unlink(file);
}


// A lease is visible across independent Engine/writer processes sharing dataRoot.
// Readers create the lease BEFORE a second marker check; after marker creation
// the writer waits for all earlier leases to drain before mutating data.
export function publicationReadLeaseDir(dataRoot) {
  return path.join(dataRoot, '.snapshot-sync', 'publication-read-leases');
}

export function acquirePublicationReadLease(dataRoot) {
  if (readPublicationGuard(dataRoot).pending) {
    throw new Error('publication_read_guard_active');
  }
  const dir = publicationReadLeaseDir(dataRoot);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, randomUUID() + '.lease');
  let fd;
  try {
    fd = fs.openSync(file, 'wx', 0o600);
    fs.writeSync(fd, String(process.pid) + '\n');
    fs.fsyncSync(fd);
  } catch (error) {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch {} }
    // Do not silently leak an unreadable/partial lease. A leaked lease HOLDs writes.
    throw error;
  }
  fs.closeSync(fd);
  // This closes the marker creation race: a writer that acquired its marker
  // before this check blocks us, and cannot mutate until this lease is gone.
  if (readPublicationGuard(dataRoot).pending) {
    fs.unlinkSync(file);
    throw new Error('publication_read_guard_active');
  }
  let released = false;
  return () => {
    if (released) return;
    // Release only on successful unlink; failure preserves writer HOLD.
    fs.unlinkSync(file);
    released = true;
  };
}

export async function waitForPublicationReadersToDrain(dataRoot, options = {}) {
  if (!readPublicationGuard(dataRoot).pending) {
    throw new Error('publication_drain_without_guard');
  }
  const timeoutMs = options.timeoutMs ?? 30000;
  const pollMs = options.pollMs ?? 25;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 0 ||
      !Number.isInteger(pollMs) || pollMs < 1) {
    throw new Error('publication_drain_options_invalid');
  }
  const dir = publicationReadLeaseDir(dataRoot);
  const started = Date.now();
  while (true) {
    let entries;
    try { entries = await fsp.readdir(dir); }
    catch (error) {
      if (error?.code === 'ENOENT') entries = [];
      else throw error; // fail closed
    }
    if (entries.length === 0) return;
    if (Date.now() - started >= timeoutMs) {
      throw new Error('publication_read_leases_not_drained');
    }
    await new Promise(resolve => setTimeout(resolve, pollMs));
  }
}
