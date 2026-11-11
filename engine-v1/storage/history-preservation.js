import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { AsyncLocalStorage } from "node:async_hooks";
import { scanGitDelimited } from "./history-git-scan.js";
import { fetchHistoryArchiveTip } from "./history-archive-transport.js";

export const HISTORY_ARCHIVE_BRANCH = "codex/history-archive";
// Only application evidence, never .env, credentials, source code or arbitrary files.
const STORES = new Set([
  "value", "value-plans", "value-comparison", "value-unified", "value-data-readiness", "final-results", "final-result-conflicts",
  "canonical-fixtures", "canonical-registry", "canonical-memory", "expected-matches",
  "deploy-snapshots", "details", "history", "history-archive", "history-index", "history-recovery-journal",
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
  if(parts[1]==="value-unified"&&parts.includes("scratch"))return false;
  if (parts.length === 2 && parts[0] === "data") return ROOT_FILES.has(parts[1]);
  return parts[0] === "data" && STORES.has(parts[1]) && parts.length >= 3 &&
    parts.every(part => part && part !== "." && part !== ".." && !/[\\\x00-\x1f]/u.test(part)) &&
    !parts.some(part => /^(\.env(?:\..*)?|(?:credentials?|secrets?|tokens?|cookies?)(?:\..*)?)$/iu.test(part)) &&
    /\.(json|jsonl|ndjson|csv|html\.gz)$/u.test(value);
}

const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const CHUNK_BYTES = 8 * 1024 * 1024;
const archiveTransport = new AsyncLocalStorage();

function git(root, args, { input, index, allowFailure = false, binary = false, timeout } = {}) {
  const command = args[0] === "-c" ? args[2] : args[0];
  const result = spawnSync("git", args, {
    cwd: root, input, encoding: binary || input instanceof Buffer ? undefined : "utf8",
    env: { ...process.env, ...archiveTransport.getStore(), ...(index ? { GIT_INDEX_FILE: index } : {}) },
    // Cold archive history was previously prefetched by checkout. Its measured
    // first fetch exceeds two minutes; retain a finite budget without relaxing
    // durability, ancestry, hashing, or ordinary command timeouts.
    timeout: timeout ?? (command === "write-tree" ? 600_000 : command === "fetch" ? 300_000 : 120_000), maxBuffer: 128 * 1024 * 1024,
    windowsHide: true
  });
  if (result.error || result.status !== 0) {
    if (allowFailure) return null;
    throw new Error(`history_preservation_git_failed:${command}:${result.error?.code || result.signal || result.status}:${String(result.stderr || result.error || "").slice(0, 1200)}`);
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
  // Only an absent tree entry means absent evidence. A failed lazy download
  // must never authorize replacement of an existing checkpoint identity.
  if (!git(root, ["ls-tree", "-z", ref, "--", name]).length) return null;
  return Buffer.from(git(root, ["show", `${ref}:${name}`], { binary: true }));
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
  // Fetch the exact advertised commit. A moving remote is handled by the
  // normal fast-forward push/retry, without changing any checkout refs.
  return fetchHistoryArchiveTip({ remote, branch: HISTORY_ARCHIVE_BRANCH, run: (args, options) => git(root, args, options) });
}

function effectiveCredentialIncludes(root) {
  // checkout@v7 scopes its credential include to the original Git directory.
  // Private transport metadata does not match that includeIf. Carry the
  // already-effective credential config origins, without reading/header values
  // into arguments, logs or captured application evidence.
  const origins = git(root, ["config", "--null", "--show-origin", "--name-only", "--get-regexp",
    "^http\\..*\\.extraheader$|^credential(\\..*)?\\.(helper|username|usehttppath)$"], {allowFailure:true});
  if (!origins) return [];
  const fields = origins.split("\0"), files = new Set();
  for (let i=0;i+1<fields.length;i+=2) {
    const origin=fields[i];
    if (origin.startsWith("file:")) files.add(path.resolve(root,origin.slice(5)));
  }
  return [...files];
}

/** Capture bytes, including partial/invalid JSON, without interpreting empty files as successful runs.
 * Each archive commit retains the source commit as a parent, so unchanged baseline data remains reachable.
 * The source checkout/index and main branch are never changed.
 */
export function preserveHistoryCheckpoint({
  root = process.cwd(), dayKey, stage,
  runId = process.env.GITHUB_RUN_ID, attempt = process.env.GITHUB_RUN_ATTEMPT || "1",
  remote = "origin", retries = 3
} = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(dayKey))) throw new Error("invalid_history_checkpoint_day");
  token(stage, "stage"); token(runId, "run"); token(attempt, "attempt");
  const sourceCommit = git(root, ["rev-parse", "HEAD"]).trim();
  const baseline = [];
  scanGitDelimited(root, ["ls-tree", "-r", "--name-only", "-z", sourceCommit, "--", "data"], name => {
    if (isHistoryEvidencePath(name)) baseline.push(name);
  });
  const captureDir = fs.mkdtempSync(path.join(os.tmpdir(), "matchlab-history-"));
  const manifestPath = `checkpoints/${dayKey}/${runId}/${attempt}/${stage}/manifest.json`;
  // Keep archive shallow boundaries private to this operation. Marking the
  // main checkout shallow would undermine later source-ancestry proofs and
  // cause selected-history loading to download the archive again.
  const transportDir = path.join(captureDir, "transport.git");
  const objectDirectory = path.resolve(root, git(root, ["rev-parse", "--git-path", "objects"]).trim());
  const configFile = path.resolve(root, git(root, ["rev-parse", "--git-path", "config"]).trim());
  const objectFormat = git(root, ["rev-parse", "--show-object-format"]).trim();
  const credentialIncludes = effectiveCredentialIncludes(root);
  git(root, ["init", "--bare", `--object-format=${objectFormat}`, transportDir]);
  git(root, ["--git-dir", transportDir, "config", "include.path", configFile]);
  for (const credentialFile of credentialIncludes) {
    if (credentialFile !== configFile) git(root, ["--git-dir", transportDir, "config", "--add", "include.path", credentialFile]);
  }
  fs.appendFileSync(path.join(transportDir, "config"), "\n[core]\n\tbare = true\n");
  const sourceShallow = git(root, ["rev-parse", "--git-path", "shallow"]).trim();
  const sourceShallowPath = path.resolve(root, sourceShallow);
  if (fs.existsSync(sourceShallowPath)) fs.copyFileSync(sourceShallowPath, path.join(transportDir, "shallow"));
  return archiveTransport.run({ GIT_DIR: transportDir, GIT_OBJECT_DIRECTORY: objectDirectory }, () => {
  try {
    const initialParent = remoteArchive(root, remote);
    const files = [];
    // Reuse existing content-addressed Git objects rather than copying the entire
    // evidence store for every checkpoint (intraday/result writers run often).
    const objectFormat = git(root, ["rev-parse", "--show-object-format"]).trim();
    const knownObjects = new Set();
    scanGitDelimited(root, ["cat-file", "--batch-all-objects", "--batch-check=%(objectname)"], oid => {
      if (!/^[0-9a-f]{40,64}$/u.test(oid)) throw new Error("history_object_inventory_invalid");
      knownObjects.add(oid);
    }, { delimiter: 10 });
    const newPayloads = [];
    const buffer = Buffer.allocUnsafe(CHUNK_BYTES);
    for (const name of filesUnder(root).sort()) {
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
      entries.push(`100644 ${locatorOid}\tlatest-checkpoint.json\0`);
      git(root, ["update-index", "-z", "--index-info"], { index, input: Buffer.from(entries.join("")) });
      // The inherited tree belongs to the already durable remote archive parent.
      // In a blob-filtered checkout, checking every inherited blob here lazily
      // downloads the entire old archive, one object at a time. Current payloads
      // and both metadata blobs were written locally above. Keep old references
      // without fetching them; the normal fast-forward push still checks remote
      // connectivity and verifyHistoryCheckpoint hashes every current payload.
      const tree = git(root, ["write-tree", "--missing-ok"], { index }).trim();
      const parents = [...new Set([parent, sourceCommit].filter(Boolean))];
      const commit = git(root, ["-c", "user.name=History preservation", "-c", "user.email=history-preservation@users.noreply.github.com",
        "commit-tree", tree, ...parents.flatMap(value => ["-p", value])],
      { input: `Preserve ${dayKey} ${stage} run ${runId}/${attempt}\n` }).trim();
      try {
        // A normal fast-forward push. Concurrent writers cause a retry, never a force push.
        git(root, ["push", "--quiet", remote, `${commit}:refs/heads/${HISTORY_ARCHIVE_BRANCH}`]);
        const durableRef = remoteArchive(root, remote);
        const verified = verifyHistoryCheckpoint({ root, ref: durableRef, manifestPath });
        if (verified.fingerprint !== fingerprint) throw new Error("history_checkpoint_identity_conflict");
        return { ok: true, reused: false, archiveCommit: commit, manifestPath, fileCount: files.length };
      } catch (error) { lastError = error; }
    }
    throw lastError || new Error("history_checkpoint_not_durable");
  } finally { fs.rmSync(captureDir, { recursive: true, force: true }); }
  });
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
  if (sha256(Buffer.from(JSON.stringify(identity))) !== manifest.fingerprint) throw new Error("history_manifest_hash_mismatch");
  // Search only relevant content-addressed bucket trees, not the complete
  // growing archive; bound the output of each Git command as well.
  const expected = new Map();
  const seen = new Set();
  for (const file of manifest.files) {
    if (!isHistoryEvidencePath(file.path) || seen.has(file.path)) throw new Error("history_manifest_unsafe_data_path");
    seen.add(file.path);
    if (!Array.isArray(file.chunks) || !file.chunks.length) throw new Error("history_manifest_chunks_missing");
    for (const chunk of file.chunks) {
      if (!/^[0-9a-f]{64}$/u.test(String(chunk?.sha256 || "")) ||
          !/^[0-9a-f]{40,64}$/u.test(String(chunk?.oid || ""))) {
        throw new Error("history_archive_blob_binding_invalid");
      }
      const name = `blobs/${chunk.sha256.slice(0, 2)}/${chunk.sha256}`;
      const prior = expected.get(name);
      if (prior !== undefined && prior !== chunk.oid) throw new Error("history_archive_duplicate_blob_binding");
      expected.set(name, chunk.oid);
    }
  }
  const found = new Set();
  const prefixes = [...new Set([...expected.keys()].map(name => name.slice(6, 8)))].sort();
  for (const prefix of prefixes) {
    scanGitDelimited(root, ["ls-tree", "-r", "-z", ref, "--", `blobs/${prefix}`], row => {
      const tab = row.indexOf("\t");
      if (tab < 0) throw new Error("history_archive_tree_row_invalid");
      const name = row.slice(tab + 1);
      const wanted = expected.get(name);
      if (wanted === undefined) return;
      const actual = row.slice(0, tab).split(" ")[2];
      if (actual !== wanted) throw new Error(`history_archive_file_missing:${name}`);
      found.add(name);
    });
  }
  for (const name of expected.keys()) {
    if (!found.has(name)) throw new Error(`history_archive_file_missing:${name}`);
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
  const candidates = full ? filesUnder(root) : [];
  if (!full) {
    for (const args of [
      ["diff", "--name-only", "--no-renames", "-z", baselineCommit, "--", "data"],
      ["ls-files", "--others", "--exclude-standard", "-z", "--", "data"],
      ["ls-files", "--others", "--ignored", "--exclude-standard", "-z", "--", "data"]
    ]) {
      scanGitDelimited(root, args, name => candidates.push(name));
    }
  }
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
