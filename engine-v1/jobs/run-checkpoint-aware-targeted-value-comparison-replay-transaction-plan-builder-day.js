import path from "node:path";
import {
  fileURLToPath
} from "node:url";

import {
  runCheckpointAwareValueComparisonPinnedTrustSignatureVerifierDay
} from "./run-checkpoint-aware-targeted-value-comparison-pinned-trust-signature-verifier-day.js";

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

const SHA_RE =
  /^[0-9a-f]{40}$/u;

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

export function runCheckpointAwareValueComparisonReplayTransactionPlanBuilderDay({
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
      "value_comparison_replay_transaction_builder_day_invalid"
    );
  }

  if (
    !SHA_RE.test(
      head
    )
  ) {
    throw new Error(
      "value_comparison_replay_transaction_builder_remote_head_invalid"
    );
  }

  const r16 =
    runCheckpointAwareValueComparisonPinnedTrustSignatureVerifierDay({
      dayKey:
        day,

      remoteHead:
        head,

      generatedAt
    });

  if (
    r16
      ?.safety
      ?.repositoryWritePerformed !==
        false ||
    r16
      ?.safety
      ?.authorizationArtifactCreated !==
        false ||
    r16
      ?.safety
      ?.externalSignerInvoked !==
        false ||
    r16
      ?.safety
      ?.privateKeyRead !==
        false ||
    r16
      ?.safety
      ?.productionKernelEnabled !==
        false ||
    r16
      ?.safety
      ?.authorizationGrantAuthority !==
        false
  ) {
    throw new Error(
      "value_comparison_replay_transaction_builder_r16_boundary_invalid"
    );
  }

  const noTransactionRequired =
    r16.verificationState ===
      "NO_SIGNATURE_REQUIRED_CURRENT_STATE";

  const awaitingAuthorization =
    r16.verificationState ===
      "AWAITING_EXTERNALLY_SIGNED_AUTHORIZATION_ARTIFACT";

  if (
    !noTransactionRequired &&
    !awaitingAuthorization
  ) {
    throw new Error(
      "value_comparison_replay_transaction_builder_r16_state_invalid"
    );
  }

  return {
    schema:
      "ai-matchlab.checkpoint-aware-value-comparison-replay-transaction-plan-builder-day.v1",

    mode:
      "READ_ONLY_SINGLE_USE_REPLAY_TRANSACTION_PLAN_BUILDER",

    dayKey:
      day,

    generatedAt,

    remoteHead:
      head,

    builderState:
      noTransactionRequired
        ? "NO_REPLAY_OR_TRANSACTION_REQUIRED_CURRENT_STATE"
        : "AWAITING_VERIFIED_EXTERNAL_AUTHORIZATION_FOR_TRANSACTION_PLAN",

    sourceR16State:
      r16.verificationState,

    proposedMutationCount:
      r16.proposedMutationCount,

    implementation: {
      replayKeyDerivationImplemented:
        true,

      replayKeyInputs: [
        "authorizationId",
        "nonce",
        "authorizationFingerprint"
      ],

      replayLedgerAdapterContractImplemented:
        true,

      replayConsumptionImplementedInThisRunner:
        false,

      transactionPlanBuilderImplemented:
        true,

      exactPreimageReverificationImplemented:
        true,

      exactPostimageHashAndSizeBindingImplemented:
        true,

      postimageBytesMaterializedInTransactionPlan:
        false,

      dedicatedKernelAdapterImplemented:
        false
    },

    nextRequiredGate:
      "DEDICATED_VALUE_COMPARISON_SOURCE_BOUND_POSTIMAGE_MATERIAL_RESOLVER_AND_KERNEL_ADAPTER_SANDBOX",

    safety: {
      repositoryWritePerformed:
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
      runCheckpointAwareValueComparisonReplayTransactionPlanBuilderDay({
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
              "unknown_value_comparison_replay_transaction_builder_error"
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
