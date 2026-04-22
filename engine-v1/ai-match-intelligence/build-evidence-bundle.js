function pushEvidence(bucket, item) {
  if (!item) return;
  if (!item.kind) return;
  bucket.push(item);
}

function reliabilityMeta(ctx, fallback = "empty") {
  const reliability = String(
    ctx?.data?.reliability ||
    ctx?.reliability ||
    fallback
  );

  return { reliability };
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
    const { reliability } = reliabilityMeta(refereeContext);

    pushEvidence(evidence, {
      kind: "referee_profile",
      key: "referee_profile",
      provider: "local-referees",
      trustClass:
        reliability === "identity_only"
          ? "identity_only_local"
          : "deterministic_local",
      confidence:
        reliability === "identity_only"
          ? Math.min(Number(refereeContext?.confidence ?? 0.75), 0.45)
          : Number(refereeContext?.confidence ?? 0.75),
      status:
        reliability === "identity_only"
          ? "limited"
          : "available",
      meta: {
        reliability
      }
    });
  }

  if (teamNewsContext?.data) {
    const { reliability } = reliabilityMeta(teamNewsContext);

    pushEvidence(evidence, {
      kind: "team_news",
      key: "team_news",
      provider: "local-team-news",
      trustClass:
        reliability === "thin"
          ? "thin_local"
          : "deterministic_local",
      confidence:
        reliability === "thin"
          ? Math.min(Number(teamNewsContext?.confidence ?? 0.65), 0.42)
          : Number(teamNewsContext?.confidence ?? 0.65),
      status:
        reliability === "thin"
          ? "limited"
          : "available",
      meta: {
        reliability
      }
    });
  }

  if (lineupContext?.data) {
    const { reliability } = reliabilityMeta(lineupContext);

    pushEvidence(evidence, {
      kind: "expected_lineups",
      key: "expected_lineups",
      provider: "local-lineup-model",
      trustClass:
        reliability === "limited"
          ? "limited_local"
          : "model_local",
      confidence:
        reliability === "limited"
          ? Math.min(Number(lineupContext?.confidence ?? 0.6), 0.42)
          : Number(lineupContext?.confidence ?? 0.6),
      status:
        reliability === "limited"
          ? "limited"
          : "available",
      meta: {
        reliability
      }
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

  const refereeReliability = reliabilityMeta(refereeContext).reliability;
  const teamNewsReliability = reliabilityMeta(teamNewsContext).reliability;
  const lineupReliability = reliabilityMeta(lineupContext).reliability;

  if (!competitionContext?.data) missing.push("competition_context");

  if (!refereeContext?.data) {
    missing.push("referee_profile");
  } else if (refereeReliability !== "usable") {
    missing.push("referee_profile_reliability");
  }

  if (!teamNewsContext?.data) {
    missing.push("team_news");
  } else if (teamNewsReliability !== "usable") {
    missing.push("team_news_reliability");
  }

  if (!lineupContext?.data) {
    missing.push("expected_lineups");
  } else if (lineupReliability !== "usable") {
    missing.push("expected_lineups_reliability");
  }
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