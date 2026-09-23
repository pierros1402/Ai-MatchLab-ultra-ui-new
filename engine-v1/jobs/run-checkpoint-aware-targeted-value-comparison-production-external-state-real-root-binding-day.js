import path from "node:path";
import {
  fileURLToPath
} from "node:url";

import {
  buildCheckpointAwareValueComparisonProductionRealRootBindingContract
} from "../core/checkpoint-aware-targeted-value-comparison-production-external-state-real-root-binding.js";

import {
  runCheckpointAwareValueComparisonProductionExternalStateAdapterDisabledSandboxDay
} from "./run-checkpoint-aware-targeted-value-comparison-production-external-state-adapter-disabled-sandbox-day.js";

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

const SHA_RE =
  /^[0-9a-f]{40}$/u;

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

export function runCheckpointAwareValueComparisonProductionExternalStateRealRootBindingDay({
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
      "value_comparison_production_real_root_binding_day_invalid"
    );
  }

  if (
    !SHA_RE.test(
      head
    )
  ) {
    throw new Error(
      "value_comparison_production_real_root_binding_remote_head_invalid"
    );
  }

  const r23 =
    runCheckpointAwareValueComparisonProductionExternalStateAdapterDisabledSandboxDay({
      dayKey:
        day,

      remoteHead:
        head,

      generatedAt
    });

  const contract =
    buildCheckpointAwareValueComparisonProductionRealRootBindingContract({
      dayKey:
        day,

      remoteHead:
        head,

      sourceR23:
        r23
    });

  return {
    schema:
      "ai-matchlab.checkpoint-aware-value-comparison-production-external-state-real-root-binding-day.v1",

    mode:
      "READ_ONLY_PRODUCTION_EXTERNAL_STATE_REAL_ROOT_BINDING_CONTRACT",

    dayKey:
      day,

    generatedAt,

    remoteHead:
      head,

    contract,

    sourceStates: {
      r23State:
        r23.contract.state,

      persistentProductionRootsProvisioned:
        false,

      productionConfigurationBound:
        false,

      realRootBindingPerformed:
        false,

      productionRealRootAdapterConstructed:
        false
    },

    safety: {
      repositoryWritePerformed:
        false,

      environmentConfigurationReadPerformed:
        false,

      productionRootsCreated:
        false,

      productionConfigurationBoundThisObservation:
        false,

      productionRealRootAdapterConstructed:
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
      runCheckpointAwareValueComparisonProductionExternalStateRealRootBindingDay({
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
              "unknown_value_comparison_production_real_root_binding_error"
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
