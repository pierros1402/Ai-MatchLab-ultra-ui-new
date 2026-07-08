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
import { deriveValueFromOdds } from "./derive-value-from-odds.js";
import { exportDeploySnapshotDay } from "./export-deploy-snapshot-day.js";
import { verifyArtifactFreshnessDay } from "./verify-artifact-freshness-day.js";
import { runSnapshotInvariantCheck } from "./run-snapshot-invariant-check.js";
import { buildDayReport } from "./build-day-report.js";
import { auditHistoricalIntegrityDay } from "./audit-historical-integrity-range.js";

const __filename = fileURLToPath(import.meta.url);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/u;

function writeJson(file, payload) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
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

  if (options.rebuildValue === true) {
    const valueResult = deriveValueFromOdds(dayKey, { outputMode: "production" });
    steps.push({
      step: "rebuild_value",
      ok: valueResult?.ok !== false,
      count: Number(valueResult?.count || 0),
      source: valueResult?.source || null,
      policyVersion: valueResult?.policyVersion || null
    });
  } else {
    steps.push({
      step: "rebuild_value",
      skipped: true,
      reason: "preserve_existing_historical_value_by_default"
    });
  }

  const exportResult = await exportDeploySnapshotDay(dayKey, {
    preserveDetails: true,
    preserveValue: true,
    updateLatest: false
  });
  steps.push({
    step: "export_deploy_snapshot",
    ok: exportResult?.ok !== false,
    counts: exportResult?.counts || null,
    latestUpdated: exportResult?.latestUpdated === true
  });

  const freshness = verifyArtifactFreshnessDay(dayKey);
  writeJson(resolveDataPath("deploy-snapshots", dayKey, "freshness-report.json"), freshness);
  steps.push({ step: "verify_artifact_freshness", ok: freshness.ok === true, reasons: freshness.reasons || [] });

  const invariant = await runSnapshotInvariantCheck(dayKey);
  steps.push({
    step: "run_snapshot_invariant_check",
    ok: invariant.ok === true,
    blocked: Array.isArray(invariant.blocked) ? invariant.blocked.length : 0,
    warnings: Array.isArray(invariant.warnings) ? invariant.warnings.length : 0
  });

  const buildReport = buildDayReport(dayKey);
  writeJson(resolveDataPath("build-reports", `${dayKey}.json`), buildReport);
  steps.push({
    step: "build_day_report",
    ok: buildReport.clean === true,
    clean: buildReport.clean === true,
    cleanStrict: buildReport.cleanStrict === true,
    hardFailures: buildReport.hardFailures || [],
    warnings: buildReport.warnings || []
  });

  const integrity = auditHistoricalIntegrityDay(dayKey);
  const result = {
    ok: integrity.ok === true,
    schema: "ai-matchlab.historical-repair.v1",
    dayKey,
    startedAt,
    finishedAt: new Date().toISOString(),
    rebuildValue: options.rebuildValue === true,
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
