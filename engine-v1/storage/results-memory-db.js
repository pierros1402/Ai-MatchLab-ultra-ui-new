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
import { normalizeTeamKey } from "../core/normalize.js";
import { sourceRank } from "./result-dedup.js";
import { canonicalTeamName } from "./team-aliases-db.js";

const DIR = resolveDataPath("league-memory", "results");
const PER_TEAM_CAP = 250;   // ~5 seasons of weekly league play per team
const MAX_AGE_DAYS = 1825;  // 5 years

function fileFor(slug) {
  return resolveDataPath("league-memory", "results", `${slug}.json`);
}

export function readResults(slug) {
  try { return JSON.parse(fs.readFileSync(fileFor(slug), "utf8")); }
  catch { return { slug, teams: {} }; }
}

function dayKeyOf(date) {
  const s = date ? String(date) : "";
  return s.length >= 10 ? s.slice(0, 10) : null;
}

// Resolve an incoming team name to the canonical key already used in this league —
// so the SAME club recorded under spelling variants from different feeds ("Åsane"
// vs "Asane", "Ranheim IL" vs "Ranheim") lands under ONE team key instead of
// splitting form across two. Tries, in order: exact key, diacritic/affix-normalized
// key (normalizeTeamKey), then the alias tables (canonicalTeamName). Falls back to
// the alias canonical spelling for a brand-new team, else the name as given.
function resolveTeamKey(teams, slug, name) {
  if (!name) return name;
  if (teams[name]) return name;

  const nk = normalizeTeamKey(name);
  if (nk) {
    for (const k of Object.keys(teams)) {
      if (normalizeTeamKey(k) === nk) return k;
    }
  }

  const canon = canonicalTeamName(slug, name);
  if (canon && canon !== name) {
    if (teams[canon]) return canon;
    const cnk = normalizeTeamKey(canon);
    for (const k of Object.keys(teams)) {
      if (normalizeTeamKey(k) === cnk) return k;
    }
    return canon; // new team — store under its canonical spelling
  }
  return name;
}

// A team plays at most one match per day, so an existing entry on the same day
// against the same (normalized) opponent IS the same fixture arriving from another
// feed. Collapse to one, keeping the most authoritative source id (native > espn >
// sofa). Otherwise append. Then age-cap, sort newest-first and length-cap.
function pushResult(list, entry) {
  const cutoff = Date.now() - MAX_AGE_DAYS * 86400000;
  const dk = dayKeyOf(entry.date);
  const oppKey = normalizeTeamKey(entry.opp);

  let out = list;
  const dupIdx = list.findIndex(r =>
    (r.matchId === entry.matchId) ||
    (dk && dayKeyOf(r.date) === dk && normalizeTeamKey(r.opp) === oppKey)
  );

  if (dupIdx >= 0) {
    // Replace only when the incoming record comes from a more authoritative source.
    if (sourceRank(entry.matchId) < sourceRank(list[dupIdx].matchId)) {
      out = list.map((r, i) => (i === dupIdx ? entry : r));
    }
  } else {
    out = [...list, entry];
  }

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

  // Collapse cross-source spelling variants onto the team key already in the ledger
  // so both feeds append to the same team (prevents the split-key double count).
  const homeKey = resolveTeamKey(data.teams, slug, m.home);
  const awayKey = resolveTeamKey(data.teams, slug, m.away);

  const date = m.kickoffUtc || null;
  const homeRes = m.scoreHome > m.scoreAway ? "W" : m.scoreHome < m.scoreAway ? "L" : "D";
  const awayRes = homeRes === "W" ? "L" : homeRes === "L" ? "W" : "D";

  const before = JSON.stringify(data.teams[homeKey] || []) + JSON.stringify(data.teams[awayKey] || []);

  data.teams[homeKey] = pushResult(data.teams[homeKey] || [], {
    matchId: m.matchId, date, opp: awayKey, ha: "H", gf: m.scoreHome, ga: m.scoreAway, res: homeRes
  });
  data.teams[awayKey] = pushResult(data.teams[awayKey] || [], {
    matchId: m.matchId, date, opp: homeKey, ha: "A", gf: m.scoreAway, ga: m.scoreHome, res: awayRes
  });

  const changed = (JSON.stringify(data.teams[homeKey]) + JSON.stringify(data.teams[awayKey])) !== before;
  if (changed) {
    data.slug = slug;
    data.updatedAt = new Date().toISOString();
    fs.writeFileSync(fileFor(slug), JSON.stringify(data, null, 2), "utf8");
  }
  return changed;
}

/**
 * Recent-form scoring rates for a team from accumulated results.
 * @returns {{sample, gfRate, gaRate, ppg}} averages over the last `window` games.
 */
export function teamFormRates(slug, teamName, window = 6) {
  const data = readResults(slug);
  const list = (data.teams && data.teams[teamName]) ? data.teams[teamName].slice(0, window) : [];
  if (!list.length) return { sample: 0, gfRate: null, gaRate: null, ppg: null };

  let gf = 0, ga = 0, pts = 0;
  for (const r of list) {
    gf += Number(r.gf) || 0;
    ga += Number(r.ga) || 0;
    pts += r.res === "W" ? 3 : r.res === "D" ? 1 : 0;
  }
  const n = list.length;
  return {
    sample: n,
    gfRate: gf / n,
    gaRate: ga / n,
    ppg: pts / n
  };
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
