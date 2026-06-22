/**
 * transfermarkt-referee-source.js
 *
 * Per-referee discipline tendencies from Transfermarkt's per-competition referee
 * page (accessible — unlike fbref/sofascore/worldfootball which 403). Gives, for a
 * completed season, every referee's matches + yellow / second-yellow / red cards +
 * penalty kicks → cards-per-game and penalties-per-game (exactly "how easily a ref
 * gives cards/penalties"). See memory flashscore-detail-feeds for the discipline
 * side (Flashscore) this complements.
 *
 *   page: /{slug}/schiedsrichter/wettbewerb/{TM_CODE}/plus/?saison_id={YYYY}
 */

const HEADERS = {
  "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36",
  "accept": "text/html,application/xhtml+xml",
  "accept-language": "en-US,en;q=0.9"
};

// Our league slug → Transfermarkt competition CODE. The URL works with any slug as
// long as the code is right (code-only `/x/...`), so we only need the code. Codes
// span the leagues TM provides referee data for; the competition NAME is returned
// so a wrong mapping is visible (and prunable) rather than silently wrong.
export const TM_COMPETITIONS = {
  // England
  "eng.1": "GB1", "eng.2": "GB2", "eng.3": "GB3", "eng.4": "GB4",
  // Spain / Italy / Germany / France
  "esp.1": "ES1", "esp.2": "ES2",
  "ita.1": "IT1", "ita.2": "IT2",
  "ger.1": "L1", "ger.2": "L2", "ger.3": "L3",
  "fra.1": "FR1", "fra.2": "FR2",
  // Low countries / Iberia / Belgium
  "ned.1": "NL1", "ned.2": "NL2",
  "por.1": "PO1", "por.2": "PO2",
  "bel.1": "BE1", "bel.2": "BE2",
  // Turkey / Scotland / Greece
  "tur.1": "TR1", "tur.2": "TR2",
  "sco.1": "SC1", "sco.2": "SC2",
  "gre.1": "GR1", "gre.2": "GR2",
  // Eastern Europe
  "rus.1": "RU1", "rus.2": "RU2", "ukr.1": "UKR1",
  "pol.1": "PL1", "cze.1": "TS1", "cro.1": "KR1", "srb.1": "SER1",
  "rou.1": "RO1", "bul.1": "BU1", "hun.1": "UNG1",
  "svk.1": "SLO1", "svn.1": "SL1",
  // Alpine / Nordics
  "aut.1": "A1", "aut.2": "A2", "sui.1": "C1", "sui.2": "C2",
  "den.1": "DK1", "den.2": "DK2", "nor.1": "NO1", "nor.2": "NO2",
  "swe.1": "SE1", "swe.2": "SE2", "fin.1": "FI1",
  // British Isles / small UEFA
  "irl.1": "IR1", "nir.1": "NIR1", "wal.1": "WAL1",
  "isr.1": "ISR1", "cyp.1": "ZYP1",
  // South America
  "bra.1": "BRA1", "bra.2": "BRA2", "arg.1": "AR1N",
  "chi.1": "CLPD", "uru.1": "URU1", "col.1": "COL1",
  // North America / Asia / Africa majors
  "usa.1": "MLS1", "mex.1": "MEX1",
  "jpn.1": "JAP1", "kor.1": "RSK1", "aus.1": "AUS1", "ksa.1": "SA1",
  "egy.1": "EGY1", "rsa.1": "SFA1"
};

function tmUrl(code, path, qs) {
  return `https://www.transfermarkt.com/x/schiedsrichter/wettbewerb/${code}${path}${qs || ""}`;
}

function parseCompetitionName(html) {
  // The <title> carries the competition name ("Premier League - Referees | ...");
  // the <h1> is just "Referees {season}", useless for verifying the mapping.
  const t = html.match(/<title>([\s\S]*?)<\/title>/);
  if (t) return t[1].replace(/\s*[-|]\s*Referees.*$/i, "").replace(/\s+/g, " ").trim();
  return null;
}

const num = v => {
  const s = String(v ?? "").replace(/\./g, "").replace(",", ".").trim();
  const m = s.match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
};

function parseRefereeTable(html) {
  // NOTE: rows nest an <table class="inline-table"> for the photo/name, so a
  // non-greedy match of the outer items table stops at the first nested </table>.
  // Just scope from the items table onward — referee anchors only exist here.
  const startIdx = html.indexOf('<table class="items"');
  if (startIdx < 0) return [];
  const scope = html.slice(startIdx);

  // Each referee row nests an <table> for the photo/name, so per-<tr> matching is
  // unreliable. Instead anchor on each referee's profile link and read the slice
  // up to the next referee — its <td class="zentriert"> cells are this row's stats.
  const anchors = [...scope.matchAll(/<a [^>]*href="\/[^"]*\/profil\/schiedsrichter\/(\d+)"[^>]*>([^<]+)<\/a>/g)];
  const out = [];
  for (let i = 0; i < anchors.length; i++) {
    const id = anchors[i][1];
    const name = anchors[i][2].trim();
    const start = anchors[i].index;
    const end = i + 1 < anchors.length ? anchors[i + 1].index : scope.length;
    const slice = scope.slice(start, end);

    // Column layout varies by league (Appearances isn't always class="zentriert"),
    // so read ALL cells and keep the pure-integer ones in order. The name/birthplace
    // are text and Debut is a date, so the integers are exactly the 5 stat columns:
    // Appearances, Yellow, Second-yellow, Red, Penalty kicks.
    const cells = [...slice.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)]
      .map(m => m[1].replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").trim());
    const ints = cells.filter(c => /^\d+$/.test(c)).map(Number);
    if (ints.length < 5) continue;
    const [appearances, yellow, secondYellow, red, penalties] = ints.slice(0, 5);
    if (!appearances) continue;

    out.push({
      id, name, appearances, yellow, secondYellow, red, penalties,
      yellowPerGame: yellow / appearances,
      redPerGame: (red + secondYellow) / appearances,
      penPerGame: penalties / appearances
    });
  }
  return out;
}

/**
 * Referee tendencies for one of our leagues for a completed season.
 * @param {string} slug    our league slug (must be in TM_COMPETITIONS)
 * @param {number} saisonId starting year, e.g. 2024 for 2024-25
 * @returns {{ok, slug, season, referees:[...]}}
 */
export async function fetchCompetitionReferees(slug, saisonId) {
  const code = TM_COMPETITIONS[slug];
  if (!code) return { ok: false, slug, reason: "no_tm_mapping", referees: [] };

  const url = tmUrl(code, "/plus/", `?saison_id=${saisonId}`);
  try {
    const r = await fetch(url, { headers: HEADERS });
    if (!r.ok) return { ok: false, slug, season: saisonId, reason: `http_${r.status}`, referees: [] };
    const html = await r.text();
    const referees = parseRefereeTable(html);
    return {
      ok: referees.length > 0, slug, season: saisonId, tmCode: code,
      competition: parseCompetitionName(html), referees, url
    };
  } catch (err) {
    return { ok: false, slug, season: saisonId, reason: String(err?.message || err), referees: [] };
  }
}
