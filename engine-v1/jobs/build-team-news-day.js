import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getFixturesByDay } from "../storage/json-db.js";
import { ensureDir, resolveDataPath } from "../storage/data-root.js";
import { readTeamNewsRecord } from "../storage/team-news-db.js";
import { resolveAliasCandidates } from "../storage/team-aliases-db.js";

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function normalizeText(value) {
  return String(value || "").trim();
}

function buildUniqueTeams(rows = []) {
  const seen = new Set();
  const out = [];

  for (const match of Array.isArray(rows) ? rows : []) {
    const leagueSlug = normalizeText(match?.leagueSlug) || null;
    const matchId = normalizeText(match?.matchId) || null;

    for (const side of ["homeTeam", "awayTeam"]) {
      const teamName = normalizeText(match?.[side]);
      if (!teamName) continue;

      const uniqueKey = `${leagueSlug || "no-league"}__${teamName.toLowerCase()}`;
      if (seen.has(uniqueKey)) continue;
      seen.add(uniqueKey);

      out.push({
        leagueSlug,
        teamName,
        matchId,
        side
      });
    }
  }

  return out;
}

function resolveExistingRecord(leagueSlug, teamName) {
  const candidates = resolveAliasCandidates(leagueSlug, teamName);
  const tried = [];

  for (const candidate of candidates) {
    tried.push(candidate);
    const record = readTeamNewsRecord(candidate);

    if (record) {
      const absencesCount = Array.isArray(record?.absences) ? record.absences.length : 0;
      const notesCount = Array.isArray(record?.notes) ? record.notes.length : 0;
      const hasEvidence = absencesCount > 0 || notesCount > 0;

      return {
        exists: hasEvidence,
        matchedOn: hasEvidence ? candidate : null,
        tried,
        record: {
          team: record?.team || null,
          source: record?.source || "local-team-news",
          updatedAt: record?.updatedAt || null,
          absencesCount,
          notesCount,
          hasEvidence
        }
      };
    }
  }

  return {
    exists: false,
    matchedOn: null,
    tried,
    record: null
  };
}

function reportFilePath(dayKey) {
  return resolveDataPath("team-news", "_reports", `${dayKey}.json`);
}

function importTemplateFilePath(dayKey) {
  return resolveDataPath("team-news", "_imports", `${dayKey}.template.json`);
}

export async function buildTeamNewsDay(dayKey) {
  const rows = getFixturesByDay(dayKey) || [];

  if (!rows.length) {
    return {
      ok: false,
      dayKey,
      reason: "no_rows",
      totalMatches: 0,
      totalTeams: 0,
      existingCount: 0,
      missingCount: 0,
      file: null,
      existing: [],
      missing: []
    };
  }

  const teams = buildUniqueTeams(rows);

  const existing = [];
  const missing = [];

  for (const item of teams) {
    const resolved = resolveExistingRecord(item.leagueSlug, item.teamName);

    const row = {
      leagueSlug: item.leagueSlug,
      teamName: item.teamName,
      matchId: item.matchId,
      side: item.side,
      exists: resolved.exists,
      matchedOn: resolved.matchedOn,
      tried: resolved.tried
    };

    if (resolved.exists) {
      existing.push({
        ...row,
        record: resolved.record
      });
    } else {
      missing.push(row);
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
    absences: [],
    notes: [],
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

  console.log("[build-team-news-day] cli:start", {
    argv: process.argv.slice(2),
    dayKey
  });

  if (!dayKey) {
    console.error("[build-team-news-day] missing dayKey");
    process.exit(1);
  }

  buildTeamNewsDay(dayKey)
    .then(result => {
      console.log("[build-team-news-day] cli:done", result);
    })
    .catch(err => {
      console.error("[build-team-news-day] cli:fatal", err);
      process.exit(1);
    });
}