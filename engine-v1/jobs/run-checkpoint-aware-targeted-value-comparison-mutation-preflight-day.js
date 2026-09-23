import {
  createHash
} from "node:crypto";
import fs from "node:fs";
import os from "node:os";
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
  buildCheckpointAwareValueComparisonMutationPreflight
} from "../core/checkpoint-aware-targeted-value-comparison-mutation-preflight.js";

import {
  inspectAutonomousRepairProductionExecutionReadiness
} from "../core/autonomous-repair-production-execution-entrypoint.js";

import {
  buildValuePlanComparisonDay
} from "./build-value-plan-comparison-day.js";

import {
  buildValueComparisonCumulative
} from "./build-value-comparison-cumulative.js";

import {
  compareValueComparisonRepairCandidateSemantics,
  normalizeValueComparisonRepairSemanticPayload
} from "./run-checkpoint-aware-targeted-value-comparison-repair-dry-run-day.js";

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

const SHA_RE =
  /^[0-9a-f]{40}$/u;

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

function readJson(
  file
) {
  return JSON.parse(
    fs.readFileSync(
      file,
      "utf8"
    )
  );
}

function sha256Buffer(
  buffer
) {
  return createHash(
    "sha256"
  )
    .update(
      buffer
    )
    .digest(
      "hex"
    );
}

function fileIdentity(
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
      sha256:
        null,
      bytes:
        0
    };
  }

  const buffer =
    fs.readFileSync(
      file
    );

  return {
    exists:
      true,

    sha256:
      sha256Buffer(
        buffer
      ),

    bytes:
      buffer.length
  };
}

function canonicalCandidateBuffer({
  payload,
  kind,
  dayKey
}) {
  const normalized =
    normalizeValueComparisonRepairSemanticPayload({
      payload,
      kind,
      dayKey
    });

  return Buffer.from(
    JSON.stringify(
      normalized,
      null,
      2
    ) + "\n",
    "utf8"
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

export function runCheckpointAwareValueComparisonMutationPreflightDay({
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
      "value_comparison_mutation_preflight_day_invalid"
    );
  }

  if (
    !SHA_RE.test(
      head
    )
  ) {
    throw new Error(
      "value_comparison_mutation_preflight_remote_head_invalid"
    );
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

      signals: [
        "value_plan_comparison_stale_against_canonical"
      ]
    });

  const executorContract =
    buildCheckpointAwareTargetedRepairExecutorContract({
      decision
    });

  const productionExecutionReadiness =
    inspectAutonomousRepairProductionExecutionReadiness();

  const productionDir =
    resolveDataPath(
      "value-comparison"
    );

  const productionDayFile =
    path.join(
      productionDir,
      `${day}.json`
    );

  const productionCumulativeFile =
    path.join(
      productionDir,
      "cumulative.json"
    );

  const productionDayIdentity =
    fileIdentity(
      productionDayFile
    );

  const productionCumulativeIdentity =
    fileIdentity(
      productionCumulativeFile
    );

  if (
    !productionDayIdentity
      .exists ||
    !productionCumulativeIdentity
      .exists
  ) {
    throw new Error(
      "value_comparison_mutation_preflight_existing_targets_required"
    );
  }

  const tempRoot =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        "aiml-checkpoint-value-comparison-mutation-preflight-"
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
        `${day}.json`
      );

    const candidateCumulativeFile =
      path.join(
        tempComparisonDir,
        "cumulative.json"
      );

    const dayResult =
      buildValuePlanComparisonDay(
        day,
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
        `value_comparison_mutation_preflight_day_builder_failed:${dayResult?.reason || "unknown"}`
      );
    }

    const cumulativeResult =
      buildValueComparisonCumulative({
        dir:
          tempComparisonDir,

        output:
          candidateCumulativeFile,

        historicalExclusionsFile:
          path.join(
            productionDir,
            "historical-exclusions.json"
          ),

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
        "value_comparison_mutation_preflight_cumulative_builder_failed"
      );
    }

    const productionDay =
      readJson(
        productionDayFile
      );

    const productionCumulative =
      readJson(
        productionCumulativeFile
      );

    const candidateDayTemp =
      readJson(
        candidateDayFile
      );

    const candidateCumulativeTemp =
      readJson(
        candidateCumulativeFile
      );

    const daySemantic =
      compareValueComparisonRepairCandidateSemantics({
        production:
          productionDay,

        candidate:
          candidateDayTemp,

        kind:
          "day",

        dayKey:
          day
      });

    const cumulativeSemantic =
      compareValueComparisonRepairCandidateSemantics({
        production:
          productionCumulative,

        candidate:
          candidateCumulativeTemp,

        kind:
          "cumulative",

        dayKey:
          day
      });

    const candidateDayBuffer =
      canonicalCandidateBuffer({
        payload:
          candidateDayTemp,

        kind:
          "day",

        dayKey:
          day
      });

    const candidateCumulativeBuffer =
      canonicalCandidateBuffer({
        payload:
          candidateCumulativeTemp,

        kind:
          "cumulative",

        dayKey:
          day
      });

    const preflight =
      buildCheckpointAwareValueComparisonMutationPreflight({
        dayKey:
          day,

        remoteHead:
          head,

        decision,

        executorContract,

        productionExecutionReadiness,

        targets: [
          {
            targetPath:
              `data/value-comparison/${day}.json`,

            targetExists:
              true,

            preimageSha256:
              productionDayIdentity
                .sha256,

            preimageBytes:
              productionDayIdentity
                .bytes,

            candidateMaterialSha256:
              sha256Buffer(
                candidateDayBuffer
              ),

            candidateMaterialBytes:
              candidateDayBuffer
                .length,

            semanticChange:
              daySemantic
                .semanticChange,

            semanticDiffPaths:
              daySemantic
                .semanticDiffPaths
          },

          {
            targetPath:
              "data/value-comparison/cumulative.json",

            targetExists:
              true,

            preimageSha256:
              productionCumulativeIdentity
                .sha256,

            preimageBytes:
              productionCumulativeIdentity
                .bytes,

            candidateMaterialSha256:
              sha256Buffer(
                candidateCumulativeBuffer
              ),

            candidateMaterialBytes:
              candidateCumulativeBuffer
                .length,

            semanticChange:
              cumulativeSemantic
                .semanticChange,

            semanticDiffPaths:
              cumulativeSemantic
                .semanticDiffPaths
          }
        ]
      });

    report = {
      schema:
        "ai-matchlab.checkpoint-aware-value-comparison-mutation-preflight-day.v1",

      mode:
        "MUTATION_PREFLIGHT_ONLY",

      dayKey:
        day,

      generatedAt,

      remoteHead:
        head,

      preflight,

      candidateMaterial: {
        ephemeral:
          true,

        retainedAfterRun:
          false,

        exactBytesAuthorityBound:
          false,

        daySemanticChange:
          daySemantic
            .semanticChange,

        daySemanticDiffPaths:
          daySemantic
            .semanticDiffPaths,

        cumulativeSemanticChange:
          cumulativeSemantic
            .semanticChange,

        cumulativeSemanticDiffPaths:
          cumulativeSemantic
            .semanticDiffPaths
      },

      safety: {
        tempOnly:
          true,

        repositoryWritePerformed:
          false,

        authorizationArtifactCreated:
          false,

        signerUse:
          false,

        productionKernelInvoked:
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
      report
        .safety
        .tempCleanupPerformed =
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

if (
  isCli
) {
  try {
    const result =
      runCheckpointAwareValueComparisonMutationPreflightDay({
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
              "unknown_value_comparison_mutation_preflight_error"
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
