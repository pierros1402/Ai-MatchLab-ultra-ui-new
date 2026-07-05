/**
 * acquire-team-news-transfermarkt-day.js
 *
 * Fill the day's team-news records from Transfermarkt's per-competition
 * "Suspensions and injuries" page — ONE fetch per league covers every club
 * (player, reason, out-until date, missed games, club). This is the first
 * deterministic team-news SOURCE: before it, coverage was 0/N because no feed
 * existed for the active summer leagues.
 *
 * Truthfulness rules:
 *  - a club is attributed to a fixture team only on a conservative name match
 *    (exact normalized, equal token sets, or token-subset); ambiguous → skipped
 *  - a matched team with zero TM rows gets a dated "no absences listed" note +
 *    the page URL as evidence — a checked-empty, distinct from "no data"
 *  - leagues without a TM competition page are left untouched (no source)
 *
 * Usage: node engine-v1/jobs/acquire-team-news-transfermarkt-day.js [dayKey]
 */

import fs from "fs";
import path from "path";
import { ensureDir, resolveDataPath } from "../storage/data-root.js";
import {
  readTeamNewsRecord,
  writeTeamNewsRecord
} from "../storage/team-news-db.js";
import {
  fetchCompetitionAbsences,
  TM_ABSENCE_COMPETITIONS
} from "../odds/transfermarkt-absences-source.js";
import { buildTeamNewsWorksetDay } from "./build-team-news-workset-day.js";

function log(...a) { console.log("[team-news-tm]", ...a); }

function readJsonSafe(file, fallback = null) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function athensDayKey(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Athens" }).format(date);
}

// Tokens that carry no identity (club-form prefixes/suffixes) — dropped before
// token-set comparison so "Kalmar FF" ↔ "Kalmar FF" and "FC Ordabasy" ↔
// "Ordabasy" match, while "Racing Club" vs "Racing Córdoba" stays apart.
const GENERIC_TOKENS = new Set([
  "fc", "cf", "fk", "sk", "sc", "ac", "bk", "ff", "if", "ik", "afc", "cd",
  "ca", "club", "clube", "cs", "ks", "nk", "sv", "us", "kf", "sp", "ii", "b",
  "de", "the", "team"
]);

function normalizeComparable(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function identityTokens(value) {
  return new Set(
    normalizeComparable(value)
      .split(" ")
      .filter(t => t && !GENERIC_TOKENS.has(t))
  );
}

function isSubset(a, b) {
  for (const t of a) if (!b.has(t)) return false;
  return a.size > 0;
}

/**
 * Conservative club↔team match. Returns the single matching club name or null
 * (null also when two clubs match — ambiguity must not fabricate attribution).
 */
export function matchClubForTeam(teamName, clubNames) {
  const teamNorm = normalizeComparable(teamName);
  const teamTokens = identityTokens(teamName);
  if (!teamNorm) return null;

  const hits = [];
  for (const club of clubNames) {
    const clubNorm = normalizeComparable(club);
    if (!clubNorm) continue;

    if (clubNorm === teamNorm) {
      hits.push({ club, exact: true });
      continue;
    }

    const clubTokens = identityTokens(club);
    if (!teamTokens.size || !clubTokens.size) continue;

    const equal =
      teamTokens.size === clubTokens.size && isSubset(teamTokens, clubTokens);
    const subset =
      isSubset(teamTokens, clubTokens) || isSubset(clubTokens, teamTokens);

    if (equal || subset) hits.push({ club, exact: false });
  }

  const exact = hits.filter(h => h.exact);
  if (exact.length === 1) return exact[0].club;
  if (exact.length > 1) return null;
  if (hits.length === 1) return hits[0].club;
  return null;
}

function absenceRowsForRecord(rows, teamName, clubName) {
  return (rows || []).map(row => ({
    player: row.player,
    reason: [
      row.reason || (row.type === "suspension" ? "Suspension" : "Injury"),
      row.until ? `out until ${row.until}` : null,
      Number.isFinite(row.missedGames) && row.missedGames > 0
        ? `misses ${row.missedGames} game${row.missedGames === 1 ? "" : "s"}`
        : null
    ].filter(Boolean).join(" — "),
    importance: row.type === "suspension" ? "high" : "medium",
    team: teamName,
    sourceTeam: clubName
  }));
}

function worksetTeams(dayKey) {
  const file = resolveDataPath("team-news", "_worksets", `${dayKey}.json`);
  const payload = readJsonSafe(file, null);
  if (!payload) return null;

  const seen = new Set();
  const teams = [];
  for (const row of [
    ...(Array.isArray(payload?.missing) ? payload.missing : []),
    ...(Array.isArray(payload?.existing) ? payload.existing : [])
  ]) {
    const team = String(row?.team || "").trim();
    const leagueSlug = String(row?.leagueSlug || "").trim();
    if (!team || !leagueSlug) continue;
    const key = `${leagueSlug}::${team.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    teams.push({
      team,
      leagueSlug,
      matchId: String(row?.matchId || "").trim() || null
    });
  }
  return teams;
}

export async function acquireTeamNewsTransfermarktDay(dayKey = athensDayKey(), options = {}) {
  const delayMs = Number.isFinite(Number(options?.delayMs)) ? Number(options.delayMs) : 800;

  let teams = worksetTeams(dayKey);
  if (!teams) {
    await buildTeamNewsWorksetDay(dayKey);
    teams = worksetTeams(dayKey) || [];
  }

  const byLeague = new Map();
  for (const row of teams) {
    if (!byLeague.has(row.leagueSlug)) byLeague.set(row.leagueSlug, []);
    byLeague.get(row.leagueSlug).push(row);
  }

  const report = {
    ok: true,
    dayKey,
    generatedAt: new Date().toISOString(),
    provider: "transfermarkt",
    totalTeams: teams.length,
    writtenCount: 0,
    withAbsencesCount: 0,
    checkedEmptyCount: 0,
    unmatchedTeamCount: 0,
    leaguesWithoutSource: [],
    byLeague: {}
  };

  for (const [slug, leagueTeams] of byLeague) {
    if (!TM_ABSENCE_COMPETITIONS[slug]) {
      report.leaguesWithoutSource.push(slug);
      continue;
    }

    const fetched = await fetchCompetitionAbsences(slug);

    if (!fetched.ok) {
      report.byLeague[slug] = { ok: false, reason: fetched.reason, teamCount: leagueTeams.length };
      log("league fetch failed", { slug, reason: fetched.reason });
      continue;
    }

    const clubNames = [...fetched.byClub.keys()];
    const leagueReport = {
      ok: true,
      code: fetched.code,
      competitionName: fetched.competitionName,
      absenceCount: fetched.absenceCount,
      teamCount: leagueTeams.length,
      matched: [],
      unmatchedTeams: [],
      unmatchedClubs: []
    };

    // Pass 1 — attribute clubs to the day's teams.
    const matchedClubs = new Set();
    const teamMatches = leagueTeams.map(row => {
      const club = matchClubForTeam(row.team, clubNames);
      if (club) matchedClubs.add(club);
      return { ...row, club };
    });

    // Clubs with absences that no fixture team claimed. Mostly clubs not
    // playing today — but possibly a naming miss for one that IS. A team may
    // only get the "no absences listed" note when no unclaimed club shares an
    // identity token with it; otherwise the note could be false.
    const unclaimedClubs = clubNames.filter(c => !matchedClubs.has(c));
    const unclaimedTokenSets = unclaimedClubs.map(c => identityTokens(c));

    function safeCheckedEmpty(teamName) {
      const teamTokens = identityTokens(teamName);
      return unclaimedTokenSets.every(tokens => {
        for (const t of tokens) if (teamTokens.has(t)) return false;
        return true;
      });
    }

    for (const { team, matchId, club } of teamMatches) {
      const rows = club ? fetched.byClub.get(club) : null;
      const absences = rows ? absenceRowsForRecord(rows, team, club) : [];

      if (!absences.length && !safeCheckedEmpty(team)) {
        report.unmatchedTeamCount++;
        leagueReport.unmatchedTeams.push({ team, reason: "similar_unclaimed_club" });
        continue;
      }

      const evidence = [{
        url: fetched.url,
        label: `${fetched.competitionName || fetched.code} — Suspensions & injuries`,
        publisher: "Transfermarkt",
        publishedAt: fetched.fetchedAt
      }];

      const notes = absences.length
        ? []
        : [`No current injuries or suspensions listed for ${team} in ${fetched.competitionName || fetched.code} on Transfermarkt (checked ${dayKey}).`];

      const existing = readTeamNewsRecord(team);

      try {
        writeTeamNewsRecord({
          key: existing?.key || team,
          team: existing?.team || team,
          leagueSlug: slug,
          matchIds: [...(existing?.matchIds || []), ...(matchId ? [matchId] : [])],
          aliases: [...(existing?.aliases || []), team, ...(club ? [club] : [])],
          absences: [...(existing?.absences || []), ...absences],
          notes: [...(existing?.notes || []), ...notes],
          evidence: [...(existing?.evidence || []), ...evidence],
          source: "transfermarkt-competition-absences",
          sourceMeta: {
            provider: "transfermarkt",
            mode: "competition_absences",
            status: absences.length ? "absences_found" : "checked_empty",
            confidence: 0.85,
            evidenceCount: evidence.length,
            generatedAt: fetched.fetchedAt
          }
        });
      } catch (err) {
        log("write failed", { team, error: String(err?.message || err) });
        continue;
      }

      report.writtenCount++;
      if (absences.length) {
        report.withAbsencesCount++;
        leagueReport.matched.push({ team, club, absences: absences.length });
      } else {
        report.checkedEmptyCount++;
      }
    }

    leagueReport.unmatchedClubs = unclaimedClubs;
    report.byLeague[slug] = leagueReport;

    log("league done", {
      slug,
      code: fetched.code,
      competition: fetched.competitionName,
      absences: fetched.absenceCount,
      teams: leagueTeams.length,
      withAbsences: leagueReport.matched.length,
      unmatchedClubs: leagueReport.unmatchedClubs.length
    });

    if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
  }

  const outFile = resolveDataPath("team-news", "_reports", `${dayKey}.transfermarkt.json`);
  ensureDir(path.dirname(outFile));
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2), "utf8");
  report.file = outFile;

  log("done", {
    dayKey,
    totalTeams: report.totalTeams,
    written: report.writtenCount,
    withAbsences: report.withAbsencesCount,
    checkedEmpty: report.checkedEmptyCount,
    leaguesWithoutSource: report.leaguesWithoutSource.length
  });

  return report;
}

const isDirectRun =
  process.argv[1] && process.argv[1].endsWith("acquire-team-news-transfermarkt-day.js");

if (isDirectRun) {
  const arg = String(process.argv[2] || "").trim() || undefined;
  acquireTeamNewsTransfermarktDay(arg)
    .then(r => {
      console.log(JSON.stringify({
        ok: r.ok,
        dayKey: r.dayKey,
        totalTeams: r.totalTeams,
        writtenCount: r.writtenCount,
        withAbsencesCount: r.withAbsencesCount,
        checkedEmptyCount: r.checkedEmptyCount,
        leaguesWithoutSource: r.leaguesWithoutSource,
        file: r.file
      }, null, 2));
    })
    .catch(err => {
      console.error("[team-news-tm] fatal", err);
      process.exit(1);
    });
}
