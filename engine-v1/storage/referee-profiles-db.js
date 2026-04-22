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
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function normalizeRefereeKey(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function getRefereeProfilePath(nameOrKey) {
  const key = normalizeRefereeKey(nameOrKey);
  if (!key) return null;
  return resolveDataPath("referees", `${key}.json`);
}

export function normalizeRefereeProfile(input = {}) {
  const name = normalizeText(input?.name);
  const key = normalizeRefereeKey(input?.key || name);

  if (!key) {
    throw new Error("normalizeRefereeProfile: missing referee key");
  }

  const sampleSize = safeNum(input?.sampleSize, null);
  const avgCards = safeNum(input?.avgCards, null);
  const avgPenalties = safeNum(input?.avgPenalties, null);
  const avgFouls = safeNum(input?.avgFouls, null);

  const style = normalizeText(input?.style).toLowerCase() || "unknown";

  return {
    key,
    name: name || input?.displayName || null,
    role: normalizeText(input?.role || "referee").toLowerCase(),
    country: normalizeText(input?.country) || null,

    sampleSize,
    avgCards,
    avgPenalties,
    avgFouls,

    style,

    competitions: Array.isArray(input?.competitions)
      ? input.competitions.filter(Boolean)
      : [],

    seasons: Array.isArray(input?.seasons)
      ? input.seasons.filter(Boolean)
      : [],

    source: normalizeText(input?.source) || "local-referees",
    updatedAt: input?.updatedAt || new Date().toISOString()
  };
}

export function readRefereeProfile(nameOrKey) {
  const filePath = getRefereeProfilePath(nameOrKey);
  if (!filePath) return null;

  const raw = readJsonSafe(filePath, null);
  if (!raw) return null;

  try {
    return normalizeRefereeProfile(raw);
  } catch {
    return null;
  }
}

export function writeRefereeProfile(profile) {
  const normalized = normalizeRefereeProfile(profile);
  const filePath = getRefereeProfilePath(normalized.key);

  if (!filePath) {
    throw new Error("writeRefereeProfile: invalid referee key");
  }

  writeJson(filePath, normalized);

  return {
    ok: true,
    filePath,
    profile: normalized
  };
}