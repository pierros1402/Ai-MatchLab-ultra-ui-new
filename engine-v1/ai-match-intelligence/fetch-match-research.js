import { readResearchCache, writeResearchCache } from "./research-cache.js";
import { executeRemoteTaskQueue } from "./execute-remote-task-queue.js";
import { buildResearchPlan } from "./build-research-plan.js";
import { readTeamNewsRecord, writeTeamNewsRecord } from "../storage/team-news-db.js";

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


function buildCanonicalTeamNewsRecord(
  teamName,
  sideData,
  {
    source = "remote_research",
    leagueSlug = null,
    sourceMeta = null
  } = {}
) {
  const team = normalizeText(teamName);
  if (!team) return null;

  const absences = dedupeAbsences(sideData?.absences || []);
  const notes = dedupeNotes(sideData?.notes || []);
  const evidence = dedupeEvidence(sideData?.evidence || []);

  const isRemoteResearch = normalizeText(source) === "remote_research";

  if (isRemoteResearch && (absences.length <= 0 || evidence.length <= 0)) {
    return null;
  }

  if (!isRemoteResearch && absences.length <= 0 && notes.length <= 0) {
    return null;
  }

  return {
    team,
    leagueSlug: normalizeText(leagueSlug) || null,
    absences,
    notes: isRemoteResearch ? [] : notes,
    evidence,
    source,
    sourceMeta: sourceMeta && typeof sourceMeta === "object" ? sourceMeta : {},
    updatedAt: new Date().toISOString()
  };
}

function dedupeEvidence(items = []) {
  const out = [];
  const seen = new Set();

  for (const raw of Array.isArray(items) ? items : []) {
    const text =
      typeof raw === "string"
        ? normalizeText(raw)
        : normalizeText(raw?.text || raw?.label || raw?.source || "");

    if (!text) continue;

    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    if (typeof raw === "string") {
      out.push(raw);
    } else if (raw && typeof raw === "object") {
      out.push(raw);
    } else {
      out.push(text);
    }
  }

  return out;
}

function mergeSourceMeta(existingMeta, incomingMeta) {
  return {
    ...(existingMeta && typeof existingMeta === "object" ? existingMeta : {}),
    ...(incomingMeta && typeof incomingMeta === "object" ? incomingMeta : {})
  };
}


function mergeCanonicalTeamNews(existing, incoming) {
  if (!incoming) return existing || null;
  if (!existing) return incoming;

  const existingSource = normalizeText(existing?.source);
  const existingProvider = normalizeText(existing?.sourceMeta?.provider);
  const existingMode = normalizeText(existing?.sourceMeta?.mode);

  const existingIsManualSeed =
    existingSource === "tracked_team_news_manual_result" ||
    existingProvider === "manual_team_news_seed" ||
    existingMode === "manual_result";

  return {
    key: existing?.key || incoming?.key || null,
    team: incoming.team || existing.team,
    leagueSlug: incoming.leagueSlug || existing.leagueSlug || null,
    matchIds: dedupeNotes([
      ...(existing?.matchIds || []),
      ...(incoming?.matchIds || [])
    ]),
    aliases: dedupeNotes([
      ...(existing?.aliases || []),
      ...(incoming?.aliases || []),
      incoming.team || existing.team
    ]),
    absences: dedupeAbsences([
      ...(existing?.absences || []),
      ...(incoming?.absences || [])
    ]),
    notes: dedupeNotes([
      ...(existing?.notes || []),
      ...(incoming?.notes || [])
    ]),
    evidence: dedupeEvidence([
      ...(existing?.evidence || []),
      ...(incoming?.evidence || [])
    ]),
    source: existingIsManualSeed
      ? (existingSource || "tracked_team_news_manual_result")
      : (incoming.source || existing.source || "remote_research"),
    sourceMeta: mergeSourceMeta(existing?.sourceMeta, incoming?.sourceMeta),
    updatedAt: new Date().toISOString()
  };
}

function persistCanonicalTeamNewsFromResearch(
  match,
  normalized,
  { contextHints = false } = {}
) {
  const payload = normalized?.teamNews;
  if (!payload || typeof payload !== "object") {
    return {
      persisted: false,
      reason: "missing_team_news_payload"
    };
  }

  const homeSide = payload?.home || payload?.homeTeam || null;
  const awaySide = payload?.away || payload?.awayTeam || null;

  const homeIncoming = buildCanonicalTeamNewsRecord(
    match?.homeTeam,
    homeSide,
    {
      source: "remote_research",
      leagueSlug: match?.leagueSlug || null,
      sourceMeta: buildCanonicalTeamNewsSourceMeta(
        match,
        normalized,
        "home",
        homeSide,
        { contextHints }
      )
    }
  );

  const awayIncoming = buildCanonicalTeamNewsRecord(
    match?.awayTeam,
    awaySide,
    {
      source: "remote_research",
      leagueSlug: match?.leagueSlug || null,
      sourceMeta: buildCanonicalTeamNewsSourceMeta(
        match,
        normalized,
        "away",
        awaySide,
        { contextHints }
      )
    }
  );

  const candidates = [];

  for (const incoming of [homeIncoming, awayIncoming]) {
    if (!incoming) continue;

    const existing = readTeamNewsRecord(incoming.team);

    candidates.push({
      team: incoming.team,
      leagueSlug: incoming.leagueSlug || null,
      source: incoming.source || null,
      sourceMeta: incoming.sourceMeta || {},
      absencesCount: Array.isArray(incoming.absences) ? incoming.absences.length : 0,
      notesCount: Array.isArray(incoming.notes) ? incoming.notes.length : 0,
      evidenceCount: Array.isArray(incoming.evidence) ? incoming.evidence.length : 0,
      existingRecord: !!existing
    });
  }

const written = [];

for (const incoming of [homeIncoming, awayIncoming]) {
  if (!incoming) continue;

  const existing = readTeamNewsRecord(incoming.team);
  const merged = mergeCanonicalTeamNews(existing, incoming);

  if (!merged) continue;

  const writeResult = writeTeamNewsRecord(merged);

  written.push({
    team: merged.team,
    filePath: writeResult?.filePath || null,
    absencesCount: Array.isArray(merged.absences) ? merged.absences.length : 0,
    notesCount: Array.isArray(merged.notes) ? merged.notes.length : 0,
    evidenceCount: Array.isArray(merged.evidence) ? merged.evidence.length : 0
  });
}

return {
  persisted: written.length > 0,
  reason: written.length > 0 ? null : "no_canonical_team_news_candidates",
  candidates,
  written
};
}

function buildCanonicalTeamNewsSourceMeta(
  match,
  normalized,
  side,
  sideData,
  { contextHints = false } = {}
) {
  return {
    sourceKind: "remote_research",
    remoteStatus: normalizeText(normalized?.remoteStatus) || null,
    providers: Array.isArray(normalized?.sources) ? normalized.sources : [],
    matchId: normalizeText(match?.matchId) || null,
    leagueSlug: normalizeText(match?.leagueSlug) || null,
    dayKey: normalizeText(match?.dayKey) || null,
    homeTeam: normalizeText(match?.homeTeam || match?.homeTeamName) || null,
    awayTeam: normalizeText(match?.awayTeam || match?.awayTeamName) || null,
    side: normalizeText(side) || null,
    contextHints: !!contextHints,
    absencesCount: Array.isArray(sideData?.absences) ? sideData.absences.length : 0,
    notesCount: Array.isArray(sideData?.notes) ? sideData.notes.length : 0,
    evidenceCount: Array.isArray(sideData?.evidence) ? sideData.evidence.length : 0,
    generatedAt: new Date().toISOString()
  };
}

function applyFallbackEvidence(normalized, fallbackEvidence = {}) {
  const out = {
    ...normalized
  };

  if (
    (!out.teamNews || !out.teamNews?.data) &&
    fallbackEvidence?.teamNews
  ) {
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
    console.log("[ai-research] fetch:local-only", match.matchId, "remote_research_disabled");
  }

  if (useCache && !contextHints && remoteEnabled) {
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
  const canonicalTeamNewsWrite = persistCanonicalTeamNewsFromResearch(match, normalized, {
    contextHints
  });

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
    canonicalTeamNewsWrite,
    cacheHit: false,
    skipped: false
  };
}