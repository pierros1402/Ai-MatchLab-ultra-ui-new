import { buildStandingsFromR2 } from "./standings-builder.js";

const WINDOW_DAYS = 5;
const MAX_WINDOWS_PER_RUN = 3;
const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer";

export async function buildSeason(env, league, season) {

  const statePrefix = `league/${league}/${season}/`;
  const metaKey = `${statePrefix}meta.json`;

  let meta = await readJson(env, metaKey);

  if (!meta) {
    meta = {
      season,
      league,
      nextFrom: seasonStart(season)
    };
  }

  const seasonEndDate = seasonEnd(season);

  let windowsRun = 0;
  let totalMatchesProcessed = 0;

  while (windowsRun < MAX_WINDOWS_PER_RUN) {

    if (meta.nextFrom > seasonEndDate) break;

    const from = meta.nextFrom;
    const end = addDays(from, WINDOW_DAYS - 1);

    const fetchResult = await fetchMatchesForWindow(league, from, end);

    if (!fetchResult.ok) break;

    const matches = fetchResult.matches;

    for (const match of matches) {
      const key = `${statePrefix}matches/${match.id}.json`;
      const existing = await readJson(env, key);
      const serialized = JSON.stringify(match);

      if (!existing || JSON.stringify(existing) !== serialized) {
        await env.AI_STATE.put(key, serialized);
      }
    }

    totalMatchesProcessed += matches.length;

    meta.nextFrom = addDays(end, 1);
    windowsRun++;
  }

  await env.AI_STATE.put(metaKey, JSON.stringify(meta));

  const table = await buildStandingsFromR2(env, league, season);

  await env.AI_STATE.put(
    `${statePrefix}table.json`,
    JSON.stringify(table)
  );

  return json({
    ok: true,
    league,
    season,
    windowsRun,
    totalMatchesProcessed,
    nextFrom: meta.nextFrom
  });
}

async function fetchMatchesForWindow(league, from, to) {
  const url = `${ESPN_BASE}/${league}/scoreboard?dates=${from}-${to}&limit=200&include=betting`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { ok: false };
    }
    const data = await res.json();
    const events = data?.events || [];
    return { ok: true, matches: events.map(normalizeEvent) };
  } catch {
    return { ok: false };
  }
}

function normalizeEvent(e) {
  return {
    id: e.id,
    status: e.status?.type?.name || null,
    date: e.date,
    home: e.competitions?.[0]?.competitors?.find(c => c.homeAway === "home")?.team?.displayName || null,
    away: e.competitions?.[0]?.competitors?.find(c => c.homeAway === "away")?.team?.displayName || null,
    scoreHome: parseScore(e, "home"),
    scoreAway: parseScore(e, "away")
  };
}

function parseScore(e, side) {
  const comp = e.competitions?.[0];
  if (!comp) return null;
  const team = comp.competitors?.find(c => c.homeAway === side);
  if (!team) return null;
  return Number(team.score);
}

async function readJson(env, key) {
  const raw = await env.AI_STATE.get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function seasonStart(season) {
  return season.split("-")[0] + "0801";
}

function seasonEnd(season) {
  return season.split("-")[1] + "0630";
}

function addDays(dateStr, days) {
  const d = new Date(
    dateStr.slice(0, 4),
    dateStr.slice(4, 6) - 1,
    dateStr.slice(6, 8)
  );
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

function formatDate(d) {
  return (
    d.getFullYear().toString() +
    String(d.getMonth() + 1).padStart(2, "0") +
    String(d.getDate()).padStart(2, "0")
  );
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json" }
  });
}