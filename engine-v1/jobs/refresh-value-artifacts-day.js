import {
  assertValueFixtureUniverseMembershipParity,
  assertValueFixtureUniverseParity,
  valueFixtureUniverseContract
} from "../core/value-fixture-universe.js";
/**
 * refresh-value-artifacts-day.js
 *
 * Rebuilds downstream Value artifacts after canonical fixtures have changed.
 *
 * Safety contract:
 *   - This job is VALUE-only. It must not rewrite deploy snapshot fixtures.json
 *     because existing snapshot rows can contain rich runtime/reconciliation UI
 *     metadata that canonical fixture rows do not carry.
 *   - It copies fresh Plan A value/audit into the deploy snapshot, rebuilds Plan B
 *     observation and value-comparison, then updates manifest value metadata only.
 *   - If the deploy snapshot is missing canonical fixture ids, only an exact
 *     intraday publicationUniverse.deferredFixtureIds gap may proceed.
 *     Every other canonical/snapshot mismatch still fails loudly.
 *   - Even for an accepted deferred publication gap, publication-facing Value
 *     picks must remain inside the already-published snapshot fixture universe.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { athensDayKey } from "../core/daykey.js";
import {
  canonicalFileSha256,
  computeDeploySnapshotManifestHash
} from "../core/deploy-snapshot-release-contract.js";
import { buildValueDay } from "../core/build-value-day.js";
import { fixturesForSnapshotDay } from "../core/day-fixture-universe.js";
import { deriveValueFromOdds } from "./derive-value-from-odds.js";
import {
  buildValueA2B2Day,
  shouldFreezeAdjustedValueObservations
} from "./build-value-a2-b2-day.js";
import { buildValuePlanComparisonDay } from "./build-value-plan-comparison-day.js";
import { verifyArtifactFreshnessDay } from "./verify-artifact-freshness-day.js";
import { runSnapshotInvariantCheck } from "./run-snapshot-invariant-check.js";
import { buildDayReport } from "./build-day-report.js";
import { buildFoundationIntegrityReport } from "./build-foundation-integrity-report.js";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import {
  ensurePlanAObservationDay,
  isPlanAObservationDay,
  readPlanAObservationDay
} from "../value/plan-a-observation.js";
import {
  resolvePlanAPublicationPayload
} from "../value/plan-a-publication-authority.js";

function isDayKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(String(value || ""));
}

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonStable(filePath, payload) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export async function buildPlanARefreshCandidate(
  dayKey,
  options = {}
) {
  const date =
    String(dayKey || "").trim();

  const observationPeriod =
    options.observationPeriod === true;

  const observationFileExists =
    options.observationFileExists === true;

  const existingObservation =
    options.existingObservation || null;

  if (
    observationPeriod &&
    observationFileExists &&
    existingObservation?.ok !== true
  ) {
    throw new Error(
      "invalid_existing_plan_a_observation_for_refresh_candidate"
    );
  }

  const frozenProduction =
    observationPeriod &&
    observationFileExists &&
    existingObservation?.ok === true;

  const buildValue =
    typeof options.buildValue === "function"
      ? options.buildValue
      : buildValueDay;

  if (!frozenProduction) {
    return {
      planA:
        await buildValue(
          date,
          { rebuild: true }
        ),
      productionPreserved: false,
      candidateIsolated: false
    };
  }

  const tempRoot =
    options.tempRoot
      ? path.resolve(
          String(options.tempRoot)
        )
      : os.tmpdir();

  const candidateDir =
    fs.mkdtempSync(
      path.join(
        tempRoot,
        "aiml-plan-a-refresh-" + date + "-"
      )
    );

  const outputPath =
    path.join(
      candidateDir,
      "value.json"
    );

  const auditPath =
    path.join(
      candidateDir,
      "value-audit.json"
    );

  try {
    const planA =
      await buildValue(
        date,
        {
          rebuild: true,
          outputPath,
          auditPath
        }
      );

    return {
      planA,
      productionPreserved: true,
      candidateIsolated: true
    };
  } finally {
    fs.rmSync(
      candidateDir,
      {
        recursive: true,
        force: true
      }
    );
  }
}

function bytesOfFile(filePath) {
  try {
    return fs.existsSync(filePath) ? fs.statSync(filePath).size : 0;
  } catch {
    return 0;
  }
}

function mb(bytes) {
  return Number((Number(bytes || 0) / 1024 / 1024).toFixed(2));
}

function parseArtifactTime(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  const text = String(value || "").trim();
  if (!text) return null;

  if (/^\d+(?:\.\d+)?$/u.test(text)) {
    const numeric = Number(text);
    return Number.isFinite(numeric) ? numeric : null;
  }

  const t = Date.parse(text);
  return Number.isFinite(t) ? t : null;
}

function latestCanonicalFixtureUpdatedAt(dayKey) {
  const dir = resolveDataPath("canonical-fixtures", dayKey);
  if (!fs.existsSync(dir)) return null;

  let latest = null;
  for (const name of fs.readdirSync(dir).filter(file => file.endsWith(".json"))) {
    const payload = readJsonSafe(path.join(dir, name), null);
    const at = parseArtifactTime(payload?.updatedAt);
    if (Number.isFinite(at) && (latest === null || at > latest)) latest = at;
  }
  return latest;
}

function fileUpdatedAtMs(filePath) {
  try {
    return fs.existsSync(filePath) ? fs.statSync(filePath).mtimeMs : null;
  } catch {
    return null;
  }
}

function isoOrNull(ms) {
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    date: null,
    skipPlanB: false,
    skipComparison: false,
    updateLatest: undefined
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();

    if (arg === "--date" && argv[i + 1]) {
      out.date = String(argv[++i]).trim();
      continue;
    }

    if (arg.startsWith("--date=")) {
      out.date = arg.slice("--date=".length);
      continue;
    }

    if (isDayKey(arg)) {
      out.date = arg;
      continue;
    }

    if (arg === "--skip-plan-b") {
      out.skipPlanB = true;
      continue;
    }

    if (arg === "--skip-comparison") {
      out.skipComparison = true;
      continue;
    }

    if (arg === "--update-latest") {
      out.updateLatest = true;
      continue;
    }

    if (arg === "--no-update-latest") {
      out.updateLatest = false;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      out.help = true;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return out;
}

function canonicalIdsForDay(dayKey) {
  /*
   * Coverage must use the same canonical-only publishable universe
   * as the deploy snapshot exporter.
   *
   * This prevents cross-source duplicate provider identities from
   * producing false missing-canonical failures.
   */
  return fixturesForSnapshotDay(dayKey)
    .fixtures
    .map(row => String(row?.canonicalId || row?.matchId || "").trim())
    .filter(Boolean);
}

function snapshotFixtureIds(dayKey) {
  const payload = readJsonSafe(resolveDataPath("deploy-snapshots", dayKey, "fixtures.json"), null);
  const rows = Array.isArray(payload?.fixtures) ? payload.fixtures : [];
  return rows
    .map(row => String(row?.canonicalId || row?.matchId || "").trim())
    .filter(Boolean);
}

function cleanFixtureId(value) {
  return String(value || "").trim();
}

function cleanedFixtureIds(values) {
  return (Array.isArray(values) ? values : [])
    .map(cleanFixtureId)
    .filter(Boolean);
}

function uniqueFixtureIds(values) {
  return [...new Set(cleanedFixtureIds(values))];
}

function sameFixtureIdSet(left, right) {
  const a = [...left].sort();
  const b = [...right].sort();

  return JSON.stringify(a) === JSON.stringify(b);
}

export function evaluateValueRefreshUniverseParity({
  frozenProduction = false,
  planACandidate = null,
  publishedPlanA = null,
  planA2 = null,
  planB = null,
  planB2 = null
} = {}) {
  const candidateUniverse =
    planACandidate?.fixtureUniverse ||
    null;

  const publishedPlanAUniverse =
    publishedPlanA?.fixtureUniverse ||
    publishedPlanA?.sourceContract?.fixtureUniverse ||
    null;

  const planA2Universe =
    planA2?.fixtureUniverse ||
    null;

  const planBUniverse =
    planB?.sourceContract?.fixtureUniverse ||
    null;

  const planB2Universe =
    planB2?.sourceContract?.fixtureUniverse ||
    null;

  if (!frozenProduction) {
    return {
      mode:
        "strict_current_cohort",

      A_B:
        planB
          ? assertValueFixtureUniverseParity(
              candidateUniverse,
              planBUniverse
            )
          : null,

      A_A2:
        assertValueFixtureUniverseParity(
          candidateUniverse,
          planA2Universe
        ),

      A_B2:
        assertValueFixtureUniverseParity(
          candidateUniverse,
          planB2Universe
        )
    };
  }

  const frozenReferenceUniverse =
    planBUniverse ||
    planA2Universe ||
    planB2Universe;

  if (!frozenReferenceUniverse) {
    throw new Error(
      "FROZEN_VALUE_UNIVERSE_REFERENCE_MISSING"
    );
  }

  const frozenReference =
    valueFixtureUniverseContract(
      frozenReferenceUniverse
    );

  const currentMembership =
    assertValueFixtureUniverseMembershipParity(
      candidateUniverse,
      frozenReferenceUniverse
    );

  const frozenPlanAPicks =
    validateValuePlanPicksAgainstPublishedSnapshot(
      frozenReference.canonicalIds,
      {
        A: publishedPlanA
      }
    );

  if (!frozenPlanAPicks.ok) {
    const error =
      new Error(
        "FROZEN_PLAN_A_OUTSIDE_VALUE_UNIVERSE"
      );

    error.details =
      frozenPlanAPicks;

    throw error;
  }

  return {
    mode:
      "frozen_observation_cohort",

    currentVsFrozenMembership:
      currentMembership,

    A_frozen_strict:
      publishedPlanAUniverse
        ? assertValueFixtureUniverseParity(
            publishedPlanAUniverse,
            frozenReferenceUniverse
          )
        : null,

    legacyPlanAUniverseMissing:
      !publishedPlanAUniverse,

    frozenPlanAPicks,

    A2_B:
      planB
        ? assertValueFixtureUniverseParity(
            planA2Universe,
            planBUniverse
          )
        : null,

    A2_B2:
      assertValueFixtureUniverseParity(
        planA2Universe,
        planB2Universe
      ),

    B_B2:
      planB
        ? assertValueFixtureUniverseParity(
            planBUniverse,
            planB2Universe
          )
        : null
  };
}

export function evaluateValueRefreshSnapshotCoverage({
  canonicalIds = [],
  snapshotIds = [],
  publicationUniverse = null
} = {}) {
  const canonicalRaw = cleanedFixtureIds(canonicalIds);
  const snapshotRaw = cleanedFixtureIds(snapshotIds);

  const canonical = uniqueFixtureIds(canonicalRaw);
  const snapshot = uniqueFixtureIds(snapshotRaw);

  const identitiesUnique =
    canonical.length === canonicalRaw.length &&
    snapshot.length === snapshotRaw.length;

  const canonicalSet = new Set(canonical);
  const snapshotSet = new Set(snapshot);

  const missingCanonicalIds = canonical
    .filter(id => !snapshotSet.has(id))
    .sort();

  const extraSnapshotIds = snapshot
    .filter(id => !canonicalSet.has(id))
    .sort();

  const fullCanonicalCoverage =
    identitiesUnique &&
    missingCanonicalIds.length === 0 &&
    extraSnapshotIds.length === 0;

  const rawDeferredFixtureIds = cleanedFixtureIds(
    publicationUniverse?.deferredFixtureIds
  );

  const deferredFixtureIds =
    uniqueFixtureIds(rawDeferredFixtureIds)
      .sort();

  const deferredIdsUnique =
    rawDeferredFixtureIds.length ===
    deferredFixtureIds.length;

  const declaredDeferredFixtureCount =
    Number(publicationUniverse?.deferredFixtureCount);

  const declaredCurrentFixtureCount =
    Number(publicationUniverse?.currentFixtureCount);

  const declaredPublishedFixtureCount =
    Number(publicationUniverse?.publishedFixtureCount);

  const exactDeferredPublicationGap = Boolean(
    identitiesUnique &&
    publicationUniverse &&
    typeof publicationUniverse === "object" &&
    publicationUniverse.mode === "intraday_status_only" &&
    deferredFixtureIds.length > 0 &&
    deferredIdsUnique &&
    Number.isInteger(declaredDeferredFixtureCount) &&
    Number.isInteger(declaredCurrentFixtureCount) &&
    Number.isInteger(declaredPublishedFixtureCount) &&
    declaredDeferredFixtureCount === deferredFixtureIds.length &&
    declaredCurrentFixtureCount === canonical.length &&
    declaredPublishedFixtureCount === snapshot.length &&
    declaredCurrentFixtureCount -
      declaredPublishedFixtureCount ===
      declaredDeferredFixtureCount &&
    extraSnapshotIds.length === 0 &&
    sameFixtureIdSet(
      missingCanonicalIds,
      deferredFixtureIds
    )
  );

  return {
    ok:
      fullCanonicalCoverage ||
      exactDeferredPublicationGap,

    mode:
      fullCanonicalCoverage
        ? "full_canonical"
        : (
            exactDeferredPublicationGap
              ? "intraday_deferred_publication"
              : "coverage_mismatch"
          ),

    canonicalFixtures:
      canonical.length,

    snapshotFixtures:
      snapshot.length,

    missingCanonicalIds,
    extraSnapshotIds,

    publicationMode:
      publicationUniverse?.mode || null,

    declaredCurrentFixtureCount:
      Number.isInteger(declaredCurrentFixtureCount)
        ? declaredCurrentFixtureCount
        : null,

    declaredPublishedFixtureCount:
      Number.isInteger(declaredPublishedFixtureCount)
        ? declaredPublishedFixtureCount
        : null,

    declaredDeferredFixtureCount:
      Number.isInteger(declaredDeferredFixtureCount)
        ? declaredDeferredFixtureCount
        : null,

    declaredDeferredFixtureIds:
      deferredFixtureIds,

    deferredPublicationGapAccepted:
      exactDeferredPublicationGap
  };
}

function validateSnapshotCoverageForValueRefresh(dayKey) {
  const canonicalIds = canonicalIdsForDay(dayKey);
  const snapshotIds = snapshotFixtureIds(dayKey);

  const manifest = readJsonSafe(
    resolveDataPath(
      "deploy-snapshots",
      dayKey,
      "manifest.json"
    ),
    null
  );

  return evaluateValueRefreshSnapshotCoverage({
    canonicalIds,
    snapshotIds,
    publicationUniverse:
      manifest?.publicationUniverse || null
  });
}

function valuePickIdentityCandidates(pick) {
  return uniqueFixtureIds([
    pick?.canonicalId,
    pick?.matchId,
    pick?.id,
    pick?.fixtureId
  ]);
}

export function validateValuePlanPicksAgainstPublishedSnapshot(
  snapshotIds,
  plans = {}
) {
  const publishedIds =
    uniqueFixtureIds(snapshotIds);

  const publishedSet =
    new Set(publishedIds);

  const violations = [];

  for (const [planId, payload] of Object.entries(plans || {})) {
    if (!payload || typeof payload !== "object") {
      continue;
    }

    const picks =
      Array.isArray(payload?.picks)
        ? payload.picks
        : [];

    const unpublishedPickIds = [];
    let missingIdentityPickCount = 0;

    for (const pick of picks) {
      const candidates =
        valuePickIdentityCandidates(pick);

      if (!candidates.length) {
        missingIdentityPickCount += 1;
        continue;
      }

      if (
        !candidates.some(id =>
          publishedSet.has(id)
        )
      ) {
        unpublishedPickIds.push(
          candidates[0]
        );
      }
    }

    const uniqueUnpublished =
      [...new Set(unpublishedPickIds)]
        .sort();

    if (
      uniqueUnpublished.length > 0 ||
      missingIdentityPickCount > 0
    ) {
      violations.push({
        planId,
        pickCount: picks.length,
        unpublishedPickCount:
          uniqueUnpublished.length,
        unpublishedPickIds:
          uniqueUnpublished,
        missingIdentityPickCount
      });
    }
  }

  return {
    ok: violations.length === 0,
    publishedFixtureCount:
      publishedIds.length,
    checkedPlanCount:
      Object.values(plans || {})
        .filter(Boolean)
        .length,
    violations
  };
}

function normalizedSnapshotValue(dayKey, planAResult) {
  const valueFile =
    resolveDataPath(
      "value",
      `${dayKey}.json`
    );

  const currentValuePayload =
    readJsonSafe(
      valueFile,
      planAResult || {}
    );

  const publication =
    resolvePlanAPublicationPayload(
      dayKey,
      currentValuePayload
    );

  const valuePayload =
    publication?.payload ||
    currentValuePayload ||
    planAResult ||
    {};

  const picks =
    Array.isArray(valuePayload?.picks)
      ? valuePayload.picks
      : [];

  return {
    ...valuePayload,
    ok: valuePayload?.ok !== false,
    date: dayKey,
    source:
      valuePayload?.source ||
      planAResult?.source ||
      "canonical_fixtures",
    count: picks.length,
    picks,
    publicationAuthority:
      publication?.authority ||
      "current_value_artifact",
    updatedAt:
      valuePayload?.updatedAt ||
      valuePayload?.generatedAt ||
      new Date().toISOString()
  };
}

export function updateSnapshotValueArtifacts(dayKey, planAResult) {
  const snapshotRoot = resolveDataPath("deploy-snapshots", dayKey);
  ensureDir(snapshotRoot);

  const valueOut = normalizedSnapshotValue(dayKey, planAResult);
  const snapshotValueFile = path.join(snapshotRoot, "value.json");
  writeJsonStable(snapshotValueFile, valueOut);

  const valueAudit = readJsonSafe(resolveDataPath("value", "_audit", `${dayKey}.json`), null);
  const valueAuditPresent = Boolean(valueAudit && typeof valueAudit === "object");
  if (valueAuditPresent) {
    writeJsonStable(path.join(snapshotRoot, "value-audit.json"), valueAudit);
  }

  return {
    valueOut,
    valueAuditPresent,
    snapshotValueFile
  };
}

export function updateManifestValueMetadata(dayKey, valueOut, valueAuditPresent, options = {}) {
  const snapshotRoot = resolveDataPath("deploy-snapshots", dayKey);
  const manifestFile = path.join(snapshotRoot, "manifest.json");
  const manifest = readJsonSafe(manifestFile, null);

  if (!manifest || typeof manifest !== "object") {
    return {
      ok: false,
      reason: "missing_snapshot_manifest",
      manifestFile
    };
  }

  const generatedAt = new Date().toISOString();
  const fixturesFile = path.join(snapshotRoot, "fixtures.json");
  const valueFile = path.join(snapshotRoot, "value.json");

  manifest.generatedAt = generatedAt;
  manifest.files = {
    ...(manifest.files || {}),
    value: "value.json",
    valueAudit: valueAuditPresent ? "value-audit.json" : null
  };
  manifest.counts = {
    ...(manifest.counts || {}),
    valuePicks: Number(valueOut?.count || 0)
  };
  const latestCanonicalUpdatedAt = latestCanonicalFixtureUpdatedAt(dayKey);
  const valueArtifactAt = Math.max(
    ...[
      fileUpdatedAtMs(valueFile),
      parseArtifactTime(valueOut?.updatedAt),
      parseArtifactTime(valueOut?.generatedAt)
    ].filter(Number.isFinite)
  );
  const valueSource = String(valueOut?.source || "local_value_file");
  const missingValueWithFixtures = Number(manifest.counts?.fixtures || 0) > 0 && valueSource === "missing_local_value_file";
  const valueFreshAgainstCanonical = !(
    Number.isFinite(latestCanonicalUpdatedAt) &&
    Number.isFinite(valueArtifactAt) &&
    valueArtifactAt < latestCanonicalUpdatedAt
  );

  manifest.valueGate = {
    ...(manifest.valueGate || {}),
    fixtures: Number(manifest.counts?.fixtures || 0),
    valuePicks: Number(valueOut?.count || 0),
    valueSource,
    latestCanonicalUpdatedAt: isoOrNull(latestCanonicalUpdatedAt),
    valueArtifactAt: isoOrNull(valueArtifactAt),
    valueFreshAgainstCanonical,
    ok: !missingValueWithFixtures && valueFreshAgainstCanonical
  };
  manifest.sizes = {
    ...(manifest.sizes || {}),
    fixturesMb: mb(bytesOfFile(fixturesFile)),
    valueMb: mb(bytesOfFile(valueFile))
  };

  manifest.version = "deploy-snapshot-v2";
  manifest.fileHashes = {
    "fixtures.json": canonicalFileSha256(fixturesFile),
    "value.json": canonicalFileSha256(valueFile),
    ...(valueAuditPresent
      ? {
          "value-audit.json": canonicalFileSha256(
            path.join(snapshotRoot, "value-audit.json")
          )
        }
      : {})
  };

  const detailsDir = path.join(snapshotRoot, "details");
  manifest.details = Array.isArray(manifest.details)
    ? manifest.details.map(row => {
        const detailFile = path.join(detailsDir, String(row?.file || ""));
        if (!fs.existsSync(detailFile)) {
          throw new Error(`manifest_detail_missing:${String(row?.file || "")}`);
        }
        return { ...row, sha256: canonicalFileSha256(detailFile) };
      })
    : [];

  manifest.hash = computeDeploySnapshotManifestHash(manifest);

  writeJsonStable(manifestFile, manifest);

  const latestFile = resolveDataPath("deploy-snapshots", "latest.json");
  let updateLatest = options?.updateLatest !== false;

  if (updateLatest && options?.updateLatest !== true) {
    const existingLatest = readJsonSafe(latestFile, null);
    if (existingLatest?.date && String(dayKey) < String(existingLatest.date)) {
      updateLatest = false;
    }
  }

  if (updateLatest) {
    writeJsonStable(latestFile, {
      ok: true,
      date: dayKey,
      generatedAt: manifest.generatedAt,
      manifest: `data/deploy-snapshots/${dayKey}/manifest.json`,
      fixtures: `data/deploy-snapshots/${dayKey}/fixtures.json`,
      value: `data/deploy-snapshots/${dayKey}/value.json`,
      detailsDir: `data/deploy-snapshots/${dayKey}/details`,
      hash: manifest.hash
    });
  }

  return {
    ok: true,
    manifestFile,
    latestFile,
    latestUpdated: updateLatest,
    hash: manifest.hash,
    counts: manifest.counts,
    sizes: manifest.sizes
  };
}

function writeFreshnessReport(dayKey, freshness) {
  const outDir = resolveDataPath("deploy-snapshots", dayKey);
  ensureDir(outDir);
  writeJsonStable(path.join(outDir, "freshness-report.json"), freshness);
}

export async function refreshValueArtifactsDay(dayKey = athensDayKey(), options = {}) {
  const date = String(dayKey || "").trim();
  if (!isDayKey(date)) {
    return { ok: false, reason: "invalid_day_key", dayKey };
  }

  const startedAt = new Date().toISOString();
  const observationPeriod = isPlanAObservationDay(date);
  let existingObservation = null;
  let observationFileExists = false;
  if (observationPeriod) {
    existingObservation = readPlanAObservationDay(date);
    observationFileExists = fs.existsSync(existingObservation.file);
    if (observationFileExists && !existingObservation.ok) {
      return {
        ok: false,
        mode: "refresh_value_artifacts_after_canonical_change",
        date,
        reason: "invalid_existing_plan_a_observation",
        observation: existingObservation
      };
    }
    if (!observationFileExists && date < athensDayKey()) {
      return {
        ok: false,
        mode: "refresh_value_artifacts_after_canonical_change",
        date,
        reason: "missing_historical_plan_a_observation",
        observationFile: existingObservation.file,
        trialStartDate: "2026-07-05"
      };
    }
  }

  const coverage = validateSnapshotCoverageForValueRefresh(date);
  if (!coverage.ok) {
    return {
      ok: false,
      mode: "refresh_value_artifacts_after_canonical_change",
      date,
      reason: "snapshot_fixtures_missing_canonical_rows_full_export_required",
      coverage
    };
  }

  const planABuild =
    await buildPlanARefreshCandidate(
      date,
      {
        observationPeriod,
        observationFileExists,
        existingObservation
      }
    );

  const planA =
    planABuild.planA;
  const snapshotValue = updateSnapshotValueArtifacts(date, planA);
  const planAObservation = observationPeriod
    ? ensurePlanAObservationDay(date, snapshotValue.valueOut, {
        sourcePath: `data/deploy-snapshots/${date}/value.json`,
        provenance: {
          kind: "refresh_value_artifacts_first_freeze",
          note: "First production Plan A output is frozen; later rebuild differences are preserved only as diagnostics."
        }
      })
    : null;
  const manifestUpdate = updateManifestValueMetadata(
    date,
    snapshotValue.valueOut,
    snapshotValue.valueAuditPresent,
    { updateLatest: options.updateLatest }
  );

  const planB = options.skipPlanB === true
    ? null
    : deriveValueFromOdds(date, {
        freeze: shouldFreezeAdjustedValueObservations(date, athensDayKey()),
        outputMode: "plan-b-observation"
      });

  const adjustedPlans = await buildValueA2B2Day(date);
  const planA2 = adjustedPlans?.plans?.A2 || null;
  const planB2 = adjustedPlans?.plans?.B2 || null;

  if (
    adjustedPlans?.ok !== true ||
    planA2?.ok !== true ||
    planB2?.ok !== true
  ) {
    return {
      ok: false,
      mode: "refresh_value_artifacts_after_canonical_change",
      date,
      reason: "adjusted_value_plans_build_failed",
      adjustedPlans
    };
  }

  const publicationValueGuard =
    coverage.deferredPublicationGapAccepted
      ? {
          required: true,
          ...validateValuePlanPicksAgainstPublishedSnapshot(
            snapshotFixtureIds(date),
            {
              A_candidate: planA,
              A: snapshotValue.valueOut,
              A2: planA2,
              B: planB,
              B2: planB2
            }
          )
        }
      : {
          required: false,
          ok: true,
          publishedFixtureCount:
            coverage.snapshotFixtures,
          checkedPlanCount: 0,
          violations: []
        };

  if (!publicationValueGuard.ok) {
    return {
      ok: false,
      mode: "refresh_value_artifacts_after_canonical_change",
      date,
      reason:
        "value_plan_contains_unpublished_fixture_pick",
      coverage,
      publicationValueGuard
    };
  }

  const frozenProduction =
    observationPeriod &&
    observationFileExists &&
    existingObservation?.ok === true;

  const universeParity =
    evaluateValueRefreshUniverseParity({
      frozenProduction,
      planACandidate: planA,
      publishedPlanA:
        snapshotValue.valueOut,
      planA2,
      planB,
      planB2
    });

  const comparison = options.skipComparison === true
    ? null
    : buildValuePlanComparisonDay(date, { write: true });

  const freshness = verifyArtifactFreshnessDay(date);
  writeFreshnessReport(date, freshness);

  const invariant = await runSnapshotInvariantCheck(date);
  const foundationIntegrityReport = buildFoundationIntegrityReport(date);
  writeJsonStable(
    resolveDataPath("foundation-integrity", `${date}.json`),
    foundationIntegrityReport
  );
  const buildReport = buildDayReport(date);
  writeJsonStable(resolveDataPath("build-reports", `${date}.json`), buildReport);

  return {
    ok: freshness.ok !== false
      && invariant?.ok !== false
      && manifestUpdate?.ok !== false
      && planAObservation?.ok !== false
      && adjustedPlans?.ok === true
      && planA2?.ok === true
      && planB2?.ok === true
      && comparison?.ok !== false,
    mode: "refresh_value_artifacts_after_canonical_change",
    safety: "value_only_preserve_snapshot_fixtures",
    date,
    startedAt,
    finishedAt: new Date().toISOString(),
    coverage,
    publicationValueGuard,
    universeParity,
    planA: {
      ok: planA?.ok !== false,
      source: planA?.source || snapshotValue.valueOut?.source || null,
      count: Number(snapshotValue.valueOut?.count || 0)
    },
    planAObservation: planAObservation
      ? {
          ok: planAObservation.ok !== false,
          created: planAObservation.created === true,
          preservedExisting: planAObservation.preservedExisting === true,
          conflict: planAObservation.conflict === true,
          reason: planAObservation.reason || null,
          count: Number(planAObservation.count || 0),
          candidateCount: Number(planAObservation.candidateCount || 0),
          observationSignature: planAObservation.observationSignature || null,
          candidateSignature: planAObservation.candidateSignature || null
        }
      : null,
    snapshot: {
      ok: manifestUpdate?.ok !== false,
      preservedFixtures: true,
      hash: manifestUpdate?.hash || null,
      counts: manifestUpdate?.counts || null,
      latestUpdated: manifestUpdate?.latestUpdated ?? null
    },
    planB: planB
      ? {
          ok: planB?.ok !== false,
          source: planB?.source || null,
          outputMode: planB?.outputMode || null,
          count: Number(planB?.count || 0)
        }
      : null,
    planA2: {
      ok: planA2?.ok === true,
      source: planA2?.source || null,
      count: Number(planA2?.count ?? planA2?.picks?.length ?? 0)
    },
    planB2: {
      ok: planB2?.ok === true,
      source: planB2?.source || null,
      outputMode: planB2?.outputMode || null,
      count: Number(planB2?.count ?? planB2?.picks?.length ?? 0)
    },
    comparison: comparison
      ? {
          ok: comparison?.ok !== false,
          planA: comparison?.plans?.A?.summary || null,
          planA2: comparison?.plans?.A2?.summary || null,
          planB: comparison?.plans?.B?.summary || null,
          planB2: comparison?.plans?.B2?.summary || null
        }
      : null,
    freshness: {
      ok: freshness.ok,
      reasons: freshness.reasons || [],
      staleInputs: freshness.staleInputs?.length || 0,
      staleDerivedArtifacts: freshness.staleDerivedArtifacts?.length || 0
    },
    invariant: {
      ok: invariant?.ok !== false,
      valueSafe: invariant?.valueSafe !== false,
      blocked: invariant?.blocked?.length || 0,
      warnings: invariant?.warnings?.length || 0
    },
    buildReport: {
      clean: buildReport?.clean === true,
      cleanStrict: buildReport?.cleanStrict === true,
      hardFailures: buildReport?.hardFailures || [],
      warnings: buildReport?.warnings || []
    },
    outputs: {
      value: `data/value/${date}.json`,
      valueAudit: `data/value/_audit/${date}.json`,
      snapshotValue: `data/deploy-snapshots/${date}/value.json`,
      snapshotAudit: `data/deploy-snapshots/${date}/value-audit.json`,
      planAObservation: observationPeriod ? `data/value-plans/${date}/plan-a.json` : null,
      planAObservationAudit: observationPeriod ? `data/value-plans/${date}/plan-a-audit.json` : null,
      planB: options.skipPlanB === true ? null : `data/value-plans/${date}/plan-b.json`,
      planBAudit: options.skipPlanB === true ? null : `data/value-plans/${date}/plan-b-audit.json`,
      planA2: `data/value-plans/${date}/plan-a2.json`,
      planA2Audit: `data/value-plans/${date}/plan-a2-audit.json`,
      planB2: `data/value-plans/${date}/plan-b2.json`,
      planB2Audit: `data/value-plans/${date}/plan-b2-audit.json`,
      comparison: options.skipComparison === true ? null : `data/value-comparison/${date}.json`,
      freshness: `data/deploy-snapshots/${date}/freshness-report.json`,
      invariant: `data/deploy-snapshots/${date}/invariant-report.json`,
      buildReport: `data/build-reports/${date}.json`
    }
  };
}

function usage() {
  return [
    "Usage:",
    "  node engine-v1/jobs/refresh-value-artifacts-day.js --date=YYYY-MM-DD",
    "",
    "Rebuilds Plan A/A2 value artifacts, Plan B/B2 observations, deploy snapshot value/audit,",
    "four-plan comparison, freshness, invariant, and build reports after canonical fixtures changed,",
    "without rewriting deploy snapshot fixtures.json."
  ].join("\n");
}

const isCli = (() => {
  try {
    return path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1] || "");
  } catch {
    return false;
  }
})();

if (isCli) {
  (async () => {
    try {
      const args = parseArgs();
      if (args.help) {
        console.log(usage());
        return;
      }

      const date = args.date || athensDayKey();
      const result = await refreshValueArtifactsDay(date, args);
      console.log(JSON.stringify(result, null, 2));
      if (!result.ok) process.exitCode = 1;
    } catch (error) {
      console.error(JSON.stringify({
        ok: false,
        stage: "refresh_value_artifacts_failed",
        error: error?.message || String(error)
      }, null, 2));
      process.exitCode = 1;
    }
  })();
}
