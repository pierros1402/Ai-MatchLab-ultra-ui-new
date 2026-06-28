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

// country -> [{ slug, tier, tokens, placeholder }]
const COUNTRY_INDEX = (() => {
  const idx = new Map();
  for (const entry of LEAGUES_COVERAGE) {
    if (entry.type !== "league") continue;
    const c = entry.country;
    if (!idx.has(c)) idx.set(c, []);
    const nm = leagueName(entry.slug);
    idx.get(c).push({
      slug: entry.slug,
      tier: tierOf(entry.slug, entry.tier),
      tokens: nameTokens(nm, c),
      // Placeholder registry names like "Hon 1" / "Fij 2" carry no real league name
      // to match against, so name-jaccard can't work for them.
      placeholder: /^[a-z]{2,4}\s*\d+$/i.test(String(nm || "").trim())
    });
  }
  return idx;
})();

// Division/tier from our slug suffix (e.g. "hon.2" -> 2), falling back to registry.
function tierOf(slug, regTier) {
  const m = String(slug).match(/\.(\d+)$/);
  return m ? Number(m[1]) : (Number(regTier) || 1);
}

// Infer a Flashscore competition's tier from common multilingual second/third-tier
// markers. Defaults to 1 (top flight) when no lower-tier marker is present.
function inferFlashscoreTier(name) {
  const n = String(name || "").toLowerCase();
  if (/\b(third|tercera|terceira|serie c|3\.?\s*(liga|division|divisione|lig)|league two|3a)\b/.test(n)) return 3;
  if (/\b(second|segunda|segona|serie b|2\.?\s*(liga|division|divisione|bundesliga|lig)|ligue 2|liga 2|championship|primera b|ascenso|eerste|superettan|obos|challenger|smartbank|2nd)\b/.test(n)) return 2;
  return 1;
}

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

    // Fallback ONLY when name-matching found nothing (so existing mappings never
    // change): for countries whose registry names are placeholders, match by
    // country + inferred tier. Unique tier match only, to avoid ambiguity.
    if (!slug && candidates.some(x => x.placeholder)) {
      const wantTier = inferFlashscoreTier(leagueName_);
      const sameTier = candidates.filter(x => x.tier === wantTier);
      if (sameTier.length === 1) slug = sameTier[0].slug;
    }
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

export function resolveSlugFromPath(leaguePath) {
  if (!leaguePath) return null;
  const slug = PATH_SLUG_MAP[leaguePath] || null;
  if (slug && isDisabledLeague(slug)) return null;
  return slug;
}

/** All leaguePaths we have an explicit mapping for. */
export function knownLeaguePaths() {
  return Object.keys(PATH_SLUG_MAP);
}
