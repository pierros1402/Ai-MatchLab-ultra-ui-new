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
