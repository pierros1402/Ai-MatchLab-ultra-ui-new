import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import {
  CHECKPOINT_AWARE_TARGETED_REPAIR_SHADOW_CONTEXT,
  CHECKPOINT_AWARE_TARGETED_REPAIR_SHADOW_UNWIRED_FAILURE_CLASSES,
  buildCheckpointAwareTargetedRepairShadow,
  collectCheckpointAwareTargetedRepairShadowSignals,
  evaluateCanonicalSuppressedAliasObservation,
  evaluatePublishedDetailsParity
} from "../core/checkpoint-aware-targeted-repair-shadow.js";

import {
  observeCanonicalSuppressedAliasForShadow,
  observeDetailsMirrorForShadow
} from "../jobs/run-checkpoint-aware-targeted-repair-shadow-day.js";

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
  "shadow extraction exposes all six controller routes and quarantines conflicting classes",
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
      6
    );

    assert.equal(
      x.routeCoverage
        .totalControllerFailureClasses,
      6
    );

    assert.deepEqual(
      CHECKPOINT_AWARE_TARGETED_REPAIR_SHADOW_UNWIRED_FAILURE_CLASSES,
      []
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
  "published fixture/detail bijection is mandatory and exact",
  () => {
    const ok =
      evaluatePublishedDetailsParity({
        manifest: {
          counts: {
            details:
              2
          },
          detailsMissingForFixtures:
            []
        },
        fixtures: [
          {
            canonicalId:
              "cid_a"
          },
          {
            canonicalId:
              "cid_b"
          }
        ],
        detailFiles: [
          "cid_a.json",
          "cid_b.json"
        ]
      });

    assert.equal(
      ok.observationAvailable,
      true
    );

    assert.equal(
      ok.ok,
      true
    );

    assert.deepEqual(
      ok.counts,
      {
        fixtures:
          2,
        publishedFixtureIds:
          2,
        detailFiles:
          2
      }
    );

    const broken =
      evaluatePublishedDetailsParity({
        manifest: {
          counts: {
            details:
              1
          },
          detailsMissingForFixtures: [
            "cid_b"
          ]
        },
        fixtures: [
          {
            canonicalId:
              "cid_a"
          },
          {
            canonicalId:
              "cid_b"
          }
        ],
        detailFiles: [
          "cid_a.json"
        ]
      });

    assert.equal(
      broken.ok,
      false
    );

    assert.deepEqual(
      broken
        .violations
        .map(
          row =>
            row.code
        ),
      [
        "published_details_fixtures_not_bijective",
        "manifest_reports_fixtures_missing_details",
        "manifest_published_detail_count_mismatch"
      ]
    );
  }
);

test(
  "real published-details parity failure becomes fail-closed quarantine",
  () => {
    const parity =
      evaluatePublishedDetailsParity({
        manifest: {
          counts: {
            details:
              0
          },
          detailsMissingForFixtures:
            []
        },
        fixtures: [
          {
            canonicalId:
              "cid_a"
          }
        ],
        detailFiles:
          []
      });

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
          {},
        freshness:
          {},
        buildReport:
          {},
        detailsMirror: {
          observationAvailable:
            false
        },
        publishedDetailsParity:
          parity
      });

    assert.equal(
      x.controllerDecision
        .decisionState,
      "FAIL_CLOSED_QUARANTINE"
    );

    assert.equal(
      x.controllerDecision
        .quarantineReason,
      "unknown_actionable_failure_signal"
    );

    assert.match(
      x.signals[0],
      /^published_details_parity_failure:/u
    );
  }
);

test(
  "daily context requires the source details tree",
  () => {
    const observation =
      observeDetailsMirrorForShadow({
        dayKey:
          DAY,
        context:
          CHECKPOINT_AWARE_TARGETED_REPAIR_SHADOW_CONTEXT.DAILY,
        dataPath:
          () =>
            "__definitely_missing_daily_details_tree__"
      });

    assert.equal(
      observation
        .sourceDetailsAvailable,
      false
    );

    assert.equal(
      observation
        .detailsMirror
        .observationAvailable,
      true
    );

    assert.equal(
      observation
        .detailsMirror
        .ok,
      false
    );

    assert.deepEqual(
      observation
        .detailsMirror
        .violations,
      [
        {
          code:
            "source_details_tree_missing_in_daily_context"
        }
      ]
    );

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
          {},
        freshness:
          {},
        buildReport:
          {},
        detailsMirror:
          observation
            .detailsMirror,
        publishedDetailsParity: {
          observationAvailable:
            true,
          ok:
            true,
          violations:
            []
        }
      });

    assert.equal(
      x.controllerDecision
        .decisionState,
      "FAIL_CLOSED_QUARANTINE"
    );
  }
);

test(
  "intraday and static contexts do not require ephemeral source details",
  () => {
    for (
      const context of [
        CHECKPOINT_AWARE_TARGETED_REPAIR_SHADOW_CONTEXT.INTRADAY,
        CHECKPOINT_AWARE_TARGETED_REPAIR_SHADOW_CONTEXT.STATIC
      ]
    ) {
      const observation =
        observeDetailsMirrorForShadow({
          dayKey:
            DAY,
          context,
          dataPath:
            () =>
              "__definitely_missing_non_daily_details_tree__"
        });

      assert.equal(
        observation
          .sourceDetailsAvailable,
        false
      );

      assert.equal(
        observation
          .detailsMirror
          .observationAvailable,
        false
      );

      assert.equal(
        observation
          .detailsMirror
          .ok,
        null
      );
    }
  }
);

test(
  "raw suppressed aliases are informational when canonical membership gate reaches a clean fixed point",
  () => {
    const observation =
      evaluateCanonicalSuppressedAliasObservation({
        observationAvailable:
          true,
        rawSuppressedFixtureIds: [
          "old_a",
          "old_b"
        ],
        postGateSuppressedFixtureIds:
          []
      });

    assert.equal(
      observation.ok,
      true
    );

    assert.equal(
      observation
        .rawSuppressedAliasCount,
      2
    );

    assert.equal(
      observation
        .postGateSuppressedAliasCount,
      0
    );

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
          {},
        freshness:
          {},
        buildReport:
          {},
        detailsMirror: {
          observationAvailable:
            false
        },
        publishedDetailsParity: {
          observationAvailable:
            true,
          ok:
            true,
          violations:
            []
        },
        canonicalSuppressedAliasObservation:
          observation
      });

    assert.equal(
      x.controllerDecision
        .decisionState,
      "NO_REPAIR_REQUIRED"
    );

    assert.deepEqual(
      x.signals,
      []
    );
  }
);

test(
  "suppressed alias surviving canonical membership gate routes to bounded resolver suppression only",
  () => {
    const observation =
      evaluateCanonicalSuppressedAliasObservation({
        observationAvailable:
          true,
        rawSuppressedFixtureIds: [
          "old_a"
        ],
        postGateSuppressedFixtureIds: [
          "old_a"
        ]
      });

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
          {},
        freshness:
          {},
        buildReport:
          {},
        detailsMirror: {
          observationAvailable:
            false
        },
        publishedDetailsParity: {
          observationAvailable:
            true,
          ok:
            true,
          violations:
            []
        },
        canonicalSuppressedAliasObservation:
          observation
      });

    assert.deepEqual(
      x.signals,
      [
        "canonical_suppressed_alias_present"
      ]
    );

    assert.equal(
      x.controllerDecision
        .decisionState,
      "BOUNDED_REPAIR_PLAN"
    );

    assert.equal(
      x.controllerDecision
        .failureClass,
      "CANONICAL_SUPPRESSED_ALIAS_PRESENT"
    );

    assert.equal(
      x.controllerDecision
        .repairUnit,
      "resolver_membership_gate_suppression_only"
    );

    assert.equal(
      x.controllerDecision
        .resumeCheckpoint,
      "canonical_semantic_reverification_then_downstream"
    );
  }
);

test(
  "canonical suppressed-alias observer failure is actionable and fails closed",
  () => {
    const observation =
      evaluateCanonicalSuppressedAliasObservation({
        observationAvailable:
          true,
        readError:
          "resolver_runtime_unavailable"
      });

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
          {},
        freshness:
          {},
        buildReport:
          {},
        detailsMirror: {
          observationAvailable:
            false
        },
        publishedDetailsParity: {
          observationAvailable:
            true,
          ok:
            true,
          violations:
            []
        },
        canonicalSuppressedAliasObservation:
          observation
      });

    assert.deepEqual(
      x.signals,
      [
        "canonical_suppressed_alias_observation_failed"
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
      "unknown_actionable_failure_signal"
    );
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
      daily,
      /--context=daily/u
    );

    assert.match(
      intraday,
      /run-checkpoint-aware-targeted-repair-shadow-day\.js/u
    );

    assert.match(
      intraday,
      /--context=intraday/u
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
