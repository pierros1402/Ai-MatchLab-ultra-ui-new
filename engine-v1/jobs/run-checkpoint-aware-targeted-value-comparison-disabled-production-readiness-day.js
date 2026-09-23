import path from "node:path";
import {
  fileURLToPath
} from "node:url";

import {
  inspectAutonomousRepairProductionExecutionReadiness
} from "../core/autonomous-repair-production-execution-entrypoint.js";

import {
  buildCheckpointAwareValueComparisonDisabledProductionReadinessContract
} from "../core/checkpoint-aware-targeted-value-comparison-disabled-production-readiness.js";

import {
  runCheckpointAwareValueComparisonDisabledProductionAdapterContractDay
} from "./run-checkpoint-aware-targeted-value-comparison-disabled-production-adapter-contract-day.js";

import {
  runCheckpointAwareValueComparisonExternalStateCrashRecoverySandboxDay
} from "./run-checkpoint-aware-targeted-value-comparison-external-state-crash-recovery-sandbox-day.js";

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

const SHA_RE =
  /^[0-9a-f]{40}$/u;

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

export function runCheckpointAwareValueComparisonDisabledProductionReadinessDay({
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
      "value_comparison_production_readiness_day_invalid"
    );
  }

  if (
    !SHA_RE.test(
      head
    )
  ) {
    throw new Error(
      "value_comparison_production_readiness_remote_head_invalid"
    );
  }

  const r19 =
    runCheckpointAwareValueComparisonExternalStateCrashRecoverySandboxDay({
      dayKey:
        day,

      remoteHead:
        head,

      generatedAt
    });

  const legacy =
    runCheckpointAwareValueComparisonDisabledProductionAdapterContractDay({
      dayKey:
        day,

      remoteHead:
        head,

      generatedAt
    });

  const generic =
    inspectAutonomousRepairProductionExecutionReadiness();

  const contract =
    buildCheckpointAwareValueComparisonDisabledProductionReadinessContract({
      dayKey:
        day,

      remoteHead:
        head,

      sourceR19:
        r19,

      legacyDisabledAdapter:
        legacy,

      genericProductionReadiness:
        generic,

      externalAuthorizationIngressImplemented:
        false,

      dedicatedProductionExternalStateAdapterImplemented:
        false,

      dedicatedProductionKernelAdapterImplemented:
        false,

      endToEndProductionOrchestratorImplemented:
        false
    });

  return {
    schema:
      "ai-matchlab.checkpoint-aware-value-comparison-disabled-production-readiness-day.v1",

    mode:
      "DISABLED_PRODUCTION_ADAPTER_READINESS_CONTRACT",

    dayKey:
      day,

    generatedAt,

    remoteHead:
      head,

    contract,

    sourceStates: {
      r19RecoveryState:
        r19.recoveryState,

      r19ProposedMutationCount:
        r19.proposedMutationCount,

      legacyAdapterState:
        legacy.contract.adapterState,

      legacyAdapterEnabled:
        legacy.contract.authority.adapterEnabled,

      genericProductionState:
        generic.state,

      genericProductionKernelEnabled:
        generic.productionKernelEnabled
    },

    safety: {
      repositoryWritePerformed:
        false,

      productionReadinessInspectionOnly:
        true,

      authorizationIngressPerformed:
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
      runCheckpointAwareValueComparisonDisabledProductionReadinessDay({
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
              "unknown_value_comparison_production_readiness_error"
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
