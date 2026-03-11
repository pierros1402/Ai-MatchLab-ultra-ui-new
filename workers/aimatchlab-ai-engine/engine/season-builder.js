import { buildStandingsFromR2 } from "./standings-builder.js";
import { updateStandingsCache } from "./standings-cache.js";

const WINDOW_DAYS = 30;
const MAX_WINDOWS_PER_RUN = 3;
const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";

// ------------------------------------------------------------
// R2 READ CACHE (per execution)
// ------------------------------------------------------------
const __matchReadCache = new Map();

export async function buildSeason(env, league, season) {

  const statePrefix = `league/${league}/${season}/`;
  const metaKey = `${statePrefix}meta.json`;
  // force meta refresh even when season already built

  // ------------------------------------------------------------
  // LOAD EXISTING META
  // ------------------------------------------------------------
  let meta = {};

  try {
    const existingMeta = await env.AI_STATE.get(metaKey);
    if (existingMeta) {
      meta = JSON.parse(await existingMeta.text());
    }
  } catch {
    console.log("meta load failed, creating new");
  }

  if (!meta || !meta.season) {
    meta = {
      season,
      league,
      nextFrom: seasonStart(season),
      leagueVersion: 0
    };
  }

  const seasonEndDate = seasonEnd(season);

  let windowsRun = 0;
  let totalMatchesProcessed = 0;

  while (windowsRun < MAX_WINDOWS_PER_RUN) {

if (meta.nextFrom > seasonEndDate) {

  const tableKey = `${statePrefix}table.json`;
  const exists = await env.AI_STATE.get(tableKey);

  if (!exists) {

    console.log("[AI BUILD] season complete — building standings cache");

    try {

      const result = await buildStandingsFromR2(env, league, season);

      if (result && Array.isArray(result.standings)) {
        await env.AI_STATE.put(
          tableKey,
          JSON.stringify(result.standings),
          { httpMetadata: { contentType: "application/json" } }
        );
      }

    } catch (e) {
      console.log("[AI BUILD] standings rebuild failed", e);
    }

  }

  break;
}

    // ------------------------------------------------------------
    // AUTO SAFETY REWIND (15 DAYS)
    // ------------------------------------------------------------
    const REWIND_DAYS = 15;

    // base progress window starts at meta.nextFrom
    const baseFrom = meta.nextFrom;
    const baseEnd = addDays(baseFrom, WINDOW_DAYS - 1);

    // rewind window starts earlier, but ends at baseEnd
    let effectiveFrom = addDays(baseFrom, -REWIND_DAYS);

    // never go before season start
    const seasonStartDate = seasonStart(season);
    if (effectiveFrom < seasonStartDate) effectiveFrom = seasonStartDate;

    const from = effectiveFrom;
    const end = baseEnd;

    console.log(
      `[AI BUILD] ${league} window ${from} → ${end} (cursor ${meta.nextFrom})`
    );

    const fetchResult = await fetchMatchesForWindow(league, from, end);
    if (!fetchResult.ok) break;

    const matches = fetchResult.matches || [];

    for (const event of matches) {

      const comp = event.competitions?.[0];
      if (!comp) continue;

      const competitors = comp.competitors || [];

      let home = competitors.find(c => c.homeAway === "home");
      let away = competitors.find(c => c.homeAway === "away");

      if (!home && competitors.length >= 2) home = competitors[0];
      if (!away && competitors.length >= 2) away = competitors[1];

      if (!home || !away) continue;

      const match = {
        id: event.id,
        league,
        season,

        date: event.date,

        home: home.team?.displayName || home.team?.name,
        away: away.team?.displayName || away.team?.name,

        scoreHome: Number(home.score || 0),
        scoreAway: Number(away.score || 0),

        status:
          comp.status?.type?.name ||
          event.status?.type?.name ||
          "UNKNOWN",

        minute:
          comp.status?.displayClock ||
          event.status?.displayClock ||
          null
      };

      const key = `${statePrefix}matches/${match.id}.json`;
      const serialized = JSON.stringify(match);
      const statusName =
        match?.competitions?.[0]?.status?.type?.name ||
        match?.status?.type?.name ||
        match?.status;
      const isPostponed =
        typeof statusName === "string" &&
        (
          statusName.includes("POSTPONED") ||
          statusName.includes("CANCELED") ||
          statusName.includes("SUSPENDED")
        );

      if (isPostponed) {
        continue;
      }
      const isFinal =
        typeof statusName === "string" &&
        (
          statusName.includes("FINAL") ||
          statusName.includes("FULL_TIME") ||
          statusName.includes("COMPLETE") ||
          statusName.includes("AET") ||
          statusName.includes("PEN")
        );
      // ------------------------------------------------------------
      // R2 READ CACHE
      // ------------------------------------------------------------
      let existing = __matchReadCache.get(key);

      if (!existing) {
        const obj = await env.AI_STATE.get(key);
        if (obj) {
          existing = await obj.text();
          __matchReadCache.set(key, existing);
        }
      }

      // write only if changed
      if (!existing || existing !== serialized || !isFinal) {

        await env.AI_STATE.put(key, serialized);
        __matchReadCache.set(key, serialized);

      try {
        //await updateStandingsCache(env, league, season, match);
      } catch (e) {
        console.log("standings cache fail", e);
      }

  // ------------------------------------------------------------
  // MATCH INDEX (write only when match updated)
  // ------------------------------------------------------------
      const indexKey = `match-index/${match.id}.json`;

      const indexObj = {
        league,
        season,
        updatedAt: Date.now()
      };

      await env.AI_STATE.put(indexKey, JSON.stringify(indexObj));
      }

      }   // <-- ΚΛΕΙΝΕΙ το for (const event of matches)     

      // ------------------------------------------------------------
      // MATCH INDEX (required for Match Intel)
      // ------------------------------------------------------------

    totalMatchesProcessed += matches.length;

    // advance cursor FORWARD (no rewind here)
    meta.nextFrom = addDays(end, 1);

    windowsRun++;
  }


// ------------------------------------------------------------
// WRITE SEASON META (WITH COMPLETION DATA)
// ------------------------------------------------------------


const newMeta = {
  season,
  league,
  nextFrom: meta.nextFrom,
  leagueVersion: meta.leagueVersion || 0,
  rankingHash: meta.rankingHash || null,
  totalMatches: (meta.totalMatches || 0) + totalMatchesProcessed,
  updatedAt: Date.now()
};

await env.AI_STATE.put(
  metaKey,
  JSON.stringify(newMeta),
  {
    httpMetadata: { contentType: "application/json" }
  }
);

  return {
    ok: true,
    league,
    season,
    windowsRun,
    totalMatchesProcessed,
    nextFrom: meta.nextFrom,
    leagueVersion: meta.leagueVersion
  };
}

// ------------------------------------------------------------
// FETCH HELPERS
// ------------------------------------------------------------
async function fetchMatchesForWindow(league, from, end) {
  try {
    const url = `${ESPN_BASE}/${league}/scoreboard?dates=${from}-${end}`;
    const res = await fetch(url);
    const data = await res.json();

    return {
      ok: true,
      matches: data?.events || []
    };
  } catch (e) {
    console.log("fetch failed", e);
    return { ok: false, matches: [] };
  }
}

// ------------------------------------------------------------
// DATE HELPERS
// ------------------------------------------------------------
function addDays(ymd, days) {
  const d = new Date(
    ymd.slice(0, 4),
    Number(ymd.slice(4, 6)) - 1,
    ymd.slice(6, 8)
  );
  d.setDate(d.getDate() + days);

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");

  return `${y}${m}${day}`;
}

function seasonStart(season) {
  return season.split("-")[0] + "0701";
}

function seasonEnd(season) {
  return season.split("-")[1] + "0630";
}
// ============================================================
// SEASON COMPLETION ANALYZER (STABLE v2)
// ============================================================

export async function analyzeSeasonCompletion(env, league, season) {

  const prefix = `league/${league}/${season}/matches/`;

  let cursor;
  let stored = 0;

  // ------------------------------------------------------------
  // COUNT STORED MATCHES
  // ------------------------------------------------------------
  do {
    const list = await env.AI_STATE.list({ prefix, cursor });

    stored += list.objects.length;
    cursor = list.truncated ? list.cursor : undefined;

  } while (cursor);

  // ------------------------------------------------------------
  // LOAD META (ONCE)
  // ------------------------------------------------------------
  let meta = null;
  let expected = null;
  let lastUpdate = null;

  try {
    const metaObj = await env.AI_STATE.get(
      `league/${league}/${season}/meta.json`
    );

    if (metaObj) {
      meta = JSON.parse(await metaObj.text());
      expected = meta.totalMatches ?? null;
      lastUpdate = meta.updatedAt ?? null;
    }
  } catch (_) {}

  // ------------------------------------------------------------
  // STATE + COVERAGE
  // ------------------------------------------------------------
  let state = "BUILDING";
  let coverage = null;

  const seasonEnd = season.split("-")[1] + "0630";

  if (meta?.nextFrom && meta.nextFrom > seasonEnd) {
    state = "COMPLETE";
    coverage = 100;
    expected = stored; // deterministic
  } else if (expected && expected > 0) {
    coverage = Math.round((stored / expected) * 100);
  }

  return {
    league,
    season,
    state,
    storedMatches: stored,
    expectedMatches: expected,
    coverage,
    lastUpdate
  };
}