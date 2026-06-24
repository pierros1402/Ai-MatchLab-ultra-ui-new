/**
 * bootstrap-h2h-from-history.js
 *
 * One-time (and re-runnable) bootstrap: mines data/history/{season}.json and
 * populates data/h2h/ with all team-pair H2H meetings for each season found.
 * Idempotent — existing entries are deduped by matchId.
 *
 * Usage: node engine-v1/jobs/bootstrap-h2h-from-history.js
 */

import fs from "fs";
import path from "path";
import { pathToFileURL } from "node:url";
import { resolveDataPath } from "../storage/data-root.js";
import { recordH2H } from "../storage/h2h-memory-db.js";

function log(...a) { console.log("[bootstrap-h2h]", ...a); }

export async function bootstrapH2HFromHistory() {
  const historyDir = resolveDataPath("history");
  let files = [];
  try { files = fs.readdirSync(historyDir).filter(f => f.endsWith(".json") && !f.endsWith(".report.json")); }
  catch { log("no history dir found"); return { ok: false }; }

  const stats = { seasons: 0, matches: 0, stored: 0 };

  for (const file of files.sort()) {
    const season = file.replace(".json", "");
    log(`processing ${season}…`);
    let data;
    try { data = JSON.parse(fs.readFileSync(path.join(historyDir, file), "utf8")); }
    catch (e) { log(`skip ${file}:`, e.message); continue; }

    const days = Array.isArray(data.days) ? data.days : [];
    let seasonMatches = 0, seasonStored = 0;

    for (const day of days) {
      for (const m of (day.rows || [])) {
        if (m.scoreHome == null || m.scoreAway == null) continue;
        if (!m.homeTeam || !m.awayTeam) continue;
        seasonMatches++;
        const stored = recordH2H({
          matchId:    String(m.id || m.matchId || `${season}_${m.dayKey}_${m.homeTeam}`),
          homeTeam:   m.homeTeam,
          awayTeam:   m.awayTeam,
          scoreHome:  m.scoreHome,
          scoreAway:  m.scoreAway,
          date:       m.dayKey || (m.kickoff ? m.kickoff.slice(0, 10) : null),
          competition: m.leagueName || null,
          leagueSlug:  m.leagueSlug || null
        });
        if (stored) seasonStored++;
      }
    }

    log(`${season}: ${seasonMatches} matches → ${seasonStored} new H2H pairs/entries`);
    stats.seasons++;
    stats.matches += seasonMatches;
    stats.stored += seasonStored;
  }

  log("done", stats);
  return { ok: true, ...stats };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  bootstrapH2HFromHistory()
    .then(r => console.log(JSON.stringify(r, null, 2)))
    .catch(err => { console.error("fatal", String(err?.message || err)); process.exitCode = 1; });
}
