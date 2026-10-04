import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import {
  AUTONOMOUS_REPAIR_PRODUCTION_FILESYSTEM_TRANSACTION_KERNEL_VERSION,
  executeAutonomousRepairFilesystemTransactionProduction,
  recoverAutonomousRepairFilesystemTransactionProduction
} from "./autonomous-repair-production-filesystem-transaction-kernel.js";

const SOURCE =
  fs.readFileSync(
    fileURLToPath(
      new URL(
        "./autonomous-repair-production-filesystem-transaction-kernel.js",
        import.meta.url
      )
    ),
    "utf8"
  );

function parityCase(
  number,
  title,
  body
) {
  test(
    `PARITY_CASE_${String(number).padStart(2, "0")} ${title}`,
    body
  );
}

function invalidExecutionInput(
  extra = {}
) {
  return {
    transactionPlan:
      {},
    materialResolution:
      null,
    stateAdapter:
      null,
    ...extra
  };
}

function invalidRecoveryInput(
  extra = {}
) {
  return {
    transactionId:
      "invalid",
    transactionPlan:
      {},
    materialResolution:
      null,
    stateAdapter:
      null,
    ...extra
  };
}

parityCase(
  1,
  "production kernel version is explicit and stable",
  () => {
    assert.equal(
      AUTONOMOUS_REPAIR_PRODUCTION_FILESYSTEM_TRANSACTION_KERNEL_VERSION,
      "1.0.0"
    );
  }
);

parityCase(
  2,
  "production kernel delegates to the shared transaction core",
  () => {
    assert.match(
      SOURCE,
      /executeAutonomousRepairFilesystemTransactionCore/u
    );

    assert.match(
      SOURCE,
      /recoverAutonomousRepairFilesystemTransactionCore/u
    );

    assert.match(
      SOURCE,
      /autonomous-repair-filesystem-transaction-core\.js/u
    );
  }
);

parityCase(
  3,
  "production kernel uses the production root policy and never the sandbox kernel",
  () => {
    assert.match(
      SOURCE,
      /resolveAutonomousRepairProductionRoots/u
    );

    assert.match(
      SOURCE,
      /resolveAutonomousRepairProductionTarget/u
    );

    assert.doesNotMatch(
      SOURCE,
      /autonomous-repair-filesystem-transaction-kernel\.js/u
    );

    assert.doesNotMatch(
      SOURCE,
      /node:os|os\.tmpdir/u
    );
  }
);

parityCase(
  4,
  "production kernel contains no duplicated transaction algorithm",
  () => {
    for (
      const forbidden of [
        "function executeCore",
        "acquireGlobalExecutionLockAtomically(",
        "consumeOnceAtomically(",
        "writeOrAdvanceTransactionJournalAtomically(",
        "createVerifiedBackups(",
        "createVerifiedTemps(",
        "rollbackFromJournal(",
        "restoreReplaceOperation(",
        "rollbackCreateOperation("
      ]
    ) {
      assert.equal(
        SOURCE.includes(
          forbidden
        ),
        false,
        forbidden
      );
    }
  }
);

parityCase(
  5,
  "execute rejects caller projectRoot authority",
  () => {
    assert.throws(
      () =>
        executeAutonomousRepairFilesystemTransactionProduction(
          invalidExecutionInput({
            projectRoot:
              "/caller"
          })
        ),
      /caller_root_authority_forbidden/u
    );
  }
);

parityCase(
  6,
  "execute rejects caller externalStateRoot authority",
  () => {
    assert.throws(
      () =>
        executeAutonomousRepairFilesystemTransactionProduction(
          invalidExecutionInput({
            externalStateRoot:
              "/caller"
          })
        ),
      /caller_root_authority_forbidden/u
    );
  }
);

parityCase(
  7,
  "execute rejects caller externalBackupRoot authority",
  () => {
    assert.throws(
      () =>
        executeAutonomousRepairFilesystemTransactionProduction(
          invalidExecutionInput({
            externalBackupRoot:
              "/caller"
          })
        ),
      /caller_root_authority_forbidden/u
    );
  }
);

parityCase(
  8,
  "execute rejects caller roots object authority",
  () => {
    assert.throws(
      () =>
        executeAutonomousRepairFilesystemTransactionProduction(
          invalidExecutionInput({
            roots:
              {}
          })
        ),
      /caller_root_authority_forbidden/u
    );
  }
);

parityCase(
  9,
  "execute rejects sandboxOnly and every other unplanned input key",
  () => {
    assert.throws(
      () =>
        executeAutonomousRepairFilesystemTransactionProduction(
          invalidExecutionInput({
            sandboxOnly:
              true
          })
        ),
      /execute_input_keys_invalid/u
    );
  }
);

parityCase(
  10,
  "recover rejects caller root authority",
  () => {
    assert.throws(
      () =>
        recoverAutonomousRepairFilesystemTransactionProduction(
          invalidRecoveryInput({
            projectRoot:
              "/caller"
          })
        ),
      /caller_root_authority_forbidden/u
    );
  }
);

parityCase(
  11,
  "execute preserves plan-validation-before-root-resolution ordering",
  () => {
    assert.throws(
      () =>
        executeAutonomousRepairFilesystemTransactionProduction(
          invalidExecutionInput()
        ),
      /autonomous_repair_execution_transaction_plan/u
    );
  }
);

parityCase(
  12,
  "recover preserves plan-validation-before-root-resolution ordering",
  () => {
    assert.throws(
      () =>
        recoverAutonomousRepairFilesystemTransactionProduction(
          invalidRecoveryInput()
        ),
      /autonomous_repair_execution_transaction_plan/u
    );
  }
);

parityCase(
  13,
  "execute and recovery each resolve production roots and delegate exactly once",
  () => {
    const executeBody =
      SOURCE.slice(
        SOURCE.indexOf(
          "export function executeAutonomousRepairFilesystemTransactionProduction"
        ),
        SOURCE.indexOf(
          "export function recoverAutonomousRepairFilesystemTransactionProduction"
        )
      );

    const recoverBody =
      SOURCE.slice(
        SOURCE.indexOf(
          "export function recoverAutonomousRepairFilesystemTransactionProduction"
        )
      );

    assert.equal(
      (
        executeBody.match(
          /resolveAutonomousRepairProductionRoots\(\)/gu
        ) ??
        []
      ).length,
      1
    );

    assert.equal(
      (
        recoverBody.match(
          /resolveAutonomousRepairProductionRoots\(\)/gu
        ) ??
        []
      ).length,
      1
    );

    assert.equal(
      (
        executeBody.match(
          /executeAutonomousRepairFilesystemTransactionCore\(\{/gu
        ) ??
        []
      ).length,
      1
    );

    assert.equal(
      (
        recoverBody.match(
          /recoverAutonomousRepairFilesystemTransactionCore\(\{/gu
        ) ??
        []
      ).length,
      1
    );
  }
);
