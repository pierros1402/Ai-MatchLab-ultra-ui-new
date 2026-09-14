import {
  resolveSlug,
  resolveSlugFromPath
} from "../odds/flashscore-league-map.js";

import {
  resolveInternational
} from "../odds/international-competitions.js";

function clean(value) {
  return String(value || "").trim();
}

function normalizedPath(value) {
  const text = clean(value);

  if (!text) {
    return "";
  }

  return text.startsWith("/")
    ? text
    : "/" + text;
}

const EXPLICIT_OUT_OF_SCOPE_PATHS = new Map([
  [
    "/football/argentina/primera-c/",
    "out_of_scope_lower_tier_competition"
  ],
  [
    "/football/argentina/torneo-promocional-amateur/",
    "out_of_scope_lower_tier_competition"
  ],
  [
    "/football/brazil/carioca-b2/",
    "out_of_scope_regional_competition"
  ],
  [
    "/football/brazil/copa-fmf-mato-grosso/",
    "out_of_scope_regional_competition"
  ],
  [
    "/football/brazil/serie-c/",
    "out_of_scope_lower_tier_competition"
  ],
  [
    "/football/england/isthmian-league-premier-division/",
    "out_of_scope_lower_tier_competition"
  ],
  [
    "/football/england/premier-league-2/",
    "out_of_scope_youth_or_reserve_competition"
  ],
  [
    "/football/england/professional-development-league/",
    "out_of_scope_youth_or_reserve_competition"
  ],
  [
    "/football/estonia/esiliiga-b/",
    "out_of_scope_lower_tier_competition"
  ],
  [
    "/football/india/calcutta-premier-division/",
    "out_of_scope_regional_competition"
  ],
  [
    "/football/italy/primavera-1/",
    "out_of_scope_youth_or_reserve_competition"
  ],
  [
    "/football/japan/j3-league/",
    "out_of_scope_lower_tier_competition"
  ],
  [
    "/football/mexico/liga-premier-serie-a/",
    "out_of_scope_lower_tier_competition"
  ],
  [
    "/football/ukraine/druha-liga/",
    "out_of_scope_lower_tier_competition"
  ],
  [
    "/football/ukraine/premier-league-2/",
    "out_of_scope_youth_or_reserve_competition"
  ],
  [
    "/football/usa/mls-next-pro/",
    "out_of_scope_lower_tier_competition"
  ],
  [
    "/football/usa/usl-league-one/",
    "out_of_scope_lower_tier_competition"
  ]
]);

function explicitScopeReason({
  leaguePath,
  leagueName
}) {
  const safePath =
    normalizedPath(leaguePath)
      .toLowerCase();

  const safeName =
    clean(leagueName)
      .toLowerCase();

  if (
    safePath.includes(
      "/africa-cup-of-nations-women/"
    ) ||
    /\bafrica cup of nations women\b/u
      .test(safeName)
  ) {
    return "out_of_scope_womens_competition";
  }

  if (
    /(?:^|[-/])women(?:[-/]|$)/u
      .test(safePath) ||
    /\bwomen(?:'s)?\b/u
      .test(safeName) ||
    /\bwomens\b/u
      .test(safeName)
  ) {
    return "out_of_scope_womens_competition";
  }

  if (
    /(?:^|[-/])u-?\d{2}(?:[-/]|$)/u
      .test(safePath) ||
    /(?:^|[-/])youth(?:[-/]|$)/u
      .test(safePath) ||
    /(?:^|[-/])reserves?(?:[-/]|$)/u
      .test(safePath) ||
    /\bu-?\d{2}\b/u
      .test(safeName) ||
    /\bunder[-\s]?\d{2}\b/u
      .test(safeName) ||
    /\byouth\b/u
      .test(safeName) ||
    /\breserves?\b/u
      .test(safeName)
  ) {
    return "out_of_scope_youth_or_reserve_competition";
  }

  const explicitPathReason =
    EXPLICIT_OUT_OF_SCOPE_PATHS.get(
      safePath
    );

  if (explicitPathReason) {
    return explicitPathReason;
  }

  if (
    /^\/football\/norway\/division-3-group-\d+\/$/u
      .test(safePath) ||
    /^\/football\/russia\/fnl-2-division-b-group-\d+\/$/u
      .test(safePath) ||
    /^\/football\/sweden\/division-2-[^/]+\/$/u
      .test(safePath)
  ) {
    return "out_of_scope_lower_tier_competition";
  }

  if (
    safePath.includes(
      "/kings-world-cup-clubs/"
    ) ||
    /\bkings world cup clubs\b/u
      .test(safeName)
  ) {
    return "out_of_scope_non_fifa_competition";
  }

  return null;
}

function baseEvidence({
  country,
  leagueName,
  leaguePath,
  providerCompetitionId
}) {
  return {
    provider: "flashscore",
    providerCompetitionId,
    rawCountry: country || null,
    rawLeagueName: leagueName || null,
    rawLeaguePath: leaguePath || null
  };
}

export function resolveFlashscoreCompetitionIdentity(
  input = {}
) {
  const country = clean(input.country);
  const leagueName = clean(input.leagueName);

  const leaguePath =
    normalizedPath(input.leaguePath);

  const providerCompetitionId =
    clean(
      input.providerCompetitionId ||
      input.leagueId ||
      input.tournamentId ||
      input.competitionId
    ) || null;

  const evidence = baseEvidence({
    country,
    leagueName,
    leaguePath,
    providerCompetitionId
  });

  const exactPathSlug =
    leaguePath
      ? resolveSlugFromPath(leaguePath)
      : null;

  if (exactPathSlug) {
    return {
      ok: true,
      status: "resolved",
      reasonCode:
        "resolved_exact_provider_path",
      canonicalSlug: exactPathSlug,
      canonicalLabel: null,
      resolutionMethod:
        "flashscore_exact_path",
      ...evidence
    };
  }

  const scopeReason =
    explicitScopeReason({
      leaguePath,
      leagueName
    });

  if (scopeReason) {
    return {
      ok: true,
      status: "excluded",
      reasonCode: scopeReason,
      canonicalSlug: null,
      canonicalLabel: null,
      resolutionMethod:
        "flashscore_explicit_scope_policy",
      ...evidence
    };
  }

  /*
   * A non-empty provider path is stronger identity evidence
   * than a broad competition-name regex.
   */
  if (leaguePath) {
    return {
      ok: false,
      status: "quarantined",
      reasonCode:
        "unmapped_provider_competition",
      canonicalSlug: null,
      canonicalLabel: null,
      resolutionMethod:
        "flashscore_unmapped_provider_path",
      ...evidence
    };
  }

  const domesticSlug =
    resolveSlug(
      country,
      leagueName
    );

  if (domesticSlug) {
    return {
      ok: true,
      status: "resolved",
      reasonCode:
        "resolved_domestic_name",
      canonicalSlug: domesticSlug,
      canonicalLabel: null,
      resolutionMethod:
        "flashscore_domestic_name",
      ...evidence
    };
  }

  /*
   * Legacy name fallback remains permitted only when
   * Flashscore supplied no provider competition path.
   */
  const international =
    resolveInternational(
      leagueName,
      country
    );

  if (international?.slug) {
    return {
      ok: true,
      status: "resolved",
      reasonCode:
        "resolved_legacy_name_without_provider_path",
      canonicalSlug:
        international.slug,
      canonicalLabel:
        international.label || null,
      resolutionMethod:
        "legacy_name_without_provider_path",
      ...evidence
    };
  }

  return {
    ok: false,
    status: "quarantined",
    reasonCode:
      "unmapped_provider_competition",
    canonicalSlug: null,
    canonicalLabel: null,
    resolutionMethod:
      "flashscore_unresolved",
    ...evidence
  };
}
