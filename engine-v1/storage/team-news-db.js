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

function normalizeMetaObject(input = {}) {
  return input && typeof input === "object" && !Array.isArray(input)
    ? input
    : {};
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
    sourceMeta: normalizeMetaObject(input?.sourceMeta),
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

  writeJson(filePath, normalized);

  return {
    ok: true,
    filePath,
    record: normalized
  };
}

export { normalizeTeamKey };