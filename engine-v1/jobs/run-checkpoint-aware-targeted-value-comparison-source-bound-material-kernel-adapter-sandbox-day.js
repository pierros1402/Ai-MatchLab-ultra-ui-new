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
  buildCheckpointAwareValueComparisonSourceBoundMaterialResolution
} from "../core/checkpoint-aware-targeted-value-comparison-source-bound-material-kernel-adapter.js";

import {
  validateCheckpointAwareValueComparisonTransactionPlanArtifact
} from "../core/checkpoint-aware-targeted-value-comparison-replay-transaction-plan.js";

import {
  runCheckpointAwareValueComparisonReplayTransactionPlanBuilderDay
} from "./run-checkpoint-aware-targeted-value-comparison-replay-transaction-plan-builder-day.js";

import {
  buildValuePlanComparisonDay
} from "./build-value-plan-comparison-day.js";

import {
  buildValueComparisonCumulative
} from "./build-value-comparison-cumulative.js";

import {
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

function sha256Buffer(value) {
  return createHash(
    "sha256"
  )
    .update(
      value
    )
    .digest(
      "hex"
    );
}

function readJson(file) {
  return JSON.parse(
    fs.readFileSync(
      file,
      "utf8"
    )
  );
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

function normalizedFileBinding({
  file,
  ref,
  kind
}) {
  const raw =
    fs.readFileSync(
      file,
      "utf8"
    )
      .replaceAll(
        "\r\n",
        "\n"
      );

  const buffer =
    Buffer.from(
      raw,
      "utf8"
    );

  return {
    ref,
    kind,
    sha256:
      sha256Buffer(
        buffer
      ),
    bytes:
      buffer.length
  };
}

function binaryFileBinding({
  file,
  ref,
  kind
}) {
  const buffer =
    fs.readFileSync(
      file
    );

  return {
    ref,
    kind,
    sha256:
      sha256Buffer(
        buffer
      ),
    bytes:
      buffer.length
  };
}

export function rematerializeCheckpointAwareValueComparisonPostimagesFromBoundSources({
  transactionPlan,
  remoteHead
} = {}) {
  validateCheckpointAwareValueComparisonTransactionPlanArtifact(
    transactionPlan
  );

  const head =
    clean(
      remoteHead
    )
      .toLowerCase();

  if (
    !SHA_RE.test(
      head
    ) ||
    transactionPlan.bindings.remoteHead !==
      head
  ) {
    throw new Error(
      "value_comparison_source_bound_rematerialization_remote_head_mismatch"
    );
  }

  const day =
    transactionPlan.dayKey;

  const productionDir =
    resolveDataPath(
      "value-comparison"
    );

  const historicalExclusionsFile =
    path.join(
      productionDir,
      "historical-exclusions.json"
    );

  if (
    !fs.existsSync(
      historicalExclusionsFile
    )
  ) {
    throw new Error(
      "value_comparison_source_bound_rematerialization_historical_exclusions_missing"
    );
  }

  const tempRoot =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        "aiml-value-comparison-source-bound-material-"
      )
    );

  const candidateDir =
    path.join(
      tempRoot,
      "value-comparison"
    );

  let artifact =
    null;

  try {
    copyComparisonInputs({
      sourceDir:
        productionDir,
      targetDir:
        candidateDir
    });

    const dayFile =
      path.join(
        candidateDir,
        `${day}.json`
      );

    const cumulativeFile =
      path.join(
        candidateDir,
        "cumulative.json"
      );

    const dayResult =
      buildValuePlanComparisonDay(
        day,
        {
          write:
            true,
          output:
            dayFile
        }
      );

    if (
      dayResult?.ok !==
        true
    ) {
      throw new Error(
        `value_comparison_source_bound_day_builder_failed:${dayResult?.reason || "unknown"}`
      );
    }

    const cumulativeResult =
      buildValueComparisonCumulative({
        dir:
          candidateDir,

        output:
          cumulativeFile,

        historicalExclusionsFile,

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
        "value_comparison_source_bound_cumulative_builder_failed"
      );
    }

    const canonicalByPath =
      new Map([
        [
          `data/value-comparison/${day}.json`,
          canonicalCandidateBuffer({
            payload:
              readJson(
                dayFile
              ),
            kind:
              "day",
            dayKey:
              day
          })
        ],
        [
          "data/value-comparison/cumulative.json",
          canonicalCandidateBuffer({
            payload:
              readJson(
                cumulativeFile
              ),
            kind:
              "cumulative",
            dayKey:
              day
          })
        ]
      ]);

    const materials =
      transactionPlan.operations.map(
        operation => {
          const buffer =
            canonicalByPath.get(
              operation.targetPath
            );

          if (
            !buffer ||
            sha256Buffer(
              buffer
            ) !==
              operation.postimage.contentSha256 ||
            buffer.length !==
              operation.postimage.contentBytes
          ) {
            throw new Error(
              `value_comparison_source_bound_rematerialization_candidate_mismatch:${operation.targetPath}`
            );
          }

          return {
            targetPath:
              operation.targetPath,
            contentBuffer:
              buffer
          };
        }
      );

    const thisFile =
      fileURLToPath(
        import.meta.url
      );

    const producerBindings = [
      normalizedFileBinding({
        file:
          fileURLToPath(
            new URL(
              "./build-value-plan-comparison-day.js",
              import.meta.url
            )
          ),
        ref:
          "engine-v1/jobs/build-value-plan-comparison-day.js",
        kind:
          "SOURCE_CODE"
      }),

      normalizedFileBinding({
        file:
          fileURLToPath(
            new URL(
              "./build-value-comparison-cumulative.js",
              import.meta.url
            )
          ),
        ref:
          "engine-v1/jobs/build-value-comparison-cumulative.js",
        kind:
          "SOURCE_CODE"
      }),

      normalizedFileBinding({
        file:
          fileURLToPath(
            new URL(
              "./run-checkpoint-aware-targeted-value-comparison-repair-dry-run-day.js",
              import.meta.url
            )
          ),
        ref:
          "engine-v1/jobs/run-checkpoint-aware-targeted-value-comparison-repair-dry-run-day.js",
        kind:
          "SOURCE_CODE"
      }),

      normalizedFileBinding({
        file:
          thisFile,
        ref:
          "engine-v1/jobs/run-checkpoint-aware-targeted-value-comparison-source-bound-material-kernel-adapter-sandbox-day.js",
        kind:
          "SOURCE_CODE"
      }),

      binaryFileBinding({
        file:
          historicalExclusionsFile,
        ref:
          "data/value-comparison/historical-exclusions.json",
        kind:
          "DATA_INPUT"
      })
    ];

    artifact =
      buildCheckpointAwareValueComparisonSourceBoundMaterialResolution({
        transactionPlan,
        producerBindings,
        materials
      });
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
  }

  return artifact;
}

export function runCheckpointAwareValueComparisonSourceBoundMaterialKernelAdapterSandboxDay({
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
      "value_comparison_source_bound_kernel_sandbox_day_invalid"
    );
  }

  if (
    !SHA_RE.test(
      head
    )
  ) {
    throw new Error(
      "value_comparison_source_bound_kernel_sandbox_remote_head_invalid"
    );
  }

  const r17 =
    runCheckpointAwareValueComparisonReplayTransactionPlanBuilderDay({
      dayKey:
        day,
      remoteHead:
        head,
      generatedAt
    });

  if (
    r17
      ?.safety
      ?.repositoryWritePerformed !==
        false ||
    r17
      ?.safety
      ?.replayConsumptionPerformed !==
        false ||
    r17
      ?.safety
      ?.authorizationArtifactCreated !==
        false ||
    r17
      ?.safety
      ?.signerUse !==
        false ||
    r17
      ?.safety
      ?.privateKeyRead !==
        false ||
    r17
      ?.safety
      ?.productionKernelEnabled !==
        false ||
    r17
      ?.safety
      ?.repairExecutionAuthority !==
        false
  ) {
    throw new Error(
      "value_comparison_source_bound_kernel_sandbox_r17_boundary_invalid"
    );
  }

  const noTransaction =
    r17.builderState ===
      "NO_REPLAY_OR_TRANSACTION_REQUIRED_CURRENT_STATE";

  const awaitingVerifiedAuthorization =
    r17.builderState ===
      "AWAITING_VERIFIED_EXTERNAL_AUTHORIZATION_FOR_TRANSACTION_PLAN";

  if (
    !noTransaction &&
    !awaitingVerifiedAuthorization
  ) {
    throw new Error(
      "value_comparison_source_bound_kernel_sandbox_r17_state_invalid"
    );
  }

  return {
    schema:
      "ai-matchlab.checkpoint-aware-value-comparison-source-bound-material-kernel-adapter-sandbox-day.v1",

    mode:
      "SOURCE_BOUND_POSTIMAGE_MATERIAL_AND_KERNEL_ADAPTER_SANDBOX",

    dayKey:
      day,

    generatedAt,

    remoteHead:
      head,

    sandboxState:
      noTransaction
        ? "NO_MATERIAL_OR_KERNEL_SANDBOX_REQUIRED_CURRENT_STATE"
        : "AWAITING_VERIFIED_EXTERNAL_AUTHORIZATION_AND_TRANSACTION_PLAN",

    sourceR17State:
      r17.builderState,

    proposedMutationCount:
      r17.proposedMutationCount,

    implementation: {
      canonicalSourceBoundRematerializerImplemented:
        true,

      exactTransactionPlanPostimageHashSizeVerificationImplemented:
        true,

      producerCodeAndInputBindingsImplemented:
        true,

      dedicatedKernelAdapterSandboxImplemented:
        true,

      exactTwoTargetUniversePreserved:
        true,

      sandboxForwardAndRollbackDelegatesToR12VerifiedPrimitive:
        true,

      replayConsumptionImplementedInThisRunner:
        false,

      productionKernelAdapterImplemented:
        false,

      productionRepositoryTarget:
        false
    },

    nextRequiredGate:
      "DEDICATED_VALUE_COMPARISON_EXTERNAL_STATE_REPLAY_JOURNAL_AND_CRASH_RECOVERY_SANDBOX",

    safety: {
      repositoryWritePerformed:
        false,

      postimageMaterialResolvedThisRun:
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
      runCheckpointAwareValueComparisonSourceBoundMaterialKernelAdapterSandboxDay({
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
              "unknown_value_comparison_source_bound_kernel_sandbox_error"
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
