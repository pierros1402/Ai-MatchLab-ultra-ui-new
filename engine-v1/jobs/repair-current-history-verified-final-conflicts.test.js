import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildCurrentHistoryVerifiedFinalConflictRepairPlan,
  applyCurrentHistoryVerifiedFinalConflictRepair,
} from "./repair-current-history-verified-final-conflicts.js";

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function overlayStub() {
  return {
    overlayEvidenceMatchRow(row) {
      return {
        ok: true,
        view: { ...row },
        homeResolution: { preferredDisplayName: row.homeTeam },
        awayResolution: { preferredDisplayName: row.awayTeam },
      };
    },
  };
}

function setup({
  historyScores = [[0, 0], [1, 1]],
  finalScores = [[1, 1]],
  adjudicationScore = null,
} = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-v14-history-"));
  const historyRoot = path.join(root, "history");
  const finalRoot = path.join(root, "final-results");
  const adj = path.join(root, "final-truth-adjudications.v1.json");
  const dayKey = "2026-08-08";
  const kickoff = "2026-08-08T17:00:00.000Z";

  writeJson(path.join(historyRoot, "2025-2026.json"), { season: "2025-2026", days: [] });
  writeJson(path.join(historyRoot, "2026-2027.json"), {
    season: "2026-2027",
    days: [{
      dayKey,
      matchCount: historyScores.length,
      rows: historyScores.map(([h, a], i) => ({
        id: `hist_${i + 1}`,
        dayKey,
        leagueSlug: "can.1",
        homeTeam: "Atlético Ottawa",
        awayTeam: "HFX Wanderers",
        kickoff,
        scoreHome: h,
        scoreAway: a,
        status: "FT",
      })),
    }],
  });

  fs.mkdirSync(path.join(finalRoot, dayKey), { recursive: true });
  finalScores.forEach(([h, a], i) => writeJson(
    path.join(finalRoot, dayKey, `final_${i + 1}.json`),
    {
      verifiedFinalTruth: true,
      finalTruthVerdict: "verified_final_result",
      dayKey,
      matchId: `final_${i + 1}`,
      leagueSlug: "can.1",
      homeTeam: "Atlético Ottawa",
      awayTeam: "HFX Wanderers",
      kickoffUtc: kickoff,
      homeScore: h,
      awayScore: a,
      source: "flashscore_same_day_exact_team_match",
    },
  ));

  writeJson(adj, {
    adjudications: adjudicationScore ? [{
      state: "APPROVED_FOR_RECOVERY",
      adjudicationId: "adj_test",
      dayKey,
      matchId: "cid_can1_atlottawa_hfxwanderers_20260808",
      leagueSlug: "can.1",
      homeTeam: "Atlético Ottawa",
      awayTeam: "HFX Wanderers",
      homeScore: adjudicationScore[0],
      awayScore: adjudicationScore[1],
      evidence: [{ authority: "onesoccer" }, { authority: "provider" }],
    }] : [],
  });

  return { root, historyRoot, finalRoot, adj };
}

test("approved adjudication outranks conflicting verified-final artifacts", () => {
  const s = setup({
    historyScores: [[1, 1], [2, 1]],
    finalScores: [[1, 1]],
    adjudicationScore: [2, 1],
  });
  const plan = buildCurrentHistoryVerifiedFinalConflictRepairPlan({
    historyRoot: s.historyRoot,
    finalRoot: s.finalRoot,
    adjudicationPath: s.adj,
    overlay: overlayStub(),
  });
  assert.equal(plan.scoreConflictGroups, 1);
  assert.equal(plan.groups[0].authority, "approved_final_truth_adjudication");
  assert.equal(plan.groups[0].authoritativeScore, "2|1");
  assert.deepEqual(plan.groups[0].removeIds, ["hist_1"]);
});

test("verified-final truth repairs stale history when no adjudication exists", () => {
  const s = setup({
    historyScores: [[0, 0], [1, 1]],
    finalScores: [[1, 1]],
  });
  const plan = buildCurrentHistoryVerifiedFinalConflictRepairPlan({
    historyRoot: s.historyRoot,
    finalRoot: s.finalRoot,
    adjudicationPath: s.adj,
    overlay: overlayStub(),
  });
  assert.equal(plan.groups[0].authority, "unanimous_verified_final_truth");
  assert.equal(plan.groups[0].authoritativeScore, "1|1");
  assert.deepEqual(plan.groups[0].removeIds, ["hist_1"]);
});

test("conflicting verified-final authorities fail closed", () => {
  const s = setup({
    historyScores: [[0, 0], [1, 1]],
    finalScores: [[1, 1], [2, 1]],
  });
  assert.throws(
    () => buildCurrentHistoryVerifiedFinalConflictRepairPlan({
      historyRoot: s.historyRoot,
      finalRoot: s.finalRoot,
      adjudicationPath: s.adj,
      overlay: overlayStub(),
    }),
    /current_history_verified_final_authority_conflicted/u,
  );
});

test("write removes only contradicted rows and leaves score truth untouched", () => {
  const s = setup({
    historyScores: [[0, 0], [1, 1]],
    finalScores: [[1, 1]],
  });
  const plan = buildCurrentHistoryVerifiedFinalConflictRepairPlan({
    historyRoot: s.historyRoot,
    finalRoot: s.finalRoot,
    adjudicationPath: s.adj,
    overlay: overlayStub(),
  });
  const backupDir = path.join(s.root, "backup");
  const result = applyCurrentHistoryVerifiedFinalConflictRepair({
    plan,
    backupDir,
    overlay: overlayStub(),
  });
  assert.equal(result.ok, true);
  assert.equal(result.removed, 1);
  const after = JSON.parse(fs.readFileSync(path.join(s.historyRoot, "2026-2027.json"), "utf8"));
  assert.equal(after.days[0].matchCount, 1);
  assert.equal(after.days[0].rows[0].id, "hist_2");
  assert.equal(after.days[0].rows[0].scoreHome, 1);
  assert.equal(after.days[0].rows[0].scoreAway, 1);
});
