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

function normalizeAbsence(item = {}) {
  const player = normalizeText(
    item?.player ||
    item?.name ||
    item?.fullName
  );

  const reason = normalizeText(
    item?.reason ||
    item?.status ||
    item?.description ||
    item?.note
  );

  if (!player && !reason) return null;

  return {
    player: player || null,
    reason: reason || null,
    importance: normalizeImportance(item?.importance)
  };
}

function dedupeAbsences(items = []) {
  const out = [];
  const seen = new Set();

  for (const item of items) {
    const player = normalizeText(item?.player).toLowerCase();
    const reason = normalizeText(item?.reason).toLowerCase();
    const importance = normalizeImportance(item?.importance);
    const key = `${player}__${reason}__${importance}`;

    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      player: item?.player || null,
      reason: item?.reason || null,
      importance
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
    absences: normalizeAbsences(input?.absences || []),
    notes: normalizeNotes(input?.notes || []),
    source: normalizeText(input?.source) || "local-team-news",
    updatedAt: input?.updatedAt || new Date().toISOString()
  };
}

export function readTeamNewsRecord(teamNameOrKey) {
  const filePath = getTeamNewsPath(teamNameOrKey);
  if (!filePath) return null;

  const raw = readJsonSafe(filePath, null);
  if (!raw) return null;

  try {
    return normalizeTeamNewsRecord(raw);
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

  writeJson(filePath, normalized);

  return {
    ok: true,
    filePath,
    record: normalized
  };
}

export { normalizeTeamKey };