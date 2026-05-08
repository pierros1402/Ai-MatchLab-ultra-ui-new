import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getFixturesByDay, getFixtureById } from "../storage/json-db.js";
import { athensDayFromKickoff } from "../core/daykey.js";
import { ensureDir, resolveDataPath } from "../storage/data-root.js";
import { buildAiDetailsBlock } from "../ai-match-intelligence/build-ai-details-block.js";
import { buildRefereeContext } from "../core/referee-context.js";
import { readPlayerUsageRecord } from "../storage/player-usage-db.js";
import { readTeamGeoRecord } from "../storage/team-geo-db.js";
import { inferAbsencesFromUsage } from "../ai-match-intelligence/player-usage/absence-inference.js";

const DETAILS_SCHEMA_VERSION = "details-snapshot-v3";
const DETAILS_BUILDER_VERSION = "2026-05-01-player-usage-travel-geo-signature";


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

function classifyCompetitionType(match) {
  const slug = String(match?.leagueSlug || "").toLowerCase();

  // -----------------------------
  // INTERNATIONAL CLUB COMPETITIONS
  // -----------------------------
  if (
    slug.includes("champions") ||
    slug.includes("europa") ||
    slug.includes("conference") ||
    slug.includes("libertadores") ||
    slug.includes("sudamericana") ||
    slug.includes("afc.champions")
  ) {
    return "international_cup";
  }

  // -----------------------------
  // DOMESTIC CUPS
  // -----------------------------
  if (
    slug.includes(".cup") ||
    slug.includes("fa") ||
    slug.includes("super_cup") ||
    slug.includes("league_cup") ||
    slug.includes("trophy")
  ) {
    return "domestic_cup";
  }

  // -----------------------------
  // LEAGUE
  // -----------------------------
  return "league";
}

function isLiveLike(status) {
  const s = String(status || "").toUpperCase();
  return s === "LIVE" || s.includes("LIVE") || s.includes("IN_PROGRESS");
}

function isFinalLike(status) {
  const s = String(status || "").toUpperCase();
  return s === "FT" || s.includes("FT") || s.includes("FINAL") || s.includes("COMPLETE");
}

function toIsoOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function kickoffDay(match) {
  if (match?.dayKey) return String(match.dayKey);
  if (match?.kickoffUtc) return athensDayFromKickoff(match.kickoffUtc);
  return null;
}

function readValuePicksForDay(dayKey) {
  if (!dayKey) return [];
  const file = resolveDataPath("value", `${dayKey}.json`);
  const payload = readJsonSafe(file, null);
  return Array.isArray(payload?.picks) ? payload.picks : [];
}

function getValueForMatch(dayKey, matchId) {
  const all = readValuePicksForDay(dayKey);
  return all.filter(p => String(p?.matchId) === String(matchId));
}

function buildValuePicksByMatch(dayKey) {
  const all = readValuePicksForDay(dayKey);
  const map = new Map();

  for (const pick of all) {
    const key = String(pick?.matchId || "");
    if (!key) continue;

    if (!map.has(key)) {
      map.set(key, []);
    }

    map.get(key).push(pick);
  }

  return map;
}

function buildValueSummaryFromPicks(valuePicks = []) {
  const picks = Array.isArray(valuePicks) ? valuePicks : [];

  if (!picks.length) {
    return null;
  }

  const sorted = picks
    .slice()
    .sort((a, b) => Number(b?.score || 0) - Number(a?.score || 0));

  const top = sorted[0];

  return {
    count: picks.length,
    topMarket: top?.market || top?.marketName || null,
    topPick: top?.pick || null,
    topScore: Number.isFinite(Number(top?.score)) ? Number(top.score) : null,
    avgConfidence: Number(
      (
        picks.reduce((sum, p) => sum + Number(p?.confidence || 0), 0) /
        picks.length
      ).toFixed(3)
    ),
    confidence: 0.75
  };
}

function compactString(value, max = 600) {
  const text = String(value || "").trim();
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function compactArray(value, max = 12) {
  return Array.isArray(value) ? value.slice(0, max) : [];
}

function compactForDetails(value, {
  maxArrayItems = 12,
  maxStringLength = 600,
  maxDepth = 6
} = {}) {
  const seen = new WeakSet();

  function walk(input, depth = 0, key = "") {
    if (input == null) return input;

    if (typeof input === "string") {
      return input.length > maxStringLength
        ? `${input.slice(0, maxStringLength)}…`
        : input;
    }

    if (typeof input !== "object") return input;

    if (seen.has(input)) {
      return "[circular]";
    }

    if (depth >= maxDepth) {
      return "[max_depth]";
    }

    seen.add(input);

    const heavyKeys = new Set([
      "html",
      "rawHtml",
      "body",
      "rawBody",
      "text",
      "rawText",
      "pageText",
      "textPreview",
      "searchAttempts",
      "sampleCandidates",
      "rejectedSamples",
      "registryArticleSamples",
      "registryRejectedArticleSamples",
      "rawSearchResults",
      "rawResults",
      "fetchHtml",
      "debug",
      "debugDump"
    ]);

    if (Array.isArray(input)) {
      return input.slice(0, maxArrayItems).map(item => walk(item, depth + 1, key));
    }

    const out = {};

    for (const [k, v] of Object.entries(input)) {
      if (heavyKeys.has(k)) {
        if (typeof v === "string") {
          out[k] = compactString(v, 300);
        } else if (Array.isArray(v)) {
          out[k] = {
            truncated: true,
            originalCount: v.length,
            sample: v.slice(0, 3).map(item => walk(item, depth + 1, k))
          };
        } else if (v && typeof v === "object") {
          out[k] = "[heavy_object_omitted]";
        } else {
          out[k] = v;
        }
        continue;
      }

      out[k] = walk(v, depth + 1, k);
    }

    return out;
  }

  return walk(value);
}

function compactRemoteTaskQueueForDetails(queue) {
  return compactArray(queue, 20).map(task => ({
    capability: task?.capability || null,
    status: task?.status || null,
    reason: task?.reason || null,
    team: task?.team || task?.targetTeam || null,
    opponent: task?.opponent || null,
    side: task?.side || null,
    leagueSlug: task?.leagueSlug || null,
    matchId: task?.matchId ? String(task.matchId) : null
  }));
}

function compactRemoteExecutionForDetails(remoteExecution) {
  if (!remoteExecution) {
    return {
      status: "idle",
      mode: "stub",
      queueSize: 0,
      executedCount: 0,
      queuedCount: 0,
      successCount: 0,
      failedCount: 0,
      skippedCount: 0,
      providersTried: [],
      results: []
    };
  }

  return {
    status: remoteExecution?.status || null,
    mode: remoteExecution?.mode || null,
    queueSize: Number(remoteExecution?.queueSize || 0),
    executedCount: Number(remoteExecution?.executedCount || 0),
    queuedCount: Number(remoteExecution?.queuedCount || 0),
    successCount: Number(remoteExecution?.successCount || 0),
    failedCount: Number(remoteExecution?.failedCount || 0),
    skippedCount: Number(remoteExecution?.skippedCount || 0),
    providersTried: compactArray(remoteExecution?.providersTried, 10),
    results: compactArray(remoteExecution?.results, 10).map(result => ({
      capability: result?.capability || null,
      provider: result?.provider || null,
      status: result?.status || null,
      reason: result?.reason || null,
      team: result?.team || result?.targetTeam || null,
      key: result?.key || null
    })),
    meta: compactForDetails(remoteExecution?.meta || null, {
      maxArrayItems: 8,
      maxStringLength: 300,
      maxDepth: 3
    })
  };
}

function compactResearchedFactsForDetails(researchedFacts, playerUsageIntel) {
  const facts = compactForDetails(researchedFacts || {}, {
    maxArrayItems: 12,
    maxStringLength: 600,
    maxDepth: 6
  });

  return {
    ...facts,
    playerUsageIntel: compactPlayerUsageIntelForFacts(playerUsageIntel)
  };
}

function buildDetailsSignature(match, valuePicks, payload) {
  const topPick = (valuePicks || [])
    .slice()
    .sort((a, b) => Number(b?.score || 0) - Number(a?.score || 0))[0] || null;

  const playerUsageHome = payload?.playerUsageIntel?.home || null;
  const playerUsageAway = payload?.playerUsageIntel?.away || null;

  const signaturePayload = {
    matchId: String(match?.matchId || ""),
    dayKey: kickoffDay(match),
    status: String(match?.status || ""),
    rawStatus: String(match?.rawStatus || ""),
    minute: String(match?.minute || ""),
    scoreHome: Number.isFinite(Number(match?.scoreHome)) ? Number(match.scoreHome) : null,
    scoreAway: Number.isFinite(Number(match?.scoreAway)) ? Number(match.scoreAway) : null,
    referee: String(
      match?.referee ||
      match?.sources?.espn?.referee ||
      ""
    ),
    competitionType: String(payload?.context?.competitionType || ""),
    competitionStatus: String(payload?.context?.status || ""),
    competitionReason: String(payload?.context?.diagnostics?.reason || ""),
    importance: String(payload?.context?.importance || ""),
    teamNewsStatus: String(payload?.teamNews?.status || ""),
    teamNewsSource: String(payload?.teamNews?.source || ""),
    teamNewsHomeAbsences: Array.isArray(payload?.teamNews?.data?.home?.absences)
      ? payload.teamNews.data.home.absences.length
      : 0,
    teamNewsAwayAbsences: Array.isArray(payload?.teamNews?.data?.away?.absences)
      ? payload.teamNews.data.away.absences.length
      : 0,
    teamNewsNotes: Array.isArray(payload?.teamNews?.data?.notes)
      ? payload.teamNews.data.notes.length
      : 0,

    travelStatus: String(payload?.travel?.status || ""),
    travelSource: String(payload?.travel?.source || ""),
    travelDistanceKm: Number.isFinite(Number(payload?.travel?.distanceKm))
      ? Number(payload.travel.distanceKm)
      : null,
    travelImpact: String(payload?.travel?.impact || ""),
    travelProfile: String(payload?.travel?.travelProfile || ""),
    travelSameCountry: payload?.travel?.sameCountry ?? null,
    travelCrossBorder: payload?.travel?.crossBorder ?? null,
    travelHomeKey: String(payload?.travel?.home?.key || ""),
    travelAwayKey: String(payload?.travel?.away?.key || ""),

    playerUsageHomeStatus: playerUsageHome?.status || null,
    playerUsageHomeConfidence: playerUsageHome?.confidence ?? null,
    playerUsageHomeReason: playerUsageHome?.reason || null,
    playerUsageAwayStatus: playerUsageAway?.status || null,
    playerUsageAwayConfidence: playerUsageAway?.confidence ?? null,
    playerUsageAwayReason: playerUsageAway?.reason || null,

    valueCount: Array.isArray(valuePicks) ? valuePicks.length : 0,
    topValue: topPick
      ? {
          market: String(topPick.market || ""),
          pick: String(topPick.pick || ""),
          score: Number.isFinite(Number(topPick.score)) ? Number(topPick.score) : null
        }
      : null,
    schemaVersion: DETAILS_SCHEMA_VERSION,
    builderVersion: DETAILS_BUILDER_VERSION
  };

  return JSON.stringify(signaturePayload);
}


function normalizeTeamNewsText(value) {
  if (typeof value === "string" || typeof value === "number") {
    return String(value || "").trim();
  }

  if (value && typeof value === "object" && !Array.isArray(value)) {
    return String(
      value.note ||
      value.reason ||
      value.label ||
      value.title ||
      value.description ||
      value.player ||
      value.name ||
      value.fullName ||
      ""
    ).trim();
  }

  return "";
}

function compactTeamNewsText(value) {
  return normalizeTeamNewsText(value).toLowerCase().replace(/\s+/g, " ").trim();
}

const TEAM_NEWS_BAD_NOTE_TERMS = new Set([
  "knee",
  "ankle",
  "hamstring",
  "hamstring injury",
  "calf",
  "thigh",
  "groin",
  "adductor",
  "shoulder",
  "back",
  "head",
  "foot",
  "leg",
  "lower leg",
  "upper leg",
  "lower body",
  "upper body",
  "sports hernia",
  "muscle",
  "injury",
  "injured",
  "illness",
  "suspension",
  "suspended",
  "doubtful",
  "questionable",
  "out",
  "unavailable",
  "fitness",
  "match fitness",
  "knock",
  "strain",
  "sprain",
  "acl",
  "achilles",
  "meniscus",
  "hip",
  "rib",
  "ribs",
  "concussion",
  "personal reasons",
  "not disclosed",
  "undisclosed",
  "day-to-day",
  "medical",
  "rehab",
  "recovery"
]);

function isBadTeamNewsNote(value) {
  const text = normalizeTeamNewsText(value);
  const lower = compactTeamNewsText(text);

  if (!text) return true;
  if (lower.includes("[object object]")) return true;
  if (TEAM_NEWS_BAD_NOTE_TERMS.has(lower)) return true;
  if (lower.startsWith("http://") || lower.startsWith("https://") || lower.includes("www.")) return true;
  if (lower.includes(" ir para o conteúdo principal ")) return true;
  if (lower.includes(" ir para o menu principal ")) return true;
  if (lower.includes(" espn futebol futebol ")) return true;
  if (lower.includes(" nfl nfl nba ")) return true;
  if (lower.includes(" disney plus ")) return true;
  if (lower.includes(" podcasts ")) return true;

  if (text.length > 240) return true;

  if (/\b(placar final|menu principal|mais esportes|futebol futebol|busca vit|brasileiro serie)\b/i.test(text) && text.length > 80) {
    return true;
  }

  if (lower.includes(":")) {
    const parts = lower.split(":").map(v => v.trim()).filter(Boolean);
    if (parts.length > 0 && parts.every(part => TEAM_NEWS_BAD_NOTE_TERMS.has(part))) {
      return true;
    }
  }

  return false;
}

function isBadTeamNewsPlayerName(value) {
  const text = normalizeTeamNewsText(value);
  const lower = compactTeamNewsText(text);

  if (!text || text.length < 3) return true;
  if (lower.includes("[object object]")) return true;
  if (TEAM_NEWS_BAD_NOTE_TERMS.has(lower)) return true;
  if (text.length > 55) return true;
  if (/\b(official|coverage|published|fixture|comments|confirmed|reported|announced|ahead of|pre-match|post-match|club media|press conference|training update)\b/i.test(text)) return true;

  return false;
}


function dedupeText(items = []) {
  const out = [];
  const seen = new Set();

  for (const raw of Array.isArray(items) ? items : []) {
    const text = normalizeTeamNewsText(raw);
    if (isBadTeamNewsNote(text)) continue;

    const key = compactTeamNewsText(text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }

  return out;
}


function cleanDetailsTeamNewsText(value) {
  return String(value || "").trim();
}

function compactDetailsTeamNewsText(value) {
  return cleanDetailsTeamNewsText(value).toLowerCase().replace(/\s+/g, " ").trim();
}

const DETAILS_TEAM_NEWS_REASON_TERMS = new Set([
  "injury",
  "suspension",
  "suspended",
  "illness",
  "fitness",
  "doubtful",
  "questionable",
  "lower back",
  "lower body",
  "upper body",
  "broken foot",
  "hamstring",
  "knee",
  "calf",
  "groin",
  "achilles",
  "muscle",
  "acl",
  "adductor",
  "ankle",
  "thigh",
  "knock",
  "strain",
  "sprain"
]);

function normalizeDetailsTeamNewsReason(value) {
  const text = cleanDetailsTeamNewsText(value);
  const lower = compactDetailsTeamNewsText(text);

  if (!text) return "";

  if (lower.includes("yellow-card accumulation")) return "suspension";
  if (lower.includes("fifth yellow")) return "suspension";
  if (lower.includes("serves a one-match suspension")) return "suspension";
  if (lower.includes("is suspended")) return "suspension";

  if (lower.includes("broken foot")) return "broken foot";
  if (lower.includes("acl")) return "acl injury";
  if (lower.includes("achilles")) return "achilles injury";
  if (lower.includes("groin")) return "groin injury";
  if (lower.includes("hamstring")) return "hamstring injury";
  if (lower.includes("knee")) return "knee injury";
  if (lower.includes("muscle")) return "muscle injury";
  if (lower.includes("injury") || lower.includes("unavailable through injury") || lower.includes("sidelined")) return "injury";

  if (DETAILS_TEAM_NEWS_REASON_TERMS.has(lower)) {
    return lower === "suspended" ? "suspension" : lower;
  }

  return text;
}

function isBadDetailsTeamNewsPlayer(value) {
  const text = cleanDetailsTeamNewsText(value);
  const lower = compactDetailsTeamNewsText(text);

  if (!text) return true;
  if (text.length < 3) return true;
  if (lower.includes("[object object]")) return true;
  if (DETAILS_TEAM_NEWS_REASON_TERMS.has(lower)) return true;
  if (lower.includes("certain absentee") && !lower.includes(":")) return true;

  if (/\b(placar final|menu principal|futebol futebol|mais esportes|disney plus|podcasts|busca vit|resumo coment)\b/i.test(text)) {
    return true;
  }

  if (/\b(shots on target|fouls committed|yellow cards|red cards|goals against)\b/i.test(text)) {
    return true;
  }

  if (/\b(official|coverage|published|fixture|comments|confirmed|reported|announced|ahead of|pre-match|post-match|club media|press conference|training update)\b/i.test(text)) {
    return true;
  }

  return false;
}

function normalizeDetailsTeamNewsAbsence(raw = {}) {
  let player = "";
  let reason = "";

  if (typeof raw === "string") {
    player = cleanDetailsTeamNewsText(raw);
  } else if (raw && typeof raw === "object") {
    player = cleanDetailsTeamNewsText(raw.player || raw.name || raw.fullName || raw.playerName);
    reason = cleanDetailsTeamNewsText(raw.reason || raw.status || raw.description || raw.note);
  }

  if (!player) return null;

  const suspendedMatch = player.match(/^(.+?)\s+is\s+suspended\.?$/i);
  if (suspendedMatch) {
    player = cleanDetailsTeamNewsText(suspendedMatch[1]);
    reason = reason || "suspension";
  }

  if (player.includes(":")) {
    const parts = player.split(":").map(v => cleanDetailsTeamNewsText(v)).filter(Boolean);

    if (parts.length >= 2) {
      player = parts[0];

      const candidateReason = parts.slice(1).find(part => {
        const lower = compactDetailsTeamNewsText(part);
        return DETAILS_TEAM_NEWS_REASON_TERMS.has(lower) ||
          lower.includes("injury") ||
          lower.includes("suspension") ||
          lower.includes("broken foot") ||
          lower.includes("certain absentee");
      });

      if (candidateReason) {
        reason = reason || normalizeDetailsTeamNewsReason(candidateReason);
      }
    }
  }

  reason = normalizeDetailsTeamNewsReason(reason);

  if (isBadDetailsTeamNewsPlayer(player)) return null;

  return {
    player,
    reason: reason || null,
    importance:
      raw && typeof raw === "object" && ["low", "medium", "high"].includes(compactDetailsTeamNewsText(raw.importance))
        ? compactDetailsTeamNewsText(raw.importance)
        : "medium"
  };
}

function sanitizeDetailsTeamNewsAbsences(items = []) {
  const byPlayer = new Map();

  for (const raw of Array.isArray(items) ? items : []) {
    const row = normalizeDetailsTeamNewsAbsence(raw);
    if (!row) continue;

    const playerKey = compactDetailsTeamNewsText(row.player);
    const reasonKey = compactDetailsTeamNewsText(row.reason);

    if (!playerKey) continue;

    const existing = byPlayer.get(playerKey);

    if (!existing) {
      byPlayer.set(playerKey, row);
      continue;
    }

    const existingHasReason = Boolean(compactDetailsTeamNewsText(existing.reason));
    const rowHasReason = Boolean(reasonKey);

    if (!existingHasReason && rowHasReason) {
      byPlayer.set(playerKey, row);
      continue;
    }

    if (existingHasReason && rowHasReason && compactDetailsTeamNewsText(existing.reason) !== reasonKey) {
      const merged = {
        ...existing,
        reason: existing.reason
      };

      byPlayer.set(playerKey, merged);
    }
  }

  return Array.from(byPlayer.values());
}

function sanitizeDetailsTeamNewsNotes(items = []) {
  const out = [];
  const seen = new Set();

  for (const raw of Array.isArray(items) ? items : []) {
    let text = cleanDetailsTeamNewsText(raw);
    if (!text) continue;

    const parts = text.split(":").map(v => cleanDetailsTeamNewsText(v)).filter(Boolean);

    if (parts.length >= 2) {
      const first = parts[0];
      const rest = parts.slice(1).join(":").trim();

      if (compactDetailsTeamNewsText(first) === compactDetailsTeamNewsText(rest)) {
        text = first;
      }
    }

    if (/\b(shots on target|fouls committed|yellow cards|red cards|goals against)\b/i.test(text)) {
      continue;
    }

    const key = compactDetailsTeamNewsText(text);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }

  return out;
}

function sanitizeDetailsTeamNewsSide(side = {}) {
  if (!side || typeof side !== "object" || Array.isArray(side)) return side;

  const absences = sanitizeDetailsTeamNewsAbsences(side.absences || []);
  const impactScore = impactScoreFromAbsences(absences);
  const impactLevel = impactLevelFromScore(impactScore);

  return {
    ...side,
    absences,
    impactScore,
    impactLevel
  };
}

function sanitizeDetailsTeamNewsPayload(payload) {
  if (!payload || typeof payload !== "object") return payload;

  const targets = [
    payload.teamNews,
    payload.researchedFacts?.teamNews
  ];

  for (const target of targets) {
    if (!target || typeof target !== "object") continue;

    if (target.data && typeof target.data === "object") {
      if (Array.isArray(target.data.absences)) {
        target.data.absences = sanitizeDetailsTeamNewsAbsences(target.data.absences);
      }

      if (Array.isArray(target.data.notes)) {
        target.data.notes = sanitizeDetailsTeamNewsNotes(target.data.notes);
      }

      if (target.data.home) {
        target.data.home = sanitizeDetailsTeamNewsSide(target.data.home);
      }

      if (target.data.away) {
        target.data.away = sanitizeDetailsTeamNewsSide(target.data.away);
      }
    }
  }

  return payload;
}


function parseAbsencesFromNotes(notes = []) {
  const absences = [];

  for (const raw of Array.isArray(notes) ? notes : []) {
    const row = normalizeDetailsTeamNewsAbsence(raw);
    if (!row) continue;
    absences.push(row);
  }

  return sanitizeDetailsTeamNewsAbsences(absences);
}

function impactScoreFromAbsences(absences = []) {
  if (!Array.isArray(absences) || !absences.length) return 0;

  let score = 0;

  for (const p of absences) {
    if (p?.importance === "high") score += 0.4;
    else if (p?.importance === "medium") score += 0.25;
    else score += 0.1;
  }

  return Math.min(score, 1);
}

function impactLevelFromScore(score = 0) {
  if (score >= 0.7) return "severe";
  if (score >= 0.4) return "moderate";
  if (score > 0) return "minor";
  return "none";
}

function synthesizeTeamNewsSide(sideData, fallbackSource) {
  const source = sideData?.source || fallbackSource || "local-team-news";
  const updatedAt = sideData?.updatedAt || null;

  if (sideData?.absences || sideData?.impactScore != null || sideData?.impactLevel) {
    return {
      absences: Array.isArray(sideData?.absences) ? sideData.absences : [],
      impactScore: Number.isFinite(Number(sideData?.impactScore)) ? Number(sideData.impactScore) : 0,
      impactLevel: sideData?.impactLevel || "none",
      source,
      updatedAt
    };
  }

  const notes = Array.isArray(sideData?.notes) ? sideData.notes : [];
  const absences = parseAbsencesFromNotes(notes);
  const impactScore = impactScoreFromAbsences(absences);
  const impactLevel = impactLevelFromScore(impactScore);

  return {
    absences,
    impactScore,
    impactLevel,
    source,
    updatedAt
  };
}

function buildRefereeBlock(match) {
  const refereeContext = buildRefereeContext(match);

  const stats = refereeContext?.data?.stats || null;
  const name = refereeContext?.data?.name || null;
  const style = refereeContext?.data?.style || "unknown";
  const role = refereeContext?.data?.role || "referee";

  let note = null;

  if (refereeContext?.status === "ready") {
    note = null;
  } else if (refereeContext?.status === "partial") {
    note = {
      code: "referee_stats_pending",
      el: "Υπάρχει τοπική ταυτότητα διαιτητή, αλλά δεν υπάρχουν ακόμη αποθηκευμένα στατιστικά προφίλ.",
      en: "A local referee identity is available, but no stored statistical profile exists yet."
    };
  } else {
    note = {
      code: "referee_identity_missing",
      el: "Δεν υπάρχει ακόμη τοπική ταυτότητα διαιτητή για το snapshot.",
      en: "No local referee identity is available yet for this snapshot."
    };
  }

  return {
    status: refereeContext?.status || "empty",
    source: refereeContext?.source || "local-officiating",
    reason: refereeContext?.reason || null,
    confidence: refereeContext?.confidence ?? 0,
    name,
    role,
    stats: {
      avgCards: stats?.avgCards ?? null,
      avgPenalties: stats?.avgPenalties ?? null,
      avgFouls: stats?.avgFouls ?? null,
      sampleSize: stats?.sampleSize ?? null
    },
    style,
    note
  };
}

function buildTeamNewsBlock(teamNewsFact) {
  if (!teamNewsFact || !teamNewsFact.data) {
    return {
      status: teamNewsFact?.status || "empty",
      source: teamNewsFact?.source || "local-team-news",
      confidence: teamNewsFact?.confidence ?? 0,
      data: null,
      reason: teamNewsFact?.reason || "missing_local_team_news"
    };
  }

  const source = teamNewsFact?.source || "local-team-news";

  const homeRaw =
    teamNewsFact?.data?.home ||
    teamNewsFact?.data?.homeTeam ||
    null;

  const awayRaw =
    teamNewsFact?.data?.away ||
    teamNewsFact?.data?.awayTeam ||
    null;

  const home = synthesizeTeamNewsSide(homeRaw, source);
  const away = synthesizeTeamNewsSide(awayRaw, source);

  const topLevelNotes = Array.isArray(teamNewsFact?.data?.notes)
    ? teamNewsFact.data.notes
    : [];

  const homeNotes = Array.isArray(teamNewsFact?.data?.homeTeam?.notes)
    ? teamNewsFact.data.homeTeam.notes
    : [];

  const awayNotes = Array.isArray(teamNewsFact?.data?.awayTeam?.notes)
    ? teamNewsFact.data.awayTeam.notes
    : [];

  const notes = dedupeText([
    ...topLevelNotes,
    ...homeNotes,
    ...awayNotes
  ]);

  return {
    status: teamNewsFact?.status || "ready",
    source,
    confidence: teamNewsFact?.confidence ?? 0,
    data: {
      home,
      away,
      notes
    },
    reason: teamNewsFact?.reason || null
  };
}

function compactGeoRecord(record, fallbackTeam) {
  if (!record || typeof record !== "object") return null;

  const latitude = Number(record.latitude);
  const longitude = Number(record.longitude);

  return {
    key: record.key || null,
    team: record.team || fallbackTeam || null,
    venue: record.venue || null,
    city: record.city || null,
    country: record.country || null,
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
    source: record.source || "local-team-geo",
    updatedAt: record.updatedAt || null
  };
}

function hasGeoCoordinates(geo) {
  return (
    geo &&
    Number.isFinite(Number(geo.latitude)) &&
    Number.isFinite(Number(geo.longitude))
  );
}

function degToRad(value) {
  return (Number(value) * Math.PI) / 180;
}

function haversineKm(a, b) {
  if (!hasGeoCoordinates(a) || !hasGeoCoordinates(b)) return null;

  const earthKm = 6371;
  const dLat = degToRad(Number(b.latitude) - Number(a.latitude));
  const dLon = degToRad(Number(b.longitude) - Number(a.longitude));

  const lat1 = degToRad(Number(a.latitude));
  const lat2 = degToRad(Number(b.latitude));

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return Math.round(earthKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
}

function travelImpactFromDistance(distanceKm, crossBorder) {
  if (!Number.isFinite(Number(distanceKm))) return "unknown";

  const km = Number(distanceKm);

  if (km >= 2500) return "high";
  if (km >= 800) return "medium";
  if (km >= 250) return crossBorder ? "medium" : "low";
  if (km > 0) return "minimal";

  return "none";
}

function travelProfileFromDistance(distanceKm, crossBorder) {
  if (!Number.isFinite(Number(distanceKm))) return "unknown";

  const km = Number(distanceKm);

  if (km >= 2500) return "long_haul";
  if (km >= 800) return "regional_flight";
  if (km >= 250) return crossBorder ? "cross_border_short_trip" : "domestic_trip";
  if (km > 0) return "local_or_short_trip";

  return "same_venue_or_unknown";
}

function buildLocalTravelContext(match) {
  const homeTeam = match?.homeTeam || null;
  const awayTeam = match?.awayTeam || null;

  const homeGeo = compactGeoRecord(readTeamGeoRecord(homeTeam), homeTeam);
  const awayGeo = compactGeoRecord(readTeamGeoRecord(awayTeam), awayTeam);

  const homeReady = hasGeoCoordinates(homeGeo);
  const awayReady = hasGeoCoordinates(awayGeo);

  if (!homeReady && !awayReady) {
    return {
      status: "empty",
      source: "local-team-geo",
      reason: "missing_home_and_away_geo",
      confidence: 0,
      data: {
        distanceKm: null,
        impact: "unknown",
        sameCountry: null,
        crossBorder: null,
        travelProfile: "unknown",
        home: homeGeo,
        away: awayGeo,
        note: {
          code: "travel_geo_missing",
          el: "Δεν υπάρχουν ακόμη local geo records για τις ομάδες.",
          en: "No local geo records are available yet for the teams."
        }
      }
    };
  }

  if (!homeReady || !awayReady) {
    return {
      status: "partial",
      source: "local-team-geo",
      reason: !homeReady ? "missing_home_geo" : "missing_away_geo",
      confidence: 0.35,
      data: {
        distanceKm: null,
        impact: "unknown",
        sameCountry: null,
        crossBorder: null,
        travelProfile: "partial_geo",
        home: homeGeo,
        away: awayGeo,
        note: {
          code: "travel_geo_partial",
          el: "Υπάρχει μερικό local geo context, αλλά λείπουν συντεταγμένες για μία ομάδα.",
          en: "Partial local geo context exists, but one team is missing coordinates."
        }
      }
    };
  }

  const distanceKm = haversineKm(homeGeo, awayGeo);
  const sameCountry =
    homeGeo.country && awayGeo.country
      ? String(homeGeo.country).toLowerCase() === String(awayGeo.country).toLowerCase()
      : null;

  const crossBorder = sameCountry == null ? null : !sameCountry;
  const impact = travelImpactFromDistance(distanceKm, crossBorder);
  const travelProfile = travelProfileFromDistance(distanceKm, crossBorder);

  return {
    status: Number.isFinite(Number(distanceKm)) ? "ready" : "partial",
    source: "local-team-geo",
    reason: Number.isFinite(Number(distanceKm)) ? null : "distance_unavailable",
    confidence: Number.isFinite(Number(distanceKm)) ? 0.78 : 0.45,
    data: {
      distanceKm,
      impact,
      sameCountry,
      crossBorder,
      travelProfile,
      home: homeGeo,
      away: awayGeo,
      note: {
        code: "travel_geo_ready",
        el: `Η εκτίμηση ταξιδιού βασίζεται σε local team geo records.`,
        en: "Travel estimate is based on local team geo records."
      }
    }
  };
}

function buildTravelBlock(travelContextFact) {
  return {
    status: travelContextFact?.status || "empty",
    source: travelContextFact?.source || "local-team-geo",
    reason: travelContextFact?.reason || null,
    confidence: travelContextFact?.confidence ?? 0,
    distanceKm: travelContextFact?.data?.distanceKm ?? null,
    impact: travelContextFact?.data?.impact || "unknown",
    sameCountry: travelContextFact?.data?.sameCountry ?? null,
    crossBorder: travelContextFact?.data?.crossBorder ?? null,
    travelProfile: travelContextFact?.data?.travelProfile || "unknown",
    home: travelContextFact?.data?.home || null,
    away: travelContextFact?.data?.away || null,
    note: travelContextFact?.data?.note || {
      code: "travel_pending",
      el: "Δεν υπάρχει ακόμη διαθέσιμο local travel context.",
      en: "Local travel context is not yet available."
    }
  };
}

function buildAnalysisBlock(match, valuePicks, competitionContext, referee, travel, teamNews) {
  const codes = [];

  if (isLiveLike(match?.status)) codes.push("live_match");
  if (isFinalLike(match?.status)) codes.push("final_match");
  if ((valuePicks || []).length) codes.push("value_present");

  const importance = competitionContext?.data?.importance || null;
  if (importance === "high") codes.push("high_competition_context");
  if (importance === "medium") codes.push("medium_competition_context");

  if (referee?.style === "low_intervention") codes.push("low_ref_intervention");
  if (travel?.impact === "high") codes.push("high_travel_load");

  const topPick = (valuePicks || [])
    .slice()
    .sort((a, b) => Number(b?.score || 0) - Number(a?.score || 0))[0];

  const partsEl = [];
  const partsEn = [];

  if (topPick) {
    partsEl.push(
      `Το ισχυρότερο διαθέσιμο value snapshot είναι ${topPick.market} → ${topPick.pick} με score ${Number(topPick.score || 0).toFixed(3)}.`
    );
    partsEn.push(
      `The strongest available value snapshot is ${topPick.market} → ${topPick.pick} with score ${Number(topPick.score || 0).toFixed(3)}.`
    );
  } else {
    partsEl.push("Δεν υπάρχει ακόμη διαθέσιμο value snapshot για τον αγώνα.");
    partsEn.push("No value snapshot is available yet for this match.");
  }

  const competitionReason =
    competitionContext?.data?.diagnostics?.reason || null;

  if (competitionContext?.status === "ready" && competitionContext?.data) {
    if (importance === "high") {
      partsEl.push("Υπάρχει ένδειξη αυξημένης σημασίας από το competition context.");
      partsEn.push("There is an indication of elevated importance from the competition context.");
    } else if (importance === "medium") {
      partsEl.push("Υπάρχει ένδειξη μεσαίας σημασίας από το competition context.");
      partsEn.push("There is an indication of medium importance from the competition context.");
    }
  } else if (competitionReason === "possible_cross_competition_mismatch") {
    partsEl.push("Το competition context υποδεικνύει πιθανή ασυμφωνία διοργάνωσης ή διασταυρούμενο ζευγάρι ομάδων από την πηγή.");
    partsEn.push("The competition context indicates a possible competition mismatch or cross-competition pairing from the source.");
  } else if (
    competitionContext?.status === "fallback" ||
    competitionContext?.status === "partial" ||
    competitionContext?.status === "empty"
  ) {
    partsEl.push("Δεν υπάρχει ακόμη επαρκές αξιόπιστο standings context για ασφαλή εκτίμηση βαθμολογικής σημασίας.");
    partsEn.push("There is not yet enough reliable standings context for a safe assessment of competitive importance.");
  }

  if (referee?.status === "pending") {
    partsEl.push("Τα στοιχεία διαιτητή δεν είναι ακόμη διαθέσιμα στο snapshot.");
    partsEn.push("Referee information is not yet available in the snapshot.");
  } else if (referee?.status === "partial") {
    partsEl.push("Ο διαιτητής έχει εντοπιστεί, αλλά λείπουν ακόμη τα στατιστικά του profile.");
    partsEn.push("The referee has been identified, but profile statistics are still missing.");
  }

  const homeAbsenceCount = Array.isArray(teamNews?.data?.home?.absences)
    ? teamNews.data.home.absences.length
    : 0;

  const awayAbsenceCount = Array.isArray(teamNews?.data?.away?.absences)
    ? teamNews.data.away.absences.length
    : 0;

  const totalAbsences = homeAbsenceCount + awayAbsenceCount;
  const totalTeamNewsNotes = Array.isArray(teamNews?.data?.notes)
    ? teamNews.data.notes.length
    : 0;

  if (teamNews?.status === "ready" || teamNews?.status === "ok") {
    partsEl.push(
      totalAbsences > 0
        ? `Υπάρχει διαθέσιμο team news context για τον αγώνα με ${totalAbsences} συνολικές καταγεγραμμένες απουσίες.`
        : totalTeamNewsNotes > 0
          ? `Υπάρχει διαθέσιμο team news context για τον αγώνα με ${totalTeamNewsNotes} συνολικές σημειώσεις ομάδων.`
          : "Υπάρχει διαθέσιμο team news context για τον αγώνα."
    );
    partsEn.push(
      totalAbsences > 0
        ? `Team news context is available for this match with ${totalAbsences} recorded absences in total.`
        : totalTeamNewsNotes > 0
          ? `Team news context is available for this match with ${totalTeamNewsNotes} combined team notes.`
          : "Team news context is available for this match."
    );
  } else if (teamNews?.status === "empty" || teamNews?.status === "pending") {
    partsEl.push("Δεν υπάρχει ακόμη διαθέσιμο team news context στο snapshot.");
    partsEn.push("Team news context is not yet available in the snapshot.");
  }


  if (travel?.status === "ready" && Number.isFinite(travel?.distanceKm)) {
    partsEl.push(`Η εκτίμηση ταξιδιού είναι περίπου ${travel.distanceKm} χλμ (${travel.impact}).`);
    partsEn.push(`Estimated travel distance is approximately ${travel.distanceKm} km (${travel.impact}).`);
  } else if (travel?.status === "partial") {
    partsEl.push("Υπάρχει μερικό local travel context, αλλά δεν επαρκεί ακόμη για πλήρη εκτίμηση απόστασης.");
    partsEn.push("Partial local travel context exists, but it is not yet sufficient for a full distance estimate.");
  } else if (travel?.status === "empty" || travel?.status === "pending") {
    partsEl.push("Δεν υπάρχει ακόμη διαθέσιμο local travel context στο snapshot.");
    partsEn.push("Local travel context is not yet available in the snapshot.");
  }

  return {
    codes,
    summary: {
      el: partsEl.join(" "),
      en: partsEn.join(" ")
    }
  };
}

function buildSourceIntelligence(match) {
  if (!match?.reconcileMeta) return null;

  const decision = match.reconcileMeta.decision || {
    status: {
      type: "consensus",
      chosen: match.status,
      source: match.reconcileMeta?.chosenStatusSource || null,
      sources: Object.keys(match.sources || {})
    },
    score: {
      type: "consensus",
      chosen: `${match.scoreHome}-${match.scoreAway}`,
      source: match.reconcileMeta?.chosenScoreSource || null
    },
    minute: {
      type: "consensus",
      chosen: match.minute,
      source: match.reconcileMeta?.chosenMinuteSource || null
    }
  };

  const decisionSources = Array.from(
    new Set([
      ...(Array.isArray(decision?.status?.sources) ? decision.status.sources : []),
      decision?.status?.source || null,
      decision?.score?.source || null,
      decision?.minute?.source || null
    ].filter(Boolean))
  );

  return {
    decision,
    confidence: match.reconcileMeta.confidence ?? null,
    conflicts: match.reconcileMeta.conflictTypes || [],
    disagreement: match.reconcileMeta.disagreement || false,
    sources: decisionSources.length
  };
}

function compactPlayerUsageIntelForFacts(playerUsageIntel) {
  function compactNames(items) {
    if (!Array.isArray(items)) return [];

    return items
      .map((x) => {
        if (typeof x === "string") return x.trim();

        if (x && typeof x === "object") {
          return String(x.name || x.player || x.playerName || "").trim();
        }

        return "";
      })
      .filter(Boolean);
  }

  function compactSide(side) {
    const x = side && typeof side === "object" ? side : {};

    return {
      team: x.team || null,
      opponent: x.opponent || null,
      side: x.side || null,
      leagueSlug: x.leagueSlug || null,
      leagueName: x.leagueName || null,
      competitionType: x.competitionType || null,
      source: x.source || null,
      updatedAt: x.updatedAt || null,

      status: x.status || "unavailable",
      reason: x.reason || null,
      confidence: Number.isFinite(Number(x.confidence)) ? Number(x.confidence) : 0,
      sampleMatches:
        x.sampleMatches != null
          ? x.sampleMatches
          : x.matchCount != null
            ? x.matchCount
            : x.meta?.sampleMatches != null
              ? x.meta.sampleMatches
              : 0,

      expectedStarters: compactNames(x.expectedStarters),
      confirmedAbsences: compactNames(x.confirmedAbsences),
      inferredAbsences: compactNames(x.inferredAbsences)
    };
  }

  return {
    home: compactSide(playerUsageIntel?.home),
    away: compactSide(playerUsageIntel?.away)
  };
}
function buildDetailsPayload(match, valuePicks, aiBlocks = {}) {
  const competitionContext = aiBlocks?.researchedFacts?.competitionContext || null;
  const refereeProfile = aiBlocks?.researchedFacts?.refereeProfile || null;
  const teamNewsFact = aiBlocks?.researchedFacts?.teamNews || null;
  const researchedTravelContextFact = aiBlocks?.researchedFacts?.travelContext || null;
  const localTravelContextFact = buildLocalTravelContext(match);

  const travelContextFact =
    researchedTravelContextFact?.status === "ready" &&
    Number.isFinite(Number(researchedTravelContextFact?.data?.distanceKm))
      ? researchedTravelContextFact
      : localTravelContextFact;

  const referee = buildRefereeBlock(match);
  const travel = buildTravelBlock(travelContextFact);
  const teamNews = buildTeamNewsBlock(teamNewsFact);
  const analysis = buildAnalysisBlock(
    match,
    valuePicks,
    competitionContext,
    referee,
    travel,
    teamNews
  );

  // ---------- PLAYER USAGE INTELLIGENCE ----------

  const homeUsage = readPlayerUsageRecord(match?.homeTeam);
  const awayUsage = readPlayerUsageRecord(match?.awayTeam);

  const homeAbsenceIntel = inferAbsencesFromUsage({
    playerUsage: homeUsage,
    teamNews: teamNews?.data?.home,
    context: {
      team: match?.homeTeam || null,
      leagueSlug: match?.leagueSlug || null,
      leagueName: match?.leagueName || null,
      competitionType: classifyCompetitionType(match)
    }
  });

  const awayAbsenceIntel = inferAbsencesFromUsage({
    playerUsage: awayUsage,
    teamNews: teamNews?.data?.away,
    context: {
      team: match?.awayTeam || null,
      leagueSlug: match?.leagueSlug || null,
      leagueName: match?.leagueName || null,
      competitionType: classifyCompetitionType(match)
    }
  });

  const playerUsageIntel = {
    home: {
      ...homeAbsenceIntel,
      team: match.homeTeam || null,
      opponent: match.awayTeam || null,
      side: "home",
      leagueSlug: homeUsage?.leagueSlug || match.leagueSlug || null,
      leagueName: match.leagueName || null,
      competitionType: classifyCompetitionType(match),
      source: homeUsage?.source || null,
      updatedAt: homeUsage?.updatedAt || null
    },
    away: {
      ...awayAbsenceIntel,
      team: match.awayTeam || null,
      opponent: match.homeTeam || null,
      side: "away",
      leagueSlug: awayUsage?.leagueSlug || match.leagueSlug || null,
      leagueName: match.leagueName || null,
      competitionType: classifyCompetitionType(match),
      source: awayUsage?.source || null,
      updatedAt: awayUsage?.updatedAt || null
    }
  };

  return {
    matchId: String(match.matchId),
    dayKey: kickoffDay(match),
    generatedAt: new Date().toISOString(),
    basic: {
      matchId: String(match.matchId),
      leagueSlug: match.leagueSlug || null,
      leagueName: match.leagueName || null,
      competitionType: classifyCompetitionType(match),
      homeTeam: match.homeTeam || null,
      awayTeam: match.awayTeam || null,
      kickoffUtc: toIsoOrNull(match.kickoffUtc),
      status: match.status || null,
      rawStatus: match.rawStatus || null,
      minute: match.minute || null,
      scoreHome: Number.isFinite(Number(match.scoreHome)) ? Number(match.scoreHome) : null,
      scoreAway: Number.isFinite(Number(match.scoreAway)) ? Number(match.scoreAway) : null,
      venue: match.venue || null
    },
    context: {
      status: competitionContext?.status || "empty",
      confidence: competitionContext?.confidence ?? 0,
      competitionType: competitionContext?.data?.type || classifyCompetitionType(match),
      importance: competitionContext?.data?.importance || "unknown",
      positions: competitionContext?.data?.positions || null,
      stakes: competitionContext?.data?.stakes || null,
      pressure: competitionContext?.data?.pressure || null,
      notes: Array.isArray(competitionContext?.data?.notes) ? competitionContext.data.notes : [],
      diagnostics: competitionContext?.data?.diagnostics || null,
      sourceReliability:
        competitionContext?.status === "ready"
          ? "usable"
          : competitionContext?.data?.diagnostics?.reason === "possible_cross_competition_mismatch"
            ? "suspect"
            : "limited",
      travelImpact: travel.impact,
      travelProfile: travel.travelProfile,
      crossBorder: travel.crossBorder
    },
    referee: refereeProfile?.data
      ? {
          status: refereeProfile.status || "ready",
          ...refereeProfile.data
        }
      : referee,
    teamNews,
    lineups: {
      home: {
        starters: Array.isArray(match?.lineups?.home?.starters)
          ? match.lineups.home.starters
          : [],
        bench: Array.isArray(match?.lineups?.home?.bench)
          ? match.lineups.home.bench
          : []
      },
      away: {
        starters: Array.isArray(match?.lineups?.away?.starters)
          ? match.lineups.away.starters
          : [],
        bench: Array.isArray(match?.lineups?.away?.bench)
          ? match.lineups.away.bench
          : []
      },
      source: match?.lineups ? "fixture.lineups" : "missing",
      status: match?.lineups ? "partial" : "missing"
    },
    travel,
    value: Array.isArray(valuePicks) ? valuePicks : [],
    analysis,
    playerUsageIntel,
    meta: {
      version: DETAILS_SCHEMA_VERSION,
      builderVersion: DETAILS_BUILDER_VERSION,
      languageReady: ["el", "en"],
      source: "engine-v1",
      snapshotMode: "update_on_change",
      signature: null,
      pendingSignals: {
        standings: competitionContext?.status !== "ready",
        refereeStats: !refereeProfile?.data && referee.status !== "ready",
        teamNews: !teamNewsFact?.data,
        travelGeo: travel.status !== "ready"
      }
    }
  };
}


function readCanonicalFixturesForDay(dayKey) {
  const dir = resolveDataPath("canonical-fixtures", dayKey);
  const rows = [];
  const seen = new Set();

  if (!fs.existsSync(dir)) {
    return rows;
  }

  for (const file of fs.readdirSync(dir).filter(name => name.endsWith(".json")).sort()) {
    const payload = readJsonSafe(path.join(dir, file), null);
    const fixtures = Array.isArray(payload?.fixtures) ? payload.fixtures : [];

    for (const fixture of fixtures) {
      const matchId = String(
        fixture?.matchId ||
        fixture?.sourceMatchId ||
        fixture?.sourceId ||
        fixture?.matchKey ||
        fixture?.id ||
        ""
      ).trim();

      if (!matchId || seen.has(matchId)) {
        continue;
      }

      seen.add(matchId);
      rows.push({
        ...fixture,
        matchId
      });
    }
  }

  return rows.sort((a, b) => {
    const ka = String(a?.kickoffUtc || a?.date || "");
    const kb = String(b?.kickoffUtc || b?.date || "");
    if (ka !== kb) return ka.localeCompare(kb);
    return String(a?.matchId || "").localeCompare(String(b?.matchId || ""));
  });
}

function detailsFilePath(dayKey, matchId) {
  return resolveDataPath("details", dayKey, `${matchId}.json`);
}

export async function buildDetailsForMatch(matchId, { rebuild = false } = {}) {
  const match = getFixtureById(String(matchId));
  if (!match) {
    return { ok: false, error: "match_not_found", matchId: String(matchId) };
  }

  const dayKey = kickoffDay(match);
  if (!dayKey) {
    return { ok: false, error: "missing_day_key", matchId: String(matchId) };
  }

  const file = detailsFilePath(dayKey, match.matchId);
  const existing = fs.existsSync(file) ? readJsonSafe(file, null) : null;

  const valuePicksByMatch = buildValuePicksByMatch(dayKey);
  const valuePicks = valuePicksByMatch.get(String(match.matchId)) || [];

  const aiBlocks = await buildAiDetailsBlock(match, {
    dayKey,
    valuePicks,
    allFixtures: getFixturesByDay(dayKey) || []
  });

  const basePayload = buildDetailsPayload(match, valuePicks, aiBlocks);

  const payload = {
    ...basePayload,

    teamNews: compactForDetails(basePayload.teamNews, {
      maxArrayItems: 12,
      maxStringLength: 400,
      maxDepth: 5
    }),
    playerUsageIntel: compactForDetails(basePayload.playerUsageIntel, {
      maxArrayItems: 12,
      maxStringLength: 400,
      maxDepth: 5
    }),

    ai: aiBlocks.ai || null,
    researchedFacts: compactResearchedFactsForDetails(
      aiBlocks.researchedFacts,
      basePayload.playerUsageIntel
    ),
    aiContext: compactForDetails(aiBlocks.aiContext, {
      maxArrayItems: 16,
      maxStringLength: 800,
      maxDepth: 6
    }),
    aiSummary: aiBlocks?.aiContext?.summary || null,
    valueSummary:
      buildValueSummaryFromPicks(valuePicks) ||
      aiBlocks?.aiContext?.valueSummary ||
      aiBlocks?.researchedFacts?.valueContext ||
      null,
    sourceAudit: compactForDetails(aiBlocks.sourceAudit, {
      maxArrayItems: 12,
      maxStringLength: 500,
      maxDepth: 5
    }),
    learningMeta: compactForDetails(aiBlocks.learningMeta, {
      maxArrayItems: 8,
      maxStringLength: 400,
      maxDepth: 4
    }),
    remoteTaskQueue: compactRemoteTaskQueueForDetails(aiBlocks.remoteTaskQueue),
    remoteTaskRouter: aiBlocks.remoteTaskRouter || {
      status: "idle",
      queueSize: 0,
      queuedCapabilities: []
    },
    remoteExecution:       compactRemoteExecutionForDetails(aiBlocks.remoteExecution),

    sourceIntelligence: buildSourceIntelligence(match)
  };

  sanitizeDetailsTeamNewsPayload(payload);

  

  const nextSignature = buildDetailsSignature(match, valuePicks, payload);

  if (!rebuild && existing?.meta?.signature === nextSignature) {
    return {
      ok: true,
      dayKey,
      matchId: String(match.matchId),
      file,
      reused: true,
      details: existing
    };
  }

  payload.meta.signature = nextSignature;

  writeJson(file, payload);

  return {
    ok: true,
    dayKey,
    matchId: String(match.matchId),
    file,
    reused: false,
    details: payload
  };
}

export async function buildDetailsDay(dayKey, { rebuild = false } = {}) {
  let rows = getFixturesByDay(dayKey) || [];
  let fixtureSource = "fixtures_json";

  const canonicalRows = readCanonicalFixturesForDay(dayKey);
  if (canonicalRows.length > rows.length) {
    rows = canonicalRows;
    fixtureSource = "canonical_fixtures";
  } else if (!rows.length && canonicalRows.length) {
    rows = canonicalRows;
    fixtureSource = "canonical_fixtures";
  }

  if (!rows.length) {
    return {
      ok: false,
      dayKey,
      reason: "no_rows",
      fixtureSource,
      built: 0,
      skipped: 0,
      files: []
    };
  }

  ensureDir(resolveDataPath("details", dayKey));

  const valuePicksByMatch = buildValuePicksByMatch(dayKey);

  console.log("[build-details-day] value:snapshot", {
    dayKey,
    fixtureSource,
    fixtureCount: rows.length,
    matchesWithValue: valuePicksByMatch.size
  });

  let built = 0;
  let skipped = 0;
  const files = [];

for (const match of rows) {
  console.log("[build-details-day] match:start", {
    matchId: match?.matchId,
    homeTeam: match?.homeTeam,
    awayTeam: match?.awayTeam
  });

  const file = detailsFilePath(dayKey, match.matchId);
  const existing = fs.existsSync(file) ? readJsonSafe(file, null) : null;

  const valuePicks = valuePicksByMatch.get(String(match.matchId)) || [];

  const aiBlocks = await buildAiDetailsBlock(match, {
    dayKey,
    valuePicks,
    allFixtures: rows
  });

  const basePayload = buildDetailsPayload(match, valuePicks, aiBlocks);

  const payload = {
    ...basePayload,

    teamNews: compactForDetails(basePayload.teamNews, {
      maxArrayItems: 12,
      maxStringLength: 400,
      maxDepth: 5
    }),
    playerUsageIntel: compactForDetails(basePayload.playerUsageIntel, {
      maxArrayItems: 12,
      maxStringLength: 400,
      maxDepth: 5
    }),

    ai: aiBlocks.ai || null,
    researchedFacts: compactResearchedFactsForDetails(
      aiBlocks.researchedFacts,
      basePayload.playerUsageIntel
    ),
    aiContext: compactForDetails(aiBlocks.aiContext, {
      maxArrayItems: 16,
      maxStringLength: 800,
      maxDepth: 6
    }),
    aiSummary: aiBlocks?.aiContext?.summary || null,
    valueSummary:
      buildValueSummaryFromPicks(valuePicks) ||
      aiBlocks?.aiContext?.valueSummary ||
      aiBlocks?.researchedFacts?.valueContext ||
      null,
    sourceAudit: compactForDetails(aiBlocks.sourceAudit, {
      maxArrayItems: 12,
      maxStringLength: 500,
      maxDepth: 5
    }),
    learningMeta: compactForDetails(aiBlocks.learningMeta, {
      maxArrayItems: 8,
      maxStringLength: 400,
      maxDepth: 4
    }),
    remoteTaskQueue: compactRemoteTaskQueueForDetails(aiBlocks.remoteTaskQueue),
    remoteTaskRouter: aiBlocks.remoteTaskRouter || {
      status: "idle",
      queueSize: 0,
      queuedCapabilities: []
    },
    remoteExecution: compactRemoteExecutionForDetails(aiBlocks.remoteExecution),

    sourceIntelligence: buildSourceIntelligence(match)
  };

  sanitizeDetailsTeamNewsPayload(payload);

  

  const nextSignature = buildDetailsSignature(match, valuePicks, payload);

  if (!rebuild && existing?.meta?.signature === nextSignature) {
    console.log("[build-details-day] match:skip", {
      matchId: match?.matchId
    });

    skipped += 1;
    files.push(file);
    continue;
  }

  payload.meta.signature = nextSignature;
  writeJson(file, payload);

  console.log("[build-details-day] match:write", {
    matchId: match?.matchId,
    file
  });

  built += 1;
  files.push(file);
}

  return {
    ok: true,
    dayKey,
    total: rows.length,
    built,
    skipped,
    files
  };
}

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const dayKey = process.argv[2];
  const rebuild = process.argv.includes("--rebuild");

  console.log("[build-details-day] cli:start", {
    argv: process.argv.slice(2),
    dayKey,
    rebuild
  });

  if (!dayKey) {
    console.error("[build-details-day] missing dayKey");
    process.exit(1);
  }

  buildDetailsDay(dayKey, { rebuild })
    .then(result => {
      console.log("[build-details-day] cli:done", result);
    })
    .catch(err => {
      console.error("[build-details-day] cli:fatal", err);
      process.exit(1);
    });
}