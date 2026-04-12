// ============================================================
// RECONCILE OBSERVATIONS – Phase 2B+
// - Multi-source ready
// - Deterministic reconciliation
// - Canonical fixture output
// - Disagreement logging
// - Confidence scoring
// - Independent operational state layer
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

  source2: {
    priority: 90,
    kickoffReliability: 0.88,
    teamsReliability: 0.88,
    statusReliability: 0.86,
    scoreReliability: 0.86
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
  "FT"
];

const LIVE_STATUSES = [
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

function isSpecialStatus(rawStatus, status) {
  const s1 = String(status || "").toUpperCase();
  const s2 = String(rawStatus || "").toUpperCase();

  return (
    s1 === "SPECIAL" ||
    s1.includes("POSTPONED") ||
    s1.includes("CANCELED") ||
    s1.includes("ABANDONED") ||
    s2.includes("POSTPONED") ||
    s2.includes("CANCELED") ||
    s2.includes("ABANDONED")
  );
}

function safeNum(v, fallback = null) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseMinute(v) {
  if (v == null) return null;
  if (typeof v === "number") return { base: v, extra: 0 };

  const s = String(v).trim();
  const m = s.match(/^(\d+)(?:\+(\d+))?/);
  if (!m) return null;

  const base = Number(m[1] || 0);
  const extra = Number(m[2] || 0);

  if (!Number.isFinite(base) || !Number.isFinite(extra)) return null;

  return { base, extra };
}

function clamp01(n) {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
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

  let value = best?.status ?? existing?.status ?? "PRE";
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

  function isSecondHalfStatus(status) {
    const s = String(status || "").toUpperCase();
    return (
      s.includes("SECOND_HALF") ||
      s.includes("SECOND") ||
      s.includes("2ND")
    );
  }

  function isHalfTimeStatus(status) {
    const s = String(status || "").toUpperCase();
    return (
      s.includes("HALF_TIME") ||
      s.includes("HALFTIME") ||
      s === "HT"
    );
  }

  function comparableMinute(parsed, status) {
    if (!parsed) return null;

    const second = isSecondHalfStatus(status);
    const half = isHalfTimeStatus(status);

    if (second) {
      if (parsed.base >= 46) return parsed.base;
      if (parsed.base === 45 && parsed.extra > 0) return 46;
      return Math.max(46, parsed.base);
    }

    if (half) {
      return 45.999;
    }

    return parsed.base + (parsed.extra / 1000);
  }

  const ranked = observations
    .filter(x => isLive(x.status))
    .sort((a, b) => {
      const aParsed = parseMinute(a.minute);
      const bParsed = parseMinute(b.minute);

      const aCmp = comparableMinute(aParsed, a.status);
      const bCmp = comparableMinute(bParsed, b.status);

      if (aCmp != null && bCmp != null && bCmp !== aCmp) {
        return bCmp - aCmp;
      }

      const pa = sourceProfile(a.source);
      const pb = sourceProfile(b.source);

      if ((pb.statusReliability || 0) !== (pa.statusReliability || 0)) {
        return (pb.statusReliability || 0) - (pa.statusReliability || 0);
      }

      return byNewest(a, b);
    });

  const best = ranked[0];

  const bestParsed = parseMinute(best?.minute);
  const existingParsed = parseMinute(existing?.minute);

  const bestCmp = comparableMinute(bestParsed, best?.status);
  const existingCmp = comparableMinute(existingParsed, existing?.status);

  let value = existing?.minute ?? null;
  let source = existing?.source ?? null;

  if (value == null || value === "") {
    if (best?.minute != null && best?.minute !== "") {
      return {
        value: best.minute,
        source: best.source || null
      };
    }

    if (isSecondHalfStatus(best?.status)) {
      return {
        value: "46",
        source: best?.source || null
      };
    }

    return { value, source };
  }

  if (
    bestCmp != null &&
    (existingCmp == null || bestCmp > existingCmp)
  ) {
    if (best?.minute != null && best?.minute !== "") {
      return {
        value: best.minute,
        source: best.source || null
      };
    }

    if (isSecondHalfStatus(best?.status)) {
      return {
        value: "46",
        source: best?.source || null
      };
    }
  }

  if (
    isSecondHalfStatus(best?.status) &&
    (
      isHalfTimeStatus(existing?.status) ||
      (existingParsed && existingParsed.base === 45)
    ) &&
    (!best?.minute || String(best.minute).trim() === "")
  ) {
    return {
      value: "46",
      source: best?.source || source
    };
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

function computeConfidence({
  rows,
  statusPick,
  scorePick,
  minutePick,
  disagreement,
  chosenStatus
}) {
  const uniqueSources = [...new Set(rows.map(x => String(x?.source || "").trim()).filter(Boolean))];
  const sourceCount = uniqueSources.length;

  let score = 0.35;

  score += Math.min(sourceCount, 3) * 0.08;

  const statusReliability =
    sourceProfile(statusPick?.source).statusReliability ??
    sourceProfile(statusPick?.source).priority / 100 ??
    0.5;

  score += statusReliability * 0.20;

  if (scorePick?.source) {
    const scoreReliability =
      sourceProfile(scorePick.source).scoreReliability ??
      sourceProfile(scorePick.source).priority / 100 ??
      0.5;

    score += scoreReliability * 0.12;
  }

  if (minutePick?.source) {
    const minuteReliability =
      sourceProfile(minutePick.source).statusReliability ??
      sourceProfile(minutePick.source).priority / 100 ??
      0.5;

    score += minuteReliability * 0.10;
  }

  if (isLive(chosenStatus)) {
    if (minutePick?.value != null && String(minutePick.value).trim() !== "") {
      score += 0.06;
    }

    if (safeNum(scorePick?.scoreHome, null) !== null && safeNum(scorePick?.scoreAway, null) !== null) {
      score += 0.06;
    }
  }

  if (isTerminal(chosenStatus)) {
    score += 0.08;
  }

  if (disagreement) {
    score -= 0.15;
  } else {
    score += 0.08;
  }

  const latestTs = Math.max(...rows.map(x => Number(x?.ts || 0)), 0);
  const ageMs = latestTs ? Date.now() - latestTs : Number.POSITIVE_INFINITY;

  if (Number.isFinite(ageMs)) {
    if (ageMs <= 5 * 60 * 1000) {
      score += 0.05;
    } else if (ageMs <= 30 * 60 * 1000) {
      score += 0.02;
    } else if (ageMs > 6 * 60 * 60 * 1000) {
      score -= 0.05;
    }
  }

  const chosenSourceCount = rows.filter(x => x?.source === statusPick?.source).length;

  if (chosenSourceCount >= 2) {
    score += 0.03;
  }

  return round3(clamp01(score));
}

function resolveOperationalState({
  rows,
  existing,
  kickoffUtc,
  chosenStatus,
  chosenMinute,
  newestRawStatus
}) {
  const latestTs = Math.max(...rows.map(x => Number(x?.ts || 0)), 0);
  const now = Date.now();
  const kickoffMs = kickoffUtc ? new Date(kickoffUtc).getTime() : null;
  const minuteParsed = parseMinute(chosenMinute);

  const ageMs = latestTs ? now - latestTs : Number.POSITIVE_INFINITY;
  const elapsedMs =
    Number.isFinite(kickoffMs) && kickoffMs > 0
      ? now - kickoffMs
      : null;

  if (isSpecialStatus(newestRawStatus, chosenStatus)) {
    return {
      operationalState: "SPECIAL",
      isDisplayLive: false,
      isDisplayPre: false,
      isDisplayFinal: false,
      terminalConfidence: 1
    };
  }

  if (isTerminal(chosenStatus)) {
    return {
      operationalState: "TERMINAL_CONFIRMED",
      isDisplayLive: false,
      isDisplayPre: false,
      isDisplayFinal: true,
      terminalConfidence: 1
    };
  }

  if (isPre(chosenStatus)) {
    return {
      operationalState: "PRE",
      isDisplayLive: false,
      isDisplayPre: true,
      isDisplayFinal: false,
      terminalConfidence: 0
    };
  }

  const liveLike = isLive(chosenStatus);

  if (!liveLike) {
    return {
      operationalState: "UNKNOWN",
      isDisplayLive: false,
      isDisplayPre: false,
      isDisplayFinal: false,
      terminalConfidence: 0
    };
  }

  const nearEndMinute =
    minuteParsed &&
    (
      minuteParsed.base >= 88 ||
      (minuteParsed.base === 45 && minuteParsed.extra > 0)
    );

  const staleByObservationAge =
    Number.isFinite(ageMs) && ageMs > 75 * 60 * 1000;

  const staleByKickoffWindow =
    Number.isFinite(elapsedMs) && elapsedMs > 3.5 * 60 * 60 * 1000;

  const stronglyFinishedWindow =
    Number.isFinite(elapsedMs) && elapsedMs > 5 * 60 * 60 * 1000;

  const existingWasTerminalUnconfirmed =
    String(existing?.operationalState || "").toUpperCase() === "TERMINAL_UNCONFIRMED";

  if (
    stronglyFinishedWindow &&
    (nearEndMinute || staleByObservationAge || existingWasTerminalUnconfirmed)
  ) {
    return {
      operationalState: "TERMINAL_UNCONFIRMED",
      isDisplayLive: false,
      isDisplayPre: false,
      isDisplayFinal: false,
      terminalConfidence: 0.35
    };
  }

  if (staleByObservationAge || staleByKickoffWindow) {
    return {
      operationalState: "STALE_LIVE",
      isDisplayLive: false,
      isDisplayPre: false,
      isDisplayFinal: false,
      terminalConfidence: 0.15
    };
  }

  return {
    operationalState: "LIVE",
    isDisplayLive: true,
    isDisplayPre: false,
    isDisplayFinal: false,
    terminalConfidence: 0
  };
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

  const confidence = computeConfidence({
    rows,
    statusPick,
    scorePick,
    minutePick,
    disagreement,
    chosenStatus: statusPick.value
  });

  const kickoffUtc = kickoff.value || newest.kickoffUtc || existing?.kickoffUtc || null;

  const runtimeState = resolveOperationalState({
    rows,
    existing,
    kickoffUtc,
    chosenStatus: statusPick.value,
    chosenMinute: minutePick.value,
    newestRawStatus: newest?.rawStatus
  });

  const latestTs = Math.max(...rows.map(x => Number(x?.ts || 0)), 0);
  const now = Date.now();
  const kickoffMs = kickoffUtc ? new Date(kickoffUtc).getTime() : null;

  const ageMs = latestTs ? now - latestTs : Number.POSITIVE_INFINITY;
  const elapsedMs =
    Number.isFinite(kickoffMs) && kickoffMs > 0
      ? now - kickoffMs
      : null;

  const isStale =
    runtimeState.operationalState === "STALE_LIVE" ||
    runtimeState.operationalState === "TERMINAL_UNCONFIRMED";

  const resolved = {
    matchId,
    source: "reconciled",
    dayKey: newest.actualDay || newest.dayKey || existing?.dayKey || null,

    leagueSlug: newest.leagueSlug || existing?.leagueSlug || null,
    leagueName: leagueName.value || newest.leagueName || existing?.leagueName || null,

    homeTeam: homeTeam.value || newest.homeTeam || existing?.homeTeam || null,
    awayTeam: awayTeam.value || newest.awayTeam || existing?.awayTeam || null,

    kickoffUtc,

    status: statusPick.value || newest.status || existing?.status || "PRE",
    rawStatus: newest.rawStatus || existing?.rawStatus || null,
    minute: minutePick.value,

    scoreHome: scorePick.scoreHome,
    scoreAway: scorePick.scoreAway,

    venue: newest.venue || existing?.venue || null,

    operationalState: runtimeState.operationalState,
    isDisplayLive: runtimeState.isDisplayLive,
    isDisplayPre: runtimeState.isDisplayPre,
    isDisplayFinal: runtimeState.isDisplayFinal,
    terminalConfidence: runtimeState.terminalConfidence,

    health: {
      isStale,
      lastUpdateAgeMs: ageMs,
      elapsedSinceKickoffMs: elapsedMs,
      observationCount: rows.length
    },

    state: existing?.state === "final" ? "final" : "staging",
    finalized: existing?.state === "final" ? 1 : 0,
    updatedAt: Date.now(),

    sources: buildSourcesMap(rows),

    reconcileMeta: {
      chosenKickoffSource: kickoff.source,
      chosenTeamsSource:
        homeTeam.source === awayTeam.source ? homeTeam.source : "mixed",
      chosenStatusSource: statusPick.source,
      chosenScoreSource: scorePick.source,
      chosenMinuteSource: minutePick.source,
      disagreement,
      confidence,
      observationsCount: rows.length,
      updatedAt: Date.now()
    }
  };

  const disagreementEntries = collectDisagreements(matchId, rows, resolved);

  if (disagreementEntries.length) {
    await persistDisagreements(env, disagreementEntries, rows, resolved);
  }

  return resolved;
}