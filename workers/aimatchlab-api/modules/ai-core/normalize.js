export function normalizeInput(input = {}) {
  return {
    core: {
      id: input.id || null,
      league: input.league || null,
      season: input.season || null,
      home: input.home || null,
      away: input.away || null,
      status: input.status || null,
      minute: Number(input.minute || 0),
      scoreHome: Number(input.scoreHome || 0),
      scoreAway: Number(input.scoreAway || 0)
    },
    standings: input.standings || null,
    live: input.live || null
  };
}