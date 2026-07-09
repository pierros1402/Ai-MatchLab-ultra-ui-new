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
 *   - If the existing deploy snapshot does not already cover every canonical
 *     fixture id for the day, the job fails loudly instead of shrinking/rewriting
 *     fixtures. A full snapshot export/merge must handle that case.
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { athensDayKey } from "../core/daykey.js";
import { buildValueDay } from "../core/build-value-day.js";
import { canonicalFixturesForDay } from "../core/day-fixture-universe.js";
import { deriveValueFromOdds } from "./derive-value-from-odds.js";
import { buildValuePlanComparisonDay } from "./build-value-plan-comparison-day.js";
import { verifyArtifactFreshnessDay } from "./verify-artifact-freshness-day.js";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";

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

function sha256Json(payload) {
  return crypto
    .createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
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
  return canonicalFixturesForDay(dayKey)
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

function validateSnapshotCoversCanonical(dayKey) {
  const canonicalIds = canonicalIdsForDay(dayKey);
  const snapshotIds = snapshotFixtureIds(dayKey);
  const snapshotSet = new Set(snapshotIds);
  const missingCanonicalIds = canonicalIds.filter(id => !snapshotSet.has(id));

  return {
    ok: missingCanonicalIds.length === 0,
    canonicalFixtures: canonicalIds.length,
    snapshotFixtures: snapshotIds.length,
    missingCanonicalIds
  };
}

function normalizedSnapshotValue(dayKey, planAResult) {
  const valueFile = resolveDataPath("value", `${dayKey}.json`);
  const valuePayload = readJsonSafe(valueFile, planAResult || {});
  const picks = Array.isArray(valuePayload?.picks)
    ? valuePayload.picks
    : Array.isArray(planAResult?.picks)
      ? planAResult.picks
      : [];

  return {
    ...valuePayload,
    ok: valuePayload?.ok !== false,
    date: dayKey,
    source: valuePayload?.source || planAResult?.source || "canonical_fixtures",
    count: picks.length,
    picks,
    updatedAt: valuePayload?.updatedAt || valuePayload?.generatedAt || new Date().toISOString()
  };
}

function updateSnapshotValueArtifacts(dayKey, planAResult) {
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

function updateManifestValueMetadata(dayKey, valueOut, valueAuditPresent, options = {}) {
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
  manifest.valueGate = {
    ...(manifest.valueGate || {}),
    fixtures: Number(manifest.counts?.fixtures || 0),
    valuePicks: Number(valueOut?.count || 0),
    valueSource: String(valueOut?.source || "local_value_file"),
    ok: !(Number(manifest.counts?.fixtures || 0) > 0 && String(valueOut?.source || "") === "missing_local_value_file")
  };
  manifest.sizes = {
    ...(manifest.sizes || {}),
    fixturesMb: mb(bytesOfFile(fixturesFile)),
    valueMb: mb(bytesOfFile(valueFile))
  };

  manifest.hash = sha256Json({
    date: manifest.date,
    counts: manifest.counts,
    fixturesSource: manifest.fixturesSource,
    staticMinTargetFixtures: manifest.staticMinTargetFixtures,
    minTargetFixtures: manifest.minTargetFixtures,
    minTargetFixtureSource: manifest.minTargetFixtureSource,
    canonicalCoverageFixtureCount: manifest.canonicalCoverageFixtureCount,
    coverage: manifest.coverage,
    sizes: manifest.sizes,
    details: Array.isArray(manifest.details)
      ? manifest.details.map(x => ({
          file: x.file,
          bytes: x.bytes,
          hasTravel: x.hasTravel,
          hasPlayerUsage: x.hasPlayerUsage,
          hasTeamNews: x.hasTeamNews,
          hasValue: x.hasValue
        }))
      : []
  });

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
  const coverage = validateSnapshotCoversCanonical(date);
  if (!coverage.ok) {
    return {
      ok: false,
      mode: "refresh_value_artifacts_after_canonical_change",
      date,
      reason: "snapshot_fixtures_missing_canonical_rows_full_export_required",
      coverage
    };
  }

  const planA = await buildValueDay(date, { rebuild: true });
  const snapshotValue = updateSnapshotValueArtifacts(date, planA);
  const manifestUpdate = updateManifestValueMetadata(
    date,
    snapshotValue.valueOut,
    snapshotValue.valueAuditPresent,
    { updateLatest: options.updateLatest }
  );

  const planB = options.skipPlanB === true
    ? null
    : deriveValueFromOdds(date, {
        freeze: false,
        outputMode: "plan-b-observation"
      });

  const comparison = options.skipComparison === true
    ? null
    : buildValuePlanComparisonDay(date, { write: true });

  const freshness = verifyArtifactFreshnessDay(date);
  writeFreshnessReport(date, freshness);

  return {
    ok: freshness.ok !== false && manifestUpdate?.ok !== false && comparison?.ok !== false,
    mode: "refresh_value_artifacts_after_canonical_change",
    safety: "value_only_preserve_snapshot_fixtures",
    date,
    startedAt,
    finishedAt: new Date().toISOString(),
    coverage,
    planA: {
      ok: planA?.ok !== false,
      source: planA?.source || snapshotValue.valueOut?.source || null,
      count: Number(snapshotValue.valueOut?.count || 0)
    },
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
    comparison: comparison
      ? {
          ok: comparison?.ok !== false,
          planA: comparison?.plans?.A?.summary || null,
          planB: comparison?.plans?.B?.summary || null
        }
      : null,
    freshness: {
      ok: freshness.ok,
      reasons: freshness.reasons || [],
      staleInputs: freshness.staleInputs?.length || 0,
      staleDerivedArtifacts: freshness.staleDerivedArtifacts?.length || 0
    },
    outputs: {
      value: `data/value/${date}.json`,
      valueAudit: `data/value/_audit/${date}.json`,
      snapshotValue: `data/deploy-snapshots/${date}/value.json`,
      snapshotAudit: `data/deploy-snapshots/${date}/value-audit.json`,
      planB: options.skipPlanB === true ? null : `data/value-plans/${date}/plan-b.json`,
      planBAudit: options.skipPlanB === true ? null : `data/value-plans/${date}/plan-b-audit.json`,
      comparison: options.skipComparison === true ? null : `data/value-comparison/${date}.json`,
      freshness: `data/deploy-snapshots/${date}/freshness-report.json`
    }
  };
}

function usage() {
  return [
    "Usage:",
    "  node engine-v1/jobs/refresh-value-artifacts-day.js --date=YYYY-MM-DD",
    "",
    "Rebuilds Plan A value/audit, deploy snapshot value/audit, Plan B observation,",
    "value comparison, and freshness report after canonical fixtures changed,",
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
