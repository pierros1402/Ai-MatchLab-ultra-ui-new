import fs from "node:fs";
import path from "node:path";
import { resolveDataPath } from "../storage/data-root.js";
import { canonicalFixturesForDay } from "./day-fixture-universe.js";
import { athensDayFromKickoff } from "./daykey.js";
import { buildVerifiedHistoryDay } from "../jobs/append-finalized-day-to-history.js";
import { applyProviderTeamContinuity } from "./prematch-provider-team-continuity.js";

// Research locates candidates; only committed canonical + verified-final parity
// grants model eligibility. This never writes canonical truth or season history.
export function validatePrematchFinalForm(candidate, canonical, final, nowMs) {
  const deny = reason => ({ ok: false, reason });
  if (!canonical || !final) return deny("CANONICAL_OR_VERIFIED_FINAL_MISSING");
  const id = canonical.canonicalId;
  const kickoff = Date.parse(canonical.kickoffUtc);
  if (!Number.isFinite(kickoff) || kickoff >= nowMs || kickoff < nowMs - 180 * 86400000) return deny("OUTSIDE_RECENT_PAST_WINDOW");
  if (!/^cid_[a-zA-Z0-9_]+$/.test(id || "") || final.matchId !== id || final.schema !== "ai-matchlab.verified-final-result.v1") return deny("FINAL_IDENTITY_MISMATCH");
  const generated = Date.parse(final.generatedAt || final.verification?.generatedAt);
  if (!Number.isFinite(generated) || generated < kickoff || generated > nowMs) return deny("FINAL_AVAILABILITY_UNCONFIRMED");
  if (canonical.homeTeam !== final.homeTeam || canonical.awayTeam !== final.awayTeam || canonical.leagueSlug !== final.leagueSlug
    || canonical.leagueSlug !== candidate.leagueSlug || Date.parse(final.kickoffUtc) !== kickoff || Date.parse(candidate.kickoffUtc) !== kickoff) return deny("EXACT_FINAL_METADATA_MISMATCH");
  const providerIds = [canonical.providerIds?.flashscore, canonical.source === "flashscore" ? canonical.sourceMatchId || canonical.sourceId : null].filter(Boolean);
  if (!providerIds.length || providerIds.some(value => value !== candidate.providerMatchId)) return deny("EXACT_PROVIDER_ID_REQUIRED");
  if (candidate.scoreHome !== final.scoreHome || candidate.scoreAway !== final.scoreAway) return deny("RESEARCH_FINAL_SCORE_CONFLICT");
  for (const side of ["home", "away"]) {
    const key = `${side}GlobalClubId`;
    if (final[key] && canonical[key] !== final[key]) return deny("GLOBAL_ID_CONFLICT");
  }
  // Restrict this new path to regulation finals. AET/PEN require their existing
  // score-semantics resolver, never a guessed 90-minute score.
  const statuses = [canonical.status, canonical.statusType, canonical.rawStatus].filter(Boolean);
  if (!statuses.length || statuses.some(value => !["FT", "STATUS_FINAL", "STATUS_FULL_TIME", "FINISHED"].includes(value))) return deny("REGULATION_FINAL_REQUIRED");
  const verdicts = [final.verdict, final.finalTruthVerdict, final.verification?.verdict, final.verification?.state].filter(Boolean);
  if (!verdicts.length || verdicts.some(value => value !== "verified_final_result")) return deny("VERIFIED_FINAL_VERDICT_REQUIRED");
  const dayKey = athensDayFromKickoff(canonical.kickoffUtc);
  const built = buildVerifiedHistoryDay({ dayKey, canonicalRows: [canonical], finalResultRows: [final], rebuiltAt: nowMs });
  if (!built.ok || built.rows.length !== 1) return deny(built.errors?.[0]?.reason || built.reason);
  return { ok: true, row: { ...built.rows[0], homeGlobalClubId: canonical.homeGlobalClubId,
    awayGlobalClubId: canonical.awayGlobalClubId, source: "prematch_exact_verified_final",
    providerMatchId: candidate.providerMatchId, verifiedFinalGeneratedAt: new Date(generated).toISOString() } };
}

export function collectPrematchFinalForm(baseIndex, candidates, nowMs, { fixturesForDay, finalForFixture, anchors = [] }) {
  const index = {}, byDay = new Map(), knownIds = new Map(), knownPairs = new Set(), seen = new Set();
  const validated = [], replacedCanonicalIds = [];
  const summary = { candidates: candidates.length, accepted: 0, alreadyIndexed: 0, rejected: {}, rejectedExamples: {}, acceptedCanonicalIds: [] };
  const pairKey = row => [row.leagueSlug, Date.parse(row.kickoff || row.kickoffUtc), row.homeTeam, row.awayTeam].join("|");
  for (const entry of Object.values(baseIndex)) for (const row of entry.matches || []) {
    knownIds.set(row.canonicalId || row.matchId || row.id, row); knownPairs.add(pairKey(row));
  }
  for (const candidate of candidates) {
    const key = `${candidate.leagueSlug}|${candidate.providerMatchId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const timestamp = Date.parse(candidate.kickoffUtc);
    if (!Number.isFinite(timestamp) || timestamp >= nowMs || timestamp < nowMs - 180 * 86400000) continue;
    const day = athensDayFromKickoff(candidate.kickoffUtc);
    if (!byDay.has(day)) byDay.set(day, fixturesForDay(day));
    const matches = byDay.get(day).filter(row => row.leagueSlug === candidate.leagueSlug
      && (row.providerIds?.flashscore === candidate.providerMatchId || (row.source === "flashscore" && (row.sourceMatchId || row.sourceId) === candidate.providerMatchId)));
    let result;
    if (matches.length !== 1) result = { ok: false, reason: matches.length ? "CANONICAL_PROVIDER_ID_NOT_UNIQUE" : "CANONICAL_PROVIDER_ID_NOT_FOUND" };
    else result = validatePrematchFinalForm(candidate, matches[0], finalForFixture(day, matches[0].canonicalId), nowMs);
    if (!result.ok) {
      summary.rejected[result.reason] = (summary.rejected[result.reason] || 0) + 1;
      const examples = summary.rejectedExamples[result.reason] ||= [];
      if (examples.length < 3) examples.push({ leagueSlug: candidate.leagueSlug, providerMatchId: candidate.providerMatchId,
        canonicalIds: matches.map(row => row.canonicalId), statuses: matches.map(row => [row.status, row.statusType, row.rawStatus]) });
      continue;
    }
    validated.push({ candidate, row: result.row });
  }
  const resolvedAnchors = anchors.map(candidate => {
    const time = Date.parse(candidate.kickoffUtc);
    if (!Number.isFinite(time) || time <= nowMs || time > nowMs + 8 * 86400000) return { candidate, canonical: null };
    const day = athensDayFromKickoff(candidate.kickoffUtc);
    if (!byDay.has(day)) byDay.set(day, fixturesForDay(day));
    const matches = byDay.get(day).filter(row => row.leagueSlug === candidate.leagueSlug
      && (row.providerIds?.flashscore === candidate.providerMatchId || (row.source === "flashscore" && (row.sourceMatchId || row.sourceId) === candidate.providerMatchId)));
    return { candidate, canonical: matches.length === 1 ? matches[0] : null };
  });
  const continuity = applyProviderTeamContinuity(validated, resolvedAnchors, nowMs);
  summary.teamContinuity = continuity.proofs;
  for (const row of continuity.rows) {
    const old = knownIds.get(row.id);
    if (old && (old.scoreHome !== row.scoreHome || old.scoreAway !== row.scoreAway)) {
      throw new Error(`prematch_verified_final_index_score_conflict:${row.id}`);
    }
    const replacesView = old && row.modelIdentityReadView;
    if ((!replacesView && knownIds.has(row.id)) || knownPairs.has(pairKey(row))) { summary.alreadyIndexed++; continue; }
    if (replacesView) replacedCanonicalIds.push(row.id);
    knownIds.set(row.id, row); knownPairs.add(pairKey(row));
    for (const team of [row.homeTeam, row.awayTeam]) (index[team] ||= { matches: [] }).matches.push(row);
    summary.accepted++; summary.acceptedCanonicalIds.push(row.id);
  }
  summary.identityReadViewRows = replacedCanonicalIds.length;
  return { index, summary, replacedCanonicalIds };
}

export function selectPrematchResearchEvidence(documents, nowMs) {
  const latest = new Map(), nativeHistory = new Map(), nativeIdentities = new Map(), conflicts = new Set();
  for (const evidence of [...documents].sort((a, b) => Date.parse(a.acquiredAt) - Date.parse(b.acquiredAt))) {
    const acquired = Date.parse(evidence.acquiredAt);
    if (evidence.schema !== "ai-matchlab.recent-results-research.v1" || evidence.source !== "flashscore"
      || evidence.status !== "RESULTS_AWAIT_IDENTITY_VALIDATION" || !Number.isFinite(acquired)
      || acquired > nowMs || acquired < nowMs - 180 * 86400000 || !Array.isArray(evidence.rows) || evidence.rows.length > 1000) continue;
    // A partial team profile must not evict the league feed or its anchors.
    latest.set(`${evidence.leagueSlug}|${evidence.teamBinding?.providerTeamId || "league"}`, evidence);
    for (const row of evidence.rows) {
      if (row.leagueSlug !== evidence.leagueSlug || ![row.homeProviderTeamId, row.awayProviderTeamId].every(x => /^[a-zA-Z0-9]{6,16}$/.test(x || ""))) continue;
      const key = `${row.leagueSlug}|${row.providerMatchId}`, identity = `${row.homeProviderTeamId}|${row.awayProviderTeamId}`;
      if (nativeIdentities.has(key) && nativeIdentities.get(key) !== identity) conflicts.add(key);
      nativeIdentities.set(key, identity); nativeHistory.set(key, row);
    }
  }
  // Keep dated native-ID evidence within the form window, even when a provider's
  // current results page has paginated those games away. Every retained game is
  // revalidated against canonical and verified-final truth on every read.
  const rows = new Map(nativeHistory);
  for (const evidence of [...latest.values()].sort((a, b) => Date.parse(a.acquiredAt) - Date.parse(b.acquiredAt))) for (const row of evidence.rows) {
    if (row.leagueSlug === evidence.leagueSlug) rows.set(`${row.leagueSlug}|${row.providerMatchId}`, row);
  }
  for (const key of conflicts) rows.delete(key);
  return { candidates: [...rows.values()], anchors: [...latest.values()].flatMap(x => Array.isArray(x.upcomingAnchors) ? x.upcomingAnchors.slice(0, 400) : []),
    identityConflicts: [...conflicts] };
}

export function readPrematchFinalForm(baseIndex, nowMs) {
  const root = resolveDataPath("value-data-acquisition"), documents = [];
  if (fs.existsSync(root)) for (const day of fs.readdirSync(root).filter(x => /^\d{4}-\d{2}-\d{2}$/.test(x)
    && Date.parse(`${x}T23:59:59Z`) >= nowMs - 180 * 86400000 && Date.parse(`${x}T00:00Z`) <= nowMs).sort()) {
    for (const file of fs.readdirSync(path.join(root, day)).filter(x => x.endsWith(".results.research.json"))) {
      const evidence = JSON.parse(fs.readFileSync(path.join(root, day, file), "utf8"));
      documents.push(evidence);
    }
  }
  const selected = selectPrematchResearchEvidence(documents, nowMs);
  const result = collectPrematchFinalForm(baseIndex, selected.candidates, nowMs, {
    anchors: selected.anchors,
    fixturesForDay: canonicalFixturesForDay,
    finalForFixture: (day, id) => {
      if (!/^cid_[a-zA-Z0-9_]+$/.test(id || "")) return null;
      const file = resolveDataPath("final-results", day, `${id}.json`);
      return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : null;
    }
  });
  result.summary.researchIdentityConflicts = selected.identityConflicts;
  return result;
}
