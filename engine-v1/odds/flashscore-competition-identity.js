import { resolveSlug, resolveSlugFromPath } from "./flashscore-league-map.js";
import { resolveInternational } from "./international-competitions.js";

// Flashscore's ZL field is the provider's stable competition route.  When it is
// present, that route is stronger identity evidence than a display name.  The
// entries below fill covered senior competitions that are not yet present in
// DOMESTIC_PATH_SLUG.  Youth/regional competitions are intentionally NOT mapped:
// an unknown provider path must fail closed instead of being fuzzy-attributed to
// a broader senior competition.
const COVERAGE_PATH_OVERRIDES = Object.freeze({
  "/football/england/league-one/": "eng.3",
  "/football/england/league-two/": "eng.4",
  "/football/england/national-league/": "eng.5",
  "/football/germany/3-liga/": "ger.3"
});

function normalizeProviderPath(value) {
  let providerPath = String(value || "").trim().toLowerCase();
  if (!providerPath) return "";
  if (!providerPath.startsWith("/")) providerPath = `/${providerPath}`;
  if (!providerPath.endsWith("/")) providerPath += "/";
  return providerPath;
}

/**
 * Resolve one Flashscore competition to our declared coverage identity.
 *
 * Contract:
 *  - provider path present => path-authoritative, NO fuzzy name fallback;
 *  - known covered path => exact canonical slug;
 *  - unknown path => unresolved/fail-closed;
 *  - only pathless legacy rows may use name-based compatibility fallback.
 */
export function resolveFlashscoreCompetitionIdentity(input = {}) {
  const providerPath = normalizeProviderPath(input?.leaguePath);
  const leagueName = String(input?.leagueName || "").trim();
  const country = String(input?.country || "").trim();

  if (providerPath) {
    const slug =
      COVERAGE_PATH_OVERRIDES[providerPath] ||
      resolveSlugFromPath(providerPath) ||
      null;

    return {
      slug,
      label: leagueName || null,
      providerPath,
      resolution: slug ? "provider_path" : "provider_path_unmapped",
      authoritative: true
    };
  }

  // Compatibility only for legacy/pathless provider rows. International
  // competitions retain their dedicated resolver before domestic name matching.
  const international = resolveInternational(leagueName, country);
  if (international?.slug) {
    return {
      slug: international.slug,
      label: international.label || leagueName || null,
      providerPath: null,
      resolution: "international_name_fallback",
      authoritative: false
    };
  }

  const slug = resolveSlug(country, leagueName) || null;
  return {
    slug,
    label: leagueName || null,
    providerPath: null,
    resolution: slug ? "domestic_name_fallback" : "name_unmapped",
    authoritative: false
  };
}

export function resolveFlashscoreCompetitionSlug(input = {}) {
  return resolveFlashscoreCompetitionIdentity(input).slug;
}

export function flashscoreCoveragePathOverrides() {
  return { ...COVERAGE_PATH_OVERRIDES };
}
