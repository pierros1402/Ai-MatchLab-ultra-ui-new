import path from "node:path";
import {
  fileURLToPath
} from "node:url";

import {
  buildCheckpointAwareValueComparisonRuntimeIdentitiesAclActivationPrecheck
} from "../core/checkpoint-aware-targeted-value-comparison-production-runtime-identities-acl-activation-precheck.js";

import {
  runCheckpointAwareValueComparisonProductionRuntimeIdentitiesAclActivationPlanDay
} from "./run-checkpoint-aware-targeted-value-comparison-production-runtime-identities-acl-activation-plan-day.js";

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
  value,
  label
) {
  const input =
    clean(
      value
    );

  if (
    !input
  ) {
    throw new Error(
      `value_comparison_runtime_identities_acl_precheck_${label}_missing`
    );
  }

  try {
    return JSON.parse(
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
      `value_comparison_runtime_identities_acl_precheck_${label}_invalid`
    );
  }
}

export function runCheckpointAwareValueComparisonRuntimeIdentitiesAclActivationPrecheckDay({
  dayKey,
  remoteHead,
  projectRoot,
  authorizationInbox,
  externalStateRoot,
  aclEvidence,
  computerName,
  controllerAccount,
  controllerSid,
  identityObservation,
  capabilityObservation,
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
      "value_comparison_runtime_identities_acl_precheck_day_invalid"
    );
  }

  if (
    !SHA_RE.test(
      head
    )
  ) {
    throw new Error(
      "value_comparison_runtime_identities_acl_precheck_remote_head_invalid"
    );
  }

  const r29 =
    runCheckpointAwareValueComparisonProductionRuntimeIdentitiesAclActivationPlanDay({
      dayKey:
        day,

      remoteHead:
        head,

      projectRoot,

      authorizationInbox,

      externalStateRoot,

      aclEvidence,

      computerName,

      controllerAccount,

      controllerSid,

      identityObservation,

      generatedAt
    });

  const precheck =
    buildCheckpointAwareValueComparisonRuntimeIdentitiesAclActivationPrecheck({
      dayKey:
        day,

      remoteHead:
        head,

      sourceR29:
        r29,

      baselineAclEvidence:
        aclEvidence,

      capabilityObservation
    });

  return {
    schema:
      "ai-matchlab.checkpoint-aware-value-comparison-runtime-identities-acl-activation-precheck-day.v1",

    mode:
      "READ_ONLY_PRODUCTION_RUNTIME_IDENTITIES_PROVISIONING_AND_ACL_ACTIVATION_PRECHECK",

    dayKey:
      day,

    generatedAt,

    remoteHead:
      head,

    precheck,

    safety: {
      repositoryWritePerformed:
        false,

      localAccountCreated:
        false,

      localAccountModified:
        false,

      localGroupMembershipModified:
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
      runCheckpointAwareValueComparisonRuntimeIdentitiesAclActivationPrecheckDay({
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
            ),
            "acl_evidence"
          ),

        computerName:
          parseArg(
            "computer-name"
          ),

        controllerAccount:
          parseArg(
            "controller-account"
          ),

        controllerSid:
          parseArg(
            "controller-sid"
          ),

        identityObservation:
          parseBase64Json(
            parseArg(
              "identity-observation-base64"
            ),
            "identity_observation"
          ),

        capabilityObservation:
          parseBase64Json(
            parseArg(
              "capability-observation-base64"
            ),
            "capability_observation"
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
              "unknown_value_comparison_runtime_identities_acl_precheck_error"
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
