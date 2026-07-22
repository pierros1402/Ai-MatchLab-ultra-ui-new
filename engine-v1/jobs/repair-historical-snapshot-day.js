/**
 * repair-historical-snapshot-day.js
 *
 * Repairs a historical deploy snapshot from canonical sources, then writes fresh
 * freshness/invariant/build reports. This is the safe default before any old day
 * is allowed into cumulative comparison, settlement statistics, priors, or
 * backtesting evidence.
 *
 * Usage:
 *   node engine-v1/jobs/repair-historical-snapshot-day.js --date=2026-07-07
 *   node engine-v1/jobs/repair-historical-snapshot-day.js --date=2026-07-07 --rebuild-value
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { exportDeploySnapshotDay } from "./export-deploy-snapshot-day.js";
import { refreshValueArtifactsDay } from "./refresh-value-artifacts-day.js";
import { verifyArtifactFreshnessDay } from "./verify-artifact-freshness-day.js";
import { runSnapshotInvariantCheck } from "./run-snapshot-invariant-check.js";
import { buildDayReport } from "./build-day-report.js";
import { auditHistoricalIntegrityDay } from "./audit-historical-integrity-range.js";
import {
  hasPreKickoffNonPlayedDisplayViolation,
  sanitizePreKickoffNonPlayed
} from "../core/non-played-state.js";
import {
  synchronizeDetailStatusState
} from "../core/detail-status-sync.js";

const __filename = fileURLToPath(import.meta.url);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/u;

function writeJson(file, payload) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function writeJsonAtomic(file, payload) {
  ensureDir(path.dirname(file));
  const temporary = `${file}.tmp-${process.pid}-${Date.now()}`;
  fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, file);
}

function readJsonSafe(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function mutableStateProjection(row) {
  return {
    status: row?.status ?? null,
    rawStatus: row?.rawStatus ?? null,
    statusType: row?.statusType ?? null,
    minute: row?.minute ?? null,
    scoreHome: row?.scoreHome ?? null,
    scoreAway: row?.scoreAway ?? null,
    penalties: row?.penalties ?? null,
    decidedBy: row?.decidedBy ?? null,
    isDisplayFinal: row?.isDisplayFinal ?? null
  };
}

export function newlyIntroducedReasons(
  baselineReasons = [],
  currentReasons = []
) {
  const baseline = new Set(
    Array.isArray(baselineReasons)
      ? baselineReasons
      : []
  );

  return [
    ...new Set(
      (
        Array.isArray(currentReasons)
          ? currentReasons
          : []
      ).filter(
        (reason) =>
          !baseline.has(reason)
      )
    )
  ].sort();
}

export function classifyRepairIntegrityFailures(
  hardFailures = [],
  newBuildHardFailures = []
) {
  const failures = Array.isArray(hardFailures)
    ? [...new Set(hardFailures)].sort()
    : [];

  const mayPreserveBuildReportFailure =
    Array.isArray(newBuildHardFailures) &&
    newBuildHardFailures.length === 0;

  const preserved = failures.filter(
    (reason) =>
      reason === "build_report_not_clean" &&
      mayPreserveBuildReportFailure
  );

  const blocking = failures.filter(
    (reason) =>
      !preserved.includes(reason)
  );

  return {
    blocking,
    preserved
  };
}

export function sanitizeHistoricalCanonicalNonPlayedDay(dayKey) {
  const canonicalDir = resolveDataPath("canonical-fixtures", dayKey);
  const result = {
    scannedFiles: 0,
    changedFiles: 0,
    changedRows: 0,
    files: [],
    matches: []
  };

  if (!fs.existsSync(canonicalDir)) return result;

  const files = fs.readdirSync(canonicalDir)
    .filter(name => name.endsWith(".json"))
    .sort();

  for (const name of files) {
    const file = path.join(canonicalDir, name);
    const payload = readJsonSafe(file, null);
    const rows = Array.isArray(payload?.fixtures) ? payload.fixtures : null;
    result.scannedFiles++;
    if (!rows) continue;

    const changedMatchIds = [];

    for (let index = 0; index < rows.length; index++) {
      const row = rows[index];
      if (!hasPreKickoffNonPlayedDisplayViolation(row)) continue;

      const sanitized = sanitizePreKickoffNonPlayed(row);
      const before = mutableStateProjection(row);
      const after = mutableStateProjection(sanitized);
      if (JSON.stringify(before) === JSON.stringify(after)) continue;

      rows[index] = sanitized;
      changedMatchIds.push(
        sanitized?.canonicalId ||
        sanitized?.matchId ||
        `${name}#${index}`
      );
    }

    if (changedMatchIds.length === 0) continue;

    writeJsonAtomic(file, payload);
    result.changedFiles++;
    result.changedRows += changedMatchIds.length;
    result.files.push(path.relative(path.dirname(resolveDataPath("canonical-fixtures")), file).replace(/\\/g, "/"));
    result.matches.push(...changedMatchIds);
  }

  return result;
}

export function synchronizeHistoricalSnapshotDetailsDay(dayKey) {
  const snapshotDir = resolveDataPath("deploy-snapshots", dayKey);
  const fixturesPayload = readJsonSafe(path.join(snapshotDir, "fixtures.json"), null);
  const fixtures = Array.isArray(fixturesPayload?.fixtures)
    ? fixturesPayload.fixtures
    : [];

  const result = {
    fixtures: fixtures.length,
    filesSeen: 0,
    patchedFiles: 0,
    unchangedFiles: 0,
    missingFiles: 0,
    failedFiles: 0,
    patchedMatches: [],
    failures: []
  };

  for (const row of fixtures) {
    const id = row?.canonicalId || row?.matchId;
    if (!id) continue;

    const files = [...new Set([
      resolveDataPath("details", dayKey, `${id}.json`),
      path.join(snapshotDir, "details", `${id}.json`)
    ])];

    let found = false;

    for (const file of files) {
      if (!fs.existsSync(file)) continue;
      found = true;
      result.filesSeen++;

      const detail = readJsonSafe(file, null);
      const sync = synchronizeDetailStatusState(detail, row);

      if (!sync.ok) {
        result.failedFiles++;
        result.failures.push({
          matchId: id,
          file: path.relative(path.dirname(resolveDataPath("canonical-fixtures")), file).replace(/\\/g, "/"),
          reason: sync.reason || "detail_status_sync_failed"
        });
        continue;
      }

      if (!sync.changed) {
        result.unchangedFiles++;
        continue;
      }

      writeJsonAtomic(file, detail);
      result.patchedFiles++;
      result.patchedMatches.push(id);
    }

    if (!found) result.missingFiles++;
  }

  result.patchedMatches = [...new Set(result.patchedMatches)].sort();
  return result;
}

function parseArgs(argv) {
  const out = { date: null, rebuildValue: false, noWriteReport: false };
  for (const arg of argv) {
    if (arg.startsWith("--date=")) out.date = arg.slice("--date=".length);
    else if (arg === "--date") out.expectDate = true;
    else if (out.expectDate) { out.date = arg; out.expectDate = false; }
    else if (arg === "--rebuild-value") out.rebuildValue = true;
    else if (arg === "--no-write-report") out.noWriteReport = true;
    else if (arg === "--help" || arg === "-h") out.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return out;
}

function usage() {
  return [
    "Usage:",
    "  node engine-v1/jobs/repair-historical-snapshot-day.js --date=YYYY-MM-DD [--rebuild-value]",
    "",
    "Default:",
    "  Repairs fixtures/details/manifest/reports and preserves existing value picks.",
    "",
    "--rebuild-value:",
    "  Rebuilds production value/value-audit from the current model-assessment bridge. Use only when you intentionally want to refresh historical value evidence."
  ].join("\n");
}

export async function repairHistoricalSnapshotDay(dayKey, options = {}) {
  if (!DAY_RE.test(String(dayKey || ""))) {
    throw new Error(`Invalid date: ${dayKey}`);
  }

  const startedAt = new Date().toISOString();
  const steps = [];

  const preserveHistoricalValue =
    options.rebuildValue !== true;

  const baselineFreshness =
    preserveHistoricalValue
      ? verifyArtifactFreshnessDay(dayKey)
      : null;

  const baselineBuildReport =
    preserveHistoricalValue
      ? buildDayReport(dayKey)
      : null;

  const baseline = preserveHistoricalValue
    ? {
        freshnessReasons:
          baselineFreshness?.reasons || [],
        buildHardFailures:
          baselineBuildReport?.hardFailures || []
      }
    : null;

  let repairValidation = {
    ok: true,
    newFreshnessReasons: [],
    newBuildHardFailures: [],
    invariantBlocked: 0
  };

  // Repair the canonical semantic contract before export. This is generic and
  // provider-independent: postponed/cancelled pre-kickoff rows cannot carry a
  // manufactured score, minute, penalties or final-display state.
  const canonicalSanitation = sanitizeHistoricalCanonicalNonPlayedDay(dayKey);
  steps.push({
    step: "sanitize_historical_canonical_nonplayed",
    ok: true,
    ...canonicalSanitation
  });

  // Fixture/detail integrity first: dedup alias twins, prune orphan details,
  // enforce one-detail-per-fixture. Preserves FT status (rescued from the
  // existing snapshot when canonical has aged out) and existing value picks.
  let exportResult = await exportDeploySnapshotDay(dayKey, {
    preserveDetails: true,
    preserveValue: true,
    updateLatest: false
  });
  steps.push({
    step: "export_deploy_snapshot",
    pass: 1,
    ok: exportResult?.ok !== false,
    counts: exportResult?.counts || null,
    latestUpdated: exportResult?.latestUpdated === true
  });

  if (exportResult?.ok === false) {
    throw new Error(
      "Historical snapshot export pass 1 failed"
    );
  }

  // Synchronize basic status fields and the embedded detail signature from the
  // exact exported fixture truth. This covers both played-final drift and
  // historical pre-kickoff non-played null-score repair.
  const detailSync = synchronizeHistoricalSnapshotDetailsDay(dayKey);
  steps.push({
    step: "synchronize_historical_snapshot_details",
    ok: detailSync.failedFiles === 0 && detailSync.missingFiles === 0,
    ...detailSync
  });

  if (
    detailSync.failedFiles > 0 ||
    detailSync.missingFiles > 0
  ) {
    throw new Error(
      "Historical detail synchronization failed: " +
      `${detailSync.failedFiles} failed, ` +
      `${detailSync.missingFiles} missing`
    );
  }

  // Detail bytes changed after the first export. Re-export so manifest detail
  // metadata and the final snapshot hash bind the repaired bytes, then let the
  // invariant run read-only.
  if (detailSync.patchedFiles > 0) {
    exportResult = await exportDeploySnapshotDay(dayKey, {
      preserveDetails: true,
      preserveValue: true,
      updateLatest: false
    });
    steps.push({
      step: "export_deploy_snapshot",
      pass: 2,
      reason: "bind_repaired_detail_bytes",
      ok: exportResult?.ok !== false,
      counts: exportResult?.counts || null,
      latestUpdated: exportResult?.latestUpdated === true
    });

    if (exportResult?.ok === false) {
      throw new Error(
        "Historical snapshot export pass 2 failed"
      );
    }
  }

  if (options.rebuildValue === true) {
    // Full value refresh in one pass: Plan A value/audit, snapshot value/audit,
    // Plan B observation + plan-b-audit, value-comparison, then fresh
    // freshness/invariant/build reports. This is the ONLY value path that clears
    // the *_stale_against_canonical family, because it rewrites every derived
    // value artifact with a timestamp newer than the (possibly re-touched)
    // canonical fixtures. The partial deriveValueFromOdds path below leaves
    // plan-b-audit/value-comparison stale and the day never fully clears.
    const refresh = await refreshValueArtifactsDay(
      dayKey,
      { updateLatest: false }
    );

    const refreshOk =
      refresh?.ok !== false &&
      refresh?.coverage?.ok !== false &&
      refresh?.freshness?.ok !== false &&
      refresh?.invariant?.ok !== false &&
      refresh?.buildReport?.clean === true;

    repairValidation = {
      ok: refreshOk,
      newFreshnessReasons:
        refresh?.freshness?.reasons || [],
      newBuildHardFailures:
        refresh?.buildReport?.hardFailures || [],
      invariantBlocked:
        Array.isArray(refresh?.invariant?.blocked)
          ? refresh.invariant.blocked.length
          : 0
    };

    steps.push({
      step: "refresh_value_artifacts",
      ok: refreshOk,
      coverageOk: refresh?.coverage?.ok !== false,
      reason: refresh?.reason || null,
      valuePicks: Number(refresh?.planA?.count || 0),
      freshnessOk: refresh?.freshness?.ok !== false,
      invariantOk: refresh?.invariant?.ok !== false,
      buildClean: refresh?.buildReport?.clean === true,
      buildHardFailures:
        refresh?.buildReport?.hardFailures || []
    });
  } else {
    steps.push({
      step: "rebuild_value",
      skipped: true,
      reason: "preserve_existing_historical_value_by_default"
    });

    const freshness =
      verifyArtifactFreshnessDay(dayKey);

    const newFreshnessReasons =
      newlyIntroducedReasons(
        baseline?.freshnessReasons || [],
        freshness?.reasons || []
      );

    writeJson(
      resolveDataPath(
        "deploy-snapshots",
        dayKey,
        "freshness-report.json"
      ),
      freshness
    );

    steps.push({
      step: "verify_artifact_freshness",
      ok: newFreshnessReasons.length === 0,
      reportOk: freshness.ok === true,
      reasons: freshness.reasons || [],
      baselineReasons:
        baseline?.freshnessReasons || [],
      newReasons: newFreshnessReasons
    });

    const invariant =
      await runSnapshotInvariantCheck(dayKey);

    const invariantBlocked =
      Array.isArray(invariant.blocked)
        ? invariant.blocked.length
        : 0;

    const invariantOk =
      invariant.ok === true &&
      invariantBlocked === 0;

    steps.push({
      step: "run_snapshot_invariant_check",
      ok: invariantOk,
      blocked: invariantBlocked,
      warnings:
        Array.isArray(invariant.warnings)
          ? invariant.warnings.length
          : 0
    });

    const buildReport =
      buildDayReport(dayKey);

    const newBuildHardFailures =
      newlyIntroducedReasons(
        baseline?.buildHardFailures || [],
        buildReport?.hardFailures || []
      );

    writeJson(
      resolveDataPath(
        "build-reports",
        `${dayKey}.json`
      ),
      buildReport
    );

    steps.push({
      step: "build_day_report",
      ok: newBuildHardFailures.length === 0,
      clean: buildReport.clean === true,
      cleanStrict:
        buildReport.cleanStrict === true,
      hardFailures:
        buildReport.hardFailures || [],
      baselineHardFailures:
        baseline?.buildHardFailures || [],
      newHardFailures:
        newBuildHardFailures,
      warnings:
        buildReport.warnings || []
    });

    repairValidation = {
      ok:
        newFreshnessReasons.length === 0 &&
        invariantOk &&
        newBuildHardFailures.length === 0,
      newFreshnessReasons,
      newBuildHardFailures,
      invariantBlocked
    };
  }

  const integrity =
    auditHistoricalIntegrityDay(dayKey);

  const integrityAssessment =
    classifyRepairIntegrityFailures(
      integrity?.hardFailures || [],
      repairValidation.newBuildHardFailures
    );

  const result = {
    ok:
      repairValidation.ok &&
      integrityAssessment.blocking.length === 0,
    schema: "ai-matchlab.historical-repair.v2",
    dayKey,
    startedAt,
    finishedAt: new Date().toISOString(),
    rebuildValue:
      options.rebuildValue === true,
    baseline,
    validation: {
      ...repairValidation,
      blockingIntegrityHardFailures:
        integrityAssessment.blocking,
      preservedBaselineIntegrityHardFailures:
        integrityAssessment.preserved
    },
    steps,
    integrity
  };

  if (options.writeReport !== false) {
    writeJson(resolveDataPath("historical-integrity", "repairs", `${dayKey}.json`), result);
    writeJson(resolveDataPath("historical-integrity", `${dayKey}.json`), integrity);
  }

  return result;
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isCli) {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }
  if (!DAY_RE.test(String(args.date || ""))) {
    console.error(usage());
    process.exit(1);
  }
  repairHistoricalSnapshotDay(args.date, {
    rebuildValue: args.rebuildValue,
    writeReport: !args.noWriteReport
  }).then((result) => {
    console.log(JSON.stringify({
      ok: result.ok,
      dayKey: result.dayKey,
      rebuildValue: result.rebuildValue,
      counts: result.integrity.counts,
      hardFailures: result.integrity.hardFailures,
      warnings: result.integrity.warnings,
      steps: result.steps
    }, null, 2));
    process.exit(result.ok ? 0 : 2);
  }).catch((error) => {
    console.error("[repair-historical-snapshot-day] fatal", error);
    process.exit(1);
  });
}