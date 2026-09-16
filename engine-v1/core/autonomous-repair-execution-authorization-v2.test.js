import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import {
  createHash,
  generateKeyPairSync,
  sign
} from "node:crypto";

import {
  AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2_SCHEMA,
  AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2_VERSION,
  AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2_POLICY_VERSION,
  autonomousRepairExecutionAuthorizationV2Fingerprint,
  autonomousRepairExecutionAuthorizationV2SigningBytes,
  validateAutonomousRepairExecutionAuthorizationV2Artifact,
  verifyAutonomousRepairExecutionAuthorizationV2AgainstTrustedKeyRecord,
  verifyAutonomousRepairExecutionAuthorizationV2WithPinnedTrust
} from "./autonomous-repair-execution-authorization-v2.js";

import {
  AUTONOMOUS_REPAIR_AUTHORIZATION_TRUSTED_PUBLIC_KEYS,
  publicKeySpkiSha256
} from "./autonomous-repair-authorization-trusted-public-keys.js";

function ephemeralSigner() {
  const {
    publicKey,
    privateKey
  } =
    generateKeyPairSync(
      "ed25519"
    );

  const publicKeyPem =
    publicKey.export({
      type: "spki",
      format: "pem"
    });

  return {
    privateKey,
    trustedKeyRecord: {
      issuerId:
        "test-external-control-plane",

      keyId:
        "arkey_v1_runtime-test",

      publicKeyPem,

      publicKeySpkiSha256:
        publicKeySpkiSha256(
          publicKeyPem
        )
    }
  };
}

function artifact({
  state = "AUTHORIZED",
  signer = ephemeralSigner()
} = {}) {
  const granted =
    state === "AUTHORIZED";

  const authorization = {
    schema:
      AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2_SCHEMA,

    version:
      AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2_VERSION,

    dayKey:
      "2026-09-16",

    generatedAt:
      "2026-09-16T18:00:00.000Z",

    role:
      "externally_signed_bounded_execution_authorization",

    authorizationId:
      "arauth_v2_0123456789abcdef0123456789abcdef",

    nonce:
      "arnonce_v2_" +
      "a".repeat(64),

    issuedAt:
      "2026-09-16T18:00:00.000Z",

    notBefore:
      "2026-09-16T18:00:05.000Z",

    expiresAt:
      "2026-09-16T18:10:00.000Z",

    policyVersion:
      AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2_POLICY_VERSION,

    authorizationState:
      state,

    authorizationBasis: {
      source:
        "external_control_plane",

      issuerId:
        signer.trustedKeyRecord.issuerId,

      keyId:
        signer.trustedKeyRecord.keyId,

      publicKeySpkiSha256:
        signer.trustedKeyRecord.publicKeySpkiSha256,

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

    repairClassScope:
      granted
        ? [
            "ACQUIRE_VERIFIED_FINAL_EVIDENCE",
            "REBUILD_HISTORY_ELIGIBLE_ROW"
          ]
        : [],

    operationScope:
      granted
        ? [
            {
              operationId:
                "arpo_v1_aaaaaaaaaaaaaaaaaaaaaaaa",

              targetPath:
                "data/final-results/2026-09-16/canonical-a.json",

              mutationMode:
                "CREATE",

              preimageFingerprint:
                "5".repeat(64),

              repairClass:
                "ACQUIRE_VERIFIED_FINAL_EVIDENCE"
            },
            {
              operationId:
                "arpo_v1_bbbbbbbbbbbbbbbbbbbbbbbb",

              targetPath:
                "data/history/2025-2026.json",

              mutationMode:
                "REPLACE",

              preimageFingerprint:
                "6".repeat(64),

              repairClass:
                "REBUILD_HISTORY_ELIGIBLE_ROW"
            }
          ]
        : [],

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
        granted,

      filesystemWriteAuthorized:
        granted,

      repairAuthorized:
        granted,

      executionAuthorized:
        granted,

      rollbackExecutionAuthorized:
        granted,

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
      signer.privateKey
    ).toString(
      "base64"
    );

  return {
    authorization,
    signer
  };
}

function resign(
  authorization,
  privateKey
) {
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
}

test(
  "V2 schema requires cryptographic identity freshness material binding and signature fields",
  () => {
    const schema =
      JSON.parse(
        fs.readFileSync(
          new URL(
            "../contracts/autonomous-repair-execution-authorization.schema.v2.json",
            import.meta.url
          ),
          "utf8"
        )
      );

    for (
      const field of [
        "authorizationId",
        "nonce",
        "issuedAt",
        "notBefore",
        "expiresAt",
        "policyVersion",
        "bindings",
        "repairClassScope",
        "authorizationFingerprint",
        "signature"
      ]
    ) {
      assert.equal(
        schema.required.includes(field),
        true,
        field
      );
    }

    assert.deepEqual(
      schema.properties.bindings.required,
      [
        "requestFingerprint",
        "planFingerprint",
        "verificationFingerprint",
        "materialResolutionFingerprint"
      ]
    );
  }
);

test(
  "authorized V2 artifact validates structurally and semantically",
  () => {
    const {
      authorization
    } =
      artifact();

    assert.equal(
      validateAutonomousRepairExecutionAuthorizationV2Artifact(
        authorization
      ),
      true
    );
  }
);

test(
  "denied V2 artifact validates only with zero execution authority and empty scope",
  () => {
    const {
      authorization
    } =
      artifact({
        state:
          "DENIED"
      });

    assert.equal(
      validateAutonomousRepairExecutionAuthorizationV2Artifact(
        authorization
      ),
      true
    );

    assert.equal(
      authorization.operationScope.length,
      0
    );

    assert.equal(
      authorization.authority.executionAuthorized,
      false
    );
  }
);

test(
  "ephemeral runtime Ed25519 key verifies against an exact trusted key record",
  () => {
    const {
      authorization,
      signer
    } =
      artifact();

    assert.equal(
      verifyAutonomousRepairExecutionAuthorizationV2AgainstTrustedKeyRecord({
        authorization,
        trustedKeyRecord:
          signer.trustedKeyRecord,
        now:
          "2026-09-16T18:05:00.000Z"
      }),
      true
    );
  }
);

test(
  "tampered signed binding fails closed",
  () => {
    const {
      authorization,
      signer
    } =
      artifact();

    authorization.bindings
      .materialResolutionFingerprint =
        "f".repeat(64);

    authorization.authorizationFingerprint =
      autonomousRepairExecutionAuthorizationV2Fingerprint(
        authorization
      );

    assert.throws(
      () =>
        verifyAutonomousRepairExecutionAuthorizationV2AgainstTrustedKeyRecord({
          authorization,
          trustedKeyRecord:
            signer.trustedKeyRecord,
          now:
            "2026-09-16T18:05:00.000Z"
        }),
      /signature_invalid/
    );
  }
);

test(
  "wrong trusted key fails closed even when authorization key identity text is unchanged",
  () => {
    const {
      authorization,
      signer
    } =
      artifact();

    const other =
      ephemeralSigner();

    const forgedRecord = {
      ...other.trustedKeyRecord,
      issuerId:
        signer.trustedKeyRecord.issuerId,
      keyId:
        signer.trustedKeyRecord.keyId
    };

    assert.throws(
      () =>
        verifyAutonomousRepairExecutionAuthorizationV2AgainstTrustedKeyRecord({
          authorization,
          trustedKeyRecord:
            forgedRecord,
          now:
            "2026-09-16T18:05:00.000Z"
        }),
      /trusted_key_binding_mismatch/
    );
  }
);

test(
  "expired authorization fails closed after valid signature verification",
  () => {
    const {
      authorization,
      signer
    } =
      artifact();

    assert.throws(
      () =>
        verifyAutonomousRepairExecutionAuthorizationV2AgainstTrustedKeyRecord({
          authorization,
          trustedKeyRecord:
            signer.trustedKeyRecord,
          now:
            "2026-09-16T18:10:00.000Z"
        }),
      /not_current/
    );
  }
);

test(
  "authorization before notBefore fails closed",
  () => {
    const {
      authorization,
      signer
    } =
      artifact();

    assert.throws(
      () =>
        verifyAutonomousRepairExecutionAuthorizationV2AgainstTrustedKeyRecord({
          authorization,
          trustedKeyRecord:
            signer.trustedKeyRecord,
          now:
            "2026-09-16T18:00:04.999Z"
        }),
      /not_current/
    );
  }
);

test(
  "authorization lifetime over fifteen minutes is rejected even when re-signed",
  () => {
    const {
      authorization,
      signer
    } =
      artifact();

    authorization.expiresAt =
      "2026-09-16T18:15:00.001Z";

    resign(
      authorization,
      signer.privateKey
    );

    assert.throws(
      () =>
        validateAutonomousRepairExecutionAuthorizationV2Artifact(
          authorization
        ),
      /validity_window_invalid/
    );
  }
);

test(
  "noncanonical repair class scope is rejected even when re-signed",
  () => {
    const {
      authorization,
      signer
    } =
      artifact();

    authorization.repairClassScope =
      [
        "REBUILD_HISTORY_ELIGIBLE_ROW",
        "ACQUIRE_VERIFIED_FINAL_EVIDENCE"
      ];

    resign(
      authorization,
      signer.privateKey
    );

    assert.throws(
      () =>
        validateAutonomousRepairExecutionAuthorizationV2Artifact(
          authorization
        ),
      /repair_class_scope_invalid/
    );
  }
);

test(
  "operation repair class outside signed scope is rejected even when re-signed",
  () => {
    const {
      authorization,
      signer
    } =
      artifact();

    authorization.repairClassScope =
      [
        "ACQUIRE_VERIFIED_FINAL_EVIDENCE"
      ];

    resign(
      authorization,
      signer.privateKey
    );

    assert.throws(
      () =>
        validateAutonomousRepairExecutionAuthorizationV2Artifact(
          authorization
        ),
      /operation_scope_invalid/
    );
  }
);

test(
  "false safety flag is rejected even when re-signed",
  () => {
    const {
      authorization,
      signer
    } =
      artifact();

    authorization.safety
      .singleUseRequired =
        false;

    resign(
      authorization,
      signer.privateKey
    );

    assert.throws(
      () =>
        validateAutonomousRepairExecutionAuthorizationV2Artifact(
          authorization
        ),
      /safety_invalid/
    );
  }
);

test(
  "workflow mutation authority remains impossible",
  () => {
    const {
      authorization,
      signer
    } =
      artifact();

    authorization.authority
      .workflowMutationAuthorized =
        true;

    resign(
      authorization,
      signer.privateKey
    );

    assert.throws(
      () =>
        validateAutonomousRepairExecutionAuthorizationV2Artifact(
          authorization
        ),
      /authority_invalid/
    );
  }
);

test(
  "production pinned key registry starts empty and therefore fails closed",
  () => {
    assert.equal(
      AUTONOMOUS_REPAIR_AUTHORIZATION_TRUSTED_PUBLIC_KEYS.length,
      0
    );

    const {
      authorization
    } =
      artifact();

    assert.throws(
      () =>
        verifyAutonomousRepairExecutionAuthorizationV2WithPinnedTrust({
          authorization,
          now:
            "2026-09-16T18:05:00.000Z"
        }),
      /trusted_key_not_found/
    );
  }
);

test(
  "production V2 core contains no signer key generation or filesystem mutation surface",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "./autonomous-repair-execution-authorization-v2.js",
          import.meta.url
        ),
        "utf8"
      );

    for (
      const forbidden of [
        'from "node:fs"',
        "generateKeyPair",
        "generateKeyPairSync",
        "createPrivateKey",
        "privateKey",
        "writeFileSync(",
        "writeFile(",
        "appendFileSync(",
        "appendFile(",
        "renameSync(",
        "rename(",
        "unlinkSync(",
        "unlink(",
        "rmSync(",
        "rm(",
        "mkdirSync(",
        "mkdir(",
        "createWriteStream("
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
