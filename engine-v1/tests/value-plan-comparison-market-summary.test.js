import test from "node:test";
import assert from "node:assert/strict";

import { summarizeByMarket } from "../jobs/build-value-plan-comparison-day.js";

test("market summary pools settled picks and excludes VOID/unresolved from win-rate denominator", () => {
  const summary = summarizeByMarket([
    { market: "OU25", result: "WIN" },
    { market: "OU25", result: "LOSS" },
    { market: "OU25", result: "VOID" },
    { market: "OU25", result: "UNRESOLVED" },
    { market: "BTTS", result: "WIN" },
    { market: "BTTS", result: "WIN" }
  ]);

  const ou25 = summary.find(row => row.market === "OU25");
  const btts = summary.find(row => row.market === "BTTS");

  assert.deepEqual(
    {
      picks: ou25.picks,
      settled: ou25.settled,
      wins: ou25.wins,
      losses: ou25.losses,
      voids: ou25.voids,
      unresolved: ou25.unresolved,
      hitRate: ou25.hitRate
    },
    {
      picks: 4,
      settled: 2,
      wins: 1,
      losses: 1,
      voids: 1,
      unresolved: 1,
      hitRate: 0.5
    }
  );

  assert.equal(btts.picks, 2);
  assert.equal(btts.settled, 2);
  assert.equal(btts.wins, 2);
  assert.equal(btts.losses, 0);
  assert.equal(btts.hitRate, 1);
});
