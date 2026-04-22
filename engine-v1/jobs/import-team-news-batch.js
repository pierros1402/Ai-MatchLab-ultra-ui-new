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
    sourceMeta: normalizeObject(row?.sourceMeta),
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
      ...(incoming?.sourceMeta || {})
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