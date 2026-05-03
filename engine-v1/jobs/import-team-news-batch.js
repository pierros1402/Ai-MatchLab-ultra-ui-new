import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  readTeamNewsRecord,
  writeTeamNewsRecord
} from "../storage/team-news-db.js";

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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

  const rawReason = normalizeText(item?.reason || item?.status || item?.description || item?.note);
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

  const importance = normalizeText(item?.importance || "medium").toLowerCase();

  return {
    player: shaped.player,
    reason: shaped.reason || null,
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

function dedupeStrings(items = []) {
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
      normalizeText(item.url).toLowerCase(),
      normalizeText(item.label).toLowerCase(),
      normalizeText(item.publisher).toLowerCase()
    ].join("__");

    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function isAcceptedRow(row = {}) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return false;

  if (row.accepted === true) return true;
  if (row.canonicalAccepted === true) return true;
  if (row.acceptance?.accepted === true) return true;
  if (row.decision?.accepted === true) return true;

  const status = normalizeText(
    row.status ||
    row.acceptance?.status ||
    row.decision?.status ||
    row.resolution
  ).toLowerCase();

  return status === "accepted";
}

function normalizeInputRow(row = {}) {
  const team = normalizeText(row?.team);
  if (!team) return null;

  const absences = dedupeAbsences(row?.absences || []);
  const notes = dedupeNotes(row?.notes || []);
  const evidence = dedupeEvidence(row?.evidence || []);
  const aliases = dedupeStrings(row?.aliases || []);
  const matchIds = dedupeStrings(row?.matchIds || []);

  return {
    team,
    leagueSlug: normalizeText(row?.leagueSlug) || null,
    matchIds,
    aliases,
    absences,
    notes,
    evidence,
    source: normalizeText(row?.source) || "batch-import",
    sourceMeta: {
      ...normalizeObject(row?.sourceMeta),
      strictAbsenceGuard: true
    },
    accepted: isAcceptedRow(row),
    hasEvidence:
      absences.length > 0 ||
      notes.length > 0 ||
      evidence.length > 0
  };
}

function mergeRecord(existing, incoming) {
  return {
    team: incoming.team,
    leagueSlug: incoming.leagueSlug || existing?.leagueSlug || null,
    matchIds: dedupeStrings([
      ...(existing?.matchIds || []),
      ...(incoming?.matchIds || [])
    ]),
    aliases: dedupeStrings([
      ...(existing?.aliases || []),
      ...(incoming?.aliases || []),
      incoming.team
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
    source: incoming.source || existing?.source || "batch-import",
    sourceMeta: {
      ...(existing?.sourceMeta || {}),
      ...(incoming?.sourceMeta || {}),
      canonicalAccepted: true,
      strictAbsenceGuard: true
    },
    updatedAt: new Date().toISOString()
  };
}

export async function importTeamNewsBatch(filePath) {
  if (!filePath) {
    throw new Error("missing filePath");
  }

  const absolutePath = path.resolve(filePath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`input file not found: ${absolutePath}`);
  }

  const raw = readJsonFile(absolutePath);

  if (!Array.isArray(raw)) {
    throw new Error("input json must be an array");
  }

  const imported = [];
  const skipped = [];

  for (const row of raw) {
    const normalized = normalizeInputRow(row);

    if (!normalized) {
      skipped.push({
        row,
        reason: "missing_team"
      });
      continue;
    }

    if (!normalized.accepted) {
      skipped.push({
        row,
        team: normalized.team,
        reason: "not_accepted"
      });
      continue;
    }

    if (!normalized.hasEvidence) {
      skipped.push({
        row,
        team: normalized.team,
        reason: "empty_evidence"
      });
      continue;
    }

    const existing = readTeamNewsRecord(normalized.team);
    const merged = mergeRecord(existing, normalized);

    writeTeamNewsRecord(merged);

    const saved = readTeamNewsRecord(normalized.team);

    imported.push({
      team: saved?.team || normalized.team,
      leagueSlug: saved?.leagueSlug || normalized.leagueSlug || null,
      source: saved?.source || normalized.source,
      absencesCount: Array.isArray(saved?.absences) ? saved.absences.length : 0,
      notesCount: Array.isArray(saved?.notes) ? saved.notes.length : 0,
      evidenceCount: Array.isArray(saved?.evidence) ? saved.evidence.length : 0,
      hadExisting: !!existing
    });
  }

  return {
    ok: true,
    filePath: absolutePath,
    total: raw.length,
    importedCount: imported.length,
    skippedCount: skipped.length,
    imported,
    skipped
  };
}

const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const filePath = process.argv[2];

  console.log("[import-team-news-batch] cli:start", {
    argv: process.argv.slice(2),
    filePath
  });

  importTeamNewsBatch(filePath)
    .then(result => {
      console.log("[import-team-news-batch] cli:done", result);
    })
    .catch(err => {
      console.error("[import-team-news-batch] cli:fatal", err);
      process.exit(1);
    });
}
