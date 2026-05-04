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

  if (norm.includes("object object")) return null;

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
    "muscle",
    "acl",
    "adductor",
    "ankle",
    "thigh",
    "knock",
    "strain",
    "sprain"
  ]);

  if (reasonOnlyTerms.has(norm)) return null;

  if (/\b(official|coverage|published|fixture|comments|confirmed|reported|announced|ahead of|pre-match|post-match|club media|press conference|training update)\b/i.test(name)) {
    return null;
  }

  return name;
}

function normalizeConfirmedAbsenceShape(rawName, rawReason = "") {
  let name = String(rawName || "").trim();
  let reason = String(rawReason || "").trim();

  if (!name) return null;

  const suspendedMatch = name.match(/^(.+?)\s+is\s+suspended\.?$/i);
  if (suspendedMatch) {
    name = suspendedMatch[1].trim();
    reason = reason || "suspension";
  }

  if (name.includes(":")) {
    const parts = name.split(":").map(v => String(v || "").trim()).filter(Boolean);

    if (parts.length >= 2) {
      const first = parts[0];
      const secondNorm = normalizeName(parts[1]);

      if (
        secondNorm === "injury" ||
        secondNorm === "suspension" ||
        secondNorm === "suspended" ||
        secondNorm === "illness" ||
        secondNorm === "fitness" ||
        secondNorm === "doubtful" ||
        secondNorm === "questionable" ||
        secondNorm.includes("injury")
      ) {
        name = first;
        reason = reason || (secondNorm === "suspended" ? "suspension" : parts[1]);
      } else {
        return null;
      }
    }
  }

  const clean = cleanName(name);
  if (!clean) return null;

  return {
    name: clean,
    reason: reason || "confirmed_absence"
  };
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
      let rawName = "";
      let rawReason = "";

      if (typeof row === "string" || typeof row === "number") {
        rawName = String(row || "").trim();
      } else if (row && typeof row === "object") {
        rawName =
          row?.player ||
          row?.name ||
          row?.playerName ||
          row?.displayName ||
          "";

        rawReason = row?.reason || row?.type || row?.status || "";
      }

      const shaped = normalizeConfirmedAbsenceShape(rawName, rawReason);
      if (!shaped) continue;

      list.push({
        name: shaped.name,
        norm: normalizeName(shaped.name),
        reason: shaped.reason || "confirmed_absence",
        source: row && typeof row === "object" ? row?.source || null : null
      });
    }
  }

  const byName = new Map();
  for (const row of list) {
    if (!row.norm) continue;

    const existing = byName.get(row.norm);
    if (!existing) {
      byName.set(row.norm, row);
      continue;
    }

    if (
      existing.reason === "confirmed_absence" &&
      row.reason &&
      row.reason !== "confirmed_absence"
    ) {
      byName.set(row.norm, row);
    }
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

  const confirmedAbsences =
    usageStatus.status === "unavailable"
      ? []
      : extractConfirmedAbsences(teamNews || {});

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
