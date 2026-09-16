import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAutonomousRepairPolicyDayFromSources,
  parseAutonomousRepairPolicyDayCliArgs
} from "./build-autonomous-repair-policy-day.js";

test(
  "real 09-11 source-bound repair policy remains observation-only with zero repair candidates",
  () => {
    const expected = {
      "2026-09-09":
        "OBSERVATION_ONLY",

      "2026-09-10":
        "OBSERVATION_ONLY",

      "2026-09-11":
        "OBSERVATION_ONLY"
    };

    for (
      const [
        dayKey,
        policyState
      ] of Object.entries(
        expected
      )
    ) {
      const {
        policy
      } =
        buildAutonomousRepairPolicyDayFromSources({
          dayKey,

          generatedAt:
            "2026-09-15T22:00:00.000Z"
        });

      assert.equal(
        policy.policyState,
        policyState,
        dayKey
      );

      assert.equal(
        policy.summary.decisionCount,
        2,
        dayKey
      );

      assert.equal(
        policy.summary.observationOnlyCount,
        2,
        dayKey
      );

      assert.equal(
        policy.summary.candidateCount,
        0,
        dayKey
      );

      assert.equal(
        policy.summary.quarantineCount,
        0,
        dayKey
      );

      assert.equal(
        policy.summary.hardBlockCount,
        0,
        dayKey
      );

      assert.equal(
        policy.authority.repairAuthorized,
        false,
        dayKey
      );

      assert.equal(
        policy.authority.executionAuthorized,
        false,
        dayKey
      );
    }

    assert.equal(
      fs.existsSync(
        new URL(
          "../../data/autonomous-repair-policy",
          import.meta.url
        )
      ),
      false
    );
  }
);

test(
  "source-bound daily policy fingerprint ignores generatedAt-only churn",
  () => {
    const first =
      buildAutonomousRepairPolicyDayFromSources({
        dayKey:
          "2026-09-11",

        generatedAt:
          "2026-09-15T22:00:00.000Z"
      }).policy;

    const second =
      buildAutonomousRepairPolicyDayFromSources({
        dayKey:
          "2026-09-11",

        generatedAt:
          "2026-09-16T03:00:00.000Z"
      }).policy;

    assert.equal(
      first.policyFingerprint,
      second.policyFingerprint
    );

    assert.deepEqual(
      first.decisions,
      second.decisions
    );
  }
);

test(
  "CLI is read-only requires an explicit day and rejects output write and repair modes",
  () => {
    assert.deepEqual(
      parseAutonomousRepairPolicyDayCliArgs([
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
          "--output",
          "x.json"
        ],

        []
      ]
    ) {
      assert.throws(
        () =>
          parseAutonomousRepairPolicyDayCliArgs(
            argv
          )
      );
    }
  }
);
