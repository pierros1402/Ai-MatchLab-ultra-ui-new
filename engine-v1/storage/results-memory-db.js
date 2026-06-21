/**
 * results-memory-db.js
 *
 * Append-only recent-results memory per league, the basis for team FORM (the
 * value engine's heaviest input). The Flashscore feed only exposes ~7-10 days, so
 * we ACCUMULATE daily — over a few weeks every team builds a full recent-form
 * window with no gaps, automatically.
 *
 * One file per league: data/league-memory/results/{slug}.json
 *   { slug, teams: { teamName: [ {matchId,date,opp,ha,gf,ga,res} ] }, updatedAt }
 */

import fs from "fs";
import { resolveDataPath, ensureDir } from "./data-root.js";

const DIR = resolveDataPath("league-memory", "results");
const PER_TEAM_CAP = 15;
const MAX_AGE_DAYS = 70;

function fileFor(slug) {
  return resolveDataPath("league-memory", "results", `${slug}.json`);
}

export function readResults(slug) {
  try { return JSON.parse(fs.readFileSync(fileFor(slug), "utf8")); }
  catch { return { slug, teams: {} }; }
}

function pushResult(list, entry) {
  if (list.some(r => r.matchId === entry.matchId)) return list; // dedup
  const out = [...list, entry];
  const cutoff = Date.now() - MAX_AGE_DAYS * 86400000;
  return out
    .filter(r => !r.date || Date.parse(r.date) >= cutoff)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, PER_TEAM_CAP);
}

/**
 * Record one finished match for both teams. Returns true if anything new stored.
 * @param {{matchId,home,away,scoreHome,scoreAway,kickoffUtc}} m
 */
export function recordMatchResult(slug, m) {
  if (m.scoreHome == null || m.scoreAway == null) return false;

  ensureDir(DIR);
  const data = readResults(slug);
  data.teams = data.teams || {};

  const date = m.kickoffUtc || null;
  const homeRes = m.scoreHome > m.scoreAway ? "W" : m.scoreHome < m.scoreAway ? "L" : "D";
  const awayRes = homeRes === "W" ? "L" : homeRes === "L" ? "W" : "D";

  const before = JSON.stringify(data.teams[m.home] || []) + JSON.stringify(data.teams[m.away] || []);

  data.teams[m.home] = pushResult(data.teams[m.home] || [], {
    matchId: m.matchId, date, opp: m.away, ha: "H", gf: m.scoreHome, ga: m.scoreAway, res: homeRes
  });
  data.teams[m.away] = pushResult(data.teams[m.away] || [], {
    matchId: m.matchId, date, opp: m.home, ha: "A", gf: m.scoreAway, ga: m.scoreHome, res: awayRes
  });

  const changed = (JSON.stringify(data.teams[m.home]) + JSON.stringify(data.teams[m.away])) !== before;
  if (changed) {
    data.slug = slug;
    data.updatedAt = new Date().toISOString();
    fs.writeFileSync(fileFor(slug), JSON.stringify(data, null, 2), "utf8");
  }
  return changed;
}

export function getResultsSummary() {
  let leagues = 0, teams = 0, results = 0;
  try {
    for (const f of fs.readdirSync(DIR)) {
      if (!f.endsWith(".json")) continue;
      leagues++;
      const d = readResults(f.replace(/\.json$/, ""));
      for (const t of Object.values(d.teams || {})) { teams++; results += t.length; }
    }
  } catch { /* none yet */ }
  return { leagues, teams, results };
}
