import {
  P0C_P4_DEPLOY_SNAPSHOT_MANIFEST_SCHEMA,
  buildP0CP4DeploySnapshotManifest,
} from "./p0c-p4-build-deploy-snapshot-manifest.js";

export const P0C_P4_DEPLOY_SNAPSHOT_MANIFEST_ADAPTER_SCHEMA =
  "ai-matchlab.p0c-p4-deploy-snapshot-manifest-adapter.v1";

export const P0C_P4_DEPLOY_SNAPSHOT_MANIFEST_FAMILY =
  "DEPLOY_SNAPSHOT_MANIFEST";

const MANIFEST_PATTERN =
  /^data\/deploy-snapshots\/(\d{4}-\d{2}-\d{2})\/manifest\.json$/u;

function clean(value) {
  return String(value ?? "").trim();
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
      "p0c_p4_deploy_manifest_adapter_path_invalid",
    );
  }
  return text;
}

function functionRequired(value, name) {
  if (typeof value !== "function") {
    throw new Error(
      `p0c_p4_deploy_manifest_adapter_function_required:${name}`,
    );
  }
  return value;
}

function normalizedContext(context) {
  if (!context || typeof context !== "object") {
    throw new Error(
      "p0c_p4_deploy_manifest_adapter_context_required",
    );
  }
  if (context.applicationAuthorized !== false) {
    throw new Error(
      "p0c_p4_deploy_manifest_adapter_application_forbidden",
    );
  }
  if (
    clean(context.family) !==
    P0C_P4_DEPLOY_SNAPSHOT_MANIFEST_FAMILY
  ) {
    throw new Error(
      "p0c_p4_deploy_manifest_adapter_family_mismatch",
    );
  }
  if (
    !Array.isArray(context.inventoryRows) ||
    !Array.isArray(context.inventoryPaths) ||
    context.inventoryRows.length !==
      context.inventoryPaths.length
  ) {
    throw new Error(
      "p0c_p4_deploy_manifest_adapter_inventory_required",
    );
  }

  const paths = new Set();
  const rows = context.inventoryRows.map((source, index) => {
    if (!source || typeof source !== "object") {
      throw new Error(
        `p0c_p4_deploy_manifest_adapter_inventory_row_invalid:${index}`,
      );
    }
    const relativePath = normalizeRelativePath(
      source.file,
    );
    if (
      clean(source.rebuildFamily) !==
      P0C_P4_DEPLOY_SNAPSHOT_MANIFEST_FAMILY
    ) {
      throw new Error(
        `p0c_p4_deploy_manifest_adapter_inventory_family_mismatch:${relativePath}`,
      );
    }
    const match = relativePath.match(MANIFEST_PATTERN);
    if (!match) {
      throw new Error(
        `p0c_p4_deploy_manifest_adapter_inventory_path_mismatch:${relativePath}`,
      );
    }
    if (paths.has(relativePath)) {
      throw new Error(
        `p0c_p4_deploy_manifest_adapter_inventory_duplicate:${relativePath}`,
      );
    }
    paths.add(relativePath);
    return {
      ...source,
      file: relativePath,
      dayKey: match[1],
    };
  });

  const supplied = new Set(
    context.inventoryPaths.map(normalizeRelativePath),
  );
  if (
    supplied.size !== paths.size ||
    [...paths].some(value => !supplied.has(value))
  ) {
    throw new Error(
      "p0c_p4_deploy_manifest_adapter_inventory_path_set_mismatch",
    );
  }

  return rows.sort((left, right) =>
    left.file.localeCompare(right.file),
  );
}

export function createP0CP4DeploySnapshotManifestFamilyImplementation({
  loadFixedDeploySnapshotManifestInputsForDay,
  buildDeploySnapshotManifest =
    buildP0CP4DeploySnapshotManifest,
  overlay,
} = {}) {
  return async function DEPLOY_SNAPSHOT_MANIFEST(context) {
    const loader = functionRequired(
      loadFixedDeploySnapshotManifestInputsForDay,
      "loadFixedDeploySnapshotManifestInputsForDay",
    );
    const builder = functionRequired(
      buildDeploySnapshotManifest,
      "buildDeploySnapshotManifest",
    );
    const rows = normalizedContext(context);
    const outputs = [];
    const artifacts = [];

    for (const row of rows) {
      const fixedInputs = await loader({
        dayKey: row.dayKey,
        relativePath: row.file,
        inventoryRow: row,
        context,
      });
      if (
        !fixedInputs ||
        typeof fixedInputs !== "object" ||
        Array.isArray(fixedInputs)
      ) {
        throw new Error(
          `p0c_p4_deploy_manifest_adapter_fixed_inputs_invalid:${row.dayKey}`,
        );
      }

      const artifact = await builder({
        relativePath: row.file,
        dayKey: row.dayKey,
        sourceManifestBytes:
          fixedInputs.sourceManifestBytes,
        fixedOutputSetComplete:
          fixedInputs.fixedOutputSetComplete,
        fixedOutputFamilies:
          fixedInputs.fixedOutputFamilies,
        fixturesOutput:
          fixedInputs.fixturesOutput,
        valueOutput:
          fixedInputs.valueOutput,
        valueAuditOutput:
          fixedInputs.valueAuditOutput,
        detailOutputs:
          fixedInputs.detailOutputs,
        completeDayDetailSet:
          fixedInputs.completeDayDetailSet,
        overlay,
        buildTimestamp:
          context.buildTimestamp,
      });

      if (
        !artifact ||
        artifact.schema !==
          P0C_P4_DEPLOY_SNAPSHOT_MANIFEST_SCHEMA ||
        artifact.ok !== true ||
        clean(artifact.date) !== row.dayKey ||
        clean(artifact.relativePath) !== row.file ||
        !Buffer.isBuffer(artifact.content) ||
        !/^[0-9a-f]{64}$/u.test(
          clean(artifact.sourceSha256),
        ) ||
        !/^[0-9a-f]{64}$/u.test(
          clean(artifact.outputSha256),
        ) ||
        !/^[0-9a-f]{64}$/u.test(
          clean(artifact.manifestHash),
        ) ||
        artifact.validation?.ok !== true
      ) {
        throw new Error(
          `p0c_p4_deploy_manifest_adapter_artifact_invalid:${row.dayKey}`,
        );
      }

      outputs.push(Object.freeze({
        relativePath: row.file,
        action: "write",
        content: artifact.content,
      }));
      artifacts.push(Object.freeze({
        dayKey: row.dayKey,
        relativePath: row.file,
        sourceSha256: artifact.sourceSha256,
        outputSha256: artifact.outputSha256,
        manifestHash: artifact.manifestHash,
        fixtureCount:
          artifact.diagnostics.fixtureCount,
        valuePickCount:
          artifact.diagnostics.valuePickCount,
        detailWriteCount:
          artifact.diagnostics.detailWriteCount,
        detailDeleteCount:
          artifact.diagnostics.detailDeleteCount,
        changedFixtureIdCount:
          artifact.diagnostics.changedFixtureIdCount,
      }));
    }

    return Object.freeze({
      schema:
        P0C_P4_DEPLOY_SNAPSHOT_MANIFEST_ADAPTER_SCHEMA,
      family:
        P0C_P4_DEPLOY_SNAPSHOT_MANIFEST_FAMILY,
      completeFamilyOutput: true,
      outputs: Object.freeze(outputs),
      diagnostics: Object.freeze({
        inventoryPathCount: rows.length,
        emittedWriteCount: outputs.length,
        fixedBundleRequired: true,
        completeDayDetailSetRequired: true,
        artifacts: Object.freeze(artifacts),
        modelEvaluationPerformed: false,
        repositoryApplicationAuthorized: false,
      }),
    });
  };
}
