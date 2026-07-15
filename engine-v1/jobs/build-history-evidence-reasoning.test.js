import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {
  assertSafeOutputPath,
  parseArgs,
  runHistoryEvidenceReasoningBuild
} from "./build-history-evidence-reasoning.js";

function digest(filePath) {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

test("CLI parser accepts hashes and summary-only mode", () => {
  const parsed = parseArgs([
    "--history=/tmp/history.json",
    "--plan=/tmp/plan.json",
    "--output=/tmp/reasoning.json",
    "--expected-history-sha256=ABC",
    "--expected-plan-sha256=DEF",
    "--summary-only",
    "--max-examples=9"
  ]);
  assert.equal(parsed.historyPath, path.resolve("/tmp/history.json"));
  assert.equal(parsed.planPath, path.resolve("/tmp/plan.json"));
  assert.equal(parsed.outputPath, path.resolve("/tmp/reasoning.json"));
  assert.equal(parsed.expectedHistorySha256, "abc");
  assert.equal(parsed.expectedPlanSha256, "def");
  assert.equal(parsed.summaryOnly, true);
  assert.equal(parsed.maxExamples, 9);
});

test("output guard rejects truth-layer paths", () => {
  assert.throws(
    () => assertSafeOutputPath(path.join(process.cwd(), "data/history/x.json")),
    /unsafe_truth_layer_output_path/
  );
  assert.throws(
    () => assertSafeOutputPath(path.join(process.cwd(), "data/h2h/x.json")),
    /unsafe_truth_layer_output_path/
  );
});

test("reasoning builder writes additive artifact and preserves source bytes", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-reasoning-"));
  const historyPath = path.join(dir, "history.json");
  const planPath = path.join(dir, "plan.json");
  const reliabilityPath = path.join(dir, "reliability.json");
  const outputPath = path.join(dir, "reasoning.json");

  writeJson(historyPath, {
    season: "2025-2026",
    days: [{
      dayKey: "2026-07-12",
      rows: [{
        id: "espn_1",
        dayKey: "2026-07-12",
        kickoff: "2026-07-12T18:00Z",
        leagueSlug: "arg.2",
        homeTeam: "Gimnasia Jujuy",
        awayTeam: "Chacarita Juniors",
        scoreHome: 1,
        scoreAway: 1,
        status: "STATUS_FULL_TIME",
        source: "espn"
      }]
    }]
  });
  writeJson(planPath, {
    actions: { currentHistoryDedup: [], currentHistoryDayNormalization: [] },
    blocked: { scoreConflicts: [], orientationConflicts: [], h2hDegradedKeys: [] }
  });
  writeJson(reliabilityPath, { espn: { total: 100, agreements: 98 } });

  const historyHash = digest(historyPath);
  const planHash = digest(planPath);
  const report = runHistoryEvidenceReasoningBuild({
    historyPath,
    planPath,
    sourceReliabilityPath: reliabilityPath,
    outputPath,
    expectedHistorySha256: historyHash,
    expectedPlanSha256: planHash,
    summaryOnly: true
  });

  assert.equal(report.ok, true);
  assert.equal(report.output.summaryOnly, true);
  assert.equal("facts" in report, false);
  assert.equal(report.summary.factsAnalyzed, 1);
  assert.equal(report.summary.claimsScored, 1);
  assert.equal(report.guarantees.truthWrites, 0);
  assert.equal(digest(historyPath), historyHash);
  assert.equal(digest(planPath), planHash);
  assert.equal(fs.existsSync(outputPath), true);
});

test("hash mismatch fails before output generation", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aiml-reasoning-hash-"));
  const historyPath = path.join(dir, "history.json");
  const planPath = path.join(dir, "plan.json");
  const outputPath = path.join(dir, "reasoning.json");
  writeJson(historyPath, { season: "x", days: [] });
  writeJson(planPath, {
    actions: { currentHistoryDedup: [], currentHistoryDayNormalization: [] },
    blocked: { scoreConflicts: [], orientationConflicts: [], h2hDegradedKeys: [] }
  });

  assert.throws(() => runHistoryEvidenceReasoningBuild({
    historyPath,
    planPath,
    outputPath,
    expectedHistorySha256: "0".repeat(64),
    summaryOnly: true
  }), /history_sha256_mismatch/);
  assert.equal(fs.existsSync(outputPath), false);
});
