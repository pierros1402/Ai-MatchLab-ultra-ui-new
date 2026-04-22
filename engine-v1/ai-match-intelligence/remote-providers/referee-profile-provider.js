function normalizeName(value) {
  return String(value || "").trim();
}

function toNumber(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function readFirstNumber(...values) {
  for (const value of values) {
    const num = toNumber(value);
    if (num != null) return num;
  }
  return null;
}

function pickRefereeNameFromOfficials(officials = []) {
  for (const item of Array.isArray(officials) ? officials : []) {
    const role = String(item?.role || item?.type || "").toLowerCase();
    const name = normalizeName(item?.name || item?.displayName || item?.fullName);

    if (!name) continue;
    if (!role) return name;
    if (role.includes("ref")) return name;
    if (role.includes("official")) return name;
  }
  return null;
}

function pickRefereeObjectFromOfficials(officials = []) {
  for (const item of Array.isArray(officials) ? officials : []) {
    const role = String(item?.role || item?.type || "").toLowerCase();
    const name = normalizeName(item?.name || item?.displayName || item?.fullName);

    if (!name) continue;
    if (!role || role.includes("ref") || role.includes("official")) {
      return item;
    }
  }
  return null;
}

function buildNamedRefereeCandidate(value, role = "referee") {
  const name = normalizeName(
    value?.name ||
    value?.displayName ||
    value?.fullName ||
    value?.referee ||
    value?.refereeName
  );

  if (!name) return null;

  return {
    ...value,
    name,
    role: value?.role || value?.type || role
  };
}

function extractRefereeStats(data = {}) {
  const stats = data?.stats || {};
  const profile = data?.profile || {};
  const discipline = data?.discipline || {};
  const cards = data?.cards || {};

  return {
    yellowPerMatch: readFirstNumber(
      data?.yellowPerMatch,
      data?.yellow_cards_per_match,
      data?.cardsYellowPerMatch,
      stats?.yellowPerMatch,
      stats?.yellow_cards_per_match,
      profile?.yellowPerMatch,
      profile?.yellow_cards_per_match,
      discipline?.yellowPerMatch,
      discipline?.yellow_cards_per_match,
      cards?.yellowPerMatch,
      cards?.yellow_cards_per_match
    ),

    redPerMatch: readFirstNumber(
      data?.redPerMatch,
      data?.red_cards_per_match,
      data?.cardsRedPerMatch,
      stats?.redPerMatch,
      stats?.red_cards_per_match,
      profile?.redPerMatch,
      profile?.red_cards_per_match,
      discipline?.redPerMatch,
      discipline?.red_cards_per_match,
      cards?.redPerMatch,
      cards?.red_cards_per_match
    ),

    foulPerMatch: readFirstNumber(
      data?.foulPerMatch,
      data?.foulsPerMatch,
      stats?.foulPerMatch,
      stats?.foulsPerMatch,
      profile?.foulPerMatch,
      profile?.foulsPerMatch
    ),

    penaltyPerMatch: readFirstNumber(
      data?.penaltyPerMatch,
      data?.penaltiesPerMatch,
      stats?.penaltyPerMatch,
      stats?.penaltiesPerMatch,
      profile?.penaltyPerMatch,
      profile?.penaltiesPerMatch
    ),

    sampleSize: readFirstNumber(
      data?.sampleSize,
      data?.matches,
      data?.games,
      stats?.sampleSize,
      stats?.matches,
      stats?.games,
      profile?.sampleSize,
      profile?.matches,
      profile?.games
    )
  };
}

function inferRefereeReliability(data = {}, stats = {}) {
  const hasName = !!normalizeName(data?.name);
  const hasDisciplineStats =
    stats?.yellowPerMatch != null ||
    stats?.redPerMatch != null ||
    stats?.foulPerMatch != null ||
    stats?.penaltyPerMatch != null;

  const sampleSize = toNumber(stats?.sampleSize);
  const hasUsableSample = sampleSize != null && sampleSize >= 3;

  if (!hasName) {
    return {
      reliability: "empty",
      hasName: false,
      hasDisciplineStats: false,
      hasUsableSample: false,
      sampleSize
    };
  }

  if (hasDisciplineStats || hasUsableSample) {
    return {
      reliability: "usable",
      hasName: true,
      hasDisciplineStats,
      hasUsableSample,
      sampleSize
    };
  }

  return {
    reliability: "identity_only",
    hasName: true,
    hasDisciplineStats: false,
    hasUsableSample: false,
    sampleSize
  };
}

function buildCanonicalRefereeProfile(data, provider, confidence = 0.65, reason = null, status = "success") {
  const name = normalizeName(data?.name);
  if (!name) {
    return {
      status: "unavailable",
      reason: reason || "missing_referee_name",
      confidence: 0,
      reliability: "empty",
      diagnostics: {
        provider,
        hasName: false,
        hasDisciplineStats: false,
        hasUsableSample: false,
        sampleSize: null,
        source: data?.source || null
      },
      data: null
    };
  }

  const stats = extractRefereeStats(data);
  const reliabilityMeta = inferRefereeReliability(data, stats);

  const resolvedReason =
    reason ||
    (reliabilityMeta.reliability === "identity_only"
      ? "referee_identity_without_stats"
      : null);

  const resolvedStatus =
    reliabilityMeta.reliability === "usable"
      ? status === "unavailable"
        ? "partial"
        : "success"
      : reliabilityMeta.reliability === "identity_only"
        ? "partial"
        : "unavailable";

  const resolvedConfidence =
    reliabilityMeta.reliability === "usable"
      ? confidence
      : reliabilityMeta.reliability === "identity_only"
        ? Math.min(confidence, 0.45)
        : 0;

  return {
    status: resolvedStatus,
    reason: resolvedReason,
    confidence: resolvedConfidence,
    reliability: reliabilityMeta.reliability,
    diagnostics: {
      provider,
      hasName: reliabilityMeta.hasName,
      hasDisciplineStats: reliabilityMeta.hasDisciplineStats,
      hasUsableSample: reliabilityMeta.hasUsableSample,
      sampleSize: reliabilityMeta.sampleSize,
      source: data?.source || null
    },
    data: {
      name,
      yellowPerMatch: stats.yellowPerMatch,
      redPerMatch: stats.redPerMatch,
      foulPerMatch: stats.foulPerMatch,
      penaltyPerMatch: stats.penaltyPerMatch,
      sampleSize: stats.sampleSize,
      provider,
      reliability: reliabilityMeta.reliability
    }
  };
}

function extractRefereeFromResearch(match = {}, context = {}) {
  const factData = context?.researchedFacts?.refereeProfile?.data;
  if (factData?.name) return factData;

  const ctxData = context?.refereeContext?.data;
  if (ctxData?.name) return ctxData;

  const research = context?.research || {};
  if (research?.refereeProfile?.name) return research.refereeProfile;
  if (research?.referee_profile?.name) return research.referee_profile;
  if (research?.referee?.name) return research.referee;

  const researchOfficials =
    research?.officials ||
    research?.matchOfficials ||
    [];

  const officialObj = pickRefereeObjectFromOfficials(researchOfficials);

  return {
    ...(officialObj || {}),
    name:
      normalizeName(officialObj?.name || officialObj?.displayName || officialObj?.fullName) ||
      match?.referee ||
      match?.sources?.espn?.referee ||
      match?.sources?.source2?.referee ||
      null
  };
}

function extractRefereeFromMatch(match = {}) {
  const espn = match?.sources?.espn || {};
  const source2 = match?.sources?.source2 || {};

  const localOfficiating =
    match?.sources?.localOfficiating ||
    match?.sources?.officiating ||
    match?.officiating ||
    {};

  const matchOfficials =
    match?.officials ||
    match?.matchOfficials ||
    [];

  const espnProfile = espn?.refereeProfile || {};
  const source2Profile = source2?.refereeProfile || {};
  const localProfile =
    localOfficiating?.refereeProfile ||
    localOfficiating?.referee ||
    localOfficiating?.payload?.referee ||
    {};

  const espnOfficial = pickRefereeObjectFromOfficials(espn?.officials);
  const source2Official = pickRefereeObjectFromOfficials(source2?.officials);
  const localOfficial =
    pickRefereeObjectFromOfficials(localOfficiating?.officials) ||
    pickRefereeObjectFromOfficials(localOfficiating?.payload?.officials) ||
    pickRefereeObjectFromOfficials(matchOfficials);

  const localNamed =
    buildNamedRefereeCandidate(localProfile) ||
    buildNamedRefereeCandidate(localOfficiating) ||
    buildNamedRefereeCandidate(localOfficiating?.payload) ||
    null;

  return {
    ...(source2Official || {}),
    ...(espnOfficial || {}),
    ...(localOfficial || {}),
    ...(espnProfile || {}),
    ...(source2Profile || {}),
    ...(localProfile || {}),
    ...(localNamed || {}),
    name:
      normalizeName(
        localProfile?.name ||
        localProfile?.displayName ||
        localProfile?.fullName ||
        localProfile?.refereeName
      ) ||
      normalizeName(
        localOfficial?.name ||
        localOfficial?.displayName ||
        localOfficial?.fullName
      ) ||
      normalizeName(
        localNamed?.name
      ) ||
      source2Profile?.name ||
      espnProfile?.name ||
      normalizeName(source2Official?.name || source2Official?.displayName || source2Official?.fullName) ||
      normalizeName(espnOfficial?.name || espnOfficial?.displayName || espnOfficial?.fullName) ||
      normalizeName(match?.referee || match?.refereeName) ||
      normalizeName(espn?.referee || espn?.refereeName) ||
      normalizeName(source2?.referee || source2?.refereeName) ||
      null
  };
}

export async function fetchRefereeResearchBridge(match, task, context = {}) {
  const extracted = extractRefereeFromResearch(match, context);
  const stats = extractRefereeStats(extracted);
  const reliabilityMeta = inferRefereeReliability(extracted, stats);

  return buildCanonicalRefereeProfile(
    extracted,
    "referee-research-bridge",
    reliabilityMeta.reliability === "usable" ? 0.78 : 0.62,
    reliabilityMeta.reliability === "identity_only"
      ? "referee_identity_without_stats"
      : null,
    reliabilityMeta.reliability === "usable" ? "success" : "partial"
  );
}

export async function fetchRefereeMatchFacts(match, task, context = {}) {
  const extracted = extractRefereeFromMatch(match);
  const stats = extractRefereeStats(extracted);
  const reliabilityMeta = inferRefereeReliability(extracted, stats);

  return buildCanonicalRefereeProfile(
    extracted,
    "referee-match-facts",
    reliabilityMeta.reliability === "usable" ? 0.69 : 0.54,
    reliabilityMeta.reliability === "identity_only"
      ? "referee_identity_without_stats"
      : null,
    reliabilityMeta.reliability === "usable" ? "success" : "partial"
  );
}
export async function fetchRefereeStub(match, task, context = {}) {
  return fetchRefereeMatchFacts(match, task, context);
}