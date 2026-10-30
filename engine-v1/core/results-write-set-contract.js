import { createHash } from "node:crypto";

// Pure exact-byte binding; does not approve, sign, apply or write corrections.
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
const validHash = s => typeof s === "string" && /^[a-f0-9]{64}$/.test(s);
const validPath = p => typeof p === "string" &&
  /^data\/league-memory\/results\/[a-z0-9][a-z0-9._-]*\.json$/.test(p) &&
  !p.includes("..");

export function verifyResultsWriteSetManifest(manifest, stagedEntries) {
  const failures = [];
  if (manifest?.schema !== "ai-matchlab.results-write-set.v1" ||
      !Array.isArray(manifest.entries) || !Array.isArray(stagedEntries)) {
    return {ok:false,failures:[{reason:"write_set_invalid_schema"}]};
  }
  if (!manifest.entries.length || !stagedEntries.length) {
    return {ok:false,failures:[{reason:"write_set_empty"}]};
  }
  const expected = new Map(), actual = new Map();
  for (const entry of manifest.entries) {
    if (!validPath(entry?.path) || !validHash(entry?.beforeSha256) ||
        !validHash(entry?.afterSha256) || !["M"].includes(entry?.status) ||
        expected.has(entry.path)) {
      failures.push({reason:"write_set_invalid_or_duplicate_entry",path:entry?.path??null});
      continue;
    }
    expected.set(entry.path,entry);
  }
  for (const entry of stagedEntries) {
    if (!validPath(entry?.path) || !["M"].includes(entry?.status) ||
        !Buffer.isBuffer(entry?.beforeBytes) || !Buffer.isBuffer(entry?.afterBytes) ||
        actual.has(entry.path)) {
      failures.push({reason:"write_set_invalid_or_duplicate_staged",path:entry?.path??null});
      continue;
    }
    actual.set(entry.path,entry);
  }
  for (const [path, e] of expected) {
    const a = actual.get(path);
    if (!a) { failures.push({reason:"write_set_missing_staged_path",path}); continue; }
    if (sha256(a.beforeBytes) !== e.beforeSha256 ||
        sha256(a.afterBytes) !== e.afterSha256)
      failures.push({reason:"write_set_content_hash_mismatch",path});
  }
  for (const path of actual.keys()) {
    if (!expected.has(path)) failures.push({reason:"write_set_unapproved_staged_path",path});
  }
  return {ok:failures.length===0,expectedCount:expected.size,stagedCount:actual.size,failures};
}
