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
  simulateCheckpointAwareValueComparisonSandboxTransaction
} from "../core/checkpoint-aware-targeted-value-comparison-sandbox-transaction.js";

import {
  buildValuePlanComparisonDay
} from "./build-value-plan-comparison-day.js";

import {
  buildValueComparisonCumulative
} from "./build-value-comparison-cumulative.js";

import {
  compareValueComparisonRepairCandidateSemantics
} from "./run-checkpoint-aware-targeted-value-comparison-repair-dry-run-day.js";

import {
  runCheckpointAwareValueComparisonMutationPreflightDay
} from "./run-checkpoint-aware-targeted-value-comparison-mutation-preflight-day.js";

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

const SHA_RE =
  /^[0-9a-f]{40}$/u;

function clean(value) {
  return String(
    value ?? ""
  ).trim();
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

function fileIdentity(
  file
) {
  const buffer =
    fs.readFileSync(
      file
    );

  return {
    sha256:
      sha256Buffer(
        buffer
      ),
    bytes:
      buffer.length
  };
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

function sameStringSet(
  left,
  right
) {
  return (
    JSON.stringify(
      [
        ...new Set(
          left
        )
      ]
        .sort()
    ) ===
    JSON.stringify(
      [
        ...new Set(
          right
        )
      ]
        .sort()
    )
  );
}

export function runCheckpointAwareValueComparisonSandboxSimulationDay({
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
      "value_comparison_sandbox_simulation_day_invalid"
    );
  }

  if (
    !SHA_RE.test(
      head
    )
  ) {
    throw new Error(
      "value_comparison_sandbox_simulation_remote_head_invalid"
    );
  }

  const preflightReport =
    runCheckpointAwareValueComparisonMutationPreflightDay({
      dayKey:
        day,
      remoteHead:
        head,
      generatedAt
    });

  const preflight =
    preflightReport
      .preflight;

  if (
    preflight
      ?.preflightState ===
        "NO_MUTATION_REQUIRED"
  ) {
    return {
      schema:
        "ai-matchlab.checkpoint-aware-value-comparison-sandbox-simulation-day.v1",

      mode:
        "ISOLATED_SANDBOX_TRANSACTION_SIMULATION",

      dayKey:
        day,

      generatedAt,

      remoteHead:
        head,

      simulationState:
        "NO_TRANSACTION_REQUIRED",

      sourcePreflightFingerprint:
        preflight
          .preflightFingerprint,

      sourcePreflightState:
        preflight
          .preflightState,

      proposedMutationCount:
        0,

      productionRepositoryTarget:
        false,

      simulation:
        null,

      safety: {
        repositoryWritePerformed:
          false,

        authorizationArtifactCreated:
          false,

        signerUse:
          false,

        productionKernelInvoked:
          false,

        productionKernelEnabled:
          false,

        commitPerformed:
          false,

        pushPerformed:
          false,

        deployPerformed:
          false,

        tempCleanupPerformed:
          true
      }
    };
  }

  if (
    preflight
      ?.preflightState !==
        "MUTATION_CANDIDATE_READY"
  ) {
    throw new Error(
      "value_comparison_sandbox_simulation_preflight_state_invalid"
    );
  }

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

  const preMaterializationIdentity = {
    day:
      fileIdentity(
        productionDayFile
      ),

    cumulative:
      fileIdentity(
        productionCumulativeFile
      )
  };

  const preflightByPath =
    new Map(
      preflight
        .targets
        .map(
          target => [
            target.targetPath,
            target
          ]
        )
    );

  if (
    preMaterializationIdentity
      .day
      .sha256 !==
        preflightByPath
          .get(
            `data/value-comparison/${day}.json`
          )
          ?.preimage
          ?.sha256 ||
    preMaterializationIdentity
      .cumulative
      .sha256 !==
        preflightByPath
          .get(
            "data/value-comparison/cumulative.json"
          )
          ?.preimage
          ?.sha256
  ) {
    throw new Error(
      "value_comparison_sandbox_simulation_preimage_drift_after_preflight"
    );
  }

  const tempRoot =
    fs.mkdtempSync(
      path.join(
        os.tmpdir(),
        "aiml-value-comparison-sandbox-simulation-"
      )
    );

  const candidateDir =
    path.join(
      tempRoot,
      "candidate-value-comparison"
    );

  const sandboxRoot =
    path.join(
      tempRoot,
      "isolated-transaction-project"
    );

  let report =
    null;

  try {
    copyComparisonInputs({
      sourceDir:
        productionDir,
      targetDir:
        candidateDir
    });

    const candidateDayFile =
      path.join(
        candidateDir,
        `${day}.json`
      );

    const candidateCumulativeFile =
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
            candidateDayFile
        }
      );

    if (
      dayResult?.ok !==
        true
    ) {
      throw new Error(
        `value_comparison_sandbox_simulation_day_builder_failed:${dayResult?.reason || "unknown"}`
      );
    }

    const cumulativeResult =
      buildValueComparisonCumulative({
        dir:
          candidateDir,

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
        "value_comparison_sandbox_simulation_cumulative_builder_failed"
      );
    }

    const productionDayBuffer =
      fs.readFileSync(
        productionDayFile
      );

    const productionCumulativeBuffer =
      fs.readFileSync(
        productionCumulativeFile
      );

    const candidateDayBuffer =
      fs.readFileSync(
        candidateDayFile
      );

    const candidateCumulativeBuffer =
      fs.readFileSync(
        candidateCumulativeFile
      );

    const daySemantic =
      compareValueComparisonRepairCandidateSemantics({
        production:
          readJson(
            productionDayFile
          ),

        candidate:
          readJson(
            candidateDayFile
          ),

        kind:
          "day",

        dayKey:
          day
      });

    const cumulativeSemantic =
      compareValueComparisonRepairCandidateSemantics({
        production:
          readJson(
            productionCumulativeFile
          ),

        candidate:
          readJson(
            candidateCumulativeFile
          ),

        kind:
          "cumulative",

        dayKey:
          day
      });

    const rematerializedMutationPaths = [
      daySemantic
        .semanticChange
        ? `data/value-comparison/${day}.json`
        : null,

      cumulativeSemantic
        .semanticChange
        ? "data/value-comparison/cumulative.json"
        : null
    ]
      .filter(Boolean);

    const preflightMutationPaths =
      preflight
        .operations
        .map(
          row =>
            row.targetPath
        );

    if (
      !sameStringSet(
        rematerializedMutationPaths,
        preflightMutationPaths
      )
    ) {
      throw new Error(
        "value_comparison_sandbox_simulation_semantic_scope_changed_after_preflight"
      );
    }

    const simulation =
      simulateCheckpointAwareValueComparisonSandboxTransaction({
        dayKey:
          day,

        sandboxRoot,

        targets: [
          {
            targetPath:
              `data/value-comparison/${day}.json`,

            proposedMutation:
              daySemantic
                .semanticChange,

            preimageBuffer:
              productionDayBuffer,

            postimageBuffer:
              candidateDayBuffer,

            expectedPreimageSha256:
              preMaterializationIdentity
                .day
                .sha256,

            expectedPostimageSha256:
              sha256Buffer(
                candidateDayBuffer
              )
          },

          {
            targetPath:
              "data/value-comparison/cumulative.json",

            proposedMutation:
              cumulativeSemantic
                .semanticChange,

            preimageBuffer:
              productionCumulativeBuffer,

            postimageBuffer:
              candidateCumulativeBuffer,

            expectedPreimageSha256:
              preMaterializationIdentity
                .cumulative
                .sha256,

            expectedPostimageSha256:
              sha256Buffer(
                candidateCumulativeBuffer
              )
          }
        ]
      });

    if (
      simulation.simulationState !==
        "SIMULATED_AND_ROLLED_BACK" ||
      simulation.rollbackVerified !==
        true
    ) {
      throw new Error(
        "value_comparison_sandbox_simulation_transaction_not_rolled_back"
      );
    }

    const postSimulationIdentity = {
      day:
        fileIdentity(
          productionDayFile
        ),

      cumulative:
        fileIdentity(
          productionCumulativeFile
        )
    };

    if (
      postSimulationIdentity
        .day
        .sha256 !==
          preMaterializationIdentity
            .day
            .sha256 ||
      postSimulationIdentity
        .cumulative
        .sha256 !==
          preMaterializationIdentity
            .cumulative
            .sha256
    ) {
      throw new Error(
        "value_comparison_sandbox_simulation_production_repository_drift"
      );
    }

    report = {
      schema:
        "ai-matchlab.checkpoint-aware-value-comparison-sandbox-simulation-day.v1",

      mode:
        "ISOLATED_SANDBOX_TRANSACTION_SIMULATION",

      dayKey:
        day,

      generatedAt,

      remoteHead:
        head,

      simulationState:
        "SIMULATED_AND_ROLLED_BACK",

      sourcePreflightFingerprint:
        preflight
          .preflightFingerprint,

      sourcePreflightState:
        preflight
          .preflightState,

      proposedMutationCount:
        preflight
          .summary
          .proposedMutationCount,

      productionRepositoryTarget:
        false,

      rematerialization: {
        exactCandidateBytesBoundWithinAttempt:
          true,

        rawPostimageAuthorityReusableForProduction:
          false,

        day: {
          semanticChange:
            daySemantic
              .semanticChange,

          candidateSha256:
            sha256Buffer(
              candidateDayBuffer
            ),

          candidateBytes:
            candidateDayBuffer
              .length
        },

        cumulative: {
          semanticChange:
            cumulativeSemantic
              .semanticChange,

          candidateSha256:
            sha256Buffer(
              candidateCumulativeBuffer
            ),

          candidateBytes:
            candidateCumulativeBuffer
              .length
        }
      },

      simulation,

      safety: {
        repositoryWritePerformed:
          false,

        authorizationArtifactCreated:
          false,

        signerUse:
          false,

        productionKernelInvoked:
          false,

        productionKernelEnabled:
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
      runCheckpointAwareValueComparisonSandboxSimulationDay({
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
              "unknown_value_comparison_sandbox_simulation_error"
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
