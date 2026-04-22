import { readResearchCache, writeResearchCache } from "./research-cache.js";
import { executeRemoteTaskQueue } from "./execute-remote-task-queue.js";
import { buildResearchPlan } from "./build-research-plan.js";
import {
  readTeamNewsRecord,
  writeTeamNewsRecord
} from "../storage/team-news-db.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeAbsence(item = {}) {
  const player = normalizeText(item?.player);
  const reason = normalizeText(item?.reason);
  const importance = normalizeText(item?.importance || "medium").toLowerCase();

  if (!player && !reason) return null;

  return {
    player: player || null,
    reason: reason || null,
    importance:
      importance === "high" || importance === "medium" || importance === "low"
        ? importance
        : "medium"
  };
}

function dedupeAbsences(items = []) {
  const out = [];
  const seen = new Set();

  for (const raw of Array.isArray(items) ? items : []) {
    const item = normalizeAbsence(raw);
    if (!item) continue;

    const key = [
      normalizeText(item.player).toLowerCase(),
      normalizeText(item.reason).toLowerCase(),
      normalizeText(item.importance).toLowerCase()
    ].join("__");

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

function dedupeNotes(items = []) {
  const out = [];
  const seen = new Set();

  for (const raw of Array.isArray(items) ? items : []) {
    const note = normalizeText(raw);
    if (!note) continue;

    const key = note.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(note);
  }

  return out;
}

function buildCanonicalTeamNewsRecord(teamName, sideData, source = "remote_research") {
  const team = normalizeText(teamName);
  if (!team) return null;

  const absences = dedupeAbsences(sideData?.absences || []);
  const notes = dedupeNotes(sideData?.notes || []);

  if (absences.length <= 0 && notes.length <= 0) {
    return null;
  }

  return {
    team,
    absences,
    notes,
    source,
    updatedAt: new Date().toISOString()
  };
}

function mergeCanonicalTeamNews(existing, incoming) {
  if (!incoming) return existing || null;
  if (!existing) return incoming;

  return {
    team: incoming.team,
    absences: dedupeAbsences([
      ...(existing?.absences || []),
      ...(incoming?.absences || [])
    ]),
    notes: dedupeNotes([
      ...(existing?.notes || []),
      ...(incoming?.notes || [])
    ]),
    source: incoming.source || existing.source || "remote_research",
    updatedAt: new Date().toISOString()
  };
}

function persistCanonicalTeamNewsFromResearch(match, normalized) {
  const payload = normalized?.teamNews;
  if (!payload || typeof payload !== "object") {
    return {
      persisted: false,
      reason: "missing_team_news_payload"
    };
  }

  const homeIncoming = buildCanonicalTeamNewsRecord(
    match?.homeTeam,
    payload?.home || payload?.homeTeam || null,
    "remote_research"
  );

  const awayIncoming = buildCanonicalTeamNewsRecord(
    match?.awayTeam,
    payload?.away || payload?.awayTeam || null,
    "remote_research"
  );

  const writes = [];

  for (const incoming of [homeIncoming, awayIncoming]) {
    if (!incoming) continue;

    const existing = readTeamNewsRecord(incoming.team);
    const merged = mergeCanonicalTeamNews(existing, incoming);
    writeTeamNewsRecord(merged);

    writes.push({
      team: merged.team,
      absencesCount: Array.isArray(merged.absences) ? merged.absences.length : 0,
      notesCount: Array.isArray(merged.notes) ? merged.notes.length : 0
    });
  }

  return {
    persisted: writes.length > 0,
    writes
  };
}

function applyFallbackEvidence(normalized, fallbackEvidence = {}) {
  const out = {
    ...normalized
  };

  if (!out.teamNews && fallbackEvidence?.teamNews) {
    out.teamNews = fallbackEvidence.teamNews;
    out.sources = Array.isArray(out.sources)
      ? [...new Set([...out.sources, "fallback-team-news-evidence"])]
      : ["fallback-team-news-evidence"];
  }

  if (!out.referee && fallbackEvidence?.referee) {
    out.referee = fallbackEvidence.referee;
    out.sources = Array.isArray(out.sources)
      ? [...new Set([...out.sources, "fallback-referee-evidence"])]
      : ["fallback-referee-evidence"];
  }

  if (!out.competitionContext && fallbackEvidence?.competitionContext) {
    out.competitionContext = fallbackEvidence.competitionContext;
    out.sources = Array.isArray(out.sources)
      ? [...new Set([...out.sources, "fallback-competition-context-evidence"])]
      : ["fallback-competition-context-evidence"];
  }

  return out;
}

function remoteResearchEnabled(explicitFlag) {
  if (explicitFlag === true) return true;
  if (explicitFlag === false) return false;

  const raw = String(process.env.AI_REMOTE_RESEARCH || "").trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes" || raw === "on";
}

function pickTaskResult(results, capability) {
  return (Array.isArray(results) ? results : []).find(
    item => String(item?.capability || "") === String(capability || "")
  ) || null;
}

function buildRemoteQueueTasks(match) {
  const plan = buildResearchPlan(match);
  const tasks = Array.isArray(plan?.tasks) ? plan.tasks : [];

  return tasks
    .filter(
      task =>
        Array.isArray(task?.fallbackEvidence) &&
        task.fallbackEvidence.length > 0
    )
    .map(task => ({
      key: task.key,
      capability: task.capability
    }));
}

function hasContextualResearchHints(context = {}) {
  return Boolean(
    context?.refereeContext?.data ||
    context?.teamNewsContext?.data ||
    context?.research?.referee ||
    context?.research?.teamNews
  );
}

function normalizeResearchEnvelope(queueResult) {
  const results = Array.isArray(queueResult?.results) ? queueResult.results : [];

  const refereeTask = pickTaskResult(results, "referee_profile");
  const teamNewsTask = pickTaskResult(results, "team_news");

  const referee =
    refereeTask && (refereeTask.status === "success" || refereeTask.status === "partial")
      ? (refereeTask.data || null)
      : null;

  const teamNews =
    teamNewsTask && (teamNewsTask.status === "success" || teamNewsTask.status === "partial")
      ? (teamNewsTask.data || null)
      : null;

  const sources = [
    ...new Set(
      results
        .flatMap(item => [
          item?.provider,
          ...(Array.isArray(item?.providersTried) ? item.providersTried : [])
        ])
        .filter(Boolean)
    )
  ];

  return {
    competitionContext: null,
    referee,
    teamNews,
    lineups: null,
    sources,
    remoteStatus: queueResult?.status || "unavailable",
    remoteResults: results
  };
}

export async function fetchMatchResearch(
  match,
  {
    useCache = true,
    allowRemote = false,
    remoteEnabled: remoteEnabledOverride,
    fallbackEvidence = {},
    context = {}
  } = {}
) {
  const remoteEnabled = remoteResearchEnabled(
    typeof remoteEnabledOverride === "boolean"
      ? remoteEnabledOverride
      : allowRemote
  );
  const contextHints = hasContextualResearchHints(context);

  console.log("[ai-research] fetch:start", match.matchId, {
    homeTeam: match.homeTeam,
    awayTeam: match.awayTeam,
    leagueSlug: match.leagueSlug,
    remoteEnabled,
    contextHints
  });

  if (!remoteEnabled) {
    console.log("[ai-research] fetch:skipped", match.matchId, "remote_research_disabled");

    return {
      competitionContext: null,
      referee: null,
      teamNews: null,
      lineups: null,
      sources: [],
      remoteStatus: "skipped",
      remoteResults: [],
      cacheHit: false,
      skipped: true,
      skippedReason: "remote_research_disabled"
    };
  }

  if (useCache && !contextHints) {
    const cached = readResearchCache(match.matchId, { maxAgeMinutes: 180 });
    if (cached?.payload) {
      console.log("[ai-research] cache:hit", match.matchId);
      return {
        ...cached.payload,
        cacheHit: true,
        skipped: false
      };
    }
  }

  const queueTasks = buildRemoteQueueTasks(match);

  const queueResult = await executeRemoteTaskQueue(
    match,
    queueTasks,
    {
      ...context,
      remoteResearchEnabled: remoteEnabled
    }
  );

  const normalizedBase = normalizeResearchEnvelope(queueResult);
  const normalized = applyFallbackEvidence(normalizedBase, fallbackEvidence);
  const canonicalTeamNewsWrite = persistCanonicalTeamNewsFromResearch(match, normalized);

  console.log("[ai-research] fetch:done", match.matchId, {
    remoteStatus: normalized.remoteStatus,
    hasCompetitionContext: !!normalized.competitionContext,
    hasReferee: !!normalized.referee,
    hasTeamNews: !!normalized.teamNews,
    sources: normalized.sources,
    queueTasks: queueTasks.map(task => task.key),
    contextHints,
    canonicalTeamNewsWrite
  });

  writeResearchCache(match.matchId, normalized);

  return {
    ...normalized,
    cacheHit: false,
    skipped: false
  };
}