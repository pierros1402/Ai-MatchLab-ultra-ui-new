import {
  createHash
} from "node:crypto";

import {
  buildAutonomousRepairTargetMaterialCatalog,
  deriveAutonomousRepairTargetsByDecisionId,
  validateAutonomousRepairTargetMaterialCatalog
} from "./autonomous-repair-target-material.js";

import {
  AUTONOMOUS_REPAIR_PUBLICATION_COUPLED_MATERIAL_SCHEMA,
  AUTONOMOUS_REPAIR_PUBLICATION_COUPLED_MATERIAL_VERSION,
  validateAutonomousRepairPublicationCoupledMaterialBundle
} from "./autonomous-repair-publication-coupled-materializer.js";

export const AUTONOMOUS_REPAIR_SOURCE_BOUND_MATERIAL_RESOLUTION_SCHEMA =
  "ai-matchlab.autonomous-repair-source-bound-material-resolution.v1";

export const AUTONOMOUS_REPAIR_SOURCE_BOUND_MATERIAL_RESOLUTION_VERSION =
  "1.0.0";

export const AUTONOMOUS_REPAIR_SOURCE_BOUND_MATERIAL_STATE =
  Object.freeze({
    NO_CANDIDATES:
      "NO_CANDIDATES",

    RESOLVED:
      "RESOLVED",

    BLOCKED:
      "BLOCKED"
  });

const S =
  AUTONOMOUS_REPAIR_SOURCE_BOUND_MATERIAL_STATE;

const VALID_DAY =
  /^\d{4}-\d{2}-\d{2}$/u;

const VALID_SHA =
  /^[0-9a-f]{64}$/u;

const VALID_CANDIDATE_ID =
  /^arpd_v1_[0-9a-f]{24}$/u;

const REPAIR_CLASSES =
  new Set([
    "ACQUIRE_VERIFIED_FINAL_EVIDENCE",
    "REBUILD_HISTORY_ELIGIBLE_ROW",
    "REBUILD_PUBLICATION_CANONICAL_ROW"
  ]);

const FINAL_BUILDERS =
  new Set([
    "buildVerifiedFinalResult",
    "buildConvergedVerifiedFinalResult",
    "buildPenaltyWinnerMarkerNormalizedFinalResult",
    "buildCanonicalEspnVerifiedFinalResult",
    "buildCanonicalFlashscoreVerifiedFinalResult"
  ]);

function deepFreeze(
  value
) {
  if (
    value &&
    typeof value ===
      "object" &&
    !Object.isFrozen(
      value
    )
  ) {
    Object.freeze(
      value
    );

    for (
      const child of
        Object.values(
          value
        )
    ) {
      deepFreeze(
        child
      );
    }
  }

  return value;
}

export const AUTONOMOUS_REPAIR_MATERIAL_PRODUCER_POLICY =
  deepFreeze({
    ACQUIRE_VERIFIED_FINAL_EVIDENCE: {
      supported:
        true,

      contractId:
        "verified-final-result-exporter-v1",

      sourcePath:
        "engine-v1/jobs/export-verified-final-results-day.js",

      sourceDigestMode:
        "lf_normalized_sha256",

      normalizedSourceSha256:
        "2924b89608a34c41cd656039997ad8bc74b5e21032a226e36daae6b97896882a"
    },

    REBUILD_HISTORY_ELIGIBLE_ROW: {
      supported:
        true,

      contractId:
        "history-authoritative-resolution-executor-v1",

      sourcePath:
        "engine-v1/core/history-authoritative-resolution-executor.js",

      sourceDigestMode:
        "lf_normalized_sha256",

      normalizedSourceSha256:
        "0d5ee681ab7b60bad5e351606e0e816f471cc0ea3c383e94204bffc589b70094"
    },

    REBUILD_PUBLICATION_CANONICAL_ROW: {
      supported:
        true,

      contractId:
        "publication-coupled-materializer-v1",

      sourcePath:
        "engine-v1/core/autonomous-repair-publication-coupled-materializer.js",

      sourceDigestMode:
        "lf_normalized_sha256",

      normalizedSourceSha256:
        "effb5639d48bd08e88a57f1baa69e5cc290cf14b1b9fcf54fa4c1ce5b9306f2a",

      dependencies: [
        {
          sourcePath:
            "engine-v1/core/day-fixture-universe.js",

          normalizedSourceSha256:
            "15641b0d0fd91c27967a6af95ecf20b96e6dc74169571156f22f53c3e6d92f60"
        },
        {
          sourcePath:
            "engine-v1/jobs/p0c-p4-build-deploy-snapshot-fixtures.js",

          normalizedSourceSha256:
            "94971cf7df8ed93b0e29aa3cb4a1f7deb0c3c9321c770d7bac8bbbbc34bc34d0"
        },
        {
          sourcePath:
            "engine-v1/jobs/p0c-p4-build-deploy-snapshot-details.js",

          normalizedSourceSha256:
            "ad02d716813f046f1b8ea161a543417013db7361e709f1a60114b8fbfb5a0529"
        },
        {
          sourcePath:
            "engine-v1/jobs/p0c-p4-build-deploy-snapshot-manifest.js",

          normalizedSourceSha256:
            "031e13a57e0f142ec8c5628baeadcd9c7e4d70d6f99ac82eee0fd57895a9919c"
        },
        {
          sourcePath:
            "engine-v1/core/deploy-snapshot-release-contract.js",

          normalizedSourceSha256:
            "b8ed6d6fe2dc16dc8ed7cc4f59cd2b9b43f5feb0bac90886f97973e655a057b3"
        },
        {
          sourcePath:
            "engine-v1/value/plan-c-shadow-export.js",

          normalizedSourceSha256:
            "ecc6f6ec91cc895b63fb7cba6a90532cb17c0782fb6b214eff235277d2b94581"
        }
      ]
    }
  });

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

function sha256Value(
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

function sha256Buffer(
  value
) {
  return createHash(
    "sha256"
  )
    .update(
      value
    )
    .digest(
      "hex"
    );
}

function validSha(
  value
) {
  return VALID_SHA.test(
    clean(
      value
    ).toLowerCase()
  );
}

function authority() {
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
      false,

    authorizationGranted:
      false
  };
}

function assertZeroAuthority(
  sourceAuthority
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
      sourceAuthority?.[field] ===
        true
    ) {
      throw new Error(
        `autonomous_repair_source_bound_material_policy_${field}_forbidden`
      );
    }
  }
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
  )
    .filter(
      row =>
        row?.classification ===
          "ELIGIBLE_REPAIR_CANDIDATE"
    )
    .sort(
      (
        left,
        right
      ) =>
        clean(
          left?.policyDecisionId
        ).localeCompare(
          clean(
            right?.policyDecisionId
          )
        )
    );
}

function blocker(
  code,
  candidate = null,
  targetPath = null
) {
  return {
    code,

    candidateDecisionId:
      candidate
        ? clean(
            candidate.policyDecisionId
          ) || null
        : null,

    repairClass:
      candidate
        ? clean(
            candidate.repairClass
          ) || null
        : null,

    targetPath:
      targetPath
        ? clean(
            targetPath
          )
        : null
  };
}

function compareBlockers(
  left,
  right
) {
  return [
    left.code,
    left.candidateDecisionId ?? "",
    left.repairClass ?? "",
    left.targetPath ?? ""
  ]
    .join(
      "\u0000"
    )
    .localeCompare(
      [
        right.code,
        right.candidateDecisionId ?? "",
        right.repairClass ?? "",
        right.targetPath ?? ""
      ].join(
        "\u0000"
      )
    );
}

function producerPolicyFingerprint() {
  return sha256Value(
    AUTONOMOUS_REPAIR_MATERIAL_PRODUCER_POLICY
  );
}

function exactProducerContract(
  repairClass,
  producer
) {
  const expected =
    AUTONOMOUS_REPAIR_MATERIAL_PRODUCER_POLICY[
      repairClass
    ];

  if (
    !expected ||
    expected.supported !==
      true
  ) {
    return false;
  }

  return (
    clean(
      producer?.contractId
    ) ===
      expected.contractId &&
    clean(
      producer?.sourcePath
    ) ===
      expected.sourcePath &&
    clean(
      producer?.sourceDigestMode
    ) ===
      expected.sourceDigestMode &&
    clean(
      producer?.normalizedSourceSha256
    ).toLowerCase() ===
      expected.normalizedSourceSha256
  );
}

function canonicalJsonMaterial(
  contentBase64
) {
  const base64 =
    clean(
      contentBase64
    );

  if (!base64) {
    return {
      ok:
        false,

      code:
        "MATERIAL_CONTENT_MISSING"
    };
  }

  let buffer;

  try {
    buffer =
      Buffer.from(
        base64,
        "base64"
      );
  }
  catch {
    return {
      ok:
        false,

      code:
        "MATERIAL_CONTENT_BASE64_INVALID"
    };
  }

  if (
    buffer.length ===
      0 ||
    buffer.toString(
      "base64"
    ) !==
      base64
  ) {
    return {
      ok:
        false,

      code:
        "MATERIAL_CONTENT_BASE64_INVALID"
    };
  }

  let value;

  try {
    value =
      JSON.parse(
        buffer.toString(
          "utf8"
        )
      );
  }
  catch {
    return {
      ok:
        false,

      code:
        "MATERIAL_JSON_INVALID"
    };
  }

  const canonical =
    Buffer.from(
      `${JSON.stringify(
        value,
        null,
        2
      )}\n`,
      "utf8"
    );

  if (
    !buffer.equals(
      canonical
    )
  ) {
    return {
      ok:
        false,

      code:
        "MATERIAL_JSON_NOT_CANONICAL_PRETTY_BYTES"
    };
  }

  return {
    ok:
      true,

    buffer,
    value,

    sha256:
      sha256Buffer(
        buffer
      )
  };
}

function validSourceRefs(
  sourceRefs,
  minimum
) {
  if (
    !Array.isArray(
      sourceRefs
    ) ||
    sourceRefs.length <
      minimum
  ) {
    return false;
  }

  const refs =
    new Set();

  for (
    const source of
      sourceRefs
  ) {
    const ref =
      clean(
        source?.ref
      );

    const sha =
      clean(
        source?.sha256
      ).toLowerCase();

    const bytes =
      Number(
        source?.bytes
      );

    if (
      !ref ||
      refs.has(
        ref
      ) ||
      !validSha(
        sha
      ) ||
      !Number.isSafeInteger(
        bytes
      ) ||
      bytes <
        0
    ) {
      return false;
    }

    refs.add(
      ref
    );
  }

  return true;
}

function expectedFinalPath(
  dayKey,
  canonicalId
) {
  return (
    `data/final-results/${dayKey}/${canonicalId}.json`
  );
}

function validateVerifiedFinalMaterial({
  dayKey,
  candidate,
  materialization
}) {
  const canonicalId =
    clean(
      candidate
        ?.diagnosis
        ?.canonicalId
    );

  const expectedPath =
    expectedFinalPath(
      dayKey,
      canonicalId
    );

  if (
    clean(
      materialization
        ?.targetPath
    ) !==
      expectedPath
  ) {
    return {
      ok:
        false,

      code:
        "VERIFIED_FINAL_TARGET_PATH_MISMATCH",

      targetPath:
        clean(
          materialization
            ?.targetPath
        ) || null
    };
  }

  if (
    !exactProducerContract(
      "ACQUIRE_VERIFIED_FINAL_EVIDENCE",
      materialization
        ?.producer
    )
  ) {
    return {
      ok:
        false,

      code:
        "VERIFIED_FINAL_PRODUCER_CONTRACT_MISMATCH",

      targetPath:
        expectedPath
    };
  }

  if (
    !FINAL_BUILDERS.has(
      clean(
        materialization
          ?.producerProof
          ?.builder
      )
    )
  ) {
    return {
      ok:
        false,

      code:
        "VERIFIED_FINAL_PRODUCER_BUILDER_UNSUPPORTED",

      targetPath:
        expectedPath
    };
  }

  if (
    !validSourceRefs(
      materialization
        ?.sourceRefs,
      1
    )
  ) {
    return {
      ok:
        false,

      code:
        "VERIFIED_FINAL_SOURCE_REFS_INVALID",

      targetPath:
        expectedPath
    };
  }

  const decoded =
    canonicalJsonMaterial(
      materialization
        ?.contentBase64
    );

  if (!decoded.ok) {
    return {
      ok:
        false,

      code:
        decoded.code,

      targetPath:
        expectedPath
    };
  }

  const payload =
    decoded.value;

  const homeScore =
    Number(
      payload?.homeScore
    );

  const awayScore =
    Number(
      payload?.awayScore
    );

  const expectedScoreKey =
    `${homeScore}-${awayScore}`;

  const semanticOk =
    payload?.schema ===
      "ai-matchlab.verified-final-result.v1" &&
    payload?.verifiedFinalTruth ===
      true &&
    clean(
      payload?.dayKey
    ) ===
      dayKey &&
    clean(
      payload?.date
    ) ===
      dayKey &&
    clean(
      payload?.matchId
    ) ===
      canonicalId &&
    Number.isInteger(
      homeScore
    ) &&
    Number.isInteger(
      awayScore
    ) &&
    homeScore >=
      0 &&
    awayScore >=
      0 &&
    Number(
      payload?.scoreHome
    ) ===
      homeScore &&
    Number(
      payload?.scoreAway
    ) ===
      awayScore &&
    clean(
      payload?.scoreKey
    ) ===
      expectedScoreKey &&
    Number(
      payload
        ?.finalScore
        ?.homeScore
    ) ===
      homeScore &&
    Number(
      payload
        ?.finalScore
        ?.awayScore
    ) ===
      awayScore &&
    clean(
      payload
        ?.finalScore
        ?.scoreKey
    ) ===
      expectedScoreKey &&
    clean(
      payload
        ?.finalTruthVerdict
    ) ===
      "verified_final_result" &&
    clean(
      payload?.verdict
    ) ===
      "verified_final_result" &&
    Number.isInteger(
      Number(
        payload
          ?.sourceCount
      )
    ) &&
    Number(
      payload
        ?.sourceCount
    ) >=
      1 &&
    Number.isInteger(
      Number(
        payload
          ?.independentSourceCount
      )
    ) &&
    Number(
      payload
        ?.independentSourceCount
    ) >=
      1 &&
    Array.isArray(
      payload?.sources
    ) &&
    payload.sources.length >=
      1 &&
    clean(
      payload
        ?.settlement
        ?.state
    ) ===
      "verified_final_result";

  if (!semanticOk) {
    return {
      ok:
        false,

      code:
        "VERIFIED_FINAL_PAYLOAD_SEMANTICS_INVALID",

      targetPath:
        expectedPath
    };
  }

  return {
    ok:
      true,

    targetPath:
      expectedPath,

    contentBase64:
      decoded.buffer.toString(
        "base64"
      ),

    sourceRefs:
      materialization.sourceRefs,

    producer:
      materialization.producer,

    producerProofBuilder:
      clean(
        materialization
          ?.producerProof
          ?.builder
      )
  };
}

function validateHistoryMaterial({
  candidate,
  materialization,
  targetState
}) {
  const expectedPath =
    "data/history/2025-2026.json";

  if (
    clean(
      materialization
        ?.targetPath
    ) !==
      expectedPath
  ) {
    return {
      ok:
        false,

      code:
        "HISTORY_TARGET_NOT_SUPPORTED_BY_SOURCE_BOUND_RESOLVER_V1",

      targetPath:
        clean(
          materialization
            ?.targetPath
        ) || null
    };
  }

  if (
    targetState
      ?.targetExists !==
      true ||
    !validSha(
      targetState
        ?.currentSha256
    )
  ) {
    return {
      ok:
        false,

      code:
        "HISTORY_PREIMAGE_REQUIRED",

      targetPath:
        expectedPath
    };
  }

  if (
    !exactProducerContract(
      "REBUILD_HISTORY_ELIGIBLE_ROW",
      materialization
        ?.producer
    )
  ) {
    return {
      ok:
        false,

      code:
        "HISTORY_PRODUCER_CONTRACT_MISMATCH",

      targetPath:
        expectedPath
    };
  }

  if (
    clean(
      materialization
        ?.producerProof
        ?.builder
    ) !==
      "buildAuthoritativeHistoryResolutionExecution"
  ) {
    return {
      ok:
        false,

      code:
        "HISTORY_PRODUCER_BUILDER_UNSUPPORTED",

      targetPath:
        expectedPath
    };
  }

  if (
    !validSourceRefs(
      materialization
        ?.sourceRefs,
      4
    )
  ) {
    return {
      ok:
        false,

      code:
        "HISTORY_SOURCE_REFS_INSUFFICIENT",

      targetPath:
        expectedPath
    };
  }

  const decoded =
    canonicalJsonMaterial(
      materialization
        ?.contentBase64
    );

  if (!decoded.ok) {
    return {
      ok:
        false,

      code:
        decoded.code,

      targetPath:
        expectedPath
    };
  }

  if (
    !decoded.value ||
    typeof decoded.value !==
      "object" ||
    Array.isArray(
      decoded.value
    ) ||
    !Array.isArray(
      decoded.value.days
    )
  ) {
    return {
      ok:
        false,

      code:
        "HISTORY_OUTPUT_DOCUMENT_INVALID",

      targetPath:
        expectedPath
    };
  }

  const proof =
    materialization
      ?.producerProof;

  if (
    clean(
      proof?.outputSha256
    ).toLowerCase() !==
      decoded.sha256
  ) {
    return {
      ok:
        false,

      code:
        "HISTORY_OUTPUT_SHA256_PROOF_MISMATCH",

      targetPath:
        expectedPath
    };
  }

  if (
    !Number.isInteger(
      Number(
        proof
          ?.summary
          ?.resolutionActionsValidated
      )
    ) ||
    Number(
      proof
        ?.summary
        ?.resolutionActionsValidated
    ) <
      1
  ) {
    return {
      ok:
        false,

      code:
        "HISTORY_EXECUTION_PROOF_INCOMPLETE",

      targetPath:
        expectedPath
    };
  }

  const audit =
    proof
      ?.projectedAudit;

  for (
    const field of [
      "invalidRows",
      "duplicateIds",
      "operationalDayMismatches",
      "semanticDuplicateGroups",
      "scoreConflictGroups",
      "flippedOrientationGroups"
    ]
  ) {
    if (
      Number(
        audit?.[field]
      ) !==
        0
    ) {
      return {
        ok:
          false,

        code:
          "HISTORY_PROJECTED_AUDIT_NOT_CLEAN",

        targetPath:
          expectedPath
      };
    }
  }

  return {
    ok:
      true,

    targetPath:
      expectedPath,

    contentBase64:
      decoded.buffer.toString(
        "base64"
      ),

    sourceRefs:
      materialization.sourceRefs,

    producer:
      materialization.producer,

    producerProofBuilder:
      "buildAuthoritativeHistoryResolutionExecution"
  };
}


function publicationBundleMutationByRole(
  bundle,
  role
) {
  const rows =
    Array.isArray(
      bundle?.mutations
    )
      ? bundle.mutations.filter(
          row =>
            clean(
              row?.role
            ) ===
              role
        )
      : [];

  return rows.length ===
    1
    ? rows[0]
    : null;
}

function publicationBundleContainsCanonicalId(
  bundle,
  canonicalId
) {
  const fixtureMutation =
    publicationBundleMutationByRole(
      bundle,
      "DERIVED_FIXTURES"
    );

  if (
    !fixtureMutation ||
    fixtureMutation.action !==
      "write" ||
    !clean(
      fixtureMutation.contentBase64
    )
  ) {
    return false;
  }

  let payload;

  try {
    payload =
      JSON.parse(
        Buffer.from(
          fixtureMutation.contentBase64,
          "base64"
        ).toString(
          "utf8"
        )
      );
  }
  catch {
    return false;
  }

  const fixtures =
    Array.isArray(
      payload?.fixtures
    )
      ? payload.fixtures
      : [];

  return fixtures.some(
    row =>
      clean(
        row?.canonicalId ||
        row?.matchId ||
        row?.id
      ) ===
        canonicalId
  );
}

function publicationBundleSourceRefs(
  bundle
) {
  const refs = [
    {
      ref:
        `data/deploy-snapshots/${bundle.dayKey}/manifest.json`,

      sha256:
        clean(
          bundle
            ?.sourceManifest
            ?.contentSha256
        ).toLowerCase(),

      bytes:
        bundle
          ?.sourceManifest
          ?.contentBytes
    },

    ...(
      Array.isArray(
        bundle?.immutableBindings
      )
        ? bundle.immutableBindings.map(
            row => ({
              ref:
                clean(
                  row.targetPath
                ),

              sha256:
                clean(
                  row.contentSha256
                ).toLowerCase(),

              bytes:
                row.contentBytes
            })
          )
        : []
    )
  ];

  return refs
    .filter(
      row =>
        clean(
          row.ref
        ) &&
        validSha(
          row.sha256
        ) &&
        Number.isSafeInteger(
          row.bytes
        ) &&
        row.bytes >=
          0
    )
    .sort(
      (
        left,
        right
      ) =>
        left.ref.localeCompare(
          right.ref
        )
    );
}

function publicationStateMap(
  targetState
) {
  const value =
    targetState
      ?.byTargetPath;

  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value
    )
  ) {
    return null;
  }

  return value;
}

function validatePublicationTargetState(
  row,
  state,
  immutable = false
) {
  if (
    !state ||
    typeof state !==
      "object" ||
    Array.isArray(
      state
    ) ||
    typeof state.targetExists !==
      "boolean"
  ) {
    return false;
  }

  const currentSha256 =
    state.currentSha256 ===
      null
      ? null
      : clean(
          state.currentSha256
        ).toLowerCase();

  if (
    state.targetExists ===
      true &&
    !validSha(
      currentSha256
    )
  ) {
    return false;
  }

  if (
    state.targetExists ===
      false &&
    currentSha256 !==
      null
  ) {
    return false;
  }

  if (
    immutable
  ) {
    return (
      state.targetExists ===
        true &&
      currentSha256 ===
        clean(
          row.contentSha256
        ).toLowerCase()
    );
  }

  if (
    row.action ===
      "delete"
  ) {
    return (
      state.targetExists ===
        true &&
      validSha(
        currentSha256
      )
    );
  }

  return row.action ===
    "write";
}

function validatePublicationMaterial({
  dayKey,
  candidate,
  materialization,
  targetState
}) {
  const validation =
    validateAutonomousRepairPublicationCoupledMaterialBundle(
      materialization
    );

  if (
    !validation?.ok
  ) {
    return {
      ok:
        false,

      code:
        "PUBLICATION_COUPLED_BUNDLE_INVALID"
    };
  }

  if (
    materialization.schema !==
      AUTONOMOUS_REPAIR_PUBLICATION_COUPLED_MATERIAL_SCHEMA ||
    materialization.version !==
      AUTONOMOUS_REPAIR_PUBLICATION_COUPLED_MATERIAL_VERSION ||
    clean(
      materialization.dayKey
    ) !==
      dayKey
  ) {
    return {
      ok:
        false,

      code:
        "PUBLICATION_COUPLED_BUNDLE_CONTRACT_MISMATCH"
    };
  }

  const canonicalId =
    clean(
      candidate
        ?.diagnosis
        ?.canonicalId
    );

  if (
    !canonicalId ||
    !publicationBundleContainsCanonicalId(
      materialization,
      canonicalId
    )
  ) {
    return {
      ok:
        false,

      code:
        "PUBLICATION_COUPLED_FIXTURE_MEMBERSHIP_MISSING"
    };
  }

  const manifestMutation =
    publicationBundleMutationByRole(
      materialization,
      "DERIVED_MANIFEST"
    );

  if (
    !manifestMutation ||
    manifestMutation.action !==
      "write" ||
    !clean(
      manifestMutation.contentBase64
    ) ||
    manifestMutation.targetPath !==
      materialization
        ?.manifest
        ?.targetPath ||
    manifestMutation.contentSha256 !==
      materialization
        ?.manifest
        ?.contentSha256 ||
    manifestMutation.contentBytes !==
      materialization
        ?.manifest
        ?.contentBytes
  ) {
    return {
      ok:
        false,

      code:
        "PUBLICATION_MANIFEST_ANCHOR_INVALID"
    };
  }

  const byTargetPath =
    publicationStateMap(
      targetState
    );

  if (
    !byTargetPath
  ) {
    return {
      ok:
        false,

      code:
        "PUBLICATION_TARGET_STATE_MAP_REQUIRED",
      targetPath:
        manifestMutation.targetPath
    };
  }

  const sourceManifestState =
    byTargetPath[
      manifestMutation.targetPath
    ];

  if (
    !sourceManifestState ||
    sourceManifestState.targetExists !==
      true ||
    clean(
      sourceManifestState.currentSha256
    ).toLowerCase() !==
      clean(
        materialization
          ?.sourceManifest
          ?.contentSha256
      ).toLowerCase()
  ) {
    return {
      ok:
        false,

      code:
        "PUBLICATION_SOURCE_MANIFEST_PREIMAGE_MISMATCH",
      targetPath:
        manifestMutation.targetPath
    };
  }

  const mutations =
    materialization.mutations;

  const immutableBindings =
    materialization.immutableBindings;

  const unsupportedMutation =
    mutations.find(
      row =>
        row.action !==
          "write"
    );

  if (
    unsupportedMutation
  ) {
    return {
      ok:
        false,

      code:
        "PUBLICATION_DELETE_TARGET_UNSUPPORTED_BY_PLAN_V1",
      targetPath:
        unsupportedMutation.targetPath
    };
  }

  const expectedPaths =
    [
      ...mutations.map(
        row =>
          row.targetPath
      ),
      ...immutableBindings.map(
        row =>
          row.targetPath
      )
    ].sort();

  const suppliedPaths =
    Object.keys(
      byTargetPath
    ).sort();

  if (
    JSON.stringify(
      expectedPaths
    ) !==
    JSON.stringify(
      suppliedPaths
    )
  ) {
    return {
      ok:
        false,

      code:
        "PUBLICATION_TARGET_STATE_SET_MISMATCH",
      targetPath:
        manifestMutation.targetPath
    };
  }

  for (
    const row of
      mutations
  ) {
    if (
      !validatePublicationTargetState(
        row,
        byTargetPath[
          row.targetPath
        ],
        false
      )
    ) {
      return {
        ok:
          false,

        code:
          "PUBLICATION_MUTATION_TARGET_STATE_INVALID",
        targetPath:
          row.targetPath
      };
    }
  }

  for (
    const row of
      immutableBindings
  ) {
    if (
      !validatePublicationTargetState(
        row,
        byTargetPath[
          row.targetPath
        ],
        true
      )
    ) {
      return {
        ok:
          false,

        code:
          "PUBLICATION_IMMUTABLE_BINDING_STATE_MISMATCH",
        targetPath:
          row.targetPath
      };
    }
  }

  const expectedProducer =
    AUTONOMOUS_REPAIR_MATERIAL_PRODUCER_POLICY
      .REBUILD_PUBLICATION_CANONICAL_ROW;

  return {
    ok:
      true,

    targetPath:
      manifestMutation.targetPath,

    sourceRefs:
      publicationBundleSourceRefs(
        materialization
      ),

    contentBase64:
      manifestMutation.contentBase64,

    producer: {
      contractId:
        expectedProducer.contractId,

      sourcePath:
        expectedProducer.sourcePath,

      sourceDigestMode:
        expectedProducer.sourceDigestMode,

      normalizedSourceSha256:
        expectedProducer.normalizedSourceSha256
    },

    producerProofBuilder:
      "buildAutonomousRepairPublicationCoupledMaterialBundle",

    publicationBundle:
      materialization,

    publicationTargetStates:
      byTargetPath
  };
}

function publicationTargets(
  bundle,
  byTargetPath
) {
  return bundle.mutations.map(
    row => {
      const state =
        byTargetPath[
          row.targetPath
        ];

      return {
        targetPath:
          row.targetPath,

        targetExists:
          state.targetExists,

        currentSha256:
          state.currentSha256,

        plannedAction:
          row.action,

        plannedContentSha256:
          row.contentSha256,

        plannedContentBytes:
          row.contentBytes,

        publicationRole:
          row.role,

        publicationBundleFingerprint:
          bundle.bundleFingerprint
      };
    }
  );
}

function semanticMaterialCatalog(
  catalog
) {
  if (!catalog) {
    return null;
  }

  const {
    generatedAt:
      _generatedAt,
    ...semantic
  } =
    catalog;

  return semantic;
}

function semanticCore(
  artifact
) {
  return {
    schema:
      artifact.schema,

    version:
      artifact.version,

    dayKey:
      artifact.dayKey,

    role:
      artifact.role,

    bindings:
      artifact.bindings,

    state:
      artifact.state,

    summary:
      artifact.summary,

    candidateDecisionIds:
      artifact.candidateDecisionIds,

    resolutions:
      artifact.resolutions,

    materialCatalog:
      semanticMaterialCatalog(
        artifact.materialCatalog
      ),

    targetsByDecisionId:
      artifact.targetsByDecisionId,

    blockers:
      artifact.blockers,

    authority:
      artifact.authority
  };
}

function finalArtifact({
  dayKey,
  generatedAt,
  policyFingerprint,
  state,
  candidateDecisionIds,
  resolutions = [],
  materialCatalog = null,
  targetsByDecisionId = {},
  blockers = []
}) {
  const sortedBlockers =
    [...blockers]
      .sort(
        compareBlockers
      );

  const summary = {
    candidateCount:
      candidateDecisionIds.length,

    resolvedCount:
      resolutions.length,

    targetCount:
      Object.values(
        targetsByDecisionId
      ).reduce(
        (
          total,
          value
        ) =>
          total +
          (
            Array.isArray(
              value
            )
              ? value.length
              : 0
          ),
        0
      ),

    blockerCount:
      sortedBlockers.length
  };

  const result = {
    schema:
      AUTONOMOUS_REPAIR_SOURCE_BOUND_MATERIAL_RESOLUTION_SCHEMA,

    version:
      AUTONOMOUS_REPAIR_SOURCE_BOUND_MATERIAL_RESOLUTION_VERSION,

    dayKey,

    generatedAt,

    role:
      "derived_read_only_source_bound_material_resolution",

    bindings: {
      policyFingerprint,

      producerPolicyFingerprint:
        producerPolicyFingerprint()
    },

    resolutionFingerprint:
      "",

    state,
    summary,
    candidateDecisionIds,
    resolutions,
    materialCatalog,
    targetsByDecisionId,
    blockers:
      sortedBlockers,

    authority:
      authority()
  };

  result.resolutionFingerprint =
    sha256Value(
      semanticCore(
        result
      )
    );

  return result;
}

export function autonomousRepairProducerContractForClass(
  repairClass
) {
  const value =
    AUTONOMOUS_REPAIR_MATERIAL_PRODUCER_POLICY[
      clean(
        repairClass
      )
    ];

  return value
    ? JSON.parse(
        JSON.stringify(
          value
        )
      )
    : null;
}

export function buildAutonomousRepairSourceBoundMaterialResolution({
  policy,
  materializationsByDecisionId = {},
  targetStatesByDecisionId = {},
  generatedAt =
    new Date().toISOString()
} = {}) {
  if (
    !policy ||
    typeof policy !==
      "object" ||
    Array.isArray(
      policy
    )
  ) {
    throw new Error(
      "autonomous_repair_source_bound_material_policy_required"
    );
  }

  const dayKey =
    clean(
      policy.dayKey
    );

  const policyFingerprint =
    clean(
      policy.policyFingerprint
    ).toLowerCase();

  const timestamp =
    clean(
      generatedAt
    );

  if (
    !VALID_DAY.test(
      dayKey
    ) ||
    !validSha(
      policyFingerprint
    ) ||
    !timestamp
  ) {
    throw new Error(
      "autonomous_repair_source_bound_material_policy_binding_invalid"
    );
  }

  assertZeroAuthority(
    policy.authority
  );

  if (
    !materializationsByDecisionId ||
    typeof materializationsByDecisionId !==
      "object" ||
    Array.isArray(
      materializationsByDecisionId
    ) ||
    !targetStatesByDecisionId ||
    typeof targetStatesByDecisionId !==
      "object" ||
    Array.isArray(
      targetStatesByDecisionId
    )
  ) {
    throw new Error(
      "autonomous_repair_source_bound_material_input_maps_invalid"
    );
  }

  const candidates =
    candidateDecisions(
      policy
    );

  const candidateDecisionIds =
    candidates.map(
      candidate =>
        clean(
          candidate.policyDecisionId
        )
    );

  const candidateSet =
    new Set(
      candidateDecisionIds
    );

  const blockers =
    [];

  for (
    const key of
      Object.keys(
        materializationsByDecisionId
      )
  ) {
    if (
      !candidateSet.has(
        key
      )
    ) {
      blockers.push(
        blocker(
          "UNEXPECTED_MATERIALIZATION_ENTRY",
          {
            policyDecisionId:
              key
          }
        )
      );
    }
  }

  for (
    const key of
      Object.keys(
        targetStatesByDecisionId
      )
  ) {
    if (
      !candidateSet.has(
        key
      )
    ) {
      blockers.push(
        blocker(
          "UNEXPECTED_TARGET_STATE_ENTRY",
          {
            policyDecisionId:
              key
          }
        )
      );
    }
  }

  if (
    candidates.length ===
      0
  ) {
    return finalArtifact({
      dayKey,
      generatedAt:
        timestamp,
      policyFingerprint,
      state:
        blockers.length
          ? S.BLOCKED
          : S.NO_CANDIDATES,
      candidateDecisionIds,
      blockers
    });
  }

  const materialInputs =
    [];

  const resolvedMeta =
    [];

  for (
    const candidate of
      candidates
  ) {
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
        candidate
          ?.diagnosis
          ?.canonicalId
      );

    if (
      !VALID_CANDIDATE_ID.test(
        candidateDecisionId
      ) ||
      !REPAIR_CLASSES.has(
        repairClass
      ) ||
      !canonicalId
    ) {
      blockers.push(
        blocker(
          "CANDIDATE_CONTRACT_INVALID",
          candidate
        )
      );

      continue;
    }

    const materialization =
      materializationsByDecisionId[
        candidateDecisionId
      ];

    const targetState =
      targetStatesByDecisionId[
        candidateDecisionId
      ];

    if (!materialization) {
      blockers.push(
        blocker(
          "MATERIALIZATION_MISSING",
          candidate
        )
      );

      continue;
    }

    if (!targetState) {
      blockers.push(
        blocker(
          "TARGET_STATE_MISSING",
          candidate,
          materialization
            ?.targetPath
        )
      );

      continue;
    }

    const checked =
      repairClass ===
        "ACQUIRE_VERIFIED_FINAL_EVIDENCE"
        ? validateVerifiedFinalMaterial({
            dayKey,
            candidate,
            materialization
          })
        : repairClass ===
            "REBUILD_PUBLICATION_CANONICAL_ROW"
          ? validatePublicationMaterial({
              dayKey,
              candidate,
              materialization,
              targetState
            })
          : validateHistoryMaterial({
              candidate,
              materialization,
              targetState
            });

    if (!checked.ok) {
      blockers.push(
        blocker(
          checked.code,
          candidate,
          checked.targetPath
        )
      );

      continue;
    }

    materialInputs.push({
      candidateDecisionId,
      repairClass,
      canonicalId,
      targetPath:
        checked.targetPath,
      sources:
        checked.sourceRefs,
      contentBase64:
        checked.contentBase64
    });

    resolvedMeta.push({
      candidateDecisionId,
      repairClass,
      canonicalId,
      targetPath:
        checked.targetPath,
      producer:
        checked.producer,
      producerProofBuilder:
        checked.producerProofBuilder,

      publicationBundle:
        checked.publicationBundle ||
        null,

      publicationTargetStates:
        checked.publicationTargetStates ||
        null
    });
  }

  if (
    blockers.length >
      0 ||
    materialInputs.length !==
      candidates.length
  ) {
    return finalArtifact({
      dayKey,
      generatedAt:
        timestamp,
      policyFingerprint,
      state:
        S.BLOCKED,
      candidateDecisionIds,
      blockers
    });
  }

  const materialCatalog =
    buildAutonomousRepairTargetMaterialCatalog({
      dayKey,
      materials:
        materialInputs,
      generatedAt:
        timestamp
    });

  const metaByDecisionId =
    new Map(
      resolvedMeta.map(
        meta => [
          meta.candidateDecisionId,
          meta
        ]
      )
    );

  const catalogTargetStatesByDecisionId =
    Object.fromEntries(
      candidateDecisionIds.map(
        candidateDecisionId => {
          const meta =
            metaByDecisionId.get(
              candidateDecisionId
            );

          if (
            meta?.repairClass ===
              "REBUILD_PUBLICATION_CANONICAL_ROW"
          ) {
            return [
              candidateDecisionId,
              meta.publicationTargetStates[
                meta.targetPath
              ]
            ];
          }

          return [
            candidateDecisionId,
            targetStatesByDecisionId[
              candidateDecisionId
            ]
          ];
        }
      )
    );

  const flatTargets =
    deriveAutonomousRepairTargetsByDecisionId({
      catalog:
        materialCatalog,
      targetStatesByDecisionId:
        catalogTargetStatesByDecisionId
    });

  const targetsByDecisionId =
    Object.fromEntries(
      candidateDecisionIds.map(
        candidateDecisionId => {
          const meta =
            metaByDecisionId.get(
              candidateDecisionId
            );

          return [
            candidateDecisionId,
            meta?.repairClass ===
              "REBUILD_PUBLICATION_CANONICAL_ROW"
              ? publicationTargets(
                  meta.publicationBundle,
                  meta.publicationTargetStates
                )
              : [
                  flatTargets[
                    candidateDecisionId
                  ]
                ]
          ];
        }
      )
    );

  const materialById =
    new Map(
      materialCatalog.materials.map(
        material => [
          material.candidateDecisionId,
          material
        ]
      )
    );

  const metaById =
    new Map(
      resolvedMeta.map(
        meta => [
          meta.candidateDecisionId,
          meta
        ]
      )
    );

  const resolutions =
    candidateDecisionIds.map(
      candidateDecisionId => {
        const material =
          materialById.get(
            candidateDecisionId
          );

        const meta =
          metaById.get(
            candidateDecisionId
          );

        const target =
          flatTargets[
            candidateDecisionId
          ];

        if (
          meta.repairClass ===
            "REBUILD_PUBLICATION_CANONICAL_ROW"
        ) {
          return {
            candidateDecisionId,
            repairClass:
              material.repairClass,
            canonicalId:
              material.canonicalId,
            targetPath:
              material.targetPath,
            producerContractId:
              meta.producer.contractId,
            producerPath:
              meta.producer.sourcePath,
            producerNormalizedSourceSha256:
              meta.producer.normalizedSourceSha256,
            producerProofBuilder:
              meta.producerProofBuilder,
            materialFingerprint:
              material.materialFingerprint,
            contentSha256:
              material.contentSha256,
            contentBytes:
              material.contentBytes,
            targetExists:
              target.targetExists,
            currentSha256:
              target.currentSha256,
            publicationBundleFingerprint:
              meta.publicationBundle.bundleFingerprint,
            publicationTargetCount:
              meta.publicationBundle.mutations.length,
            immutableBindingCount:
              meta.publicationBundle.immutableBindings.length,
            publicationBundle:
              meta.publicationBundle
          };
        }

        return {
          candidateDecisionId,
          repairClass:
            material.repairClass,
          canonicalId:
            material.canonicalId,
          targetPath:
            material.targetPath,
          producerContractId:
            meta.producer.contractId,
          producerPath:
            meta.producer.sourcePath,
          producerNormalizedSourceSha256:
            meta.producer.normalizedSourceSha256,
          producerProofBuilder:
            meta.producerProofBuilder,
          materialFingerprint:
            material.materialFingerprint,
          contentSha256:
            material.contentSha256,
          contentBytes:
            material.contentBytes,
          targetExists:
            target.targetExists,
          currentSha256:
            target.currentSha256
        };
      }
    );

  return finalArtifact({
    dayKey,
    generatedAt:
      timestamp,
    policyFingerprint,
    state:
      S.RESOLVED,
    candidateDecisionIds,
    resolutions,
    materialCatalog,
    targetsByDecisionId,
    blockers:
      []
  });
}

export function validateAutonomousRepairSourceBoundMaterialResolution(
  artifact
) {
  if (
    !artifact ||
    typeof artifact !==
      "object" ||
    Array.isArray(
      artifact
    ) ||
    artifact.schema !==
      AUTONOMOUS_REPAIR_SOURCE_BOUND_MATERIAL_RESOLUTION_SCHEMA ||
    artifact.version !==
      AUTONOMOUS_REPAIR_SOURCE_BOUND_MATERIAL_RESOLUTION_VERSION ||
    artifact.role !==
      "derived_read_only_source_bound_material_resolution" ||
    !VALID_DAY.test(
      clean(
        artifact.dayKey
      )
    ) ||
    !clean(
      artifact.generatedAt
    ) ||
    !validSha(
      artifact
        ?.bindings
        ?.policyFingerprint
    ) ||
    artifact
      ?.bindings
      ?.producerPolicyFingerprint !==
        producerPolicyFingerprint() ||
    !Object.values(
      S
    ).includes(
      artifact.state
    ) ||
    !Array.isArray(
      artifact.candidateDecisionIds
    ) ||
    !Array.isArray(
      artifact.resolutions
    ) ||
    !Array.isArray(
      artifact.blockers
    ) ||
    !artifact.targetsByDecisionId ||
    typeof artifact.targetsByDecisionId !==
      "object" ||
    Array.isArray(
      artifact.targetsByDecisionId
    )
  ) {
    throw new Error(
      "autonomous_repair_source_bound_material_artifact_invalid"
    );
  }

  const expectedAuthority =
    authority();

  if (
    JSON.stringify(
      stableValue(
        artifact.authority
      )
    ) !==
    JSON.stringify(
      stableValue(
        expectedAuthority
      )
    )
  ) {
    throw new Error(
      "autonomous_repair_source_bound_material_authority_mismatch"
    );
  }

  const candidateIds =
    [...artifact.candidateDecisionIds];

  if (
    candidateIds.some(
      id =>
        !VALID_CANDIDATE_ID.test(
          id
        )
    ) ||
    new Set(
      candidateIds
    ).size !==
      candidateIds.length ||
    JSON.stringify(
      candidateIds
    ) !==
    JSON.stringify(
      [...candidateIds].sort()
    )
  ) {
    throw new Error(
      "autonomous_repair_source_bound_material_candidate_ids_invalid"
    );
  }

  if (
    artifact.state ===
      S.RESOLVED
  ) {
    if (
      artifact.blockers.length !==
        0 ||
      !artifact.materialCatalog
    ) {
      throw new Error(
        "autonomous_repair_source_bound_material_resolved_state_invalid"
      );
    }

    validateAutonomousRepairTargetMaterialCatalog(
      artifact.materialCatalog
    );

    const materialIds =
      artifact
        .materialCatalog
        .materials
        .map(
          material =>
            material.candidateDecisionId
        );

    if (
      JSON.stringify(
        materialIds
      ) !==
      JSON.stringify(
        candidateIds
      )
    ) {
      throw new Error(
        "autonomous_repair_source_bound_material_catalog_candidate_mismatch"
      );
    }

    if (
      artifact.resolutions.length !==
        candidateIds.length ||
      Object.keys(
        artifact.targetsByDecisionId
      ).length !==
        candidateIds.length
    ) {
      throw new Error(
        "autonomous_repair_source_bound_material_resolved_cardinality_mismatch"
      );
    }

    const materialById =
      new Map(
        artifact
          .materialCatalog
          .materials
          .map(
            material => [
              material.candidateDecisionId,
              material
            ]
          )
      );

    for (
      const candidateDecisionId of
        candidateIds
    ) {
      const targets =
        artifact.targetsByDecisionId[
          candidateDecisionId
        ];

      const resolution =
        artifact.resolutions.find(
          row =>
            row.candidateDecisionId ===
              candidateDecisionId
        );

      const material =
        materialById.get(
          candidateDecisionId
        );

      if (
        resolution?.repairClass ===
          "REBUILD_PUBLICATION_CANONICAL_ROW"
      ) {
        const bundle =
          resolution.publicationBundle;

        const validation =
          validateAutonomousRepairPublicationCoupledMaterialBundle(
            bundle
          );

        const manifestMutation =
          publicationBundleMutationByRole(
            bundle,
            "DERIVED_MANIFEST"
          );

        if (
          !validation?.ok ||
          !material ||
          !manifestMutation ||
          !Array.isArray(
            targets
          ) ||
          targets.length !==
            bundle.mutations.length ||
          material.targetPath !==
            manifestMutation.targetPath ||
          material.contentSha256 !==
            manifestMutation.contentSha256 ||
          material.contentBytes !==
            manifestMutation.contentBytes ||
          resolution.targetPath !==
            material.targetPath ||
          resolution.materialFingerprint !==
            material.materialFingerprint ||
          resolution.contentSha256 !==
            material.contentSha256 ||
          resolution.contentBytes !==
            material.contentBytes ||
          resolution.publicationBundleFingerprint !==
            bundle.bundleFingerprint ||
          resolution.publicationTargetCount !==
            bundle.mutations.length ||
          resolution.immutableBindingCount !==
            bundle.immutableBindings.length ||
          bundle.mutations.some(
            row =>
              row.action !==
                "write"
          ) ||
          !publicationBundleContainsCanonicalId(
            bundle,
            resolution.canonicalId
          )
        ) {
          throw new Error(
            "autonomous_repair_source_bound_material_publication_resolution_binding_mismatch"
          );
        }

        for (
          let index = 0;
          index <
            bundle.mutations.length;
          index +=
            1
        ) {
          const mutation =
            bundle.mutations[index];

          const publicationTarget =
            targets[index];

          if (
            !publicationTarget ||
            publicationTarget.targetPath !==
              mutation.targetPath ||
            publicationTarget.plannedAction !==
              mutation.action ||
            publicationTarget.plannedContentSha256 !==
              mutation.contentSha256 ||
            publicationTarget.plannedContentBytes !==
              mutation.contentBytes ||
            publicationTarget.publicationRole !==
              mutation.role ||
            publicationTarget.publicationBundleFingerprint !==
              bundle.bundleFingerprint ||
            typeof publicationTarget.targetExists !==
              "boolean" ||
            (
              publicationTarget.targetExists ===
                true &&
              !validSha(
                publicationTarget.currentSha256
              )
            ) ||
            (
              publicationTarget.targetExists ===
                false &&
              publicationTarget.currentSha256 !==
                null
            )
          ) {
            throw new Error(
              "autonomous_repair_source_bound_material_publication_target_binding_mismatch"
            );
          }
        }

        const manifestTarget =
          targets.find(
            row =>
              row.targetPath ===
                manifestMutation.targetPath
          );

        if (
          !manifestTarget ||
          resolution.targetExists !==
            manifestTarget.targetExists ||
          resolution.currentSha256 !==
            manifestTarget.currentSha256
        ) {
          throw new Error(
            "autonomous_repair_source_bound_material_publication_anchor_state_mismatch"
          );
        }

        continue;
      }

      if (
        !Array.isArray(
          targets
        ) ||
        targets.length !==
          1 ||
        !resolution ||
        !material
      ) {
        throw new Error(
          "autonomous_repair_source_bound_material_plan_adapter_shape_invalid"
        );
      }

      const target =
        targets[0];

      if (
        target.targetPath !==
          material.targetPath ||
        target.plannedContentSha256 !==
          material.contentSha256 ||
        target.plannedContentBytes !==
          material.contentBytes ||
        resolution.targetPath !==
          material.targetPath ||
        resolution.materialFingerprint !==
          material.materialFingerprint ||
        resolution.contentSha256 !==
          material.contentSha256 ||
        resolution.contentBytes !==
          material.contentBytes ||
        resolution.targetExists !==
          target.targetExists ||
        resolution.currentSha256 !==
          target.currentSha256
      ) {
        throw new Error(
          "autonomous_repair_source_bound_material_resolution_binding_mismatch"
        );
      }
    }
  }
  else {
    if (
      artifact.materialCatalog !==
        null ||
      artifact.resolutions.length !==
        0 ||
      Object.keys(
        artifact.targetsByDecisionId
      ).length !==
        0
    ) {
      throw new Error(
        "autonomous_repair_source_bound_material_nonresolved_output_forbidden"
      );
    }

    if (
      artifact.state ===
        S.NO_CANDIDATES &&
      (
        candidateIds.length !==
          0 ||
        artifact.blockers.length !==
          0
      )
    ) {
      throw new Error(
        "autonomous_repair_source_bound_material_no_candidates_state_invalid"
      );
    }

    if (
      artifact.state ===
        S.BLOCKED &&
      artifact.blockers.length ===
        0
    ) {
      throw new Error(
        "autonomous_repair_source_bound_material_blocked_without_blocker"
      );
    }
  }

  const expectedSummary = {
    candidateCount:
      candidateIds.length,

    resolvedCount:
      artifact.resolutions.length,

    targetCount:
      Object.values(
        artifact.targetsByDecisionId
      ).reduce(
        (
          total,
          targets
        ) =>
          total +
          (
            Array.isArray(
              targets
            )
              ? targets.length
              : 0
          ),
        0
      ),

    blockerCount:
      artifact.blockers.length
  };

  if (
    JSON.stringify(
      stableValue(
        artifact.summary
      )
    ) !==
    JSON.stringify(
      stableValue(
        expectedSummary
      )
    )
  ) {
    throw new Error(
      "autonomous_repair_source_bound_material_summary_mismatch"
    );
  }

  if (
    sha256Value(
      semanticCore(
        artifact
      )
    ) !==
      artifact.resolutionFingerprint
  ) {
    throw new Error(
      "autonomous_repair_source_bound_material_resolution_fingerprint_mismatch"
    );
  }

  return true;
}
