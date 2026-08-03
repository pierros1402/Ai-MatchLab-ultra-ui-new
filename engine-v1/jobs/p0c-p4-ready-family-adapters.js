import {
  buildFixturesAllFromCanonicalEvidenceDay,
} from "./rebuild-fixtures-all-from-canonical-evidence-day.js";
import {
  buildH2HArtifactsFromHistory,
} from "./rebuild-h2h-index-from-identity-resolved-history.js";
import {
  buildLegacyFixturesAggregateP0C,
} from "./rebuild-legacy-fixtures-aggregate-p0c.js";
import {
  buildP0CP4FamilyRunnerRegistry,
  getP0CP4FamilyAdapterContract,
} from "./p0c-p4-family-adapter-contract.js";

export const P0C_P4_READY_FAMILY_ADAPTERS_SCHEMA =
  "ai-matchlab.p0c-p4-ready-family-adapters.v1";

export const P0C_P4_READY_FAMILY_NAMES = Object.freeze([
  "DEPLOY_SNAPSHOT_FIXTURES_ALL",
  "H2H_INDEX",
  "LEGACY_FIXTURES_AGGREGATE",
]);

const DEFAULT_BUILDERS = Object.freeze({
  fixturesAll:
    buildFixturesAllFromCanonicalEvidenceDay,
  h2h:
    buildH2HArtifactsFromHistory,
  legacyFixtures:
    buildLegacyFixturesAggregateP0C,
});

const FAMILY_PATTERNS = Object.freeze({
  DEPLOY_SNAPSHOT_FIXTURES_ALL:
    /^data\/deploy-snapshots\/(\d{4}-\d{2}-\d{2})\/fixtures-all\.json$/u,
  H2H_INDEX:
    /^data\/h2h\/([^/]+\.json)$/u,
  LEGACY_FIXTURES_AGGREGATE:
    /^data\/fixtures\.json$/u,
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
      "p0c_p4_ready_adapter_path_invalid",
    );
  }
  return text;
}

function functionRequired(value, name) {
  if (typeof value !== "function") {
    throw new Error(
      `p0c_p4_ready_adapter_loader_required:${name}`,
    );
  }
  return value;
}

function builderRequired(value, name) {
  if (typeof value !== "function") {
    throw new Error(
      `p0c_p4_ready_adapter_builder_required:${name}`,
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
      "p0c_p4_ready_adapter_context_required",
    );
  }
  if (context.applicationAuthorized !== false) {
    throw new Error(
      "p0c_p4_ready_adapter_application_forbidden",
    );
  }
  if (clean(context.family) !== expectedFamily) {
    throw new Error(
      `p0c_p4_ready_adapter_family_mismatch:${clean(context.family) || "missing"}:${expectedFamily}`,
    );
  }
  if (
    !Array.isArray(context.inventoryRows) ||
    !Array.isArray(context.inventoryPaths)
  ) {
    throw new Error(
      `p0c_p4_ready_adapter_inventory_required:${expectedFamily}`,
    );
  }
  if (
    context.inventoryRows.length !==
    context.inventoryPaths.length
  ) {
    throw new Error(
      `p0c_p4_ready_adapter_inventory_count_mismatch:${expectedFamily}`,
    );
  }

  const pattern = FAMILY_PATTERNS[expectedFamily];
  const paths = new Set();
  const rows = context.inventoryRows.map((row, index) => {
    if (!row || typeof row !== "object") {
      throw new Error(
        `p0c_p4_ready_adapter_inventory_row_invalid:${expectedFamily}:${index}`,
      );
    }
    const relativePath =
      normalizeRelativePath(row.file);
    if (clean(row.rebuildFamily) !== expectedFamily) {
      throw new Error(
        `p0c_p4_ready_adapter_inventory_family_mismatch:${relativePath}`,
      );
    }
    if (!pattern.test(relativePath)) {
      throw new Error(
        `p0c_p4_ready_adapter_inventory_path_mismatch:${expectedFamily}:${relativePath}`,
      );
    }
    if (paths.has(relativePath)) {
      throw new Error(
        `p0c_p4_ready_adapter_inventory_duplicate:${relativePath}`,
      );
    }
    paths.add(relativePath);
    return {
      ...row,
      file: relativePath,
    };
  });

  const suppliedPaths = new Set(
    context.inventoryPaths.map(normalizeRelativePath),
  );
  if (
    suppliedPaths.size !== paths.size ||
    [...paths].some(value => !suppliedPaths.has(value))
  ) {
    throw new Error(
      `p0c_p4_ready_adapter_inventory_path_set_mismatch:${expectedFamily}`,
    );
  }

  return {
    context,
    rows: rows.sort((left, right) =>
      left.file.localeCompare(right.file),
    ),
    pathSet: paths,
  };
}

function selectedBuilders(overrides = {}) {
  const source = {
    ...DEFAULT_BUILDERS,
    ...overrides,
  };
  return Object.freeze({
    fixturesAll:
      builderRequired(
        source.fixturesAll,
        "fixturesAll",
      ),
    h2h:
      builderRequired(
        source.h2h,
        "h2h",
      ),
    legacyFixtures:
      builderRequired(
        source.legacyFixtures,
        "legacyFixtures",
      ),
  });
}

function outputRow(relativePath, content) {
  return Object.freeze({
    relativePath,
    action: "write",
    content,
  });
}

export function createP0CP4ReadyFamilyImplementations({
  loadCanonicalRowsForDay,
  loadProviderEvidenceRowsForDay =
    async () => [],
  loadHistoryDocuments,
  loadExistingLegacyAggregate,
  loadCanonicalByDay,
  builders,
} = {}) {
  const build = selectedBuilders(builders);

  return Object.freeze({
    async DEPLOY_SNAPSHOT_FIXTURES_ALL(context) {
      const normalized =
        normalizedFamilyContext(
          context,
          "DEPLOY_SNAPSHOT_FIXTURES_ALL",
        );
      const canonicalLoader =
        functionRequired(
          loadCanonicalRowsForDay,
          "loadCanonicalRowsForDay",
        );
      const providerLoader =
        functionRequired(
          loadProviderEvidenceRowsForDay,
          "loadProviderEvidenceRowsForDay",
        );

      const outputs = [];
      const days = [];

      for (const row of normalized.rows) {
        const match =
          row.file.match(
            FAMILY_PATTERNS.DEPLOY_SNAPSHOT_FIXTURES_ALL,
          );
        const dayKey = match[1];

        const canonicalRows =
          await canonicalLoader({
            dayKey,
            inventoryRow: row,
            context,
          });
        const providerEvidenceRows =
          await providerLoader({
            dayKey,
            inventoryRow: row,
            context,
          });

        if (!Array.isArray(canonicalRows)) {
          throw new Error(
            `p0c_p4_ready_adapter_canonical_rows_invalid:${dayKey}`,
          );
        }
        if (!Array.isArray(providerEvidenceRows)) {
          throw new Error(
            `p0c_p4_ready_adapter_provider_rows_invalid:${dayKey}`,
          );
        }

        const artifact =
          await build.fixturesAll({
            dayKey,
            canonicalRows,
            providerEvidenceRows,
          });

        if (
          !artifact ||
          typeof artifact !== "object" ||
          !Array.isArray(artifact.matches)
        ) {
          throw new Error(
            `p0c_p4_ready_adapter_fixtures_all_artifact_invalid:${dayKey}`,
          );
        }

        outputs.push(
          outputRow(row.file, artifact),
        );
        days.push({
          dayKey,
          canonicalInputRows:
            canonicalRows.length,
          providerEvidenceRows:
            providerEvidenceRows.length,
          outputMatches:
            artifact.matches.length,
        });
      }

      return Object.freeze({
        schema:
          P0C_P4_READY_FAMILY_ADAPTERS_SCHEMA,
        family:
          "DEPLOY_SNAPSHOT_FIXTURES_ALL",
        completeFamilyOutput: true,
        outputs: Object.freeze(outputs),
        diagnostics: Object.freeze({
          inventoryPathCount:
            normalized.rows.length,
          emittedWriteCount:
            outputs.length,
          days: Object.freeze(days),
          repositoryApplicationAuthorized:
            false,
        }),
      });
    },

    async H2H_INDEX(context) {
      const normalized =
        normalizedFamilyContext(
          context,
          "H2H_INDEX",
        );
      const historyLoader =
        functionRequired(
          loadHistoryDocuments,
          "loadHistoryDocuments",
        );

      const historyDocuments =
        await historyLoader({
          inventoryRows:
            normalized.rows,
          context,
        });

      if (!Array.isArray(historyDocuments)) {
        throw new Error(
          "p0c_p4_ready_adapter_history_documents_invalid",
        );
      }

      const built =
        await build.h2h({
          historyDocuments,
        });

      if (
        !built ||
        built.ok !== true ||
        !Array.isArray(built.artifacts)
      ) {
        throw new Error(
          "p0c_p4_ready_adapter_h2h_artifact_invalid",
        );
      }

      const outputs = [];
      const emitted = new Set();

      for (const artifact of built.artifacts) {
        const relativePath =
          normalizeRelativePath(
            `data/h2h/${clean(artifact?.relativePath)}`,
          );
        if (!normalized.pathSet.has(relativePath)) {
          throw new Error(
            `p0c_p4_ready_adapter_h2h_unplanned_output:${relativePath}`,
          );
        }
        if (emitted.has(relativePath)) {
          throw new Error(
            `p0c_p4_ready_adapter_h2h_duplicate_output:${relativePath}`,
          );
        }
        if (
          !artifact ||
          typeof artifact.payload !== "object" ||
          artifact.payload === null
        ) {
          throw new Error(
            `p0c_p4_ready_adapter_h2h_payload_invalid:${relativePath}`,
          );
        }

        emitted.add(relativePath);
        outputs.push(
          outputRow(
            relativePath,
            artifact.payload,
          ),
        );
      }

      outputs.sort((left, right) =>
        left.relativePath.localeCompare(
          right.relativePath,
        ),
      );

      return Object.freeze({
        schema:
          P0C_P4_READY_FAMILY_ADAPTERS_SCHEMA,
        family:
          "H2H_INDEX",
        completeFamilyOutput: true,
        outputs: Object.freeze(outputs),
        diagnostics: Object.freeze({
          inventoryPathCount:
            normalized.rows.length,
          emittedWriteCount:
            outputs.length,
          implicitDeletionCount:
            normalized.rows.length -
            outputs.length,
          sourceHistoryDocumentCount:
            historyDocuments.length,
          repositoryApplicationAuthorized:
            false,
        }),
      });
    },

    async LEGACY_FIXTURES_AGGREGATE(context) {
      const normalized =
        normalizedFamilyContext(
          context,
          "LEGACY_FIXTURES_AGGREGATE",
        );
      const aggregateLoader =
        functionRequired(
          loadExistingLegacyAggregate,
          "loadExistingLegacyAggregate",
        );
      const canonicalLoader =
        functionRequired(
          loadCanonicalByDay,
          "loadCanonicalByDay",
        );

      const existingAggregate =
        await aggregateLoader({
          inventoryRows:
            normalized.rows,
          context,
        });
      const canonicalByDay =
        await canonicalLoader({
          inventoryRows:
            normalized.rows,
          context,
        });

      if (
        !canonicalByDay ||
        typeof canonicalByDay !== "object" ||
        Array.isArray(canonicalByDay)
      ) {
        throw new Error(
          "p0c_p4_ready_adapter_canonical_by_day_invalid",
        );
      }

      const artifact =
        await build.legacyFixtures({
          existingAggregate,
          canonicalByDay,
        });

      if (
        !artifact ||
        typeof artifact !== "object" ||
        !Array.isArray(artifact.fixtures)
      ) {
        throw new Error(
          "p0c_p4_ready_adapter_legacy_artifact_invalid",
        );
      }

      return Object.freeze({
        schema:
          P0C_P4_READY_FAMILY_ADAPTERS_SCHEMA,
        family:
          "LEGACY_FIXTURES_AGGREGATE",
        completeFamilyOutput: true,
        outputs: Object.freeze([
          outputRow(
            "data/fixtures.json",
            artifact,
          ),
        ]),
        diagnostics: Object.freeze({
          inventoryPathCount: 1,
          emittedWriteCount: 1,
          outputFixtureCount:
            artifact.fixtures.length,
          repositoryApplicationAuthorized:
            false,
        }),
      });
    },
  });
}

export function buildP0CP4ReadyFamilyRunnerRegistry({
  otherImplementations,
  ...readyOptions
} = {}) {
  if (
    !otherImplementations ||
    typeof otherImplementations !== "object" ||
    Array.isArray(otherImplementations)
  ) {
    throw new Error(
      "p0c_p4_ready_adapter_other_implementations_required",
    );
  }

  for (const family of P0C_P4_READY_FAMILY_NAMES) {
    if (Object.hasOwn(otherImplementations, family)) {
      throw new Error(
        `p0c_p4_ready_adapter_override_forbidden:${family}`,
      );
    }
  }

  const ready =
    createP0CP4ReadyFamilyImplementations(
      readyOptions,
    );

  const contract =
    getP0CP4FamilyAdapterContract();
  const expectedFamilies =
    contract.families.map(row => row.family);
  const supplied = {
    ...otherImplementations,
    ...ready,
  };

  if (
    Object.keys(supplied).length !==
    expectedFamilies.length
  ) {
    throw new Error(
      "p0c_p4_ready_adapter_registry_count_mismatch",
    );
  }

  return buildP0CP4FamilyRunnerRegistry({
    implementations: supplied,
  });
}
