import path from "node:path";
import {
  fileURLToPath
} from "node:url";

import {
  buildCheckpointAwareValueComparisonProductionConfiguration
} from "../core/checkpoint-aware-targeted-value-comparison-external-authorization-ingress-production-configuration.js";

import {
  CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_REAL_ROOT_BINDING_MODE,
  validateCheckpointAwareValueComparisonProductionRealRootBinding
} from "../core/checkpoint-aware-targeted-value-comparison-production-external-state-real-root-binding.js";

import {
  buildCheckpointAwareValueComparisonProductionConfigurationRealRootAclVerification
} from "../core/checkpoint-aware-targeted-value-comparison-production-configuration-real-root-acl-verification.js";

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

const SHA_RE =
  /^[0-9a-f]{40}$/u;

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

function parseArg(name) {
  const prefix =
    `--${name}=`;

  const value =
    process.argv
      .slice(2)
      .find(
        arg =>
          arg.startsWith(
            prefix
          )
      );

  return value
    ? value
        .slice(
          prefix.length
        )
        .trim()
    : "";
}

function parseBase64Json(
  value
) {
  const input =
    clean(
      value
    );

  if (
    !input
  ) {
    throw new Error(
      "value_comparison_real_root_acl_evidence_base64_missing"
    );
  }

  let parsed;

  try {
    parsed =
      JSON.parse(
        Buffer.from(
          input,
          "base64"
        )
          .toString(
            "utf8"
          )
      );
  }
  catch {
    throw new Error(
      "value_comparison_real_root_acl_evidence_base64_invalid"
    );
  }

  return parsed;
}

export function runCheckpointAwareValueComparisonProductionConfigurationRealRootAclVerificationDay({
  dayKey,
  remoteHead,
  projectRoot,
  authorizationInbox,
  externalStateRoot,
  aclEvidence,
  generatedAt =
    new Date().toISOString()
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
    )
  ) {
    throw new Error(
      "value_comparison_real_root_acl_day_invalid"
    );
  }

  if (
    !SHA_RE.test(
      head
    )
  ) {
    throw new Error(
      "value_comparison_real_root_acl_remote_head_invalid"
    );
  }

  const productionConfiguration =
    buildCheckpointAwareValueComparisonProductionConfiguration({
      projectRoot,

      authorizationIngressRoot:
        authorizationInbox,

      externalStateRoot,

      productionAdapterEnabled:
        false
    });

  const realRootBinding =
    validateCheckpointAwareValueComparisonProductionRealRootBinding({
      productionConfiguration,

      expectedProjectRoot:
        projectRoot,

      bindingMode:
        CHECKPOINT_AWARE_VALUE_COMPARISON_PRODUCTION_REAL_ROOT_BINDING_MODE
          .PERSISTENT_PRODUCTION
    });

  const verification =
    buildCheckpointAwareValueComparisonProductionConfigurationRealRootAclVerification({
      dayKey:
        day,

      remoteHead:
        head,

      productionConfiguration,

      realRootBinding,

      aclEvidence
    });

  return {
    schema:
      "ai-matchlab.checkpoint-aware-value-comparison-production-configuration-real-root-acl-verification-day.v1",

    mode:
      "READ_ONLY_PRODUCTION_CONFIGURATION_REAL_ROOT_BINDING_AND_ACL_VERIFICATION",

    dayKey:
      day,

    generatedAt,

    remoteHead:
      head,

    verification,

    safety: {
      repositoryWritePerformed:
        false,

      externalStateWritePerformed:
        false,

      aclMutationPerformed:
        false,

      authorizationArtifactCreated:
        false,

      replayConsumptionPerformed:
        false,

      productionRealRootAdapterConstructed:
        false,

      signerUse:
        false,

      privateKeyRead:
        false,

      productionKernelInvoked:
        false,

      productionKernelEnabled:
        false,

      repairExecutionAuthority:
        false,

      commitPerformed:
        false,

      pushPerformed:
        false,

      deployPerformed:
        false
    }
  };
}

const isCli =
  process.argv[1] &&
  fileURLToPath(
    import.meta.url
  ) ===
    path.resolve(
      process.argv[1]
    );

if (
  isCli
) {
  try {
    const result =
      runCheckpointAwareValueComparisonProductionConfigurationRealRootAclVerificationDay({
        dayKey:
          parseArg(
            "date"
          ),

        remoteHead:
          parseArg(
            "remote-head"
          ),

        projectRoot:
          process.cwd(),

        authorizationInbox:
          parseArg(
            "authorization-inbox"
          ),

        externalStateRoot:
          parseArg(
            "external-state-root"
          ),

        aclEvidence:
          parseBase64Json(
            parseArg(
              "acl-evidence-base64"
            )
          )
      });

    console.log(
      JSON.stringify(
        result,
        null,
        2
      )
    );
  }
  catch (
    error
  ) {
    console.error(
      JSON.stringify(
        {
          ok:
            false,

          reason:
            String(
              error?.message ||
              error ||
              "unknown_value_comparison_real_root_acl_error"
            )
        },
        null,
        2
      )
    );

    process.exitCode =
      1;
  }
}
