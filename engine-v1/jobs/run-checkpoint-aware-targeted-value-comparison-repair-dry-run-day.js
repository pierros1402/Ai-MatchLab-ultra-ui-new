import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createHash
} from "node:crypto";
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
  buildValuePlanComparisonDay
} from "./build-value-plan-comparison-day.js";

import {
  buildValueComparisonCumulative
} from "./build-value-comparison-cumulative.js";

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

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(
      stableValue
    );
  }

  if (
    value &&
    typeof value ===
      "object"
  ) {
    return Object.fromEntries(
      Object.keys(value)
        .filter(
          key =>
            key !==
              "generatedAt"
        )
        .sort()
        .map(
          key => [
            key,
            stableValue(
              value[key]
            )
          ]
        )
    );
  }

  return value;
}

function sha256Json(value) {
  return createHash(
    "sha256"
  )
    .update(
      JSON.stringify(
        stableValue(value)
      )
    )
    .digest(
      "hex"
    );
}

function sha256File(file) {
  if (
    !fs.existsSync(
      file
    )
  ) {
    return null;
  }

  return createHash(
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

function copyComparisonInputs({
  sourceDir,
  targetDir
}) {
  fs.mkdirSync(
    targetDir,
    {
      recursive:
        true
    }
  );

  for (
    const name of
      fs
        .readdirSync(
          sourceDir
        )
        .filter(
          name =>
            name.endsWith(
              ".json"
            ) &&
            name !==
              "cumulative.json"
        )
        .sort()
  ) {
    fs.copyFileSync(
      path.join(
        sourceDir,
        name
      ),
      path.join(
        targetDir,
        name
      )
    );
  }
}

export function runCheckpointAwareTargetedValueComparisonRepairDryRunDay({
  dayKey,
  remoteHead,
  generatedAt =
    new Date().toISOString()
} = {}) {
  const normalizedDay =
    String(
      dayKey || ""
    ).trim();

  const normalizedRemoteHead =
    String(
      remoteHead || ""
    )
      .trim()
      .toLowerCase();

  if (
    !DAY_RE.test(
      normalizedDay
    )
  ) {
    throw new Error(
      "value_comparison_repair_dry_run_day_invalid"
    );
  }

  if (
    !SHA_RE.test(
      normalizedRemoteHead
    )
  ) {
    throw new Error(
      "value_comparison_repair_dry_run_remote_head_invalid"
    );
  }

  const decision =
    buildCheckpointAwareTargetedRepairControllerDecision({
      dayKey:
        normalizedDay,
      generatedAt,
      expectedRemoteHead:
        normalizedRemoteHead,
      observedRemoteHead:
        normalizedRemoteHead,
      signals: [
        "value_plan_comparison_stale_against_canonical"
      ]
    });

  const contract =
    buildCheckpointAwareTargetedRepairExecutorContract({
      decision
    });

  const productionDir =
    resolveDataPath(
      "value-comparison"
    );

  const productionDayFile =
    path.join(
      productionDir,
      `${normalizedDay}.json`
    );

  const productionCumulativeFile =
    path.join(
      productionDir,
      "cumulative.json"
    );

  const tempRoot =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        "aiml-checkpoint-value-comparison-dry-run-"
      )
    );

  const tempComparisonDir =
    path.join(
      tempRoot,
      "value-comparison"
    );

  let report = null;

  try {
    copyComparisonInputs({
      sourceDir:
        productionDir,
      targetDir:
        tempComparisonDir
    });

    const candidateDayFile =
      path.join(
        tempComparisonDir,
        `${normalizedDay}.json`
      );

    const candidateCumulativeFile =
      path.join(
        tempComparisonDir,
        "cumulative.json"
      );

    const dayResult =
      buildValuePlanComparisonDay(
        normalizedDay,
        {
          write:
            true,
          output:
            candidateDayFile
        }
      );

    if (
      dayResult?.ok !==
        true
    ) {
      throw new Error(
        `value_comparison_repair_dry_run_day_builder_failed:${dayResult?.reason || "unknown"}`
      );
    }

    const cumulativeResult =
      buildValueComparisonCumulative({
        dir:
          tempComparisonDir,
        output:
          candidateCumulativeFile,
        requireHistoricalExclusions:
          true,
        requireImmutablePlanA:
          true
      });

    if (
      cumulativeResult?.ok !==
        true
    ) {
      throw new Error(
        "value_comparison_repair_dry_run_cumulative_builder_failed"
      );
    }

    const productionDay =
      readJsonSafe(
        productionDayFile
      );

    const candidateDay =
      readJsonSafe(
        candidateDayFile
      );

    const productionCumulative =
      readJsonSafe(
        productionCumulativeFile
      );

    const candidateCumulative =
      readJsonSafe(
        candidateCumulativeFile
      );

    report = {
      schema:
        "ai-matchlab.checkpoint-aware-targeted-value-comparison-repair-dry-run.v1",

      mode:
        "DRY_RUN_ONLY",

      dayKey:
        normalizedDay,

      generatedAt,

      remoteHead:
        normalizedRemoteHead,

      decision,

      executorContract:
        contract,

      candidate: {
        day: {
          productionPath:
            `data/value-comparison/${normalizedDay}.json`,
          candidateTempPath:
            candidateDayFile,
          productionRawSha256:
            sha256File(
              productionDayFile
            ),
          candidateRawSha256:
            sha256File(
              candidateDayFile
            ),
          productionSemanticSha256:
            productionDay
              ? sha256Json(
                  productionDay
                )
              : null,
          candidateSemanticSha256:
            candidateDay
              ? sha256Json(
                  candidateDay
                )
              : null,
          semanticChange:
            !productionDay ||
            sha256Json(
              productionDay
            ) !==
            sha256Json(
              candidateDay
            )
        },

        cumulative: {
          productionPath:
            "data/value-comparison/cumulative.json",
          candidateTempPath:
            candidateCumulativeFile,
          productionRawSha256:
            sha256File(
              productionCumulativeFile
            ),
          candidateRawSha256:
            sha256File(
              candidateCumulativeFile
            ),
          productionSemanticSha256:
            productionCumulative
              ? sha256Json(
                  productionCumulative
                )
              : null,
          candidateSemanticSha256:
            candidateCumulative
              ? sha256Json(
                  candidateCumulative
                )
              : null,
          semanticChange:
            !productionCumulative ||
            sha256Json(
              productionCumulative
            ) !==
            sha256Json(
              candidateCumulative
            )
        }
      },

      safety: {
        tempOnly:
          true,
        repositoryMutationAuthorized:
          false,
        repositoryWritePerformed:
          false,
        signerUse:
          false,
        commitPerformed:
          false,
        pushPerformed:
          false,
        deployPerformed:
          false,
        tempCleanupPerformed:
          false
      }
    };
  }
  finally {
    fs.rmSync(
      tempRoot,
      {
        recursive:
          true,
        force:
          true
      }
    );

    if (report) {
      report.safety.tempCleanupPerformed =
        !fs.existsSync(
          tempRoot
        );
    }
  }

  return report;
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

if (isCli) {
  const dayKey =
    parseArg(
      "date"
    );

  const remoteHead =
    parseArg(
      "remote-head"
    );

  try {
    const result =
      runCheckpointAwareTargetedValueComparisonRepairDryRunDay({
        dayKey,
        remoteHead
      });

    console.log(
      JSON.stringify(
        result,
        null,
        2
      )
    );
  }
  catch (error) {
    console.error(
      JSON.stringify(
        {
          ok:
            false,
          reason:
            String(
              error?.message ||
              error ||
              "unknown_value_comparison_repair_dry_run_error"
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
