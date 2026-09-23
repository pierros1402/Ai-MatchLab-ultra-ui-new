import fs from "node:fs";
import path from "node:path";
import {
  fileURLToPath
} from "node:url";

import {
  resolveDataPath
} from "../storage/data-root.js";

import {
  buildCheckpointAwareTargetedRepairControllerDecision
} from "../core/checkpoint-aware-targeted-repair-controller.js";

import {
  buildCheckpointAwareTargetedRepairExecutorContract
} from "../core/checkpoint-aware-targeted-repair-executor-contract.js";

import {
  buildCheckpointAwareTargetedDetailsOrphanCleanupPlan
} from "../core/checkpoint-aware-targeted-details-orphan-cleanup-plan.js";

import {
  verifyDetailsValueMirrorDay
} from "./verify-details-value-mirror-day.js";

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

const SHA_RE =
  /^[0-9a-f]{40}$/u;

function readJsonSafe(
  file,
  fallback = null
) {
  try {
    return JSON.parse(
      fs.readFileSync(
        file,
        "utf8"
      )
    );
  }
  catch {
    return fallback;
  }
}

function safeBaseResult({
  dayKey,
  remoteHead,
  observationState,
  reason
}) {
  return {
    schema:
      "ai-matchlab.checkpoint-aware-targeted-details-orphan-dry-run.v1",

    mode:
      "DRY_RUN_ONLY",

    dayKey,

    remoteHead,

    observationState,

    reason:
      reason || null,

    sourceDecision:
      null,

    executorContract:
      null,

    plan:
      null,

    safety: {
      repositoryWritePerformed:
        false,

      fileDeletionPerformed:
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

export function runCheckpointAwareTargetedDetailsOrphanCleanupDryRunDay({
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
      "details_orphan_dry_run_day_invalid"
    );
  }

  if (
    !SHA_RE.test(
      head
    )
  ) {
    throw new Error(
      "details_orphan_dry_run_remote_head_invalid"
    );
  }

  const sourceDir =
    resolveDataPath(
      "details",
      day
    );

  if (
    !fs.existsSync(
      sourceDir
    )
  ) {
    return safeBaseResult({
      dayKey:
        day,

      remoteHead:
        head,

      observationState:
        "SOURCE_TREE_UNAVAILABLE_NO_ACTION",

      reason:
        "source_details_tree_unavailable_outside_daily_context"
    });
  }

  const mirror =
    verifyDetailsValueMirrorDay(
      day
    );

  if (
    mirror.ok ===
      true
  ) {
    return safeBaseResult({
      dayKey:
        day,

      remoteHead:
        head,

      observationState:
        "NO_REPAIR_REQUIRED",

      reason:
        "details_value_mirror_already_clean"
    });
  }

  const violations =
    Array.isArray(
      mirror.violations
    )
      ? mirror.violations
      : [];

  const extraViolations =
    violations.filter(
      row =>
        String(
          row?.code || ""
        ) ===
          "source_detail_extra_file"
    );

  if (
    extraViolations.length ===
      0
  ) {
    return {
      ...safeBaseResult({
        dayKey:
          day,

        remoteHead:
          head,

        observationState:
          "FAIL_CLOSED_MIRROR_STATE",

        reason:
          "exact_source_extra_route_not_present"
      }),

      mirror
    };
  }

  const decision =
    buildCheckpointAwareTargetedRepairControllerDecision({
      dayKey:
        day,

      generatedAt,

      expectedRemoteHead:
        head,

      observedRemoteHead:
        head,

      signals:
        extraViolations.map(
          row => ({
            code:
              "details_value_mirror_violation",

            details: {
              violationCode:
                row.code
            }
          })
        )
    });

  const executorContract =
    buildCheckpointAwareTargetedRepairExecutorContract({
      decision
    });

  const fixturePayload =
    readJsonSafe(
      resolveDataPath(
        "deploy-snapshots",
        day,
        "fixtures.json"
      ),
      null
    );

  const fixtures =
    Array.isArray(
      fixturePayload?.fixtures
    )
      ? fixturePayload.fixtures
      : [];

  const plan =
    buildCheckpointAwareTargetedDetailsOrphanCleanupPlan({
      dayKey:
        day,

      sourceDir,

      fixtures,

      mirrorReport:
        mirror
    });

  return {
    schema:
      "ai-matchlab.checkpoint-aware-targeted-details-orphan-dry-run.v1",

    mode:
      "DRY_RUN_ONLY",

    dayKey:
      day,

    generatedAt,

    remoteHead:
      head,

    observationState:
      plan.planState,

    sourceDecision:
      decision,

    executorContract,

    plan,

    mirrorSummary: {
      ok:
        mirror.ok ===
          true,

      authority:
        mirror.authority ||
        null,

      violationCodes:
        [
          ...new Set(
            violations.map(
              row =>
                String(
                  row?.code || ""
                )
            )
          )
        ]
          .sort()
    },

    safety: {
      repositoryWritePerformed:
        false,

      fileDeletionPerformed:
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
      runCheckpointAwareTargetedDetailsOrphanCleanupDryRunDay({
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
      String(
        result
          ?.observationState ||
        ""
      )
        .startsWith(
          "FAIL_CLOSED"
        )
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
              "unknown_details_orphan_dry_run_error"
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
