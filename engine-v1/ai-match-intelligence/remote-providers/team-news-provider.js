function asArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value == null) return [];
  return [value].filter(Boolean);
}

function normalizeText(value) {
  return String(value || "").trim();
}

function dedupeNotes(items) {
  const out = [];
  const seen = new Set();

  for (const raw of asArray(items)) {
    const text =
      typeof raw === "string"
        ? normalizeText(raw)
        : normalizeText(
            raw?.note ||
            raw?.reason ||
            raw?.label ||
            raw?.description ||
            raw?.player ||
            raw?.name
          );

    if (!text) continue;

    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }

  return out;
}

function pullNotesFromBucket(bucket) {
  if (!bucket) return [];

  return dedupeNotes([
    ...(bucket?.notes || []),
    ...(bucket?.injuries || []),
    ...(bucket?.suspensions || []),
    ...(bucket?.absences || []),
    ...(bucket?.missing || []),
    ...(bucket?.missingPlayers || []),
    ...(bucket?.unavailablePlayers || []),
    ...(bucket?.doubtful || []),
    ...(bucket?.questionable || []),
    ...(bucket?.teamNews || [])
  ]);
}

function inferTeamNewsReliability(data = {}) {
  const homeCount = asArray(data?.homeTeam?.notes).length;
  const awayCount = asArray(data?.awayTeam?.notes).length;
  const evidenceCount = homeCount + awayCount;
  const bothSides = homeCount > 0 && awayCount > 0;

  if (evidenceCount <= 0) {
    return {
      reliability: "empty",
      homeCount,
      awayCount,
      evidenceCount,
      bothSides
    };
  }

  if (evidenceCount >= 2 || bothSides) {
    return {
      reliability: "usable",
      homeCount,
      awayCount,
      evidenceCount,
      bothSides
    };
  }

  return {
    reliability: "thin",
    homeCount,
    awayCount,
    evidenceCount,
    bothSides
  };
}

function buildCanonicalTeamNews(data, provider, confidence = 0.65, reason = null, status = "success") {
  const homeNotes = dedupeNotes(data?.homeTeam?.notes);
  const awayNotes = dedupeNotes(data?.awayTeam?.notes);
  const normalized = {
    homeTeam: { notes: homeNotes },
    awayTeam: { notes: awayNotes }
  };

  const reliabilityMeta = inferTeamNewsReliability(normalized);

  if (reliabilityMeta.reliability === "empty") {
    return {
      status: "unavailable",
      reason: reason || "no_team_news_evidence",
      confidence: 0,
      reliability: "empty",
      diagnostics: {
        provider,
        homeCount: reliabilityMeta.homeCount,
        awayCount: reliabilityMeta.awayCount,
        evidenceCount: reliabilityMeta.evidenceCount,
        bothSides: reliabilityMeta.bothSides
      },
      data: null
    };
  }

  const resolvedReason =
    reason ||
    (reliabilityMeta.reliability === "thin"
      ? "limited_team_news_evidence"
      : null);

  const resolvedStatus =
    reliabilityMeta.reliability === "usable"
      ? status === "unavailable"
        ? "partial"
        : "success"
      : "partial";

  const resolvedConfidence =
    reliabilityMeta.reliability === "usable"
      ? confidence
      : Math.min(confidence, 0.44);

  return {
    status: resolvedStatus,
    reason: resolvedReason,
    confidence: resolvedConfidence,
    reliability: reliabilityMeta.reliability,
    diagnostics: {
      provider,
      homeCount: reliabilityMeta.homeCount,
      awayCount: reliabilityMeta.awayCount,
      evidenceCount: reliabilityMeta.evidenceCount,
      bothSides: reliabilityMeta.bothSides
    },
    data: {
      homeTeam: {
        notes: homeNotes
      },
      awayTeam: {
        notes: awayNotes
      },
      provider,
      evidenceCount: reliabilityMeta.evidenceCount,
      reliability: reliabilityMeta.reliability
    }
  };
}

function extractTeamNewsFromResearch(context = {}) {
  const factData = context?.researchedFacts?.teamNews?.data;
  if (
    factData?.homeTeam?.notes ||
    factData?.awayTeam?.notes ||
    factData?.home?.notes ||
    factData?.away?.notes
  ) {
    return {
      homeTeam: {
        notes: dedupeNotes([
          ...(factData?.homeTeam?.notes || []),
          ...(factData?.home?.notes || [])
        ])
      },
      awayTeam: {
        notes: dedupeNotes([
          ...(factData?.awayTeam?.notes || []),
          ...(factData?.away?.notes || [])
        ])
      }
    };
  }

  const ctxData = context?.teamNewsContext?.data;
  if (
    ctxData?.homeTeam?.notes ||
    ctxData?.awayTeam?.notes ||
    ctxData?.home?.notes ||
    ctxData?.away?.notes
  ) {
    return {
      homeTeam: {
        notes: dedupeNotes([
          ...(ctxData?.homeTeam?.notes || []),
          ...(ctxData?.home?.notes || [])
        ])
      },
      awayTeam: {
        notes: dedupeNotes([
          ...(ctxData?.awayTeam?.notes || []),
          ...(ctxData?.away?.notes || [])
        ])
      }
    };
  }

  const research = context?.research || {};
  const homeBucket =
    research?.teamNews?.homeTeam ||
    research?.team_news?.homeTeam ||
    research?.homeTeamNews ||
    {};
  const awayBucket =
    research?.teamNews?.awayTeam ||
    research?.team_news?.awayTeam ||
    research?.awayTeamNews ||
    {};

  return {
    homeTeam: { notes: pullNotesFromBucket(homeBucket) },
    awayTeam: { notes: pullNotesFromBucket(awayBucket) }
  };
}

function extractTeamNewsFromMatch(match = {}) {
  const source2 = match?.sources?.source2 || {};
  const espn = match?.sources?.espn || {};

  const homeBucket = {
    ...(source2?.teamNews?.homeTeam || {}),
    ...(espn?.teamNews?.homeTeam || {}),
    notes: [
      ...(source2?.teamNewsHome || []),
      ...(espn?.teamNewsHome || []),
      ...(source2?.homeTeamNews || []),
      ...(espn?.homeTeamNews || [])
    ],
    injuries: [
      ...(source2?.injuries?.home || []),
      ...(espn?.injuries?.home || []),
      ...(source2?.homeInjuries || []),
      ...(espn?.homeInjuries || [])
    ],
    suspensions: [
      ...(source2?.suspensions?.home || []),
      ...(espn?.suspensions?.home || []),
      ...(source2?.homeSuspensions || []),
      ...(espn?.homeSuspensions || [])
    ],
    missingPlayers: [
      ...(source2?.lineups?.home?.missingPlayers || []),
      ...(espn?.lineups?.home?.missingPlayers || []),
      ...(source2?.homeMissingPlayers || []),
      ...(espn?.homeMissingPlayers || [])
    ]
  };

  const awayBucket = {
    ...(source2?.teamNews?.awayTeam || {}),
    ...(espn?.teamNews?.awayTeam || {}),
    notes: [
      ...(source2?.teamNewsAway || []),
      ...(espn?.teamNewsAway || []),
      ...(source2?.awayTeamNews || []),
      ...(espn?.awayTeamNews || [])
    ],
    injuries: [
      ...(source2?.injuries?.away || []),
      ...(espn?.injuries?.away || []),
      ...(source2?.awayInjuries || []),
      ...(espn?.awayInjuries || [])
    ],
    suspensions: [
      ...(source2?.suspensions?.away || []),
      ...(espn?.suspensions?.away || []),
      ...(source2?.awaySuspensions || []),
      ...(espn?.awaySuspensions || [])
    ],
    missingPlayers: [
      ...(source2?.lineups?.away?.missingPlayers || []),
      ...(espn?.lineups?.away?.missingPlayers || []),
      ...(source2?.awayMissingPlayers || []),
      ...(espn?.awayMissingPlayers || [])
    ]
  };

  return {
    homeTeam: { notes: pullNotesFromBucket(homeBucket) },
    awayTeam: { notes: pullNotesFromBucket(awayBucket) }
  };
}

export async function fetchTeamNewsResearchBridge(match, task, context = {}) {
  const extracted = extractTeamNewsFromResearch(context);
  const reliabilityMeta = inferTeamNewsReliability(extracted);

  return buildCanonicalTeamNews(
    extracted,
    "team-news-research-bridge",
    reliabilityMeta.reliability === "usable" ? 0.74 : 0.58,
    reliabilityMeta.reliability === "thin"
      ? "limited_team_news_evidence"
      : null,
    reliabilityMeta.reliability === "usable" ? "success" : "partial"
  );
}

export async function fetchTeamNewsMatchFacts(match, task, context = {}) {
  const extracted = extractTeamNewsFromMatch(match);
  const reliabilityMeta = inferTeamNewsReliability(extracted);

  return buildCanonicalTeamNews(
    extracted,
    "team-news-match-facts",
    reliabilityMeta.reliability === "usable" ? 0.58 : 0.42,
    reliabilityMeta.reliability === "thin"
      ? "limited_team_news_evidence"
      : null,
    "partial"
  );
}

export async function fetchTeamNewsStub(match, task, context = {}) {
  return {
    status: "unavailable",
    reason: "provider_contract_ready_no_live_source",
    confidence: 0,
    reliability: "empty",
    diagnostics: {
      provider: "team-news-stub",
      homeCount: 0,
      awayCount: 0,
      evidenceCount: 0,
      bothSides: false
    },
    data: null
  };
}