import { readOfficiatingSnapshot } from "../storage/officiating-db.js";
import {
  normalizeRefereeKey,
  readRefereeProfile
} from "../storage/referee-profiles-db.js";

function safeNum(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeName(value) {
  return String(value || "").trim();
}

function pickRefereeFromOfficials(officials = []) {
  for (const item of Array.isArray(officials) ? officials : []) {
    const role = String(item?.role || item?.type || item?.designation || "")
      .trim()
      .toLowerCase();

    const name = normalizeName(
      item?.name ||
      item?.displayName ||
      item?.fullName
    );

    if (!name) continue;

    if (!role) {
      return {
        name,
        role: null,
        raw: item
      };
    }

    if (
      role.includes("ref") ||
      role.includes("official") ||
      role.includes("main")
    ) {
      return {
        name,
        role,
        raw: item
      };
    }
  }

  return null;
}

function loadLocalOfficiatingSnapshot(match) {
  const matchId = String(match?.matchId || "").trim();
  if (!matchId) return null;
  return readOfficiatingSnapshot(matchId);
}

function extractRefereeIdentity(match, officiatingSnapshot = null) {
  const snapshotPayload = officiatingSnapshot?.payload || {};

  const localOfficial = pickRefereeFromOfficials(
    officiatingSnapshot?.officials ||
    officiatingSnapshot?.matchOfficials ||
    snapshotPayload?.officials ||
    []
  );

  const sourceEspnOfficial = pickRefereeFromOfficials(
    match?.sources?.espn?.officials || []
  );

  const directName =
    normalizeName(officiatingSnapshot?.referee?.name) ||
    normalizeName(snapshotPayload?.referee?.name) ||
    normalizeName(officiatingSnapshot?.refereeName) ||
    normalizeName(snapshotPayload?.refereeName) ||
    normalizeName(localOfficial?.name) ||
    normalizeName(match?.referee) ||
    normalizeName(match?.sources?.espn?.referee) ||
    normalizeName(sourceEspnOfficial?.name) ||
    null;

  if (!directName) return null;

  return {
    name: directName,
    role:
      officiatingSnapshot?.referee?.role ||
      snapshotPayload?.referee?.role ||
      localOfficial?.role ||
      sourceEspnOfficial?.role ||
      "referee",
    source: officiatingSnapshot ? "local-officiating" : "match-facts"
  };
}

function classifyStyle({ avgCards, avgPenalties, avgFouls }) {
  const cards = safeNum(avgCards, null);
  const pens = safeNum(avgPenalties, null);
  const fouls = safeNum(avgFouls, null);

  if (cards == null && pens == null && fouls == null) return "unknown";

  if ((cards != null && cards >= 5.5) || (pens != null && pens >= 0.35)) {
    return "strict";
  }

  if ((cards != null && cards <= 3.2) && (fouls == null || fouls <= 22)) {
    return "lenient";
  }

  return "balanced";
}

function buildSignals(style, stats) {
  const signals = [];
  const cards = safeNum(stats?.avgCards, null);
  const pens = safeNum(stats?.avgPenalties, null);

  if (style === "strict") signals.push("high_cards_ref");
  if (style === "lenient") signals.push("low_cards_ref");

  if (pens != null && pens >= 0.35) signals.push("penalty_active_ref");
  if (cards != null && cards >= 6) signals.push("very_high_cards_ref");

  return signals;
}

export function buildRefereeContext(match) {
  const officiatingSnapshot = loadLocalOfficiatingSnapshot(match);
  const identity = extractRefereeIdentity(match, officiatingSnapshot);

  if (!identity?.name) {
    return {
      key: "referee_profile",
      status: "empty",
      data: null,
      confidence: 0,
      source: "local-officiating",
      reason: "missing_local_referee_identity"
    };
  }

  const refKey = normalizeRefereeKey(identity.name);
  if (!refKey) {
    return {
      key: "referee_profile",
      status: "empty",
      data: null,
      confidence: 0,
      source: "local-officiating",
      reason: "invalid_local_referee_key"
    };
  }

  const cached = readRefereeProfile(refKey);

  if (!cached) {
    return {
      key: "referee_profile",
      status: "partial",
      data: {
        name: identity.name,
        role: identity.role || "referee",
        stats: null,
        style: "unknown",
        signals: [],
        officiatingSnapshotAvailable: !!officiatingSnapshot
      },
      confidence: officiatingSnapshot ? 0.42 : 0.25,
      source: officiatingSnapshot ? "local-officiating" : "local-match-facts",
      reason: "missing_local_referee_stats"
    };
  }

  const stats = {
    avgCards: safeNum(cached?.avgCards, null),
    avgPenalties: safeNum(cached?.avgPenalties, null),
    avgFouls: safeNum(cached?.avgFouls, null),
    sampleSize: safeNum(cached?.sampleSize, null)
  };

  const style = cached?.style || classifyStyle(stats);
  const signals = buildSignals(style, stats);

  return {
    key: "referee_profile",
    status: "ready",
    data: {
      name: cached?.name || identity.name,
      role: cached?.role || identity.role || "referee",
      stats,
      style,
      signals,
      officiatingSnapshotAvailable: !!officiatingSnapshot
    },
    confidence: stats.sampleSize >= 20 ? 0.82 : stats.sampleSize >= 8 ? 0.65 : 0.45,
    source: "local-referees"
  };
}