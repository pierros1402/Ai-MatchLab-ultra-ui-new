import fs from "node:fs";
import path from "node:path";
import {
  createHash
} from "node:crypto";

export const AUTONOMOUS_REPAIR_TARGET_VERIFICATION_SCHEMA =
  "ai-matchlab.autonomous-repair-target-verification.v1";

export const AUTONOMOUS_REPAIR_TARGET_VERIFICATION_VERSION =
  "1.0.0";

export const AUTONOMOUS_REPAIR_TARGET_VERIFICATION_STATE =
  Object.freeze({
    NO_ACTION:
      "NO_ACTION_NO_OPERATIONS",
    VERIFIED:
      "TARGETS_VERIFIED",
    BLOCKED:
      "BLOCKED_TARGET_PREIMAGE"
  });

const PLAN_SCHEMA =
  "ai-matchlab.autonomous-repair-plan.v1";

const PLAN_VERSION =
  "1.0.0";

const VALID_OPERATION_ID =
  /^arpo_v1_[0-9a-f]{24}$/u;

const VALID_SHA =
  /^[0-9a-f]{64}$/u;

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(
      stableValue
    );
  }

  if (
    value &&
    typeof value ===
      "object"
  ) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(
          key => [
            key,
            stableValue(
              value[key]
            )
          ]
        )
    );
  }

  return value;
}

function sha256Value(value) {
  return createHash(
    "sha256"
  )
    .update(
      JSON.stringify(
        stableValue(value)
      )
    )
    .digest(
      "hex"
    );
}

function sha256Buffer(value) {
  return createHash(
    "sha256"
  )
    .update(value)
    .digest(
      "hex"
    );
}

function validSha(value) {
  return VALID_SHA.test(
    clean(value)
  );
}

function normalizeTargetPath(value) {
  const normalized =
    clean(value)
      .replace(
        /\\/gu,
        "/"
      )
      .replace(
        /^\.\/+/u,
        ""
      );

  if (
    !normalized ||
    normalized.startsWith("/") ||
    /^[A-Za-z]:\//u.test(
      normalized
    ) ||
    normalized
      .split("/")
      .includes("..")
  ) {
    return null;
  }

  return normalized;
}

function protectedPath(targetPath) {
  const lower =
    targetPath.toLowerCase();

  return (
    lower.startsWith(".git/") ||
    lower.startsWith(".github/") ||
    lower.startsWith("engine-v1/") ||
    lower.startsWith("assets/") ||
    lower.startsWith("workers/") ||
    lower.startsWith("scripts/") ||
    lower === "package.json" ||
    lower === "package-lock.json" ||
    lower.includes("/value.json") ||
    lower.includes("/value-plans/") ||
    lower.includes("/value-comparison/") ||
    lower.includes("/observations.json") ||
    lower.includes("/observations/")
  );
}

function targetMatchesRepairClass({
  dayKey,
  repairClass,
  canonicalId,
  targetPath
}) {
  if (
    repairClass ===
    "ACQUIRE_VERIFIED_FINAL_EVIDENCE"
  ) {
    return (
      targetPath ===
      `data/final-results/${dayKey}/${canonicalId}.json`
    );
  }

  if (
    repairClass ===
    "REBUILD_HISTORY_ELIGIBLE_ROW"
  ) {
    return (
      targetPath.startsWith(
        "data/history/"
      ) ||
      targetPath.startsWith(
        "data/league-memory/results/"
      )
    );
  }

  if (
    repairClass ===
    "REBUILD_PUBLICATION_CANONICAL_ROW"
  ) {
    return (
      targetPath.startsWith(
        `data/deploy-snapshots/${dayKey}/`
      ) &&
      !protectedPath(
        targetPath
      )
    );
  }

  return false;
}

function insideRoot(
  root,
  candidate
) {
  const relative =
    path.relative(
      root,
      candidate
    );

  return (
    relative === "" ||
    (
      relative !== ".." &&
      !relative.startsWith(
        `..${path.sep}`
      ) &&
      !path.isAbsolute(
        relative
      )
    )
  );
}

function blocker(
  code,
  operationId = null,
  targetPath = null
) {
  return {
    code,
    operationId,
    targetPath
  };
}

function compareBlockers(a, b) {
  return [
    a.code,
    a.operationId ?? "",
    a.targetPath ?? ""
  ]
    .join("\u0000")
    .localeCompare(
      [
        b.code,
        b.operationId ?? "",
        b.targetPath ?? ""
      ].join("\u0000")
    );
}

function compareEvidence(a, b) {
  return [
    a.targetPath,
    a.operationId
  ]
    .join("\u0000")
    .localeCompare(
      [
        b.targetPath,
        b.operationId
      ].join("\u0000")
    );
}

function planFingerprintInput(
  plan
) {
  return {
    schema:
      plan.schema,
    version:
      plan.version,
    dayKey:
      plan.dayKey,
    bindings:
      plan.bindings,
    planState:
      plan.planState,
    summary:
      plan.summary,
    candidateDecisionIds:
      plan.candidateDecisionIds,
    operations:
      plan.operations,
    blockers:
      plan.blockers,
    authority:
      plan.authority
  };
}

function expectedOperationId(
  operation
) {
  const identity = {
    candidateDecisionId:
      operation.candidateDecisionId,
    repairClass:
      operation.repairClass,
    canonicalId:
      operation.canonicalId,
    targetPath:
      operation.targetPath,
    mutationMode:
      operation.mutationMode,
    precondition:
      operation.precondition,
    planned:
      operation.planned,
    rollback:
      operation.rollback
  };

  return `arpo_v1_${sha256Value(identity).slice(0, 24)}`;
}

function assertPlan(
  plan
) {
  if (
    !plan ||
    typeof plan !==
      "object" ||
    Array.isArray(plan) ||
    plan.schema !==
      PLAN_SCHEMA ||
    plan.version !==
      PLAN_VERSION ||
    plan.role !==
      "derived_dry_run_repair_plan" ||
    !Array.isArray(
      plan.operations
    ) ||
    !Array.isArray(
      plan.blockers
    )
  ) {
    throw new Error(
      "autonomous_repair_target_verifier_plan_invalid"
    );
  }

  if (
    !validSha(
      plan.planFingerprint
    )
  ) {
    throw new Error(
      "autonomous_repair_target_verifier_plan_fingerprint_invalid"
    );
  }

  const actualPlanFingerprint =
    sha256Value(
      planFingerprintInput(
        plan
      )
    );

  if (
    actualPlanFingerprint !==
    plan.planFingerprint
  ) {
    throw new Error(
      "autonomous_repair_target_verifier_plan_fingerprint_mismatch"
    );
  }

  if (
    plan.authority
      ?.dryRunOnly !==
      true
  ) {
    throw new Error(
      "autonomous_repair_target_verifier_plan_not_dry_run"
    );
  }

  for (
    const field of [
      "filesystemWriteAuthorized",
      "repairAuthorized",
      "executionAuthorized",
      "rollbackExecutionAuthorized",
      "workflowMutationAuthorized"
    ]
  ) {
    if (
      plan.authority?.[field] !==
      false
    ) {
      throw new Error(
        `autonomous_repair_target_verifier_plan_${field}_invalid`
      );
    }
  }

  if (
    plan.operations.length >
      0 &&
    plan.planState !==
      "DRY_RUN_READY"
  ) {
    throw new Error(
      "autonomous_repair_target_verifier_plan_state_operation_coherence"
    );
  }

  if (
    plan.operations.length ===
      0 &&
    plan.planState ===
      "DRY_RUN_READY"
  ) {
    throw new Error(
      "autonomous_repair_target_verifier_plan_state_operation_coherence"
    );
  }

  if (
    plan.operations.length >
      0 &&
    plan.blockers.length >
      0
  ) {
    throw new Error(
      "autonomous_repair_target_verifier_plan_blocked_with_operations"
    );
  }

  for (
    const operation of
      plan.operations
  ) {
    if (
      !VALID_OPERATION_ID.test(
        clean(
          operation?.operationId
        )
      )
    ) {
      throw new Error(
        "autonomous_repair_target_verifier_operation_id_invalid"
      );
    }

    if (
      expectedOperationId(
        operation
      ) !==
      operation.operationId
    ) {
      throw new Error(
        "autonomous_repair_target_verifier_operation_id_mismatch"
      );
    }
  }
}

function realpathNative(
  value
) {
  if (
    typeof fs.realpathSync
      .native ===
      "function"
  ) {
    return fs.realpathSync
      .native(value);
  }

  return fs.realpathSync(
    value
  );
}

function identityFromStat(
  stat
) {
  return {
    dev:
      String(stat.dev),
    ino:
      String(stat.ino),
    size:
      String(stat.size),
    mtimeNs:
      String(stat.mtimeNs),
    ctimeNs:
      String(stat.ctimeNs),
    symbolic:
      stat.isSymbolicLink(),
    file:
      stat.isFile(),
    directory:
      stat.isDirectory()
  };
}

function statIdentity(
  value
) {
  return identityFromStat(
    fs.lstatSync(
      value,
      {
        bigint:
          true
      }
    )
  );
}

function fdStatIdentity(
  fd
) {
  return identityFromStat(
    fs.fstatSync(
      fd,
      {
        bigint:
          true
      }
    )
  );
}

function sameStatIdentity(
  a,
  b
) {
  return (
    a.dev === b.dev &&
    a.ino === b.ino &&
    a.size === b.size &&
    a.mtimeNs === b.mtimeNs &&
    a.ctimeNs === b.ctimeNs &&
    a.symbolic === b.symbolic &&
    a.file === b.file &&
    a.directory === b.directory
  );
}

function inspectPathChain({
  projectRoot,
  realRoot,
  targetPath
}) {
  const pieces =
    targetPath.split("/");

  let current =
    projectRoot;

  let targetExists =
    true;

  let existingComponentCount =
    0;

  for (
    let index = 0;
    index < pieces.length;
    index += 1
  ) {
    current =
      path.join(
        current,
        pieces[index]
      );

    let stat;

    try {
      stat =
        fs.lstatSync(
          current
        );
    } catch (error) {
      if (
        error?.code ===
        "ENOENT"
      ) {
        targetExists =
          false;
        break;
      }

      return {
        ok:
          false,
        code:
          "TARGET_PATH_LSTAT_FAILED",
        targetExists:
          false,
        existingComponentCount
      };
    }

    existingComponentCount +=
      1;

    if (
      stat.isSymbolicLink()
    ) {
      return {
        ok:
          false,
        code:
          "TARGET_PATH_REPARSE_POINT",
        targetExists:
          index ===
          pieces.length - 1,
        existingComponentCount
      };
    }

    if (
      index <
        pieces.length - 1 &&
      !stat.isDirectory()
    ) {
      return {
        ok:
          false,
        code:
          "TARGET_PATH_COMPONENT_NOT_DIRECTORY",
        targetExists:
          false,
        existingComponentCount
      };
    }

    let physical;

    try {
      physical =
        realpathNative(
          current
        );
    } catch {
      return {
        ok:
          false,
        code:
          "TARGET_PATH_REALPATH_FAILED",
        targetExists:
          index ===
          pieces.length - 1,
        existingComponentCount
      };
    }

    if (
      !insideRoot(
        realRoot,
        physical
      )
    ) {
      return {
        ok:
          false,
        code:
          "TARGET_PATH_PHYSICAL_ROOT_ESCAPE",
        targetExists:
          index ===
          pieces.length - 1,
        existingComponentCount
      };
    }
  }

  return {
    ok:
      true,
    code:
      null,
    targetExists,
    existingComponentCount
  };
}

function verifyOneOperation({
  plan,
  operation,
  projectRoot,
  realRoot,
  duplicateTargetPaths
}) {
  const operationId =
    clean(
      operation.operationId
    );

  const originalTargetPath =
    clean(
      operation.targetPath
    );

  const blockers =
    [];

  const normalizedTargetPath =
    normalizeTargetPath(
      originalTargetPath
    );

  let lexicalContained =
    false;

  let physicalContained =
    false;

  let reparseFree =
    false;

  let parentChainVerified =
    false;

  let targetExists =
    false;

  let actualSha256 =
    null;

  let actualBytes =
    null;

  let preconditionMatches =
    false;

  if (
    !normalizedTargetPath ||
    normalizedTargetPath !==
      originalTargetPath
  ) {
    blockers.push(
      blocker(
        "TARGET_PATH_INVALID",
        operationId,
        originalTargetPath ||
          null
      )
    );
  }

  if (
    normalizedTargetPath &&
    duplicateTargetPaths.has(
      normalizedTargetPath
    )
  ) {
    blockers.push(
      blocker(
        "DUPLICATE_TARGET_PATH",
        operationId,
        normalizedTargetPath
      )
    );
  }

  if (
    normalizedTargetPath &&
    protectedPath(
      normalizedTargetPath
    )
  ) {
    blockers.push(
      blocker(
        "PROTECTED_TARGET_PATH",
        operationId,
        normalizedTargetPath
      )
    );
  }

  if (
    normalizedTargetPath &&
    !targetMatchesRepairClass({
      dayKey:
        plan.dayKey,
      repairClass:
        operation.repairClass,
      canonicalId:
        operation.canonicalId,
      targetPath:
        normalizedTargetPath
    })
  ) {
    blockers.push(
      blocker(
        "TARGET_REPAIR_CLASS_MISMATCH",
        operationId,
        normalizedTargetPath
      )
    );
  }

  let absoluteTarget =
    null;

  if (
    normalizedTargetPath
  ) {
    absoluteTarget =
      path.resolve(
        projectRoot,
        ...normalizedTargetPath
          .split("/")
      );

    lexicalContained =
      insideRoot(
        projectRoot,
        absoluteTarget
      );

    if (
      !lexicalContained
    ) {
      blockers.push(
        blocker(
          "TARGET_PATH_LEXICAL_ROOT_ESCAPE",
          operationId,
          normalizedTargetPath
        )
      );
    }
  }

  if (
    normalizedTargetPath &&
    lexicalContained &&
    blockers.length ===
      0
  ) {
    const chain =
      inspectPathChain({
        projectRoot,
        realRoot,
        targetPath:
          normalizedTargetPath
      });

    targetExists =
      chain.targetExists ===
      true;

    if (!chain.ok) {
      blockers.push(
        blocker(
          chain.code,
          operationId,
          normalizedTargetPath
        )
      );
    } else {
      physicalContained =
        true;

      reparseFree =
        true;

      const componentCount =
        normalizedTargetPath
          .split("/")
          .length;

      parentChainVerified =
        targetExists
          ? chain.existingComponentCount ===
              componentCount
          : chain.existingComponentCount ===
              componentCount - 1;
    }
  }

  const precondition =
    operation.precondition ??
    {};

  if (
    operation.mutationMode ===
      "CREATE"
  ) {
    const contractCoherent =
      precondition.targetExists ===
        false &&
      (
        precondition.expectedSha256 ===
          null ||
        precondition.expectedSha256 ===
          undefined
      );

    if (
      !contractCoherent
    ) {
      blockers.push(
        blocker(
          "CREATE_PRECONDITION_CONTRACT_INVALID",
          operationId,
          normalizedTargetPath
        )
      );
    } else if (
      targetExists
    ) {
      blockers.push(
        blocker(
          "CREATE_TARGET_ALREADY_EXISTS",
          operationId,
          normalizedTargetPath
        )
      );
    } else if (
      blockers.length ===
      0 &&
      !parentChainVerified
    ) {
      blockers.push(
        blocker(
          "TARGET_PARENT_MISSING",
          operationId,
          normalizedTargetPath
        )
      );
    } else if (
      blockers.length ===
      0
    ) {
      preconditionMatches =
        true;
    }
  } else if (
    operation.mutationMode ===
      "REPLACE"
  ) {
    const expectedSha =
      clean(
        precondition.expectedSha256
      );

    const contractCoherent =
      precondition.targetExists ===
        true &&
      validSha(
        expectedSha
      );

    if (
      !contractCoherent
    ) {
      blockers.push(
        blocker(
          "REPLACE_PRECONDITION_CONTRACT_INVALID",
          operationId,
          normalizedTargetPath
        )
      );
    } else if (
      !targetExists
    ) {
      blockers.push(
        blocker(
          "REPLACE_TARGET_MISSING",
          operationId,
          normalizedTargetPath
        )
      );
    } else if (
      blockers.length ===
      0
    ) {
      let before;
      let beforeFd;
      let afterFd;
      let after;
      let physicalBefore;
      let physicalAfter;
      let content;

      let fd =
        null;

      try {
        before =
          statIdentity(
            absoluteTarget
          );

        if (
          before.symbolic
        ) {
          blockers.push(
            blocker(
              "TARGET_PATH_REPARSE_POINT",
              operationId,
              normalizedTargetPath
            )
          );
        } else if (
          !before.file
        ) {
          blockers.push(
            blocker(
              "REPLACE_TARGET_NOT_REGULAR_FILE",
              operationId,
              normalizedTargetPath
            )
          );
        } else {
          physicalBefore =
            realpathNative(
              absoluteTarget
            );

          if (
            !insideRoot(
              realRoot,
              physicalBefore
            )
          ) {
            blockers.push(
              blocker(
                "TARGET_PATH_PHYSICAL_ROOT_ESCAPE",
                operationId,
                normalizedTargetPath
              )
            );
          } else {
            fd =
              fs.openSync(
                physicalBefore,
                "r"
              );

            beforeFd =
              fdStatIdentity(
                fd
              );

            if (
              !sameStatIdentity(
                before,
                beforeFd
              )
            ) {
              blockers.push(
                blocker(
                  "TARGET_CHANGED_DURING_VERIFICATION",
                  operationId,
                  normalizedTargetPath
                )
              );
            } else {
              content =
                fs.readFileSync(
                  fd
                );

              afterFd =
                fdStatIdentity(
                  fd
                );

              after =
                statIdentity(
                  absoluteTarget
                );

              physicalAfter =
                realpathNative(
                  absoluteTarget
                );

              if (
                !sameStatIdentity(
                  before,
                  beforeFd
                ) ||
                !sameStatIdentity(
                  beforeFd,
                  afterFd
                ) ||
                !sameStatIdentity(
                  afterFd,
                  after
                ) ||
                physicalBefore !==
                  physicalAfter
              ) {
                blockers.push(
                  blocker(
                    "TARGET_CHANGED_DURING_VERIFICATION",
                    operationId,
                    normalizedTargetPath
                  )
                );
              } else {
                actualSha256 =
                  sha256Buffer(
                    content
                  );

                actualBytes =
                  content.length;

                if (
                  actualSha256 !==
                    expectedSha
                ) {
                  blockers.push(
                    blocker(
                      "TARGET_PREIMAGE_SHA256_MISMATCH",
                      operationId,
                      normalizedTargetPath
                    )
                  );
                } else {
                  preconditionMatches =
                    true;
                }
              }
            }
          }
        }
      } catch {
        blockers.push(
          blocker(
            "TARGET_PREIMAGE_READ_FAILED",
            operationId,
            normalizedTargetPath
          )
        );
      } finally {
        if (
          fd !==
            null
        ) {
          try {
            fs.closeSync(
              fd
            );
          } catch {
            // Read-only descriptor cleanup only.
          }
        }
      }
    }
  } else {
    blockers.push(
      blocker(
        "TARGET_MUTATION_MODE_INVALID",
        operationId,
        normalizedTargetPath
      )
    );
  }

  const evidenceCore = {
    operationId,
    targetPath:
      normalizedTargetPath ??
      originalTargetPath,
    mutationMode:
      operation.mutationMode,
    lexicalContained,
    physicalContained,
    reparseFree,
    parentChainVerified,
    targetExists,
    actualSha256,
    actualBytes,
    preconditionMatches
  };

  return {
    evidence: {
      ...evidenceCore,

      preimageFingerprint:
        sha256Value(
          evidenceCore
        ),

      verified:
        blockers.length ===
        0
    },

    blockers
  };
}

function emptyAuthority() {
  return {
    readOnly:
      true,

    filesystemWriteAuthorized:
      false,

    repairAuthorized:
      false,

    executionAuthorized:
      false,

    rollbackExecutionAuthorized:
      false,

    workflowMutationAuthorized:
      false
  };
}

export function verifyAutonomousRepairPlanTargets({
  plan,
  projectRoot,
  generatedAt =
    new Date().toISOString()
} = {}) {
  assertPlan(
    plan
  );

  const rootText =
    clean(
      projectRoot
    );

  if (!rootText) {
    throw new Error(
      "autonomous_repair_target_verifier_project_root_required"
    );
  }

  const root =
    path.resolve(
      rootText
    );

  let rootStat;

  try {
    rootStat =
      fs.lstatSync(
        root
      );
  } catch {
    throw new Error(
      "autonomous_repair_target_verifier_project_root_unreadable"
    );
  }

  if (
    rootStat.isSymbolicLink()
  ) {
    throw new Error(
      "autonomous_repair_target_verifier_project_root_reparse_forbidden"
    );
  }

  if (
    !rootStat.isDirectory()
  ) {
    throw new Error(
      "autonomous_repair_target_verifier_project_root_not_directory"
    );
  }

  const realRoot =
    realpathNative(
      root
    );

  const operations =
    [];

  const blockers =
    [];

  if (
    plan.blockers.length >
      0
  ) {
    blockers.push(
      blocker(
        "UPSTREAM_PLAN_BLOCKED",
        null,
        null
      )
    );
  }

  const targetCounts =
    new Map();

  for (
    const operation of
      plan.operations
  ) {
    const normalized =
      normalizeTargetPath(
        operation?.targetPath
      );

    if (!normalized) {
      continue;
    }

    targetCounts.set(
      normalized,
      (
        targetCounts.get(
          normalized
        ) ??
        0
      ) + 1
    );
  }

  const duplicateTargetPaths =
    new Set(
      [
        ...targetCounts.entries()
      ]
        .filter(
          ([, count]) =>
            count >
              1
        )
        .map(
          ([targetPath]) =>
            targetPath
        )
    );

  for (
    const operation of
      plan.operations
  ) {
    const result =
      verifyOneOperation({
        plan,
        operation,
        projectRoot:
          root,
        realRoot,
        duplicateTargetPaths
      });

    operations.push(
      result.evidence
    );

    blockers.push(
      ...result.blockers
    );
  }

  operations.sort(
    compareEvidence
  );

  blockers.sort(
    compareBlockers
  );

  const summary = {
    operationCount:
      operations.length,

    verifiedOperationCount:
      operations.filter(
        row =>
          row.verified
      ).length,

    blockedOperationCount:
      operations.filter(
        row =>
          !row.verified
      ).length,

    createCount:
      plan.operations.filter(
        row =>
          row.mutationMode ===
          "CREATE"
      ).length,

    replaceCount:
      plan.operations.filter(
        row =>
          row.mutationMode ===
          "REPLACE"
      ).length,

    blockerCount:
      blockers.length
  };

  const verificationState =
    blockers.length >
      0
      ? AUTONOMOUS_REPAIR_TARGET_VERIFICATION_STATE.BLOCKED
      : operations.length ===
          0
        ? AUTONOMOUS_REPAIR_TARGET_VERIFICATION_STATE.NO_ACTION
        : AUTONOMOUS_REPAIR_TARGET_VERIFICATION_STATE.VERIFIED;

  const authority =
    emptyAuthority();

  const fingerprintInput = {
    schema:
      AUTONOMOUS_REPAIR_TARGET_VERIFICATION_SCHEMA,

    version:
      AUTONOMOUS_REPAIR_TARGET_VERIFICATION_VERSION,

    dayKey:
      plan.dayKey,

    planFingerprint:
      plan.planFingerprint,

    verificationState,
    summary,
    operations,
    blockers,
    authority
  };

  return {
    schema:
      AUTONOMOUS_REPAIR_TARGET_VERIFICATION_SCHEMA,

    version:
      AUTONOMOUS_REPAIR_TARGET_VERIFICATION_VERSION,

    dayKey:
      plan.dayKey,

    generatedAt:
      String(
        generatedAt
      ),

    role:
      "derived_read_only_target_preimage_verification",

    planFingerprint:
      plan.planFingerprint,

    verificationFingerprint:
      sha256Value(
        fingerprintInput
      ),

    verificationState,
    summary,
    operations,
    blockers,
    authority
  };
}

export function validateAutonomousRepairTargetVerificationArtifact(
  artifact
) {
  const exactKeys = (
    value,
    expected
  ) =>
    value &&
    typeof value ===
      "object" &&
    !Array.isArray(
      value
    ) &&
    sha256Value(
      Object.keys(
        value
      ).sort()
    ) ===
      sha256Value(
        [
          ...expected
        ].sort()
      );

  if (
    !artifact ||
    typeof artifact !==
      "object" ||
    Array.isArray(
      artifact
    ) ||
    artifact.schema !==
      AUTONOMOUS_REPAIR_TARGET_VERIFICATION_SCHEMA ||
    artifact.version !==
      AUTONOMOUS_REPAIR_TARGET_VERIFICATION_VERSION ||
    !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(
      clean(
        artifact.dayKey
      )
    ) ||
    !clean(
      artifact.generatedAt
    ) ||
    !validSha(
      artifact.planFingerprint
    ) ||
    !validSha(
      artifact.verificationFingerprint
    ) ||
    !Array.isArray(
      artifact.operations
    ) ||
    !Array.isArray(
      artifact.blockers
    ) ||
    !exactKeys(
      artifact,
      [
        "schema",
        "version",
        "dayKey",
        "generatedAt",
        "role",
        "planFingerprint",
        "verificationFingerprint",
        "verificationState",
        "summary",
        "operations",
        "blockers",
        "authority"
      ]
    )
  ) {
    throw new Error(
      "autonomous_repair_target_verification_artifact_invalid"
    );
  }

  if (
    artifact.role !==
      "derived_read_only_target_preimage_verification"
  ) {
    throw new Error(
      "autonomous_repair_target_verification_role_invalid"
    );
  }

  const authority =
    artifact.authority ??
    {};

  if (
    authority.readOnly !==
      true
  ) {
    throw new Error(
      "autonomous_repair_target_verification_not_read_only"
    );
  }

  for (
    const field of [
      "filesystemWriteAuthorized",
      "repairAuthorized",
      "executionAuthorized",
      "rollbackExecutionAuthorized",
      "workflowMutationAuthorized"
    ]
  ) {
    if (
      authority[field] !==
      false
    ) {
      throw new Error(
        `autonomous_repair_target_verification_${field}_invalid`
      );
    }
  }

  if (
    !exactKeys(
      authority,
      [
        "readOnly",
        "filesystemWriteAuthorized",
        "repairAuthorized",
        "executionAuthorized",
        "rollbackExecutionAuthorized",
        "workflowMutationAuthorized"
      ]
    )
  ) {
    throw new Error(
      "autonomous_repair_target_verification_authority_shape_invalid"
    );
  }

  const operationIds =
    new Set();

  for (
    let index = 0;
    index <
      artifact.operations.length;
    index +=
      1
  ) {
    const operation =
      artifact.operations[
        index
      ];

    if (
      !exactKeys(
        operation,
        [
          "operationId",
          "targetPath",
          "mutationMode",
          "lexicalContained",
          "physicalContained",
          "reparseFree",
          "parentChainVerified",
          "targetExists",
          "actualSha256",
          "actualBytes",
          "preconditionMatches",
          "preimageFingerprint",
          "verified"
        ]
      ) ||
      !VALID_OPERATION_ID.test(
        clean(
          operation?.operationId
        )
      ) ||
      !clean(
        operation?.targetPath
      ) ||
      clean(
        operation?.targetPath
      ) !==
        operation.targetPath ||
      ![
        "CREATE",
        "REPLACE"
      ].includes(
        operation.mutationMode
      ) ||
      typeof operation.lexicalContained !==
        "boolean" ||
      typeof operation.physicalContained !==
        "boolean" ||
      typeof operation.reparseFree !==
        "boolean" ||
      typeof operation.parentChainVerified !==
        "boolean" ||
      typeof operation.targetExists !==
        "boolean" ||
      !(
        operation.actualSha256 ===
          null ||
        validSha(
          operation.actualSha256
        )
      ) ||
      !(
        operation.actualBytes ===
          null ||
        (
          Number.isInteger(
            operation.actualBytes
          ) &&
          operation.actualBytes >=
            0
        )
      ) ||
      (
        operation.actualSha256 ===
          null
      ) !==
        (
          operation.actualBytes ===
            null
        ) ||
      typeof operation.preconditionMatches !==
        "boolean" ||
      !validSha(
        operation.preimageFingerprint
      ) ||
      typeof operation.verified !==
        "boolean" ||
      operationIds.has(
        operation.operationId
      )
    ) {
      throw new Error(
        "autonomous_repair_target_verification_operation_invalid"
      );
    }

    operationIds.add(
      operation.operationId
    );

    const evidenceCore = {
      operationId:
        operation.operationId,
      targetPath:
        operation.targetPath,
      mutationMode:
        operation.mutationMode,
      lexicalContained:
        operation.lexicalContained,
      physicalContained:
        operation.physicalContained,
      reparseFree:
        operation.reparseFree,
      parentChainVerified:
        operation.parentChainVerified,
      targetExists:
        operation.targetExists,
      actualSha256:
        operation.actualSha256,
      actualBytes:
        operation.actualBytes,
      preconditionMatches:
        operation.preconditionMatches
    };

    if (
      sha256Value(
        evidenceCore
      ) !==
      operation.preimageFingerprint
    ) {
      throw new Error(
        "autonomous_repair_target_verification_operation_fingerprint_mismatch"
      );
    }

    if (
      index >
        0 &&
      compareEvidence(
        artifact.operations[
          index - 1
        ],
        operation
      ) >
        0
    ) {
      throw new Error(
        "autonomous_repair_target_verification_operation_order_invalid"
      );
    }
  }

  const operationById =
    new Map(
      artifact.operations.map(
        operation => [
          operation.operationId,
          operation
        ]
      )
    );

  for (
    let index = 0;
    index <
      artifact.blockers.length;
    index +=
      1
  ) {
    const row =
      artifact.blockers[
        index
      ];

    if (
      !exactKeys(
        row,
        [
          "code",
          "operationId",
          "targetPath"
        ]
      ) ||
      !clean(
        row?.code
      ) ||
      !(
        row.operationId ===
          null ||
        VALID_OPERATION_ID.test(
          clean(
            row.operationId
          )
        )
      ) ||
      !(
        row.targetPath ===
          null ||
        (
          clean(
            row.targetPath
          ) &&
          clean(
            row.targetPath
          ) ===
            row.targetPath
        )
      )
    ) {
      throw new Error(
        "autonomous_repair_target_verification_blocker_invalid"
      );
    }

    if (
      row.operationId ===
        null
    ) {
      if (
        row.targetPath !==
          null ||
        artifact.operations.length >
          0
      ) {
        throw new Error(
          "autonomous_repair_target_verification_blocker_invalid"
        );
      }
    } else {
      const operation =
        operationById.get(
          row.operationId
        );

      if (
        !operation ||
        row.targetPath !==
          operation.targetPath
      ) {
        throw new Error(
          "autonomous_repair_target_verification_blocker_unbound"
        );
      }
    }

    if (
      index >
        0 &&
      compareBlockers(
        artifact.blockers[
          index - 1
        ],
        row
      ) >
        0
    ) {
      throw new Error(
        "autonomous_repair_target_verification_blocker_order_invalid"
      );
    }
  }

  const blockedOperationIds =
    new Set(
      artifact.blockers
        .filter(
          row =>
            row.operationId !==
            null
        )
        .map(
          row =>
            row.operationId
        )
    );

  for (
    const operation of
      artifact.operations
  ) {
    const expectedVerified =
      !blockedOperationIds.has(
        operation.operationId
      );

    if (
      operation.verified !==
        expectedVerified
    ) {
      throw new Error(
        "autonomous_repair_target_verification_operation_verified_mismatch"
      );
    }
  }

  const expectedSummary = {
    operationCount:
      artifact.operations.length,
    verifiedOperationCount:
      artifact.operations.filter(
        row =>
          row.verified
      ).length,
    blockedOperationCount:
      artifact.operations.filter(
        row =>
          !row.verified
      ).length,
    createCount:
      artifact.operations.filter(
        row =>
          row.mutationMode ===
            "CREATE"
      ).length,
    replaceCount:
      artifact.operations.filter(
        row =>
          row.mutationMode ===
            "REPLACE"
      ).length,
    blockerCount:
      artifact.blockers.length
  };

  if (
    sha256Value(
      artifact.summary
    ) !==
    sha256Value(
      expectedSummary
    )
  ) {
    throw new Error(
      "autonomous_repair_target_verification_summary_invalid"
    );
  }

  const expectedState =
    artifact.blockers.length >
      0
      ? AUTONOMOUS_REPAIR_TARGET_VERIFICATION_STATE.BLOCKED
      : artifact.operations.length ===
          0
        ? AUTONOMOUS_REPAIR_TARGET_VERIFICATION_STATE.NO_ACTION
        : AUTONOMOUS_REPAIR_TARGET_VERIFICATION_STATE.VERIFIED;

  if (
    artifact.verificationState !==
      expectedState
  ) {
    throw new Error(
      "autonomous_repair_target_verification_state_mismatch"
    );
  }

  const fingerprintInput = {
    schema:
      artifact.schema,
    version:
      artifact.version,
    dayKey:
      artifact.dayKey,
    planFingerprint:
      artifact.planFingerprint,
    verificationState:
      artifact.verificationState,
    summary:
      artifact.summary,
    operations:
      artifact.operations,
    blockers:
      artifact.blockers,
    authority:
      artifact.authority
  };

  if (
    sha256Value(
      fingerprintInput
    ) !==
    artifact.verificationFingerprint
  ) {
    throw new Error(
      "autonomous_repair_target_verification_fingerprint_mismatch"
    );
  }

  return true;
}
