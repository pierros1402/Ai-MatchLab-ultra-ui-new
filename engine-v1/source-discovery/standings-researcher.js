/**
 * standings-researcher.js  (v3)
 *
 * Hybrid autonomous standings acquisition with source memory.
 * v3: adds Wikipedia URL DISCOVERY via web search — instead of guessing
 * article titles, the agent searches for the correct Wikipedia page.
 * This removes the hardcoded-name dependency and makes it truly autonomous.
 *
 * Levels:
 *   L1   Source memory (known-good URL)
 *   L2a  Direct title guess (fast path for well-named leagues)
 *   L2b  Wikipedia URL discovery via search (autonomous fallback)
 *   L3   Multi-source convergence (staged)
 *   L4   AI extraction (gated by AIML_AI_ENABLED)
 */

import { searchWeb } from "./web-search-provider.js";
import {
  parseWikipediaStandings,
  parseWikipediaStandingsMulti
} from "./wikipedia-standings-parser.js";
import { validateStandings } from "./standings-validator.js";
import {
  getPreferredSources,
  recordSourceSuccess,
  recordSourceFailure,
  getSourceMemory
} from "../storage/source-memory-db.js";
import fs from "fs";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";

function aiEnabled() {
  return String(process.env.AIML_AI_ENABLED || "").toLowerCase() === "true";
}

// ─── Known-good URL cache (learned) ───────────────────────────────────────────
// Stores the exact Wikipedia URL that worked, per slug+season.

function urlCachePath() {
  return resolveDataPath("league-memory", "standings-url-cache.json");
}

function readUrlCache() {
  try { return JSON.parse(fs.readFileSync(urlCachePath(), "utf8")); }
  catch { return {}; }
}

function writeUrlCache(data) {
  ensureDir(resolveDataPath("league-memory"));
  fs.writeFileSync(urlCachePath(), JSON.stringify(data, null, 2), "utf8");
}

function getCachedUrl(slug, season) {
  const cache = readUrlCache();
  return cache[`${slug}:${season}`] || null;
}

function setCachedUrl(slug, season, url) {
  const cache = readUrlCache();
  cache[`${slug}:${season}`] = { url, learnedAt: new Date().toISOString() };
  writeUrlCache(cache);
}

// ─── Optional fast-path alt names ─────────────────────────────────────────────
// Not required for correctness — just speeds up well-known leagues so they
// skip the search step. Discovery handles everything else autonomously.

const WIKI_ALT_NAMES = {
  "esp.2": ["Segunda División"],
  "bra.1": ["Campeonato Brasileiro Série A"],
  "arg.1": ["Argentine Primera División"],
  "usa.1": ["Major League Soccer season"],
  // Asia
  "chn.1": ["Chinese Super League"],
  "chn.2": ["China League One"],
  "tpe.1": ["Taiwan Football Premier League"],
  // South America (calendar-year)
  "bol.1": ["Bolivian Primera División"],
  "par.1": ["Paraguayan Primera División"],
  // Central America / Caribbean
  "crc.1": ["Liga FPD"],
  "slv.1": ["Salvadoran Primera División"],
  "gua.1": ["Liga Nacional de Fútbol de Guatemala"],
  "hon.1": ["Liga Nacional de Honduras", "Honduran Liga Nacional"],
  "pan.1": ["Liga Panameña de Fútbol"],
  "nca.1": ["Liga Primera de Nicaragua"],
  "jam.1": ["Jamaica Premier League"],
  "tri.1": ["TT Premier Football League"],
  "dom.1": ["Liga Dominicana de Fútbol"],
  "hai.1": ["Ligue Haïtienne"],
  "sur.1": ["SVB Eerste Divisie"],
  "guy.1": ["GFF Elite League"],
  // Africa
  "ang.1": ["Girabola"],
  "zam.1": ["Zambia Super League"],
  "zim.1": ["Zimbabwe Premier Soccer League"],
  "moz.1": ["Moçambola"],
  "bot.1": ["Botswana Premier League"],
  "nam.1": ["Namibia Premiership", "Namibia Premier League"],
  "mwi.1": ["Malawi National Football League", "TNM Super League"],
  "mad.1": ["Malagasy Pro League"],
  "les.1": ["Lesotho Premier League"],
  "swz.1": ["Eswatini Premier League"],
  "mri.1": ["Mauritian Premier League"],
  // Oceania
  "ncl.1": ["New Caledonia Super Ligue"],
  "tah.1": ["Tahiti Ligue 1"],
  "sol.1": ["Solomon Islands S-League"],
  "png.1": ["Papua New Guinea National Soccer League"],
  "fij.1": ["Fiji Premier League"]
};

function altNamesFor(slug) {
  return WIKI_ALT_NAMES[slug] || [];
}

// ─── Wikipedia URL discovery via search ───────────────────────────────────────

function isWikipediaArticleUrl(url) {
  try {
    const u = new URL(url);
    return /(^|\.)en\.wikipedia\.org$/.test(u.hostname) &&
           u.pathname.startsWith("/wiki/") &&
           !u.pathname.includes(":");  // skip Category:, File:, etc.
  } catch { return false; }
}

// National-team / non-club competitions whose tables must never be mistaken for a
// domestic club league. The 2026 FIFA World Cup in particular dominates searches
// for "2026 <country> football" and its group tables are arithmetically valid.
const NON_CLUB_COMPETITION_RE =
  /world_cup|\bfifa\b|nations_league|copa_am[eé]rica|african_cup|africa_cup|cup_of_nations|asian_cup|gold_cup|european_championship|uefa_euro|confederations_cup|olympic|qualif|_u-?\d{2}|under-?\d{2}|women/i;

function isNonClubCompetitionUrl(url) {
  try {
    const path = decodeURIComponent(new URL(url).pathname);
    return NON_CLUB_COMPETITION_RE.test(path);
  } catch { return false; }
}

function scoreWikiCandidate(url, title, leagueName, countryName, season) {
  let score = 0;
  const t = (title || "").toLowerCase();
  const path = decodeURIComponent(new URL(url).pathname).toLowerCase();
  const text = `${t} ${path}`;

  if (text.includes(season)) score += 30;
  if (text.includes(season.replace("-", "\u2013"))) score += 30;
  if (countryName && text.includes(countryName.toLowerCase())) score += 25;

  // League-name word overlap
  const words = leagueName.toLowerCase().split(/\s+/).filter(w => w.length > 2);
  for (const w of words) if (text.includes(w)) score += 10;

  // Prefer "season" / "división" / "liga" markers
  if (/season|división|division|primera|serie|liga|championship|league/.test(text)) score += 10;

  // Penalise club-season pages and cup pages
  if (/\bclub\b|\bseason\b.*\bsquad\b/.test(text)) score -= 5;
  if (/\bcopa\b|\bcup\b|\bplay-?offs?\b/.test(text)) score -= 15;

  return score;
}

async function discoverWikipediaUrl(leagueName, countryName, season, opts) {
  if (!opts.allowSearch) return null;

  const queries = [
    `${season} ${leagueName} ${countryName} wikipedia season standings`,
    `${leagueName} ${countryName} ${season} season wikipedia table`
  ];

  const candidates = [];

  for (const query of queries) {
    const search = await searchWeb(query, { allowSearch: true });
    if (!search.ok) continue;

    for (const row of search.rows) {
      const url = row.url;
      if (!url || !isWikipediaArticleUrl(url)) continue;
      if (isNonClubCompetitionUrl(url)) continue; // skip World Cup / national-team pages
      const score = scoreWikiCandidate(url, row.title, leagueName, countryName, season);
      candidates.push({ url, title: row.title, score });
    }

    if (candidates.length >= 3) break;
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.length ? candidates : null;
}

// ─── Level 1: Source memory (cached URL) ──────────────────────────────────────

async function tryCachedUrl(slug, season, opts) {
  const cached = getCachedUrl(slug, season);
  if (!cached?.url) return null;
  if (isNonClubCompetitionUrl(cached.url)) return null; // poisoned cache entry

  const parsed = await parseWikipediaStandings(cached.url, opts);
  if (!parsed.ok) return null;

  const validation = validateStandings(parsed.rows, opts);
  if (validation.valid) {
    recordSourceSuccess(slug, parsed.host, {
      dataType: "standings", confidence: validation.confidence, parseMethod: parsed.parseMethod
    });
    return { level: 1, source: parsed.host, url: cached.url, parsed, validation, rows: parsed.rows };
  }
  return null;
}

// ─── Level 2a: Direct title guess ─────────────────────────────────────────────

async function tryDirectTitle(slug, leagueName, season, opts) {
  const parsed = await parseWikipediaStandingsMulti(leagueName, season, altNamesFor(slug), opts);
  if (!parsed.ok) return null;

  const validation = validateStandings(parsed.rows, opts);
  if (validation.valid) {
    recordSourceSuccess(slug, parsed.host, {
      dataType: "standings", confidence: validation.confidence, parseMethod: parsed.parseMethod
    });
    setCachedUrl(slug, season, parsed.url);
    return { level: 2, source: parsed.host, url: parsed.url, parsed, validation, rows: parsed.rows };
  }
  return { level: 2, parsed, validation, rows: parsed.rows, rejected: true };
}

// ─── Level 2b: URL discovery via search ───────────────────────────────────────

async function tryDiscovery(slug, leagueName, countryName, season, opts) {
  const candidates = await discoverWikipediaUrl(leagueName, countryName, season, opts);
  if (!candidates) return null;

  for (const candidate of candidates.slice(0, 3)) {
    const parsed = await parseWikipediaStandings(candidate.url, opts);
    if (!parsed.ok) continue;

    const validation = validateStandings(parsed.rows, opts);
    if (validation.valid) {
      recordSourceSuccess(slug, parsed.host, {
        dataType: "standings", confidence: validation.confidence, parseMethod: parsed.parseMethod
      });
      setCachedUrl(slug, season, candidate.url);
      return {
        level: 2.5, source: parsed.host, url: candidate.url,
        parsed, validation, rows: parsed.rows, discovered: true,
        candidateScore: candidate.score
      };
    }
  }

  recordSourceFailure(slug, "en.wikipedia.org", { dataType: "standings", reason: "discovery_no_valid_table" });
  return null;
}

// ─── Level 4: AI (gated) ──────────────────────────────────────────────────────

function tryAi() {
  return { level: 4, source: null, rows: [], needsReview: true,
           note: aiEnabled() ? "ai_extraction_not_implemented_yet" : "ai_disabled_needs_review" };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export async function researchStandings(slug, leagueName, countryName, options = {}) {
  const season      = options.season || "2025-26";
  const allowSearch = options.allowSearch === true;
  const startedAt   = Date.now();

  const opts = {
    allowSearch,
    timeoutMs: options.timeoutMs || 12000,
    expectedTeamsMin: options.expectedTeamsMin || 6,
    expectedTeamsMax: options.expectedTeamsMax || 30,
    confidenceThreshold: options.confidenceThreshold || 0.80
  };

  const trail = [];

  // L1 — cached known-good URL
  const fromCache = await tryCachedUrl(slug, season, opts);
  if (fromCache) return finalize(slug, leagueName, season, fromCache, trail, startedAt, "accepted");
  trail.push({ level: 1, result: "no_cached_url" });

  // L2a — direct title
  const direct = await tryDirectTitle(slug, leagueName, season, opts);
  if (direct && !direct.rejected) {
    return finalize(slug, leagueName, season, direct, trail, startedAt, "accepted");
  }
  trail.push({ level: 2, result: direct ? "direct_validation_failed" : "direct_fetch_failed" });

  // L2b — discovery via search
  const discovered = await tryDiscovery(slug, leagueName, countryName, season, opts);
  if (discovered) {
    return finalize(slug, leagueName, season, discovered, trail, startedAt, "accepted");
  }
  trail.push({ level: 2.5, result: "discovery_failed" });

  // L3 — surface a rejected-but-complete table for review
  if (direct && direct.rows && direct.rows.length >= 4) {
    const reviewResult = {
      level: 3, source: direct.parsed?.host, url: direct.parsed?.url,
      parsed: direct.parsed, validation: direct.validation, rows: direct.rows,
      needsReview: true, note: "below_threshold_single_source"
    };
    trail.push({ level: 3, result: "needs_review", note: reviewResult.note });
    return finalize(slug, leagueName, season, reviewResult, trail, startedAt, "needs_review");
  }
  trail.push({ level: 3, result: "no_reviewable_table" });

  // L4
  const ai = tryAi();
  trail.push({ level: 4, result: ai.note });
  return finalize(slug, leagueName, season, ai, trail, startedAt, "needs_review");
}

function finalize(slug, leagueName, season, result, trail, startedAt, status) {
  return {
    ok: true,
    slug, leagueName, season, status,
    level: result.level,
    source: result.source || null,
    url: result.url || null,
    discovered: result.discovered || false,
    confidence: result.validation?.confidence ?? 0,
    rowCount: result.rows?.length || 0,
    rows: result.rows || [],
    validation: result.validation || null,
    note: result.note || null,
    trail,
    ms: Date.now() - startedAt,
    guarantees: { canonicalWrites: 0, productionWrite: false, aiEnabled: aiEnabled() }
  };
}
