import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createCheckpoint, digest } from "./daily-resume-contract.mjs";

function invariant(ok, message) { if (!ok) throw Error(message); }
function safeRel(p) {
  invariant(typeof p === "string" && p.length > 0 && !p.startsWith("/") &&
    !p.includes("\\") && !p.includes("\0") &&
    p.split("/").every(x => x && x !== "." && x !== ".."), "resume_archive_path_invalid");
  return p;
}
function fileExact(base, relative) {
  let cur = path.resolve(base);
  for (const part of safeRel(relative).split("/")) {
    cur = path.join(cur, part);
    invariant(!fs.lstatSync(cur).isSymbolicLink(), "resume_archive_symlink_forbidden");
  }
  invariant(fs.statSync(cur).isFile(), "resume_archive_not_regular_file");
  return cur;
}
function bytesAt(root, relative) { return fs.readFileSync(fileExact(root, relative)); }
function archiveBase(storeRoot, dayKey, stageId) {
  invariant(/^\d{4}-\d{2}-\d{2}$/.test(dayKey) && /^[a-z][a-z0-9-]{0,63}$/.test(stageId),
    "resume_archive_identity_invalid");
  return path.join(path.resolve(storeRoot), dayKey, stageId);
}
function assertInventory(entries) {
  invariant(Array.isArray(entries) && entries.length > 0, "resume_archive_inventory_invalid");
  for (const e of entries) invariant(e && safeRel(e.path) &&
    Number.isSafeInteger(e.bytes) && e.bytes >= 0 && /^[0-9a-f]{64}$/.test(e.sha256),
    "resume_archive_inventory_invalid");
  invariant(new Set(entries.map(x => x.path)).size === entries.length, "resume_archive_duplicate_output");
}
function checkRecord(cp, stage, binding, deps) {
  invariant(cp?.schema === "ai-matchlab.daily-stage-checkpoint.v1" && cp.stageId === stage.id &&
    cp.dayKey === binding.dayKey && cp.producerCommit === binding.producerCommit &&
    cp.contractSha256 === binding.contractSha256, "resume_archive_binding_mismatch");
  invariant(Object.keys(cp.dependencies || {}).length === stage.dependsOn.length &&
    stage.dependsOn.every(id => cp.dependencies[id] === deps[id]), "resume_archive_dependencies_changed");
  const { evidenceSha256, ...body } = cp;
  invariant(digest(Buffer.from(JSON.stringify(body), "utf8")) === evidenceSha256,
    "resume_archive_evidence_invalid");
  invariant(JSON.stringify(cp.inputs.map(x => x.path).sort()) === JSON.stringify([...stage.inputs].sort()) &&
    JSON.stringify(cp.outputs.map(x => x.path).sort()) === JSON.stringify([...stage.outputs].sort()),
    "resume_archive_stage_inventory_changed");
  assertInventory(cp.inputs); assertInventory(cp.outputs);
}
export function archiveStage(stage, binding, dependencies, storeRoot) {
  const checkpoint = createCheckpoint(stage, binding, dependencies);
  const parent = archiveBase(storeRoot, binding.dayKey, stage.id);
  fs.mkdirSync(parent, { recursive: true });
  const folder = path.join(parent, checkpoint.evidenceSha256);
  if (fs.existsSync(folder)) {
    const verified = verifyArchive(stage, binding, dependencies, storeRoot, checkpoint.evidenceSha256);
    invariant(verified.ok, "resume_archive_existing_mismatch");
    return { folder, checkpoint, reusedExistingArchive: true };
  }
  const temp = fs.mkdtempSync(path.join(parent, ".incomplete-"));
  try {
    for (const output of checkpoint.outputs) {
      const bytes = bytesAt(binding.root, output.path);
      invariant(bytes.length === output.bytes && digest(bytes) === output.sha256,
        "resume_archive_source_changed");
      const target = path.join(temp, "outputs", output.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes, { flag: "wx", mode: 0o600 });
    }
    const document = Buffer.from(`${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
    fs.writeFileSync(path.join(temp, "manifest.json"), document, { flag: "wx", mode: 0o600 });
    fs.renameSync(temp, folder);
    return { folder, checkpoint, reusedExistingArchive: false };
  } finally { if (fs.existsSync(temp)) fs.rmSync(temp, { recursive: true, force: true }); }
}
export function verifyArchive(stage, binding, dependencies, storeRoot, evidenceSha256) {
  try {
    invariant(/^[a-f0-9]{64}$/.test(evidenceSha256), "resume_archive_id_invalid");
    const folder = path.join(archiveBase(storeRoot, binding.dayKey, stage.id), evidenceSha256);
    const cp = JSON.parse(bytesAt(folder, "manifest.json").toString("utf8"));
    checkRecord(cp, stage, binding, dependencies);
    invariant(cp.evidenceSha256 === evidenceSha256, "resume_archive_id_mismatch");
    for (const entry of cp.inputs) {
      const bytes = bytesAt(binding.root, entry.path);
      invariant(bytes.length === entry.bytes && digest(bytes) === entry.sha256,
        "resume_archive_input_changed");
    }
    for (const entry of cp.outputs) {
      const bytes = bytesAt(folder, `outputs/${entry.path}`);
      invariant(bytes.length === entry.bytes && digest(bytes) === entry.sha256,
        "resume_archive_output_changed");
    }
    return { ok: true, checkpoint: cp, folder };
  } catch (error) { return { ok: false, reason: error.message }; }
}
// Materializes only into a fresh staging directory; never writes into production data paths.
export function stageArchive(stage, binding, dependencies, storeRoot, evidenceSha256, stagingParent = os.tmpdir()) {
  const checked = verifyArchive(stage, binding, dependencies, storeRoot, evidenceSha256);
  invariant(checked.ok, `resume_archive_not_verified:${checked.reason}`);
  const staging = fs.mkdtempSync(path.join(stagingParent, "aiml-resume-stage-"));
  try {
    for (const entry of checked.checkpoint.outputs) {
      const bytes = bytesAt(checked.folder, `outputs/${entry.path}`);
      const dest = path.join(staging, entry.path);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, bytes, { flag: "wx", mode: 0o600 });
    }
    return { staging, checkpoint: checked.checkpoint };
  } catch (error) { fs.rmSync(staging, { recursive: true, force: true }); throw error; }
}
