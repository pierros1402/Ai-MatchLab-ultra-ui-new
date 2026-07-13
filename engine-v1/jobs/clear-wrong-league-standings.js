/**
 * clear-wrong-league-standings.js
 *
 * Integrity guard for the standings store: drops an accepted table whose teams
 * do NOT belong to the league. This catches wrong-article scrapes — most often a
 * small league whose name collides with a Spanish club (Grenada↔Granada CF,
 * Andorra↔FC Andorra) picking up a partial Segunda División snippet.
 *
 * A table is cleared only when the league has a SUBSTANTIAL set of known teams
 * (from results-memory) AND the accepted table shares ZERO teams with them — a
 * stark, unambiguous mismatch. Legitimate tables always share several teams, so
 * false clears are effectively impossible; and a mistaken clear self-heals on
 * the next research pass anyway.
 *
 * Runs after derive-standings in run-day.js; daily-autonomous commits the store.
 */

import fs from "fs";
import { pathToFileURL } from "node:url";
import { resolveDataPath } from "../storage/data-root.js";
import { readResults } from "../storage/results-memory-db.js";
import { readStandings, clearAcceptedStandings } from "../storage/standings-memory-db.js";
import { getLeagueMeta } from "../source-discovery/league-awareness-service.js";
import { isClubSeasonUrl } from "../source-discovery/standings-researcher.js";

const MIN_KNOWN_TEAMS = 8; // enough that a zero overlap is unambiguous

// Generic tokens that appear across unrelated clubs and so cannot confirm a
// team belongs to a league. The league's COUNTRY name is added per-league — it
// is the worst offender (e.g. "FC Andorra" from a Spanish table matching the
// local "… d'Andorra" clubs by the country word alone).
const GENERIC_TOKENS = new Set([
  "club", "real", "city", "united", "sporting", "atletico", "athletic",
  "deportivo", "nacional", "national", "junior", "juniors", "academy",
  "reserves", "football"
]);

// Significant (4+ char) tokens of a team name, for lenient overlap matching that
// tolerates spelling/diacritic/abbreviation drift between Flashscore & Wikipedia.
function tokens(name, stop) {
  return new Set(
    String(name || "")
      .toLowerCase()
      .normalize("NFD").replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter(w => w.length >= 4 && !GENERIC_TOKENS.has(w) && !stop.has(w))
  );
}

function sharesAnyToken(a, bTokenSets, stop) {
  const at = tokens(a, stop);
  for (const bt of bTokenSets) {
    for (const tok of at) if (bt.has(tok)) return true;
  }
  return false;
}

function stopwordsForLeague(slug) {
  const stop = new Set();
  const country = String(getLeagueMeta(slug)?.country || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  for (const w of country.split(/[^a-z0-9]+/)) if (w.length >= 4) stop.add(w);
  return stop;
}

export function clearWrongLeagueStandings({ dryRun = false } = {}) {
  const dir = resolveDataPath("league-memory", "standings");
  let files = [];
  try { files = fs.readdirSync(dir).filter(f => f.endsWith(".json")); } catch { /* none */ }

  const stats = { considered: 0, checked: 0, cleared: 0, byLeague: {} };
  for (const file of files) {
    const slug = file.replace(/\.json$/, "");
    stats.considered++;

    const accepted = readStandings(slug)?.accepted;
    const stdTeams = (accepted?.rows || []).map(r => r.teamName).filter(Boolean);
    if (!stdTeams.length) continue;

    let reason = null;
    const knownTeams = Object.keys(readResults(slug)?.teams || {});

    // (a) The table was scraped from a SINGLE-CLUB season page — a definitively
    // wrong article, independent of whether we have a known roster (covers
    // leagues we don't even track results for, e.g. grn.2).
    if (accepted.url && isClubSeasonUrl(accepted.url)) {
      reason = "standings_from_club_season_page";
    } else if (knownTeams.length >= MIN_KNOWN_TEAMS) {
      // (b) The league has a substantial known roster but the accepted table
      // shares ZERO teams with it → wrong league entirely.
      stats.checked++;
      const stop = stopwordsForLeague(slug);
      const knownTokenSets = knownTeams.map(t => tokens(t, stop));
      const overlap = stdTeams.filter(t => sharesAnyToken(t, knownTokenSets, stop)).length;
      if (overlap === 0) reason = "standings_teams_do_not_match_league";
    }

    if (!reason) continue;
    if (!dryRun) clearAcceptedStandings(slug, reason);
    stats.cleared++;
    stats.byLeague[slug] = { season: accepted.season, source: accepted.source, url: accepted.url || null, standingsTeams: stdTeams.length, knownTeams: knownTeams.length, reason };
  }
  return { ok: true, dryRun, ...stats };
}

const entryUrl = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (entryUrl === import.meta.url) {
  const res = clearWrongLeagueStandings({ dryRun: process.argv.includes("--dry-run") });
  console.log(JSON.stringify(res, null, 2));
}
