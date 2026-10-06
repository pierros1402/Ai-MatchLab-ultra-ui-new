import {
  isDeepStrictEqual
} from "node:util";

import {
  computeDeploySnapshotManifestHash,
  validateDeploySnapshotManifest
} from "./deploy-snapshot-release-contract.js";

export const CHECKPOINT_AWARE_FRESHNESS_COVERAGE_MANIFEST_ONLY_ADAPTER_SCHEMA =
  "ai-matchlab.checkpoint-aware-freshness-coverage-manifest-only-adapter.v1";

export const CHECKPOINT_AWARE_FRESHNESS_COVERAGE_MANIFEST_ONLY_MUTATION_KEYS =
  Object.freeze([
    "generatedAt",
    "hash"
  ]);

const DAY_RE =
  /^\d{4}-\d{2}-\d{2}$/u;

function clean(value) {
  return String(
    value ?? ""
  ).trim();
}

function objectRequired(
  value,
  code
) {
  if (
    !value ||
    typeof value !==
      "object" ||
    Array.isArray(
      value
    )
  ) {
    throw new Error(
      code
    );
  }

  return value;
}

function timestampMs(
  value,
  code
) {
  const parsed =
    Date.parse(
      clean(
        value
      )
    );

  if (
    !Number.isFinite(
      parsed
    )
  ) {
    throw new Error(
      code
    );
  }

  return parsed;
}

function cloneJson(
  value
) {
  return JSON.parse(
    JSON.stringify(
      value
    )
  );
}

function topLevelChangedKeys(
  before,
  after
) {
  return [
    ...new Set([
      ...Object.keys(
        before || {}
      ),
      ...Object.keys(
        after || {}
      )
    ])
  ]
    .filter(
      key =>
        !isDeepStrictEqual(
          before?.[key],
          after?.[key]
        )
    )
    .sort();
}

export function buildCheckpointAwareFreshnessCoverageManifestOnlyUpdate({
  dayKey,
  manifest,
  coverageReadiness,
  generatedAt =
    new Date().toISOString()
} = {}) {
  const day =
    clean(
      dayKey
    );

  if (
    !DAY_RE.test(
      day
    )
  ) {
    throw new Error(
      "manifest_only_adapter_day_invalid"
    );
  }

  objectRequired(
    manifest,
    "manifest_only_adapter_manifest_required"
  );

  objectRequired(
    coverageReadiness,
    "manifest_only_adapter_coverage_readiness_required"
  );

  if (
    clean(
      manifest.date
    ) !==
      day
  ) {
    throw new Error(
      "manifest_only_adapter_manifest_day_mismatch"
    );
  }

  if (
    clean(
      coverageReadiness.dayKey
    ) !==
      day
  ) {
    throw new Error(
      "manifest_only_adapter_coverage_day_mismatch"
    );
  }

  const sourceValidation =
    validateDeploySnapshotManifest(
      manifest,
      day
    );

  if (
    sourceValidation.ok !==
      true
  ) {
    throw new Error(
      "manifest_only_adapter_source_manifest_invalid:" +
      sourceValidation.errors.join(
        ","
      )
    );
  }

  const sourceManifestAt =
    timestampMs(
      manifest.generatedAt,
      "manifest_only_adapter_source_generated_at_invalid"
    );

  const coverageAt =
    timestampMs(
      coverageReadiness.generatedAt,
      "manifest_only_adapter_coverage_generated_at_invalid"
    );

  const targetAt =
    timestampMs(
      generatedAt,
      "manifest_only_adapter_target_generated_at_invalid"
    );

  if (
    targetAt <
    sourceManifestAt
  ) {
    throw new Error(
      "manifest_only_adapter_target_before_source_manifest"
    );
  }

  if (
    targetAt <
    coverageAt
  ) {
    throw new Error(
      "manifest_only_adapter_target_before_coverage_readiness"
    );
  }

  const nextManifest =
    cloneJson(
      manifest
    );

  nextManifest.generatedAt =
    new Date(
      targetAt
    ).toISOString();

  nextManifest.hash =
    computeDeploySnapshotManifestHash(
      nextManifest
    );

  const targetValidation =
    validateDeploySnapshotManifest(
      nextManifest,
      day
    );

  if (
    targetValidation.ok !==
      true
  ) {
    throw new Error(
      "manifest_only_adapter_target_manifest_invalid:" +
      targetValidation.errors.join(
        ","
      )
    );
  }

  const changedKeys =
    topLevelChangedKeys(
      manifest,
      nextManifest
    );

  const unauthorizedChangedKeys =
    changedKeys.filter(
      key =>
        !CHECKPOINT_AWARE_FRESHNESS_COVERAGE_MANIFEST_ONLY_MUTATION_KEYS
          .includes(
            key
          )
    );

  if (
    unauthorizedChangedKeys.length
  ) {
    throw new Error(
      "manifest_only_adapter_unauthorized_manifest_mutation:" +
      unauthorizedChangedKeys.join(
        ","
      )
    );
  }

  return {
    ok:
      true,

    schema:
      CHECKPOINT_AWARE_FRESHNESS_COVERAGE_MANIFEST_ONLY_ADAPTER_SCHEMA,

    dayKey:
      day,

    role:
      "pure_manifest_retiming_and_rehashing_primitive",

    assignedMutationKeys: [
      ...CHECKPOINT_AWARE_FRESHNESS_COVERAGE_MANIFEST_ONLY_MUTATION_KEYS
    ],

    changedTopLevelKeys:
      changedKeys,

    source: {
      generatedAt:
        manifest.generatedAt,

      hash:
        manifest.hash,

      computedHash:
        sourceValidation.computedHash
    },

    coverageReadiness: {
      generatedAt:
        coverageReadiness.generatedAt
    },

    target: {
      generatedAt:
        nextManifest.generatedAt,

      hash:
        nextManifest.hash,

      computedHash:
        targetValidation.computedHash
    },

    invariants: {
      sourceManifestValid:
        true,

      targetManifestValid:
        true,

      targetNotBeforeSourceManifest:
        true,

      targetNotBeforeCoverageReadiness:
        true,

      onlyGeneratedAtAndHashAssignable:
        true,

      fullSnapshotExporterUsed:
        false,

      repositoryWritePerformed:
        false
    },

    manifest:
      nextManifest
  };
}