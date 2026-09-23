import path from "node:path";
import {
  fileURLToPath
} from "node:url";

import {
  runCheckpointAwareValueComparisonSourceBoundMaterialKernelAdapterSandboxDay
} from "./run-checkpoint-aware-targeted-value-comparison-source-bound-material-kernel-adapter-sandbox-day.js";

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

const SHA_RE =
  /^[0-9a-f]{40}$/u;

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

export function runCheckpointAwareValueComparisonExternalStateCrashRecoverySandboxDay({
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
      "value_comparison_external_state_crash_recovery_day_invalid"
    );
  }

  if (
    !SHA_RE.test(
      head
    )
  ) {
    throw new Error(
      "value_comparison_external_state_crash_recovery_remote_head_invalid"
    );
  }

  const r18 =
    runCheckpointAwareValueComparisonSourceBoundMaterialKernelAdapterSandboxDay({
      dayKey:
        day,

      remoteHead:
        head,

      generatedAt
    });

  if (
    r18
      ?.safety
      ?.repositoryWritePerformed !==
        false ||
    r18
      ?.safety
      ?.replayConsumptionPerformed !==
        false ||
    r18
      ?.safety
      ?.authorizationArtifactCreated !==
        false ||
    r18
      ?.safety
      ?.signerUse !==
        false ||
    r18
      ?.safety
      ?.privateKeyRead !==
        false ||
    r18
      ?.safety
      ?.productionKernelEnabled !==
        false ||
    r18
      ?.safety
      ?.repairExecutionAuthority !==
        false
  ) {
    throw new Error(
      "value_comparison_external_state_crash_recovery_r18_boundary_invalid"
    );
  }

  const noSandboxRequired =
    r18.sandboxState ===
      "NO_MATERIAL_OR_KERNEL_SANDBOX_REQUIRED_CURRENT_STATE";

  const awaitingVerifiedInputs =
    r18.sandboxState ===
      "AWAITING_VERIFIED_EXTERNAL_AUTHORIZATION_AND_TRANSACTION_PLAN";

  if (
    !noSandboxRequired &&
    !awaitingVerifiedInputs
  ) {
    throw new Error(
      "value_comparison_external_state_crash_recovery_r18_state_invalid"
    );
  }

  return {
    schema:
      "ai-matchlab.checkpoint-aware-value-comparison-external-state-crash-recovery-sandbox-day.v1",

    mode:
      "EXTERNAL_STATE_REPLAY_JOURNAL_CRASH_RECOVERY_SANDBOX",

    dayKey:
      day,

    generatedAt,

    remoteHead:
      head,

    recoveryState:
      noSandboxRequired
        ? "NO_EXTERNAL_STATE_SANDBOX_REQUIRED_CURRENT_STATE"
        : "AWAITING_VERIFIED_TRANSACTION_AND_SOURCE_BOUND_MATERIAL",

    sourceR18State:
      r18.sandboxState,

    proposedMutationCount:
      r18.proposedMutationCount,

    implementation: {
      dedicatedExternalStateSandboxAdapterImplemented:
        true,

      externalGlobalLockImplemented:
        true,

      singleUseAtomicReplayConsumptionImplementedInSandbox:
        true,

      durableJournalStateMachineImplemented:
        true,

      verifiedExternalBackupImplemented:
        true,

      crashAfterFirstApplySimulationImplemented:
        true,

      recoveryClassifiesPreimagePostimageAmbiguous:
        true,

      reverseRollbackFromDurableJournalImplemented:
        true,

      terminalAuditImplemented:
        true,

      ambiguousStateFailsToRecoveryRequired:
        true,

      replayReleaseAfterFailure:
        false,

      retryRequiresNewAuthorization:
        true,

      productionExternalStateAdapterImplemented:
        false,

      productionKernelAdapterImplemented:
        false
    },

    nextRequiredGate:
      "DEDICATED_VALUE_COMPARISON_DISABLED_PRODUCTION_ADAPTER_READINESS_CONTRACT",

    safety: {
      repositoryWritePerformed:
        false,

      externalStateSandboxRunThisObservation:
        false,

      replayConsumptionPerformedThisObservation:
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

      authorizationGrantAuthority:
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
      runCheckpointAwareValueComparisonExternalStateCrashRecoverySandboxDay({
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
              "unknown_value_comparison_external_state_crash_recovery_error"
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
