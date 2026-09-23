import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createHash
} from "node:crypto";

import {
  simulateCheckpointAwareValueComparisonSandboxTransaction
} from "../core/checkpoint-aware-targeted-value-comparison-sandbox-transaction.js";

const DAY =
  "2026-09-23";

function sha256(
  buffer
) {
  return createHash(
    "sha256"
  )
    .update(
      buffer
    )
    .digest(
      "hex"
    );
}

function fixtureTargets({
  dayMutation = true,
  cumulativeMutation = false
} = {}) {
  const dayBefore =
    Buffer.from(
      "{\"day\":\"before\"}\n",
      "utf8"
    );

  const dayAfter =
    Buffer.from(
      "{\"day\":\"after\"}\n",
      "utf8"
    );

  const cumulativeBefore =
    Buffer.from(
      "{\"cumulative\":\"before\"}\n",
      "utf8"
    );

  const cumulativeAfter =
    Buffer.from(
      "{\"cumulative\":\"after\"}\n",
      "utf8"
    );

  return [
    {
      targetPath:
        `data/value-comparison/${DAY}.json`,
      proposedMutation:
        dayMutation,
      preimageBuffer:
        dayBefore,
      postimageBuffer:
        dayAfter,
      expectedPreimageSha256:
        sha256(
          dayBefore
        ),
      expectedPostimageSha256:
        sha256(
          dayAfter
        )
    },
    {
      targetPath:
        "data/value-comparison/cumulative.json",
      proposedMutation:
        cumulativeMutation,
      preimageBuffer:
        cumulativeBefore,
      postimageBuffer:
        cumulativeAfter,
      expectedPreimageSha256:
        sha256(
          cumulativeBefore
        ),
      expectedPostimageSha256:
        sha256(
          cumulativeAfter
        )
    }
  ];
}

function newSandboxPath(
  label
) {
  return path.join(
    os.tmpdir(),
    `aiml-r12-${label}-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

function cleanup(
  root
) {
  fs.rmSync(
    root,
    {
      recursive:
        true,
      force:
        true
    }
  );
}

test(
  "one-target sandbox transaction applies exact bytes and restores the exact preimage",
  () => {
    const root =
      newSandboxPath(
        "one"
      );

    try {
      const result =
        simulateCheckpointAwareValueComparisonSandboxTransaction({
          dayKey:
            DAY,
          sandboxRoot:
            root,
          targets:
            fixtureTargets({
              dayMutation:
                true,
              cumulativeMutation:
                false
            })
        });

      assert.equal(
        result.simulationState,
        "SIMULATED_AND_ROLLED_BACK"
      );

      assert.equal(
        result.proposedMutationCount,
        1
      );

      assert.equal(
        result.forwardVerified,
        true
      );

      assert.equal(
        result.rollbackVerified,
        true
      );

      const mutated =
        result
          .operationEvidence
          .find(
            row =>
              row.proposedMutation
          );

      assert.equal(
        mutated.forwardVerified,
        true
      );

      assert.equal(
        mutated.rollbackVerified,
        true
      );
    }
    finally {
      cleanup(
        root
      );
    }
  }
);

test(
  "two-target sandbox transaction remains exact and rolls both targets back",
  () => {
    const root =
      newSandboxPath(
        "two"
      );

    try {
      const result =
        simulateCheckpointAwareValueComparisonSandboxTransaction({
          dayKey:
            DAY,
          sandboxRoot:
            root,
          targets:
            fixtureTargets({
              dayMutation:
                true,
              cumulativeMutation:
                true
            })
        });

      assert.equal(
        result.proposedMutationCount,
        2
      );

      assert.equal(
        result.forwardAppliedCount,
        2
      );

      assert.equal(
        result.rollbackVerified,
        true
      );

      assert.equal(
        result
          .operationEvidence
          .filter(
            row =>
              row.rollbackVerified
          )
          .length,
        2
      );
    }
    finally {
      cleanup(
        root
      );
    }
  }
);

test(
  "injected failure after first replacement rolls the applied target back",
  () => {
    const root =
      newSandboxPath(
        "failure"
      );

    try {
      const result =
        simulateCheckpointAwareValueComparisonSandboxTransaction({
          dayKey:
            DAY,
          sandboxRoot:
            root,
          targets:
            fixtureTargets({
              dayMutation:
                true,
              cumulativeMutation:
                true
            }),
          injectFailureAfterOperation:
            1
        });

      assert.equal(
        result.simulationState,
        "INJECTED_FAILURE_ROLLED_BACK"
      );

      assert.equal(
        result.injectedFailureObserved,
        true
      );

      assert.equal(
        result.forwardAppliedCount,
        1
      );

      assert.equal(
        result.rollbackVerified,
        true
      );
    }
    finally {
      cleanup(
        root
      );
    }
  }
);

test(
  "preimage hash drift fails closed before transaction setup",
  () => {
    const root =
      newSandboxPath(
        "preimage-drift"
      );

    const targets =
      fixtureTargets();

    targets[0]
      .expectedPreimageSha256 =
        "0".repeat(
          64
        );

    assert.throws(
      () =>
        simulateCheckpointAwareValueComparisonSandboxTransaction({
          dayKey:
            DAY,
          sandboxRoot:
            root,
          targets
        }),
      /preimage_hash_mismatch/u
    );

    assert.equal(
      fs.existsSync(
        root
      ),
      false
    );
  }
);

test(
  "unexpected target path fails closed instead of broadening transaction scope",
  () => {
    const root =
      newSandboxPath(
        "scope"
      );

    const targets =
      fixtureTargets();

    targets[1]
      .targetPath =
        "data/deploy-snapshots/2026-09-23/value.json";

    assert.throws(
      () =>
        simulateCheckpointAwareValueComparisonSandboxTransaction({
          dayKey:
            DAY,
          sandboxRoot:
            root,
          targets
        }),
      /outside_exact_scope/u
    );

    assert.equal(
      fs.existsSync(
        root
      ),
      false
    );
  }
);

test(
  "sandbox root outside OS temp is rejected",
  () => {
    const root =
      path.resolve(
        process.cwd(),
        "not-a-valid-r12-sandbox"
      );

    assert.throws(
      () =>
        simulateCheckpointAwareValueComparisonSandboxTransaction({
          dayKey:
            DAY,
          sandboxRoot:
            root,
          targets:
            fixtureTargets()
        }),
      /must_be_under_os_tmpdir/u
    );
  }
);

test(
  "zero-mutation simulation performs no forward writes and still verifies rollback state",
  () => {
    const root =
      newSandboxPath(
        "noop"
      );

    try {
      const result =
        simulateCheckpointAwareValueComparisonSandboxTransaction({
          dayKey:
            DAY,
          sandboxRoot:
            root,
          targets:
            fixtureTargets({
              dayMutation:
                false,
              cumulativeMutation:
                false
            })
        });

      assert.equal(
        result.simulationState,
        "NO_MUTATION_REQUIRED"
      );

      assert.equal(
        result.forwardAppliedCount,
        0
      );

      assert.equal(
        result.rollbackVerified,
        true
      );
    }
    finally {
      cleanup(
        root
      );
    }
  }
);

test(
  "sandbox simulation runner has no production kernel signer git push commit or deploy machinery",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "../jobs/run-checkpoint-aware-targeted-value-comparison-sandbox-simulation-day.js",
          import.meta.url
        ),
        "utf8"
      );

    for (
      const forbidden of [
        "executeAutonomousRepairProductionExecution",
        "executeAutonomousRepairFilesystemTransaction",
        "privateKey",
        "sign(",
        "git push",
        "git commit",
        "gh workflow",
        "workflow_dispatch",
        "RENDER_"
      ]
    ) {
      assert.equal(
        source.includes(
          forbidden
        ),
        false,
        `R12 runner must not contain ${forbidden}`
      );
    }
  }
);
