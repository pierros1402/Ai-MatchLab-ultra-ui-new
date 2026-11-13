// V3.5I: immutable, content-checked *additional* generation artifact.
// This module does not redirect legacy readers and does not remove HOLD guards.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';

export const GENERATION_SCHEMA = 'aiml.runtime-immutable-generation.v35i';
export const POINTER_SCHEMA = 'aiml.runtime-immutable-pointer.v35i';
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const REF = /^[0-9a-f]{40}$/;
const HASH = /^[0-9a-f]{64}$/;
const digest = b => createHash('sha256').update(b).digest('hex');
const fault = reason => { throw new Error(`runtime_generation_${reason}`); };
const rootFor = (root, day) => path.join(root, '.snapshot-sync', 'immutable-generations', day);
const pointerFor = (root, day) => path.join(rootFor(root, day), 'current.json');

function validateInputs(root, day, ref, manifestHash) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) fault('absolute_root_required');
  if (!DAY.test(day)) fault('invalid_day');
  if (!REF.test(ref)) fault('invalid_ref');
  if (!HASH.test(manifestHash)) fault('invalid_manifest_hash');
}
function safeRel(p) {
  return typeof p === 'string' && p.length > 0 && !p.includes('\\') &&
    p.split('/').every(x => x !== '' && x !== '.' && x !== '..');
}
async function listFiles(dir) {
  const found = [];
  async function walk(base, prefix) {
    for (const entry of await fsp.readdir(base, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (!safeRel(rel)) fault('unsafe_file_path');
      if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) fault('nonregular_file');
      if (entry.isDirectory()) await walk(path.join(base, entry.name), rel);
      else found.push(rel);
    }
  }
  await walk(dir, '');
  return found.sort();
}
async function fsyncFile(file) {
  // Windows FlushFileBuffers requires a handle with write access.
  // Do not swallow file sync errors: they must prevent activation.
  const h = await fsp.open(file, 'r+');
  try { await h.sync(); } finally { await h.close(); }
}
async function fsyncDirBestEffort(dir) {
  // Windows can reject directory handles. No false claim of power-loss durability.
  try { const h = await fsp.open(dir, 'r'); try { await h.sync(); } finally { await h.close(); } } catch (e) {
    if (process.platform !== 'win32') throw e;
  }
}

export async function verifyImmutableGeneration(root, day, generation) {
  if (typeof root !== 'string' || !path.isAbsolute(root) || !DAY.test(day) ||
      !/^[0-9a-f]{32}$/.test(generation)) fault('invalid_locator');
  const directory = path.join(rootFor(root, day), 'versions', generation);
  const receiptFile = path.join(directory, '.generation-receipt.json');
  let receipt;
  try { receipt = JSON.parse(await fsp.readFile(receiptFile, 'utf8')); }
  catch { fault('receipt_missing_or_invalid'); }
  if (receipt?.schema !== GENERATION_SCHEMA || receipt.day !== day ||
      receipt.generation !== generation || !REF.test(receipt.ref) ||
      !HASH.test(receipt.manifestHash) || !Array.isArray(receipt.files)) fault('receipt_invalid');
  const names = await listFiles(directory);
  const expectedNames = [...receipt.files.map(x => x.path), '.generation-receipt.json'].sort();
  if (JSON.stringify(names) !== JSON.stringify(expectedNames)) fault('inventory_mismatch');
  for (const item of receipt.files) {
    if (!safeRel(item?.path) || !HASH.test(item.sha256) ||
        !Number.isSafeInteger(item.bytes) || item.bytes < 0) fault('receipt_file_invalid');
    const bytes = await fsp.readFile(path.join(directory, ...item.path.split('/')));
    if (bytes.length !== item.bytes || digest(bytes) !== item.sha256) fault('file_hash_mismatch');
  }
  const manifest = JSON.parse(await fsp.readFile(path.join(directory, 'manifest.json'), 'utf8'));
  if (manifest?.hash !== receipt.manifestHash) fault('manifest_mismatch');
  return { receipt, directory };
}

export async function prepareImmutableGeneration({ dataRoot, day, ref, manifestHash, sourceDir, faultAt = null }) {
  validateInputs(dataRoot, day, ref, manifestHash);
  if (typeof sourceDir !== 'string' || !path.isAbsolute(sourceDir)) fault('source_absolute_required');
  const generation = randomUUID().replaceAll('-', '');
  const home = rootFor(dataRoot, day);
  const versions = path.join(home, 'versions');
  const temp = path.join(home, `.staging-${generation}`);
  const target = path.join(versions, generation);
  await fsp.mkdir(versions, { recursive: true });
  // Never follow links inside a fetched stage. Staging is not the served tree.
  const entries = await listFiles(sourceDir);
  if (!entries.includes('manifest.json')) fault('manifest_missing');
  try {
    await fsp.mkdir(temp, { recursive: false });
    const rows = [];
    for (const rel of entries) {
      const source = path.join(sourceDir, ...rel.split('/'));
      const output = path.join(temp, ...rel.split('/'));
      await fsp.mkdir(path.dirname(output), { recursive: true });
      const bytes = await fsp.readFile(source);
      await fsp.writeFile(output, bytes, { flag: 'wx' });
      await fsyncFile(output);
      rows.push({ path: rel, bytes: bytes.length, sha256: digest(bytes) });
    }
    const manifest = JSON.parse(await fsp.readFile(path.join(temp, 'manifest.json'), 'utf8'));
    if (manifest?.hash !== manifestHash) fault('manifest_mismatch');
    if (faultAt === 'before_receipt') fault('injected_before_receipt');
    const receipt = { schema: GENERATION_SCHEMA, day, ref, manifestHash, generation, files: rows };
    const receiptFile = path.join(temp, '.generation-receipt.json');
    await fsp.writeFile(receiptFile, JSON.stringify(receipt) + '\n', { flag: 'wx' });
    await fsyncFile(receiptFile);
    await fsyncDirBestEffort(temp);
    await fsp.rename(temp, target);
    await fsyncDirBestEffort(versions);
    await verifyImmutableGeneration(dataRoot, day, generation);
    if (faultAt === 'after_rename') fault('injected_after_rename');
    return { day, ref, manifestHash, generation, directory: target };
  } finally {
    // Never remove a completed immutable generation after a failure.
    await fsp.rm(temp, { recursive: true, force: true }).catch(() => {});
  }
}

export async function activateImmutableGeneration(dataRoot, prepared, { faultAt = null } = {}) {
  const { day, ref, manifestHash, generation } = prepared || {};
  validateInputs(dataRoot, day, ref, manifestHash);
  const valid = await verifyImmutableGeneration(dataRoot, day, generation);
  if (valid.receipt.ref !== ref || valid.receipt.manifestHash !== manifestHash) fault('prepared_identity_mismatch');
  const home = rootFor(dataRoot, day);
  const file = pointerFor(dataRoot, day);
  const temp = path.join(home, `.pointer-${randomUUID()}.tmp`);
  const pointer = { schema: POINTER_SCHEMA, day, generation, ref, manifestHash };
  try {
    await fsp.writeFile(temp, JSON.stringify(pointer) + '\n', { flag: 'wx' });
    await fsyncFile(temp);
    if (faultAt === 'before_pointer') fault('injected_before_pointer');
    await fsp.rename(temp, file);
    await fsyncDirBestEffort(home);
    return pointer;
  } finally {
    await fsp.rm(temp, { force: true }).catch(() => {});
  }
}

export async function readPinnedImmutableGeneration(dataRoot, day) {
  if (typeof dataRoot !== 'string' || !path.isAbsolute(dataRoot) || !DAY.test(day)) fault('invalid_locator');
  let pointer;
  try { pointer = JSON.parse(await fsp.readFile(pointerFor(dataRoot, day), 'utf8')); }
  catch { fault('pointer_missing_or_invalid'); }
  if (pointer?.schema !== POINTER_SCHEMA || pointer.day !== day ||
      !/^[0-9a-f]{32}$/.test(pointer.generation) ||
      !REF.test(pointer.ref) || !HASH.test(pointer.manifestHash)) fault('pointer_invalid');
  const valid = await verifyImmutableGeneration(dataRoot, day, pointer.generation);
  if (valid.receipt.ref !== pointer.ref || valid.receipt.manifestHash !== pointer.manifestHash) fault('pointer_receipt_mismatch');
  return { ...pointer, directory: valid.directory };
}
