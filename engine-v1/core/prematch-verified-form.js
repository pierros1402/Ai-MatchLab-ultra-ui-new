import fs from "node:fs";
import { resolveDataPath } from "../storage/data-root.js";
import { validateHistoryIndexFoundationSync } from "./derived-history-foundation.js";
import { historicalFormRowsBeforeKickoff } from "./details-rich-blocks.js";
import { currentSeason } from "./season.js";
import { createCrossCompetitionFormResolver } from "../storage/cross-competition-form-db.js";

export function verifiedFormRates(index, slug, team, nowMs) {
  const rows = historicalFormRowsBeforeKickoff(index?.[team], new Date(nowMs).toISOString())
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

export function verifiedHistoryResultDocuments(index, nowMs) {
  const documents = new Map();
  for (const [team, entry] of Object.entries(index || {})) {
    for (const row of historicalFormRowsBeforeKickoff(entry, new Date(nowMs).toISOString())) {
      if (!row.leagueSlug || (row.homeTeam !== team && row.awayTeam !== team)) continue;
      const home = row.homeTeam === team;
      const gf = Number(home ? row.scoreHome : row.scoreAway), ga = Number(home ? row.scoreAway : row.scoreHome);
      const doc = documents.get(row.leagueSlug) || { slug: row.leagueSlug, doc: { teams: {} } };
      (doc.doc.teams[team] ||= []).push({ ...row,
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
  let index = {};
  if (validateHistoryIndexFoundationSync(season).ok) {
    index = JSON.parse(fs.readFileSync(resolveDataPath("history-index", "team-form", `${season}.json`), "utf8"));
  }
  return { formFn: (slug, team) => verifiedFormRates(index, slug, team, nowMs),
    crossFormFn: createCrossCompetitionFormResolver({ resultDocuments: verifiedHistoryResultDocuments(index, nowMs) }) };
}

export function createPrematchVerifiedForm(nowMs) { return createPrematchVerifiedEvidence(nowMs).formFn; }
