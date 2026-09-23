import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  CHECKPOINT_AWARE_VALUE_COMPARISON_AUTH_TRANSACTION_DESIGN_STATE,
  buildCheckpointAwareValueComparisonAuthTransactionSchemaDesign,
  checkpointAwareValueComparisonAuthTransactionDesignFingerprint
} from "../core/checkpoint-aware-targeted-value-comparison-authorization-transaction-schema-design.js";

const DAY =
  "2026-09-23";

function disabledAdapter() {
  return {
    mode:
      "DISABLED_PRODUCTION_TRANSACTION_ADAPTER_CONTRACT",

    route: {
      failureClass:
        "VALUE_PLAN_COMPARISON_STALE_AGAINST_CANONICAL",

      repairUnit:
        "rebuild_day_value_comparison_and_cumulative_only",

      dedicatedRepairClass:
        "REBUILD_VALUE_COMPARISON_ONLY"
    },

    authority: {
      adapterEnabled:
        false,

      mutableExecutionAuthorized:
        false,

      signerUseAuthorized:
        false,

      protectedPathBypassAuthorized:
        false
    }
  };
}

function design() {
  return buildCheckpointAwareValueComparisonAuthTransactionSchemaDesign({
    dayKey:
      DAY,

    disabledAdapterContract:
      disabledAdapter()
  });
}

test(
  "dedicated schema design remains disabled and exactly scoped to the two value-comparison targets",
  () => {
    const artifact =
      design();

    assert.equal(
      artifact.designState,
      CHECKPOINT_AWARE_VALUE_COMPARISON_AUTH_TRANSACTION_DESIGN_STATE
    );

    assert.deepEqual(
      artifact.exactTargetUniverse,
      [
        `data/value-comparison/${DAY}.json`,
        "data/value-comparison/cumulative.json"
      ]
    );

    assert.equal(
      artifact.route.dedicatedRepairClass,
      "REBUILD_VALUE_COMPARISON_ONLY"
    );

    assert.equal(
      artifact.authority.schemaDesignOnly,
      true
    );

    assert.equal(
      artifact.authority.mutableExecutionAuthorized,
      false
    );
  }
);

test(
  "authorization design preserves external Ed25519 signing pinned trust and short lifetime without signer use",
  () => {
    const artifact =
      design();

    assert.equal(
      artifact.authorizationSchema.signature.algorithm,
      "Ed25519"
    );

    assert.equal(
      artifact.authorizationSchema.signature.externalSignerRequired,
      true
    );

    assert.equal(
      artifact.authorizationSchema.signature.repositoryPrivateKeyForbidden,
      true
    );

    assert.equal(
      artifact.authorizationSchema.signature.runtimePrivateKeyInputForbidden,
      true
    );

    assert.equal(
      artifact.authorizationSchema.signature.pinnedPublicKeyTrustRequired,
      true
    );

    assert.equal(
      artifact.authorizationSchema.validity.maxLifetimeMs,
      15 * 60 * 1000
    );

    assert.equal(
      artifact.authority.signerUseAuthorized,
      false
    );
  }
);

test(
  "dedicated replay design is single-use external and requires a new authorization after failure",
  () => {
    const artifact =
      design();

    assert.equal(
      artifact.replayContract.ledgerLocation,
      "outside_repository_and_planning_pipeline"
    );

    assert.equal(
      artifact.replayContract.atomicConsumeRequired,
      true
    );

    assert.equal(
      artifact.replayContract.releaseAfterFailure,
      false
    );

    assert.equal(
      artifact.replayContract.retryRequiresNewAuthorization,
      true
    );
  }
);

test(
  "transaction design is replace-only all-or-nothing with exact preimage backup and reverse rollback",
  () => {
    const artifact =
      design();

    assert.equal(
      artifact.transactionPlanSchema.operationScope.mutationMode,
      "REPLACE_ONLY"
    );

    assert.equal(
      artifact.transactionPlanSchema.operationScope.createForbidden,
      true
    );

    assert.equal(
      artifact.transactionPlanSchema.operationScope.maxOperations,
      2
    );

    assert.equal(
      artifact.transactionPlanSchema.safety.verifiedBackupRequiredForEveryReplace,
      true
    );

    assert.equal(
      artifact.transactionPlanSchema.safety.reverseRollbackRequired,
      true
    );

    assert.equal(
      artifact.transactionPlanSchema.safety.allTargetsAppliedOrVerifiedRestored,
      true
    );
  }
);

test(
  "legacy autonomous repair schemas stay untouched and no protected-path bypass is designed",
  () => {
    const artifact =
      design();

    assert.equal(
      artifact.legacyCompatibility.legacyAuthorizationV2Modified,
      false
    );

    assert.equal(
      artifact.legacyCompatibility.legacyTransactionPlanModified,
      false
    );

    assert.equal(
      artifact.legacyCompatibility.maySilentlyAddDedicatedRepairClassToLegacySchemas,
      false
    );

    assert.equal(
      artifact.kernelBoundary.existingGenericKernelCompatible,
      false
    );

    assert.equal(
      artifact.kernelBoundary.protectedPathBypassAuthorized,
      false
    );

    assert.equal(
      artifact.authority.protectedPathBypassAuthorized,
      false
    );
  }
);

test(
  "design fingerprint is stable and runner contains no signing kernel mutation push or deploy machinery",
  () => {
    const artifact =
      design();

    assert.equal(
      artifact.designFingerprint,
      checkpointAwareValueComparisonAuthTransactionDesignFingerprint(
        artifact
      )
    );

    const source =
      fs.readFileSync(
        new URL(
          "../jobs/run-checkpoint-aware-targeted-value-comparison-authorization-transaction-schema-design-day.js",
          import.meta.url
        ),
        "utf8"
      );

    const forbiddenPatterns = [
      /\bcreatePrivateKey\b/u,
      /\bprivateKey(?:Pem|Path)?\s*[:=]/u,
      /\bsign\s*\(/u,
      /\bverifySignature\b/u,
      /\bexecuteAutonomousRepairProductionExecution\b/u,
      /\bexecuteAutonomousRepairFilesystemTransaction\b/u,
      /\bgit\s+push\b/u,
      /\bgit\s+commit\b/u,
      /\bworkflow_dispatch\b/u,
      /\bRENDER_/u
    ];

    for (
      const forbiddenPattern of
        forbiddenPatterns
    ) {
      assert.equal(
        forbiddenPattern.test(
          source
        ),
        false,
        `R14 runner must not match ${forbiddenPattern}`
      );
    }
  }
);
