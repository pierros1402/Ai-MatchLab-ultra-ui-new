import path from "node:path";
import {
  fileURLToPath
} from "node:url";

import {
  buildCheckpointAwareValueComparisonExternalAuthorizationIngressReadinessContract
} from "../core/checkpoint-aware-targeted-value-comparison-external-authorization-ingress-production-configuration.js";

import {
  runCheckpointAwareValueComparisonDisabledProductionReadinessDay
} from "./run-checkpoint-aware-targeted-value-comparison-disabled-production-readiness-day.js";

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

const SHA_RE =
  /^[0-9a-f]{40}$/u;

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

export function runCheckpointAwareValueComparisonExternalAuthorizationIngressProductionConfigurationDay({
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
      "value_comparison_external_authorization_ingress_day_invalid"
    );
  }

  if (
    !SHA_RE.test(
      head
    )
  ) {
    throw new Error(
      "value_comparison_external_authorization_ingress_remote_head_invalid"
    );
  }

  const r20 =
    runCheckpointAwareValueComparisonDisabledProductionReadinessDay({
      dayKey:
        day,

      remoteHead:
        head,

      generatedAt
    });

  const contract =
    buildCheckpointAwareValueComparisonExternalAuthorizationIngressReadinessContract({
      dayKey:
        day,

      remoteHead:
        head,

      sourceR20:
        r20,

      productionConfiguration:
        null
    });

  return {
    schema:
      "ai-matchlab.checkpoint-aware-value-comparison-external-authorization-ingress-production-configuration-day.v1",

    mode:
      "READ_ONLY_EXTERNAL_AUTHORIZATION_INGRESS_AND_PRODUCTION_CONFIGURATION_CONTRACT",

    dayKey:
      day,

    generatedAt,

    remoteHead:
      head,

    contract,

    sourceStates: {
      r20ProductionReadinessState:
        r20.contract.currentState.productionReadinessState,

      r20ProposedMutationCount:
        r20.contract.currentState.proposedMutationCount,

      productionConfigurationBound:
        false,

      authorizationFilePresented:
        false
    },

    safety: {
      repositoryWritePerformed:
        false,

      authorizationIngressReadPerformedThisObservation:
        false,

      authorizationIngressMutationPerformed:
        false,

      authorizationArtifactCreated:
        false,

      signerUse:
        false,

      privateKeyRead:
        false,

      replayConsumptionPerformed:
        false,

      productionExternalStateWritePerformed:
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
      runCheckpointAwareValueComparisonExternalAuthorizationIngressProductionConfigurationDay({
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
              "unknown_value_comparison_external_authorization_ingress_error"
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
