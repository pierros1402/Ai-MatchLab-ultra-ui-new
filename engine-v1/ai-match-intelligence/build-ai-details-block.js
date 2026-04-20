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
import { buildEvidenceBundle } from "./build-evidence-bundle.js";
import { executeRemoteTaskQueue } from "./execute-remote-task-queue.js";

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

  const evidenceBundle = buildEvidenceBundle(match, {
    research,
    competitionContext,
    refereeContext,
    teamNewsContext,
    lineupContext,
    historyContext,
    formGuide,
    headToHeadGuide,
    support
  });

  const researchedFacts = {
    status: "structured",

    competitionContext,
    refereeProfile: refereeContext?.data
      ? refereeContext
      : {
          key: "referee_profile",
          status: "empty",
          data: null,
          confidence: 0,
          source: "local-referees",
          reason: "missing_local_referee_evidence"
        },
    teamNews: teamNewsContext?.data
      ? teamNewsContext
      : {
          key: "team_news",
          status: "empty",
          data: null,
          confidence: 0,
          source: "local-team-news",
          reason: "missing_local_team_news_evidence"
        },
    expectedLineups: lineupContext?.data
      ? {
          key: "expected_lineups",
          status: "ok",
          data: lineupContext.data,
          confidence: lineupContext.confidence ?? 0.6,
          source: "local-lineup-model"
        }
      : (taskResults.expected_lineups || {
          key: "expected_lineups",
          status: "empty",
          data: null,
          confidence: 0
        }),
    formGuide,
    headToHead: headToHeadGuide,

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
  if (!competitionContext?.data) missing.push("competition_context");
  if (!refereeContext?.data) missing.push("referee_profile");
  if (!teamNewsContext?.data) missing.push("team_news");
  if (!lineupContext?.data) missing.push("expected_lineups");
  if (!support.hasValue) missing.push("value_snapshot");

  const sourceAudit = {
    status: evidenceBundle.status,
    sourcesUsed: evidenceBundle.summary.providers,
    conflicts: [],
    missing: evidenceBundle.summary.missing,
    trustSummary: evidenceBundle.summary.trustCounts,
    evidence: evidenceBundle.evidence,
    cacheHit: !!research?.cacheHit
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

  function hasEvidenceKind(kind) {
    return Array.isArray(sourceAudit?.evidence)
      && sourceAudit.evidence.some(item => item?.kind === kind && item?.status === "available");
  }

  function mergeRemoteExecutionIntoFacts(baseFacts, remoteExecutionResult) {
    const merged = { ...(baseFacts || {}) };
    const results = Array.isArray(remoteExecutionResult?.results)
      ? remoteExecutionResult.results
      : [];

    for (const item of results) {
      if (!item || !item.capability) continue;

      if (
        item.capability === "team_news" &&
        (item.status === "resolved_stub" || item.status === "success" || item.status === "partial") &&
        item.data
      ) {
        merged.teamNews = {
          status: "ok",
          source: item.provider || "remote-provider",
          confidence: item.confidence ?? 0.2,
          data: item.data
        };
      }

      if (item.capability === "referee_profile") {
        if (
          (item.status === "resolved_stub" || item.status === "success" || item.status === "partial") &&
          item.data
        ) {
          merged.refereeProfile = {
            status: "ok",
            source: item.provider || "remote-provider",
            confidence: item.confidence ?? 0.2,
            data: item.data
          };
        } else if (item.status === "unavailable" && !merged.refereeProfile) {
          merged.refereeProfile = {
            status: "empty",
            source: item.provider || "remote-provider",
            confidence: item.confidence ?? 0,
            data: null,
            reason: item.reason || "unavailable"
          };
        }
      }
    }

    return merged;
  }

  function normalizeSourceAudit(baseAudit, finalFacts, remoteExecutionResult) {
    const audit = { ...(baseAudit || {}) };

    const initialSourcesUsed = Array.isArray(audit.sourcesUsed) ? audit.sourcesUsed : [];
    const initialMissing = Array.isArray(audit.missing) ? audit.missing : [];

    const sourcesUsed = new Set(initialSourcesUsed);
    const missing = new Set(initialMissing);

    const results = Array.isArray(remoteExecutionResult?.results)
      ? remoteExecutionResult.results
      : [];

    const teamNewsOk = finalFacts?.teamNews?.status === "ok";
    const refereeOk = finalFacts?.refereeProfile?.status === "ok";

    if (teamNewsOk) {
      missing.delete("team_news");
    }

    if (refereeOk) {
      missing.delete("referee_profile");
    }

    for (const item of results) {
      if (!item?.provider) continue;

      if (
        item.capability === "team_news" &&
        (item.status === "resolved_stub" || item.status === "success" || item.status === "partial")
      ) {
        sourcesUsed.add(item.provider);
      }

      if (
        item.capability === "referee_profile" &&
        (item.status === "resolved_stub" || item.status === "success" || item.status === "partial")
      ) {
        sourcesUsed.add(item.provider);
      }
    }

    const trustSummary =
      missing.size === 0
        ? "local_and_remote_evidence_available"
        : sourcesUsed.size > 0
          ? "partial_remote_enrichment"
          : (audit.trustSummary || "local_only_partial");

    return {
      ...audit,
      sourcesUsed: Array.from(sourcesUsed),
      missing: Array.from(missing),
      trustSummary
    };
  }

  function normalizeTaskLayer(baseTasks, remoteExecutionResult) {
    const tasks = Array.isArray(baseTasks) ? baseTasks.map(task => ({ ...task })) : [];
    const results = Array.isArray(remoteExecutionResult?.results)
      ? remoteExecutionResult.results
      : [];

    const resultMap = new Map();
    for (const item of results) {
      if (!item?.capability) continue;
      resultMap.set(item.capability, item);
    }

    const normalizedTasks = tasks.map(task => {
      const remoteResult = resultMap.get(task.capability);
      if (!remoteResult) return task;

      if (
        remoteResult.status === "resolved_stub" ||
        remoteResult.status === "success" ||
        remoteResult.status === "partial"
      ) {
        return {
          ...task,
          state: "done",
          resolution: "remote",
          provider: remoteResult.provider || null,
          source: remoteResult.provider || "remote-provider",
          remoteResolved: true,
          remoteStatus: remoteResult.status,
          remoteReason: remoteResult.reason || null
        };
      }

      if (remoteResult.status === "unavailable") {
        return {
          ...task,
          state: "pending",
          resolution: "unavailable",
          provider: remoteResult.provider || null,
          source: remoteResult.provider || "remote-provider",
          remoteResolved: false,
          remoteStatus: remoteResult.status,
          remoteReason: remoteResult.reason || null
        };
      }

      if (remoteResult.status === "blocked" || remoteResult.status === "failed") {
        return {
          ...task,
          state: "pending",
          resolution: "missing",
          provider: remoteResult.provider || task.provider || null,
          source: remoteResult.provider || task.source || null,
          remoteResolved: false,
          remoteStatus: remoteResult.status,
          remoteReason: remoteResult.reason || null
        };
      }

      return task;
    });

    const normalizedRemoteTaskQueue = normalizedTasks
      .filter(task => task.state !== "done" && task.remoteFallbackRecommended)
      .sort((a, b) => (b.priority || 0) - (a.priority || 0))
      .map(task => ({
        key: task.key,
        capability: task.capability,
        outputKey: task.outputKey,
        priority: task.priority,
        mode: task.mode,
        reason: task.remoteReason || "missing_local_coverage",
        preferredEvidence: task.preferredEvidence,
        fallbackEvidence: task.fallbackEvidence
      }));

    const normalizedRemoteTaskRouter = {
      status: normalizedRemoteTaskQueue.length ? "pending" : "idle",
      queueSize: normalizedRemoteTaskQueue.length,
      queuedCapabilities: normalizedRemoteTaskQueue.map(task => task.capability)
    };

    return {
      tasks: normalizedTasks,
      remoteTaskQueue: normalizedRemoteTaskQueue,
      remoteTaskRouter: normalizedRemoteTaskRouter
    };
  }

  function normalizeAiContext(baseAiContext, finalFacts) {
    const ctx = { ...(baseAiContext || {}) };
    const support = { ...(ctx.support || {}) };
    const signals = Array.isArray(ctx.signals) ? [...ctx.signals] : [];

    const teamNewsUsed = finalFacts?.teamNews?.status === "ok";
    const refereeUsed = finalFacts?.refereeProfile?.status === "ok";

    support.teamNewsUsed = teamNewsUsed;
    support.refereeUsed = support.refereeUsed || refereeUsed;

    if (teamNewsUsed && !signals.includes("team_news_available")) {
      signals.push("team_news_available");
    }

    if (refereeUsed && !signals.includes("referee_profile_available")) {
      signals.push("referee_profile_available");
    }

    let summary = ctx.summary;
    if (summary && typeof summary === "object") {
      summary = { ...summary };

      if (teamNewsUsed) {
        if (typeof summary.el === "string" && !summary.el.includes("team news")) {
          summary.el = `${summary.el} Υπάρχει διαθέσιμο team news context στο enriched snapshot.`;
        }
        if (typeof summary.en === "string" && !summary.en.includes("team news")) {
          summary.en = `${summary.en} Team news context is available in the enriched snapshot.`;
        }
      }

      if (refereeUsed) {
        if (typeof summary.el === "string" && !summary.el.includes("διαιτητ")) {
          summary.el = `${summary.el} Υπάρχει διαθέσιμο referee profile στο enriched snapshot.`;
        }
        if (typeof summary.en === "string" && !summary.en.includes("referee")) {
          summary.en = `${summary.en} Referee profile is available in the enriched snapshot.`;
        }
      }
    }

    return {
      ...ctx,
      support,
      signals,
      summary
    };
  }

  function buildTaskExecution(task) {
    const capability = String(task?.capability || task?.key || "");
    const outputKey = task?.outputKey || null;

    const fact = outputKey ? researchedFacts?.[outputKey] : null;
    const factStatus = String(fact?.status || "").toLowerCase();

    let state = "pending";
    let resolution = "missing";
    let provider = null;
    let confidence = 0;
    let remoteFallbackRecommended = false;

    if (capability === "competition_context") {
      if (competitionContext?.data) {
        state = "done";
        resolution =
          competitionContext?.status === "fallback"
            ? "fallback_local"
            : "deterministic_local";
        provider = "local-standings";
        confidence = competitionContext?.confidence ?? 0.3;
      } else {
        remoteFallbackRecommended = true;
      }
    } else if (capability === "referee_profile") {
      if (refereeContext?.data && hasEvidenceKind("referee_profile")) {
        state = "done";
        resolution = "deterministic_local";
        provider = "local-referees";
        confidence = refereeContext?.confidence ?? 0.6;
      } else {
        remoteFallbackRecommended = true;
      }
    } else if (capability === "team_news") {
      if (teamNewsContext?.data && hasEvidenceKind("team_news")) {
        state = "done";
        resolution = "hybrid_local";
        provider = "local-team-news";
        confidence = teamNewsContext?.confidence ?? 0.55;
      } else {
        remoteFallbackRecommended = true;
      }
    } else if (capability === "expected_lineups") {
      if (lineupContext?.data) {
        state = "done";
        resolution = "model_local";
        provider = "local-lineup-model";
        confidence = lineupContext?.confidence ?? 0.6;
      } else {
        remoteFallbackRecommended = true;
      }
    } else if (capability === "form_guide") {
      if ((formGuide?.homeTeam?.sampleSize || 0) >= 3 && (formGuide?.awayTeam?.sampleSize || 0) >= 3) {
        state = "done";
        resolution = "derived_local";
        provider = "local-history";
        confidence = 0.78;
      }
    } else if (capability === "head_to_head") {
      if ((headToHeadGuide?.sampleSize || 0) >= 1) {
        state = "done";
        resolution = "derived_local";
        provider = "local-history";
        confidence = headToHeadGuide?.confidence ?? 0.45;
      }
    } else if (capability === "travel_context") {
      if (fact?.data) {
        state = "done";
        resolution = "deterministic_local";
        provider = "local-team-geo";
        confidence = fact?.confidence ?? 0.6;
      }
    } else if (capability === "value_context") {
      if (support.hasValue) {
        state = "done";
        resolution = "deterministic_local";
        provider = "local-value";
        confidence = support.valueSummary?.avgConfidence ?? 0.75;
      }
    }

    if (
      state !== "done" &&
      fact &&
      factStatus &&
      factStatus !== "empty"
    ) {
      state = "done";
      resolution = "structured_fact";
      provider = fact?.source || provider || null;
      confidence = fact?.confidence ?? confidence ?? 0;
    }

    return {
      key: task.key,
      capability,
      outputKey,
      required: !!task.required,
      priority: task.priority ?? null,
      mode: task.mode || null,
      state,
      resolution,
      provider,
      confidence,
      remoteFallbackRecommended,
      preferredEvidence: Array.isArray(task.preferredEvidence) ? task.preferredEvidence : [],
      fallbackEvidence: Array.isArray(task.fallbackEvidence) ? task.fallbackEvidence : []
    };
  }

  const taskExecution = Array.isArray(researchPlan?.tasks)
    ? researchPlan.tasks.map(buildTaskExecution)
    : [];

  const remoteTaskQueue = taskExecution
    .filter(task => task.state !== "done" && task.remoteFallbackRecommended)
    .sort((a, b) => (b.priority || 0) - (a.priority || 0))
    .map(task => ({
      key: task.key,
      capability: task.capability,
      outputKey: task.outputKey,
      priority: task.priority,
      mode: task.mode,
      reason: "missing_local_coverage",
      preferredEvidence: task.preferredEvidence,
      fallbackEvidence: task.fallbackEvidence
    }));

  const remoteExecution = await executeRemoteTaskQueue(match, remoteTaskQueue, {
    dayKey,
    research,
    support: enrichedSupport,
    researchedFacts,
    teamNewsContext,
    refereeContext,
    competitionContext,
    lineupContext,
    historyContext,
    formGuide,
    headToHeadGuide
  });

  const mergedResearchedFacts = mergeRemoteExecutionIntoFacts(
    researchedFacts,
    remoteExecution
  );

  const normalizedSourceAudit = normalizeSourceAudit(
    sourceAudit,
    mergedResearchedFacts,
    remoteExecution
  );

  const normalizedTaskLayer = normalizeTaskLayer(
    taskExecution,
    remoteExecution
  );

  const normalizedAiContext = normalizeAiContext(
    aiContext,
    mergedResearchedFacts
  );

  const normalizedRemoteExecution = {
    ...(remoteExecution || {}),
    executedQueueSize: Number.isFinite(Number(remoteExecution?.queueSize))
      ? Number(remoteExecution.queueSize)
      : (Array.isArray(remoteExecution?.results) ? remoteExecution.results.length : 0),
    queueSize: normalizedTaskLayer.remoteTaskQueue.length,
    unresolvedCapabilities: normalizedTaskLayer.remoteTaskRouter.queuedCapabilities,
    resolvedCapabilities: normalizedTaskLayer.tasks
      .filter(task => task.state === "done" && task.resolution === "remote")
      .map(task => task.capability)
  };

  return {
    ai: {
      tasks: normalizedTaskLayer.tasks
    },
    researchedFacts: mergedResearchedFacts,
    aiContext: normalizedAiContext,
    phase: aiContext?.phase || null,
    sourceAudit: normalizedSourceAudit,
    learningMeta,
    remoteTaskQueue: normalizedTaskLayer.remoteTaskQueue,
    remoteTaskRouter: normalizedTaskLayer.remoteTaskRouter,
    remoteExecution: normalizedRemoteExecution
  };
}