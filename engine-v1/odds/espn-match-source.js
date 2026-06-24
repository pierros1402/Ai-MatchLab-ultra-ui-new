/**
 * espn-match-source.js
 *
 * ESPN as a SECONDARY data source for the gap-filling cascade: when our primary
 * (Flashscore) is missing a field (lineups / referee / score), we look it up here.
 * ESPN is reachable from anywhere (residential + datacenter) and rich. Our league
 * slugs are already ESPN-style (eng.1, bra.1, ...), so no code mapping is needed.
 *
 *   scoreboard: /apis/site/v2/sports/soccer/{slug}/scoreboard?dates=YYYYMMDD
 *   summary:    /apis/site/v2/sports/soccer/{slug}/summary?event={id}
 */

import { normalizeTeamKey as norm } from "../core/normalize.js";
const BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";
const HEADERS = { "user-agent": "Mozilla/5.0 Chrome/120", "accept": "application/json" };
function teamMatch(a, b) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

async function getJson(url) {
  try {
    const r = await fetch(url, { headers: HEADERS });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

/** Find the ESPN event id for a fixture (league slug + date + teams). */
async function findEspnEvent(slug, home, away, dateYmd) {
  const dates = String(dateYmd || "").replace(/-/g, "");
  const sb = await getJson(`${BASE}/${slug}/scoreboard${dates ? `?dates=${dates}` : ""}`);
  for (const ev of (sb?.events || [])) {
    const c = ev.competitions?.[0];
    const comps = c?.competitors || [];
    const h = comps.find(x => x.homeAway === "home")?.team?.displayName;
    const a = comps.find(x => x.homeAway === "away")?.team?.displayName;
    if ((teamMatch(home, h) && teamMatch(away, a)) ||
        (teamMatch(home, a) && teamMatch(away, h))) {
      return { id: ev.id, competition: c, swapped: !teamMatch(home, h) };
    }
  }
  return null;
}

/**
 * Pull lineups / referee / score for a fixture from ESPN. Any field may be null.
 * @returns {{found, scoreHome, scoreAway, referee, lineups:{home:[],away:[]}}|null}
 */
export async function fetchEspnMatchData(slug, home, away, dateYmd) {
  const ev = await findEspnEvent(slug, home, away, dateYmd);
  if (!ev) return null;

  const sum = await getJson(`${BASE}/${slug}/summary?event=${ev.id}`);
  const out = { found: true, scoreHome: null, scoreAway: null, referee: null, lineups: { home: [], away: [] } };

  // Score
  const comps = ev.competition?.competitors || [];
  const sh = comps.find(x => x.homeAway === "home")?.score;
  const sa = comps.find(x => x.homeAway === "away")?.score;
  if (sh != null) out.scoreHome = Number(sh);
  if (sa != null) out.scoreAway = Number(sa);

  // Referee
  const ref = (sum?.gameInfo?.officials || []).find(o => /referee/i.test(o.position?.displayName || o.position?.name || ""));
  if (ref) out.referee = ref.displayName || ref.fullName || null;

  // Lineups (rosters): starters per side
  for (const roster of (sum?.rosters || [])) {
    const side = roster.homeAway === "away" ? "away" : "home";
    const realSide = ev.swapped ? (side === "home" ? "away" : "home") : side;
    for (const p of (roster.roster || [])) {
      if (p.starter === false) continue;
      const name = p.athlete?.displayName || p.athlete?.shortName;
      if (name) out.lineups[realSide].push({ id: String(p.athlete?.id || name), name });
    }
  }
  return out;
}
