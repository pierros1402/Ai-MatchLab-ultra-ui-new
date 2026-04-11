import fs from "fs";
import { resolveDataPath } from "../storage/data-root.js";

function readJsonSafe(filePath, fallback = null) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function normalizeTeamKey(name) {
  return String(name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function impactScore(absences = []) {
  if (!absences.length) return 0;

  let score = 0;

  for (const p of absences) {
    if (p.importance === "high") score += 0.4;
    else if (p.importance === "medium") score += 0.25;
    else score += 0.1;
  }

  return Math.min(score, 1);
}

function classifyImpact(score) {
  if (score >= 0.7) return "severe";
  if (score >= 0.4) return "moderate";
  if (score > 0) return "minor";
  return "none";
}

export function buildTeamNewsContext(match) {
  const homeKey = normalizeTeamKey(match?.homeTeam);
  const awayKey = normalizeTeamKey(match?.awayTeam);

  const homeFile = resolveDataPath("team-news", `${homeKey}.json`);
  const awayFile = resolveDataPath("team-news", `${awayKey}.json`);

  const homeData = readJsonSafe(homeFile, null);
  const awayData = readJsonSafe(awayFile, null);

  if (!homeData && !awayData) {
    return {
      key: "team_news",
      status: "empty",
      data: null,
      confidence: 0
    };
  }

  const homeAbs = homeData?.absences || [];
  const awayAbs = awayData?.absences || [];

  const homeImpact = impactScore(homeAbs);
  const awayImpact = impactScore(awayAbs);

  const homeLevel = classifyImpact(homeImpact);
  const awayLevel = classifyImpact(awayImpact);

  const notes = [];

  if (homeLevel === "severe") {
    notes.push(`${match.homeTeam} σημαντικές απουσίες`);
  }

  if (awayLevel === "severe") {
    notes.push(`${match.awayTeam} σημαντικές απουσίες`);
  }

  return {
    key: "team_news",
    status: "ready",
    data: {
      home: {
        absences: homeAbs,
        impactScore: homeImpact,
        impactLevel: homeLevel
      },
      away: {
        absences: awayAbs,
        impactScore: awayImpact,
        impactLevel: awayLevel
      },
      notes
    },
    confidence:
      (homeAbs.length + awayAbs.length) > 5 ? 0.8 :
      (homeAbs.length + awayAbs.length) > 0 ? 0.6 : 0.3
  };
}