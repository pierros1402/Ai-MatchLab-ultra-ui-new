function pushEvidence(bucket, item) {
  if (!item) return;
  if (!item.kind) return;
  bucket.push(item);
}

function normalizeResearchSources(research) {
  const items = [];
  const sources = Array.isArray(research?.sources) ? research.sources : [];

  for (const src of sources) {
    pushEvidence(items, {
      kind: "remote_research",
      key: src,
      provider: src,
      trustClass:
        src === "espn-event" || src === "espn-summary"
          ? "editorial_feed"
          : "unknown",
      confidence:
        src === "espn-event" || src === "espn-summary"
          ? 0.55
          : 0.35,
      status: "available"
    });
  }

  if (research?.competitionContext) {
    pushEvidence(items, {
      kind: "competition_context_remote",
      key: "competition_context_remote",
      provider: "research",
      trustClass: "remote_structured",
      confidence: 0.55,
      status: "available"
    });
  }

  if (research?.referee) {
    pushEvidence(items, {
      kind: "referee_remote",
      key: "referee_remote",
      provider: "research",
      trustClass: "remote_structured",
      confidence: 0.5,
      status: "available"
    });
  }

  return items;
}

export function buildEvidenceBundle(match, inputs = {}) {
  const {
    research,
    competitionContext,
    refereeContext,
    teamNewsContext,
    lineupContext,
    historyContext,
    formGuide,
    headToHeadGuide,
    support
  } = inputs;

  const evidence = [];

  // Remote / research evidence
  for (const item of normalizeResearchSources(research)) {
    pushEvidence(evidence, item);
  }

  // Local deterministic evidence
  if (competitionContext?.data) {
    pushEvidence(evidence, {
      kind: "competition_context_local",
      key: "competition_context_local",
      provider: "local-standings",
      trustClass: "deterministic_local",
      confidence: 0.8,
      status: "available"
    });
  }

  if (refereeContext?.data) {
    pushEvidence(evidence, {
      kind: "referee_local",
      key: "referee_local",
      provider: "local-referees",
      trustClass: "deterministic_local",
      confidence: 0.75,
      status: "available"
    });
  }

  if (teamNewsContext?.data) {
    pushEvidence(evidence, {
      kind: "team_news_local",
      key: "team_news_local",
      provider: "local-team-news",
      trustClass: "deterministic_local",
      confidence: 0.65,
      status: "available"
    });
  }

  if (lineupContext?.data) {
    pushEvidence(evidence, {
      kind: "lineup_projection_local",
      key: "lineup_projection_local",
      provider: "local-lineup-model",
      trustClass: "model_local",
      confidence: 0.6,
      status: "available"
    });
  }

  const mergedRows = Number(historyContext?.meta?.mergedRows || 0);
  if (mergedRows > 0) {
    pushEvidence(evidence, {
      kind: "history_context_local",
      key: "history_context_local",
      provider: "local-history",
      trustClass: "deterministic_local",
      confidence: mergedRows >= 20 ? 0.82 : 0.68,
      status: "available",
      meta: {
        mergedRows
      }
    });
  }

  const homeSample = Number(formGuide?.homeTeam?.sampleSize || 0);
  const awaySample = Number(formGuide?.awayTeam?.sampleSize || 0);
  if (homeSample > 0 || awaySample > 0) {
    pushEvidence(evidence, {
      kind: "form_guide_local",
      key: "form_guide_local",
      provider: "local-history",
      trustClass: "derived_local",
      confidence:
        homeSample >= 3 && awaySample >= 3
          ? 0.78
          : 0.52,
      status: "available",
      meta: {
        homeSample,
        awaySample
      }
    });
  }

  const h2hSample = Number(headToHeadGuide?.sampleSize || 0);
  if (h2hSample > 0) {
    pushEvidence(evidence, {
      kind: "head_to_head_local",
      key: "head_to_head_local",
      provider: "local-history",
      trustClass: "derived_local",
      confidence: h2hSample >= 3 ? 0.7 : 0.45,
      status: "available",
      meta: {
        sampleSize: h2hSample
      }
    });
  }

  if (support?.hasValue) {
    pushEvidence(evidence, {
      kind: "value_snapshot_local",
      key: "value_snapshot_local",
      provider: "local-value",
      trustClass: "model_local",
      confidence: 0.72,
      status: "available",
      meta: {
        topMarket: support?.valueSummary?.topMarket || null,
        topPick: support?.valueSummary?.topPick || null,
        topScore: support?.valueSummary?.topScore ?? null
      }
    });
  }

  const sourcesUsed = evidence.map(x => x.provider).filter(Boolean);
  const trustCounts = evidence.reduce((acc, item) => {
    const key = item.trustClass || "unknown";
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const missing = [];
  if (!competitionContext?.data) missing.push("competition_context");
  if (!refereeContext?.data) missing.push("referee_profile");
  if (!teamNewsContext?.data) missing.push("team_news");
  if (!lineupContext?.data) missing.push("expected_lineups");
  if (!(homeSample > 0 || awaySample > 0)) missing.push("form_guide");
  if (!(h2hSample > 0)) missing.push("head_to_head");
  if (!support?.hasValue) missing.push("value_snapshot");

  return {
    matchId: match?.matchId || null,
    status: evidence.length ? "partial" : "none",
    evidence,
    summary: {
      totalEvidence: evidence.length,
      providers: Array.from(new Set(sourcesUsed)),
      trustCounts,
      missing
    }
  };
}