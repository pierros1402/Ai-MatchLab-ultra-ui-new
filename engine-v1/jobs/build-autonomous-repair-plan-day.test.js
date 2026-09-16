import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAutonomousRepairPlanFromSources,
  parseAutonomousRepairPlanCliArgs
} from "./build-autonomous-repair-plan-day.js";

test(
  "real 09-11 produce no-action dry-run plans with zero operations",
  () => {
    for (
      const dayKey of [
        "2026-09-09",
        "2026-09-10",
        "2026-09-11"
      ]
    ) {
      const {
        policy,
        verification,
        gate,
        plan
      } =
        buildAutonomousRepairPlanFromSources({
          dayKey,

          generatedAt:
            "2026-09-16T07:00:00.000Z"
        });

      assert.equal(
        policy.policyState,
        "OBSERVATION_ONLY",
        dayKey
      );

      assert.equal(
        verification.verified,
        true,
        dayKey
      );

      assert.equal(
        gate.gateState,
        "NOT_REQUESTABLE_NO_CANDIDATES",
        dayKey
      );

      assert.equal(
        plan.planState,
        "NO_ACTION_NOT_REQUESTABLE",
        dayKey
      );

      assert.equal(
        plan.summary.candidateCount,
        0,
        dayKey
      );

      assert.equal(
        plan.summary.operationCount,
        0,
        dayKey
      );

      assert.equal(
        plan.authority.dryRunOnly,
        true,
        dayKey
      );

      assert.equal(
        plan.authority.filesystemWriteAuthorized,
        false,
        dayKey
      );

      assert.equal(
        plan.authority.executionAuthorized,
        false,
        dayKey
      );
    }

    assert.equal(
      fs.existsSync(
        new URL(
          "../../data/autonomous-repair-plan",
          import.meta.url
        )
      ),
      false
    );
  }
);

test(
  "real source-bound no-action repair plan fingerprint ignores generatedAt-only churn",
  () => {
    const first =
      buildAutonomousRepairPlanFromSources({
        dayKey:
          "2026-09-11",

        generatedAt:
          "2026-09-16T07:00:00.000Z"
      }).plan;

    const second =
      buildAutonomousRepairPlanFromSources({
        dayKey:
          "2026-09-11",

        generatedAt:
          "2026-09-16T09:00:00.000Z"
      }).plan;

    assert.equal(
      first.planFingerprint,
      second.planFingerprint
    );

    assert.notEqual(
      first.generatedAt,
      second.generatedAt
    );
  }
);

test(
  "repair plan CLI is strictly dry-run and rejects every mutation mode",
  () => {
    assert.deepEqual(
      parseAutonomousRepairPlanCliArgs([
        "--day",
        "2026-09-11"
      ]),
      {
        dayKey:
          "2026-09-11"
      }
    );

    for (
      const argv of [
        [],
        [
          "--day",
          "2026-09-11",
          "--write"
        ],
        [
          "--day",
          "2026-09-11",
          "--repair"
        ],
        [
          "--day",
          "2026-09-11",
          "--authorize"
        ],
        [
          "--day",
          "2026-09-11",
          "--execute"
        ],
        [
          "--day",
          "2026-09-11",
          "--apply"
        ],
        [
          "--day",
          "2026-09-11",
          "--rollback"
        ],
        [
          "--day",
          "2026-09-11",
          "--output",
          "plan.json"
        ]
      ]
    ) {
      assert.throws(
        () =>
          parseAutonomousRepairPlanCliArgs(
            argv
          )
      );
    }
  }
);
