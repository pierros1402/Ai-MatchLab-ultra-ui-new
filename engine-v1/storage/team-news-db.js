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

  if (!player && !reason) return null;

  return {
    player: player || null,
    reason: reason || null,
    importance: normalizeImportance(item?.importance),
    team: team || null,
    sourceTeam: sourceTeam || null
  };
}

function dedupeAbsences(items = []) {
  const out = [];
  const seen = new Set();

  for (const item of items) {
    const player = normalizeText(item?.player).toLowerCase();
    const reason = normalizeText(item?.reason).toLowerCase();
    const importance = normalizeImportance(item?.importance);
    const team = normalizeText(item?.team);
    const sourceTeam = normalizeText(item?.sourceTeam);
    const key = `${player}__${reason}__${importance}__${team.toLowerCase()}__${sourceTeam.toLowerCase()}`;

    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      player: item?.player || null,
      reason: item?.reason || null,
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
    generatedAt: normalizeText(input?.generatedAt || input?.executedAt) || null
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
      ? normalized.absences.slice(0, 30).map(row => ({
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
    sourceMeta: compactSourceMeta(normalized.sourceMeta),
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