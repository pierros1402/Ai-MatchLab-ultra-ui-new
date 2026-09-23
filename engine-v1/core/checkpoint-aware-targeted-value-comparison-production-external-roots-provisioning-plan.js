import {
  createHash
} from "node:crypto";
import os from "node:os";
import path from "node:path";

import {
  CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_REQUIRED_METHODS
} from "./checkpoint-aware-targeted-value-comparison-production-external-state-adapter-configuration.js";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_ROOTS_PROVISIONING_PLAN_SCHEMA =
  "ai-matchlab.checkpoint-aware-value-comparison-production-external-roots-provisioning-plan.v1";

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

const HEAD_RE =
  /^[0-9a-f]{40}$/u;

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

function lexicalContained(
  parentPath,
  childPath
) {
  const relative =
    path.relative(
      path.resolve(
        parentPath
      ),
      path.resolve(
        childPath
      )
    );

  return (
    relative ===
      "" ||
    (
      relative !==
        ".." &&
      !relative.startsWith(
        `..${path.sep}`
      ) &&
      !path.isAbsolute(
        relative
      )
    )
  );
}

function validateR24Boundary(
  sourceR24,
  dayKey,
  remoteHead
) {
  if (
    !sourceR24 ||
    typeof sourceR24 !==
      "object" ||
    sourceR24.mode !==
      "READ_ONLY_PRODUCTION_EXTERNAL_STATE_REAL_ROOT_BINDING_CONTRACT" ||
    sourceR24.dayKey !==
      dayKey ||
    sourceR24.remoteHead !==
      remoteHead ||
    sourceR24.contract
      ?.state !==
        "REAL_ROOT_BINDING_SUPPORTED_NOT_PERFORMED" ||
    sourceR24.contract
      ?.implementation
      ?.persistentRealRootBindingValidatorImplemented !==
        true ||
    sourceR24.contract
      ?.implementation
      ?.validatedProductionConfigurationRequired !==
        true ||
    sourceR24.contract
      ?.implementation
      ?.symlinkRootsForbidden !==
        true ||
    sourceR24.contract
      ?.implementation
      ?.osTemporaryRootsForbiddenForProductionBinding !==
        true ||
    sourceR24.contract
      ?.implementation
      ?.driveRootBindingForbidden !==
        true ||
    sourceR24.contract
      ?.requiredNextGate
      ?.name !==
        "DEDICATED_VALUE_COMPARISON_PRODUCTION_EXTERNAL_ROOTS_PROVISIONING_PLAN_READ_ONLY" ||
    sourceR24.contract
      ?.authority
      ?.productionRootsProvisioningAuthorized !==
        false ||
    sourceR24.contract
      ?.authority
      ?.productionConfigurationBindingAuthorized !==
        false ||
    sourceR24.contract
      ?.authority
      ?.productionRealRootAdapterConstructionAuthorized !==
        false ||
    sourceR24.contract
      ?.authority
      ?.productionExternalStateWriteAuthorized !==
        false ||
    sourceR24.contract
      ?.authority
      ?.replayConsumptionAuthorized !==
        false ||
    sourceR24.contract
      ?.authority
      ?.signerUseAuthorized !==
        false ||
    sourceR24.contract
      ?.authority
      ?.privateKeyReadAuthorized !==
        false ||
    sourceR24.contract
      ?.authority
      ?.productionKernelInvocationAuthorized !==
        false ||
    sourceR24.contract
      ?.authority
      ?.repairExecutionAuthorized !==
        false ||
    sourceR24.safety
      ?.repositoryWritePerformed !==
        false ||
    sourceR24.safety
      ?.productionKernelEnabled !==
        false
  ) {
    throw new Error(
      "value_comparison_production_roots_plan_r24_boundary_invalid"
    );
  }

  if (
    !Array.isArray(
      sourceR24.contract
        ?.requiredMethodSurface
    ) ||
    sourceR24.contract
      .requiredMethodSurface
      .length !==
        CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_REQUIRED_METHODS.length ||
    sourceR24.contract
      .requiredMethodSurface
      .some(
        (
          method,
          index
        ) =>
          method !==
            CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_REQUIRED_METHODS[
              index
            ]
      )
  ) {
    throw new Error(
      "value_comparison_production_roots_plan_method_surface_invalid"
    );
  }

  return true;
}

function normalizeAbsolutePath(
  value,
  label
) {
  const input =
    clean(
      value
    );

  if (
    !input ||
    !path.isAbsolute(
      input
    )
  ) {
    throw new Error(
      `value_comparison_production_roots_plan_${label}_not_absolute`
    );
  }

  return path.resolve(
    input
  );
}

function planCore(
  artifact
) {
  return {
    schema:
      artifact.schema,

    version:
      artifact.version,

    role:
      artifact.role,

    mode:
      artifact.mode,

    dayKey:
      artifact.dayKey,

    remoteHead:
      artifact.remoteHead,

    state:
      artifact.state,

    machineRoot:
      artifact.machineRoot,

    roots:
      artifact.roots,

    externalStateLayout:
      artifact.externalStateLayout,

    persistence:
      artifact.persistence,

    permissions:
      artifact.permissions,

    requiredMethodSurface:
      artifact.requiredMethodSurface,

    blockers:
      artifact.blockers,

    requiredNextGate:
      artifact.requiredNextGate,

    authority:
      artifact.authority
  };
}

export function checkpointAwareValueComparisonProductionRootsProvisioningPlanFingerprint(
  artifact
) {
  return fingerprint(
    planCore(
      artifact
    )
  );
}

export function buildCheckpointAwareValueComparisonProductionRootsProvisioningPlan({
  dayKey,
  remoteHead,
  sourceR24,
  projectRoot,
  machineRoot
} = {}) {
  const day =
    clean(
      dayKey
    );

  const head =
    clean(
      remoteHead
    )
      .toLowerCase();

  if (
    !DAY_RE.test(
      day
    ) ||
    !HEAD_RE.test(
      head
    )
  ) {
    throw new Error(
      "value_comparison_production_roots_plan_identity_invalid"
    );
  }

  validateR24Boundary(
    sourceR24,
    day,
    head
  );

  const project =
    normalizeAbsolutePath(
      projectRoot,
      "project_root"
    );

  const machine =
    normalizeAbsolutePath(
      machineRoot,
      "machine_root"
    );

  const temp =
    path.resolve(
      os.tmpdir()
    );

  if (
    path.parse(
      machine
    ).root ===
      machine ||
    lexicalContained(
      project,
      machine
    ) ||
    lexicalContained(
      machine,
      project
    ) ||
    lexicalContained(
      temp,
      machine
    ) ||
    lexicalContained(
      machine,
      temp
    )
  ) {
    throw new Error(
      "value_comparison_production_roots_plan_machine_root_unsafe"
    );
  }

  const authorizationInbox =
    path.join(
      machine,
      "authorization-inbox"
    );

  const externalState =
    path.join(
      machine,
      "external-state"
    );

  if (
    lexicalContained(
      authorizationInbox,
      externalState
    ) ||
    lexicalContained(
      externalState,
      authorizationInbox
    )
  ) {
    throw new Error(
      "value_comparison_production_roots_plan_derived_roots_overlap"
    );
  }

  const externalStateLayout = [
    "locks",
    "journals",
    "replay",
    "audits",
    "backups"
  ]
    .map(
      name => ({
        name,
        path:
          path.join(
            externalState,
            name
          ),

        preProvisionBeforeProductionEnablement:
          true
      })
    );

  const artifact = {
    schema:
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_ROOTS_PROVISIONING_PLAN_SCHEMA,

    version:
      "1.0.0",

    role:
      "read_only_persistent_machine_local_external_roots_provisioning_plan",

    mode:
      "READ_ONLY_PRODUCTION_EXTERNAL_ROOTS_PROVISIONING_PLAN",

    dayKey:
      day,

    remoteHead:
      head,

    state:
      "EXACT_PERSISTENT_ROOTS_SELECTED_NOT_PROVISIONED",

    machineRoot:
      machine,

    roots: {
      projectRoot:
        project,

      authorizationInbox,

      externalState,

      projectRootMustRemainUnchanged:
        true,

      authorizationInboxOutsideRepositoryAndOsTemp:
        true,

      externalStateOutsideRepositoryAndOsTemp:
        true,

      authorizationInboxAndExternalStateDisjoint:
        true
    },

    externalStateLayout,

    persistence: {
      machineLocal:
        true,

      survivesProcessRestartRequired:
        true,

      survivesMachineRebootRequired:
        true,

      osTemporaryStorageForbidden:
        true,

      repositoryStorageForbidden:
        true,

      automaticFallbackToRepositoryForbidden:
        true,

      automaticFallbackToOsTempForbidden:
        true
    },

    permissions: {
      explicitAclReviewRequiredBeforeProductionEnablement:
        true,

      authorizationInboxControllerAccess:
        "READ_ONLY",

      authorizationInboxExternalIssuerAccess:
        "WRITE_BY_SEPARATE_EXTERNAL_ISSUER_POLICY",

      externalStateControllerAccess:
        "READ_WRITE_REQUIRED_ONLY_AFTER_FUTURE_ENABLEMENT",

      externalStateExternalIssuerAccess:
        "NO_ACCESS_REQUIRED",

      privateKeyMaterialStorageInEitherRootForbidden:
        true
    },

    requiredMethodSurface:
      [
        ...CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_REQUIRED_METHODS
      ],

    blockers: [
      {
        code:
          "PERSISTENT_PRODUCTION_ROOTS_NOT_PROVISIONED",

        blocking:
          true
      },
      {
        code:
          "PERSISTENT_PRODUCTION_ROOT_ACL_NOT_VERIFIED",

        blocking:
          true
      },
      {
        code:
          "PRODUCTION_CONFIGURATION_NOT_BOUND_TO_PROVISIONED_ROOTS",

        blocking:
          true
      },
      {
        code:
          "PRODUCTION_REAL_ROOT_EXTERNAL_STATE_ADAPTER_NOT_IMPLEMENTED",

        blocking:
          true
      },
      {
        code:
          "DEDICATED_PRODUCTION_KERNEL_ADAPTER_NOT_IMPLEMENTED",

        blocking:
          true
      },
      {
        code:
          "END_TO_END_PRODUCTION_ORCHESTRATOR_NOT_IMPLEMENTED",

        blocking:
          true
      }
    ],

    blockerCount:
      6,

    requiredNextGate: {
      name:
        "DEDICATED_VALUE_COMPARISON_PRODUCTION_EXTERNAL_ROOTS_PROVISIONING_EXECUTION_PRECHECK",

      mustUseExactPlannedRoots:
        true,

      mustVerifyParentLocationBeforeCreate:
        true,

      mustVerifyNoSymlinkOrReparsePointAfterCreate:
        true,

      mustVerifyAclBeforeProductionEnablement:
        true,

      mustCreateNoAuthorizationArtifact:
        true,

      mustReadNoPrivateKey:
        true,

      mustConstructNoProductionAdapter:
        true,

      mustWriteNoReplayJournalLockAuditDuringProvisioning:
        true,

      productionKernelMustRemainDisabled:
        true
    },

    authority: {
      readOnly:
        true,

      planningOnly:
        true,

      productionRootsProvisioningAuthorized:
        false,

      aclMutationAuthorized:
        false,

      productionConfigurationBindingAuthorized:
        false,

      productionRealRootAdapterConstructionAuthorized:
        false,

      productionExternalStateWriteAuthorized:
        false,

      replayConsumptionAuthorized:
        false,

      authorizationArtifactCreationAuthorized:
        false,

      signerUseAuthorized:
        false,

      privateKeyReadAuthorized:
        false,

      productionKernelInvocationAuthorized:
        false,

      filesystemRepositoryWriteAuthorized:
        false,

      repairExecutionAuthorized:
        false,

      commitAuthorized:
        false,

      pushAuthorized:
        false,

      deployAuthorized:
        false
    }
  };

  artifact.planFingerprint =
    checkpointAwareValueComparisonProductionRootsProvisioningPlanFingerprint(
      artifact
    );

  return artifact;
}
