import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

export const HISTORY_ARCHIVE_BRANCH = "codex/history-archive";
// Only application evidence, never .env, credentials, source code or arbitrary files.
const STORES = new Set([
  "value", "value-plans", "value-comparison", "final-results", "final-result-conflicts",
  "canonical-fixtures", "canonical-registry", "canonical-memory", "expected-matches",
  "deploy-snapshots", "details", "history", "history-archive", "history-index",
  "history-resolutions", "history-truth-repair-quarantine", "historical-integrity",
  "model-priors", "standings", "league-memory", "odds-memory", "multi-odds",
  "h2h", "h2h-foundation", "h2h-resolutions", "team-news", "team-geo", "player-usage",
  "competition-admission", "competition-discovery", "competition-format-registry",
  "competition-routing-quarantine", "provider-competition-registry", "coverage-readiness",
  "coverage-reports", "build-reports", "system-health", "day-truth-ledger", "football-truth",
  "verification", "foundation-integrity", "identity-decisions", "identity-recovery",
  "ingest-state", "snapshot-integrity-archive", "snapshot-integrity-diagnostics",
  "value-data-acquisition", "quarantine", "team-aliases", "team-foundation", "officiating",
  "reference", "research-cache", "plan-c-shadow"
]);
const ROOT_FILES = new Set([
  "active-leagues.json", "backfill-progress.json", "disagreements.json",
  "final-truth-adjudications.v1.json", "fixtures.json", "observations.json", "signals.json",
  "skipped.json", "source-reliability.json", "source2-fixtures.json"
]);

export function isHistoryEvidencePath(value) {
  const parts = String(value).split("/");
  if (parts.length === 2 && parts[0] === "data") return ROOT_FILES.has(parts[1]);
  return parts[0] === "data" && STORES.has(parts[1]) && parts.length >= 3 &&
    parts.every(part => part && part !== "." && part !== ".." && !/[\\\x00-\x1f]/u.test(part)) &&
    !parts.some(part => /^(\.env(?:\..*)?|(?:credentials?|secrets?|tokens?|cookies?)(?:\..*)?)$/iu.test(part)) &&
    /\.(json|jsonl|ndjson|csv|html\.gz)$/u.test(value);
}

const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const CHUNK_BYTES = 8 * 1024 * 1024;

function git(root, args, { input, index, allowFailure = false, binary = false } = {}) {
  const result = spawnSync("git", args, {
    cwd: root, input, encoding: binary || input instanceof Buffer ? undefined : "utf8",
    env: { ...process.env, ...(index ? { GIT_INDEX_FILE: index } : {}) },
    timeout: 120_000, maxBuffer: 128 * 1024 * 1024,
    windowsHide: true
  });
  if (result.error || result.status !== 0) {
    if (allowFailure) return null;
    throw new Error(`history_preservation_git_failed:${args[0]}:${String(result.stderr || result.error || "").slice(0, 1200)}`);
  }
  return result.stdout;
}

function filesUnder(root, relative = "data") {
  const dir = path.join(root, relative);
  if (!fs.existsSync(dir)) return [];
  if (fs.lstatSync(dir).isSymbolicLink()) throw new Error(`history_evidence_symlink:${relative}`);
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const name = `${relative}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`history_evidence_symlink:${name}`);
    if (entry.isDirectory()) {
      if (relative !== "data" || STORES.has(entry.name)) out.push(...filesUnder(root, name));
    } else if (entry.isFile() && isHistoryEvidencePath(name)) out.push(name);
  }
  return out;
}

function token(value, label) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,100}$/u.test(String(value || ""))) {
    throw new Error(`invalid_history_checkpoint_${label}`);
  }
  return String(value);
}

function readBlob(root, ref, name) {
  const value = git(root, ["show", `${ref}:${name}`], { allowFailure: true, binary: true });
  return value === null ? null : Buffer.from(value);
}

function readBlobs(root, files, consume) {
  let group = [], size = 0;
  let currentPath, fileHash, fileBytes = 0;
  function flush() {
    if (!group.length) return;
    const output = git(root, ["cat-file", "--batch"], {
      input: Buffer.from(group.map(file => file.oid).join("\n") + "\n"), binary: true
    });
    let offset = 0;
    for (const file of group) {
      const newline = output.indexOf(10, offset);
      const header = output.subarray(offset, newline).toString("ascii");
      if (header !== `${file.oid} blob ${file.bytes}`) throw new Error("history_blob_header_mismatch");
      const payload = output.subarray(newline + 1, newline + 1 + file.bytes);
      if (payload.length !== file.bytes || sha256(payload) !== file.sha256) {
        throw new Error(`history_payload_hash_mismatch:${file.path}`);
      }
      if (currentPath !== file.path) {
        currentPath = file.path; fileHash = crypto.createHash("sha256"); fileBytes = 0;
      }
      fileHash.update(payload); fileBytes += payload.length;
      if (file.lastChunk && (fileBytes !== file.totalBytes || fileHash.digest("hex") !== file.totalSha256)) {
        throw new Error(`history_file_hash_mismatch:${file.path}`);
      }
      consume(file, payload);
      offset = newline + 1 + file.bytes + 1;
    }
    group = []; size = 0;
  }
  for (const file of files) {
    if (!Number.isSafeInteger(file.bytes) || file.bytes < 0 || !Array.isArray(file.chunks) || !file.chunks.length) {
      throw new Error("history_evidence_file_size_invalid");
    }
    for (const [index, chunk] of file.chunks.entries()) {
      if (!Number.isSafeInteger(chunk.bytes) || chunk.bytes < 0 || chunk.bytes > CHUNK_BYTES) {
        throw new Error("history_evidence_chunk_size_invalid");
      }
      if (size + chunk.bytes > CHUNK_BYTES) flush();
      group.push({ ...chunk, path: file.path, firstChunk: index === 0, lastChunk: index === file.chunks.length - 1,
        totalBytes: file.bytes, totalSha256: file.sha256 });
      size += chunk.bytes;
    }
  }
  flush();
}

function remoteArchive(root, remote) {
  const refs = git(root, ["ls-remote", "--heads", remote, `refs/heads/${HISTORY_ARCHIVE_BRANCH}`]).trim();
  if (!refs) return null;
  const commit = refs.split(/\s/u)[0];
  git(root, ["fetch", "--quiet", "--no-tags", remote, commit]);
  return commit;
}

/** Capture bytes, including partial/invalid JSON, without interpreting empty files as successful runs.
 * Each archive commit retains the source commit as a parent, so unchanged baseline data remains reachable.
 * The source checkout/index and main branch are never changed.
 */
export function preserveHistoryCheckpoint({
  root = process.cwd(), dayKey, stage,
  runId = process.env.GITHUB_RUN_ID, attempt = process.env.GITHUB_RUN_ATTEMPT || "1",
  remote = "origin", retries = 3, evidenceScope = "full"
} = {}) {
  if (!["full", "workflow-logs"].includes(evidenceScope)) throw new Error("invalid_history_evidence_scope");
  const inScope = name => evidenceScope === "full" || name.startsWith("data/ingest-state/workflow-logs/");
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(dayKey))) throw new Error("invalid_history_checkpoint_day");
  token(stage, "stage"); token(runId, "run"); token(attempt, "attempt");
  const sourceCommit = git(root, ["rev-parse", "HEAD"]).trim();
  const baseline = git(root, ["ls-tree", "-r", "--name-only", "-z", sourceCommit, "--", "data"])
    .split("\0").filter(isHistoryEvidencePath).filter(inScope);
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), "matchlab-history-"));
  const manifestPath = `checkpoints/${dayKey}/${runId}/${attempt}/${stage}/manifest.json`;
  try {
    const initialParent = remoteArchive(root, remote);
    const files = [];
    // Reuse existing content-addressed Git objects rather than copying the entire
    // evidence store for every checkpoint (intraday/result writers run often).
    const objectFormat = git(root, ["rev-parse", "--show-object-format"]).trim();
    const knownObjects = new Set(git(root, ["cat-file", "--batch-all-objects", "--batch-check=%(objectname)"]).trim().split("\n"));
    const newPayloads = [];
    const buffer = Buffer.allocUnsafe(CHUNK_BYTES);
    for (const name of filesUnder(root).filter(inScope).sort()) {
      const fd = fs.openSync(path.join(root, name), "r");
      const hash = crypto.createHash("sha256"), chunks = [];
      let totalBytes = 0;
      try {
        do {
          const length = fs.readSync(fd, buffer, 0, CHUNK_BYTES, null);
          if (!length && chunks.length) break;
          const bytes = buffer.subarray(0, length);
          hash.update(bytes); totalBytes += length;
          const oid = crypto.createHash(objectFormat).update(`blob ${length}\0`).update(bytes).digest("hex");
          if (!knownObjects.has(oid)) {
            const payloadPath = path.join(captureDir, String(newPayloads.length));
            fs.writeFileSync(payloadPath, bytes); newPayloads.push({ payloadPath, oid }); knownObjects.add(oid);
          }
          chunks.push({ oid, sha256: sha256(bytes), bytes: length });
          if (!length) break;
        } while (true);
      } finally { fs.closeSync(fd); }
      files.push({ path: name, chunks, sha256: hash.digest("hex"), bytes: totalBytes });
    }
    if (newPayloads.length) {
      const paths = newPayloads.map(payload => JSON.stringify(payload.payloadPath.replaceAll("\\", "/")));
      const oids = git(root, ["hash-object", "-w", "--no-filters", "--stdin-paths"], { input: paths.join("\n") + "\n" }).trim().split("\n");
      if (oids.length !== newPayloads.length || oids.some((oid, index) => oid !== newPayloads[index].oid)) {
        throw new Error("history_capture_blob_count_mismatch");
      }
    }
    const present = new Set(files.map(file => file.path));
    const missingBaselineFiles = baseline.filter(name => !present.has(name));
    const identity = { schema: "ai-matchlab.history-checkpoint.v1", dayKey, stage, runId: String(runId), attempt: String(attempt), sourceCommit, files, missingBaselineFiles };
    if (evidenceScope !== "full") identity.evidenceScope = evidenceScope;
    const fingerprint = sha256(Buffer.from(JSON.stringify(identity)));
    const manifest = { ...identity, fingerprint, capturedAt: new Date().toISOString(),
      purpose: "recovery_evidence_only", publicationApproved: false,
      note: "Capture includes partial inputs and failed outputs; no execution status or zero-pick result is inferred." };
    const bytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
    const manifestOid = String(git(root, ["hash-object", "-w", "--stdin"], { input: bytes })).trim();
    const locator = Buffer.from(`${JSON.stringify({ schema: "ai-matchlab.history-locator.v1", manifestPath,
      dayKey, runId: String(runId), attempt: String(attempt), stage, fingerprint, capturedAt: manifest.capturedAt })}\n`);
    const locatorOid = String(git(root, ["hash-object", "-w", "--stdin"], { input: locator })).trim();
    let lastError;
    for (let retry = 0; retry < retries; retry++) {
      const parent = retry === 0 ? initialParent : remoteArchive(root, remote);
      if (parent) {
        const existing = readBlob(root, parent, manifestPath);
        if (existing) {
          if (JSON.parse(existing).fingerprint !== fingerprint) throw new Error("history_checkpoint_identity_conflict");
          verifyHistoryCheckpoint({ root, ref: parent, manifestPath });
          return { ok: true, reused: true, archiveCommit: parent, manifestPath, fileCount: files.length };
        }
      }
      const index = path.join(captureDir, `index-${retry}`);
      git(root, ["read-tree", ...(parent ? [parent] : ["--empty"])], { index });
      const blobEntries = new Map(files.flatMap(file => file.chunks.map(chunk =>
        [`blobs/${chunk.sha256.slice(0, 2)}/${chunk.sha256}`, chunk.oid])));
      const entries = [...blobEntries].map(([name, oid]) => `100644 ${oid}\t${name}\0`);
      entries.push(`100644 ${manifestOid}\t${manifestPath}\0`);
      // A small locator for off-site backup readers. Immutable older manifests
      // and payloads remain in this tree and in the append-only parent history.
      entries.push(`100644 ${locatorOid}\t${evidenceScope === "full" ? "latest-checkpoint.json" : "latest-workflow-logs.json"}\0`);
      git(root, ["update-index", "-z", "--index-info"], { index, input: Buffer.from(entries.join("")) });
      const tree = git(root, ["write-tree"], { index }).trim();
      const parents = [...new Set([parent, sourceCommit].filter(Boolean))];
      const commit = git(root, ["-c", "user.name=History preservation", "-c", "user.email=history-preservation@users.noreply.github.com",
        "commit-tree", tree, ...parents.flatMap(value => ["-p", value])],
      { input: `Preserve ${dayKey} ${stage} run ${runId}/${attempt}\n` }).trim();
      try {
        // A normal fast-forward push. Concurrent writers cause a retry, never a force push.
        git(root, ["push", "--quiet", remote, `${commit}:refs/heads/${HISTORY_ARCHIVE_BRANCH}`]);
        const durableRef = remoteArchive(root, remote);
        verifyHistoryCheckpoint({ root, ref: durableRef, manifestPath });
        return { ok: true, reused: false, archiveCommit: commit, manifestPath, fileCount: files.length };
      } catch (error) { lastError = error; }
    }
    throw lastError || new Error("history_checkpoint_not_durable");
  } finally { fs.rmSync(captureDir, { recursive: true, force: true }); }
}

export function verifyHistoryCheckpoint({ root = process.cwd(), ref, manifestPath } = {}) {
  if (!/^[a-zA-Z0-9/._-]+\/manifest\.json$/u.test(manifestPath) || manifestPath.split("/").includes("..")) {
    throw new Error("invalid_history_manifest_path");
  }
  const bytes = readBlob(root, ref, manifestPath);
  if (!bytes) throw new Error("history_manifest_missing");
  const manifest = JSON.parse(bytes);
  if (manifest.schema !== "ai-matchlab.history-checkpoint.v1") throw new Error("history_manifest_schema_invalid");
  const { schema, dayKey, stage, runId, attempt, sourceCommit, files, missingBaselineFiles } = manifest;
  const identity = { schema, dayKey, stage, runId, attempt, sourceCommit, files, missingBaselineFiles };
  if (manifest.evidenceScope !== undefined) {
    if (manifest.evidenceScope !== "workflow-logs" || [...files.map(file => file.path), ...missingBaselineFiles].some(name => !name.startsWith("data/ingest-state/workflow-logs/"))) throw new Error("history_manifest_scope_invalid");
    identity.evidenceScope = manifest.evidenceScope;
  }
  if (sha256(Buffer.from(JSON.stringify(identity))) !== manifest.fingerprint) throw new Error("history_manifest_hash_mismatch");
  const tree = git(root, ["ls-tree", "-r", "-z", ref, "--", "blobs"]);
  const entries = new Map(tree.split("\0").filter(Boolean).map(entry => {
    const [metadata, name] = entry.split("\t");
    return [name, metadata.split(" ")[2]];
  }));
  const seen = new Set();
  for (const file of manifest.files) {
    if (!isHistoryEvidencePath(file.path) || seen.has(file.path)) throw new Error("history_manifest_unsafe_data_path");
    seen.add(file.path);
    if (!Array.isArray(file.chunks) || !file.chunks.length) throw new Error("history_manifest_chunks_missing");
    for (const chunk of file.chunks) {
      if (entries.get(`blobs/${chunk.sha256.slice(0, 2)}/${chunk.sha256}`) !== chunk.oid) throw new Error(`history_archive_file_missing:${file.path}`);
    }
  }
  readBlobs(root, manifest.files, () => {});
  return manifest;
}

/** Restore to a NEW directory only; never overwrite production or the source checkout. */
export function restoreHistoryCheckpoint({ root = process.cwd(), ref, manifestPath, destination } = {}) {
  if (!destination) throw new Error("history_restore_destination_required");
  const manifest = verifyHistoryCheckpoint({ root, ref, manifestPath });
  const dest = path.resolve(destination);
  if (fs.existsSync(dest)) throw new Error("history_restore_destination_must_be_new");
  fs.mkdirSync(dest, { recursive: true });
  readBlobs(root, manifest.files, (file, payload) => {
    const target = path.join(dest, file.path);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, payload, { flag: file.firstChunk ? "wx" : "a" });
  });
  const buffer = Buffer.allocUnsafe(CHUNK_BYTES);
  for (const file of manifest.files) {
    const hash = crypto.createHash("sha256"), fd = fs.openSync(path.join(dest, file.path), "r");
    try {
      let length;
      while ((length = fs.readSync(fd, buffer, 0, CHUNK_BYTES, null))) hash.update(buffer.subarray(0, length));
    } finally { fs.closeSync(fd); }
    if (hash.digest("hex") !== file.sha256) throw new Error("history_restored_bytes_mismatch");
  }
  fs.writeFileSync(path.join(dest, "history-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  return { ok: true, fileCount: manifest.files.length, destination: dest, publicationApproved: false };
}

export function prepareHistoryRecoveryBundle({ root = process.cwd(), destination, dayKey,
  baseline = process.env.GITHUB_SHA || "HEAD", full = false } = {}) {
  if (!destination) throw new Error("history_bundle_destination_required");
  const dest = path.resolve(destination);
  if (fs.existsSync(dest)) throw new Error("history_bundle_destination_must_be_new");
  fs.mkdirSync(dest, { recursive: true });
  const files = [];
  const buffer = Buffer.allocUnsafe(CHUNK_BYTES);
  const baselineCommit = git(root, ["rev-parse", `${baseline}^{commit}`]).trim();
  // The committed baseline is already durable. Upload changed, new and ignored
  // bytes instead of charging for another multi-gigabyte full artifact each tick.
  const candidates = full ? filesUnder(root) : [
    ...git(root, ["diff", "--name-only", "--no-renames", "-z", baselineCommit, "--", "data"]).split("\0"),
    ...git(root, ["ls-files", "--others", "--exclude-standard", "-z", "--", "data"]).split("\0"),
    ...git(root, ["ls-files", "--others", "--ignored", "--exclude-standard", "-z", "--", "data"]).split("\0")
  ];
  const absentPaths = [];
  for (const name of [...new Set(candidates.filter(isHistoryEvidencePath))].sort()) {
    const source = path.join(root, name);
    if (!fs.existsSync(source)) { absentPaths.push(name); continue; }
    let component = root;
    for (const part of name.split("/")) {
      component = path.join(component, part);
      if (fs.lstatSync(component).isSymbolicLink()) throw new Error(`history_evidence_symlink:${name}`);
    }
    if (!fs.lstatSync(source).isFile()) throw new Error(`history_bundle_unsafe_file:${name}`);
    const file = path.join(dest, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.copyFileSync(source, file, fs.constants.COPYFILE_EXCL);
    const hash = crypto.createHash("sha256"), fd = fs.openSync(file, "r");
    let length, bytes = 0;
    try {
      while ((length = fs.readSync(fd, buffer, 0, CHUNK_BYTES, null))) {
        hash.update(buffer.subarray(0, length)); bytes += length;
      }
    } finally { fs.closeSync(fd); }
    files.push({ path: name, bytes, sha256: hash.digest("hex") });
  }
  writeHistoryJsonAtomic(path.join(dest, "manifest.json"), {
    schema: "ai-matchlab.history-recovery-bundle.v1", dayKey,
    sourceCommit: git(root, ["rev-parse", "HEAD"]).trim(),
    baselineCommit, scope: full ? "full_evidence" : "changes_and_untracked_evidence", absentPaths,
    runId: process.env.GITHUB_RUN_ID || null, attempt: process.env.GITHUB_RUN_ATTEMPT || null,
    capturedAt: new Date().toISOString(), files, purpose: "recovery_evidence_only", publicationApproved: false
  });
  return { ok: true, fileCount: files.length, destination: dest, publicationApproved: false };
}

let checkpointSequence = 0;
export function checkpointHistoryIfRequired(dayKey, stage) {
  if (process.env.HISTORY_PRESERVATION_REQUIRED !== "1") return { enabled: false };
  const result = preserveHistoryCheckpoint({ dayKey, stage: `${stage}-${Date.now()}-${++checkpointSequence}` });
  console.log("[history-preservation] durable", JSON.stringify(result));
  return result;
}

export function writeHistoryJsonAtomic(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.history-tmp-${process.pid}-${crypto.randomBytes(8).toString("hex")}`;
  let fd;
  try {
    fd = fs.openSync(temporary, "wx");
    fs.writeFileSync(fd, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
    fs.fsyncSync(fd);
    fs.closeSync(fd); fd = undefined;
    fs.renameSync(temporary, file);
    // On Linux runners, also flush the directory entry after the rename.
    if (process.platform !== "win32") {
      const dir = fs.openSync(path.dirname(file), "r");
      try { fs.fsyncSync(dir); } finally { fs.closeSync(dir); }
    }
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}
