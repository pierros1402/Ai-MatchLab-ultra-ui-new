import crypto from "node:crypto";
import { parseFlashscoreFeed } from "../odds/flashscore-fixtures-source.js";
import { resolveSlugFromPath } from "../odds/flashscore-league-map.js";
import { parseRecentResultEvidence } from "./recent-results-researcher.js";

// Team profiles are followed only from an exact, future canonical fixture's
// native provider identity. No fuzzy names, guessed URLs or source promotion.
export function selectTeamHistoryTargets(evidence, incidents, fixtures, attempts = {}, nowMs = Date.now(), limit = 2, resolveProviderIdentity = null) {
  const targets = new Map(), unresolved = [];
  const anchors = [...(evidence.rows || []), ...(evidence.upcomingAnchors || [])];
  for (const incident of incidents) {
    if (!(Date.parse(incident.kickoffUtc) > nowMs)) continue;
    const canonical = fixtures.filter(f => f.canonicalId === incident.canonicalId);
    if (canonical.length !== 1) { unresolved.push({ canonicalId: incident.canonicalId, reason: "CANONICAL_IDENTITY_NOT_UNIQUE" }); continue; }
    const fixture = canonical[0];
    const ids = [fixture.providerIds?.flashscore, fixture.source === "flashscore" ? fixture.sourceMatchId || fixture.sourceId : null].filter(Boolean);
    const matched = anchors.map(a => {
      const exact = ids.length && ids.every(id => id === a.providerMatchId)
      && a.leagueSlug === fixture.leagueSlug && Date.parse(a.kickoffUtc) === Date.parse(fixture.kickoffUtc)
      && a.home === fixture.homeTeam && a.away === fixture.awayTeam;
      const proof = !exact && resolveProviderIdentity ? resolveProviderIdentity(a, fixture) : null;
      return exact || proof ? { anchor: a, proof } : null;
    }).filter(Boolean);
    if (matched.length !== 1 || fixture.hasConflict === true) { unresolved.push({ canonicalId: incident.canonicalId, reason: "EXACT_NATIVE_TEAM_ANCHOR_UNAVAILABLE" }); continue; }
    for (const side of ["home", "away"]) {
      if (Number(incident.modelInputDiagnosis?.[`${side}Sample`]) >= 6) continue;
      const providerTeamId = matched[0].anchor[`${side}ProviderTeamId`], providerTeamSlug = matched[0].anchor[`${side}ProviderTeamSlug`];
      if (!/^[A-Za-z0-9]{6,16}$/.test(providerTeamId || "") || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(providerTeamSlug || "")) {
        unresolved.push({ canonicalId: incident.canonicalId, side, reason: "NATIVE_TEAM_ROUTE_UNAVAILABLE" }); continue;
      }
      const key = `${fixture.leagueSlug}|${providerTeamId}`;
      const target = { key, providerTeamId, providerTeamSlug, leagueSlug: fixture.leagueSlug, team: fixture[`${side}Team`],
        canonicalId: fixture.canonicalId, providerMatchId: matched[0].anchor.providerMatchId, kickoffUtc: fixture.kickoffUtc,
        ...(matched[0].proof ? { identityProof: matched[0].proof } : {}),
        previousAttemptAt: attempts[key]?.attemptedAt || null };
      const old = targets.get(key);
      if (!old || Date.parse(target.kickoffUtc) < Date.parse(old.kickoffUtc)) targets.set(key, target);
    }
  }
  const ordered = [...targets.values()].sort((a, b) => {
    const priority = t => Date.parse(t.kickoffUtc) - nowMs <= 86400000 ? 0 : 1;
    return priority(a) - priority(b) || (Date.parse(a.previousAttemptAt) || 0) - (Date.parse(b.previousAttemptAt) || 0)
      || Date.parse(a.kickoffUtc) - Date.parse(b.kickoffUtc) || a.key.localeCompare(b.key);
  });
  const effectiveLimit = Math.min(2, Math.max(0, Math.floor(Number(limit) || 0)));
  return { targets: ordered.slice(0, effectiveLimit), deferred: Math.max(0, ordered.length - effectiveLimit), unresolved };
}

export async function researchTeamHistory(target, { nowMs = Date.now(), fetchFn = fetch } = {}) {
  if (!/^[A-Za-z0-9]{6,16}$/.test(target.providerTeamId || "") || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(target.providerTeamSlug || "")) throw new Error("invalid_team_history_route");
  const url = `https://www.flashscore.com/team/${target.providerTeamSlug}/${target.providerTeamId}/results/`;
  const base = { schema: "ai-matchlab.team-history-research.v1", target, url, acquiredAt: new Date(nowMs).toISOString(),
    canonicalWrites: 0, valueInputVerified: false, authorityPromotionAllowed: false, documents: [] };
  try {
    const response = await fetchFn(url, { signal: AbortSignal.timeout(12000), headers: { "user-agent": "Mozilla/5.0", accept: "text/html" } });
    if (!response.ok) return { ...base, status: "SOURCE_HTTP_ERROR", httpStatus: response.status };
    const html = await response.text();
    if (Buffer.byteLength(html) > 5 * 1024 * 1024) return { ...base, status: "SOURCE_RESPONSE_TOO_LARGE" };
    const blocks = [...html.matchAll(/initialFeeds\[['"](?:summary-results|results)['"]\]\s*=\s*\{\s*data:\s*`([^`]*)`/g)];
    if (!blocks.length) return { ...base, status: "SOURCE_FORMAT_UNRECOGNIZED" };
    const raw = blocks.flatMap(b => parseFlashscoreFeed(b[1]));
    const teamRows = raw.filter(r => [r.homeProviderTeamId, r.awayProviderTeamId].includes(target.providerTeamId));
    if (raw.length && !teamRows.length) return { ...base, status: "TEAM_PROFILE_IDENTITY_MISMATCH" };
    const recent = teamRows.filter(r => r.playedFinal && r.statusDetailCode === "3" && Date.parse(r.kickoffUtc) < nowMs && Date.parse(r.kickoffUtc) >= nowMs - 180 * 86400000);
    const unmapped = [...new Set(recent.filter(r => !resolveSlugFromPath(r.leaguePath)).map(r => r.leaguePath || r.leagueName))];
    const responseSha256 = crypto.createHash("sha256").update(html).digest("hex");
    const documents = [...new Set(recent.map(r => resolveSlugFromPath(r.leaguePath)).filter(Boolean))].map(leagueSlug => {
      const parsed = parseRecentResultEvidence(html, leagueSlug, nowMs);
      return { schema: "ai-matchlab.recent-results-research.v1", source: "flashscore", status: "RESULTS_AWAIT_IDENTITY_VALIDATION",
        leagueSlug, acquiredAt: base.acquiredAt, url, responseSha256, teamBinding: target, canonicalWrites: 0,
        authorityPromotionAllowed: false, valueInputVerified: false,
        rows: parsed.rows.filter(r => [r.homeProviderTeamId, r.awayProviderTeamId].includes(target.providerTeamId)), upcomingAnchors: [] };
    }).filter(d => d.rows.length);
    return { ...base, status: documents.length ? "TEAM_RESULTS_AWAIT_CANONICAL_FINAL_VALIDATION" : unmapped.length ? "TEAM_HISTORY_COMPETITION_ADMISSION_REQUIRED" : "NO_ELIGIBLE_RECENT_RESULTS",
      responseSha256, observedRecentResults: new Set(recent.map(r => r.matchId)).size, unmappedCompetitions: unmapped, documents,
      completenessClaim: "visible_profile_feed_only" };
  } catch (error) { return { ...base, status: "SOURCE_REQUEST_FAILED", error: error.message }; }
}
