import fs from "fs";
import path from "path";
import { resolveDataPath } from "../../storage/data-root.js";
import { normalizePlayerUsageTeamKey } from "../../storage/player-usage-db.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function normalizePlayer(row = {}) {
  const name = normalizeText(row?.name || row?.player || row?.displayName);
  if (!name) return null;

  return {
    name,
    starter: row?.starter === true,
    minutes: Number.isFinite(Number(row?.minutes)) ? Number(row.minutes) : null,
    position: normalizeText(row?.position) || null
  };
}

function normalizeMatch(row = {}) {
  const players = (Array.isArray(row?.players) ? row.players : [])
    .map(normalizePlayer)
    .filter(Boolean);

  return {
    matchId: normalizeText(row?.matchId) || null,
    date: normalizeText(row?.date || row?.kickoffUtc) || null,
    opponent: normalizeText(row?.opponent) || null,
    side: normalizeText(row?.side).toLowerCase() === "away" ? "away" : "home",
    players
  };
}

function normalizeProviderData(input = {}, fallback = {}) {
  const matches = (Array.isArray(input?.matches) ? input.matches : [])
    .map(normalizeMatch)
    .filter(match => match.players.length > 0);

  return {
    team: normalizeText(input?.team || fallback.team),
    leagueSlug: normalizeText(input?.leagueSlug || fallback.leagueSlug) || null,
    matches,
    source: normalizeText(input?.source) || "player-usage-research-input",
    confidence: Number.isFinite(Number(input?.confidence)) ? Number(input.confidence) : 0.35,
    meta: input?.meta && typeof input.meta === "object" ? input.meta : {}
  };
}

function findResearchInputFiles({ teamKey, dayKey }) {
  const files = [];

  if (dayKey) {
    files.push(
      resolveDataPath("player-usage", "_research-results", dayKey, `${teamKey}.json`)
    );
  }

  files.push(
    resolveDataPath("player-usage", "_research-results", `${teamKey}.json`)
  );

  return files;
}

export async function runPlayerUsageProvider(input = {}) {
  const team = normalizeText(input.team);
  const leagueSlug = normalizeText(input.leagueSlug);
  const dayKey = normalizeText(input.dayKey);
  const teamKey = normalizePlayerUsageTeamKey(input.key || team);

  if (!team || !teamKey) {
    return {
      status: "unavailable",
      reason: "missing_team",
      confidence: 0,
      data: null
    };
  }

  const files = findResearchInputFiles({ teamKey, dayKey });

  for (const file of files) {
    const raw = readJsonSafe(file, null);
    if (!raw) continue;

    const normalized = normalizeProviderData(raw, {
      team,
      leagueSlug
    });

    if (normalized.matches.length <= 0) {
      continue;
    }

    return {
      status: "ok",
      reason: null,
      confidence: normalized.confidence,
      data: {
        key: teamKey,
        team: normalized.team || team,
        leagueSlug: normalized.leagueSlug || leagueSlug || null,
        matches: normalized.matches,
        source: normalized.source,
        confidence: normalized.confidence,
        updatedAt: new Date().toISOString(),
        meta: {
          ...normalized.meta,
          provider: "player-usage-provider",
          mode: "source_agnostic_research_input",
          inputFile: file
        }
      }
    };
  }

  return {
    status: "unavailable",
    reason: "missing_player_usage_research_input",
    confidence: 0,
    data: {
      key: teamKey,
      team,
      leagueSlug: leagueSlug || null,
      matches: [],
      source: "player-usage-provider",
      confidence: 0,
      meta: {
        provider: "player-usage-provider",
        mode: "source_agnostic_research_input",
        searchedFiles: files.map(file => path.relative(resolveDataPath(), file))
      }
    }
  };
}