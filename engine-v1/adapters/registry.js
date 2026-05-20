import { fetchLeagueFixtures } from "./espn.js";
import { ESPN_SUPPORTED_LEAGUES } from "./fixture-provider-capabilities.js";
import { normalizeFixture } from "../core/normalize.js";

const FIXTURE_ADAPTERS = [
  {
    id: "espn",
    label: "ESPN",
    kind: "fixtures",
    priority: 100,
    family: "supplemental",
    allowedForValue: false,
    requiresCrossSourceConfirmation: true,
    isEnabled() {
      return true;
    },
    supportsLeague(slug) {
      return ESPN_SUPPORTED_LEAGUES.has(slug);
    },
    async fetch({ slug, dayKey }) {
      const data = await fetchLeagueFixtures(slug, dayKey);
      return Array.isArray(data?.events) ? data.events : [];
    },
    normalize(event, slug) {
      return normalizeFixture(event, slug);
    }
  },
];

export function getFixtureAdapters() {
  return [...FIXTURE_ADAPTERS].sort((a, b) => {
    const pa = Number(a?.priority || 0);
    const pb = Number(b?.priority || 0);
    return pb - pa;
  });
}

export function getFixtureAdapterById(id) {
  const key = String(id || "").trim();
  if (!key) return null;

  return (
    FIXTURE_ADAPTERS.find(adapter => adapter.id === key || adapter.legacyId === key) || null
  );
}

export function getFixtureProviderPlan(slug) {
  const supported = getFixtureAdapters().filter(adapter => {
    try {
      return adapter.isEnabled() && adapter.supportsLeague(slug);
    } catch {
      return false;
    }
  });

  const primary = supported[0] || null;
  const fallbacks = supported.slice(1);

  const mode =
    supported.length > 1 ? "multi" : supported.length === 1 ? "single" : "none";

  let execution = "skip";

  if (mode === "single") {
    execution = "primary_only";
  } else if (mode === "multi") {
    execution = "primary_then_conditional_fallback";
  }

  return {
    leagueSlug: slug,
    mode,
    execution,
    fallbackPolicy: {
      enabled: mode === "multi",
      strategy: "on_primary_failure_or_empty",
      triggerOnPrimaryError: true,
      triggerOnPrimaryEmpty: true
    },
    providers: supported.map(adapter => ({
      id: adapter.id,
      label: adapter.label || adapter.id,
      priority: Number(adapter.priority || 0),
      family: adapter.family || "unknown",
      allowedForValue: Boolean(adapter.allowedForValue),
      requiresCrossSourceConfirmation: Boolean(adapter.requiresCrossSourceConfirmation),
      enabled: true
    })),
    primary: primary
      ? {
          id: primary.id,
          label: primary.label || primary.id,
          priority: Number(primary.priority || 0),
          family: primary.family || "unknown",
          allowedForValue: Boolean(primary.allowedForValue),
          requiresCrossSourceConfirmation: Boolean(primary.requiresCrossSourceConfirmation)
        }
      : null,
    fallbacks: fallbacks.map(adapter => ({
      id: adapter.id,
      label: adapter.label || adapter.id,
      priority: Number(adapter.priority || 0),
      family: adapter.family || "unknown",
      allowedForValue: Boolean(adapter.allowedForValue),
      requiresCrossSourceConfirmation: Boolean(adapter.requiresCrossSourceConfirmation)
    }))
  };
}
