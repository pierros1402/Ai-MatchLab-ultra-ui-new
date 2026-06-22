/**
 * discipline-memory-db.js
 *
 * Append-only per-team DISCIPLINE memory (cards / fouls / penalties), accumulated
 * daily from finished matches (Flashscore detail feeds). Mirrors results-memory-db:
 * the feed only spans ~7-10 days, so we accumulate to build a full window.
 *
 * One file per league: data/league-memory/discipline/{slug}.json
 *   { slug, teams: { teamName: [ {matchId,date,opp,ha,yellow,red,fouls,penFor,penAgainst} ] }, updatedAt }
 *
 * referee is intentionally NOT stored here (Flashscore feeds don't expose it);
 * a per-referee layer is added later if a referee-name source is found.
 */

import fs from "fs";
import { resolveDataPath, ensureDir } from "./data-root.js";

const DIR = resolveDataPath("league-memory", "discipline");
const PER_TEAM_CAP = 20;
const MAX_AGE_DAYS = 120;

function fileFor(slug) {
  return resolveDataPath("league-memory", "discipline", `${slug}.json`);
}

export function readDiscipline(slug) {
  try { return JSON.parse(fs.readFileSync(fileFor(slug), "utf8")); }
  catch { return { slug, teams: {} }; }
}

function pushEntry(list, entry) {
  if (list.some(r => r.matchId === entry.matchId)) return list; // dedup
  const cutoff = Date.now() - MAX_AGE_DAYS * 86400000;
  return [...list, entry]
    .filter(r => !r.date || Date.parse(r.date) >= cutoff)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, PER_TEAM_CAP);
}

/**
 * Record one finished match's discipline for both teams.
 * @param {{matchId,home,away,kickoffUtc}} m
 * @param {{yellow,red,fouls,penalties}} d  output of fetchMatchDiscipline
 * @returns {boolean} whether anything new was stored
 */
export function recordMatchDiscipline(slug, m, d) {
  if (!d || !d.hasStats) return false;

  ensureDir(DIR);
  const data = readDiscipline(slug);
  data.teams = data.teams || {};
  const date = m.kickoffUtc || null;

  const before = JSON.stringify(data.teams[m.home] || []) + JSON.stringify(data.teams[m.away] || []);

  data.teams[m.home] = pushEntry(data.teams[m.home] || [], {
    matchId: d.matchId, date, opp: m.away, ha: "H",
    yellow: d.yellow.home, red: d.red.home, fouls: d.fouls.home,
    penFor: d.penalties.home, penAgainst: d.penalties.away
  });
  data.teams[m.away] = pushEntry(data.teams[m.away] || [], {
    matchId: d.matchId, date, opp: m.home, ha: "A",
    yellow: d.yellow.away, red: d.red.away, fouls: d.fouls.away,
    penFor: d.penalties.away, penAgainst: d.penalties.home
  });

  const changed = (JSON.stringify(data.teams[m.home]) + JSON.stringify(data.teams[m.away])) !== before;
  if (changed) {
    data.slug = slug;
    data.updatedAt = new Date().toISOString();
    fs.writeFileSync(fileFor(slug), JSON.stringify(data, null, 2), "utf8");
  }
  return changed;
}

/**
 * Average discipline for a team over its last `window` matches.
 * @returns {{sample, yellowPerGame, redPerGame, foulsPerGame, penForPerGame, penAgainstPerGame}}
 */
export function teamDisciplineRates(slug, teamName, window = 10) {
  const data = readDiscipline(slug);
  const list = (data.teams && data.teams[teamName]) ? data.teams[teamName].slice(0, window) : [];
  if (!list.length) return { sample: 0 };

  let y = 0, r = 0, f = 0, pf = 0, pa = 0, nF = 0;
  for (const e of list) {
    y += Number(e.yellow) || 0;
    r += Number(e.red) || 0;
    if (e.fouls != null) { f += Number(e.fouls) || 0; nF++; }
    pf += Number(e.penFor) || 0;
    pa += Number(e.penAgainst) || 0;
  }
  const n = list.length;
  return {
    sample: n,
    yellowPerGame: y / n,
    redPerGame: r / n,
    foulsPerGame: nF ? f / nF : null,
    penForPerGame: pf / n,
    penAgainstPerGame: pa / n
  };
}

export function getDisciplineSummary() {
  let leagues = 0, teams = 0, matches = 0;
  try {
    for (const fn of fs.readdirSync(DIR)) {
      if (!fn.endsWith(".json")) continue;
      leagues++;
      const d = readDiscipline(fn.replace(/\.json$/, ""));
      for (const t of Object.values(d.teams || {})) { teams++; matches += t.length; }
    }
  } catch { /* none yet */ }
  return { leagues, teams, matches };
}
