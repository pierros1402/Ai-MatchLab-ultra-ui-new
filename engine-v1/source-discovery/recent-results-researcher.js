import crypto from "node:crypto";
import { knownLeaguePaths, resolveSlugFromPath } from "../odds/flashscore-league-map.js";
import { parseFlashscoreFeed } from "../odds/flashscore-fixtures-source.js";

const PATHS = Object.fromEntries(knownLeaguePaths().map(route => [resolveSlugFromPath(route), route]).filter(([slug]) => slug));

// Read the provider's embedded result feed as data. Never execute page scripts.
export function parseRecentResultEvidence(html, slug, nowMs) {
  const blocks = [...String(html).matchAll(/initialFeeds\[['"](?:summary-results|results)['"]\]\s*=\s*\{\s*data:\s*`([^`]+)`/g)];
  const candidates = blocks.flatMap(block => parseFlashscoreFeed(block[1]));
  const byId = new Map(), conflicts = new Set(), rejected = {};
  const reject = reason => { rejected[reason] = (rejected[reason] || 0) + 1; };
  for (const row of candidates) {
    const kickoff = Date.parse(row.kickoffUtc);
    if (resolveSlugFromPath(row.leaguePath) !== slug) { reject("COMPETITION_MISMATCH"); continue; }
    if (!row.playedFinal || row.statusDetailCode !== "3") { reject("REGULATION_FINAL_UNCONFIRMED"); continue; }
    if (!Number.isFinite(kickoff) || kickoff >= nowMs || kickoff < nowMs - 180 * 86400000) { reject("OUTSIDE_RECENT_PAST_WINDOW"); continue; }
    if (!/^[a-zA-Z0-9]{6,16}$/.test(row.matchId) || !row.home || !row.away || row.home === row.away) { reject("INVALID_RESULT_IDENTITY"); continue; }
    const result = { providerMatchId: row.matchId, leagueSlug: slug, home: row.home, away: row.away,
      kickoffUtc: row.kickoffUtc, scoreHome: row.scoreHome, scoreAway: row.scoreAway, status: "FT" };
    const old = byId.get(row.matchId);
    if (old && JSON.stringify(old) !== JSON.stringify(result)) conflicts.add(row.matchId);
    else byId.set(row.matchId, result);
  }
  for (const id of conflicts) { byId.delete(id); reject("PROVIDER_RESULT_CONFLICT"); }
  return { embeddedFeeds: blocks.length, parsedRows: candidates.length, rejected,
    rows: [...byId.values()].sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc)) };
}

export async function researchRecentResults(slug, { nowMs = Date.now(), fetchFn = fetch } = {}) {
  const route = PATHS[slug];
  const base = { schema: "ai-matchlab.recent-results-research.v1", leagueSlug: slug,
    acquiredAt: new Date(nowMs).toISOString(), source: "flashscore", authorityPromotionAllowed: false,
    valueInputVerified: false, canonicalWrites: 0 };
  if (!route) return { ...base, status: "SOURCE_ROUTE_UNAVAILABLE", rows: [] };
  const url = `https://www.flashscore.com${route}results/`;
  try {
    const response = await fetchFn(url, { signal: AbortSignal.timeout(12000), headers: { "user-agent": "Mozilla/5.0", accept: "text/html" } });
    if (!response.ok) return { ...base, url, status: "SOURCE_HTTP_ERROR", httpStatus: response.status, rows: [] };
    const html = await response.text();
    if (Buffer.byteLength(html) > 5 * 1024 * 1024) return { ...base, url, status: "SOURCE_RESPONSE_TOO_LARGE", rows: [] };
    const parsed = parseRecentResultEvidence(html, slug, nowMs);
    return { ...base, url, httpStatus: response.status, responseSha256: crypto.createHash("sha256").update(html).digest("hex"),
      status: parsed.rows.length ? "RESULTS_AWAIT_IDENTITY_VALIDATION" : parsed.embeddedFeeds ? "NO_ELIGIBLE_RECENT_RESULTS" : "SOURCE_FORMAT_UNRECOGNIZED",
      ...parsed };
  } catch (error) { return { ...base, url, status: "SOURCE_REQUEST_FAILED", error: error.message, rows: [] }; }
}
