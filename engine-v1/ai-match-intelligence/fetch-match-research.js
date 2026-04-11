import { readResearchCache, writeResearchCache } from "./research-cache.js";

function pickFirst(...values) {
  for (const v of values) {
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return null;
}

function safeArray(v) {
  return Array.isArray(v) ? v : [];
}

async function fetchJson(url, label) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json,text/plain,*/*",
        "user-agent": "engine-v1-ai-details/1.0"
      }
    });

    clearTimeout(timeout);

    if (!res.ok) {
      console.log("[ai-research] fetch:not-ok", label, res.status, url);
      return null;
    }

    const data = await res.json();
    console.log("[ai-research] fetch:ok", label);
    return data;
  } catch (err) {
    console.log("[ai-research] fetch:failed", label, String(err?.message || err));
    return null;
  }
}

function normalizeCompetitionContext(ctx) {
  if (!ctx) return null;

  const competition = pickFirst(ctx.competition, null);
  const seasonType = pickFirst(ctx.seasonType, null);
  const status = pickFirst(ctx.status, null);
  const round = pickFirst(ctx.round, null);
  const venue = pickFirst(ctx.venue, null);

  if (!competition && !seasonType && !status && !round && !venue) return null;

  return {
    competition,
    seasonType,
    status,
    round,
    venue
  };
}

function normalizeReferee(referee) {
  if (!referee) return null;

  const name = pickFirst(referee.name, referee.fullName, null);
  const role = pickFirst(referee.role, "Referee");

  if (!name) return null;

  return { name, role };
}

function extractCompetitionContextFromScoreboardEvent(event) {
  if (!event) return null;

  const comp = safeArray(event?.competitions)[0] || null;
  const seasonType = event?.season?.type || null;
  const statusType = event?.status?.type || null;
  const note = safeArray(comp?.notes)[0] || null;
  const headlines = safeArray(event?.headlines);

  return normalizeCompetitionContext({
    competition: pickFirst(
      comp?.league?.name,
      event?.league?.name,
      event?.shortName,
      null
    ),
    seasonType: pickFirst(seasonType?.name, seasonType?.description, null),
    status: pickFirst(statusType?.name, statusType?.description, null),
    round: pickFirst(
      note?.headline,
      note?.text,
      headlines[0]?.shortLinkText,
      headlines[0]?.headline,
      null
    ),
    venue: pickFirst(
      comp?.venue?.fullName,
      comp?.venue?.address?.city,
      null
    )
  });
}

function extractRefereeFromScoreboardEvent(event) {
  if (!event) return null;

  const comp = safeArray(event?.competitions)[0] || null;

  const officials =
    safeArray(comp?.officials).length
      ? safeArray(comp?.officials)
      : safeArray(comp?.details)?.flatMap(x => safeArray(x?.officials));

  if (!officials.length) return null;

  const referee =
    officials.find(o =>
      String(o?.type?.text || o?.type || "").toLowerCase().includes("ref")
    ) || officials[0];

  return normalizeReferee({
    name: pickFirst(
      referee?.fullName,
      referee?.displayName,
      referee?.shortName,
      referee?.name,
      null
    ),
    role: pickFirst(referee?.type?.text, referee?.type, "Referee")
  });
}

async function fetchEspnEvent(matchId) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/scoreboard?event=${matchId}`;
  const data = await fetchJson(url, "espn-event");
  if (!data) return null;

  const event = safeArray(data?.events)[0] || null;
  if (!event) return null;

  return {
    provider: "espn-event",
    competitionContext: extractCompetitionContextFromScoreboardEvent(event),
    referee: extractRefereeFromScoreboardEvent(event)
  };
}

async function fetchEspnSummary(matchId) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/summary?event=${matchId}`;
  const data = await fetchJson(url, "espn-summary");
  if (!data) return null;

  const headerComp = safeArray(data?.header?.competitions)[0] || null;
  const gameInfo = data?.gameInfo || null;
  const officials = safeArray(gameInfo?.officials);

  const competitionContext = normalizeCompetitionContext({
    competition: pickFirst(
      data?.leagues?.[0]?.name,
      headerComp?.league?.name,
      null
    ),
    seasonType: pickFirst(
      data?.season?.type?.name,
      data?.season?.type?.description,
      null
    ),
    status: pickFirst(
      headerComp?.status?.type?.name,
      headerComp?.status?.type?.description,
      null
    ),
    round: pickFirst(
      safeArray(gameInfo?.notes)[0]?.headline,
      safeArray(gameInfo?.notes)[0]?.text,
      null
    ),
    venue: pickFirst(gameInfo?.venue?.fullName, null)
  });

  const referee = officials.length
    ? normalizeReferee({
        name: pickFirst(
          officials[0]?.displayName,
          officials[0]?.fullName,
          officials[0]?.name,
          null
        ),
        role: "Referee"
      })
    : null;

  return {
    provider: "espn-summary",
    competitionContext,
    referee
  };
}

function mergeResearch(primary, fallback) {
  const competitionContext =
    primary?.competitionContext ||
    fallback?.competitionContext ||
    null;

  const referee =
    primary?.referee ||
    fallback?.referee ||
    null;

  const sources = [
    ...(primary ? [primary.provider] : []),
    ...(fallback ? [fallback.provider] : [])
  ].filter(Boolean);

  return {
    competitionContext,
    referee,
    teamNews: null,
    lineups: null,
    sources
  };
}

export async function fetchMatchResearch(match, { useCache = true } = {}) {
  console.log("[ai-research] fetch:start", match.matchId, {
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    leagueSlug: match.leagueSlug
  });

  if (useCache) {
    const cached = readResearchCache(match.matchId, { maxAgeMinutes: 180 });
    if (cached?.payload) {
      console.log("[ai-research] cache:hit", match.matchId);
      return {
        ...cached.payload,
        cacheHit: true
      };
    }
  }

  const primary = await fetchEspnEvent(match.matchId);
  const fallback = await fetchEspnSummary(match.matchId);
  const merged = mergeResearch(primary, fallback);

  console.log("[ai-research] fetch:done", match.matchId, {
    hasCompetitionContext: !!merged.competitionContext,
    hasReferee: !!merged.referee,
    sources: merged.sources
  });

  writeResearchCache(match.matchId, merged);

  return {
    ...merged,
    cacheHit: false
  };
}