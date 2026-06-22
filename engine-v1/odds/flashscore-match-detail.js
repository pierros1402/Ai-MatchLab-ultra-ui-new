/**
 * flashscore-match-detail.js
 *
 * Per-match DISCIPLINE (cards / fouls / penalties) from the Flashscore detail
 * feeds. Foundation for the referee + discipline phase (see memory
 * flashscore-detail-feeds). Referee NAME is not exposed by these feeds, so it is
 * left null here and attributed later from another source when available.
 *
 *   df_st_1_{id}_en_1  = statistics (Yellow/Red cards, Fouls, ...), per section
 *                        (SE = "Match" | "1st Half" | "2nd Half"); we take "Match".
 *   df_sui_1_{id}_en_1 = incidents (IK = "Yellow Card"/"Red Card"/"Goal"...),
 *                        used to detect penalties (a Goal incident flagged penalty).
 */

const HOST = "https://2.flashscore.ninja/2/x/feed/";
const HEADERS = {
  "x-fsign": "SW9D1eZo",
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  "referer": "https://www.flashscore.com/"
};

function parseRecords(text) {
  return String(text || "").split("~").map(rec => {
    const f = {};
    for (const kv of rec.split("¬")) {
      const i = kv.indexOf("÷");
      if (i > 0) f[kv.slice(0, i)] = kv.slice(i + 1);
    }
    return f;
  });
}

async function fetchFeed(ep) {
  try {
    const r = await fetch(HOST + ep, { headers: HEADERS });
    if (!r.ok) return null;
    const t = await r.text();
    return t && t.length > 5 ? t : null;
  } catch { return null; }
}

const num = v => {
  const m = String(v ?? "").match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

/**
 * Discipline for one match. Returns null if the match has no full-stat coverage.
 * @returns {{matchId,yellow:{home,away},red:{home,away},fouls:{home,away},
 *            penalties:{home,away},xg:{home,away}|null,referee:null,hasStats}}
 */
export async function fetchMatchDiscipline(matchId) {
  const id = String(matchId).replace(/^fs_/, "");
  const stText = await fetchFeed(`df_st_1_${id}_en_1`);

  const out = {
    matchId: id,
    yellow: { home: null, away: null },
    red: { home: null, away: null },
    fouls: { home: null, away: null },
    penalties: { home: 0, away: 0 },
    xg: null,
    referee: null,          // not in feeds; filled later from another source
    hasStats: false
  };

  if (stText) {
    let section = null;
    for (const f of parseRecords(stText)) {
      if (f.SE != null) section = f.SE;           // "Match" | "1st Half" | "2nd Half"
      if (section !== "Match" || !f.SG) continue;
      const name = f.SG.toLowerCase();
      const h = num(f.SH), a = num(f.SI);
      if (name === "yellow cards") { out.yellow = { home: h, away: a }; out.hasStats = true; }
      else if (name === "red cards") { out.red = { home: h, away: a }; out.hasStats = true; }
      else if (name === "fouls") { out.fouls = { home: h, away: a }; out.hasStats = true; }
      else if (name.startsWith("expected goals")) { out.xg = { home: h, away: a }; }
    }
  }

  // Penalties: count penalty-flagged goal incidents per side from df_sui.
  const suText = await fetchFeed(`df_sui_1_${id}_en_1`);
  if (suText) {
    for (const f of parseRecords(suText)) {
      const isPen = /penalt/i.test(f.IK || "") || /penalt/i.test(f.IF || "") || /penalt/i.test(f.IM || "");
      if (!isPen) continue;
      // IA / side flag: 1 = home, 2 = away (Flashscore convention)
      if (f.IA === "1" || f.IN === "1") out.penalties.home++;
      else if (f.IA === "2" || f.IN === "2") out.penalties.away++;
    }
  }

  return out;
}
