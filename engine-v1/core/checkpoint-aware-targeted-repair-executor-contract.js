import {
  createHash
} from "node:crypto";

export const CHECKPOINT_AWARE_TARGETED_REPAIR_EXECUTOR_CONTRACT_SCHEMA =
  "ai-matchlab.checkpoint-aware-targeted-repair-executor-contract.v1";

export const CHECKPOINT_AWARE_TARGETED_REPAIR_EXECUTOR_MODE =
  "DRY_RUN_ONLY";

export const VALUE_COMPARISON_STALE_FAILURE_CLASS =
  "VALUE_PLAN_COMPARISON_STALE_AGAINST_CANONICAL";

export const VALUE_COMPARISON_REPAIR_UNIT =
  "rebuild_day_value_comparison_and_cumulative_only";

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

function text(value) {
  return String(
    value ?? ""
  ).trim();
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

function assertZeroDecisionAuthority(
  decision
) {
  for (
    const field of [
      "projectWriteAuthorized",
      "filesystemWriteAuthorized",
      "repairExecutionAuthorized",
      "productionKernelEnableAuthorized",
      "workflowMutationAuthorized",
      "commitAuthorized",
      "pushAuthorized",
      "deployAuthorized",
      "broadDailyRecoveryAuthorized"
    ]
  ) {
    if (
      decision
        ?.authority
        ?.[field] ===
          true
    ) {
      throw new Error(
        `checkpoint_executor_decision_authority_forbidden:${field}`
      );
    }
  }

  if (
    decision
      ?.executionBoundary
      ?.productionKernelEnabled ===
        true
  ) {
    throw new Error(
      "checkpoint_executor_production_kernel_forbidden"
    );
  }
}

export function checkpointAwareTargetedRepairExecutorContractFingerprint(
  artifact
) {
  const unsigned = {
    ...artifact
  };

  delete unsigned.contractFingerprint;

  return sha256Json(
    unsigned
  );
}

export function buildCheckpointAwareTargetedRepairExecutorContract({
  decision
} = {}) {
  if (
    !decision ||
    typeof decision !==
      "object"
  ) {
    throw new Error(
      "checkpoint_executor_decision_required"
    );
  }

  if (
    !DAY_RE.test(
      text(
        decision.dayKey
      )
    )
  ) {
    throw new Error(
      "checkpoint_executor_day_key_invalid"
    );
  }

  assertZeroDecisionAuthority(
    decision
  );

  if (
    decision.decisionState !==
      "BOUNDED_REPAIR_PLAN"
  ) {
    throw new Error(
      `checkpoint_executor_decision_state_not_requestable:${text(decision.decisionState) || "missing"}`
    );
  }

  if (
    decision.failureClass !==
      VALUE_COMPARISON_STALE_FAILURE_CLASS ||
    decision.repairUnit !==
      VALUE_COMPARISON_REPAIR_UNIT
  ) {
    throw new Error(
      `checkpoint_executor_route_not_implemented:${text(decision.failureClass)}:${text(decision.repairUnit)}`
    );
  }

  if (
    decision
      ?.executionAuthorization
      ?.requiredBeforeBoundedExecution !==
        true ||
    decision
      ?.executionAuthorization
      ?.authorizationGrantedByThisDecision !==
        false
  ) {
    throw new Error(
      "checkpoint_executor_authorization_boundary_invalid"
    );
  }

  const dayKey =
    text(
      decision.dayKey
    );

  const artifact = {
    schema:
      CHECKPOINT_AWARE_TARGETED_REPAIR_EXECUTOR_CONTRACT_SCHEMA,

    version:
      "1.0.0",

    role:
      "read_only_bounded_repair_executor_contract",

    mode:
      CHECKPOINT_AWARE_TARGETED_REPAIR_EXECUTOR_MODE,

    dayKey,

    sourceDecision: {
      decisionFingerprint:
        text(
          decision
            .decisionFingerprint
        ),
      decisionState:
        decision
          .decisionState,
      failureClass:
        decision
          .failureClass,
      repairUnit:
        decision
          .repairUnit,
      resumeCheckpoint:
        decision
          .resumeCheckpoint
    },

    repairContract: {
      exactRepairUnit:
        VALUE_COMPARISON_REPAIR_UNIT,

      purpose:
        "rebuild_only_the_day_value_comparison_and_its_cumulative_rollup",

      candidateBuilders: [
        {
          script:
            "engine-v1/jobs/build-value-plan-comparison-day.js",
          args: [
            `--date=${dayKey}`,
            "--write",
            "--output=<TEMP_COMPARISON_DIR>/<DAY>.json"
          ],
          repositoryWriteAllowed:
            false
        },
        {
          script:
            "engine-v1/jobs/build-value-comparison-cumulative.js",
          args: [
            "--write",
            "--dir=<TEMP_COMPARISON_DIR>",
            "--output=<TEMP_COMPARISON_DIR>/cumulative.json"
          ],
          repositoryWriteAllowed:
            false
        }
      ],

      allowedRepositoryOutputsAfterFutureAuthorization: [
        `data/value-comparison/${dayKey}.json`,
        "data/value-comparison/cumulative.json"
      ],

      outputScope:
        "EXACT_PATHS_ONLY",

      forbiddenRepositoryPrefixes: [
        ".github/",
        "engine-v1/",
        "assets/",
        "workers/",
        "data/canonical-fixtures/",
        "data/deploy-snapshots/",
        "data/details/",
        "data/value/",
        "data/value-plans/",
        "data/final-results/",
        "data/final-result-conflicts/"
      ],

      forbiddenOperations: [
        "rebuild_value_model",
        "rebuild_details",
        "rebuild_plan_a",
        "rebuild_plan_b",
        "mutate_canonical_fixture_truth",
        "mutate_final_result_truth",
        "full_daily_cycle",
        "workflow_mutation",
        "push",
        "deploy"
      ],

      dryRun: {
        tempOnly:
          true,
        tempCopyOfComparisonInputs:
          true,
        productionRepositoryMutation:
          false,
        cleanupRequired:
          true,
        runner:
          "engine-v1/jobs/run-checkpoint-aware-targeted-value-comparison-repair-dry-run-day.js"
      },

      postconditionsForFutureMutableExecution: [
        "day_comparison_builder_ok",
        "cumulative_builder_ok",
        "repository_diff_scope_exact_two_allowed_paths",
        "artifact_freshness_reverified",
        "resume_from_artifact_freshness_gate",
        "remote_head_race_guard_clean"
      ]
    },

    authority: {
      planningOnly:
        true,
      dryRunAuthorized:
        true,
      repositoryWriteAuthorized:
        false,
      filesystemRepositoryWriteAuthorized:
        false,
      repairExecutionAuthorized:
        false,
      mutableExecutionAuthorized:
        false,
      signerUseAuthorized:
        false,
      commitAuthorized:
        false,
      pushAuthorized:
        false,
      deployAuthorized:
        false,
      workflowMutationAuthorized:
        false,
      externalAuthorizationV2RequiredBeforeMutableExecution:
        true
    },

    existingAutonomousRepairPlanCompatibility: {
      reusedAsMutableExecutionPlan:
        false,
      reason:
        "legacy_autonomous_repair_plan_protects_value_comparison_paths;_checkpoint_executor_remains_separate_and_read_only_until_explicit_authorized_bridge_design"
    }
  };

  artifact.contractFingerprint =
    checkpointAwareTargetedRepairExecutorContractFingerprint(
      artifact
    );

  return artifact;
}
