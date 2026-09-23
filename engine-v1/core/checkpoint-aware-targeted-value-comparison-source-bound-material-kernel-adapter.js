import {
  createHash
} from "node:crypto";

import {
  simulateCheckpointAwareValueComparisonSandboxTransaction
} from "./checkpoint-aware-targeted-value-comparison-sandbox-transaction.js";

import {
  validateCheckpointAwareValueComparisonTransactionPlanArtifact
} from "./checkpoint-aware-targeted-value-comparison-replay-transaction-plan.js";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_SOURCE_BOUND_MATERIAL_SCHEMA =
  "ai-matchlab.checkpoint-aware-value-comparison-source-bound-postimage-material.v1";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_DEDICATED_KERNEL_SANDBOX_SCHEMA =
  "ai-matchlab.checkpoint-aware-value-comparison-dedicated-kernel-adapter-sandbox.v1";

const VALID_SHA =
  /^[0-9a-f]{64}$/u;

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

function sha256Buffer(value) {
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

function canonicalBase64Buffer(value) {
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
    throw new Error(
      "value_comparison_source_bound_material_base64_invalid"
    );
  }

  const buffer =
    Buffer.from(
      text,
      "base64"
    );

  if (
    buffer.length <=
      0 ||
    buffer
      .toString(
        "base64"
      ) !==
        text
  ) {
    throw new Error(
      "value_comparison_source_bound_material_base64_invalid"
    );
  }

  return buffer;
}

function normalizeSourceBinding(row) {
  const ref =
    clean(
      row?.ref
    );

  const kind =
    clean(
      row?.kind
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
    !ref ||
    ![
      "SOURCE_CODE",
      "DATA_INPUT"
    ].includes(
      kind
    ) ||
    !VALID_SHA.test(
      sha256
    ) ||
    !Number.isInteger(
      bytes
    ) ||
    bytes <
      0
  ) {
    throw new Error(
      "value_comparison_source_bound_material_source_binding_invalid"
    );
  }

  return {
    ref,
    kind,
    sha256,
    bytes
  };
}

function materialResolutionSemanticCore(
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

    remoteHead:
      artifact.remoteHead,

    transactionPlanFingerprint:
      artifact.transactionPlanFingerprint,

    producerBindings:
      artifact.producerBindings,

    producerBindingFingerprint:
      artifact.producerBindingFingerprint,

    materials:
      artifact.materials,

    authority:
      artifact.authority
  };
}

export function checkpointAwareValueComparisonSourceBoundMaterialFingerprint(
  artifact
) {
  if (
    !artifact ||
    typeof artifact !==
      "object"
  ) {
    throw new Error(
      "value_comparison_source_bound_material_artifact_required"
    );
  }

  return sha256Text(
    canonicalJson(
      materialResolutionSemanticCore(
        artifact
      )
    )
  );
}

export function validateCheckpointAwareValueComparisonSourceBoundMaterialResolution(
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
      CHECKPOINT_AWARE_VALUE_COMPARISON_SOURCE_BOUND_MATERIAL_SCHEMA ||
    artifact.version !==
      "1.0.0" ||
    artifact.role !==
      "source_bound_postimage_material_resolution" ||
    !Array.isArray(
      artifact.producerBindings
    ) ||
    artifact.producerBindings.length <
      3 ||
    !Array.isArray(
      artifact.materials
    ) ||
    artifact.materials.length <
      1 ||
    artifact.materials.length >
      2
  ) {
    throw new Error(
      "value_comparison_source_bound_material_structure_invalid"
    );
  }

  validateCheckpointAwareValueComparisonTransactionPlanArtifact(
    artifact.transactionPlan
  );

  if (
    artifact.dayKey !==
      artifact.transactionPlan.dayKey ||
    artifact.remoteHead !==
      artifact.transactionPlan.bindings.remoteHead ||
    artifact.transactionPlanFingerprint !==
      artifact.transactionPlan.transactionPlanFingerprint
  ) {
    throw new Error(
      "value_comparison_source_bound_material_transaction_binding_invalid"
    );
  }

  const producerBindings =
    artifact.producerBindings
      .map(
        normalizeSourceBinding
      );

  const sortedProducerBindings =
    [
      ...producerBindings
    ]
      .sort(
        (
          left,
          right
        ) =>
          [
            left.kind,
            left.ref,
            left.sha256,
            String(
              left.bytes
            )
          ]
            .join(
              "\u0000"
            )
            .localeCompare(
              [
                right.kind,
                right.ref,
                right.sha256,
                String(
                  right.bytes
                )
              ].join(
                "\u0000"
              )
            )
      );

  if (
    !sameJson(
      producerBindings,
      sortedProducerBindings
    )
  ) {
    throw new Error(
      "value_comparison_source_bound_material_producer_binding_order_invalid"
    );
  }

  const producerBindingFingerprint =
    sha256Text(
      canonicalJson(
        producerBindings
      )
    );

  if (
    artifact.producerBindingFingerprint !==
      producerBindingFingerprint
  ) {
    throw new Error(
      "value_comparison_source_bound_material_producer_fingerprint_invalid"
    );
  }

  const operationByPath =
    new Map(
      artifact
        .transactionPlan
        .operations
        .map(
          operation => [
            operation.targetPath,
            operation
          ]
        )
    );

  const materialTargets =
    new Set();

  for (
    const material of
      artifact.materials
  ) {
    const operation =
      operationByPath.get(
        clean(
          material?.targetPath
        )
      );

    const buffer =
      canonicalBase64Buffer(
        material?.contentBase64
      );

    if (
      !operation ||
      clean(
        material?.operationId
      ) !==
        operation.operationId ||
      materialTargets.has(
        material.targetPath
      ) ||
      clean(
        material?.contentEncoding
      ) !==
        "base64" ||
      clean(
        material?.contentSha256
      ) !==
        operation.postimage.contentSha256 ||
      Number(
        material?.contentBytes
      ) !==
        operation.postimage.contentBytes ||
      sha256Buffer(
        buffer
      ) !==
        operation.postimage.contentSha256 ||
      buffer.length !==
        operation.postimage.contentBytes ||
      clean(
        material?.producerBindingFingerprint
      ) !==
        producerBindingFingerprint
    ) {
      throw new Error(
        "value_comparison_source_bound_material_identity_invalid"
      );
    }

    materialTargets.add(
      material.targetPath
    );
  }

  if (
    materialTargets.size !==
      operationByPath.size ||
    [
      ...operationByPath.keys()
    ]
      .some(
        target =>
          !materialTargets.has(
            target
          )
      )
  ) {
    throw new Error(
      "value_comparison_source_bound_material_operation_coverage_invalid"
    );
  }

  if (
    artifact.authority
      ?.readOnly !==
        true ||
    artifact.authority
      ?.postimageMaterialResolved !==
        true ||
    artifact.authority
      ?.replayConsumptionAuthorized !==
        false ||
    artifact.authority
      ?.filesystemRepositoryWriteAuthorized !==
        false ||
    artifact.authority
      ?.productionKernelInvocationAuthorized !==
        false ||
    artifact.authority
      ?.repairExecutionAuthorized !==
        false
  ) {
    throw new Error(
      "value_comparison_source_bound_material_authority_invalid"
    );
  }

  if (
    !VALID_SHA.test(
      clean(
        artifact.materialResolutionFingerprint
      )
    ) ||
    checkpointAwareValueComparisonSourceBoundMaterialFingerprint(
      artifact
    ) !==
      artifact.materialResolutionFingerprint
  ) {
    throw new Error(
      "value_comparison_source_bound_material_fingerprint_invalid"
    );
  }

  return true;
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

export function buildCheckpointAwareValueComparisonSourceBoundMaterialResolution({
  transactionPlan,
  producerBindings,
  materials
} = {}) {
  validateCheckpointAwareValueComparisonTransactionPlanArtifact(
    transactionPlan
  );

  const normalizedProducerBindings =
    (
      Array.isArray(
        producerBindings
      )
        ? producerBindings
        : []
    )
      .map(
        normalizeSourceBinding
      )
      .sort(
        (
          left,
          right
        ) =>
          [
            left.kind,
            left.ref,
            left.sha256,
            String(
              left.bytes
            )
          ]
            .join(
              "\u0000"
            )
            .localeCompare(
              [
                right.kind,
                right.ref,
                right.sha256,
                String(
                  right.bytes
                )
              ].join(
                "\u0000"
              )
            )
      );

  if (
    normalizedProducerBindings.length <
      3
  ) {
    throw new Error(
      "value_comparison_source_bound_material_producer_bindings_required"
    );
  }

  const producerBindingFingerprint =
    sha256Text(
      canonicalJson(
        normalizedProducerBindings
      )
    );

  const operationByPath =
    new Map(
      transactionPlan.operations.map(
        operation => [
          operation.targetPath,
          operation
        ]
      )
    );

  const normalizedMaterials =
    (
      Array.isArray(
        materials
      )
        ? materials
        : []
    )
      .map(
        material => {
          const targetPath =
            clean(
              material?.targetPath
            );

          const operation =
            operationByPath.get(
              targetPath
            );

          const buffer =
            Buffer.isBuffer(
              material?.contentBuffer
            )
              ? material.contentBuffer
              : null;

          if (
            !operation ||
            !buffer ||
            buffer.length <=
              0 ||
            sha256Buffer(
              buffer
            ) !==
              operation.postimage.contentSha256 ||
            buffer.length !==
              operation.postimage.contentBytes
          ) {
            throw new Error(
              "value_comparison_source_bound_material_candidate_mismatch"
            );
          }

          return {
            operationId:
              operation.operationId,

            targetPath,

            contentEncoding:
              "base64",

            contentSha256:
              operation.postimage.contentSha256,

            contentBytes:
              operation.postimage.contentBytes,

            contentBase64:
              buffer.toString(
                "base64"
              ),

            producerBindingFingerprint
          };
        }
      )
      .sort(
        (
          left,
          right
        ) =>
          transactionPlan
            .exactTargetUniverse
            .indexOf(
              left.targetPath
            ) -
          transactionPlan
            .exactTargetUniverse
            .indexOf(
              right.targetPath
            )
      );

  if (
    normalizedMaterials.length !==
      transactionPlan.operations.length
  ) {
    throw new Error(
      "value_comparison_source_bound_material_operation_count_mismatch"
    );
  }

  const artifact = {
    schema:
      CHECKPOINT_AWARE_VALUE_COMPARISON_SOURCE_BOUND_MATERIAL_SCHEMA,

    version:
      "1.0.0",

    role:
      "source_bound_postimage_material_resolution",

    dayKey:
      transactionPlan.dayKey,

    remoteHead:
      transactionPlan.bindings.remoteHead,

    transactionPlan,

    transactionPlanFingerprint:
      transactionPlan.transactionPlanFingerprint,

    producerBindings:
      normalizedProducerBindings,

    producerBindingFingerprint,

    materials:
      normalizedMaterials,

    authority: {
      readOnly:
        true,

      postimageMaterialResolved:
        true,

      replayConsumptionAuthorized:
        false,

      filesystemRepositoryWriteAuthorized:
        false,

      productionKernelInvocationAuthorized:
        false,

      repairExecutionAuthorized:
        false,

      signerUseAuthorized:
        false
    }
  };

  artifact.materialResolutionFingerprint =
    checkpointAwareValueComparisonSourceBoundMaterialFingerprint(
      artifact
    );

  validateCheckpointAwareValueComparisonSourceBoundMaterialResolution(
    artifact
  );

  return artifact;
}

function preimageBufferMap(
  preimageBuffersByTarget
) {
  if (
    !preimageBuffersByTarget ||
    typeof preimageBuffersByTarget !==
      "object" ||
    Array.isArray(
      preimageBuffersByTarget
    )
  ) {
    throw new Error(
      "value_comparison_dedicated_kernel_sandbox_preimage_map_required"
    );
  }

  return new Map(
    Object.entries(
      preimageBuffersByTarget
    )
  );
}

export function simulateCheckpointAwareValueComparisonDedicatedKernelAdapterSandbox({
  transactionPlan,
  materialResolution,
  preimageBuffersByTarget,
  sandboxRoot,
  injectFailureAfterOperation =
    null
} = {}) {
  validateCheckpointAwareValueComparisonTransactionPlanArtifact(
    transactionPlan
  );

  validateCheckpointAwareValueComparisonSourceBoundMaterialResolution(
    materialResolution
  );

  if (
    materialResolution.transactionPlanFingerprint !==
      transactionPlan.transactionPlanFingerprint
  ) {
    throw new Error(
      "value_comparison_dedicated_kernel_sandbox_plan_material_mismatch"
    );
  }

  const preimages =
    preimageBufferMap(
      preimageBuffersByTarget
    );

  const operationByPath =
    new Map(
      transactionPlan.operations.map(
        operation => [
          operation.targetPath,
          operation
        ]
      )
    );

  const materialByPath =
    new Map(
      materialResolution.materials.map(
        material => [
          material.targetPath,
          material
        ]
      )
    );

  const targets =
    transactionPlan.exactTargetUniverse.map(
      targetPath => {
        const preimageBuffer =
          preimages.get(
            targetPath
          );

        if (
          !Buffer.isBuffer(
            preimageBuffer
          ) ||
          preimageBuffer.length <=
            0
        ) {
          throw new Error(
            "value_comparison_dedicated_kernel_sandbox_preimage_buffer_missing"
          );
        }

        const operation =
          operationByPath.get(
            targetPath
          );

        if (!operation) {
          return {
            targetPath,

            proposedMutation:
              false,

            preimageBuffer,

            postimageBuffer:
              preimageBuffer,

            expectedPreimageSha256:
              sha256Buffer(
                preimageBuffer
              ),

            expectedPostimageSha256:
              sha256Buffer(
                preimageBuffer
              )
          };
        }

        if (
          sha256Buffer(
            preimageBuffer
          ) !==
            operation.preimage.sha256 ||
          preimageBuffer.length !==
            operation.preimage.bytes
        ) {
          throw new Error(
            "value_comparison_dedicated_kernel_sandbox_preimage_identity_mismatch"
          );
        }

        const material =
          materialByPath.get(
            targetPath
          );

        const postimageBuffer =
          canonicalBase64Buffer(
            material?.contentBase64
          );

        return {
          targetPath,

          proposedMutation:
            true,

          preimageBuffer,

          postimageBuffer,

          expectedPreimageSha256:
            operation.preimage.sha256,

          expectedPostimageSha256:
            operation.postimage.contentSha256
        };
      }
    );

  const simulation =
    simulateCheckpointAwareValueComparisonSandboxTransaction({
      dayKey:
        transactionPlan.dayKey,

      sandboxRoot,

      targets,

      injectFailureAfterOperation
    });

  if (
    ![
      "SIMULATED_AND_ROLLED_BACK",
      "INJECTED_FAILURE_ROLLED_BACK"
    ].includes(
      simulation.simulationState
    ) ||
    simulation.rollbackVerified !==
      true
  ) {
    throw new Error(
      "value_comparison_dedicated_kernel_sandbox_rollback_not_verified"
    );
  }

  return {
    schema:
      CHECKPOINT_AWARE_VALUE_COMPARISON_DEDICATED_KERNEL_SANDBOX_SCHEMA,

    version:
      "1.0.0",

    mode:
      "DEDICATED_KERNEL_ADAPTER_SANDBOX_ONLY",

    dayKey:
      transactionPlan.dayKey,

    transactionPlanFingerprint:
      transactionPlan.transactionPlanFingerprint,

    materialResolutionFingerprint:
      materialResolution.materialResolutionFingerprint,

    simulationState:
      simulation.simulationState,

    simulation,

    authority: {
      sandboxOnly:
        true,

      productionRepositoryTarget:
        false,

      replayConsumptionAuthorized:
        false,

      productionKernelInvocationAuthorized:
        false,

      repairExecutionAuthorized:
        false,

      filesystemRepositoryWriteAuthorized:
        false,

      signerUseAuthorized:
        false
    }
  };
}
