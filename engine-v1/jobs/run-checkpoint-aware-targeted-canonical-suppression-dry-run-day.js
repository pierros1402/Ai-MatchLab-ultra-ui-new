import path from "node:path";
import {
  fileURLToPath
} from "node:url";

import {
  buildCheckpointAwareTargetedRepairControllerDecision
} from "../core/checkpoint-aware-targeted-repair-controller.js";

import {
  buildCheckpointAwareTargetedRepairExecutorContract
} from "../core/checkpoint-aware-targeted-repair-executor-contract.js";

import {
  classifyCheckpointAwareCanonicalSuppressionPlan
} from "../core/checkpoint-aware-targeted-canonical-suppression-plan.js";

import {
  getProductionIdentityResolverRuntime
} from "../core/production-identity-resolver-runtime.js";

import {
  observeCanonicalSuppressedAliasForShadow
} from "./run-checkpoint-aware-targeted-repair-shadow-day.js";

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

const SHA_RE =
  /^[0-9a-f]{40}$/u;

export function runCheckpointAwareTargetedCanonicalSuppressionDryRunDay({
  dayKey,
  remoteHead,
  generatedAt =
    new Date().toISOString()
} = {}) {
  const day =
    String(
      dayKey || ""
    ).trim();

  const head =
    String(
      remoteHead || ""
    )
      .trim()
      .toLowerCase();

  if (
    !DAY_RE.test(
      day
    )
  ) {
    throw new Error(
      "canonical_suppression_dry_run_day_invalid"
    );
  }

  if (
    !SHA_RE.test(
      head
    )
  ) {
    throw new Error(
      "canonical_suppression_dry_run_remote_head_invalid"
    );
  }

  const observation =
    observeCanonicalSuppressedAliasForShadow({
      dayKey:
        day
    });

  let runtime =
    null;

  if (
    observation
      ?.observationAvailable ===
        true &&
    !observation
      ?.readError &&
    Number(
      observation
        ?.postGateSuppressedAliasCount ||
      0
    ) >
      0
  ) {
    runtime =
      getProductionIdentityResolverRuntime();
  }

  const plan =
    classifyCheckpointAwareCanonicalSuppressionPlan({
      dayKey:
        day,

      observation,

      resolver:
        runtime?.resolver ||
        null
    });

  let decision =
    null;

  let executorContract =
    null;

  if (
    plan.planState ===
      "EXACT_SUPPRESSION_PROJECTION_PLAN"
  ) {
    decision =
      buildCheckpointAwareTargetedRepairControllerDecision({
        dayKey:
          day,

        generatedAt,

        expectedRemoteHead:
          head,

        observedRemoteHead:
          head,

        signals: [
          "canonical_suppressed_alias_present"
        ]
      });

    executorContract =
      buildCheckpointAwareTargetedRepairExecutorContract({
        decision
      });
  }

  return {
    schema:
      "ai-matchlab.checkpoint-aware-targeted-canonical-suppression-dry-run.v1",

    mode:
      "DRY_RUN_ONLY",

    dayKey:
      day,

    generatedAt,

    remoteHead:
      head,

    observationState:
      plan.planState,

    observation,

    plan,

    sourceDecision:
      decision,

    executorContract,

    resolverRuntime:
      runtime
        ? {
            schema:
              runtime.schema ||
              null,

            readOnly:
              runtime.readOnly ===
                true,

            hashes:
              runtime.hashes ||
              null,

            counts:
              runtime.counts ||
              null,

            effectiveCounts:
              runtime.effectiveCounts ||
              null,

            authorization:
              runtime.authorization ||
              null
          }
        : null,

    safety: {
      repositoryWritePerformed:
        false,

      canonicalFixtureMutationPerformed:
        false,

      resolverLedgerMutationPerformed:
        false,

      historyMutationPerformed:
        false,

      workflowDispatchPerformed:
        false,

      signerUse:
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

function parseArg(
  name
) {
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
      runCheckpointAwareTargetedCanonicalSuppressionDryRunDay({
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

    if (
      result
        .observationState ===
          "FAIL_CLOSED_IDENTITY_STATE"
    ) {
      process.exitCode =
        2;
    }
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
              "unknown_canonical_suppression_dry_run_error"
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
