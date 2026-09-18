import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  AUTONOMOUS_REPAIR_SYSTEM_HEALTH_CODE,
  AUTONOMOUS_REPAIR_SYSTEM_HEALTH_MODE,
  AUTONOMOUS_REPAIR_SYSTEM_HEALTH_SCHEMA,
  AUTONOMOUS_REPAIR_SYSTEM_HEALTH_STATUS,
  AUTONOMOUS_REPAIR_SYSTEM_HEALTH_VERSION,
  buildAutonomousRepairSystemHealthFacts
} from "./autonomous-repair-system-health.js";

const here =
  path.dirname(
    fileURLToPath(
      import.meta.url
    )
  );

const source =
  fs.readFileSync(
    path.join(
      here,
      "autonomous-repair-system-health.js"
    ),
    "utf8"
  );

test(
  "autonomous repair system health contract constants are exact",
  () => {
    assert.equal(
      AUTONOMOUS_REPAIR_SYSTEM_HEALTH_SCHEMA,
      "ai-matchlab.autonomous-repair-system-health.v1"
    );

    assert.equal(
      AUTONOMOUS_REPAIR_SYSTEM_HEALTH_VERSION,
      "1.0.0"
    );

    assert.equal(
      AUTONOMOUS_REPAIR_SYSTEM_HEALTH_MODE.OBSERVABILITY_ONLY,
      "OBSERVABILITY_ONLY"
    );

    assert.equal(
      AUTONOMOUS_REPAIR_SYSTEM_HEALTH_STATUS.EXPECTED_FAIL_CLOSED,
      "EXPECTED_FAIL_CLOSED"
    );
  }
);

test(
  "current production readiness maps to informational fail-closed health facts",
  () => {
    const facts =
      buildAutonomousRepairSystemHealthFacts();

    assert.equal(
      facts.role,
      "read_only_autonomous_repair_health_facts"
    );

    assert.equal(
      facts.mode,
      "OBSERVABILITY_ONLY"
    );

    assert.equal(
      facts.status,
      "EXPECTED_FAIL_CLOSED"
    );

    assert.equal(
      facts.systemHealthSeverity,
      "info"
    );

    assert.equal(
      facts.code,
      AUTONOMOUS_REPAIR_SYSTEM_HEALTH_CODE.PRODUCTION_KERNEL_DISABLED
    );

    assert.equal(
      facts.executionAvailable,
      false
    );

    assert.equal(
      facts.readiness.trustedKeyCount,
      1
    );

    assert.equal(
      facts.readiness.productionKernelEnabled,
      false
    );
  }
);

test(
  "system health facts preserve the no-authority boundary",
  () => {
    const facts =
      buildAutonomousRepairSystemHealthFacts();

    assert.deepEqual(
      facts.authority,
      {
        readOnly:
          true,

        filesystemWriteAuthorized:
          false,

        repairAuthorized:
          false,

        executionAuthorized:
          false,

        rollbackExecutionAuthorized:
          false,

        replayConsumptionAuthorized:
          false,

        workflowMutationAuthorized:
          false
      }
    );
  }
);

test(
  "system health facts preserve pinned-trust and caller-boundary requirements",
  () => {
    const facts =
      buildAutonomousRepairSystemHealthFacts();

    assert.equal(
      facts.readiness.pinnedTrustRequired,
      true
    );

    assert.equal(
      facts.readiness.callerSuppliedTrustForbidden,
      true
    );

    assert.equal(
      facts.readiness.callerSuppliedProjectRootForbidden,
      true
    );
  }
);

test(
  "system health artifact is frozen and deterministic",
  () => {
    const a =
      buildAutonomousRepairSystemHealthFacts();

    const b =
      buildAutonomousRepairSystemHealthFacts();

    assert.ok(
      Object.isFrozen(
        a
      )
    );

    assert.ok(
      Object.isFrozen(
        a.readiness
      )
    );

    assert.ok(
      Object.isFrozen(
        a.authority
      )
    );

    assert.deepEqual(
      a,
      b
    );
  }
);

test(
  "health adapter source exposes observability only and no execution surface",
  () => {
    for (const forbidden of [
      "node:fs",
      "node:path",
      "node:os",
      "autonomous-repair-filesystem-transaction-kernel",
      "autonomous-repair-external-execution-state",
      "executeAutonomousRepairProductionExecution",
      "prepareAutonomousRepairProductionExecutionWithPinnedTrust",
      "consumeOnceAtomically",
      "writeFile",
      "renameSync",
      "unlinkSync"
    ]) {
      assert.equal(
        source.includes(
          forbidden
        ),
        false,
        `forbidden source token: ${forbidden}`
      );
    }

    assert.equal(
      source.includes(
        "inspectAutonomousRepairProductionExecutionReadiness"
      ),
      true
    );
  }
);
