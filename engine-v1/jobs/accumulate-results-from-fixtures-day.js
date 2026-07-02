/**
 * accumulate-results-from-fixtures-day.js
 *
 * Second daily results feeder — persists the FINAL scores we actually DISPLAY
 * (the ESPN-canonical deploy-snapshot fixtures) into the same append-only results
 * memory the Flashscore accumulator writes to. Rationale: results memory (which
 * now feeds history-archive → model-priors → value) must never diverge from what
 * the app showed as finished. accumulate-results-day covers the Flashscore feed;
 * this covers anything that finished in our fixtures but Flashscore's -1..-7
 * window missed (ESPN-only leagues, late finalizations).
 *
 * Only real FINAL rows are stored — status FT/FULL_TIME/FINAL/AET/PEN with a
 * numeric score and a real leagueSlug. Never time-based, never unconfirmed
 * (mirrors the stuck-live rule: a result is stored only when a trusted source
 * asserts it).
 *
 * Cross-source dedup: recordMatchResult only dedups by matchId, but the same
 * fixture has DIFFERENT ids across sources (ESPN vs Flashscore) — so we first
 * check whether results memory ALREADY holds this fixture (by day + team names)
 * and skip it if so. That way this feeder ONLY adds genuinely-missing results
 * and never manufactures the cross-source duplicates the converter has to clean.
 *
 * Guardrails: writes only to league-memory/results (canonicalWrites 0).
 */

import fs from "fs";
import { pathToFileURL } from "node:url";
import { athensDayKey, athensDayFromKickoff } from "../core/daykey.js";
import { resolveDataPath } from "../storage/data-root.js";
import { recordMatchResult, readResults } from "../storage/results-memory-db.js";

const FINAL_RE = /\b(FT|FULL_TIME|STATUS_FULL_TIME|FINAL|STATUS_FINAL|AET|PEN)\b/i;

function isFinalRow(m) {
  if (m?.statusUnconfirmed === true) return false;
  const blob = [m?.status, m?.statusType, m?.rawStatus, m?.statusName]
    .filter(Boolean).join(" ").toUpperCase();
  return FINAL_RE.test(blob);
}

function nameKey(name) {
  return String(name || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function fixtureKey(dayKey, home, away) {
  return `${dayKey}|${nameKey(home)}|${nameKey(away)}`;
}

// Set of fixture-identity keys already present in a league's results memory
// (from ANY source), so we never re-store a fixture under a second matchId.
const __existingCache = new Map();
function existingFixtureKeys(slug) {
  if (__existingCache.has(slug)) return __existingCache.get(slug);
  const keys = new Set();
  const data = readResults(slug);
  for (const [team, entries] of Object.entries(data?.teams || {})) {
    for (const e of Array.isArray(entries) ? entries : []) {
      if (e?.ha !== "H") continue; // home view = one row per fixture
      const day = athensDayFromKickoff(e.date) || String(e.date || "").slice(0, 10);
      keys.add(fixtureKey(day, team, e.opp));
    }
  }
  __existingCache.set(slug, keys);
  return keys;
}

function readSnapshotFixtures(dayKey) {
  const p = resolveDataPath("deploy-snapshots", dayKey, "fixtures.json");
  try {
    if (!fs.existsSync(p)) return [];
    const j = JSON.parse(fs.readFileSync(p, "utf8"));
    return Array.isArray(j?.matches) ? j.matches : (Array.isArray(j?.fixtures) ? j.fixtures : []);
  } catch {
    return [];
  }
}

/**
 * Capture FINAL fixtures for a window of recent days into results memory.
 * @param {string} endDay  most recent day to scan (default: yesterday Athens)
 * @param {number} daysBack  how many earlier days to also scan (late finalizations)
 */
export function accumulateResultsFromFixtures(endDay, daysBack = 3) {
  const base = endDay || athensDayKey(new Date(Date.now() - 86400000));
  const stats = { days: [], scanned: 0, final: 0, alreadyPresent: 0, stored: 0, byLeague: {} };
  __existingCache.clear();

  for (let i = 0; i <= daysBack; i++) {
    const day = athensDayKey(new Date(Date.parse(`${base}T12:00:00Z`) - i * 86400000));
    const rows = readSnapshotFixtures(day);
    if (!rows.length) continue;
    stats.days.push(day);

    for (const m of rows) {
      stats.scanned++;
      if (!isFinalRow(m)) continue;
      const sh = m.scoreHome, sa = m.scoreAway;
      if (sh == null || sa == null) continue;
      const slug = String(m.leagueSlug || "");
      const home = m.homeTeam || m.home;
      const away = m.awayTeam || m.away;
      if (!slug || !home || !away) continue;
      stats.final++;

      const key = fixtureKey(athensDayFromKickoff(m.kickoffUtc) || day, home, away);
      const existing = existingFixtureKeys(slug);
      if (existing.has(key)) { stats.alreadyPresent++; continue; }

      const changed = recordMatchResult(slug, {
        matchId: String(m.matchId || m.id || `snap_${slug}_${key}`),
        home, away,
        scoreHome: sh, scoreAway: sa,
        kickoffUtc: m.kickoffUtc,
      });
      if (changed) {
        existing.add(key); // keep cache consistent within the run
        stats.stored++;
        stats.byLeague[slug] = (stats.byLeague[slug] || 0) + 1;
      }
    }
  }

  return { ok: true, ...stats };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const arg = process.argv[2];
  const day = /^\d{4}-\d{2}-\d{2}$/.test(arg || "") ? arg : null;
  const r = accumulateResultsFromFixtures(day);
  console.log(JSON.stringify({
    days: r.days, scanned: r.scanned, final: r.final,
    alreadyPresent: r.alreadyPresent, stored: r.stored,
    leaguesTouched: Object.keys(r.byLeague).length,
    byLeague: r.byLeague,
    guarantees: { canonicalWrites: 0 },
  }, null, 2));
}
