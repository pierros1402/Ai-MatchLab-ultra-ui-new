import fs from "node:fs";
import { resolveDataPath } from "../storage/data-root.js";
import { validateHistoryIndexFoundationSync } from "./derived-history-foundation.js";
import { historicalFormRowsBeforeKickoff } from "./details-rich-blocks.js";
import { currentSeason } from "./season.js";

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

export function createPrematchVerifiedForm(nowMs) {
  const season = currentSeason(new Date(nowMs));
  let index = {};
  if (validateHistoryIndexFoundationSync(season).ok) {
    index = JSON.parse(fs.readFileSync(resolveDataPath("history-index", "team-form", `${season}.json`), "utf8"));
  }
  return (slug, team) => verifiedFormRates(index, slug, team, nowMs);
}
