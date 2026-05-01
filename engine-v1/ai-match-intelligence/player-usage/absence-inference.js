import { buildStarterIntelligence } from "./starter-intelligence.js";

function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanName(value) {
  const name = String(value || "").trim();
  const norm = normalizeName(name);

  if (!name) return null;
  if (norm === "evidence") return null;
  if (norm === "source" || norm === "sources") return null;
  if (/https?:\/\//i.test(name)) return null;
  if (/www\./i.test(name)) return null;
  if (name.length < 3) return null;

  return name;
}

function toFiniteNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function extractConfirmedAbsences(teamNews = {}) {
  const list = [];

  const sources = [
    teamNews?.absences,
    teamNews?.confirmedAbsences,
    teamNews?.injuries,
    teamNews?.suspensions
  ];

  for (const src of sources) {
    if (!Array.isArray(src)) continue;

    for (const row of src) {
      const rawName =
        row?.player ||
        row?.name ||
        row?.playerName ||
        row?.displayName;

      const name = cleanName(rawName);
      if (!name) continue;

      const reason = String(row?.reason || row?.type || row?.status || "confirmed_absence").trim();

      list.push({
        name,
        norm: normalizeName(name),
        reason: reason || "confirmed_absence",
        source: row?.source || null
      });
    }
  }

  const byName = new Map();
  for (const row of list) {
    if (!row.norm) continue;
    if (!byName.has(row.norm)) byName.set(row.norm, row);
  }

  return Array.from(byName.values()).map(({ norm, ...row }) => row);
}

function buildUsageStatus({ playerUsage, sampleMatches, confidence }) {
  const canonicalStatus = String(playerUsage?.meta?.status || "").trim();
  const hasUsage = Boolean(playerUsage) && sampleMatches > 0;

  if (!hasUsage) {
    return {
      status: "unavailable",
      reason: "player_usage_missing_or_empty"
    };
  }

  if (canonicalStatus === "valid_usage" && confidence >= 0.7 && sampleMatches >= 2) {
    return {
      status: "ready",
      reason: "validated_player_usage_available"
    };
  }

  return {
    status: "partial",
    reason: "player_usage_sample_or_confidence_limited"
  };
}

export function inferAbsencesFromUsage({
  playerUsage,
  teamNews,
  context = {}
}) {
  const usageContext = context && typeof context === "object" ? context : {};
  const starterIntel = buildStarterIntelligence(playerUsage || {});

  const expectedStarters = Array.isArray(starterIntel?.expectedStarters)
    ? starterIntel.expectedStarters
    : [];

  const sampleMatches = toFiniteNumber(starterIntel?.matchSampleSize, 0);
  const confidence = toFiniteNumber(playerUsage?.confidence, 0);
  const usageStatus = buildUsageStatus({ playerUsage, sampleMatches, confidence });

  const confirmedAbsences = extractConfirmedAbsences(teamNews || {});
  const expectedSet = new Set(expectedStarters.map(normalizeName).filter(Boolean));

  // Strict rule: do not invent absences from player usage alone.
  // We only flag inferred risk when a confirmed named absence overlaps with a usual starter.
  const inferredAbsences = confirmedAbsences
    .filter(row => expectedSet.has(normalizeName(row.name)))
    .map(row => ({
      name: row.name,
      type: "confirmed_absent_expected_starter",
      reason: row.reason || "confirmed_absence",
      confidence: Math.min(0.95, Math.max(0.5, confidence || 0.5)),
      source: row.source || null
    }));

  return {
    team: playerUsage?.team || usageContext.team || null,
    leagueSlug: playerUsage?.leagueSlug || usageContext.leagueSlug || null,
    leagueName: playerUsage?.leagueName || usageContext.leagueName || null,
    competitionType: usageContext.competitionType || null,
    status: usageStatus.status,
    reason: usageStatus.reason,
    confidence,
    sampleMatches,
    expectedStarters,
    confirmedAbsences,
    inferredAbsences,
    meta: {
      sampleMatches,
      canonicalStatus: playerUsage?.meta?.status || null,
      validationReason: playerUsage?.meta?.validationReason || null,
      method: "validated_usage_plus_confirmed_team_news",
      starterFrequency: starterIntel?.starterFrequency || {},
      noFakeAbsenceRule: true
    }
  };
}
