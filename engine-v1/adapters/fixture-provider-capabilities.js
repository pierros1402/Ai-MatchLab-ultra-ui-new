/**
 * Fixture provider capability registry.
 *
 * Declared league coverage is not acquisition coverage.
 * Acquisition coverage is not value-ready coverage.
 *
 * Supplemental scoreboard feeds remain available as acquisition inputs, but a
 * supplemental-only fixture substrate is not value-ready. Value needs an
 * explicit verified fixture provider capability for the league/fixture substrate.
 */

export const ESPN_SUPPORTED_LEAGUES = new Set([
  "eng.1",
  "eng.2",
  "eng.3",
  "eng.4",
  "eng.5",
  "eng.fa",
  "eng.league_cup",
  "eng.trophy",

  "ger.1",
  "ger.2",
  "ger.dfb_pokal",

  "esp.1",
  "esp.2",
  "esp.copa_del_rey",
  "esp.super_cup",

  "ita.1",
  "ita.2",
  "ita.coppa_italia",

  "fra.1",
  "fra.2",
  "fra.coupe_de_france",
  "fra.super_cup",

  "ned.1",
  "ned.2",
  "ned.cup",

  "por.1",
  "bel.1",

  "sco.1",
  "sco.2",
  "sco.challenge",
  "sco.tennents",

  "gre.1",
  "cyp.1",
  "tur.1",
  "sui.1",
  "aut.1",
  "den.1",
  "swe.1",
  "nor.1",

  "uefa.champions",
  "uefa.europa",
  "uefa.europa.conf",

  "afc.champions",
  "afc.cup",
  "caf.champions",
  "caf.confed",
  "caf.nations",
  "conmebol.libertadores",

  "usa.1",
  "arg.1",
  "bra.1",
  "mex.1",
  "uru.1",
  "col.1",
  "chi.1",
  "per.1",

  "jpn.1",
  "ksa.1",
  "rsa.1"
]);

const PROVIDER_DEFINITIONS = [
  {
    id: "espn",
    label: "Supplemental scoreboard feed",
    sourceType: "scoreboard_api",
    role: "supplemental",
    family: "supplemental",
    productionFixtureAllowed: true,
    allowedForValue: false,
    requiresCrossSourceConfirmation: true,
    diagnosticOnly: false,
    supportsLeague(slug) {
      return ESPN_SUPPORTED_LEAGUES.has(String(slug || ""));
    }
  },
  {
    id: "official_league_source",
    label: "Official league source",
    sourceType: "official_structured_or_reviewed_source",
    role: "official",
    family: "verified_non_espn",
    productionFixtureAllowed: true,
    allowedForValue: true,
    requiresCrossSourceConfirmation: false,
    diagnosticOnly: false,
    requiresExplicitLeagueCapability: true,
    supportsLeague() {
      return false;
    }
  },
  {
    id: "manual_verified_import",
    label: "Manual verified import",
    sourceType: "reviewed_import",
    role: "manual_verified",
    family: "verified_non_espn",
    productionFixtureAllowed: true,
    allowedForValue: true,
    requiresCrossSourceConfirmation: false,
    diagnosticOnly: false,
    requiresExplicitLeagueCapability: true,
    supportsLeague() {
      return false;
    }
  },
  {
    id: "reference_manual_review",
    label: "Reference manual review",
    sourceType: "reference_only",
    role: "diagnostic",
    family: "reference",
    productionFixtureAllowed: false,
    allowedForValue: false,
    requiresCrossSourceConfirmation: true,
    diagnosticOnly: true,
    requiresExplicitLeagueCapability: true,
    supportsLeague() {
      return false;
    }
  }
];

function normalizeProviderId(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeConfiguredProviderIds(configuredProviderIds) {
  const raw = [];

  if (Array.isArray(configuredProviderIds)) {
    raw.push(...configuredProviderIds);
  } else if (configuredProviderIds && typeof configuredProviderIds === "object") {
    if (Array.isArray(configuredProviderIds.providers)) {
      raw.push(...configuredProviderIds.providers);
    }
    if (Array.isArray(configuredProviderIds.providerIds)) {
      raw.push(...configuredProviderIds.providerIds);
    }
    if (configuredProviderIds.provider) {
      raw.push(configuredProviderIds.provider);
    }
    if (configuredProviderIds.id) {
      raw.push(configuredProviderIds.id);
    }
  } else if (configuredProviderIds) {
    raw.push(configuredProviderIds);
  }

  return [...new Set(raw.map((entry) => {
    if (entry && typeof entry === "object") {
      return normalizeProviderId(entry.id || entry.provider || entry.providerId);
    }
    return normalizeProviderId(entry);
  }).filter(Boolean))];
}

export function getFixtureProviderDefinitions() {
  return PROVIDER_DEFINITIONS.map((provider) => ({ ...provider }));
}

export function getFixtureProviderDefinition(providerId) {
  const id = normalizeProviderId(providerId);
  if (!id) return null;
  return PROVIDER_DEFINITIONS.find((provider) => provider.id === id) || null;
}

export function getBuiltInFixtureProviderCapabilities(leagueSlug) {
  const slug = String(leagueSlug || "").trim();

  return PROVIDER_DEFINITIONS
    .filter((provider) => {
      try {
        return provider.supportsLeague(slug);
      } catch {
        return false;
      }
    })
    .map((provider) => ({
      id: provider.id,
      label: provider.label,
      sourceType: provider.sourceType,
      role: provider.role,
      family: provider.family,
      productionFixtureAllowed: Boolean(provider.productionFixtureAllowed),
      allowedForValue: Boolean(provider.allowedForValue),
      requiresCrossSourceConfirmation: Boolean(provider.requiresCrossSourceConfirmation),
      diagnosticOnly: Boolean(provider.diagnosticOnly),
      capabilitySource: "built_in"
    }));
}

export function summarizeFixtureProviderCapability(leagueSlug, configuredProviderIds = []) {
  const slug = String(leagueSlug || "").trim();
  const configuredIds = normalizeConfiguredProviderIds(configuredProviderIds);

  const builtIn = getBuiltInFixtureProviderCapabilities(slug);

  const configured = configuredIds.map((providerId) => {
    const definition = getFixtureProviderDefinition(providerId);

    if (!definition) {
      return {
        id: providerId,
        label: providerId,
        sourceType: "unknown",
        role: "unknown",
        family: "unknown",
        productionFixtureAllowed: false,
        allowedForValue: false,
        requiresCrossSourceConfirmation: true,
        diagnosticOnly: true,
        capabilitySource: "configured_unknown",
        warning: "unknown_provider_is_not_value_ready"
      };
    }

    return {
      id: definition.id,
      label: definition.label,
      sourceType: definition.sourceType,
      role: definition.role,
      family: definition.family,
      productionFixtureAllowed: Boolean(definition.productionFixtureAllowed),
      allowedForValue: Boolean(definition.allowedForValue),
      requiresCrossSourceConfirmation: Boolean(definition.requiresCrossSourceConfirmation),
      diagnosticOnly: Boolean(definition.diagnosticOnly),
      capabilitySource: "configured_explicit"
    };
  });

  const providersById = new Map();

  for (const provider of [...builtIn, ...configured]) {
    const previous = providersById.get(provider.id);
    if (!previous || provider.capabilitySource === "configured_explicit") {
      providersById.set(provider.id, provider);
    }
  }

  const providers = [...providersById.values()].sort((a, b) => a.id.localeCompare(b.id));

  const valueReadyNonEspnProviders = providers.filter((provider) => {
    if (provider.id === "espn") return false;
    if (!provider.allowedForValue) return false;
    if (!provider.productionFixtureAllowed) return false;
    if (provider.diagnosticOnly) return false;
    return provider.capabilitySource === "configured_explicit";
  });

  const supplementalProviders = providers.filter((provider) => provider.role === "supplemental");
  const diagnosticOnlyProviders = providers.filter((provider) => provider.diagnosticOnly);

  return {
    leagueSlug: slug,
    providers,
    providerIds: providers.map((provider) => provider.id),
    valueReadyNonEspnProviders,
    valueReadyNonEspnProviderIds: valueReadyNonEspnProviders.map((provider) => provider.id),
    valueReadyVerifiedProviders: valueReadyNonEspnProviders,
    valueReadyVerifiedProviderIds: valueReadyNonEspnProviders.map((provider) => provider.id),
    supplementalProviderIds: supplementalProviders.map((provider) => provider.id),
    diagnosticOnlyProviderIds: diagnosticOnlyProviders.map((provider) => provider.id),
    hasSupplementalScoreboardCapability: providers.some((provider) => provider.id === "espn"),
    hasVerifiedFixtureProviderCapability: valueReadyNonEspnProviders.length > 0,
    hasValueReadyVerifiedProvider: valueReadyNonEspnProviders.length > 0,
    hasEspnCapability: providers.some((provider) => provider.id === "espn"),
    hasValueReadyNonEspnProvider: valueReadyNonEspnProviders.length > 0
  };
}
