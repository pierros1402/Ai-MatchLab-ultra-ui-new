// =====================================================
// AIMATCHLAB — Ranking Engine Test Harness
// Run manually to validate standings logic
// =====================================================

import { computeStandings } from "../workers/_shared/ranking-engine.js";

// -----------------------------------------------------
// TEST DATA (fake mini league)
// -----------------------------------------------------

const teams = {
  Arsenal: {
    points: 50,
    goalsFor: 45,
    goalsAgainst: 20
  },
  Chelsea: {
    points: 50,
    goalsFor: 40,
    goalsAgainst: 22
  },
  Liverpool: {
    points: 48,
    goalsFor: 44,
    goalsAgainst: 25
  }
};

const h2hMatrix = {
  "Arsenal|Chelsea": {
    pointsA: 3,
    pointsB: 0,
    goalsA: 2,
    goalsB: 1
  }
};

const leagueRules = {
  tieBreakOrder: [
    "points",
    "h2h",
    "goalDifference",
    "goalsFor"
  ],
  phases: {
    regular: {
      type: "table"
    }
  }
};

// -----------------------------------------------------
// RUN ENGINE
// -----------------------------------------------------

const result = computeStandings({
  teams,
  h2hMatrix,
  leagueRules,
  phase: "regular"
});

// -----------------------------------------------------
// OUTPUT
// -----------------------------------------------------

console.log("\n=== STANDINGS ===");
console.table(result.standings);

console.log("\nRanking Hash:", result.rankingHash);
console.log("\nTie Groups:", result.tieGroups);