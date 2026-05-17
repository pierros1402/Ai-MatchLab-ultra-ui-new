import fs from "fs";
import { getFixturesByDay, markDayFinal } from "../storage/json-db.js";
import { getObservationsByMatchId } from "../storage/observations-db.js";
import { appendFinalizedDayToHistory } from "./append-finalized-day-to-history.js";
import { resolveDataPath } from "../storage/data-root.js";

const NO_DRAW_COMPETITIONS = new Set([
  "jpn.1"
]);

function isNoDrawCompetition(slug) {
  return NO_DRAW_COMPETITIONS.has(String(slug || "").trim());
}

function hasPenaltyResolution(row) {
  const homePens = Number(row?.penalties?.home);
  const awayPens = Number(row?.penalties?.away);

  const hasStructuredPens =
    Number.isFinite(homePens) &&
    Number.isFinite(awayPens);

  const decidedByPens =
    String(row?.decidedBy || "").toLowerCase() === "pens";

  return hasStructuredPens || decidedByPens;
}

function isMissingMandatoryResolution(row) {
  if (!row) return false;
  if (!isNoDrawCompetition(row.leagueSlug)) return false;
  if (!isOperationallyTerminal(row)) return false;

  const home = Number(row.scoreHome);
  const away = Number(row.scoreAway);

  if (!Number.isFinite(home) || !Number.isFinite(away)) return false;
  if (home !== away) return false;

  return !hasPenaltyResolution(row);
}

function opState(row) {
  return String(row?.operationalState || "").toUpperCase();
}

function isLiveLike(status) {
  const s = String(status || "").toUpperCase();

  return (
    s.includes("LIVE") ||
    s.includes("IN_PROGRESS") ||
    s.includes("FIRST_HALF") ||
    s.includes("SECOND_HALF") ||
    s.includes("HALF") ||
    s.includes("EXTRA_TIME")
  );
}

function isPreLike(status) {
  const s = String(status || "").toUpperCase();

  return s === "PRE" || s.includes("SCHEDULED");
}

function isTerminal(status) {
  const s = String(status || "").toUpperCase();

  return (
    s.includes("FT") ||
    s.includes("FINAL") ||
    s.includes("FULL_TIME") ||
    s.includes("COMPLETE") ||
    s.includes("AET") ||
    s.includes("PEN")
  );
}

function isSpecial(status) {
  const s = String(status || "").toUpperCase();

  return (
    s.includes("POSTPONED") ||
    s.includes("CANCELED") ||
    s.includes("ABANDONED") ||
    s === "SPECIAL"
  );
}

function isOperationallyBlockingLive(row) {
  const op = opState(row);

  if (op === "LIVE") return true;
  if (op === "STALE_LIVE") return true;
  if (op === "TERMINAL_UNCONFIRMED") return true;

  if (!op) {
    return isLiveLike(row?.status);
  }

  return false;
}

function isOperationallyBlockingPre(row) {
  const op = opState(row);

  if (op === "PRE") return true;
  if (!op) return isPreLike(row?.status);

  return false;
}

function isOperationallyTerminal(row) {
  const op = opState(row);

  if (op === "TERMINAL_CONFIRMED") return true;
  if (op === "SPECIAL") return false;

  if (!op) return isTerminal(row?.status);

  return false;
}

function isOperationallySpecial(row) {
  const op = opState(row);

  if (op === "SPECIAL") return true;
  if (!op) return isSpecial(row?.status);

  return false;
}

function sameDayObservation(obs, dayKey) {
  const actual = String(obs?.actualDay || "");
  const requested = String(obs?.requestedDay || "");
  return actual === String(dayKey) || requested === String(dayKey);
}

function hasStableTerminalObservation(row, dayKey) {
  const obs = getObservationsByMatchId(row.matchId) || [];
  if (!obs.length) return false;

  const sameDayObs = obs.filter(o => sameDayObservation(o, dayKey));
  const pool = sameDayObs.length ? sameDayObs : obs;

  const terminalObs = pool.filter(o => isTerminal(o.status));
  if (!terminalObs.length) return false;

  const last = terminalObs[terminalObs.length - 1];
  if (!last) return false;

  const rowHome = Number(row.scoreHome);
  const rowAway = Number(row.scoreAway);
  const lastHome = Number(last.scoreHome);
  const lastAway = Number(last.scoreAway);

  if (!Number.isFinite(rowHome) || !Number.isFinite(rowAway)) return false;
  if (!Number.isFinite(lastHome) || !Number.isFinite(lastAway)) return false;

  if (rowHome !== lastHome || rowAway !== lastAway) return false;

  const conflictingTerminal = terminalObs.some(o => {
    const h = Number(o.scoreHome);
    const a = Number(o.scoreAway);

    if (!Number.isFinite(h) || !Number.isFinite(a)) return true;
    return h !== rowHome || a !== rowAway;
  });

  if (conflictingTerminal) return false;

  return true;
}

function evaluatePickResult(pick, match) {
  const home = Number(match?.scoreHome);
  const away = Number(match?.scoreAway);

  if (!Number.isFinite(home) || !Number.isFinite(away)) return null;

  if (pick.market === "Over / Under 1.5") return home + away > 1;
  if (pick.market === "Over / Under 2.5") return home + away > 2;
  if (pick.market === "Over / Under 3.5") return home + away > 3;
  if (pick.market === "BTTS") return home > 0 && away > 0;

  if (pick.market === "1X2") {
    const sel = String(pick.pick || "").toUpperCase();

    if (sel === "HOME" || sel === "1") return home > away;
    if (sel === "AWAY" || sel === "2") return away > home;
    if (sel === "DRAW" || sel === "X") return home === away;
  }

  return null;
}

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function updateValueResults(dayKey, rows = []) {
  const valueFile = resolveDataPath("value", `${dayKey}.json`);
  const snapshotValueFile = resolveDataPath("deploy-snapshots", dayKey, "value.json");

  const localValueData = readJsonSafe(valueFile, null);
  const snapshotValueData = readJsonSafe(snapshotValueFile, null);

  const sourceValueData =
    localValueData && typeof localValueData === "object"
      ? localValueData
      : snapshotValueData && typeof snapshotValueData === "object"
        ? {
            ...snapshotValueData,
            source: snapshotValueData.source || "deploy_snapshot_value_fallback"
          }
        : null;

  if (!sourceValueData || !Array.isArray(sourceValueData.picks)) {
    return {
      ok: false,
      reason: "no_value_picks",
      dayKey,
      valueFileExists: fs.existsSync(valueFile),
      snapshotValueFileExists: fs.existsSync(snapshotValueFile)
    };
  }

  const matchMap = new Map();

  for (const row of rows || []) {
    const keys = [row?.matchId, row?.id]
      .filter(Boolean)
      .map(v => String(v));

    for (const key of keys) {
      matchMap.set(key, row);
    }
  }

  let updated = 0;
  let unresolved = 0;

  for (const pick of sourceValueData.picks || []) {
    delete pick.result;

    const pickKeys = [pick?.matchId, pick?.id, pick?.fixtureId]
      .filter(Boolean)
      .map(v => String(v));

    const match = pickKeys.map(key => matchMap.get(key)).find(Boolean);

    if (!match) {
      unresolved += 1;
      continue;
    }

    const homeScore = Number(match?.scoreHome ?? match?.homeScore);
    const awayScore = Number(match?.scoreAway ?? match?.awayScore);

    if (
      !isOperationallyTerminal(match) ||
      !Number.isFinite(homeScore) ||
      !Number.isFinite(awayScore)
    ) {
      unresolved += 1;
      continue;
    }

    const win = evaluatePickResult(pick, match);
    if (win === null) {
      unresolved += 1;
      continue;
    }

    pick.result = win ? "WIN" : "LOSS";
    updated += 1;
  }

  sourceValueData.updatedAt = Date.now();
  sourceValueData.count = Array.isArray(sourceValueData.picks) ? sourceValueData.picks.length : 0;
  sourceValueData.settlement = {
    dayKey,
    source: localValueData ? "local_value_file" : "deploy_snapshot_value_fallback",
    updated,
    unresolved,
    settledAt: new Date().toISOString()
  };

  fs.mkdirSync(resolveDataPath("value"), { recursive: true });
  fs.writeFileSync(valueFile, JSON.stringify(sourceValueData, null, 2));

  return {
    ok: true,
    dayKey,
    updated,
    unresolved,
    source: sourceValueData.settlement.source,
    wroteValueFile: valueFile
  };
}

function readSnapshotFixtureRows(dayKey) {
  const snapshotFixturesFile = resolveDataPath("deploy-snapshots", dayKey, "fixtures.json");
  const data = readJsonSafe(snapshotFixturesFile, null);

  if (!data) {
    return {
      rows: [],
      source: null,
      snapshotFixturesFile,
      exists: fs.existsSync(snapshotFixturesFile)
    };
  }

  const rows = Array.isArray(data)
    ? data
    : Array.isArray(data.fixtures)
      ? data.fixtures
      : Array.isArray(data.rows)
        ? data.rows
        : Array.isArray(data.items)
          ? data.items
          : [];

  return {
    rows,
    source: "deploy_snapshot_fixtures_fallback",
    snapshotFixturesFile,
    exists: fs.existsSync(snapshotFixturesFile)
  };
}

export async function settleValueResultsIfPossible(dayKey) {
  const storageRows = getFixturesByDay(dayKey);

  const rowSource = storageRows.length
    ? {
        rows: storageRows,
        source: "storage_rows",
        snapshotFixturesFile: null,
        exists: true
      }
    : readSnapshotFixtureRows(dayKey);

  if (!rowSource.rows.length) {
    return {
      ok: false,
      reason: "no_rows",
      dayKey,
      source: rowSource.source,
      snapshotFixturesFile: rowSource.snapshotFixturesFile,
      snapshotFixturesFileExists: rowSource.exists
    };
  }

  const valueResolution = updateValueResults(dayKey, rowSource.rows);

  return {
    ok: Boolean(valueResolution?.ok),
    dayKey,
    rowSource: rowSource.source,
    rowCount: rowSource.rows.length,
    valueResolution
  };
}

export async function finalizeDayIfSafe(dayKey) {
  const rows = getFixturesByDay(dayKey);

  if (!rows.length) {
    return { ok: false, reason: "no_rows", dayKey };
  }

  const liveMatches = rows.filter(isOperationallyBlockingLive);

  if (liveMatches.length) {
    return {
      ok: false,
      reason: "live_exists",
      dayKey,
      liveCount: liveMatches.length,
      matchIds: liveMatches.map(r => r.matchId)
    };
  }

  const preMatches = rows.filter(isOperationallyBlockingPre);
  const blockingPre = preMatches.filter(r => !isOperationallySpecial(r));

  if (blockingPre.length) {
    return {
      ok: false,
      reason: "pre_exists",
      dayKey,
      preCount: blockingPre.length,
      matchIds: blockingPre.map(r => r.matchId)
    };
  }

  const invalid = rows.filter(
    r => !isOperationallyTerminal(r) && !isOperationallySpecial(r)
  );

  if (invalid.length) {
    return {
      ok: false,
      reason: "non_terminal_remaining",
      dayKey,
      count: invalid.length,
      matchIds: invalid.map(r => r.matchId)
    };
  }

  const unstableTerminal = rows.filter(
    r => isOperationallyTerminal(r) && !hasStableTerminalObservation(r, dayKey)
  );

  if (unstableTerminal.length) {
    return {
      ok: false,
      reason: "unstable_terminal_scores",
      dayKey,
      count: unstableTerminal.length,
      matchIds: unstableTerminal.map(r => r.matchId)
    };
  }

  const unresolvedMandatoryResolution = rows.filter(isMissingMandatoryResolution);

  if (unresolvedMandatoryResolution.length) {
    return {
      ok: false,
      reason: "missing_mandatory_resolution",
      dayKey,
      count: unresolvedMandatoryResolution.length,
      matchIds: unresolvedMandatoryResolution.map(r => r.matchId)
    };
  }

  markDayFinal(dayKey);
  await appendFinalizedDayToHistory(dayKey);
  const valueResolution = updateValueResults(dayKey, rows);

  return {
    ok: true,
    dayKey,
    finalized: rows.length,
    valueResolution
  };
}