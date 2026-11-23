import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

export const DELTA_SCHEMA = "ai-matchlab.daily-resume-worktree-delta.v1";
function check(ok, code) { if (!ok) throw Error(code); }
function digest(bytes) { return crypto.createHash("sha256").update(bytes).digest("hex"); }
function git(root, ...args) {
  return execFileSync("git", args, { cwd: root, encoding: "buffer", maxBuffer: 32 * 1024 * 1024 });
}
function gitHead(root) { return git(root, "rev-parse", "HEAD").toString("utf8").trim(); }
function relative(p) {
  check(typeof p === "string" && p.length > 0 && p.length < 512 &&
    !p.includes("\\") && !p.startsWith("/") && !p.includes("\0") &&
    p.split("/").every(x => x && x !== "." && x !== ".." && x !== ".git"),
    "resume_delta_unsafe_path");
  return p;
}
function normalFile(root, p) {
  let node = path.resolve(root);
  for (const segment of relative(p).split("/")) {
    node = path.join(node, segment);
    check(!fs.lstatSync(node).isSymbolicLink(), "resume_delta_symlink_forbidden");
  }
  check(fs.statSync(node).isFile(), "resume_delta_nonfile_forbidden");
  return node;
}
function allowed(p, prefixes) {
  check(Array.isArray(prefixes) && prefixes.length > 0 && new Set(prefixes).size === prefixes.length,
    "resume_delta_allowlist_invalid");
  for (const prefix of prefixes) check(prefix.endsWith("/") && relative(prefix.slice(0, -1)), "resume_delta_allowlist_invalid");
  check(prefixes.some(prefix => p.startsWith(prefix)), "resume_delta_unapproved_path:" + p);
}
function zeroList(bytes) { return bytes.toString("utf8").split("\0").filter(Boolean); }
function state(root, prefixes) {
  const tracked = zeroList(git(root, "diff", "--no-renames", "--name-status", "-z", "HEAD", "--"));
  const mutations = new Map();
  for (let i = 0; i < tracked.length; i += 2) {
    const status = tracked[i];
    const name = relative(tracked[i + 1]);
    allowed(name, prefixes);
    check(["M", "A", "D"].includes(status), "resume_delta_unsupported_git_status:" + status);
    check(!mutations.has(name), "resume_delta_duplicate_path");
    mutations.set(name, status === "D" ? "DELETE" : "WRITE");
  }
  for (const name of zeroList(git(root, "ls-files", "--others", "--exclude-standard", "-z", "--"))) {
    relative(name); allowed(name, prefixes);
    check(!mutations.has(name), "resume_delta_duplicate_path");
    mutations.set(name, "WRITE");
  }
  check(mutations.size > 0 && mutations.size <= 10000, "resume_delta_path_count_invalid");
  let totalBytes = 0;
  const entries = [...mutations].sort(([a], [b]) => a.localeCompare(b, "en")).map(([name, op]) => {
    if (op === "DELETE") {
      check(!fs.existsSync(path.join(root, name)), "resume_delta_delete_not_absent");
      return { path: name, op };
    }
    const bytes = fs.readFileSync(normalFile(root, name));
    totalBytes += bytes.length;
    check(totalBytes <= 512 * 1024 * 1024, "resume_delta_total_size_exceeded");
    return { path: name, op, bytes: bytes.length, sha256: digest(bytes) };
  });
  return entries;
}
function binding(options) {
  check(options && /^[0-9a-f]{40}$/.test(options.baseCommit) &&
    /^\d{4}-\d{2}-\d{2}$/.test(options.dayKey) &&
    /^[a-z][a-z0-9-]{0,63}$/.test(options.stageId),
    "resume_delta_binding_invalid");
}
function envelope(options, entries) {
  return { schema: DELTA_SCHEMA, dayKey: options.dayKey, stageId: options.stageId,
    baseCommit: options.baseCommit, allowedPrefixes: [...options.allowedPrefixes],
    entries };
}
function verifyArchive(archiveRoot, expected) {
  check(fs.existsSync(archiveRoot), "resume_delta_archive_missing");
  const document = JSON.parse(fs.readFileSync(normalFile(archiveRoot, "manifest.json"), "utf8"));
  check(document?.schema === DELTA_SCHEMA && document.dayKey === expected.dayKey &&
    document.stageId === expected.stageId && document.baseCommit === expected.baseCommit &&
    JSON.stringify(document.allowedPrefixes) === JSON.stringify(expected.allowedPrefixes),
    "resume_delta_binding_mismatch");
  check(Array.isArray(document.entries) && document.entries.length > 0 && document.entries.length <= 10000,
    "resume_delta_manifest_invalid");
  const { evidenceSha256, ...body } = document;
  check(/^[0-9a-f]{64}$/.test(evidenceSha256) &&
    evidenceSha256 === digest(Buffer.from(JSON.stringify(body))), "resume_delta_evidence_invalid");
  let total = 0; const seen = new Set();
  for (const e of document.entries) {
    relative(e.path); allowed(e.path, expected.allowedPrefixes);
    check(!seen.has(e.path) && (e.op === "DELETE" || e.op === "WRITE"), "resume_delta_manifest_invalid");
    seen.add(e.path);
    if (e.op === "WRITE") {
      check(Number.isSafeInteger(e.bytes) && e.bytes >= 0 && /^[0-9a-f]{64}$/.test(e.sha256),
        "resume_delta_file_record_invalid");
      const bytes = fs.readFileSync(normalFile(archiveRoot, "files/" + e.path));
      total += bytes.length;
      check(total <= 512 * 1024 * 1024 && bytes.length === e.bytes && digest(bytes) === e.sha256,
        "resume_delta_archive_bytes_invalid");
    } else check(e.bytes === undefined && e.sha256 === undefined, "resume_delta_tombstone_invalid");
  }
  const listed = [];
  const walk = (dir, rel = "") => {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir)) {
      const p = rel ? rel + "/" + item : item;
      const abs = path.join(dir, item);
      const st = fs.lstatSync(abs);
      check(!st.isSymbolicLink(), "resume_delta_archive_symlink");
      if (st.isDirectory()) walk(abs, p);
      else {
        check(st.isFile(), "resume_delta_archive_nonfile");
        listed.push(p);
      }
    }
  };
  walk(path.join(archiveRoot, "files"));
  check(JSON.stringify(listed.sort()) === JSON.stringify(document.entries.filter(x => x.op === "WRITE").map(x => x.path).sort()),
    "resume_delta_archive_file_set_invalid");
  return document;
}
export function captureDailyWorktreeDelta(repoRoot, archiveRoot, options) {
  binding(options);
  check(gitHead(repoRoot) === options.baseCommit, "resume_delta_base_mismatch");
  check(!fs.existsSync(archiveRoot), "resume_delta_archive_exists");
  const entries = state(repoRoot, options.allowedPrefixes);
  const body = envelope(options, entries);
  const manifest = { ...body, evidenceSha256: digest(Buffer.from(JSON.stringify(body))) };
  const parent = path.dirname(archiveRoot);
  fs.mkdirSync(parent, { recursive: true });
  const temporary = fs.mkdtempSync(path.join(parent, ".delta-incomplete-"));
  try {
    for (const e of entries.filter(x => x.op === "WRITE")) {
      const bytes = fs.readFileSync(normalFile(repoRoot, e.path));
      check(bytes.length === e.bytes && digest(bytes) === e.sha256, "resume_delta_source_changed");
      const target = path.join(temporary, "files", e.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes, { flag: "wx", mode: 0o600 });
    }
    fs.writeFileSync(path.join(temporary, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
    verifyArchive(temporary, options);
    fs.renameSync(temporary, archiveRoot);
    return { archiveRoot, checkpointSha256: manifest.evidenceSha256, files: entries.length,
      writes: entries.filter(x => x.op === "WRITE").length, deletions: entries.filter(x => x.op === "DELETE").length };
  } finally { if (fs.existsSync(temporary)) fs.rmSync(temporary, { recursive: true, force: true }); }
}
export function inspectDailyWorktreeDelta(archiveRoot, options) {
  try { binding(options); const doc = verifyArchive(archiveRoot, options);
    return { ok: true, checkpointSha256: doc.evidenceSha256, entries: doc.entries.length };
  } catch (error) { return { ok: false, reason: error.message }; }
}
// Copies the pinned *committed* tree to a new temporary Git clone before replay.
// Never applies changes to the producer workspace or the source repository.
export function replayDailyWorktreeDeltaToIsolatedClone(sourceRepoRoot, archiveRoot, options, parent = os.tmpdir()) {
  binding(options);
  check(gitHead(sourceRepoRoot) === options.baseCommit, "resume_delta_base_mismatch");
  const doc = verifyArchive(archiveRoot, options);
  const destination = fs.mkdtempSync(path.join(parent, "aiml-resume-delta-clone-"));
  try {
    fs.rmSync(destination, { recursive: true, force: true });
    execFileSync("git", ["clone", "--quiet", "--no-hardlinks", "--", path.resolve(sourceRepoRoot), destination],
      { encoding: "buffer", maxBuffer: 32 * 1024 * 1024 });
    check(gitHead(destination) === options.baseCommit, "resume_delta_cloned_base_mismatch");
    check(git(destination, "status", "--porcelain", "-z").length === 0, "resume_delta_clone_not_clean");
    for (const e of doc.entries) {
      const target = path.join(destination, e.path);
      if (e.op === "DELETE") {
        check(fs.existsSync(target), "resume_delta_missing_deletion_target");
        fs.rmSync(target);
      } else {
        const bytes = fs.readFileSync(normalFile(archiveRoot, "files/" + e.path));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        if (fs.existsSync(target)) check(!fs.lstatSync(target).isSymbolicLink(), "resume_delta_target_symlink");
        fs.writeFileSync(target, bytes);
      }
    }
    check(JSON.stringify(state(destination, options.allowedPrefixes)) === JSON.stringify(doc.entries),
      "resume_delta_replay_not_exact");
    return { stagingClone: destination, checkpointSha256: doc.evidenceSha256 };
  } catch (error) { fs.rmSync(destination, { recursive: true, force: true }); throw error; }
}
