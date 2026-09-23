import {
  createHash
} from "node:crypto";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_AUTHORIZATION_SCHEMA =
  "ai-matchlab.checkpoint-aware-value-comparison-execution-authorization.v1";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_AUTHORIZATION_VERSION =
  "1.0.0";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_AUTHORIZATION_DOMAIN =
  "AI_MATCHLAB_CHECKPOINT_VALUE_COMPARISON_EXECUTION_AUTHORIZATION_V1\u0000";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_AUTHORIZATION_MAX_LIFETIME_MS =
  15 * 60 * 1000;

export const CHECKPOINT_AWARE_VALUE_COMPARISON_BINDING_VALIDATION_SCHEMA =
  "ai-matchlab.checkpoint-aware-value-comparison-authorization-binding-validation.v1";

const VALID_DAY =
  /^\d{4}-\d{2}-\d{2}$/u;

const VALID_REMOTE_HEAD =
  /^[0-9a-f]{40}$/u;

const VALID_SHA =
  /^[0-9a-f]{64}$/u;

const VALID_AUTHORIZATION_ID =
  /^vcrauth_v1_[0-9a-f]{32}$/u;

const VALID_NONCE =
  /^vcrnonce_v1_[0-9a-f]{64}$/u;

const VALID_OPERATION_ID =
  /^vcrop_v1_[0-9a-f]{24}$/u;

const VALID_KEY_ID =
  /^arkey_v1_[a-z0-9][a-z0-9._-]{0,63}$/u;

const CANONICAL_UTC =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;

const EXACT_REPAIR_CLASS =
  "REBUILD_VALUE_COMPARISON_ONLY";

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

function exactKeys(
  value,
  expected
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value
    )
  ) {
    return false;
  }

  const actual =
    Object.keys(
      value
    )
      .sort();

  const wanted =
    [
      ...expected
    ]
      .sort();

  return (
    actual.length ===
      wanted.length &&
    actual.every(
      (
        key,
        index
      ) =>
        key ===
          wanted[index]
    )
  );
}

function canonicalUtcMillis(value) {
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

  return millis;
}

function canonicalBase64(value) {
  const text =
    clean(
      value
    );

  if (
    !text ||
    text.length % 4 !==
      0 ||
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
    bytes.length >
      0 &&
    bytes
      .toString(
        "base64"
      ) ===
        text
  );
}

function exactTargetScope(dayKey) {
  return [
    `data/value-comparison/${dayKey}.json`,
    "data/value-comparison/cumulative.json"
  ];
}

function operationIdFor(row) {
  return `vcrop_v1_${sha256Text(
    [
      row.targetPath,
      row.preimageSha256,
      row.preimageBytes,
      row.postimageSha256,
      row.postimageBytes
    ].join(
      "\u0000"
    )
  ).slice(
    0,
    24
  )}`;
}

function sameJson(
  left,
  right
) {
  return canonicalJson(
    left
  ) ===
    canonicalJson(
      right
    );
}

export function buildCheckpointAwareValueComparisonCandidateSetFromPreflight({
  preflight
} = {}) {
  if (
    !preflight ||
    typeof preflight !==
      "object" ||
    preflight.mode !==
      "MUTATION_PREFLIGHT_ONLY" ||
    preflight.preflightState !==
      "MUTATION_CANDIDATE_READY" ||
    !VALID_DAY.test(
      clean(
        preflight.dayKey
      )
    ) ||
    !VALID_REMOTE_HEAD.test(
      clean(
        preflight.remoteHead
      )
    ) ||
    !VALID_SHA.test(
      clean(
        preflight.preflightFingerprint
      )
    ) ||
    !VALID_SHA.test(
      clean(
        preflight.bindings
          ?.decisionFingerprint
      )
    ) ||
    !VALID_SHA.test(
      clean(
        preflight.bindings
          ?.executorContractFingerprint
      )
    ) ||
    !Array.isArray(
      preflight.targets
    ) ||
    !Array.isArray(
      preflight.operations
    )
  ) {
    throw new Error(
      "value_comparison_authorization_candidate_preflight_invalid"
    );
  }

  const expectedTargets =
    exactTargetScope(
      preflight.dayKey
    );

  if (
    !sameJson(
      preflight.exactTargetScope,
      expectedTargets
    )
  ) {
    throw new Error(
      "value_comparison_authorization_candidate_exact_target_scope_invalid"
    );
  }

  const targetByPath =
    new Map(
      preflight.targets.map(
        target => [
          clean(
            target?.targetPath
          ),
          target
        ]
      )
    );

  if (
    targetByPath.size !==
      preflight.targets.length
  ) {
    throw new Error(
      "value_comparison_authorization_candidate_duplicate_target"
    );
  }

  const operations = [];

  for (
    const targetPath of
      expectedTargets
  ) {
    const target =
      targetByPath.get(
        targetPath
      );

    if (!target) {
      throw new Error(
        "value_comparison_authorization_candidate_target_missing"
      );
    }

    if (
      target.proposedMutation !==
        true
    ) {
      continue;
    }

    const preimageSha256 =
      clean(
        target.preimage
          ?.sha256
      );

    const postimageSha256 =
      clean(
        target.candidateMaterial
          ?.sha256
      );

    const preimageBytes =
      Number(
        target.preimage
          ?.bytes
      );

    const postimageBytes =
      Number(
        target.candidateMaterial
          ?.bytes
      );

    if (
      !VALID_SHA.test(
        preimageSha256
      ) ||
      !VALID_SHA.test(
        postimageSha256
      ) ||
      preimageSha256 ===
        postimageSha256 ||
      !Number.isInteger(
        preimageBytes
      ) ||
      preimageBytes <=
        0 ||
      !Number.isInteger(
        postimageBytes
      ) ||
      postimageBytes <=
        0
    ) {
      throw new Error(
        "value_comparison_authorization_candidate_target_identity_invalid"
      );
    }

    const row = {
      targetPath,
      preimageSha256,
      preimageBytes,
      postimageSha256,
      postimageBytes
    };

    operations.push({
      operationId:
        operationIdFor(
          row
        ),

      ...row
    });
  }

  if (
    operations.length <
      1 ||
    operations.length >
      2 ||
    operations.length !==
      preflight.operations.length
  ) {
    throw new Error(
      "value_comparison_authorization_candidate_operation_count_invalid"
    );
  }

  const preflightOperationPaths =
    preflight.operations.map(
      row =>
        clean(
          row?.targetPath
        )
    );

  if (
    !sameJson(
      preflightOperationPaths,
      operations.map(
        row =>
          row.targetPath
      )
    )
  ) {
    throw new Error(
      "value_comparison_authorization_candidate_operation_scope_mismatch"
    );
  }

  for (
    let index = 0;
    index <
      operations.length;
    index += 1
  ) {
    const preflightRow =
      preflight.operations[index];

    const operation =
      operations[index];

    if (
      clean(
        preflightRow
          ?.preimageSha256
      ) !==
        operation
          .preimageSha256 ||
      clean(
        preflightRow
          ?.candidateMaterialSha256
      ) !==
        operation
          .postimageSha256
    ) {
      throw new Error(
        "value_comparison_authorization_candidate_operation_identity_mismatch"
      );
    }
  }

  const candidateSet = {
    schema:
      "ai-matchlab.checkpoint-aware-value-comparison-candidate-set.v1",

    version:
      "1.0.0",

    dayKey:
      preflight.dayKey,

    remoteHead:
      preflight.remoteHead,

    controllerDecisionFingerprint:
      preflight
        .bindings
        .decisionFingerprint,

    executorContractFingerprint:
      preflight
        .bindings
        .executorContractFingerprint,

    mutationPreflightFingerprint:
      preflight
        .preflightFingerprint,

    operationScope:
      operations
  };

  candidateSet.candidateSetFingerprint =
    sha256Text(
      canonicalJson(
        candidateSet
      )
    );

  return candidateSet;
}

export function checkpointAwareValueComparisonAuthorizationUnsignedPayload(
  artifact
) {
  return {
    schema:
      artifact.schema,

    version:
      artifact.version,

    role:
      artifact.role,

    dayKey:
      artifact.dayKey,

    generatedAt:
      artifact.generatedAt,

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

    repairClass:
      artifact.repairClass,

    bindings:
      artifact.bindings,

    operationScope:
      artifact.operationScope,

    safety:
      artifact.safety
  };
}

export function checkpointAwareValueComparisonAuthorizationFingerprint(
  artifact
) {
  return sha256Text(
    canonicalJson(
      checkpointAwareValueComparisonAuthorizationUnsignedPayload(
        artifact
      )
    )
  );
}

export function checkpointAwareValueComparisonAuthorizationSigningBytes(
  artifact
) {
  return Buffer.from(
    CHECKPOINT_AWARE_VALUE_COMPARISON_AUTHORIZATION_DOMAIN +
      canonicalJson({
        unsignedPayload:
          checkpointAwareValueComparisonAuthorizationUnsignedPayload(
            artifact
          ),

        authorizationFingerprint:
          artifact.authorizationFingerprint,

        signatureBasis: {
          issuerId:
            artifact.signature
              ?.issuerId,

          keyId:
            artifact.signature
              ?.keyId,

          publicKeySpkiSha256:
            artifact.signature
              ?.publicKeySpkiSha256
        }
      }),
    "utf8"
  );
}

export function validateCheckpointAwareValueComparisonAuthorizationArtifactStructure(
  artifact
) {
  if (
    !artifact ||
    typeof artifact !==
      "object" ||
    Array.isArray(
      artifact
    ) ||
    !exactKeys(
      artifact,
      [
        "schema",
        "version",
        "role",
        "dayKey",
        "generatedAt",
        "authorizationId",
        "nonce",
        "issuedAt",
        "notBefore",
        "expiresAt",
        "repairClass",
        "bindings",
        "operationScope",
        "safety",
        "authorizationFingerprint",
        "signature"
      ]
    ) ||
    artifact.schema !==
      CHECKPOINT_AWARE_VALUE_COMPARISON_AUTHORIZATION_SCHEMA ||
    artifact.version !==
      CHECKPOINT_AWARE_VALUE_COMPARISON_AUTHORIZATION_VERSION ||
    artifact.role !==
      "externally_signed_bounded_value_comparison_execution_authorization" ||
    !VALID_DAY.test(
      clean(
        artifact.dayKey
      )
    ) ||
    canonicalUtcMillis(
      artifact.generatedAt
    ) ===
      null ||
    !VALID_AUTHORIZATION_ID.test(
      clean(
        artifact.authorizationId
      )
    ) ||
    !VALID_NONCE.test(
      clean(
        artifact.nonce
      )
    ) ||
    artifact.repairClass !==
      EXACT_REPAIR_CLASS ||
    !Array.isArray(
      artifact.operationScope
    )
  ) {
    throw new Error(
      "value_comparison_authorization_artifact_structure_invalid"
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
    issuedAt ===
      null ||
    notBefore ===
      null ||
    expiresAt ===
      null ||
    issuedAt >
      notBefore ||
    notBefore >=
      expiresAt ||
    expiresAt -
      issuedAt >
      CHECKPOINT_AWARE_VALUE_COMPARISON_AUTHORIZATION_MAX_LIFETIME_MS
  ) {
    throw new Error(
      "value_comparison_authorization_validity_window_invalid"
    );
  }

  if (
    !exactKeys(
      artifact.bindings,
      [
        "dayKey",
        "remoteHead",
        "controllerDecisionFingerprint",
        "executorContractFingerprint",
        "mutationPreflightFingerprint",
        "candidateSetFingerprint"
      ]
    ) ||
    artifact.bindings.dayKey !==
      artifact.dayKey ||
    !VALID_REMOTE_HEAD.test(
      clean(
        artifact.bindings
          .remoteHead
      )
    ) ||
    [
      artifact.bindings
        .controllerDecisionFingerprint,
      artifact.bindings
        .executorContractFingerprint,
      artifact.bindings
        .mutationPreflightFingerprint,
      artifact.bindings
        .candidateSetFingerprint
    ]
      .some(
        value =>
          !VALID_SHA.test(
            clean(
              value
            )
          )
      )
  ) {
    throw new Error(
      "value_comparison_authorization_bindings_invalid"
    );
  }

  const expectedTargets =
    exactTargetScope(
      artifact.dayKey
    );

  if (
    artifact.operationScope.length <
      1 ||
    artifact.operationScope.length >
      2
  ) {
    throw new Error(
      "value_comparison_authorization_operation_count_invalid"
    );
  }

  const operationIds =
    new Set();

  const targetPaths =
    new Set();

  let previousTargetIndex =
    -1;

  for (
    const row of
      artifact.operationScope
  ) {
    if (
      !exactKeys(
        row,
        [
          "operationId",
          "targetPath",
          "preimageSha256",
          "preimageBytes",
          "postimageSha256",
          "postimageBytes"
        ]
      ) ||
      !VALID_OPERATION_ID.test(
        clean(
          row.operationId
        )
      ) ||
      !expectedTargets.includes(
        clean(
          row.targetPath
        )
      ) ||
      !VALID_SHA.test(
        clean(
          row.preimageSha256
        )
      ) ||
      !VALID_SHA.test(
        clean(
          row.postimageSha256
        )
      ) ||
      row.preimageSha256 ===
        row.postimageSha256 ||
      !Number.isInteger(
        Number(
          row.preimageBytes
        )
      ) ||
      Number(
        row.preimageBytes
      ) <=
        0 ||
      !Number.isInteger(
        Number(
          row.postimageBytes
        )
      ) ||
      Number(
        row.postimageBytes
      ) <=
        0 ||
      operationIds.has(
        row.operationId
      ) ||
      targetPaths.has(
        row.targetPath
      )
    ) {
      throw new Error(
        "value_comparison_authorization_operation_scope_invalid"
      );
    }

    const targetIndex =
      expectedTargets.indexOf(
        row.targetPath
      );

    if (
      targetIndex <=
        previousTargetIndex
    ) {
      throw new Error(
        "value_comparison_authorization_operation_order_invalid"
      );
    }

    previousTargetIndex =
      targetIndex;

    operationIds.add(
      row.operationId
    );

    targetPaths.add(
      row.targetPath
    );
  }

  if (
    !exactKeys(
      artifact.safety,
      [
        "exactRequestScopeOnly",
        "exactPreimageReverificationRequired",
        "exactPostimageVerificationRequired",
        "atomicWriteRequired",
        "verifiedBackupRequired",
        "reverseRollbackRequired",
        "allOrNothingRequired",
        "singleUseRequired",
        "externalGlobalLockRequired",
        "durableExternalJournalRequired",
        "partialExecutionForbidden"
      ]
    ) ||
    Object.values(
      artifact.safety
    )
      .some(
        value =>
          value !==
            true
      )
  ) {
    throw new Error(
      "value_comparison_authorization_safety_invalid"
    );
  }

  if (
    !VALID_SHA.test(
      clean(
        artifact.authorizationFingerprint
      )
    ) ||
    checkpointAwareValueComparisonAuthorizationFingerprint(
      artifact
    ) !==
      artifact.authorizationFingerprint
  ) {
    throw new Error(
      "value_comparison_authorization_fingerprint_invalid"
    );
  }

  if (
    !exactKeys(
      artifact.signature,
      [
        "algorithm",
        "encoding",
        "issuerId",
        "keyId",
        "publicKeySpkiSha256",
        "value"
      ]
    ) ||
    artifact.signature.algorithm !==
      "Ed25519" ||
    artifact.signature.encoding !==
      "base64" ||
    !clean(
      artifact.signature
        .issuerId
    ) ||
    !VALID_KEY_ID.test(
      clean(
        artifact.signature
          .keyId
      )
    ) ||
    !VALID_SHA.test(
      clean(
        artifact.signature
          .publicKeySpkiSha256
      )
    ) ||
    !canonicalBase64(
      artifact.signature
        .value
    )
  ) {
    throw new Error(
      "value_comparison_authorization_signature_envelope_invalid"
    );
  }

  return true;
}

export function validateCheckpointAwareValueComparisonAuthorizationBinding({
  authorization,
  preflight,
  candidateSet
} = {}) {
  validateCheckpointAwareValueComparisonAuthorizationArtifactStructure(
    authorization
  );

  const derivedCandidateSet =
    buildCheckpointAwareValueComparisonCandidateSetFromPreflight({
      preflight
    });

  if (
    !candidateSet ||
    typeof candidateSet !==
      "object" ||
    !sameJson(
      candidateSet,
      derivedCandidateSet
    )
  ) {
    throw new Error(
      "value_comparison_authorization_candidate_set_binding_mismatch"
    );
  }

  if (
    authorization.dayKey !==
      preflight.dayKey ||
    authorization.bindings.dayKey !==
      preflight.dayKey ||
    authorization.bindings.remoteHead !==
      preflight.remoteHead ||
    authorization.bindings.controllerDecisionFingerprint !==
      preflight.bindings.decisionFingerprint ||
    authorization.bindings.executorContractFingerprint !==
      preflight.bindings.executorContractFingerprint ||
    authorization.bindings.mutationPreflightFingerprint !==
      preflight.preflightFingerprint ||
    authorization.bindings.candidateSetFingerprint !==
      candidateSet.candidateSetFingerprint
  ) {
    throw new Error(
      "value_comparison_authorization_exact_binding_mismatch"
    );
  }

  if (
    !sameJson(
      authorization.operationScope,
      candidateSet.operationScope
    )
  ) {
    throw new Error(
      "value_comparison_authorization_exact_operation_binding_mismatch"
    );
  }

  return {
    schema:
      CHECKPOINT_AWARE_VALUE_COMPARISON_BINDING_VALIDATION_SCHEMA,

    ok:
      true,

    validationState:
      "STRUCTURE_AND_BINDINGS_VALID_SIGNATURE_UNVERIFIED",

    dayKey:
      authorization.dayKey,

    operationCount:
      authorization.operationScope.length,

    authorizationFingerprint:
      authorization.authorizationFingerprint,

    candidateSetFingerprint:
      candidateSet.candidateSetFingerprint,

    mutationPreflightFingerprint:
      preflight.preflightFingerprint,

    signature: {
      envelopeStructurallyValid:
        true,

      cryptographicallyVerified:
        false,

      pinnedTrustVerified:
        false
    },

    authority: {
      readOnly:
        true,

      authorizationGranted:
        false,

      signerUseAuthorized:
        false,

      productionKernelInvocationAuthorized:
        false,

      filesystemRepositoryWriteAuthorized:
        false,

      repairExecutionAuthorized:
        false
    }
  };
}
