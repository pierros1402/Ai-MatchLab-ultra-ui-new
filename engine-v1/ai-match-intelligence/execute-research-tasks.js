function emptyTaskResult(key) {
  return {
    key,
    status: "empty",
    data: null,
    confidence: 0
  };
}

function buildFormGuide(match) {
  // προσωρινό fallback (μέχρι να συνδεθεί history-index)
  return {
    key: "form_guide",
    status: "partial",
    data: {
      home: [],
      away: []
    },
    confidence: 0.3
  };
}

function buildHeadToHead(match) {
  return {
    key: "head_to_head",
    status: "empty",
    data: [],
    confidence: 0
  };
}

function buildCompetitionContext(match) {
  return {
    key: "competition_context",
    status: "partial",
    data: {
      type: match.leagueSlug.includes("uefa")
        ? "international_knockout"
        : "domestic",
      importance: "medium"
    },
    confidence: 0.5
  };
}

export function executeResearchTasks(match, plan) {
  const results = {};

  for (const task of plan.tasks) {
    switch (task.key) {
      case "competition_context":
        results[task.key] = buildCompetitionContext(match);
        break;

      case "form_guide":
        results[task.key] = buildFormGuide(match);
        break;

      case "head_to_head":
        results[task.key] = buildHeadToHead(match);
        break;

      case "referee_profile":
      case "team_news":
      case "expected_lineups":
      default:
        results[task.key] = emptyTaskResult(task.key);
    }
  }

  return results;
}