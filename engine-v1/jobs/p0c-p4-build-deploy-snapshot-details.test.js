import test from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";

import {
  P0C_P4_DEPLOY_SNAPSHOT_DETAILS_SCHEMA,
  buildP0CP4DeploySnapshotDetails,
  p0cP4DeployDetailCanonicalBytes,
  p0cP4DeployDetailCanonicalSha256,
  p0cP4DeployDetailOutputId,
  p0cP4DetailIdCandidates,
} from "./p0c-p4-build-deploy-snapshot-details.js";

const DAY =
  "2026-08-03";

const PATCHED_AT =
  "2026-08-03T20:30:00.000Z";

function inventory(...ids) {
  return ids.map(
    id =>
      `data/deploy-snapshots/${DAY}/details/${id}.json`,
  );
}

function signature(overrides = {}) {
  return JSON.stringify({
    status:
      "PRE",
    rawStatus:
      "SCHEDULED",
    minute:
      "",
    scoreHome:
      null,
    scoreAway:
      null,
    ...overrides,
  });
}

function detail({
  canonicalId,
  matchId = canonicalId,
  marker = "source",
  status = "PRE",
  rawStatus = "SCHEDULED",
  minute = "",
  scoreHome = null,
  scoreAway = null,
  signatureOverrides = {},
} = {}) {
  return {
    matchId,
    marker,
    basic: {
      canonicalId,
      matchId,
      status,
      rawStatus,
      minute,
      scoreHome,
      scoreAway,
    },
    meta: {
      signature:
        signature({
          status,
          rawStatus,
          minute:
            String(minute ?? ""),
          scoreHome,
          scoreAway,
          ...signatureOverrides,
        }),
    },
  };
}

function fixture({
  canonicalId,
  matchId = canonicalId,
  status = "PRE",
  rawStatus = "SCHEDULED",
  minute = "",
  scoreHome = null,
  scoreAway = null,
} = {}) {
  return {
    canonicalId,
    matchId,
    sourceMatchId:
      `source:${matchId}`,
    sourceId:
      `source-id:${matchId}`,
    matchKey:
      `key:${matchId}`,
    providerMatchId:
      `provider:${matchId}`,
    status,
    rawStatus,
    minute,
    scoreHome,
    scoreAway,
  };
}

function record(path, payload) {
  return {
    path,
    detail:
      payload,
  };
}

test("publishes the deploy-snapshot details pure-builder contract", () => {
  assert.equal(
    P0C_P4_DEPLOY_SNAPSHOT_DETAILS_SCHEMA,
    "ai-matchlab.p0c-p4-deploy-snapshot-details.v1",
  );
});

test("uses existing deploy details before canonical source details when preservation is enabled", () => {
  const cid =
    "cid_alpha_beta_20260803";

  const result =
    buildP0CP4DeploySnapshotDetails({
      dayKey:
        DAY,
      inventoryPaths:
        inventory(cid),
      sourceDetails: [
        record(
          `data/details/${DAY}/${cid}.json`,
          detail({
            canonicalId:
              cid,
            marker:
              "source",
          }),
        ),
      ],
      existingDeployDetails: [
        record(
          `data/deploy-snapshots/${DAY}/details/${cid}.json`,
          detail({
            canonicalId:
              cid,
            marker:
              "existing",
          }),
        ),
      ],
      fixtureRows: [
        fixture({
          canonicalId:
            cid,
        }),
      ],
      preserveExistingDetails:
        true,
      patchedAt:
        PATCHED_AT,
    });

  assert.equal(
    result.outputs.length,
    1,
  );
  assert.equal(
    result.outputs[0].action,
    "write",
  );
  assert.equal(
    result.outputs[0].content.marker,
    "existing",
  );
  assert.equal(
    result.diagnostics.writes[0].source,
    "existing_deploy_detail",
  );
});

test("uses the canonical source when preservation is disabled", () => {
  const cid =
    "cid_alpha_beta_20260803";

  const result =
    buildP0CP4DeploySnapshotDetails({
      dayKey:
        DAY,
      inventoryPaths:
        inventory(cid),
      sourceDetails: [
        record(
          `data/details/${DAY}/provider-1.json`,
          detail({
            canonicalId:
              cid,
            marker:
              "source",
          }),
        ),
      ],
      existingDeployDetails: [
        record(
          `data/deploy-snapshots/${DAY}/details/${cid}.json`,
          detail({
            canonicalId:
              cid,
            marker:
              "existing",
          }),
        ),
      ],
      fixtureRows: [
        fixture({
          canonicalId:
            cid,
        }),
      ],
      preserveExistingDetails:
        false,
      patchedAt:
        PATCHED_AT,
    });

  assert.equal(
    result.outputs[0].content.marker,
    "source",
  );
  assert.equal(
    result.diagnostics.writes[0].source,
    "canonical_detail_source",
  );
});

test("maps source details to the canonical output filename", () => {
  const cid =
    "cid_canonical_20260803";

  const payload =
    detail({
      canonicalId:
        cid,
      matchId:
        "provider-match-7",
    });

  assert.equal(
    p0cP4DeployDetailOutputId(
      payload,
      "provider-match-7",
    ),
    cid,
  );

  const result =
    buildP0CP4DeploySnapshotDetails({
      dayKey:
        DAY,
      inventoryPaths:
        inventory(cid),
      sourceDetails: [
        record(
          `data/details/${DAY}/provider-match-7.json`,
          payload,
        ),
      ],
      fixtureRows: [
        fixture({
          canonicalId:
            cid,
          matchId:
            "provider-match-7",
        }),
      ],
      patchedAt:
        PATCHED_AT,
    });

  assert.equal(
    result.outputs[0].relativePath,
    inventory(cid)[0],
  );
});

test("deletes an inventory target outside the strict fixture canonical allow-list", () => {
  const retained =
    "cid_retained_20260803";

  const orphan =
    "cid_orphan_20260803";

  const result =
    buildP0CP4DeploySnapshotDetails({
      dayKey:
        DAY,
      inventoryPaths:
        inventory(
          retained,
          orphan,
        ),
      sourceDetails: [
        record(
          `data/details/${DAY}/${retained}.json`,
          detail({
            canonicalId:
              retained,
          }),
        ),
        record(
          `data/details/${DAY}/${orphan}.json`,
          detail({
            canonicalId:
              orphan,
          }),
        ),
      ],
      fixtureRows: [
        fixture({
          canonicalId:
            retained,
        }),
      ],
      patchedAt:
        PATCHED_AT,
    });

  assert.deepEqual(
    result.outputs.map(row => row.action),
    [
      "delete",
      "write",
    ],
  );

  assert.equal(
    result.diagnostics.emittedDeletionCount,
    1,
  );
});

test("keeps inventory details when the fixture allow-list is empty", () => {
  const cid =
    "cid_preserved_zero_fixture_day";

  const result =
    buildP0CP4DeploySnapshotDetails({
      dayKey:
        DAY,
      inventoryPaths:
        inventory(cid),
      existingDeployDetails: [
        record(
          inventory(cid)[0],
          detail({
            canonicalId:
              cid,
          }),
        ),
      ],
      fixtureRows:
        [],
      patchedAt:
        PATCHED_AT,
    });

  assert.equal(
    result.outputs[0].action,
    "write",
  );
  assert.equal(
    result.diagnostics.strictCanonicalAllowListApplied,
    false,
  );
});

test("synchronizes mutable detail status fields with an injected deterministic patchedAt", () => {
  const cid =
    "cid_live_final_20260803";

  const result =
    buildP0CP4DeploySnapshotDetails({
      dayKey:
        DAY,
      inventoryPaths:
        inventory(cid),
      sourceDetails: [
        record(
          `data/details/${DAY}/${cid}.json`,
          detail({
            canonicalId:
              cid,
          }),
        ),
      ],
      fixtureRows: [
        fixture({
          canonicalId:
            cid,
          status:
            "FT",
          rawStatus:
            "FULL_TIME",
          minute:
            "90",
          scoreHome:
            2,
          scoreAway:
            1,
        }),
      ],
      patchedAt:
        PATCHED_AT,
    });

  const output =
    result.outputs[0].content;

  assert.equal(
    output.basic.status,
    "FT",
  );
  assert.equal(
    output.basic.rawStatus,
    "FULL_TIME",
  );
  assert.equal(
    output.basic.minute,
    "90",
  );
  assert.equal(
    output.basic.scoreHome,
    2,
  );
  assert.equal(
    output.basic.scoreAway,
    1,
  );
  assert.equal(
    output.basic.lastStatusPatchedAt,
    PATCHED_AT,
  );

  assert.deepEqual(
    JSON.parse(
      output.meta.signature,
    ),
    {
      status:
        "FT",
      rawStatus:
        "FULL_TIME",
      minute:
        "90",
      scoreHome:
        2,
      scoreAway:
        1,
    },
  );

  assert.equal(
    result.diagnostics.writes[0].statusChanged,
    true,
  );
});

test("does not rewrite a terminal minute display-equivalent detail", () => {
  const cid =
    "cid_terminal_equivalent_20260803";

  const payload =
    detail({
      canonicalId:
        cid,
      status:
        "FT",
      rawStatus:
        "FULL_TIME",
      minute:
        "FT",
      scoreHome:
        1,
      scoreAway:
        0,
      signatureOverrides: {
        minute:
          "FT",
      },
    });

  const result =
    buildP0CP4DeploySnapshotDetails({
      dayKey:
        DAY,
      inventoryPaths:
        inventory(cid),
      sourceDetails: [
        record(
          `data/details/${DAY}/${cid}.json`,
          payload,
        ),
      ],
      fixtureRows: [
        fixture({
          canonicalId:
            cid,
          status:
            "FT",
          rawStatus:
            "FULL_TIME",
          minute:
            "90",
          scoreHome:
            1,
          scoreAway:
            0,
        }),
      ],
      patchedAt:
        PATCHED_AT,
    });

  assert.equal(
    Object.hasOwn(
      result.outputs[0].content.basic,
      "lastStatusPatchedAt",
    ),
    false,
  );

  assert.equal(
    result.diagnostics.writes[0].statusChanged,
    false,
  );
});

test("creates a retained detail path from an exact suppressed fixture alias without preserving suppressed references", () => {
  const suppressed =
    "cid_suppressed_20260803";
  const retained =
    "cid_retained_20260803";
  const identityOverlay = {
    resolveEvidenceFixtureId(value) {
      if (value === suppressed) {
        return {
          ok: true,
          managed: true,
          changed: true,
          sourceFixtureId: suppressed,
          resolvedFixtureId: retained,
          sourceRole: "suppressed_lineage_alias",
        };
      }
      if (value === retained) {
        return {
          ok: true,
          managed: true,
          changed: false,
          sourceFixtureId: retained,
          resolvedFixtureId: retained,
          sourceRole: "retained",
        };
      }
      return {
        ok: true,
        managed: false,
        changed: false,
        sourceFixtureId: value,
        resolvedFixtureId: value,
        sourceRole: "unmanaged",
      };
    },
  };

  const payload = detail({
    canonicalId: suppressed,
    matchId: suppressed,
    marker: "suppressed-source",
  });
  payload.productionIdentityBinding = {
    sourceFixtureId: suppressed,
    resolvedFixtureId: retained,
  };

  const result = buildP0CP4DeploySnapshotDetails({
    dayKey: DAY,
    inventoryPaths: inventory(retained),
    existingDeployDetails: [
      record(
        `data/deploy-snapshots/${DAY}/details/${suppressed}.json`,
        payload,
      ),
    ],
    fixtureRows: [
      fixture({
        canonicalId: retained,
        matchId: retained,
      }),
    ],
    preserveExistingDetails: true,
    patchedAt: PATCHED_AT,
    identityOverlay,
  });

  assert.equal(result.outputs.length, 1);
  assert.equal(result.outputs[0].action, "write");
  assert.equal(
    result.outputs[0].relativePath,
    inventory(retained)[0],
  );
  assert.equal(
    result.outputs[0].content.basic.canonicalId,
    retained,
  );
  assert.equal(result.outputs[0].content.matchId, retained);
  assert.equal(
    JSON.stringify(result.outputs[0].content)
      .includes(suppressed),
    false,
  );
  assert.equal(
    result.diagnostics.writes[0]
      .identityResolvedFromSource,
    true,
  );
  assert.equal(
    result.diagnostics.writes[0]
      .identityOverlayChanged,
    true,
  );
});

test("preserves a retained legacy detail when status-sync schema is unavailable", () => {
  const cid = "legacy-provider-id";
  const legacy = {
    matchId: cid,
    home: "Legacy Home",
    away: "Legacy Away",
    status: "SCHEDULED",
  };

  const result = buildP0CP4DeploySnapshotDetails({
    dayKey: DAY,
    inventoryPaths: inventory(cid),
    existingDeployDetails: [
      record(inventory(cid)[0], legacy),
    ],
    fixtureRows: [
      fixture({
        canonicalId: cid,
        status: "FT",
        rawStatus: "FULL_TIME",
        scoreHome: 1,
        scoreAway: 0,
      }),
    ],
    patchedAt: PATCHED_AT,
  });

  assert.equal(result.outputs[0].action, "write");
  assert.deepEqual(result.outputs[0].content, legacy);
  assert.equal(
    result.diagnostics.writes[0].statusChanged,
    false,
  );
  assert.equal(
    result.diagnostics.writes[0].statusSyncSkippedReason,
    "legacy_detail_status_sync_schema_unavailable_preserved",
  );
});

test("fails closed when a retained fixture has no source or preserved detail", () => {
  const cid =
    "cid_missing_20260803";

  assert.throws(
    () =>
      buildP0CP4DeploySnapshotDetails({
        dayKey:
          DAY,
        inventoryPaths:
          inventory(cid),
        fixtureRows: [
          fixture({
            canonicalId:
              cid,
          }),
        ],
        patchedAt:
          PATCHED_AT,
      }),
    /retained_detail_missing/,
  );
});

test("rejects invalid day keys, paths, duplicate inventory rows and timestamps", () => {
  assert.throws(
    () =>
      buildP0CP4DeploySnapshotDetails({
        dayKey:
          "2026-8-3",
        inventoryPaths:
          [],
        patchedAt:
          PATCHED_AT,
      }),
    /day_key_invalid/,
  );

  assert.throws(
    () =>
      buildP0CP4DeploySnapshotDetails({
        dayKey:
          DAY,
        inventoryPaths: [
          `data/deploy-snapshots/2026-08-02/details/x.json`,
        ],
        patchedAt:
          PATCHED_AT,
      }),
    /inventory_path_mismatch/,
  );

  assert.throws(
    () =>
      buildP0CP4DeploySnapshotDetails({
        dayKey:
          DAY,
        inventoryPaths:
          inventory("x", "x"),
        patchedAt:
          PATCHED_AT,
      }),
    /inventory_duplicate/,
  );

  assert.throws(
    () =>
      buildP0CP4DeploySnapshotDetails({
        dayKey:
          DAY,
        inventoryPaths:
          [],
        patchedAt:
          "not-a-date",
      }),
    /patched_at_invalid/,
  );
});

test("computes canonical LF JSON bytes and SHA-256 deterministically", () => {
  const payload = {
    b:
      2,
    a:
      1,
  };

  const text =
    `${JSON.stringify(payload, null, 2)}\n`;

  assert.equal(
    p0cP4DeployDetailCanonicalBytes(
      payload,
    ),
    Buffer.byteLength(
      text,
      "utf8",
    ),
  );

  assert.equal(
    p0cP4DeployDetailCanonicalSha256(
      payload,
    ),
    crypto
      .createHash("sha256")
      .update(text, "utf8")
      .digest("hex"),
  );
});

test("is deterministic, sorted by inventory path and does not mutate inputs", () => {
  const firstId =
    "cid_a_20260803";

  const secondId =
    "cid_b_20260803";

  const sourceDetails = [
    record(
      `data/details/${DAY}/${secondId}.json`,
      detail({
        canonicalId:
          secondId,
      }),
    ),
    record(
      `data/details/${DAY}/${firstId}.json`,
      detail({
        canonicalId:
          firstId,
      }),
    ),
  ];

  const fixtureRows = [
    fixture({
      canonicalId:
        firstId,
    }),
    fixture({
      canonicalId:
        secondId,
    }),
  ];

  const sourceBefore =
    JSON.stringify(
      sourceDetails,
    );

  const fixturesBefore =
    JSON.stringify(
      fixtureRows,
    );

  const input = {
    dayKey:
      DAY,
    inventoryPaths: [
      inventory(secondId)[0],
      inventory(firstId)[0],
    ],
    sourceDetails,
    fixtureRows,
    patchedAt:
      PATCHED_AT,
  };

  const first =
    buildP0CP4DeploySnapshotDetails(
      input,
    );

  const second =
    buildP0CP4DeploySnapshotDetails(
      input,
    );

  assert.deepEqual(
    first,
    second,
  );

  assert.deepEqual(
    first.outputs.map(row => row.relativePath),
    inventory(
      firstId,
      secondId,
    ),
  );

  assert.equal(
    JSON.stringify(
      sourceDetails,
    ),
    sourceBefore,
  );

  assert.equal(
    JSON.stringify(
      fixtureRows,
    ),
    fixturesBefore,
  );
});

test("exposes the same identifier candidates used by the production exporter", () => {
  const payload = {
    matchId:
      "match",
    providerMatchId:
      "provider",
    basic: {
      canonicalId:
        "canonical",
      matchId:
        "basic-match",
      providerMatchId:
        "basic-provider",
    },
    fixture: {
      matchId:
        "fixture-match",
    },
  };

  assert.deepEqual(
    p0cP4DetailIdCandidates(
      payload,
      "file-base",
    ),
    [
      "canonical",
      "match",
      "basic-match",
      "basic-provider",
      "provider",
      "fixture-match",
      "file-base",
    ],
  );
});
