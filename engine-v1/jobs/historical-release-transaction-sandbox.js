import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const hash = file => crypto.createHash("sha256")
  .update(fs.readFileSync(file)).digest("hex");

const frozen = new Set([
  "value.json",
  "value-audit.json",
  "plan-c-shadow.json",
  "plan-c-shadow-audit.json"
]);

function assertSandboxPath(folder) {
  const real = fs.realpathSync(folder);
  const temp = fs.realpathSync(os.tmpdir());
  const relative = path.relative(temp, real);

  if (!relative ||
      relative.startsWith("..") ||
      path.isAbsolute(relative)) {
    throw Error("transaction_outside_sandbox");
  }

  return real;
}

function inventory(root) {
  const result = new Map();

  function walk(folder, prefix = "") {
    for (const entry of fs.readdirSync(folder, {
      withFileTypes: true
    })) {
      const relative = prefix
        ? prefix + "/" + entry.name
        : entry.name;
      const absolute = path.join(folder, entry.name);

      if (entry.isSymbolicLink()) {
        throw Error("transaction_symlink_forbidden");
      }

      if (entry.isDirectory()) {
        walk(absolute, relative);
      } else if (entry.isFile()) {
        result.set(relative, hash(absolute));
      } else {
        throw Error("transaction_unsupported_entry");
      }
    }
  }

  walk(root);
  return result;
}

function equal(a, b) {
  if (a.size !== b.size) return false;
  for (const [key, value] of a) {
    if (b.get(key) !== value) return false;
  }
  return true;
}

function verifyScope(before, after) {
  if (before.size !== after.size) {
    throw Error("transaction_file_inventory_changed");
  }

  const changes = [];

  for (const [name, digest] of before) {
    if (!after.has(name)) {
      throw Error("transaction_file_removed:" + name);
    }

    if (after.get(name) === digest) continue;

    if (frozen.has(name)) {
      throw Error("transaction_frozen_artifact_changed:" + name);
    }

    if (name !== "manifest.json" &&
        name !== "fixtures.json" &&
        !/^details\/[A-Za-z0-9_-]+\.json$/.test(name)) {
      throw Error("transaction_change_outside_scope:" + name);
    }

    changes.push(name);
  }

  if (!changes.includes("fixtures.json") ||
      !changes.includes("manifest.json")) {
    throw Error("transaction_required_changes_missing");
  }

  return changes.sort();
}

export function promoteHistoricalReleaseSandbox({
  targetDir,
  stageDir,
  expectedTargetInventory,
  injectFailureAt = null
}) {
  const target = assertSandboxPath(targetDir);
  const stage = assertSandboxPath(stageDir);

  if (target === stage ||
      target.startsWith(stage + path.sep) ||
      stage.startsWith(target + path.sep)) {
    throw Error("transaction_roots_overlap");
  }

  if (path.dirname(target) !== path.dirname(stage)) {
    throw Error("transaction_same_parent_required");
  }

  if (!(expectedTargetInventory instanceof Map)) {
    throw Error("transaction_expected_inventory_required");
  }

  const before = inventory(target);
  if (!equal(before, expectedTargetInventory)) {
    throw Error("transaction_preimage_drift");
  }

  const staged = inventory(stage);
  const changes = verifyScope(before, staged);

  const backup = target + ".rollback-" + crypto.randomUUID();
  let targetMoved = false;
  let stageMoved = false;

  try {
    fs.renameSync(target, backup);
    targetMoved = true;

    if (injectFailureAt === "after_backup") {
      throw Error("injected_after_backup");
    }

    fs.renameSync(stage, target);
    stageMoved = true;

    if (injectFailureAt === "after_promote") {
      throw Error("injected_after_promote");
    }

    if (!equal(inventory(target), staged)) {
      throw Error("transaction_postimage_mismatch");
    }

    fs.rmSync(backup, { recursive: true, force: false });

    return {
      ok: true,
      changedFiles: changes,
      fileCount: staged.size,
      rollbackRequired: false,
      sandboxOnly: true
    };
  } catch (error) {
    try {
      if (stageMoved) {
        fs.renameSync(target, stage);
        stageMoved = false;
      }

      if (targetMoved) {
        fs.renameSync(backup, target);
        targetMoved = false;
      }

      if (!equal(inventory(target), before)) {
        throw Error("transaction_rollback_hash_mismatch");
      }
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "transaction_recovery_required"
      );
    }

    throw error;
  }
}

export function snapshotSandboxInventory(folder) {
  return inventory(assertSandboxPath(folder));
}