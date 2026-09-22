import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  CHECKPOINT_AWARE_TARGETED_REPAIR_SHADOW_UNWIRED_FAILURE_CLASSES,
  buildCheckpointAwareTargetedRepairShadow,
  collectCheckpointAwareTargetedRepairShadowSignals
} from "../core/checkpoint-aware-targeted-repair-shadow.js";

const DAY =
  "2026-09-22";

const NEXT_DAY =
  "2026-09-23";

const AT =
  "2026-09-22T15:00:00.000Z";

const HEAD =
  "3acfcbde5e74da5647e224a500440657b495b501";

test(
  "single freshness signal reaches the bounded controller route in shadow mode",
  () => {
    const x =
      buildCheckpointAwareTargetedRepairShadow({
        dayKey:
          DAY,
        currentDayKey:
          DAY,
        generatedAt:
          AT,
        remoteHead:
          HEAD,
        manifest:
          {
            generatedAt:
              AT
          },
        freshness:
          {
            reasons: [
              "snapshot_stale_against_coverage_readiness"
            ],
            staleInputs: [],
            staleDerivedArtifacts: []
          },
        buildReport:
          {
            hardFailures: []
          },
        detailsMirror:
          {
            violations: []
          }
      });

    assert.equal(
      x.evaluated,
      true
    );

    assert.equal(
      x.executionAuthoritative,
      false
    );

    assert.equal(
      x.remoteBindingIndependent,
      false
    );

    assert.deepEqual(
      x.signals,
      [
        "snapshot_stale_against_coverage_readiness"
      ]
    );

    assert.equal(
      x.controllerDecision
        .decisionState,
      "BOUNDED_REPAIR_PLAN"
    );

    assert.equal(
      x.controllerDecision
        .repairUnit,
      "rebuild_coverage_readiness_then_manifest_only_reexport_preserving_value_and_details"
    );
  }
);

test(
  "shadow extraction covers five observable controller classes and quarantines conflicting classes",
  () => {
    const x =
      buildCheckpointAwareTargetedRepairShadow({
        dayKey:
          DAY,
        currentDayKey:
          DAY,
        generatedAt:
          AT,
        remoteHead:
          HEAD,
        manifest:
          null,
        freshness:
          {
            reasons: [
              "snapshot_stale_against_coverage_readiness"
            ],
            staleInputs: [],
            staleDerivedArtifacts: [
              {
                staleReason:
                  "value_plan_comparison_stale_against_canonical"
              }
            ]
          },
        buildReport:
          {
            hardFailures: [
              "live_status_stale_open_exact_provider_ids:cid_a,cid_b"
            ]
          },
        detailsMirror:
          {
            violations: [
              {
                code:
                  "source_detail_extra_file",
                file:
                  "orphan.json"
              }
            ]
          }
      });

    assert.deepEqual(
      x.signals,
      [
        "current_manifest_missing",
        "snapshot_stale_against_coverage_readiness",
        "value_plan_comparison_stale_against_canonical",
        "live_status_stale_open_exact_provider_ids:cid_a,cid_b",
        "source_detail_extra_file"
      ]
    );

    assert.equal(
      x.routeCoverage
        .wiredCount,
      5
    );

    assert.equal(
      x.routeCoverage
        .totalControllerFailureClasses,
      6
    );

    assert.deepEqual(
      CHECKPOINT_AWARE_TARGETED_REPAIR_SHADOW_UNWIRED_FAILURE_CLASSES,
      [
        "CANONICAL_SUPPRESSED_ALIAS_PRESENT"
      ]
    );

    assert.equal(
      x.controllerDecision
        .decisionState,
      "FAIL_CLOSED_QUARANTINE"
    );

    assert.equal(
      x.controllerDecision
        .quarantineReason,
      "multiple_conflicting_failure_classes"
    );
  }
);

test(
  "missing or invalid remote head keeps shadow non-authorizing and unevaluated",
  () => {
    const x =
      buildCheckpointAwareTargetedRepairShadow({
        dayKey:
          DAY,
        currentDayKey:
          DAY,
        generatedAt:
          AT,
        remoteHead:
          "",
        manifest:
          {},
        freshness:
          {},
        buildReport:
          {},
        detailsMirror:
          {}
      });

    assert.equal(
      x.evaluated,
      false
    );

    assert.equal(
      x.reason,
      "remote_head_missing_or_invalid"
    );

    assert.equal(
      x.executionAuthoritative,
      false
    );

    assert.equal(
      x.controllerDecision,
      null
    );
  }
);

test(
  "missing manifest for a future prepublication day does not masquerade as current-day publication failure",
  () => {
    const signals =
      collectCheckpointAwareTargetedRepairShadowSignals({
        dayKey:
          NEXT_DAY,
        currentDayKey:
          DAY,
        manifest:
          null,
        freshness:
          null,
        buildReport:
          null,
        detailsMirror:
          null
      });

    assert.deepEqual(
      signals,
      []
    );

    const x =
      buildCheckpointAwareTargetedRepairShadow({
        dayKey:
          NEXT_DAY,
        currentDayKey:
          DAY,
        generatedAt:
          AT,
        remoteHead:
          HEAD,
        manifest:
          null
      });

    assert.equal(
      x.controllerDecision
        .decisionState,
      "NO_REPAIR_REQUIRED"
    );
  }
);

test(
  "shadow runner source remains repository-read-only",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "../jobs/run-checkpoint-aware-targeted-repair-shadow-day.js",
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
        "http.request"
      ]
    ) {
      assert.equal(
        source.includes(
          forbidden
        ),
        false,
        `shadow runner must not contain ${forbidden}`
      );
    }
  }
);

test(
  "daily and intraday workflows observe shadow decisions without granting execution authority",
  () => {
    const daily =
      fs.readFileSync(
        new URL(
          "../../.github/workflows/daily-deploy-snapshot.yml",
          import.meta.url
        ),
        "utf8"
      );

    const intraday =
      fs.readFileSync(
        new URL(
          "../../.github/workflows/intraday-deploy-snapshot-refresh.yml",
          import.meta.url
        ),
        "utf8"
      );

    assert.match(
      daily,
      /Run checkpoint-aware targeted repair shadow/u
    );

    assert.match(
      daily,
      /continue-on-error:\s*true/u
    );

    assert.match(
      daily,
      /run-checkpoint-aware-targeted-repair-shadow-day\.js/u
    );

    assert.match(
      intraday,
      /run-checkpoint-aware-targeted-repair-shadow-day\.js/u
    );

    assert.match(
      intraday,
      /SHADOW_OBSERVATION_FAILED_NON_BLOCKING=true/u
    );

    assert.doesNotMatch(
      daily,
      /checkpoint-aware-targeted-repair-shadow[\s\S]{0,800}repairExecutionAuthorized:\s*true/u
    );

    assert.doesNotMatch(
      intraday,
      /checkpoint-aware-targeted-repair-shadow[\s\S]{0,800}repairExecutionAuthorized:\s*true/u
    );
  }
);
