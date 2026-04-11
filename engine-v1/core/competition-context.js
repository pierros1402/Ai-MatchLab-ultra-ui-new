import fs from "fs";
import { resolveDataPath } from "../storage/data-root.js";

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function safeNum(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeTeamName(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(fc|cf|sc|afc|club|athletic|de|the|ac|as|fk|nk|sk|if|bk|ik|ff|sv|tsv)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function sameTeam(a, b) {
  const na = normalizeTeamName(a);
  const nb = normalizeTeamName(b);
  if (!na || !nb) return false;
  return na === nb || na.includes(nb) || nb.includes(na);
}

function normalizePosition(pos) {
  const n = safeNum(pos, null);
  return n && n > 0 ? n : null;
}

function classifyStake(position, totalTeams) {
  if (!position || !totalTeams) return "unknown";

  if (position <= 2) return "title";
  if (position <= Math.ceil(totalTeams * 0.25)) return "promotion";
  if (position >= totalTeams - 2) return "relegation";
  return "safe";
}

function stakePressure(stake) {
  switch (stake) {
    case "title":
      return 0.9;
    case "promotion":
      return 0.75;
    case "relegation":
      return 0.95;
    case "safe":
      return 0.3;
    default:
      return 0.2;
  }
}

function findTeamRow(table, teamName) {
  return table.find(row =>
    sameTeam(row?.team, teamName) ||
    sameTeam(row?.teamName, teamName) ||
    sameTeam(row?.name, teamName)
  );
}

export function buildCompetitionContext(match) {
  const standingsFile = resolveDataPath("standings", `${match?.leagueSlug}.json`);
  const standings = readJsonSafe(standingsFile, null);

  const standingsConfidence = Number(standings?.confidence || 0);
  const standingsTable = Array.isArray(standings?.table) ? standings.table : [];
  const MIN_STANDINGS_CONFIDENCE = 0.4;

  if (!standings || !standingsTable.length || standingsConfidence   < MIN_STANDINGS_CONFIDENCE) {
    return {
      ok: false,
      status: "empty",
      league: match?.leagueSlug || null,
      reason: !standings
        ? "no_standings_file"
        : !standingsTable.length
          ? "empty_table"
          : "low_confidence_table"
    };
  }

  const table = standingsTable;
  const totalTeams =
    Math.max(...table.map(t => Number(t.position) || 0)) || table.length;

  const homeRow = findTeamRow(table, match?.homeTeam);
  const awayRow = findTeamRow(table, match?.awayTeam);

  const homePos = normalizePosition(homeRow?.position ?? homeRow?.rank);
  const awayPos = normalizePosition(awayRow?.position ?? awayRow?.rank);

  const homeStake = classifyStake(homePos, totalTeams);
  const awayStake = classifyStake(awayPos, totalTeams);

  const homePressure = stakePressure(homeStake);
  const awayPressure = stakePressure(awayStake);

  let importance = "low";
  const maxPressure = Math.max(homePressure, awayPressure);

  if (maxPressure > 0.85) importance = "high";
  else if (maxPressure > 0.6) importance = "medium";

  const notes = [];

  if (homeStake === "relegation" || awayStake === "relegation") {
    notes.push("Relegation pressure present");
  }

  if (homeStake === "title" || awayStake === "title") {
    notes.push("Title race involvement");
  }

  return {
    key: "competition_context",
    status: "ready",
    data: {
      type: "league",
      phase: "regular",
      positions: {
        home: homePos,
        away: awayPos
      },
      stakes: {
        home: homeStake,
        away: awayStake
      },
      pressure: {
        home: homePressure,
        away: awayPressure
      },
      importance,
      notes
    },
    confidence: 0.75
  };
}