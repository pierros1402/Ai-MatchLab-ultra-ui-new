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


import {
  AUTONOMOUS_REPAIR_EXECUTION_TRANSACTION_PLAN_SCHEMA,
  AUTONOMOUS_REPAIR_EXECUTION_TRANSACTION_PLAN_VERSION,
  autonomousRepairExecutionTransactionPlanFingerprint,
  buildAutonomousRepairExecutionTransactionPlan,
  resolveAutonomousRepairExecutionTransactionPostimageBuffer,
  validateAutonomousRepairExecutionTransactionPlanArtifact
} from "./autonomous-repair-execution-transaction-plan.js";

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


function ordinaryReplaceMaterialResolution() {
  const row =
    candidate({
      token:
        "8",
      canonicalId:
        "cid_test_replace_match_20260916"
    });

  return buildAutonomousRepairSourceBoundMaterialResolution({
    policy:
      policy({
        candidates: [
          row
        ]
      }),
    materializationsByDecisionId: {
      [row.policyDecisionId]:
        finalMaterialization({
          canonicalId:
            row.diagnosis.canonicalId,
          token:
            "8"
        })
    },
    targetStatesByDecisionId: {
      [row.policyDecisionId]: {
        targetExists:
          true,
        currentSha256:
          "e".repeat(64)
      }
    },
    generatedAt:
      "2026-09-16T12:05:00.000Z"
  });
}

function buildPlanFor(
  materialResolution
) {
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

  return {
    authorization,
    executionRequest,
    targetVerification,
    materialResolution,
    transactionPlan:
      buildAutonomousRepairExecutionTransactionPlan({
        authorization,
        executionRequest,
        targetVerification,
        materialResolution,
        generatedAt:
          "2026-09-16T13:12:00.000Z"
      })
  };
}

test(
  "transaction plan derives ordinary CREATE postimage only from validated target material",
  () => {
    const built =
      buildPlanFor(
        ordinaryMaterialResolution()
      );

    const plan =
      built.transactionPlan;

    assert.equal(
      plan.schema,
      AUTONOMOUS_REPAIR_EXECUTION_TRANSACTION_PLAN_SCHEMA
    );

    assert.equal(
      plan.version,
      AUTONOMOUS_REPAIR_EXECUTION_TRANSACTION_PLAN_VERSION
    );

    assert.equal(
      plan.summary.operationCount,
      1
    );

    assert.equal(
      plan.summary.createCount,
      1
    );

    assert.equal(
      plan.summary.replaceCount,
      0
    );

    const operation =
      plan.operations[0];

    assert.equal(
      operation.mutationMode,
      "CREATE"
    );

    assert.equal(
      operation.postimage.sourceKind,
      "TARGET_MATERIAL"
    );

    assert.equal(
      operation.rollback.strategy,
      "DELETE_CREATED_TARGET"
    );

    assert.equal(
      Object.hasOwn(
        operation.postimage,
        "contentBase64"
      ),
      false
    );

    const material =
      built
        .materialResolution
        .materialCatalog
        .materials[0];

    assert.equal(
      operation.postimage.contentSha256,
      material.contentSha256
    );

    assert.equal(
      operation.postimage.contentBytes,
      material.contentBytes
    );
  }
);

test(
  "transaction plan derives ordinary REPLACE preimage and rollback strategy exactly",
  () => {
    const built =
      buildPlanFor(
        ordinaryReplaceMaterialResolution()
      );

    const operation =
      built
        .transactionPlan
        .operations[0];

    assert.equal(
      operation.mutationMode,
      "REPLACE"
    );

    assert.equal(
      operation.preimage.targetExists,
      true
    );

    assert.equal(
      operation.preimage.sha256,
      "e".repeat(64)
    );

    assert.equal(
      operation.preimage.bytes,
      1
    );

    assert.equal(
      operation.rollback.strategy,
      "RESTORE_PREIMAGE"
    );
  }
);

test(
  "ordinary postimage buffer is re-resolved from bound material and matches planned identity",
  () => {
    const built =
      buildPlanFor(
        ordinaryMaterialResolution()
      );

    const operation =
      built
        .transactionPlan
        .operations[0];

    const buffer =
      resolveAutonomousRepairExecutionTransactionPostimageBuffer({
        transactionPlan:
          built.transactionPlan,
        operationId:
          operation.operationId,
        materialResolution:
          built.materialResolution
      });

    assert.equal(
      sha256Bytes(
        buffer
      ),
      operation.postimage.contentSha256
    );

    assert.equal(
      buffer.length,
      operation.postimage.contentBytes
    );

    assert.deepEqual(
      buffer,
      Buffer.from(
        built
          .materialResolution
          .materialCatalog
          .materials[0]
          .contentBase64,
        "base64"
      )
    );
  }
);

test(
  "publication transaction plan contains every mutation and excludes immutable bindings",
  () => {
    const built =
      buildPlanFor(
        publicationMaterialResolution()
      );

    const resolution =
      built
        .materialResolution
        .resolutions[0];

    const bundle =
      resolution.publicationBundle;

    const plan =
      built.transactionPlan;

    assert.equal(
      plan.operations.length,
      bundle.mutations.length
    );

    assert.equal(
      plan.summary.publicationMutationCount,
      bundle.mutations.length
    );

    const immutablePaths =
      new Set(
        bundle
          .immutableBindings
          .map(
            row =>
              row.targetPath
          )
      );

    for (
      const operation of
        plan.operations
    ) {
      assert.equal(
        operation.postimage.sourceKind,
        "PUBLICATION_MUTATION"
      );

      assert.equal(
        immutablePaths.has(
          operation.targetPath
        ),
        false
      );

      assert.equal(
        operation.repairClass,
        "REBUILD_PUBLICATION_CANONICAL_ROW"
      );
    }
  }
);

test(
  "publication postimage metadata equals the validated mutation rows exactly",
  () => {
    const built =
      buildPlanFor(
        publicationMaterialResolution()
      );

    const bundle =
      built
        .materialResolution
        .resolutions[0]
        .publicationBundle;

    const mutationByPath =
      new Map(
        bundle
          .mutations
          .map(
            row => [
              row.targetPath,
              row
            ]
          )
      );

    for (
      const operation of
        built.transactionPlan.operations
    ) {
      const mutation =
        mutationByPath.get(
          operation.targetPath
        );

      assert.ok(
        mutation
      );

      assert.equal(
        operation.postimage.contentSha256,
        mutation.contentSha256
      );

      assert.equal(
        operation.postimage.contentBytes,
        mutation.contentBytes
      );

      assert.equal(
        operation.postimage.publicationRole,
        mutation.role
      );

      assert.equal(
        operation.postimage.publicationBundleFingerprint,
        bundle.bundleFingerprint
      );
    }
  }
);

test(
  "every publication postimage buffer is resolved from the source-bound publication bundle",
  () => {
    const built =
      buildPlanFor(
        publicationMaterialResolution()
      );

    const mutationByPath =
      new Map(
        built
          .materialResolution
          .resolutions[0]
          .publicationBundle
          .mutations
          .map(
            row => [
              row.targetPath,
              row
            ]
          )
      );

    for (
      const operation of
        built.transactionPlan.operations
    ) {
      const buffer =
        resolveAutonomousRepairExecutionTransactionPostimageBuffer({
          transactionPlan:
            built.transactionPlan,
          operationId:
            operation.operationId,
          materialResolution:
            built.materialResolution
        });

      const mutation =
        mutationByPath.get(
          operation.targetPath
        );

      assert.deepEqual(
        buffer,
        Buffer.from(
          mutation.contentBase64,
          "base64"
        )
      );

      assert.equal(
        sha256Bytes(
          buffer
        ),
        operation.postimage.contentSha256
      );
    }
  }
);

test(
  "transaction operations are canonical by target path and operation id",
  () => {
    const built =
      buildPlanFor(
        publicationMaterialResolution()
      );

    const keys =
      built
        .transactionPlan
        .operations
        .map(
          row =>
            [
              row.targetPath,
              row.operationId
            ].join("\u0000")
        );

    assert.deepEqual(
      keys,
      [...keys].sort()
    );
  }
);

test(
  "transaction plan has zero write replay and workflow authority",
  () => {
    const built =
      buildPlanFor(
        ordinaryMaterialResolution()
      );

    assert.deepEqual(
      built.transactionPlan.authority,
      {
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
        replayConsumptionAuthorized:
          false,
        workflowMutationAuthorized:
          false
      }
    );
  }
);

test(
  "caller supplied replacement material is rejected by the pure planner input contract",
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
        buildAutonomousRepairExecutionTransactionPlan({
          authorization,
          executionRequest,
          targetVerification,
          materialResolution,
          generatedAt:
            "2026-09-16T13:12:00.000Z",
          replacementBytes:
            Buffer.from(
              "forbidden",
              "utf8"
            )
        }),
      /transaction_plan_input_keys_invalid/u
    );
  }
);

test(
  "tampered transaction postimage identity fails validation",
  () => {
    const built =
      buildPlanFor(
        ordinaryMaterialResolution()
      );

    const tampered =
      structuredClone(
        built.transactionPlan
      );

    tampered
      .operations[0]
      .postimage
      .contentSha256 =
        "f".repeat(64);

    tampered.transactionFingerprint =
      autonomousRepairExecutionTransactionPlanFingerprint(
        tampered
      );

    assert.throws(
      () =>
        resolveAutonomousRepairExecutionTransactionPostimageBuffer({
          transactionPlan:
            tampered,
          operationId:
            tampered.operations[0].operationId,
          materialResolution:
            built.materialResolution
        }),
      /postimage_source_mismatch/u
    );
  }
);

test(
  "transaction fingerprint excludes generatedAt but binds semantic transaction content",
  () => {
    const built =
      buildPlanFor(
        ordinaryMaterialResolution()
      );

    const changedTime =
      structuredClone(
        built.transactionPlan
      );

    changedTime.generatedAt =
      "2026-09-16T13:13:00.000Z";

    assert.equal(
      autonomousRepairExecutionTransactionPlanFingerprint(
        changedTime
      ),
      built.transactionPlan.transactionFingerprint
    );

    changedTime.operations[0].rollback.strategy =
      "RESTORE_PREIMAGE";

    assert.notEqual(
      autonomousRepairExecutionTransactionPlanFingerprint(
        changedTime
      ),
      built.transactionPlan.transactionFingerprint
    );
  }
);

test(
  "pure transaction planner module exposes no filesystem mutation or replay consumption surface",
  () => {
    const source =
      fs.readFileSync(
        new URL(
          "./autonomous-repair-execution-transaction-plan.js",
          import.meta.url
        ),
        "utf8"
      );

    for (
      const forbidden of
        [
          'from "node:fs"',
          "writeFile",
          "renameSync",
          "unlinkSync",
          "rmSync",
          "mkdirSync",
          "consumeOnceAtomically"
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

    const built =
      buildPlanFor(
        ordinaryMaterialResolution()
      );

    assert.deepEqual(
      validateAutonomousRepairExecutionTransactionPlanArtifact(
        built.transactionPlan
      ),
      {
        ok:
          true,
        operationCount:
          1,
        transactionFingerprint:
          built.transactionPlan.transactionFingerprint
      }
    );
  }
);
