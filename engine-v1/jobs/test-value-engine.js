// engine-v1/jobs/test-value-engine.js

import { evaluateMatchValue } from "../core/value-engine-v1.js";

async function run() {

  const tests = [
    {
      name: "MID SEASON",
      input: {
        leagueSlug: "eng.1",
        homeTeam: "Arsenal",
        awayTeam: "Chelsea",
        date: "2026-02-15"
      }
    },
    {
      name: "AFTER BREAK",
      input: {
        leagueSlug: "ger.1",
        homeTeam: "Bayern Munich",
        awayTeam: "Dortmund",
        date: "2026-01-20"
      }
    },
    {
      name: "SEASON START",
      input: {
        leagueSlug: "esp.1",
        homeTeam: "Barcelona",
        awayTeam: "Sevilla",
        date: "2025-08-20"
      }
    }
  ];

  for (const t of tests) {
    console.log("\n==============================");
    console.log("TEST:", t.name);

    try {
      const result = await evaluateMatchValue(t.input);

      console.log(JSON.stringify(result, null, 2));

    } catch (err) {
      console.error("ERROR:", err.message);
    }
  }
}

run();