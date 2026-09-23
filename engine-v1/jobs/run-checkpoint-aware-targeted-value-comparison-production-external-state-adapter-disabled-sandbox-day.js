import path from "node:path";
import {
  fileURLToPath
} from "node:url";

import {
  buildCheckpointAwareValueComparisonProductionExternalStateDisabledSandboxContract
} from "../core/checkpoint-aware-targeted-value-comparison-production-external-state-adapter-disabled-sandbox.js";

import {
  runCheckpointAwareValueComparisonProductionExternalStateAdapterConfigurationDay
} from "./run-checkpoint-aware-targeted-value-comparison-production-external-state-adapter-configuration-day.js";

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

const SHA_RE =
  /^[0-9a-f]{40}$/u;

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

export function runCheckpointAwareValueComparisonProductionExternalStateAdapterDisabledSandboxDay({
  dayKey,
  remoteHead,
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
      "value_comparison_production_external_state_disabled_sandbox_day_invalid"
    );
  }

  if (
    !SHA_RE.test(
      head
    )
  ) {
    throw new Error(
      "value_comparison_production_external_state_disabled_sandbox_remote_head_invalid"
    );
  }

  const r22 =
    runCheckpointAwareValueComparisonProductionExternalStateAdapterConfigurationDay({
      dayKey:
        day,

      remoteHead:
        head,

      generatedAt
    });

  const contract =
    buildCheckpointAwareValueComparisonProductionExternalStateDisabledSandboxContract({
      dayKey:
        day,

      remoteHead:
        head,

      sourceR22:
        r22
    });

  return {
    schema:
      "ai-matchlab.checkpoint-aware-value-comparison-production-external-state-disabled-implementation-sandbox-day.v1",

    mode:
      "DISABLED_PRODUCTION_EXTERNAL_STATE_ADAPTER_IMPLEMENTATION_SANDBOX",

    dayKey:
      day,

    generatedAt,

    remoteHead:
      head,

    contract,

    sourceStates: {
      r22State:
        r22.contract.state,

      productionConfigurationBound:
        false,

      isolatedSandboxAdapterConstructedThisObservation:
        false,

      productionRealRootAdapterConstructed:
        false
    },

    safety: {
      repositoryWritePerformed:
        false,

      externalStateSandboxWritePerformedThisObservation:
        false,

      productionExternalStateWritePerformed:
        false,

      replayConsumptionPerformed:
        false,

      authorizationArtifactCreated:
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
      runCheckpointAwareValueComparisonProductionExternalStateAdapterDisabledSandboxDay({
        dayKey:
          parseArg(
            "date"
          ),

        remoteHead:
          parseArg(
            "remote-head"
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
              "unknown_value_comparison_production_external_state_disabled_sandbox_error"
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
