/**
 * canonical-match-registry.js
 *
 * Bidirectional map: providerKey ↔ canonicalId, per day.
 *
 * Stored at: data/canonical-registry/{dayKey}.json
 *
 * Structure:
 * {
 *   "cid_bra2_fortaleza_sport_20260629": {
 *     "canonicalId": "cid_bra2_fortaleza_sport_20260629",
 *     "leagueSlug": "bra.2",
 *     "homeTeam": "Fortaleza",
 *     "awayTeam": "Sport",
 *     "kickoffUtc": "2026-06-28T21:30Z",
 *     "dayKey": "2026-06-29",
 *     "providers": {
 *       "espn": "401873971",
 *       "flashscore": "abc123"
 *     },
 *     "firstSeenAt": "2026-06-28T23:34:29Z",
 *     "updatedAt": "2026-06-29T06:00:00Z"
 *   },
 *   ...
 * }
 *
 * The registry is the single place that knows "ESPN 401873971 = Flashscore abc123 = cid_bra2_..."
 * Every other layer (details, odds, value) keys on canonicalId only.
 */

import fs from "fs";
import path from "path";
import { resolveDataPath, ensureDir } from "./data-root.js";

function registryPath(dayKey) {
  return resolveDataPath("canonical-registry", `${dayKey}.json`);
}

function readRegistry(dayKey) {
  const file = registryPath(dayKey);
  try {
    if (!fs.existsSync(file)) return {};
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return {};
  }
}

function writeRegistry(dayKey, data) {
  const dir = resolveDataPath("canonical-registry");
  ensureDir(dir);
  fs.writeFileSync(registryPath(dayKey), JSON.stringify(data, null, 2), "utf8");
}

/**
 * Register a match in the registry.
 * Safe to call multiple times — merges provider entries, never overwrites existing canonicalId.
 *
 * @param {string} dayKey
 * @param {object} opts
 * @param {string} opts.canonicalId
 * @param {string} opts.leagueSlug
 * @param {string} opts.homeTeam
 * @param {string} opts.awayTeam
 * @param {string} opts.kickoffUtc
 * @param {string} opts.source       provider name ("espn", "flashscore", …)
 * @param {string} opts.sourceId     provider-specific match ID
 * @returns {object} the registry entry
 */
export function registerMatch(dayKey, { canonicalId, leagueSlug, homeTeam, awayTeam, kickoffUtc, source, sourceId }) {
  if (!canonicalId || !dayKey) return null;

  const registry = readRegistry(dayKey);
  const now = new Date().toISOString();

  const existing = registry[canonicalId];
  if (existing) {
    // Merge provider entry only
    if (source && sourceId) {
      existing.providers = existing.providers || {};
      existing.providers[source] = String(sourceId);
    }
    existing.updatedAt = now;
    registry[canonicalId] = existing;
  } else {
    registry[canonicalId] = {
      canonicalId,
      leagueSlug,
      homeTeam,
      awayTeam,
      kickoffUtc,
      dayKey,
      providers: source && sourceId ? { [source]: String(sourceId) } : {},
      firstSeenAt: now,
      updatedAt: now
    };
  }

  writeRegistry(dayKey, registry);
  return registry[canonicalId];
}

/**
 * Look up canonical ID by provider source + sourceId.
 * Returns null if not found.
 */
export function lookupBySourceId(dayKey, source, sourceId) {
  const registry = readRegistry(dayKey);
  const sid = String(sourceId || "");
  for (const entry of Object.values(registry)) {
    if (entry.providers?.[source] === sid) return entry.canonicalId;
  }
  return null;
}

/**
 * Look up a registry entry by canonicalId.
 */
export function lookupById(dayKey, canonicalId) {
  const registry = readRegistry(dayKey);
  return registry[canonicalId] || null;
}

/**
 * Return all entries for a day.
 */
export function getAllForDay(dayKey) {
  return Object.values(readRegistry(dayKey));
}

/**
 * Return all canonical IDs that have a given provider registered.
 */
export function getByProvider(dayKey, source) {
  return Object.values(readRegistry(dayKey))
    .filter(e => e.providers?.[source] != null);
}
