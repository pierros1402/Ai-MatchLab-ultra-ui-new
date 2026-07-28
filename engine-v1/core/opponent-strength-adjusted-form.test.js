import test from "node:test";
import assert from "node:assert/strict";
import { buildAdjustedFormProfile, adjustMarketProbabilities } from "./opponent-strength-adjusted-form.js";

test("weak-opposition scoring inflation is reduced", () => {
  const standings = [
    { teamName: "Top", position: 1, played: 10, points: 25, goalsFor: 22, goalsAgainst: 8 },
    { teamName: "Bottom", position: 10, played: 10, points: 5, goalsFor: 8, goalsAgainst: 25 }
  ];
  const opponents = new Map([["Bottom", standings[1]]]);
  const profile = buildAdjustedFormProfile({
    standings,
    opponentRows: opponents,
    peerStrength: 0.9,
    results: [
      { opp: "Bottom", gf: 4, ga: 0, res: "W" },
      { opp: "Bottom", gf: 3, ga: 1, res: "W" },
      { opp: "Bottom", gf: 4, ga: 1, res: "W" }
    ]
  });
  assert.ok(profile.adjusted.gfRate <= profile.raw.gfRate);
  assert.ok(profile.reasonCodes.includes("no_strong_opposition_sample"));
});

test("adjusted market probabilities preserve complements", () => {
  const profile = { sampleReliability: 1, impact: { ppg: 0.5, over25Rate: -0.2, bttsRate: -0.1 } };
  const out = adjustMarketProbabilities({
    "1X2": { probs: { home: 0.5, draw: 0.25, away: 0.25 } },
    OU25: { probs: { over: 0.7, under: 0.3 } },
    BTTS: { probs: { yes: 0.65, no: 0.35 } }
  }, profile, profile).markets;
  assert.equal(Number((out.OU25.probs.over + out.OU25.probs.under).toFixed(6)), 1);
  assert.equal(Number((out.BTTS.probs.yes + out.BTTS.probs.no).toFixed(6)), 1);
  assert.equal(Number((out["1X2"].probs.home + out["1X2"].probs.draw + out["1X2"].probs.away).toFixed(6)), 1);
});
