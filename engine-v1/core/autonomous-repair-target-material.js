import {
  createHash
} from "node:crypto";

export const AUTONOMOUS_REPAIR_TARGET_MATERIAL_SCHEMA =
  "ai-matchlab.autonomous-repair-target-material.v1";

export const AUTONOMOUS_REPAIR_TARGET_MATERIAL_VERSION =
  "1.0.0";

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

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (
    value &&
    typeof value ===
      "object"
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

function sha256Buffer(value) {
  return createHash("sha256")
    .update(value)
    .digest("hex");
}

function validSha(value) {
  return VALID_SHA.test(
    clean(value)
  );
}

function compareSources(a, b) {
  return [
    a.ref,
    a.sha256,
    String(a.bytes)
  ]
    .join("\u0000")
    .localeCompare(
      [
        b.ref,
        b.sha256,
        String(b.bytes)
      ].join("\u0000")
    );
}

function compareMaterials(a, b) {
  return [
    a.candidateDecisionId,
    a.targetPath,
    a.repairClass,
    a.canonicalId
  ]
    .join("\u0000")
    .localeCompare(
      [
        b.candidateDecisionId,
        b.targetPath,
        b.repairClass,
        b.canonicalId
      ].join("\u0000")
    );
}

function normalizeSource(source) {
  const ref =
    clean(source?.ref);

  const sha256 =
    clean(source?.sha256)
      .toLowerCase();

  const bytes =
    Number(source?.bytes);

  if (!ref) {
    throw new Error(
      "autonomous_repair_target_material_source_ref_required"
    );
  }

  if (!validSha(sha256)) {
    throw new Error(
      "autonomous_repair_target_material_source_sha256_invalid"
    );
  }

  if (
    !Number.isSafeInteger(bytes) ||
    bytes < 0
  ) {
    throw new Error(
      "autonomous_repair_target_material_source_bytes_invalid"
    );
  }

  return {
    ref,
    sha256,
    bytes
  };
}

function normalizeContentBase64(value) {
  const base64 =
    clean(value);

  if (!base64) {
    throw new Error(
      "autonomous_repair_target_material_content_required"
    );
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
    throw new Error(
      "autonomous_repair_target_material_content_base64_invalid"
    );
  }

  if (
    buffer.length === 0 ||
    buffer.toString("base64") !==
      base64
  ) {
    throw new Error(
      "autonomous_repair_target_material_content_base64_invalid"
    );
  }

  return {
    base64,
    buffer
  };
}

function materialFingerprintInput(
  material
) {
  return {
    candidateDecisionId:
      material.candidateDecisionId,

    repairClass:
      material.repairClass,

    canonicalId:
      material.canonicalId,

    targetPath:
      material.targetPath,

    sources:
      material.sources,

    provenanceFingerprint:
      material.provenanceFingerprint,

    contentEncoding:
      material.contentEncoding,

    contentSha256:
      material.contentSha256,

    contentBytes:
      material.contentBytes,

    contentBase64:
      material.contentBase64
  };
}

function catalogFingerprintInput(
  catalog
) {
  return {
    schema:
      catalog.schema,

    version:
      catalog.version,

    dayKey:
      catalog.dayKey,

    role:
      catalog.role,

    summary:
      catalog.summary,

    materials:
      catalog.materials,

    authority:
      catalog.authority
  };
}

function emptyAuthority() {
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

function normalizeInputMaterial(
  material
) {
  const candidateDecisionId =
    clean(
      material?.candidateDecisionId
    );

  const repairClass =
    clean(
      material?.repairClass
    );

  const canonicalId =
    clean(
      material?.canonicalId
    );

  const targetPath =
    clean(
      material?.targetPath
    )
      .replaceAll("\\", "/");

  if (
    !VALID_CANDIDATE_ID.test(
      candidateDecisionId
    )
  ) {
    throw new Error(
      "autonomous_repair_target_material_candidate_id_invalid"
    );
  }

  if (
    !REPAIR_CLASSES.has(
      repairClass
    )
  ) {
    throw new Error(
      "autonomous_repair_target_material_repair_class_invalid"
    );
  }

  if (!canonicalId) {
    throw new Error(
      "autonomous_repair_target_material_canonical_id_required"
    );
  }

  if (
    !targetPath ||
    targetPath.startsWith("/") ||
    /^[a-zA-Z]:\//u.test(
      targetPath
    ) ||
    targetPath
      .split("/")
      .some(
        component =>
          component ===
            ".." ||
          component ===
            "." ||
          component ===
            ""
      )
  ) {
    throw new Error(
      "autonomous_repair_target_material_target_path_invalid"
    );
  }

  if (
    !Array.isArray(
      material?.sources
    ) ||
    material.sources.length ===
      0
  ) {
    throw new Error(
      "autonomous_repair_target_material_sources_required"
    );
  }

  const sources =
    material.sources
      .map(normalizeSource)
      .sort(compareSources);

  for (
    let index = 1;
    index < sources.length;
    index += 1
  ) {
    if (
      sources[index - 1].ref ===
        sources[index].ref
    ) {
      throw new Error(
        "autonomous_repair_target_material_duplicate_source_ref"
      );
    }
  }

  const {
    base64,
    buffer
  } =
    normalizeContentBase64(
      material?.contentBase64
    );

  const contentSha256 =
    sha256Buffer(buffer);

  const contentBytes =
    buffer.length;

  const provenanceFingerprint =
    sha256Value(sources);

  const normalized = {
    candidateDecisionId,
    repairClass,
    canonicalId,
    targetPath,
    sources,
    provenanceFingerprint,
    contentEncoding:
      "base64",
    contentSha256,
    contentBytes,
    contentBase64:
      base64
  };

  return {
    ...normalized,

    materialFingerprint:
      sha256Value(
        materialFingerprintInput(
          normalized
        )
      )
  };
}

export function buildAutonomousRepairTargetMaterialCatalog({
  dayKey,
  materials = [],
  generatedAt =
    new Date().toISOString()
} = {}) {
  const normalizedDay =
    clean(dayKey);

  const timestamp =
    clean(generatedAt);

  if (
    !VALID_DAY.test(
      normalizedDay
    )
  ) {
    throw new Error(
      "autonomous_repair_target_material_valid_day_required"
    );
  }

  if (!timestamp) {
    throw new Error(
      "autonomous_repair_target_material_generated_at_required"
    );
  }

  if (
    !Array.isArray(
      materials
    )
  ) {
    throw new Error(
      "autonomous_repair_target_material_materials_array_required"
    );
  }

  const normalizedMaterials =
    materials
      .map(
        normalizeInputMaterial
      )
      .sort(
        compareMaterials
      );

  const candidateIds =
    new Set();

  const targetPaths =
    new Set();

  for (
    const material of
      normalizedMaterials
  ) {
    if (
      candidateIds.has(
        material.candidateDecisionId
      )
    ) {
      throw new Error(
        "autonomous_repair_target_material_duplicate_candidate_id"
      );
    }

    if (
      targetPaths.has(
        material.targetPath
      )
    ) {
      throw new Error(
        "autonomous_repair_target_material_duplicate_target_path"
      );
    }

    candidateIds.add(
      material.candidateDecisionId
    );

    targetPaths.add(
      material.targetPath
    );
  }

  const summary = {
    materialCount:
      normalizedMaterials.length,

    totalContentBytes:
      normalizedMaterials.reduce(
        (
          total,
          material
        ) =>
          total +
          material.contentBytes,
        0
      )
  };

  const authority =
    emptyAuthority();

  const core = {
    schema:
      AUTONOMOUS_REPAIR_TARGET_MATERIAL_SCHEMA,

    version:
      AUTONOMOUS_REPAIR_TARGET_MATERIAL_VERSION,

    dayKey:
      normalizedDay,

    role:
      "derived_read_only_target_material_catalog",

    summary,
    materials:
      normalizedMaterials,
    authority
  };

  return {
    schema:
      core.schema,

    version:
      core.version,

    dayKey:
      core.dayKey,

    generatedAt:
      timestamp,

    role:
      core.role,

    catalogFingerprint:
      sha256Value(
        catalogFingerprintInput(
          core
        )
      ),

    summary:
      core.summary,

    materials:
      core.materials,

    authority:
      core.authority
  };
}

export function validateAutonomousRepairTargetMaterialCatalog(
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
      AUTONOMOUS_REPAIR_TARGET_MATERIAL_SCHEMA ||
    artifact.version !==
      AUTONOMOUS_REPAIR_TARGET_MATERIAL_VERSION ||
    artifact.role !==
      "derived_read_only_target_material_catalog" ||
    !VALID_DAY.test(
      clean(
        artifact.dayKey
      )
    ) ||
    !clean(
      artifact.generatedAt
    ) ||
    !Array.isArray(
      artifact.materials
    )
  ) {
    throw new Error(
      "autonomous_repair_target_material_artifact_invalid"
    );
  }

  const rebuilt =
    buildAutonomousRepairTargetMaterialCatalog({
      dayKey:
        artifact.dayKey,

      materials:
        artifact.materials,

      generatedAt:
        artifact.generatedAt
    });

  if (
    JSON.stringify(
      stableValue(
        rebuilt.summary
      )
    ) !==
    JSON.stringify(
      stableValue(
        artifact.summary
      )
    )
  ) {
    throw new Error(
      "autonomous_repair_target_material_summary_mismatch"
    );
  }

  if (
    JSON.stringify(
      stableValue(
        rebuilt.materials
      )
    ) !==
    JSON.stringify(
      stableValue(
        artifact.materials
      )
    )
  ) {
    throw new Error(
      "autonomous_repair_target_material_materials_mismatch"
    );
  }

  const expectedAuthority =
    emptyAuthority();

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
      "autonomous_repair_target_material_authority_mismatch"
    );
  }

  const fingerprintCore = {
    schema:
      artifact.schema,

    version:
      artifact.version,

    dayKey:
      artifact.dayKey,

    role:
      artifact.role,

    summary:
      artifact.summary,

    materials:
      artifact.materials,

    authority:
      artifact.authority
  };

  if (
    sha256Value(
      catalogFingerprintInput(
        fingerprintCore
      )
    ) !==
    artifact.catalogFingerprint
  ) {
    throw new Error(
      "autonomous_repair_target_material_catalog_fingerprint_mismatch"
    );
  }

  return true;
}

export function deriveAutonomousRepairTargetsByDecisionId({
  catalog,
  targetStatesByDecisionId = {}
} = {}) {
  validateAutonomousRepairTargetMaterialCatalog(
    catalog
  );

  if (
    !targetStatesByDecisionId ||
    typeof targetStatesByDecisionId !==
      "object" ||
    Array.isArray(
      targetStatesByDecisionId
    )
  ) {
    throw new Error(
      "autonomous_repair_target_material_target_states_invalid"
    );
  }

  const materialIds =
    catalog.materials
      .map(
        material =>
          material.candidateDecisionId
      )
      .sort();

  const stateIds =
    Object.keys(
      targetStatesByDecisionId
    )
      .sort();

  if (
    JSON.stringify(
      materialIds
    ) !==
    JSON.stringify(
      stateIds
    )
  ) {
    throw new Error(
      "autonomous_repair_target_material_target_state_keyset_mismatch"
    );
  }

  const result =
    {};

  for (
    const material of
      catalog.materials
  ) {
    const state =
      targetStatesByDecisionId[
        material.candidateDecisionId
      ];

    if (
      !state ||
      typeof state !==
        "object" ||
      Array.isArray(
        state
      )
    ) {
      throw new Error(
        "autonomous_repair_target_material_target_state_invalid"
      );
    }

    const targetExists =
      state.targetExists ===
        true;

    const currentSha256 =
      state.currentSha256 ===
        null ||
      state.currentSha256 ===
        undefined
        ? null
        : clean(
            state.currentSha256
          ).toLowerCase();

    if (
      targetExists &&
      !validSha(
        currentSha256
      )
    ) {
      throw new Error(
        "autonomous_repair_target_material_existing_target_sha_required"
      );
    }

    if (
      !targetExists &&
      currentSha256 !==
        null
    ) {
      throw new Error(
        "autonomous_repair_target_material_absent_target_sha_forbidden"
      );
    }

    result[
      material.candidateDecisionId
    ] = {
      targetPath:
        material.targetPath,

      targetExists,

      currentSha256,

      plannedContentSha256:
        material.contentSha256,

      plannedContentBytes:
        material.contentBytes
    };
  }

  return result;
}

export function materialContentBuffer(
  material
) {
  const normalized =
    normalizeInputMaterial(
      material
    );

  return Buffer.from(
    normalized.contentBase64,
    "base64"
  );
}
