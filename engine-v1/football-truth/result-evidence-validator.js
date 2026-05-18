function normalizeText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function tokenSet(value) {
  const stop = new Set(["fc", "cf", "sc", "club", "the", "afc", "ac", "cd", "de", "la", "el"]);
  return new Set(
    normalizeText(value)
      .split(" ")
      .filter(token => token && token.length > 1 && !stop.has(token))
  );
}

function overlapScore(a, b) {
  const aa = tokenSet(a);
  const bb = tokenSet(b);
  if (!aa.size || !bb.size) return 0;

  let overlap = 0;
  for (const token of aa) {
    if (bb.has(token)) overlap++;
  }

  return overlap / Math.max(aa.size, bb.size);
}

function scoreValue(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function candidateScore(candidate) {
  const home =
    scoreValue(candidate?.scoreHome) ??
    scoreValue(candidate?.homeScore) ??
    scoreValue(candidate?.score?.home) ??
    scoreValue(candidate?.finalScore?.home);

  const away =
    scoreValue(candidate?.scoreAway) ??
    scoreValue(candidate?.awayScore) ??
    scoreValue(candidate?.score?.away) ??
    scoreValue(candidate?.finalScore?.away);

  if (home === null || away === null) return null;
  return { home, away };
}

function hasFinalSignal(candidate) {
  const text = [
    candidate?.status,
    candidate?.rawStatus,
    candidate?.statusText,
    candidate?.phase,
    candidate?.description,
    candidate?.title,
    candidate?.evidenceText
  ].filter(Boolean).join(" ").toLowerCase();

  return (
    /\bft\b/.test(text) ||
    /\bfull[-\s]?time\b/.test(text) ||
    /\bfinal\b/.test(text) ||
    /\bended\b/.test(text) ||
    /\bafter extra time\b/.test(text) ||
    /\bpenalties\b/.test(text) ||
    /\bstatus_final\b/.test(text)
  );
}

function sourceTier(candidate) {
  const type = String(candidate?.sourceType || candidate?.type || "").toLowerCase();
  const url = String(candidate?.sourceUrl || candidate?.url || "").toLowerCase();

  if (
    type.includes("official") ||
    type.includes("federation") ||
    type.includes("league") ||
    type.includes("club_official") ||
    candidate?.official === true
  ) {
    return "official";
  }

  if (
    url.includes("fifa.") ||
    url.includes("uefa.") ||
    url.includes("the-afc.") ||
    url.includes("cafonline.") ||
    url.includes("concacaf.") ||
    url.includes("conmebol.")
  ) {
    return "official";
  }

  if (type.includes("trusted") || type.includes("known_results")) return "trusted";
  if (type.includes("aggregator") || type.includes("scores")) return "aggregator";
  return "unknown";
}

function dateMatches(watchRow, candidate) {
  const watchDate = String(watchRow?.kickoffUtc || watchRow?.date || "").slice(0, 10);
  const candidateDate = String(candidate?.kickoffUtc || candidate?.date || candidate?.matchDate || "").slice(0, 10);

  if (!watchDate || !candidateDate) {
    return { ok: null, reason: "missing_date" };
  }

  return {
    ok: watchDate === candidateDate,
    reason: watchDate === candidateDate ? "date_match" : "date_mismatch"
  };
}

function leagueMatches(watchRow, candidate) {
  const expected = normalizeText(watchRow?.leagueSlug || watchRow?.leagueName || "");
  const actual = normalizeText(candidate?.leagueSlug || candidate?.competitionSlug || candidate?.leagueName || candidate?.competition || "");

  if (!expected || !actual) return { ok: null, reason: "missing_league" };
  if (expected === actual) return { ok: true, reason: "league_match" };

  return {
    ok: overlapScore(expected, actual) >= 0.6,
    reason: overlapScore(expected, actual) >= 0.6 ? "league_token_match" : "league_mismatch"
  };
}

function teamMatches(watchRow, candidate) {
  const homeScore = overlapScore(watchRow?.homeTeam, candidate?.homeTeam || candidate?.home);
  const awayScore = overlapScore(watchRow?.awayTeam, candidate?.awayTeam || candidate?.away);

  return {
    homeScore,
    awayScore,
    ok: homeScore >= 0.5 && awayScore >= 0.5,
    reason: homeScore >= 0.5 && awayScore >= 0.5 ? "team_match" : "team_mismatch"
  };
}

export function validateFinalResultEvidence(watchRow, candidate, options = {}) {
  const reasons = [];
  const rejects = [];
  let confidence = 0;

  const score = candidateScore(candidate);
  if (score) {
    confidence += 0.2;
    reasons.push("score_present");
  } else {
    rejects.push("missing_score");
  }

  const finalSignal = hasFinalSignal(candidate);
  if (finalSignal) {
    confidence += 0.2;
    reasons.push("final_signal_present");
  } else {
    rejects.push("missing_final_signal");
  }

  const teams = teamMatches(watchRow, candidate);
  if (teams.ok) {
    confidence += 0.2;
    reasons.push(teams.reason);
  } else {
    rejects.push(teams.reason);
  }

  const date = dateMatches(watchRow, candidate);
  if (date.ok === true) {
    confidence += 0.1;
    reasons.push(date.reason);
  } else if (date.ok === false) {
    rejects.push(date.reason);
  } else {
    reasons.push(date.reason);
  }

  const league = leagueMatches(watchRow, candidate);
  if (league.ok === true) {
    confidence += 0.1;
    reasons.push(league.reason);
  } else if (league.ok === false) {
    rejects.push(league.reason);
  } else {
    reasons.push(league.reason);
  }

  const tier = sourceTier(candidate);
  if (tier === "official") {
    confidence += 0.2;
    reasons.push("official_source");
  } else if (tier === "trusted") {
    confidence += 0.12;
    reasons.push("trusted_source");
  } else if (tier === "aggregator") {
    confidence += 0.06;
    reasons.push("aggregator_source");
  } else {
    reasons.push("unknown_source_tier");
  }

  confidence = Math.max(0, Math.min(1, Number(confidence.toFixed(3))));

  let verdict = "weak_candidate";
  if (rejects.includes("missing_score") || rejects.includes("team_mismatch") || rejects.includes("date_mismatch")) {
    verdict = "rejected";
  } else if (confidence >= 0.8) {
    verdict = "accepted_candidate";
  } else if (confidence >= 0.55) {
    verdict = "review_candidate";
  }

  if (options.requireOfficial === true && tier !== "official" && verdict === "accepted_candidate") {
    verdict = "review_candidate";
    reasons.push("downgraded_require_official");
  }

  return {
    ok: verdict !== "rejected",
    verdict,
    confidence,
    sourceTier: tier,
    score,
    checks: {
      teams,
      date,
      league,
      finalSignal
    },
    reasons,
    rejects,
    candidate: {
      sourceName: candidate?.sourceName || candidate?.source || null,
      sourceUrl: candidate?.sourceUrl || candidate?.url || null,
      sourceType: candidate?.sourceType || candidate?.type || null,
      homeTeam: candidate?.homeTeam || candidate?.home || null,
      awayTeam: candidate?.awayTeam || candidate?.away || null,
      scoreHome: score ? score.home : null,
      scoreAway: score ? score.away : null,
      status: candidate?.status || candidate?.rawStatus || candidate?.statusText || null,
      date: candidate?.date || candidate?.matchDate || candidate?.kickoffUtc || null
    }
  };
}

export function compareFinalResultCandidates(watchRow, candidates, options = {}) {
  const validated = candidates.map(candidate => validateFinalResultEvidence(watchRow, candidate, options));

  const accepted = validated.filter(row => row.verdict === "accepted_candidate" || row.verdict === "review_candidate");
  const scoreKeys = new Set(
    accepted
      .filter(row => row.score)
      .map(row => `${row.score.home}-${row.score.away}`)
  );

  const conflict = scoreKeys.size > 1;

  return {
    ok: accepted.length > 0 && !conflict,
    conflict,
    acceptedCount: accepted.length,
    rejectedCount: validated.filter(row => row.verdict === "rejected").length,
    best: accepted
      .slice()
      .sort((a, b) => b.confidence - a.confidence)[0] || null,
    candidates: validated
  };
}
