import test from "node:test";
import assert from "node:assert/strict";
import {
  spawnSync
} from "node:child_process";
import {
  fileURLToPath
} from "node:url";

import {
  buildAutonomousRepairTargetVerificationFromSources,
  parseAutonomousRepairTargetVerificationCliArgs
} from "./build-autonomous-repair-target-verification-day.js";

import {
  AUTONOMOUS_REPAIR_TARGET_VERIFICATION_STATE,
  validateAutonomousRepairTargetVerificationArtifact
} from "../core/autonomous-repair-target-verifier.js";

test(
  "real 09-11 source-bound plans produce read-only no-action target verification",
  () => {
    for (
      const dayKey of [
        "2026-09-09",
        "2026-09-10",
        "2026-09-11"
      ]
    ) {
      const result =
        buildAutonomousRepairTargetVerificationFromSources({
          dayKey,
          generatedAt:
            "2026-09-16T10:00:00.000Z"
        });

      assert.equal(
        result.plan.planState,
        "NO_ACTION_NOT_REQUESTABLE",
        dayKey
      );

      assert.equal(
        result.targetVerification.verificationState,
        AUTONOMOUS_REPAIR_TARGET_VERIFICATION_STATE.NO_ACTION,
        dayKey
      );

      assert.equal(
        result.targetVerification.summary.operationCount,
        0,
        dayKey
      );

      assert.equal(
        result.targetVerification.summary.blockerCount,
        0,
        dayKey
      );

      assert.equal(
        result.targetVerification.planFingerprint,
        result.plan.planFingerprint,
        dayKey
      );

      assert.equal(
        result.targetVerification.authority.readOnly,
        true,
        dayKey
      );

      assert.equal(
        result.targetVerification.authority.filesystemWriteAuthorized,
        false,
        dayKey
      );

      assert.equal(
        result.targetVerification.authority.repairAuthorized,
        false,
        dayKey
      );

      assert.equal(
        result.targetVerification.authority.executionAuthorized,
        false,
        dayKey
      );

      assert.equal(
        validateAutonomousRepairTargetVerificationArtifact(
          result.targetVerification
        ),
        true,
        dayKey
      );
    }
  }
);

test(
  "real source-bound target verification fingerprint ignores generatedAt-only churn",
  () => {
    const first =
      buildAutonomousRepairTargetVerificationFromSources({
        dayKey:
          "2026-09-11",
        generatedAt:
          "2026-09-16T10:00:00.000Z"
      }).targetVerification;

    const second =
      buildAutonomousRepairTargetVerificationFromSources({
        dayKey:
          "2026-09-11",
        generatedAt:
          "2026-09-16T11:00:00.000Z"
      }).targetVerification;

    assert.equal(
      first.verificationFingerprint,
      second.verificationFingerprint
    );

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
  "target verification CLI is read-only and rejects mutation output and root override modes",
  () => {
    assert.deepEqual(
      parseAutonomousRepairTargetVerificationCliArgs([
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
          "verification.json"
        ],
        [
          "--day",
          "2026-09-11",
          "--output=verification.json"
        ],
        [
          "--day",
          "2026-09-11",
          "--project-root",
          "C:\\other"
        ],
        [
          "--day",
          "2026-09-11",
          "--project-root=C:\\other"
        ]
      ]
    ) {
      assert.throws(
        () =>
          parseAutonomousRepairTargetVerificationCliArgs(
            argv
          )
      );
    }
  }
);

test(
  "direct CLI emits one valid source-bound verification artifact to stdout only",
  () => {
    const jobPath =
      fileURLToPath(
        new URL(
          "./build-autonomous-repair-target-verification-day.js",
          import.meta.url
        )
      );

    const run =
      spawnSync(
        process.execPath,
        [
          jobPath,
          "--day",
          "2026-09-11"
        ],
        {
          encoding:
            "utf8"
        }
      );

    assert.equal(
      run.status,
      0,
      run.stderr
    );

    assert.equal(
      run.stderr,
      ""
    );

    const artifact =
      JSON.parse(
        run.stdout
      );

    assert.equal(
      artifact.dayKey,
      "2026-09-11"
    );

    assert.equal(
      artifact.verificationState,
      AUTONOMOUS_REPAIR_TARGET_VERIFICATION_STATE.NO_ACTION
    );

    assert.equal(
      artifact.summary.operationCount,
      0
    );

    assert.equal(
      artifact.authority.readOnly,
      true
    );

    assert.equal(
      artifact.authority.filesystemWriteAuthorized,
      false
    );

    assert.equal(
      validateAutonomousRepairTargetVerificationArtifact(
        artifact
      ),
      true
    );
  }
);
