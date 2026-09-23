import fs from "node:fs";
import path from "node:path";
import {
  fileURLToPath
} from "node:url";

import {
  buildCheckpointAwareValueComparisonDisabledProductionAdapterContract
} from "../core/checkpoint-aware-targeted-value-comparison-disabled-production-adapter.js";

import {
  inspectAutonomousRepairProductionExecutionReadiness
} from "../core/autonomous-repair-production-execution-entrypoint.js";

import {
  runCheckpointAwareValueComparisonSandboxSimulationDay
} from "./run-checkpoint-aware-targeted-value-comparison-sandbox-simulation-day.js";

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

const SHA_RE =
  /^[0-9a-f]{40}$/u;

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

function sourceText(
  relativePath
) {
  return fs.readFileSync(
    new URL(
      `../core/${relativePath}`,
      import.meta.url
    ),
    "utf8"
  );
}

function exactStringArrayFromConst({
  source,
  constName
}) {
  const expression =
    new RegExp(
      `(?:const|export const)\\s+${constName}\\s*=\\s*(?:Object\\.freeze\\()?\\s*\\[([\\s\\S]*?)\\]\\s*\\)?\\s*;`,
      "u"
    );

  const match =
    source.match(
      expression
    );

  if (!match) {
    throw new Error(
      `value_comparison_disabled_adapter_${constName}_surface_not_found`
    );
  }

  return [
    ...match[1]
      .matchAll(
        /"([^"]+)"/gu
      )
  ]
    .map(
      row =>
        row[1]
    );
}

function inspectLegacyCompatibility() {
  const planSource =
    sourceText(
      "autonomous-repair-plan.js"
    );

  const verifierSource =
    sourceText(
      "autonomous-repair-target-verifier.js"
    );

  const authorizationSource =
    sourceText(
      "autonomous-repair-execution-authorization-v2.js"
    );

  const transactionSource =
    sourceText(
      "autonomous-repair-execution-transaction-plan.js"
    );

  return {
    genericPlanProtectsValueComparison:
      planSource.includes(
        'lower.includes("/value-comparison/")'
      ),

    targetVerifierProtectsValueComparison:
      verifierSource.includes(
        'lower.includes("/value-comparison/")'
      ),

    authorizationV2SupportedRepairClasses:
      exactStringArrayFromConst({
        source:
          authorizationSource,
        constName:
          "SUPPORTED_REPAIR_CLASSES"
      }),

    transactionPlanSupportedRepairClasses:
      exactStringArrayFromConst({
        source:
          transactionSource,
        constName:
          "REPAIR_CLASSES"
      })
  };
}

export function runCheckpointAwareValueComparisonDisabledProductionAdapterContractDay({
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
      "value_comparison_disabled_adapter_day_invalid"
    );
  }

  if (
    !SHA_RE.test(
      head
    )
  ) {
    throw new Error(
      "value_comparison_disabled_adapter_remote_head_invalid"
    );
  }

  const sandboxReport =
    runCheckpointAwareValueComparisonSandboxSimulationDay({
      dayKey:
        day,
      remoteHead:
        head,
      generatedAt
    });

  const productionExecutionReadiness =
    inspectAutonomousRepairProductionExecutionReadiness();

  const sourcePreflightState =
    sandboxReport
      .sourcePreflightState;

  const proposedMutationCount =
    Number(
      sandboxReport
        .proposedMutationCount ||
      0
    );

  const sourceSandboxSimulationState =
    sandboxReport
      .simulationState;

  const sourceSandboxRollbackVerified =
    sandboxReport
      ?.simulation
      ?.rollbackVerified ===
        true;

  const contract =
    buildCheckpointAwareValueComparisonDisabledProductionAdapterContract({
      dayKey:
        day,

      sourcePreflightState,

      proposedMutationCount,

      sourceSandboxSimulationState,

      sourceSandboxRollbackVerified,

      compatibility:
        inspectLegacyCompatibility(),

      productionExecutionReadiness
    });

  return {
    schema:
      "ai-matchlab.checkpoint-aware-value-comparison-disabled-production-adapter-day.v1",

    mode:
      "DISABLED_PRODUCTION_TRANSACTION_ADAPTER_CONTRACT",

    dayKey:
      day,

    generatedAt,

    remoteHead:
      head,

    contract,

    sourceSandbox: {
      simulationState:
        sandboxReport
          .simulationState,

      sourcePreflightState:
        sandboxReport
          .sourcePreflightState,

      proposedMutationCount:
        sandboxReport
          .proposedMutationCount,

      productionRepositoryTarget:
        sandboxReport
          .productionRepositoryTarget
    },

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

      protectedPathBypassUsed:
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
      runCheckpointAwareValueComparisonDisabledProductionAdapterContractDay({
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
              "unknown_value_comparison_disabled_adapter_error"
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
