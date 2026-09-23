import path from "node:path";
import {
  fileURLToPath
} from "node:url";

import {
  buildCheckpointAwareValueComparisonProductionExecutionHostAccountEnablementPlan
} from "../core/checkpoint-aware-targeted-value-comparison-production-execution-host-account-enablement-plan.js";

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
      `value_comparison_execution_host_plan_${label}_missing`
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
      `value_comparison_execution_host_plan_${label}_invalid`
    );
  }
}

export function runCheckpointAwareValueComparisonProductionExecutionHostAccountEnablementPlanDay({
  dayKey,
  remoteHead,
  sourceR32,
  hostObservation,
  accountObservation,
  logonRightsObservation,
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
    ).toLowerCase();

  if (
    !DAY_RE.test(
      day
    )
  ) {
    throw new Error(
      "value_comparison_execution_host_plan_day_invalid"
    );
  }

  if (
    !SHA_RE.test(
      head
    )
  ) {
    throw new Error(
      "value_comparison_execution_host_plan_remote_head_invalid"
    );
  }

  const plan =
    buildCheckpointAwareValueComparisonProductionExecutionHostAccountEnablementPlan({
      dayKey:
        day,

      remoteHead:
        head,

      sourceR32,

      hostObservation,

      accountObservation,

      logonRightsObservation
    });

  return {
    schema:
      "ai-matchlab.checkpoint-aware-value-comparison-production-execution-host-account-enablement-plan-day.v1",

    mode:
      "READ_ONLY_PRODUCTION_EXECUTION_HOST_AND_ACCOUNT_ENABLEMENT_PLAN",

    dayKey:
      day,

    generatedAt,

    remoteHead:
      head,

    plan,

    safety: {
      repositoryWritePerformed:
        false,

      localAccountEnabled:
        false,

      localAccountPasswordModified:
        false,

      localGroupMembershipModified:
        false,

      logonRightsModified:
        false,

      scheduledTaskRegistered:
        false,

      scheduledTaskEnabled:
        false,

      windowsServiceCreated:
        false,

      aclMutationPerformed:
        false,

      credentialRead:
        false,

      credentialPersisted:
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
      runCheckpointAwareValueComparisonProductionExecutionHostAccountEnablementPlanDay({
        dayKey:
          parseArg(
            "date"
          ),

        remoteHead:
          parseArg(
            "remote-head"
          ),

        sourceR32:
          parseBase64Json(
            parseArg(
              "source-r32-base64"
            ),
            "source_r32"
          ),

        hostObservation:
          parseBase64Json(
            parseArg(
              "host-observation-base64"
            ),
            "host_observation"
          ),

        accountObservation:
          parseBase64Json(
            parseArg(
              "account-observation-base64"
            ),
            "account_observation"
          ),

        logonRightsObservation:
          parseBase64Json(
            parseArg(
              "logon-rights-observation-base64"
            ),
            "logon_rights_observation"
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
              "unknown_value_comparison_execution_host_plan_error"
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
