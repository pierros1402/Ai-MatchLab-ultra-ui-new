import { readStandings } from "../storage/standings-memory-db.js";
import { readResults } from "../storage/results-memory-db.js";
import { normalizeTeamKey } from "./normalize.js";
import { buildAdjustedFormProfile, standingsStrength } from "./opponent-strength-adjusted-form.js";

function findRow(rows, name) {
  const key = normalizeTeamKey(name);
  return rows.find(row => normalizeTeamKey(row?.teamName || row?.team || row?.name) === key) || null;
}
function findResults(teams, name) {
  const key = normalizeTeamKey(name);
  for (const [team, rows] of Object.entries(teams || {})) {
    if (normalizeTeamKey(team) === key) return Array.isArray(rows) ? rows : [];
  }
  return [];
}
export function loadOpponentAdjustedProfiles(leagueSlug, homeTeam, awayTeam, window = 12) {
  const standingsPayload = readStandings(leagueSlug);
  const rows = standingsPayload?.accepted?.rows || standingsPayload?.rows || [];
  const resultsPayload = readResults(leagueSlug);
  const homeRow = findRow(rows, homeTeam);
  const awayRow = findRow(rows, awayTeam);
  const opponentRows = new Map(rows.map(row => [String(row?.teamName || row?.team || row?.name || ""), row]));
  const homeStrength = standingsStrength(homeRow, rows);
  const awayStrength = standingsStrength(awayRow, rows);
  const home = buildAdjustedFormProfile({ results: findResults(resultsPayload?.teams, homeTeam).slice(0, window), standings: rows, opponentRows, peerStrength: awayStrength });
  const away = buildAdjustedFormProfile({ results: findResults(resultsPayload?.teams, awayTeam).slice(0, window), standings: rows, opponentRows, peerStrength: homeStrength });
  return { home, away, standingsCoverage: rows.length, homeStrength, awayStrength };
}
