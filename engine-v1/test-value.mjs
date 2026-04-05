import { evaluateMatchValue } from "./core/value-engine-v1.js";

const out = await evaluateMatchValue({
  leagueSlug: "esp.2",
  homeTeam: "FC Andorra",
  awayTeam: "Malaga",
  kickoff: "2026-04-01T17:00Z",
  season: "2025-2026"
});

console.log(JSON.stringify(out, null, 2));
