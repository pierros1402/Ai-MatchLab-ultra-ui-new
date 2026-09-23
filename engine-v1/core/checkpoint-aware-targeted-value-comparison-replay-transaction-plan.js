import {
  createHash
} from "node:crypto";

import {
  validateCheckpointAwareValueComparisonAuthorizationBinding
} from "./checkpoint-aware-targeted-value-comparison-authorization-validator-binding.js";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_REPLAY_CONTRACT_SCHEMA =
  "ai-matchlab.checkpoint-aware-value-comparison-replay-contract.v1";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_TRANSACTION_PLAN_SCHEMA =
  "ai-matchlab.checkpoint-aware-value-comparison-execution-transaction-plan.v1";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_TRANSACTION_PLAN_VERSION =
  "1.0.0";

const VALID_DAY =
  /^\d{4}-\d{2}-\d{2}$/u;

const VALID_SHA =
  /^[0-9a-f]{64}$/u;

const VALID_REMOTE_HEAD =
  /^[0-9a-f]{40}$/u;

const VALID_AUTHORIZATION_ID =
  /^vcrauth_v1_[0-9a-f]{32}$/u;

const VALID_NONCE =
  /^vcrnonce_v1_[0-9a-f]{64}$/u;

const VALID_OPERATION_ID =
  /^vcrop_v1_[0-9a-f]{24}$/u;

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

function exactTargetScope(
  dayKey
) {
  return [
    `data/value-comparison/${dayKey}.json`,
    "data/value-comparison/cumulative.json"
  ];
}

export function deriveCheckpointAwareValueComparisonReplayKey({
  authorizationId,
  nonce,
  authorizationFingerprint
} = {}) {
  const id =
    clean(
      authorizationId
    );

  const token =
    clean(
      nonce
    );

  const fingerprint =
    clean(
      authorizationFingerprint
    );

  if (
    !VALID_AUTHORIZATION_ID.test(
      id
    ) ||
    !VALID_NONCE.test(
      token
    ) ||
    !VALID_SHA.test(
      fingerprint
    )
  ) {
    throw new Error(
      "value_comparison_replay_identity_invalid"
    );
  }

  return sha256Text(
    [
      id,
      token,
      fingerprint
    ].join(
      "\u0000"
    )
  );
}

export function validateCheckpointAwareValueComparisonReplayLedgerAdapter(
  adapter
) {
  if (
    !adapter ||
    typeof adapter !==
      "object" ||
    Array.isArray(
      adapter
    ) ||
    typeof adapter.consumeOnceAtomically !==
      "function" ||
    typeof adapter.readReplayConsumption !==
      "function"
  ) {
    throw new Error(
      "value_comparison_replay_ledger_adapter_invalid"
    );
  }

  return true;
}

function transactionSemanticCore(
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

    repairClass:
      artifact.repairClass,

    bindings:
      artifact.bindings,

    exactTargetUniverse:
      artifact.exactTargetUniverse,

    summary:
      artifact.summary,

    operations:
      artifact.operations,

    replayContract:
      artifact.replayContract,

    safety:
      artifact.safety,

    authority:
      artifact.authority
  };
}

export function checkpointAwareValueComparisonTransactionPlanFingerprint(
  artifact
) {
  if (
    !artifact ||
    typeof artifact !==
      "object"
  ) {
    throw new Error(
      "value_comparison_transaction_plan_artifact_required"
    );
  }

  return sha256Text(
    canonicalJson(
      transactionSemanticCore(
        artifact
      )
    )
  );
}

function normalizeCurrentTargetIdentity(
  row
) {
  const targetPath =
    clean(
      row?.targetPath
    );

  const sha256 =
    clean(
      row?.sha256
    );

  const bytes =
    Number(
      row?.bytes
    );

  if (
    !targetPath ||
    !VALID_SHA.test(
      sha256
    ) ||
    !Number.isInteger(
      bytes
    ) ||
    bytes <=
      0
  ) {
    throw new Error(
      "value_comparison_transaction_current_target_identity_invalid"
    );
  }

  return {
    targetPath,
    sha256,
    bytes
  };
}

export function validateCheckpointAwareValueComparisonTransactionPlanArtifact(
  artifact
) {
  if (
    !artifact ||
    typeof artifact !==
      "object" ||
    Array.isArray(
      artifact
    ) ||
    artifact.schema !==
      CHECKPOINT_AWARE_VALUE_COMPARISON_TRANSACTION_PLAN_SCHEMA ||
    artifact.version !==
      CHECKPOINT_AWARE_VALUE_COMPARISON_TRANSACTION_PLAN_VERSION ||
    artifact.role !==
      "derived_read_only_value_comparison_execution_transaction_plan" ||
    !VALID_DAY.test(
      clean(
        artifact.dayKey
      )
    ) ||
    artifact.repairClass !==
      EXACT_REPAIR_CLASS ||
    !Array.isArray(
      artifact.exactTargetUniverse
    ) ||
    !Array.isArray(
      artifact.operations
    )
  ) {
    throw new Error(
      "value_comparison_transaction_plan_structure_invalid"
    );
  }

  const exactTargets =
    exactTargetScope(
      artifact.dayKey
    );

  if (
    !sameJson(
      artifact.exactTargetUniverse,
      exactTargets
    ) ||
    artifact.operations.length <
      1 ||
    artifact.operations.length >
      2
  ) {
    throw new Error(
      "value_comparison_transaction_plan_scope_invalid"
    );
  }

  if (
    !artifact.bindings ||
    !VALID_AUTHORIZATION_ID.test(
      clean(
        artifact.bindings
          .authorizationId
      )
    ) ||
    !VALID_SHA.test(
      clean(
        artifact.bindings
          .authorizationFingerprint
      )
    ) ||
    !VALID_NONCE.test(
      clean(
        artifact.bindings
          .nonce
      )
    ) ||
    !VALID_SHA.test(
      clean(
        artifact.bindings
          .replayKey
      )
    ) ||
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
      "value_comparison_transaction_plan_bindings_invalid"
    );
  }

  const seenTargets =
    new Set();

  let previousIndex =
    -1;

  for (
    const operation of
      artifact.operations
  ) {
    const targetIndex =
      exactTargets.indexOf(
        operation
          ?.targetPath
      );

    if (
      !VALID_OPERATION_ID.test(
        clean(
          operation
            ?.operationId
        )
      ) ||
      targetIndex <
        0 ||
      targetIndex <=
        previousIndex ||
      seenTargets.has(
        operation.targetPath
      ) ||
      operation.mutationMode !==
        "REPLACE" ||
      !VALID_SHA.test(
        clean(
          operation
            ?.preimage
            ?.sha256
        )
      ) ||
      !Number.isInteger(
        Number(
          operation
            ?.preimage
            ?.bytes
        )
      ) ||
      Number(
        operation
          ?.preimage
          ?.bytes
      ) <=
        0 ||
      !VALID_SHA.test(
        clean(
          operation
            ?.postimage
            ?.contentSha256
        )
      ) ||
      !Number.isInteger(
        Number(
          operation
            ?.postimage
            ?.contentBytes
        )
      ) ||
      Number(
        operation
          ?.postimage
          ?.contentBytes
      ) <=
        0 ||
      operation
        ?.postimage
        ?.materialBindingState !==
          "HASH_AND_SIZE_ONLY_REMATERIALIZATION_REQUIRED" ||
      operation
        ?.rollback
        ?.sha256 !==
          operation
            ?.preimage
            ?.sha256 ||
      operation
        ?.rollback
        ?.bytes !==
          operation
            ?.preimage
            ?.bytes
    ) {
      throw new Error(
        "value_comparison_transaction_plan_operation_invalid"
      );
    }

    previousIndex =
      targetIndex;

    seenTargets.add(
      operation.targetPath
    );
  }

  if (
    artifact.summary.operationCount !==
      artifact.operations.length ||
    artifact.summary.replaceCount !==
      artifact.operations.length ||
    artifact.replayContract
      ?.consumptionState !==
        "NOT_CONSUMED_READ_ONLY_PLAN" ||
    artifact.replayContract
      ?.atomicConsumeRequired !==
        true ||
    artifact.replayContract
      ?.releaseAfterFailure !==
        false ||
    artifact.replayContract
      ?.retryRequiresNewAuthorization !==
        true ||
    artifact.safety
      ?.allOrNothingRequired !==
        true ||
    artifact.safety
      ?.preimageReverificationRequired !==
        true ||
    artifact.safety
      ?.postimageMaterialRematerializationRequired !==
        true ||
    artifact.safety
      ?.verifiedBackupRequired !==
        true ||
    artifact.safety
      ?.reverseRollbackRequired !==
        true ||
    artifact.authority
      ?.readOnly !==
        true ||
    artifact.authority
      ?.replayConsumptionAuthorized !==
        false ||
    artifact.authority
      ?.filesystemRepositoryWriteAuthorized !==
        false ||
    artifact.authority
      ?.repairExecutionAuthorized !==
        false ||
    artifact.authority
      ?.productionKernelInvocationAuthorized !==
        false
  ) {
    throw new Error(
      "value_comparison_transaction_plan_safety_invalid"
    );
  }

  if (
    !VALID_SHA.test(
      clean(
        artifact.transactionPlanFingerprint
      )
    ) ||
    checkpointAwareValueComparisonTransactionPlanFingerprint(
      artifact
    ) !==
      artifact.transactionPlanFingerprint
  ) {
    throw new Error(
      "value_comparison_transaction_plan_fingerprint_invalid"
    );
  }

  return true;
}

export function buildCheckpointAwareValueComparisonReadOnlyTransactionPlan({
  authorization,
  preflight,
  candidateSet,
  pinnedTrustVerification,
  currentTargetIdentities
} = {}) {
  validateCheckpointAwareValueComparisonAuthorizationBinding({
    authorization,
    preflight,
    candidateSet
  });

  if (
    !pinnedTrustVerification ||
    typeof pinnedTrustVerification !==
      "object" ||
    pinnedTrustVerification
      .validationState !==
        "SIGNATURE_AND_PINNED_TRUST_VERIFIED_READ_ONLY" ||
    pinnedTrustVerification.ok !==
      true ||
    pinnedTrustVerification
      .authorizationFingerprint !==
        authorization
          .authorizationFingerprint ||
    pinnedTrustVerification
      .candidateSetFingerprint !==
        candidateSet
          .candidateSetFingerprint ||
    pinnedTrustVerification
      .mutationPreflightFingerprint !==
        preflight
          .preflightFingerprint ||
    pinnedTrustVerification
      .signature
      ?.cryptographicallyVerified !==
        true ||
    pinnedTrustVerification
      .signature
      ?.pinnedTrustVerified !==
        true ||
    pinnedTrustVerification
      .authority
      ?.authorizationGranted !==
        false ||
    pinnedTrustVerification
      .authority
      ?.repairExecutionAuthorized !==
        false
  ) {
    throw new Error(
      "value_comparison_transaction_plan_pinned_trust_verification_invalid"
    );
  }

  const expectedTargets =
    exactTargetScope(
      authorization.dayKey
    );

  const identities =
    (
      Array.isArray(
        currentTargetIdentities
      )
        ? currentTargetIdentities
        : []
    )
      .map(
        normalizeCurrentTargetIdentity
      );

  const identityByPath =
    new Map(
      identities.map(
        row => [
          row.targetPath,
          row
        ]
      )
    );

  if (
    identityByPath.size !==
      identities.length
  ) {
    throw new Error(
      "value_comparison_transaction_current_target_identity_duplicate"
    );
  }

  const operations =
    authorization
      .operationScope
      .map(
        operation => {
          const current =
            identityByPath.get(
              operation.targetPath
            );

          if (
            !current ||
            current.sha256 !==
              operation.preimageSha256 ||
            current.bytes !==
              operation.preimageBytes
          ) {
            throw new Error(
              "value_comparison_transaction_preimage_reverification_failed"
            );
          }

          return {
            operationId:
              operation.operationId,

            targetPath:
              operation.targetPath,

            mutationMode:
              "REPLACE",

            preimage: {
              sha256:
                operation.preimageSha256,

              bytes:
                operation.preimageBytes,

              reverifiedCurrent:
                true
            },

            postimage: {
              contentSha256:
                operation.postimageSha256,

              contentBytes:
                operation.postimageBytes,

              materialBindingState:
                "HASH_AND_SIZE_ONLY_REMATERIALIZATION_REQUIRED"
            },

            rollback: {
              sha256:
                operation.preimageSha256,

              bytes:
                operation.preimageBytes
            }
          };
        }
      );

  if (
    operations.some(
      operation =>
        !expectedTargets.includes(
          operation.targetPath
        )
    )
  ) {
    throw new Error(
      "value_comparison_transaction_plan_target_outside_exact_scope"
    );
  }

  const replayKey =
    deriveCheckpointAwareValueComparisonReplayKey({
      authorizationId:
        authorization
          .authorizationId,

      nonce:
        authorization
          .nonce,

      authorizationFingerprint:
        authorization
          .authorizationFingerprint
    });

  const artifact = {
    schema:
      CHECKPOINT_AWARE_VALUE_COMPARISON_TRANSACTION_PLAN_SCHEMA,

    version:
      CHECKPOINT_AWARE_VALUE_COMPARISON_TRANSACTION_PLAN_VERSION,

    role:
      "derived_read_only_value_comparison_execution_transaction_plan",

    dayKey:
      authorization.dayKey,

    repairClass:
      EXACT_REPAIR_CLASS,

    bindings: {
      authorizationId:
        authorization
          .authorizationId,

      authorizationFingerprint:
        authorization
          .authorizationFingerprint,

      nonce:
        authorization
          .nonce,

      replayKey,

      remoteHead:
        authorization
          .bindings
          .remoteHead,

      controllerDecisionFingerprint:
        authorization
          .bindings
          .controllerDecisionFingerprint,

      executorContractFingerprint:
        authorization
          .bindings
          .executorContractFingerprint,

      mutationPreflightFingerprint:
        authorization
          .bindings
          .mutationPreflightFingerprint,

      candidateSetFingerprint:
        authorization
          .bindings
          .candidateSetFingerprint
    },

    exactTargetUniverse:
      expectedTargets,

    summary: {
      operationCount:
        operations.length,

      replaceCount:
        operations.length
    },

    operations,

    replayContract: {
      schema:
        CHECKPOINT_AWARE_VALUE_COMPARISON_REPLAY_CONTRACT_SCHEMA,

      ledgerLocation:
        "outside_repository_and_planning_pipeline",

      replayKeyInputs: [
        "authorizationId",
        "nonce",
        "authorizationFingerprint"
      ],

      sha256Derived:
        true,

      atomicConsumeRequired:
        true,

      consumptionState:
        "NOT_CONSUMED_READ_ONLY_PLAN",

      releaseAfterFailure:
        false,

      retryRequiresNewAuthorization:
        true
    },

    safety: {
      allOrNothingRequired:
        true,

      preimageReverificationRequired:
        true,

      postimageMaterialRematerializationRequired:
        true,

      exactPostimageVerificationRequiredAfterMaterialization:
        true,

      externalGlobalLockRequired:
        true,

      durableExternalJournalRequired:
        true,

      verifiedBackupRequired:
        true,

      reverseRollbackRequired:
        true,

      crashRecoveryRollbackOnly:
        true,

      partialExecutionForbidden:
        true
    },

    authority: {
      readOnly:
        true,

      replayConsumptionAuthorized:
        false,

      authorizationGranted:
        false,

      postimageMaterialResolutionAuthorized:
        false,

      filesystemRepositoryWriteAuthorized:
        false,

      repairExecutionAuthorized:
        false,

      productionKernelInvocationAuthorized:
        false,

      signerUseAuthorized:
        false,

      commitAuthorized:
        false,

      pushAuthorized:
        false,

      deployAuthorized:
        false
    }
  };

  artifact.transactionPlanFingerprint =
    checkpointAwareValueComparisonTransactionPlanFingerprint(
      artifact
    );

  validateCheckpointAwareValueComparisonTransactionPlanArtifact(
    artifact
  );

  return artifact;
}
