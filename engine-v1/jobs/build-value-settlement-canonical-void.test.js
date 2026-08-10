import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { buildSettlementReport } from "./build-value-settlement-from-final-results-day.js";

test("settlement job uses canonical non-played truth for VOID without a final-result artifact", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-value-settlement-void-"));
  const dayKey = "2099-08-08";
  const valuePath = path.join(root, "value.json");
  const finalResultsDir = path.join(root, "final-results");
  const canonicalFixturesDir = path.join(root, "canonical-fixtures");

  fs.mkdirSync(finalResultsDir, { recursive: true });
  fs.mkdirSync(canonicalFixturesDir, { recursive: true });
  fs.writeFileSync(valuePath, JSON.stringify({
    date: dayKey,
    count: 1,
    picks: [{
      matchId: "cid_test_postponed",
      leagueSlug: "test.1",
      homeTeam: "Alpha",
      awayTeam: "Beta",
      market: "OU25",
      pick: "OVER"
    }]
  }));
  fs.writeFileSync(path.join(canonicalFixturesDir, "test.1.json"), JSON.stringify({
    fixtures: [{
      canonicalId: "cid_test_postponed",
      matchId: "cid_test_postponed",
      leagueSlug: "test.1",
      homeTeam: "Alpha",
      awayTeam: "Beta",
      status: "SPECIAL",
      rawStatus: "STATUS_POSTPONED",
      scoreHome: null,
      scoreAway: null
    }]
  }));

  try {
    const report = buildSettlementReport(dayKey, {
      valuePath,
      planKey: "A",
      finalResultsDir,
      canonicalFixturesDir
    });

    assert.equal(report.ok, true);
    assert.equal(report.summary.valuePicks, 1);
    assert.equal(report.summary.voidRows, 1);
    assert.equal(report.summary.unresolvedRows, 0);
    assert.equal(report.rows[0].result, "VOID");
    assert.equal(report.rows[0].ftScore, null);
    assert.equal(report.rows[0].reason, "canonical_non_played_match_state");
    assert.equal(report.rows[0].finalResultProvenance, "canonical_non_played_match_state");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
