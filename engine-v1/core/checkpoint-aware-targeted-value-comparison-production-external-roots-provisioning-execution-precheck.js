import {
  createHash
} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_REQUIRED_METHODS
} from "./checkpoint-aware-targeted-value-comparison-production-external-state-adapter-configuration.js";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_ROOTS_PROVISIONING_PRECHECK_SCHEMA =
  "ai-matchlab.checkpoint-aware-value-comparison-production-external-roots-provisioning-execution-precheck.v1";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_ROOTS_PRECHECK_STATE =
  Object.freeze({
    READY:
      "READY_FOR_EXPLICIT_PROVISIONING",

    READY_ELEVATION_REQUIRED:
      "READY_FOR_EXPLICIT_PROVISIONING_IN_NEW_ELEVATED_SHELL",

    BLOCKED_PREEXISTING_TARGETS:
      "BLOCKED_PREEXISTING_PLANNED_TARGETS",

    BLOCKED_ANCESTOR_REDIRECTION:
      "BLOCKED_EXISTING_ANCESTOR_REDIRECTION",

    BLOCKED_ANCESTOR_ACCESS:
      "BLOCKED_NEAREST_EXISTING_ANCESTOR_NOT_WRITABLE"
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

function normalizeForCompare(
  value
) {
  const resolved =
    path.resolve(
      value
    );

  return process.platform ===
    "win32"
    ? resolved.toLowerCase()
    : resolved;
}

function validateR25Boundary(
  sourceR25,
  dayKey,
  remoteHead
) {
  if (
    !sourceR25 ||
    typeof sourceR25 !==
      "object" ||
    sourceR25.mode !==
      "READ_ONLY_PRODUCTION_EXTERNAL_ROOTS_PROVISIONING_PLAN" ||
    sourceR25.dayKey !==
      dayKey ||
    sourceR25.remoteHead !==
      remoteHead ||
    sourceR25.plan
      ?.state !==
        "EXACT_PERSISTENT_ROOTS_SELECTED_NOT_PROVISIONED" ||
    sourceR25.plan
      ?.requiredNextGate
      ?.name !==
        "DEDICATED_VALUE_COMPARISON_PRODUCTION_EXTERNAL_ROOTS_PROVISIONING_EXECUTION_PRECHECK" ||
    sourceR25.plan
      ?.authority
      ?.productionRootsProvisioningAuthorized !==
        false ||
    sourceR25.plan
      ?.authority
      ?.aclMutationAuthorized !==
        false ||
    sourceR25.plan
      ?.authority
      ?.productionConfigurationBindingAuthorized !==
        false ||
    sourceR25.plan
      ?.authority
      ?.productionRealRootAdapterConstructionAuthorized !==
        false ||
    sourceR25.plan
      ?.authority
      ?.productionExternalStateWriteAuthorized !==
        false ||
    sourceR25.plan
      ?.authority
      ?.replayConsumptionAuthorized !==
        false ||
    sourceR25.plan
      ?.authority
      ?.signerUseAuthorized !==
        false ||
    sourceR25.plan
      ?.authority
      ?.privateKeyReadAuthorized !==
        false ||
    sourceR25.plan
      ?.authority
      ?.productionKernelInvocationAuthorized !==
        false ||
    sourceR25.plan
      ?.authority
      ?.repairExecutionAuthorized !==
        false ||
    sourceR25.safety
      ?.repositoryWritePerformed !==
        false ||
    sourceR25.safety
      ?.productionRootsCreated !==
        false ||
    sourceR25.safety
      ?.aclMutationPerformed !==
        false ||
    sourceR25.safety
      ?.productionKernelEnabled !==
        false
  ) {
    throw new Error(
      "value_comparison_production_roots_precheck_r25_boundary_invalid"
    );
  }

  if (
    !Array.isArray(
      sourceR25.plan
        ?.requiredMethodSurface
    ) ||
    sourceR25.plan
      .requiredMethodSurface
      .length !==
        CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_REQUIRED_METHODS.length ||
    sourceR25.plan
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
      "value_comparison_production_roots_precheck_method_surface_invalid"
    );
  }

  return true;
}

function expectedTargets(
  sourceR25
) {
  return [
    sourceR25.plan.machineRoot,
    sourceR25.plan.roots.authorizationInbox,
    sourceR25.plan.roots.externalState,
    ...sourceR25.plan.externalStateLayout.map(
      row =>
        row.path
    )
  ]
    .map(
      value =>
        path.resolve(
          value
        )
    );
}

function pathPrefixes(
  target
) {
  const resolved =
    path.resolve(
      target
    );

  const parsed =
    path.parse(
      resolved
    );

  const relative =
    resolved.slice(
      parsed.root.length
    );

  const segments =
    relative
      .split(
        path.sep
      )
      .filter(
        Boolean
      );

  const prefixes = [
    parsed.root
  ];

  let current =
    parsed.root;

  for (
    const segment of
      segments
  ) {
    current =
      path.join(
        current,
        segment
      );

    prefixes.push(
      current
    );
  }

  return prefixes;
}

export function observeCheckpointAwareValueComparisonProductionRootsReadOnly({
  machineRoot,
  plannedTargets
} = {}) {
  const root =
    path.resolve(
      clean(
        machineRoot
      )
    );

  const targets =
    (
      plannedTargets ||
      []
    )
      .map(
        value =>
          path.resolve(
            value
          )
      );

  if (
    !path.isAbsolute(
      root
    ) ||
    targets.length <
      3
  ) {
    throw new Error(
      "value_comparison_production_roots_precheck_observation_input_invalid"
    );
  }

  const existingPlannedTargets =
    targets
      .filter(
        target =>
          fs.existsSync(
            target
          )
      );

  const prefixes =
    pathPrefixes(
      root
    );

  const existingAncestors = [];

  for (
    const prefix of
      prefixes
  ) {
    if (
      !fs.existsSync(
        prefix
      )
    ) {
      break;
    }

    const stat =
      fs.lstatSync(
        prefix
      );

    let realPath =
      prefix;

    try {
      realPath =
        fs.realpathSync(
          prefix
        );
    }
    catch {
      realPath =
        prefix;
    }

    existingAncestors.push({
      path:
        path.resolve(
          prefix
        ),

      isDirectory:
        stat.isDirectory(),

      isSymbolicLink:
        stat.isSymbolicLink(),

      realPath:
        path.resolve(
          realPath
        ),

      redirected:
        stat.isSymbolicLink() ||
        normalizeForCompare(
          prefix
        ) !==
          normalizeForCompare(
            realPath
          )
    });
  }

  if (
    existingAncestors.length ===
      0
  ) {
    throw new Error(
      "value_comparison_production_roots_precheck_no_existing_ancestor"
    );
  }

  const nearestExistingAncestor =
    existingAncestors[
      existingAncestors.length -
      1
    ];

  let nearestExistingAncestorWritable =
    false;

  try {
    fs.accessSync(
      nearestExistingAncestor.path,
      fs.constants.W_OK
    );

    nearestExistingAncestorWritable =
      true;
  }
  catch {
    nearestExistingAncestorWritable =
      false;
  }

  return {
    machineRoot:
      root,

    plannedTargets:
      targets,

    existingPlannedTargets,

    existingAncestors,

    nearestExistingAncestor:
      nearestExistingAncestor.path,

    nearestExistingAncestorWritable,

    anyAncestorRedirected:
      existingAncestors.some(
        row =>
          row.redirected ||
          row.isSymbolicLink ||
          !row.isDirectory
      )
  };
}

function precheckCore(
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

    planFingerprint:
      artifact.planFingerprint,

    machineRoot:
      artifact.machineRoot,

    authorizationInbox:
      artifact.authorizationInbox,

    externalStateRoot:
      artifact.externalStateRoot,

    plannedTargetCount:
      artifact.plannedTargetCount,

    filesystemObservation:
      artifact.filesystemObservation,

    privilegeObservation:
      artifact.privilegeObservation,

    provisioningRequirements:
      artifact.provisioningRequirements,

    blockers:
      artifact.blockers,

    requiredNextGate:
      artifact.requiredNextGate,

    authority:
      artifact.authority
  };
}

export function checkpointAwareValueComparisonProductionRootsPrecheckFingerprint(
  artifact
) {
  return fingerprint(
    precheckCore(
      artifact
    )
  );
}

export function buildCheckpointAwareValueComparisonProductionRootsProvisioningExecutionPrecheck({
  dayKey,
  remoteHead,
  sourceR25,
  filesystemObservation,
  processElevated =
    false
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
      "value_comparison_production_roots_precheck_identity_invalid"
    );
  }

  validateR25Boundary(
    sourceR25,
    day,
    head
  );

  const targets =
    expectedTargets(
      sourceR25
    );

  if (
    !filesystemObservation ||
    typeof filesystemObservation !==
      "object" ||
    path.resolve(
      filesystemObservation.machineRoot
    ) !==
      path.resolve(
        sourceR25.plan.machineRoot
      ) ||
    !Array.isArray(
      filesystemObservation.plannedTargets
    ) ||
    filesystemObservation.plannedTargets.length !==
      targets.length ||
    filesystemObservation.plannedTargets.some(
      (
        target,
        index
      ) =>
        path.resolve(
          target
        ) !==
          targets[
            index
          ]
    )
  ) {
    throw new Error(
      "value_comparison_production_roots_precheck_observation_binding_invalid"
    );
  }

  const existingTargets =
    Array.isArray(
      filesystemObservation
        .existingPlannedTargets
    )
      ? filesystemObservation
          .existingPlannedTargets
      : [];

  let state =
    CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_ROOTS_PRECHECK_STATE
      .READY;

  const blockers = [];

  if (
    existingTargets.length >
      0
  ) {
    state =
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_ROOTS_PRECHECK_STATE
        .BLOCKED_PREEXISTING_TARGETS;

    blockers.push(
      "PREEXISTING_PLANNED_TARGET_PATHS_REQUIRE_REVIEW"
    );
  }
  else if (
    filesystemObservation
      .anyAncestorRedirected ===
        true
  ) {
    state =
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_ROOTS_PRECHECK_STATE
        .BLOCKED_ANCESTOR_REDIRECTION;

    blockers.push(
      "EXISTING_ANCESTOR_REDIRECTION_DETECTED"
    );
  }
  else if (
    processElevated ===
      true &&
    filesystemObservation
      .nearestExistingAncestorWritable !==
        true
  ) {
    state =
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_ROOTS_PRECHECK_STATE
        .BLOCKED_ANCESTOR_ACCESS;

    blockers.push(
      "NEAREST_EXISTING_ANCESTOR_NOT_WRITABLE"
    );
  }
  else if (
    process.platform ===
      "win32" &&
    processElevated !==
      true
  ) {
    state =
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_ROOTS_PRECHECK_STATE
        .READY_ELEVATION_REQUIRED;
  }

  const ready =
    [
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_ROOTS_PRECHECK_STATE
        .READY,
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_ROOTS_PRECHECK_STATE
        .READY_ELEVATION_REQUIRED
    ]
      .includes(
        state
      );

  const artifact = {
    schema:
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_ROOTS_PROVISIONING_PRECHECK_SCHEMA,

    version:
      "1.0.0",

    role:
      "read_only_production_external_roots_provisioning_execution_precheck",

    mode:
      "READ_ONLY_PRODUCTION_EXTERNAL_ROOTS_PROVISIONING_EXECUTION_PRECHECK",

    dayKey:
      day,

    remoteHead:
      head,

    state,

    readyForNextGate:
      ready,

    planFingerprint:
      sourceR25.plan
        .planFingerprint,

    machineRoot:
      path.resolve(
        sourceR25.plan.machineRoot
      ),

    authorizationInbox:
      path.resolve(
        sourceR25.plan.roots
          .authorizationInbox
      ),

    externalStateRoot:
      path.resolve(
        sourceR25.plan.roots
          .externalState
      ),

    plannedTargetCount:
      targets.length,

    filesystemObservation: {
      existingPlannedTargetCount:
        existingTargets.length,

      existingPlannedTargets:
        [
          ...existingTargets
        ],

      nearestExistingAncestor:
        filesystemObservation
          .nearestExistingAncestor,

      nearestExistingAncestorWritable:
        filesystemObservation
          .nearestExistingAncestorWritable ===
            true,

      anyAncestorRedirected:
        filesystemObservation
          .anyAncestorRedirected ===
            true
    },

    privilegeObservation: {
      processElevated:
        processElevated ===
          true,

      elevatedShellRequiredForProvisioningAndAclHardening:
        process.platform ===
          "win32",

      newElevatedShellRequired:
        process.platform ===
          "win32" &&
        processElevated !==
          true
    },

    provisioningRequirements: {
      exactPlannedRootsOnly:
        true,

      createMachineRootAuthorizationInboxExternalStateAndFiveChildren:
        true,

      createNoOtherRuntimeDirectories:
        true,

      postCreateReparsePointVerificationRequired:
        true,

      postCreateAclVerificationRequired:
        true,

      baselineAclMustNotGrantProductionExecutionAuthority:
        true,

      privateKeyMaterialMustNotBeCreatedCopiedOrRead:
        true,

      authorizationArtifactMustNotBeCreated:
        true,

      replayJournalLockAuditFilesMustNotBeCreatedDuringProvisioning:
        true,

      productionConfigurationMustRemainUnboundDuringProvisioning:
        true,

      productionAdapterMustRemainUnconstructedDuringProvisioning:
        true,

      productionKernelMustRemainDisabled:
        true
    },

    blockers:
      blockers.map(
        code => ({
          code,
          blocking:
            true
        })
      ),

    blockerCount:
      blockers.length,

    requiredNextGate: {
      name:
        ready
        ? "DEDICATED_VALUE_COMPARISON_PRODUCTION_EXTERNAL_ROOTS_PROVISIONING_EXECUTION"
        : "DEDICATED_VALUE_COMPARISON_PRODUCTION_EXTERNAL_ROOTS_PRECHECK_BLOCKER_RESOLUTION",

      mustRunInElevatedShellOnWindows:
        process.platform ===
          "win32",

      mustProvisionExactPlannedPathsOnly:
        true,

      mustVerifyNoReparsePointAfterCreation:
        true,

      mustApplyAndVerifyBaselineAcl:
        true,

      mustCreateNoAuthorizationArtifact:
        true,

      mustReadNoPrivateKey:
        true,

      mustConsumeNoReplay:
        true,

      mustConstructNoProductionAdapter:
        true,

      productionKernelMustRemainDisabled:
        true
    },

    authority: {
      readOnly:
        true,

      precheckOnly:
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

  artifact.precheckFingerprint =
    checkpointAwareValueComparisonProductionRootsPrecheckFingerprint(
      artifact
    );

  return artifact;
}
