/**
 * standings-history-db.js
 *
 * Multi-season standings HISTORY (proistoria), kept SEPARATELY from the live
 * standings-memory-db (which holds only the single current/last table per league
 * and overwrites on a newer season). Here every season is retained.
 *
 * One file per league: data/league-memory/standings-history/{slug}.json
 *   { slug, seasons: { "2024-25": { rows, source, confidence, rowCount, capturedAt } }, updatedAt }
 */

import fs from "fs";
import { resolveDataPath, ensureDir } from "./data-root.js";
import {
  overlayProductionEvidenceTeamRowsReadView,
} from "../core/production-evidence-identity-overlay.js";

// P0-C P5 READ BOUNDARY: multi-season standings evidence team-identity views.

const DIR = resolveDataPath("league-memory", "standings-history");

function fileFor(slug) {
  return resolveDataPath("league-memory", "standings-history", `${slug}.json`);
}

function readHistoryRaw(slug) {
  try {
    return JSON.parse(
      fs.readFileSync(fileFor(slug), "utf8"),
    );
  } catch {
    return { slug, seasons: {} };
  }
}

export function readHistory(slug) {
  const raw = readHistoryRaw(slug);
  const seasons = {};

  for (const [season, value] of Object.entries(
    raw?.seasons || {},
  )) {
    seasons[season] = {
      ...value,
      rows:
        overlayProductionEvidenceTeamRowsReadView(
          value?.rows,
          { leagueSlug: slug },
        ),
    };
  }

  return {
    ...raw,
    seasons,
  };
}

export function hasSeasonHistory(slug, season) {
  const h = readHistory(slug);
  const s = h.seasons && h.seasons[season];
  return !!(s && Array.isArray(s.rows) && s.rows.length > 0);
}

/**
 * Store one accepted season table. Returns true if written.
 * @param {object} research result from researchStandings (status/rows/season/...)
 */
export function recordSeasonHistory(slug, season, research) {
  if (research?.status !== "accepted" || !Array.isArray(research.rows) || !research.rows.length) {
    return false;
  }
  ensureDir(DIR);
  const h = readHistoryRaw(slug);
  h.seasons = h.seasons || {};
  h.seasons[season] = {
    rows: research.rows,
    rowCount: research.rows.length,
    source: research.url || research.source || null,
    confidence: research.confidence ?? null,
    capturedAt: new Date().toISOString()
  };
  h.slug = slug;
  h.updatedAt = new Date().toISOString();
  fs.writeFileSync(fileFor(slug), JSON.stringify(h, null, 2), "utf8");
  return true;
}

export function getHistorySummary() {
  let leagues = 0, seasons = 0;
  try {
    for (const f of fs.readdirSync(DIR)) {
      if (!f.endsWith(".json")) continue;
      leagues++;
      const h = readHistory(f.replace(/\.json$/, ""));
      seasons += Object.keys(h.seasons || {}).length;
    }
  } catch { /* none yet */ }
  return { leagues, seasons };
}
