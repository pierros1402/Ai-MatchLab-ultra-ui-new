import { athensDayFromKickoff } from "./daykey.js";

const text = v => String(v ?? "").trim();
const name = v => text(v).toLowerCase().replace(/\s+/g, " ");
const id = c => text(c.canonicalId || c.matchId);

// Proposals only: no filesystem writes, score/status changes, alias inference,
// cross-provider linking, or overwriting existing native identity.
export function planNativeProviderTeamIdentityBackfill({ discovery, canonicalFixtures = [] } = {}) {
  if (discovery?.ok !== true || discovery.fixtureIdentitySchema !== "ai-matchlab.provider-fixture-identity.v1")
    throw new Error("native_identity_backfill_discovery_contract_missing");
  const observations = (discovery.fixtures || []).filter(f => f.eligibility === "eligible");
  const changes = [];
  const rejected = [];
  const result = canonicalFixtures.map(c => {
    const providerFixtureId = text(c.providerIds?.flashscore ||
      (c.source === "flashscore" ? c.sourceId || c.sourceMatchId : ""));
    if (!providerFixtureId) return c;
    const f = observations.filter(f => f.provider === "flashscore" && f.providerFixtureId === providerFixtureId);
    if (!f.length) return c;
    const reject = reason => { rejected.push({ canonicalId: id(c), providerFixtureId, reason }); return c; };
    const explicitIds = [c.providerIds?.flashscore,
      ...(c.source === "flashscore" ? [c.sourceId, c.sourceMatchId] : [])].map(text).filter(Boolean);
    if (new Set(explicitIds).size !== 1) return reject("conflicting_provider_fixture_ids");
    if (canonicalFixtures.filter(other => id(other) === id(c)).length !== 1)
      return reject("ambiguous_canonical_id");
    if (f.length !== 1 || canonicalFixtures.filter(other =>
      text(other.providerIds?.flashscore || (other.source === "flashscore" ? other.sourceId || other.sourceMatchId : "")) === providerFixtureId
    ).length !== 1) return reject("ambiguous_exact_fixture_id");
    const fixture = f[0];
    if (c.providerTeamIdentityConflict === true) return reject("quarantined_identity");
    if (c.providerTeamIds?.flashscore) return c;
    if (!id(c) || c.leagueSlug !== fixture.canonicalSlug) return reject("league_mismatch");
    if (!Number.isFinite(Date.parse(c.kickoffUtc)) ||
      Date.parse(c.kickoffUtc) !== Date.parse(fixture.kickoffUtc) ||
      athensDayFromKickoff(c.kickoffUtc) !== discovery.dayKey ||
      fixture.dayKey !== discovery.dayKey || c.dayKey !== discovery.dayKey)
      return reject("day_or_kickoff_mismatch");
    if (!name(c.homeTeam) || !name(c.awayTeam) ||
      name(c.homeTeam) !== name(fixture.home?.name) || name(c.awayTeam) !== name(fixture.away?.name))
      return reject("side_identity_mismatch");
    const home = text(fixture.home?.providerTeamId), away = text(fixture.away?.providerTeamId);
    if (!home || !away || home === away) return reject("native_pair_missing_or_invalid");
    const evidence = {
      schema: "ai-matchlab.exact-native-provider-team-identity-backfill.v1",
      provider: "flashscore", providerFixtureId,
      providerCompetitionId: fixture.providerCompetitionId,
      canonicalId: id(c), leagueSlug: c.leagueSlug,
      dayKey: discovery.dayKey, kickoffUtc: fixture.kickoffUtc,
      discoveryHash: discovery.hash, observedAt: discovery.generatedAt,
      exactProviderFixtureId: true, exactSides: true, canonicalTruthUnchanged: true
    };
    changes.push({ canonicalId: id(c), providerFixtureId, home, away, evidence });
    return { ...c, providerTeamIds: { ...c.providerTeamIds, flashscore: { home, away } },
      providerTeamIdentityEvidence: { ...c.providerTeamIdentityEvidence, flashscore: evidence } };
  });
  return { fixtures: result, changes, rejected };
}
