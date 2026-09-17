import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";

import {
  validateAutonomousRepairExecutionTransactionPlanArtifact,
  resolveAutonomousRepairExecutionTransactionPostimageBuffer
} from "./autonomous-repair-execution-transaction-plan.js";

import {
  AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE,
  autonomousRepairExecutionJournalFingerprint,
  validateAutonomousRepairExecutionJournalArtifact,
  buildAutonomousRepairExecutionPreparedJournal,
  buildAutonomousRepairExecutionTerminalAudit,
  newAutonomousRepairExecutionTransactionId
} from "./autonomous-repair-external-execution-state.js";

export const AUTONOMOUS_REPAIR_FILESYSTEM_TRANSACTION_KERNEL_VERSION =
  "1.0.0";

const VALID_TRANSACTION_ID = /^artxn_v1_[0-9a-f]{32}$/u;
const VALID_OPERATION_ID = /^arpo_v1_[0-9a-f]{24}$/u;

function clean(value) {
  return String(value ?? "").trim();
}

function sha256Buffer(value) {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

function nowIso() {
  return new Date().toISOString();
}

function isContained(parentPath, childPath) {
  const rel = path.relative(parentPath, childPath);
  return (
    rel === "" ||
    (
      rel !== ".." &&
      !rel.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(rel)
    )
  );
}

function realExistingDirectory(value, label) {
  const text = clean(value);
  if (!text || !path.isAbsolute(text)) {
    throw new Error(`autonomous_repair_filesystem_kernel_${label}_absolute_directory_required`);
  }

  const resolved = path.resolve(text);
  if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
    throw new Error(`autonomous_repair_filesystem_kernel_${label}_directory_missing`);
  }

  return fs.realpathSync(resolved);
}

export function validateAutonomousRepairFilesystemTransactionSandboxRoots({
  projectRoot,
  externalStateRoot,
  externalBackupRoot
} = {}) {
  const tempReal = fs.realpathSync(os.tmpdir());
  const projectReal = realExistingDirectory(projectRoot, "project_root");
  const stateReal = realExistingDirectory(externalStateRoot, "external_state_root");
  const backupReal = realExistingDirectory(externalBackupRoot, "external_backup_root");

  for (const [label, candidate] of [
    ["project_root", projectReal],
    ["external_state_root", stateReal],
    ["external_backup_root", backupReal]
  ]) {
    if (candidate === tempReal || !isContained(tempReal, candidate)) {
      throw new Error(`autonomous_repair_filesystem_kernel_${label}_must_be_sandboxed_under_os_tmpdir`);
    }
  }

  const pairs = [
    [projectReal, stateReal],
    [projectReal, backupReal],
    [stateReal, backupReal]
  ];

  if (pairs.some(([a, b]) => isContained(a, b) || isContained(b, a))) {
    throw new Error("autonomous_repair_filesystem_kernel_sandbox_roots_not_disjoint");
  }

  return {
    tempRoot: tempReal,
    projectRoot: projectReal,
    externalStateRoot: stateReal,
    externalBackupRoot: backupReal
  };
}

function validateStateAdapter(stateAdapter, roots) {
  if (!stateAdapter || typeof stateAdapter !== "object") {
    throw new Error("autonomous_repair_filesystem_kernel_state_adapter_required");
  }

  const methods = [
    "acquireGlobalExecutionLockAtomically",
    "readGlobalExecutionLock",
    "releaseGlobalExecutionLock",
    "readTransactionJournal",
    "writeOrAdvanceTransactionJournalAtomically",
    "consumeOnceAtomically",
    "readReplayConsumption",
    "readExecutionAudit",
    "inspectRecoveryObligations",
    "writeExecutionAuditAtomically"
  ];

  if (methods.some(name => typeof stateAdapter[name] !== "function")) {
    throw new Error("autonomous_repair_filesystem_kernel_state_adapter_surface_invalid");
  }

  if (
    fs.realpathSync(stateAdapter.projectRoot) !== roots.projectRoot ||
    fs.realpathSync(stateAdapter.externalStateRoot) !== roots.externalStateRoot
  ) {
    throw new Error("autonomous_repair_filesystem_kernel_state_adapter_root_mismatch");
  }

  return true;
}

function canonicalRelativeTargetPath(value) {
  const text = clean(value);

  if (
    !text ||
    text.includes("\\") ||
    text.includes("\0") ||
    path.isAbsolute(text) ||
    /^[A-Za-z]:[\\/]/u.test(text) ||
    text.startsWith("//")
  ) {
    throw new Error("autonomous_repair_filesystem_kernel_target_path_invalid");
  }

  const parts = text.split("/");
  if (parts.some(part => !part || part === "." || part === "..")) {
    throw new Error("autonomous_repair_filesystem_kernel_target_path_invalid");
  }

  return text;
}

function assertNoSymlinkChain(projectRoot, relativePath, includeTarget) {
  const parts = canonicalRelativeTargetPath(relativePath).split("/");
  const limit = includeTarget ? parts.length : parts.length - 1;
  let current = projectRoot;

  for (let index = 0; index < limit; index += 1) {
    current = path.join(current, parts[index]);

    if (!fs.existsSync(current)) {
      throw new Error("autonomous_repair_filesystem_kernel_path_component_missing");
    }

    const stat = fs.lstatSync(current);
    if (stat.isSymbolicLink()) {
      throw new Error("autonomous_repair_filesystem_kernel_reparse_or_symlink_forbidden");
    }

    if (index < parts.length - 1 && !stat.isDirectory()) {
      throw new Error("autonomous_repair_filesystem_kernel_parent_component_not_directory");
    }
  }
}

function resolveSafeTarget(projectRoot, operation) {
  const relative = canonicalRelativeTargetPath(operation.targetPath);
  const absolute = path.resolve(projectRoot, ...relative.split("/"));

  if (!isContained(projectRoot, absolute) || absolute === projectRoot) {
    throw new Error("autonomous_repair_filesystem_kernel_target_escape");
  }

  const parent = path.dirname(absolute);
  assertNoSymlinkChain(projectRoot, relative, false);

  const parentReal = fs.realpathSync(parent);
  if (!isContained(projectRoot, parentReal)) {
    throw new Error("autonomous_repair_filesystem_kernel_parent_escape");
  }

  if (fs.existsSync(absolute)) {
    const lstat = fs.lstatSync(absolute);
    if (lstat.isSymbolicLink() || !lstat.isFile()) {
      throw new Error("autonomous_repair_filesystem_kernel_target_not_regular_file");
    }

    const targetReal = fs.realpathSync(absolute);
    if (!isContained(projectRoot, targetReal)) {
      throw new Error("autonomous_repair_filesystem_kernel_target_physical_escape");
    }
  }

  return {
    relativePath: relative,
    absolutePath: absolute,
    parentPath: parentReal
  };
}

function readFileIdentity(filePath) {
  if (!fs.existsSync(filePath)) {
    return {
      exists: false,
      sha256: null,
      bytes: null
    };
  }

  const stat = fs.lstatSync(filePath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    return {
      exists: true,
      invalidType: true,
      sha256: null,
      bytes: null
    };
  }

  const buffer = fs.readFileSync(filePath);
  return {
    exists: true,
    invalidType: false,
    sha256: sha256Buffer(buffer),
    bytes: buffer.length
  };
}

function assertExactPreimage(projectRoot, operation) {
  const target = resolveSafeTarget(projectRoot, operation);
  const actual = readFileIdentity(target.absolutePath);

  if (operation.mutationMode === "CREATE") {
    if (actual.exists) {
      throw new Error(`autonomous_repair_filesystem_kernel_create_target_exists:${operation.targetPath}`);
    }
  } else {
    if (
      !actual.exists ||
      actual.invalidType ||
      actual.sha256 !== operation.preimage.sha256 ||
      actual.bytes !== operation.preimage.bytes
    ) {
      throw new Error(`autonomous_repair_filesystem_kernel_replace_preimage_mismatch:${operation.targetPath}`);
    }
  }

  return target;
}

function assertExactPostimage(filePath, operation) {
  const actual = readFileIdentity(filePath);
  if (
    !actual.exists ||
    actual.invalidType ||
    actual.sha256 !== operation.postimage.contentSha256 ||
    actual.bytes !== operation.postimage.contentBytes
  ) {
    throw new Error(`autonomous_repair_filesystem_kernel_postimage_mismatch:${operation.targetPath}`);
  }
  return true;
}

function writeExclusiveFsync(filePath, buffer) {
  let fd = null;
  try {
    fd = fs.openSync(filePath, "wx");
    fs.writeFileSync(fd, buffer);
    fs.fsyncSync(fd);
  } finally {
    if (fd !== null) fs.closeSync(fd);
  }

  const verify = fs.readFileSync(filePath);
  if (!verify.equals(buffer)) {
    throw new Error("autonomous_repair_filesystem_kernel_persisted_bytes_mismatch");
  }

  return {
    path: filePath,
    sha256: sha256Buffer(verify),
    bytes: verify.length
  };
}

function cloneJournal(journal) {
  return structuredClone(journal);
}

function advanceJournal(stateAdapter, journal, state, mutate = null) {
  const next = cloneJournal(journal);
  next.state = state;
  next.updatedAt = nowIso();

  if (mutate) mutate(next);

  next.journalFingerprint =
    autonomousRepairExecutionJournalFingerprint(next);

  validateAutonomousRepairExecutionJournalArtifact(next);
  stateAdapter.writeOrAdvanceTransactionJournalAtomically({ journal: next });
  return next;
}

function ensureTerminalAudit(stateAdapter, journal) {
  const existing = stateAdapter.readExecutionAudit({
    transactionId: journal.transactionId,
    terminalState: journal.state
  });

  if (existing) return existing;

  const audit = buildAutonomousRepairExecutionTerminalAudit({
    journal,
    completedAt: nowIso()
  });

  stateAdapter.writeExecutionAuditAtomically({ audit });
  return audit;
}

function releaseOwnedLockIfPresent(stateAdapter, transactionId) {
  const lock = stateAdapter.readGlobalExecutionLock();
  if (!lock) return false;

  if (lock.transactionId !== transactionId) {
    throw new Error("autonomous_repair_filesystem_kernel_global_lock_owner_mismatch");
  }

  stateAdapter.releaseGlobalExecutionLock({ transactionId });
  return true;
}

function derivedBackupTransactionDirectory(externalBackupRoot, transactionId) {
  if (!VALID_TRANSACTION_ID.test(transactionId)) {
    throw new Error("autonomous_repair_filesystem_kernel_transaction_id_invalid");
  }
  return path.join(externalBackupRoot, transactionId);
}

function validateBackupTransactionDirectory(externalBackupRoot, transactionId) {
  const directory =
    derivedBackupTransactionDirectory(externalBackupRoot, transactionId);

  if (!fs.existsSync(directory)) {
    throw new Error("autonomous_repair_filesystem_kernel_backup_transaction_directory_missing");
  }

  const stat = fs.lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("autonomous_repair_filesystem_kernel_backup_transaction_directory_invalid");
  }

  const real = fs.realpathSync(directory);
  if (!isContained(externalBackupRoot, real)) {
    throw new Error("autonomous_repair_filesystem_kernel_backup_transaction_directory_escape");
  }

  return real;
}

function derivedBackupPath(externalBackupRoot, transactionId, operationId) {
  if (!VALID_OPERATION_ID.test(operationId)) {
    throw new Error("autonomous_repair_filesystem_kernel_operation_id_invalid");
  }
  return path.join(
    derivedBackupTransactionDirectory(externalBackupRoot, transactionId),
    `${operationId}.preimage.bin`
  );
}

function derivedTempPath(target, transactionId, operationId) {
  return path.join(
    target.parentPath,
    `.aiml-repair-${transactionId}-${operationId}.tmp`
  );
}

function derivedRestoreTempPath(target, transactionId, operationId) {
  return path.join(
    target.parentPath,
    `.aiml-restore-${transactionId}-${operationId}.tmp`
  );
}

function resolveOperationPostimage({
  transactionPlan,
  materialResolution,
  operation
}) {
  const buffer = resolveAutonomousRepairExecutionTransactionPostimageBuffer({
    transactionPlan,
    operationId: operation.operationId,
    materialResolution
  });

  if (
    !Buffer.isBuffer(buffer) ||
    buffer.length !== operation.postimage.contentBytes ||
    sha256Buffer(buffer) !== operation.postimage.contentSha256
  ) {
    throw new Error("autonomous_repair_filesystem_kernel_resolved_postimage_mismatch");
  }

  return buffer;
}

function prepareAllOperationContexts({
  transactionPlan,
  materialResolution,
  projectRoot
}) {
  return transactionPlan.operations.map(operation => ({
    operation,
    target: assertExactPreimage(projectRoot, operation),
    postimageBuffer: resolveOperationPostimage({
      transactionPlan,
      materialResolution,
      operation
    })
  }));
}

function createVerifiedBackups({
  externalBackupRoot,
  transactionId,
  operationContexts,
  projectRoot
}) {
  const transactionDirectory =
    derivedBackupTransactionDirectory(externalBackupRoot, transactionId);

  fs.mkdirSync(transactionDirectory, { recursive: false });
  validateBackupTransactionDirectory(externalBackupRoot, transactionId);

  const byOperationId = new Map();

  for (const context of operationContexts) {
    const { operation, target } = context;

    if (operation.mutationMode !== "REPLACE") {
      byOperationId.set(operation.operationId, null);
      continue;
    }

    assertExactPreimage(projectRoot, operation);
    const current = fs.readFileSync(target.absolutePath);

    if (
      current.length !== operation.preimage.bytes ||
      sha256Buffer(current) !== operation.preimage.sha256
    ) {
      throw new Error("autonomous_repair_filesystem_kernel_backup_source_preimage_mismatch");
    }

    const backupPath = derivedBackupPath(
      externalBackupRoot,
      transactionId,
      operation.operationId
    );

    const identity = writeExclusiveFsync(backupPath, current);

    if (
      identity.sha256 !== operation.preimage.sha256 ||
      identity.bytes !== operation.preimage.bytes
    ) {
      throw new Error("autonomous_repair_filesystem_kernel_backup_identity_mismatch");
    }

    byOperationId.set(operation.operationId, identity);
  }

  return byOperationId;
}

function createVerifiedTemps({
  transactionId,
  operationContexts
}) {
  const byOperationId = new Map();

  for (const context of operationContexts) {
    const { operation, target, postimageBuffer } = context;
    const tempPath = derivedTempPath(target, transactionId, operation.operationId);
    const identity = writeExclusiveFsync(tempPath, postimageBuffer);

    if (
      identity.sha256 !== operation.postimage.contentSha256 ||
      identity.bytes !== operation.postimage.contentBytes
    ) {
      throw new Error("autonomous_repair_filesystem_kernel_temp_identity_mismatch");
    }

    byOperationId.set(operation.operationId, identity);
  }

  return byOperationId;
}

function verifyBackupRecord({
  externalBackupRoot,
  transactionId,
  operation,
  record
}) {
  if (operation.mutationMode !== "REPLACE") {
    if (record !== null) {
      throw new Error("autonomous_repair_filesystem_kernel_create_backup_forbidden");
    }
    return null;
  }

  validateBackupTransactionDirectory(externalBackupRoot, transactionId);

  const expectedPath = derivedBackupPath(
    externalBackupRoot,
    transactionId,
    operation.operationId
  );

  if (!record || path.resolve(record.path) !== path.resolve(expectedPath)) {
    throw new Error("autonomous_repair_filesystem_kernel_backup_path_mismatch");
  }

  const actual = readFileIdentity(expectedPath);
  if (
    !actual.exists ||
    actual.invalidType ||
    actual.sha256 !== operation.preimage.sha256 ||
    actual.bytes !== operation.preimage.bytes ||
    record.sha256 !== actual.sha256 ||
    record.bytes !== actual.bytes
  ) {
    throw new Error("autonomous_repair_filesystem_kernel_backup_verification_failed");
  }

  return expectedPath;
}

function cleanupOwnedTempIfPresent({
  target,
  transactionId,
  operation
}) {
  const tempPath = derivedTempPath(target, transactionId, operation.operationId);
  if (!fs.existsSync(tempPath)) return;

  const stat = fs.lstatSync(tempPath);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error("autonomous_repair_filesystem_kernel_temp_cleanup_type_invalid");
  }

  fs.unlinkSync(tempPath);
}

function restoreReplaceOperation({
  externalBackupRoot,
  transactionId,
  projectRoot,
  operation,
  journalOperation
}) {
  const target = resolveSafeTarget(projectRoot, operation);
  const backupPath = verifyBackupRecord({
    externalBackupRoot,
    transactionId,
    operation,
    record: journalOperation.backup
  });

  const backup = fs.readFileSync(backupPath);
  const restoreTemp = derivedRestoreTempPath(target, transactionId, operation.operationId);

  if (fs.existsSync(restoreTemp)) {
    throw new Error("autonomous_repair_filesystem_kernel_restore_temp_preexists");
  }

  writeExclusiveFsync(restoreTemp, backup);

  try {
    fs.renameSync(restoreTemp, target.absolutePath);
  } finally {
    if (fs.existsSync(restoreTemp)) {
      fs.unlinkSync(restoreTemp);
    }
  }

  const restored = readFileIdentity(target.absolutePath);
  if (
    !restored.exists ||
    restored.invalidType ||
    restored.sha256 !== operation.preimage.sha256 ||
    restored.bytes !== operation.preimage.bytes
  ) {
    throw new Error("autonomous_repair_filesystem_kernel_restore_preimage_mismatch");
  }
}

function rollbackCreateOperation({
  transactionId,
  projectRoot,
  operation
}) {
  const target = resolveSafeTarget(projectRoot, operation);
  const actual = readFileIdentity(target.absolutePath);

  if (!actual.exists) return;

  if (
    actual.invalidType ||
    actual.sha256 !== operation.postimage.contentSha256 ||
    actual.bytes !== operation.postimage.contentBytes
  ) {
    throw new Error("autonomous_repair_filesystem_kernel_create_rollback_target_drift");
  }

  fs.unlinkSync(target.absolutePath);

  if (fs.existsSync(target.absolutePath)) {
    throw new Error("autonomous_repair_filesystem_kernel_create_rollback_delete_failed");
  }
}

function classifyTargetState(projectRoot, operation) {
  const target = resolveSafeTarget(projectRoot, operation);
  const actual = readFileIdentity(target.absolutePath);

  if (operation.mutationMode === "CREATE") {
    if (!actual.exists) return { state: "PREIMAGE", target };
    if (
      !actual.invalidType &&
      actual.sha256 === operation.postimage.contentSha256 &&
      actual.bytes === operation.postimage.contentBytes
    ) {
      return { state: "POSTIMAGE", target };
    }
    return { state: "AMBIGUOUS", target };
  }

  if (
    actual.exists &&
    !actual.invalidType &&
    actual.sha256 === operation.preimage.sha256 &&
    actual.bytes === operation.preimage.bytes
  ) {
    return { state: "PREIMAGE", target };
  }

  if (
    actual.exists &&
    !actual.invalidType &&
    actual.sha256 === operation.postimage.contentSha256 &&
    actual.bytes === operation.postimage.contentBytes
  ) {
    return { state: "POSTIMAGE", target };
  }

  return { state: "AMBIGUOUS", target };
}

function markRecoveryRequired({ stateAdapter, journal, keepLock = true }) {
  let terminal = journal;

  if (journal.state !== AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE.RECOVERY_REQUIRED) {
    terminal = advanceJournal(
      stateAdapter,
      journal,
      AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE.RECOVERY_REQUIRED
    );
  }

  try {
    ensureTerminalAudit(stateAdapter, terminal);
  } catch {
    // The terminal journal itself is the durable fail-closed recovery marker.
  }

  if (!keepLock) {
    releaseOwnedLockIfPresent(stateAdapter, terminal.transactionId);
  }

  return terminal;
}

function rollbackFromJournal({
  transactionPlan,
  stateAdapter,
  externalBackupRoot,
  projectRoot,
  journal
}) {
  const planByOperationId = new Map(
    transactionPlan.operations.map(operation => [operation.operationId, operation])
  );

  const classifications = journal.operations.map(journalOperation => {
    const operation = planByOperationId.get(journalOperation.operationId);
    if (!operation) {
      throw new Error("autonomous_repair_filesystem_kernel_journal_operation_not_in_plan");
    }

    const classification = classifyTargetState(projectRoot, operation);
    return { journalOperation, operation, ...classification };
  });

  if (classifications.some(row => row.state === "AMBIGUOUS")) {
    return markRecoveryRequired({ stateAdapter, journal, keepLock: true });
  }

  let rolling = advanceJournal(
    stateAdapter,
    journal,
    AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE.ROLLING_BACK,
    next => {
      for (const nextOperation of next.operations) {
        const classified = classifications.find(
          row => row.operation.operationId === nextOperation.operationId
        );

        if (classified.state === "POSTIMAGE") {
          nextOperation.applied = true;
        } else if (nextOperation.applied) {
          nextOperation.restored = true;
        }
      }
    }
  );

  try {
    for (const classified of [...classifications].reverse()) {
      const { operation, state, target } = classified;

      if (state === "POSTIMAGE") {
        const journalOperation = rolling.operations.find(
          row => row.operationId === operation.operationId
        );

        if (operation.mutationMode === "CREATE") {
          rollbackCreateOperation({ transactionId: rolling.transactionId, projectRoot, operation });
        } else {
          restoreReplaceOperation({
            externalBackupRoot,
            transactionId: rolling.transactionId,
            projectRoot,
            operation,
            journalOperation
          });
        }

        rolling = advanceJournal(
          stateAdapter,
          rolling,
          AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE.ROLLING_BACK,
          next => {
            const row = next.operations.find(item => item.operationId === operation.operationId);
            row.applied = true;
            row.restored = true;
          }
        );
      }

      cleanupOwnedTempIfPresent({
        target,
        transactionId: rolling.transactionId,
        operation
      });
    }

    for (const operation of transactionPlan.operations) {
      assertExactPreimage(projectRoot, operation);
    }

    const terminal = advanceJournal(
      stateAdapter,
      rolling,
      AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE.ROLLED_BACK
    );

    ensureTerminalAudit(stateAdapter, terminal);
    releaseOwnedLockIfPresent(stateAdapter, terminal.transactionId);
    return terminal;
  } catch (error) {
    markRecoveryRequired({ stateAdapter, journal: rolling, keepLock: true });
    throw error;
  }
}

function finalizeAbortedPreConsume(stateAdapter, journal) {
  const terminal = advanceJournal(
    stateAdapter,
    journal,
    AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE.ABORTED_PRE_CONSUME
  );

  ensureTerminalAudit(stateAdapter, terminal);
  releaseOwnedLockIfPresent(stateAdapter, terminal.transactionId);
  return terminal;
}

function completeTerminalRecovery(stateAdapter, journal) {
  ensureTerminalAudit(stateAdapter, journal);
  releaseOwnedLockIfPresent(stateAdapter, journal.transactionId);
  return journal;
}

function executeCore({
  transactionPlan,
  materialResolution,
  stateAdapter,
  externalBackupRoot,
  sandboxOnly
}) {
  validateAutonomousRepairExecutionTransactionPlanArtifact(transactionPlan);

  const roots = validateAutonomousRepairFilesystemTransactionSandboxRoots({
    projectRoot: stateAdapter?.projectRoot,
    externalStateRoot: stateAdapter?.externalStateRoot,
    externalBackupRoot
  });

  if (!sandboxOnly) {
    throw new Error("autonomous_repair_filesystem_kernel_production_entrypoint_not_implemented");
  }

  validateStateAdapter(stateAdapter, roots);

  const readyBefore = stateAdapter.inspectRecoveryObligations();
  if (!readyBefore.ready) {
    throw new Error("autonomous_repair_filesystem_kernel_recovery_obligation_blocks_forward_execution");
  }

  const transactionId = newAutonomousRepairExecutionTransactionId();
  let journal = null;
  let replayConsumedByThisTransaction = false;

  stateAdapter.acquireGlobalExecutionLockAtomically({
    transactionId,
    authorizationId: transactionPlan.bindings.authorizationId,
    transactionFingerprint: transactionPlan.transactionFingerprint,
    acquiredAt: nowIso()
  });

  try {
    const readyUnderLock = stateAdapter.inspectRecoveryObligations({
      ignoreLockTransactionId: transactionId
    });

    if (!readyUnderLock.ready) {
      throw new Error("autonomous_repair_filesystem_kernel_recovery_obligation_detected_under_lock");
    }

    const operationContexts = prepareAllOperationContexts({
      transactionPlan,
      materialResolution,
      projectRoot: roots.projectRoot
    });

    journal = buildAutonomousRepairExecutionPreparedJournal({
      transactionId,
      transactionPlan,
      updatedAt: nowIso()
    });

    stateAdapter.writeOrAdvanceTransactionJournalAtomically({ journal });

    stateAdapter.consumeOnceAtomically({
      replayKey: transactionPlan.bindings.replayKey,
      authorizationId: transactionPlan.bindings.authorizationId,
      authorizationFingerprint: transactionPlan.bindings.authorizationFingerprint,
      transactionId,
      consumedAt: nowIso()
    });

    replayConsumedByThisTransaction = true;

    journal = advanceJournal(
      stateAdapter,
      journal,
      AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE.REPLAY_CONSUMED
    );

    const backups = createVerifiedBackups({
      externalBackupRoot: roots.externalBackupRoot,
      transactionId,
      operationContexts,
      projectRoot: roots.projectRoot
    });

    journal = advanceJournal(
      stateAdapter,
      journal,
      AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE.BACKUPS_VERIFIED,
      next => {
        for (const operation of next.operations) {
          operation.backup = backups.get(operation.operationId);
        }
      }
    );

    const temps = createVerifiedTemps({ transactionId, operationContexts });

    journal = advanceJournal(
      stateAdapter,
      journal,
      AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE.TEMPS_VERIFIED,
      next => {
        for (const operation of next.operations) {
          operation.temp = temps.get(operation.operationId);
        }
      }
    );

    journal = advanceJournal(
      stateAdapter,
      journal,
      AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE.APPLYING
    );

    for (const context of operationContexts) {
      const { operation, target } = context;
      assertExactPreimage(roots.projectRoot, operation);

      const journalOperation = journal.operations.find(
        row => row.operationId === operation.operationId
      );

      if (!journalOperation?.temp) {
        throw new Error("autonomous_repair_filesystem_kernel_temp_record_missing");
      }

      const expectedTemp = derivedTempPath(target, transactionId, operation.operationId);
      if (path.resolve(journalOperation.temp.path) !== path.resolve(expectedTemp)) {
        throw new Error("autonomous_repair_filesystem_kernel_temp_record_path_mismatch");
      }

      const tempIdentity = readFileIdentity(expectedTemp);
      if (
        !tempIdentity.exists ||
        tempIdentity.invalidType ||
        tempIdentity.sha256 !== operation.postimage.contentSha256 ||
        tempIdentity.bytes !== operation.postimage.contentBytes
      ) {
        throw new Error("autonomous_repair_filesystem_kernel_temp_verification_failed_before_apply");
      }

      if (operation.mutationMode === "CREATE") {
        fs.linkSync(expectedTemp, target.absolutePath);
        fs.unlinkSync(expectedTemp);
      } else {
        fs.renameSync(expectedTemp, target.absolutePath);
      }

      assertExactPostimage(target.absolutePath, operation);

      journal = advanceJournal(
        stateAdapter,
        journal,
        AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE.APPLYING,
        next => {
          next.operations.find(
            row => row.operationId === operation.operationId
          ).applied = true;
        }
      );
    }

    for (const operation of transactionPlan.operations) {
      const target = resolveSafeTarget(roots.projectRoot, operation);
      assertExactPostimage(target.absolutePath, operation);
    }

    journal = advanceJournal(
      stateAdapter,
      journal,
      AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE.POSTIMAGES_VERIFIED
    );

    journal = advanceJournal(
      stateAdapter,
      journal,
      AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE.COMMITTED
    );

    ensureTerminalAudit(stateAdapter, journal);
    releaseOwnedLockIfPresent(stateAdapter, transactionId);

    return {
      ok: true,
      transactionId,
      terminalState: journal.state,
      operationCount: transactionPlan.operations.length,
      replayConsumed: true
    };
  } catch (error) {
    const persisted = stateAdapter.readTransactionJournal({ transactionId });
    if (persisted) journal = persisted;

    if (!journal) {
      releaseOwnedLockIfPresent(stateAdapter, transactionId);
      throw error;
    }

    if (
      [
        AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE.COMMITTED,
        AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE.ROLLED_BACK,
        AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE.ABORTED_PRE_CONSUME,
        AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE.RECOVERY_REQUIRED
      ].includes(journal.state)
    ) {
      try {
        if (journal.state !== AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE.RECOVERY_REQUIRED) {
          completeTerminalRecovery(stateAdapter, journal);
        } else {
          ensureTerminalAudit(stateAdapter, journal);
        }
      } catch {
        // Leave durable recovery obligation and lock in place.
      }
      throw error;
    }

    const replayRecord = stateAdapter.readReplayConsumption({
      replayKey: transactionPlan.bindings.replayKey
    });

    replayConsumedByThisTransaction = Boolean(
      replayRecord && replayRecord.transactionId === transactionId
    );

    if (journal.state === AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE.PREPARED) {
      if (!replayConsumedByThisTransaction) {
        try {
          finalizeAbortedPreConsume(stateAdapter, journal);
        } catch {
          // Leave terminal-audit recovery obligation if necessary.
        }
        throw error;
      }

      journal = advanceJournal(
        stateAdapter,
        journal,
        AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE.REPLAY_CONSUMED
      );
    }

    if (!replayConsumedByThisTransaction) {
      markRecoveryRequired({ stateAdapter, journal, keepLock: true });
      throw error;
    }

    try {
      rollbackFromJournal({
        transactionPlan,
        stateAdapter,
        externalBackupRoot: roots.externalBackupRoot,
        projectRoot: roots.projectRoot,
        journal
      });
    } catch {
      // rollbackFromJournal already persisted RECOVERY_REQUIRED if necessary.
    }

    throw error;
  }
}

export function executeAutonomousRepairFilesystemTransactionSandbox(options = {}) {
  return executeCore({ ...options, sandboxOnly: true });
}

export function recoverAutonomousRepairFilesystemTransactionSandbox({
  transactionId,
  transactionPlan,
  materialResolution,
  stateAdapter,
  externalBackupRoot
} = {}) {
  if (!VALID_TRANSACTION_ID.test(clean(transactionId))) {
    throw new Error("autonomous_repair_filesystem_kernel_transaction_id_invalid");
  }

  validateAutonomousRepairExecutionTransactionPlanArtifact(transactionPlan);

  const roots = validateAutonomousRepairFilesystemTransactionSandboxRoots({
    projectRoot: stateAdapter?.projectRoot,
    externalStateRoot: stateAdapter?.externalStateRoot,
    externalBackupRoot
  });

  validateStateAdapter(stateAdapter, roots);

  let journal = stateAdapter.readTransactionJournal({ transactionId });
  if (!journal) {
    throw new Error("autonomous_repair_filesystem_kernel_recovery_journal_missing");
  }

  if (
    journal.transactionFingerprint !== transactionPlan.transactionFingerprint ||
    journal.authorizationId !== transactionPlan.bindings.authorizationId ||
    journal.replayKey !== transactionPlan.bindings.replayKey
  ) {
    throw new Error("autonomous_repair_filesystem_kernel_recovery_plan_binding_mismatch");
  }

  const lock = stateAdapter.readGlobalExecutionLock();
  if (lock && lock.transactionId !== transactionId) {
    throw new Error("autonomous_repair_filesystem_kernel_recovery_blocked_by_other_lock");
  }

  if (!lock) {
    stateAdapter.acquireGlobalExecutionLockAtomically({
      transactionId,
      authorizationId: journal.authorizationId,
      transactionFingerprint: journal.transactionFingerprint,
      acquiredAt: nowIso()
    });
  }

  if (
    [
      AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE.COMMITTED,
      AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE.ROLLED_BACK,
      AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE.ABORTED_PRE_CONSUME
    ].includes(journal.state)
  ) {
    completeTerminalRecovery(stateAdapter, journal);
    return { ok: true, transactionId, terminalState: journal.state, recovered: true };
  }

  if (journal.state === AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE.RECOVERY_REQUIRED) {
    ensureTerminalAudit(stateAdapter, journal);
    return { ok: false, transactionId, terminalState: journal.state, recovered: false };
  }

  const replay = stateAdapter.readReplayConsumption({
    replayKey: journal.replayKey
  });

  if (journal.state === AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE.PREPARED) {
    if (!replay || replay.transactionId !== transactionId) {
      journal = finalizeAbortedPreConsume(stateAdapter, journal);
      return { ok: true, transactionId, terminalState: journal.state, recovered: true };
    }

    journal = advanceJournal(
      stateAdapter,
      journal,
      AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE.REPLAY_CONSUMED
    );
  } else if (!replay || replay.transactionId !== transactionId) {
    journal = markRecoveryRequired({ stateAdapter, journal, keepLock: true });
    return { ok: false, transactionId, terminalState: journal.state, recovered: false };
  }

  for (const operation of transactionPlan.operations) {
    resolveOperationPostimage({ transactionPlan, materialResolution, operation });
  }

  journal = rollbackFromJournal({
    transactionPlan,
    stateAdapter,
    externalBackupRoot: roots.externalBackupRoot,
    projectRoot: roots.projectRoot,
    journal
  });

  const recoveryRequired =
    journal.state ===
      AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE.RECOVERY_REQUIRED;

  return {
    ok: !recoveryRequired,
    transactionId,
    terminalState: journal.state,
    recovered: !recoveryRequired
  };
}
