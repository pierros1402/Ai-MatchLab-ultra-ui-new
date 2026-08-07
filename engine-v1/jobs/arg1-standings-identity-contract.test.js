import test from "node:test";
import assert from "node:assert/strict";

import {
  canonicalTeamName
} from "../storage/team-aliases-db.js";

import {
  computeStandingsCompleteness
} from "./build-standings-day.js";

test("arg.1 league-scoped aliases collapse four provider spellings", () => {
  const cases = [
    ["Estudiantes L.P.", "Estudiantes de La Plata"],
    ["Gimnasia L.P.", "Gimnasia La Plata"],
    ["Argentinos Jrs", "Argentinos Juniors"],
    ["Belgrano", "Belgrano (Córdoba)"]
  ];

  for (const [alias, canonical] of cases) {
    assert.equal(
      canonicalTeamName("arg.1", alias),
      canonical
    );
  }
});

test("arg.1 2026 completeness contract is 30 teams", () => {
  const rows = Array.from(
    { length: 30 },
    (_, index) => ({
      position: index + 1,
      team: "Team " + String(index + 1)
    })
  );

  const result =
    computeStandingsCompleteness(
      rows,
      "arg.1"
    );

  assert.equal(result.rowCount, 30);
  assert.equal(result.expectedSize, 30);
  assert.equal(result.completeness, 1);
  assert.equal(result.oversized, false);
});
