/**
 * accumulate-results-day.js
 *
 * Daily results accumulation — the autonomous FORM builder. Pulls the recent
 * Flashscore window (finished matches with scores) and appends to append-only
 * results memory. Covers ALL leagues that Flashscore provides, not just those
 * pre-registered in LEAGUES_COVERAGE.
 *
 * Slug resolution (three-pass, full coverage):
 *   1. resolveSlug(country, leagueName) — fuzzy name match for domestic leagues
 *   2. resolveSlugFromPath(leaguePath) — deterministic path lookup for cups,
 *      continental competitions, and qualifiers (UCL Q, UEL Q, Copa del Rey…)
 *   3. fixtures-all cross-reference by matchId — picks up any league that
 *      recently appeared in fixtures-all.json (already has resolved slugs)
 *
 * This covers every competition type with no manual additions needed.
 * Guardrails: canonicalWrites 0 (writes only to league-memory/results).
 */

import fs from "fs";
import path from "path";
import { pathToFileURL } from "node:url";
import { fetchFlashscoreFixtures } from "../odds/flashscore-fixtures-source.js";
import { resolveSlug, resolveSlugFromPath } from "../odds/flashscore-league-map.js";
import { recordMatchResult, getResultsSummary } from "../storage/results-memory-db.js";
import { resolveDataPath } from "../storage/data-root.js";
import { athensDayFromKickoff } from "../core/daykey.js";
import { canonicalFixturesForDay } from "../core/day-fixture-universe.js";
import { teamPairMatches } from "../core/team-identity.js";

/**
 * Build a matchId → leagueSlug lookup from all fixtures-all.json snapshots
 * within the past N days.  fixtures-all.json already has resolved slugs for
 * every league the Flashscore feed exports, so this is the zero-cost fallback.
 *
 * matchIds in fixtures-all are prefixed "fs_XXXX"; in the live feed they are
 * bare "XXXX" — we index both forms.
 */
/**
 * Resolve one Flashscore FINAL row to the authoritative canonical fixture.
 *
 * Identity authority:
 *   canonical-fixtures = fixture identity truth
 *   Flashscore matchId = provider provenance only when a unique canonical
 *   event can be proven.
 *
 * Safety:
 *   - same operational Athens day
 *   - same league
 *   - kickoff within 5 minutes
 *   - teamPairMatches() must pass, including squad-marker boundaries
 *   - exactly one canonical candidate is required
 *
 * Ambiguous or unresolved rows deliberately fall back to the provider id;
 * this function never guesses a canonical identity.
 */
export function resolveCanonicalResultIdentity(
  match,
  leagueSlug,
  {
    canonicalRows = null,
  } = {},
) {
  const providerMatchId = String(match?.matchId || "").trim();

  if (!providerMatchId) {
    return {
      status: "provider_fallback",
      providerMatchId: "",
      matchId: "",
      sourceMatchId: null,
      canonicalMatchId: null,
      candidateCount: 0,
      reason: "missing_provider_match_id",
    };
  }

  const dayKey =
    athensDayFromKickoff(match?.kickoffUtc) ||
    String(match?.kickoffUtc || "").slice(0, 10) ||
    null;

  if (!dayKey) {
    return {
      status: "provider_fallback",
      providerMatchId,
      matchId: providerMatchId,
      sourceMatchId: null,
      canonicalMatchId: null,
      candidateCount: 0,
      reason: "missing_operational_day",
    };
  }

  const rows = Array.isArray(canonicalRows)
    ? canonicalRows
    : canonicalFixturesForDay(dayKey);

  const providerKickoffMs = Date.parse(
    String(match?.kickoffUtc || "")
  );

  if (!Number.isFinite(providerKickoffMs)) {
    return {
      status: "provider_fallback",
      providerMatchId,
      matchId: providerMatchId,
      sourceMatchId: null,
      canonicalMatchId: null,
      candidateCount: 0,
      reason: "invalid_provider_kickoff",
      dayKey,
    };
  }

  const candidates = (Array.isArray(rows) ? rows : []).filter(row => {
    const rowSlug = String(
      row?.leagueSlug ||
      row?.competitionSlug ||
      ""
    ).trim();

    if (
      leagueSlug &&
      rowSlug &&
      rowSlug !== String(leagueSlug)
    ) {
      return false;
    }

    const rowKickoffMs = Date.parse(
      String(
        row?.kickoffUtc ||
        row?.kickoff ||
        ""
      )
    );

    if (!Number.isFinite(rowKickoffMs)) {
      return false;
    }

    if (
      Math.abs(
        providerKickoffMs -
        rowKickoffMs
      ) > 5 * 60 * 1000
    ) {
      return false;
    }

    return teamPairMatches(
      match?.home,
      match?.away,
      row?.homeTeam ?? row?.home,
      row?.awayTeam ?? row?.away,
    );
  });

  if (candidates.length !== 1) {
    return {
      status:
        candidates.length > 1
          ? "ambiguous_canonical_identity"
          : "provider_fallback",
      providerMatchId,
      matchId: providerMatchId,
      sourceMatchId: null,
      canonicalMatchId: null,
      candidateCount: candidates.length,
      reason:
        candidates.length > 1
          ? "multiple_canonical_candidates"
          : "no_unique_canonical_candidate",
      dayKey,
    };
  }

  const canonicalMatchId = String(
    candidates[0]?.canonicalId ||
    candidates[0]?.matchId ||
    candidates[0]?.id ||
    ""
  ).trim();

  if (!canonicalMatchId) {
    return {
      status: "provider_fallback",
      providerMatchId,
      matchId: providerMatchId,
      sourceMatchId: null,
      canonicalMatchId: null,
      candidateCount: 1,
      reason: "canonical_candidate_missing_identity",
      dayKey,
    };
  }

  return {
    status: "canonical",
    providerMatchId,
    matchId: canonicalMatchId,
    sourceMatchId: providerMatchId,
    canonicalMatchId,
    candidateCount: 1,
    reason: "unique_authoritative_canonical_event",
    dayKey,
  };
}
function buildFixturesAllSlugIndex(daysBack = 8) {
  const index = new Map(); // bare matchId → leagueSlug
  const now = Date.now();

  for (let i = 0; i <= daysBack; i++) {
    const d = new Date(now - i * 86400000);
    const key = d.toLocaleDateString("en-CA", { timeZone: "Europe/Athens" });
    try {
      const p = resolveDataPath("deploy-snapshots", key, "fixtures-all.json");
      if (!fs.existsSync(p)) continue;
      const faj = JSON.parse(fs.readFileSync(p, "utf8"));
      for (const m of (faj.matches || [])) {
        if (!m.leagueSlug) continue;
        const bareId = String(m.id || m.matchId || "").replace(/^fs_/, "");
        if (bareId) index.set(bareId, m.leagueSlug);
      }
    } catch { /* snapshot missing or corrupt, skip */ }
  }
  return index;
}

export async function accumulateResults() {
  // Past week is finished; today's finished games are picked up next run.
  const feed = await fetchFlashscoreFixtures({ offsets: [-1, -2, -3, -4, -5, -6, -7] });

  // Slug fallback index from recent fixtures-all.json (covers leagues not in LEAGUES_COVERAGE).
  const fixturesAllIndex = buildFixturesAllSlugIndex(8);

  const stats = {
    scanned: 0, finished: 0, attributed: 0, stored: 0,
    canonicalIdentityResolved: 0,
    providerIdentityFallback: 0,
    canonicalIdentityAmbiguous: 0,
    byLeague: {},
    resolvedBy: { coverageMap: 0, pathMap: 0, fixturesAll: 0, pathFallback: 0 },
  };

  // Last-resort slug straight from the Flashscore league path, so a finished
  // match is NEVER dropped just because no map knows the competition (cups,
  // super cups, relegation groups…). "/football/finland/suomen-cup/" →
  // "fs.finland.suomen-cup". The display overlay matches these via its
  // slug-agnostic day-index fallback, and a proper slug can be aliased later.
  function pathFallbackSlug(leaguePath) {
    const parts = String(leaguePath || "")
      .split("/")
      .filter(Boolean)
      .slice(1, 3); // drop leading "football", keep country + competition
    const clean = parts.map(p => p.toLowerCase().replace(/[^a-z0-9-]+/g, "")).filter(Boolean);
    return clean.length === 2 ? `fs.${clean[0]}.${clean[1]}` : null;
  }

  for (const m of feed.rows) {
    stats.scanned++;
    if (m.scoreHome == null || m.scoreAway == null) continue;  // not finished
    stats.finished++;

    // Pass 1: fuzzy name match for domestic leagues.
    let slug = resolveSlug(m.country, m.leagueName);
    if (slug) {
      stats.resolvedBy.coverageMap++;
    } else {
      // Pass 2: deterministic path lookup (cups, continental, qualifiers).
      slug = resolveSlugFromPath(m.leaguePath) || null;
      if (slug) {
        stats.resolvedBy.pathMap++;
      } else {
        // Pass 3: fixtures-all cross-reference by matchId.
        slug = fixturesAllIndex.get(String(m.matchId)) || null;
        if (slug) {
          stats.resolvedBy.fixturesAll++;
        } else {
          // Pass 4: never drop a finished match — persist under a
          // deterministic path-derived slug (fs.{country}.{competition}).
          slug = pathFallbackSlug(m.leaguePath);
          if (slug) stats.resolvedBy.pathFallback++;
        }
      }
    }

    if (!slug) continue;  // no usable league path at all — cannot attribute
    stats.attributed++;

    const identity = resolveCanonicalResultIdentity(m, slug);

    if (identity.status === "canonical") {
      stats.canonicalIdentityResolved++;
    } else if (identity.status === "ambiguous_canonical_identity") {
      stats.canonicalIdentityAmbiguous++;
    } else {
      stats.providerIdentityFallback++;
    }

    const changed = recordMatchResult(slug, {
      matchId: identity.matchId,
      ...(identity.sourceMatchId
        ? { sourceMatchId: identity.sourceMatchId }
        : {}),
      home:       m.home,
      away:       m.away,
      scoreHome:  m.scoreHome,
      scoreAway:  m.scoreAway,
      kickoffUtc: m.kickoffUtc,
    });
    if (changed) {
      stats.stored++;
      stats.byLeague[slug] = (stats.byLeague[slug] || 0) + 1;
    }
  }

  return { ok: true, ...stats, results: getResultsSummary() };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  accumulateResults().then(r => {
    console.log(JSON.stringify({
      scanned:    r.scanned,
      finished:   r.finished,
      attributed: r.attributed,
      stored:     r.stored,
      leagues:    Object.keys(r.byLeague).length,
      resolvedBy: r.resolvedBy,
      results:    r.results,
      guarantees: { canonicalWrites: 0 },
    }, null, 2));
  }).catch(err => { console.error("fatal", String(err?.message || err)); process.exitCode = 1; });
}
