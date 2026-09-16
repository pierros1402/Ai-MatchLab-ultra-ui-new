import fs from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import {
  createHash
} from "node:crypto";
import {
  fileURLToPath
} from "node:url";

import {
  AUTONOMOUS_REPAIR_MATERIAL_PRODUCER_POLICY,
  AUTONOMOUS_REPAIR_SOURCE_BOUND_MATERIAL_STATE,
  autonomousRepairProducerContractForClass,
  buildAutonomousRepairSourceBoundMaterialResolution,
  validateAutonomousRepairSourceBoundMaterialResolution
} from "./autonomous-repair-source-bound-material-resolver.js";

import {
  computeDeploySnapshotManifestHash
} from "./deploy-snapshot-release-contract.js";

import {
  buildAutonomousRepairPublicationCoupledMaterialBundle
} from "./autonomous-repair-publication-coupled-materializer.js";

const S =
  AUTONOMOUS_REPAIR_SOURCE_BOUND_MATERIAL_STATE;

function sha256(
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

function id(
  token = "1"
) {
  return `arpd_v1_${token.repeat(24)}`;
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
      id(
        token
      ),

    repairClass,

    diagnosis: {
      canonicalId
    }
  };
}

function canonicalBytes(
  value
) {
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
  count = 1
) {
  return Array.from(
    {
      length:
        count
    },
    (
      _,
      index
    ) => {
      const raw =
        Buffer.from(
          `source-${index}`
        );

      return {
        ref:
          `evidence/source-${index}.json`,

        sha256:
          sha256(
            raw
          ),

        bytes:
          raw.length
      };
    }
  );
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
  payload =
    finalPayload(),
  producer =
    autonomousRepairProducerContractForClass(
      "ACQUIRE_VERIFIED_FINAL_EVIDENCE"
    ),
  targetPath =
    "data/final-results/2026-09-16/cid_test_home_away_20260916.json",
  raw = null
} = {}) {
  const buffer =
    raw ??
    canonicalBytes(
      payload
    );

  return {
    targetPath,

    producer,

    producerProof: {
      builder:
        "buildVerifiedFinalResult"
    },

    sourceRefs:
      sourceRefs(
        1
      ),

    contentBase64:
      buffer.toString(
        "base64"
      )
  };
}

function historyDocument() {
  return {
    schema:
      "ai-matchlab.history.v1",

    days: [
      {
        dayKey:
          "2026-09-16",

        matchCount:
          1,

        rows: [
          {
            id:
              "cid_history_test"
          }
        ]
      }
    ]
  };
}

function historyMaterialization({
  document =
    historyDocument(),
  targetPath =
    "data/history/2025-2026.json",
  producer =
    autonomousRepairProducerContractForClass(
      "REBUILD_HISTORY_ELIGIBLE_ROW"
    ),
  auditOverride = {},
  outputSha256 = null,
  raw = null
} = {}) {
  const buffer =
    raw ??
    canonicalBytes(
      document
    );

  return {
    targetPath,

    producer,

    producerProof: {
      builder:
        "buildAuthoritativeHistoryResolutionExecution",

      outputSha256:
        outputSha256 ??
        sha256(
          buffer
        ),

      summary: {
        resolutionActionsValidated:
          1
      },

      projectedAudit: {
        invalidRows:
          0,

        duplicateIds:
          0,

        operationalDayMismatches:
          0,

        semanticDuplicateGroups:
          0,

        scoreConflictGroups:
          0,

        flippedOrientationGroups:
          0,

        ...auditOverride
      }
    },

    sourceRefs:
      sourceRefs(
        4
      ),

    contentBase64:
      buffer.toString(
        "base64"
      )
  };
}

test(
  "producer policy is pinned to captured normalized source digests",
  () => {
    assert.equal(
      AUTONOMOUS_REPAIR_MATERIAL_PRODUCER_POLICY
        .ACQUIRE_VERIFIED_FINAL_EVIDENCE
        .normalizedSourceSha256,
      "2924b89608a34c41cd656039997ad8bc74b5e21032a226e36daae6b97896882a"
    );

    assert.equal(
      AUTONOMOUS_REPAIR_MATERIAL_PRODUCER_POLICY
        .REBUILD_HISTORY_ELIGIBLE_ROW
        .normalizedSourceSha256,
      "0d5ee681ab7b60bad5e351606e0e816f471cc0ea3c383e94204bffc589b70094"
    );

    assert.equal(
      AUTONOMOUS_REPAIR_MATERIAL_PRODUCER_POLICY
        .REBUILD_PUBLICATION_CANONICAL_ROW
        .supported,
      true
    );

    assert.equal(
      AUTONOMOUS_REPAIR_MATERIAL_PRODUCER_POLICY
        .REBUILD_PUBLICATION_CANONICAL_ROW
        .normalizedSourceSha256,
      "effb5639d48bd08e88a57f1baa69e5cc290cf14b1b9fcf54fa4c1ce5b9306f2a"
    );
  }
);

test(
  "no repair candidates produce deterministic read-only NO_CANDIDATES",
  () => {
    const artifact =
      buildAutonomousRepairSourceBoundMaterialResolution({
        policy:
          policy(),
        generatedAt:
          "2026-09-16T10:00:00.000Z"
      });

    assert.equal(
      artifact.state,
      S.NO_CANDIDATES
    );

    assert.equal(
      artifact.materialCatalog,
      null
    );

    assert.deepEqual(
      artifact.targetsByDecisionId,
      {}
    );

    assert.equal(
      validateAutonomousRepairSourceBoundMaterialResolution(
        artifact
      ),
      true
    );
  }
);

test(
  "verified-final candidate resolves canonical bytes to one plan-native target array",
  () => {
    const row =
      candidate();

    const artifact =
      buildAutonomousRepairSourceBoundMaterialResolution({
        policy:
          policy({
            candidates: [
              row
            ]
          }),

        materializationsByDecisionId: {
          [row.policyDecisionId]:
            finalMaterialization()
        },

        targetStatesByDecisionId: {
          [row.policyDecisionId]: {
            targetExists:
              false,

            currentSha256:
              null
          }
        },

        generatedAt:
          "2026-09-16T10:00:00.000Z"
      });

    assert.equal(
      artifact.state,
      S.RESOLVED
    );

    assert.equal(
      artifact.materialCatalog
        .materials
        .length,
      1
    );

    assert.equal(
      artifact.targetsByDecisionId[
        row.policyDecisionId
      ].length,
      1
    );

    assert.equal(
      artifact.targetsByDecisionId[
        row.policyDecisionId
      ][0].targetPath,
      "data/final-results/2026-09-16/cid_test_home_away_20260916.json"
    );

    assert.equal(
      validateAutonomousRepairSourceBoundMaterialResolution(
        artifact
      ),
      true
    );
  }
);

test(
  "verified-final wrong schema is blocked fail closed",
  () => {
    const row =
      candidate();

    const payload =
      finalPayload();

    payload.schema =
      "wrong";

    const artifact =
      buildAutonomousRepairSourceBoundMaterialResolution({
        policy:
          policy({
            candidates: [
              row
            ]
          }),

        materializationsByDecisionId: {
          [row.policyDecisionId]:
            finalMaterialization({
              payload
            })
        },

        targetStatesByDecisionId: {
          [row.policyDecisionId]: {
            targetExists:
              false,

            currentSha256:
              null
          }
        }
      });

    assert.equal(
      artifact.state,
      S.BLOCKED
    );

    assert.equal(
      artifact.blockers[0].code,
      "VERIFIED_FINAL_PAYLOAD_SEMANTICS_INVALID"
    );
  }
);

test(
  "verified-final day or canonical identity drift is blocked",
  () => {
    const row =
      candidate();

    const payload =
      finalPayload();

    payload.dayKey =
      "2026-09-15";

    const artifact =
      buildAutonomousRepairSourceBoundMaterialResolution({
        policy:
          policy({
            candidates: [
              row
            ]
          }),

        materializationsByDecisionId: {
          [row.policyDecisionId]:
            finalMaterialization({
              payload
            })
        },

        targetStatesByDecisionId: {
          [row.policyDecisionId]: {
            targetExists:
              false,

            currentSha256:
              null
          }
        }
      });

    assert.equal(
      artifact.state,
      S.BLOCKED
    );
  }
);

test(
  "verified-final producer source digest mismatch is blocked",
  () => {
    const row =
      candidate();

    const producer =
      autonomousRepairProducerContractForClass(
        "ACQUIRE_VERIFIED_FINAL_EVIDENCE"
      );

    producer.normalizedSourceSha256 =
      "f".repeat(64);

    const artifact =
      buildAutonomousRepairSourceBoundMaterialResolution({
        policy:
          policy({
            candidates: [
              row
            ]
          }),

        materializationsByDecisionId: {
          [row.policyDecisionId]:
            finalMaterialization({
              producer
            })
        },

        targetStatesByDecisionId: {
          [row.policyDecisionId]: {
            targetExists:
              false,

            currentSha256:
              null
          }
        }
      });

    assert.equal(
      artifact.blockers[0].code,
      "VERIFIED_FINAL_PRODUCER_CONTRACT_MISMATCH"
    );
  }
);

test(
  "noncanonical verified-final JSON bytes are blocked",
  () => {
    const row =
      candidate();

    const raw =
      Buffer.from(
        JSON.stringify(
          finalPayload()
        ),
        "utf8"
      );

    const artifact =
      buildAutonomousRepairSourceBoundMaterialResolution({
        policy:
          policy({
            candidates: [
              row
            ]
          }),

        materializationsByDecisionId: {
          [row.policyDecisionId]:
            finalMaterialization({
              raw
            })
        },

        targetStatesByDecisionId: {
          [row.policyDecisionId]: {
            targetExists:
              false,

            currentSha256:
              null
          }
        }
      });

    assert.equal(
      artifact.blockers[0].code,
      "MATERIAL_JSON_NOT_CANONICAL_PRETTY_BYTES"
    );
  }
);

test(
  "canonical history candidate resolves exact executor output and preimage",
  () => {
    const row =
      candidate({
        repairClass:
          "REBUILD_HISTORY_ELIGIBLE_ROW"
      });

    const artifact =
      buildAutonomousRepairSourceBoundMaterialResolution({
        policy:
          policy({
            candidates: [
              row
            ]
          }),

        materializationsByDecisionId: {
          [row.policyDecisionId]:
            historyMaterialization()
        },

        targetStatesByDecisionId: {
          [row.policyDecisionId]: {
            targetExists:
              true,

            currentSha256:
              "c".repeat(64)
          }
        }
      });

    assert.equal(
      artifact.state,
      S.RESOLVED
    );

    assert.equal(
      artifact.targetsByDecisionId[
        row.policyDecisionId
      ][0].targetExists,
      true
    );

    assert.equal(
      artifact.resolutions[0]
        .producerProofBuilder,
      "buildAuthoritativeHistoryResolutionExecution"
    );

    assert.equal(
      validateAutonomousRepairSourceBoundMaterialResolution(
        artifact
      ),
      true
    );
  }
);

test(
  "history output hash proof mismatch is blocked",
  () => {
    const row =
      candidate({
        repairClass:
          "REBUILD_HISTORY_ELIGIBLE_ROW"
      });

    const artifact =
      buildAutonomousRepairSourceBoundMaterialResolution({
        policy:
          policy({
            candidates: [
              row
            ]
          }),

        materializationsByDecisionId: {
          [row.policyDecisionId]:
            historyMaterialization({
              outputSha256:
                "d".repeat(64)
            })
        },

        targetStatesByDecisionId: {
          [row.policyDecisionId]: {
            targetExists:
              true,

            currentSha256:
              "c".repeat(64)
          }
        }
      });

    assert.equal(
      artifact.blockers[0].code,
      "HISTORY_OUTPUT_SHA256_PROOF_MISMATCH"
    );
  }
);

test(
  "history projected audit must be clean",
  () => {
    const row =
      candidate({
        repairClass:
          "REBUILD_HISTORY_ELIGIBLE_ROW"
      });

    const artifact =
      buildAutonomousRepairSourceBoundMaterialResolution({
        policy:
          policy({
            candidates: [
              row
            ]
          }),

        materializationsByDecisionId: {
          [row.policyDecisionId]:
            historyMaterialization({
              auditOverride: {
                scoreConflictGroups:
                  1
              }
            })
        },

        targetStatesByDecisionId: {
          [row.policyDecisionId]: {
            targetExists:
              true,

            currentSha256:
              "c".repeat(64)
          }
        }
      });

    assert.equal(
      artifact.blockers[0].code,
      "HISTORY_PROJECTED_AUDIT_NOT_CLEAN"
    );
  }
);

test(
  "history canonical file must have an exact existing preimage",
  () => {
    const row =
      candidate({
        repairClass:
          "REBUILD_HISTORY_ELIGIBLE_ROW"
      });

    const artifact =
      buildAutonomousRepairSourceBoundMaterialResolution({
        policy:
          policy({
            candidates: [
              row
            ]
          }),

        materializationsByDecisionId: {
          [row.policyDecisionId]:
            historyMaterialization()
        },

        targetStatesByDecisionId: {
          [row.policyDecisionId]: {
            targetExists:
              false,

            currentSha256:
              null
          }
        }
      });

    assert.equal(
      artifact.blockers[0].code,
      "HISTORY_PREIMAGE_REQUIRED"
    );
  }
);

test(
  "publication repair remains blocked when coupled release materialization is missing",
  () => {
    const row =
      candidate({
        repairClass:
          "REBUILD_PUBLICATION_CANONICAL_ROW"
      });

    const artifact =
      buildAutonomousRepairSourceBoundMaterialResolution({
        policy:
          policy({
            candidates: [
              row
            ]
          })
      });

    assert.equal(
      artifact.state,
      S.BLOCKED
    );

    assert.equal(
      artifact.blockers[0].code,
      "MATERIALIZATION_MISSING"
    );

    assert.equal(
      artifact.materialCatalog,
      null
    );
  }
);

test(
  "unexpected materialization or target-state entries block instead of expanding scope",
  () => {
    const artifact =
      buildAutonomousRepairSourceBoundMaterialResolution({
        policy:
          policy(),

        materializationsByDecisionId: {
          [id("9")]:
            finalMaterialization()
        },

        targetStatesByDecisionId: {
          [id("8")]: {
            targetExists:
              false,

            currentSha256:
              null
          }
        }
      });

    assert.equal(
      artifact.state,
      S.BLOCKED
    );

    assert.deepEqual(
      artifact.blockers.map(
        row =>
          row.code
      ),
      [
        "UNEXPECTED_MATERIALIZATION_ENTRY",
        "UNEXPECTED_TARGET_STATE_ENTRY"
      ]
    );
  }
);

test(
  "one blocked candidate prevents partial material catalog publication",
  () => {
    const finalRow =
      candidate({
        token:
          "1"
      });

    const publicationRow =
      candidate({
        token:
          "2",

        repairClass:
          "REBUILD_PUBLICATION_CANONICAL_ROW",

        canonicalId:
          "cid_publication_test"
      });

    const artifact =
      buildAutonomousRepairSourceBoundMaterialResolution({
        policy:
          policy({
            candidates: [
              finalRow,
              publicationRow
            ]
          }),

        materializationsByDecisionId: {
          [finalRow.policyDecisionId]:
            finalMaterialization()
        },

        targetStatesByDecisionId: {
          [finalRow.policyDecisionId]: {
            targetExists:
              false,

            currentSha256:
              null
          }
        }
      });

    assert.equal(
      artifact.state,
      S.BLOCKED
    );

    assert.equal(
      artifact.materialCatalog,
      null
    );

    assert.deepEqual(
      artifact.targetsByDecisionId,
      {}
    );

    assert.equal(
      artifact.resolutions.length,
      0
    );
  }
);

test(
  "resolution fingerprint ignores generatedAt-only churn and validator catches tampering",
  () => {
    const row =
      candidate();

    const args = {
      policy:
        policy({
          candidates: [
            row
          ]
        }),

      materializationsByDecisionId: {
        [row.policyDecisionId]:
          finalMaterialization()
      },

      targetStatesByDecisionId: {
        [row.policyDecisionId]: {
          targetExists:
            false,

          currentSha256:
            null
        }
      }
    };

    const first =
      buildAutonomousRepairSourceBoundMaterialResolution({
        ...args,

        generatedAt:
          "2026-09-16T10:00:00.000Z"
      });

    const second =
      buildAutonomousRepairSourceBoundMaterialResolution({
        ...args,

        generatedAt:
          "2026-09-16T11:00:00.000Z"
      });

    assert.equal(
      first.resolutionFingerprint,
      second.resolutionFingerprint
    );

    second.targetsByDecisionId[
      row.policyDecisionId
    ][0].plannedContentBytes +=
      1;

    assert.throws(
      () =>
        validateAutonomousRepairSourceBoundMaterialResolution(
          second
        ),
      /resolution_binding_mismatch|resolution_fingerprint_mismatch/u
    );

    const corePath =
      fileURLToPath(
        new URL(
          "./autonomous-repair-source-bound-material-resolver.js",
          import.meta.url
        )
      );

    const source =
      fs.readFileSync(
        corePath,
        "utf8"
      );

    for (
      const forbidden of [
        'from "node:fs"',
        "writeFileSync(",
        "renameSync(",
        "unlinkSync(",
        "rmSync(",
        "mkdirSync(",
        "copyFileSync("
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


const PUBLICATION_ID =
  "cid_test_home_away_20260916";

function publicationPrettyBytes(
  value
) {
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
    resolveEvidenceFixtureId(
      value
    ) {
      const text =
        String(
          value ?? ""
        ).trim();

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
        "0".repeat(
          64
        ),

      "value.json":
        "1".repeat(
          64
        )
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

function publicationBundle({
  detailInventoryPaths = [
    `data/deploy-snapshots/2026-09-16/details/${PUBLICATION_ID}.json`
  ]
} = {}) {
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

    detailInventoryPaths,

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

function publicationTargetState(
  bundle
) {
  const byTargetPath =
    {};

  for (
    const row of
      bundle.mutations
  ) {
    byTargetPath[
      row.targetPath
    ] = {
      targetExists:
        true,

      currentSha256:
        row.targetPath ===
          bundle.manifest.targetPath
          ? bundle.sourceManifest.contentSha256
          : "e".repeat(
              64
            )
    };
  }

  for (
    const row of
      bundle.immutableBindings
  ) {
    byTargetPath[
      row.targetPath
    ] = {
      targetExists:
        true,

      currentSha256:
        row.contentSha256
    };
  }

  return {
    byTargetPath
  };
}

test(
  "publication coupled bundle resolves to a multi-target plan-native target array",
  () => {
    const row =
      candidate({
        repairClass:
          "REBUILD_PUBLICATION_CANONICAL_ROW",

        canonicalId:
          PUBLICATION_ID
      });

    const bundle =
      publicationBundle();

    const artifact =
      buildAutonomousRepairSourceBoundMaterialResolution({
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
          [row.policyDecisionId]:
            publicationTargetState(
              bundle
            )
        },

        generatedAt:
          "2026-09-16T12:05:00.000Z"
      });

    assert.equal(
      artifact.state,
      S.RESOLVED
    );

    assert.equal(
      artifact.materialCatalog
        .materials
        .length,
      1
    );

    assert.equal(
      artifact.materialCatalog
        .materials[0]
        .targetPath,
      bundle.manifest.targetPath
    );

    assert.equal(
      artifact.targetsByDecisionId[
        row.policyDecisionId
      ].length,
      bundle.mutations.length
    );

    assert.deepEqual(
      artifact.targetsByDecisionId[
        row.policyDecisionId
      ].map(
        target =>
          target.targetPath
      ),
      bundle.mutations.map(
        mutation =>
          mutation.targetPath
      )
    );

    assert.equal(
      artifact.resolutions[0]
        .publicationBundleFingerprint,
      bundle.bundleFingerprint
    );

    assert.equal(
      artifact.resolutions[0]
        .publicationTargetCount,
      bundle.mutations.length
    );

    assert.deepEqual(
      artifact.resolutions[0]
        .publicationBundle,
      bundle
    );

    assert.equal(
      artifact.authority
        .filesystemWriteAuthorized,
      false
    );

    assert.equal(
      validateAutonomousRepairSourceBoundMaterialResolution(
        artifact
      ),
      true
    );
  }
);

test(
  "publication resolver fails closed when the exact coupled target-state set is incomplete",
  () => {
    const row =
      candidate({
        repairClass:
          "REBUILD_PUBLICATION_CANONICAL_ROW",

        canonicalId:
          PUBLICATION_ID
      });

    const bundle =
      publicationBundle();

    const state =
      publicationTargetState(
        bundle
      );

    delete state.byTargetPath[
      bundle.mutations[0].targetPath
    ];

    const artifact =
      buildAutonomousRepairSourceBoundMaterialResolution({
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
          [row.policyDecisionId]:
            state
        }
      });

    assert.equal(
      artifact.state,
      S.BLOCKED
    );

    assert.equal(
      artifact.blockers[0].code,
      "PUBLICATION_TARGET_STATE_SET_MISMATCH"
    );

    assert.equal(
      artifact.materialCatalog,
      null
    );
  }
);

test(
  "publication resolver binds frozen immutable artifacts to their exact current hashes",
  () => {
    const row =
      candidate({
        repairClass:
          "REBUILD_PUBLICATION_CANONICAL_ROW",

        canonicalId:
          PUBLICATION_ID
      });

    const bundle =
      publicationBundle();

    const state =
      publicationTargetState(
        bundle
      );

    const frozenValue =
      bundle.immutableBindings.find(
        binding =>
          binding.role ===
            "IMMUTABLE_FROZEN_VALUE"
      );

    state.byTargetPath[
      frozenValue.targetPath
    ].currentSha256 =
      "f".repeat(
        64
      );

    const artifact =
      buildAutonomousRepairSourceBoundMaterialResolution({
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
          [row.policyDecisionId]:
            state
        }
      });

    assert.equal(
      artifact.state,
      S.BLOCKED
    );

    assert.equal(
      artifact.blockers[0].code,
      "PUBLICATION_IMMUTABLE_BINDING_STATE_MISMATCH"
    );
  }
);

test(
  "publication resolver rejects coupled bundle tampering and canonical membership drift",
  () => {
    const row =
      candidate({
        repairClass:
          "REBUILD_PUBLICATION_CANONICAL_ROW",

        canonicalId:
          PUBLICATION_ID
      });

    const bundle =
      publicationBundle();

    const tampered =
      structuredClone(
        bundle
      );

    tampered.mutations[0]
      .contentBytes +=
        1;

    const tamperedArtifact =
      buildAutonomousRepairSourceBoundMaterialResolution({
        policy:
          policy({
            candidates: [
              row
            ]
          }),

        materializationsByDecisionId: {
          [row.policyDecisionId]:
            tampered
        },

        targetStatesByDecisionId: {
          [row.policyDecisionId]:
            publicationTargetState(
              bundle
            )
        }
      });

    assert.equal(
      tamperedArtifact.state,
      S.BLOCKED
    );

    assert.equal(
      tamperedArtifact.blockers[0].code,
      "PUBLICATION_COUPLED_BUNDLE_INVALID"
    );

    const wrongCandidate =
      candidate({
        token:
          "7",

        repairClass:
          "REBUILD_PUBLICATION_CANONICAL_ROW",

        canonicalId:
          "cid_not_in_publication_bundle_20260916"
      });

    const membershipArtifact =
      buildAutonomousRepairSourceBoundMaterialResolution({
        policy:
          policy({
            candidates: [
              wrongCandidate
            ]
          }),

        materializationsByDecisionId: {
          [wrongCandidate.policyDecisionId]:
            bundle
        },

        targetStatesByDecisionId: {
          [wrongCandidate.policyDecisionId]:
            publicationTargetState(
              bundle
            )
        }
      });

    assert.equal(
      membershipArtifact.state,
      S.BLOCKED
    );

    assert.equal(
      membershipArtifact.blockers[0].code,
      "PUBLICATION_COUPLED_FIXTURE_MEMBERSHIP_MISSING"
    );
  }
);

test(
  "publication resolver validator rejects multi-target binding tampering",
  () => {
    const row =
      candidate({
        repairClass:
          "REBUILD_PUBLICATION_CANONICAL_ROW",

        canonicalId:
          PUBLICATION_ID
      });

    const bundle =
      publicationBundle();

    const artifact =
      buildAutonomousRepairSourceBoundMaterialResolution({
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
          [row.policyDecisionId]:
            publicationTargetState(
              bundle
            )
        }
      });

    artifact.targetsByDecisionId[
      row.policyDecisionId
    ][0].plannedContentBytes +=
      1;

    assert.throws(
      () =>
        validateAutonomousRepairSourceBoundMaterialResolution(
          artifact
        ),
      /publication_target_binding_mismatch|resolution_fingerprint_mismatch/u
    );
  }
);

test(
  "publication resolver fails closed when the coupled bundle requires a delete unsupported by Plan V1",
  () => {
    const row =
      candidate({
        repairClass:
          "REBUILD_PUBLICATION_CANONICAL_ROW",

        canonicalId:
          PUBLICATION_ID
      });

    const orphanId =
      "cid_orphan_publication_20260916";

    const bundle =
      publicationBundle({
        detailInventoryPaths: [
          `data/deploy-snapshots/2026-09-16/details/${PUBLICATION_ID}.json`,
          `data/deploy-snapshots/2026-09-16/details/${orphanId}.json`
        ]
      });

    assert.equal(
      bundle.mutations.some(
        mutation =>
          mutation.action ===
            "delete"
      ),
      true
    );

    const artifact =
      buildAutonomousRepairSourceBoundMaterialResolution({
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
          [row.policyDecisionId]:
            publicationTargetState(
              bundle
            )
        }
      });

    assert.equal(
      artifact.state,
      S.BLOCKED
    );

    assert.equal(
      artifact.blockers[0].code,
      "PUBLICATION_DELETE_TARGET_UNSUPPORTED_BY_PLAN_V1"
    );

    assert.equal(
      artifact.materialCatalog,
      null
    );
  }
);

test(
  "publication multi-target descriptors remain Plan V1 write-descriptor compatible",
  () => {
    const row =
      candidate({
        repairClass:
          "REBUILD_PUBLICATION_CANONICAL_ROW",

        canonicalId:
          PUBLICATION_ID
      });

    const bundle =
      publicationBundle();

    const artifact =
      buildAutonomousRepairSourceBoundMaterialResolution({
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
          [row.policyDecisionId]:
            publicationTargetState(
              bundle
            )
        }
      });

    const targets =
      artifact.targetsByDecisionId[
        row.policyDecisionId
      ];

    assert.equal(
      targets.length >
        1,
      true
    );

    for (
      const target of
        targets
    ) {
      assert.equal(
        target.plannedAction,
        "write"
      );

      assert.match(
        target.plannedContentSha256,
        /^[0-9a-f]{64}$/u
      );

      assert.equal(
        Number.isSafeInteger(
          target.plannedContentBytes
        ),
        true
      );

      assert.equal(
        target.plannedContentBytes >=
          0,
        true
      );
    }
  }
);

test(
  "publication resolver binds the exact source manifest bytes to the current manifest preimage",
  () => {
    const row =
      candidate({
        repairClass:
          "REBUILD_PUBLICATION_CANONICAL_ROW",

        canonicalId:
          PUBLICATION_ID
      });

    const bundle =
      publicationBundle();

    const state =
      publicationTargetState(
        bundle
      );

    state.byTargetPath[
      bundle.manifest.targetPath
    ].currentSha256 =
      "d".repeat(
        64
      );

    const artifact =
      buildAutonomousRepairSourceBoundMaterialResolution({
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
          [row.policyDecisionId]:
            state
        }
      });

    assert.equal(
      artifact.state,
      S.BLOCKED
    );

    assert.equal(
      artifact.blockers[0].code,
      "PUBLICATION_SOURCE_MANIFEST_PREIMAGE_MISMATCH"
    );

    assert.equal(
      artifact.materialCatalog,
      null
    );
  }
);


test(
  "source-bound material resolution schema distinguishes ordinary and coupled publication resolutions",
  () => {
    const schemaPath =
      fileURLToPath(
        new URL(
          "../contracts/autonomous-repair-source-bound-material-resolution.schema.v1.json",
          import.meta.url
        )
      );

    const schema =
      JSON.parse(
        fs.readFileSync(
          schemaPath,
          "utf8"
        )
      );

    const resolutionItems =
      schema?.properties
        ?.resolutions
        ?.items;

    assert.equal(
      Array.isArray(
        resolutionItems?.oneOf
      ),
      true
    );

    assert.equal(
      resolutionItems.oneOf.length,
      2
    );

    const ordinary =
      resolutionItems.oneOf[0];

    const publication =
      resolutionItems.oneOf[1];

    assert.equal(
      ordinary.additionalProperties,
      false
    );

    assert.equal(
      ordinary.required.includes(
        "publicationBundleFingerprint"
      ),
      false
    );

    assert.equal(
      publication.additionalProperties,
      false
    );

    for (
      const field of [
        "publicationBundleFingerprint",
        "publicationTargetCount",
        "immutableBindingCount",
        "publicationBundle"
      ]
    ) {
      assert.equal(
        publication.required.includes(
          field
        ),
        true
      );
    }

    assert.deepEqual(
      publication.properties
        .publicationBundleFingerprint,
      {
        type:
          "string",
        pattern:
          "^[0-9a-f]{64}$"
      }
    );

    assert.deepEqual(
      publication.properties
        .publicationTargetCount,
      {
        type:
          "integer",
        minimum:
          1
      }
    );

    assert.deepEqual(
      publication.properties
        .immutableBindingCount,
      {
        type:
          "integer",
        minimum:
          1
      }
    );

    assert.deepEqual(
      publication.properties
        .publicationBundle,
      {
        type:
          "object"
      }
    );

    assert.deepEqual(
      schema?.properties
        ?.targetsByDecisionId,
      {
        type:
          "object"
      }
    );
  }
);
