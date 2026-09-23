import crypto from "node:crypto";
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
  classifyCheckpointAwareFreshnessCoverageReadinessPlan
} from "../core/checkpoint-aware-targeted-freshness-coverage-readiness-plan.js";

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

const SHA_RE =
  /^[0-9a-f]{40}$/u;

function readJsonState(
  file
) {
  if (
    !fs.existsSync(
      file
    )
  ) {
    return {
      exists:
        false,
      payload:
        null,
      error:
        null
    };
  }

  try {
    return {
      exists:
        true,

      payload:
        JSON.parse(
          fs.readFileSync(
            file,
            "utf8"
          )
        ),

      error:
        null
    };
  }
  catch (
    error
  ) {
    return {
      exists:
        true,
      payload:
        null,
      error:
        String(
          error?.message ||
          error
        )
    };
  }
}

function sha256File(
  file
) {
  if (
    !fs.existsSync(
      file
    )
  ) {
    return null;
  }

  return crypto
    .createHash(
      "sha256"
    )
    .update(
      fs.readFileSync(
        file
      )
    )
    .digest(
      "hex"
    );
}

function snapshotPreservationEvidence(
  dayKey
) {
  const root =
    resolveDataPath(
      "deploy-snapshots",
      dayKey
    );

  const detailsDir =
    path.join(
      root,
      "details"
    );

  const detailFiles =
    fs.existsSync(
      detailsDir
    )
      ? fs
          .readdirSync(
            detailsDir
          )
          .filter(
            name =>
              name.endsWith(
                ".json"
              )
          )
          .sort()
      : [];

  return {
    manifestSha256:
      sha256File(
        path.join(
          root,
          "manifest.json"
        )
      ),

    valueSha256:
      sha256File(
        path.join(
          root,
          "value.json"
        )
      ),

    valueAuditSha256:
      sha256File(
        path.join(
          root,
          "value-audit.json"
        )
      ),

    detailCount:
      detailFiles.length,

    details:
      detailFiles.map(
        file => ({
          file,

          sha256:
            sha256File(
              path.join(
                detailsDir,
                file
              )
            )
        })
      )
  };
}

export function runCheckpointAwareFreshnessCoverageReadinessDryRunDay({
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
      "freshness_coverage_dry_run_day_invalid"
    );
  }

  if (
    !SHA_RE.test(
      head
    )
  ) {
    throw new Error(
      "freshness_coverage_dry_run_remote_head_invalid"
    );
  }

  const freshnessFile =
    resolveDataPath(
      "deploy-snapshots",
      day,
      "freshness-report.json"
    );

  const state =
    readJsonState(
      freshnessFile
    );

  const plan =
    classifyCheckpointAwareFreshnessCoverageReadinessPlan({
      dayKey:
        day,

      freshness:
        state.payload
    });

  let decision =
    null;

  let executorContract =
    null;

  if (
    plan.planState ===
      "EXACT_COVERAGE_READINESS_REPAIR_PLAN"
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
          "snapshot_stale_against_coverage_readiness"
        ]
      });

    executorContract =
      buildCheckpointAwareTargetedRepairExecutorContract({
        decision
      });
  }

  return {
    schema:
      "ai-matchlab.checkpoint-aware-targeted-freshness-coverage-readiness-dry-run.v1",

    mode:
      "DRY_RUN_ONLY",

    dayKey:
      day,

    generatedAt,

    remoteHead:
      head,

    sourceFreshness: {
      path:
        `data/deploy-snapshots/${day}/freshness-report.json`,

      exists:
        state.exists,

      parseError:
        state.error,

      ok:
        state.payload?.ok ===
          true,

      reasons:
        Array.isArray(
          state
            .payload
            ?.reasons
        )
          ? state
              .payload
              .reasons
          : []
    },

    observationState:
      plan.planState,

    plan,

    sourceDecision:
      decision,

    executorContract,

    preservationEvidence:
      snapshotPreservationEvidence(
        day
      ),

    safety: {
      repositoryWritePerformed:
        false,

      coverageReadinessWritePerformed:
        false,

      manifestWritePerformed:
        false,

      freshnessReportWritePerformed:
        false,

      detailsWritePerformed:
        false,

      valueWritePerformed:
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
      runCheckpointAwareFreshnessCoverageReadinessDryRunDay({
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
          "FAIL_CLOSED_FRESHNESS_STATE"
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
              "unknown_freshness_coverage_dry_run_error"
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
