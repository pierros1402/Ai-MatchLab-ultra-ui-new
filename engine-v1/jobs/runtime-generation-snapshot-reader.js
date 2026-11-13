// V3.5J: scoped, opt-in migration of snapshot-manifest reads to immutable releases.
// Does not migrate Value, Plan C, /ready or out-of-process consumers.
import fs from 'node:fs/promises';
import path from 'node:path';
import { readPinnedImmutableGeneration } from './runtime-immutable-generation.js';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const HASH = /^[0-9a-f]{64}$/;
const error = reason => { throw new Error(`runtime_snapshot_reader_${reason}`); };

export async function readSnapshotManifestGeneration({ dataRoot, day, latest = null, strict = false }) {
  if (typeof dataRoot !== 'string' || !path.isAbsolute(dataRoot) || !DAY.test(day)) error('invalid_locator');
  const pointer = path.join(dataRoot, '.snapshot-sync', 'immutable-generations', day, 'current.json');
  // Backward compatibility only for days that have never received a generation.
  // Once a pointer exists, corruption must never fall back to mutable files.
  let exists = false;
  try { await fs.lstat(pointer); exists = true; }
  catch (e) { if (e?.code !== 'ENOENT') error('pointer_stat_failed'); }
  if (!exists) {
    if (strict) error('generation_required');
    return { mode: 'LEGACY' };
  }
  const pin = await readPinnedImmutableGeneration(dataRoot, day);
  let manifest;
  try { manifest = JSON.parse(await fs.readFile(path.join(pin.directory, 'manifest.json'), 'utf8')); }
  catch { error('manifest_invalid'); }
  if (!manifest || typeof manifest !== 'object' || manifest.hash !== pin.manifestHash || !HASH.test(manifest.hash)) error('manifest_mismatch');
  if (latest !== null && (latest?.date !== day || latest?.hash !== pin.manifestHash)) error('latest_generation_mismatch');
  return { mode: 'PINNED', manifest, ref: pin.ref, manifestHash: pin.manifestHash, generation: pin.generation, day };
}
