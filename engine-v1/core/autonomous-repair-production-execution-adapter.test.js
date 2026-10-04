import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import {
  AUTONOMOUS_REPAIR_PRODUCTION_EXECUTION_ADAPTER_VERSION,
  executeAutonomousRepairProductionExecutionAdapter
} from "./autonomous-repair-production-execution-adapter.js";

const SOURCE =
  fs.readFileSync(
    fileURLToPath(
      new URL(
        "./autonomous-repair-production-execution-adapter.js",
        import.meta.url
      )
    ),
    "utf8"
  );

function isolationCase(
  number,
  title,
  body
) {
  test(
    `ISOLATION_CASE_${String(number).padStart(2, "0")} ${title}`,
    body
  );
}

function invalidPreparedInput(
  extra = {}
) {
  return {
    transactionPlan:
      {},
    materialResolution:
      {},
    ...extra
  };
}

isolationCase(
  1,
  "adapter version is explicit and stable",
  () => {
    assert.equal(
      AUTONOMOUS_REPAIR_PRODUCTION_EXECUTION_ADAPTER_VERSION,
      "1.0.0"
    );
  }
);

isolationCase(
  2,
  "adapter delegates execution only to the production filesystem transaction kernel",
  () => {
    assert.match(
      SOURCE,
      /executeAutonomousRepairFilesystemTransactionProduction/u
    );

    assert.match(
      SOURCE,
      /autonomous-repair-production-filesystem-transaction-kernel\.js/u
    );

    assert.equal(
      (
        SOURCE.match(
          /executeAutonomousRepairFilesystemTransactionProduction\(\{/gu
        ) ??
        []
      ).length,
      1
    );
  }
);

isolationCase(
  3,
  "adapter creates execution state only from the validated production root policy",
  () => {
    assert.match(
      SOURCE,
      /resolveAutonomousRepairProductionRoots\(\)/u
    );

    assert.match(
      SOURCE,
      /createAutonomousRepairExternalExecutionStateAdapter\(\{/u
    );

    assert.equal(
      (
        SOURCE.match(
          /resolveAutonomousRepairProductionRoots\(\)/gu
        ) ??
        []
      ).length,
      1
    );
  }
);

isolationCase(
  4,
  "adapter is isolated from the production entrypoint sandbox kernel and shared transaction core",
  () => {
    for (
      const forbidden of [
        "autonomous-repair-production-execution-entrypoint.js",
        "autonomous-repair-filesystem-transaction-kernel.js",
        "autonomous-repair-filesystem-transaction-core.js"
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

isolationCase(
  5,
  "adapter contains no direct filesystem environment or transaction algorithm capability",
  () => {
    for (
      const forbidden of [
        "node:fs",
        "node:path",
        "node:os",
        "process.env",
        "function executeCore",
        "acquireGlobalExecutionLockAtomically(",
        "consumeOnceAtomically(",
        "writeOrAdvanceTransactionJournalAtomically(",
        "createVerifiedBackups(",
        "createVerifiedTemps(",
        "rollbackFromJournal("
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

isolationCase(
  6,
  "adapter rejects every caller-supplied production root authority field",
  () => {
    for (
      const extra of [
        {
          projectRoot:
            "/caller"
        },
        {
          externalStateRoot:
            "/caller"
        },
        {
          externalBackupRoot:
            "/caller"
        },
        {
          roots:
            {}
        }
      ]
    ) {
      assert.throws(
        () =>
          executeAutonomousRepairProductionExecutionAdapter(
            invalidPreparedInput(
              extra
            )
          ),
        /caller_filesystem_authority_forbidden/u
      );
    }
  }
);

isolationCase(
  7,
  "adapter rejects caller-supplied state adapter authority",
  () => {
    assert.throws(
      () =>
        executeAutonomousRepairProductionExecutionAdapter(
          invalidPreparedInput({
            stateAdapter:
              {}
          })
        ),
      /caller_filesystem_authority_forbidden/u
    );
  }
);

isolationCase(
  8,
  "adapter accepts only the prepared transaction plan and material resolution surface",
  () => {
    assert.throws(
      () =>
        executeAutonomousRepairProductionExecutionAdapter(
          invalidPreparedInput({
            authorization:
              {}
          })
        ),
      /input_keys_invalid/u
    );

    assert.throws(
      () =>
        executeAutonomousRepairProductionExecutionAdapter(
          null
        ),
      /input_object_required/u
    );
  }
);

isolationCase(
  9,
  "adapter validates prepared artifacts before production roots state creation or kernel delegation",
  () => {
    const transactionValidationIndex =
      SOURCE.indexOf(
        "validateAutonomousRepairExecutionTransactionPlanArtifact("
      );

    const materialValidationIndex =
      SOURCE.indexOf(
        "validateAutonomousRepairSourceBoundMaterialResolution("
      );

    const rootResolutionIndex =
      SOURCE.indexOf(
        "resolveAutonomousRepairProductionRoots()"
      );

    const delegateIndex =
      SOURCE.indexOf(
        "executeAutonomousRepairFilesystemTransactionProduction({"
      );

    assert.ok(
      transactionValidationIndex >=
        0
    );

    assert.ok(
      materialValidationIndex >
        transactionValidationIndex
    );

    assert.ok(
      rootResolutionIndex >
        materialValidationIndex
    );

    assert.ok(
      delegateIndex >
        rootResolutionIndex
    );

    assert.throws(
      () =>
        executeAutonomousRepairProductionExecutionAdapter(
          invalidPreparedInput()
        ),
      /autonomous_repair_execution_transaction_plan/u
    );
  }
);
