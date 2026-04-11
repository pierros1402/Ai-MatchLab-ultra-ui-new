// ============================================================
// COLLECT STANDINGS FOR DAY
// Writes standings artifacts for active leagues of a day
// Shape must match core/competition-context.js expectations:
// data/standings/<leagueSlug>.json with top-level { table: [...] }
// ============================================================

import fs from "fs";
import path from "path";
import { fetchLeagueStandings } from "../adapters/standings-source.js";

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function resolveLeagueSlug(leagueEntry) {
  if (typeof leagueEntry === "string") return leagueEntry;

  if (leagueEntry && typeof leagueEntry === "object") {
    return leagueEntry.slug || null;
  }

  return null;
}

export async function collectStandingsForDay(dayKey, leagues = []) {
  const outDir = path.resolve("./data/standings");
  ensureDir(outDir);

  const results = [];

  for (const leagueEntry of leagues) {
    const slug = resolveLeagueSlug(leagueEntry);

    if (!slug) {
      results.push({
        league: null,
        ok: false,
        reason: "missing_slug"
      });
      continue;
    }

    try {
      const fetched = await fetchLeagueStandings(slug, dayKey);

      const standingsPayload = {
        league: slug,
        updatedAt: Date.now(),
        source: fetched?.source || "standings-source",
        mode: fetched?.mode || "unknown",
        table: Array.isArray(fetched?.standings?.table)
          ? fetched.standings.table
          : []
      };

      const filePath = path.join(outDir, `${slug}.json`);

      fs.writeFileSync(
        filePath,
        JSON.stringify(standingsPayload, null, 2),
        "utf8"
      );

      results.push({
        league: slug,
        ok: true,
        found: standingsPayload.table.length > 0,
        rowsCount: standingsPayload.table.length
      });
    } catch (err) {
      results.push({
        league: slug,
        ok: false,
        reason: err?.message || "standings_collection_failed"
      });
    }
  }

  return {
    ok: true,
    dayKey,
    leagues: results.length,
    collected: results.filter(x => x.ok).length,
    withData: results.filter(x => x.ok && x.found).length,
    results
  };
}