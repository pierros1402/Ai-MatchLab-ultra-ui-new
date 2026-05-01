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

function compactValue(value, depth = 0) {
  if (value == null) return value;

  if (depth >= 8) {
    return "[cache_depth_limit]";
  }

  if (typeof value === "string") {
    return value.length > 4000 ? `${value.slice(0, 4000)}...[cache_string_truncated]` : value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 80).map(item => compactValue(item, depth + 1));
  }

  if (typeof value === "object") {
    const out = {};

    for (const [key, child] of Object.entries(value)) {
      if (
        key === "remoteResults" ||
        key === "results" ||
        key === "raw" ||
        key === "html" ||
        key === "body" ||
        key === "content" ||
        key === "fullText" ||
        key === "allFixtures"
      ) {
        continue;
      }

      out[key] = compactValue(child, depth + 1);
    }

    return out;
  }

  return null;
}

function buildCachePayload(payload = {}) {
  return compactValue({
    competitionContext: payload?.competitionContext || null,
    referee: payload?.referee || null,
    teamNews: payload?.teamNews || null,
    lineups: payload?.lineups || null,
    sources: Array.isArray(payload?.sources) ? payload.sources : [],
    remoteStatus: payload?.remoteStatus || "unavailable"
  });
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
      version: "research-cache-v2-compact"
    },
    payload: buildCachePayload(payload)
  };

  writeJson(file, wrapped);
  return wrapped;
}