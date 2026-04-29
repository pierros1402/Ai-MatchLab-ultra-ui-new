import fs from "fs";
import path from "path";
import { ensureDir, resolveDataPath } from "./data-root.js";

function normalizeText(value) {
  return String(value || "").trim();
}

export function normalizePlayerUsageTeamKey(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

export function getPlayerUsagePath(teamNameOrKey) {
  const key = normalizePlayerUsageTeamKey(teamNameOrKey);
  if (!key) return null;
  return resolveDataPath("player-usage", `${key}.json`);
}

function normalizePlayerRow(row = {}) {
  const name = normalizeText(row?.name || row?.player || row?.displayName);
  if (!name) return null;

  return {
    name,
    starter: row?.starter === true,
    minutes: Number.isFinite(Number(row?.minutes)) ? Number(row.minutes) : null,
    position: normalizeText(row?.position) || null
  };
}

function normalizeMatchRow(row = {}) {
  const matchId = normalizeText(row?.matchId);
  const date = normalizeText(row?.date || row?.kickoffUtc);
  const opponent = normalizeText(row?.opponent);
  const side = normalizeText(row?.side).toLowerCase();

  const players = (Array.isArray(row?.players) ? row.players : [])
    .map(normalizePlayerRow)
    .filter(Boolean);

  if (!matchId && !date && !opponent && players.length === 0) return null;

  return {
    matchId: matchId || null,
    date: date || null,
    opponent: opponent || null,
    side: side === "away" ? "away" : "home",
    players
  };
}

export function normalizePlayerUsageRecord(input = {}) {
  const team = normalizeText(input?.team);
  const key = normalizePlayerUsageTeamKey(input?.key || team);

  if (!key) {
    throw new Error("normalizePlayerUsageRecord: missing team key");
  }

  const matches = (Array.isArray(input?.matches) ? input.matches : [])
    .map(normalizeMatchRow)
    .filter(Boolean);

  return {
    key,
    team: team || null,
    leagueSlug: normalizeText(input?.leagueSlug) || null,
    matches,
    source: normalizeText(input?.source) || "canonical-player-usage",
    confidence: Number.isFinite(Number(input?.confidence)) ? Number(input.confidence) : 0,
    updatedAt: normalizeText(input?.updatedAt) || new Date().toISOString(),
    meta: input?.meta && typeof input.meta === "object" ? input.meta : {}
  };
}

export function readPlayerUsageRecord(teamNameOrKey) {
  const file = getPlayerUsagePath(teamNameOrKey);
  if (!file) return null;

  const raw = readJsonSafe(file, null);
  if (!raw || typeof raw !== "object") return null;

  try {
    return normalizePlayerUsageRecord(raw);
  } catch {
    return null;
  }
}

export function writePlayerUsageRecord(record = {}) {
  const normalized = normalizePlayerUsageRecord(record);
  const file = getPlayerUsagePath(normalized.key);

  if (!file) {
    throw new Error("writePlayerUsageRecord: invalid path");
  }

  writeJson(file, normalized);

  return {
    ok: true,
    file,
    record: normalized
  };
}