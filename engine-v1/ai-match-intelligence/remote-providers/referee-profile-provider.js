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

function buildCanonicalRefereeProfile(data, provider, confidence = 0.65, reason = null, status = "success") {
  const name = normalizeName(data?.name);
  if (!name) {
    return {
      status: "unavailable",
      reason: reason || "missing_referee_name",
      confidence: 0,
      data: null
    };
  }

  const stats = extractRefereeStats(data);

  return {
    status,
    reason,
    confidence,
    data: {
      name,
      yellowPerMatch: stats.yellowPerMatch,
      redPerMatch: stats.redPerMatch,
      foulPerMatch: stats.foulPerMatch,
      penaltyPerMatch: stats.penaltyPerMatch,
      sampleSize: stats.sampleSize,
      provider
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

  const espnProfile = espn?.refereeProfile || {};
  const source2Profile = source2?.refereeProfile || {};

  const espnOfficial = pickRefereeObjectFromOfficials(espn?.officials);
  const source2Official = pickRefereeObjectFromOfficials(source2?.officials);

  return {
    ...(source2Official || {}),
    ...(espnOfficial || {}),
    ...(espnProfile || {}),
    ...(source2Profile || {}),
    name:
      source2Profile?.name ||
      espnProfile?.name ||
      normalizeName(source2Official?.name || source2Official?.displayName || source2Official?.fullName) ||
      normalizeName(espnOfficial?.name || espnOfficial?.displayName || espnOfficial?.fullName) ||
      match?.referee ||
      espn?.referee ||
      source2?.referee ||
      null
  };
}

export async function fetchRefereeResearchBridge(match, task, context = {}) {
  const extracted = extractRefereeFromResearch(match, context);
  const stats = extractRefereeStats(extracted);

  return buildCanonicalRefereeProfile(
    extracted,
    "referee-research-bridge",
    stats.yellowPerMatch != null || stats.sampleSize != null ? 0.78 : 0.62,
    null,
    stats.yellowPerMatch != null || stats.sampleSize != null ? "success" : "partial"
  );
}

export async function fetchRefereeMatchFacts(match, task, context = {}) {
  const extracted = extractRefereeFromMatch(match);
  const stats = extractRefereeStats(extracted);

  return buildCanonicalRefereeProfile(
    extracted,
    "referee-match-facts",
    stats.yellowPerMatch != null || stats.sampleSize != null ? 0.69 : 0.54,
    null,
    stats.yellowPerMatch != null || stats.sampleSize != null ? "success" : "partial"
  );
}

export async function fetchRefereeStub(match, task, context = {}) {
  return {
    status: "unavailable",
    reason: "provider_contract_ready_no_live_source",
    confidence: 0,
    data: null
  };
}