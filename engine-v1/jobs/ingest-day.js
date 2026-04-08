import { LEAGUE_SEEDS } from "../config.js";
import { fetchLeagueFixtures } from "../adapters/espn.js";
import { fetchLeagueFixturesSource2 } from "../adapters/source2.js";
import { normalizeFixture } from "../core/normalize.js";
import { normalizeFixtureSource2 } from "../core/normalize-source2.js";
import { reconcileObservations } from "../core/reconcile-observations.js";
import { buildValueDay } from "../core/build-value-day.js";
import { shiftDay } from "../core/daykey.js";
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

const ESPN_SUPPORTED = new Set([
  // ENGLAND
  "eng.1",
  "eng.2",
  "eng.3",
  "eng.4",
  "eng.5",
  "eng.fa",
  "eng.league_cup",
  "eng.trophy",

  // GERMANY
  "ger.1",
  "ger.2",
  "ger.dfb_pokal",

  // SPAIN
  "esp.1",
  "esp.2",
  "esp.copa_del_rey",
  "esp.super_cup",

  // ITALY
  "ita.1",
  "ita.2",
  "ita.coppa_italia",

  // FRANCE
  "fra.1",
  "fra.2",
  "fra.coupe_de_france",
  "fra.super_cup",

  // NETHERLANDS
  "ned.1",
  "ned.2",
  "ned.cup",

  // PORTUGAL / BELGIUM
  "por.1",
  "bel.1",

  // SCOTLAND
  "sco.1",
  "sco.2",
  "sco.challenge",
  "sco.tennents",

  // GREECE / CYPRUS / TURKEY / SWITZERLAND / AUSTRIA / DENMARK / SWEDEN / NORWAY
  "gre.1",
  "cyp.1",
  "tur.1",
  "sui.1",
  "aut.1",
  "den.1",
  "swe.1",
  "nor.1",

  // UEFA
  "uefa.champions",
  "uefa.europa",
  "uefa.europa.conf",

  // AFC / CAF / CONMEBOL
  "afc.champions",
  "afc.cup",
  "caf.champions",
  "caf.confed",
  "caf.nations",
  "conmebol.libertadores",

  // AMERICAS
  "usa.1",
  "arg.1",
  "bra.1",
  "mex.1",
  "uru.1",
  "col.1",
  "chi.1",
  "per.1",

  // ASIA / AFRICA (μόνο όσα ήδη φαίνονται να δουλεύουν)
  "jpn.1",
  "ksa.1",
  "rsa.1"
]);
  for (const slug of LEAGUE_SEEDS) {
    results.leagues++;

    let espnEvents = [];
    let source2Events = [];

    if (ESPN_SUPPORTED.has(slug)) {
      const espnData = await fetchLeagueFixtures(slug, dayKey);
      espnEvents = Array.isArray(espnData?.events) ? espnData.events : [];
    }

    const source2Data = await fetchLeagueFixturesSource2(slug, dayKey);
    source2Events = Array.isArray(source2Data?.events) ? source2Data.events : [];

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
// WRONG DAY FILTER (FIXED)
// ---------------------------------
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

// KEEP LIVE ALWAYS
if (!isLive && !allowedDays.has(normalized.dayKey)) {
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