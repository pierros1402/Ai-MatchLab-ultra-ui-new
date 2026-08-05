import crypto from "node:crypto";

export const P0C_P4_EXISTING_VALUE_ARTIFACT_SCHEMA =
  "ai-matchlab.p0c-p4-existing-value-artifact.v1";

export const P0C_P4_VALUE_IDENTITY_OVERLAY_SCHEMA =
  "ai-matchlab.p0c-p4-value-identity-overlay.v1";

export const P0C_P4_VALUE_SUPPRESSED_SOURCE_ID_OMISSION_SCHEMA =
  "ai-matchlab.p0c-p4-value-suppressed-source-id-omission.v1";

const IMMUTABLE_PLAN_A_PATTERN =
  /^data\/value-plans\/(\d{4}-\d{2}-\d{2})\/plan-a\.json$/u;

const VALUE_FAMILY_PATTERNS = Object.freeze({
  VALUE_PLAN_ARTIFACT:
    /^data\/value-plans\/(\d{4}-\d{2}-\d{2})\/(?:plan-a|plan-b|plan-a2|plan-a2-audit|plan-b-audit|plan-b2|plan-b2-audit)\.json$/u,
  VALUE_AUDIT_ARTIFACT:
    /^data\/value\/_audit\/(\d{4}-\d{2}-\d{2})\.json$/u,
  VALUE_COMPARISON:
    /^data\/value-comparison\/(\d{4}-\d{2}-\d{2})\.json$/u,
  DEPLOY_SNAPSHOT_VALUE:
    /^data\/deploy-snapshots\/(\d{4}-\d{2}-\d{2})\/value\.json$/u,
  DEPLOY_SNAPSHOT_VALUE_AUDIT:
    /^data\/deploy-snapshots\/(\d{4}-\d{2}-\d{2})\/value-audit\.json$/u,
});

const CRITICAL_INVARIANT_FIELDS = Object.freeze([
  "sourceArtifactRewritten",
  "modelEvaluationPerformed",
  "pickTruthChanged",
  "marketTruthChanged",
  "scoreTruthChanged",
  "statusTruthChanged",
  "settlementTruthChanged",
  "fixtureMembershipCreated",
  "repositoryApplicationAuthorized",
]);

function clean(value) {
  return String(value ?? "").trim();
}

function sha256Buffer(value) {
  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex");
}

function normalizeRelativePath(value) {
  const text = clean(value).replaceAll("\\", "/");
  if (
    !text ||
    text.startsWith("/") ||
    /^[A-Za-z]:/u.test(text) ||
    text.split("/").includes("..")
  ) {
    throw new Error(
      "p0c_p4_value_artifact_path_invalid",
    );
  }
  return text;
}

function sourceBuffer(value) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (typeof value === "string") {
    return Buffer.from(value, "utf8");
  }
  throw new Error(
    "p0c_p4_value_artifact_source_bytes_required",
  );
}

function parseJsonObject(buffer, relativePath) {
  let parsed;
  try {
    parsed = JSON.parse(buffer.toString("utf8"));
  }
  catch {
    throw new Error(
      `p0c_p4_value_artifact_json_invalid:${relativePath}`,
    );
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed)
  ) {
    throw new Error(
      `p0c_p4_value_artifact_root_invalid:${relativePath}`,
    );
  }
  return parsed;
}

function jsonPointerSegment(value) {
  return String(value)
    .replaceAll("~", "~0")
    .replaceAll("/", "~1");
}

function resolveManagedFixtureString({
  value,
  overlay,
  pointer,
  entries,
}) {
  if (typeof value !== "string") {
    return value;
  }

  const resolution =
    overlay.resolveEvidenceFixtureId(value, {
      allowUnmanaged: true,
    });

  if (!resolution?.ok || resolution.managed !== true) {
    return value;
  }

  entries.push({
    jsonPointer: pointer || "/",
    sourceFixtureId: resolution.sourceFixtureId,
    resolvedFixtureId: resolution.resolvedFixtureId,
    sourceFixtureRole: resolution.sourceRole,
    managed: true,
    changed:
      resolution.sourceFixtureId !==
      resolution.resolvedFixtureId,
  });

  return resolution.resolvedFixtureId;
}

function overlayValue(value, context, pointer = "") {
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      overlayValue(
        item,
        context,
        `${pointer}/${index}`,
      ),
    );
  }

  if (
    value &&
    typeof value === "object"
  ) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        overlayValue(
          child,
          context,
          `${pointer}/${jsonPointerSegment(key)}`,
        ),
      ]),
    );
  }

  return resolveManagedFixtureString({
    value,
    overlay: context.overlay,
    pointer,
    entries: context.entries,
  });
}

function entrySourceIdentityKey(row) {
  return clean(row.sourceFixtureId) ||
    clean(row.sourceFixtureIdSha256);
}

function normalizedEntryKey(row) {
  return [
    clean(row.jsonPointer),
    entrySourceIdentityKey(row),
    clean(row.resolvedFixtureId),
  ].join("\u0000");
}

function uniqueSortedEntries(entries) {
  const byKey = new Map();
  for (const row of entries) {
    const key = normalizedEntryKey(row);
    if (!byKey.has(key)) byKey.set(key, row);
  }
  return [...byKey.values()].sort((left, right) =>
    clean(left.jsonPointer).localeCompare(
      clean(right.jsonPointer),
    ) ||
    entrySourceIdentityKey(left).localeCompare(
      entrySourceIdentityKey(right),
    ),
  );
}

function redactChangedEntry(row) {
  if (row.changed !== true) {
    return { ...row };
  }
  const sourceFixtureId = clean(row.sourceFixtureId);
  if (!sourceFixtureId) {
    throw new Error(
      "p0c_p4_value_artifact_changed_source_fixture_id_required",
    );
  }
  const redacted = { ...row };
  delete redacted.sourceFixtureId;
  redacted.sourceFixtureIdSha256 = sha256Buffer(
    Buffer.from(sourceFixtureId, "utf8"),
  );
  redacted.sourceFixtureIdOmitted = true;
  return redacted;
}

function valueFamilyDay(relativePath, family) {
  const pattern = VALUE_FAMILY_PATTERNS[family];
  if (!pattern) {
    throw new Error(
      `p0c_p4_value_artifact_family_unknown:${family || "missing"}`,
    );
  }
  const match = relativePath.match(pattern);
  if (!match) {
    throw new Error(
      `p0c_p4_value_artifact_path_family_mismatch:${family}:${relativePath}`,
    );
  }
  return match[1];
}

function validateAppliedOverlay({
  sourceDocument,
  normalizedPath,
  normalizedFamily,
  dayKey,
  overlay,
}) {
  const applied = sourceDocument.productionIdentityOverlay;
  if (
    !applied ||
    typeof applied !== "object" ||
    Array.isArray(applied) ||
    applied.schema !== P0C_P4_VALUE_IDENTITY_OVERLAY_SCHEMA
  ) {
    throw new Error(
      `p0c_p4_value_artifact_existing_overlay_invalid:${normalizedPath}`,
    );
  }
  if (
    clean(applied?.source?.relativePath) !== normalizedPath ||
    !/^[a-f0-9]{64}$/u.test(clean(applied?.source?.sha256)) ||
    applied?.source?.rewritten !== false ||
    clean(applied.dayKey) !== dayKey ||
    clean(applied.family) !== normalizedFamily ||
    !Array.isArray(applied.entries)
  ) {
    throw new Error(
      `p0c_p4_value_artifact_existing_overlay_binding_invalid:${normalizedPath}`,
    );
  }

  for (const field of CRITICAL_INVARIANT_FIELDS) {
    if (applied?.invariants?.[field] !== false) {
      throw new Error(
        `p0c_p4_value_artifact_existing_overlay_invariant_invalid:${normalizedPath}:${field}`,
      );
    }
  }

  const keys = new Set();
  let changedFixtureIdCount = 0;
  let omittedCount = 0;

  for (const entry of applied.entries) {
    if (
      !entry ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      !clean(entry.jsonPointer) ||
      !clean(entry.resolvedFixtureId) ||
      entry.managed !== true ||
      typeof entry.changed !== "boolean"
    ) {
      throw new Error(
        `p0c_p4_value_artifact_existing_overlay_entry_invalid:${normalizedPath}`,
      );
    }

    const retainedResolution =
      overlay.resolveEvidenceFixtureId(
        entry.resolvedFixtureId,
        { allowUnmanaged: true },
      );
    if (
      !retainedResolution?.ok ||
      retainedResolution.managed !== true ||
      retainedResolution.changed === true ||
      retainedResolution.resolvedFixtureId !==
        entry.resolvedFixtureId
    ) {
      throw new Error(
        `p0c_p4_value_artifact_existing_overlay_resolved_fixture_invalid:${normalizedPath}`,
      );
    }

    if (entry.changed === true) {
      changedFixtureIdCount += 1;
      if (
        Object.hasOwn(entry, "sourceFixtureId") ||
        entry.sourceFixtureIdOmitted !== true ||
        !/^[a-f0-9]{64}$/u.test(
          clean(entry.sourceFixtureIdSha256),
        )
      ) {
        throw new Error(
          `p0c_p4_value_artifact_existing_overlay_suppressed_source_not_omitted:${normalizedPath}`,
        );
      }
      omittedCount += 1;
    }
    else {
      const sourceFixtureId = clean(entry.sourceFixtureId);
      if (
        !sourceFixtureId ||
        Object.hasOwn(entry, "sourceFixtureIdSha256") ||
        entry.sourceFixtureIdOmitted === true
      ) {
        throw new Error(
          `p0c_p4_value_artifact_existing_overlay_retained_source_invalid:${normalizedPath}`,
        );
      }
      const sourceResolution =
        overlay.resolveEvidenceFixtureId(
          sourceFixtureId,
          { allowUnmanaged: true },
        );
      if (
        !sourceResolution?.ok ||
        sourceResolution.managed !== true ||
        sourceResolution.changed === true ||
        sourceResolution.resolvedFixtureId !==
          entry.resolvedFixtureId
      ) {
        throw new Error(
          `p0c_p4_value_artifact_existing_overlay_source_resolution_invalid:${normalizedPath}`,
        );
      }
    }

    const key = normalizedEntryKey(entry);
    if (keys.has(key)) {
      throw new Error(
        `p0c_p4_value_artifact_existing_overlay_entry_duplicate:${normalizedPath}`,
      );
    }
    keys.add(key);
  }

  if (
    Number(applied.entryCount) !== applied.entries.length ||
    Number(applied.changedFixtureIdCount) !==
      changedFixtureIdCount
  ) {
    throw new Error(
      `p0c_p4_value_artifact_existing_overlay_count_invalid:${normalizedPath}`,
    );
  }

  if (omittedCount > 0) {
    const omission =
      applied.suppressedSourceFixtureIdOmission;
    if (
      omission?.schema !==
        P0C_P4_VALUE_SUPPRESSED_SOURCE_ID_OMISSION_SCHEMA ||
      Number(omission.count) !== omittedCount ||
      omission.sourceArtifactBoundBySha256 !== true ||
      omission.identityOnly !== true
    ) {
      throw new Error(
        `p0c_p4_value_artifact_existing_overlay_omission_invalid:${normalizedPath}`,
      );
    }
  }
  else if (
    Object.hasOwn(
      applied,
      "suppressedSourceFixtureIdOmission",
    )
  ) {
    throw new Error(
      `p0c_p4_value_artifact_existing_overlay_unexpected_omission:${normalizedPath}`,
    );
  }

  const baseDocument = { ...sourceDocument };
  delete baseDocument.productionIdentityOverlay;
  const currentEntries = [];
  overlayValue(
    baseDocument,
    { overlay, entries: currentEntries },
  );
  if (currentEntries.some(row => row.changed)) {
    throw new Error(
      `p0c_p4_value_artifact_existing_overlay_base_not_resolved:${normalizedPath}`,
    );
  }

  return Object.freeze({
    entryCount: applied.entries.length,
    changedFixtureIdCount,
    omittedCount,
  });
}

function resultEnvelope({
  normalizedFamily,
  dayKey,
  normalizedPath,
  immutablePlanA,
  input,
  inputSha256,
  output,
  entryCount,
  changedFixtureIdCount,
  additiveOverlayEmbedded,
  alreadyAppliedOverlayValidated = false,
  idempotentPassThrough = false,
  omittedCount = 0,
}) {
  return Object.freeze({
    schema: P0C_P4_EXISTING_VALUE_ARTIFACT_SCHEMA,
    ok: true,
    family: normalizedFamily,
    dayKey,
    relativePath: normalizedPath,
    immutablePlanA,
    sourceBytes: input.length,
    sourceSha256: inputSha256,
    outputBytes: output.length,
    outputSha256: sha256Buffer(output),
    content: output,
    identityOverlay: Object.freeze({
      schema: P0C_P4_VALUE_IDENTITY_OVERLAY_SCHEMA,
      entryCount,
      changedFixtureIdCount,
      sourceArtifactRewritten: false,
      additiveOverlayEmbedded,
      alreadyAppliedOverlayValidated,
      idempotentPassThrough,
      suppressedSourceFixtureIdOmittedCount:
        omittedCount,
    }),
    invariants: Object.freeze({
      modelEvaluationPerformed: false,
      pickTruthChanged: false,
      marketTruthChanged: false,
      scoreTruthChanged: false,
      statusTruthChanged: false,
      settlementTruthChanged: false,
      sourceArtifactByteRewriteAuthorized: false,
      repositoryApplicationAuthorized: false,
    }),
  });
}

export function buildP0CP4ExistingValueArtifact({
  relativePath,
  family,
  sourceBytes,
  overlay,
} = {}) {
  const normalizedPath =
    normalizeRelativePath(relativePath);
  const normalizedFamily = clean(family);
  const dayKey = valueFamilyDay(
    normalizedPath,
    normalizedFamily,
  );
  const input = sourceBuffer(sourceBytes);
  const inputSha256 = sha256Buffer(input);
  const sourceDocument = parseJsonObject(
    input,
    normalizedPath,
  );

  if (
    !overlay ||
    typeof overlay.resolveEvidenceFixtureId !== "function"
  ) {
    throw new Error(
      "p0c_p4_value_artifact_overlay_invalid",
    );
  }

  if (IMMUTABLE_PLAN_A_PATTERN.test(normalizedPath)) {
    if (
      Object.hasOwn(
        sourceDocument,
        "productionIdentityOverlay",
      )
    ) {
      throw new Error(
        `p0c_p4_value_artifact_immutable_plan_a_overlay_forbidden:${normalizedPath}`,
      );
    }
    const entries = [];
    overlayValue(
      sourceDocument,
      { overlay, entries },
    );
    const changedEntries = entries.filter(
      row => row.changed,
    );
    if (changedEntries.length) {
      throw new Error(
        `p0c_p4_value_artifact_immutable_plan_a_rewrite_required:${normalizedPath}`,
      );
    }

    return resultEnvelope({
      normalizedFamily,
      dayKey,
      normalizedPath,
      immutablePlanA: true,
      input,
      inputSha256,
      output: input,
      entryCount: entries.length,
      changedFixtureIdCount: 0,
      additiveOverlayEmbedded: false,
    });
  }

  if (
    Object.hasOwn(
      sourceDocument,
      "productionIdentityOverlay",
    )
  ) {
    const validated = validateAppliedOverlay({
      sourceDocument,
      normalizedPath,
      normalizedFamily,
      dayKey,
      overlay,
    });
    return resultEnvelope({
      normalizedFamily,
      dayKey,
      normalizedPath,
      immutablePlanA: false,
      input,
      inputSha256,
      output: input,
      entryCount: validated.entryCount,
      changedFixtureIdCount:
        validated.changedFixtureIdCount,
      additiveOverlayEmbedded: true,
      alreadyAppliedOverlayValidated: true,
      idempotentPassThrough: true,
      omittedCount: validated.omittedCount,
    });
  }

  const entries = [];
  const view = overlayValue(
    sourceDocument,
    { overlay, entries },
  );
  const uniqueEntries = uniqueSortedEntries(entries);
  const changedEntries = uniqueEntries.filter(
    row => row.changed,
  );
  const outputEntries = uniqueEntries.map(
    redactChangedEntry,
  );

  const productionIdentityOverlay = {
    schema: P0C_P4_VALUE_IDENTITY_OVERLAY_SCHEMA,
    source: {
      relativePath: normalizedPath,
      sha256: inputSha256,
      rewritten: false,
    },
    dayKey,
    family: normalizedFamily,
    entryCount: outputEntries.length,
    changedFixtureIdCount: changedEntries.length,
    entries: outputEntries,
    invariants: {
      sourceArtifactRewritten: false,
      modelEvaluationPerformed: false,
      pickTruthChanged: false,
      marketTruthChanged: false,
      scoreTruthChanged: false,
      statusTruthChanged: false,
      settlementTruthChanged: false,
      fixtureMembershipCreated: false,
      repositoryApplicationAuthorized: false,
    },
  };

  if (changedEntries.length > 0) {
    productionIdentityOverlay
      .suppressedSourceFixtureIdOmission = {
        schema:
          P0C_P4_VALUE_SUPPRESSED_SOURCE_ID_OMISSION_SCHEMA,
        count: changedEntries.length,
        reason:
          "ZERO_SUPPRESSED_FIXTURE_ID_REFERENCES_IN_COMPOSED_OUTPUT",
        sourceArtifactBoundBySha256: true,
        identityOnly: true,
      };
  }

  const outputDocument = {
    ...view,
    productionIdentityOverlay,
  };

  const output = Buffer.from(
    `${JSON.stringify(outputDocument, null, 2)}\n`,
    "utf8",
  );

  return resultEnvelope({
    normalizedFamily,
    dayKey,
    normalizedPath,
    immutablePlanA: false,
    input,
    inputSha256,
    output,
    entryCount: outputEntries.length,
    changedFixtureIdCount: changedEntries.length,
    additiveOverlayEmbedded: true,
    omittedCount: changedEntries.length,
  });
}
