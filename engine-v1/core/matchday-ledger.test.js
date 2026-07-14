import test from "node:test";
import assert from "node:assert/strict";

import { assignRounds, summarizeLedger, crossCheckAgainstAxis } from "./matchday-ledger.js";

// Build a tidy N-team, R-round double(or single) round-robin schedule where every
// team plays exactly once per round, rounds one day apart. Enough to prove the
// counting is correct without hand-writing fixtures.
function roundRobinMatches(teams, rounds) {
  const names = Array.from({ length: teams }, (_, i) => `T${i + 1}`);
  const out = [];
  let ms = Date.UTC(2026, 0, 1);
  for (let r = 0; r < rounds; r++) {
    // simple circle-method pairing; identity is all we need, not real fairness
    for (let i = 0; i < teams / 2; i++) {
      const home = names[(r + i) % teams];
      const away = names[(r + teams - 1 - i) % teams];
      if (home === away) continue;
      out.push({ key: `r${r}-${i}`, homeTeam: home, awayTeam: away, kickoff_ms: ms });
    }
    ms += 86400000;
  }
  return out;
}

test("each round bumps every team's count → round equals matchday", () => {
  const matches = roundRobinMatches(4, 3); // 4 teams, 3 rounds, 2 matches/round
  const assigned = assignRounds(matches);
  const byRound = new Map();
  for (const a of assigned) byRound.set(a.round, (byRound.get(a.round) || 0) + 1);
  assert.equal(byRound.get(1), 2, "round 1 has 2 matches");
  assert.equal(byRound.get(2), 2, "round 2 has 2 matches");
  assert.equal(byRound.get(3), 2, "round 3 has 2 matches");
  assert.equal(Math.max(...assigned.map(a => a.round)), 3, "latest round is 3");
});

test("chronological order is respected regardless of input order", () => {
  const matches = roundRobinMatches(4, 2);
  const shuffled = [...matches].reverse();
  const a1 = assignRounds(matches);
  const a2 = assignRounds(shuffled);
  const key = m => m.map(x => `${x.key}:${x.round}`).sort().join(",");
  assert.equal(key(a1), key(a2), "round assignment is order-independent");
});

test("a postponed game lands on the higher of the two teams' counts", () => {
  // T1 & T2 each play 3 games; their round-2 fixture vs each other is played LAST
  // (postponed). By the time it happens both have played 2 other games, so their
  // running counts are 3 → the makeup match imputes to round 3, not 2.
  const D = 86400000;
  const base = Date.UTC(2026, 0, 1);
  const matches = [
    { key: "a", homeTeam: "T1", awayTeam: "T3", kickoff_ms: base + 0 * D },
    { key: "b", homeTeam: "T2", awayTeam: "T4", kickoff_ms: base + 0 * D },
    { key: "c", homeTeam: "T1", awayTeam: "T4", kickoff_ms: base + 7 * D },
    { key: "d", homeTeam: "T2", awayTeam: "T3", kickoff_ms: base + 7 * D },
    { key: "postponed", homeTeam: "T1", awayTeam: "T2", kickoff_ms: base + 14 * D }
  ];
  const assigned = assignRounds(matches);
  const pp = assigned.find(a => a.key === "postponed");
  assert.equal(pp.round, 3, "makeup match imputes to the higher running count");
});

test("degenerate / missing identity rows are skipped, not counted", () => {
  const base = Date.UTC(2026, 0, 1);
  const matches = [
    { key: "ok", homeTeam: "A", awayTeam: "B", kickoff_ms: base },
    { key: "self", homeTeam: "C", awayTeam: "C", kickoff_ms: base + 1000 },
    { key: "empty", homeTeam: "", awayTeam: "D", kickoff_ms: base + 2000 },
    { key: "noTime", homeTeam: "E", awayTeam: "F" }
  ];
  const assigned = assignRounds(matches);
  assert.equal(assigned.length, 1);
  assert.equal(assigned[0].key, "ok");
});

test("summarizeLedger reports coverage and a healthy (non-anomalous) shape", () => {
  const assigned = assignRounds(roundRobinMatches(18, 10));
  const s = summarizeLedger(assigned, 18);
  assert.equal(s.matchesWithRound, assigned.length);
  assert.equal(s.latestRound, 10);
  assert.equal(s.firstRound, 1);
  assert.equal(s.roundsSeen, 10);
  assert.equal(s.expectedPerRound, 9);
  assert.equal(s.anomaly.bool, false);
});

test("summarizeLedger flags an oversized round (contaminated identity)", () => {
  // A round with far more than floor(teams/2) matches → two clubs folded to one
  // key, or a wrong team count. 10 matches in one round for a nominal 6-team league.
  const base = Date.UTC(2026, 0, 1);
  const assigned = Array.from({ length: 10 }, (_, i) => ({
    key: `m${i}`, round: 1, homeCount: 1, awayCount: 1, kickoff_ms: base + i
  }));
  const s = summarizeLedger(assigned, 6); // expectedPerRound 3, cap ~5
  assert.equal(s.anomaly.bool, true);
  assert.equal(s.anomaly.reason, "oversized_round");
  assert.equal(s.oversizedRounds[0].round, 1);
});

test("crossCheckAgainstAxis agrees within tolerance, flags a real mismatch", () => {
  assert.equal(crossCheckAgainstAxis(15, 15).agrees, true);
  assert.equal(crossCheckAgainstAxis(15, 14).agrees, true, "one game in hand is fine");
  assert.equal(crossCheckAgainstAxis(15, 14).gap, 1);
  const bad = crossCheckAgainstAxis(30, 15);
  assert.equal(bad.agrees, false);
  assert.equal(bad.reason, "ledger_axis_mismatch");
  assert.equal(crossCheckAgainstAxis(15, null).agrees, false, "missing axis → no agreement");
});
