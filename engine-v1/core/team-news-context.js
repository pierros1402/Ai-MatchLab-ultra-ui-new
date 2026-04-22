import {
  readTeamNewsRecord
} from "../storage/team-news-db.js";
import { resolveAliasCandidates } from "../storage/team-aliases-db.js";

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

function dedupeText(items = []) {
  const out = [];
  const seen = new Set();

  for (const raw of Array.isArray(items) ? items : []) {
    const text = String(raw || "").trim();
    if (!text) continue;

    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }

  return out;
}

function resolveLeagueSlug(match = {}) {
  return (
    match?.leagueSlug ||
    match?.league?.slug ||
    match?.competition?.slug ||
    null
  );
}

function readTeamNewsWithAliases(leagueSlug, teamName) {
  const candidates = resolveAliasCandidates(leagueSlug, teamName);
  const tried = [];

  for (const candidate of candidates) {
    tried.push(candidate);
    const record = readTeamNewsRecord(candidate);
    if (record) {
      return {
        record,
        matchedOn: candidate,
        candidates: tried
      };
    }
  }

  return {
    record: null,
    matchedOn: null,
    candidates: tried
  };
}

function buildSide(teamName, resolved) {
  const record = resolved?.record || null;
  const absences = record?.absences || [];
  const recordNotes = record?.notes || [];
  const impact = impactScore(absences);
  const impactLevel = classifyImpact(impact);

  const notes = dedupeText([
    ...recordNotes,
    ...absences.map(x => {
      const player = String(x?.player || "").trim();
      const reason = String(x?.reason || "").trim();

      if (player && reason) return `${player}: ${reason}`;
      if (player) return player;
      if (reason) return reason;
      return null;
    })
  ]);

  return {
    team: teamName || null,
    matchedOn: resolved?.matchedOn || null,
    lookupCandidates: resolved?.candidates || [],
    absences,
    notes,
    impactScore: impact,
    impactLevel,
    source: record?.source || "local-team-news",
    updatedAt: record?.updatedAt || null
  };
}

export function buildTeamNewsContext(match) {
  const leagueSlug = resolveLeagueSlug(match);

  const homeResolved = readTeamNewsWithAliases(leagueSlug, match?.homeTeam);
  const awayResolved = readTeamNewsWithAliases(leagueSlug, match?.awayTeam);

  const homeData = buildSide(match?.homeTeam, homeResolved);
  const awayData = buildSide(match?.awayTeam, awayResolved);

  const hasHome = !!homeResolved?.record;
  const hasAway = !!awayResolved?.record;

  if (!hasHome && !hasAway) {
    return {
      key: "team_news",
      status: "empty",
      data: null,
      confidence: 0,
      source: "local-team-news",
      reason: "missing_local_team_news"
    };
  }

  const totalAbsences =
    homeData.absences.length + awayData.absences.length;

  const summaryNotes = [];
  const homeNotes = Array.isArray(homeData?.notes) ? homeData.notes : [];
  const awayNotes = Array.isArray(awayData?.notes) ? awayData.notes : [];
  const homeCount = homeNotes.length;
  const awayCount = awayNotes.length;
  const evidenceCount = homeCount + awayCount;
  const bothSides = homeCount > 0 && awayCount > 0;

  const reliability =
    evidenceCount <= 0
      ? "empty"
      : (evidenceCount >= 2 || bothSides)
        ? "usable"
        : "thin";

  if (homeData.impactLevel === "severe") {
    summaryNotes.push(`${match?.homeTeam} σημαντικές απουσίες`);
  }

  if (awayData.impactLevel === "severe") {
    summaryNotes.push(`${match?.awayTeam} σημαντικές απουσίες`);
  }

  return {
    key: "team_news",
    status: "ready",
    data: {
      home: homeData,
      away: awayData,

      homeTeam: {
        notes: homeData.notes
      },
      awayTeam: {
        notes: awayData.notes
      },

      notes: dedupeText(summaryNotes),
      reliability,
      evidenceCount,
      homeCount,
      awayCount,
      bothSides
    },
    confidence:
      totalAbsences > 5 ? 0.8 :
      totalAbsences > 0 ? 0.6 : 0.3,
    source: "local-team-news",
    reliability,
    reason: null
  };
}