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
  AUTONOMOUS_REPAIR_TARGET_MATERIAL_SCHEMA,
  buildAutonomousRepairTargetMaterialCatalog,
  deriveAutonomousRepairTargetsByDecisionId,
  materialContentBuffer,
  validateAutonomousRepairTargetMaterialCatalog
} from "./autonomous-repair-target-material.js";

function sha256(value) {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

function candidateId(
  token = "1"
) {
  return `arpd_v1_${token.repeat(24)}`;
}

function source(
  ref = "evidence/final.json",
  raw =
    Buffer.from(
      '{"source":true}\n'
    )
) {
  return {
    ref,
    sha256:
      sha256(raw),
    bytes:
      raw.length
  };
}

function material({
  id =
    candidateId("1"),
  repairClass =
    "ACQUIRE_VERIFIED_FINAL_EVIDENCE",
  canonicalId =
    "cid_test_home_away_20260916",
  targetPath =
    "data/final-results/2026-09-16/cid_test_home_away_20260916.json",
  content =
    Buffer.from(
      '{"ok":true}\n'
    ),
  sources = [
    source()
  ]
} = {}) {
  return {
    candidateDecisionId:
      id,
    repairClass,
    canonicalId,
    targetPath,
    sources,
    contentBase64:
      content.toString(
        "base64"
      )
  };
}

test(
  "catalog binds exact content bytes hash target and immutable source fingerprints",
  () => {
    const content =
      Buffer.from(
        '{"score":"2-1"}\n'
      );

    const catalog =
      buildAutonomousRepairTargetMaterialCatalog({
        dayKey:
          "2026-09-16",
        generatedAt:
          "2026-09-16T10:00:00.000Z",
        materials: [
          material({
            content
          })
        ]
      });

    assert.equal(
      catalog.schema,
      AUTONOMOUS_REPAIR_TARGET_MATERIAL_SCHEMA
    );

    assert.equal(
      catalog.materials[0]
        .contentSha256,
      sha256(content)
    );

    assert.equal(
      catalog.materials[0]
        .contentBytes,
      content.length
    );

    assert.equal(
      catalog.materials[0]
        .sources.length,
      1
    );

    assert.equal(
      validateAutonomousRepairTargetMaterialCatalog(
        catalog
      ),
      true
    );
  }
);

test(
  "catalog fingerprint ignores generatedAt-only churn",
  () => {
    const args = {
      dayKey:
        "2026-09-16",
      materials: [
        material()
      ]
    };

    const first =
      buildAutonomousRepairTargetMaterialCatalog({
        ...args,
        generatedAt:
          "2026-09-16T10:00:00.000Z"
      });

    const second =
      buildAutonomousRepairTargetMaterialCatalog({
        ...args,
        generatedAt:
          "2026-09-16T11:00:00.000Z"
      });

    assert.equal(
      first.catalogFingerprint,
      second.catalogFingerprint
    );
  }
);

test(
  "source order does not change semantic material fingerprint",
  () => {
    const a =
      source(
        "a.json",
        Buffer.from("A")
      );

    const b =
      source(
        "b.json",
        Buffer.from("B")
      );

    const first =
      buildAutonomousRepairTargetMaterialCatalog({
        dayKey:
          "2026-09-16",
        materials: [
          material({
            sources: [
              a,
              b
            ]
          })
        ]
      });

    const second =
      buildAutonomousRepairTargetMaterialCatalog({
        dayKey:
          "2026-09-16",
        materials: [
          material({
            sources: [
              b,
              a
            ]
          })
        ]
      });

    assert.equal(
      first.materials[0]
        .materialFingerprint,
      second.materials[0]
        .materialFingerprint
    );
  }
);

test(
  "duplicate candidate ids fail closed",
  () => {
    assert.throws(
      () =>
        buildAutonomousRepairTargetMaterialCatalog({
          dayKey:
            "2026-09-16",
          materials: [
            material(),
            material({
              targetPath:
                "data/history/2025-2026.json"
            })
          ]
        }),
      /duplicate_candidate_id/u
    );
  }
);

test(
  "duplicate target paths fail closed",
  () => {
    assert.throws(
      () =>
        buildAutonomousRepairTargetMaterialCatalog({
          dayKey:
            "2026-09-16",
          materials: [
            material(),
            material({
              id:
                candidateId("2")
            })
          ]
        }),
      /duplicate_target_path/u
    );
  }
);

test(
  "noncanonical base64 is rejected",
  () => {
    const row =
      material();

    row.contentBase64 +=
      "===";

    assert.throws(
      () =>
        buildAutonomousRepairTargetMaterialCatalog({
          dayKey:
            "2026-09-16",
          materials: [
            row
          ]
        }),
      /content_base64_invalid/u
    );
  }
);

test(
  "tampered content with stale fingerprints is rejected",
  () => {
    const catalog =
      buildAutonomousRepairTargetMaterialCatalog({
        dayKey:
          "2026-09-16",
        materials: [
          material()
        ]
      });

    catalog.materials[0]
      .contentBase64 =
        Buffer.from(
          '{"no":true}\n'
        ).toString("base64");

    assert.throws(
      () =>
        validateAutonomousRepairTargetMaterialCatalog(
          catalog
        ),
      /materials_mismatch/u
    );
  }
);

test(
  "false write authority is rejected",
  () => {
    const catalog =
      buildAutonomousRepairTargetMaterialCatalog({
        dayKey:
          "2026-09-16",
        materials: [
          material()
        ]
      });

    catalog.authority
      .filesystemWriteAuthorized =
        true;

    assert.throws(
      () =>
        validateAutonomousRepairTargetMaterialCatalog(
          catalog
        ),
      /authority_mismatch/u
    );
  }
);

test(
  "CREATE target descriptor derives exact plan-native planned hash and bytes",
  () => {
    const catalog =
      buildAutonomousRepairTargetMaterialCatalog({
        dayKey:
          "2026-09-16",
        materials: [
          material()
        ]
      });

    const targets =
      deriveAutonomousRepairTargetsByDecisionId({
        catalog,
        targetStatesByDecisionId: {
          [candidateId("1")]: {
            targetExists:
              false,
            currentSha256:
              null
          }
        }
      });

    assert.deepEqual(
      targets[
        candidateId("1")
      ],
      {
        targetPath:
          catalog.materials[0]
            .targetPath,
        targetExists:
          false,
        currentSha256:
          null,
        plannedContentSha256:
          catalog.materials[0]
            .contentSha256,
        plannedContentBytes:
          catalog.materials[0]
            .contentBytes
      }
    );
  }
);

test(
  "REPLACE target descriptor requires exact current preimage hash",
  () => {
    const catalog =
      buildAutonomousRepairTargetMaterialCatalog({
        dayKey:
          "2026-09-16",
        materials: [
          material({
            repairClass:
              "REBUILD_HISTORY_ELIGIBLE_ROW",
            targetPath:
              "data/history/2025-2026.json"
          })
        ]
      });

    const preimage =
      "a".repeat(64);

    const targets =
      deriveAutonomousRepairTargetsByDecisionId({
        catalog,
        targetStatesByDecisionId: {
          [candidateId("1")]: {
            targetExists:
              true,
            currentSha256:
              preimage
          }
        }
      });

    assert.equal(
      targets[
        candidateId("1")
      ].currentSha256,
      preimage
    );

    assert.throws(
      () =>
        deriveAutonomousRepairTargetsByDecisionId({
          catalog,
          targetStatesByDecisionId: {
            [candidateId("1")]: {
              targetExists:
                true,
              currentSha256:
                null
            }
          }
        }),
      /existing_target_sha_required/u
    );
  }
);

test(
  "target state keyset must match material catalog exactly",
  () => {
    const catalog =
      buildAutonomousRepairTargetMaterialCatalog({
        dayKey:
          "2026-09-16",
        materials: [
          material()
        ]
      });

    assert.throws(
      () =>
        deriveAutonomousRepairTargetsByDecisionId({
          catalog,
          targetStatesByDecisionId:
            {}
        }),
      /target_state_keyset_mismatch/u
    );
  }
);

test(
  "material bytes round-trip exactly and core has no filesystem mutation surface",
  () => {
    const raw =
      Buffer.from(
        '{"roundTrip":true}\n'
      );

    const catalog =
      buildAutonomousRepairTargetMaterialCatalog({
        dayKey:
          "2026-09-16",
        materials: [
          material({
            content:
              raw
          })
        ]
      });

    assert.deepEqual(
      materialContentBuffer(
        catalog.materials[0]
      ),
      raw
    );

    const corePath =
      fileURLToPath(
        new URL(
          "./autonomous-repair-target-material.js",
          import.meta.url
        )
      );

    const sourceText =
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
        sourceText.includes(
          forbidden
        ),
        false,
        forbidden
      );
    }
  }
);
