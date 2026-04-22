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

function normalizeOfficial(item = {}) {
  const name = normalizeText(
    item?.name ||
    item?.displayName ||
    item?.fullName
  );

  const role = normalizeText(
    item?.role ||
    item?.type ||
    item?.designation
  ).toLowerCase();

  if (!name) return null;

  return {
    name,
    role: role || null
  };
}

function normalizeOfficials(items = []) {
  return (Array.isArray(items) ? items : [])
    .map(normalizeOfficial)
    .filter(Boolean);
}

function normalizeReferee(referee = null, officials = []) {
  const directName = normalizeText(
    referee?.name ||
    referee?.displayName ||
    referee?.fullName ||
    referee
  );

  const directRole = normalizeText(
    referee?.role ||
    referee?.type ||
    referee?.designation
  ).toLowerCase();

  if (directName) {
    return {
      name: directName,
      role: directRole || "referee"
    };
  }

  for (const item of officials) {
    const role = String(item?.role || "").toLowerCase();
    if (!item?.name) continue;

    if (!role || role.includes("ref") || role.includes("official") || role.includes("main")) {
      return {
        name: item.name,
        role: item.role || "referee"
      };
    }
  }

  return null;
}

export function getOfficiatingSnapshotPath(matchId) {
  const key = String(matchId || "").trim();
  if (!key) return null;
  return resolveDataPath("officiating", "by-match", `${key}.json`);
}

export function readOfficiatingSnapshot(matchId) {
  const filePath = getOfficiatingSnapshotPath(matchId);
  if (!filePath) return null;
  return readJsonSafe(filePath, null);
}

export function buildOfficiatingSnapshot(match, input = {}) {
  const matchId = String(match?.matchId || input?.matchId || "").trim();
  if (!matchId) {
    throw new Error("buildOfficiatingSnapshot: missing matchId");
  }

  const officials = normalizeOfficials(
    input?.officials ||
    input?.matchOfficials ||
    match?.officials ||
    match?.sources?.espn?.officials ||
    match?.sources?.source2?.officials ||
    []
  );

  const referee = normalizeReferee(
    input?.referee ||
    input?.refereeName ||
    match?.referee ||
    match?.sources?.espn?.referee ||
    match?.sources?.source2?.referee ||
    null,
    officials
  );

  return {
    matchId,
    dayKey: input?.dayKey || match?.dayKey || null,
    leagueSlug: input?.leagueSlug || match?.leagueSlug || null,
    kickoffUtc: input?.kickoffUtc || match?.kickoffUtc || null,
    homeTeam: input?.homeTeam || match?.homeTeam || null,
    awayTeam: input?.awayTeam || match?.awayTeam || null,

    referee,
    officials,

    source: normalizeText(input?.source) || "local-officiating",
    confidence: Number.isFinite(Number(input?.confidence)) ? Number(input.confidence) : 0.5,

    collectedAt: input?.collectedAt || new Date().toISOString(),
    notes: Array.isArray(input?.notes) ? input.notes : []
  };
}

export function writeOfficiatingSnapshot(match, input = {}) {
  const snapshot = buildOfficiatingSnapshot(match, input);
  const filePath = getOfficiatingSnapshotPath(snapshot.matchId);

  if (!filePath) {
    throw new Error("writeOfficiatingSnapshot: invalid matchId");
  }

  writeJson(filePath, snapshot);
  return {
    ok: true,
    filePath,
    snapshot
  };
}