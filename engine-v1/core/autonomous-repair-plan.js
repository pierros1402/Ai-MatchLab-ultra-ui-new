import {
  createHash
} from "node:crypto";

import {
  validateAutonomousRepairPolicyVerificationArtifact
} from "./autonomous-repair-policy-independent-verifier.js";

export const AUTONOMOUS_REPAIR_PLAN_SCHEMA =
  "ai-matchlab.autonomous-repair-plan.v1";

export const AUTONOMOUS_REPAIR_PLAN_VERSION =
  "1.0.0";

export const AUTONOMOUS_REPAIR_PLAN_STATE =
  Object.freeze({
    NO_ACTION_NOT_REQUESTABLE:
      "NO_ACTION_NOT_REQUESTABLE",

    NO_ACTION_UPSTREAM_DENIED:
      "NO_ACTION_UPSTREAM_DENIED",

    DRY_RUN_READY:
      "DRY_RUN_READY",

    BLOCKED_TARGET_CONTRACT:
      "BLOCKED_TARGET_CONTRACT"
  });

const P =
  AUTONOMOUS_REPAIR_PLAN_STATE;

const REPAIR_CLASSES =
  new Set([
    "ACQUIRE_VERIFIED_FINAL_EVIDENCE",
    "REBUILD_HISTORY_ELIGIBLE_ROW",
    "REBUILD_PUBLICATION_CANONICAL_ROW"
  ]);

function clean(
  value
) {
  return String(
    value ?? ""
  ).trim();
}

function stableValue(
  value
) {
  if (
    Array.isArray(
      value
    )
  ) {
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
      Object.keys(
        value
      )
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

function sha256(
  value
) {
  return createHash(
    "sha256"
  )
    .update(
      JSON.stringify(
        stableValue(
          value
        )
      )
    )
    .digest(
      "hex"
    );
}

function validSha(
  value
) {
  return /^[0-9a-f]{64}$/u.test(
    clean(
      value
    )
  );
}

function sortedUnique(
  values
) {
  return Array.from(
    new Set(
      values
        .map(
          clean
        )
        .filter(
          Boolean
        )
    )
  ).sort();
}

function normalizeTargetPath(
  value
) {
  const path =
    clean(
      value
    )
      .replace(
        /\\/gu,
        "/"
      )
      .replace(
        /^\.\/+/u,
        ""
      );

  if (
    !path ||
    path.startsWith("/") ||
    /^[A-Za-z]:\//u.test(
      path
    ) ||
    path
      .split("/")
      .includes("..")
  ) {
    return null;
  }

  return path;
}

function candidateDecisions(
  policy
) {
  return (
    Array.isArray(
      policy?.decisions
    )
      ? policy.decisions
      : []
  ).filter(
    row =>
      row?.classification ===
        "ELIGIBLE_REPAIR_CANDIDATE"
  );
}

function assertZeroAuthority(
  label,
  authority
) {
  for (
    const field of [
      "filesystemWriteAuthorized",
      "repairAuthorized",
      "executionAuthorized",
      "rollbackExecutionAuthorized",
      "workflowMutationAuthorized",
      "authorizationGranted"
    ]
  ) {
    if (
      authority?.[field] ===
      true
    ) {
      throw new Error(
        `autonomous_repair_plan_${label}_${field}_forbidden`
      );
    }
  }
}

function protectedPath(
  path
) {
  const lower =
    path.toLowerCase();

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

function compareBlockers(
  a,
  b
) {
  return [
    a.code,
    a.candidateDecisionId ?? "",
    a.targetPath ?? ""
  ]
    .join("\u0000")
    .localeCompare(
      [
        b.code,
        b.candidateDecisionId ?? "",
        b.targetPath ?? ""
      ].join("\u0000")
    );
}

function compareOperations(
  a,
  b
) {
  return [
    a.targetPath,
    a.candidateDecisionId,
    a.repairClass,
    a.operationId
  ]
    .join("\u0000")
    .localeCompare(
      [
        b.targetPath,
        b.candidateDecisionId,
        b.repairClass,
        b.operationId
      ].join("\u0000")
    );
}

function blocker(
  code,
  candidateDecisionId = null,
  targetPath = null
) {
  return {
    code,
    candidateDecisionId,
    targetPath
  };
}

function normalizeTargetDescriptor(
  descriptor
) {
  if (
    !descriptor ||
    typeof descriptor !==
      "object"
  ) {
    throw new Error(
      "autonomous_repair_plan_target_descriptor_invalid"
    );
  }

  const targetPath =
    normalizeTargetPath(
      descriptor.targetPath
    );

  if (!targetPath) {
    throw new Error(
      "autonomous_repair_plan_target_path_invalid"
    );
  }

  const targetExists =
    descriptor.targetExists ===
    true;

  const currentSha256 =
    descriptor.currentSha256 ===
      null ||
    descriptor.currentSha256 ===
      undefined
      ? null
      : clean(
          descriptor.currentSha256
        );

  const plannedContentSha256 =
    clean(
      descriptor.plannedContentSha256
    );

  const plannedContentBytes =
    Number(
      descriptor.plannedContentBytes
    );

  if (
    targetExists &&
    !validSha(
      currentSha256
    )
  ) {
    throw new Error(
      "autonomous_repair_plan_existing_target_hash_required"
    );
  }

  if (
    !targetExists &&
    currentSha256 !==
      null
  ) {
    throw new Error(
      "autonomous_repair_plan_absent_target_hash_forbidden"
    );
  }

  if (
    !validSha(
      plannedContentSha256
    )
  ) {
    throw new Error(
      "autonomous_repair_plan_planned_content_hash_invalid"
    );
  }

  if (
    !Number.isSafeInteger(
      plannedContentBytes
    ) ||
    plannedContentBytes <
      0
  ) {
    throw new Error(
      "autonomous_repair_plan_planned_content_bytes_invalid"
    );
  }

  return {
    targetPath,
    targetExists,
    currentSha256,
    plannedContentSha256,
    plannedContentBytes
  };
}

function operationFor({
  candidate,
  descriptor
}) {
  const candidateDecisionId =
    clean(
      candidate.policyDecisionId
    );

  const repairClass =
    clean(
      candidate.repairClass
    );

  const canonicalId =
    clean(
      candidate?.diagnosis
        ?.canonicalId
    );

  const mutationMode =
    descriptor.targetExists
      ? "REPLACE"
      : "CREATE";

  const precondition = {
    targetExists:
      descriptor.targetExists,

    expectedSha256:
      descriptor.targetExists
        ? descriptor.currentSha256
        : null
  };

  const planned = {
    contentSha256:
      descriptor.plannedContentSha256,

    contentBytes:
      descriptor.plannedContentBytes
  };

  const rollback =
    descriptor.targetExists
      ? {
          strategy:
            "RESTORE_PREIMAGE",

          preimageRequired:
            true,

          preimageSha256:
            descriptor.currentSha256
        }
      : {
          strategy:
            "DELETE_CREATED_TARGET",

          preimageRequired:
            false,

          preimageSha256:
            null
        };

  const identity = {
    candidateDecisionId,
    repairClass,
    canonicalId,
    targetPath:
      descriptor.targetPath,

    mutationMode,
    precondition,
    planned,
    rollback
  };

  return {
    operationId:
      `arpo_v1_${sha256(identity).slice(0, 24)}`,

    candidateDecisionId,
    repairClass,
    canonicalId,

    targetPath:
      descriptor.targetPath,

    mutationMode,
    precondition,
    planned,
    rollback
  };
}

function emptyAuthority() {
  return {
    dryRunOnly:
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

export function buildAutonomousRepairPlan({
  policy,
  verification,
  gate,
  targetsByDecisionId = {},
  generatedAt
} = {}) {
  for (
    const [
      label,
      value
    ] of [
      [
        "policy",
        policy
      ],
      [
        "verification",
        verification
      ],
      [
        "gate",
        gate
      ]
    ]
  ) {
    if (
      !value ||
      typeof value !==
        "object"
    ) {
      throw new Error(
        `autonomous_repair_plan_${label}_required`
      );
    }
  }

  if (
    !targetsByDecisionId ||
    typeof targetsByDecisionId !==
      "object" ||
    Array.isArray(
      targetsByDecisionId
    )
  ) {
    throw new Error(
      "autonomous_repair_plan_target_catalog_invalid"
    );
  }

  assertZeroAuthority(
    "policy",
    policy.authority
  );

  assertZeroAuthority(
    "verification",
    verification.authority
  );

  assertZeroAuthority(
    "gate",
    gate.authority
  );

  const verificationValidation =
    validateAutonomousRepairPolicyVerificationArtifact({
      verification,
      policy
    });

  if (
    !verificationValidation.valid
  ) {
    throw new Error(
      `autonomous_repair_plan_verification_invalid:${verificationValidation.reason}`
    );
  }

  const dayKey =
    clean(
      policy.dayKey
    );

  const timestamp =
    clean(
      generatedAt
    ) ||
    clean(
      gate.generatedAt
    ) ||
    clean(
      policy.generatedAt
    );

  const bindings = {
    truthFingerprint:
      clean(
        policy.truthFingerprint
      ),

    auditFingerprint:
      clean(
        policy.auditFingerprint
      ),

    downstreamEvidenceFingerprint:
      clean(
        policy.downstreamEvidenceFingerprint
      ),

    primaryEvidenceFingerprint:
      clean(
        policy.primaryEvidenceFingerprint
      ),

    policyFingerprint:
      clean(
        policy.policyFingerprint
      ),

    verificationFingerprint:
      clean(
        verification.verificationFingerprint
      ),

    gateFingerprint:
      clean(
        gate.gateFingerprint
      )
  };

  if (
    !dayKey ||
    !timestamp ||
    Object.values(
      bindings
    ).some(
      value =>
        !validSha(
          value
        )
    )
  ) {
    throw new Error(
      "autonomous_repair_plan_binding_invalid"
    );
  }

  if (
    clean(
      verification.dayKey
    ) !==
      dayKey ||
    clean(
      gate.dayKey
    ) !==
      dayKey
  ) {
    throw new Error(
      "autonomous_repair_plan_day_binding_mismatch"
    );
  }

  if (
    clean(
      verification
        ?.bindings
        ?.policyFingerprint
    ) !==
      bindings.policyFingerprint ||
    clean(
      gate.policyFingerprint
    ) !==
      bindings.policyFingerprint
  ) {
    throw new Error(
      "autonomous_repair_plan_policy_binding_mismatch"
    );
  }

  if (
    clean(
      gate
        ?.verification
        ?.verificationFingerprint
    ) !==
      bindings.verificationFingerprint
  ) {
    throw new Error(
      "autonomous_repair_plan_gate_verification_binding_mismatch"
    );
  }

  const candidates =
    candidateDecisions(
      policy
    );

  const candidateDecisionIds =
    sortedUnique(
      candidates.map(
        row =>
          row.policyDecisionId
      )
    );

  const gateCandidateIds =
    sortedUnique(
      Array.isArray(
        gate.candidateDecisionIds
      )
        ? gate.candidateDecisionIds
        : []
    );

  if (
    JSON.stringify(
      candidateDecisionIds
    ) !==
    JSON.stringify(
      gateCandidateIds
    )
  ) {
    throw new Error(
      "autonomous_repair_plan_gate_candidate_binding_mismatch"
    );
  }

  const targetCatalogKeys =
    sortedUnique(
      Object.keys(
        targetsByDecisionId
      )
    );

  let planState;
  let blockers =
    [];

  let proposedOperations =
    [];

  if (
    gate.gateState ===
      "NOT_REQUESTABLE_NO_CANDIDATES"
  ) {
    if (
      candidateDecisionIds.length !==
        0
    ) {
      throw new Error(
        "autonomous_repair_plan_not_requestable_candidate_contradiction"
      );
    }

    if (
      targetCatalogKeys.length !==
        0
    ) {
      throw new Error(
        "autonomous_repair_plan_targets_for_nonrequestable_gate"
      );
    }

    planState =
      P.NO_ACTION_NOT_REQUESTABLE;
  }
  else if (
    gate.gateState !==
      "REQUEST_ELIGIBLE"
  ) {
    if (
      targetCatalogKeys.length !==
        0
    ) {
      throw new Error(
        "autonomous_repair_plan_targets_for_denied_gate"
      );
    }

    planState =
      P.NO_ACTION_UPSTREAM_DENIED;
  }
  else {
    if (
      gate?.authority
        ?.authorizationRequestEligible !==
        true
    ) {
      throw new Error(
        "autonomous_repair_plan_request_eligibility_missing"
      );
    }

    if (
      candidates.length ===
        0
    ) {
      throw new Error(
        "autonomous_repair_plan_requestable_gate_without_candidate"
      );
    }

    const candidateMap =
      new Map(
        candidates.map(
          candidate => [
            clean(
              candidate.policyDecisionId
            ),
            candidate
          ]
        )
      );

    for (
      const catalogKey of
      targetCatalogKeys
    ) {
      if (
        !candidateMap.has(
          catalogKey
        )
      ) {
        blockers.push(
          blocker(
            "UNEXPECTED_TARGET_CATALOG_ENTRY",
            catalogKey,
            null
          )
        );
      }
    }

    const seenPaths =
      new Map();

    for (
      const candidateDecisionId of
      candidateDecisionIds
    ) {
      const candidate =
        candidateMap.get(
          candidateDecisionId
        );

      const repairClass =
        clean(
          candidate.repairClass
        );

      const canonicalId =
        clean(
          candidate?.diagnosis
            ?.canonicalId
        );

      if (
        !REPAIR_CLASSES.has(
          repairClass
        ) ||
        !canonicalId
      ) {
        blockers.push(
          blocker(
            "CANDIDATE_CONTRACT_INVALID",
            candidateDecisionId,
            null
          )
        );

        continue;
      }

      const rawTargets =
        targetsByDecisionId[
          candidateDecisionId
        ];

      if (
        !Array.isArray(
          rawTargets
        ) ||
        rawTargets.length ===
          0
      ) {
        blockers.push(
          blocker(
            "CANDIDATE_TARGET_SET_MISSING",
            candidateDecisionId,
            null
          )
        );

        continue;
      }

      for (
        const rawTarget of
        rawTargets
      ) {
        const descriptor =
          normalizeTargetDescriptor(
            rawTarget
          );

        const path =
          descriptor.targetPath;

        if (
          protectedPath(
            path
          )
        ) {
          blockers.push(
            blocker(
              "PROTECTED_TARGET_PATH",
              candidateDecisionId,
              path
            )
          );

          continue;
        }

        if (
          !targetMatchesRepairClass({
            dayKey,
            repairClass,
            canonicalId,
            targetPath:
              path
          })
        ) {
          blockers.push(
            blocker(
              "TARGET_REPAIR_CLASS_MISMATCH",
              candidateDecisionId,
              path
            )
          );

          continue;
        }

        if (
          seenPaths.has(
            path
          )
        ) {
          blockers.push(
            blocker(
              "DUPLICATE_TARGET_PATH",
              candidateDecisionId,
              path
            )
          );

          continue;
        }

        seenPaths.set(
          path,
          candidateDecisionId
        );

        proposedOperations.push(
          operationFor({
            candidate,
            descriptor
          })
        );
      }
    }

    blockers =
      blockers.sort(
        compareBlockers
      );

    if (
      blockers.length >
        0
    ) {
      planState =
        P.BLOCKED_TARGET_CONTRACT;

      proposedOperations =
        [];
    }
    else {
      proposedOperations =
        proposedOperations.sort(
          compareOperations
        );

      planState =
        P.DRY_RUN_READY;
    }
  }

  const operations =
    proposedOperations;

  const summary = {
    candidateCount:
      candidateDecisionIds.length,

    operationCount:
      operations.length,

    createCount:
      operations.filter(
        row =>
          row.mutationMode ===
          "CREATE"
      ).length,

    replaceCount:
      operations.filter(
        row =>
          row.mutationMode ===
          "REPLACE"
      ).length,

    blockerCount:
      blockers.length
  };

  const authority =
    emptyAuthority();

  const fingerprintInput = {
    schema:
      AUTONOMOUS_REPAIR_PLAN_SCHEMA,

    version:
      AUTONOMOUS_REPAIR_PLAN_VERSION,

    dayKey,
    bindings,
    planState,
    summary,
    candidateDecisionIds,
    operations,
    blockers,
    authority
  };

  return {
    schema:
      AUTONOMOUS_REPAIR_PLAN_SCHEMA,

    version:
      AUTONOMOUS_REPAIR_PLAN_VERSION,

    dayKey,

    generatedAt:
      timestamp,

    role:
      "derived_dry_run_repair_plan",

    bindings,

    planFingerprint:
      sha256(
        fingerprintInput
      ),

    planState,
    summary,
    candidateDecisionIds,
    operations,
    blockers,
    authority
  };
}
