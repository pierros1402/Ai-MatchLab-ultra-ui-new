import { LEAGUE_SEEDS } from "../config.js";
import { fetchLeagueFixtures, fetchMatchSummary } from "../adapters/espn.js";
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

const NO_DRAW_COMPETITIONS = new Set([
  "jpn.1" // J-League 2026 special format
]);

function isNoDrawCompetition(slug) {
  return NO_DRAW_COMPETITIONS.has(slug);
}

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

    const pipelines = [
      {
        source: "espn",
        events: espnEvents,
        normalize: event => normalizeFixture(event, slug)
      },
      {
        source: "source2",
        events: source2Events,
        normalize: event => normalizeFixtureSource2(event, slug)
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
            source: normalized.source,
            matchId: normalized.matchId,
            homeTeam: normalized.homeTeam,
            awayTeam: normalized.awayTeam,
            kickoffUtc: normalized.kickoffUtc,
            reason: "wrong_day"
          });

          continue;
        }

        const existing = getFixtureById(normalized.matchId);
        const observations = getObservationsByMatchId(normalized.matchId);

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