import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

const EXPECTED = Object.freeze({
  schema: "ai-matchlab.history-recovery-bundle.v1",
  dayKey: "2026-11-23",
  runId: "45137286904",
  attempt: 1,
  sourceCommit: "5133d9ff8623dd015c6578d89e34b7a5da0b12a0",
  baselineCommit: "33eaa635a8745e75fc0a6075a3594f4cd86d3b32",
  manifestSha256: "12c19ca0c9c97aca10c25fe62f3184ceaa02d87b5e9d66fa4340e0d5589ce1c0",
  files: 9083
});
function assert(ok, code) { if (!ok) throw Error(code); }
function sha(b) { return crypto.createHash("sha256").update(b).digest("hex"); }
function safeName(p) {
  assert(typeof p === "string" && p.startsWith("data/") &&
    p.length > 5 && p.length < 700 && !p.includes("\\") && !p.includes("\0") &&
    p.split("/").every(x => x && x !== "." && x !== ".."),
    "daily954_artifact_path_unsafe");
  return p;
}
function regularFile(root, p) {
  let current = path.resolve(root);
  for (const part of p.split("/")) {
    current = path.join(current, part);
    const st = fs.lstatSync(current);
    assert(!st.isSymbolicLink(), "daily954_artifact_symlink_forbidden");
  }
  assert(fs.statSync(current).isFile(), "daily954_artifact_nonregular_file");
  return current;
}
function checkExtractedFileSet(root, expected) {
  const all = new Set(["manifest.json"]);
  const walk = (folder, rel = "") => {
    for (const name of fs.readdirSync(folder)) {
      const relative = rel ? rel + "/" + name : name;
      const abs = path.join(folder, name);
      const stat = fs.lstatSync(abs);
      assert(!stat.isSymbolicLink(), "daily954_artifact_symlink_forbidden");
      if (stat.isDirectory()) walk(abs, relative);
      else {
        assert(stat.isFile(), "daily954_artifact_nonregular_file");
        all.add(relative);
      }
    }
  };
  walk(root);
  assert(all.size === expected.size &&
    [...all].every(name => expected.has(name)), "daily954_artifact_file_set_mismatch");
}
export function restoreDaily954EvidenceToScratch(extractedRoot, scratchRepo) {
  const manifestBytes = fs.readFileSync(regularFile(extractedRoot, "manifest.json"));
  assert(sha(manifestBytes) === EXPECTED.manifestSha256, "daily954_manifest_hash_mismatch");
  const doc = JSON.parse(manifestBytes.toString("utf8"));
  for (const key of ["schema","dayKey","runId","attempt","sourceCommit","baselineCommit"])
    assert(String(doc[key]) === String(EXPECTED[key]), "daily954_manifest_provenance_mismatch:" + key);
  assert(doc.purpose === "recovery_evidence_only" && doc.publicationApproved === false &&
    doc.scope === "changes_and_untracked_evidence" &&
    Array.isArray(doc.absentPaths) && doc.absentPaths.length === 0 &&
    Array.isArray(doc.files) && doc.files.length === EXPECTED.files,
    "daily954_recovery_scope_not_approved");
  const head = execFileSync("git", ["rev-parse", "HEAD"], {cwd:scratchRepo,encoding:"utf8"}).trim();
  assert(head === EXPECTED.sourceCommit, "daily954_scratch_source_commit_mismatch");
  const seen = new Set(["manifest.json"]);
  let bytesTotal = 0;
  for (const row of doc.files) {
    const name = safeName(row.path);
    assert(!seen.has(name), "daily954_duplicate_manifest_path");
    seen.add(name);
    const buffer = fs.readFileSync(regularFile(extractedRoot, name));
    bytesTotal += buffer.length;
    assert(buffer.length === row.bytes && sha(buffer) === row.sha256,
      "daily954_artifact_byte_hash_mismatch:" + name);
  }
  checkExtractedFileSet(extractedRoot, seen);
  // Extraction to a *new historical detached worktree only*. Never write the
  // producer or consumer production checkout, or commit/push these files.
  for (const row of doc.files) {
    const dest = path.join(scratchRepo, row.path);
    fs.mkdirSync(path.dirname(dest), {recursive:true});
    if (fs.existsSync(dest)) assert(!fs.lstatSync(dest).isSymbolicLink(),
      "daily954_scratch_symlink_forbidden");
    fs.copyFileSync(path.join(extractedRoot, row.path), dest);
  }
  return {
    schema: "ai-matchlab.daily954-recovery-sandbox-audit.v1",
    runId: EXPECTED.runId, sourceCommit: EXPECTED.sourceCommit,
    fileCount: doc.files.length, restoredBytes: bytesTotal,
    manifestSha256: EXPECTED.manifestSha256, publicationApproved: false,
    productionWrites: 0
  };
}
const invoked = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (invoked) {
  try {
    const [, , archiveDir, scratchRepo] = process.argv;
    assert(archiveDir && scratchRepo, "daily954_usage_extract_dir_and_scratch_repo");
    console.log("DAILY954_RECOVERY_ARTIFACT_PASS=" +
      JSON.stringify(restoreDaily954EvidenceToScratch(archiveDir, scratchRepo)));
  } catch (error) { console.error(error.stack || String(error)); process.exitCode=1; }
}
