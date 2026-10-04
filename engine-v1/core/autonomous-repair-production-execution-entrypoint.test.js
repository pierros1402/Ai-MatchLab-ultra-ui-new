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
  "production readiness remains fail-closed after one public key is pinned because the production kernel is disabled",
  () => {
    assert.equal(
      AUTONOMOUS_REPAIR_AUTHORIZATION_TRUSTED_PUBLIC_KEYS.length,
      1
    );

    const readiness =
      inspectAutonomousRepairProductionExecutionReadiness();

    assert.equal(
      readiness.state,
      AUTONOMOUS_REPAIR_PRODUCTION_EXECUTION_STATE.BLOCKED_PRODUCTION_KERNEL_NOT_ENABLED
    );

    assert.equal(
      readiness.trustedKeyCount,
      1
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
);// G3 P5 ENTRYPOINT SECURITY MATRIX V1
const P5_ENTRYPOINT_SOURCE =
  fs.readFileSync(
    new URL(
      "./autonomous-repair-production-execution-entrypoint.js",
      import.meta.url
    ),
    "utf8"
  );

function entrypointSecurityCase(
  number,
  title,
  body
) {
  test(
    `ENTRYPOINT_SECURITY_CASE_${String(number).padStart(2, "0")} ${title}`,
    body
  );
}

entrypointSecurityCase(
  1,
  "positive prepared execution preflight runs to ready state with isolated test-only module mocks",
  async () => {
    const {
      execFileSync
    } =
      await import(
        "node:child_process"
      );

    const authorizationUrl =
      new URL(
        "./autonomous-repair-execution-authorization-v2.js",
        import.meta.url
      ).href;

    const bindingUrl =
      new URL(
        "./autonomous-repair-execution-authorization-v2-binding.js",
        import.meta.url
      ).href;

    const transactionPlanUrl =
      new URL(
        "./autonomous-repair-execution-transaction-plan.js",
        import.meta.url
      ).href;

    const adapterUrl =
      new URL(
        "./autonomous-repair-production-execution-adapter.js",
        import.meta.url
      ).href;

    const entrypointUrl =
      new URL(
        "./autonomous-repair-production-execution-entrypoint.js?g3_p5_positive_preflight=1",
        import.meta.url
      ).href;

    const childSource =
      `
import assert from "node:assert/strict";
import { mock } from "node:test";

const authorizationUrl = ${JSON.stringify(authorizationUrl)};
const bindingUrl = ${JSON.stringify(bindingUrl)};
const transactionPlanUrl = ${JSON.stringify(transactionPlanUrl)};
const adapterUrl = ${JSON.stringify(adapterUrl)};
const entrypointUrl = ${JSON.stringify(entrypointUrl)};

const transactionPlan = Object.freeze({
  schema: "test-transaction-plan",
  planFingerprint: "a".repeat(64)
});

mock.module(
  authorizationUrl,
  {
    namedExports: {
      validateAutonomousRepairExecutionAuthorizationV2Artifact() {
        return true;
      }
    }
  }
);

mock.module(
  bindingUrl,
  {
    namedExports: {
      verifyAutonomousRepairExecutionAuthorizationV2BindingWithPinnedTrust() {
        return {
          ok: true
        };
      }
    }
  }
);

mock.module(
  transactionPlanUrl,
  {
    namedExports: {
      buildAutonomousRepairExecutionTransactionPlan() {
        return transactionPlan;
      },

      validateAutonomousRepairExecutionTransactionPlanArtifact(value) {
        assert.equal(
          value,
          transactionPlan
        );

        return true;
      }
    }
  }
);

mock.module(
  adapterUrl,
  {
    namedExports: {
      executeAutonomousRepairProductionExecutionAdapter() {
        throw new Error(
          "positive_preflight_adapter_must_not_execute"
        );
      }
    }
  }
);

const entrypoint =
  await import(
    entrypointUrl
  );

const materialResolution =
  Object.freeze({
    schema: "test-material-resolution"
  });

const result =
  entrypoint.prepareAutonomousRepairProductionExecutionWithPinnedTrust({
    authorization: Object.freeze({}),
    executionRequest: Object.freeze({}),
    targetVerification: Object.freeze({}),
    materialResolution,
    generatedAt: "2026-10-04T00:00:00.000Z",
    now: "2026-10-04T00:00:00.000Z"
  });

assert.equal(
  result.ready,
  true
);

assert.equal(
  result.transactionPlan,
  transactionPlan
);

assert.equal(
  result.authority.executionAuthorized,
  false
);

assert.equal(
  result.authority.filesystemWriteAuthorized,
  false
);

assert.throws(
  () =>
    entrypoint.executeAutonomousRepairProductionExecution({
      authorization: Object.freeze({}),
      executionRequest: Object.freeze({}),
      targetVerification: Object.freeze({}),
      materialResolution,
      generatedAt: "2026-10-04T00:00:00.000Z",
      now: "2026-10-04T00:00:00.000Z"
    }),
  /autonomous_repair_production_execution_kernel_not_enabled/u
);

console.log(
  "P5_POSITIVE_PREFLIGHT_CHILD=PASS"
);
`;

    const output =
      execFileSync(
        process.execPath,
        [
          "--experimental-test-module-mocks",
          "--input-type=module",
          "--eval",
          childSource
        ],
        {
          encoding:
            "utf8"
        }
      );

    assert.match(
      output,
      /P5_POSITIVE_PREFLIGHT_CHILD=PASS/u
    );
  }
);

entrypointSecurityCase(
  2,
  "positive integration imports and delegates only through the P4 production execution adapter",
  () => {
    assert.match(
      P5_ENTRYPOINT_SOURCE,
      /autonomous-repair-production-execution-adapter\.js/u
    );

    assert.equal(
      (
        P5_ENTRYPOINT_SOURCE.match(
          /executeAutonomousRepairProductionExecutionAdapter\(\{/gu
        ) ??
        []
      ).length,
      1
    );
  }
);

entrypointSecurityCase(
  3,
  "positive execution ordering is preflight then disabled-kernel guard then adapter delegation",
  () => {
    const executionIndex =
      P5_ENTRYPOINT_SOURCE.indexOf(
        "export function executeAutonomousRepairProductionExecution("
      );

    const preflightIndex =
      P5_ENTRYPOINT_SOURCE.indexOf(
        "prepareAutonomousRepairProductionExecutionWithPinnedTrust(",
        executionIndex
      );

    const guardIndex =
      P5_ENTRYPOINT_SOURCE.indexOf(
        "!AUTONOMOUS_REPAIR_PRODUCTION_KERNEL_ENABLED",
        preflightIndex
      );

    const delegateIndex =
      P5_ENTRYPOINT_SOURCE.indexOf(
        "executeAutonomousRepairProductionExecutionAdapter({",
        guardIndex
      );

    assert.ok(
      executionIndex >=
        0
    );

    assert.ok(
      preflightIndex >
        executionIndex
    );

    assert.ok(
      guardIndex >
        preflightIndex
    );

    assert.ok(
      delegateIndex >
        guardIndex
    );
  }
);

entrypointSecurityCase(
  4,
  "positive adapter handoff contains only prepared transaction plan and source-bound material resolution",
  () => {
    const executionIndex =
      P5_ENTRYPOINT_SOURCE.indexOf(
        "export function executeAutonomousRepairProductionExecution("
      );

    const executionSource =
      P5_ENTRYPOINT_SOURCE.slice(
        executionIndex
      );

    assert.match(
      executionSource,
      /executeAutonomousRepairProductionExecutionAdapter\(\{\s*transactionPlan:\s*prepared\.transactionPlan,\s*materialResolution:\s*options\.materialResolution\s*\}\)/u
    );

    assert.doesNotMatch(
      executionSource,
      /stateAdapter:/u
    );

    assert.doesNotMatch(
      executionSource,
      /projectRoot:/u
    );

    assert.doesNotMatch(
      executionSource,
      /externalStateRoot:/u
    );

    assert.doesNotMatch(
      executionSource,
      /externalBackupRoot:/u
    );
  }
);

entrypointSecurityCase(
  5,
  "kernel enablement remains hard false after integration and readiness remains blocked",
  () => {
    assert.match(
      P5_ENTRYPOINT_SOURCE,
      /const AUTONOMOUS_REPAIR_PRODUCTION_KERNEL_ENABLED\s*=\s*false;/u
    );

    const readiness =
      inspectAutonomousRepairProductionExecutionReadiness();

    assert.equal(
      readiness.productionKernelEnabled,
      false
    );

    assert.equal(
      readiness.state,
      AUTONOMOUS_REPAIR_PRODUCTION_EXECUTION_STATE.BLOCKED_PRODUCTION_KERNEL_NOT_ENABLED
    );
  }
);

entrypointSecurityCase(
  6,
  "entrypoint remains isolated from direct filesystem external-state sandbox and transaction-core dependencies",
  () => {
    for (
      const forbidden of [
        'from "node:fs"',
        'from "node:path"',
        'from "node:os"',
        'autonomous-repair-external-execution-state.js',
        'autonomous-repair-filesystem-transaction-kernel.js',
        'autonomous-repair-filesystem-transaction-core.js',
        'autonomous-repair-production-filesystem-transaction-kernel.js'
      ]
    ) {
      assert.equal(
        P5_ENTRYPOINT_SOURCE.includes(
          forbidden
        ),
        false,
        forbidden
      );
    }
  }
);

entrypointSecurityCase(
  7,
  "caller trust root and state-adapter authority remain outside the accepted entrypoint surface",
  () => {
    for (
      const forbidden of [
        '"projectRoot"',
        '"externalStateRoot"',
        '"externalBackupRoot"',
        '"roots"',
        '"stateAdapter"',
        '"publicKey"',
        '"trustRegistry"',
        '"trustedKeyRecord"'
      ]
    ) {
      assert.equal(
        P5_ENTRYPOINT_SOURCE.includes(
          forbidden
        ),
        false,
        forbidden
      );
    }
  }
);

entrypointSecurityCase(
  8,
  "entrypoint contains no signing private-key workflow or runtime environment enablement capability",
  () => {
    for (
      const forbidden of [
        "privateKey",
        "generateKeyPair",
        "createPrivateKey",
        "sign(",
        "process.env",
        "AIML_AUTONOMOUS_REPAIR_ENABLE",
        "workflowMutationAuthorized: true"
      ]
    ) {
      assert.equal(
        P5_ENTRYPOINT_SOURCE.includes(
          forbidden
        ),
        false,
        forbidden
      );
    }
  }
);

entrypointSecurityCase(
  9,
  "negative runtime still fails at pinned trust before the disabled-kernel boundary for an unpinned signer",
  () => {
    assert.throws(
      () =>
        executeAutonomousRepairProductionExecution(
          productionOptions()
        ),
      error => {
        assert.match(
          error.message,
          /autonomous_repair_execution_authorization_v2_trusted_key_not_found/u
        );

        assert.doesNotMatch(
          error.message,
          /kernel_not_enabled/u
        );

        return true;
      }
    );
  }
);
