

function safeText(v) {
  return typeof v === "string" ? v.trim() : "";
}

// simple fetch with timeout
async function fetchJson(url) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return null;

    return await res.json();
  } catch {
    return null;
  }
}

// ESPN match summary (baseline enrichment)
async function fetchEspnSummary(matchId) {
  const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/scoreboard?event=${matchId}`;
  const data = await fetchJson(url);

  if (!data?.events?.[0]) return null;

  const event = data.events[0];

  return {
    competition: event?.season?.type?.name || null,
    status: event?.status?.type?.name || null,
    venue: event?.competitions?.[0]?.venue?.fullName || null
  };
}

// TODO later: add real multi-source scraping
// (referee, injuries, lineups, etc)

export async function fetchMatchResearch(match) {
  console.log("[ai-research] fetch:start", match.matchId);

  const espn = await fetchEspnSummary(match.matchId);

  const result = {
    referee: null,
    teamNews: null,
    lineups: null,
    competitionContext: espn || null,
    sources: espn ? ["espn"] : []
  };

  console.log("[ai-research] fetch:done", match.matchId);

  return result;
}