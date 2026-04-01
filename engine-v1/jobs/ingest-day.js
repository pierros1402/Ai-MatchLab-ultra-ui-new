import { LEAGUE_SEEDS } from "../config.js";
import { fetchLeagueFixtures } from "../adapters/espn.js";
import { fetchLeagueFixturesSource2 } from "../adapters/source2.js";
import { normalizeFixture } from "../core/normalize.js";
import { normalizeFixtureSource2 } from "../core/normalize-source2.js";
import { reconcileObservations } from "../core/reconcile-observations.js";
import {
  getFixtureById,
  upsertFixtureWithMeta
} from "../storage/json-db.js";
import { appendSkipped } from "../storage/skipped-log.js";
import {
  appendObservation,
  getObservationsByMatchId
} from "../storage/observations-db.js";

function emptyLeagueStats() {
  return {
    rawEventsEspn: 0,
    rawEventsSource2: 0,
    normalized: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    skippedWrongDay: 0,
    skippedNull: 0,
    observationsWritten: 0
  };
}

export async function ingestDay(dayKey, env) {
  const results = {
    dayKey,
    leagues: 0,
    rawEvents: 0,
    rawEventsEspn: 0,
    rawEventsSource2: 0,
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

    const espnData = await fetchLeagueFixtures(slug, dayKey);
    const source2Data = await fetchLeagueFixturesSource2(slug, dayKey);

    const espnEvents = Array.isArray(espnData?.events) ? espnData.events : [];
    const source2Events = Array.isArray(source2Data?.events) ? source2Data.events : [];

    results.rawEventsEspn += espnEvents.length;
    results.rawEventsSource2 += source2Events.length;
    results.rawEvents += espnEvents.length + source2Events.length;

    results.byLeague[slug] = emptyLeagueStats();
    results.byLeague[slug].rawEventsEspn = espnEvents.length;
    results.byLeague[slug].rawEventsSource2 = source2Events.length;

    // ------------------------------------------------------------
    // PROCESS BOTH SOURCES THROUGH SAME PIPELINE
    // ------------------------------------------------------------
    const pipelines = [
      {
        source: "espn",
        events: espnEvents,
        normalize: (event) => normalizeFixture(event, slug)
      },
      {
        source: "source2",
        events: source2Events,
        normalize: (event) => normalizeFixtureSource2(event, slug)
      }
    ];

    for (const pipe of pipelines) {
      for (const event of pipe.events) {
        const normalized = pipe.normalize(event);

        if (!normalized) {
          results.skippedNull++;
          results.byLeague[slug].skippedNull++;
          continue;
        }

        results.normalized++;
        results.byLeague[slug].normalized++;

        // ---------------------------------
        // ALWAYS WRITE OBSERVATION
        // ---------------------------------
        appendObservation({
          ts: Date.now(),
          requestedDay: dayKey,
          actualDay: normalized.dayKey,
          source: normalized.source,
          sourceId: normalized.sourceId,
          matchId: normalized.matchId,
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
          venue: normalized.venue
        });

        results.observationsWritten++;
        results.byLeague[slug].observationsWritten++;

        // ---------------------------------
        // WRONG DAY FILTER
        // ---------------------------------
        if (normalized.dayKey !== dayKey) {
          results.skippedWrongDay++;
          results.byLeague[slug].skippedWrongDay++;

          appendSkipped({
            ts: Date.now(),
            requestedDay: dayKey,
            actualDay: normalized.dayKey,
            league: slug,
            source: normalized.source,
            matchId: normalized.matchId,
            homeTeam: normalized.homeTeam,
            awayTeam: normalized.awayTeam,
            kickoffUtc: normalized.kickoffUtc,
            reason: "wrong_day"
          });

          continue;
        }

        // ---------------------------------
        // MULTI-SOURCE RECONCILE + UPSERT
        // ---------------------------------
        const existing = getFixtureById(normalized.matchId);

        const observations =
          getObservationsByMatchId(normalized.matchId);

        const merged = await reconcileObservations({
          env,
          observations,
          existing
        });

        if (!merged) {
          continue;
        }

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

  return results;
}