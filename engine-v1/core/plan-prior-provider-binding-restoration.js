import { buildCanonicalId } from "./canonical-id.js";
import { athensDayFromKickoff } from "./daykey.js";
const text = v => String(v ?? "").trim();
const cid = c => text(c.canonicalId || c.matchId);
const token = v => /^[a-zA-Z0-9]{6,16}$/.test(v || "");
function providerId(c, provider) {
  const values = [c.providerIds?.[provider],
    ...(c.source === provider ? [c.sourceId, c.sourceMatchId] : [])].map(text).filter(Boolean);
  return new Set(values).size === 1 ? values[0] : "";
}
function lineage(a, b) {
  return cid(a) === cid(b) || (a.canonicalAliases || []).includes(cid(b)) ||
    (b.canonicalAliases || []).includes(cid(a));
}

// Restore a previously committed explicit ID; never infer a new match binding
// from names, counts, scores, or proximity, and never recreate a removed row.
export function planPriorProviderBindingRestoration({ canonicalFixtures = [], discovery, history } = {}) {
  if (history?.schema !== "ai-matchlab.prior-explicit-provider-fixture-bindings.v1" ||
    discovery?.fixtureIdentitySchema !== "ai-matchlab.provider-fixture-identity.v1" ||
    history.dayKey !== discovery.dayKey) throw new Error("prior_binding_source_contract_required");
  const fixtures = canonicalFixtures.map(c => ({ ...c })), changes = [], rejected = [];
  for (const record of history.records || []) {
    const old = record.row || {}, fsid = record.providerFixtureId;
    const reject = reason => rejected.push({ providerFixtureId: fsid, canonicalId: cid(old), reason });
    if (!/^[a-f0-9]{40}$/.test(record.sourceCommit || "") ||
      !/^[a-f0-9]{40}$/.test(record.sourceBlobSha || "") ||
      record.sourcePath !== `data/canonical-fixtures/${history.dayKey}/${old.leagueSlug}.json` ||
      providerId(old, "flashscore") !== fsid || !token(fsid)) {
      reject("invalid_prior_explicit_provider_evidence"); continue;
    }
    const observations = discovery.fixtures.filter(f => f.provider === "flashscore" && f.providerFixtureId === fsid);
    const matches = fixtures.filter(c => c.leagueSlug === old.leagueSlug && lineage(c, old));
    if (matches.length !== 1 || observations.length !== 1 ||
      history.records.filter(r => r.providerFixtureId === fsid).length !== 1) {
      reject(matches.length ? "ambiguous_prior_binding" : "canonical_fixture_absent"); continue;
    }
    const c = matches[0], f = observations[0];
    const espn = providerId(c, "espn"), oldEspn = providerId(old, "espn");
    const primaryIdentityMatches = espn && espn === oldEspn ||
      c.source === "flashscore" && old.source === "flashscore" && providerId(c, "flashscore") === fsid;
    if (!primaryIdentityMatches || espn && oldEspn && espn !== oldEspn ||
      c.hasConflict === true || c.providerTeamIdentityConflict === true ||
      c.leagueSlug !== f.canonicalSlug || c.dayKey !== history.dayKey || old.dayKey !== history.dayKey ||
      f.dayKey !== history.dayKey || f.eligibility !== "eligible" ||
      !Number.isFinite(Date.parse(c.kickoffUtc)) || Date.parse(c.kickoffUtc) !== Date.parse(old.kickoffUtc) ||
      !Number.isFinite(Date.parse(f.kickoffUtc)) || athensDayFromKickoff(f.kickoffUtc) !== history.dayKey ||
      athensDayFromKickoff(c.kickoffUtc) !== history.dayKey ||
      c.providerIds?.flashscore && c.providerIds.flashscore !== fsid) {
      reject("current_primary_identity_conflict"); continue;
    }
    if (["home", "away"].some(side => {
      const previous = old.providerTeamIds?.espn?.[side], current = c.providerTeamIds?.espn?.[side];
      return previous && current && previous !== current;
    })) { reject("native_primary_side_conflict"); continue; }
    const aliasIds = new Set([cid(old), cid(c), ...(old.canonicalAliases || []), ...(c.canonicalAliases || [])]);
    const orderedProviderAlias = buildCanonicalId(f.canonicalSlug, f.home?.name, f.away?.name, f.dayKey);
    if (!aliasIds.has(orderedProviderAlias) || !token(f.home?.providerTeamId) || !token(f.away?.providerTeamId) ||
      f.home.providerTeamId === f.away.providerTeamId) { reject("ordered_provider_alias_conflict"); continue; }
    const pair = { home: f.home.providerTeamId, away: f.away.providerTeamId };
    if (c.providerTeamIds?.flashscore && ["home", "away"].some(s => c.providerTeamIds.flashscore[s] !== pair[s])) {
      reject("existing_native_identity_conflict"); continue;
    }
    if (c.providerIds?.flashscore === fsid && c.providerTeamIds?.flashscore) continue;
    c.providerIds = { ...c.providerIds, flashscore: fsid };
    c.providerTeamIds = { ...c.providerTeamIds, flashscore: pair };
    if (!c.providerIdentityLink && old.providerIdentityLink) c.providerIdentityLink = old.providerIdentityLink;
    c.priorProviderBindingRestoration = { schema: "ai-matchlab.prior-provider-binding-restoration.v1",
      policy: "EXPLICIT_COMMITTED_PROVIDER_ID_AND_CANONICAL_ALIAS_ONLY",
      providerFixtureId: fsid, primaryEspnMatchId: espn || null,
      sourceCommit: record.sourceCommit, sourcePath: record.sourcePath, sourceBlobSha: record.sourceBlobSha,
      historicalCanonicalId: cid(old), orderedProviderAlias,
      discoveryHash: discovery.hash, observedAt: discovery.generatedAt,
      providerKickoffUtc: f.kickoffUtc, canonicalKickoffUnchanged: true };
    changes.push({ providerFixtureId: fsid, canonicalId: cid(c), sourceCommit: record.sourceCommit });
  }
  return { fixtures, changes, rejected };
}
