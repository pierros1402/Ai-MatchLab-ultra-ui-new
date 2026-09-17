import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import {
  generateKeyPairSync,
  sign
} from "node:crypto";

import {
  AUTONOMOUS_REPAIR_AUTHORIZATION_TRUSTED_PUBLIC_KEYS,
  publicKeySpkiSha256
} from "./autonomous-repair-authorization-trusted-public-keys.js";

import {
  AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2_SCHEMA,
  AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2_VERSION,
  AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2_POLICY_VERSION,
  autonomousRepairExecutionAuthorizationV2Fingerprint,
  autonomousRepairExecutionAuthorizationV2SigningBytes
} from "./autonomous-repair-execution-authorization-v2.js";

import {
  AUTONOMOUS_REPAIR_PRODUCTION_EXECUTION_STATE,
  inspectAutonomousRepairProductionExecutionReadiness,
  prepareAutonomousRepairProductionExecutionWithPinnedTrust,
  executeAutonomousRepairProductionExecution
} from "./autonomous-repair-production-execution-entrypoint.js";

function ephemeralAuthorization() {
  const {
    publicKey,
    privateKey
  } =
    generateKeyPairSync(
      "ed25519"
    );

  const publicKeyPem =
    publicKey.export({
      type:
        "spki",
      format:
        "pem"
    });

  const authorization = {
    schema:
      AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2_SCHEMA,

    version:
      AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2_VERSION,

    dayKey:
      "2026-09-17",

    generatedAt:
      "2026-09-17T18:00:00.000Z",

    role:
      "externally_signed_bounded_execution_authorization",

    authorizationId:
      "arauth_v2_0123456789abcdef0123456789abcdef",

    nonce:
      "arnonce_v2_" +
      "a".repeat(64),

    issuedAt:
      "2026-09-17T18:00:00.000Z",

    notBefore:
      "2026-09-17T18:00:05.000Z",

    expiresAt:
      "2026-09-17T18:10:00.000Z",

    policyVersion:
      AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2_POLICY_VERSION,

    authorizationState:
      "AUTHORIZED",

    authorizationBasis: {
      source:
        "external_control_plane",

      issuerId:
        "test-external-control-plane",

      keyId:
        "arkey_v1_runtime-test",

      publicKeySpkiSha256:
        publicKeySpkiSha256(
          publicKeyPem
        ),

      decisionFingerprint:
        "b".repeat(64)
    },

    bindings: {
      requestFingerprint:
        "1".repeat(64),

      planFingerprint:
        "2".repeat(64),

      verificationFingerprint:
        "3".repeat(64),

      materialResolutionFingerprint:
        "4".repeat(64)
    },

    repairClassScope: [
      "ACQUIRE_VERIFIED_FINAL_EVIDENCE"
    ],

    operationScope: [
      {
        operationId:
          "arpo_v1_aaaaaaaaaaaaaaaaaaaaaaaa",

        targetPath:
          "data/final-results/2026-09-17/canonical-a.json",

        mutationMode:
          "CREATE",

        preimageFingerprint:
          "5".repeat(64),

        repairClass:
          "ACQUIRE_VERIFIED_FINAL_EVIDENCE"
      }
    ],

    safety: {
      exactRequestScopeOnly:
        true,

      preimageReverificationRequired:
        true,

      atomicWriteRequired:
        true,

      postWriteAuditRequired:
        true,

      rollbackRequired:
        true,

      singleUseRequired:
        true
    },

    authority: {
      artifactReadOnly:
        true,

      authorizationGranted:
        true,

      filesystemWriteAuthorized:
        true,

      repairAuthorized:
        true,

      executionAuthorized:
        true,

      rollbackExecutionAuthorized:
        true,

      workflowMutationAuthorized:
        false
    },

    authorizationFingerprint:
      null,

    signature: {
      algorithm:
        "Ed25519",

      encoding:
        "base64",

      value:
        "AA=="
    }
  };

  authorization.authorizationFingerprint =
    autonomousRepairExecutionAuthorizationV2Fingerprint(
      authorization
    );

  authorization.signature.value =
    sign(
      null,
      autonomousRepairExecutionAuthorizationV2SigningBytes(
        authorization
      ),
      privateKey
    ).toString(
      "base64"
    );

  return authorization;
}

function productionOptions() {
  return {
    authorization:
      ephemeralAuthorization(),

    executionRequest:
      Object.freeze({}),

    targetVerification:
      Object.freeze({}),

    materialResolution:
      Object.freeze({}),

    generatedAt:
      "2026-09-17T18:00:06.000Z",

    now:
      "2026-09-17T18:00:06.000Z"
  };
}

test(
  "production readiness is fail-closed while the pinned trusted-key registry is empty",
  () => {
    assert.equal(
      AUTONOMOUS_REPAIR_AUTHORIZATION_TRUSTED_PUBLIC_KEYS.length,
      0
    );

    const readiness =
      inspectAutonomousRepairProductionExecutionReadiness();

    assert.equal(
      readiness.state,
      AUTONOMOUS_REPAIR_PRODUCTION_EXECUTION_STATE.BLOCKED_NO_PINNED_TRUST
    );

    assert.equal(
      readiness.trustedKeyCount,
      0
    );

    assert.equal(
      readiness.productionKernelEnabled,
      false
    );

    assert.deepEqual(
      readiness.authority,
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
  "production preflight rejects caller-supplied public key or trust registry surface",
  () => {
    for (
      const extra of [
        {
          publicKey:
            "caller-key"
        },
        {
          trustRegistry:
            []
        },
        {
          trustedKeyRecord:
            {}
        }
      ]
    ) {
      assert.throws(
        () =>
          prepareAutonomousRepairProductionExecutionWithPinnedTrust({
            ...productionOptions(),
            ...extra
          }),
        /autonomous_repair_production_execution_preflight_input_keys_invalid/
      );
    }
  }
);

test(
  "production preflight rejects caller-supplied project state or backup roots",
  () => {
    for (
      const extra of [
        {
          projectRoot:
            "C:\\arbitrary"
        },
        {
          externalStateRoot:
            "C:\\state"
        },
        {
          externalBackupRoot:
            "C:\\backup"
        }
      ]
    ) {
      assert.throws(
        () =>
          prepareAutonomousRepairProductionExecutionWithPinnedTrust({
            ...productionOptions(),
            ...extra
          }),
        /autonomous_repair_production_execution_preflight_input_keys_invalid/
      );
    }
  }
);

test(
  "valid externally-signed authorization from an unpinned ephemeral key fails exactly at pinned trust",
  () => {
    assert.throws(
      () =>
        prepareAutonomousRepairProductionExecutionWithPinnedTrust(
          productionOptions()
        ),
      /autonomous_repair_execution_authorization_v2_trusted_key_not_found/
    );
  }
);

test(
  "production execution fails at pinned trust before any transaction plan can be returned",
  () => {
    assert.throws(
      () =>
        executeAutonomousRepairProductionExecution(
          productionOptions()
        ),
      /autonomous_repair_execution_authorization_v2_trusted_key_not_found/
    );
  }
);

test(
  "malformed authorization fails validation before any production readiness can be inferred",
  () => {
    const options =
      productionOptions();

    options.authorization.signature.value =
      "not-base64!";

    assert.throws(
      () =>
        prepareAutonomousRepairProductionExecutionWithPinnedTrust(
          options
        ),
      /autonomous_repair_execution_authorization_v2_signature_encoding_invalid/
    );
  }
);

test(
  "production entrypoint source contains no filesystem state or sandbox-kernel import",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "./autonomous-repair-production-execution-entrypoint.js",
          import.meta.url
        ),
        "utf8"
      );

    for (
      const forbidden of [
        "node:fs",
        "node:path",
        "node:os",
        "autonomous-repair-filesystem-transaction-kernel",
        "autonomous-repair-external-execution-state",
        "createAutonomousRepairExternalExecutionStateAdapter"
      ]
    ) {
      assert.equal(
        source.includes(
          forbidden
        ),
        false,
        forbidden
      );
    }
  }
);

test(
  "production entrypoint contains no signing private-key or key-generation capability",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "./autonomous-repair-production-execution-entrypoint.js",
          import.meta.url
        ),
        "utf8"
      );

    for (
      const forbidden of [
        "privateKey",
        "generateKeyPair",
        "createPrivateKey",
        "sign(",
        "publicKeyPem",
        "trustedKeyRecord"
      ]
    ) {
      assert.equal(
        source.includes(
          forbidden
        ),
        false,
        forbidden
      );
    }
  }
);

test(
  "production entrypoint has no caller-supplied root or trust field in its accepted input surface",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "./autonomous-repair-production-execution-entrypoint.js",
          import.meta.url
        ),
        "utf8"
      );

    for (
      const forbidden of [
        "\"projectRoot\"",
        "\"externalStateRoot\"",
        "\"externalBackupRoot\"",
        "\"publicKey\"",
        "\"trustRegistry\"",
        "\"trustedKeyRecord\""
      ]
    ) {
      assert.equal(
        source.includes(
          forbidden
        ),
        false,
        forbidden
      );
    }
  }
);

test(
  "production execution remains kernel-disabled even in readiness semantics",
  () => {
    const readiness =
      inspectAutonomousRepairProductionExecutionReadiness();

    assert.equal(
      readiness.productionKernelEnabled,
      false
    );

    assert.equal(
      readiness.callerSuppliedTrustForbidden,
      true
    );

    assert.equal(
      readiness.callerSuppliedProjectRootForbidden,
      true
    );
  }
);
