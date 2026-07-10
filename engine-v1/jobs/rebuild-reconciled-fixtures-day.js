import path from "path";
import { fileURLToPath } from "url";

import { reconcileObservations } from "../core/reconcile-observations.js";
import { canonicalFixturesForDay } from "../core/day-fixture-universe.js";
import {
  getFixtureById,
  getFixtureByMatchKey,
  upsertFixtureWithMeta
} from "../storage/json-db.js";

function isValidDayKey(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function parseTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const text = String(value || "").trim();
  if (!text) return null;

  if (/^\d+$/.test(text)) {
    const numeric = Number(text);
    return Number.isFinite(numeric) ? numeric : null;
  }

  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function canonicalObservation(row, dayKey) {
  const matchId = String(
    row?.matchId ||
    row?.canonicalId ||
    row?.sourceMatchId ||
    row?.sourceId ||
    row?.matchKey ||
    ""
  ).trim();

  const matchKey = String(
    row?.matchKey ||
    row?.canonicalId ||
    matchId
  ).trim();

  const timestamp =
    parseTimestamp(row?.lastSeenAt) ??
    parseTimestamp(row?.updatedAt) ??
    parseTimestamp(row?.firstSeenAt) ??
    Date.now();

  return {
    ...row,
    matchId,
    matchKey,
    canonicalId: row?.canonicalId || matchId || null,
    dayKey: String(row?.dayKey || dayKey),
    actualDay: String(row?.dayKey || dayKey),
    source: String(row?.source || "canonical-fixtures"),
    ts: timestamp
  };
}

export async function rebuildReconciledFixturesDay(
  dayKey,
  options = {}
) {
  const safeDayKey = String(dayKey || "").trim();

  if (!isValidDayKey(safeDayKey)) {
    throw new Error(`invalid dayKey: ${dayKey}`);
  }

  const write = options?.write !== false;
  const env = options?.env || process.env;
  const canonicalRows = canonicalFixturesForDay(safeDayKey);

  const stats = {
    ok: true,
    dayKey: safeDayKey,
    write,
    canonicalRows: canonicalRows.length,
    reconciledRows: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    rowsWithOperationalState: 0,
    rowsWithDisplayFlags: 0,
    rowsWithHealth: 0,
    rowsWithSources: 0,
    rowsWithReconcileMeta: 0,
    completeCoverage: false
  };

  const reconciledRows = [];

  for (const canonical of canonicalRows) {
    const observation = canonicalObservation(canonical, safeDayKey);

    if (!observation.matchId) {
      stats.skipped++;
      continue;
    }

    const existing =
      (observation.matchKey
        ? getFixtureByMatchKey(observation.matchKey)
        : null) ||
      getFixtureById(observation.matchId);

    // Canonical identity/status/score/kickoff remain authoritative.
    // Existing JSON-DB data is only a state baseline and never overrides
    // the current canonical row.
    const baseline = {
      ...(existing && typeof existing === "object" ? existing : {}),
      ...canonical,
      matchId: observation.matchId,
      matchKey: observation.matchKey,
      canonicalId: observation.canonicalId,
      dayKey: safeDayKey
    };

    const merged = await reconcileObservations({
      env,
      observations: [observation],
      existing: baseline,
      // Synthetic canonical observations rebuild runtime metadata only.
      // They must not train reliability or persist disagreements.
      sideEffects: false
    });

    if (!merged) {
      stats.skipped++;
      continue;
    }

    stats.reconciledRows++;

    if (merged.operationalState !== undefined) {
      stats.rowsWithOperationalState++;
    }

    if (
      typeof merged.isDisplayLive === "boolean" &&
      typeof merged.isDisplayPre === "boolean" &&
      typeof merged.isDisplayFinal === "boolean"
    ) {
      stats.rowsWithDisplayFlags++;
    }

    if (merged.health && typeof merged.health === "object") {
      stats.rowsWithHealth++;
    }

    if (
      merged.sources &&
      typeof merged.sources === "object" &&
      Object.keys(merged.sources).length > 0
    ) {
      stats.rowsWithSources++;
    }

    if (
      merged.reconcileMeta &&
      typeof merged.reconcileMeta === "object"
    ) {
      stats.rowsWithReconcileMeta++;
    }

    reconciledRows.push(merged);
  }

  const expectedRows = stats.canonicalRows;

  stats.completeCoverage = [
    stats.reconciledRows,
    stats.rowsWithOperationalState,
    stats.rowsWithDisplayFlags,
    stats.rowsWithHealth,
    stats.rowsWithSources,
    stats.rowsWithReconcileMeta
  ].every(count => count === expectedRows);

  if (!stats.completeCoverage) {
    throw new Error(
      "reconciled_fixture_coverage_incomplete: " +
      JSON.stringify({
        dayKey: safeDayKey,
        expectedRows,
        reconciledRows: stats.reconciledRows,
        skipped: stats.skipped,
        rowsWithOperationalState: stats.rowsWithOperationalState,
        rowsWithDisplayFlags: stats.rowsWithDisplayFlags,
        rowsWithHealth: stats.rowsWithHealth,
        rowsWithSources: stats.rowsWithSources,
        rowsWithReconcileMeta: stats.rowsWithReconcileMeta
      })
    );
  }

  // Validation is complete before any JSON-DB mutation begins.
  if (write) {
    for (const merged of reconciledRows) {
      const action = String(upsertFixtureWithMeta(merged) || "");

      if (action === "inserted") stats.inserted++;
      else if (action === "updated") stats.updated++;
      else stats.unchanged++;
    }
  }

  return stats;
}

const isCli =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isCli) {
  const dayKey = String(process.argv[2] || "").trim();
  const dryRun = process.argv.includes("--dry-run");

  rebuildReconciledFixturesDay(dayKey, {
    write: !dryRun,
    env: process.env
  })
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch(err => {
      console.error("[rebuild-reconciled-fixtures-day] failed", err);
      process.exit(1);
    });
}
