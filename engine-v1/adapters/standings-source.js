// ============================================================
// STANDINGS SOURCE ADAPTER
// Reads standings from local non-ESPN source artifact
// ============================================================

import fs from "fs";
import { resolveDataPath } from "../storage/data-root.js";

const localPath = resolveDataPath("source2-standings.json");

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeStandingsRow(row, index = 0) {
  const goalsFor = toNumber(row?.goalsFor, toNumber(row?.gf, 0));
  const goalsAgainst = toNumber(row?.goalsAgainst, toNumber(row?.ga, 0));

  return {
    position: toNumber(row?.position, toNumber(row?.rank, index + 1)),
    rank: toNumber(row?.rank, toNumber(row?.position, index + 1)),

    teamId:
      row?.teamId != null
        ? String(row.teamId)
        : null,

    team:
      row?.team ||
      row?.teamName ||
      row?.name ||
      null,

    teamName:
      row?.teamName ||
      row?.team ||
      row?.name ||
      null,

    name:
      row?.name ||
      row?.teamName ||
      row?.team ||
      null,

    played: toNumber(row?.played, toNumber(row?.matchesPlayed, 0)),
    wins: toNumber(row?.wins, 0),
    draws: toNumber(row?.draws, 0),
    losses: toNumber(row?.losses, 0),

    goalsFor,
    goalsAgainst,
    goalDiff: toNumber(row?.goalDiff, goalsFor - goalsAgainst),

    points: toNumber(row?.points, 0)
  };
}

function extractLeaguePayload(data, slug) {
  if (!data || typeof data !== "object") return null;

  return (
    data?.leagues?.[slug] ||
    data?.[slug] ||
    null
  );
}

function normalizeLeagueStandings(slug, rawLeague) {
  const rows = safeArray(
    rawLeague?.table ||
    rawLeague?.standings ||
    rawLeague?.rows
  ).map((row, idx) => normalizeStandingsRow(row, idx));

  return {
    league: slug,
    updatedAt: Date.now(),
    table: rows
  };
}

export async function fetchLeagueStandings(slug, dayKey) {
  try {
    if (!fs.existsSync(localPath)) {
      return {
        ok: true,
        found: false,
        source: "standings-source",
        mode: "local",
        league: slug,
        dayKey,
        standings: {
          league: slug,
          updatedAt: Date.now(),
          table: []
        }
      };
    }

    const raw = fs.readFileSync(localPath, "utf8");
    const data = JSON.parse(raw);

    const rawLeague = extractLeaguePayload(data, slug);
    const standings = normalizeLeagueStandings(slug, rawLeague);

    return {
      ok: true,
      found: standings.table.length > 0,
      source: "standings-source",
      mode: "local",
      league: slug,
      dayKey,
      standings
    };
  } catch (e) {
    return {
      ok: false,
      found: false,
      source: "standings-source",
      mode: "local",
      league: slug,
      dayKey,
      error: e?.message || "standings_source_read_failed",
      standings: {
        league: slug,
        updatedAt: Date.now(),
        table: []
      }
    };
  }
}