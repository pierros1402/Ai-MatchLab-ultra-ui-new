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
  buildP0CP4ExpectedMatchViewFromExisting,
} from "./p0c-p4-build-expected-match-view.js";
import {
  buildP0CP4DeploySnapshotFixturesFromArtifacts,
} from "./p0c-p4-build-deploy-snapshot-fixtures.js";
import {
  P0C_P4_DEPLOY_SNAPSHOT_DETAILS_SCHEMA,
  buildP0CP4DeploySnapshotDetails,
} from "./p0c-p4-build-deploy-snapshot-details.js";
import {
  buildP0CP4DeploySnapshotOdds,
} from "./p0c-p4-build-deploy-snapshot-odds.js";
import {
  buildP0CP4FamilyRunnerRegistry,
  getP0CP4FamilyAdapterContract,
} from "./p0c-p4-family-adapter-contract.js";
import {
  P0C_P4_VALUE_FAMILY_NAMES,
  createP0CP4ValueFamilyImplementations,
} from "./p0c-p4-value-family-adapters.js";
import {
  P0C_P4_DEPLOY_SNAPSHOT_MANIFEST_FAMILY,
  createP0CP4DeploySnapshotManifestFamilyImplementation,
} from "./p0c-p4-deploy-snapshot-manifest-adapter.js";

export const P0C_P4_READY_FAMILY_ADAPTERS_SCHEMA =
  "ai-matchlab.p0c-p4-ready-family-adapters.v1";

export const P0C_P4_NON_VALUE_READY_FAMILY_NAMES =
  Object.freeze([
    "DEPLOY_SNAPSHOT_DETAILS",
    "DEPLOY_SNAPSHOT_FIXTURES",
    "DEPLOY_SNAPSHOT_FIXTURES_ALL",
    P0C_P4_DEPLOY_SNAPSHOT_MANIFEST_FAMILY,
    "DEPLOY_SNAPSHOT_ODDS",
    "EXPECTED_MATCH_VIEW",
    "H2H_INDEX",
    "LEGACY_FIXTURES_AGGREGATE",
  ]);

export const P0C_P4_READY_FAMILY_NAMES = Object.freeze([
  ...P0C_P4_NON_VALUE_READY_FAMILY_NAMES,
  ...P0C_P4_VALUE_FAMILY_NAMES,
]);

const DEFAULT_BUILDERS = Object.freeze({
  deploySnapshotDetails:
    buildP0CP4DeploySnapshotDetails,
  deploySnapshotFixturesFromArtifacts:
    buildP0CP4DeploySnapshotFixturesFromArtifacts,
  deploySnapshotOdds:
    buildP0CP4DeploySnapshotOdds,
  fixturesAll:
    buildFixturesAllFromCanonicalEvidenceDay,
  expectedMatchViewFromExisting:
    buildP0CP4ExpectedMatchViewFromExisting,
  h2h:
    buildH2HArtifactsFromHistory,
  legacyFixtures:
    buildLegacyFixturesAggregateP0C,
});

const FAMILY_PATTERNS = Object.freeze({
  DEPLOY_SNAPSHOT_DETAILS:
    /^data\/deploy-snapshots\/(\d{4}-\d{2}-\d{2})\/details\/[^/]+\.json$/u,
  DEPLOY_SNAPSHOT_FIXTURES:
    /^data\/deploy-snapshots\/(\d{4}-\d{2}-\d{2})\/fixtures\.json$/u,
  DEPLOY_SNAPSHOT_FIXTURES_ALL:
    /^data\/deploy-snapshots\/(\d{4}-\d{2}-\d{2})\/fixtures-all\.json$/u,
  DEPLOY_SNAPSHOT_ODDS:
    /^data\/deploy-snapshots\/(\d{4}-\d{2}-\d{2})\/odds\.json$/u,
  EXPECTED_MATCH_VIEW:
    /^data\/expected-matches\/(\d{4}-\d{2}-\d{2})\.json$/u,
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
    deploySnapshotDetails:
      builderRequired(
        source.deploySnapshotDetails,
        "deploySnapshotDetails",
      ),
    deploySnapshotFixturesFromArtifacts:
      builderRequired(
        source.deploySnapshotFixturesFromArtifacts,
        "deploySnapshotFixturesFromArtifacts",
      ),
    fixturesAll:
      builderRequired(
        source.fixturesAll,
        "fixturesAll",
      ),
    deploySnapshotOdds:
      builderRequired(
        source.deploySnapshotOdds,
        "deploySnapshotOdds",
      ),
    expectedMatchViewFromExisting:
      builderRequired(
        source.expectedMatchViewFromExisting,
        "expectedMatchViewFromExisting",
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
  loadSourceDetailRecordsForDay,
  loadExistingDeployDetailRecordsForDay,
  loadPublishedFixtureRowsForDay,
  loadDetailsPatchedAtForDay,
  loadPreserveExistingDetailsForDay =
    async () => true,
  loadFixtureUniverseArtifactForDay,
  loadCanonicalRowsForDay,
  loadProviderEvidenceRowsForDay =
    async () => [],
  loadFixturesAllArtifactForDay,
  loadOddsDayForDay,
  loadOddsGeneratedAtForDay,
  loadExistingExpectedMatchViewForDay,
  loadHistoryDocuments,
  loadExistingLegacyAggregate,
  loadCanonicalByDay,
  loadExistingValueArtifact,
  buildExistingValueArtifact,
  valueIdentityOverlay,
  loadFixedDeploySnapshotManifestInputsForDay,
  buildDeploySnapshotManifest,
  manifestIdentityOverlay,
  builders,
} = {}) {
  const build = selectedBuilders(builders);
  const valueImplementations =
    createP0CP4ValueFamilyImplementations({
      loadExistingValueArtifact,
      buildExistingValueArtifact,
      overlay: valueIdentityOverlay,
    });
  const manifestImplementation =
    createP0CP4DeploySnapshotManifestFamilyImplementation({
      loadFixedDeploySnapshotManifestInputsForDay,
      buildDeploySnapshotManifest,
      overlay:
        manifestIdentityOverlay ||
        valueIdentityOverlay,
    });

  return Object.freeze({
    ...valueImplementations,
    [P0C_P4_DEPLOY_SNAPSHOT_MANIFEST_FAMILY]:
      manifestImplementation,
    async DEPLOY_SNAPSHOT_DETAILS(context) {
      const normalized =
        normalizedFamilyContext(
          context,
          "DEPLOY_SNAPSHOT_DETAILS",
        );
      const sourceLoader =
        functionRequired(
          loadSourceDetailRecordsForDay,
          "loadSourceDetailRecordsForDay",
        );
      const existingLoader =
        functionRequired(
          loadExistingDeployDetailRecordsForDay,
          "loadExistingDeployDetailRecordsForDay",
        );
      const fixturesLoader =
        functionRequired(
          loadPublishedFixtureRowsForDay,
          "loadPublishedFixtureRowsForDay",
        );
      const patchedAtLoader =
        functionRequired(
          loadDetailsPatchedAtForDay,
          "loadDetailsPatchedAtForDay",
        );
      const preserveLoader =
        functionRequired(
          loadPreserveExistingDetailsForDay,
          "loadPreserveExistingDetailsForDay",
        );

      const rowsByDay =
        new Map();

      for (const row of normalized.rows) {
        const match =
          row.file.match(
            FAMILY_PATTERNS.DEPLOY_SNAPSHOT_DETAILS,
          );
        const dayKey =
          match[1];

        if (!rowsByDay.has(dayKey)) {
          rowsByDay.set(
            dayKey,
            [],
          );
        }

        rowsByDay.get(dayKey).push(row);
      }

      const outputs = [];
      const days = [];

      for (const dayKey of [...rowsByDay.keys()].sort()) {
        const dayRows =
          rowsByDay.get(dayKey)
            .slice()
            .sort((left, right) =>
              left.file.localeCompare(right.file),
            );

        const inventoryPaths =
          dayRows.map(row => row.file);

        const sourceDetails =
          await sourceLoader({
            dayKey,
            inventoryRows: dayRows,
            inventoryPaths,
            context,
          });

        const existingDeployDetails =
          await existingLoader({
            dayKey,
            inventoryRows: dayRows,
            inventoryPaths,
            context,
          });

        const fixtureRows =
          await fixturesLoader({
            dayKey,
            inventoryRows: dayRows,
            inventoryPaths,
            context,
          });

        const preserveExistingDetails =
          await preserveLoader({
            dayKey,
            inventoryRows: dayRows,
            inventoryPaths,
            context,
          });

        const patchedAt =
          await patchedAtLoader({
            dayKey,
            inventoryRows: dayRows,
            inventoryPaths,
            context,
          });

        if (!Array.isArray(sourceDetails)) {
          throw new Error(
            `p0c_p4_ready_adapter_detail_sources_invalid:${dayKey}`,
          );
        }

        if (!Array.isArray(existingDeployDetails)) {
          throw new Error(
            `p0c_p4_ready_adapter_existing_details_invalid:${dayKey}`,
          );
        }

        if (!Array.isArray(fixtureRows)) {
          throw new Error(
            `p0c_p4_ready_adapter_detail_fixture_rows_invalid:${dayKey}`,
          );
        }

        if (
          typeof preserveExistingDetails !==
          "boolean"
        ) {
          throw new Error(
            `p0c_p4_ready_adapter_detail_preserve_flag_invalid:${dayKey}`,
          );
        }

        const artifact =
          await build.deploySnapshotDetails({
            dayKey,
            inventoryPaths,
            sourceDetails,
            existingDeployDetails,
            fixtureRows,
            preserveExistingDetails,
            patchedAt,
          });

        if (
          !artifact ||
          typeof artifact !== "object" ||
          artifact.schema !==
            P0C_P4_DEPLOY_SNAPSHOT_DETAILS_SCHEMA ||
          artifact.ok !== true ||
          clean(artifact.date) !== dayKey ||
          artifact.completeFamilyOutput !== true ||
          !Array.isArray(artifact.outputs) ||
          artifact.outputs.length !== dayRows.length
        ) {
          throw new Error(
            `p0c_p4_ready_adapter_deploy_snapshot_details_artifact_invalid:${dayKey}`,
          );
        }

        const expectedPaths =
          new Set(inventoryPaths);
        const emittedPaths =
          new Set();
        let emittedWriteCount =
          0;
        let emittedDeletionCount =
          0;

        for (const output of artifact.outputs) {
          const relativePath =
            normalizeRelativePath(
              output?.relativePath,
            );

          if (
            !expectedPaths.has(relativePath) ||
            emittedPaths.has(relativePath)
          ) {
            throw new Error(
              `p0c_p4_ready_adapter_deploy_snapshot_details_output_path_invalid:${dayKey}:${relativePath}`,
            );
          }

          emittedPaths.add(relativePath);

          if (output.action === "write") {
            if (
              !output.content ||
              typeof output.content !== "object" ||
              Array.isArray(output.content) ||
              !Number.isInteger(output.bytes) ||
              output.bytes < 0 ||
              !/^[0-9a-f]{64}$/u.test(
                clean(output.sha256),
              )
            ) {
              throw new Error(
                `p0c_p4_ready_adapter_deploy_snapshot_details_write_invalid:${dayKey}:${relativePath}`,
              );
            }

            outputs.push(
              Object.freeze({
                relativePath,
                action:
                  "write",
                content:
                  output.content,
                bytes:
                  output.bytes,
                sha256:
                  clean(output.sha256),
              }),
            );
            emittedWriteCount += 1;
            continue;
          }

          if (
            output.action !== "delete" ||
            !clean(output.reason)
          ) {
            throw new Error(
              `p0c_p4_ready_adapter_deploy_snapshot_details_delete_invalid:${dayKey}:${relativePath}`,
            );
          }

          outputs.push(
            Object.freeze({
              relativePath,
              action:
                "delete",
              reason:
                clean(output.reason),
            }),
          );
          emittedDeletionCount += 1;
        }

        if (
          emittedPaths.size !==
          expectedPaths.size
        ) {
          throw new Error(
            `p0c_p4_ready_adapter_deploy_snapshot_details_output_set_incomplete:${dayKey}`,
          );
        }

        days.push(
          Object.freeze({
            dayKey,
            inventoryPathCount:
              dayRows.length,
            sourceDetailCount:
              sourceDetails.length,
            existingDeployDetailCount:
              existingDeployDetails.length,
            fixtureCount:
              fixtureRows.length,
            preserveExistingDetails,
            patchedAt:
              clean(patchedAt),
            emittedWriteCount,
            emittedDeletionCount,
          }),
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
          "DEPLOY_SNAPSHOT_DETAILS",
        completeFamilyOutput: true,
        outputs: Object.freeze(outputs),
        diagnostics: Object.freeze({
          inventoryPathCount:
            normalized.rows.length,
          emittedWriteCount:
            outputs.filter(
              row => row.action === "write",
            ).length,
          emittedDeletionCount:
            outputs.filter(
              row => row.action === "delete",
            ).length,
          days: Object.freeze(days),
          detailBuildPerformed:
            false,
          deletionAwareOutputSupported:
            true,
          repositoryApplicationAuthorized:
            false,
        }),
      });
    },

    async DEPLOY_SNAPSHOT_FIXTURES(context) {
      const normalized =
        normalizedFamilyContext(
          context,
          "DEPLOY_SNAPSHOT_FIXTURES",
        );
      const universeLoader =
        functionRequired(
          loadFixtureUniverseArtifactForDay,
          "loadFixtureUniverseArtifactForDay",
        );
      const fixturesAllLoader =
        functionRequired(
          loadFixturesAllArtifactForDay,
          "loadFixturesAllArtifactForDay",
        );

      const outputs = [];
      const days = [];

      for (const row of normalized.rows) {
        const match =
          row.file.match(
            FAMILY_PATTERNS.DEPLOY_SNAPSHOT_FIXTURES,
          );
        const dayKey = match[1];

        const fixtureUniverse =
          await universeLoader({
            dayKey,
            inventoryRow: row,
            context,
          });
        const fixturesAll =
          await fixturesAllLoader({
            dayKey,
            inventoryRow: row,
            context,
          });

        const artifact =
          await build
            .deploySnapshotFixturesFromArtifacts({
              dayKey,
              fixtureUniverse,
              fixturesAll,
            });

        if (
          !artifact ||
          typeof artifact !== "object" ||
          artifact.ok !== true ||
          clean(artifact.date) !== dayKey ||
          !Array.isArray(artifact.fixtures) ||
          artifact.count !== artifact.fixtures.length
        ) {
          throw new Error(
            `p0c_p4_ready_adapter_deploy_snapshot_fixtures_artifact_invalid:${dayKey}`,
          );
        }

        outputs.push(
          outputRow(row.file, artifact),
        );
        days.push({
          dayKey,
          fixtureUniverseRows:
            Array.isArray(fixtureUniverse?.fixtures)
              ? fixtureUniverse.fixtures.length
              : 0,
          fixturesAllRows:
            Array.isArray(fixturesAll?.matches)
              ? fixturesAll.matches.length
              : 0,
          outputFixtures:
            artifact.fixtures.length,
        });
      }

      return Object.freeze({
        schema:
          P0C_P4_READY_FAMILY_ADAPTERS_SCHEMA,
        family:
          "DEPLOY_SNAPSHOT_FIXTURES",
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

    async DEPLOY_SNAPSHOT_ODDS(context) {
      const normalized =
        normalizedFamilyContext(
          context,
          "DEPLOY_SNAPSHOT_ODDS",
        );
      const oddsLoader =
        functionRequired(
          loadOddsDayForDay,
          "loadOddsDayForDay",
        );
      const generatedAtLoader =
        functionRequired(
          loadOddsGeneratedAtForDay,
          "loadOddsGeneratedAtForDay",
        );

      const outputs = [];
      const days = [];

      for (const row of normalized.rows) {
        const match =
          row.file.match(
            FAMILY_PATTERNS.DEPLOY_SNAPSHOT_ODDS,
          );
        const dayKey = match[1];

        const oddsDay =
          await oddsLoader({
            dayKey,
            inventoryRow: row,
            context,
          });

        const generatedAt =
          await generatedAtLoader({
            dayKey,
            inventoryRow: row,
            context,
          });

        const artifact =
          await build.deploySnapshotOdds({
            dayKey,
            generatedAt,
            oddsDay,
          });

        if (
          !artifact ||
          typeof artifact !== "object" ||
          artifact.ok !== true ||
          clean(artifact.date) !== dayKey ||
          clean(artifact.source) !==
            "autonomous-odds-capture" ||
          !/^[0-9a-f]{40}$/u.test(
            clean(artifact.hash),
          ) ||
          !Number.isInteger(artifact.count) ||
          artifact.count < 0 ||
          !Array.isArray(artifact.matches)
        ) {
          throw new Error(
            `p0c_p4_ready_adapter_deploy_snapshot_odds_artifact_invalid:${dayKey}`,
          );
        }

        outputs.push(
          outputRow(row.file, artifact),
        );
        days.push({
          dayKey,
          sourceCount:
            Number.isInteger(oddsDay?.count)
              ? oddsDay.count
              : null,
          sourceMatches:
            Array.isArray(oddsDay?.matches)
              ? oddsDay.matches.length
              : 0,
          outputCount:
            artifact.count,
          outputMatches:
            artifact.matches.length,
          generatedAt:
            clean(artifact.generatedAt),
          hash:
            clean(artifact.hash),
        });
      }

      return Object.freeze({
        schema:
          P0C_P4_READY_FAMILY_ADAPTERS_SCHEMA,
        family:
          "DEPLOY_SNAPSHOT_ODDS",
        completeFamilyOutput: true,
        outputs: Object.freeze(outputs),
        diagnostics: Object.freeze({
          inventoryPathCount:
            normalized.rows.length,
          emittedWriteCount:
            outputs.length,
          days: Object.freeze(days),
          oddsCapturePerformed:
            false,
          repositoryApplicationAuthorized:
            false,
        }),
      });
    },

    async EXPECTED_MATCH_VIEW(context) {
      const normalized =
        normalizedFamilyContext(
          context,
          "EXPECTED_MATCH_VIEW",
        );
      const fixturesLoader =
        functionRequired(
          loadFixturesAllArtifactForDay,
          "loadFixturesAllArtifactForDay",
        );
      const existingLoader =
        functionRequired(
          loadExistingExpectedMatchViewForDay,
          "loadExistingExpectedMatchViewForDay",
        );

      const outputs = [];
      const days = [];

      for (const row of normalized.rows) {
        const match =
          row.file.match(
            FAMILY_PATTERNS.EXPECTED_MATCH_VIEW,
          );
        const dayKey = match[1];

        const fixturesAll =
          await fixturesLoader({
            dayKey,
            inventoryRow: row,
            context,
          });
        const existingArtifact =
          await existingLoader({
            dayKey,
            inventoryRow: row,
            context,
          });

        const artifact =
          await build.expectedMatchViewFromExisting({
            dayKey,
            fixturesAll,
            existingArtifact,
          });

        if (
          !artifact ||
          typeof artifact !== "object" ||
          clean(artifact.dayKey) !== dayKey ||
          !Array.isArray(artifact.matches) ||
          artifact.matchCount !== artifact.matches.length
        ) {
          throw new Error(
            `p0c_p4_ready_adapter_expected_match_artifact_invalid:${dayKey}`,
          );
        }

        outputs.push(
          outputRow(row.file, artifact),
        );
        days.push({
          dayKey,
          outputMatches:
            artifact.matches.length,
          recordedAt:
            clean(artifact.recordedAt),
          source:
            clean(artifact.source),
        });
      }

      return Object.freeze({
        schema:
          P0C_P4_READY_FAMILY_ADAPTERS_SCHEMA,
        family:
          "EXPECTED_MATCH_VIEW",
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
