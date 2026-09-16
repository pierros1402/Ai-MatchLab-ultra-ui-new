import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAutonomousRepairPolicyVerificationFromSources,
  parseAutonomousRepairPolicyVerificationCliArgs
} from "./build-autonomous-repair-policy-verification-day.js";

test(
  "real 09-11 policies independently verify from raw source-bound evidence",
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
        verification
      } =
        buildAutonomousRepairPolicyVerificationFromSources({
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
        verification.expectedPolicyState,
        "OBSERVATION_ONLY",
        dayKey
      );

      assert.deepEqual(
        verification.mismatchReasons,
        [],
        dayKey
      );

      assert.deepEqual(
        verification.candidateDecisionIds,
        [],
        dayKey
      );

      assert.equal(
        verification.authority.repairAuthorized,
        false,
        dayKey
      );
    }

    assert.equal(
      fs.existsSync(
        new URL(
          "../../data/autonomous-repair-verification",
          import.meta.url
        )
      ),
      false
    );
  }
);

test(
  "real source-bound independent verification fingerprint ignores generatedAt-only churn",
  () => {
    const first =
      buildAutonomousRepairPolicyVerificationFromSources({
        dayKey:
          "2026-09-11",

        generatedAt:
          "2026-09-16T07:00:00.000Z"
      }).verification;

    const second =
      buildAutonomousRepairPolicyVerificationFromSources({
        dayKey:
          "2026-09-11",

        generatedAt:
          "2026-09-16T08:00:00.000Z"
      }).verification;

    assert.equal(
      first.verificationFingerprint,
      second.verificationFingerprint
    );
  }
);

test(
  "independent verifier CLI is read-only and rejects mutation authorization and output modes",
  () => {
    assert.deepEqual(
      parseAutonomousRepairPolicyVerificationCliArgs([
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
          "--output",
          "x.json"
        ]
      ]
    ) {
      assert.throws(
        () =>
          parseAutonomousRepairPolicyVerificationCliArgs(
            argv
          )
      );
    }
  }
);
