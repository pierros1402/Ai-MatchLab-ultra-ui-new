import { buildResearchPlan } from "./build-research-plan.js";
import { loadIntelligenceSupport } from "./load-intelligence-support.js";
import { inferMatchContext } from "./infer-match-context.js";
import { fetchMatchResearch } from "./fetch-match-research.js";

export async function buildAiDetailsBlock(match, { dayKey, valuePicks }) {
  console.log("[ai-details] build:start", match.matchId);

  const researchPlan = buildResearchPlan(match);

  const support = loadIntelligenceSupport(dayKey, match.matchId);

  // 🔴 NEW: external research
  const research = await fetchMatchResearch(match);

  const aiContext = inferMatchContext(match, {
    ...support,
    research
  });

  const researchedFacts = {
    status: research ? "partial" : "empty",

    competitionContext: {
      data: research?.competitionContext || null,
      confidence: research?.competitionContext ? 0.6 : 0
    },

    refereeProfile: {
      name: null,
      confidence: 0
    },

    teamNews: {
      home: {},
      away: {}
    },

    expectedLineups: {
      confidence: 0
    }
  };

  const sourceAudit = {
    status: research ? "partial" : "none",
    sourcesUsed: research?.sources || [],
    conflicts: [],
    missing: ["referee", "lineups", "teamNews"],
    trustSummary: {
      espn: research?.sources?.includes("espn") ? 1 : 0
    }
  };

  const learningMeta = {
    status: "init",
    postMatchReviewPending: true
  };

  console.log("[ai-details] build:done", match.matchId);

  return {
    researchedFacts,
    aiContext,
    sourceAudit,
    learningMeta
  };
}