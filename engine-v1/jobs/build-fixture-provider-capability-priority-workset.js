import fs from "node:fs";
import path from "node:path";

import { LEAGUES_COVERAGE } from "../../workers/_shared/leagues-coverage.js";
import { getFixtureProviderPlan } from "../adapters/registry.js";
import { summarizeFixtureProviderCapability } from "../adapters/fixture-provider-capabilities.js";

function normalizeRows(value) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.leagues)) return value.leagues;
  if (Array.isArray(value?.rows)) return value.rows;

  if (value && typeof value === "object") {
    return Object.entries(value).map(([slug, row]) => ({
      slug,
      ...(row && typeof row === "object" ? row : {})
    }));
  }

  return [];
}

function slugOf(row) {
  return String(row?.slug || row?.leagueSlug || row?.id || "").trim();
}

function nameOf(row) {
  return String(row?.name || row?.label || row?.leagueName || "").trim();
}

function countryOf(row) {
  return String(row?.country || row?.countryCode || "").trim();
}

function tierOf(row) {
  const value = row?.tier ?? row?.coverageTier ?? null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}
function providerIdOf(value) {
  if (!value) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "object") {
    return String(value.id || value.providerId || value.name || "").trim() || null;
  }
  return null;
}

function uniqueNonEmpty(values) {
  return [...new Set(values.map(providerIdOf).filter(Boolean))];
}

function providerIdsFromPlan(plan) {
  if (!plan || typeof plan !== "object") return [];

  const ids = [];

  if (Array.isArray(plan.providers)) ids.push(...plan.providers);
  if (Array.isArray(plan.supported)) ids.push(...plan.supported);
  if (Array.isArray(plan.adapters)) ids.push(...plan.adapters);
  if (Array.isArray(plan.fallbacks)) ids.push(...plan.fallbacks);
  if (Array.isArray(plan.secondary)) ids.push(...plan.secondary);

  if (plan.primary) ids.push(plan.primary);
  if (plan.secondary && !Array.isArray(plan.secondary)) ids.push(plan.secondary);

  return uniqueNonEmpty(ids);
}

function providerCapabilityRowsFromPlan(plan) {
  return providerIdsFromPlan(plan).map((id) => ({ id }));
}

function inferPriority(row, plan, capability) {
  const slug = slugOf(row);
  const tier = tierOf(row);
  const country = countryOf(row);

  const isUefa = slug.startsWith("uefa.");
  const isConmebol = slug.startsWith("conmebol.");
  const isAfc = slug.startsWith("afc.");
  const isMajorTopTier = tier === 1 && [
    "england",
    "spain",
    "italy",
    "germany",
    "france",
    "netherlands",
    "portugal",
    "belgium",
    "scotland",
    "greece",
    "cyprus",
    "turkey",
    "brazil",
    "argentina",
    "usa",
    "japan",
    "saudi_arabia"
  ].includes(country);

  const hasOnlySupplementalFeed =
    (capability.hasSupplementalScoreboardCapability === true || capability.hasEspnCapability === true) &&
    capability.hasVerifiedFixtureProviderCapability !== true &&
    capability.hasValueReadyVerifiedProvider !== true &&
    capability.hasValueReadyNonEspnProvider !== true;

  if (
    capability.hasVerifiedFixtureProviderCapability === true ||
    capability.hasValueReadyVerifiedProvider === true ||
    capability.hasValueReadyNonEspnProvider === true
  ) {
    return {
      priority: 0,
      bucket: "already_value_ready_verified_provider",
      recommendedProvider: null,
      reason: "already has explicit verified fixture provider capability"
    };
  }

  if (isUefa || isConmebol || isAfc) {
    return {
      priority: 1,
      bucket: "official_competition_source_first",
      recommendedProvider: "official_league_source",
      reason: "continental competition should be prioritized for official structured/reviewed source capability"
    };
  }

  if (isMajorTopTier) {
    return {
      priority: 2,
      bucket: "major_top_tier_official_source_first",
      recommendedProvider: "official_league_source",
      reason: "major/top-tier league should be prioritized for official or verified league source capability"
    };
  }

  if (hasOnlySupplementalFeed) {
    return {
      priority: 3,
      bucket: "supplemental_feed_needs_verified_source",
      recommendedProvider: "manual_verified_import",
      reason: "current fixture substrate is supplemental-only; value needs explicit verified fixture source confirmation"
    };
  }

  return {
    priority: 4,
    bucket: "no_adapter_manual_verified_path",
    recommendedProvider: "manual_verified_import",
    reason: "no current value-ready provider route; start with manual verified import or add dedicated provider later"
  };
}

export function buildFixtureProviderCapabilityPriorityWorkset(options = {}) {
  const rows = normalizeRows(LEAGUES_COVERAGE);

  const worksetRows = rows
    .map((row) => {
      const leagueSlug = slugOf(row);
      if (!leagueSlug) return null;

      const plan = getFixtureProviderPlan(leagueSlug);
      const providerCapabilityRows = providerCapabilityRowsFromPlan(plan);
      const capability = summarizeFixtureProviderCapability(leagueSlug, providerCapabilityRows);

      const currentProviderIds = providerIdsFromPlan(plan);

      const priority = inferPriority(row, plan, capability);

      return {
        leagueSlug,
        name: nameOf(row),
        country: countryOf(row) || null,
        tier: tierOf(row),
        currentProviderIds,
        currentExecution: plan?.execution || "skip",
        hasSupplementalScoreboardCapability: capability.hasSupplementalScoreboardCapability === true || capability.hasEspnCapability === true,
        hasEspnCapability: capability.hasEspnCapability === true,
        hasVerifiedFixtureProviderCapability: capability.hasVerifiedFixtureProviderCapability === true || capability.hasValueReadyVerifiedProvider === true || capability.hasValueReadyNonEspnProvider === true,
        hasValueReadyVerifiedProvider: capability.hasValueReadyVerifiedProvider === true || capability.hasValueReadyNonEspnProvider === true,
        valueReadyVerifiedProviderIds: capability.valueReadyVerifiedProviderIds || capability.valueReadyNonEspnProviderIds || [],
        supplementalProviderIds: capability.supplementalProviderIds || [],
        priority: priority.priority,
        bucket: priority.bucket,
        recommendedProvider: priority.recommendedProvider,
        reason: priority.reason,
        canonicalWrites: 0,
        sourceFetch: false,
        productionWrite: false
      };
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.leagueSlug.localeCompare(b.leagueSlug);
    });

  const summary = {
    declaredLeagueCount: worksetRows.length,
    alreadyValueReadyVerifiedProvider: worksetRows.filter((row) => row.bucket === "already_value_ready_verified_provider").length,
    officialCompetitionSourceFirst: worksetRows.filter((row) => row.bucket === "official_competition_source_first").length,
    majorTopTierOfficialSourceFirst: worksetRows.filter((row) => row.bucket === "major_top_tier_official_source_first").length,
    supplementalFeedNeedsVerifiedSource: worksetRows.filter((row) => row.bucket === "supplemental_feed_needs_verified_source").length,
    noAdapterManualVerifiedPath: worksetRows.filter((row) => row.bucket === "no_adapter_manual_verified_path").length
  };

  const report = {
    ok: true,
    generatedAt: new Date().toISOString(),
    sourceFetch: false,
    canonicalWrites: 0,
    valueWrites: false,
    detailsWrites: false,
    productionWrite: false,
    summary,
    rows: worksetRows,
    grouped: {
      officialCompetitionSourceFirst: worksetRows.filter((row) => row.bucket === "official_competition_source_first"),
      majorTopTierOfficialSourceFirst: worksetRows.filter((row) => row.bucket === "major_top_tier_official_source_first"),
      supplementalFeedNeedsVerifiedSource: worksetRows.filter((row) => row.bucket === "supplemental_feed_needs_verified_source"),
      noAdapterManualVerifiedPath: worksetRows.filter((row) => row.bucket === "no_adapter_manual_verified_path"),
      alreadyValueReadyVerifiedProvider: worksetRows.filter((row) => row.bucket === "already_value_ready_verified_provider")
    }
  };

  const output = options.output || "data/football-truth/_diagnostics/fixture-provider-capabilities/fixture-provider-capability-priority-workset.json";
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + "\n", "utf8");

  return {
    ok: true,
    output,
    summary,
    guarantees: {
      sourceFetch: false,
      canonicalWrites: 0,
      valueWrites: false,
      detailsWrites: false,
      productionWrite: false
    }
  };
}

const entryUrl = process.argv[1] ? new URL(`file://${path.resolve(process.argv[1])}`).href : null;

if (entryUrl === import.meta.url) {
  const outputIndex = process.argv.indexOf("--output");
  const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
  const result = buildFixtureProviderCapabilityPriorityWorkset({ output });
  console.log(JSON.stringify(result, null, 2));
}