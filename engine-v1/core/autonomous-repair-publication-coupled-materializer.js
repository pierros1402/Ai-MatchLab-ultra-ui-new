import { createHash } from "node:crypto";

import {
  canonicalBufferSha256,
  validateDeploySnapshotManifest,
} from "./deploy-snapshot-release-contract.js";
import {
  P0C_P4_DEPLOY_SNAPSHOT_MANIFEST_REQUIRED_FAMILIES,
  buildP0CP4DeploySnapshotManifest,
} from "../jobs/p0c-p4-build-deploy-snapshot-manifest.js";
import {
  buildP0CP4DeploySnapshotFixturesFromArtifacts,
} from "../jobs/p0c-p4-build-deploy-snapshot-fixtures.js";
import {
  buildP0CP4DeploySnapshotDetails,
} from "../jobs/p0c-p4-build-deploy-snapshot-details.js";
import {
  buildPlanCShadowExportAudit,
  unavailablePlanCShadowDay,
  validatePlanCShadowDay,
} from "../value/plan-c-shadow-export.js";

export const AUTONOMOUS_REPAIR_PUBLICATION_COUPLED_MATERIAL_SCHEMA =
  "ai-matchlab.autonomous-repair-publication-coupled-material.v1";

export const AUTONOMOUS_REPAIR_PUBLICATION_COUPLED_MATERIAL_VERSION =
  "1.1.0";

export const AUTONOMOUS_REPAIR_PUBLICATION_PRODUCER_POLICY =
  Object.freeze({
    sourceDigestMode: "lf_normalized_sha256",
    producers: Object.freeze({
      fixtureUniverse: Object.freeze({
        contractId: "canonical-publication-fixture-universe-v1",
        sourcePath: "engine-v1/core/day-fixture-universe.js",
        normalizedSourceSha256:
          "15641b0d0fd91c27967a6af95ecf20b96e6dc74169571156f22f53c3e6d92f60",
      }),
      fixtures: Object.freeze({
        contractId: "p0c-p4-deploy-snapshot-fixtures-v1",
        sourcePath:
          "engine-v1/jobs/p0c-p4-build-deploy-snapshot-fixtures.js",
        normalizedSourceSha256:
          "94971cf7df8ed93b0e29aa3cb4a1f7deb0c3c9321c770d7bac8bbbbc34bc34d0",
      }),
      details: Object.freeze({
        contractId: "p0c-p4-deploy-snapshot-details-v1",
        sourcePath:
          "engine-v1/jobs/p0c-p4-build-deploy-snapshot-details.js",
        normalizedSourceSha256:
          "ad02d716813f046f1b8ea161a543417013db7361e709f1a60114b8fbfb5a0529",
      }),
      manifest: Object.freeze({
        contractId: "p0c-p4-deploy-snapshot-manifest-v1",
        sourcePath:
          "engine-v1/jobs/p0c-p4-build-deploy-snapshot-manifest.js",
        normalizedSourceSha256:
          "031e13a57e0f142ec8c5628baeadcd9c7e4d70d6f99ac82eee0fd57895a9919c",
      }),
      releaseContract: Object.freeze({
        contractId: "deploy-snapshot-release-contract-v2",
        sourcePath:
          "engine-v1/core/deploy-snapshot-release-contract.js",
        normalizedSourceSha256:
          "b8ed6d6fe2dc16dc8ed7cc4f59cd2b9b43f5feb0bac90886f97973e655a057b3",
      }),
      planC: Object.freeze({
        contractId: "plan-c-shadow-export-v1",
        sourcePath: "engine-v1/value/plan-c-shadow-export.js",
        normalizedSourceSha256:
          "ecc6f6ec91cc895b63fb7cba6a90532cb17c0782fb6b214eff235277d2b94581",
      }),
    }),
  });

const VALID_DAY = /^\d{4}-\d{2}-\d{2}$/u;
const VALID_SHA = /^[0-9a-f]{64}$/u;

function clean(value) {
  return String(value ?? "").trim();
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map(key => [key, stableValue(value[key])]),
    );
  }
  return value;
}

function sha256Value(value) {
  return sha256(Buffer.from(JSON.stringify(stableValue(value)), "utf8"));
}

function authority() {
  return {
    readOnly: true,
    filesystemWriteAuthorized: false,
    repairAuthorized: false,
    executionAuthorized: false,
    rollbackExecutionAuthorized: false,
    workflowMutationAuthorized: false,
    authorizationGranted: false,
  };
}

function assertZeroAuthority(value) {
  if (
    value?.readOnly !== true ||
    value?.filesystemWriteAuthorized !== false ||
    value?.repairAuthorized !== false ||
    value?.executionAuthorized !== false ||
    value?.rollbackExecutionAuthorized !== false ||
    value?.workflowMutationAuthorized !== false ||
    value?.authorizationGranted !== false
  ) {
    throw new Error(
      "autonomous_repair_publication_coupled_material_authority_invalid",
    );
  }
}

function exactInputBytes(value, label) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (typeof value === "string") return Buffer.from(value, "utf8");
  throw new Error(
    `autonomous_repair_publication_coupled_material_${label}_bytes_required`,
  );
}

function outputBytes(value, label) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (typeof value === "string") return Buffer.from(value, "utf8");
  if (value === undefined) {
    throw new Error(
      `autonomous_repair_publication_coupled_material_${label}_content_required`,
    );
  }
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function productionJsonBytes(value) {
  return Buffer.from(JSON.stringify(value, null, 2), "utf8");
}

function parseJsonObject(buffer, label) {
  let value;
  try {
    value = JSON.parse(buffer.toString("utf8"));
  } catch {
    throw new Error(
      `autonomous_repair_publication_coupled_material_${label}_json_invalid`,
    );
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(
      `autonomous_repair_publication_coupled_material_${label}_root_invalid`,
    );
  }
  return value;
}

function validTimestamp(value) {
  return Boolean(clean(value)) && Number.isFinite(Date.parse(value));
}

function normalizePath(value) {
  const text = clean(value).replaceAll("\\", "/");
  if (
    !text ||
    text.startsWith("/") ||
    /^[A-Za-z]:/u.test(text) ||
    text.split("/").includes("..") ||
    text.includes("//")
  ) {
    throw new Error(
      "autonomous_repair_publication_coupled_material_path_invalid",
    );
  }
  return text;
}

function forbiddenMutationPath(value) {
  const lower = normalizePath(value).toLowerCase();
  return (
    lower.endsWith("/value.json") ||
    lower.includes("/value-plans/") ||
    lower.endsWith("/latest.json")
  );
}

function immutableBinding(targetPath, buffer, role) {
  return Object.freeze({
    targetPath: normalizePath(targetPath),
    role,
    contentBase64: buffer.toString("base64"),
    contentSha256: sha256(buffer),
    contentBytes: buffer.length,
  });
}

function mutationFromOutput(row, role) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new Error(
      "autonomous_repair_publication_coupled_material_output_invalid",
    );
  }

  const targetPath = normalizePath(row.relativePath);
  if (forbiddenMutationPath(targetPath)) {
    throw new Error(
      `autonomous_repair_publication_coupled_material_mutation_forbidden:${targetPath}`,
    );
  }

  const action = clean(row.action || "write").toLowerCase();
  if (action === "delete") {
    return Object.freeze({
      targetPath,
      action,
      role,
      contentBase64: null,
      contentSha256: null,
      contentBytes: 0,
    });
  }
  if (action !== "write") {
    throw new Error(
      `autonomous_repair_publication_coupled_material_action_invalid:${action || "missing"}`,
    );
  }

  const buffer = outputBytes(row.content, role.toLowerCase());
  return Object.freeze({
    targetPath,
    action,
    role,
    contentBase64: buffer.toString("base64"),
    contentSha256: sha256(buffer),
    contentBytes: buffer.length,
  });
}

function mutationFromBuffer(targetPath, buffer, role) {
  return mutationFromOutput(
    {
      relativePath: targetPath,
      action: "write",
      content: buffer,
    },
    role,
  );
}

function materialBuffer(row, label) {
  if (row?.action === "delete") return null;
  if (clean(row?.action || "write").toLowerCase() !== "write") {
    throw new Error(
      `autonomous_repair_publication_coupled_material_${label}_action_invalid`,
    );
  }
  return outputBytes(row?.content, label);
}

function validateEncodedMaterial(row, allowDelete = false) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;
  let targetPath;
  try {
    targetPath = normalizePath(row.targetPath);
  } catch {
    return false;
  }
  if (targetPath !== row.targetPath) return false;

  if (row.action === "delete") {
    return (
      allowDelete &&
      row.contentBase64 === null &&
      row.contentSha256 === null &&
      row.contentBytes === 0
    );
  }

  if (row.action !== undefined && row.action !== "write") return false;
  if (typeof row.contentBase64 !== "string" || !row.contentBase64) return false;
  let buffer;
  try {
    buffer = Buffer.from(row.contentBase64, "base64");
  } catch {
    return false;
  }
  if (buffer.toString("base64") !== row.contentBase64) return false;
  return (
    Number.isSafeInteger(row.contentBytes) &&
    row.contentBytes === buffer.length &&
    VALID_SHA.test(clean(row.contentSha256).toLowerCase()) &&
    clean(row.contentSha256).toLowerCase() === sha256(buffer)
  );
}

function semanticBundle(artifact) {
  return {
    schema: artifact.schema,
    version: artifact.version,
    dayKey: artifact.dayKey,
    buildTimestamp: artifact.buildTimestamp,
    role: artifact.role,
    sourceManifest: artifact.sourceManifest,
    producerProof: artifact.producerProof,
    planC: artifact.planC,
    immutableBindings: artifact.immutableBindings.map(row => ({
      targetPath: row.targetPath,
      role: row.role,
      contentSha256: row.contentSha256,
      contentBytes: row.contentBytes,
    })),
    mutations: artifact.mutations.map(row => ({
      targetPath: row.targetPath,
      action: row.action,
      role: row.role,
      contentSha256: row.contentSha256,
      contentBytes: row.contentBytes,
    })),
    manifest: artifact.manifest,
    summary: artifact.summary,
    requiresTargetStateVerification: artifact.requiresTargetStateVerification,
    authority: artifact.authority,
  };
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function buildAutonomousRepairPublicationCoupledMaterialBundle({
  dayKey,
  sourceManifestBytes,
  fixtureUniverse,
  fixturesAll,
  detailInventoryPaths,
  sourceDetails = [],
  existingDeployDetails = [],
  preserveExistingDetails = true,
  overlay,
  valueBytes,
  valueAuditBytes = null,
  planCSourceBytes = null,
  planCSourceMissing = false,
  buildTimestamp,
  ...unsupportedInputs
} = {}) {
  const unsupportedNames = Object.keys(unsupportedInputs).sort();
  if (unsupportedNames.length > 0) {
    throw new Error(
      `autonomous_repair_publication_coupled_material_unsupported_input:${unsupportedNames.join(",")}`,
    );
  }

  const day = clean(dayKey);
  if (!VALID_DAY.test(day)) {
    throw new Error(
      "autonomous_repair_publication_coupled_material_day_invalid",
    );
  }
  if (!validTimestamp(buildTimestamp)) {
    throw new Error(
      "autonomous_repair_publication_coupled_material_build_timestamp_invalid",
    );
  }
  if (
    !fixtureUniverse ||
    typeof fixtureUniverse !== "object" ||
    Array.isArray(fixtureUniverse) ||
    fixtureUniverse.source !== "canonical_with_runtime_overlay" ||
    fixtureUniverse.snapshotRescuedCount !== 0 ||
    !Array.isArray(fixtureUniverse.fixtures)
  ) {
    throw new Error(
      "autonomous_repair_publication_coupled_material_fixture_universe_invalid",
    );
  }
  if (
    !Number.isInteger(fixtureUniverse.canonicalFixtureCount) ||
    fixtureUniverse.canonicalFixtureCount !== fixtureUniverse.fixtures.length
  ) {
    throw new Error(
      "autonomous_repair_publication_coupled_material_fixture_universe_count_invalid",
    );
  }
  if (
    !fixturesAll ||
    typeof fixturesAll !== "object" ||
    Array.isArray(fixturesAll) ||
    !Array.isArray(fixturesAll.matches)
  ) {
    throw new Error(
      "autonomous_repair_publication_coupled_material_fixtures_all_invalid",
    );
  }
  if (!Array.isArray(detailInventoryPaths)) {
    throw new Error(
      "autonomous_repair_publication_coupled_material_detail_inventory_required",
    );
  }
  if (!Array.isArray(sourceDetails) || !Array.isArray(existingDeployDetails)) {
    throw new Error(
      "autonomous_repair_publication_coupled_material_detail_sources_invalid",
    );
  }
  if (typeof preserveExistingDetails !== "boolean") {
    throw new Error(
      "autonomous_repair_publication_coupled_material_detail_preserve_flag_invalid",
    );
  }

  const fixturesDocument =
    buildP0CP4DeploySnapshotFixturesFromArtifacts({
      dayKey: day,
      fixtureUniverse,
      fixturesAll,
    });
  const fixturesOutput = {
    relativePath:
      `data/deploy-snapshots/${day}/fixtures.json`,
    action: "write",
    content: fixturesDocument,
  };

  const desiredDetailPaths = new Set(
    fixturesDocument.fixtures.map(row => {
      const canonicalId = clean(
        row?.canonicalId ||
        row?.matchId,
      );
      if (!canonicalId) {
        throw new Error(
          "autonomous_repair_publication_coupled_material_fixture_identity_missing",
        );
      }
      return `data/deploy-snapshots/${day}/details/${canonicalId}.json`;
    }),
  );
  const normalizedInventoryPaths =
    detailInventoryPaths.map(normalizePath);
  const inventoryPathSet =
    new Set(normalizedInventoryPaths);
  for (const targetPath of desiredDetailPaths) {
    if (!inventoryPathSet.has(targetPath)) {
      throw new Error(
        `autonomous_repair_publication_coupled_material_detail_inventory_missing_fixture:${targetPath}`,
      );
    }
  }
  for (const record of existingDeployDetails) {
    const existingPath = normalizePath(
      record?.path ||
      record?.relativePath,
    );
    if (!inventoryPathSet.has(existingPath)) {
      throw new Error(
        `autonomous_repair_publication_coupled_material_detail_inventory_missing_existing:${existingPath}`,
      );
    }
  }

  const detailsFamily =
    buildP0CP4DeploySnapshotDetails({
      dayKey: day,
      inventoryPaths:
        normalizedInventoryPaths,
      sourceDetails,
      existingDeployDetails,
      fixtureRows:
        fixturesDocument.fixtures,
      preserveExistingDetails,
      patchedAt:
        clean(buildTimestamp),
      identityOverlay:
        overlay || null,
    });
  if (
    detailsFamily?.ok !== true ||
    detailsFamily?.completeFamilyOutput !== true ||
    !Array.isArray(detailsFamily.outputs)
  ) {
    throw new Error(
      "autonomous_repair_publication_coupled_material_detail_family_incomplete",
    );
  }
  const detailOutputs =
    detailsFamily.outputs;

  const producerProof = Object.freeze({
    sourceDigestMode:
      AUTONOMOUS_REPAIR_PUBLICATION_PRODUCER_POLICY.sourceDigestMode,
    producerPolicyFingerprint:
      sha256Value(
        AUTONOMOUS_REPAIR_PUBLICATION_PRODUCER_POLICY,
      ),
    producers:
      AUTONOMOUS_REPAIR_PUBLICATION_PRODUCER_POLICY.producers,
    inputBindings: Object.freeze({
      fixtureUniverseSha256:
        sha256Value(fixtureUniverse),
      fixturesAllSha256:
        sha256Value(fixturesAll),
      detailInventoryPathsSha256:
        sha256Value(normalizedInventoryPaths),
      sourceDetailsSha256:
        sha256Value(sourceDetails),
      existingDeployDetailsSha256:
        sha256Value(existingDeployDetails),
      preserveExistingDetails,
      identityOverlayApplied:
        Boolean(overlay),
    }),
  });

  const sourceManifestBuffer = exactInputBytes(
    sourceManifestBytes,
    "source_manifest",
  );
  const sourceManifest = parseJsonObject(
    sourceManifestBuffer,
    "source_manifest",
  );
  if (clean(sourceManifest.date) !== day) {
    throw new Error(
      "autonomous_repair_publication_coupled_material_source_manifest_day_mismatch",
    );
  }

  const planCShadowName = clean(sourceManifest?.files?.planCShadow);
  const planCShadowAuditName = clean(sourceManifest?.files?.planCShadowAudit);
  const planCDeclared = Boolean(planCShadowName || planCShadowAuditName);
  if (Boolean(planCShadowName) !== Boolean(planCShadowAuditName)) {
    throw new Error(
      "autonomous_repair_publication_coupled_material_plan_c_pair_incomplete",
    );
  }
  if (
    planCDeclared &&
    (
      planCShadowName !== "plan-c-shadow.json" ||
      planCShadowAuditName !== "plan-c-shadow-audit.json"
    )
  ) {
    throw new Error(
      "autonomous_repair_publication_coupled_material_plan_c_file_name_invalid",
    );
  }

  const valueBuffer = exactInputBytes(valueBytes, "value");
  const valuePath = `data/deploy-snapshots/${day}/value.json`;
  const valueAuditName = clean(sourceManifest?.files?.valueAudit);
  if (valueAuditName && valueAuditName !== "value-audit.json") {
    throw new Error(
      "autonomous_repair_publication_coupled_material_value_audit_file_name_invalid",
    );
  }
  if (Boolean(valueAuditName) !== (valueAuditBytes !== null)) {
    throw new Error(
      "autonomous_repair_publication_coupled_material_value_audit_binding_mismatch",
    );
  }
  const valueAuditBuffer = valueAuditName
    ? exactInputBytes(valueAuditBytes, "value_audit")
    : null;

  if (!planCDeclared && (planCSourceMissing === true || planCSourceBytes !== null)) {
    throw new Error(
      "autonomous_repair_publication_coupled_material_plan_c_source_unexpected",
    );
  }
  if (planCDeclared && planCSourceMissing === true && planCSourceBytes !== null) {
    throw new Error(
      "autonomous_repair_publication_coupled_material_plan_c_source_ambiguous",
    );
  }
  if (planCDeclared && planCSourceMissing !== true && planCSourceBytes === null) {
    throw new Error(
      "autonomous_repair_publication_coupled_material_plan_c_source_required",
    );
  }

  let planCShadowOutput = null;
  let planCShadowAuditOutput = null;
  let planCMeta = Object.freeze({
    declared: false,
    sourceMissing: null,
    sourcePath: null,
    sourceSha256: null,
    available: null,
    count: 0,
    pickCount: 0,
    payloadSha256: null,
    auditSha256: null,
  });

  if (planCDeclared) {
    let loaded;
    if (planCSourceMissing === true) {
      loaded = {
        payload: unavailablePlanCShadowDay(day),
        sourceFile: null,
        sourceSha256: null,
        sourceMissing: true,
      };
    } else {
      const sourceBuffer = exactInputBytes(planCSourceBytes, "plan_c_source");
      const sourcePayload = parseJsonObject(sourceBuffer, "plan_c_source");
      const validation = validatePlanCShadowDay(sourcePayload, day);
      if (!validation.ok) {
        throw new Error(
          `autonomous_repair_publication_coupled_material_plan_c_source_invalid:${validation.errors.join(",")}`,
        );
      }
      loaded = {
        payload: sourcePayload,
        sourceFile: null,
        sourceSha256: sha256(sourceBuffer),
        sourceMissing: false,
      };
    }

    const audit = buildPlanCShadowExportAudit(
      day,
      loaded,
      clean(buildTimestamp),
    );
    const payloadBuffer = productionJsonBytes(loaded.payload);
    const auditBuffer = productionJsonBytes(audit);

    planCShadowOutput = {
      relativePath: `data/deploy-snapshots/${day}/plan-c-shadow.json`,
      action: "write",
      content: payloadBuffer,
    };
    planCShadowAuditOutput = {
      relativePath: `data/deploy-snapshots/${day}/plan-c-shadow-audit.json`,
      action: "write",
      content: auditBuffer,
    };
    planCMeta = Object.freeze({
      declared: true,
      sourceMissing: loaded.sourceMissing,
      sourcePath: `data/plan-c-shadow/${day}.json`,
      sourceSha256: loaded.sourceSha256,
      available: loaded.payload.available === true,
      count: Number(loaded.payload.count || 0),
      pickCount: Number(loaded.payload.pickCount || 0),
      payloadSha256: sha256(payloadBuffer),
      auditSha256: sha256(auditBuffer),
    });
  }

  const manifestPath = `data/deploy-snapshots/${day}/manifest.json`;
  const valueOutput = {
    relativePath: valuePath,
    action: "write",
    content: valueBuffer,
  };
  const valueAuditOutput = valueAuditBuffer
    ? {
        relativePath: `data/deploy-snapshots/${day}/value-audit.json`,
        action: "write",
        content: valueAuditBuffer,
      }
    : null;

  const manifestResult = buildP0CP4DeploySnapshotManifest({
    relativePath: manifestPath,
    dayKey: day,
    sourceManifestBytes: sourceManifestBuffer,
    fixedOutputSetComplete: true,
    fixedOutputFamilies: [
      ...P0C_P4_DEPLOY_SNAPSHOT_MANIFEST_REQUIRED_FAMILIES,
    ],
    fixturesOutput,
    valueOutput,
    valueAuditOutput,
    planCShadowOutput,
    planCShadowAuditOutput,
    detailOutputs,
    completeDayDetailSet: true,
    overlay,
    buildTimestamp: clean(buildTimestamp),
  });

  const immutableBindings = [
    immutableBinding(valuePath, valueBuffer, "IMMUTABLE_FROZEN_VALUE"),
    ...(valueAuditBuffer
      ? [
          immutableBinding(
            `data/deploy-snapshots/${day}/value-audit.json`,
            valueAuditBuffer,
            "IMMUTABLE_VALUE_AUDIT_BINDING",
          ),
        ]
      : []),
  ].sort((left, right) => left.targetPath.localeCompare(right.targetPath));

  const mutations = [
    mutationFromOutput(fixturesOutput, "DERIVED_FIXTURES"),
    ...detailOutputs.map(row =>
      mutationFromOutput(row, "DERIVED_DETAIL"),
    ),
    ...(planCShadowOutput
      ? [mutationFromOutput(planCShadowOutput, "DERIVED_PLAN_C_SHADOW")]
      : []),
    ...(planCShadowAuditOutput
      ? [
          mutationFromOutput(
            planCShadowAuditOutput,
            "DERIVED_PLAN_C_SHADOW_AUDIT",
          ),
        ]
      : []),
    mutationFromBuffer(
      manifestPath,
      manifestResult.content,
      "DERIVED_MANIFEST",
    ),
  ].sort((left, right) =>
    `${left.targetPath}\u0000${left.action}`.localeCompare(
      `${right.targetPath}\u0000${right.action}`,
    ),
  );

  const pathSet = new Set();
  for (const row of [...immutableBindings, ...mutations]) {
    if (pathSet.has(row.targetPath)) {
      throw new Error(
        `autonomous_repair_publication_coupled_material_target_duplicate:${row.targetPath}`,
      );
    }
    pathSet.add(row.targetPath);
  }

  const manifestMutation = mutations.find(
    row => row.targetPath === manifestPath && row.action === "write",
  );
  const summary = Object.freeze({
    mutationCount: mutations.length,
    writeCount: mutations.filter(row => row.action === "write").length,
    deleteCount: mutations.filter(row => row.action === "delete").length,
    immutableBindingCount: immutableBindings.length,
    detailMutationCount: mutations.filter(row => row.role === "DERIVED_DETAIL").length,
    planCDeclared,
  });

  const artifact = {
    schema: AUTONOMOUS_REPAIR_PUBLICATION_COUPLED_MATERIAL_SCHEMA,
    version: AUTONOMOUS_REPAIR_PUBLICATION_COUPLED_MATERIAL_VERSION,
    dayKey: day,
    buildTimestamp: clean(buildTimestamp),
    role: "derived_read_only_publication_coupled_material_bundle",
    sourceManifest: Object.freeze({
      contentSha256: sha256(sourceManifestBuffer),
      contentBytes: sourceManifestBuffer.length,
    }),
    producerProof,
    planC: planCMeta,
    immutableBindings: Object.freeze(immutableBindings),
    mutations: Object.freeze(mutations),
    manifest: Object.freeze({
      targetPath: manifestPath,
      manifestHash: manifestResult.manifestHash,
      contentSha256: manifestMutation.contentSha256,
      contentBytes: manifestMutation.contentBytes,
    }),
    summary,
    requiresTargetStateVerification: true,
    bundleFingerprint: "",
    authority: Object.freeze(authority()),
  };

  artifact.bundleFingerprint = sha256Value(semanticBundle(artifact));
  Object.freeze(artifact);

  const validation = validateAutonomousRepairPublicationCoupledMaterialBundle(
    artifact,
  );
  if (!validation.ok) {
    throw new Error(
      `autonomous_repair_publication_coupled_material_self_validation_failed:${validation.errors.join(",")}`,
    );
  }

  return artifact;
}

export function validateAutonomousRepairPublicationCoupledMaterialBundle(
  artifact,
) {
  const errors = [];
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    return { ok: false, errors: ["artifact_invalid"] };
  }
  if (artifact.schema !== AUTONOMOUS_REPAIR_PUBLICATION_COUPLED_MATERIAL_SCHEMA) {
    errors.push("schema_invalid");
  }
  if (artifact.version !== AUTONOMOUS_REPAIR_PUBLICATION_COUPLED_MATERIAL_VERSION) {
    errors.push("version_invalid");
  }
  if (!VALID_DAY.test(clean(artifact.dayKey))) errors.push("day_invalid");
  if (!validTimestamp(artifact.buildTimestamp)) errors.push("build_timestamp_invalid");
  if (artifact.role !== "derived_read_only_publication_coupled_material_bundle") {
    errors.push("role_invalid");
  }

  const expectedProducerPolicyFingerprint =
    sha256Value(
      AUTONOMOUS_REPAIR_PUBLICATION_PRODUCER_POLICY,
    );
  if (
    artifact?.producerProof?.sourceDigestMode !==
      AUTONOMOUS_REPAIR_PUBLICATION_PRODUCER_POLICY.sourceDigestMode ||
    artifact?.producerProof?.producerPolicyFingerprint !==
      expectedProducerPolicyFingerprint ||
    JSON.stringify(artifact?.producerProof?.producers) !==
      JSON.stringify(
        AUTONOMOUS_REPAIR_PUBLICATION_PRODUCER_POLICY.producers,
      ) ||
    !artifact?.producerProof?.inputBindings ||
    typeof artifact.producerProof.inputBindings !== "object" ||
    Array.isArray(artifact.producerProof.inputBindings)
  ) {
    errors.push("producer_proof_invalid");
  } else {
    const inputBindings =
      artifact.producerProof.inputBindings;
    const shaFields = [
      "fixtureUniverseSha256",
      "fixturesAllSha256",
      "detailInventoryPathsSha256",
      "sourceDetailsSha256",
      "existingDeployDetailsSha256",
    ];
    if (
      shaFields.some(
        key =>
          !VALID_SHA.test(
            clean(inputBindings[key]).toLowerCase(),
          ),
      ) ||
      typeof inputBindings.preserveExistingDetails !== "boolean" ||
      typeof inputBindings.identityOverlayApplied !== "boolean" ||
      Object.keys(inputBindings).sort().join(",") !==
        [
          "detailInventoryPathsSha256",
          "existingDeployDetailsSha256",
          "fixtureUniverseSha256",
          "fixturesAllSha256",
          "identityOverlayApplied",
          "preserveExistingDetails",
          "sourceDetailsSha256",
        ].sort().join(",")
    ) {
      errors.push("producer_input_bindings_invalid");
    }
  }

  try {
    assertZeroAuthority(artifact.authority);
  } catch {
    errors.push("authority_invalid");
  }
  if (artifact.requiresTargetStateVerification !== true) {
    errors.push("target_state_verification_requirement_invalid");
  }

  const bindings = Array.isArray(artifact.immutableBindings)
    ? artifact.immutableBindings
    : [];
  const mutations = Array.isArray(artifact.mutations) ? artifact.mutations : [];
  if (!Array.isArray(artifact.immutableBindings)) errors.push("bindings_invalid");
  if (!Array.isArray(artifact.mutations)) errors.push("mutations_invalid");

  const allPaths = new Set();
  for (const row of bindings) {
    if (!validateEncodedMaterial(row, false)) errors.push("binding_material_invalid");
    if (!clean(row.role).startsWith("IMMUTABLE_")) errors.push("binding_role_invalid");
    if (allPaths.has(row.targetPath)) errors.push("target_duplicate");
    allPaths.add(row.targetPath);
  }
  for (const row of mutations) {
    if (!validateEncodedMaterial(row, true)) errors.push("mutation_material_invalid");
    try {
      if (forbiddenMutationPath(row.targetPath)) errors.push("mutation_forbidden");
    } catch {
      errors.push("mutation_path_invalid");
    }
    if (allPaths.has(row.targetPath)) errors.push("target_duplicate");
    allPaths.add(row.targetPath);
  }

  const valuePath = `data/deploy-snapshots/${clean(artifact.dayKey)}/value.json`;
  const valueBinding = bindings.find(row => row.targetPath === valuePath);
  if (!valueBinding || valueBinding.role !== "IMMUTABLE_FROZEN_VALUE") {
    errors.push("frozen_value_binding_missing");
  }

  const manifestPath = `data/deploy-snapshots/${clean(artifact.dayKey)}/manifest.json`;
  const manifestMutation = mutations.find(
    row => row.targetPath === manifestPath && row.action === "write",
  );
  let manifestDocument = null;
  if (!manifestMutation) {
    errors.push("manifest_mutation_missing");
  } else {
    try {
      manifestDocument = JSON.parse(
        Buffer.from(manifestMutation.contentBase64, "base64").toString("utf8"),
      );
      const manifestValidation = validateDeploySnapshotManifest(
        manifestDocument,
        clean(artifact.dayKey),
      );
      if (!manifestValidation.ok) errors.push("manifest_validation_failed");
      if (manifestDocument.hash !== artifact?.manifest?.manifestHash) {
        errors.push("manifest_hash_binding_mismatch");
      }
      if (manifestMutation.contentSha256 !== artifact?.manifest?.contentSha256) {
        errors.push("manifest_content_hash_binding_mismatch");
      }
    } catch {
      errors.push("manifest_material_invalid");
    }
  }

  if (manifestDocument && valueBinding) {
    const valueBuffer = Buffer.from(valueBinding.contentBase64, "base64");
    if (
      manifestDocument?.fileHashes?.["value.json"] !==
      canonicalBufferSha256(valueBuffer)
    ) {
      errors.push("frozen_value_manifest_hash_mismatch");
    }
  }

  const valueAuditPath = `data/deploy-snapshots/${clean(artifact.dayKey)}/value-audit.json`;
  const valueAuditBinding = bindings.find(row => row.targetPath === valueAuditPath);
  if (manifestDocument?.files?.valueAudit) {
    if (!valueAuditBinding) {
      errors.push("value_audit_binding_missing");
    } else if (
      manifestDocument.fileHashes?.["value-audit.json"] !==
      canonicalBufferSha256(Buffer.from(valueAuditBinding.contentBase64, "base64"))
    ) {
      errors.push("value_audit_manifest_hash_mismatch");
    }
  } else if (valueAuditBinding) {
    errors.push("value_audit_binding_unexpected");
  }

  if (artifact?.planC?.declared === true) {
    const shadowPath = `data/deploy-snapshots/${clean(artifact.dayKey)}/plan-c-shadow.json`;
    const auditPath = `data/deploy-snapshots/${clean(artifact.dayKey)}/plan-c-shadow-audit.json`;
    const shadow = mutations.find(row => row.targetPath === shadowPath && row.action === "write");
    const audit = mutations.find(row => row.targetPath === auditPath && row.action === "write");
    if (!shadow || !audit) {
      errors.push("plan_c_pair_missing");
    } else if (manifestDocument) {
      if (
        manifestDocument.fileHashes?.["plan-c-shadow.json"] !==
        canonicalBufferSha256(Buffer.from(shadow.contentBase64, "base64")) ||
        manifestDocument.fileHashes?.["plan-c-shadow-audit.json"] !==
        canonicalBufferSha256(Buffer.from(audit.contentBase64, "base64"))
      ) {
        errors.push("plan_c_manifest_hash_mismatch");
      }
      if (
        Number(manifestDocument.counts?.planCShadowPredictions || 0) !==
          Number(artifact.planC.count || 0) ||
        Number(manifestDocument.counts?.planCShadowPicks || 0) !==
          Number(artifact.planC.pickCount || 0)
      ) {
        errors.push("plan_c_manifest_count_mismatch");
      }
    }
  } else if (
    mutations.some(row =>
      row.targetPath.endsWith("/plan-c-shadow.json") ||
      row.targetPath.endsWith("/plan-c-shadow-audit.json"),
    )
  ) {
    errors.push("plan_c_mutation_unexpected");
  }

  if (
    mutations.some(row => row.targetPath.endsWith("/latest.json")) ||
    bindings.some(row => row.targetPath.endsWith("/latest.json"))
  ) {
    errors.push("latest_pointer_forbidden");
  }

  const expectedSummary = {
    mutationCount: mutations.length,
    writeCount: mutations.filter(row => row.action === "write").length,
    deleteCount: mutations.filter(row => row.action === "delete").length,
    immutableBindingCount: bindings.length,
    detailMutationCount: mutations.filter(row => row.role === "DERIVED_DETAIL").length,
    planCDeclared: artifact?.planC?.declared === true,
  };
  if (JSON.stringify(artifact.summary) !== JSON.stringify(expectedSummary)) {
    errors.push("summary_mismatch");
  }

  if (!VALID_SHA.test(clean(artifact.bundleFingerprint).toLowerCase())) {
    errors.push("bundle_fingerprint_invalid");
  } else if (
    clean(artifact.bundleFingerprint).toLowerCase() !==
    sha256Value(semanticBundle(artifact))
  ) {
    errors.push("bundle_fingerprint_mismatch");
  }

  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

export function cloneAutonomousRepairPublicationCoupledMaterialBundle(artifact) {
  const validation = validateAutonomousRepairPublicationCoupledMaterialBundle(
    artifact,
  );
  if (!validation.ok) {
    throw new Error(
      `autonomous_repair_publication_coupled_material_clone_invalid:${validation.errors.join(",")}`,
    );
  }
  return clone(artifact);
}
