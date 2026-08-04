import crypto from "node:crypto";
export const P0C_P4_EXISTING_VALUE_ARTIFACT_SCHEMA =
  "ai-matchlab.p0c-p4-existing-value-artifact.v1";

export const P0C_P4_VALUE_IDENTITY_OVERLAY_SCHEMA =
  "ai-matchlab.p0c-p4-value-identity-overlay.v1";

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

function normalizedEntryKey(row) {
  return [
    row.jsonPointer,
    row.sourceFixtureId,
    row.resolvedFixtureId,
  ].join("\u0000");
}

function uniqueSortedEntries(entries) {
  const byKey = new Map();
  for (const row of entries) {
    const key = normalizedEntryKey(row);
    if (!byKey.has(key)) byKey.set(key, row);
  }
  return [...byKey.values()].sort((left, right) =>
    left.jsonPointer.localeCompare(right.jsonPointer) ||
    left.sourceFixtureId.localeCompare(
      right.sourceFixtureId,
    ),
  );
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

    return Object.freeze({
      schema: P0C_P4_EXISTING_VALUE_ARTIFACT_SCHEMA,
      ok: true,
      family: normalizedFamily,
      dayKey,
      relativePath: normalizedPath,
      immutablePlanA: true,
      sourceBytes: input.length,
      sourceSha256: inputSha256,
      outputBytes: input.length,
      outputSha256: inputSha256,
      content: input,
      identityOverlay: Object.freeze({
        schema: P0C_P4_VALUE_IDENTITY_OVERLAY_SCHEMA,
        entryCount: entries.length,
        changedFixtureIdCount: 0,
        sourceArtifactRewritten: false,
        additiveOverlayEmbedded: false,
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

  if (
    Object.hasOwn(
      sourceDocument,
      "productionIdentityOverlay",
    )
  ) {
    throw new Error(
      `p0c_p4_value_artifact_existing_overlay_forbidden:${normalizedPath}`,
    );
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

  const outputDocument = {
    ...view,
    productionIdentityOverlay: {
      schema: P0C_P4_VALUE_IDENTITY_OVERLAY_SCHEMA,
      source: {
        relativePath: normalizedPath,
        sha256: inputSha256,
        rewritten: false,
      },
      dayKey,
      family: normalizedFamily,
      entryCount: uniqueEntries.length,
      changedFixtureIdCount: changedEntries.length,
      entries: uniqueEntries,
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
    },
  };

  const output = Buffer.from(
    `${JSON.stringify(outputDocument, null, 2)}\n`,
    "utf8",
  );

  return Object.freeze({
    schema: P0C_P4_EXISTING_VALUE_ARTIFACT_SCHEMA,
    ok: true,
    family: normalizedFamily,
    dayKey,
    relativePath: normalizedPath,
    immutablePlanA: false,
    sourceBytes: input.length,
    sourceSha256: inputSha256,
    outputBytes: output.length,
    outputSha256: sha256Buffer(output),
    content: output,
    identityOverlay: Object.freeze({
      schema: P0C_P4_VALUE_IDENTITY_OVERLAY_SCHEMA,
      entryCount: uniqueEntries.length,
      changedFixtureIdCount: changedEntries.length,
      sourceArtifactRewritten: false,
      additiveOverlayEmbedded: true,
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
