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
  classifyCheckpointAwareTargetedPublicationInspection
} from "../core/checkpoint-aware-targeted-publication-inspection.js";

import {
  verifyDailyPublishContract
} from "./verify-daily-publish-contract.js";

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

const SHA_RE =
  /^[0-9a-f]{40}$/u;

function staticPersistedDataPathForDay(
  dayKey
) {
  return (
    ...parts
  ) => {
    if (
      parts[0] ===
        "details" &&
      parts[1] ===
        dayKey
    ) {
      return resolveDataPath(
        "deploy-snapshots",
        dayKey,
        "details",
        ...parts.slice(2)
      );
    }

    return resolveDataPath(
      ...parts
    );
  };
}

function summarizeContractReport(
  report
) {
  return {
    ok:
      report?.ok ===
        true,

    mode:
      report?.mode ||
      null,

    latestRequired:
      report
        ?.latestRequired ===
          true,

    fixtureCount:
      Number(
        report
          ?.fixtureCount ||
        0
      ),

    detailFileCount:
      Number(
        report
          ?.detailFileCount ||
        0
      ),

    blocked:
      Array.isArray(
        report?.blocked
      )
        ? report.blocked
        : [],

    requiredArtifacts:
      Object.fromEntries(
        Object.entries(
          report
            ?.requiredArtifacts ||
          {}
        )
          .map(
            (
              [
                name,
                state
              ]
            ) => [
              name,
              {
                exists:
                  state
                    ?.exists ===
                      true,
                parseError:
                  state
                    ?.parseError ||
                  null
              }
            ]
          )
      )
  };
}

export function runCheckpointAwareTargetedPublicationInspectionDay({
  dayKey,
  remoteHead,
  generatedAt =
    new Date().toISOString(),
  contractVerifier =
    verifyDailyPublishContract
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
      "publication_inspection_day_invalid"
    );
  }

  if (
    !SHA_RE.test(
      head
    )
  ) {
    throw new Error(
      "publication_inspection_remote_head_invalid"
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
        "current_manifest_missing"
      ]
    });

  const executorContract =
    buildCheckpointAwareTargetedRepairExecutorContract({
      decision
    });

  const persistedDataPath =
    staticPersistedDataPathForDay(
      day
    );

  const prepublish =
    contractVerifier(
      day,
      {
        resolveDataPath:
          persistedDataPath,
        requireLatest:
          false
      }
    );

  const final =
    contractVerifier(
      day,
      {
        resolveDataPath:
          persistedDataPath,
        requireLatest:
          true
      }
    );

  const inspection =
    classifyCheckpointAwareTargetedPublicationInspection({
      dayKey:
        day,
      prepublish,
      final
    });

  return {
    schema:
      "ai-matchlab.checkpoint-aware-targeted-publication-inspection-run.v1",

    mode:
      "READ_ONLY_INSPECTION",

    dayKey:
      day,

    generatedAt,

    remoteHead:
      head,

    sourceDecision:
      decision,

    executorContract,

    inspection,

    evidence: {
      persistedStaticDetailsView:
        true,

      prepublish:
        summarizeContractReport(
          prepublish
        ),

      final:
        summarizeContractReport(
          final
        )
    },

    safety: {
      repositoryWritePerformed:
        false,

      workflowDispatchPerformed:
        false,

      broadDailyDispatchPerformed:
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

if (isCli) {
  try {
    const result =
      runCheckpointAwareTargetedPublicationInspectionDay({
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
              "unknown_publication_inspection_error"
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
