import fs from "node:fs";
import { resolveDataPath } from "../storage/data-root.js";
import { validateHistoryIndexFoundationSync } from "./derived-history-foundation.js";
import { historicalFormRowsBeforeKickoff } from "./details-rich-blocks.js";
import { currentSeason, seasonBefore } from "./season.js";
import { createCrossCompetitionFormResolver } from "../storage/cross-competition-form-db.js";

const NATIONAL_COMPETITIONS = new Set(["fifa.world", "fifa.world.qual", "uefa.nations", "uefa.euro", "uefa.euro.qual", "caf.nations", "afc.asian_cup", "conmebol.copa_america", "concacaf.nations"]);

export function verifiedNationalForm(index, slug, team, nowMs, window = 6) {
  if (!NATIONAL_COMPETITIONS.has(slug)) return null;
  const rows = eligibleRecentRows(index?.[team], nowMs).filter(row => NATIONAL_COMPETITIONS.has(row.leagueSlug) && (row.homeTeam === team || row.awayTeam === team));
  const identities = new Set(rows.map(row => row.homeTeam === team
    ? row.homeGlobalClubId || row.productionIdentityBinding?.homeGlobalClubId
    : row.awayGlobalClubId || row.productionIdentityBinding?.awayGlobalClubId).filter(Boolean));
  if (identities.size > 1) return { sample: 0, reason: "global_club_id_conflict", source: "verified_national_team_form" };
  const selected = rows.slice(-Math.min(6, Math.max(1, window)));
  let gf = 0, ga = 0, points = 0;
  for (const row of selected) {
    const home = row.homeTeam === team;
    const scored = Number(home ? row.scoreHome : row.scoreAway), conceded = Number(home ? row.scoreAway : row.scoreHome);
    gf += scored; ga += conceded; points += scored > conceded ? 3 : scored === conceded ? 1 : 0;
  }
  return { sample: selected.length, gfRate: selected.length ? gf / selected.length : null,
    gaRate: selected.length ? ga / selected.length : null, ppg: selected.length ? points / selected.length : null,
    source: "verified_national_team_form", sourceSlugs: [...new Set(selected.map(row => row.leagueSlug))],
    reason: selected.length ? null : "no_verified_national_history" };
}

export function verifiedFormRates(index, slug, team, nowMs) {
  const rows = eligibleRecentRows(index?.[team], nowMs)
    .filter(row => row.leagueSlug === slug && (row.homeTeam === team || row.awayTeam === team)).slice(-6);
  let gf = 0, ga = 0, points = 0;
  for (const row of rows) {
    const home = row.homeTeam === team;
    const scored = Number(home ? row.scoreHome : row.scoreAway);
    const conceded = Number(home ? row.scoreAway : row.scoreHome);
    gf += scored; ga += conceded; points += scored > conceded ? 3 : scored === conceded ? 1 : 0;
  }
  return { sample: rows.length, gfRate: rows.length ? gf / rows.length : null,
    gaRate: rows.length ? ga / rows.length : null, ppg: rows.length ? points / rows.length : null };
}

function eligibleRecentRows(entry, nowMs) {
  const seen = new Set();
  return historicalFormRowsBeforeKickoff(entry, new Date(nowMs).toISOString()).filter(row => {
    const timestamp = Number(row.kickoff_ms) || Date.parse(row.kickoff || row.kickoffUtc);
    if (timestamp < nowMs - 180 * 86400000) return false;
    const id = row.canonicalId || row.matchId || row.id || [row.leagueSlug, timestamp, row.homeTeam, row.awayTeam].join("|");
    if (seen.has(id)) return false;
    seen.add(id); return true;
  });
}

export function mergeVerifiedFormIndexes(indexes) {
  const result = {};
  for (const index of indexes) {
    for (const [team, entry] of Object.entries(index || {})) {
      (result[team] ||= { matches: [] }).matches.push(...(entry.matches || []));
    }
  }
  return result;
}

export function verifiedHistoryResultDocuments(index, nowMs) {
  const documents = new Map();
  for (const [team, entry] of Object.entries(index || {})) {
    for (const row of eligibleRecentRows(entry, nowMs)) {
      if (!row.leagueSlug || (row.homeTeam !== team && row.awayTeam !== team)) continue;
      const home = row.homeTeam === team;
      const gf = Number(home ? row.scoreHome : row.scoreAway), ga = Number(home ? row.scoreAway : row.scoreHome);
      const doc = documents.get(row.leagueSlug) || { slug: row.leagueSlug, doc: { teams: {} } };
      (doc.doc.teams[team] ||= []).push({ ...row,
        matchId: row.matchId || row.id,
        date: row.kickoff || row.kickoffUtc || new Date(row.kickoff_ms).toISOString(),
        ha: home ? "H" : "A", opp: home ? row.awayTeam : row.homeTeam,
        gf, ga, res: gf > ga ? "W" : gf === ga ? "D" : "L" });
      documents.set(row.leagueSlug, doc);
    }
  }
  return [...documents.values()];
}

export function createPrematchVerifiedEvidence(nowMs) {
  const season = currentSeason(new Date(nowMs));
  const indexes = [];
  for (const label of [seasonBefore(season), season]) {
    if (validateHistoryIndexFoundationSync(label).ok) {
      indexes.push(JSON.parse(fs.readFileSync(resolveDataPath("history-index", "team-form", `${label}.json`), "utf8")));
    }
  }
  const index = mergeVerifiedFormIndexes(indexes);
  const clubCrossForm = createCrossCompetitionFormResolver({ resultDocuments: verifiedHistoryResultDocuments(index, nowMs) });
  return { formFn: (slug, team) => verifiedFormRates(index, slug, team, nowMs),
    crossFormFn: (slug, team, window, options) => verifiedNationalForm(index, slug, team, nowMs, window) || clubCrossForm(slug, team, window, options) };
}

export function createPrematchVerifiedForm(nowMs) { return createPrematchVerifiedEvidence(nowMs).formFn; }
