import fs from "fs";
import path from "path";
import { fetchLeagueFixtures } from "../adapters/espn.js";
import { normalizeFixture } from "../core/normalize.js";
import { reconcileFixture } from "../core/reconcile.js";
import {
  getFixtureById,
  upsertFixtureWithMeta
} from "../storage/json-db.js";
import { appendObservation } from "../storage/observations-db.js";
import { appendSkipped } from "../storage/skipped-log.js";
import { athensDayKey } from "../core/daykey.js";

const dataDir = path.resolve("data");
const activePath = path.join(dataDir, "active-leagues.json");

function readActiveLeagues() {
  if (!fs.existsSync(activePath)) {
    return null;
  }

  return JSON.parse(fs.readFileSync(activePath, "utf8"));
}

export async function monitorActiveLeagues(dayKey = athensDayKey()) {
  const active = readActiveLeagues();

  if (!active || !Array.isArray(active.leagues)) {
    return {
      ok: false,
      reason: "no_active_leagues_file",
      dayKey
    };
  }

  if (active.dayKey !== dayKey) {
    return {
      ok: false,
      reason: "active_leagues_day_mismatch",
      requestedDay: dayKey,
      activeDay: active.dayKey
    };
  }

  const results = {
    ok: true,
    dayKey,
    leaguesMonitored: active.leagues.length,
    rawEvents: 0,
    normalized: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    skippedWrongDay: 0,
    skippedNull: 0,
    observationsWritten: 0,
    byLeague: {}
  };

  for (const league of active.leagues) {
    const slug = league.slug;

    const data = await fetchLeagueFixtures(slug, dayKey);
    const events = Array.isArray(data?.events) ? data.events : [];

    results.rawEvents += events.length;

    results.byLeague[slug] = {
      rawEvents: events.length,
      normalized: 0,
      inserted: 0,
      updated: 0,
      unchanged: 0,
      skippedWrongDay: 0,
      skippedNull: 0,
      observationsWritten: 0
    };

    for (const event of events) {
      const normalized = normalizeFixture(event, slug);

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
        scoreHome: normalized.scoreHome,
        scoreAway: normalized.scoreAway,
        venue: normalized.venue
      });

      results.observationsWritten++;
      results.byLeague[slug].observationsWritten++;

      if (normalized.dayKey !== dayKey) {
        results.skippedWrongDay++;
        results.byLeague[slug].skippedWrongDay++;

        appendSkipped({
          ts: Date.now(),
          requestedDay: dayKey,
          actualDay: normalized.dayKey,
          league: slug,
          matchId: normalized.matchId,
          homeTeam: normalized.homeTeam,
          awayTeam: normalized.awayTeam,
          kickoffUtc: normalized.kickoffUtc,
          reason: "wrong_day_monitor"
        });

        continue;
      }

      const existing = getFixtureById(normalized.matchId);
      const merged = reconcileFixture(existing, normalized);
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

  return results;
}