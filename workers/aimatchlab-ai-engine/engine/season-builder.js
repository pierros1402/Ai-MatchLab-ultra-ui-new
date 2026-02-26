import { buildStandingsFromR2 } from "./standings-builder.js";

const WINDOW_DAYS = 5;
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
      console.log("[AI BUILD] season complete — meta refresh only");
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

    for (const match of matches) {

      const key = `${statePrefix}matches/${match.id}.json`;
      const serialized = JSON.stringify(match);

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
      if (!existing || existing !== serialized) {
        await env.AI_STATE.put(key, serialized);
        __matchReadCache.set(key, serialized);
      }

      // ------------------------------------------------------------
      // MATCH INDEX (required for Match Intel)
      // ------------------------------------------------------------
      const indexKey = `match-index/${match.id}.json`;

      const indexObj = {
        league,
        season,
        updatedAt: Date.now()
      };

      await env.AI_STATE.put(indexKey, JSON.stringify(indexObj));
    }

    totalMatchesProcessed += matches.length;

    // advance cursor FORWARD (no rewind here)
    meta.nextFrom = addDays(end, 1);

    windowsRun++;
  }

  // ------------------------------------------------------------
  // BUILD STANDINGS
  // ------------------------------------------------------------
  let result = null;

  try {
    result = await buildStandingsFromR2(env, league, season);
  } catch (e) {
    console.log("standings build failed", e);
  }

  if (!result) {
    console.log("standings missing, continuing meta save");
}

  let rankingHash = null;
  if (result && typeof result === "object" && result.rankingHash) {
    rankingHash = result.rankingHash;
  }

// ------------------------------------------------------------
// WRITE SEASON META (WITH COMPLETION DATA)
// ------------------------------------------------------------



let previousMeta = {};

try {
  const existing = await env.AI_STATE.get(metaKey);
  if (existing) {
    previousMeta = JSON.parse(await existing.text());
  }
} catch (_) {}

// count stored season matches
let storedCount = 0;
let cursor;

do {
  const list = await env.AI_STATE.list({
    prefix: `${statePrefix}matches/`,
    cursor
  });

  storedCount += list.objects.length;
  cursor = list.truncated ? list.cursor : undefined;

} while (cursor);

previousMeta.totalMatches = storedCount;
previousMeta.updatedAt = Date.now();

const newMeta = previousMeta;

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
// SEASON COMPLETION ANALYZER
// ============================================================

export async function analyzeSeasonCompletion(env, league, season) {

  const prefix = `league/${league}/${season}/matches/`;

  let cursor;
  let stored = 0;

  // count stored matches in R2
  do {
    const list = await env.AI_STATE.list({
      prefix,
      cursor
    });

    stored += list.objects.length;
    cursor = list.truncated ? list.cursor : undefined;

  } while (cursor);

  // expected matches (from meta if exists)
  let expected = null;
  let lastUpdate = null;

  try {
    const metaObj = await env.AI_STATE.get(
      `league/${league}/${season}/meta.json`
    );

    if (metaObj) {
      const meta = JSON.parse(await metaObj.text());
      expected = meta.totalMatches ?? null;
      lastUpdate = meta.updatedAt ?? null;
    }
  } catch (_) {}

  let state = "BUILDING";
  let coverage = null;

  // season finished detector
  try {
    const metaObj = await env.AI_STATE.get(
      `league/${league}/${season}/meta.json`
    );

    if (metaObj) {
      const meta = JSON.parse(await metaObj.text());

      const seasonEnd = season.split("-")[1] + "0630";

      if (meta.nextFrom && meta.nextFrom > seasonEnd) {
        state = "COMPLETE";
        coverage = 100;
        expected = stored; // deterministic expectation
      }
    }
  } catch (_) {}

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