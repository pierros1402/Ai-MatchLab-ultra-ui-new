import {
  createHash,
  randomBytes
} from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  validateCheckpointAwareValueComparisonSourceBoundMaterialResolution
} from "./checkpoint-aware-targeted-value-comparison-source-bound-material-kernel-adapter.js";

import {
  validateCheckpointAwareValueComparisonTransactionPlanArtifact
} from "./checkpoint-aware-targeted-value-comparison-replay-transaction-plan.js";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_EXTERNAL_STATE_VERSION =
  "1.0.0";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_EXTERNAL_JOURNAL_SCHEMA =
  "ai-matchlab.checkpoint-aware-value-comparison-external-execution-journal.v1";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_EXTERNAL_LOCK_SCHEMA =
  "ai-matchlab.checkpoint-aware-value-comparison-external-execution-lock.v1";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_EXTERNAL_REPLAY_SCHEMA =
  "ai-matchlab.checkpoint-aware-value-comparison-external-replay-consumption.v1";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_EXTERNAL_AUDIT_SCHEMA =
  "ai-matchlab.checkpoint-aware-value-comparison-external-execution-audit.v1";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_EXTERNAL_JOURNAL_STATE =
  Object.freeze({
    PREPARED:
      "PREPARED",

    REPLAY_CONSUMED:
      "REPLAY_CONSUMED",

    APPLYING:
      "APPLYING",

    ROLLING_BACK:
      "ROLLING_BACK",

    ROLLED_BACK:
      "ROLLED_BACK",

    RECOVERY_REQUIRED:
      "RECOVERY_REQUIRED"
  });

const J =
  CHECKPOINT_AWARE_VALUE_COMPARISON_EXTERNAL_JOURNAL_STATE;

const VALID_TRANSACTION_ID =
  /^vctxn_v1_[0-9a-f]{32}$/u;

const VALID_AUTHORIZATION_ID =
  /^vcrauth_v1_[0-9a-f]{32}$/u;

const VALID_OPERATION_ID =
  /^vcrop_v1_[0-9a-f]{24}$/u;

const VALID_SHA =
  /^[0-9a-f]{64}$/u;

const CANONICAL_UTC =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

const TERMINAL_STATES =
  new Set([
    J.ROLLED_BACK,
    J.RECOVERY_REQUIRED
  ]);

const ALLOWED_TRANSITIONS =
  Object.freeze({
    PREPARED:
      new Set([
        J.REPLAY_CONSUMED,
        J.RECOVERY_REQUIRED
      ]),

    REPLAY_CONSUMED:
      new Set([
        J.APPLYING,
        J.ROLLING_BACK,
        J.RECOVERY_REQUIRED
      ]),

    APPLYING:
      new Set([
        J.APPLYING,
        J.ROLLING_BACK,
        J.RECOVERY_REQUIRED
      ]),

    ROLLING_BACK:
      new Set([
        J.ROLLING_BACK,
        J.ROLLED_BACK,
        J.RECOVERY_REQUIRED
      ]),

    ROLLED_BACK:
      new Set(),

    RECOVERY_REQUIRED:
      new Set()
  });

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

function stableValue(value) {
  if (
    Array.isArray(
      value
    )
  ) {
    return value.map(
      stableValue
    );
  }

  if (
    value &&
    typeof value ===
      "object"
  ) {
    return Object.fromEntries(
      Object.keys(
        value
      )
        .sort()
        .map(
          key => [
            key,
            stableValue(
              value[key]
            )
          ]
        )
    );
  }

  return value;
}

function canonicalJson(value) {
  return JSON.stringify(
    stableValue(
      value
    )
  );
}

function sha256Text(value) {
  return createHash(
    "sha256"
  )
    .update(
      value
    )
    .digest(
      "hex"
    );
}

function sha256Buffer(value) {
  return createHash(
    "sha256"
  )
    .update(
      value
    )
    .digest(
      "hex"
    );
}

function canonicalTimestamp(value) {
  const text =
    clean(
      value
    );

  if (
    !CANONICAL_UTC.test(
      text
    )
  ) {
    return null;
  }

  const millis =
    Date.parse(
      text
    );

  if (
    !Number.isFinite(
      millis
    ) ||
    new Date(
      millis
    )
      .toISOString() !==
        text
  ) {
    return null;
  }

  return text;
}

function nowIso() {
  return new Date().toISOString();
}

function isContained(
  parentPath,
  childPath
) {
  const relative =
    path.relative(
      parentPath,
      childPath
    );

  return (
    relative ===
      "" ||
    (
      relative !==
        ".." &&
      !relative.startsWith(
        `..${path.sep}`
      ) &&
      !path.isAbsolute(
        relative
      )
    )
  );
}

function validateExistingDirectory(
  value,
  label
) {
  const input =
    clean(
      value
    );

  if (
    !input ||
    !path.isAbsolute(
      input
    ) ||
    !fs.existsSync(
      input
    ) ||
    !fs.statSync(
      input
    )
      .isDirectory()
  ) {
    throw new Error(
      `value_comparison_external_state_${label}_directory_invalid`
    );
  }

  return fs.realpathSync(
    input
  );
}

export function validateCheckpointAwareValueComparisonExternalStateSandboxRoots({
  externalStateRoot,
  projectRoot
} = {}) {
  const externalReal =
    validateExistingDirectory(
      externalStateRoot,
      "external_root"
    );

  const projectReal =
    validateExistingDirectory(
      projectRoot,
      "project_root"
    );

  const tempReal =
    fs.realpathSync(
      os.tmpdir()
    );

  if (
    externalReal ===
      tempReal ||
    projectReal ===
      tempReal ||
    !isContained(
      tempReal,
      externalReal
    ) ||
    !isContained(
      tempReal,
      projectReal
    ) ||
    isContained(
      projectReal,
      externalReal
    ) ||
    isContained(
      externalReal,
      projectReal
    )
  ) {
    throw new Error(
      "value_comparison_external_state_sandbox_roots_invalid"
    );
  }

  return {
    externalStateRoot:
      externalReal,

    projectRoot:
      projectReal
  };
}

function ensureSubdirectory({
  externalStateRoot,
  projectRoot,
  name
}) {
  const directory =
    path.join(
      externalStateRoot,
      name
    );

  fs.mkdirSync(
    directory,
    {
      recursive:
        true
    }
  );

  const real =
    fs.realpathSync(
      directory
    );

  if (
    !isContained(
      externalStateRoot,
      real
    ) ||
    isContained(
      projectRoot,
      real
    )
  ) {
    throw new Error(
      "value_comparison_external_state_subdirectory_escape"
    );
  }

  return real;
}

function durableJsonBytes(value) {
  return Buffer.from(
    `${JSON.stringify(
      value,
      null,
      2
    )}\n`,
    "utf8"
  );
}

function writeExclusiveDurable(
  filePath,
  value
) {
  const bytes =
    durableJsonBytes(
      value
    );

  let descriptor =
    null;

  try {
    descriptor =
      fs.openSync(
        filePath,
        "wx"
      );

    fs.writeFileSync(
      descriptor,
      bytes
    );

    fs.fsyncSync(
      descriptor
    );
  }
  finally {
    if (
      descriptor !==
        null
    ) {
      fs.closeSync(
        descriptor
      );
    }
  }

  const persisted =
    fs.readFileSync(
      filePath
    );

  if (
    !persisted.equals(
      bytes
    )
  ) {
    throw new Error(
      "value_comparison_external_state_persisted_bytes_mismatch"
    );
  }

  return {
    path:
      filePath,

    sha256:
      sha256Buffer(
        persisted
      ),

    bytes:
      persisted.length
  };
}

function writeAtomicDurable(
  filePath,
  value
) {
  const bytes =
    durableJsonBytes(
      value
    );

  const tempFile =
    `${filePath}.tmp-${process.pid}-${randomBytes(
      12
    ).toString(
      "hex"
    )}`;

  let descriptor =
    null;

  try {
    descriptor =
      fs.openSync(
        tempFile,
        "wx"
      );

    fs.writeFileSync(
      descriptor,
      bytes
    );

    fs.fsyncSync(
      descriptor
    );
  }
  finally {
    if (
      descriptor !==
        null
    ) {
      fs.closeSync(
        descriptor
      );
    }
  }

  try {
    fs.renameSync(
      tempFile,
      filePath
    );

    const persisted =
      fs.readFileSync(
        filePath
      );

    if (
      !persisted.equals(
        bytes
      )
    ) {
      throw new Error(
        "value_comparison_external_state_atomic_bytes_mismatch"
      );
    }
  }
  finally {
    if (
      fs.existsSync(
        tempFile
      )
    ) {
      fs.unlinkSync(
        tempFile
      );
    }
  }

  return {
    path:
      filePath,

    sha256:
      sha256Buffer(
        bytes
      ),

    bytes:
      bytes.length
  };
}

function readJson(
  filePath,
  validator
) {
  const artifact =
    JSON.parse(
      fs.readFileSync(
        filePath,
        "utf8"
      )
    );

  validator(
    artifact
  );

  return artifact;
}

function transactionId() {
  return `vctxn_v1_${randomBytes(
    16
  ).toString(
    "hex"
  )}`;
}

function journalCore(
  artifact
) {
  return {
    schema:
      artifact.schema,

    version:
      artifact.version,

    transactionId:
      artifact.transactionId,

    dayKey:
      artifact.dayKey,

    authorizationId:
      artifact.authorizationId,

    authorizationFingerprint:
      artifact.authorizationFingerprint,

    replayKey:
      artifact.replayKey,

    transactionPlanFingerprint:
      artifact.transactionPlanFingerprint,

    state:
      artifact.state,

    updatedAt:
      artifact.updatedAt,

    operations:
      artifact.operations
  };
}

export function checkpointAwareValueComparisonExternalJournalFingerprint(
  artifact
) {
  return sha256Text(
    canonicalJson(
      journalCore(
        artifact
      )
    )
  );
}

function auditCore(
  artifact
) {
  return {
    schema:
      artifact.schema,

    version:
      artifact.version,

    transactionId:
      artifact.transactionId,

    dayKey:
      artifact.dayKey,

    authorizationId:
      artifact.authorizationId,

    authorizationFingerprint:
      artifact.authorizationFingerprint,

    replayKey:
      artifact.replayKey,

    transactionPlanFingerprint:
      artifact.transactionPlanFingerprint,

    terminalState:
      artifact.terminalState,

    completedAt:
      artifact.completedAt,

    journalFingerprint:
      artifact.journalFingerprint,

    operationCount:
      artifact.operationCount
  };
}

export function checkpointAwareValueComparisonExternalAuditFingerprint(
  artifact
) {
  return sha256Text(
    canonicalJson(
      auditCore(
        artifact
      )
    )
  );
}

function validateJournal(
  artifact
) {
  if (
    !artifact ||
    typeof artifact !==
      "object" ||
    artifact.schema !==
      CHECKPOINT_AWARE_VALUE_COMPARISON_EXTERNAL_JOURNAL_SCHEMA ||
    artifact.version !==
      CHECKPOINT_AWARE_VALUE_COMPARISON_EXTERNAL_STATE_VERSION ||
    !VALID_TRANSACTION_ID.test(
      clean(
        artifact.transactionId
      )
    ) ||
    !VALID_AUTHORIZATION_ID.test(
      clean(
        artifact.authorizationId
      )
    ) ||
    !VALID_SHA.test(
      clean(
        artifact.authorizationFingerprint
      )
    ) ||
    !VALID_SHA.test(
      clean(
        artifact.replayKey
      )
    ) ||
    !VALID_SHA.test(
      clean(
        artifact.transactionPlanFingerprint
      )
    ) ||
    !Object.values(
      J
    ).includes(
      artifact.state
    ) ||
    !canonicalTimestamp(
      artifact.updatedAt
    ) ||
    !Array.isArray(
      artifact.operations
    ) ||
    artifact.operations.length <
      1 ||
    artifact.operations.length >
      2
  ) {
    throw new Error(
      "value_comparison_external_journal_invalid"
    );
  }

  const seen =
    new Set();

  for (
    const operation of
      artifact.operations
  ) {
    if (
      !VALID_OPERATION_ID.test(
        clean(
          operation?.operationId
        )
      ) ||
      !clean(
        operation?.targetPath
      ) ||
      !VALID_SHA.test(
        clean(
          operation
            ?.preimage
            ?.sha256
        )
      ) ||
      !Number.isInteger(
        Number(
          operation
            ?.preimage
            ?.bytes
        )
      ) ||
      !VALID_SHA.test(
        clean(
          operation
            ?.postimage
            ?.sha256
        )
      ) ||
      !Number.isInteger(
        Number(
          operation
            ?.postimage
            ?.bytes
        )
      ) ||
      seen.has(
        operation.operationId
      ) ||
      ![
        true,
        false
      ].includes(
        operation.applied
      ) ||
      ![
        true,
        false
      ].includes(
        operation.restored
      )
    ) {
      throw new Error(
        "value_comparison_external_journal_operation_invalid"
      );
    }

    if (
      operation.backup !==
        null &&
      (
        !operation.backup ||
        !path.isAbsolute(
          clean(
            operation.backup.path
          )
        ) ||
        !VALID_SHA.test(
          clean(
            operation.backup.sha256
          )
        ) ||
        !Number.isInteger(
          Number(
            operation.backup.bytes
          )
        )
      )
    ) {
      throw new Error(
        "value_comparison_external_journal_backup_invalid"
      );
    }

    seen.add(
      operation.operationId
    );
  }

  if (
    !VALID_SHA.test(
      clean(
        artifact.journalFingerprint
      )
    ) ||
    checkpointAwareValueComparisonExternalJournalFingerprint(
      artifact
    ) !==
      artifact.journalFingerprint
  ) {
    throw new Error(
      "value_comparison_external_journal_fingerprint_invalid"
    );
  }

  return true;
}

function validateLock(
  artifact
) {
  if (
    artifact?.schema !==
      CHECKPOINT_AWARE_VALUE_COMPARISON_EXTERNAL_LOCK_SCHEMA ||
    artifact?.version !==
      CHECKPOINT_AWARE_VALUE_COMPARISON_EXTERNAL_STATE_VERSION ||
    !VALID_TRANSACTION_ID.test(
      clean(
        artifact?.transactionId
      )
    ) ||
    !VALID_AUTHORIZATION_ID.test(
      clean(
        artifact?.authorizationId
      )
    ) ||
    !VALID_SHA.test(
      clean(
        artifact?.transactionPlanFingerprint
      )
    ) ||
    !canonicalTimestamp(
      artifact?.acquiredAt
    )
  ) {
    throw new Error(
      "value_comparison_external_lock_invalid"
    );
  }

  return true;
}

function validateReplay(
  artifact
) {
  if (
    artifact?.schema !==
      CHECKPOINT_AWARE_VALUE_COMPARISON_EXTERNAL_REPLAY_SCHEMA ||
    artifact?.version !==
      CHECKPOINT_AWARE_VALUE_COMPARISON_EXTERNAL_STATE_VERSION ||
    !VALID_SHA.test(
      clean(
        artifact?.replayKey
      )
    ) ||
    !VALID_AUTHORIZATION_ID.test(
      clean(
        artifact?.authorizationId
      )
    ) ||
    !VALID_SHA.test(
      clean(
        artifact?.authorizationFingerprint
      )
    ) ||
    !VALID_TRANSACTION_ID.test(
      clean(
        artifact?.transactionId
      )
    ) ||
    !canonicalTimestamp(
      artifact?.consumedAt
    )
  ) {
    throw new Error(
      "value_comparison_external_replay_invalid"
    );
  }

  return true;
}

function validateAudit(
  artifact
) {
  if (
    artifact?.schema !==
      CHECKPOINT_AWARE_VALUE_COMPARISON_EXTERNAL_AUDIT_SCHEMA ||
    artifact?.version !==
      CHECKPOINT_AWARE_VALUE_COMPARISON_EXTERNAL_STATE_VERSION ||
    !VALID_TRANSACTION_ID.test(
      clean(
        artifact?.transactionId
      )
    ) ||
    !VALID_AUTHORIZATION_ID.test(
      clean(
        artifact?.authorizationId
      )
    ) ||
    !VALID_SHA.test(
      clean(
        artifact?.authorizationFingerprint
      )
    ) ||
    !VALID_SHA.test(
      clean(
        artifact?.replayKey
      )
    ) ||
    !VALID_SHA.test(
      clean(
        artifact?.transactionPlanFingerprint
      )
    ) ||
    !TERMINAL_STATES.has(
      artifact?.terminalState
    ) ||
    !canonicalTimestamp(
      artifact?.completedAt
    ) ||
    !VALID_SHA.test(
      clean(
        artifact?.journalFingerprint
      )
    ) ||
    !Number.isInteger(
      Number(
        artifact?.operationCount
      )
    ) ||
    Number(
      artifact?.operationCount
    ) <=
      0 ||
    !VALID_SHA.test(
      clean(
        artifact?.auditFingerprint
      )
    ) ||
    checkpointAwareValueComparisonExternalAuditFingerprint(
      artifact
    ) !==
      artifact.auditFingerprint
  ) {
    throw new Error(
      "value_comparison_external_audit_invalid"
    );
  }

  return true;
}

function staticJournalProjection(
  artifact
) {
  return {
    transactionId:
      artifact.transactionId,

    dayKey:
      artifact.dayKey,

    authorizationId:
      artifact.authorizationId,

    authorizationFingerprint:
      artifact.authorizationFingerprint,

    replayKey:
      artifact.replayKey,

    transactionPlanFingerprint:
      artifact.transactionPlanFingerprint,

    operations:
      artifact.operations.map(
        operation => ({
          operationId:
            operation.operationId,

          targetPath:
            operation.targetPath,

          preimage:
            operation.preimage,

          postimage:
            operation.postimage
        })
      )
  };
}

function assertJournalAdvance(
  previous,
  next
) {
  if (
    canonicalJson(
      staticJournalProjection(
        previous
      )
    ) !==
    canonicalJson(
      staticJournalProjection(
        next
      )
    )
  ) {
    throw new Error(
      "value_comparison_external_journal_static_identity_drift"
    );
  }

  if (
    !ALLOWED_TRANSITIONS[
      previous.state
    ].has(
      next.state
    )
  ) {
    throw new Error(
      "value_comparison_external_journal_transition_invalid"
    );
  }

  if (
    Date.parse(
      next.updatedAt
    ) <
    Date.parse(
      previous.updatedAt
    )
  ) {
    throw new Error(
      "value_comparison_external_journal_time_regression"
    );
  }

  for (
    let index = 0;
    index <
      previous.operations.length;
    index +=
      1
  ) {
    const before =
      previous.operations[index];

    const after =
      next.operations[index];

    if (
      before.backup &&
      canonicalJson(
        before.backup
      ) !==
      canonicalJson(
        after.backup
      )
    ) {
      throw new Error(
        "value_comparison_external_journal_backup_identity_drift"
      );
    }

    if (
      before.applied &&
      !after.applied
    ) {
      throw new Error(
        "value_comparison_external_journal_applied_regression"
      );
    }

    if (
      before.restored &&
      !after.restored
    ) {
      throw new Error(
        "value_comparison_external_journal_restored_regression"
      );
    }
  }

  return true;
}

function advanceJournal(
  adapter,
  journal,
  state,
  mutator =
    null
) {
  const next =
    structuredClone(
      journal
    );

  next.state =
    state;

  next.updatedAt =
    nowIso();

  if (
    typeof mutator ===
      "function"
  ) {
    mutator(
      next
    );
  }

  next.journalFingerprint =
    checkpointAwareValueComparisonExternalJournalFingerprint(
      next
    );

  adapter.writeOrAdvanceTransactionJournalAtomically({
    journal:
      next
  });

  return next;
}

function buildPreparedJournal({
  transactionId:
    id,
  transactionPlan
}) {
  const artifact = {
    schema:
      CHECKPOINT_AWARE_VALUE_COMPARISON_EXTERNAL_JOURNAL_SCHEMA,

    version:
      CHECKPOINT_AWARE_VALUE_COMPARISON_EXTERNAL_STATE_VERSION,

    transactionId:
      id,

    dayKey:
      transactionPlan.dayKey,

    authorizationId:
      transactionPlan.bindings.authorizationId,

    authorizationFingerprint:
      transactionPlan.bindings.authorizationFingerprint,

    replayKey:
      transactionPlan.bindings.replayKey,

    transactionPlanFingerprint:
      transactionPlan.transactionPlanFingerprint,

    state:
      J.PREPARED,

    updatedAt:
      nowIso(),

    operations:
      transactionPlan.operations.map(
        operation => ({
          operationId:
            operation.operationId,

          targetPath:
            operation.targetPath,

          preimage: {
            sha256:
              operation.preimage.sha256,

            bytes:
              operation.preimage.bytes
          },

          postimage: {
            sha256:
              operation.postimage.contentSha256,

            bytes:
              operation.postimage.contentBytes
          },

          backup:
            null,

          applied:
            false,

          restored:
            false
        })
      ),

    journalFingerprint:
      ""
  };

  artifact.journalFingerprint =
    checkpointAwareValueComparisonExternalJournalFingerprint(
      artifact
    );

  validateJournal(
    artifact
  );

  return artifact;
}

function buildAudit(
  journal
) {
  const artifact = {
    schema:
      CHECKPOINT_AWARE_VALUE_COMPARISON_EXTERNAL_AUDIT_SCHEMA,

    version:
      CHECKPOINT_AWARE_VALUE_COMPARISON_EXTERNAL_STATE_VERSION,

    transactionId:
      journal.transactionId,

    dayKey:
      journal.dayKey,

    authorizationId:
      journal.authorizationId,

    authorizationFingerprint:
      journal.authorizationFingerprint,

    replayKey:
      journal.replayKey,

    transactionPlanFingerprint:
      journal.transactionPlanFingerprint,

    terminalState:
      journal.state,

    completedAt:
      nowIso(),

    journalFingerprint:
      journal.journalFingerprint,

    operationCount:
      journal.operations.length,

    auditFingerprint:
      ""
  };

  artifact.auditFingerprint =
    checkpointAwareValueComparisonExternalAuditFingerprint(
      artifact
    );

  validateAudit(
    artifact
  );

  return artifact;
}

export function createCheckpointAwareValueComparisonExternalStateSandboxAdapter({
  externalStateRoot,
  projectRoot
} = {}) {
  const roots =
    validateCheckpointAwareValueComparisonExternalStateSandboxRoots({
      externalStateRoot,
      projectRoot
    });

  const directories = {
    locks:
      ensureSubdirectory({
        ...roots,
        name:
          "locks"
      }),

    journals:
      ensureSubdirectory({
        ...roots,
        name:
          "journals"
      }),

    replay:
      ensureSubdirectory({
        ...roots,
        name:
          "replay"
      }),

    audits:
      ensureSubdirectory({
        ...roots,
        name:
          "audits"
      }),

    backups:
      ensureSubdirectory({
        ...roots,
        name:
          "backups"
      })
  };

  const lockFile =
    path.join(
      directories.locks,
      "global-value-comparison.lock.json"
    );

  function journalPath(id) {
    if (
      !VALID_TRANSACTION_ID.test(
        clean(
          id
        )
      )
    ) {
      throw new Error(
        "value_comparison_external_transaction_id_invalid"
      );
    }

    return path.join(
      directories.journals,
      `${id}.json`
    );
  }

  function replayPath(replayKey) {
    if (
      !VALID_SHA.test(
        clean(
          replayKey
        )
      )
    ) {
      throw new Error(
        "value_comparison_external_replay_key_invalid"
      );
    }

    return path.join(
      directories.replay,
      `${replayKey}.json`
    );
  }

  function auditPath(
    id,
    terminalState
  ) {
    if (
      !VALID_TRANSACTION_ID.test(
        clean(
          id
        )
      ) ||
      !TERMINAL_STATES.has(
        terminalState
      )
    ) {
      throw new Error(
        "value_comparison_external_audit_path_invalid"
      );
    }

    return path.join(
      directories.audits,
      `${id}.${terminalState}.json`
    );
  }

  function backupPath(
    id,
    operationId
  ) {
    if (
      !VALID_TRANSACTION_ID.test(
        clean(
          id
        )
      ) ||
      !VALID_OPERATION_ID.test(
        clean(
          operationId
        )
      )
    ) {
      throw new Error(
        "value_comparison_external_backup_identity_invalid"
      );
    }

    const transactionDir =
      path.join(
        directories.backups,
        id
      );

    fs.mkdirSync(
      transactionDir,
      {
        recursive:
          true
      }
    );

    const real =
      fs.realpathSync(
        transactionDir
      );

    if (
      !isContained(
        directories.backups,
        real
      )
    ) {
      throw new Error(
        "value_comparison_external_backup_directory_escape"
      );
    }

    return path.join(
      real,
      `${operationId}.bin`
    );
  }

  const adapter = {
    externalStateRoot:
      roots.externalStateRoot,

    projectRoot:
      roots.projectRoot,

    acquireGlobalExecutionLockAtomically({
      transactionId:
        id,
      authorizationId,
      transactionPlanFingerprint,
      acquiredAt
    } = {}) {
      const record = {
        schema:
          CHECKPOINT_AWARE_VALUE_COMPARISON_EXTERNAL_LOCK_SCHEMA,

        version:
          CHECKPOINT_AWARE_VALUE_COMPARISON_EXTERNAL_STATE_VERSION,

        transactionId:
          id,

        authorizationId,

        transactionPlanFingerprint,

        acquiredAt
      };

      validateLock(
        record
      );

      try {
        return {
          record,

          persisted:
            writeExclusiveDurable(
              lockFile,
              record
            )
        };
      }
      catch (
        error
      ) {
        if (
          error?.code ===
            "EEXIST"
        ) {
          throw new Error(
            "value_comparison_external_global_lock_held"
          );
        }

        throw error;
      }
    },

    readGlobalExecutionLock() {
      if (
        !fs.existsSync(
          lockFile
        )
      ) {
        return null;
      }

      return readJson(
        lockFile,
        validateLock
      );
    },

    releaseGlobalExecutionLock({
      transactionId:
        id
    } = {}) {
      const lock =
        adapter.readGlobalExecutionLock();

      if (
        !lock ||
        lock.transactionId !==
          id
      ) {
        throw new Error(
          "value_comparison_external_global_lock_owner_mismatch"
        );
      }

      fs.unlinkSync(
        lockFile
      );

      return true;
    },

    readTransactionJournal({
      transactionId:
        id
    } = {}) {
      const file =
        journalPath(
          id
        );

      if (
        !fs.existsSync(
          file
        )
      ) {
        return null;
      }

      return readJson(
        file,
        validateJournal
      );
    },

    listTransactionJournals() {
      return fs
        .readdirSync(
          directories.journals
        )
        .filter(
          name =>
            /^vctxn_v1_[0-9a-f]{32}\.json$/u.test(
              name
            )
        )
        .sort()
        .map(
          name =>
            readJson(
              path.join(
                directories.journals,
                name
              ),
              validateJournal
            )
        );
    },

    writeOrAdvanceTransactionJournalAtomically({
      journal
    } = {}) {
      validateJournal(
        journal
      );

      const file =
        journalPath(
          journal.transactionId
        );

      if (
        fs.existsSync(
          file
        )
      ) {
        const previous =
          readJson(
            file,
            validateJournal
          );

        assertJournalAdvance(
          previous,
          journal
        );
      }
      else if (
        journal.state !==
          J.PREPARED
      ) {
        throw new Error(
          "value_comparison_external_journal_initial_state_invalid"
        );
      }

      return writeAtomicDurable(
        file,
        journal
      );
    },

    consumeOnceAtomically({
      replayKey,
      authorizationId,
      authorizationFingerprint,
      transactionId:
        id,
      consumedAt
    } = {}) {
      const record = {
        schema:
          CHECKPOINT_AWARE_VALUE_COMPARISON_EXTERNAL_REPLAY_SCHEMA,

        version:
          CHECKPOINT_AWARE_VALUE_COMPARISON_EXTERNAL_STATE_VERSION,

        replayKey,

        authorizationId,

        authorizationFingerprint,

        transactionId:
          id,

        consumedAt
      };

      validateReplay(
        record
      );

      try {
        return {
          consumed:
            true,

          record,

          persisted:
            writeExclusiveDurable(
              replayPath(
                replayKey
              ),
              record
            )
        };
      }
      catch (
        error
      ) {
        if (
          error?.code ===
            "EEXIST"
        ) {
          throw new Error(
            "value_comparison_external_replay_already_consumed"
          );
        }

        throw error;
      }
    },

    readReplayConsumption({
      replayKey
    } = {}) {
      const file =
        replayPath(
          replayKey
        );

      if (
        !fs.existsSync(
          file
        )
      ) {
        return null;
      }

      return readJson(
        file,
        validateReplay
      );
    },

    writeVerifiedBackupExclusive({
      transactionId:
        id,
      operationId,
      buffer,
      expectedSha256,
      expectedBytes
    } = {}) {
      if (
        !Buffer.isBuffer(
          buffer
        ) ||
        sha256Buffer(
          buffer
        ) !==
          expectedSha256 ||
        buffer.length !==
          expectedBytes
      ) {
        throw new Error(
          "value_comparison_external_backup_input_identity_invalid"
        );
      }

      const file =
        backupPath(
          id,
          operationId
        );

      let descriptor =
        null;

      try {
        descriptor =
          fs.openSync(
            file,
            "wx"
          );

        fs.writeFileSync(
          descriptor,
          buffer
        );

        fs.fsyncSync(
          descriptor
        );
      }
      finally {
        if (
          descriptor !==
            null
        ) {
          fs.closeSync(
            descriptor
          );
        }
      }

      const persisted =
        fs.readFileSync(
          file
        );

      if (
        sha256Buffer(
          persisted
        ) !==
          expectedSha256 ||
        persisted.length !==
          expectedBytes
      ) {
        throw new Error(
          "value_comparison_external_backup_persisted_identity_invalid"
        );
      }

      return {
        path:
          file,

        sha256:
          expectedSha256,

        bytes:
          expectedBytes
      };
    },

    readVerifiedBackup({
      backup
    } = {}) {
      if (
        !backup ||
        !path.isAbsolute(
          clean(
            backup.path
          )
        ) ||
        !isContained(
          directories.backups,
          path.resolve(
            backup.path
          )
        ) ||
        !fs.existsSync(
          backup.path
        )
      ) {
        throw new Error(
          "value_comparison_external_backup_missing"
        );
      }

      const buffer =
        fs.readFileSync(
          backup.path
        );

      if (
        sha256Buffer(
          buffer
        ) !==
          backup.sha256 ||
        buffer.length !==
          backup.bytes
      ) {
        throw new Error(
          "value_comparison_external_backup_identity_mismatch"
        );
      }

      return buffer;
    },

    readExecutionAudit({
      transactionId:
        id,
      terminalState
    } = {}) {
      const file =
        auditPath(
          id,
          terminalState
        );

      if (
        !fs.existsSync(
          file
        )
      ) {
        return null;
      }

      return readJson(
        file,
        validateAudit
      );
    },

    writeExecutionAuditAtomically({
      audit
    } = {}) {
      validateAudit(
        audit
      );

      return writeExclusiveDurable(
        auditPath(
          audit.transactionId,
          audit.terminalState
        ),
        audit
      );
    },

    inspectRecoveryObligations({
      ignoreLockTransactionId =
        null
    } = {}) {
      const lock =
        adapter.readGlobalExecutionLock();

      const blockingLock =
        (
          lock &&
          lock.transactionId !==
            ignoreLockTransactionId
        )
          ? lock
          : null;

      const journals =
        adapter.listTransactionJournals();

      const unfinished =
        journals.filter(
          journal =>
            !TERMINAL_STATES.has(
              journal.state
            )
        );

      const missingAudit =
        journals
          .filter(
            journal =>
              TERMINAL_STATES.has(
                journal.state
              )
          )
          .filter(
            journal =>
              adapter.readExecutionAudit({
                transactionId:
                  journal.transactionId,

                terminalState:
                  journal.state
              }) ===
                null
          );

      return {
        ready:
          !blockingLock &&
          unfinished.length ===
            0 &&
          missingAudit.length ===
            0,

        blockingLock,

        unfinishedTransactionIds:
          unfinished.map(
            journal =>
              journal.transactionId
          ),

        terminalAuditMissing:
          missingAudit.map(
            journal => ({
              transactionId:
                journal.transactionId,

              terminalState:
                journal.state
            })
          )
      };
    }
  };

  return adapter;
}

function safeTargetPath({
  projectRoot,
  targetPath
}) {
  const absolute =
    path.resolve(
      projectRoot,
      ...clean(
        targetPath
      ).split(
        "/"
      )
    );

  if (
    !isContained(
      projectRoot,
      absolute
    ) ||
    absolute ===
      projectRoot
  ) {
    throw new Error(
      "value_comparison_external_target_escape"
    );
  }

  return absolute;
}

function readIdentity(
  file
) {
  if (
    !fs.existsSync(
      file
    )
  ) {
    return {
      exists:
        false,
      sha256:
        null,
      bytes:
        0
    };
  }

  const stat =
    fs.lstatSync(
      file
    );

  if (
    stat.isSymbolicLink() ||
    !stat.isFile()
  ) {
    return {
      exists:
        true,
      invalidType:
        true,
      sha256:
        null,
      bytes:
        0
    };
  }

  const buffer =
    fs.readFileSync(
      file
    );

  return {
    exists:
      true,
    invalidType:
      false,
    sha256:
      sha256Buffer(
        buffer
      ),
    bytes:
      buffer.length
  };
}

function assertIdentity({
  file,
  sha256,
  bytes,
  code
}) {
  const actual =
    readIdentity(
      file
    );

  if (
    !actual.exists ||
    actual.invalidType ||
    actual.sha256 !==
      sha256 ||
    actual.bytes !==
      bytes
  ) {
    throw new Error(
      code
    );
  }

  return actual;
}

function replaceBufferAtomically({
  targetFile,
  buffer,
  expectedSha256,
  expectedBytes,
  suffix
}) {
  const tempFile =
    `${targetFile}.${suffix}.tmp`;

  fs.mkdirSync(
    path.dirname(
      targetFile
    ),
    {
      recursive:
        true
    }
  );

  if (
    fs.existsSync(
      tempFile
    )
  ) {
    throw new Error(
      "value_comparison_external_target_temp_preexists"
    );
  }

  let descriptor =
    null;

  try {
    descriptor =
      fs.openSync(
        tempFile,
        "wx"
      );

    fs.writeFileSync(
      descriptor,
      buffer
    );

    fs.fsyncSync(
      descriptor
    );
  }
  finally {
    if (
      descriptor !==
        null
    ) {
      fs.closeSync(
        descriptor
      );
    }
  }

  try {
    assertIdentity({
      file:
        tempFile,

      sha256:
        expectedSha256,

      bytes:
        expectedBytes,

      code:
        "value_comparison_external_target_temp_identity_invalid"
    });

    fs.renameSync(
      tempFile,
      targetFile
    );
  }
  finally {
    if (
      fs.existsSync(
        tempFile
      )
    ) {
      fs.unlinkSync(
        tempFile
      );
    }
  }

  return assertIdentity({
    file:
      targetFile,

    sha256:
      expectedSha256,

    bytes:
      expectedBytes,

    code:
      "value_comparison_external_target_post_replace_identity_invalid"
  });
}

function materialByPath(
  materialResolution
) {
  return new Map(
    materialResolution.materials.map(
      material => [
        material.targetPath,
        Buffer.from(
          material.contentBase64,
          "base64"
        )
      ]
    )
  );
}

function markRecoveryRequired({
  adapter,
  journal
}) {
  let terminal =
    journal;

  if (
    journal.state !==
      J.RECOVERY_REQUIRED
  ) {
    terminal =
      advanceJournal(
        adapter,
        journal,
        J.RECOVERY_REQUIRED
      );
  }

  if (
    adapter.readExecutionAudit({
      transactionId:
        terminal.transactionId,

      terminalState:
        terminal.state
    }) ===
      null
  ) {
    adapter.writeExecutionAuditAtomically({
      audit:
        buildAudit(
          terminal
        )
    });
  }

  return terminal;
}

export function stageCheckpointAwareValueComparisonCrashSandbox({
  transactionPlan,
  materialResolution,
  stateAdapter,
  crashAfterAppliedCount =
    1
} = {}) {
  validateCheckpointAwareValueComparisonTransactionPlanArtifact(
    transactionPlan
  );

  validateCheckpointAwareValueComparisonSourceBoundMaterialResolution(
    materialResolution
  );

  if (
    materialResolution.transactionPlanFingerprint !==
      transactionPlan.transactionPlanFingerprint ||
    stateAdapter?.projectRoot !==
      fs.realpathSync(
        stateAdapter.projectRoot
      ) ||
    !Number.isInteger(
      crashAfterAppliedCount
    ) ||
    crashAfterAppliedCount <
      1 ||
    crashAfterAppliedCount >
      transactionPlan.operations.length
  ) {
    throw new Error(
      "value_comparison_external_crash_stage_input_invalid"
    );
  }

  const obligations =
    stateAdapter.inspectRecoveryObligations();

  if (
    !obligations.ready
  ) {
    throw new Error(
      "value_comparison_external_recovery_obligation_blocks_forward_stage"
    );
  }

  if (
    stateAdapter.readReplayConsumption({
      replayKey:
        transactionPlan.bindings.replayKey
    })
  ) {
    throw new Error(
      "value_comparison_external_replay_already_consumed"
    );
  }

  const id =
    transactionId();

  stateAdapter.acquireGlobalExecutionLockAtomically({
    transactionId:
      id,

    authorizationId:
      transactionPlan.bindings.authorizationId,

    transactionPlanFingerprint:
      transactionPlan.transactionPlanFingerprint,

    acquiredAt:
      nowIso()
  });

  let journal =
    buildPreparedJournal({
      transactionId:
        id,

      transactionPlan
    });

  stateAdapter.writeOrAdvanceTransactionJournalAtomically({
    journal
  });

  stateAdapter.consumeOnceAtomically({
    replayKey:
      transactionPlan.bindings.replayKey,

    authorizationId:
      transactionPlan.bindings.authorizationId,

    authorizationFingerprint:
      transactionPlan.bindings.authorizationFingerprint,

    transactionId:
      id,

    consumedAt:
      nowIso()
  });

  journal =
    advanceJournal(
      stateAdapter,
      journal,
      J.REPLAY_CONSUMED
    );

  const materialMap =
    materialByPath(
      materialResolution
    );

  const backups =
    new Map();

  for (
    const operation of
      transactionPlan.operations
  ) {
    const targetFile =
      safeTargetPath({
        projectRoot:
          stateAdapter.projectRoot,

        targetPath:
          operation.targetPath
      });

    const preimage =
      fs.readFileSync(
        targetFile
      );

    if (
      sha256Buffer(
        preimage
      ) !==
        operation.preimage.sha256 ||
      preimage.length !==
        operation.preimage.bytes
    ) {
      markRecoveryRequired({
        adapter:
          stateAdapter,

        journal
      });

      throw new Error(
        "value_comparison_external_crash_stage_preimage_drift"
      );
    }

    backups.set(
      operation.operationId,
      stateAdapter.writeVerifiedBackupExclusive({
        transactionId:
          id,

        operationId:
          operation.operationId,

        buffer:
          preimage,

        expectedSha256:
          operation.preimage.sha256,

        expectedBytes:
          operation.preimage.bytes
      })
    );
  }

  journal =
    advanceJournal(
      stateAdapter,
      journal,
      J.APPLYING,
      next => {
        for (
          const operation of
            next.operations
        ) {
          operation.backup =
            backups.get(
              operation.operationId
            );
        }
      }
    );

  let applied =
    0;

  for (
    const operation of
      transactionPlan.operations
  ) {
    const targetFile =
      safeTargetPath({
        projectRoot:
          stateAdapter.projectRoot,

        targetPath:
          operation.targetPath
      });

    assertIdentity({
      file:
        targetFile,

      sha256:
        operation.preimage.sha256,

      bytes:
        operation.preimage.bytes,

      code:
        "value_comparison_external_crash_stage_preimage_changed_before_apply"
    });

    const postimage =
      materialMap.get(
        operation.targetPath
      );

    if (
      !postimage ||
      sha256Buffer(
        postimage
      ) !==
        operation.postimage.contentSha256 ||
      postimage.length !==
        operation.postimage.contentBytes
    ) {
      markRecoveryRequired({
        adapter:
          stateAdapter,

        journal
      });

      throw new Error(
        "value_comparison_external_crash_stage_postimage_material_invalid"
      );
    }

    replaceBufferAtomically({
      targetFile,

      buffer:
        postimage,

      expectedSha256:
        operation.postimage.contentSha256,

      expectedBytes:
        operation.postimage.contentBytes,

      suffix:
        `${id}.${operation.operationId}.apply`
    });

    applied +=
      1;

    journal =
      advanceJournal(
        stateAdapter,
        journal,
        J.APPLYING,
        next => {
          next.operations
            .find(
              row =>
                row.operationId ===
                  operation.operationId
            )
            .applied =
              true;
        }
      );

    if (
      applied ===
        crashAfterAppliedCount
    ) {
      return {
        schema:
          "ai-matchlab.checkpoint-aware-value-comparison-crash-stage.v1",

        simulationState:
          "CRASH_STAGED_DURABLY",

        transactionId:
          id,

        appliedCount:
          applied,

        journalState:
          journal.state,

        replayConsumed:
          true,

        lockRetained:
          true
      };
    }
  }

  throw new Error(
    "value_comparison_external_crash_stage_unreachable"
  );
}

function classifyOperationState({
  projectRoot,
  operation
}) {
  const file =
    safeTargetPath({
      projectRoot,
      targetPath:
        operation.targetPath
    });

  const actual =
    readIdentity(
      file
    );

  if (
    actual.exists &&
    !actual.invalidType &&
    actual.sha256 ===
      operation.preimage.sha256 &&
    actual.bytes ===
      operation.preimage.bytes
  ) {
    return {
      state:
        "PREIMAGE",
      file
    };
  }

  if (
    actual.exists &&
    !actual.invalidType &&
    actual.sha256 ===
      operation.postimage.contentSha256 &&
    actual.bytes ===
      operation.postimage.contentBytes
  ) {
    return {
      state:
        "POSTIMAGE",
      file
    };
  }

  return {
    state:
      "AMBIGUOUS",
    file
  };
}

export function recoverCheckpointAwareValueComparisonCrashSandbox({
  transactionId:
    id,
  transactionPlan,
  materialResolution,
  stateAdapter
} = {}) {
  validateCheckpointAwareValueComparisonTransactionPlanArtifact(
    transactionPlan
  );

  validateCheckpointAwareValueComparisonSourceBoundMaterialResolution(
    materialResolution
  );

  let journal =
    stateAdapter.readTransactionJournal({
      transactionId:
        id
    });

  if (
    !journal
  ) {
    throw new Error(
      "value_comparison_external_recovery_journal_missing"
    );
  }

  if (
    journal.transactionPlanFingerprint !==
      transactionPlan.transactionPlanFingerprint ||
    journal.authorizationId !==
      transactionPlan.bindings.authorizationId ||
    journal.authorizationFingerprint !==
      transactionPlan.bindings.authorizationFingerprint ||
    journal.replayKey !==
      transactionPlan.bindings.replayKey ||
    materialResolution.transactionPlanFingerprint !==
      transactionPlan.transactionPlanFingerprint
  ) {
    throw new Error(
      "value_comparison_external_recovery_plan_binding_mismatch"
    );
  }

  const lock =
    stateAdapter.readGlobalExecutionLock();

  if (
    lock &&
    lock.transactionId !==
      id
  ) {
    throw new Error(
      "value_comparison_external_recovery_blocked_by_other_lock"
    );
  }

  if (
    !lock
  ) {
    stateAdapter.acquireGlobalExecutionLockAtomically({
      transactionId:
        id,

      authorizationId:
        journal.authorizationId,

      transactionPlanFingerprint:
        journal.transactionPlanFingerprint,

      acquiredAt:
        nowIso()
    });
  }

  if (
    journal.state ===
      J.ROLLED_BACK
  ) {
    if (
      stateAdapter.readExecutionAudit({
        transactionId:
          id,

        terminalState:
          J.ROLLED_BACK
      }) ===
        null
    ) {
      stateAdapter.writeExecutionAuditAtomically({
        audit:
          buildAudit(
            journal
          )
      });
    }

    stateAdapter.releaseGlobalExecutionLock({
      transactionId:
        id
    });

    return {
      ok:
        true,
      transactionId:
        id,
      terminalState:
        J.ROLLED_BACK,
      recovered:
        true
    };
  }

  if (
    journal.state ===
      J.RECOVERY_REQUIRED
  ) {
    return {
      ok:
        false,
      transactionId:
        id,
      terminalState:
        J.RECOVERY_REQUIRED,
      recovered:
        false
    };
  }

  const replay =
    stateAdapter.readReplayConsumption({
      replayKey:
        journal.replayKey
    });

  if (
    !replay ||
    replay.transactionId !==
      id
  ) {
    journal =
      markRecoveryRequired({
        adapter:
          stateAdapter,

        journal
      });

    return {
      ok:
        false,
      transactionId:
        id,
      terminalState:
        journal.state,
      recovered:
        false
    };
  }

  const classifications =
    transactionPlan.operations.map(
      operation => ({
        operation,
        ...classifyOperationState({
          projectRoot:
            stateAdapter.projectRoot,
          operation
        })
      })
    );

  if (
    classifications.some(
      row =>
        row.state ===
          "AMBIGUOUS"
    )
  ) {
    journal =
      markRecoveryRequired({
        adapter:
          stateAdapter,

        journal
      });

    return {
      ok:
        false,
      transactionId:
        id,
      terminalState:
        journal.state,
      recovered:
        false
    };
  }

  journal =
    advanceJournal(
      stateAdapter,
      journal,
      J.ROLLING_BACK,
      next => {
        for (
          const nextOperation of
            next.operations
        ) {
          const classified =
            classifications.find(
              row =>
                row.operation.operationId ===
                  nextOperation.operationId
            );

          if (
            classified.state ===
              "POSTIMAGE"
          ) {
            nextOperation.applied =
              true;
          }
          else if (
            nextOperation.applied
          ) {
            nextOperation.restored =
              true;
          }
        }
      }
    );

  try {
    for (
      const classified of
        [
          ...classifications
        ].reverse()
    ) {
      const {
        operation,
        state,
        file
      } = classified;

      if (
        state !==
          "POSTIMAGE"
      ) {
        continue;
      }

      const journalOperation =
        journal.operations.find(
          row =>
            row.operationId ===
              operation.operationId
        );

      const backup =
        stateAdapter.readVerifiedBackup({
          backup:
            journalOperation.backup
        });

      replaceBufferAtomically({
        targetFile:
          file,

        buffer:
          backup,

        expectedSha256:
          operation.preimage.sha256,

        expectedBytes:
          operation.preimage.bytes,

        suffix:
          `${id}.${operation.operationId}.rollback`
      });

      journal =
        advanceJournal(
          stateAdapter,
          journal,
          J.ROLLING_BACK,
          next => {
            const row =
              next.operations.find(
                item =>
                  item.operationId ===
                    operation.operationId
              );

            row.applied =
              true;

            row.restored =
              true;
          }
        );
    }

    for (
      const operation of
        transactionPlan.operations
    ) {
      assertIdentity({
        file:
          safeTargetPath({
            projectRoot:
              stateAdapter.projectRoot,

            targetPath:
              operation.targetPath
          }),

        sha256:
          operation.preimage.sha256,

        bytes:
          operation.preimage.bytes,

        code:
          "value_comparison_external_recovery_preimage_restore_failed"
      });
    }

    journal =
      advanceJournal(
        stateAdapter,
        journal,
        J.ROLLED_BACK
      );

    stateAdapter.writeExecutionAuditAtomically({
      audit:
        buildAudit(
          journal
        )
    });

    stateAdapter.releaseGlobalExecutionLock({
      transactionId:
        id
    });

    return {
      ok:
        true,

      transactionId:
        id,

      terminalState:
        journal.state,

      recovered:
        true,

      replayRemainsConsumed:
        stateAdapter.readReplayConsumption({
          replayKey:
            journal.replayKey
        }) !==
          null
    };
  }
  catch (
    error
  ) {
    markRecoveryRequired({
      adapter:
        stateAdapter,

      journal
    });

    throw error;
  }
}
