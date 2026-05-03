import fs from "fs";
import path from "path";
import { ensureDir, resolveDataPath } from "./data-root.js";

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

function normalizeText(value) {
  return String(value || "").trim();
}

function extractTeamNewsPlayerName(item = {}) {
  const raw =
    item?.player ??
    item?.name ??
    item?.fullName ??
    item?.playerName;

  if (typeof raw === "string" || typeof raw === "number") {
    return normalizeText(raw);
  }

  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return normalizeText(
      raw.name ||
      raw.fullName ||
      raw.playerName ||
      raw.displayName ||
      raw.shortName
    );
  }

  return "";
}


function isTeamNewsUrlLike(value) {
  const text = normalizeText(value).toLowerCase();
  return text.startsWith("http://") || text.startsWith("https://") || text.includes("www.");
}

function looksLikeTeamNewsSentence(value) {
  const text = normalizeText(value);
  if (!text) return false;
  if (text.length > 55) return true;
  if (/[.!?]$/.test(text) && text.split(/\s+/).length >= 6) return true;
  if (/\b(official|coverage|published|fixture|comments|confirmed|reported|announced|ahead of|pre-match|post-match|club media|press conference|training update)\b/i.test(text) && text.split(/\s+/).length >= 5) return true;
  return false;
}


function isGenericTeamNewsInjuryTerm(value) {
  const lower = String(value || "").trim().toLowerCase();

  if (!lower) return false;

  const genericInjuryTerms = new Set([
    "knee",
    "ankle",
    "hamstring",
    "calf",
    "thigh",
    "groin",
    "shoulder",
    "back",
    "head",
    "foot",
    "leg",
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
    "minor injury",
    "long-term injury",
    "adductor",
    "lower leg",
    "upper leg",
    "acl",
    "achilles",
    "meniscus",
    "hip",
    "rib",
    "ribs",
    "concussion",
    "ill",
    "illness",
    "personal reasons",
    "not disclosed",
    "undisclosed",
    "day-to-day",
    "fitness issue",
    "medical",
    "rehab",
    "recovery",
    "upper body injury",
    "lower body injury",
    "body injury",
    "upper-body",
    "lower-body",
    "upper body",
    "lower body",
    "hamstring injury",
    "sports hernia"
  ]);

  if (genericInjuryTerms.has(lower)) return true;

  const compact = lower.replace(/\s+/g, " ").trim();
  if (genericInjuryTerms.has(compact)) return true;

  if (compact.includes(":")) {
    const parts = compact.split(":").map(v => v.trim()).filter(Boolean);
    if (parts.length > 0 && parts.every(part => genericInjuryTerms.has(part))) {
      return true;
    }
  }

  return false;
}


function isBadTeamNewsBoilerplateText(value) {
  const text = String(value || "").trim();
  const lower = text.toLowerCase().replace(/\s+/g, " ").trim();

  if (!text) return false;
  if (lower.includes("[object object]")) return true;

  const badExactPlayerTerms = new Set([
    "placar final",
    "menu principal",
    "futebol futebol",
    "mais esportes mais",
    "esportes disney plus",
    "podcasts podcasts programa",
    "busca vit",
    "brasileiro serie",
    "coritiba coritiba",
    "pen pedro rocha",
    "resumo coment"
  ]);

  if (badExactPlayerTerms.has(lower)) return true;

  const badNeedles = [
    "ir para o conteúdo principal",
    "ir para o menu principal",
    "espn futebol futebol",
    "nfl nfl nba",
    "espn knockout",
    "tênis tênis",
    "f1 f1",
    "olimpíadas olimpíada",
    "disney plus",
    "podcasts podcasts"
  ];

  if (badNeedles.some(needle => lower.includes(needle))) return true;

  if (/\b(placar final|menu principal|mais esportes|futebol futebol|busca vit|brasileiro serie)\b/i.test(text) && text.length > 40) {
    return true;
  }

  if (/\b(shots on target|fouls committed|yellow cards|red cards|goals against)\b/i.test(text) && text.length > 80) {
    return true;
  }

  return false;
}

function isBadTeamNewsPlayerName(value) {
  const text = normalizeText(value);
  const lower = text.toLowerCase();

  if (!text || text.length < 3) return true;
  if (isBadTeamNewsBoilerplateText(text)) return true;
  if (lower === "[object object]") return true;
  if (isGenericTeamNewsInjuryTerm(lower)) return true;
  if (isTeamNewsUrlLike(text)) return true;
  if (looksLikeTeamNewsSentence(text)) return true;
  if (lower.includes("http")) return true;

  const genericInjuryTerms = new Set([
    "knee",
    "ankle",
    "hamstring",
    "calf",
    "thigh",
    "groin",
    "shoulder",
    "back",
    "head",
    "foot",
    "leg",
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
    "minor injury",
    "long-term injury"
  ]);

  if (lower.includes("[object object]")) return true;
  if (isGenericTeamNewsInjuryTerm(lower)) return true;
  if (genericInjuryTerms.has(lower)) return true;


  const blocked = new Set([
    "evidence",
    "source",
    "sources",
    "note",
    "notes",
    "team news",
    "injury update",
    "suspension",
    "suspended",
    "injured",
    "unavailable",
    "doubtful",
    "unknown",
    "confirmed",
    "reported"
  ]);

  if (blocked.has(lower)) return true;
  if (lower.startsWith("evidence:")) return true;
  if (lower.startsWith("source:")) return true;
  if (lower.startsWith("note:")) return true;

  return false;
}

function isCanonicalTeamNewsRecord(value) {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    normalizeText(value.team).length > 0
  );
}

function normalizeTeamKey(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeImportance(value) {
  const v = normalizeText(value).toLowerCase();
  if (v === "high" || v === "medium" || v === "low") return v;
  return "low";
}


function normalizeTeamNewsAbsenceShape(playerValue, reasonValue = "") {
  let player = String(playerValue || "").trim();
  let reason = String(reasonValue || "").trim();

  const lowerPlayer = player.toLowerCase().replace(/\s+/g, " ").trim();

  const reasonOnlyTerms = new Set([
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
    "muscle"
  ]);

  if (!player || reasonOnlyTerms.has(lowerPlayer)) {
    return null;
  }

  if (lowerPlayer.includes("certain absentee")) {
    return null;
  }

  const suspendedMatch = player.match(/^(.+?)\s+is\s+suspended\.?$/i);
  if (suspendedMatch) {
    player = suspendedMatch[1].trim();
    reason = reason || "suspension";
  }

  if (player.includes(":")) {
    const parts = player.split(":").map(v => v.trim()).filter(Boolean);

    if (parts.length >= 2) {
      const first = parts[0];
      const second = parts[1];
      const compactSecond = second.toLowerCase().replace(/\s+/g, " ").trim();

      if (reasonOnlyTerms.has(compactSecond)) {
        player = first;
        reason = reason || compactSecond;
      } else {
        return null;
      }
    }
  }

  if (!player || player.length < 3) return null;

  return {
    player,
    reason: reason || null
  };
}

function normalizeAbsence(item = {}) {
  const player = extractTeamNewsPlayerName(item);

  if (isBadTeamNewsPlayerName(player)) return null;

  let shaped = normalizeTeamNewsAbsenceShape(player, "");
  if (!shaped) return null;

  const rawReason = normalizeText(
    item?.reason ||
    item?.status ||
    item?.description ||
    item?.note
  );

  let reason =
    rawReason &&
    !isBadTeamNewsBoilerplateText(rawReason) &&
    
    !isTeamNewsUrlLike(rawReason) &&
    rawReason.toLowerCase() !== player.toLowerCase()
      
      
      ? rawReason
      : "";

  shaped = normalizeTeamNewsAbsenceShape(shaped.player, reason);
  if (!shaped) return null;
  reason = shaped.reason || "";

  const team = normalizeText(
    item?.team ||
    item?.teamName ||
    item?.club ||
    item?.clubName ||
    item?.targetTeam ||
    item?.squadTeam
  );

  const sourceTeam = normalizeText(
    item?.sourceTeam ||
    item?.reportedTeam ||
    item?.matchedTeam
  );

  return {
    player: shaped.player,
    reason: shaped.reason || null,
    importance: normalizeImportance(item?.importance),
    team: team || null,
    sourceTeam: sourceTeam || null
  };
}

function dedupeAbsences(items = []) {
  const out = [];
  const seen = new Set();

  for (const raw of Array.isArray(items) ? items : []) {
    const item = normalizeAbsence(raw);
    if (!item) continue;

    const player = normalizeText(item?.player);
    if (isBadTeamNewsPlayerName(player)) continue;

    const reason = normalizeText(item?.reason);
    const importance = normalizeImportance(item?.importance);
    const team = normalizeText(item?.team);
    const sourceTeam = normalizeText(item?.sourceTeam);

    const key = [
      player.toLowerCase(),
      reason.toLowerCase(),
      importance,
      team.toLowerCase(),
      sourceTeam.toLowerCase()
    ].join("__");

    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      player,
      reason: isBadTeamNewsBoilerplateText(reason) ? null : (reason || null),
      importance,
      team: team || null,
      sourceTeam: sourceTeam || null
    });
  }

  return out;
}

function normalizeNotes(items = []) {
  const out = [];
  const seen = new Set();

  for (const raw of Array.isArray(items) ? items : []) {
    const text = normalizeText(raw);
    if (!text) continue;

    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push(text);
  }

  return out;
}

function normalizeAliases(items = [], team = null) {
  const out = [];
  const seen = new Set();

  for (const raw of Array.isArray(items) ? items : []) {
    const text = normalizeText(raw);
    if (!text) continue;

    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    out.push(text);
  }

  const safeTeam = normalizeText(team);
  if (safeTeam) {
    const key = safeTeam.toLowerCase();
    if (!seen.has(key)) {
      out.unshift(safeTeam);
    }
  }

  return out;
}

function normalizeEvidenceItem(item = {}) {
  const url = normalizeText(item?.url || item?.href);
  const label = normalizeText(item?.label || item?.title || item?.source);
  const publisher = normalizeText(item?.publisher || item?.site || item?.domain);
  const publishedAt = normalizeText(item?.publishedAt || item?.date);

  if (!url && !label && !publisher) return null;

  return {
    label: label || null,
    url: url || null,
    publisher: publisher || null,
    publishedAt: publishedAt || null
  };
}

function dedupeEvidence(items = []) {
  const out = [];
  const seen = new Set();

  for (const raw of Array.isArray(items) ? items : []) {
    const item = normalizeEvidenceItem(raw);
    if (!item) continue;

    const key = [
      normalizeText(item?.url).toLowerCase(),
      normalizeText(item?.label).toLowerCase(),
      normalizeText(item?.publisher).toLowerCase()
    ].join("__");

    if (seen.has(key)) continue;
    seen.add(key);

    out.push(item);
  }

  return out;
}

function compactSourceMeta(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  return {
    provider: normalizeText(input?.provider) || null,
    mode: normalizeText(input?.mode) || null,
    status: normalizeText(input?.status) || null,
    reason: normalizeText(input?.reason) || null,
    confidence: Number.isFinite(Number(input?.confidence))
      ? Number(input.confidence)
      : null,
    sourceCount: Number.isFinite(Number(input?.sourceCount))
      ? Number(input.sourceCount)
      : null,
    evidenceCount: Number.isFinite(Number(input?.evidenceCount))
      ? Number(input.evidenceCount)
      : null,
    generatedAt: normalizeText(input?.generatedAt || input?.executedAt) || null,
    strictAbsenceGuard: true
  };
}

function normalizeAbsences(items = []) {
  return dedupeAbsences(
    (Array.isArray(items) ? items : [])
      .map(normalizeAbsence)
      .filter(Boolean)
  );
}

export function getTeamNewsPath(teamNameOrKey) {
  const key = normalizeTeamKey(teamNameOrKey);
  if (!key) return null;
  return resolveDataPath("team-news", `${key}.json`);
}

export function normalizeTeamNewsRecord(input = {}) {
  const team = normalizeText(input?.team);
  const key = normalizeTeamKey(input?.key || team);

  if (!key) {
    throw new Error("normalizeTeamNewsRecord: missing team key");
  }

  return {
    key,
    team: team || null,
    leagueSlug: normalizeText(input?.leagueSlug) || null,
    matchIds: Array.from(
      new Set(
        (Array.isArray(input?.matchIds) ? input.matchIds : [])
          .map(v => normalizeText(v))
          .filter(Boolean)
      )
    ),
    aliases: normalizeAliases(input?.aliases || [], team || null),
    absences: normalizeAbsences(input?.absences || []),
    notes: normalizeNotes(input?.notes || []),
    evidence: dedupeEvidence(input?.evidence || []),
    source: normalizeText(input?.source) || "local-team-news",
    sourceMeta: compactSourceMeta(input?.sourceMeta),
    updatedAt: input?.updatedAt || new Date().toISOString()
  };
}

export function readTeamNewsRecord(teamNameOrKey) {
  const filePath = getTeamNewsPath(teamNameOrKey);
  if (!filePath) return null;

  const raw = readJsonSafe(filePath, null);
  if (!raw) return null;

  try {
    const normalized = normalizeTeamNewsRecord(raw);
    return isCanonicalTeamNewsRecord(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

export function writeTeamNewsRecord(record) {
  const normalized = normalizeTeamNewsRecord(record);
  const filePath = getTeamNewsPath(normalized.key);

  if (!filePath) {
    throw new Error("writeTeamNewsRecord: invalid team key");
  }

  const safeRecord = {
    key: normalized.key,
    team: normalized.team || null,
    leagueSlug: normalized.leagueSlug || null,
    matchIds: Array.isArray(normalized.matchIds)
      ? normalized.matchIds.slice(0, 20)
      : [],
    aliases: Array.isArray(normalized.aliases)
      ? normalized.aliases.slice(0, 20).map(v => normalizeText(v)).filter(Boolean)
      : [],
    absences: Array.isArray(normalized.absences)
      ? normalized.absences
          .slice(0, 30)
          .map(normalizeAbsence)
          .filter(Boolean)
          .map(row => ({
            player: normalizeText(row?.player) || null,
            reason: normalizeText(row?.reason) || null,
            importance: normalizeImportance(row?.importance)
          }))
      : [],
    notes: Array.isArray(normalized.notes)
      ? normalized.notes.slice(0, 30).map(v => normalizeText(v)).filter(Boolean)
      : [],
    evidence: Array.isArray(normalized.evidence)
      ? normalized.evidence.slice(0, 20).map(row => ({
          label: normalizeText(row?.label).slice(0, 240) || null,
          url: normalizeText(row?.url).slice(0, 500) || null,
          publisher: normalizeText(row?.publisher).slice(0, 120) || null,
          publishedAt: normalizeText(row?.publishedAt).slice(0, 80) || null
        }))
      : [],
    source: normalizeText(normalized.source) || "local-team-news",
    sourceMeta: {
      ...compactSourceMeta(normalized.sourceMeta),
      strictAbsenceGuard: true
    },
    updatedAt: normalized.updatedAt || new Date().toISOString()
  };

  writeJson(filePath, safeRecord);

  return {
    ok: true,
    filePath,
    record: safeRecord
  };
}

export { normalizeTeamKey };
