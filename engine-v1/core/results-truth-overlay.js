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

// Display slugs that differ from the truth-store slugs (BetExplorer vs ESPN).
const SLUG_ALIASES = {
  "fifa.world_cup": "fifa.world",
  "fifa.world_cup_qual": "fifa.world_qual",
};

// Team-name tokens: same spirit as the value engine's tokenizer — strip
// diacritics/punctuation and generic club affixes, expand the abbreviations
// that differ between Flashscore (truth store) and ESPN/BetExplorer (display).
const TOKEN_ALIASES = new Map([
  ["utd", "united"],
  ["intl", "international"],
]);

const GENERIC_TOKENS = new Set([
  "fc", "afc", "cf", "sc", "ac", "cd", "ca", "ec", "se", "ad", "sv", "fk",
  "if", "bk", "aif", "club", "de", "do", "da", "dos", "das", "e", "the",
]);

function teamTokens(name) {
  const base = String(name || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’`.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  const out = [];
  for (let tok of base.split(" ")) {
    if (!tok) continue;
    tok = TOKEN_ALIASES.get(tok) || tok;
    if (GENERIC_TOKENS.has(tok)) continue;
    out.push(tok);
  }
  return out;
}

/** True when one token set is a non-empty subset of the other (or equal). */
function tokensMatch(aTokens, bTokens) {
  if (!aTokens.length || !bTokens.length) return false;
  const a = new Set(aTokens);
  const b = new Set(bTokens);
  const aInB = [...a].every(t => b.has(t));
  const bInA = [...b].every(t => a.has(t));
  return aInB || bInA;
}

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

      const found =
        findFinal(slug, day, m.homeTeam, m.awayTeam) ||
        (SLUG_ALIASES[slug]
          ? findFinal(SLUG_ALIASES[slug], day, m.homeTeam, m.awayTeam)
          : null);

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
