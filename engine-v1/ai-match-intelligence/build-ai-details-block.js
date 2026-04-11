import { buildResearchPlan } from "./build-research-plan.js";
import { loadIntelligenceSupport } from "./load-intelligence-support.js";
import { inferMatchContext } from "./infer-match-context.js";
import { fetchMatchResearch } from "./fetch-match-research.js";
import { executeResearchTasks } from "./execute-research-tasks.js";
import { getMatchHistoryContext } from "../core/history-layer.js";
import { buildFormGuide } from "../core/form-guide.js";
import { buildHeadToHeadGuide } from "../core/head-to-head-guide.js";
import { buildCompetitionContext } from "../core/competition-context.js";
import { buildRefereeContext } from "../core/referee-context.js";
import { buildTeamNewsContext } from "../core/team-news-context.js";
import { buildLineupContext } from "../core/lineup-context.js";

export async function buildAiDetailsBlock(match, { dayKey, valuePicks }) {
  console.log("[ai-details] build:start", match.matchId);

  const researchPlan = buildResearchPlan(match);
  const taskResults = executeResearchTasks(match, researchPlan);

  const historyContext = getMatchHistoryContext(match, {
    limit: 5,
    sameSeasonLimit: 5,
    h2hLimit: 5,
    minSameSeasonSample: 3
  });

  const formGuide = buildFormGuide(match, historyContext);
  const headToHeadGuide = buildHeadToHeadGuide(match, historyContext);
  const competitionContext = buildCompetitionContext(match);
  const refereeContext = buildRefereeContext(match);
  const teamNewsContext = buildTeamNewsContext(match);

  const lineupContext = buildLineupContext(match, {
    formGuide,
    teamNewsContext
  });

  console.log("[HISTORY TEST]", {
    matchId: match?.matchId,
    leagueSlug: match?.leagueSlug,
    homeTeam: match?.homeTeam,
    awayTeam: match?.awayTeam,
    mergedRows: historyContext?.meta?.mergedRows || 0,
    currentSeasonRows: historyContext?.meta?.currentSeasonRows || 0,
    archiveRows: historyContext?.meta?.archiveRows || 0,
    homeSample: formGuide?.homeTeam?.sampleSize || 0,
    awaySample: formGuide?.awayTeam?.sampleSize || 0,
    h2hSample: headToHeadGuide?.sampleSize || 0,
    usedArchiveForHome: historyContext?.meta?.usedArchiveForHome || false,
    usedArchiveForAway: historyContext?.meta?.usedArchiveForAway || false
  });

  const support = loadIntelligenceSupport(dayKey, match.matchId, valuePicks);
  const research = await fetchMatchResearch(match, { useCache: true });

// -----------------------------
// 🔥 HISTORY INTELLIGENCE INJECTION
// -----------------------------
const historySignals = [];

if (formGuide?.homeTeam?.formScore != null) {
  if (formGuide.homeTeam.formScore >= 0.65)
    historySignals.push("home_strong_form");
  else if (formGuide.homeTeam.formScore <= 0.35)
    historySignals.push("home_weak_form");
}

if (formGuide?.awayTeam?.formScore != null) {
  if (formGuide.awayTeam.formScore >= 0.65)
    historySignals.push("away_strong_form");
  else if (formGuide.awayTeam.formScore <= 0.35)
    historySignals.push("away_weak_form");
}

if (headToHeadGuide?.sampleSize >= 3) {
  historySignals.push("h2h_available");
}

const enrichedSupport = {
  ...support,
  historySignals
};

  const aiContext = inferMatchContext(match, {
    ...enrichedSupport,
    research,
    competitionContext,
    refereeContext,
    teamNewsContext,
    lineupContext,
    historyContext,
    formGuide,
    headToHeadGuide
  });

  const researchedFacts = {
    status: "structured",

    competitionContext,
    refereeProfile: refereeContext,
    teamNews: teamNewsContext,
    expectedLineups: taskResults.expected_lineups,
    formGuide,
    headToHead: headToHeadGuide,
    formGuide,

    valueContext: {
      count: support.valueSummary?.count || 0,
      topMarket: support.valueSummary?.topMarket || null,
      topPick: support.valueSummary?.topPick || null,
      topScore: support.valueSummary?.topScore ?? null,
      avgConfidence: support.valueSummary?.avgConfidence ?? 0,
      confidence: support.hasValue ? 0.75 : 0
    },

    researchPlan
  };

  const missing = [];
  if (!competitionContext?.data) missing.push("competitionContext");
  if (!refereeContext?.data) missing.push("referee");
  if (!teamNewsContext?.data) missing.push("teamNews");
  if (!lineupContext?.data) missing.push("lineups");
  if (!support.hasValue) missing.push("valueContext");

  const sourceAudit = {
    status:
      research?.sources?.length ||
      support.hasValue ||
      competitionContext?.data ||
      refereeContext?.data ||
      teamNewsContext?.data ||
      lineupContext?.data
        ? "partial"
        : "none",
    sourcesUsed: [
      ...(research?.sources || []),
      ...(competitionContext?.data ? ["local-standings"] : []),
      ...(refereeContext?.data ? ["local-referees"] : []),
      ...(teamNewsContext?.data ? ["local-team-news"] : []),
      ...(lineupContext?.data ? ["local-lineup-model"] : []),
      ...(support.hasValue ? ["local-value"] : [])
    ],
    conflicts: [],
    missing,
    trustSummary: {
      espnEvent: research?.sources?.includes("espn-event") ? 1 : 0,
      espnSummary: research?.sources?.includes("espn-summary") ? 1 : 0,
      localStandings: competitionContext?.data ? 1 : 0,
      localReferees: refereeContext?.data ? 1 : 0,
      localTeamNews: teamNewsContext?.data ? 1 : 0,
      localLineupModel: lineupContext?.data ? 1 : 0,
      localValue: support.hasValue ? 1 : 0,
      cacheHit: research?.cacheHit ? 1 : 0
    }
  };

  const learningMeta = {
    status: "init",
    postMatchReviewPending: true
  };

  console.log("[ai-details] build:done", match.matchId, {
    hasCompetitionContext: !!competitionContext?.data,
    hasReferee: !!refereeContext?.data,
    hasValue: support.hasValue,
    hasForm: !!(
      formGuide?.homeTeam?.sampleSize ||
      formGuide?.awayTeam?.sampleSize
    ),
    hasH2H: !!headToHeadGuide?.sampleSize,
    topMarket: support.valueSummary?.topMarket || null,
    cacheHit: !!research?.cacheHit
  });

  return {
    researchedFacts,
    aiContext,
    sourceAudit,
    learningMeta
  };
}