import fs from "fs";
import path from "path";
import { getFixturesByDay, markDayFinal } from "../storage/json-db.js";
import { getObservationsByMatchId } from "../storage/observations-db.js";
import { appendFinalizedDayToHistory } from "./append-finalized-day-to-history.js";

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

function updateValueResults(dayKey) {
  const valueFile = path.join(process.cwd(), "data", "value", `${dayKey}.json`);
  if (!fs.existsSync(valueFile)) return;

  const historyFile = path.join(process.cwd(), "data", "history", `${dayKey}.json`);
  if (!fs.existsSync(historyFile)) return;

  const valueData = JSON.parse(fs.readFileSync(valueFile, "utf8"));
  const history = JSON.parse(fs.readFileSync(historyFile, "utf8"));

  const rows = Array.isArray(history?.matches)
    ? history.matches
    : Array.isArray(history)
      ? history
      : [];

  const matchMap = new Map();

  for (const m of rows) {
    matchMap.set(String(m.matchId), m);
  }

  for (const pick of valueData.picks || []) {
    const match = matchMap.get(String(pick.matchId));
    if (!match) continue;

    const home = Number(match.scoreHome);
    const away = Number(match.scoreAway);

    if (!Number.isFinite(home) || !Number.isFinite(away)) continue;

    let win = false;

    if (pick.market === "Over / Under 1.5") {
      win = (home + away) > 1;
    } else if (pick.market === "Over / Under 2.5") {
      win = (home + away) > 2;
    } else if (pick.market === "Over / Under 3.5") {
      win = (home + away) > 3;
    } else if (pick.market === "BTTS") {
      win = home > 0 && away > 0;
    } else if (pick.market === "1X2") {
      const sel = String(pick.pick || "").toUpperCase();

      if (sel === "HOME" || sel === "1") win = home > away;
      else if (sel === "AWAY" || sel === "2") win = away > home;
      else if (sel === "DRAW" || sel === "X") win = home === away;
      else continue;
    } else {
      continue;
    }

    pick.result = win ? "WIN" : "LOSS";
  }

  valueData.updatedAt = Date.now();
  fs.writeFileSync(valueFile, JSON.stringify(valueData, null, 2));
}

export function finalizeDayIfSafe(dayKey) {
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
  appendFinalizedDayToHistory(dayKey);
  updateValueResults(dayKey);

  return {
    ok: true,
    dayKey,
    finalized: rows.length
  };
}