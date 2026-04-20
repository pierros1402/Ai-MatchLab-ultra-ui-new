export const REMOTE_PROVIDER_REGISTRY = {
  team_news: {
    dispatch: "consensus",
    minSuccessProviders: 1,
    keepConflicts: true,
    providers: [
      {
        id: "team-news-research-bridge",
        enabled: true,
        priority: 300,
        type: "bridge"
      },
      {
        id: "team-news-match-facts",
        enabled: true,
        priority: 200,
        type: "extractor"
      },
      {
        id: "team-news-provider-stub",
        enabled: true,
        priority: 10,
        type: "stub"
      }
    ]
  },

  referee_profile: {
    dispatch: "consensus",
    minSuccessProviders: 1,
    keepConflicts: true,
    providers: [
      {
        id: "referee-research-bridge",
        enabled: true,
        priority: 300,
        type: "bridge"
      },
      {
        id: "referee-match-facts",
        enabled: true,
        priority: 200,
        type: "extractor"
      },
      {
        id: "referee-provider-stub",
        enabled: true,
        priority: 10,
        type: "stub"
      }
    ]
  }
};

export function getProvidersForCapability(capability) {
  const entry = REMOTE_PROVIDER_REGISTRY[capability];
  if (!entry) return [];
  return Array.isArray(entry.providers)
    ? entry.providers
        .filter(provider => provider?.enabled !== false)
        .sort((a, b) => (b.priority || 0) - (a.priority || 0))
    : [];
}

export function getProviderPolicy(capability) {
  const entry = REMOTE_PROVIDER_REGISTRY[capability];
  return {
    dispatch: entry?.dispatch || "single",
    minSuccessProviders: Number.isFinite(Number(entry?.minSuccessProviders))
      ? Number(entry.minSuccessProviders)
      : 1,
    keepConflicts: entry?.keepConflicts !== false
  };
}