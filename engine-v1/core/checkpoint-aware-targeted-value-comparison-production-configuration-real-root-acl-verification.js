import {
  createHash
} from "node:crypto";
import path from "node:path";

import {
  checkpointAwareValueComparisonProductionConfigurationFingerprint,
  validateCheckpointAwareValueComparisonProductionConfiguration
} from "./checkpoint-aware-targeted-value-comparison-external-authorization-ingress-production-configuration.js";

import {
  CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_REAL_ROOT_BINDING_MODE,
  checkpointAwareValueComparisonProductionRealRootBindingFingerprint
} from "./checkpoint-aware-targeted-value-comparison-production-external-state-real-root-binding.js";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_CONFIGURATION_REAL_ROOT_ACL_VERIFICATION_SCHEMA =
  "ai-matchlab.checkpoint-aware-value-comparison-production-configuration-real-root-acl-verification.v1";

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

const HEAD_RE =
  /^[0-9a-f]{40}$/u;

const SHA_RE =
  /^[0-9a-f]{64}$/u;

const WINDOWS_SYSTEM_SID =
  "S-1-5-18";

const WINDOWS_ADMINISTRATORS_SID =
  "S-1-5-32-544";

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

function normalizedPath(value) {
  const resolved =
    path.resolve(
      clean(
        value
      )
    );

  return process.platform ===
    "win32"
    ? resolved.toLowerCase()
    : resolved;
}

function expectedProvisionedDirectories(
  productionConfiguration
) {
  const authorizationInbox =
    path.resolve(
      productionConfiguration
        .authorizationIngress
        .root
    );

  const externalState =
    path.resolve(
      productionConfiguration
        .externalState
        .root
    );

  const machineRootA =
    path.dirname(
      authorizationInbox
    );

  const machineRootB =
    path.dirname(
      externalState
    );

  if (
    normalizedPath(
      machineRootA
    ) !==
      normalizedPath(
        machineRootB
      ) ||
    path.basename(
      authorizationInbox
    )
      .toLowerCase() !==
        "authorization-inbox" ||
    path.basename(
      externalState
    )
      .toLowerCase() !==
        "external-state"
  ) {
    throw new Error(
      "value_comparison_real_root_acl_machine_root_layout_invalid"
    );
  }

  return [
    machineRootA,
    authorizationInbox,
    externalState,
    path.join(
      externalState,
      "locks"
    ),
    path.join(
      externalState,
      "journals"
    ),
    path.join(
      externalState,
      "replay"
    ),
    path.join(
      externalState,
      "audits"
    ),
    path.join(
      externalState,
      "backups"
    )
  ];
}

function validateBinding(
  productionConfiguration,
  realRootBinding
) {
  if (
    !realRootBinding ||
    typeof realRootBinding !==
      "object" ||
    realRootBinding.bindingMode !==
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_REAL_ROOT_BINDING_MODE
        .PERSISTENT_PRODUCTION ||
    realRootBinding.role !==
      "read_only_persistent_production_external_state_real_root_binding" ||
    realRootBinding.productionConfigurationFingerprint !==
      productionConfiguration.configurationFingerprint ||
    normalizedPath(
      realRootBinding.projectRoot
    ) !==
      normalizedPath(
        productionConfiguration
          .projectRootBinding
          .projectRoot
      ) ||
    normalizedPath(
      realRootBinding.authorizationIngressRoot
    ) !==
      normalizedPath(
        productionConfiguration
          .authorizationIngress
          .root
      ) ||
    normalizedPath(
      realRootBinding.externalStateRoot
    ) !==
      normalizedPath(
        productionConfiguration
          .externalState
          .root
      ) ||
    realRootBinding.persistentRootRequired !==
      true ||
    realRootBinding.rootsDisjoint !==
      true ||
    realRootBinding.externalStateRootOutsideRepository !==
      true ||
    realRootBinding.externalStateRootOutsideOsTemp !==
      true ||
    realRootBinding.authorizationIngressRootOutsideOsTemp !==
      true ||
    realRootBinding.adapterConstructionPerformed !==
      false ||
    realRootBinding.externalStateWritePerformed !==
      false ||
    realRootBinding.replayConsumptionPerformed !==
      false ||
    realRootBinding.authority
      ?.productionRealRootAdapterConstructionAuthorized !==
        false ||
    realRootBinding.authority
      ?.productionExternalStateWriteAuthorized !==
        false ||
    realRootBinding.authority
      ?.replayConsumptionAuthorized !==
        false ||
    realRootBinding.authority
      ?.productionKernelInvocationAuthorized !==
        false ||
    realRootBinding.authority
      ?.repairExecutionAuthorized !==
        false ||
    realRootBinding.authority
      ?.signerUseAuthorized !==
        false ||
    realRootBinding.authority
      ?.privateKeyReadAuthorized !==
        false
  ) {
    throw new Error(
      "value_comparison_real_root_acl_binding_invalid"
    );
  }

  if (
    !SHA_RE.test(
      clean(
        realRootBinding.bindingFingerprint
      )
    ) ||
    checkpointAwareValueComparisonProductionRealRootBindingFingerprint(
      realRootBinding
    ) !==
      realRootBinding.bindingFingerprint
  ) {
    throw new Error(
      "value_comparison_real_root_acl_binding_fingerprint_invalid"
    );
  }

  return true;
}

function validateAclEvidence(
  productionConfiguration,
  aclEvidence
) {
  if (
    !aclEvidence ||
    typeof aclEvidence !==
      "object" ||
    aclEvidence.model !==
      "WINDOWS_DACL_BASELINE_V1" ||
    !clean(
      aclEvidence.controllerSid
    ) ||
    aclEvidence.ownerSid !==
      WINDOWS_ADMINISTRATORS_SID ||
    aclEvidence.systemSid !==
      WINDOWS_SYSTEM_SID ||
    aclEvidence.administratorsSid !==
      WINDOWS_ADMINISTRATORS_SID ||
    aclEvidence.fileCount !==
      0 ||
    aclEvidence.directoryCount !==
      8 ||
    !Array.isArray(
      aclEvidence.directories
    ) ||
    aclEvidence.directories.length !==
      8
  ) {
    throw new Error(
      "value_comparison_real_root_acl_evidence_shape_invalid"
    );
  }

  const expected =
    expectedProvisionedDirectories(
      productionConfiguration
    );

  const expectedNormalized =
    expected.map(
      normalizedPath
    );

  const actualNormalized =
    aclEvidence.directories.map(
      row =>
        normalizedPath(
          row.path
        )
    );

  if (
    new Set(
      actualNormalized
    ).size !==
      8 ||
    expectedNormalized.some(
      value =>
        !actualNormalized.includes(
          value
        )
    ) ||
    actualNormalized.some(
      value =>
        !expectedNormalized.includes(
          value
        )
    )
  ) {
    throw new Error(
      "value_comparison_real_root_acl_directory_set_invalid"
    );
  }

  for (
    const row of
      aclEvidence.directories
  ) {
    if (
      row.exists !==
        true ||
      row.isDirectory !==
        true ||
      row.reparsePoint !==
        false ||
      row.ownerSid !==
        WINDOWS_ADMINISTRATORS_SID ||
      row.accessRulesProtected !==
        true ||
      row.inheritedRuleCount !==
        0 ||
      row.explicitRuleCount !==
        3 ||
      row.systemFullControl !==
        true ||
      row.administratorsFullControl !==
        true ||
      row.controllerReadExecute !==
        true ||
      row.controllerForbiddenWriteRightsPresent !==
        false
    ) {
      throw new Error(
        `value_comparison_real_root_acl_directory_baseline_invalid:${row.path}`
      );
    }
  }

  return {
    expectedDirectories:
      expected,

    controllerSid:
      aclEvidence.controllerSid
  };
}

function artifactCore(
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

    productionConfiguration:
      artifact.productionConfiguration,

    realRootBinding:
      artifact.realRootBinding,

    aclVerification:
      artifact.aclVerification,

    blockers:
      artifact.blockers,

    requiredNextGate:
      artifact.requiredNextGate,

    authority:
      artifact.authority
  };
}

export function checkpointAwareValueComparisonProductionConfigurationRealRootAclVerificationFingerprint(
  artifact
) {
  return fingerprint(
    artifactCore(
      artifact
    )
  );
}

export function buildCheckpointAwareValueComparisonProductionConfigurationRealRootAclVerification({
  dayKey,
  remoteHead,
  productionConfiguration,
  realRootBinding,
  aclEvidence
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
      "value_comparison_real_root_acl_identity_invalid"
    );
  }

  validateCheckpointAwareValueComparisonProductionConfiguration(
    productionConfiguration
  );

  if (
    checkpointAwareValueComparisonProductionConfigurationFingerprint(
      productionConfiguration
    ) !==
      productionConfiguration.configurationFingerprint ||
    productionConfiguration.state !==
      "CONFIGURATION_VALIDATED_PRODUCTION_DISABLED" ||
    productionConfiguration.authority
      ?.productionAdapterEnabled !==
        false ||
    productionConfiguration.authority
      ?.productionExternalStateWriteAuthorized !==
        false ||
    productionConfiguration.authority
      ?.productionKernelInvocationAuthorized !==
        false ||
    productionConfiguration.authority
      ?.repairExecutionAuthorized !==
        false
  ) {
    throw new Error(
      "value_comparison_real_root_acl_configuration_invalid"
    );
  }

  validateBinding(
    productionConfiguration,
    realRootBinding
  );

  const acl =
    validateAclEvidence(
      productionConfiguration,
      aclEvidence
    );

  const blockers = [
    "AUTHORIZATION_INBOX_EXTERNAL_ISSUER_IDENTITY_AND_WRITE_ACL_NOT_CONFIGURED",
    "PRODUCTION_EXTERNAL_STATE_RUNTIME_WRITER_IDENTITY_AND_WRITE_ACL_NOT_CONFIGURED",
    "PRODUCTION_REAL_ROOT_EXTERNAL_STATE_ADAPTER_NOT_IMPLEMENTED",
    "DEDICATED_PRODUCTION_KERNEL_ADAPTER_NOT_IMPLEMENTED",
    "END_TO_END_PRODUCTION_ORCHESTRATOR_NOT_IMPLEMENTED"
  ];

  const artifact = {
    schema:
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_CONFIGURATION_REAL_ROOT_ACL_VERIFICATION_SCHEMA,

    version:
      "1.0.0",

    role:
      "read_only_production_configuration_real_root_binding_and_acl_verification",

    mode:
      "READ_ONLY_PRODUCTION_CONFIGURATION_REAL_ROOT_BINDING_AND_ACL_VERIFICATION",

    dayKey:
      day,

    remoteHead:
      head,

    state:
      "PRODUCTION_CONFIGURATION_BOUND_REAL_ROOTS_ACL_VERIFIED_DISABLED",

    productionConfiguration: {
      state:
        productionConfiguration.state,

      fingerprint:
        productionConfiguration.configurationFingerprint,

      projectRoot:
        productionConfiguration
          .projectRootBinding
          .projectRoot,

      authorizationInbox:
        productionConfiguration
          .authorizationIngress
          .root,

      externalStateRoot:
        productionConfiguration
          .externalState
          .root,

      productionAdapterEnabled:
        false,

      externalStateWriteAuthorized:
        false
    },

    realRootBinding: {
      bindingMode:
        realRootBinding.bindingMode,

      fingerprint:
        realRootBinding.bindingFingerprint,

      persistentRootRequired:
        true,

      rootsDisjoint:
        true,

      rootsOutsideRepositoryAndOsTemp:
        true,

      adapterConstructionPerformed:
        false,

      externalStateWritePerformed:
        false,

      replayConsumptionPerformed:
        false
    },

    aclVerification: {
      model:
        aclEvidence.model,

      controllerSid:
        acl.controllerSid,

      ownerSid:
        WINDOWS_ADMINISTRATORS_SID,

      systemSid:
        WINDOWS_SYSTEM_SID,

      administratorsSid:
        WINDOWS_ADMINISTRATORS_SID,

      exactDirectoryCount:
        8,

      exactFileCount:
        0,

      exactDirectorySet:
        acl.expectedDirectories,

      reparsePoints:
        0,

      inheritedRules:
        0,

      explicitRulesPerDirectory:
        3,

      systemFullControl:
        true,

      administratorsFullControl:
        true,

      controllerBaselineAccess:
        "READ_EXECUTE_ONLY",

      controllerWriteRightsPresent:
        false,

      authorizationInboxExternalIssuerAclConfigured:
        false,

      productionExternalStateRuntimeWriterAclConfigured:
        false
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
        "DEDICATED_VALUE_COMPARISON_PRODUCTION_RUNTIME_IDENTITIES_AND_ACL_ACTIVATION_PLAN_READ_ONLY",

      mustIdentifyAuthorizationIssuerRuntimePrincipal:
        true,

      mustIdentifyControllerRuntimeWriterPrincipal:
        true,

      mustKeepPrivateKeyOutsideRepositoryAndControllerRoots:
        true,

      mustGrantOnlyAuthorizationInboxWriteToIssuer:
        true,

      mustGrantOnlyExternalStateWriteToRuntimeWriter:
        true,

      mustPreserveSystemAndAdministratorsFullControl:
        true,

      mustNotEnableProductionKernel:
        true,

      mustNotConstructProductionAdapter:
        true,

      mustNotConsumeReplay:
        true
    },

    authority: {
      readOnly:
        true,

      configurationBoundAsEvidence:
        true,

      aclVerifiedAsEvidence:
        true,

      aclMutationAuthorized:
        false,

      authorizationIssuerWriteAclAuthorized:
        false,

      productionRuntimeWriterAclAuthorized:
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

  artifact.verificationFingerprint =
    checkpointAwareValueComparisonProductionConfigurationRealRootAclVerificationFingerprint(
      artifact
    );

  return artifact;
}
