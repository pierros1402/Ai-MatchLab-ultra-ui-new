import fs from "fs";
import path from "path";
import { ensureDir, resolveDataPath } from "./data-root.js";

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

function normalizeText(value) {
  return String(value || "").trim();
}

function safeNum(value, fallback = null) {
  if (value == null) return fallback;
  const text = String(value).trim();
  if (!text) return fallback;
  const n = Number(text);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeTeamKey(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function getTeamGeoPath(teamNameOrKey) {
  const key = normalizeTeamKey(teamNameOrKey);
  if (!key) return null;
  return resolveDataPath("team-geo", `${key}.json`);
}

export function normalizeTeamGeoRecord(input = {}) {
  const team = normalizeText(input?.team);
  const key = normalizeTeamKey(input?.key || team);

  if (!key) {
    throw new Error("normalizeTeamGeoRecord: missing team key");
  }

  return {
    key,
    team: team || null,
    country: normalizeText(input?.country) || null,
    city: normalizeText(input?.city) || null,
    venue: normalizeText(input?.venue) || null,
    latitude: safeNum(input?.latitude, null),
    longitude: safeNum(input?.longitude, null),
    source: normalizeText(input?.source) || "local-team-geo",
    updatedAt: input?.updatedAt || new Date().toISOString()
  };
}

export function readTeamGeoRecord(teamNameOrKey) {
  const filePath = getTeamGeoPath(teamNameOrKey);
  if (!filePath) return null;

  const raw = readJsonSafe(filePath, null);
  if (!raw) return null;

  try {
    return normalizeTeamGeoRecord(raw);
  } catch {
    return null;
  }
}

export function writeTeamGeoRecord(record) {
  const normalized = normalizeTeamGeoRecord(record);
  const filePath = getTeamGeoPath(normalized.key);

  if (!filePath) {
    throw new Error("writeTeamGeoRecord: invalid team key");
  }

  writeJson(filePath, normalized);

  return {
    ok: true,
    filePath,
    record: normalized
  };
}