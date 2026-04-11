export function buildResearchPlan(match) {
  const base = {
    matchId: match.matchId,
    league: match.leagueSlug,
    kickoff: match.kickoffUtc
  };

  const tasks = [
    {
      key: "competition_context",
      question:
        "What is the competition stage, round, and importance of this match?",
      required: true
    },
    {
      key: "referee_profile",
      question:
        "Who is the referee and what is their card/penalty tendency and style?",
      required: false
    },
    {
      key: "team_news",
      question:
        "Are there injuries, suspensions, or important absences for both teams?",
      required: false
    },
    {
      key: "expected_lineups",
      question:
        "What are the expected starting lineups and rotation risks?",
      required: false
    },
    {
      key: "form_guide",
      question:
        "What is the recent form (last 5 matches) of both teams?",
      required: true
    },
    {
      key: "head_to_head",
      question:
        "What is the head-to-head history between the teams?",
      required: false
    }
  ];

  return {
    ...base,
    tasks,
    meta: {
      version: "research-plan-v2",
      tasksCount: tasks.length
    }
  };
}