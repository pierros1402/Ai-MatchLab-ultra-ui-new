import {
  createHash,
  createPublicKey,
  verify as verifySignature
} from "node:crypto";

import {
  publicKeySpkiSha256,
  resolveAutonomousRepairTrustedPublicKey,
  validateAutonomousRepairTrustedPublicKeyRecord
} from "./autonomous-repair-authorization-trusted-public-keys.js";

export const AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2_SCHEMA =
  "ai-matchlab.autonomous-repair-execution-authorization.v2";

export const AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2_VERSION =
  "2.0.0";

export const AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2_STATE =
  Object.freeze({
    AUTHORIZED:
      "AUTHORIZED",
    DENIED:
      "DENIED"
  });

export const AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2_POLICY_VERSION =
  "ai-matchlab.autonomous-repair-execution-policy.v1";

export const AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2_DOMAIN =
  "AI_MATCHLAB_AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2\u0000";

export const AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2_MAX_LIFETIME_MS =
  15 * 60 * 1000;

const VALID_SHA =
  /^[0-9a-f]{64}$/u;

const VALID_DAY =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/u;

const VALID_AUTHORIZATION_ID =
  /^arauth_v2_[0-9a-f]{32}$/u;

const VALID_NONCE =
  /^arnonce_v2_[0-9a-f]{64}$/u;

const VALID_KEY_ID =
  /^arkey_v1_[a-z0-9][a-z0-9._-]{0,63}$/u;

const VALID_OPERATION_ID =
  /^arpo_v1_[0-9a-f]{24}$/u;

const CANONICAL_UTC =
  /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/u;

const SUPPORTED_REPAIR_CLASSES =
  Object.freeze([
    "ACQUIRE_VERIFIED_FINAL_EVIDENCE",
    "REBUILD_HISTORY_ELIGIBLE_ROW",
    "REBUILD_PUBLICATION_CANONICAL_ROW"
  ]);

function clean(value) {
  return String(value ?? "").trim();
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (
    value &&
    typeof value === "object"
  ) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(
          key => [
            key,
            stableValue(value[key])
          ]
        )
    );
  }

  return value;
}

function canonicalJson(value) {
  return JSON.stringify(
    stableValue(value)
  );
}

function sha256Text(value) {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

function exactKeys(
  value,
  expected
) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return false;
  }

  const actual =
    Object.keys(value).sort();

  const wanted =
    [...expected].sort();

  return (
    actual.length === wanted.length &&
    actual.every(
      (key, index) =>
        key === wanted[index]
    )
  );
}

function canonicalUtcMillis(
  value
) {
  const text =
    clean(value);

  if (!CANONICAL_UTC.test(text)) {
    return null;
  }

  const millis =
    Date.parse(text);

  if (
    !Number.isFinite(millis) ||
    new Date(millis).toISOString() !== text
  ) {
    return null;
  }

  return millis;
}

function compareScope(a, b) {
  return [
    a.targetPath,
    a.operationId
  ]
    .join("\u0000")
    .localeCompare(
      [
        b.targetPath,
        b.operationId
      ].join("\u0000")
    );
}

function expectedAuthority(
  authorizationState
) {
  const granted =
    authorizationState ===
    AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2_STATE.AUTHORIZED;

  return {
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
  };
}

export function autonomousRepairExecutionAuthorizationV2UnsignedPayload(
  artifact
) {
  return {
    schema:
      artifact.schema,

    version:
      artifact.version,

    dayKey:
      artifact.dayKey,

    generatedAt:
      artifact.generatedAt,

    role:
      artifact.role,

    authorizationId:
      artifact.authorizationId,

    nonce:
      artifact.nonce,

    issuedAt:
      artifact.issuedAt,

    notBefore:
      artifact.notBefore,

    expiresAt:
      artifact.expiresAt,

    policyVersion:
      artifact.policyVersion,

    authorizationState:
      artifact.authorizationState,

    authorizationBasis:
      artifact.authorizationBasis,

    bindings:
      artifact.bindings,

    repairClassScope:
      artifact.repairClassScope,

    operationScope:
      artifact.operationScope,

    safety:
      artifact.safety,

    authority:
      artifact.authority
  };
}

export function autonomousRepairExecutionAuthorizationV2SigningBytes(
  artifact
) {
  return Buffer.from(
    AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2_DOMAIN +
      canonicalJson(
        autonomousRepairExecutionAuthorizationV2UnsignedPayload(
          artifact
        )
      ),
    "utf8"
  );
}

export function autonomousRepairExecutionAuthorizationV2Fingerprint(
  artifact
) {
  return sha256Text(
    canonicalJson(
      autonomousRepairExecutionAuthorizationV2UnsignedPayload(
        artifact
      )
    )
  );
}

function canonicalBase64(
  value
) {
  const text =
    clean(value);

  if (
    !text ||
    text.length % 4 !== 0 ||
    !/^[A-Za-z0-9+/]+={0,2}$/u.test(
      text
    )
  ) {
    return false;
  }

  const bytes =
    Buffer.from(
      text,
      "base64"
    );

  return (
    bytes.length > 0 &&
    bytes.toString("base64") === text
  );
}

export function validateAutonomousRepairExecutionAuthorizationV2Artifact(
  artifact
) {
  if (
    !artifact ||
    typeof artifact !== "object" ||
    Array.isArray(artifact) ||
    artifact.schema !==
      AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2_SCHEMA ||
    artifact.version !==
      AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2_VERSION ||
    !VALID_DAY.test(
      clean(artifact.dayKey)
    ) ||
    canonicalUtcMillis(
      artifact.generatedAt
    ) === null ||
    artifact.role !==
      "externally_signed_bounded_execution_authorization" ||
    !VALID_AUTHORIZATION_ID.test(
      clean(artifact.authorizationId)
    ) ||
    !VALID_NONCE.test(
      clean(artifact.nonce)
    ) ||
    artifact.policyVersion !==
      AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2_POLICY_VERSION ||
    ![
      AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2_STATE.AUTHORIZED,
      AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2_STATE.DENIED
    ].includes(
      artifact.authorizationState
    ) ||
    !VALID_SHA.test(
      clean(
        artifact.authorizationFingerprint
      )
    ) ||
    !Array.isArray(
      artifact.repairClassScope
    ) ||
    !Array.isArray(
      artifact.operationScope
    ) ||
    !exactKeys(
      artifact,
      [
        "schema",
        "version",
        "dayKey",
        "generatedAt",
        "role",
        "authorizationId",
        "nonce",
        "issuedAt",
        "notBefore",
        "expiresAt",
        "policyVersion",
        "authorizationState",
        "authorizationBasis",
        "bindings",
        "repairClassScope",
        "operationScope",
        "safety",
        "authority",
        "authorizationFingerprint",
        "signature"
      ]
    )
  ) {
    throw new Error(
      "autonomous_repair_execution_authorization_v2_artifact_invalid"
    );
  }

  const issuedAt =
    canonicalUtcMillis(
      artifact.issuedAt
    );

  const notBefore =
    canonicalUtcMillis(
      artifact.notBefore
    );

  const expiresAt =
    canonicalUtcMillis(
      artifact.expiresAt
    );

  if (
    issuedAt === null ||
    notBefore === null ||
    expiresAt === null ||
    issuedAt > notBefore ||
    notBefore >= expiresAt ||
    expiresAt - issuedAt >
      AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2_MAX_LIFETIME_MS
  ) {
    throw new Error(
      "autonomous_repair_execution_authorization_v2_validity_window_invalid"
    );
  }

  if (
    !exactKeys(
      artifact.authorizationBasis,
      [
        "source",
        "issuerId",
        "keyId",
        "publicKeySpkiSha256",
        "decisionFingerprint"
      ]
    ) ||
    artifact.authorizationBasis.source !==
      "external_control_plane" ||
    !clean(
      artifact.authorizationBasis.issuerId
    ) ||
    !VALID_KEY_ID.test(
      clean(
        artifact.authorizationBasis.keyId
      )
    ) ||
    !VALID_SHA.test(
      clean(
        artifact.authorizationBasis.publicKeySpkiSha256
      )
    ) ||
    !VALID_SHA.test(
      clean(
        artifact.authorizationBasis.decisionFingerprint
      )
    )
  ) {
    throw new Error(
      "autonomous_repair_execution_authorization_v2_basis_invalid"
    );
  }

  if (
    !exactKeys(
      artifact.bindings,
      [
        "requestFingerprint",
        "planFingerprint",
        "verificationFingerprint",
        "materialResolutionFingerprint"
      ]
    ) ||
    Object.values(
      artifact.bindings
    ).some(
      value =>
        !VALID_SHA.test(
          clean(value)
        )
    )
  ) {
    throw new Error(
      "autonomous_repair_execution_authorization_v2_bindings_invalid"
    );
  }

  const repairClasses =
    artifact.repairClassScope;

  if (
    repairClasses.some(
      value =>
        !SUPPORTED_REPAIR_CLASSES.includes(
          value
        )
    ) ||
    new Set(repairClasses).size !==
      repairClasses.length ||
    JSON.stringify(
      [...repairClasses].sort()
    ) !==
      JSON.stringify(
        repairClasses
      )
  ) {
    throw new Error(
      "autonomous_repair_execution_authorization_v2_repair_class_scope_invalid"
    );
  }

  const operationIds =
    new Set();

  const targetPaths =
    new Set();

  for (
    let index = 0;
    index <
      artifact.operationScope.length;
    index += 1
  ) {
    const row =
      artifact.operationScope[index];

    if (
      !exactKeys(
        row,
        [
          "operationId",
          "targetPath",
          "mutationMode",
          "preimageFingerprint",
          "repairClass"
        ]
      ) ||
      !VALID_OPERATION_ID.test(
        clean(row.operationId)
      ) ||
      !clean(row.targetPath) ||
      ![
        "CREATE",
        "REPLACE"
      ].includes(
        row.mutationMode
      ) ||
      !VALID_SHA.test(
        clean(
          row.preimageFingerprint
        )
      ) ||
      !SUPPORTED_REPAIR_CLASSES.includes(
        row.repairClass
      ) ||
      !repairClasses.includes(
        row.repairClass
      ) ||
      operationIds.has(
        row.operationId
      ) ||
      targetPaths.has(
        row.targetPath
      )
    ) {
      throw new Error(
        "autonomous_repair_execution_authorization_v2_operation_scope_invalid"
      );
    }

    operationIds.add(
      row.operationId
    );

    targetPaths.add(
      row.targetPath
    );

    if (
      index > 0 &&
      compareScope(
        artifact.operationScope[
          index - 1
        ],
        row
      ) > 0
    ) {
      throw new Error(
        "autonomous_repair_execution_authorization_v2_operation_order_invalid"
      );
    }
  }

  if (
    artifact.authorizationState ===
      AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2_STATE.AUTHORIZED &&
    (
      artifact.operationScope.length === 0 ||
      artifact.repairClassScope.length === 0
    )
  ) {
    throw new Error(
      "autonomous_repair_execution_authorization_v2_empty_authorized_scope_forbidden"
    );
  }

  if (
    !exactKeys(
      artifact.safety,
      [
        "exactRequestScopeOnly",
        "preimageReverificationRequired",
        "atomicWriteRequired",
        "postWriteAuditRequired",
        "rollbackRequired",
        "singleUseRequired"
      ]
    ) ||
    Object.values(
      artifact.safety
    ).some(
      value =>
        value !== true
    )
  ) {
    throw new Error(
      "autonomous_repair_execution_authorization_v2_safety_invalid"
    );
  }

  const authority =
    expectedAuthority(
      artifact.authorizationState
    );

  if (
    !exactKeys(
      artifact.authority,
      Object.keys(authority)
    ) ||
    canonicalJson(
      artifact.authority
    ) !==
      canonicalJson(
        authority
      )
  ) {
    throw new Error(
      "autonomous_repair_execution_authorization_v2_authority_invalid"
    );
  }

  if (
    !exactKeys(
      artifact.signature,
      [
        "algorithm",
        "encoding",
        "value"
      ]
    ) ||
    artifact.signature.algorithm !==
      "Ed25519" ||
    artifact.signature.encoding !==
      "base64" ||
    !canonicalBase64(
      artifact.signature.value
    )
  ) {
    throw new Error(
      "autonomous_repair_execution_authorization_v2_signature_encoding_invalid"
    );
  }

  if (
    autonomousRepairExecutionAuthorizationV2Fingerprint(
      artifact
    ) !==
      artifact.authorizationFingerprint
  ) {
    throw new Error(
      "autonomous_repair_execution_authorization_v2_fingerprint_mismatch"
    );
  }

  return true;
}

export function verifyAutonomousRepairExecutionAuthorizationV2AgainstTrustedKeyRecord({
  authorization,
  trustedKeyRecord,
  now
} = {}) {
  validateAutonomousRepairExecutionAuthorizationV2Artifact(
    authorization
  );

  validateAutonomousRepairTrustedPublicKeyRecord(
    trustedKeyRecord
  );

  if (
    authorization.authorizationBasis.issuerId !==
      trustedKeyRecord.issuerId ||
    authorization.authorizationBasis.keyId !==
      trustedKeyRecord.keyId ||
    authorization.authorizationBasis.publicKeySpkiSha256 !==
      trustedKeyRecord.publicKeySpkiSha256 ||
    publicKeySpkiSha256(
      trustedKeyRecord.publicKeyPem
    ) !==
      authorization.authorizationBasis.publicKeySpkiSha256
  ) {
    throw new Error(
      "autonomous_repair_execution_authorization_v2_trusted_key_binding_mismatch"
    );
  }

  const signature =
    Buffer.from(
      authorization.signature.value,
      "base64"
    );

  const verified =
    verifySignature(
      null,
      autonomousRepairExecutionAuthorizationV2SigningBytes(
        authorization
      ),
      createPublicKey(
        trustedKeyRecord.publicKeyPem
      ),
      signature
    );

  if (!verified) {
    throw new Error(
      "autonomous_repair_execution_authorization_v2_signature_invalid"
    );
  }

  const nowText =
    now instanceof Date
      ? now.toISOString()
      : clean(now);

  const nowMillis =
    canonicalUtcMillis(
      nowText
    );

  if (nowMillis === null) {
    throw new Error(
      "autonomous_repair_execution_authorization_v2_now_invalid"
    );
  }

  const notBefore =
    canonicalUtcMillis(
      authorization.notBefore
    );

  const expiresAt =
    canonicalUtcMillis(
      authorization.expiresAt
    );

  if (
    nowMillis < notBefore ||
    nowMillis >= expiresAt
  ) {
    throw new Error(
      "autonomous_repair_execution_authorization_v2_not_current"
    );
  }

  return true;
}

export function verifyAutonomousRepairExecutionAuthorizationV2WithPinnedTrust({
  authorization,
  now
} = {}) {
  validateAutonomousRepairExecutionAuthorizationV2Artifact(
    authorization
  );

  const trustedKey =
    resolveAutonomousRepairTrustedPublicKey({
      issuerId:
        authorization.authorizationBasis.issuerId,

      keyId:
        authorization.authorizationBasis.keyId
    });

  if (!trustedKey) {
    throw new Error(
      "autonomous_repair_execution_authorization_v2_trusted_key_not_found"
    );
  }

  return verifyAutonomousRepairExecutionAuthorizationV2AgainstTrustedKeyRecord({
    authorization,
    trustedKeyRecord:
      trustedKey,
    now
  });
}
