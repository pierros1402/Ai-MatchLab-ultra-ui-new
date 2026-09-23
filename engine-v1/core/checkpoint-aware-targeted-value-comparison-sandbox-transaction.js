import {
  createHash
} from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const CHECKPOINT_AWARE_VALUE_COMPARISON_SANDBOX_SIMULATION_SCHEMA =
  "ai-matchlab.checkpoint-aware-value-comparison-sandbox-transaction.v1";

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

const SHA256_RE =
  /^[0-9a-f]{64}$/u;

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

function sha256Buffer(
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

function isContained(
  parentPath,
  childPath
) {
  const relative =
    path.relative(
      parentPath,
      childPath
    );

  return (
    relative ===
      "" ||
    (
      relative !==
        ".." &&
      !relative.startsWith(
        `..${path.sep}`
      ) &&
      !path.isAbsolute(
        relative
      )
    )
  );
}

function exactTargetPaths(
  dayKey
) {
  return [
    `data/value-comparison/${dayKey}.json`,
    "data/value-comparison/cumulative.json"
  ];
}

function validateRelativeTarget({
  dayKey,
  value
}) {
  const target =
    clean(
      value
    );

  if (
    !exactTargetPaths(
      dayKey
    )
      .includes(
        target
      )
  ) {
    throw new Error(
      "value_comparison_sandbox_target_outside_exact_scope"
    );
  }

  if (
    target.includes(
      "\\"
    ) ||
    target.includes(
      "\0"
    ) ||
    path.isAbsolute(
      target
    ) ||
    target
      .split(
        "/"
      )
      .some(
        part =>
          !part ||
          part ===
            "." ||
          part ===
            ".."
      )
  ) {
    throw new Error(
      "value_comparison_sandbox_target_path_invalid"
    );
  }

  return target;
}

function validateSandboxRoot(
  sandboxRoot
) {
  const root =
    path.resolve(
      clean(
        sandboxRoot
      )
    );

  const tempRoot =
    fs.realpathSync(
      os.tmpdir()
    );

  if (
    !path.isAbsolute(
      root
    ) ||
    root ===
      tempRoot ||
    !isContained(
      tempRoot,
      root
    )
  ) {
    throw new Error(
      "value_comparison_sandbox_root_must_be_under_os_tmpdir"
    );
  }

  if (
    fs.existsSync(
      root
    )
  ) {
    throw new Error(
      "value_comparison_sandbox_root_must_not_preexist"
    );
  }

  return root;
}

function writeExclusiveVerified(
  file,
  buffer
) {
  fs.mkdirSync(
    path.dirname(
      file
    ),
    {
      recursive:
        true
    }
  );

  let descriptor =
    null;

  try {
    descriptor =
      fs.openSync(
        file,
        "wx"
      );

    fs.writeFileSync(
      descriptor,
      buffer
    );

    fs.fsyncSync(
      descriptor
    );
  }
  finally {
    if (
      descriptor !==
        null
    ) {
      fs.closeSync(
        descriptor
      );
    }
  }

  const persisted =
    fs.readFileSync(
      file
    );

  if (
    !persisted.equals(
      buffer
    )
  ) {
    throw new Error(
      "value_comparison_sandbox_persisted_bytes_mismatch"
    );
  }

  return {
    sha256:
      sha256Buffer(
        persisted
      ),

    bytes:
      persisted.length
  };
}

function fileIdentity(
  file
) {
  if (
    !fs.existsSync(
      file
    )
  ) {
    return {
      exists:
        false,
      sha256:
        null,
      bytes:
        0
    };
  }

  const stat =
    fs.lstatSync(
      file
    );

  if (
    stat.isSymbolicLink() ||
    !stat.isFile()
  ) {
    return {
      exists:
        true,
      invalidType:
        true,
      sha256:
        null,
      bytes:
        0
    };
  }

  const buffer =
    fs.readFileSync(
      file
    );

  return {
    exists:
      true,
    invalidType:
      false,
    sha256:
      sha256Buffer(
        buffer
      ),
    bytes:
      buffer.length
  };
}

function normalizeTarget({
  dayKey,
  target
}) {
  if (
    !target ||
    typeof target !==
      "object" ||
    Array.isArray(
      target
    )
  ) {
    throw new Error(
      "value_comparison_sandbox_target_invalid"
    );
  }

  const targetPath =
    validateRelativeTarget({
      dayKey,
      value:
        target.targetPath
    });

  if (
    !Buffer.isBuffer(
      target.preimageBuffer
    ) ||
    target
      .preimageBuffer
      .length <=
        0
  ) {
    throw new Error(
      "value_comparison_sandbox_preimage_buffer_required"
    );
  }

  if (
    !Buffer.isBuffer(
      target.postimageBuffer
    ) ||
    target
      .postimageBuffer
      .length <=
        0
  ) {
    throw new Error(
      "value_comparison_sandbox_postimage_buffer_required"
    );
  }

  const actualPreimageSha =
    sha256Buffer(
      target
        .preimageBuffer
    );

  const expectedPreimageSha =
    clean(
      target
        .expectedPreimageSha256
    );

  if (
    !SHA256_RE.test(
      expectedPreimageSha
    ) ||
    actualPreimageSha !==
      expectedPreimageSha
  ) {
    throw new Error(
      "value_comparison_sandbox_preimage_hash_mismatch"
    );
  }

  const actualPostimageSha =
    sha256Buffer(
      target
        .postimageBuffer
    );

  const expectedPostimageSha =
    clean(
      target
        .expectedPostimageSha256
    );

  if (
    !SHA256_RE.test(
      expectedPostimageSha
    ) ||
    actualPostimageSha !==
      expectedPostimageSha
  ) {
    throw new Error(
      "value_comparison_sandbox_postimage_hash_mismatch"
    );
  }

  const proposedMutation =
    target.proposedMutation ===
      true;

  if (
    proposedMutation &&
    actualPreimageSha ===
      actualPostimageSha
  ) {
    throw new Error(
      "value_comparison_sandbox_mutation_requires_distinct_postimage"
    );
  }

  return {
    targetPath,
    proposedMutation,
    preimageBuffer:
      target.preimageBuffer,
    postimageBuffer:
      target.postimageBuffer,
    preimageSha256:
      actualPreimageSha,
    postimageSha256:
      actualPostimageSha,
    preimageBytes:
      target
        .preimageBuffer
        .length,
    postimageBytes:
      target
        .postimageBuffer
        .length
  };
}

function targetAbsolutePath({
  sandboxRoot,
  targetPath
}) {
  const absolute =
    path.resolve(
      sandboxRoot,
      ...targetPath.split(
        "/"
      )
    );

  if (
    !isContained(
      sandboxRoot,
      absolute
    ) ||
    absolute ===
      sandboxRoot
  ) {
    throw new Error(
      "value_comparison_sandbox_target_escape"
    );
  }

  return absolute;
}

function assertIdentity({
  file,
  sha256,
  bytes,
  label
}) {
  const identity =
    fileIdentity(
      file
    );

  if (
    !identity.exists ||
    identity.invalidType ||
    identity.sha256 !==
      sha256 ||
    identity.bytes !==
      bytes
  ) {
    throw new Error(
      `value_comparison_sandbox_${label}_identity_mismatch`
    );
  }

  return identity;
}

function replaceThroughVerifiedTemp({
  targetFile,
  buffer,
  suffix,
  expectedSha256,
  expectedBytes
}) {
  const tempFile =
    `${targetFile}.${suffix}.tmp`;

  if (
    fs.existsSync(
      tempFile
    )
  ) {
    throw new Error(
      "value_comparison_sandbox_temp_preexists"
    );
  }

  const tempIdentity =
    writeExclusiveVerified(
      tempFile,
      buffer
    );

  if (
    tempIdentity.sha256 !==
      expectedSha256 ||
    tempIdentity.bytes !==
      expectedBytes
  ) {
    throw new Error(
      "value_comparison_sandbox_temp_identity_mismatch"
    );
  }

  try {
    fs.renameSync(
      tempFile,
      targetFile
    );
  }
  finally {
    if (
      fs.existsSync(
        tempFile
      )
    ) {
      fs.unlinkSync(
        tempFile
      );
    }
  }

  return assertIdentity({
    file:
      targetFile,
    sha256:
      expectedSha256,
    bytes:
      expectedBytes,
    label:
      "post_replace"
  });
}

export function simulateCheckpointAwareValueComparisonSandboxTransaction({
  dayKey,
  sandboxRoot,
  targets,
  injectFailureAfterOperation =
    null
} = {}) {
  const day =
    clean(
      dayKey
    );

  if (
    !DAY_RE.test(
      day
    )
  ) {
    throw new Error(
      "value_comparison_sandbox_day_invalid"
    );
  }

  const root =
    validateSandboxRoot(
      sandboxRoot
    );

  const expectedPaths =
    exactTargetPaths(
      day
    );

  const normalized =
    (
      Array.isArray(
        targets
      )
        ? targets
        : []
    )
      .map(
        target =>
          normalizeTarget({
            dayKey:
              day,
            target
          })
      );

  if (
    normalized.length !==
      2
  ) {
    throw new Error(
      "value_comparison_sandbox_exact_two_targets_required"
    );
  }

  const byPath =
    new Map();

  for (
    const target of
      normalized
  ) {
    if (
      byPath.has(
        target.targetPath
      )
    ) {
      throw new Error(
        "value_comparison_sandbox_duplicate_target"
      );
    }

    byPath.set(
      target.targetPath,
      target
    );
  }

  const orderedTargets =
    expectedPaths.map(
      targetPath => {
        const target =
          byPath.get(
            targetPath
          );

        if (!target) {
          throw new Error(
            "value_comparison_sandbox_exact_target_missing"
          );
        }

        return target;
      }
    );

  const mutableTargets =
    orderedTargets.filter(
      target =>
        target.proposedMutation
    );

  if (
    injectFailureAfterOperation !==
      null &&
    (
      !Number.isInteger(
        injectFailureAfterOperation
      ) ||
      injectFailureAfterOperation <=
        0
    )
  ) {
    throw new Error(
      "value_comparison_sandbox_injected_failure_index_invalid"
    );
  }

  fs.mkdirSync(
    root,
    {
      recursive:
        false
    }
  );

  const backupRoot =
    path.join(
      root,
      ".rollback"
    );

  fs.mkdirSync(
    backupRoot,
    {
      recursive:
        false
    }
  );

  const operationEvidence =
    [];

  let forwardAppliedCount =
    0;

  let forwardVerified =
    false;

  let injectedFailureObserved =
    false;

  let unexpectedError =
    null;

  try {
    for (
      const target of
        orderedTargets
    ) {
      const targetFile =
        targetAbsolutePath({
          sandboxRoot:
            root,
          targetPath:
            target.targetPath
        });

      const backupFile =
        path.join(
          backupRoot,
          `${expectedPaths.indexOf(
            target.targetPath
          )}.preimage.bin`
        );

      const initialIdentity =
        writeExclusiveVerified(
          targetFile,
          target.preimageBuffer
        );

      if (
        initialIdentity.sha256 !==
          target.preimageSha256 ||
        initialIdentity.bytes !==
          target.preimageBytes
      ) {
        throw new Error(
          "value_comparison_sandbox_initial_preimage_identity_mismatch"
        );
      }

      const backupIdentity =
        writeExclusiveVerified(
          backupFile,
          target.preimageBuffer
        );

      if (
        backupIdentity.sha256 !==
          target.preimageSha256 ||
        backupIdentity.bytes !==
          target.preimageBytes
      ) {
        throw new Error(
          "value_comparison_sandbox_backup_identity_mismatch"
        );
      }

      operationEvidence.push({
        targetPath:
          target.targetPath,
        proposedMutation:
          target.proposedMutation,
        preimageSha256:
          target.preimageSha256,
        postimageSha256:
          target.postimageSha256,
        preimageBytes:
          target.preimageBytes,
        postimageBytes:
          target.postimageBytes,
        forwardApplied:
          false,
        forwardVerified:
          false,
        rollbackApplied:
          false,
        rollbackVerified:
          false
      });
    }

    for (
      const target of
        mutableTargets
    ) {
      const targetFile =
        targetAbsolutePath({
          sandboxRoot:
            root,
          targetPath:
            target.targetPath
        });

      assertIdentity({
        file:
          targetFile,
        sha256:
          target.preimageSha256,
        bytes:
          target.preimageBytes,
        label:
          "forward_preimage"
      });

      replaceThroughVerifiedTemp({
        targetFile,
        buffer:
          target.postimageBuffer,
        suffix:
          `forward-${forwardAppliedCount + 1}`,
        expectedSha256:
          target.postimageSha256,
        expectedBytes:
          target.postimageBytes
      });

      const row =
        operationEvidence.find(
          item =>
            item.targetPath ===
              target.targetPath
        );

      row.forwardApplied =
        true;

      row.forwardVerified =
        true;

      forwardAppliedCount +=
        1;

      if (
        injectFailureAfterOperation !==
          null &&
        forwardAppliedCount ===
          injectFailureAfterOperation
      ) {
        injectedFailureObserved =
          true;

        throw new Error(
          "value_comparison_sandbox_injected_failure"
        );
      }
    }

    for (
      const target of
        mutableTargets
    ) {
      const targetFile =
        targetAbsolutePath({
          sandboxRoot:
            root,
          targetPath:
            target.targetPath
        });

      assertIdentity({
        file:
          targetFile,
        sha256:
          target.postimageSha256,
        bytes:
          target.postimageBytes,
        label:
          "forward_terminal"
      });
    }

    forwardVerified =
      true;
  }
  catch (
    error
  ) {
    if (
      !injectedFailureObserved
    ) {
      unexpectedError =
        error;
    }
  }

  let rollbackVerified =
    false;

  try {
    for (
      const target of
        [
          ...mutableTargets
        ]
          .reverse()
    ) {
      const row =
        operationEvidence.find(
          item =>
            item.targetPath ===
              target.targetPath
        );

      if (
        !row
          ?.forwardApplied
      ) {
        continue;
      }

      const targetFile =
        targetAbsolutePath({
          sandboxRoot:
            root,
          targetPath:
            target.targetPath
        });

      const backupFile =
        path.join(
          backupRoot,
          `${expectedPaths.indexOf(
            target.targetPath
          )}.preimage.bin`
        );

      const backup =
        fs.readFileSync(
          backupFile
        );

      if (
        sha256Buffer(
          backup
        ) !==
          target.preimageSha256 ||
        backup.length !==
          target.preimageBytes
      ) {
        throw new Error(
          "value_comparison_sandbox_rollback_backup_drift"
        );
      }

      replaceThroughVerifiedTemp({
        targetFile,
        buffer:
          backup,
        suffix:
          `rollback-${expectedPaths.indexOf(
            target.targetPath
          )}`,
        expectedSha256:
          target.preimageSha256,
        expectedBytes:
          target.preimageBytes
      });

      row.rollbackApplied =
        true;

      row.rollbackVerified =
        true;
    }

    for (
      const target of
        orderedTargets
    ) {
      const targetFile =
        targetAbsolutePath({
          sandboxRoot:
            root,
          targetPath:
            target.targetPath
        });

      assertIdentity({
        file:
          targetFile,
        sha256:
          target.preimageSha256,
        bytes:
          target.preimageBytes,
        label:
          "rollback_terminal"
      });
    }

    rollbackVerified =
      true;
  }
  catch (
    rollbackError
  ) {
    throw new Error(
      `value_comparison_sandbox_rollback_failed:${rollbackError?.message || rollbackError}`
    );
  }

  if (
    unexpectedError
  ) {
    throw unexpectedError;
  }

  const simulationState =
    mutableTargets.length ===
      0
      ? "NO_MUTATION_REQUIRED"
      : injectedFailureObserved
        ? "INJECTED_FAILURE_ROLLED_BACK"
        : "SIMULATED_AND_ROLLED_BACK";

  return {
    schema:
      CHECKPOINT_AWARE_VALUE_COMPARISON_SANDBOX_SIMULATION_SCHEMA,

    version:
      "1.0.0",

    mode:
      "ISOLATED_SANDBOX_TRANSACTION_SIMULATION",

    dayKey:
      day,

    simulationState,

    productionRepositoryTarget:
      false,

    sandboxRoot:
      root,

    exactTargetScope:
      expectedPaths,

    proposedMutationCount:
      mutableTargets.length,

    forwardAppliedCount,

    forwardVerified,

    injectedFailureObserved,

    rollbackVerified,

    operationEvidence,

    productionAuthority: {
      rawPostimageAuthorityReusable:
        false,

      authorizationArtifactCreated:
        false,

      signerUseAuthorized:
        false,

      productionKernelInvoked:
        false,

      productionRepositoryWriteAuthorized:
        false
    }
  };
}
