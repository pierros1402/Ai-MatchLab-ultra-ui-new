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
import { getLeagueMeta } from "../source-discovery/league-awareness-service.js";
import { currentSeason } from "../core/season.js";
import { isLeagueCompetition, LEAGUE_ONLY_SEEDS, LEAGUES_BY_SLUG } from "../../workers/_shared/leagues-coverage.js";

function readJson(path) {
  try { return JSON.parse(fs.readFileSync(path, "utf8")); } catch { return null; }
}

// Real derived history lives in data/history-index (built from data/history) —
// keyed by competition slug. The old hasLeagueHistory() read
// data/league-memory/history, a thin bootstrap store (~32 files) that reported
// withHistory:3 while the true coverage is ~198 competitions (audit §8.1).
function loadHistorySlugs() {
  const season = currentSeason();
  const leagueForm = readJson(resolveDataPath("history-index", "league-form", `${season}.json`)) || {};
  return new Set(Object.keys(leagueForm));
}

export function buildCoverageReport(dayKey = athensDayKey()) {
  const states = readAllStates();
  const historySlugs = loadHistorySlugs();
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
      type: LEAGUES_BY_SLUG[slug]?.type || (slug.startsWith("fifa.") || slug.startsWith("uefa.") ? "international" : "unknown"),
      isLeague: isLeagueCompetition(slug),
      state: states[slug]?.state || (slug.startsWith("fifa.") || slug.startsWith("uefa.") ? "international" : "unknown"),
      fixtures,
      standings: hasStandings,
      standingsTeams: hasStandings ? standing.rows.length : 0,
      history: historySlugs.has(slug),
      // Our statistical assessment needs standings; full value also needs form/history-index (not yet from our sources).
      assessmentReady: hasStandings,
      valuePrereqsComplete: false // form/history-index/details from our sources: not built yet
    });
  }

  rows.sort((a, b) => b.fixtures - a.fixtures || a.slug.localeCompare(b.slug));

  // League-only view: cups / continental / international must NOT count as league
  // coverage (audit §8.2). They stay in `leagues` for transparency but the
  // headline totals/gaps are league-only.
  const leagueRows = rows.filter(r => r.isLeague);
  const leaguesWithFixtures = leagueRows.filter(r => r.fixtures > 0);
  const coveredTargetLeagues = LEAGUE_ONLY_SEEDS.filter(s => historySlugs.has(s));
  const missingTargetLeagues = LEAGUE_ONLY_SEEDS.filter(s => !historySlugs.has(s));

  const report = {
    ok: true,
    dayKey,
    generatedAt: new Date().toISOString(),
    scope: "league-only totals; cups/continental/international listed but not counted",
    totals: {
      // League-only headline numbers.
      leaguesConsidered: leagueRows.length,
      activeLeagues: leagueRows.filter(r => r.state === "active").length,
      leaguesWithFixtures: leaguesWithFixtures.length,
      withStandings: leagueRows.filter(r => r.standings).length,
      withHistory: leagueRows.filter(r => r.history).length,
      assessmentReady: leagueRows.filter(r => r.assessmentReady).length,
      // Target = registry league seeds (type === "league").
      targetLeagues: LEAGUE_ONLY_SEEDS.length,
      coveredTargetLeagues: coveredTargetLeagues.length,
      missingTargetLeagues: missingTargetLeagues.length,
      // Non-league competitions present in the considered set (transparency).
      nonLeagueCompetitions: rows.length - leagueRows.length
    },
    gaps: {
      // The explicit "what's missing" lists — league-only.
      fixtureLeaguesMissingStandings: leaguesWithFixtures.filter(r => !r.standings).map(r => r.slug),
      activeLeaguesMissingStandings: leagueRows.filter(r => r.state === "active" && !r.standings).map(r => r.slug),
      leaguesMissingHistory: leagueRows.filter(r => !r.history && r.state === "active").map(r => r.slug),
      // Registry league seeds with no derived history at all.
      targetLeaguesMissingHistory: missingTargetLeagues
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
