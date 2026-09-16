import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import {
  createHash,
  generateKeyPairSync,
  sign
} from "node:crypto";

import {
  evaluateAutonomousRepairExecutionRequestGate
} from "./autonomous-repair-execution-request-gate.js";

import {
  buildAutonomousRepairSourceBoundMaterialResolution,
  autonomousRepairProducerContractForClass
} from "./autonomous-repair-source-bound-material-resolver.js";

import {
  buildAutonomousRepairPublicationCoupledMaterialBundle
} from "./autonomous-repair-publication-coupled-materializer.js";

import {
  computeDeploySnapshotManifestHash
} from "./deploy-snapshot-release-contract.js";

import {
  AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2_SCHEMA,
  AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2_VERSION,
  AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2_POLICY_VERSION,
  autonomousRepairExecutionAuthorizationV2Fingerprint,
  autonomousRepairExecutionAuthorizationV2SigningBytes
} from "./autonomous-repair-execution-authorization-v2.js";

import {
  publicKeySpkiSha256
} from "./autonomous-repair-authorization-trusted-public-keys.js";

import {
  validateAutonomousRepairExecutionAuthorizationV2Binding,
  verifyAutonomousRepairExecutionAuthorizationV2BindingAgainstTrustedKeyRecord,
  verifyAutonomousRepairExecutionAuthorizationV2BindingWithPinnedTrust
} from "./autonomous-repair-execution-authorization-v2-binding.js";

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (
    value &&
    typeof value === "object"
  ) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(
          key => [
            key,
            stableValue(value[key])
          ]
        )
    );
  }

  return value;
}

function sha256Value(value) {
  return createHash("sha256")
    .update(
      JSON.stringify(
        stableValue(value)
      )
    )
    .digest("hex");
}

function sha256Bytes(value) {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

function decisionId(token) {
  return `arpd_v1_${token.repeat(24)}`;
}

function candidate({
  token = "1",
  repairClass =
    "ACQUIRE_VERIFIED_FINAL_EVIDENCE",
  canonicalId =
    "cid_test_home_away_20260916"
} = {}) {
  return {
    classification:
      "ELIGIBLE_REPAIR_CANDIDATE",
    policyDecisionId:
      decisionId(token),
    repairClass,
    diagnosis: {
      canonicalId
    }
  };
}

function policy({
  candidates = []
} = {}) {
  return {
    dayKey:
      "2026-09-16",
    policyFingerprint:
      "a".repeat(64),
    decisions:
      candidates,
    authority: {
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
    }
  };
}

function canonicalBytes(value) {
  return Buffer.from(
    `${JSON.stringify(
      value,
      null,
      2
    )}\n`,
    "utf8"
  );
}

function sourceRefs(
  token = "1"
) {
  const raw =
    Buffer.from(
      `source-${token}`,
      "utf8"
    );

  return [
    {
      ref:
        `evidence/source-${token}.json`,
      sha256:
        sha256Bytes(raw),
      bytes:
        raw.length
    }
  ];
}

function finalPayload({
  canonicalId =
    "cid_test_home_away_20260916"
} = {}) {
  return {
    schema:
      "ai-matchlab.verified-final-result.v1",
    verifiedFinalTruth:
      true,
    date:
      "2026-09-16",
    dayKey:
      "2026-09-16",
    matchId:
      canonicalId,
    homeScore:
      2,
    awayScore:
      1,
    scoreHome:
      2,
    scoreAway:
      1,
    finalScore: {
      homeScore:
        2,
      awayScore:
        1,
      home:
        2,
      away:
        1,
      scoreKey:
        "2-1"
    },
    scoreKey:
      "2-1",
    finalTruthVerdict:
      "verified_final_result",
    verdict:
      "verified_final_result",
    sourceCount:
      1,
    independentSourceCount:
      1,
    sources: [
      {
        provider:
          "flashscore"
      }
    ],
    verification: {
      verdict:
        "verified_final_result",
      generatedAt:
        "2026-09-16T10:00:00.000Z"
    },
    settlement: {
      state:
        "verified_final_result"
    },
    generatedAt:
      "2026-09-16T10:00:00.000Z"
  };
}

function finalMaterialization({
  canonicalId =
    "cid_test_home_away_20260916",
  targetPath =
    `data/final-results/2026-09-16/${canonicalId}.json`,
  token = "1"
} = {}) {
  const buffer =
    canonicalBytes(
      finalPayload({
        canonicalId
      })
    );

  return {
    targetPath,
    producer:
      autonomousRepairProducerContractForClass(
        "ACQUIRE_VERIFIED_FINAL_EVIDENCE"
      ),
    producerProof: {
      builder:
        "buildVerifiedFinalResult"
    },
    sourceRefs:
      sourceRefs(token),
    contentBase64:
      buffer.toString("base64")
  };
}

function ordinaryMaterialResolution({
  twoTargets = false
} = {}) {
  const first =
    candidate({
      token:
        "1",
      canonicalId:
        "cid_test_home_away_20260916"
    });

  const candidates = [first];

  const materializationsByDecisionId = {
    [first.policyDecisionId]:
      finalMaterialization({
        canonicalId:
          first.diagnosis.canonicalId,
        token:
          "1"
      })
  };

  const targetStatesByDecisionId = {
    [first.policyDecisionId]: {
      targetExists:
        false,
      currentSha256:
        null
    }
  };

  if (twoTargets) {
    const second =
      candidate({
        token:
          "2",
        canonicalId:
          "cid_test_second_match_20260916"
      });

    candidates.push(second);

    materializationsByDecisionId[
      second.policyDecisionId
    ] =
      finalMaterialization({
        canonicalId:
          second.diagnosis.canonicalId,
        token:
          "2"
      });

    targetStatesByDecisionId[
      second.policyDecisionId
    ] = {
      targetExists:
        false,
      currentSha256:
        null
    };
  }

  return buildAutonomousRepairSourceBoundMaterialResolution({
    policy:
      policy({
        candidates
      }),
    materializationsByDecisionId,
    targetStatesByDecisionId,
    generatedAt:
      "2026-09-16T12:05:00.000Z"
  });
}

function makeTargetVerification(
  materialResolution,
  {
    limitTargets = null,
    forceExists = null
  } = {}
) {
  const flattened = [];

  for (
    const candidateDecisionId of
      materialResolution.candidateDecisionIds
  ) {
    const targets =
      materialResolution.targetsByDecisionId[
        candidateDecisionId
      ];

    for (const target of targets) {
      flattened.push(
        structuredClone(target)
      );
    }
  }

  flattened.sort(
    (a, b) =>
      a.targetPath.localeCompare(
        b.targetPath
      )
  );

  const selected =
    limitTargets === null
      ? flattened
      : flattened.slice(
          0,
          limitTargets
        );

  const operations =
    selected.map(
      (target, index) => {
        const targetExists =
          forceExists === null
            ? target.targetExists
            : forceExists;

        const actualSha256 =
          targetExists
            ? (
                target.currentSha256 ??
                "e".repeat(64)
              )
            : null;

        const evidenceCore = {
          operationId:
            `arpo_v1_${String(
              index + 1
            ).repeat(24)}`,
          targetPath:
            target.targetPath,
          mutationMode:
            targetExists
              ? "REPLACE"
              : "CREATE",
          lexicalContained:
            true,
          physicalContained:
            true,
          reparseFree:
            true,
          parentChainVerified:
            true,
          targetExists,
          actualSha256,
          actualBytes:
            targetExists
              ? 1
              : null,
          preconditionMatches:
            true
        };

        return {
          ...evidenceCore,
          preimageFingerprint:
            sha256Value(
              evidenceCore
            ),
          verified:
            true
        };
      }
    );

  operations.sort(
    (a, b) =>
      [
        a.targetPath,
        a.operationId
      ]
        .join("\u0000")
        .localeCompare(
          [
            b.targetPath,
            b.operationId
          ].join("\u0000")
        )
  );

  const summary = {
    operationCount:
      operations.length,
    verifiedOperationCount:
      operations.length,
    blockedOperationCount:
      0,
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
      0
  };

  const authority = {
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

  const artifact = {
    schema:
      "ai-matchlab.autonomous-repair-target-verification.v1",
    version:
      "1.0.0",
    dayKey:
      materialResolution.dayKey,
    generatedAt:
      "2026-09-16T13:00:00.000Z",
    role:
      "derived_read_only_target_preimage_verification",
    planFingerprint:
      "1".repeat(64),
    verificationFingerprint:
      null,
    verificationState:
      "TARGETS_VERIFIED",
    summary,
    operations,
    blockers:
      [],
    authority
  };

  artifact.verificationFingerprint =
    sha256Value({
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
    });

  return artifact;
}

function requestFromMaterial(
  materialResolution,
  options = {}
) {
  const targetVerification =
    makeTargetVerification(
      materialResolution,
      options
    );

  const executionRequest =
    evaluateAutonomousRepairExecutionRequestGate({
      targetVerification,
      generatedAt:
        "2026-09-16T13:05:00.000Z"
    });

  return {
    targetVerification,
    executionRequest
  };
}

function ephemeralSigner() {
  const {
    publicKey,
    privateKey
  } =
    generateKeyPairSync(
      "ed25519"
    );

  const publicKeyPem =
    publicKey.export({
      type:
        "spki",
      format:
        "pem"
    });

  return {
    privateKey,
    trustedKeyRecord: {
      issuerId:
        "test-external-control-plane",
      keyId:
        "arkey_v1_runtime-binding-test",
      publicKeyPem,
      publicKeySpkiSha256:
        publicKeySpkiSha256(
          publicKeyPem
        )
    }
  };
}

function materialRepairClassMap(
  materialResolution
) {
  const resolutionById =
    new Map(
      materialResolution.resolutions.map(
        row => [
          row.candidateDecisionId,
          row
        ]
      )
    );

  const out = new Map();

  for (
    const candidateDecisionId of
      materialResolution.candidateDecisionIds
  ) {
    const resolution =
      resolutionById.get(
        candidateDecisionId
      );

    for (
      const target of
        materialResolution.targetsByDecisionId[
          candidateDecisionId
        ]
    ) {
      out.set(
        target.targetPath,
        resolution.repairClass
      );
    }
  }

  return out;
}

function authorizationFor({
  executionRequest,
  materialResolution,
  signer = ephemeralSigner(),
  state = "AUTHORIZED",
  extraRepairClass = null
}) {
  const granted =
    state === "AUTHORIZED";

  const repairByTarget =
    materialRepairClassMap(
      materialResolution
    );

  const operationScope =
    granted
      ? executionRequest.operationScope.map(
          row => ({
            operationId:
              row.operationId,
            targetPath:
              row.targetPath,
            mutationMode:
              row.mutationMode,
            preimageFingerprint:
              row.preimageFingerprint,
            repairClass:
              repairByTarget.get(
                row.targetPath
              )
          })
        )
      : [];

  const classSet =
    new Set(
      operationScope.map(
        row =>
          row.repairClass
      )
    );

  if (extraRepairClass) {
    classSet.add(
      extraRepairClass
    );
  }

  const authorization = {
    schema:
      AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2_SCHEMA,
    version:
      AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2_VERSION,
    dayKey:
      executionRequest.dayKey,
    generatedAt:
      "2026-09-16T13:10:00.000Z",
    role:
      "externally_signed_bounded_execution_authorization",
    authorizationId:
      "arauth_v2_0123456789abcdef0123456789abcdef",
    nonce:
      `arnonce_v2_${"a".repeat(64)}`,
    issuedAt:
      "2026-09-16T13:10:00.000Z",
    notBefore:
      "2026-09-16T13:10:05.000Z",
    expiresAt:
      "2026-09-16T13:20:00.000Z",
    policyVersion:
      AUTONOMOUS_REPAIR_EXECUTION_AUTHORIZATION_V2_POLICY_VERSION,
    authorizationState:
      state,
    authorizationBasis: {
      source:
        "external_control_plane",
      issuerId:
        signer.trustedKeyRecord.issuerId,
      keyId:
        signer.trustedKeyRecord.keyId,
      publicKeySpkiSha256:
        signer.trustedKeyRecord.publicKeySpkiSha256,
      decisionFingerprint:
        "b".repeat(64)
    },
    bindings: {
      requestFingerprint:
        executionRequest.requestFingerprint,
      planFingerprint:
        executionRequest.planFingerprint,
      verificationFingerprint:
        executionRequest.verificationFingerprint,
      materialResolutionFingerprint:
        materialResolution.resolutionFingerprint
    },
    repairClassScope:
      granted
        ? Array.from(
            classSet
          ).sort()
        : [],
    operationScope,
    safety: {
      exactRequestScopeOnly:
        true,
      preimageReverificationRequired:
        true,
      atomicWriteRequired:
        true,
      postWriteAuditRequired:
        true,
      rollbackRequired:
        true,
      singleUseRequired:
        true
    },
    authority: {
      artifactReadOnly:
        true,
      authorizationGranted:
        granted,
      filesystemWriteAuthorized:
        granted,
      repairAuthorized:
        granted,
      executionAuthorized:
        granted,
      rollbackExecutionAuthorized:
        granted,
      workflowMutationAuthorized:
        false
    },
    authorizationFingerprint:
      null,
    signature: {
      algorithm:
        "Ed25519",
      encoding:
        "base64",
      value:
        "AA=="
    }
  };

  resign(
    authorization,
    signer.privateKey
  );

  return {
    authorization,
    signer
  };
}

function resign(
  authorization,
  privateKey
) {
  authorization.authorizationFingerprint =
    autonomousRepairExecutionAuthorizationV2Fingerprint(
      authorization
    );

  authorization.signature.value =
    sign(
      null,
      autonomousRepairExecutionAuthorizationV2SigningBytes(
        authorization
      ),
      privateKey
    ).toString("base64");
}

const PUBLICATION_ID =
  "cid_test_home_away_20260916";

function publicationPrettyBytes(value) {
  return Buffer.from(
    `${JSON.stringify(
      value,
      null,
      2
    )}\n`,
    "utf8"
  );
}

function publicationOverlay() {
  return {
    resolveEvidenceFixtureId(value) {
      const text =
        String(value ?? "").trim();

      return {
        ok:
          true,
        managed:
          false,
        sourceFixtureId:
          text,
        resolvedFixtureId:
          text,
        sourceRole:
          "unmanaged"
      };
    }
  };
}

function publicationSourceManifest() {
  const manifest = {
    ok:
      true,
    date:
      "2026-09-16",
    generatedAt:
      "2026-09-16T09:00:00.000Z",
    startedAt:
      "2026-09-16T08:59:00.000Z",
    source:
      "local_canonical_export",
    version:
      "deploy-snapshot-v2",
    fixturesSource:
      "canonical",
    files: {
      fixtures:
        "fixtures.json",
      value:
        "value.json",
      valueAudit:
        null,
      detailsDir:
        "details"
    },
    fileHashes: {
      "fixtures.json":
        "0".repeat(64),
      "value.json":
        "1".repeat(64)
    },
    counts: {
      fixtures:
        1,
      valuePicks:
        0,
      details:
        1,
      detailsMatchedToFixtures:
        1,
      orphanDetailsRemoved:
        0,
      detailsMissingForFixtures:
        0
    },
    valueGate: {
      fixtures:
        1,
      valuePicks:
        0,
      valueSource:
        "local_value_file",
      valueFreshAgainstCanonical:
        null,
      ok:
        true
    },
    fixturesByLeague: {
      "test.1":
        1
    },
    coverage:
      {},
    sizes: {
      fixturesMb:
        0,
      valueMb:
        0,
      detailsTotalMb:
        0,
      largestDetail: {
        file:
          null,
        bytes:
          0,
        mb:
          0
      }
    },
    details:
      []
  };

  manifest.hash =
    computeDeploySnapshotManifestHash(
      manifest
    );

  return manifest;
}

function publicationFixtureRow() {
  return {
    canonicalId:
      PUBLICATION_ID,
    matchId:
      PUBLICATION_ID,
    dayKey:
      "2026-09-16",
    leagueSlug:
      "test.1",
    status:
      "PRE",
    rawStatus:
      "SCHEDULED",
    minute:
      "",
    scoreHome:
      null,
    scoreAway:
      null
  };
}

function publicationFixtureUniverse() {
  const rows = [
    publicationFixtureRow()
  ];

  return {
    source:
      "canonical_with_runtime_overlay",
    canonicalFixtureCount:
      rows.length,
    sourceFixtureJsonCount:
      rows.length,
    fixtureJsonCount:
      rows.length,
    snapshotRescuedCount:
      0,
    snapshotRescuedLeagues:
      [],
    runtimeOverlayCount:
      0,
    runtimeOnlyExcludedCount:
      0,
    runtimeOnlyExcludedIds:
      [],
    outsideTargetDayRuntimeCount:
      0,
    outsideTargetDayRuntimeIds:
      [],
    ambiguousRuntimeCount:
      0,
    ambiguousCanonicalAliasCount:
      0,
    fixtures:
      rows
  };
}

function publicationDetailPayload() {
  return {
    matchId:
      PUBLICATION_ID,
    basic: {
      canonicalId:
        PUBLICATION_ID,
      matchId:
        PUBLICATION_ID
    },
    valueSummary: {
      count:
        0,
      picks:
        []
    },
    meta: {
      valueSynced:
        false
    }
  };
}

function publicationBundle() {
  return buildAutonomousRepairPublicationCoupledMaterialBundle({
    dayKey:
      "2026-09-16",
    sourceManifestBytes:
      publicationPrettyBytes(
        publicationSourceManifest()
      ),
    fixtureUniverse:
      publicationFixtureUniverse(),
    fixturesAll: {
      matches:
        []
    },
    detailInventoryPaths: [
      `data/deploy-snapshots/2026-09-16/details/${PUBLICATION_ID}.json`
    ],
    sourceDetails: [
      {
        path:
          `data/details/2026-09-16/${PUBLICATION_ID}.json`,
        detail:
          publicationDetailPayload()
      }
    ],
    existingDeployDetails:
      [],
    preserveExistingDetails:
      true,
    overlay:
      publicationOverlay(),
    valueBytes:
      publicationPrettyBytes({
        ok:
          true,
        date:
          "2026-09-16",
        source:
          "local_value_file",
        count:
          0,
        picks:
          []
      }),
    valueAuditBytes:
      null,
    planCSourceBytes:
      null,
    planCSourceMissing:
      false,
    buildTimestamp:
      "2026-09-16T12:00:00.000Z"
  });
}

function publicationMaterialResolution() {
  const row =
    candidate({
      token:
        "7",
      repairClass:
        "REBUILD_PUBLICATION_CANONICAL_ROW",
      canonicalId:
        PUBLICATION_ID
    });

  const bundle =
    publicationBundle();

  const byTargetPath = {};

  for (const mutation of bundle.mutations) {
    byTargetPath[
      mutation.targetPath
    ] = {
      targetExists:
        true,
      currentSha256:
        mutation.targetPath ===
          bundle.manifest.targetPath
          ? bundle.sourceManifest.contentSha256
          : "e".repeat(64)
    };
  }

  for (
    const immutable of
      bundle.immutableBindings
  ) {
    byTargetPath[
      immutable.targetPath
    ] = {
      targetExists:
        true,
      currentSha256:
        immutable.contentSha256
    };
  }

  return buildAutonomousRepairSourceBoundMaterialResolution({
    policy:
      policy({
        candidates: [
          row
        ]
      }),
    materializationsByDecisionId: {
      [row.policyDecisionId]:
        bundle
    },
    targetStatesByDecisionId: {
      [row.policyDecisionId]: {
        byTargetPath
      }
    },
    generatedAt:
      "2026-09-16T12:05:00.000Z"
  });
}

test(
  "ordinary verified-final authorization binds exact request verification material and replay identity",
  () => {
    const materialResolution =
      ordinaryMaterialResolution();

    const {
      targetVerification,
      executionRequest
    } =
      requestFromMaterial(
        materialResolution
      );

    const {
      authorization,
      signer
    } =
      authorizationFor({
        executionRequest,
        materialResolution
      });

    const result =
      verifyAutonomousRepairExecutionAuthorizationV2BindingAgainstTrustedKeyRecord({
        authorization,
        executionRequest,
        targetVerification,
        materialResolution,
        trustedKeyRecord:
          signer.trustedKeyRecord,
        now:
          "2026-09-16T13:11:00.000Z"
      });

    assert.equal(
      result.ok,
      true
    );

    assert.equal(
      result.operationCount,
      1
    );

    assert.match(
      result.replayKey,
      /^[0-9a-f]{64}$/u
    );
  }
);

test(
  "publication coupled authorization binds every mutation target to the one publication repair class",
  () => {
    const materialResolution =
      publicationMaterialResolution();

    const {
      targetVerification,
      executionRequest
    } =
      requestFromMaterial(
        materialResolution
      );

    const {
      authorization,
      signer
    } =
      authorizationFor({
        executionRequest,
        materialResolution
      });

    const result =
      verifyAutonomousRepairExecutionAuthorizationV2BindingAgainstTrustedKeyRecord({
        authorization,
        executionRequest,
        targetVerification,
        materialResolution,
        trustedKeyRecord:
          signer.trustedKeyRecord,
        now:
          "2026-09-16T13:11:00.000Z"
      });

    assert.equal(
      result.operationCount,
      materialResolution.summary.targetCount
    );

    assert.deepEqual(
      result.repairClassScope,
      [
        "REBUILD_PUBLICATION_CANONICAL_ROW"
      ]
    );
  }
);

test(
  "signed material-resolution fingerprint drift fails exact binding",
  () => {
    const materialResolution =
      ordinaryMaterialResolution();

    const {
      targetVerification,
      executionRequest
    } =
      requestFromMaterial(
        materialResolution
      );

    const {
      authorization,
      signer
    } =
      authorizationFor({
        executionRequest,
        materialResolution
      });

    authorization.bindings
      .materialResolutionFingerprint =
        "f".repeat(64);

    resign(
      authorization,
      signer.privateKey
    );

    assert.throws(
      () =>
        verifyAutonomousRepairExecutionAuthorizationV2BindingAgainstTrustedKeyRecord({
          authorization,
          executionRequest,
          targetVerification,
          materialResolution,
          trustedKeyRecord:
            signer.trustedKeyRecord,
          now:
            "2026-09-16T13:11:00.000Z"
        }),
      /artifact_binding_mismatch/
    );
  }
);

test(
  "signed repair class drift fails even when V2 cryptographic validation succeeds",
  () => {
    const materialResolution =
      ordinaryMaterialResolution();

    const {
      targetVerification,
      executionRequest
    } =
      requestFromMaterial(
        materialResolution
      );

    const {
      authorization,
      signer
    } =
      authorizationFor({
        executionRequest,
        materialResolution
      });

    authorization.operationScope[0]
      .repairClass =
        "REBUILD_HISTORY_ELIGIBLE_ROW";

    authorization.repairClassScope = [
      "REBUILD_HISTORY_ELIGIBLE_ROW"
    ];

    resign(
      authorization,
      signer.privateKey
    );

    assert.throws(
      () =>
        verifyAutonomousRepairExecutionAuthorizationV2BindingAgainstTrustedKeyRecord({
          authorization,
          executionRequest,
          targetVerification,
          materialResolution,
          trustedKeyRecord:
            signer.trustedKeyRecord,
          now:
            "2026-09-16T13:11:00.000Z"
        }),
      /exact_operation_binding_mismatch/
    );
  }
);

test(
  "authorization cannot carry repair-class authority beyond the exact material target scope",
  () => {
    const materialResolution =
      ordinaryMaterialResolution();

    const {
      targetVerification,
      executionRequest
    } =
      requestFromMaterial(
        materialResolution
      );

    const {
      authorization,
      signer
    } =
      authorizationFor({
        executionRequest,
        materialResolution,
        extraRepairClass:
          "REBUILD_HISTORY_ELIGIBLE_ROW"
      });

    assert.throws(
      () =>
        verifyAutonomousRepairExecutionAuthorizationV2BindingAgainstTrustedKeyRecord({
          authorization,
          executionRequest,
          targetVerification,
          materialResolution,
          trustedKeyRecord:
            signer.trustedKeyRecord,
          now:
            "2026-09-16T13:11:00.000Z"
        }),
      /exact_repair_class_scope_mismatch/
    );
  }
);

test(
  "material resolution with extra target cannot authorize a request subset",
  () => {
    const materialResolution =
      ordinaryMaterialResolution({
        twoTargets:
          true
      });

    const {
      targetVerification,
      executionRequest
    } =
      requestFromMaterial(
        materialResolution,
        {
          limitTargets:
            1
        }
      );

    const {
      authorization
    } =
      authorizationFor({
        executionRequest,
        materialResolution
      });

    assert.throws(
      () =>
        validateAutonomousRepairExecutionAuthorizationV2Binding({
          authorization,
          executionRequest,
          targetVerification,
          materialResolution
        }),
      /exact_target_set_mismatch/
    );
  }
);

test(
  "target verification state cannot drift from the material preimage state",
  () => {
    const materialResolution =
      ordinaryMaterialResolution();

    const {
      targetVerification,
      executionRequest
    } =
      requestFromMaterial(
        materialResolution,
        {
          forceExists:
            true
        }
      );

    const {
      authorization
    } =
      authorizationFor({
        executionRequest,
        materialResolution
      });

    assert.throws(
      () =>
        validateAutonomousRepairExecutionAuthorizationV2Binding({
          authorization,
          executionRequest,
          targetVerification,
          materialResolution
        }),
      /exact_operation_binding_mismatch/
    );
  }
);

test(
  "signed authorization for another valid request fails exact request binding",
  () => {
    const firstMaterial =
      ordinaryMaterialResolution();

    const first =
      requestFromMaterial(
        firstMaterial
      );

    const {
      authorization,
      signer
    } =
      authorizationFor({
        executionRequest:
          first.executionRequest,
        materialResolution:
          firstMaterial
      });

    const secondMaterial =
      ordinaryMaterialResolution({
        twoTargets:
          true
      });

    const second =
      requestFromMaterial(
        secondMaterial
      );

    assert.throws(
      () =>
        verifyAutonomousRepairExecutionAuthorizationV2BindingAgainstTrustedKeyRecord({
          authorization,
          executionRequest:
            second.executionRequest,
          targetVerification:
            second.targetVerification,
          materialResolution:
            secondMaterial,
          trustedKeyRecord:
            signer.trustedKeyRecord,
          now:
            "2026-09-16T13:11:00.000Z"
        }),
      /artifact_binding_mismatch/
    );
  }
);

test(
  "denied V2 authorization can never satisfy execution binding",
  () => {
    const materialResolution =
      ordinaryMaterialResolution();

    const {
      targetVerification,
      executionRequest
    } =
      requestFromMaterial(
        materialResolution
      );

    const {
      authorization,
      signer
    } =
      authorizationFor({
        executionRequest,
        materialResolution,
        state:
          "DENIED"
      });

    assert.throws(
      () =>
        verifyAutonomousRepairExecutionAuthorizationV2BindingAgainstTrustedKeyRecord({
          authorization,
          executionRequest,
          targetVerification,
          materialResolution,
          trustedKeyRecord:
            signer.trustedKeyRecord,
          now:
            "2026-09-16T13:11:00.000Z"
        }),
      /artifact_binding_mismatch/
    );
  }
);

test(
  "production pinned-trust binding fails closed while the trusted registry is empty",
  () => {
    const materialResolution =
      ordinaryMaterialResolution();

    const {
      targetVerification,
      executionRequest
    } =
      requestFromMaterial(
        materialResolution
      );

    const {
      authorization
    } =
      authorizationFor({
        executionRequest,
        materialResolution
      });

    assert.throws(
      () =>
        verifyAutonomousRepairExecutionAuthorizationV2BindingWithPinnedTrust({
          authorization,
          executionRequest,
          targetVerification,
          materialResolution,
          now:
            "2026-09-16T13:11:00.000Z"
        }),
      /trusted_key_not_found/
    );
  }
);

test(
  "tampered source-bound resolution fingerprint is rejected before authorization binding",
  () => {
    const materialResolution =
      ordinaryMaterialResolution();

    const {
      targetVerification,
      executionRequest
    } =
      requestFromMaterial(
        materialResolution
      );

    const {
      authorization
    } =
      authorizationFor({
        executionRequest,
        materialResolution
      });

    materialResolution.resolutionFingerprint =
      "f".repeat(64);

    assert.throws(
      () =>
        validateAutonomousRepairExecutionAuthorizationV2Binding({
          authorization,
          executionRequest,
          targetVerification,
          materialResolution
        }),
      /source_bound_material_resolution_fingerprint_mismatch/
    );
  }
);

test(
  "binding core has no filesystem signer key generation or replay consumption implementation",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "./autonomous-repair-execution-authorization-v2-binding.js",
          import.meta.url
        ),
        "utf8"
      );

    assert.equal(
      source.includes(
        'from "node:fs"'
      ),
      false
    );

    for (
      const forbidden of [
        "writeFileSync(",
        "writeFile(",
        "appendFileSync(",
        "renameSync(",
        "unlinkSync(",
        "rmSync(",
        "mkdirSync(",
        "copyFileSync(",
        "createWriteStream(",
        "generateKeyPairSync(",
        "consumeOnceAtomically("
      ]
    ) {
      assert.equal(
        source.includes(
          forbidden
        ),
        false,
        forbidden
      );
    }
  }
);
