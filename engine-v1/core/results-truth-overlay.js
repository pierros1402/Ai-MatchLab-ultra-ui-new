/**
 * results-truth-overlay.js
 *
 * Overlay FINAL results from the statistical truth store
 * (data/league-memory/results/{slug}.json, Flashscore-accumulated nightly) onto
 * the display universe for a date. This is what gives PAST days their FTs for
 * odds-only leagues: the deploy snapshot only carries ESPN canonical statuses,
 * so matches that exist only via odds.json / fixtures-all.json stayed PRE
 * forever once the day rolled over. The nightly accumulator has the final
 * scores — they just never reached the display until this overlay.
 *
 * Safety rules (mirror flashscore-live-overlay):
 *   - Never downgrades: only rows whose status ranks below FINAL and is not
 *     SPECIAL (postponed/canceled stay authoritative) are upgraded.
 *   - A result is applied only when BOTH team names match the stored home-side
 *     entry for the same league and same Athens day, and the match is unique
 *     within that league+day. Wrong FT is worse than missing FT.
 *   - Reads only league-memory (truth); writes nothing.
 */

import fs from "fs";
import { resolveDataPath } from "../storage/data-root.js";
import { athensDayFromKickoff } from "./daykey.js";
import { STATUS_RANK, statusRankFromParts } from "./display-contract.js";
import { teamTokens, tokensMatch } from "./team-identity.js";

// Display slugs that differ from the truth-store slugs (BetExplorer vs ESPN).
const SLUG_ALIASES = {
  "fifa.world_cup": "fifa.world",
  "fifa.world_cup_qual": "fifa.world_qual",
};

// Team-identity tokenization + subset matching now live in the shared
// team-identity.js module (imported above) so the settlement verifier uses the
// exact same matcher — see Phase 1 identity-resolver unification.

// ── Per-league/day final-result index, cached on file mtime ────────────────
const __indexCache = new Map(); // slug → { mtimeMs, byDay: Map<dayKey, rows[]> }

function loadLeagueFinals(slug) {
  const file = resolveDataPath("league-memory", "results", `${slug}.json`);

  let stat;
  try { stat = fs.statSync(file); } catch { return null; }

  const cached = __indexCache.get(slug);
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached.byDay;

  let data;
  try { data = JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; }

  // Reconstruct match rows from the home-side entries only (each finished match
  // is stored twice — once per team — so the ha === "H" view is the full list).
  const byDay = new Map();
  for (const [teamName, entries] of Object.entries(data?.teams || {})) {
    for (const e of entries || []) {
      if (e?.ha !== "H") continue;
      if (e.gf == null || e.ga == null) continue;
      const day = athensDayFromKickoff(e.date);
      if (!day) continue;
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push({
        homeTokens: teamTokens(teamName),
        awayTokens: teamTokens(e.opp),
        scoreHome: Number(e.gf),
        scoreAway: Number(e.ga),
        matchId: e.matchId || null,
      });
    }
  }

  __indexCache.set(slug, { mtimeMs: stat.mtimeMs, byDay });
  return byDay;
}

function findFinal(slug, dayKey, homeTeam, awayTeam) {
  const byDay = loadLeagueFinals(slug);
  if (!byDay) return null;

  const rows = byDay.get(dayKey);
  if (!rows || !rows.length) return null;

  const home = teamTokens(homeTeam);
  const away = teamTokens(awayTeam);

  const hits = rows.filter(r =>
    tokensMatch(home, r.homeTokens) && tokensMatch(away, r.awayTokens)
  );

  // Ambiguity within the same league+day means we cannot be sure — skip.
  return hits.length === 1 ? hits[0] : null;
}

// ── Global day-index fallback ───────────────────────────────────────────────
// Display slugs and results-attribution slugs disagree more often than they
// should (CPL stored as can.1 but displayed as can.2; a cup fixture displayed
// under the league slug; accumulator fallback slugs like fs.finland.suomen-cup).
// Rather than encode every mismatch, fall back to searching EVERY league's
// finals for the day and demand a globally unique team-pair hit — a real-world
// team pair effectively never plays twice on one day, and any ambiguity skips.
let __allSlugsCache = { ts: 0, slugs: [] };

function listResultSlugs() {
  const now = Date.now();
  if (__allSlugsCache.slugs.length && now - __allSlugsCache.ts < 5 * 60 * 1000) {
    return __allSlugsCache.slugs;
  }
  try {
    const dir = resolveDataPath("league-memory", "results");
    const slugs = fs.readdirSync(dir)
      .filter(f => f.endsWith(".json"))
      .map(f => f.replace(/\.json$/, ""));
    __allSlugsCache = { ts: now, slugs };
  } catch {
    __allSlugsCache = { ts: now, slugs: [] };
  }
  return __allSlugsCache.slugs;
}

function findFinalGlobal(dayKey, homeTeam, awayTeam, excludeSlugs) {
  const home = teamTokens(homeTeam);
  const away = teamTokens(awayTeam);
  if (!home.length || !away.length) return null;

  const hits = [];
  for (const slug of listResultSlugs()) {
    if (excludeSlugs.has(slug)) continue;
    const byDay = loadLeagueFinals(slug);
    if (!byDay) continue;
    const rows = byDay.get(dayKey);
    if (!rows || !rows.length) continue;
    for (const r of rows) {
      if (tokensMatch(home, r.homeTokens) && tokensMatch(away, r.awayTokens)) {
        hits.push(r);
        if (hits.length > 1) return null; // ambiguous across the day — skip
      }
    }
  }
  return hits.length === 1 ? hits[0] : null;
}

function isUpgradeable(m) {
  const rank = statusRankFromParts(m?.status, m?.rawStatus, m?.statusType, m?.statusName);
  return rank !== STATUS_RANK.FINAL && rank !== STATUS_RANK.SPECIAL;
}

/**
 * Overlay truth-store finals onto display matches for `dayKey`.
 * Synchronous (local JSON reads, mtime-cached); never throws.
 */
export function overlayResultsTruth(matches, dayKey) {
  const list = Array.isArray(matches) ? matches : [];
  const day = String(dayKey || "").slice(0, 10);
  if (!list.length || !day) return list;

  return list.map(m => {
    try {
      if (!isUpgradeable(m)) return m;

      const slug = String(m.leagueSlug || "");
      if (!slug) return m;

      // Sources disagree on which day a cross-midnight match belongs to (a
      // 22:00Z kickoff is the NEXT Athens day); the truth store is keyed by the
      // kickoff's Athens day, so look that day up first, then the display day.
      const kickDay = athensDayFromKickoff(m.kickoffUtc);
      const days = kickDay && kickDay !== day ? [kickDay, day] : [day];

      let found = null;
      for (const d of days) {
        const tried = new Set([slug]);
        found = findFinal(slug, d, m.homeTeam, m.awayTeam);

        if (!found && SLUG_ALIASES[slug]) {
          tried.add(SLUG_ALIASES[slug]);
          found = findFinal(SLUG_ALIASES[slug], d, m.homeTeam, m.awayTeam);
        }

        // Slug-agnostic fallback: unique team-pair hit across ALL leagues'
        // finals for the day (see findFinalGlobal).
        if (!found) {
          found = findFinalGlobal(d, m.homeTeam, m.awayTeam, tried);
        }

        if (found) break;
      }

      if (!found) return m;

      return {
        ...m,
        status: "FT",
        statusType: "FT",
        rawStatus: m.rawStatus || m.status || "",
        scoreHome: found.scoreHome,
        scoreAway: found.scoreAway,
        resultSource: "league-memory",
      };
    } catch {
      return m;
    }
  });
}

// Test/ops helper — drop the per-league caches.
export function _clearResultsTruthCache() {
  __indexCache.clear();
}
