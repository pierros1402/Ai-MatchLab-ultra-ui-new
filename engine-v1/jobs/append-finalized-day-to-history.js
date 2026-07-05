import fs from "fs/promises";
import { getFixturesByDay } from "../storage/json-db.js";
import { ensureDir, resolveDataPath } from "../storage/data-root.js";
import { currentSeason } from "../core/season.js";

const HISTORY_DIR = ensureDir(resolveDataPath("history"));

// Season attribution MUST match core/season.js (rollover = 1 August). This
// used to flip on 1 July, so July days were appended into <nextSeason>.json
// while every reader (report, indexes, priors) looked at the current-season
// store — the two files split the same month between them.
function resolveSeasonFromDay(dayKey) {
  const [year, month, day] = String(dayKey).split("-").map(Number);

  if (!year || !month) return "unknown-season";

  return currentSeason(new Date(Date.UTC(year, month - 1, day || 1)));
}

async function readJsonSafe(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function isTerminalRow(row) {
  const status = String(row?.status || "").toUpperCase();
  const rawStatus = String(row?.rawStatus || "").toUpperCase();
  const operationalState = String(row?.operationalState || "").toUpperCase();

  if (Number(row?.finalized) === 1) return true;
  if (String(row?.state || "").toLowerCase() === "final") return true;
  if (row?.isDisplayFinal === true) return true;

  if (
    status === "FT" ||
    status === "AET" ||
    status === "PEN" ||
    status === "POST" ||
    status === "FINAL"
  ) {
    return true;
  }

  if (
    rawStatus.includes("STATUS_FULL_TIME") ||
    rawStatus.includes("STATUS_FINAL") ||
    rawStatus.includes("STATUS_AET") ||
    rawStatus.includes("STATUS_PEN")
  ) {
    return true;
  }

  if (
    operationalState === "TERMINAL_CONFIRMED" ||
    operationalState === "TERMINAL"
  ) {
    return true;
  }

  return false;
}

function normalizeHistoryRow(row, season, dayKey) {
  return {
    id: row.id || row.matchId || "",
    season,
    dayKey,
    kickoff: row.kickoffUtc || row.kickoff || row.startTime || null,
    kickoff_ms:
      typeof row.kickoffTs === "number"
        ? row.kickoffTs
        : (row.kickoffUtc || row.kickoff || row.startTime)
          ? Date.parse(row.kickoffUtc || row.kickoff || row.startTime)
          : null,
    leagueSlug: row.leagueSlug || "",
    leagueName: row.leagueName || "",
    homeTeam: row.homeTeam || "",
    awayTeam: row.awayTeam || "",
    scoreHome: Number.isFinite(Number(row.scoreHome)) ? Number(row.scoreHome) : null,
    scoreAway: Number.isFinite(Number(row.scoreAway)) ? Number(row.scoreAway) : null,
    status: row.status || "",
    minute: row.minute || "",
    outcome:
      Number(row.scoreHome) > Number(row.scoreAway)
        ? "HOME"
        : Number(row.scoreHome) < Number(row.scoreAway)
          ? "AWAY"
          : "DRAW",
    source: row.source || row.chosenSource || "canonical",
    rebuiltAt: Date.now(),
    competitionType: row.competitionType || null,
    leagueTier: row.leagueTier ?? null,
    leagueTrust: row.leagueTrust ?? null,
    phase: row.phase || "regular"
  };
}

function normalizeHistoryDays(history) {
  const rawDays = history?.days;

  if (!Array.isArray(rawDays)) {
    return [];
  }

  return rawDays
    .map(day => ({
      dayKey: day?.dayKey || "",
      matchCount: Array.isArray(day?.rows) ? day.rows.length : 0,
      rows: Array.isArray(day?.rows) ? day.rows : [],
      updatedAt: day?.updatedAt || Date.now()
    }))
    .filter(day => !!day.dayKey)
    .sort((a, b) => String(a.dayKey).localeCompare(String(b.dayKey)));
}

function mergeRowsById(existingRows, incomingRows) {
  const map = new Map();

  for (const row of existingRows || []) {
    const key = String(row?.id || "");
    if (key) map.set(key, row);
  }

  for (const row of incomingRows || []) {
    const key = String(row?.id || "");
    if (key) map.set(key, row);
  }

  return [...map.values()].sort((a, b) => {
    const ak = Number(a?.kickoff_ms || 0);
    const bk = Number(b?.kickoff_ms || 0);
    if (ak !== bk) return ak - bk;
    return String(a?.id || "").localeCompare(String(b?.id || ""));
  });
}

export async function appendFinalizedDayToHistory(dayKey) {
  const rows = getFixturesByDay(dayKey);
  const terminalRows = rows.filter(isTerminalRow);

  console.log("[history] day:", dayKey);
  console.log("[history] rows count:", rows.length);
  console.log("[history] terminal rows count:", terminalRows.length);

  if (terminalRows.length) {
    console.log("[history] terminal sample row:", {
      matchId: terminalRows[0]?.matchId,
      status: terminalRows[0]?.status,
      rawStatus: terminalRows[0]?.rawStatus,
      operationalState: terminalRows[0]?.operationalState,
      finalized: terminalRows[0]?.finalized,
      scoreHome: terminalRows[0]?.scoreHome,
      scoreAway: terminalRows[0]?.scoreAway
    });
  }

  if (!terminalRows.length) {
    return {
      ok: false,
      reason: "no_terminal_rows",
      dayKey
    };
  }

  const season = resolveSeasonFromDay(dayKey);

  await fs.mkdir(HISTORY_DIR, { recursive: true });

  const historyPath = resolveDataPath("history", `${season}.json`);
  const existingHistory = await readJsonSafe(historyPath, { season, days: [] });
  const days = normalizeHistoryDays(existingHistory);

  const normalizedRows = terminalRows.map(r => normalizeHistoryRow(r, season, dayKey));

  console.log("[history] normalized terminal rows:", normalizedRows.length);

  if (normalizedRows.length) {
    console.log("[history] normalized terminal sample:", {
      id: normalizedRows[0].id,
      status: normalizedRows[0].status,
      scoreHome: normalizedRows[0].scoreHome,
      scoreAway: normalizedRows[0].scoreAway,
      outcome: normalizedRows[0].outcome
    });
  }

  const existingIndex = days.findIndex(d => d?.dayKey === dayKey);
  const existingDayRows = existingIndex >= 0 ? (days[existingIndex]?.rows || []) : [];
  const mergedRows = mergeRowsById(existingDayRows, normalizedRows);

  const dayPayload = {
    dayKey,
    matchCount: mergedRows.length,
    rows: mergedRows,
    updatedAt: Date.now()
  };

  if (existingIndex >= 0) {
    days[existingIndex] = dayPayload;
  } else {
    days.push(dayPayload);
  }

  days.sort((a, b) => String(a.dayKey).localeCompare(String(b.dayKey)));

  const output = {
    season,
    days
  };

  await fs.writeFile(historyPath, JSON.stringify(output, null, 2), "utf8");

  return {
    ok: true,
    season,
    dayKey,
    rowsRead: rows.length,
    terminalRows: terminalRows.length,
    rowsWritten: normalizedRows.length,
    mergedRows: mergedRows.length,
    historyPath
  };
}