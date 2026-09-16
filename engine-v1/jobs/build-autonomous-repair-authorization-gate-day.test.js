import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import {
  buildAutonomousRepairAuthorizationGateFromSources,
  parseAutonomousRepairAuthorizationGateCliArgs
} from "./build-autonomous-repair-authorization-gate-day.js";

test(
  "real 09-11 have no repair candidates and therefore cannot request authorization",
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
        gate
      } =
        buildAutonomousRepairAuthorizationGateFromSources({
          dayKey,

          generatedAt:
            "2026-09-15T22:30:00.000Z"
        });

      assert.equal(
        policy.policyState,
        "OBSERVATION_ONLY",
        dayKey
      );

      assert.equal(
        policy.summary.candidateCount,
        0,
        dayKey
      );

      assert.equal(
        gate.gateState,
        "NOT_REQUESTABLE_NO_CANDIDATES",
        dayKey
      );

      assert.equal(
        gate.authority.authorizationRequestEligible,
        false,
        dayKey
      );

      assert.equal(
        gate.authority.authorizationGranted,
        false,
        dayKey
      );

      assert.equal(
        gate.authority.repairAuthorized,
        false,
        dayKey
      );

      assert.equal(
        gate.authority.executionAuthorized,
        false,
        dayKey
      );
    }

    assert.equal(
      fs.existsSync(
        new URL(
          "../../data/autonomous-repair-authorization",
          import.meta.url
        )
      ),
      false
    );
  }
);

test(
  "real source-bound gate fingerprint ignores generatedAt-only churn",
  () => {
    const first =
      buildAutonomousRepairAuthorizationGateFromSources({
        dayKey:
          "2026-09-11",

        generatedAt:
          "2026-09-15T22:30:00.000Z"
      }).gate;

    const second =
      buildAutonomousRepairAuthorizationGateFromSources({
        dayKey:
          "2026-09-11",

        generatedAt:
          "2026-09-16T05:00:00.000Z"
      }).gate;

    assert.equal(
      first.gateFingerprint,
      second.gateFingerprint
    );

    assert.notEqual(
      first.generatedAt,
      second.generatedAt
    );
  }
);

test(
  "gate CLI is read-only and rejects write authorize repair execute and output modes",
  () => {
    assert.deepEqual(
      parseAutonomousRepairAuthorizationGateCliArgs([
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
          "--authorize"
        ],
        [
          "--day",
          "2026-09-11",
          "--repair"
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
          parseAutonomousRepairAuthorizationGateCliArgs(
            argv
          )
      );
    }
  }
);
