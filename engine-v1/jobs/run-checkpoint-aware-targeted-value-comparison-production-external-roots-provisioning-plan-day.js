import path from "node:path";
import {
  fileURLToPath
} from "node:url";

import {
  buildCheckpointAwareValueComparisonProductionRootsProvisioningPlan
} from "../core/checkpoint-aware-targeted-value-comparison-production-external-roots-provisioning-plan.js";

import {
  runCheckpointAwareValueComparisonProductionExternalStateRealRootBindingDay
} from "./run-checkpoint-aware-targeted-value-comparison-production-external-state-real-root-binding-day.js";

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

const SHA_RE =
  /^[0-9a-f]{40}$/u;

function clean(value) {
  return String(
    value ?? ""
  ).trim();
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

export function runCheckpointAwareValueComparisonProductionExternalRootsProvisioningPlanDay({
  dayKey,
  remoteHead,
  projectRoot,
  machineRoot,
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
      "value_comparison_production_roots_plan_day_invalid"
    );
  }

  if (
    !SHA_RE.test(
      head
    )
  ) {
    throw new Error(
      "value_comparison_production_roots_plan_remote_head_invalid"
    );
  }

  const r24 =
    runCheckpointAwareValueComparisonProductionExternalStateRealRootBindingDay({
      dayKey:
        day,

      remoteHead:
        head,

      generatedAt
    });

  const plan =
    buildCheckpointAwareValueComparisonProductionRootsProvisioningPlan({
      dayKey:
        day,

      remoteHead:
        head,

      sourceR24:
        r24,

      projectRoot,

      machineRoot
    });

  return {
    schema:
      "ai-matchlab.checkpoint-aware-value-comparison-production-external-roots-provisioning-plan-day.v1",

    mode:
      "READ_ONLY_PRODUCTION_EXTERNAL_ROOTS_PROVISIONING_PLAN",

    dayKey:
      day,

    generatedAt,

    remoteHead:
      head,

    plan,

    sourceStates: {
      r24State:
        r24.contract.state,

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
      runCheckpointAwareValueComparisonProductionExternalRootsProvisioningPlanDay({
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
              "unknown_value_comparison_production_roots_plan_error"
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
