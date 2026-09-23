import path from "node:path";
import {
  fileURLToPath
} from "node:url";

import {
  buildCheckpointAwareValueComparisonProductionRootsProvisioningExecutionPrecheck,
  observeCheckpointAwareValueComparisonProductionRootsReadOnly
} from "../core/checkpoint-aware-targeted-value-comparison-production-external-roots-provisioning-execution-precheck.js";

import {
  runCheckpointAwareValueComparisonProductionExternalRootsProvisioningPlanDay
} from "./run-checkpoint-aware-targeted-value-comparison-production-external-roots-provisioning-plan-day.js";

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

const SHA_RE =
  /^[0-9a-f]{40}$/u;

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

function boolArg(value) {
  const normalized =
    clean(
      value
    )
      .toLowerCase();

  if (
    normalized ===
      "true"
  ) {
    return true;
  }

  if (
    normalized ===
      "false"
  ) {
    return false;
  }

  throw new Error(
    "value_comparison_production_roots_precheck_boolean_arg_invalid"
  );
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

export function runCheckpointAwareValueComparisonProductionExternalRootsProvisioningExecutionPrecheckDay({
  dayKey,
  remoteHead,
  projectRoot,
  machineRoot,
  processElevated,
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
      "value_comparison_production_roots_precheck_day_invalid"
    );
  }

  if (
    !SHA_RE.test(
      head
    )
  ) {
    throw new Error(
      "value_comparison_production_roots_precheck_remote_head_invalid"
    );
  }

  const r25 =
    runCheckpointAwareValueComparisonProductionExternalRootsProvisioningPlanDay({
      dayKey:
        day,

      remoteHead:
        head,

      projectRoot,

      machineRoot,

      generatedAt
    });

  const plannedTargets = [
    r25.plan.machineRoot,
    r25.plan.roots.authorizationInbox,
    r25.plan.roots.externalState,
    ...r25.plan.externalStateLayout.map(
      row =>
        row.path
    )
  ];

  const filesystemObservation =
    observeCheckpointAwareValueComparisonProductionRootsReadOnly({
      machineRoot:
        r25.plan.machineRoot,

      plannedTargets
    });

  const precheck =
    buildCheckpointAwareValueComparisonProductionRootsProvisioningExecutionPrecheck({
      dayKey:
        day,

      remoteHead:
        head,

      sourceR25:
        r25,

      filesystemObservation,

      processElevated:
        processElevated ===
          true
    });

  return {
    schema:
      "ai-matchlab.checkpoint-aware-value-comparison-production-external-roots-provisioning-execution-precheck-day.v1",

    mode:
      "READ_ONLY_PRODUCTION_EXTERNAL_ROOTS_PROVISIONING_EXECUTION_PRECHECK",

    dayKey:
      day,

    generatedAt,

    remoteHead:
      head,

    precheck,

    sourceStates: {
      r25State:
        r25.plan.state,

      exactPersistentRootsSelected:
        true,

      productionRootsProvisioned:
        false,

      productionConfigurationBound:
        false
    },

    safety: {
      repositoryWritePerformed:
        false,

      productionRootsCreated:
        false,

      aclMutationPerformed:
        false,

      productionConfigurationBoundThisObservation:
        false,

      productionRealRootAdapterConstructed:
        false,

      productionExternalStateWritePerformed:
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
      runCheckpointAwareValueComparisonProductionExternalRootsProvisioningExecutionPrecheckDay({
        dayKey:
          parseArg(
            "date"
          ),

        remoteHead:
          parseArg(
            "remote-head"
          ),

        projectRoot:
          process.cwd(),

        machineRoot:
          parseArg(
            "machine-root"
          ),

        processElevated:
          boolArg(
            parseArg(
              "process-elevated"
            )
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
              "unknown_value_comparison_production_roots_precheck_error"
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
