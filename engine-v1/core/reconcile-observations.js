// ============================================================
// RECONCILE OBSERVATIONS – Phase 2B
// - Multi-source ready
// - Deterministic reconciliation
// - Canonical fixture output
// - Disagreement logging
// ============================================================

import {
  collectDisagreements,
  persistDisagreements
} from "./disagreement-log.js";

const SOURCE_PROFILE = {
  espn: {
    priority: 100,
    kickoffReliability: 0.92,
    teamsReliability: 0.95,
    statusReliability: 0.90,
    scoreReliability: 0.90
  },

  unknown: {
    priority: 10,
    kickoffReliability: 0.50,
    teamsReliability: 0.50,
    statusReliability: 0.50,
    scoreReliability: 0.50
  }
};

const TERMINAL_STATUSES = [
  "STATUS_FINAL",
  "STATUS_FULL_TIME",
  "STATUS_AET",
  "STATUS_PEN"
];

const LIVE_STATUSES = [
  "STATUS_IN_PROGRESS",
  "STATUS_FIRST_HALF",
  "STATUS_SECOND_HALF",
  "STATUS_HALF_TIME",
  "LIVE"
];

function sourceProfile(source) {
  return SOURCE_PROFILE[source] || SOURCE_PROFILE.unknown;
}

function byNewest(a, b) {
  return Number(b?.ts || 0) - Number(a?.ts || 0);
}

function isTerminal(status) {
  const s = String(status || "").toUpperCase();

  return (
    TERMINAL_STATUSES.includes(s) ||
    s.includes("FINAL") ||
    s.includes("FULL_TIME") ||
    s.includes("AET") ||
    s.includes("PEN")
  );
}

function isLive(status) {
  const s = String(status || "").toUpperCase();

  return (
    LIVE_STATUSES.includes(s) ||
    s.includes("IN_PROGRESS") ||
    s.includes("FIRST_HALF") ||
    s.includes("SECOND_HALF") ||
    s.includes("HALF_TIME") ||
    s === "LIVE"
  );
}

function isPre(status) {
  return !isLive(status) && !isTerminal(status);
}

function safeNum(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseMinute(v) {
  if (v == null) return 0;
  if (typeof v === "number") return v;

  const m = String(v).match(/\d+/);
  return m ? Number(m[0]) : 0;
}

function pickBest(observations, field, reliabilityField) {
  const ranked = [...observations].sort((a, b) => {
    const pa = sourceProfile(a.source);
    const pb = sourceProfile(b.source);

    const ra = pa[reliabilityField] ?? pa.priority ?? 0;
    const rb = pb[reliabilityField] ?? pb.priority ?? 0;

    if (rb !== ra) return rb - ra;
    return byNewest(a, b);
  });

  for (const row of ranked) {
    if (row[field] != null && row[field] !== "") {
      return {
        value: row[field],
        source: row.source || "unknown"
      };
    }
  }

  return {
    value: null,
    source: null
  };
}

function pickStatus(observations, existing) {
  const ranked = [...observations].sort((a, b) => {
    const pa = sourceProfile(a.source);
    const pb = sourceProfile(b.source);

    const aScore =
      (isTerminal(a.status) ? 1000 : isLive(a.status) ? 500 : 100) +
      (pa.statusReliability || 0) * 100 +
      Number(a.ts || 0) / 1e13;

    const bScore =
      (isTerminal(b.status) ? 1000 : isLive(b.status) ? 500 : 100) +
      (pb.statusReliability || 0) * 100 +
      Number(b.ts || 0) / 1e13;

    return bScore - aScore;
  });

  const best = ranked[0];

  let value = best?.status ?? existing?.status ?? "STATUS_SCHEDULED";
  let source = best?.source || null;

  if (existing?.status && isTerminal(existing.status)) {
    const terminalObs = ranked.find(x => isTerminal(x.status));

    if (terminalObs) {
      value = terminalObs.status;
      source = terminalObs.source || null;
    } else {
      value = existing.status;
      source = "existing";
    }
  }

  return { value, source };
}

function pickScore(observations, existing, chosenStatus) {
  const eligible = observations.filter(x => {
    if (isPre(chosenStatus)) return true;
    return x.scoreHome != null && x.scoreAway != null;
  });

  const ranked = [...eligible].sort((a, b) => {
    const pa = sourceProfile(a.source);
    const pb = sourceProfile(b.source);

    const ra = pa.scoreReliability || 0;
    const rb = pb.scoreReliability || 0;

    if (rb !== ra) return rb - ra;
    return byNewest(a, b);
  });

  const top = ranked[0];

  let scoreHome =
    top?.scoreHome != null ? safeNum(top.scoreHome, 0) : existing?.scoreHome ?? 0;

  let scoreAway =
    top?.scoreAway != null ? safeNum(top.scoreAway, 0) : existing?.scoreAway ?? 0;

  let source = top?.source || null;

  // ------------------------------------------------------------
  // TERMINAL SCORE PROTECTION
  // If existing is already terminal and chosen status is terminal,
  // do not allow rollback to a different terminal score.
  // ------------------------------------------------------------
  if (existing && isTerminal(existing.status) && isTerminal(chosenStatus)) {
    const prevHome = safeNum(existing.scoreHome, 0);
    const prevAway = safeNum(existing.scoreAway, 0);

    const nextHome = safeNum(scoreHome, 0);
    const nextAway = safeNum(scoreAway, 0);

    if (prevHome !== nextHome || prevAway !== nextAway) {
      scoreHome = prevHome;
      scoreAway = prevAway;
      source = "existing";
    }
  }

  return { scoreHome, scoreAway, source };
}

function pickMinute(observations, existing, chosenStatus) {
  if (isPre(chosenStatus) || isTerminal(chosenStatus)) {
    return {
      value: isTerminal(chosenStatus) ? "FT" : null,
      source: null
    };
  }

  const ranked = observations
    .filter(x => isLive(x.status))
    .sort((a, b) => {
      const am = parseMinute(a.minute);
      const bm = parseMinute(b.minute);
      if (bm !== am) return bm - am;

      const pa = sourceProfile(a.source);
      const pb = sourceProfile(b.source);

      if ((pb.statusReliability || 0) !== (pa.statusReliability || 0)) {
        return (pb.statusReliability || 0) - (pa.statusReliability || 0);
      }

      return byNewest(a, b);
    });

  const best = ranked[0];
  const existingMinute = parseMinute(existing?.minute);

  let value = best?.minute ?? existing?.minute ?? null;
  let source = best?.source || null;

  const bestMinute = parseMinute(value);

  if (existingMinute > bestMinute) {
    value = existing?.minute ?? null;
    source = "existing";
  }

  return { value, source };
}

function buildSourcesMap(observations) {
  const out = {};

  for (const row of observations) {
    const src = row.source || "unknown";
    const prev = out[src];

    if (!prev || Number(row.ts || 0) > Number(prev.observedAt || 0)) {
      out[src] = {
        observedAt: Number(row.ts || 0),
        sourceId: row.sourceId || null,
        status: row.status || null,
        scoreHome: safeNum(row.scoreHome, null),
        scoreAway: safeNum(row.scoreAway, null)
      };
    }
  }

  return out;
}

export async function reconcileObservations({
  env,
  observations,
  existing = null
}) {
  const rows = Array.isArray(observations) ? observations.filter(Boolean) : [];

  if (!rows.length) {
    return existing || null;
  }

  const sorted = [...rows].sort(byNewest);
  const newest = sorted[0];
  const matchId = newest?.matchId || existing?.matchId || "";

  const kickoff = pickBest(rows, "kickoffUtc", "kickoffReliability");
  const homeTeam = pickBest(rows, "homeTeam", "teamsReliability");
  const awayTeam = pickBest(rows, "awayTeam", "teamsReliability");
  const leagueName = pickBest(rows, "leagueName", "teamsReliability");

  const statusPick = pickStatus(rows, existing);
  const scorePick = pickScore(rows, existing, statusPick.value);
  const minutePick = pickMinute(rows, existing, statusPick.value);

  const disagreement =
    rows.length > 1 &&
    new Set(rows.map(x => `${x.status}|${x.scoreHome}|${x.scoreAway}|${x.minute}`)).size > 1;

  const resolved = {
    matchId,
    source: "reconciled",
    dayKey: newest.actualDay || newest.dayKey || existing?.dayKey || null,

    leagueSlug: newest.leagueSlug || existing?.leagueSlug || null,
    leagueName: leagueName.value || newest.leagueName || existing?.leagueName || null,

    homeTeam: homeTeam.value || newest.homeTeam || existing?.homeTeam || null,
    awayTeam: awayTeam.value || newest.awayTeam || existing?.awayTeam || null,

    kickoffUtc: kickoff.value || newest.kickoffUtc || existing?.kickoffUtc || null,

    status: statusPick.value || newest.status || existing?.status || "STATUS_SCHEDULED",
    rawStatus: newest.rawStatus || existing?.rawStatus || null,
    minute: minutePick.value,

    scoreHome: scorePick.scoreHome,
    scoreAway: scorePick.scoreAway,

    venue: newest.venue || existing?.venue || null,

    sources: buildSourcesMap(rows),

    reconcileMeta: {
      chosenKickoffSource: kickoff.source,
      chosenTeamsSource:
        homeTeam.source === awayTeam.source ? homeTeam.source : "mixed",
      chosenStatusSource: statusPick.source,
      chosenScoreSource: scorePick.source,
      chosenMinuteSource: minutePick.source,
      disagreement,
      observationsCount: rows.length,
      updatedAt: Date.now()
    }
  };

  const disagreementEntries = collectDisagreements(matchId, rows, resolved);

  if (disagreementEntries.length) {
    await persistDisagreements(env, disagreementEntries);
  }

  return resolved;
}