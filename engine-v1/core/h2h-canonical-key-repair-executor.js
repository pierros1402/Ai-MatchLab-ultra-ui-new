import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { computeH2HInventoryHash, buildH2HCanonicalKeyAudit } from "../jobs/audit-h2h-canonical-key-integrity.js";

export const H2H_REPAIR_EXECUTION_SCHEMA = "ai-matchlab.h2h-canonical-key-repair-execution.v1";
export const H2H_REPAIR_EXECUTION_POLICY = "h2h-canonical-key-repair-execution-policy-v1";

export function sha256Buffer(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

export function sha256File(filePath) {
  return sha256Buffer(fs.readFileSync(filePath));
}

export function canonicalJsonBytes(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function listJsonNames(dirPath) {
  return fs.readdirSync(dirPath)
    .filter(name => name.endsWith(".json") && !name.startsWith("_"))
    .sort();
}

export function computeProjectedInventoryHash(h2hDir, actions) {
  const renameMap = new Map(actions.map(action => [action.sourceFileName, action.targetFileName]));
  const projectedNames = [];
  const buffers = new Map();
  for (const name of listJsonNames(h2hDir)) {
    const projected = renameMap.get(name) || name;
    if (buffers.has(projected)) throw new Error(`projected_target_collision:${projected}`);
    buffers.set(projected, fs.readFileSync(path.join(h2hDir, name)));
    projectedNames.push(projected);
  }
  projectedNames.sort();
  const hash = crypto.createHash("sha256");
  let bytes = 0;
  for (const name of projectedNames) {
    const buffer = buffers.get(name);
    bytes += buffer.length;
    hash.update(name, "utf8");
    hash.update("\0", "utf8");
    hash.update(buffer);
    hash.update("\0", "utf8");
  }
  return { sha256: hash.digest("hex"), fileCount: projectedNames.length, bytes };
}

export function validateH2HRepairPlan({ h2hDir, plan, expectedInventorySha256 = null }) {
  if (plan?.schema !== "ai-matchlab.h2h-canonical-key-repair-plan.v1") throw new Error("unexpected_plan_schema");
  if (plan?.status !== "ready_for_separate_hash_verified_executor" || plan?.readyToApply !== true) throw new Error("plan_not_ready");
  if (Number(plan?.summary?.blockedActions) !== 0 || (plan?.blocked || []).length !== 0) throw new Error("plan_contains_blocked_actions");
  const actions = Array.isArray(plan?.actions) ? plan.actions : [];
  if (!actions.length) throw new Error("plan_has_no_actions");
  const inventory = computeH2HInventoryHash(h2hDir);
  const lockedInventory = String(expectedInventorySha256 || plan?.sourceAudit?.inventory?.sha256 || "").toLowerCase();
  if (!lockedInventory || inventory.sha256 !== lockedInventory) throw new Error("inventory_hash_mismatch");

  const seenSources = new Set();
  const seenTargets = new Set();
  for (const action of actions) {
    if (action?.blocked !== false || action?.status !== "planned_not_applied" || action?.confidence !== "deterministic") throw new Error(`unsafe_action:${action?.actionId || "unknown"}`);
    if (action?.actionType !== "rename_h2h_file_to_canonical_key") throw new Error(`unexpected_action_type:${action?.actionId || "unknown"}`);
    if (action?.payloadRewriteRequired !== false || action?.automaticApplyAllowed !== false) throw new Error(`unsafe_action_contract:${action?.actionId || "unknown"}`);
    const sourceName = String(action.sourceFileName || "");
    const targetName = String(action.targetFileName || "");
    if (!sourceName || !targetName || sourceName === targetName) throw new Error(`invalid_action_paths:${action?.actionId || "unknown"}`);
    if (seenSources.has(sourceName) || seenTargets.has(targetName)) throw new Error("duplicate_plan_path");
    seenSources.add(sourceName); seenTargets.add(targetName);
    const sourcePath = path.join(h2hDir, sourceName);
    const targetPath = path.join(h2hDir, targetName);
    if (!fs.existsSync(sourcePath)) throw new Error(`source_missing:${sourceName}`);
    if (fs.existsSync(targetPath)) throw new Error(`target_exists:${targetName}`);
    const buffer = fs.readFileSync(sourcePath);
    if (sha256Buffer(buffer) !== String(action.sourceSha256 || "").toLowerCase()) throw new Error(`source_hash_mismatch:${sourceName}`);
    if (buffer.length !== Number(action.sourceBytes)) throw new Error(`source_size_mismatch:${sourceName}`);
  }

  const projected = computeProjectedInventoryHash(h2hDir, actions);
  if (projected.fileCount !== inventory.fileCount || projected.bytes !== inventory.bytes) throw new Error("projected_inventory_size_changed");
  return { inventory, projected, actions };
}

function backupNameFor(action, stamp) {
  const safe = action.sourceFileName.replace(/[^a-zA-Z0-9._~-]+/g, "_");
  return `${safe}.before-h2h-canonical-key-repair.${stamp}.${String(action.sourceSha256).slice(0, 12)}.json`;
}

export function applyH2HRepairPlan({ h2hDir, plan, backupDir, expectedInventorySha256, expectedOutputSha256, forcePostAuditFailure = false }) {
  const validated = validateH2HRepairPlan({ h2hDir, plan, expectedInventorySha256 });
  if (!backupDir) throw new Error("backup_dir_required");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backups = [];
  const applied = [];
  try {
    for (const action of validated.actions) {
      const sourcePath = path.join(h2hDir, action.sourceFileName);
      const targetPath = path.join(h2hDir, action.targetFileName);
      const backupPath = path.join(backupDir, backupNameFor(action, stamp));
      fs.copyFileSync(sourcePath, backupPath, fs.constants.COPYFILE_EXCL);
      const backupHash = sha256File(backupPath);
      if (backupHash !== String(action.sourceSha256).toLowerCase()) throw new Error(`backup_hash_mismatch:${action.sourceFileName}`);
      backups.push({ sourcePath, targetPath, backupPath, sourceSha256: action.sourceSha256, backupSha256: backupHash, bytes: fs.statSync(backupPath).size });
    }
    for (const action of validated.actions) {
      const sourcePath = path.join(h2hDir, action.sourceFileName);
      const targetPath = path.join(h2hDir, action.targetFileName);
      fs.renameSync(sourcePath, targetPath);
      applied.push({ sourcePath, targetPath });
    }
    if (forcePostAuditFailure) throw new Error("forced_post_audit_failure");
    const postAudit = buildH2HCanonicalKeyAudit({ h2hDir, maxExamples: 30 });
    if (!postAudit.ok || !postAudit.clean) throw new Error("post_audit_not_clean");
    if (postAudit.summary.nonCanonicalFileNameCount !== 0 || postAudit.summary.policyDegradedPairKeyCount !== 0) throw new Error("post_audit_key_invariants_failed");
    const after = computeH2HInventoryHash(h2hDir);
    if (after.sha256 !== validated.projected.sha256) throw new Error("post_write_inventory_hash_mismatch");
    if (expectedOutputSha256 && after.sha256 !== String(expectedOutputSha256).toLowerCase()) throw new Error("expected_output_hash_mismatch");
    return { validated, backups, postAudit, outputInventory: after, rolledBack: false };
  } catch (error) {
    for (const item of [...applied].reverse()) {
      try {
        if (fs.existsSync(item.targetPath) && !fs.existsSync(item.sourcePath)) fs.renameSync(item.targetPath, item.sourcePath);
      } catch { /* final verification below exposes rollback failure */ }
    }
    const restored = computeH2HInventoryHash(h2hDir);
    if (restored.sha256 !== validated.inventory.sha256) {
      throw new Error(`rollback_failed:${error?.message || error}`);
    }
    error.rolledBack = true;
    error.backups = backups;
    throw error;
  }
}
