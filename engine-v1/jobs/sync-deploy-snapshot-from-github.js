/**
 * Strict runtime snapshot synchronizer.
 *
 * Contract:
 *   - Every sync is pinned to one immutable Git commit SHA.
 *   - The complete day directory is assembled in staging and validated before
 *     the served directory is replaced.
 *   - Stale/orphan files disappear because promotion replaces the whole day.
 *   - The HTTP engine runs this module in a CHILD PROCESS; filesystem/network
 *     work never blocks the web server event loop.
 *   - latest.json is promoted last and only when it is bound to the same day and
 *     manifest hash at the same immutable commit.
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  canonicalTextBuffer,
  canonicalBufferSha256,
  computeDeploySnapshotManifestHash,
  validateDeploySnapshotManifest
} from "../core/deploy-snapshot-release-contract.js";
import { resolveDataPath } from "../storage/data-root.js";
import { athensDayKey, shiftDay } from "../core/daykey.js";
import { validatePlanCShadowExportPayload } from "../value/plan-c-shadow-export.js";

const DEFAULT_REPO = process.env.SNAPSHOT_SYNC_REPO || "pierros1402/Ai-MatchLab-ultra-ui-new";
const DEFAULT_REF = process.env.SNAPSHOT_SYNC_BRANCH || "main";
const USER_AGENT = "aimatchlab-strict-snapshot-sync/2";
const FETCH_TIMEOUT_MS = Number(process.env.SNAPSHOT_SYNC_FETCH_TIMEOUT_MS || 30000);
const CONCURRENCY = Math.max(1, Math.min(8, Number(process.env.SNAPSHOT_SYNC_CONCURRENCY || 4)));
const MULTI_ODDS_DAYS_FORWARD = Math.max(0, Number(process.env.SNAPSHOT_SYNC_MULTI_ODDS_DAYS || 7));
const SHA_RE = /^[0-9a-f]{40}$/i;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const CORE_OPTIONAL_FILES = [
  "fixtures-all.json",
  "odds.json",
  "freshness-report.json",
  "invariant-report.json"
];

function log(...args) {
  console.error("[snapshot-sync]", ...args);
}

function safeName(value) {
  const name = String(value || "");
  return /^[A-Za-z0-9._~-]+\.json$/.test(name) && !name.includes("..")
    ? name
    : null;
}

function parseJsonBuffer(buffer, label) {
  try {
    return JSON.parse(Buffer.from(buffer).toString("utf8"));
  } catch (error) {
    throw new Error(`${label}_json_invalid:${error?.message || error}`);
  }
}

export const REQUIRED_VALUE_COMPARISON_PLANS =
  Object.freeze(["A", "A2", "B", "B2"]);

function explicitUnrecoverablePlanAGap(payload) {
  return Boolean(
    payload?.comparisonEligible === false &&
    payload?.planAAvailability?.status === "unrecoverable" &&
    typeof payload?.planAAvailability?.reason === "string" &&
    payload.planAAvailability.reason.trim().length > 0 &&
    payload?.plans?.A === null &&
    ["A2", "B", "B2"].every(
      planKey =>
        payload?.plans?.[planKey] &&
        typeof payload.plans[planKey] === "object"
    )
  );
}

export function validateValueComparisonPayload(
  payload,
  day
) {
  if (
    payload?.ok !== true ||
    payload?.date !== day
  ) {
    throw new Error("value_comparison_contract_failed");
  }

  const missingPlans =
    REQUIRED_VALUE_COMPARISON_PLANS.filter(
      planKey =>
        !payload?.plans?.[planKey] ||
        typeof payload.plans[planKey] !== "object"
    );

  if (missingPlans.length === 0) {
    return payload;
  }

  if (explicitUnrecoverablePlanAGap(payload)) {
    return payload;
  }

  throw new Error(
    `value_comparison_four_plan_contract_failed:${missingPlans.join(",")}`
  );
}

async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "user-agent": USER_AGENT,
        accept: "application/vnd.github+json,application/json,text/plain,*/*",
        ...(init.headers || {})
      }
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`fetch_timeout:${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchBuffer(url, { optional = false } = {}) {
  const response = await fetchWithTimeout(url);
  if (optional && response.status === 404) return null;
  if (!response.ok) throw new Error(`fetch_failed:${response.status}:${url}`);
  return Buffer.from(await response.arrayBuffer());
}

function rawUrl(repo, ref, repoPath) {
  const encodedPath = String(repoPath)
    .split("/")
    .map(segment => encodeURIComponent(segment))
    .join("/");
  return `https://raw.githubusercontent.com/${repo}/${ref}/${encodedPath}`;
}

export async function resolveImmutableGithubRef(ref = DEFAULT_REF, repo = DEFAULT_REPO) {
  const requested = String(ref || DEFAULT_REF).trim();
  if (SHA_RE.test(requested)) return requested.toLowerCase();
  if (!/^[A-Za-z0-9._/-]+$/.test(requested)) {
    throw new Error("snapshot_ref_invalid");
  }

  const response = await fetchWithTimeout(
    `https://api.github.com/repos/${repo}/commits/${encodeURIComponent(requested)}`
  );
  if (!response.ok) throw new Error(`snapshot_ref_resolution_failed:${response.status}`);
  const payload = await response.json();
  const sha = String(payload?.sha || "").toLowerCase();
  if (!SHA_RE.test(sha)) throw new Error("snapshot_ref_resolution_invalid_sha");
  return sha;
}

async function ensureEmptyDir(dir) {
  await fsp.rm(dir, { recursive: true, force: true });
  await fsp.mkdir(dir, { recursive: true });
}

async function writeFileAtomic(filePath, buffer) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fsp.writeFile(tmp, buffer);
  await fsp.rename(tmp, filePath);
}

async function runPool(tasks, concurrency = CONCURRENCY) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, tasks.length || 1) }, async () => {
    while (cursor < tasks.length) {
      const index = cursor;
      cursor += 1;
      await tasks[index]();
    }
  });
  await Promise.all(workers);
}

export function expectedCoreFiles(manifest) {
  const required = new Set(["manifest.json"]);
  const fixtures = safeName(manifest?.files?.fixtures || "fixtures.json");
  const value = safeName(manifest?.files?.value || "value.json");
  const valueAudit = manifest?.files?.valueAudit
    ? safeName(manifest.files.valueAudit)
    : null;
  const planCShadow = manifest?.files?.planCShadow
    ? safeName(manifest.files.planCShadow)
    : null;
  const planCShadowAudit = manifest?.files?.planCShadowAudit
    ? safeName(manifest.files.planCShadowAudit)
    : null;

  if (
    !fixtures ||
    !value ||
    (manifest?.files?.valueAudit && !valueAudit) ||
    (manifest?.files?.planCShadow && !planCShadow) ||
    (manifest?.files?.planCShadowAudit && !planCShadowAudit)
  ) {
    throw new Error("manifest_core_file_name_invalid");
  }

  required.add(fixtures);
  required.add(value);
  if (valueAudit) required.add(valueAudit);
  if (planCShadow) required.add(planCShadow);
  if (planCShadowAudit) required.add(planCShadowAudit);

  return {
    required: [...required].sort(),
    optional: CORE_OPTIONAL_FILES.filter(name => !required.has(name))
  };
}

async function existingFileMatches(filePath, expectedSha, expectedBytes) {
  if (!fs.existsSync(filePath)) return false;
  try {
    const buffer = await fsp.readFile(filePath);
    if (Number.isFinite(expectedBytes) && canonicalTextBuffer(buffer).length !== expectedBytes) {
      return false;
    }
    if (expectedSha && canonicalBufferSha256(buffer) !== String(expectedSha).toLowerCase()) {
      return false;
    }
    return Boolean(expectedSha || Number.isFinite(expectedBytes));
  } catch {
    return false;
  }
}

async function copyOrDownload({ sourcePath, destinationPath, url, sha256, bytes, stats, optional = false }) {
  if (await existingFileMatches(sourcePath, sha256, bytes)) {
    await fsp.mkdir(path.dirname(destinationPath), { recursive: true });
    await fsp.copyFile(sourcePath, destinationPath);
    stats.filesReused += 1;
    return true;
  }

  const buffer = await fetchBuffer(url, { optional });
  if (buffer === null) return false;

  if (Number.isFinite(bytes) && canonicalTextBuffer(buffer).length !== bytes) {
    throw new Error(`download_bytes_mismatch:${path.basename(destinationPath)}`);
  }
  if (sha256 && canonicalBufferSha256(buffer) !== String(sha256).toLowerCase()) {
    throw new Error(`download_sha256_mismatch:${path.basename(destinationPath)}`);
  }

  await fsp.mkdir(path.dirname(destinationPath), { recursive: true });
  await fsp.writeFile(destinationPath, buffer);
  stats.filesDownloaded += 1;
  stats.bytesDownloaded += buffer.length;
  return true;
}

function rowsOfFixtures(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.fixtures)) return payload.fixtures;
  if (Array.isArray(payload?.matches)) return payload.matches;
  return [];
}

function rowsOfValue(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.picks)) return payload.picks;
  return [];
}

export async function validateStagedRelease(stageDayDir, manifest) {
  const validation = validateDeploySnapshotManifest(manifest, manifest.date);
  if (!validation.ok) {
    throw new Error(`manifest_contract_failed:${validation.errors.join(",")}`);
  }

  const manifestFile = path.join(stageDayDir, "manifest.json");
  const fixturesName = manifest.files?.fixtures || "fixtures.json";
  const valueName = manifest.files?.value || "value.json";
  const fixturesFile = path.join(stageDayDir, fixturesName);
  const valueFile = path.join(stageDayDir, valueName);
  const planCShadowName = manifest.files?.planCShadow || null;
  const planCShadowFile = planCShadowName ? path.join(stageDayDir, planCShadowName) : null;
  const detailsDir = path.join(stageDayDir, "details");

  for (const required of [manifestFile, fixturesFile, valueFile]) {
    if (!fs.existsSync(required)) throw new Error(`staged_required_file_missing:${path.basename(required)}`);
  }

  const fixtures = parseJsonBuffer(await fsp.readFile(fixturesFile), "fixtures");
  const value = parseJsonBuffer(await fsp.readFile(valueFile), "value");
  const fixtureCount = rowsOfFixtures(fixtures).length;
  const valueCount = rowsOfValue(value).length;

  if (fixtureCount !== Number(manifest.counts?.fixtures || 0)) {
    throw new Error(`staged_fixture_count_mismatch:${fixtureCount}:${manifest.counts?.fixtures}`);
  }
  if (valueCount !== Number(manifest.counts?.valuePicks || 0)) {
    throw new Error(`staged_value_count_mismatch:${valueCount}:${manifest.counts?.valuePicks}`);
  }

  if (planCShadowFile) {
    if (!fs.existsSync(planCShadowFile)) throw new Error(`staged_required_file_missing:${planCShadowName}`);
    const planCShadow = parseJsonBuffer(await fsp.readFile(planCShadowFile), "plan-c-shadow");
    const planCValidation = validatePlanCShadowExportPayload(planCShadow, manifest.date);
    if (!planCValidation.ok) throw new Error(`staged_plan_c_shadow_contract_failed:${planCValidation.errors.join(",")}`);
    if (planCValidation.count !== Number(manifest.counts?.planCShadowPredictions || 0)) {
      throw new Error(`staged_plan_c_shadow_count_mismatch:${planCValidation.count}:${manifest.counts?.planCShadowPredictions}`);
    }
    if (planCValidation.pickCount !== Number(manifest.counts?.planCShadowPicks || 0)) {
      throw new Error(`staged_plan_c_shadow_pick_count_mismatch:${planCValidation.pickCount}:${manifest.counts?.planCShadowPicks}`);
    }
  }

  const actualDetails = fs.existsSync(detailsDir)
    ? (await fsp.readdir(detailsDir)).filter(name => name.endsWith(".json")).sort()
    : [];
  const expectedDetails = validation.detailFiles;
  if (JSON.stringify(actualDetails) !== JSON.stringify(expectedDetails)) {
    throw new Error("staged_detail_set_mismatch");
  }

  for (const row of manifest.details) {
    const filePath = path.join(detailsDir, row.file);
    const buffer = await fsp.readFile(filePath);
    const bytes = canonicalTextBuffer(buffer).length;
    if (bytes !== Number(row.bytes)) throw new Error(`staged_detail_bytes_mismatch:${row.file}`);
    if (row.sha256 && canonicalBufferSha256(buffer) !== String(row.sha256).toLowerCase()) {
      throw new Error(`staged_detail_sha256_mismatch:${row.file}`);
    }
  }

  for (const [name, sha] of Object.entries(manifest.fileHashes || {})) {
    const safe = safeName(name);
    if (!safe) throw new Error(`manifest_file_hash_name_invalid:${name}`);
    const filePath = path.join(stageDayDir, safe);
    if (!fs.existsSync(filePath)) throw new Error(`manifest_hashed_file_missing:${safe}`);
    const actual = canonicalBufferSha256(await fsp.readFile(filePath));
    if (actual !== String(sha).toLowerCase()) throw new Error(`manifest_file_hash_mismatch:${safe}`);
  }

  const recomputed = computeDeploySnapshotManifestHash(manifest);
  if (recomputed !== String(manifest.hash).toLowerCase()) {
    throw new Error("staged_manifest_hash_mismatch");
  }

  return { fixtureCount, valueCount, detailCount: actualDetails.length };
}

function isCrossDeviceRename(error) {
  return error?.code === "EXDEV";
}

async function statOrNull(filePath) {
  try {
    return await fsp.stat(filePath);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function syncDirectoryByCopy(sourceDir, targetDir) {
  await fsp.mkdir(targetDir, { recursive: true });

  const sourceNames = (await fsp.readdir(sourceDir)).sort();
  const targetNames = (await fsp.readdir(targetDir)).sort();
  const sourceSet = new Set(sourceNames);

  for (const name of targetNames) {
    if (sourceSet.has(name)) continue;
    await fsp.rm(path.join(targetDir, name), { recursive: true, force: true });
  }

  for (const name of sourceNames) {
    const sourcePath = path.join(sourceDir, name);
    const targetPath = path.join(targetDir, name);
    const sourceStat = await fsp.stat(sourcePath);
    const targetStat = await statOrNull(targetPath);

    if (sourceStat.isDirectory()) {
      if (targetStat && !targetStat.isDirectory()) {
        await fsp.rm(targetPath, { recursive: true, force: true });
      } else if (!targetStat && fs.existsSync(targetPath)) {
        await fsp.rm(targetPath, { recursive: true, force: true });
      }
      await fsp.mkdir(targetPath, { recursive: true });
      await syncDirectoryByCopy(sourcePath, targetPath);
      continue;
    }

    if (!sourceStat.isFile()) {
      throw new Error(`snapshot_promotion_unsupported_entry:${sourcePath}`);
    }

    if (targetStat?.isDirectory()) {
      await fsp.rm(targetPath, { recursive: true, force: true });
    } else if (!targetStat && fs.existsSync(targetPath)) {
      await fsp.rm(targetPath, { recursive: true, force: true });
    }
    await fsp.copyFile(sourcePath, targetPath);
  }
}

async function verifyDirectoryCopy(sourceDir, targetDir) {
  const sourceNames = (await fsp.readdir(sourceDir)).sort();
  const targetNames = (await fsp.readdir(targetDir)).sort();
  if (JSON.stringify(sourceNames) !== JSON.stringify(targetNames)) {
    throw new Error("snapshot_promotion_copy_set_mismatch");
  }

  for (const name of sourceNames) {
    const sourcePath = path.join(sourceDir, name);
    const targetPath = path.join(targetDir, name);
    const sourceStat = await fsp.stat(sourcePath);
    const targetStat = await fsp.stat(targetPath);

    if (sourceStat.isDirectory()) {
      if (!targetStat.isDirectory()) {
        throw new Error(`snapshot_promotion_copy_type_mismatch:${name}`);
      }
      await verifyDirectoryCopy(sourcePath, targetPath);
      continue;
    }

    if (!sourceStat.isFile() || !targetStat.isFile()) {
      throw new Error(`snapshot_promotion_copy_type_mismatch:${name}`);
    }

    const [sourceBuffer, targetBuffer] = await Promise.all([
      fsp.readFile(sourcePath),
      fsp.readFile(targetPath)
    ]);
    if (!sourceBuffer.equals(targetBuffer)) {
      throw new Error(`snapshot_promotion_copy_bytes_mismatch:${name}`);
    }
  }
}

async function promoteDirectoryInPlace(stageDayDir, targetDayDir, rollbackDir) {
  const targetExists = fs.existsSync(targetDayDir);
  await fsp.rm(rollbackDir, { recursive: true, force: true });

  if (targetExists) {
    await syncDirectoryByCopy(targetDayDir, rollbackDir);
    await verifyDirectoryCopy(targetDayDir, rollbackDir);
  }

  try {
    await syncDirectoryByCopy(stageDayDir, targetDayDir);
    await verifyDirectoryCopy(stageDayDir, targetDayDir);
    await fsp.rm(stageDayDir, { recursive: true, force: true });
    await fsp.rm(rollbackDir, { recursive: true, force: true });
  } catch (error) {
    let rollbackError = null;
    try {
      if (targetExists && fs.existsSync(rollbackDir)) {
        await syncDirectoryByCopy(rollbackDir, targetDayDir);
        await verifyDirectoryCopy(rollbackDir, targetDayDir);
      } else if (!targetExists) {
        await fsp.rm(targetDayDir, { recursive: true, force: true });
      }
    } catch (restoreError) {
      rollbackError = restoreError;
    }

    await fsp.rm(rollbackDir, { recursive: true, force: true }).catch(() => {});

    if (rollbackError) {
      throw new AggregateError([error, rollbackError], "snapshot_promotion_rollback_failed");
    }
    throw error;
  }
}

export async function promoteDirectory(stageDayDir, targetDayDir, backupDir, options = {}) {
  const rename = typeof options.rename === "function" ? options.rename : fsp.rename;
  await fsp.rm(backupDir, { recursive: true, force: true });
  const targetExists = fs.existsSync(targetDayDir);
  let targetMovedToBackup = false;

  try {
    if (targetExists) {
      await rename(targetDayDir, backupDir);
      targetMovedToBackup = true;
    }
    await rename(stageDayDir, targetDayDir);
    await fsp.rm(backupDir, { recursive: true, force: true });
    return;
  } catch (error) {
    if (targetMovedToBackup && !fs.existsSync(targetDayDir) && fs.existsSync(backupDir)) {
      try {
        await syncDirectoryByCopy(backupDir, targetDayDir);
        await verifyDirectoryCopy(backupDir, targetDayDir);
        await fsp.rm(backupDir, { recursive: true, force: true });
        targetMovedToBackup = false;
      } catch (restoreError) {
        throw new AggregateError([error, restoreError], "snapshot_promotion_rollback_failed");
      }
    }

    if (!isCrossDeviceRename(error)) throw error;

    await promoteDirectoryInPlace(stageDayDir, targetDayDir, backupDir);
    await fsp.rm(backupDir, { recursive: true, force: true });
  }
}

async function updateRuntimeSyncState({ day, ref, manifest, latestPromoted, stats }) {
  const file = resolveDataPath("deploy-snapshots", "runtime-sync-state.json");
  let current = {};
  try {
    current = JSON.parse(await fsp.readFile(file, "utf8"));
  } catch {
    current = {};
  }

  const days = current?.days && typeof current.days === "object" ? current.days : {};
  days[day] = {
    ref,
    manifestHash: manifest.hash,
    generatedAt: manifest.generatedAt || null,
    synchronizedAt: new Date().toISOString(),
    latestPromoted,
    filesDownloaded: stats.filesDownloaded,
    filesReused: stats.filesReused
  };

  await writeFileAtomic(file, Buffer.from(JSON.stringify({
    schema: "ai-matchlab.runtime-snapshot-sync.v2",
    updatedAt: new Date().toISOString(),
    latestDay: latestPromoted ? day : current?.latestDay || null,
    latestRef: latestPromoted ? ref : current?.latestRef || null,
    days
  }, null, 2)));
}

async function stageRuntimeReleaseArtifacts({
  repo,
  ref,
  day,
  stageDayDir,
  stats,
  requireDiagnostics
}) {
  const runtimeDir = path.join(stageDayDir, "runtime");
  await fsp.mkdir(runtimeDir, { recursive: true });

  // Value comparison is part of the served day release for every synchronized day.
  const comparisonBuffer = await fetchBuffer(
    rawUrl(repo, ref, `data/value-comparison/${day}.json`)
  );
  validateValueComparisonPayload(
    parseJsonBuffer(
      comparisonBuffer,
      "value_comparison"
    ),
    day
  );

  // Current/latest releases must carry diagnostics. Historical days may predate
  // those artifacts; when present they are still embedded and mirrored.
  const buildBuffer = await fetchBuffer(
    rawUrl(repo, ref, `data/build-reports/${day}.json`),
    { optional: !requireDiagnostics }
  );
  if (buildBuffer) {
    const build = parseJsonBuffer(buildBuffer, "build_report");
    const buildDay = String(build?.dayKey || build?.date || "").slice(0, 10);
    if (buildDay && buildDay !== day) throw new Error("build_report_day_mismatch");
  }

  const alertsBuffer = await fetchBuffer(
    rawUrl(repo, ref, `data/system-health/${day}.json`),
    { optional: !requireDiagnostics }
  );
  if (alertsBuffer) {
    const alerts = parseJsonBuffer(alertsBuffer, "system_health_alerts");
    if (String(alerts?.dayKey || "") !== day) {
      throw new Error("system_health_alert_day_mismatch");
    }
  }

  const staged = [
    ["value-comparison.json", comparisonBuffer],
    ["build-report.json", buildBuffer],
    ["system-health-alerts.json", alertsBuffer]
  ].filter(([, buffer]) => buffer !== null);

  await Promise.all(staged.map(([name, buffer]) => (
    fsp.writeFile(path.join(runtimeDir, name), buffer)
  )));
  stats.filesDownloaded += staged.length;
  stats.bytesDownloaded += staged.reduce((sum, [, buffer]) => sum + buffer.length, 0);

  return {
    comparisonBuffer,
    buildBuffer,
    alertsBuffer,
    comparisonPresent: true,
    buildReportPresent: Boolean(buildBuffer),
    systemHealthPresent: Boolean(alertsBuffer)
  };
}

async function mirrorRuntimeReleaseArtifacts({ day, artifacts, stats, promoteLatestAlerts }) {
  const writes = [
    [resolveDataPath("value-comparison", `${day}.json`), artifacts.comparisonBuffer],
    [resolveDataPath("build-reports", `${day}.json`), artifacts.buildBuffer],
    [resolveDataPath("system-health", `${day}.json`), artifacts.alertsBuffer]
  ].filter(([, buffer]) => buffer !== null);

  await Promise.all(writes.map(([target, buffer]) => writeFileAtomic(target, buffer)));
  stats.extraFilesWritten += writes.length;

  if (promoteLatestAlerts && artifacts.alertsBuffer) {
    await writeFileAtomic(resolveDataPath("system-health", "latest.json"), artifacts.alertsBuffer);
    stats.extraFilesWritten += 1;
  }
}

async function syncValueComparison({
  repo,
  ref,
  day,
  stats
}) {
  const repoPath =
    `data/value-comparison/${day}.json`;

  const buffer =
    await fetchBuffer(
      rawUrl(repo, ref, repoPath)
    );

  const payload =
    validateValueComparisonPayload(
      parseJsonBuffer(
        buffer,
        "value_comparison"
      ),
      day
    );

  const target =
    resolveDataPath(
      "value-comparison",
      `${day}.json`
    );

  const runtimeDayRoot =
    resolveDataPath(
      "deploy-snapshots",
      day
    );

  const runtimeTarget =
    resolveDataPath(
      "deploy-snapshots",
      day,
      "runtime",
      "value-comparison.json"
    );

  let runtimeReleaseWritten = false;

  // readValueComparisonArtifact() prefers the embedded runtime release.
  // A settlement-only sync must update that copy before the generic
  // mirror or a stale embedded comparison would continue to win.
  if (fs.existsSync(runtimeDayRoot)) {
    await writeFileAtomic(
      runtimeTarget,
      buffer
    );

    stats.extraFilesWritten += 1;
    runtimeReleaseWritten = true;
  }

  await writeFileAtomic(
    target,
    buffer
  );

  stats.extraFilesWritten += 1;

  return {
    present: true,
    runtimeReleaseWritten,
    comparisonSha256:
      canonicalBufferSha256(buffer),
    generatedAt:
      payload.generatedAt || null
  };
}


async function syncMultiOdds({ repo, ref, day, stats }) {
  const results = [];
  for (let offset = 0; offset <= MULTI_ODDS_DAYS_FORWARD; offset += 1) {
    const targetDay = shiftDay(day, offset);
    const repoPath = `data/multi-odds/${targetDay}.json`;
    try {
      const buffer = await fetchBuffer(rawUrl(repo, ref, repoPath), { optional: true });
      if (buffer === null) continue;
      parseJsonBuffer(buffer, `multi_odds_${targetDay}`);
      await writeFileAtomic(resolveDataPath("multi-odds", `${targetDay}.json`), buffer);
      stats.extraFilesWritten += 1;
      results.push(targetDay);
    } catch (error) {
      log("multi-odds optional sync failed", targetDay, error?.message || error);
    }
  }
  return results;
}

export async function syncDeploySnapshotFromGithub(dayKey = athensDayKey(), options = {}) {
  const startedAt = Date.now();
  const day = String(dayKey || "").slice(0, 10);
  if (!DAY_RE.test(day)) throw new Error("snapshot_day_invalid");

  const repo = String(options.repo || DEFAULT_REPO);
  const ref = await resolveImmutableGithubRef(options.ref || DEFAULT_REF, repo);
  const rawBase = `data/deploy-snapshots/${day}`;
  const stageRoot = resolveDataPath(".snapshot-sync", `${day}-${ref}-${process.pid}-${Date.now()}`);
  const stageDayDir = path.join(stageRoot, "deploy-snapshots", day);
  const targetDayDir = resolveDataPath("deploy-snapshots", day);
  const backupDir = resolveDataPath("deploy-snapshots", `.backup-${day}-${process.pid}`);
  const stats = {
    filesDownloaded: 0,
    filesReused: 0,
    bytesDownloaded: 0,
    extraFilesWritten: 0
  };

  await ensureEmptyDir(stageDayDir);

  try {
    const manifestBuffer = await fetchBuffer(rawUrl(repo, ref, `${rawBase}/manifest.json`));
    const manifest = parseJsonBuffer(manifestBuffer, "manifest");
    const manifestValidation = validateDeploySnapshotManifest(manifest, day);
    if (!manifestValidation.ok) {
      throw new Error(`manifest_contract_failed:${manifestValidation.errors.join(",")}`);
    }

    await fsp.writeFile(path.join(stageDayDir, "manifest.json"), manifestBuffer);
    stats.filesDownloaded += 1;
    stats.bytesDownloaded += manifestBuffer.length;

    const coreFiles = expectedCoreFiles(manifest);
    const tasks = [];

    for (const name of coreFiles.required.filter(name => name !== "manifest.json")) {
      const expectedSha = manifest.fileHashes?.[name] || null;
      tasks.push(() => copyOrDownload({
        sourcePath: path.join(targetDayDir, name),
        destinationPath: path.join(stageDayDir, name),
        url: rawUrl(repo, ref, `${rawBase}/${name}`),
        sha256: expectedSha,
        bytes: null,
        stats
      }));
    }

    for (const name of coreFiles.optional) {
      tasks.push(() => copyOrDownload({
        sourcePath: "",
        destinationPath: path.join(stageDayDir, name),
        url: rawUrl(repo, ref, `${rawBase}/${name}`),
        sha256: null,
        bytes: null,
        stats,
        optional: true
      }));
    }

    for (const row of manifest.details) {
      tasks.push(() => copyOrDownload({
        sourcePath: path.join(targetDayDir, "details", row.file),
        destinationPath: path.join(stageDayDir, "details", row.file),
        url: rawUrl(repo, ref, `${rawBase}/details/${row.file}`),
        sha256: row.sha256 || null,
        bytes: Number(row.bytes),
        stats
      }));
    }

    await runPool(tasks);
    const validation = await validateStagedRelease(stageDayDir, manifest);

    // Read and bind latest.json before any served directory is promoted. The
    // current/latest day has a stricter diagnostics contract than history.
    const latestBuffer = await fetchBuffer(
      rawUrl(repo, ref, "data/deploy-snapshots/latest.json"),
      { optional: true }
    );
    let latest = null;
    let latestPromoted = false;
    if (latestBuffer) {
      latest = parseJsonBuffer(latestBuffer, "latest");
      if (
        String(latest?.date || "") === day &&
        String(latest?.hash || "").toLowerCase() !== String(manifest.hash).toLowerCase()
      ) {
        throw new Error("latest_manifest_hash_mismatch");
      }
    }
    const promoteLatest = Boolean(latestBuffer && String(latest?.date || "") === day);

    const runtimeArtifacts = await stageRuntimeReleaseArtifacts({
      repo,
      ref,
      day,
      stageDayDir,
      stats,
      requireDiagnostics: promoteLatest
    });

    await promoteDirectory(stageDayDir, targetDayDir, backupDir);

    await mirrorRuntimeReleaseArtifacts({
      day,
      artifacts: runtimeArtifacts,
      stats,
      promoteLatestAlerts: promoteLatest
    });
    const multiOddsDays = await syncMultiOdds({ repo, ref, day, stats });

    if (promoteLatest) {
      await writeFileAtomic(resolveDataPath("deploy-snapshots", "latest.json"), latestBuffer);
      latestPromoted = true;
    }

    await updateRuntimeSyncState({ day, ref, manifest, latestPromoted, stats });

    const summary = {
      ok: true,
      schema: "ai-matchlab.snapshot-sync-result.v2",
      dayKey: day,
      repo,
      ref,
      manifestHash: manifest.hash,
      manifestVersion: manifest.version || null,
      latestPromoted,
      comparisonPresent: runtimeArtifacts.comparisonPresent,
      diagnostics: {
        buildReportPresent: runtimeArtifacts.buildReportPresent,
        systemHealthPresent: runtimeArtifacts.systemHealthPresent,
        latestSystemHealthPromoted: latestPromoted
      },
      multiOddsDays,
      validation,
      ...stats,
      tookMs: Date.now() - startedAt
    };
    log("completed", JSON.stringify(summary));
    return summary;
  } finally {
    await fsp.rm(stageRoot, { recursive: true, force: true }).catch(() => {});
    await fsp.rm(backupDir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function syncValueComparisonFromGithub(
  dayKey = athensDayKey(),
  options = {}
) {
  const day =
    String(dayKey || "").slice(0, 10);

  if (!DAY_RE.test(day)) {
    throw new Error("snapshot_day_invalid");
  }

  const repo =
    String(options.repo || DEFAULT_REPO);

  const ref =
    await resolveImmutableGithubRef(
      options.ref || DEFAULT_REF,
      repo
    );

  const stats = {
    extraFilesWritten: 0
  };

  const result =
    await syncValueComparison({
      repo,
      ref,
      day,
      stats
    });

  return {
    ok: true,
    schema:
      "ai-matchlab.value-comparison-sync-result.v1",
    dayKey: day,
    repo,
    ref,
    valueComparisonPresent:
      result.present,
    valueComparisonWritten:
      result.present,
    runtimeReleaseWritten:
      result.runtimeReleaseWritten,
    comparisonSha256:
      result.comparisonSha256,
    comparisonGeneratedAt:
      result.generatedAt,
    ...stats
  };
}


function parseCliArgs(argv) {
  const args = {
    day: "",
    ref: "",
    comparisonOnly: false
  };

  for (const token of argv) {
    if (token.startsWith("--day=")) {
      args.day = token.slice(6);
    } else if (token.startsWith("--ref=")) {
      args.ref = token.slice(6);
    } else if (token === "--comparison-only") {
      args.comparisonOnly = true;
    } else if (!token.startsWith("--") && !args.day) {
      args.day = token;
    }
  }

  return args;
}

const entryUrl =
  process.argv[1]
    ? pathToFileURL(process.argv[1]).href
    : null;

if (entryUrl === import.meta.url) {
  const args =
    parseCliArgs(process.argv.slice(2));

  const runner =
    args.comparisonOnly
      ? syncValueComparisonFromGithub
      : syncDeploySnapshotFromGithub;

  runner(
    args.day || athensDayKey(),
    {
      ref:
        args.ref || DEFAULT_REF
    }
  )
    .then(result => {
      process.stdout.write(
        `${JSON.stringify(result)}\n`
      );
    })
    .catch(error => {
      process.stderr.write(
        `[snapshot-sync] fatal ${String(error?.stack || error)}\n`
      );

      process.stdout.write(
        `${JSON.stringify({
          ok: false,
          error: String(error?.message || error)
        })}\n`
      );

      process.exitCode = 1;
    });
}
