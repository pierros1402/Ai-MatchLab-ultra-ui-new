import fs from "fs";
import { getFixturesByDay, markDayFinal } from "../storage/json-db.js";
import { getObservationsByMatchId } from "../storage/observations-db.js";
import { appendFinalizedDayToHistory } from "./append-finalized-day-to-history.js";
import { resolveDataPath } from "../storage/data-root.js";

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

  return (
    s === "PRE" ||
    s.includes("SCHEDULED")
  );
}

function isTerminal(status) {
  const s = String(status || "").toUpperCase();

  return (
    s.includes("FT") ||
    s.includes("FINAL") ||
    s.includes("COMPLETE")
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

  if (pick.market === "Over / Under 1.5") return (home + away) > 1;
  if (pick.market === "Over / Under 2.5") return (home + away) > 2;
  if (pick.market === "Over / Under 3.5") return (home + away) > 3;
  if (pick.market === "BTTS") return home > 0 && away > 0;

  if (pick.market === "1X2") {
    const sel = String(pick.pick || "").toUpperCase();

    if (sel === "HOME" || sel === "1") return home > away;
    if (sel === "AWAY" || sel === "2") return away > home;
    if (sel === "DRAW" || sel === "X") return home === away;
  }

  return null;
}

function updateValueResults(dayKey, rows = []) {
  const valueFile = resolveDataPath("value", `${dayKey}.json`);
  if (!fs.existsSync(valueFile)) return { ok: false, reason: "no_value_file", dayKey };

  const valueData = JSON.parse(fs.readFileSync(valueFile, "utf8"));
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

  for (const pick of valueData.picks || []) {
    const match = matchMap.get(String(pick.matchId));
    if (!match) continue;

    const win = evaluatePickResult(pick, match);
    if (win === null) continue;

    pick.result = win ? "WIN" : "LOSS";
    updated += 1;
  }

  valueData.updatedAt = Date.now();
  valueData.count = Array.isArray(valueData.picks) ? valueData.picks.length : 0;
  fs.writeFileSync(valueFile, JSON.stringify(valueData, null, 2));

  return { ok: true, dayKey, updated };
}

export async function finalizeDayIfSafe(dayKey) {
  const rows = getFixturesByDay(dayKey);

  if (!rows.length) {
    return { ok: false, reason: "no_rows", dayKey };
  }

  const liveMatches = rows.filter(r => isLiveLike(r.status));

  if (liveMatches.length) {
    return {
      ok: false,
      reason: "live_exists",
      dayKey,
      liveCount: liveMatches.length
    };
  }

  const preMatches = rows.filter(r => isPreLike(r.status));

  const blockingPre = preMatches.filter(
    r => !isSpecial(r.status)
  );

  if (blockingPre.length) {
    return {
      ok: false,
      reason: "pre_exists",
      dayKey,
      preCount: blockingPre.length
    };
  }

  const invalid = rows.filter(
    r => !isTerminal(r.status) && !isSpecial(r.status)
  );

  if (invalid.length) {
    return {
      ok: false,
      reason: "non_terminal_remaining",
      dayKey,
      count: invalid.length
    };
  }

  const unstableTerminal = rows.filter(
    r => isTerminal(r.status) && !hasStableTerminalObservation(r, dayKey)
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