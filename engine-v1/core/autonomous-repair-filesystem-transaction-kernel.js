import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  validateAutonomousRepairExecutionTransactionPlanArtifact
} from "./autonomous-repair-execution-transaction-plan.js";

import {
  executeAutonomousRepairFilesystemTransactionCore,
  recoverAutonomousRepairFilesystemTransactionCore
} from "./autonomous-repair-filesystem-transaction-core.js";

export const AUTONOMOUS_REPAIR_FILESYSTEM_TRANSACTION_KERNEL_VERSION =
  "1.0.0";

const VALID_TRANSACTION_ID = /^artxn_v1_[0-9a-f]{32}$/u;

function clean(value) {
  return String(value ?? "").trim();
}

function isContained(parentPath, childPath) {
  const rel = path.relative(parentPath, childPath);
  return (
    rel === "" ||
    (
      rel !== ".." &&
      !rel.startsWith(".." + path.sep) &&
      !path.isAbsolute(rel)
    )
  );
}

function realExistingDirectory(value, label) {
  const text = clean(value);

  if (
    !text ||
    !path.isAbsolute(text)
  ) {
    throw new Error(
      "autonomous_repair_filesystem_kernel_" +
      label +
      "_absolute_directory_required"
    );
  }

  const resolved = path.resolve(text);

  if (
    !fs.existsSync(resolved) ||
    !fs.statSync(resolved).isDirectory()
  ) {
    throw new Error(
      "autonomous_repair_filesystem_kernel_" +
      label +
      "_directory_missing"
    );
  }

  return fs.realpathSync(resolved);
}

export function validateAutonomousRepairFilesystemTransactionSandboxRoots({
  projectRoot,
  externalStateRoot,
  externalBackupRoot
} = {}) {
  const tempReal = fs.realpathSync(os.tmpdir());

  const projectReal =
    realExistingDirectory(
      projectRoot,
      "project_root"
    );

  const stateReal =
    realExistingDirectory(
      externalStateRoot,
      "external_state_root"
    );

  const backupReal =
    realExistingDirectory(
      externalBackupRoot,
      "external_backup_root"
    );

  for (const [label, candidate] of [
    ["project_root", projectReal],
    ["external_state_root", stateReal],
    ["external_backup_root", backupReal]
  ]) {
    if (
      candidate === tempReal ||
      !isContained(tempReal, candidate)
    ) {
      throw new Error(
        "autonomous_repair_filesystem_kernel_" +
        label +
        "_must_be_sandboxed_under_os_tmpdir"
      );
    }
  }

  const pairs = [
    [projectReal, stateReal],
    [projectReal, backupReal],
    [stateReal, backupReal]
  ];

  if (
    pairs.some(
      ([a, b]) =>
        isContained(a, b) ||
        isContained(b, a)
    )
  ) {
    throw new Error(
      "autonomous_repair_filesystem_kernel_sandbox_roots_not_disjoint"
    );
  }

  return {
    tempRoot: tempReal,
    projectRoot: projectReal,
    externalStateRoot: stateReal,
    externalBackupRoot: backupReal
  };
}

function coreRootsFromSandbox(roots) {
  return {
    projectRoot: roots.projectRoot,
    externalStateRoot: roots.externalStateRoot,
    externalBackupRoot: roots.externalBackupRoot
  };
}

export function executeAutonomousRepairFilesystemTransactionSandbox({
  transactionPlan,
  materialResolution,
  stateAdapter,
  externalBackupRoot
} = {}) {
  validateAutonomousRepairExecutionTransactionPlanArtifact(
    transactionPlan
  );

  const roots =
    validateAutonomousRepairFilesystemTransactionSandboxRoots({
      projectRoot: stateAdapter?.projectRoot,
      externalStateRoot: stateAdapter?.externalStateRoot,
      externalBackupRoot
    });

  return executeAutonomousRepairFilesystemTransactionCore({
    transactionPlan,
    materialResolution,
    stateAdapter,
    roots:
      coreRootsFromSandbox(
        roots
      )
  });
}

export function recoverAutonomousRepairFilesystemTransactionSandbox({
  transactionId,
  transactionPlan,
  materialResolution,
  stateAdapter,
  externalBackupRoot
} = {}) {
  if (
    !VALID_TRANSACTION_ID.test(
      clean(transactionId)
    )
  ) {
    throw new Error(
      "autonomous_repair_filesystem_kernel_transaction_id_invalid"
    );
  }

  validateAutonomousRepairExecutionTransactionPlanArtifact(
    transactionPlan
  );

  const roots =
    validateAutonomousRepairFilesystemTransactionSandboxRoots({
      projectRoot: stateAdapter?.projectRoot,
      externalStateRoot: stateAdapter?.externalStateRoot,
      externalBackupRoot
    });

  return recoverAutonomousRepairFilesystemTransactionCore({
    transactionId,
    transactionPlan,
    materialResolution,
    stateAdapter,
    roots:
      coreRootsFromSandbox(
        roots
      )
  });
}
