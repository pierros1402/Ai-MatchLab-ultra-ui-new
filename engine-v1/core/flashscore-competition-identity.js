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
