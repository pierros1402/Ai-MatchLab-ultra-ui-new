import {
  P0C_P4_EXISTING_VALUE_ARTIFACT_SCHEMA,
  buildP0CP4ExistingValueArtifact,
} from "./p0c-p4-build-existing-value-artifact.js";

export const P0C_P4_VALUE_FAMILY_ADAPTERS_SCHEMA =
  "ai-matchlab.p0c-p4-value-family-adapters.v1";

export const P0C_P4_VALUE_FAMILY_NAMES = Object.freeze([
  "VALUE_PLAN_ARTIFACT",
  "VALUE_AUDIT_ARTIFACT",
  "VALUE_COMPARISON",
  "DEPLOY_SNAPSHOT_VALUE",
  "DEPLOY_SNAPSHOT_VALUE_AUDIT",
]);

const FAMILY_PATTERNS = Object.freeze({
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

function normalizeRelativePath(value) {
  const text = clean(value).replaceAll("\\", "/");
  if (
    !text ||
    text.startsWith("/") ||
    /^[A-Za-z]:/u.test(text) ||
    text.split("/").includes("..")
  ) {
    throw new Error(
      "p0c_p4_value_adapter_path_invalid",
    );
  }
  return text;
}

function functionRequired(value, name) {
  if (typeof value !== "function") {
    throw new Error(
      `p0c_p4_value_adapter_loader_required:${name}`,
    );
  }
  return value;
}

function normalizedFamilyContext(
  context,
  expectedFamily,
) {
  if (!context || typeof context !== "object") {
    throw new Error(
      "p0c_p4_value_adapter_context_required",
    );
  }
  if (context.applicationAuthorized !== false) {
    throw new Error(
      "p0c_p4_value_adapter_application_forbidden",
    );
  }
  if (clean(context.family) !== expectedFamily) {
    throw new Error(
      `p0c_p4_value_adapter_family_mismatch:${clean(context.family) || "missing"}:${expectedFamily}`,
    );
  }
  if (
    !Array.isArray(context.inventoryRows) ||
    !Array.isArray(context.inventoryPaths) ||
    context.inventoryRows.length !==
      context.inventoryPaths.length
  ) {
    throw new Error(
      `p0c_p4_value_adapter_inventory_required:${expectedFamily}`,
    );
  }

  const pattern = FAMILY_PATTERNS[expectedFamily];
  const rows = [];
  const paths = new Set();

  for (
    let index = 0;
    index < context.inventoryRows.length;
    index++
  ) {
    const source = context.inventoryRows[index];
    if (!source || typeof source !== "object") {
      throw new Error(
        `p0c_p4_value_adapter_inventory_row_invalid:${expectedFamily}:${index}`,
      );
    }
    const relativePath = normalizeRelativePath(
      source.file,
    );
    if (clean(source.rebuildFamily) !== expectedFamily) {
      throw new Error(
        `p0c_p4_value_adapter_inventory_family_mismatch:${relativePath}`,
      );
    }
    const match = relativePath.match(pattern);
    if (!match) {
      throw new Error(
        `p0c_p4_value_adapter_inventory_path_mismatch:${expectedFamily}:${relativePath}`,
      );
    }
    if (paths.has(relativePath)) {
      throw new Error(
        `p0c_p4_value_adapter_inventory_duplicate:${relativePath}`,
      );
    }
    paths.add(relativePath);
    rows.push({
      ...source,
      file: relativePath,
      dayKey: match[1],
    });
  }

  const suppliedPaths = new Set(
    context.inventoryPaths.map(normalizeRelativePath),
  );
  if (
    suppliedPaths.size !== paths.size ||
    [...paths].some(path => !suppliedPaths.has(path))
  ) {
    throw new Error(
      `p0c_p4_value_adapter_inventory_path_set_mismatch:${expectedFamily}`,
    );
  }

  return rows.sort((left, right) =>
    left.file.localeCompare(right.file),
  );
}

export function createP0CP4ValueFamilyImplementations({
  loadExistingValueArtifact,
  buildExistingValueArtifact =
    buildP0CP4ExistingValueArtifact,
  overlay,
} = {}) {
  const implementations = {};

  for (const family of P0C_P4_VALUE_FAMILY_NAMES) {
    implementations[family] = async context => {
      const loader = functionRequired(
        loadExistingValueArtifact,
        "loadExistingValueArtifact",
      );
      const builder = functionRequired(
        buildExistingValueArtifact,
        "buildExistingValueArtifact",
      );
      const rows = normalizedFamilyContext(
        context,
        family,
      );
      const outputs = [];
      const artifacts = [];

      for (const row of rows) {
        const sourceBytes = await loader({
          relativePath: row.file,
          dayKey: row.dayKey,
          family,
          inventoryRow: row,
          context,
        });

        const built = await builder({
          relativePath: row.file,
          family,
          sourceBytes,
          overlay,
        });

        if (
          !built ||
          built.schema !==
            P0C_P4_EXISTING_VALUE_ARTIFACT_SCHEMA ||
          built.ok !== true ||
          clean(built.family) !== family ||
          clean(built.relativePath) !== row.file ||
          !Buffer.isBuffer(built.content) ||
          !/^[0-9a-f]{64}$/u.test(
            clean(built.sourceSha256),
          ) ||
          !/^[0-9a-f]{64}$/u.test(
            clean(built.outputSha256),
          )
        ) {
          throw new Error(
            `p0c_p4_value_adapter_artifact_invalid:${family}:${row.file}`,
          );
        }

        outputs.push(Object.freeze({
          relativePath: row.file,
          action: "write",
          content: built.content,
        }));
        artifacts.push(Object.freeze({
          relativePath: row.file,
          dayKey: row.dayKey,
          immutablePlanA:
            built.immutablePlanA === true,
          sourceSha256: built.sourceSha256,
          outputSha256: built.outputSha256,
          identityEntryCount:
            built.identityOverlay.entryCount,
          changedFixtureIdCount:
            built.identityOverlay.changedFixtureIdCount,
        }));
      }

      return Object.freeze({
        schema: P0C_P4_VALUE_FAMILY_ADAPTERS_SCHEMA,
        family,
        completeFamilyOutput: true,
        outputs: Object.freeze(outputs),
        diagnostics: Object.freeze({
          inventoryPathCount: rows.length,
          emittedWriteCount: outputs.length,
          immutablePlanACount:
            artifacts.filter(
              row => row.immutablePlanA,
            ).length,
          identityEntryCount:
            artifacts.reduce(
              (sum, row) =>
                sum + row.identityEntryCount,
              0,
            ),
          changedFixtureIdCount:
            artifacts.reduce(
              (sum, row) =>
                sum + row.changedFixtureIdCount,
              0,
            ),
          artifacts: Object.freeze(artifacts),
          modelEvaluationPerformed: false,
          repositoryApplicationAuthorized: false,
        }),
      });
    };
  }

  return Object.freeze(implementations);
}
