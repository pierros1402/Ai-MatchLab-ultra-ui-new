import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  countUnresolvedComparisonPicks,
  resettleValueDay
} from "./run-daily-cycle.js";
import { runLiveStatusRefreshDay } from "./run-live-status-refresh-day.js";
import { resolveDataPath } from "../storage/data-root.js";

const JOBS_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(JOBS_DIR, "../..");

function validDayKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/u.test(String(value || ""));
}

function shiftDay(dayKey, offset) {
  const date = new Date(`${dayKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + Number(offset || 0));
  return date.toISOString().slice(0, 10);
}

function athensDayKey(now = new Date()) {
  return now.toLocaleDateString("en-CA", { timeZone: "Europe/Athens" });
}

function dayOffset(dayKey, referenceDayKey) {
  const day = Date.parse(`${dayKey}T12:00:00.000Z`);
  const reference = Date.parse(`${referenceDayKey}T12:00:00.000Z`);
  return Math.round((day - reference) / 86400000);
}

function runNodeJob(args, label) {
  const result = spawnSync(process.execPath, args, {
    cwd: REPO_ROOT,
    stdio: "inherit",
    shell: false
  });

  if (result.error) {
    console.warn(`[prior-value-catchup] ${label}:error`, result.error.message);
    return false;
  }

  if (result.status !== 0) {
    console.warn(`[prior-value-catchup] ${label}:exit`, result.status);
    return false;
  }

  return true;
}

function hasSettlementArtifacts(dayKey) {
  const paths = [
    resolveDataPath("deploy-snapshots", dayKey, "value.json"),
    resolveDataPath("value", `${dayKey}.json`),
    resolveDataPath("value-comparison", `${dayKey}.json`),
    resolveDataPath("value-plans", dayKey, "plan-a2.json"),
    resolveDataPath("value-plans", dayKey, "plan-b.json"),
    resolveDataPath("value-plans", dayKey, "plan-b2.json")
  ];

  return paths.some(file => fs.existsSync(file));
}

function rowsOfCanonicalPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.fixtures)) return payload.fixtures;
  if (Array.isArray(payload?.matches)) return payload.matches;
  if (Array.isArray(payload?.rows)) return payload.rows;
  return [];
}

function canonicalRowIsTerminal(row) {
  const statusText = [
    row?.status,
    row?.statusType,
    row?.rawStatus,
    row?.operationalState,
    row?.phase
  ]
    .map(value => String(value || "").trim().toUpperCase())
    .filter(Boolean)
    .join(" ");

  return /\b(FT|FINAL|STATUS_FINAL|AET|PEN|CANCELLED|CANCELED|POSTPONED|ABANDONED|SUSPENDED|AWARDED|WALKOVER|WO)\b/u.test(statusText);
}

export function canonicalDayHasOpenStatusRows(dayKey) {
  const dir = resolveDataPath("canonical-fixtures", dayKey);
  if (!fs.existsSync(dir)) return false;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;

    try {
      const payload = JSON.parse(
        fs.readFileSync(path.join(dir, entry.name), "utf8")
      );

      if (rowsOfCanonicalPayload(payload).some(row => !canonicalRowIsTerminal(row))) {
        return true;
      }
    } catch {
      // Unreadable canonical evidence is not treated as terminal. The normal
      // source/status jobs and health gates remain responsible for surfacing it.
      return true;
    }
  }

  return false;
}

function verifiedFinalOffsets(dayKey, todayDayKey) {
  const center = dayOffset(dayKey, todayDayKey);
  return [...new Set([center - 1, center, center + 1])];
}

export async function runPriorValueSettlementCatchup(baseDayKey, options = {}) {
  if (!validDayKey(baseDayKey)) {
    throw new Error(`invalid base dayKey: ${baseDayKey}`);
  }

  const daysBack = Number.isFinite(Number(options.daysBack))
    ? Math.max(1, Math.min(14, Math.floor(Number(options.daysBack))))
    : 7;
  const todayDayKey = athensDayKey(options.now instanceof Date ? options.now : new Date());
  const settlementAnchorDayKey = validDayKey(options.anchorDayKey)
    ? String(options.anchorDayKey)
    : todayDayKey;
  const days = [];

  // The daily workflow can pre-build TOMORROW in the Athens evening window.
  // Settlement age must still be relative to the real operational day, not to
  // that future build target, otherwise D-1 can silently become D-2 or today.
  // Oldest first so the newest historical day is the last per-day health write.
  for (let back = daysBack; back >= 1; back -= 1) {
    const dayKey = shiftDay(settlementAnchorDayKey, -back);
    const canonicalDir = resolveDataPath("canonical-fixtures", dayKey);
    const hasCanonical = fs.existsSync(canonicalDir);
    const hasSettlement = hasSettlementArtifacts(dayKey);

    if (!hasCanonical && !hasSettlement) {
      days.push({ dayKey, skipped: true, reason: "no_canonical_or_value_artifacts" });
      continue;
    }

    const row = {
      dayKey,
      skipped: false,
      liveStatus: null,
      allFixtureFinalResults: null,
      settlementAttempted: false,
      unresolvedBefore: countUnresolvedComparisonPicks(dayKey),
      unresolvedAfter: null,
      openCanonicalBefore: hasCanonical ? canonicalDayHasOpenStatusRows(dayKey) : false,
      openCanonicalAfter: null,
      errors: []
    };

    const needsSettlement = hasSettlement && row.unresolvedBefore !== 0;

    // Do not tie historical FT/result truth refresh to Value picks. A past day
    // may still contain PRE/LIVE/UNKNOWN canonical rows even when every Value
    // pick is already settled (or the fixture never had a Value pick at all).
    // Provider refresh remains exact-evidence/monotonic and never promotes FT
    // merely because time elapsed.
    const refreshTruth = hasCanonical && (
      back === 1 ||
      needsSettlement ||
      row.openCanonicalBefore
    );

    if (refreshTruth) {
      try {
        const live = await runLiveStatusRefreshDay(dayKey, {
          includeAllOpenStates: true,
          reason: "independent_prior_value_settlement_catchup"
        });
        row.liveStatus = {
          ok: live?.ok !== false,
          changedRows: Number(live?.changedRows || 0),
          failedLeagueCount: Number(live?.failedLeagueCount || 0)
        };
      } catch (error) {
        row.errors.push(`live_status:${error?.message || String(error)}`);
      }
    }

    if (refreshTruth) {
      const offsets = verifiedFinalOffsets(dayKey, todayDayKey);
      row.allFixtureFinalResults = runNodeJob([
        "./engine-v1/jobs/export-verified-final-results-day.js",
        `--date=${dayKey}`,
        "--write",
        "--all-fixtures",
        `--offsets=${offsets.join(",")}`
      ], `${dayKey}-all-fixtures`);
    }

    if (needsSettlement) {
      row.settlementAttempted = true;
      try {
        resettleValueDay(
          dayKey,
          `independent-prior-${dayKey}`,
          dayOffset(dayKey, todayDayKey)
        );
      } catch (error) {
        row.errors.push(`settlement:${error?.message || String(error)}`);
      }
    }

    row.unresolvedAfter = countUnresolvedComparisonPicks(dayKey);
    row.openCanonicalAfter = hasCanonical ? canonicalDayHasOpenStatusRows(dayKey) : false;

    runNodeJob([
      "./engine-v1/jobs/build-system-health-alerts-day.js",
      `--date=${dayKey}`
    ], `${dayKey}-system-health`);

    days.push(row);
  }

  runNodeJob([
    "./engine-v1/jobs/build-value-comparison-cumulative.js",
    "--write"
  ], "value-comparison-cumulative");

  // Keep latest System Health anchored to the actual Athens day, not to an
  // evening pre-build target (which can be tomorrow).
  runNodeJob([
    "./engine-v1/jobs/build-system-health-alerts-day.js",
    `--date=${todayDayKey}`
  ], `${todayDayKey}-system-health-latest`);

  return {
    ok: true,
    baseDayKey,
    todayDayKey,
    settlementAnchorDayKey,
    daysBack,
    days
  };
}

const isCli = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCli) {
  const baseDayKey = String(process.argv[2] || "").trim();
  const daysBackArg = process.argv.find(arg => String(arg).startsWith("--days-back="));
  const daysBack = daysBackArg ? Number(daysBackArg.slice("--days-back=".length)) : 7;

  runPriorValueSettlementCatchup(baseDayKey, { daysBack })
    .then(result => console.log(JSON.stringify(result, null, 2)))
    .catch(error => {
      console.error("[prior-value-catchup] fatal", error);
      process.exitCode = 1;
    });
}
