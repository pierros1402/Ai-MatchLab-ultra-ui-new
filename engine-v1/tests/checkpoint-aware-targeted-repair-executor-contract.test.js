import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  buildCheckpointAwareTargetedRepairControllerDecision
} from "../core/checkpoint-aware-targeted-repair-controller.js";

import {
  CHECKPOINT_AWARE_TARGETED_REPAIR_EXECUTOR_MODE,
  VALUE_COMPARISON_REPAIR_UNIT,
  VALUE_COMPARISON_STALE_FAILURE_CLASS,
  buildCheckpointAwareTargetedRepairExecutorContract,
  checkpointAwareTargetedRepairExecutorContractFingerprint
} from "../core/checkpoint-aware-targeted-repair-executor-contract.js";

const DAY =
  "2026-09-22";

const AT =
  "2026-09-22T18:00:00.000Z";

const HEAD =
  "d42d365f77fd2f58e4f659dee2e72b9eeef2ea69";

function comparisonDecision() {
  return buildCheckpointAwareTargetedRepairControllerDecision({
    dayKey:
      DAY,
    generatedAt:
      AT,
    expectedRemoteHead:
      HEAD,
    observedRemoteHead:
      HEAD,
    signals: [
      "value_plan_comparison_stale_against_canonical"
    ]
  });
}

test(
  "value comparison stale decision maps to exact dry-run-only executor contract",
  () => {
    const contract =
      buildCheckpointAwareTargetedRepairExecutorContract({
        decision:
          comparisonDecision()
      });

    assert.equal(
      contract.mode,
      CHECKPOINT_AWARE_TARGETED_REPAIR_EXECUTOR_MODE
    );

    assert.equal(
      contract
        .sourceDecision
        .failureClass,
      VALUE_COMPARISON_STALE_FAILURE_CLASS
    );

    assert.equal(
      contract
        .sourceDecision
        .repairUnit,
      VALUE_COMPARISON_REPAIR_UNIT
    );

    assert.equal(
      contract
        .authority
        .mutableExecutionAuthorized,
      false
    );
  }
);

test(
  "executor contract allows only day comparison and cumulative repository outputs after future authorization",
  () => {
    const contract =
      buildCheckpointAwareTargetedRepairExecutorContract({
        decision:
          comparisonDecision()
      });

    assert.deepEqual(
      contract
        .repairContract
        .allowedRepositoryOutputsAfterFutureAuthorization,
      [
        `data/value-comparison/${DAY}.json`,
        "data/value-comparison/cumulative.json"
      ]
    );

    assert.equal(
      contract
        .repairContract
        .outputScope,
      "EXACT_PATHS_ONLY"
    );
  }
);

test(
  "executor contract forbids model details canonical truth push and deploy mutation",
  () => {
    const contract =
      buildCheckpointAwareTargetedRepairExecutorContract({
        decision:
          comparisonDecision()
      });

    for (
      const forbidden of [
        "rebuild_value_model",
        "rebuild_details",
        "mutate_canonical_fixture_truth",
        "mutate_final_result_truth",
        "full_daily_cycle",
        "push",
        "deploy"
      ]
    ) {
      assert.equal(
        contract
          .repairContract
          .forbiddenOperations
          .includes(
            forbidden
          ),
        true
      );
    }
  }
);

test(
  "no-repair decision cannot instantiate executor contract",
  () => {
    const decision =
      buildCheckpointAwareTargetedRepairControllerDecision({
        dayKey:
          DAY,
        generatedAt:
          AT,
        expectedRemoteHead:
          HEAD,
        observedRemoteHead:
          HEAD,
        signals:
          []
      });

    assert.throws(
      () =>
        buildCheckpointAwareTargetedRepairExecutorContract({
          decision
        }),
      /decision_state_not_requestable/u
    );
  }
);

test(
  "unimplemented bounded route fails closed instead of borrowing the value comparison executor",
  () => {
    const decision =
      buildCheckpointAwareTargetedRepairControllerDecision({
        dayKey:
          DAY,
        generatedAt:
          AT,
        expectedRemoteHead:
          HEAD,
        observedRemoteHead:
          HEAD,
        signals: [
          "canonical_suppressed_alias_present"
        ]
      });

    assert.throws(
      () =>
        buildCheckpointAwareTargetedRepairExecutorContract({
          decision
        }),
      /route_not_implemented/u
    );
  }
);

test(
  "executor contract fingerprint is deterministic and self-consistent",
  () => {
    const a =
      buildCheckpointAwareTargetedRepairExecutorContract({
        decision:
          comparisonDecision()
      });

    const b =
      buildCheckpointAwareTargetedRepairExecutorContract({
        decision:
          comparisonDecision()
      });

    assert.equal(
      a.contractFingerprint,
      b.contractFingerprint
    );

    assert.equal(
      a.contractFingerprint,
      checkpointAwareTargetedRepairExecutorContractFingerprint(
        a
      )
    );
  }
);

test(
  "dry-run runner is temp-only and contains no git signer workflow push or deploy machinery",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "../jobs/run-checkpoint-aware-targeted-value-comparison-repair-dry-run-day.js",
          import.meta.url
        ),
        "utf8"
      );

    assert.match(
      source,
      /os\.tmpdir\(\)/u
    );

    assert.match(
      source,
      /fs\.rmSync/u
    );

    for (
      const forbidden of [
        "child_process",
        "git push",
        "gh workflow",
        "RENDER_",
        "privateKey",
        "sign(",
        "deploy hook"
      ]
    ) {
      assert.equal(
        source.includes(
          forbidden
        ),
        false,
        `dry-run runner must not contain ${forbidden}`
      );
    }
  }
);
