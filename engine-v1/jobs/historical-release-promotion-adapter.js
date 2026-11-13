import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

const sha = file => crypto.createHash("sha256")
  .update(fs.readFileSync(file)).digest("hex");

const JOURNAL = ".historical-promotion-journal.json";
const LOCK = ".historical-promotion.lock";

const frozen = new Set([
  "value.json",
  "value-audit.json",
  "plan-c-shadow.json",
  "plan-c-shadow-audit.json"
]);

function assertTemporaryDirectory(folder) {
  const real = fs.realpathSync(folder);
  const temp = fs.realpathSync(os.tmpdir());
  const relative = path.relative(temp, real);

  if (!relative || relative.startsWith("..") ||
      path.isAbsolute(relative)) {
    throw Error("promotion_production_path_denied");
  }

  return real;
}

function assertChildName(name) {
  if (!/^[A-Za-z0-9_-]+$/u.test(String(name || ""))) {
    throw Error("promotion_invalid_child_name");
  }
  return name;
}

function inventory(folder) {
  const result = new Map();

  function scan(dir, prefix = "") {
    for (const entry of fs.readdirSync(dir, {
      withFileTypes: true
    })) {
      const relative = prefix
        ? prefix + "/" + entry.name : entry.name;
      const absolute = path.join(dir, entry.name);

      if (entry.isSymbolicLink()) {
        throw Error("promotion_symlink_denied:" + relative);
      }

      if (entry.isDirectory()) {
        scan(absolute, relative);
      } else if (entry.isFile()) {
        result.set(relative, sha(absolute));
      } else {
        throw Error("promotion_unsupported_entry:" + relative);
      }
    }
  }

  scan(folder);
  return result;
}

function equal(a, b) {
  return a.size === b.size &&
    [...a].every(([name, hash]) => b.get(name) === hash);
}

function toRows(map) {
  return [...map.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  );
}

function fromRows(rows) {
  if (!Array.isArray(rows) ||
      rows.some(x =>
        !Array.isArray(x) || x.length !== 2 ||
        !/^[A-Za-z0-9_./-]+$/u.test(x[0]) ||
        x[0].includes("..") ||
        !/^[a-f0-9]{64}$/u.test(x[1])
      )) {
    throw Error("promotion_journal_inventory_invalid");
  }

  const map = new Map(rows);
  if (map.size !== rows.length) {
    throw Error("promotion_journal_inventory_duplicate");
  }
  return map;
}

function verifyChangedFiles(before, staged) {
  if (before.size !== staged.size ||
      [...before.keys()].some(name => !staged.has(name))) {
    throw Error("promotion_inventory_membership_changed");
  }

  const changed = [];

  for (const [name, digest] of before) {
    if (staged.get(name) === digest) continue;

    if (frozen.has(name)) {
      throw Error("promotion_frozen_artifact_changed:" + name);
    }

    if (name !== "fixtures.json" &&
        name !== "manifest.json" &&
        !/^details\/[A-Za-z0-9_-]+\.json$/u.test(name)) {
      throw Error("promotion_unapproved_file_change:" + name);
    }

    changed.push(name);
  }

  if (!changed.includes("fixtures.json") ||
      !changed.includes("manifest.json")) {
    throw Error("promotion_required_changes_missing");
  }

  return changed.sort();
}


function syncDirectory(directory) {
  if (process.platform !== "linux") return;

  const fd = fs.openSync(directory, "r");
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function syncTree(folder) {
  // Windows sandbox compatibility is deliberately preserved.
  // Windows power-loss durability is NOT qualified.
  if (process.platform !== "linux") return;

  for (const entry of fs.readdirSync(folder, {
    withFileTypes: true
  })) {
    const file = path.join(folder, entry.name);

    if (entry.isSymbolicLink()) {
      throw Error("promotion_sync_symlink_denied");
    }

    if (entry.isDirectory()) {
      syncTree(file);
    } else if (entry.isFile()) {
      const fd = fs.openSync(file, "r");
      try {
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
    } else {
      throw Error("promotion_sync_unsupported_entry");
    }
  }

  syncDirectory(folder);
}

function durableRename(before, after) {
  fs.renameSync(before, after);

  syncDirectory(path.dirname(before));

  if (path.dirname(before) !== path.dirname(after)) {
    syncDirectory(path.dirname(after));
  }
}

function durableRemove(file, options) {
  fs.rmSync(file, options);
  syncDirectory(path.dirname(file));
}

function writeJournal(file, payload) {
  const temporary = file + ".tmp";
  const fd = fs.openSync(temporary, "wx");

  try {
    fs.writeFileSync(fd, JSON.stringify(payload, null, 2));
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }

  durableRename(temporary, file);
}

function replaceJournalState(file, journal, state) {
  const temporary = file + ".committed-" + crypto.randomUUID() + ".tmp";
  let fd = null;
  try {
    fd = fs.openSync(temporary, "wx");
    fs.writeFileSync(fd, JSON.stringify({
      ...journal,
      state
    }, null, 2));
    fs.fsyncSync(fd);
    fs.closeSync(fd);
    fd = null;
    durableRename(temporary, file);
  } finally {
    if (fd !== null) fs.closeSync(fd);
    if (fs.existsSync(temporary))
      durableRemove(temporary, { force: true });
  }
}

function context(parentDir, targetName, stageName) {
  const parent = assertTemporaryDirectory(parentDir);
  assertChildName(targetName);
  assertChildName(stageName);

  if (targetName === stageName) {
    throw Error("promotion_same_target_stage");
  }

  const target = path.join(parent, targetName);
  const stage = path.join(parent, stageName);

  return {
    parent,
    target,
    stage,
    lock: path.join(parent, LOCK),
    journal: path.join(parent, JOURNAL),
    recoveryClaim: path.join(parent, ".historical-recovery.claim")
  };
}


function readLinuxProcessIdentity(pid) {
  if (process.platform !== "linux") {
    throw Error("promotion_linux_identity_platform_invalid");
  }

  try {
    const bootId = fs.readFileSync(
      "/proc/sys/kernel/random/boot_id", "utf8"
    ).trim().toLowerCase();

    const stat = fs.readFileSync(
      "/proc/" + pid + "/stat", "utf8"
    ).trim();

    // Field 2 is (comm), potentially containing spaces.
    const end = stat.lastIndexOf(") ");
    if (end < 0) {
      throw Error("invalid_stat_boundary");
    }

    // The remaining fields begin at Linux stat field 3.
    // Field 22 (starttime) is therefore index 19.
    const fields = stat.slice(end + 2).trim().split(/\s+/u);
    const startTicks = fields[19];

    if (!/^[a-f0-9-]{36}$/u.test(bootId) ||
        !/^[0-9]+$/u.test(String(startTicks || ""))) {
      throw Error("invalid_linux_identity");
    }

    return {
      kind: "linux_proc_start_v1",
      bootId,
      startTicks
    };
  } catch {
    throw Error("promotion_linux_process_identity_unavailable");
  }
}

export function inspectHistoricalPromotionSandbox({
  parentDir,
  targetName = "target",
  stageName = "stage"
}) {
  const c = context(parentDir, targetName, stageName);
  const before = inventory(c.target);
  const staged = inventory(c.stage);
  const changed = verifyChangedFiles(before, staged);

  return {
    before,
    staged,
    changed,
    sandboxOnly: true
  };
}

export function promoteHistoricalReleaseGuardedSandbox({
  parentDir,
  targetName = "target",
  stageName = "stage",
  expectedTargetInventory,
  simulateCrashAt = null
}) {
  const c = context(parentDir, targetName, stageName);

  if (!(expectedTargetInventory instanceof Map)) {
    throw Error("promotion_expected_preimage_missing");
  }

  if (fs.existsSync(c.lock) || fs.existsSync(c.journal) ||
      fs.existsSync(c.recoveryClaim)) {
    throw Error("promotion_existing_transaction_requires_recovery");
  }

  const before = inventory(c.target);

  if (!equal(before, expectedTargetInventory)) {
    throw Error("promotion_preimage_drift");
  }

  const staged = inventory(c.stage);
  const changed = verifyChangedFiles(before, staged);

  const backupName =
    "rollback_" + crypto.randomUUID().replace(/-/g, "");
  const backup = path.join(c.parent, backupName);

  const owner = {
    pid: process.pid,
    token: crypto.randomUUID(),
    ...(process.platform === "linux"
      ? { identity: readLinuxProcessIdentity(process.pid) }
      : {})
  };
  const lockFd = fs.openSync(c.lock, "wx");
  fs.writeFileSync(lockFd, JSON.stringify(owner));
  fs.fsyncSync(lockFd);
  fs.closeSync(lockFd);
  syncDirectory(c.parent);

  const journal = {
    version: 1,
    state: "PREPARED",
    owner,
    targetName,
    stageName,
    backupName,
    before: toRows(before),
    after: toRows(staged),
    changed
  };

  let journalWritten = false;

  try {
    syncTree(c.target);
    syncTree(c.stage);
    syncDirectory(c.parent);
    writeJournal(c.journal, journal);
    journalWritten = true;

    if (!equal(inventory(c.target), before) ||
        !equal(inventory(c.stage), staged)) {
      throw Error("promotion_preimage_changed_after_lock");
    }

    durableRename(c.target, backup);

    if (simulateCrashAt === "after_backup") {
      return {
        ok: false,
        simulatedCrash: true,
        recoveryRequired: true
      };
    }

    durableRename(c.stage, c.target);

    if (simulateCrashAt === "after_promote") {
      return {
        ok: false,
        simulatedCrash: true,
        recoveryRequired: true
      };
    }

    if (!equal(inventory(c.target), staged)) {
      throw Error("promotion_postimage_mismatch");
    }

    // The verified postimage is committed before backup deletion.
    replaceJournalState(c.journal, journal, "COMMITTED");

    if (simulateCrashAt === "after_commit") {
      return {
        ok: false,
        simulatedCrash: true,
        recoveryRequired: true
      };
    }

    durableRemove(backup, { recursive: true });

    if (simulateCrashAt === "after_cleanup") {
      return {
        ok: false,
        simulatedCrash: true,
        recoveryRequired: true
      };
    }

    // Keep the COMMITTED journal until after unlocking.
    durableRemove(c.lock);

    if (simulateCrashAt === "after_unlock") {
      return {
        ok: false,
        simulatedCrash: true,
        recoveryRequired: true
      };
    }

    durableRemove(c.journal);

    return {
      ok: true,
      sandboxOnly: true,
      changedFiles: changed,
      fileCount: staged.size,
      recoveryRequired: false
    };
  } catch (error) {
    // Preserve recovery evidence after the journal exists.
    if (!journalWritten && fs.existsSync(c.lock)) {
      durableRemove(c.lock);
    }
    throw error;
  }
}

export function recoverHistoricalReleaseGuardedSandbox({
  parentDir,
  targetName = "target",
  stageName = "stage"
}) {
  const c = context(parentDir, targetName, stageName);

  // A terminal journal remains authoritative after lock release.
  // An orphan lock without a journal is never auto-cleared.
  if (!fs.existsSync(c.journal)) {
    throw Error("promotion_recovery_evidence_missing");
  }

  const journal = JSON.parse(fs.readFileSync(c.journal, "utf8"));

  if (journal.version !== 1 ||
      journal.targetName !== targetName ||
      journal.stageName !== stageName) {
    throw Error("promotion_recovery_journal_mismatch");
  }

  if (journal.state !== "PREPARED" &&
      journal.state !== "COMMITTED" &&
      journal.state !== "RESTORED") {
    throw Error("promotion_recovery_unknown_state");
  }

  assertChildName(journal.backupName);

  const backup = path.join(c.parent, journal.backupName);
  const before = fromRows(journal.before);
  const after = fromRows(journal.after);

  const targetExists = fs.existsSync(c.target);
  const backupExists = fs.existsSync(backup);
  const lockExists = fs.existsSync(c.lock);

  if (journal.state === "PREPARED" && !lockExists) {
    throw Error("promotion_recovery_prepared_lock_missing");
  }


  // Journal ownership survives lock removal.
  // Live or unverified owners must not be recovered.
  {
    let owner = journal.owner;

    if (fs.existsSync(c.lock)) {
      try {
        owner = JSON.parse(fs.readFileSync(c.lock, "utf8"));
      } catch {
        throw Error("promotion_recovery_owner_invalid");
      }
    }

    if (!Number.isSafeInteger(owner?.pid) || owner.pid < 1 ||
        typeof owner.token !== "string" ||
        !/^[a-f0-9-]{36}$/u.test(owner.token) ||
        journal.owner?.pid !== owner.pid ||
        journal.owner?.token !== owner.token) {
      throw Error("promotion_recovery_owner_binding_invalid");
    }

    if (process.platform === "linux") {
      const bound = journal.owner?.identity;
      const recorded = owner.identity;

      if (bound?.kind !== "linux_proc_start_v1" ||
          recorded?.kind !== "linux_proc_start_v1" ||
          !/^[a-f0-9-]{36}$/u.test(String(bound.bootId || "")) ||
          !/^[0-9]+$/u.test(String(bound.startTicks || "")) ||
          JSON.stringify(bound) !== JSON.stringify(recorded)) {
        throw Error("promotion_recovery_linux_identity_binding_invalid");
      }
    }

    // Check the recorded Linux boot epoch independently of PID
    // liveness. An ESRCH result must not bypass boot validation.
    if (process.platform === "linux") {
      let currentBootId;

      try {
        currentBootId = fs.readFileSync(
          "/proc/sys/kernel/random/boot_id", "utf8"
        ).trim().toLowerCase();
      } catch {
        throw Error("promotion_recovery_boot_id_unavailable");
      }

      if (!/^[a-f0-9-]{36}$/u.test(currentBootId)) {
        throw Error("promotion_recovery_boot_id_unavailable");
      }

      if (currentBootId !== journal.owner.identity.bootId) {
        throw Error("promotion_recovery_boot_id_mismatch_hold");
      }
    }

    let absent = false;
    try {
      process.kill(owner.pid, 0);
    } catch (error) {
      if (error?.code === "ESRCH") absent = true;
      else throw Error("promotion_recovery_owner_liveness_unknown");
    }

    if (!absent) {
      if (process.platform === "linux") {
        const current = readLinuxProcessIdentity(owner.pid);

        if (JSON.stringify(current) !==
            JSON.stringify(journal.owner.identity)) {
          // PID reuse does not grant recovery permission.
          throw Error("promotion_recovery_pid_identity_mismatch_hold");
        }
      }

      throw Error("promotion_recovery_owner_still_alive");
    }
  }

  // Only one recovery worker can enter the mutation section.
  // A leftover claim is deliberately NOT auto-reclaimed.
  const claimFd = fs.openSync(c.recoveryClaim, "wx");
  fs.writeFileSync(claimFd, JSON.stringify({
    pid: process.pid,
    token: crypto.randomUUID()
  }));
  fs.fsyncSync(claimFd);
  fs.closeSync(claimFd);

  if (journal.state === "RESTORED") {
    if (backupExists || !targetExists ||
        !equal(inventory(c.target), before)) {
      throw Error("promotion_recovery_restored_preimage_invalid");
    }
    if (lockExists) durableRemove(c.lock);
    durableRemove(c.journal);
    durableRemove(c.recoveryClaim);
    return {
      ok: true,
      restoredPreimage: true,
      committedRelease: false,
      sandboxOnly: true
    };
  }

  if (journal.state === "COMMITTED") {
    // Never roll back a committed, verified postimage.
    if (!targetExists || !equal(inventory(c.target), after)) {
      throw Error("promotion_recovery_committed_postimage_invalid");
    }
    if (fs.existsSync(c.stage)) {
      throw Error("promotion_recovery_committed_stage_collision");
    }
    if (backupExists) {
      durableRemove(backup, { recursive: true, force: true });
    }
    if (lockExists) durableRemove(c.lock);
    durableRemove(c.journal);
    durableRemove(c.recoveryClaim);
    return {
      ok: true,
      restoredPreimage: false,
      committedRelease: true,
      sandboxOnly: true
    };
  }

  if (!backupExists) {
    if (!targetExists || !equal(inventory(c.target), before)) {
      throw Error("promotion_recovery_no_trusted_preimage");
    }
  } else {
    if (!equal(inventory(backup), before)) {
      throw Error("promotion_recovery_backup_mismatch");
    }

    if (targetExists) {
      if (!equal(inventory(c.target), after)) {
        throw Error("promotion_recovery_target_mismatch");
      }

      if (fs.existsSync(c.stage)) {
        throw Error("promotion_recovery_stage_collision");
      }

      durableRename(c.target, c.stage);
    }

    durableRename(backup, c.target);
  }

  if (!equal(inventory(c.target), before)) {
    throw Error("promotion_recovery_verification_failed");
  }

  // Persist verified rollback before releasing its lock.
  replaceJournalState(c.journal, journal, "RESTORED");
  durableRemove(c.lock);
  durableRemove(c.journal);
  durableRemove(c.recoveryClaim);

  return {
    ok: true,
    restoredPreimage: true,
    sandboxOnly: true
  };
}