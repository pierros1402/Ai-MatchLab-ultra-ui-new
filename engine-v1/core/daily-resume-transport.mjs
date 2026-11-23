import fs from "node:fs";
import path from "node:path";
import { archiveStage, verifyArchive, stageArchive } from "./daily-resume-artifact-store.mjs";
import { digest } from "./daily-resume-contract.mjs";

export const TRANSPORT_SCHEMA = "ai-matchlab.daily-resume-transport.v1";
const HEX64 = /^[a-f0-9]{64}$/;
const SHA40 = /^[a-f0-9]{40}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const STAGE = /^[a-z][a-z0-9-]{0,63}$/;
function ensure(condition, reason) { if (!condition) throw Error(reason); }
function safeRelative(name) {
  ensure(typeof name === "string" && name.length > 0 && name.length < 512 &&
    !name.startsWith("/") && !name.includes("\\") && !name.includes("\0") &&
    name.split("/").every(part => part && part !== "." && part !== ".."),
    "resume_transport_unsafe_path");
  return name;
}
function exactFile(root, relative) {
  let node = path.resolve(root);
  for (const part of safeRelative(relative).split("/")) {
    node = path.join(node, part);
    const stat = fs.lstatSync(node);
    ensure(!stat.isSymbolicLink(), "resume_transport_symlink");
  }
  ensure(fs.statSync(node).isFile(), "resume_transport_not_file");
  return node;
}
function read(root, relative) { return fs.readFileSync(exactFile(root, relative)); }
function custodyValid(custody) {
  ensure(custody && /^[1-9][0-9]{0,18}$/.test(String(custody.runId)) &&
    Number.isSafeInteger(Number(custody.runId)) &&
    Number.isSafeInteger(Number(custody.attempt)) && Number(custody.attempt) > 0 &&
    typeof custody.repository === "string" &&
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(custody.repository) &&
    SHA40.test(custody.producerCommit) &&
    DAY.test(custody.dayKey) && STAGE.test(custody.stageId),
    "resume_transport_custody_invalid");
  return {
    repository: custody.repository,
    runId: String(custody.runId),
    attempt: Number(custody.attempt),
    producerCommit: custody.producerCommit,
    dayKey: custody.dayKey,
    stageId: custody.stageId
  };
}
function fileInventory(root) {
  const found = [];
  const walk = (location, relative = "") => {
    for (const item of fs.readdirSync(location, { withFileTypes: true })) {
      const rel = relative ? relative + "/" + item.name : item.name;
      safeRelative(rel);
      const full = path.join(location, item.name);
      const st = fs.lstatSync(full);
      ensure(!st.isSymbolicLink(), "resume_transport_symlink");
      if (st.isDirectory()) walk(full, rel);
      else {
        ensure(st.isFile(), "resume_transport_special_file");
        const bytes = fs.readFileSync(full);
        found.push({ path: rel, bytes: bytes.length, sha256: digest(bytes) });
      }
    }
  };
  walk(root);
  return found.sort((a, b) => a.path.localeCompare(b.path, "en"));
}
function checkedInventory(inventory) {
  ensure(Array.isArray(inventory) && inventory.length > 0 && inventory.length <= 5000,
    "resume_transport_inventory_invalid");
  const names = new Set();
  for (const e of inventory) {
    safeRelative(e?.path);
    ensure(!names.has(e.path) && Number.isSafeInteger(e.bytes) && e.bytes >= 0 &&
      HEX64.test(e.sha256), "resume_transport_inventory_invalid");
    names.add(e.path);
  }
  return inventory;
}
function archiveFolder(bundle, binding, stage, digestId) {
  return path.join(bundle, "store", binding.dayKey, stage.id, digestId);
}
export function packResumeTransport({ stage, binding, dependencies = {}, storeRoot, bundleRoot, custody }) {
  const bound = custodyValid(custody);
  ensure(bound.dayKey === binding.dayKey && bound.stageId === stage.id &&
    bound.producerCommit === binding.producerCommit, "resume_transport_source_mismatch");
  ensure(!fs.existsSync(bundleRoot), "resume_transport_bundle_exists");
  const archive = archiveStage(stage, binding, dependencies, storeRoot);
  const target = archiveFolder(bundleRoot, binding, stage, archive.checkpoint.evidenceSha256);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(archive.folder, target, { recursive: true, dereference: false, errorOnExist: true });
  const sourceInventory = fileInventory(bundleRoot);
  const document = {
    schema: TRANSPORT_SCHEMA,
    custody: bound,
    checkpointSha256: archive.checkpoint.evidenceSha256,
    files: sourceInventory
  };
  fs.writeFileSync(path.join(bundleRoot, "transport.json"), JSON.stringify(document, null, 2) + "\n", { flag: "wx", mode: 0o600 });
  return { bundleRoot, checkpointSha256: archive.checkpoint.evidenceSha256, count: sourceInventory.length };
}
export function verifyResumeTransport({ stage, binding, dependencies = {}, bundleRoot, expectedCustody }) {
  try {
    const expected = custodyValid(expectedCustody);
    const doc = JSON.parse(read(bundleRoot, "transport.json").toString("utf8"));
    ensure(doc?.schema === TRANSPORT_SCHEMA &&
      JSON.stringify(doc.custody) === JSON.stringify(expected) &&
      doc.custody.dayKey === binding.dayKey && doc.custody.stageId === stage.id &&
      doc.custody.producerCommit === binding.producerCommit &&
      HEX64.test(doc.checkpointSha256),
      "resume_transport_custody_mismatch");
    checkedInventory(doc.files);
    const actual = fileInventory(bundleRoot).filter(e => e.path !== "transport.json");
    ensure(JSON.stringify(actual) === JSON.stringify(doc.files), "resume_transport_integrity_invalid");
    const archive = verifyArchive(stage, binding, dependencies,
      path.join(bundleRoot, "store"), doc.checkpointSha256);
    ensure(archive.ok, "resume_transport_archive_invalid:" + archive.reason);
    const relative = path.relative(bundleRoot, archive.folder).split(path.sep).join("/");
    ensure(relative === `store/${binding.dayKey}/${stage.id}/${doc.checkpointSha256}`,
      "resume_transport_archive_path_mismatch");
    return { ok: true, checkpointSha256: doc.checkpointSha256, custody: expected, count: actual.length };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
}
// No implicit production restore: independently verify and only stage elsewhere.
export function stageResumeTransport({ stage, binding, dependencies = {}, bundleRoot, expectedCustody, stagingParent }) {
  const verified = verifyResumeTransport({ stage, binding, dependencies, bundleRoot, expectedCustody });
  ensure(verified.ok, "resume_transport_not_verified:" + verified.reason);
  return stageArchive(stage, binding, dependencies, path.join(bundleRoot, "store"),
    verified.checkpointSha256, stagingParent);
}
