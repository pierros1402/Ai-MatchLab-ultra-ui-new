/**
 * verify-results-day.js
 *
 * After accumulate-results-day.js runs, verify that every match we EXPECTED
 * (recorded by record-expected-day.js) now has a FT result in league-memory.
 *
 * Multi-source verification:
 *   1. Primary  — league-memory/results/{slug}.json  (Flashscore-accumulated)
 *   2. Secondary — deploy-snapshots/{date}/fixtures.json (ESPN canonical scores)
 *
 * If primary has no FT for a match but ESPN does → "found_secondary".
 * If neither source has it → "missing" (real gap, needs attention).
 *
 * "0 missing is the only acceptable state."  This script exits with code 1
 * when any match is confirmed missing, triggering GitHub Actions email.
 *
 * Output: data/verification/{date}.json
 *   { dayKey, verifiedAt, expected, foundPrimary, foundSecondary, missing: [...] }
 */

import fs from "fs";
import path from "path";
import { pathToFileURL } from "node:url";
import { resolveDataPath, ensureDir } from "../storage/data-root.js";
import { athensDayKey } from "../core/daykey.js";

const EXPECTED_DIR    = resolveDataPath("expected-matches");
const RESULTS_DIR     = resolveDataPath("league-memory", "results");
const VERIFICATION_DIR = resolveDataPath("verification");

function log(...a) { console.log("[verify-results]", ...a); }

function normalizeTeam(name) {
  return String(name || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();
}

/** Strip the "fs_" prefix that fixtures-all adds but results-memory omits. */
function stripFsPrefix(id) { return String(id || "").replace(/^fs_/, ""); }

/**
 * Build a set of all matchIds from league-memory/results, stored in both raw
 * form and without the "fs_" prefix so we can match fixtures-all entries.
 */
function getCollectedMatchIds(slug) {
  const file = path.join(RESULTS_DIR, `${slug}.json`);
  const seen = new Set();
  try {
    if (!fs.existsSync(file)) return seen;
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const matches of Object.values(data.teams || {})) {
      for (const m of matches) {
        if (!m.matchId) continue;
        seen.add(m.matchId);
        seen.add(stripFsPrefix(m.matchId)); // also index bare form
      }
    }
  } catch { /* league not yet accumulated */ }
  return seen;
}

/**
 * Build a lookup of ESPN matches for a date: normalised "home|away" → matchId.
 * ESPN uses numeric matchIds; we match by team pair since IDs differ from Flashscore.
 */
function buildEspnIndex(date) {
  const index = new Map(); // "normHome|normAway" → { matchId, scoreHome, scoreAway, status }
  // Try today's and yesterday's snapshot (daily cycle runs at night)
  const candidates = [date];
  const d = new Date(date + "T12:00:00Z");
  d.setDate(d.getDate() - 1);
  candidates.push(d.toISOString().slice(0, 10));

  for (const key of candidates) {
    try {
      const p = resolveDataPath("deploy-snapshots", key, "fixtures.json");
      if (!fs.existsSync(p)) continue;
      const raw = JSON.parse(fs.readFileSync(p, "utf8"));
      const list = Array.isArray(raw) ? raw : (raw.fixtures || raw.matches || []);
      for (const m of list) {
        const mDate = (m.kickoffUtc || "").slice(0, 10);
        if (mDate !== date) continue;
        const homeN = normalizeTeam(m.homeTeam || m.home);
        const awayN = normalizeTeam(m.awayTeam || m.away);
        if (!homeN || !awayN) continue;
        index.set(`${homeN}|${awayN}`, {
          matchId:   String(m.matchId || m.id || ""),
          scoreHome: m.scoreHome ?? null,
          scoreAway: m.scoreAway ?? null,
          status:    m.status || "PRE",
          source:    "espn",
        });
      }
      break; // found a fixture file, stop
    } catch { /* try next */ }
  }
  return index;
}

/**
 * Build the set of league slugs for which we actively accumulate results.
 * Only leagues with a results file are "in scope" for verification.
 */
function getAccumulatedLeagues() {
  const slugs = new Set();
  if (!fs.existsSync(RESULTS_DIR)) return slugs;
  for (const f of fs.readdirSync(RESULTS_DIR)) {
    if (f.endsWith(".json")) slugs.add(f.replace(/\.json$/, ""));
  }
  return slugs;
}

/** Group missing matches by league slug, sorted by count descending. */
function groupMissingByLeague(missing) {
  const map = new Map();
  for (const m of missing || []) {
    if (!map.has(m.leagueSlug)) map.set(m.leagueSlug, []);
    map.get(m.leagueSlug).push(m);
  }
  return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
}

export function verifyResultsDay(dayKey) {
  const date = dayKey || (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1); // default: verify yesterday
    return d.toLocaleDateString("en-CA", { timeZone: "Europe/Athens" });
  })();

  ensureDir(VERIFICATION_DIR);

  // Load expected matches
  const expectedFile = path.join(EXPECTED_DIR, `${date}.json`);
  if (!fs.existsSync(expectedFile)) {
    log("no expected-matches record", { date });
    const result = { ok: true, date, skipped: true, reason: "no_expected_record" };
    return result;
  }

  const expected = JSON.parse(fs.readFileSync(expectedFile, "utf8"));
  const allMatches = expected.matches || [];

  // Only verify leagues we actively accumulate results for.
  // Leagues in fixtures-all that we don't accumulate are "display only" — not a gap.
  const accumulatedLeagues = getAccumulatedLeagues();
  const matches = allMatches.filter(m => accumulatedLeagues.has(m.leagueSlug));
  const outOfScope = allMatches.length - matches.length;

  if (outOfScope > 0) {
    log("out-of-scope matches skipped", { outOfScope, reason: "league_not_accumulated" });
  }

  if (!matches.length) {
    log("expected record is empty", { date });
    const result = { ok: true, date, expected: 0, foundPrimary: 0, foundSecondary: 0, missing: [] };
    fs.writeFileSync(path.join(VERIFICATION_DIR, `${date}.json`), JSON.stringify(result, null, 2), "utf8");
    return result;
  }

  log("verifying", { date, expected: matches.length });

  // Cache collected matchIds per slug (avoid re-reading file for same league)
  const collectedCache = new Map(); // slug → Set<matchId>
  function getCollected(slug) {
    if (!collectedCache.has(slug)) collectedCache.set(slug, getCollectedMatchIds(slug));
    return collectedCache.get(slug);
  }

  // ESPN secondary index
  const espnIndex = buildEspnIndex(date);

  const foundPrimary   = [];
  const foundSecondary = [];
  const missing        = [];

  for (const m of matches) {
    const slug = m.leagueSlug;
    const collected = getCollected(slug);

    if (collected.has(m.matchId) || collected.has(stripFsPrefix(m.matchId))) {
      foundPrimary.push({ matchId: m.matchId, home: m.home, away: m.away, leagueSlug: slug });
      continue;
    }

    // Not in primary — check ESPN by normalised team pair
    const homeN = normalizeTeam(m.home);
    const awayN = normalizeTeam(m.away);
    const espnMatch = espnIndex.get(`${homeN}|${awayN}`);

    if (espnMatch && (espnMatch.scoreHome !== null || ["FT","FINAL","POST"].some(s => espnMatch.status?.includes(s)))) {
      foundSecondary.push({
        matchId:        m.matchId,
        home:           m.home,
        away:           m.away,
        leagueSlug:     slug,
        espnMatchId:    espnMatch.matchId,
        espnScore:      espnMatch.scoreHome !== null ? `${espnMatch.scoreHome}-${espnMatch.scoreAway}` : null,
        espnStatus:     espnMatch.status,
      });
      continue;
    }

    // Neither source has it — genuine gap
    missing.push({
      matchId:    m.matchId,
      home:       m.home,
      away:       m.away,
      leagueSlug: slug,
      kickoffUtc: m.kickoffUtc,
      checkedSources: ["flashscore-accumulated", "espn-snapshot"],
    });
  }

  const hasGaps = missing.length > 0;
  const missingLeagues = groupMissingByLeague(missing);
  const missingByLeague = Object.fromEntries(
    missingLeagues.map(([slug, ms]) => [slug, ms.length])
  );
  const result = {
    ok:             !hasGaps,
    dayKey:         date,
    verifiedAt:     new Date().toISOString(),
    expectedTotal:  allMatches.length,
    expectedInScope: matches.length,
    outOfScope,
    foundPrimary:   foundPrimary.length,
    foundSecondary: foundSecondary.length,
    missing:        missing.length,
    missingByLeague,
    gapRate:        matches.length ? (missing.length / matches.length) : 0,
    details: {
      foundPrimary,
      foundSecondary,
      missing,
    },
  };

  fs.writeFileSync(
    path.join(VERIFICATION_DIR, `${date}.json`),
    JSON.stringify(result, null, 2),
    "utf8"
  );

  if (hasGaps) {
    log("GAPS DETECTED", { date, missing: missing.length, total: matches.length, leagues: missingLeagues.length });
    for (const [slug, ms] of missingLeagues) {
      log(`  ${slug}: ${ms.length} missing`);
      for (const m of ms) log("    -", m.home, "vs", m.away, m.kickoffUtc);
    }
  } else {
    log("all collected", { date, foundPrimary: foundPrimary.length, foundSecondary: foundSecondary.length });
  }

  return result;
}

/**
 * Read an already-written verification file and emit a LOUD, per-league
 * breakdown as GitHub Actions annotations (one ::error:: per league so each
 * shows up individually in the run summary). Returns { ok, missing, leagues }.
 * Used by the workflow's gap-check step instead of a bare total count.
 */
export function reportVerificationAnnotations(dayKey) {
  const file = path.join(VERIFICATION_DIR, `${dayKey}.json`);
  if (!fs.existsSync(file)) {
    console.log(`No verification file for ${dayKey} (first run or no expected record yet).`);
    return { ok: true, missing: 0, leagues: 0 };
  }
  const v = JSON.parse(fs.readFileSync(file, "utf8"));
  const missing = v.missing || 0;
  if (!missing) {
    console.log(`Verification: 0 missing matches for ${dayKey}.`);
    return { ok: true, missing: 0, leagues: 0 };
  }

  const leagues = groupMissingByLeague(v.details?.missing || []);
  console.log(`Verification: ${missing} missing match(es) across ${leagues.length} league(s) for ${dayKey}:`);
  for (const [slug, ms] of leagues) {
    const sample = ms.slice(0, 5).map(m => `${m.home} vs ${m.away}`).join("; ");
    const more = ms.length > 5 ? ` (+${ms.length - 5} more)` : "";
    // GitHub Actions annotation — one per league so the run page lists each.
    console.log(`::error title=Missing results: ${slug} (${ms.length})::${slug} — ${ms.length} not collected for ${dayKey}: ${sample}${more}`);
  }
  return { ok: false, missing, leagues: leagues.length };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const args = process.argv.slice(2);
  const date = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));

  // --report: read an existing verification file and emit per-league
  // annotations (used by the workflow gap-check step). Does not re-verify.
  if (args.includes("--report")) {
    const r = reportVerificationAnnotations(date);
    if (!r.ok) process.exitCode = 1;
  } else {
    const result = verifyResultsDay(date);
    console.log(JSON.stringify({ ...result, details: undefined }, null, 2));
    if (!result.ok && !result.skipped) {
      const leagues = Object.entries(result.missingByLeague || {})
        .sort((a, b) => b[1] - a[1]);
      console.error(`\n[verify-results] ${result.missing} missing match(es) across ${leagues.length} league(s) on ${result.dayKey}:`);
      for (const [slug, count] of leagues) console.error(`  ${slug}: ${count}`);
      console.error(`  → check data/verification/${result.dayKey}.json`);
      process.exitCode = 1;
    }
  }
}
