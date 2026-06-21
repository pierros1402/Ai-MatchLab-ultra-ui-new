/**
 * build-coverage-report.js
 *
 * Single source of truth for "what do we have / what is missing" across our
 * autonomous data, so gaps are EXPLICIT instead of discovered later. For every
 * active league (and every league that has fixtures today) it reports:
 *   fixtures, standings (current season), history (προϊστορία), and whether the
 *   statistical assessment / value prerequisites are met.
 *
 * Writes data/league-memory/coverage-report.json and prints a gap summary.
 *
 * Guardrails: read-only over our memory + snapshots; canonicalWrites 0.
 */

import fs from "fs";
import { pathToFileURL } from "node:url";
import { athensDayKey } from "../core/daykey.js";
import { resolveDataPath } from "../storage/data-root.js";
import { readAllStates } from "../storage/league-memory-db.js";
import { readStandings, hasAcceptedStandings } from "../storage/standings-memory-db.js";
import { hasLeagueHistory } from "../storage/league-memory-db.js";
import { getLeagueMeta } from "../source-discovery/league-awareness-service.js";

function readJson(path) {
  try { return JSON.parse(fs.readFileSync(path, "utf8")); } catch { return null; }
}

export function buildCoverageReport(dayKey = athensDayKey()) {
  const states = readAllStates();
  const fixturesSnap = readJson(resolveDataPath("deploy-snapshots", dayKey, "fixtures-all.json"));

  // Count fixtures per league (today + window) from our snapshot.
  const fixturesByLeague = {};
  for (const m of (fixturesSnap?.matches || [])) {
    if (!m.leagueSlug) continue;
    fixturesByLeague[m.leagueSlug] = (fixturesByLeague[m.leagueSlug] || 0) + 1;
  }

  // Leagues to assess: all active, plus any league that has fixtures.
  const slugs = new Set([
    ...Object.values(states).filter(l => l.state === "active").map(l => l.slug),
    ...Object.keys(fixturesByLeague)
  ]);

  const rows = [];
  for (const slug of slugs) {
    const standing = readStandings(slug)?.accepted || null;
    const hasStandings = !!(standing && standing.rows?.length);
    const fixtures = fixturesByLeague[slug] || 0;

    rows.push({
      slug,
      name: getLeagueMeta(slug).name,
      state: states[slug]?.state || (slug.startsWith("fifa.") || slug.startsWith("uefa.") ? "international" : "unknown"),
      fixtures,
      standings: hasStandings,
      standingsTeams: hasStandings ? standing.rows.length : 0,
      history: hasLeagueHistory(slug),
      // Our statistical assessment needs standings; full value also needs form/history-index (not yet from our sources).
      assessmentReady: hasStandings,
      valuePrereqsComplete: false // form/history-index/details from our sources: not built yet
    });
  }

  rows.sort((a, b) => b.fixtures - a.fixtures || a.slug.localeCompare(b.slug));

  const withFixtures = rows.filter(r => r.fixtures > 0);
  const report = {
    ok: true,
    dayKey,
    generatedAt: new Date().toISOString(),
    totals: {
      leaguesConsidered: rows.length,
      activeLeagues: Object.values(states).filter(l => l.state === "active").length,
      leaguesWithFixtures: withFixtures.length,
      withStandings: rows.filter(r => r.standings).length,
      withHistory: rows.filter(r => r.history).length,
      assessmentReady: rows.filter(r => r.assessmentReady).length
    },
    gaps: {
      // The explicit "what's missing" lists.
      fixtureLeaguesMissingStandings: withFixtures.filter(r => !r.standings).map(r => r.slug),
      activeLeaguesMissingStandings: rows.filter(r => r.state === "active" && !r.standings).map(r => r.slug),
      leaguesMissingHistory: rows.filter(r => !r.history && r.state === "active").map(r => r.slug)
    },
    leagues: rows
  };

  fs.writeFileSync(resolveDataPath("league-memory", "coverage-report.json"), JSON.stringify(report, null, 2), "utf8");
  return report;
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const arg = process.argv.slice(2).find(a => /^\d{4}-\d{2}-\d{2}$/.test(a)) || athensDayKey();
  const r = buildCoverageReport(arg);
  console.log(JSON.stringify({ totals: r.totals, gaps: r.gaps }, null, 2));
}
