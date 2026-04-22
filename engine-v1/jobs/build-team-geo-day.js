import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { readTeamGeoRecord } from "../storage/team-geo-db.js";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
}

function normalizeText(value) {
  return String(value || "").trim();
}

function rootDir() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function resolveDataPath(...parts) {
  return path.join(rootDir(), "data", ...parts);
}

function fixturesFilePath() {
  return resolveDataPath("fixtures.json");
}

function reportFilePath(dayKey) {
  return resolveDataPath("team-geo", "_reports", `${dayKey}.json`);
}

function importTemplateFilePath(dayKey) {
  return resolveDataPath("team-geo", "_imports", `${dayKey}.template.json`);
}

function getFixtureRows() {
  const file = fixturesFilePath();
  if (!fs.existsSync(file)) {
    return [];
  }

  const raw = readJson(file);

  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.fixtures)) return raw.fixtures;
  if (Array.isArray(raw?.rows)) return raw.rows;
  if (Array.isArray(raw?.matches)) return raw.matches;

  return [];
}

function pickDayRows(rows, dayKey) {
  return rows.filter(row => normalizeText(row?.dayKey) === normalizeText(dayKey));
}

function collectTeams(rows) {
  const out = [];
  const seen = new Set();

  for (const row of rows) {
    const entries = [
      {
        teamName: normalizeText(row?.homeTeam || row?.home_team),
        side: "home",
        leagueSlug: normalizeText(row?.leagueSlug || row?.league_slug) || null,
        matchId: row?.matchId || row?.id || null
      },
      {
        teamName: normalizeText(row?.awayTeam || row?.away_team),
        side: "away",
        leagueSlug: normalizeText(row?.leagueSlug || row?.league_slug) || null,
        matchId: row?.matchId || row?.id || null
      }
    ];

    for (const item of entries) {
      if (!item.teamName) continue;

      const key = item.teamName.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
  }

  return out;
}

function resolveExistingGeo(teamName) {
  const team = normalizeText(teamName);
  const record = readTeamGeoRecord(team);

  if (!record) {
    return {
      exists: false,
      record: null
    };
  }

  const lat = Number(record?.lat);
  const lon = Number(record?.lon);
  const hasCoordinates = Number.isFinite(lat) && Number.isFinite(lon);

  return {
    exists: hasCoordinates,
    record: {
      team: record?.team || team,
      lat: Number.isFinite(lat) ? lat : null,
      lon: Number.isFinite(lon) ? lon : null,
      stadium: normalizeText(record?.stadium) || null,
      city: normalizeText(record?.city) || null,
      country: normalizeText(record?.country) || null,
      source: normalizeText(record?.source) || "local-team-geo",
      updatedAt: record?.updatedAt || null,
      hasCoordinates
    }
  };
}

export async function buildTeamGeoDay(dayKey) {
  const rows = pickDayRows(getFixtureRows(), dayKey);
  const teams = collectTeams(rows);

  const existing = [];
  const missing = [];

  for (const item of teams) {
    const resolved = resolveExistingGeo(item.teamName);

    const entry = {
      teamName: item.teamName,
      side: item.side,
      leagueSlug: item.leagueSlug,
      matchId: item.matchId,
      geo: resolved.record
    };

    if (resolved.exists) {
      existing.push(entry);
    } else {
      missing.push(entry);
    }
  }

  const payload = {
    dayKey,
    generatedAt: new Date().toISOString(),
    totalMatches: rows.length,
    totalTeams: teams.length,
    existingCount: existing.length,
    missingCount: missing.length,
    coveragePct:
      teams.length > 0
        ? Number(((existing.length / teams.length) * 100).toFixed(2))
        : 0,
    existing,
    missing
  };

  const importTemplate = missing.map(item => ({
    team: item.teamName,
    leagueSlug: item.leagueSlug || null,
    stadium: "",
    city: "",
    country: "",
    lat: null,
    lon: null,
    source: "manual_batch"
  }));

  const file = reportFilePath(dayKey);
  const importFile = importTemplateFilePath(dayKey);

  writeJson(file, payload);
  writeJson(importFile, importTemplate);

  return {
    ok: true,
    dayKey,
    totalMatches: rows.length,
    totalTeams: teams.length,
    existingCount: existing.length,
    missingCount: missing.length,
    coveragePct: payload.coveragePct,
    file,
    importFile,
    existing,
    missing
  };
}

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const dayKey = process.argv[2];

  if (!dayKey) {
    console.error("[build-team-geo-day] cli:fatal missing dayKey");
    process.exit(1);
  }

  console.log("[build-team-geo-day] cli:start", { dayKey });

  buildTeamGeoDay(dayKey)
    .then(result => {
      console.log("[build-team-geo-day] cli:done", result);
    })
    .catch(err => {
      console.error("[build-team-geo-day] cli:fatal", err);
      process.exit(1);
    });
}