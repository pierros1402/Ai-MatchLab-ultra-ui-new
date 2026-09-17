import {
  createHash
} from "node:crypto";

import {
  validateAutonomousRepairExecutionAuthorizationV2Binding
} from "./autonomous-repair-execution-authorization-v2-binding.js";

import {
  validateAutonomousRepairSourceBoundMaterialResolution
} from "./autonomous-repair-source-bound-material-resolver.js";

import {
  materialContentBuffer
} from "./autonomous-repair-target-material.js";

import {
  validateAutonomousRepairPublicationCoupledMaterialBundle
} from "./autonomous-repair-publication-coupled-materializer.js";

export const AUTONOMOUS_REPAIR_EXECUTION_TRANSACTION_PLAN_SCHEMA =
  "ai-matchlab.autonomous-repair-execution-transaction-plan.v1";

export const AUTONOMOUS_REPAIR_EXECUTION_TRANSACTION_PLAN_VERSION =
  "1.0.0";

const VALID_DAY =
  /^\d{4}-\d{2}-\d{2}$/u;

const VALID_SHA =
  /^[0-9a-f]{64}$/u;

const VALID_AUTHORIZATION_ID =
  /^arauth_v2_[0-9a-f]{32}$/u;

const VALID_NONCE =
  /^arnonce_v2_[0-9a-f]{64}$/u;

const VALID_OPERATION_ID =
  /^arpo_v1_[0-9a-f]{24}$/u;

const VALID_DECISION_ID =
  /^arpd_v1_[0-9a-f]{24}$/u;

const REPAIR_CLASSES =
  Object.freeze([
    "ACQUIRE_VERIFIED_FINAL_EVIDENCE",
    "REBUILD_HISTORY_ELIGIBLE_ROW",
    "REBUILD_PUBLICATION_CANONICAL_ROW"
  ]);

const SOURCE_KIND =
  Object.freeze({
    TARGET_MATERIAL:
      "TARGET_MATERIAL",
    PUBLICATION_MUTATION:
      "PUBLICATION_MUTATION"
  });

const SAFETY =
  Object.freeze({
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
    verifiedBackupRequiredForReplace:
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
  });

const AUTHORITY =
  Object.freeze({
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
  });

function clean(
  value
) {
  return String(
    value ?? ""
  ).trim();
}

function stableValue(
  value
) {
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

function sha256Value(
  value
) {
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

function sha256Buffer(
  value
) {
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
  expected,
  label
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value
    )
  ) {
    throw new Error(
      `${label}_object_required`
    );
  }

  const actual =
    Object.keys(
      value
    ).sort();

  const wanted =
    [...expected]
      .sort();

  if (
    JSON.stringify(
      actual
    ) !==
    JSON.stringify(
      wanted
    )
  ) {
    throw new Error(
      `${label}_keys_invalid`
    );
  }
}

function canonicalTimestamp(
  value
) {
  const text =
    clean(
      value
    );

  const millis =
    Date.parse(
      text
    );

  return (
    Number.isFinite(
      millis
    ) &&
    new Date(
      millis
    ).toISOString() ===
      text
  );
}

function sameTextArray(
  a,
  b
) {
  return (
    Array.isArray(
      a
    ) &&
    Array.isArray(
      b
    ) &&
    a.length ===
      b.length &&
    a.every(
      (
        value,
        index
      ) =>
        value ===
          b[index]
    )
  );
}

function canonicalOperationOrder(
  a,
  b
) {
  return [
    a.targetPath,
    a.operationId
  ]
    .join(
      "\u0000"
    )
    .localeCompare(
      [
        b.targetPath,
        b.operationId
      ].join(
        "\u0000"
      )
    );
}

function normalizeBase64Buffer({
  contentBase64,
  contentSha256,
  contentBytes,
  label
}) {
  if (
    typeof contentBase64 !==
      "string" ||
    contentBase64.length ===
      0 ||
    !VALID_SHA.test(
      clean(
        contentSha256
      ).toLowerCase()
    ) ||
    !Number.isSafeInteger(
      contentBytes
    ) ||
    contentBytes <=
      0
  ) {
    throw new Error(
      `${label}_identity_invalid`
    );
  }

  let buffer;

  try {
    buffer =
      Buffer.from(
        contentBase64,
        "base64"
      );
  }
  catch {
    throw new Error(
      `${label}_base64_invalid`
    );
  }

  if (
    buffer.length ===
      0 ||
    buffer.toString(
      "base64"
    ) !==
      contentBase64 ||
    buffer.length !==
      contentBytes ||
    sha256Buffer(
      buffer
    ) !==
      clean(
        contentSha256
      ).toLowerCase()
  ) {
    throw new Error(
      `${label}_content_identity_mismatch`
    );
  }

  return buffer;
}

function transactionSemanticCore(
  artifact
) {
  return {
    schema:
      artifact.schema,
    version:
      artifact.version,
    dayKey:
      artifact.dayKey,
    role:
      artifact.role,
    bindings:
      artifact.bindings,
    repairClassScope:
      artifact.repairClassScope,
    summary:
      artifact.summary,
    operations:
      artifact.operations,
    safety:
      artifact.safety,
    authority:
      artifact.authority
  };
}

function materialDescriptorMap(
  materialResolution
) {
  validateAutonomousRepairSourceBoundMaterialResolution(
    materialResolution
  );

  const materialByDecisionId =
    new Map(
      materialResolution
        .materialCatalog
        .materials
        .map(
          row => [
            row.candidateDecisionId,
            row
          ]
        )
    );

  const resolutionByDecisionId =
    new Map(
      materialResolution
        .resolutions
        .map(
          row => [
            row.candidateDecisionId,
            row
          ]
        )
    );

  const out =
    new Map();

  for (
    const candidateDecisionId of
      materialResolution
        .candidateDecisionIds
  ) {
    const resolution =
      resolutionByDecisionId.get(
        candidateDecisionId
      );

    const material =
      materialByDecisionId.get(
        candidateDecisionId
      );

    const targets =
      materialResolution
        .targetsByDecisionId[
          candidateDecisionId
        ];

    if (
      !resolution ||
      !material ||
      !Array.isArray(
        targets
      ) ||
      targets.length ===
        0
    ) {
      throw new Error(
        "autonomous_repair_execution_transaction_material_shape_invalid"
      );
    }

    if (
      resolution.repairClass ===
        "REBUILD_PUBLICATION_CANONICAL_ROW"
    ) {
      const bundle =
        resolution.publicationBundle;

      const validation =
        validateAutonomousRepairPublicationCoupledMaterialBundle(
          bundle
        );

      if (
        !validation?.ok ||
        !Array.isArray(
          bundle?.mutations
        ) ||
        bundle.mutations.length !==
          targets.length ||
        bundle.mutations.some(
          row =>
            row.action !==
              "write"
        )
      ) {
        throw new Error(
          "autonomous_repair_execution_transaction_publication_bundle_invalid"
        );
      }

      const targetByPath =
        new Map(
          targets.map(
            row => [
              row.targetPath,
              row
            ]
          )
        );

      for (
        const mutation of
          bundle.mutations
      ) {
        const target =
          targetByPath.get(
            mutation.targetPath
          );

        const buffer =
          normalizeBase64Buffer({
            contentBase64:
              mutation.contentBase64,
            contentSha256:
              mutation.contentSha256,
            contentBytes:
              mutation.contentBytes,
            label:
              "autonomous_repair_execution_transaction_publication_postimage"
          });

        if (
          !target ||
          target.plannedAction !==
            mutation.action ||
          target.plannedContentSha256 !==
            mutation.contentSha256 ||
          target.plannedContentBytes !==
            mutation.contentBytes ||
          target.publicationRole !==
            mutation.role ||
          target.publicationBundleFingerprint !==
            bundle.bundleFingerprint
        ) {
          throw new Error(
            "autonomous_repair_execution_transaction_publication_target_mismatch"
          );
        }

        out.set(
          mutation.targetPath,
          {
            candidateDecisionId,
            repairClass:
              resolution.repairClass,
            sourceKind:
              SOURCE_KIND.PUBLICATION_MUTATION,
            materialFingerprint:
              resolution.materialFingerprint,
            publicationBundleFingerprint:
              bundle.bundleFingerprint,
            publicationRole:
              mutation.role,
            contentSha256:
              mutation.contentSha256,
            contentBytes:
              mutation.contentBytes,
            buffer
          }
        );
      }

      continue;
    }

    if (
      targets.length !==
        1
    ) {
      throw new Error(
        "autonomous_repair_execution_transaction_ordinary_target_cardinality_invalid"
      );
    }

    const target =
      targets[0];

    const buffer =
      materialContentBuffer(
        material
      );

    if (
      target.targetPath !==
        material.targetPath ||
      target.plannedContentSha256 !==
        material.contentSha256 ||
      target.plannedContentBytes !==
        material.contentBytes ||
      sha256Buffer(
        buffer
      ) !==
        material.contentSha256 ||
      buffer.length !==
        material.contentBytes
    ) {
      throw new Error(
        "autonomous_repair_execution_transaction_ordinary_material_mismatch"
      );
    }

    out.set(
      target.targetPath,
      {
        candidateDecisionId,
        repairClass:
          resolution.repairClass,
        sourceKind:
          SOURCE_KIND.TARGET_MATERIAL,
        materialFingerprint:
          material.materialFingerprint,
        publicationBundleFingerprint:
          null,
        publicationRole:
          null,
        contentSha256:
          material.contentSha256,
        contentBytes:
          material.contentBytes,
        buffer
      }
    );
  }

  return out;
}

function expectedSummary(
  operations
) {
  return {
    operationCount:
      operations.length,

    createCount:
      operations.filter(
        row =>
          row.mutationMode ===
            "CREATE"
      ).length,

    replaceCount:
      operations.filter(
        row =>
          row.mutationMode ===
            "REPLACE"
      ).length,

    publicationMutationCount:
      operations.filter(
        row =>
          row.postimage.sourceKind ===
            SOURCE_KIND.PUBLICATION_MUTATION
      ).length,

    totalPostimageBytes:
      operations.reduce(
        (
          total,
          row
        ) =>
          total +
          row.postimage.contentBytes,
        0
      )
  };
}

export function autonomousRepairExecutionTransactionPlanFingerprint(
  artifact
) {
  return sha256Value(
    transactionSemanticCore(
      artifact
    )
  );
}

export function validateAutonomousRepairExecutionTransactionPlanArtifact(
  artifact
) {
  exactKeys(
    artifact,
    [
      "schema",
      "version",
      "dayKey",
      "generatedAt",
      "role",
      "bindings",
      "transactionFingerprint",
      "repairClassScope",
      "summary",
      "operations",
      "safety",
      "authority"
    ],
    "autonomous_repair_execution_transaction_plan"
  );

  if (
    artifact.schema !==
      AUTONOMOUS_REPAIR_EXECUTION_TRANSACTION_PLAN_SCHEMA ||
    artifact.version !==
      AUTONOMOUS_REPAIR_EXECUTION_TRANSACTION_PLAN_VERSION ||
    artifact.role !==
      "derived_read_only_bounded_execution_transaction_plan" ||
    !VALID_DAY.test(
      clean(
        artifact.dayKey
      )
    ) ||
    !canonicalTimestamp(
      artifact.generatedAt
    )
  ) {
    throw new Error(
      "autonomous_repair_execution_transaction_plan_header_invalid"
    );
  }

  exactKeys(
    artifact.bindings,
    [
      "authorizationId",
      "nonce",
      "authorizationFingerprint",
      "requestFingerprint",
      "planFingerprint",
      "verificationFingerprint",
      "materialResolutionFingerprint",
      "replayKey"
    ],
    "autonomous_repair_execution_transaction_plan_bindings"
  );

  if (
    !VALID_AUTHORIZATION_ID.test(
      clean(
        artifact.bindings.authorizationId
      )
    ) ||
    !VALID_NONCE.test(
      clean(
        artifact.bindings.nonce
      )
    ) ||
    [
      "authorizationFingerprint",
      "requestFingerprint",
      "planFingerprint",
      "verificationFingerprint",
      "materialResolutionFingerprint",
      "replayKey"
    ].some(
      key =>
        !VALID_SHA.test(
          clean(
            artifact.bindings[key]
          )
        )
    )
  ) {
    throw new Error(
      "autonomous_repair_execution_transaction_plan_binding_identity_invalid"
    );
  }

  if (
    !VALID_SHA.test(
      clean(
        artifact.transactionFingerprint
      )
    ) ||
    !Array.isArray(
      artifact.repairClassScope
    ) ||
    artifact.repairClassScope.length ===
      0 ||
    !sameTextArray(
      artifact.repairClassScope,
      Array.from(
        new Set(
          artifact.repairClassScope
        )
      ).sort()
    ) ||
    artifact.repairClassScope.some(
      value =>
        !REPAIR_CLASSES.includes(
          value
        )
    ) ||
    !Array.isArray(
      artifact.operations
    ) ||
    artifact.operations.length ===
      0
  ) {
    throw new Error(
      "autonomous_repair_execution_transaction_plan_scope_invalid"
    );
  }

  const targetPaths =
    new Set();

  const operationIds =
    new Set();

  const canonicalOperations =
    [...artifact.operations]
      .sort(
        canonicalOperationOrder
      );

  if (
    JSON.stringify(
      canonicalOperations
    ) !==
    JSON.stringify(
      artifact.operations
    )
  ) {
    throw new Error(
      "autonomous_repair_execution_transaction_plan_operation_order_invalid"
    );
  }

  for (
    const operation of
      artifact.operations
  ) {
    exactKeys(
      operation,
      [
        "operationId",
        "candidateDecisionId",
        "repairClass",
        "targetPath",
        "mutationMode",
        "preimage",
        "postimage",
        "rollback"
      ],
      "autonomous_repair_execution_transaction_plan_operation"
    );

    if (
      !VALID_OPERATION_ID.test(
        clean(
          operation.operationId
        )
      ) ||
      !VALID_DECISION_ID.test(
        clean(
          operation.candidateDecisionId
        )
      ) ||
      !REPAIR_CLASSES.includes(
        operation.repairClass
      ) ||
      !clean(
        operation.targetPath
      ) ||
      targetPaths.has(
        operation.targetPath
      ) ||
      operationIds.has(
        operation.operationId
      ) ||
      ![
        "CREATE",
        "REPLACE"
      ].includes(
        operation.mutationMode
      )
    ) {
      throw new Error(
        "autonomous_repair_execution_transaction_plan_operation_identity_invalid"
      );
    }

    targetPaths.add(
      operation.targetPath
    );

    operationIds.add(
      operation.operationId
    );

    exactKeys(
      operation.preimage,
      [
        "targetExists",
        "sha256",
        "bytes",
        "preimageFingerprint"
      ],
      "autonomous_repair_execution_transaction_plan_preimage"
    );

    if (
      typeof operation.preimage.targetExists !==
        "boolean" ||
      !VALID_SHA.test(
        clean(
          operation.preimage.preimageFingerprint
        )
      )
    ) {
      throw new Error(
        "autonomous_repair_execution_transaction_plan_preimage_identity_invalid"
      );
    }

    if (
      operation.mutationMode ===
        "CREATE"
    ) {
      if (
        operation.preimage.targetExists !==
          false ||
        operation.preimage.sha256 !==
          null ||
        operation.preimage.bytes !==
          null
      ) {
        throw new Error(
          "autonomous_repair_execution_transaction_plan_create_preimage_invalid"
        );
      }
    }
    else {
      if (
        operation.preimage.targetExists !==
          true ||
        !VALID_SHA.test(
          clean(
            operation.preimage.sha256
          )
        ) ||
        !Number.isSafeInteger(
          operation.preimage.bytes
        ) ||
        operation.preimage.bytes <
          0
      ) {
        throw new Error(
          "autonomous_repair_execution_transaction_plan_replace_preimage_invalid"
        );
      }
    }

    exactKeys(
      operation.postimage,
      [
        "sourceKind",
        "materialFingerprint",
        "publicationBundleFingerprint",
        "publicationRole",
        "contentSha256",
        "contentBytes"
      ],
      "autonomous_repair_execution_transaction_plan_postimage"
    );

    if (
      !Object.values(
        SOURCE_KIND
      ).includes(
        operation.postimage.sourceKind
      ) ||
      !VALID_SHA.test(
        clean(
          operation.postimage.materialFingerprint
        )
      ) ||
      !VALID_SHA.test(
        clean(
          operation.postimage.contentSha256
        )
      ) ||
      !Number.isSafeInteger(
        operation.postimage.contentBytes
      ) ||
      operation.postimage.contentBytes <=
        0 ||
      Object.hasOwn(
        operation.postimage,
        "contentBase64"
      )
    ) {
      throw new Error(
        "autonomous_repair_execution_transaction_plan_postimage_identity_invalid"
      );
    }

    if (
      operation.postimage.sourceKind ===
        SOURCE_KIND.TARGET_MATERIAL
    ) {
      if (
        operation.postimage.publicationBundleFingerprint !==
          null ||
        operation.postimage.publicationRole !==
          null
      ) {
        throw new Error(
          "autonomous_repair_execution_transaction_plan_ordinary_source_invalid"
        );
      }
    }
    else {
      if (
        !VALID_SHA.test(
          clean(
            operation.postimage.publicationBundleFingerprint
          )
        ) ||
        !clean(
          operation.postimage.publicationRole
        ) ||
        operation.repairClass !==
          "REBUILD_PUBLICATION_CANONICAL_ROW"
      ) {
        throw new Error(
          "autonomous_repair_execution_transaction_plan_publication_source_invalid"
        );
      }
    }

    exactKeys(
      operation.rollback,
      [
        "strategy"
      ],
      "autonomous_repair_execution_transaction_plan_rollback"
    );

    const expectedRollback =
      operation.mutationMode ===
        "CREATE"
        ? "DELETE_CREATED_TARGET"
        : "RESTORE_PREIMAGE";

    if (
      operation.rollback.strategy !==
        expectedRollback
    ) {
      throw new Error(
        "autonomous_repair_execution_transaction_plan_rollback_strategy_invalid"
      );
    }
  }

  const derivedRepairClassScope =
    Array.from(
      new Set(
        artifact.operations.map(
          row =>
            row.repairClass
        )
      )
    ).sort();

  if (
    !sameTextArray(
      artifact.repairClassScope,
      derivedRepairClassScope
    )
  ) {
    throw new Error(
      "autonomous_repair_execution_transaction_plan_repair_class_scope_mismatch"
    );
  }

  exactKeys(
    artifact.summary,
    [
      "operationCount",
      "createCount",
      "replaceCount",
      "publicationMutationCount",
      "totalPostimageBytes"
    ],
    "autonomous_repair_execution_transaction_plan_summary"
  );

  if (
    JSON.stringify(
      artifact.summary
    ) !==
    JSON.stringify(
      expectedSummary(
        artifact.operations
      )
    )
  ) {
    throw new Error(
      "autonomous_repair_execution_transaction_plan_summary_mismatch"
    );
  }

  exactKeys(
    artifact.safety,
    Object.keys(
      SAFETY
    ),
    "autonomous_repair_execution_transaction_plan_safety"
  );

  if (
    JSON.stringify(
      artifact.safety
    ) !==
    JSON.stringify(
      SAFETY
    )
  ) {
    throw new Error(
      "autonomous_repair_execution_transaction_plan_safety_invalid"
    );
  }

  exactKeys(
    artifact.authority,
    Object.keys(
      AUTHORITY
    ),
    "autonomous_repair_execution_transaction_plan_authority"
  );

  if (
    JSON.stringify(
      artifact.authority
    ) !==
    JSON.stringify(
      AUTHORITY
    )
  ) {
    throw new Error(
      "autonomous_repair_execution_transaction_plan_authority_invalid"
    );
  }

  if (
    autonomousRepairExecutionTransactionPlanFingerprint(
      artifact
    ) !==
      artifact.transactionFingerprint
  ) {
    throw new Error(
      "autonomous_repair_execution_transaction_plan_fingerprint_mismatch"
    );
  }

  return {
    ok:
      true,
    operationCount:
      artifact.operations.length,
    transactionFingerprint:
      artifact.transactionFingerprint
  };
}

export function buildAutonomousRepairExecutionTransactionPlan(
  options = {}
) {
  exactKeys(
    options,
    [
      "authorization",
      "executionRequest",
      "targetVerification",
      "materialResolution",
      "generatedAt"
    ],
    "autonomous_repair_execution_transaction_plan_input"
  );

  const {
    authorization,
    executionRequest,
    targetVerification,
    materialResolution,
    generatedAt
  } =
    options;

  const binding =
    validateAutonomousRepairExecutionAuthorizationV2Binding({
      authorization,
      executionRequest,
      targetVerification,
      materialResolution
    });

  if (
    !canonicalTimestamp(
      generatedAt
    )
  ) {
    throw new Error(
      "autonomous_repair_execution_transaction_plan_generated_at_invalid"
    );
  }

  const descriptors =
    materialDescriptorMap(
      materialResolution
    );

  const verificationByTarget =
    new Map(
      targetVerification
        .operations
        .map(
          row => [
            row.targetPath,
            row
          ]
        )
    );

  const operations =
    authorization
      .operationScope
      .map(
        authorizationRow => {
          const verificationRow =
            verificationByTarget.get(
              authorizationRow.targetPath
            );

          const descriptor =
            descriptors.get(
              authorizationRow.targetPath
            );

          if (
            !verificationRow ||
            !descriptor ||
            authorizationRow.repairClass !==
              descriptor.repairClass ||
            verificationRow.operationId !==
              authorizationRow.operationId ||
            verificationRow.mutationMode !==
              authorizationRow.mutationMode ||
            verificationRow.preimageFingerprint !==
              authorizationRow.preimageFingerprint
          ) {
            throw new Error(
              "autonomous_repair_execution_transaction_plan_operation_binding_mismatch"
            );
          }

          return {
            operationId:
              authorizationRow.operationId,

            candidateDecisionId:
              descriptor.candidateDecisionId,

            repairClass:
              descriptor.repairClass,

            targetPath:
              authorizationRow.targetPath,

            mutationMode:
              authorizationRow.mutationMode,

            preimage: {
              targetExists:
                verificationRow.targetExists,

              sha256:
                verificationRow.actualSha256,

              bytes:
                verificationRow.actualBytes,

              preimageFingerprint:
                verificationRow.preimageFingerprint
            },

            postimage: {
              sourceKind:
                descriptor.sourceKind,

              materialFingerprint:
                descriptor.materialFingerprint,

              publicationBundleFingerprint:
                descriptor.publicationBundleFingerprint,

              publicationRole:
                descriptor.publicationRole,

              contentSha256:
                descriptor.contentSha256,

              contentBytes:
                descriptor.contentBytes
            },

            rollback: {
              strategy:
                authorizationRow.mutationMode ===
                  "CREATE"
                  ? "DELETE_CREATED_TARGET"
                  : "RESTORE_PREIMAGE"
            }
          };
        }
      )
      .sort(
        canonicalOperationOrder
      );

  const artifact = {
    schema:
      AUTONOMOUS_REPAIR_EXECUTION_TRANSACTION_PLAN_SCHEMA,

    version:
      AUTONOMOUS_REPAIR_EXECUTION_TRANSACTION_PLAN_VERSION,

    dayKey:
      authorization.dayKey,

    generatedAt,

    role:
      "derived_read_only_bounded_execution_transaction_plan",

    bindings: {
      authorizationId:
        authorization.authorizationId,

      nonce:
        authorization.nonce,

      authorizationFingerprint:
        authorization.authorizationFingerprint,

      requestFingerprint:
        authorization.bindings.requestFingerprint,

      planFingerprint:
        authorization.bindings.planFingerprint,

      verificationFingerprint:
        authorization.bindings.verificationFingerprint,

      materialResolutionFingerprint:
        authorization.bindings.materialResolutionFingerprint,

      replayKey:
        binding.replayKey
    },

    transactionFingerprint:
      "",

    repairClassScope:
      [...authorization.repairClassScope],

    summary:
      expectedSummary(
        operations
      ),

    operations,

    safety:
      {
        ...SAFETY
      },

    authority:
      {
        ...AUTHORITY
      }
  };

  artifact.transactionFingerprint =
    autonomousRepairExecutionTransactionPlanFingerprint(
      artifact
    );

  validateAutonomousRepairExecutionTransactionPlanArtifact(
    artifact
  );

  return artifact;
}

export function resolveAutonomousRepairExecutionTransactionPostimageBuffer({
  transactionPlan,
  operationId,
  materialResolution
} = {}) {
  validateAutonomousRepairExecutionTransactionPlanArtifact(
    transactionPlan
  );

  validateAutonomousRepairSourceBoundMaterialResolution(
    materialResolution
  );

  if (
    transactionPlan.dayKey !==
      materialResolution.dayKey ||
    transactionPlan.bindings.materialResolutionFingerprint !==
      materialResolution.resolutionFingerprint ||
    !VALID_OPERATION_ID.test(
      clean(
        operationId
      )
    )
  ) {
    throw new Error(
      "autonomous_repair_execution_transaction_postimage_binding_invalid"
    );
  }

  const operation =
    transactionPlan
      .operations
      .find(
        row =>
          row.operationId ===
            operationId
      );

  if (!operation) {
    throw new Error(
      "autonomous_repair_execution_transaction_operation_not_found"
    );
  }

  const descriptor =
    materialDescriptorMap(
      materialResolution
    ).get(
      operation.targetPath
    );

  if (
    !descriptor ||
    descriptor.candidateDecisionId !==
      operation.candidateDecisionId ||
    descriptor.repairClass !==
      operation.repairClass ||
    descriptor.sourceKind !==
      operation.postimage.sourceKind ||
    descriptor.materialFingerprint !==
      operation.postimage.materialFingerprint ||
    descriptor.publicationBundleFingerprint !==
      operation.postimage.publicationBundleFingerprint ||
    descriptor.publicationRole !==
      operation.postimage.publicationRole ||
    descriptor.contentSha256 !==
      operation.postimage.contentSha256 ||
    descriptor.contentBytes !==
      operation.postimage.contentBytes
  ) {
    throw new Error(
      "autonomous_repair_execution_transaction_postimage_source_mismatch"
    );
  }

  const buffer =
    Buffer.from(
      descriptor.buffer
    );

  if (
    sha256Buffer(
      buffer
    ) !==
      operation.postimage.contentSha256 ||
    buffer.length !==
      operation.postimage.contentBytes
  ) {
    throw new Error(
      "autonomous_repair_execution_transaction_postimage_identity_mismatch"
    );
  }

  return buffer;
}
