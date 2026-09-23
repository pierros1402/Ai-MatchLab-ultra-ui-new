import {
  createHash
} from "node:crypto";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_AUTH_TRANSACTION_DESIGN_SCHEMA =
  "ai-matchlab.checkpoint-aware-value-comparison-authorization-transaction-schema-design.v1";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_AUTH_TRANSACTION_DESIGN_STATE =
  "SCHEMA_DESIGN_READY_DISABLED";

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

const EXACT_REPAIR_CLASS =
  "REBUILD_VALUE_COMPARISON_ONLY";

const AUTHORIZATION_SCHEMA =
  "ai-matchlab.checkpoint-aware-value-comparison-execution-authorization.v1";

const TRANSACTION_SCHEMA =
  "ai-matchlab.checkpoint-aware-value-comparison-execution-transaction-plan.v1";

const AUTHORIZATION_DOMAIN =
  "AI_MATCHLAB_CHECKPOINT_VALUE_COMPARISON_EXECUTION_AUTHORIZATION_V1\u0000";

const MAX_LIFETIME_MS =
  15 * 60 * 1000;

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

function fingerprint(value) {
  return createHash(
    "sha256"
  )
    .update(
      JSON.stringify(
        stableValue(
          value
        )
      )
    )
    .digest(
      "hex"
    );
}

function exactTargetScope(dayKey) {
  return [
    `data/value-comparison/${dayKey}.json`,
    "data/value-comparison/cumulative.json"
  ];
}

export function checkpointAwareValueComparisonAuthTransactionDesignFingerprint(
  artifact
) {
  if (
    !artifact ||
    typeof artifact !==
      "object"
  ) {
    throw new Error(
      "value_comparison_auth_transaction_design_artifact_required"
    );
  }

  const {
    designFingerprint:
      _ignored,
    ...unsigned
  } = artifact;

  return fingerprint(
    unsigned
  );
}

export function buildCheckpointAwareValueComparisonAuthTransactionSchemaDesign({
  dayKey,
  disabledAdapterContract
} = {}) {
  const day =
    clean(
      dayKey
    );

  if (
    !DAY_RE.test(
      day
    )
  ) {
    throw new Error(
      "value_comparison_auth_transaction_design_day_invalid"
    );
  }

  if (
    !disabledAdapterContract ||
    typeof disabledAdapterContract !==
      "object" ||
    disabledAdapterContract
      .mode !==
        "DISABLED_PRODUCTION_TRANSACTION_ADAPTER_CONTRACT" ||
    disabledAdapterContract
      .route
      ?.dedicatedRepairClass !==
        EXACT_REPAIR_CLASS ||
    disabledAdapterContract
      .authority
      ?.adapterEnabled !==
        false ||
    disabledAdapterContract
      .authority
      ?.mutableExecutionAuthorized !==
        false ||
    disabledAdapterContract
      .authority
      ?.signerUseAuthorized !==
        false ||
    disabledAdapterContract
      .authority
      ?.protectedPathBypassAuthorized !==
        false
  ) {
    throw new Error(
      "value_comparison_auth_transaction_design_disabled_adapter_contract_invalid"
    );
  }

  const targets =
    exactTargetScope(
      day
    );

  const artifact = {
    schema:
      CHECKPOINT_AWARE_VALUE_COMPARISON_AUTH_TRANSACTION_DESIGN_SCHEMA,

    version:
      "1.0.0",

    role:
      "dedicated_authorization_and_transaction_schema_design",

    mode:
      "SCHEMA_DESIGN_ONLY",

    designState:
      CHECKPOINT_AWARE_VALUE_COMPARISON_AUTH_TRANSACTION_DESIGN_STATE,

    dayKey:
      day,

    route: {
      failureClass:
        "VALUE_PLAN_COMPARISON_STALE_AGAINST_CANONICAL",

      repairUnit:
        "rebuild_day_value_comparison_and_cumulative_only",

      dedicatedRepairClass:
        EXACT_REPAIR_CLASS
    },

    exactTargetUniverse:
      targets,

    authorizationSchema: {
      schema:
        AUTHORIZATION_SCHEMA,

      role:
        "externally_signed_bounded_value_comparison_execution_authorization",

      repairClass:
        EXACT_REPAIR_CLASS,

      authorizationIdPattern:
        "^vcrauth_v1_[0-9a-f]{32}$",

      noncePattern:
        "^vcrnonce_v1_[0-9a-f]{64}$",

      validity: {
        maxLifetimeMs:
          MAX_LIFETIME_MS,

        canonicalUtcRequired:
          true,

        issuedAtBeforeOrEqualNotBefore:
          true,

        notBeforeStrictlyBeforeExpiresAt:
          true
      },

      signature: {
        algorithm:
          "Ed25519",

        encoding:
          "base64",

        domainSeparator:
          AUTHORIZATION_DOMAIN,

        externalSignerRequired:
          true,

        repositoryPrivateKeyForbidden:
          true,

        runtimePrivateKeyInputForbidden:
          true,

        pinnedPublicKeyTrustRequired:
          true,

        callerSuppliedTrustForbidden:
          true
      },

      bindings: [
        "dayKey",
        "remoteHead",
        "controllerDecisionFingerprint",
        "executorContractFingerprint",
        "mutationPreflightFingerprint",
        "candidateSetFingerprint"
      ],

      operationScope: {
        minOperations:
          1,

        maxOperations:
          2,

        allowedTargets:
          targets,

        mutationMode:
          "REPLACE_ONLY",

        createForbidden:
          true,

        duplicateTargetForbidden:
          true,

        canonicalTargetOrderRequired:
          true,

        eachOperationMustBind: [
          "operationId",
          "targetPath",
          "preimageSha256",
          "preimageBytes",
          "postimageSha256",
          "postimageBytes"
        ]
      },

      safety: {
        exactRequestScopeOnly:
          true,

        exactPreimageReverificationRequired:
          true,

        exactPostimageVerificationRequired:
          true,

        atomicWriteRequired:
          true,

        verifiedBackupRequired:
          true,

        reverseRollbackRequired:
          true,

        allOrNothingRequired:
          true,

        singleUseRequired:
          true,

        externalGlobalLockRequired:
          true,

        durableExternalJournalRequired:
          true,

        partialExecutionForbidden:
          true
      }
    },

    replayContract: {
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

      releaseAfterFailure:
        false,

      retryRequiresNewAuthorization:
        true
    },

    transactionPlanSchema: {
      schema:
        TRANSACTION_SCHEMA,

      role:
        "derived_read_only_value_comparison_execution_transaction_plan",

      repairClass:
        EXACT_REPAIR_CLASS,

      buildRequiresVerifiedAuthorization:
        true,

      buildRequiresExactPreimageReverification:
        true,

      buildRequiresCandidateSetFingerprintMatch:
        true,

      exactTargetUniverse:
        targets,

      operationScope: {
        minOperations:
          1,

        maxOperations:
          2,

        mutationMode:
          "REPLACE_ONLY",

        createForbidden:
          true,

        canonicalTargetOrderRequired:
          true,

        exactPreimageRequired:
          true,

        exactPostimageRequired:
          true,

        rollbackPreimageMustEqualVerifiedPreimage:
          true
      },

      bindings: [
        "authorizationId",
        "authorizationFingerprint",
        "nonce",
        "replayKey",
        "remoteHead",
        "controllerDecisionFingerprint",
        "executorContractFingerprint",
        "mutationPreflightFingerprint",
        "candidateSetFingerprint"
      ],

      safety: {
        pinnedTrustReverificationRequired:
          true,

        preimageReverificationRequired:
          true,

        externalGlobalLockRequired:
          true,

        atomicReplayConsumeRequired:
          true,

        durableExternalJournalRequired:
          true,

        verifiedBackupRequiredForEveryReplace:
          true,

        fsyncedTempRequired:
          true,

        postimageVerificationRequired:
          true,

        reverseRollbackRequired:
          true,

        crashRecoveryRollbackOnly:
          true,

        allTargetsAppliedOrVerifiedRestored:
          true
      }
    },

    kernelBoundary: {
      existingGenericKernelCompatible:
        false,

      existingGenericKernelInvocationAuthorized:
        false,

      reason:
        "existing_kernel_validates_the_legacy_autonomous_repair_transaction_plan_schema_only",

      dedicatedKernelAdapterRequired:
        true,

      dedicatedKernelAdapterEnabled:
        false,

      protectedPathBypassAuthorized:
        false
    },

    legacyCompatibility: {
      legacyAuthorizationV2Modified:
        false,

      legacyTransactionPlanModified:
        false,

      legacyRepairClassRegistryModified:
        false,

      legacyProtectedPathRulesModified:
        false,

      maySilentlyAddDedicatedRepairClassToLegacySchemas:
        false,

      mayReuseLegacyProtectedPathBypass:
        false
    },

    requiredIndependentValidationBeforeEnablement: [
      "dedicated_authorization_schema_validator",
      "dedicated_signature_verifier_against_pinned_public_trust",
      "dedicated_authorization_to_preflight_binding_validator",
      "dedicated_single_use_replay_key_derivation_and_external_ledger_contract",
      "dedicated_transaction_plan_builder",
      "dedicated_transaction_plan_validator",
      "dedicated_kernel_adapter_sandbox_execution",
      "injected_partial_failure_reverse_rollback",
      "remote_head_race_guard",
      "production_kernel_remains_disabled_until_all_prior_items_pass"
    ],

    nextRequiredGate: {
      name:
        "DEDICATED_VALUE_COMPARISON_AUTHORIZATION_VALIDATOR_AND_BINDING_CONTRACT_READ_ONLY",

      signerUsePermitted:
        false,

      authorizationArtifactCreationPermitted:
        false,

      productionKernelEnablePermitted:
        false,

      repositoryMutationPermitted:
        false
    },

    authority: {
      readOnly:
        true,

      planningOnly:
        true,

      schemaDesignOnly:
        true,

      authorizationArtifactCreationAuthorized:
        false,

      signerUseAuthorized:
        false,

      productionKernelInvocationAuthorized:
        false,

      productionKernelEnableAuthorized:
        false,

      filesystemRepositoryWriteAuthorized:
        false,

      repairExecutionAuthorized:
        false,

      mutableExecutionAuthorized:
        false,

      protectedPathBypassAuthorized:
        false,

      commitAuthorized:
        false,

      pushAuthorized:
        false,

      deployAuthorized:
        false,

      workflowMutationAuthorized:
        false
    }
  };

  artifact.designFingerprint =
    checkpointAwareValueComparisonAuthTransactionDesignFingerprint(
      artifact
    );

  return artifact;
}
