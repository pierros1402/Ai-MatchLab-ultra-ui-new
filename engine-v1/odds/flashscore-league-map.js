/**
 * flashscore-league-map.js
 *
 * Resolves a Flashscore competition (country + league name) to OUR coverage slug
 * (e.g. Brazil + "Serie B" → "bra.2"). This is the shared key that lets our
 * autonomous fixtures/odds attach to the platform's existing league slugs WITHOUT
 * changing the designed pipeline — leagues that don't map (cups, women, youth,
 * regional divisions outside our map) resolve to null and are simply excluded.
 *
 * Matching is automatic: same country + best name overlap against the coverage
 * registry names. A small learned cache speeds up repeat lookups.
 */

import { LEAGUES_COVERAGE } from "../../workers/_shared/leagues-coverage.js";
import { leagueName } from "../../workers/_shared/leagues-registry.js";
import { isDisabledLeague } from "../source-discovery/disabled-leagues.js";

const MATCH_THRESHOLD = 0.45;

function normCountry(c) {
  return String(c || "").toLowerCase().replace(/[\s-]+/g, "_").trim();
}

// Truly generic words. Division markers (league/division/liga/serie/primera/B/2…)
// are KEPT as discriminators so "Primera B" (3rd tier) doesn't match "Primera
// División" (1st tier).
const STOP = new Set(["football","soccer","the","de","do","da","of"]);

// Competitions that are never one of our senior men's domestic leagues.
const REJECT_RE = /\b(women|women's|fem|feminin|girls|u-?\d{2}|under-?\d{2}|youth|junior|reserve|reserves|cup|copa|coupe|pokal|trophy|playoffs?|play-?offs?|friendl|amateur|futsal|beach)\b/i;

function nameTokens(name, country) {
  const c = String(country || "").toLowerCase().replace(/_/g, " ");
  return new Set(
    String(name || "")
      .toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(new RegExp(`\\b${c}\\b`, "g"), " ")  // drop the country token
      .replace(/[^a-z0-9 ]/g, " ")
      .split(/\s+/)
      .filter(t => t && !STOP.has(t))
  );
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / new Set([...a, ...b]).size;
}

// Registry names like "Aus 1" / "Gab 1" are placeholders that share no tokens
// with the Flashscore display name, so name-jaccard can never match them. Real
// Flashscore names for those slugs live here (harvested from the live feed).
// A former tier-based fallback ("no lower-tier marker ⇒ top flight") is gone:
// it swallowed every regional/state league of these countries into the tier-1
// slug (NPL Queensland → aus.1). Unmatched competitions now stay unresolved and
// the accumulator files them under their own fs.{country}.{competition} slug.
const PLACEHOLDER_LEAGUE_NAMES = {
  "aus.1": "A-League Men",
  "bol.1": "Division Profesional",
  "can.1": "Canadian Premier League",
  "eth.1": "Premier League",
  "gab.1": "Championnat D1",
  "mwi.1": "Super League",
  "som.1": "National League",
  "syr.1": "Premier League",
  "yem.1": "Division 1",
  "tan.1": "Ligi Kuu Bara",
  "zim.1": "Premier Soccer League",
  // can.2 / lca.2 have no Flashscore competition to match — left unmapped.
};

// country -> [{ slug, tokens }]
const COUNTRY_INDEX = (() => {
  const idx = new Map();
  for (const entry of LEAGUES_COVERAGE) {
    if (entry.type !== "league") continue;
    const c = entry.country;
    if (!idx.has(c)) idx.set(c, []);
    const nm = PLACEHOLDER_LEAGUE_NAMES[entry.slug] || leagueName(entry.slug);
    idx.get(c).push({
      slug: entry.slug,
      tokens: nameTokens(nm, c),
    });
  }
  return idx;
})();

const learned = new Map(); // "country|leaguename" -> slug|null

/**
 * @returns {string|null} our coverage slug, or null if it isn't one of our leagues.
 */
export function resolveSlug(country, leagueName_) {
  const c = normCountry(country);
  const key = `${c}|${String(leagueName_ || "").toLowerCase()}`;
  if (learned.has(key)) return learned.get(key);

  // Never map non-senior-men competitions to our (men's) league slugs.
  if (REJECT_RE.test(String(leagueName_ || ""))) { learned.set(key, null); return null; }

  const candidates = COUNTRY_INDEX.get(c);
  let slug = null;
  if (candidates && candidates.length) {
    const t = nameTokens(leagueName_, c);
    let best = 0;
    for (const cand of candidates) {
      const s = jaccard(t, cand.tokens);
      if (s > best) { best = s; slug = cand.slug; }
    }
    if (best < MATCH_THRESHOLD) slug = null;
  }

  // Deactivated leagues stay on the map but are never attributed/fetched.
  if (slug && isDisabledLeague(slug)) slug = null;

  learned.set(key, slug);
  return slug;
}

export function coverageCountries() {
  return new Set(COUNTRY_INDEX.keys());
}

/**
 * Deterministic leaguePath → slug lookup for cups, continental competitions,
 * and qualifiers — competitions that resolveSlug() explicitly rejects via
 * REJECT_RE (cup/pokal/coupe/trophy) or has no country index for (UEFA/CAF etc.).
 *
 * Paths are stable Flashscore URL segments; this is the single source of truth
 * for non-domestic-league competitions.  New paths can be added as they appear
 * in the feed.  Returns null for unknown paths (treated as untracked).
 */
const PATH_SLUG_MAP = {
  // ── UEFA main competitions ────────────────────────────────────────────────
  "/football/europe/champions-league/":                         "uefa.champions",
  "/football/europe/champions-league-qualification/":           "ucl.q",
  "/football/europe/europa-league/":                            "uefa.europa",
  "/football/europe/europa-league-qualification/":              "uel.q",
  "/football/europe/europa-conference-league/":                 "uefa.europa.conf",
  "/football/europe/europa-conference-league-qualification/":   "uecl.q",
  "/football/europe/super-cup/":                                "uefa.super_cup",
  "/football/europe/nations-league/":                           "uefa.nations",
  "/football/europe/euro/":                                     "uefa.euro",
  "/football/europe/euro-qualification/":                       "uefa.euro.qual",
  // ── FIFA ─────────────────────────────────────────────────────────────────
  "/football/world/world-championship/":                        "fifa.world",
  "/football/world/club-world-cup/":                            "fifa.club_world",
  // ── CONMEBOL ─────────────────────────────────────────────────────────────
  "/football/south-america/copa-libertadores/":                 "conmebol.libertadores",
  "/football/south-america/copa-sudamericana/":                 "conmebol.sudamericana",
  "/football/south-america/copa-america/":                      "conmebol.copa_america",
  // ── CONCACAF ─────────────────────────────────────────────────────────────
  "/football/world/concacaf-champions-cup/":                    "concacaf.champions",
  "/football/concacaf/concacaf-champions-cup/":                 "concacaf.champions",
  "/football/concacaf/nations-league/":                         "concacaf.nations",
  // ── AFC ──────────────────────────────────────────────────────────────────
  "/football/asia/afc-champions-league-elite/":                 "afc.champions",
  "/football/asia/afc-champions-league/":                       "afc.champions",
  "/football/asia/afc-cup/":                                    "afc.cup",
  "/football/asia/afc-asian-cup/":                              "afc.asian_cup",
  // ── CAF ──────────────────────────────────────────────────────────────────
  "/football/africa/caf-champions-league/":                     "caf.champions",
  "/football/africa/caf-confederation-cup/":                    "caf.confed",
  "/football/africa/africa-cup-of-nations/":                    "caf.nations",
  "/football/africa/africa-cup-of-nations-qualification/":      "caf.nations",
  // ── England cups ─────────────────────────────────────────────────────────
  "/football/england/fa-cup/":                                  "eng.fa",
  "/football/england/league-cup/":                              "eng.league_cup",
  "/football/england/football-league-trophy/":                  "eng.trophy",
  // ── Germany ──────────────────────────────────────────────────────────────
  "/football/germany/dfb-pokal/":                               "ger.dfb_pokal",
  // ── Spain ────────────────────────────────────────────────────────────────
  "/football/spain/copa-del-rey/":                              "esp.copa_del_rey",
  "/football/spain/super-cup/":                                 "esp.super_cup",
  // ── Italy ────────────────────────────────────────────────────────────────
  "/football/italy/coppa-italia/":                              "ita.coppa_italia",
  // ── France ───────────────────────────────────────────────────────────────
  "/football/france/coupe-de-france/":                          "fra.coupe_de_france",
  "/football/france/trophee-des-champions/":                    "fra.super_cup",
  "/football/france/trophy-champions/":                         "fra.super_cup",
  // ── Netherlands ──────────────────────────────────────────────────────────
  "/football/netherlands/knvb-cup/":                            "ned.cup",
  // ── Portugal ─────────────────────────────────────────────────────────────
  "/football/portugal/taca-de-portugal/":                       "por.taca.portugal",
  // ── Scotland ─────────────────────────────────────────────────────────────
  "/football/scotland/challenge-cup/":                          "sco.challenge",
  "/football/scotland/scottish-cup/":                           "sco.tennents",
  // ── Other European cups ───────────────────────────────────────────────────
  "/football/greece/cup/":                                      "gre.cup",
  "/football/cyprus/cup/":                                      "cyp.cup",
  "/football/turkey/cup/":                                      "tur.cup",
  "/football/switzerland/cup/":                                 "sui.cup",
  "/football/austria/cup/":                                     "aut.cup",
  "/football/denmark/cup/":                                     "den.cup",
  "/football/sweden/cup/":                                      "swe.cup",
  "/football/norway/cup/":                                      "nor.cup",
  "/football/poland/cup/":                                      "pol.cup",
  "/football/czech-republic/cup/":                              "cze.cup",
  "/football/romania/cup/":                                     "rou.cup",
  "/football/serbia/cup/":                                      "srb.cup",
  "/football/croatia/cup/":                                     "cro.cup",
  "/football/hungary/cup/":                                     "hun.cup",
  "/football/bulgaria/cup/":                                    "bul.cup",
  "/football/ukraine/cup/":                                     "ukr.cup",
};

/**
 * Deterministic leaguePath → slug for our DOMESTIC leagues (top two tiers).
 *
 * resolveSlug() matches on the Flashscore display name, which drifts with
 * sponsors ("Chance Liga", "efbet League", "Mozzart Bet Super Liga"…) and often
 * shares no tokens with our registry name — so a name-only match silently misses
 * those leagues and play-forward never accumulates them. The URL path, by
 * contrast, is stable. This map (harvested from each country's Flashscore index,
 * tier order) is the reliable fallback the accumulator uses when the name match
 * fails, so every covered league attributes correctly the moment it returns to
 * the feed — no manual upkeep, no missed leagues.
 */
export const DOMESTIC_PATH_SLUG = {
  "/football/england/premier-league/": "eng.1",
  "/football/england/championship/": "eng.2",
  "/football/germany/bundesliga/": "ger.1",
  "/football/germany/2-bundesliga/": "ger.2",
  "/football/spain/laliga/": "esp.1",
  "/football/spain/laliga2/": "esp.2",
  "/football/italy/serie-a/": "ita.1",
  "/football/italy/serie-b/": "ita.2",
  "/football/france/ligue-1/": "fra.1",
  "/football/france/ligue-2/": "fra.2",
  "/football/netherlands/eredivisie/": "ned.1",
  "/football/netherlands/eerste-divisie/": "ned.2",
  "/football/portugal/liga-portugal/": "por.1",
  "/football/portugal/liga-portugal-2/": "por.2",
  "/football/belgium/jupiler-pro-league/": "bel.1",
  "/football/belgium/challenger-pro-league/": "bel.2",
  "/football/scotland/premiership/": "sco.1",
  "/football/scotland/championship/": "sco.2",
  "/football/greece/super-league/": "gre.1",
  "/football/greece/super-league-2/": "gre.2",
  "/football/cyprus/cyprus-league/": "cyp.1",
  "/football/cyprus/division-2/": "cyp.2",
  "/football/turkey/super-lig/": "tur.1",
  "/football/turkey/1-lig/": "tur.2",
  "/football/switzerland/super-league/": "sui.1",
  "/football/switzerland/challenge-league/": "sui.2",
  "/football/austria/bundesliga/": "aut.1",
  "/football/austria/2-liga/": "aut.2",
  "/football/denmark/superliga/": "den.1",
  "/football/denmark/1st-division/": "den.2",
  "/football/sweden/allsvenskan/": "swe.1",
  "/football/sweden/superettan/": "swe.2",
  "/football/norway/eliteserien/": "nor.1",
  "/football/norway/obos-ligaen/": "nor.2",
  "/football/finland/veikkausliiga/": "fin.1",
  "/football/finland/ykkosliiga/": "fin.2",
  "/football/poland/ekstraklasa/": "pol.1",
  "/football/poland/division-1/": "pol.2",
  "/football/czech-republic/chance-liga/": "cze.1",
  "/football/czech-republic/chnl/": "cze.2",
  "/football/romania/superliga/": "rou.1",
  "/football/romania/liga-2/": "rou.2",
  "/football/serbia/mozzart-bet-super-liga/": "srb.1",
  "/football/serbia/mozzart-bet-prva-liga/": "srb.2",
  "/football/croatia/hnl/": "cro.1",
  "/football/croatia/prva-nl/": "cro.2",
  "/football/hungary/nb-i/": "hun.1",
  "/football/hungary/nb-ii/": "hun.2",
  "/football/bulgaria/efbet-league/": "bul.1",
  "/football/bulgaria/vtora-liga/": "bul.2",
  "/football/ukraine/premier-league/": "ukr.1",
  "/football/ukraine/persha-liga/": "ukr.2",
  "/football/albania/abissnet-superiore/": "alb.1",
  "/football/albania/kategoria-e-pare/": "alb.2",
  "/football/armenia/premier-league/": "arm.1",
  "/football/armenia/first-league/": "arm.2",
  "/football/azerbaijan/premier-league/": "aze.1",
  "/football/azerbaijan/i-liqa/": "aze.2",
  "/football/bosnia-and-herzegovina/wwin-liga-bih/": "bih.1",
  "/football/bosnia-and-herzegovina/prva-liga-fbih/": "bih.2",
  "/football/belarus/vysshaya-liga/": "blr.1",
  "/football/belarus/pershaya-liga/": "blr.2",
  "/football/estonia/meistriliiga/": "est.1",
  "/football/estonia/esiliiga/": "est.2",
  "/football/faroe-islands/premier-league/": "fro.1",
  "/football/faroe-islands/1-deild/": "fro.2",
  "/football/georgia/crystalbet-erovnuli-liga/": "geo.1",
  "/football/georgia/crystalbet-erovnuli-liga-2/": "geo.2",
  "/football/iceland/besta-deild-karla/": "isl.1",
  "/football/iceland/division-1/": "isl.2",
  "/football/ireland/premier-division/": "irl.1",
  "/football/ireland/division-1/": "irl.2",
  "/football/israel/ligat-ha-al/": "isr.1",
  "/football/israel/leumit-league/": "isr.2",
  "/football/kazakhstan/premier-league/": "kaz.1",
  "/football/kazakhstan/first-league/": "kaz.2",
  "/football/kosovo/superliga/": "kos.1",
  "/football/kosovo/liga-e-pare/": "kos.2",
  "/football/latvia/virsliga/": "lva.1",
  "/football/latvia/nakotnes-liga/": "lva.2",
  "/football/lithuania/toplyga/": "ltu.1",
  "/football/lithuania/i-lyga/": "ltu.2",
  "/football/luxembourg/bgl-ligue/": "lux.1",
  "/football/moldova/super-liga/": "mda.1",
  "/football/moldova/liga-1/": "mda.2",
  "/football/malta/premier-league/": "mlt.1",
  "/football/malta/challenge-league/": "mlt.2",
  "/football/montenegro/prva-crnogorska-liga/": "mne.1",
  "/football/montenegro/druga-liga/": "mne.2",
  "/football/north-macedonia/1-mfl/": "mkd.1",
  "/football/north-macedonia/2-mfl/": "mkd.2",
  "/football/northern-ireland/nifl-premiership/": "nir.1",
  "/football/northern-ireland/nifl-championship/": "nir.2",
  "/football/slovakia/nike-liga/": "svk.1",
  "/football/slovakia/2-liga/": "svk.2",
  "/football/slovenia/prva-liga/": "svn.1",
  "/football/slovenia/2-snl/": "svn.2",
  "/football/wales/cymru-premier/": "wal.1",
  "/football/wales/cymru-south/": "wal.2",
  "/football/andorra/primera-divisio/": "and.1",
  "/football/gibraltar/national-league/": "gib.1",
  "/football/russia/premier-league/": "rus.1",
  "/football/russia/fnl/": "rus.2",
  "/football/san-marino/campionato-sammarinese/": "smr.1",
  "/football/usa/mls/": "usa.1",
  "/football/usa/usl-championship/": "usa.2",
  "/football/argentina/liga-profesional/": "arg.1",
  "/football/argentina/primera-nacional/": "arg.2",
  "/football/brazil/serie-a-betano/": "bra.1",
  "/football/brazil/serie-b/": "bra.2",
  "/football/mexico/liga-mx/": "mex.1",
  "/football/mexico/liga-de-expansion-mx/": "mex.2",
  "/football/uruguay/liga-auf-uruguaya/": "uru.1",
  "/football/uruguay/segunda-division/": "uru.2",
  "/football/colombia/primera-a/": "col.1",
  "/football/colombia/primera-b/": "col.2",
  "/football/chile/liga-de-primera/": "chi.1",
  "/football/chile/liga-de-ascenso/": "chi.2",
  "/football/peru/liga-1/": "per.1",
  "/football/peru/liga-2/": "per.2",
  "/football/china/super-league/": "chn.1",
  "/football/china/league-one/": "chn.2",
  "/football/japan/j1-league/": "jpn.1",
  "/football/japan/j2-league/": "jpn.2",
  "/football/south-korea/k-league-1/": "kor.1",
  "/football/south-korea/k-league-2/": "kor.2",
  "/football/saudi-arabia/saudi-professional-league/": "ksa.1",
  "/football/saudi-arabia/division-1/": "ksa.2",
  "/football/united-arab-emirates/uae-league/": "uae.1",
  "/football/united-arab-emirates/division-1/": "uae.2",
  "/football/qatar/qsl/": "qat.1",
  "/football/qatar/division-2/": "qat.2",
  "/football/indonesia/super-league/": "idn.1",
  "/football/indonesia/championship/": "idn.2",
  "/football/malaysia/super-league/": "mys.1",
  "/football/venezuela/liga-futve/": "ven.1",
  "/football/venezuela/liga-futve-2/": "ven.2",
  "/football/ecuador/liga-pro/": "ecu.1",
  "/football/ecuador/serie-b/": "ecu.2",
  "/football/uganda/premier-league/": "uga.1",
  "/football/uganda/big-league/": "uga.2",
  "/football/south-africa/betway-premiership/": "rsa.1",
  "/football/south-africa/motsepe-foundation-championship/": "rsa.2",
  "/football/egypt/premier-league/": "egy.1",
  "/football/egypt/division-2-a/": "egy.2",
  "/football/morocco/botola-pro/": "mar.1",
  "/football/morocco/botola-2/": "mar.2",
  "/football/tunisia/ligue-professionnelle-1/": "tun.1",
  "/football/tunisia/ligue-2/": "tun.2",
  "/football/india/indian-super-league/": "ind.1",
  "/football/india/i-league/": "ind.2",
  "/football/australia/a-league/": "aus.1",
  "/football/bolivia/division-profesional/": "bol.1",
  "/football/canada/canadian-premier-league/": "can.1",
  "/football/ethiopia/premier-league/": "eth.1",
  "/football/gabon/championnat-d1/": "gab.1",
  "/football/malawi/super-league/": "mwi.1",
  "/football/somalia/national-league/": "som.1",
  "/football/syria/premier-league/": "syr.1",
  "/football/tanzania/ligi-kuu-bara/": "tan.1",
  "/football/yemen/division-1/": "yem.1",
  "/football/zimbabwe/premier-soccer-league/": "zim.1",
};

export function resolveSlugFromPath(leaguePath) {
  if (!leaguePath) return null;
  const slug = PATH_SLUG_MAP[leaguePath] || DOMESTIC_PATH_SLUG[leaguePath] || null;
  if (slug && isDisabledLeague(slug)) return null;
  return slug;
}

/** All leaguePaths we have an explicit mapping for (cups/continental + domestic). */
export function knownLeaguePaths() {
  return [...Object.keys(PATH_SLUG_MAP), ...Object.keys(DOMESTIC_PATH_SLUG)];
}
