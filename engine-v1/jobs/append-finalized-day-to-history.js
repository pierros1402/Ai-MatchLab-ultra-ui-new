import fs from "fs/promises";
import { getFixturesByDay } from "../storage/json-db.js";
import { ensureDir, resolveDataPath } from "../storage/data-root.js";
import path from "path";

function readArchiveSeason(slug, season) {
  try {
    const filePath = resolveDataPath("history-archive", slug, `${season}.json`);
    const raw = JSON.parse(require("fs").readFileSync(filePath, "utf8"));
    return Array.isArray(raw?.matches) ? raw.matches : [];
  } catch {
    return [];
  }
}

const HISTORY_DIR = ensureDir(resolveDataPath("history"));

function resolveSeasonFromDay(dayKey) {
  const [year, month] = String(dayKey).split("-").map(Number);

  if (!year || !month) return "unknown-season";

  if (month >= 7) {
    return `${year}-${year + 1}`;
  }

  return `${year - 1}-${year}`;
}

async function readJsonSafe(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
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

export async function appendFinalizedDayToHistory(dayKey) {
  const rows = getFixturesByDay(dayKey);

  console.log("[history] day:", dayKey);
  console.log("[history] rows count:", rows.length);

  if (rows.length) {
    console.log("[history] sample row:", {
      matchId: rows[0]?.matchId,
      status: rows[0]?.status,
      scoreHome: rows[0]?.scoreHome,
      scoreAway: rows[0]?.scoreAway
    });
  }

  if (!rows.length) {
    return {
      ok: false,
      reason: "no_rows",
      dayKey
    };
  }

  const season = resolveSeasonFromDay(dayKey);

  await fs.mkdir(HISTORY_DIR, { recursive: true });

  const historyPath = resolveDataPath("history", `${season}.json`);
  const existingHistory = await readJsonSafe(historyPath, { season, days: [] });

  const days = normalizeHistoryDays(existingHistory);

  let normalizedRows = rows.map(r => normalizeHistoryRow(r, season, dayKey));

  // 🔽 fallback από archive αν δεν έχουμε αρκετά rows
  if (normalizedRows.length < 3) {
    console.log("[history] fallback to archive for", dayKey);

    const archiveRows = readArchiveSeason(
      rows[0]?.leagueSlug || "",
      season
    ).filter(r => r.dayKey === dayKey);

    if (archiveRows.length) {
      normalizedRows = archiveRows.map(r =>
        normalizeHistoryRow(r, season, dayKey)
      );
    }
  }

  console.log("[history] normalized rows:", normalizedRows.length);

  if (normalizedRows.length) {
    console.log("[history] normalized sample:", {
      id: normalizedRows[0].id,
      status: normalizedRows[0].status,
      scoreHome: normalizedRows[0].scoreHome,
      scoreAway: normalizedRows[0].scoreAway,
      outcome: normalizedRows[0].outcome
    });
  }

  const existingIndex = days.findIndex(d => d?.dayKey === dayKey);

  const dayPayload = {
    dayKey,
    matchCount: normalizedRows.length,
    rows: normalizedRows,
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
    rowsWritten: normalizedRows.length,
    historyPath
  };
}