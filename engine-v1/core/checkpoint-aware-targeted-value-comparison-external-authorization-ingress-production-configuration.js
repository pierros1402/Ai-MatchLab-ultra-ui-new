import {
  createHash
} from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import {
  CHECKPOINT_AWARE_VALUE_COMPARISON_AUTHORIZATION_SCHEMA,
  CHECKPOINT_AWARE_VALUE_COMPARISON_AUTHORIZATION_VERSION,
  validateCheckpointAwareValueComparisonAuthorizationArtifactStructure
} from "./checkpoint-aware-targeted-value-comparison-authorization-validator-binding.js";

import {
  inspectCheckpointAwareValueComparisonPinnedTrustRegistry
} from "./checkpoint-aware-targeted-value-comparison-pinned-trust-signature-verifier.js";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_CONFIGURATION_SCHEMA =
  "ai-matchlab.checkpoint-aware-value-comparison-production-configuration.v1";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_EXTERNAL_AUTHORIZATION_INGRESS_SCHEMA =
  "ai-matchlab.checkpoint-aware-value-comparison-external-authorization-ingress.v1";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_INGRESS_READINESS_SCHEMA =
  "ai-matchlab.checkpoint-aware-value-comparison-external-authorization-ingress-readiness.v1";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_AUTHORIZATION_MAX_BYTES =
  256 * 1024;

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

const HEAD_RE =
  /^[0-9a-f]{40}$/u;

const SHA_RE =
  /^[0-9a-f]{64}$/u;

const REMAINING_INTERFACE_BLOCKERS =
  Object.freeze([
    "DEDICATED_PRODUCTION_EXTERNAL_STATE_ADAPTER_NOT_IMPLEMENTED",
    "DEDICATED_PRODUCTION_KERNEL_ADAPTER_NOT_IMPLEMENTED",
    "END_TO_END_PRODUCTION_ORCHESTRATOR_NOT_IMPLEMENTED"
  ]);

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

function realDirectory(
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
    ) ||
    !fs.statSync(
      input
    )
      .isDirectory()
  ) {
    throw new Error(
      `value_comparison_production_configuration_${label}_invalid`
    );
  }

  return fs.realpathSync(
    input
  );
}

function configurationCore(
  artifact
) {
  return {
    schema:
      artifact.schema,

    version:
      artifact.version,

    role:
      artifact.role,

    state:
      artifact.state,

    projectRootBinding:
      artifact.projectRootBinding,

    authorizationIngress:
      artifact.authorizationIngress,

    externalState:
      artifact.externalState,

    pinnedTrust:
      artifact.pinnedTrust,

    authority:
      artifact.authority
  };
}

export function checkpointAwareValueComparisonProductionConfigurationFingerprint(
  artifact
) {
  return fingerprint(
    configurationCore(
      artifact
    )
  );
}

export function validateCheckpointAwareValueComparisonProductionConfiguration(
  artifact
) {
  if (
    !artifact ||
    typeof artifact !==
      "object" ||
    artifact.schema !==
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_CONFIGURATION_SCHEMA ||
    artifact.version !==
      "1.0.0" ||
    artifact.role !==
      "read_only_dedicated_value_comparison_production_configuration" ||
    artifact.state !==
      "CONFIGURATION_VALIDATED_PRODUCTION_DISABLED" ||
    artifact.projectRootBinding
      ?.callerSuppliedProjectRootForbidden !==
        true ||
    artifact.projectRootBinding
      ?.bindingMode !==
        "PROCESS_PROJECT_ROOT_PINNED" ||
    artifact.authorizationIngress
      ?.readOnly !==
        true ||
    artifact.authorizationIngress
      ?.alreadySignedDedicatedAuthorizationOnly !==
        true ||
    artifact.authorizationIngress
      ?.authorizationCreationAllowed !==
        false ||
    artifact.authorizationIngress
      ?.signingAllowed !==
        false ||
    artifact.authorizationIngress
      ?.maxAuthorizationBytes !==
        CHECKPOINT_AWARE_VALUE_COMPARISON_AUTHORIZATION_MAX_BYTES ||
    artifact.authorizationIngress
      ?.schema !==
        CHECKPOINT_AWARE_VALUE_COMPARISON_AUTHORIZATION_SCHEMA ||
    artifact.authorizationIngress
      ?.version !==
        CHECKPOINT_AWARE_VALUE_COMPARISON_AUTHORIZATION_VERSION ||
    artifact.externalState
      ?.outsideRepositoryRequired !==
        true ||
    artifact.externalState
      ?.writeAuthorized !==
        false ||
    artifact.pinnedTrust
      ?.repositoryPinnedPublicRegistryRequired !==
        true ||
    artifact.pinnedTrust
      ?.callerSuppliedTrustForbidden !==
        true ||
    artifact.pinnedTrust
      ?.recordCount <
        1 ||
    artifact.pinnedTrust
      ?.allRecordsValid !==
        true ||
    artifact.authority
      ?.readOnly !==
        true ||
    artifact.authority
      ?.productionAdapterEnabled !==
        false ||
    artifact.authority
      ?.authorizationIngressMutationAuthorized !==
        false ||
    artifact.authority
      ?.authorizationArtifactCreationAuthorized !==
        false ||
    artifact.authority
      ?.signerUseAuthorized !==
        false ||
    artifact.authority
      ?.privateKeyReadAuthorized !==
        false ||
    artifact.authority
      ?.productionExternalStateWriteAuthorized !==
        false ||
    artifact.authority
      ?.productionKernelInvocationAuthorized !==
        false ||
    artifact.authority
      ?.repairExecutionAuthorized !==
        false
  ) {
    throw new Error(
      "value_comparison_production_configuration_artifact_invalid"
    );
  }

  for (
    const candidate of
      [
        artifact.projectRootBinding.projectRoot,
        artifact.authorizationIngress.root,
        artifact.externalState.root
      ]
  ) {
    if (
      !clean(
        candidate
      ) ||
      !path.isAbsolute(
        candidate
      )
    ) {
      throw new Error(
        "value_comparison_production_configuration_path_invalid"
      );
    }
  }

  if (
    !SHA_RE.test(
      clean(
        artifact.configurationFingerprint
      )
    ) ||
    checkpointAwareValueComparisonProductionConfigurationFingerprint(
      artifact
    ) !==
      artifact.configurationFingerprint
  ) {
    throw new Error(
      "value_comparison_production_configuration_fingerprint_invalid"
    );
  }

  return true;
}

export function buildCheckpointAwareValueComparisonProductionConfiguration({
  projectRoot,
  authorizationIngressRoot,
  externalStateRoot,
  productionAdapterEnabled =
    false
} = {}) {
  if (
    productionAdapterEnabled !==
      false
  ) {
    throw new Error(
      "value_comparison_production_configuration_must_remain_disabled"
    );
  }

  const projectReal =
    realDirectory(
      projectRoot,
      "project_root"
    );

  const ingressReal =
    realDirectory(
      authorizationIngressRoot,
      "authorization_ingress_root"
    );

  const externalStateReal =
    realDirectory(
      externalStateRoot,
      "external_state_root"
    );

  if (
    projectReal ===
      ingressReal ||
    projectReal ===
      externalStateReal ||
    ingressReal ===
      externalStateReal ||
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
      "value_comparison_production_configuration_roots_not_disjoint"
    );
  }

  const trust =
    inspectCheckpointAwareValueComparisonPinnedTrustRegistry();

  if (
    trust.recordCount <
      1 ||
    trust.allRecordsValid !==
      true ||
    trust.records.some(
      record =>
        record.privateKeyMaterialPresent !==
          false
    )
  ) {
    throw new Error(
      "value_comparison_production_configuration_pinned_trust_invalid"
    );
  }

  const artifact = {
    schema:
      CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_CONFIGURATION_SCHEMA,

    version:
      "1.0.0",

    role:
      "read_only_dedicated_value_comparison_production_configuration",

    state:
      "CONFIGURATION_VALIDATED_PRODUCTION_DISABLED",

    projectRootBinding: {
      bindingMode:
        "PROCESS_PROJECT_ROOT_PINNED",

      projectRoot:
        projectReal,

      callerSuppliedProjectRootForbidden:
        true
    },

    authorizationIngress: {
      root:
        ingressReal,

      readOnly:
        true,

      alreadySignedDedicatedAuthorizationOnly:
        true,

      authorizationCreationAllowed:
        false,

      signingAllowed:
        false,

      maxAuthorizationBytes:
        CHECKPOINT_AWARE_VALUE_COMPARISON_AUTHORIZATION_MAX_BYTES,

      schema:
        CHECKPOINT_AWARE_VALUE_COMPARISON_AUTHORIZATION_SCHEMA,

      version:
        CHECKPOINT_AWARE_VALUE_COMPARISON_AUTHORIZATION_VERSION
    },

    externalState: {
      root:
        externalStateReal,

      outsideRepositoryRequired:
        true,

      writeAuthorized:
        false
    },

    pinnedTrust: {
      repositoryPinnedPublicRegistryRequired:
        true,

      callerSuppliedTrustForbidden:
        true,

      recordCount:
        trust.recordCount,

      allRecordsValid:
        trust.allRecordsValid,

      keyIdentities:
        trust.records.map(
          record => ({
            issuerId:
              record.issuerId,

            keyId:
              record.keyId,

            publicKeySpkiSha256:
              record.publicKeySpkiSha256
          })
        )
    },

    authority: {
      readOnly:
        true,

      productionAdapterEnabled:
        false,

      authorizationIngressMutationAuthorized:
        false,

      authorizationArtifactCreationAuthorized:
        false,

      signerUseAuthorized:
        false,

      privateKeyReadAuthorized:
        false,

      replayConsumptionAuthorized:
        false,

      productionExternalStateWriteAuthorized:
        false,

      productionKernelInvocationAuthorized:
        false,

      filesystemRepositoryWriteAuthorized:
        false,

      repairExecutionAuthorized:
        false
    }
  };

  artifact.configurationFingerprint =
    checkpointAwareValueComparisonProductionConfigurationFingerprint(
      artifact
    );

  validateCheckpointAwareValueComparisonProductionConfiguration(
    artifact
  );

  return artifact;
}

function ingressCore(
  artifact
) {
  return {
    schema:
      artifact.schema,

    version:
      artifact.version,

    role:
      artifact.role,

    authorizationFile:
      artifact.authorizationFile,

    authorizationFileSha256:
      artifact.authorizationFileSha256,

    authorizationFileBytes:
      artifact.authorizationFileBytes,

    authorizationFingerprint:
      artifact.authorizationFingerprint,

    authorizationId:
      artifact.authorizationId,

    dayKey:
      artifact.dayKey,

    repairClass:
      artifact.repairClass,

    pinnedTrustIdentity:
      artifact.pinnedTrustIdentity,

    signature:
      artifact.signature,

    authority:
      artifact.authority
  };
}

export function checkpointAwareValueComparisonExternalAuthorizationIngressFingerprint(
  artifact
) {
  return fingerprint(
    ingressCore(
      artifact
    )
  );
}

export function readCheckpointAwareValueComparisonExternallySignedAuthorization({
  authorizationFile,
  productionConfiguration
} = {}) {
  validateCheckpointAwareValueComparisonProductionConfiguration(
    productionConfiguration
  );

  const input =
    clean(
      authorizationFile
    );

  if (
    !input ||
    !path.isAbsolute(
      input
    ) ||
    path.extname(
      input
    )
      .toLowerCase() !==
        ".json" ||
    !fs.existsSync(
      input
    )
  ) {
    throw new Error(
      "value_comparison_external_authorization_ingress_file_invalid"
    );
  }

  const stat =
    fs.lstatSync(
      input
    );

  if (
    stat.isSymbolicLink() ||
    !stat.isFile() ||
    stat.size <=
      0 ||
    stat.size >
      CHECKPOINT_AWARE_VALUE_COMPARISON_AUTHORIZATION_MAX_BYTES
  ) {
    throw new Error(
      "value_comparison_external_authorization_ingress_file_type_or_size_invalid"
    );
  }

  const fileReal =
    fs.realpathSync(
      input
    );

  const ingressRoot =
    fs.realpathSync(
      productionConfiguration
        .authorizationIngress
        .root
    );

  const projectRoot =
    fs.realpathSync(
      productionConfiguration
        .projectRootBinding
        .projectRoot
    );

  const externalStateRoot =
    fs.realpathSync(
      productionConfiguration
        .externalState
        .root
    );

  if (
    !isContained(
      ingressRoot,
      fileReal
    ) ||
    isContained(
      projectRoot,
      fileReal
    ) ||
    isContained(
      externalStateRoot,
      fileReal
    )
  ) {
    throw new Error(
      "value_comparison_external_authorization_ingress_containment_invalid"
    );
  }

  const bytes =
    fs.readFileSync(
      fileReal
    );

  if (
    bytes.length !==
      stat.size ||
    bytes.length >
      CHECKPOINT_AWARE_VALUE_COMPARISON_AUTHORIZATION_MAX_BYTES
  ) {
    throw new Error(
      "value_comparison_external_authorization_ingress_bytes_invalid"
    );
  }

  let authorization;

  try {
    authorization =
      JSON.parse(
        bytes.toString(
          "utf8"
        )
      );
  }
  catch {
    throw new Error(
      "value_comparison_external_authorization_ingress_json_invalid"
    );
  }

  validateCheckpointAwareValueComparisonAuthorizationArtifactStructure(
    authorization
  );

  const trust =
    inspectCheckpointAwareValueComparisonPinnedTrustRegistry();

  const matches =
    trust.records.filter(
      record =>
        record.issuerId ===
          authorization.signature.issuerId &&
        record.keyId ===
          authorization.signature.keyId &&
        record.publicKeySpkiSha256 ===
          authorization.signature.publicKeySpkiSha256
    );

  if (
    matches.length !==
      1
  ) {
    throw new Error(
      "value_comparison_external_authorization_ingress_pinned_trust_identity_mismatch"
    );
  }

  const artifact = {
    schema:
      CHECKPOINT_AWARE_VALUE_COMPARISON_EXTERNAL_AUTHORIZATION_INGRESS_SCHEMA,

    version:
      "1.0.0",

    role:
      "read_only_already_signed_authorization_ingress",

    authorizationFile:
      fileReal,

    authorizationFileSha256:
      sha256Buffer(
        bytes
      ),

    authorizationFileBytes:
      bytes.length,

    authorizationFingerprint:
      authorization.authorizationFingerprint,

    authorizationId:
      authorization.authorizationId,

    dayKey:
      authorization.dayKey,

    repairClass:
      authorization.repairClass,

    pinnedTrustIdentity: {
      issuerId:
        matches[0].issuerId,

      keyId:
        matches[0].keyId,

      publicKeySpkiSha256:
        matches[0].publicKeySpkiSha256
    },

    signature: {
      envelopeStructurallyValid:
        true,

      pinnedTrustIdentityMatched:
        true,

      cryptographicallyVerified:
        false,

      verificationDelegatedTo:
        "R16_EXACT_BINDING_AND_PINNED_TRUST_VERIFIER"
    },

    authority: {
      readOnly:
        true,

      fileMoved:
        false,

      fileDeleted:
        false,

      authorizationGranted:
        false,

      authorizationArtifactCreationAuthorized:
        false,

      signerUseAuthorized:
        false,

      privateKeyReadAuthorized:
        false,

      replayConsumptionAuthorized:
        false,

      productionKernelInvocationAuthorized:
        false,

      filesystemRepositoryWriteAuthorized:
        false,

      repairExecutionAuthorized:
        false
    }
  };

  artifact.ingressFingerprint =
    checkpointAwareValueComparisonExternalAuthorizationIngressFingerprint(
      artifact
    );

  return {
    artifact,
    authorization
  };
}

function validateR20(
  sourceR20,
  dayKey,
  remoteHead
) {
  if (
    !sourceR20 ||
    typeof sourceR20 !==
      "object" ||
    sourceR20.mode !==
      "DISABLED_PRODUCTION_ADAPTER_READINESS_CONTRACT" ||
    sourceR20.dayKey !==
      dayKey ||
    sourceR20.remoteHead !==
      remoteHead ||
    sourceR20.contract
      ?.currentState
      ?.productionReadinessState !==
        "DISABLED_PREREQUISITES_INCOMPLETE" ||
    sourceR20.contract
      ?.blockerCount !==
        4 ||
    sourceR20.contract
      ?.requiredNextGate
      ?.name !==
        "DEDICATED_VALUE_COMPARISON_EXTERNAL_AUTHORIZATION_INGRESS_AND_PRODUCTION_CONFIGURATION_CONTRACT_READ_ONLY" ||
    sourceR20.contract
      ?.authority
      ?.productionAdapterEnabled !==
        false ||
    sourceR20.contract
      ?.authority
      ?.authorizationIngressAuthorized !==
        false ||
    sourceR20.contract
      ?.authority
      ?.authorizationArtifactCreationAuthorized !==
        false ||
    sourceR20.contract
      ?.authority
      ?.signerUseAuthorized !==
        false ||
    sourceR20.contract
      ?.authority
      ?.privateKeyReadAuthorized !==
        false ||
    sourceR20.contract
      ?.authority
      ?.productionKernelInvocationAuthorized !==
        false ||
    sourceR20.contract
      ?.authority
      ?.repairExecutionAuthorized !==
        false ||
    sourceR20.safety
      ?.repositoryWritePerformed !==
        false ||
    sourceR20.safety
      ?.productionKernelEnabled !==
        false
  ) {
    throw new Error(
      "value_comparison_ingress_readiness_r20_boundary_invalid"
    );
  }

  return true;
}

function readinessCore(
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

    productionConfiguration:
      artifact.productionConfiguration,

    blockers:
      artifact.blockers,

    requiredNextGate:
      artifact.requiredNextGate,

    authority:
      artifact.authority
  };
}

export function checkpointAwareValueComparisonIngressReadinessFingerprint(
  artifact
) {
  return fingerprint(
    readinessCore(
      artifact
    )
  );
}

export function buildCheckpointAwareValueComparisonExternalAuthorizationIngressReadinessContract({
  dayKey,
  remoteHead,
  sourceR20,
  productionConfiguration =
    null
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
      "value_comparison_ingress_readiness_identity_invalid"
    );
  }

  validateR20(
    sourceR20,
    day,
    head
  );

  let configurationState =
    "NOT_BOUND";

  let configurationFingerprint =
    null;

  if (
    productionConfiguration !==
      null
  ) {
    validateCheckpointAwareValueComparisonProductionConfiguration(
      productionConfiguration
    );

    configurationState =
      "VALIDATED_BUT_PRODUCTION_DISABLED";

    configurationFingerprint =
      productionConfiguration
        .configurationFingerprint;
  }

  const blockers = [
    ...(
      productionConfiguration ===
        null
        ? [
            "PRODUCTION_CONFIGURATION_NOT_BOUND"
          ]
        : [
            "PRODUCTION_CONFIGURATION_DISABLED_BY_CONTRACT"
          ]
    ),
    ...REMAINING_INTERFACE_BLOCKERS
  ];

  const artifact = {
    schema:
      CHECKPOINT_AWARE_VALUE_COMPARISON_INGRESS_READINESS_SCHEMA,

    version:
      "1.0.0",

    role:
      "read_only_external_authorization_ingress_and_production_configuration_contract",

    mode:
      "READ_ONLY_EXTERNAL_AUTHORIZATION_INGRESS_AND_PRODUCTION_CONFIGURATION_CONTRACT",

    dayKey:
      day,

    remoteHead:
      head,

    state:
      productionConfiguration ===
        null
        ? "INGRESS_IMPLEMENTED_CONFIGURATION_NOT_BOUND_DISABLED"
        : "INGRESS_IMPLEMENTED_CONFIGURATION_VALIDATED_DISABLED",

    implementation: {
      externalSignedAuthorizationIngressReadOnlyImplemented:
        true,

      alreadySignedDedicatedAuthorizationOnly:
        true,

      authorizationArtifactStructureValidationImplemented:
        true,

      pinnedTrustIdentityMatchingImplemented:
        true,

      authorizationFileContainmentValidationImplemented:
        true,

      regularFileAndSizeValidationImplemented:
        true,

      productionConfigurationValidatorImplemented:
        true,

      callerSuppliedProjectRootForbidden:
        true,

      callerSuppliedTrustForbidden:
        true,

      cryptographicSignatureVerificationDelegatedToR16:
        true,

      authorizationCreationImplemented:
        false,

      signerImplemented:
        false,

      productionExternalStateAdapterImplemented:
        false,

      productionKernelAdapterImplemented:
        false,

      endToEndProductionOrchestratorImplemented:
        false
    },

    productionConfiguration: {
      state:
        configurationState,

      configurationFingerprint
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
        "DEDICATED_VALUE_COMPARISON_PRODUCTION_EXTERNAL_STATE_ADAPTER_CONFIGURATION_CONTRACT_READ_ONLY",

      externalStateRootMustRemainOutsideRepository:
        true,

      externalStateAdapterMustPreserveR19JournalReplayLockAuditSemantics:
        true,

      callerSuppliedProjectRootForbidden:
        true,

      callerSuppliedTrustForbidden:
        true,

      productionKernelMustRemainDisabled:
        true,

      signerUseForbidden:
        true,

      privateKeyReadForbidden:
        true
    },

    authority: {
      readOnly:
        true,

      planningOnly:
        true,

      productionAdapterEnabled:
        false,

      authorizationIngressReadAuthorized:
        false,

      authorizationIngressMutationAuthorized:
        false,

      authorizationArtifactCreationAuthorized:
        false,

      signerUseAuthorized:
        false,

      privateKeyReadAuthorized:
        false,

      replayConsumptionAuthorized:
        false,

      productionExternalStateWriteAuthorized:
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

  artifact.readinessFingerprint =
    checkpointAwareValueComparisonIngressReadinessFingerprint(
      artifact
    );

  return artifact;
}
