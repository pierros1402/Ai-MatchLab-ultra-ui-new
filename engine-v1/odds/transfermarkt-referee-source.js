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

// Our league slug → Transfermarkt competition code + URL slug (major leagues where
// referee data is meaningful; extend as needed).
export const TM_COMPETITIONS = {
  "eng.1": { code: "GB1", slug: "premier-league" },
  "esp.1": { code: "ES1", slug: "laliga" },
  "ita.1": { code: "IT1", slug: "serie-a" },
  "ger.1": { code: "L1",  slug: "bundesliga" },
  "fra.1": { code: "FR1", slug: "ligue-1" },
  "ned.1": { code: "NL1", slug: "eredivisie" },
  "por.1": { code: "PO1", slug: "liga-portugal" },
  "bel.1": { code: "BE1", slug: "jupiler-pro-league" },
  "tur.1": { code: "TR1", slug: "super-lig" },
  "sco.1": { code: "SC1", slug: "scottish-premiership" },
  "bra.1": { code: "BRA1", slug: "campeonato-brasileiro-serie-a" },
  "bra.2": { code: "BRA2", slug: "campeonato-brasileiro-serie-b" },
  "arg.1": { code: "AR1N", slug: "liga-profesional-de-futbol" },
  "usa.1": { code: "MLS1", slug: "major-league-soccer" },
  "mex.1": { code: "MEX1", slug: "liga-mx-apertura" }
};

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
  const tm = TM_COMPETITIONS[slug];
  if (!tm) return { ok: false, slug, reason: "no_tm_mapping", referees: [] };

  const url = `https://www.transfermarkt.com/${tm.slug}/schiedsrichter/wettbewerb/${tm.code}/plus/?saison_id=${saisonId}`;
  try {
    const r = await fetch(url, { headers: HEADERS });
    if (!r.ok) return { ok: false, slug, season: saisonId, reason: `http_${r.status}`, referees: [] };
    const html = await r.text();
    const referees = parseRefereeTable(html);
    return { ok: referees.length > 0, slug, season: saisonId, tmCode: tm.code, referees, url };
  } catch (err) {
    return { ok: false, slug, season: saisonId, reason: String(err?.message || err), referees: [] };
  }
}
