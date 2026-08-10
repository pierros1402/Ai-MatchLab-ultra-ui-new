import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHistoryBackedStandingsArtifact,
  isStrictStandingsHistoryRow,
  loadStandingsFoundationRegistry,
  readHistoryRows,
  validateStandingsFoundationArtifact,
} from "./standings-foundation.js";

test("standings history rows reject scheduled/null score contamination", () => {
  assert.equal(isStrictStandingsHistoryRow({
    leagueSlug: "arg.1",
    status: "STATUS_SCHEDULED",
    homeTeam: "A",
    awayTeam: "B",
    scoreHome: 0,
    scoreAway: 0,
  }, "arg.1"), false);

  assert.equal(isStrictStandingsHistoryRow({
    leagueSlug: "arg.1",
    status: "FT",
    homeTeam: "A",
    awayTeam: "B",
    scoreHome: null,
    scoreAway: null,
  }, "arg.1"), false);

  assert.equal(isStrictStandingsHistoryRow({
    leagueSlug: "arg.1",
    status: "FT",
    homeTeam: "A",
    awayTeam: "B",
    scoreHome: 2,
    scoreAway: 1,
  }, "arg.1"), true);
});

test("real repaired history exposes only contract-PASS standings", () => {
  const historyRows = readHistoryRows("2026-2027");
  const registryBundle = loadStandingsFoundationRegistry();
  const expectedPass = new Set(["arg.1", "col.1", "den.1", "mex.1"]);

  for (const slug of ["arg.1", "col.1", "den.1", "mex.1", "aus.1", "bol.1", "per.1", "rus.1"]) {
    const artifact = buildHistoryBackedStandingsArtifact({
      slug,
      historySeason: "2026-2027",
      historyRows,
      registryBundle,
      builtAt: "TEST",
    });
    assert.equal(artifact.foundation.usable, expectedPass.has(slug), slug);
    assert.equal(artifact.table.length > 0, expectedPass.has(slug), slug);
  }
});

test("source lineage invalidates an artifact when league history changes", () => {
  const historyRows = readHistoryRows("2026-2027");
  const artifact = buildHistoryBackedStandingsArtifact({
    slug: "arg.1",
    historySeason: "2026-2027",
    historyRows,
    registryBundle: loadStandingsFoundationRegistry(),
    builtAt: "TEST",
  });
  assert.equal(artifact.foundation.status, "PASS");

  const changedRows = [...historyRows, {
    id: "test_lineage_change",
    leagueSlug: "arg.1",
    dayKey: "2026-08-09",
    status: "FT",
    homeTeam: "Boca Juniors",
    awayTeam: "River Plate",
    scoreHome: 9,
    scoreAway: 9,
    kickoff_ms: 9999999999999,
  }];

  const validation = validateStandingsFoundationArtifact(artifact, {
    slug: "arg.1",
    historyRows: changedRows,
  });
  assert.equal(validation.ok, false);
  assert.ok(validation.issues.includes("HISTORY_FINGERPRINT_STALE"));
});
