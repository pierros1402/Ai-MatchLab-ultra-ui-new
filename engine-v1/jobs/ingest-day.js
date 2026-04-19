import { LEAGUE_SEEDS } from "../config.js";
import { fetchMatchSummary } from "../adapters/espn.js";
import { getFixtureAdapters } from "../adapters/registry.js";
import { reconcileObservations } from "../core/reconcile-observations.js";
import { buildValueDay } from "../core/build-value-day.js";
import { shiftDay } from "../core/daykey.js";
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

function emptyLeagueStats() {
  return {
    rawEventsEspn: 0,
    rawEventsApiFootball: 0,
    rawEventsSource2: 0,
    providerStats: {},
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
    providerStats: {},
    normalized: 0,

    inserted: 0,
    updated: 0,
    unchanged: 0,

    skippedWrongDay: 0,
    skippedNull: 0,
    observationsWritten: 0,

    byLeague: {}
  };

 
  for (const slug of LEAGUE_SEEDS) {
    results.leagues++;

    results.byLeague[slug] = emptyLeagueStats();

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

    const pipelines = [];

    for (const adapter of adapters) {
      let events = [];

      try {
        const data = await adapter.fetch({ slug, dayKey, env });
        events = Array.isArray(data) ? data : [];
      } catch (err) {
        console.error("[ingest] adapter fetch failed", {
          dayKey,
          slug,
          adapterId: adapter?.id || "unknown",
          error: String(err?.message || err)
        });
        events = [];
      }

      addRawEventsForAdapter(results, results.byLeague[slug], adapter.id, events.length);
      results.rawEvents += events.length;

      pipelines.push({
        source: adapter.id,
        sourceLabel: adapter.label || adapter.id,
        sourcePriority: Number(adapter.priority || 0),
        events,
        normalize: event => adapter.normalize(event, slug)
      });
    }

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