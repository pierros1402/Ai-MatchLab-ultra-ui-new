import fs from "fs";
import path from "path";
import { ensureDir, resolveDataPath } from "../storage/data-root.js";

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

function cacheFile(matchId) {
  return resolveDataPath("research-cache", `${matchId}.json`);
}

export function readResearchCache(matchId, { maxAgeMinutes = 180 } = {}) {
  const file = cacheFile(matchId);
  const cached = readJsonSafe(file, null);
  if (!cached) return null;

  const ts = Number(cached?.meta?.fetchedAtTs || 0);
  if (!Number.isFinite(ts) || ts <= 0) return null;

  const ageMs = Date.now() - ts;
  const maxAgeMs = maxAgeMinutes * 60 * 1000;

  if (ageMs > maxAgeMs) return null;

  return cached;
}

export function writeResearchCache(matchId, payload) {
  const file = cacheFile(matchId);

  const wrapped = {
    meta: {
      fetchedAt: new Date().toISOString(),
      fetchedAtTs: Date.now(),
      version: "research-cache-v1"
    },
    payload
  };

  writeJson(file, wrapped);
  return wrapped;
}