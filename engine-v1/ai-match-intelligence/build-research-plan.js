export function buildResearchPlan(match) {
  return {
    matchId: match.matchId,
    tasks: [
      "referee",
      "teamNews",
      "lineups",
      "competitionContext",
      "editorialConsensus"
    ],
    meta: {
      league: match.leagueSlug,
      kickoff: match.kickoffUtc
    }
  };
}