import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  BROAD_DAILY_RECOVERY_POLICY,
  EXECUTION_AUTHORIZATION_SCHEMA,
  EXECUTION_AUTHORIZATION_SIGNATURE_ALGORITHMS,
  FAILURE_ROUTES,
  buildCheckpointAwareTargetedRepairControllerDecision,
  checkpointAwareTargetedRepairControllerDecisionFingerprint
} from "../core/checkpoint-aware-targeted-repair-controller.js";

const DAY =
  "2026-09-20";

const AT =
  "2026-09-22T08:30:00.000Z";

const HEAD =
  "c639dec50615fc2000e729118d7707e5e1831587";

function decide(signals, extra = {}) {
  return buildCheckpointAwareTargetedRepairControllerDecision({
    dayKey:
      DAY,
    generatedAt:
      AT,
    expectedRemoteHead:
      HEAD,
    observedRemoteHead:
      HEAD,
    signals,
    ...extra
  });
}

test(
  "freshness ordering failure routes to readiness + manifest-only repair",
  () => {
    const x =
      decide([
        "snapshot_stale_against_coverage_readiness"
      ]);

    assert.equal(
      x.decisionState,
      "BOUNDED_REPAIR_PLAN"
    );

    assert.equal(
      x.failureClass,
      "ARTIFACT_FRESHNESS_COVERAGE_READINESS_AFTER_MANIFEST"
    );

    assert.equal(
      x.resumeCheckpoint,
      "artifact_freshness_gate"
    );

    assert.ok(
      x.forbidden.includes(
        "value_rebuild"
      )
    );

    assert.ok(
      x.forbidden.includes(
        "details_rebuild"
      )
    );

    assert.ok(
      x.forbidden.includes(
        "full_daily_cycle"
      )
    );
  }
);

test(
  "value comparison stale failure routes to comparison-only rebuild",
  () => {
    const x =
      decide([
        "value_plan_comparison_stale_against_canonical"
      ]);

    assert.equal(
      x.failureClass,
      "VALUE_PLAN_COMPARISON_STALE_AGAINST_CANONICAL"
    );

    assert.equal(
      x.repairUnit,
      "rebuild_day_value_comparison_and_cumulative_only"
    );
  }
);

test(
  "details mirror extra file routes only to verified orphan cleanup",
  () => {
    const x =
      decide([
        {
          code:
            "details_value_mirror_violation",
          details: {
            violationCode:
              "source_detail_extra_file"
          }
        }
      ]);

    assert.equal(
      x.failureClass,
      "DETAILS_VALUE_MIRROR_SOURCE_DETAIL_EXTRA_FILE"
    );

    assert.equal(
      x.resumeCheckpoint,
      "details_value_mirror_gate"
    );
  }
);

test(
  "exact-provider stale-open signal routes to all-or-nothing targeted terminal repair",
  () => {
    const x =
      decide([
        "live_status_stale_open_exact_provider_ids:cid_example"
      ]);

    assert.equal(
      x.failureClass,
      "LIVE_STATUS_STALE_OPEN_EXACT_PROVIDER_IDS"
    );

    assert.ok(
      x.forbidden.includes(
        "heuristic_final_promotion"
      )
    );

    assert.ok(
      x.forbidden.includes(
        "unverified_status_write"
      )
    );
  }
);

test(
  "suppressed alias signal routes to resolver membership suppression only",
  () => {
    const x =
      decide([
        "canonical_suppressed_alias_present"
      ]);

    assert.equal(
      x.failureClass,
      "CANONICAL_SUPPRESSED_ALIAS_PRESENT"
    );

    assert.equal(
      x.repairUnit,
      "resolver_membership_gate_suppression_only"
    );
  }
);

test(
  "missing current-day publication routes to read-only inspection rather than Daily dispatch",
  () => {
    const x =
      decide([
        "current_day_publication_pointer_missing"
      ]);

    assert.equal(
      x.decisionState,
      "READ_ONLY_INSPECTION_PLAN"
    );

    assert.equal(
      x.failureClass,
      "CURRENT_DAY_PUBLICATION_POINTER_OR_ARTIFACT_MISSING"
    );

    assert.equal(
      x.authority
        .broadDailyRecoveryAuthorized,
      false
    );

    assert.equal(
      x.broadDailyRecoveryPolicy,
      "EXPLICIT_LAST_RESORT_ONLY_NOT_DEFAULT"
    );
  }
);

test(
  "unknown actionable failure fails closed and quarantines",
  () => {
    const x =
      decide([
        "some_new_unclassified_failure"
      ]);

    assert.equal(
      x.decisionState,
      "FAIL_CLOSED_QUARANTINE"
    );

    assert.equal(
      x.quarantineReason,
      "unknown_actionable_failure_signal"
    );

    assert.equal(
      x.repairExecutionAuthorized,
      undefined
    );
  }
);

test(
  "multiple distinct known failure classes fail closed and quarantine",
  () => {
    const x =
      decide([
        "value_plan_comparison_stale_against_canonical",
        "source_detail_extra_file"
      ]);

    assert.equal(
      x.decisionState,
      "FAIL_CLOSED_QUARANTINE"
    );

    assert.equal(
      x.quarantineReason,
      "multiple_conflicting_failure_classes"
    );
  }
);

test(
  "duplicate signals from one failure class remain one bounded route",
  () => {
    const x =
      decide([
        "source_detail_extra_file",
        {
          code:
            "details_value_mirror_violation",
          details: {
            violationCode:
              "source_detail_extra_file"
          }
        }
      ]);

    assert.equal(
      x.decisionState,
      "BOUNDED_REPAIR_PLAN"
    );

    assert.deepEqual(
      x.classification.failureClasses,
      [
        "DETAILS_VALUE_MIRROR_SOURCE_DETAIL_EXTRA_FILE"
      ]
    );
  }
);

test(
  "informational unknown signal does not broaden a known repair route",
  () => {
    const x =
      decide([
        {
          code:
            "history_semantic_warning",
          informational:
            true
        },
        "value_plan_comparison_stale_against_canonical"
      ]);

    assert.equal(
      x.decisionState,
      "BOUNDED_REPAIR_PLAN"
    );

    assert.equal(
      x.classification
        .ignoredInformational
        .length,
      1
    );
  }
);

test(
  "remote HEAD mismatch fails closed and requires replan",
  () => {
    const x =
      decide(
        [
          "value_plan_comparison_stale_against_canonical"
        ],
        {
          observedRemoteHead:
            "1111111111111111111111111111111111111111"
        }
      );

    assert.equal(
      x.decisionState,
      "FAIL_CLOSED_REPLAN"
    );

    assert.equal(
      x.remoteBinding.exact,
      false
    );
  }
);

test(
  "no actionable signal produces no repair required",
  () => {
    const x =
      decide([]);

    assert.equal(
      x.decisionState,
      "NO_REPAIR_REQUIRED"
    );

    assert.equal(
      x.failureClass,
      null
    );
  }
);

test(
  "every decision remains read-only and cannot enable production execution",
  () => {
    const x =
      decide([
        "live_status_stale_open_exact_provider_ids:cid_example"
      ]);

    assert.deepEqual(
      x.authority,
      {
        artifactReadOnly:
          true,
        projectWriteAuthorized:
          false,
        filesystemWriteAuthorized:
          false,
        repairExecutionAuthorized:
          false,
        productionKernelEnableAuthorized:
          false,
        workflowMutationAuthorized:
          false,
        commitAuthorized:
          false,
        pushAuthorized:
          false,
        deployAuthorized:
          false,
        broadDailyRecoveryAuthorized:
          false
      }
    );

    assert.equal(
      x.executionBoundary
        .productionKernelEnabled,
      false
    );
  }
);

test(
  "bounded execution remains separately gated by external authorization V2",
  () => {
    const x =
      decide([
        "live_status_stale_open_exact_provider_ids:cid_example"
      ]);

    assert.equal(
      x.executionAuthorization
        .requiredBeforeBoundedExecution,
      true
    );

    assert.equal(
      x.executionAuthorization
        .authorizationGrantedByThisDecision,
      false
    );

    assert.equal(
      x.executionBoundary
        .authorizationSchema,
      EXECUTION_AUTHORIZATION_SCHEMA
    );

    assert.deepEqual(
      EXECUTION_AUTHORIZATION_SIGNATURE_ALGORITHMS,
      [
        "Ed25519",
        "ECDSA_P256_SHA256"
      ]
    );
  }
);

test(
  "decision fingerprint is deterministic and self-consistent",
  () => {
    const a =
      decide([
        "value_plan_comparison_stale_against_canonical"
      ]);

    const b =
      decide([
        "value_plan_comparison_stale_against_canonical"
      ]);

    assert.equal(
      a.decisionFingerprint,
      b.decisionFingerprint
    );

    assert.equal(
      a.decisionFingerprint,
      checkpointAwareTargetedRepairControllerDecisionFingerprint(
        a
      )
    );

    assert.match(
      a.decisionFingerprint,
      /^[0-9a-f]{64}$/u
    );
  }
);

test(
  "all six design routes remain represented and broad Daily stays non-default",
  () => {
    assert.equal(
      Object.keys(
        FAILURE_ROUTES
      ).length,
      6
    );

    assert.equal(
      BROAD_DAILY_RECOVERY_POLICY,
      "EXPLICIT_LAST_RESORT_ONLY_NOT_DEFAULT"
    );
  }
);

test(
  "controller core is structurally read-only: no filesystem/network/process mutation primitives",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "../core/checkpoint-aware-targeted-repair-controller.js",
          import.meta.url
        ),
        "utf8"
      );

    for (
      const forbidden of [
        "writeFile",
        "appendFile",
        "unlink",
        "rename",
        "rmSync",
        "spawn",
        "execFile",
        "child_process",
        "fetch(",
        "https.request",
        "http.request",
        "git ",
        "gh "
      ]
    ) {
      assert.equal(
        source.includes(
          forbidden
        ),
        false,
        `controller core must not contain ${forbidden}`
      );
    }
  }
);

test(
  "malformed day and remote heads are rejected before decision construction",
  () => {
    assert.throws(
      () =>
        buildCheckpointAwareTargetedRepairControllerDecision({
          dayKey:
            "2026/09/20",
          generatedAt:
            AT,
          expectedRemoteHead:
            HEAD,
          observedRemoteHead:
            HEAD,
          signals: []
        }),
      /controller_day_key_invalid/u
    );

    assert.throws(
      () =>
        buildCheckpointAwareTargetedRepairControllerDecision({
          dayKey:
            DAY,
          generatedAt:
            AT,
          expectedRemoteHead:
            "bad",
          observedRemoteHead:
            HEAD,
          signals: []
        }),
      /controller_remote_head_invalid/u
    );
  }
);
