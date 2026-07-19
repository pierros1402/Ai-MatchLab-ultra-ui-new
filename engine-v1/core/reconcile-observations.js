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
  updateSourceReliability,
  getSourceReliabilitySnapshot
} from "../storage/source-reliability.js";
import {
  collectDisagreements,
  persistDisagreements
} from "./disagreement-log.js";
import {
  resolveApprovedFlashscoreNonPlayedDecision
} from "../source-discovery/flashscore-nonplayed-decisions.js";

const SOURCE_PROFILE = {
  espn: {
    priority: 100,
    kickoffReliability: 0.92,
    teamsReliability: 0.95,
    statusReliability: 0.90,
    scoreReliability: 0.90
  },

  api_football: {
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

const SOURCE_WEIGHTS = {
  espn: 1.0,
  api_football: 0.9,
  unknown: 0.5
};

function canonicalSource(source) {
  const key = String(source || "").trim().toLowerCase();

  if (!key) return "unknown";
  if (key === "source2") return "api_football";

  return key;
}

function sourceProfile(source) {
  return SOURCE_PROFILE[canonicalSource(source)] || SOURCE_PROFILE.unknown;
}

function sourceWeightForRow(row) {
  const source = canonicalSource(row?.source);
  const base = SOURCE_WEIGHTS[source] ?? SOURCE_WEIGHTS.unknown ?? 0.5;

  const dynamicPriority = Number(row?.sourcePriority || 0);
  const dynamicWeight =
    dynamicPriority > 0
      ? Math.max(0, Math.min(1.5, dynamicPriority / 100))
      : null;

  return dynamicWeight != null ? dynamicWeight : base;
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
  if (
    v === null ||
    v === undefined ||
    v === ""
  ) {
    return fallback;
  }

  const n = Number(v);

  return Number.isFinite(n)
    ? n
    : fallback;
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

function getConfidenceBand(confidence, { hasConflict = false } = {}) {
  if (hasConflict) {
    if (confidence >= 0.55) return "MEDIUM";
    return "LOW";
  }

  if (confidence >= 0.75) return "HIGH";
  if (confidence >= 0.55) return "MEDIUM";
  return "LOW";
}

function getLearnedReliability(source, reliabilityDb = {}) {
  const key = String(source || "").trim();
  const row = reliabilityDb?.[key];

  if (!row) return null;

  const total = Number(row.total || 0);
  const agreements = Number(row.agreements || 0);

  if (total <= 0) return null;

  return agreements / total;
}

function getEffectiveReliability(source, baseReliability, reliabilityDb = {}) {
  const learned = getLearnedReliability(source, reliabilityDb);

  if (learned == null) return baseReliability ?? 0.5;

  return ((baseReliability ?? 0.5) * 0.6) + (learned * 0.4);
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
        source: canonicalSource(row.source)
      };
    }
  }

  return {
    value: null,
    source: null
  };
}

function cleanDecisionValue(value) {
  return String(
    value ?? ""
  ).trim();
}

function resolveDecisionBackedSpecialObservation(
  observations,
  existing
) {
  const rows = (
    Array.isArray(observations)
      ? observations
      : []
  )
    .filter(Boolean)
    .sort(byNewest);

  for (const row of rows) {
    if (
      !isSpecialStatus(
        row?.rawStatus,
        row?.status
      )
    ) {
      continue;
    }

    const correction =
      row?.statusCorrection;

    if (
      !correction ||
      typeof correction !== "object"
    ) {
      continue;
    }

    const canonicalId =
      cleanDecisionValue(
        row?.canonicalId ||
        row?.matchId ||
        existing?.canonicalId ||
        existing?.matchId
      );

    const dayKey =
      cleanDecisionValue(
        row?.actualDay ||
        row?.dayKey ||
        existing?.actualDay ||
        existing?.dayKey
      );

    const providerEvidence =
      correction
        ?.providerEvidence;

    const providerMatchId =
      cleanDecisionValue(
        row?.sourceId ||
        row?.sourceMatchId ||
        providerEvidence
          ?.providerMatchId
      );

    const decision =
      resolveApprovedFlashscoreNonPlayedDecision({
        dayKey,
        canonicalId,
        providerMatchId
      });

    if (!decision) {
      continue;
    }

    const expectedEvidence =
      decision
        .requiredProviderEvidence;

    const correctedTo =
      correction?.correctedTo;

    const source =
      canonicalSource(
        row?.source
      );

    const status =
      cleanDecisionValue(
        row?.status
      );

    const rawStatus =
      cleanDecisionValue(
        row?.rawStatus
      );

    const statusType =
      cleanDecisionValue(
        row?.statusType
      );

    if (
      correction?.decisionId !==
        decision.decisionId ||
      correction?.policyVersion !==
        decision.policyVersion ||
      correction?.reason !==
        "approved_flashscore_nonplayed_decision" ||
      source !==
        decision.provider ||
      status !==
        decision.resolvedStatus ||
      rawStatus !==
        decision.resolvedStatus ||
      (
        statusType &&
        statusType !==
          decision.resolvedStatus
      ) ||
      row?.scoreHome !== null ||
      row?.scoreAway !== null ||
      correctedTo?.status !==
        decision.resolvedStatus ||
      correctedTo?.rawStatus !==
        decision.resolvedStatus ||
      correctedTo?.statusType !==
        decision.resolvedStatus ||
      correctedTo?.scoreHome !==
        null ||
      correctedTo?.scoreAway !==
        null ||
      cleanDecisionValue(
        providerEvidence?.provider
      ) !==
        decision.provider ||
      cleanDecisionValue(
        providerEvidence
          ?.providerMatchId
      ) !==
        decision.providerMatchId ||
      cleanDecisionValue(
        providerEvidence
          ?.statusCode
      ) !==
        expectedEvidence.statusCode ||
      cleanDecisionValue(
        providerEvidence
          ?.statusDetailCode
      ) !==
        expectedEvidence
          .statusDetailCode ||
      providerEvidence
        ?.nonPlayedTerminal !==
        true ||
      providerEvidence
        ?.playedFinal ===
        true ||
      providerEvidence
        ?.scoreHome !==
        null ||
      providerEvidence
        ?.scoreAway !==
        null
    ) {
      continue;
    }

    return {
      row,
      decision
    };
  }

  return null;
}

function pickStatusWeighted(observations, existing, reliabilityDb = {}) {
  const latestPerSource = new Map();

  for (const row of observations) {
    const source = canonicalSource(row?.source);
    const prev = latestPerSource.get(source);

    if (!prev || Number(row?.ts || 0) > Number(prev?.ts || 0)) {
      latestPerSource.set(source, row);
    }
  }

  let best = null;
  let bestScore = -Infinity;

  for (const row of latestPerSource.values()) {
    const source = canonicalSource(row?.source);
    const profile = sourceProfile(source);
    const sourceWeight = sourceWeightForRow(row);
    const freshness = Number(row?.ts || 0) / 1e13;

    const terminalBonus = isTerminal(row?.status) ? 1000 : 0;
    const liveBonus = isLive(row?.status) ? 500 : 100;

    const effectiveStatusReliability = getEffectiveReliability(
      source,
      profile.statusReliability ?? 0.5,
      reliabilityDb
    );

    const rankScore =
      sourceWeight * 1000 +
      effectiveStatusReliability * 100 +
      terminalBonus +
      liveBonus +
      freshness;

    if (rankScore > bestScore) {
      bestScore = rankScore;
      best = row;
    }
  }

  let value = best?.status ?? existing?.status ?? "PRE";
  let source = best?.source || null;

  const decisionBackedSpecial =
    resolveDecisionBackedSpecialObservation(
      observations,
      existing
    );

  if (decisionBackedSpecial) {
    value =
      decisionBackedSpecial
        .decision
        .resolvedStatus;

    source =
      canonicalSource(
        decisionBackedSpecial
          .row
          .source
      );
  } else if (
    existing?.status &&
    isTerminal(existing.status)
  ) {
    const terminalObs = Array.from(latestPerSource.values())
      .filter(row => isTerminal(row?.status))
      .sort((a, b) => {
        const sa = canonicalSource(a?.source);
        const sb = canonicalSource(b?.source);

        const pa = sourceProfile(sa);
        const pb = sourceProfile(sb);

        const wa = SOURCE_WEIGHTS[sa] ?? SOURCE_WEIGHTS.unknown ?? 0.5;
        const wb = SOURCE_WEIGHTS[sb] ?? SOURCE_WEIGHTS.unknown ?? 0.5;

        const effectiveA = getEffectiveReliability(
          sa,
          pa.statusReliability ?? 0.5,
          reliabilityDb
        );

        const effectiveB = getEffectiveReliability(
          sb,
          pb.statusReliability ?? 0.5,
          reliabilityDb
        );

        const scoreA =
          wa * 1000 +
          effectiveA * 100 +
          Number(a?.ts || 0) / 1e13;

        const scoreB =
          wb * 1000 +
          effectiveB * 100 +
          Number(b?.ts || 0) / 1e13;

        return scoreB - scoreA;
      })[0];

    if (terminalObs) {
      value = terminalObs.status;
      source = terminalObs.source || null;
    } else {
      value = existing.status;
      source = "existing";
    }
  }

  return {
    value,
    source,

    decisionId:
      decisionBackedSpecial
        ?.decision
        ?.decisionId ??
      null,

    policyVersion:
      decisionBackedSpecial
        ?.decision
        ?.policyVersion ??
      null,

    statusCorrection:
      decisionBackedSpecial
        ?.row
        ?.statusCorrection ??
      null
  };
}

function pickScoreWeighted(observations, existing, chosenStatus, reliabilityDb = {}) {
  if (
    isSpecialStatus(
      chosenStatus,
      chosenStatus
    )
  ) {
    return {
      scoreHome: null,
      scoreAway: null,
      source: null
    };
  }

  const eligible = observations.filter(row => {
    if (isPre(chosenStatus)) return true;
    return row.scoreHome != null && row.scoreAway != null;
  });

  const latestPerSource = new Map();

  for (const row of eligible) {
    const source = canonicalSource(row?.source);
    const prev = latestPerSource.get(source);

    if (!prev || Number(row?.ts || 0) > Number(prev?.ts || 0)) {
      latestPerSource.set(source, row);
    }
  }

  let best = null;
  let bestScore = -Infinity;

  for (const row of latestPerSource.values()) {
    const source = canonicalSource(row?.source);
    const profile = sourceProfile(source);
    const sourceWeight = sourceWeightForRow(row);
    const reliability = getEffectiveReliability(
      source,
      profile.scoreReliability ?? 0.5,
      reliabilityDb
    );
    const freshness = Number(row?.ts || 0) / 1e13;

    const rankScore =
      sourceWeight * 1000 +
      reliability * 100 +
      freshness;

    if (rankScore > bestScore) {
      bestScore = rankScore;
      best = row;
    }
  }

  let scoreHome =
    best?.scoreHome != null ? safeNum(best.scoreHome, 0) : existing?.scoreHome ?? 0;

  let scoreAway =
    best?.scoreAway != null ? safeNum(best.scoreAway, 0) : existing?.scoreAway ?? 0;

  let source = best?.source || null;

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


function pickMinute(observations, existing, chosenStatus, reliabilityDb = {}) {
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

    if (half) return 45.999;

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

      const aSource = canonicalSource(a?.source);
      const bSource = canonicalSource(b?.source);

      const aProfile = sourceProfile(aSource);
      const bProfile = sourceProfile(bSource);

      const aReliability = getEffectiveReliability(
        aSource,
        aProfile.statusReliability ?? 0.5,
        reliabilityDb
      );

      const bReliability = getEffectiveReliability(
        bSource,
        bProfile.statusReliability ?? 0.5,
        reliabilityDb
      );

      const aWeight = sourceWeightForRow(a);
      const bWeight = sourceWeightForRow(b);

      if (bWeight !== aWeight) {
        return bWeight - aWeight;
      }

      if (bReliability !== aReliability) {
        return bReliability - aReliability;
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

  if (!value) {
    if (best?.minute) {
      return { value: best.minute, source: best.source || null };
    }

    if (isSecondHalfStatus(best?.status)) {
      return { value: "46", source: best?.source || null };
    }

    return { value, source };
  }

  if (bestCmp != null && (existingCmp == null || bestCmp > existingCmp)) {
    if (best?.minute) {
      return { value: best.minute, source: best.source || null };
    }
  }

  return { value, source };
}

function buildSourcesMap(observations) {
  const out = {};

  for (const row of observations) {
    const src = canonicalSource(row.source);
    const prev = out[src];

    if (!prev || Number(row.ts || 0) > Number(prev.observedAt || 0)) {
      out[src] = {
        observedAt: Number(row.ts || 0),
        sourceId: row.sourceId || null,

        status: row.status || null,
        rawStatus: row.rawStatus || null,
        minute: row.minute || null,

        scoreHome: safeNum(row.scoreHome, null),
        scoreAway: safeNum(row.scoreAway, null),

        kickoffUtc: row.kickoffUtc || null,
        leagueName: row.leagueName || null,
        homeTeam: row.homeTeam || null,
        awayTeam: row.awayTeam || null,
        venue: row.venue || null,

        referee: row.referee || null,
        officials: Array.isArray(row.officials) ? row.officials : [],

        injuries: Array.isArray(row.injuries) ? row.injuries : [],
        suspensions: Array.isArray(row.suspensions) ? row.suspensions : [],
        missingPlayers: Array.isArray(row.missingPlayers) ? row.missingPlayers : [],
        teamNews: row.teamNews || null,

        scoreBreakdown: row.scoreBreakdown || null,
        extraFacts: row.extraFacts || null
      };
    }
  }

  return out;
} 

function computeDisagreement(rows) {
  const latestPerSource = new Map();

  for (const row of rows) {
    const source = canonicalSource(row?.source);
    if (!source) continue;

    const prev = latestPerSource.get(source);

    if (!prev || Number(row?.ts || 0) > Number(prev?.ts || 0)) {
      latestPerSource.set(source, row);
    }
  }

  const latest = Array.from(latestPerSource.values());
  if (latest.length <= 1) return false;

  const statuses = latest.map(row => String(row?.status || "").toUpperCase());
  const scorePairs = latest.map(
    row => `${safeNum(row?.scoreHome, null)}|${safeNum(row?.scoreAway, null)}`
  );

  const statusSet = new Set(statuses);
  const scoreSet = new Set(scorePairs);

  const hasStatusDisagreement = statusSet.size > 1;
  const hasScoreDisagreement = scoreSet.size > 1;

  // Αν υπάρχει διαφωνία σε status ή score, είναι πραγματικό disagreement.
  if (hasStatusDisagreement || hasScoreDisagreement) {
    return true;
  }

  // Από εδώ και κάτω εξετάζουμε μόνο minute-only divergence.
  // Αν status + score συμφωνούν και το ματς είναι live, μικρές αποκλίσεις minute
  // δεν πρέπει να βαφτίζονται full disagreement.
  const liveLike = latest.some(row => isLive(row?.status));
  if (!liveLike) {
    return false;
  }

  const minuteValues = latest
    .map(row => {
      const parsed = parseMinute(row?.minute);
      if (!parsed) return null;
      return parsed.base + (parsed.extra / 100);
    })
    .filter(v => Number.isFinite(v));

  if (minuteValues.length <= 1) {
    return false;
  }

  const minMinute = Math.min(...minuteValues);
  const maxMinute = Math.max(...minuteValues);
  const minuteSpread = maxMinute - minMinute;

  // Μικρές αποκλίσεις live feed (πχ 44 vs 45+1 ή 67 vs 68) είναι φυσιολογικές.
  if (minuteSpread <= 2.5) {
    return false;
  }

  return true;
}

function computeConflictTypes(rows) {
  const latestPerSource = new Map();

  for (const row of rows) {
    const source = String(row?.source || "").trim();
    if (!source) continue;

    const prev = latestPerSource.get(source);

    if (!prev || Number(row?.ts || 0) > Number(prev?.ts || 0)) {
      latestPerSource.set(source, row);
    }
  }

  const latest = Array.from(latestPerSource.values());
  if (latest.length <= 1) return [];

  const statuses = new Set(
    latest.map(row => String(row?.status || "").toUpperCase())
  );

  const scorePairs = new Set(
    latest.map(row => `${safeNum(row?.scoreHome, null)}|${safeNum(row?.scoreAway, null)}`)
  );

  const normalizedMinutes = latest
    .map(row => {
      const m = row?.minute;
      if (!m) return null;

      const str = String(m).trim().toUpperCase();

      // αγνόησε terminal / non-informative values
      if (str === "FT" || str === "HT") return null;

      return str;
    })
    .filter(Boolean);

  const minuteSet = new Set(normalizedMinutes);

  const kickoffs = new Set(
    latest.map(row => String(row?.kickoffUtc || ""))
  );

  const homeTeams = new Set(
    latest.map(row => String(row?.homeTeam || "").trim().toLowerCase())
  );

  const awayTeams = new Set(
    latest.map(row => String(row?.awayTeam || "").trim().toLowerCase())
  );

  const types = [];

  if (statuses.size > 1) types.push("status");
  if (scorePairs.size > 1) types.push("score");
  if (minuteSet.size > 1) types.push("minute");
  if (kickoffs.size > 1) types.push("kickoff");
  if (homeTeams.size > 1 || awayTeams.size > 1) types.push("identity");

  return types;
}

function computeConfidence({
  rows,
  statusPick,
  scorePick,
  minutePick,
  disagreement,
  chosenStatus,
  conflictTypes = [],
  reliabilityDb = {}
}) {
  const uniqueSources = [...new Set(rows.map(x => canonicalSource(x?.source)).filter(Boolean))];
  const sourceCount = uniqueSources.length;

  let score = 0.35;

  score += Math.min(sourceCount, 3) * 0.08;

  const statusBaseReliability =
    sourceProfile(statusPick?.source).statusReliability ??
    sourceProfile(statusPick?.source).priority / 100 ??
    0.5;

  const statusLearnedReliability =
    getLearnedReliability(statusPick?.source, reliabilityDb);

  const statusReliability =
    statusLearnedReliability != null
      ? ((statusBaseReliability * 0.6) + (statusLearnedReliability * 0.4))
      : statusBaseReliability;

  score += statusReliability * 0.20;

  if (scorePick?.source) {
    const scoreBaseReliability =
      sourceProfile(scorePick.source).scoreReliability ??
      sourceProfile(scorePick.source).priority / 100 ??
      0.5;

    const scoreLearnedReliability =
      getLearnedReliability(scorePick?.source, reliabilityDb);

    const scoreReliability =
      scoreLearnedReliability != null
        ? ((scoreBaseReliability * 0.6) + (scoreLearnedReliability * 0.4))
        : scoreBaseReliability;

    score += scoreReliability * 0.12;
  }

  if (minutePick?.source) {
    const minuteBaseReliability =
      sourceProfile(minutePick.source).statusReliability ??
      sourceProfile(minutePick.source).priority / 100 ??
      0.5;

    const minuteLearnedReliability =
      getLearnedReliability(minutePick?.source, reliabilityDb);

    const minuteReliability =
      minuteLearnedReliability != null
        ? ((minuteBaseReliability * 0.6) + (minuteLearnedReliability * 0.4))
        : minuteBaseReliability;

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
    let penalty = 0.08;

    if (conflictTypes.includes("minute")) penalty += 0.03;
    if (conflictTypes.includes("score")) penalty += 0.12;
    if (conflictTypes.includes("status")) penalty += 0.18;
    if (conflictTypes.includes("kickoff")) penalty += 0.12;
    if (conflictTypes.includes("identity")) penalty += 0.30;

    score -= penalty;
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

function buildStatusReason(rows, statusPick, conflictTypes) {
  const sources = [...new Set(rows.map(r => r.source))];

  if (statusPick?.decisionId) {
    return {
      type:
        "approved_status_correction",

      chosen:
        statusPick.value,

      source:
        statusPick.source,

      sources,

      decisionId:
        statusPick.decisionId,

      policyVersion:
        statusPick.policyVersion
    };
  }

  if (!conflictTypes.includes("status")) {
    return {
      type: "consensus",
      chosen: statusPick.value,
      source: statusPick.source,
      sources
    };
  }

  return {
    type: "conflict",
    chosen: statusPick.value,
    source: statusPick.source,
    conflict: "status",
    competingSources: sources
  };
}

function buildScoreReason(rows, scorePick, conflictTypes) {
  const sources = [...new Set(rows.map(r => r.source))];

  if (!conflictTypes.includes("score")) {
    return {
      type: "consensus",
      chosen: `${scorePick.scoreHome}-${scorePick.scoreAway}`,
      source: scorePick.source,
      sources
    };
  }

  return {
    type: "conflict",
    chosen: `${scorePick.scoreHome}-${scorePick.scoreAway}`,
    source: scorePick.source,
    conflict: "score",
    competingSources: sources
  };
}

function buildMinuteReason(rows, minutePick, conflictTypes) {
  const sources = [...new Set(rows.map(r => r.source))];

  if (!conflictTypes.includes("minute")) {
    return {
      type: "consensus",
      chosen: minutePick.value,
      source: minutePick.source,
      sources
    };
  }

  return {
    type: "conflict",
    chosen: minutePick.value,
    source: minutePick.source,
    conflict: "minute",
    competingSources: sources
  };
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
    const beforeKickoffWindow =
      Number.isFinite(elapsedMs) && elapsedMs < 0;

    const suspiciousPreAfterKickoff =
      Number.isFinite(elapsedMs) && elapsedMs > 2 * 60 * 60 * 1000;

    if (beforeKickoffWindow) {
      return {
        operationalState: "PRE",
        isDisplayLive: false,
        isDisplayPre: true,
        isDisplayFinal: false,
        terminalConfidence: 0
      };
    }

    if (suspiciousPreAfterKickoff) {
      return {
        operationalState: "UNKNOWN",
        isDisplayLive: false,
        isDisplayPre: false,
        isDisplayFinal: false,
        terminalConfidence: 0
      };
    }

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

  const veryStrongFinishedWindow =
    Number.isFinite(elapsedMs) && elapsedMs > 6.5 * 60 * 60 * 1000;

  const existingWasTerminalUnconfirmed =
    String(existing?.operationalState || "").toUpperCase() === "TERMINAL_UNCONFIRMED";

  const recentRows = [...rows]
    .sort((a, b) => Number(b?.ts || 0) - Number(a?.ts || 0))
    .slice(0, 3);

  const stableRecentScore =
    recentRows.length >= 2 &&
    new Set(
      recentRows.map(r => `${safeNum(r?.scoreHome, null)}-${safeNum(r?.scoreAway, null)}`)
    ).size === 1;

  if (
    veryStrongFinishedWindow &&
    (stableRecentScore || nearEndMinute || existingWasTerminalUnconfirmed)
  ) {
    return {
      operationalState: "TERMINAL_UNCONFIRMED",
      isDisplayLive: false,
      isDisplayPre: false,
      isDisplayFinal: false,
      terminalConfidence: stableRecentScore ? 0.7 : 0.45
    };
  }

  if (
    stronglyFinishedWindow &&
    (nearEndMinute || staleByObservationAge || existingWasTerminalUnconfirmed)
  ) {
    return {
      operationalState: "TERMINAL_UNCONFIRMED",
      isDisplayLive: false,
      isDisplayPre: false,
      isDisplayFinal: false,
      terminalConfidence: stableRecentScore ? 0.55 : 0.35
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
  existing = null,
  sideEffects = true
}) {
  const rows = Array.isArray(observations)
    ? observations
        .filter(Boolean)
        .sort((a, b) => Number(b?.ts || 0) - Number(a?.ts || 0))
        .slice(0, 10) // KEEP ONLY LAST 10 OBS
    : [];

  if (!rows.length) {
    return existing || null;
  }

  const sorted = [...rows].sort(byNewest);
  const newest = sorted[0];
  const matchId = newest?.matchId || existing?.matchId || "";
  const matchKey = newest?.matchKey || existing?.matchKey || "";
  // canonicalId is the provider-agnostic join key (details/value/UI). ESPN
  // observations carry a numeric matchId, so losing canonicalId here breaks
  // every downstream join for matches only ESPN observed.
  const canonicalId =
    sorted.map(row => String(row?.canonicalId || "").trim()).find(Boolean) ||
    String(existing?.canonicalId || "").trim() ||
    null;

  const kickoff = pickBest(rows, "kickoffUtc", "kickoffReliability");
  const homeTeam = pickBest(rows, "homeTeam", "teamsReliability");
  const awayTeam = pickBest(rows, "awayTeam", "teamsReliability");
  const leagueName = pickBest(rows, "leagueName", "teamsReliability");

  const reliabilityDb = getSourceReliabilitySnapshot();

  const statusPick = pickStatusWeighted(rows, existing, reliabilityDb);
  const scorePick = pickScoreWeighted(
    rows,
    existing,
    statusPick.value,
    reliabilityDb
  );
  const minutePick = pickMinute(rows, existing, statusPick.value, reliabilityDb);

  const disagreement = computeDisagreement(rows);
  const conflictTypes = computeConflictTypes(rows);

  const confidence = computeConfidence({
    rows,
    statusPick,
    scorePick,
    minutePick,
    disagreement,
    chosenStatus: statusPick.value,
    conflictTypes,
    reliabilityDb
  });

  const hasConflict = disagreement === true;

  const confidenceBand = getConfidenceBand(confidence, {
    hasConflict
  });

  const needsReview =
    hasConflict ||
    confidenceBand === "LOW" ||
    (
      confidenceBand === "MEDIUM" &&
      isLive(statusPick.value)
    );

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

  let chosenMinuteSource = null;

  if (isPre(statusPick.value)) {
    chosenMinuteSource = null;
  } else if (isLive(statusPick.value)) {
    chosenMinuteSource = "reconciled";
  } else if (isTerminal(statusPick.value)) {
    chosenMinuteSource = minutePick?.source || "reconciled";
  }

  const observedSources = [
    ...new Set(
      rows
        .map(row => String(row?.source || "").trim())
        .filter(Boolean)
    )
  ];

  const sourceParticipation = {
    observedSources,
    sourceCount: observedSources.length,
    hasSecondarySource: observedSources.some(src => src !== "espn"),
    isMultiSourceObserved: observedSources.length >= 2
  };

  const resolved = {
    matchId,
    matchKey,
    canonicalId,
    source: "reconciled",
    dayKey: newest.actualDay || newest.dayKey || existing?.dayKey || null,

    leagueSlug: newest.leagueSlug || existing?.leagueSlug || null,
    leagueName: leagueName.value || newest.leagueName || existing?.leagueName || null,

    homeTeam: homeTeam.value || newest.homeTeam || existing?.homeTeam || null,
    awayTeam: awayTeam.value || newest.awayTeam || existing?.awayTeam || null,

    kickoffUtc,

    status: statusPick.value || newest.status || existing?.status || "PRE",
    rawStatus:
      rows
        .filter(row => String(row?.source || "") === String(statusPick?.source || ""))
        .sort((a, b) => Number(b?.ts || 0) - Number(a?.ts || 0))[0]?.rawStatus ||
      newest.rawStatus ||
      existing?.rawStatus ||
      null,
    minute: minutePick.value,

    statusCorrection:
      statusPick
        .statusCorrection ||
      null,

    scoreHome: scorePick.scoreHome,
    scoreAway: scorePick.scoreAway,
    penalties: newest?.penalties || existing?.penalties || null,
    decidedBy:
      newest?.decidedBy ||
      existing?.decidedBy ||
      (String(
        newest?.rawStatus ||
        existing?.rawStatus ||
        ""
      ).toUpperCase().includes("PEN") ? "pens" : null),

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
    sourceParticipation,

    reconcileMeta: {
      chosenKickoffSource: kickoff.source,
      chosenTeamsSource:
        homeTeam.source === awayTeam.source ? homeTeam.source : "mixed",
      chosenStatusSource: statusPick.source,
      chosenScoreSource: scorePick.source,
      chosenMinuteSource,

      disagreement,
      conflictTypes,
      confidence,
      observationsCount: rows.length,

      // 🔥 NEW: DECISION EXPLANATION
      decision: {
        status: buildStatusReason(rows, statusPick, conflictTypes),
        score: buildScoreReason(rows, scorePick, conflictTypes),
        minute: buildMinuteReason(rows, minutePick, conflictTypes)
      },

      updatedAt: Date.now()
    },
    hasConflict,
    needsReview,
    confidenceBand,
    conflictTypes
  };

  if (sideEffects) {
    const disagreementEntries = collectDisagreements(matchId, rows, resolved);

    if (disagreementEntries.length) {
      await persistDisagreements(env, disagreementEntries, rows, resolved);
    }

    updateSourceReliability(rows, conflictTypes);
  }

  return resolved;
}
