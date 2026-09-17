import fs from "node:fs";
import path from "node:path";
import {
  createHash,
  randomBytes
} from "node:crypto";

import {
  validateAutonomousRepairAuthorizationReplayLedgerAdapter
} from "./autonomous-repair-authorization-replay-contract.js";

import {
  validateAutonomousRepairExecutionTransactionPlanArtifact
} from "./autonomous-repair-execution-transaction-plan.js";

export const AUTONOMOUS_REPAIR_EXTERNAL_EXECUTION_STATE_VERSION =
  "1.0.0";

export const AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_SCHEMA =
  "ai-matchlab.autonomous-repair-execution-journal.v1";

export const AUTONOMOUS_REPAIR_EXECUTION_AUDIT_SCHEMA =
  "ai-matchlab.autonomous-repair-execution-audit.v1";

export const AUTONOMOUS_REPAIR_EXECUTION_LOCK_SCHEMA =
  "ai-matchlab.autonomous-repair-execution-lock.v1";

export const AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE =
  Object.freeze({
    PREPARED: "PREPARED",
    ABORTED_PRE_CONSUME: "ABORTED_PRE_CONSUME",
    REPLAY_CONSUMED: "REPLAY_CONSUMED",
    BACKUPS_VERIFIED: "BACKUPS_VERIFIED",
    TEMPS_VERIFIED: "TEMPS_VERIFIED",
    APPLYING: "APPLYING",
    POSTIMAGES_VERIFIED: "POSTIMAGES_VERIFIED",
    COMMITTED: "COMMITTED",
    ROLLING_BACK: "ROLLING_BACK",
    ROLLED_BACK: "ROLLED_BACK",
    RECOVERY_REQUIRED: "RECOVERY_REQUIRED"
  });

const VALID_SHA = /^[0-9a-f]{64}$/u;
const VALID_DAY = /^\d{4}-\d{2}-\d{2}$/u;
const VALID_AUTHORIZATION_ID = /^arauth_v2_[0-9a-f]{32}$/u;
const VALID_TRANSACTION_ID = /^artxn_v1_[0-9a-f]{32}$/u;
const VALID_OPERATION_ID = /^arpo_v1_[0-9a-f]{24}$/u;

const TERMINAL_STATES =
  new Set([
    "ABORTED_PRE_CONSUME",
    "COMMITTED",
    "ROLLED_BACK",
    "RECOVERY_REQUIRED"
  ]);

const ALLOWED_TRANSITIONS =
  Object.freeze({
    PREPARED:
      new Set([
        "ABORTED_PRE_CONSUME",
        "REPLAY_CONSUMED"
      ]),
    ABORTED_PRE_CONSUME:
      new Set(),
    REPLAY_CONSUMED:
      new Set([
        "BACKUPS_VERIFIED",
        "ROLLING_BACK",
        "RECOVERY_REQUIRED"
      ]),
    BACKUPS_VERIFIED:
      new Set([
        "TEMPS_VERIFIED",
        "ROLLING_BACK",
        "RECOVERY_REQUIRED"
      ]),
    TEMPS_VERIFIED:
      new Set([
        "APPLYING",
        "ROLLING_BACK",
        "RECOVERY_REQUIRED"
      ]),
    APPLYING:
      new Set([
        "APPLYING",
        "POSTIMAGES_VERIFIED",
        "ROLLING_BACK",
        "RECOVERY_REQUIRED"
      ]),
    POSTIMAGES_VERIFIED:
      new Set([
        "COMMITTED",
        "ROLLING_BACK",
        "RECOVERY_REQUIRED"
      ]),
    ROLLING_BACK:
      new Set([
        "ROLLING_BACK",
        "ROLLED_BACK",
        "RECOVERY_REQUIRED"
      ]),
    COMMITTED:
      new Set(),
    ROLLED_BACK:
      new Set(),
    RECOVERY_REQUIRED:
      new Set()
  });

function clean(value) {
  return String(value ?? "").trim();
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [
          key,
          stableValue(value[key])
        ])
    );
  }

  return value;
}

function sha256Value(value) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        stableValue(value)
      ),
      "utf8"
    )
    .digest("hex");
}

function exactKeys(value, expected, code) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${code}_object_required`);
  }

  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();

  if (
    actual.length !== wanted.length ||
    actual.some((key, index) => key !== wanted[index])
  ) {
    throw new Error(`${code}_keys_invalid`);
  }
}

function canonicalTimestamp(value) {
  const text = clean(value);
  if (!text) return null;

  const ms = Date.parse(text);
  if (!Number.isFinite(ms)) return null;

  const canonical = new Date(ms).toISOString();
  return canonical === text
    ? text
    : null;
}

function isPathContained(parentPath, childPath) {
  const relative =
    path.relative(
      parentPath,
      childPath
    );

  return (
    relative === "" ||
    (
      !relative.startsWith(`..${path.sep}`) &&
      relative !== ".." &&
      !path.isAbsolute(relative)
    )
  );
}

function validateAbsoluteDirectory(input, label) {
  const absolute =
    path.resolve(
      clean(input)
    );

  if (
    !clean(input) ||
    !path.isAbsolute(
      clean(input)
    ) ||
    !fs.existsSync(absolute) ||
    !fs.statSync(absolute).isDirectory()
  ) {
    throw new Error(
      `autonomous_repair_external_execution_state_${label}_directory_invalid`
    );
  }

  return fs.realpathSync(absolute);
}

export function validateAutonomousRepairExternalExecutionStateRoot({
  externalStateRoot,
  projectRoot
} = {}) {
  const externalReal =
    validateAbsoluteDirectory(
      externalStateRoot,
      "external_root"
    );

  const projectReal =
    validateAbsoluteDirectory(
      projectRoot,
      "project_root"
    );

  if (
    isPathContained(
      projectReal,
      externalReal
    ) ||
    isPathContained(
      externalReal,
      projectReal
    )
  ) {
    throw new Error(
      "autonomous_repair_external_execution_state_roots_not_disjoint"
    );
  }

  return {
    externalStateRoot:
      externalReal,
    projectRoot:
      projectReal
  };
}

function ensureExternalSubdirectory({
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
    !isPathContained(
      externalStateRoot,
      real
    ) ||
    isPathContained(
      projectRoot,
      real
    )
  ) {
    throw new Error(
      "autonomous_repair_external_execution_state_subdirectory_escape"
    );
  }

  return real;
}

function durableJsonBytes(value) {
  return Buffer.from(
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8"
  );
}

function verifyPersistedBytes(filePath, expected) {
  const actual =
    fs.readFileSync(
      filePath
    );

  if (
    !actual.equals(
      expected
    )
  ) {
    throw new Error(
      "autonomous_repair_external_execution_state_persisted_bytes_mismatch"
    );
  }
}

function writeExclusiveDurable(filePath, value) {
  const bytes =
    durableJsonBytes(
      value
    );

  let fd = null;

  try {
    fd =
      fs.openSync(
        filePath,
        "wx"
      );

    fs.writeFileSync(
      fd,
      bytes
    );

    fs.fsyncSync(
      fd
    );
  } finally {
    if (fd !== null) {
      fs.closeSync(
        fd
      );
    }
  }

  verifyPersistedBytes(
    filePath,
    bytes
  );

  return {
    path:
      filePath,
    bytes:
      bytes.length,
    sha256:
      createHash("sha256")
        .update(bytes)
        .digest("hex")
  };
}

function writeAtomicDurable(filePath, value) {
  const bytes =
    durableJsonBytes(
      value
    );

  const tempPath =
    `${filePath}.tmp-${process.pid}-${randomBytes(12).toString("hex")}`;

  let fd = null;

  try {
    fd =
      fs.openSync(
        tempPath,
        "wx"
      );

    fs.writeFileSync(
      fd,
      bytes
    );

    fs.fsyncSync(
      fd
    );
  } finally {
    if (fd !== null) {
      fs.closeSync(
        fd
      );
    }
  }

  try {
    fs.renameSync(
      tempPath,
      filePath
    );

    verifyPersistedBytes(
      filePath,
      bytes
    );
  } finally {
    if (
      fs.existsSync(
        tempPath
      )
    ) {
      fs.unlinkSync(
        tempPath
      );
    }
  }

  return {
    path:
      filePath,
    bytes:
      bytes.length,
    sha256:
      createHash("sha256")
        .update(bytes)
        .digest("hex")
  };
}

function journalFingerprintInput(artifact) {
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
    transactionFingerprint:
      artifact.transactionFingerprint,
    state:
      artifact.state,
    operations:
      artifact.operations
  };
}

function auditFingerprintInput(artifact) {
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
    transactionFingerprint:
      artifact.transactionFingerprint,
    terminalState:
      artifact.terminalState,
    journalFingerprint:
      artifact.journalFingerprint,
    operationCount:
      artifact.operationCount
  };
}

function validateIdentityFields(artifact, code) {
  if (
    !VALID_TRANSACTION_ID.test(
      clean(
        artifact.transactionId
      )
    ) ||
    !VALID_DAY.test(
      clean(
        artifact.dayKey
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
        artifact.transactionFingerprint
      )
    )
  ) {
    throw new Error(
      `${code}_identity_invalid`
    );
  }
}


export function validateAutonomousRepairExecutionLockArtifact(
  artifact
) {
  exactKeys(
    artifact,
    [
      "schema",
      "version",
      "transactionId",
      "authorizationId",
      "transactionFingerprint",
      "acquiredAt"
    ],
    "autonomous_repair_execution_lock"
  );

  if (
    artifact.schema !==
      AUTONOMOUS_REPAIR_EXECUTION_LOCK_SCHEMA ||
    artifact.version !==
      AUTONOMOUS_REPAIR_EXTERNAL_EXECUTION_STATE_VERSION ||
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
        artifact.transactionFingerprint
      )
    ) ||
    !canonicalTimestamp(
      artifact.acquiredAt
    )
  ) {
    throw new Error(
      "autonomous_repair_execution_lock_invalid"
    );
  }

  return true;
}

export function validateAutonomousRepairReplayConsumptionArtifact(
  artifact
) {
  exactKeys(
    artifact,
    [
      "schema",
      "version",
      "replayKey",
      "authorizationId",
      "authorizationFingerprint",
      "transactionId",
      "consumedAt"
    ],
    "autonomous_repair_replay_consumption"
  );

  if (
    artifact.schema !==
      "ai-matchlab.autonomous-repair-replay-consumption.v1" ||
    artifact.version !==
      AUTONOMOUS_REPAIR_EXTERNAL_EXECUTION_STATE_VERSION ||
    !VALID_SHA.test(
      clean(
        artifact.replayKey
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
    !VALID_TRANSACTION_ID.test(
      clean(
        artifact.transactionId
      )
    ) ||
    !canonicalTimestamp(
      artifact.consumedAt
    )
  ) {
    throw new Error(
      "autonomous_repair_replay_consumption_invalid"
    );
  }

  return true;
}

function validateJournalOperation(operation) {
  exactKeys(
    operation,
    [
      "operationId",
      "targetPath",
      "mutationMode",
      "preimage",
      "postimage",
      "rollback",
      "backup",
      "temp",
      "applied",
      "restored"
    ],
    "autonomous_repair_execution_journal_operation"
  );

  if (
    !VALID_OPERATION_ID.test(
      clean(
        operation.operationId
      )
    ) ||
    !clean(
      operation.targetPath
    ) ||
    !["CREATE", "REPLACE"].includes(
      operation.mutationMode
    ) ||
    !operation.preimage ||
    !operation.postimage ||
    !["DELETE_CREATED_TARGET", "RESTORE_PREIMAGE"].includes(
      operation.rollback
    ) ||
    typeof operation.applied !==
      "boolean" ||
    typeof operation.restored !==
      "boolean"
  ) {
    throw new Error(
      "autonomous_repair_execution_journal_operation_invalid"
    );
  }

  exactKeys(
    operation.preimage,
    [
      "targetExists",
      "sha256",
      "bytes",
      "preimageFingerprint"
    ],
    "autonomous_repair_execution_journal_preimage"
  );

  exactKeys(
    operation.postimage,
    [
      "contentSha256",
      "contentBytes"
    ],
    "autonomous_repair_execution_journal_postimage"
  );

  if (
    typeof operation.preimage.targetExists !==
      "boolean" ||
    !VALID_SHA.test(
      clean(
        operation.preimage.preimageFingerprint
      )
    ) ||
    !VALID_SHA.test(
      clean(
        operation.postimage.contentSha256
      )
    ) ||
    !Number.isInteger(
      operation.postimage.contentBytes
    ) ||
    operation.postimage.contentBytes <=
      0
  ) {
    throw new Error(
      "autonomous_repair_execution_journal_operation_identity_invalid"
    );
  }

  if (
    operation.mutationMode ===
      "CREATE"
  ) {
    if (
      operation.preimage.targetExists !==
        false ||
      operation.preimage.sha256 !==
        null ||
      operation.preimage.bytes !==
        null ||
      operation.rollback !==
        "DELETE_CREATED_TARGET"
    ) {
      throw new Error(
        "autonomous_repair_execution_journal_create_preimage_invalid"
      );
    }
  } else {
    if (
      operation.preimage.targetExists !==
        true ||
      !VALID_SHA.test(
        clean(
          operation.preimage.sha256
        )
      ) ||
      !Number.isInteger(
        operation.preimage.bytes
      ) ||
      operation.preimage.bytes <
        0 ||
      operation.rollback !==
        "RESTORE_PREIMAGE"
    ) {
      throw new Error(
        "autonomous_repair_execution_journal_replace_preimage_invalid"
      );
    }
  }

  for (
    const [label, value, requirePositiveBytes] of
      [
        [
          "backup",
          operation.backup,
          false
        ],
        [
          "temp",
          operation.temp,
          true
        ]
      ]
  ) {
    if (
      value ===
        null
    ) {
      continue;
    }

    exactKeys(
      value,
      [
        "path",
        "sha256",
        "bytes"
      ],
      `autonomous_repair_execution_journal_${label}`
    );

    if (
      !clean(
        value.path
      ) ||
      !VALID_SHA.test(
        clean(
          value.sha256
        )
      ) ||
      !Number.isInteger(
        value.bytes
      ) ||
      value.bytes <
        (
          requirePositiveBytes
            ? 1
            : 0
        )
    ) {
      throw new Error(
        `autonomous_repair_execution_journal_${label}_invalid`
      );
    }
  }

  return true;
}

export function autonomousRepairExecutionJournalFingerprint(
  artifact
) {
  return sha256Value(
    journalFingerprintInput(
      artifact
    )
  );
}

export function validateAutonomousRepairExecutionJournalArtifact(
  artifact
) {
  exactKeys(
    artifact,
    [
      "schema",
      "version",
      "transactionId",
      "dayKey",
      "authorizationId",
      "authorizationFingerprint",
      "replayKey",
      "transactionFingerprint",
      "state",
      "updatedAt",
      "operations",
      "journalFingerprint"
    ],
    "autonomous_repair_execution_journal"
  );

  if (
    artifact.schema !==
      AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_SCHEMA ||
    artifact.version !==
      AUTONOMOUS_REPAIR_EXTERNAL_EXECUTION_STATE_VERSION ||
    !Object.values(
      AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE
    ).includes(
      artifact.state
    ) ||
    !canonicalTimestamp(
      artifact.updatedAt
    ) ||
    !Array.isArray(
      artifact.operations
    ) ||
    artifact.operations.length ===
      0
  ) {
    throw new Error(
      "autonomous_repair_execution_journal_invalid"
    );
  }

  validateIdentityFields(
    artifact,
    "autonomous_repair_execution_journal"
  );

  let previousKey =
    null;

  for (
    const operation of
      artifact.operations
  ) {
    validateJournalOperation(
      operation
    );

    const key =
      [
        operation.targetPath,
        operation.operationId
      ].join("\0");

    if (
      previousKey !==
        null &&
      previousKey.localeCompare(
        key
      ) >=
        0
    ) {
      throw new Error(
        "autonomous_repair_execution_journal_operation_order_invalid"
      );
    }

    previousKey =
      key;
  }

  if (
    autonomousRepairExecutionJournalFingerprint(
      artifact
    ) !==
      artifact.journalFingerprint
  ) {
    throw new Error(
      "autonomous_repair_execution_journal_fingerprint_mismatch"
    );
  }

  return true;
}

export function buildAutonomousRepairExecutionPreparedJournal({
  transactionId,
  transactionPlan,
  updatedAt
} = {}) {
  if (
    !VALID_TRANSACTION_ID.test(
      clean(
        transactionId
      )
    )
  ) {
    throw new Error(
      "autonomous_repair_execution_transaction_id_invalid"
    );
  }

  validateAutonomousRepairExecutionTransactionPlanArtifact(
    transactionPlan
  );

  if (
    !canonicalTimestamp(
      updatedAt
    )
  ) {
    throw new Error(
      "autonomous_repair_execution_journal_updated_at_invalid"
    );
  }

  const artifact = {
    schema:
      AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_SCHEMA,
    version:
      AUTONOMOUS_REPAIR_EXTERNAL_EXECUTION_STATE_VERSION,
    transactionId,
    dayKey:
      transactionPlan.dayKey,
    authorizationId:
      transactionPlan.bindings.authorizationId,
    authorizationFingerprint:
      transactionPlan.bindings.authorizationFingerprint,
    replayKey:
      transactionPlan.bindings.replayKey,
    transactionFingerprint:
      transactionPlan.transactionFingerprint,
    state:
      AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE.PREPARED,
    updatedAt,
    operations:
      transactionPlan.operations.map(
        operation => ({
          operationId:
            operation.operationId,
          targetPath:
            operation.targetPath,
          mutationMode:
            operation.mutationMode,
          preimage:
            structuredClone(
              operation.preimage
            ),
          postimage: {
            contentSha256:
              operation.postimage.contentSha256,
            contentBytes:
              operation.postimage.contentBytes
          },
          rollback:
            operation.rollback.strategy,
          backup:
            null,
          temp:
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
    autonomousRepairExecutionJournalFingerprint(
      artifact
    );

  validateAutonomousRepairExecutionJournalArtifact(
    artifact
  );

  return artifact;
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
    transactionFingerprint:
      artifact.transactionFingerprint,
    operations:
      artifact.operations.map(
        operation => ({
          operationId:
            operation.operationId,
          targetPath:
            operation.targetPath,
          mutationMode:
            operation.mutationMode,
          preimage:
            operation.preimage,
          postimage:
            operation.postimage,
          rollback:
            operation.rollback
        })
      )
  };
}

function assertJournalAdvance(
  previous,
  next
) {
  if (
    JSON.stringify(
      stableValue(
        staticJournalProjection(
          previous
        )
      )
    ) !==
    JSON.stringify(
      stableValue(
        staticJournalProjection(
          next
        )
      )
    )
  ) {
    throw new Error(
      "autonomous_repair_execution_journal_static_identity_drift"
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
      "autonomous_repair_execution_journal_transition_invalid"
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
      "autonomous_repair_execution_journal_time_regression"
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
      before.applied &&
      !after.applied
    ) {
      throw new Error(
        "autonomous_repair_execution_journal_applied_regression"
      );
    }

    if (
      before.restored &&
      !after.restored
    ) {
      throw new Error(
        "autonomous_repair_execution_journal_restored_regression"
      );
    }
  }

  return true;
}

export function autonomousRepairExecutionAuditFingerprint(
  artifact
) {
  return sha256Value(
    auditFingerprintInput(
      artifact
    )
  );
}

export function validateAutonomousRepairExecutionAuditArtifact(
  artifact
) {
  exactKeys(
    artifact,
    [
      "schema",
      "version",
      "transactionId",
      "dayKey",
      "authorizationId",
      "authorizationFingerprint",
      "replayKey",
      "transactionFingerprint",
      "terminalState",
      "completedAt",
      "journalFingerprint",
      "operationCount",
      "auditFingerprint"
    ],
    "autonomous_repair_execution_audit"
  );

  if (
    artifact.schema !==
      AUTONOMOUS_REPAIR_EXECUTION_AUDIT_SCHEMA ||
    artifact.version !==
      AUTONOMOUS_REPAIR_EXTERNAL_EXECUTION_STATE_VERSION ||
    !TERMINAL_STATES.has(
      artifact.terminalState
    ) ||
    !canonicalTimestamp(
      artifact.completedAt
    ) ||
    !VALID_SHA.test(
      clean(
        artifact.journalFingerprint
      )
    ) ||
    !Number.isInteger(
      artifact.operationCount
    ) ||
    artifact.operationCount <=
      0
  ) {
    throw new Error(
      "autonomous_repair_execution_audit_invalid"
    );
  }

  validateIdentityFields(
    artifact,
    "autonomous_repair_execution_audit"
  );

  if (
    autonomousRepairExecutionAuditFingerprint(
      artifact
    ) !==
      artifact.auditFingerprint
  ) {
    throw new Error(
      "autonomous_repair_execution_audit_fingerprint_mismatch"
    );
  }

  return true;
}

export function buildAutonomousRepairExecutionTerminalAudit({
  journal,
  completedAt
} = {}) {
  validateAutonomousRepairExecutionJournalArtifact(
    journal
  );

  if (
    !TERMINAL_STATES.has(
      journal.state
    ) ||
    !canonicalTimestamp(
      completedAt
    )
  ) {
    throw new Error(
      "autonomous_repair_execution_terminal_audit_input_invalid"
    );
  }

  const artifact = {
    schema:
      AUTONOMOUS_REPAIR_EXECUTION_AUDIT_SCHEMA,
    version:
      AUTONOMOUS_REPAIR_EXTERNAL_EXECUTION_STATE_VERSION,
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
    transactionFingerprint:
      journal.transactionFingerprint,
    terminalState:
      journal.state,
    completedAt,
    journalFingerprint:
      journal.journalFingerprint,
    operationCount:
      journal.operations.length,
    auditFingerprint:
      ""
  };

  artifact.auditFingerprint =
    autonomousRepairExecutionAuditFingerprint(
      artifact
    );

  validateAutonomousRepairExecutionAuditArtifact(
    artifact
  );

  return artifact;
}

export function newAutonomousRepairExecutionTransactionId() {
  return `artxn_v1_${randomBytes(16).toString("hex")}`;
}

function readJsonArtifact(
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

export function createAutonomousRepairExternalExecutionStateAdapter({
  externalStateRoot,
  projectRoot
} = {}) {
  const roots =
    validateAutonomousRepairExternalExecutionStateRoot({
      externalStateRoot,
      projectRoot
    });

  const directories = {
    locks:
      ensureExternalSubdirectory({
        ...roots,
        name:
          "locks"
      }),
    journals:
      ensureExternalSubdirectory({
        ...roots,
        name:
          "journals"
      }),
    replay:
      ensureExternalSubdirectory({
        ...roots,
        name:
          "replay"
      }),
    audits:
      ensureExternalSubdirectory({
        ...roots,
        name:
          "audits"
      })
  };

  function lockPath() {
    return path.join(
      directories.locks,
      "global-executor.lock.json"
    );
  }

  function journalPath(
    transactionId
  ) {
    if (
      !VALID_TRANSACTION_ID.test(
        clean(
          transactionId
        )
      )
    ) {
      throw new Error(
        "autonomous_repair_execution_transaction_id_invalid"
      );
    }

    return path.join(
      directories.journals,
      `${transactionId}.json`
    );
  }

  function replayPath(
    replayKey
  ) {
    if (
      !VALID_SHA.test(
        clean(
          replayKey
        )
      )
    ) {
      throw new Error(
        "autonomous_repair_execution_replay_key_invalid"
      );
    }

    return path.join(
      directories.replay,
      `${replayKey}.json`
    );
  }

  function auditPath(
    transactionId,
    terminalState
  ) {
    if (
      !VALID_TRANSACTION_ID.test(
        clean(
          transactionId
        )
      ) ||
      !TERMINAL_STATES.has(
        terminalState
      )
    ) {
      throw new Error(
        "autonomous_repair_execution_audit_path_identity_invalid"
      );
    }

    return path.join(
      directories.audits,
      `${transactionId}.${terminalState}.json`
    );
  }

  const adapter = {
    externalStateRoot:
      roots.externalStateRoot,

    projectRoot:
      roots.projectRoot,

    acquireGlobalExecutionLockAtomically({
      transactionId,
      authorizationId,
      transactionFingerprint,
      acquiredAt
    } = {}) {
      if (
        !VALID_TRANSACTION_ID.test(
          clean(
            transactionId
          )
        ) ||
        !VALID_AUTHORIZATION_ID.test(
          clean(
            authorizationId
          )
        ) ||
        !VALID_SHA.test(
          clean(
            transactionFingerprint
          )
        ) ||
        !canonicalTimestamp(
          acquiredAt
        )
      ) {
        throw new Error(
          "autonomous_repair_execution_lock_identity_invalid"
        );
      }

      const record = {
        schema:
          AUTONOMOUS_REPAIR_EXECUTION_LOCK_SCHEMA,
        version:
          AUTONOMOUS_REPAIR_EXTERNAL_EXECUTION_STATE_VERSION,
        transactionId,
        authorizationId,
        transactionFingerprint,
        acquiredAt
      };

      validateAutonomousRepairExecutionLockArtifact(
        record
      );

      try {
        return {
          record,
          persisted:
            writeExclusiveDurable(
              lockPath(),
              record
            )
        };
      } catch (error) {
        if (
          error?.code ===
            "EEXIST"
        ) {
          let owner =
            "unknown";

          try {
            owner =
              JSON.parse(
                fs.readFileSync(
                  lockPath(),
                  "utf8"
                )
              )?.transactionId ??
              "unknown";
          } catch {
            // Fail closed and preserve lock.
          }

          throw new Error(
            `autonomous_repair_execution_global_lock_held:${owner}`
          );
        }

        throw error;
      }
    },

    readGlobalExecutionLock() {
      const filePath =
        lockPath();

      if (
        !fs.existsSync(
          filePath
        )
      ) {
        return null;
      }

      return readJsonArtifact(
        filePath,
        validateAutonomousRepairExecutionLockArtifact
      );
    },

    releaseGlobalExecutionLock({
      transactionId
    } = {}) {
      if (
        !VALID_TRANSACTION_ID.test(
          clean(
            transactionId
          )
        )
      ) {
        throw new Error(
          "autonomous_repair_execution_transaction_id_invalid"
        );
      }

      const filePath =
        lockPath();

      if (
        !fs.existsSync(
          filePath
        )
      ) {
        throw new Error(
          "autonomous_repair_execution_global_lock_missing"
        );
      }

      const record =
        readJsonArtifact(
          filePath,
          validateAutonomousRepairExecutionLockArtifact
        );

      if (
        record?.transactionId !==
          transactionId
      ) {
        throw new Error(
          "autonomous_repair_execution_global_lock_owner_mismatch"
        );
      }

      fs.unlinkSync(
        filePath
      );

      return true;
    },

    readTransactionJournal({
      transactionId
    } = {}) {
      const filePath =
        journalPath(
          transactionId
        );

      if (
        !fs.existsSync(
          filePath
        )
      ) {
        return null;
      }

      return readJsonArtifact(
        filePath,
        validateAutonomousRepairExecutionJournalArtifact
      );
    },

    listTransactionJournals() {
      return fs
        .readdirSync(
          directories.journals
        )
        .filter(
          name =>
            /^artxn_v1_[0-9a-f]{32}\.json$/u.test(
              name
            )
        )
        .sort()
        .map(
          name =>
            readJsonArtifact(
              path.join(
                directories.journals,
                name
              ),
              validateAutonomousRepairExecutionJournalArtifact
            )
        );
    },

    writeOrAdvanceTransactionJournalAtomically({
      journal
    } = {}) {
      validateAutonomousRepairExecutionJournalArtifact(
        journal
      );

      const filePath =
        journalPath(
          journal.transactionId
        );

      if (
        fs.existsSync(
          filePath
        )
      ) {
        const previous =
          readJsonArtifact(
            filePath,
            validateAutonomousRepairExecutionJournalArtifact
          );

        assertJournalAdvance(
          previous,
          journal
        );
      } else if (
        journal.state !==
          AUTONOMOUS_REPAIR_EXECUTION_JOURNAL_STATE.PREPARED
      ) {
        throw new Error(
          "autonomous_repair_execution_journal_initial_state_invalid"
        );
      }

      return writeAtomicDurable(
        filePath,
        journal
      );
    },

    consumeOnceAtomically({
      replayKey,
      authorizationId,
      authorizationFingerprint,
      transactionId,
      consumedAt
    } = {}) {
      if (
        !VALID_SHA.test(
          clean(
            replayKey
          )
        ) ||
        !VALID_AUTHORIZATION_ID.test(
          clean(
            authorizationId
          )
        ) ||
        !VALID_SHA.test(
          clean(
            authorizationFingerprint
          )
        ) ||
        !VALID_TRANSACTION_ID.test(
          clean(
            transactionId
          )
        ) ||
        !canonicalTimestamp(
          consumedAt
        )
      ) {
        throw new Error(
          "autonomous_repair_execution_replay_consumption_identity_invalid"
        );
      }

      const record = {
        schema:
          "ai-matchlab.autonomous-repair-replay-consumption.v1",
        version:
          AUTONOMOUS_REPAIR_EXTERNAL_EXECUTION_STATE_VERSION,
        replayKey,
        authorizationId,
        authorizationFingerprint,
        transactionId,
        consumedAt
      };

      validateAutonomousRepairReplayConsumptionArtifact(
        record
      );

      try {
        const persisted =
          writeExclusiveDurable(
            replayPath(
              replayKey
            ),
            record
          );

        return {
          consumed:
            true,
          record,
          persisted
        };
      } catch (error) {
        if (
          error?.code ===
            "EEXIST"
        ) {
          throw new Error(
            "autonomous_repair_execution_replay_already_consumed"
          );
        }

        throw error;
      }
    },

    readReplayConsumption({
      replayKey
    } = {}) {
      const filePath =
        replayPath(
          replayKey
        );

      if (
        !fs.existsSync(
          filePath
        )
      ) {
        return null;
      }

      return readJsonArtifact(
        filePath,
        validateAutonomousRepairReplayConsumptionArtifact
      );
    },

    readExecutionAudit({
      transactionId,
      terminalState
    } = {}) {
      const filePath =
        auditPath(
          transactionId,
          terminalState
        );

      if (
        !fs.existsSync(
          filePath
        )
      ) {
        return null;
      }

      return readJsonArtifact(
        filePath,
        validateAutonomousRepairExecutionAuditArtifact
      );
    },

    inspectRecoveryObligations({
      ignoreLockTransactionId =
        null
    } = {}) {
      if (
        ignoreLockTransactionId !==
          null &&
        !VALID_TRANSACTION_ID.test(
          clean(
            ignoreLockTransactionId
          )
        )
      ) {
        throw new Error(
          "autonomous_repair_execution_recovery_ignore_lock_id_invalid"
        );
      }

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

      const unfinishedJournals =
        journals.filter(
          journal =>
            !TERMINAL_STATES.has(
              journal.state
            )
        );

      const terminalJournalsMissingAudit =
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
          unfinishedJournals.length ===
            0 &&
          terminalJournalsMissingAudit.length ===
            0,

        blockingLock,

        unfinishedTransactionIds:
          unfinishedJournals.map(
            journal =>
              journal.transactionId
          ),

        terminalAuditMissing:
          terminalJournalsMissingAudit.map(
            journal => ({
              transactionId:
                journal.transactionId,
              terminalState:
                journal.state
            })
          )
      };
    },

    writeExecutionAuditAtomically({
      audit
    } = {}) {
      validateAutonomousRepairExecutionAuditArtifact(
        audit
      );

      return writeExclusiveDurable(
        auditPath(
          audit.transactionId,
          audit.terminalState
        ),
        audit
      );
    }
  };

  validateAutonomousRepairAuthorizationReplayLedgerAdapter(
    adapter
  );

  return adapter;
}
