/**
 * flashscore-lineups.js
 *
 * Starting lineups per match from the Flashscore lineup feed (df_li). The basis
 * for player-usage: accumulated over matches it yields each team's regular starters
 * (starter frequency) and, for an upcoming game, likely absences (a usual starter
 * missing from the latest XI).
 *
 *   df_li_1_{id}_en_1 — LB=section ("Starting Lineups"/"Substitutes"),
 *   LC=team (1 home / 2 away), LP=player id, LI/LN=name, LD=formation,
 *   LK=role (1 starter / 2 sub).
 */

const HOST = "https://2.flashscore.ninja/2/x/feed/";
const HEADERS = {
  "x-fsign": "SW9D1eZo",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  "referer": "https://www.flashscore.com/"
};

function parseLineups(text) {
  const out = {
    home: { starters: [], formation: null },
    away: { starters: [], formation: null }
  };
  let section = null;
  let team = null;

  for (const rec of String(text || "").split("~")) {
    const f = {};
    for (const kv of rec.split("¬")) {
      const i = kv.indexOf("÷");
      if (i > 0) f[kv.slice(0, i)] = kv.slice(i + 1);
    }
    if (f.LB != null) section = f.LB;
    if (f.LC != null) team = f.LC === "1" ? "home" : f.LC === "2" ? "away" : team;
    if (f.LD && team) out[team].formation = f.LD;

    // A player row: id + name. Starters only ("Starting Lineups" section / LK=1).
    if (f.LP && (f.LI || f.LN) && team) {
      if (section && /substitut/i.test(section)) continue;
      if (f.LK && f.LK !== "1") continue;
      out[team].starters.push({ id: f.LP, name: (f.LI || f.LN).trim() });
    }
  }
  return out;
}

/** Starting lineups for a match, or null if not published. */
export async function fetchMatchLineups(matchId) {
  const id = String(matchId).replace(/^fs_/, "");
  try {
    const r = await fetch(`${HOST}df_li_1_${id}_en_1`, { headers: HEADERS });
    if (!r.ok) return null;
    const text = await r.text();
    if (!text || text.length < 80) return null;
    const lu = parseLineups(text);
    if (!lu.home.starters.length && !lu.away.starters.length) return null;
    return { matchId: id, ...lu };
  } catch { return null; }
}
