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
import { buildTravelContext } from "../core/travel-context.js";
import { buildMatchProfileContext } from "../core/match-profile-context.js";
import { buildEvidenceBundle } from "./build-evidence-bundle.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

function normalizeLocalRefereeFact(refereeContext) {
  if (!refereeContext?.data) {
    return {
      key: "referee_profile",
      status: "empty",
      data: null,
      confidence: 0,
      source: "local-referees",
      reason: "missing_local_referee_evidence"
    };
  }

  const reliability =
    refereeContext?.data?.reliability ||
    refereeContext?.reliability ||
    "usable";

  return {
    key: "referee_profile",
    status: "ok",
    data: {
      ...(refereeContext.data || {}),
      reliability
    },
    confidence: refereeContext?.confidence ?? 0.6,
    source: refereeContext?.source || "local-referees",
    reliability,
    reason: refereeContext?.reason || null
  };
}

function normalizeLocalTeamNewsFact(teamNewsContext) {
  if (!teamNewsContext?.data) {
    return {
      key: "team_news",
      status: "empty",
      data: null,
      confidence: 0,
      source: "local-team-news",
      reason: "missing_local_team_news_evidence"
    };
  }

  const homeCount = Array.isArray(teamNewsContext?.data?.homeTeam?.notes)
    ? teamNewsContext.data.homeTeam.notes.length
    : 0;

  const awayCount = Array.isArray(teamNewsContext?.data?.awayTeam?.notes)
    ? teamNewsContext.data.awayTeam.notes.length
    : 0;

  const evidenceCount = homeCount + awayCount;
  const bothSides = homeCount > 0 && awayCount > 0;

  const reliability =
    teamNewsContext?.data?.reliability ||
    teamNewsContext?.reliability ||
    (
      evidenceCount <= 0
        ? "empty"
        : (evidenceCount >= 2 || bothSides)
          ? "usable"
          : "thin"
    );

  return {
    key: "team_news",
    status: "ok",
    data: {
      ...(teamNewsContext.data || {}),
      reliability
    },
    confidence: teamNewsContext?.confidence ?? 0.6,
    source: teamNewsContext?.source || "local-team-news",
    reliability,
    reason: teamNewsContext?.reason || null
  };
}

function resolveProjectRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
}

function resolveValueFile(dayKey) {
  return path.join(resolveProjectRoot(), "data", "value", `${dayKey}.json`);
}

function readJsonSafe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

function loadValuePicksForMatch(dayKey, matchId) {
  if (!dayKey || !matchId) return [];

  const file = resolveValueFile(dayKey);
  if (!fs.existsSync(file)) return [];

  const payload = readJsonSafe(file);
  const picks = Array.isArray(payload?.picks) ? payload.picks : [];

  return picks.filter(p => String(p?.matchId) === String(matchId));
}


export async function buildAiDetailsBlock(match, { dayKey, valuePicks } = {}) {
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
  const travelContext = buildTravelContext(match);

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

  const hydratedValuePicks =
    Array.isArray(valuePicks) && valuePicks.length
      ? valuePicks
      : loadValuePicksForMatch(dayKey, match?.matchId);

  const support = loadIntelligenceSupport(
    dayKey,
    match.matchId,
    hydratedValuePicks
  );

  const matchProfileContext = buildMatchProfileContext(match, {
    historyContext,
    formGuide,
    headToHeadGuide,
    competitionContext,
    refereeContext,
    teamNewsContext,
    lineupContext,
    travelContext,
    valueSummary: support?.valueSummary || null
  });


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

const research = await fetchMatchResearch(match, {
  useCache: false,
  allowRemote: true,
  context: {
    competitionContext,
    refereeContext,
    teamNewsContext,
    lineupContext,
    historyContext,
    formGuide,
    headToHeadGuide,
    matchProfileContext,
    support: enrichedSupport
  }
});

  const aiContext = inferMatchContext(match, {
    ...enrichedSupport,
    research,
    competitionContext,
    refereeContext,
    teamNewsContext,
    lineupContext,
    historyContext,
    formGuide,
    headToHeadGuide,
    matchProfileContext
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
    matchProfileContext,
    support
  });

  const researchedFacts = {
    status: "structured",

    competitionContext,
    matchProfile: matchProfileContext,
    refereeProfile: normalizeLocalRefereeFact(refereeContext),
    teamNews: normalizeLocalTeamNewsFact(teamNewsContext),
    travelContext: travelContext?.data
      ? travelContext
      : {
          key: "travel_context",
          status: "empty",
          data: null,
          confidence: 0,
          source: "local-team-geo",
          reason: "missing_local_team_geo_evidence"
        },
    expectedLineups: lineupContext?.data
      ? {
          key: "expected_lineups",
          status: lineupContext?.status === "empty" ? "empty" : "ok",
          data: {
            ...(lineupContext.data || {}),
            reliability: lineupContext?.reliability || "empty"
          },
          confidence: lineupContext.confidence ?? 0.6,
          source: "local-lineup-model",
          reliability: lineupContext?.reliability || "empty",
          diagnostics: lineupContext?.diagnostics || null
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
  if (!competitionContext?.data) {
    missing.push("competition_context");
  } else if (competitionContext?.status !== "ready") {
    missing.push("competition_context_reliability");
  }

  const refereeReliability = String(
    refereeContext?.data?.reliability ||
    refereeContext?.reliability ||
    ""
  );

  if (!refereeContext?.data) {
    missing.push("referee_profile");
  } else if (refereeReliability && refereeReliability !== "usable") {
    missing.push("referee_profile_reliability");
  }
  const teamNewsReliability = String(
    teamNewsContext?.data?.reliability ||
    teamNewsContext?.reliability ||
    ""
  );

  if (!teamNewsContext?.data) {
    missing.push("team_news");
  } else if (teamNewsReliability && teamNewsReliability !== "usable") {
    missing.push("team_news_reliability");
  }
  const lineupReliability = String(
    lineupContext?.data?.reliability ||
    lineupContext?.reliability ||
    ""
  );

  if (!lineupContext?.data) {
    missing.push("expected_lineups");
  } else if (lineupReliability && lineupReliability !== "usable") {
    missing.push("expected_lineups_reliability");
  }

  if (!travelContext?.data && travelContext?.status !== "not_applicable") {
    missing.push("travel_context");
  }

  if (!support.hasValue) missing.push("value_snapshot");

  const sourceAudit = {
    status: evidenceBundle.status,
    sourcesUsed: evidenceBundle.summary.providers,
    conflicts: [],
    missing,
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
    hasTravel: !!travelContext?.data,
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

  function mergeRemoteExecutionIntoFacts(baseFacts, researchEnvelope, remoteExecutionResult) {
    const merged = { ...(baseFacts || {}) };
    const results = Array.isArray(remoteExecutionResult?.results)
      ? remoteExecutionResult.results
      : [];

    if (researchEnvelope?.teamNews) {
      merged.teamNews = {
        status: "ok",
        source: Array.isArray(researchEnvelope?.sources) && researchEnvelope.sources.length
          ? researchEnvelope.sources.join(",")
          : "remote-research-envelope",
        confidence: 0.6,
        data: researchEnvelope.teamNews
      };
    }

    if (researchEnvelope?.referee) {
      merged.refereeProfile = {
        status: "ok",
        source: Array.isArray(researchEnvelope?.sources) && researchEnvelope.sources.length
          ? researchEnvelope.sources.join(",")
          : "remote-research-envelope",
        confidence: 0.6,
        data: researchEnvelope.referee
      };
    }

    if (researchEnvelope?.competitionContext) {
      merged.competitionContext = {
        ...(merged.competitionContext || {}),
        status: "ok",
        source: Array.isArray(researchEnvelope?.sources) && researchEnvelope.sources.length
          ? researchEnvelope.sources.join(",")
          : "remote-research-envelope",
        confidence: 0.6,
        data: researchEnvelope.competitionContext
      };
    }

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

    const lineupOk = finalFacts?.expectedLineups?.status === "ok";
    const lineupReliability = String(
      finalFacts?.expectedLineups?.data?.reliability ||
      finalFacts?.expectedLineups?.reliability ||
      ""
    );
    const lineupLimited = lineupReliability === "limited";

    const teamNewsOk = finalFacts?.teamNews?.status === "ok";
    const teamNewsReliability = String(
      finalFacts?.teamNews?.data?.reliability ||
      finalFacts?.teamNews?.reliability ||
      ""
    );
    const teamNewsThin = teamNewsReliability === "thin";

    const refereeOk = finalFacts?.refereeProfile?.status === "ok";
    const refereeReliability = String(
      finalFacts?.refereeProfile?.data?.reliability ||
      finalFacts?.refereeProfile?.reliability ||
      ""
    );
    const refereeIdentityOnly = refereeReliability === "identity_only";
    const travelReady = finalFacts?.travelContext?.status === "ready";
    const travelSource = String(finalFacts?.travelContext?.source || "");

    if (lineupOk) {
      missing.delete("expected_lineups");
    }

    if (lineupLimited) {
      missing.add("expected_lineups_reliability");
    } else if (lineupOk) {
      missing.delete("expected_lineups_reliability");
    }

    if (teamNewsOk) {
      missing.delete("team_news");
    }

    if (teamNewsThin) {
      missing.add("team_news_reliability");
    } else if (teamNewsOk) {
      missing.delete("team_news_reliability");
    }

    const travelStatus = finalFacts?.travelContext?.status;
    if (travelReady || travelStatus === "not_applicable") {
      missing.delete("travel_context");
      missing.delete("travel_geo");
      if (travelReady && travelSource) sourcesUsed.add(travelSource);
    } else {
      missing.add("travel_context");
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

    const competitionSuspect =
      finalFacts?.competitionContext?.data?.diagnostics?.reason ===
      "possible_cross_competition_mismatch";

    const normalizedEvidence = Array.isArray(audit.evidence)
      ? audit.evidence.map(item => {
          if (!item) return item;

          if (item.kind === "competition_context_local") {
            if (competitionSuspect) {
              return {
                ...item,
                trustClass: "suspect_local",
                confidence: Math.min(Number(item.confidence ?? 0.8), 0.3),
                status: "limited",
                meta: {
                  ...(item.meta || {}),
                  diagnosticsReason: "possible_cross_competition_mismatch"
                }
              };
            }

            if (finalFacts?.competitionContext?.status !== "ready") {
              return {
                ...item,
                trustClass: "fallback_local",
                confidence: Math.min(Number(item.confidence ?? 0.8), 0.45),
                status: "limited"
              };
            }

            return item;
          }

          if (item.kind === "referee_profile") {
            if (refereeIdentityOnly) {
              return {
                ...item,
                trustClass: "identity_only_local",
                confidence: Math.min(Number(item.confidence ?? 0.6), 0.45),
                status: "limited",
                meta: {
                  ...(item.meta || {}),
                  reliability: "identity_only"
                }
              };
            }

            return item;
          }

          if (item.kind === "team_news") {
            if (teamNewsThin) {
              return {
                ...item,
                trustClass: "thin_local",
                confidence: Math.min(Number(item.confidence ?? 0.55), 0.42),
                status: "limited",
                meta: {
                  ...(item.meta || {}),
                  reliability: "thin"
                }
              };
            }

            return item;
          }

          if (item.kind === "expected_lineups") {
            if (lineupLimited) {
              return {
                ...item,
                trustClass: "limited_local",
                confidence: Math.min(Number(item.confidence ?? 0.55), 0.42),
                status: "limited",
                meta: {
                  ...(item.meta || {}),
                  reliability: "limited"
                }
              };
            }

            return item;
          }

          return item;
        })
      : [];

    const trustSummary =
      competitionSuspect
        ? "local_evidence_with_competition_suspect_context"
        : missing.size === 0
          ? "local_and_remote_evidence_available"
          : sourcesUsed.size > 0
            ? "partial_remote_enrichment"
            : (audit.trustSummary || "local_only_partial");

    return {
      ...audit,
      sourcesUsed: Array.from(sourcesUsed),
      missing: Array.from(missing),
      trustSummary,
      evidence: normalizedEvidence
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

    const remoteResearchUsed = !research?.skipped && (
      !!research?.cacheHit ||
      !!research?.competitionContext ||
      !!research?.referee ||
      !!research?.teamNews ||
      !!research?.lineups ||
      (Array.isArray(research?.sources) && research.sources.length > 0)
    );

    const lineupUsed = finalFacts?.expectedLineups?.status === "ok";
    const lineupReliability = String(
      finalFacts?.expectedLineups?.data?.reliability ||
      finalFacts?.expectedLineups?.reliability ||
      ""
    );
    const lineupLimited = lineupReliability === "limited";
    const lineupUsable = lineupUsed && lineupReliability !== "limited";

    const teamNewsUsed = finalFacts?.teamNews?.status === "ok";
    const teamNewsReliability = String(
      finalFacts?.teamNews?.data?.reliability ||
      finalFacts?.teamNews?.reliability ||
      ""
    );
    const teamNewsThin = teamNewsReliability === "thin";
    const teamNewsUsable = teamNewsUsed && teamNewsReliability !== "thin";

    const refereeUsed = finalFacts?.refereeProfile?.status === "ok";
    const refereeReliability = String(
      finalFacts?.refereeProfile?.data?.reliability ||
      finalFacts?.refereeProfile?.reliability ||
      ""
    );
    const refereeIdentityOnly = refereeReliability === "identity_only";
    const refereeUsable = refereeUsed && refereeReliability !== "identity_only";

    const travelReady = finalFacts?.travelContext?.status === "ready";
    const travelData = finalFacts?.travelContext?.data || null;
    const travelProfile = String(travelData?.travelProfile || "unknown");
    const travelImpact = String(travelData?.impact || "unknown");
    const travelCrossBorder = travelData?.crossBorder === true;
    const travelDistanceKm =
      typeof travelData?.distanceKm === "number"
        ? travelData.distanceKm
        : null;

    const competitionStatus = String(finalFacts?.competitionContext?.status || "");
    const competitionReason =
      finalFacts?.competitionContext?.data?.diagnostics?.reason || null;
    const competitionConfidence =
      finalFacts?.competitionContext?.confidence ?? 0;

    const competitionReady = competitionStatus === "ready";
    const competitionSuspect =
      competitionReason === "possible_cross_competition_mismatch";
    const competitionLimited =
      !competitionReady && !competitionSuspect;

    support.researchUsed = remoteResearchUsed;
    support.cacheHit = remoteResearchUsed ? !!research?.cacheHit : false;
    support.lineupUsed = lineupUsable;
    support.lineupLimited = lineupLimited;
    support.lineupReliability = lineupReliability || "empty";
    support.teamNewsUsed = teamNewsUsable;
    support.teamNewsThin = teamNewsThin;
    support.teamNewsReliability = teamNewsReliability || "empty";
    support.refereeUsed = refereeUsable;
    support.refereeIdentityOnly = refereeIdentityOnly;
    support.refereeReliability = refereeReliability || "empty";

    support.travelUsed = travelReady;
    support.travelProfile = travelProfile;
    support.travelImpact = travelImpact;
    support.travelCrossBorder = travelCrossBorder;
    support.travelDistanceKm = travelDistanceKm;

    support.competitionContextUsed = competitionReady;
    support.competitionContextSuspect = competitionSuspect;
    support.competitionContextLimited = competitionLimited;
    support.competitionContextConfidence = competitionConfidence;

    if (lineupUsable && !signals.includes("lineup_context_available")) {
      signals.push("lineup_context_available");
    }

    if (lineupLimited && !signals.includes("lineup_context_limited")) {
      signals.push("lineup_context_limited");
    }

    if (teamNewsUsable && !signals.includes("team_news_available")) {
      signals.push("team_news_available");
    }

    if (teamNewsThin && !signals.includes("team_news_thin")) {
      signals.push("team_news_thin");
    }

    if (refereeUsable && !signals.includes("referee_profile_available")) {
      signals.push("referee_profile_available");
    }

    if (refereeIdentityOnly && !signals.includes("referee_profile_identity_only")) {
      signals.push("referee_profile_identity_only");
    }

    if (travelReady && !signals.includes("travel_context_available")) {
      signals.push("travel_context_available");
    }

    if (travelCrossBorder && !signals.includes("travel_cross_border")) {
      signals.push("travel_cross_border");
    }

    if (
      (travelProfile === "long_domestic" || travelImpact === "high" || travelImpact === "very_high") &&
      !signals.includes("travel_burden_high")
    ) {
      signals.push("travel_burden_high");
    }

    const sanitizedSignals = signals.filter(
      signal =>
        signal !== "lineup_context_available" &&
        signal !== "lineup_context_limited" &&
        signal !== "competition_context_available" &&
        signal !== "competition_context_ready" &&
        signal !== "competition_context_suspect" &&
        signal !== "competition_context_limited" &&
        signal !== "travel_context_available" &&
        signal !== "travel_cross_border" &&
        signal !== "travel_burden_high"
    );

    if (lineupUsable) {
      sanitizedSignals.push("lineup_context_available");
    } else if (lineupLimited) {
      sanitizedSignals.push("lineup_context_limited");
    }

    if (competitionReady) {
      sanitizedSignals.push("competition_context_ready");
    } else if (competitionSuspect) {
      sanitizedSignals.push("competition_context_suspect");
    } else if (competitionLimited) {
      sanitizedSignals.push("competition_context_limited");
    }

    if (travelReady) {
      sanitizedSignals.push("travel_context_available");
    }

    if (travelCrossBorder) {
      sanitizedSignals.push("travel_cross_border");
    }

    if (
      travelReady &&
      (travelProfile === "long_domestic" || travelImpact === "high" || travelImpact === "very_high")
    ) {
      sanitizedSignals.push("travel_burden_high");
    }

    let summary = ctx.summary;
    if (summary && typeof summary === "object") {
      summary = {
        ...summary,
        teamNews: {
          status: teamNewsUsable ? "usable" : teamNewsThin ? "thin" : "empty",
          source: finalFacts?.teamNews?.source || null,
          reliability:
            finalFacts?.teamNews?.data?.reliability ||
            finalFacts?.teamNews?.reliability ||
            null,
          evidenceCount:
            typeof finalFacts?.teamNews?.data?.evidenceCount === "number"
              ? finalFacts.teamNews.data.evidenceCount
              : 0
        }
      };

      if (teamNewsUsable) {
        if (typeof summary.el === "string" && !summary.el.includes("team news")) {
          summary.el = `${summary.el} Υπάρχει διαθέσιμο team news context στο enriched snapshot.`;
        }
        if (typeof summary.en === "string" && !summary.en.includes("team news")) {
          summary.en = `${summary.en} Team news context is available in the enriched snapshot.`;
        }
      } else if (teamNewsThin) {
        if (typeof summary.el === "string" && !summary.el.includes("περιορισμένο team news")) {
          summary.el = `${summary.el} Υπάρχει περιορισμένο team news context με χαμηλή πληρότητα.`;
        }
        if (typeof summary.en === "string" && !summary.en.includes("limited team news")) {
          summary.en = `${summary.en} Limited team news context is available with low completeness.`;
        }
      }

      if (lineupUsable) {
        if (typeof summary.el === "string" && !summary.el.includes("lineup")) {
          summary.el = `${summary.el} Υπάρχει διαθέσιμο lineup context στο enriched snapshot.`;
        }
        if (typeof summary.en === "string" && !summary.en.includes("lineup")) {
          summary.en = `${summary.en} Lineup context is available in the enriched snapshot.`;
        }
      } else if (lineupLimited) {
        if (typeof summary.el === "string" && !summary.el.includes("περιορισμένο lineup")) {
          summary.el = `${summary.el} Υπάρχει περιορισμένο lineup context με χαμηλή πληρότητα.`;
        }
        if (typeof summary.en === "string" && !summary.en.includes("limited lineup")) {
          summary.en = `${summary.en} Limited lineup context is available with low completeness.`;
        }
      }

      if (refereeUsable) {
        if (typeof summary.el === "string" && !summary.el.includes("διαιτητ")) {
          summary.el = `${summary.el} Υπάρχει διαθέσιμο referee profile στο enriched snapshot.`;
        }
        if (typeof summary.en === "string" && !summary.en.includes("referee")) {
          summary.en = `${summary.en} Referee profile is available in the enriched snapshot.`;
        }
      } else if (refereeIdentityOnly) {
        if (typeof summary.el === "string" && !summary.el.includes("ταυτότητα διαιτητή")) {
          summary.el = `${summary.el} Υπάρχει μόνο ταυτότητα διαιτητή χωρίς επαρκή στατιστικά αξιοπιστίας.`;
        }
        if (typeof summary.en === "string" && !summary.en.includes("referee identity")) {
          summary.en = `${summary.en} Only referee identity is available without enough reliable statistical profile.`;
        }
      }

      if (travelReady) {
        if (typeof summary.el === "string" && !summary.el.includes("travel context")) {
          summary.el = `${summary.el} Υπάρχει διαθέσιμο travel context από το local geo substrate.`;
        }
        if (typeof summary.en === "string" && !summary.en.includes("travel context")) {
          summary.en = `${summary.en} Travel context is available from the local geo substrate.`;
        }
      }

      if (travelCrossBorder) {
        if (typeof summary.el === "string" && !summary.el.includes("διασυνοριακή μετακίνηση")) {
          summary.el = `${summary.el} Καταγράφεται διασυνοριακή μετακίνηση για την εκτός έδρας ομάδα.`;
        }
        if (typeof summary.en === "string" && !summary.en.includes("cross-border")) {
          summary.en = `${summary.en} A cross-border trip is recorded for the away side.`;
        }
      } else if (
        travelReady &&
        (travelProfile === "long_domestic" || travelImpact === "high" || travelImpact === "very_high")
      ) {
        if (typeof summary.el === "string" && !summary.el.includes("μεγάλη εσωτερική μετακίνηση")) {
          summary.el = `${summary.el} Καταγράφεται μεγάλη εσωτερική μετακίνηση για την εκτός έδρας ομάδα.`;
        }
        if (typeof summary.en === "string" && !summary.en.includes("long domestic trip")) {
          summary.en = `${summary.en} A long domestic trip is recorded for the away side.`;
        }
      }

      if (competitionSuspect) {
        if (typeof summary.el === "string" && !summary.el.includes("ασυμφωνία διοργάνωσης")) {
          summary.el = `${summary.el} Το competition context παραμένει ύποπτο για πιθανή ασυμφωνία διοργάνωσης από την πηγή.`;
        }
        if (typeof summary.en === "string" && !summary.en.includes("competition mismatch")) {
          summary.en = `${summary.en} The competition context remains suspect for a possible source-side competition mismatch.`;
        }
      } else if (competitionLimited) {
        if (typeof summary.el === "string" && !summary.el.includes("βαθμολογικό πλαίσιο")) {
          summary.el = `${summary.el} Το διαθέσιμο βαθμολογικό πλαίσιο παραμένει περιορισμένης αξιοπιστίας.`;
        }
        if (typeof summary.en === "string" && !summary.en.includes("standings context")) {
          summary.en = `${summary.en} The available standings context remains reliability-limited.`;
        }
      }
    }
    return {
      ...ctx,
      support,
      signals: sanitizedSignals,
      summary
    };
  }

  function buildTaskExecution(task) {
    const capability = String(task?.capability || task?.key || "");
    const outputKey = task?.outputKey || null;

    const fact = outputKey ? researchedFacts?.[outputKey] : null;
    const factStatus = String(fact?.status || "").toLowerCase();

    let state = "pending";
    let resolution = "missing_local";
    let provider = null;
    let confidence = 0;
    let remoteFallbackRecommended = Array.isArray(task?.fallbackEvidence)
      && task.fallbackEvidence.length > 0;

    if (capability === "competition_context") {
      if (competitionContext?.data) {
        state = "done";

        if (
          competitionContext?.data?.diagnostics?.reason ===
          "possible_cross_competition_mismatch"
        ) {
          resolution = "suspect_local";
        } else if (competitionContext?.status === "fallback") {
          resolution = "fallback_local";
        } else {
          resolution = "deterministic_local";
        }

        provider = "local-standings";
        confidence = competitionContext?.confidence ?? 0.3;
      }
    } else if (capability === "referee_profile") {
      const refereeReliability = String(
        refereeContext?.data?.reliability ||
        refereeContext?.reliability ||
        ""
      );

      if (refereeContext?.data && hasEvidenceKind("referee_profile")) {
        state = "done";
        resolution =
          refereeReliability === "identity_only"
            ? "identity_only_local"
            : "deterministic_local";
        provider = "local-referees";
        confidence =
          refereeReliability === "identity_only"
            ? Math.min(refereeContext?.confidence ?? 0.6, 0.45)
            : (refereeContext?.confidence ?? 0.6);
      }
    } else if (capability === "team_news") {
      const teamNewsReliability = String(
        teamNewsContext?.data?.reliability ||
        teamNewsContext?.reliability ||
        ""
      );

      if (teamNewsContext?.data && hasEvidenceKind("team_news")) {
        state = "done";
        resolution =
          teamNewsReliability === "thin"
            ? "thin_local"
            : "deterministic_local";
        provider = "local-team-news";
        confidence =
          teamNewsReliability === "thin"
            ? Math.min(teamNewsContext?.confidence ?? 0.55, 0.42)
            : (teamNewsContext?.confidence ?? 0.55);
      }
    } else if (capability === "expected_lineups") {
      const lineupReliability = String(
        lineupContext?.data?.reliability ||
        lineupContext?.reliability ||
        ""
      );

      if (lineupContext?.data) {
        state = "done";
        resolution =
          lineupReliability === "limited"
            ? "limited_local"
            : "deterministic_local";
        provider = "local-lineup-model";
        confidence =
          lineupReliability === "limited"
            ? Math.min(lineupContext?.confidence ?? 0.55, 0.42)
            : (lineupContext?.confidence ?? 0.55);
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

  const remoteExecution = {
    status: research?.remoteStatus || "idle",
    queueSize: remoteTaskQueue.length,
    providersTried: Array.isArray(research?.sources) ? research.sources : [],
    results: Array.isArray(research?.remoteResults) ? research.remoteResults : []
  };

  const mergedResearchedFacts = mergeRemoteExecutionIntoFacts(
    researchedFacts,
    research,
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
    executedQueueSize: Array.isArray(remoteExecution?.results)
      ? remoteExecution.results.length
      : 0,
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
    travelContext: mergedResearchedFacts?.travelContext || null,
    aiContext: normalizedAiContext,
    phase: aiContext?.phase || null,
    sourceAudit: normalizedSourceAudit,
    learningMeta,
    remoteTaskQueue: normalizedTaskLayer.remoteTaskQueue,
    remoteTaskRouter: normalizedTaskLayer.remoteTaskRouter,
    remoteExecution: normalizedRemoteExecution
  };
}