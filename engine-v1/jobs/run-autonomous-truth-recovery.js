import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { athensDayKey, shiftDay } from "../core/daykey.js";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { runPriorValueSettlementCatchup, canonicalDayHasOpenStatusRows } from "./run-prior-value-settlement-catchup.js";
import { runLiveStatusRefreshDay } from "./run-live-status-refresh-day.js";
import { applyResultsTruthToCanonicalDay } from "./apply-results-truth-to-canonical-day.js";
import { auditFinalizationReadinessDay } from "./audit-finalization-readiness-day.js";
import {
  appendFinalizedDayToHistory,
  buildHistoryDayFromTruth
} from "./append-finalized-day-to-history.js";
import { buildHistoryReport } from "./build-history-report.js";
import {
  rebuildIndexesForSeason,
  resolveSeasonFromDay
} from "./rebuild-indexes-for-season.js";
import { rebuildH2HFoundationFromCurrentHistory } from "./rebuild-h2h-foundation-from-current-history.js";
import { buildModelPriors } from "./build-model-priors.js";
import {
  buildErrorReasonCounts,
  classifyHistoryRecovery,
  historyRowsEquivalent,
  nextRecoveryState,
  shouldAttemptVerifiedFinalRecovery
} from "../core/autonomous-history-recovery-policy.js";

const JOBS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(JOBS_DIR, "../..");
const RECOVERY_ROOT = resolveDataPath("autonomous-recovery", "history");
const STATE_DIR = path.join(RECOVERY_ROOT, "state");

function validDayKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(String(value || ""));
}

function readJsonSafe(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function writeJsonIfChanged(file, value) {
  ensureDir(path.dirname(file));
  const next = stableJson(value);
  let previous = null;
  try {
    previous = fs.readFileSync(file, "utf8");
  } catch {
    previous = null;
  }
  if (previous === next) return false;
  fs.writeFileSync(file, next, "utf8");
  return true;
}

function historyRowsForDay(dayKey) {
  const season = resolveSeasonFromDay(dayKey);
  const file = resolveDataPath("history", `${season}.json`);
  const payload = readJsonSafe(file, { days: [] });
  const day = Array.isArray(payload?.days)
    ? payload.days.find(row => String(row?.dayKey || "") === dayKey)
    : null;
  return {
    season,
    file,
    rows: Array.isArray(day?.rows) ? day.rows : [],
    present: Boolean(day),
    matchCount: Array.isArray(day?.rows) ? day.rows.length : 0
  };
}

function dayOffset(dayKey, referenceDayKey) {
  const day = Date.parse(`${dayKey}T12:00:00.000Z`);
  const reference = Date.parse(`${referenceDayKey}T12:00:00.000Z`);
  return Math.round((day - reference) / 86400000);
}

function verifiedFinalOffsets(dayKey, referenceDayKey) {
  const center = dayOffset(dayKey, referenceDayKey);
  return [...new Set([center - 1, center, center + 1])];
}

function runNodeJob(args, label) {
  const result = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    encoding: "utf8",
    windowsHide: true
  });

  if (result.stdout) {
    for (const line of String(result.stdout).trim().split(/\r?\n/u).filter(Boolean)) {
      console.log(`[autonomous-truth-recovery] ${label}:stdout`, line);
    }
  }
  if (result.stderr) {
    for (const line of String(result.stderr).trim().split(/\r?\n/u).filter(Boolean)) {
      console.warn(`[autonomous-truth-recovery] ${label}:stderr`, line);
    }
  }

  return {
    ok: !result.error && result.status === 0,
    status: result.status,
    error: result.error?.message || null
  };
}

function compactReadiness(readiness) {
  if (!readiness) return null;
  return {
    fixtures: Number(readiness.fixtures || 0),
    terminal: Number(readiness.terminal || 0),
    terminalMissingScore: Number(readiness.terminalMissingScore || 0),
    open: Number(readiness.open || 0),
    duplicateIdCount: Number(readiness.duplicateIdCount || 0),
    safeToFinalizeStats: readiness.safeToFinalizeStats === true,
    openByStatus: readiness.openByStatus || {},
    openByLeague: readiness.openByLeague || {}
  };
}

function semanticSummary(report) {
  return {
    schema: report.schema,
    baseDayKey: report.baseDayKey,
    operationalDayKey: report.operationalDayKey,
    daysBack: report.daysBack,
    ok: report.ok,
    healthyCount: report.healthyCount,
    repairedCount: report.repairedCount,
    pendingCount: report.pendingCount,
    blockedIntegrityCount: report.blockedIntegrityCount,
    actionableCount: report.actionableCount,
    changedHistory: report.changedHistory,
    days: report.days.map(row => ({
      dayKey: row.dayKey,
      state: row.state,
      reasons: row.reasons,
      retryAction: row.retryAction,
      actionable: row.actionable,
      consecutiveFailureCount: row.consecutiveFailureCount,
      historyBefore: row.historyBefore,
      historyAfter: row.historyAfter,
      readiness: row.readiness,
      targetedVerifiedFinalRecovery: row.targetedVerifiedFinalRecovery,
      historyChanged: row.historyChanged
    }))
  };
}

function shouldWriteState(previous, next) {
  if (!previous) return true;
  if (next.lastState !== "healthy") return true;
  if (previous.lastState !== "healthy") return true;
  return false;
}

export async function runAutonomousTruthRecovery(baseDayKey, options = {}) {
  if (!validDayKey(baseDayKey)) {
    throw new Error(`invalid base dayKey: ${baseDayKey}`);
  }

  const daysBack = Number.isFinite(Number(options.daysBack))
    ? Math.max(1, Math.min(14, Math.floor(Number(options.daysBack))))
    : 7;
  const now = options.now instanceof Date ? options.now : new Date();
  const operationalDayKey = validDayKey(options.operationalDayKey)
    ? String(options.operationalDayKey)
    : athensDayKey(now);

  ensureDir(RECOVERY_ROOT);
  ensureDir(STATE_DIR);

  console.log("[autonomous-truth-recovery] prior-settlement:start", {
    baseDayKey,
    operationalDayKey,
    daysBack
  });

  const priorSettlement = await runPriorValueSettlementCatchup(baseDayKey, {
    daysBack,
    anchorDayKey: operationalDayKey,
    now
  });

  console.log("[autonomous-truth-recovery] prior-settlement:done", {
    ok: priorSettlement?.ok === true,
    dayCount: priorSettlement?.days?.length ?? 0
  });

  const days = [];
  const changedSeasons = new Map();
  let changedHistory = false;

  for (let back = daysBack; back >= 1; back -= 1) {
    const dayKey = shiftDay(operationalDayKey, -back);
    const canonicalDir = resolveDataPath("canonical-fixtures", dayKey);
    const hasCanonical = fs.existsSync(canonicalDir);
    const stateFile = path.join(STATE_DIR, `${dayKey}.json`);
    const previousState = readJsonSafe(stateFile, null);
    const actions = [];
    const historyBefore = historyRowsForDay(dayKey);
    let liveRefresh = null;
    let sweep = null;
    let readiness = null;
    let build = null;
    let append = null;
    let targetedVerifiedFinalRecovery = false;
    let targetedVerifiedFinalRecoveryResult = null;

    if (hasCanonical) {
      if (canonicalDayHasOpenStatusRows(dayKey)) {
        try {
          liveRefresh = await runLiveStatusRefreshDay(dayKey, {
            includeAllOpenStates: true,
            reason: "autonomous_history_recovery"
          });
          actions.push({
            action: "live_status_refresh",
            ok: liveRefresh?.ok !== false,
            changedRows: Number(liveRefresh?.changedRows || 0),
            failedLeagueCount: Number(liveRefresh?.failedLeagueCount || 0)
          });
        } catch (error) {
          actions.push({
            action: "live_status_refresh",
            ok: false,
            error: error?.message || String(error)
          });
        }
      }

      try {
        sweep = applyResultsTruthToCanonicalDay(dayKey);
        actions.push({
          action: "results_truth_sweep",
          ok: sweep?.ok !== false,
          rowsUpgraded: Number(sweep?.rowsUpgraded || 0)
        });
      } catch (error) {
        actions.push({
          action: "results_truth_sweep",
          ok: false,
          error: error?.message || String(error)
        });
      }

      readiness = auditFinalizationReadinessDay(dayKey);
      build = buildHistoryDayFromTruth(dayKey);

      if (!build?.ok && shouldAttemptVerifiedFinalRecovery(build)) {
        targetedVerifiedFinalRecovery = true;
        const offsets = verifiedFinalOffsets(dayKey, operationalDayKey);
        targetedVerifiedFinalRecoveryResult = runNodeJob([
          "./engine-v1/jobs/export-verified-final-results-day.js",
          `--date=${dayKey}`,
          "--write",
          "--all-fixtures",
          `--offsets=${offsets.join(",")}`
        ], `${dayKey}-verified-final-recovery`);
        actions.push({
          action: "verified_final_results_refresh",
          ...targetedVerifiedFinalRecoveryResult,
          offsets
        });
        build = buildHistoryDayFromTruth(dayKey);
      }

      if (build?.ok === true) {
        const equivalent = historyRowsEquivalent(historyBefore.rows, build.rows);
        if (!equivalent) {
          append = await appendFinalizedDayToHistory(dayKey);
          actions.push({
            action: "history_replace_day",
            ok: append?.ok === true,
            rowsWritten: Number(append?.rowsWritten || append?.acceptedRows || 0)
          });
          if (append?.ok === true) {
            changedHistory = true;
            changedSeasons.set(build.season, dayKey);
          }
        } else {
          actions.push({ action: "history_already_current", ok: true });
        }
      }
    }

    const historyAfter = historyRowsForDay(dayKey);
    const historyChangedForDay =
      historyBefore.present !== historyAfter.present ||
      historyBefore.matchCount !== historyAfter.matchCount ||
      !historyRowsEquivalent(historyBefore.rows, historyAfter.rows);

    let classification = classifyHistoryRecovery({
      hasCanonical,
      readiness,
      build,
      historyChanged: historyChangedForDay
    });

    if (append && append.ok !== true && build?.ok === true) {
      classification = {
        state: "operational_retry",
        reasons: [append?.reason || "history_append_failed"],
        reasonCounts: buildErrorReasonCounts(append),
        retryAction: "retry_next_checkpoint",
        immediatelyActionable: false,
        historyChanged: false
      };
    }

    const state = nextRecoveryState({
      dayKey,
      previous: previousState,
      classification,
      actions,
      now
    });

    const statePayload = {
      ...state,
      readiness: compactReadiness(readiness),
      historyBefore: {
        present: historyBefore.present,
        matchCount: historyBefore.matchCount,
        season: historyBefore.season
      },
      historyAfter: {
        present: historyAfter.present,
        matchCount: historyAfter.matchCount,
        season: historyAfter.season
      },
      build: build
        ? {
            ok: build.ok === true,
            reason: build.reason || null,
            canonicalFixtureCount: Number(build.canonicalFixtureCount || 0),
            canonicalPlayedFinalCount: Number(build.canonicalPlayedFinalCount || 0),
            verifiedFinalCount: Number(build.verifiedFinalCount || 0),
            acceptedRows: Number(build.acceptedRows || 0),
            errorReasonCounts: buildErrorReasonCounts(build)
          }
        : null,
      targetedVerifiedFinalRecovery,
      targetedVerifiedFinalRecoveryResult,
      historyChanged: historyChangedForDay
    };

    if (shouldWriteState(previousState, statePayload) || historyChangedForDay) {
      writeJsonIfChanged(stateFile, statePayload);
    }

    days.push({
      dayKey,
      state: statePayload.lastState,
      reasons: statePayload.lastReasons,
      retryAction: statePayload.retryAction,
      actionable: statePayload.actionable,
      consecutiveFailureCount: statePayload.consecutiveFailureCount,
      readiness: statePayload.readiness,
      historyBefore: statePayload.historyBefore,
      historyAfter: statePayload.historyAfter,
      targetedVerifiedFinalRecovery,
      historyChanged: historyChangedForDay
    });
  }

  if (changedHistory) {
    for (const [season, representativeDay] of changedSeasons.entries()) {
      console.log("[autonomous-truth-recovery] history-report:rebuild", { season });
      buildHistoryReport(season);

      console.log("[autonomous-truth-recovery] history-indexes:rebuild", {
        season,
        representativeDay
      });
      const indexes = await rebuildIndexesForSeason(representativeDay);
      if (indexes?.ok !== true) {
        throw new Error(`autonomous_history_index_rebuild_failed:${season}`);
      }

      console.log("[autonomous-truth-recovery] model-priors:rebuild", { season });
      const priors = await buildModelPriors({ targetSeason: season });
      if (priors?.ok !== true) {
        throw new Error(`autonomous_model_priors_rebuild_failed:${season}`);
      }
    }

    console.log("[autonomous-truth-recovery] h2h-foundation:rebuild");
    const h2h = rebuildH2HFoundationFromCurrentHistory();
    if (h2h?.ok !== true || h2h?.validation?.ok !== true) {
      throw new Error("autonomous_h2h_foundation_rebuild_failed");
    }
  }

  const healthyCount = days.filter(row => row.state === "healthy" || row.state === "skipped").length;
  const repairedCount = days.filter(row => row.state === "repaired").length;
  const pendingCount = days.filter(row => ["pending_truth", "pending_verified_final", "operational_retry"].includes(row.state)).length;
  const blockedIntegrityCount = days.filter(row => row.state === "blocked_integrity").length;
  const actionableCount = days.filter(row => row.actionable).length;

  const report = {
    schema: "ai-matchlab.autonomous-history-recovery.v1",
    baseDayKey,
    operationalDayKey,
    daysBack,
    generatedAt: now.toISOString(),
    ok: blockedIntegrityCount === 0,
    healthyCount,
    repairedCount,
    pendingCount,
    blockedIntegrityCount,
    actionableCount,
    changedHistory,
    priorSettlementOk: priorSettlement?.ok === true,
    days
  };

  const latestFile = path.join(RECOVERY_ROOT, "latest.json");
  const dayFile = path.join(RECOVERY_ROOT, `${operationalDayKey}.json`);
  const previousLatest = readJsonSafe(latestFile, null);
  const semantic = semanticSummary(report);
  const previousSemantic = previousLatest ? semanticSummary(previousLatest) : null;

  if (JSON.stringify(semantic) !== JSON.stringify(previousSemantic)) {
    writeJsonIfChanged(dayFile, report);
    writeJsonIfChanged(latestFile, report);
  }

  console.log("[autonomous-truth-recovery] done", {
    operationalDayKey,
    healthyCount,
    repairedCount,
    pendingCount,
    blockedIntegrityCount,
    actionableCount,
    changedHistory
  });

  return report;
}

function parseCli(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const dayKey = args.find(arg => validDayKey(arg)) || athensDayKey();
  const daysBackArg = args.find(arg => String(arg).startsWith("--days-back="));
  const daysBack = daysBackArg ? Number(daysBackArg.split("=")[1]) : 7;
  return { dayKey, daysBack };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const { dayKey, daysBack } = parseCli(process.argv.slice(2));
  runAutonomousTruthRecovery(dayKey, { daysBack })
    .then(report => {
      console.log(JSON.stringify(report, null, 2));
    })
    .catch(error => {
      console.error("[autonomous-truth-recovery] fatal", error);
      process.exitCode = 1;
    });
}
