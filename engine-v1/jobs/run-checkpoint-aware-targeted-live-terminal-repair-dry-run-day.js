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
  classifyCheckpointAwareTargetedLiveTerminalRepairPlan
} from "../core/checkpoint-aware-targeted-live-terminal-repair-plan.js";

import {
  canonicalFixturesForDay,
  fixturesForSnapshotDay
} from "../core/day-fixture-universe.js";

import {
  buildDayReport
} from "./build-day-report.js";

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

const SHA_RE =
  /^[0-9a-f]{40}$/u;

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

export function runCheckpointAwareTargetedLiveTerminalRepairDryRunDay({
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
      "live_terminal_dry_run_day_invalid"
    );
  }

  if (
    !SHA_RE.test(
      head
    )
  ) {
    throw new Error(
      "live_terminal_dry_run_remote_head_invalid"
    );
  }

  const now =
    new Date(
      generatedAt
    );

  if (
    Number.isNaN(
      now.getTime()
    )
  ) {
    throw new Error(
      "live_terminal_dry_run_generated_at_invalid"
    );
  }

  const currentReport =
    buildDayReport(
      day,
      {
        now
      }
    );

  const completeness =
    currentReport
      ?.liveStatusCompleteness ||
    null;

  const canonicalRows =
    canonicalFixturesForDay(
      day
    );

  const overlayUniverse =
    fixturesForSnapshotDay(
      day
    );

  const evidenceRows =
    Array.isArray(
      overlayUniverse
        ?.fixtures
    )
      ? overlayUniverse
          .fixtures
      : [];

  const plan =
    classifyCheckpointAwareTargetedLiveTerminalRepairPlan({
      dayKey:
        day,

      completeness,

      canonicalRows,

      evidenceRows
    });

  let decision =
    null;

  let executorContract =
    null;

  const staleRows =
    Array.isArray(
      completeness
        ?.staleOpenFixtures
    )
      ? completeness
          .staleOpenFixtures
      : [];

  if (
    staleRows.length >
      0 &&
    plan.planState !==
      "FAIL_CLOSED_LIVE_STATUS_STATE"
  ) {
    const providerIds =
      staleRows
        .map(
          row =>
            clean(
              row?.providerId
            )
        )
        .filter(Boolean)
        .sort();

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
          `live_status_stale_open_exact_provider_ids:${providerIds.join(",")}`
        ]
      });

    executorContract =
      buildCheckpointAwareTargetedRepairExecutorContract({
        decision
      });
  }

  return {
    schema:
      "ai-matchlab.checkpoint-aware-targeted-live-terminal-repair-dry-run.v1",

    mode:
      "DRY_RUN_ONLY",

    dayKey:
      day,

    generatedAt,

    remoteHead:
      head,

    observationState:
      plan.planState,

    sourceCompleteness: {
      schema:
        completeness
          ?.schema ||
        null,

      ok:
        completeness
          ?.ok ===
            true,

      staleOpenCount:
        Number(
          completeness
            ?.staleOpenCount ||
          0
        ),

      staleOpenCanonicalIds:
        Array.isArray(
          completeness
            ?.staleOpenCanonicalIds
        )
          ? completeness
              .staleOpenCanonicalIds
          : [],

      staleOpenProviderIds:
        staleRows
          .map(
            row =>
              clean(
                row?.providerId
              )
          )
          .filter(Boolean)
          .sort(),

      heuristicFinalPromotion:
        completeness
          ?.policy
          ?.heuristicFinalPromotion ===
            true
    },

    persistedEvidence: {
      canonicalFixtureCount:
        canonicalRows.length,

      overlayFixtureCount:
        evidenceRows.length,

      overlaySource:
        overlayUniverse
          ?.source ||
        null
    },

    plan,

    sourceDecision:
      decision,

    executorContract,

    safety: {
      repositoryWritePerformed:
        false,

      canonicalFixtureMutationPerformed:
        false,

      runtimeFixtureMutationPerformed:
        false,

      snapshotMutationPerformed:
        false,

      providerNetworkFetchPerformed:
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
      runCheckpointAwareTargetedLiveTerminalRepairDryRunDay({
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
          "FAIL_CLOSED_LIVE_STATUS_STATE"
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
              "unknown_live_terminal_dry_run_error"
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
