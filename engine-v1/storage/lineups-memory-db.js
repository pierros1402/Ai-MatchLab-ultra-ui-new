/**
 * lineups-memory-db.js
 *
 * Append-only per-team STARTING-XI memory, accumulated daily from finished-match
 * lineups (Flashscore df_li). Over matches it yields each team's regular starters
 * (frequency) → expected XI + likely absences (a usual starter missing from the
 * latest XI). Mirrors results/discipline accumulation; kept SEPARATE from the
 * platform's gated player-usage subsystem.
 *
 * One file per league: data/league-memory/lineups/{slug}.json
 *   { slug, teams: { teamName: [ {matchId,date,starters:[{id,name}]} ] }, updatedAt }
 */

import fs from "fs";
import { resolveDataPath, ensureDir } from "./data-root.js";

const DIR = resolveDataPath("league-memory", "lineups");
const PER_TEAM_CAP = 15;
const MAX_AGE_DAYS = 120;

function fileFor(slug) { return resolveDataPath("league-memory", "lineups", `${slug}.json`); }

export function readLineups(slug) {
  try { return JSON.parse(fs.readFileSync(fileFor(slug), "utf8")); }
  catch { return { slug, teams: {} }; }
}

function pushEntry(list, entry) {
  if (list.some(r => r.matchId === entry.matchId)) return list;
  const cutoff = Date.now() - MAX_AGE_DAYS * 86400000;
  return [...list, entry]
    .filter(r => !r.date || Date.parse(r.date) >= cutoff)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, PER_TEAM_CAP);
}

/** Record one finished match's starting XIs for both teams. */
export function recordMatchLineups(slug, m, lineups) {
  const hs = lineups?.home?.starters || [];
  const as = lineups?.away?.starters || [];
  if (hs.length < 7 && as.length < 7) return false;     // not a real lineup

  ensureDir(DIR);
  const data = readLineups(slug);
  data.teams = data.teams || {};
  const date = m.kickoffUtc || null;
  const before = JSON.stringify(data.teams[m.home] || []) + JSON.stringify(data.teams[m.away] || []);

  if (hs.length >= 7) data.teams[m.home] = pushEntry(data.teams[m.home] || [], { matchId: m.matchId, date, starters: hs });
  if (as.length >= 7) data.teams[m.away] = pushEntry(data.teams[m.away] || [], { matchId: m.matchId, date, starters: as });

  const changed = (JSON.stringify(data.teams[m.home]) + JSON.stringify(data.teams[m.away])) !== before;
  if (changed) {
    data.slug = slug;
    data.updatedAt = new Date().toISOString();
    fs.writeFileSync(fileFor(slug), JSON.stringify(data, null, 2), "utf8");
  }
  return changed;
}

/**
 * Expected XI + core starters from a team's recent lineups.
 * @returns {{sample, expectedStarters:[{name,freq}], coreStarters:string[]}}
 */
export function teamPlayerUsage(slug, teamName, window = 8) {
  const data = readLineups(slug);
  const list = (data.teams && data.teams[teamName]) ? data.teams[teamName].slice(0, window) : [];
  if (!list.length) return { sample: 0, expectedStarters: [], coreStarters: [] };

  const counts = new Map();   // name → times started
  for (const e of list) for (const p of (e.starters || [])) {
    counts.set(p.name, (counts.get(p.name) || 0) + 1);
  }
  const n = list.length;
  const ranked = [...counts.entries()]
    .map(([name, c]) => ({ name, freq: Math.round((c / n) * 100) / 100 }))
    .sort((a, b) => b.freq - a.freq);

  return {
    sample: n,
    expectedStarters: ranked.slice(0, 11),
    coreStarters: ranked.filter(p => p.freq >= 0.6).map(p => p.name)
  };
}

export function getLineupsSummary() {
  let leagues = 0, teams = 0, matches = 0;
  try {
    for (const fn of fs.readdirSync(DIR)) {
      if (!fn.endsWith(".json")) continue;
      leagues++;
      const d = readLineups(fn.replace(/\.json$/, ""));
      for (const t of Object.values(d.teams || {})) { teams++; matches += t.length; }
    }
  } catch { /* none */ }
  return { leagues, teams, matches };
}
