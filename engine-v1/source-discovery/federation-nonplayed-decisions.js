// Exceptional, source-bound historical correction registry. Not a general
// external-report self-grant; each entry requires a separately reviewed code change.
const decisions = Object.freeze([
  Object.freeze({
    dayKey: "2026-10-30",
    canonicalId: "cid_syr1_foutoua_aljaish_20261030",
    providerId: "KdKrgosB",
    leagueSlug: "syr.1",
    homeTeam: "Foutoua",
    awayTeam: "Al Jaish",
    originalKickoffUtc: "2026-10-30T12:00:00.000Z",
    rescheduledDayKey: "2026-11-01",
    rescheduledCanonicalId: "cid_syr1_foutoua_aljaish_20261101",
    rescheduledKickoffUtc: "2026-11-01T12:00:00.000Z",
    terminalStatus: "STATUS_POSTPONED",
    evidence: Object.freeze([
      "https://furat.alwehda.gov.sy/?p=204770",
      "https://alikhbariah.com/%D8%AA%D8%A3%D8%AC%D9%8A%D9%84-%D9%85%D8%A8%D8%A7%D8%B1%D8%A7%D8%A9-%D9%86%D8%A7%D8%AF%D9%8A-%D8%A7%D9%84%D9%81%D8%AA%D9%88%D8%A9-%D9%88%D8%A7%D9%84%D8%AC%D9%8A%D8%B4-%D8%A8%D8%B3%D8%A8%D8%A8-%D8%A7/"
    ])
  })
]);
const missingScore = x => x === null || x === undefined;
const id = x => String(x?.canonicalId || x?.matchId || "");
const final = x => ["FT", "FINAL", "STATUS_FINAL"].includes(String(x?.status || "").toUpperCase());
const verifiedRescheduledShape = row =>
  (missingScore(row.scoreHome) && missingScore(row.scoreAway) && row.status === "STATUS_SCHEDULED") ||
  (row.status === "FT" && row.rawStatus === "STATUS_FINAL" &&
    Number.isInteger(row.scoreHome) && row.scoreHome >= 0 &&
    Number.isInteger(row.scoreAway) && row.scoreAway >= 0);

export function resolveFederationNonPlayedDecision({ day, published, canonical, rescheduled }) {
  if (!published || !canonical || !rescheduled) return null;
  const matching = decisions.filter(d =>
    d.dayKey === day &&
    d.canonicalId === id(published) &&
    d.canonicalId === id(canonical) &&
    d.rescheduledCanonicalId === id(rescheduled) &&
    d.providerId === published.sourceId &&
    d.providerId === canonical.sourceId &&
    d.providerId === rescheduled.sourceId &&
    d.leagueSlug === canonical.leagueSlug &&
    d.leagueSlug === published.leagueSlug &&
    d.leagueSlug === rescheduled.leagueSlug &&
    d.homeTeam === canonical.homeTeam &&
    d.homeTeam === published.homeTeam &&
    d.homeTeam === rescheduled.homeTeam &&
    d.awayTeam === canonical.awayTeam &&
    d.awayTeam === published.awayTeam &&
    d.awayTeam === rescheduled.awayTeam &&
    d.originalKickoffUtc === published.kickoffUtc &&
    d.originalKickoffUtc === canonical.kickoffUtc &&
    d.rescheduledKickoffUtc === rescheduled.kickoffUtc &&
    d.rescheduledDayKey === rescheduled.dayKey &&
    published.status === "STATUS_SCHEDULED" &&
    canonical.status === d.terminalStatus &&
    canonical.rawStatus === d.terminalStatus &&
    canonical.statusType === d.terminalStatus &&
    !final(published) && !final(canonical) &&
    [published, canonical].every(r => missingScore(r.scoreHome) && missingScore(r.scoreAway)) &&
    verifiedRescheduledShape(rescheduled) &&
    canonical.statusCorrection?.decisionId === "foutoua-aljaish-federation-reschedule-20261029-v1" &&
    canonical.statusCorrection?.providerNativeStatusCodeVerified === false &&
    canonical.statusCorrection?.policyVersion === "federation-nonplayed-exact-reviewed-v1" &&
    canonical.statusCorrection?.publicationAuthorized === true &&
    canonical.statusCorrection?.rescheduledMatch?.providerMatchId === d.providerId
  );
  return matching.length === 1 ? { ...matching[0], evidence: [...matching[0].evidence] } : null;
}
