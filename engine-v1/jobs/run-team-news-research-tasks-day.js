import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getFixturesByDay } from "../storage/json-db.js";
import { ensureDir, resolveDataPath } from "../storage/data-root.js";
import { runTeamNewsAIProvider } from "../ai-match-intelligence/team-news-ai-provider.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeKey(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeCanonicalTeamKey(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const BAD_ABSENCE_PLAYER_WORDS_RE =
  /\b(honours?|historical|history|overview|stats|statistics|fixtures?|results?|transfers?|market|value|squad|players?|injury\s+update|injuries?|suspensions?|show\s+all|expand|about|latest|news|matches|competitions|teams|settings|languages|login|register|favourites?|televised)\b/i;

function normalizeComparableName(value) {
  return normalizeText(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isLikelyBadAbsencePlayerName(player, team = "") {
  const text = normalizeText(player);
  const compact = normalizeComparableName(text);
  const compactTeam = normalizeComparableName(team);

  if (!text || !compact) {
    return true;
  }

  if (text.length < 4 || text.length > 45) {
    return true;
  }

  if (BAD_ABSENCE_PLAYER_WORDS_RE.test(text)) {
    return true;
  }

  if (compactTeam && compact.includes(compactTeam)) {
    return true;
  }

  const words = compact.split(" ").filter(Boolean);

  if (words.length < 2 || words.length > 4) {
    return true;
  }

  if (words.some(word => word.length < 2)) {
    return true;
  }

  if (/\d/.test(text)) {
    return true;
  }

  return false;
}

function isStrongCanonicalNote(note) {
  const type = normalizeText(note?.type).toLowerCase();
  const source = normalizeText(note?.source);
  const value = normalizeText(note?.value);
  const blocked = note?.meta?.blockedAsEvidence === true;

  if (blocked) {
    return false;
  }

  if (!source || !value) {
    return false;
  }

  if (isBadCanonicalNoteText(value)) {
    return false;
  }

  // Generic provider messages like:
  // "source reports team-news signal (lineup_signal)"
  // are NOT canonical team-news facts.
  if (/source reports team-news signal/i.test(value)) {
    return false;
  }

  if (/trusted registry source/i.test(value)) {
    return false;
  }

  if (/source was fetched/i.test(value)) {
    return false;
  }

  // Only concrete, fact-bearing note types may force a canonical write.
  if (
    type === "expected_lineup" ||
    type === "credible_expected_lineup_note" ||
    type === "confirmed_absence_note" ||
    type === "confirmed_team_news_note" ||
    type === "reviewed_team_news_note"
  ) {
    return true;
  }

  // credible_selection_note is intentionally NOT strong enough.
  // It may describe that a source exists, but not that a team-news fact exists.
  return false;
}

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function sameTeam(a, b) {
  return normalizeKey(a) === normalizeKey(b);
}

function resolveResearchTasksPath(dayKey) {
  return resolveDataPath("team-news", "_research-tasks", `${dayKey}.json`);
}

function resolveCanonicalTeamNewsPath(task, candidateOutput) {
  const targetFile = normalizeText(
    candidateOutput?.canonicalTarget?.file ||
    task?.target?.canonicalTarget?.file
  );

  const team = normalizeText(
    candidateOutput?.team ||
    task?.target?.team
  );

  const rootDir = path.resolve(resolveDataPath("team-news"));

  let finalPath = null;

  if (targetFile) {
    finalPath = path.isAbsolute(targetFile)
      ? path.resolve(targetFile)
      : path.resolve(rootDir, path.basename(targetFile));
  } else {
    const key = normalizeCanonicalTeamKey(team);

    if (!key) {
      throw new Error("cannot resolve canonical team-news path without team");
    }

    finalPath = path.resolve(rootDir, `${key}.json`);
  }

  const insideRoot =
    finalPath === rootDir ||
    finalPath.startsWith(`${rootDir}${path.sep}`);

  if (!insideRoot) {
    throw new Error(`refusing to write team-news outside canonical root: ${finalPath}`);
  }

  return finalPath;
}

function resolveResearchResultsPath(dayKey) {
  return resolveDataPath("team-news", "_research-results", `${dayKey}.json`);
}

function resolveDetailsDir(dayKey) {
  return resolveDataPath("details", dayKey);
}

function buildMatchFromDetail(detail = {}) {
  const basic = detail?.basic || {};
  const matchId = normalizeText(detail?.matchId || basic?.matchId);
  const homeTeam = normalizeText(basic?.homeTeam);
  const awayTeam = normalizeText(basic?.awayTeam);

  if (!matchId || !homeTeam || !awayTeam) {
    return null;
  }

  return {
    matchId,
    homeTeam,
    awayTeam,
    leagueSlug: normalizeText(basic?.leagueSlug) || null,
    kickoffUtc: normalizeText(basic?.kickoffUtc) || null,
    venue: normalizeText(basic?.venue) || null,
    detail
  };
}

function readDetailsMap(dayKey) {
  const dir = resolveDetailsDir(dayKey);
  const out = new Map();

  if (!fs.existsSync(dir)) {
    return out;
  }

  for (const name of fs.readdirSync(dir).filter(x => x.endsWith(".json")).sort()) {
    const detail = readJsonSafe(path.join(dir, name), null);
    if (!detail) continue;

    const match = buildMatchFromDetail(detail);
    if (!match?.matchId) continue;

    out.set(match.matchId, match);
  }

  return out;
}

function buildFixtureMap(dayKey) {
  const rows = getFixturesByDay(dayKey) || [];
  const out = new Map();

  for (const row of rows) {
    const matchId = normalizeText(row?.matchId);
    if (!matchId) continue;
    out.set(matchId, row);
  }

  return out;
}

function getSideFromTask(task) {
  return normalizeText(task?.target?.side);
}

function getTargetTeam(task) {
  return normalizeText(task?.target?.team);
}

function getOpponent(task) {
  return normalizeText(task?.target?.opponent);
}

function getMatchId(task) {
  return normalizeText(task?.match?.matchId);
}

function toEvidenceItem(type, label, value, source, confidence = 0.3) {
  return {
    type: normalizeText(type) || "unknown",
    label: normalizeText(label) || null,
    value: value ?? null,
    source: normalizeText(source) || null,
    confidence: Number.isFinite(Number(confidence)) ? Number(confidence) : 0.3
  };
}

function collectLocalEvidenceFromDetail(task, detailMatch) {
  const out = [];
  const detail = detailMatch?.detail || {};
  const targetTeam = getTargetTeam(task);
  const side = getSideFromTask(task);

  const researchedFacts = detail?.researchedFacts || {};
  const aiContext = detail?.aiContext || {};
  const sourceIntelligence = detail?.sourceIntelligence || {};
  const teamNews = detail?.teamNews || {};

  if (researchedFacts?.teamNews) {
    out.push(
      toEvidenceItem(
        "researched_facts_team_news",
        `researchedFacts.teamNews for ${targetTeam}`,
        researchedFacts.teamNews,
        "detail.researchedFacts.teamNews",
        0.5
      )
    );
  }

  if (aiContext?.teamNewsContext) {
    out.push(
      toEvidenceItem(
        "ai_team_news_context",
        `aiContext.teamNewsContext for ${targetTeam}`,
        aiContext.teamNewsContext,
        "detail.aiContext.teamNewsContext",
        0.45
      )
    );
  }

  if (sourceIntelligence && Object.keys(sourceIntelligence).length > 0) {
    out.push(
      toEvidenceItem(
        "source_intelligence",
        `sourceIntelligence for ${targetTeam}`,
        sourceIntelligence,
        "detail.sourceIntelligence",
        0.35
      )
    );
  }

  if (teamNews && Object.keys(teamNews).length > 0) {
    out.push(
      toEvidenceItem(
        "detail_team_news",
        `detail.teamNews for ${targetTeam}`,
        side ? teamNews?.[side] || teamNews : teamNews,
        "detail.teamNews",
        0.4
      )
    );
  }

  return out;
}

function collectLocalEvidenceFromFixture(task, fixture) {
  const out = [];
  const targetTeam = getTargetTeam(task);
  const side = getSideFromTask(task);
  const sources = fixture?.sources || {};

  if (!sources || typeof sources !== "object") {
    return out;
  }

  for (const [sourceName, payload] of Object.entries(sources)) {
    if (!payload || typeof payload !== "object") continue;

    out.push(
      toEvidenceItem(
        "fixture_source_payload",
        `${sourceName} fixture payload for ${targetTeam}`,
        {
          sourceName,
          side,
          keys: Object.keys(payload || {}),
          payload
        },
        `fixture.sources.${sourceName}`,
        0.25
      )
    );
  }

  return out;
}

function hasNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

function hasNonEmptyObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).length > 0;
}

function normalizeNoteValue(value) {
  if (value == null) return "";

  if (typeof value === "string") {
    return normalizeText(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return normalizeText(value);
  }

  if (typeof value === "object") {
    const direct =
      value.value ||
      value.note ||
      value.text ||
      value.summary ||
      value.headline ||
      value.message ||
      value.reason ||
      value.status ||
      value.player ||
      value.name ||
      value.label;

    if (direct != null && typeof direct !== "object") {
      return normalizeText(direct);
    }

    const player = normalizeText(value.player || value.name);
    const status = normalizeText(value.status || value.type || value.reason);

    if (player && status) {
      return `${player}: ${status}`;
    }

    if (player) {
      return player;
    }

    if (status) {
      return status;
    }

    return "";
  }

  return "";
}

function isBadCanonicalNoteText(value) {
  const text = normalizeText(value).toLowerCase();

  if (!text) return true;
  if (text === "[object object]") return true;
  if (text.length < 10) return true;

  // ❌ κόβουμε μόνο μη-αποδεικτικά registry/fetch messages.
  // Τα source-reported team-news signals περνάνε ως canonical notes,
  // αλλά ΟΧΙ ως absences.
  if (
    text.includes("trusted registry source") ||
    text.includes("source was fetched")
  ) {
    return true;
  }

  // ❌ κόβουμε navigation / generic junk
  if (
    /^(home|news|latest news|club|team|first team|fixtures|results|tickets|shop|store|contact|privacy|terms|history|honours|academy|women)$/i.test(text)
  ) {
    return true;
  }

  return false;
}

function pushNormalizedNote(out, type, value, source = null) {
  if (value == null) return;

  const noteType = normalizeText(type) || "selection_note";

  if (Array.isArray(value)) {
    for (const row of value) {
      pushNormalizedNote(out, noteType, row, source);
    }
    return;
  }

  const text = normalizeNoteValue(value);

  if (isBadCanonicalNoteText(text)) {
    return;
  }

  out.push({
    type: noteType,
    value: text,
    source: normalizeText(source) || null
  });
}

function sanitizeCandidateNotes(notes = []) {
  return (Array.isArray(notes) ? notes : [])
    .filter(note => {
      const value = normalizeCanonicalNoteValue(note?.value ?? note);
      return !isBadCanonicalNoteText(value);
    });
}

function extractNormalizedTeamNewsFactsFromValue(type, rawValue) {
  const absences = [];
  const notes = [];

  const data = rawValue?.data ?? rawValue;
  const safeType = normalizeText(type).toLowerCase();

  if (data == null) {
    return { absences, notes };
  }

  if (safeType === "named_injury") {
    absences.push({
      player: typeof data === "string" ? data : data?.player || "unknown",
      type: "injury",
      status: "doubtful"
    });
    return { absences, notes };
  }

  if (safeType === "detail_team_news" || safeType === "researched_facts_team_news") {
    const sourceAbsences = [
      ...(Array.isArray(data?.absences) ? data.absences : []),
      ...(Array.isArray(data?.injuries) ? data.injuries : []),
      ...(Array.isArray(data?.missingPlayers) ? data.missingPlayers : []),
      ...(Array.isArray(data?.suspensions) ? data.suspensions : [])
    ];

    for (const row of sourceAbsences) {
      if (row != null) absences.push(row);
    }

    pushNormalizedNote(notes, "selection_note", data?.notes || [], safeType);

    if (data?.expectedLineup) {
      pushNormalizedNote(notes, "expected_lineup", data.expectedLineup, safeType);
    }

    return { absences, notes };
  }

  if (safeType === "ai_team_news_context") {
    pushNormalizedNote(notes, "selection_note", data?.notes || data?.selectionNotes || [], safeType);
    pushNormalizedNote(notes, "selection_note", data?.summary || data?.teamNewsSummary || null, safeType);
    pushNormalizedNote(notes, "expected_lineup", data?.expectedLineup || null, safeType);
    return { absences, notes };
  }

  if (safeType === "source_intelligence") {
    pushNormalizedNote(notes, "selection_note", data?.notes || data?.selectionNotes || [], safeType);
    pushNormalizedNote(notes, "selection_note", data?.summary || data?.headline || null, safeType);
    pushNormalizedNote(notes, "expected_lineup", data?.expectedLineup || null, safeType);
    return { absences, notes };
  }

  return { absences, notes };
}

function classifyEvidence(evidenceItems = []) {
  const tags = new Set();

  for (const item of evidenceItems) {
    const type = normalizeText(item?.type).toLowerCase();
    const value = item?.value;
    const extracted = extractNormalizedTeamNewsFactsFromValue(type, value);

    if (Array.isArray(extracted?.absences) && extracted.absences.length > 0) {
      tags.add("named_absence");
      tags.add("named_injury");
    }

    if (Array.isArray(extracted?.notes) && extracted.notes.length > 0) {
      tags.add("credible_selection_note");
    }

    const data = value?.data ?? value;
    if (
      hasNonEmptyObject(data?.expectedLineup) ||
      hasNonEmptyArray(data?.expectedLineup)
    ) {
      tags.add("credible_expected_lineup_note");
    }

    if (type === "detail_team_news" || type === "researched_facts_team_news") {
      if (hasNonEmptyArray(data?.suspensions)) {
        tags.add("named_suspension");
      }
    }
  }

  return Array.from(tags);
}

function buildCandidateOutput(task, evidenceItems = []) {
  const targetTeam = getTargetTeam(task);
  const opponent = getOpponent(task);

  const absences = [];
  const notes = [];

  for (const item of evidenceItems) {
    const type = normalizeText(item?.type).toLowerCase();
    const extracted = extractNormalizedTeamNewsFactsFromValue(type, item?.value);

    for (const row of extracted.absences || []) {
      if (row != null) absences.push(row);
    }

    for (const row of extracted.notes || []) {
      if (row != null) notes.push(row);
    }
  }

  const writeRecommendation = absences.length > 0 || notes.length > 0;

  return {
    team: targetTeam,
    opponent: opponent || null,
    absences,
    notes,
    evidence: evidenceItems,
    writeRecommendation,
    writeReason: writeRecommendation
      ? "normalized_team_news_available"
      : "insufficient_normalized_team_news",
    canonicalTarget: task?.target?.canonicalTarget || null
  };
}

function evaluateAcceptance(task, candidateOutput, evidenceTags = []) {
  const policy = task?.researchPlan?.acceptancePolicy || {};
  const requireAnyOf = Array.isArray(policy?.requireAnyOf) ? policy.requireAnyOf : [];
  const minimumEvidenceItems = Number(policy?.minimumEvidenceItems || 1);

  const evidenceCount = Array.isArray(candidateOutput?.evidence) ? candidateOutput.evidence.length : 0;
  const normalizedAbsenceCount = Array.isArray(candidateOutput?.absences) ? candidateOutput.absences.length : 0;
  const normalizedNoteCount = Array.isArray(candidateOutput?.notes) ? candidateOutput.notes.length : 0;

  const notes = Array.isArray(candidateOutput?.notes) ? candidateOutput.notes : [];
  const hasStrongCanonicalNote = notes.some(note => isStrongCanonicalNote(note));

  const hasWriteRecommendation = candidateOutput?.writeRecommendation === true;

  const hit =
    requireAnyOf.length === 0 ||
    requireAnyOf.some(tag => evidenceTags.includes(tag));

  const hasProviderResolved =
    candidateOutput?.aiProvider?.status === "resolved" ||
    candidateOutput?.writeReason === "ai_provider_resolved" ||
    candidateOutput?.writeReason === "local_plus_ai_provider_resolved";

  const hasQualityAbsence =
    normalizedAbsenceCount > 0;

  const hasQualityCanonicalFacts =
    hasQualityAbsence ||
    hasStrongCanonicalNote;

  const acceptedByProviderAbsence =
    hasWriteRecommendation &&
    hasProviderResolved &&
    hasQualityAbsence;

  const acceptedByProviderCanonicalNote =
    hasWriteRecommendation &&
    hasProviderResolved &&
    hasStrongCanonicalNote;

  const acceptedByPolicyEvidence =
    hasWriteRecommendation &&
    hasQualityCanonicalFacts &&
    evidenceCount >= minimumEvidenceItems &&
    hit;

  const accepted =
    acceptedByProviderAbsence ||
    acceptedByProviderCanonicalNote ||
    acceptedByPolicyEvidence;

  return {
    accepted,
    evidenceCount,
    evidenceTags,
    requireAnyOf,
    minimumEvidenceItems,
    normalizedAbsenceCount,
    normalizedNoteCount,
    hasNormalizedFacts: normalizedAbsenceCount > 0 || normalizedNoteCount > 0,
    hasQualityCanonicalFacts,
    hasStrongCanonicalNote,
    acceptedByProviderAbsence,
    acceptedByProviderCanonicalNote,
    acceptedByPolicyEvidence,
    reason: accepted ? "accepted" : "insufficient_quality_canonical_facts_for_canonical_write"
  };
}

function buildReviewedTeamNewsAnswer(task, candidateOutput, acceptance) {
  const targetTeam = getTargetTeam(task);
  const opponent = getOpponent(task);
  const aiProvider = candidateOutput?.aiProvider || null;
  const providerResolved = aiProvider?.status === "resolved";
  const normalizedAbsenceCount = Array.isArray(candidateOutput?.absences)
    ? candidateOutput.absences.length
    : 0;

  const normalizedNoteCount = Array.isArray(candidateOutput?.notes)
    ? candidateOutput.notes.length
    : 0;

  const providerSourceCount = Number(aiProvider?.sourceCount || 0);
  const evidenceCount = Array.isArray(candidateOutput?.evidence)
    ? candidateOutput.evidence.length
    : 0;

  if (!providerResolved) return null;
  if (normalizedAbsenceCount > 0) return null;
  if (providerSourceCount <= 0 && evidenceCount <= 0 && normalizedNoteCount === 0) return null;

  return {
    status: "reviewed_no_confirmed_absences",
    team: targetTeam,
    opponent: opponent || null,
    absences: [],
    notes: [
      {
        type: "reviewed_team_news_answer",
        value: "Reviewed trusted team-news sources; no confirmed named absences were extracted.",
        source: aiProvider?.provider || "team-news-ai-provider",
        confidence: 0.62
      }
    ],
    evidence: candidateOutput?.evidence || [],
    aiProvider,
    reason: "ai_provider_resolved_with_notes_but_no_named_absences",
    canonicalWrite: false
  };
}

function deriveResultStatus(acceptance, reviewedAnswer) {
  if (acceptance?.accepted) {
    return "accepted_candidate";
  }

  if (reviewedAnswer?.status === "reviewed_no_confirmed_absences") {
    return "reviewed_no_confirmed_absences";
  }

  return "unresolved_candidate";
}

function compactEvidenceValue(value) {
  if (value == null) {
    return null;
  }

  if (typeof value === "string") {
    return normalizeText(value).slice(0, 700);
  }

  if (Array.isArray(value)) {
    return value.slice(0, 8);
  }

  if (typeof value === "object") {
    return {
      keys: Object.keys(value).slice(0, 20),
      preview: JSON.stringify(value).slice(0, 900)
    };
  }

  return value;
}

function compactEvidenceItems(evidenceItems = []) {
  return (Array.isArray(evidenceItems) ? evidenceItems : [])
    .slice(0, 20)
    .map(item => ({
      type: normalizeText(item?.type) || null,
      label: normalizeText(item?.label) || null,
      source: normalizeText(item?.source) || null,
      confidence: Number.isFinite(Number(item?.confidence))
        ? Number(item.confidence)
        : null,
      value: compactEvidenceValue(item?.value)
    }));
}

function normalizeCanonicalAbsences(absences = [], { team = "" } = {}) {
  return (Array.isArray(absences) ? absences : [])
    .filter(row => row != null)
    .map(row => {
      if (typeof row === "string") {
        return {
          player: normalizeText(row),
          type: "absence",
          status: "reported"
        };
      }

      if (typeof row === "object") {
        return {
          ...row,
          player: normalizeText(row?.player || row?.name || row?.label || ""),
          type: normalizeText(row?.type || row?.reason || "absence"),
          status: normalizeText(row?.status || "reported"),
          source: normalizeText(row?.source) || null
        };
      }

      return null;
    })
    .filter(Boolean)
    .filter(row => !isLikelyBadAbsencePlayerName(row.player, team));
}

function normalizeCanonicalNoteValue(value) {
  if (value == null) return "";

  if (typeof value === "string") {
    return normalizeText(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return normalizeText(String(value));
  }

  if (typeof value === "object") {
    const direct =
      value.value ??
      value.note ??
      value.text ??
      value.summary ??
      value.headline ??
      value.message ??
      value.reason ??
      value.description ??
      null;

    if (direct != null && typeof direct !== "object") {
      return normalizeText(direct);
    }

    const player = normalizeText(value.player || value.name);
    const status = normalizeText(value.status || value.type || value.reason);

    if (player && status) {
      return `${player}: ${status}`;
    }

    if (player) return player;
    if (status) return status;

    return "";
  }

  return "";
}

function isWeakCanonicalNoteValue(value, absencePlayerNames = new Set()) {
  const text = normalizeText(value);
  const lc = text.toLowerCase();

  if (!text) return true;
  if (lc === "[object object]") return true;
  if (text.length < 8) return true;

  if (
    /^(out|injury|injured|suspended|suspension|unknown|available|unavailable|yes|no|doubtful|reported)$/i.test(text)
  ) {
    return true;
  }

  if (
    /^(home|news|latest news|team news|club|team|first team|fixtures|results|tickets|shop|store|contact|privacy|terms|history|honours|academy|women)$/i.test(text)
  ) {
    return true;
  }

  for (const playerName of absencePlayerNames) {
    const playerLc = normalizeText(playerName).toLowerCase();

    if (!playerLc) continue;

    if (
      lc === playerLc ||
      lc === `${playerLc}: out` ||
      lc === `${playerLc} out` ||
      lc === `${playerLc}: injured` ||
      lc === `${playerLc} injured` ||
      lc === `${playerLc}: injury` ||
      lc === `${playerLc} injury` ||
      lc === `${playerLc}: suspended` ||
      lc === `${playerLc} suspended`
    ) {
      return true;
    }
  }

  return false;
}

function normalizeCanonicalNotes(notes = [], { absences = [] } = {}) {
  const absencePlayerNames = new Set(
    (Array.isArray(absences) ? absences : [])
      .map(row => normalizeText(row?.player))
      .filter(Boolean)
  );

  const seen = new Set();

  return (Array.isArray(notes) ? notes : [])
    .filter(row => row != null)
    .map(row => {
      if (typeof row === "string") {
        return {
          type: "selection_note",
          value: normalizeCanonicalNoteValue(row),
          source: null,
          confidence: null,
          meta: null
        };
      }

      const value = normalizeCanonicalNoteValue(row);
      const type = normalizeText(row?.type) || "selection_note";
      const source = normalizeText(row?.source) || null;

      return {
        type,
        value,
        source,
        confidence: Number.isFinite(Number(row?.confidence)) ? Number(row.confidence) : null,
        meta: row?.meta && typeof row.meta === "object" ? row.meta : null
      };
    })
    .filter(row => row.value)
    .filter(row => !isWeakCanonicalNoteValue(row.value, absencePlayerNames))
    .filter(row => {
      const key = [
        normalizeText(row.type).toLowerCase(),
        normalizeText(row.value).toLowerCase(),
        normalizeText(row.source).toLowerCase()
      ].join("|");

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}

function buildCanonicalTeamNewsDocument({ dayKey, task, candidateOutput, acceptance }) {
  const team = normalizeText(candidateOutput?.team || task?.target?.team);
  const opponent = normalizeText(candidateOutput?.opponent || task?.target?.opponent);
  const canonicalKey = normalizeCanonicalTeamKey(team);
  const now = new Date().toISOString();

  const rawAbsences = Array.isArray(candidateOutput?.absences)
    ? candidateOutput.absences
    : [];

  const absences = normalizeCanonicalAbsences(rawAbsences, { team });
  const notes = normalizeCanonicalNotes(candidateOutput?.notes || [], { absences });
  const evidence = compactEvidenceItems(candidateOutput?.evidence || []);
  const rejectedAbsenceCount = rawAbsences.length - absences.length;

  return {
    schemaVersion: 1,
    type: "canonical_team_news",
    status: "available",
    team,
    teamKey: canonicalKey,
    opponent: opponent || null,
    dayKey,
    match: task?.match || null,
    absences,
    notes,
    evidence,
    evidenceSummary: {
      evidenceCount: Array.isArray(candidateOutput?.evidence)
        ? candidateOutput.evidence.length
        : 0,
      normalizedAbsenceCount: absences.length,
      normalizedNoteCount: notes.length,
      rejectedAbsenceCount,
      evidenceTags: acceptance?.evidenceTags || []
    },
    provenance: {
      source: "team_news_research_tasks",
      provider: candidateOutput?.aiProvider?.provider || null,
      mode: candidateOutput?.aiProvider?.mode || null,
      writeReason: candidateOutput?.writeReason || null,
      acceptanceReason: acceptance?.reason || null,
      generatedAt: now
    },
    updatedAt: now
  };
}

function persistAcceptedCanonicalTeamNews({ dayKey, task, candidateOutput, acceptance }) {
  const targetTeam = getTargetTeam(task);
  const candidateTeam = normalizeText(candidateOutput?.team);

  if (!targetTeam || !candidateTeam || !sameTeam(targetTeam, candidateTeam)) {
    throw new Error(`canonical write team mismatch: task=${targetTeam} candidate=${candidateTeam}`);
  }

  if (!candidateOutput?.writeRecommendation) {
    return {
      ok: false,
      skipped: true,
      reason: "write_recommendation_false",
      file: null
    };
  }

  const filePath = resolveCanonicalTeamNewsPath(task, candidateOutput);
  const doc = buildCanonicalTeamNewsDocument({
    dayKey,
    task,
    candidateOutput,
    acceptance
  });

  const hasWritableCanonicalFact =
    doc.absences.length > 0 ||
    doc.notes.some(note => isStrongCanonicalNote(note));

  if (!hasWritableCanonicalFact) {
    return {
      ok: false,
      skipped: true,
      reason: "no_quality_canonical_team_news_facts_after_safety_gate",
      team: doc.team,
      teamKey: doc.teamKey,
      file: filePath,
      normalizedAbsenceCount: doc.absences.length,
      normalizedNoteCount: doc.notes.length,
      rejectedAbsenceCount: doc.evidenceSummary?.rejectedAbsenceCount || 0
    };
  }

  writeJson(filePath, doc);

  return {
    ok: true,
    skipped: false,
    team: doc.team,
    teamKey: doc.teamKey,
    file: filePath,
    normalizedAbsenceCount: doc.absences.length,
    normalizedNoteCount: doc.notes.length,
    rejectedAbsenceCount: doc.evidenceSummary?.rejectedAbsenceCount || 0
  };
}

const TEAM_NEWS_PRIORITY_LEAGUE_PREFIXES = [
  "eng",
  "esp",
  "ita",
  "ger",
  "fra",
  "ned",
  "por",
  "bel",
  "gre",
  "sco",
  "tur",
  "ksa"
];

const TEAM_NEWS_UEFA_PREFIXES = new Set([
  "eng", "esp", "ita", "ger", "fra", "ned", "por", "bel", "gre", "sco", "tur",
  "aut", "sui", "den", "swe", "nor", "fin", "pol", "cze", "svk", "hun", "rou",
  "bul", "cro", "srb", "svn", "bih", "mkd", "alb", "mne", "kos", "irl", "nir",
  "wal", "isr", "cyp", "ukr", "rus", "blr", "ltu", "lva", "est", "isl", "lux",
  "mlt", "and", "smr", "lie", "arm", "aze", "geo", "kaz", "mda", "gib", "far"
]);

const TEAM_NEWS_SOUTH_AMERICA_PREFIXES = new Set([
  "arg", "bra", "uru", "ecu", "per", "col", "chi", "bol", "par", "ven"
]);

function getTaskLeagueSlug(task = {}) {
  return normalizeText(
    task?.leagueSlug ||
    task?.match?.leagueSlug ||
    task?.fixture?.leagueSlug ||
    task?.input?.leagueSlug ||
    task?.league?.slug ||
    task?.competition?.slug ||
    ""
  ).toLowerCase();
}

function getTaskLeaguePrefix(task = {}) {
  const slug = getTaskLeagueSlug(task);
  return slug.split(".")[0] || slug;
}

function getTaskPriorityScore(task = {}) {
  const slug = getTaskLeagueSlug(task);
  const prefix = getTaskLeaguePrefix(task);

  const explicitPriority = TEAM_NEWS_PRIORITY_LEAGUE_PREFIXES.indexOf(prefix);
  if (explicitPriority !== -1) {
    const division = Number(slug.split(".")[1] || 99);
    return explicitPriority * 100 + Math.min(division, 20);
  }

  if (TEAM_NEWS_UEFA_PREFIXES.has(prefix)) {
    return 2000 + slug.localeCompare("zzz");
  }

  if (TEAM_NEWS_SOUTH_AMERICA_PREFIXES.has(prefix)) {
    return 3000 + slug.localeCompare("zzz");
  }

  return 4000 + slug.localeCompare("zzz");
}

function sortTeamNewsResearchTasksForPriority(tasks = []) {
  return (Array.isArray(tasks) ? tasks : [])
    .map((task, index) => ({ task, index }))
    .sort((a, b) => {
      const priorityDiff = getTaskPriorityScore(a.task) - getTaskPriorityScore(b.task);
      if (priorityDiff !== 0) return priorityDiff;

      const slugDiff = getTaskLeagueSlug(a.task).localeCompare(getTaskLeagueSlug(b.task));
      if (slugDiff !== 0) return slugDiff;

      return a.index - b.index;
    })
    .map(row => row.task);
}

export async function runTeamNewsResearchTasksDay(dayKey, {
  maxTasks = Infinity,
  promoteCanonical = false
} = {}) {
  const safeDayKey = normalizeText(dayKey);
  if (!safeDayKey) {
    throw new Error("missing dayKey");
  }

  const tasksPath = resolveResearchTasksPath(safeDayKey);
  const tasksDoc = readJsonSafe(tasksPath, null);

  if (!tasksDoc || !Array.isArray(tasksDoc?.tasks)) {
    throw new Error(`team-news research tasks not found or invalid: ${tasksPath}`);
  }

  const prioritizedTasks = sortTeamNewsResearchTasksForPriority(tasksDoc.tasks);

  const limitedTasks = prioritizedTasks.slice(
    0,
    Number.isFinite(Number(maxTasks)) ? Number(maxTasks) : prioritizedTasks.length
  );

  const detailMap = readDetailsMap(safeDayKey);
  const fixtureMap = buildFixtureMap(safeDayKey);

  const results = [];
  const canonicalWrites = [];

  for (const task of limitedTasks) {
    const matchId = getMatchId(task);
    const detailMatch = detailMap.get(matchId) || null;
    const fixture = fixtureMap.get(matchId) || null;

    const detailEvidence = collectLocalEvidenceFromDetail(task, detailMatch);
    const fixtureEvidence = collectLocalEvidenceFromFixture(task, fixture);
    const evidenceItems = [...detailEvidence, ...fixtureEvidence];

    const candidateOutput = buildCandidateOutput(task, evidenceItems);
    let finalCandidate = candidateOutput;
    let aiProviderResult = null;

    const localEvidenceTags = classifyEvidence(candidateOutput.evidence || []);
    const localAcceptance = evaluateAcceptance(task, candidateOutput, localEvidenceTags);

    const localNormalizedAbsenceCount = Number(
      localAcceptance?.normalizedAbsenceCount ??
      localAcceptance?.absenceCount ??
      0
    );

    const localHasQualityFacts =
      candidateOutput?.writeRecommendation === true &&
      localNormalizedAbsenceCount > 0;

    if (!localHasQualityFacts) {
      aiProviderResult = await runTeamNewsAIProvider(task);

      if (aiProviderResult?.status === "resolved") {
        finalCandidate = {
          ...candidateOutput,
          absences: aiProviderResult.absences || [],
          notes: aiProviderResult.notes || [],
          evidence: [
            ...(candidateOutput.evidence || []),
            ...(aiProviderResult.evidence || [])
          ],
          writeRecommendation: true,
          writeReason: "ai_provider_resolved",
          aiProvider: {
            status: aiProviderResult.status || null,
            provider: aiProviderResult.provider || null,
            mode: aiProviderResult.mode || null,
            sourceCount: aiProviderResult.sourceCount ?? null,
            reason: aiProviderResult.reason || null,
            input: aiProviderResult.input || null,
            diagnostics: aiProviderResult.diagnostics || null,
            extractionDiagnostics: aiProviderResult.extractionDiagnostics || null
          }
        };
      } else {
        finalCandidate = {
          ...candidateOutput,
          writeRecommendation: false,
          writeReason: "insufficient_quality_local_and_ai_team_news",
          aiProvider: {
            status: aiProviderResult?.status || "not_resolved",
            provider: aiProviderResult?.provider || "team-news-ai-provider",
            mode: aiProviderResult?.mode || null,
            sourceCount: aiProviderResult?.sourceCount ?? null,
            reason: aiProviderResult?.reason || "provider_returned_no_resolution",
            input: aiProviderResult?.input || null,
            diagnostics: aiProviderResult?.diagnostics || null,
            extractionDiagnostics: aiProviderResult?.extractionDiagnostics || null
          }
        };
      }
    }

    finalCandidate = {
      ...finalCandidate,
      notes: sanitizeCandidateNotes(finalCandidate.notes || [])
    };

    const finalEvidenceTags = classifyEvidence(finalCandidate.evidence || []);
    const acceptance = evaluateAcceptance(task, finalCandidate, finalEvidenceTags);
    const reviewedAnswer = buildReviewedTeamNewsAnswer(task, finalCandidate, acceptance);
    const resultRow = {
      taskId: task?.taskId || null,
      taskType: task?.taskType || null,
      status: deriveResultStatus(acceptance, reviewedAnswer),
      dayKey: safeDayKey,
      match: task?.match || null,
      target: task?.target || null,
      localContext: {
        hasDetailMatch: !!detailMatch,
        hasFixtureMatch: !!fixture,
        detailEvidenceCount: detailEvidence.length,
        fixtureEvidenceCount: fixtureEvidence.length
      },
      evidenceSummary: {
        evidenceCount: Array.isArray(finalCandidate?.evidence) ? finalCandidate.evidence.length : 0,
        localEvidenceCount: Array.isArray(evidenceItems) ? evidenceItems.length : 0,
        evidenceTags: finalEvidenceTags
      },
      aiProviderAudit: finalCandidate?.aiProvider || null,
      candidateOutput: finalCandidate,
      reviewedAnswer,
      acceptance,
      canonicalWrite: null,
      audit: {
        executedAt: new Date().toISOString(),
        executor: "run-team-news-research-tasks-day"
      }
    };

    if (acceptance.accepted) {
      if (promoteCanonical) {
        const canonicalWrite = persistAcceptedCanonicalTeamNews({
          dayKey: safeDayKey,
          task,
          candidateOutput: finalCandidate,
          acceptance
        });

        resultRow.canonicalWrite = canonicalWrite;
        canonicalWrites.push(canonicalWrite);
      } else {
        resultRow.canonicalWrite = {
          ok: false,
          skipped: true,
          wouldWrite: true,
          reason: "candidate_only_requires_promote_canonical_flag",
          team: getTargetTeam(task),
          matchId: getMatchId(task),
          normalizedAbsenceCount: acceptance?.normalizedAbsenceCount ?? null,
          normalizedNoteCount: acceptance?.normalizedNoteCount ?? null
        };
      }
    }

    results.push(resultRow);
  }

  const out = {
    ok: true,
    dayKey: safeDayKey,
    taskCount: limitedTasks.length,
    acceptedCandidateCount: results.filter(x => x.status === "accepted_candidate").length,
    reviewedNoConfirmedAbsencesCount: results.filter(x => x.status === "reviewed_no_confirmed_absences").length,
    unresolvedCandidateCount: results.filter(x => x.status === "unresolved_candidate").length,
    canonicalWriteCount: canonicalWrites.filter(x => x?.ok).length,
    promoteCanonical,
    candidateOnly: !promoteCanonical,
    canonicalWrites,
    results,
    updatedAt: new Date().toISOString()
  };

  const outPath = resolveResearchResultsPath(safeDayKey);
  writeJson(outPath, out);

  return {
    ...out,
    file: outPath
  };
}

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const dayKey = process.argv[2];
  const args = process.argv.slice(3);
  const maxTasksArg = args.find(arg => /^\d+$/.test(String(arg || "")));
  const promoteCanonical = args.includes("--promote-canonical");

  const maxTasks =
    Number.isFinite(Number(maxTasksArg)) && Number(maxTasksArg) > 0
      ? Number(maxTasksArg)
      : Infinity;

  console.log("[run-team-news-research-tasks-day] cli:start", {
    dayKey,
    maxTasks: Number.isFinite(maxTasks) ? maxTasks : "all",
    promoteCanonical
  });

  runTeamNewsResearchTasksDay(dayKey, { maxTasks, promoteCanonical })
    .then(result => {
      console.log("[run-team-news-research-tasks-day] cli:done", {
        ok: result?.ok,
        dayKey: result?.dayKey,
        taskCount: result?.taskCount ?? 0,
        acceptedCandidateCount: result?.acceptedCandidateCount ?? 0,
        reviewedNoConfirmedAbsencesCount: result?.reviewedNoConfirmedAbsencesCount ?? 0,
        unresolvedCandidateCount: result?.unresolvedCandidateCount ?? 0,
        canonicalWriteCount: result?.canonicalWriteCount ?? 0,
        promoteCanonical: result?.promoteCanonical === true,
        candidateOnly: result?.candidateOnly === true,
        file: result?.file || null
      });
    })
    .catch(err => {
      console.error("[run-team-news-research-tasks-day] cli:fatal", err);
      process.exit(1);
    });
}