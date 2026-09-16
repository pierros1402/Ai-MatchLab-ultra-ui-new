import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import {
  computeDeploySnapshotManifestHash,
} from "./deploy-snapshot-release-contract.js";
import {
  planCPredictionSignature,
} from "../value/plan-c-shadow-export.js";
import {
  AUTONOMOUS_REPAIR_PUBLICATION_COUPLED_MATERIAL_SCHEMA,
  AUTONOMOUS_REPAIR_PUBLICATION_PRODUCER_POLICY,
  buildAutonomousRepairPublicationCoupledMaterialBundle,
  validateAutonomousRepairPublicationCoupledMaterialBundle,
} from "./autonomous-repair-publication-coupled-materializer.js";

const DAY = "2026-07-08";
const ID = "cid_publication_coupled_test_20260708";
const BUILD_AT = "2026-09-16T12:00:00.000Z";

function prettyBytes(value, trailingNewline = true) {
  return Buffer.from(
    `${JSON.stringify(value, null, 2)}${trailingNewline ? "\n" : ""}`,
    "utf8",
  );
}

function overlay() {
  return {
    resolveEvidenceFixtureId(value) {
      const text = String(value ?? "").trim();
      return {
        ok: true,
        managed: false,
        sourceFixtureId: text,
        resolvedFixtureId: text,
        sourceRole: "unmanaged",
      };
    },
  };
}

function sourceManifest({ planC = true, valueAudit = false } = {}) {
  const manifest = {
    ok: true,
    date: DAY,
    generatedAt: "2026-07-08T23:00:00.000Z",
    startedAt: "2026-07-08T22:59:00.000Z",
    source: "local_canonical_export",
    version: "deploy-snapshot-v2",
    fixturesSource: "canonical",
    files: {
      fixtures: "fixtures.json",
      value: "value.json",
      valueAudit: valueAudit ? "value-audit.json" : null,
      ...(planC
        ? {
            planCShadow: "plan-c-shadow.json",
            planCShadowAudit: "plan-c-shadow-audit.json",
          }
        : {}),
      detailsDir: "details",
    },
    fileHashes: {
      "fixtures.json": "0".repeat(64),
      "value.json": "1".repeat(64),
      ...(valueAudit ? { "value-audit.json": "2".repeat(64) } : {}),
      ...(planC
        ? {
            "plan-c-shadow.json": "3".repeat(64),
            "plan-c-shadow-audit.json": "4".repeat(64),
          }
        : {}),
    },
    counts: {
      fixtures: 1,
      valuePicks: 0,
      ...(planC
        ? {
            planCShadowPredictions: 0,
            planCShadowPicks: 0,
          }
        : {}),
      details: 1,
      detailsMatchedToFixtures: 1,
      orphanDetailsRemoved: 0,
      detailsMissingForFixtures: 0,
    },
    valueGate: {
      fixtures: 1,
      valuePicks: 0,
      valueSource: "local_value_file",
      valueFreshAgainstCanonical: null,
      ok: true,
    },
    fixturesByLeague: { "test.1": 1 },
    coverage: {},
    sizes: {
      fixturesMb: 0,
      valueMb: 0,
      ...(planC ? { planCShadowMb: 0 } : {}),
      detailsTotalMb: 0,
      largestDetail: { file: null, bytes: 0, mb: 0 },
    },
    details: [],
  };
  manifest.hash = computeDeploySnapshotManifestHash(manifest);
  return manifest;
}

function fixtureRow(id = ID) {
  return {
    canonicalId: id,
    matchId: id,
    dayKey: DAY,
    leagueSlug: "test.1",
    status: "PRE",
    rawStatus: "SCHEDULED",
    minute: "",
    scoreHome: null,
    scoreAway: null,
  };
}

function fixtureUniverse(rows = [fixtureRow()]) {
  return {
    source: "canonical_with_runtime_overlay",
    canonicalFixtureCount: rows.length,
    sourceFixtureJsonCount: rows.length,
    fixtureJsonCount: rows.length,
    snapshotRescuedCount: 0,
    snapshotRescuedLeagues: [],
    runtimeOverlayCount: 0,
    runtimeOnlyExcludedCount: 0,
    runtimeOnlyExcludedIds: [],
    outsideTargetDayRuntimeCount: 0,
    outsideTargetDayRuntimeIds: [],
    ambiguousRuntimeCount: 0,
    ambiguousCanonicalAliasCount: 0,
    fixtures: rows,
  };
}

function fixturesAll() {
  return {
    matches: [],
  };
}

function detailPayload(id = ID) {
  return {
    matchId: id,
    basic: {
      canonicalId: id,
      matchId: id,
    },
    valueSummary: { count: 0, picks: [] },
    meta: { valueSynced: false },
  };
}

function detailRecord(path, payload) {
  return {
    path,
    detail: payload,
  };
}

function detailInventory(id = ID) {
  return [
    `data/deploy-snapshots/${DAY}/details/${id}.json`,
  ];
}

function sourceDetails(id = ID) {
  return [
    detailRecord(
      `data/details/${DAY}/${id}.json`,
      detailPayload(id),
    ),
  ];
}

function valueBytes() {
  return prettyBytes({
    ok: true,
    date: DAY,
    source: "local_value_file",
    count: 0,
    picks: [],
  });
}

function valueAuditBytes() {
  return prettyBytes({
    ok: true,
    date: DAY,
    generatedAt: "2026-07-08T23:00:00.000Z",
    source: "value_audit_test",
  });
}

function validPlanCSourceBytes() {
  const prediction = {
    schema: "ai-matchlab.plan-c-shadow-prediction.v1.2",
    canonicalFixtureId: ID,
    identityCategory: "both",
    eloApplied: true,
    planCPick: true,
    baseline: { pOver25: 0.55 },
    adjusted: { pOver25: 0.61 },
    snapshotRetrievedAt: "2026-07-08T10:00:00.000Z",
    predictionCreatedAt: "2026-07-08T10:05:00.000Z",
    kickoffUtc: "2026-07-08T18:00:00.000Z",
  };
  prediction.predictionSignature = planCPredictionSignature(prediction);

  return prettyBytes({
    schema: "ai-matchlab.plan-c-shadow-day.v1",
    ok: true,
    available: true,
    mode: "SHADOW",
    productionEligible: false,
    date: DAY,
    generatedAt: "2026-07-08T10:06:00.000Z",
    sourcePredictionSetHash: "a".repeat(64),
    count: 1,
    pickCount: 1,
    entries: [
      {
        prediction,
        settlement: { state: "PENDING", truth: null },
      },
    ],
  });
}

function buildInput(overrides = {}) {
  return {
    dayKey: DAY,
    sourceManifestBytes: prettyBytes(sourceManifest()),
    fixtureUniverse: fixtureUniverse(),
    fixturesAll: fixturesAll(),
    detailInventoryPaths: detailInventory(),
    sourceDetails: sourceDetails(),
    existingDeployDetails: [],
    preserveExistingDetails: true,
    overlay: overlay(),
    valueBytes: valueBytes(),
    valueAuditBytes: null,
    planCSourceBytes: null,
    planCSourceMissing: true,
    buildTimestamp: BUILD_AT,
    ...overrides,
  };
}

function lfNormalizedSourceSha256(relativeUrl) {
  const text = readFileSync(
    new URL(relativeUrl, import.meta.url),
    "utf8",
  ).replace(/\r\n?/gu, "\n");
  return createHash("sha256")
    .update(text, "utf8")
    .digest("hex");
}

function decode(row) {
  return Buffer.from(row.contentBase64, "base64");
}

test("materializes a deterministic zero-authority coupled release bundle", () => {
  const left = buildAutonomousRepairPublicationCoupledMaterialBundle(
    buildInput(),
  );
  const right = buildAutonomousRepairPublicationCoupledMaterialBundle(
    buildInput(),
  );

  assert.equal(left.schema, AUTONOMOUS_REPAIR_PUBLICATION_COUPLED_MATERIAL_SCHEMA);
  assert.equal(left.bundleFingerprint, right.bundleFingerprint);
  assert.deepEqual(left, right);
  assert.equal(left.requiresTargetStateVerification, true);
  assert.deepEqual(left.authority, {
    readOnly: true,
    filesystemWriteAuthorized: false,
    repairAuthorized: false,
    executionAuthorized: false,
    rollbackExecutionAuthorized: false,
    workflowMutationAuthorized: false,
    authorizationGranted: false,
  });
  assert.deepEqual(
    validateAutonomousRepairPublicationCoupledMaterialBundle(left),
    { ok: true, errors: [] },
  );
});

test("keeps frozen Value out of mutations while binding its exact bytes", () => {
  const artifact = buildAutonomousRepairPublicationCoupledMaterialBundle(
    buildInput(),
  );
  const valuePath = `data/deploy-snapshots/${DAY}/value.json`;

  assert.equal(
    artifact.mutations.some(row => row.targetPath === valuePath),
    false,
  );
  const binding = artifact.immutableBindings.find(
    row => row.targetPath === valuePath,
  );
  assert.ok(binding);
  assert.equal(binding.role, "IMMUTABLE_FROZEN_VALUE");
  assert.deepEqual(decode(binding), valueBytes());

  const manifestRow = artifact.mutations.find(
    row => row.role === "DERIVED_MANIFEST",
  );
  const manifest = JSON.parse(decode(manifestRow).toString("utf8"));
  assert.equal(typeof manifest.fileHashes["value.json"], "string");
});

test("derives the missing-source Plan C payload and audit with production bytes", () => {
  const artifact = buildAutonomousRepairPublicationCoupledMaterialBundle(
    buildInput(),
  );
  const shadow = artifact.mutations.find(
    row => row.role === "DERIVED_PLAN_C_SHADOW",
  );
  const audit = artifact.mutations.find(
    row => row.role === "DERIVED_PLAN_C_SHADOW_AUDIT",
  );

  assert.ok(shadow);
  assert.ok(audit);
  assert.equal(decode(shadow).toString("utf8").endsWith("\n"), false);
  assert.equal(decode(audit).toString("utf8").endsWith("\n"), false);
  const payload = JSON.parse(decode(shadow).toString("utf8"));
  const auditPayload = JSON.parse(decode(audit).toString("utf8"));
  assert.equal(payload.available, false);
  assert.equal(payload.reason, "missing_plan_c_shadow_day_artifact");
  assert.equal(auditPayload.exportedAt, BUILD_AT);
  assert.equal(auditPayload.officialPlansUnaffected, true);
  assert.equal(artifact.planC.sourceMissing, true);
  assert.equal(artifact.planC.sourceSha256, null);
});

test("binds a validated available Plan C source by raw source sha", () => {
  const source = validPlanCSourceBytes();
  const artifact = buildAutonomousRepairPublicationCoupledMaterialBundle(
    buildInput({
      planCSourceMissing: false,
      planCSourceBytes: source,
    }),
  );

  assert.equal(artifact.planC.declared, true);
  assert.equal(artifact.planC.sourceMissing, false);
  assert.match(artifact.planC.sourceSha256, /^[0-9a-f]{64}$/u);
  assert.equal(artifact.planC.available, true);
  assert.equal(artifact.planC.count, 1);
  assert.equal(artifact.planC.pickCount, 1);
});

test("preserves declared value-audit as an immutable release binding", () => {
  const auditBytes = valueAuditBytes();
  const artifact = buildAutonomousRepairPublicationCoupledMaterialBundle(
    buildInput({
      sourceManifestBytes: prettyBytes(
        sourceManifest({ planC: true, valueAudit: true }),
      ),
      valueAuditBytes: auditBytes,
    }),
  );

  const path = `data/deploy-snapshots/${DAY}/value-audit.json`;
  const binding = artifact.immutableBindings.find(row => row.targetPath === path);
  assert.ok(binding);
  assert.deepEqual(decode(binding), auditBytes);
  assert.equal(
    artifact.mutations.some(row => row.targetPath === path),
    false,
  );
});

test("legacy manifests without Plan C do not invent shadow release files", () => {
  const artifact = buildAutonomousRepairPublicationCoupledMaterialBundle(
    buildInput({
      sourceManifestBytes: prettyBytes(sourceManifest({ planC: false })),
      planCSourceMissing: false,
      planCSourceBytes: null,
    }),
  );

  assert.equal(artifact.planC.declared, false);
  assert.equal(
    artifact.mutations.some(row => row.targetPath.includes("plan-c-shadow")),
    false,
  );
});

test("fails closed on ambiguous or missing coupled Plan C source state", () => {
  assert.throws(
    () =>
      buildAutonomousRepairPublicationCoupledMaterialBundle(
        buildInput({
          planCSourceMissing: true,
          planCSourceBytes: validPlanCSourceBytes(),
        }),
      ),
    /plan_c_source_ambiguous/u,
  );

  assert.throws(
    () =>
      buildAutonomousRepairPublicationCoupledMaterialBundle(
        buildInput({
          planCSourceMissing: false,
          planCSourceBytes: null,
        }),
      ),
    /plan_c_source_required/u,
  );
});

test("fails closed on frozen value-audit binding mismatch and incomplete authoritative detail inventory", () => {
  assert.throws(
    () =>
      buildAutonomousRepairPublicationCoupledMaterialBundle(
        buildInput({
          sourceManifestBytes: prettyBytes(
            sourceManifest({ planC: true, valueAudit: true }),
          ),
          valueAuditBytes: null,
        }),
      ),
    /value_audit_binding_mismatch/u,
  );

  assert.throws(
    () =>
      buildAutonomousRepairPublicationCoupledMaterialBundle(
        buildInput({
          detailInventoryPaths: [],
        }),
      ),
    /detail_inventory_missing_fixture/u,
  );
});

test("derives fixture and detail mutations from authoritative pure-builder inputs", () => {
  const artifact =
    buildAutonomousRepairPublicationCoupledMaterialBundle(
      buildInput(),
    );

  const fixtures = artifact.mutations.find(
    row => row.role === "DERIVED_FIXTURES",
  );
  const detail = artifact.mutations.find(
    row => row.role === "DERIVED_DETAIL",
  );

  assert.ok(fixtures);
  assert.ok(detail);

  const fixturePayload =
    JSON.parse(decode(fixtures).toString("utf8"));
  assert.equal(fixturePayload.ok, true);
  assert.equal(fixturePayload.date, DAY);
  assert.equal(fixturePayload.count, 1);
  assert.equal(
    fixturePayload.fixtures[0].canonicalId,
    ID,
  );

  const detailPayloadDecoded =
    JSON.parse(decode(detail).toString("utf8"));
  assert.equal(
    detailPayloadDecoded.basic.canonicalId,
    ID,
  );

  assert.equal(
    artifact.producerProof.inputBindings.preserveExistingDetails,
    true,
  );
  assert.equal(
    artifact.producerProof.inputBindings.identityOverlayApplied,
    true,
  );
});

test("rejects legacy caller-supplied derived outputs instead of trusting them", () => {
  assert.throws(
    () =>
      buildAutonomousRepairPublicationCoupledMaterialBundle({
        ...buildInput(),
        fixturesOutput: {
          relativePath:
            `data/deploy-snapshots/${DAY}/fixtures.json`,
          action: "write",
          content: { forged: true },
        },
      }),
    /unsupported_input:fixturesOutput/u,
  );

  assert.throws(
    () =>
      buildAutonomousRepairPublicationCoupledMaterialBundle({
        ...buildInput(),
        detailOutputs: [],
      }),
    /unsupported_input:detailOutputs/u,
  );

  assert.throws(
    () =>
      buildAutonomousRepairPublicationCoupledMaterialBundle({
        ...buildInput(),
        completeDayDetailSet: true,
      }),
    /unsupported_input:completeDayDetailSet/u,
  );
});

test("requires the canonical-only publication universe contract", () => {
  assert.throws(
    () =>
      buildAutonomousRepairPublicationCoupledMaterialBundle(
        buildInput({
          fixtureUniverse: {
            ...fixtureUniverse(),
            source: "synthetic_test_source",
          },
        }),
      ),
    /fixture_universe_invalid/u,
  );

  assert.throws(
    () =>
      buildAutonomousRepairPublicationCoupledMaterialBundle(
        buildInput({
          fixtureUniverse: {
            ...fixtureUniverse(),
            snapshotRescuedCount: 1,
          },
        }),
      ),
    /fixture_universe_invalid/u,
  );
});

test("producer policy remains pinned to the captured LF-normalized authoritative sources", () => {
  const policy =
    AUTONOMOUS_REPAIR_PUBLICATION_PRODUCER_POLICY;

  assert.equal(
    policy.producers.fixtureUniverse.normalizedSourceSha256,
    lfNormalizedSourceSha256("./day-fixture-universe.js"),
  );
  assert.equal(
    policy.producers.fixtures.normalizedSourceSha256,
    lfNormalizedSourceSha256(
      "../jobs/p0c-p4-build-deploy-snapshot-fixtures.js",
    ),
  );
  assert.equal(
    policy.producers.details.normalizedSourceSha256,
    lfNormalizedSourceSha256(
      "../jobs/p0c-p4-build-deploy-snapshot-details.js",
    ),
  );
  assert.equal(
    policy.producers.manifest.normalizedSourceSha256,
    lfNormalizedSourceSha256(
      "../jobs/p0c-p4-build-deploy-snapshot-manifest.js",
    ),
  );
  assert.equal(
    policy.producers.releaseContract.normalizedSourceSha256,
    lfNormalizedSourceSha256(
      "./deploy-snapshot-release-contract.js",
    ),
  );
  assert.equal(
    policy.producers.planC.normalizedSourceSha256,
    lfNormalizedSourceSha256(
      "../value/plan-c-shadow-export.js",
    ),
  );

  const artifact =
    buildAutonomousRepairPublicationCoupledMaterialBundle(
      buildInput(),
    );
  assert.equal(
    artifact.producerProof.sourceDigestMode,
    "lf_normalized_sha256",
  );
  assert.match(
    artifact.producerProof.producerPolicyFingerprint,
    /^[0-9a-f]{64}$/u,
  );
});

test("validator rejects content tampering and latest remains outside the bundle", () => {
  const artifact = buildAutonomousRepairPublicationCoupledMaterialBundle(
    buildInput(),
  );
  assert.equal(
    [...artifact.mutations, ...artifact.immutableBindings].some(row =>
      row.targetPath.endsWith("/latest.json"),
    ),
    false,
  );

  const tampered = structuredClone(artifact);
  tampered.mutations[0].contentBase64 = Buffer.from("{}", "utf8").toString("base64");
  const validation = validateAutonomousRepairPublicationCoupledMaterialBundle(
    tampered,
  );
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.includes("mutation_material_invalid"));

  const producerTampered = structuredClone(artifact);
  producerTampered.producerProof.inputBindings.fixtureUniverseSha256 =
    "0".repeat(64);
  const producerValidation =
    validateAutonomousRepairPublicationCoupledMaterialBundle(
      producerTampered,
    );
  assert.equal(producerValidation.ok, false);
  assert.ok(
    producerValidation.errors.includes(
      "bundle_fingerprint_mismatch",
    ),
  );
});
