import { athensDayFromKickoff } from "./daykey.js";
import { PROVIDER_FIXTURE_IDENTITY_SCHEMA } from "./provider-fixture-identity.js";

const text = v => v == null ? "" : String(v).trim();
const cid = row => text(row?.canonicalId || row?.matchId || row?.basic?.canonicalId || row?.basic?.matchId || row?.fileCanonicalId);
const slug = row => text(row?.leagueSlug);
const rows = value => Array.isArray(value) ? value : [];

// Only explicit namespaced provider IDs are admissible bindings.
function providerId(row, provider) {
  return text(row?.providerIds?.[provider] ||
    (row?.source === provider ? row?.sourceId || row?.sourceMatchId : null));
}

function fixtureDay(row) {
  try {
    return row?.kickoffUtc ? athensDayFromKickoff(row.kickoffUtc) : text(row?.dayKey);
  } catch { return ""; }
}

export function buildProviderFixtureCoverage({
  dayKey, discovery, canonicalFixtures = [], publishedFixtures = [],
  publishedDetails = [], now = new Date().toISOString(),
  maxAgeMs = 24 * 60 * 60 * 1000
} = {}) {
  const issues = [];
  const bindings = [];
  const discoveryAgeMs = Date.parse(now) - Date.parse(discovery?.generatedAt);
  function add(reasonCode, fixture = {}, canonical = null, artifact = "competition-discovery") {
    issues.push({
      reasonCode, severity: "error", provider: fixture.provider || "flashscore",
      dayKey, leagueSlug: fixture.canonicalSlug || slug(canonical) || null,
      providerCompetitionId: fixture.providerCompetitionId || null,
      providerFixtureId: fixture.providerFixtureId || null,
      canonicalId: cid(canonical) || null,
      description: reasonCode.replaceAll("_", " "),
      affectedArtifact: artifact === "deploy-snapshots"
        ? `data/deploy-snapshots/${dayKey}/fixtures.json`
        : artifact === "details" ? `data/deploy-snapshots/${dayKey}/details/${cid(canonical)}.json`
          : `data/${artifact}/${dayKey}${artifact === "competition-discovery" ? ".json" : ""}`,
      freshness: { generatedAt: discovery?.generatedAt || null,
        ageMs: Number.isFinite(discoveryAgeMs) ? discoveryAgeMs : null, maxAgeMs },
      recoveryAction: "Refresh independent discovery and reconcile exact namespaced provider IDs; review source evidence before changing canonical truth."
    });
  }
  if (!discovery) add("provider_discovery_missing");
  else if (discovery.ok !== true) add("provider_discovery_outage");
  else if (discovery.dayKey !== dayKey) add("provider_discovery_wrong_day");
  else if (!Number.isFinite(discoveryAgeMs) || discoveryAgeMs < -60000 || discoveryAgeMs > maxAgeMs)
    add("provider_discovery_stale");
  else if (discovery.fixtureIdentitySchema !== PROVIDER_FIXTURE_IDENTITY_SCHEMA ||
    !Array.isArray(discovery.fixtures)) add("provider_fixture_identity_contract_missing");

  if (issues.length) return result();
  const observations = discovery.fixtures.filter(f => f.dayKey === dayKey);
  const byProvider = new Map();
  for (const f of observations) {
    const key = `${f.provider}|${f.providerFixtureId}`;
    if (!byProvider.has(key)) byProvider.set(key, []);
    byProvider.get(key).push(f);
  }
  for (const duplicates of byProvider.values()) {
    if (duplicates.length > 1) add("duplicate_provider_fixture_id", duplicates[0]);
  }
  const canonical = rows(canonicalFixtures);
  const published = rows(publishedFixtures);
  const details = rows(publishedDetails);
  for (const f of observations.filter(f => f.eligibility === "eligible")) {
    if (!f.providerFixtureId) { add("provider_fixture_id_missing", f); continue; }
    if (!f.identityComplete) { add("provider_fixture_identity_incomplete", f); continue; }
    const matches = canonical.filter(c => providerId(c, f.provider) === f.providerFixtureId);
    if (!matches.length) { add("missing_canonical_binding", f, null, "canonical-fixtures"); continue; }
    if (matches.length !== 1) { add("ambiguous_canonical_binding", f, matches[0], "canonical-fixtures"); continue; }
    const c = matches[0];
    if (!cid(c)) { add("canonical_fixture_id_missing", f, c, "canonical-fixtures"); continue; }
    if (fixtureDay(c) !== dayKey) add("wrong_day_fixture", f, c, "canonical-fixtures");
    if (slug(c) !== f.canonicalSlug) add("wrong_league_fixture", f, c, "canonical-fixtures");
    const teams = c.providerTeamIds?.[f.provider];
    // Names are descriptive evidence; never use them as identity bindings.
    if (!teams?.home || !teams?.away || !f.home?.providerTeamId || !f.away?.providerTeamId)
      add("provider_team_identity_unverified", f, c, "canonical-fixtures");
    else if (text(teams.home) !== f.home.providerTeamId || text(teams.away) !== f.away.providerTeamId)
      add("home_away_identity_conflict", f, c, "canonical-fixtures");
    bindings.push({ provider: f.provider, providerFixtureId: f.providerFixtureId, canonicalId: cid(c) });
    const pub = published.filter(p => cid(p) === cid(c));
    if (!pub.length) add("missing_published_fixture", f, c, "deploy-snapshots");
    else if (pub.length > 1) add("duplicate_published_fixture", f, c, "deploy-snapshots");
    else {
      if (fixtureDay(pub[0]) !== dayKey) add("published_wrong_day_fixture", f, c, "deploy-snapshots");
      if (slug(pub[0]) !== f.canonicalSlug) add("published_wrong_league_fixture", f, c, "deploy-snapshots");
      const explicit = providerId(pub[0], f.provider);
      if (explicit && explicit !== f.providerFixtureId) add("published_provider_identity_conflict", f, c, "deploy-snapshots");
    }
    const detail = details.filter(d => cid(d) === cid(c));
    if (!detail.length) add("missing_published_details", f, c, "details");
    else if (detail.length > 1) add("duplicate_published_details", f, c, "details");
    else {
      const basic = detail[0].basic || detail[0];
      if (basic.leagueSlug && basic.leagueSlug !== f.canonicalSlug)
        add("details_wrong_league_fixture", f, c, "details");
      if ((basic.kickoffUtc || basic.dayKey) && fixtureDay(basic) !== dayKey)
        add("details_wrong_day_fixture", f, c, "details");
    }
  }
  // Publication may contain canonical fixtures acquired from other providers.
  // They are legitimate if they have an exact canonical ID in today's universe.
  for (const p of published) {
    if (!canonical.some(c => cid(c) && cid(c) === cid(p) && fixtureDay(c) === dayKey))
      add("unexpected_published_fixture", {}, p, "deploy-snapshots");
    if (!details.some(d => cid(d) && cid(d) === cid(p)))
      if (!issues.some(i => i.reasonCode === "missing_published_details" && i.canonicalId === cid(p)))
        add("missing_published_details", {}, p, "details");
  }
  return result();

  function result() {
    return { schema: "ai-matchlab.provider-fixture-coverage.v1", dayKey,
      generatedAt: now, discoveryHash: discovery?.hash || null,
      ok: issues.length === 0, proven: issues.length === 0,
      summary: { observations: rows(discovery?.fixtures).length,
        eligible: rows(discovery?.fixtures).filter(f => f.dayKey === dayKey && f.eligibility === "eligible").length,
        bound: bindings.length, issues: issues.length },
      bindings, issues };
  }
}

export function collectProviderFixtureCoverageIssues(coverage) {
  if (!coverage) return [];
  return rows(coverage.issues).map(detail => ({
    severity: detail.severity, source: "provider-fixture-identity",
    type: detail.reasonCode, message: detail.description, details: detail
  }));
}
