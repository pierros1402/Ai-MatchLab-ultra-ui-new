import crypto from "crypto";

import {
  synchronizeDetailStatusState,
} from "../core/detail-status-sync.js";

export const P0C_P4_DEPLOY_SNAPSHOT_DETAILS_SCHEMA =
  "ai-matchlab.p0c-p4-deploy-snapshot-details.v1";

const DETAIL_PATH_PATTERN =
  /^data\/deploy-snapshots\/(\d{4}-\d{2}-\d{2})\/details\/([^/]+)\.json$/u;

function clean(value) {
  return String(value ?? "").trim();
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertDayKey(value) {
  const dayKey =
    clean(value);

  if (!/^\d{4}-\d{2}-\d{2}$/u.test(dayKey)) {
    throw new Error(
      "p0c_p4_deploy_snapshot_details_day_key_invalid",
    );
  }

  return dayKey;
}

function assertPatchedAt(value) {
  const patchedAt =
    clean(value);

  if (
    !patchedAt ||
    Number.isNaN(Date.parse(patchedAt))
  ) {
    throw new Error(
      "p0c_p4_deploy_snapshot_details_patched_at_invalid",
    );
  }

  return patchedAt;
}

function normalizeRelativePath(value) {
  const relativePath =
    clean(value).replaceAll("\\", "/");

  if (
    !relativePath ||
    relativePath.startsWith("/") ||
    /^[A-Za-z]:/u.test(relativePath) ||
    relativePath.split("/").includes("..")
  ) {
    throw new Error(
      "p0c_p4_deploy_snapshot_details_path_invalid",
    );
  }

  return relativePath;
}

function assertObject(value, reason) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(reason);
  }

  return value;
}

function detailRecordPath(record, index, kind) {
  if (
    !record ||
    typeof record !== "object" ||
    Array.isArray(record)
  ) {
    throw new Error(
      `p0c_p4_deploy_snapshot_details_${kind}_record_invalid:${index}`,
    );
  }

  const relativePath =
    normalizeRelativePath(
      record.path ||
      record.relativePath ||
      record.file ||
      record.fileName,
    );

  if (!relativePath.endsWith(".json")) {
    throw new Error(
      `p0c_p4_deploy_snapshot_details_${kind}_record_path_invalid:${index}`,
    );
  }

  return relativePath;
}

function fileBaseName(relativePath) {
  const name =
    relativePath.split("/").at(-1) || "";

  return name.endsWith(".json")
    ? name.slice(0, -".json".length)
    : name;
}

function detailPayload(record, index, kind) {
  return assertObject(
    record.detail ??
    record.payload ??
    record.content,
    `p0c_p4_deploy_snapshot_details_${kind}_payload_invalid:${index}`,
  );
}

function normalizedMatchId(value) {
  return clean(value);
}

export function p0cP4DetailIdCandidates(
  detail,
  fileBase,
) {
  return [
    detail?.basic?.canonicalId,
    detail?.matchId,
    detail?.basic?.matchId,
    detail?.basic?.providerMatchId,
    detail?.providerMatchId,
    detail?.fixture?.matchId,
    fileBase,
  ]
    .map(normalizedMatchId)
    .filter(Boolean);
}

export function p0cP4DeployDetailOutputId(
  detail,
  fileBase,
) {
  return (
    clean(detail?.basic?.canonicalId) ||
    normalizedMatchId(
      detail?.matchId ||
      detail?.basic?.matchId ||
      detail?.fixture?.matchId,
    ) ||
    clean(fileBase)
  );
}

function inventoryContract(
  dayKey,
  inventoryPaths,
) {
  if (!Array.isArray(inventoryPaths)) {
    throw new Error(
      "p0c_p4_deploy_snapshot_details_inventory_required",
    );
  }

  const seen =
    new Set();

  const rows =
    inventoryPaths.map(
      (value, index) => {
        const relativePath =
          normalizeRelativePath(value);

        const match =
          relativePath.match(
            DETAIL_PATH_PATTERN,
          );

        if (
          !match ||
          match[1] !== dayKey
        ) {
          throw new Error(
            `p0c_p4_deploy_snapshot_details_inventory_path_mismatch:${index}:${relativePath}`,
          );
        }

        if (seen.has(relativePath)) {
          throw new Error(
            `p0c_p4_deploy_snapshot_details_inventory_duplicate:${relativePath}`,
          );
        }

        seen.add(relativePath);

        return Object.freeze({
          relativePath,
          detailId:
            match[2],
        });
      },
    );

  return rows.sort(
    (left, right) =>
      left.relativePath.localeCompare(
        right.relativePath,
      ),
  );
}

function overlayManagedFixtureStrings(
  value,
  identityOverlay,
) {
  if (Array.isArray(value)) {
    let changed = false;
    const view = value.map(item => {
      const child = overlayManagedFixtureStrings(
        item,
        identityOverlay,
      );
      changed = changed || child.changed;
      return child.view;
    });
    return { view, changed };
  }

  if (
    value &&
    typeof value === "object"
  ) {
    let changed = false;
    const view = Object.fromEntries(
      Object.entries(value).map(([key, childValue]) => {
        const child = overlayManagedFixtureStrings(
          childValue,
          identityOverlay,
        );
        changed = changed || child.changed;
        return [key, child.view];
      }),
    );
    return { view, changed };
  }

  if (
    typeof value !== "string" ||
    !identityOverlay
  ) {
    return { view: value, changed: false };
  }

  const resolution =
    identityOverlay.resolveEvidenceFixtureId(
      value,
      { allowUnmanaged: true },
    );

  if (
    !resolution?.ok ||
    resolution.managed !== true ||
    resolution.changed !== true
  ) {
    return { view: value, changed: false };
  }

  return {
    view: resolution.resolvedFixtureId,
    changed: true,
  };
}

function detailRecordMap({
  records,
  kind,
  sourceNaming,
  identityOverlay,
}) {
  if (!Array.isArray(records)) {
    throw new Error(
      `p0c_p4_deploy_snapshot_details_${kind}_records_required`,
    );
  }

  if (
    identityOverlay &&
    typeof identityOverlay.resolveEvidenceFixtureId !== "function"
  ) {
    throw new Error(
      "p0c_p4_deploy_snapshot_details_identity_overlay_invalid",
    );
  }

  const map = new Map();

  const sorted = records
    .map((record, index) => ({
      record,
      index,
      relativePath:
        detailRecordPath(
          record,
          index,
          kind,
        ),
    }))
    .sort(
      (left, right) =>
        left.relativePath.localeCompare(
          right.relativePath,
        ),
    );

  function indexCandidate({
    id,
    rank,
    relativePath,
    detail,
    identityResolvedFromSource,
  }) {
    if (!id) return;
    const prior = map.get(id);
    if (prior) {
      if (prior.rank < rank) return;
      if (prior.rank === rank) {
        throw new Error(
          `p0c_p4_deploy_snapshot_details_${kind}_duplicate:${id}`,
        );
      }
    }
    map.set(
      id,
      Object.freeze({
        relativePath,
        detail,
        rank,
        identityResolvedFromSource,
      }),
    );
  }

  for (const item of sorted) {
    const payload = detailPayload(
      item.record,
      item.index,
      kind,
    );
    const base = fileBaseName(
      item.relativePath,
    );
    const directId = sourceNaming
      ? p0cP4DeployDetailOutputId(
          payload,
          base,
        )
      : base;

    if (!directId) {
      throw new Error(
        `p0c_p4_deploy_snapshot_details_${kind}_id_missing:${item.index}`,
      );
    }

    indexCandidate({
      id: directId,
      rank: 0,
      relativePath: item.relativePath,
      detail: payload,
      identityResolvedFromSource: false,
    });

    if (!identityOverlay) continue;

    const candidates = [
      ...new Set(
        p0cP4DetailIdCandidates(
          payload,
          base,
        ),
      ),
    ];

    for (const candidate of candidates) {
      const resolution =
        identityOverlay.resolveEvidenceFixtureId(
          candidate,
          { allowUnmanaged: true },
        );
      if (
        !resolution?.ok ||
        resolution.managed !== true ||
        resolution.changed !== true
      ) {
        continue;
      }
      indexCandidate({
        id: resolution.resolvedFixtureId,
        rank: 1,
        relativePath: item.relativePath,
        detail: payload,
        identityResolvedFromSource: true,
      });
    }
  }

  return map;
}

function fixtureContract(fixtureRows) {
  if (!Array.isArray(fixtureRows)) {
    throw new Error(
      "p0c_p4_deploy_snapshot_details_fixture_rows_required",
    );
  }

  const validIds =
    new Set();

  const canonicalNames =
    new Set();

  const fixturesById =
    new Map();

  fixtureRows.forEach(
    (fixture, index) => {
      assertObject(
        fixture,
        `p0c_p4_deploy_snapshot_details_fixture_invalid:${index}`,
      );

      for (const id of [
        fixture?.canonicalId,
        fixture?.matchId,
        fixture?.sourceMatchId,
        fixture?.sourceId,
        fixture?.matchKey,
      ]) {
        const key =
          clean(id);

        if (key) {
          validIds.add(key);
        }
      }

      const canonicalName =
        clean(fixture?.canonicalId) ||
        clean(fixture?.matchId);

      if (canonicalName) {
        canonicalNames.add(
          canonicalName,
        );
      }

      for (const id of [
        fixture?.canonicalId,
        fixture?.matchId,
        fixture?.providerMatchId,
        fixture?.sourceMatchId,
        fixture?.matchKey,
      ]) {
        const key =
          clean(id);

        if (key) {
          fixturesById.set(
            key,
            fixture,
          );
        }
      }
    },
  );

  return Object.freeze({
    validIds,
    canonicalNames,
    fixturesById,
  });
}

function canonicalJsonText(payload) {
  return `${JSON.stringify(payload, null, 2)}\n`;
}

export function p0cP4DeployDetailCanonicalBytes(
  payload,
) {
  return Buffer.byteLength(
    canonicalJsonText(payload),
    "utf8",
  );
}

export function p0cP4DeployDetailCanonicalSha256(
  payload,
) {
  return crypto
    .createHash("sha256")
    .update(
      canonicalJsonText(payload),
      "utf8",
    )
    .digest("hex");
}

function isStatusSyncCompatibleDetail(detail) {
  return Boolean(
    detail &&
    typeof detail === "object" &&
    !Array.isArray(detail) &&
    detail.basic &&
    typeof detail.basic === "object" &&
    !Array.isArray(detail.basic) &&
    detail.meta &&
    typeof detail.meta === "object" &&
    !Array.isArray(detail.meta) &&
    typeof detail.meta.signature === "string" &&
    detail.meta.signature.trim()
  );
}

function fixtureForDetail({
  fixturesById,
  targetId,
  detail,
}) {
  for (const id of [
    targetId,
    detail?.basic?.canonicalId,
    detail?.matchId,
    detail?.basic?.matchId,
    detail?.fixture?.matchId,
  ]) {
    const key =
      clean(id);

    if (
      key &&
      fixturesById.has(key)
    ) {
      return fixturesById.get(key);
    }
  }

  return null;
}

function outputRow({
  relativePath,
  action,
  content,
  reason,
}) {
  const row = {
    relativePath,
    action,
  };

  if (action === "write") {
    row.content =
      Object.freeze(content);
    row.bytes =
      p0cP4DeployDetailCanonicalBytes(
        content,
      );
    row.sha256 =
      p0cP4DeployDetailCanonicalSha256(
        content,
      );
  } else {
    row.reason =
      reason;
  }

  return Object.freeze(row);
}

export function buildP0CP4DeploySnapshotDetails({
  dayKey,
  inventoryPaths,
  sourceDetails = [],
  existingDeployDetails = [],
  fixtureRows = [],
  preserveExistingDetails = true,
  patchedAt,
  identityOverlay = null,
} = {}) {
  const normalizedDayKey =
    assertDayKey(dayKey);

  const normalizedPatchedAt =
    assertPatchedAt(patchedAt);

  if (
    typeof preserveExistingDetails !==
    "boolean"
  ) {
    throw new Error(
      "p0c_p4_deploy_snapshot_details_preserve_flag_invalid",
    );
  }

  const inventory =
    inventoryContract(
      normalizedDayKey,
      inventoryPaths,
    );

  const sources =
    detailRecordMap({
      records:
        sourceDetails,
      kind:
        "source",
      sourceNaming:
        true,
      identityOverlay,
    });

  const existing =
    detailRecordMap({
      records:
        existingDeployDetails,
      kind:
        "existing",
      sourceNaming:
        false,
      identityOverlay,
    });

  const fixtures =
    fixtureContract(
      fixtureRows,
    );

  const strictCanonicalAllowList =
    fixtures.canonicalNames.size > 0
      ? fixtures.canonicalNames
      : null;

  const looseValidIds =
    fixtures.validIds.size > 0
      ? fixtures.validIds
      : null;

  const outputs = [];
  const writes = [];
  const deletions = [];

  for (const target of inventory) {
    const targetId =
      target.detailId;

    if (
      strictCanonicalAllowList &&
      !strictCanonicalAllowList.has(
        targetId,
      )
    ) {
      const deletion =
        outputRow({
          relativePath:
            target.relativePath,
          action:
            "delete",
          reason:
            "detail_not_in_published_fixture_canonical_allow_list",
        });

      outputs.push(deletion);
      deletions.push(deletion);
      continue;
    }

    const existingRecord =
      preserveExistingDetails
        ? existing.get(targetId)
        : null;

    const sourceRecord =
      sources.get(targetId);

    const selected =
      existingRecord ||
      sourceRecord ||
      null;

    if (!selected) {
      if (!strictCanonicalAllowList) {
        const deletion =
          outputRow({
            relativePath:
              target.relativePath,
            action:
              "delete",
            reason:
              "detail_source_absent_without_fixture_allow_list",
          });

        outputs.push(deletion);
        deletions.push(deletion);
        continue;
      }

      throw new Error(
        `p0c_p4_deploy_snapshot_details_retained_detail_missing:${target.relativePath}`,
      );
    }

    const identityView =
      overlayManagedFixtureStrings(
        selected.detail,
        identityOverlay,
      );

    const detail =
      clone(
        identityView.view,
      );

    if (
      !strictCanonicalAllowList &&
      looseValidIds &&
      !p0cP4DetailIdCandidates(
        detail,
        targetId,
      ).some(id =>
        looseValidIds.has(id),
      )
    ) {
      const deletion =
        outputRow({
          relativePath:
            target.relativePath,
          action:
            "delete",
          reason:
            "detail_not_in_published_fixture_identifier_set",
        });

      outputs.push(deletion);
      deletions.push(deletion);
      continue;
    }

    const fixture =
      fixtureForDetail({
        fixturesById:
          fixtures.fixturesById,
        targetId,
        detail,
      });

    let statusChanged =
      false;

    let statusSyncSkippedReason =
      null;

    if (
      fixture &&
      isStatusSyncCompatibleDetail(detail)
    ) {
      const sync =
        synchronizeDetailStatusState(
          detail,
          fixture,
          {
            patchedAt:
              normalizedPatchedAt,
          },
        );

      if (!sync.ok) {
        throw new Error(
          `p0c_p4_deploy_snapshot_details_status_sync_failed:${targetId}:${sync.reason || "unknown"}`,
        );
      }

      statusChanged =
        sync.changed === true;
    }
    else if (fixture) {
      statusSyncSkippedReason =
        "legacy_detail_status_sync_schema_unavailable_preserved";
    }

    const write =
      outputRow({
        relativePath:
          target.relativePath,
        action:
          "write",
        content:
          detail,
      });

    outputs.push(write);
    writes.push(
      Object.freeze({
        ...write,
        source:
          existingRecord
            ? "existing_deploy_detail"
            : "canonical_detail_source",
        identityResolvedFromSource:
          selected.identityResolvedFromSource === true,
        identityOverlayChanged:
          identityView.changed === true,
        statusChanged,
        statusSyncSkippedReason,
      }),
    );
  }

  return Object.freeze({
    schema:
      P0C_P4_DEPLOY_SNAPSHOT_DETAILS_SCHEMA,
    ok:
      true,
    date:
      normalizedDayKey,
    completeFamilyOutput:
      outputs.length ===
      inventory.length,
    outputs:
      Object.freeze(outputs),
    diagnostics:
      Object.freeze({
        inventoryPathCount:
          inventory.length,
        emittedWriteCount:
          writes.length,
        emittedDeletionCount:
          deletions.length,
        sourceDetailCount:
          sources.size,
        existingDeployDetailCount:
          existing.size,
        fixtureCount:
          fixtureRows.length,
        strictCanonicalAllowListApplied:
          Boolean(
            strictCanonicalAllowList,
          ),
        preserveExistingDetails,
        identityOverlayApplied:
          Boolean(identityOverlay),
        writes:
          Object.freeze(writes),
        deletions:
          Object.freeze(deletions),
        repositoryApplicationAuthorized:
          false,
      }),
  });
}
