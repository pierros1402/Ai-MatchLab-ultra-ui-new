import fs from "fs";
import { LEAGUE_SEEDS } from "../config.js";
import { fetchMatchSummary } from "../adapters/espn.js";
import { getFixtureAdapters, getFixtureProviderPlan } from "../adapters/registry.js";
import { reconcileObservations } from "../core/reconcile-observations.js";
import { buildValueDay } from "../core/build-value-day.js";
import { shiftDay } from "../core/daykey.js";
import { resolveDataPath } from "../storage/data-root.js";
import {
  getFixtureById,
  getFixtureByMatchKey,
  upsertFixtureWithMeta
} from "../storage/json-db.js";
import { appendSkipped } from "../storage/skipped-log.js";
import {
  appendObservation,
  getObservationsByMatchId,
  getObservationsByMatchKey
} from "../storage/observations-db.js";

const NO_DRAW_COMPETITIONS = new Set([
  "jpn.1" // J-League 2026 special format
]);

function isNoDrawCompetition(slug) {
  return NO_DRAW_COMPETITIONS.has(slug);
}

function readActiveLeaguesForDay(dayKey) {
  try {
    const activePath = resolveDataPath("active-leagues.json");

    if (!fs.existsSync(activePath)) {
      return new Set();
    }

    const raw = JSON.parse(fs.readFileSync(activePath, "utf8"));

    if (!raw || raw.dayKey !== dayKey || !Array.isArray(raw.leagues)) {
      return new Set();
    }

    return new Set(
      raw.leagues
        .filter(x => Number(x?.matchCount || 0) > 0)
        .map(x => String(x?.slug || "").trim())
        .filter(Boolean)
    );
  } catch {
    return new Set();
  }
}

function shouldAllowEmptyFallbackForLeague(activeLeagueSet, slug) {
  return activeLeagueSet.has(String(slug || "").trim());
}

function shouldSkipPrimaryOnlyLeague(providerPlan, slug, activeLeagueSet) {
  const execution = String(providerPlan?.execution || "").trim();
  const primaryId = String(providerPlan?.primary?.id || "").trim();

  if (execution !== "primary_only") {
    return false;
  }

  if (primaryId !== "api_football") {
    return false;
  }

  return !activeLeagueSet.has(String(slug || "").trim());
}

function emptyLeagueStats() {
  return {
    rawEventsEspn: 0,
    rawEventsApiFootball: 0,
    rawEventsSource2: 0,
    providerStats: buildProviderStatsSkeleton(),
    normalized: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    skippedWrongDay: 0,
    skippedNull: 0,
    observationsWritten: 0
  };
}

function addRawEventsForAdapter(results, leagueStats, adapterId, count) {
  const n = Number(count || 0);
  const key = String(adapterId || "").trim() || "unknown";

  const resultBucket = ensureProviderStatsBucket(results, key);
  const leagueBucket = ensureProviderStatsBucket(leagueStats, key);

  resultBucket.rawEvents += n;
  leagueBucket.rawEvents += n;

  if (key === "espn") {
    results.rawEventsEspn += n;
    leagueStats.rawEventsEspn += n;
    return;
  }

  if (key === "api_football" || key === "source2") {
    results.rawEventsApiFootball += n;
    leagueStats.rawEventsApiFootball += n;

    results.rawEventsSource2 += n;
    leagueStats.rawEventsSource2 += n;
    return;
  }
}

function ensureProviderStatsBucket(target, adapterId) {
  const key = String(adapterId || "").trim() || "unknown";

  if (!target.providerStats) {
    target.providerStats = {};
  }

  if (!target.providerStats[key]) {
    target.providerStats[key] = {
      rawEvents: 0
    };
  }

  return target.providerStats[key];
}

function buildProviderStatsSkeleton() {
  const stats = {};

  for (const adapter of getFixtureAdapters()) {
    const key = String(adapter?.id || "").trim();
    if (!key) continue;

    stats[key] = {
      rawEvents: 0
    };
  }

  return stats;
}

function selectAdaptersForPlan(adapters, providerPlan) {
  const execution = String(providerPlan?.execution || "").trim();

  if (execution === "skip") {
    return {
      primary: null,
      fallbacks: [],
      execution
    };
  }

  const primaryId = String(providerPlan?.primary?.id || "").trim();
  const fallbackIds = Array.isArray(providerPlan?.fallbacks)
    ? providerPlan.fallbacks.map(x => String(x?.id || "").trim()).filter(Boolean)
    : [];

  const primary =
    adapters.find(adapter => String(adapter?.id || "").trim() === primaryId) || null;

  const fallbacks = adapters.filter(adapter =>
    fallbackIds.includes(String(adapter?.id || "").trim())
  );

  return {
    primary,
    fallbacks,
    execution
  };
}

async function fetchAdapterEventsSafe(adapter, { slug, dayKey, env }) {
  try {
    const data = await adapter.fetch({ slug, dayKey, env });
    return {
      ok: true,
      adapterId: adapter?.id || "unknown",
      events: Array.isArray(data) ? data : [],
      error: null
    };
  } catch (err) {
    console.error("[ingest] adapter fetch failed", {
      dayKey,
      slug,
      adapterId: adapter?.id || "unknown",
      error: String(err?.message || err)
    });

    return {
      ok: false,
      adapterId: adapter?.id || "unknown",
      events: [],
      error: err
    };
  }
}

function shouldEscalateToFallback({
  providerPlan,
  primaryFetchResult,
  slug,
  activeLeagueSet
}) {
  const execution = String(providerPlan?.execution || "").trim();

  if (execution !== "primary_then_conditional_fallback") {
    return false;
  }

  const fallbackPolicy = providerPlan?.fallbackPolicy || {};
  const triggerOnPrimaryError = fallbackPolicy?.triggerOnPrimaryError !== false;
  const triggerOnPrimaryEmpty = fallbackPolicy?.triggerOnPrimaryEmpty !== false;

  if (!primaryFetchResult) {
    return true;
  }

  if (!primaryFetchResult.ok && triggerOnPrimaryError) {
    return true;
  }

  if (
    primaryFetchResult.ok &&
    Number(primaryFetchResult.events?.length || 0) === 0 &&
    triggerOnPrimaryEmpty
  ) {
    return shouldAllowEmptyFallbackForLeague(activeLeagueSet, slug);
  }

  return false;
}

async function buildPipelinesForLeague({
  adapters,
  providerPlan,
  slug,
  dayKey,
  env,
  results,
  leagueStats,
  activeLeagueSet
}) {
  const selection = selectAdaptersForPlan(adapters, providerPlan);
  const pipelines = [];

  if (selection.execution === "skip") {
    return pipelines;
  }

  if (shouldSkipPrimaryOnlyLeague(providerPlan, slug, activeLeagueSet)) {
    return pipelines;
  }

  const primary = selection.primary;

  if (primary) {
    leagueStats.providerExecution.selectedProviders.push(primary.id);

    const primaryFetchResult = await fetchAdapterEventsSafe(primary, {
      slug,
      dayKey,
      env
    });

    addRawEventsForAdapter(
      results,
      leagueStats,
      primary.id,
      primaryFetchResult.events.length
    );
    results.rawEvents += primaryFetchResult.events.length;

    pipelines.push({
      source: primary.id,
      sourceLabel: primary.label || primary.id,
      sourcePriority: Number(primary.priority || 0),
      events: primaryFetchResult.events,
      normalize: event => primary.normalize(event, slug)
    });

    if (
      shouldEscalateToFallback({
        providerPlan,
        primaryFetchResult,
        slug,
        activeLeagueSet
      })
    ) {
      for (const fallback of selection.fallbacks) {
        leagueStats.providerExecution.selectedProviders.push(fallback.id);

        const fallbackFetchResult = await fetchAdapterEventsSafe(fallback, {
          slug,
          dayKey,
          env
        });

        addRawEventsForAdapter(
          results,
          leagueStats,
          fallback.id,
          fallbackFetchResult.events.length
        );
        results.rawEvents += fallbackFetchResult.events.length;

        pipelines.push({
          source: fallback.id,
          sourceLabel: fallback.label || fallback.id,
          sourcePriority: Number(fallback.priority || 0),
          events: fallbackFetchResult.events,
          normalize: event => fallback.normalize(event, slug)
        });
      }
    }

    return pipelines;
  }

  for (const fallback of selection.fallbacks) {
    leagueStats.providerExecution.selectedProviders.push(fallback.id);

    const fallbackFetchResult = await fetchAdapterEventsSafe(fallback, {
      slug,
      dayKey,
      env
    });

    addRawEventsForAdapter(
      results,
      leagueStats,
      fallback.id,
      fallbackFetchResult.events.length
    );
    results.rawEvents += fallbackFetchResult.events.length;

    pipelines.push({
      source: fallback.id,
      sourceLabel: fallback.label || fallback.id,
      sourcePriority: Number(fallback.priority || 0),
      events: fallbackFetchResult.events,
      normalize: event => fallback.normalize(event, slug)
    });
  }

  return pipelines;
}

function isTerminalStatus(status) {
  const s = String(status || "").toUpperCase();

  return (
    s === "FT" ||
    s.includes("FINAL") ||
    s.includes("FULL_TIME") ||
    s.includes("AET") ||
    s.includes("PEN")
  );
}

function isEligibleForSummaryEnrichment(row) {
  if (!row) return false;
  if (!row.matchId || !row.leagueSlug) return false;

  const status = String(row.status || "").toUpperCase();

  if (!isTerminalStatus(status)) return false;

  // already enriched
  if (row.penalties?.home != null && row.penalties?.away != null) return false;
  if (String(row.decidedBy || "").toLowerCase() === "pens") return false;

  const home = Number(row.scoreHome);
  const away = Number(row.scoreAway);

  if (!Number.isFinite(home) || !Number.isFinite(away)) return false;

  const isDraw = home === away;

  // 🔴 CASE 1 — NO DRAW COMPETITION (MANDATORY PENALTIES)
  if (isNoDrawCompetition(row.leagueSlug)) {
    return isDraw;
  }

  // 🔴 CASE 2 — NORMAL COMPETITIONS (OPTIONAL PENALTIES)
  // εδώ μπορείς αργότερα να βάλεις cup logic

  return false;
}

async function enrichMergedFixtureFromSummary(merged) {
  if (!isEligibleForSummaryEnrichment(merged)) {
    return merged;
  }

  const summary = await fetchMatchSummary(
    merged.leagueSlug,
    merged.matchId
  );

  if (!summary?.ok) {
    return merged;
  }

  if (!summary.penalties && !summary.decidedBy) {
    return merged;
  }

  return {
    ...merged,
    penalties: summary.penalties || merged.penalties || null,
    decidedBy: summary.decidedBy || merged.decidedBy || null,
    updatedAt: Date.now()
  };
}

export async function ingestDay(dayKey, env) {
  const results = {
    dayKey,
    leagues: 0,
    rawEvents: 0,
    rawEventsEspn: 0,
    rawEventsApiFootball: 0,
    rawEventsSource2: 0,
    providerStats: buildProviderStatsSkeleton(),
    normalized: 0,

    inserted: 0,
    updated: 0,
    unchanged: 0,

    skippedWrongDay: 0,
    skippedNull: 0,
    observationsWritten: 0,

    byLeague: {},
    providerPlans: {}
  };
  const activeLeagueSet = readActiveLeaguesForDay(dayKey); 
  for (const slug of LEAGUE_SEEDS) {
    results.leagues++;

    results.byLeague[slug] = emptyLeagueStats();

    const providerPlan = getFixtureProviderPlan(slug);
    results.providerPlans[slug] = providerPlan;
    results.byLeague[slug].providerPlan = providerPlan;
    results.byLeague[slug].providerExecution = {
      mode: providerPlan?.mode || "none",
      execution: providerPlan?.execution || "skip",
      selectedProviders: []
    };

    const adapters = getFixtureAdapters().filter(adapter => {
      try {
        return adapter.isEnabled() && adapter.supportsLeague(slug);
      } catch (err) {
        console.error("[ingest] adapter capability check failed", {
          dayKey,
          slug,
          adapterId: adapter?.id || "unknown",
          error: String(err?.message || err)
        });
        return false;
      }
    });

    const pipelines = await buildPipelinesForLeague({
      adapters,
      providerPlan,
      slug,
      dayKey,
      env,
      results,
      leagueStats: results.byLeague[slug],
      activeLeagueSet
    });

    for (const pipe of pipelines) {
      for (const event of pipe.events) {
        let normalized = null;

        try {
          normalized = pipe.normalize(event);
        } catch (err) {
          console.error("[ingest] normalize failed", {
            dayKey,
            slug,
            source: pipe.source,
            error: String(err?.message || err)
          });
          normalized = null;
        }

        if (!normalized) {
          results.skippedNull++;
          results.byLeague[slug].skippedNull++;
          continue;
        }

        results.normalized++;
        results.byLeague[slug].normalized++;

        appendObservation({
          ts: Date.now(),
          requestedDay: dayKey,
          actualDay: normalized.dayKey,
          source: pipe.source || normalized.source,
          sourceLabel: pipe.sourceLabel || pipe.source || normalized.source,
          sourcePriority: Number(pipe.sourcePriority || 0),
          sourceId: normalized.sourceId,
          sourceMatchId: normalized.sourceMatchId || normalized.sourceId || normalized.matchId,
          matchId: normalized.matchId,
          matchKey: normalized.matchKey,
          leagueSlug: normalized.leagueSlug,
          leagueName: normalized.leagueName,
          homeTeam: normalized.homeTeam,
          awayTeam: normalized.awayTeam,
          kickoffUtc: normalized.kickoffUtc,
          rawStatus: normalized.rawStatus,
          status: normalized.status,
          minute: normalized.minute,
          scoreHome: normalized.scoreHome,
          scoreAway: normalized.scoreAway,
          penalties: normalized.penalties || null,
          decidedBy: normalized.decidedBy || null,
          venue: normalized.venue
        });

        results.observationsWritten++;
        results.byLeague[slug].observationsWritten++;

        const allowedDays = new Set([
          dayKey,
          shiftDay(dayKey, -1),
          shiftDay(dayKey, +1)
        ]);

        const status = String(normalized?.status || "").toUpperCase();

        const isLive =
          status.includes("LIVE") ||
          status.includes("IN_PROGRESS") ||
          status.includes("FIRST_HALF") ||
          status.includes("SECOND_HALF") ||
          status.includes("HALF_TIME") ||
          status.includes("EXTRA_TIME");

        if (!isLive && !allowedDays.has(normalized.dayKey)) {
          results.skippedWrongDay++;
          results.byLeague[slug].skippedWrongDay++;

          appendSkipped({
            ts: Date.now(),
            requestedDay: dayKey,
            actualDay: normalized.dayKey,
            league: slug,
            source: pipe.source || normalized.source,
            matchId: normalized.matchId,
            homeTeam: normalized.homeTeam,
            awayTeam: normalized.awayTeam,
            kickoffUtc: normalized.kickoffUtc,
            reason: "wrong_day"
          });

          continue;
        }

        const existing =
          getFixtureByMatchKey(normalized.matchKey) ||
          getFixtureById(normalized.matchId);

        const observations = normalized.matchKey
          ? getObservationsByMatchKey(normalized.matchKey)
          : getObservationsByMatchId(normalized.matchId);

        let merged = await reconcileObservations({
          env,
          observations,
          existing
        });

        if (!merged) {
          continue;
        }

        merged = await enrichMergedFixtureFromSummary(merged);

        const action = upsertFixtureWithMeta(merged);

        if (action === "inserted") {
          results.inserted++;
          results.byLeague[slug].inserted++;
        } else if (action === "updated") {
          results.updated++;
          results.byLeague[slug].updated++;
        } else {
          results.unchanged++;
          results.byLeague[slug].unchanged++;
        }
      }
    }
  }

  try {
    const hasRealChanges =
      results.inserted > 0 ||
      results.updated > 0;

    if (hasRealChanges) {
      console.log("[ingest] auto value build:start", { dayKey });

      await buildValueDay(dayKey, { rebuild: true, env });

      console.log("[ingest] auto value build:done", { dayKey });
    } else {
      console.log("[ingest] auto value skipped:no changes", { dayKey });
    }
  } catch (err) {
    console.error("[ingest] auto value build FAILED", err);
  }

  return results;
}