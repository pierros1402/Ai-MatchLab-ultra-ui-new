import {
  createHash
} from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  validateCheckpointAwareValueComparisonProductionConfiguration
} from "./checkpoint-aware-targeted-value-comparison-external-authorization-ingress-production-configuration.js";

import {
  CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_REQUIRED_METHODS
} from "./checkpoint-aware-targeted-value-comparison-production-external-state-adapter-configuration.js";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_REAL_ROOT_BINDING_SCHEMA =
  "ai-matchlab.checkpoint-aware-value-comparison-production-external-state-real-root-binding.v1";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_REAL_ROOT_BINDING_MODE =
  Object.freeze({
    PERSISTENT_PRODUCTION:
      "PERSISTENT_PRODUCTION",

    ISOLATED_CONTRACT_TEST:
      "ISOLATED_CONTRACT_TEST"
  });

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

function isContained(
  parentPath,
  childPath
) {
  const relative =
    path.relative(
      parentPath,
      childPath
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

function validateR23Boundary(
  sourceR23,
  dayKey,
  remoteHead
) {
  if (
    !sourceR23 ||
    typeof sourceR23 !==
      "object" ||
    sourceR23.mode !==
      "DISABLED_PRODUCTION_EXTERNAL_STATE_ADAPTER_IMPLEMENTATION_SANDBOX" ||
    sourceR23.dayKey !==
      dayKey ||
    sourceR23.remoteHead !==
      remoteHead ||
    sourceR23.contract
      ?.state !==
        "ISOLATED_SANDBOX_IMPLEMENTATION_AVAILABLE_PRODUCTION_ROOT_DISABLED" ||
    sourceR23.contract
      ?.implementation
      ?.dedicatedExternalStateAdapterImplementationSandboxImplemented !==
        true ||
    sourceR23.contract
      ?.implementation
      ?.delegatesToR19VerifiedExternalStatePrimitive !==
        true ||
    sourceR23.contract
      ?.implementation
      ?.exactThirteenMethodSurfaceImplemented !==
        true ||
    sourceR23.contract
      ?.implementation
      ?.productionRealRootBindingImplemented !==
        false ||
    sourceR23.contract
      ?.implementation
      ?.productionRealRootEnabled !==
        false ||
    sourceR23.contract
      ?.requiredNextGate
      ?.name !==
        "DEDICATED_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_REAL_ROOT_BINDING_CONTRACT_READ_ONLY" ||
    sourceR23.contract
      ?.authority
      ?.productionConfigurationBindingAuthorized !==
        false ||
    sourceR23.contract
      ?.authority
      ?.productionExternalStateRealRootConstructionAuthorized !==
        false ||
    sourceR23.contract
      ?.authority
      ?.productionExternalStateWriteAuthorized !==
        false ||
    sourceR23.contract
      ?.authority
      ?.replayConsumptionAuthorized !==
        false ||
    sourceR23.contract
      ?.authority
      ?.signerUseAuthorized !==
        false ||
    sourceR23.contract
      ?.authority
      ?.privateKeyReadAuthorized !==
        false ||
    sourceR23.contract
      ?.authority
      ?.productionKernelInvocationAuthorized !==
        false ||
    sourceR23.contract
      ?.authority
      ?.repairExecutionAuthorized !==
        false ||
    sourceR23.safety
      ?.repositoryWritePerformed !==
        false ||
    sourceR23.safety
      ?.productionKernelEnabled !==
        false
  ) {
    throw new Error(
      "value_comparison_production_real_root_binding_r23_boundary_invalid"
    );
  }

  const actualMethods =
    sourceR23.contract
      ?.requiredMethodSurface;

  if (
    !Array.isArray(
      actualMethods
    ) ||
    actualMethods.length !==
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_REQUIRED_METHODS.length ||
    actualMethods.some(
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
      "value_comparison_production_real_root_binding_method_surface_invalid"
    );
  }

  return true;
}

function validateCanonicalDirectory(
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
    ) ||
    !fs.existsSync(
      input
    )
  ) {
    throw new Error(
      `value_comparison_production_real_root_binding_${label}_missing`
    );
  }

  const lstat =
    fs.lstatSync(
      input
    );

  if (
    lstat.isSymbolicLink() ||
    !lstat.isDirectory()
  ) {
    throw new Error(
      `value_comparison_production_real_root_binding_${label}_type_invalid`
    );
  }

  return fs.realpathSync(
    input
  );
}

function bindingCore(
  artifact
) {
  return {
    schema:
      artifact.schema,

    version:
      artifact.version,

    role:
      artifact.role,

    bindingMode:
      artifact.bindingMode,

    projectRoot:
      artifact.projectRoot,

    authorizationIngressRoot:
      artifact.authorizationIngressRoot,

    externalStateRoot:
      artifact.externalStateRoot,

    productionConfigurationFingerprint:
      artifact.productionConfigurationFingerprint,

    persistentRootRequired:
      artifact.persistentRootRequired,

    rootsDisjoint:
      artifact.rootsDisjoint,

    externalStateRootOutsideRepository:
      artifact.externalStateRootOutsideRepository,

    externalStateRootOutsideOsTemp:
      artifact.externalStateRootOutsideOsTemp,

    adapterConstructionPerformed:
      artifact.adapterConstructionPerformed,

    externalStateWritePerformed:
      artifact.externalStateWritePerformed,

    replayConsumptionPerformed:
      artifact.replayConsumptionPerformed,

    authority:
      artifact.authority
  };
}

export function checkpointAwareValueComparisonProductionRealRootBindingFingerprint(
  artifact
) {
  return fingerprint(
    bindingCore(
      artifact
    )
  );
}

export function validateCheckpointAwareValueComparisonProductionRealRootBinding({
  productionConfiguration,
  expectedProjectRoot,
  bindingMode =
    CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_REAL_ROOT_BINDING_MODE
      .PERSISTENT_PRODUCTION
} = {}) {
  validateCheckpointAwareValueComparisonProductionConfiguration(
    productionConfiguration
  );

  if (
    !Object.values(
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_REAL_ROOT_BINDING_MODE
    ).includes(
      bindingMode
    )
  ) {
    throw new Error(
      "value_comparison_production_real_root_binding_mode_invalid"
    );
  }

  const expectedProjectReal =
    validateCanonicalDirectory(
      expectedProjectRoot,
      "expected_project_root"
    );

  const projectReal =
    validateCanonicalDirectory(
      productionConfiguration
        .projectRootBinding
        .projectRoot,
      "configuration_project_root"
    );

  const ingressReal =
    validateCanonicalDirectory(
      productionConfiguration
        .authorizationIngress
        .root,
      "authorization_ingress_root"
    );

  const externalStateReal =
    validateCanonicalDirectory(
      productionConfiguration
        .externalState
        .root,
      "external_state_root"
    );

  if (
    expectedProjectReal !==
      projectReal
  ) {
    throw new Error(
      "value_comparison_production_real_root_binding_project_root_mismatch"
    );
  }

  if (
    isContained(
      projectReal,
      ingressReal
    ) ||
    isContained(
      ingressReal,
      projectReal
    ) ||
    isContained(
      projectReal,
      externalStateReal
    ) ||
    isContained(
      externalStateReal,
      projectReal
    ) ||
    isContained(
      ingressReal,
      externalStateReal
    ) ||
    isContained(
      externalStateReal,
      ingressReal
    )
  ) {
    throw new Error(
      "value_comparison_production_real_root_binding_roots_not_disjoint"
    );
  }

  if (
    path.parse(
      ingressReal
    ).root ===
      ingressReal ||
    path.parse(
      externalStateReal
    ).root ===
      externalStateReal
  ) {
    throw new Error(
      "value_comparison_production_real_root_binding_drive_root_forbidden"
    );
  }

  const tempReal =
    fs.realpathSync(
      os.tmpdir()
    );

  const externalStateOutsideTemp =
    !isContained(
      tempReal,
      externalStateReal
    );

  const ingressOutsideTemp =
    !isContained(
      tempReal,
      ingressReal
    );

  if (
    bindingMode ===
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_REAL_ROOT_BINDING_MODE
        .PERSISTENT_PRODUCTION &&
    (
      !externalStateOutsideTemp ||
      !ingressOutsideTemp
    )
  ) {
    throw new Error(
      "value_comparison_production_real_root_binding_persistent_root_under_os_temp"
    );
  }

  const artifact = {
    schema:
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_REAL_ROOT_BINDING_SCHEMA,

    version:
      "1.0.0",

    role:
      bindingMode ===
        CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_REAL_ROOT_BINDING_MODE
          .PERSISTENT_PRODUCTION
        ? "read_only_persistent_production_external_state_real_root_binding"
        : "isolated_contract_test_external_state_binding",

    bindingMode,

    projectRoot:
      projectReal,

    authorizationIngressRoot:
      ingressReal,

    externalStateRoot:
      externalStateReal,

    productionConfigurationFingerprint:
      productionConfiguration
        .configurationFingerprint,

    persistentRootRequired:
      bindingMode ===
        CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_REAL_ROOT_BINDING_MODE
          .PERSISTENT_PRODUCTION,

    rootsDisjoint:
      true,

    externalStateRootOutsideRepository:
      true,

    externalStateRootOutsideOsTemp:
      externalStateOutsideTemp,

    authorizationIngressRootOutsideOsTemp:
      ingressOutsideTemp,

    adapterConstructionPerformed:
      false,

    externalStateWritePerformed:
      false,

    replayConsumptionPerformed:
      false,

    authority: {
      readOnly:
        true,

      productionConfigurationAcceptedAsEvidenceOnly:
        true,

      productionRealRootAdapterConstructionAuthorized:
        false,

      productionExternalStateWriteAuthorized:
        false,

      replayConsumptionAuthorized:
        false,

      productionKernelInvocationAuthorized:
        false,

      repairExecutionAuthorized:
        false,

      signerUseAuthorized:
        false,

      privateKeyReadAuthorized:
        false
    }
  };

  artifact.bindingFingerprint =
    checkpointAwareValueComparisonProductionRealRootBindingFingerprint(
      artifact
    );

  return artifact;
}

function contractCore(
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

    implementation:
      artifact.implementation,

    rootRequirements:
      artifact.rootRequirements,

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

export function checkpointAwareValueComparisonProductionRealRootBindingContractFingerprint(
  artifact
) {
  return fingerprint(
    contractCore(
      artifact
    )
  );
}

export function buildCheckpointAwareValueComparisonProductionRealRootBindingContract({
  dayKey,
  remoteHead,
  sourceR23
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
      "value_comparison_production_real_root_binding_identity_invalid"
    );
  }

  validateR23Boundary(
    sourceR23,
    day,
    head
  );

  const artifact = {
    schema:
      "ai-matchlab.checkpoint-aware-value-comparison-production-real-root-binding-contract.v1",

    version:
      "1.0.0",

    role:
      "read_only_production_external_state_real_root_binding_contract",

    mode:
      "READ_ONLY_PRODUCTION_EXTERNAL_STATE_REAL_ROOT_BINDING_CONTRACT",

    dayKey:
      day,

    remoteHead:
      head,

    state:
      "REAL_ROOT_BINDING_SUPPORTED_NOT_PERFORMED",

    implementation: {
      persistentRealRootBindingValidatorImplemented:
        true,

      validatedProductionConfigurationRequired:
        true,

      expectedProcessProjectRootMustMatchConfiguration:
        true,

      symlinkRootsForbidden:
        true,

      osTemporaryRootsForbiddenForProductionBinding:
        true,

      driveRootBindingForbidden:
        true,

      rootOverlapForbidden:
        true,

      adapterConstructionPerformedByBindingValidator:
        false,

      externalStateWritePerformedByBindingValidator:
        false,

      replayConsumptionPerformedByBindingValidator:
        false,

      productionKernelAdapterImplemented:
        false,

      endToEndProductionOrchestratorImplemented:
        false
    },

    rootRequirements: {
      projectRootBinding:
        "PROCESS_PROJECT_ROOT_EXACT_MATCH",

      authorizationIngressRoot:
        "PREEXISTING_PERSISTENT_DIRECTORY_OUTSIDE_REPOSITORY_AND_OS_TEMP",

      externalStateRoot:
        "PREEXISTING_PERSISTENT_DIRECTORY_OUTSIDE_REPOSITORY_AND_OS_TEMP",

      authorizationIngressAndExternalStateMustBeDisjoint:
        true,

      automaticDirectoryCreationAllowed:
        false,

      realRootAdapterConstructionAllowedDuringBinding:
        false
    },

    requiredMethodSurface:
      [
        ...CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_REQUIRED_METHODS
      ],

    blockers: [
      {
        code:
          "PERSISTENT_PRODUCTION_ROOTS_NOT_PROVISIONED_OR_BOUND",

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
      4,

    requiredNextGate: {
      name:
        "DEDICATED_VALUE_COMPARISON_PRODUCTION_EXTERNAL_ROOTS_PROVISIONING_PLAN_READ_ONLY",

      mustChoosePersistentMachineLocalRoots:
        true,

      mustKeepRootsOutsideRepositoryAndOsTemp:
        true,

      mustKeepAuthorizationInboxAndExternalStateDisjoint:
        true,

      mustNotCreateAuthorizationArtifact:
        true,

      mustNotReadPrivateKey:
        true,

      mustNotConstructProductionAdapter:
        true,

      mustNotWriteExternalProductionState:
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

  artifact.contractFingerprint =
    checkpointAwareValueComparisonProductionRealRootBindingContractFingerprint(
      artifact
    );

  return artifact;
}
