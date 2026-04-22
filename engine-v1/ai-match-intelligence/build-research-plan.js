function buildTask({
  key,
  required = false,
  capability,
  outputKey,
  preferredEvidence = [],
  fallbackEvidence = [],
  priority = 50,
  mode = "hybrid",
  question
}) {
  return {
    key,
    required,
    capability,
    outputKey,
    preferredEvidence,
    fallbackEvidence,
    priority,
    mode,
    question
  };
}

function getCompetitionType(match) {
  const slug = String(match?.leagueSlug || "").toLowerCase();

  if (
    slug.includes("uefa") ||
    slug.includes("champions") ||
    slug.includes("europa") ||
    slug.includes("libertadores") ||
    slug.includes("sudamericana")
  ) {
    return "international";
  }

  if (slug.includes("cup")) {
    return "cup";
  }

  return "league";
}

export function buildResearchPlan(match) {
  const competitionType = getCompetitionType(match);

  const base = {
    matchId: match.matchId,
    league: match.leagueSlug,
    kickoff: match.kickoffUtc,
    competitionType
  };

  const tasks = [
    buildTask({
      key: "competition_context",
      required: true,
      capability: "competition_context",
      outputKey: "competitionContext",
      preferredEvidence: ["local-standings", "local-competition-state"],
      fallbackEvidence: [],
      priority: 100,
      mode: "deterministic_only",
      question: "What is the competition stage, round, and importance of this match?"
    }),

    buildTask({
      key: "referee_profile",
      required: false,
      capability: "referee_profile",
      outputKey: "refereeProfile",
      preferredEvidence: ["local-referee-history"],
      fallbackEvidence: ["remote-referee-research"],
      priority: 78,
      mode: "hybrid",
      question: "Who is the referee and what is the officiating profile for this match?"
    }),

    buildTask({
      key: "team_news",
      required: false,
      capability: "team_news",
      outputKey: "teamNews",
      preferredEvidence: ["local-team-news"],
      fallbackEvidence: ["remote-team-news-research"],
      priority: 75,
      mode: "hybrid",
      question: "Are there injuries, suspensions, or important absences for both teams?"
    }),

    buildTask({
      key: "expected_lineups",
      required: false,
      capability: "expected_lineups",
      outputKey: "expectedLineups",
      preferredEvidence: ["local-lineup-model"],
      fallbackEvidence: [],
      priority: 72,
      mode: "model_first",
      question: "What are the expected starting lineups and rotation risks?"
    }),

    buildTask({
      key: "form_guide",
      required: true,
      capability: "form_guide",
      outputKey: "formGuide",
      preferredEvidence: ["local-history", "local-history-index"],
      fallbackEvidence: [],
      priority: 95,
      mode: "deterministic_only",
      question: "What is the recent form (last 5 matches) of both teams?"
    }),

    buildTask({
      key: "head_to_head",
      required: false,
      capability: "head_to_head",
      outputKey: "headToHead",
      preferredEvidence: ["local-history", "local-history-index"],
      fallbackEvidence: [],
      priority: 60,
      mode: "deterministic_only",
      question: "What is the head-to-head history between the teams?"
    }),

    buildTask({
      key: "travel_context",
      required: false,
      capability: "travel_context",
      outputKey: "travelContext",
      preferredEvidence: ["local-team-geo"],
      fallbackEvidence: [],
      priority: competitionType === "international" ? 68 : 40,
      mode: "deterministic_only",
      question: "What is the travel load and location impact for both teams?"
    }),

    buildTask({
      key: "value_context",
      required: false,
      capability: "value_context",
      outputKey: "valueContext",
      preferredEvidence: ["local-value"],
      fallbackEvidence: [],
      priority: 65,
      mode: "deterministic_only",
      question: "What does the current model/value layer indicate for this match?"
    })
  ];

  return {
    ...base,
    tasks,
    meta: {
      version: "research-plan-v4",
      tasksCount: tasks.length,
      planningMode: "capability_based",
      deterministicTasks: tasks.filter(
        t => t.mode === "deterministic_only" || t.mode === "deterministic_first"
      ).length,
      hybridTasks: tasks.filter(
        t => t.mode === "hybrid" || t.mode === "model_first"
      ).length,
      remoteEligibleTasks: tasks.filter(
        t => Array.isArray(t.fallbackEvidence) && t.fallbackEvidence.length > 0
      ).map(t => t.key)
    }
  };
}